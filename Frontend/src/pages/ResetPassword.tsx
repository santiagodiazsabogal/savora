import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Lock, Loader2, CheckCircle2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { resetPassword } from '../services/api'

export default function ResetPassword() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError(t('auth.reset_too_short', { defaultValue: 'Password must be at least 6 characters.' }))
      return
    }
    if (password !== confirm) {
      setError(t('auth.reset_mismatch', { defaultValue: "Passwords don't match." }))
      return
    }
    setLoading(true)
    try {
      await resetPassword(token, password)
      setDone(true)
      setTimeout(() => navigate('/login?reset=1'), 1800)
    } catch (err: any) {
      // El backend manda 'El enlace es inválido o ya expiró' u otros; lo mostramos tal cual.
      setError(err?.message || t('auth.reset_error', { defaultValue: "Couldn't reset the password." }))
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
            <span className="text-3xl">🔐</span>
          </div>
          <h1 className="text-3xl font-black">{t('auth.reset_title', { defaultValue: 'New password' })}</h1>
          <p className="sv-muted mt-1 text-sm">{t('auth.reset_subtitle', { defaultValue: 'Choose a new password for your account.' })}</p>
        </div>

        <div className="sv-glass sv-stagger-2 p-8 space-y-5">
          {!token ? (
            <div className="text-center space-y-4">
              <p className="text-sm" style={{ color: '#FCA5A5' }}>
                {t('auth.reset_no_token', { defaultValue: 'Invalid link. Request a new one from "Forgot your password?".' })}
              </p>
              <Link to="/forgot-password" className="sv-btn sv-btn-primary w-full py-3.5 text-base">
                {t('auth.forgot_button', { defaultValue: 'Send link' })}
              </Link>
            </div>
          ) : done ? (
            <div className="text-center space-y-4">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto" style={{ background: 'rgba(34,197,94,0.12)' }}>
                <CheckCircle2 className="w-7 h-7" style={{ color: '#86EFAC' }} />
              </div>
              <p className="text-sm sv-muted">{t('auth.reset_done', { defaultValue: 'Password updated. Redirecting to sign in…' })}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold sv-muted">{t('auth.new_password', { defaultValue: 'New password' })}</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--sv-text-dim)' }} />
                  <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required className="sv-input" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold sv-muted">{t('auth.confirm_password', { defaultValue: 'Confirm password' })}</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--sv-text-dim)' }} />
                  <input type="password" placeholder="••••••••" value={confirm} onChange={(e) => setConfirm(e.target.value)} required className="sv-input" />
                </div>
              </div>

              {error && (
                <div className="rounded-xl px-4 py-3 text-sm text-center" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading} className="sv-btn sv-btn-primary w-full py-3.5 text-base">
                {loading
                  ? <><Loader2 className="w-5 h-5 animate-spin" /> {t('auth.saving', { defaultValue: 'Saving…' })}</>
                  : t('auth.reset_button', { defaultValue: 'Reset password' })}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
