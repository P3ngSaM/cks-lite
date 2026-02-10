import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

type StatusBadgeProps = {
  label: string
  className?: string
  icon?: ReactNode
}

export const StatusBadge = ({ label, className, icon }: StatusBadgeProps) => {
  return (
    <span className={cn('cks-transition-fast inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px]', className)}>
      {icon}
      {label}
    </span>
  )
}
