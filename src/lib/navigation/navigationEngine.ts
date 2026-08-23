import type { ActiveRouteView, ActiveStop, Coordinate } from '../../data/types'
import {
  distanceMeters,
  distanceToTargetAlongLine,
  projectPointToLine,
  type LocationFix
} from './geo'

export type NavigationPhase =
  | 'idle'
  | 'acquiring'
  | 'toStart'
  | 'following'
  | 'atStop'
  | 'offRoute'
  | 'lowAccuracy'
  | 'completed'
  | 'locationError'

type ResumableNavigationPhase = 'toStart' | 'following'

export type NavigationState = {
  phase: NavigationPhase
  routeId?: string
  currentStopIndex: number
  currentPosition?: Coordinate
  accuracyMeters?: number
  heading?: number
  timestamp?: number
  offRouteCount: number
  resumePhase?: ResumableNavigationPhase
  arrivedStopId?: string
}

export type NavigationOutput = {
  phase: NavigationPhase
  visibleStop?: ActiveStop
  visibleStopIndex: number
  targetStop?: ActiveStop
  targetStopIndex: number
  activeMapStopId?: string
  targetCoordinate?: Coordinate
  targetDistanceMeters?: number
  offRouteDistanceMeters?: number
  accuracyMeters?: number
  hasNextStop: boolean
}

export const START_RADIUS_METERS = 35
export const ARRIVAL_RADIUS_METERS = 25
export const ARRIVAL_MAX_RADIUS_METERS = 45
export const LOW_ACCURACY_THRESHOLD_METERS = 50
export const OFF_ROUTE_THRESHOLD_METERS = 30
export const OFF_ROUTE_STRIKE_LIMIT = 3

export function createNavigationState(routeId?: string): NavigationState {
  return {
    phase: 'idle',
    routeId,
    currentStopIndex: 0,
    offRouteCount: 0
  }
}

export function setNavigationLocationError(state: NavigationState): NavigationState {
  return {
    ...state,
    phase: 'locationError',
    offRouteCount: 0,
    resumePhase: undefined
  }
}

export function shouldAdvanceNavigation(phase: NavigationPhase): boolean {
  return phase !== 'idle' && phase !== 'locationError' && phase !== 'completed'
}

export function startNavigation(route: ActiveRouteView, fix?: LocationFix): NavigationState {
  const state: NavigationState = {
    ...createNavigationState(route.id),
    phase: 'acquiring'
  }
  return fix ? advanceNavigation(route, state, fix) : state
}

export function continueFromStop(route: ActiveRouteView, state: NavigationState): NavigationState {
  if (state.phase !== 'atStop') return state

  return moveToNextStop(route, state)
}

export function moveToNextStop(
  route: ActiveRouteView,
  state: NavigationState
): NavigationState {
  if (state.phase === 'idle' || state.phase === 'completed') return state

  const nextIndex = state.currentStopIndex + 1
  if (nextIndex >= route.stops.length) {
    return {
      ...state,
      phase: 'completed',
      currentStopIndex: route.stops.length,
      offRouteCount: 0,
      resumePhase: undefined,
      arrivedStopId: undefined
    }
  }

  const nextState: NavigationState = {
    ...state,
    phase: 'following',
    currentStopIndex: nextIndex,
    offRouteCount: 0,
    resumePhase: 'following',
    arrivedStopId: undefined
  }

  if (!state.currentPosition) return nextState
  return advanceNavigation(route, nextState, {
    coordinate: state.currentPosition,
    accuracy: state.accuracyMeters,
    heading: state.heading,
    timestamp: state.timestamp ?? Date.now()
  })
}

export function moveToPreviousStop(
  route: ActiveRouteView,
  state: NavigationState
): NavigationState {
  if (state.phase === 'idle' || route.stops.length === 0) return state

  const previousIndex = Math.min(route.stops.length - 1, state.currentStopIndex - 1)
  if (previousIndex < 0) return state

  const previousState: NavigationState = {
    ...state,
    phase: 'following',
    currentStopIndex: previousIndex,
    offRouteCount: 0,
    resumePhase: 'following',
    arrivedStopId: undefined
  }

  if (!state.currentPosition) return previousState
  return advanceNavigation(route, previousState, {
    coordinate: state.currentPosition,
    accuracy: state.accuracyMeters,
    heading: state.heading,
    timestamp: state.timestamp ?? Date.now()
  })
}

