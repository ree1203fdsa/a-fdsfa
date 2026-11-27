import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { MAPS } from '@shared/maps'
import { Button, Check, cx, ScreenHeader } from '@/components/ui'
import { getSocket } from '@/lib/socket'
import { useRoom, type RoomView } from '@/stores/room'
import { toast } from '@/stores/toast'

type Ack = { ok: boolean; error?: string; room?: RoomView }

export default function FriendsPlayPage() {
  const nav = useNavigate()
  const room = useRoom((s) => s.room)
  const [code, setCode] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [busy, setBusy] = useState<'create' | 'join' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [list, setList] = useState<{ code: string; host: string; count: number; mapId: string }[]>([])

  useEffect(() => {
    if (room) nav('/room', { replace: true })
  }, [room, nav])

  useEffect(() => {
    const load = () => getSocket().emit('room:public', (r: { rooms: typeof list }) => setList(r.rooms ?? []))
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [])

  const enter = (r: Ack) => {
    setBusy(null)
    if (!r.ok) return setError(r.error ?? '문제가 생겼어요.')
    useRoom.getState().set(r.room!)
    nav('/room')
  }
  function create() {
    setBusy('create')
    setError(null)
    getSocket().emit('room:create', { isPublic, mapId: 'random' }, enter)
  }
  function join(e: FormEvent, c = code) {
    e.preventDefault()
    setBusy('join')
    setError(null)
    const t = setTimeout(() => { setBusy(null); toast.error('연결이 끊어졌어요.') }, 8000)
    getSocket().emit('room:join', { code: c.trim().toUpperCase() }, (r: Ack) => { clearTimeout(t); enter(r) })
  }

  return (
    <div className="bg-arena min-h-[100dvh]">
      <ScreenHeader title="친구와 플레이" sub="PLAY WITH FRIENDS" />
      <div className="mx-auto grid max-w-3xl gap-4 p-4 sm:grid-cols-2">
        <section className="panel cut-lg space-y-3 p-5">
          <p className="text-5xl">🏠</p>
          <h2 className="font-display text-2xl">방 만들기</h2>
          <p className="text-sm text-dim">방을 만들면 6자리 방 코드가 생겨요. 친구에게 코드를 알려 주거나 친구 목록에서 초대하세요. 최대 4명이에요.</p>
          <Check checked={isPublic} onChange={setIsPublic}>공개 방으로 만들기 (누구나 목록에서 보고 들어올 수 있어요)</Check>
          <Button size="lg" className="w-full" loading={busy === 'create'} onClick={create}>방 만들기</Button>
        </section>
        <section className="panel cut-lg space-y-3 p-5">
          <p className="text-5xl">🔑</p>
          <h2 className="font-display text-2xl">방 코드 입력</h2>
          <form onSubmit={join} className="space-y-3">
            <input
              value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              placeholder="ABC123" inputMode="text" autoCapitalize="characters"
              className="h-14 w-full rounded-xl border-2 border-white/15 bg-black/30 text-center font-num text-3xl font-bold tracking-[0.4em] outline-none focus:border-accent"
            />
            <Button type="submit" size="lg" variant="blue" className="w-full" disabled={code.length !== 6} loading={busy === 'join'}>다음</Button>
          </form>
        </section>
        {error && <p className="rounded-xl bg-bad/20 px-4 py-3 text-center font-bold text-bad sm:col-span-2">⚠️ {error}</p>}
        <section className="panel cut-lg p-4 sm:col-span-2">
          <h3 className="mb-2 font-display text-lg">🌐 공개 방</h3>
          {!list.length ? <p className="text-sm text-dim">지금 열려 있는 공개 방이 없어요.</p> : (
            <ul className="space-y-1.5">
              {list.map((r) => (
                <li key={r.code} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2">
                  <span className="font-num font-bold tracking-widest">{r.code}</span>
                  <span className="flex-1 truncate text-sm">{r.host}님의 방 · {MAPS[r.mapId]?.name ?? '무작위 맵'}</span>
                  <span className={cx('font-num text-sm', r.count >= 4 && 'text-bad')}>{r.count}/4</span>
                  <Button size="sm" onClick={(e) => join(e as unknown as FormEvent, r.code)}>참가</Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
