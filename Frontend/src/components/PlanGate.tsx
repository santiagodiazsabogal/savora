import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Lock } from 'lucide-react'
import { getProfile } from '../services/api'
import LoadingScreen from './ui/LoadingScreen'
import { isPaid, isChef } from '../utils/plan'

// Envuelve una ruta y solo deja pasar si el plan del usuario alcanza el tier requerido.
// 'paid' = PRO o CHEF (Duelo). 'chef' = solo CHEF (Cursos). Si no califica, muestra una
// pantalla de "mejora tu plan" en vez de la función (el backend igual lo rechaza con 403).
export default function PlanGate({
  require,
  children,
}: {
  require: 'paid' | 'chef'
  children: React.ReactNode
}) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [plan, setPlan] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    getProfile()
      .then((p) => { if (active) setPlan(p?.plan ?? 'FREE') })
      .catch((err: any) => {
        if (err?.message === '401') { localStorage.removeItem('token'); navigate('/login'); return }
        if (active) setPlan('FREE')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [navigate])

  if (loading) return <LoadingScreen />

  const allowed = require === 'chef' ? isChef(plan) : isPaid(plan)
  if (allowed) return <>{children}</>

  const tier = require === 'chef' ? 'CHEF' : 'PRO'
  return (
    <div className="sv-screen sv-page flex flex-col items-center justify-center text-center px-8">
      <div className="sv-orbs"><div className="sv-orb sv-orb-1" /><div className="sv-orb sv-orb-2" /><div className="sv-orb sv-orb-3" /></div>
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5" style={{ background: 'rgba(255,94,26,0.15)' }}>
        <Lock className="w-7 h-7" style={{ color: 'var(--sv-primary)' }} />
      </div>
      <h1 className="text-2xl font-black">
        {t('plan_gate.title', { tier, defaultValue: '{{tier}} feature' })}
      </h1>
      <p className="sv-muted mt-2 max-w-xs">
        {t('plan_gate.subtitle', { tier, defaultValue: 'This feature is available on the {{tier}} plan. Upgrade your plan to unlock it.' })}
      </p>
      <button onClick={() => navigate('/dashboard')} className="sv-btn sv-btn-primary mt-6 px-6 py-3">
        {t('plan_gate.back', { defaultValue: 'Back to home' })}
      </button>
    </div>
  )
}
