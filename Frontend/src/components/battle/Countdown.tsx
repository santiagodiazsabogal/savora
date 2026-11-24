import { useEffect, useState } from 'react'

interface Props {
  // Fecha ISO objetivo (cuándo termina)
  target: string | null
  onExpire?: () => void
  className?: string
}

function format(secondsLeft: number): string {
  const m = Math.floor(secondsLeft / 60)
  const s = secondsLeft % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function Countdown({ target, onExpire, className }: Props) {
  const [secondsLeft, setSecondsLeft] = useState<number>(() => remaining(target))

  useEffect(() => {
    setSecondsLeft(remaining(target))
    if (!target) return
    const id = setInterval(() => {
      const left = remaining(target)
      setSecondsLeft(left)
      if (left <= 0) {
        clearInterval(id)
        onExpire?.()
      }
    }, 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  return <span className={className}>{format(Math.max(0, secondsLeft))}</span>
}

function remaining(target: string | null): number {
  if (!target) return 0
  return Math.max(0, Math.round((new Date(target).getTime() - Date.now()) / 1000))
}
