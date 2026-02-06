import { memo, useState } from 'react'
import { Zap, ChevronDown, ChevronUp, Tag, FileText, Play, Globe, Trash2, FlaskConical } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { Skill, SkillReadiness } from '@/types/agent'

export interface SkillCardProps {
  skill: Skill
  readiness?: SkillReadiness
  onViewContext?: (skillName: string) => void
  onUninstall?: (skillName: string) => void
  onRunTest?: (skillName: string) => void
}

export const SkillCard = memo(({ skill, readiness, onViewContext, onUninstall, onRunTest }: SkillCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false)

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
  const displayCategory = categoryLabelMap[skill.category?.toLowerCase?.() || ''] || skill.category

  const categoryColors: Record<string, string> = {
    '文档处理': 'bg-blue-500/20 text-blue-400',
    '多媒体': 'bg-purple-500/20 text-purple-400',
    '下载工具': 'bg-green-500/20 text-green-400',
    '内容发布': 'bg-orange-500/20 text-orange-400',
    '未分类': 'bg-neutral-700 text-neutral-400',
    default: 'bg-neutral-800 text-neutral-300'
  }

  const categoryColor =
    categoryColors[skill.category] || categoryColors.default

  const readinessConfig = {
    ready: { label: '就绪', className: 'bg-emerald-500/20 text-emerald-400' },
    missing_dependency: { label: '缺依赖', className: 'bg-amber-500/20 text-amber-400' },
    blocked_by_policy: { label: '已拦截', className: 'bg-red-500/20 text-red-400' },
    runtime_error: { label: '异常', className: 'bg-red-500/20 text-red-400' }
  } as const
  const readinessBadge = readiness ? readinessConfig[readiness.status] : null

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 hover:border-neutral-700 transition-colors">
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1">
            {/* Icon */}
            <div className="w-10 h-10 rounded-lg bg-neutral-800 flex items-center justify-center flex-shrink-0">
              <Zap className="h-5 w-5 text-white" />
            </div>

            {/* Title and Description */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="text-base font-semibold text-white">
                  {skill.display_name || skill.name}
                </h3>
                {skill.category && (
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded-full text-xs font-medium',
                      categoryColor
                    )}
                  >
                    {displayCategory}
                  </span>
                )}
                {skill.is_hybrid && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400">
                    混合模式
                  </span>
                )}
              </div>
              <p className="text-sm text-neutral-400 line-clamp-2">
                {skill.description}
              </p>
            </div>
          </div>

          {/* Status Badges */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {skill.has_skill && (
              <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400 flex items-center gap-1">
                <FileText className="h-3 w-3" />
                AI能力
              </span>
            )}
            {skill.has_app && (
              <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400 flex items-center gap-1">
                <Play className="h-3 w-3" />
                应用
              </span>
            )}
            {skill.source === 'user-installed' && (
              <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400 flex items-center gap-1">
                <Globe className="h-3 w-3" />
                社区
              </span>
            )}
            {readinessBadge && (
              <span className={cn('px-2 py-1 rounded-full text-xs font-medium', readinessBadge.className)}>
                {readinessBadge.label}
              </span>
            )}
          </div>
        </div>

        {/* Trigger Keywords */}
        {skill.trigger_keywords && skill.trigger_keywords.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <Tag className="h-3 w-3 text-neutral-600" />
            <span className="text-xs text-neutral-600">触发词:</span>
            {skill.trigger_keywords.slice(0, 5).map((word, index) => (
              <span
                key={index}
                className="px-2 py-0.5 bg-neutral-800 text-neutral-400 rounded text-xs"
              >
                {word}
              </span>
            ))}
            {skill.trigger_keywords.length > 5 && (
              <span className="text-xs text-neutral-600">
                +{skill.trigger_keywords.length - 5} 更多
              </span>
            )}
          </div>
        )}

        {/* Tags */}
        {skill.tags && skill.tags.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {skill.tags.map((tag, index) => (
              <span
                key={index}
                className="px-2 py-0.5 bg-neutral-800/50 text-neutral-500 rounded text-xs"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="pt-2 border-t border-neutral-800 flex items-center gap-2">
          {skill.has_skill && onViewContext && (
            <button
              onClick={() => onViewContext(skill.name)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
            >
              <FileText className="h-3.5 w-3.5" />
              查看文档
            </button>
          )}

          {onRunTest && (
            <button
              onClick={() => onRunTest(skill.name)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 transition-colors"
            >
              <FlaskConical className="h-3.5 w-3.5" />
              运行测试
            </button>
          )}

          {skill.source === 'user-installed' && onUninstall && (
            <button
              onClick={() => onUninstall(skill.name)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              卸载
            </button>
          )}

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-xs text-neutral-500 hover:text-white transition-colors ml-auto"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-4 w-4" />
                <span>收起</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" />
                <span>详情</span>
              </>
            )}
          </button>
        </div>

        {/* Expanded Details */}
        {isExpanded && (
          <div className="mt-2 space-y-2 text-xs">
            <div className="bg-neutral-800/50 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-neutral-500 w-20">名称:</span>
                <span className="text-white font-mono">{skill.name}</span>
              </div>
              {skill.project_type && (
                <div className="flex items-center gap-2">
                  <span className="text-neutral-500 w-20">项目类型:</span>
                  <span className="text-neutral-300">{skill.project_type}</span>
                </div>
              )}
              {skill.source_url && (
                <div className="flex items-center gap-2">
                  <span className="text-neutral-500 w-20">来源:</span>
                  <span className="text-neutral-300 font-mono text-xs truncate">{skill.source_url}</span>
                </div>
              )}
              {readiness && (
                <div className="flex items-start gap-2">
                  <span className="text-neutral-500 w-20">状态:</span>
                  <div className="flex flex-wrap gap-2">
                    <span className={cn('px-1.5 py-0.5 rounded text-xs', readinessBadge?.className || 'bg-neutral-700 text-neutral-300')}>
                      {readinessBadge?.label || readiness.status}
                    </span>
                    <span className="text-neutral-400">{readiness.message}</span>
                  </div>
                </div>
              )}
              {readiness?.required_tools && readiness.required_tools.length > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-neutral-500 w-20">依赖工具:</span>
                  <div className="flex flex-wrap gap-1">
                    {readiness.required_tools.slice(0, 6).map((tool, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded text-xs font-mono bg-neutral-700 text-neutral-300">
                        {tool}
                      </span>
                    ))}
                    {readiness.required_tools.length > 6 && (
                      <span className="text-neutral-500">+{readiness.required_tools.length - 6} 更多</span>
                    )}
                  </div>
                </div>
              )}
              {readiness?.runtime_checks && readiness.runtime_checks.length > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-neutral-500 w-20">检查项:</span>
                  <div className="space-y-1">
                    {readiness.runtime_checks.map((check, i) => (
                      <div key={i} className="text-neutral-400">
                        <span className={check.ok ? 'text-emerald-400' : 'text-amber-400'}>
                          {check.ok ? '✓' : '✗'}
                        </span>{' '}
                        <span className="font-mono">{check.name}</span>{' '}
                        <span className="text-neutral-500">{check.detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {skill.env_vars && skill.env_vars.length > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-neutral-500 w-20">环境变量:</span>
                  <div className="flex flex-wrap gap-1">
                    {skill.env_vars.map((env, i) => (
                      <span
                        key={i}
                        className={cn(
                          'px-1.5 py-0.5 rounded text-xs font-mono',
                          env.required
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-neutral-700 text-neutral-400'
                        )}
                      >
                        {env.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
})

SkillCard.displayName = 'SkillCard'
