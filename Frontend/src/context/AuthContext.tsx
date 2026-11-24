import { createContext, useState } from "react"
import { clearCachedProfile, logoutApi } from "../services/api"

type AuthContextType = {
  token: string | null
  login: (token: string, refreshToken?: string) => void
  logout: () => void
}

export const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: any) {

  const [token, setToken] = useState<string | null>(
    localStorage.getItem("token")
  )

  const login = (token: string, refreshToken?: string) => {
    clearCachedProfile() // evita mostrar datos del usuario anterior
    localStorage.setItem("token", token)
    if (refreshToken) localStorage.setItem("refreshToken", refreshToken)
    setToken(token)
  }

  const logout = () => {
    clearCachedProfile()
    const refreshToken = localStorage.getItem("refreshToken")
    if (refreshToken) void logoutApi(refreshToken) // revoca el refresh server-side (best-effort)
    localStorage.removeItem("token")
    localStorage.removeItem("refreshToken")
    setToken(null)
  }

  return (
    <AuthContext.Provider value={{ token, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}