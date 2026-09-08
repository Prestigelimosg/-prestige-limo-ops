import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";

// Execute the established server helper with an in-memory database. No network,
// credentials, Production records or provider sends are used by this test.
const require = createRequire(import.meta.url);
const tables = new Map();
const accesses = [];
const rows = (name) => {
  if (!tables.has(name)) tables.set(name, []);
  return tables.get(name);
};
const client = {
  from(name) {
    let operation = "read", payload, one = false, maximum = Infinity;
    const filters = [];
    const query = {
      select() { return query; },
      eq(key, value) { filters.push((row) => row[key] === value); return query; },
      is(key, value) { filters.push((row) => (row[key] ?? null) === value); return query; },
      gt(key, value) { filters.push((row) => row[key] > value); return query; },
      in(key, values) { filters.push((row) => values.includes(row[key])); return query; },
      limit(value) { maximum = value; return query; },
      order() { return query; },
      insert(value) { operation = "insert"; payload = value; return query; },
      upsert(value) { operation = "upsert"; payload = value; return query; },
      update(value) { operation = "update"; payload = value; return query; },
      single() { one = true; return query; },
      maybeSingle() { one = true; return query; },
      then(resolve, reject) {
        try {
          accesses.push({ name, operation });
          let result = rows(name).filter((row) => filters.every((filter) => filter(row))).slice(0, maximum);
          if (operation === "insert" || operation === "upsert") {
            result = (Array.isArray(payload) ? payload : [payload]).map((value) => {
              const existing = operation === "upsert" && rows(name).find((row) =>
                row.principal_id === value.principal_id && row.company_id === value.company_id &&
                row.booker_id === value.booker_id && row.traveler_id === value.traveler_id);
              if (existing) return Object.assign(existing, value);
              const row = { id: randomUUID(), created_at: new Date().toISOString(), ...value };
              rows(name).push(row);
              return row;
            });
          } else if (operation === "update") {
            result.forEach((row) => Object.assign(row, payload));
          }
          return Promise.resolve({ data: structuredClone(one ? result[0] || null : result), error: null }).then(resolve, reject);
        } catch (error) { return Promise.reject(error).then(resolve, reject); }
      },
    };
    return query;
  },
  rpc() { throw new Error("Invitation activation must not request an email challenge"); },
};
const source = readFileSync("lib/customer-principal-access.ts", "utf8");
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  module, exports: module.exports, Buffer, URL, Date,
  process: { env: {
    SUPABASE_URL: "https://test.invalid.example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "local-fixture-service-role-key-only",
    PRESTIGE_CUSTOMER_PRINCIPAL_INVITATION_SECRET: "local-fixture-invitation-secret-only",
    PRESTIGE_CUSTOMER_PRINCIPAL_SESSION_SECRET: "local-fixture-session-secret-only",
  } },
  require: (id) => id === "server-only" ? {} : id === "@supabase/supabase-js" ? { createClient: () => client } : require(id),
  fetch: () => { throw new Error("No email or network request is allowed"); },
});
const api = module.exports;
const actor = { actor_role: "admin", source_surface: "admin_api", actor_label: "Local invitation regression" };
rows("customer_access_accounts").push({ customer_account_reference: "101", company_id: 11, booker_id: 21, account_status: "active" });
rows("bookers").push({ id: 21, company_id: 11, customer_id: 101, booker_name: "PA", email: "pa@example.test" });
rows("travelers").push(...[31, 32].map((id) => ({ id, company_id: 11, booker_id: 21, traveler_name: `Boss ${id}` })));
const invite = async (role, travelerId, email) => {
  const result = await api.issueCustomerPrincipalInvitation({ email, principalRole: role, memberships: [{
    companyId: 11, bookerId: 21, travelerId, customerAccountReference: "101", verifiedBossName: "Must be re-read",
  }] }, actor);
  assert.equal(result.ok, true, result.error);
  return { ...result.data, token: result.data.invitation_url_path && new URL(result.data.invitation_url_path, "https://example.test").searchParams.get("invite") };
};
const pa = await invite("pa", null, "pa@example.test");
const bossA = await invite("boss", 31, "a@example.test");
const bossB = await invite("boss", 32, "b@example.test");
const pendingBefore = JSON.stringify([...tables]);
const wrongBossEmail = await api.issueCustomerPrincipalInvitation({ email: "a@example.test", principalRole: "boss", memberships: [{
  companyId: 11, bookerId: 21, travelerId: 32, customerAccountReference: "101", verifiedBossName: "Boss 32",
}] }, actor);
assert.equal(wrongBossEmail.ok, false, "Boss A email cannot also receive a pending Boss B invitation");
assert.equal(JSON.stringify([...tables]), pendingBefore);

