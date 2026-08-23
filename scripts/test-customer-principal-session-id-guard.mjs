import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const access = read("lib/customer-principal-access.ts");
const route = read("app/api/customer-principal-access/route.ts");
const preactivation = read("scripts/test-preactivation-verification-suite.mjs");

const createSessionMatch = access.match(
  /async function createSessionForExistingDevice\([\s\S]*?\n}\n\nexport async function completeCustomerPrincipalActivation/,
);
assert.ok(createSessionMatch, "established Customer principal session helper must remain present");
const createSession = createSessionMatch[0];

assert.match(createSession, /const sessionId = randomUUID\(\)/);
assert.match(createSession, /session_id: sessionId/);
assert.match(
  createSession,
  /\.from\(sessionTable\)\.insert\(\{[\s\S]*?\bid:\s*sessionId,[\s\S]*?session_token_hash:\s*hashSecret\(token\)/,
  "the signed session_id must be persisted as the exact database row id",
);

assert.match(
  access,
  /\.eq\("id", session\.session_id\)\.eq\("session_token_hash", tokenHash\)/,
  "authenticated principal reads must resolve the exact signed session row and token hash",
);
assert.match(route, /assertActiveCustomerPrincipalSession\(token\)/);
assert.match(route, /principal_role: result\.data\.principal_role/);
assert.match(preactivation, /scripts\/test-customer-principal-session-id-guard\.mjs/);

const signedSessionId = "00000000-0000-4000-8000-000000000123";
const persistedRows = new Map();
const sourcePersistsExactId = /\bid:\s*sessionId,/.test(createSession);
const insertedId = sourcePersistsExactId
  ? signedSessionId
  : "00000000-0000-4000-8000-000000000999";
persistedRows.set(insertedId, {
  principal_role: "pa",
  session_status: "active",
  session_token_hash: "bounded-token-hash",
});

const authenticatedPrincipalGet = persistedRows.get(signedSessionId);
assert.ok(
  authenticatedPrincipalGet,
  "the session row must be addressable by the session_id carried in the signed cookie",
);
assert.equal(authenticatedPrincipalGet.session_status, "active");
assert.equal(authenticatedPrincipalGet.principal_role, "pa");
assert.equal(authenticatedPrincipalGet.session_token_hash, "bounded-token-hash");

console.log("Customer principal session ID guard passed.");
