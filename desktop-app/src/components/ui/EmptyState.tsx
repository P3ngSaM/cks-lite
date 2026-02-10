import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

type EmptyStateProps = {
  title: string
  description?: string
  icon?: ReactNode
  className?: string
}

export const EmptyState = ({ title, description, icon, className }: EmptyStateProps) => {
  return (
    <div className={cn('rounded-lg border border-dashed border-neutral-700 bg-black/20 px-4 py-5 text-center', className)}>
      {icon ? <div className="mx-auto mb-2 w-fit text-neutral-500">{icon}</div> : null}
      <p className="text-sm text-neutral-300">{title}</p>
      {description ? <p className="mt-1 text-xs text-neutral-500">{description}</p> : null}
    </div>
  )
}

