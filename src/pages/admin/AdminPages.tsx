import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { AI_DIFFICULTIES, MISSION_GOAL_NAMES, MISSION_GOALS, REPORT_TYPES, ROLE_NAMES, ROLES, WEAPON_INFO, type WeaponType } from '@shared/constants'
import { MAPS } from '@shared/maps'
import type { RewardConfig } from '@shared/progression'
import { Button, cx, ErrorBox, Field, Loading, Modal, Pill, Tabs } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { toast } from '@/stores/toast'
import { fmt, Section, Table, type AdminMe } from './AdminLayout'

const useMe = () => useOutletContext<AdminMe>()
const can = (me: AdminMe, p: string) => me.permissions.includes(p)

async function act(fn: () => Promise<unknown>, ok: string, after?: () => unknown) {
  try {
    await fn()
    toast.success(ok)
    await after?.()
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

function Stat({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      <p className="text-xs text-dim">{icon} {label}</p>
      <p className="font-num text-3xl font-bold">{typeof value === 'number' ? value.toLocaleString() : value}</p>
    </div>
  )
}

// ── dashboard ──
export function AdminDashboard() {
  const q = useQuery({ queryKey: ['admin', 'dash'], queryFn: () => api.get<{
    users: number; online: number; newUsers: number; matches: number; weapons: number; rooms: number; battles: number; coinsIssued: number; coinsSpent: number
    server: { uptimeSec: number; memMb: number; sockets: number }
    reports: { id: number; type: string; reason: string; reporter: string; at: string }[]
    logs: { id: number; admin: string; action: string; target: string; at: string }[]
  }>('/admin/dashboard'), refetchInterval: 15_000 })
  if (!q.data) return q.isError ? <ErrorBox error={q.error} /> : <Loading />
  const d = q.data
  return (
    <>
      <Section title="📊 대시보드">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Stat icon="👥" label="전체 회원" value={d.users} /><Stat icon="🟢" label="현재 접속자" value={d.online} />
          <Stat icon="🆕" label="오늘 신규 가입" value={d.newUsers} /><Stat icon="⚔️" label="오늘 게임 수" value={d.matches} />
          <Stat icon="🏠" label="진행 중인 방" value={d.rooms} /><Stat icon="🔥" label="진행 중인 전투" value={d.battles} />
          <Stat icon="🖌️" label="오늘 제작된 무기" value={d.weapons} /><Stat icon="🪙" label="오늘 코인 지급" value={d.coinsIssued} />
          <Stat icon="💸" label="오늘 코인 사용" value={d.coinsSpent} />
          <Stat icon="🖥️" label="서버" value={`${Math.floor(d.server.uptimeSec / 3600)}시간 · ${d.server.memMb}MB`} />
        </div>
      </Section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="🚨 최근 신고 (대기 중)">
          {!d.reports.length ? <p className="text-sm text-dim">대기 중인 신고가 없어요.</p> : d.reports.map((r) => (
            <p key={r.id} className="border-b border-white/5 py-1.5 text-sm"><Pill className="bg-bad/30 text-bad">{REPORT_TYPES[r.type]}</Pill> {r.reason} <span className="text-dim">· {r.reporter} · {fmt(r.at)}</span></p>
          ))}
        </Section>
        <Section title="📝 최근 관리자 활동">
          {!d.logs.length ? <p className="text-sm text-dim">기록이 없어요.</p> : d.logs.map((l) => (
            <p key={l.id} className="border-b border-white/5 py-1.5 text-sm"><b>{l.admin}</b> {l.action} <span className="text-dim">{l.target} · {fmt(l.at)}</span></p>
          ))}
        </Section>
      </div>
    </>
  )
}

// ── users ──
interface UserRow { id: number; username: string; nickname: string; level: number; coins: number; role: string; status: string; suspendedUntil: string | null; createdAt: string; lastLoginAt: string | null }

export function AdminUsers() {
  const me = useMe()
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [p, setP] = useState(1)
  const [open, setOpen] = useState<number | null>(null)
  const list = useQuery({ queryKey: ['admin', 'users', search, p], queryFn: () => api.get<{ rows: UserRow[]; total: number; pages: number }>(`/admin/users?page=${p}&q=${encodeURIComponent(search)}`) })
  return (
    <Section title="👥 회원 관리" right={<span className="text-sm text-dim">{list.data?.total ?? 0}명</span>}>
      <form onSubmit={(e) => { e.preventDefault(); setSearch(q); setP(1) }} className="mb-3 flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="닉네임 또는 아이디 검색" className="h-10 flex-1 rounded-xl border border-white/15 bg-black/30 px-3 outline-none focus:border-accent" />
        <Button size="sm" type="submit">검색</Button>
      </form>
      {!list.data ? <Loading /> : (
        <Table head={['ID', '아이디', '닉네임', '레벨', '코인', '등급', '상태', '가입일', '최근 접속']}>
          {list.data.rows.map((u) => (
            <tr key={u.id} onClick={() => setOpen(u.id)} className="cursor-pointer hover:bg-white/5">
              <td className="px-3 py-2 font-num">{u.id}</td><td className="px-3 py-2">{u.username}</td><td className="px-3 py-2 font-bold">{u.nickname}</td>
              <td className="px-3 py-2 font-num">{u.level}</td><td className="px-3 py-2 font-num">{u.coins.toLocaleString()}</td>
              <td className="px-3 py-2">{u.role !== 'USER' ? <Pill>{ROLE_NAMES[u.role as keyof typeof ROLE_NAMES]}</Pill> : '-'}</td>
              <td className="px-3 py-2"><StatusPill u={u} /></td><td className="px-3 py-2 text-xs">{fmt(u.createdAt)}</td><td className="px-3 py-2 text-xs">{fmt(u.lastLoginAt)}</td>
            </tr>
          ))}
        </Table>
      )}
      <Pager page={p} pages={list.data?.pages ?? 1} onChange={setP} />
      {open && <UserDetail id={open} me={me} onClose={() => setOpen(null)} />}
    </Section>
  )
}

function StatusPill({ u }: { u: { status: string; suspendedUntil: string | null } }) {
  if (u.status === 'BANNED') return <Pill className="bg-bad text-white">영구 차단</Pill>
  if (u.status === 'SUSPENDED' && u.suspendedUntil && new Date(u.suspendedUntil) > new Date()) return <Pill className="bg-accent text-ink">정지 ~{new Date(u.suspendedUntil).toLocaleDateString('ko-KR')}</Pill>
  return <Pill className="bg-ok/30 text-ok">정상</Pill>
}

function Pager({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
  if (pages <= 1) return null
  return (
    <div className="mt-3 flex items-center justify-center gap-2">
      <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>이전</Button>
      <span className="font-num text-sm">{page} / {pages}</span>
      <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onChange(page + 1)}>다음</Button>
    </div>
  )
}

function UserDetail({ id, me, onClose }: { id: number; me: AdminMe; onClose: () => void }) {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['admin', 'user', id], queryFn: () => api.get<{
    user: UserRow & { xp: number; statusReason: string | null; stats: { games: number; wins: number; losses: number; weapons: number }; inventorySlots: number }
    weapons: number; coins: { id: number; amount: number; balanceAfter: number; reason: string; createdAt: string }[]
    logins: { id: number; success: boolean; ip: string; userAgent: string; suspicious: boolean; createdAt: string }[]
    reports: { id: number; reason: string; reporter: { nickname: string }; status: string; createdAt: string }[]
    adminActs: { id: number; action: string; detail: string; admin: { nickname: string }; createdAt: string }[]
  }>(`/admin/users/${id}`) })
  const [form, setForm] = useState({ days: 1, reason: '', coins: 0, level: 0 })
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['admin', 'user', id] }), qc.invalidateQueries({ queryKey: ['admin', 'users'] })])
  const d = q.data
  return (
    <Modal open onClose={onClose} title={d ? `${d.user.nickname} (${d.user.username})` : '회원 정보'} wide>
      {!d ? <Loading /> : (
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat icon="⭐" label="레벨" value={d.user.level} /><Stat icon="🪙" label="코인" value={d.user.coins} />
            <Stat icon="⚔️" label="전적" value={`${d.user.stats.wins}승 ${d.user.stats.losses}패`} /><Stat icon="🖌️" label="보유 무기" value={d.weapons} />
          </div>
          <p>상태: <StatusPill u={d.user} /> {d.user.statusReason && <span className="text-dim">사유: {d.user.statusReason}</span>}</p>
          <p className="text-xs text-dim">🔒 비밀번호는 암호화되어 있어 운영진도 볼 수 없어요. 재설정은 "신고·문의 관리 → 비밀번호 요청"에서 임시 코드로 처리해요.</p>

          <div className="space-y-2 rounded-xl bg-white/5 p-3">
            <Field label="처리 사유 (기록에 남아요)" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            {can(me, 'users.suspend') && (
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs">정지 일수<input type="number" min={1} max={can(me, 'users.ban') ? 365 : 7} value={form.days} onChange={(e) => setForm({ ...form, days: Number(e.target.value) })} className="ml-2 h-9 w-20 rounded-lg bg-black/30 px-2" /></label>
                <Button size="sm" variant="danger" onClick={() => act(() => api.post(`/admin/users/${id}/suspend`, { days: form.days, reason: form.reason }), '계정을 정지했어요.', refresh)}>정지</Button>
                {can(me, 'users.ban') && <Button size="sm" variant="danger" onClick={() => act(() => api.post(`/admin/users/${id}/ban`, { reason: form.reason }), '영구 차단했어요.', refresh)}>영구 차단</Button>}
                <Button size="sm" variant="secondary" onClick={() => act(() => api.post(`/admin/users/${id}/restore`), '정지·차단을 풀었어요.', refresh)}>해제</Button>
              </div>
            )}
            {can(me, 'users.economy') && (
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs">코인(+지급 / -회수)<input type="number" value={form.coins} onChange={(e) => setForm({ ...form, coins: Number(e.target.value) })} className="ml-2 h-9 w-28 rounded-lg bg-black/30 px-2" /></label>
                <Button size="sm" onClick={() => act(() => api.post(`/admin/users/${id}/coins`, { amount: form.coins, reason: form.reason }), '코인을 반영했어요.', refresh)}>코인 반영</Button>
                <label className="text-xs">레벨<input type="number" min={1} max={99} value={form.level || d.user.level} onChange={(e) => setForm({ ...form, level: Number(e.target.value) })} className="ml-2 h-9 w-20 rounded-lg bg-black/30 px-2" /></label>
                <Button size="sm" variant="secondary" onClick={() => act(() => api.post(`/admin/users/${id}/xp`, { level: form.level || d.user.level, reason: form.reason }), '레벨을 조정했어요.', refresh)}>레벨 조정</Button>
              </div>
            )}
            {can(me, 'users.role') && (
              <div className="flex flex-wrap gap-1.5">
                {ROLES.map((r) => <Button key={r} size="sm" variant={d.user.role === r ? 'primary' : 'secondary'} onClick={() => act(() => api.post(`/admin/users/${id}/role`, { role: r }), `${ROLE_NAMES[r]}로 바꿨어요.`, refresh)}>{ROLE_NAMES[r]}</Button>)}
              </div>
            )}
          </div>

          <details><summary className="cursor-pointer font-bold">🪙 코인 기록</summary>
            {d.coins.map((c) => <p key={c.id} className="py-0.5 text-xs"><b className={c.amount > 0 ? 'text-ok' : 'text-bad'}>{c.amount > 0 ? '+' : ''}{c.amount}</b> → {c.balanceAfter} · {c.reason} · {fmt(c.createdAt)}</p>)}
          </details>
          <details><summary className="cursor-pointer font-bold">🔑 로그인 기록</summary>
            {d.logins.map((l) => <p key={l.id} className="py-0.5 text-xs">{l.success ? (l.suspicious ? '⚠️' : '✅') : '❌'} {l.ip} · {l.userAgent} · {fmt(l.createdAt)}</p>)}
          </details>
          <details><summary className="cursor-pointer font-bold">🚨 받은 신고 ({d.reports.length})</summary>
            {d.reports.map((r) => <p key={r.id} className="py-0.5 text-xs">{r.reason} · {r.reporter.nickname} · {r.status} · {fmt(r.createdAt)}</p>)}
          </details>
          <details><summary className="cursor-pointer font-bold">📝 운영 처리 기록</summary>
            {d.adminActs.map((a) => <p key={a.id} className="py-0.5 text-xs"><b>{a.admin.nickname}</b> {a.action} {a.detail && `(${a.detail})`} · {fmt(a.createdAt)}</p>)}
          </details>
        </div>
      )}
    </Modal>
  )
}

