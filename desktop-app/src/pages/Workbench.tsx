import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChatHistorySidebar } from '@/components/layout/ChatHistorySidebar'
import { MessageList, ChatInput } from '@/components/chat'
import { PermissionApprovalDialog } from '@/components/chat/PermissionApprovalDialog'
import { open as openShellTarget } from '@tauri-apps/plugin-shell'
import { AgentService } from '@/services/agentService'
import { classifyRisk, describeToolRequest, executeDesktopTool } from '@/services/desktopToolBridge'
import { useChatStore, useUserStore, usePermissionStore, waitForPermissionDecision, resolvePermissionDecision } from '@/stores'
import { localizeSkill } from '@/utils/skillI18n'
import type { Message, SearchResult, ToolCallInfo } from '@/types/chat'
import type { ExecutionApprovalRecord, Skill } from '@/types/agent'
// Generate unique ID
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
// Desktop tool names that require permission bridging
const DESKTOP_TOOL_NAMES = new Set([
  'run_command',
  'read_file',
  'list_directory',
  'write_file',
  'get_file_info',
  'delete_file',
  'get_platform_info',
  'open_application',
  'type_text',
  'press_hotkey',
  'send_feishu_message',
  'send_desktop_message',
  'capture_screen',
  'mouse_move',
  'mouse_click',
  'mouse_scroll',
])
const SYSTEM_TOOL_NAMES = new Set(['web_search', 'save_memory', 'find_skills', 'find-skills', 'analyze_screen', 'visual_next_action'])
const resolveToolKind = (tool: string): ToolCallInfo['kind'] => {
  if (DESKTOP_TOOL_NAMES.has(tool)) return 'desktop'
  if (tool.startsWith('mcp__') || tool.startsWith('mcp_')) return 'mcp'
  if (SYSTEM_TOOL_NAMES.has(tool)) return 'system'
  if (tool.includes('skill') || tool.includes('skills')) return 'skill'
  return 'other'
}

const toolNameLabelMap: Record<string, string> = {
  web_search: '\u8054\u7f51\u641c\u7d22',
  save_memory: '\u4fdd\u5b58\u8bb0\u5fc6',
  skills_snapshot: '\u6280\u80fd\u5feb\u7167',
  skill_match: '\u6280\u80fd\u5339\u914d',
  memory_recall: '\u8bb0\u5fc6\u53ec\u56de',
  memory_flush: '\u8bb0\u5fc6\u9884\u5904\u7406',
  find_skills: '\u67e5\u627e\u6280\u80fd',
  'find-skills': '\u67e5\u627e\u6280\u80fd',
  run_command: '\u6267\u884c\u547d\u4ee4',
  read_file: '\u8bfb\u53d6\u6587\u4ef6',
  write_file: '\u5199\u5165\u6587\u4ef6',
  list_directory: '\u5217\u51fa\u76ee\u5f55',
  get_file_info: '\u6587\u4ef6\u4fe1\u606f',
  delete_file: '\u5220\u9664\u6587\u4ef6',
  get_platform_info: '系统平台信息',
  open_application: '打开应用',
  type_text: '输入文本',
  press_hotkey: '发送快捷键',
  send_feishu_message: '飞书发送消息',
  send_desktop_message: '桌面IM发送消息',
  capture_screen: '屏幕截图',
  mouse_move: '移动鼠标',
  mouse_click: '鼠标点击',
  mouse_scroll: '滚动页面',
  analyze_screen: '视觉分析',
  visual_next_action: '视觉下一步规划',
  demo_prepare_ppt_and_email: '\u751f\u6210PPT\u4e0e\u90ae\u4ef6',
  demo_organize_files: '\u6574\u7406\u6587\u4ef6',
  demo_summarize_folder: '\u6587\u6863\u603b\u7ed3',
}

