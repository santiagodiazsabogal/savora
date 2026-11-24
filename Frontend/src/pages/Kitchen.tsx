import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, X, Camera, ImagePlus, Loader2, ChefHat, AlertCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Container from '../components/ui/Container'
import LoadingScreen from '../components/ui/LoadingScreen'
import KitchenScene, { KitchenZone } from '../components/kitchen/KitchenScene'
import { analyzeFridge, getCachedProfile, getProfile, updateProfile } from '../services/api'

// 🥘 My Kitchen (todos los planes): cocina ilustrada INTERACTIVA. La escena SVG tiene
// nevera, alacena y cajón clicables que se abren mostrando el inventario de esa zona.
// Ingredientes = User.pantry (los mismos que precarga PantryCheck), clasificados en
// frescos (nevera) vs secos (alacena) por keywords. Utensilios = User.utensils.

interface Suggestion {
  title: string
  description: string
  difficulty: string
  cookTime: number
  missingIngredients: string[]
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function getMealTime(): string {
  const h = new Date().getHours()
  if (h >= 5 && h < 11) return 'breakfast'
  if (h >= 11 && h < 15) return 'lunch'
  if (h >= 15 && h < 18) return 'snack'
  return 'dinner'
}

// Clasificador fresco (nevera) vs seco (alacena). Cosmético: las sugerencias usan
// SIEMPRE la lista completa; esto solo decide en qué mueble se dibuja cada ítem.
const FRESH_KEYWORDS = [
  'milk', 'cheese', 'yogurt', 'butter', 'cream', 'egg', 'chicken', 'beef', 'pork', 'meat',
  'steak', 'fish', 'salmon', 'tuna', 'shrimp', 'tofu', 'ham', 'bacon', 'sausage', 'turkey',
  'lettuce', 'spinach', 'kale', 'broccoli', 'cauliflower', 'carrot', 'cucumber', 'tomato',
  'pepper', 'mushroom', 'zucchini', 'avocado', 'celery', 'cabbage', 'corn', 'bean sprout',
  'berry', 'strawberry', 'blueberry', 'grape', 'apple', 'orange', 'lemon', 'lime', 'banana',
  'mango', 'pineapple', 'peach', 'pear', 'melon', 'kiwi', 'cilantro', 'parsley', 'basil',
  'mint', 'ginger', 'scallion', 'green onion', 'leek', 'mozzarella', 'cheddar', 'parmesan',
  'sour cream', 'mayo', 'mayonnaise', 'juice', 'leftover',
]
const isFresh = (name: string) => {
  const n = name.toLowerCase()
  return FRESH_KEYWORDS.some(k => n.includes(k))
}

export default function Kitchen() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const cached = getCachedProfile()
  const [ingredients, setIngredients] = useState<string[]>(
    Array.isArray(cached?.pantry) ? cached.pantry : [],
  )
  const [utensils, setUtensils] = useState<string[]>(
    Array.isArray(cached?.utensils) ? cached.utensils : [],
  )
  const [initialLoading, setInitialLoading] = useState(!cached)
  const [activeZone, setActiveZone] = useState<KitchenZone>('fridge')
  const [newItem, setNewItem] = useState('')
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [prefetched, setPrefetched] = useState<{ key: string; suggestions: Suggestion[] } | null>(null)

  useEffect(() => {
    getProfile()
      .then(p => {
        if (Array.isArray(p?.pantry)) setIngredients(p.pantry)
        if (Array.isArray(p?.utensils)) setUtensils(p.utensils)
      })
      .catch((err: any) => {
        if (err.message === '401') { localStorage.removeItem('token'); navigate('/login') }
      })
      .finally(() => setInitialLoading(false))
  }, [])

  useEffect(() => {
    return () => { photos.forEach(p => URL.revokeObjectURL(p.preview)) }
  }, [])

  // Autosave: cada cambio se persiste al perfil (best-effort, sin bloquear la UI).
  const persistIngredients = (next: string[]) => {
    setIngredients(next)
    updateProfile({ pantry: next }).catch(() => {})
  }
  const persistUtensils = (next: string[]) => {
    setUtensils(next)
    updateProfile({ utensils: next }).catch(() => {})
  }

