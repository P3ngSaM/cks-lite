import { useEffect, useRef } from 'react'
import { Message } from './Message'
import type { Message as MessageType } from '@/types/chat'

export interface MessageListProps {
  messages: MessageType[]
  isLoading?: boolean
}

export const MessageList = ({ messages, isLoading }: MessageListProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
    <div
      ref={containerRef}
      className="h-full overflow-y-auto px-6 py-8"
    >
      <div className="max-w-4xl mx-auto space-y-6">
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
    </div>
  )
}
