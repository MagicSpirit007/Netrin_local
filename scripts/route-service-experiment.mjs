#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'

const DEFAULT_ROUTE_TITLE = 'test1'
const DEFAULT_PROVIDER = 'all'
const SUPABASE_ROUTES_VIEW = 'routes_public'

const PROVIDERS = ['valhalla', 'graphhopper', 'osrm']

function parseArgs(argv) {
  const args = {
    routeTitle: DEFAULT_ROUTE_TITLE,
    provider: DEFAULT_PROVIDER,
    valhallaUrl: undefined,
    graphhopperUrl: undefined,
    graphhopperKey: undefined,
    osrmUrl: undefined
  }

  argv.forEach((arg) => {
    const [name, rawValue = ''] = arg.split('=')
    const value = rawValue.trim()
    if (name === '--route-title' && value) args.routeTitle = value
    if (name === '--provider' && value) args.provider = value
    if (name === '--valhalla-url' && value) args.valhallaUrl = value
    if (name === '--graphhopper-url' && value) args.graphhopperUrl = value
    if (name === '--graphhopper-key' && value) args.graphhopperKey = value
    if (name === '--osrm-url' && value) args.osrmUrl = value
  })

  if (args.provider !== 'all' && !PROVIDERS.includes(args.provider)) {
    throw new Error(`Unsupported provider "${args.provider}". Use one of: all, ${PROVIDERS.join(', ')}.`)
  }

  return args
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return {}

  return Object.fromEntries(
    readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=')
        const key = line.slice(0, index).trim()
        const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
        return [key, value]
      })
  )
}

function loadExperimentEnv() {
  const cwd = process.cwd()
  const local = loadEnvFile(resolve(cwd, '.env.local'))
  const plain = loadEnvFile(resolve(cwd, '.env'))
  return { ...plain, ...local, ...process.env }
}

function envValue(env, key) {
  const value = env[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function trimSlash(value) {
  return value.replace(/\/+$/, '')
}

function displayUrl(url) {
  try {
    const parsed = new URL(url)
    parsed.search = ''
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return url.split('?')[0]
  }
}

async function fetchJson(url, options) {
  const response = await fetch(url, options)
  const text = await response.text()
  let data
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }

  if (!response.ok) {
    const detail = typeof data === 'string' ? data : JSON.stringify(data)
    throw new Error(`HTTP ${response.status}: ${detail.slice(0, 260)}`)
  }

  return data
}

function localizedTitle(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  return value['zh-CN'] || value.en || Object.values(value)[0] || ''
}

function titleMatches(value, expected) {
  return localizedTitle(value).trim().toLowerCase() === expected.trim().toLowerCase()
}

async function fetchCloudRoute(env, routeTitle) {
  const supabaseUrl = envValue(env, 'VITE_SUPABASE_URL')
  const anonKey = envValue(env, 'VITE_SUPABASE_ANON_KEY')

  if (!supabaseUrl || !anonKey) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local/process env.')
  }

  const url = new URL(`${trimSlash(supabaseUrl)}/rest/v1/${SUPABASE_ROUTES_VIEW}`)
  url.searchParams.set('select', '*')
  url.searchParams.set('order', 'created_at.desc')

  const rows = await fetchJson(url.toString(), {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Accept: 'application/json'
    }
  })

  if (!Array.isArray(rows)) {
    throw new Error(`Unexpected Supabase response for ${SUPABASE_ROUTES_VIEW}.`)
  }

  const route = rows.find((row) => titleMatches(row.title, routeTitle))
  if (!route) {
    const titles = rows.map((row) => localizedTitle(row.title)).filter(Boolean).slice(0, 12)
    throw new Error(
      `Cloud route "${routeTitle}" was not found. Visible route titles: ${titles.join(', ') || '(none)'}.`
    )
  }

  return route
}

function coordinateFromStop(stop) {
  if (typeof stop?.lng !== 'number' || typeof stop?.lat !== 'number') return undefined
  return [stop.lng, stop.lat]
}

function extractTraceCoordinates(route) {
  const fromLine = Array.isArray(route.geojson?.coordinates) ? route.geojson.coordinates : []
  const line = fromLine
    .filter((point) => Array.isArray(point) && typeof point[0] === 'number' && typeof point[1] === 'number')
    .map((point) => [point[0], point[1]])

  if (line.length >= 2) return line

  return (route.stops ?? [])
    .map(coordinateFromStop)
    .filter((point) => Array.isArray(point))
}

