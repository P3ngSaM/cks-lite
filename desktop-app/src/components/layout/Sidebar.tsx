import { Link, useLocation } from 'react-router-dom'
import { MessageSquare, Brain, Zap, Settings } from 'lucide-react'
import { cn } from '@/utils/cn'

interface NavItem {
  name: string
  path: string
  icon: React.ReactNode
}

const navItems: NavItem[] = [
  {
    name: '工作台',
    path: '/workbench',
    icon: <MessageSquare className="h-5 w-5" />
  },
  {
    name: '记忆',
    path: '/memory',
    icon: <Brain className="h-5 w-5" />
  },
  {
    name: '技能',
    path: '/skills',
    icon: <Zap className="h-5 w-5" />
  }
]

export const Sidebar = () => {
  const location = useLocation()

  return (
    <aside className="w-16 h-screen bg-black border-r border-neutral-800 flex flex-col items-center py-6">
      {/* Logo */}
      <div className="mb-8">
        <img
          src="/src/img/cks.png"
          alt="CKS Lite"
          className="w-10 h-10 rounded-lg"
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col gap-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'w-12 h-12 flex items-center justify-center rounded-lg transition-colors relative group',
                isActive
                  ? 'text-white bg-neutral-800'
                  : 'text-neutral-500 hover:text-white hover:bg-neutral-900'
              )}
              title={item.name}
            >
              {item.icon}

              {/* Tooltip */}
              <div className="absolute left-full ml-2 px-3 py-1.5 bg-neutral-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                {item.name}
              </div>

              {/* Active Indicator */}
              {isActive && (
                <div className="absolute left-0 w-0.5 h-6 bg-white rounded-r-full" />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Settings */}
      <Link
        to="/settings"
        className="w-12 h-12 flex items-center justify-center rounded-lg text-neutral-500 hover:text-white hover:bg-neutral-900 transition-colors relative group"
        title="设置"
      >
        <Settings className="h-5 w-5" />

        {/* Tooltip */}
        <div className="absolute left-full ml-2 px-3 py-1.5 bg-neutral-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
          设置
        </div>
      </Link>
    </aside>
  )
}
