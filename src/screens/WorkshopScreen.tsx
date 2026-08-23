import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/core/Button'
import { RouteCard } from '../components/domain/RouteCard'
import { SearchField } from '../components/forms/SearchField'
import { PixelIcon } from '../components/icons/PixelIcon'
import { Panel } from '../components/surfaces/Panel'
import { fetchPublicRoutes } from '../data/routeLibrary'
import { textFor } from '../data/nature'
import type { DownloadedRoute } from '../data/types'
import { useNetrinState } from '../state/NetrinState'

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error'; kind: 'unconfigured' | 'network' }
  | { phase: 'ready'; routes: DownloadedRoute[] }

export function WorkshopScreen() {
  const { i18n, t } = useTranslation()
  const navigate = useNavigate()
  const { downloadRoute, isDownloaded } = useNetrinState()
  const [query, setQuery] = useState('')
  const [state, setState] = useState<LoadState>({ phase: 'loading' })

  const load = useCallback(() => {
    setState({ phase: 'loading' })
    fetchPublicRoutes().then((result) => {
      setState(
        result.ok
          ? { phase: 'ready', routes: result.routes }
          : { phase: 'error', kind: result.error }
      )
    })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const visibleRoutes = useMemo(() => {
    if (state.phase !== 'ready') return []
    const normalizedQuery = query.trim().toLowerCase()
    return state.routes.filter((route) => {
      const searchText = [
        textFor(route.title, i18n.language),
        textFor(route.description, i18n.language),
        route.author,
        ...route.tags
      ]
        .join(' ')
        .toLowerCase()
      return !normalizedQuery || searchText.includes(normalizedQuery)
    })
  }, [i18n.language, query, state])

  return (
    <section className="screen">
      <header className="screen-heading">
        <div className="screen-head-row">
          <h1>{t('workshop.title')}</h1>
          <Button
            variant="dark"
            size="sm"
            icon="arrow-left"
            onClick={() => navigate('/discover')}
          >
            {t('workshop.backToRoutes')}
          </Button>
        </div>
        <p>{t('workshop.subtitle')}</p>
      </header>

      <SearchField
        value={query}
        onChange={setQuery}
        onClear={() => setQuery('')}
        placeholder={t('workshop.search')}
        clearLabel={t('common.empty')}
      />

      {state.phase === 'loading' ? <p className="quiet">{t('workshop.loading')}</p> : null}

      {state.phase === 'error' && state.kind === 'unconfigured' ? (
        <Panel variant="dark">
          <div className="empty-state">
            <PixelIcon name="cloud" size={28} />
            <h2 className="section-title">{t('workshop.unconfiguredTitle')}</h2>
            <p className="quiet">{t('workshop.unconfiguredHint')}</p>
          </div>
        </Panel>
      ) : null}

      {state.phase === 'error' && state.kind === 'network' ? (
        <Panel variant="dark">
          <div className="empty-state">
            <PixelIcon name="cloud" size={28} />
            <h2 className="section-title">{t('workshop.errorTitle')}</h2>
            <p className="quiet">{t('workshop.errorHint')}</p>
            <Button icon="reload" onClick={load}>
              {t('workshop.retry')}
            </Button>
          </div>
        </Panel>
      ) : null}

      {state.phase === 'ready' && visibleRoutes.length === 0 ? (
        state.routes.length === 0 ? (
          <Panel variant="dark">
            <div className="empty-state">
              <PixelIcon name="cloud" size={28} />
              <h2 className="section-title">{t('workshop.emptyTitle')}</h2>
              <p className="quiet">{t('workshop.emptyHint')}</p>
            </div>
          </Panel>
        ) : (
          <p className="quiet">{t('common.empty')}</p>
        )
      ) : null}

      {state.phase === 'ready' && visibleRoutes.length > 0 ? (
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          {visibleRoutes.map((route) => (
            <RouteCard
              key={route.id}
              title={textFor(route.title, i18n.language)}
              description={textFor(route.description, i18n.language)}
              photoUrl={route.stops.find((stop) => stop.photoUrl)?.photoUrl}
              distance={route.distance}
              duration={route.duration}
              season={textFor(route.season, i18n.language)}
              active={isDownloaded(route.id)}
              chooseLabel={t('workshop.download')}
              selectedLabel={t('workshop.downloaded')}
              chooseIcon="download"
              selectedIcon="check"
              onSelect={() => downloadRoute(route)}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}
