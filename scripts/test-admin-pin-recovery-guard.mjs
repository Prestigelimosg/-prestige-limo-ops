import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const paths = {
  account: "lib/admin-account-auth.ts",
  client: "app/admin-sign-in/admin-sign-in-form.tsx",
  ledger: "docs/current-implementation-ledger.md",
  preactivation: "scripts/test-preactivation-verification-suite.mjs",
  route: "app/api/admin-auth/session/route.ts",
};

const source = Object.fromEntries(await Promise.all(
  Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
));

for (const phrase of [
  'recoveryFragment.get("type") !== "recovery"',
  'recoveryFragment.get("access_token")',
  'recoveryFragment.get("refresh_token")',
  "window.history.replaceState",
  'action: "recover_pin"',
  '"admin-account-pin-recovery"',
  "New 6-digit Admin PIN",
  "Confirm 6-digit Admin PIN",
  'type="password"',
  'pattern="[0-9]{6}"',
  "recoveryAccessTokenRef.current = \"\"",
  "recoveryRefreshTokenRef.current = \"\"",
]) {
  assert.ok(source.client.includes(phrase), `Admin PIN recovery UI missing: ${phrase}`);
}
for (const forbidden of [
  "localStorage",
  "sessionStorage",
  "console.",
  "NEXT_PUBLIC_SUPABASE",
  "createClient(",
]) {
  assert.equal(source.client.includes(forbidden), false, `Recovery UI must not expose ${forbidden}`);
}

const recoverySubmitStart = source.client.indexOf('if (mode === "recover_pin")');
const recoveryTokenClear = source.client.indexOf("clearRecoverySession();", recoverySubmitStart);
const recoveryRequest = source.client.indexOf(
  'const response = await fetch("/api/admin-auth/session"',
  recoverySubmitStart,
);
assert.ok(recoverySubmitStart >= 0, "Admin recovery submit branch must exist");
assert.ok(
  recoveryTokenClear > recoverySubmitStart && recoveryTokenClear < recoveryRequest,
  "Admin recovery tokens must be cleared from refs before their one approved network submission",
);

for (const phrase of [
  "resetAdminAccountPinFromRecovery",
  'body.action === "recover_pin"',
  '"admin-account-pin-recovery"',
  '"accessToken"',
  '"refreshToken"',
  'recovery: "complete"',
]) {
  assert.ok(source.route.includes(phrase), `Admin PIN recovery route missing: ${phrase}`);
}

for (const phrase of [
  "resetAdminAccountPinFromRecovery",
  "setSession",
  "updateUser",
  'password: pin',
  '.eq("auth_user_id", authUserId)',
  '.eq("auth_email", adminAccountSignInEmail)',
  '.eq("account_role", "admin")',
  '.eq("account_status", "active")',
  'signOut({ scope: "local" })',
  "token.length > 0 && token.length <= 8192",
]) {
  assert.ok(source.account.includes(phrase), `Admin PIN recovery verifier missing: ${phrase}`);
}
assert.equal(
  source.account.includes("token.length >= 64"),
  false,
  "Recovery refresh tokens are opaque and must not have an invented minimum length",
);
assert.equal(
  source.account.includes("updateUserById"),
  false,
  "Recovery must use the verified user-scoped password update, not service-role password mutation",
);

assert.ok(
  source.preactivation.includes("scripts/test-admin-pin-recovery-guard.mjs"),
  "Admin PIN recovery guard must run in preactivation verification",
);
for (const phrase of [
  "Admin Recovery-Link PIN Setup Repair (2026-08-21)",
  "scripts/test-admin-pin-recovery-guard.mjs",
]) {
  assert.ok(source.ledger.includes(phrase), `Admin PIN recovery ledger checkpoint missing: ${phrase}`);
}

