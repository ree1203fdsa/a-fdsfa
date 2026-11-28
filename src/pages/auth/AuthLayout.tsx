import { lazy, Suspense, useEffect, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { SplashLogo } from '@/components/SplashLogo'
import { cx } from '@/components/ui'
import { guestPrefs, setGuestPrefs } from '@/lib/guestPrefs'

const LoginScene = lazy(() => import('@/three/LobbyScene').then((m) => ({ default: m.LoginScene })))

export function UserIcon({ className = 'size-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <circle cx="12" cy="7.5" r="4.5" /><path d="M3 21c0-5 4-8 9-8s9 3 9 8z" />
    </svg>
  )
}
export function LockIcon({ className = 'size-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M7 10V7a5 5 0 0 1 10 0v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zm2 0h6V7a3 3 0 0 0-6 0z" />
    </svg>
  )
}
function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  )
}

/** Rounded dark input with a leading icon, as in the login art. */
export function AuthInput({ icon, password, label, ...rest }: InputHTMLAttributes<HTMLInputElement> & { icon: ReactNode; password?: boolean; label: string }) {
  const id = useId()
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">{label}</label>
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white">{icon}</span>
      <input
        id={id}
        {...rest}
        type={password ? (show ? 'text' : 'password') : rest.type}
        className="h-14 w-full rounded-2xl border border-white/15 bg-[#0b0f24]/80 pl-14 pr-14 text-lg sm:h-16 sm:text-xl text-white outline-none transition placeholder:text-white/45 focus:border-[#4fb8ff] focus:shadow-[0_0_0_3px_rgba(79,184,255,.25)]"
      />
      {password && (
        <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-white/80 hover:text-white" aria-label={show ? '비밀번호 숨기기' : '비밀번호 보기'}>
          <EyeIcon off={!show} />
        </button>
      )}
    </div>
  )
}

function GuestSettings() {
  const [open, setOpen] = useState(false)
  const [prefs, setPrefs] = useState(guestPrefs)
  useEffect(() => setGuestPrefs(prefs), [prefs])
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-[#141a3a]/85 px-4 font-display text-lg sm:h-14 sm:px-5 sm:text-xl text-white shadow-lg backdrop-blur hover:bg-[#1c2450]" aria-expanded={open}>
        <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden>
          <path d="M10.5 2h3l.5 2.6 2.1.9 2.2-1.5 2.1 2.1-1.5 2.2.9 2.1 2.6.5v3l-2.6.5-.9 2.1 1.5 2.2-2.1 2.1-2.2-1.5-2.1.9-.5 2.6h-3l-.5-2.6-2.1-.9-2.2 1.5-2.1-2.1 1.5-2.2-.9-2.1L2 13.5v-3l2.6-.5.9-2.1L4 5.7l2.1-2.1 2.2 1.5 2.1-.9zM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" />
        </svg>
        설정
      </button>
      {open && (
        <div className="absolute right-0 top-14 z-30 w-60 rounded-2xl border border-white/10 bg-[#141a3a]/95 p-4 text-sm text-white shadow-2xl backdrop-blur">
          <label className="flex items-center justify-between py-1.5">
            효과음
            <input type="checkbox" className="size-5" checked={prefs.sound} onChange={(e) => setPrefs({ ...prefs, sound: e.target.checked })} />
          </label>
          <label className="flex items-center justify-between py-1.5">
            배경 3D 효과
            <input type="checkbox" className="size-5" checked={prefs.scene} onChange={(e) => setPrefs({ ...prefs, scene: e.target.checked })} />
          </label>
          <div className="mt-2 flex flex-col gap-1 border-t border-white/10 pt-2">
            <Link to="/login" className="rounded-lg px-2 py-1.5 hover:bg-white/10">로그인</Link>
            <Link to="/forgot" className="rounded-lg px-2 py-1.5 hover:bg-white/10">비밀번호를 잊었어요</Link>
            <Link to="/support" className="rounded-lg px-2 py-1.5 hover:bg-white/10">고객지원</Link>
          </div>
          <p className="mt-2 text-xs text-white/50">로그인하면 계정 설정이 적용돼요.</p>
        </div>
      )}
    </div>
  )
}

