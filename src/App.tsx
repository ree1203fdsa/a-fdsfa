import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Button, Loading, Toasts } from '@/components/ui'
import { AppShell } from '@/components/AppShell'
import { RealtimeBridge } from '@/components/RealtimeBridge'
import { BattleBridge } from '@/components/BattleBridge'
import { RoomBridge } from '@/components/RoomBridge'
import { SettingsApplier } from '@/components/SettingsApplier'
import { useAuth } from '@/stores/auth'
import LoginPage from '@/pages/auth/LoginPage'
import RegisterPage from '@/pages/auth/RegisterPage'
import ForgotPage from '@/pages/auth/ForgotPage'
import MainPage from '@/pages/MainPage'

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
const PlayPage = lazy(() => import('@/pages/play/PlayPage'))
const BattlePage = lazy(() => import('@/pages/battle/BattlePage'))
const ResultPage = lazy(() => import('@/pages/battle/ResultPage'))
const FriendsPage = lazy(() => import('@/pages/friends/FriendsPage'))
const FriendsPlayPage = lazy(() => import('@/pages/room/FriendsPlayPage'))
const RoomPage = lazy(() => import('@/pages/room/RoomPage'))
const RankingPage = lazy(() => import('@/pages/content/RankingPage'))
const CodexPage = lazy(() => import('@/pages/content/CodexPage'))
const ContestPage = lazy(() => import('@/pages/content/ContestPage'))
const CustomizePage = lazy(() => import('@/pages/content/CustomizePage'))
const SupportPage = lazy(() => import('@/pages/content/SupportPage'))
const AdminLayout = lazy(() => import('@/pages/admin/AdminLayout').then((m) => ({ default: m.AdminLayout })))
const AdminLogin = lazy(() => import('@/pages/admin/AdminLayout').then((m) => ({ default: m.AdminLogin })))
const adminPage = <K extends 'AdminDashboard' | 'AdminUsers' | 'AdminWeapons' | 'AdminShop' | 'AdminCrud' | 'AdminGame' | 'AdminReports' | 'AdminMail' | 'AdminServer'>(k: K) =>
  lazy(() => import('@/pages/admin/AdminPages').then((m) => ({ default: m[k] as unknown as React.ComponentType<object> })))
const AdminDashboard = adminPage('AdminDashboard')
const AdminUsers = adminPage('AdminUsers')
const AdminWeapons = adminPage('AdminWeapons')
const AdminShop = adminPage('AdminShop')
const AdminCrud = lazy(() => import('@/pages/admin/AdminPages').then((m) => ({ default: m.AdminCrud })))
const AdminGame = adminPage('AdminGame')
const AdminReports = adminPage('AdminReports')
const AdminMail = adminPage('AdminMail')
const AdminServer = adminPage('AdminServer')

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
        <Route path="/support" element={<Suspense fallback={<FullLoading />}><SupportPage /></Suspense>} />
        <Route path="/viewer" element={<Suspense fallback={<FullLoading />}><GlbViewer /></Suspense>} />
        <Route path="/" element={<RequireAuth><MainPage /></RequireAuth>} />
        <Route element={<RequireAuth><AppShell /></RequireAuth>}>
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/missions" element={<MissionsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/players/:id" element={<ProfilePage />} />
          <Route path="/friends" element={<FriendsPage />} />
          <Route path="/ranking" element={<RankingPage />} />
        </Route>
        <Route path="/workshop" element={<RequireAuth><WorkshopPage /></RequireAuth>} />
        <Route path="/weapons/:id" element={<RequireAuth><WeaponDetailPage /></RequireAuth>} />
        <Route path="/shop" element={<RequireAuth><ShopPage /></RequireAuth>} />
        <Route path="/attendance" element={<RequireAuth><AttendancePage /></RequireAuth>} />
        <Route path="/notifications" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
        <Route path="/mail" element={<RequireAuth><MailPage /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
        <Route path="/play" element={<RequireAuth><PlayPage /></RequireAuth>} />
        <Route path="/play/friends" element={<RequireAuth><FriendsPlayPage /></RequireAuth>} />
        <Route path="/room" element={<RequireAuth><RoomPage /></RequireAuth>} />
        <Route path="/battle" element={<RequireAuth><BattlePage /></RequireAuth>} />
        <Route path="/battle/result" element={<RequireAuth><ResultPage /></RequireAuth>} />
        <Route path="/codex" element={<RequireAuth><CodexPage /></RequireAuth>} />
        <Route path="/contest" element={<RequireAuth><ContestPage /></RequireAuth>} />
        <Route path="/customize" element={<RequireAuth><CustomizePage /></RequireAuth>} />
        <Route path="/admin/login" element={<Suspense fallback={<FullLoading />}><AdminLogin /></Suspense>} />
        <Route path="/admin" element={<Suspense fallback={<FullLoading />}><AdminLayout /></Suspense>}>
          <Route index element={<AdminDashboard />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="weapons" element={<AdminWeapons />} />
          <Route path="shop" element={<AdminShop />} />
          <Route path="missions" element={<AdminCrud kind="missions" />} />
          <Route path="events" element={<AdminCrud kind="events" />} />
          <Route path="notices" element={<AdminCrud kind="notices" />} />
          <Route path="contests" element={<AdminCrud kind="contests" />} />
          <Route path="game" element={<AdminGame />} />
          <Route path="reports" element={<AdminReports />} />
          <Route path="mail" element={<AdminMail />} />
          <Route path="server" element={<AdminServer />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <RealtimeBridge />
      <BattleBridge />
      <RoomBridge />
      <SettingsApplier />
      <Toasts />
    </>
  )
}
