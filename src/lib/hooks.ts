import { useEffect, useState } from 'react'

export function useCountdown(target: string | Date | null | undefined) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  if (!target) return ''
  const ms = Math.max(0, new Date(target).getTime() - now)
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h >= 24 ? `${Math.floor(h / 24)}일 ${pad(h % 24)}:${pad(m)}` : `${pad(h)}:${pad(m)}:${pad(s)}`
}
