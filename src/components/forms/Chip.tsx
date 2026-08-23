import type { ReactNode } from 'react'

type ChipProps = {
  children: ReactNode
  active?: boolean
  onClick?: () => void
}

/** Filter chip (single-select toggle look). */
export function Chip({ children, active = false, onClick }: ChipProps) {
  return (
    <button type="button" className={`nchip ${active ? 'nchip--active' : ''}`.trim()} aria-pressed={active} onClick={onClick}>
      {children}
    </button>
  )
}

export default Chip
