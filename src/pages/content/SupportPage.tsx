import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Button, Field, Pill, ScreenHeader, Tabs } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { useAuth } from '@/stores/auth'
import { toast } from '@/stores/toast'

const FAQ = [
  ['비밀번호를 잊어버렸어요', '로그인 화면의 "비밀번호를 잊었어요"에서 가입할 때 받은 복구 코드로 바꿀 수 있어요. 복구 코드도 없다면 "운영팀에 요청하기"를 이용해 주세요.'],
  ['일반 볼펜으로 그린 선을 지울 수 없어요', '일반 볼펜은 지울 수 없는 펜이에요. 방금(10초 안에) 그린 선 하나는 되돌릴 수 있고, 상점에서 지우개(400코인)를 사면 자유롭게 지울 수 있어요.'],
  ['무기 종류가 이상하게 나와요', '3D 변환 화면에서 무기 종류를 직접 바꿀 수 있어요. "모양 보정하기"로 방향과 두께도 고칠 수 있어요.'],
  ['전투 보상을 못 받았어요', '전투에 거의 참여하지 않았거나(가만히 있기), 중간에 나가거나, 15초 안에 끝난 판은 보상이 없어요.'],
  ['코인은 어떻게 모아요?', '전투, 일일·주간 미션, 출석 체크, 친구 추가, 무기 대회 상금으로 모을 수 있어요.'],
  ['친구와 같이 하고 싶어요', '플레이 → 친구와 플레이에서 방을 만들고 6자리 코드를 알려 주세요. 친구 목록에서 바로 초대할 수도 있어요.'],
]
const CATS = [['ACCOUNT', '계정'], ['BUG', '오류 신고'], ['PAYMENT', '코인·아이템'], ['REPORT', '이용자 신고'], ['IDEA', '건의'], ['ETC', '기타']] as const

export default function SupportPage() {
  const user = useAuth((s) => s.user)
  const [tab, setTab] = useState<'faq' | 'ask' | 'mine'>('faq')
  const [f, setF] = useState({ category: 'BUG', title: '', body: '', contact: '' })
  const [busy, setBusy] = useState(false)
  const mine = useQuery({ queryKey: ['tickets'], queryFn: () => api.get<{ id: number; title: string; status: string; reply: string | null; createdAt: string }[]>('/support/mine'), enabled: tab === 'mine' })

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await api.post('/support', f)
      toast.success('문의가 접수됐어요. 운영팀이 확인하고 답변드릴게요!')
      setF({ category: 'BUG', title: '', body: '', contact: '' })
      setTab(user ? 'mine' : 'faq')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-arena min-h-[100dvh]">
      <ScreenHeader title="고객지원" sub="SUPPORT" />
      <div className="mx-auto max-w-2xl space-y-3 p-4">
        <Tabs value={tab} onChange={setTab} items={[{ value: 'faq', label: '자주 묻는 질문' }, { value: 'ask', label: '문의하기' }, ...(user ? [{ value: 'mine' as const, label: '내 문의' }] : [])]} />
        {tab === 'faq' && FAQ.map(([q, a]) => (
          <details key={q} className="panel cut-lg p-4">
            <summary className="cursor-pointer font-bold">❓ {q}</summary>
            <p className="mt-2 text-sm text-dim">{a}</p>
          </details>
        ))}
        {tab === 'ask' && (
          <form onSubmit={submit} className="panel cut-lg space-y-3 p-4">
            <div className="flex flex-wrap gap-1.5">
              {CATS.map(([v, l]) => (
                <button type="button" key={v} onClick={() => setF({ ...f, category: v })} className={`rounded-xl border-2 px-3 py-1 text-sm font-bold ${f.category === v ? 'border-accent bg-accent/20' : 'border-white/10'}`}>{l}</button>
              ))}
            </div>
            <Field label="제목" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={60} />
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-dim">내용</span>
              <textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} rows={6} maxLength={2000} className="w-full rounded-xl border border-white/20 bg-black/40 p-3 outline-none focus:border-accent" />
            </label>
            {!user && <Field label="답변 받을 연락처 (로그인 안 했을 때)" value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} maxLength={100} />}
            <Button type="submit" className="w-full" loading={busy}>문의 보내기</Button>
          </form>
        )}
        {tab === 'mine' && (mine.data?.length ? mine.data.map((t) => (
          <div key={t.id} className="panel cut-lg p-4">
            <div className="flex items-center gap-2"><b className="flex-1">{t.title}</b><Pill className={t.status === 'ANSWERED' ? 'bg-ok text-white' : 'bg-white/10 text-dim'}>{t.status === 'ANSWERED' ? '답변 완료' : '확인 중'}</Pill></div>
            <p className="text-xs text-faint">{new Date(t.createdAt).toLocaleString('ko-KR')}</p>
            {t.reply && <p className="mt-2 rounded-xl bg-white/5 p-3 text-sm">💬 {t.reply}</p>}
          </div>
        )) : <p className="py-6 text-center text-dim">보낸 문의가 없어요.</p>)}
      </div>
    </div>
  )
}
