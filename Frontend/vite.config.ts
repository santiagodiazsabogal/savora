import { defineConfig, createLogger } from 'vite'
import react from '@vitejs/plugin-react'

// Logger que silencia el ruido del proxy WebSocket de Vite cuando un socket de Socket.IO
// (Duelo de cocina) se cierra de golpe — HMR, navegación o StrictMode → "ws proxy error:
// write ECONNABORTED". Es inofensivo pero ensucia la consola. Los demás errores se mantienen.
// Nota: NO se puede silenciar desde proxy.configure() porque Vite lo loguea por su cuenta.
const logger = createLogger()
const originalError = logger.error.bind(logger)
logger.error = (msg, options) => {
  if (typeof msg === 'string' && msg.includes('ws proxy')) return
  originalError(msg, options)
}

export default defineConfig({
  // Base del sitio: en GitHub Pages la app se sirve bajo /<repo>/ (ej. /savora/).
  // El workflow de Actions exporta VITE_BASE='/savora/'; en local queda '/' y no cambia nada.
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  customLogger: logger,
  server: {
    port: 5173,
    host: true, // expone el dev server en la red local (probar desde el celular)
    // Permite el host aleatorio del túnel de Cloudflare (compartir la app con compañeros
    // mientras el PC está encendido). Sin esto, Vite 7 responde "host not allowed".
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      // Proxy del WebSocket de Socket.IO (Duelo de cocina) hacia el backend
      "/socket.io": {
        target: "http://localhost:3000",
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
