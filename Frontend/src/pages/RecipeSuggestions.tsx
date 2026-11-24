import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ChevronRight, Clock, ChefHat, Loader2, Sparkles, Swords, ShoppingCart, X, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Container from '../components/ui/Container'
import { analyzeFridge, getSuggestions, generateMarket } from '../services/api'

// Listado de recetas para ELEGIR (paso final del flujo guiado). Con ingredientes de la
// despensa → 6 sugerencias con faltantes (analyze-fridge); sin ingredientes → 4 genéricas
// (suggestions, gratis). Al elegir: si hay faltantes, se ofrece mandarlos al mercado
// (gratis, todos los planes), y siempre se navega a /recipes con prefillQuery → auto-genera
// y va al Modo Cocina.

interface Suggestion {
  title: string
  description: string
  difficulty?: string
  cookTime?: number
  missingIngredients?: string[]
}

export default function RecipeSuggestions() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()

  const timeAvailable: string | null = location.state?.timeAvailable ?? null
  const mealType: string | null = location.state?.mealType ?? null
  const ingredients: string[] = location.state?.ingredients ?? []
  const prefetched: Suggestion[] | undefined = location.state?.prefetched ?? undefined
  // Se puede llegar desde el flujo guiado (PantryCheck) o directo desde My Kitchen.
  const fromKitchen = location.state?.from === 'kitchen'

  const [suggestions, setSuggestions] = useState<Suggestion[]>(prefetched ?? [])
  const [loading, setLoading] = useState(!prefetched)
  const [error, setError] = useState('')
  // Bottom-sheet "añadir faltantes al mercado" al elegir una receta con faltantes.
  const [pendingPick, setPendingPick] = useState<Suggestion | null>(null)
  const [selectedMissing, setSelectedMissing] = useState<Set<string>>(new Set())
  const [addingToMarket, setAddingToMarket] = useState(false)
  const loadedRef = useRef(false)

  const loadSuggestions = async () => {
    setLoading(true)
    setError('')
    try {
      if (ingredients.length > 0) {
        // Sin mealType explícito (ej. desde My Kitchen) → franja según la hora del día.
        const h = new Date().getHours()
        const byHour = h >= 5 && h < 11 ? 'breakfast' : h >= 11 && h < 15 ? 'lunch' : h >= 15 && h < 18 ? 'snack' : 'dinner'
        const result: any = await analyzeFridge([], mealType ?? byHour, ingredients.join(', '))
        setSuggestions(result.suggestions ?? [])
      } else {
        const result: any = await getSuggestions(mealType)
        setSuggestions(result.suggestions ?? [])
      }
    } catch (err: any) {
      if (err.message === '401') { localStorage.removeItem('token'); navigate('/login') }
      else if (err.message === 'LIMIT_REACHED') setError(t('recipes.limit_reached'))
      else setError(t('suggestions.error_load'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    if (!prefetched) loadSuggestions()
  }, [])

  // Navega al generador: Recipes.tsx auto-genera con prefillQuery (consume 1 FREE) → cook mode.
  const goGenerate = (s: Suggestion) => {
    navigate('/recipes', {
      state: {
        timeAvailable,
        mealType,
        prefillQuery: s.title,
        fridgeContext: ingredients.length > 0 ? { title: s.title, ingredients } : undefined,
      },
    })
  }

  const handlePick = (s: Suggestion) => {
    const missing = s.missingIngredients ?? []
    if (missing.length > 0) {
      setPendingPick(s)
      setSelectedMissing(new Set(missing))
    } else {
      goGenerate(s)
    }
  }

  const toggleMissing = (ing: string) => {
    setSelectedMissing(prev => {
      const next = new Set(prev)
      if (next.has(ing)) next.delete(ing)
      else next.add(ing)
      return next
    })
  }

  const confirmMarketAndGenerate = async (addToMarket: boolean) => {
    const pick = pendingPick
    if (!pick) return
    if (addToMarket && selectedMissing.size > 0) {
      setAddingToMarket(true)
      try {
        await generateMarket([...selectedMissing].map(name => ({ name, recipeTitle: pick.title })))
      } catch { /* best-effort: no bloquear la generación de la receta */ }
      setAddingToMarket(false)
    }
    setPendingPick(null)
    goGenerate(pick)
  }

  const difficultyColor = (d?: string) => {
    if (d === 'easy' || d === 'fácil') return 'text-emerald-600 bg-emerald-50'
    if (d === 'hard' || d === 'avanzada') return 'text-red-600 bg-red-50'
    return 'text-orange-600 bg-orange-50'
  }

  return (
    <Container backButton backTo={fromKitchen ? '/kitchen' : '/pantry-check'} backState={fromKitchen ? undefined : { timeAvailable, mealType }}>
      <div className="space-y-5 pb-10">

        {/* HEADER */}
        <div>
          <h1 className="text-3xl font-black leading-tight">✨ {t('suggestions.title')}</h1>
          <p className="sv-muted mt-2 text-base">
            {ingredients.length > 0 ? t('suggestions.subtitle_pantry') : t('suggestions.subtitle_generic')}
          </p>
          {ingredients.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {ingredients.slice(0, 8).map((ing, i) => (
                <span key={i} className="px-2.5 py-0.5 rounded-full text-xs font-medium" style={{ background: 'rgba(16,185,129,0.12)', color: '#6EE7B7', border: '1px solid rgba(16,185,129,0.3)' }}>
                  {ing}
                </span>
              ))}
              {ingredients.length > 8 && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium sv-dim">
                  +{ingredients.length - 8}
                </span>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-xl px-4 py-3 text-sm text-center" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }}>
            {error}
          </div>
        )}

        {/* SKELETON */}
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="sv-glass-solid p-4 space-y-2">
                <div className="h-5 rounded-lg w-2/3 animate-pulse" style={{ background: 'var(--sv-bg-input)' }} />
                <div className="h-4 rounded w-full animate-pulse" style={{ background: 'var(--sv-bg-input)' }} />
                <div className="h-4 rounded w-1/3 animate-pulse" style={{ background: 'var(--sv-bg-input)' }} />
              </div>
            ))}
          </div>
        )}

        {/* LISTADO */}
        {!loading && suggestions.length > 0 && (
          <div className="space-y-3">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => handlePick(s)}
                className="sv-glass-solid sv-glass-hover w-full p-4 text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-base">{s.title}</p>
                    {s.description && <p className="text-sm sv-muted mt-0.5 leading-snug">{s.description}</p>}
                    {((s.cookTime ?? 0) > 0 || s.difficulty) && (
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {(s.cookTime ?? 0) > 0 && (
                          <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: 'rgba(255,94,26,0.12)', color: 'var(--sv-primary)' }}>
                            <Clock className="w-3 h-3" /> {s.cookTime} min
                          </span>
                        )}
                        {s.difficulty && (
                          <span className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${difficultyColor(s.difficulty)}`}>
                            <ChefHat className="w-3 h-3" /> {s.difficulty}
                          </span>
                        )}
                      </div>
                    )}
                    {(s.missingIngredients?.length ?? 0) > 0 && (
                      <p className="text-xs mt-2" style={{ color: '#FCD34D' }}>
                        🛒 {t('fridge.missing')}: {s.missingIngredients!.join(', ')}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="w-5 h-5 sv-dim shrink-0 mt-1" />
                </div>
              </button>
            ))}
          </div>
        )}

        {!loading && suggestions.length === 0 && !error && (
          <div className="text-center py-10 sv-muted text-sm">{t('suggestions.empty')}</div>
        )}

        {/* CTA: duelo con estos ingredientes */}
        {!loading && ingredients.length >= 2 && (
          <button
            onClick={() => navigate('/battle', { state: { ingredients, mealType } })}
            className="sv-glass sv-glass-hover w-full p-4 text-left flex items-center gap-3"
          >
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,94,26,0.15)' }}>
              <Swords className="w-5 h-5" style={{ color: 'var(--sv-primary)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold">{t('fridge.compete_title')}</p>
              <p className="text-xs sv-dim mt-0.5">{t('fridge.compete_subtitle')}</p>
            </div>
            <ChevronRight className="w-5 h-5 sv-dim shrink-0" />
          </button>
        )}

        {/* MÁS IDEAS */}
        {!loading && suggestions.length > 0 && (
          <div className="flex justify-center pt-1">
            <button onClick={loadSuggestions} className="flex items-center gap-2 text-sm font-semibold sv-muted rounded-full px-5 py-2.5 transition active:scale-95" style={{ border: '1px solid var(--sv-border-light)', background: 'var(--sv-bg-input)' }}>
              <Sparkles className="w-4 h-4" /> {t('suggestions.more_ideas')}
            </button>
          </div>
        )}

      </div>

      {/* BOTTOM-SHEET: añadir faltantes al mercado (PRO/CHEF) */}
      {pendingPick && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={() => setPendingPick(null)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl p-5 space-y-4" style={{ maxHeight: '70vh', overflowY: 'auto', background: 'var(--sv-bg-surface)', border: '1px solid var(--sv-border-light)' }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-lg flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5" style={{ color: 'var(--sv-primary)' }} />
                  {t('suggestions.add_missing_title')}
                </p>
                <p className="text-sm sv-muted mt-1">{t('suggestions.add_missing_subtitle', { recipe: pendingPick.title })}</p>
              </div>
              <button onClick={() => setPendingPick(null)} className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--sv-bg-input)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              {(pendingPick.missingIngredients ?? []).map((ing, i) => {
                const selected = selectedMissing.has(ing)
                return (
                  <button
                    key={i}
                    onClick={() => toggleMissing(ing)}
                    className="w-full flex items-center gap-3 p-3 rounded-2xl text-left transition active:scale-[0.99]"
                    style={{ border: `1px solid ${selected ? 'rgba(255,94,26,0.4)' : 'var(--sv-border-light)'}`, background: selected ? 'rgba(255,94,26,0.08)' : 'var(--sv-bg-input)' }}
                  >
                    <span className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ background: selected ? 'var(--sv-primary)' : 'var(--sv-bg-surface)', border: selected ? 'none' : '1px solid var(--sv-border-strong)' }}>
                      {selected && <Check className="w-3.5 h-3.5 text-white" />}
                    </span>
                    <span className="text-sm font-medium">{ing}</span>
                  </button>
                )
              })}
            </div>

            <div className="space-y-2 pt-1">
              <button
                onClick={() => confirmMarketAndGenerate(true)}
                disabled={addingToMarket || selectedMissing.size === 0}
                className="sv-btn sv-btn-primary w-full py-3.5"
              >
                {addingToMarket
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('suggestions.adding_to_market')}</>
                  : t('suggestions.add_and_cook', { count: selectedMissing.size })
                }
              </button>
              <button
                onClick={() => confirmMarketAndGenerate(false)}
                disabled={addingToMarket}
                className="w-full py-3 text-sm font-semibold sv-muted rounded-2xl transition active:scale-95"
                style={{ border: '1px solid var(--sv-border-light)', background: 'var(--sv-bg-input)' }}
              >
                {t('suggestions.just_cook')}
              </button>
            </div>
          </div>
        </>
      )}
    </Container>
  )
}
