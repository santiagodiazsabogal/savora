import { useLocation, useNavigate } from 'react-router-dom'
import { Home, Users, CalendarDays, Shield, GraduationCap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAnyModalOpen } from '../utils/modalStore'

// Items de la pastilla flotante (solo iconos).
//  - 'tab':      destino con barra persistente y slide direccional (Inicio / Social).
//  - 'launcher': abre una página que tiene su propia UI inferior (Planificador) →
//                la barra NO se queda ahí (evitamos chocar con su barra fija),
//                por eso un launcher nunca se marca como activo.
const items = [
  { kind: 'tab', key: 'home', path: '/dashboard', icon: Home, labelKey: 'nav.home' },
  { kind: 'launcher', key: 'planner', path: '/planner', icon: CalendarDays, labelKey: 'planner.title' },
  { kind: 'tab', key: 'courses', path: '/courses', icon: GraduationCap, labelKey: 'courses.dashboard_card' },
  { kind: 'tab', key: 'social', path: '/social', icon: Users, labelKey: 'nav.social' },
  { kind: 'tab', key: 'clans', path: '/clans', icon: Shield, labelKey: 'clans.title' },
] as const

// Rutas donde la pastilla se muestra (las 'tab'), en orden visual izq→der para el slide.
const tabPaths = ['/dashboard', '/courses', '/social', '/clans']

export default function BottomTabBar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()
  const modalOpen = useAnyModalOpen()

  const currentTabIndex = tabPaths.indexOf(location.pathname)
  if (currentTabIndex === -1) return null // solo en Inicio/Social
  if (modalOpen) return null              // oculta mientras un sheet/modal está abierto

  const handleClick = (item: (typeof items)[number]) => {
    if (item.path === location.pathname) return
    if (item.kind === 'launcher') { navigate(item.path); return }
    // Slide direccional entre tabs según su orden.
    const target = tabPaths.indexOf(item.path)
    const slideFrom = target > currentTabIndex ? 'right' : 'left'
    navigate(item.path, { state: { slideFrom } })
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none pb-[max(1rem,env(safe-area-inset-bottom))]">
      <nav className="sv-tabbar pointer-events-auto flex items-center gap-1.5 p-1 rounded-full">
        {items.map((item) => {
            const active = item.kind === 'tab' && item.path === location.pathname
            const Icon = item.icon
            return (
              <button
                key={item.key}
                onClick={() => handleClick(item)}
                className="flex items-center justify-center w-10 h-10 rounded-full transition-all duration-200 active:scale-90"
                style={active
                  ? {
                      // Color plano (sin degradado) → más limpio y un frame menos que componer.
                      background: 'var(--sv-primary)',
                      color: '#fff',
                      boxShadow: '0 4px 12px var(--sv-primary-glow)',
                    }
                  : { color: 'var(--sv-text-muted)' }}
                aria-current={active ? 'page' : undefined}
                aria-label={t(item.labelKey)}
              >
                <Icon className="w-5 h-5" strokeWidth={active ? 2.6 : 2.2} fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.18 : 0} />
              </button>
            )
          })}
      </nav>
    </div>
  )
}
