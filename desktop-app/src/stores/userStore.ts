import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface UserProfile {
  agentName: string
  agentAvatar: string
  userName?: string
  onboardingCompleted: boolean
}

interface UserStore {
  profile: UserProfile | null

  setProfile: (profile: UserProfile) => void
  setUserName: (userName: string) => void
  completeOnboarding: () => void
  hasUserName: () => boolean
}

export const useUserStore = create<UserStore>()(
  persist(
    (set, get) => ({
      profile: null,

      setProfile: (profile) => set({ profile }),

      setUserName: (userName) =>
        set((state) => ({
          profile: state.profile
            ? { ...state.profile, userName }
            : null
        })),

      completeOnboarding: () =>
        set((state) => ({
          profile: state.profile
            ? { ...state.profile, onboardingCompleted: true }
            : null
        })),

      hasUserName: () => {
        const profile = get().profile
        return !!profile?.userName
      }
    }),
    {
      name: 'user-storage'
    }
  )
)
