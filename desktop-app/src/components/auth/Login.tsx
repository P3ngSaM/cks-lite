import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useAuthStore } from '@/stores'
import { cn } from '@/utils/cn'

interface LoginProps {
  onSwitchToRegister: () => void
}

export const Login = ({ onSwitchToRegister }: LoginProps) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const login = useAuthStore((state) => state.login)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!email || !password) {
      setError('请填写所有字段')
      return
    }

    setIsLoading(true)

    try {
      // TODO: Replace with actual API call
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Mock successful login
      login({
        id: 'user-' + Date.now(),
        username: email.split('@')[0],
        email,
        token: 'mock-token-' + Date.now()
      })
    } catch (err) {
      setError('登录失败，请检查邮箱和密码')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md">
      {/* Logo */}
      <div className="flex justify-center mb-8">
        <img
          src="/src/img/cks.png"
          alt="CKS Lite"
          className="w-20 h-20 rounded-2xl"
        />
      </div>

      {/* Title */}
      <h1 className="text-2xl font-bold text-white text-center mb-2">
        欢迎回来
      </h1>
      <p className="text-neutral-500 text-center mb-8">
        登录你的账户
      </p>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-white mb-2">
            邮箱
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="w-full px-4 py-3 rounded-lg bg-neutral-900 text-white border border-neutral-800 focus:border-white focus:outline-none placeholder:text-neutral-600"
          />
        </div>

        {/* Password */}
        <div>
          <label className="block text-sm font-medium text-white mb-2">
            密码
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 pr-12 rounded-lg bg-neutral-900 text-white border border-neutral-800 focus:border-white focus:outline-none placeholder:text-neutral-600"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition-colors"
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5" />
              ) : (
                <Eye className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/50 rounded-lg px-4 py-3">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading}
          className={cn(
            'w-full px-6 py-3 rounded-lg font-medium transition-colors',
            isLoading
              ? 'bg-neutral-800 text-neutral-600 cursor-not-allowed'
              : 'bg-white text-black hover:bg-neutral-200'
          )}
        >
          {isLoading ? '登录中...' : '登录'}
        </button>
      </form>

      {/* Switch to Register */}
      <div className="mt-6 text-center">
        <p className="text-neutral-500 text-sm">
          还没有账户？{' '}
          <button
            onClick={onSwitchToRegister}
            className="text-white hover:underline font-medium"
          >
            立即注册
          </button>
        </p>
      </div>
    </div>
  )
}
