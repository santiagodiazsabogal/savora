import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Clock, Utensils, Refrigerator, Sparkles, ArrowRight, ShoppingCart, Pencil } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Container from '../components/ui/Container'
import { getCachedProfile, getProfile } from '../services/api'
import { foodEmoji } from '../data/foods'

// Paso 3 del flujo guiado — ELECCIÓN de punto de partida (reemplaza la vieja pantalla de
// chips/fotos "qué tienes en casa"):
//   A) "Cook with what I have" → usa My Kitchen (User.pantry). Vacío → empuja a /kitchen.
//      Con ingredientes → RecipeSuggestions con ingredients=pantry (sugerencias factibles
//      + faltantes mínimos → sheet "add missing to market").
//   B) "Any recipe" → RecipeSuggestions con ingredients=[] (sugerencias libres; cada una
//      trae sus ingredientes clave → el mismo sheet ofrece mandarlos al mercado).
// Editar la despensa ya vive en My Kitchen; aquí solo se elige el camino.

const MEAL_EMOJIS: Record<string, string> = {
  breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍎',
  dessert: '🍰', drink: '🍹', cocktail: '🍸', surprise: '🎲',
}

export default function PantryCheck() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()

  const timeAvailable: string | null = location.state?.timeAvailable ?? null
  const mealType: string | null = location.state?.mealType ?? null

  const [pantry, setPantry] = useState<string[]>(() => {
    const c = getCachedProfile()
    return Array.isArray(c?.pantry) ? c.pantry : []
  })

  // Revalida la despensa en 2º plano (por si cambió desde otro dispositivo/pantalla).
  useEffect(() => {
    getProfile()
      .then(p => { if (Array.isArray(p?.pantry)) setPantry(p.pantry) })
      .catch(() => {})
  }, [])

  const hasPantry = pantry.length > 0

  const cookWithKitchen = () => {
    if (!hasPantry) { navigate('/kitchen'); return }
    navigate('/recipe-suggestions', {
      state: { timeAvailable, mealType, ingredients: pantry, mode: 'have' },
    })
  }

  const anyRecipe = () => {
    navigate('/recipe-suggestions', {
      state: { timeAvailable, mealType, ingredients: [], mode: 'shop' },
    })
  }

  return (
    <Container backButton backTo="/meal-type" backState={{ timeAvailable }}>
      <div className="space-y-6 pb-10">

        {/* HEADER */}
        <div>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5" style={{ background: 'rgba(255,94,26,0.15)' }}>
            <Utensils className="w-6 h-6" style={{ color: 'var(--sv-primary)' }} />
          </div>
          <h1 className="text-3xl font-black leading-tight">{t('pantry_check.q_title')}</h1>
          <p className="sv-muted mt-2 text-base">{t('pantry_check.q_subtitle')}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            {timeAvailable && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: 'rgba(255,94,26,0.12)', color: 'var(--sv-primary)', border: '1px solid rgba(255,94,26,0.25)' }}>
                <Clock className="w-3 h-3" /> {timeAvailable}
              </span>
            )}
            {mealType && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: 'rgba(255,94,26,0.12)', color: 'var(--sv-primary)', border: '1px solid rgba(255,94,26,0.25)' }}>
                <Utensils className="w-3 h-3" />
                {MEAL_EMOJIS[mealType]} {t(`meal_type.options.${mealType}`)}
              </span>
            )}
          </div>
        </div>

        {/* OPCIÓN A — cocinar con lo que hay en My Kitchen */}
        <button
          onClick={cookWithKitchen}
          className="sv-glass sv-glass-hover w-full p-5 text-left flex flex-col gap-3"
          style={{ border: '2px solid rgba(56,189,248,0.85)' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(56,189,248,0.15)' }}>
              <Refrigerator className="w-5 h-5" style={{ color: '#38BDF8' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold leading-tight">{t('pantry_check.have_title')}</p>
              <p className="sv-muted text-xs mt-0.5 leading-snug">{t('pantry_check.have_subtitle')}</p>
            </div>
            <ArrowRight className="w-5 h-5 sv-dim shrink-0" />
          </div>

          {hasPantry ? (
            <div>
              <div className="flex flex-wrap gap-1.5">
                {pantry.slice(0, 7).map((ing, i) => (
                  <span key={`${ing}-${i}`} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium" style={{ background: 'rgba(16,185,129,0.12)', color: '#6EE7B7', border: '1px solid rgba(16,185,129,0.3)' }}>
                    <span aria-hidden>{foodEmoji(ing)}</span> {ing}
                  </span>
                ))}
                {pantry.length > 7 && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium sv-dim">+{pantry.length - 7}</span>
                )}
              </div>
              <span
                onClick={(e) => { e.stopPropagation(); navigate('/kitchen') }}
                className="inline-flex items-center gap-1 text-[11px] font-semibold mt-2.5 sv-dim hover:opacity-100 opacity-80 transition"
              >
                <Pencil className="w-2.5 h-2.5" /> {t('pantry_check.have_edit')}
              </span>
            </div>
          ) : (
            <div className="rounded-xl px-3 py-3" style={{ border: '1px dashed var(--sv-border-strong)', background: 'var(--sv-bg-input)' }}>
              <p className="text-sm font-semibold">{t('pantry_check.have_empty')}</p>
              <p className="text-xs sv-dim mt-0.5">{t('pantry_check.have_empty_hint')}</p>
              <span className="inline-flex items-center gap-1 text-xs font-bold mt-2" style={{ color: '#38BDF8' }}>
                {t('pantry_check.have_setup')} <ArrowRight className="w-3 h-3" />
              </span>
            </div>
          )}
        </button>

        {/* OPCIÓN B — cualquier receta, faltantes al mercado */}
        <button
          onClick={anyRecipe}
          className="sv-glass sv-glass-hover w-full p-5 text-left flex flex-col gap-3"
          style={{ border: '2px solid rgba(255,94,26,0.85)' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,94,26,0.15)' }}>
              <Sparkles className="w-5 h-5" style={{ color: 'var(--sv-primary)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold leading-tight">{t('pantry_check.any_title')}</p>
              <p className="sv-muted text-xs mt-0.5 leading-snug">{t('pantry_check.any_subtitle')}</p>
            </div>
            <ArrowRight className="w-5 h-5 sv-dim shrink-0" />
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl" style={{ background: 'rgba(16,185,129,0.1)', color: '#34D399' }}>
            <ShoppingCart className="w-3.5 h-3.5 shrink-0" />
            {t('pantry_check.any_cta')}
          </div>
        </button>

      </div>
    </Container>
  )
}
