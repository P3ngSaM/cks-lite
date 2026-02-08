/**
 * Agent SDK API Types
 */

// Chat Types
export interface ChatRequest {
  user_id: string
  message: string
  session_id?: string
  use_memory?: boolean
  fast_mode?: boolean
  response_mode?: 'fast' | 'balanced' | 'deep'
  goal_task_id?: number
  preferred_skill?: string
  skill_strict?: boolean
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
  score?: number
  final_score?: number
  vector_score?: number
  text_score?: number
  source?: string
  stale?: boolean
  conflict_status?: string
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

export interface MemorySnippet {
  id: string
  memory_type: string
  importance: number
  created_at: string
  updated_at: string
  score?: number
  preview: string
}

export interface MemorySearchV2Result {
  success: boolean
  snippets?: MemorySnippet[]
  total?: number
  error?: string
}

export interface MemoryDetailResult {
  success: boolean
  memory?: Memory
  error?: string
}

export interface MemoryListResult {
  success: boolean
  memories: Memory[]
  total: number
}

export interface MemoryCompactResult {
  success: boolean
  total_before?: number
  deduplicated?: number
  pruned_stale?: number
  total_after?: number
  dry_run?: boolean
  error?: string
}

export interface MemoryConflictResolveResult {
  success: boolean
  updated?: number
  action?: string
  message?: string
  error?: string
}

export interface MemoryMaintenanceReport {
  total_memories: number
  pending_conflicts: number
  stale_memories: number
  dedupe_candidates: number
  stale_prune_candidates: number
  dedupe_threshold: number
  stale_days: number
  generated_at: string
}

export interface MemoryMaintenanceReportResult {
  success: boolean
  report?: MemoryMaintenanceReport
  error?: string
}

export interface MemoryConflictListResult {
  success: boolean
  conflicts?: Memory[]
  total?: number
  error?: string
}

export interface MemoryMaintenanceAutoRunResult {
  success: boolean
  ran?: boolean
  reason?: string
  interval_hours?: number
  last_run_at?: string
  next_run_at?: string
  deduplicated?: number
  pruned_stale?: number
  total_before?: number
  total_after?: number
  error?: string
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
  tools?: string[]
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
  snapshot?: {
    version: number
    skills_count: number
    tools_count: number
  }
}

export interface SkillsSnapshotResult {
  success: boolean
  changed?: boolean
  snapshot?: {
    version: number
    skills_count: number
    tools_count: number
  }
  error?: string
}

export interface ExecutionApprovalRecord {
  id: string
  source: string
  organization_id?: string
  tool_name: string
  risk_level: 'low' | 'medium' | 'high' | string
  status: 'pending' | 'approved' | 'denied' | 'expired' | string
  payload?: Record<string, any>
  created_at?: string
  updated_at?: string
  expires_at?: string | null
  decided_by?: string | null
  decision_note?: string | null
}

export interface ExecutionApprovalCreateResult {
  success: boolean
  record?: ExecutionApprovalRecord
  error?: string
}

export interface ExecutionApprovalListResult {
  success: boolean
  items?: ExecutionApprovalRecord[]
  total?: number
  error?: string
}

export interface FeishuConfig {
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
}

export interface FeishuConfigResult {
  success: boolean
  config?: FeishuConfig
  configured?: boolean
  error?: string
}

export interface FeishuConfigTestResult {
  success: boolean
  token_ok?: boolean
  probe?: {
    success?: boolean
    status_code?: number
    error?: string
    data?: any
  }
  error?: string
}

export interface FeishuDiagnosticCheck {
  id: string
  title: string
  status: 'pass' | 'warn' | 'fail'
  detail: string
  action?: string
}

export interface FeishuDiagnoseResult {
  success: boolean
  configured?: boolean
  probe_ok?: boolean
  checks?: FeishuDiagnosticCheck[]
  callback_urls?: {
    events: string
    inbound: string
    outbound: string
  }
  error?: string
}

export interface ChannelTask {
  id: number
  channel: string
  sender_id: string
  chat_id: string
  message: string
  status: string
  metadata?: Record<string, any>
  result?: Record<string, any>
  created_at?: string
  updated_at?: string
}

export interface ChannelTaskResult {
  success: boolean
  task?: ChannelTask
  error?: string
}

export interface ChannelTaskListResult {
  success: boolean
  tasks?: ChannelTask[]
  total?: number
  error?: string
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
  department?: string
  status: string
  progress: number
  review_status?: string
  review_note?: string
  reviewed_by?: string
  reviewed_at?: string
  handoff_status?: 'none' | 'pending' | 'claimed' | 'resolved' | string
  handoff_owner?: string
  handoff_note?: string
  handoff_at?: string
  handoff_resolved_at?: string
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

export interface GoalTaskExecutionState {
  task_id: number
  phase: 'plan' | 'do' | 'verify'
  status: 'idle' | 'active' | 'blocked' | 'done'
  note: string
  last_prompt: string
  resumed_count: number
  created_at: string
  updated_at: string
}

export interface GoalTaskExecutionResult {
  success: boolean
  data?: GoalTaskExecutionState
  resume_prompt?: string
  error?: string
}

export interface GoalsDashboardSummary {
  total_tasks: number
  pending_review: number
  in_progress: number
  accepted: number
  rejected: number
}

export interface GoalsDashboardOwnerRow {
  assignee: string
  department?: string
  departments?: string[]
  total_tasks: number
  in_progress: number
  pending_review: number
  accepted: number
  rejected: number
  avg_progress: number
  completion_rate: number
  latest_updated_at: string
  next_task_id?: number | null
  project_titles?: string[]
  okr_titles?: string[]
  kpi_titles?: string[]
}

export interface GoalsDashboardResult {
  success: boolean
  summary?: GoalsDashboardSummary
  owners?: GoalsDashboardOwnerRow[]
  total_owners?: number
  total_tasks?: number
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
