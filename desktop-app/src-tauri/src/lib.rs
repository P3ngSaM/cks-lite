use tauri::Manager;
use serde::{Deserialize, Serialize};
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

fn is_command_safe(command: &str) -> bool {
    let lower = command.to_lowercase();
    BLOCKED_COMMANDS.iter().all(|b| !lower.contains(b))
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
    if !is_command_safe(&command) {
        return Ok(CommandResult {
            success: false,
            exit_code: None,
            stdout: String::new(),
            stderr: "Command blocked: this command is not allowed for safety reasons.".to_string(),
            command,
            duration_ms: 0,
        });
    }

    let start = Instant::now();
    let timeout = std::time::Duration::from_secs(timeout_secs.unwrap_or(30));

    let mut cmd = tokio::process::Command::new("cmd");
    // Use /S /C "..." to preserve inner quotes correctly
    cmd.args(["/S", "/C", &command]);

    // Force UTF-8 encoding for child processes via environment variables
    // (avoids chcp prefix that breaks cmd /C quote handling)
    cmd.env("PYTHONIOENCODING", "utf-8");
    cmd.env("PYTHONUTF8", "1");
    cmd.env("LANG", "en_US.UTF-8");

    // Default CWD to user home instead of Tauri app directory
    let work_dir = cwd.unwrap_or_else(|| {
        std::env::var("USERPROFILE")
            .or_else(|_| std::env::var("HOME"))
            .unwrap_or_else(|_| "C:\\".to_string())
    });
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
