import { useEffect, useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { sfx } from '@/lib/sound'
import { useToast } from '@/stores/toast'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'red' | 'blue' | 'violet' | 'ok'
const VARIANTS: Record<Variant, string> = {
  primary: 'gloss bg-gradient-to-b from-accent-2 to-accent text-ink hover:brightness-105',
  secondary: 'gloss bg-gradient-to-b from-[#3a43a8] to-panel-2 text-white hover:brightness-110',
  ghost: 'bg-transparent text-dim hover:text-text hover:bg-white/10',
  danger: 'gloss bg-gradient-to-b from-[#ff7a85] to-bad text-white hover:brightness-110',
  red: 'gloss bg-gradient-to-b from-[#ff6b7c] to-red text-white hover:brightness-110',
  blue: 'gloss bg-gradient-to-b from-[#5cb6ff] to-blue text-white hover:brightness-110',
  violet: 'gloss bg-gradient-to-b from-[#ac78ff] to-violet text-white hover:brightness-110',
  ok: 'gloss bg-gradient-to-b from-[#6ce88c] to-ok text-white hover:brightness-110',
}
const SIZES = {
  sm: 'h-9 px-3 text-sm cut-sm',
  md: 'h-12 px-5 text-base cut-sm',
  lg: 'h-14 px-7 text-lg cut-md',
  xl: 'h-20 px-10 text-3xl cut-lg',
}

export function Button({
  variant = 'primary', size = 'md', loading, className, children, onClick, disabled, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof SIZES; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      onClick={(e) => {
        sfx.click()
        onClick?.(e)
      }}
      className={cx(
        'relative inline-flex select-none items-center justify-center gap-2 overflow-hidden font-display tracking-wide transition active:scale-[0.97]',
        'disabled:opacity-40 disabled:active:scale-100',
        VARIANTS[variant], SIZES[size], className,
      )}
    >
      {loading ? <Spinner small /> : children}
    </button>
  )
}

export function IconButton({ label, children, className, badge, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; badge?: number }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      onClick={(e) => {
        sfx.click()
        rest.onClick?.(e)
      }}
      className={cx('panel cut-sm relative grid size-11 shrink-0 place-items-center text-lg text-text transition hover:border-accent/60 active:scale-95', className)}
    >
      {children}
      {badge ? (
        <span className="absolute right-0.5 top-0.5 grid min-w-4 place-items-center rounded-sm bg-red px-1 font-num text-[10px] font-bold leading-4 text-white">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </button>
  )
}

export function Card({ className, children, onClick, ticks }: { className?: string; children: ReactNode; onClick?: () => void; ticks?: boolean }) {
  return (
    <div onClick={onClick} className={cx('panel cut-md p-4', ticks && 'panel-ticks', onClick && 'cursor-pointer transition hover:border-accent/50', className)}>
      {children}
    </div>
  )
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="h-4 w-1 bg-accent" />
      <h3 className="flex-1 font-display text-lg tracking-wide">{children}</h3>
      {right}
    </div>
  )
}

export function Field({
  label, error, hint, className, right, ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string | null; hint?: ReactNode; right?: ReactNode }) {
  const id = useId()
  return (
    <div className={className}>
      {label && <label htmlFor={id} className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-dim">{label}</label>}
      <div className="relative">
        <input
          id={id}
          {...rest}
          className={cx(
            'h-12 w-full border bg-black/40 px-4 text-base text-text outline-none transition placeholder:text-faint cut-sm',
            error ? 'border-bad' : 'border-edge-2 focus:border-accent focus:bg-black/60',
            right ? 'pr-28' : '',
          )}
        />
        {right && <div className="absolute inset-y-0 right-1.5 flex items-center">{right}</div>}
      </div>
      {error ? <p className="mt-1.5 text-sm text-bad">{error}</p> : hint ? <div className="mt-1.5 text-sm">{hint}</div> : null}
    </div>
  )
}

export function PasswordField(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label?: string; error?: string | null; hint?: ReactNode }) {
  const [show, setShow] = useState(false)
  return (
    <Field
      {...props}
      type={show ? 'text' : 'password'}
      right={
        <button type="button" onClick={() => setShow(!show)} className="px-3 py-1.5 text-xs font-bold text-dim hover:text-accent" aria-label={show ? '비밀번호 숨기기' : '비밀번호 보기'}>
          {show ? '숨기기' : '보기'}
        </button>
      }
    />
  )
}

export function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm text-dim hover:text-text">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4" />
      <span>{children}</span>
    </label>
  )
}

