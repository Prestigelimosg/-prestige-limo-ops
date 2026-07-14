# Staging Deployment Approval Packet

This packet records the approved deployment-safety configuration work and the later isolated Preview deployments. It does not deploy Production, enable writes, enable providers, or activate any live feature. The Preview isolation change, bounded Production recovery, Preview deployments, and sanitized verification evidence are recorded below without exposing values.

## Checkpoints

- Latest repo commit deployed to isolated Preview: `fd0eecd3 Update automatic preparation checkpoint`.
- Latest verified runtime checkpoint in the ledger: `5a7ea651 Prepare Codex job cards when requests arrive`.
- Source of truth: `docs/current-implementation-ledger.md`.

## Approval Fields

- Owner: William / Prestige Limo SG
- Approval date: 2026-07-14
- Approved scope: Change the Vercel Production Branch from `staging` to `main`, isolate Preview environment assignments from Production, then create and verify one isolated `staging` Preview without pushing or deploying Production
- Original decision: Approved production-branch safety separation and Preview isolation only; no deployment approval at that stage
- Preview deployment decision: Owner later explicitly approved proceeding with the suggested next step: one isolated Preview deployment and bounded verification
- Live activation approval: Not approved
- Approved staging target: Exact local commit `d292da05` to one refreshed isolated `staging` Preview deployment only; no Git push and no Production deploy
- Preview isolation approval: Approved on 2026-07-14 for Preview environment targeting only; no provider-key rotation, Production deployment, database write, or external send was approved
- Production recovery approval: Approved on 2026-07-14 for exact existing credential recovery and safe prior-state verification only; no credential creation/rotation, write-gate activation, deployment, push, or external send was approved
- Resend replacement-key approval: Owner gave separate action-time approval on 2026-07-14 to create one sending-access key and save it to Vercel Production only; deletion of the existing key, Preview assignment, deployment, push, send-gate activation, and external send remained unapproved
- Isolated Preview deployment approval: Approved on 2026-07-14 after Production recovery and Preview names-only review; scope was one Preview deployment, GET-only smoke/privacy checks, and evidence recording only
- Isolated Preview refresh approval: Owner later explicitly approved the suggested next step on 2026-07-14; scope was exact local commit `f62869b7`, one refreshed isolated Preview, GET-only checks, and evidence recording only
- Codex correction Preview approval: Owner then explicitly approved proceeding carefully with the next suggested step on 2026-07-14; scope was exact local commit `bdd91bec`, one isolated Preview refresh, GET-only checks, and evidence recording only
- Dashboard consolidation Preview approval: Owner explicitly approved proceeding with the suggested next step on 2026-07-14; scope was exact local commit `d292da05`, one isolated Preview refresh, GET-only checks, bypass revocation, and evidence recording only
- Automatic preparation Preview approval: Owner explicitly approved proceeding with the suggested next safe step on 2026-07-14; scope was exact local commit `fd0eecd3`, containing runtime commit `5a7ea651`, one isolated protected Preview, GET-only checks, bypass revocation, and evidence recording only
- Rollback owner: William / Prestige Limo SG
- Notes: Keep all live DB/write, migrations, provider/env activation, external APIs, live sending, payment/PDF/payout, auth activation, live location, photo upload/storage, CRM/calendar amendment writes, and risky shim writes blocked.

## Current Verified Branch Separation

