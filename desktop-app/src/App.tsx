import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense, useEffect } from 'react'
import { Sidebar } from './components/layout'
import { AuthContainer } from './components/auth'
import { Onboarding } from './components/onboarding'
import { TauriService } from './services/tauriService'
import {
  ErrorBoundary,
  ConnectedToastContainer,
  GlobalLoading
} from './components/ui'
import { useUserStore, useAuthStore } from './stores'

const WorkbenchPage = lazy(() => import('./pages/Workbench').then((m) => ({ default: m.Workbench })))
const MemoryPage = lazy(() => import('./pages/Memory').then((m) => ({ default: m.Memory })))
const SkillsPage = lazy(() => import('./pages/Skills').then((m) => ({ default: m.Skills })))
const GoalsPage = lazy(() => import('./pages/Goals').then((m) => ({ default: m.Goals })))
const SettingsPage = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })))
const BoardPage = lazy(() => import('./pages/Board').then((m) => ({ default: m.Board })))
const AutomationPage = lazy(() => import('./pages/Automation').then((m) => ({ default: m.Automation })))

function AppLayout() {
  return (
    <div className="flex h-screen bg-black">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <Suspense
          fallback={
            <div className="h-full flex items-center justify-center text-sm text-neutral-500">
              页面加载中...
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<Navigate to="/workbench" replace />} />
            <Route path="/workbench" element={<WorkbenchPage />} />
            <Route path="/memory" element={<MemoryPage />} />
            <Route path="/skills" element={<SkillsPage />} />
            <Route path="/goals" element={<GoalsPage />} />
            <Route path="/board" element={<BoardPage />} />
            <Route path="/automation" element={<AutomationPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  )
}

function App() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const profile = useUserStore((state) => state.profile)

  // Set dark mode by default
  useEffect(() => {
    document.documentElement.classList.add('dark')
  }, [])

  // Auto-start backend service in desktop runtime.
  useEffect(() => {
    const maybeStartAgent = async () => {
      if (!(window as any).__TAURI_INTERNALS__) return
      try {
        await TauriService.startAgentService()
      } catch (error) {
        console.warn('Failed to start Agent SDK service:', error)
        try {
          const diag = await TauriService.getAgentStartupDiagnostics()
          console.warn('Agent SDK diagnostics:', diag)
        } catch (diagError) {
          console.warn('Failed to read Agent SDK diagnostics:', diagError)
        }
      }
    }
    maybeStartAgent()
  }, [])

  // Step 1: Show auth if not authenticated
  if (!isAuthenticated) {
    return (
      <ErrorBoundary>
        <AuthContainer />
        <ConnectedToastContainer />
        <GlobalLoading />
      </ErrorBoundary>
    )
  }

  // Step 2: Show onboarding if user hasn't completed it
  if (!profile?.onboardingCompleted) {
    return (
      <ErrorBoundary>
        <Onboarding />
        <ConnectedToastContainer />
        <GlobalLoading />
      </ErrorBoundary>
    )
  }

  // Step 3: Show main app
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppLayout />

        {/* Global Components */}
        <ConnectedToastContainer />
        <GlobalLoading />
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
