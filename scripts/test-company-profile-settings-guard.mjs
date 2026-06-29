import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(source, needle, message) {
  assert(source.includes(needle), message);
}

function assertNotIncludes(source, needle, message) {
  assert(!source.includes(needle), message);
}

const shared = read("lib/company-profile-shared.ts");
const persistence = read("lib/company-profile-persistence.ts");
const publicRoute = read("app/api/company-profile/route.ts");
const adminRoute = read("app/api/admin-company-profile/route.ts");
const adminPage = read("app/page.tsx");
const bookPage = read("app/book/page.tsx");
const ledger = read("docs/current-implementation-ledger.md");
const portalPage = read("app/my-bookings/page.tsx");
const migration = read("supabase/migrations/202606290001_company_profile_settings_foundation.sql");

for (const field of [
  "company_name",
  "email",
  "logo_image_url",
  "whatsapp_phone",
  "bank_payment_instructions",
  "stripe_card_payment_enabled",
  "stripe_card_fee_required",
  "stripe_card_fee_percent",
  "invoice_footer_terms",
]) {
  assertIncludes(shared, field, `Shared company profile is missing ${field}.`);
  assertIncludes(adminPage, field, `Admin Company settings UI is missing ${field}.`);
  assertIncludes(migration, field, `Company profile migration is missing ${field}.`);
}

assertIncludes(
  shared,
  'email: "acc@prestigelimo.sg"',
  "Default company profile email must use the official accounting email.",
);

for (const forbidden of [
  "driver[_\\s-]*payout",
  "paynow[_\\s-]*payout",
  "internal[_\\s-]*admin",
  "internal[_\\s-]*finance",
  "admin[_\\s-]*finance",
  "parser",
  "debug",
  "customer[_\\s-]*price",
  "mock[_\\s-]*qa",
  "dev[_\\s-]*archive",
  "payout[_\\s-]*comparison",
]) {
  assertIncludes(shared, forbidden, `Public profile sanitizer does not block ${forbidden}.`);
}

assertIncludes(publicRoute, "loadPublicCompanyProfile", "Public company profile route must read the public projection.");
assertIncludes(publicRoute, "export async function GET", "Public company profile route must expose GET.");
assertNotIncludes(publicRoute, "export async function POST", "Public company profile route must not expose POST.");
assertNotIncludes(publicRoute, "resolveAdminDispatcherBoundary", "Public company profile route must not use admin write boundary.");

assertIncludes(adminRoute, "resolveAdminDispatcherBoundary", "Admin company profile route must use the admin boundary.");
assertIncludes(
  adminRoute,
  'allowServerSessionRoleMethodsWithoutRequestToken: ["POST"]',
  "Admin company profile POST must use explicit same-origin dashboard allowlist.",
);
assertIncludes(
  adminRoute,
  "adminDispatcherBoundaryToPersistenceAdapterActor",
  "Admin company profile route must convert boundary context into persistence actor.",
);

assertIncludes(
  persistence,
  "checkAdminBookingPersistenceStagingConfigReadiness",
  "Company profile save must require admin persistence readiness.",
);
assertIncludes(
  persistence,
  "checkCustomerBookingRequestPersistenceConfigReadiness",
  "Public company profile read must use the customer-safe DB readiness path.",
);
assertIncludes(
  persistence,
  "sanitizePublicCompanyProfile",
  "Company profile persistence must sanitize public fields.",
);
assertNotIncludes(
  persistence,
  "SUPABASE_ANON_KEY",
  "Company profile persistence must not rely on public Supabase anon credentials.",
);

assertIncludes(adminPage, '"company"', "Admin app tab type must include Company.");
assertIncludes(adminPage, 'data-company-profile-settings="true"', "Admin Company settings panel is missing.");
assertIncludes(adminPage, 'data-company-profile-save="true"', "Admin Company settings save button is missing.");
assertIncludes(adminPage, 'data-company-profile-preview="true"', "Admin Company settings preview is missing.");

assertIncludes(
  ledger,
  "The default public company profile email is `acc@prestigelimo.sg`, used as the official accounting contact fallback on customer-facing pages and invoice PDFs.",
  "Ledger must record the official accounting email fallback.",
);

for (const customerPage of [
  ["app/book/page.tsx", bookPage],
  ["app/my-bookings/page.tsx", portalPage],
]) {
  assertIncludes(
    customerPage[1],
    'fetch("/api/company-profile"',
    `${customerPage[0]} must load public company profile settings.`,
  );
  assertIncludes(
    customerPage[1],
    'data-customer-company-profile-brand="true"',
    `${customerPage[0]} must render the public company brand.`,
  );
  assertNotIncludes(
    customerPage[1],
    "driver_payout",
    `${customerPage[0]} must not expose driver payout internals.`,
  );
}

assertIncludes(migration, "enable row level security", "Company profile table must enable RLS.");
assertIncludes(migration, "revoke all on public.company_profile_settings from anon", "Company profile table must revoke anon access.");
assertIncludes(
  migration,
  "revoke all on public.company_profile_settings from authenticated",
  "Company profile table must revoke authenticated access.",
);
assertIncludes(
  migration,
  "grant select, insert, update, delete on public.company_profile_settings to service_role",
  "Company profile table must grant service role only.",
);

console.log("company profile settings guard passed");
