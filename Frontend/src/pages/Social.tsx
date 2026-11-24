import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import { Plus, Users, UserPlus, X, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import PostCard from '../components/social/PostCard'
import TopPodium from '../components/social/TopPodium'
import CreatePostSheet from '../components/social/CreatePostSheet'
import FriendsPanel from '../components/social/FriendsPanel'
import {
  getProfile, getSocialFeed, getSocialTop, toggleSocialLike, getFriendCounts,
  getCachedSocialFeed, getCachedSocialTop, getCachedProfile,
  SocialPost, SocialTop,
} from '../services/api'

const POLL_MS = 15000

// Toggle local del like (optimista) en una lista de posts.
function toggleLikeInList(list: SocialPost[], postId: string): SocialPost[] {
  return list.map((p) =>
    p.id === postId
      ? { ...p, likedByMe: !p.likedByMe, likeCount: Math.max(0, p.likeCount + (p.likedByMe ? -1 : 1)) }
      : p,
  )
}

// Fija like/contador a la verdad del servidor tras la respuesta.
function setLikeInList(list: SocialPost[], postId: string, liked: boolean, count: number): SocialPost[] {
  return list.map((p) => (p.id === postId ? { ...p, likedByMe: liked, likeCount: count } : p))
}

export default function Social() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()

  // Slide direccional al venir de la barra de tabs (Inicio ↔ Social).
  const slideFrom = (location.state as { slideFrom?: 'right' | 'left' } | null)?.slideFrom
  const pageAnim = slideFrom === 'right' ? 'sv-slide-from-right' : slideFrom === 'left' ? 'sv-slide-from-left' : 'sv-page'

  // Stale-while-revalidate: pinta al instante el último feed/top conocido y revalida abajo.
  const cachedFeed = getCachedSocialFeed()
  const cachedTop = getCachedSocialTop()
  const [userId, setUserId] = useState<number | null>(getCachedProfile()?.id ?? null)
  const [top, setTop] = useState<SocialTop>(cachedTop ?? { photos: [], recipes: [] })
  const [posts, setPosts] = useState<SocialPost[]>(cachedFeed?.items ?? [])
  const [cursor, setCursor] = useState<string | null>(cachedFeed?.nextCursor ?? null)
  const [loading, setLoading] = useState(!cachedFeed)
  const [loadingMore, setLoadingMore] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [tab, setTab] = useState<'feed' | 'friends'>('feed')
  const [reqCount, setReqCount] = useState(0)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { navigate('/login'); return }

    let active = true
    async function load() {
      try {
        const [profile, topData, feed] = await Promise.all([
          getProfile(),
          getSocialTop(),
          getSocialFeed(),
        ])
        if (!active) return
        setUserId(profile?.id ?? null)
        setTop(topData)
        setPosts(feed.items)
        setCursor(feed.nextCursor)
      } catch (err: any) {
        if (err.message === '401') { localStorage.removeItem('token'); navigate('/login') }
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [navigate])

  // Contador de solicitudes pendientes para el badge de la pestaña Amigos.
  useEffect(() => {
    getFriendCounts().then(c => setReqCount(c.requests)).catch(() => {})
  }, [])

  const loadMore = async () => {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const feed = await getSocialFeed(cursor)
      setPosts((prev) => [...prev, ...feed.items])
      setCursor(feed.nextCursor)
    } catch { /* noop */ }
    finally { setLoadingMore(false) }
  }

  const handleCreated = (post: SocialPost) => {
    setPosts((prev) => [post, ...prev])
  }

  const handleDeleted = (postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId))
    setTop((prev) => ({
      photos: prev.photos.filter((p) => p.id !== postId),
      recipes: prev.recipes.filter((p) => p.id !== postId),
    }))
  }

  // Al bloquear a un autor, quitamos al instante todo su contenido del feed y del Top.
  const handleAuthorBlocked = (authorId: number) => {
    setPosts((prev) => prev.filter((p) => p.author.id !== authorId))
    setTop((prev) => ({
      photos: prev.photos.filter((p) => p.author.id !== authorId),
      recipes: prev.recipes.filter((p) => p.author.id !== authorId),
    }))
  }

  // Like optimista: actualiza al toque feed + top, luego reconcilia con el servidor.
  const handleToggleLike = async (postId: string) => {
    setPosts((prev) => toggleLikeInList(prev, postId))
    setTop((prev) => ({ photos: toggleLikeInList(prev.photos, postId), recipes: toggleLikeInList(prev.recipes, postId) }))
    try {
      const res = await toggleSocialLike(postId)
      setPosts((prev) => setLikeInList(prev, postId, res.liked, res.likeCount))
      setTop((prev) => ({
        photos: setLikeInList(prev.photos, postId, res.liked, res.likeCount),
        recipes: setLikeInList(prev.recipes, postId, res.liked, res.likeCount),
      }))
    } catch {
      // rollback: volver a togglear
      setPosts((prev) => toggleLikeInList(prev, postId))
      setTop((prev) => ({ photos: toggleLikeInList(prev.photos, postId), recipes: toggleLikeInList(prev.recipes, postId) }))
    }
  }

  // Auto-refresco: trae la 1ª página + top y MEZCLA solo los cambios (sin recargar
  // ni resetear el scroll). Para posts ya cargados toma el likeCount del servidor pero
  // conserva el likedByMe local (esta cuenta es la única que cambia su propio like);
  // los posts nuevos se agregan arriba. No toca el cursor de paginación.
  const refreshing = useRef(false)
  const refresh = useCallback(async () => {
    if (refreshing.current) return
    refreshing.current = true
    try {
      const [topData, feed] = await Promise.all([getSocialTop(), getSocialFeed()])
      setPosts((prev) => {
        const prevIds = new Set(prev.map((p) => p.id))
        const incomingMap = new Map(feed.items.map((p) => [p.id, p]))
        const newOnes = feed.items.filter((p) => !prevIds.has(p.id))
        const updated = prev.map((p) => {
          const inc = incomingMap.get(p.id)
          return inc ? { ...p, likeCount: inc.likeCount } : p
        })
        return [...newOnes, ...updated]
      })
      setTop((prev) => {
        const likedLocal = new Map<string, boolean>()
        ;[...prev.photos, ...prev.recipes].forEach((p) => likedLocal.set(p.id, p.likedByMe))
        const keepLiked = (arr: SocialPost[]) =>
          arr.map((p) => (likedLocal.has(p.id) ? { ...p, likedByMe: likedLocal.get(p.id)! } : p))
        return { photos: keepLiked(topData.photos), recipes: keepLiked(topData.recipes) }
      })
    } catch { /* silencioso: el siguiente tick reintenta */ }
    finally { refreshing.current = false }
  }, [])

  // Intervalo + refresco inmediato al volver a la pestaña/ventana.
  useEffect(() => {
    if (loading) return
    const id = window.setInterval(refresh, POLL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [loading, refresh])

  return (
    <div className={`sv-screen ${pageAnim} flex flex-col`}>
      <div className="sv-orbs"><div className="sv-orb sv-orb-1" /><div className="sv-orb sv-orb-2" /><div className="sv-orb sv-orb-3" /></div>

      <div className="sv-content flex flex-col flex-1 pb-24">
        {/* Header: título + botón circular de Amigos a la derecha (toggle feed ↔ amigos) */}
        <div className="px-6 pt-12 pb-4 sv-stagger-1 flex items-center gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Users className="w-6 h-6 shrink-0" style={{ color: 'var(--sv-primary)' }} />
            <h1 className="text-2xl font-black truncate">{t('social.title')}</h1>
          </div>
          <button
            onClick={() => setTab(tab === 'friends' ? 'feed' : 'friends')}
            className="relative w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition active:scale-95"
            style={tab === 'friends'
              ? { background: 'linear-gradient(135deg, var(--sv-primary), var(--sv-primary-strong))', boxShadow: '0 6px 18px var(--sv-primary-glow)' }
              : { background: 'var(--sv-bg-surface)', border: '1px solid var(--sv-border-light)' }}
            aria-label={t('social.tab_friends', { defaultValue: 'Friends' })}
          >
            {tab === 'friends'
              ? <X className="w-5 h-5 text-white" />
              : <UserPlus className="w-5 h-5" style={{ color: 'var(--sv-primary)' }} />}
            {reqCount > 0 && tab !== 'friends' && (
              <span
                className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white"
                style={{ background: 'var(--sv-primary)', border: '2px solid var(--sv-bg-base)' }}
              >
                {reqCount}
              </span>
            )}
          </button>
        </div>

        {tab === 'friends' ? (
          <div className="px-5 sv-stagger-2"><FriendsPanel onRequestsChange={setReqCount} /></div>
        ) : loading ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--sv-primary)' }} />
          </div>
        ) : (
          <div className="px-5 space-y-5 sv-stagger-2">
            {/* Top del día */}
            <TopPodium photos={top.photos} recipes={top.recipes} />

            {/* Feed */}
            {posts.length === 0 ? (
              <div className="sv-glass p-8 text-center">
                <p className="text-sm sv-muted">{t('social.feed_empty')}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {posts.map((post) => (
                  <PostCard key={post.id} post={post} currentUserId={userId} onToggleLike={handleToggleLike} onDeleted={handleDeleted} onAuthorBlocked={handleAuthorBlocked} />
                ))}
              </div>
            )}

            {/* Cargar más */}
            {cursor && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="sv-btn sv-btn-glass w-full py-3 disabled:opacity-50"
              >
                {loadingMore
                  ? <><Loader2 className="w-5 h-5 animate-spin" /> {t('common.loading', { defaultValue: 'Loading...' })}</>
                  : t('social.load_more')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* FAB crear publicación (solo en Feed) — portal a body para que el `fixed` sea relativo al
          viewport (si no, el transform de la animación de página `.sv-page` lo arrastra al scroll). */}
      {tab === 'feed' && createPortal(
        <button
          onClick={() => setShowCreate(true)}
          className="fixed right-5 bottom-24 z-50 w-12 h-12 rounded-full flex items-center justify-center transition active:scale-90"
          style={{ background: 'linear-gradient(135deg, var(--sv-primary), var(--sv-primary-strong))', boxShadow: '0 8px 24px var(--sv-primary-glow)' }}
          aria-label={t('social.create_title')}
        >
          <Plus className="w-6 h-6 text-white" strokeWidth={2.6} />
        </button>,
        document.body,
      )}

      {showCreate && (
        <CreatePostSheet onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
    </div>
  )
}
