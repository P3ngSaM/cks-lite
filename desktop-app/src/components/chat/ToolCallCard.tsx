import { memo, useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, Shield, Terminal, Wrench, XCircle, Zap } from 'lucide-react'
import type { ToolCallInfo } from '@/types/chat'

export interface ToolCallCardProps {
  toolCall: ToolCallInfo
}

const statusConfig = {
  running: {
    icon: Loader2,
    iconClass: 'text-amber-400 animate-spin',
    borderClass: 'border-amber-500/30',
    bgClass: 'bg-amber-500/5',
    label: '执行中...',
    labelClass: 'text-amber-400',
    dotClass: 'bg-amber-400',
    dotAnimate: true,
  },
  success: {
    icon: CheckCircle2,
    iconClass: 'text-emerald-400',
    borderClass: 'border-emerald-500/20',
    bgClass: 'bg-emerald-500/5',
    label: '已完成',
    labelClass: 'text-emerald-400',
    dotClass: 'bg-emerald-400',
    dotAnimate: false,
  },
  error: {
    icon: XCircle,
    iconClass: 'text-red-400',
    borderClass: 'border-red-500/20',
    bgClass: 'bg-red-500/5',
    label: '执行失败',
    labelClass: 'text-red-400',
    dotClass: 'bg-red-400',
    dotAnimate: false,
  },
  pending_approval: {
    icon: Shield,
    iconClass: 'text-blue-400 animate-pulse',
    borderClass: 'border-blue-500/30',
    bgClass: 'bg-blue-500/5',
    label: '等待批准...',
    labelClass: 'text-blue-400',
    dotClass: 'bg-blue-400',
    dotAnimate: true,
  },
  denied: {
    icon: XCircle,
    iconClass: 'text-neutral-500',
    borderClass: 'border-neutral-600/20',
    bgClass: 'bg-neutral-800/30',
    label: '已拒绝',
    labelClass: 'text-neutral-500',
    dotClass: 'bg-neutral-500',
    dotAnimate: false,
  },
} as const

const kindLabel: Record<NonNullable<ToolCallInfo['kind']>, string> = {
  skill: '技能执行',
  system: '内置工具',
  desktop: '桌面工具',
  mcp: 'MCP 工具',
  other: '工具调用',
}

export const ToolCallCard = memo(({ toolCall }: ToolCallCardProps) => {
  const [expanded, setExpanded] = useState(false)
  const config = statusConfig[toolCall.status]
  const StatusIcon = config.icon
  const ToolIcon = toolCall.isDesktopTool ? Terminal : toolCall.kind === 'skill' ? Wrench : Zap

  const detailMessage = useMemo(() => {
    if (toolCall.message) return toolCall.message
    if (toolCall.status !== 'error' || !toolCall.data) return ''
    if (typeof toolCall.data.error === 'string' && toolCall.data.error) return toolCall.data.error
    if (typeof toolCall.data.stderr === 'string' && toolCall.data.stderr) return toolCall.data.stderr
    return ''
  }, [toolCall.data, toolCall.message, toolCall.status])

  const hasDetails = (toolCall.input && Object.keys(toolCall.input).length > 0) || Boolean(detailMessage)

  return (
    <div className={`rounded-lg border ${config.borderClass} ${config.bgClass} overflow-hidden transition-all`}>
      <div
        className="flex items-center gap-2.5 px-3 py-2 cursor-pointer select-none"
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        <span className="relative flex h-2 w-2 flex-shrink-0">
          {config.dotAnimate && (
            <span className={`absolute inline-flex h-full w-full rounded-full ${config.dotClass} opacity-75 animate-ping`} />
          )}
          <span className={`relative inline-flex h-2 w-2 rounded-full ${config.dotClass}`} />
        </span>

        <ToolIcon className="h-3.5 w-3.5 text-neutral-400 flex-shrink-0" />

        <span className="text-xs font-medium text-neutral-200 font-mono">{toolCall.tool}</span>

        {toolCall.kind && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700">
            {kindLabel[toolCall.kind]}
          </span>
        )}

        <div className="flex items-center gap-1 ml-auto">
          <StatusIcon className={`h-3.5 w-3.5 ${config.iconClass}`} />
          <span className={`text-xs ${config.labelClass}`}>{config.label}</span>
          {hasDetails && (
            expanded ? <ChevronUp className="h-3 w-3 text-neutral-500 ml-1" /> : <ChevronDown className="h-3 w-3 text-neutral-500 ml-1" />
          )}
        </div>
      </div>

      {expanded && hasDetails && (
        <div className="px-3 pb-2 pt-0">
          {toolCall.input && Object.keys(toolCall.input).length > 0 && (
            <div className="bg-black/30 rounded px-2.5 py-2 font-mono text-xs text-neutral-400 overflow-x-auto">
              {Object.entries(toolCall.input).map(([key, value]) => (
                <div key={key} className="flex gap-2">
                  <span className="text-neutral-500 flex-shrink-0">{key}:</span>
                  <span className="text-neutral-300 break-all">{typeof value === 'string' ? value : JSON.stringify(value)}</span>
                </div>
              ))}
            </div>
          )}
          {detailMessage && (
            <p className={`text-xs mt-1.5 ${toolCall.status === 'error' ? 'text-red-400' : 'text-neutral-500'}`}>{detailMessage}</p>
          )}
        </div>
      )}
    </div>
  )
})

ToolCallCard.displayName = 'ToolCallCard'
