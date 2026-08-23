import type { ReactNode } from 'react'
import { PixelIcon, type PixelIconName } from '../icons/PixelIcon'

type BadgeProps = {
  children: ReactNode
  tone?: 'green' | 'amber' | 'blue' | 'red' | 'neutral' | 'ink'
  variant?: 'solid' | 'outline' | 'soft'
  size?: 'md' | 'lg'
  icon?: PixelIconName
  className?: string
}

/** Small mono-uppercase status pill for season, state, or ecological signal. */
export function Badge({
  children,
  tone = 'neutral',
  variant = 'soft',
  size = 'md',
  icon,
  className = ''
}: BadgeProps) {
  const cls = ['nbadge', `nbadge--${variant}`, `nbadge--t-${tone}`, size === 'lg' ? 'nbadge--lg' : '', className]
    .filter(Boolean)
    .join(' ')
  return (
    <span className={cls}>
      {icon ? <PixelIcon name={icon} size={size === 'lg' ? 14 : 12} /> : null}
      {children}
    </span>
  )
}

export default Badge