const formatToolLabel = (tool: string): string => toolNameLabelMap[tool] || tool
const formatTimelineValue = (value: unknown): string => {
  if (value == null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
const clampProgress = (value: number) => Math.max(0, Math.min(100, value))
const collectStrings = (value: unknown, bucket: string[] = []): string[] => {
  if (typeof value === 'string') {
    bucket.push(value)
    return bucket
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, bucket)
    return bucket
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectStrings(item, bucket)
    }
  }
  return bucket
}
type CommanderDeliverable = {
  type: 'file' | 'link'
  target: string
  label: string
}
const formatLocalDateTime = (ts: number): string => {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
const formatDurationMs = (ms: number): string => {
  if (!Number.isFinite(ms) || ms <= 0) return '0ms'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}
const formatAuditTime = (value?: string | null): string => {
  if (!value) return '-'
  const t = Date.parse(value)
  if (!Number.isFinite(t)) return value
  return formatLocalDateTime(t)
}
const shouldRequireApproval = (
  risk: 'low' | 'medium' | 'high',
  policy: 'always' | 'high-only' | 'never'
): boolean => {
  if (policy === 'never') return false
  if (policy === 'high-only') return risk === 'high'
  return risk === 'medium' || risk === 'high'
}
const approvalStatusLabel: Record<string, string> = {
  pending: '待处理',
  approved: '已批准',
  denied: '已拒绝',
  expired: '已过期',
}
const getCurrentOrganizationId = (sessionOrganizationId?: string | null): string => {
  const sessionOrg = (sessionOrganizationId || '').trim()
  if (sessionOrg) return sessionOrg
  const goalsOrg = localStorage.getItem('cks.goals.organizationId')?.trim()
  if (goalsOrg) return goalsOrg
  const boardOrg = localStorage.getItem('cks.board.organizationId')?.trim()
  if (boardOrg) return boardOrg
  return 'default-org'
}
const sanitizeCsvCell = (value: unknown): string => {
  const text = String(value ?? '').replace(/\r?\n/g, ' ')
  if (/^[=+\-@]/.test(text)) return `'${text}`
  return text
}
const approvalPolicyLabel: Record<'always' | 'high-only' | 'never', string> = {
  always: '中高风险审批',
  'high-only': '仅高风险审批',
  never: '仅审计不拦截',
}
const TOOL_POLICY_DEFAULT: Record<string, 'inherit' | 'always' | 'high-only' | 'never'> = {
  run_command: 'always',
  write_file: 'always',
  delete_file: 'always',
  read_file: 'inherit',
  list_directory: 'inherit',
  get_file_info: 'inherit',
  get_platform_info: 'inherit',
  open_application: 'always',
  type_text: 'always',
  press_hotkey: 'always',
  send_feishu_message: 'always',
  send_desktop_message: 'always',
  capture_screen: 'always',
  mouse_move: 'always',
  mouse_click: 'always',
  mouse_scroll: 'always',
}
// Extract name from user message
const extractName = (message: string): string | null => {
  const patterns = [
    /(?:\u6211\u53eb|\u53eb\u6211|\u6211\u7684\u540d\u5b57\u662f|\u6211\u662f)\s*([^\s\uff0c\u3002\uff01\uff1f,.!?]+)/,
    /^([^\s\uff0c\u3002\uff01\uff1f,.!?]+)$/
  ]
  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match) {
      return match[1].trim()
    }
  }
  return null
}
export const Workbench = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const currentSessionId = useChatStore((state) => state.currentSessionId)
  const sessions = useChatStore((state) => state.sessions)
  const sessionGoalTaskMap = useChatStore((state) => state.sessionGoalTaskMap)
  const sessionOrganizationMap = useChatStore((state) => state.sessionOrganizationMap)
  const isStreaming = useChatStore((state) => state.isStreaming)
  const addMessage = useChatStore((state) => state.addMessage)
  const updateMessage = useChatStore((state) => state.updateMessage)
  const setStreaming = useChatStore((state) => state.setStreaming)
  const createSession = useChatStore((state) => state.createSession)
  const profile = useUserStore((state) => state.profile)
  const hasUserName = useUserStore((state) => state.hasUserName)
  const setUserName = useUserStore((state) => state.setUserName)
  const permissionRequests = usePermissionStore((state) => state.pendingRequests)
  const addPermissionRequest = usePermissionStore((state) => state.addRequest)
  const setAutoApproveAll = usePermissionStore((state) => state.setAutoApproveAll)
  const [approvalPolicy, setApprovalPolicy] = useState<'always' | 'high-only' | 'never'>('always')
  const [pendingApprovals, setPendingApprovals] = useState<ExecutionApprovalRecord[]>([])
  const [approvalHistory, setApprovalHistory] = useState<ExecutionApprovalRecord[]>([])
  const [approvalPanelExpanded, setApprovalPanelExpanded] = useState(false)
  const [approvalScope, setApprovalScope] = useState<'org' | 'session'>('org')
  const [approvalError, setApprovalError] = useState<string | null>(null)
  const [approvalBusyId, setApprovalBusyId] = useState<string | null>(null)
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'all' | 'approved' | 'denied' | 'expired'>('all')
  const [historyToolFilter, setHistoryToolFilter] = useState('all')
  const [historyDeciderFilter, setHistoryDeciderFilter] = useState('')
  const [toolPolicyMap, setToolPolicyMap] = useState<Record<string, 'inherit' | 'always' | 'high-only' | 'never'>>({
    ...TOOL_POLICY_DEFAULT,
  })
  const approvalToLocalRequestMapRef = useRef<Map<string, string>>(new Map())
  const activeGoalTaskId = currentSessionId ? (sessionGoalTaskMap[currentSessionId] ?? null) : null
  const activeSessionOrganizationId = currentSessionId ? (sessionOrganizationMap[currentSessionId] ?? null) : null
  const [activeTimelineIndex, setActiveTimelineIndex] = useState<number>(-1)
  const [timelineExpanded, setTimelineExpanded] = useState(false)
  const [streamStartedAt, setStreamStartedAt] = useState<number | null>(null)
  const [streamElapsedSec, setStreamElapsedSec] = useState(0)
  const [lastRunDurationSec, setLastRunDurationSec] = useState(0)
  const [openDeliverableError, setOpenDeliverableError] = useState<string | null>(null)
  const [topPanelsCollapsed, setTopPanelsCollapsed] = useState(true)
  const [auditWritebackState, setAuditWritebackState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle')
  const [auditWritebackMessage, setAuditWritebackMessage] = useState('')
  const [lastRunMetrics, setLastRunMetrics] = useState<{
    responseMode: 'fast' | 'balanced' | 'deep'
    firstTokenMs: number | null
    firstToolMs: number | null
    toolTotalMs: number
    toolCompleted: number
  }>({
    responseMode: 'fast',
    firstTokenMs: null,
    firstToolMs: null,
    toolTotalMs: 0,
    toolCompleted: 0,
  })
  const [availableSkills, setAvailableSkills] = useState<Skill[]>([])
  const [commanderMode, setCommanderMode] = useState(true)
  const [responseMode, setResponseMode] = useState<'fast' | 'balanced' | 'deep'>('fast')
  const [preferredSkill, setPreferredSkill] = useState('')
  const [skillStrict, setSkillStrict] = useState(false)
  const [skillPolicyError, setSkillPolicyError] = useState<string | null>(null)
  const [timelineSkillFilter, setTimelineSkillFilter] = useState('')
  const [linkedChannelTaskId, setLinkedChannelTaskId] = useState<number | null>(null)
  const [timelineLinkedOnly, setTimelineLinkedOnly] = useState(false)
  const routeTaskHandledRef = useRef<string>('')
  const [streamPhase, setStreamPhase] = useState<{ label: string; progress: number }>({
    label: '\u51c6\u5907\u4e2d',
    progress: 5,
  })
  // 响应式获取当前会话的消息
  const messages = useMemo(() => {
    if (!currentSessionId || !sessions[currentSessionId]) return []
    return sessions[currentSessionId].messages
  }, [currentSessionId, sessions])
  // Create initial session and ask for user name if needed
  useEffect(() => {
    if (!currentSessionId) {
      createSession('\u65b0\u5bf9\u8bdd')
    }
    // Check if we need to ask for user name
    if (currentSessionId && messages.length === 0 && profile && !hasUserName()) {
      // Add greeting message from AI
      const greetingMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: `\u4f60\u597d\uff0c\u6211\u662f ${profile.agentName}\uff0c\u53ef\u4ee5\u5148\u544a\u8bc9\u6211\u4f60\u7684\u540d\u5b57\u5417\uff1f`,
        timestamp: Date.now(),
        status: 'sent'
      }
      addMessage(greetingMessage)
    }
  }, []) // Only run once on mount
  useEffect(() => {
    let cancelled = false
    const loadSkills = async () => {
      try {
        const result = await AgentService.listSkills()
        if (!cancelled && result?.success && Array.isArray(result.skills)) {
          setAvailableSkills(
            result.skills
              .filter((skill) => skill.has_skill || skill.has_tools)
              .map((skill) => localizeSkill(skill))
          )
        }
      } catch (error) {
        console.warn('Failed to load skills in workbench:', error)
      }
    }
    loadSkills()
    return () => {
      cancelled = true
    }
  }, [])
  useEffect(() => {
    const commander = localStorage.getItem('cks.workbench.commanderMode')
    const storedMode = localStorage.getItem('cks.workbench.responseMode')
    const fast = localStorage.getItem('cks.workbench.fastMode')
    const preferred = localStorage.getItem('cks.workbench.preferredSkill')
    const strict = localStorage.getItem('cks.workbench.skillStrict')
    const storedApprovalPolicy = localStorage.getItem('cks.workbench.approvalPolicy')
    const storedToolPolicyMap = localStorage.getItem('cks.workbench.toolApprovalPolicy')
    const storedApprovalScope = localStorage.getItem('cks.workbench.approvalScope')
    const storedTopPanelsCollapsed = localStorage.getItem('cks.workbench.topPanelsCollapsed')
    const seedPrompt = localStorage.getItem('cks.workbench.seedPrompt')
    if (commander) {
      setCommanderMode(commander === '1')
    }
    if (storedMode === 'fast' || storedMode === 'balanced' || storedMode === 'deep') {
      setResponseMode(storedMode)
    } else if (fast) {
      setResponseMode(fast === '1' ? 'fast' : 'balanced')
    }
    if (preferred) {
      setPreferredSkill(preferred)
      setCommanderMode(false)
      localStorage.removeItem('cks.workbench.preferredSkill')
    }
    if (strict) {
      setSkillStrict(strict === '1')
      localStorage.removeItem('cks.workbench.skillStrict')
    }
    if (
      storedApprovalPolicy === 'always' ||
      storedApprovalPolicy === 'high-only' ||
      storedApprovalPolicy === 'never'
    ) {
      setApprovalPolicy(storedApprovalPolicy)
    }
    if (storedApprovalScope === 'org' || storedApprovalScope === 'session') {
      setApprovalScope(storedApprovalScope)
    }
    if (storedTopPanelsCollapsed === '1' || storedTopPanelsCollapsed === '0') {
      setTopPanelsCollapsed(storedTopPanelsCollapsed === '1')
    }
    if (storedToolPolicyMap) {
      try {
        const parsed = JSON.parse(storedToolPolicyMap)
        if (parsed && typeof parsed === 'object') {
          setToolPolicyMap((prev) => ({ ...prev, ...(parsed as Record<string, 'inherit' | 'always' | 'high-only' | 'never'>) }))
        }
      } catch {
        // Ignore invalid local cache.
      }
    }
    if (seedPrompt && currentSessionId) {
      const tipMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: `已为你设置工作台技能优先模式。\n${seedPrompt}`,
        timestamp: Date.now(),
        status: 'sent',
      }
      addMessage(tipMessage)
      localStorage.removeItem('cks.workbench.seedPrompt')
    }
  }, [currentSessionId, addMessage])
  useEffect(() => {
    localStorage.setItem('cks.workbench.commanderMode', commanderMode ? '1' : '0')
  }, [commanderMode])
  useEffect(() => {
    localStorage.setItem('cks.workbench.responseMode', responseMode)
    localStorage.setItem('cks.workbench.fastMode', responseMode === 'fast' ? '1' : '0')
  }, [responseMode])
  useEffect(() => {
    localStorage.setItem('cks.workbench.approvalPolicy', approvalPolicy)
  }, [approvalPolicy])
  useEffect(() => {
    localStorage.setItem('cks.workbench.approvalScope', approvalScope)
  }, [approvalScope])
  useEffect(() => {
    localStorage.setItem('cks.workbench.toolApprovalPolicy', JSON.stringify(toolPolicyMap))
  }, [toolPolicyMap])
  useEffect(() => {
    localStorage.setItem('cks.workbench.topPanelsCollapsed', topPanelsCollapsed ? '1' : '0')
  }, [topPanelsCollapsed])
  useEffect(() => {
    if (!isStreaming || !streamStartedAt) {
      setStreamElapsedSec(0)
      return
    }
    const tick = () => setStreamElapsedSec(Math.max(0, Math.floor((Date.now() - streamStartedAt) / 1000)))
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [isStreaming, streamStartedAt])
  const refreshPendingApprovals = useCallback(async () => {
    const organizationId = getCurrentOrganizationId(activeSessionOrganizationId)
    const sessionIdFilter = approvalScope === 'session' ? (currentSessionId || undefined) : undefined
    try {
      const [pendingResult, historyResult] = await Promise.all([
        AgentService.listExecutionApprovals('pending', 50, organizationId, sessionIdFilter),
        AgentService.listExecutionApprovals(undefined, 80, organizationId, sessionIdFilter),
      ])
      if (pendingResult?.success && historyResult?.success) {
        const all = historyResult.items || []
        setPendingApprovals(pendingResult.items || [])
        setApprovalHistory(
          all
            .filter((item) => item.status !== 'pending')
            .sort((a, b) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || ''))
            .slice(0, 10)
        )
        setApprovalError(null)
      } else {
        setApprovalError(pendingResult?.error || historyResult?.error || '审批数据拉取失败')
      }
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : String(error))
    }
  }, [activeSessionOrganizationId, approvalScope, currentSessionId])
  useEffect(() => {
    refreshPendingApprovals()
    const timer = window.setInterval(() => {
      refreshPendingApprovals()
    }, 10000)
    return () => window.clearInterval(timer)
  }, [refreshPendingApprovals])
  useEffect(() => {
    const openApprovalCenter = localStorage.getItem('cks.workbench.openApprovalCenter')
    if (openApprovalCenter === '1') {
      setApprovalPanelExpanded(true)
      refreshPendingApprovals()
      localStorage.removeItem('cks.workbench.openApprovalCenter')
    }
  }, [refreshPendingApprovals])
  const handleApprovalDecision = useCallback(async (
    requestId: string,
    approved: boolean,
    decidedBy = 'workbench-user'
  ) => {
    setApprovalBusyId(requestId)
    try {
      await AgentService.decideExecutionApproval(requestId, {
        decision: approved ? 'approved' : 'denied',
        decided_by: decidedBy,
        note: approved ? '工作台人工批准' : '工作台人工拒绝',
      })
      const localRequestId = approvalToLocalRequestMapRef.current.get(requestId)
      if (localRequestId) {
        resolvePermissionDecision(localRequestId, approved)
        approvalToLocalRequestMapRef.current.delete(requestId)
      }
      await refreshPendingApprovals()
      setApprovalError(null)
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : String(error))
    } finally {
      setApprovalBusyId(null)
    }
  }, [refreshPendingApprovals])
  const resolveApprovalPolicyForTool = useCallback((tool: string): 'always' | 'high-only' | 'never' => {
    const override = toolPolicyMap[tool] || 'inherit'
    if (override === 'inherit') return approvalPolicy
    return override
  }, [approvalPolicy, toolPolicyMap])
  const handleSendMessage = useCallback(async (content: string) => {
    // Reset auto-approve for each new user message
    setAutoApproveAll(false)
    setSkillPolicyError(null)
    setTimelineExpanded(false)
    setAuditWritebackState('idle')
    setAuditWritebackMessage('')
    setLastRunMetrics({
      responseMode,
      firstTokenMs: null,
      firstToolMs: null,
      toolTotalMs: 0,
      toolCompleted: 0,
    })
    // Check if user is telling their name (for first conversation)
    if (!hasUserName()) {
      const extractedName = extractName(content)
      if (extractedName) {
        // Save user name to memory
        try {
          await AgentService.saveMemory({
            user_id: 'default-user',
            content: `\u7528\u6237\u540d\u5b57\u662f ${extractedName}`,
            memory_type: 'user_info'
          })
          // Also save to local store
          setUserName(extractedName)
        } catch (error) {
          console.error('Failed to save user name:', error)
        }
      }
    }
    // Add user message
    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: Date.now(),
      status: 'sent'
    }
    addMessage(userMessage)
    // Create assistant message placeholder
    const assistantMessageId = generateId()
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '\u6536\u5230\uff0c\u6b63\u5728\u5904\u7406...',
      timestamp: Date.now(),
      status: 'sending'
    }
    addMessage(assistantMessage)
    const runStartedAt = Date.now()
    setStreamStartedAt(runStartedAt)
    setStreamPhase({ label: '\u5df2\u53d1\u9001\u8bf7\u6c42\uff0c\u6b63\u5728\u521d\u59cb\u5316', progress: 8 })
    setStreaming(true, assistantMessageId)
    try {
      // Stream response from Agent SDK
      let accumulatedContent = ''
      let currentSearchResults: SearchResult[] = []
      let currentToolCalls: ToolCallInfo[] = []
      let firstTokenMs: number | null = null
      let firstToolMs: number | null = null
      for await (const chunk of AgentService.chatStream({
        user_id: 'default-user',
        message: content,
        session_id: currentSessionId || 'default',
        use_memory: responseMode !== 'fast',
        fast_mode: responseMode === 'fast',
        response_mode: responseMode,
        goal_task_id: activeGoalTaskId || undefined,
        preferred_skill: commanderMode ? undefined : (preferredSkill || undefined),
        skill_strict: commanderMode ? false : skillStrict,
      })) {
        // Handle different chunk types based on type field
        // Only throw for fatal errors, not for search_error which is recoverable
        if (chunk.error && chunk.type !== 'search_error' && chunk.type !== 'tool_result') {
          throw new Error(chunk.error)
        }
        if (chunk.type === 'text' && chunk.content) {
          if (firstTokenMs == null) {
            firstTokenMs = Math.max(0, Date.now() - runStartedAt)
            setLastRunMetrics((prev) => ({ ...prev, firstTokenMs }))
          }
          setStreamPhase((prev) => ({
            label: '\u6b63\u5728\u751f\u6210\u56de\u7b54',
            progress: clampProgress(Math.max(prev.progress, 82)),
          }))
          // Streaming text content
          accumulatedContent += chunk.content
          // Update message content in real-time
          updateMessage(assistantMessageId, {
            content: accumulatedContent,
            status: 'sending',
            isSearching: false,
            searchResults: currentSearchResults.length > 0 ? currentSearchResults : undefined,
            toolCalls: currentToolCalls.length > 0 ? [...currentToolCalls] : undefined
          })
        } else if (chunk.type === 'tool_start') {
          if (firstToolMs == null) {
            firstToolMs = Math.max(0, Date.now() - runStartedAt)
            setLastRunMetrics((prev) => ({ ...prev, firstToolMs }))
          }
          setStreamPhase((prev) => ({
            label: `\u6b63\u5728\u6267\u884c\uff1a${formatToolLabel(chunk.tool)}`,
            progress: clampProgress(Math.max(prev.progress, 55)),
          }))
          // Tool/skill execution started
          const isDesktop = DESKTOP_TOOL_NAMES.has(chunk.tool)
          currentToolCalls.push({
            tool: chunk.tool,
            input: chunk.input,
            status: 'running',
            startedAt: Date.now(),
            isDesktopTool: isDesktop,
            kind: resolveToolKind(chunk.tool),
          })
          updateMessage(assistantMessageId, {
            content: accumulatedContent,
            status: 'sending',
            toolCalls: [...currentToolCalls]
          })
        } else if (chunk.type === 'desktop_tool_request') {
          setStreamPhase((prev) => ({
            label: `\u684c\u9762\u5de5\u5177\u5f85\u5904\u7406\uff1a${formatToolLabel(chunk.tool as string)}`,
            progress: clampProgress(Math.max(prev.progress, 60)),
          }))
          // Desktop tool request — needs user permission
          const requestId = chunk.request_id as string
          const tool = chunk.tool as string
          const input = chunk.input as Record<string, any>
          const riskLevel = classifyRisk(tool, input)
          const isAutoApprove = usePermissionStore.getState().autoApproveAll
          const effectivePolicy = resolveApprovalPolicyForTool(tool)
          const requireApproval = !isAutoApprove && shouldRequireApproval(riskLevel, effectivePolicy)
          let approvalRequestId: string | undefined
          // Update existing tool call status
          const initialStatus = requireApproval ? 'pending_approval' : 'running'
          const idx = currentToolCalls.findIndex(
            (tc) => tc.tool === tool && tc.status === 'running'
          )
          if (idx !== -1) {
            currentToolCalls[idx] = {
              ...currentToolCalls[idx],
              status: initialStatus,
              requestId,
              isDesktopTool: true,
            }
          } else {
            currentToolCalls.push({
              tool,
              input,
              status: initialStatus,
              requestId,
              startedAt: Date.now(),
              isDesktopTool: true,
              kind: 'desktop',
            })
          }
          updateMessage(assistantMessageId, {
            content: accumulatedContent,
            status: 'sending',
            toolCalls: [...currentToolCalls]
          })
          // Check auto-approve or show dialog
          let decision: { approved: boolean }
          if (requireApproval) {
            try {
              const approvalResult = await AgentService.createExecutionApproval({
                source: 'workbench-desktop-tool',
                tool_name: tool,
                risk_level: riskLevel,
                organization_id: getCurrentOrganizationId(activeSessionOrganizationId),
                payload: {
                  desktop_request_id: requestId,
                  session_id: currentSessionId || '',
                  goal_task_id: activeGoalTaskId || undefined,
                  organization_id: getCurrentOrganizationId(activeSessionOrganizationId),
                  input,
                },
                ttl_seconds: 600,
              })
              if (approvalResult?.success && approvalResult.record?.id) {
                approvalRequestId = approvalResult.record.id
                approvalToLocalRequestMapRef.current.set(approvalRequestId, requestId)
                await refreshPendingApprovals()
              }
            } catch (error) {
              setApprovalError(error instanceof Error ? error.message : String(error))
            }
            // Show permission dialog and wait for user decision
            addPermissionRequest({
              id: requestId,
              approval_request_id: approvalRequestId,
              tool,
              input,
              description: describeToolRequest(tool, input),
              risk_level: riskLevel,
              timestamp: Date.now(),
            })
            decision = await waitForPermissionDecision(requestId)
            if (approvalRequestId && approvalToLocalRequestMapRef.current.has(approvalRequestId)) {
              try {
                await AgentService.decideExecutionApproval(approvalRequestId, {
                  decision: decision.approved ? 'approved' : 'denied',
                  decided_by: 'workbench-dialog',
                  note: decision.approved ? '用户在工作台弹窗批准' : '用户在工作台弹窗拒绝',
                })
                approvalToLocalRequestMapRef.current.delete(approvalRequestId)
                await refreshPendingApprovals()
              } catch (error) {
                setApprovalError(error instanceof Error ? error.message : String(error))
              }
            }
          } else {
            // Auto-approve: skip dialog
            decision = { approved: true }
          }
          let toolResult: { success: boolean; content: string; error?: string }
          if (decision.approved) {
            // User approved — execute via Tauri
            toolResult = await executeDesktopTool(tool, input)
            // Update tool call status
            const callIdx = currentToolCalls.findIndex((tc) => tc.requestId === requestId)
            if (callIdx !== -1) {
              const startedAt = currentToolCalls[callIdx].startedAt || Date.now()
              const endedAt = Date.now()
              currentToolCalls[callIdx] = {
                ...currentToolCalls[callIdx],
                status: toolResult.success ? 'success' : 'error',
                endedAt,
                durationMs: Math.max(0, endedAt - startedAt),
                message: toolResult.success ? toolResult.content.slice(0, 200) : toolResult.error,
              }
            }
          } else {
            // User denied
            toolResult = { success: false, content: '', error: '用户拒绝了此操作' }
            const callIdx = currentToolCalls.findIndex((tc) => tc.requestId === requestId)
            if (callIdx !== -1) {
              const startedAt = currentToolCalls[callIdx].startedAt || Date.now()
              const endedAt = Date.now()
              currentToolCalls[callIdx] = {
                ...currentToolCalls[callIdx],
                status: 'denied',
                endedAt,
                durationMs: Math.max(0, endedAt - startedAt),
                message: '用户拒绝了此操作',
              }
            }
          }
          updateMessage(assistantMessageId, {
            content: accumulatedContent,
            status: 'sending',
            toolCalls: [...currentToolCalls]
          })
          // POST result back to Agent SDK so Claude can continue
          await AgentService.submitDesktopToolResult(requestId, toolResult)
        } else if (chunk.type === 'tool_result') {
          setStreamPhase((prev) => ({
            label: chunk.success ? '\u5de5\u5177\u6267\u884c\u5b8c\u6210\uff0c\u7ee7\u7eed\u63a8\u7406' : '\u5de5\u5177\u6267\u884c\u5931\u8d25\uff0c\u5c1d\u8bd5\u7ee7\u7eed',
            progress: clampProgress(Math.max(prev.progress, 72)),
          }))
          // Tool/skill execution completed
          const idx = (() => {
            for (let i = currentToolCalls.length - 1; i >= 0; i -= 1) {
              const tc = currentToolCalls[i]
              if (tc.tool === chunk.tool && tc.status === 'running') return i
            }
            return -1
          })()
          if (idx !== -1) {
            const startedAt = currentToolCalls[idx].startedAt || Date.now()
            const endedAt = Date.now()
            currentToolCalls[idx] = {
              ...currentToolCalls[idx],
              status: chunk.success ? 'success' : 'error',
              endedAt,
              durationMs: Math.max(0, endedAt - startedAt),
              message: chunk.message || chunk.data?.error || '',
              data: chunk.data
            }
          }
          updateMessage(assistantMessageId, {
            content: accumulatedContent,
            status: 'sending',
            toolCalls: [...currentToolCalls]
          })
        } else if (chunk.type === 'skill') {
          const matchedSkills = Array.isArray(chunk.skills) ? chunk.skills : []
          if (matchedSkills.length > 0) {
            currentToolCalls.push({
              tool: 'skill_match',
              status: 'success',
              kind: 'skill',
              message: `已匹配技能：${matchedSkills.join('、')}`,
              data: { skills: matchedSkills },
            })
            updateMessage(assistantMessageId, {
              content: accumulatedContent,
              status: 'sending',
              toolCalls: [...currentToolCalls]
            })
          }
        } else if (chunk.type === 'skill_policy') {
          if (!chunk.success) {
            setSkillPolicyError(chunk.message || '技能策略校验未通过')
            setStreamPhase((prev) => ({
              label: '技能策略阻断，等待调整',
              progress: clampProgress(Math.max(prev.progress, 65)),
            }))
          }
          currentToolCalls.push({
            tool: 'skill_match',
            status: chunk.success ? 'success' : 'error',
            kind: 'skill',
            message: chunk.message || '技能策略校验未通过',
          })
          updateMessage(assistantMessageId, {
            content: accumulatedContent,
            status: 'sending',
            toolCalls: [...currentToolCalls]
          })
        } else if (chunk.type === 'skills_snapshot') {
          setStreamPhase((prev) => ({
            label: '\u6280\u80fd\u5feb\u7167\u5df2\u52a0\u8f7d',
            progress: clampProgress(Math.max(prev.progress, 20)),
          }))
          const snapshotMessage = `\u6280\u80fd\u5feb\u7167 v${chunk.version ?? '-'} (${chunk.skills_count ?? 0}\u4e2a)\u5df2\u52a0\u8f7d${chunk.changed ? '\uff0c\u5df2\u5237\u65b0' : ''}`
          currentToolCalls.push({
            tool: 'skills_snapshot',
            status: 'success',
            kind: 'system',
            message: snapshotMessage
          })
          updateMessage(assistantMessageId, {
            content: accumulatedContent,
            status: 'sending',
            toolCalls: [...currentToolCalls]
          })
        } else if (chunk.type === 'memory') {
          const memories = Array.isArray(chunk.memories) ? chunk.memories : []
          if (memories.length > 0) {
            setStreamPhase((prev) => ({
              label: `已加载 ${memories.length} 条记忆`,
              progress: clampProgress(Math.max(prev.progress, 24)),
            }))
            const summary = memories
              .slice(0, 3)
              .map((m: any) => m?.content || '')
              .filter(Boolean)
              .join('；')
            currentToolCalls.push({
              tool: 'memory_recall',
              status: 'success',
              kind: 'system',
              message: summary ? `记忆命中：${summary}` : `已命中 ${memories.length} 条记忆`,
              data: { count: memories.length },
            })
            updateMessage(assistantMessageId, {
              content: accumulatedContent,
              status: 'sending',
              toolCalls: [...currentToolCalls]
            })
          }
        } else if (chunk.type === 'memory_flush_start') {
          setStreamPhase((prev) => ({
            label: '\u6b63\u5728\u9884\u5904\u7406\u4f1a\u8bdd\u8bb0\u5fc6',
            progress: clampProgress(Math.max(prev.progress, 30)),
          }))
          currentToolCalls.push({
            tool: 'memory_flush',
            status: 'running',
            kind: 'system',
            input: {
              estimated_chars: chunk.estimated_chars,
              threshold: chunk.threshold,
            },
            message: '\u8d85\u957f\u5bf9\u8bdd\u9884\u5904\u7406\u4e2d...'
          })
          updateMessage(assistantMessageId, {
            content: accumulatedContent,
            status: 'sending',
            toolCalls: [...currentToolCalls]
          })
        } else if (chunk.type === 'memory_flush_done') {
          setStreamPhase((prev) => ({
            label: '\u4f1a\u8bdd\u8bb0\u5fc6\u9884\u5904\u7406\u5b8c\u6210',
            progress: clampProgress(Math.max(prev.progress, 42)),
          }))
          const idx = (() => {
            for (let i = currentToolCalls.length - 1; i >= 0; i -= 1) {
              const tc = currentToolCalls[i]
              if (tc.tool === 'memory_flush' && tc.status === 'running') return i
            }
            return -1
          })()
          if (idx !== -1) {
            currentToolCalls[idx] = {
              ...currentToolCalls[idx],
              status: 'success',
              message: `\u9884\u5904\u7406\u5b8c\u6210\uff0c\u65b0\u589e\u8bb0\u5fc6 ${chunk.saved_count ?? 0} \u6761`
            }
          }
          updateMessage(assistantMessageId, {
            content: accumulatedContent,
            status: 'sending',
            toolCalls: [...currentToolCalls]
          })
        } else if (chunk.type === 'memory_flush_error') {
          setStreamPhase((prev) => ({
            label: '\u8bb0\u5fc6\u9884\u5904\u7406\u5931\u8d25\uff0c\u5df2\u8df3\u8fc7',
            progress: clampProgress(Math.max(prev.progress, 42)),
          }))
          const idx = (() => {
            for (let i = currentToolCalls.length - 1; i >= 0; i -= 1) {
              const tc = currentToolCalls[i]
              if (tc.tool === 'memory_flush' && tc.status === 'running') return i
            }
            return -1
          })()
          const errorMessage = chunk.error || '\u9884\u5904\u7406\u5931\u8d25'
          if (idx !== -1) {
            currentToolCalls[idx] = {
              ...currentToolCalls[idx],
              status: 'error',
              message: errorMessage
            }
          } else {
            currentToolCalls.push({
              tool: 'memory_flush',
              status: 'error',
              kind: 'system',
              message: errorMessage
            })
          }
          updateMessage(assistantMessageId, {
            content: accumulatedContent,
            status: 'sending',
            toolCalls: [...currentToolCalls]
          })
        } else if (chunk.type === 'search_start') {
          setStreamPhase((prev) => ({
            label: '\u6b63\u5728\u8054\u7f51\u68c0\u7d22',
            progress: clampProgress(Math.max(prev.progress, 48)),
          }))
          // Web search started - update message to show searching state
          if (!accumulatedContent.trim()) {
            accumulatedContent = '\u6b63\u5728\u641c\u7d22\u6700\u65b0\u4fe1\u606f...'
          }
          updateMessage(assistantMessageId, {
            content: accumulatedContent,
            status: 'sending',
            isSearching: true
          })
        } else if (chunk.type === 'search_done') {
          setStreamPhase((prev) => ({
            label: '\u8054\u7f51\u68c0\u7d22\u5b8c\u6210',
            progress: clampProgress(Math.max(prev.progress, 68)),
          }))
          // Web search completed - store results for the message
          if (chunk.results && chunk.results.length > 0) {
            currentSearchResults = chunk.results
            updateMessage(assistantMessageId, {
              isSearching: false,
              searchResults: currentSearchResults
            })
          } else {
            updateMessage(assistantMessageId, {
              isSearching: false
            })
          }
        } else if (chunk.type === 'search_error') {
          setStreamPhase((prev) => ({
            label: '\u8054\u7f51\u68c0\u7d22\u5f02\u5e38\uff0c\u6539\u4e3a\u65e0\u641c\u7d22\u7ee7\u7eed',
            progress: clampProgress(Math.max(prev.progress, 68)),
          }))
          // Web search error - don't stop, just log and continue
          updateMessage(assistantMessageId, {
            isSearching: false
          })
          console.warn('Search error (continuing without search results):', chunk.error)
        } else if (chunk.type === 'done') {
          setStreamPhase({ label: '\u5df2\u5b8c\u6210', progress: 100 })
          // Stream complete
          break
        } else if (chunk.content) {
          // Fallback for direct content
          accumulatedContent += chunk.content
          updateMessage(assistantMessageId, {
            content: accumulatedContent,
            status: 'sending'
          })
        } else if (chunk.message) {
          // Fallback for message field
          accumulatedContent += chunk.message
          updateMessage(assistantMessageId, {
            content: accumulatedContent,
            status: 'sending'
          })
        }
      }
      const completedCalls = currentToolCalls.filter((call) =>
        call.status === 'success' || call.status === 'error' || call.status === 'denied'
      )
      const toolTotalMs = completedCalls.reduce((sum, call) => sum + (call.durationMs || 0), 0)
      setLastRunMetrics({
        responseMode,
        firstTokenMs,
        firstToolMs,
        toolTotalMs,
        toolCompleted: completedCalls.length,
      })
      // Mark as sent when stream completes
      updateMessage(assistantMessageId, {
        status: 'sent',
        isSearching: false,
        searchResults: currentSearchResults.length > 0 ? currentSearchResults : undefined,
        toolCalls: currentToolCalls.length > 0 ? currentToolCalls : undefined
      })
    } catch (error) {
      console.error('Chat error:', error)
      // Update message with error
      updateMessage(assistantMessageId, {
        status: 'error',
        error: error instanceof Error ? error.message : '\u53d1\u9001\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5'
      })
    } finally {
      if (streamStartedAt) {
        setLastRunDurationSec(Math.max(1, Math.floor((Date.now() - streamStartedAt) / 1000)))
      }
      setStreaming(false)
      setStreamStartedAt(null)
      setTimeout(() => setStreamPhase({ label: '\u51c6\u5907\u4e2d', progress: 5 }), 600)
    }
  }, [
    addMessage,
    updateMessage,
    setStreaming,
    addPermissionRequest,
    setAutoApproveAll,
    hasUserName,
    setUserName,
    currentSessionId,
    activeGoalTaskId,
    activeSessionOrganizationId,
    commanderMode,
    responseMode,
    approvalPolicy,
    resolveApprovalPolicyForTool,
    preferredSkill,
    skillStrict,
    streamStartedAt,
    refreshPendingApprovals,
  ])
  const activeTimelineCalls = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i]
      if (msg.role !== 'assistant') continue
      if (msg.status === 'sending' || (msg.toolCalls && msg.toolCalls.length > 0)) {
        return msg.toolCalls || []
      }
    }
    return [] as ToolCallInfo[]
  }, [messages])
  const timelineHasSearching = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i]
      if (msg.role !== 'assistant') continue
      return Boolean(msg.isSearching)
    }
    return false
  }, [messages])
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search)
    const rawTaskId = (searchParams.get('channel_task_id') || '').trim()
    if (!rawTaskId) {
      setLinkedChannelTaskId(null)
      setTimelineLinkedOnly(false)
      return
    }
    if (routeTaskHandledRef.current === rawTaskId) return
    if (isStreaming || !currentSessionId) return

    const taskId = Number(rawTaskId)
    if (!Number.isFinite(taskId) || taskId <= 0) {
      routeTaskHandledRef.current = rawTaskId
      setLinkedChannelTaskId(null)
      navigate('/workbench', { replace: true })
      return
    }

    routeTaskHandledRef.current = rawTaskId
    setLinkedChannelTaskId(taskId)
    const from = (searchParams.get('from') || 'channel').trim()
    const channelHint = from === 'feishu_smoke' ? '飞书联调任务' : '渠道任务'
    const tipMessage: Message = {
      id: generateId(),
      role: 'assistant',
      content: `已接管${channelHint} #${taskId}，我将继续推进并汇总执行结果。`,
      timestamp: Date.now(),
      status: 'sent',
    }
    addMessage(tipMessage)

    navigate('/workbench', { replace: true })
    void handleSendMessage(`请接管并继续执行渠道任务 #${taskId}，给我一个简洁的执行进度摘要和下一步动作。`)
  }, [location.search, isStreaming, currentSessionId, addMessage, navigate, handleSendMessage])
  const timelineLabelMap: Record<NonNullable<ToolCallInfo['kind']>, string> = {
    skill: '\u6280\u80fd',
    system: '\u7cfb\u7edf',
    desktop: '\u684c\u9762',
    mcp: '\u534f\u8bae',
    other: '\u5de5\u5177',
  }
  const statusLabelMap: Record<ToolCallInfo['status'], string> = {
    running: '\u6267\u884c\u4e2d',
    success: '\u6210\u529f',
    error: '\u5931\u8d25',
    pending_approval: '\u5f85\u5ba1\u6279',
    denied: '\u5df2\u62d2\u7edd',
  }
  const filteredTimelineCalls = useMemo(() => {
    if (!timelineSkillFilter) return activeTimelineCalls
    const selectedSkill = availableSkills.find((skill) => skill.name === timelineSkillFilter)
    const selectedTools = new Set(selectedSkill?.tools || [])
    return activeTimelineCalls.filter((call) => {
      if (call.tool === timelineSkillFilter) return true
      if (call.tool === 'skill_match') {
        const names = call.data?.skills
        return Array.isArray(names) && names.includes(timelineSkillFilter)
      }
      return selectedTools.has(call.tool)
    })
  }, [activeTimelineCalls, availableSkills, timelineSkillFilter])
  const linkedTimelineIndices = useMemo(() => {
    if (!linkedChannelTaskId) return [] as number[]
    const token = `#${linkedChannelTaskId}`
    return filteredTimelineCalls
      .map((call, index) => {
        const text = [call.message || '', formatTimelineValue(call.input), formatTimelineValue(call.data)].join('\n')
        if (
          text.includes(token) ||
          text.includes(`task_id": ${linkedChannelTaskId}`) ||
          text.includes(`task_id=${linkedChannelTaskId}`) ||
          text.includes(`task ${linkedChannelTaskId}`)
        ) {
          return index
        }
        return -1
      })
      .filter((index) => index >= 0)
  }, [filteredTimelineCalls, linkedChannelTaskId])
  const linkedTimelineIndexSet = useMemo(() => new Set(linkedTimelineIndices), [linkedTimelineIndices])
  const displayedTimelineEntries = useMemo(() => {
    if (!timelineLinkedOnly) {
      return filteredTimelineCalls.map((call, index) => ({ call, index }))
    }
    return filteredTimelineCalls
      .map((call, index) => ({ call, index }))
      .filter((entry) => linkedTimelineIndexSet.has(entry.index))
  }, [filteredTimelineCalls, timelineLinkedOnly, linkedTimelineIndexSet])
  useEffect(() => {
    if (filteredTimelineCalls.length === 0) {
      if (activeTimelineIndex !== -1) setActiveTimelineIndex(-1)
      return
    }
    if (activeTimelineIndex < 0 || activeTimelineIndex >= filteredTimelineCalls.length) {
      setActiveTimelineIndex(filteredTimelineCalls.length - 1)
    }
  }, [filteredTimelineCalls, activeTimelineIndex])
  useEffect(() => {
    if (!linkedTimelineIndices.length) return
    const latestLinked = linkedTimelineIndices[linkedTimelineIndices.length - 1]
    if (activeTimelineIndex !== latestLinked) {
      setActiveTimelineIndex(latestLinked)
    }
  }, [linkedTimelineIndices, activeTimelineIndex])
  useEffect(() => {
    if (!timelineLinkedOnly) return
    if (displayedTimelineEntries.length === 0) return
    if (displayedTimelineEntries.some((entry) => entry.index === activeTimelineIndex)) return
    setActiveTimelineIndex(displayedTimelineEntries[displayedTimelineEntries.length - 1].index)
  }, [timelineLinkedOnly, displayedTimelineEntries, activeTimelineIndex])
  const activeTimelineCall =
    activeTimelineIndex >= 0 && activeTimelineIndex < filteredTimelineCalls.length
      ? filteredTimelineCalls[activeTimelineIndex]
      : null
  const runningCall = useMemo(
    () => activeTimelineCalls.find((call) => call.status === 'running' || call.status === 'pending_approval') || null,
    [activeTimelineCalls]
  )
  const runningCallElapsedMs = useMemo(() => {
    if (!runningCall?.startedAt) return 0
    return Math.max(0, Date.now() - runningCall.startedAt)
  }, [runningCall, streamElapsedSec])
  const latestUserMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i]
      if (msg.role === 'user') return msg.content.trim()
    }
    return ''
  }, [messages])
  const activeMatchedSkills = useMemo(() => {
    for (let i = activeTimelineCalls.length - 1; i >= 0; i -= 1) {
      const call = activeTimelineCalls[i]
      if (call.tool !== 'skill_match') continue
      const skills = call.data?.skills
      if (Array.isArray(skills) && skills.length > 0) {
        return skills as string[]
      }
    }
    return [] as string[]
  }, [activeTimelineCalls])
  const skillToolNameSet = useMemo(() => {
    const names = new Set<string>()
    for (const skill of availableSkills) {
      for (const toolName of skill.tools || []) {
        names.add(toolName)
      }
    }
    return names
  }, [availableSkills])
  const activeSkillStats = useMemo(() => {
    const skillCalls = activeTimelineCalls.filter(
      (call) => call.kind === 'skill' || skillToolNameSet.has(call.tool)
    )
    const success = skillCalls.filter((call) => call.status === 'success').length
    const failed = skillCalls.filter((call) => call.status === 'error' || call.status === 'denied').length
    const running = skillCalls.filter((call) => call.status === 'running' || call.status === 'pending_approval').length
    const downgraded = skillCalls.filter((call) => Boolean(call.data?.fallback_hint)).length
    return {
      total: skillCalls.length,
      success,
      failed,
      running,
      downgraded,
    }
  }, [activeTimelineCalls, skillToolNameSet])
  const skillDecisionSummary = useMemo(() => {
    const lines: string[] = []
    if (commanderMode) {
      lines.push('已开启总指挥模式：系统会自动选择最合适的技能链路并在失败时回退。')
    } else if (preferredSkill) {
      lines.push(
        skillStrict
          ? `已指定技能「${preferredSkill}」并启用严格模式，仅允许该技能优先执行。`
          : `已指定技能「${preferredSkill}」作为优先项，系统仍可按需补充其他技能。`
      )
    } else {
      lines.push('未指定技能，系统按任务意图自动匹配技能。')
    }

    if (activeMatchedSkills.length > 0) {
      lines.push(`本轮命中技能：${activeMatchedSkills.join('、')}`)
    }

    if (activeSkillStats.failed > 0) {
      lines.push(`技能调用失败 ${activeSkillStats.failed} 次，系统会给出降级或重试建议。`)
    }

    if (activeSkillStats.downgraded > 0) {
      lines.push(`检测到 ${activeSkillStats.downgraded} 次降级，建议切换桌面工具链继续执行。`)
    }
    if (responseMode === 'fast') {
      lines.push('当前为极速响应：默认减少记忆检索与联网搜索，优先速度。')
    } else if (responseMode === 'deep') {
      lines.push('当前为深度响应：增加上下文与工具预算，优先结果完整度。')
    } else {
      lines.push('当前为平衡响应：速度与质量均衡。')
    }

    const latestPolicyBlock = [...activeTimelineCalls]
      .reverse()
      .find((call) => call.tool === 'skill_match' && call.status === 'error' && call.message)
    if (latestPolicyBlock?.message) {
      lines.push(`策略校验：${latestPolicyBlock.message}`)
    }

    return lines.slice(0, 4)
  }, [
    commanderMode,
    preferredSkill,
    skillStrict,
    activeMatchedSkills,
    activeSkillStats.failed,
    activeSkillStats.downgraded,
    responseMode,
    activeTimelineCalls,
  ])
  const commanderPlan = useMemo(() => {
    const hasSearch = activeTimelineCalls.some((call) => call.tool === 'web_search')
    const hasSkill = activeTimelineCalls.some((call) => call.tool === 'skill_match' || call.kind === 'skill')
    const hasDesktop = activeTimelineCalls.some((call) => call.kind === 'desktop')
    const hasFailure = activeTimelineCalls.some((call) => call.status === 'error' || call.status === 'denied')
    const completed = !isStreaming && activeTimelineCalls.some((call) => call.status === 'success')
    return [
      {
        title: '理解目标',
        detail: latestUserMessage ? `当前目标：${latestUserMessage.slice(0, 46)}${latestUserMessage.length > 46 ? '...' : ''}` : '等待输入任务目标',
        status: latestUserMessage ? 'done' : 'pending',
      },
      {
        title: '自动编排',
        detail: hasSearch
          ? '已执行联网检索与技能匹配'
          : hasSkill
            ? '已执行技能匹配，正在编排工具链'
            : '正在判断最优技能与工具链',
        status: hasSearch || hasSkill ? 'done' : (isStreaming ? 'running' : 'pending'),
      },
      {
        title: '交付结果',
        detail: hasFailure
          ? '检测到异常，正在降级重试'
          : hasDesktop
            ? '正在产出本地文件与执行结果'
            : completed
              ? '已完成并准备回传结果摘要'
              : '等待执行产出',
        status: hasFailure ? 'running' : (completed ? 'done' : (isStreaming ? 'running' : 'pending')),
      },
    ] as Array<{ title: string; detail: string; status: 'done' | 'running' | 'pending' }>
  }, [activeTimelineCalls, isStreaming, latestUserMessage])
  const commanderDeliverables = useMemo(() => {
    const items: CommanderDeliverable[] = []
    for (const call of activeTimelineCalls) {
      if (call.status !== 'success') continue
      const text = [call.message || '', ...collectStrings(call.data || {})].join('\n')
      const pathMatches = text.match(/[A-Za-z]:\\[^\s\n"'<>|]+\.(md|txt|docx|xlsx|pptx|pdf|csv|json)/gi) || []
      const urlMatches = text.match(/https?:\/\/[^\s)"']+/gi) || []
      for (const p of pathMatches) {
        const filename = p.split('\\').pop() || p
        items.push({ type: 'file', target: p, label: filename })
      }
      for (const u of urlMatches) {
        const safeUrl = u.trim()
        items.push({ type: 'link', target: safeUrl, label: safeUrl.replace(/^https?:\/\//, '').slice(0, 40) })
      }
    }
    const dedup = new Map<string, CommanderDeliverable>()
    for (const item of items) {
      if (!dedup.has(item.target)) dedup.set(item.target, item)
    }
    return Array.from(dedup.values()).slice(0, 4)
  }, [activeTimelineCalls])
  const handleOpenDeliverable = useCallback(async (item: CommanderDeliverable) => {
    setOpenDeliverableError(null)
    try {
      await openShellTarget(item.target)
    } catch (error) {
      if (item.type === 'link') {
        window.open(item.target, '_blank', 'noopener,noreferrer')
        return
      }
      const reason = error instanceof Error ? error.message : String(error)
      setOpenDeliverableError(`无法打开 ${item.target}：${reason}`)
    }
  }, [])
  const commanderSummary = useMemo(() => {
    const total = activeTimelineCalls.length
    const success = activeTimelineCalls.filter((call) => call.status === 'success').length
    const failed = activeTimelineCalls.filter((call) => call.status === 'error' || call.status === 'denied').length
    const successRate = total > 0 ? Math.round((success / total) * 100) : 0
    return { total, success, failed, successRate }
  }, [activeTimelineCalls])
  const buildCommanderReportLines = useCallback((now: number) => {
    return [
      '# CKS 工作台交付报告',
      '',
      `- 导出时间：${formatLocalDateTime(now)}`,
      `- 模式：${commanderMode ? 'AI总指挥' : '手动技能模式'}`,
      `- 响应策略：${responseMode === 'fast' ? '极速响应（低延迟）' : responseMode === 'deep' ? '深度响应（高质量）' : '平衡响应（均衡）'}`,
      `- 当前任务：${latestUserMessage || '未记录'}`,
      `- 执行耗时：${lastRunDurationSec || 0}s`,
      `- 首字节耗时：${lastRunMetrics.firstTokenMs != null ? formatDurationMs(lastRunMetrics.firstTokenMs) : '未采集'}`,
      `- 首次工具耗时：${lastRunMetrics.firstToolMs != null ? formatDurationMs(lastRunMetrics.firstToolMs) : '未触发工具'}`,
      `- 工具总耗时：${formatDurationMs(lastRunMetrics.toolTotalMs)}（${lastRunMetrics.toolCompleted} 次）`,
      `- 调用总数：${commanderSummary.total}`,
      `- 成功率：${commanderSummary.successRate}%`,
      `- 异常数：${commanderSummary.failed}`,
      '',
      '## 执行计划',
      ...commanderPlan.map((step) => `- ${step.title}：${step.status === 'done' ? '完成' : step.status === 'running' ? '进行中' : '待执行'}（${step.detail}）`),
      '',
      '## 关键产出',
      ...(commanderDeliverables.length > 0
        ? commanderDeliverables.map((item) => (item.type === 'file' ? `- 文件：${item.target}` : `- 链接：${item.target}`))
        : ['- 暂无自动识别的文件或链接产出']),
      '',
      '## 建议下一步',
      '- 验收已完成项并标注结果质量',
      '- 对未完成项继续执行并输出补充产物',
      '- 将关键产出同步回目标任务与审计日志',
      '',
    ]
  }, [
    commanderMode,
    responseMode,
    latestUserMessage,
    lastRunDurationSec,
    lastRunMetrics.firstTokenMs,
    lastRunMetrics.firstToolMs,
    lastRunMetrics.toolTotalMs,
    lastRunMetrics.toolCompleted,
    commanderSummary.total,
    commanderSummary.successRate,
    commanderSummary.failed,
    commanderPlan,
    commanderDeliverables,
  ])
  const exportCommanderReport = useCallback(() => {
    const now = Date.now()
    const reportLines = buildCommanderReportLines(now)
    const blob = new Blob([reportLines.join('\n')], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cks-delivery-report-${new Date(now).toISOString().replace(/[:.]/g, '-')}.md`
    a.click()
    URL.revokeObjectURL(url)
  }, [buildCommanderReportLines])
  const writebackCommanderReportToTask = useCallback(async () => {
    if (!activeGoalTaskId) return
    setAuditWritebackState('saving')
    setAuditWritebackMessage('')
    try {
      const report = buildCommanderReportLines(Date.now()).join('\n')
      const note = `总指挥交付报告回写\n\n${report}`
      const result = await AgentService.updateGoalTaskExecutionState(activeGoalTaskId, 'verify', 'active', note, '')
      if (result?.success) {
        setAuditWritebackState('done')
        setAuditWritebackMessage(`已回写到任务 #${activeGoalTaskId} 审计/执行日志`)
      } else {
        throw new Error(result?.error || '回写失败')
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      setAuditWritebackState('error')
      setAuditWritebackMessage(`回写失败：${reason}`)
    }
  }, [activeGoalTaskId, buildCommanderReportLines])
  const historyToolOptions = useMemo(() => {
    const set = new Set<string>()
    for (const item of approvalHistory) {
      if (item.tool_name) set.add(item.tool_name)
    }
    return Array.from(set).sort()
  }, [approvalHistory])
  const filteredApprovalHistory = useMemo(() => {
    return approvalHistory.filter((item) => {
      if (historyStatusFilter !== 'all' && item.status !== historyStatusFilter) return false
      if (historyToolFilter !== 'all' && item.tool_name !== historyToolFilter) return false
      if (historyDeciderFilter.trim()) {
        const decider = (item.decided_by || '').toLowerCase()
        if (!decider.includes(historyDeciderFilter.trim().toLowerCase())) return false
      }
      return true
    })
  }, [approvalHistory, historyStatusFilter, historyToolFilter, historyDeciderFilter])
  const exportApprovalHistory = useCallback(() => {
    const rows = [
      ['id', 'tool_name', 'risk_level', 'status', 'decided_by', 'updated_at', 'decision_note'],
      ...filteredApprovalHistory.map((item) => [
        sanitizeCsvCell(item.id),
        sanitizeCsvCell(item.tool_name),
        sanitizeCsvCell(item.risk_level || ''),
        sanitizeCsvCell(item.status),
        sanitizeCsvCell(item.decided_by || ''),
        sanitizeCsvCell(item.updated_at || item.created_at || ''),
        sanitizeCsvCell(item.decision_note || ''),
      ]),
    ]
    const csv = rows
      .map((row) =>
        row
          .map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`)
          .join(',')
      )
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cks-approval-history-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [filteredApprovalHistory])
  const updateToolPolicy = useCallback((tool: string, policy: 'inherit' | 'always' | 'high-only' | 'never') => {
    setToolPolicyMap((prev) => ({ ...prev, [tool]: policy }))
  }, [])
  const activePermissionRequest = permissionRequests.length > 0 ? permissionRequests[0] : null
  const handleDialogDecision = useCallback(
    async (approved: boolean) => {
      if (!activePermissionRequest) return
      if (activePermissionRequest.approval_request_id) {
        await handleApprovalDecision(
          activePermissionRequest.approval_request_id,
          approved,
          'workbench-dialog'
        )
      } else {
        resolvePermissionDecision(activePermissionRequest.id, approved)
      }
    },
    [activePermissionRequest, handleApprovalDecision]
  )
  const handleApproveAllDecision = useCallback(async () => {
    setAutoApproveAll(true)
    await handleDialogDecision(true)
  }, [setAutoApproveAll, handleDialogDecision])
  return (
    <div className="flex h-screen bg-black">
      {/* Chat History Sidebar */}
      <ChatHistorySidebar />
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div className="h-14 border-b border-neutral-800 flex items-center px-6 flex-shrink-0">
          <div className="flex-1">
            <h1 className="text-base font-semibold text-white">{'\u5de5\u4f5c\u53f0'}</h1>
            <p className="text-xs text-neutral-600 mt-0.5">{'CKS \u667a\u80fd\u5bf9\u8bdd'}</p>
          </div>
          <div className="mr-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTopPanelsCollapsed((v) => !v)}
              className="text-[11px] px-2 py-1 rounded border border-neutral-700 text-neutral-300 hover:border-neutral-500"
            >
              {topPanelsCollapsed ? '展开顶部面板' : '折叠顶部面板'}
            </button>
            <label className="flex items-center gap-1 text-[11px] text-cyan-300 border border-cyan-500/40 rounded px-2 py-1 bg-cyan-500/10">
              <input
                type="checkbox"
                checked={commanderMode}
                onChange={(e) => setCommanderMode(e.target.checked)}
                className="accent-cyan-500"
              />
              {'AI总指挥'}
            </label>
            <label className="flex items-center gap-1 text-[11px] text-emerald-300 border border-emerald-500/40 rounded px-2 py-1 bg-emerald-500/10">
              <span>响应策略</span>
              <select
                value={responseMode}
                onChange={(e) => setResponseMode((e.target.value as 'fast' | 'balanced' | 'deep') || 'fast')}
                className="bg-black/50 border border-emerald-500/30 text-[11px] text-emerald-100 rounded px-1.5 py-0.5"
              >
                <option value="fast">极速</option>
                <option value="balanced">平衡</option>
                <option value="deep">深度</option>
              </select>
            </label>
            {!commanderMode && (
              <>
                <span className="text-xs text-neutral-500">{'\u6280\u80fd\u4f18\u5148'}</span>
                <select
                  value={preferredSkill}
                  onChange={(e) => setPreferredSkill(e.target.value)}
                  className="bg-neutral-900 border border-neutral-700 text-xs text-neutral-200 rounded px-2 py-1"
                >
                  <option value="">{'\u81ea\u52a8\u5224\u65ad'}</option>
                  {availableSkills.map((skill) => (
                    <option key={skill.name} value={skill.name}>
                      {skill.display_name || skill.name}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-[11px] text-neutral-400">
                  <input
                    type="checkbox"
                    checked={skillStrict}
                    onChange={(e) => setSkillStrict(e.target.checked)}
                    className="accent-cyan-500"
                  />
                  {'严格模式'}
                </label>
              </>
            )}
          </div>
          {activeGoalTaskId && (
            <div className="text-xs text-blue-300 bg-blue-500/10 border border-blue-500/30 rounded px-2 py-1">
              {'\u5df2\u7ed1\u5b9a\u76ee\u6807\u4efb\u52a1'} #{activeGoalTaskId}{'\uff08\u5b8c\u6210\u540e\u81ea\u52a8\u56de\u5199\uff09'}
            </div>
          )}
        </div>
        <div className="border-b border-neutral-900 bg-neutral-950/60 px-6 py-2">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="text-neutral-500">执行审批策略</span>
            <select
              value={approvalPolicy}
              onChange={(e) => setApprovalPolicy((e.target.value as 'always' | 'high-only' | 'never') || 'always')}
              className="bg-neutral-900 border border-neutral-700 text-neutral-200 rounded px-2 py-1"
            >
              <option value="always">中高风险需审批</option>
              <option value="high-only">仅高风险审批</option>
              <option value="never">仅审计不拦截</option>
            </select>
            <button
              type="button"
              onClick={() => {
                setApprovalPanelExpanded((prev) => !prev)
                if (!approvalPanelExpanded) {
                  refreshPendingApprovals()
                }
              }}
              className="px-2 py-1 rounded border border-neutral-700 text-neutral-300 hover:border-neutral-500"
            >
              审批中心（待处理 {pendingApprovals.length}）
            </button>
            <button
              type="button"
              onClick={refreshPendingApprovals}
              className="px-2 py-1 rounded border border-neutral-700 text-neutral-400 hover:text-neutral-200"
            >
              刷新
            </button>
            <select
              value={approvalScope}
              onChange={(e) => setApprovalScope((e.target.value as 'org' | 'session') || 'org')}
              className="bg-neutral-900 border border-neutral-700 text-neutral-200 rounded px-2 py-1"
            >
              <option value="org">组织范围</option>
              <option value="session">当前会话</option>
            </select>
            <span className="text-neutral-500">当前策略：{approvalPolicyLabel[approvalPolicy]}</span>
            {approvalError ? <span className="text-red-300">审批中心异常：{approvalError}</span> : null}
          </div>
          {approvalPanelExpanded && (
            <div className="mt-2 space-y-3 max-h-56 overflow-y-auto pr-1">
              <div>
                <div className="mb-1 text-[11px] text-neutral-500">工具审批策略覆盖（可选）</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {Object.keys(TOOL_POLICY_DEFAULT).map((tool) => (
                    <label key={tool} className="flex items-center justify-between gap-2 rounded border border-neutral-800 bg-black/30 px-2 py-1">
                      <span className="text-[11px] text-neutral-300">{formatToolLabel(tool)}</span>
                      <select
                        value={toolPolicyMap[tool] || 'inherit'}
                        onChange={(e) => updateToolPolicy(tool, (e.target.value as 'inherit' | 'always' | 'high-only' | 'never') || 'inherit')}
                        className="bg-neutral-900 border border-neutral-700 text-[11px] text-neutral-200 rounded px-1.5 py-0.5"
                      >
                        <option value="inherit">跟随全局</option>
                        <option value="always">中高风险审批</option>
                        <option value="high-only">仅高风险审批</option>
                        <option value="never">仅审计不拦截</option>
                      </select>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1 text-[11px] text-neutral-500">待处理审批</div>
                {pendingApprovals.length === 0 ? (
                  <div className="text-[11px] text-neutral-500">当前没有待审批项。</div>
                ) : (
                  pendingApprovals.map((approval) => (
                    <div key={approval.id} className="mb-2 rounded border border-neutral-800 bg-black/40 p-2 last:mb-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-[11px] text-neutral-300">
                          {formatToolLabel(approval.tool_name)} · {approval.risk_level} · {approvalStatusLabel[approval.status] || approval.status}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={approvalBusyId === approval.id}
                            onClick={() => handleApprovalDecision(approval.id, true, 'workbench-panel')}
                            className="px-2 py-1 text-[11px] rounded border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
                          >
                            批准
                          </button>
                          <button
                            type="button"
                            disabled={approvalBusyId === approval.id}
                            onClick={() => handleApprovalDecision(approval.id, false, 'workbench-panel')}
                            className="px-2 py-1 text-[11px] rounded border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                          >
                            拒绝
                          </button>
                        </div>
                      </div>
                      <div className="mt-1 text-[10px] text-neutral-500 break-all">
                        ID: {approval.id}
                        {approval.payload?.desktop_request_id ? ` ｜ 请求: ${approval.payload.desktop_request_id}` : ''}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-neutral-500">最近审批记录</span>
                  <select
                    value={historyStatusFilter}
                    onChange={(e) => setHistoryStatusFilter((e.target.value as 'all' | 'approved' | 'denied' | 'expired') || 'all')}
                    className="bg-neutral-900 border border-neutral-700 text-[11px] text-neutral-200 rounded px-1.5 py-0.5"
                  >
                    <option value="all">全部状态</option>
                    <option value="approved">仅已批准</option>
                    <option value="denied">仅已拒绝</option>
                    <option value="expired">仅已过期</option>
                  </select>
                  <select
                    value={historyToolFilter}
                    onChange={(e) => setHistoryToolFilter(e.target.value || 'all')}
                    className="bg-neutral-900 border border-neutral-700 text-[11px] text-neutral-200 rounded px-1.5 py-0.5"
                  >
                    <option value="all">全部工具</option>
                    {historyToolOptions.map((tool) => (
                      <option key={tool} value={tool}>{formatToolLabel(tool)}</option>
                    ))}
                  </select>
                  <input
                    value={historyDeciderFilter}
                    onChange={(e) => setHistoryDeciderFilter(e.target.value)}
                    placeholder="按处理人筛选"
                    className="bg-neutral-900 border border-neutral-700 text-[11px] text-neutral-200 rounded px-2 py-0.5 w-28"
                  />
                  <button
                    type="button"
                    onClick={exportApprovalHistory}
                    className="px-2 py-1 text-[11px] rounded border border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/10"
                  >
                    导出CSV
                  </button>
                </div>
                {filteredApprovalHistory.length === 0 ? (
                  <div className="text-[11px] text-neutral-500">暂无审批历史记录。</div>
                ) : (
                  filteredApprovalHistory.map((approval) => (
                    <div key={approval.id} className="mb-2 rounded border border-neutral-800/80 bg-black/20 p-2 last:mb-0">
                      <div className="text-[11px] text-neutral-300">
                        {formatToolLabel(approval.tool_name)} · {approvalStatusLabel[approval.status] || approval.status}
                      </div>
                      <div className="mt-1 text-[10px] text-neutral-500">
                        处理人：{approval.decided_by || 'system'} ｜ 时间：{formatAuditTime(approval.updated_at || approval.created_at)}
                      </div>
                      {approval.decision_note ? (
                        <div className="mt-1 text-[10px] text-neutral-500 break-all">说明：{approval.decision_note}</div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        {topPanelsCollapsed && (
          <div className="border-b border-neutral-900 bg-neutral-950/60 px-6 py-2">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="px-2 py-1 rounded border border-neutral-700 bg-neutral-900 text-neutral-300">顶部面板已折叠</span>
              <span className={`px-2 py-1 rounded border ${isStreaming ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}`}>
                {isStreaming ? '执行中' : '空闲'}
              </span>
              {skillPolicyError ? (
                <span className="px-2 py-1 rounded border border-amber-500/30 bg-amber-500/10 text-amber-200">有策略拦截提示</span>
              ) : null}
              <button
                type="button"
                onClick={() => setTopPanelsCollapsed(false)}
                className="ml-auto text-[11px] px-2 py-1 rounded border border-neutral-700 text-neutral-300 hover:border-neutral-500"
              >
                展开顶部面板
              </button>
            </div>
          </div>
        )}
        {!topPanelsCollapsed && skillPolicyError && (
          <div className="border-b border-amber-500/30 bg-amber-500/10 px-6 py-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-amber-100">
                技能策略拦截：{skillPolicyError}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSkillStrict(false)}
                  className="text-[11px] px-2 py-1 rounded border border-amber-400/40 text-amber-100 hover:bg-amber-500/10"
                >
                  关闭严格模式
                </button>
                <button
                  type="button"
                  onClick={() => setSkillPolicyError(null)}
                  className="text-[11px] px-2 py-1 rounded border border-neutral-700 text-neutral-300 hover:border-neutral-500"
                >
                  收起提示
                </button>
              </div>
            </div>
          </div>
        )}
        {!topPanelsCollapsed && (commanderMode || preferredSkill || activeTimelineCalls.length > 0 || skillPolicyError) && (
          <div className="border-b border-neutral-900 bg-neutral-950/60 px-6 py-2">
            <div className="text-[11px] text-neutral-400">本轮技能决策说明</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {skillDecisionSummary.map((line, index) => (
                <span
                  key={`${index}-${line}`}
                  className="text-[11px] px-2 py-1 rounded border border-neutral-700 bg-neutral-900 text-neutral-300"
                >
                  {line}
                </span>
              ))}
            </div>
          </div>
        )}
        {!topPanelsCollapsed && commanderMode && (
          <div className="border-b border-neutral-900 bg-gradient-to-r from-cyan-950/20 via-neutral-950 to-neutral-950 px-6 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs text-cyan-300">AI 总指挥执行面板</div>
                <div className="text-[11px] text-neutral-400 mt-0.5">系统自动决策技能与工具链，优先交付可验收结果。</div>
              </div>
              <span className={`text-[11px] px-2 py-1 rounded border ${isStreaming ? 'border-cyan-500/40 text-cyan-200 bg-cyan-500/10' : 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'}`}>
                {isStreaming ? '执行中' : '待命'}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {commanderPlan.map((step) => (
                <div key={step.title} className="rounded border border-neutral-800 bg-neutral-900/60 px-2.5 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-neutral-200">{step.title}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${step.status === 'done' ? 'bg-emerald-500/20 text-emerald-300' : step.status === 'running' ? 'bg-cyan-500/20 text-cyan-300' : 'bg-neutral-800 text-neutral-400'}`}>
                      {step.status === 'done' ? '完成' : step.status === 'running' ? '进行中' : '待执行'}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-neutral-400 line-clamp-2">{step.detail}</div>
                </div>
              ))}
            </div>
            <div className="mt-2 rounded border border-neutral-800 bg-neutral-900/60 px-2.5 py-2">
              <div className="text-[11px] text-neutral-400">结果快照</div>
              {commanderDeliverables.length === 0 ? (
                <div className="mt-1 text-[11px] text-neutral-500">暂无可展示产出，执行完成后会自动汇总文件与链接。</div>
              ) : (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {commanderDeliverables.map((item) => (
                    <button
                      key={item.target}
                      type="button"
                      onClick={() => handleOpenDeliverable(item)}
                      className="text-[11px] px-2 py-1 rounded border border-neutral-700 bg-black/40 text-neutral-300 hover:border-cyan-500/40 hover:text-cyan-200"
                      title={item.target}
                    >
                      {item.type === 'file' ? `文件：${item.label}` : `链接：${item.label}`}
                    </button>
                  ))}
                </div>
              )}
              {openDeliverableError ? (
                <div className="mt-1 text-[11px] text-red-300">{openDeliverableError}</div>
              ) : null}
            </div>
          </div>
        )}
        {!topPanelsCollapsed && commanderMode && !isStreaming && (commanderSummary.total > 0 || commanderDeliverables.length > 0) && (
          <div className="border-b border-neutral-900 bg-neutral-950/80 px-6 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-neutral-300">交付报告</span>
              <span className="text-[11px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-200">耗时 {lastRunDurationSec || 0}s</span>
              <span className="text-[11px] px-2 py-0.5 rounded bg-sky-500/20 text-sky-200">
                首字节 {lastRunMetrics.firstTokenMs != null ? formatDurationMs(lastRunMetrics.firstTokenMs) : '-'}
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-200">
                工具耗时 {formatDurationMs(lastRunMetrics.toolTotalMs)}
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">成功率 {commanderSummary.successRate}%</span>
              <span className="text-[11px] px-2 py-0.5 rounded bg-neutral-800 text-neutral-300">调用 {commanderSummary.total}</span>
              {commanderSummary.failed > 0 && (
                <span className="text-[11px] px-2 py-0.5 rounded bg-red-500/20 text-red-300">异常 {commanderSummary.failed}</span>
              )}
              <button
                type="button"
                onClick={() => handleSendMessage('请基于刚才的执行结果，输出一份可直接验收的总结报告（完成项/未完成项/风险/下一步）。')}
                className="text-[11px] px-2 py-1 rounded border border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/10"
              >
                生成验收报告
              </button>
              <button
                type="button"
                onClick={() => handleSendMessage('请继续推进未完成部分，并优先交付可验证结果。')}
                className="text-[11px] px-2 py-1 rounded border border-neutral-700 text-neutral-300 hover:border-neutral-500"
              >
                继续执行未完成项
              </button>
              <button
                type="button"
                onClick={exportCommanderReport}
                className="text-[11px] px-2 py-1 rounded border border-purple-500/40 text-purple-200 hover:bg-purple-500/10"
              >
                导出交付报告
              </button>
              {activeGoalTaskId ? (
                <button
                  type="button"
                  onClick={writebackCommanderReportToTask}
                  disabled={auditWritebackState === 'saving'}
                  className="text-[11px] px-2 py-1 rounded border border-blue-500/40 text-blue-200 hover:bg-blue-500/10 disabled:opacity-50"
                >
                  {auditWritebackState === 'saving' ? '回写中...' : `回写任务 #${activeGoalTaskId}`}
                </button>
              ) : null}
            </div>
            {auditWritebackMessage ? (
              <div className={`mt-1 text-[11px] ${auditWritebackState === 'error' ? 'text-red-300' : 'text-emerald-300'}`}>
                {auditWritebackMessage}
              </div>
            ) : null}
          </div>
        )}
        {(timelineHasSearching || activeTimelineCalls.length > 0) && (
          <div className="border-b border-neutral-900 bg-neutral-950/70 px-6 py-2">
            <div className="flex items-center justify-between">
              <div className="text-xs text-neutral-400">{commanderMode ? '技术详情（可展开）' : '\u6267\u884c\u65f6\u95f4\u7ebf'}</div>
              <div className="flex items-center gap-2">
                {!commanderMode && (
                  <select
                    value={timelineSkillFilter}
                    onChange={(e) => setTimelineSkillFilter(e.target.value)}
                    className="bg-neutral-900 border border-neutral-700 text-[11px] text-neutral-200 rounded px-2 py-1"
                  >
                    <option value="">{'\u5168\u90e8\u6280\u80fd'}</option>
                    {availableSkills.map((skill) => (
                      <option key={skill.name} value={skill.name}>
                        {skill.display_name || skill.name}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={() => setTimelineExpanded((v) => !v)}
                  className="text-[11px] px-2 py-1 rounded border border-neutral-700 text-neutral-300 hover:border-neutral-500"
                >
                  {timelineExpanded ? '\u6536\u8d77' : '\u5c55\u5f00'}
                </button>
              </div>
            </div>

            {!timelineExpanded && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                <span className="px-2 py-1 rounded border border-neutral-700 bg-neutral-900 text-neutral-300">调用 {activeTimelineCalls.length}</span>
                {linkedChannelTaskId ? (
                  <span className="px-2 py-1 rounded border border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-200">
                    任务 #{linkedChannelTaskId} 关联步骤 {linkedTimelineIndices.length}
                  </span>
                ) : null}
                {activeSkillStats.total > 0 && (
                  <span className="px-2 py-1 rounded border border-cyan-500/30 bg-cyan-500/10 text-cyan-200">技能 {activeSkillStats.total}</span>
                )}
                {runningCall ? (
                  <span className="px-2 py-1 rounded border border-amber-500/30 bg-amber-500/10 text-amber-200">
                    当前：{formatToolLabel(runningCall.tool)}（{statusLabelMap[runningCall.status]}）
                  </span>
                ) : (
                  <span className="px-2 py-1 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">本轮执行已结束</span>
                )}
              </div>
            )}

            {timelineExpanded && (
              <>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[11px] text-neutral-500">技能筛选</span>
                  <select
                    value={timelineSkillFilter}
                    onChange={(e) => setTimelineSkillFilter(e.target.value)}
                    className="bg-neutral-900 border border-neutral-700 text-[11px] text-neutral-200 rounded px-2 py-1"
                  >
                    <option value="">{'\u5168\u90e8\u6280\u80fd'}</option>
                    {availableSkills.map((skill) => (
                      <option key={skill.name} value={skill.name}>
                        {skill.display_name || skill.name}
                      </option>
                    ))}
                  </select>
                  {linkedChannelTaskId ? (
                    <span className="text-[11px] px-2 py-1 rounded border border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-200">
                      仅高亮任务 #{linkedChannelTaskId} 相关步骤
                    </span>
                  ) : null}
                  {linkedChannelTaskId && linkedTimelineIndices.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setTimelineLinkedOnly((v) => !v)}
                      className={`text-[11px] px-2 py-1 rounded border ${
                        timelineLinkedOnly
                          ? 'border-fuchsia-500/50 bg-fuchsia-500/10 text-fuchsia-200'
                          : 'border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-neutral-500'
                      }`}
                    >
                      {timelineLinkedOnly ? '显示全部步骤' : '仅看关联步骤'}
                    </button>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {timelineHasSearching && (
                    <span className="text-[11px] px-2 py-1 rounded border border-blue-500/30 bg-blue-500/10 text-blue-300">{'\u641c\u7d22\u4e2d'}</span>
                  )}
                  {displayedTimelineEntries.map(({ call, index }) => (
                    <button
                      key={`${call.tool}-${index}-${call.status}`}
                      type="button"
                      onClick={() => setActiveTimelineIndex(index)}
                      className={`text-[11px] px-2 py-1 rounded border transition-colors ${
                        index === activeTimelineIndex
                          ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-200'
                          : linkedTimelineIndexSet.has(index)
                            ? 'border-fuchsia-500/50 bg-fuchsia-500/10 text-fuchsia-200 hover:border-fuchsia-400'
                          : 'border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-neutral-500'
                      }`}
                    >
                      [{call.kind ? timelineLabelMap[call.kind] : '工具'}] {formatToolLabel(call.tool)} - {statusLabelMap[call.status]}
                    </button>
                  ))}
                </div>

                {!displayedTimelineEntries.length && (
                  <div className="mt-2 text-[11px] text-neutral-500">
                    {timelineLinkedOnly ? '当前任务暂无可定位的关联步骤。' : '当前筛选下暂无技能调用记录。'}
                  </div>
                )}

                {activeTimelineCall && displayedTimelineEntries.length > 0 && (
                  <div className="mt-2 rounded border border-neutral-800 bg-neutral-900/70 p-2">
                    <div className="text-[11px] text-neutral-300">
                      <span className="text-neutral-500">{'\u5de5\u5177:'}</span> {formatToolLabel(activeTimelineCall.tool)}
                      <span className="ml-2 text-neutral-500">{'\u72b6\u6001:'}</span> {statusLabelMap[activeTimelineCall.status]}
                      {activeTimelineCall.durationMs != null && activeTimelineCall.durationMs > 0 && (
                        <>
                          <span className="ml-2 text-neutral-500">耗时:</span> {formatDurationMs(activeTimelineCall.durationMs)}
                        </>
                      )}
                    </div>
                    {activeTimelineCall.input && Object.keys(activeTimelineCall.input).length > 0 && (
                      <pre className="mt-1 text-[11px] text-neutral-400 whitespace-pre-wrap break-words max-h-32 overflow-auto">
                        {formatTimelineValue(activeTimelineCall.input)}
                      </pre>
                    )}
                    {activeTimelineCall.message && (
                      <div className="mt-1 text-[11px] text-neutral-400 whitespace-pre-wrap break-words max-h-24 overflow-auto">
                        {activeTimelineCall.message}
                      </div>
                    )}
                    {activeTimelineCall.data?.fallback_hint && (
                      <div className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-200 whitespace-pre-wrap break-words">
                        {activeTimelineCall.data.fallback_hint}
                        {!isStreaming && (
                          <div className="mt-2">
                            <button
                              type="button"
                              onClick={() => handleSendMessage('请改用桌面工具链继续完成当前任务，并输出已完成进度与下一步计划。')}
                              className="px-2 py-1 text-[11px] rounded border border-amber-400/40 text-amber-100 hover:bg-amber-500/10"
                            >
                              一键继续（改用桌面工具链）
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {isStreaming && (
          <div className="border-b border-neutral-900 bg-neutral-950/70 px-6 py-2">
            <div className="flex items-center justify-between gap-3 text-xs text-cyan-300">
              <span>
                {'AI \u6b63\u5728\u6267\u884c\u4e2d - \u5df2\u8017\u65f6'} {streamElapsedSec}s
                {runningCall ? ` - \u5f53\u524d\u6b65\u9aa4: ${formatToolLabel(runningCall.tool)} (${statusLabelMap[runningCall.status]})` : ''}
                {runningCallElapsedMs > 0 ? ` - 步骤耗时 ${formatDurationMs(runningCallElapsedMs)}` : ''}
              </span>
              <span className="text-cyan-200">{streamPhase.label}</span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-neutral-800 overflow-hidden">
              <div
                className="h-full bg-cyan-500 transition-all duration-300"
                style={{ width: `${streamPhase.progress}%` }}
              />
            </div>
            {(preferredSkill || activeMatchedSkills.length > 0) && (
              <div className="mt-2 text-[11px] text-neutral-400">
                技能状态：
                {preferredSkill ? ` 预设=${preferredSkill}` : ' 预设=自动'}
                {activeMatchedSkills.length > 0 ? ` ｜ 命中=${activeMatchedSkills.join('、')}` : ''}
                {skillStrict ? ' ｜ 严格模式=开' : ' ｜ 严格模式=关'}
              </div>
            )}
            {activeSkillStats.total > 0 && (
              <div className="mt-2 flex items-center gap-2 text-[11px] flex-wrap">
                <span className="text-neutral-500">本轮技能执行:</span>
                <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-200">总计 {activeSkillStats.total}</span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">成功 {activeSkillStats.success}</span>
                <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-300">失败 {activeSkillStats.failed}</span>
                {activeSkillStats.running > 0 && (
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">执行中 {activeSkillStats.running}</span>
                )}
                {activeSkillStats.downgraded > 0 && (
                  <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">已降级 {activeSkillStats.downgraded}</span>
                )}
              </div>
            )}
            <div className="mt-2 flex items-center gap-2 text-[11px] flex-wrap">
              <span className="text-neutral-500">本轮性能:</span>
              <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-200">
                首字节 {lastRunMetrics.firstTokenMs != null ? formatDurationMs(lastRunMetrics.firstTokenMs) : '采集中'}
              </span>
              <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-200">
                首次工具 {lastRunMetrics.firstToolMs != null ? formatDurationMs(lastRunMetrics.firstToolMs) : '未触发'}
              </span>
            </div>
          </div>
        )}

        {/* Messages Area */}
        <div className="flex-1 min-h-0">
          <MessageList messages={messages} isLoading={false} />
        </div>
        {/* Input */}
        <div className="flex-shrink-0">
          <ChatInput onSend={handleSendMessage} disabled={isStreaming} />
        </div>
      </div>
      {/* Permission Approval Dialog */}
      {activePermissionRequest && (
        <PermissionApprovalDialog
          request={activePermissionRequest}
          onApprove={() => {
            void handleDialogDecision(true)
          }}
          onDeny={() => {
            void handleDialogDecision(false)
          }}
          onApproveAll={() => {
            void handleApproveAllDecision()
          }}
        />
      )}
    </div>
  )
}
