import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Sparkles, UserPlus, Check, Clock, UserCheck, Loader2, Shield, Flag, Ban, Trophy } from 'lucide-react'
import Container from '../components/ui/Container'
import LoadingScreen from '../components/ui/LoadingScreen'
import {
  getPublicProfile, sendFriendRequest, acceptFriendRequest, removeFriend,
  reportSocialUser, blockSocialUser,
  type PublicProfile as PublicProfileT, type FriendStatus,
} from '../services/api'

const REPORT_REASONS = ['spam', 'inappropriate', 'harassment', 'other'] as const
import { BadgeIcon, badgeColor, badgeSoftBg } from '../utils/badgeIcon'

export default function PublicProfile() {
  const { username = '' } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [profile, setProfile] = useState<PublicProfileT | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<FriendStatus>('none')
  const [friendshipId, setFriendshipId] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [sheet, setSheet] = useState<boolean>(false)
  const [modBusy, setModBusy] = useState(false)
  const [reported, setReported] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    getPublicProfile(username)
      .then(p => {
        if (!active) return
        // Si es tu propio perfil, manda al perfil editable.
        if (p.isSelf) { navigate('/profile', { replace: true }); return }
        setProfile(p)
        setStatus(p.friendship.status)
        setFriendshipId(p.friendship.friendshipId)
      })
      .catch((err: any) => {
        if (err.message === '401') { localStorage.removeItem('token'); navigate('/login'); return }
        if (active) setError(t('publicProfile.not_found', { defaultValue: 'Usuario no encontrado' }))
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [username, navigate, t])

  const onAdd = async () => {
    if (!profile || busy) return
    setBusy(true)
    try {
      const r = await sendFriendRequest({ userId: profile.id })
      setStatus(r.status); setFriendshipId(r.friendshipId)
    } catch { /* noop */ } finally { setBusy(false) }
  }
  const onAccept = async () => {
    if (!friendshipId || busy) return
    setBusy(true)
    try { await acceptFriendRequest(friendshipId); setStatus('friends') }
    catch { /* noop */ } finally { setBusy(false) }
  }
  const onRemove = async () => {
    if (!profile || busy) return
    setBusy(true)
    try { await removeFriend(profile.id); setStatus('none'); setFriendshipId(undefined) }
    catch { /* noop */ } finally { setBusy(false) }
  }

  const onReport = async (reason: string) => {
    if (!profile || modBusy) return
    setModBusy(true)
    try { await reportSocialUser(profile.id, reason); setReported(true); setSheet(false) }
    catch { /* noop */ } finally { setModBusy(false) }
  }
  const onBlock = async () => {
    if (!profile || modBusy) return
    const who = profile.name || profile.username || ''
    if (!window.confirm(t('publicProfile.block_confirm', { name: who, defaultValue: `¿Bloquear a ${who}? Dejaréis de veros y se eliminará la amistad.` }))) return
    setModBusy(true)
    try { await blockSocialUser(profile.id); navigate('/social') }
    catch { setModBusy(false) }
  }

  if (loading) return <LoadingScreen />
  if (error || !profile) {
    return (
      <Container backButton>
        <div className="sv-glass p-8 text-center mt-10">
          <p className="text-sm sv-muted">{error || t('publicProfile.not_found', { defaultValue: 'Usuario no encontrado' })}</p>
        </div>
      </Container>
    )
  }

  const name = profile.name || profile.username || '?'
  const initials = name.trim().split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
  const xpInto = Math.max(0, profile.xpTotal - profile.xpForCurrentLevel)
  const xpSpan = Math.max(1, profile.xpForNextLevel - profile.xpForCurrentLevel)
  const xpPct = Math.min(100, Math.round((xpInto / xpSpan) * 100))

  return (
    <Container backButton>
      <div className="space-y-6 pb-10">

        {/* Header */}
        <div className="flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mb-3" style={{ background: 'linear-gradient(135deg, var(--sv-primary), #FF8B54)', boxShadow: '0 8px 24px var(--sv-primary-glow)' }}>
            <span className="text-white font-bold text-2xl">{initials}</span>
          </div>
          <h1 className="text-2xl font-black leading-tight">{name}</h1>
          {profile.username && <p className="sv-dim text-sm">@{profile.username}</p>}

          {/* Acción de amistad */}
          <div className="mt-4 w-full max-w-xs">
            <FriendButton status={status} busy={busy} t={t} onAdd={onAdd} onAccept={onAccept} onRemove={onRemove} />
          </div>

          {/* Reportar / Bloquear */}
          <div className="mt-3 flex items-center justify-center gap-5">
            <button onClick={() => setSheet(true)} disabled={reported} className="text-xs font-semibold sv-dim hover:opacity-80 flex items-center gap-1 disabled:opacity-50">
              <Flag className="w-3.5 h-3.5" /> {reported ? t('social.reported', { defaultValue: 'Reportado' }) : t('publicProfile.report', { defaultValue: 'Reportar' })}
            </button>
            <button onClick={onBlock} disabled={modBusy} className="text-xs font-semibold flex items-center gap-1 hover:opacity-80 disabled:opacity-50" style={{ color: '#F87171' }}>
              {modBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />} {t('publicProfile.block', { defaultValue: 'Bloquear' })}
            </button>
          </div>
        </div>

        {/* Nivel / XP */}
        <div className="sv-glass p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,94,26,0.15)' }}>
                <Sparkles className="w-5 h-5" style={{ color: 'var(--sv-primary)' }} />
              </div>
              <div>
                <p className="text-[11px] sv-dim uppercase tracking-wide">{t('profile.level_label', { defaultValue: 'Nivel' })}</p>
                <p className="text-2xl font-black leading-none">{profile.nivel}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[11px] sv-dim uppercase tracking-wide">{t('profile.xp_total', { defaultValue: 'XP total' })}</p>
              <p className="text-lg font-bold" style={{ color: 'var(--sv-primary)' }}>{profile.xpTotal}</p>
            </div>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--sv-border-light)' }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${xpPct}%`, background: 'linear-gradient(90deg, #FF8B54, var(--sv-primary))' }} />
          </div>
        </div>

        {/* Clan */}
        {profile.clan && (
          <button
            onClick={() => navigate(`/clans/${profile.clan!.id}`)}
            className="sv-glass p-4 w-full flex items-center gap-3 transition active:scale-[0.98] text-left"
          >
            <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center shrink-0" style={{ background: 'var(--sv-clan-accent)' }}>
              {profile.clan.avatarUrl
                ? <img src={profile.clan.avatarUrl} alt="" className="w-full h-full object-cover" />
                : <Shield className="w-5 h-5 text-white" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] sv-dim uppercase tracking-wide">{t('publicProfile.clan_label', { defaultValue: 'Clan' })}</p>
              <p className="font-bold text-sm truncate">{profile.clan.nombre}</p>
            </div>
          </button>
        )}

        {/* Insignias ganadas */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold sv-muted flex items-center gap-2">
            <Trophy className="w-4 h-4" style={{ color: 'var(--sv-primary)' }} />
            {t('publicProfile.badges_title', { defaultValue: 'Insignias' })}
            <span className="sv-dim font-normal">({profile.badges.length})</span>
          </h2>
          {profile.badges.length === 0 ? (
            <p className="text-xs sv-dim">{t('publicProfile.no_badges', { defaultValue: 'Aún no tiene insignias.' })}</p>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {profile.badges.map(b => (
                <div key={b.id} className="sv-glass p-3 flex items-center gap-2.5" style={{ border: '1px solid var(--sv-primary)' }}>
                  <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: badgeSoftBg(b.categoria) }}>
                    <BadgeIcon id={b.id} categoria={b.categoria} className="w-[18px] h-[18px]" style={{ color: badgeColor(b.categoria) }} />
                  </span>
                  <p className="text-xs font-semibold leading-tight truncate">
                    {t(`badges.items.${b.id}.name`, { defaultValue: b.nombre })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Sheet de motivos de reporte (portal a body) */}
      {sheet && createPortal(
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => !modBusy && setSheet(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl p-4 pb-7 space-y-2"
            style={{ background: 'var(--sv-bg-elevated)', borderTop: '1px solid var(--sv-border-light)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-center text-sm font-bold pb-1">{t('social.report_why', { defaultValue: '¿Por qué reportas a esta persona?' })}</p>
            {REPORT_REASONS.map((r) => (
              <button
                key={r}
                onClick={() => onReport(r)}
                disabled={modBusy}
                className="w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition active:scale-[0.99] disabled:opacity-60"
                style={{ background: 'var(--sv-bg-input)', border: '1px solid var(--sv-border-light)' }}
              >
                {t(`social.report_reasons.${r}`, { defaultValue: r })}
              </button>
            ))}
            <button onClick={() => setSheet(false)} className="w-full py-3 rounded-xl text-sm font-semibold sv-muted" style={{ background: 'var(--sv-bg-input)' }}>
              {t('common.cancel', { defaultValue: 'Cancelar' })}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </Container>
  )
}

function FriendButton({ status, busy, t, onAdd, onAccept, onRemove }: {
  status: FriendStatus; busy: boolean; t: (k: string, o?: any) => string
  onAdd: () => void; onAccept: () => void; onRemove: () => void
}) {
  if (busy) {
    return <button disabled className="sv-btn sv-btn-glass w-full py-3 opacity-70"><Loader2 className="w-5 h-5 animate-spin" /></button>
  }
  switch (status) {
    case 'friends':
      return (
        <button onClick={onRemove} className="sv-btn sv-btn-glass w-full py-3">
          <UserCheck className="w-5 h-5" /> {t('friends.friends_label', { defaultValue: 'Amigos' })}
        </button>
      )
    case 'request_sent':
      return (
        <button onClick={onRemove} className="sv-btn sv-btn-glass w-full py-3">
          <Clock className="w-5 h-5" /> {t('friends.requested', { defaultValue: 'Solicitud enviada' })}
        </button>
      )
    case 'request_received':
      return (
        <button onClick={onAccept} className="sv-btn sv-btn-primary w-full py-3">
          <Check className="w-5 h-5" /> {t('friends.accept', { defaultValue: 'Aceptar solicitud' })}
        </button>
      )
    default:
      return (
        <button onClick={onAdd} className="sv-btn sv-btn-primary w-full py-3">
          <UserPlus className="w-5 h-5" /> {t('friends.add', { defaultValue: 'Agregar amigo' })}
        </button>
      )
  }
}
