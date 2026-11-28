import { useQuery, useQueryClient } from '@tanstack/react-query'
import { lazy, Suspense, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { TutorialModal } from '@/components/Tutorial'
import { PlayerMenu, StaffBadge } from '@/components/PlayerMenu'
import { Button, cx, IconButton, Logo, Modal, Progress } from '@/components/ui'
import { AdminButton } from '@/components/AdminButton'
import { api, errorMessage } from '@/lib/api'
import { useCountdown } from '@/lib/hooks'
import { getSocket } from '@/lib/socket'
import { sfx } from '@/lib/sound'
import { useAuth } from '@/stores/auth'
import { toast } from '@/stores/toast'

const LobbyScene = lazy(() => import('@/three/LobbyScene'))

interface Mission {
  id: number; title: string; goalType: string; goalCount: number; progress: number
  rewardCoins: number; rewardXp: number; completed: boolean; claimed: boolean
}
interface HomeData {
  notices: { id: number; title: string; body: string; pinned: boolean; publishAt: string }[]
  events: { id: number; title: string; description: string; endAt: string; coinBonus: number }[]
  unread: number
  season: { top: { rank: number; score: number; id: number; nickname: string; level: number }[]; me: { rank: number; score: number } | null }
  dailyMissions: Mission[]
  dailyResetAt: string
}

const GOAL_ICON: Record<string, string> = {
  PLAY_GAMES: '⚔️', WIN_GAMES: '⭐', CREATE_WEAPONS: '🖌️', PLAY_WITH_FRIENDS: '👫', AI_GAMES: '🤖', ATTEND: '📅',
}

export default function MainPage() {
  const nav = useNavigate()
  const user = useAuth((s) => s.user)!
  const home = useQuery({ queryKey: ['home'], queryFn: () => api.get<HomeData>('/home') })
  const [menuOpen, setMenuOpen] = useState(false)
  const [howTo, setHowTo] = useState(false)
  const [adminMenu, setAdminMenu] = useState(false)
  const qc = useQueryClient()
  async function switchMode(mode: 'admin' | 'player') {
    try {
      const r = await api.put<{ user: typeof user }>('/me/play-mode', { mode })
      useAuth.getState().setUser(r.user)
      await qc.invalidateQueries()
      toast.success(mode === 'admin' ? '🛡️ 관리자로 플레이해요.' : '🎮 일반 유저로 플레이해요.')
      setAdminMenu(false)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  const [notice, setNotice] = useState<HomeData['notices'][number] | null>(null)
  const [params, setParams] = useSearchParams()
  const [tutorial, setTutorial] = useState(() => params.get('tutorial') === '1' || (!user.tutorialDone && !user.settings.tutorialSlidesSeen))
  const closeTutorial = () => {
    setTutorial(false)
    if (params.has('tutorial')) setParams({}, { replace: true })
    if (!user.settings.tutorialSlidesSeen) {
      useAuth.getState().patch({ settings: { ...user.settings, tutorialSlidesSeen: true } })
      void api.post('/me/tutorial-seen')
    }
  }

  return (
    <div className="relative h-[100dvh] min-h-[640px] overflow-hidden">
      <div className="absolute inset-0">
        <Suspense fallback={<div className="bg-arena h-full w-full" />}>
          <LobbyScene quality={user.settings.quality} />
        </Suspense>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(10,12,40,0.55)_100%)]" />
      </div>

      <div className="pointer-events-none relative z-10 flex h-full flex-col gap-3 p-3 sm:p-4">
        {/* ── top bar ── */}
        <header className="pointer-events-auto flex items-start gap-2">
          <IconButton label="메뉴" className="!size-12 text-2xl" onClick={() => setMenuOpen(true)}>☰</IconButton>
          <IconButton label="알림" className="!size-12 text-xl" badge={home.data?.unread} onClick={() => nav('/notifications')}>🔔</IconButton>
          <button onClick={() => nav('/profile')} className="panel cut-lg ml-1 flex items-center gap-3 py-1.5 pl-1.5 pr-4 text-left">
            <span className="grid size-12 place-items-center rounded-full border-[3px] border-accent bg-gradient-to-b from-[#ffe0c2] to-[#f5b98a] text-2xl">😎</span>
            <span className="min-w-0">
              <span className="block max-w-[9rem] truncate font-display text-lg leading-tight">{user.nickname}</span>
              <span className="flex items-center gap-2">
                <span className="font-display text-sm text-accent">Lv. {user.level}</span>
                <span className="hidden font-num text-xs text-dim sm:inline">{user.xpInto} / {user.xpNeed}</span>
              </span>
              <Progress value={user.xpInto} max={user.xpNeed} className="mt-1 h-1.5 w-32 rounded-full sm:w-40" />
            </span>
          </button>
          <div className="flex-1" />
          <button onClick={() => nav('/shop')} className="panel cut-lg flex h-12 items-center gap-2 pl-1.5 pr-1.5">
            <span className="grid size-9 place-items-center rounded-full bg-gradient-to-b from-[#ffe25a] to-[#f0a400] text-lg shadow-inner">🪙</span>
            <span className="min-w-[4.5rem] text-right font-num text-xl font-bold tabular-nums">{user.coins.toLocaleString()}</span>
            <span className="gloss grid size-8 place-items-center rounded-lg bg-gradient-to-b from-[#5cb6ff] to-blue text-xl font-bold leading-none">+</span>
          </button>
          <IconButton label="설정" className="!size-12 text-2xl" onClick={() => nav('/settings')}>⚙️</IconButton>
          <IconButton label="친구" className="hidden !size-12 text-2xl sm:grid" onClick={() => nav('/friends')}>👥</IconButton>
          {user.isStaff && (
            <AdminButton onClick={() => setAdminMenu(true)} active={user.adminPlay} />
          )}
        </header>

        {/* ── logo + tagline ── */}
        <div className="pointer-events-none relative flex flex-col items-center">
          {/* paint splash behind the logo, like the reference art */}
          <svg viewBox="0 0 400 200" className="absolute -top-4 w-[22rem] opacity-90 sm:w-[30rem]" aria-hidden>
            <path d="M60 120 C30 80 70 40 120 60 C130 20 190 10 200 50 C230 10 300 20 290 70 C350 60 370 120 320 140 C340 180 270 190 250 160 C220 200 150 195 140 160 C90 190 40 165 60 120Z" fill="#ffd23f" />
            <circle cx="40" cy="70" r="14" fill="#ff3b4e" /><circle cx="360" cy="60" r="12" fill="#2e9bff" />
            <circle cx="70" cy="175" r="9" fill="#2e9bff" /><circle cx="345" cy="170" r="10" fill="#ff3b4e" />
            <path d="M40 110 C20 90 50 70 75 85 L90 130 C70 150 45 140 40 110Z" fill="#ff3b4e" />
            <path d="M360 110 C385 95 380 140 345 140 L320 100 C335 85 350 95 360 110Z" fill="#2e9bff" />
          </svg>
          <div className="relative scale-110 sm:scale-125"><Logo size="md" /></div>
          <p className="relative mt-1 -rotate-2 rounded-lg bg-gradient-to-r from-red via-[#8a4dff] to-blue px-5 py-1 font-display text-sm tracking-wide text-white shadow-lg sm:mt-3 sm:text-base">
            그림을 그리고, <span className="text-accent">무기로 변환하여 전투</span>하세요!
          </p>
        </div>

        <div className="flex min-h-0 flex-1 gap-3">
          {/* ── left column ── */}
          <div className="pointer-events-auto flex w-full max-w-[22rem] flex-col gap-2.5 overflow-y-auto scrollbar-thin sm:w-[22rem]">
            <SeasonCard data={home.data?.season} loading={home.isLoading} onMore={() => nav('/ranking')} />
            <EventBanner events={home.data?.events} onOpen={() => home.data?.notices[0] && setNotice(home.data.notices[0])} />
            <MenuButton color="from-[#ffe25a] to-[#ffae00]" dark icon="🖌️" title="무기 제작소" sub="나만의 무기를 그려보세요!" onClick={() => nav('/workshop')} />
            <MenuButton color="from-[#4fb6ff] to-[#1a6dff]" icon="⚔️" title="빠른 대전" sub="지금 바로 전투 시작!" onClick={() => nav('/play')} />
            <MenuButton color="from-[#b37bff] to-[#6d28e8]" icon="🏆" title="랭킹" sub="최고의 플레이어가 되어보세요!" onClick={() => nav('/ranking')} />
            <MenuButton color="from-[#5de07f] to-[#16a944]" icon="🛒" title="상점" sub="다양한 아이템을 만나보세요!" onClick={() => nav('/shop')} />
          </div>

          <div className="flex-1" />

          {/* ── right column (desktop) ── */}
          <div className="pointer-events-auto hidden w-[22rem] flex-col gap-2.5 lg:flex">
            <HowToCard onMore={() => setHowTo(true)} />
            <MissionCard data={home.data} loading={home.isLoading} />
          </div>
        </div>

        {/* ── bottom row ── */}
        <div className="pointer-events-auto flex items-end gap-3">
          <LobbyChat />
          <IconButton label="친구" className="!size-14 text-2xl" onClick={() => nav('/friends')}>👥</IconButton>
          <div className="flex-1" />
          <BattleButton onClick={() => nav('/play')} />
        </div>
      </div>

      <SideMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      <HowToModal open={howTo} onClose={() => setHowTo(false)} />
      <TutorialModal open={tutorial} onClose={closeTutorial} rewardPending={!user.tutorialDone} />
      <Modal open={adminMenu} onClose={() => setAdminMenu(false)} title="🛡️ 관리자 메뉴" wide>
        <p className="mb-4 text-sm text-dim">지금: <b className="text-text">{user.adminPlay ? '🛡️ 관리자로 플레이 중' : '🎮 일반 유저로 플레이 중'}</b></p>
        <div className="grid gap-3 sm:grid-cols-3">
          <button
            onClick={() => switchMode('player')}
            className={cx('gloss flex flex-col items-center gap-1 rounded-2xl bg-gradient-to-b from-[#5cb6ff] to-blue p-5 text-white', !user.adminPlay && 'ring-4 ring-accent')}
          >
            <span className="text-4xl">🎮</span>
            <span className="font-display text-xl">일반 유저로 플레이</span>
            <span className="text-xs text-white/85">다른 플레이어와 똑같이 플레이해요. 보상·랭킹도 정상으로 기록돼요.</span>
          </button>
          <button
            onClick={() => switchMode('admin')}
            className={cx('gloss flex flex-col items-center gap-1 rounded-2xl bg-gradient-to-b from-[#ff6b7c] to-red p-5 text-white', user.adminPlay && 'ring-4 ring-accent')}
          >
            <span className="text-4xl">🛡️</span>
            <span className="font-display text-xl">관리자로 플레이</span>
            <span className="text-xs text-white/85">관리자 표시 · 모든 아이템 · 전투 무적 · 게임 안 관리 기능. 보상·랭킹 기록 없음.</span>
          </button>
          <button onClick={() => nav(`/admin/login?u=${encodeURIComponent(user.username)}`)} className="gloss flex flex-col items-center gap-1 rounded-2xl bg-gradient-to-b from-[#ac78ff] to-violet p-5 text-white">
            <span className="text-4xl">🛠️</span>
            <span className="font-display text-xl">관리자 센터</span>
            <span className="text-xs text-white/85">회원·상점·공지 등을 관리하는 화면으로 가요.</span>
          </button>
        </div>
      </Modal>
      <Modal open={notice !== null} onClose={() => setNotice(null)} title={notice?.title}>
        <p className="mb-6 whitespace-pre-wrap text-dim">{notice?.body}</p>
        <Button className="w-full" onClick={() => setNotice(null)}>닫기</Button>
      </Modal>
    </div>
  )
}

function MenuButton({ color, icon, title, sub, onClick, dark }: { color: string; icon: string; title: string; sub: string; onClick: () => void; dark?: boolean }) {
  return (
    <button
      onClick={() => {
        sfx.click()
        onClick()
      }}
      className={cx('gloss group relative flex h-[4.6rem] shrink-0 items-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-b px-4 text-left transition hover:brightness-110', color)}
    >
      <span className="pointer-events-none absolute inset-y-0 left-0 w-1/4 animate-sweep bg-gradient-to-r from-transparent via-white/35 to-transparent opacity-0 group-hover:opacity-100" />
      <span className="text-4xl drop-shadow-[0_3px_0_rgba(0,0,0,0.3)]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={cx('block font-display text-2xl leading-tight', dark ? 'text-ink' : 'text-outline-sm text-white')}>{title}</span>
        <span className={cx('block truncate text-xs font-bold', dark ? 'text-ink/80' : 'text-white/90')}>{sub}</span>
      </span>
      <span className={cx('font-display text-3xl', dark ? 'text-ink' : 'text-white')}>›</span>
    </button>
  )
}

function SeasonCard({ data, loading, onMore }: { data?: HomeData['season']; loading: boolean; onMore: () => void }) {
  const first = data?.top[0]
  return (
    <div className="panel cut-lg p-3">
      <h3 className="mb-2 flex items-center gap-2 font-display text-lg"><span className="text-2xl">🏆</span>시즌 랭킹</h3>
      {loading ? (
        <p className="py-3 text-center text-sm text-dim">불러오는 중...</p>
      ) : first ? (
        <button onClick={onMore} className="flex w-full items-center gap-3 rounded-xl bg-white/5 px-3 py-2 text-left">
          <span className="flex flex-col items-center leading-none"><span className="text-xl">👑</span><span className="font-num text-sm font-bold">1위</span></span>
          <span className="grid size-10 place-items-center rounded-lg bg-white/90 text-xl">😎</span>
          <span className="flex-1">
            <span className="block font-bold">{first.nickname}</span>
            <span className="block text-right font-num text-lg font-bold">{first.score.toLocaleString()}점</span>
          </span>
        </button>
      ) : (
        <p className="rounded-xl bg-white/5 px-3 py-3 text-center text-sm text-dim">이번 시즌 기록이 아직 없어요.<br />첫 번째 1위가 되어 보세요!</p>
      )}
      {data?.me && <p className="mt-1.5 text-center text-xs text-dim">내 순위: <b className="text-accent">{data.me.rank}위</b> · {data.me.score.toLocaleString()}점</p>}
      <button onClick={onMore} className="mt-2 w-full rounded-lg bg-white/10 py-1.5 text-sm font-bold hover:bg-white/15">더보기 ›</button>
    </div>
  )
}

function EventBanner({ events, onOpen }: { events?: HomeData['events']; onOpen: () => void }) {
  const e = events?.[0]
  return (
    <button onClick={onOpen} className="gloss relative flex h-[4.6rem] shrink-0 items-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-r from-[#5b1fd6] via-[#8a2be2] to-[#3a1a9e] px-4 text-left">
      <span className="text-4xl drop-shadow-[0_0_10px_#ffc21a]">👑</span>
      <span className="min-w-0 flex-1">
        <span className="text-outline-sm block truncate font-display text-xl leading-tight text-accent-2">{e ? e.title : '컬러워즈 시즌 1 오픈!'}</span>
        <span className="block truncate text-xs font-bold text-white/90">{e ? e.description : '지금 바로 참여하세요!'}</span>
      </span>
      <span className="font-display text-3xl">›</span>
    </button>
  )
}

function HowToCard({ onMore }: { onMore: () => void }) {
  return (
    <div className="panel cut-lg p-3">
      <h3 className="flex items-center gap-2 font-display text-lg"><span className="text-2xl">🎨</span>게임 방법!</h3>
      <p className="mt-1 text-center text-sm font-bold">직접 무기를 그려서<br />그 무기로 대결하세요!</p>
      <div className="mt-2 flex items-center justify-center gap-3">
        <div className="grid size-20 rotate-[-4deg] place-items-center rounded-lg bg-[linear-gradient(#e6ecff_1px,transparent_1px),linear-gradient(90deg,#e6ecff_1px,white_1px)] bg-[length:10px_10px] text-4xl shadow-md">🗡️</div>
        <span className="font-display text-2xl">→</span>
        <div className="grid size-20 place-items-center rounded-lg bg-gradient-to-br from-[#5b7cff] to-[#8b3dff] text-4xl shadow-md">⚔️</div>
      </div>
      <button onClick={onMore} className="gloss mx-auto mt-3 block rounded-xl bg-gradient-to-b from-[#ac78ff] to-violet px-5 py-1.5 text-sm font-bold">자세히 보기 ›</button>
    </div>
  )
}

function MissionCard({ data, loading }: { data?: HomeData; loading: boolean }) {
  const qc = useQueryClient()
  const refresh = useAuth((s) => s.refresh)
  const left = useCountdown(data?.dailyResetAt)
  const [claiming, setClaiming] = useState<number | null>(null)

  async function claim(m: Mission) {
    setClaiming(m.id)
    try {
      const r = await api.post<{ coins: number; xp: number }>(`/missions/${m.id}/claim`)
      sfx.coin()
      toast.coin(`보상 획득! 코인 +${r.coins}, 경험치 +${r.xp}`)
      await Promise.all([refresh(), qc.invalidateQueries({ queryKey: ['home'] })])
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setClaiming(null)
    }
  }

  const list = (data?.dailyMissions ?? []).slice().sort((a, b) => Number(a.claimed) - Number(b.claimed))
  return (
    <div className="panel cut-lg flex min-h-0 flex-col p-3">
      <h3 className="mb-1 flex items-center gap-2 font-display text-lg">
        <span className="text-2xl">🎯</span>오늘의 미션
        <span className="ml-auto font-num text-xs text-dim">초기화까지 {left}</span>
      </h3>
      {loading ? (
        <p className="py-3 text-center text-sm text-dim">불러오는 중...</p>
      ) : (
        <ul className="divide-y divide-white/10 overflow-y-auto scrollbar-thin">
          {list.map((m) => (
            <li key={m.id} className={cx('flex items-center gap-2 py-2', m.claimed && 'opacity-50')}>
              <span className="text-xl">{GOAL_ICON[m.goalType] ?? '🎯'}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-bold">{m.title}</span>
              <span className="font-num text-sm text-dim">{m.progress} / {m.goalCount}</span>
              {m.completed && !m.claimed ? (
                <button onClick={() => claim(m)} disabled={claiming === m.id} className="gloss rounded-lg bg-gradient-to-b from-accent-2 to-accent px-2.5 py-1 text-xs font-bold text-ink">
                  받기
                </button>
              ) : (
                <span className="flex w-16 items-center justify-end gap-1 font-num font-bold">🪙{m.rewardCoins}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface ChatMsg { id: number; userId: number; nickname: string; level: number; text: string; at: number; staff?: boolean }

function LobbyChat() {
  const me = useAuth((s) => s.user)!
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [target, setTarget] = useState<ChatMsg | null>(null)
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const s = getSocket()
    const onMsg = (m: ChatMsg) => setMsgs((prev) => [...prev.slice(-60), m])
    const join = () => s.emit('lobby:join', (history: ChatMsg[]) => setMsgs(history))
    s.on('lobby:message', onMsg)
    s.on('connect', join)
    if (s.connected) join()
    return () => {
      s.off('lobby:message', onMsg)
      s.off('connect', join)
      s.emit('lobby:leave')
    }
  }, [])
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight })
  }, [msgs, open])

  function send(e: FormEvent) {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    getSocket().emit('lobby:chat', t, (r: { ok: boolean; error?: string }) => {
      if (!r.ok) toast.error(r.error ?? '메시지를 보내지 못했어요.')
    })
    setText('')
  }

  const shown = open ? msgs : msgs.slice(-3)
  return (
    <div className="flex w-full max-w-[22rem] flex-col gap-1.5">
      {shown.length > 0 && (
        <div ref={box} onClick={() => setOpen(!open)} className={cx('cursor-pointer space-y-0.5 overflow-y-auto rounded-xl bg-ink/55 px-3 py-2 text-sm backdrop-blur scrollbar-thin', open ? 'max-h-56' : 'max-h-24')}>
          {shown.map((m) => (
            <p key={m.id} className="break-words">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  if (m.userId !== me.id) setTarget(m)
                }}
                className={cx('font-bold', m.userId === me.id ? 'text-accent' : 'text-[#9fd2ff] hover:underline')}
              >
                {m.nickname}
              </button>
              <StaffBadge show={m.staff} />
              <span className="text-white/90">: {m.text}</span>
            </p>
          ))}
        </div>
      )}
      <PlayerMenu player={target} context={target?.text} onClose={() => setTarget(null)} />
      <form onSubmit={send} className="panel cut-lg flex h-14 items-center gap-2 pl-2 pr-1.5">
        <span className="grid size-9 place-items-center rounded-full bg-white text-lg">💬</span>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={100} placeholder="메시지를 입력하세요..." className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-dim" />
        <button type="submit" className="grid size-10 place-items-center rounded-full bg-white/10 text-xl hover:bg-white/20" aria-label="보내기">😊</button>
      </form>
    </div>
  )
}

function BattleButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={() => {
        sfx.click()
        onClick()
      }}
      className="group relative h-28 w-[min(26rem,62vw)] shrink-0 animate-pulse-big transition hover:scale-105 sm:h-32"
      aria-label="전투 시작"
    >
      <svg viewBox="0 0 400 130" className="absolute inset-0 h-full w-full drop-shadow-[0_8px_16px_rgba(0,0,0,0.5)]" preserveAspectRatio="none">
        <path d="M18 70 C10 40 40 22 80 26 L210 14 C230 12 236 30 220 40 L200 118 C150 128 80 124 40 112 C14 104 6 90 18 70 Z" fill="#ff2d48" />
        <path d="M190 18 L330 10 C380 8 398 34 388 62 C380 92 360 112 320 116 L176 122 C160 124 156 108 170 100 Z" fill="#1e8fff" />
        <path d="M150 40 L250 30 L240 110 L140 116 Z" fill="#8b3dff" opacity="0.85" />
        <circle cx="30" cy="30" r="8" fill="#ff2d48" />
        <circle cx="378" cy="112" r="9" fill="#1e8fff" />
        <circle cx="12" cy="104" r="5" fill="#ff2d48" />
        <circle cx="396" cy="20" r="5" fill="#1e8fff" />
      </svg>
      <span className="text-outline relative flex items-center justify-center gap-2 font-display text-4xl text-white sm:text-5xl" style={{ transform: 'rotate(-4deg)' }}>
        전투 <span className="text-accent-2">시작!</span> <span className="text-3xl">»</span>
      </span>
    </button>
  )
}

function SideMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate()
  const logout = useAuth((s) => s.logout)
  const items: [string, string, string][] = [
    ['🏠', '로비', '/'], ['🎒', '무기 보관함', '/inventory'], ['🖌️', '무기 제작소', '/workshop'], ['📦', '3D 무기 뷰어', '/viewer'], ['⚔️', '플레이', '/play'],
    ['👥', '친구', '/friends'], ['🎯', '미션', '/missions'], ['📅', '출석 체크', '/attendance'], ['🏆', '랭킹', '/ranking'],
    ['📖', '무기 도감', '/codex'], ['🎖️', '무기 대회', '/contest'], ['🛒', '상점', '/shop'], ['👕', '캐릭터 꾸미기', '/customize'],
    ['😊', '프로필', '/profile'], ['🔔', '알림', '/notifications'], ['📮', '우편함', '/mail'], ['⚙️', '설정', '/settings'], ['💌', '고객지원', '/support'],
  ]
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <aside onClick={(e) => e.stopPropagation()} className="panel flex h-full w-72 animate-fade-up flex-col overflow-y-auto rounded-none rounded-r-3xl p-4 scrollbar-thin">
        <div className="mb-3 flex items-center justify-between">
          <Logo size="sm" image={false} />
          <IconButton label="닫기" onClick={onClose}>✕</IconButton>
        </div>
        <nav className="flex flex-col gap-1">
          {items.map(([icon, label, to]) => (
            <MenuLink key={to} icon={icon} onClick={() => { onClose(); nav(to) }}>{label}</MenuLink>
          ))}
        </nav>
        <Button variant="danger" className="mt-4" onClick={() => void logout()}>로그아웃</Button>
      </aside>
    </div>
  )
}

