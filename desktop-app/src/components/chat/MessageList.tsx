import { useEffect, useRef, useState } from 'react'
import { Message } from './Message'
import type { Message as MessageType } from '@/types/chat'

export interface MessageListProps {
  messages: MessageType[]
  isLoading?: boolean
}

export const MessageList = ({ messages, isLoading }: MessageListProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true)

  // Auto-scroll only when user stays near the bottom.
  useEffect(() => {
    if (!autoScrollEnabled) return
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, autoScrollEnabled])

  const handleScroll = () => {
    const container = containerRef.current
    if (!container) return
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    setAutoScrollEnabled(distanceToBottom < 80)
  }

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="h-full flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <img
            src="/src/img/cks.png"
            alt="CKS Lite"
            className="w-20 h-20 mx-auto mb-6 rounded-2xl"
          />
          <h3 className="text-xl font-semibold text-white mb-2">
            开始对话
          </h3>
          <p className="text-sm text-neutral-500">
            在下方输入框中输入消息，与 CKS Assistant 开始对话
          </p>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} onScroll={handleScroll} className="relative h-full overflow-y-auto px-6 py-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {isLoading && (
          <div className="sticky top-0 z-10 flex justify-center">
            <div className="cks-surface-subtle px-2 py-1 text-[11px] text-cyan-300">AI 正在思考并执行中...</div>
          </div>
        )}
        {messages.map((message) => (
          <Message key={message.id} message={message} />
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl px-5 py-3">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-neutral-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-2 h-2 bg-neutral-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-2 h-2 bg-neutral-500 rounded-full animate-bounce"></div>
              </div>
            </div>
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>
      {!autoScrollEnabled && messages.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setAutoScrollEnabled(true)
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
          }}
          className="cks-btn cks-btn-secondary cks-focus-ring cks-transition-fast fixed bottom-28 right-8 z-20"
        >
          回到底部
        </button>
      )}
    </div>
  )
}
