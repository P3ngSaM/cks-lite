import { SkillCard } from './SkillCard'
import { LoadingDots } from '@/components/ui'
import type { Skill, SkillReadiness } from '@/types/agent'

export interface SkillsListProps {
  skills: Skill[]
  isLoading?: boolean
  category?: string
  readinessMap?: Record<string, SkillReadiness>
  onViewContext?: (skillName: string) => void
  onUninstall?: (skillName: string) => void
  onRunTest?: (skillName: string) => void
  onRunInWorkbench?: (skillName: string) => void
  onEditAlias?: (skillName: string) => void
  onRunExample?: (skillName: string) => void
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

export const SkillsList = ({
  skills,
  isLoading,
  category,
  readinessMap,
  onViewContext,
  onUninstall,
  onRunTest,
  onRunInWorkbench,
  onEditAlias,
  onRunExample,
}: SkillsListProps) => {
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingDots />
      </div>
    )
  }

  const filteredSkills = category
    ? skills.filter((s) => s.category?.toLowerCase() === category.toLowerCase())
    : skills

  const displayCategory = category
    ? (categoryLabelMap[category.toLowerCase()] || category)
    : ''

  if (filteredSkills.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-neutral-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">
            {category ? `${displayCategory}分类下暂无技能` : '暂无技能'}
          </h3>
          <p className="text-sm text-neutral-500">
            技能可以扩展 AI 的能力，帮助完成特定任务。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {filteredSkills.map((skill) => (
        <SkillCard
          key={skill.name}
          skill={skill}
          readiness={readinessMap?.[skill.name]}
          onViewContext={onViewContext}
          onUninstall={onUninstall}
          onRunTest={onRunTest}
          onRunInWorkbench={onRunInWorkbench}
          onEditAlias={onEditAlias}
          onRunExample={onRunExample}
        />
      ))}
    </div>
  )
}
