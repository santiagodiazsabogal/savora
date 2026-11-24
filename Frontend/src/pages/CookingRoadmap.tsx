import { Fragment, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Map, ArrowLeft, TrendingUp, Lock, Check, Sparkles, GraduationCap,
  ChefHat, CookingPot, Utensils, Soup, Salad, Fish, Croissant, Coffee, Wine, Carrot, Cherry, UtensilsCrossed, Wheat, Egg,
} from 'lucide-react'
import Mascot from '../components/Mascot'
import LoadingScreen from '../components/ui/LoadingScreen'
import { getCategoryRoadmap, getCachedCategoryRoadmap, getAiSyllabus } from '../services/api'

/* ────────────────────────────────────────────────────────────────────────────
   Roadmap DE UNA CATEGORÍA (/courses/:category): sus recetas + habilidades
   intercaladas, desde GET /courses-ai/category-roadmap. Meta arriba / inicio abajo.
──────────────────────────────────────────────────────────────────────────── */

type ModState = 'completed' | 'current' | 'locked'

interface RoadNode {
  order: number
  key: string                 // idMeal / d_ / path_ (ruta de juego)
  type: 'recipe' | 'skill'
  title: string
  desc: string
  thumbnailUrl: string | null
  color: string
  xp: number
  lessons: number
  state: ModState
  final?: boolean
}

interface Quota {
  plan: string
  lessonsDone: number
  lessonLimit: number | null
  coursesDone: number
  courseLimit: number | null
}

const anchorX = (side: 'left' | 'right') => (side === 'left' ? 70 : 30)
const sideFor = (displayIdx: number): 'left' | 'right' => (displayIdx % 2 === 0 ? 'right' : 'left')

