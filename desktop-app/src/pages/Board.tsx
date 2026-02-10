import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Gamepad2, List, RefreshCw, Users } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { MoreActions, PageHeader, StatTile, StatusBadge } from '@/components/ui'
import { AgentService } from '@/services/agentService'
import { TauriService } from '@/services/tauriService'
import { useChatStore } from '@/stores'
import { useUserStore } from '@/stores/userStore'
import avatar0 from '@/img/avatar.png'
import avatar1 from '@/img/avatar1.png'
import avatar2 from '@/img/avatar2.png'
import avatar3 from '@/img/avatar3.png'
import avatar4 from '@/img/avatar4.png'
import avatar5 from '@/img/avatar5.png'
import avatar6 from '@/img/avatar6.png'
import avatar7 from '@/img/avatar7.png'
import avatar8 from '@/img/avatar8.png'
import avatar9 from '@/img/avatar9.png'
import { getApprovalStatusMeta, getReviewStatusMeta, getTaskStatusMeta } from '@/utils/statusMeta'
import type { AuditRecord, ChannelTask, ExecutionApprovalRecord, GoalTaskExecutionReadiness, GoalTaskListItem, GoalsDashboardOwnerRow, GoalsDashboardSummary, GoalSupervisorReviewItem } from '@/types/agent'

const emptySummary: GoalsDashboardSummary = {
  total_tasks: 0,
  pending_review: 0,
  in_progress: 0,
  accepted: 0,
  rejected: 0,
}

type BoardMode = 'table' | 'game'
type OwnerState = 'pending_review' | 'in_progress' | 'rejected' | 'healthy'
type DispatchProjectOption = {
  id: number
  label: string
}
type ApprovalViewStatus = 'all' | 'pending' | 'approved' | 'denied' | 'expired'
type EmployeeStatus = 'active' | 'paused'
type SkillPreset = {
  id: string
  name: string
  primarySkill: string
  skills: string[]
}
type EmployeeTemplateKey =
  | 'product-manager'
  | 'frontend-engineer'
  | 'backend-engineer'
  | 'devops-engineer'
  | 'finance-operator'
  | 'tax-operator'
  | 'admin-operator'

type AiEmployee = {
  name: string
  role: string
  specialty: string
  primarySkill: string
  skillStack: string[]
  status: EmployeeStatus
}

type QuickBossJob = {
  taskId: number
  assignee: string
  title: string
  plan: string[]
  note: string
  statusLabel: string
  reviewStatus: 'pending' | 'accepted' | 'rejected'
  lastMessage: string
  updatedAt: string
  subagentRunId?: string
  subagentRunStatus?: string
}

type QuickJobLogBundle = {
  loading: boolean
  executions: AuditRecord[]
  errors: AuditRecord[]
  phase?: string
  phaseStatus?: string
  phaseNote?: string
  subagentRunId?: string
  subagentRunStatus?: string
  subagentResult?: string
  subagentError?: string
  updatedAt?: string
  error?: string
}

type QuickTaskDraft = {
  id: string
  projectId: string
  assignee: string
  detail: string
  input: string
  output: string
}

type SimpleControlFeedItem = {
  key: string
  at: string
  text: string
  tone: string
  category: 'plan' | 'execute' | 'verify' | 'fallback' | 'deliver' | 'approval'
  taskId?: number
}

const BOSS_MODE_MARKER = '[BOSS_MODE]'

const employeeTemplates: Array<{
  key: EmployeeTemplateKey
  role: string
  specialty: string
  primarySkill: string
  defaultSkillStack: string[]
}> = [
  { key: 'product-manager', role: '产品经理员工', specialty: '需求拆解、优先级和里程碑', primarySkill: 'find-skills', defaultSkillStack: ['find-skills', 'internal-comms'] },
  { key: 'frontend-engineer', role: '前端工程师员工', specialty: '页面实现、组件联调与体验优化', primarySkill: 'playwright', defaultSkillStack: ['playwright', 'screenshot'] },
  { key: 'backend-engineer', role: '后端工程师员工', specialty: '接口实现、数据流与稳定性', primarySkill: 'openai-docs', defaultSkillStack: ['openai-docs', 'security-best-practices'] },
  { key: 'devops-engineer', role: '运维工程师员工', specialty: '部署发布、监控告警和故障处理', primarySkill: 'security-best-practices', defaultSkillStack: ['security-best-practices', 'terminal'] },
  { key: 'finance-operator', role: '财务员工', specialty: '收支归档、预算追踪和月度汇总', primarySkill: 'spreadsheet', defaultSkillStack: ['spreadsheet', 'internal-comms'] },
  { key: 'tax-operator', role: '报税员工', specialty: '票据整理、税务检查和申报提醒', primarySkill: 'spreadsheet', defaultSkillStack: ['spreadsheet', 'openai-docs'] },
  { key: 'admin-operator', role: '行政员工', specialty: '排期协调、通知流转和流程执行', primarySkill: 'internal-comms', defaultSkillStack: ['internal-comms', 'find-skills'] },
]

const inferRoleByAssignee = (assignee?: string) => {
  const text = (assignee || '').toLowerCase()
  if (!text) return employeeTemplates[0]
  if (text.includes('front') || text.includes('ui') || text.includes('前端')) return employeeTemplates[1]
  if (text.includes('back') || text.includes('api') || text.includes('后端')) return employeeTemplates[2]
  if (text.includes('devops') || text.includes('ops') || text.includes('运维')) return employeeTemplates[3]
  if (text.includes('finance') || text.includes('财务')) return employeeTemplates[4]
  if (text.includes('tax') || text.includes('报税') || text.includes('税')) return employeeTemplates[5]
  if (text.includes('admin') || text.includes('行政')) return employeeTemplates[6]
  return employeeTemplates[0]
}

const inferNodeCapabilityByEmployee = (employee?: AiEmployee | null): 'desktop' | 'terminal' | 'vision' => {
  if (!employee) return 'desktop'
  const primary = (employee.primarySkill || '').toLowerCase()
  const role = (employee.role || '').toLowerCase()
  const specialty = (employee.specialty || '').toLowerCase()
  const stack = (employee.skillStack || []).join(' ').toLowerCase()
  const text = `${primary} ${role} ${specialty} ${stack}`
  if (text.includes('playwright') || text.includes('screenshot') || text.includes('frontend') || text.includes('前端')) {
    return 'desktop'
  }
  if (text.includes('openai-docs') || text.includes('security') || text.includes('backend') || text.includes('后端') || text.includes('devops') || text.includes('运维')) {
    return 'terminal'
  }
  if (text.includes('运营') || text.includes('marketing') || text.includes('image') || text.includes('vision')) {
    return 'vision'
  }
  return 'desktop'
}

const extractDepartment = (assignee?: string) => {
  const raw = (assignee || '').trim()
  if (!raw) return '未分组'
  const first = raw.split(/[-_/：:]/)[0]?.trim()
  return first || '未分组'
}

const toDatetimeLocal = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const toIso = (value: string) => {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString()
}

const hoursSince = (iso?: string) => {
  if (!iso) return null
  const ts = new Date(iso).getTime()
  if (Number.isNaN(ts)) return null
  return Math.max(0, Math.floor((Date.now() - ts) / (1000 * 60 * 60)))
}

const getOwnerState = (owner: GoalsDashboardOwnerRow): OwnerState => {
  if (owner.pending_review > 0) return 'pending_review'
  if (owner.in_progress > 0) return 'in_progress'
  if (owner.rejected > 0) return 'rejected'
  return 'healthy'
}

const ownerStateLabel: Record<OwnerState, string> = {
  pending_review: '待验收',
  in_progress: '执行中',
  rejected: '返工中',
  healthy: '状态良好',
}

const ownerStateClass: Record<OwnerState, string> = {
  pending_review: 'text-amber-300 border-amber-500/40 bg-amber-500/10',
  in_progress: 'text-blue-300 border-blue-500/40 bg-blue-500/10',
  rejected: 'text-rose-300 border-rose-500/40 bg-rose-500/10',
  healthy: 'text-green-300 border-green-500/40 bg-green-500/10',
}
const sanitizeCsvCell = (value: unknown) => {
  const text = String(value ?? '').replace(/\r?\n/g, ' ')
  if (/^[=+\-@]/.test(text)) return `'${text}`
  return text
}
const parseGoalTaskId = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value)
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed)
  }
  return null
}

const toAuditLikeRecord = (event: Record<string, any>): AuditRecord => ({
  timestamp: String(event.created_at || new Date().toISOString()),
  tool_name: `phase:${String(event.phase || '-')}(${String(event.status || '-')})`,
  message: String(event.note || event.action || '执行阶段更新'),
  data: event,
})
const toSubagentAuditLikeRecord = (event: Record<string, any>): AuditRecord => ({
  timestamp: String(event.created_at || new Date().toISOString()),
  tool_name: `subagent:${String(event.stage || '-')}`,
  message: String(event.message || '子Agent阶段更新'),
  data: event,
})
const getSimpleFeedCategory = (toolName: string, message: string): SimpleControlFeedItem['category'] => {
  const merged = `${toolName} ${message}`.toLowerCase()
  if (toolName.startsWith('approval:') || merged.includes('审批')) return 'approval'
  if (
    merged.includes('fallback')
    || merged.includes('retry')
    || merged.includes('失败')
    || merged.includes('驳回')
    || merged.includes('异常')
  ) return 'fallback'
  if (
    merged.includes('verify')
    || merged.includes('review')
    || merged.includes('验收')
    || merged.includes('核验')
  ) return 'verify'
  if (
    merged.includes('deliver')
    || merged.includes('交付')
    || merged.includes('完成')
    || merged.includes('done')
  ) return 'deliver'
  if (merged.includes('plan') || merged.includes('规划') || merged.includes('拆解')) return 'plan'
  return 'execute'
}

const simpleFeedCategoryMeta: Record<SimpleControlFeedItem['category'], { label: string, className: string }> = {
  plan: { label: '规划', className: 'text-cyan-200 border-cyan-500/40 bg-cyan-500/10' },
  execute: { label: '执行', className: 'text-blue-200 border-blue-500/40 bg-blue-500/10' },
  verify: { label: '验收', className: 'text-amber-200 border-amber-500/40 bg-amber-500/10' },
  fallback: { label: '恢复', className: 'text-rose-200 border-rose-500/40 bg-rose-500/10' },
  deliver: { label: '交付', className: 'text-emerald-200 border-emerald-500/40 bg-emerald-500/10' },
  approval: { label: '审批', className: 'text-violet-200 border-violet-500/40 bg-violet-500/10' },
}

const markdownRenderComponents = {
  h1: ({ children }: any) => <h1 className="text-base font-semibold mt-2 mb-1">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-sm font-semibold mt-2 mb-1">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-sm font-medium mt-2 mb-1">{children}</h3>,
  p: ({ children }: any) => <p className="leading-6 mb-1">{children}</p>,
  ul: ({ children }: any) => <ul className="list-disc pl-5 space-y-1">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal pl-5 space-y-1">{children}</ol>,
  li: ({ children }: any) => <li>{children}</li>,
  code: ({ children }: any) => <code className="px-1 py-0.5 rounded bg-neutral-900/70 text-cyan-100">{children}</code>,
}
const summarizeApprovalPayload = (record: ExecutionApprovalRecord): string[] => {
  const payload = record.payload || {}
  const input = (payload.input && typeof payload.input === 'object') ? payload.input as Record<string, unknown> : {}
  const lines: string[] = []
  if (typeof input.command === 'string' && input.command.trim()) {
    lines.push(`命令: ${input.command.trim()}`)
  }
  if (typeof input.path === 'string' && input.path.trim()) {
    lines.push(`路径: ${input.path.trim()}`)
  }
  const goalTaskId = parseGoalTaskId(payload.goal_task_id)
  if (goalTaskId) lines.push(`关联任务: #${goalTaskId}`)
  if (typeof payload.session_id === 'string' && payload.session_id.trim()) {
    lines.push(`会话: ${payload.session_id.trim()}`)
  }
  return lines.slice(0, 4)
}

const avatarAnimationClass: Record<OwnerState, string> = {
  pending_review: 'animate-pulse',
  in_progress: 'animate-bounce',
  rejected: 'animate-pulse',
  healthy: '',
}

const formatDispatchDescription = (dueAt: string, reviewer: string, requirement: string) => {
  const lines = ['[派单信息]']
  if (dueAt) lines.push(`截止时间: ${dueAt.replace('T', ' ')}`)
  if (reviewer.trim()) lines.push(`验收人: ${reviewer.trim()}`)
  if (requirement.trim()) lines.push(`执行要求: ${requirement.trim()}`)
  return lines.join('\n')
}

const getRemediationPriority = (item: GoalSupervisorReviewItem): 'P0' | 'P1' | 'P2' => {
  if (item.score < 60 || item.rejected >= 2) return 'P0'
  if (item.score < 75 || item.pending_review >= 2) return 'P1'
  return 'P2'
}

const summarizeRejectedLessons = (tasks: GoalTaskListItem[]) => {
  if (!tasks.length) return '暂无历史失败样本'
  return tasks
    .slice(0, 2)
    .map((task, idx) => `${idx + 1}) #${task.id} ${task.title} | 原因: ${task.review_note || '未记录'}`)
    .join('\n')
}

const pixelBgStyle = {
  backgroundColor: '#0b1220',
  backgroundImage:
    'linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)',
  backgroundSize: '18px 18px',
} as const

const pixelPanelClass =
  'rounded-none border-2 border-neutral-700 bg-neutral-950/80 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.45)]'

const pixelButtonClass =
  'inline-flex items-center justify-center whitespace-nowrap rounded-none border-2 border-neutral-600 bg-neutral-900 px-3 py-1.5 text-xs leading-none text-neutral-100 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.45)] hover:border-cyan-400 hover:text-cyan-200 active:translate-x-[1px] active:translate-y-[1px] transition'

const pixelInputClass =
  'rounded-none border-2 border-neutral-700 bg-black/70 px-2.5 py-2 text-xs text-neutral-100 focus:border-cyan-500 focus:outline-none'

const buildExecutionPlan = (title: string, requirement: string): string[] => {
  const text = `${title} ${requirement}`.toLowerCase()
  const plan = ['明确目标与交付格式', '收集资料并提炼要点']
  if (text.includes('ppt') || text.includes('幻灯') || text.includes('汇报')) {
    plan.push('生成PPT结构与每页关键信息', '输出可直接使用的大纲与备注')
  } else if (text.includes('文章') || text.includes('周报') || text.includes('通知')) {
    plan.push('完成内容草稿并优化表达', '生成终稿并给出可发送版本')
  } else if (text.includes('简历') || text.includes('招聘')) {
    plan.push('按标准筛选并打分', '输出候选人分层与面试建议')
  } else {
    plan.push('执行任务并沉淀结果', '输出可验收结果与后续建议')
  }
  return plan
}

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))
const triggerBrowserDownload = (filename: string, content: string) => {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const saveDeliverableFile = async (filename: string, content: string) => {
  const isTauri = typeof (window as any).__TAURI__ !== 'undefined' || typeof (window as any).__TAURI_INTERNALS__ !== 'undefined'
  if (!isTauri) {
    triggerBrowserDownload(filename, content)
    return
  }
  try {
    const platform = await TauriService.getPlatformInfo()
    const configuredBase = (localStorage.getItem('cks.settings.deliverableDir') || '').trim()
    const base = configuredBase || (platform.os === 'windows'
      ? 'C:\\Users\\Public\\Documents\\CKS-Deliverables'
      : '/tmp/cks-deliverables')
    const filePath = platform.os === 'windows' ? `${base}\\${filename}` : `${base}/${filename}`
    const written = await TauriService.writeFileContent(filePath, content)
    if (!written) throw new Error(`write_file_content returned false for ${filePath}`)
    window.alert(`文件已保存：${filePath}`)
  } catch (error) {
    console.error('Failed to save deliverable via Tauri, fallback to browser download:', error)
    triggerBrowserDownload(filename, content)
    window.alert('本地保存失败，已自动切换为浏览器下载。')
  }
}

const buildTaskDeliverable = (title: string, requirement: string, assignee: string): string => {
  const text = `${title} ${requirement}`.toLowerCase()
  if (text.includes('ppt') || text.includes('路演') || text.includes('8页')) {
    return [
      `负责人：${assignee}`,
      '交付件：8页PPT结构与讲解词',
      '',
      '第1页 封面｜一人公司如何用多Agent提效',
      '讲解词：说明目标是“老板下达任务，数字员工自动执行并回流验收”。',
      '第2页 行业痛点｜人效低、流程散、协同慢',
      '讲解词：传统流程依赖人工串联，任务追踪与验收成本高。',
      '第3页 方案总览｜主Agent + SubAgent + Skills',
      '讲解词：主Agent做拆解调度，SubAgent并行执行，Skills扩展能力边界。',
      '第4页 执行链路｜派单→计划→执行→验收',
      '讲解词：任务被拆解为可执行步骤，并可见阶段日志与风险点。',
      '第5页 产出示例｜周报、PPT、候选人筛选报告',
      '讲解词：展示可直接发送/汇报的标准化内容成品。',
      '第6页 看板回流｜状态、日志、结果一体化',
      '讲解词：老板只看结果，不需要进入执行细节页面。',
      '第7页 ROI预估｜效率提升与交付稳定性',
      '讲解词：预估缩短交付周期30%-50%，减少重复沟通成本。',
      '第8页 落地计划｜试点团队→全员推广',
      '讲解词：先从高频任务试点，逐步扩展至财务/人力/运营全职能。',
    ].join('\n')
  }
  if (text.includes('周报') || text.includes('公告') || text.includes('邮件')) {
    return [
      `负责人：${assignee}`,
      '交付件：经营周报（邮件版 + 群公告版）',
      '',
      '【邮件版】',
      '主题：本周经营回顾与下周重点',
      '1) 销售增长12%，核心转化来自重点渠道优化。',
      '2) 交付延迟2个项目，原因是资源冲突与需求变更。',
      '3) 客户满意度92%，服务响应效率提升明显。',
      '下周动作：优先消化延迟项目，锁定交付里程碑与责任人。',
      '',
      '【群公告版】',
      '本周三项关键数据：销售+12%｜延迟项目2个｜满意度92%。',
      '请各负责人今天18:00前提交下周里程碑与风险预案。',
    ].join('\n')
  }
  if (text.includes('简历') || text.includes('筛选')) {
    return [
      `负责人：${assignee}`,
      '交付件：候选人A/B/C分层报告',
      '',
      'A档（优先面试）：3人',
      '- 优势：项目经验完整、业务理解强、沟通清晰',
      'B档（补充评估）：4人',
      '- 优势：技术匹配中等，需增加场景题验证',
      'C档（暂缓）：3人',
      '- 原因：关键经验不足或稳定性风险较高',
      '',
      '面试建议：A档先技术后业务，B档增加实操题，C档进入人才库跟踪。',
    ].join('\n')
  }
  return [
    `负责人：${assignee}`,
    `交付件：${title} 执行结果`,
    '',
    '已完成目标拆解、执行与校验，产出满足可验收标准。',
    `执行要求：${requirement || '按任务要求输出标准结果'}`,
  ].join('\n')
}

const createQuickTaskDraft = (assignee = '', detail = '', output = '', projectId = ''): QuickTaskDraft => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  projectId,
  assignee,
  detail,
  input: '',
  output,
})

const avatarPool = [avatar0, avatar1, avatar2, avatar3, avatar4, avatar5, avatar6, avatar7, avatar8, avatar9]

const pickAvatarByName = (name: string): string => {
  const seed = (name || '').split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  return avatarPool[seed % avatarPool.length]
}

const quickBossTemplates: Array<{
  key: string
  label: string
  line: string
}> = [
  {
    key: 'write-weekly',
    label: '写周报',
    line: '内容Agent | 基于本周数据写一份全员周报 | 语气专业且有鼓舞性，给出邮件版和群公告版',
  },
  {
    key: 'ppt-outline',
    label: '做PPT',
    line: '产品Agent | 生成“AI办公提效”8页PPT大纲 | 每页包含标题、要点、讲解词',
  },
  {
    key: 'resume-screen',
    label: '筛简历',
    line: '人力Agent | 筛选10份候选简历并分A/B/C档 | 输出推荐理由与面试建议',
  },
  {
    key: 'finance-ledger',
    label: '做台账',
    line: '财务Agent | 整理本周报销票据并生成台账 | 输出汇总表和风险提示',
  },
]

