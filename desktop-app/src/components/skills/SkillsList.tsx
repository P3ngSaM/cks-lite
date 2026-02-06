import { SkillCard } from './SkillCard'
import { LoadingDots } from '@/components/ui'
import type { Skill } from '@/types/agent'

export interface SkillsListProps {
  skills: Skill[]
  isLoading?: boolean
  category?: string
  onViewContext?: (skillName: string) => void
  onUninstall?: (skillName: string) => void
}

export const SkillsList = ({ skills, isLoading, category, onViewContext, onUninstall }: SkillsListProps) => {
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingDots />
      </div>
    )
  }

  // Filter by category if specified
  const filteredSkills = category
    ? skills.filter((s) => s.category?.toLowerCase() === category.toLowerCase())
    : skills

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
            {category ? `${category}分类下暂无技能` : '暂无技能'}
          </h3>
          <p className="text-sm text-neutral-500">
            技能可以扩展 AI 的能力，帮助完成特定任务
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {filteredSkills.map((skill) => (
        <SkillCard key={skill.name} skill={skill} onViewContext={onViewContext} onUninstall={onUninstall} />
      ))}
    </div>
  )
}
