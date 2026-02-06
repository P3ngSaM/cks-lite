use tauri::Manager;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::Instant;

// Agent SDK base URL
const AGENT_SDK_URL: &str = "http://127.0.0.1:7860";

// Blocked dangerous commands
const BLOCKED_COMMANDS: &[&str] = &[
    "format",
    "del /s /q c:",
    "rm -rf /",
    "rmdir /s /q c:",
    "shutdown",
    "reg delete",
    "bcdedit",
    "diskpart",
];

// Allowlist-first policy for terminal execution
const ALLOWED_PREFIXES: &[&str] = &[
    "dir",
    "ls",
    "pwd",
    "echo",
    "type",
    "cat",
    "where",
    "whoami",
    "tasklist",
    "python",
    "py",
    "node",
    "npm",
    "pnpm",
    "pip",
    "uv",
    "git",
];

fn has_shell_chaining(command: &str) -> bool {
    let lower = command.to_lowercase();
    lower.contains("&&")
        || lower.contains("||")
        || lower.contains(';')
        || lower.contains('|')
        || lower.contains('>')
        || lower.contains('<')
}

fn split_command_tokens(command: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut in_single = false;
    let mut in_double = false;

    for ch in command.chars() {
        if ch == '\'' && !in_double {
            in_single = !in_single;
            continue;
        }
        if ch == '"' && !in_single {
            in_double = !in_double;
            continue;
        }

        if ch.is_whitespace() && !in_single && !in_double {
            if !current.is_empty() {
                tokens.push(current.clone());
                current.clear();
            }
            continue;
        }

        current.push(ch);
    }

    if !current.is_empty() {
        tokens.push(current);
    }

    tokens
}

fn is_whitelisted_command(command: &str) -> bool {
    let tokens = split_command_tokens(command);
    let cmd = tokens
        .get(0)
        .map(|s| s.to_ascii_lowercase())
        .unwrap_or_default();
    ALLOWED_PREFIXES.iter().any(|prefix| *prefix == cmd)
}

fn resolve_work_dir(cwd: Option<String>) -> String {
    cwd.unwrap_or_else(|| {
        std::env::var("USERPROFILE")
            .or_else(|_| std::env::var("HOME"))
            .unwrap_or_else(|_| {
                if cfg!(target_os = "windows") {
                    "C:\\".to_string()
                } else {
                    "/".to_string()
                }
            })
    })
}

fn first_script_token(cmd: &str, tokens: &[String]) -> Option<String> {
    if cmd != "python" && cmd != "py" && cmd != "node" {
        return None;
    }

    tokens
        .iter()
        .skip(1)
        .find(|t| !t.starts_with('-'))
        .map(|s| s.to_string())
}

fn is_path_within_base(script_path: &Path, base_dir: &Path) -> bool {
    let script_abs = if script_path.is_absolute() {
        script_path.to_path_buf()
    } else {
        base_dir.join(script_path)
    };

    let script_canon = script_abs.canonicalize();
    let base_canon = base_dir.canonicalize();
    if let (Ok(script_canon), Ok(base_canon)) = (script_canon, base_canon) {
        return script_canon.starts_with(base_canon);
    }
    false
}

fn has_forbidden_args(cmd: &str, tokens: &[String], work_dir: &Path) -> bool {
    // Guardrails for interpreter-style commands that could bypass policy.
    if cmd == "python" || cmd == "py" {
        if tokens
            .iter()
            .any(|t| t.eq_ignore_ascii_case("-c") || t.eq_ignore_ascii_case("-m") || t.eq_ignore_ascii_case("-i"))
        {
            return true;
        }
    }
    if cmd == "node" {
        if tokens
            .iter()
            .any(|t| {
                t.eq_ignore_ascii_case("-e")
                    || t.eq_ignore_ascii_case("--eval")
                    || t.eq_ignore_ascii_case("-p")
                    || t.eq_ignore_ascii_case("--print")
            })
        {
            return true;
        }
    }

    // Restrict interpreter script execution to the requested working directory.
    if let Some(script) = first_script_token(cmd, tokens) {
        if script == "-" {
            return true;
        }
        let script_path = PathBuf::from(script);
        if !is_path_within_base(&script_path, work_dir) {
            return true;
        }
    }

    false
}

