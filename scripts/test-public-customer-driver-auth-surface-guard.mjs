import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-public-customer-driver-auth-surface-guard.mjs";

const disabledAccessRoutePath = "app/api/admin-customer-driver-auth-access-disabled-setup/route.ts";
const previewReadinessRoutePath =
  "app/api/admin-customer-driver-auth-readiness-preview-setup/route.ts";
const readinessHelperPath = "lib/customer-driver-auth-readiness-setup-foundation.ts";
const auditPayloadHelperPath =
  "lib/customer-driver-auth-access-audit-payload-setup-foundation.ts";
const publicClientPaths = [
  "app/book/page.tsx",
  "app/my-bookings/page.tsx",
  "app/driver-job/[token]/page.tsx",
];

const contractChecks = [
  {
    label: "customer/driver auth foundation API contract",
    script: "scripts/test-customer-driver-auth-foundation-api-contract.mjs",
    requiredFragments: [
      "customerDriverAuthActivationBlockedResult",
      "Customer/driver auth activation is not enabled in this foundation stage.",
      "Customer/driver auth foundation API contract tests passed.",
    ],
  },
  {
    label: "customer/driver auth foundation schema contract",
    script: "scripts/test-customer-driver-auth-foundation-schema-contract.mjs",
    requiredFragments: [
      "no direct auth.users coupling before activation",
      "no broad RLS using true",
      "Customer/driver auth foundation schema contract tests passed.",
    ],
  },
  {
    label: "customer/driver auth readiness setup foundation contract",
    script: "scripts/test-customer-driver-auth-readiness-setup-foundation-contract.mjs",
    requiredFragments: [
      "customer_driver_auth_readiness_setup_only",
      "planned_only",
      "Customer/driver auth readiness setup foundation contract passed",
    ],
  },
  {
    label: "admin customer/driver auth readiness preview setup API contract",
    script: "scripts/test-admin-customer-driver-auth-readiness-preview-setup-api-contract.mjs",
    requiredFragments: [
      "admin-customer-driver-auth-readiness-preview-setup",
      "Auth readiness preview API must stay admin-gated.",
      "admin customer/driver auth readiness preview setup API contract passed",
    ],
  },
  {
    label: "admin customer/driver auth access disabled setup API contract",
    script: "scripts/test-admin-customer-driver-auth-access-disabled-setup-api-contract.mjs",
    requiredFragments: [
      "customer_driver_auth_access_disabled_setup_only",
      "Disabled auth access API must stay admin-gated.",
      "admin customer/driver auth access disabled setup API contract passed",
    ],
  },
  {
    label: "customer/driver auth access audit payload setup foundation contract",
    script: "scripts/test-customer-driver-auth-access-audit-payload-setup-foundation-contract.mjs",
    requiredFragments: [
      "customer_driver_auth_access_audit_payload_setup_only",
      "auditWriteEnabled: false",
      "customer/driver auth access audit payload setup foundation contract passed",
    ],
  },
  {
    label: "customer/driver auth no-live guard",
    script: "scripts/test-customer-driver-auth-no-live-guard.mjs",
    requiredFragments: [
      "Customer/driver auth must keep only setup GET routes.",
      "customer/driver auth no-live guard passed",
    ],
  },
];

const routeForbiddenRuntimeFragments = [
  "export async function POST",
  "export async function PUT",
  "export async function PATCH",
  "export async function DELETE",
  "fetch(",
  "XMLHttpRequest",
  "WebSocket",
  "sendBeacon",
  "createClient",
  "supabase",
  ".from(",
  "insert(",
  "upsert(",
  "update(",
  "delete(",
  "process.env",
  "cookies(",
  "headers(",
  "getServerSession",
  "signIn(",
  "signOut(",
  "NextAuth",
  "createSession",
  "issueToken",
  "createToken",
  "auth.users",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "FormData",
  "createObjectURL",
  "geolocation",
  "getCurrentPosition",
  "mediaDevices",
];

