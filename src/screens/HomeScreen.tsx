import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/core/Button'
import { IconButton } from '../components/core/IconButton'
import { NetrinMap, type MapCameraMode, type NetrinMapHandle } from '../components/domain/NetrinMap'
import { PixelIcon, type PixelIconName } from '../components/icons/PixelIcon'
import { RouteStopPhoto } from '../components/domain/RouteStopPhoto'
import { Panel } from '../components/surfaces/Panel'
import { resolveActiveRoute, routes, textFor } from '../data/nature'
import type { ActiveStop, RouteSegment } from '../data/types'
import type { LocationFix } from '../lib/navigation/geo'
import { getNavigationManeuver } from '../lib/navigation/maneuver'
import { snapPoint } from '../lib/snap'
import { planSegment } from '../lib/routing/campusRoutePlanner'
import { createDirectFallbackSegment, routeSegmentParts } from '../lib/routing/routeSegments'
import {
  advanceNavigation,
  continueFromStop,
  createNavigationState,
  getNavigationOutput,
  moveToNextStop,
  moveToPreviousStop,
  setNavigationLocationError,
  shouldAdvanceNavigation,
  startNavigation,
  type NavigationPhase,
  type NavigationState
} from '../lib/navigation/navigationEngine'
import { useNetrinState } from '../state/NetrinState'

type HomeDetail = {
  index: string
  label: string
  title: string
  description?: string
  stop?: ActiveStop
  focus: boolean
}

function getBrowserPosition(): Promise<LocationFix> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('geolocation-unavailable'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          coordinate: [pos.coords.longitude, pos.coords.latitude],
          accuracy: pos.coords.accuracy,
          heading:
            typeof pos.coords.heading === 'number' && Number.isFinite(pos.coords.heading)
              ? pos.coords.heading
              : undefined,
          timestamp: pos.timestamp
        }),
      reject,
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    )
  })
}

