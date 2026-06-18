import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-public-customer-driver-details-link-surface-guard.mjs";

const disabledAccessRoutePath = "app/api/customer-driver-details-link-access-disabled-setup/route.ts";
const previewReadinessRoutePath =
  "app/api/admin-customer-driver-details-link-preview-readiness-setup/route.ts";
const setupHelperPath = "lib/customer-driver-details-link-setup-foundation.ts";
const auditPayloadHelperPath =
  "lib/customer-driver-details-link-access-audit-payload-setup-foundation.ts";
const publicClientPaths = [
  "app/book/page.tsx",
  "app/my-bookings/page.tsx",
  "app/driver-job/[token]/page.tsx",
];

const contractChecks = [
  {
    label: "customer driver-details link setup foundation contract",
    script: "scripts/test-customer-driver-details-link-setup-foundation-contract.mjs",
    requiredFragments: [
      "customer_driver_details_secure_link",
      "customer_driver_details_link_setup_only",
      "Customer driver-details link setup foundation contract tests passed.",
    ],
  },
  {
    label: "admin customer driver-details link preview readiness API contract",
    script: "scripts/test-admin-customer-driver-details-link-preview-readiness-setup-api-contract.mjs",
    requiredFragments: [
      "admin-customer-driver-details-link-preview-readiness-setup",
      "linkEnabled: false",
      "admin customer driver details link preview readiness setup API contract passed",
    ],
  },
  {
    label: "customer driver-details link access disabled setup API contract",
    script: "scripts/test-customer-driver-details-link-access-disabled-setup-api-contract.mjs",
    requiredFragments: [
      "customer_driver_details_link_access_disabled_setup_only",
      "setup_only_disabled",
      "customer driver details link access disabled setup API contract passed",
    ],
  },
  {
    label: "customer driver-details link access audit payload setup contract",
    script: "scripts/test-customer-driver-details-link-access-audit-payload-setup-foundation-contract.mjs",
    requiredFragments: [
      "customer_driver_details_link_access_audit_payload_setup_only",
      "auditWriteEnabled: false",
      "customer driver details link access audit payload setup foundation contract passed",
    ],
  },
  {
    label: "customer driver-details link no-live guard",
    script: "scripts/test-customer-driver-details-link-no-live-guard.mjs",
    requiredFragments: [
      "Secure customer driver-details link chain must not add extra live/link routes.",
      "Customer driver-details link no-live guard passed",
    ],
  },
];

const disabledAccessForbiddenFragments = [
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
  "sendMessage",
  "send_message",
  "messages.create",
  "sendSms",
  "sendSMS",
  "FormData",
  "createObjectURL",
  "geolocation",
  "getCurrentPosition",
];

