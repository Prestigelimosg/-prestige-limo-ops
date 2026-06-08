import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const disabledReservationError =
  "Admin monthly invoice number reservation is not enabled on this server.";
const serverSessionToken = "mock-monthly-invoice-number-reservation-admin-session-token";
const serviceRoleSentinel =
  "SUPABASE_SERVICE_ROLE_KEY_MONTHLY_INVOICE_NUMBER_RESERVATION_SENTINEL";
const supabaseUrlSentinel = "https://monthly-invoice-number-reservation-contract.supabase.co";
const issueRecordId = "33333333-3333-4333-8333-333333333333";
const safeApiLeakPattern =
  /SUPABASE_SERVICE_ROLE_KEY_MONTHLY_INVOICE_NUMBER_RESERVATION_SENTINEL|mock-monthly-invoice-number-reservation-admin-session-token|monthly-invoice-number-reservation-contract\.supabase\.co|service_role|server-only|server_only|stack|sql|secret|key|createClient/i;
const unsafeReservationLeakPattern =
  /contact_phone|contact_email|passenger|customer_price|quoted_price|rate_amount|driver_payout|paynow|payment_link|pdf_url|pdf_link|payout|finance|parser_debug|raw_ai|parser_prompt|live_location|proof|photo|notification|mock_archive|mock_qa|dev_workbench|internal_admin_note|admin_note|server_secret|token/i;
const sourceFiles = [
  "lib/admin-monthly-invoice-number-reservation.ts",
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-monthly-invoice-number-reservations/route.ts",
];
const originalEnv = {
  PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:
    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED,
  PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL:
    process.env.PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL,
  PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE:
    process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE:
    process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN:
    process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL: process.env.SUPABASE_URL,
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

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
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Monthly invoice number reservation contract admin",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleSentinel,
    SUPABASE_URL: supabaseUrlSentinel,
    ...overrides,
  });
}

function validHeaders(extra = {}) {
  return {
    referer: "http://localhost/",
    "x-prestige-admin-purpose": "admin-booking-persistence",
    "x-prestige-admin-session-token": serverSessionToken,
    ...extra,
  };
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
  const supabasePath = path.join(tempDir, "node_modules/@supabase/supabase-js/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await mkdir(path.dirname(supabasePath), { recursive: true });
  await writeFile(serverOnlyPath, "");
  await writeFile(
    supabasePath,
    [
      "function createClient(url, serviceRoleKey, options) {",
      "  const mock = globalThis.__prestigeMonthlyInvoiceNumberReservationApiMock;",
      "  if (!mock || !mock.client) {",
      "    throw new Error('Missing mocked monthly invoice number reservation Supabase client.');",
      "  }",
      "  mock.createdClients.push({ options, serviceRoleKey, url });",
      "  return mock.client;",
      "}",
      "module.exports = { createClient };",
    ].join("\n"),
  );
}

async function loadHarness() {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "prestige-monthly-invoice-number-reservation-api-"),
  );

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    persistence: require(path.join(
      tempDir,
      "lib/admin-monthly-invoice-number-reservation.js",
    )),
    route: require(path.join(
      tempDir,
      "app/api/admin-monthly-invoice-number-reservations/route.js",
    )),
  };
}

class MockSupabaseClient {
  constructor(options = {}) {
    this.failures = options.failures || {};
    this.rpcCalls = [];
    this.rpcResponse =
      options.rpcResponse ||
      [
        {
          invoice_number: "UBS-0007",
          invoice_number_status: "reserved",
          invoice_prefix: "UBS",
          invoice_sequence_number: 7,
          issue_record_id: issueRecordId,
        },
      ];
  }

  rpc(name, args) {
    this.rpcCalls.push({
      args: clone(args),
      name,
    });

    const failure = this.failures[name] || this.failures.rpc || null;

    if (failure) {
      return {
        data: null,
        error: failure,
      };
    }

    return {
      data: clone(this.rpcResponse),
      error: null,
    };
  }
}

function installMockClient(options = {}) {
  const mock = {
    client: new MockSupabaseClient(options),
    createdClients: [],
  };

  globalThis.__prestigeMonthlyInvoiceNumberReservationApiMock = mock;

  return mock;
}

async function callJson(handler, request) {
  const response = await handler(request);

  return {
    body: await response.json(),
    response,
  };
}

function assertNoLeaks(value, label) {
  const serialized = JSON.stringify(value);

  assert.equal(safeApiLeakPattern.test(serialized), false, `${label} leaked server internals.`);
  assert.equal(
    unsafeReservationLeakPattern.test(serialized),
    false,
    `${label} leaked private, payment, PDF, payout, notification, parser, or token fields.`,
  );
}

