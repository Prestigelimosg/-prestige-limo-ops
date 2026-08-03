import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/customer-booking-phone-otp.ts";
const clientAdapterPath = "lib/customer-booking-phone-otp-adapter.ts";
const phoneRoutePath =
  "app/api/customer-booking-phone-verification/route.ts";
const bookingRoutePath = "app/api/customer-booking-requests/route.ts";
const bookingAdapterPath = "lib/customer-booking-request-adapter.ts";
const bookingPagePath = "app/book/page.tsx";
const migrationPath =
  "supabase/migrations/20260725053824_customer_booking_phone_otp_challenges.sql";
const ledgerPath = "docs/current-implementation-ledger.md";
const suitePath = "scripts/test-preactivation-verification-suite.mjs";

const [
  helperSource,
  clientAdapterSource,
  phoneRouteSource,
  bookingRouteSource,
  bookingAdapterSource,
  bookingPageSource,
  migrationSource,
  ledgerSource,
  suiteSource,
] = await Promise.all(
  [
    helperPath,
    clientAdapterPath,
    phoneRoutePath,
    bookingRoutePath,
    bookingAdapterPath,
    bookingPagePath,
    migrationPath,
    ledgerPath,
    suitePath,
  ].map((relativePath) =>
    readFile(path.join(process.cwd(), relativePath), "utf8"),
  ),
);

assert.equal(
  helperSource.includes('import "server-only"') &&
    helperSource.includes("PRESTIGE_TWILIO_VERIFY_SERVICE_SID") &&
    helperSource.includes("PRESTIGE_TWILIO_VERIFY_API_KEY_SID") &&
    helperSource.includes("PRESTIGE_TWILIO_VERIFY_API_KEY_SECRET") &&
    helperSource.includes("PRESTIGE_CUSTOMER_BOOKING_PHONE_OTP_SECRET") &&
    helperSource.includes("https://verify.twilio.com/v2/Services/") &&
    helperSource.includes("/Verifications") &&
    helperSource.includes("/VerificationCheck"),
  true,
  "The OTP provider and credentials must remain in one server-only Twilio Verify helper.",
);

assert.equal(
  phoneRouteSource.includes('"customer-booking-phone-verification"') &&
    phoneRouteSource.includes('body.action === "start"') &&
    phoneRouteSource.includes("checkCustomerBookingPhoneOtp") &&
    phoneRouteSource.includes("startCustomerBookingPhoneOtp") &&
    phoneRouteSource.includes('"Cache-Control": "no-store"'),
  true,
  "The OTP route must enforce the existing /book request boundary and no-store responses.",
);

assert.equal(
  bookingRouteSource.includes("verifyCustomerBookingPhoneOtpProof") &&
    bookingRouteSource.includes(
      '"x-prestige-customer-booking-phone-proof"',
    ) &&
    bookingRouteSource.includes("phone_verification_required") &&
    bookingRouteSource.includes("phone_verification_invalid") &&
    bookingRouteSource.includes("phone_verification_used") &&
    bookingRouteSource.indexOf("if (invitationToken)") <
      bookingRouteSource.indexOf(
        "const phoneVerification = verifyCustomerBookingPhoneOtpProof(",
      ),
  true,
  "The booking route must preserve invitation priority and use OTP only for public no-invite requests.",
);

assert.equal(
  bookingAdapterSource.includes("phoneVerificationProof?: string") &&
    bookingAdapterSource.includes(
      '"x-prestige-customer-booking-phone-proof"',
    ) &&
    !bookingAdapterSource.includes(
      "phoneVerificationProof: input.phoneVerificationProof",
    ),
  true,
  "The proof must remain a request header and never enter booking persistence.",
);

