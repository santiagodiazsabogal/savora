import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft, Camera, ImagePlus, X, Loader2, Trophy, ChefHat, Sparkles,
} from 'lucide-react'
import { getAiSyllabus, getCourseFeedback, completeAiCourse } from '../services/api'
import CourseCelebration, { type CourseResult as CourseResultData } from '../components/CourseCelebration'

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function CourseResult() {
  // Anidado en la categoría: /courses/:category/:idMeal/result
  const { category = '', idMeal = '' } = useParams()
  const base = `/courses/${category}/${idMeal}`
  const doneTo = `/courses/${category}` // al terminar, vuelve al roadmap de la categoría
  const navigate = useNavigate()
  const { t } = useTranslation()

  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const [mealName, setMealName] = useState('')
  const [photo, setPhoto] = useState<{ file: File; preview: string } | null>(null)
  const [requesting, setRequesting] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [finishing, setFinishing] = useState(false)
  const [celebration, setCelebration] = useState<CourseResultData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!idMeal) return
    getAiSyllabus(idMeal)
      .then((s) => setMealName(s.strMeal))
      .catch(() => {})
  }, [idMeal]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => { if (photo) URL.revokeObjectURL(photo.preview) }
  }, [photo])

  const setPhotoFile = (files: FileList | null) => {
    if (!files || !files[0]) return
    if (photo) URL.revokeObjectURL(photo.preview)
    setPhoto({ file: files[0], preview: URL.createObjectURL(files[0]) })
    setFeedback('')
    setError('')
  }

  const handleFeedback = async () => {
    if (!photo || !idMeal) return
    setRequesting(true)
    setError('')
    try {
      const b64 = await fileToBase64(photo.file)
      const res = await getCourseFeedback(idMeal, b64)
      setFeedback(res.feedback ?? '')
    } catch (err: any) {
      if (err.message === '401') { localStorage.removeItem('token'); navigate('/login'); return }
      setError(t('coursesAi.result.feedback_error'))
    } finally {
      setRequesting(false)
    }
  }

  const handleFinish = async () => {
    if (!idMeal) return
    setFinishing(true)
    try {
      const result = await completeAiCourse(idMeal)
      if (result.alreadyCompleted) navigate(doneTo)
      else setCelebration(result)
    } catch (err: any) {
      if (err.message === '401') { localStorage.removeItem('token'); navigate('/login'); return }
      if (err.message === 'COURSE_LIMIT_REACHED') { setError(t('coursesAi.limit_courses')); return }
      setError(t('common.error_generic'))
    } finally {
      setFinishing(false)
    }
  }

  return (
    <div className="sv-screen sv-page flex flex-col">
      <div className="sv-orbs"><div className="sv-orb sv-orb-1" /><div className="sv-orb sv-orb-2" /><div className="sv-orb sv-orb-3" /></div>
      <div className="sv-content flex flex-col flex-1">

        {/* HEADER */}
        <div className="px-4 pt-12 pb-2 sv-stagger-1">
          <button onClick={() => navigate(base)} className="w-10 h-10 flex items-center justify-center rounded-2xl transition active:scale-95" style={{ background: 'var(--sv-bg-surface)', border: '1px solid var(--sv-border-light)' }}>
            <ArrowLeft className="w-5 h-5 sv-muted" />
          </button>
        </div>

        <div className="px-6 pt-2 pb-4 text-center sv-stagger-1">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: 'rgba(245,158,11,0.15)' }}>
            <Trophy className="w-8 h-8" style={{ color: 'var(--sv-warning)' }} />
          </div>
          <h1 className="text-2xl font-black leading-tight">{t('coursesAi.result.title')}</h1>
          {mealName && <p className="sv-muted text-base mt-1">{mealName}</p>}
        </div>

        {/* FOTO */}
        <div className="px-5 sv-stagger-2">
          <p className="text-sm font-semibold sv-muted mb-2">{t('coursesAi.result.photo_label')}</p>

          {photo ? (
            <div className="relative rounded-2xl overflow-hidden" style={{ background: 'var(--sv-bg-input)' }}>
              <img src={photo.preview} alt="" className="w-full max-h-72 object-cover" />
              <button onClick={() => { URL.revokeObjectURL(photo.preview); setPhoto(null); setFeedback('') }} className="absolute top-2 right-2 w-8 h-8 bg-black/60 rounded-full flex items-center justify-center">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => cameraRef.current?.click()} className="flex flex-col items-center gap-2 py-6 rounded-2xl transition active:scale-95" style={{ border: '2px dashed rgba(255,94,26,0.4)', background: 'rgba(255,94,26,0.06)' }}>
                <Camera className="w-7 h-7" style={{ color: 'var(--sv-primary)' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--sv-primary)' }}>{t('coursesAi.result.take_photo')}</span>
              </button>
              <button onClick={() => galleryRef.current?.click()} className="flex flex-col items-center gap-2 py-6 rounded-2xl transition active:scale-95" style={{ border: '2px dashed var(--sv-border-strong)', background: 'var(--sv-bg-input)' }}>
                <ImagePlus className="w-7 h-7 sv-muted" />
                <span className="text-sm font-semibold sv-muted">{t('coursesAi.result.from_gallery')}</span>
              </button>
            </div>
          )}
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setPhotoFile(e.target.files)} />
          <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={(e) => setPhotoFile(e.target.files)} />

          {/* Pedir feedback */}
          {photo && !feedback && (
            <button onClick={handleFeedback} disabled={requesting} className="sv-btn sv-btn-ai w-full py-3.5 mt-3">
              {requesting
                ? <><Loader2 className="w-5 h-5 animate-spin" /> {t('coursesAi.result.requesting')}</>
                : <><Sparkles className="w-5 h-5" /> {t('coursesAi.result.get_feedback')}</>}
            </button>
          )}
        </div>

        {/* FEEDBACK DE LA IA */}
        {feedback && (
          <div className="px-5 mt-4 sv-stagger-2">
            <div className="sv-glass p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, var(--sv-primary), #FF8B54)' }}>
                  <ChefHat className="w-4 h-4 text-white" />
                </div>
                <p className="font-bold text-sm">{t('coursesAi.result.chef_feedback')}</p>
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{feedback}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="px-5 mt-3">
            <div className="text-sm rounded-2xl px-4 py-3 text-center" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }}>{error}</div>
          </div>
        )}

        {/* COMPLETAR CURSO */}
        <div className="px-5 pt-6 pb-12 mt-auto sv-stagger-3">
          <button onClick={handleFinish} disabled={finishing} className="sv-btn sv-btn-primary w-full py-4 text-base">
            {finishing
              ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <><Trophy className="w-5 h-5" /> {t('coursesAi.syllabus.finish_course')}</>}
          </button>
          <p className="text-xs sv-dim text-center mt-2">{t('coursesAi.result.skip_hint')}</p>
        </div>

      </div>

      {celebration && (
        <CourseCelebration result={celebration} onClose={() => navigate(doneTo)} t={t} />
      )}
    </div>
  )
}
