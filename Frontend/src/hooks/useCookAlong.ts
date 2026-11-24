import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Copiloto PROACTIVO del Modo Cocina (Fase 1 — cero backend, cero costo).
 *
 * La IA "cocina contigo": no espera preguntas, avisa sola.
 *   - "Ya casi se cumple el tiempo, revisa cómo va."   (timer del paso)
 *   - "Buen momento para precalentar el horno a 180°."  (look-ahead a pasos futuros)
 *
 * De dónde salen los avisos: NO tocamos el backend ni el schema del syllabus (cambiar el
 * formato forzaría regenerar TODOS los cursos cacheados = gasto masivo de IA). En su lugar se
 * DERIVAN del propio texto del paso, que ya trae tiempos/temperaturas concretas porque el
 * prompt de generación pide "cantidades, tiempos y temperaturas concretas". Así funciona en
 * TODOS los cursos existentes hoy, sin llamadas nuevas.
 *
 * Depende solo de `speak()` (el TTS que ya usa useSpeech) → suena aunque no haya voz en vivo.
 * En Fase 2 (Gemini Live) la conversación en tiempo real convive con esto; este copiloto es la
 * base robusta always-on.
 */

export type CookCue = 'boil' | 'simmer' | 'bake' | 'fry' | 'rest' | 'chill' | 'generic'

interface UseCookAlongArgs {
  /** Texto del paso actual (la fuente de los tiempos). */
  stepText?: string
  /** Textos de los pasos SIGUIENTES de la lección (para el look-ahead de precalentar). */
  upcomingTexts?: string[]
  /** Copiloto activo (toggle del usuario). */
  enabled: boolean
  /** Habla un texto (el mismo speak de useSpeech). */
  speak: (text: string) => void
  /** Idioma para los mensajes hablados. */
  lang: 'es' | 'en'
  /** Traductor i18n para los textos de los avisos. */
  t: (key: string, opts?: any) => string
}

// ── Parseo de duración desde el texto del paso ─────────────────────────────
// Requiere SIEMPRE una unidad de tiempo tras el número → "180°C" o "2 tomatoes" NO matchean.
const TIME_RE =
  /(\d+(?:\.\d+)?)\s*(?:[-–—]|to|a)?\s*(?:\d+(?:\.\d+)?)?\s*(hours?|hrs?|hr|minutes?|mins?|min|seconds?|secs?|sec|horas?|hora|minutos?|minuto|segundos?|segundo|seg)\b/gi

function unitToSeconds(n: number, unit: string): number {
  const u = unit.toLowerCase()
  if (u.startsWith('h')) return n * 3600
  if (u.startsWith('s')) return n // sec/seg
  return n * 60 // min por defecto
}

/** Devuelve la MAYOR duración mencionada en el texto (la espera dominante), en segundos. */
function parseDurationSeconds(text: string): number {
  let max = 0
  for (const m of text.matchAll(TIME_RE)) {
    const n = parseFloat(m[1])
    if (!isFinite(n)) continue
    const secs = unitToSeconds(n, m[2])
    if (secs > max) max = secs
  }
  return max
}

/** Clasifica el paso para dar un aviso con copy adecuado. */
function detectCue(text: string): CookCue {
  const s = text.toLowerCase()
  if (/\bboil|hierv|hervir\b/.test(s)) return 'boil'
  if (/simmer|fuego lento|a fuego bajo|reduce|reducir/.test(s)) return 'simmer'
  if (/bake|oven|hornea|horno|roast|asar al horno/.test(s)) return 'bake'
  if (/fry|sauté|saute|sear|sofr|fre[íi]r|dora/.test(s)) return 'fry'
  if (/rest|reposa|reposar|marinate|marina|marinar|proof|leuda|levar/.test(s)) return 'rest'
  if (/chill|refriger|nevera|fridge|enfr[íi]a|congela/.test(s)) return 'chill'
  return 'generic'
}

// ── Look-ahead: ¿algún paso futuro necesita el horno precalentado? ──────────
function upcomingNeedsOven(upcoming: string[]): { temp?: string } | null {
  for (const txt of upcoming) {
    const s = txt.toLowerCase()
    if (/oven|bake|roast|horno|hornea|asar al horno/.test(s)) {
      const temp = txt.match(/(\d{2,3})\s*°?\s*(?:c|f|celsius|fahrenheit|grados)?/i)?.[0]?.trim()
      return { temp }
    }
  }
  return null
}

export function useCookAlong({ stepText, upcomingTexts, enabled, speak, lang, t }: UseCookAlongArgs) {
  const [remaining, setRemaining] = useState<number | null>(null) // segundos restantes (o null si no hay timer)
  const [cue, setCue] = useState<CookCue>('generic')
  const [dismissed, setDismissed] = useState(false)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const preheatDoneRef = useRef(false) // el aviso de precalentar se da una sola vez por lección

  const clearAll = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    timeoutsRef.current.forEach(clearTimeout)
    timeoutsRef.current = []
  }, [])

  const dismiss = useCallback(() => {
    clearAll()
    setRemaining(null)
    setDismissed(true)
  }, [clearAll])

  // ── Arma el timer + los avisos hablados cada vez que cambia el paso ─────────
  useEffect(() => {
    clearAll()
    setRemaining(null)
    setDismissed(false)
    if (!enabled || !stepText) return

    const duration = parseDurationSeconds(stepText)
    const stepCue = detectCue(stepText)
    setCue(stepCue)

    // Look-ahead: si un paso FUTURO usa el horno y aún no avisamos, sugiere precalentar ya.
    if (!preheatDoneRef.current && upcomingTexts?.length) {
      const oven = upcomingNeedsOven(upcomingTexts)
      // Solo si el paso ACTUAL no es ya el del horno (para no ser redundante).
      if (oven && !/oven|bake|roast|horno|hornea/i.test(stepText)) {
        preheatDoneRef.current = true
        const msg = oven.temp
          ? t('coursesAi.steps.coach_preheat_temp', { temp: oven.temp })
          : t('coursesAi.steps.coach_preheat')
        timeoutsRef.current.push(setTimeout(() => speak(msg), 6000))
      }
    }

    // Sin una duración real (≥ 60s) no armamos countdown: evita ruido en pasos de picar/sazonar.
    if (duration < 60) return

    const startedAt = Date.now()
    setRemaining(duration)

    intervalRef.current = setInterval(() => {
      const left = Math.max(0, duration - Math.round((Date.now() - startedAt) / 1000))
      setRemaining(left)
      if (left <= 0 && intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    }, 1000)

    // Aviso intermedio (solo para esperas largas ≥ 5 min): un chequeo suave a mitad.
    if (duration >= 300) {
      timeoutsRef.current.push(setTimeout(
        () => speak(t('coursesAi.steps.coach_halfway')),
        (duration / 2) * 1000,
      ))
    }

    // Aviso final: al cumplirse el tiempo, con copy según el tipo de cocción.
    const endKey = `coursesAi.steps.coach_end_${stepCue}`
    timeoutsRef.current.push(setTimeout(() => {
      // Fallback a genérico si la clave específica no existe.
      const msg = t(endKey, { defaultValue: t('coursesAi.steps.coach_end_generic') })
      speak(msg)
    }, duration * 1000))

    return clearAll
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepText, enabled])

  // Reinicia el flag de precalentar al cambiar de lección (cambia el set de upcoming).
  useEffect(() => { preheatDoneRef.current = false }, [upcomingTexts?.length])

  useEffect(() => () => clearAll(), [clearAll])

  return { remaining, cue, dismissed, dismiss }
}
