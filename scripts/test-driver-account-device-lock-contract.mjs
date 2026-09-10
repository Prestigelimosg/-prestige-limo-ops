import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

function transpile(source, filename) {
  return ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
}

async function loadHarness() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "prestige-driver-account-lock-"));
  for (const relativePath of [
    "lib/driver-job-status-workflow.ts",
    "lib/driver-job-link.ts",
    "lib/driver-account-password.ts",
    "lib/driver-account-device-lock.ts",
    "app/api/driver-auth/session/route.ts",
  ]) {
    const sourcePath = path.join(process.cwd(), relativePath);
    const output = transpile(await readFile(sourcePath, "utf8"), sourcePath);
    const outputPath = path.join(directory, relativePath.replace(/\.ts$/, ".js"));
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, output);
    await writeFile(path.join(directory, relativePath), output);
  }
  const serverOnly = path.join(directory, "node_modules/server-only/index.js");
  const supabase = path.join(directory, "node_modules/@supabase/supabase-js/index.js");
  await mkdir(path.dirname(serverOnly), { recursive: true });
  await mkdir(path.dirname(supabase), { recursive: true });
  await writeFile(serverOnly, "");
  await writeFile(supabase, "exports.createClient = () => { throw new Error('unexpected client'); };\n");
  await writeFile(path.join(directory, "lib/driver-portal-session.ts"), `
    exports.issueDriverPortalAccountSession = () => 'driver-session=synthetic; HttpOnly; Secure';
    exports.clearDriverPortalSessionCookie = () => 'driver-session=; Max-Age=0';
  `);

  const require = createRequire(import.meta.url);
  return {
    account: require(path.join(directory, "lib/driver-account-device-lock.js")),
    routeAccount: require(path.join(directory, "lib/driver-account-device-lock.ts")),
    route: require(path.join(directory, "app/api/driver-auth/session/route.js")),
    cleanup: () => rm(directory, { force: true, recursive: true }),
    link: require(path.join(directory, "lib/driver-job-link.js")),
  };
}

class Query {
  constructor(database, table) {
    this.database = database;
    this.table = table;
    this.filters = [];
    this.operation = "read";
    this.value = null;
  }

  select() { return this; }
  eq(column, value) { this.filters.push((row) => row[column] === value); return this; }
  is(column, value) { this.filters.push((row) => row[column] === value); return this; }
  insert(value) { this.operation = "insert"; this.value = value; return this; }
  update(value) { this.operation = "update"; this.value = value; return this; }

  rows() {
    return this.database[this.table].filter((row) => this.filters.every((filter) => filter(row)));
  }

  execute() {
    if (this.operation === "insert") {
      const row = { ...this.value };
      if (this.table === "driver_account_enrollments") {
        const duplicate = this.database[this.table].some((saved) =>
          saved.driver_job_link_id === row.driver_job_link_id || saved.driver_id === row.driver_id
        );
        if (duplicate) return { data: null, error: { code: "23505" } };
        row.id = "22222222-2222-4222-8222-222222222222";
      }
      if (this.table === "driver_access_accounts") {
        const duplicate = this.database[this.table].some((saved) =>
          saved.driver_reference === row.driver_reference ||
          saved.source_driver_job_link_id === row.source_driver_job_link_id ||
          (row.active_device_id_hash && saved.active_device_id_hash === row.active_device_id_hash)
        );
        if (duplicate) return { data: null, error: { code: "23505" } };
        row.id = "33333333-3333-4333-8333-333333333333";
        row.active_device_id_hash ??= null;
        row.device_bound_at ??= null;
      }
      this.database[this.table].push(row);
      return { data: row, error: null };
    }

    if (this.operation === "update") {
      const rows = this.rows();
      for (const row of rows) Object.assign(row, this.value);
      return { data: rows.length === 1 ? rows[0] : null, error: null };
    }

    const rows = this.rows();
    return { data: rows.length === 1 ? structuredClone(rows[0]) : null, error: rows.length > 1 ? {} : null };
  }

  single() { return Promise.resolve(this.execute()); }
  maybeSingle() { return Promise.resolve(this.execute()); }
  then(resolve, reject) { return Promise.resolve(this.execute()).then(resolve, reject); }
}

function clientFor(database) {
  return { from: (table) => new Query(database, table) };
}

