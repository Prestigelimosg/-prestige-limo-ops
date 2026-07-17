import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/customer-portal-access-link.ts";
const accountPath = "lib/customer-portal-access-account.ts";
const secret = "customer-portal-revision-runtime-secret-123456789";
const accountReference = "customer-revision-test-001";

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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-portal-revision-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");
  const supabasePath = path.join(tempDir, "node_modules/@supabase/supabase-js/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await mkdir(path.dirname(supabasePath), { recursive: true });
  await writeFile(serverOnlyPath, "");
  await writeFile(supabasePath, "module.exports = { createClient() { throw new Error('mock client required'); } };");

  for (const sourceFile of [helperPath, accountPath]) {
    const outputPath = path.join(tempDir, sourceFile.replace(/\.ts$/, ".js"));
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, transpile(await readFile(sourceFile, "utf8"), sourceFile));
  }

  const require = createRequire(import.meta.url);

  return {
    accessAccount: require(path.join(tempDir, "lib/customer-portal-access-account.js")),
    accessLink: require(path.join(tempDir, "lib/customer-portal-access-link.js")),
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
  };
}

function readClient(row) {
  return {
    from(table) {
      assert.equal(table, "customer_access_accounts");
      const query = {
        eq() {
          return query;
        },
        limit() {
          return Promise.resolve({ data: row ? [row] : [], error: null });
        },
        select() {
          return query;
        },
      };
      return query;
    },
  };
}

function ensureClient(existingRow) {
  const state = { upserts: [] };
  const client = {
    from(table) {
      assert.equal(table, "customer_access_accounts");
      return {
        select() {
          const query = {
            eq() {
              return query;
            },
            limit() {
              return Promise.resolve({ data: existingRow ? [existingRow] : [], error: null });
            },
          };
          return query;
        },
        upsert(payload, options) {
          state.upserts.push({ options, payload });
          return {
            select() {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: {
                      account_status: payload.account_status,
                      booker_id: payload.booker_id,
                      company_id: payload.company_id,
                      customer_account_reference: payload.customer_account_reference,
                      safe_display_label: payload.safe_display_label,
                      updated_at: payload.updated_at,
                    },
                    error: null,
                  });
                },
              };
            },
          };
        },
      };
    },
  };

  return { client, state };
}

function legacyToken(issuedAt) {
  const payload = Buffer.from(
    JSON.stringify({
      account: accountReference,
      iat: issuedAt,
      scope: "portal_account",
      type: "customer-portal-access-link-v1",
    }),
    "utf8",
  ).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");

  return `portal_access_v1.${payload}.${signature}`;
}

const originalEnv = { ...process.env };
const harness = await loadHarness();

try {
  process.env.PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_ENABLED = "true";
  process.env.PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_SECRET = secret;
  process.env.PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_ACCOUNT_ALLOWLIST = accountReference;

  const oldRevision = "2026-07-18T10:00:00.000Z";
  const currentRevision = "2026-07-18T10:05:00.000Z";
  const oldToken = harness.accessLink.createCustomerPortalAccessLinkToken(accountReference, {
    linkRevision: oldRevision,
    scope: "portal_account",
  });
  const currentToken = harness.accessLink.createCustomerPortalAccessLinkToken(accountReference, {
    linkRevision: currentRevision,
    scope: "portal_account",
  });

  assert.equal(oldToken.ok, true);
  assert.equal(currentToken.ok, true);
  assert.equal(oldToken.data.expires_at, null);

  const oldSession = harness.accessLink.resolveCustomerPortalAccessSession(oldToken.data.token);
  const currentSession = harness.accessLink.resolveCustomerPortalAccessSession(currentToken.data.token);
  assert.equal(oldSession.data.link_revision, oldRevision);
  assert.equal(currentSession.data.link_revision, currentRevision);

  const activeRow = {
    account_status: "active",
    booker_id: 55,
    company_id: 7,
    customer_account_reference: accountReference,
    safe_display_label: "William Test",
    updated_at: currentRevision,
  };
  const stale = await harness.accessAccount.assertActiveCustomerPortalAccessAccount(
    accountReference,
    readClient(activeRow),
    {
      issuedAt: oldSession.data.issued_at,
      linkRevision: oldSession.data.link_revision,
    },
  );
  const current = await harness.accessAccount.assertActiveCustomerPortalAccessAccount(
    accountReference,
    readClient(activeRow),
    {
      issuedAt: currentSession.data.issued_at,
      linkRevision: currentSession.data.link_revision,
    },
  );

  assert.equal(stale.ok, false, "An earlier permanent link must stay invalid after replacement.");
  assert.equal(current.ok, true);

  const legacy = harness.accessLink.resolveCustomerPortalAccessSession(
    legacyToken(Math.floor(Date.parse(oldRevision) / 1000)),
  );
  const staleLegacy = await harness.accessAccount.assertActiveCustomerPortalAccessAccount(
    accountReference,
    readClient(activeRow),
    {
      issuedAt: legacy.data.issued_at,
      linkRevision: legacy.data.link_revision,
    },
  );
  assert.equal(staleLegacy.ok, false, "A pre-revision link must not revive after account rotation.");

  const revoked = await harness.accessAccount.assertActiveCustomerPortalAccessAccount(
    accountReference,
    readClient({ ...activeRow, account_status: "revoked" }),
    {
      issuedAt: currentSession.data.issued_at,
      linkRevision: currentSession.data.link_revision,
    },
  );
  assert.equal(revoked.ok, false);

  const legacyAccount = {
    account_status: "active",
    booker_id: null,
    company_id: null,
    customer_account_reference: accountReference,
    safe_display_label: "Legacy account",
    updated_at: oldRevision,
  };
  const identityConversion = ensureClient(legacyAccount);
  const converted = await harness.accessAccount.ensureAdminCustomerPortalAccessAccount(
    {
      bookerId: 55,
      companyId: 7,
      customerAccountReference: accountReference,
      safeDisplayLabel: "William Booker",
    },
    {
      actor_label: "Admin Dispatch",
      actor_role: "admin",
      source_surface: "admin_api",
    },
    identityConversion.client,
  );

  assert.equal(converted.ok, true);
  assert.equal(converted.data.booker_id, 55);
  assert.equal(converted.data.company_id, 7);
  assert.equal(identityConversion.state.upserts.length, 1);
  assert.equal(identityConversion.state.upserts[0].options.onConflict, "customer_account_reference");
  assert.equal(identityConversion.state.upserts[0].payload.customer_account_reference, accountReference);
} finally {
  process.env = originalEnv;
  await harness.cleanup();
}

console.log("Customer portal permanent-link revision runtime guard passed.");
