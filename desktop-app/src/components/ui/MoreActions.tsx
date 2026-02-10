import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/utils/cn'

export type MoreActionItem = {
  key: string
  label: string
  onClick: () => void | Promise<void>
  icon?: ReactNode
  disabled?: boolean
  danger?: boolean
}

type MoreActionsProps = {
  items: MoreActionItem[]
  label?: string
  align?: 'left' | 'right'
  buttonClassName?: string
  menuClassName?: string
}

export const MoreActions = ({
  items,
  label = '更多',
  align = 'right',
  buttonClassName,
  menuClassName,
}: MoreActionsProps) => {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current) return
      const target = event.target as Node | null
      if (target && !rootRef.current.contains(target)) {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [open])

  if (!items.length) return null

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          'cks-btn cks-btn-secondary cks-focus-ring cks-transition-fast inline-flex items-center gap-1 focus:outline-none',
          buttonClassName
        )}
      >
        {label}
      </button>
      {open ? (
        <div
          className={cn(
            'animate-scale-in absolute top-full mt-1 z-20 min-w-40 rounded-md border border-neutral-700 bg-neutral-950/98 p-1.5 space-y-1 shadow-xl backdrop-blur',
            align === 'right' ? 'right-0' : 'left-0',
            menuClassName
          )}
          role="menu"
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                if (item.disabled) return
                item.onClick()
                setOpen(false)
              }}
              disabled={item.disabled}
              className={cn(
                'cks-btn cks-transition-fast w-full inline-flex items-center gap-1 justify-start',
                item.danger
                  ? 'border-red-500/40 text-red-300 hover:bg-red-500/10'
                  : 'border-neutral-700 text-neutral-200 hover:border-cyan-500/40 hover:bg-cyan-500/5',
                item.disabled ? 'opacity-50 cursor-not-allowed' : ''
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