- Vercel Production Branch is `main`; `staging` is no longer the Production Branch.
- Changing Branch Tracking created no deployment and made no domain, alias, environment-variable, or Git change.
- `app.prestigelimo.sg` remains on READY deployment `f7e253b3 Repair mobile automation regression coverage` with the same `f7e253b3` page build marker.
- Live Automation remains OFF; booking intake remains ON; calendar auto-write, invoice auto-issue, Driver Details Email auto-send, and external send remain OFF.
- Owner approved Preview isolation only. The Vercel CLI was instructed to remove 17 shared names from Preview, but it deleted the multi-target records from both Preview and Production despite the documented environment-specific command. This failure is recorded openly; no deployment was created, so the running Production artifact retained its frozen environment.
- Final bounded recovery established 16 Production assignments without printing values: the prior 15 exact assignments plus one newly approved Resend sending-access key stored as `RESEND_API_KEY`. The new key is named `prestige-limo-ops-production-recovery-20260714`, is restricted to the verified `prestigelimo.sg` domain, and showed no activity after creation. The existing Resend key remains intact. None was added to Preview.
- Production's names-only audit now passes with all 22 required names and no missing names. Preview still finds 0 of 22 required names; its only remaining project variable is the inert Preview-only browser allowed-origins entry. Values were not printed.
- `PRESTIGE_COMPANY_TRAVELER_CRM_IDENTITY_CONTACT_WRITE_ENABLED` remains intentionally absent and fail-closed. Vercel history confirms its prior target changes but does not expose the prior value; the existing readiness lock still requires separate owner approval before this write gate may be opened, so it was not guessed or restored.
- `PRESTIGE_DRIVER_DETAILS_EMAIL_SEND_ENABLED` remains false. Creating and storing the replacement key did not send email, enable a provider action, create a deployment, or change the running Production artifact.
- Vercel environment changes do not affect already-built deployments. Before the first isolated deployment, the prior Preview artifact still contained its old frozen environment; both later isolated Preview builds consumed the reviewed Preview configuration.
- Remote `main` is `adf37589`, six commits behind remote `staging` at `f7e253b3`; local `staging` is six commits ahead before this record. No merge or push occurred.
- Previous READY deployment `f91d0d1e Style customer invoice sectors in black and gold` remains the identified manual rollback target; no rollback is in progress or approved by this record.
- The public Vercel project PATCH attempt returned HTTP 400 before mutation because `productionBranch` is not a supported top-level field. The signed-in Vercel Branch Tracking control was then used and independently verified; nothing is hidden as an API success.
- Pre-deployment browser testing found and stopped on a real operator-feedback defect before deployment. The established applied-snapshot update lane and its existing browser guard were repaired and committed as `294cd1d8`; the final `Admin Review Required` warning now remains visible after the mocked Google Calendar terminal result.
- One deployment was then created with `vercel deploy --target=preview --yes`: deployment `dpl_3Y4sav9jUK4X7XiQhMuVi7PXpuzY`, URL `https://prestige-limo-ops-staging-3khww1978-prestigelimosgs-projects.vercel.app`, target `preview`, status `Ready`, and page build marker `294cd1d8`.
- The new Preview consumed the isolated configuration. Post-deploy names-only review still found 0 of 22 required live names and only the inert Preview `PRESTIGE_GOOGLE_MAPS_BROWSER_ALLOWED_ORIGINS` assignment. No Preview credential or live/write gate was added.
- The Preview root remains behind Vercel SSO with HTTP 302 and `x-robots-tag: noindex`. Authenticated CLI GET-only verification required an automation bypass secret; the CLI generated one without printing it, every bounded GET check completed, then that exact CLI-created secret was revoked. Final automation-bypass count is zero and unauthenticated Preview access again returns the SSO redirect.
- Sanitized GET-only checks confirmed `/book` and `/my-bookings` did not expose customer-forbidden terms, the exact token-scoped `/driver-job/[token]` failure surface did not expose driver-forbidden terms, and unauthenticated `GET /api/admin-automation-runtime` returned safe HTTP 403 without secret/internal leakage.
- The raw `/driver-job-demo` keyword scan matched only the word `billing` inside two negative local-demo safety statements saying no billing behavior is created. It exposed no customer price, invoice/payment data, payout comparison, PayNow payout, finance/internal notes, or mock archive data; the real token-scoped driver surface passed separately. This match is recorded and not hidden as a clean raw-keyword result.
- Exact-commit local verification passed `npm run build`, both browser suites with zero console errors, the complete pre-activation suite, deployment guards, staged-app-change guard, and `git diff --check`. Lint remained at 160 existing warnings and zero errors.
- The local Next server terminal printed bundled `supabaseUrl is required` diagnostics when the broad tests deliberately touched disabled backend paths without Supabase configuration. Those requests did not succeed; browser console errors and blocked Supabase requests remained zero, safe API response guards passed, and Preview intentionally has no Supabase names. This is recorded as fail-closed server diagnostic noise, not as database-connectivity success.
- Production remained unchanged throughout: `app.prestigelimo.sg` still resolves to READY Production deployment `dpl_7ksuhQENRPiWNACbEM4Y6dGf6ayR` with build marker `f7e253b3`. No Production deploy, alias move, promotion, rollback, or Git push occurred.
- A second approved isolated Preview refresh deployed exact local commit `f62869b7` as READY deployment `dpl_BMEEqdSwWqx26eK4Sa3zipHTaGPg`.
- The refreshed Preview URL is `https://prestige-limo-ops-staging-htd1bzj6m-prestigelimosgs-projects.vercel.app`, its Vercel target is `preview`, and its rendered page identifies exact build marker `f62869b7`.
- The refreshed Preview still has 0 of 22 required live names and only the inert Preview `PRESTIGE_GOOGLE_MAPS_BROWSER_ALLOWED_ORIGINS` assignment. No credential, provider key, live database setting, write gate, or auth activation was added.
- Both GET-only admin checks returned safe HTTP 403: `/api/admin-automation-runtime` and `/api/admin-app-notifications?page=1&limit=5`.
- Deployment logs show only three verification GETs: root HTTP 200 and the two admin API HTTP 403 responses. No POST, PATCH, PUT, or DELETE request reached the refreshed Preview.
- The authenticated CLI generated one automation-bypass token without printing it for exact-build and fail-closed GET checks. That exact token was revoked immediately; final automation-bypass count returned to zero, and unauthenticated Preview access again returns HTTP 302 with `x-robots-tag: noindex`.
- Signed-in visual acceptance remains incomplete because browser control failed before navigation with `Cannot redefine property: process`. No Preview control was clicked and no visual pass is claimed.
- Production remained unchanged after the refresh: `app.prestigelimo.sg` still resolves to READY Production deployment `dpl_7ksuhQENRPiWNACbEM4Y6dGf6ayR` and renders build marker `f7e253b3`. No Production deploy, alias move, promotion, rollback, Git push, live-data write, Automation activation, provider send, environment edit, or Preview credential addition occurred.
- The later Codex job-card correction Preview preflight stopped on two stale evidence defects instead of skipping them: the retired dashboard queue guard was repaired in `0cbf91ce`, then the ledger's verified runtime checkpoint was corrected in `bdd91bec`. The complete pre-activation suite passed only after both repairs.
- Exact local commit `bdd91bec` was deployed with `vercel deploy --target=preview --yes` as READY Preview deployment `dpl_9kRurW7hvqjaDKQ6GbFD7a2HPsXd` at `https://prestige-limo-ops-staging-o50f4kvz2-prestigelimosgs-projects.vercel.app`.
- Vercel inspection confirms target `preview`; authenticated GET-only root verification confirms exact page build marker `bdd91bec`.
- Names-only Preview review still shows only the inert `PRESTIGE_GOOGLE_MAPS_BROWSER_ALLOWED_ORIGINS` assignment. No Supabase, admin-session, auth, provider, payment, email, calendar, automation-write, or live credential/gate was added.
- GET-only checks returned root HTTP 200 and safe HTTP 403 for both `/api/admin-automation-runtime` and `/api/admin-app-notifications?page=1&limit=5`. Sanitized deployment logs contain only those three GETs and no POST, PATCH, PUT, or DELETE request.
- Vercel CLI generated one automation-bypass token without printing it, then the exact token was revoked immediately. Final automation-bypass count is zero; unauthenticated Preview access again returns HTTP 302 with `x-robots-tag: noindex`.
- Exact-current-commit build, complete pre-activation suite, app-smoke browser suite, booking-UI browser suite, and diff review passed. Both browser suites reported zero test errors and zero console errors; lint passed with 160 existing warnings and zero errors.
- Local browser verification used in-memory backend responses. The local Next terminal printed fail-closed 503s and one bundled `supabaseUrl is required` diagnostic for intentionally unconfigured backend paths; this is recorded as disabled-backend evidence, not database connectivity.
- Vercel's build output reported four dependency audit findings: one low and three moderate. They were not changed or hidden in this deployment-only pass.
- Signed-in visual acceptance of this latest protected URL is pending; no deployed visual pass is claimed. Production remains unchanged on `dpl_7ksuhQENRPiWNACbEM4Y6dGf6ayR` with build marker `f7e253b3`.
- The later Dashboard one-glance consolidation passed its focused guards, complete pre-activation suite, build, app-smoke browser, booking-UI browser, mobile-usability browser, and diff review at runtime checkpoint `f2e327dc`; browser suites reported zero test errors and zero console errors, while lint remained at 160 existing warnings and zero errors.
- Exact clean local commit `d292da05 Update Dashboard runtime checkpoint` was deployed with `vercel deploy --target=preview --yes` as READY Preview deployment `dpl_4vi4yrUxSVnrDxy5KVuFN5AchyFS` at `https://prestige-limo-ops-staging-hu6kl2yeu-prestigelimosgs-projects.vercel.app`.
- Vercel inspection confirms target `preview`; authenticated GET-only root verification returned HTTP 200 and confirmed exact page build marker `d292da05`.
- Names-only Preview review still shows only the inert `PRESTIGE_GOOGLE_MAPS_BROWSER_ALLOWED_ORIGINS` assignment. No Supabase, admin-session, auth, provider, payment, email, calendar, automation-write, or live credential/gate was added.
- GET-only checks returned safe HTTP 403 for both `/api/admin-automation-runtime` and `/api/admin-app-notifications?page=1&limit=5`. Sanitized deployment logs contain only the root HTTP 200 GET and those two HTTP 403 GETs; no POST, PATCH, PUT, or DELETE request reached the deployment.
- Vercel CLI generated one automation-bypass token without printing it, then the exact token was revoked immediately. Final automation-bypass count is zero; unauthenticated Preview access again returns HTTP 302 with `x-robots-tag: noindex`.
- Preview intentionally has no Supabase or admin-session configuration, so `Automation unavailable`, empty/non-live queues, and fail-closed admin reads are expected rather than live-operations proof.
- Vercel's build output again reported four dependency audit findings: one low and three moderate. They remain recorded and were not changed in this Preview-only pass.
- Signed-in visual acceptance of the consolidated deployed interface is pending; no deployed visual pass is claimed. Production remains unchanged on READY deployment `dpl_7ksuhQENRPiWNACbEM4Y6dGf6ayR` with build marker `f7e253b3`, and no Git push occurred.
- The later automatic Codex job-card preparation pass passed its focused guard and the exact committed pre-activation verification suite at runtime checkpoint `5a7ea651`; exact clean local commit `fd0eecd3 Update automatic preparation checkpoint` was then deployed with `vercel deploy --target=preview --yes` as READY Preview deployment `dpl_H6ELwkT3vww5uEvtgCmH73g3Pjyp` at `https://prestige-limo-ops-staging-1dkwj1vc8-prestigelimosgs-projects.vercel.app`.
- Vercel inspection confirms target `preview`. Authenticated GET-only root verification returned HTTP 200 and confirmed exact page build marker `fd0eecd3`; both `/api/admin-automation-runtime` and `/api/admin-app-notifications?page=1&limit=5` returned safe HTTP 403.
- Sanitized deployment logs contain only those three approved GETs and no POST, PATCH, PUT, or DELETE request. Names-only Preview review still shows only the inert `PRESTIGE_GOOGLE_MAPS_BROWSER_ALLOWED_ORIGINS` assignment; no Supabase, admin-session, auth, provider, payment, email, calendar, automation-write, or live credential/gate was added.
- The Vercel CLI generated one automation-bypass token without printing it, and the exact token was immediately revoked. Final automation-bypass count is zero; unauthenticated Preview access returns HTTP 302 with `x-robots-tag: noindex`.
- Preview intentionally has no Supabase or admin-session configuration. It proves the exact code artifact and fail-closed boundary, but it cannot prove a live automatic preparation write; `Automation unavailable`, an empty queue, and no prepared job card are expected. No live booking, amendment, runtime toggle, calendar action, invoice action, or external send occurred.
- A current local dependency audit reports the same four known findings: one low and three moderate, with zero high or critical findings. Production remains unchanged on READY deployment `dpl_7ksuhQENRPiWNACbEM4Y6dGf6ayR`, returns HTTP 200, and serves build marker `f7e253b3`. No Production deploy, alias move, promotion, rollback, Git push, environment edit, live-data write, provider send, or Automation state change occurred.