const providerPaymentOrAuthSdkPattern =
  /import\s+(?:[\s\S]*?\s+from\s+)?["'](?:@auth\/core|@supabase\/auth-js|@supabase\/ssr|@supabase\/supabase-js|auth0|firebase|jose|jsonwebtoken|lucia|next-auth|stripe|nodemailer|sendgrid|mailgun|postmark|resend|twilio|vonage|messagebird|whatsapp-cloud-api|telegram)["']|require\(\s*["'](?:@auth\/core|@supabase\/auth-js|@supabase\/ssr|@supabase\/supabase-js|auth0|firebase|jose|jsonwebtoken|lucia|next-auth|stripe|nodemailer|sendgrid|mailgun|postmark|resend|twilio|vonage|messagebird|whatsapp-cloud-api|telegram)["']\s*\)|\b(?:NextAuth|Auth0|Firebase|Stripe|TelegramBot|Twilio|Vonage|SendGrid|Mailgun|Postmark|Resend)\b|sendMail\s*\(|sendMessage\s*\(|send_message\s*\(|sendSms\s*\(|sendSMS\s*\(|messages\.create|paymentLink|checkoutSession|payNowUrl/i;
const liveAuthFlagPattern =
  /customerAuthEnabled\s*[:=]\s*true|driverAuthEnabled\s*[:=]\s*true|liveSessionEnabled\s*[:=]\s*true|authProviderConfigured\s*[:=]\s*true|accessPolicyEnabled\s*[:=]\s*true|tokenIssued\s*[:=]\s*true|liveAccessEnabled\s*[:=]\s*true|auditWriteEnabled\s*[:=]\s*true|external_send\s*[:=]\s*true/i;
const realTokenOrSessionPattern =
  /\b(?:issueToken|issue_token|createToken|create_token|generateToken|generate_token|signToken|sign_token|jwt\.sign|randomBytes|randomUUID|crypto\.randomUUID|crypto\.subtle|createHash|createSession|setSession|refreshSession|verifyOtp|magicLink|signInWith|exchangeCodeForSession)\b/i;
const unsafePublicOutputPattern =
  /customer[_ -]?price|quoted[_ -]?price|billing|invoice|paynow|pay\s+now|payment|driver[_ -]?payout|payout|payout comparison|finance|internal[_ -]?(?:admin|finance)|admin[_ -]?note|mock[_ -]?(?:qa|archive)|parser[_ -]?debug|raw_ai|raw_token|session_token|refresh_token|access_token|jwt|password|magic_link|otp|cookie|claim|token_hash|server_secret|service_role/i;

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, fragmentOrPattern, label) {
  const matches =
    fragmentOrPattern instanceof RegExp
      ? fragmentOrPattern.test(source)
      : source.toLowerCase().includes(String(fragmentOrPattern).toLowerCase());

  assert.equal(matches, false, `${label} must not include ${fragmentOrPattern}.`);
}

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n### ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

function exportedMethods(source) {
  return [...source.matchAll(/\bexport\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)]
    .map((match) => match[1])
    .sort();
}

function stripForbiddenReferenceDenylist(source) {
  return source.replace(/const forbiddenReferenceFragments = \[[\s\S]*?\];\n/, "");
}

