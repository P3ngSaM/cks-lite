import { useUIStore } from '@/stores'
import { Loading } from '@/components/ui'

/**
 * 全局 Loading 覆盖层
 *
 * 使用方式：
 * ```typescript
 * const { setGlobalLoading } = useUIStore()
 * setGlobalLoading(true, '加载中...')
 * // ... 执行操作
 * setGlobalLoading(false)
 * ```
 */
export const GlobalLoading = () => {
  const isLoading = useUIStore((state) => state.globalLoading)
  const loadingMessage = useUIStore((state) => state.globalLoadingMessage)

  if (!isLoading) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-[var(--bg-primary)] rounded-xl p-8 shadow-2xl min-w-[200px] flex flex-col items-center gap-4">
        <Loading size="lg" />
        {loadingMessage && (
          <p className="text-[var(--text-primary)] text-sm font-medium">
            {loadingMessage}
          </p>
        )}
      </div>
    </div>
  )
}
