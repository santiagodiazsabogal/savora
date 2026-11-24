import { useEffect, useState, type CSSProperties } from 'react'
import { foodEmoji } from '../../data/foods'

// Escena ilustrada e interactiva de My Kitchen — SVG puro (escala perfecta con
// viewBox, sin los problemas de alineación de perspective/rotateY en distintos
// anchos reales). Nevera, alacena y cajón se abren con una animación de "puerta
// que gira sobre su bisagra" (fake-3D: scaleX + skewY desde el punto de la
// bisagra, 100% CSS transform → funciona igual en cualquier tamaño porque vive
// DENTRO del viewBox). Los ingredientes REALES del usuario aparecen como emoji
// en las repisas (mismo lenguaje visual que el mercado). La ventana muestra
// día o noche según la hora real del dispositivo. Solo se anima transform/
// opacity/filter (nunca sobre contenido con blur) — regla de perf del proyecto.

export type KitchenZone = 'fridge' | 'pantry' | 'drawer'

interface Props {
  active: KitchenZone | null
  counts: Record<KitchenZone, number>
  items: Record<KitchenZone, string[]>
  onSelect: (zone: KitchenZone) => void
}

const C = {
  wall: '#2A2320', wallTile: '#332B27', floor: '#241E1B', floorLine: '#2E2622',
  fridge: '#E8E1D6', fridgeSide: '#CFC6B8', fridgeInside: '#F7F3EA', shelf: '#D8CFC0',
  wood: '#A9714B', woodDark: '#8C5A3B', woodInside: '#6E4630',
  counter: '#5C6670', counterTop: '#7A8591',
  accent: '#FF5E1A', glow: 'rgba(255,94,26,0.55)',
  jar1: '#E8B04B', jar2: '#C96B4A', jar3: '#7FA05A', leaf: '#5F8F4E', pot: '#B5542F',
}

// ── Emoji para el contenido real del usuario ─────────────────────────────────
const shelfEmoji = (n: string) => { const e = foodEmoji(n); return e === '🛒' ? '🥫' : e }
const UTENSIL_EMOJI: [RegExp, string][] = [
  [/knife|cleaver/i, '🔪'], [/pan|skillet|griddle/i, '🍳'], [/pot|dutch/i, '🍲'],
  [/fork/i, '🍴'], [/chopstick|tong/i, '🥢'], [/scissor|shear/i, '✂️'],
  [/board/i, '🪵'], [/thermometer/i, '🌡️'], [/timer/i, '⏲️'], [/mitt|glove/i, '🧤'],
  [/cup|measur/i, '🥛'], [/whisk|mixer|blender|spatula|ladle|spoon|peeler|grater/i, '🥄'],
]
const utensilEmoji = (n: string) => UTENSIL_EMOJI.find(([re]) => re.test(n))?.[1] ?? '🥄'

// ── Día/noche real ────────────────────────────────────────────────────────────
type SkyPhase = 'day' | 'twilight' | 'night'
function skyPhase(): SkyPhase {
  const h = new Date().getHours()
  if (h >= 7 && h < 18) return 'day'
  if ((h >= 6 && h < 7) || (h >= 18 && h < 20)) return 'twilight'
  return 'night'
}
function useSkyPhase(): SkyPhase {
  const [phase, setPhase] = useState<SkyPhase>(skyPhase)
  useEffect(() => {
    const id = setInterval(() => setPhase(skyPhase()), 5 * 60_000) // se refresca solo con la app abierta
    return () => clearInterval(id)
  }, [])
  return phase
}
const SKY: Record<SkyPhase, { top: string; bottom: string }> = {
  day: { top: '#8FD0EE', bottom: '#C9ECF7' },
  twilight: { top: '#3D3A6B', bottom: '#F0925C' },
  night: { top: '#0F1B2E', bottom: '#1E3350' },
}

