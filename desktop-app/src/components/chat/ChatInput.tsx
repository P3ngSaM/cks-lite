import { useState, useRef, type KeyboardEvent } from 'react'
import { Send, Paperclip, Loader2, Square } from 'lucide-react'
import { cn } from '@/utils/cn'

export interface ChatInputProps {
  onSend: (message: string) => void
  onStop?: () => void
  disabled?: boolean
  placeholder?: string
}

export const ChatInput = ({
  onSend,
  onStop,
  disabled,
  placeholder = '输入消息...（Shift + Enter 换行）'
}: ChatInputProps) => {
  const [message, setMessage] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = () => {
    const trimmedMessage = message.trim()
    if (!trimmedMessage || disabled) return

    onSend(trimmedMessage)
    setMessage('')

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value)
    const textarea = e.target
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
  }

  const handleFileClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      // TODO: 文件上传逻辑
      console.log('Selected files:', files)
    }
  }

  return (
    <div className="border-t border-neutral-800 bg-black p-6">
      <div className="max-w-4xl mx-auto">
        {disabled && (
          <div className="flex items-center gap-2 mb-3 px-1">
            <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin flex-shrink-0" />
            <span className="text-xs text-blue-400">AI 正在处理中...</span>
            <div className="flex-1 h-0.5 bg-neutral-800 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500/60 rounded-full animate-pulse" style={{ width: '60%' }} />
            </div>
            {onStop && (
              <button
                onClick={onStop}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-xs text-neutral-400 hover:text-white bg-neutral-800 hover:bg-neutral-700 transition-colors"
              >
                <Square className="h-3 w-3" />
                停止
              </button>
            )}
          </div>
        )}

        <div className="relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={disabled ? 'AI 正在执行中，请稍候...' : placeholder}
            rows={1}
            className={cn(
              'w-full px-4 py-3 pr-24 pb-12 rounded-lg resize-none transition-colors',
              'bg-neutral-900 text-white border border-neutral-800',
              'focus:border-white focus:outline-none',
              'placeholder:text-neutral-600',
              'min-h-[52px] max-h-[200px]',
              disabled && 'opacity-50 cursor-not-allowed bg-neutral-950 border-neutral-800/50'
            )}
          />

          <div className="absolute bottom-3 right-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleFileClick}
              disabled={disabled}
              className={cn(
                'p-2 rounded-lg transition-colors',
                'text-neutral-500 hover:text-white hover:bg-neutral-800',
                'disabled:opacity-40 disabled:cursor-not-allowed'
              )}
              title="上传文件"
            >
              <Paperclip className="h-5 w-5" />
            </button>

            <button
              onClick={handleSubmit}
              disabled={disabled || !message.trim()}
              className={cn(
                'p-2 rounded-lg transition-colors',
                'bg-white text-black',
                'hover:bg-neutral-200',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                'active:scale-95'
              )}
              title="发送消息"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileChange}
            className="hidden"
            multiple
            accept="image/*,application/pdf,.doc,.docx,.txt"
          />
        </div>

        <p className="text-xs text-neutral-600 mt-3 text-center">
          Enter 发送 · Shift + Enter 换行
        </p>
      </div>
    </div>
  )
}
