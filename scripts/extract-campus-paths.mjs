import { mkdir, open, writeFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'
import { VectorTile } from '@mapbox/vector-tile'
import Pbf from 'pbf'
import { Compression, PMTiles } from 'pmtiles'

const INPUT = new URL('../public/maps/donghu-campus.pmtiles', import.meta.url)
const OUTPUT = new URL('../public/data/campus-paths.json', import.meta.url)
const CAMPUS_BBOX = [119.69, 30.225, 119.775, 30.295]

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

function roundCoordinate(coordinate) {
  return [
    Number(coordinate[0].toFixed(6)),
    Number(coordinate[1].toFixed(6))
  ]
}

function addLine(features, coordinates, properties) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return
  features.push({
    type: 'Feature',
    properties,
    geometry: {
      type: 'LineString',
      coordinates: coordinates.map(roundCoordinate)
    }
  })
}

function updateBounds(bounds, coordinates) {
  for (const [longitude, latitude] of coordinates) {
    bounds[0] = Math.min(bounds[0], longitude)
    bounds[1] = Math.min(bounds[1], latitude)
    bounds[2] = Math.max(bounds[2], longitude)
    bounds[3] = Math.max(bounds[3], latitude)
  }
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
  const [minLongitude, minLatitude, maxLongitude, maxLatitude] = CAMPUS_BBOX
  const minX = longitudeToTileX(minLongitude, zoom)
  const maxX = longitudeToTileX(maxLongitude, zoom)
  const minY = latitudeToTileY(maxLatitude, zoom)
  const maxY = latitudeToTileY(minLatitude, zoom)
  const features = []

  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      const tileResponse = await archive.getZxy(zoom, x, y)
      if (!tileResponse) continue

      const tile = new VectorTile(new Pbf(new Uint8Array(tileResponse.data)))
      const roads = tile.layers.roads
      if (!roads) continue

      for (let index = 0; index < roads.length; index += 1) {
        const feature = roads.feature(index)
        const geojson = feature.toGeoJSON(x, y, zoom)
        const properties = {
          kind: feature.properties.kind ?? null,
          kindDetail: feature.properties.kind_detail ?? null,
          name: feature.properties.name ?? null
        }

        if (geojson.geometry.type === 'LineString') {
          addLine(features, geojson.geometry.coordinates, properties)
        } else if (geojson.geometry.type === 'MultiLineString') {
          for (const line of geojson.geometry.coordinates) {
            addLine(features, line, properties)
          }
        }
      }
    }
  }

  const featureCollection = {
    type: 'FeatureCollection',
    features
  }
  const serialized = `${JSON.stringify(featureCollection)}\n`
  const bounds = [Infinity, Infinity, -Infinity, -Infinity]
  for (const feature of features) {
    updateBounds(bounds, feature.geometry.coordinates)
  }

  await mkdir(new URL('../public/data/', import.meta.url), { recursive: true })
  await writeFile(OUTPUT, serialized, 'utf8')

  const byteSize = Buffer.byteLength(serialized)
  console.log(`Extracted ${features.length} road features at z${zoom}.`)
  console.log(`Output: ${OUTPUT.pathname}`)
  console.log(`Size: ${byteSize} bytes (${(byteSize / 1024).toFixed(1)} KiB)`)
  console.log(`BBox: ${bounds.map((value) => value.toFixed(6)).join(',')}`)
  console.log(`Tile compression: ${header.tileCompression}`)
} finally {
  await fileHandle.close()
}
