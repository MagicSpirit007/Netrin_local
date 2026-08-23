import type {
  Coordinate,
  RouteSegment,
  RouteSegmentKind,
  RouteSegmentPart
} from '../../data/types'
import { distanceMeters, lineLengthMeters, projectPointToLine } from '../navigation/geo'

const SNAP_SPLIT_THRESHOLD_METERS = 35
const DUPLICATE_POINT_THRESHOLD_METERS = 0.6

type SegmentStop = {
  id: string
  location: Coordinate
}

function isCoordinate(value: unknown): value is Coordinate {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    Number.isFinite(value[0]) &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[1])
  )
}

function cloneCoordinate(coordinate: Coordinate): Coordinate {
  return [coordinate[0], coordinate[1]]
}

function pushCoordinate(list: Coordinate[], coordinate: Coordinate) {
  const previous = list[list.length - 1]
  if (previous && distanceMeters(previous, coordinate) <= DUPLICATE_POINT_THRESHOLD_METERS) return
  list.push(cloneCoordinate(coordinate))
}

function normalizeRouteSegmentParts(value: unknown): RouteSegmentPart[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item): RouteSegmentPart[] => {
    if (!item || typeof item !== 'object') return []
    const part = item as Partial<RouteSegmentPart>
    if (
      (part.kind !== 'network' && part.kind !== 'direct-fallback') ||
      !Array.isArray(part.coordinates)
    ) {
      return []
    }

    const coordinates = part.coordinates.filter(isCoordinate).map(cloneCoordinate)
    if (coordinates.length < 2) return []
    return [
      {
        coordinates,
        kind: part.kind,
        distanceMeters: lineLengthMeters(coordinates)
      }
    ]
  })
}

function coordinatesFromParts(parts: RouteSegmentPart[]): Coordinate[] {
  const coordinates: Coordinate[] = []
  parts.forEach((part) => {
    part.coordinates.forEach((coordinate) => {
      pushCoordinate(coordinates, coordinate)
    })
  })
  return coordinates
}

export function routeSegmentParts(segment: RouteSegment): RouteSegmentPart[] {
  const parts = normalizeRouteSegmentParts(segment.parts)
  if (parts.length > 0) return parts
  return [
    {
      coordinates: segment.coordinates.map(cloneCoordinate),
      kind: segment.kind,
      distanceMeters: lineLengthMeters(segment.coordinates)
    }
  ]
}

export function routeSegmentHasFallbackPart(segment: RouteSegment): boolean {
  return routeSegmentParts(segment).some((part) => part.kind === 'direct-fallback')
}

export function createRouteSegmentFromParts(
  id: string,
  fromPointId: string,
  toPointId: string,
  parts: RouteSegmentPart[],
  snapDistanceMeters?: { from: number; to: number },
  kindOverride?: RouteSegmentKind
): RouteSegment {
  const normalizedParts = normalizeRouteSegmentParts(parts)
  const coordinates = coordinatesFromParts(normalizedParts)
  const kind =
    kindOverride ??
    (normalizedParts.some((part) => part.kind === 'direct-fallback')
      ? 'direct-fallback'
      : 'network')

  return {
    id,
    fromPointId,
    toPointId,
    coordinates,
    kind,
    distanceMeters: lineLengthMeters(coordinates),
    snapDistanceMeters,
    parts: normalizedParts
  }
}

export function createDirectFallbackSegment(
  id: string,
  fromPointId: string,
  toPointId: string,
  from: Coordinate,
  to: Coordinate
): RouteSegment {
  const coordinates = [cloneCoordinate(from), cloneCoordinate(to)]
  return createRouteSegmentFromParts(id, fromPointId, toPointId, [
    {
      coordinates,
      kind: 'direct-fallback',
      distanceMeters: distanceMeters(from, to)
    }
  ])
}

export function normalizeRouteSegments(value: unknown): RouteSegment[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item): RouteSegment[] => {
    if (!item || typeof item !== 'object') return []
    const segment = item as Partial<RouteSegment>
    if (
      typeof segment.id !== 'string' ||
      typeof segment.fromPointId !== 'string' ||
      typeof segment.toPointId !== 'string' ||
      (segment.kind !== 'network' && segment.kind !== 'direct-fallback') ||
      !Array.isArray(segment.coordinates)
    ) {
      return []
    }

    const parts = normalizeRouteSegmentParts(segment.parts)
    const coordinates =
      parts.length > 0
        ? coordinatesFromParts(parts)
        : segment.coordinates.filter(isCoordinate).map(cloneCoordinate)
    if (coordinates.length < 2) return []

    return [
      {
        id: segment.id,
        fromPointId: segment.fromPointId,
        toPointId: segment.toPointId,
        coordinates,
        kind: segment.kind,
        distanceMeters:
          typeof segment.distanceMeters === 'number' && Number.isFinite(segment.distanceMeters)
            ? segment.distanceMeters
            : lineLengthMeters(coordinates),
        snapDistanceMeters: segment.snapDistanceMeters,
        parts: parts.length > 0 ? parts : undefined
      }
    ]
  })
}

