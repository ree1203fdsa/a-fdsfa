import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { checkPassword } from '@shared/text'
import { Button, Confirm, cx, Loading, Modal, PasswordField, ScreenHeader, Tabs } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { KEY_ACTIONS, keyLabel, resolveKeys, type KeyAction } from '@/lib/keys'
import type { Settings } from '@/lib/types'
import { useAuth } from '@/stores/auth'
import { toast } from '@/stores/toast'

type Tab = 'general' | 'controls' | 'privacy' | 'account'

export default function SettingsPage() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'general'
  const user = useAuth((s) => s.user)!
  const patchUser = useAuth((s) => s.patch)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const s = user.settings

  // Apply instantly, save to the server shortly after the last change.
  function update(p: Partial<Settings>) {
    const next = { ...s, ...p }
    patchUser({ settings: next })
    setSaving('saving')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        await api.put('/me/settings', p)
        setSaving('saved')
      } catch (e) {
        setSaving('error')
        toast.error('설정을 저장하지 못했어요. ' + errorMessage(e))
      }
    }, 400)
  }

  return (
    <div className="bg-arena min-h-[100dvh]">
      <ScreenHeader
        title="설정"
        sub="SETTINGS"
        right={<span className="text-xs text-dim">{saving === 'saving' ? '저장 중...' : saving === 'saved' ? '✓ 저장됨' : saving === 'error' ? '⚠ 저장 실패' : ''}</span>}
      />
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        <Tabs
          value={tab}
          onChange={(v) => setParams({ tab: v }, { replace: true })}
          items={[
            { value: 'general', label: '🎵 기본' }, { value: 'controls', label: '🎮 조작' },
            { value: 'privacy', label: '🔐 개인정보' }, { value: 'account', label: '👤 계정' },
          ]}
        />
        {tab === 'general' && (
          <Section>
            <Range label="🎵 배경음악" value={s.bgm ?? 60} min={0} max={100} unit="%" onChange={(v) => update({ bgm: v })} />
            <Range label="🔊 효과음" value={s.sfx ?? 80} min={0} max={100} unit="%" onChange={(v) => update({ sfx: v })} />
            <Range label="☀️ 화면 밝기" value={s.brightness ?? 100} min={60} max={140} unit="%" onChange={(v) => update({ brightness: v })} />
            <Choice
              label="🖼️ 그래픽 품질" value={s.quality ?? 'medium'} onChange={(v) => update({ quality: v })}
              options={[['low', '낮음 (빠름)'], ['medium', '보통'], ['high', '높음 (선명)']]}
              hint="휴대폰이나 오래된 컴퓨터가 느리면 '낮음'을 골라 주세요."
            />
            <Choice label="🌐 언어" value={s.language ?? 'ko'} onChange={(v) => v === 'ko' && update({ language: v })} options={[['ko', '한국어'], ['en', 'English (준비 중)']]} disabled={['en']} />
            <Toggle label="🔔 알림 받기" value={s.notifications ?? true} onChange={(v) => update({ notifications: v })} hint="끄면 게임 안 알림 팝업이 뜨지 않아요. (알림 목록에는 계속 쌓여요)" />
          </Section>
        )}
        {tab === 'controls' && (
          <>
            <Section title="🖥️ PC 키 설정">
              <KeyBinder keys={resolveKeys(s.keys)} onChange={(keys) => update({ keys })} />
              <p className="text-xs text-dim">마우스 왼쪽: 공격 · 마우스 오른쪽: 방어/조준 · 마우스 이동: 카메라 회전</p>
              <Range label="🖱️ 카메라 감도" value={Math.round((s.sensitivity ?? 1) * 100)} min={20} max={300} unit="%" onChange={(v) => update({ sensitivity: v / 100 })} />
              <Toggle label="🏃 자동 달리기" value={s.autoRun ?? false} onChange={(v) => update({ autoRun: v })} hint="켜면 Shift를 누르지 않아도 항상 달려요." />
            </Section>
            <Section title="📱 모바일 버튼">
              <Range label="버튼 크기" value={Math.round((s.mobileButtonScale ?? 1) * 100)} min={70} max={150} unit="%" onChange={(v) => update({ mobileButtonScale: v / 100 })} />
              <Choice label="공격 버튼 위치" value={s.mobileLayout ?? 'right'} onChange={(v) => update({ mobileLayout: v })} options={[['right', '오른쪽 (기본)'], ['left', '왼쪽 (왼손잡이)']]} />
              <MobilePreview scale={s.mobileButtonScale ?? 1} layout={s.mobileLayout ?? 'right'} />
            </Section>
          </>
        )}
        {tab === 'privacy' && (
          <Section>
            <Toggle label="🟢 접속 상태 공개" value={s.showOnline ?? true} onChange={(v) => update({ showOnline: v })} hint="끄면 친구에게 항상 '오프라인'으로 보여요." />
            <Choice
              label="📨 게임 초대 받기" value={s.allowInvites ?? 'friends'} onChange={(v) => update({ allowInvites: v })}
              options={[['all', '누구나'], ['friends', '친구만'], ['none', '받지 않기']]}
            />
            <p className="rounded-xl bg-white/5 p-3 text-xs text-dim">아이디, 비밀번호, 접속 기록 같은 계정 정보는 다른 플레이어에게 절대 보이지 않아요. 프로필에는 닉네임, 레벨, 전적, 대표 무기만 보여요.</p>
          </Section>
        )}
        {tab === 'account' && <AccountTab />}
      </div>
    </div>
  )
}

