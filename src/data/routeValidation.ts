import type { Coordinate, LocalizedText, RoutePublicRow, RouteStopInline } from './types'

export const MAX_PUBLIC_ROUTES = 100
export const MAX_ROUTE_COORDINATES = 2_000
export const MAX_ROUTE_STOPS = 100
export const MAX_ROUTE_TITLE_LENGTH = 120
export const MAX_ROUTE_DESCRIPTION_LENGTH = 4_000
export const MAX_ROUTE_AUTHOR_LENGTH = 80
export const MAX_STOP_TEXT_LENGTH = 1_000
export const MAX_SPECIES_NAME_LENGTH = 120
export const MAX_ROUTE_TAGS = 20
export const MAX_ROUTE_TAG_LENGTH = 40
export const MAX_IMAGE_INPUT_BYTES = 20 * 1024 * 1024
export const MAX_IMAGE_OUTPUT_BYTES = 5 * 1024 * 1024

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const STORAGE_SEGMENT_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const ROUTE_MEDIA_PATH_PATTERN = /^routes\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\.jpg$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length <= maxLength
}

export function isWgs84Coordinate(value: unknown): value is Coordinate {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    Number.isFinite(value[0]) &&
    value[0] >= -180 &&
    value[0] <= 180 &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[1]) &&
    value[1] >= -90 &&
    value[1] <= 90
  )
}

function readLocalizedText(
  value: unknown,
  maxLength: number,
  requireContent = false
): LocalizedText | undefined {
  if (!isRecord(value)) return undefined
  const zh = value['zh-CN']
  const en = value.en
  if (!isBoundedString(zh, maxLength) || !isBoundedString(en, maxLength)) return undefined
  if (requireContent && !zh.trim() && !en.trim()) return undefined
  return { 'zh-CN': zh, en }
}

function readNullableLocalizedText(
  value: unknown,
  maxLength: number
): LocalizedText | null | undefined {
  if (value === null) return null
  return readLocalizedText(value, maxLength)
}

function readNullableString(value: unknown, maxLength: number): string | null | undefined {
  if (value === null) return null
  return isBoundedString(value, maxLength) ? value : undefined
}

function readNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

export function isSafeStorageSegment(value: string): boolean {
  return STORAGE_SEGMENT_PATTERN.test(value)
}

export function isSafeRouteMediaPath(value: string): boolean {
  return value.length <= 512 && ROUTE_MEDIA_PATH_PATTERN.test(value)
}

function readStops(value: unknown): RouteStopInline[] | null | undefined {
  if (value === null) return null
  if (!Array.isArray(value) || value.length > MAX_ROUTE_STOPS) return undefined

  const stops: RouteStopInline[] = []
  for (const valueStop of value) {
    if (!isRecord(valueStop) || !isWgs84Coordinate([valueStop.lng, valueStop.lat])) return undefined
    if (
      valueStop.text !== undefined &&
      !isBoundedString(valueStop.text, MAX_STOP_TEXT_LENGTH)
    ) {
      return undefined
    }
    if (
      valueStop.speciesName !== undefined &&
      !isBoundedString(valueStop.speciesName, MAX_SPECIES_NAME_LENGTH)
    ) {
      return undefined
    }
    if (
      valueStop.photo !== undefined &&
      (!isBoundedString(valueStop.photo, 512) || !isSafeRouteMediaPath(valueStop.photo))
    ) {
      return undefined
    }
    stops.push({
      lng: valueStop.lng as number,
      lat: valueStop.lat as number,
      ...(valueStop.text === undefined ? {} : { text: valueStop.text as string }),
      ...(valueStop.speciesName === undefined
        ? {}
        : { speciesName: valueStop.speciesName as string }),
      ...(valueStop.photo === undefined ? {} : { photo: valueStop.photo as string })
    })
  }
  return stops
}

function readGeoJson(
  value: unknown
): RoutePublicRow['geojson'] | undefined {
  if (value === null) return null
  if (!isRecord(value) || value.type !== 'LineString' || !Array.isArray(value.coordinates)) {
    return undefined
  }
  if (value.coordinates.length < 2 || value.coordinates.length > MAX_ROUTE_COORDINATES) {
    return undefined
  }
  if (!value.coordinates.every(isWgs84Coordinate)) return undefined
  return { type: 'LineString', coordinates: value.coordinates }
}

