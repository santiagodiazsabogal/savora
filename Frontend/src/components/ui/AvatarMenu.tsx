import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, LogOut, ChevronDown, Sun, Moon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../context/ThemeContext'

interface Props {
  name?: string
  email?: string
}

function getInitials(name?: string): string {
  if (!name) return '?'
  const parts = name.trim().split(' ')
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

export default function AvatarMenu({ name, email }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { theme, toggleTheme } = useTheme()

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = () => { localStorage.removeItem('token'); navigate('/login') }
  const handleProfile = () => { setOpen(false); navigate('/profile') }

  return (
    <div className="relative" ref={ref}>

      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 active:scale-95 transition-transform">
        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--sv-primary), #FF8B54)', boxShadow: '0 6px 18px var(--sv-primary-glow)' }}>
          <span className="text-white font-bold text-sm">{getInitials(name)}</span>
        </div>
        <ChevronDown className={`w-4 h-4 sv-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown alineado a la IZQUIERDA del avatar → abre hacia la derecha */}
      {open && (
        <div
          className="absolute left-0 top-12 mt-1 w-56 overflow-hidden z-50 rounded-3xl"
          style={{
            background: 'var(--sv-bg-elevated)',
            border: '1px solid var(--sv-border-strong)',
            boxShadow: 'var(--sv-shadow-glass-hover)',
          }}
        >

          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--sv-border-light)' }}>
            <p className="font-semibold text-sm truncate">{name || 'Usuario'}</p>
            <p className="sv-dim text-xs truncate">{email || ''}</p>
          </div>

          <div className="py-1">
            <button onClick={handleProfile} className="sv-menu-item w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors text-left">
              <User className="w-4 h-4" />
              {t('profile.title', { defaultValue: 'My profile' })}
            </button>

            <button onClick={toggleTheme} className="sv-menu-item w-full flex items-center justify-between px-4 py-3 text-sm transition-colors">
              <div className="flex items-center gap-3">
                {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                <span>{t('common.theme', { defaultValue: 'Theme' })}</span>
              </div>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,94,26,0.15)', color: 'var(--sv-primary)' }}>
                {theme === 'dark'
                  ? t('common.theme_dark', { defaultValue: 'Dark' })
                  : t('common.theme_light', { defaultValue: 'Light' })}
              </span>
            </button>

            <button onClick={handleLogout} className="sv-menu-item-danger w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors text-left" style={{ color: '#F87171' }}>
              <LogOut className="w-4 h-4" />
              {t('common.logout', { defaultValue: 'Log out' })}
            </button>
          </div>

        </div>
      )}

    </div>
  )
}