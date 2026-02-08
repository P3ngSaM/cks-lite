import { useState } from 'react'
import { CheckCircle2, Download, Loader2 } from 'lucide-react'
import { AgentService } from '@/services/agentService'

interface SkillRecommendation {
  name: string
  description: string
  github_ref: string
  github_url: string
  source: string
}

interface SkillRecommendationListProps {
  skills: SkillRecommendation[]
}

type InstallStatus = 'idle' | 'installing' | 'installed' | 'error'

export const SkillRecommendationList = ({ skills }: SkillRecommendationListProps) => {
  const [installingMap, setInstallingMap] = useState<Record<string, InstallStatus>>({})

  const handleInstall = async (skill: SkillRecommendation) => {
    setInstallingMap((prev) => ({ ...prev, [skill.name]: 'installing' }))
    try {
      const result = await AgentService.installSkill(skill.github_ref)
      if (result && result.success) {
        setInstallingMap((prev) => ({ ...prev, [skill.name]: 'installed' }))
      } else {
        setInstallingMap((prev) => ({ ...prev, [skill.name]: 'error' }))
      }
    } catch {
      setInstallingMap((prev) => ({ ...prev, [skill.name]: 'error' }))
    }
  }

  if (!skills || skills.length === 0) return null

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-neutral-800">
        <span className="text-xs text-neutral-400">找到 {skills.length} 个相关技能</span>
      </div>
      <div className="divide-y divide-neutral-800">
        {skills.map((skill) => {
          const status = installingMap[skill.name] || 'idle'
          return (
            <div
              key={skill.name}
              className="flex items-center justify-between px-3 py-2.5 gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-neutral-200 truncate">
                    {skill.name}
                  </span>
                  <span
                    className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full ${
                      skill.source === 'skills.sh'
                        ? 'bg-purple-500/20 text-purple-400'
                        : 'bg-neutral-700 text-neutral-400'
                    }`}
                  >
                    {skill.source}
                  </span>
                </div>
                <p className="text-xs text-neutral-500 mt-0.5 truncate">
                  {skill.description}
                </p>
              </div>
              <div className="flex-shrink-0">
                {status === 'idle' && (
                  <button
                    onClick={() => handleInstall(skill)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-white text-black rounded-md hover:bg-neutral-200 transition-colors"
                  >
                    <Download className="h-3 w-3" />
                    安装
                  </button>
                )}
                {status === 'installing' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-neutral-400">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    安装中…
                  </span>
                )}
                {status === 'installed' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-green-400">
                    <CheckCircle2 className="h-3 w-3" />
                    已安装
                  </span>
                )}
                {status === 'error' && (
                  <button
                    onClick={() => handleInstall(skill)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-400 hover:text-red-300 transition-colors"
                  >
                    重试
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
