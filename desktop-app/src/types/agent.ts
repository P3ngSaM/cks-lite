/**
 * Agent SDK API Types
 */

// Chat Types
export interface ChatRequest {
  user_id: string
  message: string
  session_id?: string
  use_memory?: boolean
  goal_task_id?: number
}

export interface ChatResponse {
  message: string
  tool_calls: ToolCall[]
  memory_used: Memory[]
}

export interface ToolCall {
  name: string
  arguments: Record<string, any>
  result?: string
}

// Memory Types
export interface Memory {
  id: string
  user_id: string
  content: string
  memory_type: string
  created_at: string
  importance?: number
  access_count?: number
  metadata?: Record<string, any>
}

export interface MemoryRequest {
  user_id: string
  content: string
  memory_type: string
  metadata?: Record<string, any>
}

export interface MemorySearchResult {
  success: boolean
  memories: Memory[]
}

export interface MemoryListResult {
  success: boolean
  memories: Memory[]
  total: number
}

// Skill Types
export interface Skill {
  name: string
  display_name: string
  description: string
  category: string
  tags: string[]
  trigger_keywords: string[]
  has_skill: boolean
  has_app: boolean
  is_hybrid: boolean
  has_tools?: boolean
  project_type?: string
  env_vars?: Array<{ name: string; required: boolean; description?: string }>
  enabled?: boolean  // Local UI state for enable/disable toggle
  source?: 'pre-installed' | 'user-installed'
  source_url?: string
}

export interface SkillInstallResult {
  success: boolean
  skill_name?: string
  error?: string
}

export type SkillReadinessStatus =
  | 'ready'
  | 'missing_dependency'
  | 'blocked_by_policy'
  | 'runtime_error'

export interface SkillReadinessCheck {
  name: string
  ok: boolean
  detail: string
}

export interface SkillReadiness {
  name: string
  display_name: string
  source: 'pre-installed' | 'user-installed' | string
  status: SkillReadinessStatus
  message: string
  required_tools: string[]
  runtime_checks: SkillReadinessCheck[]
}

export interface SkillsResult {
  success: boolean
  skills: Skill[]
}

export interface SkillDetailResult {
  success: boolean
  skill?: Skill
  error?: string
}

export interface SkillReadinessResult {
  success: boolean
  readiness?: SkillReadiness[]
  total?: number
  error?: string
}

export interface SkillSmokeTestCheck {
  name: string
  ok: boolean
  detail: string
}

export interface SkillSmokeTestItem {
  success: boolean
  skill_name: string
  status: SkillReadinessStatus | string
  message: string
  checks: SkillSmokeTestCheck[]
}

export interface SkillSmokeTestResult {
  success: boolean
  results?: SkillSmokeTestItem[]
  summary?: {
    total: number
    passed: number
    failed: number
  }
  error?: string
}

export interface AuditRecord {
  timestamp: string
  session_id?: string
  user_input?: string
  tool_name?: string
  tool_input?: Record<string, any>
  success?: boolean
  message?: string
  data?: any
  error?: string
  [key: string]: any
}

export interface AuditRecordsResult {
  success: boolean
  records?: AuditRecord[]
  total?: number
  error?: string
}

export interface SkillContextResult {
  success: boolean
  context?: string
  error?: string
}

// Goals Types
export interface GoalTask {
  id: number
  project_id: number
  title: string
  description: string
  assignee: string
  status: string
  progress: number
  created_at: string
  updated_at: string
}

export interface GoalTaskListItem extends GoalTask {
  project_title: string
  okr_title: string
  kpi_title: string
}

export interface GoalProject {
  id: number
  okr_id: number
  title: string
  description: string
  status: string
  progress: number
  created_at: string
  updated_at: string
  tasks: GoalTask[]
}

export interface GoalOKR {
  id: number
  kpi_id: number
  title: string
  description: string
  status: string
  progress: number
  created_at: string
  updated_at: string
  projects: GoalProject[]
}

export interface GoalKPI {
  id: number
  title: string
  description: string
  status: string
  progress: number
  created_at: string
  updated_at: string
  okrs: GoalOKR[]
}

export interface GoalsTree {
  kpis: GoalKPI[]
  total_kpis: number
}

export interface GoalsTreeResult {
  success: boolean
  data?: GoalsTree
  error?: string
}

export interface GoalCreateResult {
  success: boolean
  id?: number
  error?: string
}

export interface GoalActionResult {
  success: boolean
  error?: string
}

export interface GoalTaskListResult {
  success: boolean
  tasks?: GoalTaskListItem[]
  total?: number
  error?: string
}

// Tool Types
export interface Tool {
  name: string
  description: string
  input_schema: {
    type: string
    properties: Record<string, any>
    required: string[]
  }
}

export interface ToolsResult {
  success: boolean
  tools: Tool[]
}

export interface ToolExecuteResult {
  success: boolean
  content?: string
  message?: string
  error?: string
}

// Health Check
export interface HealthStatus {
  status: string
  service: string
  version: string
  skills_count: number
}

// Web Search Types
export interface SearchResult {
  title: string
  url: string
  snippet: string
  content?: string
}

export interface SearchResponse {
  success: boolean
  results: SearchResult[]
  provider: string
  error?: string
}
