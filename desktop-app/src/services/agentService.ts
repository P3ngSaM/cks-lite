import type {
  ChatRequest,
  ChatResponse,
  MemoryRequest,
  MemorySearchResult,
  MemoryListResult,
  SkillsResult,
  SkillDetailResult,
  SkillInstallResult,
  HealthStatus,
} from '../types/agent'
import { withRetry, type RetryConfig } from '../utils/errorHandler'

/**
 * Agent SDK HTTP Client Service
 * Direct HTTP communication with the FastAPI backend
 *
 * All methods include:
 * - Automatic retry for network/timeout errors
 * - Error handling and logging
 * - Timeout configuration
 */
export class AgentService {
  private static baseURL = import.meta.env.VITE_AGENT_SDK_URL || 'http://127.0.0.1:7860'
  private static defaultTimeout = 30000 // 30 seconds

  /**
   * Default retry configuration for read operations
   */
  private static readRetryConfig: RetryConfig = {
    maxAttempts: 3,
    delay: 1000,
    backoff: 2
  }

  /**
   * Default retry configuration for write operations
   */
  private static writeRetryConfig: RetryConfig = {
    maxAttempts: 2,
    delay: 1000,
    backoff: 1.5
  }

  /**
   * Fetch with timeout
   */
  private static async fetchWithTimeout(
    url: string,
    options: RequestInit = {},
    timeout: number = this.defaultTimeout
  ): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      })
      clearTimeout(timeoutId)
      return response
    } catch (error: any) {
      clearTimeout(timeoutId)
      if (error.name === 'AbortError') {
        throw new Error('Request timeout')
      }
      throw error
    }
  }

  /**
   * Check Agent SDK health (with retry)
   */
  static async checkHealth(): Promise<HealthStatus | null> {
    return withRetry(
      async () => {
        const response = await this.fetchWithTimeout(`${this.baseURL}/`, {}, 5000)
        if (!response.ok) {
          throw new Error(`Health check failed: ${response.statusText}`)
        }
        return response.json()
      },
      this.readRetryConfig,
      'Health Check'
    )
  }

  /**
   * Chat with agent (non-streaming, with retry)
   */
  static async chat(request: ChatRequest): Promise<ChatResponse | null> {
    return withRetry(
      async () => {
        const response = await this.fetchWithTimeout(`${this.baseURL}/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
        })

        if (!response.ok) {
          throw new Error(`Chat request failed: ${response.statusText}`)
        }

        return response.json()
      },
      this.writeRetryConfig,
      'Chat Request'
    )
  }

  /**
   * Chat with agent (streaming)
   * Returns an async generator that yields message chunks
   */
  static async *chatStream(request: ChatRequest): AsyncGenerator<any> {
    const response = await fetch(`${this.baseURL}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      throw new Error(`Chat stream request failed: ${response.statusText}`)
    }

    if (!response.body) {
      throw new Error('Response body is null')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            try {
              const parsed = JSON.parse(data)
              yield parsed
            } catch (e) {
              console.error('Failed to parse SSE data:', data, e)
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  /**
   * Save a memory (with retry)
   */
  static async saveMemory(
    request: MemoryRequest
  ): Promise<{ success: boolean; memory_id?: string; error?: string } | null> {
    return withRetry(
      async () => {
        const response = await this.fetchWithTimeout(`${this.baseURL}/memory/save`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
        })

        if (!response.ok) {
          throw new Error(`Save memory failed: ${response.statusText}`)
        }

        return response.json()
      },
      this.writeRetryConfig,
      'Save Memory'
    )
  }

  /**
   * Search memories (with retry) - 纯向量搜索
   */
  static async searchMemories(
    userId: string,
    query: string,
    topK: number = 5
  ): Promise<MemorySearchResult | null> {
    return withRetry(
      async () => {
        const params = new URLSearchParams({
          user_id: userId,
          query,
          top_k: topK.toString(),
        })

        const response = await this.fetchWithTimeout(
          `${this.baseURL}/memory/search?${params}`
        )

        if (!response.ok) {
          throw new Error(`Search memories failed: ${response.statusText}`)
        }

        return response.json()
      },
      this.readRetryConfig,
      'Search Memories'
    )
  }

  /**
   * Hybrid search memories (BM25 + Vector) - 混合搜索
   */
  static async hybridSearchMemories(
    userId: string,
    query: string,
    topK: number = 5,
    vectorWeight: number = 0.7,
    textWeight: number = 0.3,
    memoryType?: string
  ): Promise<MemorySearchResult | null> {
    return withRetry(
      async () => {
        const params = new URLSearchParams({
          user_id: userId,
          query,
          top_k: topK.toString(),
          vector_weight: vectorWeight.toString(),
          text_weight: textWeight.toString(),
        })

        if (memoryType) {
          params.append('memory_type', memoryType)
        }

        const response = await this.fetchWithTimeout(
          `${this.baseURL}/memory/hybrid-search?${params}`
        )

        if (!response.ok) {
          throw new Error(`Hybrid search memories failed: ${response.statusText}`)
        }

        return response.json()
      },
      this.readRetryConfig,
      'Hybrid Search Memories'
    )
  }

  /**
   * List memories (with retry)
   */
  static async listMemories(
    userId: string,
    memoryType?: string,
    limit: number = 50
  ): Promise<MemoryListResult | null> {
    return withRetry(
      async () => {
        const params = new URLSearchParams({
          user_id: userId,
          limit: limit.toString(),
        })

        if (memoryType) {
          params.append('memory_type', memoryType)
        }

        const response = await this.fetchWithTimeout(
          `${this.baseURL}/memory/list?${params}`
        )

        if (!response.ok) {
          throw new Error(`List memories failed: ${response.statusText}`)
        }

        return response.json()
      },
      this.readRetryConfig,
      'List Memories'
    )
  }

  /**
   * Delete a memory (with retry)
   */
  static async deleteMemory(
    memoryId: string
  ): Promise<{ success: boolean; error?: string } | null> {
    return withRetry(
      async () => {
        const response = await this.fetchWithTimeout(
          `${this.baseURL}/memory/${memoryId}`,
          {
            method: 'DELETE',
          }
        )

        if (!response.ok) {
          throw new Error(`Delete memory failed: ${response.statusText}`)
        }

        return response.json()
      },
      this.writeRetryConfig,
      'Delete Memory'
    )
  }

  /**
   * List all skills (with retry)
   */
  static async listSkills(): Promise<SkillsResult | null> {
    return withRetry(
      async () => {
        const response = await this.fetchWithTimeout(`${this.baseURL}/skills`)

        if (!response.ok) {
          throw new Error(`List skills failed: ${response.statusText}`)
        }

        return response.json()
      },
      this.readRetryConfig,
      'List Skills'
    )
  }

  /**
   * Get skill details (with retry)
   */
  static async getSkill(skillName: string): Promise<SkillDetailResult | null> {
    return withRetry(
      async () => {
        const response = await this.fetchWithTimeout(
          `${this.baseURL}/skills/${skillName}`
        )

        if (!response.ok) {
          throw new Error(`Get skill failed: ${response.statusText}`)
        }

        return response.json()
      },
      this.readRetryConfig,
      'Get Skill Details'
    )
  }

  /**
   * Get skill context (SKILL.md content)
   */
  static async getSkillContext(skillName: string): Promise<{
    success: boolean
    context?: string
    error?: string
  } | null> {
    return withRetry(
      async () => {
        const response = await this.fetchWithTimeout(
          `${this.baseURL}/skills/${skillName}/context`
        )

        if (!response.ok) {
          throw new Error(`Get skill context failed: ${response.statusText}`)
        }

        return response.json()
      },
      this.readRetryConfig,
      'Get Skill Context'
    )
  }

  /**
   * Execute skill script
   */
  static async executeSkill(
    skillName: string,
    scriptName: string,
    args: string[] = []
  ): Promise<{
    success: boolean
    stdout?: string
    stderr?: string
    error?: string
  } | null> {
    return withRetry(
      async () => {
        const params = new URLSearchParams({
          skill_name: skillName,
          script_name: scriptName,
        })

        const response = await this.fetchWithTimeout(
          `${this.baseURL}/skills/execute?${params}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ args }),
          },
          60000 // 60 second timeout for script execution
        )

        if (!response.ok) {
          throw new Error(`Execute skill failed: ${response.statusText}`)
        }

        return response.json()
      },
      this.writeRetryConfig,
      'Execute Skill'
    )
  }

  /**
   * List available tools
   */
  static async listTools(): Promise<{
    success: boolean
    tools: Array<{
      name: string
      description: string
      input_schema: any
    }>
  } | null> {
    return withRetry(
      async () => {
        const response = await this.fetchWithTimeout(`${this.baseURL}/tools`)

        if (!response.ok) {
          throw new Error(`List tools failed: ${response.statusText}`)
        }

        return response.json()
      },
      this.readRetryConfig,
      'List Tools'
    )
  }

  /**
   * Execute a tool
   */
  static async executeTool(
    toolName: string,
    toolInput: Record<string, any>
  ): Promise<{
    success: boolean
    content?: string
    message?: string
    error?: string
  } | null> {
    return withRetry(
      async () => {
        const params = new URLSearchParams({
          tool_name: toolName,
        })

        const response = await this.fetchWithTimeout(
          `${this.baseURL}/tools/execute?${params}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(toolInput),
          },
          120000 // 2 minute timeout for tool execution
        )

        if (!response.ok) {
          throw new Error(`Execute tool failed: ${response.statusText}`)
        }

        return response.json()
      },
      this.writeRetryConfig,
      'Execute Tool'
    )
  }

  /**
   * Install a skill from GitHub (with retry)
   */
  static async installSkill(ref: string): Promise<SkillInstallResult | null> {
    return withRetry(
      async () => {
        const response = await this.fetchWithTimeout(
          `${this.baseURL}/skills/install`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ref }),
          },
          60000 // 60 second timeout for download + install
        )

        if (!response.ok) {
          throw new Error(`Install skill failed: ${response.statusText}`)
        }

        return response.json()
      },
      this.writeRetryConfig,
      'Install Skill'
    )
  }

  /**
   * Uninstall a user-installed skill (with retry)
   */
  static async uninstallSkill(skillName: string): Promise<SkillInstallResult | null> {
    return withRetry(
      async () => {
        const response = await this.fetchWithTimeout(
          `${this.baseURL}/skills/install/${encodeURIComponent(skillName)}`,
          {
            method: 'DELETE',
          }
        )

        if (!response.ok) {
          throw new Error(`Uninstall skill failed: ${response.statusText}`)
        }

        return response.json()
      },
      this.writeRetryConfig,
      'Uninstall Skill'
    )
  }

  /**
   * Web search (with retry)
   */
  static async webSearch(
    query: string,
    numResults: number = 5
  ): Promise<{
    success: boolean
    results: Array<{
      title: string
      url: string
      snippet: string
      content?: string
    }>
    provider: string
    error?: string
  } | null> {
    return withRetry(
      async () => {
        const params = new URLSearchParams({
          query,
          num_results: numResults.toString(),
        })

        const response = await this.fetchWithTimeout(
          `${this.baseURL}/search?${params}`,
          {},
          60000 // 60 second timeout for search
        )

        if (!response.ok) {
          throw new Error(`Web search failed: ${response.statusText}`)
        }

        return response.json()
      },
      this.readRetryConfig,
      'Web Search'
    )
  }

  /**
   * Read MEMORY.md content (with retry)
   */
  static async readMarkdownMemory(): Promise<{
    success: boolean
    content?: string
    memories?: any[]
    file_path?: string
    error?: string
  } | null> {
    return withRetry(
      async () => {
        const response = await this.fetchWithTimeout(
          `${this.baseURL}/memory/markdown/read`
        )

        if (!response.ok) {
          throw new Error(`Read markdown memory failed: ${response.statusText}`)
        }

        return response.json()
      },
      this.readRetryConfig,
      'Read Markdown Memory'
    )
  }

  /**
   * Read daily log (with retry)
   */
  static async readDailyLog(
    date?: string
  ): Promise<{
    success: boolean
    content?: string
    date?: string
    file_path?: string
    error?: string
  } | null> {
    return withRetry(
      async () => {
        const params = date ? `?date=${date}` : ''
        const response = await this.fetchWithTimeout(
          `${this.baseURL}/memory/markdown/daily-log${params}`
        )

        if (!response.ok) {
          throw new Error(`Read daily log failed: ${response.statusText}`)
        }

        return response.json()
      },
      this.readRetryConfig,
      'Read Daily Log'
    )
  }

  /**
   * Get recent logs list (with retry)
   */
  static async getRecentLogs(
    days: number = 7
  ): Promise<{
    success: boolean
    logs?: Array<{ date: string; path: string; size: number }>
    error?: string
  } | null> {
    return withRetry(
      async () => {
        const params = new URLSearchParams({
          days: days.toString(),
        })

        const response = await this.fetchWithTimeout(
          `${this.baseURL}/memory/markdown/recent-logs?${params}`
        )

        if (!response.ok) {
          throw new Error(`Get recent logs failed: ${response.statusText}`)
        }

        return response.json()
      },
      this.readRetryConfig,
      'Get Recent Logs'
    )
  }

  /**
   * Submit desktop tool execution result back to Agent SDK
   */
  static async submitDesktopToolResult(
    requestId: string,
    result: { success: boolean; content: string; error?: string }
  ): Promise<{ success: boolean }> {
    try {
      const params = new URLSearchParams({ request_id: requestId })
      const response = await this.fetchWithTimeout(
        `${this.baseURL}/tools/desktop-result?${params}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result),
        },
        10000
      )

      if (!response.ok) {
        throw new Error(`Submit desktop result failed: ${response.statusText}`)
      }

      return response.json()
    } catch (error) {
      console.error('Failed to submit desktop tool result:', error)
      return { success: false }
    }
  }

  /**
   * Clear all memories (DANGEROUS) - with retry
   */
  static async clearAllMemories(
    userId: string,
    backup: boolean = true
  ): Promise<{
    success: boolean
    cleared_count?: number
    backup_path?: string
    message?: string
    error?: string
  } | null> {
    return withRetry(
      async () => {
        const params = new URLSearchParams({
          user_id: userId,
          backup: backup.toString(),
        })

        const response = await this.fetchWithTimeout(
          `${this.baseURL}/memory/clear-all?${params}`,
          {
            method: 'POST',
          }
        )

        if (!response.ok) {
          throw new Error(`Clear all memories failed: ${response.statusText}`)
        }

        return response.json()
      },
      this.writeRetryConfig,
      'Clear All Memories'
    )
  }
}
