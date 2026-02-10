import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Download,
  Filter,
  Plus,
  RefreshCw,
  Search as SearchIcon,
  Trash2,
  Wrench,
  Zap,
} from 'lucide-react'
import { MemoryList, SearchBar } from '@/components/memory'
import { PageHeader } from '@/components/ui'
import { AgentService } from '@/services/agentService'
import { useMemoryStore } from '@/stores'
import type { Memory as MemoryItem } from '@/types/agent'
import { cn } from '@/utils/cn'

const MEMORY_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  all: { label: '全部', color: 'bg-neutral-800 text-neutral-300' },
  user_info: { label: '用户信息', color: 'bg-blue-500/20 text-blue-400' },
  preference: { label: '偏好设置', color: 'bg-purple-500/20 text-purple-400' },
  project: { label: '项目', color: 'bg-green-500/20 text-green-400' },
  skill: { label: '技能', color: 'bg-yellow-500/20 text-yellow-400' },
  task: { label: '任务', color: 'bg-orange-500/20 text-orange-400' },
  manual: { label: '手动添加', color: 'bg-pink-500/20 text-pink-400' },
  conversation: { label: '对话记忆', color: 'bg-neutral-700 text-neutral-300' },
}

const USER_ID = 'default-user'

type SortMode = 'relevance' | 'time' | 'importance'
type SourceFilter = 'all' | 'direct_match' | 'vector' | 'keyword'

function parseTime(value?: string): number {
  if (!value) return 0
  const ts = Date.parse(value)
  return Number.isFinite(ts) ? ts : 0
}

function getRelevanceScore(memory: MemoryItem): number {
  if (typeof memory.final_score === 'number') return memory.final_score
  if (typeof memory.score === 'number') return memory.score
  if (typeof memory.vector_score === 'number') return memory.vector_score
  if (typeof memory.text_score === 'number') return memory.text_score
  return (memory.importance ?? 5) / 10
}

function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(objectUrl)
}

