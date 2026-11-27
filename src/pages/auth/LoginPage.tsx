import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Button, Check, Field, PasswordField } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { sfx } from '@/lib/sound'
import type { Me } from '@/lib/types'
import { useAuth } from '@/stores/auth'
import { AuthLayout } from './AuthLayout'

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
  const [rememberId, setRememberId] = useState(() => readRemembered() !== '')
  const [stayLoggedIn, setStayLoggedIn] = useState(true)
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
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="아이디" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="아이디를 입력하세요" autoFocus={!username} />
        <PasswordField label="비밀번호" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="비밀번호를 입력하세요" autoFocus={!!username} />
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Check checked={rememberId} onChange={setRememberId}>아이디 기억하기</Check>
          <Check checked={stayLoggedIn} onChange={setStayLoggedIn}>로그인 유지</Check>
        </div>
        {error && <p className="animate-shake border-l-4 border-bad bg-bad/10 px-4 py-3 text-sm text-bad">{error}</p>}
        <Button type="submit" size="lg" loading={loading}>로그인</Button>
        <Button type="button" variant="secondary" size="lg" onClick={() => nav('/register')}>회원가입</Button>
        <div className="flex justify-between text-sm text-dim">
          <Link to="/forgot" className="hover:text-accent">비밀번호를 잊었어요</Link>
          <Link to="/support" className="hover:text-accent">고객지원</Link>
        </div>
      </form>
    </AuthLayout>
  )
}
