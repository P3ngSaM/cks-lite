import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Download, FileText, Link2, Plus, RefreshCw, Target, Trash2, X } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AgentService } from '@/services/agentService'
import { useChatStore } from '@/stores'
import type { AuditRecord, GoalKPI, GoalTaskListItem } from '@/types/agent'

const progressColor = (value: number) => {
  if (value >= 80) return 'bg-green-500'
  if (value >= 40) return 'bg-yellow-500'
  return 'bg-blue-500'
}

const reviewStatusLabel = (status?: string) => {
  const normalized = (status || 'pending').toLowerCase()
  if (normalized === 'accepted') return '已验收'
  if (normalized === 'rejected') return '已驳回'
  return '待验收'
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

export const Goals = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const currentSessionId = useChatStore((state) => state.currentSessionId)
  const sessionGoalTaskMap = useChatStore((state) => state.sessionGoalTaskMap)
  const setSessionGoalTask = useChatStore((state) => state.setSessionGoalTask)
  const setSessionOrganization = useChatStore((state) => state.setSessionOrganization)
  const clearSessionGoalTask = useChatStore((state) => state.clearSessionGoalTask)
  const createSession = useChatStore((state) => state.createSession)
  const setCurrentSession = useChatStore((state) => state.setCurrentSession)
  const [kpis, setKpis] = useState<GoalKPI[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [selectedKpiId, setSelectedKpiId] = useState<number | null>(null)
  const [selectedOkrId, setSelectedOkrId] = useState<number | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const activeTaskId = currentSessionId ? (sessionGoalTaskMap[currentSessionId] ?? null) : null

  const [kpiTitle, setKpiTitle] = useState('')
  const [okrTitle, setOkrTitle] = useState('')
  const [projectTitle, setProjectTitle] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskAssignee, setTaskAssignee] = useState('')
  const [taskDepartment, setTaskDepartment] = useState('')
  const [createStep, setCreateStep] = useState<'kpi' | 'okr' | 'project' | 'task'>('kpi')

  const [filterAssignee, setFilterAssignee] = useState('')
  const [filterDepartment, setFilterDepartment] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterReviewStatus, setFilterReviewStatus] = useState('')
  const [filterFromTime, setFilterFromTime] = useState('')
  const [filterToTime, setFilterToTime] = useState('')
  const [taskRows, setTaskRows] = useState<GoalTaskListItem[]>([])
  const [taskRowsLoading, setTaskRowsLoading] = useState(false)
  const [selectedTaskIds, setSelectedTaskIds] = useState<number[]>([])

  const [detailTask, setDetailTask] = useState<GoalTaskListItem | null>(null)
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditExecutions, setAuditExecutions] = useState<AuditRecord[]>([])
  const [auditErrors, setAuditErrors] = useState<AuditRecord[]>([])
  const [reviewReason, setReviewReason] = useState('')
  const [batchReviewReason, setBatchReviewReason] = useState('')
  const [isReviewing, setIsReviewing] = useState(false)
  const fromWorkbench = searchParams.get('from') === 'workbench'
  const [organizationId, setOrganizationId] = useState(() => localStorage.getItem('cks.goals.organizationId') || 'default-org')
  const [organizationCatalog, setOrganizationCatalog] = useState<string[]>(() => {
    const raw = (localStorage.getItem('cks.goals.organizationCatalog') || '').split(',').map((v) => v.trim()).filter(Boolean)
    return raw.length > 0 ? raw : ['default-org']
  })
  const [newOrganizationId, setNewOrganizationId] = useState('')

  useEffect(() => {
    setReviewReason(detailTask?.review_note || '')
  }, [detailTask?.id, detailTask?.review_note])

  const loadTree = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await AgentService.getGoalsTree(organizationId)
      if (result?.success && result.data) setKpis(result.data.kpis)
    } catch (error) {
      console.error('Failed to load goals tree:', error)
    } finally {
      setIsLoading(false)
    }
  }, [organizationId])

  const loadTaskRows = useCallback(async () => {
    setTaskRowsLoading(true)
    try {
      const normalizedAssignee = filterAssignee.trim()
      const result = await AgentService.listGoalTasks({
        organizationId,
        assignee: normalizedAssignee || undefined,
        department: filterDepartment || undefined,
        status: filterStatus || undefined,
        reviewStatus: filterReviewStatus || undefined,
        fromTime: toIso(filterFromTime) || undefined,
        toTime: toIso(filterToTime) || undefined,
        limit: 500,
      })
      if (result?.success && result.tasks) {
        setTaskRows(result.tasks)
        setSelectedTaskIds([])
      }
    } catch (error) {
      console.error('Failed to load filtered tasks:', error)
    } finally {
      setTaskRowsLoading(false)
    }
  }, [organizationId, filterAssignee, filterDepartment, filterStatus, filterReviewStatus, filterFromTime, filterToTime])

  const quickFilterPendingReview = async () => {
    const nextReviewStatus = filterReviewStatus === 'pending' ? '' : 'pending'
    setFilterReviewStatus(nextReviewStatus)
    setTaskRowsLoading(true)
    try {
      const normalizedAssignee = filterAssignee.trim()
      const result = await AgentService.listGoalTasks({
        organizationId,
        assignee: normalizedAssignee || undefined,
        department: filterDepartment || undefined,
        status: filterStatus || undefined,
        reviewStatus: nextReviewStatus || undefined,
        fromTime: toIso(filterFromTime) || undefined,
        toTime: toIso(filterToTime) || undefined,
        limit: 500,
      })
      if (result?.success && result.tasks) {
        setTaskRows(result.tasks)
        setSelectedTaskIds([])
      }
    } catch (error) {
      console.error('Failed to quick filter pending review tasks:', error)
    } finally {
      setTaskRowsLoading(false)
    }
  }

  const replayTaskAudit = useCallback(async (task: GoalTaskListItem) => {
    setDetailTask(task)
    setAuditLoading(true)
    try {
      const [execResult, errorResult] = await Promise.all([
        AgentService.getAuditExecutions(
          undefined,
          200,
          undefined,
          toIso(filterFromTime) || undefined,
          toIso(filterToTime) || undefined,
          task.id
        ),
        AgentService.getAuditErrors(
          undefined,
          200,
          undefined,
          toIso(filterFromTime) || undefined,
          toIso(filterToTime) || undefined,
          task.id
        ),
      ])
      setAuditExecutions(execResult?.success && execResult.records ? execResult.records : [])
      setAuditErrors(errorResult?.success && errorResult.records ? errorResult.records : [])
    } catch (error) {
      console.error('Failed to replay task audit logs:', error)
      setAuditExecutions([])
      setAuditErrors([])
    } finally {
      setAuditLoading(false)
    }
  }, [filterFromTime, filterToTime])

  useEffect(() => {
    loadTree()
    loadTaskRows()
  }, [loadTree, loadTaskRows])

  useEffect(() => {
    localStorage.setItem('cks.goals.organizationId', organizationId)
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
    localStorage.setItem('cks.goals.organizationCatalog', organizationCatalog.join(','))
  }, [organizationCatalog])

  useEffect(() => {
    const taskIdText = searchParams.get('task_id')
    if (!taskIdText) return
    const taskId = Number(taskIdText)
    if (!Number.isFinite(taskId) || taskId <= 0) return

    const openTaskDetail = async () => {
      try {
        const result = await AgentService.listGoalTasks({ organizationId, taskId, limit: 1 })
        if (result?.success && result.tasks && result.tasks.length > 0) {
          await replayTaskAudit(result.tasks[0])
        }
      } catch (error) {
        console.error('Failed to open task detail from query:', error)
      } finally {
        const next = new URLSearchParams(searchParams)
        next.delete('task_id')
        setSearchParams(next, { replace: true })
      }
    }

    openTaskDetail()
  }, [replayTaskAudit, searchParams, setSearchParams])

  useEffect(() => {
    const assignee = (searchParams.get('assignee') || '').trim()
    const status = (searchParams.get('status') || '').trim()
    const department = (searchParams.get('department') || '').trim()
    const reviewStatus = (searchParams.get('review_status') || '').trim()
    const from = (searchParams.get('from_time') || '').trim()
    const to = (searchParams.get('to_time') || '').trim()
    const org = (searchParams.get('organization_id') || '').trim()

    if (assignee && assignee !== filterAssignee) setFilterAssignee(assignee)
    if (status && status !== filterStatus) setFilterStatus(status)
    if (department && department !== filterDepartment) setFilterDepartment(department)
    if (reviewStatus && reviewStatus !== filterReviewStatus) setFilterReviewStatus(reviewStatus)
    if (from) {
      const nextFrom = toDatetimeLocal(from)
      if (nextFrom && nextFrom !== filterFromTime) setFilterFromTime(nextFrom)
    }
    if (to) {
      const nextTo = toDatetimeLocal(to)
      if (nextTo && nextTo !== filterToTime) setFilterToTime(nextTo)
    }
    if (org && org !== organizationId) setOrganizationId(org)
  }, [
    filterAssignee,
    filterDepartment,
    filterFromTime,
    filterReviewStatus,
    filterStatus,
    filterToTime,
    organizationId,
    searchParams,
  ])

  useEffect(() => {
    if (!selectedKpiId && kpis.length > 0) setSelectedKpiId(kpis[0].id)
  }, [kpis, selectedKpiId])

  const selectedKpi = useMemo(
    () => kpis.find((kpi) => kpi.id === selectedKpiId) || null,
    [kpis, selectedKpiId]
  )
  const selectedOkr = useMemo(
    () => selectedKpi?.okrs.find((okr) => okr.id === selectedOkrId) || null,
    [selectedKpi, selectedOkrId]
  )
  const handleCreateKpi = async () => {
    const title = kpiTitle.trim()
    if (!title) return
    setIsSaving(true)
    try {
      const result = await AgentService.createKPI(title, '', organizationId)
      if (result?.success) {
        setKpiTitle('')
        if (result.id) {
          setSelectedKpiId(result.id)
          setSelectedOkrId(null)
          setSelectedProjectId(null)
        }
        setCreateStep('okr')
        await loadTree()
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleCreateOkr = async () => {
    const title = okrTitle.trim()
    if (!title || !selectedKpiId) return
    setIsSaving(true)
    try {
      const result = await AgentService.createOKR(selectedKpiId, title)
      if (result?.success) {
        setOkrTitle('')
        if (result.id) {
          setSelectedOkrId(result.id)
          setSelectedProjectId(null)
        }
        setCreateStep('project')
        await loadTree()
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleCreateProject = async () => {
    const title = projectTitle.trim()
    if (!title || !selectedOkrId) return
    setIsSaving(true)
    try {
      const result = await AgentService.createGoalProject(selectedOkrId, title)
      if (result?.success) {
        setProjectTitle('')
        if (result.id) setSelectedProjectId(result.id)
        setCreateStep('task')
        await loadTree()
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleCreateTask = async () => {
    const title = taskTitle.trim()
    if (!title || !selectedProjectId) return
    setIsSaving(true)
    try {
      const result = await AgentService.createGoalTask(
        selectedProjectId,
        title,
        '',
        taskAssignee.trim(),
        taskDepartment.trim()
      )
      if (result?.success) {
        setTaskTitle('')
        setTaskAssignee('')
        setTaskDepartment('')
        setCreateStep('task')
        await Promise.all([loadTree(), loadTaskRows()])
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleCompleteTask = async (taskId: number) => {
    setIsSaving(true)
    try {
      const result = await AgentService.completeGoalTask(taskId)
      if (result?.success) {
        await Promise.all([loadTree(), loadTaskRows()])
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleReviewTask = async (taskId: number, decision: 'accept' | 'reject') => {
    setIsReviewing(true)
    try {
      const result = await AgentService.reviewGoalTask(taskId, decision, reviewReason.trim(), 'manager')
      if (result?.success) {
        setReviewReason('')
        await Promise.all([loadTree(), loadTaskRows()])
        if (detailTask && detailTask.id === taskId) {
          const refreshed = await AgentService.listGoalTasks({ organizationId, taskId, limit: 1 })
          if (refreshed?.success && refreshed.tasks && refreshed.tasks[0]) {
            setDetailTask(refreshed.tasks[0])
          }
        }
        if (fromWorkbench && detailTask && detailTask.id === taskId) {
          navigate(`/workbench?review_task_id=${taskId}&review_result=${decision}`)
          return
        }
      }
    } catch (error) {
      console.error('Failed to review task:', error)
    } finally {
      setIsReviewing(false)
    }
  }

  const toggleTaskSelected = (taskId: number, checked: boolean) => {
    setSelectedTaskIds((prev) => {
      if (checked) return prev.includes(taskId) ? prev : [...prev, taskId]
      return prev.filter((id) => id !== taskId)
    })
  }

  const toggleSelectAllVisibleTasks = (checked: boolean) => {
    if (!checked) {
      setSelectedTaskIds([])
      return
    }
    setSelectedTaskIds(taskRows.map((task) => task.id))
  }

  const handleBatchReview = async (decision: 'accept' | 'reject') => {
    if (selectedTaskIds.length === 0) return
    setIsReviewing(true)
    try {
      await Promise.allSettled(
        selectedTaskIds.map((taskId) =>
          AgentService.reviewGoalTask(taskId, decision, batchReviewReason.trim(), 'manager')
        )
      )
      setSelectedTaskIds([])
      setBatchReviewReason('')
      await Promise.all([loadTree(), loadTaskRows()])
    } catch (error) {
      console.error('Failed to batch review tasks:', error)
    } finally {
      setIsReviewing(false)
    }
  }

  const bindTaskToWorkbench = (taskId: number) => {
    if (!currentSessionId) return
    setSessionGoalTask(currentSessionId, taskId)
  }

  const clearBoundTask = () => {
    if (!currentSessionId) return
    clearSessionGoalTask(currentSessionId)
  }

  const startTaskInWorkbench = (task: GoalTaskListItem | { id: number; title: string }) => {
    const title = `任务 #${task.id} - ${task.title}`
    const sessionId = createSession(title)
    setSessionGoalTask(sessionId, task.id)
    setSessionOrganization(sessionId, organizationId)
    setCurrentSession(sessionId)
    navigate('/workbench')
  }

  const exportTasksCsv = () => {
    const header = ['id', 'kpi_title', 'okr_title', 'project_title', 'title', 'assignee', 'status', 'progress', 'updated_at']
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [header.join(',')]
    for (const row of taskRows) {
      lines.push([
        row.id,
        row.kpi_title,
        row.okr_title,
        row.project_title,
        row.title,
        row.assignee,
        row.status,
        row.progress,
        row.updated_at,
      ].map(esc).join(','))
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `goals_tasks_${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportTaskAuditJson = () => {
    if (!detailTask) return
    const payload = {
      task: detailTask,
      exported_at: new Date().toISOString(),
      executions: auditExecutions,
      errors: auditErrors,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `task_audit_${detailTask.id}_${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDeleteTask = async (taskId: number) => {
    if (!window.confirm(`确认删除任务 #${taskId} 吗？`)) return
    setIsSaving(true)
    try {
      const result = await AgentService.deleteGoalTask(taskId)
      if (result?.success) {
        if (activeTaskId === taskId) clearBoundTask()
        if (detailTask?.id === taskId) setDetailTask(null)
        setSelectedTaskIds((prev) => prev.filter((id) => id !== taskId))
        await Promise.all([loadTree(), loadTaskRows()])
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteProject = async (projectId: number) => {
    if (!window.confirm(`确认删除项目 #${projectId} 吗？项目下任务会一起删除。`)) return
    setIsSaving(true)
    try {
      const result = await AgentService.deleteGoalProject(projectId)
      if (result?.success) {
        if (activeTaskId) clearBoundTask()
        setSelectedProjectId(null)
        await Promise.all([loadTree(), loadTaskRows()])
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteOkr = async (okrId: number) => {
    if (!window.confirm(`确认删除 OKR #${okrId} 吗？下级项目和任务会一起删除。`)) return
    setIsSaving(true)
    try {
      const result = await AgentService.deleteGoalOKR(okrId)
      if (result?.success) {
        if (activeTaskId) clearBoundTask()
        setSelectedOkrId(null)
        setSelectedProjectId(null)
        await Promise.all([loadTree(), loadTaskRows()])
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteKpi = async (kpiId: number) => {
    if (!window.confirm(`确认删除 KPI #${kpiId} 吗？下级 OKR/项目/任务会全部删除。`)) return
    setIsSaving(true)
    try {
      const result = await AgentService.deleteGoalKPI(kpiId)
      if (result?.success) {
        if (activeTaskId) clearBoundTask()
        setSelectedKpiId(null)
        setSelectedOkrId(null)
        setSelectedProjectId(null)
        await Promise.all([loadTree(), loadTaskRows()])
      }
    } finally {
      setIsSaving(false)
    }
  }

  const addOrganizationToCatalog = () => {
    const next = (newOrganizationId || '').trim()
    if (!next) return
    setOrganizationCatalog((prev) => {
      if (prev.includes(next)) return prev
      return [next, ...prev].slice(0, 20)
    })
    setOrganizationId(next)
    setNewOrganizationId('')
  }

  const renameCurrentOrganization = () => {
    const next = window.prompt('重命名当前组织', organizationId)
    if (!next) return
    const normalized = next.trim()
    if (!normalized || normalized === organizationId) return
    setOrganizationCatalog((prev) => {
      const replaced = prev.map((org) => (org === organizationId ? normalized : org))
      return Array.from(new Set(replaced)).slice(0, 20)
    })
    setOrganizationId(normalized)
  }

  const removeCurrentOrganizationFromCatalog = () => {
    setOrganizationCatalog((prev) => {
      const filtered = prev.filter((org) => org !== organizationId)
      if (filtered.length === 0) return ['default-org']
      return filtered
    })
    if (organizationId === 'default-org') return
    setOrganizationId('default-org')
  }

  return (
    <div className="h-full bg-black text-white overflow-hidden flex flex-col">
      <div className="h-16 border-b border-neutral-800 px-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">目标管理</h1>
          <p className="text-xs text-neutral-500 mt-0.5">KPI / OKR / 项目 / 任务分层进度</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-400">组织</span>
          <select value={organizationId} onChange={(e) => setOrganizationId(e.target.value || 'default-org')} className="bg-neutral-950 border border-neutral-700 rounded px-2.5 py-2 text-xs min-w-36">
            {organizationCatalog.map((org) => (
              <option key={org} value={org}>{org}</option>
            ))}
          </select>
          <button
            onClick={() => {
              loadTree()
              loadTaskRows()
            }}
            disabled={isLoading || taskRowsLoading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-sm disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${(isLoading || taskRowsLoading) ? 'animate-spin' : ''}`} />
            刷新
          </button>
          <details className="relative">
            <summary className="list-none cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-sm">
              组织设置
            </summary>
            <div className="absolute right-0 top-full mt-2 w-64 rounded-lg border border-neutral-700 bg-neutral-950 p-3 shadow-xl z-30">
              <p className="text-xs text-neutral-500 mb-2">管理组织目录（仅本地）</p>
              <input value={newOrganizationId} onChange={(e) => setNewOrganizationId(e.target.value)} placeholder="新组织 ID" className="w-full bg-black border border-neutral-700 rounded px-2.5 py-2 text-xs mb-2" />
              <button onClick={addOrganizationToCatalog} className="w-full rounded border border-neutral-700 hover:border-neutral-500 px-2 py-1.5 text-xs mb-1.5">
                新增组织
              </button>
              <button onClick={renameCurrentOrganization} className="w-full rounded border border-neutral-700 hover:border-neutral-500 px-2 py-1.5 text-xs mb-1.5">
                重命名当前组织
              </button>
              <button onClick={removeCurrentOrganizationFromCatalog} className="w-full rounded border border-red-500/40 text-red-300 hover:bg-red-500/10 px-2 py-1.5 text-xs">
                移除当前组织
              </button>
            </div>
          </details>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-12 gap-4 p-4">
        <div className="col-span-4 bg-neutral-950 border border-neutral-800 rounded-xl p-4 overflow-y-auto">
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-semibold">新增目标</h2>
          </div>
          <p className="text-xs text-neutral-500 mb-3">按层级逐步创建：KPI → OKR → 项目 → 任务</p>

          <div className="grid grid-cols-4 gap-2 mb-4">
            <button onClick={() => setCreateStep('kpi')} className={`rounded-md border px-2 py-1.5 text-xs ${createStep === 'kpi' ? 'border-blue-500/60 text-blue-300 bg-blue-500/10' : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'}`}>
              KPI
            </button>
            <button onClick={() => setCreateStep('okr')} className={`rounded-md border px-2 py-1.5 text-xs ${createStep === 'okr' ? 'border-blue-500/60 text-blue-300 bg-blue-500/10' : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'}`}>
              OKR
            </button>
            <button onClick={() => setCreateStep('project')} className={`rounded-md border px-2 py-1.5 text-xs ${createStep === 'project' ? 'border-blue-500/60 text-blue-300 bg-blue-500/10' : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'}`}>
              项目
            </button>
            <button onClick={() => setCreateStep('task')} className={`rounded-md border px-2 py-1.5 text-xs ${createStep === 'task' ? 'border-blue-500/60 text-blue-300 bg-blue-500/10' : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'}`}>
              任务
            </button>
          </div>

          <div className="border border-neutral-800 rounded-lg p-3 mb-5 bg-neutral-900/30 space-y-2">
            {createStep === 'kpi' ? (
              <>
                <p className="text-xs text-neutral-400">第 1 步：创建 KPI</p>
                <input value={kpiTitle} onChange={(e) => setKpiTitle(e.target.value)} placeholder="输入 KPI 标题" className="w-full bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm" />
                <button onClick={handleCreateKpi} disabled={isSaving || !kpiTitle.trim()} className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-white text-black py-2 text-sm font-medium disabled:opacity-40">
                  <Plus className="h-4 w-4" />
                  创建 KPI
                </button>
              </>
            ) : null}

            {createStep === 'okr' ? (
              <>
                <p className="text-xs text-neutral-400">第 2 步：在 KPI 下创建 OKR</p>
                <select value={selectedKpiId ?? ''} onChange={(e) => { const id = Number(e.target.value); setSelectedKpiId(Number.isNaN(id) ? null : id); setSelectedOkrId(null); setSelectedProjectId(null) }} className="w-full bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm">
                  <option value="">选择 KPI</option>
                  {kpis.map((kpi) => <option key={kpi.id} value={kpi.id}>{kpi.title}</option>)}
                </select>
                <input value={okrTitle} onChange={(e) => setOkrTitle(e.target.value)} placeholder="输入 OKR 标题" className="w-full bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm" />
                <button onClick={handleCreateOkr} disabled={isSaving || !selectedKpiId || !okrTitle.trim()} className="w-full rounded-lg bg-neutral-100 text-black py-2 text-sm font-medium disabled:opacity-40">创建 OKR</button>
              </>
            ) : null}

            {createStep === 'project' ? (
              <>
                <p className="text-xs text-neutral-400">第 3 步：在 OKR 下创建项目</p>
                <select value={selectedOkrId ?? ''} onChange={(e) => { const id = Number(e.target.value); setSelectedOkrId(Number.isNaN(id) ? null : id); setSelectedProjectId(null) }} className="w-full bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm">
                  <option value="">选择 OKR</option>
                  {(selectedKpi?.okrs || []).map((okr) => <option key={okr.id} value={okr.id}>{okr.title}</option>)}
                </select>
                <input value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)} placeholder="输入项目标题" className="w-full bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm" />
                <button onClick={handleCreateProject} disabled={isSaving || !selectedOkrId || !projectTitle.trim()} className="w-full rounded-lg bg-neutral-100 text-black py-2 text-sm font-medium disabled:opacity-40">创建项目</button>
              </>
            ) : null}

            {createStep === 'task' ? (
              <>
                <p className="text-xs text-neutral-400">第 4 步：在项目下创建任务</p>
                <select value={selectedProjectId ?? ''} onChange={(e) => { const id = Number(e.target.value); setSelectedProjectId(Number.isNaN(id) ? null : id) }} className="w-full bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm">
                  <option value="">选择项目</option>
                  {(selectedOkr?.projects || []).map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
                </select>
                <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="输入任务标题" className="w-full bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm" />
                <input value={taskAssignee} onChange={(e) => setTaskAssignee(e.target.value)} placeholder="负责人（可选）" className="w-full bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm" />
                <input value={taskDepartment} onChange={(e) => setTaskDepartment(e.target.value)} placeholder="部门（可选）" className="w-full bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm" />
                <button onClick={handleCreateTask} disabled={isSaving || !selectedProjectId || !taskTitle.trim()} className="w-full rounded-lg bg-neutral-100 text-black py-2 text-sm font-medium disabled:opacity-40">创建任务</button>
              </>
            ) : null}
          </div>

          <div className="border-t border-neutral-800 pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">会话联动</h3>
              {activeTaskId ? <button onClick={clearBoundTask} className="text-xs text-neutral-300 hover:text-white">清除绑定</button> : null}
            </div>
            <p className="text-xs text-neutral-500 mt-1">当前绑定任务：{activeTaskId ? `#${activeTaskId}` : '未绑定'}</p>
          </div>
        </div>

        <div className="col-span-8 bg-neutral-950 border border-neutral-800 rounded-xl p-4 overflow-y-auto">
          <h2 className="text-sm font-semibold mb-3">结构总览</h2>
          {kpis.length === 0 && <div className="h-24 rounded-lg border border-dashed border-neutral-700 flex items-center justify-center text-sm text-neutral-500">暂无目标，请先创建 KPI</div>}

          <div className="space-y-3">
            {kpis.map((kpi) => (
              <details key={kpi.id} open={selectedKpiId === kpi.id || kpis.length === 1} className="border border-neutral-800 rounded-lg p-3 bg-neutral-900/50">
                <summary
                  className="cursor-pointer list-none"
                  onClick={() => {
                    setSelectedKpiId(kpi.id)
                    setSelectedOkrId(null)
                    setSelectedProjectId(null)
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium hover:text-blue-300">KPI：{kpi.title}</span>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded border border-neutral-700 text-[11px] text-neutral-400">OKR {kpi.okrs.length}</span>
                      <span className="text-xs text-neutral-400">{kpi.progress.toFixed(1)}%</span>
                      <button
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          handleDeleteKpi(kpi.id)
                        }}
                        disabled={isSaving}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-40"
                        title="删除 KPI"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-neutral-800 mt-2">
                    <div className={`h-1.5 rounded-full ${progressColor(kpi.progress)}`} style={{ width: `${Math.max(3, Math.min(100, kpi.progress))}%` }} />
                  </div>
                </summary>

                <div className="mt-3 pl-3 border-l border-neutral-800 space-y-2">
                  {kpi.okrs.length === 0 ? <p className="text-xs text-neutral-500">暂无 OKR</p> : null}
                  {kpi.okrs.map((okr) => (
                    <details key={okr.id} open={selectedOkrId === okr.id} className="border border-neutral-800 rounded-lg p-2 bg-black/40">
                      <summary
                        className="cursor-pointer list-none"
                        onClick={() => {
                          setSelectedKpiId(kpi.id)
                          setSelectedOkrId(okr.id)
                          setSelectedProjectId(null)
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm hover:text-blue-300">OKR：{okr.title}</span>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded border border-neutral-700 text-[11px] text-neutral-400">项目 {okr.projects.length}</span>
                            <span className="text-xs text-neutral-500">{okr.progress.toFixed(1)}%</span>
                            <button
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                handleDeleteOkr(okr.id)
                              }}
                              disabled={isSaving}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-40"
                              title="删除 OKR"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      </summary>

                      <div className="mt-2 pl-3 border-l border-neutral-800 space-y-1">
                        {okr.projects.length === 0 ? <p className="text-xs text-neutral-500">暂无项目</p> : null}
                        {okr.projects.map((project) => (
                          <details key={project.id} open={selectedProjectId === project.id} className="rounded-md border border-neutral-800 px-2 py-1 bg-neutral-950">
                            <summary
                              className="cursor-pointer list-none text-sm hover:text-blue-300"
                              onClick={() => {
                                setSelectedKpiId(kpi.id)
                                setSelectedOkrId(okr.id)
                                setSelectedProjectId(project.id)
                              }}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span>项目：{project.title}（{project.progress.toFixed(1)}%）</span>
                                <div className="flex items-center gap-2">
                                  <span className="px-2 py-0.5 rounded border border-neutral-700 text-[11px] text-neutral-400">任务 {project.tasks.length}</span>
                                  <button
                                    onClick={(e) => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      handleDeleteProject(project.id)
                                    }}
                                    disabled={isSaving}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-40"
                                    title="删除项目"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                            </summary>

                            <div className="mt-1 pl-3 border-l border-neutral-800 space-y-1">
                              {project.tasks.length === 0 ? <p className="text-xs text-neutral-500">暂无任务</p> : null}
                              {project.tasks.map((task) => (
                                <div key={task.id} className="text-xs text-neutral-300 bg-black/50 rounded px-2 py-1.5">
                                  <div className="flex items-start justify-between gap-2">
                                    <span>
                                      任务：{task.title}
                                      {task.assignee ? `（${task.assignee}）` : ''}
                                      {task.department ? ` · ${task.department}` : ''}
                                    </span>
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] border ${task.status === 'done' ? 'border-green-500/40 text-green-300' : 'border-neutral-600 text-neutral-400'}`}>
                                      {task.status === 'done' ? '已完成' : '进行中'}
                                    </span>
                                  </div>
                                  <div className="mt-1.5 flex items-center gap-1">
                                    <button onClick={() => {
                                      setSelectedKpiId(kpi.id)
                                      setSelectedOkrId(okr.id)
                                      setSelectedProjectId(project.id)
                                      bindTaskToWorkbench(task.id)
                                    }} className={`px-2 py-1 rounded border inline-flex items-center gap-1 ${activeTaskId === task.id ? 'bg-blue-600/20 text-blue-300 border-blue-500/40' : 'bg-neutral-900 text-neutral-300 border-neutral-700 hover:border-blue-500/40'}`}>
                                      <Link2 className="h-3.5 w-3.5" />
                                      绑定
                                    </button>
                                    <button onClick={() => {
                                      setSelectedKpiId(kpi.id)
                                      setSelectedOkrId(okr.id)
                                      setSelectedProjectId(project.id)
                                      startTaskInWorkbench(task)
                                    }} className="px-2 py-1 rounded border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10">
                                      开始执行
                                    </button>
                                    {task.status === 'done' ? (
                                      <span className="text-green-400 inline-flex items-center gap-1 px-2 py-1"><CheckCircle2 className="h-3.5 w-3.5" />已完成</span>
                                    ) : (
                                      <button onClick={() => {
                                        setSelectedKpiId(kpi.id)
                                        setSelectedOkrId(okr.id)
                                        setSelectedProjectId(project.id)
                                        handleCompleteTask(task.id)
                                      }} disabled={isSaving} className="px-2 py-1 rounded bg-green-600/20 text-green-300 border border-green-500/30 hover:bg-green-600/30">完成</button>
                                    )}
                                    <button
                                      onClick={() => handleDeleteTask(task.id)}
                                      disabled={isSaving}
                                      className="px-2 py-1 rounded border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-40"
                                    >
                                      删除
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </details>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              </details>
            ))}
          </div>

          <div className="mt-6 border-t border-neutral-800 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">任务筛选（from/to）</h2>
              <button onClick={exportTasksCsv} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-neutral-700 hover:border-neutral-500">
                <Download className="h-3.5 w-3.5" />
                导出 CSV
              </button>
            </div>

            <div className="grid grid-cols-7 gap-2 mb-3">
              <input value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)} placeholder="负责人" className="bg-black border border-neutral-700 rounded px-2.5 py-2 text-xs" />
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="bg-black border border-neutral-700 rounded px-2.5 py-2 text-xs">
                <option value="">全部状态</option>
                <option value="todo">待办</option>
                <option value="done">已完成</option>
              </select>
              <select value={filterReviewStatus} onChange={(e) => setFilterReviewStatus(e.target.value)} className="bg-black border border-neutral-700 rounded px-2.5 py-2 text-xs">
                <option value="">全部验收</option>
                <option value="pending">待验收</option>
                <option value="accepted">已验收</option>
                <option value="rejected">已驳回</option>
              </select>
              <input type="datetime-local" value={filterFromTime} onChange={(e) => setFilterFromTime(e.target.value)} className="bg-black border border-neutral-700 rounded px-2.5 py-2 text-xs" />
              <input type="datetime-local" value={filterToTime} onChange={(e) => setFilterToTime(e.target.value)} className="bg-black border border-neutral-700 rounded px-2.5 py-2 text-xs" />
              <button onClick={loadTaskRows} className="bg-neutral-900 border border-neutral-700 rounded px-2.5 py-2 text-xs hover:bg-neutral-800">应用筛选</button>
            </div>

            <div className="mb-3 flex items-center gap-2">
              <button
                onClick={quickFilterPendingReview}
                className="px-2.5 py-1.5 text-xs rounded border border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
              >
                {filterReviewStatus === 'pending' ? '查看全部任务' : '仅看待验收'}
              </button>
              <input
                value={batchReviewReason}
                onChange={(e) => setBatchReviewReason(e.target.value)}
                placeholder="批量验收备注（可选）"
                className="flex-1 bg-black border border-neutral-700 rounded px-2.5 py-1.5 text-xs"
              />
              <button
                onClick={() => handleBatchReview('accept')}
                disabled={isReviewing || selectedTaskIds.length === 0}
                className="px-2.5 py-1.5 text-xs rounded border border-green-500/40 text-green-300 hover:bg-green-500/10 disabled:opacity-50"
              >
                批量验收通过（{selectedTaskIds.length}）
              </button>
              <button
                onClick={() => handleBatchReview('reject')}
                disabled={isReviewing || selectedTaskIds.length === 0}
                className="px-2.5 py-1.5 text-xs rounded border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-50"
              >
                批量驳回返工
              </button>
            </div>

            <div className="max-h-56 overflow-y-auto border border-neutral-800 rounded">
              {taskRowsLoading ? (
                <div className="p-3 text-xs text-neutral-500">加载中...</div>
              ) : taskRows.length === 0 ? (
                <div className="p-3 text-xs text-neutral-500">当前筛选无任务</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-neutral-900/60 text-neutral-400">
                    <tr>
                      <th className="text-left p-2">
                        <input
                          type="checkbox"
                          checked={taskRows.length > 0 && selectedTaskIds.length === taskRows.length}
                          onChange={(e) => toggleSelectAllVisibleTasks(e.target.checked)}
                        />
                      </th>
                      <th className="text-left p-2">任务</th>
                      <th className="text-left p-2">负责人</th>
                      <th className="text-left p-2">状态</th>
                      <th className="text-left p-2">更新时间</th>
                      <th className="text-left p-2">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taskRows.map((row) => (
                      <tr key={row.id} className="border-t border-neutral-800">
                        <td className="p-2">
                          <input
                            type="checkbox"
                            checked={selectedTaskIds.includes(row.id)}
                            onChange={(e) => toggleTaskSelected(row.id, e.target.checked)}
                          />
                        </td>
                        <td className="p-2">
                          <div>{row.title}</div>
                          <div className="text-[11px] text-neutral-500">{row.kpi_title} / {row.okr_title} / {row.project_title}</div>
                        </td>
                        <td className="p-2">{row.assignee || '-'}</td>
                        <td className="p-2">{row.department || '-'}</td>
                        <td className="p-2">
                          <div>{row.status}</div>
                          <div className="text-[11px] text-neutral-500">{reviewStatusLabel(row.review_status)}</div>
                        </td>
                        <td className="p-2">{toDatetimeLocal(row.updated_at).replace('T', ' ')}</td>
                        <td className="p-2">
                          <div className="flex items-center gap-1">
                            <button onClick={() => replayTaskAudit(row)} className="inline-flex items-center gap-1 px-2 py-1 rounded border border-neutral-700 hover:border-blue-500/40 text-neutral-300 hover:text-blue-300">
                              <FileText className="h-3.5 w-3.5" />
                              详情/回放
                            </button>
                            <button onClick={() => startTaskInWorkbench(row)} className="inline-flex items-center gap-1 px-2 py-1 rounded border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10">
                              开始
                            </button>
                            <button
                              onClick={() => handleDeleteTask(row.id)}
                              disabled={isSaving}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-40"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>

      {detailTask && (
        <div className="fixed inset-0 z-40 bg-black/55 flex justify-end">
          <div className="w-[560px] h-full bg-neutral-950 border-l border-neutral-800 p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base font-semibold">任务详情</h3>
                <p className="text-xs text-neutral-500">#{detailTask.id} {detailTask.title}</p>
              </div>
              <button onClick={() => setDetailTask(null)} className="p-1 rounded hover:bg-neutral-800">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="text-xs text-neutral-300 bg-neutral-900 border border-neutral-800 rounded p-3 space-y-1">
              <p>负责人：{detailTask.assignee || '-'}</p>
              <p>状态：{detailTask.status}</p>
              <p>进度：{detailTask.progress}%</p>
              <p>验收：{reviewStatusLabel(detailTask.review_status)}</p>
              <p>验收人：{detailTask.reviewed_by || '-'}</p>
              <p>验收时间：{detailTask.reviewed_at || '-'}</p>
              <p>层级：{detailTask.kpi_title} / {detailTask.okr_title} / {detailTask.project_title}</p>
            </div>

            <div className="mt-3 border border-neutral-800 rounded p-3">
              <p className="text-xs font-medium text-neutral-200">人工验收</p>
              <textarea
                value={reviewReason}
                onChange={(e) => setReviewReason(e.target.value)}
                rows={3}
                placeholder="填写验收备注或驳回原因（可选）"
                className="mt-2 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-200 outline-none focus:border-blue-500"
              />
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => handleReviewTask(detailTask.id, 'accept')}
                  disabled={isReviewing}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded border border-green-500/40 text-green-300 hover:bg-green-500/10 disabled:opacity-50"
                >
                  验收通过
                </button>
                <button
                  onClick={() => handleReviewTask(detailTask.id, 'reject')}
                  disabled={isReviewing}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                >
                  驳回返工
                </button>
                {isReviewing && <span className="text-[11px] text-neutral-500">提交中...</span>}
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button onClick={() => replayTaskAudit(detailTask)} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded border border-blue-500/40 text-blue-300 hover:bg-blue-500/10">
                <RefreshCw className={`h-3.5 w-3.5 ${auditLoading ? 'animate-spin' : ''}`} />
                一键回放任务审计日志
              </button>
              <button onClick={exportTaskAuditJson} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded border border-neutral-700 text-neutral-300 hover:border-neutral-500">
                <Download className="h-3.5 w-3.5" />
                导出任务日志 JSON
              </button>
              <button onClick={() => startTaskInWorkbench(detailTask)} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10">
                开始执行
              </button>
              <button
                onClick={() => handleDeleteTask(detailTask.id)}
                disabled={isSaving}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除任务
              </button>
            </div>

            <div className="mt-3 text-xs text-neutral-500">
              关联会话：
              {Array.from(
                new Set(
                  [...auditExecutions, ...auditErrors]
                    .map((r) => (r.session_id || '').trim())
                    .filter(Boolean)
                )
              ).join('，') || '暂无'}
            </div>

            <div className="mt-4">
              <h4 className="text-sm font-semibold mb-2">执行日志</h4>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {auditLoading ? (
                  <p className="text-xs text-neutral-500">加载中...</p>
                ) : auditExecutions.length === 0 ? (
                  <p className="text-xs text-neutral-500">暂无执行日志</p>
                ) : auditExecutions.map((r, idx) => (
                  <div key={`e-${idx}`} className="border border-neutral-800 rounded p-2 text-xs">
                    <p className="text-neutral-400">{r.timestamp || r.ts}</p>
                    <p>工具：{r.tool_name || r.tool || '-'}</p>
                    <p>会话：{r.session_id || '-'}</p>
                    <p>结果：{r.success ? '成功' : '失败'}</p>
                    <p className="text-neutral-500 mt-1 break-words">{r.message || '-'}</p>
                    <details className="mt-1">
                      <summary className="cursor-pointer text-neutral-400">查看输入/输出</summary>
                      <pre className="mt-1 p-2 rounded bg-black border border-neutral-800 overflow-x-auto text-[11px] text-neutral-300">
{JSON.stringify({ input: r.tool_input || r.input, data: r.data }, null, 2)}
                      </pre>
                    </details>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <h4 className="text-sm font-semibold mb-2">错误日志</h4>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {auditLoading ? (
                  <p className="text-xs text-neutral-500">加载中...</p>
                ) : auditErrors.length === 0 ? (
                  <p className="text-xs text-neutral-500">暂无错误日志</p>
                ) : auditErrors.map((r, idx) => (
                  <div key={`x-${idx}`} className="border border-red-900/40 bg-red-950/20 rounded p-2 text-xs">
                    <p className="text-neutral-400">{r.timestamp || r.ts}</p>
                    <p>工具：{r.tool_name || r.tool || '-'}</p>
                    <p>会话：{r.session_id || '-'}</p>
                    <p className="text-red-300 mt-1 break-words">{r.error || r.message || '-'}</p>
                    <details className="mt-1">
                      <summary className="cursor-pointer text-neutral-400">查看错误输入</summary>
                      <pre className="mt-1 p-2 rounded bg-black border border-neutral-800 overflow-x-auto text-[11px] text-neutral-300">
{JSON.stringify({ input: r.tool_input || r.input }, null, 2)}
                      </pre>
                    </details>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
