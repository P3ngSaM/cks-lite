import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ExecutionFlowState, ExecutionPhase, Message, Session } from '@/types/chat'

interface ChatState {
  // State
  sessions: Record<string, Session>
  currentSessionId: string | null
  sessionGoalTaskMap: Record<string, number>
  sessionOrganizationMap: Record<string, string>
  sessionExecutionFlowMap: Record<string, ExecutionFlowState>
  isStreaming: boolean
  streamingMessageId: string | null

  // Actions
  addMessage: (message: Message) => void
  updateMessage: (id: string, updates: Partial<Message>) => void
  deleteMessage: (id: string) => void
  clearMessages: () => void

  setCurrentSession: (sessionId: string | null) => void
  createSession: (title?: string) => string
  deleteSession: (sessionId: string) => void
  updateSession: (sessionId: string, updates: Partial<Session>) => void
  setSessionGoalTask: (sessionId: string, goalTaskId: number) => void
  clearSessionGoalTask: (sessionId: string) => void
  setSessionOrganization: (sessionId: string, organizationId: string) => void
  clearSessionOrganization: (sessionId: string) => void
  upsertSessionExecutionFlow: (
    sessionId: string,
    update: Partial<ExecutionFlowState> & Pick<ExecutionFlowState, 'phase'>
  ) => void
  clearSessionExecutionFlow: (sessionId: string) => void

  setStreaming: (isStreaming: boolean, messageId?: string | null) => void

  // Computed
  getCurrentSession: () => Session | null
  getSessionMessages: (sessionId?: string) => Message[]
  getSessionGoalTask: (sessionId?: string | null) => number | null
  getSessionOrganization: (sessionId?: string | null) => string | null
  getSessionExecutionFlow: (sessionId?: string | null) => ExecutionFlowState | null
}

// Generate unique ID
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
const DEFAULT_SESSION_TITLE = '新对话'

const deriveSessionTitle = (content: string): string => {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (!normalized) return DEFAULT_SESSION_TITLE
  return normalized.length > 24 ? `${normalized.slice(0, 24)}...` : normalized
}


