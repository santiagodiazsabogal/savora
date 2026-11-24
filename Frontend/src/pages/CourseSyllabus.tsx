import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft, CheckCircle2, Lock, ChevronRight, Sparkles, Trophy, Star, ChefHat,
} from 'lucide-react'
import { getAiSyllabus, getAiCourseProgress, getMyAiCourses } from '../services/api'

interface Lesson {
  numero: number
  titulo: string
  descripcion: string
  tecnica: string
  pasos?: { numero: number; texto: string }[]
}
interface Syllabus {
  idMeal: string
  strMeal: string
  strArea: string
  strCategory: string
  thumbnailUrl: string
  nivelMinimo: number
  lecciones: Lesson[]
}

export default function CourseSyllabus() {
  // Anidado en la categoría: /courses/:category/:idMeal
  const { category = '', idMeal = '' } = useParams()
  const base = `/courses/${category}/${idMeal}`
  const backTo = `/courses/${category}`
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [syllabus, setSyllabus] = useState<Syllabus | null>(null)
  const [doneNums, setDoneNums] = useState<Set<number>>(new Set())
  const [proximaLeccion, setProximaLeccion] = useState<number | null>(1)
  const [courseCompleted, setCourseCompleted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    if (!idMeal) return
    try {
      const [syl, prog, mine] = await Promise.all([
        getAiSyllabus(idMeal),
        getAiCourseProgress(idMeal),
        getMyAiCourses().catch(() => []),
      ])
      setSyllabus(syl)
      setDoneNums(new Set<number>(prog.leccionesIds ?? []))
      setProximaLeccion(prog.proximaLeccion ?? null)
      setCourseCompleted((mine ?? []).some((c: any) => c.idMeal === idMeal))
    } catch (err) {
      if (err instanceof Error && err.message === '401') {
        localStorage.removeItem('token'); navigate('/login'); return
      }
      setError(t('coursesAi.error_load'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [idMeal]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="sv-screen flex flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="sv-orbs"><div className="sv-orb sv-orb-1" /><div className="sv-orb sv-orb-2" /></div>
        <div className="relative">
          <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,94,26,0.15)' }}>
            <Sparkles className="w-8 h-8 animate-pulse" style={{ color: 'var(--sv-primary)' }} />
          </div>
        </div>
        <div>
          <p className="font-bold text-lg">{t('coursesAi.syllabus.preparing')}</p>
          <p className="sv-muted text-sm mt-1">{t('coursesAi.syllabus.preparing_sub')}</p>
        </div>
      </div>
    )
  }

  if (error || !syllabus) {
    return (
      <div className="sv-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="sv-muted">{error || t('coursesAi.error_load')}</p>
        <button onClick={() => navigate(backTo)} className="sv-btn sv-btn-primary px-5 py-3">{t('common.back')}</button>
      </div>
    )
  }

  const total = syllabus.lecciones.length
  const done = doneNums.size
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const allDone = done >= total
  const xpReward = syllabus.nivelMinimo * 10

  return (
    <div className="sv-screen sv-page flex flex-col">
      <div className="sv-orbs"><div className="sv-orb sv-orb-1" /><div className="sv-orb sv-orb-2" /><div className="sv-orb sv-orb-3" /></div>
      <div className="sv-content flex flex-col flex-1">

        {/* HERO con imagen */}
        <div className="relative">
          <div className="h-52 overflow-hidden">
            {syllabus.thumbnailUrl ? (
              <img src={syllabus.thumbnailUrl} alt={syllabus.strMeal} className="w-full h-full object-cover" />
            ) : (
              /* Módulos de técnica (sin foto): banner de color + icono en vez de imagen rota */
              <div className="w-full h-full flex items-center justify-center" style={{ background: 'radial-gradient(circle at 50% 35%, rgba(255,94,26,0.28), transparent 70%), var(--sv-bg-elevated)' }}>
                <ChefHat className="w-20 h-20" style={{ color: 'var(--sv-primary)', opacity: 0.6 }} strokeWidth={1.6} />
              </div>
            )}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, var(--sv-bg-base) 5%, rgba(7,5,10,0.3) 60%, rgba(7,5,10,0.5))' }} />
          </div>
          <button
            onClick={() => navigate(backTo)}
            className="absolute top-12 left-4 w-10 h-10 flex items-center justify-center rounded-2xl transition active:scale-95"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', border: '1px solid var(--sv-border-light)' }}
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div className="absolute bottom-3 left-5 right-5">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="sv-badge sv-badge-primary" style={{ textTransform: 'none', letterSpacing: 0 }}>{syllabus.strCategory}</span>
              <span className="sv-badge sv-badge-glass" style={{ textTransform: 'none', letterSpacing: 0 }}>{syllabus.strArea}</span>
            </div>
            <h1 className="text-2xl font-black leading-tight">{syllabus.strMeal}</h1>
          </div>
        </div>

        {/* Progreso */}
        <div className="px-5 pt-4 sv-stagger-1">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-sm font-bold sv-muted">{t('coursesAi.syllabus.progress', { done, total })}</p>
            <span className="sv-badge sv-badge-gold" style={{ textTransform: 'none', letterSpacing: 0 }}>
              <Star className="w-3 h-3" /> +{xpReward} XP
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--sv-border-light)' }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #FF8B54, var(--sv-primary))' }} />
          </div>
        </div>

        {/* LECCIONES */}
        <div className="px-5 pt-5 pb-4 sv-stagger-2">
          <h2 className="text-sm font-bold sv-dim uppercase tracking-wider mb-3 px-1">{t('coursesAi.syllabus.lessons_title')}</h2>
          <div className="space-y-3">
            {syllabus.lecciones.map((lesson) => {
              const isDone = doneNums.has(lesson.numero)
              const isLocked = !isDone && proximaLeccion != null && lesson.numero > proximaLeccion
              const clickable = !isLocked
              const numPasos = lesson.pasos?.length ?? 0
              return (
                <button
                  key={lesson.numero}
                  onClick={() => clickable && navigate(`${base}/lessons/${lesson.numero}`)}
                  disabled={!clickable}
                  className={`sv-glass ${clickable ? 'sv-glass-hover' : 'opacity-60'} p-4 text-left w-full`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                      style={isDone
                        ? { background: 'rgba(16,185,129,0.18)', color: '#34D399' }
                        : isLocked
                          ? { background: 'var(--sv-bg-input)', color: 'var(--sv-text-dim)' }
                          : { background: 'rgba(255,94,26,0.15)', color: 'var(--sv-primary)' }}
                    >
                      {isDone ? <CheckCircle2 className="w-5 h-5" /> : isLocked ? <Lock className="w-4 h-4" /> : lesson.numero}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-bold text-base leading-tight ${isDone ? 'opacity-70' : ''}`}>{lesson.titulo}</p>
                      <p className="text-sm sv-muted mt-1 leading-snug">{lesson.descripcion}</p>
                      <div className="flex items-center justify-between mt-2 gap-2">
                        <span className="sv-badge sv-badge-glass" style={{ textTransform: 'none', letterSpacing: 0, padding: '2px 8px', fontSize: 10 }}>
                          {numPasos > 0 ? t('coursesAi.steps.steps_count', { count: numPasos }) : lesson.tecnica}
                        </span>
                        {clickable && (
                          <span className="inline-flex items-center gap-1 text-xs font-bold shrink-0" style={{ color: 'var(--sv-primary)' }}>
                            {isDone ? t('coursesAi.syllabus.review_lesson') : lesson.numero === proximaLeccion && done > 0 ? t('coursesAi.syllabus.continue_lesson') : t('coursesAi.syllabus.start_lesson')}
                            <ChevronRight className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* COMPLETAR CURSO */}
        <div className="px-5 pb-12 sv-stagger-3">
          {courseCompleted ? (
            <div className="sv-glass p-4 flex items-center gap-3" style={{ borderColor: 'rgba(16,185,129,0.4)' }}>
              <Trophy className="w-6 h-6 shrink-0" style={{ color: '#34D399' }} />
              <div>
                <p className="font-bold text-sm">{t('coursesAi.syllabus.course_done')}</p>
                <p className="text-xs sv-dim">+{xpReward} XP</p>
              </div>
            </div>
          ) : allDone ? (
            <button onClick={() => navigate(`${base}/result`)} className="sv-btn sv-btn-primary w-full py-4 text-base">
              <Trophy className="w-5 h-5" /> {t('coursesAi.syllabus.finish_course')}
            </button>
          ) : (
            <p className="text-xs sv-dim text-center">{t('coursesAi.syllabus.reward_hint', { xp: xpReward })}</p>
          )}
        </div>

      </div>
    </div>
  )
}
