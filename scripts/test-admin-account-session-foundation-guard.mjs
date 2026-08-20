import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { NextRequest } from "next/server.js";
import ts from "typescript";

const files = {
  account: "lib/admin-account-auth.ts",
  adapter: "lib/admin-booking-supabase-adapter.ts",
  boundary: "lib/admin-dispatcher-auth-boundary.ts",
  calendarSync: "lib/admin-booking-google-calendar-sync.ts",
  bookingReferenceRoute: "app/api/admin-customer-booking-reference-settings/route.ts",
  closeoutRoute: "app/api/admin-completed-booking-closeouts/route.ts",
  customerAccountsRoute: "app/api/admin-customer-accounts/route.ts",
  customerInvoiceBoundary: "lib/admin-customer-invoice-boundary.ts",
  customerSavedBookingsRoute: "app/api/admin-customer-saved-bookings/route.ts",
  emailActivationRoute: "app/api/admin-email-activation-preflight-setup/route.ts",
  invoicePrefixRoute: "app/api/admin-customer-invoice-prefix-settings/route.ts",
  ledger: "docs/current-implementation-ledger.md",
  loginClient: "app/admin-sign-in/admin-sign-in-form.tsx",
  loginPage: "app/admin-sign-in/page.tsx",
  mapLocationSearch: "lib/admin-map-location-search.ts",
  mapRouteEstimates: "lib/admin-map-route-estimates.ts",
  migration: "supabase/migrations/20260819133237_admin_account_session_foundation.sql",
  serviceRoleMigration:
    "supabase/migrations/20260820075732_admin_access_accounts_service_role_least_privilege.sql",
  preactivation: "scripts/test-preactivation-verification-suite.mjs",
  proxy: "proxy.ts",
  route: "app/api/admin-auth/session/route.ts",
  savedBookingRead: "lib/admin-saved-booking-read.ts",
  session: "lib/admin-account-session.ts",
};

const entries = await Promise.all(
  Object.entries(files).map(async ([name, file]) => [name, await readFile(file, "utf8")]),
);
const source = Object.fromEntries(entries);

const sessionImplementation = `${source.boundary}\n${source.session}`;

for (const phrase of [
  "create table if not exists public.admin_access_accounts",
  "auth_user_id uuid not null",
  "auth_email text not null",
  "account_role text not null",
  "account_status text not null",
  "admin_access_accounts_auth_user_id_key",
  "admin_access_accounts_auth_email_key",
  "account_role in ('admin', 'dispatcher')",
  "account_status in ('active', 'suspended', 'revoked')",
  "enable row level security",
  "revoke all on table public.admin_access_accounts from anon, authenticated",
  "grant select on table public.admin_access_accounts to service_role",
]) {
  assert.ok(source.migration.includes(phrase), `Admin account migration missing: ${phrase}`);
}

for (const phrase of [
  "revoke all on table public.admin_access_accounts from service_role",
  "grant select on table public.admin_access_accounts to service_role",
]) {
  assert.ok(
    source.serviceRoleMigration.includes(phrase),
    `Admin account service-role migration missing: ${phrase}`,
  );
}

for (const phrase of [
  'adminAccountSessionCookieName = "prestige_admin_account_session"',
  'adminAccountSessionVersion = "admin-account-session-v1"',
  '"HttpOnly"',
  '"Secure"',
  '"SameSite=Lax"',
  '"Priority=High"',
  '"Path=/"',
  "60 * 60 * 8",
  "PRESTIGE_ADMIN_ACCOUNT_SESSION_SECRET",
  "PRESTIGE_ADMIN_ACCOUNT_AUTH_ENABLED",
  "createCipheriv",
  "createDecipheriv",
  "aes-256-gcm",
  "resolveAdminAccountSession",
  "issueAdminAccountSession",
  "clearAdminAccountSessionCookie",
]) {
  assert.ok(sessionImplementation.includes(phrase), `Admin session helper missing: ${phrase}`);
}
for (const forbidden of ["access_token", "refresh_token", "password", "email"]) {
  assert.equal(
    source.boundary.includes(forbidden),
    false,
    `Admin session payload must not contain ${forbidden}`,
  );
}
for (const phrase of [
  'import "server-only";',
  'from "./admin-dispatcher-auth-boundary.ts";',
  "issueAdminAccountSession",
  "resolveAdminAccountSession",
]) {
  assert.ok(source.session.includes(phrase), `Server-only session facade missing: ${phrase}`);
}

