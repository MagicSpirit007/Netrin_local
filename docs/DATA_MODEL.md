# Data model and portability

Netrin_local keeps its core data in browser storage and uses WGS-84 coordinates
throughout. TypeScript definitions in `src/data/types.ts` are the application
contract; optional Supabase rows are parsed at the boundary before use.

## Local stores

| Store/key | Content |
| --- | --- |
| IndexedDB database `netrin`, store `drafts`, key `routeDrafts` | Route drafts, recorded points, segment provenance, sync state |
| IndexedDB database `netrin`, store `media` | Photo blobs keyed by draft photo IDs |
| LocalForage key `netrin.downloaded` | Validated public routes copied for local use |
| LocalForage key `netrin.activeRouteSelection` | Active route identifier |
| LocalForage key `netrin.appearance` | Map appearance settings |

Older downloaded segments are normalized when loaded. Invalid remote rows are
discarded rather than coerced.

## Geographic rules

- Coordinates are `[longitude, latitude]` in WGS-84.
- GeoJSON route geometry is a `LineString`.
- A public route has 2–2,000 coordinates and at most 100 stops.
- A nearby campus network path may be used, but a direct segment remains the
  deterministic fallback.
- Segment records retain whether geometry came from the network or a fallback.

## Optional remote shape

The portable migration in `supabase/migrations/0001_routes.sql` mirrors the
frontend limits and exposes only the `routes_public` view plus the validated
`publish_route` RPC. Photos use owner-scoped paths:

```text
routes/<authenticated-user-id>/<draft-id>/<point-id>.jpg
```

## Export status

v0.1.0 does not yet provide a one-click archive export/import UI. Browser
developer tools can inspect IndexedDB, but that is not a stable user workflow.
A future portable archive should version its schema, include JSON plus media,
and validate all imported coordinates and sizes before writing local stores.
