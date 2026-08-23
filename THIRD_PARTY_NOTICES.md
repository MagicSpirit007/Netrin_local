# Third-party notices and data licenses

The MIT license in [LICENSE](LICENSE) covers Netrin_local application code. It
does not replace the licenses or terms attached to map data, generated
geographic assets, fonts, or npm dependencies.

## Geographic assets

| Asset | Source | Terms and attribution |
| --- | --- | --- |
| `public/maps/donghu-campus.pmtiles` | Protomaps Basemaps built from OpenStreetMap and Natural Earth sources | OSM-derived data is made available under ODbL 1.0. Attribute © OpenStreetMap contributors. Natural Earth portions are public domain. See the Protomaps license notice. |
| `public/data/campus-paths.json` | Campus paths derived from OpenStreetMap geometry | Open Database License 1.0; attribute © OpenStreetMap contributors. |
| `public/data/basemap-water.json` | Water geometry extracted from the bundled Protomaps basemap | Detailed OSM-derived portions remain under ODbL 1.0; Natural Earth source portions are public domain. |

Relevant terms:

- OpenStreetMap copyright and attribution: https://www.openstreetmap.org/copyright
- Open Database License 1.0: https://opendatacommons.org/licenses/odbl/1-0/
- Protomaps Basemaps license notice: https://github.com/protomaps/basemaps/blob/main/LICENSE.md
- Natural Earth terms (public domain): https://www.naturalearthdata.com/about/terms-of-use/

The application displays OpenStreetMap attribution on the map. Redistributors
must preserve required attribution and review ODbL obligations for database
redistribution or substantial extracts.

## Fonts

- Space Grotesk, bundled through `@fontsource-variable/space-grotesk`: SIL Open
  Font License 1.1.
- LXGW WenKai Screen, bundled through `lxgw-wenkai-screen-webfont`: font files
  under SIL Open Font License 1.1; npm wrapper metadata is MIT.

## JavaScript dependencies

Dependency names and exact resolved versions are recorded in `package-lock.json`.
Their own license texts remain authoritative. Use `npm query '*'` or a
dedicated license inventory tool before redistributing a modified dependency
bundle.

`@mapbox/jsonlint-lines-primitives@2.0.2` omits the `license` field from its
published package metadata; its official upstream repository supplies an MIT
license: https://github.com/mapbox/jsonlint/blob/release-mapbox-scoped/LICENSE
