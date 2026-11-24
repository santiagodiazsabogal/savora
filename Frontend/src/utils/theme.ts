// Tema visual de Savora. Claro ("Crema cálida") por defecto; oscuro como opción.
// El oscuro se activa añadiendo la clase .sv-dark en <html> (ver savora-ui.css).
export type Theme = 'light' | 'dark'

const KEY = 'theme'

export function getStoredTheme(): Theme | null {
  const v = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
  return v === 'light' || v === 'dark' ? v : null
}

// Default = claro. Si en el futuro se quiere "seguir el sistema", se ajusta aquí.
export function resolveInitialTheme(): Theme {
  return getStoredTheme() ?? 'light'
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('sv-dark', theme === 'dark')
}

export function persistTheme(theme: Theme): void {
  try { localStorage.setItem(KEY, theme) } catch { /* ignore */ }
  applyTheme(theme)
}