// ── weapons ──
export function AdminWeapons() {
  const me = useMe()
  const qc = useQueryClient()
  const [filter, setFilter] = useState<'all' | 'hidden' | 'deleted'>('all')
  const [q, setQ] = useState('')
  const [p, setP] = useState(1)
  const list = useQuery({ queryKey: ['admin', 'weapons', filter, q, p], queryFn: () => api.get<{ rows: { id: number; name: string; type: WeaponType; owner: string; previewPng: string; hidden: boolean; deleted: boolean; createdAt: string; stats: Record<string, number> }[]; pages: number }>(`/admin/weapons?page=${p}&filter=${filter}&q=${encodeURIComponent(q)}`) })
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'weapons'] })
  return (
    <Section title="⚔️ 무기 관리">
      <div className="mb-3 flex flex-wrap gap-2">
        <Tabs value={filter} onChange={(v) => { setFilter(v); setP(1) }} items={[{ value: 'all', label: '전체' }, { value: 'hidden', label: '숨김' }, { value: 'deleted', label: '삭제됨' }]} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="무기 이름·제작자 검색" className="h-10 flex-1 rounded-xl border border-white/15 bg-black/30 px-3" />
      </div>
      {!list.data ? <Loading /> : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {list.data.rows.map((w) => (
            <div key={w.id} className={cx('overflow-hidden rounded-xl border border-white/10 bg-white/5', w.hidden && 'opacity-60')}>
              <img src={w.previewPng} alt="" className="aspect-square w-full bg-white object-contain" />
              <div className="space-y-1 p-2 text-xs">
                <p className="truncate font-bold">{w.name}</p>
                <p className="text-dim">{WEAPON_INFO[w.type]?.emoji} {w.owner} · #{w.id}</p>
                <p className="font-num text-[10px] text-faint">공{w.stats.attack} 속{w.stats.speed} 사{w.stats.range} 방{w.stats.defense}</p>
                {!w.deleted && <Button size="sm" variant="secondary" className="w-full" onClick={() => act(() => api.post(`/admin/weapons/${w.id}/hide`, { hidden: !w.hidden, reason: '운영 판단' }), w.hidden ? '숨김을 풀었어요.' : '무기를 숨겼어요.', refresh)}>{w.hidden ? '숨김 해제' : '숨기기'}</Button>}
                {can(me, 'weapons.delete') && <Button size="sm" variant={w.deleted ? 'ok' : 'danger'} className="w-full" onClick={() => act(() => api.post(`/admin/weapons/${w.id}/delete`, { restore: w.deleted }), w.deleted ? '복구했어요.' : '삭제했어요.', refresh)}>{w.deleted ? '복구' : '삭제'}</Button>}
              </div>
            </div>
          ))}
        </div>
      )}
      <Pager page={p} pages={list.data?.pages ?? 1} onChange={setP} />
    </Section>
  )
}

