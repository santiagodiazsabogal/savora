import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  Trash2, BookOpen, ChevronRight, MoreHorizontal, Flag, Ban, Loader2, Check,
  Clock, ChefHat, Share2, Bookmark, BookmarkCheck,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import LikeButton from './LikeButton'
import { SocialPost, deleteSocialPost, reportSocialPost, blockSocialUser, saveSharedRecipe } from '../../services/api'

interface Props {
  post: SocialPost
  currentUserId: number | null
  onToggleLike: (postId: string) => void
  onDeleted?: (postId: string) => void
  onAuthorBlocked?: (authorId: number) => void
}

const REPORT_REASONS = ['spam', 'inappropriate', 'harassment', 'other'] as const

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: 'Easy', medium: 'Medium', hard: 'Hard',
  beginner: 'Easy', intermediate: 'Medium', advanced: 'Hard',
}

// "Hace cuánto" compacto: now / 5m / 3h / 2d (el feed vive 15 días, no hace falta más).
function timeAgo(iso: string): string {
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return 'now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

// Tarjeta de publicación del feed: autor, imagen, caption, corazón.
// Si es RECIPE, enlaza a la receta. Si es mía, permite borrarla; si no, reportar/bloquear.
export default function PostCard({ post, currentUserId, onToggleLike, onDeleted, onAuthorBlocked }: Props) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [deleting, setDeleting] = useState(false)
  const [sheet, setSheet] = useState<null | 'menu' | 'report'>(null)
  const [busy, setBusy] = useState(false)
  const [reported, setReported] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedRecipeId, setSavedRecipeId] = useState<number | null>(null)

  const isMine = currentUserId != null && post.author.id === currentUserId
  const authorName = post.author.name?.split(' ')[0] || 'Chef'
  const initial = (post.author.name?.trim()?.[0] || 'C').toUpperCase()
  const isRecipe = post.type === 'RECIPE' && post.recipeId != null
  const goToAuthor = () => { if (!isMine && post.author.username) navigate(`/u/${post.author.username}`) }

  // Compartir: hoja nativa del sistema (WhatsApp/Instagram/etc. en móvil);
  // fallback a WhatsApp web si el navegador no soporta navigator.share.
  const handleShare = async () => {
    const what = post.recipeTitle || post.caption || ''
    const text = `${what ? `${what} 🍳 — ` : ''}shared on Savora`
    if (navigator.share) {
      try { await navigator.share({ title: 'Savora', text, url: post.imageUrl }) } catch { /* cancelado */ }
      return
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${post.imageUrl}`)}`, '_blank', 'noopener')
  }

  // Guardar la receta compartida como copia mía (idempotente en el backend).
  const handleSave = async (): Promise<number | null> => {
    if (savedRecipeId != null) return savedRecipeId
    if (saving) return null
    setSaving(true)
    try {
      const res = await saveSharedRecipe(post.id)
      setSavedRecipeId(res.recipeId)
      return res.recipeId
    } catch (err: any) {
      if (err?.message === '401') { localStorage.removeItem('token'); navigate('/login') }
      return null
    } finally {
      setSaving(false)
    }
  }

  // Abrir la receta del post: si es mía voy directo; si es ajena, primero se guarda
  // la copia (getRecipeById exige ownership — sin copia no hay nada que abrir).
  const handleOpenRecipe = async () => {
    if (!isRecipe) return
    if (isMine) { navigate(`/recipes/${post.recipeId}`); return }
    const id = await handleSave()
    if (id != null) navigate(`/recipes/${id}`)
  }

  const handleDelete = async () => {
    if (deleting) return
    if (!window.confirm(t('social.delete_confirm'))) return
    setDeleting(true)
    try {
      await deleteSocialPost(post.id)
      onDeleted?.(post.id)
    } catch {
      setDeleting(false)
    }
  }

  const handleReport = async (reason: string) => {
    if (busy) return
    setBusy(true)
    try {
      await reportSocialPost(post.id, reason)
      setReported(true)
      setSheet(null)
    } catch { /* noop: el usuario puede reintentar */ }
    finally { setBusy(false) }
  }

  const handleBlock = async () => {
    if (busy) return
    setBusy(true)
    try {
      await blockSocialUser(post.author.id)
      setSheet(null)
      onAuthorBlocked?.(post.author.id)
    } catch { setBusy(false) }
  }

  return (
    <div className="sv-glass-solid overflow-hidden">
      {/* Cabecera compacta: autor + @username · hace cuánto (clic → perfil público) */}
      <div className="flex items-center gap-2.5 px-3.5 py-2.5">
        <button
          onClick={goToAuthor}
          disabled={isMine || !post.author.username}
          className="flex items-center gap-2.5 flex-1 min-w-0 text-left transition active:scale-[0.99] disabled:active:scale-100"
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-black text-white"
            style={{ background: 'linear-gradient(135deg, var(--sv-primary), var(--sv-primary-strong))' }}
          >
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate leading-tight">{authorName}</p>
            <p className="text-xs sv-dim truncate leading-tight">
              {post.author.username ? `@${post.author.username} · ` : ''}{timeAgo(post.createdAt)}
            </p>
          </div>
        </button>
        {isRecipe && post.recipeMealTime && (
          <span
            className="text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0"
            style={{ background: 'rgba(255,94,26,0.12)', color: 'var(--sv-primary)', border: '1px solid rgba(255,94,26,0.25)' }}
          >
            {t(`meal_type.options.${post.recipeMealTime}`, { defaultValue: post.recipeMealTime })}
          </span>
        )}
        {isMine ? (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="p-1.5 rounded-lg sv-muted transition hover:opacity-70 disabled:opacity-40"
            aria-label={t('social.delete')}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={() => setSheet('menu')}
            className="p-1.5 rounded-lg sv-muted transition hover:opacity-70"
            aria-label={t('social.more', { defaultValue: 'More options' })}
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Imagen (4:3, más baja que el 1:1 anterior) + chips de la receta encima */}
      <div className="w-full bg-black/5 relative" style={{ aspectRatio: '4 / 3' }}>
        <img src={post.imageUrl} alt={post.caption || authorName} className="w-full h-full object-cover absolute inset-0" loading="lazy" decoding="async" />
        {isRecipe && (post.recipeCookTime != null || post.recipeDifficulty) && (
          <div className="absolute bottom-2 left-2 flex gap-1.5">
            {post.recipeCookTime != null && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full text-white" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
                <Clock className="w-3 h-3" /> {post.recipeCookTime} min
              </span>
            )}
            {post.recipeDifficulty && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full text-white" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
                <ChefHat className="w-3 h-3" /> {DIFFICULTY_LABELS[post.recipeDifficulty] ?? post.recipeDifficulty}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Acciones + caption */}
      <div className="px-3.5 py-2.5">
        <div className="flex items-center gap-1">
          <LikeButton liked={post.likedByMe} count={post.likeCount} onToggle={() => onToggleLike(post.id)} />
          <div className="flex-1" />
          <button
            onClick={handleShare}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold sv-muted transition hover:opacity-70 active:scale-95"
            aria-label={t('social.share', { defaultValue: 'Share' })}
          >
            <Share2 className="w-4 h-4" />
            {t('social.share', { defaultValue: 'Share' })}
          </button>
          {isRecipe && !isMine && (
            <button
              onClick={async () => { await handleSave() }}
              disabled={saving}
              className="p-1.5 rounded-lg transition hover:opacity-70 active:scale-95 disabled:opacity-50"
              style={{ color: savedRecipeId != null ? 'var(--sv-primary)' : undefined }}
              aria-label={t('social.save_recipe', { defaultValue: 'Save recipe' })}
            >
              {saving
                ? <Loader2 className="w-4.5 h-4.5 animate-spin sv-muted" style={{ width: 18, height: 18 }} />
                : savedRecipeId != null
                  ? <BookmarkCheck style={{ width: 18, height: 18 }} />
                  : <Bookmark className="sv-muted" style={{ width: 18, height: 18 }} />}
            </button>
          )}
        </div>

        {post.caption && (
          <p className="text-sm mt-1.5 leading-relaxed">
            <span className="font-bold mr-1.5">{authorName}</span>
            {post.caption}
          </p>
        )}

        {isRecipe && (
          <button
            onClick={handleOpenRecipe}
            disabled={saving}
            className="mt-2.5 w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition active:scale-[0.99] disabled:opacity-60"
            style={{ background: 'rgba(255,94,26,0.1)', border: '1px solid rgba(255,94,26,0.3)', color: 'var(--sv-primary)' }}
          >
            <BookOpen className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left truncate">{post.recipeTitle || t('social.view_recipe')}</span>
            {saving ? <Loader2 className="w-4 h-4 shrink-0 animate-spin" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
          </button>
        )}

        {savedRecipeId != null && (
          <p className="mt-1.5 inline-flex items-center gap-1 text-xs" style={{ color: '#86EFAC' }}>
            <Check className="w-3 h-3" /> {t('social.saved_recipe', { defaultValue: 'Saved to your recipes' })}
          </p>
        )}

        {reported && (
          <p className="mt-2 inline-flex items-center gap-1 text-xs" style={{ color: '#86EFAC' }}>
            <Check className="w-3 h-3" /> {t('social.reported', { defaultValue: 'Reported. Thanks for letting us know.' })}
          </p>
        )}
      </div>

      {/* Action sheet (portal a body porque la tarjeta es overflow-hidden) */}
      {sheet && createPortal(
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => !busy && setSheet(null)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl p-4 pb-7 space-y-2"
            style={{ background: 'var(--sv-bg-elevated)', borderTop: '1px solid var(--sv-border-light)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {sheet === 'menu' ? (
              <>
                <p className="text-center text-sm font-bold sv-muted pb-1">
                  {post.author.username ? `@${post.author.username}` : authorName}
                </p>
                <button
                  onClick={() => setSheet('report')}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition active:scale-[0.99]"
                  style={{ background: 'var(--sv-bg-input)', border: '1px solid var(--sv-border-light)' }}
                >
                  <Flag className="w-5 h-5" style={{ color: 'var(--sv-warning)' }} />
                  <span className="font-semibold text-sm">{t('social.report_post', { defaultValue: 'Report post' })}</span>
                </button>
                <button
                  onClick={handleBlock}
                  disabled={busy}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition active:scale-[0.99] disabled:opacity-60"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}
                >
                  {busy ? <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#F87171' }} /> : <Ban className="w-5 h-5" style={{ color: '#F87171' }} />}
                  <span className="font-semibold text-sm" style={{ color: '#F87171' }}>
                    {t('social.block_user', { name: authorName, defaultValue: `Block ${authorName}` })}
                  </span>
                </button>
                <button
                  onClick={() => setSheet(null)}
                  className="w-full py-3 rounded-xl text-sm font-semibold sv-muted"
                  style={{ background: 'var(--sv-bg-input)' }}
                >
                  {t('common.cancel', { defaultValue: 'Cancel' })}
                </button>
              </>
            ) : (
              <>
                <p className="text-center text-sm font-bold pb-1">{t('social.report_why', { defaultValue: 'Why are you reporting this?' })}</p>
                {REPORT_REASONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => handleReport(r)}
                    disabled={busy}
                    className="w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition active:scale-[0.99] disabled:opacity-60"
                    style={{ background: 'var(--sv-bg-input)', border: '1px solid var(--sv-border-light)' }}
                  >
                    {t(`social.report_reasons.${r}`, { defaultValue: r })}
                  </button>
                ))}
                <button
                  onClick={() => setSheet('menu')}
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
