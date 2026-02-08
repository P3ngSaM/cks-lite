use tauri::Manager;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tokio::time::{sleep, Duration};

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

fn resolve_powershell_path() -> String {
    if let Ok(system_root) = std::env::var("SystemRoot").or_else(|_| std::env::var("WINDIR")) {
        let candidate = PathBuf::from(system_root)
            .join("System32")
            .join("WindowsPowerShell")
            .join("v1.0")
            .join("powershell.exe");
        if candidate.exists() {
            return candidate.to_string_lossy().to_string();
        }
    }
    "powershell.exe".to_string()
}

fn is_path_within_any_base(script_path: &Path, bases: &[PathBuf]) -> bool {
    bases.iter().any(|base| is_path_within_base(script_path, base))
}

fn allowed_script_bases(work_dir: &Path) -> Vec<PathBuf> {
    let mut bases = vec![work_dir.to_path_buf()];

    if let Ok(profile) = std::env::var("USERPROFILE") {
        let profile_path = PathBuf::from(profile);
        bases.push(profile_path.clone());
        bases.push(profile_path.join("Downloads"));
        bases.push(profile_path.join("Desktop"));
    }

    // Keep this aligned with the agent prompt guidance:
    // scripts may be written to C:\Users\Public or %TEMP%.
    if let Ok(temp) = std::env::var("TEMP") {
        bases.push(PathBuf::from(temp));
    }
    if cfg!(target_os = "windows") {
        bases.push(PathBuf::from(r"C:\Users\Public"));
    }

    bases
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
        let bases = allowed_script_bases(work_dir);
        if !is_path_within_any_base(&script_path, &bases) {
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

#[derive(Serialize, Deserialize)]
struct AgentStartupDiagnostics {
    already_running: bool,
    sdk_dir: Option<String>,
    python_launcher: Option<String>,
    can_start: bool,
    reason: String,
    hints: Vec<String>,
}

#[derive(Serialize, Deserialize)]
struct PlatformInfo {
    os: String,
    arch: String,
}

#[derive(Serialize, Deserialize)]
struct ScreenCaptureResult {
    path: String,
}

fn escape_applescript_string(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn escape_ps_single_quoted(value: &str) -> String {
    value.replace('\'', "''")
}

fn escape_sh_single_quoted(value: &str) -> String {
    value.replace('\'', "'\"'\"'")
}

fn to_windows_sendkeys(keys: &[String]) -> String {
    let mut modifiers = String::new();
    let mut main_key = String::new();

    for key in keys {
        let lower = key.trim().to_ascii_lowercase();
        match lower.as_str() {
            "ctrl" | "control" | "cmd" | "command" => modifiers.push('^'),
            "alt" | "option" => modifiers.push('%'),
            "shift" => modifiers.push('+'),
            _ => {
                main_key = lower;
            }
        }
    }

    if main_key.is_empty() {
        return modifiers;
    }

    let key_part = match main_key.as_str() {
        "enter" => "{ENTER}".to_string(),
        "tab" => "{TAB}".to_string(),
        "esc" | "escape" => "{ESC}".to_string(),
        "space" => " ".to_string(),
        "left" => "{LEFT}".to_string(),
        "right" => "{RIGHT}".to_string(),
        "up" => "{UP}".to_string(),
        "down" => "{DOWN}".to_string(),
        _ => main_key.chars().next().map(|c| c.to_string()).unwrap_or_default(),
    };

    format!("{}{}", modifiers, key_part)
}

fn build_capture_path(save_to: Option<String>) -> PathBuf {
    let target = save_to.unwrap_or_default().trim().to_string();
    if !target.is_empty() {
        return PathBuf::from(target);
    }
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    std::env::temp_dir().join(format!("cks_capture_{}.png", ts))
}

#[cfg(target_os = "windows")]
fn push_candidate(candidates: &mut Vec<String>, value: String) {
    let normalized = value.trim().trim_matches('"').to_string();
    if normalized.is_empty() {
        return;
    }
    if !candidates.iter().any(|item| item.eq_ignore_ascii_case(&normalized)) {
        candidates.push(normalized);
    }
}

#[cfg(target_os = "windows")]
fn resolve_windows_open_candidates(app: &str) -> Vec<String> {
    let trimmed = app.trim().trim_matches('"');
    let normalized = trimmed.to_ascii_lowercase();
    let mut candidates: Vec<String> = Vec::new();
    push_candidate(&mut candidates, trimmed.to_string());

    // Common aliases from the model/user prompt.
    if normalized.contains("feishu")
        || normalized.contains("飞书")
        || normalized.contains("lark")
        || normalized.contains("wecom")
        || normalized.contains("wxwork")
        || normalized.contains("企业微信")
        || normalized.contains("dingtalk")
        || normalized.contains("钉钉")
    {
        let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_default();
        let app_data_local = std::env::var("APPDATA")
            .ok()
            .and_then(|p| PathBuf::from(p).parent().map(|x| x.to_string_lossy().to_string()))
            .unwrap_or_default();
        let program_files = std::env::var("ProgramFiles").unwrap_or_default();
        let program_files_x86 = std::env::var("ProgramFiles(x86)").unwrap_or_default();

        let likely_paths = vec![
            PathBuf::from(&local_app_data).join("Feishu\\Current\\Feishu.exe"),
            PathBuf::from(&local_app_data).join("Feishu\\Current\\feishu.exe"),
            PathBuf::from(&local_app_data).join("Programs\\Feishu\\Feishu.exe"),
            PathBuf::from(&local_app_data).join("Programs\\Lark\\Lark.exe"),
            PathBuf::from(&local_app_data).join("Lark\\Current\\Lark.exe"),
            PathBuf::from(&local_app_data).join("Tencent\\WeCom\\WXWork.exe"),
            PathBuf::from(&local_app_data).join("Programs\\WXWork\\WXWork.exe"),
            PathBuf::from(&local_app_data).join("Programs\\DingTalk\\DingTalk.exe"),
            PathBuf::from(&local_app_data).join("DingTalk\\main\\current_new\\DingTalk.exe"),
            PathBuf::from(&app_data_local).join("Feishu\\Current\\Feishu.exe"),
            PathBuf::from(&app_data_local).join("Feishu\\Current\\feishu.exe"),
            PathBuf::from(&program_files).join("Feishu\\Feishu.exe"),
            PathBuf::from(&program_files_x86).join("Feishu\\Feishu.exe"),
            PathBuf::from(&program_files).join("WXWork\\WXWork.exe"),
            PathBuf::from(&program_files_x86).join("WXWork\\WXWork.exe"),
            PathBuf::from(&program_files).join("DingTalk\\DingTalk.exe"),
            PathBuf::from(&program_files_x86).join("DingTalk\\DingTalk.exe"),
        ];

        for path in likely_paths {
            if !path.as_os_str().is_empty() {
                push_candidate(&mut candidates, path.to_string_lossy().to_string());
            }
        }

        // Last-resort executable names.
        push_candidate(&mut candidates, "Feishu.exe".to_string());
        push_candidate(&mut candidates, "Lark.exe".to_string());
        push_candidate(&mut candidates, "WXWork.exe".to_string());
        push_candidate(&mut candidates, "DingTalk.exe".to_string());
    }

    candidates
}

#[tauri::command]
async fn get_platform_info() -> Result<PlatformInfo, String> {
    Ok(PlatformInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
    })
}

#[tauri::command]
async fn open_application(app: String, args: Option<Vec<String>>) -> Result<bool, String> {
    let app = app.trim();
    if app.is_empty() {
        return Err("app is required".to_string());
    }
    let args = args.unwrap_or_default();

    if cfg!(target_os = "windows") {
        let mut tried: Vec<String> = Vec::new();

        #[cfg(target_os = "windows")]
        {
            for candidate in resolve_windows_open_candidates(app) {
                // For explicit file paths we check existence first, reducing noisy errors.
                if (candidate.contains('\\') || candidate.contains('/')) && !Path::new(&candidate).exists() {
                    continue;
                }
                tried.push(candidate.clone());
                let mut direct = tokio::process::Command::new(&candidate);
                for item in &args {
                    direct.arg(item);
                }
                direct.stdout(std::process::Stdio::null());
                direct.stderr(std::process::Stdio::null());
                if direct.spawn().is_ok() {
                    return Ok(true);
                }
            }
        }

        // Fallback to `start` for shell-resolved app names.
        let mut cmd = tokio::process::Command::new("cmd");
        cmd.arg("/C").arg("start").arg("").arg(format!("\"{}\"", app));
        for item in &args {
            cmd.arg(item);
        }
        cmd.stdout(std::process::Stdio::null());
        cmd.stderr(std::process::Stdio::piped());
        let output = cmd
            .output()
            .await
            .map_err(|e| format!("Failed to open app '{}': {}", app, e))?;
        if output.status.success() {
            return Ok(true);
        }

        // Fallback #2: use Windows Start menu index (`Get-StartApps`) to locate and launch.
        #[cfg(target_os = "windows")]
        {
            let app_query = escape_ps_single_quoted(app);
            let mut search_terms: Vec<&str> = vec![app];
            let lower = app.to_ascii_lowercase();
            if lower.contains("feishu") || lower.contains("lark") || app.contains("飞书") {
                search_terms.push("飞书");
                search_terms.push("Feishu");
                search_terms.push("Lark");
            }
            let search_term_literals = search_terms
                .iter()
                .map(|v| format!("'{}'", escape_ps_single_quoted(v)))
                .collect::<Vec<String>>()
                .join(",");

            let script = format!(
                "$query='{app_query}'; \
                 $terms=@({search_term_literals}) | Where-Object {{ $_ -and $_.Trim() -ne '' }} | Select-Object -Unique; \
                 if ($terms.Count -eq 0) {{ $terms=@($query) }}; \
                 $target=$null; \
                 foreach($t in $terms) {{ \
                   $target = Get-StartApps | Where-Object {{ $_.Name -like ('*' + $t + '*') -or $_.AppID -like ('*' + $t + '*') }} | Select-Object -First 1; \
                   if ($target) {{ break }} \
                 }}; \
                 if ($target) {{ Start-Process explorer.exe ('shell:AppsFolder\\' + $target.AppID); exit 0 }}; \
                 exit 1"
            );

            let startapps = tokio::process::Command::new("powershell")
                .arg("-NoProfile")
                .arg("-ExecutionPolicy")
                .arg("Bypass")
                .arg("-Command")
                .arg(script)
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::piped())
                .output()
                .await;

            if let Ok(startapps_output) = startapps {
                if startapps_output.status.success() {
                    return Ok(true);
                }
                tried.push("Get-StartApps lookup".to_string());
            }
        }

        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let tried_text = if tried.is_empty() {
            "（无可用候选路径）".to_string()
        } else {
            format!("（尝试候选：{}）", tried.join(" | "))
        };
        return Err(format!("Open app failed: {} {}", stderr, tried_text));
    }

    let mut cmd = if cfg!(target_os = "macos") {
        let mut c = tokio::process::Command::new("open");
        c.arg("-a").arg(app);
        if !args.is_empty() {
            c.arg("--args");
            for item in &args {
                c.arg(item);
            }
        }
        c
    } else {
        let mut c = tokio::process::Command::new("xdg-open");
        c.arg(app);
        c
    };

    cmd.stdout(std::process::Stdio::null());
    cmd.stderr(std::process::Stdio::piped());
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to open app '{}': {}", app, e))?;
    if output.status.success() {
        Ok(true)
    } else {
        Err(format!(
            "Open app failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ))
    }
}

#[tauri::command]
async fn type_text(text: String, target_app: Option<String>) -> Result<bool, String> {
    if text.is_empty() {
        return Err("text is required".to_string());
    }
    if cfg!(target_os = "windows") {
        let escaped_text = escape_ps_single_quoted(&text);
        let mut script = String::from("$ws=New-Object -ComObject WScript.Shell;");
        if let Some(target) = target_app.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
            script.push_str(&format!(
                "$null=$ws.AppActivate('{}'); Start-Sleep -Milliseconds 150;",
                escape_ps_single_quoted(target)
            ));
        }
        script.push_str(&format!("$ws.SendKeys('{}');", escaped_text));
        let output = tokio::process::Command::new("powershell")
            .arg("-NoProfile")
            .arg("-Command")
            .arg(script)
            .output()
            .await
            .map_err(|e| format!("Failed to execute windows text automation: {}", e))?;
        if output.status.success() {
            return Ok(true);
        }
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    if cfg!(target_os = "macos") {
        let mut script = String::new();
        if let Some(target) = target_app.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
            script.push_str(&format!("tell application \"{}\" to activate\n", escape_applescript_string(target)));
        }
        script.push_str(&format!(
            "tell application \"System Events\" to keystroke \"{}\"",
            escape_applescript_string(&text)
        ));
        let output = tokio::process::Command::new("osascript")
            .arg("-e")
            .arg(script)
            .output()
            .await
            .map_err(|e| format!("Failed to execute macOS text automation: {}", e))?;
        if output.status.success() {
            return Ok(true);
        }
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let escaped = escape_sh_single_quoted(&text);
    let output = tokio::process::Command::new("sh")
        .arg("-lc")
        .arg(format!("xdotool type -- '{}'", escaped))
        .output()
        .await
        .map_err(|e| format!("Failed to execute Linux text automation (xdotool required): {}", e))?;
    if output.status.success() {
        Ok(true)
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
async fn press_hotkey(keys: Vec<String>, target_app: Option<String>) -> Result<bool, String> {
    if keys.is_empty() {
        return Err("keys is required".to_string());
    }

    if cfg!(target_os = "windows") {
        let send_keys = to_windows_sendkeys(&keys);
        if send_keys.is_empty() {
            return Err("invalid keys".to_string());
        }
        let mut script = String::from("$ws=New-Object -ComObject WScript.Shell;");
        if let Some(target) = target_app.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
            script.push_str(&format!(
                "$null=$ws.AppActivate('{}'); Start-Sleep -Milliseconds 150;",
                escape_ps_single_quoted(target)
            ));
        }
        script.push_str(&format!("$ws.SendKeys('{}');", escape_ps_single_quoted(&send_keys)));
        let output = tokio::process::Command::new("powershell")
            .arg("-NoProfile")
            .arg("-Command")
            .arg(script)
            .output()
            .await
            .map_err(|e| format!("Failed to execute windows hotkey automation: {}", e))?;
        if output.status.success() {
            return Ok(true);
        }
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    if cfg!(target_os = "macos") {
        let mut modifiers: Vec<&str> = Vec::new();
        let mut key = String::new();
        for item in &keys {
            match item.trim().to_ascii_lowercase().as_str() {
                "cmd" | "command" => modifiers.push("command down"),
                "ctrl" | "control" => modifiers.push("control down"),
                "alt" | "option" => modifiers.push("option down"),
                "shift" => modifiers.push("shift down"),
                other => key = other.to_string(),
            }
        }
        if key.is_empty() {
            return Err("hotkey main key is required".to_string());
        }

        let mut script = String::new();
        if let Some(target) = target_app.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
            script.push_str(&format!("tell application \"{}\" to activate\n", escape_applescript_string(target)));
        }
        if modifiers.is_empty() {
            script.push_str(&format!(
                "tell application \"System Events\" to keystroke \"{}\"",
                escape_applescript_string(&key)
            ));
        } else {
            script.push_str(&format!(
                "tell application \"System Events\" to keystroke \"{}\" using {{{}}}",
                escape_applescript_string(&key),
                modifiers.join(", ")
            ));
        }
        let output = tokio::process::Command::new("osascript")
            .arg("-e")
            .arg(script)
            .output()
            .await
            .map_err(|e| format!("Failed to execute macOS hotkey automation: {}", e))?;
        if output.status.success() {
            return Ok(true);
        }
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let combo = keys
        .iter()
        .map(|s| s.trim().to_ascii_lowercase())
        .collect::<Vec<_>>()
        .join("+");
    let output = tokio::process::Command::new("sh")
        .arg("-lc")
        .arg(format!("xdotool key {}", combo))
        .output()
        .await
        .map_err(|e| format!("Failed to execute Linux hotkey automation (xdotool required): {}", e))?;
    if output.status.success() {
        Ok(true)
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
async fn send_feishu_message(recipient: String, content: String) -> Result<bool, String> {
    let recipient = recipient.trim().to_string();
    let content = content.trim().to_string();
    if recipient.is_empty() {
        return Err("recipient is required".to_string());
    }
    if content.is_empty() {
        return Err("content is required".to_string());
    }

    let feishu_app = if cfg!(target_os = "macos") { "Feishu" } else { "feishu" };
    open_application(feishu_app.to_string(), None).await?;
    sleep(Duration::from_millis(1800)).await;

    if cfg!(target_os = "macos") {
        press_hotkey(vec!["cmd".to_string(), "k".to_string()], Some("飞书".to_string())).await?;
    } else {
        press_hotkey(vec!["ctrl".to_string(), "k".to_string()], Some("飞书".to_string())).await?;
    }
    sleep(Duration::from_millis(450)).await;

    type_text(recipient, Some("飞书".to_string())).await?;
    sleep(Duration::from_millis(550)).await;

    // Prefer selecting the first matched contact from quick switch list.
    press_hotkey(vec!["down".to_string()], Some("飞书".to_string())).await?;
    sleep(Duration::from_millis(180)).await;
    press_hotkey(vec!["enter".to_string()], Some("飞书".to_string())).await?;
    sleep(Duration::from_millis(700)).await;
    press_hotkey(vec!["esc".to_string()], Some("飞书".to_string())).await?;
    sleep(Duration::from_millis(160)).await;

    type_text(content, Some("飞书".to_string())).await?;
    sleep(Duration::from_millis(220)).await;

    // Feishu usually supports Enter to send; if user has custom setting, Ctrl/Cmd+Enter acts as fallback.
    press_hotkey(vec!["enter".to_string()], Some("飞书".to_string())).await?;
    sleep(Duration::from_millis(160)).await;
    if cfg!(target_os = "macos") {
        press_hotkey(vec!["cmd".to_string(), "enter".to_string()], Some("飞书".to_string())).await?;
    } else {
        press_hotkey(vec!["ctrl".to_string(), "enter".to_string()], Some("飞书".to_string())).await?;
    }

    Ok(true)
}

fn normalize_message_channel(channel: &str) -> String {
    let raw = channel.trim().to_ascii_lowercase();
    if raw.contains("wecom") || raw.contains("wxwork") || raw.contains("企业微信") {
        return "wecom".to_string();
    }
    if raw.contains("dingtalk") || raw.contains("钉钉") {
        return "dingtalk".to_string();
    }
    if raw.contains("feishu") || raw.contains("lark") || raw.contains("飞书") {
        return "feishu".to_string();
    }
    "feishu".to_string()
}

fn channel_app_names(channel: &str) -> (&'static str, &'static str) {
    match channel {
        "wecom" => ("wecom", "企业微信"),
        "dingtalk" => ("dingtalk", "钉钉"),
        _ => ("feishu", "飞书"),
    }
}

#[tauri::command]
async fn send_desktop_message(channel: String, recipient: String, content: String) -> Result<bool, String> {
    let normalized = normalize_message_channel(&channel);
    if normalized == "feishu" {
        return send_feishu_message(recipient, content).await;
    }

    let recipient = recipient.trim().to_string();
    let content = content.trim().to_string();
    if recipient.is_empty() {
        return Err("recipient is required".to_string());
    }
    if content.is_empty() {
        return Err("content is required".to_string());
    }

    let (app_name, app_activate) = channel_app_names(&normalized);
    let app_to_open = if cfg!(target_os = "macos") {
        if normalized == "wecom" { "WeCom" } else { "DingTalk" }
    } else {
        app_name
    };

    open_application(app_to_open.to_string(), None).await?;
    sleep(Duration::from_millis(1800)).await;

    // Quick search differs across IM apps; send both shortcuts for better compatibility.
    if cfg!(target_os = "macos") {
        press_hotkey(vec!["cmd".to_string(), "k".to_string()], Some(app_activate.to_string())).await?;
        sleep(Duration::from_millis(160)).await;
        press_hotkey(vec!["cmd".to_string(), "f".to_string()], Some(app_activate.to_string())).await?;
    } else {
        press_hotkey(vec!["ctrl".to_string(), "k".to_string()], Some(app_activate.to_string())).await?;
        sleep(Duration::from_millis(160)).await;
        press_hotkey(vec!["ctrl".to_string(), "f".to_string()], Some(app_activate.to_string())).await?;
    }
    sleep(Duration::from_millis(420)).await;

    type_text(recipient, Some(app_activate.to_string())).await?;
    sleep(Duration::from_millis(520)).await;
    press_hotkey(vec!["down".to_string()], Some(app_activate.to_string())).await?;
    sleep(Duration::from_millis(160)).await;
    press_hotkey(vec!["enter".to_string()], Some(app_activate.to_string())).await?;
    sleep(Duration::from_millis(680)).await;
    press_hotkey(vec!["esc".to_string()], Some(app_activate.to_string())).await?;
    sleep(Duration::from_millis(140)).await;

    type_text(content, Some(app_activate.to_string())).await?;
    sleep(Duration::from_millis(220)).await;
    press_hotkey(vec!["enter".to_string()], Some(app_activate.to_string())).await?;
    sleep(Duration::from_millis(150)).await;
    if cfg!(target_os = "macos") {
        press_hotkey(vec!["cmd".to_string(), "enter".to_string()], Some(app_activate.to_string())).await?;
    } else {
        press_hotkey(vec!["ctrl".to_string(), "enter".to_string()], Some(app_activate.to_string())).await?;
    }
    Ok(true)
}

#[tauri::command]
async fn capture_screen(save_to: Option<String>) -> Result<ScreenCaptureResult, String> {
    let path = build_capture_path(save_to);
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create screenshot directory: {}", e))?;
    }
    let path_str = path.to_string_lossy().to_string();

    if cfg!(target_os = "windows") {
        let escaped = escape_ps_single_quoted(&path_str);
        let script = format!(
            "$ErrorActionPreference='Stop';\
Add-Type -AssemblyName System.Windows.Forms;\
Add-Type -AssemblyName System.Drawing;\
$b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds;\
$bmp=New-Object System.Drawing.Bitmap($b.Width,$b.Height);\
$g=[System.Drawing.Graphics]::FromImage($bmp);\
$g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size);\
$bmp.Save('{}',[System.Drawing.Imaging.ImageFormat]::Png);\
$g.Dispose();$bmp.Dispose();",
            escaped
        );
        let output = tokio::process::Command::new(resolve_powershell_path())
            .arg("-NoProfile")
            .arg("-NonInteractive")
            .arg("-Command")
            .arg(script)
            .output()
            .await
            .map_err(|e| format!("Failed to capture screen on Windows: {}", e))?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }
        return Ok(ScreenCaptureResult { path: path_str });
    }

    if cfg!(target_os = "macos") {
        let output = tokio::process::Command::new("screencapture")
            .arg("-x")
            .arg(&path_str)
            .output()
            .await
            .map_err(|e| format!("Failed to capture screen on macOS: {}", e))?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }
        return Ok(ScreenCaptureResult { path: path_str });
    }

    let cmd = format!(
        "if command -v import >/dev/null 2>&1; then import -window root '{}'; elif command -v scrot >/dev/null 2>&1; then scrot '{}'; else exit 127; fi",
        escape_sh_single_quoted(&path_str),
        escape_sh_single_quoted(&path_str)
    );
    let output = tokio::process::Command::new("sh")
        .arg("-lc")
        .arg(cmd)
        .output()
        .await
        .map_err(|e| format!("Failed to capture screen on Linux: {}", e))?;
    if !output.status.success() {
        return Err("Failed to capture screen on Linux (install ImageMagick 'import' or scrot).".to_string());
    }
    Ok(ScreenCaptureResult { path: path_str })
}

#[tauri::command]
async fn mouse_click(x: i32, y: i32, button: Option<String>) -> Result<bool, String> {
    let button = button.unwrap_or_else(|| "left".to_string()).trim().to_ascii_lowercase();
    if cfg!(target_os = "windows") {
        let (down, up) = match button.as_str() {
            "left" => (0x0002, 0x0004),
            "right" => (0x0008, 0x0010),
            "middle" => (0x0020, 0x0040),
            _ => return Err(format!("Unsupported button: {}", button)),
        };
        let script = format!(
            "$ErrorActionPreference='Stop';\
Add-Type @\"\
using System;\
using System.Runtime.InteropServices;\
public static class Native {{\
  [DllImport(\"user32.dll\")] public static extern bool SetCursorPos(int X, int Y);\
  [DllImport(\"user32.dll\")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);\
}}\
\"@;\
[Native]::SetCursorPos({}, {}); Start-Sleep -Milliseconds 40;\
[Native]::mouse_event({},0,0,0,[UIntPtr]::Zero);\
[Native]::mouse_event({},0,0,0,[UIntPtr]::Zero);",
            x, y, down, up
        );
        let output = tokio::process::Command::new(resolve_powershell_path())
            .arg("-NoProfile")
            .arg("-NonInteractive")
            .arg("-Command")
            .arg(script)
            .output()
            .await
            .map_err(|e| format!("Failed to click mouse on Windows: {}", e))?;
        if output.status.success() {
            return Ok(true);
        }
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    if cfg!(target_os = "macos") {
        let click_flag = match button.as_str() {
            "left" => "c",
            "right" => "rc",
            "middle" => "mc",
            _ => return Err(format!("Unsupported button: {}", button)),
        };
        let cmd = format!("cliclick {}:{},{}", click_flag, x, y);
        let output = tokio::process::Command::new("sh")
            .arg("-lc")
            .arg(format!(
                "if command -v cliclick >/dev/null 2>&1; then {}; else exit 127; fi",
                cmd
            ))
            .output()
            .await
            .map_err(|e| format!("Failed to click mouse on macOS: {}", e))?;
        if output.status.success() {
            return Ok(true);
        }
        return Err("Failed to click mouse on macOS (install cliclick first).".to_string());
    }

    let button_num = match button.as_str() {
        "left" => 1,
        "middle" => 2,
        "right" => 3,
        _ => return Err(format!("Unsupported button: {}", button)),
    };
    let cmd = format!("xdotool mousemove {} {} click {}", x, y, button_num);
    let output = tokio::process::Command::new("sh")
        .arg("-lc")
        .arg(cmd)
        .output()
        .await
        .map_err(|e| format!("Failed to click mouse on Linux: {}", e))?;
    if output.status.success() {
        Ok(true)
    } else {
        Err("Failed to click mouse on Linux (install xdotool first).".to_string())
    }
}

#[tauri::command]
async fn mouse_move(x: i32, y: i32) -> Result<bool, String> {
    if cfg!(target_os = "windows") {
        let script = format!(
            "$ErrorActionPreference='Stop'; Add-Type @\"\
using System;\
using System.Runtime.InteropServices;\
public static class Native {{ [DllImport(\"user32.dll\")] public static extern bool SetCursorPos(int X, int Y); }}\
\"@; [Native]::SetCursorPos({}, {}) | Out-Null;",
            x, y
        );
        let output = tokio::process::Command::new(resolve_powershell_path())
            .arg("-NoProfile")
            .arg("-NonInteractive")
            .arg("-Command")
            .arg(script)
            .output()
            .await
            .map_err(|e| format!("Failed to move mouse on Windows: {}", e))?;
        if output.status.success() {
            return Ok(true);
        }
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    if cfg!(target_os = "macos") {
        let cmd = format!("cliclick m:{},{}", x, y);
        let output = tokio::process::Command::new("sh")
            .arg("-lc")
            .arg(format!(
                "if command -v cliclick >/dev/null 2>&1; then {}; else exit 127; fi",
                cmd
            ))
            .output()
            .await
            .map_err(|e| format!("Failed to move mouse on macOS: {}", e))?;
        if output.status.success() {
            return Ok(true);
        }
        return Err("Failed to move mouse on macOS (install cliclick first).".to_string());
    }

    let cmd = format!("xdotool mousemove {} {}", x, y);
    let output = tokio::process::Command::new("sh")
        .arg("-lc")
        .arg(cmd)
        .output()
        .await
        .map_err(|e| format!("Failed to move mouse on Linux: {}", e))?;
    if output.status.success() {
        Ok(true)
    } else {
        Err("Failed to move mouse on Linux (install xdotool first).".to_string())
    }
}

#[tauri::command]
async fn mouse_scroll(amount: i32) -> Result<bool, String> {
    if amount == 0 {
        return Ok(true);
    }

    if cfg!(target_os = "windows") {
        let script = format!(
            "$ErrorActionPreference='Stop'; Add-Type @\"\
using System;\
using System.Runtime.InteropServices;\
public static class Native {{ [DllImport(\"user32.dll\")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, int dwData, UIntPtr dwExtraInfo); }}\
\"@; [Native]::mouse_event(0x0800,0,0,{},[UIntPtr]::Zero);",
            amount * 120
        );
        let output = tokio::process::Command::new(resolve_powershell_path())
            .arg("-NoProfile")
            .arg("-NonInteractive")
            .arg("-Command")
            .arg(script)
            .output()
            .await
            .map_err(|e| format!("Failed to scroll mouse on Windows: {}", e))?;
        if output.status.success() {
            return Ok(true);
        }
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    if cfg!(target_os = "macos") {
        let cmd = format!("cliclick w:{}", amount);
        let output = tokio::process::Command::new("sh")
            .arg("-lc")
            .arg(format!(
                "if command -v cliclick >/dev/null 2>&1; then {}; else exit 127; fi",
                cmd
            ))
            .output()
            .await
            .map_err(|e| format!("Failed to scroll mouse on macOS: {}", e))?;
        if output.status.success() {
            return Ok(true);
        }
        return Err("Failed to scroll mouse on macOS (install cliclick first).".to_string());
    }

    let button = if amount > 0 { 4 } else { 5 };
    let repeat = amount.unsigned_abs();
    let cmd = format!("xdotool click --repeat {} {}", repeat, button);
    let output = tokio::process::Command::new("sh")
        .arg("-lc")
        .arg(cmd)
        .output()
        .await
        .map_err(|e| format!("Failed to scroll mouse on Linux: {}", e))?;
    if output.status.success() {
        Ok(true)
    } else {
        Err("Failed to scroll mouse on Linux (install xdotool first).".to_string())
    }
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

fn candidate_agent_sdk_dirs(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(from_env) = std::env::var("CKS_AGENT_SDK_DIR") {
        candidates.push(PathBuf::from(from_env));
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("agent-sdk"));
    }

    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("agent-sdk"));
        candidates.push(cwd.join("..").join("agent-sdk"));
        candidates.push(cwd.join("..").join("..").join("agent-sdk"));
    }

    candidates
}

fn detect_python_launcher() -> Option<String> {
    for launcher in ["python", "py"] {
        let ok = std::process::Command::new(launcher)
            .arg("--version")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        if ok {
            return Some(launcher.to_string());
        }
    }
    None
}

async fn wait_for_agent_ready(timeout_secs: u64) -> bool {
    let client = reqwest::Client::new();
    let start = Instant::now();
    while start.elapsed().as_secs() < timeout_secs {
        if let Ok(resp) = client
            .get(format!("{}/health", AGENT_SDK_URL))
            .timeout(std::time::Duration::from_secs(2))
            .send()
            .await
        {
            if resp.status().is_success() {
                return true;
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }
    false
}

#[tauri::command]
async fn get_agent_startup_diagnostics(app: tauri::AppHandle) -> Result<AgentStartupDiagnostics, String> {
    let already_running = wait_for_agent_ready(1).await;

    let sdk_dir = candidate_agent_sdk_dirs(&app)
        .into_iter()
        .find(|p| p.join("main.py").exists());
    let python_launcher = detect_python_launcher();

    let mut hints = Vec::new();
    if sdk_dir.is_none() {
        hints.push("未找到 agent-sdk/main.py；请确认打包资源中包含 agent-sdk。".to_string());
        hints.push("开发环境可设置环境变量 CKS_AGENT_SDK_DIR 指向 agent-sdk 目录。".to_string());
    }
    if python_launcher.is_none() {
        hints.push("未检测到 python/py 可执行程序；请安装 Python 3.10+ 并加入 PATH。".to_string());
    }

    let can_start = already_running || (sdk_dir.is_some() && python_launcher.is_some());
    let reason = if already_running {
        "Agent SDK already running".to_string()
    } else if can_start {
        "Agent SDK can be started".to_string()
    } else {
        "Agent SDK startup prerequisites not met".to_string()
    };

    Ok(AgentStartupDiagnostics {
        already_running,
        sdk_dir: sdk_dir.map(|p| p.to_string_lossy().to_string()),
        python_launcher,
        can_start,
        reason,
        hints,
    })
}

#[tauri::command]
async fn start_agent_service(app: tauri::AppHandle) -> Result<String, String> {
    if wait_for_agent_ready(1).await {
        return Ok("already_running".to_string());
    }

    if detect_python_launcher().is_none() {
        return Err("Python runtime not found (python/py). Install Python 3.10+ and add it to PATH.".to_string());
    }

    let sdk_dir = candidate_agent_sdk_dirs(&app)
        .into_iter()
        .find(|p| p.join("main.py").exists())
        .ok_or_else(|| "Agent SDK directory not found (missing main.py)".to_string())?;

    let mut last_error = String::new();
    for launcher in ["python", "py"] {
        let mut cmd = tokio::process::Command::new(launcher);
        cmd.arg("main.py");
        cmd.current_dir(&sdk_dir);
        cmd.env("HOST", "127.0.0.1");
        cmd.env("PORT", "7860");
        cmd.env("RELOAD", "0");
        cmd.stdout(std::process::Stdio::null());
        cmd.stderr(std::process::Stdio::null());

        match cmd.spawn() {
            Ok(_child) => {
                if wait_for_agent_ready(20).await {
                    return Ok("started".to_string());
                }
                last_error = format!("{} launched but health check timed out", launcher);
            }
            Err(e) => {
                last_error = format!("{} launch failed: {}", launcher, e);
            }
        }
    }

    Err(format!("Failed to start Agent SDK: {}", last_error))
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
        let mut c = tokio::process::Command::new(resolve_powershell_path());
        c.args(["-NoProfile", "-NonInteractive", "-Command", &command]);
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


/// Delete file or directory
#[tauri::command]
async fn delete_file(path: String, recursive: Option<bool>) -> Result<bool, String> {
    let file_path = std::path::Path::new(&path);
    let metadata = tokio::fs::metadata(file_path)
        .await
        .map_err(|e| format!("Failed to inspect path '{}': {}", path, e))?;

    if metadata.is_file() {
        tokio::fs::remove_file(file_path)
            .await
            .map_err(|e| format!("Failed to delete file '{}': {}", path, e))?;
        return Ok(true);
    }

    if metadata.is_dir() {
        if recursive.unwrap_or(false) {
            tokio::fs::remove_dir_all(file_path)
                .await
                .map_err(|e| format!("Failed to delete directory '{}': {}", path, e))?;
        } else {
            tokio::fs::remove_dir(file_path)
                .await
                .map_err(|e| format!("Failed to delete directory '{}': {}", path, e))?;
        }
        return Ok(true);
    }

    Err(format!("Unsupported path type: {}", path))
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
            get_agent_startup_diagnostics,
            start_agent_service,
            execute_command,
            read_file_content,
            write_file_content,
            list_directory,
            get_file_info,
            delete_file,
            get_platform_info,
            open_application,
            type_text,
            press_hotkey,
            send_feishu_message,
            send_desktop_message,
            capture_screen,
            mouse_move,
            mouse_click,
            mouse_scroll,
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let _ = start_agent_service(app_handle).await;
            });
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
        let outside = PathBuf::from(r"Z:\cks_policy_outside\outside.py");

        let _ = fs::create_dir_all(&base);
        let _ = fs::write(&inside, "print('ok')");

        assert!(is_command_safe(
            &format!("python {}", inside.to_string_lossy()),
            &base.to_string_lossy()
        ));
        assert!(!is_command_safe(
            &format!("python {}", outside.to_string_lossy()),
            &base.to_string_lossy()
        ));
    }

    #[test]
    fn windows_sendkeys_mapping_basic() {
        let keys = vec!["ctrl".to_string(), "s".to_string()];
        assert_eq!(to_windows_sendkeys(&keys), "^s");

        let keys2 = vec!["cmd".to_string(), "shift".to_string(), "v".to_string()];
        assert_eq!(to_windows_sendkeys(&keys2), "^+v");
    }

    #[test]
    fn escape_helpers_keep_string_non_empty() {
        assert_eq!(escape_ps_single_quoted("a'b"), "a''b");
        assert_eq!(escape_applescript_string("a\"b"), "a\\\"b");
        assert_eq!(escape_sh_single_quoted("a'b"), "a'\"'\"'b");
    }
}
