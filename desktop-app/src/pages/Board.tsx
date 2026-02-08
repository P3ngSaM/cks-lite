import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Gamepad2, List, RefreshCw, Users } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AgentService } from '@/services/agentService'
import { useChatStore } from '@/stores'
import type { ChannelTask, ExecutionApprovalRecord, GoalTaskListItem, GoalsDashboardOwnerRow, GoalsDashboardSummary } from '@/types/agent'

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
const approvalStatusLabel: Record<string, string> = {
  pending: '待审批',
  approved: '已批准',
  denied: '已拒绝',
  expired: '已过期',
}
const parseGoalTaskId = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value)
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed)
  }
  return null
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

const pixelBgStyle = {
  backgroundColor: '#0b1220',
  backgroundImage:
    'linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)',
  backgroundSize: '18px 18px',
} as const

const pixelPanelClass =
  'rounded-none border-2 border-neutral-700 bg-neutral-950/80 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.45)]'

const pixelButtonClass =
  'rounded-none border-2 border-neutral-600 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-100 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.45)] hover:border-cyan-400 hover:text-cyan-200 active:translate-x-[1px] active:translate-y-[1px] transition'

const pixelInputClass =
  'rounded-none border-2 border-neutral-700 bg-black/70 px-2.5 py-2 text-xs text-neutral-100 focus:border-cyan-500 focus:outline-none'