export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      // Initial state
      sessions: {},
      currentSessionId: null,
      sessionGoalTaskMap: {},
      sessionOrganizationMap: {},
      sessionExecutionFlowMap: {},
      isStreaming: false,
      streamingMessageId: null,

      // Message actions
      addMessage: (message) =>
        set((state) => {
          const sessionId = state.currentSessionId
          if (!sessionId || !state.sessions[sessionId]) return state

          const currentSession = state.sessions[sessionId]
          const shouldUpdateTitle =
            message.role === 'user' &&
            (currentSession.title === DEFAULT_SESSION_TITLE || currentSession.title.startsWith('新对话'))
          const nextTitle = shouldUpdateTitle ? deriveSessionTitle(message.content) : currentSession.title

          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...currentSession,
                title: nextTitle,
                messages: [...currentSession.messages, message],
                updatedAt: Date.now()
              }
            }
          }
        }),

      updateMessage: (id, updates) =>
        set((state) => {
          const sessionId = state.currentSessionId
          if (!sessionId || !state.sessions[sessionId]) return state

          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...state.sessions[sessionId],
                messages: state.sessions[sessionId].messages.map((msg) =>
                  msg.id === id ? { ...msg, ...updates } : msg
                ),
                updatedAt: Date.now()
              }
            }
          }
        }),

      deleteMessage: (id) =>
        set((state) => {
          const sessionId = state.currentSessionId
          if (!sessionId || !state.sessions[sessionId]) return state

          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...state.sessions[sessionId],
                messages: state.sessions[sessionId].messages.filter((msg) => msg.id !== id),
                updatedAt: Date.now()
              }
            }
          }
        }),

      clearMessages: () =>
        set((state) => {
          const sessionId = state.currentSessionId
          if (!sessionId || !state.sessions[sessionId]) return state

          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...state.sessions[sessionId],
                messages: [],
                updatedAt: Date.now()
              }
            }
          }
        }),

      // Session actions
      setCurrentSession: (sessionId) =>
        set({ currentSessionId: sessionId }),

      createSession: (title = DEFAULT_SESSION_TITLE) => {
        const sessionId = generateId()
        const newSession: Session = {
          id: sessionId,
          title,
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now()
        }

        set((state) => ({
          sessions: {
            ...state.sessions,
            [sessionId]: newSession
          },
          currentSessionId: sessionId
        }))

        return sessionId
      },

      deleteSession: (sessionId) =>
        set((state) => {
          const { [sessionId]: _, ...remainingSessions } = state.sessions
          const { [sessionId]: __, ...remainingGoalMap } = state.sessionGoalTaskMap
          const { [sessionId]: ___, ...remainingOrgMap } = state.sessionOrganizationMap
          const { [sessionId]: ____, ...remainingFlowMap } = state.sessionExecutionFlowMap
          const sessionIds = Object.keys(remainingSessions)

          return {
            sessions: remainingSessions,
            sessionGoalTaskMap: remainingGoalMap,
            sessionOrganizationMap: remainingOrgMap,
            sessionExecutionFlowMap: remainingFlowMap,
            currentSessionId:
              state.currentSessionId === sessionId
                ? (sessionIds.length > 0 ? sessionIds[0] : null)
                : state.currentSessionId
          }
        }),

      updateSession: (sessionId, updates) =>
        set((state) => ({
          sessions: {
            ...state.sessions,
            [sessionId]: {
              ...state.sessions[sessionId],
              ...updates,
              updatedAt: Date.now()
            }
          }
        })),

      setSessionGoalTask: (sessionId, goalTaskId) =>
        set((state) => ({
          sessionGoalTaskMap: {
            ...state.sessionGoalTaskMap,
            [sessionId]: goalTaskId
          }
        })),

      clearSessionGoalTask: (sessionId) =>
        set((state) => {
          const { [sessionId]: _, ...rest } = state.sessionGoalTaskMap
          return { sessionGoalTaskMap: rest }
        }),

      setSessionOrganization: (sessionId, organizationId) =>
        set((state) => ({
          sessionOrganizationMap: {
            ...state.sessionOrganizationMap,
            [sessionId]: organizationId
          }
        })),

      clearSessionOrganization: (sessionId) =>
        set((state) => {
          const { [sessionId]: _, ...rest } = state.sessionOrganizationMap
          return { sessionOrganizationMap: rest }
        }),

      upsertSessionExecutionFlow: (sessionId, update) =>
        set((state) => {
          const current = state.sessionExecutionFlowMap[sessionId]
          const next: ExecutionFlowState = {
            taskId: current?.taskId ?? null,
            phase: update.phase as ExecutionPhase,
            note: update.note ?? current?.note ?? '',
            updatedAt: Date.now(),
          }
          if (typeof update.taskId === 'number') next.taskId = update.taskId
          if (update.taskId === null) next.taskId = null
          return {
            sessionExecutionFlowMap: {
              ...state.sessionExecutionFlowMap,
              [sessionId]: next
            }
          }
        }),

      clearSessionExecutionFlow: (sessionId) =>
        set((state) => {
          const { [sessionId]: _, ...rest } = state.sessionExecutionFlowMap
          return { sessionExecutionFlowMap: rest }
        }),

      // Streaming actions
      setStreaming: (isStreaming, messageId = null) =>
        set({
          isStreaming,
          streamingMessageId: messageId
        }),

      // Computed getters
      getCurrentSession: () => {
        const { currentSessionId, sessions } = get()
        return currentSessionId ? sessions[currentSessionId] || null : null
      },

      getSessionMessages: (sessionId) => {
        const { sessions, currentSessionId } = get()
        const targetSessionId = sessionId || currentSessionId
        if (!targetSessionId) return []

        const session = sessions[targetSessionId]
        return session ? session.messages : []
      },

      getSessionGoalTask: (sessionId) => {
        const { currentSessionId, sessionGoalTaskMap } = get()
        const targetSessionId = sessionId || currentSessionId
        if (!targetSessionId) return null
        return sessionGoalTaskMap[targetSessionId] ?? null
      },

      getSessionOrganization: (sessionId) => {
        const { currentSessionId, sessionOrganizationMap } = get()
        const targetSessionId = sessionId || currentSessionId
        if (!targetSessionId) return null
        return sessionOrganizationMap[targetSessionId] ?? null
      },

      getSessionExecutionFlow: (sessionId) => {
        const { currentSessionId, sessionExecutionFlowMap } = get()
        const targetSessionId = sessionId || currentSessionId
        if (!targetSessionId) return null
        return sessionExecutionFlowMap[targetSessionId] ?? null
      }
    }),
    {
      name: 'chat-storage',
      partialize: (state) => ({
        sessions: state.sessions,
        currentSessionId: state.currentSessionId,
        sessionGoalTaskMap: state.sessionGoalTaskMap,
        sessionOrganizationMap: state.sessionOrganizationMap,
        sessionExecutionFlowMap: state.sessionExecutionFlowMap
        // Don't persist streaming state
      })
    }
  )
)
