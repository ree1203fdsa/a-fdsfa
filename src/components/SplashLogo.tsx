import { cx } from './ui'

/** Big paint-splash title logo: crown, colour splats, "컬러워즈" and a COLOR WARS ribbon. */
export function SplashLogo({ size = 'lg', className }: { size?: 'md' | 'lg'; className?: string }) {
  const big = size === 'lg'
  const letters: [string, string][] = [['컬', '#ff3b4e'], ['러', '#2e8bff'], ['워', '#ffffff'], ['즈', '#ffffff']]
  return (
    <div className={cx('pointer-events-none relative flex select-none flex-col items-center', className)} aria-label="컬러워즈 COLOR WARS">
      {/* splash backdrop */}
      <svg viewBox="0 0 600 300" className={cx('absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2', big ? 'w-[min(110vw,64rem)]' : 'w-[min(90vw,30rem)]')} aria-hidden>
        <g opacity="0.95">
          <path d="M150 170 C80 150 70 70 150 70 C170 20 250 30 250 80 L240 200 C200 230 140 220 150 170Z" fill="#ff3b4e" />
          <circle cx="95" cy="95" r="16" fill="#ff3b4e" /><circle cx="70" cy="170" r="10" fill="#ff3b4e" /><circle cx="120" cy="40" r="8" fill="#ff3b4e" />
          <path d="M120 200 C90 230 110 270 160 255 C190 280 230 250 210 215Z" fill="#8a4dff" />
          <circle cx="95" cy="250" r="9" fill="#8a4dff" />
          <path d="M380 70 C400 20 480 20 470 80 C540 80 550 160 480 170 L360 190Z" fill="#ffd23f" />
          <circle cx="510" cy="50" r="14" fill="#ffd23f" /><circle cx="545" cy="120" r="9" fill="#ffd23f" />
          <path d="M440 170 C500 170 530 230 480 250 C450 280 400 250 410 210Z" fill="#3ccf4e" />
          <circle cx="530" cy="250" r="10" fill="#3ccf4e" /><circle cx="505" cy="200" r="6" fill="#3ccf4e" />
          <path d="M230 60 C260 20 330 25 350 60 L340 120 L240 120Z" fill="#2e8bff" />
          <circle cx="300" cy="18" r="8" fill="#2e8bff" />
        </g>
      </svg>

      {/* crown */}
      <svg viewBox="0 0 80 50" className={cx('relative -mb-3 drop-shadow-[0_4px_0_rgba(0,0,0,.35)]', big ? 'w-20 sm:w-28 lg:w-32' : 'w-14')} aria-hidden>
        <path d="M10 44 L6 12 L24 26 L40 6 L56 26 L74 12 L70 44 Z" fill="#ffc21a" stroke="#1a1208" strokeWidth="3.5" strokeLinejoin="round" />
        <circle cx="6" cy="11" r="4.5" fill="#ffd23f" stroke="#1a1208" strokeWidth="3" />
        <circle cx="40" cy="5" r="4.5" fill="#ffd23f" stroke="#1a1208" strokeWidth="3" />
        <circle cx="74" cy="11" r="4.5" fill="#ffd23f" stroke="#1a1208" strokeWidth="3" />
        <path d="M40 22 l6 8 -6 8 -6 -8z" fill="#ff3b4e" stroke="#1a1208" strokeWidth="2" />
      </svg>

      {/* title */}
      <div className={cx('relative flex items-end font-display leading-none', big ? 'text-7xl sm:text-8xl lg:text-[8.5rem]' : 'text-5xl sm:text-6xl')}>
        {letters.map(([l, c], i) => (
          <span
            key={l}
            className="inline-block"
            style={{
              color: c,
              transform: `skewX(-8deg) rotate(${[-4, 2, -2, 3][i]}deg) translateY(${[0, -4, 2, -2][i]}px)`,
              WebkitTextStroke: big ? '7px #12131c' : '5px #12131c',
              paintOrder: 'stroke fill',
              textShadow: '0 6px 0 #12131c, 0 10px 18px rgba(0,0,0,.35)',
            }}
          >
            {l}
          </span>
        ))}
      </div>

      {/* ribbon */}
      <div className={cx('relative -mt-1 -rotate-1', big ? 'px-1' : '')}>
        <div className={cx('rounded-xl border-[3px] border-[#12131c] bg-gradient-to-b from-[#2b2e3d] to-[#12131c] px-5 font-display tracking-wide text-white shadow-[0_5px_0_#12131c]', big ? 'py-1 text-2xl sm:text-4xl lg:text-5xl' : 'py-0.5 text-lg sm:text-xl')}>
          COLOR WARS
        </div>
        <div className="mx-auto -mt-1 h-1.5 w-[80%] rounded-full bg-gradient-to-r from-transparent via-[#ffc21a] to-transparent" />
      </div>
    </div>
  )
}
