import { useContext } from "react"
import { Navigate } from "react-router-dom"
import { AuthContext } from "../context/AuthContext"

export default function ProtectedRoute({ children }: any) {

  const auth = useContext(AuthContext)

  console.log("TOKEN ACTUAL:", auth?.token)

  if (!auth?.token) {
    return <Navigate to="/login" />
  }

  return children
}