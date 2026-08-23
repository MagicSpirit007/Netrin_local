import type { ReactNode } from 'react'
import { PixelIcon, type PixelIconName } from '../icons/PixelIcon'

type ListRowProps = {
  icon?: PixelIconName
  label: string
  sub?: string
  value?: string
  action?: ReactNode
  chevron?: boolean
  onClick?: () => void
  variant?: 'dark' | 'paper'
  className?: string
}

/** List row: leading glyph, label/subtitle, optional value + chevron. */
export function ListRow({
  icon,
  label,
  sub,
  value,
  action,
  chevron = true,
  onClick,
  variant = 'dark',
  className = ''
}: ListRowProps) {
  const cls = ['nrow', variant === 'paper' ? 'nrow--paper' : '', className].filter(Boolean).join(' ')
  const content = (
    <>
      {icon ? (
        <span className="nrow__icon">
          <PixelIcon name={icon} size={22} />
        </span>
      ) : null}
      <span className="nrow__body">
        <span className="nrow__label">{label}</span>
        {sub ? <span className="nrow__sub">{sub}</span> : null}
      </span>
      {value != null ? <span className="nrow__value">{value}</span> : null}
      {action ? <span className="nrow__action">{action}</span> : null}
      {chevron && onClick ? <PixelIcon className="nrow__chev" name="chevron-right" size={18} /> : null}
    </>
  )
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick}>
        {content}
      </button>
    )
  }
  return <div className={cls}>{content}</div>
}

export default ListRow
