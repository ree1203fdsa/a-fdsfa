import { useEffect } from 'react'
import { startBgm, stopBgm } from '@/lib/sound'
import { useAuth } from '@/stores/auth'

/** Applies saved settings that affect the whole app: screen brightness and background music. */
export function SettingsApplier() {
  const brightness = useAuth((s) => s.user?.settings.brightness ?? 100)
  const bgm = useAuth((s) => s.user?.settings.bgm ?? 0)
  const loggedIn = useAuth((s) => Boolean(s.user))

  useEffect(() => {
    document.documentElement.style.filter = brightness === 100 ? '' : `brightness(${brightness / 100})`
  }, [brightness])

  useEffect(() => {
    if (!loggedIn || bgm <= 0) {
      stopBgm()
      return
    }
    // Browsers only allow audio after the first tap/click.
    const begin = () => startBgm()
    window.addEventListener('pointerdown', begin, { once: true })
    return () => window.removeEventListener('pointerdown', begin)
  }, [loggedIn, bgm])

  return null
}
