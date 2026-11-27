import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Confirm, cx, Empty, ErrorBox, Loading, Pill, ScreenHeader, Tabs } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { useRoom } from '@/stores/room'
import { toast } from '@/stores/toast'

type Status = 'online' | 'offline' | 'playing' | 'lobby' | 'away'
interface P { id: number; nickname: string; level: number }
interface Data {
  friends: (P & { status: Status; since: string })[]
  incoming: (P & { requestId: number; at: string })[]
  outgoing: (P & { requestId: number; at: string })[]
  blocked: P[]
  recent: P[]
}

const STATUS: Record<Status, [string, string]> = {
  online: ['bg-ok', '온라인'], playing: ['bg-red', '플레이 중'], lobby: ['bg-accent', '대기실'], away: ['bg-[#9aa0a6]', '자리 비움'], offline: ['bg-white/25', '오프라인'],
}

export default function FriendsPage() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'list' | 'requests' | 'search' | 'blocked'>('list')
  const q = useQuery({ queryKey: ['friends'], queryFn: () => api.get<Data>('/friends'), refetchInterval: 30_000 })
  const room = useRoom((s) => s.room)
  const [confirm, setConfirm] = useState<{ kind: 'remove' | 'block'; p: P } | null>(null)

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn()
      toast.success(ok)
      await qc.invalidateQueries({ queryKey: ['friends'] })
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  const invite = (p: P) =>
    getSocket().emit('room:invite', { userId: p.id }, (r: { ok: boolean; error?: string }) =>
      r.ok ? toast.success(`${p.nickname}님에게 초대를 보냈어요!`) : toast.error(r.error ?? '초대하지 못했어요.'))

  const d = q.data
  return (
    <div>
      <ScreenHeader title="친구" sub="FRIENDS" back={false} right={<Button size="sm" onClick={() => nav('/play/friends')}>👫 같이 하기</Button>} />
      <div className="mx-auto max-w-2xl space-y-3 p-4">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'list', label: `친구 ${d ? d.friends.length : ''}` },
            { value: 'requests', label: `요청${d?.incoming.length ? ` 🔴${d.incoming.length}` : ''}` },
            { value: 'search', label: '🔍 친구 찾기' },
            { value: 'blocked', label: '차단' },
          ]}
        />
        {q.isLoading ? <Loading /> : q.isError ? <ErrorBox error={q.error} onRetry={() => void q.refetch()} /> : tab === 'list' ? (
          <>
            {!d!.friends.length ? <Empty icon="👫" title="아직 친구가 없어요">"친구 찾기"에서 닉네임으로 찾아보세요.</Empty> : d!.friends.map((f) => (
              <Row key={f.id} p={f} onOpen={() => nav(`/players/${f.id}`)}
                sub={<span className="flex items-center gap-1.5"><span className={cx('size-2 rounded-full', STATUS[f.status][0])} />{STATUS[f.status][1]}</span>}
                actions={<>
                  {room && f.status !== 'offline' && <Button size="sm" onClick={() => invite(f)}>초대</Button>}
                  <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: 'remove', p: f })}>삭제</Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: 'block', p: f })}>차단</Button>
                </>}
              />
            ))}
            {d!.recent.length > 0 && (
              <>
                <h3 className="pt-3 font-display text-lg">🕹️ 최근 함께 플레이</h3>
                {d!.recent.map((p) => (
                  <Row key={p.id} p={p} onOpen={() => nav(`/players/${p.id}`)} actions={
                    d!.friends.some((f) => f.id === p.id) ? <Pill className="bg-white/10 text-dim">친구</Pill> : <Button size="sm" onClick={() => run(() => api.post('/friends/request', { userId: p.id }), '친구 요청을 보냈어요.')}>친구 요청</Button>
                  } />
                ))}
              </>
            )}
          </>
        ) : tab === 'requests' ? (
          <>
            <h3 className="font-display text-lg">받은 요청</h3>
            {!d!.incoming.length ? <p className="text-sm text-dim">받은 친구 요청이 없어요.</p> : d!.incoming.map((r) => (
              <Row key={r.requestId} p={r} onOpen={() => nav(`/players/${r.id}`)} actions={<>
                <Button size="sm" variant="ok" onClick={() => run(() => api.post(`/friends/${r.requestId}/accept`), `${r.nickname}님과 친구가 됐어요!`)}>수락</Button>
                <Button size="sm" variant="secondary" onClick={() => run(() => api.post(`/friends/${r.requestId}/decline`), '요청을 거절했어요.')}>거절</Button>
              </>} />
            ))}
            <h3 className="pt-3 font-display text-lg">보낸 요청</h3>
            {!d!.outgoing.length ? <p className="text-sm text-dim">보낸 친구 요청이 없어요.</p> : d!.outgoing.map((r) => (
              <Row key={r.requestId} p={r} sub="응답 기다리는 중" actions={<Button size="sm" variant="ghost" onClick={() => run(() => api.post(`/friends/${r.requestId}/decline`), '요청을 취소했어요.')}>취소</Button>} />
            ))}
          </>
        ) : tab === 'search' ? (
          <Search onDone={() => void qc.invalidateQueries({ queryKey: ['friends'] })} />
        ) : (
          !d!.blocked.length ? <Empty icon="🚫" title="차단한 사용자가 없어요" /> : d!.blocked.map((p) => (
            <Row key={p.id} p={p} sub="차단됨 · 요청과 초대를 받지 않아요" actions={<Button size="sm" variant="secondary" onClick={() => run(() => api.del(`/blocks/${p.id}`), '차단을 풀었어요.')}>차단 해제</Button>} />
          ))
        )}
      </div>
      <Confirm
        open={confirm !== null} danger
        title={confirm?.kind === 'block' ? '차단할까요?' : '친구를 삭제할까요?'}
        confirmText={confirm?.kind === 'block' ? '차단' : '삭제'}
        message={confirm?.kind === 'block' ? `${confirm?.p.nickname}님을 차단하면 친구에서 지워지고, 요청과 초대를 보낼 수 없게 돼요.` : `${confirm?.p.nickname}님을 친구 목록에서 지워요.`}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          const c = confirm!
          setConfirm(null)
          await run(() => (c.kind === 'block' ? api.post('/blocks', { userId: c.p.id }) : api.del(`/friends/${c.p.id}`)), c.kind === 'block' ? '차단했어요.' : '친구를 삭제했어요.')
        }}
      />
    </div>
  )
}

