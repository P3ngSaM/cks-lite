import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { Sidebar } from './components/layout'
import { AuthContainer } from './components/auth'
import { Onboarding } from './components/onboarding'
import { Workbench, Memory, Skills, Settings } from './pages'
import {
  ErrorBoundary,
  ConnectedToastContainer,
  GlobalLoading
} from './components/ui'
import { useUserStore, useAuthStore } from './stores'

function AppLayout() {
  return (
    <div className="flex h-screen bg-black">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <Routes>
          <Route path="/" element={<Navigate to="/workbench" replace />} />
          <Route path="/workbench" element={<Workbench />} />
          <Route path="/memory" element={<Memory />} />
          <Route path="/skills" element={<Skills />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
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
