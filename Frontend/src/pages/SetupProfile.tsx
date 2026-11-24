import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, ChevronLeft, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const API_URL = (import.meta as any).env?.VITE_API_URL || '/api'

const STEP_KEYS = [
  {
    key: 'cookingLevel',
    emoji: '👨‍🍳',
    titleKey: 'setup.cooking_level_title',
    subtitleKey: 'setup.cooking_level_subtitle',
    optionsKey: 'setup.cooking_levels',
    values: ['beginner', 'intermediate', 'advanced'],
    emojis: ['🥄', '🍳', '👨‍🍳'],
  },
  {
    key: 'dietType',
    emoji: '🥗',
    titleKey: 'setup.diet_title',
    subtitleKey: 'setup.diet_subtitle',
    optionsKey: 'setup.diet_types',
    values: ['omnivore', 'vegetarian', 'vegan', 'keto', 'gluten_free', 'lactose_free'],
    emojis: ['🍖', '🥦', '🌱', '🥑', '🌾', '🥛'],
  },
  {
    key: 'goal',
    emoji: '🎯',
    titleKey: 'setup.goal_title',
    subtitleKey: 'setup.goal_subtitle',
    optionsKey: 'setup.goals',
    values: ['eat_healthy', 'save_money', 'learn_cooking', 'explore', 'cook_fast'],
    emojis: ['💚', '💰', '📚', '🌍', '⚡'],
  },
]

