import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Download, Link2, Plus, RefreshCw, Target } from 'lucide-react'
import { AgentService } from '@/services/agentService'
import type { GoalKPI, GoalTaskListItem } from '@/types/agent'

const ACTIVE_GOAL_TASK_KEY = 'cks.activeGoalTaskId'

const progressColor = (value: number) => {
  if (value >= 80) return 'bg-green-500'
  if (value >= 40) return 'bg-yellow-500'
  return 'bg-blue-500'
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
  const [kpis, setKpis] = useState<GoalKPI[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [selectedKpiId, setSelectedKpiId] = useState<number | null>(null)
  const [selectedOkrId, setSelectedOkrId] = useState<number | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null)

  const [kpiTitle, setKpiTitle] = useState('')
  const [okrTitle, setOkrTitle] = useState('')
  const [projectTitle, setProjectTitle] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskAssignee, setTaskAssignee] = useState('')

  const [filterAssignee, setFilterAssignee] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterFromTime, setFilterFromTime] = useState('')
  const [filterToTime, setFilterToTime] = useState('')
  const [taskRows, setTaskRows] = useState<GoalTaskListItem[]>([])
  const [taskRowsLoading, setTaskRowsLoading] = useState(false)

  const loadTree = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await AgentService.getGoalsTree()
      if (result?.success && result.data) {
        setKpis(result.data.kpis)
      }
    } catch (error) {
      console.error('Failed to load goals tree:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const loadTaskRows = useCallback(async () => {
    setTaskRowsLoading(true)
    try {
      const result = await AgentService.listGoalTasks({
        assignee: filterAssignee.trim() || undefined,
        status: filterStatus || undefined,
        fromTime: toIso(filterFromTime) || undefined,
        toTime: toIso(filterToTime) || undefined,
        limit: 500,
      })
      if (result?.success && result.tasks) {
        setTaskRows(result.tasks)
      }
    } catch (error) {
      console.error('Failed to load filtered tasks:', error)
    } finally {
      setTaskRowsLoading(false)
    }
  }, [filterAssignee, filterStatus, filterFromTime, filterToTime])

  useEffect(() => {
    loadTree()
    loadTaskRows()
    const raw = localStorage.getItem(ACTIVE_GOAL_TASK_KEY)
    const parsed = raw ? Number(raw) : NaN
    setActiveTaskId(Number.isFinite(parsed) ? parsed : null)
  }, [loadTree, loadTaskRows])

  useEffect(() => {
    if (!selectedKpiId && kpis.length > 0) {
      setSelectedKpiId(kpis[0].id)
    }
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
      const result = await AgentService.createKPI(title)
      if (result?.success) {
        setKpiTitle('')
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
      const result = await AgentService.createGoalTask(selectedProjectId, title, '', taskAssignee.trim())
      if (result?.success) {
        setTaskTitle('')
        setTaskAssignee('')
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

  const bindTaskToWorkbench = (taskId: number) => {
    localStorage.setItem(ACTIVE_GOAL_TASK_KEY, String(taskId))
    window.dispatchEvent(new Event('storage'))
    setActiveTaskId(taskId)
  }

  const clearBoundTask = () => {
    localStorage.removeItem(ACTIVE_GOAL_TASK_KEY)
    window.dispatchEvent(new Event('storage'))
    setActiveTaskId(null)
  }

  const exportTasksCsv = () => {
    const header = [
      'id',
      'kpi_title',
      'okr_title',
      'project_title',
      'title',
      'assignee',
      'status',
      'progress',
      'updated_at',
    ]
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

  return (
    <div className="h-full bg-black text-white overflow-hidden flex flex-col">
      <div className="h-16 border-b border-neutral-800 px-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">目标管理</h1>
          <p className="text-xs text-neutral-500 mt-0.5">KPI / OKR / 项目 / 任务分层进度</p>
        </div>
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
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-12 gap-4 p-4">
        <div className="col-span-4 bg-neutral-950 border border-neutral-800 rounded-xl p-4 overflow-y-auto">
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-semibold">新增目标</h2>
          </div>

          <div className="space-y-2 mb-4">
            <input
              value={kpiTitle}
              onChange={(e) => setKpiTitle(e.target.value)}
              placeholder="输入 KPI 标题"
              className="w-full bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={handleCreateKpi}
              disabled={isSaving || !kpiTitle.trim()}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-white text-black py-2 text-sm font-medium disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
              创建 KPI
            </button>
          </div>

          <div className="space-y-2 mb-4">
            <select
              value={selectedKpiId ?? ''}
              onChange={(e) => {
                const id = Number(e.target.value)
                setSelectedKpiId(Number.isNaN(id) ? null : id)
                setSelectedOkrId(null)
                setSelectedProjectId(null)
              }}
              className="w-full bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">选择 KPI 后创建 OKR</option>
              {kpis.map((kpi) => (
                <option key={kpi.id} value={kpi.id}>
                  {kpi.title}
                </option>
              ))}
            </select>
            <input
              value={okrTitle}
              onChange={(e) => setOkrTitle(e.target.value)}
              placeholder="输入 OKR 标题"
              className="w-full bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={handleCreateOkr}
              disabled={isSaving || !selectedKpiId || !okrTitle.trim()}
              className="w-full rounded-lg bg-neutral-100 text-black py-2 text-sm font-medium disabled:opacity-40"
            >
              创建 OKR
            </button>
          </div>

          <div className="space-y-2 mb-4">
            <select
              value={selectedOkrId ?? ''}
              onChange={(e) => {
                const id = Number(e.target.value)
                setSelectedOkrId(Number.isNaN(id) ? null : id)
                setSelectedProjectId(null)
              }}
              className="w-full bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">选择 OKR 后创建项目</option>
              {(selectedKpi?.okrs || []).map((okr) => (
                <option key={okr.id} value={okr.id}>
                  {okr.title}
                </option>
              ))}
            </select>
            <input
              value={projectTitle}
              onChange={(e) => setProjectTitle(e.target.value)}
              placeholder="输入项目标题"
              className="w-full bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={handleCreateProject}
              disabled={isSaving || !selectedOkrId || !projectTitle.trim()}
              className="w-full rounded-lg bg-neutral-100 text-black py-2 text-sm font-medium disabled:opacity-40"
            >
              创建项目
            </button>
          </div>

          <div className="space-y-2 mb-5">
            <select
              value={selectedProjectId ?? ''}
              onChange={(e) => {
                const id = Number(e.target.value)
                setSelectedProjectId(Number.isNaN(id) ? null : id)
              }}
              className="w-full bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">选择项目后创建任务</option>
              {(selectedOkr?.projects || []).map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </select>
            <input
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="输入任务标题"
              className="w-full bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm"
            />
            <input
              value={taskAssignee}
              onChange={(e) => setTaskAssignee(e.target.value)}
              placeholder="负责人（可选）"
              className="w-full bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={handleCreateTask}
              disabled={isSaving || !selectedProjectId || !taskTitle.trim()}
              className="w-full rounded-lg bg-neutral-100 text-black py-2 text-sm font-medium disabled:opacity-40"
            >
              创建任务
            </button>
          </div>

          <div className="border-t border-neutral-800 pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">会话联动</h3>
              {activeTaskId ? (
                <button
                  onClick={clearBoundTask}
                  className="text-xs text-neutral-300 hover:text-white"
                >
                  清除绑定
                </button>
              ) : null}
            </div>
            <p className="text-xs text-neutral-500 mt-1">
              当前绑定任务：{activeTaskId ? `#${activeTaskId}` : '未绑定'}
            </p>
          </div>
        </div>

        <div className="col-span-8 bg-neutral-950 border border-neutral-800 rounded-xl p-4 overflow-y-auto">
          <h2 className="text-sm font-semibold mb-3">结构总览</h2>
          {kpis.length === 0 && (
            <div className="h-24 rounded-lg border border-dashed border-neutral-700 flex items-center justify-center text-sm text-neutral-500">
              暂无目标，请先创建 KPI
            </div>
          )}

          <div className="space-y-3">
            {kpis.map((kpi) => (
              <div key={kpi.id} className="border border-neutral-800 rounded-lg p-3 bg-neutral-900/50">
                <div className="flex items-center justify-between gap-3">
                  <button
                    className="text-left font-medium hover:text-blue-300"
                    onClick={() => {
                      setSelectedKpiId(kpi.id)
                      setSelectedOkrId(null)
                      setSelectedProjectId(null)
                    }}
                  >
                    KPI: {kpi.title}
                  </button>
                  <span className="text-xs text-neutral-400">{kpi.progress.toFixed(1)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-neutral-800 mt-2">
                  <div
                    className={`h-1.5 rounded-full ${progressColor(kpi.progress)}`}
                    style={{ width: `${Math.max(3, Math.min(100, kpi.progress))}%` }}
                  />
                </div>

                <div className="space-y-2 mt-3">
                  {kpi.okrs.map((okr) => (
                    <div key={okr.id} className="border border-neutral-800 rounded-lg p-2 bg-black/40">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          className="text-left text-sm hover:text-blue-300"
                          onClick={() => {
                            setSelectedKpiId(kpi.id)
                            setSelectedOkrId(okr.id)
                            setSelectedProjectId(null)
                          }}
                        >
                          OKR: {okr.title}
                        </button>
                        <span className="text-xs text-neutral-500">{okr.progress.toFixed(1)}%</span>
                      </div>
                      <div className="space-y-1 mt-2">
                        {okr.projects.map((project) => (
                          <div key={project.id} className="rounded-md border border-neutral-800 px-2 py-1 bg-neutral-950">
                            <button
                              className="text-sm text-left hover:text-blue-300"
                              onClick={() => {
                                setSelectedKpiId(kpi.id)
                                setSelectedOkrId(okr.id)
                                setSelectedProjectId(project.id)
                              }}
                            >
                              项目: {project.title} ({project.progress.toFixed(1)}%)
                            </button>
                            <div className="space-y-1 mt-1">
                              {project.tasks.map((task) => (
                                <div
                                  key={task.id}
                                  className="flex items-center justify-between gap-2 text-xs text-neutral-300 bg-black/50 rounded px-2 py-1"
                                >
                                  <span>
                                    任务: {task.title}
                                    {task.assignee ? `（${task.assignee}）` : ''}
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => bindTaskToWorkbench(task.id)}
                                      className={`px-2 py-1 rounded border inline-flex items-center gap-1 ${
                                        activeTaskId === task.id
                                          ? 'bg-blue-600/20 text-blue-300 border-blue-500/40'
                                          : 'bg-neutral-900 text-neutral-300 border-neutral-700 hover:border-blue-500/40'
                                      }`}
                                    >
                                      <Link2 className="h-3.5 w-3.5" />
                                      绑定
                                    </button>
                                    {task.status === 'done' ? (
                                      <span className="text-green-400 inline-flex items-center gap-1 px-2 py-1">
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        已完成
                                      </span>
                                    ) : (
                                      <button
                                        onClick={() => handleCompleteTask(task.id)}
                                        disabled={isSaving}
                                        className="px-2 py-1 rounded bg-green-600/20 text-green-300 border border-green-500/30 hover:bg-green-600/30"
                                      >
                                        完成
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 border-t border-neutral-800 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">任务筛选（from/to）</h2>
              <button
                onClick={exportTasksCsv}
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-neutral-700 hover:border-neutral-500"
              >
                <Download className="h-3.5 w-3.5" />
                导出 CSV
              </button>
            </div>

            <div className="grid grid-cols-5 gap-2 mb-3">
              <input
                value={filterAssignee}
                onChange={(e) => setFilterAssignee(e.target.value)}
                placeholder="负责人"
                className="bg-black border border-neutral-700 rounded px-2.5 py-2 text-xs"
              />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-black border border-neutral-700 rounded px-2.5 py-2 text-xs"
              >
                <option value="">全部状态</option>
                <option value="todo">待办</option>
                <option value="done">已完成</option>
              </select>
              <input
                type="datetime-local"
                value={filterFromTime}
                onChange={(e) => setFilterFromTime(e.target.value)}
                className="bg-black border border-neutral-700 rounded px-2.5 py-2 text-xs"
              />
              <input
                type="datetime-local"
                value={filterToTime}
                onChange={(e) => setFilterToTime(e.target.value)}
                className="bg-black border border-neutral-700 rounded px-2.5 py-2 text-xs"
              />
              <button
                onClick={loadTaskRows}
                className="bg-neutral-900 border border-neutral-700 rounded px-2.5 py-2 text-xs hover:bg-neutral-800"
              >
                应用筛选
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
                      <th className="text-left p-2">任务</th>
                      <th className="text-left p-2">负责人</th>
                      <th className="text-left p-2">状态</th>
                      <th className="text-left p-2">更新时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taskRows.map((row) => (
                      <tr key={row.id} className="border-t border-neutral-800">
                        <td className="p-2">
                          <div>{row.title}</div>
                          <div className="text-[11px] text-neutral-500">
                            {row.kpi_title} / {row.okr_title} / {row.project_title}
                          </div>
                        </td>
                        <td className="p-2">{row.assignee || '-'}</td>
                        <td className="p-2">{row.status}</td>
                        <td className="p-2">{toDatetimeLocal(row.updated_at).replace('T', ' ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
