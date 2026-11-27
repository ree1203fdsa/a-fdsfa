import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button, Field, PasswordField, Tabs } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { AuthLayout } from './AuthLayout'

export default function ForgotPage() {
  const [tab, setTab] = useState<'code' | 'request'>('code')
  return (
    <AuthLayout subtitle="비밀번호 찾기">
      <Tabs value={tab} onChange={setTab} items={[{ value: 'code', label: '복구 코드로 바꾸기' }, { value: 'request', label: '운영팀에 요청하기' }]} />
      <div className="mt-5">{tab === 'code' ? <CodeReset /> : <RequestReset />}</div>
      <p className="mt-5 text-center text-sm text-dim">
        <Link to="/login" className="text-accent underline">로그인으로 돌아가기</Link>
      </p>
    </AuthLayout>
  )
}

function CodeReset() {
  const [f, setF] = useState({ username: '', code: '', password: '', confirm: '' })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [newCode, setNewCode] = useState<string | null>(null)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })

  async function submit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const r = await api.post<{ recoveryCode: string }>('/auth/recover', f)
      setNewCode(r.recoveryCode)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  if (newCode)
    return (
      <div className="flex flex-col gap-4 text-center">
        <p className="text-5xl">🔓</p>
        <p className="font-display text-xl">비밀번호를 바꿨어요!</p>
        <p className="text-sm text-dim">이전 복구 코드는 이제 못 써요. 새 복구 코드를 적어 두세요.</p>
        <div className="select-all border-2 border-dashed border-accent bg-accent/10 text-accent py-3 font-mono text-xl tracking-widest">{newCode}</div>
        <Link to="/login"><Button className="w-full">로그인하러 가기</Button></Link>
      </div>
    )

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-sm text-dim">가입할 때 받은 복구 코드(또는 운영팀이 보내 준 임시 코드)를 입력하면 새 비밀번호를 만들 수 있어요.</p>
      <Field label="아이디" value={f.username} onChange={set('username')} autoComplete="username" />
      <Field label="복구 코드" value={f.code} onChange={set('code')} placeholder="XXXX-XXXX-XXXX" className="font-mono" />
      <PasswordField label="새 비밀번호" value={f.password} onChange={set('password')} autoComplete="new-password" placeholder="영문+숫자 8자 이상" />
      <PasswordField label="새 비밀번호 확인" value={f.confirm} onChange={set('confirm')} autoComplete="new-password" />
      {error && <p className="border-l-4 border-bad bg-bad/10 px-4 py-3 text-sm text-bad">{error}</p>}
      <Button type="submit" size="lg" loading={loading}>비밀번호 바꾸기</Button>
    </form>
  )
}

function RequestReset() {
  const [f, setF] = useState({ username: '', nickname: '', message: '' })
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await api.post('/auth/reset-request', f)
      setDone(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  if (done)
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-5xl">📮</p>
        <p className="font-display text-xl">요청을 보냈어요</p>
        <p className="text-sm text-dim">아이디와 닉네임이 맞으면 운영팀이 확인한 뒤 고객지원 답변으로 임시 코드를 알려 드려요. 그 코드를 "복구 코드로 바꾸기"에 넣으면 돼요.</p>
      </div>
    )

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-sm text-dim">복구 코드를 잃어버렸다면 운영팀에 요청하세요. 본인 확인을 위해 아이디와 닉네임이 모두 필요해요.</p>
      <Field label="아이디" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
      <Field label="닉네임" value={f.nickname} onChange={(e) => setF({ ...f, nickname: e.target.value })} />
      <Field label="연락받을 방법 / 남길 말 (선택)" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} maxLength={500} />
      {error && <p className="border-l-4 border-bad bg-bad/10 px-4 py-3 text-sm text-bad">{error}</p>}
      <Button type="submit" size="lg" loading={loading}>요청 보내기</Button>
    </form>
  )
}
