import type {
  ChatRequest,
  ChatResponse,
  MemoryRequest,
  MemorySearchResult,
  MemorySearchV2Result,
  MemoryDetailResult,
  MemoryListResult,
  MemoryCompactResult,
  MemoryConflictResolveResult,
  MemoryMaintenanceReportResult,
  MemoryConflictListResult,
  MemoryMaintenanceAutoRunResult,
  SkillsResult,
  SkillDetailResult,
  SkillInstallResult,
  SkillReadinessResult,
  SkillSmokeTestResult,
  SkillsSnapshotResult,
  ExecutionApprovalCreateResult,
  ExecutionApprovalListResult,
  FeishuConfigResult,
  FeishuConfigTestResult,
  FeishuDiagnoseResult,
  ChannelTaskResult,
  ChannelTaskListResult,
  AuditRecordsResult,
  HealthStatus,
  GoalsTreeResult,
  GoalCreateResult,
  GoalActionResult,
  GoalTaskListResult,
  GoalTaskExecutionResult,
  GoalsDashboardResult,
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

  static async searchMemoriesV2(
    userId: string,
    query: string,
    topK: number = 5,
    memoryType?: string
  ): Promise<MemorySearchV2Result | null> {
    return withRetry(
      async () => {
        const params = new URLSearchParams({
          user_id: userId,
          query,
          top_k: topK.toString(),
        })

        if (memoryType) {
          params.append('memory_type', memoryType)
        }

        const response = await this.fetchWithTimeout(
          `${this.baseURL}/memory/search-v2?${params}`
        )

        if (!response.ok) {
          throw new Error(`Search memories v2 failed: ${response.statusText}`)
        }

        return response.json()
      },
      this.readRetryConfig,
      'Search Memories V2'
    )
  }

  static async getMemoryById(
    userId: string,
    memoryId: string
  ): Promise<MemoryDetailResult | null> {
    return withRetry(
      async () => {
        const params = new URLSearchParams({
          user_id: userId,
          memory_id: memoryId,
        })

        const response = await this.fetchWithTimeout(
          `${this.baseURL}/memory/get?${params}`
        )

        if (!response.ok) {
          throw new Error(`Get memory by id failed: ${response.statusText}`)
        }

        return response.json()
      },
      this.readRetryConfig,
      'Get Memory By Id'
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

  static async getSkillsSnapshot(): Promise<SkillsSnapshotResult | null> {
    return withRetry(
      async () => {
        const response = await this.fetchWithTimeout(`${this.baseURL}/skills/snapshot`)

        if (!response.ok) {
          throw new Error(`Get skills snapshot failed: ${response.statusText}`)
        }

        return response.json()
      },
      this.readRetryConfig,
      'Get Skills Snapshot'
    )
  }

  /**
   * Get skills readiness diagnostics
   */
  static async listSkillsReadiness(skillName?: string): Promise<SkillReadinessResult | null> {
    return withRetry(
      async () => {
        const params = new URLSearchParams()
        if (skillName) {
          params.append('skill_name', skillName)
        }
        const suffix = params.toString() ? `?${params.toString()}` : ''
        const response = await this.fetchWithTimeout(`${this.baseURL}/skills/readiness${suffix}`)

        if (!response.ok) {
          throw new Error(`List skills readiness failed: ${response.statusText}`)
        }

        return response.json()
      },
      this.readRetryConfig,
      'List Skills Readiness'
    )
  }

  /**
   * Run skill smoke test
   */
  static async smokeTestSkill(skillName?: string): Promise<SkillSmokeTestResult | null> {
    return withRetry(
      async () => {
        const params = new URLSearchParams()
        if (skillName) {
          params.append('skill_name', skillName)
        }
        const suffix = params.toString() ? `?${params.toString()}` : ''
        const response = await this.fetchWithTimeout(
          `${this.baseURL}/skills/smoke-test${suffix}`,
          { method: 'POST' },
          60000
        )

        if (!response.ok) {
          throw new Error(`Smoke test skill failed: ${response.statusText}`)
        }

        return response.json()
      },
      this.writeRetryConfig,
      'Skill Smoke Test'
    )
  }

  /**
   * Get tool execution audit logs
   */
  static async getAuditExecutions(
    sessionId?: string,
    limit: number = 100,
    toolName?: string,
    fromTime?: string,
    toTime?: string,
    goalTaskId?: number
  ): Promise<AuditRecordsResult | null> {
    return withRetry(
      async () => {
        const params = new URLSearchParams()
        if (sessionId) {
          params.append('session_id', sessionId)
        }
        if (toolName) {
          params.append('tool_name', toolName)
        }
        if (goalTaskId) {
          params.append('goal_task_id', String(goalTaskId))
        }
        if (fromTime) {
          params.append('from_time', fromTime)
        }
        if (toTime) {
          params.append('to_time', toTime)
        }
        params.append('limit', Math.max(1, Math.min(limit, 1000)).toString())

        const response = await this.fetchWithTimeout(
          `${this.baseURL}/audit/executions?${params.toString()}`
        )

        if (!response.ok) {
          throw new Error(`Get audit executions failed: ${response.statusText}`)
        }

        return response.json()
      },
      this.readRetryConfig,
      'Get Audit Executions'
    )
  }

  /**
   * Get tool error audit logs
   */
  static async getAuditErrors(
    sessionId?: string,
    limit: number = 100,
    toolName?: string,
    fromTime?: string,
    toTime?: string,
    goalTaskId?: number
  ): Promise<AuditRecordsResult | null> {
    return withRetry(
      async () => {
        const params = new URLSearchParams()
        if (sessionId) {
          params.append('session_id', sessionId)
        }
        if (toolName) {
          params.append('tool_name', toolName)
        }
        if (goalTaskId) {
          params.append('goal_task_id', String(goalTaskId))
        }
        if (fromTime) {
          params.append('from_time', fromTime)
        }
        if (toTime) {
          params.append('to_time', toTime)
        }
        params.append('limit', Math.max(1, Math.min(limit, 1000)).toString())

        const response = await this.fetchWithTimeout(
          `${this.baseURL}/audit/errors?${params.toString()}`
        )

        if (!response.ok) {
          throw new Error(`Get audit errors failed: ${response.statusText}`)
        }

        return response.json()
      },
      this.readRetryConfig,
      'Get Audit Errors'
    )
  }

  /**
   * Get KPI/OKR/Project/Task hierarchy
   */
  static async getGoalsTree(organizationId?: string): Promise<GoalsTreeResult | null> {
    return withRetry(
      async () => {
        const params = new URLSearchParams()
        if (organizationId) params.append('organization_id', organizationId)
        const query = params.toString()
        const response = await this.fetchWithTimeout(
          `${this.baseURL}/goals/tree${query ? `?${query}` : ''}`
        )

        if (!response.ok) {
          throw new Error(`Get goals tree failed: ${response.statusText}`)
        }

        return response.json()
      },
      this.readRetryConfig,
      'Get Goals Tree'
    )
  }

  /**
   * Create KPI
   */
  static async createKPI(
    title: string,
    description: string = '',
    organizationId?: string
  ): Promise<GoalCreateResult | null> {
    return withRetry(
      async () => {
        const response = await this.fetchWithTimeout(`${this.baseURL}/goals/kpi`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ title, description, organization_id: organizationId }),
        })

        if (!response.ok) {
          throw new Error(`Create KPI failed: ${response.statusText}`)
        }

        return response.json()
      },
      this.writeRetryConfig,
      'Create KPI'
    )
  }

  /**
   * Create OKR
   */
  static async createOKR(
    kpiId: number,
    title: string,
    description: string = ''
  ): Promise<GoalCreateResult | null> {
    return withRetry(
      async () => {
        const response = await this.fetchWithTimeout(`${this.baseURL}/goals/okr`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ kpi_id: kpiId, title, description }),
        })

        if (!response.ok) {
          throw new Error(`Create OKR failed: ${response.statusText}`)
        }

        return response.json()
      },
      this.writeRetryConfig,
      'Create OKR'
    )
  }

  /**
   * Create project
   */
  static async createGoalProject(
    okrId: number,
    title: string,
    description: string = ''
  ): Promise<GoalCreateResult | null> {
    return withRetry(
      async () => {
        const response = await this.fetchWithTimeout(`${this.baseURL}/goals/project`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ okr_id: okrId, title, description }),
        })

        if (!response.ok) {
          throw new Error(`Create project failed: ${response.statusText}`)
        }

        return response.json()
      },
      this.writeRetryConfig,
      'Create Project'
    )
  }

  /**
   * Create task
   */
  static async createGoalTask(
    projectId: number,
    title: string,
    description: string = '',
    assignee: string = '',
    department: string = ''
  ): Promise<GoalCreateResult | null> {
    return withRetry(
      async () => {
        const response = await this.fetchWithTimeout(`${this.baseURL}/goals/task`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            project_id: projectId,
            title,
            description,
            assignee,
            department,
          }),
        })

        if (!response.ok) {
          throw new Error(`Create task failed: ${response.statusText}`)
        }

        return response.json()
      },
      this.writeRetryConfig,
      'Create Task'
    )
  }

  /**
   * Delete task
   */
  static async deleteGoalTask(taskId: number): Promise<GoalActionResult | null> {
    return withRetry(
      async () => {
        const response = await this.fetchWithTimeout(`${this.baseURL}/goals/task/${taskId}`, {
          method: 'DELETE',
        })

        if (!response.ok) {
          throw new Error(`Delete task failed: ${response.statusText}`)
        }

        return response.json()
      },
      this.writeRetryConfig,
      'Delete Task'
    )
  }

  /**
   * Delete project (cascade delete tasks)
   */
  static async deleteGoalProject(projectId: number): Promise<GoalActionResult | null> {
    return withRetry(
      async () => {
        const response = await this.fetchWithTimeout(`${this.baseURL}/goals/project/${projectId}`, {
          method: 'DELETE',
        })

        if (!response.ok) {
          throw new Error(`Delete project failed: ${response.statusText}`)
        }

        return response.json()
      },
      this.writeRetryConfig,
      'Delete Project'
    )
  }

  /**
   * Delete OKR (cascade delete projects/tasks)
   */
  static async deleteGoalOKR(okrId: number): Promise<GoalActionResult | null> {
    return withRetry(
      async () => {
        const response = await this.fetchWithTimeout(`${this.baseURL}/goals/okr/${okrId}`, {
          method: 'DELETE',
        })

        if (!response.ok) {
          throw new Error(`Delete OKR failed: ${response.statusText}`)
        }

        return response.json()
      },
      this.writeRetryConfig,
      'Delete OKR'
    )
  }

  /**
   * Delete KPI (cascade delete all descendants)
   */
  static async deleteGoalKPI(kpiId: number): Promise<GoalActionResult | null> {
    return withRetry(
      async () => {
        const response = await this.fetchWithTimeout(`${this.baseURL}/goals/kpi/${kpiId}`, {
          method: 'DELETE',
        })

        if (!response.ok) {
          throw new Error(`Delete KPI failed: ${response.statusText}`)
        }

        return response.json()
      },
      this.writeRetryConfig,
      'Delete KPI'
    )
  }

  /**
   * Mark a task completed
   */
  static async completeGoalTask(taskId: number): Promise<GoalActionResult | null> {
    return withRetry(
      async () => {
        const response = await this.fetchWithTimeout(
          `${this.baseURL}/goals/task/${taskId}/complete`,
          { method: 'POST' }
        )

        if (!response.ok) {
          throw new Error(`Complete task failed: ${response.statusText}`)
        }

        return response.json()
      },
      this.writeRetryConfig,
      'Complete Task'
    )
  }

  /**
   * Review a task: accept or reject
   */
  static async reviewGoalTask(
    taskId: number,
    decision: 'accept' | 'reject',
    reason: string = '',
    reviewedBy: string = 'manager'
  ): Promise<GoalActionResult | null> {
    return withRetry(
      async () => {
        const response = await this.fetchWithTimeout(
          `${this.baseURL}/goals/task/${taskId}/review`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              decision,
              reason,
              reviewed_by: reviewedBy,
            }),
          }
        )

        if (!response.ok) {
          throw new Error(`Review task failed: ${response.statusText}`)
        }

        return response.json()
      },
      this.writeRetryConfig,
      'Review Task'
    )
  }

  /**
   * Get execution flow state for a task
   */
  static async getGoalTaskExecutionState(taskId: number): Promise<GoalTaskExecutionResult | null> {
    return withRetry(
      async () => {
        const response = await this.fetchWithTimeout(
          `${this.baseURL}/goals/task/${taskId}/execution/state`
        )
        if (!response.ok) {
          throw new Error(`Get task execution state failed: ${response.statusText}`)
        }
        return response.json()
      },
      this.readRetryConfig,
      'Get Goal Task Execution State'
    )
  }

  /**
   * Update execution phase state for a task
   */
  static async updateGoalTaskExecutionState(
    taskId: number,
    phase: 'plan' | 'do' | 'verify',
    status: 'idle' | 'active' | 'blocked' | 'done',
    note: string = '',
    prompt: string = ''
  ): Promise<GoalTaskExecutionResult | null> {
    return withRetry(
      async () => {
        const response = await this.fetchWithTimeout(
          `${this.baseURL}/goals/task/${taskId}/execution/phase`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              phase,
              status,
              note,
              prompt,
            }),
          }
        )
        if (!response.ok) {
          throw new Error(`Update task execution state failed: ${response.statusText}`)
        }
        return response.json()
      },
      this.writeRetryConfig,
      'Update Goal Task Execution State'
    )
  }

  /**
   * Resume task execution based on persisted phase state
   */
  static async resumeGoalTaskExecution(
    taskId: number,
    note: string = ''
  ): Promise<GoalTaskExecutionResult | null> {
    return withRetry(
      async () => {
        const response = await this.fetchWithTimeout(
          `${this.baseURL}/goals/task/${taskId}/execution/resume`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ note }),
          }
        )
        if (!response.ok) {
          throw new Error(`Resume task execution failed: ${response.statusText}`)
        }
        return response.json()
      },
      this.writeRetryConfig,
      'Resume Goal Task Execution'
    )
  }

  /**
   * Get manager dashboard summary and owner list
   */
  static async getGoalsDashboard(
    options: {
      organizationId?: string
      fromTime?: string
      toTime?: string
      limit?: number
    } = {}
  ): Promise<GoalsDashboardResult | null> {
    return withRetry(
      async () => {
        const params = new URLSearchParams()
        if (options.organizationId) params.append('organization_id', options.organizationId)
        if (options.fromTime) params.append('from_time', options.fromTime)
        if (options.toTime) params.append('to_time', options.toTime)
        params.append('limit', String(Math.max(1, Math.min(options.limit ?? 2000, 10000))))
        const response = await this.fetchWithTimeout(
          `${this.baseURL}/goals/dashboard?${params.toString()}`
        )
        if (!response.ok) {
          throw new Error(`Get goals dashboard failed: ${response.statusText}`)
        }
        return response.json()
      },
      this.readRetryConfig,
      'Get Goals Dashboard'
    )
  }

  /**
   * Set preferred next task for an assignee in board scheduling
   */
  static async setDashboardNextTask(
    assignee: string,
    taskId: number,
    organizationId?: string
  ): Promise<GoalActionResult | null> {
    return withRetry(
      async () => {
        const response = await this.fetchWithTimeout(
          `${this.baseURL}/goals/dashboard/next-task`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              assignee,
              task_id: taskId,
              organization_id: organizationId,
            }),
          }
        )
        if (!response.ok) {
          throw new Error(`Set dashboard next task failed: ${response.statusText}`)
        }
        return response.json()
      },
      this.writeRetryConfig,
      'Set Dashboard Next Task'
    )
  }

  /**
   * List tasks with filters
   */
  static async listGoalTasks(
    options: {
      organizationId?: string
      taskId?: number
      assignee?: string
      department?: string
      status?: string
      reviewStatus?: string
      handoffStatus?: string
      handoffOwner?: string
      fromTime?: string
      toTime?: string
      limit?: number
    } = {}
  ): Promise<GoalTaskListResult | null> {
    return withRetry(
      async () => {
        const params = new URLSearchParams()
        if (options.organizationId) params.append('organization_id', options.organizationId)
        if (typeof options.taskId === 'number') params.append('task_id', String(options.taskId))
        if (options.assignee) params.append('assignee', options.assignee)
        if (options.department) params.append('department', options.department)
        if (options.status) params.append('status', options.status)
        if (options.reviewStatus) params.append('review_status', options.reviewStatus)
        if (options.handoffStatus) params.append('handoff_status', options.handoffStatus)
        if (options.handoffOwner) params.append('handoff_owner', options.handoffOwner)
        if (options.fromTime) params.append('from_time', options.fromTime)
        if (options.toTime) params.append('to_time', options.toTime)
        params.append('limit', String(Math.max(1, Math.min(options.limit ?? 200, 2000))))

        const response = await this.fetchWithTimeout(
          `${this.baseURL}/goals/tasks?${params.toString()}`
        )

        if (!response.ok) {
          throw new Error(`List goal tasks failed: ${response.statusText}`)
        }
        return response.json()
      },
      this.readRetryConfig,
      'List Goal Tasks'
    )
  }

  /**
   * Claim rejected task as human handoff owner
   */
  static async claimGoalTaskHandoff(
    taskId: number,
    owner: string = 'manager',
    note: string = ''
  ): Promise<GoalActionResult | null> {
    return withRetry(
      async () => {
        const response = await this.fetchWithTimeout(
          `${this.baseURL}/goals/task/${taskId}/handoff/claim`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ owner, note }),
          }
        )

        if (!response.ok) {
          throw new Error(`Claim goal task handoff failed: ${response.statusText}`)
        }
        return response.json()
      },
      this.writeRetryConfig,
      'Claim Goal Task Handoff'
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
        const response = await this.fetchWithTimeout(
          `${this.baseURL}/skills/execute`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              skill_name: skillName,
              script_name: scriptName,
              args
            }),
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
   * Install a skill from local folder or zip path
   */
  static async installSkillLocal(path: string): Promise<SkillInstallResult | null> {
    return withRetry(
      async () => {
        const response = await this.fetchWithTimeout(
          `${this.baseURL}/skills/install/local`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ path }),
          },
          60000
        )

        if (!response.ok) {
          throw new Error(`Install local skill failed: ${response.statusText}`)
        }
        return response.json()
      },
      this.writeRetryConfig,
      'Install Local Skill'
    )
  }

  /**
   * Create a local skill scaffold
   */
  static async createSkillScaffold(input: {
    name: string
    display_name: string
    description?: string
    category?: string
    trigger_keywords?: string[]
    tags?: string[]
  }): Promise<SkillInstallResult | null> {
    return withRetry(
      async () => {
        const response = await this.fetchWithTimeout(
          `${this.baseURL}/skills/create`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(input),
          },
          60000
        )
        if (!response.ok) {
          throw new Error(`Create skill scaffold failed: ${response.statusText}`)
        }
        return response.json()
      },
      this.writeRetryConfig,
      'Create Skill Scaffold'
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

  static async createExecutionApproval(request: {
    source?: string
    tool_name: string
    risk_level?: string
    organization_id?: string
    payload?: Record<string, any>
    ttl_seconds?: number
  }): Promise<ExecutionApprovalCreateResult | null> {
    return withRetry(
      async () => {
        const response = await this.fetchWithTimeout(`${this.baseURL}/approvals/request`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
        })
        if (!response.ok) {
          throw new Error(`Create approval failed: ${response.statusText}`)
        }
        return response.json()
      },
      this.writeRetryConfig,
      'Create Execution Approval'
    )
  }

  static async decideExecutionApproval(
    requestId: string,
    request: { decision: 'approved' | 'denied'; decided_by?: string; note?: string }
  ): Promise<ExecutionApprovalCreateResult | null> {
    return withRetry(
      async () => {
        const response = await this.fetchWithTimeout(
          `${this.baseURL}/approvals/${encodeURIComponent(requestId)}/decision`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(request),
          }
        )
        if (!response.ok) {
          throw new Error(`Decide approval failed: ${response.statusText}`)
        }
        return response.json()
      },
      this.writeRetryConfig,
      'Decide Execution Approval'
    )
  }

  static async listExecutionApprovals(
    status?: string,
    limit: number = 50,
    organizationId?: string,
    sessionId?: string
  ): Promise<ExecutionApprovalListResult | null> {
    return withRetry(
      async () => {
        const params = new URLSearchParams()
        if (status) params.append('status', status)
        if (organizationId) params.append('organization_id', organizationId)
        if (sessionId) params.append('session_id', sessionId)
        params.append('limit', String(limit))
        const response = await this.fetchWithTimeout(`${this.baseURL}/approvals?${params.toString()}`)
        if (!response.ok) {
          throw new Error(`List approvals failed: ${response.statusText}`)
        }
        return response.json()
      },
      this.readRetryConfig,
      'List Execution Approvals'
    )
  }

  static async getFeishuConfig(): Promise<FeishuConfigResult | null> {
    return withRetry(
      async () => {
        const response = await this.fetchWithTimeout(`${this.baseURL}/channels/feishu/config`)
        if (!response.ok) {
          throw new Error(`Get Feishu config failed: ${response.statusText}`)
        }
        return response.json()
      },
      this.readRetryConfig,
      'Get Feishu Config'
    )
  }

  static async updateFeishuConfig(request: {
    app_id: string
    app_secret: string
    verification_token: string
    encrypt_key: string
    domain: string
    auto_dispatch: boolean
    enable_approval_card: boolean
    allowed_senders: string
    signature_tolerance_sec: number
    replay_cache_size: number
  }): Promise<FeishuConfigResult | null> {
    return withRetry(
      async () => {
        const response = await this.fetchWithTimeout(`${this.baseURL}/channels/feishu/config`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
        })
        if (!response.ok) {
          throw new Error(`Update Feishu config failed: ${response.statusText}`)
        }
        return response.json()
      },
      this.writeRetryConfig,
      'Update Feishu Config'
    )
  }

  static async testFeishuConfig(request: {
    send_probe: boolean
    receive_id?: string
    receive_id_type?: string
    text?: string
  }): Promise<FeishuConfigTestResult | null> {
    return withRetry(
      async () => {
        const response = await this.fetchWithTimeout(`${this.baseURL}/channels/feishu/config/test`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
        })
        if (!response.ok) {
          throw new Error(`Test Feishu config failed: ${response.statusText}`)
        }
        return response.json()
      },
      this.writeRetryConfig,
      'Test Feishu Config'
    )
  }

  static async diagnoseFeishuConfig(includeProbe: boolean = true): Promise<FeishuDiagnoseResult | null> {
    return withRetry(
      async () => {
        const query = new URLSearchParams({
          include_probe: includeProbe ? '1' : '0',
        })
        const response = await this.fetchWithTimeout(`${this.baseURL}/channels/feishu/config/diagnose?${query.toString()}`)
        if (!response.ok) {
          throw new Error(`Diagnose Feishu config failed: ${response.statusText}`)
        }
        return response.json()
      },
      this.readRetryConfig,
      'Diagnose Feishu Config'
    )
  }

  static async enqueueFeishuInboundTask(request: {
    sender_id: string
    chat_id: string
    message: string
    auto_dispatch?: boolean
    user_id?: string
    metadata?: Record<string, any>
    channel?: string
  }): Promise<ChannelTaskResult | null> {
    return withRetry(
      async () => {
        const response = await this.fetchWithTimeout(`${this.baseURL}/channels/feishu/inbound`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
        })
        if (!response.ok) {
          throw new Error(`Enqueue Feishu task failed: ${response.statusText}`)
        }
        return response.json()
      },
      this.writeRetryConfig,
      'Enqueue Feishu Task'
    )
  }

  static async listChannelTasks(params?: {
    channel?: string
    status?: string
    limit?: number
  }): Promise<ChannelTaskListResult | null> {
    return withRetry(
      async () => {
        const query = new URLSearchParams()
        if (params?.channel) query.append('channel', params.channel)
        if (params?.status) query.append('status', params.status)
        query.append('limit', String(params?.limit ?? 20))
        const response = await this.fetchWithTimeout(`${this.baseURL}/channels/tasks?${query.toString()}`)
        if (!response.ok) {
          throw new Error(`List channel tasks failed: ${response.statusText}`)
        }
        return response.json()
      },
      this.readRetryConfig,
      'List Channel Tasks'
    )
  }

  static async controlChannelTask(
    taskId: number,
    action: 'pause' | 'resume' | 'cancel' | 'retry'
  ): Promise<ChannelTaskResult | null> {
    return withRetry(
      async () => {
        const query = new URLSearchParams({ action })
        const response = await this.fetchWithTimeout(
          `${this.baseURL}/channels/tasks/${taskId}/control?${query.toString()}`,
          {
            method: 'POST',
          }
        )
        if (!response.ok) {
          throw new Error(`Control channel task failed: ${response.statusText}`)
        }
        return response.json()
      },
      this.writeRetryConfig,
      'Control Channel Task'
    )
  }

  static async visionNextAction(request: {
    image_path: string
    goal: string
    history?: string
  }): Promise<any> {
    return withRetry(
      async () => {
        const response = await this.fetchWithTimeout(`${this.baseURL}/vision/next-action`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            image_path: request.image_path,
            goal: request.goal,
            history: request.history || '',
          }),
        })
        if (!response.ok) {
          throw new Error(`Vision next action failed: ${response.statusText}`)
        }
        return response.json()
      },
      this.writeRetryConfig,
      'Vision Next Action'
    )
  }

  static async dispatchChannelTask(taskId: number, request?: {
    user_id?: string
    session_id?: string
    use_memory?: boolean
  }): Promise<ChannelTaskResult | null> {
    return withRetry(
      async () => {
        const response = await this.fetchWithTimeout(`${this.baseURL}/channels/tasks/${taskId}/dispatch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_id: request?.user_id || 'default-user',
            session_id: request?.session_id,
            use_memory: request?.use_memory ?? true,
          }),
        })
        if (!response.ok) {
          throw new Error(`Dispatch channel task failed: ${response.statusText}`)
        }
        return response.json()
      },
      this.writeRetryConfig,
      'Dispatch Channel Task'
    )
  }

  /**
   * Run anti-corrosion memory compaction (dedupe + stale prune)
   */
  static async compactMemories(
    userId: string,
    dedupeThreshold: number = 0.985,
    staleDays: number = 120,
    dryRun: boolean = false
  ): Promise<MemoryCompactResult | null> {
    return withRetry(
      async () => {
        const params = new URLSearchParams({
          user_id: userId,
          dedupe_threshold: dedupeThreshold.toString(),
          stale_days: staleDays.toString(),
          dry_run: dryRun.toString(),
        })

        const response = await this.fetchWithTimeout(
          `${this.baseURL}/memory/maintenance/compact?${params}`,
          { method: 'POST' }
        )

        if (!response.ok) {
          throw new Error(`Compact memories failed: ${response.statusText}`)
        }

        return response.json()
      },
      this.writeRetryConfig,
      'Compact Memories'
    )
  }

  /**
   * Resolve a conflict-marked memory item.
   */
  static async resolveMemoryConflict(
    memoryId: string,
    action: 'accept_current' | 'keep_all' = 'accept_current'
  ): Promise<MemoryConflictResolveResult | null> {
    return withRetry(
      async () => {
        const params = new URLSearchParams({ action })
        const response = await this.fetchWithTimeout(
          `${this.baseURL}/memory/${memoryId}/resolve-conflict?${params}`,
          { method: 'POST' }
        )

        if (!response.ok) {
          throw new Error(`Resolve memory conflict failed: ${response.statusText}`)
        }

        return response.json()
      },
      this.writeRetryConfig,
      'Resolve Memory Conflict'
    )
  }

  static async getMemoryConflicts(
    userId: string,
    status: 'pending_review' | 'resolved' | 'superseded' | 'all' = 'pending_review',
    limit: number = 100
  ): Promise<MemoryConflictListResult | null> {
    return withRetry(
      async () => {
        const params = new URLSearchParams({
          user_id: userId,
          status,
          limit: limit.toString(),
        })
        const response = await this.fetchWithTimeout(`${this.baseURL}/memory/conflicts?${params}`)
        if (!response.ok) {
          throw new Error(`Get memory conflicts failed: ${response.statusText}`)
        }
        return response.json()
      },
      this.readRetryConfig,
      'Get Memory Conflicts'
    )
  }

  static async getMemoryMaintenanceReport(
    userId: string,
    dedupeThreshold: number = 0.985,
    staleDays: number = 120
  ): Promise<MemoryMaintenanceReportResult | null> {
    return withRetry(
      async () => {
        const params = new URLSearchParams({
          user_id: userId,
          dedupe_threshold: dedupeThreshold.toString(),
          stale_days: staleDays.toString(),
        })
        const response = await this.fetchWithTimeout(
          `${this.baseURL}/memory/maintenance/report?${params}`
        )
        if (!response.ok) {
          throw new Error(`Get memory maintenance report failed: ${response.statusText}`)
        }
        return response.json()
      },
      this.readRetryConfig,
      'Get Memory Maintenance Report'
    )
  }

  static async autoRunMemoryMaintenance(
    userId: string,
    intervalHours: number = 24,
    force: boolean = false,
    dedupeThreshold: number = 0.985,
    staleDays: number = 120
  ): Promise<MemoryMaintenanceAutoRunResult | null> {
    return withRetry(
      async () => {
        const params = new URLSearchParams({
          user_id: userId,
          interval_hours: intervalHours.toString(),
          force: force.toString(),
          dedupe_threshold: dedupeThreshold.toString(),
          stale_days: staleDays.toString(),
        })
        const response = await this.fetchWithTimeout(
          `${this.baseURL}/memory/maintenance/auto-run?${params}`,
          { method: 'POST' }
        )
        if (!response.ok) {
          throw new Error(`Auto-run memory maintenance failed: ${response.statusText}`)
        }
        return response.json()
      },
      this.writeRetryConfig,
      'Auto Run Memory Maintenance'
    )
  }
}
