import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShoppingCart, Plus, Trash2, Loader2, Check, Sparkles, X, Refrigerator, Search, Pencil } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Container from '../components/ui/Container'
import LoadingScreen from '../components/ui/LoadingScreen'
import {
  MarketItem, getMarket, addMarketItem, updateMarketItem, deleteMarketItem,
  clearCheckedMarket, estimateMarketPrices, getCachedProfile, getProfile, updateProfile,
} from '../services/api'
import { FOODS, foodEmoji } from '../data/foods'

// 🛒 Mi mercado (gratis, todos los planes): lista de compras simple. El
// buscador filtra una lista ESTÁTICA de comidas genéricas (sin marcas, con emoji) al
// instante — cero API externa. Tocas para añadir (o añades tu propio texto). Cada ítem
// puede llevar una nota opcional (p.ej. preferencia de marca) y un precio estimado por
// IA (automático al añadir; botón "Estimate prices" de respaldo para los del flujo de recetas).

const MAX_RESULTS = 40

const fmtPrice = (cents: number | null) =>
  cents == null ? '—' : `$${(cents / 100).toFixed(2)}`

// Miniatura: emoji por nombre sobre fondo suave.
function EmojiThumb({ name, checked }: { name: string; checked: boolean }) {
  return (
    <div
      className={`w-11 h-11 rounded-xl shrink-0 flex items-center justify-center transition ${checked ? 'opacity-40' : ''}`}
      style={{ background: 'var(--sv-bg-input)', border: '1px solid var(--sv-border-light)' }}
    >
      <span className="text-2xl leading-none" aria-hidden>{foodEmoji(name)}</span>
    </div>
  )
}

