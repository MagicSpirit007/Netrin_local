# Netrin_local

[简体中文](README.md) | **English**

Netrin_local is the local-first edition of Netrin: a mobile PWA for exploring
campus nature routes. Maps, routes, and fonts are available offline with the
app, while route drafts and downloaded content are stored in the browser by
default. Supabase is an optional synchronization layer.

This repository does not integrate the AMap SDK or API, and its core navigation
experience does not depend on an online map service.

## Features

- MapLibre GL JS with a local PMTiles offline basemap
- Campus-path snapping with an offline straight-line fallback
- Walking-route recording, stops, photos, and species notes
- Stop-by-stop navigation, persistent route selection, and Chinese/English UI
- Installable PWA, deployed at the site root by default
- Optional Supabase publishing and downloads through anonymous authentication

> v0.1.0 is the first public release. The main JavaScript bundle is still about
> 1.4 MB and would benefit from code splitting, but this does not block the
> local-first experience.

## Quick start

Node.js 22.12 or newer is required. CI covers Node.js 22 and 24.

```bash
git clone https://github.com/MagicSpirit007/Netrin_local.git
cd Netrin_local
npm ci
npm run dev
```

Run the quality checks and production build:

```bash
npm run check
npm run typecheck
npm test
npm run build
npm run smoke -- /
```

The default build base path is `/`. To deploy under the legacy `/netrin/` path,
set `NETRIN_BASE_PATH=/netrin/` before building. PowerShell example:

```powershell
$env:NETRIN_BASE_PATH = '/netrin/'
npm run build
npm run smoke -- /netrin/
```

## Local-first behavior and privacy

Without a configured backend, the bundled map and routes, route authoring, and
downloaded routes remain fully usable. Browser data is stored in IndexedDB;
clearing site data removes that local content. The app contains no analytics or
advertising SDKs.

Location access is used only for on-device recording and navigation. Route
text, coordinates, and selected photos are sent to the configured Supabase
project only when the user explicitly publishes a route. Photos are re-encoded
as JPEG on the client to remove original-file metadata and constrain their
size. See [PRIVACY.md](PRIVACY.md).

## Optional Supabase synchronization

Copy the environment template and provide only a public anon/publishable key:

```bash
cp .env.local.example .env.local
```

When both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are unset, the app
automatically remains in local mode. Never expose a `service_role` key through
frontend environment variables.

The [portable example migration](supabase/migrations/0001_routes.sql) provides
the routes table, RLS, public view, publishing RPC, and Storage policies. It is
not applied automatically to any real server.

## Project structure

- `src/`: React app, navigation state machine, local storage, and remote-boundary validation
- `data/`: bundled routes and nature-observation data
- `public/maps/`: offline PMTiles
- `public/data/`: campus paths and water GeoJSON
- `scripts/`: data-generation and build-smoke scripts
- `supabase/`: portable examples for the optional backend

See [docs/DATA_MODEL.md](docs/DATA_MODEL.md) for local-storage keys, WGS-84
constraints, and export status.

## Data licenses and attribution

The application code is released under the [MIT License](LICENSE). Map and
geographic data retain their respective terms:

- © OpenStreetMap contributors; data is available under the
  [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
- OSM-derived data in Protomaps Basemaps follows its
  [license and attribution notice](https://github.com/protomaps/basemaps/blob/main/LICENSE.md).
- Natural Earth data is in the public domain.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the complete asset
inventory. The application continues to display OpenStreetMap attribution on
the map.

## Contributing and security

Please read [CONTRIBUTING.md](CONTRIBUTING.md) and
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before contributing. Do not disclose
security issues in public Issues; follow [SECURITY.md](SECURITY.md) and use
GitHub private vulnerability reporting instead.
