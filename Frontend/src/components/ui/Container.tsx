import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

interface Props {
  children: React.ReactNode
  backButton?: boolean       // muestra el botón de regreso
  backLabel?: string         // texto del botón (opcional)
  backTo?: string            // ruta específica (opcional, default: navigate(-1))
  backState?: any            // location.state a pasar con backTo (flujos que llevan contexto)
}

export default function Container({
  children,
  backButton = false,
  backLabel,
  backTo,
  backState,
}: Props) {
  const navigate = useNavigate()

  const handleBack = () => {
    if (backTo) navigate(backTo, backState !== undefined ? { state: backState } : undefined)
    else navigate(-1)
  }

  return (
    <div className="min-h-[100dvh] w-full max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10 bg-transparent" style={{ position: 'relative', zIndex: 1 }}>
      {backButton && (
        <button
          onClick={handleBack}
          className="flex items-center gap-2 sv-muted mb-6 transition active:scale-95 group"
        >
          <div className="w-9 h-9 rounded-xl flex items-center justify-center transition" style={{ border: '1px solid var(--sv-border-light)', background: 'var(--sv-bg-surface)' }}>
            <ArrowLeft className="w-4 h-4" />
          </div>
          {backLabel && (
            <span className="text-sm font-medium">{backLabel}</span>
          )}
        </button>
      )}

      {children}

    </div>
  )
}