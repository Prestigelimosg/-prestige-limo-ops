# Staging Deployment Rehearsal Log

This log records local staging deployment rehearsal evidence and post-deploy staging verification evidence. Entries in this log do not deploy the app, change environment values, enable writes, enable providers, activate live features, or approve production.

## Rehearsal Record

- Date/time: 2026-06-14 21:46:19 +08.
- Approved scope: Staging rehearsal only.
- Approval packet: `docs/staging-deployment-approval-packet.md`.
- Latest repo commit at rehearsal start: `6b8cbb4 Fill staging deployment approval packet`.
- Latest implementation checkpoint in ledger: `4382cdf Add staging deployment approval packet guard`.
- Source of truth inspected: `docs/current-implementation-ledger.md`.
- Handoff audit inspected: `docs/business-grade-activation-handoff-audit.md`.
- Build/deploy config inspected: `package.json` scripts and default `next.config.ts`.
- Deployment config scan: no active `vercel.json`, `Dockerfile`, `docker-compose*`, `netlify.toml`, `render.yaml`, `fly.toml`, or `railway.json` deployment config found.
- Deployment commands run: none.

## Commands Run

| Command | Result |
| --- | --- |
| `node scripts/test-preactivation-verification-suite.mjs` | Passed. |
| `node scripts/test-staging-deployment-approval-packet-guard.mjs` | Passed. |
| `node scripts/test-activation-decision-matrix-guard.mjs` | Passed. |
| `npm run lint` | Passed; Babel reported the existing large `app/page.tsx` code-generator size note. |
| `npm run build` | Passed with Next.js 16.2.6. |
| `npm run test:app-smoke-browser` | Passed with `ok: true`, zero console errors, responsive route checks, and route leak guards clean. |
| `npm run test:booking-ui-browser` | Passed with `ok: true`, zero console errors, and zero blocked Supabase requests/mutation requests. |
| `git status --short` | Clean before this log was written. |

## Vercel Staging Deployment Verification - 2026-06-15

- Date/time: 2026-06-15 00:16:28 +08.
- Vercel staging URL: `https://prestige-limo-ops-staging.vercel.app`.
- Vercel project name: `prestige-limo-ops-staging`.
- Deploy target: Vercel Preview/Staging.
- Branch: `staging`.
- Deployment source commit: `25be55a Fill exact Vercel staging deployment decision`.
- Deployment command run by Codex: none.
- Production deployment command run by Codex: none; `vercel --prod` was not run.
- Environment variable action by Codex: none; no env vars were added, changed, printed, or committed by this verification.
- Custom domain/live production activation: not observed; the verified URL stayed on `prestige-limo-ops-staging.vercel.app` without redirect.

### Staging Verification Results

| Check | Result |
| --- | --- |
| Staging root URL `/` | Passed; returned `200` HTML and app content. |
| Public routes `/book`, `/my-bookings`, `/customers`, `/driver-job-demo` | Passed; each returned `200` HTML and app content. |
| Production hardening readiness API | Passed; anonymous request stayed gated and admin-purpose GET returned setup-only/manual-approval-required with deployment, live DB write, migration, provider/env, payment, auth, and live sending flags false. |
| Email activation preflight setup API | Passed; returned `activationReady false`, `providerConfigured false`, `sendingEnabled false`, `liveSendingEnabled false`, `external_send false`, and blockers for provider/env/approval/live sending. |
| Customer Copy Email disabled-send API | Passed; returned `status blocked`, `sendingEnabled false`, and `external_send false`. |
| Customer Copy WhatsApp disabled-send API | Passed; returned `status blocked`, `providerConfigured false`, `sendingEnabled false`, `liveSendingEnabled false`, and `external_send false`. |
| Customer Copy SMS disabled-send API | Passed; returned `status blocked`, `providerConfigured false`, `sendingEnabled false`, `liveSendingEnabled false`, and `external_send false`. |

### Local Checks Run For This Verification

| Command | Result |
| --- | --- |
| `node scripts/test-preactivation-verification-suite.mjs` | Passed. |
| `npm run lint` | Passed; Babel reported the existing large `app/page.tsx` code-generator size note. |
| `npm run build` | Passed with Next.js 16.2.6. |
| `git diff --check` | Passed before this log update. |
| `git status --short` | Clean before this log update. |

### Vercel No-Live Boundaries Confirmed

- Staging URL loaded and the app was reachable.
- No deployment command was run during this verification.
- No `vercel deploy`, `vercel --prod`, Netlify, Firebase, or other external deployment command was run during this verification.
- No environment variables were added, changed, printed, or committed by this verification.
- No live provider/env keys were required for the verified setup-only routes.
- No live DB/write path was activated by the verified setup-only responses.
- Setup-only/no-live status remained visible through production hardening, email preflight, and Customer Copy disabled-send API responses.
- Customer Copy Email/WhatsApp/SMS remained send-disabled.
- No custom domain or live production activation was observed from the verified staging URL.
- No package, code, UI, API, helper, route, provider, or runtime behavior was changed.

## Original Rehearsal No-Live Boundaries Confirmed

- No deployment was performed.
- No `vercel deploy`, `netlify deploy`, `firebase deploy`, or external deployment command was run.
- No environment variables were added, printed, changed, or committed.
- No package or dependency changes were made.
- No code, UI, API, helper, route, provider, or runtime behavior was changed.
- No live DB/write, migration, provider/env activation, external API, live sending, payment/PDF/payout, auth activation, live location, photo upload/storage, CRM/calendar live write, or risky shim write was activated.
- Staging approval packet remains planning/rehearsal-only, with live activation approval set to not approved.

## Blocked Activation List

The following remain blocked unless separately and explicitly approved:

- Live DB/write and migrations.
- Deployment beyond rehearsal planning.
- Provider/env activation.
- External APIs and live sending.
- Payment/PDF/payout and payment links.
- Auth activation, Supabase Auth, session creation, and token issuing.
- FlightAware live lookup and scheduler.
- Live location, GPS capture, storage, and customer map.
- OTS photo upload, Supabase Storage, and admin viewer.
- CRM/calendar amendment update actions, calendar sync/update/cancel, and customer/driver notifications.
- Risky shim write paths: `rate_settings`, full drivers, `customer_rates`, `driver_payout_rules`, pricing, and payout.

## Next Owner Decision Required

William / Prestige Limo SG must separately approve any next action beyond the verified Vercel Preview/Staging deployment. This includes any staging env change, custom domain, production promotion, live DB/write activation, provider/env activation, external API/live sending, payment/PDF/payout, auth, live location, photo upload/storage, CRM/calendar writes, or risky shim writes. This log is not approval to deploy further or activate live behavior.
