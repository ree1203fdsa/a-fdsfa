import { WEAPON_INFO, type WeaponType } from '@shared/constants'
import { cx } from './ui'

export const STAT_LABELS = [
  ['attack', '공격력', 'from-[#ff6b7c] to-red'],
  ['speed', '공격 속도', 'from-[#ffe25a] to-accent'],
  ['area', '공격 범위', 'from-[#ac78ff] to-violet'],
  ['range', '사거리', 'from-[#5cb6ff] to-blue'],
  ['weight', '무게', 'from-[#c9cde6] to-[#8a90b8]'],
  ['defense', '방어력', 'from-[#6ce88c] to-ok'],
] as const

export type StatBlock = Record<(typeof STAT_LABELS)[number][0], number>

export function StatBars({ stats, compare, compact }: { stats: StatBlock; compare?: StatBlock; compact?: boolean }) {
  return (
    <ul className={cx('space-y-1.5', compact && 'space-y-1')}>
      {STAT_LABELS.map(([k, label, color]) => {
        const v = stats[k]
        const d = compare ? v - compare[k] : 0
        return (
          <li key={k} className="flex items-center gap-2">
            <span className={cx('shrink-0 font-bold', compact ? 'w-14 text-xs' : 'w-16 text-sm')}>{label}</span>
            <span className="relative h-3 flex-1 overflow-hidden rounded-full bg-white/10">
              <span className={cx('absolute inset-y-0 left-0 rounded-full bg-gradient-to-r transition-all duration-500', color)} style={{ width: `${v}%` }} />
            </span>
            <span className="w-8 text-right font-num font-bold tabular-nums">{v}</span>
            {compare && d !== 0 && <span className={cx('w-8 font-num text-xs font-bold', d > 0 ? 'text-ok' : 'text-bad')}>{d > 0 ? '+' : ''}{d}</span>}
          </li>
        )
      })}
    </ul>
  )
}

export function SpecialBox({ type }: { type: WeaponType }) {
  const info = WEAPON_INFO[type]
  return (
    <div className="rounded-xl border border-violet/50 bg-violet/15 p-3">
      <p className="text-xs font-bold text-dim">특수 능력 (Q)</p>
      <p className="font-display text-lg text-accent-2">✨ {info.specialName}</p>
      <p className="text-sm text-dim">{info.specialDesc}</p>
    </div>
  )
}
