import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Loading, Toasts } from '@/components/ui'
import { AppShell } from '@/components/AppShell'
import { RealtimeBridge } from '@/components/RealtimeBridge'
import { useAuth } from '@/stores/auth'
import LoginPage from '@/pages/auth/LoginPage'
import RegisterPage from '@/pages/auth/RegisterPage'
import ForgotPage from '@/pages/auth/ForgotPage'
import MainPage from '@/pages/MainPage'
import ComingSoon from '@/pages/ComingSoon'

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loaded } = useAuth()
  const loc = useLocation()
  if (!loaded) return <div className="bg-arena min-h-full"><Loading text="컬러워즈에 접속하는 중..." /></div>
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  return <>{children}</>
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loaded } = useAuth()
  if (!loaded) return <div className="bg-arena min-h-full"><Loading text="컬러워즈에 접속하는 중..." /></div>
  if (user) return <Navigate to="/" replace />
  return <>{children}</>
}

const soon = (title: string, icon: string) => <ComingSoon title={title} icon={icon} />
const WorkshopPage = lazy(() => import('@/pages/workshop/WorkshopPage'))
const GlbViewer = lazy(() => import('@/pages/GlbViewer'))
const FullLoading = () => <div className="bg-arena min-h-full"><Loading text="불러오는 중..." /></div>

export default function App() {
  const refresh = useAuth((s) => s.refresh)
  const setUser = useAuth((s) => s.setUser)

  useEffect(() => {
    void refresh()
    const onUnauthorized = () => setUser(null)
    window.addEventListener('cw:unauthorized', onUnauthorized)
    return () => window.removeEventListener('cw:unauthorized', onUnauthorized)
  }, [refresh, setUser])

  return (
    <>
      <Routes>
        <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
        <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />
        <Route path="/forgot" element={<GuestOnly><ForgotPage /></GuestOnly>} />
        <Route path="/support" element={soon('고객지원', '💌')} />
        <Route path="/viewer" element={<Suspense fallback={<FullLoading />}><GlbViewer /></Suspense>} />
        <Route path="/" element={<RequireAuth><MainPage /></RequireAuth>} />
        <Route element={<RequireAuth><AppShell /></RequireAuth>}>
          <Route path="/inventory" element={soon('무기 보관함', '🎒')} />
          <Route path="/friends" element={soon('친구', '👫')} />
          <Route path="/missions" element={soon('미션', '🎯')} />
          <Route path="/ranking" element={soon('랭킹', '🏆')} />
          <Route path="/profile" element={soon('프로필', '😊')} />
        </Route>
        <Route path="/workshop" element={<RequireAuth><Suspense fallback={<FullLoading />}><WorkshopPage /></Suspense></RequireAuth>} />
        {([
          ['/shop', '상점', '🛒'], ['/play', '플레이', '⚔️'], ['/settings', '설정', '⚙️'],
          ['/notifications', '알림', '🔔'], ['/attendance', '출석 체크', '📅'], ['/codex', '무기 도감', '📖'], ['/contest', '무기 대회', '🎖️'],
          ['/customize', '캐릭터 꾸미기', '👕'], ['/mail', '우편함', '📮'],
        ] as const).map(([path, title, icon]) => (
          <Route key={path} path={path} element={<RequireAuth>{soon(title, icon)}</RequireAuth>} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <RealtimeBridge />
      <Toasts />
    </>
  )
}
