import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useAuthStore } from '@/stores'
import { cn } from '@/utils/cn'

interface RegisterProps {
  onSwitchToLogin: () => void
}

export const Register = ({ onSwitchToLogin }: RegisterProps) => {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const login = useAuthStore((state) => state.login)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!username || !email || !password || !confirmPassword) {
      setError('请填写所有字段')
      return
    }

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }

    if (password.length < 6) {
      setError('密码至少需要6个字符')
      return
    }

    setIsLoading(true)

    try {
      // TODO: Replace with actual API call
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Mock successful registration
      login({
        id: 'user-' + Date.now(),
        username,
        email,
        token: 'mock-token-' + Date.now()
      })
    } catch (err) {
      setError('注册失败，请稍后重试')
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
        创建账户
      </h1>
      <p className="text-neutral-500 text-center mb-8">
        开始使用 CKS Lite
      </p>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Username */}
        <div>
          <label className="block text-sm font-medium text-white mb-2">
            用户名
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="你的用户名"
            className="w-full px-4 py-3 rounded-lg bg-neutral-900 text-white border border-neutral-800 focus:border-white focus:outline-none placeholder:text-neutral-600"
          />
        </div>

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
              placeholder="至少6个字符"
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

        {/* Confirm Password */}
        <div>
          <label className="block text-sm font-medium text-white mb-2">
            确认密码
          </label>
          <input
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="再次输入密码"
            className="w-full px-4 py-3 rounded-lg bg-neutral-900 text-white border border-neutral-800 focus:border-white focus:outline-none placeholder:text-neutral-600"
          />
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
          {isLoading ? '注册中...' : '注册'}
        </button>
      </form>

      {/* Switch to Login */}
      <div className="mt-6 text-center">
        <p className="text-neutral-500 text-sm">
          已有账户？{' '}
          <button
            onClick={onSwitchToLogin}
            className="text-white hover:underline font-medium"
          >
            立即登录
          </button>
        </p>
      </div>
    </div>
  )
}
