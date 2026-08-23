import type { Feature, FeatureCollection, LineString } from 'geojson'
import type {
  Coordinate,
  RecordedPoint,
  RouteSegment,
  RouteSegmentKind,
  RouteSegmentPart
} from '../../data/types'
import {
  distanceMeters,
  lineLengthMeters,
  projectPointToSegment,
  type SegmentProjection
} from '../navigation/geo'
import { createDirectFallbackSegment, createRouteSegmentFromParts } from './routeSegments'

type CampusPaths = FeatureCollection<LineString>

type GraphEdge = {
  to: string
  distanceMeters: number
}

type GraphNode = {
  id: string
  coordinate: Coordinate
  edges: GraphEdge[]
}

type GraphSegment = {
  startNodeId: string
  endNodeId: string
  start: Coordinate
  end: Coordinate
  lengthMeters: number
  minLongitude: number
  minLatitude: number
  maxLongitude: number
  maxLatitude: number
}

type CampusGraph = {
  nodes: Map<string, GraphNode>
  segments: GraphSegment[]
  componentByNode: Map<string, number>
}

type RoadProjection = SegmentProjection & {
  segment: GraphSegment
}

type PlanSegmentInput = {
  id?: string
  fromPointId: string
  toPointId: string
  from: Coordinate
  to: Coordinate
  fromSnapped?: boolean
  toSnapped?: boolean
  ambiguousFallback?: 'partial-road' | 'direct'
}

type QueueItem = {
  id: string
  priority: number
  distanceMeters: number
}

const CAMPUS_PATHS_URL = `${import.meta.env.BASE_URL}data/campus-paths.json`
const STRICT_SNAP_METERS = 15
const RELAXED_SNAP_METERS = 35
const ENDPOINT_STITCH_METERS = 2
const ENDPOINT_GRID_DEGREES = 0.00003
const ABNORMAL_ROUTE_EXTRA_METERS = 60
const ABNORMAL_ROUTE_FACTOR = 4
const MAX_PROJECTION_CANDIDATES = 10
const MAX_ROUTE_CANDIDATE_PAIRS = 24
const PART_MIN_LENGTH_METERS = 0.6

let graphPromise: Promise<CampusGraph> | null = null

class MinQueue {
  private items: QueueItem[] = []

  push(item: QueueItem) {
    this.items.push(item)
    this.bubbleUp(this.items.length - 1)
  }

  pop(): QueueItem | undefined {
    const first = this.items[0]
    const last = this.items.pop()
    if (!first || !last) return first
    if (this.items.length > 0) {
      this.items[0] = last
      this.sinkDown(0)
    }
    return first
  }

  get length() {
    return this.items.length
  }

  private bubbleUp(index: number) {
    let current = index
    while (current > 0) {
      const parent = Math.floor((current - 1) / 2)
      if (this.items[parent].priority <= this.items[current].priority) break
      ;[this.items[parent], this.items[current]] = [this.items[current], this.items[parent]]
      current = parent
    }
  }

  private sinkDown(index: number) {
    let current = index
    while (true) {
      const left = current * 2 + 1
      const right = left + 1
      let smallest = current
      if (left < this.items.length && this.items[left].priority < this.items[smallest].priority) {
        smallest = left
      }
      if (right < this.items.length && this.items[right].priority < this.items[smallest].priority) {
        smallest = right
      }
      if (smallest === current) break
      ;[this.items[current], this.items[smallest]] = [this.items[smallest], this.items[current]]
      current = smallest
    }
  }
}

function coordinateKey(coordinate: Coordinate): string {
  return `${coordinate[0].toFixed(6)},${coordinate[1].toFixed(6)}`
}

function cloneCoordinate(coordinate: Coordinate): Coordinate {
  return [coordinate[0], coordinate[1]]
}

function addNode(nodes: Map<string, GraphNode>, coordinate: Coordinate): string {
  const id = coordinateKey(coordinate)
  if (!nodes.has(id)) {
    nodes.set(id, { id, coordinate: cloneCoordinate(coordinate), edges: [] })
  }
  return id
}

