import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft, ChevronLeft, ChevronRight, ChevronDown, Plus, Trash2, Clock, ChefHat,
  Sparkles, Check, X, Loader2, Utensils, ArrowRightLeft, Sunrise, Sun, Moon,
} from 'lucide-react'
import LoadingScreen from '../components/ui/LoadingScreen'
import MenuPreferencesSheet, { MenuPreferences } from '../components/planner/MenuPreferencesSheet'
import {
  getMealPlan, setMealPlanSlot, deleteMealPlanSlot,
  moveMealPlanSlot, generateWeeklyMenu, prepareMealPlanEntry, getProfile,
  getCachedMealPlan, cacheMealPlan, getCachedProfile,
} from '../services/api'

interface MoveTarget { date: string; dayIndex: number; label: string; dayNum: number; occupied: boolean }

// ── Tipos del payload del backend ────────────────────────────────────
interface PlanEntry {
  id: number
  mealTime: string
  title: string
  description: string | null
  difficulty: string | null
  cookTime: number | null
  recipeId: number | null
  prepared: boolean
  source: string
}
interface PlanDay {
  date: string
  dayIndex: number
  meals: Record<string, PlanEntry | null>
}
interface MealPlan {
  weekStart: string
  days: PlanDay[]
}

const MEALS: { key: string; Icon: typeof Sun }[] = [
  { key: 'breakfast', Icon: Sunrise },
  { key: 'lunch', Icon: Sun },
  { key: 'dinner', Icon: Moon },
]

// ── Helpers de fecha (TZ-safe: trabajamos con fecha local sin horas) ──
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const addDays = (d: Date, n: number) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

