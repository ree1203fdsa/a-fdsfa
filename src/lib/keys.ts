export const KEY_ACTIONS = [
  ['forward', '앞으로'], ['back', '뒤로'], ['left', '왼쪽'], ['right', '오른쪽'],
  ['jump', '점프'], ['run', '달리기'], ['special', '특수 기술'], ['dodge', '회피'],
] as const
export type KeyAction = (typeof KEY_ACTIONS)[number][0]

export const DEFAULT_KEYS: Record<KeyAction, string> = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', run: 'ShiftLeft', special: 'KeyQ', dodge: 'KeyE',
}

export function keyLabel(code: string) {
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  const names: Record<string, string> = { Space: '스페이스', ShiftLeft: '왼쪽 Shift', ShiftRight: '오른쪽 Shift', ControlLeft: '왼쪽 Ctrl', AltLeft: '왼쪽 Alt', Tab: 'Tab' }
  return names[code] ?? code
}

export function resolveKeys(saved?: Record<string, string>): Record<KeyAction, string> {
  return { ...DEFAULT_KEYS, ...(saved ?? {}) } as Record<KeyAction, string>
}
