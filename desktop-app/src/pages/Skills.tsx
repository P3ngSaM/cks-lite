import { useEffect, useState, useCallback, useMemo } from 'react'
import { Filter, RefreshCw, X, FileText, Download, Languages, Sparkles } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useNavigate } from 'react-router-dom'
import { SkillsList, InstallSkillDialog } from '@/components/skills'
import { EmptyState, PageHeader } from '@/components/ui'
import { AgentService } from '@/services/agentService'
import { useSkillsStore } from '@/stores'
import { cn } from '@/utils/cn'
import { localizeSkill, loadSkillAliasMap, saveSkillAlias } from '@/utils/skillI18n'
import type { AuditRecord, SkillReadiness } from '@/types/agent'

export const Skills = () => {
  const navigate = useNavigate()
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
  const [skillsSnapshot, setSkillsSnapshot] = useState<{
    version: number
    skills_count: number
    tools_count: number
  } | null>(null)
  const [snapshotChanged, setSnapshotChanged] = useState<boolean | null>(null)
  const [autoInstallGoal, setAutoInstallGoal] = useState('')
  const [autoInstallCount, setAutoInstallCount] = useState(1)
  const [autoInstallRunning, setAutoInstallRunning] = useState(false)
  const [autoInstallLogs, setAutoInstallLogs] = useState<string[]>([])
  const [autoInstallFixes, setAutoInstallFixes] = useState<Array<{ skill: string; suggestion: string }>>([])
  const [autoInstallRunCheck, setAutoInstallRunCheck] = useState(true)
  const [onlyReadySkills, setOnlyReadySkills] = useState(false)

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
  const sourceSummary = useMemo(() => {
    const summary = {
      builtIn: 0,
      community: 0,
      plugin: 0,
      project: 0,
      other: 0,
    }
    for (const skill of skills) {
      const src = (skill.source || '').toLowerCase()
      if (src === 'pre-installed') summary.builtIn += 1
      else if (src === 'user-installed' || src === 'installed') summary.community += 1
      else if (src === 'plugin') summary.plugin += 1
      else if (src === 'project' || src === 'global') summary.project += 1
      else summary.other += 1
    }
    return summary
  }, [skills])
  const readinessSummary = useMemo(() => {
    const rows = Object.values(readinessMap || {})
    return {
      total: rows.length,
      ready: rows.filter((r) => r.status === 'ready').length,
      missing: rows.filter((r) => r.status === 'missing_dependency').length,
      blocked: rows.filter((r) => r.status === 'blocked_by_policy').length,
      error: rows.filter((r) => r.status === 'runtime_error').length,
    }
  }, [readinessMap])
  const visibleSkills = useMemo(() => {
    if (!onlyReadySkills) return skills
    return skills.filter((skill) => readinessMap[skill.name]?.status === 'ready')
  }, [onlyReadySkills, readinessMap, skills])

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
      const [snapshotResult, skillsResult, readinessResult] = await Promise.all([
        AgentService.getSkillsSnapshot(),
        AgentService.listSkills(),
        AgentService.listSkillsReadiness()
      ])

      if (snapshotResult && snapshotResult.success && snapshotResult.snapshot) {
        setSkillsSnapshot(snapshotResult.snapshot)
        setSnapshotChanged(Boolean(snapshotResult.changed))
      }

      if (skillsResult && skillsResult.success) {
        const aliasMap = loadSkillAliasMap()
        setSkills(skillsResult.skills.map((skill) => localizeSkill(skill, aliasMap)))
        if (!snapshotResult?.snapshot && skillsResult.snapshot) {
          setSkillsSnapshot(skillsResult.snapshot)
          setSnapshotChanged(null)
        }
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

  const extractSkillRefsFromText = (text: string): string[] => {
    const refs = new Set<string>()
    const codeBlock = text.match(/```json\s*([\s\S]*?)```/i)
    const candidate = codeBlock?.[1]?.trim() || text.trim()
    try {
      const parsed = JSON.parse(candidate)
      const list = Array.isArray(parsed) ? parsed : (parsed?.skills || [])
      for (const item of list) {
        const ref = typeof item === 'string' ? item : item?.ref
        if (typeof ref === 'string' && ref.trim()) refs.add(ref.trim())
      }
    } catch {
      // Fallback: 从文本中提取 owner/repo
      const matches = text.match(/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+/g) || []
      for (const raw of matches) {
        if (raw.includes('http')) continue
        refs.add(raw.trim())
      }
    }
    return Array.from(refs)
  }

  const buildInstallCandidates = (ref: string): string[] => {
    const base = (ref || '').trim()
    if (!base) return []
    const candidates = new Set<string>([base])

    // 兼容 "owner/repo@skill-name" 这类推荐格式
    const atMatch = base.match(/^([^/\s]+)\/([^@\s]+)@([^\s]+)$/)
    if (atMatch) {
      const [, owner, repo, skillName] = atMatch
      candidates.add(`${owner}/${repo} --skill ${skillName}`)
      candidates.add(`${owner}/${repo}/skills/${skillName}`)
      candidates.add(`https://github.com/${owner}/${repo}/tree/main/skills/${skillName}`)
      // 针对部分推荐返回 agent-skills 的兜底
      if (repo === 'agent-skills') {
        candidates.add(`${owner}/skills --skill ${skillName}`)
        candidates.add(`${owner}/skills/skills/${skillName}`)
        candidates.add(`https://github.com/${owner}/skills/tree/main/skills/${skillName}`)
      }
    }

    return Array.from(candidates)
  }

  const handleAutoDiscoverAndInstall = async () => {
    const goal = autoInstallGoal.trim()
    if (!goal) {
      alert('请先输入你的任务目标')
      return
    }
    setAutoInstallRunning(true)
    setAutoInstallLogs([])
    setAutoInstallFixes([])
    try {
      const prompt = [
        '你是技能调度助手。请根据我的目标，推荐最值得安装的 skills。',
        '要求：',
        '1) 优先推荐可直接提升生产效率的通用技能；',
        '2) 输出必须是 JSON，不要解释；',
        '3) JSON 格式为 {"skills":[{"ref":"owner/repo","reason":"一句话原因"}]}；',
        `4) 最多推荐 ${Math.max(1, Math.min(5, autoInstallCount))} 个。`,
        '',
        `我的目标：${goal}`,
      ].join('\n')

      const recommend = await AgentService.chat({
        user_id: 'skills_commander',
        session_id: `skills_auto_install_${Date.now()}`,
        message: prompt,
        use_memory: false,
        preferred_skill: 'find-skills',
        skill_strict: true,
      })

      const refs = extractSkillRefsFromText(recommend?.message || '')
      if (refs.length === 0) {
        alert('没有识别到可安装技能引用（owner/repo），请换个目标重试。')
        return
      }

      const logs: string[] = []
      const fixes: Array<{ skill: string; suggestion: string }> = []
      const limitedRefs = refs.slice(0, Math.max(1, Math.min(5, autoInstallCount)))
      for (const ref of limitedRefs) {
        let result = null as Awaited<ReturnType<typeof AgentService.installSkill>>
        const candidates = buildInstallCandidates(ref)
        let usedCandidate = ref
        for (const candidate of candidates) {
          usedCandidate = candidate
          result = await AgentService.installSkill(candidate)
          if (result?.success) break
        }

        if (result?.success) {
          logs.push(`✅ 已安装：${ref}`)
          if (usedCandidate !== ref) {
            logs.push(`↪ 已自动纠正安装引用：${usedCandidate}`)
          }
          if (autoInstallRunCheck && result.skill_name) {
            try {
              const [smokeResult, readinessResult] = await Promise.all([
                AgentService.smokeTestSkill(result.skill_name),
                AgentService.listSkillsReadiness(result.skill_name),
              ])
              const smokeItem = smokeResult?.results?.[0]
              if (smokeItem?.success) {
                logs.push(`🧪 体检通过：${result.skill_name}`)
              } else {
                logs.push(`⚠️ 体检未通过：${result.skill_name}（${smokeItem?.message || '请检查依赖'}）`)
              }
              const readiness = readinessResult?.readiness?.[0]
              if (readiness && readiness.status !== 'ready') {
                const firstBadCheck = (readiness.runtime_checks || []).find((check) => !check.ok)
                if (firstBadCheck?.detail) {
                  logs.push(`🔧 修复建议：${firstBadCheck.detail}`)
                  fixes.push({ skill: result.skill_name, suggestion: firstBadCheck.detail })
                } else {
                  logs.push(`🔧 修复建议：检查 ${result.skill_name} 运行依赖与权限配置`)
                  fixes.push({ skill: result.skill_name, suggestion: `检查 ${result.skill_name} 的运行依赖与权限配置` })
                }
              }
            } catch (error) {
              logs.push(`⚠️ 体检失败：${result.skill_name}（${String(error)}）`)
            }
          }
        } else {
          logs.push(`❌ 安装失败：${ref}（${result?.error || '未知错误'}）`)
          if (ref.includes('@')) {
            logs.push('💡 建议：优先使用 owner/repo --skill skill-name 或仓库 skills 目录链接')
          }
        }
      }
      setAutoInstallLogs(logs)
      setAutoInstallFixes(fixes)
      await loadSkills()
      alert(`自动安装完成：成功 ${logs.filter((x) => x.startsWith('✅')).length} / ${logs.length}`)
    } catch (error) {
      console.error('Failed to auto discover/install skills:', error)
      alert(`自动发现并安装失败：${String(error)}`)
    } finally {
      setAutoInstallRunning(false)
    }
  }

  const copyFixSuggestion = async (suggestion: string) => {
    try {
      await navigator.clipboard.writeText(suggestion)
      alert('已复制修复建议')
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = suggestion
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      alert('已复制修复建议')
    }
  }

  const sendFixToWorkbench = (skill: string, suggestion: string) => {
    localStorage.setItem('cks.workbench.seedPrompt', `请优先处理技能「${skill}」的可用性问题：${suggestion}`)
    navigate('/workbench')
  }

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

  const handleRunInWorkbench = (skillName: string) => {
    localStorage.setItem('cks.workbench.preferredSkill', skillName)
    localStorage.setItem('cks.workbench.skillStrict', '1')
    localStorage.setItem(
      'cks.workbench.seedPrompt',
      `请优先使用技能「${skillName}」完成本次任务；如果技能失败，请自动降级到内置桌面工具链继续执行。`
    )
    navigate('/workbench')
  }

  const handleRunExample = (skillName: string) => {
    const key = skillName.toLowerCase()
    const exactExampleMap: Record<string, string> = {
      'demo-office-assistant': '请帮我先整理桌面文件夹，再生成一封可直接发送的汇报邮件。',
      'find-skills': '请帮我找到适合“自动化整理资料并输出周报”的 3 个技能，并给出推荐理由。',
      playwright: '请用浏览器自动化帮我打开目标网页，抓取关键内容并输出摘要。',
      spreadsheet: '请生成一份销售数据表格，并给出 3 条关键结论。',
      transcribe: '请把这段音频转成文字，并提炼 3 条重点。',
      screenshot: '请帮我截图当前页面并标注关键区域。',
      'openai-docs': '请基于 OpenAI 官方文档，解释 Responses API 的最佳实践并给一个示例。',
      'security-best-practices': '请检查当前流程的安全风险，并给出可落地的修复建议。',
      github: '请分析这个仓库结构，并输出一份可执行的改造计划。',
    }
    let prompt = exactExampleMap[skillName]
    if (!prompt) {
      if (key.includes('playwright') || key.includes('browser')) {
        prompt = '请执行一次网页自动化任务，并输出执行结果与证据。'
      } else if (key.includes('excel') || key.includes('sheet') || key.includes('spreadsheet')) {
        prompt = '请生成结构化表格，并附上图表与简短结论。'
      } else if (key.includes('email') || key.includes('mail')) {
        prompt = '请生成可直接发送的邮件版本与群公告版本。'
      } else if (key.includes('pdf') || key.includes('doc') || key.includes('document')) {
        prompt = '请读取文档并输出结构化摘要与待办清单。'
      } else if (key.includes('terminal') || key.includes('shell') || key.includes('command')) {
        prompt = '请通过终端完成本次任务，并回传执行日志与结果。'
      } else if (key.includes('image') || key.includes('vision') || key.includes('screenshot')) {
        prompt = '请基于视觉信息完成识别分析，并给出下一步动作。'
      } else if (key.includes('search') || key.includes('web') || key.includes('crawl')) {
        prompt = '请联网搜索相关资料，给出来源和结论摘要。'
      } else {
        prompt = `请优先使用技能「${skillName}」完成任务，失败时自动切换到可用工具继续执行。`
      }
    }
    localStorage.setItem('cks.workbench.preferredSkill', skillName)
    localStorage.setItem('cks.workbench.skillStrict', '1')
    localStorage.setItem('cks.workbench.seedPrompt', prompt)
    navigate('/workbench')
  }

  const handleEditAlias = (skillName: string) => {
    const current = skills.find((s) => s.name === skillName)
    const next = window.prompt(`为技能 ${current?.display_name || skillName} 设置中文别名（留空则恢复默认）`, current?.display_name || '')
    if (next == null) return
    saveSkillAlias(skillName, next)
    void loadSkills()
  }

  const readinessValues = Object.values(readinessMap)
  const readyCount = readinessValues.filter((r) => r.status === 'ready').length
  const missingCount = readinessValues.filter((r) => r.status === 'missing_dependency').length
  const blockedCount = readinessValues.filter((r) => r.status === 'blocked_by_policy').length
  const errorCount = readinessValues.filter((r) => r.status === 'runtime_error').length
  const skillUsageRanking = useMemo(() => {
    const usage = new Map<string, number>()
    for (const skill of skills) {
      usage.set(skill.name, 0)
    }
    for (const row of auditExecutions) {
      const toolName = row.tool_name || row.tool
      if (!toolName) continue
      for (const skill of skills) {
        if ((skill.tools || []).includes(toolName)) {
          usage.set(skill.name, (usage.get(skill.name) || 0) + 1)
        }
      }
    }
    return skills
      .map((skill) => ({
        name: skill.name,
        displayName: skill.display_name || skill.name,
        count: usage.get(skill.name) || 0,
      }))
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  }, [skills, auditExecutions])
  const skillFailureRanking = useMemo(() => {
    const toolToSkill = new Map<string, string>()
    for (const skill of skills) {
      for (const tool of skill.tools || []) {
        toolToSkill.set(tool, skill.display_name || skill.name)
      }
    }
    const bucket = new Map<string, { count: number; sample: string }>()
    for (const row of auditErrors) {
      const toolName = row.tool_name || row.tool || ''
      const skillName = toolToSkill.get(toolName)
      if (!skillName) continue
      const reason = String(row.error || row.message || '未知错误').trim()
      const key = `${skillName}::${reason}`
      const existing = bucket.get(key)
      if (existing) {
        existing.count += 1
      } else {
        bucket.set(key, { count: 1, sample: reason })
      }
    }
    return Array.from(bucket.entries())
      .map(([key, value]) => {
        const [skillName] = key.split('::')
        return {
          skillName,
          count: value.count,
          reason: value.sample,
        }
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  }, [skills, auditErrors])

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
    <div className="flex h-full bg-black">
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
                  className="cks-btn cks-btn-secondary inline-flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
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
                  className="cks-btn cks-btn-secondary p-2"
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
        <div className="border-b border-neutral-800 px-4 py-3 md:px-6">
          <PageHeader
            title="技能管理"
            subtitle="查看和管理 AI 助手的可用技能"
            icon={<Sparkles className="h-5 w-5 text-cyan-300" />}
            className="bg-transparent"
            actions={(
              <>
                <button
                  onClick={() => setInstallDialogOpen(true)}
                  className="cks-btn cks-btn-primary cks-focus-ring cks-transition-fast"
                >
                  <Download className="h-4 w-4" />
                  安装技能
                </button>
                <button
                  onClick={loadSkills}
                  className="cks-btn cks-btn-secondary cks-focus-ring cks-transition-fast"
                >
                  <RefreshCw className="h-5 w-5" />
                </button>
              </>
            )}
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-white">
                <Sparkles className="h-4 w-4 text-cyan-300" />
                AI 自动搜索并安装技能
              </div>
              <p className="text-xs text-neutral-500 mt-1">输入目标后，系统会先调用 find-skills 推荐，再自动安装。</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  value={autoInstallGoal}
                  onChange={(e) => setAutoInstallGoal(e.target.value)}
                  placeholder="例如：我要自动整理桌面文件并生成周报"
                  className="cks-input flex-1 min-w-72 px-3 py-2 text-sm"
                />
                <select
                  value={autoInstallCount}
                  onChange={(e) => setAutoInstallCount(Number(e.target.value) || 1)}
                  className="cks-select rounded-lg px-2.5 py-2 text-sm text-neutral-200"
                >
                  <option value={1}>安装 1 个</option>
                  <option value={2}>安装 2 个</option>
                  <option value={3}>安装 3 个</option>
                </select>
                <button
                  type="button"
                  onClick={handleAutoDiscoverAndInstall}
                  disabled={autoInstallRunning}
                  className="cks-btn cks-btn-primary py-2 text-sm disabled:opacity-50"
                >
                  {autoInstallRunning ? '正在搜索并安装...' : '一键自动安装'}
                </button>
              </div>
              <label className="mt-2 inline-flex items-center gap-2 text-xs text-neutral-400">
                <input
                  type="checkbox"
                  checked={autoInstallRunCheck}
                  onChange={(e) => setAutoInstallRunCheck(e.target.checked)}
                />
                安装后自动体检并给出修复建议（推荐）
              </label>
              {autoInstallLogs.length > 0 && (
                <div className="mt-3 text-xs text-neutral-300 space-y-1">
                  {autoInstallLogs.map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </div>
              )}
              {autoInstallFixes.length > 0 && (
                <div className="mt-3 space-y-2">
                  <div className="text-xs text-amber-300">可执行修复建议</div>
                  {autoInstallFixes.map((item, idx) => (
                    <div key={`${item.skill}-${idx}`} className="border border-amber-500/30 bg-amber-500/10 rounded-lg p-2">
                      <div className="text-xs text-neutral-200">{item.skill}</div>
                      <div className="text-xs text-neutral-400 mt-1">{item.suggestion}</div>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => copyFixSuggestion(item.suggestion)}
                          className="px-2 py-1 text-xs rounded border border-neutral-700 text-neutral-200 hover:border-neutral-500"
                        >
                          复制建议
                        </button>
                        <button
                          type="button"
                          onClick={() => sendFixToWorkbench(item.skill, item.suggestion)}
                          className="px-2 py-1 text-xs rounded border border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/10"
                        >
                          发到工作台修复
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
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
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 text-center">
                <p className="text-2xl font-bold text-slate-300">
                  {sourceSummary.builtIn}
                </p>
                <p className="text-sm text-neutral-500 mt-1">内置来源</p>
              </div>
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 text-center">
                <p className="text-2xl font-bold text-cyan-300">
                  {readinessSummary.ready}
                </p>
                <p className="text-sm text-neutral-500 mt-1">可直接运行</p>
              </div>
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 text-center">
                <p className="text-2xl font-bold text-amber-300">
                  {readinessSummary.missing + readinessSummary.error}
                </p>
                <p className="text-sm text-neutral-500 mt-1">需修复</p>
              </div>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3">
              <div className="text-xs text-neutral-400">技能来源分布</div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="px-2 py-1 rounded border border-neutral-700 text-neutral-200 bg-neutral-800">内置 {sourceSummary.builtIn}</span>
                <span className="px-2 py-1 rounded border border-purple-500/30 text-purple-200 bg-purple-500/10">社区 {sourceSummary.community}</span>
                <span className="px-2 py-1 rounded border border-cyan-500/30 text-cyan-200 bg-cyan-500/10">插件 {sourceSummary.plugin}</span>
                <span className="px-2 py-1 rounded border border-orange-500/30 text-orange-200 bg-orange-500/10">项目/全局 {sourceSummary.project}</span>
                {sourceSummary.other > 0 && (
                  <span className="px-2 py-1 rounded border border-neutral-700 text-neutral-300 bg-black/40">其他 {sourceSummary.other}</span>
                )}
              </div>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-neutral-400">工作台技能调用热度（基于当前审计筛选）</p>
                {skillUsageRanking.length > 0 && (
                  <p className="text-[11px] text-neutral-500">Top {skillUsageRanking.length}</p>
                )}
              </div>
              {skillUsageRanking.length === 0 ? (
                <p className="text-xs text-neutral-600 mt-2">暂无技能调用记录，先去工作台执行一轮任务。</p>
              ) : (
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  {skillUsageRanking.map((row) => (
                    <span
                      key={row.name}
                      className="px-2 py-1 rounded border border-neutral-700 bg-neutral-800 text-xs text-neutral-200"
                    >
                      {row.displayName} · {row.count} 次
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-neutral-400">技能失败原因 Top（基于当前审计筛选）</p>
                {skillFailureRanking.length > 0 && (
                  <p className="text-[11px] text-neutral-500">Top {skillFailureRanking.length}</p>
                )}
              </div>
              {skillFailureRanking.length === 0 ? (
                <p className="text-xs text-neutral-600 mt-2">暂无技能失败记录。</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {skillFailureRanking.map((row, index) => (
                    <div
                      key={`${row.skillName}-${index}`}
                      className="rounded border border-neutral-800 bg-neutral-900/60 px-2 py-1.5"
                    >
                      <div className="text-xs text-neutral-200">
                        {row.skillName} · {row.count} 次
                      </div>
                      <div className="text-[11px] text-neutral-500 mt-0.5 line-clamp-2">
                        {row.reason}
                      </div>
                    </div>
                  ))}
                </div>
              )}
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

            {skillsSnapshot && (
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3">
                <div className="flex items-center gap-3 text-xs flex-wrap">
                  <span className="text-neutral-500">技能快照:</span>
                  <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300">版本 v{skillsSnapshot.version}</span>
                  <span className="text-neutral-400">技能 {skillsSnapshot.skills_count}</span>
                  <span className="text-neutral-400">工具 {skillsSnapshot.tools_count}</span>
                  {snapshotChanged === true && (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">本次已刷新</span>
                  )}
                  {snapshotChanged === false && (
                    <span className="px-2 py-0.5 rounded bg-neutral-700 text-neutral-300">本次无变化</span>
                  )}
                </div>
              </div>
            )}

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
                  className="cks-btn cks-btn-secondary inline-flex items-center gap-2 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
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
                  className="cks-input px-2 py-1.5 text-xs placeholder:text-neutral-600"
                />
                <input
                  value={auditToolName}
                  onChange={(e) => setAuditToolName(e.target.value)}
                  placeholder="工具名（可选）"
                  className="cks-input px-2 py-1.5 text-xs placeholder:text-neutral-600"
                />
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={auditLimit}
                  onChange={(e) => setAuditLimit(Math.max(1, Math.min(1000, Number(e.target.value || 1))))}
                  className="cks-input px-2 py-1.5 text-xs"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mt-2">
                <input
                  type="datetime-local"
                  value={auditFromTime}
                  onChange={(e) => setAuditFromTime(e.target.value)}
                  className="cks-input px-2 py-1.5 text-xs"
                />
                <input
                  type="datetime-local"
                  value={auditToTime}
                  onChange={(e) => setAuditToTime(e.target.value)}
                  className="cks-input px-2 py-1.5 text-xs"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={loadAuditSnapshot}
                    disabled={auditLoading}
                    className="cks-btn cks-btn-primary px-2.5 py-1.5 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
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
                    className="cks-btn cks-btn-secondary px-2.5 py-1.5 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    重置
                  </button>
                  <button
                    onClick={handleExportAuditJson}
                    disabled={auditLoading}
                    className="cks-btn cks-btn-secondary px-2.5 py-1.5 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    导出JSON
                  </button>
                  <button
                    onClick={handleExportAuditCsv}
                    disabled={auditLoading}
                    className="cks-btn cks-btn-secondary px-2.5 py-1.5 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
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
                      <EmptyState title="暂无执行记录" className="py-3" />
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
                      <EmptyState title="暂无错误记录" className="py-3" />
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
                      全部 ({onlyReadySkills ? visibleSkills.length : getSkillCount()})
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
                        {getCategoryLabel(category)} ({(onlyReadySkills ? visibleSkills : skills).filter((s) => s.category?.toLowerCase() === category.toLowerCase()).length})
                      </button>
                    ))}
                    <button
                      onClick={() => setOnlyReadySkills((v) => !v)}
                      className={cn(
                        'px-4 py-2 rounded-lg text-sm font-medium transition-colors border',
                        onlyReadySkills
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                          : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:bg-neutral-700 hover:text-white'
                      )}
                    >
                      只看可直接运行 ({readinessSummary.ready})
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Skills List */}
            <SkillsList
              skills={visibleSkills}
              isLoading={isLoading}
              category={selectedCategory}
              readinessMap={readinessMap}
              onViewContext={handleViewContext}
              onUninstall={handleUninstall}
              onRunTest={handleRunSkillTest}
              onRunInWorkbench={handleRunInWorkbench}
              onEditAlias={handleEditAlias}
              onRunExample={handleRunExample}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