  const addItems = (raw: string) => {
    const parts = raw.split(/[,\n]+/).map(s => s.trim()).filter(Boolean)
    if (parts.length === 0) return
    if (activeZone === 'drawer') {
      const seen = new Set(utensils.map(i => i.toLowerCase()))
      const added = parts.filter(p => !seen.has(p.toLowerCase()))
      if (added.length > 0) persistUtensils([...utensils, ...added].slice(0, 60))
    } else {
      const seen = new Set(ingredients.map(i => i.toLowerCase()))
      const added = parts.filter(p => !seen.has(p.toLowerCase()))
      if (added.length > 0) persistIngredients([...ingredients, ...added].slice(0, 60))
      // Si lo añadido cae en la otra zona por el clasificador, abrirla para que lo VEA.
      if (added.length > 0) {
        const zonesOfAdded = new Set(added.map(a => (isFresh(a) ? 'fridge' : 'pantry')))
        if (!zonesOfAdded.has(activeZone) && zonesOfAdded.size === 1) {
          setActiveZone(zonesOfAdded.values().next().value as KitchenZone)
        }
      }
    }
    setNewItem('')
  }

  const removeItem = (name: string) => {
    if (activeZone === 'drawer') persistUtensils(utensils.filter(i => i !== name))
    else persistIngredients(ingredients.filter(i => i !== name))
  }

  const addPhotos = (files: FileList | null) => {
    if (!files) return
    const remaining = 3 - photos.length
    const toAdd = Array.from(files).slice(0, remaining)
    setPhotos(prev => [...prev, ...toAdd.map(file => ({ file, preview: URL.createObjectURL(file) }))])
    setError('')
  }

  const removePhoto = (idx: number) => {
    setPhotos(prev => {
      URL.revokeObjectURL(prev[idx].preview)
      return prev.filter((_, i) => i !== idx)
    })
  }

  const handleAnalyzePhotos = async () => {
    if (photos.length === 0) return
    setAnalyzing(true)
    setError('')
    try {
      const base64Images = await Promise.all(photos.map(p => fileToBase64(p.file)))
      const result: any = await analyzeFridge(base64Images, getMealTime())
      const detected: string[] = result.detectedIngredients ?? []
      const seen = new Set(ingredients.map(i => i.toLowerCase()))
      const merged = [...ingredients, ...detected.filter(d => !seen.has(d.toLowerCase()))].slice(0, 60)
      persistIngredients(merged)
      setPrefetched({ key: merged.map(i => i.toLowerCase()).join('|'), suggestions: result.suggestions ?? [] })
      setPhotos(prev => { prev.forEach(p => URL.revokeObjectURL(p.preview)); return [] })
    } catch (err: any) {
      if (err.message === '401') { localStorage.removeItem('token'); navigate('/login') }
      else if (err.message === 'LIMIT_REACHED') setError(t('recipes.limit_reached'))
      else setError(t('fridge.error_analyze'))
    } finally {
      setAnalyzing(false)
    }
  }

  const handleCook = () => {
    const key = ingredients.map(i => i.toLowerCase()).join('|')
    navigate('/recipe-suggestions', {
      state: {
        timeAvailable: null,
        mealType: null,
        ingredients,
        from: 'kitchen',
        prefetched: prefetched && prefetched.key === key ? prefetched.suggestions : undefined,
      },
    })
  }

  const freshItems = ingredients.filter(isFresh)
  const dryItems = ingredients.filter(i => !isFresh(i))
  const zoneItems =
    activeZone === 'fridge' ? freshItems : activeZone === 'pantry' ? dryItems : utensils
  const counts = { fridge: freshItems.length, pantry: dryItems.length, drawer: utensils.length }

  if (initialLoading) return <LoadingScreen />

