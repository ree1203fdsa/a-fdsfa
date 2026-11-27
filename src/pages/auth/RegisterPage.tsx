import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Check, Field, Modal, PasswordField } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { sfx } from '@/lib/sound'
import type { Me } from '@/lib/types'
import { useAuth } from '@/stores/auth'
import { checkNickname, checkPassword, checkUsername } from '@shared/text'
import { AuthLayout } from './AuthLayout'

type Check = { ok: boolean; message: string; value: string } | null

export default function RegisterPage() {
  const nav = useNavigate()
  const setUser = useAuth((s) => s.setUser)
  const [form, setForm] = useState({ username: '', nickname: '', password: '', passwordConfirm: '' })
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [agreePrivacy, setAgreePrivacy] = useState(false)
  const [idCheck, setIdCheck] = useState<Check>(null)
  const [nickCheck, setNickCheck] = useState<Check>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [code, setCode] = useState<string | null>(null)
  const [pending, setPending] = useState<Me | null>(null)
  const [showTerms, setShowTerms] = useState<'terms' | 'privacy' | null>(null)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })

  async function check(kind: 'username' | 'nickname') {
    const value = form[kind].trim().toLowerCase()
    const v = kind === 'username' ? value : form.nickname.trim()
    const local = kind === 'username' ? checkUsername(v) : checkNickname(v)
    const setter = kind === 'username' ? setIdCheck : setNickCheck
    if (local) return setter({ ok: false, message: local, value: v })
    try {
      const r = await api.post<{ available: boolean; message: string }>(`/auth/check-${kind}`, { [kind]: v })
      setter({ ok: r.available, message: r.message, value: v })
    } catch (e) {
      setter({ ok: false, message: errorMessage(e), value: v })
    }
  }

  const username = form.username.trim().toLowerCase()
  const nickname = form.nickname.trim()
  const pwError = form.password ? checkPassword(form.password, username) : null
  const confirmError = form.passwordConfirm && form.password !== form.passwordConfirm ? '비밀번호가 서로 달라요.' : null

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!idCheck?.ok || idCheck.value !== username) return setError('아이디 중복 확인을 해 주세요.')
    if (!nickCheck?.ok || nickCheck.value !== nickname) return setError('닉네임 중복 확인을 해 주세요.')
    if (pwError || confirmError || !form.password) return setError(pwError ?? confirmError ?? '비밀번호를 입력해 주세요.')
    if (!agreeTerms || !agreePrivacy) return setError('필수 항목에 모두 동의해 주세요.')
    setLoading(true)
    try {
      const r = await api.post<{ user: Me; recoveryCode: string }>('/auth/register', {
        username, nickname, password: form.password, passwordConfirm: form.passwordConfirm, agreeTerms, agreePrivacy,
      })
      sfx.success()
      setPending(r.user)
      setCode(r.recoveryCode)
    } catch (err) {
      sfx.error()
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const status = (c: Check, current: string) =>
    c && c.value === current ? <span className={c.ok ? 'text-ok' : 'text-bad'}>{c.ok ? '✓ ' : '✗ '}{c.message}</span> : null

  return (
    <AuthLayout subtitle="회원가입">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field
          label="아이디" autoComplete="username" value={form.username} onChange={set('username')} placeholder="영문 소문자, 숫자 4~16자"
          hint={status(idCheck, username)}
          right={<Button type="button" size="sm" variant="secondary" onClick={() => check('username')}>중복 확인</Button>}
        />
        <Field
          label="닉네임" value={form.nickname} onChange={set('nickname')} placeholder="한글, 영문, 숫자 2~10자"
          hint={status(nickCheck, nickname)}
          right={<Button type="button" size="sm" variant="secondary" onClick={() => check('nickname')}>중복 확인</Button>}
        />
        <PasswordField label="비밀번호" autoComplete="new-password" value={form.password} onChange={set('password')} placeholder="영문+숫자 8자 이상" error={pwError} />
        <PasswordField label="비밀번호 확인" autoComplete="new-password" value={form.passwordConfirm} onChange={set('passwordConfirm')} placeholder="한 번 더 입력하세요" error={confirmError} />
        <div className="flex flex-col gap-2 border border-edge bg-black/30 p-4">
          <Check checked={agreeTerms && agreePrivacy} onChange={(v) => { setAgreeTerms(v); setAgreePrivacy(v) }}>
            <b className="font-bold text-text">전체 동의</b>
          </Check>
          <div className="flex items-center justify-between">
            <Check checked={agreeTerms} onChange={setAgreeTerms}>[필수] 이용약관 동의</Check>
            <button type="button" className="text-sm text-accent underline" onClick={() => setShowTerms('terms')}>보기</button>
          </div>
          <div className="flex items-center justify-between">
            <Check checked={agreePrivacy} onChange={setAgreePrivacy}>[필수] 개인정보 처리 안내 동의</Check>
            <button type="button" className="text-sm text-accent underline" onClick={() => setShowTerms('privacy')}>보기</button>
          </div>
        </div>
        {error && <p className="border-l-4 border-bad bg-bad/10 px-4 py-3 text-sm text-bad">{error}</p>}
        <Button type="submit" size="lg" loading={loading}>가입하기</Button>
        <p className="text-center text-sm text-dim">
          이미 계정이 있나요? <Link to="/login" className="text-accent underline">로그인</Link>
        </p>
      </form>

      <Modal open={showTerms !== null} onClose={() => setShowTerms(null)} title={showTerms === 'terms' ? '이용약관' : '개인정보 처리 안내'}>
        {showTerms === 'terms' ? (
          <div className="space-y-2 text-sm text-dim">
            <p>1. 컬러워즈는 누구나 즐겁게 이용할 수 있는 게임이에요. 다른 사람을 괴롭히거나 나쁜 말을 쓰면 이용이 제한될 수 있어요.</p>
            <p>2. 직접 그린 무기 그림의 저작권은 그린 사람에게 있어요. 게임 안에서 보여주고 대회에 쓰는 것에 동의해 주세요.</p>
            <p>3. 코인과 아이템은 게임 안에서만 쓸 수 있고 현금으로 바꿀 수 없어요.</p>
            <p>4. 부정한 방법(조작, 버그 악용)으로 얻은 보상은 회수될 수 있어요.</p>
          </div>
        ) : (
          <div className="space-y-2 text-sm text-dim">
            <p>• 모으는 정보: 아이디, 닉네임, 암호화된 비밀번호, 접속 기록(IP, 기기 정보), 게임 기록</p>
            <p>• 쓰는 곳: 로그인, 게임 진행, 부정 이용 방지, 고객 문의 처리</p>
            <p>• 보관 기간: 탈퇴할 때까지. 탈퇴하면 아이디와 닉네임은 바로 지워져요.</p>
            <p>• 비밀번호는 암호화되어 운영자도 볼 수 없어요.</p>
          </div>
        )}
        <Button className="mt-5 w-full" onClick={() => setShowTerms(null)}>확인</Button>
      </Modal>

      <Modal open={code !== null} onClose={() => {}} title="🎉 가입을 축하해요!">
        <p className="mb-3 text-dim">아래 <b className="text-text">복구 코드</b>는 비밀번호를 잊었을 때 꼭 필요해요. 지금 한 번만 보여 드리니 사진을 찍거나 적어 두세요.</p>
        <div className="mb-4 select-all border-2 border-dashed border-accent bg-accent/10 text-accent py-4 text-center font-mono text-2xl tracking-widest">{code}</div>
        <Button
          variant="secondary" className="mb-3 w-full"
          onClick={() => {
            if (code) void navigator.clipboard?.writeText(code)
          }}
        >
          📋 복사하기
        </Button>
        <Button
          className="w-full"
          onClick={() => {
            setUser(pending)
            nav('/', { replace: true })
          }}
        >
          적어 뒀어요, 시작하기!
        </Button>
      </Modal>
    </AuthLayout>
  )
}
