import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Clock, Zap, ChefHat, Coffee, Timer, Infinity } from 'lucide-react'

const TIME_OPTIONS = [
  { key: '15min',      value: '15 minutes', icon: Zap,      color: 'bg-emerald-50 border-emerald-200 hover:border-emerald-400 hover:bg-emerald-100', iconColor: 'text-emerald-500' },
  { key: '30min',      value: '30 minutes', icon: Coffee,   color: 'bg-orange-50 border-orange-200 hover:border-orange-400 hover:bg-orange-100',     iconColor: 'text-orange-500' },
  { key: '45min',      value: '45 minutes', icon: Timer,    color: 'bg-amber-50 border-amber-200 hover:border-amber-400 hover:bg-amber-100',         iconColor: 'text-amber-500' },
  { key: '1hour',      value: '1 hour',     icon: Clock,    color: 'bg-blue-50 border-blue-200 hover:border-blue-400 hover:bg-blue-100',             iconColor: 'text-blue-500' },
  { key: '1hour_plus', value: '+1 hour',    icon: ChefHat,  color: 'bg-purple-50 border-purple-200 hover:border-purple-400 hover:bg-purple-100',     iconColor: 'text-purple-500' },
  { key: 'no_limit',   value: null,         icon: Infinity, color: 'bg-gray-50 border-gray-200 hover:border-gray-400 hover:bg-gray-100',             iconColor: 'text-gray-400' },
]

export default function TimeSelect() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const handleSelect = (timeValue: string | null) => {
    navigate('/meal-type', { state: { timeAvailable: timeValue } })
  }

  return (
    <div className="sv-screen sv-page flex flex-col px-5 pt-14 pb-10">
      <div className="mb-8 sv-stagger-1">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5" style={{ background: 'rgba(255,94,26,0.15)' }}>
          <Clock className="w-6 h-6" style={{ color: 'var(--sv-primary)' }} />
        </div>
        <h1 className="text-3xl font-black leading-tight">
          {t('time_select.title')}
        </h1>
        <p className="sv-muted mt-2 text-base">{t('time_select.subtitle')}</p>
      </div>

      <div className="space-y-3 flex-1 sv-stagger-2">
        {TIME_OPTIONS.map((opt) => {
          const Icon = opt.icon
          return (
            <button
              key={opt.key}
              onClick={() => handleSelect(opt.value)}
              className="sv-glass sv-glass-hover w-full p-4 flex items-center gap-4 text-left"
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--sv-border-light)' }}>
                <Icon className={`w-5 h-5 ${opt.iconColor}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-base">
                  {t(`time_select.options.${opt.key}.label`)}
                </p>
                <p className="sv-muted text-sm">
                  {t(`time_select.options.${opt.key}.sublabel`)}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      <button
        onClick={() => navigate('/recipe-start')}
        className="mt-6 mx-auto flex items-center justify-center text-sm font-semibold rounded-full px-6 py-2.5 transition-opacity active:scale-95"
        style={{ color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.30)', background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)' }}
      >
        {t('common.back')}
      </button>

    </div>
  )
}