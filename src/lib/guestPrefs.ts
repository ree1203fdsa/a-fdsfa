/** Preferences for visitors who are not logged in yet (stored only in this browser). */
export interface GuestPrefs {
  sound: boolean
  scene: boolean
}

const KEY = 'cw_guest_prefs'

export function guestPrefs(): GuestPrefs {
  const lowPower = typeof navigator !== 'undefined' && (navigator.hardwareConcurrency ?? 8) <= 2
  const base: GuestPrefs = { sound: true, scene: !lowPower }
  try {
    return { ...base, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<GuestPrefs>) }
  } catch {
    return base
  }
}

export function setGuestPrefs(p: GuestPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event('cw-guest-prefs'))
}
