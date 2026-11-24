import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft, Shield, Users, Trophy, Lock, Globe, Crown, Star,
  LogOut, UserPlus, Check, X, ChevronUp, ChevronDown, UserMinus, Clock, MessageCircle, Target, CheckCircle2, ChevronRight,
} from 'lucide-react'
import {
  getClanDetail, getProfile, joinClan, leaveClan,
  acceptClanRequest, rejectClanRequest, promoteClanMember, demoteClanMember, kickClanMember,
  getClanMissions,
} from '../services/api'

interface Member {
  userId: number
  rol: string
  xpAportadoSemana: number
  nombre: string | null
  email: string
  nivel: number
  username: string | null
}
interface ClanRequestItem {
  id: string
  userId: number
  nombre: string | null
  email: string
  nivel: number
}
interface ClanDetailData {
  id: string
  nombre: string
  descripcion: string
  tipoAcceso: string
  especializacion: string | null
  avatarUrl: string | null
  xpColectivoSemanal: number
  xpColectivoTotal: number
  ranking: number
  miRol: string | null
  esMiembro: boolean
  miembros: Member[]
  solicitudes: ClanRequestItem[]
}

interface ClanMission {
  id: string
  dificultad: string
  titulo: string
  descripcion: string
  key: string | null
  tipo: string
  meta: number
  progresoActual: number
  completada: boolean
  xpRecompensaPorMiembro: number
}

const displayName = (m: { nombre: string | null; email: string }) => m.nombre || m.email.split('@')[0]

const DIFFICULTY_COLOR: Record<string, string> = {
  facil: '#34D399',
  media: 'var(--sv-warning)',
  dificil: '#F87171',
}

