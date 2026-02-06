import { useState, useRef, useEffect } from 'react'
import { User, Mail, Lock, LogOut, Check, Eye, EyeOff, Upload, Camera } from 'lucide-react'
import { useAuthStore, useUserStore } from '@/stores'
import { AgentService } from '@/services/agentService'
import { cn } from '@/utils/cn'

const avatars = [
  '/src/img/avatar1.png',
  '/src/img/avatar2.png',
  '/src/img/avatar3.png',
  '/src/img/avatar4.png',
  '/src/img/avatar5.png',
  '/src/img/avatar6.png',
  '/src/img/avatar7.png',
  '/src/img/avatar8.png',
  '/src/img/avatar9.png',
  '/src/img/avatar.png'
]

export const Settings = () => {
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const updateUser = useAuthStore((state) => state.updateUser)
  const profile = useUserStore((state) => state.profile)
  const setProfile = useUserStore((state) => state.setProfile)

  // Form states
  const [username, setUsername] = useState(user?.username || '')
  const [email, setEmail] = useState(user?.email || '')
  const [agentName, setAgentName] = useState(profile?.agentName || '')
  const [selectedAvatar, setSelectedAvatar] = useState(profile?.agentAvatar || '')
  const [userAvatar, setUserAvatar] = useState<string>(user?.avatar || '')

  // File input refs
  const userAvatarInputRef = useRef<HTMLInputElement>(null)
  const agentAvatarInputRef = useRef<HTMLInputElement>(null)

  // Password change states
  const [showPasswordSection, setShowPasswordSection] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // UI states
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Sync user avatar when it changes
  useEffect(() => {
    if (user?.avatar && user.avatar !== userAvatar) {
      setUserAvatar(user.avatar)
    }
  }, [user?.avatar])

  const handleSaveProfile = async () => {
    setMessage(null)
    setIsSaving(true)

    try {
      // Update auth user
      if (user) {
        updateUser({ username, email, avatar: userAvatar })
      }

      // Update agent profile
      if (profile) {
        setProfile({
          ...profile,
          agentName,
          agentAvatar: selectedAvatar
        })
      }

      // Save AI assistant name to memory system
      if (agentName && agentName.trim()) {
        const memoryContent = `AI助手的名字是 ${agentName}，用户希望我以这个名字回应`
        console.log('Saving AI name to memory:', memoryContent)
        const result = await AgentService.saveMemory({
          user_id: 'default-user',
          content: memoryContent,
          memory_type: 'preference'
        })
        if (result?.success) {
          console.log('AI name saved successfully:', result.memory_id)
        } else {
          console.error('Failed to save AI name:', result?.error)
        }
      }

      setMessage({ type: 'success', text: '保存成功！' })
    } catch (error) {
      console.error('Save profile error:', error)
      setMessage({ type: 'error', text: '保存失败，请重试' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleChangePassword = async () => {
    setMessage(null)

    if (!currentPassword || !newPassword || !confirmPassword) {
      setMessage({ type: 'error', text: '请填写所有密码字段' })
      return
    }

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: '两次输入的新密码不一致' })
      return
    }

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: '新密码至少需要6个字符' })
      return
    }

    setIsSaving(true)

    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 1000))

      setMessage({ type: 'success', text: '密码修改成功！' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setShowPasswordSection(false)
    } catch (error) {
      setMessage({ type: 'error', text: '密码修改失败，请检查当前密码' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleLogout = () => {
    if (confirm('确定要退出登录吗？')) {
      logout()
    }
  }

  const handleUserAvatarClick = () => {
    userAvatarInputRef.current?.click()
  }

  const handleAgentAvatarClick = () => {
    agentAvatarInputRef.current?.click()
  }

  const handleUserAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        const avatarData = reader.result as string
        setUserAvatar(avatarData)
        // Auto-save user avatar
        if (user) {
          updateUser({ avatar: avatarData })
        }
      }
      reader.readAsDataURL(file)
    }
  }

  const handleAgentAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        const avatarData = reader.result as string
        setSelectedAvatar(avatarData)
        // Auto-save agent avatar
        if (profile) {
          setProfile({
            ...profile,
            agentAvatar: avatarData
          })
        }
      }
      reader.readAsDataURL(file)
    }
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto bg-black">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">个人中心</h1>
          <p className="text-neutral-500 text-sm">管理你的账户信息和 AI 助手设置</p>
        </div>

        {/* Message */}
        {message && (
          <div
            className={cn(
              'rounded-lg px-4 py-3 border',
              message.type === 'success'
                ? 'bg-green-500/10 border-green-500/50 text-green-400'
                : 'bg-red-500/10 border-red-500/50 text-red-400'
            )}
          >
            <p className="text-sm">{message.text}</p>
          </div>
        )}

        {/* Account Information */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <User className="h-5 w-5" />
            账户信息
          </h2>

          <div className="space-y-4">
            {/* User Avatar */}
            <div>
              <label className="block text-sm font-medium text-white mb-3">
                个人头像
              </label>
              <div className="flex items-center gap-4">
                <div className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-neutral-800 bg-neutral-800">
                  {userAvatar ? (
                    <img
                      src={userAvatar}
                      alt="用户头像"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <User className="h-8 w-8 text-neutral-600" />
                    </div>
                  )}
                </div>
                <button
                  onClick={handleUserAvatarClick}
                  className="px-4 py-2 rounded-lg bg-neutral-800 text-white hover:bg-neutral-700 transition-colors flex items-center gap-2"
                >
                  <Upload className="h-4 w-4" />
                  上传头像
                </button>
              </div>
              <input
                ref={userAvatarInputRef}
                type="file"
                accept="image/*"
                onChange={handleUserAvatarChange}
                className="hidden"
              />
            </div>

            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                用户名
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-black text-white border border-neutral-800 focus:border-white focus:outline-none"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                邮箱
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-neutral-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-black text-white border border-neutral-800 focus:border-white focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* AI Assistant Settings */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            AI 助手设置
          </h2>

          <div className="space-y-4">
            {/* Agent Name */}
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                助手名称
              </label>
              <input
                type="text"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="例如：Alex"
                maxLength={20}
                className="w-full px-4 py-2.5 rounded-lg bg-black text-white border border-neutral-800 focus:border-white focus:outline-none"
              />
            </div>

            {/* Agent Avatar */}
            <div>
              <label className="block text-sm font-medium text-white mb-3">
                助手头像
              </label>
              <div className="space-y-3">
                {/* Upload custom avatar */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleAgentAvatarClick}
                    className="px-4 py-2 rounded-lg bg-neutral-800 text-white hover:bg-neutral-700 transition-colors flex items-center gap-2"
                  >
                    <Camera className="h-4 w-4" />
                    上传自定义头像
                  </button>
                  <span className="text-sm text-neutral-500">或选择预设头像</span>
                </div>
                <input
                  ref={agentAvatarInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAgentAvatarChange}
                  className="hidden"
                />
                {/* Avatar grid */}
                <div className="grid grid-cols-5 gap-3">
                {avatars.map((avatar, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedAvatar(avatar)}
                    className={cn(
                      'relative aspect-square rounded-lg overflow-hidden border-2 transition-all',
                      selectedAvatar === avatar
                        ? 'border-white scale-105'
                        : 'border-neutral-800 hover:border-neutral-700'
                    )}
                  >
                    <img
                      src={avatar}
                      alt={`头像 ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    {selectedAvatar === avatar && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center">
                          <Check className="h-4 w-4 text-black" />
                        </div>
                      </div>
                    )}
                  </button>
                ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSaveProfile}
          disabled={isSaving}
          className={cn(
            'w-full px-6 py-3 rounded-lg font-medium transition-colors',
            isSaving
              ? 'bg-neutral-800 text-neutral-600 cursor-not-allowed'
              : 'bg-white text-black hover:bg-neutral-200'
          )}
        >
          {isSaving ? '保存中...' : '保存更改'}
        </button>

        {/* Change Password */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Lock className="h-5 w-5" />
              修改密码
            </h2>
            {!showPasswordSection && (
              <button
                onClick={() => setShowPasswordSection(true)}
                className="text-sm text-white hover:underline"
              >
                修改
              </button>
            )}
          </div>

          {showPasswordSection && (
            <div className="space-y-4">
              {/* Current Password */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  当前密码
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full px-4 py-2.5 pr-12 rounded-lg bg-black text-white border border-neutral-800 focus:border-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  新密码
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="至少6个字符"
                  className="w-full px-4 py-2.5 rounded-lg bg-black text-white border border-neutral-800 focus:border-white focus:outline-none"
                />
              </div>

              {/* Confirm New Password */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  确认新密码
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再次输入新密码"
                  className="w-full px-4 py-2.5 rounded-lg bg-black text-white border border-neutral-800 focus:border-white focus:outline-none"
                />
              </div>

              {/* Password Actions */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleChangePassword}
                  disabled={isSaving}
                  className={cn(
                    'flex-1 px-4 py-2.5 rounded-lg font-medium transition-colors',
                    isSaving
                      ? 'bg-neutral-800 text-neutral-600 cursor-not-allowed'
                      : 'bg-white text-black hover:bg-neutral-200'
                  )}
                >
                  {isSaving ? '保存中...' : '保存密码'}
                </button>
                <button
                  onClick={() => {
                    setShowPasswordSection(false)
                    setCurrentPassword('')
                    setNewPassword('')
                    setConfirmPassword('')
                  }}
                  className="px-4 py-2.5 rounded-lg font-medium text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {!showPasswordSection && (
            <p className="text-sm text-neutral-500">
              为了安全，建议定期修改密码
            </p>
          )}
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full px-6 py-3 rounded-lg font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/50 transition-colors flex items-center justify-center gap-2"
        >
          <LogOut className="h-5 w-5" />
          退出登录
        </button>
      </div>
    </div>
  )
}