function addEdge(nodes: Map<string, GraphNode>, fromId: string, toId: string, distance: number) {
  if (fromId === toId || distance <= 0) return
  const from = nodes.get(fromId)
  const to = nodes.get(toId)
  if (!from || !to) return
  from.edges.push({ to: toId, distanceMeters: distance })
  to.edges.push({ to: fromId, distanceMeters: distance })
}

function isCoordinate(value: unknown): value is Coordinate {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    Number.isFinite(value[0]) &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[1])
  )
}

function featureCoordinates(feature: Feature<LineString>): Coordinate[] {
  return feature.geometry.coordinates.filter(isCoordinate).map((coordinate) => [
    coordinate[0],
    coordinate[1]
  ])
}

function endpointGridKey(coordinate: Coordinate): string {
  return `${Math.floor(coordinate[0] / ENDPOINT_GRID_DEGREES)},${Math.floor(
    coordinate[1] / ENDPOINT_GRID_DEGREES
  )}`
}

function nearbyGridKeys(coordinate: Coordinate): string[] {
  const longitude = Math.floor(coordinate[0] / ENDPOINT_GRID_DEGREES)
  const latitude = Math.floor(coordinate[1] / ENDPOINT_GRID_DEGREES)
  const keys: string[] = []
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      keys.push(`${longitude + dx},${latitude + dy}`)
    }
  }
  return keys
}

function stitchNearbyEndpoints(
  nodes: Map<string, GraphNode>,
  endpoints: Array<{ nodeId: string; coordinate: Coordinate }>
) {
  const grid = new Map<string, Array<{ nodeId: string; coordinate: Coordinate }>>()
  const stitched = new Set<string>()

  endpoints.forEach((endpoint) => {
    const nearby = nearbyGridKeys(endpoint.coordinate).flatMap((key) => grid.get(key) ?? [])
    nearby.forEach((candidate) => {
      if (candidate.nodeId === endpoint.nodeId) return
      const pairKey =
        candidate.nodeId < endpoint.nodeId
          ? `${candidate.nodeId}|${endpoint.nodeId}`
          : `${endpoint.nodeId}|${candidate.nodeId}`
      if (stitched.has(pairKey)) return
      const distance = distanceMeters(candidate.coordinate, endpoint.coordinate)
      if (distance > ENDPOINT_STITCH_METERS) return
      stitched.add(pairKey)
      addEdge(nodes, candidate.nodeId, endpoint.nodeId, distance)
    })

    const key = endpointGridKey(endpoint.coordinate)
    const bucket = grid.get(key) ?? []
    bucket.push(endpoint)
    grid.set(key, bucket)
  })
}

function mapConnectedComponents(nodes: Map<string, GraphNode>): Map<string, number> {
  const componentByNode = new Map<string, number>()
  let componentId = 0

  nodes.forEach((node) => {
    if (componentByNode.has(node.id)) return
    const stack = [node.id]
    componentByNode.set(node.id, componentId)
    while (stack.length > 0) {
      const currentId = stack.pop()
      if (!currentId) continue
      nodes.get(currentId)?.edges.forEach((edge) => {
        if (componentByNode.has(edge.to)) return
        componentByNode.set(edge.to, componentId)
        stack.push(edge.to)
      })
    }
    componentId += 1
  })

  return componentByNode
}

function buildGraph(collection: CampusPaths): CampusGraph {
  const nodes = new Map<string, GraphNode>()
  const segments: GraphSegment[] = []
  const endpoints: Array<{ nodeId: string; coordinate: Coordinate }> = []

  collection.features.forEach((feature) => {
    const coordinates = featureCoordinates(feature)
    if (coordinates.length < 2) return
    const firstNode = addNode(nodes, coordinates[0])
    const lastNode = addNode(nodes, coordinates[coordinates.length - 1])
    endpoints.push({ nodeId: firstNode, coordinate: coordinates[0] })
    endpoints.push({ nodeId: lastNode, coordinate: coordinates[coordinates.length - 1] })

    for (let index = 1; index < coordinates.length; index += 1) {
      const start = coordinates[index - 1]
      const end = coordinates[index]
      const startNodeId = addNode(nodes, start)
      const endNodeId = addNode(nodes, end)
      const lengthMeters = distanceMeters(start, end)
      addEdge(nodes, startNodeId, endNodeId, lengthMeters)
      segments.push({
        startNodeId,
        endNodeId,
        start,
        end,
        lengthMeters,
        minLongitude: Math.min(start[0], end[0]),
        minLatitude: Math.min(start[1], end[1]),
        maxLongitude: Math.max(start[0], end[0]),
        maxLatitude: Math.max(start[1], end[1])
      })
    }
  })

  stitchNearbyEndpoints(nodes, endpoints)
  return { nodes, segments, componentByNode: mapConnectedComponents(nodes) }
}

