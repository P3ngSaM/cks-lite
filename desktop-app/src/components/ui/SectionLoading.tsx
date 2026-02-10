import { Loader2 } from 'lucide-react'
import { cn } from '@/utils/cn'

type SectionLoadingProps = {
  label?: string
  className?: string
}

export const SectionLoading = ({ label = '加载中...', className }: SectionLoadingProps) => {
  return (
    <div className={cn('flex items-center justify-center gap-2 py-4 text-sm text-neutral-500', className)}>
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{label}</span>
    </div>
  )
}

