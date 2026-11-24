import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ShieldAlert, Flag, Trash2, Ban, Check, Loader2, RotateCcw } from 'lucide-react'
import LoadingScreen from '../components/ui/LoadingScreen'
import {
  getProfile, getAdminReports, adminActionReport, adminUnbanUser, type AdminReport,
} from '../services/api'

// Panel de moderación (Apple 1.2): acción sobre reportes en <24h.
// Solo visible para admins (gateado en cliente + AdminGuard en el backend).
// Texto en español directo: herramienta interna, no de cara al usuario.
export default function Admin() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [reports, setReports] = useState<AdminReport[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const profile = await getProfile()
        if (!active) return
        if (!profile?.isAdmin) { navigate('/dashboard', { replace: true }); return }
        const data = await getAdminReports('pending')
        if (active) setReports(data)
      } catch (err: any) {
        if (err?.message === '401') { localStorage.removeItem('token'); navigate('/login'); return }
        if (err?.message === 'NOT_ADMIN') { navigate('/dashboard', { replace: true }); return }
        if (active) setError('We could not load the reports.')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [navigate])

  const refresh = async () => {
    try { setReports(await getAdminReports('pending')) } catch { /* noop */ }
  }

  const act = async (r: AdminReport, action: 'dismiss' | 'remove_content' | 'ban_user') => {
    setBusyId(r.id); setError('')
    try {
      await adminActionReport(r.id, action)
      // Quitar este reporte (y si fue ban, todos los del mismo usuario) de la lista.
      setReports(prev => prev.filter(x =>
        action === 'ban_user' ? x.reportedUser.id !== r.reportedUser.id : x.id !== r.id))
    } catch {
      setError('Could not complete the action.')
    } finally { setBusyId(null) }
  }

  const unban = async (userId: number) => {
    setBusyId('unban-' + userId)
    try { await adminUnbanUser(userId); await refresh() }
    catch { setError('Could not unban.') }
    finally { setBusyId(null) }
  }

  if (loading) return <LoadingScreen />

  return (
    <div className="sv-screen sv-page flex flex-col">
      <div className="sv-orbs"><div className="sv-orb sv-orb-1" /><div className="sv-orb sv-orb-2" /><div className="sv-orb sv-orb-3" /></div>
      <div className="sv-content flex flex-col flex-1 pb-16">

        {/* Header */}
        <div className="px-4 pt-12 pb-2 flex items-center justify-between">
          <button onClick={() => navigate('/profile')} className="w-10 h-10 flex items-center justify-center rounded-2xl" style={{ background: 'var(--sv-bg-surface)', border: '1px solid var(--sv-border-light)' }}>
            <ArrowLeft className="w-5 h-5 sv-muted" />
          </button>
          <button onClick={refresh} className="sv-btn sv-btn-glass text-xs px-3 py-2">
            <RotateCcw className="w-4 h-4" /> Refresh
          </button>
        </div>

        <div className="px-6 pt-2 pb-4">
          <div className="flex items-center gap-2.5 mb-1">
            <ShieldAlert className="w-7 h-7" style={{ color: 'var(--sv-primary)' }} />
            <h1 className="text-3xl font-black leading-tight">Moderation</h1>
          </div>
          <p className="sv-muted text-sm">{reports.length} pending report(s)</p>
        </div>

        {error && (
          <div className="px-5 mb-3">
            <div className="rounded-2xl px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }}>{error}</div>
          </div>
        )}

        <div className="px-5 space-y-3">
          {reports.length === 0 ? (
            <div className="sv-glass p-8 text-center">
              <Check className="w-8 h-8 mx-auto mb-2" style={{ color: '#34D399' }} />
              <p className="text-sm sv-muted">No pending reports. All clear.</p>
            </div>
          ) : reports.map((r) => {
            const banned = !!r.reportedUser.bannedAt
            const who = r.reportedUser.username ? `@${r.reportedUser.username}` : (r.reportedUser.name || `#${r.reportedUser.id}`)
            const by = r.reporter.username ? `@${r.reporter.username}` : (r.reporter.name || `#${r.reporter.id}`)
            const busy = busyId === r.id
            return (
              <div key={r.id} className="sv-glass p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Flag className="w-4 h-4" style={{ color: 'var(--sv-warning)' }} />
                  <span className="sv-badge sv-badge-glass" style={{ textTransform: 'none', letterSpacing: 0 }}>
                    {r.targetType === 'POST' ? 'Post' : 'User'}
                  </span>
                  <span className="text-xs sv-dim ml-auto">{new Date(r.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                </div>

                <p className="text-sm">
                  <span className="font-bold">{who}</span>
                  {banned && <span className="ml-2 sv-badge" style={{ background: 'rgba(239,68,68,0.15)', color: '#F87171', textTransform: 'none' }}>banned</span>}
                </p>
                <p className="text-xs sv-dim mt-0.5">Reason: <span className="sv-muted">{r.reason}</span> · reported by {by}</p>

                {/* Preview del post reportado */}
                {r.targetType === 'POST' && (
                  r.post ? (
                    <div className="mt-3 flex gap-3 items-start">
                      <img src={r.post.imageUrl} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
                      {r.post.caption && <p className="text-xs sv-muted line-clamp-3">{r.post.caption}</p>}
                    </div>
                  ) : (
                    <p className="text-xs sv-dim mt-2 italic">The post no longer exists (deleted).</p>
                  )
                )}

                {/* Acciones */}
                <div className="flex flex-wrap gap-2 mt-3">
                  <button onClick={() => act(r, 'dismiss')} disabled={busy}
                    className="flex-1 min-w-[90px] py-2 rounded-xl text-xs font-semibold sv-muted disabled:opacity-50"
                    style={{ background: 'var(--sv-bg-input)', border: '1px solid var(--sv-border-light)' }}>
                    {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Dismiss'}
                  </button>
                  {r.targetType === 'POST' && r.post && (
                    <button onClick={() => act(r, 'remove_content')} disabled={busy}
                      className="flex-1 min-w-[120px] py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 disabled:opacity-50"
                      style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: 'var(--sv-warning)' }}>
                      <Trash2 className="w-3.5 h-3.5" /> Remove content
                    </button>
                  )}
                  {banned ? (
                    <button onClick={() => unban(r.reportedUser.id)} disabled={busyId === 'unban-' + r.reportedUser.id}
                      className="flex-1 min-w-[100px] py-2 rounded-xl text-xs font-semibold sv-muted disabled:opacity-50"
                      style={{ background: 'var(--sv-bg-input)', border: '1px solid var(--sv-border-light)' }}>
                      Unban
                    </button>
                  ) : (
                    <button onClick={() => act(r, 'ban_user')} disabled={busy}
                      className="flex-1 min-w-[110px] py-2 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1 disabled:opacity-50"
                      style={{ background: '#EF4444' }}>
                      <Ban className="w-3.5 h-3.5" /> Ban user
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
