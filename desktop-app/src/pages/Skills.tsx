import { useEffect, useState, useCallback } from 'react'
import { Filter, RefreshCw, X, FileText, Download } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { SkillsList, InstallSkillDialog } from '@/components/skills'
import { AgentService } from '@/services/agentService'
import { useSkillsStore } from '@/stores'
import { cn } from '@/utils/cn'

export const Skills = () => {
  const skills = useSkillsStore((state) => state.skills)
  const isLoading = useSkillsStore((state) => state.isLoading)
  const selectedCategory = useSkillsStore((state) => state.selectedCategory)
  const setSkills = useSkillsStore((state) => state.setSkills)
  const setLoading = useSkillsStore((state) => state.setLoading)
  const setSelectedCategory = useSkillsStore((state) => state.setSelectedCategory)

  // Install dialog state
  const [installDialogOpen, setInstallDialogOpen] = useState(false)

  // Context viewer state
  const [contextModal, setContextModal] = useState<{
    isOpen: boolean
    skillName: string
    content: string
    isLoading: boolean
  }>({
    isOpen: false,
    skillName: '',
    content: '',
    isLoading: false
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

  // Check if should refetch
  const lastFetchTime = useSkillsStore((state) => state.lastFetchTime)
  const shouldRefetch = () => {
    if (!lastFetchTime) return true
    return Date.now() - lastFetchTime > 5 * 60 * 1000
  }

  const loadSkills = async () => {
    setLoading(true)
    try {
      const result = await AgentService.listSkills()
      if (result && result.success) {
        setSkills(result.skills)
      }
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
      isLoading: true
    })

    try {
      const result = await AgentService.getSkillContext(skillName)
      if (result && result.success && result.context) {
        setContextModal(prev => ({
          ...prev,
          content: result.context || '',
          isLoading: false
        }))
      } else {
        setContextModal(prev => ({
          ...prev,
          content: '无法加载技能文档',
          isLoading: false
        }))
      }
    } catch (error) {
      console.error('Failed to load skill context:', error)
      setContextModal(prev => ({
        ...prev,
        content: '加载失败: ' + String(error),
        isLoading: false
      }))
    }
  }, [])

  const closeContextModal = useCallback(() => {
    setContextModal({
      isOpen: false,
      skillName: '',
      content: '',
      isLoading: false
    })
  }, [])

  const handleUninstall = async (skillName: string) => {
    if (!confirm(`确定卸载 "${skillName}"?`)) return
    const result = await AgentService.uninstallSkill(skillName)
    if (result?.success) loadSkills()
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
              <button
                onClick={closeContextModal}
                className="p-2 rounded-lg hover:bg-neutral-800 transition-colors"
              >
                <X className="h-5 w-5 text-neutral-400" />
              </button>
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
                    {contextModal.content}
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
                        {category} ({getSkillCount(category)})
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
              onViewContext={handleViewContext}
              onUninstall={handleUninstall}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
