import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Memory } from '@/types/agent'

interface MemoryState {
  // State
  memories: Memory[]
  filteredMemories: Memory[]
  searchQuery: string
  isLoading: boolean
  selectedCategory: string | null

  // Actions
  setMemories: (memories: Memory[]) => void
  addMemory: (memory: Memory) => void
  updateMemory: (id: string, updates: Partial<Memory>) => void
  deleteMemory: (id: string) => void
  clearMemories: () => void

  setSearchQuery: (query: string) => void
  setFilteredMemories: (memories: Memory[]) => void
  filterMemories: (query?: string) => void

  setSelectedCategory: (category: string | null) => void
  setLoading: (isLoading: boolean) => void

  // Computed
  getMemoryCount: () => number
  getMemoriesByType: (type: string) => Memory[]
  getCategories: () => string[]
}

export const useMemoryStore = create<MemoryState>()(
  persist(
    (set, get) => ({
      // Initial state
      memories: [],
      filteredMemories: [],
      searchQuery: '',
      isLoading: false,
      selectedCategory: null,

      // Memory actions
      setMemories: (memories) =>
        set({
          memories,
          filteredMemories: memories
        }),

      addMemory: (memory) =>
        set((state) => {
          const newMemories = [memory, ...state.memories]
          return {
            memories: newMemories,
            filteredMemories: state.searchQuery
              ? state.filteredMemories
              : newMemories
          }
        }),

      updateMemory: (id, updates) =>
        set((state) => ({
          memories: state.memories.map((mem) =>
            mem.id === id ? { ...mem, ...updates } : mem
          ),
          filteredMemories: state.filteredMemories.map((mem) =>
            mem.id === id ? { ...mem, ...updates } : mem
          )
        })),

      deleteMemory: (id) =>
        set((state) => ({
          memories: state.memories.filter((mem) => mem.id !== id),
          filteredMemories: state.filteredMemories.filter((mem) => mem.id !== id)
        })),

      clearMemories: () =>
        set({
          memories: [],
          filteredMemories: []
        }),

      // Search and filter actions
      setSearchQuery: (query) =>
        set({ searchQuery: query }),

      setFilteredMemories: (memories) =>
        set({ filteredMemories: memories }),

      filterMemories: (query) => {
        const { memories, searchQuery } = get()
        const filterQuery = query !== undefined ? query : searchQuery

        if (!filterQuery.trim()) {
          set({ filteredMemories: memories })
          return
        }

        const filtered = memories.filter((memory) =>
          memory.content.toLowerCase().includes(filterQuery.toLowerCase())
        )

        set({ filteredMemories: filtered })
      },

      setSelectedCategory: (category) =>
        set({ selectedCategory: category }),

      setLoading: (isLoading) =>
        set({ isLoading }),

      // Computed getters
      getMemoryCount: () => get().memories.length,

      getMemoriesByType: (type) =>
        get().memories.filter((mem) => mem.memory_type === type),

      getCategories: () => {
        const memories = get().memories
        const types = memories.map((mem) => mem.memory_type).filter(Boolean)
        return Array.from(new Set(types))
      }
    }),
    {
      name: 'memory-storage',
      partialize: (state) => ({
        // Only persist memories, not UI state
        memories: state.memories
      })
    }
  )
)
