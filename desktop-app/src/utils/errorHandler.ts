/**
 * 统一错误处理工具
 *
 * 功能：
 * - 错误类型识别和分类
 * - 错误信息格式化
 * - 用户友好的错误提示
 * - 错误日志记录
 */

import { useUIStore } from '@/stores'

/**
 * 错误类型常量
 */
export const ErrorType = {
  NETWORK: 'NETWORK',           // 网络错误
  TIMEOUT: 'TIMEOUT',           // 超时错误
  VALIDATION: 'VALIDATION',     // 验证错误
  NOT_FOUND: 'NOT_FOUND',       // 404 错误
  SERVER: 'SERVER',             // 服务器错误（5xx）
  UNAUTHORIZED: 'UNAUTHORIZED', // 未授权（401）
  FORBIDDEN: 'FORBIDDEN',       // 禁止访问（403）
  UNKNOWN: 'UNKNOWN'            // 未知错误
} as const

export type ErrorType = typeof ErrorType[keyof typeof ErrorType]

/**
 * 标准化错误接口
 */
export interface AppError {
  type: ErrorType
  message: string
  originalError?: Error
  statusCode?: number
  details?: any
}

/**
 * 错误消息映射（用户友好）
 */
const ERROR_MESSAGES: Record<ErrorType, string> = {
  [ErrorType.NETWORK]: '网络连接失败，请检查网络设置',
  [ErrorType.TIMEOUT]: '请求超时，请稍后重试',
  [ErrorType.VALIDATION]: '输入数据格式不正确',
  [ErrorType.NOT_FOUND]: '请求的资源不存在',
  [ErrorType.SERVER]: '服务器错误，请稍后重试',
  [ErrorType.UNAUTHORIZED]: '未授权，请先登录',
  [ErrorType.FORBIDDEN]: '没有权限访问此资源',
  [ErrorType.UNKNOWN]: '发生未知错误，请稍后重试'
}

/**
 * 识别错误类型
 */
export function identifyErrorType(error: any): ErrorType {
  // 网络错误
  if (error.message?.includes('fetch') || error.message?.includes('network')) {
    return ErrorType.NETWORK
  }

  // 超时错误
  if (error.message?.includes('timeout') || error.code === 'ETIMEDOUT') {
    return ErrorType.TIMEOUT
  }

  // HTTP 状态码错误
  if (error.response || error.statusCode) {
    const status = error.response?.status || error.statusCode

    if (status === 401) return ErrorType.UNAUTHORIZED
    if (status === 403) return ErrorType.FORBIDDEN
    if (status === 404) return ErrorType.NOT_FOUND
    if (status >= 500) return ErrorType.SERVER
    if (status >= 400) return ErrorType.VALIDATION
  }

  return ErrorType.UNKNOWN
}

/**
 * 格式化错误对象
 */
export function formatError(error: any): AppError {
  const type = identifyErrorType(error)

  return {
    type,
    message: error.message || ERROR_MESSAGES[type],
    originalError: error instanceof Error ? error : undefined,
    statusCode: error.response?.status || error.statusCode,
    details: error.response?.data || error.details
  }
}

/**
 * 获取用户友好的错误消息
 */
export function getUserFriendlyMessage(error: AppError): string {
  // 如果有自定义消息，优先使用
  if (error.details?.message) {
    return error.details.message
  }

  // 如果有 API 返回的错误消息
  if (error.details?.error) {
    return error.details.error
  }

  // 使用预定义的错误消息
  return ERROR_MESSAGES[error.type]
}

/**
 * 错误日志记录
 */
export function logError(error: AppError, context?: string) {
  const timestamp = new Date().toISOString()
  const logMessage = {
    timestamp,
    context,
    type: error.type,
    message: error.message,
    statusCode: error.statusCode,
    details: error.details,
    stack: error.originalError?.stack
  }

  // 开发环境打印详细日志
  if (import.meta.env.DEV) {
    console.error('🔴 Error:', logMessage)
  }

  // 生产环境可以发送到日志服务（TODO: Phase 5）
  // sendToLogService(logMessage)
}

