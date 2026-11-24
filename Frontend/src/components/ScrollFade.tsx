import { useLocation } from 'react-router-dom'

// Fundido sutil del scroll en el borde inferior (viñeta), igual que en el dashboard.
// Se monta a nivel de App y aparece en todas las páginas con scroll, salvo
// las de auth / onboarding (donde no aporta).
const HIDDEN = ['/', '/login', '/register', '/setup-profile']

export default function ScrollFade() {
  const { pathname } = useLocation()
  if (HIDDEN.includes(pathname)) return null
  return <div className="sv-scroll-fade" aria-hidden="true" />
}
