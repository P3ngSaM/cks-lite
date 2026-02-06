import React, { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from './Button'
import { handleError } from '@/utils/errorHandler'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: (error: Error, reset: () => void) => ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * React Error Boundary Component
 *
 * Catches JavaScript errors anywhere in the child component tree
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary>
 *   <YourComponent />
 * </ErrorBoundary>
 * ```
 *
 * With custom fallback:
 * ```tsx
 * <ErrorBoundary
 *   fallback={(error, reset) => (
 *     <div>
 *       <h1>Something went wrong!</h1>
 *       <button onClick={reset}>Try again</button>
 *     </div>
 *   )}
 * >
 *   <YourComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null
    }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to console
    console.error('ErrorBoundary caught an error:', error, errorInfo)

    // Handle error (logging, toast notification, etc.)
    handleError(error, `ErrorBoundary: ${errorInfo.componentStack}`, false)

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo)
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null
    })
  }

  render() {
    if (this.state.hasError && this.state.error) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleReset)
      }

      // Default fallback UI
      return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--bg-secondary)] p-4">
          <div className="max-w-md w-full bg-[var(--bg-primary)] rounded-xl shadow-lg p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--error-light)] text-[var(--error)] mb-4">
              <AlertTriangle className="h-8 w-8" />
            </div>

            <h1 className="text-xl font-bold text-[var(--text-primary)] mb-2">
              出错了
            </h1>

            <p className="text-sm text-[var(--text-secondary)] mb-6">
              应用程序遇到了一个意外错误。请尝试刷新页面或联系支持人员。
            </p>

            {import.meta.env.DEV && this.state.error && (
              <details className="mb-6 text-left">
                <summary className="text-xs text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-primary)] mb-2">
                  查看错误详情
                </summary>
                <pre className="text-xs text-[var(--text-secondary)] bg-[var(--bg-tertiary)] p-3 rounded overflow-x-auto">
                  {this.state.error.message}
                  {'\n\n'}
                  {this.state.error.stack}
                </pre>
              </details>
            )}

            <div className="flex gap-3 justify-center">
              <Button
                variant="primary"
                onClick={() => window.location.reload()}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                刷新页面
              </Button>

              <Button
                variant="secondary"
                onClick={this.handleReset}
              >
                重试
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * Hook-like wrapper for functional components
 *
 * Usage:
 * ```tsx
 * export default function MyPage() {
 *   return (
 *     <ErrorBoundaryWrapper>
 *       <MyPageContent />
 *     </ErrorBoundaryWrapper>
 *   )
 * }
 * ```
 */
export function ErrorBoundaryWrapper({ children }: { children: ReactNode }) {
  return <ErrorBoundary>{children}</ErrorBoundary>
}
