import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { WEAPON_INFO, type Team, type WeaponType } from '@shared/constants'
import { MAPS, MAP_IDS } from '@shared/maps'
import { Button, Confirm, cx, IconButton, Modal, Pill } from '@/components/ui'
import { api } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { useAuth } from '@/stores/auth'
import { useRoom, type RoomMember } from '@/stores/room'
import { PlayerMenu, StaffBadge } from '@/components/PlayerMenu'
import { toast } from '@/stores/toast'

export default function RoomPage() {
  const nav = useNavigate()
  const me = useAuth((s) => s.user)!
  const room = useRoom((s) => s.room)
  const [leaving, setLeaving] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [starting, setStarting] = useState(false)
  const [menu, setMenu] = useState<RoomMember | null>(null)
  const [player, setPlayer] = useState<RoomMember | null>(null)

  useEffect(() => {
    if (!room) nav('/play/friends', { replace: true })
  }, [room, nav])
  if (!room) return null

  const s = getSocket()
  const host = room.hostId === me.id
  const mine = room.members.find((m) => m.userId === me.id)
  const others = room.members.filter((m) => m.userId !== me.id)
  const allReady = others.every((m) => m.ready)
  const teams: Team[] = ['RED', 'BLUE']

  function start() {
    setStarting(true)
    s.emit('room:start', (r: { ok: boolean; error?: string }) => {
      setStarting(false)
      if (!r.ok) toast.error(r.error ?? '시작하지 못했어요.')
    })
  }

  return (
    <div className="bg-arena flex min-h-[100dvh] flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-white/10 bg-ink/40 px-3 py-2 backdrop-blur">
        <IconButton label="방 나가기" onClick={() => setLeaving(true)}>←</IconButton>
        <div className="flex-1">
          <p className="text-xs font-bold text-dim">방 코드 · {room.isPublic ? '공개 방' : '비공개 방'}</p>
          <button
            onClick={() => { void navigator.clipboard?.writeText(room.code); toast.success('방 코드를 복사했어요!') }}
            className="font-num text-3xl font-bold tracking-[0.3em] text-accent-2"
            title="눌러서 복사"
          >
            {room.code} 📋
          </button>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setInviteOpen(true)}>📨 친구 초대</Button>
      </header>

      <div className="mx-auto grid w-full max-w-5xl flex-1 gap-3 p-3 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-3">
          {room.status === 'PLAYING' && <p className="rounded-xl bg-red/30 px-4 py-2 text-center font-bold">⚔️ 전투가 진행 중이에요...</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {teams.map((t) => {
              const list = room.members.filter((m) => m.team === t)
              return (
                <section key={t} className={cx('panel cut-lg p-3', t === 'RED' ? '!border-red/60' : '!border-blue/60')}>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className={cx('font-display text-xl', t === 'RED' ? 'text-red' : 'text-blue')}>{t === 'RED' ? '🔴 레드팀' : '🔵 블루팀'} <span className="font-num text-sm text-dim">{list.length}/2</span></h3>
                    {mine && mine.team !== t && list.length < 2 && room.status === 'WAITING' && (
                      <Button size="sm" variant={t === 'RED' ? 'red' : 'blue'} onClick={() => s.emit('room:team', { team: t })}>이 팀으로</Button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {list.map((m) => (
                      <button key={m.userId} onClick={() => m.userId !== me.id && (host ? setMenu(m) : setPlayer(m))} className={cx('flex w-full items-center gap-3 rounded-xl bg-white/5 p-2 text-left', !m.connected && 'opacity-50')}>
                        <span className="grid size-12 place-items-center rounded-full bg-gradient-to-b from-[#ffe0c2] to-[#f5b98a] text-2xl">😎</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 truncate font-bold">
                            {room.hostId === m.userId && '👑'} {m.nickname}{m.userId === me.id && ' (나)'}<StaffBadge show={m.staff} />
                            <span className="font-num text-xs text-accent">Lv.{m.level}</span>
                          </span>
                          <span className="block truncate text-xs text-dim">{WEAPON_INFO[m.weaponType as WeaponType]?.emoji} {m.weapon}{!m.connected && ' · 연결 끊김'}</span>
                        </span>
                        {room.hostId === m.userId ? <Pill>방장</Pill> : m.ready ? <Pill className="bg-ok text-white">준비 완료</Pill> : <Pill className="bg-white/10 text-dim">대기 중</Pill>}
                      </button>
                    ))}
                    {Array.from({ length: 2 - list.length }, (_, i) => (
                      <div key={i} className="grid h-16 place-items-center rounded-xl border-2 border-dashed border-white/10 text-sm text-faint">
                        {room.fillBots ? '🤖 AI가 채워요' : '빈 자리'}
                      </div>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>

          {host && (
            <section className="panel cut-lg space-y-2 p-3">
              <h3 className="font-display">⚙️ 방 설정 (방장)</h3>
              <div className="flex flex-wrap gap-1.5">
                {['random', ...MAP_IDS].map((id) => (
                  <button key={id} onClick={() => s.emit('room:settings', { mapId: id })} className={cx('rounded-lg border-2 px-2 py-1 text-sm font-bold', room.mapId === id ? 'border-accent bg-accent/20' : 'border-white/10 bg-white/5')}>
                    {id === 'random' ? '🎲 무작위' : `${MAPS[id].emoji} ${MAPS[id].name}`}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                <button className={cx('rounded-lg border-2 px-2 py-1 font-bold', room.fillBots ? 'border-accent bg-accent/20' : 'border-white/10')} onClick={() => s.emit('room:settings', { fillBots: !room.fillBots })}>🤖 빈 자리 AI로 채우기 {room.fillBots ? 'ON' : 'OFF'}</button>
                <button className={cx('rounded-lg border-2 px-2 py-1 font-bold', room.isPublic ? 'border-accent bg-accent/20' : 'border-white/10')} onClick={() => s.emit('room:settings', { isPublic: !room.isPublic })}>🌐 공개 방 {room.isPublic ? 'ON' : 'OFF'}</button>
              </div>
            </section>
          )}
          {!host && <p className="text-center text-sm text-dim">맵: {room.mapId === 'random' ? '🎲 무작위' : `${MAPS[room.mapId]?.emoji} ${MAPS[room.mapId]?.name}`} · {room.fillBots ? '빈 자리는 AI가 채워요' : 'AI 없이 사람끼리'}</p>}
        </div>

        <RoomChat />
      </div>

      <div className="sticky bottom-0 border-t border-white/10 bg-ink/70 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <Button variant="secondary" onClick={() => nav('/inventory')}>⚔️ 무기 바꾸기</Button>
          <div className="flex-1" />
          {host ? (
            <Button size="lg" disabled={!allReady || room.status !== 'WAITING'} loading={starting} onClick={start}>
              {allReady ? '▶ 게임 시작' : `준비 기다리는 중 (${others.filter((m) => m.ready).length}/${others.length})`}
            </Button>
          ) : (
            <Button size="lg" variant={mine?.ready ? 'secondary' : 'ok'} disabled={room.status !== 'WAITING'} onClick={() => s.emit('room:ready', { ready: !mine?.ready })}>
              {mine?.ready ? '준비 취소' : '✋ 준비'}
            </Button>
          )}
        </div>
      </div>

      <Confirm
        open={leaving} title="방에서 나갈까요?" confirmText="나가기" message={host ? '방장이 나가면 다른 사람이 방장이 돼요.' : '언제든 방 코드로 다시 들어올 수 있어요.'}
        onCancel={() => setLeaving(false)}
        onConfirm={() => s.emit('room:leave', () => { useRoom.getState().set(null); nav('/play/friends', { replace: true }) })}
      />
      <Modal open={menu !== null} onClose={() => setMenu(null)} title={menu?.nickname}>
        <div className="space-y-2">
          <Button variant="secondary" className="w-full" onClick={() => { nav(`/players/${menu!.userId}`) }}>프로필 보기</Button>
          <Button variant="secondary" className="w-full" onClick={() => { s.emit('room:transfer', { userId: menu!.userId }); setMenu(null) }}>👑 방장 넘기기</Button>
          <Button variant="danger" className="w-full" onClick={() => { s.emit('room:kick', { userId: menu!.userId }); setMenu(null) }}>내보내기</Button>
        </div>
      </Modal>
      <PlayerMenu player={player} onClose={() => setPlayer(null)} />
      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} inRoom={room.members.map((m) => m.userId)} />
    </div>
  )
}

function RoomChat() {
  const chat = useRoom((s) => s.room?.chat ?? [])
  const [text, setText] = useState('')
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => box.current?.scrollTo({ top: box.current.scrollHeight }), [chat.length])
  function send(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    getSocket().emit('room:chat', text)
    setText('')
  }
  return (
    <section className="panel cut-lg flex min-h-64 flex-col p-3 lg:h-full">
      <h3 className="mb-2 font-display">💬 대기실 채팅</h3>
      <div ref={box} className="flex-1 space-y-1 overflow-y-auto text-sm scrollbar-thin">
        {chat.map((c) => (
          <p key={c.id} className={c.system ? 'text-xs text-accent' : ''}>{c.system ? `📢 ${c.text}` : <><b>{c.nickname}</b>: {c.text}</>}</p>
        ))}
      </div>
      <form onSubmit={send} className="mt-2 flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={100} placeholder="메시지 입력" className="h-10 min-w-0 flex-1 rounded-xl border-2 border-white/15 bg-black/30 px-3 text-sm outline-none focus:border-accent" />
        <Button size="sm" type="submit">보내기</Button>
      </form>
    </section>
  )
}

function InviteModal({ open, onClose, inRoom }: { open: boolean; onClose: () => void; inRoom: number[] }) {
  const q = useQuery({ queryKey: ['friends'], queryFn: () => api.get<{ friends: { id: number; nickname: string; level: number; status: string }[] }>('/friends'), enabled: open })
  const friends = (q.data?.friends ?? []).filter((f) => !inRoom.includes(f.id))
  return (
    <Modal open={open} onClose={onClose} title="📨 친구 초대">
      {!q.data ? <p className="text-dim">불러오는 중...</p> : !friends.length ? <p className="text-dim">초대할 수 있는 친구가 없어요.</p> : (
        <ul className="space-y-1.5">
          {friends.map((f) => (
            <li key={f.id} className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
              <span className="flex-1 font-bold">{f.nickname} <span className="text-xs text-dim">{f.status === 'offline' ? '오프라인' : '접속 중'}</span></span>
              <Button size="sm" disabled={f.status === 'offline'} onClick={() => getSocket().emit('room:invite', { userId: f.id }, (r: { ok: boolean; error?: string }) => (r.ok ? toast.success('초대를 보냈어요!') : toast.error(r.error ?? '초대하지 못했어요.')))}>초대</Button>
            </li>
          ))}
        </ul>
      )}
      <Button variant="secondary" className="mt-4 w-full" onClick={onClose}>닫기</Button>
    </Modal>
  )
}
