import 'maplibre-gl/dist/maplibre-gl.css'
import maplibregl, { type StyleSpecification } from 'maplibre-gl'
import { PMTiles, Protocol } from 'pmtiles'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { Coordinate, MapStyleId, RouteSegment } from '../../data/types'
import type { LocationFix } from '../../lib/navigation/geo'
import { routeSegmentParts } from '../../lib/routing/routeSegments'
import { PixelIcon } from '../icons/PixelIcon'

export type NetrinMapHandle = {
  recenter: () => void
  followCoordinate: (coordinate: Coordinate) => void
  resetNorth: () => void
  fitRoute: () => void
}
export type BaseMapMode = 'pmtiles' | 'offline'
export type MapCameraMode = 'overview' | 'follow' | 'manualBrowse'

type StopMarker = { id: string; location: Coordinate; index: number; label?: string }

type NetrinMapProps = {
  /** Active route geometry (drawn bright). */
  route: Coordinate[]
  /** Authored route segments; network segments are solid and fallback segments are dashed. */
  routeSegments?: RouteSegment[]
  /** Current turn-by-turn navigation path, drawn above the authored route. */
  navigationPath?: RouteSegment
  /** Other routes drawn faintly as the path network (optional). */
  network?: Coordinate[][]
  stops?: StopMarker[]
  /** Fallback "you-are-here" coordinate when live GPS is unavailable. */
  you?: Coordinate
  activeStopId?: string
  onSelectStop?: (id: string) => void
  /** Reports a click on the map background without enabling field-editor styling. */
  onMapBackgroundClick?: () => void
  /** Try live geolocation and recenter on it. */
  locate?: boolean
  /** Reports live WGS-84 location fixes to parent flows such as in-route navigation. */
  onLocationChange?: (fix: LocationFix) => void
  /** Optional best-effort transform applied to both the live marker and reported fix. */
  transformLocationFix?: (fix: LocationFix) => LocationFix | Promise<LocationFix>
  onBearingChange?: (bearing: number) => void
  onCameraModeChange?: (mode: MapCameraMode) => void
  /** Uses a lower-screen follow anchor so more of the route remains visible ahead. */
  navigationActive?: boolean
  /** Render a small in-map "recenter on me" button (for compact maps). */
  recenterControl?: boolean
  recenterLabel?: string
  /** Shrinks in-map controls and groups them in the upper-right corner. */
  compactControls?: boolean
  /** Optional field-editor click handler; receives WGS-84 coordinates. */
  onMapClick?: (coordinate: Coordinate) => void
  /** Pending adjusted point in the field editor. */
  draftPoint?: Coordinate
  /** Original GPS point before snapping/adjustment. */
  rawPoint?: Coordinate
  framed?: boolean
  label?: string
  interactive?: boolean
  showCompass?: boolean
  compassLabel?: string
  className?: string
  baseMapMode?: BaseMapMode
  mapStyleId?: MapStyleId
}

const INK = '#0b0c0e'
const PAPER = '#101214'
const WHITE = '#f4f5f2'
const FAINT = '#c7cac4'
const GUIDE = '#9cff6f'
const FALLBACK = '#ffd166'
const PMTILES_PATH = `${import.meta.env.BASE_URL}maps/donghu-campus.pmtiles?v=20260617-donghu-wide`
const PMTILES_SOURCE_ID = 'netrin-basemap'
const BASEMAP_WATER_SOURCE_ID = 'netrin-basemap-water'
const BASEMAP_WATER_PATH = `${import.meta.env.BASE_URL}data/basemap-water.json`
const CAMPUS_CENTER: Coordinate = [119.7314, 30.2577]
const STOP_MARKER_REFERENCE_ZOOM = 16
const STOP_MARKER_SCALE_PER_ZOOM = 0.14
const STOP_MARKER_MIN_SCALE = 0.58
const STOP_MARKER_MAX_SCALE = 1.42

type BaseStyleProfile = {
  backgroundColor: string
  landuseColor: string
  landuseOpacity: number
  greenColor: string
  greenOpacity: number
  waterColor: string
  waterOpacity: number
  waterLineColor: string
  waterLineOpacity: number
  buildingColor: string
  buildingOpacity: number
  buildingLineColor: string
  buildingLineOpacity: number
  minorRoadColor: string
  minorRoadOpacity: number
  majorRoadColor: string
  majorRoadOpacity: number
  roadWidthBoost: number
}