/**
 * 统一错误处理函数
 *
 * @param error 原始错误对象
 * @param context 错误上下文（用于日志）
 * @param showToast 是否显示 Toast 通知
 * @returns 格式化后的错误对象
 */
export function handleError(
  error: any,
  context?: string,
  showToast = true
): AppError {
  // 格式化错误
  const appError = formatError(error)

  // 记录日志
  logError(appError, context)

  // 显示 Toast 通知
  if (showToast) {
    const message = getUserFriendlyMessage(appError)
    const { addToast } = useUIStore.getState()

    addToast({
      type: 'error',
      message,
      duration: 5000 // 错误消息显示 5 秒
    })
  }

  return appError
}

/**
 * 异步函数错误包装器
 *
 * 用法：
 * ```typescript
 * const result = await withErrorHandler(
 *   () => AgentService.chat(...),
 *   'Chat Request'
 * )
 * ```
 */
export async function withErrorHandler<T>(
  fn: () => Promise<T>,
  context?: string,
  showToast = true
): Promise<T | null> {
  try {
    return await fn()
  } catch (error) {
    handleError(error, context, showToast)
    return null
  }
}

/**
 * 重试配置
 */
export interface RetryConfig {
  maxAttempts?: number    // 最大重试次数（默认 3）
  delay?: number          // 重试延迟（ms，默认 1000）
  backoff?: number        // 退避因子（默认 2，指数退避）
  retryableErrors?: ErrorType[] // 可重试的错误类型
}

/**
 * 默认可重试的错误类型
 */
const DEFAULT_RETRYABLE_ERRORS: ErrorType[] = [
  ErrorType.NETWORK,
  ErrorType.TIMEOUT,
  ErrorType.SERVER
]

/**
 * 带重试的错误处理包装器
 *
 * 用法：
 * ```typescript
 * const result = await withRetry(
 *   () => AgentService.chat(...),
 *   { maxAttempts: 3, delay: 1000 },
 *   'Chat Request'
 * )
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {},
  context?: string
): Promise<T | null> {
  const {
    maxAttempts = 3,
    delay = 1000,
    backoff = 2,
    retryableErrors = DEFAULT_RETRYABLE_ERRORS
  } = config

  let lastError: AppError | null = null
  let currentDelay = delay

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = formatError(error)

      // 记录重试日志
      if (import.meta.env.DEV) {
        console.warn(
          `⚠️  Retry ${attempt}/${maxAttempts}:`,
          context,
          lastError.type
        )
      }

      // 判断是否可重试
      const isRetryable = retryableErrors.includes(lastError.type)
      const hasAttemptsLeft = attempt < maxAttempts

      if (!isRetryable || !hasAttemptsLeft) {
        break
      }

      // 等待后重试（指数退避）
      await new Promise(resolve => setTimeout(resolve, currentDelay))
      currentDelay *= backoff
    }
  }

  // 所有重试失败，处理错误
  if (lastError) {
    handleError(lastError.originalError || lastError, context, true)
  }

  return null
}

/**
 * 验证错误（表单验证等）
 */
export function createValidationError(message: string, details?: any): AppError {
  return {
    type: ErrorType.VALIDATION,
    message,
    details
  }
}

/**
 * 判断是否是网络错误
 */
export function isNetworkError(error: AppError): boolean {
  return error.type === ErrorType.NETWORK || error.type === ErrorType.TIMEOUT
}

/**
 * 判断是否是服务器错误
 */
export function isServerError(error: AppError): boolean {
  return error.type === ErrorType.SERVER
}

/**
 * 判断是否需要重新登录
 */
export function needsAuthentication(error: AppError): boolean {
  return error.type === ErrorType.UNAUTHORIZED
}
