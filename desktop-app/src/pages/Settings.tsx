import { useEffect, useRef, useState } from 'react'
import { Activity, Bot, Camera, Check, Copy, Eye, EyeOff, Lock, LogOut, Mail, Play, RefreshCw, Upload, User } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore, useUserStore } from '@/stores'
import { AgentService } from '@/services/agentService'
import { TauriService, type AgentStartupDiagnostics } from '@/services/tauriService'
import { cn } from '@/utils/cn'

const avatars = [
  '/src/img/avatar1.png',
  '/src/img/avatar2.png',
  '/src/img/avatar3.png',
  '/src/img/avatar4.png',
  '/src/img/avatar5.png',
  '/src/img/avatar6.png',
  '/src/img/avatar7.png',
  '/src/img/avatar8.png',
  '/src/img/avatar9.png',
  '/src/img/avatar.png',
]

export const Settings = () => {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const updateUser = useAuthStore((state) => state.updateUser)
  const profile = useUserStore((state) => state.profile)
  const setProfile = useUserStore((state) => state.setProfile)

  const [username, setUsername] = useState(user?.username || '')
  const [email, setEmail] = useState(user?.email || '')
  const [agentName, setAgentName] = useState(profile?.agentName || '')
  const [selectedAvatar, setSelectedAvatar] = useState(profile?.agentAvatar || avatars[0])
  const [userAvatar, setUserAvatar] = useState<string>(user?.avatar || '')

  const [showPasswordSection, setShowPasswordSection] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [agentDiag, setAgentDiag] = useState<AgentStartupDiagnostics | null>(null)
  const [agentDiagLoading, setAgentDiagLoading] = useState(false)
  const [agentStartLoading, setAgentStartLoading] = useState(false)
  const [feishuConfig, setFeishuConfig] = useState({
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
  })
  const [feishuLoading, setFeishuLoading] = useState(false)
  const [feishuSaving, setFeishuSaving] = useState(false)
  const [feishuTesting, setFeishuTesting] = useState(false)
  const [feishuDiagnosing, setFeishuDiagnosing] = useState(false)
  const [feishuSmokeRunning, setFeishuSmokeRunning] = useState(false)
  const [feishuTestChatId, setFeishuTestChatId] = useState('')
  const [feishuConfigured, setFeishuConfigured] = useState(false)
  const [lastCopiedText, setLastCopiedText] = useState('')
  const [feishuSmokeTaskId, setFeishuSmokeTaskId] = useState<number | null>(null)
  const [feishuDiagnostics, setFeishuDiagnostics] = useState<{
    configured?: boolean
    probe_ok?: boolean
    checks?: Array<{ id: string; title: string; status: 'pass' | 'warn' | 'fail'; detail: string; action?: string }>
    callback_urls?: { events: string; inbound: string; outbound: string }
  } | null>(null)

  const userAvatarInputRef = useRef<HTMLInputElement>(null)
  const agentAvatarInputRef = useRef<HTMLInputElement>(null)

  const isTauriRuntime = typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__)

  useEffect(() => {
    if (user?.avatar && user.avatar !== userAvatar) {
      setUserAvatar(user.avatar)
    }
  }, [user?.avatar, userAvatar])

  const loadAgentDiagnostics = async () => {
    if (!isTauriRuntime) return
    setAgentDiagLoading(true)
    try {
      const diag = await TauriService.getAgentStartupDiagnostics()
      setAgentDiag(diag)
    } catch (error) {
      console.error('Failed to load agent diagnostics:', error)
      setAgentDiag(null)
    } finally {
      setAgentDiagLoading(false)
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
      } else {
        setFeishuConfigured(false)
      }
    } catch (error) {
      console.error('Failed to load Feishu config:', error)
      setFeishuConfigured(false)
    } finally {
      setFeishuLoading(false)
    }
  }

  useEffect(() => {
    loadAgentDiagnostics()
    loadFeishuConfig()
  }, [])

  const handleSaveFeishuConfig = async () => {
    setFeishuSaving(true)
    setMessage(null)
    try {
      const result = await AgentService.updateFeishuConfig(feishuConfig)
      if (result?.success) {
        setMessage({ type: 'success', text: '飞书配置已保存' })
        await loadFeishuConfig()
      } else {
        setMessage({ type: 'error', text: result?.error || '飞书配置保存失败' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: `飞书配置保存失败: ${String(error)}` })
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
        text: 'CKS 飞书配置测试消息（可删除）',
      })
      if (result?.success) {
        const probe = result.probe
        if (probe && !probe.success) {
          setMessage({ type: 'error', text: probe.error || '测试消息发送失败' })
        } else {
          setMessage({ type: 'success', text: feishuTestChatId.trim() ? '飞书连通成功，测试消息已发送' : '飞书鉴权连通成功' })
        }
      } else {
        setMessage({ type: 'error', text: result?.error || '飞书连通测试失败' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: `飞书连通测试失败: ${String(error)}` })
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
        setMessage({
          type: hasFail ? 'error' : 'success',
          text: hasFail ? '飞书诊断完成：发现阻塞项，请按建议修复。' : '飞书诊断完成：当前配置可用。',
        })
      } else {
        setFeishuDiagnostics(null)
        setMessage({ type: 'error', text: result?.error || '飞书诊断失败' })
      }
    } catch (error) {
      setFeishuDiagnostics(null)
      setMessage({ type: 'error', text: `飞书诊断失败: ${String(error)}` })
    } finally {
      setFeishuDiagnosing(false)
    }
  }

  const handleCopyText = async (value: string, label: string) => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setLastCopiedText(value)
      setMessage({ type: 'success', text: `${label}已复制` })
      window.setTimeout(() => {
        setLastCopiedText((current) => (current === value ? '' : current))
      }, 1800)
    } catch (error) {
      setMessage({ type: 'error', text: `复制失败: ${String(error)}` })
    }
  }

  const handleRunFeishuSmoke = async () => {
    setFeishuSmokeRunning(true)
    setMessage(null)
    setFeishuSmokeTaskId(null)
    try {
      const senderId = 'ou_demo_manager'
      const chatId = `oc_demo_${Date.now()}`
      const enqueueResult = await AgentService.enqueueFeishuInboundTask({
        channel: 'feishu',
        sender_id: senderId,
        chat_id: chatId,
        message: 'desktop 请整理桌面下载目录并生成今日简报',
        auto_dispatch: false,
        user_id: 'default-user',
        metadata: {
          smoke_test: true,
          receive_id_type: 'open_id',
        },
      })

      if (!enqueueResult?.success || !enqueueResult.task?.id) {
        setMessage({ type: 'error', text: enqueueResult?.error || '联调失败：任务入队失败' })
        return
      }

      const dispatchResult = await AgentService.dispatchChannelTask(enqueueResult.task.id, {
        user_id: 'default-user',
        use_memory: true,
      })

      if (!dispatchResult?.success) {
        setMessage({
          type: 'error',
          text: dispatchResult?.error || `联调失败：任务 ${enqueueResult.task.id} 派发失败`,
        })
        return
      }

      setMessage({
        type: 'success',
        text: `联调成功：任务 #${enqueueResult.task.id} 已派发执行，请到工作台或老板看板查看回流。`,
      })
      setFeishuSmokeTaskId(enqueueResult.task.id)
    } catch (error) {
      setMessage({ type: 'error', text: `联调失败: ${String(error)}` })
    } finally {
      setFeishuSmokeRunning(false)
    }
  }

  const handleStartAgent = async () => {
    if (!isTauriRuntime) return
    setAgentStartLoading(true)
    try {
      await TauriService.startAgentService()
    } catch (error) {
      console.error('Failed to start Agent SDK service:', error)
    } finally {
      setAgentStartLoading(false)
      await loadAgentDiagnostics()
    }
  }

  const handleSaveProfile = async () => {
    setMessage(null)
    setIsSaving(true)
    try {
      if (user) {
        updateUser({ username, email, avatar: userAvatar })
      }

      if (profile) {
        setProfile({
          ...profile,
          agentName,
          agentAvatar: selectedAvatar,
        })
      }

      if (agentName.trim()) {
        await AgentService.saveMemory({
          user_id: 'default-user',
          content: `AI 助手名称是 ${agentName}`,
          memory_type: 'preference',
        })
      }

      setMessage({ type: 'success', text: '保存成功' })
    } catch (error) {
      console.error('Save profile error:', error)
      setMessage({ type: 'error', text: '保存失败，请重试' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleChangePassword = async () => {
    setMessage(null)
    if (!currentPassword || !newPassword || !confirmPassword) {
      setMessage({ type: 'error', text: '请填写完整密码信息' })
      return
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: '两次输入的新密码不一致' })
      return
    }
    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: '新密码至少需要 6 位' })
      return
    }

    setIsSaving(true)
    try {
      await new Promise((resolve) => setTimeout(resolve, 800))
      setMessage({ type: 'success', text: '密码已更新（演示流程）' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setShowPasswordSection(false)
    } catch {
      setMessage({ type: 'error', text: '密码更新失败' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleLogout = () => {
    if (confirm('确定要退出登录吗？')) logout()
  }

  const onUploadAvatar = (setter: (value: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setter(reader.result as string)
    reader.readAsDataURL(file)
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto bg-black">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">设置中心</h1>
          <p className="text-neutral-500 text-sm">管理账号、助手形象与桌面运行状态</p>
        </div>

        {message && (
          <div
            className={cn(
              'rounded-lg px-4 py-3 border text-sm',
              message.type === 'success'
                ? 'bg-green-500/10 border-green-500/50 text-green-400'
                : 'bg-red-500/10 border-red-500/50 text-red-400'
            )}
          >
            {message.text}
          </div>
        )}

        {isTauriRuntime && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Agent 启动健康
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={loadAgentDiagnostics}
                  disabled={agentDiagLoading}
                  className="px-3 py-1.5 rounded-lg border border-neutral-700 text-xs text-neutral-300 hover:border-neutral-500 disabled:opacity-50 inline-flex items-center gap-1"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${agentDiagLoading ? 'animate-spin' : ''}`} />
                  刷新
                </button>
                <button
                  onClick={handleStartAgent}
                  disabled={agentStartLoading || !!agentDiag?.already_running}
                  className="px-3 py-1.5 rounded-lg border border-blue-500/40 text-xs text-blue-300 hover:bg-blue-500/10 disabled:opacity-50 inline-flex items-center gap-1"
                >
                  <Play className="h-3.5 w-3.5" />
                  启动后端
                </button>
              </div>
            </div>

            <div className="text-xs text-neutral-300 space-y-1">
              <p>状态：{agentDiag?.already_running ? '已运行' : '未运行'}</p>
              <p>可启动：{agentDiag?.can_start ? '是' : '否'}</p>
              <p>Python：{agentDiag?.python_launcher || '未检测到'}</p>
              <p className="break-all">SDK 路径：{agentDiag?.sdk_dir || '未找到'}</p>
            </div>

            {agentDiag?.hints?.length ? (
              <div className="mt-3 p-3 rounded border border-yellow-500/30 bg-yellow-500/10 text-yellow-200 text-xs space-y-1">
                {agentDiag.hints.map((hint, idx) => (
                  <p key={idx}>- {hint}</p>
                ))}
              </div>
            ) : null}
          </div>
        )}

        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Bot className="h-5 w-5" />
                飞书机器人配置
              </h2>
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
            </div>
            <button
              onClick={loadFeishuConfig}
              disabled={feishuLoading}
              className="px-3 py-1.5 rounded-lg border border-neutral-700 text-xs text-neutral-300 hover:border-neutral-500 disabled:opacity-50 inline-flex items-center gap-1"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${feishuLoading ? 'animate-spin' : ''}`} />
              刷新
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              value={feishuConfig.app_id}
              onChange={(e) => setFeishuConfig((prev) => ({ ...prev, app_id: e.target.value }))}
              placeholder="App ID"
              className="px-3 py-2 rounded-lg bg-black text-white border border-neutral-800 focus:border-white focus:outline-none"
            />
            <input
              value={feishuConfig.app_secret}
              onChange={(e) => setFeishuConfig((prev) => ({ ...prev, app_secret: e.target.value }))}
              placeholder="App Secret"
              className="px-3 py-2 rounded-lg bg-black text-white border border-neutral-800 focus:border-white focus:outline-none"
            />
            <input
              value={feishuConfig.verification_token}
              onChange={(e) => setFeishuConfig((prev) => ({ ...prev, verification_token: e.target.value }))}
              placeholder="Verification Token"
              className="px-3 py-2 rounded-lg bg-black text-white border border-neutral-800 focus:border-white focus:outline-none"
            />
            <input
              value={feishuConfig.encrypt_key}
              onChange={(e) => setFeishuConfig((prev) => ({ ...prev, encrypt_key: e.target.value }))}
              placeholder="Encrypt Key"
              className="px-3 py-2 rounded-lg bg-black text-white border border-neutral-800 focus:border-white focus:outline-none"
            />
            <select
              value={feishuConfig.domain}
              onChange={(e) => setFeishuConfig((prev) => ({ ...prev, domain: e.target.value || 'feishu' }))}
              className="px-3 py-2 rounded-lg bg-black text-white border border-neutral-800 focus:border-white focus:outline-none"
            >
              <option value="feishu">feishu（国内）</option>
              <option value="lark">lark（国际）</option>
            </select>
            <input
              value={feishuConfig.allowed_senders}
              onChange={(e) => setFeishuConfig((prev) => ({ ...prev, allowed_senders: e.target.value }))}
              placeholder="允许发送者 open_id 列表（逗号分隔）"
              className="px-3 py-2 rounded-lg bg-black text-white border border-neutral-800 focus:border-white focus:outline-none"
            />
            <input
              type="number"
              value={feishuConfig.signature_tolerance_sec}
              onChange={(e) => setFeishuConfig((prev) => ({ ...prev, signature_tolerance_sec: Number(e.target.value || 0) }))}
              placeholder="签名时间容差（秒）"
              className="px-3 py-2 rounded-lg bg-black text-white border border-neutral-800 focus:border-white focus:outline-none"
            />
            <input
              type="number"
              value={feishuConfig.replay_cache_size}
              onChange={(e) => setFeishuConfig((prev) => ({ ...prev, replay_cache_size: Number(e.target.value || 32) }))}
              placeholder="重放缓存大小"
              className="px-3 py-2 rounded-lg bg-black text-white border border-neutral-800 focus:border-white focus:outline-none"
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-neutral-300">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={feishuConfig.auto_dispatch}
                onChange={(e) => setFeishuConfig((prev) => ({ ...prev, auto_dispatch: e.target.checked }))}
              />
              自动派发执行
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={feishuConfig.enable_approval_card}
                onChange={(e) => setFeishuConfig((prev) => ({ ...prev, enable_approval_card: e.target.checked }))}
              />
              启用审批卡片
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              value={feishuTestChatId}
              onChange={(e) => setFeishuTestChatId(e.target.value)}
              placeholder="测试 Chat ID（可空，仅鉴权）"
              className="flex-1 min-w-[220px] px-3 py-2 rounded-lg bg-black text-white border border-neutral-800 focus:border-white focus:outline-none"
            />
            <button
              onClick={handleDiagnoseFeishuConfig}
              disabled={feishuDiagnosing}
              className="px-4 py-2 rounded-lg border border-violet-500/40 text-violet-300 hover:bg-violet-500/10 disabled:opacity-50"
            >
              {feishuDiagnosing ? '诊断中...' : '一键诊断'}
            </button>
            <button
              onClick={handleRunFeishuSmoke}
              disabled={feishuSmokeRunning}
              className="px-4 py-2 rounded-lg border border-fuchsia-500/40 text-fuchsia-300 hover:bg-fuchsia-500/10 disabled:opacity-50"
            >
              {feishuSmokeRunning ? '联调中...' : '一键联调'}
            </button>
            <button
              onClick={handleTestFeishuConfig}
              disabled={feishuTesting}
              className="px-4 py-2 rounded-lg border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-50"
            >
              {feishuTesting ? '测试中...' : '测试连通'}
            </button>
            <button
              onClick={handleSaveFeishuConfig}
              disabled={feishuSaving}
              className="px-4 py-2 rounded-lg border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
            >
              {feishuSaving ? '保存中...' : '保存飞书配置'}
            </button>
          </div>

          {feishuSmokeTaskId ? (
            <div className="mt-3 rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/10 p-3 text-xs text-fuchsia-100">
              <p>联调任务 #{feishuSmokeTaskId} 已创建，可直接查看执行闭环：</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onClick={() => navigate(`/workbench?channel_task_id=${feishuSmokeTaskId}&from=feishu_smoke`)}
                  className="px-3 py-1.5 rounded border border-fuchsia-400/50 hover:bg-fuchsia-500/20"
                >
                  打开工作台
                </button>
                <button
                  onClick={() => navigate(`/board?channel_task_id=${feishuSmokeTaskId}&from=feishu_smoke`)}
                  className="px-3 py-1.5 rounded border border-fuchsia-400/50 hover:bg-fuchsia-500/20"
                >
                  打开老板看板
                </button>
              </div>
            </div>
          ) : null}

          {feishuDiagnostics ? (
            <div className="mt-4 rounded-lg border border-neutral-800 bg-black/40 p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={cn(
                    'px-2 py-1 rounded-full border',
                    feishuDiagnostics.configured
                      ? 'border-emerald-600/60 bg-emerald-500/15 text-emerald-200'
                      : 'border-red-600/60 bg-red-500/15 text-red-200'
                  )}
                >
                  {feishuDiagnostics.configured ? '凭据可用' : '凭据缺失'}
                </span>
                {typeof feishuDiagnostics.probe_ok === 'boolean' ? (
                  <span
                    className={cn(
                      'px-2 py-1 rounded-full border',
                      feishuDiagnostics.probe_ok
                        ? 'border-emerald-600/60 bg-emerald-500/15 text-emerald-200'
                        : 'border-red-600/60 bg-red-500/15 text-red-200'
                    )}
                  >
                    {feishuDiagnostics.probe_ok ? '鉴权通过' : '鉴权失败'}
                  </span>
                ) : null}
              </div>

              <div className="text-xs text-neutral-300 space-y-2">
                {feishuDiagnostics.callback_urls?.events ? (
                  <div className="flex items-center gap-2">
                    <span className="min-w-[72px] text-neutral-400">事件回调</span>
                    <code className="flex-1 truncate text-cyan-200">{feishuDiagnostics.callback_urls.events}</code>
                    <button
                      onClick={() => handleCopyText(feishuDiagnostics.callback_urls?.events || '', '事件回调地址')}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-neutral-700 hover:border-neutral-500 text-neutral-200"
                    >
                      {lastCopiedText === feishuDiagnostics.callback_urls.events ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {lastCopiedText === feishuDiagnostics.callback_urls.events ? '已复制' : '复制'}
                    </button>
                  </div>
                ) : null}
                {feishuDiagnostics.callback_urls?.inbound ? (
                  <div className="flex items-center gap-2">
                    <span className="min-w-[72px] text-neutral-400">消息注入</span>
                    <code className="flex-1 truncate text-cyan-200">{feishuDiagnostics.callback_urls.inbound}</code>
                    <button
                      onClick={() => handleCopyText(feishuDiagnostics.callback_urls?.inbound || '', '消息注入地址')}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-neutral-700 hover:border-neutral-500 text-neutral-200"
                    >
                      {lastCopiedText === feishuDiagnostics.callback_urls.inbound ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {lastCopiedText === feishuDiagnostics.callback_urls.inbound ? '已复制' : '复制'}
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
                {(feishuDiagnostics.checks || []).map((item) => (
                  <div key={item.id} className="rounded border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-xs space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'px-1.5 py-0.5 rounded border text-[10px]',
                          item.status === 'pass'
                            ? 'border-emerald-600/60 bg-emerald-500/15 text-emerald-200'
                            : item.status === 'warn'
                              ? 'border-amber-600/60 bg-amber-500/15 text-amber-200'
                              : 'border-red-600/60 bg-red-500/15 text-red-200'
                        )}
                      >
                        {item.status === 'pass' ? '通过' : item.status === 'warn' ? '提示' : '阻塞'}
                      </span>
                      <span className="text-white">{item.title}</span>
                    </div>
                    <p className="text-neutral-300">{item.detail}</p>
                    {item.action ? <p className="text-cyan-300">建议：{item.action}</p> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <User className="h-5 w-5" />
            账号信息
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white mb-3">个人头像</label>
              <div className="flex items-center gap-4">
                <div className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-neutral-800 bg-neutral-800">
                  {userAvatar ? (
                    <img src={userAvatar} alt="用户头像" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <User className="h-8 w-8 text-neutral-600" />
                    </div>
                  )}
                </div>
                <button
                  onClick={() => userAvatarInputRef.current?.click()}
                  className="px-4 py-2 rounded-lg bg-neutral-800 text-white hover:bg-neutral-700 transition-colors flex items-center gap-2"
                >
                  <Upload className="h-4 w-4" />
                  上传头像
                </button>
              </div>
              <input ref={userAvatarInputRef} type="file" accept="image/*" onChange={onUploadAvatar(setUserAvatar)} className="hidden" />
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">用户名</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-black text-white border border-neutral-800 focus:border-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">邮箱</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-neutral-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-black text-white border border-neutral-800 focus:border-white focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">AI 助手设置</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white mb-2">助手名称</label>
              <input
                type="text"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                maxLength={20}
                placeholder="例如：Alex"
                className="w-full px-4 py-2.5 rounded-lg bg-black text-white border border-neutral-800 focus:border-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-3">助手头像</label>
              <div className="flex items-center gap-4 mb-3">
                <div className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-blue-500/40 bg-neutral-800">
                  {selectedAvatar ? (
                    <img src={selectedAvatar} alt="助手头像" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Camera className="h-8 w-8 text-neutral-600" />
                    </div>
                  )}
                </div>
                <button
                  onClick={() => agentAvatarInputRef.current?.click()}
                  className="px-4 py-2 rounded-lg bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 transition-colors flex items-center gap-2"
                >
                  <Upload className="h-4 w-4" />
                  上传助手头像
                </button>
              </div>

              <div className="grid grid-cols-5 gap-2">
                {avatars.map((avatar) => (
                  <button
                    key={avatar}
                    onClick={() => setSelectedAvatar(avatar)}
                    className={cn(
                      'relative rounded-lg overflow-hidden border-2 transition-all',
                      selectedAvatar === avatar
                        ? 'border-blue-500 ring-2 ring-blue-500/30'
                        : 'border-neutral-700 hover:border-neutral-500'
                    )}
                  >
                    <img src={avatar} alt="" className="w-full aspect-square object-cover" />
                  </button>
                ))}
              </div>
              <input ref={agentAvatarInputRef} type="file" accept="image/*" onChange={onUploadAvatar(setSelectedAvatar)} className="hidden" />
            </div>
          </div>
        </div>

        <button
          onClick={handleSaveProfile}
          disabled={isSaving}
          className={cn(
            'w-full px-6 py-3 rounded-lg font-medium transition-colors',
            isSaving ? 'bg-neutral-800 text-neutral-600 cursor-not-allowed' : 'bg-white text-black hover:bg-neutral-200'
          )}
        >
          {isSaving ? '保存中...' : '保存变更'}
        </button>

        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Lock className="h-5 w-5" />
              修改密码
            </h2>
            {!showPasswordSection && (
              <button onClick={() => setShowPasswordSection(true)} className="text-sm text-white hover:underline">
                修改
              </button>
            )}
          </div>

          {showPasswordSection ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white mb-2">当前密码</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full px-4 py-2.5 pr-12 rounded-lg bg-black text-white border border-neutral-800 focus:border-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">新密码</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="至少 6 位"
                  className="w-full px-4 py-2.5 rounded-lg bg-black text-white border border-neutral-800 focus:border-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">确认新密码</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg bg-black text-white border border-neutral-800 focus:border-white focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleChangePassword}
                  disabled={isSaving}
                  className={cn(
                    'flex-1 px-4 py-2.5 rounded-lg font-medium transition-colors',
                    isSaving ? 'bg-neutral-800 text-neutral-600 cursor-not-allowed' : 'bg-white text-black hover:bg-neutral-200'
                  )}
                >
                  {isSaving ? '保存中...' : '保存密码'}
                </button>
                <button
                  onClick={() => {
                    setShowPasswordSection(false)
                    setCurrentPassword('')
                    setNewPassword('')
                    setConfirmPassword('')
                  }}
                  className="px-4 py-2.5 rounded-lg font-medium text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-neutral-500">建议定期更换密码，提升账号安全性。</p>
          )}
        </div>

        <button
          onClick={handleLogout}
          className="w-full px-6 py-3 rounded-lg font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/50 transition-colors flex items-center justify-center gap-2"
        >
          <LogOut className="h-5 w-5" />
          退出登录
        </button>
      </div>
    </div>
  )
}
