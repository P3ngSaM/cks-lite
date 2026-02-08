/**
 * Chat Types - 对话相关类型定义
 */

export interface SearchResult {
  title: string
  url: string
  snippet: string
}

export interface ToolCallInfo {
  tool: string
  input?: Record<string, any>
  status: 'running' | 'success' | 'error' | 'pending_approval' | 'denied'
  message?: string
  data?: Record<string, any>
  requestId?: string
  startedAt?: number
  endedAt?: number
  durationMs?: number
  isDesktopTool?: boolean
  kind?: 'skill' | 'system' | 'desktop' | 'mcp' | 'other'
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  status?: 'sending' | 'sent' | 'error'
  error?: string
  // 搜索相关
  searchResults?: SearchResult[]
  isSearching?: boolean
  // 工具/技能调用
  toolCalls?: ToolCallInfo[]
}

export interface Session {
  id: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
}

export type ExecutionPhase = 'plan' | 'do' | 'verify'

export interface ExecutionFlowState {
  taskId: number | null
  phase: ExecutionPhase
  note: string
  updatedAt: number
}

export interface ChatState {
  currentSessionId: string | null
  sessions: Record<string, Session>
  isStreaming: boolean
  streamingMessageId: string | null
}
