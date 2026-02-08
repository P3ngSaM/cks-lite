import { useState } from 'react'
import { Download, X, Loader2 } from 'lucide-react'
import { AgentService } from '@/services/agentService'

interface InstallSkillDialogProps {
  isOpen: boolean
  onClose: () => void
  onInstalled: () => void
}

export const InstallSkillDialog = ({ isOpen, onClose, onInstalled }: InstallSkillDialogProps) => {
  const [mode, setMode] = useState<'github' | 'local' | 'create'>('github')
  const [ref, setRef] = useState('')
  const [localPath, setLocalPath] = useState('')
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('general')
  const [triggerKeywords, setTriggerKeywords] = useState('')
  const [tags, setTags] = useState('')
  const [isInstalling, setIsInstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const resetAll = () => {
    setRef('')
    setLocalPath('')
    setName('')
    setDisplayName('')
    setDescription('')
    setCategory('general')
    setTriggerKeywords('')
    setTags('')
  }

  const handleInstall = async () => {
    setIsInstalling(true)
    setError(null)

    try {
      let result = null
      if (mode === 'github') {
        if (!ref.trim()) return
        result = await AgentService.installSkill(ref.trim())
      } else if (mode === 'local') {
        if (!localPath.trim()) return
        result = await AgentService.installSkillLocal(localPath.trim())
      } else {
        if (!name.trim() || !displayName.trim()) return
        result = await AgentService.createSkillScaffold({
          name: name.trim(),
          display_name: displayName.trim(),
          description: description.trim(),
          category: category.trim() || 'general',
          trigger_keywords: triggerKeywords.split(',').map((v) => v.trim()).filter(Boolean),
          tags: tags.split(',').map((v) => v.trim()).filter(Boolean),
        })
      }

      if (result?.success) {
        resetAll()
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
    if (e.key === 'Enter' && !isInstalling) {
      handleInstall()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-lg w-full shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-neutral-800">
              <Download className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">安装或创建 Skill</h2>
              <p className="text-xs text-neutral-500">支持 GitHub / 本地上传 / 快速创建</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-neutral-800 transition-colors">
            <X className="h-5 w-5 text-neutral-400" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <button onClick={() => setMode('github')} className={`px-3 py-1.5 text-xs rounded border ${mode === 'github' ? 'border-white text-white' : 'border-neutral-700 text-neutral-400'}`}>
              GitHub 下载
            </button>
            <button onClick={() => setMode('local')} className={`px-3 py-1.5 text-xs rounded border ${mode === 'local' ? 'border-white text-white' : 'border-neutral-700 text-neutral-400'}`}>
              本地上传
            </button>
            <button onClick={() => setMode('create')} className={`px-3 py-1.5 text-xs rounded border ${mode === 'create' ? 'border-white text-white' : 'border-neutral-700 text-neutral-400'}`}>
              创建 Skill
            </button>
          </div>

          {mode === 'github' && (
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
              <p className="mt-2 text-xs text-neutral-500">支持 skills.sh / GitHub 标准 SKILL.md 技能</p>
            </div>
          )}

          {mode === 'local' && (
            <div>
              <input
                type="text"
                value={localPath}
                onChange={(e) => setLocalPath(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="本地目录或 .zip 路径，例如 C:\\skills\\my-skill"
                disabled={isInstalling}
                className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder:text-neutral-500 focus:outline-none focus:border-neutral-600 disabled:opacity-50 font-mono text-sm"
              />
              <p className="mt-2 text-xs text-neutral-500">目录或压缩包中必须包含 SKILL.md</p>
            </div>
          )}

          {mode === 'create' && (
            <div className="grid grid-cols-1 gap-2">
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="skill id，例如 report-helper" disabled={isInstalling} className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-sm" />
              <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="显示名称，例如 报表助手" disabled={isInstalling} className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-sm" />
              <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="描述" disabled={isInstalling} className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-sm" />
              <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="分类" disabled={isInstalling} className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-sm" />
              <input type="text" value={triggerKeywords} onChange={(e) => setTriggerKeywords(e.target.value)} placeholder="触发词，逗号分隔" disabled={isInstalling} className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-sm" />
              <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="标签，逗号分隔" disabled={isInstalling} className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-sm" />
            </div>
          )}

          {error && (
            <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-neutral-800">
          <button onClick={onClose} disabled={isInstalling} className="px-4 py-2 rounded-lg text-sm font-medium text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors disabled:opacity-50">
            取消
          </button>
          <button
            onClick={handleInstall}
            disabled={
              isInstalling ||
              (mode === 'github' && !ref.trim()) ||
              (mode === 'local' && !localPath.trim()) ||
              (mode === 'create' && (!name.trim() || !displayName.trim()))
            }
            className="px-4 py-2 rounded-lg text-sm font-medium bg-white text-black hover:bg-neutral-200 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isInstalling ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                处理中...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                确认
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