const BASE_STYLE_PROFILES: Record<MapStyleId, BaseStyleProfile> = {
  'field-console': {
    backgroundColor: INK,
    landuseColor: PAPER,
    landuseOpacity: 0.48,
    greenColor: WHITE,
    greenOpacity: 0.08,
    waterColor: WHITE,
    waterOpacity: 0.13,
    waterLineColor: FAINT,
    waterLineOpacity: 0.42,
    buildingColor: WHITE,
    buildingOpacity: 0.1,
    buildingLineColor: WHITE,
    buildingLineOpacity: 0.22,
    minorRoadColor: WHITE,
    minorRoadOpacity: 0.5,
    majorRoadColor: WHITE,
    majorRoadOpacity: 0.68,
    roadWidthBoost: 0
  },
  'campus-atlas': {
    backgroundColor: '#edf1e6',
    landuseColor: '#dcebcf',
    landuseOpacity: 0.9,
    greenColor: '#98c67d',
    greenOpacity: 0.74,
    waterColor: '#8bc8dc',
    waterOpacity: 0.84,
    waterLineColor: '#4b9dba',
    waterLineOpacity: 0.74,
    buildingColor: '#e0d0b7',
    buildingOpacity: 0.82,
    buildingLineColor: '#b59b76',
    buildingLineOpacity: 0.56,
    minorRoadColor: '#fffdf5',
    minorRoadOpacity: 0.96,
    majorRoadColor: '#efc66a',
    majorRoadOpacity: 0.96,
    roadWidthBoost: 0.42
  },
  'forest-walk': {
    backgroundColor: '#e5ebd4',
    landuseColor: '#ceddb6',
    landuseOpacity: 0.92,
    greenColor: '#6fa25f',
    greenOpacity: 0.78,
    waterColor: '#7db9c8',
    waterOpacity: 0.76,
    waterLineColor: '#397f9a',
    waterLineOpacity: 0.72,
    buildingColor: '#c9bda3',
    buildingOpacity: 0.58,
    buildingLineColor: '#8e846f',
    buildingLineOpacity: 0.46,
    minorRoadColor: '#fff4d8',
    minorRoadOpacity: 0.94,
    majorRoadColor: '#d59f4a',
    majorRoadOpacity: 0.88,
    roadWidthBoost: 0.3
  },
  'night-trace': {
    backgroundColor: '#05080a',
    landuseColor: '#10161b',
    landuseOpacity: 0.78,
    greenColor: '#315f3c',
    greenOpacity: 0.48,
    waterColor: '#194b75',
    waterOpacity: 0.72,
    waterLineColor: '#7cc6ee',
    waterLineOpacity: 0.92,
    buildingColor: '#272c34',
    buildingOpacity: 0.76,
    buildingLineColor: '#e8edf0',
    buildingLineOpacity: 0.46,
    minorRoadColor: '#f1f4e8',
    minorRoadOpacity: 0.88,
    majorRoadColor: '#ffd166',
    majorRoadOpacity: 0.96,
    roadWidthBoost: 0.75
  }
}

const HIGHLIGHT_ROUTE_LINE = {
  networkWidth: 2,
  networkOpacity: 0.28,
  haloWidth: 9,
  haloOpacity: 0.9,
  lineWidth: 4,
  lineOpacity: 1
}

type GlobalWithPmtiles = typeof globalThis & { __netrinPmtilesProtocol?: Protocol }
type DeviceOrientationEventWithCompass = DeviceOrientationEvent & { webkitCompassHeading?: number }
type DeviceOrientationEventConstructorWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

const normalizeHeading = (value: number) => ((value % 360) + 360) % 360

function headingFromEvent(event: DeviceOrientationEventWithCompass): number | undefined {
  if (typeof event.webkitCompassHeading === 'number') return normalizeHeading(event.webkitCompassHeading)
  return typeof event.alpha === 'number' ? normalizeHeading(360 - event.alpha) : undefined
}

function locationFixFromPosition(position: GeolocationPosition): LocationFix {
  const heading =
    typeof position.coords.heading === 'number' && Number.isFinite(position.coords.heading)
      ? normalizeHeading(position.coords.heading)
      : undefined
  return {
    coordinate: [position.coords.longitude, position.coords.latitude],
    accuracy: position.coords.accuracy,
    heading,
    timestamp: position.timestamp
  }
}

export async function requestNetrinHeadingPermission(): Promise<void> {
  const eventCtor = window.DeviceOrientationEvent as
    | DeviceOrientationEventConstructorWithPermission
    | undefined
  if (typeof eventCtor?.requestPermission !== 'function') return
  try {
    await eventCtor.requestPermission()
  } catch {
    // Heading is an enhancement. North-facing arrows are still valid if denied.
  }
}

function ensurePmtilesProtocol(): Protocol {
  const global = globalThis as GlobalWithPmtiles
  if (global.__netrinPmtilesProtocol) return global.__netrinPmtilesProtocol

  const protocol = new Protocol()
  try {
    maplibregl.addProtocol('pmtiles', protocol.tile)
  } catch (error) {
    // HMR can leave the protocol registered while reloading this module.
    console.warn('[netrin-map] PMTiles protocol registration was skipped.', error)
  }
  global.__netrinPmtilesProtocol = protocol
  return protocol
}

function pmtilesArchiveUrl(): string {
  return new URL(PMTILES_PATH, window.location.origin).toString()
}

function offlineStyle(mapStyleId: MapStyleId): StyleSpecification {
  const profile = BASE_STYLE_PROFILES[mapStyleId]
  return {
    version: 8,
    sources: {},
    layers: [{ id: 'bg', type: 'background', paint: { 'background-color': profile.backgroundColor } }]
  }
}