const harness = await loadHarness();
try {
  const token = "acknowledged-driver-account-token";
  const unacknowledgedToken = "unacknowledged-driver-account-token";
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const database = {
    bookings: [
      { booking_reference: "ACCOUNT-1", driver_id: 7 },
      { booking_reference: "ACCOUNT-2", driver_id: 8 },
    ],
    driver_access_accounts: [],
    driver_account_enrollments: [],
    driver_job_links: [
      {
        booking_reference: "ACCOUNT-1",
        driver_id: 7,
        expires_at: expiresAt,
        id: "11111111-1111-4111-8111-111111111111",
        link_status: "active",
        revoked_at: null,
        safe_link_context: {
          driver_acknowledged_at: new Date().toISOString(),
          driver_job_payload: { assigned_driver_name: "Approved Driver" },
        },
        token_hash: harness.link.hashDriverJobLinkToken(token),
      },
      {
        booking_reference: "ACCOUNT-2",
        driver_id: 8,
        expires_at: expiresAt,
        id: "44444444-4444-4444-8444-444444444444",
        link_status: "active",
        revoked_at: null,
        safe_link_context: {},
        token_hash: harness.link.hashDriverJobLinkToken(unacknowledgedToken),
      },
    ],
  };
  const client = clientFor(database);
  const env = {
    PRESTIGE_DRIVER_ACCOUNT_AUTH_ENABLED: "true",
    PRESTIGE_DRIVER_ACCOUNT_DEVICE_SECRET: "driver-installation-pepper-longer-than-thirty-two-characters",
  };
  const password = "482951";
  const authUserId = "55555555-5555-4555-8555-555555555555";
  const authAdmin = {
    createUser: async (input) => ({
      data: { user: input.email === "driver@example.com" ? { id: authUserId } : null },
      error: input.email === "driver@example.com" ? null : {},
    }),
    deleteUser: async () => ({ error: null }),
  };

  for (const weakPassword of ["12345", "123456", "654321", "111111", "12a456"]) {
    assert.deepEqual(
      await harness.account.createDriverAccountForAcknowledgedLink({
        authorizedDriverId: 7,
        authAdmin,
        client,
        email: "driver@example.com",
        env,
        password: weakPassword,
        token,
      }),
      { ok: false, reason: "invalid_input" },
      `Weak Driver password ${weakPassword} must fail before any account write.`,
    );
  }

  assert.deepEqual(
    await harness.account.createDriverAccountForAcknowledgedLink({
      authorizedDriverId: 8,
      authAdmin,
      client,
      email: "DRIVER@example.com",
      env,
      password,
      token: unacknowledgedToken,
    }),
    { ok: false, reason: "invalid_link" },
    "An unacknowledged Job Link must not create a Driver account.",
  );

  assert.deepEqual(
    await harness.account.createDriverAccountForAcknowledgedLink({
      authorizedDriverId: 8,
      authAdmin,
      client,
      email: "driver@example.com",
      env,
      password,
      token,
    }),
    { ok: false, reason: "invalid_link" },
    "A different Driver portal session must not claim the acknowledged Job Link.",
  );

  const created = await harness.account.createDriverAccountForAcknowledgedLink({
    authorizedDriverId: 7,
    authAdmin,
    client,
    email: "DRIVER@example.com",
    env,
    password,
    token,
  });
  assert.deepEqual(created, {
    accountId: "33333333-3333-4333-8333-333333333333",
    deviceIdHash: null,
    driverId: 7,
    ok: true,
  });
  assert.equal(database.driver_access_accounts[0].account_status, "pending_setup");
  assert.equal(database.driver_access_accounts[0].active_device_id_hash, null);
  assert.equal(database.driver_account_enrollments[0].enrollment_status, "consumed");

  assert.deepEqual(
    await harness.account.createDriverAccountForAcknowledgedLink({
      authorizedDriverId: 7,
      authAdmin,
      client,
      email: "driver@example.com",
      env,
      password,
      token,
    }),
    { ok: false, reason: "account_exists" },
    "The consumed Job Link must not create a second account.",
  );

  let signOutCount = 0;
  const auth = {
    signInWithPassword: async ({ email, password: suppliedPassword }) => ({
      data: email === "driver@example.com" && suppliedPassword === password
        ? { user: { id: authUserId } }
        : null,
      error: email === "driver@example.com" && suppliedPassword === password ? null : {},
    }),
    signOut: async () => { signOutCount += 1; },
  };
  const firstInstallation = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const secondInstallation = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const firstSignIn = await harness.account.signInDriverAccountForInstallation({
    auth,
    client,
    email: "driver@example.com",
    env,
    installationId: firstInstallation,
    password,
  });
  assert.equal(firstSignIn.ok, true, JSON.stringify(firstSignIn));
  assert.equal(database.driver_access_accounts[0].account_status, "active");
  assert.match(database.driver_access_accounts[0].active_device_id_hash, /^[0-9a-f]{64}$/);
  assert.equal(database.driver_access_accounts[0].active_device_id_hash.includes(firstInstallation), false);

  const sameInstallation = await harness.account.signInDriverAccountForInstallation({
    auth,
    client,
    email: "driver@example.com",
    env,
    installationId: firstInstallation,
    password,
  });
  assert.equal(sameInstallation.ok, true, "The approved installation may sign in again.");

  const otherInstallation = await harness.account.signInDriverAccountForInstallation({
    auth,
    client,
    email: "driver@example.com",
    env,
    installationId: secondInstallation,
    password,
  });
  assert.deepEqual(otherInstallation, { ok: false, reason: "device_mismatch" });
  assert.equal(signOutCount, 3, "Every credential check must discard its temporary Supabase session.");

  const identityReader = { getUserById: async (id) => ({ data: { user: { id, email: "driver@example.com" } }, error: null }) };
  const beforePin = structuredClone(database);
  const pinSignIn = await harness.account.signInDriverAccountForInstallation({
    allowBoundDevicePin: true, identityReader,
    auth, client, email: undefined, env, installationId: firstInstallation, password,
  });
  assert.deepEqual(pinSignIn, firstSignIn, "An already-bound phone must verify its existing PIN without client email.");
  assert.deepEqual(database, beforePin, "PIN-only sign-in must not create, bind, or update an account.");

  const pinInput = { allowBoundDevicePin: true, identityReader, auth, client, email: undefined, env, installationId: firstInstallation, password };
  for (const identityResult of [
    { data: null, error: {} },
    { data: { user: { id: authUserId, email: "" } }, error: null },
    { data: { user: { id: "66666666-6666-4666-8666-666666666666", email: "driver@example.com" } }, error: null },
  ]) {
    let providerCalls = 0;
    const result = await harness.account.signInDriverAccountForInstallation({
      ...pinInput,
      identityReader: { getUserById: async () => identityResult },
      auth: { ...auth, signInWithPassword: async () => { providerCalls++; throw new Error("Must not authenticate"); } },
    });
    assert.equal(result.ok, false, "Missing or mismatched Auth identity must fail closed.");
    assert.equal(providerCalls, 0);
  }
  for (const input of [
    { ...pinInput, allowBoundDevicePin: false },
    { ...pinInput, installationId: secondInstallation },
    { ...pinInput, installationId: "invalid" },
    { ...pinInput, password: "583962" },
    { ...pinInput, password: "123456" },
    { ...pinInput, email: "" },
    { ...pinInput, email: null },
  ]) {
    assert.equal((await harness.account.signInDriverAccountForInstallation(input)).ok, false);
  }
  for (const accountStatus of ["pending_setup", "revoked", "suspended"]) {
    database.driver_access_accounts[0].account_status = accountStatus;
    let providerCalls = 0;
    const result = await harness.account.signInDriverAccountForInstallation({
      ...pinInput, auth: { ...auth, signInWithPassword: async () => { providerCalls++; throw new Error("Must not authenticate"); } },
    });
    assert.equal(result.ok, false, accountStatus);
    assert.equal(providerCalls, 0, "An inactive binding must fail before provider authentication.");
  }
  database.driver_access_accounts[0] = structuredClone(beforePin.driver_access_accounts[0]);
  database.driver_access_accounts.push({ ...database.driver_access_accounts[0], id: "66666666-6666-4666-8666-666666666666" });
  assert.equal((await harness.account.signInDriverAccountForInstallation(pinInput)).ok, false, "Ambiguous bindings fail closed.");
  database.driver_access_accounts.pop();
  assert.equal((await harness.account.signInDriverAccountForInstallation({
    ...pinInput, client: { from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: {} }) }; return q; } },
  })).ok, false, "Lookup failures must not identify a Driver.");
  for (const mutation of [
    (row) => { row.account_status = "revoked"; },
    (row) => { row.active_device_id_hash = null; row.account_status = "pending_setup"; },
    (row) => { row.driver_reference = "8"; },
  ]) {
    const changingAuth = { ...auth, signInWithPassword: async (input) => {
      const result = await auth.signInWithPassword(input);
      mutation(database.driver_access_accounts[0]);
      return result;
    } };
    assert.equal((await harness.account.signInDriverAccountForInstallation({ ...pinInput, auth: changingAuth })).ok, false,
      "A concurrent revoke, unbind or Driver change must fail without rebinding.");
    database.driver_access_accounts[0] = structuredClone(beforePin.driver_access_accounts[0]);
  }
  assert.equal((await harness.account.signInDriverAccountForInstallation({
    ...pinInput, auth: { ...auth, signInWithPassword: async () => ({ data: { user: { id: "66666666-6666-4666-8666-666666666666" } }, error: null }) },
  })).ok, false, "A different provider identity cannot use the saved binding.");

  const originalRouteSignIn = harness.routeAccount.signInDriverAccountForInstallation;
  harness.routeAccount.signInDriverAccountForInstallation = (input) => originalRouteSignIn({ ...input, auth, client, env, identityReader });
  const routeRequest = (body, ua = "Mozilla/5.0 (Linux; Android 16; Pixel 6 Pro; wv)", overrides = {}) => new Request("https://app.example.com/api/driver-auth/session", {
    method: "POST", headers: { origin: "https://app.example.com", referer: "https://app.example.com/driver-portal",
      "content-type": "application/json", "x-prestige-driver-purpose": "driver-account-sign-in", "user-agent": ua, ...overrides },
    body: JSON.stringify(body),
  });
  const pinBody = { installation_id: firstInstallation, password };
  const routeSuccess = await harness.route.POST(routeRequest(pinBody));
  assert.equal(routeSuccess.status, 200);
  assert.deepEqual(await routeSuccess.json(), { ok: true, session: "active" }, "No account/email/device data leaves the sign-in response.");
  assert.match(routeSuccess.headers.get("set-cookie"), /HttpOnly/);
  for (const request of [
    routeRequest(pinBody, "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"),
    routeRequest(pinBody, "Mozilla/5.0 (Macintosh; Intel Mac OS X)"),
    routeRequest({ ...pinBody, installation_id: secondInstallation }),
    routeRequest({ ...pinBody, password: "583962" }),
    routeRequest({ ...pinBody, account_id: firstSignIn.accountId }),
    routeRequest(pinBody, "Android", { origin: "https://other.example.com" }),
    routeRequest(pinBody, "Android", { referer: "https://app.example.com/book" }),
    routeRequest(pinBody, "Android", { "x-prestige-driver-purpose": "wrong" }),
  ]) {
    const result = await harness.route.POST(request);
    assert.equal(result.status, 401, "Android user-agent alone must never authorize sign-in.");
    assert.equal(result.headers.get("set-cookie"), null);
  }
  const oldIosResult = await harness.route.POST(routeRequest({ ...pinBody, email: "driver@example.com" }, "iPhone"));
  assert.equal(oldIosResult.status, 200, "The existing iOS email/password request remains valid.");
  assert.deepEqual(database, beforePin, "All PIN-only reads leave the account and binding unchanged.");

  assert.equal(await harness.account.verifyDriverAccountSession({
    accountId: firstSignIn.accountId,
    client,
    deviceIdHash: firstSignIn.deviceIdHash,
    driverId: 7,
    env,
    installationId: firstInstallation,
  }), true);
  assert.equal(await harness.account.verifyDriverAccountSession({
    accountId: firstSignIn.accountId,
    client,
    deviceIdHash: firstSignIn.deviceIdHash,
    driverId: 7,
    env,
    installationId: secondInstallation,
  }), false, "A copied account cookie must fail from a different installation.");
  database.driver_access_accounts[0].account_status = "suspended";
  assert.equal(await harness.account.verifyDriverAccountSession({
    accountId: firstSignIn.accountId,
    client,
    deviceIdHash: firstSignIn.deviceIdHash,
    driverId: 7,
    env,
    installationId: firstInstallation,
  }), false, "Suspension must invalidate the app session immediately.");

  console.log("Driver account acknowledged-link and one-installation contract tests passed.");
} finally {
  await harness.cleanup();
}