export function AuthLayout({ children, subtitle, welcome = true }: { children: ReactNode; subtitle?: string; welcome?: boolean }) {
  const [scene, setScene] = useState(guestPrefs().scene)
  useEffect(() => {
    const on = () => setScene(guestPrefs().scene)
    window.addEventListener('cw-guest-prefs', on)
    return () => window.removeEventListener('cw-guest-prefs', on)
  }, [])
  return (
    <div className="relative min-h-[100dvh] overflow-x-hidden bg-[linear-gradient(#2f6bff,#6fa8ff_45%,#d6e8ff)] text-white">
      {/* 3D castle backdrop */}
      <div className="fixed inset-0">
        {scene && (
          <Suspense fallback={null}>
            <LoginScene quality="medium" />
          </Suspense>
        )}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(10,14,40,.35))]" />
      </div>

      {/* top bar */}
      <div className="relative z-20 flex items-start justify-between gap-3 p-3 sm:p-4">
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-[#141a3a]/85 py-2 pl-2 pr-4 shadow-lg backdrop-blur">
          <svg viewBox="0 0 32 32" className="size-9 shrink-0 sm:size-11" aria-hidden>
            <path d="M4 12h6l12-7v22l-12-7H4z" fill="#ff3b4e" stroke="#12131c" strokeWidth="2" strokeLinejoin="round" />
            <path d="M8 20l2 7h4l-2-7" fill="#ff3b4e" stroke="#12131c" strokeWidth="2" strokeLinejoin="round" />
            <path d="M25 11c2 2 2 8 0 10" stroke="#ffd23f" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          </svg>
          <p className="font-display text-sm sm:text-xl"><span className="text-[#ffd23f]">컬러워즈</span>에 오신 것을 환영해요!</p>
        </div>
        <GuestSettings />
      </div>

      {/* centre */}
      <main className="relative z-10 mx-auto flex w-full max-w-[40rem] flex-col items-center px-4 pb-24 sm:-mt-10">
        <SplashLogo size="lg" className="mb-3 sm:mb-4" />
        <div className="w-full animate-fade-up rounded-[1.75rem] border-2 border-[#4fb8ff]/80 bg-[#121a3d]/90 p-5 shadow-[0_0_30px_rgba(79,184,255,.55),inset_0_0_24px_rgba(79,184,255,.15)] backdrop-blur-md sm:p-7">
          {subtitle && (
            <div className="mb-5 text-center">
              <h1 className="flex items-center justify-center gap-3 font-display text-3xl sm:text-5xl"><UserIcon className="size-8 sm:size-11" />{subtitle}</h1>
              {welcome && <p className="mt-1 font-display text-sm text-white/90 sm:text-xl">컬러워즈에 오신 것을 환영해요!</p>}
            </div>
          )}
          {children}
        </div>
      </main>

      {/* corner captions */}
      <div className="pointer-events-none fixed bottom-4 left-4 z-10 hidden items-center gap-3 rounded-2xl border border-white/10 bg-[#141a3a]/85 px-4 py-2.5 shadow-lg backdrop-blur lg:flex">
        <svg viewBox="0 0 24 24" className="size-9" aria-hidden><path d="M12 2l3 6.5 7 .8-5.2 4.8 1.5 7L12 17.6 5.7 21.1l1.5-7L2 9.3l7-.8z" fill="#ffd23f" stroke="#12131c" strokeWidth="1.5" strokeLinejoin="round" /></svg>
        <p className="font-display text-xl leading-snug"><span className="text-[#ffd23f]">직접 그린</span> 무기로,<br />친구들과 배틀을 즐겨보세요!</p>
      </div>
      <p
        className="pointer-events-none fixed bottom-6 right-6 z-10 hidden -rotate-[10deg] text-right font-display text-3xl leading-tight text-[#ffd23f] lg:block xl:text-4xl"
        style={{ WebkitTextStroke: '5px #12131c', paintOrder: 'stroke fill', textShadow: '0 4px 0 #12131c' }}
      >
        지금 바로,<br />컬러워즈를 시작하세요!
      </p>
    </div>
  )
}

/** Big glossy button used on the auth screens. */
export function AuthButton({ tone = 'blue', className, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'blue' | 'purple' | 'ghost' }) {
  return (
    <button
      {...rest}
      className={cx(
        'relative flex h-14 items-center justify-center gap-3 overflow-hidden rounded-2xl font-display text-2xl sm:h-16 sm:text-3xl text-white transition active:scale-[0.97] disabled:opacity-60',
        'before:pointer-events-none before:absolute before:inset-x-2 before:top-1 before:h-1/2 before:rounded-xl before:bg-white/20',
        tone === 'blue' && 'border-2 border-[#8fd3ff] bg-gradient-to-b from-[#4fb8ff] to-[#1565e0] shadow-[0_5px_0_#0b3c8c,0_0_20px_rgba(79,184,255,.5)] hover:brightness-110',
        tone === 'purple' && 'border-2 border-[#c9a6ff] bg-gradient-to-b from-[#a46bff] to-[#6a2ee0] shadow-[0_5px_0_#3c1680] hover:brightness-110',
        tone === 'ghost' && 'border border-white/20 bg-white/5 text-lg hover:bg-white/10',
        className,
      )}
    >
      {children}
    </button>
  )
}