/** Parse the public Supabase boundary. Invalid or oversized rows are rejected, never normalized. */
export function parsePublicRouteRow(value: unknown): RoutePublicRow | undefined {
  if (!isRecord(value) || !isBoundedString(value.id, 36) || !UUID_PATTERN.test(value.id)) {
    return undefined
  }
  const title = readLocalizedText(value.title, MAX_ROUTE_TITLE_LENGTH, true)
  const description = readNullableLocalizedText(value.description, MAX_ROUTE_DESCRIPTION_LENGTH)
  const season = readNullableLocalizedText(value.season, MAX_ROUTE_TITLE_LENGTH)
  const difficulty = readNullableLocalizedText(value.difficulty, MAX_ROUTE_TITLE_LENGTH)
  const author = readNullableString(value.author, MAX_ROUTE_AUTHOR_LENGTH)
  const distance = readNullableString(value.distance, 80)
  const duration = readNullableString(value.duration, 80)
  const stops = readStops(value.stops)
  const geojson = readGeoJson(value.geojson)
  const downloads = readNonNegativeInteger(value.downloads)
  const likes = readNonNegativeInteger(value.likes)
  const createdAt = isBoundedString(value.created_at, 64) ? value.created_at : undefined
  const tags =
    value.tags === null
      ? null
      : Array.isArray(value.tags) &&
          value.tags.length <= MAX_ROUTE_TAGS &&
          value.tags.every((tag) => isBoundedString(tag, MAX_ROUTE_TAG_LENGTH))
        ? (value.tags as string[])
        : undefined

  if (
    !title ||
    description === undefined ||
    season === undefined ||
    difficulty === undefined ||
    author === undefined ||
    distance === undefined ||
    duration === undefined ||
    tags === undefined ||
    stops === undefined ||
    geojson === undefined ||
    downloads === undefined ||
    likes === undefined ||
    !createdAt ||
    !Number.isFinite(Date.parse(createdAt))
  ) {
    return undefined
  }

  return {
    id: value.id,
    author,
    title,
    description,
    season,
    difficulty,
    distance,
    duration,
    tags,
    stops,
    downloads,
    likes,
    created_at: createdAt,
    geojson
  }
}

type PublishRouteShape = {
  draftId: string
  title: string
  description?: string
  distance?: string
  duration?: string
  author?: string
  waypoints: Coordinate[]
  stops: Array<RouteStopInline & { id: string; photoId?: string }>
}

export function isValidPublishRoute(input: PublishRouteShape): boolean {
  return (
    isSafeStorageSegment(input.draftId) &&
    input.title.trim().length > 0 &&
    input.title.length <= MAX_ROUTE_TITLE_LENGTH &&
    (input.description === undefined || input.description.length <= MAX_ROUTE_DESCRIPTION_LENGTH) &&
    (input.distance === undefined || input.distance.length <= 80) &&
    (input.duration === undefined || input.duration.length <= 80) &&
    (input.author === undefined || input.author.length <= MAX_ROUTE_AUTHOR_LENGTH) &&
    input.waypoints.length >= 2 &&
    input.waypoints.length <= MAX_ROUTE_COORDINATES &&
    input.waypoints.every(isWgs84Coordinate) &&
    input.stops.length <= MAX_ROUTE_STOPS &&
    input.stops.every(
      (stop) =>
        isSafeStorageSegment(stop.id) &&
        isWgs84Coordinate([stop.lng, stop.lat]) &&
        (stop.text === undefined || stop.text.length <= MAX_STOP_TEXT_LENGTH) &&
        (stop.speciesName === undefined || stop.speciesName.length <= MAX_SPECIES_NAME_LENGTH) &&
        (stop.photo === undefined || isSafeRouteMediaPath(stop.photo)) &&
        (stop.photoId === undefined || isSafeStorageSegment(stop.photoId))
    )
  )
}
