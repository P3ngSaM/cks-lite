import { cn } from '@/utils/cn'

export interface LoadingProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
  text?: string
}

export const Loading = ({ size = 'md', className, text }: LoadingProps) => {
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12'
  }

  return (
    <div className={cn('flex flex-col items-center justify-center gap-3', className)}>
      <svg
        className={cn('animate-spin text-[var(--primary)]', sizes[size])}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      {text && (
        <p className="text-sm text-[var(--text-secondary)] animate-pulse">{text}</p>
      )}
    </div>
  )
}

export const LoadingDots = ({ className }: { className?: string }) => {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <div className="typing-dot w-2 h-2 rounded-full bg-[var(--text-secondary)]" />
      <div className="typing-dot w-2 h-2 rounded-full bg-[var(--text-secondary)]" />
      <div className="typing-dot w-2 h-2 rounded-full bg-[var(--text-secondary)]" />
    </div>
  )
}

export const LoadingScreen = ({ text = '加载中...' }: { text?: string }) => {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[var(--bg-secondary)]">
      <Loading size="lg" text={text} />
    </div>
  )
}
