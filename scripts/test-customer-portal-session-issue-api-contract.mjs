import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const sessionIssuePath = "lib/customer-portal-session-issue.ts";
const routePath = "app/api/customer-portal-sessions/route.ts";
const pagePath = "app/my-bookings/page.tsx";
const adapterPath = "lib/customer-portal-saved-bookings-adapter.ts";
const sessionToken = "mock-customer-saved-bookings-session-token";
const issueToken = "mock-customer-portal-session-issue-token";
const authUserId = "33333333-3333-4333-8333-333333333333";
const defaultCookieName = "prestige_customer_saved_bookings_session";
const customCookieName = "prestige_customer_portal_session";
const sourceFiles = [sessionIssuePath, routePath];
const safeBodyLeakPattern =
  /mock-customer-saved-bookings-session-token|mock-customer-portal-session-issue-token|service_role|server-only|server_only|stack|sql|secret|api_key|createClient|set-cookie/i;
const unsafeCustomerSessionPattern =
  /admin_internal_status|admin_status|billing|contact_phone|contact_email|passenger_phone|customer_price|quoted_price|rate_amount|driver_payout|paynow|pay_now|invoice|payment|pdf|payout|finance|parser_debug|parser_learning|raw_ai|parser_prompt|live_location|proof|photo|telegram|whatsapp|sms|email_payload|notification|mock_archive|mock_qa|dev_workbench|internal_admin_note|internal_finance_note|internal_note|admin_note|server_secret|raw_token|token_hash|driver_token/i;
const originalEnv = {
  PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_ENABLED:
    process.env.PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_ENABLED,
  PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_MODE:
    process.env.PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_MODE,
  PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_TOKEN:
    process.env.PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_TOKEN,
  PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID:
    process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID,
  PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_COOKIE_NAME:
    process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_COOKIE_NAME,
  PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN:
    process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function setEnv(overrides) {
  restoreEnv();

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function validEnv(overrides = {}) {
  setEnv({
    PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_ENABLED: "true",
    PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_MODE: "server-session-token",
    PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_TOKEN: issueToken,
    PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID: authUserId,
    PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_COOKIE_NAME: undefined,
    PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN: sessionToken,
    ...overrides,
  });
}

function validHeaders(extra = {}) {
  return {
    origin: "http://localhost",
    referer: "http://localhost/my-bookings",
    "x-prestige-customer-purpose": "customer-portal-session-issue",
    "x-prestige-customer-session-issue-token": issueToken,
    ...extra,
  };
}

function assertSafeBody(body, label) {
  const serialized = JSON.stringify(body);

  assert.equal(safeBodyLeakPattern.test(serialized), false, `${label} leaked server/session internals.`);
  assert.equal(
    unsafeCustomerSessionPattern.test(serialized),
    false,
    `${label} leaked customer-private, admin, finance, payout, parser, token, notification, or archive fields.`,
  );
}

function assertNoCookie(response, label) {
  assert.equal(response.headers.get("set-cookie"), null, `${label} must not issue a cookie.`);
}

function assertSecureCookie(setCookie, cookieName = defaultCookieName) {
  assert.ok(setCookie, "Expected Set-Cookie header.");
  assert.ok(setCookie.startsWith(`${cookieName}=${encodeURIComponent(sessionToken)}`));

  for (const fragment of ["Path=/", "Max-Age=3600", "HttpOnly", "Secure", "SameSite=Lax", "Priority=High"]) {
    assert.ok(setCookie.includes(fragment), `Missing secure cookie fragment: ${fragment}`);
  }
}

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

async function writeHarnessFile(tempDir, relativePath) {
  const sourcePath = path.join(process.cwd(), relativePath);
  const outputPath = path.join(tempDir, relativePath.replace(/\.ts$/, ".js"));
  const source = await readFile(sourcePath, "utf8");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, transpileTypescript(source, sourcePath));
}

async function writeMockModules(tempDir) {
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-portal-session-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    issue: createRequire(import.meta.url)(path.join(tempDir, sessionIssuePath.replace(/\.ts$/, ".js"))),
    route: createRequire(import.meta.url)(path.join(tempDir, routePath.replace(/\.ts$/, ".js"))),
  };
}

const [sessionIssueSource, routeSource, pageSource, adapterSource] = await Promise.all(
  [sessionIssuePath, routePath, pagePath, adapterPath].map((relativePath) =>
    readFile(path.join(process.cwd(), relativePath), "utf8"),
  ),
);
const joinedIssueSource = `${sessionIssueSource}\n${routeSource}`;
const clientSource = `${pageSource}\n${adapterSource}`;

