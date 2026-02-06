import { TauriService } from './tauriService'

type RiskLevel = 'low' | 'medium' | 'high'

/**
 * Classify the risk level of a desktop tool request
 */
export function classifyRisk(
  tool: string,
  input: Record<string, any>
): RiskLevel {
  if (tool === 'list_directory' || tool === 'read_file' || tool === 'get_file_info') {
    return 'low'
  }

  if (tool === 'write_file') {
    return 'medium'
  }

  if (tool === 'run_command') {
    const cmd = (input.command || '').toLowerCase()
    const highRiskPatterns = ['del ', 'rm ', 'rmdir', 'format', 'shutdown', 'reg delete']
    if (highRiskPatterns.some((p) => cmd.includes(p))) {
      return 'high'
    }
    return 'medium'
  }

  return 'medium'
}

/**
 * Generate a human-readable description of a tool request
 */
export function describeToolRequest(
  tool: string,
  input: Record<string, any>
): string {
  switch (tool) {
    case 'run_command':
      return `AI 想要执行命令：${input.command || '(unknown)'}`
    case 'read_file':
      return `AI 想要读取文件：${input.path || '(unknown)'}`
    case 'write_file':
      return `AI 想要写入文件：${input.path || '(unknown)'}`
    case 'list_directory':
      return `AI 想要列出目录：${input.path || '(unknown)'}`
    case 'get_file_info':
      return `AI 想要获取文件信息：${input.path || '(unknown)'}`
    default:
      return `AI 想要执行操作：${tool}`
  }
}

/**
 * Execute a desktop tool via TauriService and return a unified result
 */
export async function executeDesktopTool(
  tool: string,
  input: Record<string, any>
): Promise<{ success: boolean; content: string; error?: string }> {
  try {
    switch (tool) {
      case 'run_command': {
        const result = await TauriService.executeCommand(
          input.command,
          input.cwd,
          input.timeout_secs
        )
        // Always include both stdout and stderr so the AI can self-correct
        const output = [
          result.stdout ? `[stdout]\n${result.stdout}` : '',
          result.stderr ? `[stderr]\n${result.stderr}` : '',
        ].filter(Boolean).join('\n')

        return {
          success: result.success,
          content: output || (result.success ? '(no output)' : ''),
          error: result.success ? undefined : (result.stderr || `Command failed with exit code ${result.exit_code}`),
        }
      }

      case 'read_file': {
        const content = await TauriService.readFileContent(input.path)
        return { success: true, content }
      }

      case 'write_file': {
        await TauriService.writeFileContent(input.path, input.content)
        return { success: true, content: `File written: ${input.path}` }
      }

      case 'list_directory': {
        const entries = await TauriService.listDirectory(input.path)
        const formatted = entries
          .map((e) => `${e.is_dir ? '[DIR]' : '[FILE]'} ${e.name}${e.size != null ? ` (${e.size} bytes)` : ''}`)
          .join('\n')
        return { success: true, content: formatted || '(empty directory)' }
      }

      case 'get_file_info': {
        const info = await TauriService.getFileInfo(input.path)
        return {
          success: true,
          content: JSON.stringify(info, null, 2),
        }
      }

      default:
        return { success: false, content: '', error: `Unknown tool: ${tool}` }
    }
  } catch (err: any) {
    return {
      success: false,
      content: '',
      error: err.message || String(err),
    }
  }
}
