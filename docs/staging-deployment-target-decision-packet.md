# Staging Deployment Target Decision Packet

This packet is a docs-only owner decision aid. It does not approve deployment, does not run deployment commands, does not change environment values, and does not activate live behavior.

## Current Repo Context

- Latest repo commit at packet creation: `124828a Add staging deployment rehearsal log`.
- Latest implementation checkpoint in ledger: `4382cdf Add staging deployment approval packet guard`.
- Staging approval packet: `docs/staging-deployment-approval-packet.md`.
- Staging rehearsal log: `docs/staging-deployment-rehearsal-log.md`.
- App framework: Next.js 16.2.6.
- Current scripts: `npm run build`, `npm run start`, `npm run lint`, `npm run test:app-smoke-browser`, `npm run test:booking-ui-browser`, and `node scripts/test-preactivation-verification-suite.mjs`.
- Current Next config: default `next.config.ts` with no custom deployment settings.
- Active platform config found: none for Vercel, Netlify, Render, Docker, Fly, Railway, or manual VPS.

## Target Options

| Target option | Expected future deploy command path | Expected rollback method | Required secrets/env later |
| --- | --- | --- | --- |
| Vercel preview/staging project | Preferred path: Git-connected Vercel preview deploy from the approved commit. CLI path, only if separately approved: `vercel deploy --prebuilt` after `npm run build`. | Promote/redeploy the previous successful preview deployment or rollback to the previous approved commit in Vercel. | Staging URL/app host values and any platform project settings. All live DB/write/provider/payment/auth/location/photo/sending env values remain not approved and not set by this packet. |
| Netlify staging site | Git-connected Netlify deploy from the approved commit, or future approved CLI path: `netlify deploy --build --alias staging`. Confirm Next runtime support before use. | Restore the previous successful Netlify deploy or redeploy the previous approved commit. | Netlify site settings and staging URL only. All live DB/write/provider/payment/auth/location/photo/sending env values remain not approved and not set by this packet. |
| Render web service | Git-connected Render web service using `npm run build` as build command and `npm run start` as start command, only after owner approves service settings. | Roll back to the previous Render deploy or redeploy the previous approved commit. | Render service settings, staging URL, and non-live disabled/mock env posture. All live DB/write/provider/payment/auth/location/photo/sending env values remain not approved and not set by this packet. |
| Manual VPS rehearsal host | Future approved manual path: provision host, install Node, checkout approved commit, run `npm ci`, `npm run build`, and run `npm run start` behind a staging-only reverse proxy. | Stop the current process, checkout the previous approved commit or restore previous release directory, rebuild, and restart. | Host-level staging URL and process manager settings only. All live DB/write/provider/payment/auth/location/photo/sending env values remain not approved and not set by this packet. |

## Recommended First Target

Recommended first target: Vercel preview/staging project.

Reason: this repo is a standard Next.js app with default Next config and no existing custom deployment config. Vercel is the lowest-friction staging rehearsal target for the current shape of the app, provided the deploy remains staging-only, no live credentials are added, and the owner separately approves the exact target and command path before deployment.

Netlify and Render remain reasonable alternatives if the owner prefers those platforms, but they require a little more platform-runtime confirmation for this Next.js version. Manual VPS gives maximum control but adds server maintenance, process supervision, TLS, and rollback procedure burden.

## Owner Decision Fields

- Selected target:
- Selected command path:
- Rollback target:
- Approval scope:
- Approval date:
- Owner:
- Notes:

These fields are intentionally blank until William / Prestige Limo SG approves a specific staging deployment target and exact command path.

## Required Future Env/Secrets Status

- Staging app URL / public host: not approved, not set by this packet.
- Vercel/Netlify/Render/VPS project or host settings: not approved, not set by this packet.
- `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED`: must remain unset/disabled and must not be `true`.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY`: not approved for live/write activation.
- Admin dispatcher session/auth env values: not approved for opening live writes.
- Email, WhatsApp, SMS, Telegram, FlightAware, payment, PDF, payout, auth, live-location, and photo/provider env keys: not approved and not set by this packet.
- No secret values may be pasted into docs, commits, screenshots, or chat.

## Explicit Blocked Areas

The following remain blocked unless separately and explicitly approved:

- Live DB/write and migrations.
- Provider/env activation.
- External APIs and live sending.
- Payment/PDF/payout and payment links.
- Auth activation, Supabase Auth, session creation, and token issuing.
- FlightAware live lookup and scheduler.
- Live location, GPS capture, storage, and customer map.
- OTS photo upload, Supabase Storage, and admin viewer.
- CRM/calendar writes, amendment update actions, calendar sync/update/cancel, and customer/driver notifications.
- Risky shim write paths: `rate_settings`, full drivers, `customer_rates`, `driver_payout_rules`, pricing, and payout.

## Required Checks Before Any Future Deploy Approval

- `node scripts/test-preactivation-verification-suite.mjs`
- `npm run lint`
- `npm run build`
- `npm run test:app-smoke-browser`
- `npm run test:booking-ui-browser`
- `git diff --check`
- `git status --short`

Do not proceed to any deployment if any check fails, the worktree is dirty, the target is unclear, rollback is unclear, or live activation settings are present.

## Warning

This packet does not approve deployment yet. It only narrows the owner decision needed before a future staging deploy rehearsal. No Vercel, Netlify, Render, Firebase, VPS, external deployment, env, provider, DB/write, migration, payment, auth, location, photo, CRM/calendar, package, or risky shim action is approved here.
