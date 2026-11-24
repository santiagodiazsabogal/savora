import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Send, Shield, ImagePlus, X, Reply, SmilePlus, Wifi, WifiOff } from 'lucide-react'
import { getClanMessages, sendClanMessage, getClanDetail, getProfile, reactClanMessage } from '../services/api'
import { getClanSocket } from '../services/clanSocket'

interface Reaction { emoji: string; count: number; userIds: number[] }
interface ReplyPreview { id: string; nombre: string | null; contenido: string; tieneImagen: boolean }
interface Message {
  id: string
  userId: number | null
  nombre: string | null
  contenido: string
  imagenUrl?: string | null
  esAutomatico: boolean
  enviadoEn: string
  replyTo?: ReplyPreview | null
  reacciones?: Reaction[]
  clientId?: string | null   // id local para reconciliar el mensaje optimista
  pending?: boolean          // true mientras el servidor no confirma el envío
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🔥', '👏', '😮']
const TYPING_TTL = 4000

// Reduce una imagen a JPEG (máx 1280px) y devuelve su data URL para enviarla.
function compressImage(file: File, maxDim = 1280, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        if (width > height && width > maxDim) { height = (height * maxDim) / width; width = maxDim }
        else if (height >= width && height > maxDim) { width = (width * maxDim) / height; height = maxDim }
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(width)
        canvas.height = Math.round(height)
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('canvas'))
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = reject
      img.src = reader.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function ClanChat() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [messages, setMessages] = useState<Message[]>([])
  const [clanName, setClanName] = useState('')
  const [myId, setMyId] = useState<number | null>(null)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [connected, setConnected] = useState(false)

  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [imageData, setImageData] = useState<string | null>(null)
  const [activeMsg, setActiveMsg] = useState<string | null>(null)
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [typingUsers, setTypingUsers] = useState<{ userId: number; nombre: string }[]>([])
  const [lightbox, setLightbox] = useState<string | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const myIdRef = useRef<number | null>(null)
  const typingTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())
  const lastTypingSent = useRef(0)
  const stopTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Guarda el último mensaje enviado para restaurarlo si la moderación lo bloquea.
  const outgoingRef = useRef<{ text: string; image: string | null } | null>(null)

  // Traduce los códigos de error del backend a un mensaje legible para el usuario.
  const mapChatError = (raw?: string) =>
    raw === 'INAPPROPRIATE_MESSAGE'
      ? t('clans.chat.blocked_inappropriate')
      : raw === 'INAPPROPRIATE_IMAGE'
        ? t('clans.chat.blocked_image')
        : raw || t('common.error_generic')

  const scrollToBottom = (smooth = false) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' })
  }
  const nearBottom = () => {
    const el = scrollerRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 140
  }

  const upsertMessage = (msg: Message) => {
    setMessages((prev) => {
      // Si el mensaje confirma uno optimista propio (mismo clientId), lo reemplaza en su lugar.
      if (msg.clientId) {
        const idx = prev.findIndex((m) => m.clientId === msg.clientId)
        if (idx !== -1) {
          const copy = [...prev]
          copy[idx] = { ...msg, pending: false }
          return copy
        }
      }
      if (prev.some((m) => m.id === msg.id)) return prev
      const wasNear = nearBottom()
      if (wasNear) setTimeout(() => scrollToBottom(true), 50)
      return [...prev, msg]
    })
  }

  // ── Carga inicial + conexión socket ───────────────────────────────────────
  useEffect(() => {
    if (!id) return
    let alive = true

    async function init() {
      try {
        const [detail, profile, msgs] = await Promise.all([
          getClanDetail(id!).catch(() => null),
          getProfile().catch(() => null),
          getClanMessages(id!).catch(() => []),
        ])
        if (!alive) return
        setClanName(detail?.nombre ?? '')
        setMyId(profile?.id ?? null)
        myIdRef.current = profile?.id ?? null
        setMessages(msgs ?? [])
        setTimeout(() => scrollToBottom(false), 60)
      } catch {
        if (alive) setError(t('clans.chat.error'))
      } finally {
        if (alive) setLoading(false)
      }
    }
    init()

    const socket = getClanSocket()
    const joinRoom = () => { setConnected(true); socket.emit('joinClan', { clanId: id }) }
    const onDisconnect = () => setConnected(false)
    const onNew = (msg: Message) => upsertMessage(msg)
    const onReaction = (data: { messageId: string; reacciones: Reaction[] }) => {
      setMessages((prev) => prev.map((m) => (m.id === data.messageId ? { ...m, reacciones: data.reacciones } : m)))
    }
    const onTyping = ({ userId, nombre }: { userId: number; nombre: string }) => {
      if (userId === myIdRef.current) return
      setTypingUsers((prev) => (prev.some((u) => u.userId === userId) ? prev : [...prev, { userId, nombre }]))
      const old = typingTimers.current.get(userId)
      if (old) clearTimeout(old)
      typingTimers.current.set(userId, setTimeout(() => {
        setTypingUsers((prev) => prev.filter((u) => u.userId !== userId))
        typingTimers.current.delete(userId)
      }, TYPING_TTL))
    }
    const onStopTyping = ({ userId }: { userId: number }) => {
      setTypingUsers((prev) => prev.filter((u) => u.userId !== userId))
      const tm = typingTimers.current.get(userId)
      if (tm) { clearTimeout(tm); typingTimers.current.delete(userId) }
    }
    const onChatError = (e: { message?: string; clientId?: string }) => {
      const raw = e?.message
      setError(mapChatError(raw))
      // Quita el mensaje optimista que no llegó a publicarse (bloqueado o con error).
      if (e?.clientId) {
        setMessages((prev) => prev.filter((m) => m.clientId !== e.clientId))
      }
      // Si fue bloqueado por moderación (texto o imagen), restaura lo que se limpió al enviar.
      if ((raw === 'INAPPROPRIATE_MESSAGE' || raw === 'INAPPROPRIATE_IMAGE') && outgoingRef.current) {
        setText((prev) => prev || outgoingRef.current!.text)
        if (outgoingRef.current.image) setImageData((prev) => prev || outgoingRef.current!.image)
      }
    }

    if (socket.connected) joinRoom()
    socket.on('connect', joinRoom)
    socket.on('disconnect', onDisconnect)
    socket.on('message:new', onNew)
    socket.on('message:reaction', onReaction)
    socket.on('typing', onTyping)
    socket.on('stopTyping', onStopTyping)
    socket.on('chatError', onChatError)

    return () => {
      alive = false
      socket.emit('stopTyping', { clanId: id })
      socket.emit('leaveClan', { clanId: id })
      socket.off('connect', joinRoom)
      socket.off('disconnect', onDisconnect)
      socket.off('message:new', onNew)
      socket.off('message:reaction', onReaction)
      socket.off('typing', onTyping)
      socket.off('stopTyping', onStopTyping)
      socket.off('chatError', onChatError)
      typingTimers.current.forEach((tm) => clearTimeout(tm))
      typingTimers.current.clear()
      if (stopTypingTimer.current) clearTimeout(stopTypingTimer.current)
    }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Escribir (typing indicator) ───────────────────────────────────────────
  const notifyTyping = () => {
    if (!id) return
    const socket = getClanSocket()
    const now = Date.now()
    if (now - lastTypingSent.current > 1800) {
      socket.emit('typing', { clanId: id })
      lastTypingSent.current = now
    }
    if (stopTypingTimer.current) clearTimeout(stopTypingTimer.current)
    stopTypingTimer.current = setTimeout(() => socket.emit('stopTyping', { clanId: id }), 2500)
  }

  // ── Imágenes ───────────────────────────────────────────────────────────────
  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    try {
      const data = await compressImage(file)
      setImageData(data)
    } catch {
      setError(t('clans.chat.image_error'))
    }
  }

  // ── Enviar ─────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    const value = text.trim()
    if ((!value && !imageData) || !id || sending) return
    setSending(true)
    setError('')
    const payload = {
      contenido: value || undefined,
      imagenUrl: imageData || undefined,
      replyToId: replyingTo?.id || undefined,
    }
    const clientId =
      (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`)
    const replySnapshot = replyingTo
      ? { id: replyingTo.id, nombre: replyingTo.nombre, contenido: replyingTo.contenido, tieneImagen: !!replyingTo.imagenUrl }
      : null
    // Recordamos lo enviado por si la moderación lo rechaza (llega async vía 'chatError').
    outgoingRef.current = { text: value, image: imageData }
    setText('')
    setImageData(null)
    setReplyingTo(null)
    if (stopTypingTimer.current) clearTimeout(stopTypingTimer.current)

    // UI optimista: el mensaje aparece al instante en estado "enviando". Se confirma
    // (mismo clientId) o se elimina si lo bloquea la moderación / falla el envío.
    upsertMessage({
      id: `temp-${clientId}`,
      clientId,
      userId: myIdRef.current,
      nombre: null,
      contenido: value,
      imagenUrl: imageData,
      esAutomatico: false,
      enviadoEn: new Date().toISOString(),
      replyTo: replySnapshot,
      reacciones: [],
      pending: true,
    })

    const socket = getClanSocket()
    try {
      if (socket.connected) {
        socket.emit('sendMessage', { clanId: id, ...payload, clientId })
        socket.emit('stopTyping', { clanId: id })
      } else {
        // Fallback REST si el socket está caído: reconcilia el optimista con la respuesta.
        const msg = await sendClanMessage(id, payload)
        setMessages((prev) => prev.map((m) => (m.clientId === clientId ? { ...msg, pending: false } : m)))
      }
    } catch (err: any) {
      if (err.message === '401') { localStorage.removeItem('token'); navigate('/login'); return }
      // Quita el optimista y restaura lo escrito para que el usuario pueda corregir/reintentar.
      setMessages((prev) => prev.filter((m) => m.clientId !== clientId))
      setError(mapChatError(err.message))
      setText(value)
      if (payload.imagenUrl) setImageData(payload.imagenUrl)
    } finally {
      setSending(false)
    }
  }

  // ── Reacciones ───────────────────────────────────────────────────────────
  const toggleReaction = async (messageId: string, emoji: string) => {
    setPickerFor(null)
    setActiveMsg(null)
    if (!id) return
    const socket = getClanSocket()
    if (socket.connected) {
      socket.emit('react', { clanId: id, messageId, emoji })
    } else {
      try { const r = await reactClanMessage(id, messageId, emoji); onLocalReaction(r) } catch { /* noop */ }
    }
  }
  const onLocalReaction = (r: { messageId: string; reacciones: Reaction[] }) => {
    setMessages((prev) => prev.map((m) => (m.id === r.messageId ? { ...m, reacciones: r.reacciones } : m)))
  }

  const fmtTime = (iso: string) => {
    try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } catch { return '' }
  }

  const typingLabel = () => {
    if (typingUsers.length === 0) return ''
    if (typingUsers.length === 1) return t('clans.chat.typing_one', { name: typingUsers[0].nombre })
    return t('clans.chat.typing_many')
  }

  return (
    <div className="sv-screen sv-page flex flex-col h-screen">
      <div className="sv-orbs"><div className="sv-orb sv-orb-1" /><div className="sv-orb sv-orb-2" /></div>
      <div className="sv-content flex flex-col flex-1 min-h-0">

        {/* HEADER */}
        <div className="px-4 pt-12 pb-3 flex items-center gap-3" style={{ borderBottom: '1px solid var(--sv-border-light)' }}>
          <button onClick={() => navigate(`/clans/${id}`)} className="w-9 h-9 flex items-center justify-center rounded-xl shrink-0" style={{ background: 'var(--sv-bg-surface)', border: '1px solid var(--sv-border-light)' }}>
            <ArrowLeft className="w-4 h-4 sv-muted" />
          </button>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(139,92,246,0.18)' }}>
            <Shield className="w-4 h-4" style={{ color: 'var(--sv-clan-accent)' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm leading-tight truncate">{clanName || t('clans.chat.title')}</p>
            <p className="text-[11px] sv-dim flex items-center gap-1">
              {connected
                ? <><Wifi className="w-3 h-3" style={{ color: '#86EFAC' }} /> {t('clans.chat.online')}</>
                : <><WifiOff className="w-3 h-3" style={{ color: '#FCA5A5' }} /> {t('clans.chat.connecting')}</>}
            </p>
          </div>
        </div>

        {/* MENSAJES */}
        <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-2.5" onClick={() => { setActiveMsg(null); setPickerFor(null) }}>
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--sv-clan-accent)', borderTopColor: 'transparent' }} />
            </div>
          ) : messages.length === 0 ? (
            <p className="sv-muted text-sm text-center py-10">{t('clans.chat.empty')}</p>
          ) : (
            messages.map((m) => {
              if (m.esAutomatico) {
                return (
                  <div key={m.id} className="flex justify-center">
                    <span className="text-[11px] sv-dim px-3 py-1 rounded-full text-center" style={{ background: 'var(--sv-bg-input)' }}>{m.contenido}</span>
                  </div>
                )
              }
              const mine = m.userId === myId
              const isActive = activeMsg === m.id
              const reactions = m.reacciones ?? []
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`} style={{ opacity: m.pending ? 0.55 : 1 }}>
                  <div className="max-w-[80%] relative">
                    {!mine && <p className="text-[11px] sv-dim mb-0.5 ml-1">{m.nombre}</p>}

                    <div
                      onClick={(e) => { e.stopPropagation(); setActiveMsg(isActive ? null : m.id); setPickerFor(null) }}
                      className="px-3.5 py-2 rounded-2xl text-sm leading-snug cursor-pointer"
                      style={mine
                        ? { background: 'linear-gradient(135deg, var(--sv-primary), #FF8B54)', color: '#fff', borderBottomRightRadius: 6 }
                        : { background: 'var(--sv-bg-surface)', border: '1px solid var(--sv-border-light)', borderBottomLeftRadius: 6 }}
                    >
                      {/* Cita */}
                      {m.replyTo && (
                        <div className="mb-1.5 px-2 py-1 rounded-lg text-[11px] leading-tight" style={{ background: mine ? 'rgba(255,255,255,0.18)' : 'var(--sv-bg-input)', borderLeft: `2px solid ${mine ? '#fff' : 'var(--sv-primary)'}` }}>
                          <span className="font-semibold opacity-90">{m.replyTo.nombre ?? t('clans.chat.someone')}</span>
                          <span className="opacity-80 block truncate">{m.replyTo.tieneImagen ? `📷 ${t('clans.chat.photo')}` : m.replyTo.contenido}</span>
                        </div>
                      )}
                      {/* Imagen */}
                      {m.imagenUrl && (
                        <img
                          src={m.imagenUrl}
                          alt=""
                          onClick={(e) => { e.stopPropagation(); setLightbox(m.imagenUrl!) }}
                          className="rounded-xl mb-1 max-h-60 w-auto object-cover cursor-zoom-in"
                          style={{ maxWidth: '100%' }}
                        />
                      )}
                      {m.contenido && <p className="whitespace-pre-wrap break-words">{m.contenido}</p>}
                    </div>

                    {/* Chips de reacciones */}
                    {reactions.length > 0 && (
                      <div className={`flex flex-wrap gap-1 mt-1 ${mine ? 'justify-end' : 'justify-start'}`}>
                        {reactions.map((r) => {
                          const mineReacted = myId != null && r.userIds.includes(myId)
                          return (
                            <button
                              key={r.emoji}
                              onClick={(e) => { e.stopPropagation(); toggleReaction(m.id, r.emoji) }}
                              className="text-[11px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5 transition active:scale-95"
                              style={{ background: mineReacted ? 'rgba(251,146,60,0.22)' : 'var(--sv-bg-input)', border: `1px solid ${mineReacted ? 'var(--sv-primary)' : 'var(--sv-border-light)'}` }}
                            >
                              <span>{r.emoji}</span><span className="sv-dim">{r.count}</span>
                            </button>
                          )
                        })}
                      </div>
                    )}

                    {/* Barra de acciones (reaccionar / responder) */}
                    {isActive && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className={`absolute -top-9 ${mine ? 'right-0' : 'left-0'} z-10 flex items-center gap-1 px-1.5 py-1 rounded-full shadow-lg`}
                        style={{ background: 'var(--sv-bg-surface)', border: '1px solid var(--sv-border-light)' }}
                      >
                        {pickerFor === m.id ? (
                          QUICK_EMOJIS.map((emo) => (
                            <button key={emo} onClick={() => toggleReaction(m.id, emo)} className="text-base px-1 hover:scale-125 transition">{emo}</button>
                          ))
                        ) : (
                          <>
                            <button onClick={() => setPickerFor(m.id)} className="w-7 h-7 flex items-center justify-center rounded-full" title={t('clans.chat.react')}>
                              <SmilePlus className="w-4 h-4 sv-muted" />
                            </button>
                            <button onClick={() => { setReplyingTo(m); setActiveMsg(null) }} className="w-7 h-7 flex items-center justify-center rounded-full" title={t('clans.chat.reply')}>
                              <Reply className="w-4 h-4 sv-muted" />
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    <p className={`text-[10px] sv-dim mt-0.5 ${mine ? 'text-right mr-1' : 'ml-1'}`}>{fmtTime(m.enviadoEn)}</p>
                  </div>
                </div>
              )
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Indicador escribiendo */}
        {typingUsers.length > 0 && (
          <p className="text-[11px] sv-dim px-5 pb-1 italic">{typingLabel()}</p>
        )}

        {error && (
          <p className="text-[11px] text-center pb-1" style={{ color: '#FCA5A5' }}>{error}</p>
        )}

        {/* Preview de respuesta */}
        {replyingTo && (
          <div className="mx-4 mb-1 px-3 py-2 rounded-xl flex items-center gap-2" style={{ background: 'var(--sv-bg-input)', borderLeft: '2px solid var(--sv-primary)' }}>
            <Reply className="w-3.5 h-3.5 sv-muted shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold sv-muted">{t('clans.chat.replying_to', { name: replyingTo.nombre ?? t('clans.chat.someone') })}</p>
              <p className="text-[11px] sv-dim truncate">{replyingTo.imagenUrl ? `📷 ${t('clans.chat.photo')}` : replyingTo.contenido}</p>
            </div>
            <button onClick={() => setReplyingTo(null)} className="shrink-0"><X className="w-4 h-4 sv-muted" /></button>
          </div>
        )}

        {/* Preview de imagen */}
        {imageData && (
          <div className="mx-4 mb-1 relative inline-block w-fit">
            <img src={imageData} alt="" className="h-20 w-auto rounded-xl object-cover" style={{ border: '1px solid var(--sv-border-light)' }} />
            <button onClick={() => setImageData(null)} className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'var(--sv-bg-surface)', border: '1px solid var(--sv-border-light)' }}>
              <X className="w-3.5 h-3.5 sv-muted" />
            </button>
          </div>
        )}

        {/* INPUT */}
        <div className="px-4 pb-8 pt-2" style={{ borderTop: '1px solid var(--sv-border-light)' }}>
          <div className="flex items-end gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
            <button onClick={() => fileRef.current?.click()} className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'var(--sv-bg-input)', border: '1px solid var(--sv-border-light)' }} title={t('clans.chat.add_image')}>
              <ImagePlus className="w-5 h-5 sv-muted" />
            </button>
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value); notifyTyping() }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              rows={1}
              maxLength={500}
              placeholder={t('clans.chat.placeholder')}
              className="flex-1 rounded-2xl px-4 py-2.5 text-sm outline-none resize-none max-h-28"
              style={{ background: 'var(--sv-bg-input)', border: '1px solid var(--sv-border-light)', color: 'var(--sv-text)' }}
            />
            <button onClick={handleSend} disabled={sending || (!text.trim() && !imageData)} className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition active:scale-95 disabled:opacity-40" style={{ background: 'linear-gradient(135deg, var(--sv-primary), #FF8B54)' }}>
              <Send className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

      </div>

      {/* Lightbox de imagen */}
      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.85)' }} onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="max-h-full max-w-full rounded-xl" />
          <button onClick={() => setLightbox(null)} className="absolute top-12 right-5 w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)' }}>
            <X className="w-5 h-5 text-white" />
          </button>
        </div>
      )}
    </div>
  )
}
