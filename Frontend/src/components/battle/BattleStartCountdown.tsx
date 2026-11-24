import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

// Cuenta atrás de inicio de duelo: 3 → 2 → 1 → Ready? → Go!  (overlay a pantalla completa).
// Se porta a document.body porque `position: fixed` dentro de `.sv-page` (que tiene transform
// por la animación de página) se anclaría al contenedor y no al viewport.
const STEPS = ['3', '2', '1', 'ready', 'go'] as const

export default function BattleStartCountdown({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation()
  const [i, setI] = useState(0)

  useEffect(() => {
    if (i >= STEPS.length) { onDone(); return }
    // Los números aguantan ~0.85s; "Ready?" un poco menos; "Go!" sale rápido al final.
    const dur = STEPS[i] === 'go' ? 750 : STEPS[i] === 'ready' ? 800 : 850
    const id = setTimeout(() => setI((n) => n + 1), dur)
    return () => clearTimeout(id)
  }, [i]) // eslint-disable-line react-hooks/exhaustive-deps

  if (i >= STEPS.length) return null

  const step = STEPS[i]
  const isGo = step === 'go'
  const isReady = step === 'ready'
  const label = isReady
    ? t('battle.countdown_ready', { defaultValue: 'Ready?' })
    : isGo
      ? t('battle.countdown_go', { defaultValue: 'Go!' })
      : step

  // Tamaño según el contenido: números enormes, palabras un poco menores.
  const fontSize = isReady ? 'clamp(3rem, 16vw, 5rem)' : isGo ? 'clamp(4rem, 22vw, 7rem)' : 'clamp(6rem, 34vw, 11rem)'
  // "Go!" en verde de "adelante"; el resto con el degradado naranja de la marca.
  const gradient = isGo
    ? 'linear-gradient(135deg, #34D399, #10B981)'
    : 'linear-gradient(135deg, var(--sv-primary), #FF8B54)'

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center overflow-hidden"
      style={{ background: 'rgba(8,6,15,0.94)', backdropFilter: 'blur(6px)' }}
    >
      <div className="sv-orbs"><div className="sv-orb sv-orb-1" /><div className="sv-orb sv-orb-2" /><div className="sv-orb sv-orb-3" /></div>

      {/* key={i} reinicia la animación de "pop" en cada paso */}
      <div key={i} className="sv-count-pop relative text-center select-none px-8">
        <span
          className="font-black leading-none tabular-nums"
          style={{
            fontSize,
            backgroundImage: gradient,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            filter: 'drop-shadow(0 10px 40px rgba(255,94,26,0.35))',
          }}
        >
          {label}
        </span>
      </div>
    </div>,
    document.body,
  )
}
