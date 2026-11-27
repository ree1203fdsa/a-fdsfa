export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, message: string, code: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch('/api' + path, {
      method,
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-requested-with': 'colorwars' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, '인터넷 연결을 확인해 주세요. 서버와 연결할 수 없어요.', 'NETWORK')
  }
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    if (res.status >= 500 || res.status === 0) throw new ApiError(res.status, '서버가 잠시 응답하지 않아요. 잠시 후 다시 시도해 주세요.', 'SERVER_DOWN')
  }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; code?: string }
    if (res.status === 401 && d.code === 'UNAUTHORIZED') window.dispatchEvent(new Event('cw:unauthorized'))
    throw new ApiError(res.status, d.error ?? '알 수 없는 오류가 생겼어요.', d.code ?? 'ERROR')
  }
  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown = {}) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown = {}) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : '알 수 없는 오류가 생겼어요.')
