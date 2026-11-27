import { NavLink, Outlet } from 'react-router-dom'
import { cx } from '@/components/ui'
import { sfx } from '@/lib/sound'

const NAV = [
  { to: '/', icon: '⌂', label: '로비' },
  { to: '/inventory', icon: '⚔', label: '보관함' },
  { to: '/friends', icon: '👥', label: '친구' },
  { to: '/missions', icon: '◎', label: '미션' },
  { to: '/ranking', icon: '♛', label: '랭킹' },
  { to: '/profile', icon: '☺', label: '프로필' },
]

export function AppShell() {
  return (
    <div className="bg-arena flex min-h-full flex-col">
      <main className="flex-1 pb-20">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-edge bg-[#0b0d12]/92 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <ul className="mx-auto flex max-w-3xl">
          {NAV.map((n) => (
            <li key={n.to} className="flex-1">
              <NavLink
                to={n.to}
                end={n.to === '/'}
                onClick={() => sfx.click()}
                className={({ isActive }) =>
                  cx('relative flex flex-col items-center gap-0.5 py-2.5 font-display text-xs tracking-wide transition', isActive ? 'text-accent' : 'text-dim hover:text-text')
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && <span className="absolute inset-x-4 top-0 h-0.5 bg-accent shadow-[0_0_12px_#f2a900]" />}
                    <span className="text-xl leading-6">{n.icon}</span>
                    {n.label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