assert.equal(
  /\.(?:insert|upsert|delete|update|rpc)\s*\(/.test(joinedIssueSource),
  false,
  "Customer portal session issue path must not write or call RPC.",
);
assert.equal(
  /@supabase\/supabase-js|createClient|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_URL/.test(joinedIssueSource),
  false,
  "Customer portal session issue must not touch Supabase.",
);
assert.equal(
  /customer-portal-sessions|customer-portal-session-issue|x-prestige-customer-session-issue-token|PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE/.test(
    clientSource,
  ),
  false,
  "Customer portal UI/client must not call or expose the session issue contract.",
);
assert.ok(routeSource.includes('"Set-Cookie": result.data.cookie'));
assert.ok(sessionIssueSource.includes("HttpOnly"));
assert.ok(sessionIssueSource.includes("Secure"));
assert.ok(sessionIssueSource.includes("SameSite=Lax"));
assert.ok(sessionIssueSource.includes("Priority=High"));
assert.ok(sessionIssueSource.includes(defaultCookieName));
assert.ok(sessionIssueSource.includes("PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_COOKIE_NAME"));

const harness = await loadHarness();

try {
  assert.equal(harness.issue.customerPortalSessionIssueVersion, "customer-portal-session-issue-v1");

  setEnv({});
  const disabledResponse = await harness.route.POST(
    new Request("http://localhost/api/customer-portal-sessions", {
      headers: validHeaders(),
      method: "POST",
    }),
  );
  const disabledBody = await disabledResponse.json();
  assert.equal(disabledResponse.status, 403, "Session issue must default off.");
  assertNoCookie(disabledResponse, "default-off response");
  assertSafeBody(disabledBody, "default-off body");

  validEnv();
  for (const [label, request] of [
    [
      "missing purpose",
      new Request("http://localhost/api/customer-portal-sessions", {
        headers: validHeaders({ "x-prestige-customer-purpose": "" }),
        method: "POST",
      }),
    ],
    [
      "wrong referer",
      new Request("http://localhost/api/customer-portal-sessions", {
        headers: validHeaders({ referer: "http://localhost/customers" }),
        method: "POST",
      }),
    ],
    [
      "external origin",
      new Request("http://localhost/api/customer-portal-sessions", {
        headers: validHeaders({ origin: "https://evil.example" }),
        method: "POST",
      }),
    ],
    [
      "wrong issue token",
      new Request("http://localhost/api/customer-portal-sessions", {
        headers: validHeaders({ "x-prestige-customer-session-issue-token": "wrong-token" }),
        method: "POST",
      }),
    ],
  ]) {
    const blockedResponse = await harness.route.POST(request);
    const blockedBody = await blockedResponse.json();

    assert.equal(blockedResponse.status, 403, `${label} should be blocked: ${JSON.stringify(blockedBody)}`);
    assertNoCookie(blockedResponse, `${label} response`);
    assertSafeBody(blockedBody, `${label} body`);
  }

  for (const [label, overrides] of [
    ["missing auth user", { PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID: undefined }],
    ["placeholder session token", { PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN: "change-me" }],
    ["unsafe cookie name", { PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_COOKIE_NAME: "prestige_customer_session_token" }],
    ["wrong issue mode", { PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_MODE: "public" }],
  ]) {
    validEnv(overrides);
    const misconfiguredResponse = await harness.route.POST(
      new Request("http://localhost/api/customer-portal-sessions", {
        headers: validHeaders(),
        method: "POST",
      }),
    );
    const misconfiguredBody = await misconfiguredResponse.json();

    assert.equal(misconfiguredResponse.status, 503, `${label} should fail closed as server config.`);
    assertNoCookie(misconfiguredResponse, `${label} response`);
    assertSafeBody(misconfiguredBody, `${label} body`);
  }

  validEnv();
  const successResponse = await harness.route.POST(
    new Request("http://localhost/api/customer-portal-sessions", {
      headers: validHeaders(),
      method: "POST",
    }),
  );
  const successBody = await successResponse.json();
  assert.equal(successResponse.status, 200);
  assert.deepEqual(successBody, {
    ok: true,
    version: "customer-portal-session-issue-v1",
  });
  assert.equal(successResponse.headers.get("cache-control"), "no-store");
  assertSafeBody(successBody, "success body");
  assertSecureCookie(successResponse.headers.get("set-cookie"));

  validEnv({
    PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_COOKIE_NAME: customCookieName,
  });
  const customCookieResponse = await harness.route.POST(
    new Request("http://localhost/api/customer-portal-sessions", {
      headers: validHeaders(),
      method: "POST",
    }),
  );
  const customCookieBody = await customCookieResponse.json();
  assert.equal(customCookieResponse.status, 200);
  assertSafeBody(customCookieBody, "custom cookie success body");
  assertSecureCookie(customCookieResponse.headers.get("set-cookie"), customCookieName);

  for (const method of ["GET", "PUT", "PATCH", "DELETE"]) {
    const blockedMethodResponse = await harness.route[method]();
    const blockedMethodBody = await blockedMethodResponse.json();

    assert.equal(blockedMethodResponse.status, 403, `${method} should stay blocked.`);
    assertNoCookie(blockedMethodResponse, `${method} response`);
    assertSafeBody(blockedMethodBody, `${method} body`);
  }
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("Customer portal session issue API contract passed.");
