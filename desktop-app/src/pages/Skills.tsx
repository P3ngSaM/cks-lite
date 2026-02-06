import { useEffect, useState, useCallback } from 'react'
import { Filter, RefreshCw, X, FileText, Download, Languages } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { SkillsList, InstallSkillDialog } from '@/components/skills'
import { AgentService } from '@/services/agentService'
import { useSkillsStore } from '@/stores'
import { cn } from '@/utils/cn'
import type { AuditRecord, SkillReadiness } from '@/types/agent'

export const Skills = () => {
  const skills = useSkillsStore((state) => state.skills)
  const isLoading = useSkillsStore((state) => state.isLoading)
  const selectedCategory = useSkillsStore((state) => state.selectedCategory)
  const setSkills = useSkillsStore((state) => state.setSkills)
  const setLoading = useSkillsStore((state) => state.setLoading)
  const setSelectedCategory = useSkillsStore((state) => state.setSelectedCategory)

  // Install dialog state
  const [installDialogOpen, setInstallDialogOpen] = useState(false)
  const [readinessMap, setReadinessMap] = useState<Record<string, SkillReadiness>>({})
  const [auditExecutions, setAuditExecutions] = useState<AuditRecord[]>([])
  const [auditErrors, setAuditErrors] = useState<AuditRecord[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditSessionId, setAuditSessionId] = useState('')
  const [auditToolName, setAuditToolName] = useState('')
  const [auditLimit, setAuditLimit] = useState(8)
  const [auditFromTime, setAuditFromTime] = useState('')
  const [auditToTime, setAuditToTime] = useState('')

  // Context viewer state
  const [contextModal, setContextModal] = useState<{
    isOpen: boolean
    skillName: string
    content: string
    isLoading: boolean
    isTranslating: boolean
    translatedContent: string
    showingTranslated: boolean
  }>({
    isOpen: false,
    skillName: '',
    content: '',
    isLoading: false,
    isTranslating: false,
    translatedContent: '',
    showingTranslated: false
  })

  // Compute categories from skills directly in component
  const categories = Array.from(
    new Set(skills.map((skill) => skill.category).filter((cat): cat is string => Boolean(cat)))
  )

  // Compute skill count function
  const getSkillCount = (category?: string) => {
    if (!category) return skills.length
    return skills.filter((skill) => skill.category === category).length
  }

  const categoryLabelMap: Record<string, string> = {
    community: '社区',
    document: '文档',
    productivity: '效率',
    communication: '沟通',
    automation: '自动化',
    enterprise: '企业',
    creative: '创意',
    'video-tools': '视频工具',
    '未分类': '未分类',
  }
  const getCategoryLabel = (category: string) => {
    return categoryLabelMap[category?.toLowerCase?.() || ''] || category
  }

  // Check if should refetch
  const lastFetchTime = useSkillsStore((state) => state.lastFetchTime)
  const shouldRefetch = () => {
    if (!lastFetchTime) return true
    return Date.now() - lastFetchTime > 5 * 60 * 1000
  }

  const loadAuditSnapshot = async () => {
    setAuditLoading(true)
    try {
      const [execResult, errorResult] = await Promise.all([
        AgentService.getAuditExecutions(
          auditSessionId || undefined,
          auditLimit,
          auditToolName || undefined,
          auditFromTime || undefined,
          auditToTime || undefined
        ),
        AgentService.getAuditErrors(
          auditSessionId || undefined,
          auditLimit,
          auditToolName || undefined,
          auditFromTime || undefined,
          auditToTime || undefined
        )
      ])

      if (execResult?.success && execResult.records) {
        setAuditExecutions(execResult.records)
      }
      if (errorResult?.success && errorResult.records) {
        setAuditErrors(errorResult.records)
      }
    } catch (error) {
      console.error('Failed to load audit snapshot:', error)
    } finally {
      setAuditLoading(false)
    }
  }

  const resetAuditFilters = () => {
    setAuditSessionId('')
    setAuditToolName('')
    setAuditLimit(8)
    setAuditFromTime('')
    setAuditToTime('')
  }

  const loadSkills = async () => {
    setLoading(true)
    try {
      const [skillsResult, readinessResult] = await Promise.all([
        AgentService.listSkills(),
        AgentService.listSkillsReadiness()
      ])

      if (skillsResult && skillsResult.success) {
        setSkills(skillsResult.skills)
      }

      if (readinessResult && readinessResult.success && readinessResult.readiness) {
        const map: Record<string, SkillReadiness> = {}
        for (const row of readinessResult.readiness) {
          map[row.name] = row
        }
        setReadinessMap(map)
      }
      await loadAuditSnapshot()
    } catch (error) {
      console.error('Failed to load skills:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleViewContext = useCallback(async (skillName: string) => {
    setContextModal({
      isOpen: true,
      skillName,
      content: '',
      isLoading: true,
      isTranslating: false,
      translatedContent: '',
      showingTranslated: false
    })

    try {
      const result = await AgentService.getSkillContext(skillName)
      if (result && result.success && result.context) {
        setContextModal(prev => ({
          ...prev,
          content: result.context || '',
          isLoading: false,
          translatedContent: '',
          showingTranslated: false
        }))
      } else {
        setContextModal(prev => ({
          ...prev,
          content: '无法加载技能文档',
          isLoading: false,
          translatedContent: '',
          showingTranslated: false
        }))
      }
    } catch (error) {
      console.error('Failed to load skill context:', error)
      setContextModal(prev => ({
        ...prev,
        content: '加载失败: ' + String(error),
        isLoading: false,
        translatedContent: '',
        showingTranslated: false
      }))
    }
  }, [])

  const handleTranslateContext = useCallback(async () => {
    if (contextModal.isLoading || contextModal.isTranslating) return

    if (contextModal.translatedContent) {
      setContextModal(prev => ({
        ...prev,
        showingTranslated: !prev.showingTranslated
      }))
      return
    }

    const source = contextModal.content?.trim()
    if (!source) return

    setContextModal(prev => ({
      ...prev,
      isTranslating: true
    }))

    try {
      const translatePrompt = [
        '请将下面这份 Markdown 技能文档翻译为简体中文。',
        '要求：',
        '1) 保留原有 Markdown 结构（标题、列表、代码块、表格）；',
        '2) 命令、路径、函数名、工具名保持原文，不要翻译；',
        '3) 只输出翻译后的 Markdown，不要添加解释。',
        '',
        '文档如下：',
        source
      ].join('\n')

      const result = await AgentService.chat({
        user_id: 'skills_translator',
        session_id: `skills_translate_${contextModal.skillName}`,
        message: translatePrompt,
        use_memory: false
      })

      const translated = result?.message?.trim()
      if (!translated) {
        throw new Error('翻译结果为空')
      }

      setContextModal(prev => ({
        ...prev,
        isTranslating: false,
        translatedContent: translated,
        showingTranslated: true
      }))
    } catch (error) {
      console.error('Failed to translate skill context:', error)
      setContextModal(prev => ({
        ...prev,
        isTranslating: false
      }))
    }
  }, [contextModal.content, contextModal.isLoading, contextModal.isTranslating, contextModal.skillName, contextModal.translatedContent])

  const closeContextModal = useCallback(() => {
    setContextModal({
      isOpen: false,
      skillName: '',
      content: '',
      isLoading: false,
      isTranslating: false,
      translatedContent: '',
      showingTranslated: false
    })
  }, [])

  const handleUninstall = async (skillName: string) => {
    if (!confirm(`确定卸载 "${skillName}"?`)) return
    const result = await AgentService.uninstallSkill(skillName)
    if (result?.success) loadSkills()
  }

  const handleRunSkillTest = async (skillName: string) => {
    try {
      const result = await AgentService.smokeTestSkill(skillName)
      const item = result?.results?.[0]
      if (!item) {
        alert(`技能 ${skillName} 测试无返回结果`)
        return
      }
      const checks = (item.checks || [])
        .map((c) => `${c.ok ? '✅' : '❌'} ${c.name}: ${c.detail}`)
        .join('\n')
      alert(`[${skillName}] ${item.success ? '通过' : '失败'}\n${item.message}\n\n${checks}`)
      // Refresh readiness after test to keep UI up to date
      await loadSkills()
    } catch (error) {
      console.error('Failed to run skill smoke test:', error)
      alert(`技能测试失败: ${String(error)}`)
    }
  }

  const readinessValues = Object.values(readinessMap)
  const readyCount = readinessValues.filter((r) => r.status === 'ready').length
  const missingCount = readinessValues.filter((r) => r.status === 'missing_dependency').length
  const blockedCount = readinessValues.filter((r) => r.status === 'blocked_by_policy').length
  const errorCount = readinessValues.filter((r) => r.status === 'runtime_error').length

  const formatAuditTime = (value?: string) => {
    if (!value) return '--'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString()
  }

  const downloadTextFile = (filename: string, content: string, contentType: string) => {
    const blob = new Blob([content], { type: contentType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const handleExportAuditJson = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      filters: {
        session_id: auditSessionId || null,
        tool_name: auditToolName || null,
        from_time: auditFromTime || null,
        to_time: auditToTime || null,
        limit: auditLimit
      },
      executions: auditExecutions,
      errors: auditErrors
    }
    const filename = `audit_export_${Date.now()}.json`
    downloadTextFile(filename, JSON.stringify(payload, null, 2), 'application/json')
  }

  const escapeCsv = (value: unknown) => {
    const text = value == null ? '' : String(value)
    if (text.includes('"') || text.includes(',') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`
    }
    return text
  }

  const handleExportAuditCsv = () => {
    const rows = [
      ...auditExecutions.map((row) => ({ ...row, _type: 'execution' })),
      ...auditErrors.map((row) => ({ ...row, _type: 'error' }))
    ]
    const header = ['type', 'timestamp', 'session_id', 'tool_name', 'success', 'message', 'error']
    const lines = [header.join(',')]
    for (const row of rows) {
      const raw = row as any
      const timestamp = raw.timestamp || raw.ts || ''
      const toolName = raw.tool_name || raw.tool || ''
      const line = [
        row._type,
        timestamp,
        row.session_id || '',
        toolName,
        typeof row.success === 'boolean' ? String(row.success) : '',
        row.message || '',
        row.error || ''
      ].map(escapeCsv).join(',')
      lines.push(line)
    }
    const filename = `audit_export_${Date.now()}.csv`
    downloadTextFile(filename, lines.join('\n'), 'text/csv;charset=utf-8')
  }

  useEffect(() => {
    if (shouldRefetch()) {
      loadSkills()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex h-screen bg-black">
      {/* Install Dialog */}
      <InstallSkillDialog
        isOpen={installDialogOpen}
        onClose={() => setInstallDialogOpen(false)}
        onInstalled={() => { setInstallDialogOpen(false); loadSkills() }}
      />

      {/* Context Modal */}
      {contextModal.isOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-4xl w-full max-h-[80vh] flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-neutral-800">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-neutral-800">
                  <FileText className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    {contextModal.skillName} 技能文档
                  </h2>
                  <p className="text-xs text-neutral-500">
                    SKILL.md 内容
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleTranslateContext}
                  disabled={contextModal.isLoading || contextModal.isTranslating || !contextModal.content}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neutral-700 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {contextModal.isTranslating ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-neutral-200" />
                  ) : (
                    <Languages className="h-4 w-4" />
                  )}
                  {contextModal.translatedContent
                    ? (contextModal.showingTranslated ? '查看原文' : '查看中文')
                    : '翻译成中文'}
                </button>
                <button
                  onClick={closeContextModal}
                  className="p-2 rounded-lg hover:bg-neutral-800 transition-colors"
                >
                  <X className="h-5 w-5 text-neutral-400" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {contextModal.isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
                </div>
              ) : (
                <div className="prose prose-sm prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {contextModal.showingTranslated && contextModal.translatedContent
                      ? contextModal.translatedContent
                      : contextModal.content}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="h-14 border-b border-neutral-800 flex items-center px-6">
          <div className="flex-1">
            <h1 className="text-base font-semibold text-white">
              技能管理
            </h1>
            <p className="text-xs text-neutral-600 mt-0.5">
              查看和管理 AI 助手的可用技能
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setInstallDialogOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-white text-black hover:bg-neutral-200 transition-colors"
            >
              <Download className="h-4 w-4" />
              安装技能
            </button>
            <button
              onClick={loadSkills}
              className="p-2 rounded-lg text-neutral-500 hover:text-white hover:bg-neutral-900 transition-colors"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-5 gap-4">
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 text-center">
                <p className="text-2xl font-bold text-white">
                  {skills.length}
                </p>
                <p className="text-sm text-neutral-500 mt-1">总技能数</p>
              </div>
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 text-center">
                <p className="text-2xl font-bold text-white">
                  {skills.filter((s) => s.has_skill).length}
                </p>
                <p className="text-sm text-neutral-500 mt-1">AI 可调用</p>
              </div>
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 text-center">
                <p className="text-2xl font-bold text-white">
                  {skills.filter((s) => s.has_app).length}
                </p>
                <p className="text-sm text-neutral-500 mt-1">独立应用</p>
              </div>
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 text-center">
                <p className="text-2xl font-bold text-purple-400">
                  {skills.filter((s) => s.source === 'user-installed').length}
                </p>
                <p className="text-sm text-neutral-500 mt-1">社区技能</p>
              </div>
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 text-center">
                <p className="text-2xl font-bold text-white">
                  {skills.reduce((acc, s) => acc + (s.trigger_keywords?.length || 0), 0)}
                </p>
                <p className="text-sm text-neutral-500 mt-1">触发关键词</p>
              </div>
            </div>

            {/* Readiness Summary */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3">
              <div className="flex items-center gap-3 text-xs flex-wrap">
                <span className="text-neutral-500">运行状态:</span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">就绪 {readyCount}</span>
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400">缺依赖 {missingCount}</span>
                <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400">已拦截 {blockedCount}</span>
                <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400">异常 {errorCount}</span>
              </div>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-medium text-white">技能审计快照</h3>
                  <p className="text-xs text-neutral-500 mt-1">最近工具执行与错误记录</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 text-[11px]">
                      会话: {auditSessionId || '全部'}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 text-[11px]">
                      工具: {auditToolName || '全部'}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 text-[11px]">
                      条数: {auditLimit}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 text-[11px]">
                      开始: {auditFromTime || '不限'}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 text-[11px]">
                      结束: {auditToTime || '不限'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={loadAuditSnapshot}
                  disabled={auditLoading}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-neutral-700 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', auditLoading && 'animate-spin')} />
                  刷新
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3">
                <input
                  value={auditSessionId}
                  onChange={(e) => setAuditSessionId(e.target.value)}
                  placeholder="会话ID（可选）"
                  className="bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-600"
                />
                <input
                  value={auditToolName}
                  onChange={(e) => setAuditToolName(e.target.value)}
                  placeholder="工具名（可选）"
                  className="bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-600"
                />
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={auditLimit}
                  onChange={(e) => setAuditLimit(Math.max(1, Math.min(1000, Number(e.target.value || 1))))}
                  className="bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1.5 text-xs text-neutral-200"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mt-2">
                <input
                  type="datetime-local"
                  value={auditFromTime}
                  onChange={(e) => setAuditFromTime(e.target.value)}
                  className="bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1.5 text-xs text-neutral-200"
                />
                <input
                  type="datetime-local"
                  value={auditToTime}
                  onChange={(e) => setAuditToTime(e.target.value)}
                  className="bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1.5 text-xs text-neutral-200"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={loadAuditSnapshot}
                    disabled={auditLoading}
                    className="px-2.5 py-1.5 rounded-md text-xs bg-white text-black hover:bg-neutral-300 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    应用
                  </button>
                  <button
                    onClick={async () => {
                      resetAuditFilters()
                      setAuditLoading(true)
                      try {
                        const [execResult, errorResult] = await Promise.all([
                          AgentService.getAuditExecutions(undefined, 8, undefined, undefined, undefined),
                          AgentService.getAuditErrors(undefined, 8, undefined, undefined, undefined)
                        ])
                        if (execResult?.success && execResult.records) {
                          setAuditExecutions(execResult.records)
                        }
                        if (errorResult?.success && errorResult.records) {
                          setAuditErrors(errorResult.records)
                        }
                      } catch (error) {
                        console.error('Failed to reset audit filters:', error)
                      } finally {
                        setAuditLoading(false)
                      }
                    }}
                    disabled={auditLoading}
                    className="px-2.5 py-1.5 rounded-md text-xs border border-neutral-700 text-neutral-300 hover:bg-neutral-800 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    重置
                  </button>
                  <button
                    onClick={handleExportAuditJson}
                    disabled={auditLoading}
                    className="px-2.5 py-1.5 rounded-md text-xs border border-neutral-700 text-neutral-300 hover:bg-neutral-800 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    导出JSON
                  </button>
                  <button
                    onClick={handleExportAuditCsv}
                    disabled={auditLoading}
                    className="px-2.5 py-1.5 rounded-md text-xs border border-neutral-700 text-neutral-300 hover:bg-neutral-800 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    导出CSV
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                <div className="border border-neutral-800 rounded-md p-3">
                  <p className="text-xs text-neutral-400 mb-2">执行记录 ({auditExecutions.length})</p>
                  <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                    {auditExecutions.length === 0 && (
                      <p className="text-xs text-neutral-600">暂无执行记录。</p>
                    )}
                    {auditExecutions.map((row, index) => {
                      const toolName = row.tool_name || row.tool || 'unknown_tool'
                      const ts = row.timestamp || row.ts
                      return (
                      <div key={`${ts || 'ts'}-${toolName}-${index}`} className="text-xs rounded border border-neutral-800 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-neutral-200">{toolName}</span>
                          <span className={cn('px-1.5 py-0.5 rounded text-[10px]', row.success ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400')}>
                            {row.success ? '成功' : '失败'}
                          </span>
                        </div>
                        <p className="text-neutral-500 mt-1 truncate">{row.session_id || '无会话'}</p>
                        <p className="text-neutral-600">{formatAuditTime(ts)}</p>
                      </div>
                    )})}
                  </div>
                </div>
                <div className="border border-neutral-800 rounded-md p-3">
                  <p className="text-xs text-neutral-400 mb-2">错误记录 ({auditErrors.length})</p>
                  <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                    {auditErrors.length === 0 && (
                      <p className="text-xs text-neutral-600">暂无错误记录。</p>
                    )}
                    {auditErrors.map((row, index) => {
                      const toolName = row.tool_name || row.tool || 'unknown_tool'
                      const ts = row.timestamp || row.ts
                      return (
                      <div key={`${ts || 'ts'}-${toolName}-${index}`} className="text-xs rounded border border-neutral-800 p-2">
                        <p className="text-red-400">{toolName}</p>
                        <p className="text-neutral-500 mt-1 line-clamp-2">{row.error || row.message || '未知错误'}</p>
                        <p className="text-neutral-600 mt-1">{formatAuditTime(ts)}</p>
                      </div>
                    )})}
                  </div>
                </div>
              </div>
            </div>

            {/* Category Filter */}
            {categories.length > 0 && (
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Filter className="h-5 w-5 text-neutral-500" />
                    <span className="text-sm font-medium text-white">
                      筛选分类:
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => setSelectedCategory('')}
                      className={cn(
                        'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                        !selectedCategory
                          ? 'bg-white text-black'
                          : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white'
                      )}
                    >
                      全部 ({getSkillCount()})
                    </button>
                    {categories.map((category) => (
                      <button
                        key={category}
                        onClick={() => setSelectedCategory(category)}
                        className={cn(
                          'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                          selectedCategory === category
                            ? 'bg-white text-black'
                            : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white'
                        )}
                      >
                        {getCategoryLabel(category)} ({getSkillCount(category)})
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Skills List */}
            <SkillsList
              skills={skills}
              isLoading={isLoading}
              category={selectedCategory}
              readinessMap={readinessMap}
              onViewContext={handleViewContext}
              onUninstall={handleUninstall}
              onRunTest={handleRunSkillTest}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
