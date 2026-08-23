import type { Coordinate } from '../../data/types'
import { distanceMeters, projectPointToLine } from './geo'

export type ManeuverKind = 'straight' | 'left' | 'right'

export type NavigationManeuver = {
  kind: ManeuverKind
  distanceMeters: number
  upcomingTurn?: Exclude<ManeuverKind, 'straight'>
}

const TURN_ANGLE_DEGREES = 35
const TURN_ICON_DISTANCE_METERS = 80
const TURN_SAMPLE_DISTANCE_METERS = 8
const MIN_MANEUVER_DISTANCE_METERS = 4

function toRadians(value: number) {
  return (value * Math.PI) / 180
}

function toDegrees(value: number) {
  return (value * 180) / Math.PI
}

function bearingDegrees(from: Coordinate, to: Coordinate): number {
  const fromLatitude = toRadians(from[1])
  const toLatitude = toRadians(to[1])
  const longitudeDelta = toRadians(to[0] - from[0])
  const y = Math.sin(longitudeDelta) * Math.cos(toLatitude)
  const x =
    Math.cos(fromLatitude) * Math.sin(toLatitude) -
    Math.sin(fromLatitude) * Math.cos(toLatitude) * Math.cos(longitudeDelta)
  return (toDegrees(Math.atan2(y, x)) + 360) % 360
}

function signedTurnDegrees(incomingBearing: number, outgoingBearing: number): number {
  return ((outgoingBearing - incomingBearing + 540) % 360) - 180
}

function remainingPath(current: Coordinate, path: Coordinate[]): Coordinate[] {
  const projection = projectPointToLine(current, path)
  if (!projection) return []
  const result: Coordinate[] = [projection.coordinate]
  path.slice(projection.segmentIndex + 1).forEach((coordinate) => {
    const previous = result[result.length - 1]
    if (previous && distanceMeters(previous, coordinate) <= 0.6) return
    result.push(coordinate)
  })
  return result
}

export function getNavigationManeuver(
  current: Coordinate | undefined,
  path: Coordinate[]
): NavigationManeuver | undefined {
  if (!current || path.length < 2) return undefined
  const remaining = remainingPath(current, path)
  if (remaining.length < 2) return undefined

  const cumulative = [0]
  for (let index = 1; index < remaining.length; index += 1) {
    cumulative.push(cumulative[index - 1] + distanceMeters(remaining[index - 1], remaining[index]))
  }

  for (let index = 1; index < remaining.length - 1; index += 1) {
    const distanceToTurn = cumulative[index]
    if (distanceToTurn < MIN_MANEUVER_DISTANCE_METERS) continue

    let previousIndex = index - 1
    while (
      previousIndex > 0 &&
      cumulative[index] - cumulative[previousIndex] < TURN_SAMPLE_DISTANCE_METERS
    ) {
      previousIndex -= 1
    }
    let nextIndex = index + 1
    while (
      nextIndex < remaining.length - 1 &&
      cumulative[nextIndex] - cumulative[index] < TURN_SAMPLE_DISTANCE_METERS
    ) {
      nextIndex += 1
    }
    if (
      cumulative[index] - cumulative[previousIndex] < TURN_SAMPLE_DISTANCE_METERS ||
      cumulative[nextIndex] - cumulative[index] < TURN_SAMPLE_DISTANCE_METERS
    ) {
      continue
    }

    const turnDegrees = signedTurnDegrees(
      bearingDegrees(remaining[previousIndex], remaining[index]),
      bearingDegrees(remaining[index], remaining[nextIndex])
    )
    if (Math.abs(turnDegrees) < TURN_ANGLE_DEGREES) continue

    const turnKind: Exclude<ManeuverKind, 'straight'> = turnDegrees > 0 ? 'right' : 'left'
    return distanceToTurn <= TURN_ICON_DISTANCE_METERS
      ? { kind: turnKind, distanceMeters: distanceToTurn }
      : { kind: 'straight', distanceMeters: distanceToTurn, upcomingTurn: turnKind }
  }

  const remainingDistance = cumulative[cumulative.length - 1]
  return remainingDistance >= 1
    ? { kind: 'straight', distanceMeters: remainingDistance }
    : undefined
}