for (const phrase of [
  "signInWithOtp",
  "verifyOtp",
  "shouldCreateUser: false",
  "requestAdminAccountOtp",
  "verifyAdminAccountOtp",
  "revalidateAdminAccountSession",
  'type: "email"',
  '.from("admin_access_accounts")',
  '.eq("auth_user_id", authUserId)',
  '.eq("auth_email", email)',
  '.eq("account_status", "active")',
  '.eq("id", input.claims.accountId)',
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "signOut({ scope: \"local\" })",
]) {
  assert.ok(source.account.includes(phrase), `Admin account verifier missing: ${phrase}`);
}
assert.equal(source.account.includes("user_metadata"), false, "Admin role must never trust user metadata");
assert.equal(source.account.includes("signUp"), false, "The Admin surface must not expose public signup");
assert.equal(source.account.includes("signInWithPassword"), false, "The Admin surface must not use passwords");

for (const phrase of [
  "x-prestige-admin-auth-purpose",
  '"admin-account-sign-in"',
  '"admin-account-sign-out"',
  'refererUrl.pathname === "/admin-sign-in"',
  "requestAdminAccountOtp",
  "verifyAdminAccountOtp",
  '"request_code"',
  '"verify_code"',
  "issueAdminAccountSession",
  "clearAdminAccountSessionCookie",
  'export const dynamic = "force-dynamic"',
  'export const runtime = "nodejs"',
  '"cache-control": "private, no-store, max-age=0"',
  "adminProtectedRefererPath",
]) {
  assert.ok(source.route.includes(phrase), `Admin auth route missing: ${phrase}`);
}

for (const phrase of [
  '"/"',
  '"/customers/:path*"',
  '"/settings/invoice"',
  '"/admin-sign-in"',
  "resolveAdminAccountSession",
  "adminAccountAuthIsEnabled",
  "NextResponse.redirect",
  '"/api/(admin-.*)"',
  '"/api/ai-parse"',
  "protectedAdminApiPath",
  "revalidateAdminAccountSession",
  "await revalidateAdminAccountSession",
  "request.cookies.has(adminAccountSessionCookieName)",
  'pathname === "/api/admin-auth/session"',
]) {
  assert.ok(source.proxy.includes(phrase), `Admin page proxy missing: ${phrase}`);
}

for (const phrase of [
  "Admin sign in",
  "Email",
  "Send 6-digit code",
  "6-digit code",
  'x-prestige-admin-auth-purpose',
  '"admin-account-sign-in"',
  'credentials: "same-origin"',
  "safeAdminReturnPath",
  'value.startsWith("//")',
]) {
  assert.ok(
    `${source.loginPage}\n${source.loginClient}`.includes(phrase),
    `Admin sign-in surface missing: ${phrase}`,
  );
}
assert.equal(source.loginClient.includes('type="password"'), false, "Admin sign-in must be passwordless");

for (const forbidden of [
  "PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN",
  "PRESTIGE_ADMIN_ACCOUNT_SESSION_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
  "service_role",
  "signUp",
]) {
  assert.equal(
    source.loginClient.includes(forbidden),
    false,
    `Admin sign-in client must not expose ${forbidden}`,
  );
}

for (const phrase of [
  "adminAccountAuthIsEnabled",
  "resolveAdminAccountSession",
  'mode: "server-session-role-surface"',
]) {
  assert.ok(source.boundary.includes(phrase), `Central Admin boundary missing: ${phrase}`);
}
assert.equal(
  source.boundary.includes("account-session-role-surface"),
  false,
  "A verified Admin account cookie must use the established central server-session role surface",
);
assert.ok(
  source.boundary.indexOf("if (adminAccountAuthIsEnabled())") <
    source.boundary.indexOf("PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE"),
  "Enabled Admin account auth must be checked before every legacy server-session branch",
);
assert.match(
  source.adapter,
  /boundary_mode:\s*context\.mode,/,
  "The persistence adapter must consume the centrally canonical Admin boundary mode directly",
);
assert.equal(
  source.adapter.includes("account-session-role-surface"),
  false,
  "The persistence adapter must not retain a route-local account-session compatibility shim",
);
assert.ok(
  source.savedBookingRead.includes('actor.boundary_mode !== "server-session-role-surface"'),
  "The established saved-booking reader must retain its server-session actor lock",
);
for (const key of ["calendarSync", "mapLocationSearch", "mapRouteEstimates"]) {
  assert.ok(
    source[key].includes('actor.mode !== "server-session-role-surface"'),
    `${key} must retain its established verified server-session actor lock`,
  );
}

