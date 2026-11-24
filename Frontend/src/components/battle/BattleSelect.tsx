import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChefHat, Refrigerator, Swords, X, Plus, Loader2, Clock, ChevronRight, ArrowLeft, Carrot, UtensilsCrossed, Users, Camera } from 'lucide-react'
import type { JoinOptions } from '../../hooks/useBattle'
import { getBattleRecipeOptions, analyzeFridge } from '../../services/api'
import { compressImageToDataUrl } from '../../utils/image'

interface RecipeOption {
  id: string
  mealTime: string
  title: string
  description?: string | null
  ingredients: string[]
  tools: string[]
  difficulty?: string | null
  cookTime?: number | null
}

const MEAL_EMOJIS: Record<string, string> = {
  breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍎',
  dessert: '🍰', drink: '🍹', cocktail: '🍸', surprise: '🎲',
}

interface Props {
  // Pública → emparejar al instante; privada → crear la sala con código
  onSubmit: (opts: JoinOptions) => void
  joining: boolean
  initialIngredients?: string[]
  mealType?: string | null
  intent?: 'public' | 'private'
  onBack?: () => void
}

const chipStyle: React.CSSProperties = {
  background: 'rgba(16,185,129,0.12)', color: '#6EE7B7',
  border: '1px solid rgba(16,185,129,0.3)',
}

