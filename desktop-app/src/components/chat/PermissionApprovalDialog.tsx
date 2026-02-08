import { memo } from 'react'
import { AlertTriangle, CheckCheck, FileText, FolderOpen, Shield, Terminal } from 'lucide-react'
import type { DesktopToolRequest } from '@/stores/permissionStore'

interface PermissionApprovalDialogProps {
  request: DesktopToolRequest
  onApprove: () => void
  onDeny: () => void
  onApproveAll: () => void
}

const riskConfig = {
  low: {
    label: '低风险',
    borderClass: 'border-emerald-500/40',
    bgClass: 'bg-emerald-500/10',
    badgeClass: 'bg-emerald-500/20 text-emerald-400',
  },
  medium: {
    label: '中风险',
    borderClass: 'border-amber-500/40',
    bgClass: 'bg-amber-500/10',
    badgeClass: 'bg-amber-500/20 text-amber-400',
  },
  high: {
    label: '高风险',
    borderClass: 'border-red-500/40',
    bgClass: 'bg-red-500/10',
    badgeClass: 'bg-red-500/20 text-red-400',
  },
} as const

function getToolIcon(tool: string) {
  switch (tool) {
    case 'run_command':
      return Terminal
    case 'delete_file':
      return AlertTriangle
    case 'read_file':
    case 'write_file':
      return FileText
    case 'list_directory':
    case 'get_file_info':
      return FolderOpen
    default:
      return Shield
  }
}

function getToolDetail(tool: string, input: Record<string, any>): string {
  switch (tool) {
    case 'run_command':
      return input.command || ''
    case 'read_file':
    case 'write_file':
    case 'get_file_info':
    case 'list_directory':
      return input.path || ''
    case 'delete_file':
      return `${input.path || ''}${input.recursive ? '（递归删除）' : ''}`
    default:
      return JSON.stringify(input)
  }
}

export const PermissionApprovalDialog = memo(
  ({ request, onApprove, onDeny, onApproveAll }: PermissionApprovalDialogProps) => {
    const risk = riskConfig[request.risk_level]
    const ToolIcon = getToolIcon(request.tool)
    const detail = getToolDetail(request.tool, request.input)

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className={`w-full max-w-md mx-4 rounded-xl border ${risk.borderClass} bg-neutral-900 shadow-2xl`}>
          <div className="flex items-center gap-3 px-5 pt-5 pb-3">
            <div className={`p-2 rounded-lg ${risk.bgClass}`}>
              <ToolIcon className="h-5 w-5 text-neutral-200" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-white">AI 请求桌面权限</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${risk.badgeClass}`}>
                  {risk.label}
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">{request.tool}</p>
            </div>
          </div>

          <div className="px-5 py-3">
            <p className="text-sm text-neutral-300">{request.description}</p>

            {detail && (
              <div className="mt-3 rounded-lg bg-black/50 border border-neutral-800 px-3 py-2.5 overflow-x-auto">
                <code className="text-xs text-neutral-300 font-mono break-all whitespace-pre-wrap">
                  {detail}
                </code>
              </div>
            )}

            {request.risk_level === 'high' && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2.5">
                <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-400">该操作可能修改或删除文件，请确认后再批准。</p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 px-5 pb-5 pt-2">
            <button
              onClick={onDeny}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-neutral-400 bg-neutral-800 hover:bg-neutral-700 transition-colors"
            >
              拒绝
            </button>
            <button
              onClick={onApprove}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-black bg-white hover:bg-neutral-200 transition-colors"
            >
              批准
            </button>
            <button
              onClick={onApproveAll}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors"
              title="本次对话后续请求自动批准"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              全部批准
            </button>
          </div>
        </div>
      </div>
    )
  }
)

PermissionApprovalDialog.displayName = 'PermissionApprovalDialog'