function pmtilesStyle(archiveUrl: string, mapStyleId: MapStyleId): StyleSpecification {
  const profile = BASE_STYLE_PROFILES[mapStyleId]
  return {
    version: 8,
    sources: {
      [PMTILES_SOURCE_ID]: {
        type: 'vector',
        url: `pmtiles://${archiveUrl}`,
        attribution: '<a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      },
      [BASEMAP_WATER_SOURCE_ID]: {
        type: 'geojson',
        data: BASEMAP_WATER_PATH
      }
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': profile.backgroundColor } },
      {
        id: 'base-landuse',
        type: 'fill',
        source: PMTILES_SOURCE_ID,
        'source-layer': 'landuse',
        paint: { 'fill-color': profile.landuseColor, 'fill-opacity': profile.landuseOpacity }
      },
      {
        id: 'base-green-space',
        type: 'fill',
        source: PMTILES_SOURCE_ID,
        'source-layer': 'landuse',
        filter: ['in', ['get', 'kind'], ['literal', ['forest', 'garden', 'grass', 'meadow', 'orchard', 'park', 'wood']]],
        paint: { 'fill-color': profile.greenColor, 'fill-opacity': profile.greenOpacity }
      },
      {
        id: 'base-water-fill',
        type: 'fill',
        source: BASEMAP_WATER_SOURCE_ID,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': profile.waterColor, 'fill-opacity': profile.waterOpacity }
      },
      {
        id: 'base-waterway-line',
        type: 'line',
        source: BASEMAP_WATER_SOURCE_ID,
        filter: ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': profile.waterColor,
          'line-opacity': profile.waterOpacity,
          'line-width': ['interpolate', ['linear'], ['zoom'], 13, 1.2, 16, 4.4]
        }
      },
      {
        id: 'base-buildings',
        type: 'fill',
        source: PMTILES_SOURCE_ID,
        'source-layer': 'buildings',
        paint: { 'fill-color': profile.buildingColor, 'fill-opacity': profile.buildingOpacity }
      },
      {
        id: 'base-buildings-line',
        type: 'line',
        source: PMTILES_SOURCE_ID,
        'source-layer': 'buildings',
        paint: { 'line-color': profile.buildingLineColor, 'line-opacity': profile.buildingLineOpacity, 'line-width': 0.7 }
      },
      {
        id: 'base-roads-minor',
        type: 'line',
        source: PMTILES_SOURCE_ID,
        'source-layer': 'roads',
        filter: ['in', ['get', 'kind'], ['literal', ['minor_road', 'path']]],
        layout: { 'line-cap': 'square', 'line-join': 'miter' },
        paint: { 'line-color': profile.minorRoadColor, 'line-opacity': profile.minorRoadOpacity, 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.75 + profile.roadWidthBoost, 16, 2.4 + profile.roadWidthBoost] }
      },
      {
        id: 'base-roads-major',
        type: 'line',
        source: PMTILES_SOURCE_ID,
        'source-layer': 'roads',
        filter: ['in', ['get', 'kind'], ['literal', ['highway', 'major_road']]],
        layout: { 'line-cap': 'square', 'line-join': 'miter' },
        paint: { 'line-color': profile.majorRoadColor, 'line-opacity': profile.majorRoadOpacity, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.2 + profile.roadWidthBoost, 16, 3.8 + profile.roadWidthBoost] }
      }
    ]
  }
}

function resolveBaseStyle(baseMapMode: BaseMapMode, mapStyleId: MapStyleId): { style: StyleSpecification; mode: BaseMapMode } {
  if (baseMapMode === 'offline') {
    return { style: offlineStyle(mapStyleId), mode: 'offline' }
  }

  const archiveUrl = pmtilesArchiveUrl()
  ensurePmtilesProtocol().add(new PMTiles(archiveUrl))
  return { style: pmtilesStyle(archiveUrl, mapStyleId), mode: 'pmtiles' }
}

function applyRouteLineHighlight(map: maplibregl.Map) {
  const paint = HIGHLIGHT_ROUTE_LINE
  if (map.getLayer('network-line')) {
    map.setPaintProperty('network-line', 'line-width', paint.networkWidth)
    map.setPaintProperty('network-line', 'line-opacity', paint.networkOpacity)
  }
  if (map.getLayer('route-halo')) {
    map.setPaintProperty('route-halo', 'line-width', paint.haloWidth)
    map.setPaintProperty('route-halo', 'line-opacity', paint.haloOpacity)
  }
  if (map.getLayer('route-line')) {
    map.setPaintProperty('route-line', 'line-width', paint.lineWidth)
    map.setPaintProperty('route-line', 'line-opacity', paint.lineOpacity)
  }
}

function lineFeature(coords: Coordinate[]) {
  return { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: coords } }
}

function lineFeatureCollection(lines: Coordinate[][]) {
  return { type: 'FeatureCollection' as const, features: lines.filter((coords) => coords.length >= 2).map(lineFeature) }
}

function segmentFeatureCollection(segments: RouteSegment[], kind: RouteSegment['kind']) {
  return lineFeatureCollection(
    segments.flatMap((segment) =>
      routeSegmentParts(segment)
        .filter((part) => part.kind === kind)
        .map((part) => part.coordinates)
    )
  )
}

