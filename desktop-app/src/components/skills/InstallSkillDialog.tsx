import { useState } from 'react'
import { Download, X, Loader2 } from 'lucide-react'
import { AgentService } from '@/services/agentService'

interface InstallSkillDialogProps {
  isOpen: boolean
  onClose: () => void
  onInstalled: () => void
}

export const InstallSkillDialog = ({ isOpen, onClose, onInstalled }: InstallSkillDialogProps) => {
  const [ref, setRef] = useState('')
  const [isInstalling, setIsInstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleInstall = async () => {
    if (!ref.trim()) return

    setIsInstalling(true)
    setError(null)

    try {
      const result = await AgentService.installSkill(ref.trim())
      if (result?.success) {
        setRef('')
        onInstalled()
      } else {
        setError(result?.error || '安装失败')
      }
    } catch (err) {
      setError('网络错误: ' + String(err))
    } finally {
      setIsInstalling(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isInstalling && ref.trim()) {
      handleInstall()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-lg w-full shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-neutral-800">
              <Download className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                安装社区技能
              </h2>
              <p className="text-xs text-neutral-500">
                从 skills.sh / GitHub 安装技能
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <X className="h-5 w-5 text-neutral-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <div>
            <input
              type="text"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="owner/repo 或 https://github.com/..."
              disabled={isInstalling}
              className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder:text-neutral-500 focus:outline-none focus:border-neutral-600 disabled:opacity-50 font-mono text-sm"
            />
            <p className="mt-2 text-xs text-neutral-500">
              支持 skills.sh / GitHub 上的 SKILL.md 标准技能，如 owner/repo/path/to/skill
            </p>
          </div>

          {error && (
            <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-neutral-800">
          <button
            onClick={onClose}
            disabled={isInstalling}
            className="px-4 py-2 rounded-lg text-sm font-medium text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleInstall}
            disabled={isInstalling || !ref.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-white text-black hover:bg-neutral-200 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isInstalling ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                安装中...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                安装
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
