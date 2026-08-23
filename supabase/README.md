# Optional Supabase sync

Netrin_local works without a backend. The migration in `migrations/0001_routes.sql`
is a portable example for contributors who want anonymous-account route sharing.

It creates the `routes` table, indexes, row-level security policies, the
`routes_public` security-invoker view, the validated `publish_route` RPC, and a
publicly readable `route-media` bucket with owner-scoped writes and a 5 MiB JPEG
limit.

Apply it only to a disposable or staging Supabase project after reviewing it.
This repository does not contain server addresses, service-role keys, or evidence
that the migration has been run against any real server.
