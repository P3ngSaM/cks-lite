import { useState, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/utils/cn'

export interface SearchBarProps {
  onSearch: (query: string) => void
  placeholder?: string
  debounceMs?: number
}

export const SearchBar = ({
  onSearch,
  placeholder = '搜索记忆...',
  debounceMs = 500
}: SearchBarProps) => {
  const [query, setQuery] = useState('')

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      onSearch(query)
    }, debounceMs)

    return () => clearTimeout(timer)
  }, [query, debounceMs, onSearch])

  const handleClear = () => {
    setQuery('')
    onSearch('')
  }

  return (
    <div className="relative">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">
        <Search className="h-5 w-5" />
      </div>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'w-full pl-10 pr-10 py-3 rounded-lg transition-colors',
          'bg-black text-white',
          'border border-neutral-800',
          'placeholder:text-neutral-600',
          'focus:outline-none focus:border-white'
        )}
      />

      {query && (
        <button
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
  )
}
