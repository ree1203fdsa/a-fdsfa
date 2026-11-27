import { WEAPON_INFO, WEAPON_TYPES, type WeaponType } from '../../../shared/constants.ts'
import { checkWeaponName } from '../../../shared/text.ts'

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434'
export const VISION_MODEL = process.env.VISION_MODEL ?? 'qwen2.5vl:7b'

export interface AiSuggestion {
  type: WeaponType
  confidence: number
  name: string | null
  handle: 'top' | 'bottom' | 'left' | 'right' | 'unknown'
  description: string
  model: string
  ms: number
}

const TYPE_LIST = WEAPON_TYPES.map((t) => `${t} (${WEAPON_INFO[t].name})`).join(', ')

const PROMPT = `You are judging a child's hand drawing of a weapon for a cute game.
Look at the drawing and answer ONLY with JSON:
{"type": one of [${WEAPON_TYPES.join(', ')}],
 "confidence": number 0..1,
 "handle": where the grip/handle is in the picture: "top" | "bottom" | "left" | "right" | "unknown",
 "name": a short cute Korean weapon name (max 10 Korean characters) inspired by the drawing,
 "description": one short Korean sentence describing the drawing}
Weapon types: ${TYPE_LIST}.
Use "twinblades" for two separate blades, "special" for strange magical objects, "freeform" if it is not a weapon at all.`

let lastStatus: { ok: boolean; checkedAt: number } = { ok: false, checkedAt: 0 }

export async function aiAvailable(): Promise<boolean> {
  if (Date.now() - lastStatus.checkedAt < 30_000) return lastStatus.ok
  try {
    const r = await fetch(OLLAMA_URL + '/api/tags', { signal: AbortSignal.timeout(2000) })
    const j = (await r.json()) as { models?: { name: string }[] }
    lastStatus = { ok: Boolean(j.models?.some((m) => m.name === VISION_MODEL || m.name.startsWith(VISION_MODEL))), checkedAt: Date.now() }
  } catch {
    lastStatus = { ok: false, checkedAt: Date.now() }
  }
  return lastStatus.ok
}

let busy = 0

/** Asks the local vision model about a drawing. Returns null when the model is unavailable or unsure. */
export async function analyzeWithAi(pngBase64: string): Promise<AiSuggestion | null> {
  if (!(await aiAvailable())) return null
  if (busy >= 2) throw new Error('AI가 다른 그림을 보는 중이에요. 잠시 후 다시 시도해 주세요.')
  busy++
  const started = Date.now()
  try {
    const r = await fetch(OLLAMA_URL + '/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        model: VISION_MODEL,
        stream: false,
        format: 'json',
        keep_alive: '10m',
        options: { temperature: 0.2, num_predict: 200 },
        messages: [{ role: 'user', content: PROMPT, images: [pngBase64] }],
      }),
    })
    if (!r.ok) throw new Error('AI 응답 오류 ' + r.status)
    const j = (await r.json()) as { message?: { content?: string } }
    const raw = JSON.parse(j.message?.content ?? '{}') as Record<string, unknown>
    const type = String(raw.type ?? '').toLowerCase() as WeaponType
    if (!WEAPON_TYPES.includes(type)) return null
    const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 16) : ''
    const handle = ['top', 'bottom', 'left', 'right'].includes(String(raw.handle)) ? (raw.handle as AiSuggestion['handle']) : 'unknown'
    const conf = Number(raw.confidence)
    return {
      type,
      confidence: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0.5,
      name: name && !checkWeaponName(name) ? name : null,
      handle,
      description: typeof raw.description === 'string' ? raw.description.slice(0, 80) : '',
      model: VISION_MODEL,
      ms: Date.now() - started,
    }
  } finally {
    busy--
  }
}
