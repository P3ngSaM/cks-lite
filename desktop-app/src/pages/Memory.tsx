import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, RefreshCw, Zap, Search as SearchIcon, Trash2, AlertTriangle, Filter } from 'lucide-react'
import { MemoryList, SearchBar } from '@/components/memory'
import { AgentService } from '@/services/agentService'
import { useMemoryStore } from '@/stores'
import { cn } from '@/utils/cn'

// Memory type labels and colors
const MEMORY_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  all: { label: '全部', color: 'bg-neutral-800 text-neutral-300' },
  user_info: { label: '用户信息', color: 'bg-blue-500/20 text-blue-400' },
  preference: { label: '偏好设置', color: 'bg-purple-500/20 text-purple-400' },
  project: { label: '项目', color: 'bg-green-500/20 text-green-400' },
  skill: { label: '技能', color: 'bg-yellow-500/20 text-yellow-400' },
  task: { label: '任务', color: 'bg-orange-500/20 text-orange-400' },
  manual: { label: '手动添加', color: 'bg-pink-500/20 text-pink-400' },
  conversation: { label: '对话记录', color: 'bg-neutral-700 text-neutral-400' },
}

export const Memory = () => {
  // Use Zustand store for memory state
  const memories = useMemoryStore((state) => state.memories)
  const filteredMemories = useMemoryStore((state) => state.filteredMemories)
  const isLoading = useMemoryStore((state) => state.isLoading)
  const searchQuery = useMemoryStore((state) => state.searchQuery)
  const setMemories = useMemoryStore((state) => state.setMemories)
  const setSearchQuery = useMemoryStore((state) => state.setSearchQuery)
  const filterMemories = useMemoryStore((state) => state.filterMemories)
  const deleteMemory = useMemoryStore((state) => state.deleteMemory)
  const setLoading = useMemoryStore((state) => state.setLoading)

  // Local UI state (not persisted)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newMemoryContent, setNewMemoryContent] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [useHybridSearch, setUseHybridSearch] = useState(true) // 默认使用混合搜索
  const [showClearConfirm, setShowClearConfirm] = useState(false) // 清空确认对话框
  const [clearStep, setClearStep] = useState(1) // 确认步骤 (1=警告, 2=最终确认)
  const [isClearing, setIsClearing] = useState(false) // 清空中状态
  const [selectedType, setSelectedType] = useState<string>('all') // 默认显示全部（但过滤conversation）
  const [showConversations] = useState(false) // 是否显示对话记录 (TODO: add UI toggle)

  // Load memories
  const loadMemories = useCallback(async () => {
    setLoading(true)
    try {
      const result = await AgentService.listMemories('default-user', undefined, 100)
      if (result && result.success) {
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

  // Search memories with hybrid search support
  const handleSearch = useCallback(
    async (query: string) => {
      setSearchQuery(query)

      if (!query.trim()) {
        filterMemories('')
        return
      }

      try {
        // 使用混合搜索或纯向量搜索
        const result = useHybridSearch
          ? await AgentService.hybridSearchMemories('default-user', query, 20)
          : await AgentService.searchMemories('default-user', query, 20)

        if (result && result.success) {
          useMemoryStore.getState().setFilteredMemories(result.memories)
        } else {
          filterMemories(query)
        }
      } catch (error) {
        console.error('Failed to search memories:', error)
        filterMemories(query)
      }
    },
    [setSearchQuery, filterMemories, useHybridSearch]
  )

  // Delete memory
  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('确定要删除这条记忆吗？')) return

    try {
      const result = await AgentService.deleteMemory(id)
      if (result && result.success) {
        deleteMemory(id)
      }
    } catch (error) {
      console.error('Failed to delete memory:', error)
    }
  }, [deleteMemory])

  // Add new memory
  const handleAddMemory = useCallback(async () => {
    const content = newMemoryContent.trim()
    if (!content) return

    setIsAdding(true)
    try {
      const result = await AgentService.saveMemory({
        user_id: 'default-user',
        content,
        memory_type: 'manual'
      })

      if (result && result.success) {
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

  // Clear all memories
  const handleClearAll = useCallback(async () => {
    setIsClearing(true)
    try {
      const result = await AgentService.clearAllMemories('default-user', true)

      if (result && result.success) {
        // 清空成功，重新加载
        setMemories([])
        setShowClearConfirm(false)
        setClearStep(1)

        // 显示成功消息
        alert(result.message || `已清空 ${result.cleared_count || 0} 条记忆`)
      } else {
        alert('清空失败: ' + (result?.error || '未知错误'))
      }
    } catch (error) {
      console.error('Failed to clear memories:', error)
      alert('清空失败: ' + String(error))
    } finally {
      setIsClearing(false)
    }
  }, [setMemories])

  // Compute memory type statistics
  const memoryStats = useMemo(() => {
    const stats: Record<string, number> = {}
    memories.forEach((m) => {
      const type = m.memory_type || 'unknown'
      stats[type] = (stats[type] || 0) + 1
    })
    return stats
  }, [memories])

  // Compute displayed memories based on filters
  const displayedMemories = useMemo(() => {
    let result = searchQuery ? filteredMemories : memories

    // Filter by type
    if (selectedType !== 'all') {
      result = result.filter((m) => m.memory_type === selectedType)
    } else if (!showConversations) {
      // By default, hide conversation type in "all" view
      result = result.filter((m) => m.memory_type !== 'conversation')
    }

    return result
  }, [memories, filteredMemories, searchQuery, selectedType, showConversations])

  // Count non-conversation memories
  const importantMemoriesCount = useMemo(() => {
    return memories.filter((m) => m.memory_type !== 'conversation').length
  }, [memories])

  return (
    <div className="flex flex-col h-full bg-black">
      {/* Danger Confirm Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-neutral-900 border-2 border-red-500/50 rounded-xl max-w-md w-full p-6 shadow-2xl">
            {/* Warning Icon */}
            <div className="flex justify-center mb-4">
              <div className="p-3 rounded-full bg-red-500/20 border border-red-500/50">
                <AlertTriangle className="h-8 w-8 text-red-500" />
              </div>
            </div>

            {clearStep === 1 ? (
              <>
                {/* Step 1: Warning */}
                <h2 className="text-xl font-bold text-white text-center mb-2">
                  ⚠️ 危险操作警告
                </h2>
                <p className="text-sm text-neutral-400 text-center mb-6">
                  你即将清空所有记忆数据
                </p>

                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
                  <p className="text-sm text-red-300 font-medium mb-3">
                    此操作将会：
                  </p>
                  <ul className="text-xs text-red-400 space-y-2 list-disc list-inside">
                    <li>删除数据库中的所有记忆 ({memories.length} 条)</li>
                    <li>清空向量索引（FAISS）</li>
                    <li>重置 MEMORY.md 文件</li>
                    <li>此操作<strong className="text-red-300">不可撤销</strong></li>
                  </ul>
                </div>

                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-6">
                  <p className="text-xs text-blue-300">
                    ✅ 系统会自动创建备份文件，保存在 <code className="text-blue-200">backups/</code> 目录
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowClearConfirm(false)
                      setClearStep(1)
                    }}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-neutral-800 text-white hover:bg-neutral-700 transition-colors text-sm font-medium"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => setClearStep(2)}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30 transition-colors text-sm font-medium"
                  >
                    我了解风险，继续
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Step 2: Final Confirmation */}
                <h2 className="text-xl font-bold text-red-500 text-center mb-2">
                  🚨 最后确认
                </h2>
                <p className="text-sm text-neutral-400 text-center mb-6">
                  请再次确认你的操作
                </p>

                <div className="bg-neutral-800 rounded-lg p-4 mb-6">
                  <p className="text-sm text-white font-medium mb-2">
                    即将清空：
                  </p>
                  <p className="text-2xl font-bold text-red-400 text-center">
                    {memories.length} 条记忆
                  </p>
                </div>

                <p className="text-xs text-neutral-500 text-center mb-6">
                  清空后，AI 将无法记住任何历史对话和用户信息。
                  <br />
                  你确定要继续吗？
                </p>

                <div className="flex gap-3">
                  <button
                    onClick={() => setClearStep(1)}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-neutral-800 text-white hover:bg-neutral-700 transition-colors text-sm font-medium"
                  >
                    返回
                  </button>
                  <button
                    onClick={handleClearAll}
                    disabled={isClearing}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-bold"
                  >
                    {isClearing ? '清空中...' : '确认清空'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="border-b border-neutral-800 px-6 py-5">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-semibold text-white">
                记忆管理
              </h1>
              <p className="text-sm text-neutral-500 mt-1">
                记住用户的关键信息
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowClearConfirm(true)}
                className="p-2 rounded-lg text-neutral-600 hover:text-red-500 hover:bg-red-500/10 transition-colors group"
                title="清空所有记忆（危险操作）"
              >
                <Trash2 className="h-5 w-5" />
              </button>
              <button
                onClick={loadMemories}
                className="p-2 rounded-lg text-neutral-500 hover:text-white hover:bg-neutral-900 transition-colors"
              >
                <RefreshCw className="h-5 w-5" />
              </button>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black hover:bg-neutral-200 transition-colors"
              >
                <Plus className="h-5 w-5" />
                <span className="text-sm font-medium">添加记忆</span>
              </button>
            </div>
          </div>

          {/* Search Mode Toggle + Search Bar */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setUseHybridSearch(!useHybridSearch)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  useHybridSearch
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'bg-neutral-900 text-neutral-500 border border-neutral-800 hover:border-neutral-700'
                }`}
              >
                {useHybridSearch ? (
                  <>
                    <Zap className="h-3.5 w-3.5" />
                    <span>混合搜索 (BM25+向量)</span>
                  </>
                ) : (
                  <>
                    <SearchIcon className="h-3.5 w-3.5" />
                    <span>向量搜索</span>
                  </>
                )}
              </button>
              <span className="text-xs text-neutral-600">
                {useHybridSearch
                  ? '关键字+语义理解，更精准'
                  : '纯语义理解，更广泛'}
              </span>
            </div>

            <SearchBar onSearch={handleSearch} />

            {/* Type Filter Tabs */}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <Filter className="h-4 w-4 text-neutral-600" />
              {/* All tab */}
              <button
                onClick={() => setSelectedType('all')}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                  selectedType === 'all'
                    ? 'bg-white text-black'
                    : 'bg-neutral-900 text-neutral-500 hover:text-white border border-neutral-800'
                )}
              >
                重要记忆 ({importantMemoriesCount})
              </button>

              {/* Dynamic type tabs */}
              {Object.entries(memoryStats)
                .filter(([type]) => type !== 'conversation')
                .map(([type, count]) => {
                  const config = MEMORY_TYPE_CONFIG[type] || { label: type, color: 'bg-neutral-800 text-neutral-300' }
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

              {/* Conversation toggle */}
              {memoryStats.conversation > 0 && (
                <button
                  onClick={() => {
                    if (selectedType === 'conversation') {
                      setSelectedType('all')
                    } else {
                      setSelectedType('conversation')
                    }
                  }}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-medium transition-all ml-2',
                    selectedType === 'conversation'
                      ? 'bg-neutral-700 text-neutral-300 ring-1 ring-white/30'
                      : 'bg-neutral-900 text-neutral-600 hover:text-neutral-400 border border-neutral-800'
                  )}
                >
                  对话记录 ({memoryStats.conversation})
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Add Memory Form */}
          {showAddForm && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5">
              <div className="space-y-4">
                <h3 className="text-base font-semibold text-white">
                  添加新记忆
                </h3>
                <textarea
                  value={newMemoryContent}
                  onChange={(e) => setNewMemoryContent(e.target.value)}
                  placeholder="输入记忆内容..."
                  rows={3}
                  className="w-full px-4 py-3 rounded-lg resize-none bg-black text-white border border-neutral-800 focus:outline-none focus:border-white placeholder:text-neutral-600 transition-colors text-sm"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleAddMemory}
                    disabled={isAdding || !newMemoryContent.trim()}
                    className="px-4 py-2 rounded-lg bg-white text-black hover:bg-neutral-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
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
            </div>
          )}

          {/* Memory Stats */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-white">
                {importantMemoriesCount}
              </p>
              <p className="text-xs text-neutral-500 mt-1">重要记忆</p>
            </div>
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-white">
                {memoryStats.conversation || 0}
              </p>
              <p className="text-xs text-neutral-500 mt-1">对话记录</p>
            </div>
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-white">
                {displayedMemories.length}
              </p>
              <p className="text-xs text-neutral-500 mt-1">当前显示</p>
            </div>
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-white">
                {memoryStats.manual || 0}
              </p>
              <p className="text-xs text-neutral-500 mt-1">手动添加</p>
            </div>
          </div>

          {/* Memory List */}
          <MemoryList
            memories={displayedMemories}
            isLoading={isLoading}
            onDelete={handleDelete}
            searchQuery={searchQuery}
          />
        </div>
      </div>
    </div>
  )
}
