import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Crown, Clock, UserRound, Carrot, ChefHat, Loader2, Copy, Share2, Mail, MessageCircle, Play, Zap } from 'lucide-react'
import type { BattleState } from '../../hooks/useBattle'
import Countdown from './Countdown'

const COURSES = ['starter', 'main', 'salad', 'dessert', 'drink'] as const

interface Assignment { userId: number; team?: number | null; courseLabel?: string }

interface Props {
  state: BattleState
  myUserId: number | null
  onReady: () => void
  onStart: () => void
  onLeave: () => void
  onAssign: (assignments: Assignment[]) => void
}

export default function BattleLobby({ state, myUserId, onReady, onStart, onLeave, onAssign }: Props) {
  const { t } = useTranslation()
  const me = state.players.find((p) => p.userId === myUserId)
  const readyCount = state.players.filter((p) => p.isReady).length
  const preview = state.recipePreview

  const isPrivate = state.visibility === 'private'
  const isHost = !!me?.isHost
  const isPerPlayer = state.mode === 'buffet' || state.mode === 'teams'
  const isTeams = state.mode === 'teams'

  const teamsBalanced = isTeams
    && state.players.filter((p) => p.team === 0).length === 2
    && state.players.filter((p) => p.team === 1).length === 2
  const canStart = isTeams ? (state.players.length === 4 && teamsBalanced) : state.players.length >= 2

  // Construye el array completo de asignaciones aplicando un cambio sobre un jugador
  const buildAssignments = (override: Assignment): Assignment[] =>
    state.players.map((p) => ({
      userId: p.userId,
      team: p.userId === override.userId && override.team !== undefined ? override.team : (p.team ?? null),
      courseLabel: p.userId === override.userId && override.courseLabel !== undefined ? override.courseLabel : (p.courseLabel ?? undefined),
    }))

  const courseName = (c?: string | null) => t(`battle.course.${c ?? 'main'}`)
  const teamName = (tm?: number | null) => t('battle.team_label', { letter: tm === 1 ? 'B' : 'A' })

  // Compartir el código de la sala privada
  const code = state.joinCode ?? ''
  const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/battle?code=${code}` : ''
  const shareText = t('battle.share_text', { code, url: joinUrl })
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* noop */ }
  }
  const handleNativeShare = async () => {
    try { if (navigator.share) await navigator.share({ title: t('battle.share_title'), text: shareText }) } catch { /* cancelado */ }
  }
  const waHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`
  const mailHref = `mailto:?subject=${encodeURIComponent(t('battle.share_title'))}&body=${encodeURIComponent(shareText)}`

  return (
    <div className="space-y-5 sv-stagger-1">
      {/* Encabezado + cronómetro de lobby (el cronómetro solo aplica a la pública) */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">{t('battle.lobby_title')}</h1>
          <p className="sv-muted text-sm">
            {state.mode === 'chef_choice' ? t('battle.mode_chef_title') : t('battle.mode_ingredients_title')}
          </p>
        </div>
        {!isPrivate && !state.quickStartAt && (
          <div className="flex flex-col items-center rounded-2xl px-4 py-2" style={{ background: 'rgba(255,94,26,0.12)', border: '1px solid rgba(255,94,26,0.3)' }}>
            <Clock className="w-4 h-4" style={{ color: 'var(--sv-primary)' }} />
            <Countdown target={state.lobbyExpiresAt} className="text-lg font-black leading-none mt-1" />
          </div>
        )}
      </div>

      {/* Auto-arranque público: todos listos sin llenar la sala → empieza en 15s */}
      {!isPrivate && state.quickStartAt && (
        <div className="flex items-center justify-center gap-2 rounded-2xl px-4 py-3 sv-stagger-2" style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)' }}>
          <Zap className="w-4 h-4" style={{ color: '#34D399' }} />
          <span className="text-sm font-semibold" style={{ color: '#6EE7B7' }}>{t('battle.starting_in')}</span>
          <Countdown target={state.quickStartAt} className="text-sm font-black" />
        </div>
      )}

      {/* Código de invitación + compartir (solo privada) */}
      {isPrivate && code && (
        <div className="sv-glass p-5 space-y-4 sv-stagger-2">
          <div className="text-center">
            <p className="text-xs font-bold sv-dim uppercase tracking-wider mb-1.5">{t('battle.room_code')}</p>
            <button onClick={handleCopy} className="inline-flex items-center gap-2 font-black" style={{ fontSize: 34, letterSpacing: '0.28em', color: 'var(--sv-primary)' }}>
              {code}
              <Copy className="w-5 h-5" style={{ color: 'var(--sv-text-dim)', letterSpacing: 0 }} />
            </button>
            <p className="text-xs sv-dim mt-1">{copied ? t('battle.copied') : t('battle.tap_to_copy')}</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <a href={waHref} target="_blank" rel="noreferrer" className="sv-btn sv-btn-glass py-3 text-xs" style={{ flexDirection: 'column', height: 'auto', gap: 4 }}>
              <MessageCircle className="w-5 h-5" />{t('battle.share_whatsapp')}
            </a>
            <a href={mailHref} className="sv-btn sv-btn-glass py-3 text-xs" style={{ flexDirection: 'column', height: 'auto', gap: 4 }}>
              <Mail className="w-5 h-5" />{t('battle.share_email')}
            </a>
            <button onClick={handleNativeShare} className="sv-btn sv-btn-glass py-3 text-xs" style={{ flexDirection: 'column', height: 'auto', gap: 4 }}>
              <Share2 className="w-5 h-5" />{t('battle.share_more')}
            </button>
          </div>
        </div>
      )}

      {/* Receta a conseguir (solo chef_choice) */}
      {preview && (
        <div className="sv-glass p-5 space-y-3">
          <div className="flex items-center gap-2">
            <ChefHat className="w-5 h-5" style={{ color: 'var(--sv-primary)' }} />
            <p className="font-bold">{preview.title}</p>
          </div>
          {preview.description && <p className="text-sm sv-muted">{preview.description}</p>}
          <div className="flex items-center gap-1.5 text-xs font-bold sv-dim uppercase tracking-wider pt-1">
            <Carrot className="w-3.5 h-3.5" style={{ color: 'var(--sv-primary)' }} />
            {t('battle.get_ingredients')}
          </div>
          <div className="flex flex-wrap gap-2">
            {preview.ingredients.map((ing, i) => (
              <span key={i} className="px-3 py-1 rounded-full text-xs font-medium" style={{ background: 'rgba(255,94,26,0.1)', color: 'var(--sv-primary)', border: '1px solid rgba(255,94,26,0.2)' }}>
                {ing}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Asignación de cursos/equipos (Buffet/Equipos) */}
      {isPerPlayer && (
        <div className="space-y-2.5">
          <p className="text-sm font-semibold sv-muted">
            {t('battle.players')} ({state.players.length}/{state.maxPlayers})
            {isTeams && <span className="sv-dim"> · {t('battle.teams_need_4')}</span>}
          </p>
          {isHost && <p className="text-xs sv-dim">{t('battle.host_assign_hint')}</p>}

          {state.players.map((p) => (
            <div key={p.userId} className="sv-glass p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(255,94,26,0.15)' }}>
                <UserRound className="w-5 h-5" style={{ color: 'var(--sv-primary)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate flex items-center gap-1">
                  {p.userId === myUserId ? t('battle.you') : (p.name || `Chef #${p.userId}`)}
                  {p.isHost && <Crown className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--sv-warning)' }} />}
                </p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {isTeams && (isHost ? (
                    <div className="flex rounded-lg overflow-hidden shrink-0" style={{ border: '1px solid var(--sv-border-light)' }}>
                      {[0, 1].map((tm) => (
                        <button
                          key={tm}
                          onClick={() => onAssign(buildAssignments({ userId: p.userId, team: tm }))}
                          className="text-xs px-2.5 py-1"
                          style={(p.team ?? 0) === tm ? { background: 'var(--sv-primary)', color: '#fff', fontWeight: 700 } : { color: 'var(--sv-text-dim)' }}
                        >
                          {teamName(tm)}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(139,92,246,0.15)', color: 'var(--sv-clan-accent)' }}>{teamName(p.team)}</span>
                  ))}

                  {isHost ? (
                    <select
                      value={p.courseLabel ?? 'main'}
                      onChange={(e) => onAssign(buildAssignments({ userId: p.userId, courseLabel: e.target.value }))}
                      className="sv-input"
                      style={{ height: 34, padding: '0 8px', fontSize: 13, width: 'auto' }}
                    >
                      {COURSES.map((c) => <option key={c} value={c}>{courseName(c)}</option>)}
                    </select>
                  ) : (
                    <span className="sv-badge sv-badge-primary" style={{ textTransform: 'none', letterSpacing: 0 }}>{courseName(p.courseLabel)}</span>
                  )}
                </div>
              </div>
            </div>
          ))}

          {Array.from({ length: Math.max(0, state.maxPlayers - state.players.length) }).map((_, i) => (
            <div key={`empty-pp-${i}`} className="flex items-center gap-2.5 rounded-2xl p-3" style={{ border: '1px dashed var(--sv-border-strong)' }}>
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--sv-bg-input)' }}>
                <Loader2 className="w-4 h-4 sv-dim animate-spin" />
              </div>
              <p className="text-xs sv-dim">{t('battle.waiting_player')}</p>
            </div>
          ))}
        </div>
      )}

      {/* Jugadores (modos con receta compartida) */}
      {!isPerPlayer && (
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold sv-muted">
            {t('battle.players')} ({state.players.length}/{state.maxPlayers})
          </p>
          {!isPrivate && <p className="text-xs sv-dim">{t('battle.ready_count', { count: readyCount })}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {state.players.map((p) => {
            const showReady = !isPrivate && p.isReady
            return (
              <div
                key={p.userId}
                className="flex items-center gap-2.5 rounded-2xl p-3"
                style={showReady
                  ? { background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)' }
                  : { background: 'var(--sv-bg-surface)', border: '1px solid var(--sv-border-light)' }}
              >
                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(255,94,26,0.15)' }}>
                  <UserRound className="w-5 h-5" style={{ color: 'var(--sv-primary)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate flex items-center gap-1">
                    {p.userId === myUserId ? t('battle.you') : (p.name || `Chef #${p.userId}`)}
                    {p.isHost && <Crown className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--sv-warning)' }} />}
                  </p>
                  <p className="text-xs" style={{ color: showReady ? '#6EE7B7' : 'var(--sv-text-dim)' }}>
                    {isPrivate ? (p.isHost ? t('battle.host') : t('battle.guest')) : (p.isReady ? t('battle.ready') : t('battle.not_ready'))}
                  </p>
                </div>
                {showReady && <Check className="w-4 h-4 shrink-0" style={{ color: '#34D399' }} />}
              </div>
            )
          })}
          {/* Slots vacíos */}
          {Array.from({ length: Math.max(0, state.maxPlayers - state.players.length) }).map((_, i) => (
            <div key={`empty-${i}`} className="flex items-center gap-2.5 rounded-2xl p-3" style={{ border: '1px dashed var(--sv-border-strong)' }}>
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--sv-bg-input)' }}>
                <Loader2 className="w-4 h-4 sv-dim animate-spin" />
              </div>
              <p className="text-xs sv-dim">{t('battle.waiting_player')}</p>
            </div>
          ))}
        </div>
      </div>
      )}

      {/* Acciones */}
      <div className="flex gap-3 pt-2">
        <button onClick={onLeave} className="sv-btn sv-btn-glass px-5 py-3.5">
          {t('battle.leave')}
        </button>

        {isPrivate ? (
          isHost ? (
            <button onClick={onStart} disabled={!canStart} className="sv-btn sv-btn-primary flex-1 py-3.5">
              <Play className="w-5 h-5" />
              {canStart ? t('battle.start_game') : (isTeams ? t('battle.teams_need_4') : t('battle.need_players'))}
            </button>
          ) : (
            <button disabled className="sv-btn sv-btn-glass flex-1 py-3.5" style={{ opacity: 0.75 }}>
              <Loader2 className="w-4 h-4 animate-spin" /> {t('battle.waiting_host')}
            </button>
          )
        ) : (
          <button
            onClick={onReady}
            disabled={me?.isReady}
            className={`sv-btn flex-1 py-3.5 ${me?.isReady ? 'sv-btn-success' : 'sv-btn-primary'}`}
            style={me?.isReady ? { opacity: 1 } : undefined}
          >
            {me?.isReady ? (
              <><Check className="w-5 h-5" /> {t('battle.youre_ready')}</>
            ) : (
              t('battle.im_ready')
            )}
          </button>
        )}
      </div>
    </div>
  )
}
