import { useEffect } from 'react'
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import { cn } from '@/utils/cn'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastProps {
  id?: string
  type?: ToastType
  title?: string
  message: string
  duration?: number
  onClose?: () => void
}

export const Toast = ({
  type = 'info',
  title,
  message,
  duration = 5000,
  onClose
}: ToastProps) => {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose?.()
      }, duration)
      return () => clearTimeout(timer)
    }
  }, [duration, onClose])

  const icons = {
    success: <CheckCircle className="h-5 w-5" />,
    error: <AlertCircle className="h-5 w-5" />,
    warning: <AlertTriangle className="h-5 w-5" />,
    info: <Info className="h-5 w-5" />
  }

  const colors = {
    success: 'text-[var(--success)] bg-[var(--success-light)]',
    error: 'text-[var(--error)] bg-[var(--error-light)]',
    warning: 'text-[var(--warning)] bg-[var(--warning-light)]',
    info: 'text-[var(--primary)] bg-[var(--primary-light)]'
  }

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 rounded-lg shadow-lg border border-[var(--border)]',
        'bg-[var(--bg-primary)] backdrop-blur-sm',
        'animate-slide-in-right max-w-md'
      )}
    >
      <div className={cn('flex-shrink-0 p-1 rounded', colors[type])}>
        {icons[type]}
      </div>
      <div className="flex-1 min-w-0">
        {title && (
          <p className="text-sm font-semibold text-[var(--text-primary)] mb-1">
            {title}
          </p>
        )}
        <p className="text-sm text-[var(--text-secondary)]">
          {message}
        </p>
      </div>
      <button
        onClick={onClose}
        className="flex-shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

// Toast Container Component
export interface ToastContainerProps {
  toasts: ToastProps[]
  onRemove: (id: string) => void
}

export const ToastContainer = ({ toasts, onRemove }: ToastContainerProps) => {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          {...toast}
          onClose={() => toast.id && onRemove(toast.id)}
        />
      ))}
    </div>
  )
}
