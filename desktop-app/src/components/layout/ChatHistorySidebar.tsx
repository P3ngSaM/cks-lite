import { Plus, MessageSquare, Trash2 } from 'lucide-react'
import { useChatStore } from '@/stores'
import { cn } from '@/utils/cn'
import { useState } from 'react'

export const ChatHistorySidebar = () => {
  const sessions = useChatStore((state) => state.sessions)
  const currentSessionId = useChatStore((state) => state.currentSessionId)
  const createSession = useChatStore((state) => state.createSession)
  const deleteSession = useChatStore((state) => state.deleteSession)
  const setCurrentSession = useChatStore((state) => state.setCurrentSession)

  const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null)
  const sessionList = Object.values(sessions).sort((a, b) => b.updatedAt - a.updatedAt)

  const handleNewChat = () => {
    createSession('新对话')
  }

  const handleSelectSession = (sessionId: string) => {
    setCurrentSession(sessionId)
  }

  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm('确定要删除这个对话吗？')) {
      deleteSession(sessionId)
    }
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days === 0) return '今天'
    if (days === 1) return '昨天'
    if (days < 7) return `${days}天前`
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="w-[260px] h-screen bg-black border-r border-neutral-800 flex flex-col">
      <div className="p-4 border-b border-neutral-800">
        <button
          onClick={handleNewChat}
          className="w-full px-4 py-2.5 rounded-lg bg-white text-black font-medium hover:bg-neutral-200 transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="h-4 w-4" />
          <span>新建对话</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {sessionList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <MessageSquare className="h-10 w-10 text-neutral-700 mb-3" />
            <p className="text-sm text-neutral-500">暂无对话</p>
          </div>
        ) : (
          sessionList.map((session) => (
            <div
              key={session.id}
              onClick={() => handleSelectSession(session.id)}
              onMouseEnter={() => setHoveredSessionId(session.id)}
              onMouseLeave={() => setHoveredSessionId(null)}
              className={cn(
                'group px-3 py-2.5 rounded-lg cursor-pointer transition-colors border-l-2',
                currentSessionId === session.id
                  ? 'bg-neutral-800 border-l-white'
                  : 'border-transparent hover:bg-neutral-900'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h4
                    className={cn(
                      'text-sm font-medium truncate',
                      currentSessionId === session.id ? 'text-white' : 'text-neutral-400'
                    )}
                  >
                    {session.title}
                  </h4>
                  <p className="text-xs text-neutral-600 mt-1">{formatDate(session.updatedAt)}</p>
                </div>

                {hoveredSessionId === session.id && (
                  <button
                    onClick={(e) => handleDeleteSession(session.id, e)}
                    className="flex-shrink-0 p-1 rounded text-neutral-500 hover:text-red-500 hover:bg-neutral-800 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              {session.messages && session.messages.length > 0 && (
                <div className="mt-2 flex items-center gap-1">
                  <MessageSquare className="h-3 w-3 text-neutral-600" />
                  <span className="text-xs text-neutral-600">{session.messages.length} 条消息</span>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="p-4 border-t border-neutral-800">
        <div className="text-xs text-neutral-600 text-center">
          共 {sessionList.length} 个对话
        </div>
      </div>
    </div>
  )
}
