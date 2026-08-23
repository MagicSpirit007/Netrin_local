# Security policy

## Supported versions

Security fixes are provided for the latest published `0.1.x` release and the
current `main` branch.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting form:

https://github.com/MagicSpirit007/Netrin_local/security/advisories/new

Do not open a public Issue, discussion, or pull request containing exploit
details, credentials, private location data, or another person's photographs.

Include the affected revision, reproduction conditions, impact, and the minimum
proof needed to validate the report. Remove real secrets and personal data from
screenshots or logs. Maintainers will acknowledge a report as soon as practical,
coordinate validation and remediation privately, and credit reporters who want
to be named.

## Security boundaries

- The PWA is fully usable without Supabase.
- Frontend configuration may contain only public anon/publishable keys.
- A Supabase `service_role` key must never be shipped to the browser.
- The example migration is not evidence of deployment to any real server.
- Route and photo uploads are untrusted input and are bounded in both the client
  and the example database/storage policies.

Please also report dependency or supply-chain concerns affecting the locked
build.
