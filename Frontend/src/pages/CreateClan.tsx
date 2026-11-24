import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Shield, Globe, Lock } from 'lucide-react'
import { createClan } from '../services/api'

const CUISINES = [
  'Italian', 'Mexican', 'Chinese', 'Japanese', 'Indian', 'French', 'Spanish',
  'American', 'Thai', 'Greek', 'British', 'Turkish', 'Moroccan', 'Vietnamese',
]

export default function CreateClan() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [tipoAcceso, setTipoAcceso] = useState<'abierto' | 'cerrado'>('abierto')
  const [especializacion, setEspecializacion] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (nombre.trim().length < 3) { setError(t('clans.name_too_short')); return }
    setSaving(true)
    setError('')
    try {
      const clan = await createClan({
        nombre: nombre.trim(),
        descripcion: descripcion.trim(),
        tipoAcceso,
        especializacion: especializacion || null,
      })
      navigate(`/clans/${clan.id}`, { replace: true })
    } catch (err: any) {
      if (err.message === '401') { localStorage.removeItem('token'); navigate('/login'); return }
      const code = err.message
      const msg = code === 'CLAN_NAME_OFFENSIVE' ? t('clans.name_offensive')
        : code === 'CLAN_DESC_OFFENSIVE' ? t('clans.desc_offensive')
        : (code || t('common.error_generic'))
      setError(msg)
      setSaving(false)
    }
  }

  return (
    <div className="sv-screen sv-page flex flex-col">
      <div className="sv-orbs"><div className="sv-orb sv-orb-1" /><div className="sv-orb sv-orb-2" /></div>
      <div className="sv-content flex flex-col flex-1">

        <div className="px-4 pt-12 pb-2 flex items-center gap-3">
          <button onClick={() => navigate('/clans')} className="w-10 h-10 flex items-center justify-center rounded-2xl transition active:scale-95" style={{ background: 'var(--sv-bg-surface)', border: '1px solid var(--sv-border-light)' }}>
            <ArrowLeft className="w-5 h-5 sv-muted" />
          </button>
          <h1 className="text-xl font-black">{t('clans.create_title')}</h1>
        </div>

        <div className="px-6 pt-4 pb-12 space-y-5">
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.18)' }}>
              <Shield className="w-10 h-10" style={{ color: 'var(--sv-clan-accent)' }} />
            </div>
          </div>

          {/* Nombre */}
          <div>
            <label className="text-sm font-semibold sv-muted block mb-1.5">{t('clans.name')}</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={30}
              placeholder={t('clans.name_placeholder')}
              className="w-full rounded-2xl px-4 py-3 text-sm outline-none"
              style={{ background: 'var(--sv-bg-input)', border: '1px solid var(--sv-border-light)', color: 'var(--sv-text)' }}
            />
          </div>

          {/* Descripción */}
          <div>
            <label className="text-sm font-semibold sv-muted block mb-1.5">{t('clans.description')}</label>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              maxLength={140}
              rows={3}
              placeholder={t('clans.description_placeholder')}
              className="w-full rounded-2xl px-4 py-3 text-sm outline-none resize-none"
              style={{ background: 'var(--sv-bg-input)', border: '1px solid var(--sv-border-light)', color: 'var(--sv-text)' }}
            />
          </div>

          {/* Tipo de acceso */}
          <div>
            <label className="text-sm font-semibold sv-muted block mb-1.5">{t('clans.access_type')}</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setTipoAcceso('abierto')}
                className="rounded-2xl p-3 text-left transition active:scale-95"
                style={tipoAcceso === 'abierto'
                  ? { background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.5)' }
                  : { background: 'var(--sv-bg-input)', border: '1px solid var(--sv-border-light)' }}
              >
                <Globe className="w-5 h-5 mb-1.5" style={{ color: tipoAcceso === 'abierto' ? 'var(--sv-clan-accent)' : 'var(--sv-text-dim)' }} />
                <p className="font-bold text-sm">{t('clans.access.abierto')}</p>
                <p className="text-[11px] sv-dim leading-snug mt-0.5">{t('clans.access_open_desc')}</p>
              </button>
              <button
                onClick={() => setTipoAcceso('cerrado')}
                className="rounded-2xl p-3 text-left transition active:scale-95"
                style={tipoAcceso === 'cerrado'
                  ? { background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.5)' }
                  : { background: 'var(--sv-bg-input)', border: '1px solid var(--sv-border-light)' }}
              >
                <Lock className="w-5 h-5 mb-1.5" style={{ color: tipoAcceso === 'cerrado' ? 'var(--sv-clan-accent)' : 'var(--sv-text-dim)' }} />
                <p className="font-bold text-sm">{t('clans.access.cerrado')}</p>
                <p className="text-[11px] sv-dim leading-snug mt-0.5">{t('clans.access_closed_desc')}</p>
              </button>
            </div>
          </div>

          {/* Especialización */}
          <div>
            <label className="text-sm font-semibold sv-muted block mb-1.5">{t('clans.specialization')} <span className="sv-dim font-normal">({t('clans.optional')})</span></label>
            <select
              value={especializacion}
              onChange={(e) => setEspecializacion(e.target.value)}
              className="w-full rounded-2xl px-4 py-3 text-sm outline-none"
              style={{ background: 'var(--sv-bg-input)', border: '1px solid var(--sv-border-light)', color: 'var(--sv-text)' }}
            >
              <option value="">{t('clans.no_specialization')}</option>
              {CUISINES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {error && (
            <div className="text-sm rounded-2xl px-4 py-3 text-center" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }}>{error}</div>
          )}

          <button onClick={submit} disabled={saving} className="sv-btn sv-btn-primary w-full py-4 text-base">
            {saving
              ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <><Shield className="w-5 h-5" /> {t('clans.create_button')}</>}
          </button>
        </div>

      </div>
    </div>
  )
}