// ── shop ──
interface Item { id: string; category: string; slot: string | null; name: string; description: string; price: number; onSale: boolean; limited: boolean; stock: number | null; sold: number; effect: Record<string, unknown>; sortOrder: number }

export function AdminShop() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'items' | 'purchases'>('items')
  const items = useQuery({ queryKey: ['admin', 'items'], queryFn: () => api.get<Item[]>('/admin/items') })
  const purchases = useQuery({ queryKey: ['admin', 'purchases'], queryFn: () => api.get<{ id: number; user: string; item: string; price: number; createdAt: string; refundedAt: string | null; refundReason: string | null }[]>('/admin/purchases'), enabled: tab === 'purchases' })
  const [edit, setEdit] = useState<Partial<Item> & { isNew?: boolean } | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'items'] })
  return (
    <Section title="🛒 상점 관리" right={<Button size="sm" onClick={() => setEdit({ isNew: true, category: 'COSMETIC', price: 500, onSale: true, effect: {} })}>+ 새 상품</Button>}>
      <Tabs value={tab} onChange={setTab} items={[{ value: 'items', label: '상품' }, { value: 'purchases', label: '구매·환불 기록' }]} />
      <div className="mt-3">
        {tab === 'items' ? !items.data ? <Loading /> : (
          <Table head={['ID', '분류', '이름', '가격', '판매', '한정/재고', '판매량', '']}>
            {items.data.map((i) => (
              <tr key={i.id}>
                <td className="px-3 py-2 font-num text-xs">{i.id}</td><td className="px-3 py-2 text-xs">{i.category}{i.slot && `/${i.slot}`}</td><td className="px-3 py-2 font-bold">{i.name}</td>
                <td className="px-3 py-2 font-num">{i.price.toLocaleString()}</td>
                <td className="px-3 py-2">{i.onSale ? <Pill className="bg-ok/30 text-ok">판매 중</Pill> : <Pill className="bg-white/10 text-dim">중지</Pill>}</td>
                <td className="px-3 py-2 text-xs">{i.limited ? '한정' : '-'} {i.stock !== null && `/ ${i.stock}개`}</td>
                <td className="px-3 py-2 font-num">{i.sold}</td>
                <td className="px-3 py-2"><div className="flex gap-1">
                  <Button size="sm" variant="secondary" onClick={() => setEdit(i)}>수정</Button>
                  <Button size="sm" variant="secondary" onClick={() => act(() => api.patch(`/admin/items/${i.id}`, { onSale: !i.onSale }), i.onSale ? '판매를 중지했어요.' : '판매를 재개했어요.', refresh)}>{i.onSale ? '중지' : '재개'}</Button>
                </div></td>
              </tr>
            ))}
          </Table>
        ) : !purchases.data ? <Loading /> : (
          <Table head={['#', '회원', '상품', '가격', '구매일', '환불', '']}>
            {purchases.data.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 font-num">{r.id}</td><td className="px-3 py-2">{r.user}</td><td className="px-3 py-2">{r.item}</td><td className="px-3 py-2 font-num">{r.price}</td>
                <td className="px-3 py-2 text-xs">{fmt(r.createdAt)}</td><td className="px-3 py-2 text-xs">{r.refundedAt ? `환불됨 (${r.refundReason})` : '-'}</td>
                <td className="px-3 py-2">{!r.refundedAt && <Button size="sm" variant="danger" onClick={() => {
                  const reason = prompt('환불 사유를 적어 주세요')
                  if (reason) void act(() => api.post(`/admin/purchases/${r.id}/refund`, { reason }), '환불했어요.', () => qc.invalidateQueries({ queryKey: ['admin', 'purchases'] }))
                }}>환불</Button>}</td>
              </tr>
            ))}
          </Table>
        )}
      </div>
      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.isNew ? '새 상품 등록' : `상품 수정: ${edit.name}`}>
          <div className="space-y-2">
            {edit.isNew && <Field label="상품 ID (영문 소문자·숫자·_)" value={edit.id ?? ''} onChange={(e) => setEdit({ ...edit, id: e.target.value })} />}
            <label className="block text-xs font-bold text-dim">분류
              <select value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} className="mt-1 h-10 w-full rounded-xl bg-black/30 px-2">
                {['TOOL', 'COSMETIC', 'PROFILE', 'SLOT'].map((c) => <option key={c} className="bg-panel">{c}</option>)}
              </select>
            </label>
            <Field label="부위 (COSMETIC: hair, hat, top... / PROFILE: frame, title...)" value={edit.slot ?? ''} onChange={(e) => setEdit({ ...edit, slot: e.target.value || null })} />
            <Field label="이름" value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            <Field label="설명" value={edit.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
            <Field label="가격" type="number" value={edit.price ?? 0} onChange={(e) => setEdit({ ...edit, price: Number(e.target.value) })} />
            <Field label="효과 (JSON, 예: {&quot;color&quot;:&quot;#ff0000&quot;})" value={JSON.stringify(edit.effect ?? {})} onChange={(e) => { try { setEdit({ ...edit, effect: JSON.parse(e.target.value) }) } catch { /* typing */ } }} />
            <div className="flex gap-3 text-sm">
              <label><input type="checkbox" checked={edit.limited ?? false} onChange={(e) => setEdit({ ...edit, limited: e.target.checked })} /> 한정 상품</label>
              <label>재고 <input type="number" value={edit.stock ?? ''} onChange={(e) => setEdit({ ...edit, stock: e.target.value === '' ? null : Number(e.target.value) })} className="w-20 rounded bg-black/30 px-2" placeholder="무제한" /></label>
            </div>
            <div className="flex gap-2 pt-2">
              {!edit.isNew && <Button variant="danger" onClick={() => act(() => api.del(`/admin/items/${edit.id}`), '상품을 삭제했어요.', () => { setEdit(null); return refresh() })}>삭제</Button>}
              <Button className="flex-1" onClick={() => {
                const { isNew, sold: _s, ...body } = edit as Item & { isNew?: boolean }
                void act(() => (isNew ? api.post('/admin/items', body) : api.patch(`/admin/items/${edit.id}`, { ...body, id: undefined })), '저장했어요.', () => { setEdit(null); return refresh() })
              }}>저장</Button>
            </div>
          </div>
        </Modal>
      )}
    </Section>
  )
}