function Badge({ x, y, count }: { x: number; y: number; count: number }) {
  if (count <= 0) return null
  return (
    <g className="k-badge">
      <circle cx={x} cy={y} r={11} fill={C.accent} />
      <text x={x} y={y + 4} textAnchor="middle" fontSize={11} fontWeight={800} fill="#fff">
        {count > 99 ? '99+' : count}
      </text>
    </g>
  )
}

function MoreChip({ x, y, n }: { x: number; y: number; n: number }) {
  if (n <= 0) return null
  return (
    <g pointerEvents="none">
      <rect x={x - 12} y={y - 8} width={24} height={13} rx={6.5} fill="rgba(0,0,0,.5)" />
      <text x={x} y={y + 2} textAnchor="middle" fontSize={9} fontWeight={800} fill="#fff">+{n}</text>
    </g>
  )
}

// Ítem real posado en una repisa: aparece con un pop escalonado cuando se abre el mueble.
function ShelfItem({ emoji, x, y, size, show, delay }: { emoji: string; x: number; y: number; size: number; show: boolean; delay: number }) {
  return (
    <text
      x={x} y={y} textAnchor="middle" fontSize={size}
      className="k-shelf-item"
      style={{ transformOrigin: `${x}px ${y}px`, transitionDelay: show ? `${delay}ms` : '0ms' }}
      opacity={show ? 1 : 0}
      transform={show ? 'translate(0,0) scale(1)' : 'translate(0,6) scale(.4)'}
    >{emoji}</text>
  )
}

