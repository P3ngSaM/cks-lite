import { memo, useState, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { User, AlertCircle, Search, ChevronDown, ChevronUp, ExternalLink, Loader2 } from 'lucide-react'
import { cn } from '@/utils/cn'
import { LoadingDots } from '@/components/ui'
import { ToolCallCard } from './ToolCallCard'
import { SkillRecommendationList } from './SkillRecommendationList'
import { useUserStore, useAuthStore } from '@/stores'
import type { Message as MessageType } from '@/types/chat'

export interface MessageProps {
  message: MessageType
}

export const Message = memo(({ message }: MessageProps) => {
  const isUser = message.role === 'user'
  const isError = message.status === 'error'
  const isSending = message.status === 'sending'
  const profile = useUserStore((state) => state.profile)
  const authUser = useAuthStore((state) => state.user)
  const [searchExpanded, setSearchExpanded] = useState(false)

  const hasSearchResults = message.searchResults && message.searchResults.length > 0
  const hasToolCalls = message.toolCalls && message.toolCalls.length > 0

  const cleanContent = useMemo(() => {
    if (!message.content) return ''
    return message.content
      .replace(/<minimax:tool_call>[\s\S]*?<\/minimax:tool_call>/g, '')
      .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
      .replace(/<minimax:tool_call>[\s\S]*$/g, '')
      .replace(/<tool_call>[\s\S]*$/g, '')
      .replace(/<\/?minimax:tool_call[^>]*>/g, '')
      .replace(/<\/?tool_call[^>]*>/g, '')
      .replace(/<invoke[^>]*>[\s\S]*?<\/invoke>/g, '')
      .replace(/<\/?invoke[^>]*>/g, '')
      .replace(/<parameter[^>]*>[\s\S]*?<\/parameter>/g, '')
      .replace(/<\/?parameter[^>]*>/g, '')
      .trim()
  }, [message.content])

  return (
    <div className={cn('flex gap-4 px-6 py-4', isUser ? 'justify-end' : 'justify-start')}>
      <div className={cn('flex gap-3 max-w-[75%]', isUser ? 'flex-row-reverse' : 'flex-row')}>
        <div
          className={cn(
            'flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden',
            isUser ? 'bg-white text-black' : 'bg-neutral-800 text-white'
          )}
        >
          {isUser ? (
            authUser?.avatar ? (
              <img src={authUser.avatar} alt={authUser.username || '用户'} className="w-full h-full object-cover" />
            ) : (
              <User className="h-4 w-4" />
            )
          ) : profile?.agentAvatar ? (
            <img src={profile.agentAvatar} alt={profile.agentName || 'AI'} className="w-full h-full object-cover" />
          ) : (
            <div className="text-xs font-bold">{profile?.agentName?.[0] || 'AI'}</div>
          )}
        </div>

        <div className="flex flex-col gap-1">
          {!isUser && (message.isSearching || hasSearchResults) && (
            <div className="mb-2">
              {message.isSearching ? (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                  <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin" />
                  <span className="text-xs text-blue-400">正在联网搜索...</span>
                </div>
              ) : hasSearchResults && (
                <button
                  onClick={() => setSearchExpanded(!searchExpanded)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg transition-colors cursor-pointer"
                >
                  <Search className="h-3.5 w-3.5 text-blue-400" />
                  <span className="text-xs text-neutral-300">已搜索到 {message.searchResults!.length} 条结果</span>
                  {searchExpanded ? (
                    <ChevronUp className="h-3.5 w-3.5 text-neutral-500" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-neutral-500" />
                  )}
                </button>
              )}

              {searchExpanded && hasSearchResults && (
                <div className="mt-2 p-2 bg-neutral-900 border border-neutral-800 rounded-lg space-y-2 max-h-64 overflow-y-auto">
                  {message.searchResults!.map((result, index) => (
                    <a
                      key={index}
                      href={result.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-2.5 bg-neutral-800/50 hover:bg-neutral-800 rounded-lg transition-colors group"
                    >
                      <div className="flex items-start gap-2">
                        <ExternalLink className="h-3.5 w-3.5 text-neutral-500 mt-0.5 flex-shrink-0 group-hover:text-blue-400" />
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-medium text-white truncate group-hover:text-blue-400">{result.title}</h4>
                          <p className="text-xs text-neutral-500 mt-1 line-clamp-2">{result.snippet}</p>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {!isUser && hasToolCalls && (
            <div className="mb-2 space-y-1.5">
              {message.toolCalls!.map((tc, index) => (
                <ToolCallCard key={`${tc.tool}-${index}`} toolCall={tc} />
              ))}
            </div>
          )}

          {!isUser && hasToolCalls && (() => {
            const skillData = message.toolCalls?.find(
              tc => (tc.tool === 'find_skills' || tc.tool === 'find-skills') && tc.data?.skills?.length > 0
            )
            return skillData ? (
              <div className="mb-2">
                <SkillRecommendationList skills={skillData.data!.skills} />
              </div>
            ) : null
          })()}

          {!(isSending && !cleanContent && hasToolCalls) && (
            <div
              className={cn(
                'rounded-xl px-4 py-3 transition-colors',
                isUser ? 'bg-white text-black' : 'bg-neutral-900 text-white border border-neutral-800',
                isError && 'border-red-600 bg-red-950/20'
              )}
            >
              {isError ? (
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0 text-red-500" />
                  <div>
                    <p className="text-sm font-medium text-red-400">发送失败</p>
                    <p className="text-xs mt-1 text-red-400/80">{message.error || '未知错误'}</p>
                  </div>
                </div>
              ) : isSending && !cleanContent ? (
                <div className="flex items-center gap-2">
                  <LoadingDots />
                </div>
              ) : cleanContent ? (
                <div
                  className={cn('prose prose-sm max-w-none', isUser ? 'prose-neutral' : 'prose-invert')}
                  style={{ fontSize: '14px', lineHeight: '1.6' }}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanContent}</ReactMarkdown>
                  {isSending && cleanContent && (
                    <span className="inline-block w-2 h-4 bg-white/60 animate-pulse ml-0.5" />
                  )}
                </div>
              ) : null}
            </div>
          )}

          <div className={cn('text-xs px-2', isUser ? 'text-right' : 'text-left', 'text-neutral-600')}>
            {new Date(message.timestamp).toLocaleTimeString('zh-CN', {
              hour: '2-digit',
              minute: '2-digit',
            })}
            {isSending && ' · 发送中...'}
          </div>
        </div>
      </div>
    </div>
  )
})

Message.displayName = 'Message'
