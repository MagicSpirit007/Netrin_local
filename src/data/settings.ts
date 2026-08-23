import localforage from 'localforage'
import type {
  AppearanceSettings,
  MapStyleId
} from './types'

const SETTINGS_KEY = 'netrin.appearance'

const MAP_STYLE_IDS: MapStyleId[] = [
  'field-console',
  'campus-atlas',
  'forest-walk',
  'night-trace'
]

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  mapStyleId: 'field-console'
}

const LEGACY_MAP_STYLE_IDS: Record<string, MapStyleId> = {
  'osm-clear': 'campus-atlas',
  'night-high-contrast': 'night-trace',
  'offline-simple': 'field-console'
}

function isMapStyleId(value: unknown): value is MapStyleId {
  return typeof value === 'string' && MAP_STYLE_IDS.includes(value as MapStyleId)
}

function normalizeMapStyleId(value: unknown): MapStyleId {
  if (isMapStyleId(value)) return value
  if (typeof value === 'string' && LEGACY_MAP_STYLE_IDS[value]) return LEGACY_MAP_STYLE_IDS[value]
  return DEFAULT_APPEARANCE_SETTINGS.mapStyleId
}

function normalizeAppearanceSettings(value: unknown): AppearanceSettings {
  const candidate = value && typeof value === 'object' ? value as Partial<AppearanceSettings> : {}
  return {
    mapStyleId: normalizeMapStyleId(candidate.mapStyleId)
  }
}

export async function loadAppearanceSettings(): Promise<AppearanceSettings> {
  try {
    const value = await localforage.getItem<AppearanceSettings>(SETTINGS_KEY)
    return normalizeAppearanceSettings(value)
  } catch {
    return DEFAULT_APPEARANCE_SETTINGS
  }
}

export async function saveAppearanceSettings(settings: AppearanceSettings): Promise<void> {
  try {
    await localforage.setItem(SETTINGS_KEY, normalizeAppearanceSettings(settings))
  } catch {
    // Settings are an enhancement; the default remains usable if storage fails.
  }
}
