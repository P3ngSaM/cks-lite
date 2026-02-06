import { useState } from 'react'
import { Check } from 'lucide-react'
import { useUserStore } from '@/stores'
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

export const Onboarding = () => {
  const [selectedAvatar, setSelectedAvatar] = useState('')
  const [agentName, setAgentName] = useState('')
  const setProfile = useUserStore((state) => state.setProfile)

  const handleComplete = () => {
    if (!selectedAvatar || !agentName.trim()) return

    setProfile({
      agentName: agentName.trim(),
      agentAvatar: selectedAvatar,
      onboardingCompleted: true
    })
  }

  return (
    <div className="h-screen bg-black flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">
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
          欢迎使用 CKS Lite
        </h1>
        <p className="text-neutral-500 text-center mb-8">
          为你的 AI 助手选择头像并取个名字
        </p>

        {/* Avatar Selection */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-white mb-4">
            选择头像
          </label>
          <div className="grid grid-cols-5 gap-4">
            {avatars.map((avatar, index) => (
              <button
                key={index}
                onClick={() => setSelectedAvatar(avatar)}
                className={cn(
                  'relative aspect-square rounded-xl overflow-hidden border-2 transition-all',
                  selectedAvatar === avatar
                    ? 'border-white scale-105'
                    : 'border-neutral-800 hover:border-neutral-700'
                )}
              >
                <img
                  src={avatar}
                  alt={`Avatar ${index + 1}`}
                  className="w-full h-full object-cover"
                />
                {selectedAvatar === avatar && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
                      <Check className="h-5 w-5 text-black" />
                    </div>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Name Input */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-white mb-3">
            AI 助手的名字
          </label>
          <input
            type="text"
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            placeholder="例如：Alex"
            maxLength={20}
            className="w-full px-4 py-3 rounded-lg bg-neutral-900 text-white border border-neutral-800 focus:border-white focus:outline-none placeholder:text-neutral-600"
          />
        </div>

        {/* Complete Button */}
        <button
          onClick={handleComplete}
          disabled={!selectedAvatar || !agentName.trim()}
          className={cn(
            'w-full px-6 py-3 rounded-lg font-medium transition-colors',
            selectedAvatar && agentName.trim()
              ? 'bg-white text-black hover:bg-neutral-200'
              : 'bg-neutral-800 text-neutral-600 cursor-not-allowed'
          )}
        >
          开始使用
        </button>
      </div>
    </div>
  )
}
