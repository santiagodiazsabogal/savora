import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Loader2, ChefHat, Swords, ChevronLeft } from 'lucide-react'
import { useBattle } from '../hooks/useBattle'
import BattleEntry from '../components/battle/BattleEntry'
import BattleLobby from '../components/battle/BattleLobby'
import BattleCook from '../components/battle/BattleCook'
import BattleResult from '../components/battle/BattleResult'
import BattleStartCountdown from '../components/battle/BattleStartCountdown'

// Shell oscuro reutilizable para todas las vistas del duelo
function Shell({ children, onBack }: { children: React.ReactNode; onBack?: () => void }) {
  return (
    <div className="sv-screen sv-page" style={{ overflowY: 'auto' }}>
      <div className="sv-orbs"><div className="sv-orb sv-orb-1" /><div className="sv-orb sv-orb-2" /><div className="sv-orb sv-orb-3" /></div>
      <div className="sv-content" style={{ maxWidth: 480, margin: '0 auto', padding: '24px 20px 60px' }}>
        {onBack && (
          <button
            onClick={onBack}
            className="sv-btn sv-btn-glass"
            style={{ width: 40, height: 40, borderRadius: '50%', padding: 0, marginBottom: 20 }}
          >
            <ChevronLeft width={20} />
          </button>
        )}
        {children}
      </div>
    </div>
  )
}

// Traduce los códigos de error del socket a un mensaje legible
function errorLabel(code: string, t: (k: string) => string): string {
  switch (code) {
    case 'LIMIT_REACHED': return t('recipes.limit_reached')
    case 'ROOM_NOT_FOUND': return t('battle.err_room_not_found')
    case 'ROOM_FULL': return t('battle.err_room_full')
    case 'ALREADY_STARTED': return t('battle.err_already_started')
    case 'NOT_ENOUGH_PLAYERS': return t('battle.err_not_enough_players')
    case 'PRO_ONLY': return t('battle.err_pro_only')
    default: return t('battle.error_generic')
  }
}

export default function Battle() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()

  const { connected, state, judging, error, fatal, myUserId, join, createPrivate, joinByCode, assignRoles, startGame, ready, leave, submitPhoto, askChef, reset } = useBattle()

  // Estado local de "buscando partida" entre el emit y la primera respuesta del server
  const [joining, setJoining] = useState(false)
  useEffect(() => { if (state || error) setJoining(false) }, [state, error])

  // Cuenta atrás de inicio (3·2·1·Ready·Go) SOLO en la transición real lobby→cocinar.
  // Si entras y el primer estado ya es 'cooking' (refresco a mitad de partida) no se reproduce.
  const [showStartCountdown, setShowStartCountdown] = useState(false)
  const prevStatus = useRef<string | null>(null)
  const countdownShownFor = useRef<string | null>(null)
  useEffect(() => {
    const s = state?.status ?? null
    if (s === 'cooking' && prevStatus.current === 'waiting' && state && countdownShownFor.current !== state.battleId) {
      countdownShownFor.current = state.battleId
      setShowStartCountdown(true)
    }
    prevStatus.current = s
  }, [state?.status, state?.battleId])

  const handleJoin: typeof join = (opts) => { setJoining(true); join(opts) }
  const handleCreatePrivate: typeof createPrivate = (opts) => { setJoining(true); createPrivate(opts) }
  const handleJoinByCode = (code: string) => { setJoining(true); joinByCode(code) }

  // Ingredientes/mealType opcionales que pueden venir del FridgeAnalyzer
  const initialIngredients: string[] = location.state?.ingredients ?? []
  const mealType: string | null = location.state?.mealType ?? null
  // Deep link de invitación: /battle?code=XXXX abre directo la pantalla de "Unirse"
  const initialCode: string | null = new URLSearchParams(location.search).get('code')

  // Token inválido → cerrar sesión
  useEffect(() => {
    if (fatal) {
      localStorage.removeItem('token')
      navigate('/login')
    }
  }, [fatal, navigate])

  // ── Conectando ──
  if (!connected && !state) {
    return (
      <Shell onBack={() => navigate('/dashboard')}>
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--sv-primary)' }} />
          <p className="sv-muted">{t('battle.connecting')}</p>
        </div>
      </Shell>
    )
  }

  // ── Juzgando (la IA evalúa los platos) ──
  if (judging) {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center animate-pulse" style={{ background: 'rgba(139,92,246,0.18)' }}>
            <ChefHat className="w-8 h-8" style={{ color: 'var(--sv-clan-accent)' }} />
          </div>
          <div>
            <p className="font-bold text-lg sv-text-gradient-ai">{t('battle.judging_title')}</p>
            <p className="sv-muted text-sm mt-1">{t('battle.judging_subtitle')}</p>
          </div>
        </div>
      </Shell>
    )
  }

  // ── Cancelada ──
  if (state?.status === 'cancelled') {
    return (
      <Shell onBack={() => navigate('/dashboard')}>
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <Swords className="w-12 h-12 sv-dim" />
          <div>
            <p className="font-bold text-lg">{t('battle.cancelled_title')}</p>
            <p className="sv-muted text-sm mt-1">
              {error === 'NOT_ENOUGH_READY_PLAYERS' ? t('battle.cancelled_not_enough') : t('battle.cancelled_generic')}
            </p>
          </div>
          <button onClick={reset} className="sv-btn sv-btn-primary px-6 py-3">
            {t('battle.try_again')}
          </button>
        </div>
      </Shell>
    )
  }

  // ── Vistas por estado (BattleEntry gestiona su propio botón de volver) ──
  return (
    <Shell>
      {error && (
        <div className="mb-4 rounded-xl px-4 py-3 text-sm text-center" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }}>
          {errorLabel(error, t)}
        </div>
      )}

      {!state && (
        <BattleEntry
          onJoinPublic={handleJoin}
          onCreatePrivate={handleCreatePrivate}
          onJoinByCode={handleJoinByCode}
          joining={joining}
          initialIngredients={initialIngredients}
          mealType={mealType}
          initialCode={initialCode}
          onBackToDashboard={() => navigate('/dashboard')}
        />
      )}

      {state?.status === 'waiting' && (
        <BattleLobby state={state} myUserId={myUserId} onReady={ready} onStart={startGame} onLeave={leave} onAssign={assignRoles} />
      )}

      {state?.status === 'cooking' && (
        <BattleCook state={state} myUserId={myUserId} onSubmitPhoto={submitPhoto} onAskChef={askChef} />
      )}

      {state?.status === 'finished' && (
        <BattleResult state={state} myUserId={myUserId} onPlayAgain={reset} />
      )}

      {/* Cuenta atrás de inicio (se porta a body; aparece sobre la pantalla de cocción) */}
      {showStartCountdown && (
        <BattleStartCountdown onDone={() => setShowStartCountdown(false)} />
      )}
    </Shell>
  )
}
