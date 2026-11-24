import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft, ChevronLeft, ChevronRight, Volume2, VolumeX,
  Mic, MicOff, RotateCcw, CheckCircle2, Trophy, Lightbulb, AlertTriangle,
  Clock, Camera, X, Sparkles,
} from 'lucide-react'
import { getAiSyllabus, completeAiLesson, getCourseStepHelp } from '../services/api'
import { useSpeech } from '../hooks/useSpeech'
import { useCookAlong } from '../hooks/useCookAlong'

interface Step { numero: number; texto: string; tip?: string; alerta?: string }
interface Lesson { numero: number; titulo: string; tecnica: string; pasos: Step[] }

const TOTAL_LESSONS = 5

// Patrones de comandos de voz (español + inglés)
const RE_NEXT = /(siguiente|pr[oó]ximo|contin[uú]a|avanza|ya est[aá]|listo|termin[eé]|hecho|ya|next|continue|done|ready|forward|go on)/
const RE_PREV = /(atr[aá]s|anterior|regresa|vuelve|previo|devu[eé]lvete|back|previous|go back)/
const RE_REPEAT = /(repite|repetir|repíteme|repiteme|otra vez|de nuevo|no entend[ií]|repeat|again|say again)/

export default function LessonSteps() {
  // Anidado en la categoría: /courses/:category/:idMeal/lessons/:numero
  const { category = '', idMeal = '', numero } = useParams()
  const base = `/courses/${category}/${idMeal}`
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const num = Number(numero)

  const lang = i18n.language?.startsWith('es') ? 'es' : 'en'
  const { speak, cancelSpeak, speaking, synthSupported, startListening, stopListening, listening, recognitionSupported, lastHeard, micError, recStatus } = useSpeech(lang)

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [mealName, setMealName] = useState('')
  const [stepIdx, setStepIdx] = useState(0)
  const [autoRead, setAutoRead] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [completing, setCompleting] = useState(false)
  const [completed, setCompleted] = useState(false)

  // Copiloto proactivo (Fase 1): timers hablados derivados del texto del paso + ayuda por foto.
  const [coachOn, setCoachOn] = useState(true)
  const [helpOpen, setHelpOpen] = useState(false)
  const [helpLoading, setHelpLoading] = useState(false)
  const [helpText, setHelpText] = useState('')
  const helpInputRef = useRef<HTMLInputElement>(null)

  const steps = lesson?.pasos ?? []
  const isLastStep = stepIdx >= steps.length - 1
  const isLastLesson = num >= TOTAL_LESSONS
  const currentStep = steps[stepIdx]

  const { remaining: timerRemaining, dismiss: dismissTimer } = useCookAlong({
    stepText: currentStep?.texto,
    upcomingTexts: steps.slice(stepIdx + 1).map((s) => s.texto),
    enabled: coachOn && !completed,
    speak,
    lang,
    t,
  })

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  // Texto que se lee en voz alta: el paso + la alerta de seguridad (si la hay), para
  // cocinar manos-libres sin mirar la pantalla. El tip queda solo visual.
  const spokenText = (s?: Step) =>
    s ? (s.alerta ? `${s.texto}. ${t('coursesAi.steps.caution')}: ${s.alerta}` : s.texto) : ''

  // Carga del syllabus / lección
  useEffect(() => {
    if (!idMeal || !num) return
    let cancelled = false
    cancelSpeak()
    setLoading(true)
    setStepIdx(0)
    setCompleted(false)
    async function load() {
      try {
        const syl = await getAiSyllabus(idMeal)
        if (cancelled) return
        const found = (syl.lecciones as Lesson[]).find((l) => l.numero === num) ?? null
        setLesson(found)
        setMealName(syl.strMeal)
      } catch (err: any) {
        if (cancelled) return
        if (err.message === '401') { localStorage.removeItem('token'); navigate('/login'); return }
        setError(t('coursesAi.error_load'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [idMeal, num]) // eslint-disable-line react-hooks/exhaustive-deps

  // Lee el paso actual en voz alta al cambiar (si auto-lectura está activa)
  useEffect(() => {
    if (!currentStep || !autoRead || completed) return
    speak(spokenText(currentStep))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx, lesson, autoRead])

  // ── Navegación de pasos ───────────────────────────────────────
  const goNext = () => {
    if (completed) return
    if (isLastStep) { handleComplete(); return }
    setStepIdx((i) => Math.min(i + 1, steps.length - 1))
  }
  const goPrev = () => {
    if (stepIdx > 0) setStepIdx((i) => i - 1)
  }
  const readCurrent = () => { if (currentStep) speak(spokenText(currentStep)) }

  // Comando de voz — siempre apunta a la lógica más reciente vía ref.
  // Anti-rebote: los resultados parciales + finales pueden repetir el mismo
  // comando en milisegundos; ignoramos repeticiones dentro de una ventana corta.
  const lastCmdRef = useRef(0)
  const commandRef = useRef<(cmd: string) => void>(() => {})
  commandRef.current = (cmd: string) => {
    // Filtro de eco: los pasos leídos son frases largas; un comando real es corto.
    // Si oye más de 4 palabras, es casi seguro la propia voz de la app → se ignora.
    if (cmd.split(/\s+/).length > 4) return
    const action = RE_REPEAT.test(cmd) ? 'repeat'
      : RE_PREV.test(cmd) ? 'prev'
      : RE_NEXT.test(cmd) ? 'next'
      : null
    if (!action) return
    const now = Date.now()
    if (now - lastCmdRef.current < 1500) return
    lastCmdRef.current = now
    if (action === 'repeat') readCurrent()
    else if (action === 'prev') goPrev()
    else goNext()
  }

  const toggleHandsFree = () => {
    if (listening) stopListening()
    else startListening((cmd) => commandRef.current(cmd))
  }

  const toggleAutoRead = () => {
    if (autoRead) { cancelSpeak(); setAutoRead(false) }
    else { setAutoRead(true); readCurrent() }
  }

  // Ayuda visual por paso: el usuario manda una foto de cómo va y la IA (gpt-4o) responde
  // con contexto del PASO ACTUAL ("¿va bien?"). Reusa el tope diario de IA del backend.
  const onHelpPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // permite re-elegir la misma foto
    if (!file || !idMeal || !currentStep) return
    setHelpOpen(true)
    setHelpLoading(true)
    setHelpText('')
    cancelSpeak()
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const res = await getCourseStepHelp(idMeal, num, stepIdx + 1, currentStep.texto, base64)
      const answer = res?.feedback ?? ''
      setHelpText(answer)
      if (coachOn && answer) speak(answer)
    } catch (err: any) {
      if (err.message === '401') { localStorage.removeItem('token'); navigate('/login'); return }
      setHelpText(err.message === 'DAILY_LIMIT_REACHED'
        ? t('coursesAi.steps.help_limit')
        : t('coursesAi.steps.help_error'))
    } finally {
      setHelpLoading(false)
    }
  }

  const handleComplete = async () => {
    if (!idMeal || completing || completed) return
    setCompleting(true)
    cancelSpeak()
    try {
      await completeAiLesson(idMeal, num)
      setCompleted(true)
      stopListening()
    } catch (err: any) {
      if (err.message === '401') { localStorage.removeItem('token'); navigate('/login'); return }
      if (err.message === 'LESSON_LIMIT_REACHED') { setError(t('coursesAi.limit_lessons')); return }
      setError(t('common.error_generic'))
    } finally {
      setCompleting(false)
    }
  }

  const goAfterLesson = () => {
    cancelSpeak()
    if (isLastLesson) navigate(`${base}/result`)
    else navigate(`${base}/lessons/${num + 1}`)
  }

  if (loading) {
    return (
      <div className="sv-screen flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--sv-primary)', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (error || !lesson || steps.length === 0) {
    return (
      <div className="sv-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="sv-muted">{error || t('coursesAi.error_load')}</p>
        <button onClick={() => navigate(base)} className="sv-btn sv-btn-primary px-5 py-3">{t('common.back')}</button>
      </div>
    )
  }

  // ── Pantalla de lección completada ─────────────────────────────
  if (completed) {
    return (
      <div className="sv-screen sv-page flex flex-col items-center justify-center px-6 text-center">
        <div className="sv-orbs"><div className="sv-orb sv-orb-1" /><div className="sv-orb sv-orb-2" /></div>
        <div className="sv-content flex flex-col items-center">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4" style={{ background: 'rgba(16,185,129,0.18)' }}>
            <CheckCircle2 className="w-10 h-10" style={{ color: '#34D399' }} />
          </div>
          <h1 className="text-2xl font-black">{lesson.titulo}</h1>
          <p className="sv-muted mt-1">{t('coursesAi.syllabus.completed')} · {t('coursesAi.syllabus.lesson_of', { numero: num })}</p>
          <button onClick={goAfterLesson} className="sv-btn sv-btn-primary w-full max-w-xs py-3.5 mt-8">
            {isLastLesson
              ? <><Trophy className="w-5 h-5" /> {t('coursesAi.steps.see_result')}</>
              : <>{t('coursesAi.lesson.next_lesson')} <ChevronRight className="w-4 h-4" /></>}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="sv-screen sv-page flex flex-col h-screen">
      <div className="sv-orbs"><div className="sv-orb sv-orb-1" /><div className="sv-orb sv-orb-2" /><div className="sv-orb sv-orb-3" /></div>
      <div className="sv-content flex flex-col flex-1 min-h-0">

        {/* HEADER */}
        <div className="px-4 pt-10 pb-3" style={{ borderBottom: '1px solid var(--sv-border-light)' }}>
          <div className="flex items-center gap-2.5">
            <button onClick={() => { cancelSpeak(); stopListening(); navigate(base) }} className="sv-menu-item w-9 h-9 flex items-center justify-center rounded-xl shrink-0">
              <ArrowLeft className="w-4 h-4 sv-muted" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm leading-tight truncate">{lesson.titulo}</p>
              <p className="text-[11px] sv-dim">{mealName} · {t('coursesAi.syllabus.lesson_of', { numero: num })}</p>
            </div>
            {/* Controles de voz */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Copiloto proactivo: avisos hablados de tiempos + look-ahead */}
              <button onClick={() => setCoachOn((v) => !v)} className="w-9 h-9 flex items-center justify-center rounded-xl transition active:scale-95" style={coachOn ? { background: 'rgba(255,94,26,0.15)', color: 'var(--sv-primary)', border: '1px solid rgba(255,94,26,0.3)' } : { background: 'var(--sv-bg-surface)', color: 'var(--sv-text-muted)', border: '1px solid var(--sv-border-light)' }} title={t('coursesAi.steps.coach')}>
                <Sparkles className="w-4 h-4" />
              </button>
              {/* Ayuda visual: foto de cómo va → feedback del paso */}
              <button onClick={() => helpInputRef.current?.click()} className="w-9 h-9 flex items-center justify-center rounded-xl transition active:scale-95" style={{ background: 'var(--sv-bg-surface)', color: 'var(--sv-text-muted)', border: '1px solid var(--sv-border-light)' }} title={t('coursesAi.steps.photo_help')}>
                <Camera className="w-4 h-4" />
              </button>
              {synthSupported && (
                <button onClick={toggleAutoRead} className="w-9 h-9 flex items-center justify-center rounded-xl transition active:scale-95" style={autoRead ? { background: 'rgba(255,94,26,0.15)', color: 'var(--sv-primary)', border: '1px solid rgba(255,94,26,0.3)' } : { background: 'var(--sv-bg-surface)', color: 'var(--sv-text-muted)', border: '1px solid var(--sv-border-light)' }} title={t('coursesAi.steps.autoread')}>
                  {autoRead ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>
              )}
              {recognitionSupported && (
                <button onClick={toggleHandsFree} className="w-9 h-9 flex items-center justify-center rounded-xl transition active:scale-95" style={listening ? { background: 'rgba(16,185,129,0.18)', color: '#34D399', border: '1px solid rgba(16,185,129,0.4)' } : { background: 'var(--sv-bg-surface)', color: 'var(--sv-text-muted)', border: '1px solid var(--sv-border-light)' }} title={t('coursesAi.steps.handsfree')}>
                  {listening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                </button>
              )}
            </div>
          </div>

          {/* Barra de pasos */}
          <div className="flex gap-1 mt-3">
            {steps.map((_, i) => (
              <div key={i} className="flex-1 h-1.5 rounded-full transition-colors" style={{ background: i < stepIdx ? '#34D399' : i === stepIdx ? 'var(--sv-primary)' : 'var(--sv-border-light)' }} />
            ))}
          </div>
        </div>

        {/* PASO ACTUAL */}
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-6 py-6 overflow-y-auto">
          <div className="text-center w-full">
            <span className="sv-badge sv-badge-primary mb-5" style={{ textTransform: 'none', letterSpacing: 0 }}>
              {t('coursesAi.steps.step_of', { current: stepIdx + 1, total: steps.length })}
            </span>

            {/* Countdown proactivo: el copiloto vigila el tiempo del paso */}
            {coachOn && timerRemaining !== null && (
              <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5" style={timerRemaining <= 10 ? { background: 'rgba(245,158,11,0.16)', border: '1px solid rgba(245,158,11,0.45)' } : { background: 'rgba(255,94,26,0.10)', border: '1px solid rgba(255,94,26,0.28)' }}>
                <Clock className="w-4 h-4" style={{ color: timerRemaining <= 10 ? 'var(--sv-warning)' : 'var(--sv-primary)' }} />
                <span className="text-sm font-bold tabular-nums" style={{ color: timerRemaining <= 10 ? 'var(--sv-warning)' : 'var(--sv-primary)' }}>{fmtTime(timerRemaining)}</span>
                <span className="text-[11px] sv-dim">{t('coursesAi.steps.coach_watching')}</span>
                <button onClick={dismissTimer} className="ml-0.5" title={t('common.cancel')}><X className="w-3.5 h-3.5 sv-dim" /></button>
              </div>
            )}

            <div className="relative my-5">
              {/* Número grande de fondo */}
              <span className="block text-[120px] leading-none font-black select-none" style={{ color: 'rgba(255,94,26,0.10)' }}>{stepIdx + 1}</span>
              <p className="absolute inset-0 flex items-center justify-center px-2 text-2xl font-bold leading-snug">
                {currentStep.texto}
              </p>
            </div>

            {/* Tip del paso (siempre) */}
            {currentStep.tip && (
              <div className="mx-auto max-w-md text-left rounded-2xl px-4 py-3 flex items-start gap-2.5 mb-3" style={{ background: 'rgba(255,94,26,0.10)', border: '1px solid rgba(255,94,26,0.28)' }}>
                <Lightbulb className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--sv-primary)' }} />
                <p className="text-sm leading-snug"><span className="font-bold" style={{ color: 'var(--sv-primary)' }}>{t('coursesAi.steps.tip')}: </span>{currentStep.tip}</p>
              </div>
            )}

            {/* Alerta de seguridad (solo si el paso tiene riesgo) */}
            {currentStep.alerta && (
              <div className="mx-auto max-w-md text-left rounded-2xl px-4 py-3 flex items-start gap-2.5" style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.4)' }}>
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--sv-warning)' }} />
                <p className="text-sm leading-snug"><span className="font-bold" style={{ color: 'var(--sv-warning)' }}>{t('coursesAi.steps.caution')}: </span>{currentStep.alerta}</p>
              </div>
            )}

            {/* Estado de voz: escuchando + lo último que entendió el micrófono */}
            {listening && (
              <div className="mt-3 flex flex-col items-center gap-1.5">
                <p className="inline-flex items-center gap-2 text-xs font-semibold" style={{ color: '#34D399' }}>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: '#34D399' }} />
                    <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: '#34D399' }} />
                  </span>
                  {t('coursesAi.steps.listening')}
                </p>
                {lastHeard && <p className="text-[11px] sv-dim italic">“{lastHeard}”</p>}
                {recStatus && <p className="text-[10px] sv-dim">mic: {recStatus}</p>}
              </div>
            )}

            {micError && (
              <p className="text-[11px] mt-3" style={{ color: '#FCA5A5' }}>{t('coursesAi.steps.mic_error')}</p>
            )}
          </div>
        </div>

        {error && (
          <div className="px-5 pb-2">
            <div className="text-sm rounded-2xl px-4 py-3 text-center" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }}>{error}</div>
          </div>
        )}

        {/* CONTROLES INFERIORES */}
        <div className="px-5 pb-8 pt-2">
          <div className="flex items-center gap-3">
            <button onClick={goPrev} disabled={stepIdx === 0} className="sv-btn sv-btn-glass w-12 h-12 shrink-0 disabled:opacity-30" title={t('coursesAi.steps.prev')}>
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button onClick={readCurrent} className="sv-btn sv-btn-glass w-12 h-12 shrink-0" title={t('coursesAi.steps.repeat')}>
              <RotateCcw className={`w-4 h-4 ${speaking ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={goNext} disabled={completing} className="sv-btn sv-btn-primary flex-1 py-3.5 text-base">
              {completing
                ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : isLastStep
                  ? <><CheckCircle2 className="w-5 h-5" /> {t('coursesAi.lesson.complete')}</>
                  : <>{t('coursesAi.steps.next')} <ChevronRight className="w-5 h-5" /></>}
            </button>
          </div>
          {recognitionSupported && listening && (
            <p className="text-[11px] sv-dim text-center mt-2.5">{t('coursesAi.steps.voice_hint')}</p>
          )}
        </div>

      </div>

      {/* Input oculto para la foto de ayuda (cámara en móvil) */}
      <input ref={helpInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onHelpPhoto} />

      {/* Sheet de ayuda visual: respuesta de la IA sobre cómo va el paso */}
      {helpOpen && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => { if (!helpLoading) setHelpOpen(false) }} />
          <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl px-6 pt-5 pb-9 sv-glass" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,94,26,0.15)' }}>
                <Sparkles className="w-4 h-4" style={{ color: 'var(--sv-primary)' }} />
              </div>
              <p className="font-bold text-sm flex-1">{t('coursesAi.steps.photo_help')}</p>
              <button onClick={() => { if (!helpLoading) setHelpOpen(false) }} className="w-8 h-8 flex items-center justify-center rounded-xl" style={{ background: 'var(--sv-bg-surface)' }}><X className="w-4 h-4 sv-muted" /></button>
            </div>
            {helpLoading ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--sv-primary)', borderTopColor: 'transparent' }} />
                <p className="text-sm sv-dim">{t('coursesAi.steps.help_analyzing')}</p>
              </div>
            ) : (
              <p className="text-sm leading-relaxed whitespace-pre-line">{helpText}</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
