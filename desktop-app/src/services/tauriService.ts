import { invoke } from '@tauri-apps/api/core'

export interface CommandResult {
  success: boolean
  exit_code: number | null
  stdout: string
  stderr: string
  command: string
  duration_ms: number
}

export interface DirEntry {
  name: string
  path: string
  is_dir: boolean
  is_file: boolean
  size: number | null
  modified: number | null
}

export interface FileInfo {
  exists: boolean
  is_dir: boolean
  is_file: boolean
  size: number | null
  modified: number | null
  path: string
}

export interface AgentStartupDiagnostics {
  already_running: boolean
  sdk_dir?: string | null
  python_launcher?: string | null
  can_start: boolean
  reason: string
  hints: string[]
}

export interface PlatformInfo {
  os: string
  arch: string
}

export interface ScreenCaptureResult {
  path: string
}

/**
 * Tauri Service - Wrapper for Tauri IPC commands
 */
export class TauriService {
  /**
   * Simple greeting command for testing
   */
  static async greet(name: string): Promise<string> {
    return await invoke<string>('greet', { name })
  }

  /**
   * Check if Agent SDK is running
   */
  static async checkAgentStatus(): Promise<boolean> {
    return await invoke<boolean>('check_agent_status')
  }

  /**
   * Get Agent SDK health information
   */
  static async getAgentHealth(): Promise<string> {
    return await invoke<string>('get_agent_health')
  }

  /**
   * Start Agent SDK service if not running
   */
  static async startAgentService(): Promise<string> {
    return await invoke<string>('start_agent_service')
  }

  /**
   * Check startup prerequisites for Agent SDK
   */
  static async getAgentStartupDiagnostics(): Promise<AgentStartupDiagnostics> {
    return await invoke<AgentStartupDiagnostics>('get_agent_startup_diagnostics')
  }

  /**
   * Execute a terminal command on the user's machine
   */
  static async executeCommand(
    command: string,
    cwd?: string,
    timeoutSecs?: number
  ): Promise<CommandResult> {
    return await invoke<CommandResult>('execute_command', {
      command,
      cwd: cwd ?? null,
      timeoutSecs: timeoutSecs ?? null,
    })
  }

  /**
   * Read a file's content as string
   */
  static async readFileContent(path: string): Promise<string> {
    return await invoke<string>('read_file_content', { path })
  }

  /**
   * Write content to a file (creates parent directories if needed)
   */
  static async writeFileContent(path: string, content: string): Promise<boolean> {
    return await invoke<boolean>('write_file_content', { path, content })
  }

  /**
   * List directory contents
   */
  static async listDirectory(path: string): Promise<DirEntry[]> {
    return await invoke<DirEntry[]>('list_directory', { path })
  }

  /**
   * Get file or directory metadata
   */
  static async getFileInfo(path: string): Promise<FileInfo> {
    return await invoke<FileInfo>('get_file_info', { path })
  }

  /**
   * Delete a file or directory path on local machine.
   */
  static async deleteFile(path: string, recursive?: boolean): Promise<boolean> {
    return await invoke<boolean>('delete_file', {
      path,
      recursive: recursive ?? false,
    })
  }

  /**
   * Get runtime platform info (windows/macos/linux).
   */
  static async getPlatformInfo(): Promise<PlatformInfo> {
    return await invoke<PlatformInfo>('get_platform_info')
  }

  /**
   * Open a desktop application by name/path.
   */
  static async openApplication(app: string, args?: string[]): Promise<boolean> {
    return await invoke<boolean>('open_application', {
      app,
      args: args ?? [],
    })
  }

  /**
   * Type text into active app (optional app activate hint).
   */
  static async typeText(text: string, targetApp?: string): Promise<boolean> {
    return await invoke<boolean>('type_text', {
      text,
      targetApp: targetApp ?? null,
    })
  }

  /**
   * Press hotkey in active app (optional app activate hint).
   */
  static async pressHotkey(keys: string[], targetApp?: string): Promise<boolean> {
    return await invoke<boolean>('press_hotkey', {
      keys,
      targetApp: targetApp ?? null,
    })
  }

  /**
   * Deterministic Feishu messaging flow: open app -> search contact -> send content.
   */
  static async sendFeishuMessage(recipient: string, content: string): Promise<boolean> {
    return await invoke<boolean>('send_feishu_message', {
      recipient,
      content,
    })
  }

  /**
   * Deterministic desktop IM messaging flow by channel.
   */
  static async sendDesktopMessage(channel: string, recipient: string, content: string): Promise<boolean> {
    return await invoke<boolean>('send_desktop_message', {
      channel,
      recipient,
      content,
    })
  }

  /**
   * Capture primary screen to png file.
   */
  static async captureScreen(saveTo?: string): Promise<ScreenCaptureResult> {
    return await invoke<ScreenCaptureResult>('capture_screen', {
      saveTo: saveTo ?? null,
    })
  }

  /**
   * Mouse click at (x,y) with left/right/middle button.
   */
  static async mouseClick(x: number, y: number, button?: string): Promise<boolean> {
    return await invoke<boolean>('mouse_click', {
      x,
      y,
      button: button ?? 'left',
    })
  }

  /**
   * Move cursor to (x,y).
   */
  static async mouseMove(x: number, y: number): Promise<boolean> {
    return await invoke<boolean>('mouse_move', { x, y })
  }

  /**
   * Scroll mouse wheel, positive up / negative down.
   */
  static async mouseScroll(amount: number): Promise<boolean> {
    return await invoke<boolean>('mouse_scroll', { amount })
  }
}