const tempDir = await mkdtemp(path.join(tmpdir(), "prestige-admin-pin-recovery-"));
try {
  const runtimeSource = source.account
    .replace('import "server-only";', "")
    .replace(
      'import { createClient, type SupabaseClient } from "@supabase/supabase-js";',
      'const createClient = () => { throw new Error("Unexpected live Supabase client in recovery guard"); };',
    )
    .replace(
      'import { adminAccountAuthIsEnabled } from "./admin-account-session.ts";',
      'const adminAccountAuthIsEnabled = (env = process.env) => env.PRESTIGE_ADMIN_ACCOUNT_AUTH_ENABLED === "true";',
    );
  const runtimePath = path.join(tempDir, "admin-account-auth.mjs");
  await writeFile(
    runtimePath,
    ts.transpileModule(runtimeSource, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    "utf8",
  );
  const runtime = await import(`${pathToFileURL(runtimePath).href}?v=${Date.now()}`);
  const owner = {
    account_role: "admin",
    account_status: "active",
    auth_email: "info@prestigelimo.sg",
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
            return {
              data: rows.find((row) =>
                filters.every(([column, value]) => row[column] === value)
              ) || null,
              error: null,
            };
          },
          select() { return this; },
        };
      },
    };
  }
  function mockAuth(options = {}) {
    const calls = { passwordChecks: [], sessions: [], signedOut: 0, updates: [] };
    return {
      calls,
      async setSession(input) {
        calls.sessions.push(input);
        return options.sessionError
          ? { data: { session: null, user: null }, error: {} }
          : {
              data: {
                user: {
                  email: "info@prestigelimo.sg",
                  email_confirmed_at: "2026-08-21T00:00:00.000Z",
                  id: owner.auth_user_id,
                  ...options.user,
                },
              },
              error: null,
            };
      },
      async signOut() {
        calls.signedOut += 1;
      },
      async signInWithPassword(input) {
        calls.passwordChecks.push(input);
        return options.passwordError
          ? { data: { user: null }, error: {} }
          : {
              data: {
                user: {
                  email: owner.auth_email,
                  id: options.passwordUserId || owner.auth_user_id,
                },
              },
              error: null,
            };
      },
      async updateUser(input) {
        calls.updates.push(input);
        return options.updateError
          ? { data: { user: null }, error: {} }
          : {
              data: {
                user: { email: owner.auth_email, id: owner.auth_user_id },
              },
              error: null,
            };
      },
    };
  }

  const env = { PRESTIGE_ADMIN_ACCOUNT_AUTH_ENABLED: "true" };
  const accessToken = "header.payload.signature";
  const shortRefreshToken = "refresh-token";
  const successfulAuth = mockAuth();
  const successful = await runtime.resetAdminAccountPinFromRecovery({
    accessToken,
    auth: successfulAuth,
    client: mockClient([owner]),
    env,
    pin: "246810",
    refreshToken: shortRefreshToken,
  });
  assert.equal(successful.ok, true, "A valid short opaque refresh token must reach Supabase");
  assert.deepEqual(successfulAuth.calls.sessions, [{
    access_token: accessToken,
    refresh_token: shortRefreshToken,
  }], "Recovery tokens must reach setSession byte-for-byte");
  assert.deepEqual(successfulAuth.calls.updates, [{ password: "246810" }]);
  assert.deepEqual(successfulAuth.calls.passwordChecks, [{
    email: owner.auth_email,
    password: "246810",
  }], "Recovery must canary the exact in-memory PIN with a fresh password grant");
  assert.equal(successfulAuth.calls.signedOut, 1, "The temporary recovery session must be discarded");

  for (const invalid of [
    { accessToken: "", refreshToken: shortRefreshToken },
    { accessToken, refreshToken: "" },
    { accessToken: "x".repeat(8193), refreshToken: shortRefreshToken },
    { accessToken, refreshToken: "x".repeat(8193) },
  ]) {
    const auth = mockAuth();
    const result = await runtime.resetAdminAccountPinFromRecovery({
      ...invalid,
      auth,
      client: mockClient([owner]),
      env,
      pin: "246810",
    });
    assert.equal(result.reason, "invalid_recovery");
    assert.equal(auth.calls.sessions.length, 0, "Invalid token bounds must fail before Supabase Auth");
    assert.equal(auth.calls.updates.length, 0, "Invalid token bounds must never update a password");
    assert.equal(auth.calls.passwordChecks.length, 0, "Invalid token bounds must never run a password canary");
  }

  const wrongMappingAuth = mockAuth();
  const wrongMapping = await runtime.resetAdminAccountPinFromRecovery({
    accessToken,
    auth: wrongMappingAuth,
    client: mockClient([{ ...owner, account_role: "dispatcher" }]),
    env,
    pin: "246810",
    refreshToken: shortRefreshToken,
  });
  assert.equal(wrongMapping.reason, "invalid_recovery");
  assert.equal(wrongMappingAuth.calls.updates.length, 0, "A non-owner mapping must block password update");
  assert.equal(wrongMappingAuth.calls.passwordChecks.length, 0, "A non-owner mapping must block the password canary");
  assert.equal(wrongMappingAuth.calls.signedOut, 1, "A rejected recovery session must be discarded");

  for (const options of [
    { passwordError: true },
    { passwordUserId: "33333333-3333-4333-8333-333333333333" },
  ]) {
    const auth = mockAuth(options);
    const result = await runtime.resetAdminAccountPinFromRecovery({
      accessToken,
      auth,
      client: mockClient([owner]),
      env,
      pin: "246810",
      refreshToken: shortRefreshToken,
    });
    assert.equal(result.reason, "invalid_recovery");
    assert.equal(auth.calls.updates.length, 1, "The exact Owner password update must precede its canary");
    assert.equal(auth.calls.passwordChecks.length, 1, "A recovery update must run exactly one password canary");
    assert.equal(auth.calls.signedOut, 1, "A failed password canary must discard its temporary session");
  }
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

console.log("Admin PIN recovery guard passed.");
