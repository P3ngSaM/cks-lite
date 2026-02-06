import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Message, Session } from '@/types/chat'

interface ChatState {
  // State
  sessions: Record<string, Session>
  currentSessionId: string | null
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

  setStreaming: (isStreaming: boolean, messageId?: string | null) => void

  // Computed
  getCurrentSession: () => Session | null
  getSessionMessages: (sessionId?: string) => Message[]
}

// Generate unique ID
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      // Initial state
      sessions: {},
      currentSessionId: null,
      isStreaming: false,
      streamingMessageId: null,

      // Message actions
      addMessage: (message) =>
        set((state) => {
          const sessionId = state.currentSessionId
          if (!sessionId || !state.sessions[sessionId]) return state

          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...state.sessions[sessionId],
                messages: [...state.sessions[sessionId].messages, message],
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

      createSession: (title = '新对话') => {
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
          const sessionIds = Object.keys(remainingSessions)

          return {
            sessions: remainingSessions,
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
      }
    }),
    {
      name: 'chat-storage',
      partialize: (state) => ({
        sessions: state.sessions,
        currentSessionId: state.currentSessionId
        // Don't persist streaming state
      })
    }
  )
)