export function advanceNavigation(
  route: ActiveRouteView,
  state: NavigationState,
  fix: LocationFix
): NavigationState {
  const base = state.routeId === route.id ? state : createNavigationState(route.id)
  const withFix = applyFix(base, fix)

  if (base.phase === 'idle' || base.phase === 'locationError') return withFix
  if (base.phase === 'completed') return { ...withFix, phase: 'completed' }
  if (base.phase === 'atStop') return { ...withFix, phase: 'atStop', arrivedStopId: base.arrivedStopId }

  const routeStart = getRouteStart(route)
  if (!routeStart) return { ...withFix, phase: 'completed' }

  if (isLowAccuracy(fix.accuracy)) {
    return {
      ...withFix,
      phase: 'lowAccuracy',
      resumePhase: getResumePhase(base),
      arrivedStopId: undefined
    }
  }

  if (base.phase === 'offRoute') {
    const routeLine = getRouteLine(route)
    const projection = projectPointToLine(fix.coordinate, routeLine)
    if (projection && projection.distanceMeters > OFF_ROUTE_THRESHOLD_METERS) {
      return {
        ...withFix,
        phase: 'offRoute',
        offRouteCount: Math.max(base.offRouteCount + 1, OFF_ROUTE_STRIKE_LIMIT),
        resumePhase: 'following',
        arrivedStopId: undefined
      }
    }
    return evaluateFollowing(route, { ...withFix, phase: 'following', offRouteCount: 0 })
  }

  if (base.phase === 'lowAccuracy') {
    const resumePhase = base.resumePhase ?? 'following'
    return resumePhase === 'toStart'
      ? evaluateToStart(route, { ...withFix, phase: 'toStart' }, fix.coordinate)
      : evaluateFollowing(route, { ...withFix, phase: 'following', offRouteCount: 0 })
  }

  if (base.phase === 'acquiring') {
    return distanceMeters(fix.coordinate, routeStart) > START_RADIUS_METERS
      ? {
          ...withFix,
          phase: 'toStart',
          currentStopIndex: 0,
          offRouteCount: 0,
          resumePhase: 'toStart',
          arrivedStopId: undefined
        }
      : evaluateFollowing(route, { ...withFix, phase: 'following', currentStopIndex: 0 })
  }

  if (base.phase === 'toStart') {
    return evaluateToStart(route, withFix, fix.coordinate)
  }

  return evaluateFollowing(route, withFix)
}

export function getNavigationOutput(
  route: ActiveRouteView,
  state: NavigationState,
  fallbackStop?: ActiveStop
): NavigationOutput {
  const targetStopIndex = clampStopIndex(route, state.currentStopIndex)
  const targetStop = route.stops[targetStopIndex]
  const routeLine = getRouteLine(route)
  const routeStart = getRouteStart(route)
  const currentPosition = state.currentPosition
  const stopPhase = isStopTargetPhase(state)
  const startPhase = state.phase === 'toStart' || (state.phase === 'lowAccuracy' && state.resumePhase === 'toStart')
  const targetCoordinate = stopPhase ? targetStop?.location : startPhase ? routeStart : undefined
  const offRouteProjection =
    currentPosition && routeLine.length >= 2 ? projectPointToLine(currentPosition, routeLine) : undefined
  const targetDistanceMeters =
    currentPosition && targetCoordinate
      ? startPhase
        ? distanceMeters(currentPosition, targetCoordinate)
        : distanceToTargetAlongLine(
            currentPosition,
            targetCoordinate,
            routeLine,
            OFF_ROUTE_THRESHOLD_METERS
          )
      : undefined

  const visibleStop = stopPhase ? targetStop : fallbackStop
  const visibleStopIndex = visibleStop ? Math.max(0, route.stops.findIndex((stop) => stop.id === visibleStop.id)) : 0

  return {
    phase: state.phase,
    visibleStop,
    visibleStopIndex,
    targetStop: stopPhase ? targetStop : undefined,
    targetStopIndex,
    activeMapStopId: stopPhase ? targetStop?.id : undefined,
    targetCoordinate,
    targetDistanceMeters,
    offRouteDistanceMeters: offRouteProjection?.distanceMeters,
    accuracyMeters: state.accuracyMeters,
    hasNextStop: state.currentStopIndex + 1 < route.stops.length
  }
}

