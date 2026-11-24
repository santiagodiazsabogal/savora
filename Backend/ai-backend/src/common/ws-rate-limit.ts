import { Socket } from 'socket.io';

// Rate limit simple por socket (ventana deslizante en memoria). Los gateways WS no
// pasan por el ThrottlerGuard HTTP, así que los eventos costosos (mensajes con
// moderación, preguntas al chef con OpenAI, fotos) llevan este tope por conexión.
// El estado vive en socket.data → se limpia solo al desconectar.
export function wsRateAllow(socket: Socket, key: string, limit: number, windowMs: number): boolean {
  const store: Map<string, number[]> = socket.data.rl ?? (socket.data.rl = new Map());
  const now = Date.now();
  const hits = (store.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    store.set(key, hits);
    return false;
  }
  hits.push(now);
  store.set(key, hits);
  return true;
}
