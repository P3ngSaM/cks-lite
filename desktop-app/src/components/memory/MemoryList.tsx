import { Brain } from 'lucide-react'
import { MemoryCard } from './MemoryCard'
import type { Memory } from '@/types/agent'

export interface MemoryListProps {
  memories: Memory[]
  isLoading?: boolean
  onDelete?: (id: string) => void
  onResolveConflict?: (id: string) => void
  searchQuery?: string
  showScoreDetails?: boolean
}

export const MemoryList = ({
  memories,
  isLoading,
  onDelete,
  onResolveConflict,
  searchQuery,
  showScoreDetails = false,
}: MemoryListProps) => {
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="text-neutral-500 text-sm">正在加载记忆...</div>
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
            {searchQuery ? '可以换个关键词继续搜索。' : '对话中产生的重要信息会自动沉淀为记忆。'}
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
          onResolveConflict={onResolveConflict}
          highlight={searchQuery}
          showScoreDetails={showScoreDetails}
        />
      ))}
    </div>
  )
}
