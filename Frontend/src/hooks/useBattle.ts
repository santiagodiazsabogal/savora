import { useCallback, useEffect, useRef, useState } from 'react'
import type { Socket } from 'socket.io-client'
import { createBattleSocket, getUserIdFromToken } from '../services/battleSocket'

export type BattleMode = 'my_ingredients' | 'chef_choice' | 'buffet' | 'teams'
export type BattleStatus = 'waiting' | 'cooking' | 'judging' | 'finished' | 'cancelled'

export interface BattlePlayer {
  userId: number
  name: string | null
  isReady: boolean
  isHost: boolean
  hasSubmittedPhoto: boolean
  // Buffet/Equipos
  team?: number | null
  courseLabel?: string | null
  recipeTitle?: string | null
  recipe?: BattleRecipe | null
}

export interface BattleRecipe {
  title: string
  description?: string | null
  ingredients: string[]
  tools: string[]
  steps: string[]
  difficulty?: string
  cookTime?: number
  tip?: string | null
}

export interface BattleRecipePreview {
  title: string
  description?: string | null
  ingredients: string[]
  tools: string[]
  difficulty?: string
  cookTime?: number
}

export interface JudgeRankingEntry {
  userId: number
  rank: number
  score: number
  comment: string
  team?: number | null
  courseLabel?: string | null
}

export interface TeamResult {
  team: number
  total: number
  avg: number
  members: number[]
}

// XP/nivel ganado por jugador al terminar el duelo (userId → resultado de awardXp).
// Las keys llegan como string porque judgeData se persiste como JSON en la DB.
export interface BattleXpResult {
  xpGained: number
  xpTotal: number
  nivel: number
  leveledUp: boolean
}

export type BattleVisibility = 'public' | 'private'

export interface BattleState {
  battleId: string
  mode: BattleMode
  status: BattleStatus
  visibility?: BattleVisibility
  joinCode?: string | null
  mealTime: string | null
  language: string
  players: BattlePlayer[]
  maxPlayers: number
  lobbyExpiresAt: string | null
  quickStartAt?: string | null
  cookingEndsAt: string | null
  timeLimitSec: number | null
  winnerUserId: number | null
  recipePreview?: BattleRecipePreview
  recipe?: BattleRecipe
  judge?: {
    ranking: JudgeRankingEntry[]
    summary: string
    teams?: TeamResult[]
    winningTeam?: number | null
    xp?: Record<string, BattleXpResult>
  } | null
}

export interface JoinOptions {
  mode: BattleMode
  mealTime?: string
  language?: string
  ingredients?: string[]
  recipeOptionId?: string
}

export function useBattle() {
  const socketRef = useRef<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const [state, setState] = useState<BattleState | null>(null)
  const [judging, setJudging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fatal, setFatal] = useState(false) // p.ej. token inválido → cerrar sesión

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  const myUserId = getUserIdFromToken(token)

  useEffect(() => {
    if (!token) {
      setFatal(true)
      return
    }
    const socket = createBattleSocket(token)
    socketRef.current = socket

    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))

    const applyState = (payload: any) => {
      if (payload?.state) setState(payload.state as BattleState)
    }

    socket.on('battle:matched', applyState)
    socket.on('battle:playerJoined', applyState)
    socket.on('battle:playerReady', applyState)
    socket.on('battle:playerLeft', applyState)
    socket.on('battle:photoSubmitted', applyState)
    socket.on('battle:assigned', applyState)
    socket.on('battle:countdown', applyState)
    socket.on('battle:state', applyState)

    socket.on('battle:start', (payload: any) => {
      setJudging(false)
      applyState(payload)
    })

    socket.on('battle:judging', () => setJudging(true))

    socket.on('battle:result', (payload: any) => {
      setJudging(false)
      applyState(payload)
    })

    socket.on('battle:cancelled', (payload: any) => {
      setState((prev) => (prev ? { ...prev, status: 'cancelled' } : prev))
      setError(payload?.reason ?? 'CANCELLED')
    })

    socket.on('battle:error', (payload: any) => {
      const msg = payload?.message ?? 'ERROR'
      setError(msg)
      if (msg === 'UNAUTHENTICATED') setFatal(true)
    })

    return () => {
      socket.removeAllListeners()
      socket.disconnect()
      socketRef.current = null
    }
  }, [token])

  const join = useCallback((opts: JoinOptions) => {
    setError(null)
    socketRef.current?.emit('battle:join', opts)
  }, [])

  // Crear una partida privada (devuelve el código en el estado)
  const createPrivate = useCallback((opts: JoinOptions) => {
    setError(null)
    socketRef.current?.emit('battle:create', opts)
  }, [])

  // Unirse a una partida privada con el código compartido
  const joinByCode = useCallback((code: string) => {
    setError(null)
    socketRef.current?.emit('battle:joinByCode', { code })
  }, [])

  // El host reparte cursos/equipos (Buffet/Equipos)
  const assignRoles = useCallback((assignments: { userId: number; team?: number | null; courseLabel?: string }[]) => {
    if (!state?.battleId) return
    socketRef.current?.emit('battle:assign', { battleId: state.battleId, assignments })
  }, [state?.battleId])

  // El host arranca la partida privada
  const startGame = useCallback(() => {
    if (!state?.battleId) return
    setError(null)
    socketRef.current?.emit('battle:start', { battleId: state.battleId })
  }, [state?.battleId])

  const ready = useCallback(() => {
    if (!state?.battleId) return
    socketRef.current?.emit('battle:ready', { battleId: state.battleId })
  }, [state?.battleId])

  const leave = useCallback(() => {
    if (state?.battleId) socketRef.current?.emit('battle:leave', { battleId: state.battleId })
    setState(null)
    setError(null)
    setJudging(false)
  }, [state?.battleId])

  const submitPhoto = useCallback(
    (photoBase64: string) => {
      if (!state?.battleId) return
      setError(null)
      socketRef.current?.emit('battle:submitPhoto', { battleId: state.battleId, photoBase64 })
    },
    [state?.battleId],
  )

  // Chat con el chef durante la cocción — respuesta por ack (privada)
  const askChef = useCallback(
    (question: string, stepContext?: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        const socket = socketRef.current
        if (!socket || !state?.battleId) return reject(new Error('not_connected'))
        socket
          .timeout(20000)
          .emit('battle:askChef', { battleId: state.battleId, question, stepContext }, (err: any, resp: any) => {
            if (err) return reject(new Error('timeout'))
            if (resp?.ok) resolve(resp.reply as string)
            else reject(new Error(resp?.error ?? 'error'))
          })
      })
    },
    [state?.battleId],
  )

  // Reinicia el estado local para volver a la pantalla de selección (sin desconectar)
  const reset = useCallback(() => {
    setState(null)
    setError(null)
    setJudging(false)
  }, [])

  return { connected, state, judging, error, fatal, myUserId, join, createPrivate, joinByCode, assignRoles, startGame, ready, leave, submitPhoto, askChef, reset }
}