export const Board = () => {
  const location = useLocation()
  const navigate = useNavigate()
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
  const [loading, setLoading] = useState(false)
  const [fromTime, setFromTime] = useState('')
  const [toTime, setToTime] = useState('')
  const [mode, setMode] = useState<BoardMode>('game')
  const [selectedOwner, setSelectedOwner] = useState<GoalsDashboardOwnerRow | null>(null)
  const [runningAssignee, setRunningAssignee] = useState('')
  const [settingNextTask, setSettingNextTask] = useState(false)
  const [ownerTasks, setOwnerTasks] = useState<GoalTaskListItem[]>([])
  const [ownerTasksLoading, setOwnerTasksLoading] = useState(false)
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
  const linkedChannelTaskRef = useRef<string>('')
  const orgConfigInputRef = useRef<HTMLInputElement | null>(null)

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
    if (!selectedOwner?.assignee) {
      setOwnerTasks([])
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
          setSelectedTaskBubble(null)
        }
      } catch (error) {
        console.error('Failed to load owner tasks:', error)
        setOwnerTasks([])
        setSelectedTaskBubble(null)
      } finally {
        setOwnerTasksLoading(false)
      }
    }
    loadOwnerTasks()
  }, [selectedOwner?.assignee, organizationId])

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

  const cards = useMemo(
    () => [
      { title: '待验收', value: summary.pending_review, color: 'text-amber-300 border-amber-500/30 bg-amber-500/10' },
      { title: '进行中', value: summary.in_progress, color: 'text-blue-300 border-blue-500/30 bg-blue-500/10' },
      { title: '已验收', value: summary.accepted, color: 'text-green-300 border-green-500/30 bg-green-500/10' },
      { title: '驳回返工', value: summary.rejected, color: 'text-rose-300 border-rose-500/30 bg-rose-500/10' },
    ],
    [summary]
  )

  const assigneeOptions = useMemo(() => {
    const items = new Set<string>()
    owners.forEach((owner) => {
      const value = (owner.assignee || '').trim()
      if (value) items.add(value)
    })
    return Array.from(items)
  }, [owners])

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
        reason: `该负责人风险分最高（${topRiskOwner.riskScore}），建议立即执行下一任务。`,
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
    const next = window.prompt('重命名当前组织', organizationId)
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
      window.alert('组织配置导入失败，请检查文件格式。')
    } finally {
      event.target.value = ''
    }
  }, [])

  const launchTaskInWorkbench = useCallback(
    (taskId: number, assignee: string) => {
      const sessionId = createSession(`执行任务 #${taskId} - ${assignee}`)
      setSessionGoalTask(sessionId, taskId)
      setSessionOrganization(sessionId, organizationId)
      setCurrentSession(sessionId)
      navigate('/workbench')
    },
    [createSession, navigate, organizationId, setCurrentSession, setSessionGoalTask, setSessionOrganization]
  )

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
          window.alert(`负责人 ${owner.assignee} 当前没有可执行任务。`)
          return
        }

        launchTaskInWorkbench(taskId, owner.assignee)
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
      window.alert('请输入负责人')
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
        launchTaskInWorkbench(created.id, dispatchAssignee.trim())
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

  const claimAndLaunchHandoffTask = useCallback(
    async (task: GoalTaskListItem) => {
      if (!handoffOwner.trim()) {
        window.alert('请先填写接手人')
        return
      }
      setHandoffClaimingTaskId(task.id)
      try {
        const result = await AgentService.claimGoalTaskHandoff(task.id, handoffOwner.trim(), '老板看板接手返工')
        if (!result?.success) {
          window.alert(result?.error || '接手失败')
          return
        }
        await load()
        launchTaskInWorkbench(task.id, task.assignee || handoffOwner.trim())
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
        window.alert('该任务暂无负责人，无法通知')
        return
      }
      setHandoffNotifyTaskId(task.id)
      try {
        await AgentService.setDashboardNextTask(assignee, task.id, organizationId)
        launchTaskInWorkbench(task.id, assignee)
      } catch (error) {
        console.error('Failed to notify assignee:', error)
        window.alert('通知失败，请稍后重试')
      } finally {
        setHandoffNotifyTaskId(null)
      }
    },
    [launchTaskInWorkbench, organizationId]
  )

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
        const result = await AgentService.claimGoalTaskHandoff(task.id, handoffOwner.trim(), '老板看板批量接手返工')
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
      ? `当前高风险负责人：${topRiskOwner.owner.assignee}（风险分 ${topRiskOwner.riskScore}）`
      : '当前暂无高风险负责人'
    localStorage.setItem(
      'cks.workbench.seedPrompt',
      [
        '请基于当前组织看板生成一份老板简报。',
        `组织：${organizationId}`,
        `总任务：${summary.total_tasks}，待验收：${summary.pending_review}，驳回：${summary.rejected}，已验收：${summary.accepted}`,
        `自动完成率：${managerInsights.automationRate}%`,
        `团队平均完成率：${managerInsights.avgOwnerCompletion}%`,
        riskTip,
        '输出格式：1) 风险总览 2) 本周进展 3) 三条可执行决策建议。',
      ].join('\n')
    )
    const sessionId = createSession(`老板简报 - ${organizationId}`)
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
        `组织：${organizationId}`,
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
      '# 老板周报（自动导出）',
      '',
      `- 组织：${organizationId}`,
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
      '## 负责人概览（Top 5）',
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
      `状态: ${approvalStatusLabel[record.status] || record.status}`,
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

  return (
    <div className="h-full overflow-y-auto text-white p-6" style={pixelBgStyle}>
      <div className="max-w-6xl mx-auto space-y-4">
        <div className={`flex items-center justify-between gap-3 p-3 ${pixelPanelClass}`}>
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <Users className="h-5 w-5 text-neutral-300" />
              老板看板
            </h1>
            <p className="text-xs text-neutral-500 mt-1">组织任务概览、负责人状态和一键执行调度</p>
          </div>
          <div className="flex items-center gap-2">
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
          </div>
        </div>

        {(linkedChannelTaskLoading || linkedChannelTask) ? (
          <div className={`p-3 ${pixelPanelClass} border-fuchsia-500/40 bg-fuchsia-500/10`}>
            {linkedChannelTaskLoading ? (
              <p className="text-xs text-fuchsia-200">正在加载联调任务上下文...</p>
            ) : linkedChannelTask ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-sm text-fuchsia-100">联调任务 #{linkedChannelTask.id}（{linkedChannelTask.status}）</p>
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
            ) : (
              <p className="text-xs text-fuchsia-200">未找到对应联调任务，可能已被清理。</p>
            )}
          </div>
        ) : null}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {cards.map((card) => (
            <div key={card.title} className={`p-4 rounded-none border-2 shadow-[3px_3px_0px_0px_rgba(0,0,0,0.4)] ${card.color}`}>
              <p className="text-xs opacity-90">{card.title}</p>
              <p className="text-2xl font-semibold mt-1">{card.value}</p>
            </div>
          ))}
        </div>

        <div className={`p-3 space-y-2 ${pixelPanelClass}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-neutral-400">组织</span>
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
              <option value="all">全部部门</option>
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
            <span className="text-xs text-neutral-500">总任务：{summary.total_tasks} · 在看负责人：{visibleOwners.length}</span>
          </div>

          <div className="flex items-center gap-2">
            <details className="relative">
              <summary className={`${pixelButtonClass} cursor-pointer list-none`}>组织设置</summary>
              <div className="absolute left-0 top-full mt-2 w-64 p-2 space-y-1.5 border-2 border-neutral-700 bg-neutral-950 z-20">
                <input
                  value={newOrganizationId}
                  onChange={(e) => setNewOrganizationId(e.target.value)}
                  placeholder="新组织 ID"
                  className={`${pixelInputClass} w-full`}
                />
                <button type="button" onClick={addOrganizationToCatalog} className={`${pixelButtonClass} w-full`}>
                  新增组织
                </button>
                <button type="button" onClick={renameCurrentOrganization} className={`${pixelButtonClass} w-full`}>
                  重命名当前组织
                </button>
                <button type="button" onClick={removeCurrentOrganizationFromCatalog} className={`${pixelButtonClass} w-full`}>
                  移除当前组织
                </button>
                <button type="button" onClick={exportOrganizationConfig} className={`${pixelButtonClass} w-full`}>
                  导出组织配置
                </button>
                <button type="button" onClick={() => orgConfigInputRef.current?.click()} className={`${pixelButtonClass} w-full`}>
                  导入组织配置
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
            <div className="text-xs text-neutral-400">老板洞察（自动生成）</div>
            <div className="flex flex-wrap items-center gap-2">
              {topRiskOwner && (
                <button
                  type="button"
                  className={pixelButtonClass}
                  onClick={() => startOwnerExecution(topRiskOwner.owner, topRiskOwner.owner.next_task_id || undefined)}
                >
                  拉起高风险负责人：{topRiskOwner.owner.assignee}
                </button>
              )}
              <button type="button" className={pixelButtonClass} onClick={openManagerBriefingInWorkbench}>
                生成老板简报
              </button>
              <button type="button" className={pixelButtonClass} onClick={exportManagerWeeklyReport}>
                导出老板周报
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
            <div className="text-xs text-neutral-400 mb-2">本周最值得老板干预的 3 件事</div>
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
                    <span className="text-neutral-500">{approvalStatusLabel[item.status] || item.status}</span>
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
            <span>最近组织：</span>
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
          <div className="text-xs text-neutral-400 mb-2">部门任务热力（按待验收 + 进行中排序）</div>
          {departmentOverview.length === 0 ? (
            <div className="text-xs text-neutral-500">当前组织暂无部门数据</div>
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
          <div className="text-xs text-neutral-400 mb-2">部门趋势（近7天）</div>
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
              <h2 className="text-sm font-semibold text-neutral-100">老板派单中心</h2>
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
                placeholder="负责人（可输入新名字）"
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
              className="ml-auto px-3 py-1.5 text-xs rounded border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-40"
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
              className="bg-black border border-neutral-700 rounded px-2.5 py-1.5 text-xs w-56"
              placeholder="例如 manager"
            />
            <span className="text-xs text-neutral-500 ml-2">负责人筛选</span>
            <select
              value={handoffAssigneeFilter}
              onChange={(e) => setHandoffAssigneeFilter(e.target.value)}
              className="bg-black border border-neutral-700 rounded px-2.5 py-1.5 text-xs"
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
              className="px-2.5 py-1.5 text-xs rounded border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 disabled:opacity-50"
            >
              批量通知执行
            </button>
            <button
              onClick={batchClaimHandoffTasks}
              disabled={batchProcessing || selectedHandoffTaskIds.length === 0}
              className="px-2.5 py-1.5 text-xs rounded border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-50"
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
                    className={`rounded px-3 py-2 flex items-center justify-between gap-3 border ${
                      overdue
                        ? 'border-rose-400/50 bg-rose-500/10'
                        : 'border-rose-500/20 bg-rose-500/5'
                    }`}
                  >
                  <div className="min-w-0">
                    <div className="text-xs text-rose-200 truncate">
                      #{task.id} {task.title}
                    </div>
                    <div className="text-[11px] text-neutral-400 truncate mt-1">
                      负责人 {task.assignee || '未分配'} · 项目 {task.project_title} · 驳回原因 {task.review_note || '未填写'}
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
                      className="px-2.5 py-1.5 text-xs rounded border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 disabled:opacity-50"
                    >
                      {handoffNotifyTaskId === task.id ? '通知中...' : '通知负责人执行'}
                    </button>
                    <button
                      onClick={() => claimAndLaunchHandoffTask(task)}
                      disabled={handoffClaimingTaskId === task.id}
                      className="px-2.5 py-1.5 text-xs rounded border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10"
                    >
                      {handoffClaimingTaskId === task.id ? '接手中...' : '接手并进入 Workbench'}
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
                  <th className="text-left p-2">负责人</th>
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
                    <tr key={row.assignee} className="border-t border-neutral-800">
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
                            className="px-2 py-1 rounded border border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                          >
                            待验收
                          </button>
                          <button
                            onClick={() => startOwnerExecution(row)}
                            disabled={runningAssignee === row.assignee}
                            className="px-2 py-1 rounded border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-50"
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
              return (
                <div key={owner.assignee} className={`p-3 ${pixelPanelClass}`}>
                  <button
                    onClick={() => setSelectedOwner(owner)}
                    className="w-full text-left hover:opacity-90"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`relative w-10 h-10 bg-neutral-800 rounded-sm border overflow-hidden ${ownerStateClass[state]} ${avatarAnimationClass[state]}`}>
                        <div className="absolute inset-x-2 top-1 h-2 bg-amber-300 rounded-sm" />
                        <div className="absolute left-2 top-4 w-1.5 h-1.5 bg-black rounded-sm" />
                        <div className="absolute right-2 top-4 w-1.5 h-1.5 bg-black rounded-sm" />
                        <div className="absolute inset-x-3 top-6 h-1 bg-rose-300 rounded-sm" />
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
              <h3 className="text-sm font-semibold">负责人详情：{selectedOwner.assignee}</h3>
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
                  className="px-2.5 py-1.5 text-xs rounded border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-50"
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
                    const bubbleState = task.review_status === 'pending' && task.status === 'done'
                      ? 'border-amber-500/40 text-amber-300'
                      : task.review_status === 'rejected'
                        ? 'border-rose-500/40 text-rose-300'
                        : task.review_status === 'accepted'
                          ? 'border-green-500/40 text-green-300'
                          : 'border-neutral-700 text-neutral-300'
                    return (
                      <button
                        key={task.id}
                        onClick={() => setSelectedTaskBubble(task)}
                        className={`px-2.5 py-1.5 rounded-none border-2 text-xs hover:bg-neutral-900 ${bubbleState}`}
                        title={`${task.title} | ${task.status} | ${task.review_status || 'pending'}`}
                      >
                        #{task.id} {task.title.slice(0, 10)}
                      </button>
                    )
                  })}
                </div>
              )}

              {selectedTaskBubble && (
                <div className="mt-3 rounded-none border-2 border-neutral-700 bg-black/40 p-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.45)]">
                  <p className="text-xs text-neutral-200">
                    任务 #{selectedTaskBubble.id}：{selectedTaskBubble.title}
                  </p>
                  <p className="text-[11px] text-neutral-500 mt-1">
                    状态 {selectedTaskBubble.status} · 验收 {(selectedTaskBubble.review_status || 'pending')}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => startOwnerExecution(selectedOwner, selectedTaskBubble.id)}
                      disabled={runningAssignee === selectedOwner.assignee}
                      className="px-2.5 py-1.5 text-xs rounded border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-50"
                    >
                      {runningAssignee === selectedOwner.assignee ? '启动中...' : '发起此任务执行'}
                    </button>
                    <button
                      onClick={() => navigate(`/goals?task_id=${selectedTaskBubble.id}&organization_id=${encodeURIComponent(organizationId)}`)}
                      className={pixelButtonClass}
                    >
                      查看任务详情
                    </button>
                    <button
                      onClick={async () => {
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
                      }}
                      disabled={settingNextTask}
                      className="px-2.5 py-1.5 text-xs rounded border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
                    >
                      {settingNextTask ? '设置中...' : '设为下一任务'}
                    </button>
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