for (const fragment of [
  'data-customer-booking-phone-verification="true"',
  'data-customer-booking-phone-otp-send="true"',
  'data-customer-booking-phone-otp-check="true"',
  'data-customer-booking-private-invitation-no-otp="true"',
  "Prestige Limo customers using a private invitation or Customer Portal do not need this step.",
  "Private booking invitation detected. We will check it when you submit; no SMS code is required here.",
  "resetCustomerBookingPhoneOtpState",
  "if (!hasBookingInvitation && !hasPortalBookingAccess)",
]) {
  assert.equal(
    bookingPageSource.includes(fragment),
    true,
    `/book must retain the narrow OTP UI evidence: ${fragment}`,
  );
}

assert.equal(
  bookingPageSource.match(/resetCustomerBookingPhoneOtpState\(\)/g)?.length >=
    4,
  true,
  "The one-use public proof must clear on phone changes, used-proof rejection, and successful submission.",
);

assert.equal(
  migrationSource.includes(
    "create table if not exists public.customer_booking_phone_otp_challenges",
  ) &&
    migrationSource.includes("enable row level security") &&
    migrationSource.includes("from public, anon, authenticated") &&
    migrationSource.includes("to service_role") &&
    migrationSource.includes("reserve_customer_booking_phone_otp_send") &&
    migrationSource.includes("reserve_customer_booking_phone_otp_check") &&
    migrationSource.includes("interval '60 seconds'") &&
    migrationSource.includes("v_phone_ten_minute_count >= 3") &&
    migrationSource.includes("v_ip_thirty_minute_count >= 5") &&
    migrationSource.includes("v_ip_day_count >= 10") &&
    migrationSource.includes("v_ip_day_distinct_phones >= 5") &&
    !/security\s+definer/i.test(migrationSource),
  true,
  "The existing OTP table must remain RLS-protected, least-privilege, and atomically rate-limited.",
);

assert.equal(
  /raw_phone|phone_number|raw_ip|ip_address|otp_code|verification_code|auth_token|api_key_secret/i.test(
    migrationSource,
  ),
  false,
  "The anti-abuse table must not store raw phones, IPs, OTPs, or provider credentials.",
);

assert.equal(
  ledgerSource.includes(
    "Paid Twilio Public First-Booking Phone Verification Activation",
  ) &&
    ledgerSource.includes("private invitation remains no-OTP") &&
    ledgerSource.includes("Customer Portal remains no-OTP"),
  true,
  "The ledger must record the exact OTP boundary and preserved bypasses.",
);

assert.equal(
  suiteSource.includes("test-customer-booking-phone-otp-guard.mjs"),
  true,
  "The OTP regression guard must be registered in the pre-activation suite.",
);

function transpileTypescript(source, filename) {
  return ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
}

const tempDir = await mkdtemp(
  path.join(os.tmpdir(), "prestige-customer-booking-phone-otp-"),
);
const helperOutputPath = path.join(
  tempDir,
  helperPath.replace(/\.ts$/, ".js"),
);
const adapterOutputPath = path.join(
  tempDir,
  clientAdapterPath.replace(/\.ts$/, ".js"),
);
const serverOnlyStubPath = path.join(
  tempDir,
  "node_modules/server-only/index.js",
);
const supabaseStubPath = path.join(
  tempDir,
  "node_modules/@supabase/supabase-js/index.js",
);
const environmentNames = [
  "PRESTIGE_CUSTOMER_BOOKING_PHONE_OTP_ALLOWED_COUNTRY_CODES",
  "PRESTIGE_CUSTOMER_BOOKING_PHONE_OTP_ENABLED",
  "PRESTIGE_CUSTOMER_BOOKING_PHONE_OTP_SECRET",
  "PRESTIGE_TWILIO_VERIFY_API_KEY_SECRET",
  "PRESTIGE_TWILIO_VERIFY_API_KEY_SID",
  "PRESTIGE_TWILIO_VERIFY_SERVICE_SID",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_URL",
];
const originalEnvironment = new Map(
  environmentNames.map((name) => [name, process.env[name]]),
);

