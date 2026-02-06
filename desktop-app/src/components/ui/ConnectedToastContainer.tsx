import { useUIStore } from '@/stores'
import { Toast } from './Toast'

/**
 * 连接到 uiStore 的 Toast 容器组件
 *
 * 自动显示全局 toasts，无需手动管理
 *
 * 使用方式（在 App.tsx 中添加一次）：
 * ```tsx
 * <ConnectedToastContainer />
 * ```
 *
 * 显示 toast：
 * ```typescript
 * const { addToast } = useUIStore()
 * addToast({
 *   type: 'success',
 *   message: '操作成功！',
 *   duration: 3000
 * })
 * ```
 */
export const ConnectedToastContainer = () => {
  const toasts = useUIStore((state) => state.toasts)
  const removeToast = useUIStore((state) => state.removeToast)

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-[9998] flex flex-col gap-2 max-w-md">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          type={toast.type}
          message={toast.message}
          duration={toast.duration}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  )
}
