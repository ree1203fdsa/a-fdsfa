import type { ReactNode } from 'react'
import { Logo } from '@/components/ui'

export function AuthLayout({ children, subtitle }: { children: ReactNode; subtitle?: string }) {
  return (
    <div className="bg-arena relative flex min-h-full overflow-hidden">
      <div className="pointer-events-none absolute -left-40 top-1/4 h-96 w-[60rem] -rotate-12 bg-gradient-to-r from-red/0 via-red/15 to-red/0 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 bottom-1/4 h-96 w-[60rem] -rotate-12 bg-gradient-to-r from-blue/0 via-blue/15 to-blue/0 blur-3xl" />

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center justify-center gap-8 px-4 py-8 lg:flex-row lg:justify-between lg:gap-12">
        <div className="flex flex-col items-center lg:items-start">
          <Logo size="lg" />
          <p className="mt-4 hidden max-w-md text-center text-dim lg:block lg:text-left">
            직접 그린 무기가 3D로 살아난다. 레드팀과 블루팀, 최후의 팀이 되어라.
          </p>
          <div className="mt-6 hidden gap-6 font-num text-sm font-bold tracking-widest text-dim lg:flex">
            <span><b className="text-red">RED</b> TEAM</span>
            <span className="text-faint">VS</span>
            <span><b className="text-blue">BLUE</b> TEAM</span>
          </div>
        </div>

        <div className="panel panel-ticks cut-lg w-full max-w-md animate-fade-up p-6 shadow-panel sm:p-8">
          {subtitle && (
            <div className="mb-6">
              <p className="font-num text-xs font-bold tracking-[0.4em] text-accent">COLOR WARS</p>
              <h2 className="font-display text-3xl tracking-wide">{subtitle}</h2>
            </div>
          )}
          {children}
        </div>
      </div>

      <p className="absolute bottom-3 left-0 right-0 text-center font-num text-[11px] tracking-[0.3em] text-faint">© COLOR WARS · ALPHA BUILD</p>
    </div>
  )
}
