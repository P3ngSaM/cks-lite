/**
 * Centralized Zustand stores export
 *
 * All stores use persist middleware for localStorage persistence
 * Only data state is persisted, not UI state (loading, etc.)
 */

export { useChatStore } from './chatStore'
export { useMemoryStore } from './memoryStore'
export { useSkillsStore } from './skillsStore'
export { useUIStore } from './uiStore'
export { useUserStore } from './userStore'
export { useAuthStore } from './authStore'
export { usePermissionStore } from './permissionStore'
export { waitForPermissionDecision, resolvePermissionDecision } from './permissionStore'

// Re-export types for convenience
export type { Message, Session } from '@/types/chat'
export type { Memory } from '@/types/agent'
export type { Skill } from '@/types/agent'
export type { Toast } from './uiStore'
export type { UserProfile } from './userStore'
export type { AuthUser } from './authStore'
export type { DesktopToolRequest } from './permissionStore'
