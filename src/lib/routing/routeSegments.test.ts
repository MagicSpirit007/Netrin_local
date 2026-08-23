import { describe, expect, it } from 'vitest'
import {
  buildSegmentsFromStopsAndWaypoints,
  normalizeRouteSegments,
  routeLineFromSegments
} from './routeSegments'

const stops = [
  { id: 'a', location: [114.36, 30.54] as [number, number] },
  { id: 'b', location: [114.361, 30.541] as [number, number] }
]

describe('route segment fallback and migration', () => {
  it('uses a direct fallback when no usable network line exists', () => {
    const segments = buildSegmentsFromStopsAndWaypoints(stops, [])
    expect(segments).toHaveLength(1)
    expect(segments[0].kind).toBe('direct-fallback')
    expect(routeLineFromSegments(segments)).toEqual(stops.map((stop) => stop.location))
  })

  it('normalizes a legacy segment with missing derived distance', () => {
    const segments = normalizeRouteSegments([
      {
        id: 'legacy-a-b',
        fromPointId: 'a',
        toPointId: 'b',
        kind: 'network',
        coordinates: stops.map((stop) => stop.location)
      },
      { id: 'invalid' }
    ])
    expect(segments).toHaveLength(1)
    expect(segments[0].distanceMeters).toBeGreaterThan(0)
  })
})
