import type { CSSProperties } from 'react'

type StatItem = { value: string; label: string }

type StatGridProps = {
  items: StatItem[]
  columns?: number
  variant?: 'dark' | 'paper'
  className?: string
  style?: CSSProperties
}

/** Row/grid of label+value stat cells (route stats, recorder counts). */
export function StatGrid({ items, columns, variant = 'dark', className = '', style }: StatGridProps) {
  const cols = columns || items.length || 1
  const cls = ['nstats', variant === 'paper' ? 'nstats--paper' : '', className].filter(Boolean).join(' ')
  return (
    <div className={cls} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, ...style }}>
      {items.map((item) => (
        <div className="nstats__cell" key={item.label}>
          <span className="nstats__v">{item.value}</span>
          <span className="nstats__l">{item.label}</span>
        </div>
      ))}
    </div>
  )
}

export default StatGrid
