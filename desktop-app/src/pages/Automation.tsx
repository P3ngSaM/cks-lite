import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Bot,
  Check,
  Copy,
  Keyboard,
  Laptop,
  Loader2,
  MousePointerClick,
  Play,
  RefreshCw,
  Send,
  TerminalSquare,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { AgentService } from '@/services/agentService'
import { TauriService } from '@/services/tauriService'
import { MoreActions, PageHeader } from '@/components/ui'
import { cn } from '@/utils/cn'
import { getNodeStatusMeta, getTaskStatusMeta, normalizeTaskStatusKey } from '@/utils/statusMeta'
import type { AgentNodeProfile, ChannelTask, GoalTaskListItem } from '@/types/agent'

type MessageState = { type: 'success' | 'error'; text: string } | null
type VisualLogLevel = 'running' | 'success' | 'warn' | 'error'
type VisualLogItem = {
  id: string
  step: number
  text: string
  level: VisualLogLevel
  action?: string
  durationMs?: number
}

const defaultFeishuConfig = {
  app_id: '',
  app_secret: '',
  verification_token: '',
  encrypt_key: '',
  domain: 'feishu',
  auto_dispatch: true,
  enable_approval_card: true,
  allowed_senders: '',
  signature_tolerance_sec: 300,
  replay_cache_size: 2048,
}

