import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { forgotPassword } from '../services/api'

export default function ForgotPassword() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await forgotPassword(email)
      setSent(true)
    } catch (err: any) {
      setError(err?.message || t('auth.forgot_error', { defaultValue: "Couldn't send the email. Please try again." }))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="sv-screen sv-page flex items-center justify-center px-5">
      <div className="sv-orbs"><div className="sv-orb sv-orb-1" /><div className="sv-orb sv-orb-2" /><div className="sv-orb sv-orb-3" /></div>

      <div className="sv-content w-full max-w-sm">
        <div className="text-center mb-8 sv-stagger-1">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'linear-gradient(135deg, var(--sv-primary), #FF8B54)', boxShadow: '0 8px 24px var(--sv-primary-glow)', transform: 'rotate(-5deg)' }}
          >
            <span className="text-3xl">🔑</span>
          </div>
          <h1 className="text-3xl font-black">{t('auth.forgot_title', { defaultValue: 'Forgot your password?' })}</h1>
          <p className="sv-muted mt-1 text-sm">{t('auth.forgot_subtitle', { defaultValue: "We'll send you a link to create a new one." })}</p>
        </div>

        <div className="sv-glass sv-stagger-2 p-8 space-y-5">
          {sent ? (
            <div className="text-center space-y-4">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto" style={{ background: 'rgba(34,197,94,0.12)' }}>
                <CheckCircle2 className="w-7 h-7" style={{ color: '#86EFAC' }} />
              </div>
              <p className="text-sm sv-muted leading-relaxed">
                {t('auth.forgot_sent', { defaultValue: "If the email is registered, we've sent you a link to reset your password. Check your inbox (and spam)." })}
              </p>
              <Link to="/login" className="sv-btn sv-btn-primary w-full py-3.5 text-base">
                {t('auth.back_to_login', { defaultValue: 'Back to sign in' })}
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
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

              {error && (
                <div className="rounded-xl px-4 py-3 text-sm text-center" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading} className="sv-btn sv-btn-primary w-full py-3.5 text-base">
                {loading
                  ? <><Loader2 className="w-5 h-5 animate-spin" /> {t('auth.sending', { defaultValue: 'Sending…' })}</>
                  : t('auth.forgot_button', { defaultValue: 'Send link' })}
              </button>

              <Link to="/login" className="flex items-center justify-center gap-1.5 text-sm sv-muted hover:underline">
                <ArrowLeft className="w-4 h-4" /> {t('auth.back_to_login', { defaultValue: 'Back to sign in' })}
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