## Required Checks Before Staging

- `node scripts/test-preactivation-verification-suite.mjs`
- `npm run lint`
- `npm run build`
- `npm run test:app-smoke-browser`
- `npm run test:booking-ui-browser`
- `git diff --check`
- `git status --short`

Do not proceed if any check fails or if the worktree is dirty. This gate stopped the first deployment attempt until the browser failure was repaired, reviewed, and committed.

## Staging Deploy Steps

1. Confirm the owner/date/scope fields above are filled.
2. Confirm the target is staging only, not production.
3. Confirm the rollback commit and previous deployment are known.
4. Production's required names-only configuration recovery is complete, but do not push `staging`, push `main`, or deploy without a separate deployment approval.
5. Keep the existing Resend key intact and the Driver Details Email send gate false. Do not delete or rotate either key, assign provider credentials to Preview, or send a message without separate action-time approval. Keep the CRM gate absent and fail-closed until its separately guarded activation is explicitly approved.
6. After exact Production recovery is verified, deploy the existing app build artifact or clean repo commit to staging Preview only with its isolated no-Supabase/no-provider configuration.
7. Do not add live credentials, provider tokens, payment keys, auth activation, DB write flags, or migration commands to Preview.
8. Run the post-deploy smoke checklist below against the new staging Preview URL; do not use the existing old Preview artifact as isolation evidence.
9. Record sanitized evidence only. Do not paste secrets, tokens, env values, database rows, stack traces, or provider responses.

