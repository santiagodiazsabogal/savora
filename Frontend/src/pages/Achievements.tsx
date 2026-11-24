import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Trophy, Lock, Check } from 'lucide-react'
import Container from '../components/ui/Container'
import LoadingScreen from '../components/ui/LoadingScreen'
import { getBadges, getCachedBadges, type BadgeItem } from '../services/api'
import { BadgeIcon, categoryIconFor, badgeColor, badgeSoftBg } from '../utils/badgeIcon'

// Orden de las categorías en la página.
const CATEGORY_ORDER = ['receta', 'duelo', 'clan', 'social', 'curso', 'general'] as const

export default function Achievements() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  // Si venimos del Perfil (que ya pidió las insignias), pintamos al instante desde la caché
  // y revalidamos por red en 2º plano; solo mostramos LoadingScreen en frío.
  const cached = getCachedBadges()
  const [badges, setBadges] = useState<BadgeItem[]>(cached ?? [])
  const [loading, setLoading] = useState(!cached)

  useEffect(() => {
    async function load() {
      try {
        setBadges(await getBadges())
      } catch (err: any) {
        if (err.message === '401') { localStorage.removeItem('token'); navigate('/login') }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [navigate])

  if (loading) return <LoadingScreen />

  const total = badges.length
  const unlocked = badges.filter(b => b.completada).length

  // Agrupa por categoría conservando el orden definido.
  const grupos = CATEGORY_ORDER
    .map(cat => ({ cat, items: badges.filter(b => b.categoria === cat) }))
    .filter(g => g.items.length > 0)

  return (
    <Container backButton backTo="/profile">
      <div className="space-y-7 pb-10">

        {/* Header */}
        <div>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'linear-gradient(135deg, var(--sv-primary), #FF8B54)', boxShadow: '0 8px 24px var(--sv-primary-glow)' }}>
            <Trophy className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-black">{t('achievements.title', { defaultValue: 'Logros' })}</h1>
          <p className="sv-muted text-sm mt-1">
            {t('achievements.subtitle', { unlocked, total, defaultValue: `${unlocked} de ${total} desbloqueadas` })}
          </p>
          {/* Barra global */}
          <div className="h-2 rounded-full overflow-hidden mt-3" style={{ background: 'var(--sv-border-light)' }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${total ? Math.round((unlocked / total) * 100) : 0}%`, background: 'linear-gradient(90deg, #FF8B54, var(--sv-primary))' }} />
          </div>
        </div>

        {grupos.map(({ cat, items }) => {
          const CatIcon = categoryIconFor(cat)
          return (
            <div key={cat} className="space-y-3">
              <h2 className="text-sm font-bold sv-muted flex items-center gap-2">
                <CatIcon className="w-4 h-4" style={{ color: badgeColor(cat) }} />
                {t(`achievements.categories.${cat}`, { defaultValue: cat })}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {items.map(b => (
                  <BadgeCard key={b.id} badge={b} t={t} />
                ))}
              </div>
            </div>
          )
        })}

      </div>
    </Container>
  )
}

function BadgeCard({ badge: b, t }: { badge: BadgeItem; t: (k: string, o?: any) => string }) {
  const done = b.completada
  const pct = b.progresoTotal > 0 ? Math.min(100, Math.round((b.progresoActual / b.progresoTotal) * 100)) : 0
  const showProgress = !done && b.progresoTotal > 1

  return (
    <div
      className="sv-glass-solid p-4 flex gap-3 items-start transition"
      style={{
        opacity: done ? 1 : 0.92,
        border: done ? '1px solid var(--sv-primary)' : '1px solid var(--sv-border-light)',
        boxShadow: done ? '0 4px 16px var(--sv-primary-glow)' : 'none',
      }}
    >
      {/* Medalla */}
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 relative"
        style={{ background: done ? badgeSoftBg(b.categoria) : 'var(--sv-bg-input)' }}
      >
        <BadgeIcon id={b.id} categoria={b.categoria} className="w-6 h-6" style={{ color: done ? badgeColor(b.categoria) : 'var(--sv-text-dim)' }} />
        {done
          ? <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'var(--sv-primary)' }}><Check className="w-3 h-3 text-white" strokeWidth={3} /></span>
          : <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'var(--sv-bg-surface)', border: '1px solid var(--sv-border-light)' }}><Lock className="w-2.5 h-2.5 sv-dim" /></span>
        }
      </div>

      {/* Texto */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-bold text-sm leading-tight truncate" style={{ color: done ? 'var(--sv-text-main)' : 'var(--sv-text-muted)' }}>
            {t(`badges.items.${b.id}.name`, { defaultValue: b.nombre })}
          </p>
          {b.requiredPlan && (
            <span className="sv-badge shrink-0" style={{ fontSize: 9, padding: '2px 6px', background: 'var(--sv-clan-accent)', color: '#fff' }}>
              {b.requiredPlan}
            </span>
          )}
        </div>
        <p className="text-xs sv-dim mt-0.5 leading-snug">
          {t(`badges.items.${b.id}.desc`, { defaultValue: b.descripcion })}
        </p>

        {showProgress && (
          <div className="mt-2">
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--sv-border-light)' }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--sv-primary)' }} />
            </div>
            <p className="text-[10px] sv-dim mt-1">{b.progresoActual} / {b.progresoTotal}</p>
          </div>
        )}
        {done && (
          <p className="text-[10px] mt-1.5 font-semibold inline-flex items-center gap-1" style={{ color: 'var(--sv-primary)' }}>
            <Check className="w-3 h-3" strokeWidth={3} /> {t('achievements.unlocked', { defaultValue: 'Desbloqueada' })}
          </p>
        )}
      </div>
    </div>
  )
}
