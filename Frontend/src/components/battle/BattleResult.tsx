import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Trophy, UserRound, RotateCcw, Home } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { BattleState, JudgeRankingEntry } from '../../hooks/useBattle'
import BattleXpCelebration from './BattleXpCelebration'

interface Props {
  state: BattleState
  myUserId: number | null
  onPlayAgain: () => void
}

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

export default function BattleResult({ state, myUserId, onPlayAgain }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const ranking = [...(state.judge?.ranking ?? [])].sort((a, b) => a.rank - b.rank)
  const isTeams = state.mode === 'teams'
  const teams = [...(state.judge?.teams ?? [])].sort((a, b) => b.total - a.total)
  const winningTeam = state.judge?.winningTeam ?? null
  const myTeam = state.players.find((p) => p.userId === myUserId)?.team ?? null

  // XP ganado en este duelo (llega en judgeData, keys como string por venir de JSON).
  const myXp = myUserId != null ? state.judge?.xp?.[String(myUserId)] : undefined
  const [showXpCelebration, setShowXpCelebration] = useState(!!myXp)

  const nameOf = (userId: number) => {
    if (userId === myUserId) return t('battle.you')
    return state.players.find((p) => p.userId === userId)?.name || `Chef #${userId}`
  }
  const courseName = (c?: string | null) => (c ? t(`battle.course.${c}`) : '')
  const teamName = (tm?: number | null) => t('battle.team_label', { letter: tm === 1 ? 'B' : 'A' })

  const iWon = isTeams ? (winningTeam != null && myTeam === winningTeam) : state.winnerUserId === myUserId

  // Fila de un jugador (con o sin medalla según el modo)
  const MemberRow = ({ r, showMedal }: { r: JudgeRankingEntry; showMedal: boolean }) => {
    const isMe = r.userId === myUserId
    const style: React.CSSProperties = showMedal && r.rank === 1
      ? { background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)' }
      : isMe
        ? { background: 'rgba(255,94,26,0.1)', border: '1px solid rgba(255,94,26,0.3)' }
        : { background: 'var(--sv-bg-surface)', border: '1px solid var(--sv-border-light)' }
    return (
      <div className="rounded-2xl p-3.5" style={style}>
        <div className="flex items-center gap-3">
          {showMedal && <span className="text-2xl w-8 text-center shrink-0">{MEDAL[r.rank] ?? r.rank}</span>}
          <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(255,94,26,0.15)' }}>
            <UserRound className="w-5 h-5" style={{ color: 'var(--sv-primary)' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate flex items-center gap-1.5">
              {nameOf(r.userId)}
              {r.courseLabel && <span className="text-[10px] px-1.5 py-0.5 rounded-full sv-dim" style={{ background: 'var(--sv-bg-input)' }}>{courseName(r.courseLabel)}</span>}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-lg font-black leading-none" style={{ color: 'var(--sv-primary)' }}>{r.score}</p>
            <p className="text-[10px] sv-dim uppercase tracking-wide">{t('battle.points')}</p>
          </div>
        </div>
        {/* Opinión de la IA por plato — completa, para saber aciertos y fallos */}
        {r.comment && <p className="text-xs sv-muted leading-relaxed mt-2.5">{r.comment}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-5 sv-stagger-1">
      {/* Animación de +XP / subida de nivel: se muestra primero, tapando el resultado
          hasta que el jugador la cierra, para que no se pierda entre el resto de la info. */}
      {showXpCelebration && myXp && (
        <BattleXpCelebration result={myXp} onClose={() => setShowXpCelebration(false)} />
      )}

      {/* Cabecera ganador */}
      <div className="text-center space-y-2 pt-2">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto" style={{ background: 'rgba(245,158,11,0.15)' }}>
          <Trophy className="w-8 h-8" style={{ color: 'var(--sv-warning)' }} />
        </div>
        <h1 className="text-2xl font-black">
          {iWon ? t('battle.you_won') : t('battle.battle_over')}
        </h1>
        {isTeams ? (
          winningTeam != null && (
            <p className="sv-muted">
              {t('battle.team_wins')} <span className="font-bold" style={{ color: 'var(--sv-primary)' }}>{teamName(winningTeam)}</span>
            </p>
          )
        ) : (
          state.winnerUserId != null && (
            <p className="sv-muted">
              {t('battle.winner_is')} <span className="font-bold" style={{ color: 'var(--sv-primary)' }}>{nameOf(state.winnerUserId)}</span>
            </p>
          )
        )}
        {state.judge?.summary && <p className="text-sm sv-dim italic px-4">"{state.judge.summary}"</p>}
      </div>

      {/* Resultado por equipos */}
      {isTeams ? (
        <div className="space-y-4">
          {teams.map((tm) => {
            const members = ranking.filter((r) => r.team === tm.team)
            const isWin = tm.team === winningTeam
            return (
              <div
                key={tm.team}
                className="rounded-2xl p-3 space-y-2.5"
                style={isWin
                  ? { background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)' }
                  : { background: 'var(--sv-bg-surface)', border: '1px solid var(--sv-border-light)' }}
              >
                <div className="flex items-center justify-between px-1">
                  <p className="font-bold flex items-center gap-1.5">
                    {isWin && <Trophy className="w-4 h-4" style={{ color: 'var(--sv-warning)' }} />}
                    {teamName(tm.team)}
                  </p>
                  <p className="text-sm">
                    <span className="font-black" style={{ color: 'var(--sv-primary)' }}>{tm.total}</span>{' '}
                    <span className="sv-dim text-xs uppercase tracking-wide">{t('battle.points')}</span>
                  </p>
                </div>
                {members.map((r) => <MemberRow key={r.userId} r={r} showMedal={false} />)}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="space-y-2.5">
          {ranking.map((r) => <MemberRow key={r.userId} r={r} showMedal />)}
        </div>
      )}

      {/* Acciones */}
      <div className="flex gap-3 pt-2">
        <button onClick={() => navigate('/dashboard')} className="sv-btn sv-btn-glass px-5 py-3.5">
          <Home className="w-4 h-4" /> {t('battle.home')}
        </button>
        <button onClick={onPlayAgain} className="sv-btn sv-btn-primary flex-1 py-3.5">
          <RotateCcw className="w-4 h-4" /> {t('battle.play_again')}
        </button>
      </div>
    </div>
  )
}