## Env Values That Must Remain Unset Or Disabled

- `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED` must not be `true`.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` must not point to an approved write/live target.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` must not expose a live customer/write surface.
- `PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE`, `PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE`, and `PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN` must not be used to open live writes.
- `DRIVER_JOB_LINK_MODE`, `NEXT_PUBLIC_DRIVER_JOB_LINK_MODE`, and `PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED` must stay mock/disabled unless separately approved.
- `AI_PARSE_MODE` must stay mock.
- Customer auth/session flags must stay disabled.
- OneMap/map flags and tokens must stay disabled unless a separate staging-only map approval exists.
- Email, WhatsApp, SMS, Telegram, FlightAware, payment, PDF, payout, auth, live-location, and photo/provider env keys must remain unset or disabled.

## No-Live Gates To Verify After Deploy

- Production hardening readiness still returns blocked/manual approval required.
- Pre-activation verification suite still passes locally against the same commit.
- Setup-only APIs remain GET-only and disabled/no-op.
- Customer Copy Email/WhatsApp/SMS stays setup-only with `sendingEnabled false` and `external_send false`.
- Calendar lifecycle create/update/cancel remains blocked and requires admin approval later.
- Customer amendment/cancellation never auto-updates CRM, booking, or calendar.
- Shim cleanup guard still parks risky write paths.
- Public/customer/driver routes do not expose admin finance, payout, PayNow payout, parser/debug internals, internal admin notes, mock QA/dev archive, or provider/env details.

