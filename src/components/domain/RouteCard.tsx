import { Button } from '../core/Button'
import { PixelIcon, type PixelIconName } from '../icons/PixelIcon'

type RouteCardProps = {
  title: string
  description?: string
  photoUrl?: string
  distance: string
  duration: string
  season?: string
  active?: boolean
  variant?: 'dark' | 'paper'
  chooseLabel: string
  selectedLabel: string
  chooseIcon?: PixelIconName
  selectedIcon?: PixelIconName
  onSelect?: () => void
}

/** Route summary card: title, description, stats and a choose action. */
export function RouteCard({
  title,
  description,
  photoUrl,
  distance,
  duration,
  season,
  active = false,
  variant = 'dark',
  chooseLabel,
  selectedLabel,
  chooseIcon = 'chevron-right',
  selectedIcon = 'check',
  onSelect
}: RouteCardProps) {
  const cls = ['nroute', active ? 'nroute--active' : variant === 'paper' ? 'nroute--paper' : '']
    .filter(Boolean)
    .join(' ')
  return (
    <article className={cls}>
      <div className="nroute__top">
        <span className="nroute__meta">
          <PixelIcon name="clock" size={13} />
          {distance} · {duration}
        </span>
      </div>
      <h3 className="nroute__title">{title}</h3>
      {photoUrl ? <img className="nroute__photo" src={photoUrl} alt="" /> : null}
      {description ? <p className="nroute__desc">{description}</p> : null}
      <div className="nroute__foot">
        <span className="nroute__season">{season}</span>
        <Button
          variant={active ? 'dark' : variant === 'paper' ? 'paper' : 'solid'}
          size="sm"
          icon={active ? selectedIcon : chooseIcon}
          onClick={onSelect}
        >
          {active ? selectedLabel : chooseLabel}
        </Button>
      </div>
    </article>
  )
}

export default RouteCard