// ── generic CRUD pages ──
type FieldDef = { key: string; label: string; type: 'text' | 'textarea' | 'number' | 'bool' | 'datetime' | 'select' | 'numbers'; options?: [string, string][] }
const CRUD: Record<string, { title: string; fields: FieldDef[]; columns: (r: Record<string, unknown>) => (string | number)[]; head: string[]; empty: Record<string, unknown> }> = {
  missions: {
    title: '🎯 미션 관리', head: ['제목', '기간', '목표', '보상', '상태'],
    columns: (r) => [String(r.title), String(r.period), `${MISSION_GOAL_NAMES[r.goalType as keyof typeof MISSION_GOAL_NAMES]} ${r.goalCount}회`, `🪙${r.rewardCoins} / XP${r.rewardXp}`, r.active ? '활성' : '비활성'],
    empty: { title: '', period: 'DAILY', goalType: 'PLAY_GAMES', goalCount: 1, rewardCoins: 150, rewardXp: 100, active: true },
    fields: [
      { key: 'title', label: '미션 이름', type: 'text' }, { key: 'description', label: '설명', type: 'text' },
      { key: 'period', label: '기간', type: 'select', options: [['DAILY', '일일'], ['WEEKLY', '주간'], ['EVENT', '이벤트']] },
      { key: 'goalType', label: '목표 종류', type: 'select', options: MISSION_GOALS.map((g) => [g, MISSION_GOAL_NAMES[g]]) },
      { key: 'goalCount', label: '목표 횟수', type: 'number' }, { key: 'rewardCoins', label: '보상 코인', type: 'number' }, { key: 'rewardXp', label: '보상 경험치', type: 'number' },
      { key: 'active', label: '활성화', type: 'bool' }, { key: 'startAt', label: '시작 (선택)', type: 'datetime' }, { key: 'endAt', label: '종료 (선택)', type: 'datetime' }, { key: 'eventId', label: '연결할 이벤트 ID (선택)', type: 'number' },
    ],
  },
  events: {
    title: '🎊 이벤트 관리', head: ['제목', '기간', '코인 배율', '상태'],
    columns: (r) => [String(r.title), `${fmt(r.startAt as string)} ~ ${fmt(r.endAt as string)}`, `x${r.coinBonus}`, r.active ? '활성' : '종료'],
    empty: { title: '', description: '', startAt: new Date().toISOString(), endAt: new Date(Date.now() + 7 * 86400_000).toISOString(), active: true, coinBonus: 1.5, rewardCoins: 0, rewardXp: 0 },
    fields: [
      { key: 'title', label: '이벤트 이름', type: 'text' }, { key: 'description', label: '설명', type: 'textarea' },
      { key: 'startAt', label: '시작', type: 'datetime' }, { key: 'endAt', label: '종료', type: 'datetime' },
      { key: 'coinBonus', label: '전투 코인 배율 (1~5)', type: 'number' }, { key: 'active', label: '활성화', type: 'bool' },
    ],
  },
  notices: {
    title: '📢 공지사항 관리', head: ['제목', '게시 시각', '고정', '전체 알림'],
    columns: (r) => [String(r.title), fmt(r.publishAt as string), r.pinned ? '📌' : '-', r.notifyAll ? (r.notifiedAt ? '보냄' : '예약') : '-'],
    empty: { title: '', body: '', pinned: false, publishAt: new Date().toISOString(), notifyAll: false },
    fields: [
      { key: 'title', label: '제목', type: 'text' }, { key: 'body', label: '내용', type: 'textarea' }, { key: 'pinned', label: '상단 고정', type: 'bool' },
      { key: 'publishAt', label: '게시 시각 (미래로 하면 예약)', type: 'datetime' }, { key: 'notifyAll', label: '게시할 때 전체 사용자에게 알림', type: 'bool' },
    ],
  },
  contests: {
    title: '🎖️ 무기 대회 관리', head: ['제목', '분류', '출품 마감', '투표 마감', '상태'],
    columns: (r) => [String(r.title), String(r.category), fmt(r.submitEndAt as string), fmt(r.voteEndAt as string), String(r.status)],
    empty: { title: '', category: 'creative', description: '', submitStartAt: new Date().toISOString(), submitEndAt: new Date(Date.now() + 3 * 86400_000).toISOString(), voteEndAt: new Date(Date.now() + 6 * 86400_000).toISOString(), rewards: [1000, 600, 300] },
    fields: [
      { key: 'title', label: '대회 이름', type: 'text' },
      { key: 'category', label: '분류', type: 'select', options: [['cool', '가장 멋진'], ['creative', '가장 창의적인'], ['cute', '가장 귀여운'], ['unique', '가장 독특한'], ['weekly', '주간'], ['event', '특별 이벤트']] },
      { key: 'description', label: '설명', type: 'textarea' }, { key: 'submitStartAt', label: '출품 시작', type: 'datetime' }, { key: 'submitEndAt', label: '출품 마감(=투표 시작)', type: 'datetime' },
      { key: 'voteEndAt', label: '투표 마감(=결과 발표)', type: 'datetime' }, { key: 'rewards', label: '순위별 상금 (쉼표로, 예: 1000,600,300)', type: 'numbers' },
    ],
  },
}

