import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, GraduationCap, Target, CheckCircle2, TrendingUp } from 'lucide-react'
import { getTodayMissions, getCachedTodayMissions } from '../services/api'
import LoadingScreen from '../components/ui/LoadingScreen'

interface Mission {
  id: string
  dificultad: 'facil' | 'media' | 'dificil'
  titulo: string
  descripcion: string
  xpRecompensa: number
  completada: boolean
  condicion?: { tipo?: string; cantidad?: number; key?: string }
}

// Categorías del catálogo. Cada una es su propio ROADMAP (al tocarla → /courses/:category).
// Por defecto la imagen se deriva de la clave (TheMealDB); las `image` propias son sintéticas
// (SidesStarters = Side+Starter; Cocktail/Juice = TheCocktailDB).
// `contain: true` → la foto se muestra COMPLETA (object-contain, sin zoom) con un fondo borroso
// de la misma imagen (para bebidas cuya foto es cuadrada y con cover se veía muy recortada).
const CATEGORIES: Array<{ key: string; emoji: string; image?: string; contain?: boolean }> = [
  { key: 'Chicken', emoji: '🍗' },
  { key: 'Beef', emoji: '🥩' },
  { key: 'Pork', emoji: '🥓' },
  { key: 'Seafood', emoji: '🦐' },
  { key: 'Pasta', emoji: '🍝' },
  { key: 'Vegetarian', emoji: '🥗' },
  { key: 'Vegan', emoji: '🌱' },
  { key: 'Breakfast', emoji: '🍳' },
  { key: 'SidesStarters', emoji: '🥘', image: 'https://www.themealdb.com/images/category/side.png' },
  { key: 'Dessert', emoji: '🍰' },
  { key: 'Cocktail', emoji: '🍹', image: '/images/categories/cocktail.jpg' },
  { key: 'Juice', emoji: '🧃', image: '/images/categories/juice.jpg' },
  { key: 'Miscellaneous', emoji: '🍽️' },
]

const categoryImage = (key: string) =>
  `https://www.themealdb.com/images/category/${key.toLowerCase()}.png`

const DIFFICULTY_COLOR: Record<string, string> = {
  facil: '#34D399',
  media: 'var(--sv-warning)',
  dificil: '#F87171',
}