function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="panel cut-lg space-y-4 p-4">
      {title && <h3 className="font-display text-lg">{title}</h3>}
      {children}
    </section>
  )
}

function Range({ label, value, min, max, unit, onChange }: { label: string; value: number; min: number; max: number; unit: string; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 flex justify-between text-sm font-bold">{label}<span className="font-num">{value}{unit}</span></span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </label>
  )
}

function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div>
      <button onClick={() => onChange(!value)} className="flex w-full items-center justify-between text-left text-sm font-bold">
        {label}
        <span className={cx('relative h-7 w-12 rounded-full transition', value ? 'bg-ok' : 'bg-white/20')}>
          <span className={cx('absolute top-1 size-5 rounded-full bg-white shadow transition-all', value ? 'left-6' : 'left-1')} />
        </span>
      </button>
      {hint && <p className="mt-1 text-xs text-dim">{hint}</p>}
    </div>
  )
}

function Choice<T extends string>({ label, value, options, onChange, hint, disabled = [] }: {
  label: string; value: T; options: [T, string][]; onChange: (v: T) => void; hint?: string; disabled?: string[]
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-bold">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([v, l]) => (
          <button
            key={v}
            disabled={disabled.includes(v)}
            onClick={() => onChange(v)}
            className={cx('rounded-xl border-2 px-3 py-1.5 text-sm font-bold transition disabled:opacity-40', value === v ? 'border-accent bg-accent/20' : 'border-white/15 bg-white/5')}
          >
            {l}
          </button>
        ))}
      </div>
      {hint && <p className="mt-1 text-xs text-dim">{hint}</p>}
    </div>
  )
}