function MenuLink({ icon, children, onClick }: { icon: string; children: ReactNode; onClick: () => void }) {
  return (
    <button onClick={() => { sfx.click(); onClick() }} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left font-bold hover:bg-white/10">
      <span className="text-xl">{icon}</span>{children}
    </button>
  )
}

function HowToModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const steps = [
    ['🖌️', '무기 그리기', '무기 제작소에서 펜으로 원하는 무기를 그려요. 처음에는 일반 볼펜이 있어요.'],
    ['🤖', '3D로 변환', '그림을 분석해서 진짜 3D 무기로 만들어요. 모양에 따라 능력치가 달라져요.'],
    ['🎒', '보관함에 저장', '만든 무기를 보관함에 넣고 전투에 쓸 무기를 장착해요.'],
    ['⚔️', '전투!', '친구 또는 AI와 2대2 팀전을 해요. 상대 팀을 모두 쓰러뜨리면 승리!'],
    ['🪙', '보상 받기', '코인과 경험치로 새 펜, 종이, 꾸미기 아이템을 얻어요.'],
  ]
  return (
    <Modal open={open} onClose={onClose} title="게임 방법" wide>
      <ol className="grid gap-3 sm:grid-cols-2">
        {steps.map(([icon, t, d], i) => (
          <li key={t} className="flex gap-3 rounded-2xl bg-white/5 p-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-white/10 text-2xl">{icon}</span>
            <span>
              <b className="font-display text-lg"><span className="text-accent">{i + 1}.</span> {t}</b>
              <span className="block text-sm text-dim">{d}</span>
            </span>
          </li>
        ))}
      </ol>
      <Button className="mt-5 w-full" onClick={onClose}>알겠어요!</Button>
    </Modal>
  )
}
