# Production Environment Checklist

## 1. Purpose

This checklist is for a future staging and live production rollout of Prestige Limo Ops. It is not an implementation.

Use it before starting any real API, Stripe, notification, flight, maps, calendar, invoice/PDF, authentication, or production Supabase work. The goal is to make sure the business knows what must be prepared, reviewed, tested, and approved before anything live is connected.

## 2. Current Hard Boundary

- No real API connection now.
- No real Stripe call now.
- No real payment link now.
- No bank API now.
- No WhatsApp/SMS/email send now.
- No live location now.
- No flight API now.
- No calendar sync now.
- No invoice/PDF generation now.
- No parser changes now.
- No Supabase migration/schema change now.

## 3. Environment Stages

### Local Development

Local development is the developer machine. It is used for building, testing, and reviewing changes safely before anything reaches staff or customers.

Local development may use local `.env.local` values and mock/test behavior. It must not use live customer payment, notification, live-location, or production database actions unless explicitly approved.

### Staging / Test Environment

Staging is the rehearsal environment. It should look and behave like production, but it should use test keys, test data, and test-mode services.

Staging is where the business should test the full workflow before a live rollout. Stripe test mode, notification mock/log-only mode, Supabase staging data, and manual fallback checks should happen here first.

### Live Production

Live production is the real business environment. It may involve real customer data, staff operations, payment links, notifications, driver links, and production database records.

Nothing should move to live production until staging passes, staff review is complete, rollback is ready, and the business gives explicit approval.

## 4. Environment Variables Checklist

Prepare environment variables for each environment. Test keys and live keys must be separate.

- [ ] Supabase URL.
- [ ] Supabase anon key.
- [ ] Supabase service role key, if ever needed later, server-side only.
- [ ] Stripe publishable key.
- [ ] Stripe secret key.
- [ ] Stripe webhook secret.
- [ ] Notification provider keys later.
- [ ] Maps provider keys later.
- [ ] Flight provider keys later.
- [ ] Calendar provider keys later.
- [ ] AI/OpenAI key later.
- [ ] Public app URL.
- [ ] Driver job public URL.
- [ ] Customer portal public URL.

No secret keys should be committed to git.

## 5. Secret Handling Rules

- Use `.env.local` only for local secrets.
- Use deployment provider environment variable settings for staging and live.
- Never paste secrets into code.
- Never paste secrets into docs.
- Never paste secrets into tests.
- Never paste secrets into screenshots.
- Never paste secrets into commits.
- Rotate keys immediately if they are exposed.
- Keep test keys separate from live keys.
- Staff should not share keys in WhatsApp/chat.
- Live keys should be available only to people who are approved to manage production.

## 6. Supabase Production Readiness Checklist

- [ ] Confirm the production Supabase project.
- [ ] Review schema before migration.
- [ ] Review Row Level Security.
- [ ] Confirm public pages do not have unrestricted write access.
- [ ] Confirm staff/admin pages will require auth and role checks later.
- [ ] Configure backups.
- [ ] Plan audit logs for booking, customer, driver, payment, dispatch, and admin actions.
- [ ] Prepare a migration rollback plan before any schema change.
- [ ] Confirm staging database testing before production.
- [ ] Confirm environment variables are set outside git.

No Supabase command is run in this docs-only stage.

## 7. Stripe Test-Mode Checklist

- [ ] Use Stripe test mode first.
- [ ] Treat Stripe as the preferred future payment-link/card provider because the business already has Stripe.
- [ ] Do not create automatic charging at first.
- [ ] Require staff review before sending a payment link.
- [ ] Use test cards only in staging.
- [ ] Require webhook signature verification later.
- [ ] Keep Stripe secret keys out of git.
- [ ] Use live mode only after explicit approval.
- [ ] Keep PayNow/bank transfer manual-record only.
- [ ] Do not add a bank API.

## 8. Notification Checklist

- [ ] Start WhatsApp, SMS, and email as mock/log-only.
- [ ] Do not send real notifications until explicit approval.
- [ ] Plan audit trail for driver reminders later.
- [ ] Plan opt-in/consent for customer notifications later.
- [ ] Plan failed notification handling.
- [ ] Review message templates before live.
- [ ] Confirm staff can see what would have been sent before real sending is enabled.
- [ ] Confirm real sending can be disabled quickly if needed.

## 9. Live Location Checklist

- [ ] Use secure job-scoped live location only.
- [ ] Use expiring links.
- [ ] Protect driver privacy.
- [ ] Customer live location should be available only for allowed job types later.
- [ ] Arrival/MNG customer live location uses the scoped customer app link only after manual arrival readiness and driver sharing; no flight API/ETA monitoring is claimed.
- [ ] DEP/TRF/hourly can use a customer live link only when secure.
- [ ] Auto-end after POB later.
- [ ] Plan audit trail for live-location start/end events.
- [ ] Plan manual fallback if live location is unavailable.

