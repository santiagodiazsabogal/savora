import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock, Globe, ArrowLeft, Plus, LogIn, Loader2, Swords } from 'lucide-react'
import type { JoinOptions } from '../../hooks/useBattle'
import BattleSelect from './BattleSelect'

type View = 'home' | 'public' | 'private' | 'create' | 'join'

interface Props {
  onJoinPublic: (opts: JoinOptions) => void
  onCreatePrivate: (opts: JoinOptions) => void
  onJoinByCode: (code: string) => void
  joining: boolean
  initialIngredients?: string[]
  mealType?: string | null
  initialCode?: string | null
  onBackToDashboard: () => void
}

export default function BattleEntry({
  onJoinPublic, onCreatePrivate, onJoinByCode, joining,
  initialIngredients = [], mealType, initialCode, onBackToDashboard,
}: Props) {
  const { t } = useTranslation()
  // Deep link con ?code= abre directo "Unirse"; ingredientes del fridge abren el match público
  const [view, setView] = useState<View>(
    initialCode ? 'join' : initialIngredients.length >= 2 ? 'public' : 'home',
  )
  const [code, setCode] = useState((initialCode ?? '').toUpperCase())

  // Cabecera reutilizable (función, no componente, para no remontar inputs)
  const header = (title: string, onBack: () => void, subtitle?: string) => (
    <div className="flex items-center gap-3 sv-stagger-1">
      <button onClick={onBack} className="sv-btn sv-btn-glass shrink-0" style={{ width: 36, height: 36, borderRadius: '50%', padding: 0 }}>
        <ArrowLeft className="w-4 h-4" />
      </button>
      <div>
        <h1 className="text-2xl font-black">{title}</h1>
        {subtitle && <p className="sv-muted text-sm">{subtitle}</p>}
      </div>
    </div>
  )

  // ── Match público (flujo actual de emparejamiento rápido) ──
  if (view === 'public') {
    return (
      <BattleSelect
        intent="public"
        onSubmit={onJoinPublic}
        joining={joining}
        initialIngredients={initialIngredients}
        mealType={mealType}
        onBack={() => setView('home')}
      />
    )
  }

  // ── Crear partida privada (mismo selector de modo, pero crea la sala) ──
  if (view === 'create') {
    return (
      <BattleSelect
        intent="private"
        onSubmit={onCreatePrivate}
        joining={joining}
        initialIngredients={initialIngredients}
        mealType={mealType}
        onBack={() => setView('private')}
      />
    )
  }

  // ── Unirse con código ──
  if (view === 'join') {
    const canJoin = code.trim().length >= 4
    return (
      <div className="space-y-5">
        {header(t('battle.join_title'), () => setView('private'), t('battle.join_subtitle'))}

        <div className="space-y-3 sv-stagger-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
            onKeyDown={(e) => { if (e.key === 'Enter' && canJoin && !joining) onJoinByCode(code.trim()) }}
            placeholder={t('battle.code_placeholder')}
            className="sv-input text-center"
            style={{ paddingLeft: 16, letterSpacing: '0.35em', fontWeight: 800, fontSize: 22 }}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
          <button
            onClick={() => onJoinByCode(code.trim())}
            disabled={!canJoin || joining}
            className="sv-btn sv-btn-primary w-full py-3.5"
          >
            {joining ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
            {t('battle.join_action')}
          </button>
        </div>
      </div>
    )
  }

  // ── Menú de partida privada: crear vs unirse ──
  if (view === 'private') {
    return (
      <div className="space-y-5">
        {header(t('battle.private_title'), () => setView('home'), t('battle.private_subtitle'))}

        <div className="space-y-4">
          <button onClick={() => setView('create')} disabled={joining} className="sv-glass sv-glass-hover sv-stagger-2 w-full p-6 text-left">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,94,26,0.15)' }}>
                <Plus className="w-7 h-7" style={{ color: 'var(--sv-primary)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xl font-bold">{t('battle.create_title')}</p>
                <p className="sv-muted text-sm mt-0.5">{t('battle.create_subtitle')}</p>
              </div>
            </div>
          </button>

          <button onClick={() => setView('join')} disabled={joining} className="sv-glass sv-glass-hover sv-stagger-3 w-full p-6 text-left">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(139,92,246,0.18)' }}>
                <LogIn className="w-7 h-7" style={{ color: 'var(--sv-clan-accent)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xl font-bold">{t('battle.join_card_title')}</p>
                <p className="sv-muted text-sm mt-0.5">{t('battle.join_card_subtitle')}</p>
              </div>
            </div>
          </button>
        </div>
      </div>
    )
  }

  // ── Home: privada vs pública ──
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 sv-stagger-1">
        <button onClick={onBackToDashboard} className="sv-btn sv-btn-glass shrink-0" style={{ width: 36, height: 36, borderRadius: '50%', padding: 0 }}>
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-2xl font-black">{t('battle.title')}</h1>
          <p className="sv-muted text-sm">{t('battle.subtitle')}</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Partida privada */}
        <button onClick={() => setView('private')} disabled={joining} className="sv-glass sv-glass-hover sv-stagger-2 w-full p-6 text-left">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,94,26,0.15)' }}>
              <Lock className="w-7 h-7" style={{ color: 'var(--sv-primary)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xl font-bold">{t('battle.entry_private_title')}</p>
              <p className="sv-muted text-sm mt-0.5">{t('battle.entry_private_subtitle')}</p>
            </div>
          </div>
        </button>

        {/* Partida pública */}
        <button onClick={() => setView('public')} disabled={joining} className="sv-btn sv-btn-primary sv-stagger-3 w-full p-6" style={{ borderRadius: 'var(--sv-radius-md)' }}>
          <div className="flex items-center gap-4 w-full">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.2)' }}>
              <Globe className="w-7 h-7" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-xl font-bold">{t('battle.entry_public_title')}</p>
              <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.85)' }}>{t('battle.entry_public_subtitle')}</p>
            </div>
          </div>
        </button>
      </div>

      <p className="text-center text-xs sv-dim pt-2"><Swords className="w-3.5 h-3.5 inline mr-1" />{t('battle.players_hint')}</p>
    </div>
  )
}
