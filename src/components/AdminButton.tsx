/** Gold-framed "관리자 / ADMIN" button with crown + gear, matching the staff button art (normal → hover glow → pressed orange). */
export function AdminButton({ onClick, active }: { onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label="관리자 메뉴"
      className="group relative h-14 select-none pl-7 transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0.5 active:scale-95"
    >
      {/* gold frame */}
      <span
        className="flex h-full items-center gap-2 bg-gradient-to-b from-[#ffe27a] via-[#f5b400] to-[#d98a00] p-[3px] shadow-[0_4px_0_#7a4a00,0_6px_14px_rgba(0,0,0,.45)] transition-[filter,box-shadow] group-hover:shadow-[0_4px_0_#7a4a00,0_0_22px_6px_rgba(255,210,63,.75)] group-hover:brightness-110 group-active:from-[#ffb36b] group-active:via-[#ff7a1a] group-active:to-[#d94a00]"
        style={{ clipPath: 'polygon(12px 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 12px 100%, 0 50%)' }}
      >
        {/* dark plate */}
        <span
          className="flex h-full items-center gap-1 bg-gradient-to-b from-[#3a3d4a] to-[#15161d] pl-8 pr-3 transition-colors group-active:from-[#6b2a0c] group-active:to-[#3a1405]"
          style={{ clipPath: 'polygon(10px 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 10px 100%, 0 50%)' }}
        >
          <span className="flex flex-col items-center leading-none">
            <span className="font-display text-xl text-white" style={{ WebkitTextStroke: '1px #0b0c12', textShadow: '0 2px 0 #0b0c12' }}>
              {active ? '관리자 모드' : '관리자'}
            </span>
            <span className="mt-0.5 flex items-center gap-1 font-display text-[10px] tracking-[0.2em] text-[#ffd23f]">
              <span className="h-[2px] w-2.5 bg-[#ffd23f]" />ADMIN<span className="h-[2px] w-2.5 bg-[#ffd23f]" />
            </span>
          </span>
          <span className="ml-1 font-display text-2xl text-[#ffd23f] transition-transform group-hover:translate-x-0.5">›</span>
        </span>
      </span>

      {/* crown + gear emblem overlapping the left edge */}
      <svg viewBox="0 0 64 64" className="pointer-events-none absolute top-0 left-0 size-13 drop-shadow-[0_3px_2px_rgba(0,0,0,.5)]" aria-hidden>
        <g transform="translate(30 40)">
          <path
            d="M-4-20h8l1.5 6 5-2.5 5.6 5.6-2.5 5 6 1.5v8l-6 1.5 2.5 5-5.6 5.6-5-2.5L4 20h-8l-1.5-6-5 2.5-5.6-5.6 2.5-5-6-1.5v-8l6-1.5-2.5-5 5.6-5.6 5 2.5z"
            fill="#e9ebf2" stroke="#0b0c12" strokeWidth="2.5" strokeLinejoin="round"
          />
          <circle r="6.5" fill="#3a3d4a" stroke="#0b0c12" strokeWidth="2.5" />
        </g>
        <g transform="rotate(-14 30 16)">
          <path d="M12 26 L9 8 L20 16 L30 4 L40 16 L51 8 L48 26 Z" fill="#ffc21a" stroke="#0b0c12" strokeWidth="2.5" strokeLinejoin="round" />
          <circle cx="9" cy="7" r="3" fill="#ffd23f" stroke="#0b0c12" strokeWidth="2" />
          <circle cx="30" cy="3.5" r="3" fill="#ffd23f" stroke="#0b0c12" strokeWidth="2" />
          <circle cx="51" cy="7" r="3" fill="#ffd23f" stroke="#0b0c12" strokeWidth="2" />
          <path d="M30 13 l4 5 -4 5 -4 -5z" fill="#ff3b4e" stroke="#0b0c12" strokeWidth="1.5" />
        </g>
      </svg>

      {/* sparkle on hover */}
      <span className="pointer-events-none absolute -right-1 -top-2 text-lg text-[#fff6c8] opacity-0 transition-opacity group-hover:opacity-100">✦</span>
    </button>
  )
}
