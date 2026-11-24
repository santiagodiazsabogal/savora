import { useEffect, useState } from 'react'
import { FlameIcon } from './LoadingScreen'

/* ─────────────────────────────────────────────────────────────────────────────
   SplashScreen — pantalla de inicio que imita el "zoom fluido" nativo de iOS.
   Secuencia:
     1. enter  → el logo aparece con un leve overshoot (como el ícono al abrirse)
     2. hold   → respira con el glow blanco pulsando
     3. exit   → todo hace zoom hacia adelante y se desvanece, abriéndose a la app
   Se monta una sola vez por carga de la app (en App.tsx) y se autodesmonta.
───────────────────────────────────────────────────────────────────────────── */

const ENTER_MS = 620   // entrada del logo
const HOLD_MS = 780    // pausa respirando
const EXIT_MS = 700    // zoom-out final

type Phase = 'enter' | 'exit' | 'done'

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export default function SplashScreen({ onFinish }: { onFinish?: () => void }) {
  const [phase, setPhase] = useState<Phase>('enter')
  const [reduced] = useState(prefersReducedMotion)

  useEffect(() => {
    const toExit = setTimeout(() => setPhase('exit'), ENTER_MS + HOLD_MS)
    const toDone = setTimeout(() => {
      setPhase('done')
      onFinish?.()
    }, ENTER_MS + HOLD_MS + EXIT_MS)
    return () => {
      clearTimeout(toExit)
      clearTimeout(toDone)
    }
  }, [onFinish])

  if (phase === 'done') return null

  const exiting = phase === 'exit'

  return (
    <div
      aria-hidden
      className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden"
      style={{
        zIndex: 9999,
        background: '#07050A',
        transformOrigin: 'center center',
        willChange: 'transform, opacity',
        // El overlay completo hace zoom hacia adelante y se desvanece (o solo fade
        // si el usuario pidió movimiento reducido).
        animation: exiting
          ? reduced
            ? `splashFadeOut ${EXIT_MS}ms ease forwards`
            : `splashZoomOut ${EXIT_MS}ms cubic-bezier(0.7, 0, 0.84, 0) forwards`
          : undefined,
      }}
    >
      <div
        className="relative flex items-center justify-center"
        style={{
          willChange: 'transform, opacity',
          animation: reduced
            ? `splashFadeIn ${ENTER_MS}ms ease both`
            : `splashLogoIn ${ENTER_MS}ms cubic-bezier(0.34, 1.56, 0.64, 1) both`,
        }}
      >
        {/* Halo blanco brillante (como en el logo) */}
        <div
          className="absolute pointer-events-none"
          style={{
            width: 340,
            height: 340,
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.55) 24%, rgba(255,176,120,0.28) 44%, transparent 68%)',
            filter: 'blur(6px)',
            animation: 'splashGlow 1.6s ease-in-out infinite alternate',
          }}
        />

        {/* La llama de Savora — naranja con interior blanco (sobre el halo) */}
        <FlameIcon
          gradId="splashFlame"
          holeFill="#FFFFFF"
          width={150}
          height={164}
          style={{
            position: 'relative',
            zIndex: 1,
            filter: 'drop-shadow(0 0 26px rgba(255,120,40,0.45))',
          }}
        />
      </div>

      {/* Wordmark sutil que aparece bajo la llama */}
      <div
        className="relative flex items-center"
        style={{
          marginTop: 26,
          gap: 2,
          animation: `splashWordIn 520ms ease-out ${ENTER_MS - 120}ms both`,
        }}
      >
        <span style={wordStyle}>Savora</span>
        <span style={{ ...wordStyle, color: 'var(--sv-primary, #FF5E1A)' }}>.</span>
      </div>

      <style>{`
        @keyframes splashLogoIn {
          0%   { opacity: 0; transform: scale(0.55); }
          65%  { opacity: 1; transform: scale(1.07); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes splashWordIn {
          0%   { opacity: 0; transform: translateY(10px); letter-spacing: 0.18em; }
          100% { opacity: 1; transform: translateY(0);   letter-spacing: -0.01em; }
        }
        @keyframes splashGlow {
          from { opacity: 0.7; transform: scale(0.92); }
          to   { opacity: 1;   transform: scale(1.12); }
        }
        @keyframes splashZoomOut {
          0%   { opacity: 1; transform: scale(1);   }
          100% { opacity: 0; transform: scale(2.7); }
        }
        @keyframes splashFadeIn {
          from { opacity: 0; } to { opacity: 1; }
        }
        @keyframes splashFadeOut {
          from { opacity: 1; } to { opacity: 0; }
        }
      `}</style>
    </div>
  )
}

const wordStyle: React.CSSProperties = {
  fontWeight: 900,
  fontSize: 34,
  color: '#FFFFFF',
  lineHeight: 1,
  letterSpacing: '-0.01em',
  textShadow: '0 0 24px rgba(255,94,26,0.28)',
}
