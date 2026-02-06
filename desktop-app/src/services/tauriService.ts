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
}