const validPayload = {
  billing_month: "2026-07",
  customer_account: "UBS Singapore",
  invoice_prefix: "ubs",
  issue_record_id: issueRecordId,
  safe_sequence_note: "Reserve the next UBS account invoice number after admin approval.",
};
const sourceText = await Promise.all(
  sourceFiles.map((relativePath) => readFile(path.join(process.cwd(), relativePath), "utf8")),
);
const joinedSourceText = sourceText.join("\n");
const reservationSourceText = await Promise.all(
  [
    "lib/admin-monthly-invoice-number-reservation.ts",
    "app/api/admin-monthly-invoice-number-reservations/route.ts",
  ].map((relativePath) => readFile(path.join(process.cwd(), relativePath), "utf8")),
);
const routeSourceText = await readFile(
  path.join(process.cwd(), "app/api/admin-monthly-invoice-number-reservations/route.ts"),
  "utf8",
);

assert.equal(
  joinedSourceText.includes("reserve_monthly_invoice_number_for_issue_record"),
  true,
  "Reservation API must call the approved sequence RPC.",
);
assert.equal(
  /\.from\s*\(/.test(reservationSourceText.join("\n")),
  false,
  "Reservation API must not perform ad hoc table writes.",
);
assert.equal(
  /payment_link|pdf_url|pdf_link|driver_payout|payout_amount|paynow|stripe|telegram|whatsapp/i.test(
    routeSourceText,
  ),
  false,
  "Reservation route must not include payment/PDF/payout/notification behavior.",
);

const harness = await loadHarness();

try {
  assert.equal(
    harness.persistence.adminMonthlyInvoiceNumberReservationVersion,
    "stage-monthly-invoice-number-reservation-api-v1",
  );
  const parsed = harness.persistence.parseAdminMonthlyInvoiceNumberReservationPayload(validPayload);
  assert.equal(parsed.ok, true, "Expected safe reservation payload to parse.");
  assert.equal(parsed.data.invoice_prefix, "UBS", "Expected invoice prefix to normalize uppercase.");

  for (const [label, payload] of [
    ["bad issue record id", { ...validPayload, issue_record_id: "not-a-uuid" }],
    ["bad month", { ...validPayload, billing_month: "2026-13" }],
    ["bad prefix", { ...validPayload, invoice_prefix: "UBS-2026" }],
    ["unsafe customer account", { ...validPayload, customer_account: "UBS payment link" }],
    ["unsafe note", { ...validPayload, safe_sequence_note: "Send PDF invoice now." }],
    ["unknown field", { ...validPayload, payment_link: "https://example.invalid/pay" }],
  ]) {
    const rejected = harness.persistence.parseAdminMonthlyInvoiceNumberReservationPayload(payload);

    assert.equal(rejected.ok, false, `${label}: expected parser rejection`);
    assert.equal(rejected.status, 400);
    assertNoLeaks(rejected, `${label}: rejected parser response`);
  }

  setEnv({});
  delete globalThis.__prestigeMonthlyInvoiceNumberReservationApiMock;
  const publicBlocked = await callJson(
    harness.route.POST,
    new Request("http://localhost/api/admin-monthly-invoice-number-reservations", {
      body: JSON.stringify(validPayload),
      method: "POST",
    }),
  );
  assert.equal(publicBlocked.response.status, 403, "Anonymous route access should be blocked.");
  assert.equal(publicBlocked.body.error, routeBlockedMessage);
  assertNoLeaks(publicBlocked, "anonymous blocked route");

  const disabledMock = installMockClient();
  setEnv({
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: undefined,
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleSentinel,
    SUPABASE_URL: supabaseUrlSentinel,
  });
  const disabledResult = await callJson(
    harness.route.POST,
    new Request("http://localhost/api/admin-monthly-invoice-number-reservations", {
      body: JSON.stringify(validPayload),
      headers: validHeaders({ "content-type": "application/json" }),
      method: "POST",
    }),
  );
  assert.equal(disabledResult.response.status, 503, "Default-off persistence should be disabled.");
  assert.equal(disabledResult.body.error, disabledReservationError);
  assert.equal(disabledMock.createdClients.length, 0, "Disabled route must not create client.");
  assert.equal(disabledMock.client.rpcCalls.length, 0, "Disabled route must not call RPC.");
  assertNoLeaks(disabledResult, "disabled route");

  validEnv();
  installMockClient();
  for (const [label, request] of [
    [
      "wrong purpose",
      new Request("http://localhost/api/admin-monthly-invoice-number-reservations", {
        body: JSON.stringify(validPayload),
        headers: validHeaders({
          "content-type": "application/json",
          "x-prestige-admin-purpose": "customer-booking-status-read",
        }),
        method: "POST",
      }),
    ],
    [
      "customer referer",
      new Request("http://localhost/api/admin-monthly-invoice-number-reservations", {
        body: JSON.stringify(validPayload),
        headers: validHeaders({
          "content-type": "application/json",
          referer: "http://localhost/my-bookings",
        }),
        method: "POST",
      }),
    ],
    [
      "driver referer",
      new Request("http://localhost/api/admin-monthly-invoice-number-reservations", {
        body: JSON.stringify(validPayload),
        headers: validHeaders({
          "content-type": "application/json",
          referer: "http://localhost/driver-job-demo",
        }),
        method: "POST",
      }),
    ],
    [
      "wrong token",
      new Request("http://localhost/api/admin-monthly-invoice-number-reservations", {
        body: JSON.stringify(validPayload),
        headers: validHeaders({
          "content-type": "application/json",
          "x-prestige-admin-session-token": "wrong-token",
        }),
        method: "POST",
      }),
    ],
  ]) {
    const blocked = await callJson(harness.route.POST, request);

    assert.equal(blocked.response.status, 403, `${label} should be blocked.`);
    assert.equal(blocked.body.error, routeBlockedMessage);
    assertNoLeaks(blocked, `${label} blocked route`);
  }

  validEnv({ PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "dispatcher" });
  const saveMock = installMockClient();
  const saveResult = await callJson(
    harness.route.POST,
    new Request("http://localhost/api/admin-monthly-invoice-number-reservations", {
      body: JSON.stringify(validPayload),
      headers: validHeaders({ "content-type": "application/json" }),
      method: "POST",
    }),
  );
  assert.equal(saveResult.response.status, 200);
  assert.equal(saveResult.body.ok, true);
  assert.deepEqual(saveResult.body.invoice_number_reservation, {
    invoice_number: "UBS-0007",
    invoice_number_status: "reserved",
    invoice_prefix: "UBS",
    invoice_sequence_number: 7,
    issue_record_id: issueRecordId,
  });
  assert.equal(saveMock.createdClients.length, 1, "Expected one server-only Supabase client.");
  assert.equal(saveMock.createdClients[0].url, supabaseUrlSentinel);
  assert.equal(saveMock.createdClients[0].serviceRoleKey, serviceRoleSentinel);
  assert.equal(saveMock.client.rpcCalls.length, 1);
  assert.equal(
    saveMock.client.rpcCalls[0].name,
    "reserve_monthly_invoice_number_for_issue_record",
  );
  assert.deepEqual(saveMock.client.rpcCalls[0].args, {
    p_actor_label: "Monthly invoice number reservation contract admin",
    p_actor_role: "dispatcher",
    p_billing_month: "2026-07",
    p_customer_account: "UBS Singapore",
    p_invoice_prefix: "UBS",
    p_issue_record_id: issueRecordId,
    p_safe_sequence_note: "Reserve the next UBS account invoice number after admin approval.",
  });
  assertNoLeaks(saveResult, "monthly invoice number reservation response");

  validEnv();
  installMockClient({
    failures: {
      reserve_monthly_invoice_number_for_issue_record: {
        code: "42883",
        message: `Missing RPC with ${serviceRoleSentinel} should not leak`,
      },
    },
  });
  const rpcFailure = await callJson(
    harness.route.POST,
    new Request("http://localhost/api/admin-monthly-invoice-number-reservations", {
      body: JSON.stringify(validPayload),
      headers: validHeaders({ "content-type": "application/json" }),
      method: "POST",
    }),
  );
  assert.equal(rpcFailure.response.status, 500);
  assert.equal(rpcFailure.body.error, "Admin monthly invoice number reservation failed safely.");
  assertNoLeaks(rpcFailure, "reservation RPC failure response");

  validEnv();
  installMockClient({
    rpcResponse: [
      {
        invoice_number: "BAD-FORMAT",
        invoice_number_status: "reserved",
        invoice_prefix: "UBS",
        invoice_sequence_number: 7,
        issue_record_id: issueRecordId,
      },
    ],
  });
  const malformedRpc = await callJson(
    harness.route.POST,
    new Request("http://localhost/api/admin-monthly-invoice-number-reservations", {
      body: JSON.stringify(validPayload),
      headers: validHeaders({ "content-type": "application/json" }),
      method: "POST",
    }),
  );
  assert.equal(malformedRpc.response.status, 500);
  assert.equal(malformedRpc.body.error, "Admin monthly invoice number reservation failed safely.");
  assertNoLeaks(malformedRpc, "malformed RPC response");
} finally {
  restoreEnv();
  delete globalThis.__prestigeMonthlyInvoiceNumberReservationApiMock;
  await harness.cleanup();
}

console.log("Admin monthly invoice number reservation API contract tests passed.");
