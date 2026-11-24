// src/components/ui/AnimatedBackground.tsx
import { useTheme } from '../../context/ThemeContext'

const ITEMS = [
  // Fila superior
  { id: 1,  x: 5,  y: 8,  size: 58, rot: -20, delay: 0,   duration: 7   },
  { id: 9,  x: 28, y: 5,  size: 44, rot: 10,  delay: 2.5, duration: 9.5 },
  { id: 5,  x: 52, y: 10, size: 38, rot: 15,  delay: 2,   duration: 6   },
  { id: 2,  x: 75, y: 6,  size: 48, rot: 30,  delay: 1.5, duration: 9   },
  { id: 10, x: 92, y: 12, size: 36, rot: 0,   delay: 5,   duration: 6.5 },
  // Fila media-alta
  { id: 7,  x: 12, y: 32, size: 42, rot: 25,  delay: 1,   duration: 8.5 },
  { id: 4,  x: 40, y: 28, size: 50, rot: 45,  delay: 0.8, duration: 10  },
  { id: 3,  x: 65, y: 35, size: 40, rot: -10, delay: 3,   duration: 8   },
  { id: 6,  x: 88, y: 30, size: 54, rot: -30, delay: 4,   duration: 11  },
  // Fila media-baja
  { id: 8,  x: 3,  y: 58, size: 40, rot: -15, delay: 3.5, duration: 7.5 },
  { id: 1,  x: 25, y: 55, size: 34, rot: 20,  delay: 1.2, duration: 8   },
  { id: 9,  x: 50, y: 52, size: 46, rot: -5,  delay: 0.5, duration: 9   },
  { id: 5,  x: 72, y: 58, size: 36, rot: 35,  delay: 2.8, duration: 7   },
  { id: 2,  x: 93, y: 55, size: 42, rot: -20, delay: 4.5, duration: 10  },
  // Fila inferior
  { id: 3,  x: 10, y: 78, size: 48, rot: 12,  delay: 3.2, duration: 8   },
  { id: 7,  x: 33, y: 82, size: 38, rot: -25, delay: 1.8, duration: 9   },
  { id: 4,  x: 58, y: 75, size: 52, rot: 40,  delay: 0.3, duration: 7.5 },
  { id: 6,  x: 80, y: 80, size: 44, rot: -10, delay: 4.2, duration: 11  },
  { id: 10, x: 95, y: 72, size: 32, rot: 18,  delay: 2.2, duration: 6.5 },
  // Borde inferior (la franja 85-100% quedaba vacía y se notaba al scrollear al fondo)
  { id: 8,  x: 5,  y: 92, size: 40, rot: -18, delay: 1.4, duration: 8.5 },
  { id: 1,  x: 28, y: 95, size: 34, rot: 22,  delay: 3.8, duration: 7   },
  { id: 9,  x: 52, y: 90, size: 44, rot: -8,  delay: 0.9, duration: 9.5 },
  { id: 5,  x: 76, y: 94, size: 36, rot: 28,  delay: 2.6, duration: 7.5 },
  { id: 2,  x: 93, y: 88, size: 30, rot: -24, delay: 4.8, duration: 8   },
]

function UtilIcon({ id }: { id: number }) {
  switch (id % 10) {
    case 1:
      return (
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="28" cy="32" r="18" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"/>
          <path d="M46 32h14M46 29l14 3M46 35l14-3" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"/>
        </svg>
      )
    case 2:
      return (
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <ellipse cx="32" cy="14" rx="10" ry="12" stroke="currentColor" strokeWidth="3.5"/>
          <path d="M32 26v28" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"/>
        </svg>
      )
    case 3:
      return (
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M22 8v16M32 8v16M42 8v16" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"/>
          <path d="M22 24c0 0 4 4 10 4s10-4 10-4v4c0 2-2 4-4 4h-12c-2 0-4-2-4-4v-4z" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round"/>
          <path d="M32 36v20" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"/>
        </svg>
      )
    case 4:
      return (
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M32 8L44 28H32V8z" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round"/>
          <path d="M32 28v28" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"/>
        </svg>
      )
    case 5:
      return (
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M32 8l5 14h15l-12 9 5 14-13-9-13 9 5-14-12-9h15z" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round"/>
        </svg>
      )
    case 6:
      return (
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="12" y="22" width="40" height="30" rx="6" stroke="currentColor" strokeWidth="3.5"/>
          <path d="M8 30h4M52 30h4" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"/>
          <path d="M20 22v-6M44 22v-6" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"/>
        </svg>
      )
    case 7:
      return (
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M32 40V56" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"/>
          <path d="M20 10c0 0 4 14 12 18s12-18 12-18" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
          <path d="M20 10c0 10 12 20 12 20s12-10 12-20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
        </svg>
      )
    case 8:
      return (
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="12" y="26" width="40" height="12" rx="6" stroke="currentColor" strokeWidth="3.5"/>
          <path d="M8 22v20M56 22v20" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
        </svg>
      )
    case 9:
      return (
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 20h32l-4 28H16L12 20z" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round"/>
          <path d="M44 26h6a6 6 0 010 12h-6" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"/>
        </svg>
      )
    case 0:
      return (
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M32 56c12 0 20-8 20-18 0-8-6-14-6-14s0 6-6 8c0 0 4-12-6-24-2 8-10 12-10 20-4-2-4-8-4-8s-8 6-8 18c0 10 8 18 20 18z" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round"/>
        </svg>
      )
    default:
      return null
  }
}