export function Spinner({ small }: { small?: boolean }) {
  return <span className={cx('inline-block animate-spin rounded-full border-[3px] border-current border-t-transparent', small ? 'size-5' : 'size-9 text-accent')} />
}

export function Loading({ text = '불러오는 중...' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-dim">
      <Spinner />
      <span className="font-display tracking-wide">{text}</span>
    </div>
  )
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="panel cut-md flex flex-col items-center gap-3 border-bad/40 p-6 text-center">
      <span className="font-display text-3xl text-bad">ERROR</span>
      <p className="text-text">{error instanceof Error ? error.message : '문제가 생겼어요.'}</p>
      {onRetry && <Button size="sm" variant="secondary" onClick={onRetry}>다시 시도</Button>}
    </div>
  )
}

export function Empty({ icon = '◇', title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center text-dim">
      <span className="text-5xl opacity-70">{icon}</span>
      <p className="font-display text-lg text-text">{title}</p>
      {children}
    </div>
  )
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx('panel panel-ticks cut-lg max-h-[90dvh] w-full animate-pop-in overflow-y-auto p-6 shadow-panel scrollbar-thin', wide ? 'max-w-2xl' : 'max-w-md')} role="dialog" aria-modal>
        {title && (
          <h2 className="mb-5 flex items-center gap-2 font-display text-2xl tracking-wide">
            <span className="h-5 w-1.5 bg-accent" />
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function Confirm({
  open, title, message, confirmText = '확인', cancelText = '취소', danger, loading, onConfirm, onCancel,
}: {
  open: boolean; title: string; message: ReactNode; confirmText?: string; cancelText?: string; danger?: boolean; loading?: boolean
  onConfirm: () => void; onCancel: () => void
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <div className="mb-6 text-dim">{message}</div>
      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onCancel}>{cancelText}</Button>
        <Button variant={danger ? 'danger' : 'primary'} className="flex-1" loading={loading} onClick={onConfirm}>{confirmText}</Button>
      </div>
    </Modal>
  )
}

export function Toasts() {
  const toasts = useToast((s) => s.toasts)
  const style = {
    info: ['border-l-text', 'INFO'], success: ['border-l-ok', 'OK'], error: ['border-l-bad', 'ERROR'],
    coin: ['border-l-accent', 'COIN'], level: ['border-l-violet', 'LEVEL UP'],
  } as const
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div key={t.id} className={cx('panel flex max-w-md animate-pop-in items-center gap-3 border-l-4 px-4 py-3 shadow-panel', style[t.kind][0])}>
          <span className="font-num text-xs font-bold tracking-widest text-dim">{style[t.kind][1]}</span>
          <span className="text-sm">{t.text}</span>
        </div>
      ))}
    </div>,
    document.body,
  )
}

let logoImageMissing = false