  return (
    <Container backButton backTo="/dashboard">
      <div className="space-y-5 pb-28">

        {/* HEADER */}
        <div>
          <h1 className="text-3xl font-black leading-tight">{t('kitchen.title')}</h1>
          <p className="sv-muted mt-2 text-base">{t('kitchen.scene_hint')}</p>
        </div>

        {/* ESCENA INTERACTIVA (diorama 3D: la comida/utensilios reales se ven en las repisas) */}
        <div className="sv-glass p-3" style={{ overflow: 'hidden' }}>
          <KitchenScene
            active={activeZone}
            counts={counts}
            items={{ fridge: freshItems, pantry: dryItems, drawer: utensils }}
            onSelect={setActiveZone}
          />
        </div>

        {/* ZONA ACTIVA: título + inventario en listado */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold sv-muted">
              {t(`kitchen.zone_${activeZone}`)} {zoneItems.length > 0 && `(${zoneItems.length})`}
            </p>
          </div>

          {zoneItems.length === 0 ? (
            <div className="rounded-2xl px-4 py-6 text-center" style={{ border: '2px dashed var(--sv-border-strong)' }}>
              <p className="text-sm sv-muted max-w-xs mx-auto">{t(`kitchen.empty_${activeZone}`)}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {[...zoneItems].sort((a, b) => a.localeCompare(b)).map(item => (
                <div key={item} className="sv-glass-solid px-4 py-3 flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: activeZone === 'drawer' ? '#94A3B8' : '#34D399' }} />
                  <p className="flex-1 min-w-0 text-sm font-semibold truncate capitalize">{item}</p>
                  <button
                    onClick={() => removeItem(item)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition active:scale-90"
                    style={{ background: 'var(--sv-bg-input)' }}
                    aria-label={t('pantry_check.remove_ingredient')}
                  >
                    <X className="w-4 h-4 sv-dim" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Añadir a la zona activa (ingredientes se auto-clasifican; utensilios van al cajón) */}
          <div className="flex gap-2">
            <input
              value={newItem}
              onChange={e => setNewItem(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItems(newItem) } }}
              placeholder={activeZone === 'drawer' ? t('kitchen.utensil_placeholder') : t('pantry_check.add_placeholder')}
              className="sv-input flex-1 text-sm"
              style={{ paddingLeft: 16 }}
              maxLength={40}
            />
            <button
              onClick={() => addItems(newItem)}
              disabled={!newItem.trim()}
              className="sv-btn sv-btn-primary shrink-0 w-12 h-12"
              aria-label={t('pantry_check.add_ingredient')}
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
          <p className="text-xs sv-dim">
            {activeZone === 'drawer' ? t('kitchen.autosave_hint') : `${t('kitchen.classify_hint')} ${t('kitchen.autosave_hint')}`}
          </p>
        </div>

        {/* RE-ESCANEAR LA NEVERA (solo zonas de comida) */}
        {activeZone !== 'drawer' && (
          <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.2)' }}>
            <div>
              <p className="text-sm font-bold">📸 {t('kitchen.scan_title')}</p>
              <p className="text-xs sv-dim mt-0.5">{t('kitchen.scan_hint')}</p>
            </div>

            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {photos.map((p, i) => (
                  <div key={i} className="relative aspect-square rounded-2xl overflow-hidden" style={{ background: 'var(--sv-bg-input)' }}>
                    <img src={p.preview} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => removePhoto(i)}
                      className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center"
                    >
                      <X className="w-3.5 h-3.5 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {photos.length < 3 && (
              <div className="flex gap-2">
                <button
                  onClick={() => cameraRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold transition active:scale-95"
                  style={{ border: '2px dashed rgba(56,189,248,0.4)', background: 'rgba(56,189,248,0.06)', color: '#38BDF8' }}
                >
                  <Camera className="w-4 h-4" /> {t('fridge.take_photo')}
                </button>
                <button
                  onClick={() => galleryRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold sv-muted transition active:scale-95"
                  style={{ border: '2px dashed var(--sv-border-strong)', background: 'var(--sv-bg-input)' }}
                >
                  <ImagePlus className="w-4 h-4" /> {t('fridge.from_gallery')}
                </button>
              </div>
            )}

            {photos.length > 0 && (
              <button
                onClick={handleAnalyzePhotos}
                disabled={analyzing}
                className="sv-btn sv-btn-primary w-full py-3 text-sm"
              >
                {analyzing
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('fridge.analyzing')}</>
                  : t('pantry_check.analyze_photos')
                }
              </button>
            )}

            <input ref={cameraRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={e => addPhotos(e.target.files)} />
            <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={e => addPhotos(e.target.files)} />
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-xl px-4 py-3" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#FCA5A5' }} />
            <p className="text-sm" style={{ color: '#FCA5A5' }}>{error}</p>
          </div>
        )}

        {/* CTA: cocinar con lo que hay (usa TODA la comida, no solo la zona activa) */}
        <button
          onClick={handleCook}
          disabled={ingredients.length === 0 || analyzing}
          className="sv-btn sv-btn-primary w-full py-4 text-base"
        >
          <ChefHat className="w-5 h-5" /> {t('kitchen.cook_cta')}
        </button>

      </div>
    </Container>
  )
}