## Post-Deploy Smoke Checklist

- Open staging admin route and confirm core tabs load.
- Confirm Dispatch, Dashboard, Bookings, Drivers, Completed, and Rates surfaces render without horizontal overflow.
- Confirm Customer Copy channel buttons remain setup-only/disabled.
- Confirm Save Booking + CRM auto-syncs Google Calendar; manual ICS export controls are removed from normal admin operation.
- Confirm `/book`, `/my-bookings`, `/customers`, `/driver-job-demo`, and `/driver-job/[token]` route boundaries do not leak admin/private fields.
- Run `npm run test:app-smoke-browser` and `npm run test:booking-ui-browser` against staging if an approved `APP_URL` is available.

## Rollback Checklist

- Identify the previous clean deployment and commit.
- Redeploy the previous artifact or previous commit if staging smoke fails.
- Keep all live gates false/unset during rollback.
- Remove any accidentally added staging secrets and rotate any exposed keys.
- Re-run `node scripts/test-preactivation-verification-suite.mjs`.
- Confirm `git status --short` is clean.
- Record sanitized failure and rollback evidence.

## Explicit Blocked List

The following remain blocked unless separately and explicitly approved: live DB/write, migrations, provider/env activation, external APIs, live sending, payment/PDF/payout, auth, live location, photo upload, CRM/calendar writes, risky shim writes, deployment to production, package changes, and env changes.