const providerOrPaymentPattern =
  /import\s+(?:[^\n]*?\s+from\s+)?["'](?:nodemailer|sendgrid|mailgun|postmark|resend|twilio|vonage|messagebird|whatsapp-cloud-api|telegram|stripe)["']|require\(\s*["'](?:nodemailer|sendgrid|mailgun|postmark|resend|twilio|vonage|messagebird|whatsapp-cloud-api|telegram|stripe)["']\s*\)|\b(?:Mailgun|Postmark|Resend|SendGrid|Stripe|TelegramBot|Twilio|Vonage)\b|sendMail\s*\(|sendMessage\s*\(|send_message\s*\(|sendSms\s*\(|sendSMS\s*\(|messages\.create|paymentLink|checkoutSession|payNowUrl/;
const liveAccessFlagPattern =
  /linkEnabled\s*[:=]\s*true|tokenIssued\s*[:=]\s*true|liveAccessEnabled\s*[:=]\s*true|external_send\s*[:=]\s*true|auditWriteEnabled\s*[:=]\s*true/i;
const realTokenPattern =
  /\b(?:issueToken|issue_token|createToken|create_token|generateToken|generate_token|signToken|sign_token|jwt\.sign|randomBytes|randomUUID|crypto\.randomUUID|crypto\.subtle|createHash)\b/i;

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
  setupHelperPath,
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
const setupHelper = files[setupHelperPath];
const auditPayloadHelper = files[auditPayloadHelperPath];
const ledgerSection = sectionBetween(
  ledger,
  "### Public Customer Driver-Details Link Surface Guard Lock",
);

for (const phrase of [
  "Public customer driver-details link surfaces are guarded across `/api/customer-driver-details-link-access-disabled-setup`, `/api/admin-customer-driver-details-link-preview-readiness-setup`, `lib/customer-driver-details-link-setup-foundation.ts`, `lib/customer-driver-details-link-access-audit-payload-setup-foundation.ts`, and public client pages.",
  "This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, auth activation, live link access, token issuance, or new shims.",
  "`/api/customer-driver-details-link-access-disabled-setup` must remain GET-only, setup-only, disabled/no-op, token-free, live-access-free, provider-send-free, cookie-free, and limited to blocked access/readiness/preview payloads.",
  "`/api/admin-customer-driver-details-link-preview-readiness-setup` must remain behind the internal admin/dispatcher boundary and return setup-only preview/readiness payloads with `external_send`, `linkEnabled`, `liveAccessEnabled`, `providerConfigured`, and `tokenIssued` all false.",
  "The setup and access audit helpers must stay server-only, setup-only, no-live, no-op, and must not issue tokens, generate secrets, read env, create Supabase clients, write audits, send providers, activate auth/session access, or use location/photo/file APIs.",
  "Public client pages must not call the customer driver-details link access or admin preview routes until separate secure-link activation/UI approval exists.",
  "Customer driver-details link surfaces must exclude customer price, billing, invoice/payment/PDF, driver payout, PayNow payout details, internal finance/admin notes, parser/debug internals, tokens/secrets, provider/send payloads, live location/photo fields, and mock QA/dev archive fields.",
  "This guard coordinates the setup foundation contract, admin preview/readiness API contract, disabled access API contract, access audit payload setup contract, and customer driver-details link no-live guard in the preactivation suite.",
  "No Save Booking + CRM change.",
  "No `/api/admin-saved-bookings` change.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "No new shims are added.",
  "This lock adds `scripts/test-public-customer-driver-details-link-surface-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `Public customer driver-details link ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation customer driver-details link guard registration");

for (const check of contractChecks) {
  runContractCheck(check);
}

assert.deepEqual(exportedMethods(disabledAccessRoute), ["GET"], "disabled access route exported methods");
assert.deepEqual(exportedMethods(previewReadinessRoute), ["GET"], "preview/readiness route exported methods");

for (const fragment of [
  "buildCustomerDriverDetailsLinkSetup",
  "customer_driver_details_link_access_disabled_setup_only",
  "booking_reference: null",
  "customer_details: null",
  "driver_details: null",
  "external_send: false",
  "linkEnabled: false",
  "liveAccessEnabled: false",
  "no_op: true",
  "tokenIssued: false",
  "reason: \"setup_only_disabled\"",
  "result_label: \"blocked/no-op\"",
]) {
  assertIncludes(disabledAccessRoute, fragment, `disabled access route ${fragment}`);
}

for (const fragment of [
  "resolveAdminDispatcherBoundary",
  "requireAdminDispatcherBoundary(request)",
  "if (!boundary.ok)",
  "buildCustomerDriverDetailsLinkSetup({",
  "external_send: false",
  "linkEnabled: false",
  "liveAccessEnabled: false",
  "providerConfigured: false",
  "tokenIssued: false",
]) {
  assertIncludes(previewReadinessRoute, fragment, `preview/readiness route ${fragment}`);
}

for (const fragment of [
  "import \"server-only\"",
  "authActivationEnabled: false",
  "dbWriteEnabled: false",
  "delivery_surface: \"customer_driver_details_link_setup_only\"",
  "external_send: false",
  "linkEnabled: false",
  "liveAccessEnabled: false",
  "tokenIssued: false",
  "providerConfigured: false",
]) {
  assertIncludes(setupHelper, fragment, `setup helper ${fragment}`);
}

for (const fragment of [
  "import \"server-only\"",
  "delivery_surface: \"customer_driver_details_link_access_audit_payload_setup_only\"",
  "auditWriteEnabled: false",
  "audit_write_enabled: false",
  "external_send: false",
  "linkEnabled: false",
  "liveAccessEnabled: false",
  "tokenIssued: false",
  "blocked_no_op_result",
]) {
  assertIncludes(auditPayloadHelper, fragment, `access audit helper ${fragment}`);
}

for (const fragment of disabledAccessForbiddenFragments) {
  assertExcludes(disabledAccessRoute, fragment, "disabled access route forbidden runtime fragment");
}

for (const [path, source] of [
  [disabledAccessRoutePath, disabledAccessRoute],
  [previewReadinessRoutePath, previewReadinessRoute],
  [setupHelperPath, setupHelper],
  [auditPayloadHelperPath, auditPayloadHelper],
]) {
  assertExcludes(source, providerOrPaymentPattern, `${path} provider/payment fragment`);
  assertExcludes(source, liveAccessFlagPattern, `${path} live access flag`);
  assertExcludes(source, realTokenPattern, `${path} real token generation`);
}

for (const path of publicClientPaths) {
  const source = files[path];

  for (const fragment of [
    "/api/customer-driver-details-link-access-disabled-setup",
    "/api/admin-customer-driver-details-link-preview-readiness-setup",
    "customer-driver-details-link-access-disabled-setup",
    "admin-customer-driver-details-link-preview-readiness-setup",
    "customer_safe_token_placeholder",
    "tokenIssued",
    "liveAccessEnabled",
  ]) {
    assertExcludes(source, fragment, `${path} customer driver-details link caller fragment`);
  }
}

console.log("Public customer driver-details link surface guard passed");
