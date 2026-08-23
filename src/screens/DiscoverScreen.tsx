import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { Button } from '../components/core/Button'
import { RouteCard } from '../components/domain/RouteCard'
import { SearchField } from '../components/forms/SearchField'
import { PixelIcon } from '../components/icons/PixelIcon'
import { Panel } from '../components/surfaces/Panel'
import { routeDraftToActiveRoute, routes, textFor } from '../data/nature'
import type { LocalizedText } from '../data/types'
import { useNetrinState } from '../state/NetrinState'

type DiscoverItem = {
  id: string
  title: LocalizedText
  description: LocalizedText
  season: string
  distance: string
  duration: string
  author: string
  tags: string[]
}

export function DiscoverScreen() {
  const { i18n, t } = useTranslation()
  const navigate = useNavigate()
  const { activeRouteId, downloadedRoutes, routeDrafts, setActiveRouteId } = useNetrinState()
  const [query, setQuery] = useState('')

  const merged = useMemo<DiscoverItem[]>(() => {
    const items: DiscoverItem[] = [
      ...routes.map((route) => ({
        id: route.id,
        title: route.title,
        description: route.description,
        season: textFor(route.season, i18n.language),
        distance: route.distance,
        duration: route.duration,
        author: route.author,
        tags: route.tags
      })),
      ...downloadedRoutes.map((route) => ({
        id: route.id,
        title: route.title,
        description: route.description,
        season: textFor(route.season, i18n.language),
        distance: route.distance,
        duration: route.duration,
        author: route.author,
        tags: route.tags
      })),
      ...routeDrafts.flatMap((draft) => {
        const route = routeDraftToActiveRoute(draft)
        if (!route) return []
        return [
          {
            id: route.id,
            title: route.title,
            description: route.description,
            season: t('routes.localDraft'),
            distance: route.distance,
            duration: route.duration,
            author: t('routes.localAuthor'),
            tags: []
          }
        ]
      })
    ]
    const seen = new Set<string>()
    return items.filter((item) => {
      if (seen.has(item.id)) return false
      seen.add(item.id)
      return true
    })
  }, [downloadedRoutes, i18n.language, routeDrafts, t])

  const visibleRoutes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return merged.filter((route) => {
      const searchText = [
        textFor(route.title, i18n.language),
        textFor(route.description, i18n.language),
        route.season,
        route.author,
        ...route.tags
      ]
        .join(' ')
        .toLowerCase()
      return !normalizedQuery || searchText.includes(normalizedQuery)
    })
  }, [i18n.language, merged, query])

  const handleSelectRoute = (id: string) => {
    setActiveRouteId(activeRouteId === id ? '' : id)
  }
  const routeSubtitle = t('routes.subtitle')

  return (
    <section className="screen">
      <header className="screen-heading">
        <div className="screen-head-row">
          <h1>{t('routes.title')}</h1>
          <Button variant="solid" size="sm" icon="cloud" onClick={() => navigate('/workshop')}>
            {t('routes.workshop')}
          </Button>
        </div>
        {routeSubtitle ? <p>{routeSubtitle}</p> : null}
      </header>

      <SearchField value={query} onChange={setQuery} onClear={() => setQuery('')} placeholder={t('routes.search')} clearLabel={t('common.empty')} />

      {visibleRoutes.length > 0 ? (
        <p className="quiet">
          {t('routes.showing')} · {t('routes.count', { count: visibleRoutes.length })}
        </p>
      ) : null}

      <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
        {visibleRoutes.map((route) => (
          <RouteCard
            key={route.id}
            title={textFor(route.title, i18n.language)}
            description={textFor(route.description, i18n.language)}
            distance={route.distance}
            duration={route.duration}
            season={route.season}
            active={activeRouteId === route.id}
            chooseLabel={t('common.choose')}
            selectedLabel={t('common.selected')}
            onSelect={() => handleSelectRoute(route.id)}
          />
        ))}
        {merged.length === 0 ? (
          <div className="empty-center">
            <Panel variant="dark">
              <div className="empty-state">
                <PixelIcon name="plus" size={28} />
                <h2 className="section-title">{t('routes.emptyTitle')}</h2>
                <p className="quiet">{t('routes.emptyHint')}</p>
                <Button icon="plus" onClick={() => navigate('/workshop')}>
                  {t('routes.emptyCta')}
                </Button>
              </div>
            </Panel>
          </div>
        ) : visibleRoutes.length === 0 ? (
          <div className="empty-center">
            <p className="quiet">{t('common.empty')}</p>
          </div>
        ) : null}
      </div>
    </section>
  )
}
