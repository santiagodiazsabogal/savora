import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { X, Sparkles, Loader2 } from 'lucide-react'

export interface MenuPreferences {
  focus: string
  cuisines: string[] // estilo de preparación / tipo de plato (no cocinas por país)
  maxCookTime: number | null
  includeIngredients: string
  avoidIngredients: string
  budget: string
  calorieGoal: string | null   // light | balanced | hearty | null (sin meta)
  nutritionGoals: string[]     // protein | low_carb | low_fat | low_sodium (componibles)
  servings: number | null      // 1 | 2 | 4 | null (sin preferencia)
}

// 'protein' salió del focus → ahora es un objetivo nutricional componible
const FOCUS = ['varied', 'healthy', 'budget', 'quick']
// Estilos de plato (mezcla de modo de preparación + tipo de plato), no cocinas por país.
const CUISINES = ['baked', 'grilled', 'bowls', 'salads', 'pasta', 'stews']
const TIMES: (number | null)[] = [15, 30, 45, null]
const CALORIE_GOALS: (string | null)[] = ['light', 'balanced', 'hearty', null]
const NUTRITION_GOALS = ['protein', 'low_carb', 'low_fat', 'low_sodium']
const SERVINGS: (number | null)[] = [1, 2, 4, null]
const BUDGET = ['economic', 'normal']
const MEALS = ['breakfast', 'lunch', 'dinner']

// Etiquetas por defecto (ES) por si falta la clave i18n
const FOCUS_ES: Record<string, string> = { varied: 'Variada', healthy: 'Saludable', budget: 'Económica', quick: 'Rápida' }
const CUISINE_ES: Record<string, string> = { baked: 'Al horno', grilled: 'A la parrilla', bowls: 'Bowls', salads: 'Ensaladas', pasta: 'Pastas', stews: 'Sopas y guisos' }
const CALORIE_ES: Record<string, string> = { light: 'Ligera (~400)', balanced: 'Balanceada (400–600)', hearty: 'Contundente (600+)', none: 'Sin meta' }
const NUTRITION_ES: Record<string, string> = { protein: 'Alta en proteína', low_carb: 'Baja en carbos', low_fat: 'Baja en grasa', low_sodium: 'Baja en sodio' }
const SERVINGS_ES: Record<string, string> = { '1': 'Solo yo', '2': '2 personas', '4': 'Familia (4)', none: 'Sin preferencia' }
const BUDGET_ES: Record<string, string> = { economic: 'Económico', normal: 'Normal' }
const MEAL_ES: Record<string, string> = { breakfast: 'Desayuno', lunch: 'Almuerzo', dinner: 'Cena' }

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3.5 py-2 rounded-full text-sm font-semibold transition active:scale-95"
      style={active
        ? { background: 'var(--sv-primary)', color: '#fff', boxShadow: '0 4px 14px var(--sv-primary-glow)' }
        : { background: 'var(--sv-bg-input)', border: '1px solid var(--sv-border-light)', color: 'var(--sv-text-muted)' }}
    >
      {children}
    </button>
  )
}

