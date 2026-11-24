import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft, ArrowRight, Clock, Carrot, UtensilsCrossed,
  Camera, Check, Loader2, UserRound, ChefHat, Send,
} from 'lucide-react'
import type { BattleState } from '../../hooks/useBattle'
import Countdown from './Countdown'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  state: BattleState
  myUserId: number | null
  onSubmitPhoto: (base64: string) => void
  onAskChef: (question: string, stepContext?: string) => Promise<string>
}

// Comprime la foto en el cliente antes de enviarla por el socket: reduce el lado
// mayor a ~1024px y exporta JPEG ~0.7. Baja latencia de subida, costo de tokens de
// visión y tiempo del juez. Devuelve un data URL; ante cualquier fallo cae al original.
async function compressImage(file: File, maxSide = 1024, quality = 0.7): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = dataUrl
    })
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
    const w = Math.round(img.width * scale)
    const h = Math.round(img.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return dataUrl
    ctx.drawImage(img, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', quality)
  } catch {
    return dataUrl
  }
}

type Screen = { kind: 'ingredients' } | { kind: 'tools' } | { kind: 'step'; i: number } | { kind: 'submit' }

export default function BattleCook({ state, myUserId, onSubmitPhoto, onAskChef }: Props) {
  const { t } = useTranslation()
  // Buffet/Equipos: cada jugador cocina su propia receta (viene en su player), no la compartida
  const recipe = state.recipe ?? state.players.find((p) => p.userId === myUserId)?.recipe ?? undefined
  const cameraRef = useRef<HTMLInputElement>(null)
  const chatBottomRef = useRef<HTMLDivElement>(null)

  const screens = useMemo<Screen[]>(() => {
    if (!recipe) return [{ kind: 'submit' }]
    return [
      { kind: 'ingredients' },
      { kind: 'tools' },
      ...recipe.steps.map((_, i) => ({ kind: 'step', i } as Screen)),
      { kind: 'submit' },
    ]
  }, [recipe])

  const [idx, setIdx] = useState(0)
  const [preview, setPreview] = useState<string | null>(null)
  const [base64, setBase64] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showSendConfirm, setShowSendConfirm] = useState(false)

  // Chat con el chef (contextual al paso actual)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatError, setChatError] = useState('')

  const me = state.players.find((p) => p.userId === myUserId)
  const submitted = me?.hasSubmittedPhoto ?? false
  const current = screens[Math.min(idx, screens.length - 1)]
  const isSubmitScreen = current.kind === 'submit'

  const goToSubmit = () => setIdx(screens.length - 1)

  // Reiniciar el chat al cambiar de pantalla
  useEffect(() => {
    setChatMessages([]); setChatInput(''); setChatError('')
  }, [idx])

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, chatLoading])

  const stepContext = (): string => {
    if (!recipe) return ''
    if (current.kind === 'ingredients') return `Ingredientes: ${recipe.ingredients.join(', ')}`
    if (current.kind === 'tools') return `Utensilios: ${recipe.tools.join(', ')}`
    if (current.kind === 'step') return `Paso ${current.i + 1}: ${recipe.steps[current.i] ?? ''}`
    return ''
  }

  const handleChatSend = async () => {
    const text = chatInput.trim()
    if (!text || chatLoading) return
    setChatMessages((prev) => [...prev, { role: 'user', content: text }])
    setChatInput('')
    setChatLoading(true)
    setChatError('')
    try {
      const reply = await onAskChef(text, stepContext())
      setChatMessages((prev) => [...prev, { role: 'assistant', content: reply }])
    } catch {
      setChatError(t('battle.chat_error'))
    } finally {
      setChatLoading(false)
    }
  }

  const handleFile = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]
    const dataUrl = await compressImage(file)
    setPreview(dataUrl)
    setBase64(dataUrl.split(',')[1] ?? '')
  }

  const handleSend = () => {
    if (!base64) return
    setShowSendConfirm(true)
  }

  const confirmSend = () => {
    if (!base64) return
    setShowSendConfirm(false)
    setSubmitting(true)
    onSubmitPhoto(base64)
  }

  if (!recipe) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--sv-primary)' }} />
        <p className="sv-muted">{t('battle.loading_recipe')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 sv-stagger-1">
      {/* HEADER fijo: título + cronómetro de cocción */}
      <div className="sv-glass flex items-center justify-between gap-3 px-4 py-3 sticky top-2 z-10">
        <p className="font-bold text-sm truncate flex-1">{recipe.title}</p>
        <div className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 shrink-0" style={{ background: 'rgba(255,94,26,0.12)', border: '1px solid rgba(255,94,26,0.3)' }}>
          <Clock className="w-4 h-4" style={{ color: 'var(--sv-primary)' }} />
          <Countdown
            target={state.cookingEndsAt}
            onExpire={goToSubmit}
            className="text-base font-black leading-none"
            // color inherits; primary highlight
          />
        </div>
      </div>

      {/* CONTENIDO */}
      {current.kind === 'ingredients' && (
        <SectionCard icon={<Carrot className="w-5 h-5" />} title={t('recipes.ingredients')}>
          <ul className="grid gap-3">
            {recipe.ingredients.map((ing, i) => (
              <li key={i} className="flex gap-3 sv-muted text-base">
                <span className="w-2.5 h-2.5 rounded-full mt-2 shrink-0" style={{ background: 'var(--sv-primary)' }} /> {ing}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {current.kind === 'tools' && (
        <SectionCard icon={<UtensilsCrossed className="w-5 h-5" />} title={t('recipes.tools')}>
          <ul className="grid gap-3">
            {recipe.tools.map((tool, i) => (
              <li key={i} className="flex gap-3 sv-muted text-base">
                <span className="w-2.5 h-2.5 rounded-full mt-2 shrink-0" style={{ background: 'var(--sv-text-dim)' }} /> {tool}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {current.kind === 'step' && (
        <div className="sv-glass p-5 space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 flex items-center justify-center rounded-full text-white text-sm font-bold shrink-0" style={{ background: 'var(--sv-primary)' }}>
              {current.i + 1}
            </span>
            <span className="text-sm font-semibold sv-dim uppercase tracking-wide">
              {t('battle.step_of', { current: current.i + 1, total: recipe.steps.length })}
            </span>
          </div>
          <p className="text-lg leading-relaxed">{recipe.steps[current.i]}</p>
        </div>
      )}

      {/* PANTALLA FINAL: subir foto */}
      {isSubmitScreen && (
        submitted ? (
          <div className="space-y-4">
            <div className="rounded-2xl p-6 text-center space-y-2" style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)' }}>
              <Check className="w-10 h-10 mx-auto" style={{ color: '#34D399' }} />
              <p className="font-bold">{t('battle.photo_sent')}</p>
              <p className="text-sm sv-muted">{t('battle.waiting_others')}</p>
            </div>
            <div className="space-y-2">
              {state.players.map((p) => (
                <div key={p.userId} className="sv-glass flex items-center gap-3 px-4 py-2.5">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(255,94,26,0.15)' }}>
                    <UserRound className="w-4 h-4" style={{ color: 'var(--sv-primary)' }} />
                  </div>
                  <p className="flex-1 text-sm font-medium truncate">
                    {p.userId === myUserId ? t('battle.you') : (p.name || `Chef #${p.userId}`)}
                  </p>
                  {p.hasSubmittedPhoto
                    ? <span className="text-xs font-semibold flex items-center gap-1" style={{ color: '#34D399' }}><Check className="w-3.5 h-3.5" /> {t('battle.done')}</span>
                    : <Loader2 className="w-4 h-4 sv-dim animate-spin" />}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-center">
              <h2 className="text-xl font-bold">{t('battle.submit_title')}</h2>
              <p className="sv-muted text-sm mt-1">{t('battle.submit_subtitle')}</p>
            </div>

            {preview ? (
              <div className="relative rounded-2xl overflow-hidden aspect-square max-w-xs mx-auto" style={{ background: 'var(--sv-bg-input)' }}>
                <img src={preview} alt="" className="w-full h-full object-cover" />
                <button
                  onClick={() => { setPreview(null); setBase64(null) }}
                  className="absolute top-2 right-2 bg-black/60 text-white text-xs px-3 py-1.5 rounded-full"
                >
                  {t('battle.retake')}
                </button>
              </div>
            ) : (
              <button
                onClick={() => cameraRef.current?.click()}
                className="flex flex-col items-center gap-2 py-6 rounded-2xl transition active:scale-95 w-full"
                style={{ border: '2px dashed rgba(255,94,26,0.4)', background: 'rgba(255,94,26,0.06)' }}
              >
                <Camera className="w-7 h-7" style={{ color: 'var(--sv-primary)' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--sv-primary)' }}>{t('fridge.take_photo')}</span>
              </button>
            )}

            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFile(e.target.files)} />

            <button
              onClick={handleSend}
              disabled={!base64 || submitting}
              className="sv-btn sv-btn-primary w-full py-4"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
              {t('battle.send_dish')}
            </button>
          </div>
        )
      )}

      {/* CHAT CONTEXTUAL CON EL CHEF (oculto en la pantalla final) */}
      {!isSubmitScreen && (
        <div className="sv-glass p-4 space-y-3">
          <div className="flex items-center gap-1.5">
            <ChefHat className="w-3.5 h-3.5" style={{ color: 'var(--sv-primary)' }} />
            <p className="text-xs font-bold sv-dim uppercase tracking-wider">{t('battle.ask_chef')}</p>
          </div>

          {chatMessages.map((msg, i) => (
            <div key={i} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mb-0.5" style={{ background: 'linear-gradient(135deg, var(--sv-secondary), #6D28D9)' }}>
                  <ChefHat className="w-3.5 h-3.5 text-white" />
                </div>
              )}
              <div
                className="max-w-[80%] px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
                style={msg.role === 'user'
                  ? { background: 'linear-gradient(135deg, var(--sv-primary), #E04800)', color: '#fff', borderRadius: '16px 16px 4px 16px' }
                  : { background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)', color: 'var(--sv-text-main)', borderRadius: '16px 16px 16px 4px' }}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {chatLoading && (
            <div className="flex items-end gap-2 justify-start">
              <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mb-0.5" style={{ background: 'linear-gradient(135deg, var(--sv-secondary), #6D28D9)' }}>
                <ChefHat className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="rounded-2xl px-4 py-3" style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)' }}>
                <div className="flex gap-1 items-center h-4">
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--sv-secondary)', animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--sv-secondary)', animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--sv-secondary)', animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          {chatError && <p className="text-xs text-center" style={{ color: '#FCA5A5' }}>{chatError}</p>}
          <div ref={chatBottomRef} />

          <div className="flex items-center gap-2 rounded-2xl px-3 py-2" style={{ background: 'var(--sv-bg-input)', border: '1px solid var(--sv-border-light)' }}>
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend() } }}
              placeholder={t('battle.chat_placeholder')}
              maxLength={500}
              className="flex-1 bg-transparent text-sm outline-none px-1"
              style={{ color: 'var(--sv-text-main)' }}
            />
            <button
              onClick={handleChatSend}
              disabled={chatLoading || !chatInput.trim()}
              className="sv-btn sv-btn-primary shrink-0"
              style={{ width: 36, height: 36, borderRadius: 12 }}
            >
              {chatLoading
                ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Send className="w-3.5 h-3.5 text-white" />}
            </button>
          </div>
        </div>
      )}

      {/* NAVEGACIÓN entre pantallas (oculta en la pantalla final) */}
      {!isSubmitScreen && (
        <div className="flex gap-3">
          <button
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            disabled={idx === 0}
            className="sv-btn sv-btn-glass px-5 py-3.5"
          >
            <ArrowLeft className="w-4 h-4" /> {t('common.back')}
          </button>
          <button
            onClick={() => setIdx((i) => Math.min(screens.length - 1, i + 1))}
            className="sv-btn sv-btn-primary flex-1 py-3.5"
          >
            {screens[idx + 1]?.kind === 'submit' ? t('battle.finish_cooking') : t('battle.next')}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Confirmación antes de enviar la foto: evita envíos accidentales sin vuelta atrás */}
      {showSendConfirm && preview && createPortal(
        <div
          className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setShowSendConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl p-6 mb-4 sm:mb-0"
            style={{ background: 'var(--sv-bg-elevated)', border: '1px solid var(--sv-border-light)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-2xl overflow-hidden aspect-square max-w-[180px] mx-auto mb-4" style={{ background: 'var(--sv-bg-input)' }}>
              <img src={preview} alt="" className="w-full h-full object-cover" />
            </div>
            <h2 className="text-lg font-black text-center">{t('battle.confirm_send_title')}</h2>
            <p className="text-sm sv-muted text-center mt-2 leading-relaxed">
              {t('battle.confirm_send_message')}
            </p>

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowSendConfirm(false)}
                className="flex-1 py-3 rounded-xl text-sm font-semibold sv-muted"
                style={{ background: 'var(--sv-bg-input)', border: '1px solid var(--sv-border-light)' }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={confirmSend}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2"
                style={{ background: 'var(--sv-primary)' }}
              >
                <Check className="w-4 h-4" /> {t('battle.confirm_send_yes')}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

function SectionCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="sv-glass p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 flex items-center justify-center rounded-xl shrink-0" style={{ background: 'rgba(255,94,26,0.15)', color: 'var(--sv-primary)' }}>{icon}</div>
        <h3 className="text-xl font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  )
}