function KeyBinder({ keys, onChange }: { keys: Record<KeyAction, string>; onChange: (k: Record<KeyAction, string>) => void }) {
  const [waiting, setWaiting] = useState<KeyAction | null>(null)
  useEffect(() => {
    if (!waiting) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      if (e.code === 'Escape') return setWaiting(null)
      const clash = (Object.keys(keys) as KeyAction[]).find((a) => a !== waiting && keys[a] === e.code)
      const next = { ...keys, [waiting]: e.code }
      if (clash) next[clash] = keys[waiting]
      onChange(next)
      setWaiting(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [waiting, keys, onChange])
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {KEY_ACTIONS.map(([a, label]) => (
          <button
            key={a}
            onClick={() => setWaiting(a)}
            className={cx('flex items-center justify-between rounded-xl border-2 px-3 py-2 text-sm', waiting === a ? 'animate-pulse border-accent' : 'border-white/15 bg-white/5')}
          >
            <span>{label}</span>
            <kbd className="rounded-md bg-ink px-2 py-0.5 font-num font-bold">{waiting === a ? '키를 누르세요' : keyLabel(keys[a])}</kbd>
          </button>
        ))}
      </div>
      <Button size="sm" variant="ghost" onClick={() => onChange(resolveKeys())}>기본값으로 되돌리기</Button>
    </div>
  )
}

function MobilePreview({ scale, layout }: { scale: number; layout: 'right' | 'left' }) {
  const btn = (label: string, size: number) => (
    <span className="grid place-items-center rounded-full border-2 border-white/40 bg-white/15 text-[10px] font-bold" style={{ width: size * scale, height: size * scale }}>{label}</span>
  )
  const joystick = <span className="grid place-items-center rounded-full border-2 border-white/30 bg-white/10" style={{ width: 70 * scale, height: 70 * scale }}><span className="size-6 rounded-full bg-white/50" /></span>
  const buttons = (
    <span className="grid grid-cols-2 items-end gap-1.5">
      {btn('방어', 36)}{btn('공격', 52)}{btn('점프', 36)}{btn('특수', 36)}
    </span>
  )
  return (
    <div className="flex aspect-[2/1] items-end justify-between rounded-2xl border-2 border-white/10 bg-gradient-to-br from-[#2a3a7a] to-[#1a1f5e] p-3">
      {layout === 'right' ? <>{joystick}{buttons}</> : <>{buttons}{joystick}</>}
    </div>
  )
}

function AccountTab() {
  const nav = useNavigate()
  const user = useAuth((s) => s.user)!
  const logout = useAuth((s) => s.logout)
  const history = useQuery({ queryKey: ['login-history'], queryFn: () => api.get<{ id: number; success: boolean; ip: string | null; device: string | null; suspicious: boolean; reason: string | null; createdAt: string }[]>('/auth/login-history') })
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [pwBusy, setPwBusy] = useState(false)
  const [codeOpen, setCodeOpen] = useState(false)
  const [codePw, setCodePw] = useState('')
  const [code, setCode] = useState<string | null>(null)
  const [delOpen, setDelOpen] = useState(false)
  const [delPw, setDelPw] = useState('')
  const [confirmLogout, setConfirmLogout] = useState(false)

  return (
    <>
      <Section title="🔑 비밀번호 변경">
        <PasswordField label="현재 비밀번호" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
        <PasswordField label="새 비밀번호" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" error={pw.next ? checkPassword(pw.next, user.username) : null} />
        <PasswordField label="새 비밀번호 확인" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" error={pw.confirm && pw.confirm !== pw.next ? '비밀번호가 서로 달라요.' : null} />
        <Button
          className="w-full" loading={pwBusy} disabled={!pw.current || !pw.next || pw.next !== pw.confirm}
          onClick={async () => {
            setPwBusy(true)
            try {
              await api.post('/auth/password', pw)
              toast.success('비밀번호를 바꿨어요. 다른 기기에서는 로그아웃됐어요.')
              setPw({ current: '', next: '', confirm: '' })
            } catch (e) {
              toast.error(errorMessage(e))
            } finally {
              setPwBusy(false)
            }
          }}
        >
          비밀번호 바꾸기
        </Button>
      </Section>

      <Section title="🛟 복구 코드">
        <p className="text-sm text-dim">비밀번호를 잊었을 때 쓰는 코드예요. 잃어버렸다면 새로 만들 수 있어요. 새로 만들면 예전 코드는 못 써요.</p>
        <Button variant="secondary" onClick={() => setCodeOpen(true)}>새 복구 코드 만들기</Button>
      </Section>

      <Section title="📜 최근 로그인 기록">
        {history.isLoading ? <Loading /> : (
          <ul className="divide-y divide-white/10 text-sm">
            {(history.data ?? []).slice(0, 10).map((h) => (
              <li key={h.id} className="flex items-center gap-2 py-2">
                <span>{h.success ? (h.suspicious ? '⚠️' : '✅') : '❌'}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{deviceName(h.device)} · <span className="font-num">{h.ip}</span></span>
                  <span className="text-xs text-dim">{new Date(h.createdAt).toLocaleString('ko-KR')}{h.suspicious && ' · 새로운 환경'}{!h.success && ` · 실패`}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="기타">
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => nav('/?tutorial=1')}>📘 튜토리얼 다시 보기</Button>
          <Button variant="secondary" onClick={() => nav('/support')}>💌 고객지원</Button>
          <Button variant="secondary" onClick={() => setConfirmLogout(true)}>🚪 로그아웃</Button>
          <Button variant="danger" onClick={() => setDelOpen(true)}>계정 탈퇴</Button>
        </div>
      </Section>

      <Modal open={codeOpen} onClose={() => { setCodeOpen(false); setCode(null); setCodePw('') }} title="새 복구 코드">
        {code ? (
          <>
            <p className="mb-3 text-dim">이 코드를 적어 두세요. 다시 보여 드릴 수 없어요.</p>
            <div className="mb-4 select-all rounded-xl border-2 border-dashed border-accent bg-accent/10 py-3 text-center font-mono text-2xl tracking-widest text-accent">{code}</div>
            <Button className="w-full" onClick={() => { setCodeOpen(false); setCode(null); setCodePw('') }}>적어 뒀어요</Button>
          </>
        ) : (
          <>
            <PasswordField label="비밀번호 확인" value={codePw} onChange={(e) => setCodePw(e.target.value)} />
            <Button
              className="mt-4 w-full" disabled={!codePw}
              onClick={async () => {
                try {
                  const r = await api.post<{ recoveryCode: string }>('/auth/recovery-code', { password: codePw })
                  setCode(r.recoveryCode)
                } catch (e) {
                  toast.error(errorMessage(e))
                }
              }}
            >
              만들기
            </Button>
          </>
        )}
      </Modal>

      <Modal open={delOpen} onClose={() => setDelOpen(false)} title="계정 탈퇴">
        <p className="mb-3 text-dim">탈퇴하면 <b className="text-bad">무기, 코인, 아이템, 친구가 모두 사라지고 되돌릴 수 없어요.</b> 정말 탈퇴하려면 비밀번호를 입력해 주세요.</p>
        <PasswordField label="비밀번호" value={delPw} onChange={(e) => setDelPw(e.target.value)} />
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setDelOpen(false)}>취소</Button>
          <Button
            variant="danger" className="flex-1" disabled={!delPw}
            onClick={async () => {
              try {
                await api.post('/auth/delete', { password: delPw })
                toast.info('탈퇴가 완료됐어요. 그동안 고마웠어요!')
                useAuth.getState().setUser(null)
                nav('/login', { replace: true })
              } catch (e) {
                toast.error(errorMessage(e))
              }
            }}
          >
            탈퇴하기
          </Button>
        </div>
      </Modal>
      <Confirm open={confirmLogout} title="로그아웃할까요?" confirmText="로그아웃" message="다시 들어오려면 아이디와 비밀번호가 필요해요." onCancel={() => setConfirmLogout(false)} onConfirm={() => void logout()} />
    </>
  )
}

function deviceName(ua: string | null) {
  if (!ua) return '알 수 없는 기기'
  if (/Android/i.test(ua)) return '안드로이드'
  if (/iPhone|iPad/i.test(ua)) return 'iPhone/iPad'
  if (/Windows/i.test(ua)) return 'Windows PC'
  if (/Mac OS/i.test(ua)) return 'Mac'
  return '기타 기기'
}
