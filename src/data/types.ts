export type LocaleCode = 'zh-CN' | 'en'

export type LocalizedText = Record<LocaleCode, string>

export type Coordinate = [number, number]

export type DraftSyncState = 'local' | 'uploading' | 'failed' | 'published'

export type RouteSegmentKind = 'network' | 'direct-fallback'

export type RouteSegmentPart = {
  coordinates: Coordinate[]
  kind: RouteSegmentKind
  distanceMeters: number
}

export type RouteSegment = {
  id: string
  fromPointId: string
  toPointId: string
  coordinates: Coordinate[]
  kind: RouteSegmentKind
  distanceMeters: number
  snapDistanceMeters?: { from: number; to: number }
  parts?: RouteSegmentPart[]
}

export type RecordedPoint = {
  id: string
  index: number
  raw: Coordinate
  final: Coordinate
  accuracy?: number
  snapped: boolean
  text: string
  speciesName?: string
  photoId?: string
}

export type TrailRoute = {
  id: string
  title: LocalizedText
  description: LocalizedText
  season: LocalizedText
  difficulty: LocalizedText
  distance: string
  duration: string
  author: string
  color: string
  tags: string[]
  waypoints: Coordinate[]
  segments?: RouteSegment[]
  stops: string[]
}

export type TrailStop = {
  id: string
  title: LocalizedText
  description: LocalizedText
  location: Coordinate
  species: string[]
  photoUrl?: string
  order: number
  tags: string[]
}

export type NatureData = {
  routes: TrailRoute[]
  stops: TrailStop[]
}

export type RouteDraft = {
  id: string
  title: string
  note: string
  points: RecordedPoint[]
  segments: RouteSegment[]
  snapToRoads: boolean
  syncState: DraftSyncState
  remoteId?: string
  createdAt: string
  updatedAt: string
}

/** 工坊上传/内联景点的最小形状（造路线时每个关键点 → 一个内联 stop）。 */
export type RouteStopInline = {
  lng: number
  lat: number
  text?: string
  speciesName?: string
  photo?: string
}

/** routes_public 视图返回的一行（服务器端已把 geom 翻成 geojson）。 */
export type RoutePublicRow = {
  id: string
  author: string | null
  title: LocalizedText
  description: LocalizedText | null
  season: LocalizedText | null
  difficulty: LocalizedText | null
  distance: string | null
  duration: string | null
  tags: string[] | null
  stops: RouteStopInline[] | null
  downloads: number
  likes: number
  created_at: string
  geojson: { type: 'LineString'; coordinates: Coordinate[] } | null
}

/** 下载到本地的路线（前端消费形态）。stops 是内联的，不是 id 引用。 */
export type DownloadedStop = {
  id: string
  location: Coordinate
  title: LocalizedText
  description: LocalizedText
  speciesName?: string
  photoUrl?: string
  order?: number
}

export type DownloadedRoute = {
  id: string
  remoteRouteId?: string
  title: LocalizedText
  description: LocalizedText
  season: LocalizedText
  difficulty: LocalizedText
  distance: string
  duration: string
  author: string
  tags: string[]
  waypoints: Coordinate[]
  segments: RouteSegment[]
  stops: DownloadedStop[]
  downloadedAt: string
  localEditedAt?: string
  isLocalEdited?: boolean
  remoteUpdatedAt?: string
}

/** Home 地图导览消费的归一化激活路线（随包路线与下载路线都映射到它）。 */
export type ActiveStop = {
  id: string
  location: Coordinate
  title: LocalizedText
  description: LocalizedText
  speciesName?: string
  photoUrl?: string
  photoId?: string
  order?: number
}

export type ActiveRouteView = {
  id: string
  title: LocalizedText
  description: LocalizedText
  distance: string
  duration: string
  waypoints: Coordinate[]
  segments: RouteSegment[]
  stops: ActiveStop[]
}

export type MapStyleId =
  | 'field-console'
  | 'campus-atlas'
  | 'forest-walk'
  | 'night-trace'

export type AppearanceSettings = {
  mapStyleId: MapStyleId
}