export function HomeScreen() {
  const { i18n, t } = useTranslation()
  const {
    activeRouteId,
    appearanceSettings,
    downloadedRoutes,
    routeDrafts,
    setNavigationActive,
    snapToRoads
  } = useNetrinState()
  const activeRoute = useMemo(
    () => resolveActiveRoute(activeRouteId, downloadedRoutes, routeDrafts),
    [activeRouteId, downloadedRoutes, routeDrafts]
  )
  const activeRouteLine = useMemo(() => activeRoute?.waypoints ?? [], [activeRoute])
  const activeRouteSegments = useMemo(() => activeRoute?.segments ?? [], [activeRoute])
  const activeStops = useMemo(() => activeRoute?.stops ?? [], [activeRoute])
  const network = useMemo(() => routes.map((route) => route.waypoints), [])
  const mapRef = useRef<NetrinMapHandle | null>(null)
  const guideRequestIdRef = useRef(0)
  const navigationPathRequestIdRef = useRef(0)
  const galleryRef = useRef<HTMLDivElement | null>(null)
  const stopCardRefs = useRef<Map<string, HTMLElement>>(new Map())

  const [selectedStopId, setSelectedStopId] = useState(activeStops[0]?.id ?? '')
  const [previewStopId, setPreviewStopId] = useState<string>()
  const [expanded, setExpanded] = useState(false)
  const [pendingStopScrollId, setPendingStopScrollId] = useState<string>()
  const [navigationState, setNavigationState] = useState<NavigationState>(() =>
    createNavigationState(activeRoute?.id)
  )
  const [navigationPath, setNavigationPath] = useState<RouteSegment>()
  const [lastLocationFix, setLastLocationFix] = useState<LocationFix | undefined>(undefined)
  const [cameraMode, setCameraMode] = useState<MapCameraMode>('overview')

  useEffect(() => {
    setSelectedStopId(activeStops[0]?.id ?? '')
    setPreviewStopId(undefined)
    setExpanded(false)
    setPendingStopScrollId(undefined)
    setNavigationState(createNavigationState(activeRoute?.id))
    setNavigationPath(undefined)
    setCameraMode('overview')
  }, [activeRoute?.id, activeStops])

  const selectedStop = activeStops.find((stop) => stop.id === selectedStopId) ?? activeStops[0]
  const previewStop = activeStops.find((stop) => stop.id === previewStopId)
  const navigationOutput = useMemo(
    () => (activeRoute ? getNavigationOutput(activeRoute, navigationState, selectedStop) : undefined),
    [activeRoute, navigationState, selectedStop]
  )
  const navigationPhase = navigationState.phase
  const isNavigationMode = navigationPhase !== 'idle'
  const isTravelingPhase = navigationPhase === 'toStart' || navigationPhase === 'following'
  const isManualBrowse =
    cameraMode === 'manualBrowse' && isTravelingPhase
  const isRouteOverview = cameraMode === 'overview' && isTravelingPhase
  const isCameraDetached = isManualBrowse || isRouteOverview
  const visibleStop = navigationOutput?.visibleStop
  const visibleIndex = navigationOutput?.visibleStopIndex ?? 0
  const activeMapStopId = previewStop?.id ?? navigationOutput?.activeMapStopId ?? selectedStop?.id
  const targetDistance = navigationOutput?.targetDistanceMeters
  const targetDistanceText =
    targetDistance == null
      ? undefined
      : targetDistance < 1000
        ? t('home.distanceMeters', { value: Math.max(1, Math.round(targetDistance)) })
        : t('home.distanceKm', { value: (targetDistance / 1000).toFixed(1) })
  const completedStopCount =
    navigationPhase === 'completed'
      ? activeStops.length
      : navigationPhase === 'atStop'
        ? Math.min(activeStops.length, navigationState.currentStopIndex + 1)
        : Math.min(activeStops.length, navigationState.currentStopIndex)
  const progressText = t('home.keyPointProgress', {
    current: completedStopCount,
    total: activeStops.length
  })
  const navigationTargetCoordinate = navigationOutput?.targetCoordinate
  const navigationTargetId =
    navigationOutput?.targetStop?.id ??
    (navigationPhase === 'toStart' || (navigationPhase === 'lowAccuracy' && navigationState.resumePhase === 'toStart')
      ? activeStops[0]?.id ?? 'route-start'
      : undefined)
  const navigationTargetIsRouteStart =
    Boolean(navigationTargetId && activeStops[0]?.id && navigationTargetId === activeStops[0].id)
  const navigationStartKey = navigationState.currentPosition
    ? `${Math.round(navigationState.currentPosition[0] * 5000)}:${Math.round(navigationState.currentPosition[1] * 5000)}`
    : ''
  const navigationTargetKey = navigationTargetCoordinate
    ? `${navigationTargetCoordinate[0].toFixed(6)}:${navigationTargetCoordinate[1].toFixed(6)}`
    : ''
  const isPathNavigationPhase =
    navigationPhase === 'toStart' ||
    navigationPhase === 'following' ||
    navigationPhase === 'offRoute' ||
    navigationPhase === 'lowAccuracy'
  const hasFallbackNavigationPath =
    isPathNavigationPhase &&
    Boolean(
      navigationPath &&
        (navigationPath.kind === 'direct-fallback' ||
          routeSegmentParts(navigationPath).some((part) => part.kind === 'direct-fallback'))
    )
  const navigationManeuver = useMemo(
    () =>
      navigationPhase === 'toStart' ||
      navigationPhase === 'following' ||
      navigationPhase === 'offRoute'
        ? getNavigationManeuver(navigationState.currentPosition, navigationPath?.coordinates ?? [])
        : undefined,
    [navigationPath, navigationPhase, navigationState.currentPosition]
  )
  const maneuverDistanceText = navigationManeuver
    ? navigationManeuver.distanceMeters < 1000
      ? t('home.distanceMeters', { value: Math.max(1, Math.round(navigationManeuver.distanceMeters)) })
      : t('home.distanceKm', { value: (navigationManeuver.distanceMeters / 1000).toFixed(1) })
    : undefined
  const maneuverInstruction = navigationManeuver
    ? navigationManeuver.kind === 'left'
      ? t('home.turnLeftIn', { distance: maneuverDistanceText })
      : navigationManeuver.kind === 'right'
        ? t('home.turnRightIn', { distance: maneuverDistanceText })
        : navigationManeuver.upcomingTurn === 'left'
          ? t('home.continueStraightThenLeft', { distance: maneuverDistanceText })
          : navigationManeuver.upcomingTurn === 'right'
            ? t('home.continueStraightThenRight', { distance: maneuverDistanceText })
            : t('home.continueStraight')
    : undefined

  useEffect(() => {
    setNavigationActive(isNavigationMode)
  }, [isNavigationMode, setNavigationActive])

  useEffect(
    () => () => {
      setNavigationActive(false)
    },
    [setNavigationActive]
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: rounded start/target keys intentionally throttle expensive path replanning while snap changes must force a refresh.
  useEffect(() => {
    if (
      !activeRoute ||
      !navigationState.currentPosition ||
      !navigationTargetCoordinate ||
      !isPathNavigationPhase
    ) {
      navigationPathRequestIdRef.current += 1
      setNavigationPath(undefined)
      return
    }

    const requestId = navigationPathRequestIdRef.current + 1
    navigationPathRequestIdRef.current = requestId
    const from = navigationState.currentPosition
    const to = navigationTargetCoordinate
    const toPointId = navigationTargetId ?? 'navigation-target'
    const segmentId = `navigation-${activeRoute.id}-${toPointId}-${navigationStartKey}`
    setNavigationPath((previous) => (previous?.toPointId === toPointId ? previous : undefined))

    planSegment({
      id: segmentId,
      fromPointId: 'current-location',
      toPointId,
      from,
      to,
      fromSnapped: false,
      toSnapped: false,
      ambiguousFallback: navigationTargetIsRouteStart ? 'partial-road' : 'direct'
    })
      .then((segment) => {
        if (navigationPathRequestIdRef.current === requestId) setNavigationPath(segment)
      })
      .catch(() => {
        if (navigationPathRequestIdRef.current !== requestId) return
        setNavigationPath(createDirectFallbackSegment(segmentId, 'current-location', toPointId, from, to))
      })
  }, [
    activeRoute,
    isPathNavigationPhase,
    navigationStartKey,
    navigationTargetCoordinate,
    navigationTargetId,
    navigationTargetKey,
    navigationTargetIsRouteStart,
    snapToRoads
  ])

  const transformLocationFix = useCallback(
    async (fix: LocationFix): Promise<LocationFix> => {
      if (!snapToRoads) return fix
      const snapped = await snapPoint(fix.coordinate)
      return snapped.snapped ? { ...fix, coordinate: snapped.final } : fix
    },
    [snapToRoads]
  )

  const mapStops = useMemo(
    () =>
      activeStops.map((stop, index) => ({
        id: stop.id,
        location: stop.location,
        index: index + 1,
        label: textFor(stop.title, i18n.language)
      })),
    [activeStops, i18n.language]
  )

  const navigationTargetStop = navigationOutput?.targetStop

  useEffect(() => {
    if (navigationPhase === 'idle') return
    if (navigationTargetStop) setSelectedStopId(navigationTargetStop.id)
    setPreviewStopId(undefined)
    setExpanded(false)
    setPendingStopScrollId(undefined)
  }, [navigationTargetStop, navigationPhase])

  useEffect(() => {
    if (!expanded || !pendingStopScrollId) return
    const frame = window.requestAnimationFrame(() => {
      const gallery = galleryRef.current
      const card = stopCardRefs.current.get(pendingStopScrollId)
      if (gallery && card) {
        const galleryRect = gallery.getBoundingClientRect()
        const cardRect = card.getBoundingClientRect()
        gallery.scrollTo({
          top: gallery.scrollTop + cardRect.top - galleryRect.top,
          behavior: 'smooth'
        })
      }
      setPendingStopScrollId(undefined)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [expanded, pendingStopScrollId])

  const handleSelectStop = (id: string) => {
    setSelectedStopId(id)
    setPreviewStopId(id)
    setPendingStopScrollId(undefined)
    setExpanded(false)
  }

  const handleToggleExpanded = () => {
    if (expanded) {
      setExpanded(false)
      setPendingStopScrollId(undefined)
      setPreviewStopId(undefined)
      return
    }

    setPendingStopScrollId(previewStop?.id ?? navigationOutput?.activeMapStopId ?? selectedStop?.id)
    setPreviewStopId(undefined)
    setExpanded(true)
  }

  const handleLocationChange = useCallback(
    (fix: LocationFix) => {
      setLastLocationFix(fix)
      if (!activeRoute) return
      setNavigationState((previous) => {
        if (previous.routeId !== activeRoute.id) return previous
        if (!shouldAdvanceNavigation(previous.phase)) {
          return {
            ...previous,
            currentPosition: fix.coordinate,
            accuracyMeters: fix.accuracy,
            heading: fix.heading,
            timestamp: fix.timestamp
          }
        }
        return advanceNavigation(activeRoute, previous, fix)
      })
    },
    [activeRoute]
  )

  const handleBeginGuide = () => {
    if (!activeRoute) return
    setPreviewStopId(undefined)
    setExpanded(false)
    setPendingStopScrollId(undefined)

    if (lastLocationFix) {
      setNavigationState(startNavigation(activeRoute, lastLocationFix))
      mapRef.current?.followCoordinate(lastLocationFix.coordinate)
      return
    }

    const requestId = guideRequestIdRef.current + 1
    guideRequestIdRef.current = requestId
    setNavigationState({ ...createNavigationState(activeRoute.id), phase: 'acquiring' })
    getBrowserPosition()
      .then(transformLocationFix)
      .then((fix) => {
        if (guideRequestIdRef.current !== requestId) return
        setLastLocationFix(fix)
        setNavigationState(startNavigation(activeRoute, fix))
        mapRef.current?.followCoordinate(fix.coordinate)
      })
      .catch(() => {
        if (guideRequestIdRef.current !== requestId) return
        setNavigationState((previous) =>
          setNavigationLocationError(
            previous.routeId === activeRoute.id ? previous : createNavigationState(activeRoute.id)
          )
        )
      })
  }

  const handleEndGuide = () => {
    guideRequestIdRef.current += 1
    setPreviewStopId(undefined)
    setExpanded(false)
    setPendingStopScrollId(undefined)
    setNavigationState(createNavigationState(activeRoute?.id))
    setNavigationPath(undefined)
    setSelectedStopId(activeStops[0]?.id ?? '')
  }

  const handleNextStop = () => {
    if (!activeRoute) return
    setPreviewStopId(undefined)
    setNavigationState((previous) =>
      previous.phase === 'atStop'
        ? continueFromStop(activeRoute, previous)
        : moveToNextStop(activeRoute, previous)
    )
  }

  const handlePreviousStop = () => {
    if (!activeRoute) return
    setPreviewStopId(undefined)
    setNavigationState((previous) => moveToPreviousStop(activeRoute, previous))
  }

  const statusLabel = (() => {
    if (isManualBrowse) return t('home.manualBrowseLabel')
    if (isRouteOverview) return t('home.routeOverview')
    if (hasFallbackNavigationPath) return t('home.routeFallbackLabel')
    if (navigationPhase === 'acquiring') return t('home.guidanceAcquiring')
    if (navigationPhase === 'toStart') return t('home.guidingToStart')
    if (navigationPhase === 'following') return t('home.guidingToStop')
    if (navigationPhase === 'atStop') return t('home.reachedKeyPoint')
    if (navigationPhase === 'offRoute') return t('home.offRouteLabel')
    if (navigationPhase === 'lowAccuracy') return t('home.lowAccuracyLabel')
    if (navigationPhase === 'completed') return t('home.guideCompleted')
    if (navigationPhase === 'locationError') return t('home.locationErrorLabel')
    if (cameraMode === 'manualBrowse') return t('home.manualBrowseLabel')
    return t('home.routeNow')
  })()

  const guidanceIcon: PixelIconName =
    navigationPhase === 'acquiring' ||
    navigationPhase === 'lowAccuracy' ||
    navigationPhase === 'locationError'
      ? 'gps'
      : navigationPhase === 'atStop' || navigationPhase === 'completed'
        ? 'check'
        : navigationManeuver?.kind === 'left'
          ? 'turn-left'
          : navigationManeuver?.kind === 'right'
            ? 'turn-right'
            : navigationManeuver?.kind === 'straight'
              ? 'arrow-up'
        : navigationPhase === 'offRoute'
          ? 'compass'
          : navigationPhase === 'toStart'
            ? 'flag'
            : 'directions'

  const navigationDetail = buildHomeDetail(navigationPhase, visibleStop, visibleIndex)
  const previewStopIndex = previewStop
    ? Math.max(0, activeStops.findIndex((stop) => stop.id === previewStop.id))
    : 0
  const previewDetail: HomeDetail | undefined = previewStop
    ? {
        index: String(previewStopIndex + 1),
        label: t('home.stopPreview'),
        title: textFor(previewStop.title, i18n.language),
        description: textFor(previewStop.description, i18n.language),
        stop: previewStop,
        focus: false
      }
    : undefined
  const detail = previewDetail ?? navigationDetail
  const isPreviewDetail = Boolean(previewDetail)
  const showDetail = Boolean(detail && (expanded || isPreviewDetail))
  const canMoveToPreviousStop =
    isNavigationMode && navigationState.currentStopIndex > 0 && activeStops.length > 0

  function buildHomeDetail(
    phase: NavigationPhase,
    stop: ActiveStop | undefined,
    stopIndex: number
  ): HomeDetail | undefined {
    if (phase === 'acquiring') {
      return {
        index: 'GPS',
        label: t('home.guidanceAcquiring'),
        title: t('home.locationPendingTitle'),
        description: t('home.locationPendingHint'),
        focus: true
      }
    }
    if (phase === 'locationError') {
      return {
        index: 'GPS',
        label: t('home.locationErrorLabel'),
        title: t('home.locationErrorTitle'),
        description: t('home.locationErrorHint'),
        focus: true
      }
    }
    if (phase === 'lowAccuracy') {
      return {
        index: 'GPS',
        label: t('home.lowAccuracyLabel'),
        title: t('home.lowAccuracyTitle'),
        description: t('home.lowAccuracyHint'),
        focus: true
      }
    }
    if (phase === 'offRoute') {
      return {
        index: '!',
        label: t('home.offRouteLabel'),
        title: t('home.offRouteTitle'),
        description: t('home.offRouteHint'),
        focus: true
      }
    }
    if (phase === 'toStart') {
      return {
        index: t('home.startMarker'),
        label: t('home.currentTarget'),
        title: t('home.routeStartTitle'),
        description: t('home.routeStartHint'),
        focus: false
      }
    }
    if (phase === 'completed') {
      return {
        index: 'OK',
        label: t('home.guideCompleted'),
        title: t('home.guideDoneTitle'),
        description: t('home.guideDoneHint'),
        focus: true
      }
    }
    if (stop) {
      return {
        index: String(stopIndex + 1),
        label: phase === 'atStop' ? t('home.reachedKeyPoint') : t('home.nextStop'),
        title: textFor(stop.title, i18n.language),
        description: textFor(stop.description, i18n.language),
        stop,
        focus: phase === 'atStop'
      }
    }
    return undefined
  }

  return (
    <div className={`home ${isNavigationMode ? 'home--navigating' : 'home--preview'}`}>
      <div className="home__map">
        <NetrinMap
          ref={mapRef}
          route={activeRouteLine}
          routeSegments={activeRouteSegments}
          navigationPath={navigationPath}
          network={network}
          stops={mapStops}
          activeStopId={activeMapStopId}
          onSelectStop={handleSelectStop}
          onMapBackgroundClick={() => setPreviewStopId(undefined)}
          onLocationChange={handleLocationChange}
          onCameraModeChange={setCameraMode}
          transformLocationFix={transformLocationFix}
          navigationActive={isNavigationMode}
          compassLabel={t('home.resetNorth')}
          mapStyleId={appearanceSettings.mapStyleId}
          locate
        />
      </div>

      {isNavigationMode && activeRoute ? (
        <section className="home__nav-banner" aria-label={statusLabel}>
          <div className="home__nav-turn">
            <PixelIcon name={guidanceIcon} size={44} />
          </div>
          <div className="home__nav-instruction">
            <span>{statusLabel}</span>
            <h1>
              {(maneuverDistanceText ?? targetDistanceText) && navigationPhase !== 'atStop'
                ? maneuverDistanceText ?? targetDistanceText
                : navigationDetail?.index ?? textFor(activeRoute.title, i18n.language)}
            </h1>
            <p>
              {maneuverInstruction ??
                navigationDetail?.title ??
                textFor(activeRoute.title, i18n.language)}
            </p>
          </div>
          <div className="home__nav-actions">
            <IconButton
              icon="close"
              label={t('home.endGuide')}
              variant="paper"
              onClick={handleEndGuide}
            />
            <IconButton
              icon="gps"
              label={t('home.followLocation')}
              variant="paper"
              className={isCameraDetached ? 'home__nav-recenter--active' : ''}
              onClick={() => mapRef.current?.recenter()}
            />
          </div>
        </section>
      ) : (
        <header className="home__chrome">
          <div className="home__wordmark">
            <b>NETRIN</b>
            <span className="home__live" role="status" aria-label={t('app.live')} />
          </div>
          <div className="home__chrome-actions">
            <IconButton
              icon="directions"
              label={t('home.routeOverview')}
              variant="paper"
              onClick={() => mapRef.current?.fitRoute()}
            />
            <IconButton
              icon="gps"
              label={t('home.followLocation')}
              variant="paper"
              onClick={() => mapRef.current?.recenter()}
            />
          </div>
        </header>
      )}

      <div className="home__sheet">
        <Panel
          variant="paper"
          shadow
          padding="0"
          className={showDetail && detail?.focus ? 'home__sheet-panel--focus' : ''}
          style={{ overflow: 'hidden' }}
        >
          {activeRoute ? (
            <>
              <div className="home__sheet-main">
                <div className="home__sheet-info">
                  <div className="home__sheet-eyeline">
                    <span className="home__sheet-swatch" style={{ background: 'var(--signal-green)' }} />
                    <span className="home__sheet-label">{statusLabel}</span>
                  </div>
                  <h2 className="home__sheet-title">{textFor(activeRoute.title, i18n.language)}</h2>
                  <div className="home__sheet-stats">
                    {isNavigationMode ? (
                      <>
                        {targetDistanceText && navigationPhase !== 'atStop' ? (
                          <span>{t('home.distanceToTarget', { distance: targetDistanceText })}</span>
                        ) : null}
                        <span>{progressText}</span>
                      </>
                    ) : (
                      <>
                        <span>{activeRoute.distance}</span>
                        <span>{activeRoute.duration}</span>
                        <span>
                          {activeStops.length} {t('home.stops')}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="home__sheet-actions">
                  {activeStops.length > 0 ? (
                    <IconButton
                      icon={expanded ? 'chevron-down' : 'chevron-up'}
                      label={expanded ? t('home.hideAllStops') : t('home.showAllStops')}
                      variant="paper"
                      size="sm"
                      onClick={handleToggleExpanded}
                    />
                  ) : null}
                  {isNavigationMode ? (
                    !isPreviewDetail && canMoveToPreviousStop ? (
                      <Button
                        icon="arrow-left"
                        size="sm"
                        className="home__guide-button"
                        onClick={handlePreviousStop}
                      >
                        {t('home.previousKeyPoint')}
                      </Button>
                    ) : null
                  ) : (
                    <Button
                      icon="play"
                      size="sm"
                      className="home__guide-button"
                      onClick={handleBeginGuide}
                    >
                      {t('home.beginRoute')}
                    </Button>
                  )}
                </div>
              </div>
              {showDetail && detail ? (
                <div
                  className={`home__sheet-next ${detail.focus ? 'home__sheet-next--focus' : ''}`.trim()}
                >
                  <div className="home__sheet-index">{detail.index}</div>
                  <div className="home__sheet-detail">
                    <span className="home__sheet-label">{detail.label}</span>
                    <h3>{detail.title}</h3>
                    <RouteStopPhoto
                      stop={detail.stop}
                      className="home__stop-photo"
                      alt={t('home.stopPhoto', { title: detail.title })}
                    />
                    {detail.stop?.speciesName ? (
                      <p className="home__stop-species">
                        <span>{t('home.species')}</span>
                        <b>{detail.stop.speciesName}</b>
                      </p>
                    ) : null}
                    {detail.description ? <p>{detail.description}</p> : null}
                    {!isPreviewDetail &&
                    targetDistanceText &&
                    (navigationPhase === 'toStart' ||
                      navigationPhase === 'following' ||
                      navigationPhase === 'offRoute' ||
                      navigationPhase === 'lowAccuracy') ? (
                      <p className="home__guide-distance">
                        {t('home.distanceToTarget', { distance: targetDistanceText })}
                      </p>
                    ) : null}
                    {!isPreviewDetail &&
                    isNavigationMode &&
                    navigationPhase !== 'acquiring' &&
                    navigationPhase !== 'completed' &&
                    activeStops.length > 0 ? (
                      <Button block icon="arrow-right" onClick={handleNextStop}>
                        {navigationOutput?.hasNextStop ? t('home.nextKeyPoint') : t('home.finishGuide')}
                      </Button>
                    ) : null}
                    {!isPreviewDetail &&
                    (navigationPhase === 'completed' || navigationPhase === 'locationError') ? (
                      <Button
                        block
                        icon={navigationPhase === 'completed' ? 'reload' : 'gps'}
                        onClick={handleBeginGuide}
                      >
                        {navigationPhase === 'completed' ? t('home.restartGuide') : t('home.retryGuide')}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {expanded && activeStops.length > 0 ? (
                <section
                  ref={galleryRef}
                  className="home__sheet-gallery"
                  aria-label={t('home.stops')}
                >
                  {activeStops.map((stop, index) => {
                    const title = textFor(stop.title, i18n.language)
                    const description = textFor(stop.description, i18n.language)
                    const isTarget = stop.id === activeMapStopId
                    return (
                      <article
                        key={stop.id}
                        ref={(node) => {
                          if (node) stopCardRefs.current.set(stop.id, node)
                          else stopCardRefs.current.delete(stop.id)
                        }}
                        data-stop-id={stop.id}
                        className={`home__sheet-stop ${isTarget ? 'home__sheet-stop--target' : ''}`.trim()}
                      >
                        <div className="home__sheet-stop-index">{index + 1}</div>
                        <div className="home__sheet-stop-body">
                          <h4>{title}</h4>
                          <RouteStopPhoto
                            stop={stop}
                            className="home__sheet-stop-photo"
                            alt={t('home.stopPhoto', { title })}
                          />
                          {stop.speciesName ? (
                            <p className="home__stop-species">
                              <span>{t('home.species')}</span>
                              <b>{stop.speciesName}</b>
                            </p>
                          ) : null}
                          {description ? <p>{description}</p> : null}
                        </div>
                      </article>
                    )
                  })}
                </section>
              ) : null}
            </>
          ) : (
            <div className="home__sheet-main">
              <div className="home__sheet-info">
                <div className="home__sheet-eyeline">
                  <span className="home__sheet-swatch" style={{ background: 'var(--signal-green)' }} />
                  <span className="home__sheet-label">{t('home.noRouteLabel')}</span>
                </div>
                <h2 className="home__sheet-title">{t('home.noRouteTitle')}</h2>
                <div className="home__sheet-stats">
                  <span>{t('home.noRouteHint')}</span>
                </div>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
