import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Clock, ChefHat, Heart, Utensils, Sparkles, MessageCircle, X, ChevronRight, Send, ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import RecipeCard from '../components/recipes/RecipeCard'
import LoadingScreen from '../components/ui/LoadingScreen'
import { generateRecipe, getUserRecipes, getRecipeById, getUserFolders, getSuggestions } from '../services/api'

const RECIPE_CTX_KEY = 'savora_recipe_ctx'

const MEAL_EMOJIS: Record<string, string> = {
  breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍎',
  dessert: '🍰', drink: '🍹', cocktail: '🍸', surprise: '🎲',
}

interface Suggestion { title: string; description: string }


export default function Recipes() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // time/meal vienen del wizard (location.state) y se persisten para sobrevivir a recargas
  // de la página — si no, location.state se pierde al refrescar y los chips desaparecían.
  const [{ timeAvailable, mealType }] = useState<{ timeAvailable: string | null; mealType: string | null }>(() => {
    // Camino directo ("Got something in mind?"): sin tiempo/franja — pisa el contexto
    // guardado para que no se cuelen chips de una corrida guiada anterior.
    if (location.state?.direct) {
      try { sessionStorage.setItem(RECIPE_CTX_KEY, JSON.stringify({ timeAvailable: null, mealType: null })) } catch {}
      return { timeAvailable: null, mealType: null }
    }
    const stTime = location.state?.timeAvailable ?? null
    const stMeal = location.state?.mealType ?? null
    if (stTime || stMeal) {
      try { sessionStorage.setItem(RECIPE_CTX_KEY, JSON.stringify({ timeAvailable: stTime, mealType: stMeal })) } catch {}
      return { timeAvailable: stTime, mealType: stMeal }
    }
    try {
      const saved = JSON.parse(sessionStorage.getItem(RECIPE_CTX_KEY) || '{}')
      return { timeAvailable: saved.timeAvailable ?? null, mealType: saved.mealType ?? null }
    } catch { return { timeAvailable: null, mealType: null } }
  })
  const prefillQuery: string | null = location.state?.prefillQuery ?? null
  const fridgeContext: any = location.state?.fridgeContext ?? null
  // Camino directo ("Got something in mind?"): solo el chat del chef con la barra
  // de texto — sin sugerencias (ni su llamada a la API).
  const direct: boolean = Boolean(location.state?.direct)

  const [query, setQuery] = useState('')
  const [recipe, setRecipe] = useState<any>(null)
  const [conversationId, setConversationId] = useState<number | null>(null)
  const [recipeId, setRecipeId] = useState<number | null>(null)
  const [isFavorite, setIsFavorite] = useState(false)
  const [folderId, setFolderId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [recentRecipes, setRecentRecipes] = useState<any[]>([])
  const [folders, setFolders] = useState<any[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [showHistory, setShowHistory] = useState(false)

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [query])

  // Camino directo: enfocar la barra al entrar → queda listo para escribirle al chef
  useEffect(() => {
    if (direct && !initialLoading) textareaRef.current?.focus()
  }, [initialLoading])

  useEffect(() => {
    async function loadAll() {
      try {
        const [recipesData, foldersData, suggestionsData] = await Promise.all([
          getUserRecipes(),
          getUserFolders(),
          direct ? Promise.resolve({ suggestions: [] }) : getSuggestions(mealType).catch(() => ({ suggestions: [] })),
        ])
        setRecentRecipes(recipesData.slice(0, 15))
        setFolders(foldersData)
        if (suggestionsData.suggestions?.length > 0) {
          const recentTitles = new Set(recipesData.slice(0, 10).map((r: any) => r.title.toLowerCase().trim()))
          const final = (suggestionsData.suggestions as Suggestion[]).filter(
            s => !recentTitles.has(s.title.toLowerCase().trim())
          )
          setSuggestions(final)
        }
      } catch (err: any) {
        if (err.message === '401') { localStorage.removeItem('token'); navigate('/login') }
      } finally {
        setInitialLoading(false)
      }
    }

    loadAll()
    if (prefillQuery) {
      // Consumir el state UNA sola vez: si no, volver atrás desde el Modo Cocina (o recargar)
      // re-montaría esta página con el mismo prefillQuery y generaría otra receta (gasta límite).
      navigate(location.pathname, { replace: true, state: {} })
      if (fridgeContext) handleGenerateFromFridge(prefillQuery, fridgeContext)
      else handleGenerate(prefillQuery)
    }
  }, [])

  const buildMessage = (q: string) => {
    const parts = [q]
    if (mealType && mealType !== 'surprise') parts.push(`(meal type: ${mealType})`)
    if (timeAvailable) parts.push(`(available time: ${timeAvailable})`)
    if (fridgeContext?.ingredients?.length > 0) parts.push(`(use these ingredients: ${fridgeContext.ingredients.join(', ')})`)
    return parts.join(' ')
  }

  const handleGenerateFromFridge = async (q: string, ctx: any) => {
    setLoading(true); setError('')
    try {
      const message = [q, mealType && mealType !== 'surprise' ? `(meal type: ${mealType})` : '', timeAvailable ? `(available time: ${timeAvailable})` : '', ctx?.ingredients?.length > 0 ? `(use these ingredients: ${ctx.ingredients.join(', ')})` : ''].filter(Boolean).join(' ')
      const res = await generateRecipe(message)
      // Directo a Modo Cocina: nos saltamos la tarjeta resumen para recetas recién generadas.
      navigate(`/recipes/${res.recipeId}/cook`)
    } catch (err: any) { handleError(err); setLoading(false) }
  }

  const handleError = (err: any) => {
    if (err.message === '401') { localStorage.removeItem('token'); navigate('/login') }
    else if (err.message === 'LIMIT_REACHED') setError(t('recipes.limit_reached'))
    else if (err.message === 'NOT_FOOD_RELATED') setError('🍽️ ' + t('recipes.error_not_food'))
    else if (err.message === 'MEAL_TYPE_MISMATCH') {
      const section = mealType ? t(`meal_type.options.${mealType}`) : t('meal_type.title')
      setError('🚫 ' + t('recipes.error_meal_mismatch', { section }))
    }
    else setError(t('recipes.error_generic'))
  }

  const handleGenerate = async (q?: string) => {
    const input = (q ?? query).trim()
    if (!input || input.length < 3) { if (!q) setError('✏️ ' + t('recipes.error_too_short')); return }
    setLoading(true); setError(''); setQuery('')
    try {
      const res = await generateRecipe(buildMessage(input))
      // Directo a Modo Cocina: nos saltamos la tarjeta resumen para recetas recién generadas.
      navigate(`/recipes/${res.recipeId}/cook`)
    } catch (err: any) { handleError(err); setLoading(false) }
  }

  const handleLoadRecent = async (id: number) => {
    setShowHistory(false); setLoading(true); setError(''); setRecipe(null)
    try {
      const data = await getRecipeById(id)
      setRecipe({ title: data.title, description: data.description ?? null, ingredients: data.ingredients, tools: data.tools, steps: data.steps, stepTips: data.stepTips ?? [], nutrition: data.nutrition ?? null, difficulty: data.difficulty, cookTime: data.cookTime, tip: data.tip ?? null })
      setRecipeId(data.id); setConversationId(data.conversationId); setIsFavorite(data.isFavorite ?? false); setFolderId(data.folderId ?? null)
    } catch { setError(t('recipes.error_generic')) }
    finally { setLoading(false) }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate() }
  }

  if (initialLoading || loading) return <LoadingScreen />

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden bg-transparent" style={{ position: 'relative', zIndex: 1 }}>
      {/* ── CONTENIDO SCROLLABLE ── */}
      <div className="flex-1 overflow-y-auto pb-28">

        {/* Top — back arriba, 💬 debajo con más espacio */}
        <div className="flex flex-col items-start gap-4 px-5 pt-14 pb-2">
          <button
            onClick={() => navigate(direct ? '/recipe-start' : '/dashboard')}
            className="w-10 h-10 flex items-center justify-center rounded-2xl transition active:scale-95"
            style={{ background: 'var(--sv-bg-surface)', border: '1px solid var(--sv-border-light)' }}
          >
            <ArrowLeft className="w-5 h-5 sv-muted" />
          </button>

          {/* 💬 debajo con gap más amplio */}
          <button
            onClick={() => setShowHistory(true)}
            className="w-10 h-10 flex items-center justify-center rounded-2xl transition active:scale-95 relative"
            style={{ background: 'var(--sv-bg-surface)', border: '1px solid var(--sv-border-light)' }}
          >
            <MessageCircle className="w-5 h-5" style={{ color: 'var(--sv-primary)' }} />
            {recentRecipes.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-white text-[10px] font-bold flex items-center justify-center" style={{ background: 'var(--sv-primary)' }}>
                {recentRecipes.length > 9 ? '9+' : recentRecipes.length}
              </span>
            )}
          </button>
        </div>

        {/* Título */}
        <div className="text-center px-5 pt-1 pb-5">
          <h1 className="text-4xl font-black leading-tight">
            {t('recipes.title')}
          </h1>
          <div className="flex flex-wrap gap-2 justify-center mt-3">
            {timeAvailable && (
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full" style={{ background: 'rgba(255,94,26,0.12)', color: 'var(--sv-primary)', border: '1px solid rgba(255,94,26,0.25)' }}>
                <Clock className="w-3.5 h-3.5" /> {timeAvailable}
              </span>
            )}
            {mealType && (
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full" style={{ background: 'rgba(255,94,26,0.12)', color: 'var(--sv-primary)', border: '1px solid rgba(255,94,26,0.25)' }}>
                <Utensils className="w-3.5 h-3.5" />
                {MEAL_EMOJIS[mealType]} {t(`meal_type.options.${mealType}`)}
              </span>
            )}
          </div>
        </div>

        {/* ERROR */}
        {error && (
          <div className="mx-5 mb-4 rounded-2xl px-4 py-3 text-sm text-center" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }}>
            {error}
          </div>
        )}

        {/* RECETA */}
        {recipe && (
          <div className="mx-5 space-y-3">
            <RecipeCard recipe={recipe} conversationId={conversationId} recipeId={recipeId ?? undefined} isFavorite={isFavorite} folderId={folderId} folders={folders} />
            <button
              onClick={() => navigate('/pantry-check', { state: { timeAvailable, mealType } })}
              className="w-full flex items-center justify-center text-sm font-semibold rounded-full px-6 py-2.5 transition-opacity active:scale-95"
              style={{ color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.30)', background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)' }}
            >
              ← {t('recipes.new_recipe', { defaultValue: 'New recipe' })}
            </button>
          </div>
        )}

        {/* SUGERENCIAS */}
        {!recipe && !loading && suggestions.length > 0 && (
          <div className="px-5 space-y-3">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--sv-primary)' }} />
              <p className="text-xs font-bold sv-dim uppercase tracking-wider">{t('recipes.quick_label')}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => handleGenerate(s.title)}
                  disabled={loading}
                  className="sv-glass sv-glass-hover flex flex-col gap-1 px-3 py-3 text-left"
                >
                  <span className="text-sm font-bold leading-snug">{s.title}</span>
                  {s.description && <span className="text-xs sv-dim leading-snug line-clamp-2">{s.description}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* ── BARRA FLOTANTE — solo cuando no hay receta activa ── */}
      {!recipe && <div className="fixed bottom-10 left-4 right-4 z-30" style={{ maxWidth: 448, margin: '0 auto' }}>
        <div className="sv-glass flex items-end gap-2 px-3 py-2.5" style={{ borderRadius: 28 }}>
          <textarea
            ref={textareaRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('recipes.search_placeholder_short', { defaultValue: 'What are we cooking today?' })}
            rows={1}
            className="flex-1 bg-transparent text-sm outline-none resize-none overflow-hidden leading-relaxed px-1 pt-0.5"
            style={{ minHeight: '36px', maxHeight: '100px', color: 'var(--sv-text-main)' }}
          />
          <button
            onClick={() => handleGenerate()}
            disabled={loading || !query.trim()}
            className="sv-btn sv-btn-primary w-10 h-10 shrink-0"
            style={{ borderRadius: 16 }}
          >
            {loading
              ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Send className="w-3.5 h-3.5 text-white" />
            }
          </button>
        </div>
      </div>}

      {/* ── DRAWER IZQUIERDA ── */}
      {showHistory && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={() => setShowHistory(false)} />
          <div
            className="fixed top-0 left-0 bottom-0 z-50 flex flex-col"
            style={{ width: '80vw', maxWidth: '320px', animation: 'slideInLeft 0.25s ease-out', background: '#0E0B14', borderRight: '1px solid var(--sv-border-light)' }}
          >
            <div className="flex items-center justify-between px-5 pt-14 pb-4" style={{ borderBottom: '1px solid var(--sv-border-light)' }}>
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5" style={{ color: 'var(--sv-primary)' }} />
                <h3 className="font-bold">{t('recipes.recent')}</h3>
              </div>
              <button onClick={() => setShowHistory(false)} className="sv-menu-item p-1.5 rounded-xl transition">
                <X className="w-4 h-4 sv-dim" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {recentRecipes.length === 0 ? (
                <div className="text-center py-12 sv-dim text-sm">{t('recipes.no_recent')}</div>
              ) : (
                recentRecipes.map(r => (
                  <button
                    key={r.id}
                    onClick={() => handleLoadRecent(r.id)}
                    className="sv-glass sv-glass-hover w-full p-3.5 flex items-center gap-3 text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{r.title}</p>
                      <div className="flex gap-3 mt-0.5">
                        {r.cookTime && <span className="flex items-center gap-1 text-xs sv-dim"><Clock className="w-3 h-3" /> {r.cookTime} min</span>}
                        {r.difficulty && <span className="flex items-center gap-1 text-xs sv-dim"><ChefHat className="w-3 h-3" /> {t(`recipes.difficulty.${r.difficulty}`, { defaultValue: r.difficulty })}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {r.isFavorite && <Heart className="w-4 h-4" style={{ fill: '#F87171', color: '#F87171' }} />}
                      <ChevronRight className="w-4 h-4 sv-dim" />
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
          <style>{`
            @keyframes slideInLeft {
              from { transform: translateX(-100%); }
              to   { transform: translateX(0); }
            }
          `}</style>
        </>
      )}

    </div>
  )
}