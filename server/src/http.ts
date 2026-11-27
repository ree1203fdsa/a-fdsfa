import type { NextFunction, Request, Response } from 'express'
import { z, type ZodType } from 'zod'

export class HttpError extends Error {
  status: number
  code: string
  constructor(status: number, message: string, code = 'ERROR') {
    super(message)
    this.status = status
    this.code = code
  }
}

export const bad = (msg: string, code = 'BAD_REQUEST') => new HttpError(400, msg, code)
export const notFound = (msg = '찾을 수 없어요.') => new HttpError(404, msg, 'NOT_FOUND')
export const forbidden = (msg = '권한이 없어요.') => new HttpError(403, msg, 'FORBIDDEN')
export const conflict = (msg: string, code = 'CONFLICT') => new HttpError(409, msg, code)

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data)
  if (!r.success) {
    const first = r.error.issues[0]
    // Only our own (Korean) messages are shown to players; zod's English defaults are replaced.
    throw bad(first?.message && /[가-힣]/.test(first.message) ? first.message : '입력값을 다시 확인해 주세요.', 'VALIDATION')
  }
  return r.data
}

export const idParam = z.coerce.number().int().positive()

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code })
    return
  }
  if (err && typeof err === 'object' && 'type' in err && (err as { type: string }).type === 'entity.too.large') {
    res.status(413).json({ error: '보낸 데이터가 너무 커요.', code: 'TOO_LARGE' })
    return
  }
  console.error('[error]', err)
  res.status(500).json({ error: '서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.', code: 'SERVER_ERROR' })
}

/** Simple fixed-window limiter keyed by IP + route bucket. */
export function rateLimit(bucket: string, max: number, windowMs: number) {
  const hits = new Map<string, { n: number; reset: number }>()
  return (req: Request, _res: Response, next: NextFunction) => {
    const key = (req.ip ?? 'x') + ':' + bucket
    const now = Date.now()
    const h = hits.get(key)
    if (!h || h.reset < now) {
      hits.set(key, { n: 1, reset: now + windowMs })
      if (hits.size > 50000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k)
      return next()
    }
    if (++h.n > max) return next(new HttpError(429, '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.', 'RATE_LIMIT'))
    next()
  }
}
