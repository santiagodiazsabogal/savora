import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

const PHRASES_ES = [
  'Encendiendo el horno...',
  'Afilando los cuchillos...',
  'Calentando el asadero...',
  'Picando ingredientes...',
  'Precalentando la sartén...',
  'Consultando al chef...',
  'Sazonando la receta...',
  'Batiendo los huevos...',
  'Herviendo el agua...',
  'Eligiendo los mejores ingredientes...',
]

const PHRASES_EN = [
  'Firing up the oven...',
  'Sharpening the knives...',
  'Heating up the grill...',
  'Chopping ingredients...',
  'Preheating the pan...',
  'Consulting the chef...',
  'Seasoning the recipe...',
  'Whisking the eggs...',
  'Boiling the water...',
  'Picking the finest ingredients...',
]

/* ─── Flame SVG path ────────────────────────────────────────────────────────
   Outer: wide flame blob spanning x=12→88 at widest (y≈62)
   Inner: dark oval/teardrop cutout — creates the interior "opening"
   Both in viewBox 0 0 100 115
─────────────────────────────────────────────────────────────────────────── */
const FLAME_OUTER =
  'M50 6 C64 18 88 42 88 62 C88 80 76 98 56 104 C52 106 48 106 44 104 C24 98 12 80 12 62 C12 42 36 18 50 6Z'
const FLAME_INNER =
  'M50 48 C57 56 63 66 63 76 C63 87 57 94 50 95 C43 94 37 87 37 76 C37 66 43 56 50 48Z'

export function FlameIcon({
  gradId,
  holeFill,
  width,
  height,
  style,
}: {
  gradId: string
  holeFill: string
  width: number
  height: number
  style?: React.CSSProperties
}) {
  return (
    <svg viewBox="0 0 100 115" width={width} height={height} style={style}>
      <defs>
        <linearGradient id={gradId} x1="0%" y1="100%" x2="50%" y2="0%">
          <stop offset="0%" stopColor="#EA580C" />
          <stop offset="55%" stopColor="#F97316" />
          <stop offset="100%" stopColor="#FDBA74" />
        </linearGradient>
      </defs>
      <path d={FLAME_OUTER} fill={`url(#${gradId})`} />
      <path d={FLAME_INNER} fill={holeFill} />
    </svg>
  )
}

