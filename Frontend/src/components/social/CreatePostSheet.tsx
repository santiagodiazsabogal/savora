import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ImagePlus, Camera, BookOpen, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  createSocialPost, getUserRecipes,
  SocialPost, SocialPostType,
} from '../../services/api'
import { compressImageToDataUrl } from '../../utils/image'
import { pushModal, popModal } from '../../utils/modalStore'

interface RecipeLite { id: number; title: string }

interface Props {
  onClose: () => void
  onCreated: (post: SocialPost) => void
}

export default function CreatePostSheet({ onClose, onCreated }: Props) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)

  const [type, setType] = useState<SocialPostType>('PHOTO')
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [caption, setCaption] = useState('')
  const [recipes, setRecipes] = useState<RecipeLite[]>([])
  const [recipeId, setRecipeId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Carga las recetas del usuario para el modo "compartir receta".
  useEffect(() => {
    getUserRecipes()
      .then((data) => setRecipes(Array.isArray(data) ? data.map((r: any) => ({ id: r.id, title: r.title })) : []))
      .catch(() => setRecipes([]))
  }, [])

  // Cleanup del ObjectURL del preview
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  // Mientras el sheet está abierto, ocultar la pastilla de tabs (BottomTabBar).
  useEffect(() => { pushModal(); return () => popModal() }, [])

  const handlePickImage = async (file?: File) => {
    if (!file) return
    setError(null)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(URL.createObjectURL(file)) // preview en alta; subimos la versión comprimida
    setProcessing(true)
    try {
      setImageBase64(await compressImageToDataUrl(file))
    } catch {
      setError(t('social.create_error'))
    } finally {
      setProcessing(false)
    }
  }

  const canSubmit = !!imageBase64 && (type === 'PHOTO' || recipeId != null) && !submitting && !processing

  const handleSubmit = async () => {
    if (!canSubmit || !imageBase64) return
    setSubmitting(true)
    setError(null)
    try {
      const post = await createSocialPost({
        type,
        imageBase64,
        caption: caption.trim() || undefined,
        recipeId: type === 'RECIPE' ? recipeId : null,
      })
      onCreated(post)
      onClose()
    } catch (err: any) {
      setError(err?.message === 'INAPPROPRIATE_IMAGE'
        ? t('social.image_rejected', { defaultValue: "This image doesn't meet our community guidelines. Try another one." })
        : t('social.create_error'))
      setSubmitting(false)
    }
  }

  // Portal a document.body: el sheet escapa del wrapper de rutas (z-index:1 con
  // stacking context propio), si no la pastilla de tabs (z-50, a nivel de App)
  // quedaría por encima del botón "Publicar".
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-3xl max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--sv-bg-elevated)', borderTop: '1px solid var(--sv-border-light)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 sticky top-0 z-10" style={{ background: 'var(--sv-bg-elevated)' }}>
          <h2 className="text-lg font-black">{t('social.create_title')}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg sv-muted hover:opacity-70"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-5 pb-6 space-y-4">
          {/* Selector de tipo */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setType('PHOTO')}
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition"
              style={type === 'PHOTO'
                ? { background: 'rgba(255,94,26,0.12)', border: '1px solid var(--sv-primary)', color: 'var(--sv-primary)' }
                : { background: 'var(--sv-bg-input)', border: '1px solid var(--sv-border-light)', color: 'var(--sv-text-muted)' }}
            >
              <Camera className="w-4 h-4" /> {t('social.type_photo')}
            </button>
            <button
              onClick={() => setType('RECIPE')}
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition"
              style={type === 'RECIPE'
                ? { background: 'rgba(255,94,26,0.12)', border: '1px solid var(--sv-primary)', color: 'var(--sv-primary)' }
                : { background: 'var(--sv-bg-input)', border: '1px solid var(--sv-border-light)', color: 'var(--sv-text-muted)' }}
            >
              <BookOpen className="w-4 h-4" /> {t('social.type_recipe')}
            </button>
          </div>

          {/* Imagen */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handlePickImage(e.target.files?.[0])}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="relative w-full rounded-2xl overflow-hidden flex items-center justify-center transition"
            style={{ aspectRatio: '1 / 1', background: 'var(--sv-bg-input)', border: '1px dashed var(--sv-border-strong)' }}
          >
            {preview ? (
              <img src={preview} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center gap-2 sv-muted">
                <ImagePlus className="w-8 h-8" />
                <span className="text-sm font-medium">{t('social.add_photo')}</span>
              </div>
            )}
            {processing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white" style={{ background: 'rgba(0,0,0,0.45)' }}>
                <Loader2 className="w-7 h-7 animate-spin" />
                <span className="text-xs font-semibold">{t('social.optimizing')}</span>
              </div>
            )}
          </button>

          {/* Selector de receta (solo modo RECIPE) */}
          {type === 'RECIPE' && (
            <div>
              <label className="text-xs font-semibold sv-muted">{t('social.choose_recipe')}</label>
              {recipes.length === 0 ? (
                <p className="text-sm sv-dim mt-1">{t('social.no_recipes')}</p>
              ) : (
                <select
                  className="sv-input mt-1"
                  value={recipeId ?? ''}
                  onChange={(e) => setRecipeId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">{t('social.choose_recipe_placeholder')}</option>
                  {recipes.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
                </select>
              )}
            </div>
          )}

          {/* Caption */}
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value.slice(0, 300))}
            placeholder={t('social.caption_placeholder')}
            rows={3}
            className="sv-input resize-none"
          />

          {error && <p className="text-sm" style={{ color: '#F87171' }}>{error}</p>}

          {/* Publicar */}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="sv-btn sv-btn-primary w-full py-3 disabled:opacity-40"
          >
            {submitting
              ? <><Loader2 className="w-5 h-5 animate-spin" /> {t('social.publishing')}</>
              : t('social.publish')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