async function loadCampusGraph(): Promise<CampusGraph> {
  if (!graphPromise) {
    graphPromise = fetch(CAMPUS_PATHS_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`Campus path request failed: ${response.status}`)
        return response.json() as Promise<CampusPaths>
      })
      .then(buildGraph)
      .catch(() => ({
        nodes: new Map<string, GraphNode>(),
        segments: [],
        componentByNode: new Map<string, number>()
      }))
  }
  return graphPromise
}

function findProjectionCandidates(
  graph: CampusGraph,
  coordinate: Coordinate,
  thresholdMeters: number,
  limit = MAX_PROJECTION_CANDIDATES
): RoadProjection[] {
  if (graph.segments.length === 0) return []

  const latitudeDelta = thresholdMeters / 111_320
  const longitudeDelta =
    thresholdMeters / (111_320 * Math.max(0.2, Math.cos((coordinate[1] * Math.PI) / 180)))
  const candidates: RoadProjection[] = []

  graph.segments.forEach((segment) => {
    if (
      coordinate[0] < segment.minLongitude - longitudeDelta ||
      coordinate[0] > segment.maxLongitude + longitudeDelta ||
      coordinate[1] < segment.minLatitude - latitudeDelta ||
      coordinate[1] > segment.maxLatitude + latitudeDelta
    ) {
      return
    }
    const projection = projectPointToSegment(coordinate, segment.start, segment.end)
    if (projection.distanceMeters > thresholdMeters) return
    candidates.push({ ...projection, segment })
  })

  candidates.sort((left, right) => left.distanceMeters - right.distanceMeters)
  return candidates.slice(0, limit)
}

function endpointProjectionCandidates(
  graph: CampusGraph,
  coordinate: Coordinate,
  snapped: boolean | undefined
): RoadProjection[] {
  const candidates = findProjectionCandidates(
    graph,
    coordinate,
    snapped ? STRICT_SNAP_METERS : RELAXED_SNAP_METERS,
    Number.POSITIVE_INFINITY
  )
  const nearestByComponent = new Map<number, RoadProjection>()
  candidates.forEach((candidate) => {
    const component = projectionComponent(graph, candidate)
    if (component == null || nearestByComponent.has(component)) return
    nearestByComponent.set(component, candidate)
  })
  return [...nearestByComponent.values()]
    .sort((left, right) => left.distanceMeters - right.distanceMeters)
    .slice(0, MAX_PROJECTION_CANDIDATES)
}

function findNearestProjection(graph: CampusGraph, coordinate: Coordinate): RoadProjection | undefined {
  return findProjectionCandidates(graph, coordinate, Number.POSITIVE_INFINITY, 1)[0]
}

function projectionComponent(graph: CampusGraph, projection: RoadProjection): number | undefined {
  return graph.componentByNode.get(projection.segment.startNodeId)
}

function nodeCoordinate(
  graph: CampusGraph,
  nodeId: string,
  start: RoadProjection,
  target: RoadProjection
): Coordinate {
  if (nodeId === '__start__') return start.coordinate
  if (nodeId === '__target__') return target.coordinate
  return graph.nodes.get(nodeId)?.coordinate ?? start.coordinate
}

function projectionEndpointEdges(
  projection: RoadProjection
): GraphEdge[] {
  return [
    {
      to: projection.segment.startNodeId,
      distanceMeters: projection.segment.lengthMeters * projection.fraction
    },
    {
      to: projection.segment.endNodeId,
      distanceMeters: projection.segment.lengthMeters * (1 - projection.fraction)
    }
  ]
}

