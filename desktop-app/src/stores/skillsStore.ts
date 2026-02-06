import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Skill } from '@/types/agent'

interface SkillsState {
  // State
  skills: Skill[]
  selectedCategory: string
  isLoading: boolean
  lastFetchTime: number | null
  isInstalling: boolean
  installError: string | null

  // Actions
  setSkills: (skills: Skill[]) => void
  updateSkill: (name: string, updates: Partial<Skill>) => void
  toggleSkill: (name: string) => void

  setSelectedCategory: (category: string) => void
  setLoading: (isLoading: boolean) => void
  setLastFetchTime: (time: number) => void
  setInstalling: (v: boolean) => void
  setInstallError: (e: string | null) => void

  // Computed
  getSkillByName: (name: string) => Skill | undefined
  getEnabledSkills: () => Skill[]
  getCategories: () => string[]
  getSkillCount: (category?: string) => number
  shouldRefetch: () => boolean
}

// Cache duration: 5 minutes
const CACHE_DURATION = 5 * 60 * 1000

export const useSkillsStore = create<SkillsState>()(
  persist(
    (set, get) => ({
      // Initial state
      skills: [],
      selectedCategory: '',
      isLoading: false,
      lastFetchTime: null,
      isInstalling: false,
      installError: null,

      // Skill actions
      setSkills: (skills) =>
        set({
          skills,
          lastFetchTime: Date.now()
        }),

      updateSkill: (name, updates) =>
        set((state) => ({
          skills: state.skills.map((skill) =>
            skill.name === name ? { ...skill, ...updates } : skill
          )
        })),

      toggleSkill: (name) =>
        set((state) => ({
          skills: state.skills.map((skill) =>
            skill.name === name
              ? { ...skill, enabled: !skill.enabled }
              : skill
          )
        })),

      // Filter actions
      setSelectedCategory: (category) =>
        set({ selectedCategory: category }),

      setLoading: (isLoading) =>
        set({ isLoading }),

      setLastFetchTime: (time) =>
        set({ lastFetchTime: time }),

      setInstalling: (v) =>
        set({ isInstalling: v }),

      setInstallError: (e) =>
        set({ installError: e }),

      // Computed getters
      getSkillByName: (name) =>
        get().skills.find((skill) => skill.name === name),

      getEnabledSkills: () =>
        get().skills.filter((skill) => skill.enabled),

      getCategories: () => {
        const skills = get().skills
        const categories = skills
          .map((skill) => skill.category)
          .filter((cat): cat is string => Boolean(cat))
        return Array.from(new Set(categories))
      },

      getSkillCount: (category) => {
        const skills = get().skills
        if (!category) return skills.length
        return skills.filter((skill) => skill.category === category).length
      },

      shouldRefetch: () => {
        const { lastFetchTime } = get()
        if (!lastFetchTime) return true
        return Date.now() - lastFetchTime > CACHE_DURATION
      }
    }),
    {
      name: 'skills-storage',
      partialize: (state) => ({
        skills: state.skills,
        lastFetchTime: state.lastFetchTime
        // Don't persist UI state like selectedCategory and isLoading
      })
    }
  )
)
