# Repository guidance

These instructions apply to the whole repository.

- Preserve the local-first floor: the application must remain fully useful
  without Supabase or another online service.
- Keep all internal geographic data in WGS-84 GeoJSON.
- Do not introduce an online map SDK or a runtime font/CDN dependency.
- Treat road snapping and remote sync as enhancements; retain direct routing
  fallback and local storage behavior.
- Route every user-facing string through i18n.
- Keep frontend secrets out of the repository. Only public Supabase
  anon/publishable keys may use the `VITE_` prefix; never expose a
  `service_role` key.
- Do not add real server addresses, credentials, deployment archives, logs,
  generated `dist/`, or vendored third-party source trees.
- When changing remote route/media contracts, update client validation, the
  portable migration, documentation, and tests together.
- Before submitting code, run `npm run check`, `npm run typecheck`,
  `npm test`, both supported base-path builds, and the smoke checks described
  in README.
