/**
 * Agent SDK API Types
 */

// Chat Types
export interface ChatRequest {
  user_id: string
  message: string
  session_id?: string
  use_memory?: boolean
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

export interface SkillsResult {
  success: boolean
  skills: Skill[]
}

export interface SkillDetailResult {
  success: boolean
  skill?: Skill
  error?: string
}

export interface SkillContextResult {
  success: boolean
  context?: string
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
