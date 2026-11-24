import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Send, ChefHat, ArrowLeft, Heart } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getConversationMessages, sendMessage, toggleFavorite } from '../services/api'

interface Message {
  role: 'user' | 'assistant'
  content: string
  type?: 'text' | 'options'
  options?: string[]
}

export default function Chat() {
  const { conversationId } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [error, setError] = useState('')

  const [recipeId, setRecipeId] = useState<number | null>(null)
  const [favorite, setFavorite] = useState(false)
  const [savingFav, setSavingFav] = useState(false)

  useEffect(() => {
    if (!conversationId) return
    async function loadMessages() {
      try {
        const data = await getConversationMessages(Number(conversationId))
        setMessages(data.messages ?? [])
        if (data.recipeId) {
          setRecipeId(data.recipeId)
          setFavorite(data.isFavorite ?? false)
        }
      } catch (err: any) {
        if (err.message === '401') { localStorage.removeItem('token'); navigate('/login') }
      } finally {
        setLoadingHistory(false)
      }
    }
    loadMessages()
  }, [conversationId, navigate])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [input])

  const handleToggleFavorite = async () => {
    if (!recipeId) return
    setSavingFav(true)
    try {
      const res = await toggleFavorite(recipeId)
      setFavorite(res.isFavorite)
    } catch {}
    finally { setSavingFav(false) }
  }

  const handleSend = async () => {
    if (!input.trim() || loading || !conversationId) return
    const userMessage: Message = { role: 'user', content: input.trim(), type: 'text' }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)
    setError('')

    try {
      const res = await sendMessage(input.trim(), Number(conversationId))
      setMessages(prev => [...prev, { role: 'assistant', content: res.reply, type: 'text' }])
      if (res.recipeId && !recipeId) {
        setRecipeId(res.recipeId)
        setFavorite(res.isFavorite ?? false)
      }
    } catch (err: any) {
      if (err.message === '401') { localStorage.removeItem('token'); navigate('/login') }
      else setError(t('common.error_generic'))
      setMessages(prev => prev.slice(0, -1))
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-transparent" style={{ position: 'relative', zIndex: 1 }}>
      {/* ── HEADER estilo chat ── */}
      <div className="px-4 pt-10 pb-2.5 flex items-center gap-2.5" style={{ background: 'rgba(14,11,20,0.85)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--sv-border-light)' }}>
        <button
          onClick={() => navigate(-1)}
          className="sv-menu-item w-8 h-8 flex items-center justify-center rounded-xl transition shrink-0"
        >
          <ArrowLeft className="w-4 h-4 sv-muted" />
        </button>

        {/* Avatar con indicador online */}
        <div className="relative shrink-0">
          <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--sv-primary), #FF8B54)' }}>
            <ChefHat className="w-4 h-4 text-white" />
          </div>
          <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full" style={{ background: '#34D399', border: '2px solid #0E0B14' }} />
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm leading-tight">{t('chat.chef_label')}</p>
          <p className="text-[11px] font-medium" style={{ color: '#34D399' }}>{t('chat.subtitle')}</p>
        </div>

        {recipeId && (
          <button
            onClick={handleToggleFavorite}
            disabled={savingFav}
            className="w-8 h-8 flex items-center justify-center rounded-xl transition active:scale-95 shrink-0"
            style={favorite
              ? { background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#F87171' }
              : { background: 'var(--sv-bg-surface)', border: '1px solid var(--sv-border-light)', color: 'var(--sv-text-muted)' }}
          >
            <Heart className="w-3.5 h-3.5" style={favorite ? { fill: '#F87171', color: '#F87171' } : undefined} />
          </button>
        )}
      </div>

      {/* ── MENSAJES ── */}
      <div className="flex-1 overflow-y-auto px-4 pt-5 pb-32 space-y-3">
        {loadingHistory ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                <div className="h-12 rounded-2xl animate-pulse w-2/3" style={{ background: 'var(--sv-bg-surface)' }} />
              </div>
            ))}
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mb-0.5" style={{ background: 'linear-gradient(135deg, var(--sv-primary), #FF8B54)' }}>
                  <ChefHat className="w-3.5 h-3.5 text-white" />
                </div>
              )}
              <div
                className="max-w-[78%] px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
                style={msg.role === 'user'
                  ? { background: 'linear-gradient(135deg, var(--sv-primary), #E04800)', color: '#fff', borderRadius: '16px 16px 4px 16px' }
                  : { background: 'var(--sv-bg-surface)', border: '1px solid var(--sv-border-light)', color: 'var(--sv-text-main)', borderRadius: '16px 16px 16px 4px' }}
              >
                {msg.content.startsWith('__OPTIONS__') ? '...' : msg.content}
              </div>
            </div>
          ))
        )}

        {loading && (
          <div className="flex items-end gap-2 justify-start">
            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mb-0.5" style={{ background: 'linear-gradient(135deg, var(--sv-primary), #FF8B54)' }}>
              <ChefHat className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="rounded-2xl rounded-bl-sm px-4 py-3" style={{ background: 'var(--sv-bg-surface)', border: '1px solid var(--sv-border-light)' }}>
              <div className="flex gap-1 items-center h-4">
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--sv-primary)', animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--sv-primary)', animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--sv-primary)', animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ERROR */}
      {error && (
        <div className="fixed bottom-28 left-4 right-4 z-30" style={{ maxWidth: 448, margin: '0 auto' }}>
          <div className="text-sm rounded-2xl px-4 py-3 text-center" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }}>
            {error}
          </div>
        </div>
      )}

      {/* ── INPUT FLOTANTE ── */}
      <div className="fixed bottom-8 left-4 right-4 z-30" style={{ maxWidth: 448, margin: '0 auto' }}>
        <div className="sv-glass flex items-end gap-2 px-3 py-2.5" style={{ borderRadius: 28 }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('chat.placeholder')}
            rows={1}
            maxLength={1000}
            className="flex-1 bg-transparent text-sm outline-none resize-none overflow-hidden leading-relaxed px-1 pt-0.5"
            style={{ minHeight: '36px', maxHeight: '120px', color: 'var(--sv-text-main)' }}
          />
          <div className="flex flex-col items-end gap-1 shrink-0">
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="sv-btn sv-btn-primary w-10 h-10"
              style={{ borderRadius: 16 }}
            >
              {loading
                ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Send className="w-3.5 h-3.5 text-white" />
              }
            </button>
            <span className="text-[10px] sv-dim pr-0.5">{input.length}/1000</span>
          </div>
        </div>
      </div>

    </div>
  )
}
