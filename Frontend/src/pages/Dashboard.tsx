import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { ChevronRight, ChevronDown, Check } from 'lucide-react'
import { PixelChefHat, PixelBasket, PixelFlame, PixelTarget, PixelSparkles, PixelLock, PixelClock, PixelSalad, PixelDumbbell, PixelScale } from '../components/ui/PixelIcons'
import { useTranslation } from 'react-i18next'
import AvatarMenu from '../components/ui/AvatarMenu'
import LoadingScreen from '../components/ui/LoadingScreen'
import { getProfile, getCachedProfile, getDailyRecipe, generateDailyRecipe, getWeeklyNutrition, updateProfile, WeeklyNutrition, PersonalizedGoal } from '../services/api'
import { isPaid, isChef } from '../utils/plan'

const FREE_LIMIT = 3
const WEEK_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] // lunes → domingo

// Objetivos nutricionales: meta SEMANAL de kcal cocinadas en Savora (realista —
// solo cuentan platos verificados en Modo Cocina, no todo lo que comes en el día).
const NUTRITION_GOALS = [
  { key: 'healthy', kcal: 3000, icon: PixelSalad },
  { key: 'cut',     kcal: 2500, icon: PixelFlame },
  { key: 'bulk',    kcal: 5000, icon: PixelDumbbell },
  { key: 'balance', kcal: 3500, icon: PixelScale },
] as const
type GoalKey = (typeof NUTRITION_GOALS)[number]['key']
const goalOf = (key: string | null | undefined) =>
  NUTRITION_GOALS.find((g) => g.key === key) ?? NUTRITION_GOALS[0]

