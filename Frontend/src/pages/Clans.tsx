import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Shield, Plus, Search, Users, Trophy, Lock, Globe, ChevronRight } from 'lucide-react'
import { browseClans, getMyClan, getCachedClansBrowse, cacheClansBrowse } from '../services/api'

interface ClanItem {
  id: string
  nombre: string
  descripcion: string
  tipoAcceso: string
  especializacion: string | null
  avatarUrl: string | null
  xpColectivoSemanal: number
  xpColectivoTotal: number
  miembros: number
  ranking: number
  esMiembro: boolean
}

export default function Clans() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()

  // Slide direccional al venir de la pastilla (igual que Inicio ↔ Social).
  const slideFrom = (location.state as { slideFrom?: 'right' | 'left' } | null)?.slideFrom
  const pageAnim = slideFrom === 'right' ? 'sv-slide-from-right' : slideFrom === 'left' ? 'sv-slide-from-left' : 'sv-page'

  // Stale-while-revalidate: pinta al instante lo último conocido (sin LoadingScreen,
  // que rompía la transición de la pastilla) y revalida por red en 2º plano.
  const cachedBrowse = getCachedClansBrowse()
  const [myClan, setMyClan] = useState<ClanItem | null>(cachedBrowse?.myClan ?? null)
  const [clans, setClans] = useState<ClanItem[]>(cachedBrowse?.clans ?? [])
  const [search, setSearch] = useState('')
  const [initialLoading, setInitialLoading] = useState(!cachedBrowse)
  const [listLoading, setListLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const [mine, list] = await Promise.all([
          getMyClan().catch(() => null),
          browseClans(),
        ])
        setMyClan(mine)
        setClans(list ?? [])
        cacheClansBrowse(mine, list ?? [])
      } catch (err) {
        if (err instanceof Error && err.message === '401') { localStorage.removeItem('token'); navigate('/login'); return }
        setError(t('clans.error_load'))
      } finally {
        setInitialLoading(false)
      }
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const runSearch = async (q: string) => {
    setListLoading(true)
    try {
      const list = await browseClans(q)
      setClans(list ?? [])
    } catch (err) {
      if (err instanceof Error && err.message === '401') { localStorage.removeItem('token'); navigate('/login'); return }
    } finally {
      setListLoading(false)
    }
  }

  return (
    <div className={`sv-screen ${pageAnim} flex flex-col`}>
      <div className="sv-orbs"><div className="sv-orb sv-orb-1" /><div className="sv-orb sv-orb-2" /><div className="sv-orb sv-orb-3" /></div>
      <div className="sv-content flex flex-col flex-1">

        {/* HEADER */}
        <div className="px-4 pt-12 pb-2 sv-stagger-1 flex items-center justify-between">
          <button onClick={() => navigate('/dashboard')} className="w-10 h-10 flex items-center justify-center rounded-2xl transition active:scale-95" style={{ background: 'var(--sv-bg-surface)', border: '1px solid var(--sv-border-light)' }}>
            <ArrowLeft className="w-5 h-5 sv-muted" />
          </button>
        </div>

        <div className="px-6 pt-2 pb-4 sv-stagger-1">
          <div className="flex items-center gap-2.5 mb-1">
            <Shield className="w-7 h-7" style={{ color: 'var(--sv-clan-accent)' }} />
            <h1 className="text-3xl font-black leading-tight">{t('clans.title')}</h1>
          </div>
          <p className="sv-muted text-base">{t('clans.subtitle')}</p>
        </div>

        {/* MI CLAN — skeleton en la 1ª visita sin caché (no sabemos aún si tiene clan) */}
        {initialLoading ? (
          <div className="px-5 mb-5 sv-stagger-2 animate-pulse">
            <div className="h-3 w-20 rounded mb-2 mx-1" style={{ background: 'var(--sv-border-light)' }} />
            <div className="h-[76px] rounded-3xl" style={{ background: 'var(--sv-bg-surface)' }} />
          </div>
        ) : myClan ? (
          <div className="px-5 mb-5 sv-stagger-2">
            <p className="text-xs font-bold sv-dim uppercase tracking-wider mb-2 px-1">{t('clans.my_clan')}</p>
            <button onClick={() => navigate(`/clans/${myClan.id}`)} className="sv-glass sv-glass-hover p-4 text-left w-full flex items-center gap-3" style={{ borderColor: 'var(--sv-secondary-glow)' }}>
              <ClanAvatar clan={myClan} />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-base leading-tight truncate">{myClan.nombre}</p>
                <div className="flex items-center gap-3 mt-1 text-xs sv-muted">
                  <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {myClan.miembros}</span>
                  <span className="inline-flex items-center gap-1"><Trophy className="w-3.5 h-3.5" /> #{myClan.ranking}</span>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 sv-dim shrink-0" />
            </button>
          </div>
        ) : (
          <div className="px-5 mb-4 sv-stagger-2">
            <button onClick={() => navigate('/clans/create')} className="sv-btn sv-btn-primary w-full py-3.5">
              <Plus className="w-5 h-5" /> {t('clans.create')}
            </button>
          </div>
        )}

        {/* BUSCADOR */}
        <div className="px-5 mb-4 sv-stagger-2">
          <form
            onSubmit={(e) => { e.preventDefault(); runSearch(search) }}
            className="flex items-center gap-2 rounded-2xl px-3 py-2.5"
            style={{ background: 'var(--sv-bg-input)', border: '1px solid var(--sv-border-light)' }}
          >
            <Search className="w-4 h-4 sv-dim shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('clans.search_placeholder')}
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: 'var(--sv-text)' }}
            />
          </form>
        </div>

        {/* RANKING / LISTA */}
        {/* pb-28: deja aire para la pastilla de navegación (ahora persiste en /clans) */}
        <div className="px-5 pb-28 sv-stagger-3">
          <p className="text-xs font-bold sv-dim uppercase tracking-wider mb-2 px-1">{t('clans.ranking_title')}</p>
          {error ? (
            <p className="sv-muted text-sm text-center py-10">{error}</p>
          ) : initialLoading || listLoading ? (
            <div className="space-y-2.5 animate-pulse">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 rounded-3xl" style={{ background: 'var(--sv-bg-surface)', opacity: 1 - i * 0.15 }} />
              ))}
            </div>
          ) : clans.length === 0 ? (
            <p className="sv-muted text-sm text-center py-10">{t('clans.empty')}</p>
          ) : (
            <div className="space-y-2.5">
              {clans.map((c) => (
                <button key={c.id} onClick={() => navigate(`/clans/${c.id}`)} className="sv-glass sv-glass-hover p-3.5 text-left w-full flex items-center gap-3">
                  <span className="text-sm font-black w-6 text-center shrink-0" style={{ color: c.ranking <= 3 ? 'var(--sv-warning)' : 'var(--sv-text-dim)' }}>#{c.ranking}</span>
                  <ClanAvatar clan={c} sm />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-bold text-sm leading-tight truncate">{c.nombre}</p>
                      {c.tipoAcceso === 'cerrado'
                        ? <Lock className="w-3 h-3 sv-dim shrink-0" />
                        : <Globe className="w-3 h-3 sv-dim shrink-0" />}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[11px] sv-muted">
                      <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" /> {c.miembros}</span>
                      <span className="inline-flex items-center gap-1"><Trophy className="w-3 h-3" /> {c.xpColectivoSemanal} XP</span>
                      {c.especializacion && <span className="truncate">{c.especializacion}</span>}
                    </div>
                  </div>
                  {c.esMiembro && <span className="sv-badge sv-badge-glass shrink-0" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 10 }}>{t('clans.member_badge')}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

function ClanAvatar({ clan, sm }: { clan: ClanItem; sm?: boolean }) {
  const size = sm ? 'w-10 h-10' : 'w-12 h-12'
  if (clan.avatarUrl) {
    return <img src={clan.avatarUrl} alt={clan.nombre} className={`${size} rounded-xl object-cover shrink-0`} />
  }
  return (
    <div className={`${size} rounded-xl flex items-center justify-center shrink-0`} style={{ background: 'rgba(139,92,246,0.18)' }}>
      <Shield className={sm ? 'w-5 h-5' : 'w-6 h-6'} style={{ color: 'var(--sv-clan-accent)' }} />
    </div>
  )
}
