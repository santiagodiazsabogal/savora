import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Clock, ChefHat, UtensilsCrossed,
  Carrot, Heart, MessageCircle, FolderOpen, X, Check, Flame
} from 'lucide-react'
import { toggleFavorite, moveRecipeToFolder } from '../../services/api'

export interface Nutrition {
  servings: number
  calories: number
  protein: number
  carbs: number
  fat: number
  // micros en mg (recetas previas a este cambio no los traen → fila oculta)
  vitaminC?: number | null
  calcium?: number | null
  iron?: number | null
  sodium?: number | null
}

interface Recipe {
  title: string
  description?: string
  cookTime: number
  difficulty: string
  ingredients: string[]
  tools: string[]
  steps: string[]
  stepTips?: (string | null)[]   // un tip por paso, alineado por índice
  tip?: string | null            // tip general (recetas antiguas, fallback)
  nutrition?: Nutrition | null   // por porción (recetas antiguas no la traen → se oculta)
}

interface Folder {
  id: number
  name: string
}

interface Props {
  recipe: Recipe
  conversationId?: number | null
  recipeId?: number
  isFavorite?: boolean
  folderId?: number | null
  folders?: Folder[]          // carpetas disponibles para mover
  onFolderMoved?: (folderId: number | null) => void
}

export default function RecipeCard({
  recipe,
  conversationId,
  recipeId,
  isFavorite: initialFavorite = false,
  folderId: initialFolderId = null,
  folders = [],
  onFolderMoved,
}: Props) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [favorite, setFavorite] = useState(initialFavorite)
  const [savingFav, setSavingFav] = useState(false)
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(initialFolderId)
  const [showFolderPicker, setShowFolderPicker] = useState(false)
  const [movingFolder, setMovingFolder] = useState(false)

  const handleToggleFavorite = async () => {
    if (!recipeId) return
    setSavingFav(true)
    try {
      const res = await toggleFavorite(recipeId)
      setFavorite(res.isFavorite)
    } catch (err) {
      console.error(err)
    } finally {
      setSavingFav(false)
    }
  }

  const handleMoveToFolder = async (folderId: number | null) => {
    if (!recipeId) return
    setMovingFolder(true)
    try {
      await moveRecipeToFolder(recipeId, folderId)
      setCurrentFolderId(folderId)
      onFolderMoved?.(folderId)
      setShowFolderPicker(false)
    } catch (err) {
      console.error(err)
    } finally {
      setMovingFolder(false)
    }
  }

  const currentFolderName = folders.find(f => f.id === currentFolderId)?.name

  return (
    <div className="sv-glass overflow-hidden">

      {/* ── HEADER ─────────────────────────────────────────── */}
      <div className="p-5 sm:p-6 space-y-3" style={{ background: 'rgba(255,94,26,0.08)', borderBottom: '1px solid var(--sv-border-light)' }}>
        <h2 className="text-2xl sm:text-3xl font-black leading-tight">
          {recipe.title}
        </h2>

        {recipe.description && (
          <p className="sv-muted text-base">{recipe.description}</p>
        )}

        <div className="flex gap-3 flex-wrap">
          <Chip icon={<Clock className="w-4 h-4" />} label={`${recipe.cookTime} min`} />
          <Chip icon={<ChefHat className="w-4 h-4" />} label={t(`recipes.difficulty.${recipe.difficulty}`, recipe.difficulty)} />
          {recipe.nutrition && (
            <Chip icon={<Flame className="w-4 h-4" />} label={`${recipe.nutrition.calories} kcal`} />
          )}
        </div>
      </div>

      {/* ── CONTENT ────────────────────────────────────────── */}
      <div className="p-5 sm:p-6 space-y-8">

        {recipe.nutrition && (
          <Section icon={<Flame />} title={t('recipes.nutrition')}>
            <p className="sv-dim text-sm mb-4">
              {t('recipes.nutrition_per_serving', { count: recipe.nutrition.servings })}
            </p>
            <NutritionPanel nutrition={recipe.nutrition} />
          </Section>
        )}

        <Section icon={<Carrot />} title={t('recipes.ingredients')}>
          <ul className="grid gap-3 sm:grid-cols-2">
            {recipe.ingredients.map((ing, idx) => (
              <li key={idx} className="flex gap-3 sv-muted text-base">
                <span className="w-2.5 h-2.5 rounded-full mt-2 shrink-0" style={{ background: 'var(--sv-primary)' }} />
                {ing}
              </li>
            ))}
          </ul>
        </Section>

        <Section icon={<UtensilsCrossed />} title={t('recipes.tools')}>
          <ul className="grid gap-3 sm:grid-cols-2">
            {recipe.tools.map((tool, idx) => (
              <li key={idx} className="flex gap-3 sv-muted text-base">
                <span className="w-2.5 h-2.5 rounded-full mt-2 shrink-0" style={{ background: 'var(--sv-text-dim)' }} />
                {tool}
              </li>
            ))}
          </ul>
        </Section>

        {/* Los pasos ya NO se muestran en el resumen: se cocinan en el Modo Cocina
            (botón de abajo), que es donde viven los steps + tips por paso. */}

        {/* Fallback: recetas antiguas sin tips por paso muestran su tip general */}
        {!recipe.stepTips?.some(tip => tip?.trim()) && recipe.tip && (
          <div className="sv-tip rounded-xl px-5 py-4 text-base">
            💡 <span className="font-semibold">{t('recipes.tip')}:</span> {recipe.tip}
          </div>
        )}

      </div>

      {/* ── ACCIONES ───────────────────────────────────────── */}
      <div className="p-4 sm:p-5 space-y-3" style={{ borderTop: '1px solid var(--sv-border-light)' }}>

        {/* Fila 1: Guardar + Carpeta */}
        <div className="flex gap-3 flex-wrap">

          {/* GUARDAR FAVORITO — solo necesita recipeId */}
          {recipeId && (
            <button
              onClick={handleToggleFavorite}
              disabled={savingFav}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-base font-medium transition active:scale-95"
              style={favorite
                ? { background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#F87171' }
                : { background: 'var(--sv-bg-surface)', border: '1px solid var(--sv-border-light)', color: 'var(--sv-text-muted)' }}
            >
              <Heart className="w-5 h-5" style={favorite ? { fill: '#F87171', color: '#F87171' } : undefined} />
              {savingFav ? t('recipes.saving') : favorite ? t('recipes.saved') : t('recipes.save_recipe')}
            </button>
          )}

          {/* MOVER A CARPETA */}
          {recipeId && folders.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowFolderPicker(!showFolderPicker)}
                className="flex items-center gap-2 px-5 py-3 rounded-xl text-base font-medium transition active:scale-95"
                style={{ background: 'var(--sv-bg-surface)', border: '1px solid var(--sv-border-light)', color: 'var(--sv-text-muted)' }}
              >
                <FolderOpen className="w-5 h-5" />
                {currentFolderName ?? t('recipes.folder')}
              </button>

              {showFolderPicker && (
                <div className="sv-glass absolute bottom-14 left-0 w-56 z-20 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--sv-border-light)' }}>
                    <span className="text-sm font-semibold">{t('recipes.move_to_folder')}</span>
                    <button onClick={() => setShowFolderPicker(false)}>
                      <X className="w-4 h-4 sv-dim" />
                    </button>
                  </div>

                  {/* Sin carpeta */}
                  <button
                    onClick={() => handleMoveToFolder(null)}
                    disabled={movingFolder}
                    className="sv-menu-item w-full flex items-center justify-between px-4 py-3 text-sm transition"
                  >
                    {t('recipes.no_folder')}
                    {currentFolderId === null && <Check className="w-4 h-4" style={{ color: 'var(--sv-primary)' }} />}
                  </button>

                  {folders.map((folder) => (
                    <button
                      key={folder.id}
                      onClick={() => handleMoveToFolder(folder.id)}
                      disabled={movingFolder}
                      className="sv-menu-item w-full flex items-center justify-between px-4 py-3 text-sm transition"
                    >
                      📁 {folder.name}
                      {currentFolderId === folder.id && <Check className="w-4 h-4" style={{ color: 'var(--sv-primary)' }} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Fila 2: Modo cocina — guía paso a paso (necesita recipeId) */}
        {recipeId && (
          <button
            onClick={() => navigate(`/recipes/${recipeId}/cook`)}
            className="sv-btn sv-btn-primary w-full px-5 py-3.5 text-base"
          >
            👨‍🍳 {t('recipes.cook_mode')}
          </button>
        )}

        {/* Fila 3: Pregúntale al chef — independiente del botón guardar */}
        {conversationId && (
          <button
            onClick={() => navigate(`/chat/${conversationId}`)}
            className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl text-base font-semibold transition active:scale-95"
            style={{ background: 'rgba(255,94,26,0.1)', border: '1px solid rgba(255,94,26,0.3)', color: 'var(--sv-primary)' }}
          >
            <MessageCircle className="w-5 h-5" />
            {t('recipes.chat_button')}
          </button>
        )}

      </div>
    </div>
  )
}

// ── Subcomponentes ─────────────────────────────────────────────

function Chip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium" style={{ background: 'rgba(255,94,26,0.12)', color: 'var(--sv-primary)', border: '1px solid rgba(255,94,26,0.25)' }}>
      {icon}
      {label}
    </div>
  )
}

// ── Panel de nutrición (anillos + medidores) ──────────────────
// Los anillos y barras muestran el % del valor de referencia diario (dieta de
// 2.000 kcal, valores FDA). Los números van en tokens de texto; el color solo
// identifica la serie (cada anillo tiene su fila etiquetada = direct label).
const DAILY_REF = {
  calories: 2000, protein: 50, carbs: 275, fat: 78,       // kcal / g
  vitaminC: 90, calcium: 1300, iron: 18, sodium: 2300,    // mg
} as const

// Exportado: el Modo Cocina (CookingWizard) lo reutiliza en su pantalla intro,
// porque las recetas recién generadas ya no pasan por esta tarjeta resumen.
export function NutritionPanel({ nutrition }: { nutrition: Nutrition }) {
  const { t } = useTranslation()

  const macros = [
    { label: t('recipes.nutrition_calories'), value: nutrition.calories, unit: 'kcal', color: 'var(--viz-kcal)', frac: nutrition.calories / DAILY_REF.calories },
    { label: t('recipes.nutrition_protein'), value: nutrition.protein, unit: 'g', color: 'var(--viz-protein)', frac: nutrition.protein / DAILY_REF.protein },
    { label: t('recipes.nutrition_carbs'), value: nutrition.carbs, unit: 'g', color: 'var(--viz-carbs)', frac: nutrition.carbs / DAILY_REF.carbs },
    { label: t('recipes.nutrition_fat'), value: nutrition.fat, unit: 'g', color: 'var(--viz-fat)', frac: nutrition.fat / DAILY_REF.fat },
  ]

  const micros = [
    { label: t('recipes.nutrition_vitamin_c'), value: nutrition.vitaminC, ref: DAILY_REF.vitaminC },
    { label: t('recipes.nutrition_calcium'), value: nutrition.calcium, ref: DAILY_REF.calcium },
    { label: t('recipes.nutrition_iron'), value: nutrition.iron, ref: DAILY_REF.iron },
    { label: t('recipes.nutrition_sodium'), value: nutrition.sodium, ref: DAILY_REF.sodium },
  ].filter((m): m is { label: string; value: number; ref: number } => m.value != null)

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-5">
        <NutritionRings macros={macros} calories={nutrition.calories} />

        <div className="flex-1 min-w-0 space-y-3">
          {macros.map((m) => (
            <div key={m.label}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex items-center gap-1.5 sv-muted text-xs">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: m.color }} />
                  {m.label}
                </span>
                <span className="font-black text-base leading-none">
                  {m.value}<span className="text-[11px] font-semibold ml-0.5">{m.unit}</span>
                </span>
              </div>
              <Meter frac={m.frac} color={m.color} />
            </div>
          ))}
        </div>
      </div>

      {micros.length > 0 && (
        <div>
          <h4 className="font-semibold text-sm mb-3">{t('recipes.nutrition_micros')}</h4>
          <div className="grid grid-cols-2 gap-x-5 gap-y-3">
            {micros.map((m) => {
              const pct = Math.round((m.value / m.ref) * 100)
              return (
                <div key={m.label}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="sv-muted text-xs truncate">{m.label}</span>
                    <span className="font-bold text-sm leading-none whitespace-nowrap" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {m.value}<span className="text-[10px] font-semibold ml-0.5">mg</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Meter frac={m.value / m.ref} color="var(--viz-kcal)" />
                    <span className="sv-dim text-[10px] shrink-0" style={{ fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <p className="sv-dim text-[11px]">{t('recipes.nutrition_dv_note')}</p>
    </div>
  )
}

// Barra medidora fina: pista neutra + relleno con extremo redondeado
function Meter({ frac, color }: { frac: number; color: string }) {
  const pct = Math.min(100, Math.max(2, frac * 100))
  return (
    <div className="h-1 rounded-full mt-1.5 flex-1" style={{ background: 'var(--viz-track)' }}>
      <div className="h-1 rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

// Anillos concéntricos (kcal afuera → grasa adentro); cada anillo llena su % del
// valor diario. 8px de grosor con 2px de aire entre anillos, extremos redondeados.
function NutritionRings({
  macros, calories,
}: {
  macros: { label: string; color: string; frac: number }[]
  calories: number
}) {
  const SIZE = 132
  const CENTER = SIZE / 2
  const STROKE = 8
  const radii = [58, 48, 38, 28]

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="shrink-0" role="img" aria-label={macros.map(m => m.label).join(', ')}>
      {macros.map((m, i) => {
        const r = radii[i]
        const circumference = 2 * Math.PI * r
        const frac = Math.min(1, Math.max(0.02, m.frac))
        return (
          <g key={m.label}>
            <circle cx={CENTER} cy={CENTER} r={r} fill="none" stroke="var(--viz-track)" strokeWidth={STROKE} />
            <circle
              cx={CENTER} cy={CENTER} r={r} fill="none"
              stroke={m.color} strokeWidth={STROKE} strokeLinecap="round"
              strokeDasharray={`${circumference * frac} ${circumference}`}
              transform={`rotate(-90 ${CENTER} ${CENTER})`}
            />
          </g>
        )
      })}
      <text x={CENTER} y={CENTER - 2} textAnchor="middle" className="font-black" style={{ fill: 'var(--sv-text-main)', fontSize: 20 }}>
        {calories}
      </text>
      <text x={CENTER} y={CENTER + 13} textAnchor="middle" style={{ fill: 'var(--sv-text-muted)', fontSize: 10, fontWeight: 600 }}>
        kcal
      </text>
    </svg>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 flex items-center justify-center rounded-xl shrink-0" style={{ background: 'rgba(255,94,26,0.15)', color: 'var(--sv-primary)' }}>
          {icon}
        </div>
        <h3 className="text-xl font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  )
}
