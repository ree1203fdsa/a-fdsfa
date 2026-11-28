import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { guestPrefs } from '@/lib/guestPrefs'
import type { TrackName } from '@/lib/music'
import { startBgm, stopBgm } from '@/lib/sound'
import { useAuth } from '@/stores/auth'

function trackFor(path: string): TrackName {
  if (path.startsWith('/battle')) return 'battle'
  if (path.startsWith('/workshop')) return 'workshop'
  return 'lobby'
}

/** Guests (login screen) follow the sound toggle in the login settings menu. */
function useGuestSound() {
  const [on, setOn] = useState(() => guestPrefs().sound)
  useEffect(() => {
    const sync = () => setOn(guestPrefs().sound)
    window.addEventListener('cw-guest-prefs', sync)
    return () => window.removeEventListener('cw-guest-prefs', sync)
  }, [])
  return on
}

/** Applies saved settings that affect the whole app: screen brightness and background music (the song follows the screen). */
export function SettingsApplier() {
  const brightness = useAuth((s) => s.user?.settings.brightness ?? 100)
  const bgm = useAuth((s) => s.user?.settings.bgm ?? 60)
  const loggedIn = useAuth((s) => Boolean(s.user))
  const guestSound = useGuestSound()
  const { pathname } = useLocation()
  const track = trackFor(pathname)
  const unlocked = useRef(false)

  useEffect(() => {
    document.documentElement.style.filter = brightness === 100 ? '' : `brightness(${brightness / 100})`
  }, [brightness])

  useEffect(() => {
    const off = pathname.startsWith('/admin') || (loggedIn ? bgm <= 0 : !guestSound)
    if (off) {
      stopBgm()
      return
    }
    if (unlocked.current) {
      startBgm(track)
      return
    }
    // Browsers only allow audio after the first tap/click/key.
    const begin = () => {
      unlocked.current = true
      startBgm(track)
    }
    window.addEventListener('pointerdown', begin, { once: true })
    window.addEventListener('keydown', begin, { once: true })
    return () => {
      window.removeEventListener('pointerdown', begin)
      window.removeEventListener('keydown', begin)
    }
  }, [loggedIn, bgm, track, guestSound, pathname])

  return null
}