const toLocal = (iso: unknown) => (iso ? new Date(new Date(iso as string).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '')

export function AdminCrud({ kind }: { kind: keyof typeof CRUD }) {
  const def = CRUD[kind]
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['admin', kind], queryFn: () => api.get<Record<string, unknown>[]>(`/admin/${kind}`) })
  const [edit, setEdit] = useState<Record<string, unknown> | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', kind] })

  function save() {
    const body: Record<string, unknown> = {}
    for (const f of def.fields) {
      const v = edit![f.key]
      if (f.type === 'datetime') body[f.key] = v ? new Date(v as string).toISOString() : null
      else if (f.type === 'number') body[f.key] = v === '' || v === null || v === undefined ? (f.key === 'eventId' ? null : 0) : Number(v)
      else body[f.key] = v
    }
    if (kind === 'missions' && body.eventId === 0) body.eventId = null
    const id = edit!.id
    void act(() => (id ? api.patch(`/admin/${kind}/${id}`, body) : api.post(`/admin/${kind}`, body)), '저장했어요.', () => { setEdit(null); return refresh() })
  }

  return (
    <Section title={def.title} right={<Button size="sm" onClick={() => setEdit({ ...def.empty })}>+ 새로 만들기</Button>}>
      {!list.data ? <Loading /> : !list.data.length ? <p className="text-dim">아직 없어요.</p> : (
        <Table head={[...def.head, '']}>
          {list.data.map((r) => (
            <tr key={String(r.id)}>
              {def.columns(r).map((c, i) => <td key={i} className="px-3 py-2">{c}</td>)}
              <td className="px-3 py-2"><div className="flex gap-1">
                <Button size="sm" variant="secondary" onClick={() => setEdit({ ...r })}>수정</Button>
                <Button size="sm" variant="danger" onClick={() => confirm('정말 삭제할까요?') && act(() => api.del(`/admin/${kind}/${r.id}`), '삭제했어요.', refresh)}>삭제</Button>
              </div></td>
            </tr>
          ))}
        </Table>
      )}
      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.id ? '수정' : '새로 만들기'} wide>
          <div className="grid gap-2 sm:grid-cols-2">
            {def.fields.map((f) => (
              <label key={f.key} className={cx('block text-xs font-bold text-dim', f.type === 'textarea' && 'sm:col-span-2')}>
                {f.label}
                {f.type === 'textarea' ? <textarea rows={5} value={String(edit[f.key] ?? '')} onChange={(e) => setEdit({ ...edit, [f.key]: e.target.value })} className="mt-1 w-full rounded-xl bg-black/30 p-2 text-sm text-text" />
                  : f.type === 'bool' ? <input type="checkbox" checked={Boolean(edit[f.key])} onChange={(e) => setEdit({ ...edit, [f.key]: e.target.checked })} className="ml-2 size-5 align-middle" />
                  : f.type === 'select' ? <select value={String(edit[f.key] ?? '')} onChange={(e) => setEdit({ ...edit, [f.key]: e.target.value })} className="mt-1 h-10 w-full rounded-xl bg-black/30 px-2 text-sm text-text">{f.options!.map(([v, l]) => <option key={v} value={v} className="bg-panel">{l}</option>)}</select>
                  : f.type === 'datetime' ? <input type="datetime-local" value={toLocal(edit[f.key])} onChange={(e) => setEdit({ ...edit, [f.key]: e.target.value })} className="mt-1 h-10 w-full rounded-xl bg-black/30 px-2 text-sm text-text" />
                  : f.type === 'numbers' ? <input value={(edit[f.key] as number[] | undefined)?.join(',') ?? ''} onChange={(e) => setEdit({ ...edit, [f.key]: e.target.value.split(',').map((x) => Number(x.trim())).filter((x) => !Number.isNaN(x)) })} className="mt-1 h-10 w-full rounded-xl bg-black/30 px-2 text-sm text-text" />
                  : <input type={f.type === 'number' ? 'number' : 'text'} step="any" value={String(edit[f.key] ?? '')} onChange={(e) => setEdit({ ...edit, [f.key]: e.target.value })} className="mt-1 h-10 w-full rounded-xl bg-black/30 px-2 text-sm text-text" />}
              </label>
            ))}
          </div>
          <Button className="mt-4 w-full" onClick={save}>저장</Button>
        </Modal>
      )}
    </Section>
  )
}

