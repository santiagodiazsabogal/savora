import { useState } from 'react'

// Poses disponibles de la mascota (WebP transparentes en /public/images/mascot).
export type MascotPose = 'whisk' | 'cooking' | 'thinking'

const SRC: Record<MascotPose, string> = {
  whisk: '/images/mascot/mascot-whisk.webp',
  cooking: '/images/mascot/mascot-cooking.webp',
  thinking: '/images/mascot/mascot-thinking.webp',
}

/**
 * Mascota de Savora. Puramente decorativa (aria-hidden). Si el archivo no existe
 * todavía, no renderiza nada en vez de romper el layout con un ícono roto.
 */
export default function Mascot({
  pose = 'whisk',
  className = '',
  style,
}: {
  pose?: MascotPose
  className?: string
  style?: React.CSSProperties
}) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <img
      src={SRC[pose]}
      alt=""
      aria-hidden
      draggable={false}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={className}
      style={style}
    />
  )
}
