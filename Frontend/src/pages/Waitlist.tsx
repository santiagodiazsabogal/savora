import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Loader2, Copy, Check, Share2, Trophy, Users, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { joinWaitlist, getWaitlistStatus } from '../services/api'

// 📋 Waitlist de pre-lanzamiento (savoracook.com/waitlist) — página PÚBLICA, sin auth.
// Registro con email → posición en la fila + link de referido propio (?ref=CODE).
// El código propio se guarda en localStorage: al volver, la página muestra el estado
// actualizado (GET /waitlist/:code) en vez del formulario. Un 409 (ya registrado) se
// trata como éxito con su posición existente (lo resuelve api.joinWaitlist).

const CODE_KEY = 'savora.waitlist.code'

interface Status {
  position: number
  referralCode: string
  totalSignups: number
  referralCount?: number
  alreadyRegistered?: boolean
}

export default function Waitlist() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const refCode = searchParams.get('ref')?.trim() || null

  const [email, setEmail] = useState('')
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<Status | null>(null)
  const [copied, setCopied] = useState(false)

  // Ya registrado en este dispositivo → mostrar su estado actualizado directamente.
  useEffect(() => {
    const saved = localStorage.getItem(CODE_KEY)
    if (!saved) return
    getWaitlistStatus(saved)
      .then(s => setStatus({ ...s, referralCode: saved }))
      .catch(() => localStorage.removeItem(CODE_KEY)) // código borrado/inválido → volver al form
  }, [])

  const referralUrl = useMemo(
    () => (status ? `${window.location.origin}/waitlist?ref=${status.referralCode}` : ''),
    [status],
  )

  const handleJoin = async () => {
    const clean = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) { setError(t('waitlist.error_invalid_email')); return }
    setJoining(true)
    setError('')
    try {
      const res = await joinWaitlist(clean, refCode ?? undefined)
      localStorage.setItem(CODE_KEY, res.referralCode)
      setStatus(res)
    } catch (err: any) {
      if (err.message === 'DISPOSABLE_EMAIL') setError(t('waitlist.error_disposable'))
      else if (err.message === 'RATE_LIMITED') setError(t('waitlist.error_rate_limited'))
      else if (String(err.message).toLowerCase().includes('email')) setError(t('waitlist.error_invalid_email'))
      else setError(t('waitlist.error_generic'))
    } finally {
      setJoining(false)
    }
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard bloqueado → el usuario puede seleccionar el texto */ }
  }

  const shareLink = async () => {
    // navigator.share solo existe en móvil/https → fallback a copiar.
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Savora', text: t('waitlist.subtitle'), url: referralUrl })
        return
      } catch { /* cancelado por el usuario */ }
    } else {
      copyLink()
    }
  }

  const perks = [
    { icon: <Trophy className="w-4 h-4" style={{ color: '#F5D26B' }} />, text: t('waitlist.perk_top100') },
    { icon: <Trophy className="w-4 h-4" style={{ color: '#C0C7D1' }} />, text: t('waitlist.perk_top500') },
    { icon: <Sparkles className="w-4 h-4" style={{ color: 'var(--sv-primary)' }} />, text: t('waitlist.perk_rest') },
  ]

  return (
    <div className="sv-screen sv-page min-h-[100dvh] flex flex-col items-center px-5 pt-12 pb-10">
      <div className="w-full" style={{ maxWidth: 430 }}>

        {/* HERO */}
        <div className="text-center sv-stagger-1">
          <img
            src="/images/mascot/mascot-whisk.webp"
            alt="Savora mascot"
            className="w-28 h-28 mx-auto object-contain"
            style={{ filter: 'drop-shadow(0 8px 24px rgba(255,94,26,0.35))' }}
          />
          <p className="text-sm font-black tracking-[0.25em] uppercase mt-2" style={{ color: 'var(--sv-primary)' }}>
            Savora
          </p>
          <h1 className="text-3xl font-black leading-tight mt-3">{t('waitlist.title')}</h1>
          <p className="sv-muted mt-2 text-base">{t('waitlist.subtitle')}</p>
          <p className="mt-2 text-sm font-bold italic" style={{ color: 'var(--sv-primary)' }}>
            {t('waitlist.slogan')}
          </p>
        </div>

        {!status ? (
          /* ── FORMULARIO ── */
          <div className="mt-8 space-y-4 sv-stagger-2">
            {refCode && (
              <div className="rounded-2xl px-4 py-3 text-sm font-semibold text-center" style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#6EE7B7' }}>
                {t('waitlist.invited_banner')}
              </div>
            )}

            <div className="sv-glass p-5 space-y-3">
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleJoin() } }}
                placeholder={t('waitlist.email_placeholder')}
                className="sv-input w-full text-base"
                style={{ paddingLeft: 16 }}
                maxLength={120}
              />
              <button
                onClick={handleJoin}
                disabled={joining || !email.trim()}
                className="sv-btn sv-btn-primary w-full py-4 text-base"
              >
                {joining
                  ? <><Loader2 className="w-5 h-5 animate-spin" /> {t('waitlist.joining')}</>
                  : t('waitlist.cta')}
              </button>
              {error && (
                <p className="text-sm text-center" style={{ color: '#FCA5A5' }}>{error}</p>
              )}
            </div>

            {/* Incentivos */}
            <div className="sv-glass-solid p-4 space-y-2.5">
              <p className="text-xs font-bold uppercase tracking-wider sv-dim">{t('waitlist.perks_title')}</p>
              {perks.map((p, i) => (
                <div key={i} className="flex items-center gap-2.5 text-sm font-medium">
                  <span className="shrink-0">{p.icon}</span> {p.text}
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* ── ESTADO POST-REGISTRO ── */
          <div className="mt-8 space-y-4 sv-stagger-2">
            {status.alreadyRegistered && (
              <p className="text-sm text-center sv-muted">{t('waitlist.already_registered')}</p>
            )}

            <div className="sv-glass p-6 text-center">
              <p className="text-lg font-black">{t('waitlist.position_title')}</p>
              <p className="text-xs font-bold uppercase tracking-wider sv-dim mt-4">{t('waitlist.position_label')}</p>
              <p className="font-black leading-none mt-1" style={{ fontSize: 64, color: 'var(--sv-primary)' }}>
                #{status.position}
              </p>
              <p className="text-sm sv-muted mt-3 flex items-center justify-center gap-1.5">
                <Users className="w-4 h-4" /> {t('waitlist.total_line', { total: status.totalSignups })}
              </p>
            </div>

            {/* Link de referido */}
            <div className="sv-glass p-5 space-y-3">
              <div>
                <p className="text-base font-bold">🚀 {t('waitlist.referral_title')}</p>
                <p className="text-xs sv-muted mt-0.5">{t('waitlist.referral_hint')}</p>
              </div>
              <div className="rounded-xl px-3 py-2.5 text-xs font-mono break-all" style={{ background: 'var(--sv-bg-input)', border: '1px solid var(--sv-border-light)' }}>
                {referralUrl}
              </div>
              <div className="flex gap-2">
                <button onClick={copyLink} className="sv-btn sv-btn-primary flex-1 py-3 text-sm">
                  {copied ? <><Check className="w-4 h-4" /> {t('waitlist.copied')}</> : <><Copy className="w-4 h-4" /> {t('waitlist.copy')}</>}
                </button>
                <button
                  onClick={shareLink}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold transition active:scale-95"
                  style={{ border: '1px solid var(--sv-border-strong)', background: 'var(--sv-bg-input)' }}
                >
                  <Share2 className="w-4 h-4" /> {t('waitlist.share')}
                </button>
              </div>
            </div>

            {/* Incentivos + hint */}
            <div className="sv-glass-solid p-4 space-y-2.5">
              <p className="text-xs font-bold uppercase tracking-wider sv-dim">{t('waitlist.perks_title')}</p>
              {perks.map((p, i) => (
                <div key={i} className="flex items-center gap-2.5 text-sm font-medium">
                  <span className="shrink-0">{p.icon}</span> {p.text}
                </div>
              ))}
            </div>
            <p className="text-xs sv-dim text-center">{t('waitlist.refresh_hint')}</p>
          </div>
        )}

      </div>
    </div>
  )
}
