import { memo } from 'react'
import { Calendar, Trash2 } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { Memory } from '@/types/agent'

// Memory type display config
const MEMORY_TYPE_STYLES: Record<string, { label: string; className: string }> = {
  user_info: { label: '用户信息', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  preference: { label: '偏好设置', className: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  project: { label: '项目', className: 'bg-green-500/20 text-green-400 border-green-500/30' },
  skill: { label: '技能', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  task: { label: '任务', className: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  manual: { label: '手动', className: 'bg-pink-500/20 text-pink-400 border-pink-500/30' },
  conversation: { label: '对话', className: 'bg-neutral-800 text-neutral-500 border-neutral-700' },
}

export interface MemoryCardProps {
  memory: Memory
  onDelete?: (id: string) => void
  highlight?: string
}

export const MemoryCard = memo(({ memory, onDelete, highlight }: MemoryCardProps) => {
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
    className: 'bg-neutral-800 text-neutral-400 border-neutral-700'
  }

  return (
    <div className="group bg-neutral-900 border border-neutral-800 rounded-lg p-4 hover:border-neutral-700 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Type Badge */}
          {memory.memory_type && (
            <span className={cn(
              'inline-block px-2 py-0.5 rounded-full text-xs font-medium border mb-2',
              typeStyle.className
            )}>
              {typeStyle.label}
            </span>
          )}

          {/* Content */}
          <p className="text-white text-sm leading-relaxed mb-3">
            {highlightText(memory.content, highlight)}
          </p>

          {/* Metadata */}
          <div className="flex items-center gap-4 text-xs text-neutral-500">
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span>
                {new Date(memory.created_at).toLocaleString('zh-CN', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
            </div>

            {memory.access_count !== undefined && memory.access_count > 0 && (
              <span className="text-neutral-600">
                访问 {memory.access_count} 次
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        {onDelete && (
          <button
            onClick={() => onDelete(memory.id)}
            className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-neutral-800 transition-all"
          >
            <Trash2 className="h-4 w-4 text-red-500" />
          </button>
        )}
      </div>
    </div>
  )
})

MemoryCard.displayName = 'MemoryCard'
