import { Bell, User } from 'lucide-react'
import { Button } from '@/components/ui'

export interface HeaderProps {
  title?: string
  showNotifications?: boolean
  showUserMenu?: boolean
}

export const Header = ({
  title,
  showNotifications = false,
  showUserMenu = false
}: HeaderProps) => {
  return (
    <header className="h-16 bg-[var(--bg-primary)] border-b border-[var(--border)] px-6 flex items-center justify-between">
      <div>
        {title && (
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            {title}
          </h2>
        )}
      </div>

      <div className="flex items-center gap-3">
        {showNotifications && (
          <Button variant="ghost" size="sm" className="relative">
            <Bell className="h-5 w-5" />
            {/* Notification badge */}
            <span className="absolute top-1 right-1 h-2 w-2 bg-[var(--error)] rounded-full" />
          </Button>
        )}

        {showUserMenu && (
          <Button variant="ghost" size="sm">
            <User className="h-5 w-5" />
          </Button>
        )}
      </div>
    </header>
  )
}
