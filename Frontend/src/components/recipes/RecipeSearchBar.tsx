import { useState, useRef, useEffect } from 'react'
import { Search, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface Props {
  onSearch: (query: string) => void
  isLoading: boolean
}

export default function RecipeSearchBar({ onSearch, isLoading }: Props) {
  const [query, setQuery] = useState('')
  const { t } = useTranslation()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-grow: ajusta la altura según el contenido
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [query])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) onSearch(query)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sin Shift → enviar
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (query.trim()) onSearch(query)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex gap-3 items-end">

        {/* Textarea auto-grow */}
        <div className="relative flex-1">
          <Search className="absolute left-4 top-4 h-5 w-5 pointer-events-none" style={{ color: 'var(--sv-text-dim)' }} />
          <textarea
            ref={textareaRef}
            placeholder={t('recipes.search_placeholder')}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            className="sv-input w-full pl-12 resize-none overflow-hidden leading-relaxed"
            style={{ minHeight: '52px', maxHeight: '200px' }}
          />
        </div>

        {/* Botón — se ancla abajo con items-end */}
        <button
          type="submit"
          disabled={isLoading || !query.trim()}
          className="sv-btn sv-btn-primary h-[52px] min-w-[130px] px-5 text-base shrink-0"
        >
          {isLoading ? (
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              <span className="text-sm">{t('common.loading')}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              {t('recipes.search_button')}
            </div>
          )}
        </button>

      </div>
      <p className="text-xs sv-dim mt-1.5 ml-1">
        Shift + Enter {t('recipes.new_line_hint', { defaultValue: 'for a new line' })}
      </p>
    </form>
  )
}