const mondayOf = (base: Date) => {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  const dow = (d.getDay() + 6) % 7 // 0 = lunes ... 6 = domingo
  d.setDate(d.getDate() - dow)
  return d
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

export default function WeeklyPlanner() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const lang = i18n.language?.startsWith('es') ? 'es' : 'en'
  const locale = lang === 'es' ? 'es-ES' : 'en-US'

  const [monday, setMonday] = useState<Date>(() => mondayOf(new Date()))
  // Stale-while-revalidate: pintar al instante lo último conocido de esta semana
  // (localStorage) y revalidar por red en 2º plano — sin LoadingScreen al volver.
  const initialCached = useMemo<MealPlan | null>(() => getCachedMealPlan(ymd(mondayOf(new Date()))), [])
  const [plan, setPlan] = useState<MealPlan | null>(initialCached)
  const [selectedDay, setSelectedDay] = useState(() => {
    const idx = initialCached?.days?.findIndex(d => d.date === ymd(new Date())) ?? -1
    return idx >= 0 ? idx : 0
  })
  const [loading, setLoading] = useState(!initialCached)
  const [generating, setGenerating] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [profile, setProfile] = useState<any>(() => getCachedProfile())
  const [preparingId, setPreparingId] = useState<number | null>(null)
  const [moveMenuId, setMoveMenuId] = useState<number | null>(null)
  const [adding, setAdding] = useState<{ date: string; mealTime: string } | null>(null)
  const [addTitle, setAddTitle] = useState('')
  const [error, setError] = useState('')

  // Índice de hoy dentro de la semana mostrada (o null si no cae en ella)
  const todayKey = ymd(new Date())
  const todayIndex = (() => {
    for (let i = 0; i < 7; i++) if (ymd(addDays(monday, i)) === todayKey) return i
    return null
  })()

  async function load(weekMonday: Date, focusToday = false, silent = false) {
    if (!silent) setLoading(true)
    setError('')
    try {
      const data = await getMealPlan(ymd(weekMonday))
      setPlan(data)
      if (focusToday) {
        const tk = ymd(new Date())
        const idx = data.days.findIndex((d: PlanDay) => d.date === tk)
        setSelectedDay(idx >= 0 ? idx : 0)
      }
    } catch (err: any) {
      if (err?.message === '401') { localStorage.removeItem('token'); navigate('/login'); return }
      if (err?.message === 'PRO_ONLY') { navigate('/dashboard'); return }
      setError(t('planner.error_load', { defaultValue: 'No pudimos cargar tu planificador.' }))
    } finally {
      setLoading(false)
    }
  }

  // Con caché pintado: revalidación silenciosa (sin spinner ni salto de día).
  // Sin caché: carga normal con focus en hoy.
  useEffect(() => { load(monday, !initialCached, !!initialCached) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { getProfile().then(setProfile).catch(() => {}) }, [])
  // Mantener el caché al día con los parches locales (borrar/añadir optimistas);
  // se guarda bajo plan.weekStart, así nunca se cruza con otra semana.
  useEffect(() => { cacheMealPlan(plan) }, [plan])

  // Defaults del sheet derivados del perfil (objetivo → enfoque/presupuesto, tiempo → tope)
  const defaults = useMemo<{ prefs: MenuPreferences; meals: string[] }>(() => {
    const goal = profile?.goal
    const focus = goal === 'eat_healthy' ? 'healthy' : goal === 'save_money' ? 'budget' : goal === 'cook_fast' ? 'quick' : 'varied'
    const budget = goal === 'save_money' ? 'economic' : 'normal'
    const m = String(profile?.timeAvailable ?? '').match(/(\d+)/)
    const mins = m ? parseInt(m[1], 10) : null
    const maxCookTime = mins == null ? null : mins <= 15 ? 15 : mins <= 30 ? 30 : mins <= 45 ? 45 : null
    return {
      prefs: {
        focus, cuisines: [], maxCookTime, includeIngredients: '', avoidIngredients: '', budget,
        calorieGoal: null, nutritionGoals: [], servings: null,
      },
      meals: ['breakfast', 'lunch', 'dinner'],
    }
  }, [profile])

  const goWeek = (delta: number) => {
    const next = addDays(monday, delta * 7)
    setMonday(next)
    setSelectedDay(0)
    setAdding(null)
    setMoveMenuId(null)
    // Semana ya vista → pintar del caché al instante y revalidar en silencio
    const cached = getCachedMealPlan(ymd(next))
    if (cached) { setPlan(cached); load(next, false, true) }
    else load(next)
  }

  const handleGenerate = async (prefs: MenuPreferences, meals: string[]) => {
    setGenerating(true)
    setError('')
    try {
      const data = await generateWeeklyMenu(ymd(monday), meals, prefs as unknown as Record<string, unknown>)
      setPlan(data)
      setSheetOpen(false)
    } catch (err: any) {
      if (err?.message === '401') { localStorage.removeItem('token'); navigate('/login'); return }
      setError(t('planner.error_generate', { defaultValue: 'No pudimos generar el menú. Intenta de nuevo.' }))
    } finally {
      setGenerating(false)
    }
  }

  const handlePrepare = async (entry: PlanEntry) => {
    if (entry.prepared && entry.recipeId) { navigate(`/recipes/${entry.recipeId}`); return }
    setPreparingId(entry.id)
    setError('')
    try {
      const res = await prepareMealPlanEntry(entry.id)
      if (res?.recipeId) navigate(`/recipes/${res.recipeId}`)
    } catch (err: any) {
      if (err?.message === '401') { localStorage.removeItem('token'); navigate('/login'); return }
      setError(t('planner.error_prepare', { defaultValue: 'No pudimos preparar la receta. Intenta de nuevo.' }))
    } finally {
      setPreparingId(null)
    }
  }

  const handleDelete = async (entry: PlanEntry) => {
    // Optimista: quitar del estado local de inmediato
    setPlan(prev => {
      if (!prev) return prev
      const days = prev.days.map(d => {
        const meals = { ...d.meals }
        if (meals[entry.mealTime]?.id === entry.id) meals[entry.mealTime] = null
        return { ...d, meals }
      })
      return { ...prev, days }
    })
    try {
      await deleteMealPlanSlot(entry.id)
    } catch {
      load(monday) // si falla, recargar para reconciliar
    }
  }

  const handleMove = async (entry: PlanEntry, targetDate: string, targetDayIndex: number) => {
    setMoveMenuId(null)
    try {
      // El backend mueve si el destino está vacío, o intercambia (swap) si está ocupado.
      await moveMealPlanSlot(entry.id, { date: targetDate })
      await load(monday, false, true) // recarga silenciosa (sin parpadeo)
      setSelectedDay(targetDayIndex)
    } catch (err: any) {
      if (err?.message === '401') { localStorage.removeItem('token'); navigate('/login'); return }
      setError(t('planner.error_move', { defaultValue: 'No pudimos mover el plato.' }))
      load(monday, false, true)
    }
  }

  const handleAdd = async (date: string, mealTime: string) => {
    const title = addTitle.trim()
    if (!title) return
    setAdding(null)
    setAddTitle('')
    try {
      // El POST devuelve el slot creado → parche local (sin recarga completa ni spinner)
      const entry = await setMealPlanSlot({ date, mealTime, title })
      setPlan(prev => {
        if (!prev) return prev
        const days = prev.days.map(d => d.date === date ? { ...d, meals: { ...d.meals, [mealTime]: entry } } : d)
        return { ...prev, days }
      })
    } catch (err: any) {
      if (err?.message === '401') { localStorage.removeItem('token'); navigate('/login'); return }
      setError(t('planner.error_add', { defaultValue: 'No pudimos añadir el plato.' }))
      load(monday, false, true) // reconciliar por si el POST sí llegó
    }
  }

  if (loading) return <LoadingScreen />

  const sunday = addDays(monday, 6)
  const sameMonth = monday.getMonth() === sunday.getMonth()
  const rangeText = sameMonth
    ? `${cap(monday.toLocaleDateString(locale, { month: 'long' }))} ${monday.getDate()} - ${sunday.getDate()}`
    : `${cap(monday.toLocaleDateString(locale, { month: 'short' }))} ${monday.getDate()} - ${cap(sunday.toLocaleDateString(locale, { month: 'short' }))} ${sunday.getDate()}`

  const currentDay = plan?.days?.[selectedDay] ?? null

  return (
    <div className="sv-screen sv-page flex flex-col">
      <div className="sv-orbs"><div className="sv-orb sv-orb-1" /><div className="sv-orb sv-orb-2" /><div className="sv-orb sv-orb-3" /></div>
      <div className="sv-content flex flex-col flex-1 pb-32">

        {/* HEADER */}
        <div className="flex items-center justify-between px-4 pt-12 pb-2 sv-stagger-1">
          <button
            onClick={() => navigate('/dashboard')}
            className="w-10 h-10 flex items-center justify-center rounded-2xl transition active:scale-95"
            style={{ background: 'var(--sv-bg-surface)', border: '1px solid var(--sv-border-light)' }}
          >
            <ArrowLeft className="w-5 h-5 sv-muted" />
          </button>

          {/* Navegación de semana */}
          <div className="flex items-center gap-1">
            <button onClick={() => goWeek(-1)} className="w-9 h-9 flex items-center justify-center rounded-xl transition active:scale-95" style={{ background: 'var(--sv-bg-surface)', border: '1px solid var(--sv-border-light)' }}>
              <ChevronLeft className="w-4 h-4 sv-muted" />
            </button>
            <button onClick={() => goWeek(1)} className="w-9 h-9 flex items-center justify-center rounded-xl transition active:scale-95" style={{ background: 'var(--sv-bg-surface)', border: '1px solid var(--sv-border-light)' }}>
              <ChevronRight className="w-4 h-4 sv-muted" />
            </button>
          </div>
        </div>

        {/* TÍTULO */}
        <div className="px-6 pt-2 pb-4 text-center sv-stagger-1">
          <p className="sv-muted text-sm">{rangeText}</p>
          <h1 className="text-3xl font-black leading-tight mt-0.5">{t('planner.title', { defaultValue: 'Planificador Semanal' })}</h1>
        </div>

        {/* TABS DE DÍAS — fila deslizable horizontal (Lun–Dom) */}
        <div className="pb-4 sv-stagger-2">
          <div className="sv-scroll-x flex gap-2 px-4">
            {Array.from({ length: 7 }).map((_, i) => {
              const date = addDays(monday, i)
              const isSel = i === selectedDay
              const isToday = i === todayIndex
              const isPast = ymd(date) < todayKey // día ya pasado
              const wd = cap(date.toLocaleDateString(locale, { weekday: 'short' }).replace('.', ''))
              return (
                <button
                  key={i}
                  onClick={() => { setSelectedDay(i); setAdding(null); setMoveMenuId(null) }}
                  className="shrink-0 w-[54px] py-2 rounded-xl font-bold transition active:scale-95 text-center flex flex-col items-center gap-0.5"
                  style={isSel
                    ? { background: 'var(--sv-primary)', color: '#fff', boxShadow: '0 4px 14px var(--sv-primary-glow)' }
                    : { background: 'var(--sv-bg-surface)', border: `1px solid ${isToday ? 'var(--sv-primary)' : 'var(--sv-border-light)'}`, color: isToday ? 'var(--sv-primary)' : 'var(--sv-text-muted)' }}
                >
                  <span className="text-[13px] leading-none">{wd}</span>
                  <span className="text-[15px] leading-none">{date.getDate()}</span>
                  {/* Subrayado rojo ligero en días ya pasados */}
                  <span className="block h-[2px] w-4 rounded-full" style={{ background: isPast && !isSel ? 'rgba(239,68,68,0.65)' : 'transparent' }} />
                </button>
              )
            })}
          </div>
        </div>

        {/* ERROR */}
        {error && (
          <div className="px-5 mb-3">
            <div className="rounded-2xl px-4 py-3 flex items-center gap-3" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)' }}>
              <X className="w-5 h-5 shrink-0" style={{ color: '#FCA5A5' }} />
              <p className="text-sm font-medium" style={{ color: '#FCA5A5' }}>{error}</p>
            </div>
          </div>
        )}

        {/* SECCIONES DE COMIDA (el aire inferior lo da el pb-40 de sv-content para
            que la última tarjeta no quede oculta bajo el CTA fijo) */}
        <div className="px-5 space-y-5 sv-stagger-3">
          {MEALS.map((meal) => {
            const entry = currentDay?.meals?.[meal.key] ?? null
            const dateStr = currentDay?.date ?? ymd(addDays(monday, selectedDay))
            const isAdding = adding?.date === dateStr && adding?.mealTime === meal.key
            // Días a los que se puede mover este plato (mismo tipo de comida, otro día)
            const moveTargets: MoveTarget[] = (plan?.days ?? [])
              .filter(d => d.dayIndex !== selectedDay)
              .map(d => {
                const date = addDays(monday, d.dayIndex)
                return {
                  date: d.date,
                  dayIndex: d.dayIndex,
                  label: cap(date.toLocaleDateString(locale, { weekday: 'short' }).replace('.', '')),
                  dayNum: date.getDate(),
                  occupied: !!d.meals?.[meal.key],
                }
              })
            return (
              <section key={meal.key}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <meal.Icon className="w-5 h-5" style={{ color: 'var(--sv-primary)' }} />
                  <h2 className="text-lg font-black">{t(`planner.meals.${meal.key}`, { defaultValue: meal.key })}</h2>
                </div>

                {entry ? (
                  <MealCard
                    entry={entry}
                    dayPast={ymd(addDays(monday, selectedDay)) < todayKey}
                    preparing={preparingId === entry.id}
                    moveOpen={moveMenuId === entry.id}
                    moveTargets={moveTargets}
                    onToggleMove={() => setMoveMenuId(moveMenuId === entry.id ? null : entry.id)}
                    onMove={(date, dayIndex) => handleMove(entry, date, dayIndex)}
                    onPrepare={() => handlePrepare(entry)}
                    onDelete={() => handleDelete(entry)}
                    t={t}
                  />
                ) : isAdding ? (
                  <div className="sv-glass p-3 flex items-center gap-2">
                    <input
                      autoFocus
                      value={addTitle}
                      onChange={(e) => setAddTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(dateStr, meal.key); if (e.key === 'Escape') { setAdding(null); setAddTitle('') } }}
                      placeholder={t('planner.add_placeholder', { defaultValue: 'Nombre del plato' })}
                      maxLength={120}
                      className="flex-1 bg-transparent outline-none text-base font-medium px-2"
                      style={{ color: 'var(--sv-text-main)' }}
                    />
                    <button onClick={() => handleAdd(dateStr, meal.key)} disabled={!addTitle.trim()} className="w-9 h-9 flex items-center justify-center rounded-xl shrink-0 disabled:opacity-40" style={{ background: 'var(--sv-primary)' }}>
                      <Check className="w-4 h-4 text-white" />
                    </button>
                    <button onClick={() => { setAdding(null); setAddTitle('') }} className="w-9 h-9 flex items-center justify-center rounded-xl shrink-0" style={{ background: 'var(--sv-bg-input)', border: '1px solid var(--sv-border-light)' }}>
                      <X className="w-4 h-4 sv-muted" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setAdding({ date: dateStr, mealTime: meal.key }); setAddTitle('') }}
                    className="w-full sv-glass sv-glass-hover py-5 flex items-center justify-center gap-2 sv-muted"
                  >
                    <Plus className="w-5 h-5" />
                    <span className="font-semibold">{t(`planner.add_${meal.key}`, { defaultValue: t('planner.add', { defaultValue: 'Añadir' }) })}</span>
                  </button>
                )}
              </section>
            )
          })}
        </div>
      </div>

      {/* CTA GENERAR MENÚ — portal a body para que el `fixed` se ancle al viewport
          (si no, el transform de la animación de página `.sv-page` lo descoloca). */}
      {createPortal(
        <div className="fixed bottom-0 left-0 right-0 px-5 pt-8 z-50" style={{ background: 'linear-gradient(to top, var(--sv-bg-base) 62%, transparent)', paddingBottom: 'calc(0.85rem + env(safe-area-inset-bottom))' }}>
          <div className="max-w-md mx-auto">
            {/* CTA compacto de una sola línea (antes era una tarjeta alta que tapaba el horario). */}
            <button
              onClick={() => { setError(''); setSheetOpen(true) }}
              className="sv-btn sv-btn-primary w-full py-3 px-4 flex items-center justify-center gap-2"
              style={{ borderRadius: 'var(--sv-radius-md)' }}
            >
              <Sparkles className="w-5 h-5 shrink-0" />
              <span className="text-[15px] font-bold">{t('planner.generate_cta', { defaultValue: 'Generar Menú Semanal con IA' })}</span>
            </button>
          </div>
        </div>,
        document.body,
      )}

      {/* SHEET DE PREFERENCIAS */}
      <MenuPreferencesSheet
        open={sheetOpen}
        initialPrefs={defaults.prefs}
        initialMeals={defaults.meals}
        generating={generating}
        error={error}
        onClose={() => setSheetOpen(false)}
        onSubmit={handleGenerate}
      />

      {/* OVERLAY DE GENERACIÓN — a pantalla completa, por encima del sheet (z-[80]),
          para que se note que está trabajando (la IA tarda unos segundos). */}
      {generating && createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center px-8" style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)' }}>
          <div className="sv-glass p-7 max-w-xs w-full text-center" style={{ background: 'var(--sv-bg-surface)' }}>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'linear-gradient(135deg, var(--sv-primary), #FF8B54)', boxShadow: '0 8px 24px var(--sv-primary-glow)' }}>
              <Sparkles className="w-8 h-8 text-white animate-pulse" />
            </div>
            <p className="text-lg font-black leading-tight">{t('planner.generating', { defaultValue: 'Creando tu menú...' })}</p>
            <p className="text-sm sv-muted mt-1.5">{t('planner.generating_hint', { defaultValue: 'Esto puede tardar unos segundos…' })}</p>
            <div className="mt-4 flex items-center justify-center gap-2 sv-dim">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">{t('planner.generating_wait', { defaultValue: 'Cocinando 7 días de recetas' })}</span>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

