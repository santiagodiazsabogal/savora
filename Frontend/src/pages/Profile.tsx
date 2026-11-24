import { useState, useEffect, useContext } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { ChefHat, Leaf, Target, AlertCircle, Check, Loader2, User, Mail, Sparkles, Flame, Trophy, ChevronRight, AtSign, Trash2, AlertTriangle, ShieldAlert, MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Container from '../components/ui/Container'
import LoadingScreen from '../components/ui/LoadingScreen'
import { getProfile, updateProfile, getBadges, getCachedBadges, deleteAccount, type BadgeItem } from '../services/api'
import { BadgeIcon, badgeColor, badgeSoftBg } from '../utils/badgeIcon'
import { AuthContext } from '../context/AuthContext'

const COOKING_LEVELS = [
  { value: 'beginner',     emoji: '🥄' },
  { value: 'intermediate', emoji: '🍳' },
  { value: 'advanced',     emoji: '👨‍🍳' },
]

const DIET_TYPES = [
  { value: 'omnivore',     emoji: '🍖' },
  { value: 'vegetarian',   emoji: '🥦' },
  { value: 'vegan',        emoji: '🌱' },
  { value: 'gluten_free',  emoji: '🌾' },
  { value: 'lactose_free', emoji: '🥛' },
  { value: 'keto',         emoji: '🥑' },
]

const GOALS = [
  { value: 'eat_healthy',   emoji: '💚' },
  { value: 'save_money',    emoji: '💰' },
  { value: 'learn_cooking', emoji: '📚' },
  { value: 'explore',       emoji: '🌍' },
  { value: 'cook_fast',     emoji: '⚡' },
]

function OptionButton({ selected, onClick, emoji, label, fullWidth = false }: {
  selected: boolean; onClick: () => void; emoji: string; label: string; fullWidth?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`${fullWidth ? 'w-full' : ''} flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 active:scale-95 text-left`}
      style={selected
        ? { border: '1px solid var(--sv-primary)', background: 'var(--sv-primary-soft)', color: 'var(--sv-primary)' }
        : { border: '1px solid var(--sv-border-light)', background: 'var(--sv-bg-elevated)', color: 'var(--sv-text-muted)' }}
    >
      <span className="text-base shrink-0">{emoji}</span>
      <span className="flex-1 leading-tight text-xs">{label}</span>
      <span className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={selected ? { background: 'var(--sv-primary)' } : { border: '2px solid var(--sv-border-strong)' }}>
        {selected && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
      </span>
    </button>
  )
}

export default function Profile() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const auth = useContext(AuthContext)

  const [showDelete, setShowDelete] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const [profile, setProfile] = useState<any>(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [cookingLevel, setCookingLevel] = useState('')
  const [dietType, setDietType] = useState('')
  const [goal, setGoal] = useState('')
  const [allergies, setAllergies] = useState('')
  const [zipCode, setZipCode] = useState('')
  // Arranca con lo cacheado (última carga) → el contador de insignias aparece al instante;
  // getBadges() revalida en 2º plano.
  const [badges, setBadges] = useState<BadgeItem[]>(getCachedBadges() ?? [])

  useEffect(() => {
    async function load() {
      try {
        const data = await getProfile()
        setProfile(data)
        setName(data.name || '')
        setUsername(data.username || '')
        setCookingLevel(data.cookingLevel || '')
        setDietType(data.dietType || '')
        setGoal(data.goal || '')
        setAllergies(data.allergies || '')
        setZipCode(data.zipCode || '')
      } catch (err: any) {
        if (err.message === '401') { localStorage.removeItem('token'); navigate('/login') }
      } finally {
        setInitialLoading(false)
      }
    }
    load()
    // Insignias (no bloquea la carga del perfil).
    getBadges().then(setBadges).catch(() => {})
  }, [navigate])

  const handleSave = async () => {
    setSaving(true); setError(''); setSaved(false)
    try {
      // cookingLevel ya NO se envía: es automático (sube con el XP).
      // zipCode solo se manda si es válido (5 dígitos) — vacío no lo toca.
      await updateProfile({
        name, dietType, goal, allergies, username: username || undefined,
        ...(/^\d{5}$/.test(zipCode) ? { zipCode } : {}),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e: any) {
      const m = e?.message
      if (m === 'USERNAME_TAKEN') setError(t('profile.username_taken', { defaultValue: 'Ese @usuario ya está en uso' }))
      else if (m === 'USERNAME_INVALID') setError(t('profile.username_invalid', { defaultValue: '@usuario inválido (3-20 caracteres: letras, números o _)' }))
      else setError(t('common.error_generic'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (deleting || !deletePassword) return
    setDeleting(true); setDeleteError('')
    try {
      await deleteAccount(deletePassword)
      // Cuenta eliminada → cerrar sesión y mandar al login con aviso.
      auth?.logout()
      localStorage.removeItem('token')
      navigate('/login?deleted=1', { replace: true })
    } catch (e: any) {
      if (e?.message === 'WRONG_PASSWORD') setDeleteError(t('profile.delete_wrong_password', { defaultValue: 'Contraseña incorrecta.' }))
      else setDeleteError(t('profile.delete_error', { defaultValue: 'No se pudo eliminar la cuenta. Intenta de nuevo.' }))
      setDeleting(false)
    }
  }

  if (initialLoading) return <LoadingScreen />

  // Progreso de XP del nivel actual (para la barra).
  const nivel = profile?.nivel ?? 1
  const xpTotal = profile?.xpTotal ?? 0
  const xpCur = profile?.xpForCurrentLevel ?? 0
  const xpNext = profile?.xpForNextLevel ?? 100
  const xpIntoLevel = Math.max(0, xpTotal - xpCur)
  const xpLevelSpan = Math.max(1, xpNext - xpCur)
  const xpPct = Math.min(100, Math.round((xpIntoLevel / xpLevelSpan) * 100))
  const streak = profile?.cookingStreak ?? 0
  const earnedBadges = badges.filter(b => b.completada)

  return (
    <Container backButton backTo="/dashboard">
      <div className="space-y-7 pb-10">

        {/* Header */}
        <div>
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: 'linear-gradient(135deg, var(--sv-primary), #FF8B54)', boxShadow: '0 8px 24px var(--sv-primary-glow)' }}>
            <span className="text-white font-bold text-xl">
              {name ? name.trim().split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase() : '?'}
            </span>
          </div>
          <h1 className="text-2xl font-black">{t('profile.title')}</h1>
          <p className="sv-muted text-sm mt-1">
            {t('profile.plan_label')}:{' '}
            <span className="font-semibold" style={{ color: 'var(--sv-primary)' }}>
              {profile?.plan === 'CHEF' ? t('profile.plan_chef', { defaultValue: 'CHEF' }) : profile?.plan === 'PRO' ? t('profile.plan_pro') : t('profile.plan_free')}
            </span>
          </p>

          {/* Insignias ganadas (medallas) bajo el nombre → toca para ver todas */}
          {earnedBadges.length > 0 && (
            <button
              onClick={() => navigate('/achievements')}
              className="flex flex-wrap items-center gap-1.5 mt-3 transition active:scale-95"
              aria-label={t('achievements.title', { defaultValue: 'Logros' })}
            >
              {earnedBadges.slice(0, 8).map(b => (
                <span
                  key={b.id}
                  title={t(`badges.items.${b.id}.name`, { defaultValue: b.nombre })}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: badgeSoftBg(b.categoria), border: '1px solid var(--sv-border-light)' }}
                >
                  <BadgeIcon id={b.id} categoria={b.categoria} className="w-4 h-4" style={{ color: badgeColor(b.categoria) }} />
                </span>
              ))}
              {earnedBadges.length > 8 && (
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold sv-muted" style={{ background: 'var(--sv-bg-input)', border: '1px solid var(--sv-border-light)' }}>
                  +{earnedBadges.length - 8}
                </span>
              )}
            </button>
          )}
        </div>

        {/* XP / Nivel global */}
        <div className="sv-glass p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,94,26,0.15)' }}>
                <Sparkles className="w-5 h-5" style={{ color: 'var(--sv-primary)' }} />
              </div>
              <div>
                <p className="text-[11px] sv-dim uppercase tracking-wide">{t('profile.level_label', { defaultValue: 'Nivel' })}</p>
                <p className="text-2xl font-black leading-none">{nivel}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[11px] sv-dim uppercase tracking-wide">{t('profile.xp_total', { defaultValue: 'XP total' })}</p>
              <p className="text-lg font-bold" style={{ color: 'var(--sv-primary)' }}>{xpTotal}</p>
            </div>
          </div>

          <div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--sv-border-light)' }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${xpPct}%`, background: 'linear-gradient(90deg, #FF8B54, var(--sv-primary))' }} />
            </div>
            <p className="text-[11px] sv-dim mt-1.5">
              {xpIntoLevel} / {xpLevelSpan} XP · {t('profile.to_level', { level: nivel + 1, defaultValue: `al nivel ${nivel + 1}` })}
            </p>
          </div>

          {streak > 0 && (
            <div className="flex items-center gap-1.5 text-sm sv-muted">
              <Flame className="w-4 h-4" style={{ color: 'var(--sv-warning)' }} />
              {t('profile.streak_days', { count: streak, defaultValue: `Racha: ${streak} días` })}
            </div>
          )}
        </div>

        {/* Logros / Insignias → página dedicada */}
        <button
          onClick={() => navigate('/achievements')}
          className="sv-glass p-4 w-full flex items-center gap-3 transition active:scale-[0.98] text-left"
        >
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,94,26,0.15)' }}>
            <Trophy className="w-5 h-5" style={{ color: 'var(--sv-primary)' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm">{t('achievements.title', { defaultValue: 'Logros' })}</p>
            <p className="text-[11px] sv-dim">
              {badges.length
                ? t('achievements.subtitle', { unlocked: earnedBadges.length, total: badges.length, defaultValue: `${earnedBadges.length} de ${badges.length} desbloqueadas` })
                : t('achievements.view_all', { defaultValue: 'Ver todas tus insignias' })}
            </p>
          </div>
          <ChevronRight className="w-5 h-5 sv-dim shrink-0" />
        </button>

        {/* Panel de moderación (solo admins) */}
        {profile?.isAdmin && (
          <button
            onClick={() => navigate('/admin')}
            className="sv-glass p-4 w-full flex items-center gap-3 transition active:scale-[0.98] text-left"
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(239,68,68,0.12)' }}>
              <ShieldAlert className="w-5 h-5" style={{ color: '#F87171' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm">{t('profile.moderation', { defaultValue: 'Moderación' })}</p>
              <p className="text-[11px] sv-dim">{t('profile.moderation_sub', { defaultValue: 'Revisar reportes y banear usuarios' })}</p>
            </div>
            <ChevronRight className="w-5 h-5 sv-dim shrink-0" />
          </button>
        )}

        {/* Nombre */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-semibold sv-muted">
            <User className="w-4 h-4" style={{ color: 'var(--sv-primary)' }} />
            {t('profile.name_label')}
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="sv-input w-full text-base"
            style={{ paddingLeft: 16 }}
          />
        </div>

        {/* Username (@handle) */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-semibold sv-muted">
            <AtSign className="w-4 h-4" style={{ color: 'var(--sv-primary)' }} />
            {t('profile.username_label', { defaultValue: 'Usuario' })}
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 sv-dim text-base">@</span>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20))}
              placeholder={t('profile.username_placeholder', { defaultValue: 'tu_usuario' })}
              autoCapitalize="none"
              autoCorrect="off"
              className="sv-input w-full text-base"
              style={{ paddingLeft: 30 }}
            />
          </div>
          <p className="text-[11px] sv-dim">{t('profile.username_hint', { defaultValue: 'Tu identificador único para que te encuentren tus amigos.' })}</p>
        </div>

        {/* Email */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-semibold sv-muted">
            <Mail className="w-4 h-4" style={{ color: 'var(--sv-primary)' }} />
            {t('profile.email_label')}
          </label>
          <div className="w-full rounded-xl px-4 py-3 sv-dim text-base select-none" style={{ background: 'var(--sv-bg-input)', border: '1px solid var(--sv-border-light)' }}>
            {profile?.email}
          </div>
        </div>

        {/* Cooking level — AUTOMÁTICO: sube solo con el XP, ya no se edita aquí */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-semibold sv-muted">
            <ChefHat className="w-4 h-4" style={{ color: 'var(--sv-primary)' }} />
            {t('profile.cooking_level')}
          </label>
          <div className="w-full rounded-xl px-4 py-3 flex items-center justify-between" style={{ background: 'var(--sv-bg-input)', border: '1px solid var(--sv-border-light)' }}>
            <span className="text-base font-medium inline-flex items-center gap-2">
              <span>{COOKING_LEVELS.find(o => o.value === cookingLevel)?.emoji ?? '🍳'}</span>
              {cookingLevel ? t(`profile.cooking_levels.${cookingLevel}`) : '—'}
            </span>
            <span className="text-[11px] sv-dim">{t('profile.cooking_level_auto', { defaultValue: 'sube con tu XP' })}</span>
          </div>
        </div>

        {/* Diet type */}
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm font-semibold sv-muted">
            <Leaf className="w-4 h-4" style={{ color: 'var(--sv-primary)' }} />
            {t('profile.diet_type')}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {DIET_TYPES.map(opt => (
              <OptionButton
                key={opt.value}
                selected={dietType === opt.value}
                onClick={() => setDietType(opt.value)}
                emoji={opt.emoji}
                label={t(`profile.diet_types.${opt.value}`)}
              />
            ))}
          </div>
        </div>

        {/* Goal */}
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm font-semibold sv-muted">
            <Target className="w-4 h-4" style={{ color: 'var(--sv-primary)' }} />
            {t('profile.goal')}
          </label>
          <div className="flex flex-col gap-2">
            {GOALS.map(opt => (
              <OptionButton
                key={opt.value}
                selected={goal === opt.value}
                onClick={() => setGoal(opt.value)}
                emoji={opt.emoji}
                label={t(`profile.goals.${opt.value}`)}
                fullWidth
              />
            ))}
          </div>
        </div>

        {/* Allergies */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-semibold sv-muted">
            <AlertCircle className="w-4 h-4" style={{ color: 'var(--sv-primary)' }} />
            {t('profile.allergies')}
          </label>
          <textarea
            value={allergies}
            onChange={e => setAllergies(e.target.value)}
            placeholder={t('profile.allergies_placeholder')}
            rows={2}
            className="sv-input w-full text-base resize-none"
            style={{ paddingLeft: 16 }}
          />
        </div>

        {/* ZIP (para precios reales del mercado) */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-semibold sv-muted">
            <MapPin className="w-4 h-4" style={{ color: 'var(--sv-primary)' }} />
            {t('profile.zip_label')}
          </label>
          <input
            value={zipCode}
            onChange={e => setZipCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
            placeholder={t('profile.zip_placeholder')}
            inputMode="numeric"
            className="sv-input w-full text-base"
            style={{ paddingLeft: 16 }}
          />
          <p className="text-xs sv-dim">{t('profile.zip_hint')}</p>
        </div>

        {error && (
          <div className="rounded-xl px-4 py-3 text-sm text-center" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }}>
            {error}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className={`sv-btn w-full py-4 text-base ${saved ? 'sv-btn-success' : 'sv-btn-primary'}`}
        >
          {saving
            ? <><Loader2 className="w-5 h-5 animate-spin" /> {t('common.saving')}</>
            : saved
            ? <><Check className="w-5 h-5" /> {t('common.saved')}</>
            : t('common.save')
          }
        </button>

        {/* Zona de peligro: eliminar cuenta */}
        <div className="pt-4 mt-2" style={{ borderTop: '1px solid var(--sv-border-light)' }}>
          <p className="text-[11px] font-bold uppercase tracking-wide sv-dim mb-2">
            {t('profile.danger_zone', { defaultValue: 'Zona de peligro' })}
          </p>
          <button
            onClick={() => { setDeletePassword(''); setDeleteError(''); setShowDelete(true) }}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition active:scale-[0.99]"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#F87171' }}
          >
            <Trash2 className="w-4 h-4" /> {t('profile.delete_account', { defaultValue: 'Eliminar mi cuenta' })}
          </button>
        </div>

        {/* Enlaces legales (también accesibles desde ajustes — buena práctica para el review) */}
        <div className="flex items-center justify-center gap-4 pt-1 text-xs sv-dim">
          <a href="/terms" target="_blank" rel="noreferrer" className="hover:underline">{t('profile.terms', { defaultValue: 'Términos' })}</a>
          <span>·</span>
          <a href="/privacy" target="_blank" rel="noreferrer" className="hover:underline">{t('profile.privacy', { defaultValue: 'Privacidad' })}</a>
        </div>

      </div>

      {/* Modal de confirmación (portal a body) */}
      {showDelete && createPortal(
        <div
          className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => !deleting && setShowDelete(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl p-6 mb-4 sm:mb-0"
            style={{ background: 'var(--sv-bg-elevated)', border: '1px solid var(--sv-border-light)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: 'rgba(239,68,68,0.12)' }}>
              <AlertTriangle className="w-6 h-6" style={{ color: '#F87171' }} />
            </div>
            <h2 className="text-lg font-black text-center">{t('profile.delete_title', { defaultValue: '¿Eliminar tu cuenta?' })}</h2>
            <p className="text-sm sv-muted text-center mt-2 leading-relaxed">
              {t('profile.delete_warning', { defaultValue: 'Esta acción es irreversible. Tus datos se anonimizan y tus publicaciones se eliminan. No podrás recuperar la cuenta.' })}
            </p>

            <label className="block text-xs font-semibold sv-muted mt-4 mb-1.5">
              {t('profile.delete_confirm_password', { defaultValue: 'Confirma con tu contraseña' })}
            </label>
            <input
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder="••••••••"
              autoFocus
              className="sv-input w-full text-base"
              style={{ paddingLeft: 16 }}
            />

            {deleteError && (
              <p className="text-xs text-center mt-2" style={{ color: '#FCA5A5' }}>{deleteError}</p>
            )}

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowDelete(false)}
                disabled={deleting}
                className="flex-1 py-3 rounded-xl text-sm font-semibold sv-muted disabled:opacity-50"
                style={{ background: 'var(--sv-bg-input)', border: '1px solid var(--sv-border-light)' }}
              >
                {t('common.cancel', { defaultValue: 'Cancelar' })}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting || !deletePassword}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: '#EF4444' }}
              >
                {deleting
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('profile.deleting', { defaultValue: 'Eliminando…' })}</>
                  : <><Trash2 className="w-4 h-4" /> {t('profile.delete_confirm', { defaultValue: 'Eliminar' })}</>}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </Container>
  )
}