export default function CoursesCatalog() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  // Stale-while-revalidate: las misiones conocidas pintan al instante (sin LoadingScreen
  // al volver de un roadmap) y se revalidan por red en 2º plano.
  const [missions, setMissions] = useState<Mission[]>(() => getCachedTodayMissions() ?? [])
  const [loading, setLoading] = useState(() => !getCachedTodayMissions())

  useEffect(() => {
    getTodayMissions()
      .then((m) => setMissions(m ?? []))
      .catch((err: any) => { if (err?.message === '401') { localStorage.removeItem('token'); navigate('/login') } })
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <LoadingScreen />

  return (
    <div className="sv-screen sv-page flex flex-col">
      <div className="sv-orbs"><div className="sv-orb sv-orb-1" /><div className="sv-orb sv-orb-2" /><div className="sv-orb sv-orb-3" /></div>
      <div className="sv-content flex flex-col flex-1">

        {/* HEADER */}
        <div className="px-4 pt-12 pb-2 sv-stagger-1 flex items-center justify-between">
          <button
            onClick={() => navigate('/dashboard')}
            className="w-10 h-10 flex items-center justify-center rounded-2xl transition active:scale-95"
            style={{ background: 'var(--sv-bg-surface)', border: '1px solid var(--sv-border-light)' }}
          >
            <ArrowLeft className="w-5 h-5 sv-muted" />
          </button>
          <button onClick={() => navigate('/progress')} className="sv-btn sv-btn-glass text-xs px-3 py-2">
            <TrendingUp className="w-4 h-4" /> {t('coursesAi.view_progress')}
          </button>
        </div>

        {/* TÍTULO */}
        <div className="px-6 pt-2 pb-4 sv-stagger-1">
          <div className="flex items-center gap-2.5 mb-1">
            <GraduationCap className="w-7 h-7" style={{ color: 'var(--sv-primary)' }} />
            <h1 className="text-3xl font-black leading-tight">{t('coursesAi.title')}</h1>
          </div>
          <p className="sv-muted text-base">{t('coursesAi.choose_category')}</p>
        </div>

        {/* MISIONES DEL DÍA */}
        {missions.length > 0 && (
          <div className="px-5 mb-5 sv-stagger-2">
            <div className="sv-glass-solid p-4">
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-5 h-5" style={{ color: 'var(--sv-primary)' }} />
                <div>
                  <p className="font-bold text-sm leading-tight">{t('coursesAi.missions.title')}</p>
                  <p className="text-xs sv-dim">{t('coursesAi.missions.subtitle')}</p>
                </div>
              </div>
              <div className="space-y-2">
                {missions.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-xl px-3 py-2.5 flex items-center gap-3"
                    style={{ background: 'var(--sv-bg-input)', border: '1px solid var(--sv-border-light)', opacity: m.completada ? 0.6 : 1 }}
                  >
                    <div className="shrink-0">
                      {m.completada
                        ? <CheckCircle2 className="w-5 h-5" style={{ color: '#34D399' }} />
                        : <span className="block w-2.5 h-2.5 rounded-full" style={{ background: DIFFICULTY_COLOR[m.dificultad] }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold leading-tight ${m.completada ? 'line-through' : ''}`}>{t(`missions.titles.${m.condicion?.key}`, { defaultValue: m.titulo })}</p>
                      <p className="text-xs sv-dim leading-snug">{t(m.condicion?.tipo === 'completar_curso' ? 'missions.desc_courses' : 'missions.desc_lessons', { n: m.condicion?.cantidad ?? 0, defaultValue: m.descripcion })}</p>
                    </div>
                    <span className="sv-badge sv-badge-gold shrink-0" style={{ textTransform: 'none', letterSpacing: 0, padding: '3px 9px', fontSize: 11 }}>
                      {t('coursesAi.missions.reward', { xp: m.xpRecompensa })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* CATEGORÍAS → cada una abre su roadmap */}
        <div className="px-5 pb-12 sv-stagger-3">
          <div className="flex flex-col gap-3">
            {CATEGORIES.map((c) => (
              <CategoryCard
                key={c.key}
                categoryKey={c.key}
                emoji={c.emoji}
                image={c.image}
                contain={c.contain}
                label={t(`coursesAi.categories.${c.key}`)}
                onClick={() => navigate(`/courses/${c.key}`)}
              />
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}

// Tarjeta de categoría: imagen (custom o derivada de la clave) + degradado + nombre.
// `contain`: la foto se ve COMPLETA (sin recorte/zoom) sobre un fondo borroso de sí misma.
function CategoryCard({ categoryKey, emoji, image, contain, label, onClick }: { categoryKey: string; emoji: string; image?: string; contain?: boolean; label: string; onClick: () => void }) {
  const [imgError, setImgError] = useState(false)
  const src = image ?? categoryImage(categoryKey)
  return (
    <button
      onClick={onClick}
      className="relative overflow-hidden flex items-center justify-center w-full rounded-2xl transition-transform active:scale-[0.98]"
      style={{ height: 160, background: 'var(--sv-bg-surface)' }}
    >
      {!imgError ? (
        contain ? (
          <>
            {/* Fondo: misma imagen recortada + borrosa, para que no queden barras vacías */}
            <img src={src} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover" style={{ filter: 'brightness(0.45) blur(16px)', transform: 'scale(1.15)' }} onError={() => setImgError(true)} />
            {/* Frente: imagen COMPLETA, sin zoom */}
            <img src={src} alt={label} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-contain" style={{ filter: 'brightness(0.85)' }} />
          </>
        ) : (
          <img
            src={src}
            alt={label}
            loading="lazy"
            decoding="async"
            onError={() => setImgError(true)}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ filter: 'brightness(0.75)' }}
          />
        )
      ) : (
        <span className="text-6xl">{emoji}</span>
      )}
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.28)' }} />
      <p className="relative z-10 font-black text-xl text-white tracking-widest uppercase text-center px-4"
        style={{ textShadow: '0 2px 8px rgba(0,0,0,0.7)' }}>
        {label}
      </p>
    </button>
  )
}