function runContractCheck({ label, script, requiredFragments }) {
  const scriptSource = files[script];

  for (const fragment of requiredFragments) {
    assertIncludes(scriptSource, fragment, `${label} contract fragment`);
  }

  const result = spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "pipe",
  });

  assert.equal(
    result.status,
    0,
    [
      `${label} failed while running ${script}.`,
      result.stdout.trim(),
      result.stderr.trim(),
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

const allPaths = [
  ledgerPath,
  preactivationSuitePath,
  disabledAccessRoutePath,
  previewReadinessRoutePath,
  readinessHelperPath,
  auditPayloadHelperPath,
  ...publicClientPaths,
  ...contractChecks.map(({ script }) => script),
];
const fileEntries = await Promise.all(
  [...new Set(allPaths)].map(async (path) => [path, await readFile(path, "utf8")]),
);
const files = Object.fromEntries(fileEntries);

const ledger = files[ledgerPath];
const preactivationSuite = files[preactivationSuitePath];
const disabledAccessRoute = files[disabledAccessRoutePath];
const previewReadinessRoute = files[previewReadinessRoutePath];
const readinessHelper = files[readinessHelperPath];
const auditPayloadHelper = files[auditPayloadHelperPath];
const ledgerSection = sectionBetween(ledger, "### Public Customer/Driver Auth Surface Guard Lock");

for (const phrase of [
  "Public customer/driver auth setup surfaces are guarded across `/api/admin-customer-driver-auth-access-disabled-setup`, `/api/admin-customer-driver-auth-readiness-preview-setup`, `lib/customer-driver-auth-readiness-setup-foundation.ts`, `lib/customer-driver-auth-access-audit-payload-setup-foundation.ts`, and public client pages.",
  "This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, auth activation, live customer/driver auth, session creation, token issuance, or new shims.",
  "`/api/admin-customer-driver-auth-access-disabled-setup` must remain behind the internal admin/dispatcher boundary, GET-only, setup-only, disabled/no-op, token-free, live-access-free, live-session-free, provider-send-free, cookie-free, and limited to blocked auth access/readiness/preview payloads.",
  "`/api/admin-customer-driver-auth-readiness-preview-setup` must remain behind the internal admin/dispatcher boundary and return setup-only preview/readiness payloads with `accessPolicyEnabled`, `authProviderConfigured`, `customerAuthEnabled`, `driverAuthEnabled`, and `liveSessionEnabled` all false.",
  "The readiness and access audit helpers must stay server-only, setup-only, no-live, no-op, and must not issue tokens, generate secrets, read env, create Supabase clients, write audits, send providers, activate auth/session access, set cookies, or use location/photo/file APIs.",
  "Public client pages must not call the customer/driver auth disabled access or admin preview routes until separate customer/driver auth activation/UI approval exists.",
  "Customer/driver auth setup surfaces must exclude customer price, billing, invoice/payment/PDF, driver payout, PayNow payout details, internal finance/admin notes, parser/debug internals, tokens/secrets, provider/send payloads, live location/photo fields, and mock QA/dev archive fields.",
  "This guard coordinates the auth foundation API contract, auth foundation schema contract, readiness setup foundation contract, admin preview/readiness API contract, disabled access API contract, access audit payload setup contract, and customer/driver auth no-live guard in the preactivation suite.",
  "No Save Booking + CRM change.",
  "No `/api/admin-saved-bookings` change.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "No new shims are added.",
  "This lock adds `scripts/test-public-customer-driver-auth-surface-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `Public customer/driver auth ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation customer/driver auth guard registration");

for (const check of contractChecks) {
  runContractCheck(check);
}

assert.deepEqual(exportedMethods(disabledAccessRoute), ["GET"], "disabled auth access route exported methods");
assert.deepEqual(exportedMethods(previewReadinessRoute), ["GET"], "preview/readiness route exported methods");

for (const fragment of [
  "buildCustomerDriverAuthReadinessSetup",
  "resolveAdminDispatcherBoundary",
  "adminBookingPersistencePurpose",
  "requireAdminDispatcherBoundary(request)",
  "if (!boundary.ok)",
  "customer_driver_auth_access_disabled_setup_only",
  "preview_readiness_source: previewReadinessSetupApi",
  "customer_access",
  "driver_access",
  "access_policy",
  "auth_provider",
  "customerAuthEnabled: false",
  "driverAuthEnabled: false",
  "liveSessionEnabled: false",
  "authProviderConfigured: false",
  "accessPolicyEnabled: false",
  "tokenIssued: false",
  "liveAccessEnabled: false",
  "external_send: false",
  "no_op: true",
  "reason: \"setup_only_disabled\"",
  "result_label: \"blocked/no-op\"",
  "status: \"blocked\"",
]) {
  assertIncludes(disabledAccessRoute, fragment, `disabled auth access route ${fragment}`);
}

for (const fragment of [
  "buildCustomerDriverAuthReadinessSetup",
  "resolveAdminDispatcherBoundary",
  "adminBookingPersistencePurpose",
  "requireAdminDispatcherBoundary(request)",
  "if (!boundary.ok)",
  "customer_saved_booking_session_planned",
  "driver_only_job_visibility_beyond_token_flow_planned",
  "customerAuthEnabled: false",
  "driverAuthEnabled: false",
  "liveSessionEnabled: false",
  "authProviderConfigured: false",
  "accessPolicyEnabled: false",
]) {
  assertIncludes(previewReadinessRoute, fragment, `preview/readiness route ${fragment}`);
}

for (const fragment of [
  "import \"server-only\"",
  "customerAuthEnabled: false",
  "driverAuthEnabled: false",
  "liveSessionEnabled: false",
  "authProviderConfigured: false",
  "accessPolicyEnabled: false",
  "policy_surface: \"customer_driver_auth_readiness_setup_only\"",
  "customer_auth_activation: \"planned_only\"",
  "customer_saved_booking_session: \"planned_only\"",
  "driver_auth_activation: \"planned_only\"",
  "driver_only_job_visibility_beyond_token_flow: \"planned_only\"",
  "session_creation: \"blocked\"",
]) {
  assertIncludes(readinessHelper, fragment, `readiness helper ${fragment}`);
}

for (const fragment of [
  "import \"server-only\"",
  "delivery_surface: \"customer_driver_auth_access_audit_payload_setup_only\"",
  "auditWriteEnabled: false",
  "audit_write_enabled: false",
  "external_send: false",
  "liveAccessEnabled: false",
  "liveSessionEnabled: false",
  "tokenIssued: false",
  "blocked_no_op_result",
  "disabled_auth_access_source: disabledAuthAccessSource",
  "preview_readiness_source: previewReadinessSource",
]) {
  assertIncludes(auditPayloadHelper, fragment, `access audit helper ${fragment}`);
}

for (const fragment of routeForbiddenRuntimeFragments) {
  assertExcludes(disabledAccessRoute, fragment, "disabled auth access route forbidden runtime fragment");
  assertExcludes(previewReadinessRoute, fragment, "preview/readiness route forbidden runtime fragment");
}

for (const [path, source] of [
  [disabledAccessRoutePath, disabledAccessRoute],
  [previewReadinessRoutePath, previewReadinessRoute],
  [readinessHelperPath, readinessHelper],
  [auditPayloadHelperPath, auditPayloadHelper],
]) {
  const unsafeOutputSource =
    path === readinessHelperPath ? stripForbiddenReferenceDenylist(source) : source;

  assertExcludes(source, providerPaymentOrAuthSdkPattern, `${path} provider/payment/auth SDK fragment`);
  assertExcludes(source, liveAuthFlagPattern, `${path} live auth flag`);
  assertExcludes(source, realTokenOrSessionPattern, `${path} real token/session generation`);
  assertExcludes(unsafeOutputSource, unsafePublicOutputPattern, `${path} unsafe public output`);
}

for (const path of publicClientPaths) {
  const source = files[path];

  for (const fragment of [
    "/api/admin-customer-driver-auth-access-disabled-setup",
    "/api/admin-customer-driver-auth-readiness-preview-setup",
    "admin-customer-driver-auth-access-disabled-setup",
    "admin-customer-driver-auth-readiness-preview-setup",
    "customerAuthEnabled",
    "driverAuthEnabled",
    "liveSessionEnabled",
    "authProviderConfigured",
    "accessPolicyEnabled",
    "tokenIssued",
    "x-prestige-admin-purpose",
    "x-prestige-admin-session-token",
    "Authorization",
    "document.cookie",
    "localStorage",
    "sessionStorage",
    "navigator.credentials",
    "service_role",
    "SUPABASE_SERVICE",
  ]) {
    assertExcludes(source, fragment, `${path} customer/driver auth caller fragment`);
  }
}

console.log("Public customer/driver auth surface guard passed");