fn is_allowed_subcommand(cmd: &str, tokens: &[String]) -> bool {
    // First token is command itself.
    let sub = tokens
        .get(1)
        .map(|s| s.to_ascii_lowercase())
        .unwrap_or_default();
    match cmd {
        // read-oriented git subset for safety
        "git" => matches!(
            sub.as_str(),
            "status" | "log" | "diff" | "show" | "branch" | "rev-parse" | "ls-files"
        ),
        // allow version/help checks by default for package tools
        "npm" | "pnpm" | "pip" | "uv" => {
            tokens.iter().any(|t| {
                t.eq_ignore_ascii_case("--version")
                    || t.eq_ignore_ascii_case("-v")
                    || t.eq_ignore_ascii_case("help")
                    || t.eq_ignore_ascii_case("--help")
            })
        }
        _ => true,
    }
}

fn command_policy_mode() -> String {
    std::env::var("CKS_TERMINAL_POLICY")
        .unwrap_or_else(|_| "whitelist".to_string())
        .to_lowercase()
}

fn is_command_safe(command: &str, work_dir: &str) -> bool {
    let lower = command.to_lowercase();
    if BLOCKED_COMMANDS.iter().any(|b| lower.contains(b)) {
        return false;
    }

    // whitelist mode is default; set CKS_TERMINAL_POLICY=legacy to disable this gate
    if command_policy_mode() != "legacy" {
        if has_shell_chaining(command) {
            return false;
        }
        if !is_whitelisted_command(command) {
            return false;
        }
        let tokens = split_command_tokens(command);
        let cmd = tokens
            .get(0)
            .map(|s| s.to_ascii_lowercase())
            .unwrap_or_default();
        let work_path = Path::new(work_dir);
        if has_forbidden_args(&cmd, &tokens, work_path) {
            return false;
        }
        return is_allowed_subcommand(&cmd, &tokens);
    }

    true
}

#[derive(Serialize, Deserialize)]
struct CommandResult {
    success: bool,
    exit_code: Option<i32>,
    stdout: String,
    stderr: String,
    command: String,
    duration_ms: u64,
}

#[derive(Serialize, Deserialize)]
struct DirEntry {
    name: String,
    path: String,
    is_dir: bool,
    is_file: bool,
    size: Option<u64>,
    modified: Option<u64>,
}

#[derive(Serialize, Deserialize)]
struct FileInfo {
    exists: bool,
    is_dir: bool,
    is_file: bool,
    size: Option<u64>,
    modified: Option<u64>,
    path: String,
}

/// Check if Agent SDK is running and healthy
#[tauri::command]
async fn check_agent_status() -> Result<bool, String> {
    let client = reqwest::Client::new();
    match client
        .get(format!("{}/health", AGENT_SDK_URL))
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
    {
        Ok(response) => Ok(response.status().is_success()),
        Err(_) => Ok(false),
    }
}

/// Get Agent SDK health info
#[tauri::command]
async fn get_agent_health() -> Result<String, String> {
    let client = reqwest::Client::new();
    let response = client
        .get(format!("{}/health", AGENT_SDK_URL))
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Agent SDK: {}", e))?;

    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    Ok(body)
}

/// Simple greeting command for testing
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to CKS Lite!", name)
}

/// Execute a terminal command
#[tauri::command]
async fn execute_command(
    command: String,
    cwd: Option<String>,
    timeout_secs: Option<u64>,
) -> Result<CommandResult, String> {
    let work_dir = resolve_work_dir(cwd);

    if !is_command_safe(&command, &work_dir) {
        let policy = command_policy_mode();
        return Ok(CommandResult {
            success: false,
            exit_code: None,
            stdout: String::new(),
            stderr: format!(
                "Command blocked by terminal policy (mode: {}). Use an allowed single command prefix or switch CKS_TERMINAL_POLICY=legacy for compatibility.",
                policy
            ),
            command,
            duration_ms: 0,
        });
    }

    let start = Instant::now();
    let timeout = std::time::Duration::from_secs(timeout_secs.unwrap_or(30));

    let mut cmd = if cfg!(target_os = "windows") {
        let mut c = tokio::process::Command::new("cmd");
        c.args(["/S", "/C", &command]);
        c
    } else {
        let mut c = tokio::process::Command::new("sh");
        c.args(["-lc", &command]);
        c
    };

    // Force UTF-8 encoding for child processes via environment variables
    // (avoids chcp prefix that breaks cmd /C quote handling)
    cmd.env("PYTHONIOENCODING", "utf-8");
    cmd.env("PYTHONUTF8", "1");
    cmd.env("LANG", "en_US.UTF-8");

    cmd.current_dir(&work_dir);

    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let child = cmd.spawn().map_err(|e| format!("Failed to spawn command: {}", e))?;

    match tokio::time::timeout(timeout, child.wait_with_output()).await {
        Ok(Ok(output)) => {
            let duration_ms = start.elapsed().as_millis() as u64;
            Ok(CommandResult {
                success: output.status.success(),
                exit_code: output.status.code(),
                stdout: String::from_utf8_lossy(&output.stdout).to_string(),
                stderr: String::from_utf8_lossy(&output.stderr).to_string(),
                command,
                duration_ms,
            })
        }
        Ok(Err(e)) => Err(format!("Command execution failed: {}", e)),
        Err(_) => Ok(CommandResult {
            success: false,
            exit_code: None,
            stdout: String::new(),
            stderr: "Command timed out".to_string(),
            command,
            duration_ms: timeout.as_millis() as u64,
        }),
    }
}

