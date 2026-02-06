import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Toast {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
  duration?: number
}

interface UIState {
  // State
  theme: 'dark' | 'light'
  sidebarCollapsed: boolean
  toasts: Toast[]
  globalLoading: boolean
  globalLoadingMessage: string

  // Actions
  setTheme: (theme: 'dark' | 'light') => void
  toggleTheme: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebar: () => void

  // Toast actions
  addToast: (toast: Omit<Toast, 'id'>) => string
  removeToast: (id: string) => void
  clearToasts: () => void

  // Global Loading actions
  setGlobalLoading: (loading: boolean, message?: string) => void

  // Computed
  isDark: () => boolean
}

// Generate unique ID for toasts
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      // Initial state
      theme: 'dark',
      sidebarCollapsed: false,
      toasts: [],
      globalLoading: false,
      globalLoadingMessage: '',

      // Theme actions
      setTheme: (theme) => {
        set({ theme })
        // Update document class for Tailwind dark mode
        if (theme === 'dark') {
          document.documentElement.classList.add('dark')
        } else {
          document.documentElement.classList.remove('dark')
        }
      },

      toggleTheme: () => {
        const currentTheme = get().theme
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark'
        get().setTheme(newTheme)
      },

      // Sidebar actions
      setSidebarCollapsed: (collapsed) =>
        set({ sidebarCollapsed: collapsed }),

      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      // Toast actions
      addToast: (toast) => {
        const id = generateId()
        const duration = toast.duration ?? 3000
        const newToast: Toast = {
          ...toast,
          id,
          duration
        }

        set((state) => ({
          toasts: [...state.toasts, newToast]
        }))

        // Auto remove toast after duration
        if (duration > 0) {
          setTimeout(() => {
            get().removeToast(id)
          }, duration)
        }

        return id
      },

      removeToast: (id) =>
        set((state) => ({
          toasts: state.toasts.filter((toast) => toast.id !== id)
        })),

      clearToasts: () => set({ toasts: [] }),

      // Global Loading actions
      setGlobalLoading: (loading, message = '') =>
        set({
          globalLoading: loading,
          globalLoadingMessage: message
        }),

      // Computed getters
      isDark: () => get().theme === 'dark'
    }),
    {
      name: 'ui-storage',
      partialize: (state) => ({
        // Only persist theme and sidebar state
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed
        // Don't persist toasts (ephemeral)
      }),
      // Initialize theme on load
      onRehydrateStorage: () => (state) => {
        if (state?.theme === 'dark') {
          document.documentElement.classList.add('dark')
        } else {
          document.documentElement.classList.remove('dark')
        }
      }
    }
  )
)