export function collapseAmbiguousSegmentsForStops(
  segments: RouteSegment[],
  stops: SegmentStop[]
): RouteSegment[] {
  const normalized = normalizeRouteSegments(segments)
  if (normalized.length === 0 || stops.length < 2) return normalized

  const stopById = new Map(stops.map((stop) => [stop.id, stop]))
  return normalized.map((segment) => {
    if (!routeSegmentHasFallbackPart(segment)) return segment
    const from = stopById.get(segment.fromPointId)
    const to = stopById.get(segment.toPointId)
    if (!from || !to) return segment
    return createDirectFallbackSegment(
      segment.id,
      segment.fromPointId,
      segment.toPointId,
      from.location,
      to.location
    )
  })
}

export function routeLineFromSegments(
  segments: RouteSegment[],
  fallback: Coordinate[] = []
): Coordinate[] {
  const normalized = normalizeRouteSegments(segments)
  if (normalized.length === 0) return fallback.map(cloneCoordinate)

  const line: Coordinate[] = []
  normalized.forEach((segment) => {
    segment.coordinates.forEach((coordinate) => {
      pushCoordinate(line, coordinate)
    })
  })
  return line.length >= 2 ? line : fallback.map(cloneCoordinate)
}

export function buildDirectSegmentsForStops(stops: SegmentStop[]): RouteSegment[] {
  const segments: RouteSegment[] = []
  for (let index = 1; index < stops.length; index += 1) {
    const from = stops[index - 1]
    const to = stops[index]
    segments.push(
      createDirectFallbackSegment(
        `segment-${from.id}-${to.id}`,
        from.id,
        to.id,
        from.location,
        to.location
      )
    )
  }
  return segments
}

function isStopOnlyWaypointLine(stops: SegmentStop[], waypoints: Coordinate[]): boolean {
  return (
    waypoints.length === stops.length &&
    stops.every(
      (stop, index) =>
        waypoints[index] &&
        distanceMeters(stop.location, waypoints[index]) <= DUPLICATE_POINT_THRESHOLD_METERS
    )
  )
}

export function buildSegmentsFromStopsAndWaypoints(
  stops: SegmentStop[],
  waypoints: Coordinate[] = []
): RouteSegment[] {
  if (stops.length < 2) return []
  if (waypoints.length < 2) return buildDirectSegmentsForStops(stops)
  if (isStopOnlyWaypointLine(stops, waypoints)) return buildDirectSegmentsForStops(stops)

  const segments: RouteSegment[] = []
  for (let index = 1; index < stops.length; index += 1) {
    const from = stops[index - 1]
    const to = stops[index]
    const fromProjection = projectPointToLine(from.location, waypoints)
    const toProjection = projectPointToLine(to.location, waypoints)

    if (
      !fromProjection ||
      !toProjection ||
      fromProjection.distanceMeters > SNAP_SPLIT_THRESHOLD_METERS ||
      toProjection.distanceMeters > SNAP_SPLIT_THRESHOLD_METERS ||
      toProjection.distanceAlongMeters < fromProjection.distanceAlongMeters
    ) {
      segments.push(
        createDirectFallbackSegment(
          `segment-${from.id}-${to.id}`,
          from.id,
          to.id,
          from.location,
          to.location
        )
      )
      continue
    }

    if (
      fromProjection.distanceMeters > DUPLICATE_POINT_THRESHOLD_METERS ||
      toProjection.distanceMeters > DUPLICATE_POINT_THRESHOLD_METERS
    ) {
      segments.push(
        createDirectFallbackSegment(
          `segment-${from.id}-${to.id}`,
          from.id,
          to.id,
          from.location,
          to.location
        )
      )
      continue
    }

    const coordinates: Coordinate[] = []
    pushCoordinate(coordinates, from.location)
    pushCoordinate(coordinates, fromProjection.coordinate)
    for (
      let pointIndex = fromProjection.segmentIndex + 1;
      pointIndex <= toProjection.segmentIndex;
      pointIndex += 1
    ) {
      pushCoordinate(coordinates, waypoints[pointIndex])
    }
    pushCoordinate(coordinates, toProjection.coordinate)
    pushCoordinate(coordinates, to.location)

    const parts: RouteSegmentPart[] = []
    if (distanceMeters(from.location, fromProjection.coordinate) > DUPLICATE_POINT_THRESHOLD_METERS) {
      parts.push({
        coordinates: [from.location, fromProjection.coordinate],
        kind: 'direct-fallback',
        distanceMeters: fromProjection.distanceMeters
      })
    }
    const networkCoordinates = coordinates.slice(
      distanceMeters(from.location, fromProjection.coordinate) > DUPLICATE_POINT_THRESHOLD_METERS ? 1 : 0,
      distanceMeters(to.location, toProjection.coordinate) > DUPLICATE_POINT_THRESHOLD_METERS ? -1 : undefined
    )
    if (networkCoordinates.length >= 2) {
      parts.push({
        coordinates: networkCoordinates,
        kind: 'network',
        distanceMeters: lineLengthMeters(networkCoordinates)
      })
    }
    if (distanceMeters(toProjection.coordinate, to.location) > DUPLICATE_POINT_THRESHOLD_METERS) {
      parts.push({
        coordinates: [toProjection.coordinate, to.location],
        kind: 'direct-fallback',
        distanceMeters: toProjection.distanceMeters
      })
    }

    segments.push(
      createRouteSegmentFromParts(
        `segment-${from.id}-${to.id}`,
        from.id,
        to.id,
        parts,
        {
          from: fromProjection.distanceMeters,
          to: toProjection.distanceMeters
        }
      )
    )
  }
  return segments
}