function applyFix(state: NavigationState, fix: LocationFix): NavigationState {
  return {
    ...state,
    currentPosition: fix.coordinate,
    accuracyMeters: fix.accuracy,
    heading: fix.heading,
    timestamp: fix.timestamp
  }
}

function evaluateToStart(
  route: ActiveRouteView,
  state: NavigationState,
  coordinate: Coordinate
): NavigationState {
  const routeStart = getRouteStart(route)
  if (!routeStart) return { ...state, phase: 'completed' }
  if (distanceMeters(coordinate, routeStart) > START_RADIUS_METERS) {
    return {
      ...state,
      phase: 'toStart',
      currentStopIndex: 0,
      offRouteCount: 0,
      resumePhase: 'toStart',
      arrivedStopId: undefined
    }
  }
  return evaluateFollowing(route, {
    ...state,
    phase: 'following',
    currentStopIndex: 0,
    offRouteCount: 0,
    resumePhase: 'following',
    arrivedStopId: undefined
  })
}

function evaluateFollowing(route: ActiveRouteView, state: NavigationState): NavigationState {
  const targetStop = route.stops[state.currentStopIndex]
  if (!targetStop) {
    return {
      ...state,
      phase: 'completed',
      offRouteCount: 0,
      resumePhase: undefined,
      arrivedStopId: undefined
    }
  }

  if (
    state.currentPosition &&
    distanceMeters(state.currentPosition, targetStop.location) <=
      effectiveArrivalRadiusMeters(state.accuracyMeters)
  ) {
    return {
      ...state,
      phase: 'atStop',
      offRouteCount: 0,
      resumePhase: 'following',
      arrivedStopId: targetStop.id
    }
  }

  const routeLine = getRouteLine(route)
  const projection =
    state.currentPosition && routeLine.length >= 2 ? projectPointToLine(state.currentPosition, routeLine) : undefined
  const offRouteCount =
    projection && projection.distanceMeters > OFF_ROUTE_THRESHOLD_METERS ? state.offRouteCount + 1 : 0

  if (offRouteCount >= OFF_ROUTE_STRIKE_LIMIT) {
    return {
      ...state,
      phase: 'offRoute',
      offRouteCount,
      resumePhase: 'following',
      arrivedStopId: undefined
    }
  }

  return {
    ...state,
    phase: 'following',
    offRouteCount,
    resumePhase: 'following',
    arrivedStopId: undefined
  }
}

function getRouteStart(route: ActiveRouteView): Coordinate | undefined {
  return route.stops[0]?.location ?? route.waypoints[0]
}

function getRouteLine(route: ActiveRouteView): Coordinate[] {
  if (route.waypoints.length >= 2) return route.waypoints
  return route.stops.map((stop) => stop.location)
}

function getResumePhase(state: NavigationState): ResumableNavigationPhase {
  if (state.phase === 'acquiring') return 'toStart'
  if (state.phase === 'toStart' || state.phase === 'following') return state.phase
  return state.resumePhase ?? 'following'
}

function isLowAccuracy(accuracy?: number): boolean {
  return typeof accuracy === 'number' && accuracy > LOW_ACCURACY_THRESHOLD_METERS
}

function effectiveArrivalRadiusMeters(accuracy?: number): number {
  return Math.max(ARRIVAL_RADIUS_METERS, Math.min(ARRIVAL_MAX_RADIUS_METERS, accuracy ?? 0))
}

function clampStopIndex(route: ActiveRouteView, index: number): number {
  if (route.stops.length === 0) return 0
  return Math.max(0, Math.min(route.stops.length - 1, index))
}

function isStopTargetPhase(state: NavigationState): boolean {
  return (
    state.phase === 'following' ||
    state.phase === 'atStop' ||
    state.phase === 'offRoute' ||
    (state.phase === 'lowAccuracy' && state.resumePhase !== 'toStart')
  )
}
