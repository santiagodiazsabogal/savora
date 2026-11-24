import { Heart } from 'lucide-react'

interface Props {
  liked: boolean
  count: number
  onToggle: () => void
  size?: 'sm' | 'md'
  busy?: boolean
}

// Corazón controlado: solo renderiza props. El estado (optimista + merge del
// auto-refresco) lo maneja la página Social, así se mantiene en sync con cambios externos.
export default function LikeButton({ liked, count, onToggle, size = 'md', busy }: Props) {
  const iconSize = size === 'sm' ? 'w-4 h-4' : 'w-6 h-6'
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm'

  return (
    <button
      onClick={onToggle}
      disabled={busy}
      className={`inline-flex items-center gap-1.5 transition active:scale-90 disabled:opacity-60 ${textSize}`}
      style={{ color: liked ? '#F43F5E' : 'var(--sv-text-muted)' }}
      aria-pressed={liked}
    >
      <Heart className={iconSize} fill={liked ? '#F43F5E' : 'none'} strokeWidth={2.2} />
      <span className="font-bold tabular-nums">{count}</span>
    </button>
  )
}