// Anillo de progreso de la meta semanal (kcal cocinadas / meta).
function GoalRing({ value, goal }: { value: number; goal: number }) {
  const pct = Math.min(1, goal > 0 ? value / goal : 0)
  const R = 42
  const C = 2 * Math.PI * R
  return (
    <div className="relative shrink-0" style={{ width: 104, height: 104 }}>
      <svg width={104} height={104} viewBox="0 0 104 104">
        <circle cx="52" cy="52" r={R} fill="none" stroke="var(--viz-track)" strokeWidth="9" />
        <circle
          cx="52" cy="52" r={R} fill="none"
          stroke="var(--viz-kcal)" strokeWidth="9" strokeLinecap="round"
          strokeDasharray={`${C * pct} ${C}`}
          transform="rotate(-90 52 52)"
          style={{ transition: 'stroke-dasharray 600ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-black leading-none">{value}</span>
        <span className="text-[10px] font-semibold sv-dim mt-0.5">kcal</span>
      </div>
    </div>
  )
}

function getMealTime(): { key: string; label_en: string; label_es: string; emoji: string } {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 11)  return { key: 'breakfast', label_en: 'Breakfast', label_es: 'Desayuno', emoji: '🌅' }
  if (hour >= 11 && hour < 15) return { key: 'lunch',     label_en: 'Lunch',     label_es: 'Almuerzo', emoji: '☀️' }
  if (hour >= 15 && hour < 18) return { key: 'snack',     label_en: 'Snack',     label_es: 'Merienda', emoji: '🍎' }
  return                               { key: 'dinner',    label_en: 'Dinner',    label_es: 'Cena',     emoji: '🌙' }
}

function getFrase(t: any, name: string): string {
  const hour = new Date().getHours()
  let period: 'morning' | 'afternoon' | 'evening'
  if (hour >= 5 && hour < 12) period = 'morning'
  else if (hour >= 12 && hour < 19) period = 'afternoon'
  else period = 'evening'
  const pool: string[] = t(`dashboard.greetings.${period}`, { returnObjects: true })
  return pool[Math.floor(Math.random() * pool.length)].replace('{{name}}', name)
}

function getStreakLabel(streak: number, lang: string): string {
  if (streak <= 0) return ''
  if (lang === 'es') return `${streak} día${streak !== 1 ? 's' : ''} cocinando`
  return `${streak} day${streak !== 1 ? 's' : ''} cooking`
}

export default function Dashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t, i18n } = useTranslation()
  const lang = i18n.language?.startsWith('es') ? 'es' : 'en'

  // Slide direccional al venir de la barra de tabs (Inicio ↔ Social).
  const slideFrom = (location.state as { slideFrom?: 'right' | 'left' } | null)?.slideFrom
  const pageAnim = slideFrom === 'right' ? 'sv-slide-from-right' : slideFrom === 'left' ? 'sv-slide-from-left' : 'sv-page'

  // Si ya tenemos el perfil cacheado, arrancamos con datos (sin LoadingScreen) y
  // refrescamos en segundo plano → volver al Dashboard desde Social es instantáneo.
  const cached = getCachedProfile()

  const [frase, setFrase] = useState(() => (cached?.name ? getFrase(t, cached.name.split(' ')[0]) : ''))
  const [userName, setUserName] = useState(cached?.name || '')
  const [userEmail, setUserEmail] = useState(cached?.email || '')
  const [plan, setPlan] = useState<string | null>(cached?.plan ?? null)
  const [requestsUsed, setRequestsUsed] = useState(cached?.requestsUsed ?? 0)
  const [cookingStreak, setCookingStreak] = useState(cached?.cookingStreak ?? 0)
  const [dailyRecipe, setDailyRecipe] = useState<any>(null)
  const [weekly, setWeekly] = useState<WeeklyNutrition | null>(null)
  const [goalKey, setGoalKey] = useState<GoalKey>(goalOf(cached?.nutritionGoal).key)
  const [personalGoal, setPersonalGoal] = useState<PersonalizedGoal | null>(cached?.personalizedGoal ?? null)
  const [showGoalSheet, setShowGoalSheet] = useState(false)
  const [sheetMode, setSheetMode] = useState<'goals' | 'body'>('goals')
  // Unidades del formulario: imperial (lb/ft-in, default — mercado US) o métrico.
  // Solo afecta la UI: en la DB siempre se guarda kg/cm.
  const [units, setUnits] = useState<'imperial' | 'metric'>(() =>
    localStorage.getItem('savora.units') === 'metric' ? 'metric' : 'imperial')
  const [bodyForm, setBodyForm] = useState({ weight: '', heightCm: '', heightFt: '', heightIn: '', age: '', sex: '', activityLevel: 'light', mealsPerWeek: 5 })
  const [savingGoal, setSavingGoal] = useState(false)
  const [dailyLoading, setDailyLoading] = useState(true)
  const [preparingDaily, setPreparingDaily] = useState(false)
  const [initialLoading, setInitialLoading] = useState(!cached)

  const mealTime = getMealTime()
  const mealLabel = lang === 'es' ? mealTime.label_es : mealTime.label_en

  // Perfil — bloquea el LoadingScreen del dashboard
  useEffect(() => {
    async function loadProfile() {
      const token = localStorage.getItem('token')
      if (!token) { navigate('/login'); return }
      try {
        const data = await getProfile()
        if (!data) { localStorage.removeItem('token'); navigate('/login'); return }
        if (!data.cookingLevel) { navigate('/setup-profile'); return }
        const firstName = data.name?.split(' ')[0] ?? 'Chef'
        setFrase((prev) => prev || getFrase(t, firstName)) // estable al refrescar
        setUserName(data.name || '')
        setUserEmail(data.email || '')
        setPlan(data.plan ?? 'FREE')
        setRequestsUsed(data.requestsUsed ?? 0)
        setCookingStreak(data.cookingStreak ?? 0)
        setGoalKey(goalOf(data.nutritionGoal).key)
        setPersonalGoal(data.personalizedGoal ?? null)
        // Prefill del formulario de datos corporales (DB en métrico → unidades de la UI)
        const u = localStorage.getItem('savora.units') === 'metric' ? 'metric' : 'imperial'
        const totalIn = data.heightCm ? data.heightCm / 2.54 : 0
        setBodyForm((f) => ({
          ...f,
          weight: data.weightKg ? String(u === 'metric' ? data.weightKg : Math.round(data.weightKg * 2.20462)) : f.weight,
          heightCm: data.heightCm ? String(Math.round(data.heightCm)) : f.heightCm,
          heightFt: totalIn ? String(Math.floor(totalIn / 12)) : f.heightFt,
          heightIn: totalIn ? String(Math.round(totalIn % 12)) : f.heightIn,
          age: data.birthYear ? String(new Date().getFullYear() - data.birthYear) : f.age,
          sex: data.sex ?? f.sex,
          activityLevel: data.activityLevel ?? f.activityLevel,
          mealsPerWeek: data.mealsPerWeek ?? f.mealsPerWeek,
        }))
      } catch (err: any) {
        if (err.message === '401') { localStorage.removeItem('token'); navigate('/login') }
      } finally {
        setInitialLoading(false)
      }
    }
    loadProfile()
  }, [navigate, t])

  // Receta del día — carga aparte. Mostrarla es gratis, pero la primera carga del día
  // puede generar la receta global → por eso tiene su propio loading y no bloquea el dashboard.
  useEffect(() => {
    let active = true
    setDailyLoading(true)
    getDailyRecipe(mealTime.key)
      .then((d) => { if (active) setDailyRecipe(d?.recipe ?? null) })
      .catch(() => { if (active) setDailyRecipe(null) })
      .finally(() => { if (active) setDailyLoading(false) })
    return () => { active = false }
  }, [mealTime.key])

  // "Preparar receta": si ya la preparó hoy (tiene id) navega directo; si no, la genera
  // bajo demanda (crea la copia per-usuario y consume 1 crédito FREE) y luego navega.
  const handlePrepareDaily = async () => {
    if (dailyRecipe?.id) { navigate(`/recipes/${dailyRecipe.id}`); return }
    if (limitReached) return
    setPreparingDaily(true)
    try {
      const data = await generateDailyRecipe(mealTime.key)
      if (data?.recipe?.id) navigate(`/recipes/${data.recipe.id}`)
    } catch (err: any) {
      if (err.message === 'LIMIT_REACHED') setRequestsUsed(FREE_LIMIT)
    } finally { setPreparingDaily(false) }
  }

  // Calorías de la semana — no bloquea el dashboard; si falla, la tarjeta muestra 0.
  useEffect(() => {
    let active = true
    getWeeklyNutrition()
      .then((w) => { if (active) setWeekly(w) })
      .catch(() => {})
    return () => { active = false }
  }, [])

  // Elegir objetivo: optimista en UI, persiste en el perfil (columna User.nutritionGoal).
  // El objetivo también ajusta la meta personalizada (cut −20% / bulk +12%) → refetch.
  const handleSelectGoal = async (key: GoalKey) => {
    if (savingGoal) return
    const prev = goalKey
    setGoalKey(key)
    setSavingGoal(true)
    try {
      await updateProfile({ nutritionGoal: key })
      setShowGoalSheet(false)
      if (personalGoal) getProfile().then((p) => setPersonalGoal(p?.personalizedGoal ?? null)).catch(() => {})
    } catch (err: any) {
      setGoalKey(prev) // rollback
      if (err.message === '401') { localStorage.removeItem('token'); navigate('/login') }
    } finally {
      setSavingGoal(false)
    }
  }

  // Cambiar de unidades convierte lo ya tecleado (no lo borra).
  const switchUnits = (next: 'imperial' | 'metric') => {
    if (next === units) return
    localStorage.setItem('savora.units', next)
    setBodyForm((f) => {
      const patch = { ...f }
      const w = parseFloat(f.weight)
      if (w > 0) patch.weight = next === 'metric' ? String(Math.round((w / 2.20462) * 10) / 10) : String(Math.round(w * 2.20462))
      if (next === 'imperial') {
        const cm = parseFloat(f.heightCm)
        if (cm > 0) {
          const totalIn = cm / 2.54
          patch.heightFt = String(Math.floor(totalIn / 12))
          patch.heightIn = String(Math.round(totalIn % 12))
        }
      } else {
        const ft = parseFloat(f.heightFt) || 0
        const inch = parseFloat(f.heightIn) || 0
        if (ft > 0 || inch > 0) patch.heightCm = String(Math.round((ft * 12 + inch) * 2.54))
      }
      return patch
    })
    setUnits(next)
  }

  // Guardar datos corporales → el backend recalcula la meta personalizada (fórmula
  // Mifflin-St Jeor, nunca IA) y la devolvemos con un refetch del perfil.
  // La DB siempre recibe métrico (kg/cm), venga en las unidades que venga la UI.
  const weightKgVal = units === 'metric'
    ? parseFloat(bodyForm.weight)
    : parseFloat(bodyForm.weight) / 2.20462
  const heightCmVal = units === 'metric'
    ? parseFloat(bodyForm.heightCm)
    : ((parseFloat(bodyForm.heightFt) || 0) * 12 + (parseFloat(bodyForm.heightIn) || 0)) * 2.54

  const bodyFormValid =
    weightKgVal > 0 && heightCmVal >= 100 && heightCmVal <= 250 &&
    parseInt(bodyForm.age, 10) >= 13 && (bodyForm.sex === 'male' || bodyForm.sex === 'female')

  const handleSaveBody = async () => {
    if (!bodyFormValid || savingGoal) return
    setSavingGoal(true)
    try {
      await updateProfile({
        weightKg: Math.round(weightKgVal * 10) / 10,
        heightCm: Math.round(heightCmVal),
        birthYear: new Date().getFullYear() - parseInt(bodyForm.age, 10),
        sex: bodyForm.sex,
        activityLevel: bodyForm.activityLevel,
        mealsPerWeek: bodyForm.mealsPerWeek,
      })
      const fresh = await getProfile()
      setPersonalGoal(fresh?.personalizedGoal ?? null)
      setShowGoalSheet(false)
      setSheetMode('goals')
    } catch (err: any) {
      if (err.message === '401') { localStorage.removeItem('token'); navigate('/login') }
    } finally {
      setSavingGoal(false)
    }
  }

  const isFree = plan === 'FREE'
  const recipesLeft = Math.max(0, FREE_LIMIT - requestsUsed)
  const limitReached = isFree && requestsUsed >= FREE_LIMIT
  const canBattle = isPaid(plan)   // Duelo: PRO o CHEF
  const canCourses = isChef(plan)  // Cursos: solo CHEF

  if (initialLoading) return <LoadingScreen />

  return (
    <div className={`sv-screen sv-pixel-font ${pageAnim} flex flex-col`}>
      <div className="sv-orbs"><div className="sv-orb sv-orb-1" /><div className="sv-orb sv-orb-2" /><div className="sv-orb sv-orb-3" /></div>

      <div className="sv-content flex flex-col flex-1">

      {/* TOPBAR — avatar izquierda, racha derecha (z alto para que el menú quede encima) */}
      <div className="flex items-start justify-between px-5 pt-12 pb-2 sv-stagger-1 relative" style={{ zIndex: 60 }}>
        <AvatarMenu name={userName} email={userEmail} />

        {/* 🔥 Racha de cocina */}
        {cookingStreak > 0 && (
          <div className="shrink-0 flex flex-col items-center rounded-2xl px-3 py-2 min-w-[60px]" style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)' }}>
            <PixelChefHat className="w-6 h-6" />
            <span className="text-sm font-black leading-none mt-1" style={{ color: 'var(--sv-warning)' }}>{cookingStreak}</span>
            <span className="text-[10px] font-medium leading-tight text-center mt-0.5" style={{ color: 'var(--sv-warning)' }}>
              {lang === 'es' ? 'días' : 'days'}
            </span>
          </div>
        )}
      </div>

      {/* SALUDO */}
      <div className="px-6 pt-3 pb-7 sv-stagger-1">
        <h1 className="text-xl font-black leading-snug">{frase}</h1>
      </div>

      {/* BANNER FREE */}
      {isFree && plan !== null && (
        <div className="px-5 mb-3 sv-stagger-2">
          {limitReached ? (
            <div className="rounded-2xl px-4 py-3 flex items-center gap-3" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)' }}>
              <PixelLock className="w-5 h-5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: '#FCA5A5' }}>{t('dashboard.limit_reached_title')}</p>
                <p className="text-xs" style={{ color: 'rgba(252,165,165,0.7)' }}>{t('dashboard.limit_reached_subtitle')}</p>
              </div>
              <button className="sv-btn sv-btn-danger shrink-0 text-xs px-3 py-1.5">
                {t('dashboard.upgrade')}
              </button>
            </div>
          ) : (
            <div className="rounded-2xl px-4 py-3 flex items-center justify-between gap-3" style={{ background: 'rgba(255,94,26,0.1)', border: '1px solid rgba(255,94,26,0.25)' }}>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--sv-primary)' }}>
                  {t('dashboard.free_plan_remaining', { count: recipesLeft })}
                </p>
                <p className="text-xs sv-dim mt-0.5">{t('dashboard.free_plan_upgrade')}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                {Array.from({ length: FREE_LIMIT }).map((_, i) => (
                  <div key={i} className="w-3 h-3 rounded-full transition-all" style={{ background: i < requestsUsed ? 'var(--sv-primary)' : 'rgba(255,94,26,0.25)' }} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* RECETA DEL DÍA */}
      <div className="px-5 mb-5 sv-stagger-3">
        <div className="sv-glass overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">{mealTime.emoji}</span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--sv-primary)' }}>{t('dashboard.daily_recipe')}</p>
                <p className="text-xs sv-dim">{mealLabel}</p>
              </div>
            </div>
          </div>

          {dailyLoading ? (
            <div className="px-4 pb-4 space-y-2 animate-pulse">
              <div className="h-5 rounded-lg w-2/3" style={{ background: 'var(--sv-border-strong)' }} />
              <div className="h-4 rounded w-1/3" style={{ background: 'var(--sv-border-light)' }} />
            </div>
          ) : dailyRecipe ? (
            <div className="px-4 pb-4">
              <p className="font-bold text-base leading-snug">{dailyRecipe.title}</p>
              {dailyRecipe.description && <p className="text-sm sv-muted mt-1 leading-relaxed line-clamp-2">{dailyRecipe.description}</p>}
              <div className="flex gap-2 mt-2 flex-wrap">
                {dailyRecipe.cookTime && (
                  <span className="sv-badge sv-badge-primary" style={{ textTransform: 'none', letterSpacing: 0 }}>
                    <PixelClock className="w-3 h-3" /> {dailyRecipe.cookTime} min
                  </span>
                )}
                {dailyRecipe.difficulty && (
                  <span className="sv-badge sv-badge-primary" style={{ textTransform: 'none', letterSpacing: 0 }}>
                    <PixelChefHat className="w-3 h-3" /> {dailyRecipe.difficulty}
                  </span>
                )}
                {dailyRecipe.nutrition?.calories && (
                  <span className="sv-badge sv-badge-primary" style={{ textTransform: 'none', letterSpacing: 0 }}>
                    <PixelFlame className="w-3 h-3" /> {dailyRecipe.nutrition.calories} kcal
                  </span>
                )}
              </div>
              <button
                onClick={handlePrepareDaily}
                disabled={preparingDaily || (limitReached && !dailyRecipe.id)}
                className="mt-4 w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition active:scale-[0.99] disabled:opacity-40"
                style={{ background: 'rgba(255,94,26,0.12)', border: '1px solid rgba(255,94,26,0.4)', color: 'var(--sv-primary)' }}
              >
                {limitReached && !dailyRecipe.id ? (
                  <><PixelLock className="w-4 h-4" /> {t('dashboard.limit_reached_title')}</>
                ) : (
                  <><PixelChefHat className={`w-4 h-4 ${preparingDaily ? 'animate-pulse' : ''}`} /> {t('dashboard.daily_cook')}</>
                )}
              </button>
              {isFree && !dailyRecipe.id && (
                <p className="text-xs sv-dim text-center mt-2">
                  {limitReached ? t('dashboard.daily_reveal_no_left') : t('dashboard.daily_reveal_cost')}
                </p>
              )}
            </div>
          ) : (
            <div className="px-4 pb-4 text-sm sv-dim">{t('dashboard.daily_error')}</div>
          )}
        </div>
      </div>

      {/* BOTONES */}
      <div className="px-5 pb-28 flex flex-col gap-5 sv-stagger-4">

        {/* CTA principal — full width, horizontal (imagen · título+subtítulo · flecha) */}
        <button
          onClick={() => navigate('/recipe-start')}
          disabled={limitReached}
          className="sv-btn sv-btn-primary w-full p-4"
          style={{ justifyContent: 'stretch', borderRadius: 'var(--sv-radius-md)' }}
        >
          <div className="flex items-center gap-3 w-full">
            <div className="w-16 h-16 flex items-center justify-center shrink-0">
              {limitReached
                ? <PixelLock className="w-12 h-12" />
                : <img src="/images/generate.png" alt="" className="w-16 h-16 object-contain" style={{ imageRendering: 'pixelated' }} />}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-lg font-bold leading-tight">{limitReached ? t('dashboard.limit_reached_title') : t('dashboard.generate_recipe')}</p>
              <p className="text-sm leading-snug" style={{ color: 'rgba(255,255,255,0.85)' }}>{t('dashboard.generate_subtitle')}</p>
            </div>
            <ChevronRight className="w-5 h-5 shrink-0" style={{ color: 'rgba(255,255,255,0.8)' }} />
          </div>
        </button>

        {/* Accesos secundarios — grid 2x2 horizontal (imagen · título+subtítulo · flecha) */}
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => navigate('/recipes-saved')}
            className="sv-glass sv-glass-hover p-3 flex items-center gap-2.5 text-left"
            style={{ border: '2px solid rgba(248,113,113,0.85)' }}
          >
            <img src="/images/saved.png" alt="" className="w-14 h-14 object-contain shrink-0" style={{ imageRendering: 'pixelated' }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold leading-tight">{t('dashboard.saved_recipes')}</p>
              <p className="sv-muted text-xs mt-0.5 leading-snug">{t('dashboard.card_sub_saved')}</p>
            </div>
            <ChevronRight className="w-4 h-4 sv-dim shrink-0" />
          </button>

          {/* DUELO DE COCINA */}
          <button
            onClick={() => navigate('/battle')}
            className="sv-glass sv-glass-hover p-3 flex items-center gap-2.5 text-left"
            style={{ border: '2px solid rgba(139,92,246,0.85)' }}
          >
            <img src="/images/battle.png" alt="" className="w-14 h-14 object-contain shrink-0" style={{ imageRendering: 'pixelated' }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold leading-tight">{t('dashboard.battle')}</p>
              {canBattle
                ? <p className="sv-muted text-xs mt-0.5 leading-snug">{t('dashboard.card_sub_battle')}</p>
                : <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(139,92,246,0.18)', color: 'var(--sv-clan-accent)' }}><PixelLock className="w-3 h-3" /> PRO</span>}
            </div>
            <ChevronRight className="w-4 h-4 sv-dim shrink-0" />
          </button>

          {/* 🥘 MI COCINA — despensa persistente (todos los planes) */}
          <button
            onClick={() => navigate('/kitchen')}
            className="sv-glass sv-glass-hover p-3 flex items-center gap-2.5 text-left"
            style={{ border: '2px solid rgba(56,189,248,0.85)' }}
          >
            <img src="/images/kitchen.png" alt="" className="w-14 h-14 object-contain shrink-0" style={{ imageRendering: 'pixelated' }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold leading-tight">{t('kitchen.dashboard_title')}</p>
              <p className="sv-muted text-xs mt-0.5 leading-snug">{t('dashboard.card_sub_kitchen')}</p>
            </div>
            <ChevronRight className="w-4 h-4 sv-dim shrink-0" />
          </button>

          {/* 🛒 MI MERCADO — lista de compras con precios (todos los planes) */}
          <button
            onClick={() => navigate('/market')}
            className="sv-glass sv-glass-hover p-3 flex items-center gap-2.5 text-left"
            style={{ border: '2px solid rgba(16,185,129,0.85)' }}
          >
            <div className="w-14 h-14 flex items-center justify-center shrink-0">
              <PixelBasket className="w-14 h-14" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold leading-tight">{t('market.dashboard_title')}</p>
              <p className="sv-muted text-xs mt-0.5 leading-snug">{t('dashboard.card_sub_market')}</p>
            </div>
            <ChevronRight className="w-4 h-4 sv-dim shrink-0" />
          </button>
        </div>

        {/* 🔥 CALORÍAS DE LA SEMANA — full width (Clanes se movió a la pastilla) */}
        {(() => {
          const goal = goalOf(goalKey)
          const goalKcal = personalGoal?.weeklyKcal ?? goal.kcal // personalizada > preset
          const total = weekly?.totalCalories ?? 0
          const pct = Math.min(1, total / goalKcal)
          const dailyGoal = goalKcal / 7
          const maxBar = Math.max(dailyGoal, ...(weekly?.perDay ?? [0]))
          const todayIndex = (new Date().getUTCDay() + 6) % 7
          const macros = [
            { key: 'protein', value: weekly?.protein ?? 0, color: 'var(--viz-protein)' },
            { key: 'carbs',   value: weekly?.carbs ?? 0,   color: 'var(--viz-carbs)' },
            { key: 'fat',     value: weekly?.fat ?? 0,     color: 'var(--viz-fat)' },
          ]
          const msgKey = total <= 0 ? 'start' : pct >= 1 ? 'done' : pct >= 0.5 ? 'close' : 'going'
          return (
            <div className="sv-glass p-4" style={{ border: '2px solid var(--sv-calories-accent)' }}>
              {/* Header: título + platos cocinados + chip de meta (abre el selector) */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 flex items-center justify-center shrink-0">
                  <PixelFlame className="w-11 h-11" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-bold leading-tight">{t('dashboard.calories_week_title')}</p>
                  <p className="sv-muted text-xs mt-0.5 leading-snug">
                    {weekly && weekly.mealsCount > 0
                      ? t('dashboard.calories_week_meals', { count: weekly.mealsCount })
                      : t('dashboard.calories_week_empty')}
                  </p>
                </div>
                <button
                  onClick={() => { setSheetMode('goals'); setShowGoalSheet(true) }}
                  className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-bold transition active:scale-95"
                  style={{ background: 'rgba(255,94,26,0.12)', color: 'var(--sv-primary)', border: '1px solid rgba(255,94,26,0.3)' }}
                >
                  <PixelTarget className="w-3.5 h-3.5" />
                  {t('dashboard.goal_chip', { defaultValue: 'Goal' })} · {goalKcal.toLocaleString()}
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Anillo de progreso + macros de la semana */}
              <div className="flex items-center gap-5 mt-4">
                <GoalRing value={total} goal={goalKcal} />
                <div className="flex-1 min-w-0 space-y-2.5">
                  <p className="text-xs font-semibold sv-dim">
                    {t(`dashboard.goals.${goal.key}.name`)} · {personalGoal
                      ? t('dashboard.goal_personalized', { kcal: personalGoal.perMealKcal })
                      : t('dashboard.goal_weekly', { kcal: goalKcal.toLocaleString() })}
                  </p>
                  {macros.map((m) => (
                    <div key={m.key} className="flex items-baseline justify-between gap-2">
                      <span className="flex items-center gap-1.5 sv-muted text-xs">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: m.color }} />
                        {t(`recipes.nutrition_${m.key}`)}
                      </span>
                      <span className="font-black text-sm leading-none">
                        {m.value}<span className="text-[10px] font-semibold ml-0.5">g</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Barras por día (L→D) con la línea de meta diaria */}
              <div className="relative mt-4">
                <div
                  className="absolute left-0 right-0 border-t border-dashed"
                  style={{ borderColor: 'var(--sv-border-strong)', top: `${(1 - dailyGoal / maxBar) * 44}px` }}
                />
                <div className="flex items-end gap-1.5" style={{ height: 44 }}>
                  {WEEK_LETTERS.map((letter, i) => {
                    const value = weekly?.perDay?.[i] ?? 0
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                        <div
                          className="w-full rounded-t-md transition-all duration-500"
                          style={{
                            height: value > 0 ? `${Math.max(12, (value / maxBar) * 100)}%` : 3,
                            background: value > 0 ? 'var(--viz-kcal)' : 'var(--viz-track)',
                            opacity: i === todayIndex ? 1 : 0.72,
                          }}
                        />
                      </div>
                    )
                  })}
                </div>
                <div className="flex gap-1.5 mt-1">
                  {WEEK_LETTERS.map((letter, i) => (
                    <span key={i} className="flex-1 text-center text-[9px] font-semibold leading-none" style={{ color: i === todayIndex ? 'var(--sv-primary)' : 'var(--sv-text-dim)' }}>
                      {letter}
                    </span>
                  ))}
                </div>
              </div>

              {/* Mensaje según progreso */}
              <div className="flex items-center gap-2.5 mt-3 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(255,94,26,0.08)', border: '1px solid rgba(255,94,26,0.18)' }}>
                <PixelSparkles className="w-4 h-4 shrink-0" />
                <p className="text-xs sv-muted leading-snug">{t(`dashboard.goal_msg.${msgKey}`)}</p>
              </div>
            </div>
          )
        })()}

      </div>

      </div>

      {/* Selector de objetivo nutricional (portal a body, estilo action-sheet) */}
      {showGoalSheet && createPortal(
        <div
          className="sv-pixel-font fixed inset-0 z-[70] flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => !savingGoal && setShowGoalSheet(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl p-4 pb-7 space-y-2 max-h-[85dvh] overflow-y-auto"
            style={{ background: 'var(--sv-bg-elevated)', borderTop: '1px solid var(--sv-border-light)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {sheetMode === 'goals' ? (
              <>
                <p className="text-center text-sm font-bold pb-1">{t('dashboard.goal_sheet_title')}</p>
                <p className="text-center text-xs sv-dim pb-2">
                  {personalGoal
                    ? t('dashboard.goal_sheet_personal_note', { tdee: personalGoal.tdee.toLocaleString() })
                    : t('dashboard.goal_sheet_subtitle')}
                </p>
                {NUTRITION_GOALS.map((g) => {
                  const Icon = g.icon
                  const active = g.key === goalKey
                  return (
                    <button
                      key={g.key}
                      onClick={() => handleSelectGoal(g.key)}
                      disabled={savingGoal}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition active:scale-[0.99] disabled:opacity-60 text-left"
                      style={active
                        ? { background: 'rgba(255,94,26,0.12)', border: '1px solid rgba(255,94,26,0.4)' }
                        : { background: 'var(--sv-bg-input)', border: '1px solid var(--sv-border-light)' }}
                    >
                      <div className="w-11 h-11 flex items-center justify-center shrink-0">
                        <Icon className="w-10 h-10" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{t(`dashboard.goals.${g.key}.name`)}</p>
                        <p className="text-xs sv-dim mt-0.5 leading-snug">{t(`dashboard.goals.${g.key}.desc`)}</p>
                      </div>
                      {!personalGoal && (
                        <div className="shrink-0 flex flex-col items-end gap-1">
                          <span className="text-sm font-black" style={{ color: 'var(--sv-primary)' }}>{g.kcal.toLocaleString()}</span>
                          <span className="text-[10px] sv-dim leading-none">kcal/{t('dashboard.goal_week_short')}</span>
                        </div>
                      )}
                      {active && <Check className="w-4 h-4 shrink-0" style={{ color: 'var(--sv-primary)' }} />}
                    </button>
                  )
                })}
                <button
                  onClick={() => setSheetMode('body')}
                  disabled={savingGoal}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition active:scale-[0.99] text-left"
                  style={{ background: 'rgba(255,94,26,0.08)', border: '1px dashed rgba(255,94,26,0.4)' }}
                >
                  <div className="w-11 h-11 flex items-center justify-center shrink-0">
                    <PixelTarget className="w-10 h-10" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm" style={{ color: 'var(--sv-primary)' }}>{t('dashboard.personalize_btn')}</p>
                    <p className="text-xs sv-dim mt-0.5 leading-snug">{t('dashboard.personalize_desc')}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--sv-primary)' }} />
                </button>
                <button
                  onClick={() => setShowGoalSheet(false)}
                  disabled={savingGoal}
                  className="w-full py-3 rounded-xl text-sm font-semibold sv-muted"
                  style={{ background: 'var(--sv-bg-input)' }}
                >
                  {t('common.cancel', { defaultValue: 'Cancel' })}
                </button>
              </>
            ) : (
              <>
                <p className="text-center text-sm font-bold pb-1">{t('dashboard.personal_title')}</p>
                <p className="text-center text-xs sv-dim pb-2">{t('dashboard.personal_subtitle')}</p>

                {/* Unidades: imperial (default US) ↔ métrico */}
                <div className="flex gap-2">
                  {(['imperial', 'metric'] as const).map((u) => (
                    <button
                      key={u}
                      onClick={() => switchUnits(u)}
                      className="flex-1 py-2 rounded-xl text-xs font-bold transition active:scale-[0.99]"
                      style={units === u
                        ? { background: 'rgba(255,94,26,0.12)', border: '1px solid rgba(255,94,26,0.4)', color: 'var(--sv-primary)' }
                        : { background: 'var(--sv-bg-input)', border: '1px solid var(--sv-border-light)', color: 'var(--sv-text-muted)' }}
                    >
                      {u === 'imperial' ? 'lb · ft' : 'kg · cm'}
                    </button>
                  ))}
                </div>

                {/* Peso / altura / edad (en las unidades elegidas) */}
                <div className={`grid gap-2 ${units === 'imperial' ? 'grid-cols-4' : 'grid-cols-3'}`}>
                  {(units === 'imperial'
                    ? ([
                        { key: 'weight', label: t('dashboard.personal_weight_lb'), placeholder: '155' },
                        { key: 'heightFt', label: t('dashboard.personal_height_ft'), placeholder: '5' },
                        { key: 'heightIn', label: t('dashboard.personal_height_in'), placeholder: '9' },
                        { key: 'age', label: t('dashboard.personal_age'), placeholder: '25' },
                      ] as const)
                    : ([
                        { key: 'weight', label: t('dashboard.personal_weight_kg'), placeholder: '70' },
                        { key: 'heightCm', label: t('dashboard.personal_height_cm'), placeholder: '175' },
                        { key: 'age', label: t('dashboard.personal_age'), placeholder: '25' },
                      ] as const)
                  ).map((f) => (
                    <label key={f.key} className="block">
                      <span className="text-[11px] font-semibold sv-dim">{f.label}</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={bodyForm[f.key]}
                        onChange={(e) => setBodyForm({ ...bodyForm, [f.key]: e.target.value })}
                        placeholder={f.placeholder}
                        className="mt-1 w-full px-3 py-2.5 rounded-xl text-sm font-semibold outline-none"
                        style={{ background: 'var(--sv-bg-input)', border: '1px solid var(--sv-border-light)', color: 'var(--sv-text-main)' }}
                      />
                    </label>
                  ))}
                </div>

                {/* Sexo (solo para la fórmula BMR) */}
                <div className="flex gap-2 pt-1">
                  {(['male', 'female'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setBodyForm({ ...bodyForm, sex: s })}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition active:scale-[0.99]"
                      style={bodyForm.sex === s
                        ? { background: 'rgba(255,94,26,0.12)', border: '1px solid rgba(255,94,26,0.4)', color: 'var(--sv-primary)' }
                        : { background: 'var(--sv-bg-input)', border: '1px solid var(--sv-border-light)', color: 'var(--sv-text-muted)' }}
                    >
                      {t(`dashboard.personal_sex_${s}`)}
                    </button>
                  ))}
                </div>

                {/* Actividad */}
                <p className="text-[11px] font-semibold sv-dim pt-1">{t('dashboard.personal_activity')}</p>
                <div className="grid grid-cols-4 gap-2">
                  {(['sedentary', 'light', 'moderate', 'high'] as const).map((a) => (
                    <button
                      key={a}
                      onClick={() => setBodyForm({ ...bodyForm, activityLevel: a })}
                      className="py-2 rounded-xl text-[11px] font-semibold transition active:scale-[0.99] leading-tight"
                      style={bodyForm.activityLevel === a
                        ? { background: 'rgba(255,94,26,0.12)', border: '1px solid rgba(255,94,26,0.4)', color: 'var(--sv-primary)' }
                        : { background: 'var(--sv-bg-input)', border: '1px solid var(--sv-border-light)', color: 'var(--sv-text-muted)' }}
                    >
                      {t(`dashboard.personal_activity_${a}`)}
                    </button>
                  ))}
                </div>

                {/* Platos por semana en Savora */}
                <p className="text-[11px] font-semibold sv-dim pt-1">{t('dashboard.personal_meals')}</p>
                <div className="grid grid-cols-5 gap-2">
                  {[3, 5, 7, 10, 14].map((n) => (
                    <button
                      key={n}
                      onClick={() => setBodyForm({ ...bodyForm, mealsPerWeek: n })}
                      className="py-2 rounded-xl text-sm font-bold transition active:scale-[0.99]"
                      style={bodyForm.mealsPerWeek === n
                        ? { background: 'rgba(255,94,26,0.12)', border: '1px solid rgba(255,94,26,0.4)', color: 'var(--sv-primary)' }
                        : { background: 'var(--sv-bg-input)', border: '1px solid var(--sv-border-light)', color: 'var(--sv-text-muted)' }}
                    >
                      {n}
                    </button>
                  ))}
                </div>

                <p className="text-[10px] sv-dim text-center leading-snug pt-1">{t('dashboard.personal_disclaimer')}</p>

                <button
                  onClick={handleSaveBody}
                  disabled={!bodyFormValid || savingGoal}
                  className="sv-btn sv-btn-primary w-full py-3 disabled:opacity-40"
                >
                  {savingGoal ? t('common.loading', { defaultValue: 'Loading...' }) : t('dashboard.personal_save')}
                </button>
                <button
                  onClick={() => setSheetMode('goals')}
                  disabled={savingGoal}
                  className="w-full py-3 rounded-xl text-sm font-semibold sv-muted"
                  style={{ background: 'var(--sv-bg-input)' }}
                >
                  {t('common.back', { defaultValue: 'Back' })}
                </button>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}