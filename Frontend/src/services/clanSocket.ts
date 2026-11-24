import { io, Socket } from 'socket.io-client'

// Base del backend SIN el sufijo /api (el namespace de socket.io va aparte).
const API_URL = (import.meta as any).env?.VITE_API_URL || '/api'
const SOCKET_BASE = API_URL.replace(/\/api\/?$/, '')

let socket: Socket | null = null

// Devuelve (creando si hace falta) el socket del namespace /clans autenticado por JWT.
export function getClanSocket(): Socket {
  const token = localStorage.getItem('token') || ''
  if (socket && socket.connected) return socket
  if (socket) {
    // Reusar la instancia pero refrescar el token y reconectar.
    socket.auth = { token }
    if (!socket.connected) socket.connect()
    return socket
  }
  socket = io(`${SOCKET_BASE}/clans`, {
    auth: { token },
    transports: ['websocket', 'polling'],
    autoConnect: true,
  })
  return socket
}

export function disconnectClanSocket() {
  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
    socket = null
  }
}