export const Board = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const profile = useUserStore((state) => state.profile)
  const createSession = useChatStore((state) => state.createSession)
  const sessions = useChatStore((state) => state.sessions)
  const setSessionGoalTask = useChatStore((state) => state.setSessionGoalTask)
  const setSessionOrganization = useChatStore((state) => state.setSessionOrganization)
  const setCurrentSession = useChatStore((state) => state.setCurrentSession)

  const [summary, setSummary] = useState<GoalsDashboardSummary>(emptySummary)
  const [owners, setOwners] = useState<GoalsDashboardOwnerRow[]>([])
  const [organizationId, setOrganizationId] = useState(() => localStorage.getItem('cks.board.organizationId') || 'default-org')
  const [organizationCatalog, setOrganizationCatalog] = useState<string[]>(() => {
    const raw = (localStorage.getItem('cks.board.organizationCatalog') || '').split(',').map((v) => v.trim()).filter(Boolean)
    return raw.length > 0 ? raw : ['default-org']
  })
  const [newOrganizationId, setNewOrganizationId] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [employees, setEmployees] = useState<AiEmployee[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<EmployeeTemplateKey>('frontend-engineer')
  const [customEmployeeName, setCustomEmployeeName] = useState('')
  const [customEmployeeRole, setCustomEmployeeRole] = useState('')
  const [customEmployeeSpecialty, setCustomEmployeeSpecialty] = useState('')
  const [customEmployeeSkills, setCustomEmployeeSkills] = useState('')
  const [skillPresets, setSkillPresets] = useState<SkillPreset[]>([])
  const [presetName, setPresetName] = useState('')
  const [presetSkills, setPresetSkills] = useState('')
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [editingEmployeeName, setEditingEmployeeName] = useState('')
  const [editingEmployeeDraft, setEditingEmployeeDraft] = useState<{
    role: string
    specialty: string
    primarySkill: string
    skillStack: string
  }>({ role: '', specialty: '', primarySkill: '', skillStack: '' })
  const [availableSkillNames, setAvailableSkillNames] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [fromTime, setFromTime] = useState('')
  const [toTime, setToTime] = useState('')
  const [mode, setMode] = useState<BoardMode>('game')
  const [selectedOwner, setSelectedOwner] = useState<GoalsDashboardOwnerRow | null>(null)
  const [highlightGoalTaskId, setHighlightGoalTaskId] = useState<number | null>(null)
  const [runningAssignee, setRunningAssignee] = useState('')
  const [settingNextTask, setSettingNextTask] = useState(false)
  const [ownerTasks, setOwnerTasks] = useState<GoalTaskListItem[]>([])
  const [ownerTasksLoading, setOwnerTasksLoading] = useState(false)
  const [ownerTaskReadinessMap, setOwnerTaskReadinessMap] = useState<Record<number, GoalTaskExecutionReadiness>>({})
  const [selectedTaskBubble, setSelectedTaskBubble] = useState<GoalTaskListItem | null>(null)
  const [dispatchProjects, setDispatchProjects] = useState<DispatchProjectOption[]>([])
  const [dispatchLoading, setDispatchLoading] = useState(false)
  const [dispatchSubmitting, setDispatchSubmitting] = useState(false)
  const [dispatchProjectId, setDispatchProjectId] = useState('')
  const [dispatchTitle, setDispatchTitle] = useState('')
  const [dispatchAssignee, setDispatchAssignee] = useState('')
  const [dispatchDueAt, setDispatchDueAt] = useState('')
  const [dispatchReviewer, setDispatchReviewer] = useState('manager')
  const [dispatchRequirement, setDispatchRequirement] = useState('')
  const [dispatchAutoSetNext, setDispatchAutoSetNext] = useState(true)
  const [dispatchAutoLaunch, setDispatchAutoLaunch] = useState(false)
  const [simpleMode, setSimpleMode] = useState(true)
  const [simpleIdleOnly, setSimpleIdleOnly] = useState(false)
  const [quickTaskDrafts, setQuickTaskDrafts] = useState<QuickTaskDraft[]>([])
  const [quickDispatching, setQuickDispatching] = useState(false)
  const [quickJobs, setQuickJobs] = useState<QuickBossJob[]>([])
  const [quickJobLogs, setQuickJobLogs] = useState<Record<number, QuickJobLogBundle>>({})
  const [quickJobTaskDetails, setQuickJobTaskDetails] = useState<Record<number, GoalTaskListItem>>({})
  const [expandedQuickJobId, setExpandedQuickJobId] = useState<number | null>(null)
  const [quickResultModalTaskId, setQuickResultModalTaskId] = useState<number | null>(null)
  const [quickReworkFeedback, setQuickReworkFeedback] = useState('')
  const [quickReworkSubmitting, setQuickReworkSubmitting] = useState(false)
  const [selectedParallelAgents, setSelectedParallelAgents] = useState<string[]>([])
  const [parallelDispatching, setParallelDispatching] = useState(false)
  const [supervisorObjective, setSupervisorObjective] = useState('')
  const [supervisorDispatching, setSupervisorDispatching] = useState(false)
  const [supervisorAutoLaunch, setSupervisorAutoLaunch] = useState(true)
  const [showSupervisorControls, setShowSupervisorControls] = useState(false)
  const [supervisorReviewing, setSupervisorReviewing] = useState(false)
  const [supervisorRepairSubmitting, setSupervisorRepairSubmitting] = useState(false)
  const [supervisorRepairAutoLaunch, setSupervisorRepairAutoLaunch] = useState(true)
  const [supervisorReviewReport, setSupervisorReviewReport] = useState<{
    overallScore: number
    items: GoalSupervisorReviewItem[]
    updatedAt: string
  } | null>(null)
  const [quickAssigningEmployee, setQuickAssigningEmployee] = useState('')
  const [simpleFocusEmployeeName, setSimpleFocusEmployeeName] = useState('')
  const [simpleRecruitOpen, setSimpleRecruitOpen] = useState(false)
  const [simpleRecruitPrimarySkill, setSimpleRecruitPrimarySkill] = useState('')
  const [handoffTasks, setHandoffTasks] = useState<GoalTaskListItem[]>([])
  const [handoffLoading, setHandoffLoading] = useState(false)
  const [handoffClaimingTaskId, setHandoffClaimingTaskId] = useState<number | null>(null)
  const [handoffOwner, setHandoffOwner] = useState('manager')
  const [handoffAssigneeFilter, setHandoffAssigneeFilter] = useState('all')
  const [handoffNotifyTaskId, setHandoffNotifyTaskId] = useState<number | null>(null)
  const [selectedHandoffTaskIds, setSelectedHandoffTaskIds] = useState<number[]>([])
  const [batchProcessing, setBatchProcessing] = useState(false)
  const [rejected7d, setRejected7d] = useState(0)
  const [pendingReview7d, setPendingReview7d] = useState(0)
  const [claimed7d, setClaimed7d] = useState(0)
  const [recentTasks7d, setRecentTasks7d] = useState<GoalTaskListItem[]>([])
  const [approvalRecords, setApprovalRecords] = useState<ExecutionApprovalRecord[]>([])
  const [approvalStatusFilter, setApprovalStatusFilter] = useState<ApprovalViewStatus>('all')
  const [approvalDeciderFilter, setApprovalDeciderFilter] = useState('')
  const [approvalToolFilter, setApprovalToolFilter] = useState('all')
  const [approvalHighRiskOnly, setApprovalHighRiskOnly] = useState(false)
  const [approvalRecent24hOnly, setApprovalRecent24hOnly] = useState(false)
  const [linkedChannelTask, setLinkedChannelTask] = useState<ChannelTask | null>(null)
  const [linkedChannelTaskLoading, setLinkedChannelTaskLoading] = useState(false)
  const [channelTaskAssignee, setChannelTaskAssignee] = useState('')
  const [channelTaskDispatching, setChannelTaskDispatching] = useState(false)
  const [channelDispatchResult, setChannelDispatchResult] = useState<{
    sourceChannelTaskId: number
    goalTaskId: number
    assignee: string
    at: string
  } | null>(null)
  const linkedChannelTaskRef = useRef<string>('')
  const highlightedTaskScrollRef = useRef<number | null>(null)
  const orgConfigInputRef = useRef<HTMLInputElement | null>(null)
  const quickJobsStorageKey = `cks.board.quickJobs.${organizationId}`

  const load = useCallback(async () => {
    setLoading(true)
    setHandoffLoading(true)
    try {
      const fromIso = toIso(fromTime) || undefined
      const toIsoValue = toIso(toTime) || undefined
      const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const [dashboardResult, handoffResult, rejectedTrend, pendingTrend, claimedTrend, recentTasksTrend, approvalsResult] = await Promise.all([
        AgentService.getGoalsDashboard({
          organizationId,
          fromTime: fromIso,
          toTime: toIsoValue,
          limit: 5000,
        }),
        AgentService.listGoalTasks({
          organizationId,
          reviewStatus: 'rejected',
          handoffStatus: 'pending',
          fromTime: fromIso,
          toTime: toIsoValue,
          limit: 30,
        }),
        AgentService.listGoalTasks({
          organizationId,
          reviewStatus: 'rejected',
          fromTime: sevenDaysAgoIso,
          limit: 5000,
        }),
        AgentService.listGoalTasks({
          organizationId,
          reviewStatus: 'pending',
          status: 'done',
          fromTime: sevenDaysAgoIso,
          limit: 5000,
        }),
        AgentService.listGoalTasks({
          organizationId,
          handoffStatus: 'claimed',
          fromTime: sevenDaysAgoIso,
          limit: 5000,
        }),
        AgentService.listGoalTasks({
          organizationId,
          fromTime: sevenDaysAgoIso,
          limit: 5000,
        }),
        AgentService.listExecutionApprovals(undefined, 120, organizationId),
      ])

      if (dashboardResult?.success) {
        setSummary(dashboardResult.summary || emptySummary)
        setOwners(dashboardResult.owners || [])
      }
      if (handoffResult?.success && handoffResult.tasks) {
        setHandoffTasks(handoffResult.tasks)
      } else {
        setHandoffTasks([])
      }
      setRejected7d(rejectedTrend?.success ? (rejectedTrend.total || 0) : 0)
      setPendingReview7d(pendingTrend?.success ? (pendingTrend.total || 0) : 0)
      setClaimed7d(claimedTrend?.success ? (claimedTrend.total || 0) : 0)
      setRecentTasks7d(recentTasksTrend?.success && recentTasksTrend.tasks ? recentTasksTrend.tasks : [])
      if (approvalsResult?.success && approvalsResult.items) {
        setApprovalRecords(approvalsResult.items)
      } else {
        setApprovalRecords([])
      }
    } catch (error) {
      console.error('Failed to load board dashboard:', error)
      setHandoffTasks([])
      setRejected7d(0)
      setPendingReview7d(0)
      setClaimed7d(0)
      setRecentTasks7d([])
      setApprovalRecords([])
    } finally {
      setLoading(false)
      setHandoffLoading(false)
    }
  }, [fromTime, toTime, organizationId])

  const runSupervisorDispatch = useCallback(async () => {
    setSupervisorDispatching(true)
    try {
      const result = await AgentService.runSupervisorDispatch({
        organizationId,
        objective: supervisorObjective.trim(),
        maxAssignees: 8,
        preferPendingReview: true,
        supervisorName: 'Supervisor-Agent',
      })
      if (!result?.success) {
        window.alert(result?.error || '主管调度失败')
        return
      }
      const total = Number(result.total || 0)
      await load()
      if (total <= 0) {
        window.alert('主管调度已执行：当前没有可分派的任务。')
        return
      }
      const dispatched = result.dispatched || []
      if (supervisorAutoLaunch && dispatched.length > 0) {
        const employeeByName = new Map(employees.map((item) => [item.name.trim(), item]))
        const createdSessions: string[] = []
        for (const item of dispatched) {
          const assignee = (item.assignee || '').trim()
          const taskId = Number(item.task_id || 0)
          if (!assignee || !taskId) continue
          const employee = employeeByName.get(assignee)
          if (employee) {
            const skillStack = employee.skillStack.length > 0 ? employee.skillStack : [employee.primarySkill]
            const failureLessons = await loadAssigneeRejectedLessons(assignee, [employee.primarySkill, ...skillStack])
            const seedPrompt = `你是${employee.role}，主技能是 ${employee.primarySkill}，技能组合为 ${skillStack.join('、')}。请优先使用这些技能执行当前任务并输出可验收结果。\n历史失败经验:\n${failureLessons}\n请避免重复上述失败。`
            try {
              await AgentService.upsertGoalTaskAgentProfile(taskId, {
                organizationId,
                assignee: employee.name,
                role: employee.role,
                specialty: employee.specialty,
                preferredSkill: employee.primarySkill,
                skillStack,
                skillStrict: false,
                seedPrompt,
              })
            } catch {
              // Ignore single profile write failure to keep dispatch pipeline moving.
            }
          }
          const sessionId = createSession(`执行任务 #${taskId} - ${assignee}`)
          setSessionGoalTask(sessionId, taskId)
          setSessionOrganization(sessionId, organizationId)
          createdSessions.push(sessionId)
        }
        if (createdSessions.length > 0) {
          setCurrentSession(createdSessions[0])
          navigate('/workbench')
        }
      }
      const preview = dispatched
        .slice(0, 3)
        .map((item) => `${item.assignee} -> #${item.task_id}`)
        .join('\n')
      const skippedPaused = Number(result.skipped_paused || 0)
      window.alert(`主管调度完成，共下发 ${total} 个任务（跳过暂停员工 ${skippedPaused} 个）。\n${preview}`)
    } catch (error) {
      console.error('Failed to run supervisor dispatch:', error)
      window.alert('主管调度失败，请稍后重试')
    } finally {
      setSupervisorDispatching(false)
    }
  }, [createSession, employees, load, navigate, organizationId, setCurrentSession, setSessionGoalTask, setSessionOrganization, supervisorAutoLaunch, supervisorObjective])

  const runSupervisorReview = useCallback(async () => {
    setSupervisorReviewing(true)
    try {
      const result = await AgentService.runSupervisorReview({
        organizationId,
        windowDays: 7,
        supervisorName: 'Supervisor-Agent',
      })
      if (!result?.success) {
        window.alert(result?.error || '主管验收失败')
        return
      }
      const items = (result.items || []).slice(0, 12)
      setSupervisorReviewReport({
        overallScore: Number(result.overall_score ?? 100),
        items,
        updatedAt: new Date().toISOString(),
      })
      const topRisk = items
        .slice(0, 3)
        .map((item) => `${item.assignee}: ${item.score} pts`)
        .join('\n')
      window.alert(`主管验收完成。\n整体评分：${result.overall_score ?? 100} 分\n重点关注：\n${topRisk || '暂无'}`)
    } catch (error) {
      console.error('Failed to run supervisor review:', error)
      window.alert('主管验收失败，请稍后重试')
    } finally {
      setSupervisorReviewing(false)
    }
  }, [organizationId])

  const createSupervisorRepairTasks = useCallback(async () => {
    if (!supervisorReviewReport || supervisorReviewReport.items.length === 0) {
      window.alert('请先执行主管验收，再生成整改任务。')
      return
    }
    const baseProjectId = Number(dispatchProjectId || 0) || (dispatchProjects[0]?.id ?? 0)
    if (!baseProjectId) {
      window.alert('请先在派单中心准备可用项目。')
      return
    }
    const targets = supervisorReviewReport.items
      .filter((item) => item.score < 80)
      .map((item) => ({ item, priority: getRemediationPriority(item) }))
      .sort((a, b) => {
        const order = { P0: 0, P1: 1, P2: 2 }
        const pa = order[a.priority]
        const pb = order[b.priority]
        if (pa !== pb) return pa - pb
        return a.item.score - b.item.score
      })
      .slice(0, 6)
    if (targets.length === 0) {
      window.alert('当前没有低于 80 分的员工，无需新增整改任务。')
      return
    }

    setSupervisorRepairSubmitting(true)
    try {
      const createdIds: number[] = []
      const createdAssignees: string[] = []
      for (const target of targets) {
        const item = target.item
        const priority = target.priority
        const title = `[${priority}] 主管整改任务：${item.assignee}（评分 ${item.score}）`
        const description = [
          '[Supervisor remediation task]',
          `remediation_priority: ${priority}`,
          `assignee: ${item.assignee}`,
          `score: ${item.score}`,
          `accepted: ${item.accepted}`,
          `pending_review: ${item.pending_review}`,
          `rejected: ${item.rejected}`,
          '',
          'Action:',
          '1) 复盘近7天问题任务',
          '2) 给出本周修复计划（含验收标准）',
          '3) 完成后回写任务并申请验收',
          '',
          'Acceptance criteria:',
          '- 输出一份可执行整改清单（负责人/时间/风险）',
          '- 至少完成 1 个可验收交付物（文档/脚本/页面）',
          '- 附审计摘要（做了什么、结果如何、下一步）',
        ].join('\n')
        const created = await AgentService.createGoalTask(
          baseProjectId,
          title,
          description,
          item.assignee,
          extractDepartment(item.assignee)
        )
        if (!created?.success || !created.id) continue
        createdIds.push(created.id)
        createdAssignees.push(item.assignee)
        await AgentService.setDashboardNextTask(item.assignee, created.id, organizationId)
      }
      await load()
      if (createdIds.length === 0) {
        window.alert('整改任务创建失败，请稍后重试。')
        return
      }
      window.alert(`已创建 ${createdIds.length} 个整改任务。`)
      if (supervisorRepairAutoLaunch && createdIds[0]) {
        const taskId = createdIds[0]
        const assignee = createdAssignees[0] || targets[0]?.item.assignee || ''
        const employeeByName = new Map(employees.map((emp) => [emp.name.trim(), emp]))
        const employee = employeeByName.get(assignee.trim())
        if (employee) {
          const skillStack = employee.skillStack.length > 0 ? employee.skillStack : [employee.primarySkill]
          const seedPrompt = `你是${employee.role}，请优先完成该整改任务并按验收标准输出结果。技能组合：${skillStack.join('、')}。`
          try {
            await AgentService.upsertGoalTaskAgentProfile(taskId, {
              organizationId,
              assignee: employee.name,
              role: employee.role,
              specialty: employee.specialty,
              preferredSkill: employee.primarySkill,
              skillStack,
              skillStrict: false,
              seedPrompt,
            })
          } catch {
            // keep launch flow resilient
          }
        }
        const sessionId = createSession(`整改任务 #${taskId} - ${assignee || 'Agent'}`)
        setSessionGoalTask(sessionId, taskId)
        setSessionOrganization(sessionId, organizationId)
        setCurrentSession(sessionId)
        navigate('/workbench')
      }
    } catch (error) {
      console.error('Failed to create supervisor repair tasks:', error)
      window.alert('整改任务创建失败，请稍后重试。')
    } finally {
      setSupervisorRepairSubmitting(false)
    }
  }, [createSession, dispatchProjectId, dispatchProjects, employees, load, navigate, organizationId, setCurrentSession, setSessionGoalTask, setSessionOrganization, supervisorRepairAutoLaunch, supervisorReviewReport])

  useEffect(() => {
    let cancelled = false
    const loadSkillCatalog = async () => {
      try {
        const result = await AgentService.listSkills()
        if (!cancelled && result?.success && Array.isArray(result.skills)) {
          const names = Array.from(
            new Set(
              result.skills
                .map((skill) => (skill.name || '').trim())
                .filter(Boolean)
            )
          ).sort((a, b) => a.localeCompare(b))
          setAvailableSkillNames(names)
        }
      } catch (error) {
        console.warn('Failed to load skill catalog for employees:', error)
      }
    }
    void loadSkillCatalog()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const loadOrganizationProfiles = async () => {
      try {
        const [employeeResult, presetResult] = await Promise.all([
          AgentService.listAiEmployees(organizationId),
          AgentService.listAiSkillPresets(organizationId),
        ])
        if (cancelled) return

        const nextEmployees = (employeeResult?.success && Array.isArray(employeeResult.items)
          ? employeeResult.items
          : []
        )
          .map((item) => {
            const primarySkill = String(item?.primary_skill || '').trim() || 'find-skills'
            const stack = Array.isArray(item?.skill_stack)
              ? item.skill_stack.map((v) => String(v || '').trim()).filter(Boolean)
              : []
            return {
              name: String(item?.name || '').trim(),
              role: String(item?.role || '').trim(),
              specialty: String(item?.specialty || '').trim(),
              primarySkill,
              skillStack: stack.length > 0 ? stack : [primarySkill],
              status: (item?.status === 'paused' ? 'paused' : 'active') as EmployeeStatus,
            }
          })
          .filter((item) => item.name)

        const nextPresets = (presetResult?.success && Array.isArray(presetResult.items)
          ? presetResult.items
          : []
        )
          .map((item) => {
            const primarySkill = String(item?.primary_skill || '').trim()
            const skills = Array.isArray(item?.skills)
              ? item.skills.map((v) => String(v || '').trim()).filter(Boolean)
              : []
            return {
              id: String(item?.id || '').trim(),
              name: String(item?.name || '').trim(),
              primarySkill: primarySkill || skills[0] || '',
              skills: skills.length > 0 ? skills : (primarySkill ? [primarySkill] : []),
            }
          })
          .filter((item) => item.id && item.name && item.primarySkill && item.skills.length > 0)

        setEmployees(nextEmployees)
        setSkillPresets(nextPresets)
      } catch (error) {
        console.error('Failed to load employee profiles from API:', error)
        if (!cancelled) {
          setEmployees([])
          setSkillPresets([])
        }
      }
    }
    void loadOrganizationProfiles()
    return () => {
      cancelled = true
    }
  }, [organizationId])

  useEffect(() => {
    if (owners.length === 0) return
    const toPersist: AiEmployee[] = []
    setEmployees((prev) => {
      const map = new Map(prev.map((item) => [item.name, item]))
      for (const owner of owners) {
        const assignee = (owner.assignee || '').trim()
        if (!assignee || map.has(assignee)) continue
        const inferred = inferRoleByAssignee(assignee)
        const generated: AiEmployee = {
          name: assignee,
          role: inferred.role,
          specialty: inferred.specialty,
          primarySkill: inferred.primarySkill,
          skillStack: inferred.defaultSkillStack,
          status: 'active',
        }
        map.set(assignee, generated)
        toPersist.push(generated)
      }
      return Array.from(map.values())
    })
    if (toPersist.length === 0) return
    void Promise.allSettled(
      toPersist.map((item) => AgentService.upsertAiEmployee({
        organizationId,
        name: item.name,
        role: item.role,
        specialty: item.specialty,
        primarySkill: item.primarySkill,
        skillStack: item.skillStack,
        status: item.status,
      }))
    )
  }, [organizationId, owners])

  useEffect(() => {
    localStorage.setItem('cks.board.organizationId', organizationId)
  }, [organizationId])

  useEffect(() => {
    const current = (organizationId || '').trim()
    if (!current) return
    setOrganizationCatalog((prev) => {
      if (prev.includes(current)) return prev
      return [current, ...prev].slice(0, 20)
    })
  }, [organizationId])

  useEffect(() => {
    localStorage.setItem('cks.board.organizationCatalog', organizationCatalog.join(','))
  }, [organizationCatalog])

  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const scopedOrg = (params.get('organization_id') || '').trim()
    if (scopedOrg && scopedOrg !== organizationId) {
      setOrganizationId(scopedOrg)
    }
  }, [location.search, organizationId])
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const rawTaskId = (params.get('channel_task_id') || '').trim()
    if (!rawTaskId) {
      setLinkedChannelTask(null)
      return
    }
    if (linkedChannelTaskRef.current === rawTaskId) return
    linkedChannelTaskRef.current = rawTaskId
    const taskId = Number(rawTaskId)
    if (!Number.isFinite(taskId) || taskId <= 0) {
      navigate('/board', { replace: true })
      return
    }

    const loadLinkedTask = async () => {
      setLinkedChannelTaskLoading(true)
      try {
        const result = await AgentService.listChannelTasks({
          channel: 'feishu',
          limit: 200,
        })
        if (result?.success && Array.isArray(result.tasks)) {
          const task = result.tasks.find((item) => item.id === taskId) || null
          setLinkedChannelTask(task)
        } else {
          setLinkedChannelTask(null)
        }
      } catch (error) {
        console.error('Failed to load linked channel task:', error)
        setLinkedChannelTask(null)
      } finally {
        setLinkedChannelTaskLoading(false)
      }
    }
    loadLinkedTask()
  }, [location.search, navigate])

  useEffect(() => {
    if (!selectedOwner) return
    const latest = owners.find((owner) => owner.assignee === selectedOwner.assignee) || null
    setSelectedOwner(latest)
  }, [owners, selectedOwner?.assignee])
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const assignee = (params.get('assignee') || '').trim()
    if (!assignee) return
    const matched = owners.find((owner) => (owner.assignee || '').trim() === assignee)
    if (matched) {
      setSelectedOwner(matched)
      setMode('table')
    }
  }, [location.search, owners])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const rawTaskId = (params.get('task_id') || '').trim()
    if (!rawTaskId) {
      setHighlightGoalTaskId(null)
      return
    }
    const taskId = Number(rawTaskId)
    if (!Number.isFinite(taskId) || taskId <= 0) {
      setHighlightGoalTaskId(null)
      return
    }
    setHighlightGoalTaskId(taskId)
    const applyTaskFocus = async () => {
      try {
        const result = await AgentService.listGoalTasks({
          organizationId,
          taskId,
          limit: 1,
        })
        const task = result?.success && result.tasks ? result.tasks[0] : null
        if (!task) return
        const matched = owners.find((owner) => (owner.assignee || '').trim() === (task.assignee || '').trim()) || null
        if (matched) setSelectedOwner(matched)
        setSelectedTaskBubble(task)
        setMode('table')
      } catch (error) {
        console.error('Failed to focus task from query:', error)
      }
    }
    void applyTaskFocus()
  }, [location.search, organizationId, owners])

  useEffect(() => {
    if (!highlightGoalTaskId) return
    const selectors = [
      `[data-highlight-task-id="${highlightGoalTaskId}"]`,
      `[data-task-id="${highlightGoalTaskId}"]`,
    ]
    let target: Element | null = null
    for (const selector of selectors) {
      target = document.querySelector(selector)
      if (target) break
    }
    if (!target) return
    if (highlightedTaskScrollRef.current === highlightGoalTaskId) return
    highlightedTaskScrollRef.current = highlightGoalTaskId
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlightGoalTaskId, handoffTasks, ownerTasks, owners.length])

  useEffect(() => {
    if (highlightGoalTaskId) return
    highlightedTaskScrollRef.current = null
  }, [highlightGoalTaskId])

  useEffect(() => {
    if (!selectedOwner?.assignee) {
      setOwnerTasks([])
      setOwnerTaskReadinessMap({})
      setSelectedTaskBubble(null)
      return
    }
    const loadOwnerTasks = async () => {
      setOwnerTasksLoading(true)
      try {
        const result = await AgentService.listGoalTasks({
          organizationId,
          assignee: selectedOwner.assignee,
          limit: 50,
        })
        if (result?.success && result.tasks) {
          setOwnerTasks(result.tasks)
          setSelectedTaskBubble(result.tasks[0] || null)
        } else {
          setOwnerTasks([])
          setOwnerTaskReadinessMap({})
          setSelectedTaskBubble(null)
        }
      } catch (error) {
        console.error('Failed to load owner tasks:', error)
        setOwnerTasks([])
        setOwnerTaskReadinessMap({})
        setSelectedTaskBubble(null)
      } finally {
        setOwnerTasksLoading(false)
      }
    }
    loadOwnerTasks()
  }, [selectedOwner?.assignee, organizationId])

  useEffect(() => {
    if (!selectedOwner?.assignee || ownerTasks.length === 0) {
      setOwnerTaskReadinessMap({})
      return
    }
    let cancelled = false
    const loadReadinessBatch = async () => {
      const taskIds = ownerTasks.slice(0, 16).map((task) => task.id)
      const results = await Promise.all(
        taskIds.map(async (taskId) => {
          try {
            const result = await AgentService.getGoalTaskExecutionReadiness(taskId, organizationId)
            if (result?.success && result.data) return [taskId, result.data] as const
          } catch {
            // ignore per-task readiness failure
          }
          return null
        })
      )
      if (cancelled) return
      const nextMap: Record<number, GoalTaskExecutionReadiness> = {}
      for (const item of results) {
        if (!item) continue
        nextMap[item[0]] = item[1]
      }
      setOwnerTaskReadinessMap(nextMap)
    }
    void loadReadinessBatch()
    return () => {
      cancelled = true
    }
  }, [organizationId, ownerTasks, selectedOwner?.assignee])

  useEffect(() => {
    const loadDispatchProjects = async () => {
      setDispatchLoading(true)
      try {
        const result = await AgentService.getGoalsTree(organizationId)
        if (!result?.success || !result.data?.kpis) {
          setDispatchProjects([])
          return
        }

        const options: DispatchProjectOption[] = []
        for (const kpi of result.data.kpis) {
          for (const okr of kpi.okrs || []) {
            for (const project of okr.projects || []) {
              options.push({
                id: project.id,
                label: `${kpi.title} / ${okr.title} / ${project.title}`,
              })
            }
          }
        }

        setDispatchProjects(options)
        if (options.length > 0) {
          setDispatchProjectId((prev) => prev || String(options[0].id))
        }
      } catch (error) {
        console.error('Failed to load dispatch project options:', error)
      } finally {
        setDispatchLoading(false)
      }
    }
    loadDispatchProjects()
  }, [organizationId])

  useEffect(() => {
    if (dispatchAssignee.trim()) return
    const active = employees.find((item) => item.status === 'active')
    if (active) setDispatchAssignee(active.name)
  }, [dispatchAssignee, employees])

  useEffect(() => {
    if (!linkedChannelTask) return
    if (channelTaskAssignee.trim()) return
    const active = employees.find((item) => item.status === 'active')
    if (active) {
      setChannelTaskAssignee(active.name)
      return
    }
    const firstOwner = (owners[0]?.assignee || '').trim()
    if (firstOwner) setChannelTaskAssignee(firstOwner)
  }, [channelTaskAssignee, employees, linkedChannelTask, owners])

  useEffect(() => {
    if (!linkedChannelTask) {
      setChannelDispatchResult(null)
      return
    }
    if (channelDispatchResult && channelDispatchResult.sourceChannelTaskId !== linkedChannelTask.id) {
      setChannelDispatchResult(null)
    }
  }, [channelDispatchResult, linkedChannelTask])

  const cards = useMemo(
    () => [
      { title: '待验收', value: summary.pending_review, color: 'text-amber-300 border-amber-500/30 bg-amber-500/10' },
      { title: '进行中', value: summary.in_progress, color: 'text-blue-300 border-blue-500/30 bg-blue-500/10' },
      { title: '已验收', value: summary.accepted, color: 'text-green-300 border-green-500/30 bg-green-500/10' },
      { title: '驳回返工', value: summary.rejected, color: 'text-rose-300 border-rose-500/30 bg-rose-500/10' },
    ],
    [summary]
  )
  const simpleControlSummary = useMemo(() => {
    const pendingApprovals = approvalRecords.filter((item) => item.status === 'pending').length
    const deniedApprovals = approvalRecords.filter((item) => item.status === 'denied').length
    const runningJobs = quickJobs.filter((item) => item.statusLabel.includes('执行中')).length
    const failedJobs = quickJobs.filter((item) => item.statusLabel.includes('失败') || item.statusLabel.includes('驳回')).length
    return {
      pendingApprovals,
      deniedApprovals,
      runningJobs,
      failedJobs,
    }
  }, [approvalRecords, quickJobs])
  const simpleControlFeed = useMemo<SimpleControlFeedItem[]>(() => {
    const approvalItems: SimpleControlFeedItem[] = approvalRecords.slice(0, 8).map((item) => ({
      key: `approval-${item.id}`,
      at: item.updated_at || item.created_at || new Date().toISOString(),
      text: `审批 ${item.id.slice(0, 6)} · ${item.tool_name} · ${getApprovalStatusMeta(item.status).label}`,
      tone: item.status === 'denied' ? 'text-rose-300' : item.status === 'pending' ? 'text-amber-300' : 'text-emerald-300',
      category: 'approval',
    }))
    const runItems: SimpleControlFeedItem[] = quickJobs.slice(0, 12).map((item) => {
      const tone = item.statusLabel.includes('失败') || item.statusLabel.includes('驳回')
        ? 'text-rose-300'
        : item.statusLabel.includes('执行中')
          ? 'text-cyan-200'
          : 'text-neutral-300'
      const category = getSimpleFeedCategory(item.subagentRunStatus || item.statusLabel, item.statusLabel)
      return {
        key: `run-${item.taskId}`,
        at: item.updatedAt,
        text: `任务 #${item.taskId} · ${item.assignee} · ${item.statusLabel}`,
        tone,
        category,
        taskId: item.taskId,
      }
    })
    const phaseItems: SimpleControlFeedItem[] = Object.entries(quickJobLogs).slice(0, 12).flatMap(([taskId, log]) => {
      const latest = log.executions[0]
      if (!latest) return []
      const category = getSimpleFeedCategory(latest.tool_name || '', latest.message || '')
      return [{
        key: `phase-${taskId}-${latest.timestamp}`,
        at: latest.timestamp || new Date().toISOString(),
        text: `任务 #${taskId} · ${latest.tool_name || 'agent'} · ${latest.message || '阶段更新'}`,
        tone: category === 'fallback' ? 'text-rose-300' : category === 'deliver' ? 'text-emerald-300' : 'text-neutral-300',
        category,
        taskId: Number(taskId),
      }]
    })
    return [...approvalItems, ...phaseItems, ...runItems]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 12)
  }, [approvalRecords, quickJobs, quickJobLogs])

  const assigneeOptions = useMemo(() => {
    const items = new Set<string>()
    owners.forEach((owner) => {
      const value = (owner.assignee || '').trim()
      if (value) items.add(value)
    })
    employees.forEach((employee) => {
      const value = (employee.name || '').trim()
      if (value) items.add(value)
    })
    return Array.from(items)
  }, [employees, owners])

  const mainAgentName = useMemo(() => {
    const byProfile = (profile?.agentName || '').trim()
    if (byProfile) return byProfile
    return '主管Agent'
  }, [profile?.agentName])

  const employeeRows = useMemo(() => {
    return employees.map((employee) => {
      const owner = owners.find((item) => (item.assignee || '').trim() === employee.name)
      return {
        ...employee,
        totalTasks: owner?.total_tasks || 0,
        pendingReview: owner?.pending_review || 0,
        inProgress: owner?.in_progress || 0,
        completionRate: owner?.completion_rate || 0,
        owner,
      }
    })
  }, [employees, owners])

  const idleEmployeeCount = useMemo(
    () => employeeRows.filter((item) => item.status === 'active' && (item.inProgress || 0) === 0).length,
    [employeeRows]
  )
  const employeeAvatarMap = useMemo(() => {
    const map = new Map<string, string>()
    const names = Array.from(new Set(employeeRows.map((item) => (item.name || '').trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
    const usedIndices = new Set<number>()
    for (const name of names) {
      let index = (name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)) % avatarPool.length
      while (usedIndices.has(index) && usedIndices.size < avatarPool.length) {
        index = (index + 1) % avatarPool.length
      }
      usedIndices.add(index)
      map.set(name, avatarPool[index])
    }
    return map
  }, [employeeRows])
  const getEmployeeAvatar = useCallback(
    (name: string) => employeeAvatarMap.get((name || '').trim()) || pickAvatarByName(name || ''),
    [employeeAvatarMap]
  )
  const simpleVisibleEmployees = useMemo(
    () => employeeRows.filter((item) => !simpleIdleOnly || (item.status === 'active' && (item.inProgress || 0) === 0)),
    [employeeRows, simpleIdleOnly]
  )
  const simpleFocusEmployee = useMemo(
    () => employeeRows.find((item) => item.name === simpleFocusEmployeeName) || null,
    [employeeRows, simpleFocusEmployeeName]
  )
  const simpleFocusEmployeeJobs = useMemo(() => {
    if (!simpleFocusEmployeeName) return []
    return quickJobs
      .filter((item) => (item.assignee || '').trim() === simpleFocusEmployeeName)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 8)
  }, [quickJobs, simpleFocusEmployeeName])
  const simpleWorldNodes = useMemo(() => {
    return simpleVisibleEmployees.slice(0, 12).map((employee, index) => {
      const col = index % 4
      const row = Math.floor(index / 4)
      return {
        employee,
        left: 14 + col * 22 + (row % 2) * 4,
        top: 20 + row * 28,
      }
    })
  }, [simpleVisibleEmployees])

  useEffect(() => {
    setSelectedParallelAgents((prev) => prev.filter((name) => employees.some((item) => item.name === name)))
  }, [employees])
  useEffect(() => {
    if (simpleFocusEmployeeName && !employees.some((item) => item.name === simpleFocusEmployeeName)) {
      setSimpleFocusEmployeeName('')
    }
  }, [employees, simpleFocusEmployeeName])

  const toggleParallelAgent = useCallback((name: string, checked: boolean) => {
    setSelectedParallelAgents((prev) => {
      if (checked) {
        if (prev.includes(name)) return prev
        return [...prev, name]
      }
      return prev.filter((item) => item !== name)
    })
  }, [])

  const employeeMap = useMemo(() => {
    const map = new Map<string, AiEmployee>()
    for (const employee of employees) {
      map.set(employee.name, employee)
    }
    return map
  }, [employees])

  const recentOrganizationIds = useMemo(() => {
    const current = (organizationId || '').trim()
    const cached = (localStorage.getItem('cks.board.recentOrganizations') || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
    const merged = [current, ...cached].filter(Boolean)
    return Array.from(new Set(merged)).slice(0, 6)
  }, [organizationId])

  useEffect(() => {
    const current = (organizationId || '').trim()
    if (!current) return
    const cached = (localStorage.getItem('cks.board.recentOrganizations') || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
    const merged = [current, ...cached.filter((v) => v !== current)].slice(0, 10)
    localStorage.setItem('cks.board.recentOrganizations', merged.join(','))
  }, [organizationId])

  const departmentOptions = useMemo(() => {
    const items = new Set<string>()
    owners.forEach((owner) => {
      const deps = owner.departments && owner.departments.length > 0
        ? owner.departments
        : [owner.department || extractDepartment(owner.assignee)]
      deps.forEach((dep) => items.add(dep))
    })
    return Array.from(items).sort((a, b) => a.localeCompare(b))
  }, [owners])

  const visibleOwners = useMemo(() => {
    if (departmentFilter === 'all') return owners
    return owners.filter((owner) => {
      const deps = owner.departments && owner.departments.length > 0
        ? owner.departments
        : [owner.department || extractDepartment(owner.assignee)]
      return deps.includes(departmentFilter)
    })
  }, [owners, departmentFilter])

  const departmentOverview = useMemo(() => {
    const bucket = new Map<string, { owners: number; pending: number; inProgress: number; accepted: number; rejected: number }>()
    for (const owner of visibleOwners) {
      const deps = owner.departments && owner.departments.length > 0
        ? owner.departments
        : [owner.department || extractDepartment(owner.assignee)]
      for (const dep of deps) {
        const row = bucket.get(dep) || { owners: 0, pending: 0, inProgress: 0, accepted: 0, rejected: 0 }
        row.owners += 1
        row.pending += owner.pending_review || 0
        row.inProgress += owner.in_progress || 0
        row.accepted += owner.accepted || 0
        row.rejected += owner.rejected || 0
        bucket.set(dep, row)
      }
    }
    return Array.from(bucket.entries())
      .map(([department, stat]) => ({ department, ...stat }))
      .sort((a, b) => (b.pending + b.inProgress) - (a.pending + a.inProgress))
      .slice(0, 6)
  }, [visibleOwners])

  const departmentTrend7d = useMemo(() => {
    const bucket = new Map<string, { pendingReview: number; rejected: number; inProgress: number; accepted: number }>()
    for (const row of recentTasks7d) {
      const dep = (row.department || '').trim() || extractDepartment(row.assignee || '')
      const item = bucket.get(dep) || { pendingReview: 0, rejected: 0, inProgress: 0, accepted: 0 }
      const review = (row.review_status || 'pending').toLowerCase()
      const status = (row.status || '').toLowerCase()
      if (status === 'done' && review === 'pending') item.pendingReview += 1
      if (status === 'todo') item.inProgress += 1
      if (review === 'accepted') item.accepted += 1
      if (review === 'rejected') item.rejected += 1
      bucket.set(dep, item)
    }
    return Array.from(bucket.entries())
      .map(([department, stat]) => ({ department, ...stat }))
      .sort((a, b) => (b.pendingReview + b.rejected) - (a.pendingReview + a.rejected))
      .slice(0, 8)
  }, [recentTasks7d])

  const topRiskOwner = useMemo(() => {
    if (visibleOwners.length === 0) return null
    const withScore = visibleOwners.map((owner) => {
      const riskScore = (owner.pending_review || 0) * 3 + (owner.rejected || 0) * 4 + (owner.in_progress || 0)
      return { owner, riskScore }
    })
    withScore.sort((a, b) => b.riskScore - a.riskScore)
    return withScore[0]
  }, [visibleOwners])

  const managerInsights = useMemo(() => {
    const total = summary.total_tasks || 0
    const accepted = summary.accepted || 0
    const automationRate = total > 0 ? Math.round((accepted / total) * 100) : 0
    const avgOwnerCompletion =
      visibleOwners.length > 0
        ? Math.round(
            visibleOwners.reduce((acc, owner) => acc + (owner.completion_rate || 0), 0) / visibleOwners.length
          )
        : 0
    const riskTaskCount = (summary.pending_review || 0) + (summary.rejected || 0)
    return {
      automationRate,
      avgOwnerCompletion,
      riskTaskCount,
    }
  }, [summary, visibleOwners])
  const topInterventions = useMemo(() => {
    const items: Array<{
      key: 'risk_owner' | 'pending_review' | 'rejected_handoff'
      title: string
      reason: string
      level: 'high' | 'medium'
    }> = []
    if (topRiskOwner && topRiskOwner.riskScore > 0) {
      items.push({
        key: 'risk_owner',
        title: `优先拉起 ${topRiskOwner.owner.assignee}`,
        reason: `该数字员工风险分最高（${topRiskOwner.riskScore}），建议立即执行下一任务。`,
        level: 'high',
      })
    }
    if ((summary.pending_review || 0) > 0) {
      items.push({
        key: 'pending_review',
        title: '集中处理待验收任务',
        reason: `当前有 ${summary.pending_review} 个待验收任务，建议先清理积压。`,
        level: 'high',
      })
    }
    if ((summary.rejected || 0) > 0) {
      items.push({
        key: 'rejected_handoff',
        title: '安排返工任务接手',
        reason: `当前有 ${summary.rejected} 个驳回任务，建议指派专人接手返工。`,
        level: 'medium',
      })
    }
    return items.slice(0, 3)
  }, [summary.pending_review, summary.rejected, topRiskOwner])
  const approvalToolOptions = useMemo(() => {
    const set = new Set<string>()
    approvalRecords.forEach((item) => {
      if (item.tool_name) set.add(item.tool_name)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [approvalRecords])
  const visibleApprovals = useMemo(() => {
    const now = Date.now()
    return approvalRecords
      .filter((item) => {
        if (approvalStatusFilter !== 'all' && item.status !== approvalStatusFilter) return false
        if (approvalToolFilter !== 'all' && item.tool_name !== approvalToolFilter) return false
        if (approvalHighRiskOnly && (item.risk_level || '').toLowerCase() !== 'high') return false
        if (approvalRecent24hOnly) {
          const ts = Date.parse(item.updated_at || item.created_at || '')
          if (!Number.isFinite(ts) || now - ts > 24 * 60 * 60 * 1000) return false
        }
        const decider = (item.decided_by || '').toLowerCase()
        if (approvalDeciderFilter.trim() && !decider.includes(approvalDeciderFilter.trim().toLowerCase())) return false
        return true
      })
      .sort((a, b) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || ''))
      .slice(0, 12)
  }, [approvalDeciderFilter, approvalHighRiskOnly, approvalRecent24hOnly, approvalRecords, approvalStatusFilter, approvalToolFilter])
  const approvalSummary = useMemo(() => {
    const result = { pending: 0, approved: 0, denied: 0, expired: 0 }
    for (const item of approvalRecords) {
      if (item.status === 'pending') result.pending += 1
      else if (item.status === 'approved') result.approved += 1
      else if (item.status === 'denied') result.denied += 1
      else if (item.status === 'expired') result.expired += 1
    }
    return result
  }, [approvalRecords])

  const addOrganizationToCatalog = useCallback(() => {
    const next = (newOrganizationId || '').trim()
    if (!next) return
    setOrganizationCatalog((prev) => {
      if (prev.includes(next)) return prev
      return [next, ...prev].slice(0, 20)
    })
    setOrganizationId(next)
    setNewOrganizationId('')
  }, [newOrganizationId])

  const removeCurrentOrganizationFromCatalog = useCallback(() => {
    setOrganizationCatalog((prev) => {
      const filtered = prev.filter((org) => org !== organizationId)
      if (filtered.length === 0) return ['default-org']
      return filtered
    })
    if (organizationId === 'default-org') return
    setOrganizationId('default-org')
  }, [organizationId])

  const renameCurrentOrganization = useCallback(() => {
    const next = window.prompt('重命名当前空间', organizationId)
    if (!next) return
    const normalized = next.trim()
    if (!normalized || normalized === organizationId) return
    setOrganizationCatalog((prev) => {
      const replaced = prev.map((org) => (org === organizationId ? normalized : org))
      return Array.from(new Set(replaced)).slice(0, 20)
    })
    setOrganizationId(normalized)
  }, [organizationId])

  const exportOrganizationConfig = useCallback(() => {
    const payload = {
      current: organizationId,
      catalog: organizationCatalog,
      recent: recentOrganizationIds,
      updated_at: new Date().toISOString(),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `board_org_config_${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [organizationCatalog, organizationId, recentOrganizationIds])

  const onImportOrganizationConfig = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as {
        current?: string
        catalog?: string[]
      }
      const catalog = Array.isArray(parsed.catalog)
        ? parsed.catalog.map((v) => String(v || '').trim()).filter(Boolean)
        : []
      const nextCatalog = catalog.length > 0 ? Array.from(new Set(catalog)).slice(0, 20) : ['default-org']
      setOrganizationCatalog(nextCatalog)
      const nextCurrent = (parsed.current || '').trim()
      if (nextCurrent) setOrganizationId(nextCurrent)
    } catch (error) {
      console.error('Failed to import organization config:', error)
      window.alert('空间配置导入失败，请检查文件格式。')
    } finally {
      event.target.value = ''
    }
  }, [])

  const parseSkillStack = useCallback((value: string) => {
    return Array.from(
      new Set(
        value
          .split(/[,\uff0c]/)
          .map((item) => item.trim())
          .filter(Boolean)
      )
    )
  }, [])

  const loadAssigneeRejectedLessons = useCallback(async (assignee: string, skillHints: string[] = []) => {
    const name = (assignee || '').trim()
    if (!name) return '暂无历史失败样本'
    try {
      const result = await AgentService.listGoalTasks({
        organizationId,
        assignee: name,
        reviewStatus: 'rejected',
        limit: 8,
      })
      const tasks = result?.success && result.tasks ? result.tasks : []
      const normalizedHints = Array.from(
        new Set(
          skillHints
            .map((item) => (item || '').trim().toLowerCase())
            .filter(Boolean)
        )
      )
      if (normalizedHints.length === 0) return summarizeRejectedLessons(tasks)
      const scored = tasks
        .map((task) => {
          const text = `${task.title || ''}\n${task.description || ''}`.toLowerCase()
          const score = normalizedHints.reduce((acc, token) => (text.includes(token) ? acc + 1 : acc), 0)
          return { task, score }
        })
        .sort((a, b) => b.score - a.score)
        .map((item) => item.task)
      return summarizeRejectedLessons(scored)
    } catch {
      return '暂无历史失败样本'
    }
  }, [organizationId])

  const selectedPreset = useMemo(
    () => skillPresets.find((preset) => preset.id === selectedPresetId) || null,
    [selectedPresetId, skillPresets]
  )

  const createSkillPreset = useCallback(async () => {
    const name = presetName.trim()
    const skills = parseSkillStack(presetSkills)
    if (!name || skills.length === 0) {
      window.alert('请填写技能预设名称和技能列表')
      return
    }
    if (skillPresets.some((item) => item.name.trim().toLowerCase() === name.toLowerCase())) {
      window.alert('该技能预设名称已存在，请换一个名称')
      return
    }
    const primarySkill = skills[0]
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const result = await AgentService.upsertAiSkillPreset({
      organizationId,
      id,
      name,
      primarySkill,
      skills,
    })
    if (!result?.success) {
      window.alert(result?.error || '技能预设保存失败')
      return
    }
    setSkillPresets((prev) => [{ id, name, primarySkill, skills }, ...prev].slice(0, 30))
    setSelectedPresetId(id)
    setPresetName('')
    setPresetSkills('')
  }, [organizationId, parseSkillStack, presetName, presetSkills, skillPresets])

  const deleteSkillPreset = useCallback(async (presetId: string) => {
    const result = await AgentService.deleteAiSkillPreset(presetId, organizationId)
    if (!result?.success) {
      window.alert(result?.error || '技能预设删除失败')
      return
    }
    setSkillPresets((prev) => prev.filter((preset) => preset.id !== presetId))
    setSelectedPresetId((prev) => (prev === presetId ? '' : prev))
  }, [organizationId])

  const applyPresetToRecruitForm = useCallback(() => {
    if (!selectedPreset) return
    setCustomEmployeeSkills(selectedPreset.skills.join(', '))
  }, [selectedPreset])

  const applyAgentSkillPreset = useCallback((assignee: string) => {
    const employee = employeeMap.get(assignee.trim())
    if (!employee) return
    const primarySkill = (employee.primarySkill || '').trim()
    if (!primarySkill) return
    const skillStack = employee.skillStack.length > 0 ? employee.skillStack : [primarySkill]
    localStorage.setItem('cks.workbench.preferredSkill', primarySkill)
    localStorage.setItem('cks.workbench.skillStrict', '0')
    localStorage.setItem(
      'cks.workbench.seedPrompt',
      `你是${employee.role}，主技能是 ${primarySkill}，技能组合为 ${skillStack.join('、')}。请优先使用这些技能执行当前任务并输出可验收结果。`
    )
  }, [employeeMap])

  const recruitEmployee = useCallback(async () => {
    const template = employeeTemplates.find((item) => item.key === selectedTemplate) || employeeTemplates[0]
    const normalizedName = (customEmployeeName || '').trim()
    const nextName = normalizedName || `${template.role.replace('员工', '')}Agent`
    const nextRole = (customEmployeeRole || '').trim() || template.role
    const nextSpecialty = (customEmployeeSpecialty || '').trim() || template.specialty
    const customSkills = parseSkillStack(customEmployeeSkills)
    const fallbackStack = selectedPreset ? selectedPreset.skills : template.defaultSkillStack
    const nextSkillStack = customSkills.length > 0 ? customSkills : fallbackStack
    const selectedPrimary = (simpleRecruitPrimarySkill || '').trim()
    const nextPrimarySkill = selectedPrimary || nextSkillStack[0] || selectedPreset?.primarySkill || template.primarySkill
    const normalizedStack = [
      nextPrimarySkill,
      ...nextSkillStack.filter((skill) => skill && skill !== nextPrimarySkill),
    ].filter(Boolean)
    if (employees.some((item) => item.name.trim().toLowerCase() === nextName.toLowerCase())) {
      window.alert('该员工名称已存在，请直接编辑已有员工')
      return
    }
    const result = await AgentService.upsertAiEmployee({
      organizationId,
      name: nextName,
      role: nextRole,
      specialty: nextSpecialty,
      primarySkill: nextPrimarySkill,
      skillStack: normalizedStack,
      status: 'active',
    })
    if (!result?.success) {
      window.alert(result?.error || '员工创建失败')
      return
    }
    setEmployees((prev) => {
      if (prev.some((item) => item.name === nextName)) return prev
      return [
        {
          name: nextName,
          role: nextRole,
          specialty: nextSpecialty,
          primarySkill: nextPrimarySkill,
          skillStack: normalizedStack,
          status: 'active',
        },
        ...prev,
      ]
    })
    setCustomEmployeeName('')
    setCustomEmployeeRole('')
    setCustomEmployeeSpecialty('')
    setCustomEmployeeSkills('')
    setSimpleRecruitPrimarySkill('')
    setSimpleRecruitOpen(false)
    setDispatchAssignee((prev) => prev || nextName)
  }, [customEmployeeName, customEmployeeRole, customEmployeeSkills, customEmployeeSpecialty, employees, organizationId, parseSkillStack, selectedPreset, selectedTemplate, simpleRecruitPrimarySkill])

  const toggleEmployeeStatus = useCallback(async (name: string) => {
    const target = employees.find((item) => item.name === name)
    if (!target) return
    const nextStatus: EmployeeStatus = target.status === 'active' ? 'paused' : 'active'
    const result = await AgentService.upsertAiEmployee({
      organizationId,
      name: target.name,
      role: target.role,
      specialty: target.specialty,
      primarySkill: target.primarySkill,
      skillStack: target.skillStack,
      status: nextStatus,
    })
    if (!result?.success) {
      window.alert(result?.error || '员工状态更新失败')
      return
    }
    setEmployees((prev) => prev.map((item) => (
      item.name === name
        ? { ...item, status: nextStatus }
        : item
    )))
  }, [employees, organizationId])

  const fireEmployee = useCallback(async (name: string) => {
    const result = await AgentService.deleteAiEmployee(name, organizationId)
    if (!result?.success) {
      window.alert(result?.error || '删除员工失败')
      return
    }
    setEmployees((prev) => prev.filter((item) => item.name !== name))
  }, [organizationId])

  const applyPresetToEmployee = useCallback(async (name: string) => {
    if (!selectedPreset) {
      window.alert('请先选择技能预设')
      return
    }
    const target = employees.find((item) => item.name === name)
    if (!target) return
    const result = await AgentService.upsertAiEmployee({
      organizationId,
      name: target.name,
      role: target.role,
      specialty: target.specialty,
      primarySkill: selectedPreset.primarySkill,
      skillStack: selectedPreset.skills,
      status: target.status,
    })
    if (!result?.success) {
      window.alert(result?.error || '应用技能预设失败')
      return
    }
    setEmployees((prev) => prev.map((item) => (
      item.name === name
        ? {
            ...item,
            primarySkill: selectedPreset.primarySkill,
            skillStack: selectedPreset.skills,
          }
        : item
    )))
  }, [employees, organizationId, selectedPreset])

  const beginEditEmployee = useCallback((employee: AiEmployee) => {
    setEditingEmployeeName(employee.name)
    setEditingEmployeeDraft({
      role: employee.role,
      specialty: employee.specialty,
      primarySkill: employee.primarySkill,
      skillStack: (employee.skillStack || [employee.primarySkill]).join(', '),
    })
  }, [])

  const cancelEditEmployee = useCallback(() => {
    setEditingEmployeeName('')
    setEditingEmployeeDraft({ role: '', specialty: '', primarySkill: '', skillStack: '' })
  }, [])

  const saveEmployeeEdit = useCallback(async (name: string) => {
    const role = editingEmployeeDraft.role.trim()
    const specialty = editingEmployeeDraft.specialty.trim()
    const parsedSkillStack = parseSkillStack(editingEmployeeDraft.skillStack)
    const primarySkill = (editingEmployeeDraft.primarySkill || parsedSkillStack[0] || '').trim()
    if (!role || !primarySkill) {
      window.alert('请至少填写员工角色和主技能')
      return
    }
    const nextStack = parsedSkillStack.length > 0 ? parsedSkillStack : [primarySkill]
    if (!nextStack.includes(primarySkill)) {
      nextStack.unshift(primarySkill)
    }
    const target = employees.find((item) => item.name === name)
    if (!target) return
    const result = await AgentService.upsertAiEmployee({
      organizationId,
      name: target.name,
      role,
      specialty: specialty || target.specialty,
      primarySkill,
      skillStack: nextStack,
      status: target.status,
    })
    if (!result?.success) {
      window.alert(result?.error || '员工信息保存失败')
      return
    }
    setEmployees((prev) => prev.map((item) => (
      item.name === name
        ? {
            ...item,
            role,
            specialty: specialty || item.specialty,
            primarySkill,
            skillStack: nextStack,
          }
        : item
    )))
    cancelEditEmployee()
  }, [cancelEditEmployee, editingEmployeeDraft.primarySkill, editingEmployeeDraft.role, editingEmployeeDraft.skillStack, editingEmployeeDraft.specialty, employees, organizationId, parseSkillStack])

  const launchTaskInWorkbench = useCallback(
    async (taskId: number, assignee: string) => {
      const employee = employeeMap.get((assignee || '').trim())
      if (employee?.status === 'paused') {
        window.alert(`员工 ${assignee} 当前处于暂停状态，请先恢复后再执行任务。`)
        return
      }
      if (employee) {
        if (employee.primarySkill && availableSkillNames.length > 0 && !availableSkillNames.includes(employee.primarySkill)) {
          window.alert(`员工 ${assignee} 的主技能 ${employee.primarySkill} 未安装，请先在 Skills 模块安装后再执行任务。`)
          return
        }
        const skillStack = employee.skillStack.length > 0 ? employee.skillStack : [employee.primarySkill]
        let selectedNodeId = ''
        const targetCapability = inferNodeCapabilityByEmployee(employee)
        try {
          const nodeSelect = await AgentService.selectNode({
            organizationId,
            capability: targetCapability,
          })
          if (nodeSelect?.success && nodeSelect.node?.node_id) {
            selectedNodeId = nodeSelect.node.node_id
            localStorage.setItem('cks.workbench.executionNodeId', selectedNodeId)
          } else {
            localStorage.removeItem('cks.workbench.executionNodeId')
          }
        } catch (error) {
          console.warn('Failed to auto-select execution node:', error)
          localStorage.removeItem('cks.workbench.executionNodeId')
        }
        const seedPrompt = [
          `你是${employee.role}，主技能是 ${employee.primarySkill}，技能组合为 ${skillStack.join('、')}。请优先使用这些技能执行当前任务并输出可验收结果。`,
          selectedNodeId ? `优先执行节点：${selectedNodeId}（能力建议：${targetCapability}）。` : '',
        ]
          .filter(Boolean)
          .join('\n')
        try {
          await AgentService.upsertGoalTaskAgentProfile(taskId, {
            organizationId,
            assignee: employee.name,
            role: employee.role,
            specialty: employee.specialty,
            preferredSkill: employee.primarySkill,
            skillStack,
            skillStrict: false,
            seedPrompt,
          })
        } catch (error) {
          console.warn('Failed to persist task agent profile, fallback to local seed:', error)
        }
      }
      if (!employee) {
        localStorage.removeItem('cks.workbench.executionNodeId')
      }
      const sessionId = createSession(`执行任务 #${taskId} - ${assignee}`)
      setSessionGoalTask(sessionId, taskId)
      setSessionOrganization(sessionId, organizationId)
      setCurrentSession(sessionId)
      navigate('/workbench')
    },
    [availableSkillNames, createSession, employeeMap, loadAssigneeRejectedLessons, navigate, organizationId, setCurrentSession, setSessionGoalTask, setSessionOrganization]
  )

  const dispatchLinkedChannelTaskToEmployee = useCallback(async () => {
    if (!linkedChannelTask) return
    const targetAssignee = channelTaskAssignee.trim()
    if (!targetAssignee) {
      window.alert('请先选择一个数字员工')
      return
    }
    const projectId = Number(dispatchProjectId)
    if (!projectId) {
      window.alert('请先在派单中心选择可用项目')
      return
    }
    setChannelTaskDispatching(true)
    try {
      const taskTitle = `入口任务#${linkedChannelTask.id}：${linkedChannelTask.message.slice(0, 28)}`
      const description = [
        '[入口任务转执行]',
        `来源渠道: ${linkedChannelTask.channel}`,
        `发送者: ${linkedChannelTask.sender_id}`,
        `会话: ${linkedChannelTask.chat_id}`,
        `原始任务ID: ${linkedChannelTask.id}`,
        `任务内容: ${linkedChannelTask.message}`,
      ].join('\n')
      const created = await AgentService.createGoalTask(
        projectId,
        taskTitle,
        description,
        targetAssignee,
        extractDepartment(targetAssignee)
      )
      if (!created?.success || !created.id) {
        window.alert(created?.error || '入口任务转派失败')
        return
      }
      await AgentService.setDashboardNextTask(targetAssignee, created.id, organizationId)
      setChannelDispatchResult({
        sourceChannelTaskId: linkedChannelTask.id,
        goalTaskId: created.id,
        assignee: targetAssignee,
        at: new Date().toISOString(),
      })
      await load()
      applyAgentSkillPreset(targetAssignee)
      await launchTaskInWorkbench(created.id, targetAssignee)
    } catch (error) {
      console.error('Failed to dispatch linked channel task:', error)
      window.alert('入口任务转派失败，请稍后重试')
    } finally {
      setChannelTaskDispatching(false)
    }
  }, [channelTaskAssignee, dispatchProjectId, launchTaskInWorkbench, linkedChannelTask, load, organizationId])

  const startOwnerExecution = useCallback(
    async (owner: GoalsDashboardOwnerRow, preferredTaskId?: number) => {
      if (!owner?.assignee) return
      setRunningAssignee(owner.assignee)
      try {
        let taskId = preferredTaskId || owner.next_task_id || null
        if (!taskId) {
          const pending = await AgentService.listGoalTasks({
            organizationId,
            assignee: owner.assignee,
            reviewStatus: 'pending',
            limit: 1,
          })
          taskId = pending?.success && pending.tasks && pending.tasks[0] ? pending.tasks[0].id : null
        }
        if (!taskId) {
          const inProgress = await AgentService.listGoalTasks({
            organizationId,
            assignee: owner.assignee,
            status: 'todo',
            limit: 1,
          })
          taskId = inProgress?.success && inProgress.tasks && inProgress.tasks[0] ? inProgress.tasks[0].id : null
        }
        if (!taskId) {
      window.alert(`数字员工 ${owner.assignee} 当前没有可执行任务。`)
          return
        }

        applyAgentSkillPreset(owner.assignee)
        await launchTaskInWorkbench(taskId, owner.assignee)
      } catch (error) {
        console.error('Failed to start owner execution:', error)
      } finally {
        setRunningAssignee('')
      }
    },
    [launchTaskInWorkbench, organizationId]
  )

  const submitDispatchTask = useCallback(async () => {
    const projectId = Number(dispatchProjectId)
    if (!projectId) {
      window.alert('请选择项目')
      return
    }
    if (!dispatchTitle.trim()) {
      window.alert('请输入任务标题')
      return
    }
    if (!dispatchAssignee.trim()) {
      window.alert('请输入数字员工名称')
      return
    }
    setDispatchSubmitting(true)
    try {
      const description = formatDispatchDescription(dispatchDueAt, dispatchReviewer, dispatchRequirement)
      const created = await AgentService.createGoalTask(
        projectId,
        dispatchTitle.trim(),
        description,
        dispatchAssignee.trim(),
        extractDepartment(dispatchAssignee.trim())
      )
      if (!created?.success || !created.id) {
        window.alert(created?.error || '派单失败')
        return
      }
      if (dispatchAutoSetNext) {
        await AgentService.setDashboardNextTask(dispatchAssignee.trim(), created.id, organizationId)
      }
      await load()
      if (dispatchAutoLaunch) {
        applyAgentSkillPreset(dispatchAssignee.trim())
        await launchTaskInWorkbench(created.id, dispatchAssignee.trim())
      }
      setDispatchTitle('')
      setDispatchRequirement('')
      window.alert(`派单成功：任务 #${created.id}`)
    } catch (error) {
      console.error('Failed to dispatch task:', error)
      window.alert('派单失败，请检查后重试')
    } finally {
      setDispatchSubmitting(false)
    }
  }, [
    dispatchAssignee,
    dispatchAutoLaunch,
    dispatchAutoSetNext,
    dispatchDueAt,
    dispatchProjectId,
    dispatchRequirement,
    dispatchReviewer,
    dispatchTitle,
    launchTaskInWorkbench,
    load,
    organizationId,
  ])

  const dispatchTaskForAssignee = useCallback(async (assignee: string) => {
    const projectId = Number(dispatchProjectId)
    const title = dispatchTitle.trim()
    if (!projectId || !title) return null
    const description = formatDispatchDescription(dispatchDueAt, dispatchReviewer, dispatchRequirement)
    const created = await AgentService.createGoalTask(
      projectId,
      title,
      description,
      assignee,
      extractDepartment(assignee)
    )
    if (!created?.success || !created.id) {
      return { assignee, success: false as const, error: created?.error || '创建失败' }
    }
    if (dispatchAutoSetNext) {
      await AgentService.setDashboardNextTask(assignee, created.id, organizationId)
    }
    if (dispatchAutoLaunch) {
      applyAgentSkillPreset(assignee)
      await launchTaskInWorkbench(created.id, assignee)
    }
    return { assignee, success: true as const, taskId: created.id }
  }, [
    applyAgentSkillPreset,
    dispatchAutoLaunch,
    dispatchAutoSetNext,
    dispatchDueAt,
    dispatchProjectId,
    dispatchRequirement,
    dispatchReviewer,
    dispatchTitle,
    launchTaskInWorkbench,
    organizationId,
  ])

  const submitParallelDispatch = useCallback(async () => {
    if (selectedParallelAgents.length === 0) {
      window.alert('请先选择至少一个 SubAgent')
      return
    }
    if (!dispatchTitle.trim()) {
      window.alert('请先填写任务标题')
      return
    }
    if (!Number(dispatchProjectId)) {
      window.alert('请先选择派单项目')
      return
    }
    setParallelDispatching(true)
    try {
      const results = await Promise.all(selectedParallelAgents.map((assignee) => dispatchTaskForAssignee(assignee)))
      const successItems = results.filter((item): item is { assignee: string; success: true; taskId: number } => Boolean(item && item.success))
      const failedItems = results.filter((item): item is { assignee: string; success: false; error: string } => Boolean(item && !item.success))
      await load()
      const successText = successItems.length > 0
        ? `成功 ${successItems.length} 个：${successItems.map((item) => `${item.assignee}(#${item.taskId})`).join('、')}`
        : '成功 0 个'
      const failedText = failedItems.length > 0
        ? `\n失败 ${failedItems.length} 个：${failedItems.map((item) => `${item.assignee}(${item.error})`).join('、')}`
        : ''
      window.alert(`并行派单完成。\n${successText}${failedText}`)
    } catch (error) {
      console.error('Failed to dispatch tasks in parallel:', error)
      window.alert('并行派单失败，请稍后重试')
    } finally {
      setParallelDispatching(false)
    }
  }, [dispatchProjectId, dispatchTaskForAssignee, dispatchTitle, load, selectedParallelAgents])

  const resolveQuickJobStatuses = useCallback(async (jobs: QuickBossJob[]): Promise<QuickBossJob[]> => {
    if (!jobs.length) return []
    const next: QuickBossJob[] = []
    for (const job of jobs) {
      let statusLabel = job.statusLabel
      let lastMessage = job.lastMessage
      let reviewStatus: QuickBossJob['reviewStatus'] = job.reviewStatus
      let latestRun: { run_id?: string; status?: string; result_text?: string; error_text?: string } | null = null
      try {
        const [taskResult, execResult, runResult] = await Promise.all([
          AgentService.listGoalTasks({
            organizationId,
            taskId: job.taskId,
            limit: 1,
          }),
          AgentService.getGoalTaskExecutionState(job.taskId),
          AgentService.listTaskSubagentRuns(job.taskId, organizationId, 1),
        ])
        const row = taskResult?.success && taskResult.tasks?.[0] ? taskResult.tasks[0] : null
        latestRun = runResult?.success && runResult.items?.[0] ? runResult.items[0] : null
        if (!row) {
          // 任务已被删除，直接从老板反馈列表移除，避免展示陈旧测试数据
          continue
        }
        const execPhase = execResult?.success ? execResult.data?.phase : undefined
        const execStatus = execResult?.success ? execResult.data?.status : undefined
        const activePhase = execStatus === 'active' ? execPhase : undefined
        if (row?.review_status === 'accepted') {
          statusLabel = '已验收'
          reviewStatus = 'accepted'
          lastMessage = row.review_note || '老板已验收通过'
        } else if (row?.review_status === 'rejected') {
          statusLabel = '已驳回'
          reviewStatus = 'rejected'
          lastMessage = row.review_note || '老板已驳回，等待返工'
        } else if (row?.status === 'done') {
          statusLabel = activePhase ? `待验收（${activePhase}）` : '待验收'
          reviewStatus = 'pending'
          lastMessage = latestRun?.result_text || execResult?.data?.note || 'SubAgent 已完成执行，等待验收'
        } else if (latestRun?.status === 'failed' || latestRun?.status === 'cancelled') {
          statusLabel = latestRun.status === 'failed' ? '执行失败' : '已取消'
          lastMessage = latestRun.error_text || '子Agent 运行异常'
        } else if (latestRun?.status === 'queued' || latestRun?.status === 'running') {
          statusLabel = latestRun.status === 'queued' ? '排队中' : '执行中（subagent）'
          lastMessage = execResult?.data?.note || `run=${latestRun.run_id}`
        } else if (activePhase) {
          statusLabel = `执行中（${activePhase}）`
          lastMessage = execResult?.data?.note || `当前阶段：${activePhase}`
        } else if (row?.status === 'todo') {
          statusLabel = '排队中'
          lastMessage = '等待主Agent调度执行'
        }
      } catch {
        statusLabel = job.statusLabel || '状态同步失败'
      }
      next.push({
        ...job,
        statusLabel,
        reviewStatus,
        lastMessage,
        subagentRunId: latestRun?.run_id || job.subagentRunId,
        subagentRunStatus: latestRun?.status || job.subagentRunStatus,
        updatedAt: new Date().toISOString(),
      })
    }
    return next
  }, [organizationId])

  const refreshQuickJobs = useCallback(async () => {
    if (!quickJobs.length) return
    const next = await resolveQuickJobStatuses(quickJobs)
    setQuickJobs(next)
  }, [quickJobs, resolveQuickJobStatuses])

  const reviewQuickJob = useCallback(async (taskId: number, decision: 'accept' | 'reject') => {
    try {
      const result = await AgentService.reviewGoalTask(
        taskId,
        decision,
        decision === 'accept' ? '老板验收通过' : '老板驳回返工',
        dispatchReviewer || mainAgentName || '老板'
      )
      if (!result?.success) {
        window.alert(result?.error || '验收失败，请稍后重试')
        return
      }
      await refreshQuickJobs()
      await load()
    } catch (error) {
      console.error('Failed to review quick job:', error)
      window.alert('验收失败，请稍后重试')
    }
  }, [dispatchReviewer, load, mainAgentName, refreshQuickJobs])

  const deleteQuickJob = useCallback(async (taskId: number) => {
    const confirmed = window.confirm(`确认删除任务 #${taskId} 吗？此操作不可撤销。`)
    if (!confirmed) return
    try {
      const result = await AgentService.deleteGoalTask(taskId)
      if (!result?.success) {
        window.alert(result?.error || '删除任务失败，请稍后重试')
        return
      }
      setQuickJobs((prev) => prev.filter((item) => item.taskId !== taskId))
      setQuickJobLogs((prev) => {
        const next = { ...prev }
        delete next[taskId]
        return next
      })
      setQuickJobTaskDetails((prev) => {
        const next = { ...prev }
        delete next[taskId]
        return next
      })
      if (expandedQuickJobId === taskId) {
        setExpandedQuickJobId(null)
      }
      if (quickResultModalTaskId === taskId) {
        setQuickResultModalTaskId(null)
      }
      await load()
    } catch (error) {
      console.error('Failed to delete quick job:', error)
      window.alert('删除任务失败，请稍后重试')
    }
  }, [expandedQuickJobId, quickResultModalTaskId, load])

  const loadQuickJobLogs = useCallback(async (taskId: number) => {
    setQuickJobLogs((prev) => ({
      ...prev,
      [taskId]: {
        ...(prev[taskId] || { executions: [], errors: [] }),
        loading: true,
        error: '',
      },
    }))
    try {
      const [execResult, errResult, stateResult, phaseResult, runResult] = await Promise.all([
        AgentService.getAuditExecutions(undefined, 40, undefined, undefined, undefined, taskId),
        AgentService.getAuditErrors(undefined, 40, undefined, undefined, undefined, taskId),
        AgentService.getGoalTaskExecutionState(taskId),
        AgentService.getGoalTaskExecutionEvents(taskId, 40),
        AgentService.listTaskSubagentRuns(taskId, organizationId, 1),
      ])
      const latestRun = runResult?.success && runResult.items?.[0] ? runResult.items[0] : null
      const runEventsResult = latestRun?.run_id
        ? await AgentService.listSubagentRunEvents(latestRun.run_id, 60)
        : null
      const executionRecords = execResult?.success ? (execResult.records || []) : []
      const phaseRecords = phaseResult?.success
        ? (phaseResult.records || []).map((item) => toAuditLikeRecord(item as Record<string, any>))
        : []
      const subagentRecords = runEventsResult?.success
        ? (runEventsResult.records || []).map((item) => toSubagentAuditLikeRecord(item as Record<string, any>))
        : []
      const runSummaryRecord = latestRun && latestRun.result_text
        ? [{
            timestamp: latestRun.finished_at || latestRun.updated_at || new Date().toISOString(),
            tool_name: 'subagent:deliver',
            message: `任务已完成：${latestRun.result_text.slice(0, 120)}`,
            data: {
              prompt: `【实际产出】\n${latestRun.result_text}`,
            },
          } as AuditRecord]
        : []
      const mergedExecutions = [...executionRecords, ...phaseRecords, ...subagentRecords, ...runSummaryRecord]
        .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
        .slice(0, 60)
      setQuickJobLogs((prev) => ({
        ...prev,
        [taskId]: {
          loading: false,
          executions: mergedExecutions,
          errors: errResult?.success ? (errResult.records || []) : [],
          phase: stateResult?.success ? stateResult.data?.phase : '',
          phaseStatus: stateResult?.success ? stateResult.data?.status : '',
          phaseNote: stateResult?.success ? stateResult.data?.note : '',
          subagentRunId: latestRun?.run_id || '',
          subagentRunStatus: latestRun?.status || '',
          subagentResult: latestRun?.result_text || '',
          subagentError: latestRun?.error_text || '',
          updatedAt: new Date().toISOString(),
        },
      }))
    } catch (error) {
      console.error('Failed to load quick job logs:', error)
      setQuickJobLogs((prev) => ({
        ...prev,
        [taskId]: {
          ...(prev[taskId] || { executions: [], errors: [] }),
          loading: false,
          error: '日志加载失败',
          updatedAt: new Date().toISOString(),
        },
      }))
    }
  }, [organizationId])

  const openQuickJobResult = useCallback(async (taskId: number) => {
    setQuickResultModalTaskId(taskId)
    setQuickReworkFeedback('')
    if (expandedQuickJobId !== taskId) setExpandedQuickJobId(taskId)
    try {
      const [taskResult] = await Promise.all([
        AgentService.listGoalTasks({
          organizationId,
          taskId,
          limit: 1,
        }),
        loadQuickJobLogs(taskId),
      ])
      const row = taskResult?.success && taskResult.tasks?.[0] ? taskResult.tasks[0] : null
      if (row) {
        setQuickJobTaskDetails((prev) => ({ ...prev, [taskId]: row }))
      }
    } catch (error) {
      console.error('Failed to open quick job result:', error)
    }
  }, [expandedQuickJobId, loadQuickJobLogs, organizationId])

  const startSubagentRun = useCallback(async (
    job: Pick<QuickBossJob, 'taskId' | 'assignee' | 'title' | 'note'>
  ) => {
    try {
      const objective = [job.title, job.note].filter(Boolean).join('?')
      const resp = await AgentService.spawnTaskSubagentRun(job.taskId, {
        organizationId,
        objective,
        supervisorName: dispatchReviewer || mainAgentName || 'Supervisor-Agent',
        autoComplete: true,
      })
      if (!resp?.success || !resp.run?.run_id) {
        const reason = resp?.error || '?Agent????'
        setQuickJobs((prev) =>
          prev.map((item) =>
            item.taskId === job.taskId
              ? {
                  ...item,
                  statusLabel: '????',
                  lastMessage: reason,
                  updatedAt: new Date().toISOString(),
                }
              : item
          )
        )
        return
      }
      const runId = String(resp.run.run_id)
      const runStatus = String(resp.run.status || 'queued')
      setQuickJobs((prev) =>
        prev.map((item) =>
          item.taskId === job.taskId
            ? {
                ...item,
                subagentRunId: runId,
                subagentRunStatus: runStatus,
                statusLabel: runStatus === 'running' ? '????subagent?' : '???',
                lastMessage: `${job.assignee} ??????run=${runId}`,
                updatedAt: new Date().toISOString(),
              }
            : item
        )
      )
      void loadQuickJobLogs(job.taskId)
      await refreshQuickJobs()
    } catch (error) {
      console.error('Failed to start subagent run:', error)
    }
  }, [dispatchReviewer, loadQuickJobLogs, mainAgentName, organizationId, refreshQuickJobs])


  const submitQuickJobRework = useCallback(async (taskId: number) => {
    const feedback = quickReworkFeedback.trim()
    if (!feedback) {
      window.alert('请填写不满意点和修改要求，再提交返工。')
      return
    }
    const job = quickJobs.find((item) => item.taskId === taskId)
    if (!job) return
    setQuickReworkSubmitting(true)
    try {
      const taskResult = await AgentService.listGoalTasks({
        organizationId,
        taskId,
        limit: 1,
      })
      const original = taskResult?.success && taskResult.tasks?.[0] ? taskResult.tasks[0] : quickJobTaskDetails[taskId]
      if (!original?.project_id) {
        window.alert('找不到原任务项目，无法返工。')
        return
      }
      await AgentService.reviewGoalTask(
        taskId,
        'reject',
        `返工要求：${feedback}`,
        dispatchReviewer || mainAgentName || '老板'
      )
      const newDescription = `${(original.description || '').replace(BOSS_MODE_MARKER, '').trim()}\n\n[返工要求]\n${feedback}\n${BOSS_MODE_MARKER}`
      const created = await AgentService.createGoalTask(
        original.project_id,
        original.title || job.title,
        newDescription,
        original.assignee || job.assignee,
        original.department || extractDepartment(original.assignee || job.assignee)
      )
      if (!created?.success || !created.id) {
        window.alert(created?.error || '返工任务创建失败')
        return
      }
      const reworkJob: QuickBossJob = {
        taskId: created.id,
        assignee: original.assignee || job.assignee,
        title: original.title || job.title,
        plan: buildExecutionPlan(original.title || job.title, feedback),
        note: feedback,
        statusLabel: '执行中（plan）',
        reviewStatus: 'pending',
        lastMessage: `返工已启动：${feedback}`,
        updatedAt: new Date().toISOString(),
      }
      setQuickJobs((prev) => [reworkJob, ...prev.filter((item) => item.taskId !== taskId)].slice(0, 50))
      setQuickResultModalTaskId(created.id)
      setExpandedQuickJobId(created.id)
      setQuickReworkFeedback('')
      await load()
      await sleep(400)
      void startSubagentRun(reworkJob)
      await refreshQuickJobs()
      void loadQuickJobLogs(created.id)
    } catch (error) {
      console.error('Failed to submit quick job rework:', error)
      window.alert('返工提交失败，请稍后重试。')
    } finally {
      setQuickReworkSubmitting(false)
    }
  }, [
    dispatchReviewer,
    mainAgentName,
    organizationId,
    quickJobs,
    quickJobTaskDetails,
    quickReworkFeedback,
    load,
    loadQuickJobLogs,
    refreshQuickJobs,
    startSubagentRun,
  ])



  const runQuickBossDispatch = useCallback(async () => {
    const drafts = quickTaskDrafts
      .map((item) => ({
        projectId: (item.projectId || '').trim(),
        assignee: (item.assignee || '').trim(),
        detail: (item.detail || '').trim(),
        input: (item.input || '').trim(),
        output: (item.output || '').trim(),
      }))
      .filter((item) => item.projectId || item.assignee || item.detail || item.input || item.output)
    if (!drafts.length) {
      window.alert('请先新增任务卡片并填写任务内容')
      return
    }
    const defaultProjectId = Number(dispatchProjectId || 0) || dispatchProjects[0]?.id || 0
    if (!defaultProjectId && drafts.some((item) => !Number(item.projectId || 0))) {
      window.alert('请先在目标管理中创建至少一个项目')
      return
    }
    const activeAssignees = selectedParallelAgents.length > 0
      ? selectedParallelAgents
      : employeeRows.filter((item) => item.status === 'active').map((item) => item.name)
    if (!activeAssignees.length) {
      window.alert('暂无可执行的 SubAgent，请先创建并启用员工')
      return
    }
    setQuickDispatching(true)
    try {
      const createdJobs: QuickBossJob[] = []
      for (let i = 0; i < drafts.length; i += 1) {
        const draft = drafts[i]
        let assignee = activeAssignees[i % activeAssignees.length]
        let title = draft.detail || '请处理：'
        const requirementParts = []
        if (draft.input) requirementParts.push(`输入信息：${draft.input}`)
        if (draft.output) requirementParts.push(`期望输出：${draft.output}`)
        if (dispatchRequirement) requirementParts.push(`统一要求：${dispatchRequirement}`)
        let requirement = requirementParts.join('\n')
        if (draft.assignee) {
          const maybeAssignee = draft.assignee
          const matched = employeeRows.find((item) => item.name.toLowerCase() === maybeAssignee.toLowerCase())
          if (matched) {
            assignee = matched.name
          } else if (activeAssignees.includes(maybeAssignee)) {
            assignee = maybeAssignee
          }
        }
        const projectId = Number(draft.projectId || 0) || defaultProjectId
        const plan = buildExecutionPlan(title, requirement)
        const description = formatDispatchDescription(
          dispatchDueAt,
          dispatchReviewer || mainAgentName,
          requirement || '主Agent自动拆解并后台执行，产出可直接验收的结果。'
        ) + `\n${BOSS_MODE_MARKER}`
        const created = await AgentService.createGoalTask(
          projectId,
          title,
          description,
          assignee,
          extractDepartment(assignee)
        )
        if (!created?.success || !created.id) continue
        await AgentService.updateGoalTaskExecutionState(
          created.id,
          'plan',
          'active',
          `主Agent 已派发给 ${assignee}，当前计划：${plan[0]}`,
          `${title}\n计划：${plan.join(' -> ')}`
        )
        createdJobs.push({
          taskId: created.id,
          assignee,
          title,
          plan,
          note: requirement,
          statusLabel: '执行中（plan）',
          reviewStatus: 'pending',
          lastMessage: `当前计划：${plan[0]}`,
          updatedAt: new Date().toISOString(),
        })
      }
      if (!createdJobs.length) {
        window.alert('没有成功创建任务，请检查输入内容')
        return
      }
      const combinedJobs = [...createdJobs, ...quickJobs].slice(0, 50)
      setQuickJobs(combinedJobs)
      setQuickTaskDrafts([])
      createdJobs.forEach((job) => {
        void startSubagentRun(job)
      })
      await load()
      await sleep(650)
      const synced = await resolveQuickJobStatuses(combinedJobs)
      setQuickJobs(synced)
    } catch (error) {
      console.error('Failed to run quick boss dispatch:', error)
      window.alert('后台派发失败，请稍后重试')
    } finally {
      setQuickDispatching(false)
    }
  }, [
    dispatchDueAt,
    dispatchProjectId,
    dispatchProjects,
    dispatchRequirement,
    dispatchReviewer,
    employeeRows,
    load,
    mainAgentName,
    quickJobs,
    quickTaskDrafts,
    resolveQuickJobStatuses,
    selectedParallelAgents,
    startSubagentRun,
  ])

  const appendQuickTemplate = useCallback((line: string) => {
    const parts = line.split('|').map((part) => part.trim())
    setQuickTaskDrafts((prev) => [
      ...prev,
      createQuickTaskDraft(parts[0] || '', parts[1] || '', parts.slice(2).join(' | '), dispatchProjectId),
    ])
  }, [dispatchProjectId])

  useEffect(() => {
    if (!simpleMode || quickJobs.length === 0) return
    const timer = window.setInterval(() => {
      void refreshQuickJobs()
    }, 12000)
    return () => window.clearInterval(timer)
  }, [quickJobs.length, refreshQuickJobs, simpleMode])

  useEffect(() => {
    if (expandedQuickJobId == null) return
    if (!quickJobs.some((item) => item.taskId === expandedQuickJobId)) {
      setExpandedQuickJobId(null)
    }
  }, [expandedQuickJobId, quickJobs])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(quickJobsStorageKey)
      if (!raw) {
        setQuickJobs([])
        return
      }
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) {
        setQuickJobs([])
        return
      }
      const rows: QuickBossJob[] = parsed
        .filter((item) => item && typeof item.taskId === 'number')
        .map((item) => ({
          taskId: Number(item.taskId),
          assignee: String(item.assignee || ''),
          title: String(item.title || ''),
          plan: Array.isArray(item.plan) ? item.plan.map((p: unknown) => String(p)) : [],
          note: String(item.note || ''),
          statusLabel: String(item.statusLabel || '排队中'),
          reviewStatus: item.reviewStatus === 'accepted' || item.reviewStatus === 'rejected' ? item.reviewStatus : 'pending',
          lastMessage: String(item.lastMessage || ''),
          updatedAt: String(item.updatedAt || new Date().toISOString()),
        }))
      setQuickJobs(rows.slice(0, 50))
    } catch {
      setQuickJobs([])
    }
  }, [quickJobsStorageKey])

  useEffect(() => {
    localStorage.setItem(quickJobsStorageKey, JSON.stringify(quickJobs.slice(0, 50)))
  }, [quickJobs, quickJobsStorageKey])

  useEffect(() => {
    if (!simpleMode || quickJobs.length > 0) return
    const hydrate = async () => {
      try {
        const fromIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        const result = await AgentService.listGoalTasks({
          organizationId,
          fromTime: fromIso,
          limit: 200,
        })
        if (!result?.success || !result.tasks) return
        const mapped: QuickBossJob[] = result.tasks
          .filter((task) => (task.description || '').includes(BOSS_MODE_MARKER))
          .map((task) => ({
            taskId: task.id,
            assignee: task.assignee || '',
            title: task.title || '',
            plan: [],
            note: task.description || '',
            statusLabel: task.status === 'done' ? '待验收' : '执行中（plan）',
            reviewStatus: task.review_status === 'accepted' || task.review_status === 'rejected' ? task.review_status : 'pending',
            lastMessage: task.review_note || '',
            updatedAt: task.updated_at || task.created_at || new Date().toISOString(),
          }))
        if (mapped.length > 0) {
          const merged = mapped.slice(0, 50)
          const synced = await resolveQuickJobStatuses(merged)
          setQuickJobs(synced)
        }
      } catch {
        // ignore hydrate failures
      }
    }
    void hydrate()
  }, [organizationId, quickJobs.length, resolveQuickJobStatuses, simpleMode])

  const quickAssignTaskForEmployee = useCallback(async (employeeName: string) => {
    const projectId = Number(dispatchProjectId)
    if (!projectId) {
      window.alert('请先在派单中心选择一个项目')
      return
    }
    const target = (employeeName || '').trim()
    if (!target) {
      window.alert('员工名称不能为空')
      return
    }
    setQuickAssigningEmployee(target)
    try {
      const title = `执行任务：${target} - ${new Date().toLocaleString()}`
      const description = formatDispatchDescription(dispatchDueAt, dispatchReviewer, dispatchRequirement || '请先完成并回写结果')
      const created = await AgentService.createGoalTask(
        projectId,
        title,
        description,
        target,
        extractDepartment(target)
      )
      if (!created?.success || !created.id) {
        window.alert(created?.error || '快速派单失败')
        return
      }
      await AgentService.setDashboardNextTask(target, created.id, organizationId)
      await load()
      applyAgentSkillPreset(target)
      await launchTaskInWorkbench(created.id, target)
    } catch (error) {
      console.error('Failed to quick assign task for employee:', error)
      window.alert('快速派单失败，请稍后重试')
    } finally {
      setQuickAssigningEmployee('')
    }
  }, [dispatchDueAt, dispatchProjectId, dispatchRequirement, dispatchReviewer, launchTaskInWorkbench, load, organizationId])

  const claimAndLaunchHandoffTask = useCallback(
    async (task: GoalTaskListItem) => {
      if (!handoffOwner.trim()) {
        window.alert('请先填写接手人')
        return
      }
      setHandoffClaimingTaskId(task.id)
      try {
        const result = await AgentService.claimGoalTaskHandoff(task.id, handoffOwner.trim(), '一人公司看板接手返工')
        if (!result?.success) {
          window.alert(result?.error || '接手失败')
          return
        }
        await load()
        applyAgentSkillPreset(task.assignee || handoffOwner.trim())
        await launchTaskInWorkbench(task.id, task.assignee || handoffOwner.trim())
      } catch (error) {
        console.error('Failed to claim handoff task:', error)
        window.alert('接手失败，请稍后重试')
      } finally {
        setHandoffClaimingTaskId(null)
      }
    },
    [handoffOwner, launchTaskInWorkbench, load]
  )

  const notifyAssigneeToExecute = useCallback(
    async (task: GoalTaskListItem) => {
      const assignee = (task.assignee || '').trim()
      if (!assignee) {
        window.alert('该任务暂无员工，无法通知')
        return
      }
      setHandoffNotifyTaskId(task.id)
      try {
        await AgentService.setDashboardNextTask(assignee, task.id, organizationId)
        applyAgentSkillPreset(assignee)
        await launchTaskInWorkbench(task.id, assignee)
      } catch (error) {
        console.error('Failed to notify assignee:', error)
        window.alert('通知失败，请稍后重试')
      } finally {
        setHandoffNotifyTaskId(null)
      }
    },
    [launchTaskInWorkbench, organizationId]
  )

  const replayHandoffTaskInWorkbench = useCallback((task: GoalTaskListItem) => {
    const sessionId = createSession(`返工回放 #${task.id}`)
    setSessionOrganization(sessionId, organizationId)
    setSessionGoalTask(sessionId, task.id)
    const replayPrompt = [
      '请回放该返工任务的执行与审计记录，并给出下一步修复方案。',
      `任务ID: ${task.id}`,
      `标题: ${task.title}`,
      `员工: ${task.assignee || '未分配'}`,
      `返工原因: ${task.review_note || '未填写'}`,
      `项目: ${task.project_title}`,
      '输出: 1) 失败点 2) 风险 3) 修复步骤 4) 是否可直接重试。',
    ].join('\n')
    localStorage.setItem('cks.workbench.seedPrompt', replayPrompt)
    setCurrentSession(sessionId)
    navigate('/workbench')
  }, [createSession, navigate, organizationId, setCurrentSession, setSessionGoalTask, setSessionOrganization])

  const filteredHandoffTasks = useMemo(() => {
    if (handoffAssigneeFilter === 'all') return handoffTasks
    return handoffTasks.filter((task) => (task.assignee || '').trim() === handoffAssigneeFilter)
  }, [handoffAssigneeFilter, handoffTasks])

  useEffect(() => {
    const visibleIds = new Set(filteredHandoffTasks.map((task) => task.id))
    setSelectedHandoffTaskIds((prev) => prev.filter((id) => visibleIds.has(id)))
  }, [filteredHandoffTasks])

  const toggleHandoffTaskSelection = useCallback((taskId: number, checked: boolean) => {
    setSelectedHandoffTaskIds((prev) => {
      if (checked) {
        if (prev.includes(taskId)) return prev
        return [...prev, taskId]
      }
      return prev.filter((id) => id !== taskId)
    })
  }, [])

  const toggleSelectAllFilteredHandoff = useCallback(
    (checked: boolean) => {
      if (!checked) {
        setSelectedHandoffTaskIds([])
        return
      }
      setSelectedHandoffTaskIds(filteredHandoffTasks.map((task) => task.id))
    },
    [filteredHandoffTasks]
  )

  const batchNotifyAssignees = useCallback(async () => {
    const selected = filteredHandoffTasks.filter((task) => selectedHandoffTaskIds.includes(task.id))
    if (selected.length === 0) {
      window.alert('请先选择任务')
      return
    }
    setBatchProcessing(true)
    try {
      let success = 0
      for (const task of selected) {
        const assignee = (task.assignee || '').trim()
        if (!assignee) continue
        const result = await AgentService.setDashboardNextTask(assignee, task.id, organizationId)
        if (result?.success) success += 1
      }
      await load()
      window.alert(`批量通知完成：${success}/${selected.length}`)
    } catch (error) {
      console.error('Failed to batch notify assignees:', error)
      window.alert('批量通知失败，请稍后重试')
    } finally {
      setBatchProcessing(false)
    }
  }, [filteredHandoffTasks, load, selectedHandoffTaskIds, organizationId])

  const batchClaimHandoffTasks = useCallback(async () => {
    if (!handoffOwner.trim()) {
      window.alert('请先填写接手人')
      return
    }
    const selected = filteredHandoffTasks.filter((task) => selectedHandoffTaskIds.includes(task.id))
    if (selected.length === 0) {
      window.alert('请先选择任务')
      return
    }
    setBatchProcessing(true)
    try {
      let success = 0
      for (const task of selected) {
        const result = await AgentService.claimGoalTaskHandoff(task.id, handoffOwner.trim(), '一人公司看板批量接手返工')
        if (result?.success) success += 1
      }
      await load()
      setSelectedHandoffTaskIds([])
      window.alert(`批量接手完成：${success}/${selected.length}`)
    } catch (error) {
      console.error('Failed to batch claim handoff tasks:', error)
      window.alert('批量接手失败，请稍后重试')
    } finally {
      setBatchProcessing(false)
    }
  }, [filteredHandoffTasks, handoffOwner, load, selectedHandoffTaskIds, organizationId])

  const openManagerBriefingInWorkbench = useCallback(() => {
    const riskTip = topRiskOwner
      ? `当前高风险数字员工：${topRiskOwner.owner.assignee}（风险分 ${topRiskOwner.riskScore}）`
      : '当前暂无高风险数字员工'
    localStorage.setItem(
      'cks.workbench.seedPrompt',
      [
        '请基于当前我的一人公司看板生成一份经营简报。',
        `空间：${organizationId}`,
        `总任务：${summary.total_tasks}，待验收：${summary.pending_review}，驳回：${summary.rejected}，已验收：${summary.accepted}`,
        `自动完成率：${managerInsights.automationRate}%`,
        `团队平均完成率：${managerInsights.avgOwnerCompletion}%`,
        riskTip,
        '输出格式：1) 风险总览 2) 本周进展 3) 三条可执行决策建议。',
      ].join('\n')
    )
    const sessionId = createSession(`一人公司经营简报 - ${organizationId}`)
    setSessionOrganization(sessionId, organizationId)
    setCurrentSession(sessionId)
    navigate('/workbench')
  }, [createSession, managerInsights.automationRate, managerInsights.avgOwnerCompletion, navigate, organizationId, setCurrentSession, setSessionOrganization, summary, topRiskOwner])
  const openApprovalCenterInWorkbench = useCallback(() => {
    localStorage.setItem('cks.workbench.openApprovalCenter', '1')
    localStorage.setItem(
      'cks.workbench.seedPrompt',
      [
        '请先查看审批中心，汇总过去24小时的高风险操作审批情况。',
        `空间：${organizationId}`,
        `当前待审批：${approvalSummary.pending}，已批准：${approvalSummary.approved}，已拒绝：${approvalSummary.denied}`,
        '输出：1) 风险操作概览 2) 异常审批建议 3) 接下来24小时审批策略建议。',
      ].join('\n')
    )
    const sessionId = createSession(`审批中心 - ${organizationId}`)
    setSessionOrganization(sessionId, organizationId)
    setCurrentSession(sessionId)
    navigate('/workbench')
  }, [approvalSummary.approved, approvalSummary.denied, approvalSummary.pending, createSession, navigate, organizationId, setCurrentSession, setSessionOrganization])

  const exportManagerWeeklyReport = useCallback(() => {
    const lines = [
      '# 一人公司周报（自动导出）',
      '',
      `- 空间：${organizationId}`,
      `- 导出时间：${new Date().toLocaleString()}`,
      '',
      '## 核心指标',
      `- 总任务：${summary.total_tasks}`,
      `- 待验收：${summary.pending_review}`,
      `- 驳回返工：${summary.rejected}`,
      `- 已验收：${summary.accepted}`,
      `- 自动完成率：${managerInsights.automationRate}%`,
      `- 团队平均完成率：${managerInsights.avgOwnerCompletion}%`,
      `- 风险任务数：${managerInsights.riskTaskCount}`,
      '',
      '## 本周建议动作',
      ...(topInterventions.length > 0
        ? topInterventions.map((item, idx) => `${idx + 1}. ${item.title}（${item.reason}）`)
        : ['1. 当前暂无高优先级干预项']),
      '',
      '## 员工概览（Top 5）',
      ...visibleOwners.slice(0, 5).map(
        (owner, idx) =>
          `${idx + 1}. ${owner.assignee}｜待验收 ${owner.pending_review}｜进行中 ${owner.in_progress}｜驳回 ${owner.rejected}｜完成率 ${Math.round(owner.completion_rate || 0)}%`
      ),
      '',
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `manager-weekly-report-${organizationId}-${Date.now()}.md`
    a.click()
    URL.revokeObjectURL(url)
  }, [managerInsights.automationRate, managerInsights.avgOwnerCompletion, managerInsights.riskTaskCount, organizationId, summary, topInterventions, visibleOwners])
  const exportApprovalAuditCsv = useCallback(() => {
    const rows = [
      ['id', 'tool_name', 'source', 'risk_level', 'status', 'decided_by', 'updated_at', 'decision_note'],
      ...visibleApprovals.map((item) => [
        sanitizeCsvCell(item.id),
        sanitizeCsvCell(item.tool_name),
        sanitizeCsvCell(item.source || ''),
        sanitizeCsvCell(item.risk_level || ''),
        sanitizeCsvCell(item.status || ''),
        sanitizeCsvCell(item.decided_by || ''),
        sanitizeCsvCell(item.updated_at || item.created_at || ''),
        sanitizeCsvCell(item.decision_note || ''),
      ]),
    ]
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `board-approval-audit-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [visibleApprovals])
  const replayApprovalContext = useCallback((record: ExecutionApprovalRecord) => {
    const payload = record.payload || {}
    const targetSessionId = String(payload.session_id || '').trim()
    const goalTaskId = parseGoalTaskId(payload.goal_task_id)
    if (targetSessionId && sessions[targetSessionId]) {
      setCurrentSession(targetSessionId)
      if (goalTaskId) setSessionGoalTask(targetSessionId, goalTaskId)
      setSessionOrganization(targetSessionId, organizationId)
      navigate('/workbench')
      return
    }
    const sessionId = createSession(`审批回放 - ${record.tool_name}`)
    setSessionOrganization(sessionId, organizationId)
    if (goalTaskId) setSessionGoalTask(sessionId, goalTaskId)
    const hint = [
      '请回放该审批相关执行上下文，并输出：执行目的、风险点、当前状态、下一步建议。',
      `审批ID：${record.id}`,
      `工具：${record.tool_name}`,
      `状态：${record.status}`,
      payload.session_id ? `原会话ID：${payload.session_id}` : '',
      goalTaskId ? `关联任务：#${goalTaskId}` : '',
    ].filter(Boolean).join('\n')
    localStorage.setItem('cks.workbench.seedPrompt', hint)
    setCurrentSession(sessionId)
    navigate('/workbench')
  }, [createSession, navigate, organizationId, sessions, setCurrentSession, setSessionGoalTask, setSessionOrganization])
  const buildApprovalSnapshotText = useCallback((record: ExecutionApprovalRecord) => {
    const snapshots = summarizeApprovalPayload(record)
    return [
      `审批ID: ${record.id}`,
      `工具: ${record.tool_name}`,
      `状态: ${getApprovalStatusMeta(record.status).label}`,
      `风险: ${record.risk_level || '-'}`,
      `处理人: ${record.decided_by || 'system'}`,
      ...snapshots,
    ].join('\n')
  }, [])
  const copyApprovalSnapshot = useCallback(async (record: ExecutionApprovalRecord) => {
    const text = buildApprovalSnapshotText(record)
    try {
      await navigator.clipboard.writeText(text)
      window.alert('审批快照已复制')
    } catch {
      window.alert('复制失败，请检查剪贴板权限')
    }
  }, [buildApprovalSnapshotText])
  const openSnapshotInWorkbench = useCallback((record: ExecutionApprovalRecord) => {
    const sessionId = createSession(`审批快照 - ${record.tool_name}`)
    setSessionOrganization(sessionId, organizationId)
    const goalTaskId = parseGoalTaskId(record.payload?.goal_task_id)
    if (goalTaskId) setSessionGoalTask(sessionId, goalTaskId)
    const prompt = [
      '请基于以下审批快照做执行复盘与风险建议：',
      buildApprovalSnapshotText(record),
      '输出：1) 发生了什么 2) 风险点评估 3) 后续操作建议。',
    ].join('\n')
    localStorage.setItem('cks.workbench.seedPrompt', prompt)
    setCurrentSession(sessionId)
    navigate('/workbench')
  }, [buildApprovalSnapshotText, createSession, navigate, organizationId, setCurrentSession, setSessionGoalTask, setSessionOrganization])

  if (simpleMode) {
    return (
      <div className="h-full overflow-y-auto text-white p-4 md:p-6" style={pixelBgStyle}>
        <div className="mx-auto w-full max-w-[1560px] space-y-4">
          <div className={`p-3 ${pixelPanelClass}`}>
            <PageHeader
              title="一人公司（老板模式）"
              subtitle="你就是老板：派单 -> AI员工执行 -> 你验收结果"
              icon={<Users className="h-5 w-5 text-neutral-300" />}
              className="bg-transparent border-neutral-800/70"
            />
          </div>

          <div className={`p-3 space-y-3 ${pixelPanelClass}`}>
            <div className="grid gap-3 md:grid-cols-3">
              <StatTile title="总指挥" value={<span className="text-cyan-200">{mainAgentName}</span>} />
              <StatTile title="可用AI员工" value={<span className="text-white">{employeeRows.filter((item) => item.status === 'active').length}</span>} />
              <StatTile title="后台执行中" value={<span className="text-blue-300">{quickJobs.filter((item) => item.statusLabel.includes('执行中')).length}</span>} />
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <div className="rounded border border-neutral-800 bg-black/30 px-3 py-2 text-[12px] text-neutral-300">① 选项目并派单</div>
              <div className="rounded border border-neutral-800 bg-black/30 px-3 py-2 text-[12px] text-neutral-300">② AI员工后台执行</div>
              <div className="rounded border border-neutral-800 bg-black/30 px-3 py-2 text-[12px] text-neutral-300">③ 查看结果并验收</div>
            </div>
            <div className="rounded border border-neutral-800 bg-black/20 p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-neutral-300">运行控制台（老板视角）</div>
                <div className="flex flex-wrap items-center gap-2">
                  {simpleControlSummary.pendingApprovals > 0 ? (
                    <button className={`${pixelButtonClass} !py-1`} onClick={openApprovalCenterInWorkbench}>
                      去审批中心
                    </button>
                  ) : null}
                  {simpleControlSummary.failedJobs > 0 ? (
                    <button
                      className={`${pixelButtonClass} !py-1`}
                      onClick={() => navigate(`/goals?review_status=rejected&organization_id=${encodeURIComponent(organizationId)}`)}
                    >
                      查看失败任务
                    </button>
                  ) : null}
                  <button className={`${pixelButtonClass} !py-1`} onClick={load} disabled={loading}>
                    {loading ? '刷新中...' : '刷新全局状态'}
                  </button>
                </div>
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-4">
                <div className="rounded border border-cyan-900/40 bg-black/35 px-2 py-1.5 text-[11px] text-neutral-300">
                  执行中任务：<span className="text-cyan-200">{simpleControlSummary.runningJobs}</span>
                </div>
                <div className="rounded border border-rose-900/40 bg-black/35 px-2 py-1.5 text-[11px] text-neutral-300">
                  失败/驳回：<span className="text-rose-300">{simpleControlSummary.failedJobs}</span>
                </div>
                <div className="rounded border border-amber-900/40 bg-black/35 px-2 py-1.5 text-[11px] text-neutral-300">
                  待审批：<span className="text-amber-300">{simpleControlSummary.pendingApprovals}</span>
                </div>
                <div className="rounded border border-neutral-700 bg-black/35 px-2 py-1.5 text-[11px] text-neutral-300">
                  被拒审批：<span className="text-rose-300">{simpleControlSummary.deniedApprovals}</span>
                </div>
              </div>
              <div className="mt-2 max-h-28 overflow-y-auto rounded border border-neutral-800 bg-black/35 p-2">
                {simpleControlFeed.length === 0 ? (
                  <div className="text-[11px] text-neutral-500">暂无运行事件。</div>
                ) : (
                  simpleControlFeed.map((item) => (
                    <div key={item.key} className={`mb-1 flex items-center gap-1.5 text-[11px] ${item.tone}`}>
                      <span className={`rounded border px-1 py-0.5 text-[10px] ${simpleFeedCategoryMeta[item.category].className}`}>
                        {simpleFeedCategoryMeta[item.category].label}
                      </span>
                      <span className="text-neutral-500">{new Date(item.at).toLocaleTimeString()}</span>
                      <span>{item.text}</span>
                      {item.category === 'approval' ? (
                        <button
                          className="ml-auto rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-300 hover:text-white"
                          onClick={openApprovalCenterInWorkbench}
                        >
                          去处理
                        </button>
                      ) : null}
                      {item.category !== 'approval' && item.taskId ? (
                        <div className="ml-auto flex items-center gap-1">
                          <button
                            className="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-300 hover:text-white"
                            onClick={() => { void openQuickJobResult(item.taskId as number) }}
                          >
                            看结果
                          </button>
                          {item.category === 'fallback' ? (
                            <button
                              className="rounded border border-amber-700/60 px-1.5 py-0.5 text-[10px] text-amber-200 hover:text-amber-100"
                              onClick={() => {
                                const retryJob = quickJobs.find((job) => job.taskId === item.taskId)
                                if (!retryJob) return
                                void startSubagentRun(retryJob)
                              }}
                            >
                              重试
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="rounded border border-neutral-800 bg-black/20 p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-neutral-300">数字员工沙盘（游戏视图）</div>
                <div className="flex items-center gap-2">
                  <button
                    className={`${pixelButtonClass} !py-1`}
                    onClick={() => {
                      setCustomEmployeeName('')
                      setCustomEmployeeRole('')
                      setCustomEmployeeSpecialty('')
                      setCustomEmployeeSkills('')
                      setSimpleRecruitPrimarySkill('')
                      setSimpleRecruitOpen(true)
                    }}
                  >
                    新增员工
                  </button>
                  <button
                    className={`${pixelButtonClass} !py-1`}
                    onClick={() => setSimpleIdleOnly((prev) => !prev)}
                  >
                    {simpleIdleOnly ? '显示全部员工' : '仅看空闲员工'}
                  </button>
                  <div className="text-[11px] text-neutral-500">空闲 {idleEmployeeCount} / 总计 {employeeRows.length} · 点击小人查看详情</div>
                </div>
              </div>
              <div
                className="mt-2 relative h-64 overflow-hidden rounded border border-cyan-900/40"
                style={{
                  backgroundColor: '#070b14',
                  backgroundImage:
                    'linear-gradient(rgba(56,189,248,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.12) 1px, transparent 1px)',
                  backgroundSize: '26px 26px',
                }}
              >
                {simpleWorldNodes.map(({ employee, left, top }) => {
                  const isIdle = employee.status === 'active' && (employee.inProgress || 0) === 0
                  const avatarSrc = getEmployeeAvatar(employee.name || '')
                  const badgeClass = employee.status === 'paused'
                    ? 'bg-rose-500/20 text-rose-200 border-rose-500/30'
                    : isIdle
                      ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30'
                      : 'bg-cyan-500/20 text-cyan-200 border-cyan-500/30'
                  return (
                    <button
                      key={`world-${employee.name}`}
                      type="button"
                      className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 group"
                      style={{ left: `${left}%`, top: `${top}%` }}
                      onClick={() => {
                        setSimpleFocusEmployeeName(employee.name)
                      }}
                    >
                      <div className="rounded border border-neutral-700 bg-black/50 px-2 py-0.5 text-[10px] text-cyan-100 group-hover:text-white">
                        {employee.name}
                      </div>
                      <div className={`h-10 w-10 overflow-hidden rounded border-2 ${ownerStateClass[isIdle ? 'healthy' : 'in_progress']}`}>
                        <img
                          src={avatarSrc}
                          alt={employee.name || 'AI'}
                          className={`h-full w-full object-cover ${employee.status === 'paused' ? 'grayscale opacity-70' : ''}`}
                        />
                      </div>
                      <span className={`rounded border px-1.5 py-0.5 text-[10px] ${badgeClass}`}>
                        {employee.status === 'paused' ? '暂停' : isIdle ? '空闲' : '忙碌'}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="mx-auto w-full max-w-none space-y-3">
                <div className="rounded border border-cyan-900/40 bg-gradient-to-br from-cyan-950/20 via-black/40 to-black/60 p-3 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm text-cyan-200">任务分发中心</div>
                    <div className="mt-1 text-[11px] text-neutral-400">写清楚“做什么、给什么输入、要什么输出”，然后一键派发。</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {quickBossTemplates.slice(0, 4).map((item) => (
                      <button
                        key={item.key}
                        className={`${pixelButtonClass} !py-1`}
                        onClick={() => appendQuickTemplate(item.line)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <select
                    value={dispatchProjectId}
                    onChange={(e) => setDispatchProjectId(e.target.value)}
                    className={pixelInputClass}
                  >
                    <option value="">默认项目（可选）</option>
                    {dispatchProjects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="rounded border border-cyan-800/40 bg-black/40 p-2.5">
                  <div className="flex items-center justify-between gap-2 rounded border border-neutral-800 bg-black/45 px-2.5 py-1.5">
                    <div className="text-[11px] text-cyan-200">任务卡</div>
                    <div className="text-[11px] text-neutral-500">
                      {quickTaskDrafts.filter((item) => item.assignee.trim() || item.detail.trim() || item.input.trim() || item.output.trim()).length} 条待派发
                    </div>
                  </div>
                  <div className="mt-2 rounded border border-neutral-800 bg-black/60 p-2 space-y-2">
                    {quickTaskDrafts.map((draft, index) => (
                      <div key={draft.id} className="rounded border border-neutral-800 bg-black/45 p-2">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="text-[11px] text-cyan-300">任务卡 #{index + 1}</div>
                          <button
                            className={`${pixelButtonClass} !py-1`}
                            onClick={() => setQuickTaskDrafts((prev) => prev.filter((item) => item.id !== draft.id))}
                          >
                            删除
                          </button>
                        </div>
                        <div className="grid gap-2 lg:grid-cols-[220px_180px_1.2fr_1fr_1fr]">
                          <select
                            value={draft.projectId}
                            onChange={(e) => setQuickTaskDrafts((prev) => prev.map((item) => item.id === draft.id ? { ...item, projectId: e.target.value } : item))}
                            className={pixelInputClass}
                          >
                            <option value="">选择项目（默认：上方默认项目）</option>
                            {dispatchProjects.map((project) => (
                              <option key={`draft-project-${draft.id}-${project.id}`} value={String(project.id)}>
                                {project.label}
                              </option>
                            ))}
                          </select>
                          <select
                            value={draft.assignee}
                            onChange={(e) => setQuickTaskDrafts((prev) => prev.map((item) => item.id === draft.id ? { ...item, assignee: e.target.value } : item))}
                            className={pixelInputClass}
                          >
                            <option value="">自动分配员工</option>
                            {employeeRows
                              .filter((item) => item.status === 'active')
                              .map((item) => (
                                <option key={`draft-assignee-${draft.id}-${item.name}`} value={item.name}>
                                  {item.name}
                                </option>
                              ))}
                          </select>
                          <input
                            value={draft.detail}
                            onChange={(e) => setQuickTaskDrafts((prev) => prev.map((item) => item.id === draft.id ? { ...item, detail: e.target.value } : item))}
                            className={pixelInputClass}
                            placeholder="任务内容详情（要做什么）"
                          />
                          <input
                            value={draft.input}
                            onChange={(e) => setQuickTaskDrafts((prev) => prev.map((item) => item.id === draft.id ? { ...item, input: e.target.value } : item))}
                            className={pixelInputClass}
                            placeholder="输入信息（给Agent的素材/背景）"
                          />
                          <input
                            value={draft.output}
                            onChange={(e) => setQuickTaskDrafts((prev) => prev.map((item) => item.id === draft.id ? { ...item, output: e.target.value } : item))}
                            className={pixelInputClass}
                            placeholder="期望输出（文档/PPT/表格等）"
                          />
                        </div>
                      </div>
                    ))}
                    <button
                      className={`${pixelButtonClass} w-full border-cyan-500/50 text-cyan-200`}
                      onClick={() => setQuickTaskDrafts((prev) => [...prev, createQuickTaskDraft('', '', '', dispatchProjectId)])}
                    >
                      + 新增任务卡
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-neutral-500">每张任务卡可选不同项目；不选则用上方默认项目。支持并行派发并自动回流结果。</span>
                  <div className="flex items-center gap-2">
                    <button
                      className={`${pixelButtonClass} border-cyan-500/50 text-cyan-200`}
                      onClick={runQuickBossDispatch}
                      disabled={quickDispatching}
                    >
                      {quickDispatching ? '后台派发中...' : '启动后台并行执行'}
                    </button>
                    <button className={pixelButtonClass} onClick={refreshQuickJobs}>
                      刷新执行反馈
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={`p-3 ${pixelPanelClass}`}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm text-neutral-200">后台执行反馈（无需进入工作台）</div>
                <div className="text-[11px] text-neutral-500 mt-1">状态来自后端任务与执行状态接口（非前端模拟）。</div>
              </div>
              <button className={pixelButtonClass} onClick={refreshQuickJobs}>刷新</button>
            </div>
            {quickJobs.length === 0 ? (
              <div className="mt-3 text-xs text-neutral-500">暂无执行记录。派发任务后将在这里看到执行状态与结果回流。</div>
            ) : (
              <div className="mt-3 max-h-72 overflow-y-auto rounded border border-neutral-800">
                <table className="w-full table-fixed text-xs">
                  <colgroup>
                    <col style={{ width: '36%' }} />
                    <col style={{ width: '9%' }} />
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '9%' }} />
                    <col style={{ width: '30%' }} />
                  </colgroup>
                  <thead className="bg-neutral-900 text-neutral-400">
                    <tr>
                      <th className="p-2 text-left">任务</th>
                      <th className="p-2 text-left">SubAgent</th>
                      <th className="p-2 text-left">状态</th>
                      <th className="p-2 text-left">验收</th>
                      <th className="p-2 text-left">更新时间</th>
                      <th className="p-2 text-left">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quickJobs.map((job) => (
                      <Fragment key={`quick-job-${job.taskId}`}>
                        <tr className="border-t border-neutral-800">
                        <td className="p-2 align-top">
                          <div
                            className="text-neutral-200 truncate"
                            title={`#${job.taskId} ${job.title}`}
                          >
                            #{job.taskId} {job.title}
                          </div>
                          {job.plan.length > 0 ? (
                            <div className="text-[11px] text-neutral-500 mt-1 break-words max-h-10 overflow-y-auto">计划：{job.plan.slice(0, 2).join(' / ')}</div>
                          ) : null}
                          {job.note ? <div className="text-[11px] text-neutral-500 mt-1 break-words max-h-10 overflow-y-auto">{job.note}</div> : null}
                          {job.lastMessage ? <div className="text-[11px] text-cyan-200 mt-1 break-words max-h-16 overflow-y-auto">{job.lastMessage}</div> : null}
                        </td>
                        <td className="p-2 text-cyan-200 whitespace-nowrap align-middle">{job.assignee}</td>
                        <td className="p-2 whitespace-nowrap align-middle">
                          <StatusBadge
                            label={job.statusLabel}
                            className={job.statusLabel.includes('已验收')
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                              : job.statusLabel.includes('驳回')
                                ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                                : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200'}
                          />
                        </td>
                        <td className="p-2 whitespace-nowrap align-middle">
                          <StatusBadge
                            label={job.reviewStatus === 'accepted' ? '已通过' : job.reviewStatus === 'rejected' ? '已驳回' : '待验收'}
                            className={
                              job.reviewStatus === 'accepted'
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                                : job.reviewStatus === 'rejected'
                                  ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                                  : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                            }
                          />
                        </td>
                        <td className="p-2 text-neutral-500 whitespace-nowrap align-middle">{new Date(job.updatedAt).toLocaleString()}</td>
                        <td className="p-2 align-middle">
                          <div className="flex items-center gap-1 whitespace-nowrap overflow-x-auto pb-0.5">
                            <button
                              className="cks-btn cks-btn-secondary"
                              onClick={() => {
                                void openQuickJobResult(job.taskId)
                              }}
                            >
                              查看结果
                            </button>
                            <button
                              className="cks-btn cks-btn-secondary"
                              onClick={async () => {
                                if (expandedQuickJobId === job.taskId) {
                                  setExpandedQuickJobId(null)
                                  return
                                }
                                setExpandedQuickJobId(job.taskId)
                                await loadQuickJobLogs(job.taskId)
                              }}
                            >
                              {expandedQuickJobId === job.taskId ? '收起日志' : '执行日志'}
                            </button>
                            <button
                              className="cks-btn cks-btn-secondary"
                              onClick={() => reviewQuickJob(job.taskId, 'accept')}
                              disabled={job.reviewStatus === 'accepted'}
                            >
                              验收通过
                            </button>
                            <button
                              className="cks-btn cks-btn-danger"
                              onClick={() => reviewQuickJob(job.taskId, 'reject')}
                            >
                              驳回返工
                            </button>
                            <button
                              className="cks-btn cks-btn-danger"
                              onClick={() => {
                                void deleteQuickJob(job.taskId)
                              }}
                            >
                              删除任务
                            </button>
                          </div>
                        </td>
                        </tr>
                        {expandedQuickJobId === job.taskId ? (
                          <tr className="border-t border-neutral-800 bg-black/30">
                            <td className="p-2" colSpan={6}>
                              {quickJobLogs[job.taskId]?.loading ? (
                                <div className="text-[11px] text-neutral-400">正在加载执行日志...</div>
                              ) : quickJobLogs[job.taskId]?.error ? (
                                <div className="text-[11px] text-rose-300">{quickJobLogs[job.taskId]?.error}</div>
                              ) : (
                                <div className="space-y-2">
                                  <div className="text-[11px] text-neutral-400">
                                    当前阶段：{quickJobLogs[job.taskId]?.phase || '-'} / {quickJobLogs[job.taskId]?.phaseStatus || '-'}
                                  </div>
                                  {quickJobLogs[job.taskId]?.subagentRunId ? (
                                    <div className="text-[11px] text-cyan-300">
                                      {'SubAgent Run：'}{quickJobLogs[job.taskId]?.subagentRunId}
                                      {quickJobLogs[job.taskId]?.subagentRunStatus ? ` (${quickJobLogs[job.taskId]?.subagentRunStatus})` : ''}
                                    </div>
                                  ) : null}
                                  {quickJobLogs[job.taskId]?.phaseNote ? (
                                    <div className="text-[11px] text-cyan-200">说明：{quickJobLogs[job.taskId]?.phaseNote}</div>
                                  ) : null}
                                  {quickJobLogs[job.taskId]?.subagentError ? (
                                    <div className="text-[11px] text-rose-300">子Agent异常：{quickJobLogs[job.taskId]?.subagentError}</div>
                                  ) : null}
                                  <div className="grid gap-2 md:grid-cols-2">
                                    <div className="rounded border border-neutral-800 bg-black/40 p-2">
                                      <div className="text-[11px] text-neutral-400 mb-1">执行日志</div>
                                      {(quickJobLogs[job.taskId]?.executions || []).slice(0, 8).map((item, idx) => (
                                        <div key={`exec-${job.taskId}-${idx}`} className="text-[11px] text-neutral-300 mb-1">
                                          {new Date(item.timestamp || Date.now()).toLocaleTimeString()} · {item.tool_name || 'agent'} · {item.message || '已执行'}
                                        </div>
                                      ))}
                                      {(quickJobLogs[job.taskId]?.executions || []).length === 0 ? (
                                        <div className="text-[11px] text-neutral-500">暂无执行日志</div>
                                      ) : null}
                                    </div>
                                    <div className="rounded border border-neutral-800 bg-black/40 p-2">
                                      <div className="text-[11px] text-neutral-400 mb-1">错误日志</div>
                                      {(quickJobLogs[job.taskId]?.errors || []).slice(0, 8).map((item, idx) => (
                                        <div key={`err-${job.taskId}-${idx}`} className="text-[11px] text-rose-300 mb-1">
                                          {new Date(item.timestamp || Date.now()).toLocaleTimeString()} · {item.tool_name || 'agent'} · {item.error || item.message || '执行失败'}
                                        </div>
                                      ))}
                                      {(quickJobLogs[job.taskId]?.errors || []).length === 0 ? (
                                        <div className="text-[11px] text-emerald-300">暂无错误日志</div>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {simpleRecruitOpen ? (
              <div
                className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
                onClick={() => setSimpleRecruitOpen(false)}
              >
                <div
                  className="w-full max-w-2xl rounded border-2 border-cyan-700 bg-neutral-950 shadow-[0_0_0_2px_rgba(8,145,178,0.35)]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
                    <div>
                      <div className="text-sm text-neutral-100">新增AI员工</div>
                      <div className="text-[11px] text-neutral-500 mt-1">选择岗位模板，配置技能后即可加入你的一人公司。</div>
                    </div>
                    <button className={pixelButtonClass} onClick={() => setSimpleRecruitOpen(false)}>关闭</button>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="grid gap-2 md:grid-cols-2">
                      <select
                        value={selectedTemplate}
                        onChange={(e) => setSelectedTemplate(e.target.value as EmployeeTemplateKey)}
                        className={pixelInputClass}
                      >
                        {employeeTemplates.map((template) => (
                          <option key={`simple-template-${template.key}`} value={template.key}>
                            {template.role}
                          </option>
                        ))}
                      </select>
                      <input
                        value={customEmployeeName}
                        onChange={(e) => setCustomEmployeeName(e.target.value)}
                        placeholder="员工姓名（如：苏知然）"
                        className={pixelInputClass}
                      />
                      <input
                        value={customEmployeeRole}
                        onChange={(e) => setCustomEmployeeRole(e.target.value)}
                        placeholder="岗位（可选）"
                        className={pixelInputClass}
                      />
                      <input
                        value={customEmployeeSpecialty}
                        onChange={(e) => setCustomEmployeeSpecialty(e.target.value)}
                        placeholder="职责说明（可选）"
                        className={pixelInputClass}
                      />
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      <select
                        value={simpleRecruitPrimarySkill}
                        onChange={(e) => {
                          const value = e.target.value
                          setSimpleRecruitPrimarySkill(value)
                        }}
                        className={pixelInputClass}
                      >
                        <option value="">主技能（自动选择）</option>
                        {availableSkillNames.map((skill) => (
                          <option key={`simple-primary-skill-${skill}`} value={skill}>
                            {skill}
                          </option>
                        ))}
                      </select>
                      <input
                        value={customEmployeeSkills}
                        onChange={(e) => setCustomEmployeeSkills(e.target.value)}
                        placeholder="技能组合（逗号分隔，可选）"
                        className={pixelInputClass}
                        list="board-employee-skill-options"
                      />
                    </div>
                    <datalist id="board-employee-skill-options">
                      {availableSkillNames.map((skill) => (
                        <option key={`simple-employee-skill-${skill}`} value={skill} />
                      ))}
                    </datalist>
                    <div className="flex items-center justify-end gap-2">
                      <button className={pixelButtonClass} onClick={() => setSimpleRecruitOpen(false)}>取消</button>
                      <button
                        className={`${pixelButtonClass} border-cyan-500/50 text-cyan-200`}
                        onClick={() => { void recruitEmployee() }}
                      >
                        确认新增
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
            {simpleFocusEmployee ? (
              <div
                className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
                onClick={() => setSimpleFocusEmployeeName('')}
              >
                <div
                  className="w-full max-w-2xl rounded border-2 border-cyan-700 bg-neutral-950 shadow-[0_0_0_2px_rgba(8,145,178,0.35)]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <img
                        src={getEmployeeAvatar(simpleFocusEmployee.name || '')}
                        alt={simpleFocusEmployee.name || 'AI'}
                        className="h-10 w-10 rounded border border-cyan-500/40 object-cover bg-black/40"
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm text-neutral-100">数字员工：{simpleFocusEmployee.name}</div>
                        <div className="truncate text-[11px] text-neutral-400">{simpleFocusEmployee.role || '未设置职能'}</div>
                      </div>
                    </div>
                    <button className={pixelButtonClass} onClick={() => setSimpleFocusEmployeeName('')}>关闭</button>
                  </div>
                  <div className="max-h-[72vh] overflow-y-auto p-4 space-y-3">
                    <div className="grid gap-2 md:grid-cols-2">
                      <div className="rounded border border-neutral-800 bg-black/40 p-2 text-[12px] text-neutral-300">
                        <div>
                          状态：
                          <StatusBadge
                            label={simpleFocusEmployee.status === 'paused' ? '暂停' : (simpleFocusEmployee.inProgress || 0) > 0 ? '忙碌' : '空闲'}
                            className={
                              simpleFocusEmployee.status === 'paused'
                                ? 'ml-1 border-rose-500/30 bg-rose-500/10 text-rose-200'
                                : (simpleFocusEmployee.inProgress || 0) > 0
                                  ? 'ml-1 border-cyan-500/30 bg-cyan-500/10 text-cyan-200'
                                  : 'ml-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                            }
                          />
                        </div>
                        <div className="mt-1">技能：<span className="text-cyan-200">{simpleFocusEmployee.primarySkill || '-'}</span></div>
                        <div className="mt-1">技能栈：<span className="text-neutral-200">{(simpleFocusEmployee.skillStack || []).join('、') || '-'}</span></div>
                        <div className="mt-1">特长：{simpleFocusEmployee.specialty || '-'}</div>
                      </div>
                      <div className="rounded border border-neutral-800 bg-black/40 p-2 text-[12px] text-neutral-300">
                        <div>进行中：{simpleFocusEmployee.inProgress || 0}</div>
                        <div className="mt-1">待验收：{simpleFocusEmployee.pendingReview || 0}</div>
                        <div className="mt-1">总任务：{simpleFocusEmployee.totalTasks || 0}</div>
                        <div className="mt-1">完成率：{simpleFocusEmployee.completionRate || 0}%</div>
                      </div>
                    </div>
                    <div className="rounded border border-neutral-800 bg-black/40 p-3">
                      <div className="text-[12px] text-cyan-200">近期任务（最新 8 条）</div>
                      {simpleFocusEmployeeJobs.length === 0 ? (
                        <div className="mt-2 text-[11px] text-neutral-500">暂无任务记录。可点击下方按钮先派发任务。</div>
                      ) : (
                        <div className="mt-2 space-y-2">
                          {simpleFocusEmployeeJobs.map((job) => (
                            <div key={`focus-job-${job.taskId}`} className="rounded border border-neutral-800 bg-black/40 p-2">
                              <div className="text-[12px] text-neutral-200 truncate">#{job.taskId} {job.title}</div>
                              <div className="mt-1 text-[11px] text-neutral-400 truncate">
                                状态：{job.statusLabel} · 验收：{job.reviewStatus === 'accepted' ? '已通过' : job.reviewStatus === 'rejected' ? '已驳回' : '待验收'} · 更新时间：{new Date(job.updatedAt).toLocaleString()}
                              </div>
                              {job.lastMessage ? <div className="mt-1 max-h-10 overflow-y-auto text-[11px] text-cyan-200">{job.lastMessage}</div> : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        className={`${pixelButtonClass} border-cyan-500/40 text-cyan-200`}
                        onClick={() => {
                          setQuickTaskDrafts((prev) => [...prev, createQuickTaskDraft(simpleFocusEmployee.name, '', '', dispatchProjectId)])
                          setSimpleFocusEmployeeName('')
                        }}
                      >
                        派给TA
                      </button>
                      <button className={pixelButtonClass} onClick={() => setSimpleFocusEmployeeName('')}>关闭</button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
            {quickResultModalTaskId != null ? (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
                <div className="w-full max-w-3xl max-h-[88vh] overflow-hidden rounded border-2 border-cyan-700 bg-neutral-950 shadow-[0_0_0_2px_rgba(8,145,178,0.35)]">
                  {(() => {
                    const job = quickJobs.find((item) => item.taskId === quickResultModalTaskId)
                    const detail = quickJobTaskDetails[quickResultModalTaskId]
                    const logs = quickJobLogs[quickResultModalTaskId]
                    const executionSummary = (logs?.executions || []).find((item) => (item.message || '').includes('任务已完成'))?.message
                      || logs?.phaseNote
                      || job?.lastMessage
                      || '暂无可展示的任务结果'
                    const outputRecord = (logs?.executions || []).find((item) =>
                      String((item as Record<string, any>)?.data?.prompt || '').includes('【实际产出】')
                    ) as (AuditRecord | undefined)
                    const outputPrompt = String((outputRecord as Record<string, any>)?.data?.prompt || '')
                    const outputContent = outputPrompt.includes('【实际产出】')
                      ? outputPrompt.split('【实际产出】')[1].trim()
                      : ''
                    const requirementText = (detail?.description || job?.note || '')
                      .replace(BOSS_MODE_MARKER, '')
                      .trim()
                    const finalOutput = outputContent || buildTaskDeliverable(detail?.title || job?.title || '任务产出', requirementText, detail?.assignee || job?.assignee || '-')
                    return (
                      <>
                        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
                          <div>
                            <div className="text-sm text-cyan-200">任务结果面板</div>
                            <div className="text-xs text-neutral-400 mt-1">#{quickResultModalTaskId} {detail?.title || job?.title || '-'}</div>
                          </div>
                          <button
                            className={pixelButtonClass}
                            onClick={() => setQuickResultModalTaskId(null)}
                          >
                            关闭
                          </button>
                        </div>
                        <div className="space-y-3 p-4 text-xs max-h-[76vh] overflow-y-auto">
                          <div className="grid gap-2 md:grid-cols-3">
                            <div className="rounded border border-neutral-800 bg-black/40 p-2">负责人：<span className="text-cyan-200">{detail?.assignee || job?.assignee || '-'}</span></div>
                            <div className="rounded border border-neutral-800 bg-black/40 p-2">状态：<span className="text-cyan-200">{job?.statusLabel || '-'}</span></div>
                            <div className="rounded border border-neutral-800 bg-black/40 p-2">验收：<span className="text-amber-200">{job?.reviewStatus === 'accepted' ? '已通过' : job?.reviewStatus === 'rejected' ? '已驳回' : '待验收'}</span></div>
                          </div>
                          <div className="rounded border border-neutral-800 bg-black/40 p-3">
                            <div className="text-neutral-400 mb-1">执行要求</div>
                            <div className="text-neutral-200 whitespace-pre-wrap break-words">
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={markdownRenderComponents}
                              >
                                {requirementText || '暂无要求'}
                              </ReactMarkdown>
                            </div>
                          </div>
                          <div className="rounded border border-cyan-900/50 bg-cyan-950/20 p-3">
                            <div className="text-cyan-300 mb-1">实际任务结果</div>
                            <div className="text-cyan-100 whitespace-pre-wrap break-words">
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={markdownRenderComponents}
                              >
                                {executionSummary}
                              </ReactMarkdown>
                            </div>
                          </div>
                          <div className="rounded border border-cyan-900/50 bg-black/50 p-3">
                            <div className="text-cyan-300 mb-1">实际产出内容</div>
                            <div className="text-cyan-100 whitespace-pre-wrap break-words">
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={markdownRenderComponents}
                              >
                                {finalOutput}
                              </ReactMarkdown>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <button
                                className={pixelButtonClass}
                                onClick={() => { void saveDeliverableFile(`任务${quickResultModalTaskId}-产出.doc`, finalOutput) }}
                              >
                                下载Word
                              </button>
                              <button
                                className={pixelButtonClass}
                                onClick={() => { void saveDeliverableFile(`任务${quickResultModalTaskId}-产出.ppt`, finalOutput) }}
                              >
                                下载PPT
                              </button>
                              <button
                                className={pixelButtonClass}
                                onClick={() => { void saveDeliverableFile(`任务${quickResultModalTaskId}-产出.txt`, finalOutput) }}
                              >
                                下载TXT
                              </button>
                            </div>
                          </div>
                          <div className="rounded border border-rose-900/50 bg-rose-950/15 p-3">
                            <div className="text-rose-300 mb-1">不满意？填写返工要求</div>
                            <textarea
                              value={quickReworkFeedback}
                              onChange={(e) => setQuickReworkFeedback(e.target.value)}
                              rows={3}
                              className={`${pixelInputClass} w-full`}
                              placeholder="例如：PPT第4页案例过少，请补充2个一人公司真实案例；每页讲解词控制在80字以内。"
                            />
                            <div className="mt-2 flex items-center justify-end">
                              <button
                                className="cks-btn cks-btn-danger"
                                disabled={quickReworkSubmitting}
                                onClick={() => {
                                  void submitQuickJobRework(quickResultModalTaskId)
                                }}
                              >
                                {quickReworkSubmitting ? '提交中...' : '提交返工并重新开始任务'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </>
                    )
                  })()}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto text-white p-4 md:p-6" style={pixelBgStyle}>
      <div className="max-w-7xl mx-auto space-y-4">
        <div className={`p-3 ${pixelPanelClass}`}>
          <PageHeader
            title="一人公司总览"
            subtitle="主Agent 统筹 + SubAgent 并行执行，任务可直达工作台"
            icon={<Users className="h-5 w-5 text-neutral-300" />}
            className="bg-transparent border-neutral-800/70"
            actions={(
              <>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={runSupervisorDispatch}
                disabled={supervisorDispatching}
                className={`${pixelButtonClass} disabled:opacity-40`}
              >
                {supervisorDispatching ? '调度中...' : '主管一键调度'}
              </button>
              <button
                onClick={() => setShowSupervisorControls((prev) => !prev)}
                className={pixelButtonClass}
              >
                {showSupervisorControls ? '收起更多操作' : '更多操作'}
              </button>
              <button
                onClick={() => setMode((prev) => (prev === 'table' ? 'game' : 'table'))}
                className={pixelButtonClass}
              >
                {mode === 'table' ? <Gamepad2 className="h-3.5 w-3.5 inline mr-1" /> : <List className="h-3.5 w-3.5 inline mr-1" />}
                {mode === 'table' ? '切换游戏风' : '切换表格'}
              </button>
              <button
                onClick={load}
                disabled={loading}
                className={`${pixelButtonClass} disabled:opacity-40`}
              >
                <RefreshCw className={`h-3.5 w-3.5 inline mr-1 ${loading ? 'animate-spin' : ''}`} />
                刷新
              </button>
              <button
                onClick={() => setSimpleMode(true)}
                className={pixelButtonClass}
              >
                老板模式
              </button>
            </div>
              </>
            )}
          />
          <div className="mt-3 cks-surface-subtle p-3 space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded border border-cyan-500/30 bg-cyan-500/10 px-3 py-2">
                <div className="text-[11px] text-cyan-100">主Agent（总指挥）</div>
                <div className="text-sm font-semibold text-cyan-200 mt-1">{mainAgentName}</div>
                <div className="text-[11px] text-neutral-300 mt-1">拆解任务、分派 SubAgent、验收与回写</div>
              </div>
              <div className="rounded border border-neutral-700 bg-black/30 px-3 py-2">
                <div className="text-[11px] text-neutral-400">SubAgent 数量</div>
                <div className="text-sm font-semibold text-white mt-1">{employeeRows.length}</div>
                <div className="text-[11px] text-neutral-500 mt-1">支持财务/人力/研发/行政等职能组合</div>
              </div>
              <div className="rounded border border-neutral-700 bg-black/30 px-3 py-2">
                <div className="text-[11px] text-neutral-400">并行派发</div>
                <div className="text-sm font-semibold text-white mt-1">已选 {selectedParallelAgents.length} 个</div>
                <div className="text-[11px] text-neutral-500 mt-1">多 Agent 可同时执行同类任务</div>
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto rounded border border-neutral-800 bg-black/30">
              {employeeRows.length === 0 ? (
                <div className="p-3 text-xs text-neutral-400">暂无 SubAgent，请先创建员工并配置技能。</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-neutral-900/70 text-neutral-400">
                    <tr>
                      <th className="p-2 text-left">并行</th>
                      <th className="p-2 text-left">SubAgent</th>
                      <th className="p-2 text-left">职能</th>
                      <th className="p-2 text-left">主技能</th>
                      <th className="p-2 text-left">任务状态</th>
                      <th className="p-2 text-left">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employeeRows.map((employee) => (
                      <tr key={`hierarchy-${employee.name}`} className="border-t border-neutral-800">
                        <td className="p-2">
                          <input
                            type="checkbox"
                            checked={selectedParallelAgents.includes(employee.name)}
                            onChange={(e) => toggleParallelAgent(employee.name, e.target.checked)}
                          />
                        </td>
                        <td className="p-2">
                          <div className="text-neutral-200">{employee.name}</div>
                          <div className="text-[11px] text-neutral-500">{employee.skillStack.slice(0, 3).join(' / ') || '-'}</div>
                        </td>
                        <td className="p-2 text-neutral-300">{employee.role || '-'}</td>
                        <td className="p-2 text-cyan-200">{employee.primarySkill || '-'}</td>
                        <td className="p-2">
                          <div className="flex flex-wrap gap-1">
                            <StatusBadge
                              label={`待验收 ${employee.pendingReview || 0}`}
                              className="border-amber-500/30 bg-amber-500/10 text-amber-200"
                            />
                            <StatusBadge
                              label={`进行中 ${employee.inProgress || 0}`}
                              className="border-blue-500/30 bg-blue-500/10 text-blue-200"
                            />
                          </div>
                        </td>
                        <td className="p-2">
                          <div className="flex items-center gap-1">
                            <button
                              className="cks-btn cks-btn-primary"
                              onClick={() => {
                                setDispatchAssignee(employee.name)
                                setSelectedParallelAgents([employee.name])
                              }}
                            >
                              指派给Ta
                            </button>
                            <button className="cks-btn cks-btn-secondary" onClick={() => beginEditEmployee(employee)}>
                              配置技能
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="cks-btn cks-btn-primary disabled:opacity-50"
                onClick={submitParallelDispatch}
                disabled={parallelDispatching || selectedParallelAgents.length === 0}
              >
                {parallelDispatching ? '并行派发中...' : '对已选 SubAgent 并行派单'}
              </button>
              <button
                className="cks-btn cks-btn-secondary"
                onClick={() => setSelectedParallelAgents(employeeRows.map((item) => item.name))}
                disabled={employeeRows.length === 0}
              >
                全选 SubAgent
              </button>
              <button className="cks-btn cks-btn-secondary" onClick={() => setSelectedParallelAgents([])}>
                清空选择
              </button>
              <span className="text-[11px] text-neutral-500">并行派发会复用下方“任务派单中心”的项目、标题、验收要求。</span>
            </div>
          </div>
          {showSupervisorControls && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-800/70 pt-3">
              <input
                value={supervisorObjective}
                onChange={(e) => setSupervisorObjective(e.target.value)}
                placeholder="主管目标（可选）"
                className={`${pixelInputClass} min-w-[220px] flex-1`}
              />
              <label className="text-xs text-neutral-300 flex items-center gap-1 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={supervisorAutoLaunch}
                  onChange={(e) => setSupervisorAutoLaunch(e.target.checked)}
                />
                调度后拉起工作台
              </label>
              <button
                onClick={runSupervisorReview}
                disabled={supervisorReviewing}
                className={`${pixelButtonClass} disabled:opacity-40`}
              >
                {supervisorReviewing ? '验收中...' : '主管验收'}
              </button>
            </div>
          )}
        </div>

        {supervisorReviewReport && (
          <div className={`p-3 ${pixelPanelClass} border-cyan-500/30 bg-cyan-500/5`}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm text-cyan-100 font-semibold">主管验收面板</div>
                <div className="text-xs text-neutral-400">
                  最近更新：{new Date(supervisorReviewReport.updatedAt).toLocaleString()}
                </div>
              </div>
              <div className="text-right flex items-center gap-2">
                <label className="text-xs text-neutral-300 flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={supervisorRepairAutoLaunch}
                    onChange={(e) => setSupervisorRepairAutoLaunch(e.target.checked)}
                  />
                  生成后拉起
                </label>
                <div>
                  <div className="text-[11px] text-neutral-400">整体评分</div>
                  <div className="text-xl font-semibold text-cyan-200">{supervisorReviewReport.overallScore}</div>
                </div>
                <button
                  onClick={createSupervisorRepairTasks}
                  disabled={supervisorRepairSubmitting}
                  className={`${pixelButtonClass} disabled:opacity-40`}
                >
                  {supervisorRepairSubmitting ? '生成中...' : '一键生成整改任务'}
                </button>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <div className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-xs text-rose-200">
                P0：{supervisorReviewReport.items.filter((item) => getRemediationPriority(item) === 'P0').length}
              </div>
              <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-200">
                P1：{supervisorReviewReport.items.filter((item) => getRemediationPriority(item) === 'P1').length}
              </div>
              <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">
                P2：{supervisorReviewReport.items.filter((item) => getRemediationPriority(item) === 'P2').length}
              </div>
            </div>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2">
              {supervisorReviewReport.items.slice(0, 3).map((item) => (
                <div key={item.assignee} className="rounded border border-neutral-700 px-2.5 py-2 bg-black/30">
                  <div className="text-xs text-neutral-300 truncate">{item.assignee}</div>
                  <div className="text-[11px] text-neutral-500 mt-1">
                    分数 {item.score} · 驳回 {item.rejected} · 待验收 {item.pending_review}
                  </div>
                  <div className="text-[11px] text-cyan-300 mt-1">
                    优先级 {getRemediationPriority(item)}
                  </div>
                  <button
                    onClick={() => {
                      setDispatchAssignee(item.assignee)
                      const owner = owners.find((row) => row.assignee === item.assignee)
                      if (owner) void startOwnerExecution(owner, owner.next_task_id || undefined)
                    }}
                    className={`${pixelButtonClass} mt-2 w-full`}
                  >
                    发起整改执行
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {(linkedChannelTaskLoading || linkedChannelTask) ? (
          <div className={`p-3 ${pixelPanelClass} border-fuchsia-500/40 bg-fuchsia-500/10`}>
            {linkedChannelTaskLoading ? (
              <p className="text-xs text-fuchsia-200">正在加载联调任务上下文...</p>
            ) : linkedChannelTask ? (
              <div className="space-y-2">
                {(() => {
                  const result = linkedChannelTask.result && typeof linkedChannelTask.result === 'object'
                    ? (linkedChannelTask.result as Record<string, unknown>)
                    : {}
                  const executionNodeId = String(
                    result.execution_node_id ||
                    (linkedChannelTask.metadata && typeof linkedChannelTask.metadata === 'object'
                      ? (linkedChannelTask.metadata as Record<string, unknown>).execution_node_id
                      : '') ||
                    ''
                  ).trim()
                  if (!executionNodeId) return null
                  return (
                    <div className="text-xs border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-indigo-200">
                      执行节点：{executionNodeId}
                    </div>
                  )
                })()}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-1">
                    <p className="text-sm text-fuchsia-100">
                      联调任务 #{linkedChannelTask.id}
                      <StatusBadge
                        label={getTaskStatusMeta(linkedChannelTask.status || '').label}
                        className={`ml-2 ${getTaskStatusMeta(linkedChannelTask.status || '').badgeClassName}`}
                      />
                    </p>
                    <p className="text-xs text-fuchsia-200/90 break-all">{linkedChannelTask.message}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => navigate(`/workbench?channel_task_id=${linkedChannelTask.id}&from=board_trace`)}
                      className={pixelButtonClass}
                    >
                      查看执行轨迹
                    </button>
                    <button
                      onClick={() => navigate('/board', { replace: true })}
                      className={pixelButtonClass}
                    >
                      关闭上下文
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-fuchsia-200/90">转派数字员工：</span>
                  <select
                    value={channelTaskAssignee}
                    onChange={(e) => setChannelTaskAssignee(e.target.value)}
                    className={`${pixelInputClass} min-w-44`}
                  >
                    <option value="">请选择员工</option>
                    {assigneeOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={dispatchLinkedChannelTaskToEmployee}
                    disabled={channelTaskDispatching}
                    className={pixelButtonClass}
                  >
                    {channelTaskDispatching ? '转派中...' : '转为目标任务并执行'}
                  </button>
                </div>
                {channelDispatchResult && channelDispatchResult.sourceChannelTaskId === linkedChannelTask.id ? (
                  <div className="text-[11px] text-emerald-300 border border-emerald-500/30 bg-emerald-500/10 px-2 py-1">
                    已转派给 {channelDispatchResult.assignee}，目标任务 #{channelDispatchResult.goalTaskId}，时间 {new Date(channelDispatchResult.at).toLocaleTimeString()}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-fuchsia-200">未找到对应联调任务，可能已被清理。</p>
            )}
          </div>
        ) : null}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {cards.map((card) => (
            <StatTile
              key={card.title}
              title={card.title}
              value={<span className="text-2xl">{card.value}</span>}
              className={`rounded-none border-2 shadow-[3px_3px_0px_0px_rgba(0,0,0,0.4)] ${card.color}`}
            />
          ))}
        </div>

        <div className={`p-3 space-y-2 ${pixelPanelClass}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-neutral-400">公司空间</span>
            <select
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value || 'default-org')}
              className={`${pixelInputClass} min-w-36`}
            >
              {organizationCatalog.map((org) => (
                <option key={org} value={org}>
                  {org}
                </option>
              ))}
            </select>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className={`${pixelInputClass} min-w-28`}
            >
              <option value="all">全部分组</option>
              {departmentOptions.map((dep) => (
                <option key={dep} value={dep}>
                  {dep}
                </option>
              ))}
            </select>
            <input
              type="datetime-local"
              value={fromTime}
              onChange={(e) => setFromTime(e.target.value)}
              className={pixelInputClass}
            />
            <input
              type="datetime-local"
              value={toTime}
              onChange={(e) => setToTime(e.target.value)}
              className={pixelInputClass}
            />
            <button onClick={load} className={pixelButtonClass}>
              应用筛选
            </button>
            <span className="text-xs text-neutral-500">总任务：{summary.total_tasks} · 在线数字员工：{visibleOwners.length}</span>
            </div>

            <details className="relative shrink-0">
              <summary className={`${pixelButtonClass} cursor-pointer list-none`}>空间设置</summary>
              <div className="absolute right-0 top-full mt-2 w-64 p-2 space-y-1.5 border-2 border-neutral-700 bg-neutral-950 z-20">
                <input
                  value={newOrganizationId}
                  onChange={(e) => setNewOrganizationId(e.target.value)}
                  placeholder="新空间 ID"
                  className={`${pixelInputClass} w-full`}
                />
                <button type="button" onClick={addOrganizationToCatalog} className={`${pixelButtonClass} w-full`}>
                  新增空间
                </button>
                <button type="button" onClick={renameCurrentOrganization} className={`${pixelButtonClass} w-full`}>
                  重命名当前空间
                </button>
                <button type="button" onClick={removeCurrentOrganizationFromCatalog} className={`${pixelButtonClass} w-full`}>
                  移除当前空间
                </button>
                <button type="button" onClick={exportOrganizationConfig} className={`${pixelButtonClass} w-full`}>
                  导出空间配置
                </button>
                <button type="button" onClick={() => orgConfigInputRef.current?.click()} className={`${pixelButtonClass} w-full`}>
                  导入空间配置
                </button>
                <input
                  ref={orgConfigInputRef}
                  type="file"
                  accept="application/json"
                  onChange={onImportOrganizationConfig}
                  className="hidden"
                />
              </div>
            </details>
          </div>
        </div>

        <div className={`p-3 ${pixelPanelClass}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs text-neutral-400">AI员工名册（我的一人公司）</div>
              <div className="text-[11px] text-neutral-500 mt-1">核心模型：一个Agent + 不同Skill = 不同职能员工。你是老板，员工先自动执行，失败再回流人工。</div>
            </div>
            <span className="text-xs text-neutral-500">员工总数：{employeeRows.length}</span>
          </div>
          <div className="mt-2 rounded border border-neutral-800 p-2 space-y-2">
            <div className="text-[11px] text-neutral-400">技能预设（可自由组合）</div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="预设名称"
                className={pixelInputClass}
              />
              <input
                value={presetSkills}
                onChange={(e) => setPresetSkills(e.target.value)}
                placeholder="技能组合，逗号分隔"
                className={pixelInputClass}
                list="board-employee-skill-options"
              />
              <button type="button" className={pixelButtonClass} onClick={createSkillPreset}>
                保存预设
              </button>
              <div className="flex items-center gap-2">
                <select
                  value={selectedPresetId}
                  onChange={(e) => setSelectedPresetId(e.target.value)}
                  className={`${pixelInputClass} flex-1`}
                >
                  <option value="">选择预设</option>
                  {skillPresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={pixelButtonClass}
                  onClick={applyPresetToRecruitForm}
                  disabled={!selectedPreset}
                >
                  套用
                </button>
                <button
                  type="button"
                  className={pixelButtonClass}
                  onClick={() => selectedPreset && deleteSkillPreset(selectedPreset.id)}
                  disabled={!selectedPreset}
                >
                  删除
                </button>
              </div>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-1 md:grid-cols-5 gap-2">
            <select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value as EmployeeTemplateKey)}
              className={pixelInputClass}
            >
              {employeeTemplates.map((template) => (
                <option key={template.key} value={template.key}>
                  {template.role}
                </option>
              ))}
            </select>
            <input
              value={customEmployeeName}
              onChange={(e) => setCustomEmployeeName(e.target.value)}
              placeholder="自定义员工名（可选）"
              className={pixelInputClass}
            />
            <input
              value={customEmployeeRole}
              onChange={(e) => setCustomEmployeeRole(e.target.value)}
              placeholder="自定义岗位（可选）"
              className={pixelInputClass}
            />
            <input
              value={customEmployeeSkills}
              onChange={(e) => setCustomEmployeeSkills(e.target.value)}
              placeholder="技能组合(逗号分隔)"
              className={pixelInputClass}
              list="board-employee-skill-options"
            />
            <button type="button" className={pixelButtonClass} onClick={recruitEmployee}>
              招募员工
            </button>
          </div>
          <div className="mt-2">
            <input
              value={customEmployeeSpecialty}
              onChange={(e) => setCustomEmployeeSpecialty(e.target.value)}
              placeholder="岗位说明（可选）"
              className={`${pixelInputClass} w-full`}
            />
          </div>
          <datalist id="board-employee-skill-options">
            {availableSkillNames.map((skill) => (
              <option key={`employee-skill-${skill}`} value={skill} />
            ))}
          </datalist>
          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
            {employeeRows.length === 0 ? (
              <div className="text-xs text-neutral-500 border border-neutral-800 p-2">
                当前还没有员工，先从模板招募一个数字员工。
              </div>
            ) : (
              employeeRows.map((employee) => (
                <div key={employee.name} className="border border-neutral-800 p-2 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm text-neutral-100">{employee.name}</div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${employee.status === 'active' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-neutral-700 text-neutral-300'}`}>
                      {employee.status === 'active' ? '执行中' : '暂停'}
                    </span>
                  </div>
                  {editingEmployeeName === employee.name ? (
                    <div className="space-y-1.5">
                      <input
                        value={editingEmployeeDraft.role}
                        onChange={(e) => setEditingEmployeeDraft((prev) => ({ ...prev, role: e.target.value }))}
                        className={pixelInputClass}
                        placeholder="岗位"
                      />
                      <input
                        value={editingEmployeeDraft.specialty}
                        onChange={(e) => setEditingEmployeeDraft((prev) => ({ ...prev, specialty: e.target.value }))}
                        className={pixelInputClass}
                        placeholder="岗位说明"
                      />
                      <input
                        value={editingEmployeeDraft.primarySkill}
                        onChange={(e) => setEditingEmployeeDraft((prev) => ({ ...prev, primarySkill: e.target.value }))}
                        className={pixelInputClass}
                        placeholder="主技能"
                        list="board-employee-skill-options"
                      />
                      <input
                        value={editingEmployeeDraft.skillStack}
                        onChange={(e) => setEditingEmployeeDraft((prev) => ({ ...prev, skillStack: e.target.value }))}
                        className={pixelInputClass}
                        placeholder="技能组合(逗号分隔)"
                        list="board-employee-skill-options"
                      />
                    </div>
                  ) : (
                    <>
                      <div className="text-[11px] text-neutral-400">{employee.role}</div>
                      <div className="text-[11px] text-neutral-500">{employee.specialty}</div>
                      <div className="text-[11px] text-cyan-300">Agent + Skill：{employee.primarySkill}</div>
                      <div className="text-[11px] text-neutral-500">技能栈：{(employee.skillStack || []).join('、')}</div>
                    </>
                  )}
                  <div className="text-[11px] text-neutral-500">
                    任务 {employee.totalTasks} · 进行中 {employee.inProgress} · 待验收 {employee.pendingReview} · 完成率 {Math.round(employee.completionRate)}%
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button type="button" className={pixelButtonClass} onClick={() => setDispatchAssignee(employee.name)}>
                      指派给TA
                    </button>
                    <button
                      type="button"
                      className={pixelButtonClass}
                      onClick={() => quickAssignTaskForEmployee(employee.name)}
                      disabled={quickAssigningEmployee === employee.name}
                    >
                      {quickAssigningEmployee === employee.name ? '派发中...' : '一键派发并执行'}
                    </button>
                    {employee.owner ? (
                      <button type="button" className={pixelButtonClass} onClick={() => startOwnerExecution(employee.owner!, employee.owner?.next_task_id || undefined)}>
                        拉起执行
                      </button>
                    ) : null}
                    <button type="button" className={pixelButtonClass} onClick={() => toggleEmployeeStatus(employee.name)}>
                      {employee.status === 'active' ? '暂停' : '恢复'}
                    </button>
                    <button
                      type="button"
                      className={pixelButtonClass}
                      onClick={() => applyPresetToEmployee(employee.name)}
                      disabled={!selectedPreset}
                    >
                      套用预设
                    </button>
                    {editingEmployeeName === employee.name ? (
                      <>
                        <button type="button" className={pixelButtonClass} onClick={() => saveEmployeeEdit(employee.name)}>
                          保存
                        </button>
                        <button type="button" className={pixelButtonClass} onClick={cancelEditEmployee}>
                          取消
                        </button>
                      </>
                    ) : (
                      <button type="button" className={pixelButtonClass} onClick={() => beginEditEmployee(employee)}>
                        编辑
                      </button>
                    )}
                    <button type="button" className={pixelButtonClass} onClick={() => fireEmployee(employee.name)}>
                      解雇
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className={`p-3 ${pixelPanelClass}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-neutral-400">老板洞察（我的一人公司）</div>
            <div className="flex flex-wrap items-center gap-2">
              {topRiskOwner && (
                <button
                  type="button"
                  className={pixelButtonClass}
                  onClick={() => startOwnerExecution(topRiskOwner.owner, topRiskOwner.owner.next_task_id || undefined)}
                >
                  拉起高风险员工：{topRiskOwner.owner.assignee}
                </button>
              )}
              <button type="button" className={pixelButtonClass} onClick={openManagerBriefingInWorkbench}>
                生成经营简报
              </button>
              <button type="button" className={pixelButtonClass} onClick={exportManagerWeeklyReport}>
                导出经营周报
              </button>
              <button
                type="button"
                className={pixelButtonClass}
                onClick={() => navigate(`/goals?review_status=pending&organization_id=${encodeURIComponent(organizationId)}`)}
              >
                打开待验收任务
              </button>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="border border-neutral-800 p-2">
              <div className="text-[11px] text-neutral-500">自动完成率</div>
              <div className="text-lg text-emerald-300 font-semibold">{managerInsights.automationRate}%</div>
            </div>
            <div className="border border-neutral-800 p-2">
              <div className="text-[11px] text-neutral-500">团队平均完成率</div>
              <div className="text-lg text-cyan-300 font-semibold">{managerInsights.avgOwnerCompletion}%</div>
            </div>
            <div className="border border-neutral-800 p-2">
              <div className="text-[11px] text-neutral-500">风险任务（待验收+驳回）</div>
              <div className="text-lg text-amber-300 font-semibold">{managerInsights.riskTaskCount}</div>
            </div>
          </div>
        </div>

        {topInterventions.length > 0 && (
          <div className={`p-3 ${pixelPanelClass}`}>
            <div className="text-xs text-neutral-400 mb-2">本周最值得你干预的 3 件事</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {topInterventions.map((item) => (
                <div key={item.key} className="border border-neutral-800 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm text-neutral-100">{item.title}</div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${item.level === 'high' ? 'bg-red-500/20 text-red-300' : 'bg-amber-500/20 text-amber-300'}`}>
                      {item.level === 'high' ? '高优先级' : '中优先级'}
                    </span>
                  </div>
                  <div className="text-[11px] text-neutral-500 mt-1 min-h-8">{item.reason}</div>
                  <div className="mt-2">
                    {item.key === 'risk_owner' && topRiskOwner ? (
                      <button
                        type="button"
                        className={pixelButtonClass}
                        onClick={() => startOwnerExecution(topRiskOwner.owner, topRiskOwner.owner.next_task_id || undefined)}
                      >
                        立即拉起
                      </button>
                    ) : null}
                    {item.key === 'pending_review' ? (
                      <button
                        type="button"
                        className={pixelButtonClass}
                        onClick={() => navigate(`/goals?review_status=pending&organization_id=${encodeURIComponent(organizationId)}`)}
                      >
                        去验收面板
                      </button>
                    ) : null}
                    {item.key === 'rejected_handoff' ? (
                      <button
                        type="button"
                        className={pixelButtonClass}
                        onClick={() => {
                          const first = handoffTasks[0]
                          if (first) {
                            setHandoffOwner(first.assignee || handoffOwner || 'manager')
                          }
                        }}
                      >
                        准备接手返工
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className={`p-3 ${pixelPanelClass}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-neutral-400">审批审计（老板视角）</div>
            <div className="flex items-center gap-2">
              <button type="button" className={pixelButtonClass} onClick={openApprovalCenterInWorkbench}>
                去工作台审批中心
              </button>
              <button type="button" className={pixelButtonClass} onClick={exportApprovalAuditCsv}>
                导出审批CSV
              </button>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="border border-neutral-800 p-2 text-xs text-neutral-400">待审批 <span className="text-amber-300 ml-1">{approvalSummary.pending}</span></div>
            <div className="border border-neutral-800 p-2 text-xs text-neutral-400">已批准 <span className="text-emerald-300 ml-1">{approvalSummary.approved}</span></div>
            <div className="border border-neutral-800 p-2 text-xs text-neutral-400">已拒绝 <span className="text-rose-300 ml-1">{approvalSummary.denied}</span></div>
            <div className="border border-neutral-800 p-2 text-xs text-neutral-400">已过期 <span className="text-neutral-300 ml-1">{approvalSummary.expired}</span></div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              value={approvalStatusFilter}
              onChange={(e) => setApprovalStatusFilter((e.target.value as ApprovalViewStatus) || 'all')}
              className={`${pixelInputClass} min-w-28`}
            >
              <option value="all">全部状态</option>
              <option value="pending">待审批</option>
              <option value="approved">已批准</option>
              <option value="denied">已拒绝</option>
              <option value="expired">已过期</option>
            </select>
            <select
              value={approvalToolFilter}
              onChange={(e) => setApprovalToolFilter(e.target.value || 'all')}
              className={`${pixelInputClass} min-w-36`}
            >
              <option value="all">全部工具</option>
              {approvalToolOptions.map((tool) => (
                <option key={tool} value={tool}>{tool}</option>
              ))}
            </select>
            <input
              value={approvalDeciderFilter}
              onChange={(e) => setApprovalDeciderFilter(e.target.value)}
              placeholder="按处理人筛选"
              className={`${pixelInputClass} min-w-32`}
            />
            <button
              type="button"
              onClick={() => setApprovalHighRiskOnly((prev) => !prev)}
              className={`${pixelButtonClass} ${approvalHighRiskOnly ? 'border-rose-400 text-rose-200' : ''}`}
            >
              {approvalHighRiskOnly ? '仅高风险：开' : '仅高风险：关'}
            </button>
            <button
              type="button"
              onClick={() => setApprovalRecent24hOnly((prev) => !prev)}
              className={`${pixelButtonClass} ${approvalRecent24hOnly ? 'border-cyan-400 text-cyan-200' : ''}`}
            >
              {approvalRecent24hOnly ? '近24小时：开' : '近24小时：关'}
            </button>
            <button type="button" className={pixelButtonClass} onClick={load}>
              刷新审批数据
            </button>
          </div>
          <div className="mt-2 space-y-2 max-h-56 overflow-y-auto pr-1">
            {visibleApprovals.length === 0 ? (
              <div className="text-xs text-neutral-500">暂无匹配审批记录。</div>
            ) : (
              visibleApprovals.map((item) => (
                <div key={item.id} className="border border-neutral-800 p-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-neutral-200">{item.tool_name}</span>
                    <StatusBadge
                      label={getApprovalStatusMeta(item.status).label}
                      className={getApprovalStatusMeta(item.status).badgeClassName}
                    />
                  </div>
                  <div className="mt-1 text-[11px] text-neutral-500">
                    来源 {item.source || 'workbench'} · 风险 {item.risk_level || '-'} · 处理人 {item.decided_by || 'system'}
                  </div>
                  <div className="mt-1 text-[11px] text-neutral-500">
                    时间 {toDatetimeLocal(item.updated_at || item.created_at).replace('T', ' ') || '-'}
                  </div>
                  {summarizeApprovalPayload(item).length > 0 ? (
                    <div className="mt-2 text-[11px] text-neutral-400 space-y-1">
                      {summarizeApprovalPayload(item).map((line) => (
                        <div key={`${item.id}-${line}`} className="truncate">{line}</div>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className={pixelButtonClass}
                      onClick={() => replayApprovalContext(item)}
                    >
                      回放关联会话
                    </button>
                    {parseGoalTaskId(item.payload?.goal_task_id) ? (
                      <button
                        type="button"
                        className={pixelButtonClass}
                        onClick={() => {
                          const taskId = parseGoalTaskId(item.payload?.goal_task_id)
                          if (!taskId) return
                          navigate(`/goals?task_id=${taskId}&organization_id=${encodeURIComponent(organizationId)}`)
                        }}
                      >
                        打开关联任务
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={pixelButtonClass}
                      onClick={() => {
                        void copyApprovalSnapshot(item)
                      }}
                    >
                      复制快照
                    </button>
                    <button
                      type="button"
                      className={pixelButtonClass}
                      onClick={() => openSnapshotInWorkbench(item)}
                    >
                      快照复盘
                    </button>
                  </div>
                  {item.decision_note ? (
                    <div className="mt-1 text-[11px] text-neutral-500 break-all">备注：{item.decision_note}</div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
        {recentOrganizationIds.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap text-xs text-neutral-400">
            <span>最近空间：</span>
            {recentOrganizationIds.map((org) => (
              <button
                key={org}
                type="button"
                onClick={() => setOrganizationId(org)}
                className={`${pixelButtonClass} px-2 py-1 ${org === organizationId ? 'border-cyan-400 text-cyan-200' : ''}`}
              >
                {org}
              </button>
            ))}
          </div>
        )}

        <div className={`p-3 ${pixelPanelClass}`}>
          <div className="text-xs text-neutral-400 mb-2">员工分组热力（按待验收 + 进行中排序）</div>
          {departmentOverview.length === 0 ? (
            <div className="text-xs text-neutral-500">当前暂无分组数据</div>
          ) : (
            <div className="space-y-2">
              {departmentOverview.map((dep) => {
                const total = Math.max(1, dep.pending + dep.inProgress + dep.accepted + dep.rejected)
                const hot = Math.round(((dep.pending + dep.inProgress) / total) * 100)
                return (
                  <div key={dep.department} className="border border-neutral-800 p-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-neutral-200">{dep.department}</span>
                      <span className="text-neutral-500">成员 {dep.owners} · 热度 {hot}%</span>
                    </div>
                    <div className="mt-1 h-2 w-full bg-neutral-900 border border-neutral-800">
                      <div className="h-full bg-cyan-500" style={{ width: `${hot}%` }} />
                    </div>
                    <div className="mt-1 text-[11px] text-neutral-500">
                      待验收 {dep.pending} · 进行中 {dep.inProgress} · 已验收 {dep.accepted} · 驳回 {dep.rejected}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className={`p-3 ${pixelPanelClass}`}>
          <div className="text-xs text-neutral-400 mb-2">员工分组趋势（近7天）</div>
          {departmentTrend7d.length === 0 ? (
            <div className="text-xs text-neutral-500">近7天暂无趋势数据</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {departmentTrend7d.map((dep) => (
                <div key={`trend-${dep.department}`} className="border border-neutral-800 p-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-neutral-200">{dep.department}</span>
                    <span className="text-neutral-500">待验收 {dep.pendingReview} · 驳回 {dep.rejected}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-neutral-500">
                    进行中 {dep.inProgress} · 已验收 {dep.accepted}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={`p-4 space-y-3 ${pixelPanelClass}`}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-neutral-100">AI员工派单中心</h2>
              <p className="text-xs text-neutral-500 mt-1">派单后可自动设为下一任务，并一键跳转 Workbench 执行。</p>
            </div>
            <span className="text-[11px] text-neutral-500">
              {dispatchLoading ? '加载项目中...' : `可派单项目 ${dispatchProjects.length} 个`}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <select
              value={dispatchProjectId}
              onChange={(e) => setDispatchProjectId(e.target.value)}
              className={pixelInputClass}
            >
              {dispatchProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.label}
                </option>
              ))}
            </select>
            <input
              value={dispatchTitle}
              onChange={(e) => setDispatchTitle(e.target.value)}
              placeholder="任务标题"
              className={pixelInputClass}
            />
            <div className="flex gap-2">
              <input
                list="board-assignee-options"
                value={dispatchAssignee}
                onChange={(e) => setDispatchAssignee(e.target.value)}
                placeholder="AI员工（可输入新名字）"
                className={`${pixelInputClass} flex-1`}
              />
              <datalist id="board-assignee-options">
                {assigneeOptions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
            <input
              type="datetime-local"
              value={dispatchDueAt}
              onChange={(e) => setDispatchDueAt(e.target.value)}
              className={pixelInputClass}
            />
            <input
              value={dispatchReviewer}
              onChange={(e) => setDispatchReviewer(e.target.value)}
              placeholder="验收人（默认 manager）"
              className={pixelInputClass}
            />
            <input
              value={dispatchRequirement}
              onChange={(e) => setDispatchRequirement(e.target.value)}
              placeholder="执行要求（可选）"
              className={pixelInputClass}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-300">
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={dispatchAutoSetNext}
                onChange={(e) => setDispatchAutoSetNext(e.target.checked)}
              />
              自动设为下一任务
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={dispatchAutoLaunch}
                onChange={(e) => setDispatchAutoLaunch(e.target.checked)}
              />
              派单后立即进入 Workbench
            </label>
            <button
              onClick={submitDispatchTask}
              disabled={dispatchSubmitting || dispatchLoading || dispatchProjects.length === 0}
              className="ml-auto cks-btn cks-btn-primary disabled:opacity-40"
            >
              {dispatchSubmitting ? '派单中...' : '一键派单'}
            </button>
          </div>
        </div>

        <div className={`p-4 ${pixelPanelClass}`}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-neutral-100">转人工处理池</h2>
              <p className="text-xs text-neutral-500 mt-1">展示已驳回任务，支持一键回到 Workbench 返工。</p>
            </div>
            <span className="text-xs text-rose-300">
              {handoffLoading ? '加载中...' : `待处理 ${handoffTasks.length}`}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="rounded border border-rose-500/20 bg-rose-500/5 px-3 py-2">
              <div className="text-[11px] text-neutral-400">近 7 天驳回</div>
              <div className="text-lg text-rose-200 font-semibold">{rejected7d}</div>
            </div>
            <div className="rounded border border-amber-500/20 bg-amber-500/5 px-3 py-2">
              <div className="text-[11px] text-neutral-400">近 7 天待验收</div>
              <div className="text-lg text-amber-200 font-semibold">{pendingReview7d}</div>
            </div>
            <div className="rounded border border-cyan-500/20 bg-cyan-500/5 px-3 py-2">
              <div className="text-[11px] text-neutral-400">近 7 天已接手</div>
              <div className="text-lg text-cyan-200 font-semibold">{claimed7d}</div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-neutral-500">接手人</span>
            <input
              value={handoffOwner}
              onChange={(e) => setHandoffOwner(e.target.value)}
              className="cks-input px-2.5 py-1.5 text-xs w-56"
              placeholder="例如 manager"
            />
            <span className="text-xs text-neutral-500 ml-2">员工筛选</span>
            <select
              value={handoffAssigneeFilter}
              onChange={(e) => setHandoffAssigneeFilter(e.target.value)}
              className="cks-select px-2.5 py-1.5 text-xs"
            >
              <option value="all">全部</option>
              {assigneeOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-1.5 text-xs text-neutral-400 ml-2">
              <input
                type="checkbox"
                checked={
                  filteredHandoffTasks.length > 0 &&
                  selectedHandoffTaskIds.length === filteredHandoffTasks.length
                }
                onChange={(e) => toggleSelectAllFilteredHandoff(e.target.checked)}
              />
              全选当前筛选
            </label>
            <button
              onClick={batchNotifyAssignees}
              disabled={batchProcessing || selectedHandoffTaskIds.length === 0}
              className="cks-btn cks-btn-secondary border-amber-500/40 text-amber-300 hover:bg-amber-500/10 disabled:opacity-50"
            >
              批量通知执行
            </button>
            <button
              onClick={batchClaimHandoffTasks}
              disabled={batchProcessing || selectedHandoffTaskIds.length === 0}
              className="cks-btn cks-btn-primary disabled:opacity-50"
            >
              批量接手返工
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {handoffLoading ? (
              <div className="text-xs text-neutral-500">正在加载转人工任务...</div>
            ) : filteredHandoffTasks.length === 0 ? (
              <div className="text-xs text-neutral-500">暂无待人工处理任务</div>
            ) : (
              filteredHandoffTasks.slice(0, 10).map((task) => {
                const pendingHours = hoursSince(task.handoff_at || task.reviewed_at || task.updated_at)
                const overdue = pendingHours !== null && pendingHours >= 24
                return (
                  <div
                    key={task.id}
                    data-task-id={task.id}
                    data-highlight-task-id={highlightGoalTaskId === task.id ? task.id : undefined}
                    className={`rounded px-3 py-2 flex items-center justify-between gap-3 border ${
                      overdue
                        ? 'border-rose-400/50 bg-rose-500/10'
                        : 'border-rose-500/20 bg-rose-500/5'
                    } ${highlightGoalTaskId === task.id ? 'ring-2 ring-cyan-400/70 animate-pulse' : ''}`}
                  >
                  <div className="min-w-0">
                    <div className="text-xs text-rose-200 truncate">
                      #{task.id} {task.title} {highlightGoalTaskId === task.id ? '· 当前定位' : ''}
                    </div>
                    <div className="text-[11px] text-neutral-400 truncate mt-1">
                      员工 {task.assignee || '未分配'} · 项目 {task.project_title} · 驳回原因 {task.review_note || '未填写'}
                    </div>
                    <div className={`text-[11px] mt-1 ${overdue ? 'text-rose-300' : 'text-neutral-500'}`}>
                      {pendingHours === null ? '等待时长: -' : `等待时长: ${pendingHours}h`}
                      {overdue ? '（超时）' : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <label className="inline-flex items-center gap-1 text-xs text-neutral-500">
                      <input
                        type="checkbox"
                        checked={selectedHandoffTaskIds.includes(task.id)}
                        onChange={(e) => toggleHandoffTaskSelection(task.id, e.target.checked)}
                      />
                      选择
                    </label>
                    <button
                      onClick={() => notifyAssigneeToExecute(task)}
                      disabled={handoffNotifyTaskId === task.id}
                      className="cks-btn cks-btn-secondary border-amber-500/40 text-amber-300 hover:bg-amber-500/10 disabled:opacity-50"
                    >
                      {handoffNotifyTaskId === task.id ? '通知中...' : '通知员工执行'}
                    </button>
                    <button
                      onClick={() => claimAndLaunchHandoffTask(task)}
                      disabled={handoffClaimingTaskId === task.id}
                      className="px-2.5 py-1.5 text-xs rounded border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10"
                    >
                      {handoffClaimingTaskId === task.id ? '接手中...' : '接手并进入 Workbench'}
                    </button>
                    <button
                      onClick={() => replayHandoffTaskInWorkbench(task)}
                      className={pixelButtonClass}
                    >
                      一键回放
                    </button>
                    <button
                      onClick={() => navigate(`/goals?task_id=${task.id}&organization_id=${encodeURIComponent(organizationId)}`)}
                      className={pixelButtonClass}
                    >
                      查看任务详情
                    </button>
                  </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {mode === 'table' ? (
          <div className={`${pixelPanelClass} overflow-hidden`}>
            <table className="w-full text-xs">
              <thead className="bg-neutral-900 text-neutral-400">
                <tr>
                  <th className="text-left p-2">数字员工</th>
                  <th className="text-left p-2">总任务</th>
                  <th className="text-left p-2">进行中</th>
                  <th className="text-left p-2">待验收</th>
                  <th className="text-left p-2">已验收</th>
                  <th className="text-left p-2">驳回</th>
                  <th className="text-left p-2">完成率</th>
                  <th className="text-left p-2">KPI / OKR</th>
                  <th className="text-left p-2">平均进度</th>
                  <th className="text-left p-2">最近更新</th>
                  <th className="text-left p-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {visibleOwners.length === 0 ? (
                  <tr>
                    <td className="p-3 text-neutral-500" colSpan={11}>
                      {loading ? '加载中...' : '暂无数据'}
                    </td>
                  </tr>
                ) : (
                  visibleOwners.map((row) => (
                    <tr
                      key={row.assignee}
                      className={`border-t border-neutral-800 ${highlightGoalTaskId && row.next_task_id === highlightGoalTaskId ? 'bg-cyan-500/10 animate-pulse' : ''}`}
                    >
                      <td className="p-2">
                        <div>{row.assignee}</div>
                        <div className="text-[11px] text-neutral-500">{row.department || '未分组'}</div>
                      </td>
                      <td className="p-2">{row.total_tasks}</td>
                      <td className="p-2">{row.in_progress}</td>
                      <td className="p-2">{row.pending_review}</td>
                      <td className="p-2">{row.accepted}</td>
                      <td className="p-2">{row.rejected}</td>
                      <td className="p-2">{row.completion_rate}%</td>
                      <td className="p-2">
                        <div className="max-w-[220px] text-[11px] text-neutral-300">
                          {(row.kpi_titles || []).slice(0, 2).join('、') || '-'}
                          <span className="mx-1 text-neutral-600">/</span>
                          {(row.okr_titles || []).slice(0, 2).join('、') || '-'}
                        </div>
                      </td>
                      <td className="p-2">{row.avg_progress}%</td>
                      <td className="p-2">{toDatetimeLocal(row.latest_updated_at).replace('T', ' ') || '-'}</td>
                      <td className="p-2">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => navigate(`/goals?assignee=${encodeURIComponent(row.assignee)}&organization_id=${encodeURIComponent(organizationId)}`)}
                            className={pixelButtonClass}
                          >
                            查看任务
                          </button>
                          <button
                            onClick={() => navigate(`/goals?assignee=${encodeURIComponent(row.assignee)}&review_status=pending&organization_id=${encodeURIComponent(organizationId)}`)}
                            className="cks-btn cks-btn-secondary border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                          >
                            待验收
                          </button>
                          <button
                            onClick={() => startOwnerExecution(row)}
                            disabled={runningAssignee === row.assignee}
                            className="cks-btn cks-btn-primary disabled:opacity-50"
                          >
                            {runningAssignee === row.assignee ? '启动中...' : '一键执行'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {visibleOwners.map((owner) => {
              const state = getOwnerState(owner)
              const avatarSrc = getEmployeeAvatar(owner.assignee || '')
              return (
                <div key={owner.assignee} className={`p-3 ${pixelPanelClass}`}>
                  <button
                    onClick={() => setSelectedOwner(owner)}
                    className="w-full text-left hover:opacity-90"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`relative w-10 h-10 bg-neutral-800 rounded-sm border overflow-hidden ${ownerStateClass[state]} ${avatarAnimationClass[state]}`}>
                        <img
                          src={avatarSrc}
                          alt={owner.assignee || 'AI'}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div>
                        <div className="text-sm text-white">{owner.assignee}</div>
                        <div className="text-[11px] text-neutral-500">{owner.total_tasks} 个任务</div>
                      </div>
                    </div>
                    <div className={`mt-2 inline-flex rounded px-1.5 py-0.5 border text-[11px] ${ownerStateClass[state]}`}>
                      {ownerStateLabel[state]}
                    </div>
                    {owner.next_task_id ? (
                      <div className="mt-1 text-[11px] text-cyan-300">下一任务 #{owner.next_task_id}</div>
                    ) : (
                      <div className="mt-1 text-[11px] text-neutral-500">暂无下一任务</div>
                    )}
                    <div className="mt-1 text-[11px] text-neutral-400">
                      待验收 {owner.pending_review} · 进行中 {owner.in_progress}
                    </div>
                    <div className="mt-1 text-[11px] text-neutral-500">
                      部门: {owner.department || '未分组'}
                    </div>
                    <div className="mt-1 text-[11px] text-neutral-500 truncate">
                      KPI: {(owner.kpi_titles || []).slice(0, 1).join('、') || '-'} / OKR: {(owner.okr_titles || []).slice(0, 1).join('、') || '-'}
                    </div>
                  </button>
                  <button
                    onClick={() => startOwnerExecution(owner)}
                    disabled={runningAssignee === owner.assignee}
                    className="mt-2 w-full px-2 py-1.5 rounded border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 text-xs disabled:opacity-50"
                  >
                    {runningAssignee === owner.assignee ? '启动中...' : '一键发起执行'}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {selectedOwner && (
          <div className={`p-4 ${pixelPanelClass}`}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">员工详情：{selectedOwner.assignee}</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate(`/goals?assignee=${encodeURIComponent(selectedOwner.assignee)}&organization_id=${encodeURIComponent(organizationId)}`)}
                  className={pixelButtonClass}
                >
                  查看全部任务
                </button>
                <button
                  onClick={() => startOwnerExecution(selectedOwner)}
                  disabled={runningAssignee === selectedOwner.assignee}
                  className="cks-btn cks-btn-primary disabled:opacity-50"
                >
                  {runningAssignee === selectedOwner.assignee ? '启动中...' : '一键发起会话执行'}
                </button>
              </div>
            </div>
            <div className="mt-3 text-xs text-neutral-400">
              负责项目：{(selectedOwner.project_titles || []).join('、') || '暂无'}
            </div>
            <div className="mt-2 text-xs text-neutral-400">
              关联 KPI：{(selectedOwner.kpi_titles || []).join('、') || '暂无'} · 关联 OKR：{(selectedOwner.okr_titles || []).join('、') || '暂无'}
            </div>
            <div className="mt-2 text-xs text-neutral-500">
              完成率 {selectedOwner.completion_rate}% · 平均进度 {selectedOwner.avg_progress}% · 最近更新 {toDatetimeLocal(selectedOwner.latest_updated_at).replace('T', ' ') || '-'}
            </div>
            {selectedOwner.next_task_id && (
              <div className="mt-1 text-xs text-cyan-300">当前下一任务：#{selectedOwner.next_task_id}</div>
            )}

            <div className="mt-3 border-t border-neutral-800 pt-3">
              <p className="text-xs text-neutral-400 mb-2">任务气泡（点击可直接发起该任务执行）</p>
              {ownerTasksLoading ? (
                <p className="text-xs text-neutral-500">加载任务中...</p>
              ) : ownerTasks.length === 0 ? (
                <p className="text-xs text-neutral-500">暂无任务</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {ownerTasks.slice(0, 16).map((task) => {
                    const readiness = ownerTaskReadinessMap[task.id]
                    const bubbleState = task.review_status === 'pending' && task.status === 'done'
                      ? getReviewStatusMeta('pending').badgeClassName
                      : task.review_status === 'rejected'
                        ? getReviewStatusMeta('rejected').badgeClassName
                        : task.review_status === 'accepted'
                          ? getReviewStatusMeta('accepted').badgeClassName
                          : getTaskStatusMeta(task.status || '').badgeClassName
                    return (
                      <button
                        key={task.id}
                        data-task-id={task.id}
                        data-highlight-task-id={highlightGoalTaskId === task.id ? task.id : undefined}
                        onClick={() => setSelectedTaskBubble(task)}
                        className={`px-2.5 py-1.5 rounded-none border-2 text-xs hover:bg-neutral-900 ${bubbleState} ${highlightGoalTaskId === task.id ? 'ring-2 ring-cyan-400/70 animate-pulse' : ''}`}
                        title={`${task.title} | ${task.status} | ${task.review_status || 'pending'}`}
                      >
                        #{task.id} {task.title.slice(0, 10)} {highlightGoalTaskId === task.id ? '·定位' : ''}
                        {readiness ? (
                          <span className={`ml-1 ${readiness.can_complete ? 'text-emerald-300' : 'text-amber-300'}`}>
                            {readiness.can_complete ? '·可收口' : '·需执行'}
                          </span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              )}

              {selectedTaskBubble && (
                <div
                  data-task-id={selectedTaskBubble.id}
                  data-highlight-task-id={highlightGoalTaskId === selectedTaskBubble.id ? selectedTaskBubble.id : undefined}
                  className={`mt-3 rounded-none border-2 bg-black/40 p-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.45)] ${highlightGoalTaskId === selectedTaskBubble.id ? 'border-cyan-500/70 animate-pulse' : 'border-neutral-700'}`}
                >
                  <p className="text-xs text-neutral-200">
                    任务 #{selectedTaskBubble.id}：{selectedTaskBubble.title}
                  </p>
                  <p className="text-[11px] text-neutral-500 mt-1">
                    状态 {getTaskStatusMeta(selectedTaskBubble.status || '').label} · 验收 {getReviewStatusMeta(selectedTaskBubble.review_status).label}
                  </p>
                  {ownerTaskReadinessMap[selectedTaskBubble.id] ? (
                    <p className={`text-[11px] mt-1 ${ownerTaskReadinessMap[selectedTaskBubble.id].can_complete ? 'text-emerald-300' : 'text-amber-300'}`}>
                      执行就绪：{ownerTaskReadinessMap[selectedTaskBubble.id].can_complete ? '可收口' : '证据不足（建议继续执行）'}
                      {' · '}执行 {ownerTaskReadinessMap[selectedTaskBubble.id].execution_count}
                      {' · '}错误 {ownerTaskReadinessMap[selectedTaskBubble.id].error_count}
                    </p>
                  ) : null}
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => startOwnerExecution(selectedOwner, selectedTaskBubble.id)}
                      disabled={runningAssignee === selectedOwner.assignee}
                      className="cks-btn cks-btn-primary disabled:opacity-50"
                    >
                      {runningAssignee === selectedOwner.assignee ? '启动中...' : '发起此任务执行'}
                    </button>
                    <MoreActions
                      buttonClassName={pixelButtonClass}
                      menuClassName="rounded-none border-2 border-neutral-700 bg-neutral-950 shadow-[3px_3px_0px_0px_rgba(0,0,0,0.45)]"
                      items={[
                        {
                          key: 'detail',
                          label: '查看任务详情',
                          onClick: () => navigate(`/goals?task_id=${selectedTaskBubble.id}&organization_id=${encodeURIComponent(organizationId)}`),
                        },
                        {
                          key: 'set-next',
                          label: settingNextTask ? '设置中...' : '设为下一任务',
                          onClick: async () => {
                            setSettingNextTask(true)
                            try {
                              const result = await AgentService.setDashboardNextTask(
                                selectedOwner.assignee,
                                selectedTaskBubble.id,
                                organizationId
                              )
                              if (result?.success) {
                                await load()
                              } else {
                                window.alert(result?.error || '设置下一任务失败')
                              }
                            } catch (error) {
                              console.error('Failed to set next task:', error)
                            } finally {
                              setSettingNextTask(false)
                            }
                          },
                          disabled: settingNextTask,
                        },
                      ]}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
