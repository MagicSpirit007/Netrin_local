import localforage from 'localforage'
import { loadMediaBlob } from './drafts'
import { compressImage } from '../lib/image'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import {
  buildDirectSegmentsForStops,
  buildSegmentsFromStopsAndWaypoints,
  collapseAmbiguousSegmentsForStops,
  normalizeRouteSegments,
  routeLineFromSegments
} from '../lib/routing/routeSegments'
import { planSegmentsForPoints } from '../lib/routing/campusRoutePlanner'
import {
  isSafeStorageSegment,
  isValidPublishRoute,
  MAX_IMAGE_OUTPUT_BYTES,
  MAX_PUBLIC_ROUTES,
  parsePublicRouteRow
} from './routeValidation'
import type {
  Coordinate,
  DownloadedRoute,
  DownloadedStop,
  RouteDraft,
  RoutePublicRow,
  RouteSegment,
  RouteStopInline
} from './types'

const EMPTY_TEXT = { 'zh-CN': '', en: '' }
const DOWNLOADS_KEY = 'netrin.downloaded'

function routeMediaPublicUrl(path: string | undefined): string | undefined {
  if (!path || !supabase) return undefined
  return supabase.storage.from('route-media').getPublicUrl(path).data.publicUrl
}

function keyPointTitle(index: number) {
  return {
    'zh-CN': `关键点 ${index + 1}`,
    en: `Key point ${index + 1}`
  }
}

async function planSegmentsForStops(stops: DownloadedStop[]): Promise<RouteSegment[]> {
  if (stops.length < 2) return []
  try {
    return await planSegmentsForPoints(
      stops.map((stop) => ({
        id: stop.id,
        final: stop.location,
        snapped: false
      }))
    )
  } catch {
    return buildDirectSegmentsForStops(stops)
  }
}

/** routes_public 一行 → 前端下载路线。geojson/stops 可能为 null，要容错。 */
export async function rowToDownloadedRoute(row: RoutePublicRow): Promise<DownloadedRoute> {
  const waypoints: Coordinate[] = row.geojson?.coordinates ?? []
  const stops: DownloadedStop[] = (row.stops ?? []).map((stop, index) => ({
    id: `${row.id}-s${index + 1}`,
    location: [stop.lng, stop.lat] as Coordinate,
    title: keyPointTitle(index),
    description: { 'zh-CN': stop.text ?? '', en: stop.text ?? '' },
    speciesName: stop.speciesName,
    photoUrl: routeMediaPublicUrl(stop.photo),
    order: index + 1
  }))
  const plannedSegments = await planSegmentsForStops(stops)
  const segments =
    plannedSegments.length > 0 ? plannedSegments : buildSegmentsFromStopsAndWaypoints(stops, waypoints)

  return {
    id: row.id,
    remoteRouteId: row.id,
    title: row.title,
    description: row.description ?? { ...EMPTY_TEXT },
    season: row.season ?? { ...EMPTY_TEXT },
    difficulty: row.difficulty ?? { ...EMPTY_TEXT },
    distance: row.distance ?? '',
    duration: row.duration ?? '',
    author: row.author ?? '',
    tags: row.tags ?? [],
    waypoints: routeLineFromSegments(segments, waypoints),
    segments,
    stops,
    downloadedAt: new Date().toISOString(),
    isLocalEdited: false,
    remoteUpdatedAt: row.created_at
  }
}

/** 无会话则匿名登录（上传前置）。读公共路线不需要它。 */
export async function ensureAnonSession(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  if (!supabase) return { ok: false, error: 'unconfigured' }

  try {
    const { data } = await supabase.auth.getSession()
    if (data.session?.user.id) return { ok: true, userId: data.session.user.id }
    const { data: authData, error } = await supabase.auth.signInAnonymously()
    return error || !authData.user
      ? { ok: false, error: error?.message ?? 'anonymous auth failed' }
      : { ok: true, userId: authData.user.id }
  } catch {
    return { ok: false, error: 'network' }
  }
}

export type FetchResult =
  | { ok: true; routes: DownloadedRoute[] }
  | { ok: false; error: 'unconfigured' | 'network' }

export async function fetchPublicRoutes(): Promise<FetchResult> {
  if (!supabase) return { ok: false, error: 'unconfigured' }

  try {
    const { data, error } = await supabase
      .from('routes_public')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(MAX_PUBLIC_ROUTES)
    if (error) return { ok: false, error: 'network' }
    const rows = Array.isArray(data)
      ? data.map(parsePublicRouteRow).filter((row): row is RoutePublicRow => Boolean(row))
      : []
    const routes = await Promise.all(rows.map(rowToDownloadedRoute))
    return { ok: true, routes }
  } catch {
    return { ok: false, error: 'network' }
  }
}

export type PublishInput = {
  draftId: string
  title: string
  description?: string
  distance?: string
  duration?: string
  author?: string
  waypoints: Coordinate[]
  stops: Array<RouteStopInline & { id: string; photoId?: string }>
}

export type PublishResult =
  | { ok: true; id: string }
  | { ok: false; error: 'unconfigured' | 'auth' | 'network' | 'server' | 'storage' | 'invalid' }

function classifySupabaseWriteError(error: unknown): 'server' {
  console.warn('[netrin-routes] Supabase write failed.', error)
  return 'server'
}