export default function MenuPreferencesSheet({
  open, initialPrefs, initialMeals, generating, error, onClose, onSubmit,
}: {
  open: boolean
  initialPrefs: MenuPreferences
  initialMeals: string[]
  generating: boolean
  error?: string
  onClose: () => void
  onSubmit: (prefs: MenuPreferences, meals: string[]) => void
}) {
  const { t } = useTranslation()
  const [prefs, setPrefs] = useState<MenuPreferences>(initialPrefs)
  const [meals, setMeals] = useState<string[]>(initialMeals)

  // Recargar defaults cada vez que se abre
  useEffect(() => {
    if (open) { setPrefs(initialPrefs); setMeals(initialMeals) }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null

  const toggleCuisine = (c: string) =>
    setPrefs(p => ({ ...p, cuisines: p.cuisines.includes(c) ? p.cuisines.filter(x => x !== c) : [...p.cuisines, c] }))
  const toggleNutritionGoal = (g: string) =>
    setPrefs(p => ({ ...p, nutritionGoals: (p.nutritionGoals ?? []).includes(g) ? (p.nutritionGoals ?? []).filter(x => x !== g) : [...(p.nutritionGoals ?? []), g] }))
  const toggleMeal = (m: string) =>
    setMeals(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])

  const focusLabel = (f: string) => t(`planner.focus_opts.${f}`, { defaultValue: FOCUS_ES[f] ?? f })
  const cuisineLabel = (c: string) => t(`planner.cuisine_opts.${c}`, { defaultValue: CUISINE_ES[c] ?? c })
  const calorieLabel = (c: string | null) => t(`planner.calorie_opts.${c ?? 'none'}`, { defaultValue: CALORIE_ES[c ?? 'none'] ?? String(c) })
  const nutritionLabel = (g: string) => t(`planner.nutrition_opts.${g}`, { defaultValue: NUTRITION_ES[g] ?? g })
  const servingsLabel = (s: number | null) => t(`planner.servings_opts.${s ?? 'none'}`, { defaultValue: SERVINGS_ES[String(s ?? 'none')] ?? String(s) })
  const budgetLabel = (b: string) => t(`planner.budget_opts.${b}`, { defaultValue: BUDGET_ES[b] ?? b })
  const mealLabel = (m: string) => t(`planner.meals.${m}`, { defaultValue: MEAL_ES[m] ?? m })
  const timeLabel = (v: number | null) => v === null ? t('planner.time_none', { defaultValue: 'Sin límite' }) : `≤ ${v} min`

  const canSubmit = meals.length > 0 && !generating

  // Portal a document.body: el sheet es `fixed`, pero el padre `.sv-page` tiene un `transform`
  // (animación de página) que reanclaría el `fixed` a ESE contenedor en vez del viewport → el
  // sheet no cubría la pantalla y el CTA fijo de la página se colaba por debajo. Igual que el CTA
  // y el overlay de generación del WeeklyPlanner, que ya se portalean por este mismo motivo.
  return createPortal(
    // h-[100dvh] (no inset-0): en iOS el `dvh` excluye la barra de Safari, así que items-end
    // ancla el sheet al borde VISIBLE → el botón ya no queda tapado por la UI del navegador.
    <div className="fixed inset-x-0 top-0 h-[100dvh] z-[70] flex items-end justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 sv-fade-in" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={generating ? undefined : onClose} />

      {/* Sheet — entra deslizando desde abajo; safe-area para el home indicator */}
      <div
        className="relative w-full max-w-md max-h-[88dvh] overflow-y-auto rounded-t-3xl p-5 sv-sheet-up"
        style={{ background: 'var(--sv-bg-base)', border: '1px solid var(--sv-border-light)', borderBottom: 'none', paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" style={{ color: 'var(--sv-primary)' }} />
            <h2 className="text-xl font-black">{t('planner.sheet_title', { defaultValue: 'Personaliza tu semana' })}</h2>
          </div>
          <button onClick={onClose} disabled={generating} className="p-1.5 rounded-lg sv-muted disabled:opacity-40">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="sv-dim text-xs mb-4">{t('planner.sheet_subtitle', { defaultValue: 'Tu dieta, alergias, nivel y tiempo del perfil ya se aplican.' })}</p>

        {/* Enfoque */}
        <Section title={t('planner.q_focus', { defaultValue: 'Enfoque de la semana' })}>
          <div className="flex flex-wrap gap-2">
            {FOCUS.map(f => <Chip key={f} active={prefs.focus === f} onClick={() => setPrefs(p => ({ ...p, focus: f }))}>{focusLabel(f)}</Chip>)}
          </div>
        </Section>

        {/* Meta de calorías por comida — se verifica en el panel de nutrición al preparar */}
        <Section title={t('planner.q_calories', { defaultValue: 'Meta de calorías por comida' })}>
          <div className="flex flex-wrap gap-2">
            {CALORIE_GOALS.map(c => (
              <Chip key={c ?? 'none'} active={(prefs.calorieGoal ?? null) === c} onClick={() => setPrefs(p => ({ ...p, calorieGoal: c }))}>
                {calorieLabel(c)}
              </Chip>
            ))}
          </div>
        </Section>

        {/* Objetivos nutricionales (componibles) */}
        <Section title={t('planner.q_nutrition', { defaultValue: 'Objetivos nutricionales' })}>
          <div className="flex flex-wrap gap-2">
            {NUTRITION_GOALS.map(g => (
              <Chip key={g} active={(prefs.nutritionGoals ?? []).includes(g)} onClick={() => toggleNutritionGoal(g)}>
                {nutritionLabel(g)}
              </Chip>
            ))}
          </div>
        </Section>

        {/* Cocinas */}
        <Section title={t('planner.q_cuisines', { defaultValue: 'Estilo de los platos' })}>
          <div className="flex flex-wrap gap-2">
            {CUISINES.map(c => <Chip key={c} active={prefs.cuisines.includes(c)} onClick={() => toggleCuisine(c)}>{cuisineLabel(c)}</Chip>)}
          </div>
        </Section>

        {/* Tiempo */}
        <Section title={t('planner.q_time', { defaultValue: 'Tiempo máx. por receta' })}>
          <div className="flex flex-wrap gap-2">
            {TIMES.map(v => <Chip key={String(v)} active={prefs.maxCookTime === v} onClick={() => setPrefs(p => ({ ...p, maxCookTime: v }))}>{timeLabel(v)}</Chip>)}
          </div>
        </Section>

        {/* Presupuesto */}
        <Section title={t('planner.q_budget', { defaultValue: 'Presupuesto' })}>
          <div className="flex flex-wrap gap-2">
            {BUDGET.map(b => <Chip key={b} active={prefs.budget === b} onClick={() => setPrefs(p => ({ ...p, budget: b }))}>{budgetLabel(b)}</Chip>)}
          </div>
        </Section>

        {/* Porciones — la receta preparada rinde para este nº de personas */}
        <Section title={t('planner.q_servings', { defaultValue: 'Cocinas para' })}>
          <div className="flex flex-wrap gap-2">
            {SERVINGS.map(s => (
              <Chip key={s ?? 'none'} active={(prefs.servings ?? null) === s} onClick={() => setPrefs(p => ({ ...p, servings: s }))}>
                {servingsLabel(s)}
              </Chip>
            ))}
          </div>
        </Section>

        {/* Franjas */}
        <Section title={t('planner.q_meals', { defaultValue: 'Comidas a planear' })}>
          <div className="flex flex-wrap gap-2">
            {MEALS.map(m => <Chip key={m} active={meals.includes(m)} onClick={() => toggleMeal(m)}>{mealLabel(m)}</Chip>)}
          </div>
        </Section>

        {/* Incluir / Evitar */}
        <Section title={t('planner.q_include', { defaultValue: 'Ingredientes a incluir' })}>
          <input
            value={prefs.includeIngredients}
            onChange={e => setPrefs(p => ({ ...p, includeIngredients: e.target.value }))}
            placeholder={t('planner.include_ph', { defaultValue: 'ej. pollo, arroz, espinaca' })}
            maxLength={200}
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{ background: 'var(--sv-bg-input)', border: '1px solid var(--sv-border-light)', color: 'var(--sv-text-main)' }}
          />
        </Section>
        <Section title={t('planner.q_avoid', { defaultValue: 'Ingredientes a evitar' })}>
          <input
            value={prefs.avoidIngredients}
            onChange={e => setPrefs(p => ({ ...p, avoidIngredients: e.target.value }))}
            placeholder={t('planner.avoid_ph', { defaultValue: 'ej. champiñones, cilantro' })}
            maxLength={200}
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{ background: 'var(--sv-bg-input)', border: '1px solid var(--sv-border-light)', color: 'var(--sv-text-main)' }}
          />
        </Section>

        {/* ERROR (visible dentro del sheet — antes quedaba oculto detrás de él) */}
        {error && (
          <div className="rounded-2xl px-4 py-3 mb-3 text-sm font-medium" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }}>
            {error}
          </div>
        )}

        {/* CTA */}
        <button
          onClick={() => onSubmit(prefs, meals)}
          disabled={!canSubmit}
          className="sv-btn sv-btn-primary w-full p-4 mt-2 disabled:opacity-60"
          style={{ borderRadius: 'var(--sv-radius-md)' }}
        >
          {generating
            ? <><Loader2 className="w-5 h-5 animate-spin" /> {t('planner.generating', { defaultValue: 'Creando tu menú...' })}</>
            : <><Sparkles className="w-5 h-5" /> {t('planner.generate_cta', { defaultValue: 'Generar Menú Semanal con IA' })}</>}
        </button>
        {meals.length === 0 && (
          <p className="text-xs text-center mt-2" style={{ color: '#FCA5A5' }}>{t('planner.need_meal', { defaultValue: 'Elige al menos una comida.' })}</p>
        )}
      </div>
    </div>,
    document.body,
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="text-sm font-bold mb-2">{title}</p>
      {children}
    </div>
  )
}