for (const [key, fallbackCall] of [
  ["customerAccountsRoute", "return routeLocalCustomerFolderBoundary(request);"],
  ["customerSavedBookingsRoute", "return routeLocalCustomerFolderBoundary(request);"],
  ["closeoutRoute", "return routeCustomerCloseoutReadBoundary(request);"],
  ["emailActivationRoute", "if (hasSetupOnlyAdminDashboardBoundary(request))"],
]) {
  const centralBoundary = source[key].indexOf("const boundary = resolveAdminDispatcherBoundary(");
  const accountStop = source[key].indexOf("if (adminAccountAuthIsEnabled())", centralBoundary);
  const legacyFallback = source[key].indexOf(fallbackCall, accountStop);

  assert.ok(centralBoundary >= 0, `${key} must call the central Admin boundary`);
  assert.ok(
    accountStop > centralBoundary && legacyFallback > accountStop,
    `${key} must stop an enabled account-auth rejection before its legacy fallback`,
  );
}

const invoiceRootBoundary = source.customerInvoiceBoundary.indexOf(
  "const rootBoundary = resolveAdminDispatcherBoundary(",
);
const invoiceAccountStop = source.customerInvoiceBoundary.indexOf(
  "if (adminAccountAuthIsEnabled())",
  invoiceRootBoundary,
);
const invoiceLegacyFallback = source.customerInvoiceBoundary.indexOf(
  "const serverContext = serverSessionContextForCustomerInvoice(request);",
  invoiceAccountStop,
);
assert.ok(
  invoiceRootBoundary >= 0 &&
    invoiceAccountStop > invoiceRootBoundary &&
    invoiceLegacyFallback > invoiceAccountStop,
  "Invoice routes must stop an enabled account-auth rejection before legacy authorization",
);
assert.ok(
  source.customerInvoiceBoundary.includes(
    'additionalSameOriginRefererPathnames: ["/customers"]',
  ) &&
    source.customerInvoiceBoundary.includes(
      'additionalSameOriginRefererPathPrefixes: ["/customers/"]',
    ),
  "Enabled Admin account auth must preserve the exact established Customer invoice page referer lane",
);

for (const key of ["bookingReferenceRoute", "invoicePrefixRoute"]) {
  const accountGate = source[key].indexOf("if (adminAccountAuthIsEnabled())");
  const centralBoundary = source[key].indexOf(
    "const boundary = resolveAdminDispatcherBoundary(",
    accountGate,
  );
  const legacyBranch = source[key].indexOf("PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE");

  assert.ok(
    accountGate >= 0 && centralBoundary > accountGate && legacyBranch > centralBoundary,
    `${key} must delegate enabled account auth to the central boundary before legacy authorization`,
  );
  assert.ok(
    source[key].includes('additionalSameOriginRefererPathPrefixes: ["/customers"]'),
    `${key} must preserve its same-origin customer-folder page lane`,
  );
}

for (const phrase of [
  "Admin Account Session Foundation (2026-08-19)",
  "six-digit one-time code",
  "No Admin TestFlight build or Apple upload is created by this source checkpoint",
  "scripts/test-admin-account-session-foundation-guard.mjs",
]) {
  assert.ok(source.ledger.includes(phrase), `Implementation ledger missing: ${phrase}`);
}

assert.ok(
  source.preactivation.includes("scripts/test-admin-account-session-foundation-guard.mjs"),
  "The Admin account-session guard must run in preactivation verification",
);