export default function ClanDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [clan, setClan] = useState<ClanDetailData | null>(null)
  const [missions, setMissions] = useState<ClanMission[]>([])
  const [myId, setMyId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [requested, setRequested] = useState(false)
  const [error, setError] = useState('')
  const [showMembers, setShowMembers] = useState(false)

  const load = async () => {
    if (!id) return
    try {
      const [detail, profile] = await Promise.all([
        getClanDetail(id),
        getProfile().catch(() => null),
      ])
      setClan(detail)
      setMyId(profile?.id ?? null)
      if (detail?.esMiembro) {
        getClanMissions(id).then(setMissions).catch(() => setMissions([]))
      } else {
        setMissions([])
      }
    } catch (err: any) {
      if (err.message === '401') { localStorage.removeItem('token'); navigate('/login'); return }
      setError(t('clans.error_load'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn: () => Promise<any>, reload = true) => {
    setBusy(true)
    setError('')
    try {
      const res = await fn()
      if (reload) await load()
      return res
    } catch (err: any) {
      if (err.message === '401') { localStorage.removeItem('token'); navigate('/login'); return }
      setError(err.message === 'CLAN_FULL' ? t('clans.full_error') : (err.message || t('common.error_generic')))
    } finally {
      setBusy(false)
    }
  }

  const handleJoin = async () => {
    const res = await act(() => joinClan(id!), false)
    if (res?.requested) { setRequested(true) }
    else if (res?.joined) { await load() }
  }

  const handleLeave = async () => {
    if (!window.confirm(t('clans.leave_confirm'))) return
    const res = await act(() => leaveClan(id!), false)
    if (res) navigate('/clans', { replace: true })
  }

  if (loading) {
    return (
      <div className="sv-screen flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--sv-clan-accent)', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (!clan) {
    return (
      <div className="sv-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="sv-muted">{error || t('clans.error_load')}</p>
        <button onClick={() => navigate('/clans')} className="sv-btn sv-btn-primary px-5 py-3">{t('common.back')}</button>
      </div>
    )
  }

  const isManager = clan.miRol === 'lider' || clan.miRol === 'co_lider'
  const isLeader = clan.miRol === 'lider'

  return (
    <div className="sv-screen sv-page flex flex-col">
      <div className="sv-orbs"><div className="sv-orb sv-orb-1" /><div className="sv-orb sv-orb-2" /><div className="sv-orb sv-orb-3" /></div>
      <div className="sv-content flex flex-col flex-1">

        {/* HEADER */}
        <div className="px-4 pt-12 pb-2 flex items-center gap-3">
          <button onClick={() => navigate('/clans')} className="w-10 h-10 flex items-center justify-center rounded-2xl transition active:scale-95" style={{ background: 'var(--sv-bg-surface)', border: '1px solid var(--sv-border-light)' }}>
            <ArrowLeft className="w-5 h-5 sv-muted" />
          </button>
        </div>

        {/* INFO DEL CLAN */}
        <div className="px-6 pt-2 pb-4 flex flex-col items-center text-center">
          {clan.avatarUrl
            ? <img src={clan.avatarUrl} alt={clan.nombre} className="w-20 h-20 rounded-2xl object-cover mb-3" />
            : <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-3" style={{ background: 'rgba(139,92,246,0.18)' }}><Shield className="w-10 h-10" style={{ color: 'var(--sv-clan-accent)' }} /></div>}
          <h1 className="text-2xl font-black leading-tight">{clan.nombre}</h1>
          <div className="flex items-center gap-2 mt-2">
            <span className="sv-badge sv-badge-glass" style={{ textTransform: 'none', letterSpacing: 0 }}>
              {clan.tipoAcceso === 'cerrado' ? <Lock className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
              {t(`clans.access.${clan.tipoAcceso}`)}
            </span>
            {clan.especializacion && <span className="sv-badge sv-badge-primary" style={{ textTransform: 'none', letterSpacing: 0 }}>{clan.especializacion}</span>}
          </div>
          {clan.descripcion && <p className="sv-muted text-sm mt-3 max-w-sm">{clan.descripcion}</p>}
        </div>

        {/* STATS */}
        <div className="px-5 mb-4">
          <div className="grid grid-cols-3 gap-3">
            <Stat icon={<Trophy className="w-4 h-4" />} label={t('clans.rank')} value={`#${clan.ranking}`} />
            <Stat icon={<Star className="w-4 h-4" />} label={t('clans.weekly_xp')} value={`${clan.xpColectivoSemanal}`} />
            <Stat icon={<Users className="w-4 h-4" />} label={t('clans.members_label')} value={`${clan.miembros.length}/20`} />
          </div>
        </div>

        {/* ACCIÓN PRINCIPAL */}
        <div className="px-5 mb-5">
          {!clan.esMiembro ? (
            requested ? (
              <div className="sv-glass p-3.5 flex items-center justify-center gap-2 text-sm sv-muted">
                <Clock className="w-4 h-4" /> {t('clans.request_sent')}
              </div>
            ) : (clan.tipoAcceso === 'abierto' && clan.miembros.length >= 20) ? (
              // Clan abierto lleno: la unión es inmediata, así que no tiene sentido permitirla.
              <div className="sv-glass p-3.5 flex items-center justify-center gap-2 text-sm sv-muted">
                <Users className="w-4 h-4" /> {t('clans.full')}
              </div>
            ) : (
              <button onClick={handleJoin} disabled={busy} className="sv-btn sv-btn-primary w-full py-3.5">
                <UserPlus className="w-5 h-5" />
                {clan.tipoAcceso === 'cerrado' ? t('clans.request_join') : t('clans.join')}
              </button>
            )
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={() => navigate(`/clans/${clan.id}/chat`)} className="sv-btn sv-btn-primary flex-1 py-3.5">
                <MessageCircle className="w-5 h-5" /> {t('clans.chat.open')}
              </button>
              <button onClick={handleLeave} disabled={busy} title={t('clans.leave')} className="sv-btn sv-btn-glass w-12 h-12 shrink-0" style={{ color: '#FCA5A5' }}>
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
          {error && <p className="text-xs mt-2 text-center" style={{ color: '#FCA5A5' }}>{error}</p>}
        </div>

        {/* MISIONES DE CLAN (miembros) */}
        {clan.esMiembro && missions.length > 0 && (
          <div className="px-5 mb-5">
            <div className="flex items-center gap-2 mb-2 px-1">
              <Target className="w-4 h-4" style={{ color: 'var(--sv-clan-accent)' }} />
              <p className="text-xs font-bold sv-dim uppercase tracking-wider">{t('clans.missions.title')}</p>
            </div>
            <div className="space-y-2.5">
              {missions.map((m) => {
                const pct = Math.min(100, Math.round((m.progresoActual / Math.max(1, m.meta)) * 100))
                return (
                  <div key={m.id} className="sv-glass p-3.5" style={m.completada ? { borderColor: 'rgba(16,185,129,0.4)' } : undefined}>
                    <div className="flex items-start gap-2.5">
                      <span className="block w-2.5 h-2.5 rounded-full mt-1.5 shrink-0" style={{ background: DIFFICULTY_COLOR[m.dificultad] ?? 'var(--sv-text-dim)' }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`font-bold text-sm leading-tight ${m.completada ? 'line-through opacity-70' : ''}`}>{t(`missions.titles.${m.key}`, { defaultValue: m.titulo })}</p>
                          <span className="sv-badge sv-badge-gold shrink-0" style={{ textTransform: 'none', letterSpacing: 0, padding: '2px 8px', fontSize: 10 }}>
                            +{m.xpRecompensaPorMiembro} XP
                          </span>
                        </div>
                        <p className="text-xs sv-muted leading-snug mt-0.5">{t(m.tipo === 'completar_curso' ? 'missions.clan_desc_courses' : 'missions.clan_desc_lessons', { n: m.meta, defaultValue: m.descripcion })}</p>
                        {/* Barra de progreso colectivo */}
                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--sv-border-light)' }}>
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: m.completada ? '#34D399' : 'linear-gradient(90deg, var(--sv-clan-accent), #8B5CF6)' }} />
                          </div>
                          {m.completada
                            ? <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: '#34D399' }} />
                            : <span className="text-[11px] sv-dim shrink-0 tabular-nums">{m.progresoActual}/{m.meta}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* SOLICITUDES PENDIENTES (gestores) */}
        {isManager && clan.solicitudes.length > 0 && (
          <div className="px-5 mb-5">
            <p className="text-xs font-bold sv-dim uppercase tracking-wider mb-2 px-1">{t('clans.requests_title')} ({clan.solicitudes.length})</p>
            <div className="space-y-2">
              {clan.solicitudes.map((r) => (
                <div key={r.id} className="sv-glass p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{displayName(r)}</p>
                    <p className="text-[11px] sv-dim">{t('clans.member_level', { level: r.nivel })}</p>
                  </div>
                  <button onClick={() => act(() => acceptClanRequest(r.id))} disabled={busy} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.18)', color: '#34D399' }}>
                    <Check className="w-4 h-4" />
                  </button>
                  <button onClick={() => act(() => rejectClanRequest(r.id))} disabled={busy} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.15)', color: '#FCA5A5' }}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MIEMBROS — botón que abre el modal con la lista completa */}
        <div className="px-5 pb-12">
          <button
            onClick={() => setShowMembers(true)}
            className="sv-glass sv-glass-hover w-full p-4 flex items-center gap-3 text-left transition active:scale-[0.99]"
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(139,92,246,0.18)' }}>
              <Users className="w-5 h-5" style={{ color: 'var(--sv-clan-accent)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm">{t('clans.members_title')}</p>
              <p className="text-[11px] sv-dim">{t('clans.members_count', { count: clan.miembros.length, max: 20 })}</p>
            </div>
            <ChevronRight className="w-5 h-5 sv-dim shrink-0" />
          </button>
        </div>

      </div>

      {/* MODAL DE MIEMBROS — portal a body para escapar del stacking context de la ruta */}
      {showMembers && createPortal(
        <div className="fixed inset-0 z-[70] flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowMembers(false)}>
          <div
            className="w-full max-w-md rounded-t-3xl max-h-[85vh] overflow-y-auto"
            style={{ background: 'var(--sv-bg-elevated)', borderTop: '1px solid var(--sv-border-light)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-3 sticky top-0 z-10" style={{ background: 'var(--sv-bg-elevated)' }}>
              <h2 className="text-lg font-black">{t('clans.members_title')} · {t('clans.members_count', { count: clan.miembros.length, max: 20 })}</h2>
              <button onClick={() => setShowMembers(false)} className="p-1.5 rounded-lg sv-muted hover:opacity-70"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-5 pb-6 space-y-2">
              {clan.miembros.map((m) => {
                const isMe = m.userId === myId
                return (
                  <div key={m.userId} className="sv-glass p-3 flex items-center gap-3">
                    <button
                      onClick={() => { if (!isMe && m.username) navigate(`/u/${m.username}`) }}
                      disabled={isMe || !m.username}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left transition active:scale-[0.99] disabled:active:scale-100"
                    >
                      <RoleIcon rol={m.rol} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-semibold text-sm truncate">{displayName(m)}</p>
                          {isMe && <span className="text-[10px] sv-dim">({t('clans.you')})</span>}
                        </div>
                        <p className="text-[11px] sv-dim">{t(`clans.roles.${m.rol}`)} · {m.xpAportadoSemana} XP</p>
                      </div>
                    </button>

                    {/* Acciones de gestión (no sobre uno mismo ni sobre el líder) */}
                    {isManager && !isMe && m.rol !== 'lider' && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isLeader && m.rol === 'miembro' && (
                          <button onClick={() => act(() => promoteClanMember(clan.id, m.userId))} disabled={busy} title={t('clans.promote')} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--sv-bg-input)', color: 'var(--sv-clan-accent)' }}>
                            <ChevronUp className="w-4 h-4" />
                          </button>
                        )}
                        {isLeader && m.rol === 'co_lider' && (
                          <button onClick={() => act(() => demoteClanMember(clan.id, m.userId))} disabled={busy} title={t('clans.demote')} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--sv-bg-input)', color: 'var(--sv-text-dim)' }}>
                            <ChevronDown className="w-4 h-4" />
                          </button>
                        )}
                        {!(clan.miRol === 'co_lider' && m.rol === 'co_lider') && (
                          <button onClick={() => { if (window.confirm(t('clans.kick_confirm', { name: displayName(m) }))) act(() => kickClanMember(clan.id, m.userId)) }} disabled={busy} title={t('clans.kick')} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.12)', color: '#FCA5A5' }}>
                            <UserMinus className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="sv-glass p-3 flex flex-col items-center gap-1">
      <span style={{ color: 'var(--sv-clan-accent)' }}>{icon}</span>
      <p className="font-black text-lg leading-none">{value}</p>
      <p className="text-[10px] sv-dim uppercase tracking-wide">{label}</p>
    </div>
  )
}

function RoleIcon({ rol }: { rol: string }) {
  if (rol === 'lider') return <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(245,158,11,0.18)' }}><Crown className="w-4 h-4" style={{ color: 'var(--sv-warning)' }} /></div>
  if (rol === 'co_lider') return <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(139,92,246,0.18)' }}><Shield className="w-4 h-4" style={{ color: 'var(--sv-clan-accent)' }} /></div>
  return <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--sv-bg-input)' }}><Users className="w-4 h-4 sv-dim" /></div>
}