function Row({ p, sub, actions, onOpen }: { p: P; sub?: React.ReactNode; actions?: React.ReactNode; onOpen?: () => void }) {
  return (
    <div className="panel cut-lg flex items-center gap-3 p-3">
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-b from-[#ffe0c2] to-[#f5b98a] text-xl">😎</span>
        <span className="min-w-0">
          <span className="block truncate font-bold">{p.nickname} <span className="font-num text-xs text-accent">Lv.{p.level}</span></span>
          {sub && <span className="block text-xs text-dim">{sub}</span>}
        </span>
      </button>
      <div className="flex shrink-0 gap-1">{actions}</div>
    </div>
  )
}

function Search({ onDone }: { onDone: () => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<(P & { relation: string })[] | null>(null)
  const [busy, setBusy] = useState(false)
  async function search(e: FormEvent) {
    e.preventDefault()
    if (!q.trim()) return
    setBusy(true)
    try {
      setResults(await api.get(`/friends/search?q=${encodeURIComponent(q.trim())}`))
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-2">
      <form onSubmit={search} className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={20} placeholder="닉네임으로 찾기" className="h-11 flex-1 rounded-xl border-2 border-white/15 bg-black/30 px-3 outline-none focus:border-accent" />
        <Button type="submit" loading={busy}>찾기</Button>
      </form>
      {results && !results.length && <p className="py-6 text-center text-dim">그런 닉네임의 플레이어가 없어요.</p>}
      {results?.map((u) => (
        <Row key={u.id} p={u} actions={
          u.relation === 'none' ? <Button size="sm" onClick={async () => {
            try {
              await api.post('/friends/request', { userId: u.id })
              toast.success('친구 요청을 보냈어요!')
              setResults((r) => r!.map((x) => (x.id === u.id ? { ...x, relation: 'sent' } : x)))
              onDone()
            } catch (e) {
              toast.error(errorMessage(e))
            }
          }}>친구 요청</Button>
            : <Pill className="bg-white/10 text-dim">{{ friend: '친구', sent: '요청 보냄', received: '나에게 요청함', blocked: '차단함' }[u.relation]}</Pill>
        } />
      ))}
    </div>
  )
}