function toCsvValue(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function toMemoryCsvRows(memories: MemoryItem[]): string {
  const headers = ['id', 'memory_type', 'source', 'importance', 'access_count', 'score', 'final_score', 'created_at', 'content', 'stale', 'conflict_status']
  const lines = [headers.map(toCsvValue).join(',')]
  for (const memory of memories) {
    const row = [
      memory.id,
      memory.memory_type,
      memory.source || '',
      memory.importance ?? '',
      memory.access_count ?? '',
      memory.score ?? '',
      memory.final_score ?? '',
      memory.created_at,
      memory.content,
      (memory as any).stale ?? '',
      (memory as any).conflict_status ?? '',
    ]
    lines.push(row.map(toCsvValue).join(','))
  }
  return lines.join('\\n')
}

export const Memory = () => {
  const memories = useMemoryStore((state) => state.memories)
  const filteredMemories = useMemoryStore((state) => state.filteredMemories)
  const isLoading = useMemoryStore((state) => state.isLoading)
  const searchQuery = useMemoryStore((state) => state.searchQuery)
  const setMemories = useMemoryStore((state) => state.setMemories)
  const setSearchQuery = useMemoryStore((state) => state.setSearchQuery)
  const filterMemories = useMemoryStore((state) => state.filterMemories)
  const deleteMemory = useMemoryStore((state) => state.deleteMemory)
  const clearMemories = useMemoryStore((state) => state.clearMemories)
  const setLoading = useMemoryStore((state) => state.setLoading)

  const [showAddForm, setShowAddForm] = useState(false)
  const [newMemoryContent, setNewMemoryContent] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [selectedType, setSelectedType] = useState<string>('all')
  const [useHybridSearch, setUseHybridSearch] = useState(true)
  const [showScoreDetails, setShowScoreDetails] = useState(true)
  const [sortMode, setSortMode] = useState<SortMode>('relevance')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [onlyImportant, setOnlyImportant] = useState(false)
  const [onlyPendingConflicts, setOnlyPendingConflicts] = useState(false)
  const [isCompacting, setIsCompacting] = useState(false)
  const [compactSummary, setCompactSummary] = useState('')
  const [isPreviewingCompact, setIsPreviewingCompact] = useState(false)
  const [maintenanceReport, setMaintenanceReport] = useState<{
    pending_conflicts: number
    stale_memories: number
    dedupe_candidates: number
    stale_prune_candidates: number
    generated_at: string
  } | null>(null)

  const loadMemories = useCallback(async () => {
    setLoading(true)
    try {
      const result = await AgentService.listMemories(USER_ID, undefined, 200)
      if (result?.success) {
        setMemories(result.memories)
      }
    } catch (error) {
      console.error('Failed to load memories:', error)
    } finally {
      setLoading(false)
    }
  }, [setLoading, setMemories])

  useEffect(() => {
    loadMemories()
  }, [loadMemories])

  useEffect(() => {
    const runHealthCheck = async () => {
      try {
        const autoRun = await AgentService.autoRunMemoryMaintenance(USER_ID, 24, false, 0.985, 120)
        if (autoRun?.success && autoRun.ran) {
          setCompactSummary(
            `自动维护已执行：去重 ${autoRun.deduplicated ?? 0} 条，清理过期噪声 ${autoRun.pruned_stale ?? 0} 条。`
          )
          await loadMemories()
        }
      } catch (error) {
        console.error('Auto-run memory maintenance failed:', error)
      }

      try {
        const reportResult = await AgentService.getMemoryMaintenanceReport(USER_ID, 0.985, 120)
        if (reportResult?.success && reportResult.report) {
          setMaintenanceReport({
            pending_conflicts: reportResult.report.pending_conflicts,
            stale_memories: reportResult.report.stale_memories,
            dedupe_candidates: reportResult.report.dedupe_candidates,
            stale_prune_candidates: reportResult.report.stale_prune_candidates,
            generated_at: reportResult.report.generated_at,
          })
        }
      } catch (error) {
        console.error('Failed to load memory maintenance report:', error)
      }
    }

    runHealthCheck()
  }, [loadMemories])

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query)
    if (!query.trim()) {
      filterMemories('')
      return
    }

    try {
      const result = useHybridSearch
        ? await AgentService.hybridSearchMemories(USER_ID, query, 30)
        : await AgentService.searchMemories(USER_ID, query, 30)
      if (result?.success) {
        useMemoryStore.getState().setFilteredMemories(result.memories)
      } else {
        filterMemories(query)
      }
    } catch (error) {
      console.error('Failed to search memories:', error)
      filterMemories(query)
    }
  }, [filterMemories, setSearchQuery, useHybridSearch])

  const handleDelete = useCallback(async (id: string) => {
    if (!window.confirm('确定要删除这条记忆吗？')) return
    try {
      const result = await AgentService.deleteMemory(id)
      if (result?.success) deleteMemory(id)
    } catch (error) {
      console.error('Failed to delete memory:', error)
    }
  }, [deleteMemory])

  const handleAddMemory = useCallback(async () => {
    const content = newMemoryContent.trim()
    if (!content) return

    setIsAdding(true)
    try {
      const result = await AgentService.saveMemory({
        user_id: USER_ID,
        content,
        memory_type: 'manual',
      })
      if (result?.success) {
        setNewMemoryContent('')
        setShowAddForm(false)
        await loadMemories()
      }
    } catch (error) {
      console.error('Failed to add memory:', error)
    } finally {
      setIsAdding(false)
    }
  }, [newMemoryContent, loadMemories])

  const handleClearAll = useCallback(async () => {
    const confirmed = window.confirm('确定要清空该用户的全部记忆吗？此操作不可恢复。')
    if (!confirmed) return

    setIsClearing(true)
    try {
      const result = await AgentService.clearAllMemories(USER_ID, true)
      if (result?.success) {
        clearMemories()
        setSearchQuery('')
      }
    } catch (error) {
      console.error('Failed to clear memories:', error)
    } finally {
      setIsClearing(false)
    }
  }, [clearMemories, setSearchQuery])

  const refreshMaintenanceReport = useCallback(async () => {
    try {
      const reportResult = await AgentService.getMemoryMaintenanceReport(USER_ID, 0.985, 120)
      if (reportResult?.success && reportResult.report) {
        setMaintenanceReport({
          pending_conflicts: reportResult.report.pending_conflicts,
          stale_memories: reportResult.report.stale_memories,
          dedupe_candidates: reportResult.report.dedupe_candidates,
          stale_prune_candidates: reportResult.report.stale_prune_candidates,
          generated_at: reportResult.report.generated_at,
        })
      }
    } catch (error) {
      console.error('Failed to refresh maintenance report:', error)
    }
  }, [])

  const handleCompact = useCallback(async () => {
    setIsCompacting(true)
    setCompactSummary('')
    try {
      const result = await AgentService.compactMemories(USER_ID, 0.985, 120, false)
      if (result?.success) {
        setCompactSummary(`维护完成：去重 ${result.deduplicated ?? 0} 条，清理过期噪声 ${result.pruned_stale ?? 0} 条。`)
        await loadMemories()
        await refreshMaintenanceReport()
      } else {
        setCompactSummary(`维护失败：${result?.error || '未知错误'}`)
      }
    } catch (error) {
      console.error('Failed to compact memories:', error)
      setCompactSummary('维护失败：请稍后重试。')
    } finally {
      setIsCompacting(false)
    }
  }, [loadMemories, refreshMaintenanceReport])

  const handlePreviewCompact = useCallback(async () => {
    setIsPreviewingCompact(true)
    setCompactSummary('')
    try {
      const result = await AgentService.compactMemories(USER_ID, 0.985, 120, true)
      if (result?.success) {
        setCompactSummary(
          `预览结果：可去重 ${result.deduplicated ?? 0} 条，可清理过期噪声 ${result.pruned_stale ?? 0} 条（总量 ${result.total_before ?? 0} 条）。`
        )
        await refreshMaintenanceReport()
      } else {
        setCompactSummary(`预览失败：${result?.error || '未知错误'}`)
      }
    } catch (error) {
      console.error('Failed to preview memory compact:', error)
      setCompactSummary('预览失败：请稍后重试。')
    } finally {
      setIsPreviewingCompact(false)
    }
  }, [refreshMaintenanceReport])

  const handleResolveConflict = useCallback(async (memoryId: string) => {
    const confirmed = window.confirm('确认采用当前记忆并标记冲突已处理吗？')
    if (!confirmed) return

    try {
      const result = await AgentService.resolveMemoryConflict(memoryId, 'accept_current')
      if (result?.success) {
        setCompactSummary(`冲突处理完成：已更新 ${result.updated ?? 0} 条记录。`)
        await loadMemories()
        await refreshMaintenanceReport()
      } else {
        setCompactSummary(`冲突处理失败：${result?.error || '未知错误'}`)
      }
    } catch (error) {
      console.error('Failed to resolve memory conflict:', error)
      setCompactSummary('冲突处理失败：请稍后重试。')
    }
  }, [loadMemories, refreshMaintenanceReport])

  const memoryStats = useMemo(() => {
    const stats: Record<string, number> = {}
    for (const memory of memories) {
      const type = memory.memory_type || 'unknown'
      stats[type] = (stats[type] || 0) + 1
    }
    return stats
  }, [memories])

  const displayedMemories = useMemo(() => {
    const base = searchQuery.trim() ? filteredMemories : memories
    const scopedByType = selectedType === 'all' ? base : base.filter((memory) => memory.memory_type === selectedType)
    const scopedBySource = sourceFilter === 'all' ? scopedByType : scopedByType.filter((memory) => memory.source === sourceFilter)
    const scopedByImportance = onlyImportant ? scopedBySource.filter((memory) => (memory.importance ?? 0) >= 8) : scopedBySource
    const scopedByConflict = onlyPendingConflicts
      ? scopedByImportance.filter((memory) => memory.conflict_status === 'pending_review')
      : scopedByImportance

    const sorted = [...scopedByConflict]
    if (sortMode === 'time') {
      sorted.sort((left, right) => parseTime(right.created_at) - parseTime(left.created_at))
      return sorted
    }

    if (sortMode === 'importance') {
      sorted.sort((left, right) => {
        const deltaImportance = (right.importance ?? 5) - (left.importance ?? 5)
        if (deltaImportance !== 0) return deltaImportance
        return parseTime(right.created_at) - parseTime(left.created_at)
      })
      return sorted
    }

    sorted.sort((left, right) => {
      const deltaScore = getRelevanceScore(right) - getRelevanceScore(left)
      if (deltaScore !== 0) return deltaScore
      return parseTime(right.created_at) - parseTime(left.created_at)
    })
    return sorted
  }, [filteredMemories, memories, onlyImportant, onlyPendingConflicts, searchQuery, selectedType, sortMode, sourceFilter])

  const handleExport = useCallback((format: 'json' | 'csv') => {
    const now = new Date()
    const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
    if (format === 'json') {
      downloadTextFile(`memory-export-${stamp}.json`, JSON.stringify(displayedMemories, null, 2), 'application/json;charset=utf-8')
      return
    }
    downloadTextFile(`memory-export-${stamp}.csv`, toMemoryCsvRows(displayedMemories), 'text/csv;charset=utf-8')
  }, [displayedMemories])

  const importantMemoriesCount = useMemo(
    () => memories.filter((memory) => (memory.importance ?? 0) >= 8).length,
    [memories]
  )

  const explainedCount = useMemo(
    () => displayedMemories.filter((memory) => typeof memory.final_score === 'number' || typeof memory.score === 'number').length,
    [displayedMemories]
  )

  return (
    <div className="h-full flex flex-col bg-black text-white">
      <div className="border-b border-neutral-900 px-4 py-4 md:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-4">
            <PageHeader
              title="记忆中心"
              subtitle="管理长期记忆，支持检索、筛选、冲突处理与维护巡检"
              icon={<SearchIcon className="h-5 w-5 text-neutral-400" />}
              actions={(
                <>
              <button
                onClick={() => setUseHybridSearch((prev) => !prev)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs border transition-colors',
                  useHybridSearch
                    ? 'border-green-600 bg-green-500/10 text-green-300'
                    : 'border-neutral-700 text-neutral-400 hover:text-white'
                )}
              >
                <Zap className="h-3.5 w-3.5 inline mr-1" />
                {useHybridSearch ? '混合搜索' : '关键词搜索'}
              </button>
              <button
                onClick={() => setShowScoreDetails((prev) => !prev)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs border transition-colors',
                  showScoreDetails
                    ? 'border-blue-600 bg-blue-500/10 text-blue-300'
                    : 'border-neutral-700 text-neutral-400 hover:text-white'
                )}
              >
                评分详情
              </button>
              <button
                onClick={() => setShowAddForm((prev) => !prev)}
                className="cks-btn cks-btn-secondary"
              >
                <Plus className="h-3.5 w-3.5 inline mr-1" />新增
              </button>
              <button
                onClick={loadMemories}
                className="cks-btn cks-btn-secondary"
              >
                <RefreshCw className="h-3.5 w-3.5 inline mr-1" />刷新
              </button>
              <button
                onClick={handleClearAll}
                disabled={isClearing}
                className="cks-btn cks-btn-danger border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5 inline mr-1" />清空
              </button>
              <button
                onClick={handleCompact}
                disabled={isCompacting}
                className="cks-btn cks-btn-primary disabled:opacity-50"
              >
                <Wrench className="h-3.5 w-3.5 inline mr-1" />{isCompacting ? '维护中...' : '抗腐蚀维护'}
              </button>
              <button
                onClick={handlePreviewCompact}
                disabled={isPreviewingCompact}
                className="cks-btn cks-btn-secondary disabled:opacity-50"
              >
                {isPreviewingCompact ? '预览中...' : '预览维护'}
              </button>
                </>
              )}
            />
          </div>

          <div className="mb-4">
            <SearchBar onSearch={handleSearch} placeholder="搜索记忆内容/关键词" />
          </div>

          <div className="flex items-start gap-2 text-xs text-neutral-500 mb-3">
            <Filter className="h-3.5 w-3.5 mt-0.5" />
            <span>
              当前模式：{useHybridSearch ? '混合检索（语义 + 关键词）' : '关键词检索'}。
              可按类型、来源、重要度与冲突状态进一步过滤。
            </span>
          </div>

          {compactSummary && (
            <div className="mb-3 rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-3 py-2 text-xs text-cyan-200">
              {compactSummary}
            </div>
          )}

          {maintenanceReport && (
            <div className="mb-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-neutral-300">
                待处理冲突：{maintenanceReport.pending_conflicts}
              </div>
              <div className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-neutral-300">
                已过期记忆：{maintenanceReport.stale_memories}
              </div>
              <div className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-neutral-300">
                可去重：{maintenanceReport.dedupe_candidates}
              </div>
              <div className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-neutral-300">
                可清理噪声：{maintenanceReport.stale_prune_candidates}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 mb-3">
            {Object.entries(MEMORY_TYPE_CONFIG).map(([type, config]) => {
              const count = type === 'all' ? memories.length : (memoryStats[type] || 0)
              if (type !== 'all' && count === 0) return null
              return (
                <button
                  key={type}
                  onClick={() => setSelectedType(type)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                    selectedType === type
                      ? config.color + ' ring-1 ring-white/30'
                      : 'bg-neutral-900 text-neutral-500 hover:text-white border border-neutral-800'
                  )}
                >
                  {config.label} ({count})
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
              className="cks-input px-2 py-1.5 text-xs"
            >
              <option value="relevance">按相关度</option>
              <option value="time">按时间</option>
              <option value="importance">按重要度</option>
            </select>

            <select
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}
              className="cks-input px-2 py-1.5 text-xs"
            >
              <option value="all">全部来源</option>
              <option value="direct_match">直匹配</option>
              <option value="vector">向量检索</option>
              <option value="keyword">关键词检索</option>
            </select>

            <button
              onClick={() => setOnlyImportant((prev) => !prev)}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs border transition-colors',
                onlyImportant
                  ? 'border-orange-500/60 bg-orange-500/10 text-orange-300'
                  : 'border-neutral-700 text-neutral-300 hover:text-white'
              )}
            >
              仅高重要度
            </button>

            <button
              onClick={() => setOnlyPendingConflicts((prev) => !prev)}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs border transition-colors',
                onlyPendingConflicts
                  ? 'border-rose-500/60 bg-rose-500/10 text-rose-300'
                  : 'border-neutral-700 text-neutral-300 hover:text-white'
              )}
            >
              仅看待处理冲突
            </button>

            <button
              onClick={() => handleExport('json')}
              className="px-3 py-1.5 rounded-md text-xs border border-neutral-700 text-neutral-300 hover:text-white"
            >
              <Download className="h-3.5 w-3.5 inline mr-1" />导出 JSON
            </button>

            <button
              onClick={() => handleExport('csv')}
              className="px-3 py-1.5 rounded-md text-xs border border-neutral-700 text-neutral-300 hover:text-white"
            >
              <Download className="h-3.5 w-3.5 inline mr-1" />导出 CSV
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {showAddForm && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5">
              <h3 className="text-base font-semibold text-white mb-3">新增记忆</h3>
              <textarea
                value={newMemoryContent}
                onChange={(event) => setNewMemoryContent(event.target.value)}
                placeholder="输入要保存的记忆..."
                rows={3}
                className="cks-textarea w-full px-4 py-3 resize-none"
              />
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={handleAddMemory}
                  disabled={isAdding || !newMemoryContent.trim()}
                  className="cks-btn cks-btn-primary py-2 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isAdding ? '保存中...' : '保存'}
                </button>
                <button
                  onClick={() => {
                    setShowAddForm(false)
                    setNewMemoryContent('')
                  }}
                  className="px-4 py-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-900 transition-colors text-sm font-medium"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-white">{importantMemoriesCount}</p>
              <p className="text-xs text-neutral-500 mt-1">高重要度记忆</p>
            </div>
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-white">{memoryStats.conversation || 0}</p>
              <p className="text-xs text-neutral-500 mt-1">对话记忆</p>
            </div>
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-white">{displayedMemories.length}</p>
              <p className="text-xs text-neutral-500 mt-1">当前展示</p>
            </div>
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-white">{explainedCount}</p>
              <p className="text-xs text-neutral-500 mt-1">可解释条数</p>
            </div>
          </div>

          {!useHybridSearch && searchQuery.trim() && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
              <AlertTriangle className="h-4 w-4 mt-0.5" />
              <span>当前为关键词检索模式，语义召回能力会下降，建议切回混合搜索。</span>
            </div>
          )}

          <MemoryList
            memories={displayedMemories}
            isLoading={isLoading}
            onDelete={handleDelete}
            onResolveConflict={handleResolveConflict}
            searchQuery={searchQuery}
            showScoreDetails={showScoreDetails && Boolean(searchQuery.trim())}
          />
        </div>
      </div>
    </div>
  )
}