function enforceFlatPitch(map: maplibregl.Map) {
  if (Math.abs(map.getPitch()) > 0.01) map.setPitch(0)
}

function stopMarkerScale(zoom: number) {
  const scale = 1 + (zoom - STOP_MARKER_REFERENCE_ZOOM) * STOP_MARKER_SCALE_PER_ZOOM
  return Math.min(STOP_MARKER_MAX_SCALE, Math.max(STOP_MARKER_MIN_SCALE, scale))
}

function applyInteractionHandlers(map: maplibregl.Map, enabled: boolean) {
  if (enabled) {
    map.dragPan.enable()
    map.touchZoomRotate.enable()
    map.touchZoomRotate.enableRotation()
    map.dragRotate.enable()
    map.scrollZoom.enable()
    map.doubleClickZoom.enable()
    map.keyboard.enable()
    map.keyboard.enableRotation()
  } else {
    map.dragPan.disable()
    map.touchZoomRotate.disable()
    map.touchZoomRotate.disableRotation()
    map.dragRotate.disable()
    map.scrollZoom.disable()
    map.doubleClickZoom.disable()
    map.keyboard.disable()
  }
}

export const NetrinMap = forwardRef<NetrinMapHandle, NetrinMapProps>(function NetrinMap(
  {
    route,
    routeSegments = [],
    navigationPath,
    network = [],
    stops = [],
    you,
    activeStopId,
    onSelectStop,
    onMapBackgroundClick,
    locate = false,
    onLocationChange,
    transformLocationFix,
    onBearingChange,
    onCameraModeChange,
    navigationActive = false,
    recenterControl = false,
    recenterLabel = 'Recenter',
    compactControls = false,
    onMapClick,
    draftPoint,
    rawPoint,
    framed = false,
    label,
    interactive = true,
    showCompass = true,
    compassLabel = 'Reset north',
    className = '',
    baseMapMode = 'pmtiles',
    mapStyleId = 'field-console'
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const readyRef = useRef(false)
  const stopMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map())
  const youMarkerRef = useRef<maplibregl.Marker | null>(null)
  const draftMarkerRef = useRef<maplibregl.Marker | null>(null)
  const rawMarkerRef = useRef<maplibregl.Marker | null>(null)
  const routeRef = useRef(route)
  const routeSegmentsRef = useRef(routeSegments)
  const navigationPathRef = useRef(navigationPath)
  const networkRef = useRef(network)
  const stopsRef = useRef(stops)
  const activeStopIdRef = useRef(activeStopId)
  const draftPointRef = useRef(draftPoint)
  const rawPointRef = useRef(rawPoint)
  const youPosRef = useRef<Coordinate | undefined>(you)
  const userInteractedRef = useRef(false)
  const cameraModeRef = useRef<MapCameraMode>('overview')
  const navigationActiveRef = useRef(navigationActive)
  const locationSequenceRef = useRef(0)
  const hasPublishedLocationRef = useRef(false)
  const headingRef = useRef(0)
  const bearingRef = useRef(0)
  const onSelectStopRef = useRef(onSelectStop)
  const onMapBackgroundClickRef = useRef(onMapBackgroundClick)
  const onMapClickRef = useRef(onMapClick)
  const onLocationChangeRef = useRef(onLocationChange)
  const transformLocationFixRef = useRef(transformLocationFix)
  const onBearingChangeRef = useRef(onBearingChange)
  const onCameraModeChangeRef = useRef(onCameraModeChange)
  const [bearing, setBearing] = useState(0)
  onSelectStopRef.current = onSelectStop
  onMapBackgroundClickRef.current = onMapBackgroundClick
  onMapClickRef.current = onMapClick
  onLocationChangeRef.current = onLocationChange
  transformLocationFixRef.current = transformLocationFix
  onBearingChangeRef.current = onBearingChange
  onCameraModeChangeRef.current = onCameraModeChange
  navigationActiveRef.current = navigationActive
  routeRef.current = route
  routeSegmentsRef.current = routeSegments
  navigationPathRef.current = navigationPath
  networkRef.current = network
  stopsRef.current = stops
  activeStopIdRef.current = activeStopId
  draftPointRef.current = draftPoint
  rawPointRef.current = rawPoint

  const allPoints = (): Coordinate[] => {
    const currentRoute = routeRef.current
    const currentSegments = routeSegmentsRef.current
    const currentNavigationPath = navigationPathRef.current
    const currentStops = stopsRef.current
    const currentNetwork = networkRef.current
    const activePoints = [
      ...currentRoute,
      ...currentSegments.flatMap((segment) => segment.coordinates),
      ...(currentNavigationPath?.coordinates ?? []),
      ...currentStops.map((stop) => stop.location),
      ...(youPosRef.current ? [youPosRef.current] : [])
    ]
    return activePoints.length > 0 ? activePoints : currentNetwork.flat()
  }

  const routeOverviewPoints = (): Coordinate[] => {
    const currentRoute = routeRef.current
    const currentSegments = routeSegmentsRef.current
    const currentStops = stopsRef.current
    return [
      ...currentRoute,
      ...currentSegments.flatMap((segment) => segment.coordinates),
      ...currentStops.map((stop) => stop.location)
    ]
  }

  const applyHeadingToMarkers = (heading = headingRef.current) => {
    const value = `${normalizeHeading(heading - bearingRef.current)}deg`
    ;[youMarkerRef.current, rawMarkerRef.current, draftMarkerRef.current].forEach((marker) => {
      marker?.getElement().style.setProperty('--netmap-heading', value)
    })
  }

  const syncBearing = (map: maplibregl.Map) => {
    const next = map.getBearing()
    bearingRef.current = next
    setBearing(next)
    onBearingChangeRef.current?.(next)
    applyHeadingToMarkers()
  }

  const reportCameraMode = (mode: MapCameraMode) => {
    if (cameraModeRef.current === mode) return
    cameraModeRef.current = mode
    onCameraModeChangeRef.current?.(mode)
  }

  const createLocationMarker = (variant: 'you' | 'raw' | 'draft') => {
    const el = document.createElement('div')
    el.className = `netmap-location-marker netmap-location-marker--${variant}`
    if (variant === 'you') {
      const pulse = document.createElement('span')
      pulse.className = 'netmap-location-marker__pulse'
      el.append(pulse)
    }
    const arrow = document.createElement('span')
    arrow.className = 'netmap-location-marker__arrow'
    el.append(arrow)
    el.style.setProperty('--netmap-heading', `${normalizeHeading(headingRef.current - bearingRef.current)}deg`)
    return el
  }

  const syncRouteSources = (animateFit = false) => {
    const map = mapRef.current
    if (!map) return
    const currentRoute = routeRef.current
    const currentSegments = routeSegmentsRef.current
    const currentNavigationPath = navigationPathRef.current
    const currentNetwork = networkRef.current
    const routeLines = currentSegments.length === 0 && currentRoute.length >= 2 ? [currentRoute] : []
    ;(map.getSource('route') as maplibregl.GeoJSONSource | undefined)?.setData(
      lineFeatureCollection(routeLines)
    )
    ;(map.getSource('route-segments-solid') as maplibregl.GeoJSONSource | undefined)?.setData(
      segmentFeatureCollection(currentSegments, 'network')
    )
    ;(map.getSource('route-segments-fallback') as maplibregl.GeoJSONSource | undefined)?.setData(
      segmentFeatureCollection(currentSegments, 'direct-fallback')
    )
    ;(map.getSource('navigation-path-solid') as maplibregl.GeoJSONSource | undefined)?.setData(
      currentNavigationPath
        ? segmentFeatureCollection([currentNavigationPath], 'network')
        : lineFeatureCollection([])
    )
    ;(map.getSource('navigation-path-fallback') as maplibregl.GeoJSONSource | undefined)?.setData(
      currentNavigationPath
        ? segmentFeatureCollection([currentNavigationPath], 'direct-fallback')
        : lineFeatureCollection([])
    )
    ;(map.getSource('network') as maplibregl.GeoJSONSource | undefined)?.setData(
      lineFeatureCollection(currentNetwork)
    )
    if (animateFit && !map.isMoving() && !userInteractedRef.current) fitToData(true)
  }

  const installOverlayLayers = (map: maplibregl.Map) => {
    readyRef.current = false
    enforceFlatPitch(map)

    if (!map.getSource('network')) {
      map.addSource('network', { type: 'geojson', data: lineFeatureCollection(networkRef.current) })
    }
    if (!map.getLayer('network-line')) {
      const paint = HIGHLIGHT_ROUTE_LINE
      map.addLayer({
        id: 'network-line',
        type: 'line',
        source: 'network',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': WHITE, 'line-width': paint.networkWidth, 'line-opacity': paint.networkOpacity }
      })
    }

    if (!map.getSource('route')) {
      const currentRoute = routeRef.current
      const routeLines = currentRoute.length >= 2 ? [currentRoute] : []
      map.addSource('route', { type: 'geojson', data: lineFeatureCollection(routeLines) })
    }
    if (!map.getLayer('route-halo')) {
      const paint = HIGHLIGHT_ROUTE_LINE
      map.addLayer({
        id: 'route-halo',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': INK, 'line-width': paint.haloWidth, 'line-opacity': paint.haloOpacity }
      })
    }
    if (!map.getLayer('route-line')) {
      const paint = HIGHLIGHT_ROUTE_LINE
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': WHITE, 'line-width': paint.lineWidth, 'line-opacity': paint.lineOpacity }
      })
    }
    if (!map.getSource('route-segments-solid')) {
      map.addSource('route-segments-solid', {
        type: 'geojson',
        data: segmentFeatureCollection(routeSegmentsRef.current, 'network')
      })
    }
    if (!map.getLayer('route-segment-halo')) {
      const paint = HIGHLIGHT_ROUTE_LINE
      map.addLayer({
        id: 'route-segment-halo',
        type: 'line',
        source: 'route-segments-solid',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': INK, 'line-width': paint.haloWidth, 'line-opacity': 0.84 }
      })
    }
    if (!map.getLayer('route-segment-line')) {
      const paint = HIGHLIGHT_ROUTE_LINE
      map.addLayer({
        id: 'route-segment-line',
        type: 'line',
        source: 'route-segments-solid',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': WHITE, 'line-width': paint.lineWidth, 'line-opacity': paint.lineOpacity }
      })
    }
    if (!map.getSource('route-segments-fallback')) {
      map.addSource('route-segments-fallback', {
        type: 'geojson',
        data: segmentFeatureCollection(routeSegmentsRef.current, 'direct-fallback')
      })
    }
    if (!map.getLayer('route-fallback-line')) {
      map.addLayer({
        id: 'route-fallback-line',
        type: 'line',
        source: 'route-segments-fallback',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': FALLBACK,
          'line-width': 4,
          'line-opacity': 0.95,
          'line-dasharray': [1.2, 1]
        }
      })
    }
    if (!map.getSource('navigation-path-solid')) {
      map.addSource('navigation-path-solid', { type: 'geojson', data: lineFeatureCollection([]) })
    }
    if (!map.getLayer('navigation-path-halo')) {
      map.addLayer({
        id: 'navigation-path-halo',
        type: 'line',
        source: 'navigation-path-solid',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': INK, 'line-width': 13, 'line-opacity': 0.92 }
      })
    }
    if (!map.getLayer('navigation-path-line')) {
      map.addLayer({
        id: 'navigation-path-line',
        type: 'line',
        source: 'navigation-path-solid',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': GUIDE, 'line-width': 6, 'line-opacity': 1 }
      })
    }
    if (!map.getSource('navigation-path-fallback')) {
      map.addSource('navigation-path-fallback', { type: 'geojson', data: lineFeatureCollection([]) })
    }
    if (!map.getLayer('navigation-fallback-halo')) {
      map.addLayer({
        id: 'navigation-fallback-halo',
        type: 'line',
        source: 'navigation-path-fallback',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': INK,
          'line-width': 13,
          'line-opacity': 0.92,
          'line-dasharray': [1.2, 1]
        }
      })
    }
    if (!map.getLayer('navigation-fallback-line')) {
      map.addLayer({
        id: 'navigation-fallback-line',
        type: 'line',
        source: 'navigation-path-fallback',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': FALLBACK,
          'line-width': 6,
          'line-opacity': 1,
          'line-dasharray': [1.2, 1]
        }
      })
    }
    applyRouteLineHighlight(map)

    syncRouteSources(false)
    syncStops()
    syncYou()
    syncDraftPoints()
    readyRef.current = true
    fitToData(false)
  }

  const fitToPoints = (pts: Coordinate[], animate = false) => {
    const map = mapRef.current
    if (!map || pts.length === 0) return
    if (pts.length === 1) {
      map.jumpTo({ center: pts[0], zoom: 16, pitch: 0 })
      reportCameraMode('overview')
      return
    }
    const bounds = new maplibregl.LngLatBounds(pts[0], pts[0])
    pts.forEach((point) => {
      bounds.extend(point)
    })
    map.fitBounds(bounds, { padding: framed ? 36 : 70, maxZoom: 17, duration: animate ? 600 : 0 })
    reportCameraMode('overview')
  }

  const fitToData = (animate = false) => {
    fitToPoints(allPoints(), animate)
  }

  const fitToRoute = (animate = false) => {
    fitToPoints(routeOverviewPoints(), animate)
  }

  const followLocation = (coordinate: Coordinate, animate: boolean) => {
    mapRef.current?.easeTo({
      center: coordinate,
      zoom: navigationActiveRef.current ? 17 : 16.5,
      offset: navigationActiveRef.current ? [0, 96] : [0, 0],
      duration: animate ? 600 : 350,
      pitch: 0
    })
    reportCameraMode('follow')
  }

  const publishPosition = async (position: GeolocationPosition, forceFollow = false) => {
    const sequence = locationSequenceRef.current + 1
    locationSequenceRef.current = sequence
    const rawFix = locationFixFromPosition(position)
    let fix = rawFix
    try {
      fix = (await transformLocationFixRef.current?.(rawFix)) ?? rawFix
    } catch {
      fix = rawFix
    }
    if (sequence !== locationSequenceRef.current) return

    youPosRef.current = fix.coordinate
    onLocationChangeRef.current?.(fix)
    syncYou()

    const shouldFollow =
      !userInteractedRef.current &&
      (forceFollow || !hasPublishedLocationRef.current || cameraModeRef.current === 'follow')
    hasPublishedLocationRef.current = true
    if (shouldFollow) followLocation(fix.coordinate, forceFollow || cameraModeRef.current !== 'follow')
  }

  const recenter = () => {
    void requestNetrinHeadingPermission()
    userInteractedRef.current = false
    if (youPosRef.current) {
      followLocation(youPosRef.current, false)
      return
    }
    if (!navigator.geolocation) {
      fitToData(true)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void publishPosition(pos, true)
      },
      () => fitToData(true),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 8000 }
    )
  }

  const followCoordinate = (coordinate: Coordinate) => {
    userInteractedRef.current = false
    youPosRef.current = coordinate
    syncYou()
    followLocation(coordinate, true)
  }

  const resetNorth = () => {
    const map = mapRef.current
    if (!map) return
    map.easeTo({ bearing: 0, pitch: 0, duration: 300 })
  }

  const fitRoute = () => {
    userInteractedRef.current = false
    fitToRoute(true)
  }

  useImperativeHandle(ref, () => ({ recenter, followCoordinate, resetNorth, fitRoute }))

  // Init map once.
  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false
    let offlineFallbackApplied = false

    const { style, mode } = resolveBaseStyle(baseMapMode, mapStyleId)

    if (cancelled || !containerRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style,
      center: route[0] ?? you ?? CAMPUS_CENTER,
      zoom: 15,
      bearing: 0,
      pitch: 0,
      attributionControl: false,
      interactive,
      dragPan: interactive,
      touchZoomRotate: interactive,
      dragRotate: interactive,
      scrollZoom: interactive,
      doubleClickZoom: interactive,
      keyboard: interactive,
      pitchWithRotate: false,
      touchPitch: false,
      cooperativeGestures: false
    })
    mapRef.current = map
    applyInteractionHandlers(map, interactive)
    const handleMapClick = (event: maplibregl.MapMouseEvent) => {
      onMapBackgroundClickRef.current?.()
      onMapClickRef.current?.([event.lngLat.lng, event.lngLat.lat])
    }
    const markManualCamera = (event: { originalEvent?: Event }) => {
      if (!event.originalEvent) return
      userInteractedRef.current = true
      reportCameraMode('manualBrowse')
    }
    const handleManualCamera = (event: { originalEvent?: Event }) => markManualCamera(event)
    const handleZoom = () => syncStopMarkerScale(map.getZoom())
    map.on('click', handleMapClick)
    map.on('rotate', () => syncBearing(map))
    map.on('pitch', () => enforceFlatPitch(map))
    map.on('zoom', handleZoom)
    map.on('dragstart', handleManualCamera)
    map.on('zoomstart', handleManualCamera)
    map.on('rotatestart', handleManualCamera)
    map.on('wheel', handleManualCamera)

    if (mode === 'pmtiles') {
      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left')
    }

    const installWhenReady = () => {
      if (cancelled || !mapRef.current) return
      if (!map.isStyleLoaded()) {
        window.requestAnimationFrame(installWhenReady)
        return
      }
      installOverlayLayers(map)
    }

    const handleMapError = (event: { error?: unknown }) => {
      if (mode !== 'pmtiles' || offlineFallbackApplied || cancelled || readyRef.current) return
      offlineFallbackApplied = true
      console.warn('[netrin-map] PMTiles basemap failed; using offline fallback.', event.error)
      readyRef.current = false
      map.setStyle(offlineStyle(mapStyleId))
      enforceFlatPitch(map)
      installWhenReady()
    }

    map.on('load', installWhenReady)
    map.on('style.load', installWhenReady)
    map.on('error', handleMapError)

    return () => {
      cancelled = true
      stopMarkersRef.current.forEach((marker) => {
        marker.remove()
      })
      stopMarkersRef.current.clear()
      youMarkerRef.current?.remove()
      youMarkerRef.current = null
      draftMarkerRef.current?.remove()
      draftMarkerRef.current = null
      rawMarkerRef.current?.remove()
      rawMarkerRef.current = null
      map.off('click', handleMapClick)
      map.off('load', installWhenReady)
      map.off('style.load', installWhenReady)
      map.off('error', handleMapError)
      map.off('zoom', handleZoom)
      map.off('dragstart', handleManualCamera)
      map.off('zoomstart', handleManualCamera)
      map.off('rotatestart', handleManualCamera)
      map.off('wheel', handleManualCamera)
      mapRef.current?.remove()
      mapRef.current = null
      readyRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseMapMode, mapStyleId])

  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      const next = headingFromEvent(event as DeviceOrientationEventWithCompass)
      if (next == null) return
      headingRef.current = next
      applyHeadingToMarkers(next)
    }
    window.addEventListener('deviceorientation', handleOrientation, true)
    window.addEventListener('deviceorientationabsolute', handleOrientation, true)
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation, true)
      window.removeEventListener('deviceorientationabsolute', handleOrientation, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Live geolocation watch.
  useEffect(() => {
    if (!locate || !navigator.geolocation) return
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        void publishPosition(pos)
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 }
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [locate])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => mapRef.current?.resize())
    return () => window.cancelAnimationFrame(frame)
  }, [navigationActive])

  // Keep the active route + waypoints + network in sync.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    syncRouteSources(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, network, routeSegments, navigationPath])

  function syncStopMarkerScale(zoom = mapRef.current?.getZoom()) {
    if (zoom == null) return
    const scale = stopMarkerScale(zoom).toFixed(3)
    stopMarkersRef.current.forEach((marker) => {
      marker.getElement().style.setProperty('--netmap-stop-scale', scale)
    })
  }

  function syncStops() {
    const map = mapRef.current
    if (!map) return
    const seen = new Set<string>()
    const currentStops = stopsRef.current
    const currentActiveStopId = activeStopIdRef.current
    currentStops.forEach((stop) => {
      seen.add(stop.id)
      let marker = stopMarkersRef.current.get(stop.id)
      const isActive = stop.id === currentActiveStopId
      if (!marker) {
        const el = document.createElement('button')
        el.type = 'button'
        el.className = 'netmap-stop'
        const badge = document.createElement('span')
        badge.className = 'netmap-stop__badge'
        badge.textContent = String(stop.index)
        el.append(badge)
        if (stop.label) el.setAttribute('aria-label', stop.label)
        el.addEventListener('click', (e) => {
          e.stopPropagation()
          onSelectStopRef.current?.(stop.id)
        })
        marker = new maplibregl.Marker({ element: el }).setLngLat(stop.location).addTo(map)
        stopMarkersRef.current.set(stop.id, marker)
      } else {
        marker.setLngLat(stop.location)
      }
      const el = marker.getElement()
      el.classList.add('netmap-stop')
      el.classList.toggle('netmap-stop--active', isActive)
      if (stop.label) el.setAttribute('aria-label', stop.label)
      const badge =
        el.querySelector<HTMLSpanElement>('.netmap-stop__badge') ?? document.createElement('span')
      badge.className = 'netmap-stop__badge'
      badge.textContent = String(stop.index)
      if (!badge.parentElement) el.replaceChildren(badge)
    })
    stopMarkersRef.current.forEach((marker, id) => {
      if (!seen.has(id)) {
        marker.remove()
        stopMarkersRef.current.delete(id)
      }
    })
    syncStopMarkerScale(map.getZoom())
  }

  function syncYou() {
    const map = mapRef.current
    if (!map) return
    const pos = youPosRef.current
    if (!pos) {
      youMarkerRef.current?.remove()
      youMarkerRef.current = null
      return
    }
    if (!youMarkerRef.current) {
      const el = createLocationMarker('you')
      youMarkerRef.current = new maplibregl.Marker({ element: el }).setLngLat(pos).addTo(map)
    } else {
      youMarkerRef.current.setLngLat(pos)
    }
    applyHeadingToMarkers()
  }

  function syncDraftPoints() {
    const map = mapRef.current
    if (!map) return
    const currentRawPoint = rawPointRef.current
    const currentDraftPoint = draftPointRef.current

    if (currentRawPoint) {
      if (!rawMarkerRef.current) {
        const element = createLocationMarker('raw')
        rawMarkerRef.current = new maplibregl.Marker({ element })
          .setLngLat(currentRawPoint)
          .addTo(map)
      } else {
        rawMarkerRef.current.setLngLat(currentRawPoint)
      }
    } else {
      rawMarkerRef.current?.remove()
      rawMarkerRef.current = null
    }

    if (currentDraftPoint) {
      if (!draftMarkerRef.current) {
        const element = createLocationMarker('draft')
        draftMarkerRef.current = new maplibregl.Marker({ element })
          .setLngLat(currentDraftPoint)
          .addTo(map)
      } else {
        draftMarkerRef.current.setLngLat(currentDraftPoint)
      }
    } else {
      draftMarkerRef.current?.remove()
      draftMarkerRef.current = null
    }
    applyHeadingToMarkers()
  }

  // Re-sync stop markers when stops / active selection change.
  useEffect(() => {
    if (!readyRef.current) return
    syncStops()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, activeStopId])

  // Update fallback "you" position from props.
  useEffect(() => {
    youPosRef.current = you
    if (readyRef.current) syncYou()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [you])

  useEffect(() => {
    if (readyRef.current) syncDraftPoints()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftPoint, rawPoint])

  return (
    <div
      className={['netmap', framed ? 'netmap--framed' : '', compactControls ? 'netmap--compact-controls' : '', className]
        .filter(Boolean)
        .join(' ')}
    >
      {label ? (
        <span className="netmap__chip">
          <svg viewBox="0 0 24 24" width={14} height={14} fill="currentColor" aria-hidden shapeRendering="crispEdges">
            <path d="M9 5h6v2H9zM7 7h2v2H7zm0 8h2v2H7zm8 0h2v2h-2zm0-8h2v2h-2zm2 2h2v6h-2zm-8 8h6v2H9zM5 9h2v6H5zm14 2h4v2h-4zM1 11h4v2H1zM11 1h2v4h-2zm0 18h2v4h-2z" />
          </svg>
          {label}
        </span>
      ) : null}
      <div
        ref={containerRef}
        className={`netmap__canvas ${onMapClick ? 'netmap__canvas--editable' : ''}`.trim()}
      />
      {recenterControl ? (
        <button type="button" className="netmap__recenter" aria-label={recenterLabel} onClick={recenter}>
          <PixelIcon name="gps" size={compactControls ? 18 : 20} />
        </button>
      ) : null}
      {showCompass && interactive ? (
        <button type="button" className="netmap__compass" aria-label={compassLabel} onClick={resetNorth}>
          <span className="netmap__compass-needle" style={{ transform: `rotate(${-bearing}deg)` }}>
            <PixelIcon name="compass" size={compactControls ? 18 : 22} />
          </span>
          <span className="netmap__compass-n">N</span>
        </button>
      ) : null}
    </div>
  )
})

export default NetrinMap
