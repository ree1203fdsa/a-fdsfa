import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api, errorMessage } from '@/lib/api'
import { sfx } from '@/lib/sound'
import type { Me } from '@/lib/types'
import { useAuth } from '@/stores/auth'
import { AuthButton, AuthInput, AuthLayout, LockIcon, UserIcon } from './AuthLayout'

const REMEMBER_KEY = 'cw_remember_id'

function readRemembered() {
  try {
    return localStorage.getItem(REMEMBER_KEY) ?? ''
  } catch {
    return ''
  }
}

export default function LoginPage() {
  const nav = useNavigate()
  const loc = useLocation()
  const setUser = useAuth((s) => s.setUser)
  const blocked = useAuth((s) => s.blocked)
  const [username, setUsername] = useState(readRemembered)
  const [password, setPassword] = useState('')
  const rememberId = true
  const stayLoggedIn = true
  const [error, setError] = useState<string | null>(blocked)
  const [loading, setLoading] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password) return setError('아이디와 비밀번호를 입력해 주세요.')
    setLoading(true)
    setError(null)
    try {
      const r = await api.post<{ user: Me }>('/auth/login', { username: username.trim(), password, remember: stayLoggedIn })
      try {
        if (rememberId) localStorage.setItem(REMEMBER_KEY, username.trim())
        else localStorage.removeItem(REMEMBER_KEY)
      } catch { /* storage unavailable */ }
      sfx.success()
      setUser(r.user)
      const from = (loc.state as { from?: string } | null)?.from
      nav(from && from !== '/login' ? from : '/', { replace: true })
    } catch (err) {
      sfx.error()
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout subtitle="로그인">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <AuthInput label="아이디" icon={<UserIcon />} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="아이디를 입력하세요" autoFocus={!username} />
        <AuthInput label="비밀번호" icon={<LockIcon />} password autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="비밀번호를 입력하세요" autoFocus={!!username} />
        {error && <p className="animate-shake rounded-xl border border-bad/60 bg-bad/15 px-4 py-2.5 text-sm text-[#ffb3bb]">{error}</p>}
        <AuthButton type="submit" disabled={loading} className="mt-1">
          {loading ? <span className="size-6 animate-spin rounded-full border-[3px] border-white border-t-transparent" /> : (
            <svg viewBox="0 0 24 24" className="size-8" fill="currentColor" aria-hidden><path d="M10 3h9a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-9v-2h9V5h-9z" /><path d="M3 11h9.2l-3.1-3.1 1.4-1.4L16 12l-5.5 5.5-1.4-1.4 3.1-3.1H3z" /></svg>
          )}
          로그인
        </AuthButton>
        <div className="my-1 flex items-center gap-3 font-display text-sm text-white/85">
          <span className="h-px flex-1 bg-white/40" />또는<span className="h-px flex-1 bg-white/40" />
        </div>
        <AuthButton type="button" tone="purple" className="mx-auto w-[min(100%,20rem)]" onClick={() => { sfx.click(); nav('/register') }}>
          <svg viewBox="0 0 24 24" className="size-8" fill="currentColor" aria-hidden><circle cx="10" cy="7.5" r="4.5" /><path d="M1 21c0-5 4-8 9-8 1.6 0 3 .3 4.3.9A6 6 0 0 0 13 21z" /><path d="M18 13h2v3h3v2h-3v3h-2v-3h-3v-2h3z" /></svg>
          회원가입
        </AuthButton>
      </form>
    </AuthLayout>
  )
}
