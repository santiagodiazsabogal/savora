import { io, Socket } from 'socket.io-client'

const API_URL = (import.meta as any).env?.VITE_API_URL || '/api'

// El backend expone el namespace de Socket.IO en {origin}/battle (sin el prefijo /api)
function wsBase(): string {
  try {
    return new URL(API_URL, window.location.origin).origin
  } catch {
    return window.location.origin
  }
}

export function createBattleSocket(token: string): Socket {
  return io(`${wsBase()}/battle`, {
    auth: { token },
    transports: ['websocket'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 5,
  })
}

// Decodifica el userId (sub) del JWT sin librerías externas
export function getUserIdFromToken(token: string | null): number | null {
  if (!token) return null
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return typeof payload?.sub === 'number' ? payload.sub : null
  } catch {
    return null
  }
}
