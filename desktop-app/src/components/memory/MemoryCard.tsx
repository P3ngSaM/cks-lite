import { memo } from 'react'
import { Calendar, Trash2 } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { Memory } from '@/types/agent'

const MEMORY_TYPE_STYLES: Record<string, { label: string; className: string }> = {
  user_info: { label: '用户信息', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  preference: { label: '偏好设置', className: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  project: { label: '项目记忆', className: 'bg-green-500/20 text-green-400 border-green-500/30' },
  skill: { label: '技能经验', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  task: { label: '任务记录', className: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  manual: { label: '手动添加', className: 'bg-pink-500/20 text-pink-400 border-pink-500/30' },
  conversation: { label: '对话记忆', className: 'bg-neutral-800 text-neutral-300 border-neutral-700' },
}

export interface MemoryCardProps {
  memory: Memory
  onDelete?: (id: string) => void
  onResolveConflict?: (id: string) => void
  highlight?: string
  showScoreDetails?: boolean
}

function formatScore(value?: number): string | null {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null
  }
  return value.toFixed(3)
}

function computeRecencyBoost(createdAt?: string): number {
  if (!createdAt) {
    return 0
  }
  const ts = Date.parse(createdAt)
  if (!Number.isFinite(ts)) {
    return 0
  }
  const ageDays = Math.max(0, (Date.now() - ts) / 86_400_000)
  return (1 / (1 + ageDays / 30)) * 0.15
}

function computeAgeDays(createdAt?: string): number | null {
  if (!createdAt) {
    return null
  }
  const ts = Date.parse(createdAt)
  if (!Number.isFinite(ts)) {
    return null
  }
  return Math.max(0, (Date.now() - ts) / 86_400_000)
}

function buildHitReasons(memory: Memory): string[] {
  const reasons: string[] = []
  const source = memory.source || ''
  const importance = memory.importance ?? 5
  const accessCount = memory.access_count ?? 0
  const ageDays = computeAgeDays(memory.created_at)

  if (source === 'direct_match') {
    reasons.push('关键词直匹配')
  } else if (source === 'keyword') {
    reasons.push('关键词召回')
  } else if (source === 'vector') {
    reasons.push('语义向量召回')
  } else if (source) {
    reasons.push(`来源 ${source}`)
  }

  if (importance >= 8) {
    reasons.push('高重要度')
  }
  if (accessCount >= 3) {
    reasons.push('高频访问')
  }
  if (ageDays !== null && ageDays <= 7) {
    reasons.push('近期记忆')
  }

  if (reasons.length === 0) {
    reasons.push('基础检索命中')
  }
  return reasons
}

export const MemoryCard = memo(({ memory, onDelete, onResolveConflict, highlight, showScoreDetails = false }: MemoryCardProps) => {
  const highlightText = (text: string, query?: string) => {
    if (!query) return text

    const parts = text.split(new RegExp(`(${query})`, 'gi'))
    return parts.map((part, index) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={index} className="bg-yellow-500/20 text-white">
          {part}
        </mark>
      ) : (
        part
      )
    )
  }

  const typeStyle = MEMORY_TYPE_STYLES[memory.memory_type] || {
    label: memory.memory_type,
    className: 'bg-neutral-800 text-neutral-400 border-neutral-700',
  }

  const importance = memory.importance ?? 5
  const finalScore = formatScore(memory.final_score)
  const rawScore = formatScore(memory.score)
  const vectorScore = formatScore(memory.vector_score)
  const textScore = formatScore(memory.text_score)
  const recencyBoost = computeRecencyBoost(memory.created_at).toFixed(3)
  const reasons = buildHitReasons(memory)

  return (
    <div className="group bg-neutral-900 border border-neutral-800 rounded-lg p-4 hover:border-neutral-700 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className={cn('inline-block px-2 py-0.5 rounded-full text-xs font-medium border', typeStyle.className)}>
              {typeStyle.label}
            </span>
            <span className="text-xs text-neutral-500">重要度 {importance}/10</span>
            {memory.source && <span className="text-xs text-neutral-500">来源 {memory.source}</span>}
            {memory.stale && <span className="text-xs text-amber-300">已过期待确认</span>}
            {memory.conflict_status === 'pending_review' && <span className="text-xs text-rose-300">存在冲突待确认</span>}
          </div>

          <p className="text-white text-sm leading-relaxed mb-3">{highlightText(memory.content, highlight)}</p>

          <div className="flex items-center gap-4 text-xs text-neutral-500">
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span>
                {new Date(memory.created_at).toLocaleString('zh-CN', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            {memory.access_count !== undefined && memory.access_count > 0 && (
              <span className="text-neutral-600">访问 {memory.access_count} 次</span>
            )}
          </div>

          {showScoreDetails && (
            <div className="mt-3 rounded-md border border-neutral-800 bg-black/30 p-3 text-xs text-neutral-400 space-y-1">
              <div className="text-neutral-300">命中解释</div>
              <div className="flex flex-wrap gap-1.5">
                {reasons.map((reason) => (
                  <span key={reason} className="rounded-full border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-300">
                    {reason}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {finalScore && <span>综合分 {finalScore}</span>}
                {rawScore && <span>检索分 {rawScore}</span>}
                {vectorScore && <span>向量分 {vectorScore}</span>}
                {textScore && <span>关键词分 {textScore}</span>}
                <span>重要度加分 {(importance / 10 * 0.15).toFixed(3)}</span>
                <span>时效加分 {recencyBoost}</span>
              </div>
            </div>
          )}
        </div>

        {onDelete && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
            {memory.conflict_status === 'pending_review' && onResolveConflict && (
              <button
                onClick={() => onResolveConflict(memory.id)}
                className="p-1.5 rounded hover:bg-neutral-800"
                title="确认使用这条记忆并解决冲突"
              >
                <span className="text-[10px] text-cyan-300">确认</span>
              </button>
            )}
            <button
              onClick={() => onDelete(memory.id)}
              className="p-1.5 rounded hover:bg-neutral-800"
            >
              <Trash2 className="h-4 w-4 text-red-500" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
})

MemoryCard.displayName = 'MemoryCard'