export default function CookingRoadmap() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { category = '' } = useParams()

  // Stale-while-revalidate: pinta al instante el roadmap conocido de esta categoría
  // (localStorage) y revalida por red en 2º plano — sin LoadingScreen al volver de un nodo.
  const toList = (data: any): RoadNode[] => (data?.nodes ?? []).map((n: any, i: number) => ({ ...n, order: i + 1 }))
  const [nodes, setNodes] = useState<RoadNode[]>(() => toList(getCachedCategoryRoadmap(category)))
  const [quota, setQuota] = useState<Quota | null>(() => getCachedCategoryRoadmap(category)?.quota ?? null)
  const [loading, setLoading] = useState(() => !getCachedCategoryRoadmap(category))
  const [error, setError] = useState('')

  useEffect(() => {
    // Al cambiar de categoría dentro de la página: si hay caché, pintarla sin spinner.
    const cached = getCachedCategoryRoadmap(category)
    if (cached) { setNodes(toList(cached)); setQuota(cached.quota ?? null); setLoading(false) }

    async function load() {
      try {
        const data = await getCategoryRoadmap(category)
        const list = toList(data)
        setNodes(list)
        setQuota(data?.quota ?? null)
        // Prefetch: genera en 2º plano el syllabus del nodo actual → apertura casi instantánea.
        const cur = list.find(n => n.state === 'current')
        if (cur) getAiSyllabus(cur.key).catch(() => {})
      } catch (err) {
        if (err instanceof Error && err.message === '401') { localStorage.removeItem('token'); navigate('/login'); return }
        if (!cached) setError('Could not load this category.') // con caché pintada, fallo silencioso
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [category]) // eslint-disable-line react-hooks/exhaustive-deps

  // Meta arriba, inicio abajo.
  const display = [...nodes].reverse()
  const currentDisplayIdx = display.findIndex(n => n.state === 'current')
  const quotaReached = !!quota && (
    (quota.lessonLimit != null && quota.lessonsDone >= quota.lessonLimit) ||
    (quota.courseLimit != null && quota.coursesDone >= quota.courseLimit)
  )
  const goUpgrade = () => navigate('/profile') // placeholder hasta RevenueCat

  // Abre en el INICIO del camino (abajo). Scroller = #root (ver ScrollToTop).
  useEffect(() => {
    if (loading) return
    const root = document.getElementById('root')
    if (!root) return
    const toBottom = () => root.scrollTo({ top: root.scrollHeight })
    toBottom()
    const id = requestAnimationFrame(toBottom)
    return () => cancelAnimationFrame(id)
  }, [loading])

  if (loading) return <LoadingScreen />

  const categoryLabel = t(`coursesAi.categories.${category}`, { defaultValue: category })

  return (
    <>
    <div className="sv-screen sv-page flex flex-col">
      <div className="sv-orbs"><div className="sv-orb sv-orb-1" /><div className="sv-orb sv-orb-2" /><div className="sv-orb sv-orb-3" /></div>
      <div className="sv-content flex flex-col flex-1 pb-10">

        <RoadmapDecor />

        {/* Espaciador para el header fijo (portal) */}
        <div style={{ height: 92 }} />

        {/* TÍTULO = categoría */}
        <div className="relative z-10 px-6 pt-2 pb-5 sv-stagger-1">
          <div className="flex items-center gap-2.5 mb-1">
            <Map className="w-7 h-7" style={{ color: 'var(--sv-primary)' }} />
            <h1 className="text-3xl font-black leading-tight">{categoryLabel}</h1>
          </div>
          <p className="sv-muted text-base">Learn step by step and unlock as you go.</p>
        </div>

        {/* Cuota del plan (FREE 3 lecciones / PRO 3 cursos). CHEF ilimitado → no se muestra. */}
        {quota && (quota.lessonLimit != null || quota.courseLimit != null) && (
          <div className="relative z-10 px-5 pb-4 -mt-1 sv-stagger-1">
            <div
              className="sv-glass-solid rounded-2xl px-4 py-3 flex items-center gap-3"
              style={quotaReached ? { border: '1px solid var(--sv-primary)', boxShadow: '0 0 0 1px var(--sv-primary), 0 6px 18px var(--sv-primary-glow)' } : undefined}
            >
              {quotaReached
                ? <Sparkles className="w-4 h-4 shrink-0" style={{ color: 'var(--sv-primary)' }} />
                : <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--sv-primary)' }} />}
              <div className="flex-1 min-w-0">
                <p className="text-xs sv-muted leading-snug">
                  {quota.lessonLimit != null ? (
                    <><span className="font-bold" style={{ color: 'var(--sv-primary)' }}>Free</span> · {Math.min(quota.lessonsDone, quota.lessonLimit)}/{quota.lessonLimit} lessons used</>
                  ) : (
                    <><span className="font-bold" style={{ color: 'var(--sv-primary)' }}>Pro</span> · {Math.min(quota.coursesDone, quota.courseLimit ?? 0)}/{quota.courseLimit} courses used</>
                  )}
                </p>
                {quotaReached && (
                  <p className="text-[11px] font-semibold mt-0.5" style={{ color: 'var(--sv-primary)' }}>
                    {quota.lessonLimit != null ? 'Upgrade to keep learning' : 'Upgrade to Chef for unlimited courses'}
                  </p>
                )}
              </div>
              {quotaReached && (
                <button onClick={goUpgrade} className="sv-btn sv-btn-primary text-xs px-3 py-1.5 shrink-0">Upgrade</button>
              )}
            </div>
          </div>
        )}

        {error ? (
          <p className="relative z-10 sv-muted text-sm text-center px-6 py-16">{error}</p>
        ) : (
          <div className="relative z-10 px-5 sv-stagger-2">

            {/* Mascota "pensando" arriba (junto a la meta) */}
            <div className="pointer-events-none absolute left-2 -top-2 z-20" style={{ width: 78 }}>
              <Mascot pose="thinking" className="w-full h-auto" style={{ filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.5))' }} />
            </div>

            {display.map((n, i) => {
              const side = sideFor(i)
              const next = display[i + 1]
              const active = n.state !== 'locked'
              return (
                <Fragment key={n.key}>
                  <NodeRow
                    node={n}
                    side={side}
                    showCookingMascot={i === currentDisplayIdx}
                    quotaReached={quotaReached}
                    onOpen={() => navigate(`/courses/${category}/${n.key}`)}
                    onUpgrade={goUpgrade}
                  />
                  {next && <Connector from={anchorX(side)} to={anchorX(sideFor(i + 1))} active={active} color={n.color} />}
                </Fragment>
              )
            })}

            {/* Mascota "batidor" abajo (inicio) */}
            <div className="flex items-end gap-3 pt-3 pl-1">
              <Mascot pose="whisk" style={{ width: 104, height: 154, filter: 'drop-shadow(0 10px 20px rgba(0,0,0,0.5))' }} />
              <div className="mb-4 sv-glass-solid rounded-2xl px-3.5 py-2.5 relative">
                <p className="text-sm font-semibold leading-snug">Start here! 👇</p>
                <p className="text-xs sv-dim leading-snug">Complete a step to unlock the next.</p>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>

    {/* Header SIEMPRE visible (portal a body). Volver = al selector de categorías. */}
    {createPortal(
      <div
        className="fixed top-0 inset-x-0 z-50"
        style={{ background: 'linear-gradient(to bottom, var(--sv-bg-base) 55%, transparent)' }}
      >
        <div className="flex items-center justify-between px-4 pt-11 pb-3">
          <button
            onClick={() => navigate('/courses')}
            className="w-10 h-10 flex items-center justify-center rounded-2xl transition active:scale-95"
            style={{ background: 'var(--sv-bg-surface)', border: '1px solid var(--sv-border-light)' }}
          >
            <ArrowLeft className="w-5 h-5 sv-muted" />
          </button>
          <button onClick={() => navigate('/progress')} className="sv-btn sv-btn-glass text-xs px-3 py-2">
            <TrendingUp className="w-4 h-4" /> My progress
          </button>
        </div>
      </div>,
      document.body,
    )}
    </>
  )
}

/* ── Nodo (tarjeta receta/skill + número + mascota cocinando opcional) ──────── */
function NodeRow({ node: n, side, showCookingMascot, quotaReached, onOpen, onUpgrade }: {
  node: RoadNode; side: 'left' | 'right'; showCookingMascot: boolean; quotaReached: boolean
  onOpen: () => void; onUpgrade: () => void
}) {
  const anchor = anchorX(side)
  const seqLocked = n.state === 'locked'
  const completed = n.state === 'completed'
  const activeCurrent = n.state === 'current' && !quotaReached
  const quotaBlocked = n.state === 'current' && quotaReached
  const locked = seqLocked || quotaBlocked
  const clickable = completed || activeCurrent
  const isRecipe = n.type === 'recipe' && !!n.thumbnailUrl

  const cardInset = side === 'left'
    ? { left: '3%', right: '30%' }
    : { left: '30%', right: '3%' }

  return (
    <div className="relative" style={{ height: 156 }}>
      {showCookingMascot && !quotaBlocked && (
        <div className="pointer-events-none absolute z-20" style={{ [side === 'left' ? 'right' : 'left']: '1%', top: '50%', transform: 'translateY(-50%)', width: 66 } as React.CSSProperties}>
          <Mascot pose="cooking" className="w-full h-auto" style={{ filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.5))' }} />
        </div>
      )}

      <button
        disabled={!clickable && !quotaBlocked}
        onClick={() => { if (quotaBlocked) onUpgrade(); else if (clickable) onOpen() }}
        className={`absolute rounded-2xl text-left overflow-hidden transition active:scale-[0.98] ${clickable || quotaBlocked ? 'sv-glass-hover' : ''}`}
        style={{
          top: 6, bottom: 6, ...cardInset,
          background: 'var(--sv-roadmap-card-bg)',
          border: `1px solid ${activeCurrent ? n.color : completed ? 'rgba(52,211,153,0.5)' : 'var(--sv-border-strong)'}`,
          boxShadow: activeCurrent ? `0 0 0 1px ${n.color}, 0 8px 26px ${n.color}55` : 'var(--sv-shadow-glass)',
          opacity: locked ? 0.72 : 1,
        }}
      >
        <div className="flex items-center gap-3 h-full px-3">
          {/* Ícono: receta → thumbnail · skill → icono */}
          <div
            className="w-14 h-14 rounded-xl overflow-hidden flex items-center justify-center shrink-0"
            style={isRecipe
              ? { border: `1px solid ${n.color}66` }
              : {
                  background: `linear-gradient(135deg, ${n.color}40, ${n.color}12)`,
                  border: `1px solid ${n.color}66`,
                  boxShadow: locked ? undefined : `inset 0 0 12px ${n.color}22`,
                  filter: locked ? 'grayscale(0.5) opacity(0.85)' : undefined,
                }}
          >
            {isRecipe
              ? <img src={n.thumbnailUrl!} alt="" loading="lazy" className="w-full h-full object-cover" style={locked ? { filter: 'grayscale(0.6) brightness(0.7)' } : undefined} />
              : <GraduationCap className="w-7 h-7" strokeWidth={2.2} style={{ color: n.color }} />}
          </div>

          {/* Texto */}
          <div className="flex-1 min-w-0">
            <p className="font-black text-[15px] leading-tight line-clamp-2">{n.title}</p>
            {n.type === 'skill' && n.desc && <p className="text-xs sv-dim leading-snug line-clamp-1 mt-0.5">{n.desc}</p>}
            <div className="flex items-center gap-2 mt-1.5">
              {n.type === 'skill'
                ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${n.color}22`, color: n.color }}>SKILL</span>
                : n.final
                  ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md" style={{ background: 'var(--sv-bg-input)' }}>Final</span>
                  : <span className="text-[11px] sv-dim">{n.lessons} lessons</span>}
              <span className="sv-badge shrink-0" style={{ background: `${n.color}22`, color: n.color, border: `1px solid ${n.color}55`, textTransform: 'none', letterSpacing: 0, padding: '2px 8px', fontSize: 11 }}>
                +{n.xp} XP
              </span>
            </div>
          </div>
        </div>

        {quotaBlocked && (
          <span className="absolute top-2 right-2 inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md" style={{ background: 'rgba(255,94,26,0.18)', color: 'var(--sv-primary)', border: '1px solid rgba(255,94,26,0.45)' }}>
            <Sparkles className="w-3 h-3" /> UPGRADE
          </span>
        )}
      </button>

      {/* Número del nodo */}
      <div
        className="absolute z-10 flex items-center justify-center rounded-full font-black"
        style={{
          left: `${anchor}%`, top: '50%', transform: 'translate(-50%,-50%)',
          width: 40, height: 40, fontSize: 15,
          background: completed ? 'linear-gradient(135deg,#34D399,#10B981)' : locked ? 'var(--sv-glass-solid-bg)' : `linear-gradient(135deg,${n.color},${n.color}CC)`,
          color: locked ? 'var(--sv-text-dim, #9ca3af)' : '#fff',
          border: `2px solid ${completed ? '#34D399' : locked ? 'var(--sv-border-strong)' : n.color}`,
          boxShadow: activeCurrent ? `0 0 0 4px ${n.color}44` : '0 4px 12px rgba(0,0,0,0.4)',
        }}
      >
        {completed ? <Check className="w-5 h-5" /> : locked ? <Lock className="w-4 h-4" /> : n.order}
      </div>
    </div>
  )
}

/* ── Objetos de cocina decorativos de fondo ────────────────────────────────── */
const DECOR_ICONS = [ChefHat, CookingPot, Utensils, Soup, Salad, Fish, Croissant, Coffee, Wine, Carrot, Cherry, UtensilsCrossed, Wheat, Egg]

const DECOR: Array<{ i: number; top: string; left: string; size: number; rot: number }> = [
  { i: 0, top: '3%', left: '78%', size: 46, rot: -14 },
  { i: 1, top: '7%', left: '9%', size: 40, rot: 12 },
  { i: 2, top: '13%', left: '52%', size: 34, rot: 22 },
  { i: 3, top: '18%', left: '87%', size: 44, rot: -8 },
  { i: 4, top: '24%', left: '5%', size: 50, rot: 16 },
  { i: 5, top: '30%', left: '61%', size: 32, rot: -20 },
  { i: 6, top: '35%', left: '21%', size: 42, rot: 10 },
  { i: 7, top: '41%', left: '83%', size: 46, rot: -12 },
  { i: 8, top: '47%', left: '44%', size: 34, rot: 24 },
  { i: 9, top: '53%', left: '8%', size: 44, rot: -18 },
  { i: 10, top: '59%', left: '73%', size: 40, rot: 14 },
  { i: 11, top: '65%', left: '30%', size: 36, rot: -6 },
  { i: 12, top: '71%', left: '88%', size: 46, rot: 20 },
  { i: 13, top: '77%', left: '13%', size: 42, rot: -16 },
  { i: 4, top: '83%', left: '58%', size: 34, rot: 8 },
  { i: 6, top: '89%', left: '82%', size: 40, rot: -22 },
  { i: 9, top: '94%', left: '24%', size: 44, rot: 12 },
]

function RoadmapDecor() {
  return (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden>
      {DECOR.map((d, k) => {
        const Ic = DECOR_ICONS[d.i % DECOR_ICONS.length]
        const warm = k % 3 === 0
        return (
          <Ic
            key={k}
            className="absolute"
            strokeWidth={1.5}
            style={{
              top: d.top, left: d.left, width: d.size, height: d.size,
              color: warm ? 'var(--sv-primary)' : 'var(--sv-text-main)',
              opacity: warm ? 0.18 : 0.08,
              transform: `rotate(${d.rot}deg)`,
            }}
          />
        )
      })}
    </div>
  )
}

/* ── Conector serpenteante (dashed) entre dos nodos ────────────────────────── */
function Connector({ from, to, active, color }: { from: number; to: number; active: boolean; color: string }) {
  const H = 62
  return (
    <div style={{ height: H }} className="relative">
      <svg width="100%" height={H} viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="absolute inset-0">
        <path
          d={`M ${from} 0 C ${from} ${H * 0.5}, ${to} ${H * 0.5}, ${to} ${H}`}
          fill="none"
          stroke={active ? color : 'var(--sv-border-strong)'}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray="1 7"
          vectorEffect="non-scaling-stroke"
          opacity={active ? 0.9 : 0.5}
        />
      </svg>
    </div>
  )
}