for (const [index, invitation] of [pa, bossA, bossB].entries()) {
  const result = await api.completeCustomerPrincipalActivation({
    invitation: invitation.token, pin: "123456", installationId: `local-installation-${index}`,
  });
  assert.equal(result.ok, true, `Valid invitation must activate with PIN only: ${result.error}`);
  const principal = rows("customer_access_principals").find((row) => row.id === invitation.principal_id);
  assert.equal(principal.email_verified_at ?? null, null, "Invitation possession must not fabricate email verification");
  assert.ok(principal.invitation_verified_at);
  assert.ok(await api.verifyCustomerPin("123456", principal.pin_hash));
  const beforeReplay = JSON.stringify([...tables]);
  const replay = await api.completeCustomerPrincipalActivation({ invitation: invitation.token, pin: "654321", installationId: "different-installation" });
  assert.equal(replay.ok, false, "Used invitations cannot create another device or reset PIN");
  assert.equal(JSON.stringify([...tables]), beforeReplay, "Replay must not change saved access");
}
assert.equal(rows("customer_access_accounts").length, 1, "PA and Bosses share one Company + Booker account");
assert.equal(rows("customer_access_memberships").find((row) => row.principal_id === pa.principal_id).traveler_id, null);
assert.deepEqual(rows("customer_access_memberships").filter((row) => row.membership_role === "boss").map((row) => row.traveler_id).sort(), [31, 32]);
const refreshedPa = await invite("pa", null, "pa@example.test");
assert.equal(refreshedPa.access_status, "access_updated");
assert.equal(refreshedPa.token, null);
const newDevice = await api.customerPrincipalPinLogin({ email: "a@example.test", pin: "123456", installationId: "new-boss-installation" });
assert.equal(newDevice.status, 428, "Non-invitation new-device sign-in still requires email verification");
assert.equal(accesses.some(({ name }) => name === "customer_access_email_challenges"), false, "Invitation activation never reads or writes email challenges");
console.log("Invited PIN activation, separate Boss scopes, PA root, replay and new-device email guards passed.");

// Invalid CRM relationships and browser-supplied scope cannot grant access.
const beforeInvalid = JSON.stringify([...tables]);
const badScope = await api.issueCustomerPrincipalInvitation({ email: "wrong@example.test", principalRole: "boss", memberships: [{
  companyId: 11, bookerId: 21, travelerId: 999, customerAccountReference: "101", verifiedBossName: "Boss 31",
}] }, actor);
assert.equal(badScope.ok, false);
assert.equal(JSON.stringify([...tables]), beforeInvalid);
const missingInvite = await api.completeCustomerPrincipalActivation({ pin: "123456", installationId: "another-installation", companyId: 11, bookerId: 21 });
assert.equal(missingInvite.ok, false);
assert.equal(JSON.stringify([...tables]), beforeInvalid);

