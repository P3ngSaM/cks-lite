import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

type StatTileProps = {
  title: string
  value: ReactNode
  hint?: string
  className?: string
}

export const StatTile = ({ title, value, hint, className }: StatTileProps) => {
  return (
    <div className={cn('cks-surface-subtle cks-transition-fast cks-hover-lift px-3 py-2', className)}>
      <p className="text-[11px] text-neutral-500">{title}</p>
      <p className="mt-1 text-lg font-semibold text-neutral-100">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-neutral-500">{hint}</p> : null}
    </div>
  )
}
