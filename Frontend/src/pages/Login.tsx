import { useState, useContext } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { Mail, Lock, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { loginUser } from '../services/api'
import { AuthContext } from '../context/AuthContext'

export default function Login() {
  const navigate = useNavigate()
  const auth = useContext(AuthContext)
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const verified = searchParams.get('verified')
  const reset = searchParams.get('reset')
  const deleted = searchParams.get('deleted')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const data = await loginUser(email, password)
      if (!data.access_token) throw new Error('Login inválido')
      auth?.login(data.access_token, data.refresh_token)
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.message || t('auth.login_error'))
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
          <p className="sv-muted mt-1 text-sm">{t('auth.login_subtitle')}</p>
        </div>

        {/* Card */}
        <div className="sv-glass sv-stagger-2 p-8 space-y-5">

          {verified === '1' && (
            <div className="rounded-xl px-4 py-3 text-sm text-center" style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', color: '#86EFAC' }}>
              {t('auth.verified_success')}
            </div>
          )}
          {verified === '0' && (
            <div className="rounded-xl px-4 py-3 text-sm text-center" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }}>
              {t('auth.verified_error')}
            </div>
          )}
          {reset === '1' && (
            <div className="rounded-xl px-4 py-3 text-sm text-center" style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', color: '#86EFAC' }}>
              {t('auth.reset_success', { defaultValue: 'Password updated. Sign in with your new one.' })}
            </div>
          )}
          {deleted === '1' && (
            <div className="rounded-xl px-4 py-3 text-sm text-center" style={{ background: 'var(--sv-bg-input)', border: '1px solid var(--sv-border-light)', color: 'var(--sv-text-muted)' }}>
              {t('auth.account_deleted', { defaultValue: 'Your account was deleted. We hope to see you again someday.' })}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">

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
              <div className="text-right">
                <Link to="/forgot-password" className="text-xs font-semibold hover:underline" style={{ color: 'var(--sv-primary)' }}>
                  {t('auth.forgot_link', { defaultValue: 'Forgot your password?' })}
                </Link>
              </div>
            </div>

            {error && (
              <div className="rounded-xl px-4 py-3 text-sm text-center" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="sv-btn sv-btn-primary w-full py-3.5 text-base"
            >
              {loading
                ? <><Loader2 className="w-5 h-5 animate-spin" /> {t('auth.login_loading')}</>
                : t('auth.login_button')
              }
            </button>

          </form>

          <p className="text-center text-sm sv-muted">
            {t('auth.no_account')}{' '}
            <Link to="/register" className="font-semibold hover:underline" style={{ color: 'var(--sv-primary)' }}>
              {t('auth.create_account')}
            </Link>
          </p>
        </div>

      </div>
    </div>
  )
}