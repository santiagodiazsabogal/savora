import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft, X, ChefHat, Send, Volume2, Carrot,
  UtensilsCrossed, Clock, Utensils, Sparkles, Camera, Check, Loader2,
  Flame,
} from 'lucide-react'
import { getRecipeById, sendMessage, getProfile, markRecipeCooked } from '../services/api'
import { NutritionPanel, type Nutrition } from '../components/recipes/RecipeCard'
import { useTTS } from '../hooks/useTTS'
import LoadingScreen from '../components/ui/LoadingScreen'

type WizardStep = 'banner' | 'ingredients' | 'utensils' | `step-${number}` | 'photo'

interface RecipeData {
  id: number
  title: string
  description?: string | null
  ingredients: string[]
  tools: string[]
  steps: string[]
  stepTips: (string | null)[]   // un tip por paso, alineado por índice
  difficulty?: string | null
  cookTime?: number | null
  mealTime?: string | null
  dietType?: string | null
  nutrition?: Nutrition | null   // por porción (recetas antiguas no la traen → se oculta)
  conversationId: number | null
}

// Comprime la foto en el cliente antes de mandarla a verificar (mismo enfoque que
// el duelo de cocina): reduce el lado mayor a ~1024px y exporta JPEG ~0.7.
async function compressImage(file: File, maxSide = 1024, quality = 0.7): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = dataUrl
    })
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
    const w = Math.round(img.width * scale)
    const h = Math.round(img.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return dataUrl
    ctx.drawImage(img, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', quality)
  } catch {
    return dataUrl
  }
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const MEAL_EMOJIS: Record<string, string> = {
  breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍎',
  dessert: '🍰', drink: '🍹', cocktail: '🍸', surprise: '🎲',
}
const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack',
  dessert: 'Dessert', drink: 'Drink', cocktail: 'Cocktail', surprise: 'Surprise',
}
const DIET_LABELS: Record<string, string> = {
  omnivore: 'Omnivore', vegetarian: 'Vegetarian', vegan: 'Vegan',
  gluten_free: 'Gluten-free', lactose_free: 'Lactose-free', keto: 'Keto',
}
const DIFFICULTY_LABELS: Record<string, string> = {
  easy: 'Easy', medium: 'Medium', hard: 'Hard',
  beginner: 'Easy', intermediate: 'Medium', advanced: 'Hard',
}

