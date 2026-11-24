import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, TrendingUp } from 'lucide-react'
import type { BattleXpResult } from '../../hooks/useBattle'

interface Props {
  result: BattleXpResult
  onClose: () => void
}

const CONFETTI_COLORS = ['#F0824F', '#8B5CF6', '#10B981', '#E8890C', '#FBD8C4']
const CONFETTI_COUNT = 30

export default function BattleXpCelebration({ result, onClose }: Props) {
  const { t } = useTranslation()
  const [displayedXp, setDisplayedXp] = useState(0)

  // "Odómetro": cuenta el XP de 0 hasta lo ganado en ~700ms, en vez de aparecer de golpe.
  useEffect(() => {
    const target = result.xpGained
    if (target <= 0) { setDisplayedXp(0); return }
    const steps = Math.min(target, 30)
    const stepMs = 700 / steps
    let count = 0
    const id = setInterval(() => {
      count += 1
      const value = Math.round((target * count) / steps)
      setDisplayedXp(value)
      if (count >= steps) clearInterval(id)
    }, stepMs)
    return () => clearInterval(id)
  }, [result.xpGained])

  // Confetti solo cuando hay subida de nivel — cada partícula fija su propia
  // posición/retraso/deriva/color inline para que no se vean sincronizadas.
  const confetti = useMemo(() => {
    if (!result.leveledUp) return []
    return Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.4,
      duration: 1.3 + Math.random() * 1.2,
      drift: Math.round((Math.random() - 0.5) * 180),
      rotate: Math.round(360 + Math.random() * 540),
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    }))
  }, [result.leveledUp])

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center px-6 overflow-hidden"
      style={{ background: 'rgba(7,5,10,0.85)', backdropFilter: 'blur(8px)', animation: 'svPageFadeIn 0.4s ease-out' }}
    >
      {confetti.map((c, i) => (
        <span
          key={i}
          className="sv-confetti-piece"
          style={{
            left: `${c.left}%`,
            background: c.color,
            animationDuration: `${c.duration}s`,
            animationDelay: `${c.delay}s`,
            '--sv-confetti-x': `${c.drift}px`,
            '--sv-confetti-r': `${c.rotate}deg`,
          } as React.CSSProperties}
        />
      ))}

      <div className="sv-glass p-7 w-full text-center relative" style={{ maxWidth: 360, animation: 'svSlideUpFade 0.5s var(--sv-ease-spring) both' }}>
        <div className="relative w-24 h-24 mx-auto mb-4">
          {result.leveledUp && (
            <div
              className="sv-xp-rays absolute rounded-full"
              style={{
                inset: -16,
                background: 'conic-gradient(from 0deg, transparent 0deg, rgba(240,130,79,0.4) 14deg, transparent 28deg, transparent 90deg, rgba(139,92,246,0.35) 104deg, transparent 118deg, transparent 200deg, rgba(16,185,129,0.3) 214deg, transparent 228deg)',
              }}
            />
          )}
          <div
            className="sv-xp-glow-pulse absolute inset-0 rounded-full"
            style={{ background: result.leveledUp ? 'var(--sv-primary-glow)' : 'rgba(240,130,79,0.22)' }}
          />
          <div
            className="sv-xp-badge-pop relative w-24 h-24 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(240,130,79,0.18)', border: '2px solid var(--sv-primary)' }}
          >
            {result.leveledUp
              ? <TrendingUp className="w-11 h-11" style={{ color: 'var(--sv-primary)' }} />
              : <Sparkles className="w-11 h-11" style={{ color: 'var(--sv-primary)' }} />}
          </div>
        </div>

        <p className="sv-xp-counter text-4xl font-black sv-text-gradient-primary">
          +{displayedXp} XP
        </p>

        {result.leveledUp ? (
          <div className="sv-level-banner mt-4 rounded-2xl px-4 py-3.5" style={{ background: 'rgba(255,94,26,0.12)', border: '1px solid rgba(255,94,26,0.3)' }}>
            <p className="text-xs font-bold sv-dim uppercase tracking-wider mb-0.5">{t('battle.xp_celebration.level_up_label')}</p>
            <p className="text-2xl font-black" style={{ color: 'var(--sv-primary)' }}>{t('battle.xp_celebration.level_up', { level: result.nivel })}</p>
          </div>
        ) : (
          <p className="sv-muted text-sm mt-3">{t('battle.xp_celebration.subtitle')}</p>
        )}

        <button onClick={onClose} className="sv-btn sv-btn-primary w-full py-3 mt-6">
          {t('battle.xp_celebration.continue')}
        </button>
      </div>
    </div>
  )
}
