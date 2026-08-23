const BASE_PATH_SEGMENT = /^[A-Za-z0-9._~-]+$/

/** Normalize a deployment mount point for Vite, the PWA manifest, and React Router. */
export function normalizeBasePath(value?: string): string {
  const raw = value?.trim()
  if (!raw || raw === '/') return '/'
  if (raw.includes('\\') || raw.includes('?') || raw.includes('#') || raw.includes('://')) {
    throw new Error('NETRIN_BASE_PATH must be a URL path, not a URL')
  }

  const segments = raw.split('/').filter(Boolean)
  if (segments.length === 0) return '/'
  if (segments.some((segment) => segment === '.' || segment === '..' || !BASE_PATH_SEGMENT.test(segment))) {
    throw new Error('NETRIN_BASE_PATH contains an invalid path segment')
  }
  return `/${segments.join('/')}/`
}

export function routerBasename(basePath: string): string | undefined {
  const normalized = normalizeBasePath(basePath)
  return normalized === '/' ? undefined : normalized.slice(0, -1)
}