function findShortestProjectedPath(
  graph: CampusGraph,
  start: RoadProjection,
  target: RoadProjection
): Coordinate[] | undefined {
  const startId = '__start__'
  const targetId = '__target__'
  const distances = new Map<string, number>([[startId, 0]])
  const previous = new Map<string, string>()
  const queue = new MinQueue()
  queue.push({
    id: startId,
    priority: distanceMeters(start.coordinate, target.coordinate),
    distanceMeters: 0
  })

  const targetEndpointEdges = new Map<string, number>([
    [target.segment.startNodeId, target.segment.lengthMeters * target.fraction],
    [target.segment.endNodeId, target.segment.lengthMeters * (1 - target.fraction)]
  ])

  const directSameSegment =
    start.segment === target.segment
      ? Math.abs(target.fraction - start.fraction) * start.segment.lengthMeters
      : undefined

  const neighborsFor = (nodeId: string): GraphEdge[] => {
    if (nodeId === targetId) return []
    if (nodeId === startId) {
      const startEdges = projectionEndpointEdges(start)
      return typeof directSameSegment === 'number'
        ? [...startEdges, { to: targetId, distanceMeters: directSameSegment }]
        : startEdges
    }

    const node = graph.nodes.get(nodeId)
    const targetEdge = targetEndpointEdges.get(nodeId)
    return targetEdge == null
      ? node?.edges ?? []
      : [...(node?.edges ?? []), { to: targetId, distanceMeters: targetEdge }]
  }

  while (queue.length > 0) {
    const current = queue.pop()
    if (!current) break
    if (current.id === targetId) break
    if (current.distanceMeters > (distances.get(current.id) ?? Number.POSITIVE_INFINITY)) continue

    neighborsFor(current.id).forEach((edge) => {
      const currentDistance = distances.get(current.id) ?? Number.POSITIVE_INFINITY
      const nextDistance = currentDistance + edge.distanceMeters
      if (nextDistance >= (distances.get(edge.to) ?? Number.POSITIVE_INFINITY)) return
      distances.set(edge.to, nextDistance)
      previous.set(edge.to, current.id)
      queue.push({
        id: edge.to,
        distanceMeters: nextDistance,
        priority:
          nextDistance +
          (edge.to === targetId
            ? 0
            : distanceMeters(nodeCoordinate(graph, edge.to, start, target), target.coordinate))
      })
    })
  }

  if (!distances.has(targetId)) return undefined

  const nodePath: string[] = []
  let cursor: string | undefined = targetId
  while (cursor) {
    nodePath.unshift(cursor)
    if (cursor === startId) break
    cursor = previous.get(cursor)
  }
  if (nodePath[0] !== startId) return undefined

  return nodePath.map((nodeId) => nodeCoordinate(graph, nodeId, start, target))
}

type ProjectedRoute = {
  start: RoadProjection
  target: RoadProjection
  routePath: Coordinate[]
  score: number
}

function findBestProjectedRoute(
  graph: CampusGraph,
  starts: RoadProjection[],
  targets: RoadProjection[]
): ProjectedRoute | undefined {
  const candidatePairs = starts
    .flatMap((start) =>
      targets.flatMap((target) =>
        projectionComponent(graph, start) === projectionComponent(graph, target)
          ? [{ start, target, snapDistance: start.distanceMeters + target.distanceMeters }]
          : []
      )
    )
    .sort((left, right) => left.snapDistance - right.snapDistance)
    .slice(0, MAX_ROUTE_CANDIDATE_PAIRS)

  let best: ProjectedRoute | undefined
  candidatePairs.forEach(({ start, target, snapDistance }) => {
    const routePath = findShortestProjectedPath(graph, start, target)
    if (!routePath || routePath.length < 2) return
    const score = snapDistance + lineLengthMeters(routePath)
    if (!best || score < best.score) best = { start, target, routePath, score }
  })
  return best
}

function partialNodeCoordinate(
  graph: CampusGraph,
  nodeId: string,
  startId: string,
  start: RoadProjection
): Coordinate {
  return nodeId === startId ? start.coordinate : graph.nodes.get(nodeId)?.coordinate ?? start.coordinate
}

