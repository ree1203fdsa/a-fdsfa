import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Button, Loading, Toasts } from '@/components/ui'
import { AppShell } from '@/components/AppShell'
import { RealtimeBridge } from '@/components/RealtimeBridge'
import { SettingsApplier } from '@/components/SettingsApplier'
import { useAuth } from '@/stores/auth'
import LoginPage from '@/pages/auth/LoginPage'
import RegisterPage from '@/pages/auth/RegisterPage'
import ForgotPage from '@/pages/auth/ForgotPage'
import MainPage from '@/pages/MainPage'
import ComingSoon from '@/pages/ComingSoon'

function Offline() {
  const refresh = useAuth((s) => s.refresh)
  return (
    <div className="bg-arena flex min-h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="text-6xl">📡</span>
      <p className="font-display text-2xl">게임 서버에 연결할 수 없어요</p>
      <p className="text-dim">서버가 잠시 꺼져 있거나 인터넷 연결이 불안정해요. 잠시 후 다시 시도해 주세요.</p>
      <Button onClick={() => { useAuth.setState({ loaded: false, offline: false }); void refresh() }}>다시 연결하기</Button>
    </div>
  )
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loaded, offline } = useAuth()
  const loc = useLocation()
  if (!loaded) return <FullLoading text="컬러워즈에 접속하는 중..." />
  if (offline) return <Offline />
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  return <Suspense fallback={<FullLoading />}>{children}</Suspense>
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loaded, offline } = useAuth()
  if (!loaded) return <FullLoading text="컬러워즈에 접속하는 중..." />
  if (offline) return <Offline />
  if (user) return <Navigate to="/" replace />
  return <>{children}</>
}

const FullLoading = ({ text = '불러오는 중...' }: { text?: string }) => <div className="bg-arena min-h-full"><Loading text={text} /></div>
const soon = (title: string, icon: string) => <ComingSoon title={title} icon={icon} />

const WorkshopPage = lazy(() => import('@/pages/workshop/WorkshopPage'))
const GlbViewer = lazy(() => import('@/pages/GlbViewer'))
const InventoryPage = lazy(() => import('@/pages/inventory/InventoryPage'))
const WeaponDetailPage = lazy(() => import('@/pages/inventory/WeaponDetailPage'))
const ShopPage = lazy(() => import('@/pages/shop/ShopPage'))
const MissionsPage = lazy(() => import('@/pages/progress/MissionsPage'))
const AttendancePage = lazy(() => import('@/pages/progress/AttendancePage'))
const NotificationsPage = lazy(() => import('@/pages/progress/NotificationsPage'))
const MailPage = lazy(() => import('@/pages/progress/MailPage'))
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage'))
const ProfilePage = lazy(() => import('@/pages/profile/ProfilePage'))

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
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/missions" element={<MissionsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/players/:id" element={<ProfilePage />} />
          <Route path="/friends" element={soon('친구', '👫')} />
          <Route path="/ranking" element={soon('랭킹', '🏆')} />
        </Route>
        <Route path="/workshop" element={<RequireAuth><WorkshopPage /></RequireAuth>} />
        <Route path="/weapons/:id" element={<RequireAuth><WeaponDetailPage /></RequireAuth>} />
        <Route path="/shop" element={<RequireAuth><ShopPage /></RequireAuth>} />
        <Route path="/attendance" element={<RequireAuth><AttendancePage /></RequireAuth>} />
        <Route path="/notifications" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
        <Route path="/mail" element={<RequireAuth><MailPage /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
        {([
          ['/play', '플레이', '⚔️'], ['/codex', '무기 도감', '📖'], ['/contest', '무기 대회', '🎖️'], ['/customize', '캐릭터 꾸미기', '👕'],
        ] as const).map(([path, title, icon]) => (
          <Route key={path} path={path} element={<RequireAuth>{soon(title, icon)}</RequireAuth>} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <RealtimeBridge />
      <SettingsApplier />
      <Toasts />
    </>
  )
}