// ── Card de un plato planeado ─────────────────────────────────────────
function MealCard({ entry, dayPast, preparing, moveOpen, moveTargets, onToggleMove, onMove, onPrepare, onDelete, t }: {
  entry: PlanEntry
  dayPast: boolean
  preparing: boolean
  moveOpen: boolean
  moveTargets: MoveTarget[]
  onToggleMove: () => void
  onMove: (date: string, dayIndex: number) => void
  onPrepare: () => void
  onDelete: () => void
  t: any
}) {
  // Plato de un día ya pasado que nunca se preparó → "Perdida".
  const missed = dayPast && !entry.prepared
  return (
    <div className="sv-glass p-4">
      <div className="flex items-start gap-3">
        <div className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,94,26,0.12)' }}>
          <Utensils className="w-6 h-6" style={{ color: 'var(--sv-primary)' }} />
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-bold text-base leading-snug">{entry.title}</p>
          {entry.description && <p className="text-sm sv-muted mt-0.5 leading-snug line-clamp-2">{entry.description}</p>}
          <div className="flex gap-2 mt-2 flex-wrap">
            {entry.cookTime != null && (
              <span className="sv-badge sv-badge-primary" style={{ textTransform: 'none', letterSpacing: 0 }}>
                <Clock className="w-3 h-3" /> {entry.cookTime} min
              </span>
            )}
            {entry.difficulty && (
              <span className="sv-badge sv-badge-primary" style={{ textTransform: 'none', letterSpacing: 0 }}>
                <ChefHat className="w-3 h-3" /> {entry.difficulty}
              </span>
            )}
            {entry.prepared && (
              <span className="sv-badge" style={{ background: 'rgba(16,185,129,0.15)', color: '#34D399', border: '1px solid rgba(16,185,129,0.3)', textTransform: 'none', letterSpacing: 0 }}>
                <Check className="w-3 h-3" /> {t('planner.done', { defaultValue: 'Hecha' })}
              </span>
            )}
            {missed && (
              <span className="sv-badge" style={{ background: 'rgba(239,68,68,0.12)', color: '#F87171', border: '1px solid rgba(239,68,68,0.3)', textTransform: 'none', letterSpacing: 0 }}>
                <X className="w-3 h-3" /> {t('planner.missed', { defaultValue: 'Perdida' })}
              </span>
            )}
          </div>
        </div>

        <button onClick={onDelete} className="p-2 rounded-lg shrink-0 transition hover:bg-white/5" aria-label="delete">
          <Trash2 className="w-4 h-4 sv-dim" />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={onPrepare}
          disabled={preparing}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition active:scale-[0.99] disabled:opacity-60"
          style={{ background: 'rgba(255,94,26,0.12)', border: '1px solid rgba(255,94,26,0.4)', color: 'var(--sv-primary)' }}
        >
          {preparing ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> {t('planner.preparing', { defaultValue: 'Preparando...' })}</>
          ) : entry.prepared ? (
            <><ChevronRight className="w-4 h-4" /> {t('planner.view_recipe', { defaultValue: 'Ver receta' })}</>
          ) : (
            <><ChefHat className="w-4 h-4" /> {t('planner.prepare', { defaultValue: 'Preparar' })}</>
          )}
        </button>

        {/* Mover a otro día */}
        <div className="relative shrink-0">
          <button
            onClick={onToggleMove}
            className="py-2.5 px-3 rounded-xl text-sm font-semibold flex items-center gap-1.5 sv-muted transition active:scale-[0.97]"
            style={{ background: 'var(--sv-bg-input)', border: '1px solid var(--sv-border-light)' }}
          >
            <ArrowRightLeft className="w-4 h-4" />
            {t('planner.move', { defaultValue: 'Mover' })}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${moveOpen ? 'rotate-180' : ''}`} />
          </button>

          {moveOpen && (
            <>
              <div className="fixed inset-0 z-[55]" onClick={onToggleMove} />
              <div className="absolute right-0 bottom-full mb-2 w-48 z-[60] sv-glass p-1.5 max-h-64 overflow-y-auto" style={{ background: 'var(--sv-bg-surface-hover)' }}>
                <p className="text-[10px] font-bold uppercase tracking-wide sv-dim px-2.5 pt-1.5 pb-1">
                  {t('planner.move_to', { defaultValue: 'Mover a' })}
                </p>
                {moveTargets.map((tg) => (
                  <button
                    key={tg.date}
                    onClick={() => onMove(tg.date, tg.dayIndex)}
                    className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-sm font-medium sv-menu-item"
                  >
                    <span>{tg.label} {tg.dayNum}</span>
                    {tg.occupied && <ArrowRightLeft className="w-3.5 h-3.5 sv-dim" title={t('planner.swap', { defaultValue: 'intercambiar' })} />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}