export async function publishRoute(input: PublishInput): Promise<PublishResult> {
  if (!supabase) return { ok: false, error: 'unconfigured' }
  if (!isValidPublishRoute(input)) return { ok: false, error: 'invalid' }

  const session = await ensureAnonSession()
  if (!session.ok) return { ok: false, error: session.error === 'network' ? 'network' : 'auth' }

  try {
    const stops: RouteStopInline[] = []
    for (const stop of input.stops) {
      let photo: string | undefined
      if (stop.photoId) {
        const source = await loadMediaBlob(stop.photoId)
        if (!source) return { ok: false, error: 'invalid' }
        const compressed = await compressImage(source)
        const upload = await uploadRouteMedia(
          compressed,
          session.userId,
          input.draftId,
          stop.id
        )
        if (!upload.ok) return { ok: false, error: upload.error }
        photo = upload.path
      }
      stops.push({
        lng: stop.lng,
        lat: stop.lat,
        text: stop.text,
        speciesName: stop.speciesName,
        photo
      })
    }

    const { data, error } = await supabase.rpc('publish_route', {
      p_title: { 'zh-CN': input.title, en: input.title },
      p_description: { 'zh-CN': input.description ?? '', en: input.description ?? '' },
      p_distance: input.distance ?? '',
      p_duration: input.duration ?? '',
      p_author: input.author ?? '',
      p_waypoints: input.waypoints,
      p_stops: stops
    })
    if (error || !data) return { ok: false, error: classifySupabaseWriteError(error) }
    return { ok: true, id: data as string }
  } catch {
    return { ok: false, error: 'network' }
  }
}

export async function publishRouteDraft(
  draft: RouteDraft,
  fallbackTitle: string
): Promise<PublishResult> {
  const waypoints = routeLineFromSegments(draft.segments, draft.points.map((point) => point.final))
  return publishRoute({
    draftId: draft.id,
    title: draft.title.trim() || fallbackTitle,
    description: draft.note.trim(),
    waypoints,
    stops: draft.points.map((point) => ({
      id: point.id,
      lng: point.final[0],
      lat: point.final[1],
      text: point.text,
      speciesName: point.speciesName,
      photoId: point.photoId
    }))
  })
}

type MediaUploadResult =
  | { ok: true; path: string }
  | { ok: false; error: 'unconfigured' | 'auth' | 'network' | 'storage' | 'invalid' }

export async function uploadRouteMedia(
  blob: Blob,
  userId: string,
  draftId: string,
  pointId: string
): Promise<MediaUploadResult> {
  if (!supabase) return { ok: false, error: 'unconfigured' }
  if (
    blob.type !== 'image/jpeg' ||
    blob.size <= 0 ||
    blob.size > MAX_IMAGE_OUTPUT_BYTES ||
    !isSafeStorageSegment(userId) ||
    !isSafeStorageSegment(draftId) ||
    !isSafeStorageSegment(pointId)
  ) {
    return { ok: false, error: 'invalid' }
  }
  const path = `routes/${userId}/${draftId}/${pointId}.jpg`
  try {
    const { error } = await supabase.storage
      .from('route-media')
      .upload(path, blob, { contentType: 'image/jpeg', upsert: true })
    if (error) {
      console.warn('[netrin-routes] Route media upload failed.', error)
      return { ok: false, error: 'storage' }
    }
    return { ok: true, path }
  } catch {
    return { ok: false, error: 'network' }
  }
}

export async function loadDownloads(): Promise<DownloadedRoute[]> {
  try {
    const value = await localforage.getItem<DownloadedRoute[]>(DOWNLOADS_KEY)
    return Array.isArray(value) ? Promise.all(value.map(normalizeDownloadedRoute)) : []
  } catch {
    return []
  }
}

export async function saveDownloads(list: DownloadedRoute[]): Promise<void> {
  try {
    await localforage.setItem(DOWNLOADS_KEY, list)
  } catch {
    // 存储不可用时静默。
  }
}

export type DownloadedRoutePatch = Partial<
  Pick<
    DownloadedRoute,
    | 'title'
    | 'description'
    | 'season'
    | 'difficulty'
    | 'distance'
    | 'duration'
    | 'tags'
    | 'stops'
    | 'waypoints'
    | 'segments'
  >
>

export function patchDownloadedRoute(
  route: DownloadedRoute,
  patch: DownloadedRoutePatch
): DownloadedRoute {
  const next = {
    ...route,
    ...patch
  }
  const segments =
    patch.segments != null
      ? collapseAmbiguousSegmentsForStops(patch.segments, next.stops)
      : patch.stops || patch.waypoints
        ? buildSegmentsFromStopsAndWaypoints(next.stops, next.waypoints)
        : collapseAmbiguousSegmentsForStops(route.segments, next.stops)
  const waypoints = routeLineFromSegments(segments, next.waypoints)

  return {
    ...next,
    waypoints,
    segments,
    remoteRouteId: route.remoteRouteId ?? route.id,
    isLocalEdited: true,
    localEditedAt: new Date().toISOString()
  }
}

async function normalizeDownloadedRoute(route: DownloadedRoute): Promise<DownloadedRoute> {
  const stops = route.stops ?? []
  const storedSegments = collapseAmbiguousSegmentsForStops(
    normalizeRouteSegments((route as Partial<DownloadedRoute>).segments),
    stops
  )
  const shouldKeepStoredSegments = route.isLocalEdited && storedSegments.length > 0
  const plannedSegments = shouldKeepStoredSegments ? [] : await planSegmentsForStops(stops)
  const nextSegments =
    shouldKeepStoredSegments
      ? storedSegments
      : plannedSegments.length > 0
        ? plannedSegments
        : buildSegmentsFromStopsAndWaypoints(stops, route.waypoints ?? [])
  return {
    ...route,
    waypoints: routeLineFromSegments(nextSegments, route.waypoints ?? []),
    segments: nextSegments,
    stops
  }
}

export { isSupabaseConfigured }