// ── game management ──
export function AdminGame() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['admin', 'game'], queryFn: () => api.get<{
    rooms: { code: string; status: string; isPublic: boolean; mapId: string; members: string[] }[]
    battles: { matchId: number; mode: string; mapId: string; difficulty: string | null; time: number; score: { RED: number; BLUE: number }; players: string[] }[]
    battle: { durationSec: number; respawn: boolean; enabledMaps: string[]; maxFriendRewardsCount: number }
    rewards: RewardConfig
  }>('/admin/game'), refetchInterval: 5000 })
  const [battle, setBattle] = useState<null | { durationSec: number; respawn: boolean; enabledMaps: string[]; maxFriendRewardsCount: number }>(null)
  const [rewards, setRewards] = useState<RewardConfig | null>(null)
  if (!q.data) return <Loading />
  const b = battle ?? q.data.battle
  const r = rewards ?? q.data.rewards
  const R_LABELS: [Exclude<keyof RewardConfig, 'aiMultiplier'>, string][] = [['participateCoins', '참여 코인'], ['participateXp', '참여 XP'], ['winCoins', '승리 코인'], ['winXp', '승리 XP'], ['lossCoins', '패배 코인'], ['lossXp', '패배 XP'], ['drawCoins', '무승부 코인'], ['drawXp', '무승부 XP'], ['friendPlayXp', '친구와 플레이 XP'], ['friendAddCoins', '친구 추가 코인'], ['firstLoginCoins', '첫 로그인 코인'], ['tutorialCoins', '튜토리얼 코인']]
  return (
    <>
      <Section title="🔥 진행 중인 전투">
        {!q.data.battles.length ? <p className="text-sm text-dim">진행 중인 전투가 없어요.</p> : (
          <Table head={['경기', '모드', '맵', '시간', '점수', '참가자', '']}>
            {q.data.battles.map((x) => (
              <tr key={x.matchId}>
                <td className="px-3 py-2 font-num">#{x.matchId}</td><td className="px-3 py-2">{x.mode}{x.difficulty && ` (${x.difficulty})`}</td><td className="px-3 py-2">{MAPS[x.mapId]?.name}</td>
                <td className="px-3 py-2 font-num">{x.time}s</td><td className="px-3 py-2 font-num">{x.score.RED} : {x.score.BLUE}</td><td className="px-3 py-2 text-xs">{x.players.join(', ')}</td>
                <td className="px-3 py-2"><Button size="sm" variant="danger" onClick={() => confirm('보상 없이 강제 종료할까요?') && act(() => api.post(`/admin/battles/${x.matchId}/end`), '강제 종료했어요.', () => qc.invalidateQueries({ queryKey: ['admin', 'game'] }))}>강제 종료</Button></td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
      <Section title="🏠 방 목록">
        {!q.data.rooms.length ? <p className="text-sm text-dim">열린 방이 없어요.</p> : (
          <Table head={['코드', '상태', '공개', '맵', '참가자']}>
            {q.data.rooms.map((x) => <tr key={x.code}><td className="px-3 py-2 font-num">{x.code}</td><td className="px-3 py-2">{x.status}</td><td className="px-3 py-2">{x.isPublic ? '공개' : '비공개'}</td><td className="px-3 py-2">{MAPS[x.mapId]?.name ?? '무작위'}</td><td className="px-3 py-2 text-xs">{x.members.join(', ')}</td></tr>)}
          </Table>
        )}
      </Section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="⏱️ 전투 설정">
          <div className="space-y-2 rounded-2xl bg-white/5 p-3 text-sm">
            <Field label="전투 시간 (초, 60~900)" type="number" value={b.durationSec} onChange={(e) => setBattle({ ...b, durationSec: Number(e.target.value) })} />
            <Field label="친구 추가 보상 최대 인원" type="number" value={b.maxFriendRewardsCount} onChange={(e) => setBattle({ ...b, maxFriendRewardsCount: Number(e.target.value) })} />
            <p className="text-xs font-bold text-dim">사용할 맵</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(MAPS).map((m) => (
                <button key={m} onClick={() => setBattle({ ...b, enabledMaps: b.enabledMaps.includes(m) ? b.enabledMaps.filter((x) => x !== m) : [...b.enabledMaps, m] })} className={cx('rounded-lg border-2 px-2 py-1 font-bold', b.enabledMaps.includes(m) ? 'border-accent bg-accent/20' : 'border-white/10')}>{MAPS[m].emoji} {MAPS[m].name}</button>
              ))}
            </div>
            <Button className="w-full" onClick={() => act(() => api.put('/admin/config/battle', b), '전투 설정을 저장했어요.', () => { setBattle(null); return qc.invalidateQueries({ queryKey: ['admin', 'game'] }) })}>저장</Button>
          </div>
        </Section>
        <Section title="🪙 보상 설정">
          <div className="space-y-2 rounded-2xl bg-white/5 p-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              {R_LABELS.map(([k, l]) => <Field key={k} label={l} type="number" value={r[k]} onChange={(e) => setRewards({ ...r, [k]: Number(e.target.value) })} />)}
            </div>
            <p className="text-xs font-bold text-dim">AI 난이도별 보상 배율</p>
            <div className="grid grid-cols-5 gap-1">
              {AI_DIFFICULTIES.map((d) => <Field key={d} label={d} type="number" step="0.1" value={r.aiMultiplier[d]} onChange={(e) => setRewards({ ...r, aiMultiplier: { ...r.aiMultiplier, [d]: Number(e.target.value) } })} />)}
            </div>
            <Button className="w-full" onClick={() => act(() => api.put('/admin/config/rewards', r), '보상 설정을 저장했어요.', () => { setRewards(null); return qc.invalidateQueries({ queryKey: ['admin', 'game'] }) })}>저장</Button>
          </div>
        </Section>
      </div>
    </>
  )
}

// ── reports, support tickets, password resets ──
export function AdminReports() {
  const me = useMe()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'reports' | 'tickets' | 'resets'>('reports')
  const [status, setStatus] = useState('PENDING')
  const reports = useQuery({ queryKey: ['admin', 'reports', status], queryFn: () => api.get<{ id: number; targetType: string; targetId: string; targetNickname: string | null; reason: string; detail: string; context: string; status: string; reporter: string; handler: string | null; resolution: string | null; createdAt: string }[]>(`/admin/reports?status=${status}`), enabled: tab === 'reports' })
  const tickets = useQuery({ queryKey: ['admin', 'tickets'], queryFn: () => api.get<{ id: number; category: string; title: string; body: string; contact: string; status: string; reply: string | null; user: { nickname: string } | null; createdAt: string }[]>('/admin/tickets'), enabled: tab === 'tickets' })
  const resets = useQuery({ queryKey: ['admin', 'resets'], queryFn: () => api.get<{ id: number; status: string; message: string; user: { username: string; nickname: string }; createdAt: string }[]>('/admin/resets'), enabled: tab === 'resets' && can(me, 'users.password') })
  const [code, setCode] = useState<string | null>(null)
  return (
    <Section title="🚨 신고·문의 관리">
      <Tabs value={tab} onChange={setTab} items={[{ value: 'reports', label: '신고' }, { value: 'tickets', label: '고객 문의' }, ...(can(me, 'users.password') ? [{ value: 'resets' as const, label: '비밀번호 요청' }] : [])]} />
      <div className="mt-3 space-y-2">
        {tab === 'reports' && (
          <>
            <div className="flex gap-1.5">{['PENDING', 'REVIEWING', 'RESOLVED', 'REJECTED'].map((s) => <Button key={s} size="sm" variant={status === s ? 'primary' : 'secondary'} onClick={() => setStatus(s)}>{{ PENDING: '대기', REVIEWING: '검토 중', RESOLVED: '처리 완료', REJECTED: '기각' }[s]}</Button>)}</div>
            {!reports.data ? <Loading /> : !reports.data.length ? <p className="text-dim">신고가 없어요.</p> : reports.data.map((r) => (
              <div key={r.id} className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm">
                <p><Pill className="bg-bad/30 text-bad">{REPORT_TYPES[r.targetType]}</Pill> <b>{r.reason}</b> → {r.targetNickname ?? r.targetId} <span className="text-dim">· 신고자 {r.reporter} · {fmt(r.createdAt)}</span></p>
                {r.detail && <p className="mt-1 text-dim">{r.detail}</p>}
                {r.context && <p className="mt-1 rounded bg-black/30 p-2 text-xs">"{r.context}"</p>}
                {r.handler && <p className="mt-1 text-xs text-faint">처리: {r.handler} · {r.resolution}</p>}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(['REVIEWING', 'RESOLVED', 'REJECTED'] as const).map((s) => (
                    <Button key={s} size="sm" variant="secondary" onClick={() => {
                      const resolution = s === 'REVIEWING' ? '' : prompt('처리 내용을 적어 주세요 (예: 3일 정지)') ?? ''
                      void act(() => api.patch(`/admin/reports/${r.id}`, { status: s, resolution }), '처리했어요.', () => qc.invalidateQueries({ queryKey: ['admin', 'reports'] }))
                    }}>{{ REVIEWING: '검토 중으로', RESOLVED: '처리 완료', REJECTED: '기각' }[s]}</Button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
        {tab === 'tickets' && (!tickets.data ? <Loading /> : !tickets.data.length ? <p className="text-dim">문의가 없어요.</p> : tickets.data.map((t) => (
          <div key={t.id} className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm">
            <p><Pill>{t.category}</Pill> <b>{t.title}</b> <span className="text-dim">· {t.user?.nickname ?? `비회원 (${t.contact || '연락처 없음'})`} · {fmt(t.createdAt)}</span></p>
            <p className="mt-1 whitespace-pre-wrap text-dim">{t.body}</p>
            {t.reply ? <p className="mt-2 rounded bg-ok/10 p-2">💬 {t.reply}</p> : (
              <Button size="sm" className="mt-2" onClick={() => {
                const reply = prompt('답변을 적어 주세요')
                if (reply) void act(() => api.post(`/admin/tickets/${t.id}/reply`, { reply }), '답변했어요.', () => qc.invalidateQueries({ queryKey: ['admin', 'tickets'] }))
              }}>답변하기</Button>
            )}
          </div>
        )))}
        {tab === 'resets' && (!resets.data ? <Loading /> : !resets.data.length ? <p className="text-dim">요청이 없어요.</p> : resets.data.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm">
            <span className="flex-1"><b>{r.user.nickname}</b> ({r.user.username}) · {r.message || '메시지 없음'} · {fmt(r.createdAt)} · <Pill>{r.status}</Pill></span>
            {r.status === 'PENDING' && <>
              <Button size="sm" onClick={async () => {
                try {
                  const x = await api.post<{ code: string }>(`/admin/resets/${r.id}/issue`)
                  setCode(x.code)
                  void qc.invalidateQueries({ queryKey: ['admin', 'resets'] })
                } catch (e) { toast.error(errorMessage(e)) }
              }}>임시 코드 발급</Button>
              <Button size="sm" variant="secondary" onClick={() => act(() => api.post(`/admin/resets/${r.id}/reject`), '거절했어요.', () => qc.invalidateQueries({ queryKey: ['admin', 'resets'] }))}>거절</Button>
            </>}
          </div>
        )))}
      </div>
      <Modal open={code !== null} onClose={() => setCode(null)} title="임시 코드 발급됨">
        <p className="mb-3 text-sm text-dim">이 코드를 고객지원 답변 등으로 본인에게만 전달하세요. 24시간 동안, 한 번만 쓸 수 있어요. 다시 볼 수 없어요.</p>
        <p className="select-all rounded-xl bg-accent/10 py-3 text-center font-mono text-2xl tracking-widest text-accent">{code}</p>
        <Button className="mt-4 w-full" onClick={() => setCode(null)}>확인</Button>
      </Modal>
    </Section>
  )
}

// ── mail ──
export function AdminMail() {
  const [f, setF] = useState({ target: 'one', userId: '', type: 'GIFT', title: '', body: '', coins: 0, xp: 0, itemId: '', days: 30 })
  const [busy, setBusy] = useState(false)
  return (
    <Section title="📮 우편 보내기">
      <div className="max-w-xl space-y-2 rounded-2xl bg-white/5 p-4 text-sm">
        <div className="flex gap-2">{[['one', '한 명에게'], ['all', '전체 사용자에게']].map(([v, l]) => <Button key={v} size="sm" variant={f.target === v ? 'primary' : 'secondary'} onClick={() => setF({ ...f, target: v })}>{l}</Button>)}</div>
        {f.target === 'one' && <Field label="받는 회원 ID (회원 관리에서 확인)" value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })} />}
        <label className="block text-xs font-bold text-dim">종류<select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} className="mt-1 h-10 w-full rounded-xl bg-black/30 px-2">{[['GIFT', '선물'], ['REWARD', '보상'], ['EVENT', '이벤트'], ['ADMIN', '운영팀']].map(([v, l]) => <option key={v} value={v} className="bg-panel">{l}</option>)}</select></label>
        <Field label="제목" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <label className="block text-xs font-bold text-dim">내용<textarea rows={3} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} className="mt-1 w-full rounded-xl bg-black/30 p-2 text-text" /></label>
        <div className="grid grid-cols-3 gap-2">
          <Field label="코인" type="number" value={f.coins} onChange={(e) => setF({ ...f, coins: Number(e.target.value) })} />
          <Field label="경험치" type="number" value={f.xp} onChange={(e) => setF({ ...f, xp: Number(e.target.value) })} />
          <Field label="보관 일수" type="number" value={f.days} onChange={(e) => setF({ ...f, days: Number(e.target.value) })} />
        </div>
        <Field label="아이템 ID (선택, 예: cos_hat_crown)" value={f.itemId} onChange={(e) => setF({ ...f, itemId: e.target.value })} />
        <Button className="w-full" loading={busy} onClick={async () => {
          if (f.target === 'all' && !confirm('전체 사용자에게 보낼까요?')) return
          setBusy(true)
          await act(() => api.post('/admin/mail', { userId: f.target === 'one' ? Number(f.userId) : null, type: f.type, title: f.title, body: f.body, coins: f.coins, xp: f.xp, itemId: f.itemId || null, days: f.days }), '우편을 보냈어요.')
          setBusy(false)
        }}>보내기</Button>
      </div>
    </Section>
  )
}

// ── server status, logs, staff ──
export function AdminServer() {
  const me = useMe()
  const s = useQuery({ queryKey: ['admin', 'server'], queryFn: () => api.get<{ uptimeSec: number; node: string; platform: string; memMb: number; freeMemMb: number; dbMs: number; dbMb: number; sockets: number; online: number; rooms: number; battles: number; ai: { model: string; available: boolean } }>('/admin/server'), refetchInterval: 10_000 })
  const logs = useQuery({ queryKey: ['admin', 'logs'], queryFn: () => api.get<{ id: number; admin: string; action: string; targetType: string | null; targetId: string | null; detail: string; createdAt: string }[]>('/admin/logs'), enabled: can(me, 'logs') })
  const staff = useQuery({ queryKey: ['admin', 'staff'], queryFn: () => api.get<UserRow[]>('/admin/staff'), enabled: can(me, 'users.role') })
  return (
    <>
      <Section title="🖥️ 서버 상태">
        {!s.data ? <Loading /> : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat icon="⏱️" label="가동 시간" value={`${Math.floor(s.data.uptimeSec / 3600)}시간 ${Math.floor((s.data.uptimeSec % 3600) / 60)}분`} />
            <Stat icon="💾" label="서버 메모리" value={`${s.data.memMb}MB`} /><Stat icon="🗄️" label="DB 응답 / 크기" value={`${s.data.dbMs}ms / ${s.data.dbMb}MB`} />
            <Stat icon="🔌" label="실시간 연결" value={s.data.sockets} /><Stat icon="🟢" label="접속자" value={s.data.online} />
            <Stat icon="🏠" label="방 / 전투" value={`${s.data.rooms} / ${s.data.battles}`} />
            <Stat icon="🤖" label={`로컬 AI (${s.data.ai.model})`} value={s.data.ai.available ? '정상' : '꺼짐'} />
            <Stat icon="🧩" label="Node / OS" value={s.data.node} />
          </div>
        )}
      </Section>
      {can(me, 'users.role') && (
        <Section title="👮 운영진">
          {!staff.data ? <Loading /> : (
            <Table head={['ID', '아이디', '닉네임', '등급', '최근 접속']}>
              {staff.data.map((u) => <tr key={u.id}><td className="px-3 py-2 font-num">{u.id}</td><td className="px-3 py-2">{u.username}</td><td className="px-3 py-2">{u.nickname}</td><td className="px-3 py-2"><Pill>{ROLE_NAMES[u.role as keyof typeof ROLE_NAMES]}</Pill></td><td className="px-3 py-2 text-xs">{fmt(u.lastLoginAt)}</td></tr>)}
            </Table>
          )}
          <p className="mt-1 text-xs text-dim">등급은 "회원 관리"에서 회원을 눌러 바꿀 수 있어요. 최고 관리자 &gt; 관리자 &gt; 운영자 &gt; 모더레이터 순이에요.</p>
        </Section>
      )}
      {can(me, 'logs') && (
        <Section title="📝 관리자 활동 기록">
          {!logs.data ? <Loading /> : (
            <Table head={['시각', '운영진', '작업', '대상', '내용']}>
              {logs.data.map((l) => <tr key={l.id}><td className="px-3 py-2 text-xs">{fmt(l.createdAt)}</td><td className="px-3 py-2 text-xs">{l.admin}</td><td className="px-3 py-2 font-bold">{l.action}</td><td className="px-3 py-2 text-xs">{l.targetType} {l.targetId}</td><td className="max-w-xs truncate px-3 py-2 text-xs text-dim">{l.detail}</td></tr>)}
            </Table>
          )}
        </Section>
      )}
    </>
  )
}
