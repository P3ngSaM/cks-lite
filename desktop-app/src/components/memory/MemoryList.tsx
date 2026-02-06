import { MemoryCard } from './MemoryCard'
import { Brain } from 'lucide-react'
import type { Memory } from '@/types/agent'

export interface MemoryListProps {
  memories: Memory[]
  isLoading?: boolean
  onDelete?: (id: string) => void
  searchQuery?: string
}

export const MemoryList = ({ memories, isLoading, onDelete, searchQuery }: MemoryListProps) => {
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="text-neutral-500 text-sm">加载记忆中...</div>
      </div>
    )
  }

  if (memories.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-neutral-900 rounded-full flex items-center justify-center mx-auto mb-4">
            <Brain className="w-8 h-8 text-neutral-600" />
          </div>
          <h3 className="text-base font-semibold text-white mb-2">
            {searchQuery ? '未找到相关记忆' : '暂无记忆'}
          </h3>
          <p className="text-sm text-neutral-500">
            {searchQuery
              ? '尝试使用不同的关键词搜索'
              : '在对话中产生的重要信息会自动保存为记忆'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {memories.map((memory) => (
        <MemoryCard
          key={memory.id}
          memory={memory}
          onDelete={onDelete}
          highlight={searchQuery}
        />
      ))}
    </div>
  )
}