// Execute the existing Admin route: PA remains server-verified; Boss uses one
// explicitly chosen traveller, never a browser-supplied membership array/name.
const issued = [];
let ensureCalls = 0;
const routeModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync("app/api/admin-customer-portal-access-links/route.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  module: routeModule, exports: routeModule.exports, Response, URL,
  require: (id) => {
    if (id.endsWith("admin-customer-invoice-boundary")) return { resolveAdminCustomerInvoiceBoundary: () => ({ ok: true, actor }) };
    if (id.endsWith("admin-bookers")) return { findAdminBooker: async () => ({ ok: true, data: rows("bookers")[0] }) };
    if (id.endsWith("customer-portal-access-account")) return { ensureAdminCustomerPortalAccessAccount: async () => { ensureCalls++; return { ok: true, data: rows("customer_access_accounts")[0] }; } };
    if (id.endsWith("customer-principal-access")) return { issueCustomerPrincipalInvitation: async (input) => { issued.push(input); return { ok: true, data: { access_status: "invitation_created", invitation_url_path: "/customer-access/activate?invite=local-fixture" } }; } };
    throw new Error(id);
  },
});
const post = async (extra) => routeModule.exports.POST(new Request("https://example.test/api/admin-customer-portal-access-links", {
  method: "POST", body: JSON.stringify({ companyId: 11, bookerId: 21, customerAccountReference: "101", ...extra }),
}));
assert.equal((await post({ email: "spoof@example.test", principalRole: "boss", memberships: [{}] })).status, 200);
assert.equal(issued.at(-1).email, "pa@example.test");
assert.equal(issued.at(-1).principalRole, "pa");
assert.equal(issued.at(-1).memberships[0].travelerId, null);
assert.equal((await post({ accessRecipient: "boss", bossEmail: "a@example.test", bossTravelerId: 31, memberships: [{ travelerId: 32 }] })).status, 200);
assert.equal(issued.at(-1).principalRole, "boss");
assert.equal(issued.at(-1).memberships[0].travelerId, 31);
assert.equal(issued.at(-1).memberships.length, 1);
assert.equal(ensureCalls, 1, "Boss invitation reuses the same existing access account");
assert.equal((await post({ accessRecipient: "everyone" })).status, 400);
console.log("Existing Admin PA/Boss invitation route and invalid-scope guards passed.");

// Expired, revoked and tampered invitations fail without creating access.
for (const failure of ["expired", "revoked", "tampered"]) {
  const invitation = await invite("boss", 31, `${failure}@example.test`);
  const savedInvite = rows("customer_access_invitations").find((row) => row.principal_id === invitation.principal_id);
  if (failure === "expired") savedInvite.expires_at = "2000-01-01T00:00:00.000Z";
  if (failure === "revoked") savedInvite.revoked_at = new Date().toISOString();
  const before = JSON.stringify([...tables]);
  const result = await api.completeCustomerPrincipalActivation({ invitation: invitation.token + (failure === "tampered" ? "x" : ""), pin: "123456", installationId: `local-${failure}-installation` });
  assert.equal(result.ok, false, failure);
  assert.equal(JSON.stringify([...tables]), before, `${failure} must not write`);
}
const concurrent = await invite("boss", 31, "concurrent@example.test");
const competing = await invite("boss", 31, "concurrent@example.test");
const outcomes = await Promise.all([concurrent, competing].map((invitation, index) =>
  api.completeCustomerPrincipalActivation({ invitation: invitation.token, pin: index ? "654321" : "123456", installationId: `concurrent-device-${index}` })));
assert.equal(outcomes.filter((outcome) => outcome.ok).length, 1, "Only one competing invitation can activate the principal");
assert.equal(rows("customer_access_devices").filter((row) => row.principal_id === concurrent.principal_id).length, 1);
console.log("Expired, revoked, tampered, cross-Boss email and concurrent activation guards passed.");

const migration = readFileSync("supabase/migrations/20260908030112_customer_invited_pin_activation.sql", "utf8");
assert.match(migration, /add column if not exists invitation_verified_at timestamptz/);
assert.match(migration, /pin_hash is not null and \(email_verified_at is not null or invitation_verified_at is not null\)/);
assert.doesNotMatch(migration, /public\.(?:bookings|customer_invoice|customer_access_accounts|customer_access_memberships)|\b(?:insert|update|delete|grant|revoke)\b/i);
const activationSource = source.slice(source.indexOf("export async function completeCustomerPrincipalActivation"), source.indexOf("export function isCustomerPrincipalSessionToken"));
assert.doesNotMatch(activationSource, /email_verified_at:|challengeTable|sendEmailChallenge/);
assert.match(activationSource, /invitation_verified_at: now/);
const appSource = readFileSync("app/page.tsx", "utf8");
const copySource = appSource.slice(appSource.indexOf("async function createCustomerDriverDetailsPortalLink()"), appSource.indexOf("async function createCustomerBookingInvitationLink()"));
assert.match(copySource, /recipient !== "pa" && recipient !== "boss"/);
assert.match(copySource, /if \(!bossTravelerId\) throw new Error/);
assert.match(copySource, /bossTravelerId = customerDriverDetailsPortalTravelerId/);
assert.doesNotMatch(copySource, /booking\.name|invoice|payment|payout/);
console.log("Invitation proof schema and existing Copy + App Link boundaries passed.");