/** Uses /logo.png when present; otherwise a text logo in the same red/white/blue/purple style. */
export function Logo({ size = 'md', image = true }: { size?: 'sm' | 'md' | 'lg'; image?: boolean }) {
  const [failed, setFailed] = useState(logoImageMissing)
  if (image && !failed) {
    const w = size === 'lg' ? 'w-[min(92vw,600px)]' : size === 'md' ? 'w-64' : 'w-32'
    return (
      <img
        src="/logo.png"
        alt="컬러워즈"
        draggable={false}
        className={cx(w, 'select-none object-cover drop-shadow-[0_10px_40px_rgba(242,169,0,0.25)]', size === 'sm' ? 'aspect-[3/1]' : 'aspect-[16/9] cut-lg')}
        onError={() => {
          logoImageMissing = true
          setFailed(true)
        }}
      />
    )
  }
  const letters = [['컬', '#ff3b4e'], ['러', '#f2f2f7'], ['워', '#2e9bff'], ['즈', '#8a4dff']]
  const fs = size === 'lg' ? 'text-7xl sm:text-8xl' : size === 'md' ? 'text-5xl' : 'text-2xl'
  return (
    <div className="relative inline-flex select-none flex-col items-center" aria-label="컬러워즈">
      {size !== 'sm' && <span className={cx('-mb-2', size === 'lg' ? 'text-5xl' : 'text-3xl')} style={{ filter: 'drop-shadow(0 0 14px #f2a900)' }}>👑</span>}
      <div className={cx('flex items-end font-display', fs)}>
        {letters.map(([l, c], i) => (
          <span
            key={l}
            className="inline-block"
            style={{
              color: c,
              transform: `skewX(-10deg) rotate(${[-3, 2, -2, 3][i]}deg)`,
              WebkitTextStroke: size === 'sm' ? '1.5px #07080c' : '3px #07080c',
              paintOrder: 'stroke fill',
              textShadow: `0 4px 0 #07080c, 0 0 22px ${c}aa`,
            }}
          >
            {l}
          </span>
        ))}
      </div>
      {size === 'lg' && <span className="mt-1 font-num text-sm font-bold tracking-[0.6em] text-accent">COLOR WARS</span>}
    </div>
  )
}

export function Currency({ icon, value, onClick, label }: { icon: ReactNode; value: number; onClick?: () => void; label: string }) {
  return (
    <button onClick={onClick} className="panel cut-sm flex h-11 items-center gap-2 px-3 transition hover:border-accent/60" aria-label={`${label} ${value}`}>
      <span className="text-lg">{icon}</span>
      <span className="font-num text-lg font-bold tabular-nums">{value.toLocaleString()}</span>
      {onClick && <span className="grid size-5 place-items-center bg-accent font-bold leading-none text-black">+</span>}
    </button>
  )
}

export function CoinBadge({ coins, onClick }: { coins: number; onClick?: () => void }) {
  return <Currency icon="🪙" value={coins} onClick={onClick} label="보유 코인" />
}

export function Progress({ value, max, color = 'bg-accent', className }: { value: number; max: number; color?: string; className?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className={cx('h-2 overflow-hidden bg-white/10', className)}>
      <div className={cx('h-full transition-all duration-500', color)} style={{ width: pct + '%' }} />
    </div>
  )
}

export function ScreenHeader({ title, sub, back = true, right, onBack }: { title: string; sub?: string; back?: boolean; right?: ReactNode; onBack?: () => void }) {
  const nav = useNavigate()
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-edge bg-bg/85 px-4 py-3 backdrop-blur">
      {back && (
        <IconButton label="뒤로 가기" onClick={() => (onBack ? onBack() : window.history.length > 1 ? nav(-1) : nav('/'))}>
          ←
        </IconButton>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-2xl tracking-wide">{title}</h1>
        {sub && <p className="font-num text-xs font-bold uppercase tracking-[0.3em] text-accent">{sub}</p>}
      </div>
      {right}
    </header>
  )
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[] }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-edge scrollbar-thin">
      {items.map((it) => (
        <button
          key={it.value}
          onClick={() => {
            sfx.click()
            onChange(it.value)
          }}
          className={cx(
            'relative shrink-0 px-4 py-2.5 font-display text-sm tracking-wide transition',
            value === it.value ? 'text-accent' : 'text-dim hover:text-text',
          )}
        >
          {it.label}
          {value === it.value && <span className="absolute inset-x-2 -bottom-px h-0.5 bg-accent" />}
        </button>
      ))}
    </div>
  )
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 px-2 py-0.5 font-num text-xs font-bold tracking-wider', className ?? 'bg-accent text-black')}>{children}</span>
}
