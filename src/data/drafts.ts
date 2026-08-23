import localforage from 'localforage'
import type { Coordinate, RecordedPoint, RouteDraft, RouteStopInline } from './types'
import {
  collapseAmbiguousSegmentsForStops,
  normalizeRouteSegments
} from '../lib/routing/routeSegments'

const LEGACY_ROUTE_DRAFTS_KEY = 'netrin.routeDrafts'
const ROUTE_DRAFTS_KEY = 'routeDrafts'

export const draftsStore = localforage.createInstance({
  name: 'netrin',
  storeName: 'drafts',
  description: 'Netrin route and field-note drafts'
})

export const mediaStore = localforage.createInstance({
  name: 'netrin',
  storeName: 'media',
  description: 'Netrin draft photo blobs'
})

type LegacyRouteDraft = {
  id?: unknown
  title?: unknown
  note?: unknown
  snapToRoads?: unknown
  createdAt?: unknown
  waypoints?: unknown
  stops?: unknown
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

function isLegacyStop(value: unknown): value is RouteStopInline {
  if (!value || typeof value !== 'object') return false
  const stop = value as Partial<RouteStopInline>
  return typeof stop.lng === 'number' && typeof stop.lat === 'number'
}

function migrateLegacyDraft(value: LegacyRouteDraft, fallbackIndex: number): RouteDraft {
  const now = new Date().toISOString()
  const id = typeof value.id === 'string' ? value.id : `migrated-${Date.now()}-${fallbackIndex}`
  const createdAt = typeof value.createdAt === 'string' ? value.createdAt : now
  const waypoints = Array.isArray(value.waypoints) ? value.waypoints.filter(isCoordinate) : []
  const stops = Array.isArray(value.stops) ? value.stops.filter(isLegacyStop) : []
  const points: RecordedPoint[] = waypoints.map((coordinate, index) => ({
    id: `${id}-point-${index + 1}`,
    index: index + 1,
    raw: coordinate,
    final: coordinate,
    snapped: false,
    text: stops[index]?.text ?? '',
    speciesName: stops[index]?.speciesName
  }))

  return {
    id,
    title: typeof value.title === 'string' ? value.title : '',
    note: typeof value.note === 'string' ? value.note : '',
    points,
    segments: [],
    snapToRoads: value.snapToRoads !== false,
    syncState: 'local',
    createdAt,
    updatedAt: createdAt
  }
}

function normalizeRouteDraft(value: RouteDraft): RouteDraft {
  const points = Array.isArray(value.points) ? value.points : []
  const segments = collapseAmbiguousSegmentsForStops(
    normalizeRouteSegments((value as Partial<RouteDraft>).segments),
    points.map((point) => ({ id: point.id, location: point.final }))
  )
  return {
    ...value,
    points,
    segments
  }
}

export async function loadRouteDrafts(): Promise<RouteDraft[]> {
  let current: RouteDraft[] = []
  try {
    const stored = await draftsStore.getItem<RouteDraft[]>(ROUTE_DRAFTS_KEY)
    current = Array.isArray(stored) ? stored.map(normalizeRouteDraft) : []
  } catch {
    current = []
  }

  if (typeof window === 'undefined') return current
  const legacyRaw = window.localStorage.getItem(LEGACY_ROUTE_DRAFTS_KEY)
  if (!legacyRaw) return current

  try {
    const parsed = JSON.parse(legacyRaw) as unknown
    if (!Array.isArray(parsed)) {
      window.localStorage.removeItem(LEGACY_ROUTE_DRAFTS_KEY)
      return current
    }

    const migrated = parsed.map((item, index) =>
      migrateLegacyDraft(
        item && typeof item === 'object' ? (item as LegacyRouteDraft) : {},
        index
      )
    )
    const knownIds = new Set(current.map((draft) => draft.id))
    const merged = [...migrated.filter((draft) => !knownIds.has(draft.id)), ...current]
    try {
      await draftsStore.setItem(ROUTE_DRAFTS_KEY, merged)
      window.localStorage.removeItem(LEGACY_ROUTE_DRAFTS_KEY)
    } catch {
      return current
    }
    return merged
  } catch {
    return current
  }
}

export async function saveRouteDrafts(drafts: RouteDraft[]): Promise<void> {
  try {
    await draftsStore.setItem(ROUTE_DRAFTS_KEY, drafts)
  } catch {
    // IndexedDB may be unavailable in private browsing or constrained WebViews.
  }
}

export async function saveMediaBlob(photoId: string, blob: Blob): Promise<void> {
  try {
    await mediaStore.setItem(photoId, blob)
  } catch {
    throw new Error('Media storage unavailable')
  }
}

export async function loadMediaBlob(photoId: string): Promise<Blob | null> {
  try {
    return (await mediaStore.getItem<Blob>(photoId)) ?? null
  } catch {
    return null
  }
}

export async function removeMediaBlob(photoId: string): Promise<void> {
  try {
    await mediaStore.removeItem(photoId)
  } catch {
    // Orphan cleanup is best-effort.
  }
}
