import { describe, expect, it } from 'vitest'
import {
  MAX_ROUTE_COORDINATES,
  parsePublicRouteRow
} from './routeValidation'

function validRow() {
  return {
    id: '019c0000-0000-7000-8000-000000000001',
    author: 'Netrin contributor',
    title: { 'zh-CN': '东湖路线', en: 'East Lake route' },
    description: { 'zh-CN': '', en: '' },
    season: { 'zh-CN': '', en: '' },
    difficulty: { 'zh-CN': '', en: '' },
    distance: '1 km',
    duration: '30 min',
    tags: ['campus'],
    stops: [{ lng: 114.36, lat: 30.54, text: '起点' }],
    downloads: 0,
    likes: 0,
    created_at: '2026-08-23T00:00:00.000Z',
    geojson: {
      type: 'LineString',
      coordinates: [
        [114.36, 30.54],
        [114.361, 30.541]
      ]
    }
  }
}

describe('public route boundary', () => {
  it('accepts a bounded WGS-84 route', () => {
    expect(parsePublicRouteRow(validRow())).toBeDefined()
  })

  it('rejects out-of-range coordinates', () => {
    const row = validRow()
    row.geojson.coordinates[1] = [181, 30]
    expect(parsePublicRouteRow(row)).toBeUndefined()
  })

  it('rejects oversized route arrays', () => {
    const row = validRow()
    row.geojson.coordinates = Array.from(
      { length: MAX_ROUTE_COORDINATES + 1 },
      () => [114.36, 30.54]
    )
    expect(parsePublicRouteRow(row)).toBeUndefined()
  })

  it('rejects hostile media paths', () => {
    const row = validRow()
    row.stops[0] = { ...row.stops[0], photo: '../../private/key.jpg' } as typeof row.stops[0]
    expect(parsePublicRouteRow(row)).toBeUndefined()
  })
})