export const Automation = () => {
  const navigate = useNavigate()
  const isTauriRuntime = typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__)

  const [message, setMessage] = useState<MessageState>(null)
  const [lastCopiedText, setLastCopiedText] = useState('')

  const [feishuConfig, setFeishuConfig] = useState(defaultFeishuConfig)
  const [feishuLoading, setFeishuLoading] = useState(false)
  const [feishuSaving, setFeishuSaving] = useState(false)
  const [feishuTesting, setFeishuTesting] = useState(false)
  const [feishuDiagnosing, setFeishuDiagnosing] = useState(false)
  const [feishuSmokeRunning, setFeishuSmokeRunning] = useState(false)
  const [feishuConfigured, setFeishuConfigured] = useState(false)
  const [feishuTestChatId, setFeishuTestChatId] = useState('')
  const [feishuSmokeTaskId, setFeishuSmokeTaskId] = useState<number | null>(null)
  const [feishuDiagnostics, setFeishuDiagnostics] = useState<{
    configured?: boolean
    probe_ok?: boolean
    checks?: Array<{ id: string; title: string; status: 'pass' | 'warn' | 'fail'; detail: string; action?: string }>
    callback_urls?: { events: string; inbound: string; outbound: string }
  } | null>(null)
  const [feishuRecordsLoading, setFeishuRecordsLoading] = useState(false)
  const [feishuRecords, setFeishuRecords] = useState<ChannelTask[]>([])
  const [showFeishuConfigPanel, setShowFeishuConfigPanel] = useState(false)
  const [feishuOwnerFilter, setFeishuOwnerFilter] = useState('all')
  const [feishuStatusFilter, setFeishuStatusFilter] = useState<'all' | 'pending' | 'running' | 'waiting_approval' | 'paused' | 'completed' | 'failed' | 'canceled'>('all')
  const [goalTaskMap, setGoalTaskMap] = useState<Record<number, GoalTaskListItem>>({})
  const [seenChatMap, setSeenChatMap] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem('cks.automation.feishuSeenMap')
      if (!raw) return {}
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  })

  const [platformInfo, setPlatformInfo] = useState<{ os: string; arch: string } | null>(null)
  const [organizationId] = useState<string>(() => {
    const saved = localStorage.getItem('cks.organizationId')
    return (saved || 'default-org').trim() || 'default-org'
  })
  const [nodesLoading, setNodesLoading] = useState(false)
  const [nodes, setNodes] = useState<AgentNodeProfile[]>([])
  const [nodeCapabilityFilter, setNodeCapabilityFilter] = useState('all')
  const [nodeSelectCapability, setNodeSelectCapability] = useState('desktop')
  const [nodeSelecting, setNodeSelecting] = useState(false)
  const [selectedNode, setSelectedNode] = useState<AgentNodeProfile | null>(null)
  const [desktopBusy, setDesktopBusy] = useState(false)
  const [desktopAppName, setDesktopAppName] = useState('')
  const [desktopTargetApp, setDesktopTargetApp] = useState('')
  const [desktopText, setDesktopText] = useState('')
  const [desktopHotkey, setDesktopHotkey] = useState('')
  const [visualGoal, setVisualGoal] = useState('打开浏览器并搜索 AI 工作台')
  const [visualHistory, setVisualHistory] = useState('')
  const [visualMaxSteps, setVisualMaxSteps] = useState(3)
  const [visualRunning, setVisualRunning] = useState(false)
  const [visualLogs, setVisualLogs] = useState<VisualLogItem[]>([])
  const [visualNeedsTakeover, setVisualNeedsTakeover] = useState(false)
  const [lastFailedPlan, setLastFailedPlan] = useState<{ step: number; action: string; plan: Record<string, any> } | null>(null)
  const visualStopRequestedRef = useRef(false)
  const visualSummary = useMemo(() => {
    const summary = { success: 0, warn: 0, error: 0, running: 0 }
    for (const item of visualLogs) {
      summary[item.level] += 1
    }
    return summary
  }, [visualLogs])

  const platformHint = useMemo(() => {
    if (!platformInfo) return ''
    if (platformInfo.os === 'windows') return 'Windows 推荐应用：notepad / calc / msedge'
    if (platformInfo.os === 'macos') return 'macOS 推荐应用：TextEdit / Notes / Safari'
    return 'Linux 推荐应用：gedit / code / firefox'
  }, [platformInfo])

  const capabilityOptions = useMemo(() => {
    const set = new Set<string>()
    for (const item of nodes) {
      for (const cap of item.capabilities || []) {
        if (cap) set.add(cap)
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [nodes])

  const visibleNodes = useMemo(() => {
    if (nodeCapabilityFilter === 'all') return nodes
    return nodes.filter((item) => (item.capabilities || []).includes(nodeCapabilityFilter))
  }, [nodeCapabilityFilter, nodes])

  const feishuConversations = useMemo(() => {
    const map = new Map<string, ChannelTask[]>()
    for (const row of feishuRecords) {
      const key = (row.chat_id || '').trim() || 'unknown-chat'
      const list = map.get(key) || []
      list.push(row)
      map.set(key, list)
    }
    return Array.from(map.entries())
      .map(([chatId, rows]) => ({
        chatId,
        rows: rows.sort((a, b) => (a.id || 0) - (b.id || 0)),
      }))
      .map((conv) => {
        const latest = conv.rows[conv.rows.length - 1]
        const latestId = latest?.id || 0
        const seenId = seenChatMap[conv.chatId] || 0
        const latestMeta = (latest?.metadata && typeof latest.metadata === 'object')
          ? (latest.metadata as Record<string, unknown>)
          : {}
        const owner = String(latestMeta.assignee || latest?.sender_id || '').trim() || '未识别负责人'
        const parseGoalTaskId = (value: unknown): number | null => {
          if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value)
          if (typeof value === 'string') {
            const n = Number(value)
            if (Number.isFinite(n) && n > 0) return Math.floor(n)
            const m = value.match(/(?:task|任务)\s*#?\s*(\d{1,8})/i) || value.match(/#(\d{1,8})/)
            if (m && m[1]) return Number(m[1])
          }
          return null
        }
        const latestResult = (latest?.result && typeof latest.result === 'object')
          ? (latest.result as Record<string, unknown>)
          : {}
        const executionNodeId = String(
          latestResult.execution_node_id ||
          latestMeta.execution_node_id ||
          ''
        ).trim()
        const goalTaskId =
          parseGoalTaskId(latestMeta.goal_task_id) ||
          parseGoalTaskId(latestResult.goal_task_id) ||
          parseGoalTaskId(latestMeta.task_id) ||
          parseGoalTaskId(latestResult.task_id) ||
          parseGoalTaskId(latest?.message || '')
        return {
          ...conv,
          latestId,
          owner,
          latestStatus: normalizeTaskStatusKey(String(latest?.status || 'pending')),
          goalTaskId,
          executionNodeId,
          unread: latestId > seenId,
        }
      })
      .sort((a, b) => (b.rows[b.rows.length - 1]?.id || 0) - (a.rows[a.rows.length - 1]?.id || 0))
      .slice(0, 8)
  }, [feishuRecords, seenChatMap])
  const unreadConversationCount = useMemo(
    () => feishuConversations.filter((conv) => conv.unread).length,
    [feishuConversations]
  )
  const feishuOwnerOptions = useMemo(() => {
    const set = new Set<string>()
    for (const conv of feishuConversations) {
      if (conv.owner) set.add(conv.owner)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [feishuConversations])
  const filteredFeishuConversations = useMemo(() => {
    return feishuConversations.filter((conv) => {
      if (feishuOwnerFilter !== 'all' && conv.owner !== feishuOwnerFilter) return false
      if (feishuStatusFilter !== 'all' && conv.latestStatus !== feishuStatusFilter) return false
      return true
    })
  }, [feishuConversations, feishuOwnerFilter, feishuStatusFilter])

  const showMessage = (type: 'success' | 'error', text: string) => setMessage({ type, text })
  const markConversationSeen = (chatId: string, latestId: number) => {
    setSeenChatMap((prev) => ({
      ...prev,
      [chatId]: Math.max(prev[chatId] || 0, latestId),
    }))
  }

  const copyText = async (value: string, label: string) => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setLastCopiedText(value)
      showMessage('success', `${label}已复制`)
      window.setTimeout(() => {
        setLastCopiedText((current) => (current === value ? '' : current))
      }, 1800)
    } catch (error) {
      showMessage('error', `复制失败: ${String(error)}`)
    }
  }

  const handleControlChannelTask = async (taskId: number, action: 'pause' | 'resume' | 'cancel' | 'retry') => {
    if (!taskId) return
    try {
      const result = await AgentService.controlChannelTask(taskId, action)
      if (result?.success) {
        const actionLabel = action === 'pause' ? '暂停' : action === 'resume' ? '恢复' : action === 'cancel' ? '取消' : '重试'
        showMessage('success', `任务 #${taskId} 已${actionLabel}`)
        await loadFeishuRecords()
        return
      }
      showMessage('error', result?.error || '任务控制失败')
    } catch (error) {
      showMessage('error', `任务控制失败: ${String(error)}`)
    }
  }

  const loadFeishuConfig = async () => {
    setFeishuLoading(true)
    try {
      const result = await AgentService.getFeishuConfig()
      if (result?.success && result.config) {
        setFeishuConfig({
          app_id: result.config.app_id || '',
          app_secret: result.config.app_secret || '',
          verification_token: result.config.verification_token || '',
          encrypt_key: result.config.encrypt_key || '',
          domain: result.config.domain || 'feishu',
          auto_dispatch: Boolean(result.config.auto_dispatch),
          enable_approval_card: Boolean(result.config.enable_approval_card),
          allowed_senders: result.config.allowed_senders || '',
          signature_tolerance_sec: Number(result.config.signature_tolerance_sec || 300),
          replay_cache_size: Number(result.config.replay_cache_size || 2048),
        })
        setFeishuConfigured(Boolean(result.configured))
      }
    } catch (error) {
      showMessage('error', `飞书配置加载失败: ${String(error)}`)
    } finally {
      setFeishuLoading(false)
    }
  }

  const loadFeishuRecords = async () => {
    setFeishuRecordsLoading(true)
    try {
      const result = await AgentService.listChannelTasks({
        channel: 'feishu',
        limit: 80,
      })
      if (result?.success && Array.isArray(result.tasks)) {
        setFeishuRecords([...result.tasks].sort((a, b) => (b.id || 0) - (a.id || 0)))
      } else {
        setFeishuRecords([])
      }
    } catch (error) {
      console.error('Failed to load feishu records:', error)
      setFeishuRecords([])
    } finally {
      setFeishuRecordsLoading(false)
    }
  }

  const loadNodes = async () => {
    setNodesLoading(true)
    try {
      const result = await AgentService.listNodes({ organizationId, limit: 50 })
      if (result?.success && Array.isArray(result.items)) {
        setNodes(result.items)
      } else {
        setNodes([])
      }
    } catch (error) {
      console.error('Failed to load nodes:', error)
      setNodes([])
    } finally {
      setNodesLoading(false)
    }
  }

  const handleSelectNode = async () => {
    setNodeSelecting(true)
    try {
      const result = await AgentService.selectNode({
        organizationId,
        capability: nodeSelectCapability === 'all' ? '' : nodeSelectCapability,
        preferredOs: platformInfo?.os || '',
      })
      if (result?.success && result.node) {
        setSelectedNode(result.node)
        showMessage('success', `已选择执行节点：${result.node.display_name || result.node.node_id}`)
        return
      }
      setSelectedNode(null)
      showMessage('error', result?.error || '未找到可用执行节点')
    } catch (error) {
      setSelectedNode(null)
      showMessage('error', `节点选择失败: ${String(error)}`)
    } finally {
      setNodeSelecting(false)
    }
  }

  useEffect(() => {
    loadFeishuConfig()
    loadFeishuRecords()
    loadNodes()
    const timer = window.setInterval(() => {
      void loadFeishuRecords()
      void loadNodes()
    }, 15000)
    return () => window.clearInterval(timer)
  }, [organizationId])
  useEffect(() => {
    localStorage.setItem('cks.automation.feishuSeenMap', JSON.stringify(seenChatMap))
  }, [seenChatMap])
  useEffect(() => {
    const ids = Array.from(
      new Set(
        feishuConversations
          .map((conv) => conv.goalTaskId)
          .filter((id): id is number => typeof id === 'number' && id > 0)
      )
    )
    if (!ids.length) return
    const missingIds = ids.filter((id) => !goalTaskMap[id])
    if (!missingIds.length) return

    let cancelled = false
    const loadTaskMeta = async () => {
      const patch: Record<number, GoalTaskListItem> = {}
      for (const taskId of missingIds) {
        try {
          const result = await AgentService.listGoalTasks({ taskId, limit: 1 })
          if (result?.success && result.tasks && result.tasks[0]) {
            patch[taskId] = result.tasks[0]
          }
        } catch {
          // ignore missing tasks
        }
      }
      if (!cancelled && Object.keys(patch).length > 0) {
        setGoalTaskMap((prev) => ({ ...prev, ...patch }))
      }
    }
    void loadTaskMeta()
    return () => {
      cancelled = true
    }
  }, [feishuConversations, goalTaskMap])

  const handleSaveFeishuConfig = async () => {
    setFeishuSaving(true)
    setMessage(null)
    try {
      const result = await AgentService.updateFeishuConfig(feishuConfig)
      if (result?.success) {
        setFeishuConfigured(Boolean(result.configured))
        showMessage('success', '飞书配置已保存')
        await loadFeishuConfig()
      } else {
        showMessage('error', result?.error || '飞书配置保存失败')
      }
    } catch (error) {
      showMessage('error', `飞书配置保存失败: ${String(error)}`)
    } finally {
      setFeishuSaving(false)
    }
  }

  const handleTestFeishuConfig = async () => {
    setFeishuTesting(true)
    setMessage(null)
    try {
      const result = await AgentService.testFeishuConfig({
        send_probe: Boolean(feishuTestChatId.trim()),
        receive_id: feishuTestChatId.trim(),
        receive_id_type: 'chat_id',
        text: 'CKS 飞书连通测试消息（可忽略）',
      })
      if (!result?.success) {
        showMessage('error', result?.error || '飞书连通测试失败')
      } else if (result.probe && !result.probe.success) {
        showMessage('error', result.probe.error || '测试消息发送失败')
      } else {
        showMessage('success', feishuTestChatId.trim() ? '飞书连通成功，测试消息已发送' : '飞书鉴权成功')
      }
    } catch (error) {
      showMessage('error', `飞书连通测试失败: ${String(error)}`)
    } finally {
      setFeishuTesting(false)
    }
  }

  const handleDiagnoseFeishuConfig = async () => {
    setFeishuDiagnosing(true)
    setMessage(null)
    try {
      const result = await AgentService.diagnoseFeishuConfig(true)
      if (result?.success) {
        setFeishuDiagnostics({
          configured: result.configured,
          probe_ok: result.probe_ok,
          checks: result.checks,
          callback_urls: result.callback_urls,
        })
        const hasFail = (result.checks || []).some((item) => item.status === 'fail')
        showMessage(hasFail ? 'error' : 'success', hasFail ? '飞书诊断完成：发现阻塞项' : '飞书诊断完成：配置可用')
      } else {
        setFeishuDiagnostics(null)
        showMessage('error', result?.error || '飞书诊断失败')
      }
    } catch (error) {
      setFeishuDiagnostics(null)
      showMessage('error', `飞书诊断失败: ${String(error)}`)
    } finally {
      setFeishuDiagnosing(false)
    }
  }

  const handleRunFeishuSmoke = async () => {
    setFeishuSmokeRunning(true)
    setMessage(null)
    setFeishuSmokeTaskId(null)
    try {
      const chatId = `oc_demo_${Date.now()}`
      const enqueueResult = await AgentService.enqueueFeishuInboundTask({
        channel: 'feishu',
        sender_id: 'ou_demo_manager',
        chat_id: chatId,
        message: 'desktop 请整理桌面下载目录并生成今日简报',
        auto_dispatch: false,
        user_id: 'default-user',
        metadata: { smoke_test: true, receive_id_type: 'open_id' },
      })
      if (!enqueueResult?.success || !enqueueResult.task?.id) {
        showMessage('error', enqueueResult?.error || '联调失败：任务入队失败')
        return
      }
      const dispatchResult = await AgentService.dispatchChannelTask(enqueueResult.task.id, {
        user_id: 'default-user',
        use_memory: true,
        node_id: selectedNode?.node_id || '',
      })
      if (!dispatchResult?.success) {
        showMessage('error', dispatchResult?.error || '联调失败：任务派发失败')
        return
      }
      setFeishuSmokeTaskId(enqueueResult.task.id)
      showMessage('success', `联调成功：任务 #${enqueueResult.task.id} 已派发`)
      await loadFeishuRecords()
    } catch (error) {
      showMessage('error', `联调失败: ${String(error)}`)
    } finally {
      setFeishuSmokeRunning(false)
    }
  }

  const withDesktopGuard = async (fn: () => Promise<void>) => {
    if (!isTauriRuntime) {
      showMessage('error', '当前不是桌面运行环境，自动化仅在桌面端可用')
      return
    }
    setDesktopBusy(true)
    setMessage(null)
    try {
      await fn()
    } catch (error) {
      showMessage('error', `桌面自动化失败: ${String(error)}`)
    } finally {
      setDesktopBusy(false)
    }
  }

  const handleDetectPlatform = async () => {
    await withDesktopGuard(async () => {
      const info = await TauriService.getPlatformInfo()
      setPlatformInfo(info)
      showMessage('success', `当前平台：${info.os} (${info.arch})`)
    })
  }

  const handleOpenApplication = async () => {
    if (!desktopAppName.trim()) {
      showMessage('error', '请先输入应用名')
      return
    }
    await withDesktopGuard(async () => {
      await TauriService.openApplication(desktopAppName.trim())
      showMessage('success', `已尝试打开应用：${desktopAppName.trim()}`)
    })
  }

  const handleTypeText = async () => {
    if (!desktopText.trim()) {
      showMessage('error', '请输入要发送的文本')
      return
    }
    await withDesktopGuard(async () => {
      await TauriService.typeText(desktopText, desktopTargetApp.trim() || undefined)
      showMessage('success', '已发送文本输入')
    })
  }

  const handlePressHotkey = async () => {
    const keys = desktopHotkey
      .split(/[+,]/)
      .map((item) => item.trim())
      .filter(Boolean)
    if (!keys.length) {
      showMessage('error', '请输入快捷键，如 ctrl+s / cmd+v')
      return
    }
    await withDesktopGuard(async () => {
      await TauriService.pressHotkey(keys, desktopTargetApp.trim() || undefined)
      showMessage('success', `已发送快捷键：${keys.join(' + ')}`)
    })
  }

  const appendVisualLog = (step: number, text: string, level: VisualLogLevel, action?: string, durationMs?: number) => {
    setVisualLogs((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${step}-${prev.length}`,
        step,
        text,
        level,
        action,
        durationMs,
      },
    ])
  }

  const executeVisualAction = async (action: string, plan: Record<string, any>) => {
    if (action === 'click') {
      await TauriService.mouseClick(Number(plan.x || 0), Number(plan.y || 0), String(plan.button || 'left'))
      return
    }
    if (action === 'type') {
      await TauriService.typeText(String(plan.text || ''), desktopTargetApp.trim() || undefined)
      return
    }
    if (action === 'hotkey') {
      const keys = String(plan.hotkey || '')
        .split(/[+,]/)
        .map((k) => k.trim())
        .filter(Boolean)
      await TauriService.pressHotkey(keys, desktopTargetApp.trim() || undefined)
      return
    }
    if (action === 'scroll') {
      await TauriService.mouseScroll(Number(plan.amount || 1))
      return
    }
    if (action === 'wait') {
      await new Promise((resolve) => window.setTimeout(resolve, 900))
      return
    }
    throw new Error(`未支持的视觉动作: ${action}`)
  }

  const handleRunVisualLoop = async () => {
    if (!visualGoal.trim()) {
      showMessage('error', '请先输入视觉执行目标')
      return
    }
    if (!isTauriRuntime) {
      showMessage('error', '视觉循环仅支持桌面端运行')
      return
    }
    const maxSteps = Math.max(1, Math.min(visualMaxSteps || 3, 8))
    setVisualRunning(true)
    setVisualLogs([])
    setVisualNeedsTakeover(false)
    setLastFailedPlan(null)
    setMessage(null)
    visualStopRequestedRef.current = false
    let rollingHistory = visualHistory
    const actionFailures: Record<string, number> = {}
    let lastActionSignature = ''
    let repeatedActionCount = 0
    try {
      for (let step = 1; step <= maxSteps; step += 1) {
        if (visualStopRequestedRef.current) {
          appendVisualLog(step, '用户已请求停止，视觉循环结束', 'success', 'stop')
          showMessage('success', '已停止视觉循环')
          break
        }
        const shot = await TauriService.captureScreen()
        const planResult = await AgentService.visionNextAction({
          image_path: shot.path,
          goal: visualGoal.trim(),
          history: rollingHistory,
        })
        if (!planResult?.success || !planResult?.data?.plan) {
          const reason = planResult?.error || '视觉规划失败'
          appendVisualLog(step, `❌ ${reason}`, 'error', 'plan')
          setVisualNeedsTakeover(true)
          showMessage('error', `视觉循环中断：${reason}`)
          break
        }

        const plan = planResult.data.plan as Record<string, any>
        const action = String(plan.action || '').toLowerCase()
        const reason = String(plan.reason || '')
        const confidence = Number(plan.confidence ?? 0.5)
        const actionSignature = [
          action,
          Number(plan.x || 0),
          Number(plan.y || 0),
          String(plan.button || ''),
          String(plan.hotkey || ''),
          String(plan.text || '').slice(0, 24),
        ].join('|')
        if (actionSignature === lastActionSignature) {
          repeatedActionCount += 1
        } else {
          repeatedActionCount = 0
        }
        lastActionSignature = actionSignature

        if (repeatedActionCount >= 2 && (action === 'click' || action === 'wait' || action === 'scroll')) {
          await TauriService.mouseScroll(-1)
          appendVisualLog(step, '检测到重复动作，自动滚动后重新规划', 'warn', action)
          rollingHistory = `${rollingHistory}\n[step ${step}] repeated_action=${action}; auto_scroll=-1`.trim()
          if (repeatedActionCount >= 4) {
            setVisualNeedsTakeover(true)
            showMessage('error', '视觉循环出现重复动作，建议转入工作台接管')
            break
          }
          continue
        }
        appendVisualLog(step, `${action || 'unknown'} | ${reason || '无说明'}`, 'running', action)
        rollingHistory = `${rollingHistory}\n[step ${step}] action=${action}; reason=${reason}`.trim()

        if (action === 'done') {
          appendVisualLog(step, '视觉模型判断目标已达成', 'success', action)
          showMessage('success', `视觉循环完成：第 ${step} 步已达成目标`)
          break
        }
        if (action === 'click' && Number.isFinite(confidence) && confidence < 0.35) {
          await TauriService.mouseScroll(-1)
          appendVisualLog(step, `低置信度(${confidence.toFixed(2)})，先下滚再重定位`, 'warn', action)
          rollingHistory = `${rollingHistory}\n[step ${step}] low_confidence=${confidence.toFixed(2)}; auto_scroll=-1`.trim()
          continue
        }
        try {
          const startedAt = Date.now()
          await executeVisualAction(action, plan)
          const durationMs = Date.now() - startedAt
          appendVisualLog(step, `动作执行成功（耗时 ${durationMs}ms）`, 'success', action, durationMs)
          if (action) actionFailures[action] = 0
        } catch (stepError) {
          const errText = String(stepError)
          const failKey = action || 'unknown'
          actionFailures[failKey] = (actionFailures[failKey] || 0) + 1
          const failCount = actionFailures[failKey]
          setLastFailedPlan({ step, action: failKey, plan })
          appendVisualLog(step, `执行失败：${errText}`, 'error', failKey)
          // v2纠偏策略：点击失败时自动下滚后继续下一轮，让视觉模型重新定位元素
          if (action === 'click') {
            try {
              if (failCount >= 2) {
                await TauriService.mouseMove(Number(plan.x || 0), Number(plan.y || 0))
                await TauriService.mouseClick(Number(plan.x || 0), Number(plan.y || 0), String(plan.button || 'left'))
                appendVisualLog(step, '纠偏成功：二次失败后改为 move+click', 'warn', 'move+click')
                actionFailures[failKey] = 0
                setLastFailedPlan(null)
                rollingHistory = `${rollingHistory}\n[step ${step}] click_recovered=move_click`.trim()
                await new Promise((resolve) => window.setTimeout(resolve, 600))
                continue
              }
              await TauriService.mouseScroll(-2)
              appendVisualLog(step, '纠偏：已自动下滚重试定位', 'warn', 'scroll')
              rollingHistory = `${rollingHistory}\n[step ${step}] click_failed=${errText}; auto_scroll=-2`.trim()
              continue
            } catch (fallbackError) {
              appendVisualLog(step, `纠偏失败：${String(fallbackError)}`, 'error', 'fallback')
            }
          }
          showMessage('error', `视觉循环中断：第 ${step} 步执行失败`)
          setVisualNeedsTakeover(true)
          break
        }
        await new Promise((resolve) => window.setTimeout(resolve, 600))
      }
      setVisualHistory(rollingHistory)
    } catch (error) {
      setVisualNeedsTakeover(true)
      showMessage('error', `视觉循环执行失败: ${String(error)}`)
    } finally {
      setVisualRunning(false)
    }
  }

  const handleStopVisualLoop = () => {
    visualStopRequestedRef.current = true
    appendVisualLog(0, '收到停止指令，正在结束当前步骤...', 'warn', 'stop')
  }

  const handleTakeoverToWorkbench = () => {
    const latestLogs = visualLogs.slice(-6).map((item) => `第 ${item.step} 步：${item.text}`).join('\n')
    const seed = [
      `请接管视觉自动化任务：${visualGoal.trim()}`,
      selectedNode ? `优先执行节点：${selectedNode.display_name || selectedNode.node_id}` : '',
      latestLogs ? `最近执行日志：\n${latestLogs}` : '',
      '请先判断卡点原因，再继续执行并输出可验证结果。',
    ]
      .filter(Boolean)
      .join('\n\n')
    localStorage.setItem('cks.workbench.seedPrompt', seed)
    if (selectedNode?.node_id) {
      localStorage.setItem('cks.workbench.executionNodeId', selectedNode.node_id)
    } else {
      localStorage.removeItem('cks.workbench.executionNodeId')
    }
    navigate('/workbench')
  }

  const handleCopyVisualLogs = async () => {
    if (!visualLogs.length) return
    const text = visualLogs.map((item) => `第 ${item.step} 步：${item.text}`).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      showMessage('success', '视觉日志已复制，可直接发给同事或贴到工单')
    } catch {
      showMessage('error', '复制失败，请手动复制日志内容')
    }
  }

  const handleRetryFailedStep = async () => {
    if (!lastFailedPlan || visualRunning) return
    try {
      const startedAt = Date.now()
      await executeVisualAction(lastFailedPlan.action, lastFailedPlan.plan)
      const durationMs = Date.now() - startedAt
      appendVisualLog(lastFailedPlan.step, `手动重试成功（耗时 ${durationMs}ms）`, 'success', lastFailedPlan.action, durationMs)
      setLastFailedPlan(null)
      showMessage('success', `第 ${lastFailedPlan.step} 步重试成功`)
    } catch (error) {
      appendVisualLog(lastFailedPlan.step, `手动重试仍失败：${String(error)}`, 'error', lastFailedPlan.action)
      showMessage('error', `重试失败：${String(error)}`)
    }
  }

  const getVisualActionIcon = (action?: string) => {
    const normalized = String(action || '').toLowerCase()
    if (normalized === 'click' || normalized === 'move+click') return MousePointerClick
    if (normalized === 'type' || normalized === 'hotkey') return Keyboard
    if (normalized === 'wait' || normalized === 'scroll') return Loader2
    return Bot
  }

  return (
    <div className="h-full overflow-y-auto text-white p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <PageHeader
          title="自动化中控"
          subtitle="飞书调度 + 桌面自动化 + 会话同步视图"
          icon={<TerminalSquare className="h-5 w-5 text-cyan-300" />}
        />

        {message ? (
          <div
            className={cn(
              'rounded-lg border px-3 py-2 text-sm',
              message.type === 'success'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                : 'border-rose-500/40 bg-rose-500/10 text-rose-200'
            )}
          >
            {message.text}
          </div>
        ) : null}

        <div className="rounded-lg border border-neutral-800 bg-neutral-950/80 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Bot className="h-4 w-4 text-indigo-300" />
              飞书调度
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFeishuConfigPanel((prev) => !prev)}
                className="cks-btn cks-btn-secondary cks-focus-ring cks-transition-fast"
              >
                {showFeishuConfigPanel ? '收起配置' : '展开配置'}
              </button>
              <span
                className={cn(
                  'text-[11px] px-2 py-0.5 rounded-full border',
                  feishuConfigured
                    ? 'border-emerald-600/60 bg-emerald-500/15 text-emerald-200'
                    : 'border-amber-600/60 bg-amber-500/15 text-amber-200'
                )}
              >
                {feishuConfigured ? '已配置' : '未配置'}
              </span>
              <button
                onClick={loadFeishuConfig}
                disabled={feishuLoading}
                className="cks-btn cks-btn-secondary cks-focus-ring cks-transition-fast disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${feishuLoading ? 'animate-spin' : ''}`} />
                刷新
              </button>
            </div>
          </div>
          {showFeishuConfigPanel && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input value={feishuConfig.app_id} onChange={(e) => setFeishuConfig((p) => ({ ...p, app_id: e.target.value }))} placeholder="App ID" className="cks-input px-3 py-2" />
                <input value={feishuConfig.app_secret} onChange={(e) => setFeishuConfig((p) => ({ ...p, app_secret: e.target.value }))} placeholder="App Secret" className="cks-input px-3 py-2" />
                <input value={feishuConfig.verification_token} onChange={(e) => setFeishuConfig((p) => ({ ...p, verification_token: e.target.value }))} placeholder="Verification Token" className="cks-input px-3 py-2" />
                <input value={feishuConfig.encrypt_key} onChange={(e) => setFeishuConfig((p) => ({ ...p, encrypt_key: e.target.value }))} placeholder="Encrypt Key" className="cks-input px-3 py-2" />
                <input value={feishuConfig.allowed_senders} onChange={(e) => setFeishuConfig((p) => ({ ...p, allowed_senders: e.target.value }))} placeholder="允许发送者 open_id（逗号分隔）" className="cks-input px-3 py-2 md:col-span-2" />
              </div>

              <div className="flex flex-wrap gap-2">
                <input
                  value={feishuTestChatId}
                  onChange={(e) => setFeishuTestChatId(e.target.value)}
                  placeholder="测试 Chat ID（可空，仅鉴权）"
                  className="flex-1 min-w-[220px] cks-input px-3 py-2"
                />
                <MoreActions
                  label="联调工具"
                  buttonClassName="cks-btn cks-btn-secondary cks-focus-ring cks-transition-fast"
                  items={[
                    {
                      key: 'diagnose',
                      label: feishuDiagnosing ? '诊断中...' : '一键诊断',
                      onClick: handleDiagnoseFeishuConfig,
                      disabled: feishuDiagnosing,
                    },
                    {
                      key: 'test',
                      label: feishuTesting ? '测试中...' : '测试连通',
                      onClick: handleTestFeishuConfig,
                      disabled: feishuTesting,
                    },
                    {
                      key: 'smoke',
                      label: feishuSmokeRunning ? '联调中...' : '一键联调',
                      onClick: handleRunFeishuSmoke,
                      icon: <Play className="h-3.5 w-3.5" />,
                      disabled: feishuSmokeRunning,
                    },
                  ]}
                />
                <button onClick={handleSaveFeishuConfig} disabled={feishuSaving} className="cks-btn cks-btn-primary cks-focus-ring cks-transition-fast disabled:opacity-50">
                  {feishuSaving ? '保存中...' : '保存配置'}
                </button>
              </div>
            </>
          )}

          {feishuSmokeTaskId ? (
            <div className="rounded border border-fuchsia-500/30 bg-fuchsia-500/10 p-2 text-xs text-fuchsia-100">
              联调任务 #{feishuSmokeTaskId} 已创建：
              <div className="mt-2 flex gap-2">
                <button onClick={() => navigate(`/workbench?channel_task_id=${feishuSmokeTaskId}&from=feishu_smoke`)} className="cks-btn cks-btn-secondary cks-focus-ring cks-transition-fast border-fuchsia-400/50 text-fuchsia-100 hover:bg-fuchsia-500/20">
                  打开工作台
                </button>
                <button onClick={() => navigate(`/board?channel_task_id=${feishuSmokeTaskId}&from=feishu_smoke`)} className="cks-btn cks-btn-secondary cks-focus-ring cks-transition-fast border-fuchsia-400/50 text-fuchsia-100 hover:bg-fuchsia-500/20">
                  打开老板看板
                </button>
              </div>
            </div>
          ) : null}

          {feishuDiagnostics ? (
            <div className="rounded border border-neutral-800 bg-black/30 p-3 space-y-2">
              <div className="text-xs text-neutral-300 space-y-1">
                {feishuDiagnostics.callback_urls?.events ? (
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-500">事件回调</span>
                    <code className="text-cyan-200 truncate flex-1">{feishuDiagnostics.callback_urls.events}</code>
                    <button onClick={() => copyText(feishuDiagnostics.callback_urls?.events || '', '事件回调地址')} className="cks-btn cks-btn-secondary cks-focus-ring cks-transition-fast">
                      {lastCopiedText === feishuDiagnostics.callback_urls.events ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {lastCopiedText === feishuDiagnostics.callback_urls.events ? '已复制' : '复制'}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-neutral-800 bg-neutral-950/80 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Bot className="h-4 w-4 text-cyan-300" />
              飞书聊天记录（桌面端同步）
            </h2>
            <div className="flex items-center gap-2">
              {unreadConversationCount > 0 ? (
                <span className="text-[11px] px-2 py-0.5 rounded border border-fuchsia-500/50 bg-fuchsia-500/10 text-fuchsia-200">
                  新进展 {unreadConversationCount}
                </span>
              ) : null}
              <button
                onClick={loadFeishuRecords}
                disabled={feishuRecordsLoading}
                className="cks-btn cks-btn-secondary cks-focus-ring cks-transition-fast disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${feishuRecordsLoading ? 'animate-spin' : ''}`} />
                刷新记录
              </button>
            </div>
          </div>
          <p className="text-xs text-neutral-400">在飞书发出的任务和 CKS 回复会同步显示在这里。</p>
          <div className="flex flex-wrap gap-2">
            <select
              value={feishuOwnerFilter}
              onChange={(e) => setFeishuOwnerFilter(e.target.value || 'all')}
              className="cks-select px-2 py-1 text-xs"
            >
              <option value="all">全部负责人</option>
              {feishuOwnerOptions.map((owner) => (
                <option key={owner} value={owner}>
                  {owner}
                </option>
              ))}
            </select>
            <select
              value={feishuStatusFilter}
              onChange={(e) => {
                const value = e.target.value
                if (
                  value === 'pending' ||
                  value === 'running' ||
                  value === 'waiting_approval' ||
                  value === 'paused' ||
                  value === 'completed' ||
                  value === 'failed' ||
                  value === 'canceled'
                ) {
                  setFeishuStatusFilter(value)
                  return
                }
                setFeishuStatusFilter('all')
              }}
              className="cks-select px-2 py-1 text-xs"
            >
              <option value="all">全部状态</option>
              <option value="pending">待执行</option>
              <option value="running">执行中</option>
              <option value="waiting_approval">待审批</option>
              <option value="paused">已暂停</option>
              <option value="completed">已完成</option>
              <option value="failed">执行失败</option>
              <option value="canceled">已取消</option>
            </select>
          </div>

          {filteredFeishuConversations.length === 0 ? (
            <div className="text-xs text-neutral-500 border border-neutral-800 rounded p-3">
              当前筛选下暂无飞书会话记录。
            </div>
          ) : (
            <div className="space-y-3">
              {filteredFeishuConversations.map((conv) => (
                <div key={conv.chatId} className="rounded border border-neutral-800 bg-black/30 p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-300">会话：{conv.chatId} · 负责人：{conv.owner}</span>
                    <div className="flex items-center gap-2">
                      <span className={cn('px-2 py-0.5 rounded border', getTaskStatusMeta(conv.latestStatus).badgeClassName)}>
                        {getTaskStatusMeta(conv.latestStatus).label}
                      </span>
                      {conv.executionNodeId ? (
                        <span className="px-2 py-0.5 rounded border border-indigo-500/40 bg-indigo-500/10 text-indigo-200">
                          节点 {conv.executionNodeId}
                        </span>
                      ) : null}
                      {conv.unread ? (
                        <span className="px-2 py-0.5 rounded border border-fuchsia-500/50 bg-fuchsia-500/10 text-fuchsia-200">
                          新进展
                        </span>
                      ) : null}
                      <span className="text-neutral-500">消息数：{conv.rows.length}</span>
                    </div>
                  </div>
                  {conv.goalTaskId ? (
                    <div className="text-xs rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-cyan-100">
                      关联目标任务：#{conv.goalTaskId}
                      {goalTaskMap[conv.goalTaskId] ? (
                        <span className="text-cyan-200/90">
                          {' '}· {goalTaskMap[conv.goalTaskId].kpi_title} / {goalTaskMap[conv.goalTaskId].okr_title} / {goalTaskMap[conv.goalTaskId].project_title}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        if (conv.latestId > 0) {
                          navigate(`/workbench?channel_task_id=${conv.latestId}&from=feishu_chat`)
                          markConversationSeen(conv.chatId, conv.latestId)
                        }
                      }}
                      className="cks-btn cks-btn-primary"
                    >
                      回放到工作台
                    </button>
                    <button
                      onClick={() => navigate(`/board?assignee=${encodeURIComponent(conv.owner)}&from=feishu_chat`)}
                      className="cks-btn cks-btn-secondary border-blue-500/40 text-blue-200 hover:bg-blue-500/10"
                    >
                      跳转老板看板
                    </button>
                    {conv.goalTaskId ? (
                      <button
                        onClick={() => navigate(`/goals?task_id=${conv.goalTaskId}&from=feishu_chat`)}
                        className="cks-btn cks-btn-primary"
                      >
                        跳转目标任务
                      </button>
                    ) : null}
                    <button
                      onClick={() => markConversationSeen(conv.chatId, conv.latestId)}
                      className="cks-btn cks-btn-secondary"
                    >
                      标记已读
                    </button>
                    {conv.latestStatus === 'pending' ? (
                      <>
                        <button
                          onClick={() => handleControlChannelTask(conv.latestId, 'pause')}
                          className="cks-btn cks-btn-secondary border-amber-500/40 text-amber-200 hover:bg-amber-500/10"
                        >
                          暂停任务
                        </button>
                        <button
                          onClick={() => handleControlChannelTask(conv.latestId, 'cancel')}
                          className="cks-btn cks-btn-danger border-rose-500/40 text-rose-200 hover:bg-rose-500/10"
                        >
                          取消任务
                        </button>
                      </>
                    ) : null}
                    {conv.latestStatus === 'paused' ? (
                      <button
                        onClick={() => handleControlChannelTask(conv.latestId, 'resume')}
                        className="cks-btn cks-btn-secondary border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/10"
                      >
                        恢复执行
                      </button>
                    ) : null}
                    {conv.latestStatus === 'waiting_approval' ? (
                      <>
                        <button
                          onClick={() => handleControlChannelTask(conv.latestId, 'resume')}
                          className="cks-btn cks-btn-primary cks-focus-ring cks-transition-fast"
                        >
                          审批后重试
                        </button>
                        <button
                          onClick={() => handleControlChannelTask(conv.latestId, 'cancel')}
                          className="cks-btn cks-btn-danger cks-focus-ring cks-transition-fast"
                        >
                          取消任务
                        </button>
                      </>
                    ) : null}
                    {conv.latestStatus === 'failed' || conv.latestStatus === 'canceled' ? (
                      <button
                        onClick={() => handleControlChannelTask(conv.latestId, 'retry')}
                        className="cks-btn cks-btn-primary cks-focus-ring cks-transition-fast"
                      >
                        重试任务
                      </button>
                    ) : null}
                  </div>
                  <div className="space-y-2 max-h-56 overflow-auto">
                    {conv.rows.map((row) => {
                      const normalizedStatus = normalizeTaskStatusKey(row.status || '')
                      const reply = row.result && typeof row.result === 'object'
                        ? String((row.result as Record<string, unknown>).reply || (row.result as Record<string, unknown>).message || '')
                        : ''
                      const rowExecutionNodeId = row.result && typeof row.result === 'object'
                        ? String((row.result as Record<string, unknown>).execution_node_id || '').trim()
                        : ''
                      return (
                        <div key={row.id} className="space-y-1 text-xs">
                          <div className="rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-cyan-100">
                            飞书用户：{row.message}
                          </div>
                          {reply ? (
                            <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-100">
                              CKS 回复：{reply}
                            </div>
                          ) : (
                            <div className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-400">
                              CKS 状态：{getTaskStatusMeta(normalizedStatus).label}
                            </div>
                          )}
                          {rowExecutionNodeId ? (
                            <div className="rounded border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-indigo-100">
                              执行节点：{rowExecutionNodeId}
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-neutral-800 bg-neutral-950/80 p-4 space-y-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Laptop className="h-4 w-4 text-cyan-300" />
            桌面自动化（Windows/macOS）
          </h2>
          <p className="text-xs text-neutral-400">验证 openclaw 风格电脑自动化：开应用、输文本、发快捷键。</p>

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={handleDetectPlatform} disabled={desktopBusy} className="cks-btn cks-btn-secondary cks-focus-ring cks-transition-fast disabled:opacity-50">
              检测平台
            </button>
            <button onClick={loadNodes} disabled={nodesLoading} className="cks-btn cks-btn-secondary cks-focus-ring cks-transition-fast disabled:opacity-50">
              <RefreshCw className={cn('h-3.5 w-3.5', nodesLoading ? 'animate-spin' : '')} />
              刷新节点
            </button>
            {platformInfo ? <span className="text-xs text-neutral-300">{platformInfo.os} / {platformInfo.arch}</span> : null}
            {platformHint ? <span className="text-xs text-neutral-500">{platformHint}</span> : null}
          </div>

          <div className="rounded border border-neutral-800 bg-black/30 p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-neutral-400">执行节点（组织：{organizationId}）</span>
              <select
                value={nodeCapabilityFilter}
                onChange={(e) => setNodeCapabilityFilter(e.target.value)}
                className="cks-select px-2 py-1 text-xs"
              >
                <option value="all">全部能力</option>
                {capabilityOptions.map((cap) => (
                  <option key={cap} value={cap}>{cap}</option>
                ))}
              </select>
              <span className="text-xs text-neutral-500">在线/繁忙/离线：{nodes.length}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-neutral-500">自动调度能力：</span>
              <select
                value={nodeSelectCapability}
                onChange={(e) => setNodeSelectCapability(e.target.value)}
                className="cks-select px-2 py-1 text-xs"
              >
                <option value="desktop">desktop</option>
                <option value="terminal">terminal</option>
                <option value="vision">vision</option>
                <option value="all">all</option>
              </select>
              <button
                onClick={handleSelectNode}
                disabled={nodeSelecting}
                className="cks-btn cks-btn-primary cks-focus-ring cks-transition-fast disabled:opacity-50"
              >
                {nodeSelecting ? '选择中...' : '自动选择节点'}
              </button>
              {selectedNode ? (
                <span className="text-xs text-emerald-300">
                  当前节点：{selectedNode.display_name || selectedNode.node_id}
                </span>
              ) : null}
            </div>
            {nodesLoading ? (
              <p className="text-xs text-neutral-500">正在加载节点...</p>
            ) : visibleNodes.length === 0 ? (
              <p className="text-xs text-neutral-500">暂无节点，可通过 /nodes/register 注册 Windows/macOS 执行节点。</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {visibleNodes.slice(0, 6).map((item) => (
                  <div key={item.node_id} className="rounded border border-neutral-800 bg-neutral-950/70 p-2 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-neutral-200 truncate">{item.display_name || item.node_id}</span>
                      <span className={cn('px-1.5 py-0.5 rounded border', getNodeStatusMeta(item.status || '').badgeClassName)}>
                        {getNodeStatusMeta(item.status || '').label}
                      </span>
                    </div>
                    <div className="text-neutral-500">{item.os || '-'} / {item.arch || '-'}</div>
                    <div className="text-neutral-500 truncate">{item.host || '-'}</div>
                    <div className="text-cyan-300 truncate">
                      能力：{(item.capabilities || []).length ? (item.capabilities || []).join('、') : '-'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <input
              value={desktopAppName}
              onChange={(e) => setDesktopAppName(e.target.value)}
              placeholder="应用名（如 notepad / TextEdit）"
              className="cks-input px-3 py-2"
            />
            <button onClick={handleOpenApplication} disabled={desktopBusy} className="cks-btn cks-btn-primary cks-focus-ring cks-transition-fast disabled:opacity-50">
              <Play className="h-3.5 w-3.5" />
              打开应用
            </button>
            <input
              value={desktopTargetApp}
              onChange={(e) => setDesktopTargetApp(e.target.value)}
              placeholder="目标应用（可选，输入/快捷键前激活）"
              className="cks-input px-3 py-2"
            />
            <input
              value={desktopHotkey}
              onChange={(e) => setDesktopHotkey(e.target.value)}
              placeholder="快捷键（如 ctrl+s / cmd+v）"
              className="cks-input px-3 py-2"
            />
          </div>

          <textarea
            value={desktopText}
            onChange={(e) => setDesktopText(e.target.value)}
            rows={4}
            placeholder="要输入的文本内容"
            className="w-full cks-input px-3 py-2"
          />

          <div className="flex flex-wrap gap-2">
            <button onClick={handleTypeText} disabled={desktopBusy} className="cks-btn cks-btn-primary cks-focus-ring cks-transition-fast disabled:opacity-50">
              <Send className="h-3.5 w-3.5" />
              输入文本
            </button>
            <button onClick={handlePressHotkey} disabled={desktopBusy} className="cks-btn cks-btn-secondary cks-focus-ring cks-transition-fast disabled:opacity-50">
              发送快捷键
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-neutral-800 bg-neutral-950/80 p-4 space-y-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Bot className="h-4 w-4 text-fuchsia-300" />
            视觉循环执行器（MiniMax）
          </h2>
          <p className="text-xs text-neutral-400">流程：截图 → 视觉规划下一步 → 执行动作 → 再截图（最多 N 步）。</p>

          <input
            value={visualGoal}
            onChange={(e) => setVisualGoal(e.target.value)}
            placeholder="输入目标，例如：打开浏览器搜索 AI 工作台并打开第一条结果"
            className="w-full cks-input px-3 py-2"
          />
          <textarea
            value={visualHistory}
            onChange={(e) => setVisualHistory(e.target.value)}
            rows={3}
            placeholder="可选：执行历史/失败信息，帮助视觉模型纠错"
            className="w-full cks-input px-3 py-2"
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">最多步数</span>
            <input
              type="number"
              value={visualMaxSteps}
              min={1}
              max={8}
              onChange={(e) => setVisualMaxSteps(Number(e.target.value || 3))}
              className="cks-input w-24 px-2 py-1 text-sm"
            />
            <button
              onClick={handleRunVisualLoop}
              disabled={visualRunning}
              className="cks-btn cks-btn-secondary border-fuchsia-500/40 text-fuchsia-300 hover:bg-fuchsia-500/10 disabled:opacity-50"
            >
              {visualRunning ? '执行中...' : '开始视觉循环'}
            </button>
            {visualRunning ? (
              <button
                onClick={handleStopVisualLoop}
                className="cks-btn cks-btn-secondary border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
              >
                停止循环
              </button>
            ) : null}
          </div>
          {visualLogs.length > 0 ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
                <span className="px-2 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-200">成功 {visualSummary.success}</span>
                <span className="px-2 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-200">纠偏 {visualSummary.warn}</span>
                <span className="px-2 py-0.5 rounded border border-rose-500/30 bg-rose-500/10 text-rose-200">失败 {visualSummary.error}</span>
                <span className="px-2 py-0.5 rounded border border-cyan-500/30 bg-cyan-500/10 text-cyan-200">进行中 {visualSummary.running}</span>
                <button
                  onClick={handleCopyVisualLogs}
                  className="ml-auto cks-btn cks-btn-secondary"
                >
                  <Copy className="h-3 w-3" />
                  复制日志
                </button>
              </div>
              <div className="max-h-52 overflow-auto rounded border border-neutral-800 bg-black/40 p-2 space-y-1.5">
                {visualLogs.map((item) => {
                  const ActionIcon = getVisualActionIcon(item.action)
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        'rounded border px-2 py-1.5 text-xs flex items-start gap-2',
                        item.level === 'error'
                          ? 'border-rose-500/40 bg-rose-500/10 text-rose-100'
                          : item.level === 'warn'
                            ? 'border-amber-500/40 bg-amber-500/10 text-amber-100'
                            : item.level === 'success'
                              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
                              : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-100'
                      )}
                    >
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/30 border border-white/10">#{item.step}</span>
                      <ActionIcon className={cn('h-3.5 w-3.5 mt-0.5 shrink-0', item.action === 'wait' ? 'animate-spin' : '')} />
                      <span className="leading-relaxed break-words flex-1">{item.text}</span>
                      {item.durationMs ? <span className="text-[10px] opacity-80">{item.durationMs}ms</span> : null}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}
          {!visualRunning && lastFailedPlan ? (
            <button
              onClick={handleRetryFailedStep}
              className="cks-btn cks-btn-secondary border-amber-500/40 text-amber-300 hover:bg-amber-500/10 inline-flex items-center gap-1"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              重试失败步骤（第 {lastFailedPlan.step} 步）
            </button>
          ) : null}
          {!visualRunning && visualNeedsTakeover ? (
            <button
              onClick={handleTakeoverToWorkbench}
              className="cks-btn cks-btn-primary"
            >
              转到工作台接管任务
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
