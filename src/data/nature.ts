import rawNatureData from '../../data/nature.json'
import type {
  ActiveRouteView,
  DownloadedRoute,
  LocaleCode,
  LocalizedText,
  NatureData,
  RouteDraft,
  TrailRoute,
  TrailStop
} from './types'
import { lineLengthMeters } from '../lib/navigation/geo'
import {
  buildSegmentsFromStopsAndWaypoints,
  collapseAmbiguousSegmentsForStops,
  normalizeRouteSegments,
  routeLineFromSegments
} from '../lib/routing/routeSegments'

export const natureData = rawNatureData as NatureData

export const routes: TrailRoute[] = natureData.routes
export const stops: TrailStop[] = natureData.stops

export function textFor(value: LocalizedText, locale: string): string {
  const key: LocaleCode = locale.startsWith('en') ? 'en' : 'zh-CN'
  return value[key] ?? value['zh-CN']
}

export function getRouteById(id: string): TrailRoute | undefined {
  return routes.find((route) => route.id === id)
}

export function getStopsForRoute(route: TrailRoute): TrailStop[] {
  return route.stops
    .map((stopId) => stops.find((stop) => stop.id === stopId))
    .filter((stop): stop is TrailStop => Boolean(stop))
    .sort((a, b) => a.order - b.order)
}

/** 把当前激活路线（随包路线或已下载路线）归一化成 Home 可直接消费的视图。 */
export function resolveActiveRoute(
  activeRouteId: string,
  downloaded: DownloadedRoute[],
  drafts: RouteDraft[] = []
): ActiveRouteView | undefined {
  const trail = getRouteById(activeRouteId)
  if (trail) {
    const routeStops = getStopsForRoute(trail).map((stop) => ({
      id: stop.id,
      location: stop.location,
      title: stop.title,
      description: stop.description,
      speciesName: stop.species.join(' / ') || undefined,
      photoUrl: stop.photoUrl,
      order: stop.order
    }))
    const storedSegments = collapseAmbiguousSegmentsForStops(
      normalizeRouteSegments(trail.segments),
      routeStops
    )
    const segments =
      storedSegments.length > 0
        ? storedSegments
        : buildSegmentsFromStopsAndWaypoints(routeStops, trail.waypoints)
    return {
      id: trail.id,
      title: trail.title,
      description: trail.description,
      distance: trail.distance,
      duration: trail.duration,
      waypoints: routeLineFromSegments(segments, trail.waypoints),
      segments,
      stops: routeStops
    }
  }

  const downloadedRoute = downloaded.find((route) => route.id === activeRouteId)
  if (downloadedRoute) {
    const storedSegments = collapseAmbiguousSegmentsForStops(
      normalizeRouteSegments(downloadedRoute.segments),
      downloadedRoute.stops
    )
    const segments =
      storedSegments.length > 0
        ? storedSegments
        : buildSegmentsFromStopsAndWaypoints(downloadedRoute.stops, downloadedRoute.waypoints)
    return {
      id: downloadedRoute.id,
      title: downloadedRoute.title,
      description: downloadedRoute.description,
      distance: downloadedRoute.distance,
      duration: downloadedRoute.duration,
      waypoints: routeLineFromSegments(segments, downloadedRoute.waypoints),
      segments,
      stops: downloadedRoute.stops
    }
  }

  const draft = drafts.find((item) => item.id === activeRouteId)
  return draft ? routeDraftToActiveRoute(draft) : undefined
}

export function routeDraftToActiveRoute(draft: RouteDraft): ActiveRouteView | undefined {
  if (draft.points.length === 0) return undefined

  const fallbackWaypoints = draft.points.map((point) => point.final)
  const draftStops = draft.points.map((point) => ({ id: point.id, location: point.final }))
  const storedSegments = collapseAmbiguousSegmentsForStops(
    normalizeRouteSegments(draft.segments),
    draftStops
  )
  const segments =
    storedSegments.length > 0
      ? storedSegments
      : buildSegmentsFromStopsAndWaypoints(draftStops, fallbackWaypoints)
  const waypoints = routeLineFromSegments(segments, fallbackWaypoints)
  const distance = lineLengthMeters(waypoints)
  const durationMinutes = Math.max(1, Math.ceil(distance / 75))
  const routeTitle = draft.title.trim() || 'Untitled route'
  const routeDescription = draft.note.trim()

  return {
    id: draft.id,
    title: { 'zh-CN': routeTitle, en: routeTitle },
    description: { 'zh-CN': routeDescription, en: routeDescription },
    distance: distance < 1000 ? `${Math.round(distance)} m` : `${(distance / 1000).toFixed(1)} km`,
    duration: `${durationMinutes} min`,
    waypoints,
    segments,
    stops: draft.points.map((point, index) => ({
      id: point.id,
      location: point.final,
      title: point.speciesName
        ? { 'zh-CN': point.speciesName, en: point.speciesName }
        : { 'zh-CN': `关键点 ${index + 1}`, en: `Key point ${index + 1}` },
      description: { 'zh-CN': point.text, en: point.text },
      speciesName: point.speciesName,
      photoId: point.photoId,
      order: point.index
    }))
  }

}
