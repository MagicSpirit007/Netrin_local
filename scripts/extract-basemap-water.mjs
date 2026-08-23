import { mkdir, open, writeFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'
import { VectorTile } from '@mapbox/vector-tile'
import Pbf from 'pbf'
import { Compression, PMTiles } from 'pmtiles'

const INPUT = new URL('../public/maps/donghu-campus.pmtiles', import.meta.url)
const OUTPUT = new URL('../public/data/basemap-water.json', import.meta.url)

class NodeFileSource {
  constructor(fileHandle, key) {
    this.fileHandle = fileHandle
    this.key = key
  }

  getKey() {
    return this.key
  }

  async getBytes(offset, length) {
    const buffer = Buffer.alloc(length)
    const { bytesRead } = await this.fileHandle.read(buffer, 0, length, offset)
    const view = buffer.subarray(0, bytesRead)
    return {
      data: view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)
    }
  }
}

async function decompress(data, compression) {
  if (compression === Compression.None || compression === Compression.Unknown) {
    return data
  }
  if (compression === Compression.Gzip) {
    const uncompressed = gunzipSync(new Uint8Array(data))
    return uncompressed.buffer.slice(
      uncompressed.byteOffset,
      uncompressed.byteOffset + uncompressed.byteLength
    )
  }
  throw new Error(`Unsupported PMTiles compression method: ${compression}`)
}

function longitudeToTileX(longitude, zoom) {
  return Math.floor(((longitude + 180) / 360) * 2 ** zoom)
}

function latitudeToTileY(latitude, zoom) {
  const radians = (latitude * Math.PI) / 180
  return Math.floor(
    ((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2) * 2 ** zoom
  )
}

function roundCoordinates(value) {
  if (!Array.isArray(value)) return value
  if (typeof value[0] === 'number') {
    return value.map((coordinate) => Number(coordinate.toFixed(6)))
  }
  return value.map(roundCoordinates)
}

const fileHandle = await open(INPUT, 'r')

try {
  const archive = new PMTiles(
    new NodeFileSource(fileHandle, INPUT.pathname),
    undefined,
    decompress
  )
  const header = await archive.getHeader()
  const zoom = header.maxZoom
  const minX = longitudeToTileX(header.minLon, zoom)
  const maxX = longitudeToTileX(header.maxLon, zoom)
  const minY = latitudeToTileY(header.maxLat, zoom)
  const maxY = latitudeToTileY(header.minLat, zoom)
  const features = []
  const seen = new Set()

  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      const tileResponse = await archive.getZxy(zoom, x, y)
      if (!tileResponse) continue

      const tile = new VectorTile(new Pbf(new Uint8Array(tileResponse.data)))
      const water = tile.layers.water
      if (!water) continue

      for (let index = 0; index < water.length; index += 1) {
        const feature = water.feature(index)
        const geojson = feature.toGeoJSON(x, y, zoom)
        if (geojson.geometry.type === 'Point' || geojson.geometry.type === 'MultiPoint') {
          continue
        }

        const geometry = {
          ...geojson.geometry,
          coordinates: roundCoordinates(geojson.geometry.coordinates)
        }
        const key = JSON.stringify(geometry)
        if (seen.has(key)) continue
        seen.add(key)

        features.push({
          type: 'Feature',
          properties: {
            kind: feature.properties.kind ?? null,
            kindDetail: feature.properties.kind_detail ?? null,
            name: feature.properties.name ?? null
          },
          geometry
        })
      }
    }
  }

  const featureCollection = {
    type: 'FeatureCollection',
    features
  }
  const serialized = `${JSON.stringify(featureCollection)}\n`

  await mkdir(new URL('../public/data/', import.meta.url), { recursive: true })
  await writeFile(OUTPUT, serialized, 'utf8')

  const summary = features.reduce((counts, feature) => {
    const type = feature.geometry.type
    counts[type] = (counts[type] ?? 0) + 1
    return counts
  }, {})

  console.log(`Extracted ${features.length} water features at z${zoom}.`)
  console.log(`Geometry counts: ${JSON.stringify(summary)}`)
  console.log(`Output: ${OUTPUT.pathname}`)
  console.log(`Size: ${(Buffer.byteLength(serialized) / 1024).toFixed(1)} KiB`)
} finally {
  await fileHandle.close()
}