export default function LoadingScreen() {
  const { i18n } = useTranslation()
  const lang = i18n.language?.startsWith('es') ? 'es' : 'en'
  const phrases = lang === 'es' ? PHRASES_ES : PHRASES_EN

  const [phrase, setPhrase] = useState(() => phrases[Math.floor(Math.random() * phrases.length)])

  useEffect(() => {
    const interval = setInterval(() => {
      setPhrase(phrases[Math.floor(Math.random() * phrases.length)])
    }, 1800)
    return () => clearInterval(interval)
  }, [])

  // El SVG (holeFill) no acepta var() en atributos, así que resolvemos el tema en JS.
  const dark = document.documentElement.classList.contains('sv-dark')
  const bg = dark ? '#07050A' : '#FFE7D0'
  const ink = dark ? '#FFFFFF' : '#2E1D14'
  const inkDim = dark ? 'rgba(255,255,255,0.42)' : 'rgba(46,29,20,0.5)'
  const track = dark ? 'rgba(255,255,255,0.08)' : 'rgba(46,29,20,0.1)'

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center z-50 overflow-hidden"
      style={{ background: bg }}
    >

      {/* Orbs de fondo */}
      <div className="absolute pointer-events-none" style={{ width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,94,26,0.13) 0%, transparent 70%)', top: '-120px', right: '-140px', filter: 'blur(40px)' }} />
      <div className="absolute pointer-events-none" style={{ width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.10) 0%, transparent 70%)', bottom: '-80px', left: '-100px', filter: 'blur(40px)' }} />

      {/* ── Llama grande animada ── */}
      <div className="relative flex items-center justify-center mb-10">

        {/* Glow radial blanco que pulsa */}
        <div
          className="absolute"
          style={{
            width: 220,
            height: 220,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,255,255,0.18) 0%, rgba(255,120,40,0.10) 40%, transparent 70%)',
            filter: 'blur(10px)',
            animation: 'glowPulse 2.2s ease-in-out infinite alternate',
          }}
        />

        {/* Aro exterior que se expande y desvanece */}
        <div
          className="absolute rounded-full"
          style={{
            width: 130,
            height: 130,
            background: 'rgba(255,94,26,0.10)',
            animation: 'pingOut 2.4s cubic-bezier(0,0,0.2,1) infinite',
          }}
        />

        {/* La llama — ícono de Savora */}
        <FlameIcon
          gradId="flameGradBig"
          holeFill={bg}
          width={120}
          height={130}
          style={{
            position: 'relative',
            zIndex: 1,
            animation: 'flicker 1.7s ease-in-out infinite alternate',
            filter:
              'drop-shadow(0 0 20px rgba(255,94,26,0.75)) drop-shadow(0 0 50px rgba(255,120,40,0.30))',
          }}
        />
      </div>

      {/* ── Logotipo SAV[🔥]RA ── */}
      <div className="flex items-center" style={{ gap: 6 }}>

        <span
          style={{
            fontWeight: 900,
            fontSize: 38,
            color: ink,
            letterSpacing: '-0.02em',
            lineHeight: 1,
            textShadow: '0 0 24px rgba(255,94,26,0.30)',
          }}
        >
          SAV
        </span>

        {/* O → círculo con llama pequeña */}
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            border: '2.5px solid rgba(255,94,26,0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255,94,26,0.08)',
            boxShadow: '0 0 14px rgba(255,94,26,0.35)',
            flexShrink: 0,
          }}
        >
          <FlameIcon
            gradId="flameGradLogo"
            holeFill={bg}
            width={24}
            height={26}
          />
        </div>

        <span
          style={{
            fontWeight: 900,
            fontSize: 38,
            color: ink,
            letterSpacing: '-0.02em',
            lineHeight: 1,
            textShadow: '0 0 24px rgba(255,94,26,0.30)',
          }}
        >
          RA
        </span>
      </div>

      {/* Frase rotativa */}
      <p
        key={phrase}
        className="text-sm font-medium mt-4 px-8 text-center"
        style={{ color: inkDim, animation: 'fadeInUp 0.4s ease-out' }}
      >
        {phrase}
      </p>

      {/* Barra de progreso */}
      <div
        className="mt-7 rounded-full overflow-hidden"
        style={{ width: 160, height: 3, background: track }}
      >
        <div
          className="h-full rounded-full"
          style={{ background: 'linear-gradient(90deg, #FF5E1A, #FDBA74)', animation: 'loadBar 1.8s ease-in-out infinite' }}
        />
      </div>

      {/* Keyframes */}
      <style>{`
        @keyframes flicker {
          0%   { transform: scaleY(1)    scaleX(1)    rotate(0deg);    }
          20%  { transform: scaleY(1.05) scaleX(0.96) rotate(0.4deg);  }
          40%  { transform: scaleY(0.97) scaleX(1.03) rotate(-0.3deg); }
          60%  { transform: scaleY(1.04) scaleX(0.97) rotate(0.3deg);  }
          80%  { transform: scaleY(0.98) scaleX(1.02) rotate(-0.2deg); }
          100% { transform: scaleY(1.02) scaleX(0.99) rotate(0.1deg);  }
        }
        @keyframes glowPulse {
          from { opacity: 0.65; transform: scale(0.94); }
          to   { opacity: 1;    transform: scale(1.10); }
        }
        @keyframes pingOut {
          0%        { transform: scale(1);   opacity: 0.4; }
          75%, 100% { transform: scale(1.9); opacity: 0;   }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
        @keyframes loadBar {
          0%   { width: 0%;  margin-left: 0%;   }
          50%  { width: 55%; margin-left: 22%;  }
          100% { width: 0%;  margin-left: 100%; }
        }
      `}</style>

    </div>
  )
}