function findReachablePathToward(
  graph: CampusGraph,
  start: RoadProjection,
  toward: Coordinate
): Coordinate[] {
  const startId = '__partial-start__'
  const distances = new Map<string, number>([[startId, 0]])
  const previous = new Map<string, string>()
  const queue = new MinQueue()
  queue.push({ id: startId, priority: 0, distanceMeters: 0 })

  let bestId = startId
  let bestTargetDistance = distanceMeters(start.coordinate, toward)
  let bestTravelDistance = 0

  while (queue.length > 0) {
    const current = queue.pop()
    if (!current) break
    const currentDistance = distances.get(current.id) ?? Number.POSITIVE_INFINITY
    if (current.distanceMeters > currentDistance) continue

    const coordinate = partialNodeCoordinate(graph, current.id, startId, start)
    const targetDistance = distanceMeters(coordinate, toward)
    if (
      targetDistance < bestTargetDistance - PART_MIN_LENGTH_METERS ||
      (Math.abs(targetDistance - bestTargetDistance) <= PART_MIN_LENGTH_METERS &&
        currentDistance < bestTravelDistance)
    ) {
      bestId = current.id
      bestTargetDistance = targetDistance
      bestTravelDistance = currentDistance
    }

    const neighbors =
      current.id === startId ? projectionEndpointEdges(start) : graph.nodes.get(current.id)?.edges ?? []
    neighbors.forEach((edge) => {
      const nextDistance = currentDistance + edge.distanceMeters
      if (nextDistance >= (distances.get(edge.to) ?? Number.POSITIVE_INFINITY)) return
      distances.set(edge.to, nextDistance)
      previous.set(edge.to, current.id)
      queue.push({ id: edge.to, priority: nextDistance, distanceMeters: nextDistance })
    })
  }

  const nodePath: string[] = []
  let cursor: string | undefined = bestId
  while (cursor) {
    nodePath.unshift(cursor)
    if (cursor === startId) break
    cursor = previous.get(cursor)
  }
  return nodePath.map((nodeId) => partialNodeCoordinate(graph, nodeId, startId, start))
}

function addRoutePart(
  parts: RouteSegmentPart[],
  kind: RouteSegmentKind,
  coordinates: Coordinate[]
) {
  if (coordinates.length < 2) return
  const distance = lineLengthMeters(coordinates)
  if (distance <= PART_MIN_LENGTH_METERS) return
  parts.push({
    coordinates: coordinates.map(cloneCoordinate),
    kind,
    distanceMeters: distance
  })
}

function createProjectedRouteSegment(
  input: PlanSegmentInput,
  id: string,
  start: RoadProjection,
  target: RoadProjection,
  routePath: Coordinate[],
  kindOverride?: RouteSegmentKind
): RouteSegment {
  const parts: RouteSegmentPart[] = []
  addRoutePart(parts, 'direct-fallback', [input.from, start.coordinate])
  addRoutePart(parts, 'network', routePath)
  addRoutePart(parts, 'direct-fallback', [target.coordinate, input.to])
  if (!parts.some((part) => part.kind === 'network')) {
    return createDirectFallbackSegment(id, input.fromPointId, input.toPointId, input.from, input.to)
  }
  return createRouteSegmentFromParts(
    id,
    input.fromPointId,
    input.toPointId,
    parts,
    { from: start.distanceMeters, to: target.distanceMeters },
    kindOverride
  )
}