export default function CookingWizard() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { speak, playing } = useTTS()

  const [recipe, setRecipe] = useState<RecipeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isPro, setIsPro] = useState(false) // TTS (voz) es solo para PRO
  const [cookedXp, setCookedXp] = useState<number | null>(null) // XP ganado al terminar

  const [currentStep, setCurrentStep] = useState<WizardStep>('banner')

  // ── Foto de prueba del plato terminado (requerida para ganar XP) ────────
  const [proofPreview, setProofPreview] = useState<string | null>(null)
  const [proofBase64, setProofBase64] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState('')
  const cameraRef = useRef<HTMLInputElement>(null)

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatError, setChatError] = useState('')

  const chatBottomRef = useRef<HTMLDivElement>(null)

  // ── Cargar receta ──────────────────────────────────────────────
  useEffect(() => {
    if (!id) return
    let active = true
    async function load() {
      try {
        const data = await getRecipeById(Number(id))
        if (!active) return
        setRecipe({
          id: data.id,
          title: data.title,
          description: data.description ?? null,
          ingredients: data.ingredients ?? [],
          tools: data.tools ?? [],
          steps: data.steps ?? [],
          stepTips: data.stepTips ?? [],
          difficulty: data.difficulty ?? null,
          cookTime: data.cookTime ?? null,
          mealTime: data.mealTime ?? null,
          dietType: data.dietType ?? null,
          nutrition: data.nutrition ?? null,
          conversationId: data.conversationId ?? null,
        })
      } catch (err) {
        if (!active) return
        if (err instanceof Error && err.message === '401') {
          localStorage.removeItem('token'); navigate('/login'); return
        }
        setError('We could not load this recipe.')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [id, navigate])

  // ── Saber si el usuario es PRO (la voz es función premium) ───────
  useEffect(() => {
    let active = true
    getProfile()
      .then((data) => { if (active) setIsPro(data?.plan === 'PRO') })
      .catch(() => { /* si falla, queda en FREE: sin voz */ })
    return () => { active = false }
  }, [])

  // NOTA: el TTS se sintetiza solo cuando el usuario toca 🔊 (on-demand).
  // Ya no hay prefetch masivo ni auto-play: cada audio cuesta tokens, así que
  // solo se genera lo que se escucha. Además el backend cachea cada texto, por lo
  // que re-escuchar o re-abrir el modo cocina no vuelve a gastar.

  // ── Reiniciar el chat al cambiar de pantalla ───────────────────
  useEffect(() => {
    setChatMessages([])
    setChatInput('')
    setChatError('')
  }, [currentStep])

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, chatLoading])

  if (loading) return <LoadingScreen />

  if (error || !recipe) {
    return (
      <div className="sv-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="sv-muted">{error || 'Recipe not found.'}</p>
        <button
          onClick={() => navigate('/dashboard')}
          className="sv-btn sv-btn-primary px-5 py-3"
        >
          Back to home
        </button>
      </div>
    )
  }

  const steps = recipe.steps
  const totalCounted = 2 + steps.length // ingredientes + utensilios + cada paso

  const currentCounter =
    currentStep === 'ingredients' ? 1
    : currentStep === 'utensils' ? 2
    : currentStep.startsWith('step-') ? 3 + Number(currentStep.slice(5))
    : 0

  const isLastScreen =
    steps.length === 0
      ? currentStep === 'utensils'
      : currentStep === `step-${steps.length - 1}`

  const currentStepContext = (): string => {
    if (currentStep === 'ingredients') return `Ingredients: ${recipe.ingredients.join(', ')}`
    if (currentStep === 'utensils') return `Tools: ${recipe.tools.join(', ')}`
    if (currentStep.startsWith('step-')) {
      const i = Number(currentStep.slice(5))
      return `Step ${i + 1}: ${recipe.steps[i] ?? ''}`
    }
    return ''
  }

  // Terminaron los pasos → siempre se exige una foto del plato antes de poder
  // terminar el Modo Cocina (aunque la receta ya se haya cocinado antes: no vuelve
  // a dar XP, pero igual confirma con la celebración en vez de redirigir en silencio).
  const goToPhotoOrFinish = () => {
    setCurrentStep('photo')
  }

  const handleProofFile = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const dataUrl = await compressImage(files[0])
    setProofPreview(dataUrl)
    setProofBase64(dataUrl.split(',')[1] ?? '')
    setVerifyError('')
  }

  // Manda la foto a verificar: solo si la IA confirma que es (razonablemente) este
  // plato se marca la receta cocinada y se otorga el XP. Si no coincide, deja
  // reintentar con otra foto en vez de bloquear o cerrar el Modo Cocina.
  const handleSubmitProof = async () => {
    if (!proofBase64 || verifying) return
    setVerifying(true)
    setVerifyError('')
    try {
      const res = await markRecipeCooked(recipe.id, proofBase64)
      // Siempre mostramos la celebración al terminar — nunca redirigimos en silencio.
      // Si ya se había cocinado antes, xpGained viene en 0 y el modal lo indica distinto.
      setCookedXp(res?.xpGained ?? 0)
    } catch (err: any) {
      if (err.message === '401') { localStorage.removeItem('token'); navigate('/login'); return }
      if (err.message === 'PHOTO_MISMATCH') {
        setVerifyError(err.reason || "That doesn't quite look like this dish. Try another photo.")
      } else if (err.message === 'PHOTO_REQUIRED') {
        setVerifyError('Please take a photo first.')
      } else {
        setVerifyError('We could not verify the photo. Try again.')
      }
    } finally {
      setVerifying(false)
    }
  }

  const handleNext = () => {
    if (currentStep === 'banner') { setCurrentStep('ingredients'); return }
    if (currentStep === 'ingredients') { setCurrentStep('utensils'); return }
    if (currentStep === 'utensils') {
      if (steps.length > 0) setCurrentStep('step-0')
      else goToPhotoOrFinish()
      return
    }
    if (currentStep.startsWith('step-')) {
      const i = Number(currentStep.slice(5))
      if (i < steps.length - 1) setCurrentStep(`step-${i + 1}`)
      else goToPhotoOrFinish()
    }
  }

  const handlePrev = () => {
    if (currentStep === 'banner') { navigate(`/recipes/${recipe.id}`); return }
    if (currentStep === 'ingredients') { setCurrentStep('banner'); return }
    if (currentStep === 'utensils') { setCurrentStep('ingredients'); return }
    if (currentStep === 'photo') {
      setCurrentStep(steps.length > 0 ? `step-${steps.length - 1}` : 'utensils')
      return
    }
    if (currentStep.startsWith('step-')) {
      const i = Number(currentStep.slice(5))
      setCurrentStep(i === 0 ? 'utensils' : `step-${i - 1}`)
    }
  }

  const handleChatSend = async () => {
    const text = chatInput.trim()
    if (!text || chatLoading) return
    if (!recipe.conversationId) {
      setChatError('Chat is not available for this recipe.')
      return
    }
    setChatMessages(prev => [...prev, { role: 'user', content: text }])
    setChatInput('')
    setChatLoading(true)
    setChatError('')
    try {
      const res = await sendMessage(text, recipe.conversationId, currentStepContext())
      setChatMessages(prev => [...prev, { role: 'assistant', content: res.reply }])
    } catch (err) {
      if (err instanceof Error && err.message === '401') {
        localStorage.removeItem('token'); navigate('/login'); return
      }
      setChatError('We could not reply. Try again.')
    } finally {
      setChatLoading(false)
    }
  }

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend() }
  }

  // ─────────────────────────────────────────────────────────────
  // BANNER (pantalla intro, sin chat ni barra inferior)
  // ─────────────────────────────────────────────────────────────
  if (currentStep === 'banner') {
    return (
      <div className="sv-screen sv-page flex flex-col px-4 pt-10 pb-10">
        <div className="pb-3">
          <button
            onClick={() => navigate(`/recipes/${recipe.id}`)}
            className="w-10 h-10 flex items-center justify-center rounded-2xl transition active:scale-95"
            style={{ background: 'var(--sv-bg-surface)', border: '1px solid var(--sv-border-light)' }}
          >
            <ArrowLeft className="w-5 h-5 sv-muted" />
          </button>
        </div>

        {/* Resumen completo en UNA tarjeta (la página entera scrollea, nada se corta) */}
        <div className="sv-glass p-6 space-y-5 mx-1">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(255,94,26,0.15)' }}>
            <ChefHat className="w-7 h-7" style={{ color: 'var(--sv-primary)' }} />
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-black leading-tight">{recipe.title}</h1>
            {recipe.description && (
              <p className="sv-muted text-base">{recipe.description}</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {recipe.difficulty && (
              <Chip icon={<ChefHat className="w-3.5 h-3.5" />} label={DIFFICULTY_LABELS[recipe.difficulty] ?? recipe.difficulty} />
            )}
            {typeof recipe.cookTime === 'number' && (
              <Chip icon={<Clock className="w-3.5 h-3.5" />} label={`${recipe.cookTime} min`} />
            )}
            {recipe.mealTime && (
              <Chip icon={<Utensils className="w-3.5 h-3.5" />} label={`${MEAL_EMOJIS[recipe.mealTime] ?? ''} ${MEAL_LABELS[recipe.mealTime] ?? recipe.mealTime}`} />
            )}
            {recipe.dietType && (
              <Chip icon={<Sparkles className="w-3.5 h-3.5" />} label={DIET_LABELS[recipe.dietType] ?? recipe.dietType} />
            )}
            {recipe.nutrition && (
              <Chip icon={<Flame className="w-3.5 h-3.5" />} label={`${recipe.nutrition.calories} kcal`} />
            )}
          </div>

          <p className="text-sm sv-dim">
            I'll guide you step by step. Ask me anything on any screen. 🍳
          </p>

          {/* Nutrición por porción — siempre visible */}
          {recipe.nutrition && (
            <BannerSection icon={<Flame className="w-5 h-5" />} title={t('recipes.nutrition')}>
              <p className="sv-dim text-xs mb-4">
                {t('recipes.nutrition_per_serving', { count: recipe.nutrition.servings })}
              </p>
              <NutritionPanel nutrition={recipe.nutrition} />
            </BannerSection>
          )}

          {/* Ingredientes */}
          {recipe.ingredients.length > 0 && (
            <BannerSection icon={<Carrot className="w-5 h-5" />} title="Ingredients">
              <ul className="grid gap-3">
                {recipe.ingredients.map((ing, idx) => (
                  <li key={idx} className="flex gap-3 sv-muted text-base">
                    <span className="w-2.5 h-2.5 rounded-full mt-2 shrink-0" style={{ background: 'var(--sv-primary)' }} />
                    {ing}
                  </li>
                ))}
              </ul>
            </BannerSection>
          )}

          {/* Utensilios */}
          {recipe.tools.length > 0 && (
            <BannerSection icon={<UtensilsCrossed className="w-5 h-5" />} title="Tools">
              <ul className="grid gap-3">
                {recipe.tools.map((tool, idx) => (
                  <li key={idx} className="flex gap-3 sv-muted text-base">
                    <span className="w-2.5 h-2.5 rounded-full mt-2 shrink-0" style={{ background: 'var(--sv-text-dim)' }} />
                    {tool}
                  </li>
                ))}
              </ul>
            </BannerSection>
          )}
        </div>

        <div className="mt-5 mx-1">
          <button
            onClick={handleNext}
            className="sv-btn sv-btn-primary w-full py-4 text-lg"
          >
            Shall we start? →
          </button>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────
  // FOTO DE PRUEBA (pantalla final, requerida para ganar XP)
  // ─────────────────────────────────────────────────────────────
  if (currentStep === 'photo') {
    return (
      <div className="sv-screen sv-page flex flex-col">
        <div className="px-4 pt-10 pb-2">
          <button
            onClick={handlePrev}
            className="w-10 h-10 flex items-center justify-center rounded-2xl transition active:scale-95"
            style={{ background: 'var(--sv-bg-surface)', border: '1px solid var(--sv-border-light)' }}
          >
            <ArrowLeft className="w-5 h-5 sv-muted" />
          </button>
        </div>

        <div className="flex-1 flex flex-col justify-center px-5 pb-10 space-y-5">
          <div className="text-center space-y-1.5">
            <h1 className="text-2xl font-black">Show me your dish!</h1>
            <p className="sv-muted text-sm">Take a photo of your finished plate to confirm you made it and earn your XP.</p>
          </div>

          {proofPreview ? (
            <div className="relative rounded-2xl overflow-hidden aspect-square max-w-xs mx-auto" style={{ background: 'var(--sv-bg-input)' }}>
              <img src={proofPreview} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => { setProofPreview(null); setProofBase64(null); setVerifyError('') }}
                className="absolute top-2 right-2 bg-black/60 text-white text-xs px-3 py-1.5 rounded-full"
              >
                Retake
              </button>
            </div>
          ) : (
            <button
              onClick={() => cameraRef.current?.click()}
              className="flex flex-col items-center gap-2 py-8 rounded-2xl transition active:scale-95 w-full max-w-xs mx-auto"
              style={{ border: '2px dashed rgba(255,94,26,0.4)', background: 'rgba(255,94,26,0.06)' }}
            >
              <Camera className="w-7 h-7" style={{ color: 'var(--sv-primary)' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--sv-primary)' }}>Take photo</span>
            </button>
          )}

          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleProofFile(e.target.files)} />

          {verifyError && (
            <p className="text-sm text-center px-4" style={{ color: '#FCA5A5' }}>{verifyError}</p>
          )}
        </div>

        <div className="px-5 pb-10">
          <button
            onClick={handleSubmitProof}
            disabled={!proofBase64 || verifying}
            className="sv-btn sv-btn-primary w-full py-4 text-lg"
          >
            {verifying ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
            {verifying ? 'Verifying…' : 'Submit photo'}
          </button>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────
  // PANTALLAS CON CONTENIDO + CHAT + "SIGUIENTE"
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="sv-screen flex flex-col h-[100dvh]">
      {/* CELEBRACIÓN AL TERMINAR — muestra el XP ganado */}
      {cookedXp != null && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center px-6" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="sv-glass w-full max-w-sm p-7 text-center space-y-4">
            <div className="text-5xl">🎉</div>
            <h2 className="text-2xl font-black">{t('cooking.finished_title', { defaultValue: 'Dish complete!' })}</h2>
            {cookedXp > 0 ? (
              <>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-lg font-bold" style={{ background: 'rgba(255,94,26,0.15)', color: 'var(--sv-primary)', border: '1px solid rgba(255,94,26,0.3)' }}>
                  <Sparkles className="w-5 h-5" /> +{cookedXp} XP
                </div>
                <p className="text-sm sv-muted">{t('cooking.finished_sub', { defaultValue: 'Your global XP went up. Check it in your profile.' })}</p>
              </>
            ) : (
              <p className="text-sm sv-muted">Nice work! You already earned XP for this recipe before.</p>
            )}
            <button onClick={() => navigate(`/recipes/${recipe.id}`)} className="sv-btn sv-btn-primary w-full py-3.5">
              {t('cooking.see_recipe', { defaultValue: 'View recipe' })}
            </button>
          </div>
        </div>
      )}

      {/* HEADER con progreso — superficie del tema (antes era un rgba oscuro fijo
          que en tema claro se veía como una barra azul-negra fuera de lugar) */}
      <header className="px-4 pt-10 pb-3" style={{ background: 'var(--sv-bg-surface)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--sv-border-light)' }}>
        <div className="flex items-center gap-2.5">
          <button
            onClick={handlePrev}
            className="sv-menu-item w-8 h-8 flex items-center justify-center rounded-xl transition shrink-0"
          >
            <ArrowLeft className="w-4 h-4 sv-muted" />
          </button>
          <p className="flex-1 min-w-0 font-bold text-sm truncate">{recipe.title}</p>
          <span
            className="text-xs font-bold shrink-0 px-2.5 py-1 rounded-full"
            style={{ color: 'var(--sv-primary)', background: 'rgba(255,94,26,0.12)', border: '1px solid rgba(255,94,26,0.25)' }}
          >
            {currentCounter} / {totalCounted}
          </span>
          <button
            onClick={() => navigate(`/recipes/${recipe.id}`)}
            className="sv-menu-item w-8 h-8 flex items-center justify-center rounded-xl transition shrink-0"
          >
            <X className="w-4 h-4 sv-dim" />
          </button>
        </div>
        <div className="mt-2.5 h-2 rounded-full overflow-hidden" style={{ background: 'var(--viz-track)' }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${(currentCounter / totalCounted) * 100}%`,
              background: 'linear-gradient(90deg, #FF8B54, var(--sv-primary))',
              boxShadow: '0 0 8px rgba(255,94,26,0.45)',
            }}
          />
        </div>
      </header>

      {/* CONTENIDO + CHAT (scroll) */}
      <main className="flex-1 overflow-y-auto px-4 pt-5 pb-44 space-y-5">

        {/* ── INGREDIENTES ── */}
        {currentStep === 'ingredients' && (
          <SectionCard icon={<Carrot className="w-5 h-5" />} title="Ingredients">
            <ul className="grid gap-3">
              {recipe.ingredients.map((ing, idx) => (
                <li key={idx} className="flex gap-3 sv-muted text-base">
                  <span className="w-2.5 h-2.5 rounded-full mt-2 shrink-0" style={{ background: 'var(--sv-primary)' }} />
                  {ing}
                </li>
              ))}
            </ul>
          </SectionCard>
        )}

        {/* ── UTENSILIOS ── */}
        {currentStep === 'utensils' && (
          <SectionCard icon={<UtensilsCrossed className="w-5 h-5" />} title="Tools">
            <ul className="grid gap-3">
              {recipe.tools.map((tool, idx) => (
                <li key={idx} className="flex gap-3 sv-muted text-base">
                  <span className="w-2.5 h-2.5 rounded-full mt-2 shrink-0" style={{ background: 'var(--sv-text-dim)' }} />
                  {tool}
                </li>
              ))}
            </ul>
          </SectionCard>
        )}

        {/* ── PASOS ── */}
        {currentStep.startsWith('step-') && (() => {
          const i = Number(currentStep.slice(5))
          const stepText = recipe.steps[i] ?? ''
          const stepTip = recipe.stepTips?.[i]?.trim()
          return (
            <div className="sv-glass p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 flex items-center justify-center rounded-full text-white text-sm font-bold shrink-0" style={{ background: 'var(--sv-primary)' }}>
                    {i + 1}
                  </span>
                  <span className="text-sm font-semibold sv-dim uppercase tracking-wide">
                    Step {i + 1} of {steps.length}
                  </span>
                </div>
                {isPro && (
                  <button
                    onClick={() => speak(stepText)}
                    disabled={playing}
                    aria-label="Listen to this step"
                    className="w-10 h-10 flex items-center justify-center rounded-xl transition active:scale-95 shrink-0"
                    style={playing
                      ? { background: 'rgba(255,94,26,0.15)', border: '1px solid rgba(255,94,26,0.3)', color: 'var(--sv-primary)' }
                      : { background: 'var(--sv-bg-surface)', border: '1px solid var(--sv-border-light)', color: 'var(--sv-text-muted)' }}
                  >
                    {playing
                      ? <span className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--sv-primary)', borderTopColor: 'transparent' }} />
                      : <Volume2 className="w-5 h-5" />}
                  </button>
                )}
              </div>
              <p className="text-lg leading-relaxed">{stepText}</p>
              {stepTip && (
                <div className="sv-tip rounded-xl px-4 py-3 text-sm sm:text-base">
                  💡 <span className="font-semibold">Tip:</span> {stepTip}
                </div>
              )}
            </div>
          )
        })()}

        {/* ── CHAT CONTEXTUAL ── */}
        <div className="space-y-3">
          <div className="flex items-center gap-1.5">
            <ChefHat className="w-3.5 h-3.5" style={{ color: 'var(--sv-primary)' }} />
            <p className="text-xs font-bold sv-dim uppercase tracking-wider">
              Ask the chef about this
            </p>
          </div>

          {chatMessages.map((msg, idx) => (
            <div key={idx} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mb-0.5" style={{ background: 'linear-gradient(135deg, var(--sv-primary), #FF8B54)' }}>
                  <ChefHat className="w-3.5 h-3.5 text-white" />
                </div>
              )}
              <div
                className="max-w-[78%] px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
                style={msg.role === 'user'
                  ? { background: 'linear-gradient(135deg, var(--sv-primary), #E04800)', color: '#fff', borderRadius: '16px 16px 4px 16px' }
                  : { background: 'var(--sv-bg-surface)', border: '1px solid var(--sv-border-light)', color: 'var(--sv-text-main)', borderRadius: '16px 16px 16px 4px' }}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {chatLoading && (
            <div className="flex items-end gap-2 justify-start">
              <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mb-0.5" style={{ background: 'linear-gradient(135deg, var(--sv-primary), #FF8B54)' }}>
                <ChefHat className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="rounded-2xl rounded-bl-sm px-4 py-3" style={{ background: 'var(--sv-bg-surface)', border: '1px solid var(--sv-border-light)' }}>
                <div className="flex gap-1 items-center h-4">
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--sv-primary)', animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--sv-primary)', animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--sv-primary)', animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          {chatError && (
            <p className="text-xs text-center" style={{ color: '#FCA5A5' }}>{chatError}</p>
          )}

          <div ref={chatBottomRef} />
        </div>
      </main>

      {/* BARRA INFERIOR FIJA: input de chat + botón Siguiente */}
      <div className="fixed bottom-0 left-0 right-0 z-30 px-4 pb-6 pt-2 space-y-2.5" style={{ background: 'linear-gradient(to top, var(--sv-bg-base) 55%, transparent)', maxWidth: 480, margin: '0 auto' }}>
        <div className="flex items-center gap-2 rounded-2xl px-3 py-2" style={{ background: 'var(--sv-bg-surface)', border: '1px solid var(--sv-border-light)', backdropFilter: 'blur(20px)' }}>
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={handleChatKeyDown}
            placeholder="Type your question…"
            maxLength={1000}
            className="flex-1 bg-transparent text-sm outline-none px-1"
            style={{ color: 'var(--sv-text-main)' }}
          />
          <button
            onClick={handleChatSend}
            disabled={chatLoading || !chatInput.trim()}
            className="sv-btn sv-btn-primary w-9 h-9 shrink-0"
            style={{ borderRadius: 12 }}
          >
            {chatLoading
              ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Send className="w-3.5 h-3.5 text-white" />}
          </button>
        </div>

        <button
          onClick={handleNext}
          className="sv-btn sv-btn-primary w-full py-3.5 text-base"
        >
          {isLastScreen
            ? `Finish ✓ (${currentCounter} of ${totalCounted})`
            : `Next → (${currentCounter} of ${totalCounted})`}
        </button>
      </div>
    </div>
  )
}

// ── Subcomponentes ─────────────────────────────────────────────

function Chip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium" style={{ background: 'rgba(255,94,26,0.12)', color: 'var(--sv-primary)', border: '1px solid rgba(255,94,26,0.25)' }}>
      {icon}
      {label}
    </div>
  )
}

// Sección interna de la tarjeta intro (banner): divisor arriba + encabezado con icono.
function BannerSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="pt-5" style={{ borderTop: '1px solid var(--sv-border-light)' }}>
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

function SectionCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="sv-glass p-5 sm:p-6">
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