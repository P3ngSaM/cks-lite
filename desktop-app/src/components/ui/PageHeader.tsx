import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

type PageHeaderProps = {
  title: string
  subtitle?: string
  icon?: ReactNode
  actions?: ReactNode
  className?: string
}

export const PageHeader = ({ title, subtitle, icon, actions, className }: PageHeaderProps) => {
  return (
    <div className={cn('cks-surface cks-transition-base', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="cks-title-lg flex items-center gap-2">
            {icon}
            {title}
          </h1>
          {subtitle ? <p className="cks-subtitle mt-1">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  )
}