function OptionCard({
  label,
  description,
  emoji,
  selected,
  onSelect,
}: {
  label: string
  description: string
  emoji: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl text-left transition-all duration-150 active:scale-[0.98]"
      style={selected
        ? { border: '1px solid var(--sv-primary)', background: 'rgba(255,94,26,0.12)' }
        : { border: '1px solid var(--sv-border-light)', background: 'var(--sv-bg-surface)' }}
    >
      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0" style={{ background: selected ? 'rgba(255,94,26,0.18)' : 'var(--sv-bg-input)' }}>
        {emoji}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-base" style={{ color: selected ? 'var(--sv-primary)' : 'var(--sv-text-main)' }}>
          {label}
        </p>
        <p className="text-sm sv-dim mt-0.5">{description}</p>
      </div>
      <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all" style={selected ? { background: 'var(--sv-primary)' } : { border: '2px solid var(--sv-border-strong)' }}>
        {selected && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
      </div>
    </button>
  )
}

export default function SetupProfile() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)

  const [cookingLevel, setCookingLevel] = useState('')
  const [dietType, setDietType] = useState('')
  const [goal, setGoal] = useState('')
  const [allergies, setAllergies] = useState('')

  const TOTAL_STEPS = STEP_KEYS.length + 1 // +1 alergias, confirm no cuenta en barra

  const getStepValue = (key: string) => {
    if (key === 'cookingLevel') return cookingLevel
    if (key === 'dietType') return dietType
    if (key === 'goal') return goal
    return ''
  }

  const setStepValue = (key: string, value: string) => {
    if (key === 'cookingLevel') setCookingLevel(value)
    if (key === 'dietType') setDietType(value)
    if (key === 'goal') setGoal(value)
  }

  async function handleSave() {
    const token = localStorage.getItem('token')
    if (!token) { navigate('/login'); return }

    setSaving(true)
    try {
      const res = await fetch(`${API_URL}/users/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ cookingLevel, dietType, allergies, goal }),
      })

      if (res.status === 401) {
        localStorage.removeItem('token')
        navigate('/login')
        return
      }

      navigate('/dashboard')
    } catch (error) {
      console.error('Error saving profile:', error)
    } finally {
      setSaving(false)
    }
  }

  const progressPct = Math.round(((step + 1) / TOTAL_STEPS) * 100)

  // ── STEPS DE SELECCIÓN ──
  if (step < STEP_KEYS.length) {
    const current = STEP_KEYS[step]
    const currentValue = getStepValue(current.key)
    const options = current.values.map((v, i) => ({
      value: v,
      emoji: current.emojis[i],
      label: t(`${current.optionsKey}.${v}.label`),
      description: t(`${current.optionsKey}.${v}.description`),
    }))

    return (
      <div className="sv-screen sv-page flex flex-col px-5 pt-12 pb-10">
        {/* Progress */}
        <div className="mb-8 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm sv-muted font-medium">
              {t('setup.step', { current: step + 1, total: TOTAL_STEPS })}
            </span>
            <span className="text-sm font-semibold" style={{ color: 'var(--sv-primary)' }}>{progressPct}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--sv-border-light)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg, #FF8B54, var(--sv-primary))', boxShadow: '0 0 10px var(--sv-primary-glow)' }}
            />
          </div>
        </div>

        {/* Header */}
        <div className="mb-6">
          <div className="text-4xl mb-3">{current.emoji}</div>
          <h2 className="text-2xl font-black">{t(current.titleKey)}</h2>
          <p className="sv-muted mt-1">{t(current.subtitleKey)}</p>
        </div>

        {/* Options */}
        <div className="space-y-3 flex-1">
          {options.map(opt => (
            <OptionCard
              key={opt.value}
              emoji={opt.emoji}
              label={opt.label}
              description={opt.description}
              selected={currentValue === opt.value}
              onSelect={() => {
                setStepValue(current.key, opt.value)
                setTimeout(() => setStep(step + 1), 150)
              }}
            />
          ))}
        </div>

        {step > 0 && (
          <button
            onClick={() => setStep(step - 1)}
            className="mt-6 flex items-center justify-center gap-1.5 text-sm font-semibold rounded-full px-5 py-2 transition-opacity active:scale-95"
            style={{ color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.30)', background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)' }}
          >
            <ChevronLeft className="w-4 h-4" /> {t('common.back')}
          </button>
        )}
      </div>
    )
  }

  // ── STEP ALERGIAS ──
  if (step === STEP_KEYS.length) {
    return (
      <div className="sv-screen sv-page flex flex-col px-5 pt-12 pb-10">
        <div className="mb-8 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm sv-muted font-medium">
              {t('setup.step', { current: step + 1, total: TOTAL_STEPS })}
            </span>
            <span className="text-sm font-semibold" style={{ color: 'var(--sv-primary)' }}>{progressPct}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--sv-border-light)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg, #FF8B54, var(--sv-primary))', boxShadow: '0 0 10px var(--sv-primary-glow)' }}
            />
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <div className="text-4xl mb-3">⚠️</div>
            <h2 className="text-2xl font-black">{t('setup.allergies_title')}</h2>
            <p className="sv-muted mt-1">{t('setup.allergies_subtitle')}</p>
          </div>

          <textarea
            value={allergies}
            onChange={e => setAllergies(e.target.value)}
            placeholder={t('setup.allergies_placeholder')}
            rows={3}
            className="sv-input w-full text-base resize-none"
            style={{ paddingLeft: 16 }}
          />
          <p className="text-sm sv-dim">{t('setup.allergies_skip')}</p>

          <div className="flex gap-3">
            <button
              onClick={() => setStep(step - 1)}
              className="sv-btn sv-btn-glass px-5 py-3"
            >
              <ChevronLeft className="w-4 h-4" /> {t('common.back')}
            </button>
            <button
              onClick={() => setStep(step + 1)}
              className="sv-btn sv-btn-primary flex-1 py-3"
            >
              {t('common.continue')} <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── CONFIRM ──
  return (
    <div className="sv-screen sv-page flex flex-col items-center justify-center px-5 pb-10">
      <div className="space-y-6 text-center w-full max-w-sm">
        <div className="text-6xl">🎉</div>
        <div>
          <h2 className="text-2xl font-black">{t('setup.confirm_title')}</h2>
          <p className="sv-muted mt-2">{t('setup.confirm_subtitle')}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setStep(step - 1)}
            className="sv-btn sv-btn-glass px-5 py-3"
          >
            <ChevronLeft className="w-4 h-4" /> {t('common.back')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="sv-btn sv-btn-primary flex-1 py-3"
          >
            {saving ? t('common.saving') : t('setup.confirm_button')}
          </button>
        </div>
      </div>
    </div>
  )
}