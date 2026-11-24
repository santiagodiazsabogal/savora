import { useSyncExternalStore } from 'react'

// Store global mínimo para saber si hay algún modal/sheet a pantalla completa abierto.
// Lo usa la pastilla de tabs (BottomTabBar) para ocultarse mientras un sheet está abierto,
// sin acoplar componentes. Cuenta modales abiertos → soporta varios a la vez.
let openCount = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function pushModal() {
  openCount += 1
  emit()
}

export function popModal() {
  openCount = Math.max(0, openCount - 1)
  emit()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

const getSnapshot = () => openCount > 0

// `true` mientras haya al menos un modal abierto.
export function useAnyModalOpen() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