export default function Market() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [items, setItems] = useState<MarketItem[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState('')

  // Buscador de comidas (client-side, instantáneo).
  const [query, setQuery] = useState('')
  const [addingName, setAddingName] = useState<string | null>(null)
  const estimateTimer = useRef<number | null>(null)

  // Edición de nota por ítem.
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null)
  const [noteDraft, setNoteDraft] = useState('')

  // Estimar precios (ítems del flujo de recetas sin precio) + comprado→cocina
  const [estimating, setEstimating] = useState(false)
  const [clearSheet, setClearSheet] = useState(false)
  const [pantry, setPantry] = useState<string[]>(getCachedProfile()?.pantry ?? [])

  useEffect(() => {
    const load = async () => {
      try {
        const [data, profile] = await Promise.all([getMarket(), getProfile().catch(() => null)])
        setItems(data)
        if (Array.isArray(profile?.pantry)) setPantry(profile.pantry)
      } catch (err: any) {
        if (err.message === '401') { localStorage.removeItem('token'); navigate('/login'); return }
        if (err.message === 'PRO_ONLY') { navigate('/dashboard'); return } // el mercado es gratis (sin gate); queda como fallback defensivo
        setError(t('market.error_generic'))
      } finally {
        setInitialLoading(false)
      }
    }
    load()
  }, [])

  const itemNames = useMemo(() => new Set(items.map(i => i.name.toLowerCase())), [items])

  // Resultados: filtra la lista estática por tokens (todos deben aparecer). Los que
  // empiezan por el texto van primero, luego por longitud (más corto = más relevante).
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const toks = q.split(/\s+/).filter(Boolean)
    const matched = FOODS.filter(f => {
      const n = f.name.toLowerCase()
      return toks.every(tk => n.includes(tk))
    })
    matched.sort((a, b) => {
      const as = a.name.toLowerCase().startsWith(q) ? 0 : 1
      const bs = b.name.toLowerCase().startsWith(q) ? 0 : 1
      return as - bs || a.name.length - b.name.length
    })
    return matched.slice(0, MAX_RESULTS)
  }, [query])

  // ¿El texto exacto ya está en la lista estática? Si no, ofrecer "Add '<texto>'".
  const trimmedQuery = query.trim()
  const showCustomAdd =
    trimmedQuery.length >= 2 &&
    !results.some(f => f.name.toLowerCase() === trimmedQuery.toLowerCase())

  // Auto-estimar (IA) los ítems que entran sin precio. Debounced para agrupar varios
  // añadidos rápidos en 1 llamada batch. Fallo silencioso (botón de respaldo abajo).
  const scheduleAutoEstimate = () => {
    if (estimateTimer.current) window.clearTimeout(estimateTimer.current)
    estimateTimer.current = window.setTimeout(async () => {
      try {
        const res = await estimateMarketPrices()
        setItems(prev => prev.map(i => res.updated.find(u => u.id === i.id) ?? i))
      } catch { /* DAILY_LIMIT u otro: queda sin precio, con botón de respaldo */ }
    }, 1200)
  }

  const addFood = async (name: string) => {
    const clean = name.trim().slice(0, 60)
    if (!clean || addingName || itemNames.has(clean.toLowerCase())) return
    setAddingName(clean)
    setError('')
    try {
      const created = await addMarketItem({ name: clean })
      setItems(prev => [created, ...prev])
      setQuery('')
      scheduleAutoEstimate()
    } catch (err: any) {
      if (err.message === '401') { localStorage.removeItem('token'); navigate('/login') }
      else setError(t('market.error_generic'))
    } finally {
      setAddingName(null)
    }
  }

  const handleToggle = async (item: MarketItem) => {
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, checked: !i.checked } : i))
    try {
      await updateMarketItem(item.id, { checked: !item.checked })
    } catch {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, checked: item.checked } : i))
    }
  }

  const handleDelete = async (id: number) => {
    const prev = items
    setItems(p => p.filter(i => i.id !== id))
    try { await deleteMarketItem(id) } catch { setItems(prev) }
  }

  // Nota (preferencia de marca): edición inline con guardado optimista.
  const startEditNote = (item: MarketItem) => {
    setEditingNoteId(item.id)
    setNoteDraft(item.note ?? '')
  }
  const saveNote = async (item: MarketItem) => {
    const note = noteDraft.trim().slice(0, 80)
    setEditingNoteId(null)
    if ((item.note ?? '') === note) return
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, note: note || null } : i))
    try {
      await updateMarketItem(item.id, { note })
    } catch {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, note: item.note } : i))
    }
  }

  // Borra los comprados; opcionalmente los suma a la despensa (My Kitchen) primero.
  const doClearChecked = async (addToKitchen: boolean) => {
    setClearSheet(false)
    const purchased = items.filter(i => i.checked).map(i => i.name)
    const prev = items
    setItems(p => p.filter(i => !i.checked))
    if (addToKitchen && purchased.length > 0) {
      const seen = new Set(pantry.map(i => i.toLowerCase()))
      const merged = [...pantry, ...purchased.filter(n => !seen.has(n.toLowerCase()))].slice(0, 60)
      setPantry(merged)
      updateProfile({ pantry: merged }).catch(() => {})
    }
    try { await clearCheckedMarket() } catch { setItems(prev) }
  }

  const unpriced = items.filter(i => i.priceCents == null)

  const runEstimate = async () => {
    if (unpriced.length === 0) return
    setEstimating(true)
    setError('')
    try {
      const res = await estimateMarketPrices()
      setItems(prev => prev.map(i => res.updated.find(u => u.id === i.id) ?? i))
    } catch (err: any) {
      if (err.message === '401') { localStorage.removeItem('token'); navigate('/login') }
      else if (err.message === 'DAILY_LIMIT_REACHED') setError(t('market.daily_limit'))
      else setError(t('market.error_generic'))
    } finally {
      setEstimating(false)
    }
  }

  const totalCents = items.reduce((sum, i) => sum + (i.checked ? 0 : (i.priceCents ?? 0)), 0)
  const hasAiPrices = items.some(i => i.priceSource === 'ai')
  const checkedCount = items.filter(i => i.checked).length

  if (initialLoading) return <LoadingScreen />

  return (
    <Container backButton backTo="/dashboard">
      <div className="space-y-5 pb-28">

        {/* HEADER */}
        <div>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5" style={{ background: 'rgba(16,185,129,0.15)' }}>
            <ShoppingCart className="w-6 h-6" style={{ color: '#34D399' }} />
          </div>
          <h1 className="text-3xl font-black leading-tight">{t('market.title')}</h1>
          <p className="sv-muted mt-2 text-base">{t('market.subtitle')}</p>
        </div>

        {/* TOTAL */}
        {items.length > 0 && (
          <div className="sv-glass p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide sv-dim">{t('market.total')}</p>
              <p className="text-2xl font-black mt-0.5">{fmtPrice(totalCents)}</p>
            </div>
            {checkedCount > 0 && (
              <button
                onClick={() => setClearSheet(true)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl transition active:scale-95"
                style={{ border: '1px solid var(--sv-border-light)', background: 'var(--sv-bg-input)', color: 'var(--sv-text-muted)' }}
              >
                <Trash2 className="w-3.5 h-3.5" /> {t('market.clear_checked')}
              </button>
            )}
          </div>
        )}

        {/* 🔎 BUSCADOR DE COMIDA (lista estática, instantáneo) */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute pointer-events-none sv-dim" style={{ left: 16, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t('market.search_placeholder')}
              className="sv-input w-full text-sm"
              style={{ paddingLeft: 44, paddingRight: 40 }}
              maxLength={60}
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute w-6 h-6 rounded-full flex items-center justify-center"
                style={{ right: 12, top: '50%', transform: 'translateY(-50%)', background: 'var(--sv-bg-input)' }}
                aria-label={t('common.cancel')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Resultados (chips) */}
          {trimmedQuery.length >= 1 && (
            <div className="flex flex-wrap gap-2">
              {showCustomAdd && (
                <button
                  onClick={() => addFood(trimmedQuery)}
                  disabled={!!addingName}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition active:scale-95"
                  style={{ background: '#34D399', color: '#04231A' }}
                >
                  {addingName === trimmedQuery ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {t('market.add_custom', { name: trimmedQuery })}
                </button>
              )}
              {results.map(f => {
                const added = itemNames.has(f.name.toLowerCase())
                return (
                  <button
                    key={f.name}
                    onClick={() => addFood(f.name)}
                    disabled={added || !!addingName}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition active:scale-95"
                    style={{
                      background: added ? 'rgba(16,185,129,0.12)' : 'var(--sv-bg-input)',
                      border: '1px solid var(--sv-border-light)',
                      color: added ? '#34D399' : 'var(--sv-text)',
                    }}
                  >
                    <span aria-hidden>{f.emoji}</span>
                    {f.name}
                    {added ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5 sv-dim" />}
                  </button>
                )
              })}
              {results.length === 0 && !showCustomAdd && (
                <p className="text-sm sv-dim py-2">{t('market.no_results')}</p>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-xl px-4 py-3 text-sm text-center" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }}>
            {error}
          </div>
        )}

        {/* ESTIMAR PRECIOS (ítems del flujo de recetas que llegaron sin precio) */}
        {unpriced.length > 0 && (
          <button
            onClick={runEstimate}
            disabled={estimating}
            className="sv-btn sv-btn-primary w-full py-3.5 text-sm"
          >
            {estimating
              ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('market.estimating')}</>
              : <>{t('market.estimate_prices')} ({unpriced.length})</>
            }
          </button>
        )}

        {/* LISTA (carrito) */}
        {items.length === 0 ? (
          <div className="text-center py-10 space-y-4">
            <p className="text-lg font-bold">{t('market.empty_title')}</p>
            <p className="text-sm sv-muted max-w-xs mx-auto">{t('market.empty_subtitle')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map(item => {
              const editing = editingNoteId === item.id
              return (
                <div key={item.id} className="sv-glass-solid p-3 flex items-center gap-3">
                  <button
                    onClick={() => handleToggle(item)}
                    className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition active:scale-90"
                    style={{
                      background: item.checked ? '#34D399' : 'var(--sv-bg-input)',
                      border: item.checked ? 'none' : '1px solid var(--sv-border-strong)',
                    }}
                    aria-label={item.checked ? t('market.uncheck') : t('market.check')}
                  >
                    {item.checked && <Check className="w-4 h-4 text-white" />}
                  </button>

                  <EmojiThumb name={item.name} checked={item.checked} />

                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold truncate ${item.checked ? 'line-through opacity-50' : ''}`}>
                      {item.name}
                    </p>

                    {/* Nota (preferencia de marca) — inline editable */}
                    {editing ? (
                      <input
                        autoFocus
                        value={noteDraft}
                        onChange={e => setNoteDraft(e.target.value)}
                        onBlur={() => saveNote(item)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); saveNote(item) }
                          if (e.key === 'Escape') setEditingNoteId(null)
                        }}
                        placeholder={t('market.note_placeholder')}
                        maxLength={80}
                        className="mt-1 w-full text-xs px-2 py-1 rounded-lg"
                        style={{ background: 'var(--sv-bg-input)', border: '1px solid var(--sv-border-light)' }}
                      />
                    ) : item.note ? (
                      <button
                        onClick={() => startEditNote(item)}
                        className={`mt-1 flex items-center gap-1 text-[11px] sv-dim truncate max-w-full ${item.checked ? 'opacity-50' : ''}`}
                      >
                        <Pencil className="w-2.5 h-2.5 shrink-0" />
                        <span className="truncate">{item.note}</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => startEditNote(item)}
                        className="mt-1 flex items-center gap-1 text-[11px] sv-dim opacity-70 hover:opacity-100 transition"
                      >
                        <Plus className="w-2.5 h-2.5" /> {t('market.add_note')}
                      </button>
                    )}

                    {item.recipeTitle && !editing && (
                      <p className="text-[11px] sv-dim truncate mt-0.5">{t('market.from_recipe', { recipe: item.recipeTitle })}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <p className={`text-sm font-bold ${item.checked ? 'line-through opacity-50' : ''}`}>{fmtPrice(item.priceCents)}</p>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center transition active:scale-90"
                      style={{ background: 'var(--sv-bg-input)' }}
                      aria-label={t('common.cancel')}
                    >
                      <Trash2 className="w-4 h-4 sv-dim" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {hasAiPrices && items.length > 0 && (
          <p className="text-xs sv-dim text-center flex items-center justify-center gap-1.5">
            <Sparkles className="w-3 h-3" /> {t('market.disclaimer')}
          </p>
        )}

      </div>

      {/* BOTTOM-SHEET: comprados → ¿pasarlos a My Kitchen? */}
      {clearSheet && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={() => setClearSheet(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl p-5 space-y-4" style={{ background: 'var(--sv-bg-surface)', border: '1px solid var(--sv-border-light)' }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-lg flex items-center gap-2">
                  <Refrigerator className="w-5 h-5" style={{ color: '#38BDF8' }} />
                  {t('market.kitchen_title')}
                </p>
                <p className="text-sm sv-muted mt-1">{t('market.kitchen_subtitle', { count: checkedCount })}</p>
              </div>
              <button onClick={() => setClearSheet(false)} className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--sv-bg-input)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <button onClick={() => doClearChecked(true)} className="sv-btn sv-btn-primary w-full py-3.5">
                {t('market.kitchen_confirm')}
              </button>
              <button
                onClick={() => doClearChecked(false)}
                className="w-full py-3 text-sm font-semibold sv-muted rounded-2xl transition active:scale-95"
                style={{ border: '1px solid var(--sv-border-light)', background: 'var(--sv-bg-input)' }}
              >
                {t('market.kitchen_skip')}
              </button>
            </div>
          </div>
        </>
      )}
    </Container>
  )
}
