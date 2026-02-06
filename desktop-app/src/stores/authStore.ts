import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface AuthUser {
  id: string
  username: string
  email: string
  token: string
  avatar?: string
}

interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean

  login: (user: AuthUser) => void
  logout: () => void
  updateUser: (user: Partial<AuthUser>) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,

      login: (user) =>
        set({
          user,
          isAuthenticated: true
        }),

      logout: () =>
        set({
          user: null,
          isAuthenticated: false
        }),

      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null
        }))
    }),
    {
      name: 'auth-storage'
    }
  )
)
