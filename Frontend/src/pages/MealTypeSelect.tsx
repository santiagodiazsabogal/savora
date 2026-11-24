import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Clock, Utensils } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'

interface MealType {
  key: string
  emoji: string
  image?: string
  tint: string
}

const MEAL_TYPES: MealType[] = [
  { key: 'breakfast', emoji: '🌅', image: '/images/meals/breakfast.jpg', tint: 'rgba(20,12,5,0.52)' },
  { key: 'lunch',     emoji: '☀️', image: '/images/meals/lunch.jpg', tint: 'rgba(20,10,5,0.52)' },
  { key: 'dinner',    emoji: '🌙', image: '/images/meals/dinner.jpg', tint: 'rgba(15,8,5,0.50)' },
  { key: 'snack',     emoji: '🍎', image: '/images/meals/snack.jpg', tint: 'rgba(10,8,5,0.48)' },
  { key: 'dessert',   emoji: '🍰', image: '/images/meals/dessert.jpg', tint: 'rgba(10,8,12,0.45)' },
  { key: 'drink',     emoji: '🍹', image: '/images/meals/drink.jpg', tint: 'rgba(8,12,5,0.46)' },
  { key: 'cocktail',  emoji: '🍸', image: '/images/meals/cocktail.jpg', tint: 'rgba(12,5,10,0.44)' },
  { key: 'surprise',  emoji: '🎲', image: '/images/meals/surprise.jpg', tint: 'rgba(10,8,5,0.40)' },
]

function MealButton({ meal, label, onClick, dark }: { meal: MealType; label: string; onClick: () => void; dark: boolean }) {
  const hasImage = Boolean(meal.image)

  // Fotos un poco más claras (más en tema claro). Mantenemos el borde inferior
  // oscuro para que el texto blanco del label siga legible.
  const imgFilter = dark ? 'saturate(0.92) brightness(0.98)' : 'saturate(1) brightness(1.12)'
  const overlay = hasImage
    ? (dark
        ? 'linear-gradient(to top, rgba(5,2,10,0.80) 0%, rgba(15,8,5,0.40) 50%, rgba(0,0,0,0.06) 100%)'
        : 'linear-gradient(to top, rgba(5,2,10,0.66) 0%, rgba(20,10,5,0.20) 46%, rgba(0,0,0,0) 100%)')
    : `radial-gradient(circle at 50% 30%, ${meal.tint}, rgba(10,5,15,0.92))`

  return (
    <button
      onClick={onClick}
      className="group relative overflow-hidden flex flex-col items-center justify-end aspect-square rounded-3xl border border-white/10 transition-all duration-300 hover:-translate-y-1 hover:border-white/40 active:scale-95"
      style={{
        background: hasImage ? undefined : 'rgba(255,255,255,0.05)',
      }}
    >
      {/* Foto de fondo — más zoom y encuadre bajado al plato (que está abajo).
          Hace zoom extra al pasar el dedo/mouse. */}
      {hasImage && (
        <img
          src={meal.image}
          alt={label}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 ease-out scale-110 group-hover:scale-[1.22]"
          style={{ filter: imgFilter, objectPosition: 'center 72%' }}
        />
      )}

      {/* Tinte de color sobre la imagen */}
      <div className="absolute inset-0" style={{ background: overlay }} />

      {/* Emoji — solo cuando no hay foto */}
      {!hasImage && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ marginTop: -10 }}>
          <span className="text-4xl">{meal.emoji}</span>
        </div>
      )}

      {/* Label + subrayado naranja que crece al pasar el dedo/mouse */}
      <div className="relative z-10 w-full px-3 pb-4 flex flex-col items-center text-center">
        <p className="font-bold text-sm text-white leading-snug drop-shadow-sm">{label}</p>
        <span
          className="mt-1.5 h-0.5 w-0 rounded-full transition-all duration-300 ease-out group-hover:w-8"
          style={{ background: 'var(--sv-primary)' }}
        />
      </div>
    </button>
  )
}

export default function MealTypeSelect() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()
  const { theme } = useTheme()
  const dark = theme === 'dark'

  const timeAvailable: string | null = location.state?.timeAvailable ?? null

  const handleSelect = (mealType: string) => {
    navigate('/pantry-check', { state: { timeAvailable, mealType } })
  }

  return (
    <div className="sv-screen sv-page flex flex-col px-5 pt-14 pb-10">
      {/* Header */}
      <div className="mb-8 sv-stagger-1">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5" style={{ background: 'rgba(255,94,26,0.15)' }}>
          <Utensils className="w-6 h-6" style={{ color: 'var(--sv-primary)' }} />
        </div>
        <h1 className="text-3xl font-black leading-tight">
          {t('meal_type.title')}
        </h1>
        <p className="sv-muted mt-2 text-base">{t('meal_type.subtitle')}</p>

        {timeAvailable && (
          <div className="inline-flex items-center gap-1.5 mt-4 text-sm font-semibold px-3 py-1.5 rounded-full" style={{ background: 'rgba(255,94,26,0.12)', color: 'var(--sv-primary)', border: '1px solid rgba(255,94,26,0.25)' }}>
            <Clock className="w-3.5 h-3.5" />
            {timeAvailable}
          </div>
        )}
      </div>

      {/* Grid 2 columnas */}
      <div className="grid grid-cols-2 gap-3 flex-1 sv-stagger-2">
        {MEAL_TYPES.map(meal => (
          <MealButton
            key={meal.key}
            meal={meal}
            label={t(`meal_type.options.${meal.key}`)}
            onClick={() => handleSelect(meal.key)}
            dark={dark}
          />
        ))}
      </div>

      {/* Volver */}
      <button
        onClick={() => navigate('/time-select')}
        className="mt-6 mx-auto flex items-center justify-center text-sm font-semibold rounded-full px-6 py-2.5 transition-opacity active:scale-95"
        style={{
          color: '#FFFFFF',
          border: '1px solid rgba(255,255,255,0.30)',
          background: 'rgba(255,255,255,0.08)',
          backdropFilter: 'blur(8px)',
        }}
      >
        {t('common.back')}
      </button>

    </div>
  )
}
