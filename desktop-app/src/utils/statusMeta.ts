type StatusMeta = {
  label: string
  badgeClassName: string
}

const taskStatusMetaMap: Record<string, StatusMeta> = {
  pending: { label: '待执行', badgeClassName: 'border-neutral-700 bg-neutral-900 text-neutral-300' },
  running: { label: '执行中', badgeClassName: 'border-blue-500/40 bg-blue-500/10 text-blue-200' },
  waiting_approval: { label: '待审批', badgeClassName: 'border-amber-500/40 bg-amber-500/10 text-amber-200' },
  paused: { label: '已暂停', badgeClassName: 'border-violet-500/40 bg-violet-500/10 text-violet-200' },
  completed: { label: '已完成', badgeClassName: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' },
  failed: { label: '执行失败', badgeClassName: 'border-rose-500/40 bg-rose-500/10 text-rose-200' },
  canceled: { label: '已取消', badgeClassName: 'border-neutral-700 bg-neutral-900 text-neutral-400' },
}

const nodeStatusMetaMap: Record<string, StatusMeta> = {
  online: { label: '在线', badgeClassName: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' },
  busy: { label: '繁忙', badgeClassName: 'border-amber-500/40 bg-amber-500/10 text-amber-300' },
  offline: { label: '离线', badgeClassName: 'border-neutral-700 bg-neutral-900 text-neutral-400' },
}

const approvalStatusMetaMap: Record<string, StatusMeta> = {
  pending: { label: '待审批', badgeClassName: 'border-amber-500/40 bg-amber-500/10 text-amber-200' },
  approved: { label: '已批准', badgeClassName: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' },
  denied: { label: '已拒绝', badgeClassName: 'border-rose-500/40 bg-rose-500/10 text-rose-200' },
  expired: { label: '已过期', badgeClassName: 'border-neutral-700 bg-neutral-900 text-neutral-400' },
}

const toolRunStatusMetaMap: Record<string, StatusMeta> = {
  running: { label: '执行中', badgeClassName: 'border-blue-500/40 bg-blue-500/10 text-blue-200' },
  success: { label: '成功', badgeClassName: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' },
  error: { label: '失败', badgeClassName: 'border-rose-500/40 bg-rose-500/10 text-rose-200' },
  pending_approval: { label: '待审批', badgeClassName: 'border-amber-500/40 bg-amber-500/10 text-amber-200' },
  denied: { label: '已拒绝', badgeClassName: 'border-rose-500/40 bg-rose-500/10 text-rose-200' },
}

const reviewStatusMetaMap: Record<string, StatusMeta> = {
  pending: { label: '待验收', badgeClassName: 'border-amber-500/40 bg-amber-500/10 text-amber-200' },
  accepted: { label: '已验收', badgeClassName: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' },
  rejected: { label: '已驳回', badgeClassName: 'border-rose-500/40 bg-rose-500/10 text-rose-200' },
}

export const normalizeTaskStatusKey = (value: string): string => {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return 'pending'
  if (normalized === 'done' || normalized === 'complete' || normalized === 'success') return 'completed'
  if (normalized === 'waitingapproval' || normalized === 'waiting-approval' || normalized === 'awaiting_approval') return 'waiting_approval'
  if (normalized === 'cancelled') return 'canceled'
  return normalized
}

export const getTaskStatusMeta = (status: string): StatusMeta => {
  const normalized = normalizeTaskStatusKey(status)
  return taskStatusMetaMap[normalized] || { label: normalized || '未知状态', badgeClassName: 'border-neutral-700 bg-neutral-900 text-neutral-300' }
}

export const getNodeStatusMeta = (status: string): StatusMeta => {
  const normalized = String(status || '').trim().toLowerCase() || 'offline'
  return nodeStatusMetaMap[normalized] || { label: normalized || '未知状态', badgeClassName: 'border-neutral-700 bg-neutral-900 text-neutral-300' }
}

export const getApprovalStatusMeta = (status: string): StatusMeta => {
  const normalized = String(status || '').trim().toLowerCase() || 'pending'
  return approvalStatusMetaMap[normalized] || { label: normalized || '未知状态', badgeClassName: 'border-neutral-700 bg-neutral-900 text-neutral-300' }
}

export const getToolRunStatusMeta = (status: string): StatusMeta => {
  const normalized = String(status || '').trim().toLowerCase() || 'running'
  return toolRunStatusMetaMap[normalized] || { label: normalized || '未知状态', badgeClassName: 'border-neutral-700 bg-neutral-900 text-neutral-300' }
}

export const getReviewStatusMeta = (status?: string): StatusMeta => {
  const normalized = String(status || 'pending').trim().toLowerCase() || 'pending'
  return reviewStatusMetaMap[normalized] || { label: normalized || '未知状态', badgeClassName: 'border-neutral-700 bg-neutral-900 text-neutral-300' }
}