const tempDir = await mkdtemp(path.join(tmpdir(), "prestige-admin-session-guard-"));
try {
  const runtimeSource = source.boundary;
  const transpiled = ts.transpileModule(runtimeSource, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const runtimePath = path.join(tempDir, "admin-dispatcher-auth-boundary.mjs");
  await writeFile(runtimePath, transpiled, "utf8");
  const runtime = await import(`${pathToFileURL(runtimePath).href}?v=${Date.now()}`);
  const env = {
    PRESTIGE_ADMIN_ACCOUNT_AUTH_ENABLED: "true",
    PRESTIGE_ADMIN_ACCOUNT_SESSION_SECRET: "0123456789abcdef0123456789abcdef",
  };
  const issuedAt = "2026-08-19T12:00:00.000Z";
  const cookie = runtime.issueAdminAccountSession({
    accountId: "11111111-1111-4111-8111-111111111111",
    actorLabel: "Owner Admin",
    authUserId: "22222222-2222-4222-8222-222222222222",
    env,
    now: issuedAt,
    role: "admin",
  });
  assert.equal(typeof cookie, "string", "A configured verified Admin must receive one session cookie");
  assert.match(cookie, /HttpOnly; Secure; SameSite=Lax; Priority=High$/);
  assert.equal(
    runtime.resolveAdminAccountSession(cookie, {
      env,
      now: "2026-08-19T12:05:00.000Z",
    }).ok,
    true,
    "A fresh authentic session must resolve",
  );
  assert.equal(
    runtime.resolveAdminAccountSession(cookie, {
      env,
      now: "2026-08-19T20:00:00.001Z",
    }).ok,
    false,
    "An Admin session must fail after the bounded eight-hour lifetime",
  );
  const tamperedCookie = cookie.replace(
    /prestige_admin_account_session=([^;])/,
    (_match, first) => `prestige_admin_account_session=${first === "A" ? "B" : "A"}`,
  );
  assert.equal(
    runtime.resolveAdminAccountSession(tamperedCookie, {
      env,
      now: "2026-08-19T12:05:00.000Z",
    }).ok,
    false,
    "Authenticated GCM session tampering must fail closed",
  );
  assert.equal(
    runtime.resolveAdminAccountSession(null, { env }).reason,
    "session_required",
    "A missing enabled Admin session must fail closed",
  );
  assert.equal(
    runtime.resolveAdminAccountSession(cookie, {
      env: { ...env, PRESTIGE_ADMIN_ACCOUNT_AUTH_ENABLED: "false" },
    }).reason,
    "not_configured",
    "A disabled Admin account gate must not accept a retained cookie",
  );

  const boundaryRuntime = runtime;
  const centralBoundaryCookie = runtime.issueAdminAccountSession({
    accountId: "11111111-1111-4111-8111-111111111111",
    actorLabel: "Owner Admin",
    authUserId: "22222222-2222-4222-8222-222222222222",
    env,
    role: "admin",
  });
  assert.equal(
    typeof centralBoundaryCookie,
    "string",
    "The central-boundary fixture must receive one fresh session cookie",
  );
  const originalProcessEnv = { ...process.env };
  try {
    Object.assign(process.env, env, {
      PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
      PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
      PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: "legacy-server-token",
    });
    const headers = {
      referer: "https://app.prestigelimo.sg/customers/1",
      "x-prestige-admin-purpose": "admin-booking-persistence",
    };
    const missingSession = boundaryRuntime.resolveAdminDispatcherBoundary(
      new Request("https://app.prestigelimo.sg/api/admin-customer-accounts", { headers }),
    );
    assert.equal(
      missingSession.ok,
      false,
      "Legacy server-session configuration must not bypass a missing enabled account cookie",
    );
    const invalidSession = boundaryRuntime.resolveAdminDispatcherBoundary(
      new Request("https://app.prestigelimo.sg/api/admin-customer-accounts", {
        headers: { ...headers, cookie: "prestige_admin_account_session=invalid" },
      }),
    );
    assert.equal(
      invalidSession.ok,
      false,
      "Legacy server-session configuration must not bypass an invalid enabled account cookie",
    );
    const matchingLegacyToken = boundaryRuntime.resolveAdminDispatcherBoundary(
      new Request("https://app.prestigelimo.sg/api/admin-customer-accounts", {
        headers: {
          ...headers,
          "x-prestige-admin-session-token": "legacy-server-token",
        },
      }),
    );
    assert.equal(
      matchingLegacyToken.ok,
      false,
      "A matching legacy request token must not bypass a missing enabled account cookie",
    );
    const validSession = boundaryRuntime.resolveAdminDispatcherBoundary(
      new Request("https://app.prestigelimo.sg/api/admin-customer-accounts", {
        headers: { ...headers, cookie: centralBoundaryCookie },
      }),
      "admin-booking-persistence",
      { additionalSameOriginRefererPathPrefixes: ["/customers"] },
    );
    assert.equal(validSession.ok, true, "One valid enabled Admin account cookie must pass centrally");
    assert.equal(validSession.context.mode, "server-session-role-surface");
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalProcessEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalProcessEnv);
  }

  const accountRuntimeSource = source.account
    .replace('import "server-only";', "")
    .replace(
      'import { createClient, type SupabaseClient } from "@supabase/supabase-js";',
      'const createClient = () => { throw new Error("Unexpected live Supabase client in guard"); };',
    )
    .replace(
      'import { adminAccountAuthIsEnabled } from "./admin-account-session.ts";',
      'const adminAccountAuthIsEnabled = (env = process.env) => env.PRESTIGE_ADMIN_ACCOUNT_AUTH_ENABLED === "true";',
    );
  const accountRuntimePath = path.join(tempDir, "admin-account-auth.mjs");
  await writeFile(
    accountRuntimePath,
    ts.transpileModule(accountRuntimeSource, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    "utf8",
  );
  const accountRuntime = await import(
    `${pathToFileURL(accountRuntimePath).href}?v=${Date.now()}`
  );
  const accountRow = {
    account_role: "admin",
    account_status: "active",
    auth_email: "owner@example.com",
    auth_user_id: "22222222-2222-4222-8222-222222222222",
    id: "11111111-1111-4111-8111-111111111111",
    safe_display_label: "Owner Admin",
  };
  function mockClient(rows) {
    return {
      from(table) {
        assert.equal(table, "admin_access_accounts");
        const filters = [];
        return {
          eq(column, value) {
            filters.push([column, value]);
            return this;
          },
          async maybeSingle() {
            const data = rows.find((row) =>
              filters.every(([column, value]) => row[column] === value)
            ) || null;
            return { data, error: null };
          },
          select() { return this; },
        };
      },
    };
  }
  const authCalls = { requested: [], signedOut: 0, verified: [] };
  const mockAuth = {
    async signInWithOtp(input) {
      authCalls.requested.push(input);
      return { error: null };
    },
    async signOut() {
      authCalls.signedOut += 1;
    },
    async verifyOtp(input) {
      authCalls.verified.push(input);
      return { data: { user: { id: accountRow.auth_user_id } }, error: null };
    },
  };
  const otpEnv = { PRESTIGE_ADMIN_ACCOUNT_AUTH_ENABLED: "true" };
  const unknownRequest = await accountRuntime.requestAdminAccountOtp({
    auth: mockAuth,
    client: mockClient([accountRow]),
    email: "unknown@example.com",
    env: otpEnv,
  });
  assert.equal(unknownRequest.ok, true);
  assert.equal(authCalls.requested.length, 0, "An unmapped email must trigger no OTP provider call");
  const ownerRequest = await accountRuntime.requestAdminAccountOtp({
    auth: mockAuth,
    client: mockClient([accountRow]),
    email: "OWNER@example.com",
    env: otpEnv,
  });
  assert.equal(ownerRequest.ok, true);
  assert.deepEqual(authCalls.requested, [{
    email: "owner@example.com",
    options: { shouldCreateUser: false },
  }]);
  const malformedCode = await accountRuntime.verifyAdminAccountOtp({
    auth: mockAuth,
    client: mockClient([accountRow]),
    email: "owner@example.com",
    env: otpEnv,
    token: "12345",
  });
  assert.equal(malformedCode.reason, "invalid_code");
  assert.equal(authCalls.verified.length, 0, "A non-six-digit code must trigger no verification call");
  const verifiedAccount = await accountRuntime.verifyAdminAccountOtp({
    auth: mockAuth,
    client: mockClient([accountRow]),
    email: "owner@example.com",
    env: otpEnv,
    token: "123456",
  });
  assert.equal(verifiedAccount.ok, true);
  assert.deepEqual(authCalls.verified, [{
    email: "owner@example.com",
    token: "123456",
    type: "email",
  }]);
  assert.equal(authCalls.signedOut, 1, "The temporary Supabase OTP session must be discarded");

  const sessionClaims = {
    accountId: accountRow.id,
    actorLabel: accountRow.safe_display_label,
    authUserId: accountRow.auth_user_id,
    expiresAt: Date.now() + 60_000,
    issuedAt: Date.now(),
    role: accountRow.account_role,
  };
  assert.equal(
    (await accountRuntime.revalidateAdminAccountSession({
      claims: sessionClaims,
      client: mockClient([accountRow]),
      env: otpEnv,
    })).ok,
    true,
    "An unchanged active Admin account must revalidate",
  );
  assert.equal(
    (await accountRuntime.revalidateAdminAccountSession({
      claims: sessionClaims,
      client: mockClient([{ ...accountRow, account_status: "suspended" }]),
      env: otpEnv,
    })).ok,
    false,
    "A suspended Admin account must invalidate its existing cookie immediately",
  );
  assert.equal(
    (await accountRuntime.revalidateAdminAccountSession({
      claims: sessionClaims,
      client: mockClient([{ ...accountRow, account_role: "dispatcher" }]),
      env: otpEnv,
    })).ok,
    false,
    "An Admin role change must invalidate the stale cookie immediately",
  );

  const nextServerUrl = pathToFileURL(path.resolve("node_modules/next/server.js")).href;
  const proxyRuntimeSource = source.proxy
    .replace(
      'import { NextResponse, type NextRequest } from "next/server";',
      `import { NextResponse } from "${nextServerUrl}";`,
    )
    .replace(
      'import { revalidateAdminAccountSession } from "./lib/admin-account-auth.ts";',
      'const revalidateAdminAccountSession = (...args) => globalThis.__prestigeAdminRevalidate(...args);',
    )
    .replace(
      `import {
  adminAccountAuthIsEnabled,
  adminAccountSessionCookieName,
  clearAdminAccountSessionCookie,
  resolveAdminAccountSession,
} from "./lib/admin-account-session.ts";`,
      `const adminAccountAuthIsEnabled = () => true;
const adminAccountSessionCookieName = "prestige_admin_account_session";
const clearAdminAccountSessionCookie = () => "prestige_admin_account_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax; Priority=High";
const resolveAdminAccountSession = (cookie) => globalThis.__prestigeAdminResolve(cookie);`,
    );
  const proxyRuntimePath = path.join(tempDir, "proxy.mjs");
  await writeFile(
    proxyRuntimePath,
    ts.transpileModule(proxyRuntimeSource, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    "utf8",
  );
  const proxyRuntime = await import(`${pathToFileURL(proxyRuntimePath).href}?v=${Date.now()}`);
  const proxyClaims = sessionClaims;
  globalThis.__prestigeAdminResolve = (cookie) => cookie?.includes("valid-cookie")
    ? { claims: proxyClaims, ok: true, reason: "authenticated" }
    : { ok: false, reason: cookie ? "invalid_session" : "session_required" };
  let revalidationCalls = 0;
  globalThis.__prestigeAdminRevalidate = async () => {
    revalidationCalls += 1;
    return { ok: true };
  };

  for (const pathname of [
    "/api/customer-invoices",
    "/api/driver-portal/jobs",
    "/api/cron/admin-email-ai-intake",
  ]) {
    const response = await proxyRuntime.proxy(new NextRequest(
      `https://app.prestigelimo.sg${pathname}`,
      { headers: { cookie: "prestige_admin_account_session=valid-cookie" } },
    ));
    assert.equal(response.status, 200);
  }
  assert.equal(
    revalidationCalls,
    0,
    "Customer, Driver, and cron APIs must trigger zero Admin-account reads",
  );

  for (const pathname of ["/api/admin-customer-accounts", "/api/ai-parse"]) {
    const response = await proxyRuntime.proxy(new NextRequest(
      `https://app.prestigelimo.sg${pathname}`,
      { headers: { cookie: "prestige_admin_account_session=valid-cookie" } },
    ));
    assert.equal(response.status, 200, `${pathname} must accept one revalidated session`);
  }
  assert.equal(revalidationCalls, 2, "Both current Admin API namespaces must revalidate");

  globalThis.__prestigeAdminRevalidate = async () => {
    revalidationCalls += 1;
    return { ok: false, reason: "invalid_session" };
  };
  const revokedApiResponse = await proxyRuntime.proxy(new NextRequest(
    "https://app.prestigelimo.sg/api/admin-customer-accounts",
    { headers: { cookie: "prestige_admin_account_session=valid-cookie" } },
  ));
  assert.equal(revokedApiResponse.status, 403);
  assert.match(revokedApiResponse.headers.get("set-cookie") || "", /Max-Age=0/);
  const revokedPageResponse = await proxyRuntime.proxy(new NextRequest(
    "https://app.prestigelimo.sg/customers/1",
    { headers: { cookie: "prestige_admin_account_session=valid-cookie" } },
  ));
  assert.equal(revokedPageResponse.status, 307);
  assert.equal(
    new URL(revokedPageResponse.headers.get("location")).pathname,
    "/admin-sign-in",
  );
  assert.match(revokedPageResponse.headers.get("set-cookie") || "", /Max-Age=0/);
  delete globalThis.__prestigeAdminResolve;
  delete globalThis.__prestigeAdminRevalidate;
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

console.log("Admin account session foundation guard passed.");