No live location is added now.

## 10. Flight API Checklist

- [ ] Support Arrival/MNG workflow later.
- [ ] Do not show fake ETA.
- [ ] Provide manual fallback if the API fails.
- [ ] Require driver ETA acknowledgement later.
- [ ] Review API cost before implementation.
- [ ] Review provider reliability before implementation.
- [ ] Show source and last updated time when flight data is eventually shown.
- [ ] Confirm dispatcher can override or continue manually when flight data is missing.

No real flight API is added now.

## 11. Maps, Address, And Routing Checklist

- [ ] Plan address autocomplete.
- [ ] Plan geocoding.
- [ ] Plan route/time estimate.
- [ ] Keep manual fallback.
- [ ] Review cost risk if many lookups happen.
- [ ] Add usage limits before real maps calls.
- [ ] Confirm airport, hotel, terminal, and known-location handling.
- [ ] Test staging before any live maps key is used.

No maps API is added now.

## 12. Invoice, PDF, And Statement Checklist

- [ ] Start with draft preview first.
- [ ] Do not generate real invoice numbers until approved.
- [ ] Plan stable customer prefixes later.
- [ ] Plan PDF generation later.
- [ ] Plan monthly billing later.
- [ ] Confirm invoice number immutability rules before live.
- [ ] Confirm staff review before issuing or sending any invoice/statement.
- [ ] Keep manual billing fallback available.

No invoice/PDF/statement behavior is added now.

## 13. Auth And Access Checklist

- [ ] Plan staff/admin auth.
- [ ] Plan customer portal auth.
- [ ] Plan driver job secure token access.
- [ ] Plan role-based access.
- [ ] Keep public pages limited.
- [ ] Plan session expiry.
- [ ] Plan audit trail.
- [ ] Confirm staff-only pages are not customer-facing.
- [ ] Confirm customer pages cannot access staff/admin data.
- [ ] Confirm driver pages are job-scoped.

No real auth is added now.

## 14. Parser Protection Checklist

- [ ] Treat the parser as business-critical.
- [ ] Do not replace the parser with AI.
- [ ] Run parser tests before any API work.
- [ ] Run parser tests after any API work.
- [ ] Do not change parser files unless a parser task is explicitly approved.
- [ ] Keep real-world parser fixtures protected.
- [ ] Require staff review for any future AI-assisted extraction.
- [ ] Keep deterministic parser behavior as the protected baseline.

## 15. Deployment Checklist

- [ ] Build passes.
- [ ] `npm run test:safe` passes.
- [ ] Environment variables are set.
- [ ] Staging is tested first.
- [ ] Mobile/no-horizontal-overflow is tested.
- [ ] Rollback plan is ready.
- [ ] Staff review is complete before live.
- [ ] No live switch without explicit approval.
- [ ] Confirm mock/local labels are removed only when real behavior is approved.
- [ ] Confirm manual business fallback is ready.

## 16. Rollback Checklist

- [ ] Know the last clean commit.
- [ ] Know how to revert deployment.
- [ ] Keep database backup before migrations later.
- [ ] Turn off live API keys if needed.
- [ ] Disable sending/payment links if an issue occurs.
- [ ] Keep manual business fallback ready.
- [ ] Know who approves rollback decisions.
- [ ] Keep rollback notes with the deployment record.

## 17. Testing Checklist

- [ ] `npm run test:parser`.
- [ ] `npm run lint`.
- [ ] `npm run build`.
- [ ] `npm run test:app-smoke-browser`.
- [ ] `npm run test:mobile-usability-browser`.
- [ ] `npm run test:safe`.
- [ ] No real API calls in mock mode.
- [ ] No Supabase writes from public pages unless approved.
- [ ] No payment created without staff action.
- [ ] No notification sends in mock mode.
- [ ] Webhook tests later.
- [ ] Security tests later.
- [ ] Public/private page access tests later.
- [ ] Mobile/no-horizontal-overflow remains protected.

## 18. Approval Gates

Each future real integration requires separate explicit approval:

- Supabase production schema/RLS.
- Stripe test mode.
- Stripe live mode.
- Notifications.
- Flight API.
- Maps API.
- Live location.
- Calendar sync.
- Invoice/PDF.
- AI assistant.
- Auth.

Approval for one integration does not approve the others.

## 19. Recommended Next Implementation Sequence

a. Docs-only production environment checklist.
b. Docs-only Supabase schema/RLS review checklist.
c. Docs-only Stripe test-mode payment-link workflow.
d. Mock/local payment-link preview UI.
e. Real Stripe test-mode only after approval.
f. Notification mock/log-only plan.
g. Flight API plan.
h. Maps/geocoding plan.
i. Live location plan.
j. Invoice/PDF plan.
k. Calendar sync plan.
l. Auth/RBAC plan.
m. AI assistant plan.