export default function KitchenScene({ active, counts, items, onSelect }: Props) {
  const [peek, setPeek] = useState<KitchenZone | null>(null)
  const sky = useSkyPhase()

  const isOpen = (z: KitchenZone) => active === z
  const isPeek = (z: KitchenZone) => peek === z && active !== z
  const enter = (z: KitchenZone) => setPeek(z)
  const leave = (z: KitchenZone) => setPeek(p => (p === z ? null : p))

  // Reparto de ítems reales en huecos (fridge: 4x3, pantry: 2x4, drawer: 6).
  const fr = items.fridge
  const frRows = [fr.slice(0, 3), fr.slice(3, 6), fr.slice(6, 9), fr.slice(9, 12)]
  const frExtra = fr.length - 12
  const pa = items.pantry
  const paRows = [pa.slice(0, 4), pa.slice(4, 8)]
  const paExtra = pa.length - 8
  const dw = items.drawer.slice(0, 6)
  const dwExtra = items.drawer.length - 6

  const FR_ROW_Y = [67, 96, 128, 172]
  const FR_COL_X = [44, 63, 82]
  const PA_ROW_Y = [42, 76]
  const PA_COL_X = [244, 264, 284, 304]

  return (
    <svg viewBox="0 0 360 250" className="w-full h-auto select-none" role="group" aria-label="Kitchen scene">
      {/* ── Pared con azulejos + piso ─────────────────────────────────────── */}
      <rect x="0" y="0" width="360" height="215" rx="16" fill={C.wall} />
      {Array.from({ length: 6 }).map((_, r) =>
        Array.from({ length: 12 }).map((_, c) => (
          <rect key={`t-${r}-${c}`} x={4 + c * 30 + (r % 2 ? 15 : 0)} y={6 + r * 18} width={26} height={14} rx={3} fill={C.wallTile} />
        )),
      )}
      <rect x="0" y="205" width="360" height="45" rx="14" fill={C.floor} />
      <rect x="0" y="205" width="360" height="6" fill={C.floorLine} opacity={0.5} />

      {/* ── Ventana: día / atardecer / noche según la hora real ────────────── */}
      <g>
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SKY[sky].top} />
            <stop offset="100%" stopColor={SKY[sky].bottom} />
          </linearGradient>
        </defs>
        <rect x="150" y="18" width="60" height="46" rx="8" fill="url(#sky)" stroke="#4A5A6A" strokeWidth="3" className="k-sky" />
        <line x1="180" y1="20" x2="180" y2="62" stroke="#4A5A6A" strokeWidth="3" />
        <line x1="150" y1="41" x2="210" y2="41" stroke="#4A5A6A" strokeWidth="2.5" />
        {sky === 'night' ? (
          <>
            <circle cx="192" cy="30" r="6" fill="#F3EFDD" className="k-glow-soft" />
            <circle cx="165" cy="52" r="1.3" fill="#fff" className="k-twinkle" style={{ animationDelay: '0s' }} />
            <circle cx="172" cy="34" r="1" fill="#fff" className="k-twinkle" style={{ animationDelay: '.6s' }} />
            <circle cx="200" cy="52" r="1.2" fill="#fff" className="k-twinkle" style={{ animationDelay: '1.1s' }} />
          </>
        ) : (
          <circle cx={sky === 'day' ? 166 : 160} cy={sky === 'day' ? 30 : 50} r="6" fill="#F5D26B" className="k-glow-soft" />
        )}
      </g>

      {/* ── NEVERA (izquierda) ───────────────────────────────────────────── */}
      <g
        className={`k-zone ${isOpen('fridge') ? 'k-active' : ''}`}
        onClick={() => onSelect('fridge')}
        onPointerEnter={() => enter('fridge')}
        onPointerLeave={() => leave('fridge')}
        role="button" aria-label="Fridge" style={{ cursor: 'pointer' }}
      >
        <rect x="24" y="52" width="86" height="158" rx="10" fill={C.fridgeSide} />
        <rect x="20" y="48" width="86" height="158" rx="10" fill={C.fridge} />

        {/* interior (siempre montado, se revela con opacity al abrir) */}
        <g className="k-fade" opacity={isOpen('fridge') ? 1 : 0}>
          <rect x="26" y="54" width="74" height="146" rx="6" fill={C.fridgeInside} />
          <rect x="30" y="80" width="66" height="4" rx="2" fill={C.shelf} />
          <rect x="30" y="112" width="66" height="4" rx="2" fill={C.shelf} />
          <rect x="30" y="144" width="66" height="4" rx="2" fill={C.shelf} />
          <rect x="26" y="54" width="74" height="30" fill="url(#fridgeLight)" opacity="0.9" />
          {frRows.map((row, r) => row.map((name, i) => (
            <ShelfItem key={`${r}-${i}`} emoji={shelfEmoji(name)} x={FR_COL_X[i]} y={FR_ROW_Y[r]} size={15} show={isOpen('fridge')} delay={120 + (r * 3 + i) * 45} />
          )))}
          <MoreChip x={82} y={186} n={frExtra} />
        </g>
        <defs>
          <linearGradient id="fridgeLight" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFF3D2" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#FFF3D2" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* puerta: gira sobre la bisagra izquierda (x=20). Cerrada = plana; abierta =
            se "achica" en X y se inclina, dando sensación de girar hacia el usuario. */}
        <g
          className="k-door"
          style={{
            transformOrigin: '21px 128px',
            transform: isOpen('fridge') ? 'scaleX(0.16) skewY(4deg)' : isPeek('fridge') ? 'scaleX(0.94) skewY(0.6deg)' : 'none',
          }}
        >
          <rect x="20" y="48" width="86" height="158" rx="10" fill={C.fridge} />
          <line x1="20" y1="98" x2="106" y2="98" stroke={C.fridgeSide} strokeWidth="3" />
          <rect x="94" y="62" width="5" height="24" rx="2.5" fill={C.fridgeSide} />
          <rect x="94" y="110" width="5" height="34" rx="2.5" fill={C.fridgeSide} />
          <circle cx="46" cy="130" r="5" fill={C.accent} opacity="0.85" />
          <rect x="56" y="150" width="22" height="14" rx="3" fill="#fff" opacity="0.65" transform="rotate(-6 67 157)" />
        </g>

        {isOpen('fridge') && <text x="98" y="46" fontSize="15" className="k-spark">✨</text>}
        <Badge x={100} y={56} count={counts.fridge} />
      </g>

      {/* ── ALACENA (derecha arriba) ─────────────────────────────────────── */}
      <g
        className={`k-zone ${isOpen('pantry') ? 'k-active' : ''}`}
        onClick={() => onSelect('pantry')}
        onPointerEnter={() => enter('pantry')}
        onPointerLeave={() => leave('pantry')}
        role="button" aria-label="Pantry cabinet" style={{ cursor: 'pointer' }}
      >
        <rect x="228" y="26" width="112" height="76" rx="8" fill={C.woodDark} />
        <rect x="224" y="22" width="112" height="76" rx="8" fill={C.wood} />

        <g className="k-fade" opacity={isOpen('pantry') ? 1 : 0}>
          <rect x="230" y="28" width="100" height="64" rx="5" fill={C.woodInside} />
          <rect x="234" y="56" width="92" height="4" rx="2" fill={C.woodDark} />
          {paRows.map((row, r) => row.map((name, i) => (
            <ShelfItem key={`${r}-${i}`} emoji={shelfEmoji(name)} x={PA_COL_X[i]} y={PA_ROW_Y[r]} size={13} show={isOpen('pantry')} delay={120 + (r * 4 + i) * 45} />
          )))}
          <MoreChip x={318} y={84} n={paExtra} />
        </g>

        {/* puerta izquierda: bisagra en x=224 */}
        <g className="k-door" style={{ transformOrigin: '225px 60px', transform: isOpen('pantry') ? 'scaleX(0.14) skewY(-4deg)' : isPeek('pantry') ? 'scaleX(0.93) skewY(-0.6deg)' : 'none' }}>
          <rect x="224" y="22" width="56" height="76" fill={C.wood} />
          <rect x="270" y="52" width="5" height="16" rx="2.5" fill={C.woodDark} />
        </g>
        {/* puerta derecha: bisagra en x=336 */}
        <g className="k-door" style={{ transformOrigin: '335px 60px', transform: isOpen('pantry') ? 'scaleX(0.14) skewY(4deg)' : isPeek('pantry') ? 'scaleX(0.93) skewY(0.6deg)' : 'none' }}>
          <rect x="280" y="22" width="56" height="76" fill={C.wood} />
          <rect x="285" y="52" width="5" height="16" rx="2.5" fill={C.woodDark} />
        </g>

        {isOpen('pantry') && <text x="280" y="18" fontSize="15" className="k-spark">✨</text>}
        <Badge x={332} y={30} count={counts.pantry} />
      </g>

      {/* ── MOSTRADOR + CAJÓN DE UTENSILIOS (derecha abajo) ──────────────── */}
      <g
        className={`k-zone ${isOpen('drawer') ? 'k-active' : ''}`}
        onClick={() => onSelect('drawer')}
        onPointerEnter={() => enter('drawer')}
        onPointerLeave={() => leave('drawer')}
        role="button" aria-label="Utensils drawer" style={{ cursor: 'pointer' }}
      >
        <rect x="224" y="132" width="116" height="78" rx="8" fill={C.counter} />
        <rect x="218" y="124" width="128" height="14" rx="6" fill={C.counterTop} />
        {/* cavidad oscura tras el cajón */}
        <rect x="232" y="146" width="100" height="26" rx="5" fill="#22282E" />

        {/* cajón: se DESLIZA hacia afuera (translate) — el gesto natural de un cajón */}
        <g
          className="k-drawer"
          style={{ transform: isOpen('drawer') ? 'translate(-14px, 5px)' : isPeek('drawer') ? 'translate(-4px, 1.5px)' : 'none' }}
        >
          <rect x="232" y="146" width="100" height="26" rx="5" fill={C.counterTop} />
          <rect x="268" y="156" width="28" height="5" rx="2.5" fill={C.counter} />
          <g className="k-fade" opacity={isOpen('drawer') ? 1 : 0}>
            {dw.map((name, i) => (
              <ShelfItem key={i} emoji={utensilEmoji(name)} x={244 + i * 15} y={140} size={14} show={isOpen('drawer')} delay={120 + i * 50} />
            ))}
            <MoreChip x={318} y={140} n={dwExtra} />
          </g>
        </g>
        <rect x="232" y="180" width="100" height="22" rx="5" fill={C.counterTop} opacity="0.6" />

        {isOpen('drawer') && <text x="238" y="128" fontSize="15" className="k-spark">✨</text>}
        <Badge x={332} y={136} count={counts.drawer} />
      </g>

      {/* ── Decoración: planta + olla con vapor sutil ────────────────────── */}
      <g pointerEvents="none">
        <rect x="128" y="182" width="26" height="24" rx="4" fill={C.pot} />
        <ellipse cx="141" cy="176" rx="16" ry="10" fill={C.leaf} className="k-sway" />
        <ellipse cx="132" cy="168" rx="8" ry="6" fill={C.leaf} opacity="0.85" className="k-sway" style={{ animationDelay: '.4s' }} />
        <ellipse cx="150" cy="167" rx="7" ry="5" fill={C.leaf} opacity="0.85" className="k-sway" style={{ animationDelay: '.8s' }} />
        <circle cx="138" cy="164" r="2.5" fill="#fff" opacity="0" className="k-steam" />
        <circle cx="145" cy="160" r="2" fill="#fff" opacity="0" className="k-steam" style={{ animationDelay: '1s' }} />
        <rect x="40" y="30" width="42" height="16" rx="4" fill="#4E4E56" />
        <rect x="54" y="24" width="14" height="6" rx="3" fill="#4E4E56" />
      </g>

      <style>{`
        .k-door { transition: transform .6s cubic-bezier(.32,1.15,.42,1); transform-box: fill-box; }
        .k-drawer { transition: transform .55s cubic-bezier(.32,1.2,.44,1); }
        .k-fade { transition: opacity .4s ease .12s; }
        .k-shelf-item { transition: transform .4s cubic-bezier(.3,1.5,.5,1), opacity .25s ease; }
        .k-badge, .k-zone rect { transition: filter .35s ease; }
        .k-zone.k-active { filter: drop-shadow(0 0 9px ${C.glow}); }
        .k-sky { transition: fill 1.2s ease; }
        .k-spark { pointer-events: none; animation: kSpark .9s ease-out both; }
        .k-glow-soft { animation: kGlowSoft 4s ease-in-out infinite alternate; }
        .k-twinkle { animation: kTwinkle 2.6s ease-in-out infinite alternate; }
        .k-sway { transform-origin: 50% 100%; animation: kSway 4.5s ease-in-out infinite alternate; }
        .k-steam { animation: kSteam 3.2s ease-in infinite; }
        @keyframes kSpark {
          0% { transform: translateY(4px) scale(.4); opacity: 0 }
          30% { opacity: 1 }
          100% { transform: translateY(-16px) scale(1.2); opacity: 0 }
        }
        @keyframes kGlowSoft { from { opacity: .75 } to { opacity: 1 } }
        @keyframes kTwinkle { from { opacity: .3 } to { opacity: 1 } }
        @keyframes kSway { from { transform: rotate(-4deg) } to { transform: rotate(5deg) } }
        @keyframes kSteam {
          0% { opacity: 0; transform: translateY(0) scale(.6) }
          30% { opacity: .55 }
          100% { opacity: 0; transform: translateY(-14px) scale(1.3) }
        }
        @media (prefers-reduced-motion: reduce) {
          .k-door, .k-drawer, .k-shelf-item, .k-sky { transition-duration: .01s; }
          .k-spark, .k-glow-soft, .k-twinkle, .k-sway, .k-steam { animation: none; }
        }
      `}</style>
    </svg>
  )
}
