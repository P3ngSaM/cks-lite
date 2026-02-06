import { useState } from 'react'
import { Login } from './Login'
import { Register } from './Register'

export const AuthContainer = () => {
  const [isLogin, setIsLogin] = useState(true)

  return (
    <div className="h-screen bg-black flex items-center justify-center p-6">
      {isLogin ? (
        <Login onSwitchToRegister={() => setIsLogin(false)} />
      ) : (
        <Register onSwitchToLogin={() => setIsLogin(true)} />
      )}
    </div>
  )
}
