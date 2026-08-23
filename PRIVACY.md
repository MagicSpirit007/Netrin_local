# Privacy

Netrin_local is designed to work locally without an account or server.

## Data kept on the device

Route drafts, recorded points, selected photos, downloaded routes, the active
route choice, and appearance settings are stored in the browser (primarily
IndexedDB). They remain on the device until the user removes them or clears site
data. The project does not include analytics, advertising, or telemetry SDKs.

## Location and photos

Location permission is requested only for recording and navigation. Raw and
snapped coordinates are processed in the browser. A photo selected for a route
is decoded and re-encoded as JPEG before optional upload, which discards the
original file's embedded metadata. Input and output size limits apply.

## Optional Supabase sync

When both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are configured,
the user may explicitly publish a route. That action sends the route's title,
description, WGS-84 coordinates, stops, author label, and selected re-encoded
photos to that Supabase deployment. Public routes and their media are designed
to be publicly readable. Anonymous authentication still creates a backend user
identifier for ownership and RLS enforcement.

The operator of a configured Supabase deployment is independently responsible
for its retention, access, and legal notices. This repository ships no production
server identity or private key.

## Network requests

Core operation uses bundled PMTiles, GeoJSON, fonts, and application assets.
Normal runtime does not fetch Google Fonts, jsDelivr fonts, or an online map
SDK. Network access occurs for optional Supabase sync and ordinary browser/PWA
delivery.

Do not publish private locations, another person's image, or sensitive species
locations without appropriate permission.