try {
  await mkdir(path.dirname(helperOutputPath), { recursive: true });
  await mkdir(path.dirname(adapterOutputPath), { recursive: true });
  await mkdir(path.dirname(serverOnlyStubPath), { recursive: true });
  await mkdir(path.dirname(supabaseStubPath), { recursive: true });
  await writeFile(serverOnlyStubPath, "module.exports = {};\n");
  await writeFile(
    supabaseStubPath,
    "module.exports = { createClient() { return globalThis.__prestigePhoneOtpMock.client; } };\n",
  );
  await writeFile(
    helperOutputPath,
    transpileTypescript(helperSource, helperPath),
  );
  await writeFile(
    adapterOutputPath,
    transpileTypescript(clientAdapterSource, clientAdapterPath),
  );

  process.env.PRESTIGE_CUSTOMER_BOOKING_PHONE_OTP_ALLOWED_COUNTRY_CODES =
    "+65";
  process.env.PRESTIGE_CUSTOMER_BOOKING_PHONE_OTP_ENABLED = "true";
  process.env.PRESTIGE_CUSTOMER_BOOKING_PHONE_OTP_SECRET =
    "focused-customer-booking-phone-otp-proof-secret-value";
  process.env.PRESTIGE_TWILIO_VERIFY_API_KEY_SECRET =
    "focused-test-api-key-secret-value";
  process.env.PRESTIGE_TWILIO_VERIFY_API_KEY_SID =
    "SK" + "0123456789abcdef0123456789abcdef";
  process.env.PRESTIGE_TWILIO_VERIFY_SERVICE_SID =
    "VA" + "0123456789abcdef0123456789abcdef";
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    "focused-test-supabase-service-role-credential-value";
  process.env.SUPABASE_URL = "https://focused-test.supabase.co";

  const state = {
    fetchCalls: [],
    rpcCalls: [],
    rpcResponses: {
      reserve_customer_booking_phone_otp_check: {
        data: [
          {
            allowed: true,
            reason: "reserved",
            retry_after_seconds: 1,
            verification_attempts: 1,
          },
        ],
        error: null,
      },
      reserve_customer_booking_phone_otp_send: {
        data: [
          {
            allowed: true,
            reason: "reserved",
            retry_after_seconds: 60,
          },
        ],
        error: null,
      },
    },
    updates: [],
  };
  state.client = {
    from(table) {
      return {
        update(values) {
          const filters = [];
          const result = { error: null };
          const chain = {
            eq(field, value) {
              filters.push({ field, value });
              return chain;
            },
            then(resolve, reject) {
              state.updates.push({ filters, table, values });
              return Promise.resolve(result).then(resolve, reject);
            },
          };

          return chain;
        },
      };
    },
    async rpc(name, args) {
      state.rpcCalls.push({ args, name });
      return state.rpcResponses[name];
    },
  };
  globalThis.__prestigePhoneOtpMock = state;

  const helper = createRequire(import.meta.url)(helperOutputPath);
  const providerFetch = async (url, init) => {
    state.fetchCalls.push({
      body: String(init.body),
      hasAuthorization: Boolean(init.headers.Authorization),
      url,
    });
    const providerStatus = String(url).endsWith("/VerificationCheck")
      ? "approved"
      : "pending";

    return new Response(JSON.stringify({ status: providerStatus }), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  };

  assert.equal(
    helper.normalizeCustomerBookingPhoneOtpNumber("9000 1111"),
    "+6590001111",
  );
  assert.equal(
    helper.normalizeCustomerBookingPhoneOtpNumber("+65 9000-1111"),
    "+6590001111",
  );
  assert.equal(
    helper.normalizeCustomerBookingPhoneOtpNumber("+1 202 555 0100"),
    null,
  );
  assert.equal(
    helper.normalizeCustomerBookingPhoneOtpNumber("6123 4567"),
    null,
  );

  const started = await helper.startCustomerBookingPhoneOtp({
    fetcher: providerFetch,
    phone: "+65 9000 1111",
    requestIp: "203.0.113.9",
  });
  assert.equal(started.ok, true);
  assert.match(started.challengeId, /^[a-f0-9]{32}$/);
  assert.equal(state.fetchCalls.length, 1);
  assert.match(state.fetchCalls[0].url, /\/Verifications$/);
  assert.match(state.fetchCalls[0].body, /Channel=sms/);
  assert.match(state.fetchCalls[0].body, /To=%2B6590001111/);
  assert.equal(state.fetchCalls[0].hasAuthorization, true);
  assert.match(state.rpcCalls[0].args.p_phone_hash, /^[a-f0-9]{64}$/);
  assert.match(state.rpcCalls[0].args.p_ip_hash, /^[a-f0-9]{64}$/);
  assert.equal(
    JSON.stringify(state.rpcCalls[0]).includes("+6590001111"),
    false,
  );
  assert.equal(
    JSON.stringify(state.rpcCalls[0]).includes("203.0.113.9"),
    false,
  );

  const checked = await helper.checkCustomerBookingPhoneOtp({
    challengeId: started.challengeId,
    code: "123456",
    fetcher: providerFetch,
    phone: "+65 9000 1111",
  });
  assert.equal(checked.ok, true);
  assert.match(
    checked.proof,
    /^customer_booking_phone_otp_proof_v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
  );
  assert.equal(state.fetchCalls.length, 2);
  assert.match(state.fetchCalls[1].url, /\/VerificationCheck$/);
  assert.equal(state.updates.at(-1).values.status, "verified");

  const verifiedProof = helper.verifyCustomerBookingPhoneOtpProof(
    checked.proof,
    "9000 1111",
  );
  assert.equal(verifiedProof.ok, true);
  assert.match(
    verifiedProof.data.booking_reference,
    /^CBOTP-[A-F0-9]{24}$/,
  );
  assert.equal(
    helper.verifyCustomerBookingPhoneOtpProof(
      checked.proof,
      "+65 9888 7777",
    ).ok,
    false,
    "A verified proof must remain bound to the exact normalized contact phone.",
  );

  state.rpcResponses.reserve_customer_booking_phone_otp_send = {
    data: [
      {
        allowed: false,
        reason: "cooldown",
        retry_after_seconds: 42,
      },
    ],
    error: null,
  };
  const fetchCountBeforeRateLimit = state.fetchCalls.length;
  const rateLimited = await helper.startCustomerBookingPhoneOtp({
    fetcher: providerFetch,
    phone: "+65 9000 1111",
    requestIp: "203.0.113.9",
  });
  assert.deepEqual(rateLimited, {
    error: "rate_limited",
    ok: false,
    retryAfterSeconds: 42,
    status: 429,
  });
  assert.equal(
    state.fetchCalls.length,
    fetchCountBeforeRateLimit,
    "An app rate limit must reject before Twilio can send another SMS.",
  );

  const adapter = createRequire(import.meta.url)(adapterOutputPath);
  const adapterCalls = [];
  const adapterStart =
    await adapter.startCustomerBookingPhoneOtpVerification(
      "+65 9000 1111",
      {
        fetcher: async (url, init) => {
          adapterCalls.push({
            body: JSON.parse(init.body),
            headers: init.headers,
            url,
          });
          return new Response(
            JSON.stringify({
              challenge_id: "0123456789abcdef0123456789abcdef",
              expires_in_seconds: 600,
              ok: true,
              retry_after_seconds: 60,
            }),
            {
              headers: { "content-type": "application/json" },
              status: 200,
            },
          );
        },
      },
    );
  assert.equal(adapterStart.ok, true);
  assert.deepEqual(adapterCalls[0].body, {
    action: "start",
    phone: "+65 9000 1111",
  });
  assert.equal(
    adapterCalls[0].headers["x-prestige-customer-purpose"],
    "customer-booking-phone-verification",
  );
} finally {
  delete globalThis.__prestigePhoneOtpMock;

  for (const [name, value] of originalEnvironment) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }

  await rm(tempDir, { force: true, recursive: true });
}

console.log("Customer booking phone OTP guard passed.");