function metersBetween(from, to) {
  const radius = 6371008.8
  const toRadians = (value) => (value * Math.PI) / 180
  const dLat = toRadians(to[1] - from[1])
  const dLng = toRadians(to[0] - from[0])
  const lat1 = toRadians(from[1])
  const lat2 = toRadians(to[1])
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function lineLengthMeters(points) {
  let length = 0
  for (let index = 1; index < points.length; index += 1) {
    length += metersBetween(points[index - 1], points[index])
  }
  return length
}

function toGpx(points, routeTitle) {
  const escapedTitle = routeTitle.replace(/[<>&'"]/g, (char) => {
    if (char === '<') return '&lt;'
    if (char === '>') return '&gt;'
    if (char === '&') return '&amp;'
    if (char === "'") return '&apos;'
    return '&quot;'
  })
  const pointsXml = points
    .map(([lng, lat], index) => `<trkpt lat="${lat}" lon="${lng}"><time>2026-07-02T00:${String(index).padStart(2, '0')}:00Z</time></trkpt>`)
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="netrin-cell"><trk><name>${escapedTitle}</name><trkseg>${pointsXml}</trkseg></trk></gpx>`
}

function selectedProviders(provider) {
  return provider === 'all' ? PROVIDERS : [provider]
}

function endpointForProvider(provider, args, env) {
  if (provider === 'valhalla') return args.valhallaUrl ?? envValue(env, 'NETRIN_VALHALLA_URL')
  if (provider === 'graphhopper') return args.graphhopperUrl ?? envValue(env, 'NETRIN_GRAPHHOPPER_URL')
  if (provider === 'osrm') return args.osrmUrl ?? envValue(env, 'NETRIN_OSRM_URL')
  return undefined
}

async function callValhalla(endpoint, points) {
  const url = `${trimSlash(endpoint)}/trace_route`
  const body = {
    shape: points.map(([lng, lat]) => ({ lon: lng, lat })),
    costing: 'pedestrian',
    shape_match: 'map_snap',
    trace_options: {
      gps_accuracy: 10,
      search_radius: 25
    }
  }
  const data = await fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body)
  })
  return {
    status: data?.trip?.status_message ?? data?.status_message ?? 'ok',
    distanceKm: typeof data?.trip?.summary?.length === 'number' ? data.trip.summary.length : undefined,
    outputPoints: undefined
  }
}

async function callGraphHopper(endpoint, key, points, routeTitle) {
  const url = new URL(`${trimSlash(endpoint)}/match`)
  url.searchParams.set('profile', 'foot')
  url.searchParams.set('points_encoded', 'false')
  if (key) url.searchParams.set('key', key)

  const data = await fetchJson(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/gpx+xml', Accept: 'application/json' },
    body: toGpx(points, routeTitle)
  })
  const path = Array.isArray(data?.paths) ? data.paths[0] : undefined
  return {
    status: data?.message ?? 'ok',
    distanceKm: typeof path?.distance === 'number' ? path.distance / 1000 : undefined,
    outputPoints: Array.isArray(path?.points?.coordinates) ? path.points.coordinates.length : undefined
  }
}

async function callOsrm(endpoint, points) {
  const coords = points.map(([lng, lat]) => `${lng},${lat}`).join(';')
  const url = new URL(`${trimSlash(endpoint)}/match/v1/foot/${coords}`)
  url.searchParams.set('geometries', 'geojson')
  url.searchParams.set('overview', 'full')
  url.searchParams.set('steps', 'false')
  url.searchParams.set('annotations', 'false')

  const data = await fetchJson(url.toString(), {
    headers: { Accept: 'application/json' }
  })
  const matching = Array.isArray(data?.matchings) ? data.matchings[0] : undefined
  return {
    status: data?.code ?? 'ok',
    distanceKm: typeof matching?.distance === 'number' ? matching.distance / 1000 : undefined,
    outputPoints: Array.isArray(matching?.geometry?.coordinates)
      ? matching.geometry.coordinates.length
      : undefined
  }
}

async function runProvider(provider, endpoint, args, env, points) {
  const start = performance.now()
  const graphhopperKey = args.graphhopperKey ?? envValue(env, 'NETRIN_GRAPHHOPPER_KEY')
  const result =
    provider === 'valhalla'
      ? await callValhalla(endpoint, points)
      : provider === 'graphhopper'
        ? await callGraphHopper(endpoint, graphhopperKey, points, args.routeTitle)
        : await callOsrm(endpoint, points)
  return {
    provider,
    endpoint: displayUrl(endpoint),
    elapsedMs: Math.round(performance.now() - start),
    ...result
  }
}

function printProviderResult(result) {
  const distanceText =
    typeof result.distanceKm === 'number' ? `, matchedDistance=${result.distanceKm.toFixed(3)}km` : ''
  const pointText =
    typeof result.outputPoints === 'number' ? `, outputPoints=${result.outputPoints}` : ''
  console.log(
    `[${result.provider}] ok endpoint=${result.endpoint}, elapsed=${result.elapsedMs}ms, status=${result.status}${distanceText}${pointText}`
  )
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const env = loadExperimentEnv()
  const route = await fetchCloudRoute(env, args.routeTitle)
  const points = extractTraceCoordinates(route)

  if (points.length < 2) {
    throw new Error(`Cloud route "${args.routeTitle}" has fewer than 2 usable trace points.`)
  }

  console.log(
    `Loaded cloud route "${localizedTitle(route.title)}" (${route.id}) from ${SUPABASE_ROUTES_VIEW}.`
  )
  console.log(
    `Input trace: ${points.length} points, rawLength=${(lineLengthMeters(points) / 1000).toFixed(3)}km.`
  )

  const providers = selectedProviders(args.provider)
  const runnable = providers
    .map((provider) => ({ provider, endpoint: endpointForProvider(provider, args, env) }))
    .filter((item) => Boolean(item.endpoint))

  if (runnable.length === 0) {
    console.log(
      'No route-service endpoint configured. Set NETRIN_VALHALLA_URL, NETRIN_GRAPHHOPPER_URL, or NETRIN_OSRM_URL to run matching.'
    )
    return
  }

  for (const item of runnable) {
    try {
      const result = await runProvider(item.provider, item.endpoint, args, env, points)
      printProviderResult(result)
    } catch (error) {
      console.log(`[${item.provider}] failed endpoint=${displayUrl(item.endpoint)}: ${error.message}`)
    }
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