/// Read file content as string
#[tauri::command]
async fn read_file_content(path: String) -> Result<String, String> {
    tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("Failed to read file '{}': {}", path, e))
}

/// Write content to a file (creates parent directories if needed)
#[tauri::command]
async fn write_file_content(path: String, content: String) -> Result<bool, String> {
    let file_path = std::path::Path::new(&path);
    if let Some(parent) = file_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create directories: {}", e))?;
    }

    tokio::fs::write(&path, content)
        .await
        .map_err(|e| format!("Failed to write file '{}': {}", path, e))?;

    Ok(true)
}

/// List directory contents
#[tauri::command]
async fn list_directory(path: String) -> Result<Vec<DirEntry>, String> {
    let mut entries = Vec::new();
    let mut read_dir = tokio::fs::read_dir(&path)
        .await
        .map_err(|e| format!("Failed to read directory '{}': {}", path, e))?;

    while let Some(entry) = read_dir
        .next_entry()
        .await
        .map_err(|e| format!("Failed to read entry: {}", e))?
    {
        let metadata = entry.metadata().await.ok();
        let modified = metadata
            .as_ref()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs());

        entries.push(DirEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            path: entry.path().to_string_lossy().to_string(),
            is_dir: metadata.as_ref().map_or(false, |m| m.is_dir()),
            is_file: metadata.as_ref().map_or(false, |m| m.is_file()),
            size: metadata.as_ref().map(|m| m.len()),
            modified,
        });
    }

    Ok(entries)
}

/// Get file or directory info
#[tauri::command]
async fn get_file_info(path: String) -> Result<FileInfo, String> {
    match tokio::fs::metadata(&path).await {
        Ok(metadata) => {
            let modified = metadata
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs());

            Ok(FileInfo {
                exists: true,
                is_dir: metadata.is_dir(),
                is_file: metadata.is_file(),
                size: Some(metadata.len()),
                modified,
                path,
            })
        }
        Err(_) => Ok(FileInfo {
            exists: false,
            is_dir: false,
            is_file: false,
            size: None,
            modified: None,
            path,
        }),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            check_agent_status,
            get_agent_health,
            execute_command,
            read_file_content,
            write_file_content,
            list_directory,
            get_file_info,
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    #[test]
    fn policy_blocks_obviously_dangerous_command() {
        std::env::remove_var("CKS_TERMINAL_POLICY");
        assert!(!is_command_safe("rm -rf /", "."));
    }

    #[test]
    fn policy_allows_safe_git_read_commands() {
        std::env::remove_var("CKS_TERMINAL_POLICY");
        assert!(is_command_safe("git status", "."));
        assert!(is_command_safe("git log", "."));
    }

    #[test]
    fn policy_blocks_git_write_commands() {
        std::env::remove_var("CKS_TERMINAL_POLICY");
        assert!(!is_command_safe("git checkout main", "."));
        assert!(!is_command_safe("git reset --hard", "."));
    }

    #[test]
    fn policy_blocks_python_inline_execution() {
        std::env::remove_var("CKS_TERMINAL_POLICY");
        assert!(!is_command_safe("python -c \"print(1)\"", "."));
        assert!(!is_command_safe("py -m pip list", "."));
    }

    #[test]
    fn policy_allows_python_script_inside_workdir_but_blocks_outside() {
        std::env::remove_var("CKS_TERMINAL_POLICY");

        let base: PathBuf = std::env::temp_dir().join("cks_policy_test");
        let inside = base.join("inside.py");
        let outside = std::env::temp_dir().join("outside.py");

        let _ = fs::create_dir_all(&base);
        let _ = fs::write(&inside, "print('ok')");
        let _ = fs::write(&outside, "print('no')");

        assert!(is_command_safe(
            &format!("python {}", inside.to_string_lossy()),
            &base.to_string_lossy()
        ));
        assert!(!is_command_safe(
            &format!("python {}", outside.to_string_lossy()),
            &base.to_string_lossy()
        ));
    }
}
