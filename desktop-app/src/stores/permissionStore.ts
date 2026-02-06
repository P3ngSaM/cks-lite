import { create } from 'zustand'

export interface DesktopToolRequest {
  id: string
  tool: string
  input: Record<string, any>
  description: string
  risk_level: 'low' | 'medium' | 'high'
  timestamp: number
}

interface PermissionState {
  pendingRequests: DesktopToolRequest[]
  autoApproveAll: boolean
  addRequest: (request: DesktopToolRequest) => void
  removeRequest: (requestId: string) => void
  setAutoApproveAll: (value: boolean) => void
}

export const usePermissionStore = create<PermissionState>((set) => ({
  pendingRequests: [],
  autoApproveAll: false,

  addRequest: (request) =>
    set((state) => ({
      pendingRequests: [...state.pendingRequests, request],
    })),

  removeRequest: (requestId) =>
    set((state) => ({
      pendingRequests: state.pendingRequests.filter((r) => r.id !== requestId),
    })),

  setAutoApproveAll: (value) => set({ autoApproveAll: value }),
}))

// Promise-based permission decision callbacks
const pendingDecisions: Map<
  string,
  { resolve: (value: { approved: boolean }) => void }
> = new Map()

export function waitForPermissionDecision(
  requestId: string
): Promise<{ approved: boolean }> {
  // If auto-approve is on, resolve immediately
  if (usePermissionStore.getState().autoApproveAll) {
    return Promise.resolve({ approved: true })
  }

  return new Promise((resolve) => {
    pendingDecisions.set(requestId, { resolve })
  })
}

export function resolvePermissionDecision(
  requestId: string,
  approved: boolean
): void {
  const pending = pendingDecisions.get(requestId)
  if (pending) {
    pending.resolve({ approved })
    pendingDecisions.delete(requestId)
  }
  usePermissionStore.getState().removeRequest(requestId)
}
