import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChefHat, Compass, MessageCircle } from 'lucide-react'

export default function RecipeStart() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  return (
    <div className="sv-screen sv-page flex flex-col px-5 pt-14 pb-10">
      {/* Header */}
      <div className="mb-10 sv-stagger-1">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5" style={{ background: 'rgba(255,94,26,0.15)' }}>
          <ChefHat className="w-6 h-6" style={{ color: 'var(--sv-primary)' }} />
        </div>
        <h1 className="text-3xl font-black leading-tight">
          {t('recipe_start.title')}
        </h1>
        <p className="sv-muted mt-2 text-base">{t('recipe_start.subtitle')}</p>
      </div>

      {/* Opciones */}
      <div className="space-y-4 flex-1 sv-stagger-2">

        {/* Guíame — flujo normal (tiempo → franja → modo), opción principal */}
        <button
          onClick={() => navigate('/time-select')}
          className="sv-btn sv-btn-primary w-full p-6"
          style={{ borderRadius: 'var(--sv-radius-md)' }}
        >
          <div className="flex items-center gap-4 w-full">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.2)' }}>
              <Compass className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-xl font-bold">{t('recipe_start.guided_title')}</p>
              <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.85)' }}>{t('recipe_start.guided_subtitle')}</p>
            </div>
          </div>
        </button>

        {/* Tengo algo en mente → directo al chat del chef (sin sugerencias) */}
        <button
          onClick={() => navigate('/recipes', { state: { direct: true } })}
          className="sv-glass sv-glass-hover w-full p-6 text-left"
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,94,26,0.15)' }}>
              <MessageCircle className="w-7 h-7" style={{ color: 'var(--sv-primary)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xl font-bold">{t('recipe_start.idea_title')}</p>
              <p className="sv-muted text-sm mt-0.5">{t('recipe_start.idea_subtitle')}</p>
            </div>
          </div>
        </button>

      </div>

      <button
        onClick={() => navigate('/dashboard')}
        className="mt-6 mx-auto flex items-center justify-center text-sm font-semibold rounded-full px-6 py-2.5 transition-opacity active:scale-95"
        style={{ color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.30)', background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)' }}
      >
        {t('time_select.cancel')}
      </button>

    </div>
  )
}
