import distance from '@turf/distance'
import nearestPointOnLine from '@turf/nearest-point-on-line'
import { point } from '@turf/helpers'
import type { Feature, FeatureCollection, LineString } from 'geojson'
import type { Coordinate } from '../data/types'

type CampusPaths = FeatureCollection<LineString>

type IndexedPath = {
  feature: Feature<LineString>
  minLongitude: number
  minLatitude: number
  maxLongitude: number
  maxLatitude: number
}

let pathsPromise: Promise<IndexedPath[]> | null = null
const CAMPUS_PATHS_URL = `${import.meta.env.BASE_URL}data/campus-paths.json`

function indexPath(feature: Feature<LineString>): IndexedPath {
  let minLongitude = Number.POSITIVE_INFINITY
  let minLatitude = Number.POSITIVE_INFINITY
  let maxLongitude = Number.NEGATIVE_INFINITY
  let maxLatitude = Number.NEGATIVE_INFINITY
  for (const [longitude, latitude] of feature.geometry.coordinates) {
    minLongitude = Math.min(minLongitude, longitude)
    minLatitude = Math.min(minLatitude, latitude)
    maxLongitude = Math.max(maxLongitude, longitude)
    maxLatitude = Math.max(maxLatitude, latitude)
  }
  return { feature, minLongitude, minLatitude, maxLongitude, maxLatitude }
}

async function loadCampusPaths(): Promise<IndexedPath[]> {
  if (!pathsPromise) {
    pathsPromise = fetch(CAMPUS_PATHS_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`Campus paths request failed: ${response.status}`)
        return response.json() as Promise<CampusPaths>
      })
      .then((collection) => collection.features.map(indexPath))
      .catch(() => [])
  }
  return pathsPromise
}

export async function snapPoint(
  raw: Coordinate,
  thresholdMeters = 15
): Promise<{ final: Coordinate; snapped: boolean }> {
  const paths = await loadCampusPaths()
  if (paths.length === 0) return { final: raw, snapped: false }

  const rawFeature = point(raw)
  const latitudeDelta = thresholdMeters / 111_320
  const longitudeDelta =
    thresholdMeters / (111_320 * Math.max(0.2, Math.cos((raw[1] * Math.PI) / 180)))
  const candidates = paths.filter(
    (path) =>
      raw[0] >= path.minLongitude - longitudeDelta &&
      raw[0] <= path.maxLongitude + longitudeDelta &&
      raw[1] >= path.minLatitude - latitudeDelta &&
      raw[1] <= path.maxLatitude + latitudeDelta
  )
  if (candidates.length === 0) return { final: raw, snapped: false }

  let best: Coordinate | null = null
  let bestDistance = Number.POSITIVE_INFINITY

  for (const path of candidates) {
    const candidate = nearestPointOnLine(path.feature, rawFeature)
    const candidateCoordinate = candidate.geometry.coordinates as Coordinate
    const meters = distance(rawFeature, candidate, { units: 'meters' })
    if (meters < bestDistance) {
      bestDistance = meters
      best = candidateCoordinate
    }
  }

  if (!best || bestDistance > thresholdMeters) {
    return { final: raw, snapped: false }
  }

  return { final: best, snapped: true }
}
