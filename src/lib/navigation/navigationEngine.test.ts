import { describe, expect, it } from 'vitest'
import type { ActiveRouteView } from '../../data/types'
import {
  advanceNavigation,
  continueFromStop,
  startNavigation
} from './navigationEngine'

const route: ActiveRouteView = {
  id: 'test-route',
  title: { 'zh-CN': '测试路线', en: 'Test route' },
  description: { 'zh-CN': '', en: '' },
  distance: '200 m',
  duration: '5 min',
  waypoints: [
    [114.36, 30.54],
    [114.361, 30.541]
  ],
  segments: [],
  stops: [
    {
      id: 'start',
      location: [114.36, 30.54],
      title: { 'zh-CN': '起点', en: 'Start' },
      description: { 'zh-CN': '', en: '' }
    },
    {
      id: 'finish',
      location: [114.361, 30.541],
      title: { 'zh-CN': '终点', en: 'Finish' },
      description: { 'zh-CN': '', en: '' }
    }
  ]
}

const fix = (coordinate: [number, number]) => ({
  coordinate,
  accuracy: 5,
  timestamp: 1
})

describe('navigation state machine', () => {
  it('walks from acquisition through both stops to completion', () => {
    let state = startNavigation(route, fix([114.358, 30.538]))
    expect(state.phase).toBe('toStart')

    state = advanceNavigation(route, state, fix(route.stops[0].location))
    expect(state.phase).toBe('atStop')

    state = continueFromStop(route, state)
    expect(state.phase).toBe('following')
    expect(state.currentStopIndex).toBe(1)

    state = advanceNavigation(route, state, fix(route.stops[1].location))
    expect(state.phase).toBe('atStop')

    state = continueFromStop(route, state)
    expect(state.phase).toBe('completed')
  })
})