export default function AnimatedBackground() {
  // Leemos el tema del contexto (no del DOM) para re-renderizar al alternar tema.
  const { theme } = useTheme()
  const dark = theme === 'dark'

  // Orbes de color del fondo. En CLARO usamos una paleta "de comida" (durazno,
  // mango, tomate, aguacate, uva) para un fondo más vivo y distinguible.
  // En OSCURO se mantienen 2 orbes tenues como antes.
  const ORBS: Array<{ w: number; h: number; top?: number | string; bottom?: number | string; left?: number | string; right?: number | string; c: string }> = dark
    ? [
        { w: 320, h: 320, top: -120, left: -110, c: 'rgba(255,94,26,0.18)' },
        { w: 360, h: 360, bottom: '6%', right: -150, c: 'rgba(139,92,246,0.16)' },
      ]
    : [] // en claro el color lo da el degradado blanco→naranja, no orbes

  return (
    <>
      <style>{`
        @keyframes floatUp {
          0%   { transform: translateY(0px) rotate(var(--rot)); }
          50%  { transform: translateY(-18px) rotate(calc(var(--rot) + 8deg)); }
          100% { transform: translateY(0px) rotate(var(--rot)); }
        }
        .float-item {
          animation: floatUp var(--dur) ease-in-out infinite;
          animation-delay: var(--delay);
        }
        @keyframes orbDrift {
          0%   { transform: translate(0, 0) scale(1); }
          50%  { transform: translate(26px, 32px) scale(1.14); }
          100% { transform: translate(-20px, 16px) scale(0.95); }
        }
        @media (prefers-reduced-motion: reduce) {
          .float-item { animation: none; }
        }
      `}</style>

      <div
        className="fixed inset-0 overflow-hidden pointer-events-none"
        // 100lvh: cubre el viewport GRANDE del móvil — sin esto, al colapsar la barra
        // del navegador durante el scroll quedaba una banda sin fondo abajo.
        style={{ zIndex: 0, minHeight: '100lvh' }}
        aria-hidden="true"
      >
        {/* Base: en CLARO un degradado blanco→naranja; en OSCURO el sólido del tema */}
        <div
          className="absolute inset-0"
          style={{ background: dark ? 'var(--sv-bg-base)' : 'linear-gradient(170deg, #FFFFFF 0%, #FFE3C9 42%, #FCAE6B 100%)' }}
        />

        {/* Orbes ambientales de color (con deriva suave) — sin wash direccional */}
        {ORBS.map((o, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: o.w, height: o.h,
              top: o.top, bottom: o.bottom, left: o.left, right: o.right,
              background: `radial-gradient(circle, ${o.c} 0%, transparent 70%)`,
              filter: 'blur(60px)',
              // En oscuro, orbes estáticos como en el diseño original.
              animation: dark ? undefined : `orbDrift ${13 + i * 2}s ease-in-out ${i * 0.7}s infinite alternate`,
            }}
          />
        ))}

        {/* Utensilios flotantes — tenues sobre el fondo oscuro */}
        {ITEMS.map((item, i) => (
          <div
            key={i}
            className="float-item absolute"
            style={{
              left: `${item.x}%`,
              top: `${item.y}%`,
              width: item.size,
              height: item.size,
              color: 'var(--sv-util-color)',
              opacity: 'var(--sv-util-opacity)' as unknown as number,
              filter: 'blur(0.4px)',
              '--rot': `${item.rot}deg`,
              '--dur': `${item.duration}s`,
              '--delay': `${item.delay}s`,
            } as React.CSSProperties}
          >
            <UtilIcon id={item.id} />
          </div>
        ))}
      </div>
    </>
  )
}