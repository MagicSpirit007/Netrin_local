import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const expectedBase = process.argv[2] || '/'
if (!expectedBase.startsWith('/') || !expectedBase.endsWith('/')) {
  throw new Error('Expected base must have leading and trailing slashes')
}
const distDir = fileURLToPath(new URL('../dist/', import.meta.url))

const requiredFiles = [
  'index.html',
  'manifest.webmanifest',
  'sw.js',
  'data/campus-paths.json',
  'data/basemap-water.json',
  'maps/donghu-campus.pmtiles'
]

for (const relativePath of requiredFiles) {
  const absolutePath = join(distDir, relativePath)
  if (!existsSync(absolutePath)) {
    throw new Error(`Missing build artifact: ${relativePath}`)
  }
}

const indexHtml = readFileSync(join(distDir, 'index.html'), 'utf8')
const manifest = JSON.parse(readFileSync(join(distDir, 'manifest.webmanifest'), 'utf8'))
const serviceWorker = readFileSync(join(distDir, 'sw.js'), 'utf8')
const textBundle = `${indexHtml}\n${serviceWorker}`

if (manifest.start_url !== expectedBase || manifest.scope !== expectedBase) {
  throw new Error(
    'PWA scope mismatch: expected ' +
      expectedBase +
      ', got ' +
      manifest.start_url +
      '/' +
      manifest.scope
  )
}
if (!indexHtml.includes(`${expectedBase}manifest.webmanifest`)) {
  throw new Error(`index.html does not reference the manifest under ${expectedBase}`)
}
for (const requiredPrecacheEntry of [
  'index.html',
  'campus-paths.json',
  'basemap-water.json',
  'donghu-campus.pmtiles'
]) {
  if (!serviceWorker.includes(requiredPrecacheEntry)) {
    throw new Error(`Service worker does not precache ${requiredPrecacheEntry}`)
  }
}
for (const forbiddenOrigin of ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net']) {
  if (textBundle.includes(forbiddenOrigin)) {
    throw new Error(`Runtime build still references ${forbiddenOrigin}`)
  }
}

console.log(`Smoke check passed for base ${expectedBase}`)
