import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Mail, Lock, User, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const API_URL = (import.meta as any).env?.VITE_API_URL || '/api'

export default function Register() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!accepted) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // acceptTerms viaja al backend: el registro lo exige server-side (requisito UGC).
        body: JSON.stringify({ name, email, password, acceptTerms: accepted }),
      })

      const contentType = res.headers.get('content-type')
      let data: any = null
      if (contentType?.includes('application/json')) {
        data = await res.json()
      }

      if (!res.ok) throw new Error(data?.message || t('common.error_generic'))
      navigate('/login')
    } catch (err) {
      const errorObj = err as Error
      setError(errorObj.message || t('common.error_generic'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="sv-screen sv-page flex items-center justify-center px-5">
      <div className="sv-orbs"><div className="sv-orb sv-orb-1" /><div className="sv-orb sv-orb-2" /><div className="sv-orb sv-orb-3" /></div>

      <div className="sv-content w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8 sv-stagger-1">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'linear-gradient(135deg, var(--sv-primary), #FF8B54)', boxShadow: '0 8px 24px var(--sv-primary-glow)', transform: 'rotate(-5deg)' }}
          >
            <span className="text-3xl">🍳</span>
          </div>
          <h1 className="text-3xl font-black">Savora<span style={{ color: 'var(--sv-primary)' }}>.</span></h1>
          <p className="sv-muted mt-1 text-sm">{t('auth.register_subtitle')}</p>
        </div>

        {/* Card */}
        <div className="sv-glass sv-stagger-2 p-8 space-y-5">
          <form onSubmit={handleRegister} className="space-y-4">

            <div className="space-y-1.5">
              <label className="text-sm font-semibold sv-muted">{t('auth.name')}</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--sv-text-dim)' }} />
                <input
                  type="text"
                  placeholder={t('auth.name_placeholder')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="sv-input"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold sv-muted">{t('auth.email')}</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--sv-text-dim)' }} />
                <input
                  type="email"
                  placeholder={t('auth.email_placeholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="sv-input"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold sv-muted">{t('auth.password')}</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--sv-text-dim)' }} />
                <input
                  type="password"
                  placeholder={t('auth.password_placeholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="sv-input"
                />
              </div>
            </div>

            {/* Aceptación de Términos y Privacidad (requisito de UGC para App Store). Los
                enlaces abren en una pestaña nueva para no perder lo que escribiste. */}
            <label className="flex items-start gap-2.5 text-xs sv-muted leading-relaxed cursor-pointer">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-0.5 w-4 h-4 shrink-0 accent-[var(--sv-primary)]"
              />
              <span>
                {t('auth.accept_prefix', { defaultValue: 'I accept the' })}{' '}
                <a href="/terms" target="_blank" rel="noreferrer" className="font-semibold hover:underline" style={{ color: 'var(--sv-primary)' }}>
                  {t('auth.terms', { defaultValue: 'Terms' })}
                </a>{' '}
                {t('auth.accept_and', { defaultValue: 'and the' })}{' '}
                <a href="/privacy" target="_blank" rel="noreferrer" className="font-semibold hover:underline" style={{ color: 'var(--sv-primary)' }}>
                  {t('auth.privacy', { defaultValue: 'Privacy Policy' })}
                </a>.
              </span>
            </label>

            {error && (
              <div className="rounded-xl px-4 py-3 text-sm text-center" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !accepted}
              className="sv-btn sv-btn-primary w-full py-3.5 text-base disabled:opacity-50"
            >
              {loading
                ? <><Loader2 className="w-5 h-5 animate-spin" /> {t('auth.register_loading')}</>
                : t('auth.register_button')
              }
            </button>

          </form>

          <p className="text-center text-sm sv-muted">
            {t('auth.have_account')}{' '}
            <Link to="/login" className="font-semibold hover:underline" style={{ color: 'var(--sv-primary)' }}>
              {t('auth.sign_in')}
            </Link>
          </p>
        </div>

      </div>
    </div>
  )
}