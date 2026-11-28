import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom'
import { ROLE_NAMES, type Role } from '@shared/constants'
import { Button, cx, Field, Loading, Logo, PasswordField } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'

export interface AdminMe { id: number; username: string; nickname: string; role: Role; permissions: string[] }

export function useAdmin() {
  return useQuery({ queryKey: ['admin-me'], queryFn: () => api.get<{ admin: AdminMe | null }>('/admin-auth/me'), staleTime: 60_000 })
}

const NAV: [string, string, string, string][] = [
  ['/admin', '📊', '대시보드', 'dashboard'],
  ['/admin/users', '👥', '회원 관리', 'users.view'],
  ['/admin/weapons', '⚔️', '무기 관리', 'weapons.moderate'],
  ['/admin/shop', '🛒', '상점 관리', 'shop'],
  ['/admin/missions', '🎯', '미션 관리', 'missions'],
  ['/admin/events', '🎊', '이벤트 관리', 'events'],
  ['/admin/notices', '📢', '공지사항 관리', 'notices'],
  ['/admin/contests', '🎖️', '무기 대회 관리', 'contests'],
  ['/admin/game', '🎮', '게임 관리', 'game'],
  ['/admin/reports', '🚨', '신고·문의 관리', 'reports'],
  ['/admin/mail', '📮', '우편 보내기', 'users.economy'],
  ['/admin/server', '🖥️', '서버 상태·기록', 'server'],
]

export function AdminLayout() {
  const q = useAdmin()
  const qc = useQueryClient()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  if (q.isLoading) return <div className="bg-arena h-[100dvh]"><Loading /></div>
  const admin = q.data?.admin
  if (!admin) return <Navigate to="/admin/login" replace />
  const allowed = NAV.filter((n) => admin.permissions.includes(n[3]))
  return (
    <div className="flex min-h-[100dvh] bg-[#0f1336] text-text">
      <aside className={cx('fixed inset-y-0 left-0 z-40 w-60 shrink-0 flex-col border-r border-white/10 bg-[#141a4a] p-3 lg:static lg:flex', open ? 'flex' : 'hidden')}>
        <div className="mb-4 flex items-center gap-2 px-2"><Logo size="sm" image={false} /><span className="font-display text-sm text-accent">관리자</span></div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto scrollbar-thin">
          {allowed.map(([to, icon, label]) => (
            <NavLink key={to} to={to} end={to === '/admin'} onClick={() => setOpen(false)} className={({ isActive }) => cx('flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold', isActive ? 'bg-accent text-ink' : 'text-dim hover:bg-white/10 hover:text-text')}>
              <span>{icon}</span>{label}
            </NavLink>
          ))}
        </nav>
        <Button size="sm" variant="blue" className="mt-3 w-full" onClick={() => nav('/')}>🎮 게임으로 돌아가기</Button>
        <div className="mt-2 rounded-xl bg-white/5 p-3 text-sm">
          <p className="font-bold">{admin.nickname}</p>
          <p className="text-xs text-accent">{ROLE_NAMES[admin.role]}</p>
          <Button size="sm" variant="secondary" className="mt-2 w-full" onClick={async () => {
            await api.post('/admin-auth/logout')
            await qc.invalidateQueries({ queryKey: ['admin-me'] })
            nav('/admin/login')
          }}>로그아웃</Button>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <div className="flex items-center gap-2 border-b border-white/10 p-3 lg:hidden">
          <Button size="sm" variant="secondary" onClick={() => setOpen(!open)}>☰ 메뉴</Button>
          <span className="font-display">컬러워즈 관리자 센터</span>
        </div>
        <div className="mx-auto max-w-6xl p-4"><Outlet context={admin} /></div>
      </main>
    </div>
  )
}

export function AdminLogin() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const me = useAdmin()
  const [f, setF] = useState({ username: new URLSearchParams(window.location.search).get('u') ?? '', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (me.data?.admin) return <Navigate to="/admin" replace />
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.post('/admin-auth/login', f)
      await qc.invalidateQueries({ queryKey: ['admin-me'] })
      nav('/admin')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="bg-arena flex min-h-[100dvh] items-center justify-center p-4">
      <form onSubmit={submit} className="panel cut-lg w-full max-w-sm space-y-4 p-6">
        <div className="text-center"><Logo size="md" image={false} /><p className="mt-2 font-display text-xl">운영자 로그인</p></div>
        <Field label="아이디" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} autoComplete="username" />
        <PasswordField label="비밀번호" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" />
        {error && <p className="rounded-xl bg-bad/20 px-3 py-2 text-sm text-bad">{error}</p>}
        <Button type="submit" size="lg" className="w-full" loading={busy}>로그인</Button>
        <p className="text-center text-xs text-dim">운영진 계정만 들어올 수 있어요. 보안을 위해 게임 로그인과 따로 비밀번호를 한 번 더 확인하고, 8시간 뒤 자동으로 끝나요.</p>
        <Button type="button" variant="ghost" className="w-full" onClick={() => nav('/')}>🎮 게임으로 돌아가기</Button>
      </form>
    </div>
  )
}

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-4">
      <div className="mb-2 flex items-center gap-2"><h2 className="flex-1 font-display text-xl">{title}</h2>{right}</div>
      {children}
    </section>
  )
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03] scrollbar-thin">
      <table className="w-full min-w-[640px] text-sm">
        <thead><tr className="bg-white/5 text-left text-xs text-dim">{head.map((h) => <th key={h} className="px-3 py-2 font-bold">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-white/5">{children}</tbody>
      </table>
    </div>
  )
}

export const fmt = (d: string | null | undefined) => (d ? new Date(d).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) : '-')