// Exercise the actual existing Copy + App Link handler, including cancellation.
const copyFunction = appSource.slice(appSource.indexOf("  async function createCustomerDriverDetailsPortalLink()"), appSource.indexOf("  async function createCustomerBookingInvitationLink()"));
const copyRequests = [];
const answers = [];
const copyContext = {
  customerDriverDetailsPortalBookingReference: "LOCAL-BOOKING",
  customerDriverDetailsPortalAccountReference: "101",
  customerDriverDetailsPortalCompanyId: 11,
  customerDriverDetailsPortalBookerId: 21,
  customerDriverDetailsPortalTravelerId: 31,
  customerDriverDetailsPortalLinkCopyReady: true,
  customerDriverDetailsPortalSafeDisplayLabel: "Local company",
  adminCustomerPortalAccessLinksApiPath: "/api/admin-customer-portal-access-links",
  adminLegacyDataPurpose: "local-test",
  window: { prompt: () => answers.shift() ?? null },
  fetch: async (_url, options) => { copyRequests.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ ok: true, accessStatus: "invitation_created", url: "https://example.test/customer-access/activate?invite=local-fixture" }) }; },
};
vm.createContext(copyContext);
vm.runInContext(ts.transpileModule(copyFunction + "\nglobalThis.copyAccess = createCustomerDriverDetailsPortalLink;", {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText, copyContext);
answers.push(null);
assert.equal(await copyContext.copyAccess(), null);
assert.equal(copyRequests.length, 0);
answers.push("PA");
await copyContext.copyAccess();
assert.equal(copyRequests[0].bookerId, 21);
assert.equal(copyRequests[0].bossEmail, undefined);
answers.push("BOSS", "a@example.test");
await copyContext.copyAccess();
assert.equal(copyRequests[1].accessRecipient, "boss");
assert.equal(copyRequests[1].bossTravelerId, 31);
assert.equal(copyRequests[1].bossEmail, "a@example.test");
copyContext.customerDriverDetailsPortalTravelerId = null;
answers.push("BOSS");
await assert.rejects(copyContext.copyAccess(), /Select and save this booking's traveller/);
assert.equal(copyRequests.length, 2);
console.log("Existing Copy + App Link PA/Boss selection, saved-traveller and cancellation passed.");

const revokedPrincipalInvite = await invite("boss", 31, "reissued@example.test");
const revokedPrincipal = rows("customer_access_principals").find((row) => row.id === revokedPrincipalInvite.principal_id);
revokedPrincipal.principal_status = "revoked";
revokedPrincipal.revoked_at = "2020-01-02T00:00:00.000Z";
rows("customer_access_invitations").find((row) => row.principal_id === revokedPrincipalInvite.principal_id).created_at = "2020-01-01T00:00:00.000Z";
const beforeRevoked = JSON.stringify([...tables]);
assert.equal((await api.completeCustomerPrincipalActivation({ invitation: revokedPrincipalInvite.token, pin: "123456", installationId: "reissued-local-installation" })).ok, false);
assert.equal(JSON.stringify([...tables]), beforeRevoked, "Pre-revocation invitation cannot reactivate access");
const reissued = await invite("boss", 31, "reissued@example.test");
assert.equal((await api.completeCustomerPrincipalActivation({ invitation: reissued.token, pin: "123456", installationId: "reissued-local-installation" })).ok, true, "Explicit new invitation after revocation retains the existing reissue lane");
console.log("Explicit reissue after revocation retains its existing guarded activation lane.");
