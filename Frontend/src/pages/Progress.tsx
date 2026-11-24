import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft, TrendingUp, GraduationCap, BookOpen, Flame,
  Sparkles, Compass, Award, ChevronRight,
} from 'lucide-react'
import { getAiStats, getAiBadges } from '../services/api'
import LoadingScreen from '../components/ui/LoadingScreen'

interface Stats {
  nivel: number
  xpTotal: number
  xpParaSiguienteNivel: number
  cursosCompletados: number
  leccionesCompletadas: number
  rachaActual: number
  tecnicasDominadas: string[]
  categoriasDominadas: string[]
  ingredientesUsados: string[]
}

export default function Progress() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [stats, setStats] = useState<Stats | null>(null)
  const [badges, setBadges] = useState<{ completada: boolean }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const [s, b] = await Promise.all([
          getAiStats(),
          getAiBadges().catch(() => []),
        ])
        setStats(s)
        setBadges(Array.isArray(b) ? b : [])
      } catch (err) {
        if (err instanceof Error && err.message === '401') {
          localStorage.removeItem('token'); navigate('/login'); return
        }
        setError(t('coursesAi.progress.error_load'))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <LoadingScreen />

  const xpTotal = stats?.xpTotal ?? 0
  const xpNext = stats?.xpParaSiguienteNivel ?? 1
  const pct = Math.min(100, Math.round((xpTotal / Math.max(1, xpNext)) * 100))
  const area = stats?.categoriasDominadas?.[0] ?? null
  const earnedBadges = badges.filter(b => b.completada).length

  return (
    <div className="sv-screen sv-page flex flex-col">
      <div className="sv-orbs"><div className="sv-orb sv-orb-1" /><div className="sv-orb sv-orb-2" /><div className="sv-orb sv-orb-3" /></div>
      <div className="sv-content flex flex-col flex-1 pb-16">

        {/* HEADER */}
        <div className="px-4 pt-12 pb-2 sv-stagger-1 flex items-center justify-between">
          <button
            onClick={() => navigate('/courses')}
            className="w-10 h-10 flex items-center justify-center rounded-2xl transition active:scale-95"
            style={{ background: 'var(--sv-bg-surface)', border: '1px solid var(--sv-border-light)' }}
          >
            <ArrowLeft className="w-5 h-5 sv-muted" />
          </button>
          <button onClick={() => navigate('/achievements')} className="sv-btn sv-btn-glass text-xs px-3 py-2">
            <Award className="w-4 h-4" /> {t('coursesAi.progress.badges')}
          </button>
        </div>

        <div className="px-6 pt-2 pb-4 sv-stagger-1">
          <div className="flex items-center gap-2.5 mb-1">
            <TrendingUp className="w-7 h-7" style={{ color: 'var(--sv-primary)' }} />
            <h1 className="text-3xl font-black leading-tight">{t('coursesAi.progress.title')}</h1>
          </div>
        </div>

        {error ? (
          <p className="sv-muted text-sm text-center py-10 px-5">{error}</p>
        ) : (
          <>
            {/* HERO: NIVEL + XP */}
            <div className="px-5 mb-5 sv-stagger-2">
              <div className="sv-glass p-5">
                <div className="flex items-center gap-4">
                  <div
                    className="w-16 h-16 rounded-2xl flex flex-col items-center justify-center shrink-0"
                    style={{ background: 'linear-gradient(135deg, var(--sv-primary), #FF8B54)', boxShadow: '0 6px 18px var(--sv-primary-glow)' }}
                  >
                    <span className="text-[10px] font-bold text-white/80 leading-none uppercase tracking-wide">XP</span>
                    <span className="text-2xl font-black text-white leading-none">{stats?.nivel ?? 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-lg leading-tight">{t('coursesAi.progress.level', { level: stats?.nivel ?? 1 })}</p>
                    <p className="text-sm sv-muted leading-snug">
                      {area
                        ? t('coursesAi.progress.specialization', { area })
                        : t('coursesAi.progress.no_specialization')}
                    </p>
                  </div>
                  {(stats?.rachaActual ?? 0) > 0 && (
                    <div className="flex items-center gap-1.5 shrink-0 rounded-xl px-2.5 py-1.5" style={{ background: 'rgba(245,158,11,0.14)' }}>
                      <Flame className="w-4 h-4" style={{ color: 'var(--sv-warning)' }} />
                      <span className="text-sm font-bold" style={{ color: 'var(--sv-warning)' }}>{stats?.rachaActual}</span>
                    </div>
                  )}
                </div>

                {/* Barra de XP */}
                <div className="mt-4">
                  <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--sv-bg-input)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, var(--sv-primary), #FF8B54)' }} />
                  </div>
                  <p className="text-xs sv-dim mt-1.5 text-right">
                    {t('coursesAi.progress.xp_to_next', { current: xpTotal, next: xpNext })}
                  </p>
                </div>
              </div>
            </div>

            {/* PROGRESO GENERAL — 3 tiles */}
            <div className="px-5 mb-5 sv-stagger-3">
              <p className="text-sm font-bold mb-2 px-1">{t('coursesAi.progress.general')}</p>
              <div className="grid grid-cols-3 gap-3">
                <StatTile Icon={GraduationCap} value={stats?.cursosCompletados ?? 0} label={t('coursesAi.progress.courses_completed')} />
                <StatTile Icon={BookOpen} value={stats?.leccionesCompletadas ?? 0} label={t('coursesAi.progress.lessons_completed')} />
                <StatTile Icon={TrendingUp} value={stats?.xpTotal ?? 0} label={t('coursesAi.progress.xp_total')} />
              </div>
            </div>

            {/* HABILIDADES CULINARIAS */}
            <div className="px-5 mb-5 sv-stagger-3">
              <div className="flex items-center gap-2 mb-2 px-1">
                <Sparkles className="w-5 h-5" style={{ color: 'var(--sv-primary)' }} />
                <p className="text-sm font-bold">{t('coursesAi.progress.skills')}</p>
              </div>
              {(stats?.tecnicasDominadas?.length ?? 0) > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {stats!.tecnicasDominadas.map((tec) => (
                    <span key={tec} className="sv-badge sv-badge-primary" style={{ textTransform: 'none', letterSpacing: 0 }}>{tec}</span>
                  ))}
                </div>
              ) : (
                <p className="text-sm sv-dim px-1">{t('coursesAi.progress.no_skills')}</p>
              )}
            </div>

            {/* EXPLORACIÓN */}
            {((stats?.categoriasDominadas?.length ?? 0) > 0 || (stats?.ingredientesUsados?.length ?? 0) > 0) && (
              <div className="px-5 mb-5 sv-stagger-3">
                <div className="flex items-center gap-2 mb-2 px-1">
                  <Compass className="w-5 h-5" style={{ color: 'var(--sv-primary)' }} />
                  <p className="text-sm font-bold">{t('coursesAi.progress.exploration')}</p>
                </div>
                <div className="sv-glass p-4 space-y-3">
                  {(stats?.categoriasDominadas?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-xs sv-dim mb-1.5">{t('coursesAi.progress.categories')}</p>
                      <div className="flex flex-wrap gap-2">
                        {stats!.categoriasDominadas.map((c) => (
                          <span key={c} className="sv-badge sv-badge-glass" style={{ textTransform: 'none', letterSpacing: 0 }}>{c}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {(stats?.ingredientesUsados?.length ?? 0) > 0 && (
                    <p className="text-sm sv-muted">
                      {t('coursesAi.progress.ingredients', { count: stats!.ingredientesUsados.length })}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* INSIGNIAS — enlace a la página completa */}
            <div className="px-5 sv-stagger-3">
              <button onClick={() => navigate('/achievements')} className="w-full sv-glass sv-glass-hover p-4 flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(245,158,11,0.15)' }}>
                  <Award className="w-5 h-5" style={{ color: 'var(--sv-warning)' }} />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-bold text-sm leading-tight">{t('coursesAi.progress.badges')}</p>
                  <p className="text-xs sv-dim">{t('coursesAi.progress.badge_progress', { current: earnedBadges, total: badges.length })}</p>
                </div>
                <ChevronRight className="w-5 h-5 sv-dim shrink-0" />
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  )
}

function StatTile({ Icon, value, label }: { Icon: typeof GraduationCap; value: number; label: string }) {
  return (
    <div className="sv-glass p-3 flex flex-col items-center text-center gap-1">
      <Icon className="w-5 h-5" style={{ color: 'var(--sv-primary)' }} />
      <span className="text-xl font-black leading-none">{value}</span>
      <span className="text-[11px] sv-dim leading-tight">{label}</span>
    </div>
  )
}
