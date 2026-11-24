import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Search, UserPlus, Check, X, Loader2, ChevronRight } from 'lucide-react'
import {
  searchUsers, getFriends, getFriendRequests,
  sendFriendRequest, acceptFriendRequest, rejectFriendRequest,
  type UserCard, type FriendRequestItem,
} from '../../services/api'

function initialsOf(name?: string | null, username?: string | null) {
  const base = (name || username || '?').trim()
  return base.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
}

function Avatar({ name, username }: { name?: string | null; username?: string | null }) {
  return (
    <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, var(--sv-primary), #FF8B54)' }}>
      <span className="text-white font-bold text-sm">{initialsOf(name, username)}</span>
    </div>
  )
}

export default function FriendsPanel({ onRequestsChange }: { onRequestsChange?: (n: number) => void }) {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [q, setQ] = useState('')
  const [results, setResults] = useState<UserCard[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [sent, setSent] = useState<Set<number>>(new Set())

  const [friends, setFriends] = useState<UserCard[]>([])
  const [requests, setRequests] = useState<FriendRequestItem[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    try {
      const [fr, rq] = await Promise.all([getFriends(), getFriendRequests()])
      setFriends(fr); setRequests(rq); onRequestsChange?.(rq.length)
    } catch { /* noop */ } finally { setLoading(false) }
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Búsqueda con debounce.
  const timer = useRef<number | null>(null)
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current)
    const term = q.trim()
    if (term.length < 2) { setResults(null); setSearching(false); return }
    setSearching(true)
    timer.current = window.setTimeout(async () => {
      try { setResults(await searchUsers(term)) }
      catch { setResults([]) }
      finally { setSearching(false) }
    }, 350)
    return () => { if (timer.current) window.clearTimeout(timer.current) }
  }, [q])

  const goProfile = (u: UserCard) => { if (u.username) navigate(`/u/${u.username}`) }

  const add = async (u: UserCard) => {
    setSent(prev => new Set(prev).add(u.id))
    try { await sendFriendRequest({ userId: u.id }) }
    catch { setSent(prev => { const n = new Set(prev); n.delete(u.id); return n }) }
  }
  const accept = async (it: FriendRequestItem) => {
    setRequests(prev => prev.filter(r => r.friendshipId !== it.friendshipId))
    onRequestsChange?.(Math.max(0, requests.length - 1))
    try { await acceptFriendRequest(it.friendshipId); await load() } catch { /* noop */ }
  }
  const reject = async (it: FriendRequestItem) => {
    setRequests(prev => prev.filter(r => r.friendshipId !== it.friendshipId))
    onRequestsChange?.(Math.max(0, requests.length - 1))
    try { await rejectFriendRequest(it.friendshipId) } catch { /* noop */ }
  }

  return (
    <div className="space-y-5">
      {/* Buscador */}
      <div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 sv-dim" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={t('friends.search_placeholder', { defaultValue: 'Search by @username or name' })}
            className="sv-input w-full text-sm"
            style={{ paddingLeft: 38 }}
          />
          {searching && <Loader2 className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 animate-spin sv-dim" />}
        </div>

        {results !== null && (
          <div className="mt-2 space-y-2">
            {results.length === 0 ? (
              <p className="text-xs sv-dim px-1 py-2">{t('friends.no_results', { defaultValue: 'No results' })}</p>
            ) : results.map(u => (
              <div key={u.id} className="sv-glass-solid p-3 flex items-center gap-3">
                <button onClick={() => goProfile(u)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <Avatar name={u.name} username={u.username} />
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{u.name || `@${u.username}`}</p>
                    <p className="text-[11px] sv-dim truncate">@{u.username} · {t('profile.level_label', { defaultValue: 'Level' })} {u.nivel}</p>
                  </div>
                </button>
                {sent.has(u.id) ? (
                  <span className="text-[11px] sv-dim inline-flex items-center gap-1 shrink-0"><Check className="w-3.5 h-3.5" /> {t('friends.requested', { defaultValue: 'Request sent' })}</span>
                ) : (
                  <button onClick={() => add(u)} className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--sv-primary-soft)', color: 'var(--sv-primary)' }} aria-label={t('friends.add', { defaultValue: 'Add friend' })}>
                    <UserPlus className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-7 h-7 animate-spin" style={{ color: 'var(--sv-primary)' }} /></div>
      ) : (
        <>
          {/* Solicitudes entrantes */}
          {requests.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-bold sv-muted">{t('friends.requests_title', { defaultValue: 'Requests' })} ({requests.length})</h2>
              {requests.map(it => (
                <div key={it.friendshipId} className="sv-glass-solid p-3 flex items-center gap-3">
                  <button onClick={() => goProfile(it.user)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    <Avatar name={it.user.name} username={it.user.username} />
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{it.user.name || `@${it.user.username}`}</p>
                      <p className="text-[11px] sv-dim truncate">@{it.user.username}</p>
                    </div>
                  </button>
                  <button onClick={() => accept(it)} className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--sv-primary)', color: '#fff' }} aria-label={t('friends.accept', { defaultValue: 'Accept request' })}>
                    <Check className="w-4 h-4" strokeWidth={3} />
                  </button>
                  <button onClick={() => reject(it)} className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--sv-bg-input)', color: 'var(--sv-text-muted)' }} aria-label={t('friends.reject', { defaultValue: 'Reject' })}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Lista de amigos */}
          <div className="space-y-2">
            <h2 className="text-sm font-bold sv-muted">{t('friends.friends_title', { defaultValue: 'Your friends' })} ({friends.length})</h2>
            {friends.length === 0 ? (
              <div className="sv-glass p-6 text-center">
                <p className="text-sm sv-muted">{t('friends.empty', { defaultValue: "You don't have friends yet. Find them by their @username." })}</p>
              </div>
            ) : friends.map(u => (
              <button key={u.id} onClick={() => goProfile(u)} className="sv-glass-solid p-3 w-full flex items-center gap-3 text-left transition active:scale-[0.99]">
                <Avatar name={u.name} username={u.username} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate">{u.name || `@${u.username}`}</p>
                  <p className="text-[11px] sv-dim truncate">@{u.username} · {t('profile.level_label', { defaultValue: 'Level' })} {u.nivel}</p>
                </div>
                <ChevronRight className="w-5 h-5 sv-dim shrink-0" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