export default function BattleSelect({ onSubmit, joining, initialIngredients = [], mealType, intent = 'public', onBack }: Props) {
  const { t } = useTranslation()
  // Etiqueta del botón de acción según la intención (unir a match público vs crear sala privada)
  const submitLabelKey = intent === 'private' ? 'battle.create_room' : 'battle.find_match'
  // Si llegamos con ingredientes pre-cargados (desde el FridgeAnalyzer), saltamos directo a esa pantalla
  const [mode, setMode] = useState<'pick' | 'ingredients' | 'chef_options'>(initialIngredients.length >= 2 ? 'ingredients' : 'pick')
  const [ingredients, setIngredients] = useState<string[]>(initialIngredients)
  const [input, setInput] = useState('')

  // Análisis por foto (como el Fridge Analyzer): detecta ingredientes y los agrega
  const fileRef = useRef<HTMLInputElement>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState('')

  // Catálogo de recetas del chef
  const [options, setOptions] = useState<RecipeOption[]>([])
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [optionsError, setOptionsError] = useState('')

  useEffect(() => {
    if (mode !== 'chef_options' || options.length > 0) return
    let active = true
    setLoadingOptions(true)
    setOptionsError('')
    getBattleRecipeOptions()
      .then((data) => { if (active) setOptions(data.options ?? []) })
      .catch(() => { if (active) setOptionsError(t('battle.options_error')) })
      .finally(() => { if (active) setLoadingOptions(false) })
    return () => { active = false }
  }, [mode, options.length, t])

  // Normaliza un ingrediente (minúsculas, espacios colapsados, recortado).
  const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 40)

  // Agrega varios ingredientes de una, deduplicando contra los actuales.
  const addMany = (raw: string[]) => {
    setIngredients((prev) => {
      const seen = new Set(prev)
      const next = [...prev]
      for (const r of raw) {
        const v = normalize(r)
        if (v.length >= 2 && !seen.has(v)) { seen.add(v); next.push(v) }
      }
      return next
    })
  }

  // Del input de texto: parte por comas / saltos de línea / punto y coma → varios chips.
  const addFromInput = () => {
    if (!input.trim()) return
    addMany(input.split(/[,\n;]+/))
    setInput('')
  }

  const removeIngredient = (ing: string) => setIngredients((prev) => prev.filter((i) => i !== ing))

  // Foto → detecta ingredientes con visión (gpt-4o) y los agrega como chips.
  const handlePhoto = async (file?: File) => {
    if (!file) return
    setAnalyzing(true); setAnalyzeError('')
    try {
      const dataUrl = await compressImageToDataUrl(file)
      const base64 = dataUrl.split(',')[1] ?? ''
      const res: any = await analyzeFridge([base64], mealType ?? 'surprise')
      const detected: string[] = Array.isArray(res?.detectedIngredients) ? res.detectedIngredients : []
      if (detected.length === 0) setAnalyzeError(t('battle.analyze_empty'))
      else addMany(detected)
    } catch {
      setAnalyzeError(t('battle.analyze_error'))
    } finally {
      setAnalyzing(false)
      if (fileRef.current) fileRef.current.value = '' // permite re-subir la misma foto
    }
  }

  // ── Subpantalla: capturar ingredientes para el modo "con mis ingredientes" ──
  if (mode === 'ingredients') {
    const canStart = ingredients.length >= 2
    return (
      <div className="space-y-5 sv-stagger-1">
        <div>
          <h2 className="text-xl font-bold">{t('battle.ingredients_title')}</h2>
          <p className="sv-muted text-sm mt-1">{t('battle.ingredients_subtitle')}</p>
        </div>

        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFromInput() } }}
            placeholder={t('battle.ingredients_placeholder')}
            maxLength={200}
            className="sv-input"
            style={{ paddingLeft: 16 }}
          />
          <button
            onClick={addFromInput}
            disabled={input.trim().length < 2}
            className="sv-btn sv-btn-primary shrink-0"
            style={{ width: 48, height: 48 }}
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs sv-dim -mt-2">{t('battle.ingredients_multi_hint')}</p>

        {/* Análisis por foto (como el Fridge Analyzer) */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handlePhoto(e.target.files?.[0])}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={analyzing}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold transition active:scale-[0.99] disabled:opacity-60"
          style={{ background: 'var(--sv-bg-surface)', border: '1px dashed var(--sv-border-strong)', color: 'var(--sv-text-muted)' }}
        >
          {analyzing
            ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('battle.analyzing')}</>
            : <><Camera className="w-4 h-4" style={{ color: 'var(--sv-primary)' }} /> {t('battle.analyze_photo')}</>}
        </button>

        {analyzeError && <p className="text-xs text-center" style={{ color: '#FCA5A5' }}>{analyzeError}</p>}

        {ingredients.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {ingredients.map((ing) => (
              <span key={ing} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium" style={chipStyle}>
                {ing}
                <button onClick={() => removeIngredient(ing)} className="hover:opacity-70 transition">
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        <p className="text-xs sv-dim">{t('battle.ingredients_min_hint')}</p>

        <div className="flex gap-3 pt-2">
          <button onClick={() => setMode('pick')} className="sv-btn sv-btn-glass px-5 py-3.5">
            {t('common.back')}
          </button>
          <button
            onClick={() => onSubmit({ mode: 'my_ingredients', ingredients, mealTime: mealType ?? undefined })}
            disabled={!canStart || joining}
            className="sv-btn sv-btn-primary flex-1 py-3.5"
          >
            {joining ? <Loader2 className="w-5 h-5 animate-spin" /> : <Swords className="w-5 h-5" />}
            {t(submitLabelKey)}
          </button>
        </div>
      </div>
    )
  }

  // ── Subpantalla: catálogo de recetas del chef ──
  if (mode === 'chef_options') {
    return (
      <ChefOptions
        t={t}
        options={options}
        loading={loadingOptions}
        error={optionsError}
        joining={joining}
        submitLabelKey={submitLabelKey}
        onPick={(id) => onSubmit({ mode: 'chef_choice', recipeOptionId: id })}
        onBack={() => setMode('pick')}
      />
    )
  }

  // ── Pantalla principal: elegir modo ──
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 sv-stagger-1">
        {onBack ? (
          <button onClick={onBack} className="sv-btn sv-btn-glass shrink-0" style={{ width: 36, height: 36, borderRadius: '50%', padding: 0 }}>
            <ArrowLeft className="w-4 h-4" />
          </button>
        ) : (
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(255,94,26,0.15)' }}>
            <Swords className="w-6 h-6" style={{ color: 'var(--sv-primary)' }} />
          </div>
        )}
        <div>
          <h1 className="text-2xl font-black">{t('battle.title')}</h1>
          <p className="sv-muted text-sm">{t('battle.subtitle')}</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Modo: con mis ingredientes */}
        <button
          onClick={() => setMode('ingredients')}
          disabled={joining}
          className="sv-glass sv-glass-hover sv-stagger-2 w-full p-6 text-left"
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,94,26,0.15)' }}>
              <Refrigerator className="w-7 h-7" style={{ color: 'var(--sv-primary)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xl font-bold">{t('battle.mode_ingredients_title')}</p>
              <p className="sv-muted text-sm mt-0.5">{t('battle.mode_ingredients_subtitle')}</p>
            </div>
          </div>
        </button>

        {/* Modo: receta del chef */}
        <button
          onClick={() => setMode('chef_options')}
          disabled={joining}
          className="sv-btn sv-btn-primary sv-stagger-3 w-full p-6"
          style={{ borderRadius: 'var(--sv-radius-md)' }}
        >
          <div className="flex items-center gap-4 w-full">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.2)' }}>
              <ChefHat className="w-7 h-7" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-xl font-bold">{t('battle.mode_chef_title')}</p>
              <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.85)' }}>{t('battle.mode_chef_subtitle')}</p>
            </div>
          </div>
        </button>

        {/* Modos extra solo en partida privada: Buffet y Equipos */}
        {intent === 'private' && (
          <>
            <button
              onClick={() => onSubmit({ mode: 'buffet', mealTime: mealType ?? undefined })}
              disabled={joining}
              className="sv-glass sv-glass-hover sv-stagger-4 w-full p-6 text-left"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(232,137,12,0.15)' }}>
                  <UtensilsCrossed className="w-7 h-7" style={{ color: 'var(--sv-warning)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xl font-bold">{t('battle.mode_buffet_title')}</p>
                  <p className="sv-muted text-sm mt-0.5">{t('battle.mode_buffet_subtitle')}</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => onSubmit({ mode: 'teams' })}
              disabled={joining}
              className="sv-glass sv-glass-hover sv-stagger-5 w-full p-6 text-left"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(139,92,246,0.18)' }}>
                  <Users className="w-7 h-7" style={{ color: 'var(--sv-clan-accent)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xl font-bold">{t('battle.mode_teams_title')}</p>
                  <p className="sv-muted text-sm mt-0.5">{t('battle.mode_teams_subtitle')}</p>
                </div>
              </div>
            </button>
          </>
        )}
      </div>

      <p className="text-center text-xs sv-dim pt-2">{t('battle.players_hint')}</p>
    </div>
  )
}

function ChefOptions({
  t, options, loading, error, joining, submitLabelKey, onPick, onBack,
}: {
  t: any
  options: RecipeOption[]
  loading: boolean
  error: string
  joining: boolean
  submitLabelKey: string
  onPick: (id: string) => void
  onBack: () => void
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 sv-stagger-1">
        <button onClick={onBack} className="sv-btn sv-btn-glass shrink-0" style={{ width: 36, height: 36, borderRadius: '50%', padding: 0 }}>
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-2xl font-black">{t('battle.chef_options_title')}</h1>
          <p className="sv-muted text-sm">{t('battle.chef_options_subtitle')}</p>
        </div>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--sv-primary)' }} />
          <p className="sv-muted text-sm">{t('battle.loading_options')}</p>
        </div>
      )}

      {error && !loading && <p className="text-sm text-center py-6" style={{ color: '#FCA5A5' }}>{error}</p>}

      {!loading && !error && options.map((opt, i) => (
        <div key={opt.id} className={`sv-glass p-5 space-y-3 sv-stagger-${Math.min(6, i + 2)}`}>
          <div>
            <p className="font-bold leading-snug">{opt.title}</p>
            {opt.description && <p className="text-sm sv-muted mt-0.5 leading-snug">{opt.description}</p>}
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="sv-badge sv-badge-primary" style={{ textTransform: 'none', letterSpacing: 0 }}>
              {MEAL_EMOJIS[opt.mealTime] ?? '🍽️'} {t(`meal_type.options.${opt.mealTime}`)}
            </span>
            {typeof opt.cookTime === 'number' && (
              <span className="sv-badge sv-badge-primary" style={{ textTransform: 'none', letterSpacing: 0 }}>
                <Clock className="w-3 h-3" /> {opt.cookTime} min
              </span>
            )}
          </div>

          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold sv-dim uppercase tracking-wider mb-1.5">
              <Carrot className="w-3.5 h-3.5" style={{ color: 'var(--sv-primary)' }} /> {t('battle.get_ingredients')}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {opt.ingredients.map((ing, j) => (
                <span key={j} className="px-2.5 py-0.5 rounded-full text-xs" style={{ background: 'rgba(255,94,26,0.1)', color: 'var(--sv-primary)', border: '1px solid rgba(255,94,26,0.2)' }}>
                  {ing}
                </span>
              ))}
            </div>
          </div>

          <button
            onClick={() => onPick(opt.id)}
            disabled={joining}
            className="sv-btn sv-btn-primary w-full py-3 mt-1"
          >
            {joining ? <Loader2 className="w-5 h-5 animate-spin" /> : <Swords className="w-5 h-5" />}
            {t(submitLabelKey === 'battle.find_match' ? 'battle.compete_in_this' : submitLabelKey)}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