function createPartialFallbackSegment(
  graph: CampusGraph,
  input: PlanSegmentInput,
  id: string,
  startCandidate?: RoadProjection,
  targetCandidate?: RoadProjection
): RouteSegment {
  const start = startCandidate ?? findNearestProjection(graph, input.from)
  const target = targetCandidate ?? findNearestProjection(graph, input.to)
  if (!start || !target) {
    return createDirectFallbackSegment(id, input.fromPointId, input.toPointId, input.from, input.to)
  }

  const startPath = findReachablePathToward(graph, start, target.coordinate)
  const startExit = startPath[startPath.length - 1] ?? start.coordinate
  const targetPathFromTarget = findReachablePathToward(graph, target, startExit)
  const targetPath = [...targetPathFromTarget].reverse()
  const targetEntry = targetPath[0] ?? target.coordinate
  const parts: RouteSegmentPart[] = []

  addRoutePart(parts, 'direct-fallback', [input.from, start.coordinate])
  addRoutePart(parts, 'network', startPath)
  addRoutePart(parts, 'direct-fallback', [startExit, targetEntry])
  addRoutePart(parts, 'network', targetPath)
  addRoutePart(parts, 'direct-fallback', [target.coordinate, input.to])

  if (!parts.some((part) => part.kind === 'network')) {
    return createDirectFallbackSegment(id, input.fromPointId, input.toPointId, input.from, input.to)
  }
  return createRouteSegmentFromParts(
    id,
    input.fromPointId,
    input.toPointId,
    parts,
    { from: start.distanceMeters, to: target.distanceMeters },
    'direct-fallback'
  )
}

function composeCoordinates(
  from: Coordinate,
  to: Coordinate,
  routePath: Coordinate[]
): Coordinate[] {
  const coordinates: Coordinate[] = []
  ;[from, ...routePath, to].forEach((coordinate) => {
    const previous = coordinates[coordinates.length - 1]
    if (previous && distanceMeters(previous, coordinate) <= 0.6) return
    coordinates.push([coordinate[0], coordinate[1]])
  })
  return coordinates
}

function isAbnormalRoute(coordinates: Coordinate[], from: Coordinate, to: Coordinate): boolean {
  const directDistance = distanceMeters(from, to)
  const routeDistance = lineLengthMeters(coordinates)
  return (
    routeDistance > directDistance * ABNORMAL_ROUTE_FACTOR &&
    routeDistance - directDistance > ABNORMAL_ROUTE_EXTRA_METERS
  )
}

function hasProjectedEndpointConnector(start: RoadProjection, target: RoadProjection): boolean {
  return (
    start.distanceMeters > PART_MIN_LENGTH_METERS ||
    target.distanceMeters > PART_MIN_LENGTH_METERS
  )
}

export async function planSegment(input: PlanSegmentInput): Promise<RouteSegment> {
  const id = input.id ?? `segment-${input.fromPointId}-${input.toPointId}`
  const fallback = () =>
    createDirectFallbackSegment(id, input.fromPointId, input.toPointId, input.from, input.to)
  const directOnAmbiguous = input.ambiguousFallback === 'direct'

  const graph = await loadCampusGraph()
  if (graph.segments.length === 0) return fallback()

  const fromCandidates = endpointProjectionCandidates(graph, input.from, input.fromSnapped)
  const toCandidates = endpointProjectionCandidates(graph, input.to, input.toSnapped)
  const projectedRoute = findBestProjectedRoute(graph, fromCandidates, toCandidates)

  if (projectedRoute) {
    const coordinates = composeCoordinates(input.from, input.to, projectedRoute.routePath)
    const abnormalRoute = isAbnormalRoute(coordinates, input.from, input.to)
    if (
      directOnAmbiguous &&
      (abnormalRoute || hasProjectedEndpointConnector(projectedRoute.start, projectedRoute.target))
    ) {
      return fallback()
    }
    const kindOverride = abnormalRoute
      ? 'direct-fallback'
      : undefined
    return createProjectedRouteSegment(
      input,
      id,
      projectedRoute.start,
      projectedRoute.target,
      projectedRoute.routePath,
      kindOverride
    )
  }

  if (directOnAmbiguous) return fallback()

  return createPartialFallbackSegment(graph, input, id, fromCandidates[0], toCandidates[0])
}

export async function planSegmentsForPoints(
  points: Pick<RecordedPoint, 'id' | 'final' | 'snapped'>[]
): Promise<RouteSegment[]> {
  if (points.length < 2) return []
  const segments = await Promise.all(
    points.slice(1).map((point, index) => {
      const previous = points[index]
      return planSegment({
        fromPointId: previous.id,
        toPointId: point.id,
        from: previous.final,
        to: point.final,
        fromSnapped: previous.snapped,
        toSnapped: point.snapped,
        ambiguousFallback: 'direct'
      })
    })
  )
  return segments
}
