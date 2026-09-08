import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
import { createClient as createRealClient } from "@supabase/supabase-js";

// Execute the established server helper with an in-memory database. No network,
// credentials, Production records or provider sends are used by this test.
const require = createRequire(import.meta.url);
const tables = new Map();
const accesses = [];
let forcedQueryError = null;
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
      contains(key, input) {
        const values = typeof input === "string" ? JSON.parse(input) : input;
        const realQuery = createRealClient("https://test.invalid.example.supabase.co", "fixture-only")
          .from(name).select("principal_id").contains(key, input);
        assert.equal(new URL(realQuery.url).searchParams.get(key), `cs.${JSON.stringify(values)}`, "Actual SDK must serialize JSONB object-array filters correctly");
        filters.push((row) => values.every((value) => (row[key] || []).some((entry) => Object.entries(value).every(([k, v]) => entry[k] === v))));
        return query;
      },
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
          if (forcedQueryError?.name === name && forcedQueryError.operation === operation) {
            return Promise.resolve({ data: null, error: { message: "Simulated query failure" } }).then(resolve, reject);
          }
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
const invite = async (role, travelerId) => {
  const result = await api.issueCustomerPrincipalInvitation({ principalRole: role, memberships: [{
    companyId: 11, bookerId: 21, travelerId, customerAccountReference: "101", verifiedBossName: "Display only",
  }] }, actor);
  assert.equal(result.ok, true, `Saved-identity invitation must need no email: ${result.error}`);
  return { ...result.data, token: result.data.invitation_url_path && new URL(result.data.invitation_url_path, "https://example.test").searchParams.get("invite") };
};
// Same display name is a review cue only, never an identity lookup.
rows("travelers").push({ id: 33, company_id: 11, booker_id: 21, traveler_name: " boss   31 " });
const duplicateInput = { principalRole: "boss", memberships: [{ companyId: 11, bookerId: 21, travelerId: 31, customerAccountReference: "101", verifiedBossName: "ignored" }] };
const beforeReview = JSON.stringify([...tables]);
const duplicateReview = await api.issueCustomerPrincipalInvitation(duplicateInput, actor);
assert.equal(duplicateReview.ok, false, "Duplicate Boss name must request Admin review before any write");
assert.equal(duplicateReview.status, 409);
assert.ok(duplicateReview.bossReview.key);
assert.equal(duplicateReview.bossReview.selectedTravelerId, 31);
assert.equal(JSON.stringify([...tables]), beforeReview);
assert.equal((await api.issueCustomerPrincipalInvitation({ ...duplicateInput, bossReviewKey: "stale" }, actor)).ok, false);
const reviewedDuplicate = await api.issueCustomerPrincipalInvitation({ ...duplicateInput, bossReviewKey: duplicateReview.bossReview.key }, actor);
assert.equal(reviewedDuplicate.ok, true);
const selectedInvitation = rows("customer_access_invitations").at(-1);
assert.equal(selectedInvitation.membership_scope[0].traveler_id, 31);
assert.equal(rows("customer_access_principals").length, 1, "Review never merges or creates the other Boss");
// Reset only this local fixture before the independent invitation tests.
rows("customer_access_principals").length = 0;
rows("customer_access_invitations").length = 0;
rows("travelers").splice(rows("travelers").findIndex(row => row.id === 33), 1);
console.log("Duplicate names require exact Admin review without guessing identity.");
rows("bookers")[0].email = null;
const pa = await invite("pa", null);
const bossA = await invite("boss", 31);
const bossB = await invite("boss", 32);
assert.equal(rows("customer_access_principals").length, 3);
assert.ok(rows("customer_access_principals").every((row) => row.normalized_email === null));
assert.equal(new Set(rows("customer_access_principals").map((row) => row.invitation_identity_key)).size, 3);
const sameBoss = await invite("boss", 31);
assert.equal(sameBoss.principal_id, bossA.principal_id, "Reissuing before setup reuses saved traveller identity");
assert.equal(rows("customer_access_principals").length, 3);
const cookies = [];
for (const [index, invitation] of [pa, bossA, bossB].entries()) {
  const result = await api.completeCustomerPrincipalActivation({
    invitation: invitation.token, pin: "123456", installationId: `local-installation-${index}`,
  });
  assert.equal(result.ok, true, `Valid invitation must activate with PIN only: ${result.error}`);
  const principal = rows("customer_access_principals").find((row) => row.id === invitation.principal_id);
  assert.equal(principal.email_verified_at ?? null, null);
  assert.ok(principal.invitation_verified_at);
  assert.ok(await api.verifyCustomerPin("123456", principal.pin_hash));
  const devicesBeforeLogin = JSON.stringify(rows("customer_access_devices"));
  const pinOnlyResult = await api.customerPrincipalPinLogin({ pin: "123456", installationId: `local-installation-${index}`, ipKey: "bound-pin-fixture" });
  assert.equal(pinOnlyResult.ok, true, `Existing bound invited customer PIN login must not require email: ${pinOnlyResult.error}`);
  assert.equal(pinOnlyResult.data.device_id, result.data.device_id);
  assert.equal(JSON.stringify(rows("customer_access_devices")), devicesBeforeLogin, "Returning PIN login must not enroll, reactivate or change a device");
  const pinToken = decodeURIComponent(pinOnlyResult.data.cookie.split(";")[0].split("=").slice(1).join("="));
  const pinAccess = await api.assertActiveCustomerPrincipalSession(pinToken);
  assert.equal(pinAccess.ok, true);
  assert.equal(pinAccess.data.principal_id, invitation.principal_id);
  assert.equal(pinAccess.data.memberships[0].traveler_id, index === 0 ? null : index === 1 ? 31 : 32);
  const beforeReplay = JSON.stringify([...tables]);
  const replay = await api.completeCustomerPrincipalActivation({ invitation: invitation.token, pin: "654321", installationId: "different-installation" });
  assert.equal(replay.ok, false);
  assert.equal(JSON.stringify([...tables]), beforeReplay, "Replay must not change saved access");
  const token = decodeURIComponent(result.data.cookie.split(";")[0].split("=").slice(1).join("="));
  cookies.push(token);
  const access = await api.assertActiveCustomerPrincipalSession(token);
  assert.equal(access.ok, true, `Email-free activated session must open bookings: ${access.error}`);
  assert.equal(access.data.normalized_email, null);
  assert.equal(access.data.memberships.length, 1);
  assert.equal(access.data.memberships[0].traveler_id, index === 0 ? null : index === 1 ? 31 : 32);
}
assert.equal(rows("customer_access_accounts").length, 1);
assert.equal((await invite("pa", null)).access_status, "access_updated");
const beforeExisting = JSON.stringify([...tables]);
const existingBoss = await invite("boss", 31);
assert.equal(existingBoss.access_status, "access_updated");
assert.equal(existingBoss.invitation_url_path, "/my-bookings");
assert.equal(JSON.stringify([...tables]), beforeExisting, "Active Boss access must copy a continuation without revoking or resetting credentials");
assert.equal(accesses.some(({ name }) => name === "customer_access_email_challenges"), false);
// Persisted same-device session can be read again without an email/OTP; corrupted scope cannot.
assert.equal((await api.assertActiveCustomerPrincipalSession(cookies[1])).ok, true);
const aPrincipal = rows("customer_access_principals").find((row) => row.id === bossA.principal_id);
aPrincipal.invitation_identity_key = "boss:11:21:32";
assert.equal((await api.assertActiveCustomerPrincipalSession(cookies[1])).ok, false);
aPrincipal.invitation_identity_key = "boss:11:21:31";
console.log("No-email PA/Boss A/Boss B issuance, PIN setup, session reads and exact identity guards passed.");

// Returning native PIN login uses only the persisted device binding, never supplied identity.
const pinLogin = (extra = {}) => api.customerPrincipalPinLogin({ pin: "123456", installationId: "local-installation-0", ipKey: "pin-negative-fixture", ...extra });
const paDevice = rows("customer_access_devices").find((row) => row.principal_id === pa.principal_id);
const paPrincipal = rows("customer_access_principals").find((row) => row.id === pa.principal_id);
const sessionCount = () => rows("customer_access_device_sessions").length;
const assertRejectedWithoutWrites = async (input) => {
  const before = JSON.stringify([...tables]);
  assert.equal((await pinLogin(input)).ok, false);
  assert.equal(JSON.stringify([...tables]), before);
};
await assertRejectedWithoutWrites({ installationId: "unknown-installation-1234" });
await assertRejectedWithoutWrites({ installationId: "short" });
await assertRejectedWithoutWrites({ email: "not-an-email" });
paDevice.device_status = "revoked";
await assertRejectedWithoutWrites({});
paDevice.device_status = "active";
paPrincipal.principal_status = "revoked";
await assertRejectedWithoutWrites({});
paPrincipal.principal_status = "active";
rows("customer_access_devices").push({ ...paDevice, id: randomUUID() });
await assertRejectedWithoutWrites({});
rows("customer_access_devices").pop();
const injected = await pinLogin({ principalId: bossA.principal_id, companyId: 999, bookerId: 999, travelerId: 32 });
assert.equal(injected.ok, true);
const injectedToken = decodeURIComponent(injected.data.cookie.split(";")[0].split("=").slice(1).join("="));
const injectedSession = await api.assertActiveCustomerPrincipalSession(injectedToken);
assert.equal(injectedSession.data.principal_id, pa.principal_id);
assert.equal(injectedSession.data.memberships[0].traveler_id, null);
assert.equal(injectedSession.data.memberships[0].booker_id, 21);
const sessionsBeforeWrongPin = sessionCount();
for (let attempt = 1; attempt <= 5; attempt += 1) {
  const result = await pinLogin({ pin: "654321", principalId: bossA.principal_id });
  assert.equal(result.ok, false);
  assert.equal(result.status, attempt < 5 ? 403 : 429);
}
assert.equal((await pinLogin()).status, 429, "Correct PIN cannot bypass the existing active lockout");
assert.equal(sessionCount(), sessionsBeforeWrongPin);
rows("customer_access_pin_attempts").length = 0;
for (const name of ["customer_access_devices", "customer_access_principals", "customer_access_pin_attempts"]) {
  forcedQueryError = { name, operation: "read" };
  await assertRejectedWithoutWrites({});
}
forcedQueryError = { name: "customer_access_pin_attempts", operation: "insert" };
await assertRejectedWithoutWrites({ pin: "654321" });
forcedQueryError = { name: "customer_access_device_sessions", operation: "insert" };
await assertRejectedWithoutWrites({});
forcedQueryError = null;
assert.equal((await pinLogin({ pin: "654321" })).status, 403);
forcedQueryError = { name: "customer_access_pin_attempts", operation: "update" };
await assertRejectedWithoutWrites({});
forcedQueryError = null;
assert.equal((await pinLogin()).ok, true, "A valid unlocked PIN can return after database recovery");
assert.equal(rows("customer_access_pin_attempts")[0].failure_count, 0);
console.log("Bound-device PIN-only login, exact PA/Boss scope, unknown/revoked devices, lockout and database failures passed.");

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
assert.equal(issued.at(-1).email, undefined);
assert.equal(issued.at(-1).principalRole, "pa");
assert.equal(issued.at(-1).memberships[0].travelerId, null);
assert.equal((await post({ accessRecipient: "boss", bossEmail: "a@example.test", bossTravelerId: 31, memberships: [{ travelerId: 32 }] })).status, 200);
assert.equal(issued.at(-1).principalRole, "boss");
assert.equal(issued.at(-1).email, undefined, "Even a supplied Boss email is ignored");
assert.equal(issued.at(-1).memberships[0].travelerId, 31);
assert.equal(issued.at(-1).memberships.length, 1);
assert.equal(ensureCalls, 1, "Boss invitation reuses the same existing access account");
assert.equal((await post({ accessRecipient: "everyone" })).status, 400);
console.log("Existing Admin PA/Boss invitation route and invalid-scope guards passed.");

// Expired, revoked and tampered invitations fail without creating access.
for (const [index, failure] of ["expired", "revoked", "tampered"].entries()) {
  rows("travelers").push({ id: 40 + index, company_id: 11, booker_id: 21, traveler_name: `Separate test Boss ${40 + index}` });
  const invitation = await invite("boss", 40 + index);
  const savedInvite = rows("customer_access_invitations").find((row) => row.principal_id === invitation.principal_id);
  if (failure === "expired") savedInvite.expires_at = "2000-01-01T00:00:00.000Z";
  if (failure === "revoked") savedInvite.revoked_at = new Date().toISOString();
  const before = JSON.stringify([...tables]);
  const result = await api.completeCustomerPrincipalActivation({ invitation: invitation.token + (failure === "tampered" ? "x" : ""), pin: "123456", installationId: `local-${failure}-installation` });
  assert.equal(result.ok, false, failure);
  assert.equal(JSON.stringify([...tables]), before, `${failure} must not write`);
}
rows("travelers").push({ id: 43, company_id: 11, booker_id: 21, traveler_name: "Separate test Boss 43" });
const concurrent = await invite("boss", 43);
const competing = await invite("boss", 43);
const outcomes = await Promise.all([concurrent, competing].map((invitation, index) =>
  api.completeCustomerPrincipalActivation({ invitation: invitation.token, pin: index ? "654321" : "123456", installationId: `concurrent-device-${index}` })));
assert.equal(outcomes.filter((outcome) => outcome.ok).length, 1, "Only one competing invitation can activate the principal");
assert.equal(rows("customer_access_devices").filter((row) => row.principal_id === concurrent.principal_id).length, 1);
console.log("Expired, revoked, tampered, saved identity and concurrent activation guards passed.");

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
answers.push("BOSS");
await copyContext.copyAccess();
assert.equal(copyRequests[1].accessRecipient, "boss");
assert.equal(copyRequests[1].bossTravelerId, 31);
assert.equal(copyRequests[1].bossEmail, undefined);
assert.doesNotMatch(copySource, /bossEmail|[Ee]mail/);
copyContext.customerDriverDetailsPortalTravelerId = null;
answers.push("BOSS");
await assert.rejects(copyContext.copyAccess(), /Select and save this booking's traveller/);
assert.equal(copyRequests.length, 2);
copyContext.customerDriverDetailsPortalTravelerId = 31;
copyContext.fetch = async () => ({ ok: true, json: async () => ({ ok: true, accessStatus: "access_updated", url: "https://example.test/my-bookings" }) });
answers.push("BOSS");
assert.equal((await copyContext.copyAccess()).portalUrl, "https://example.test/my-bookings");
const copyActiveBranch = appSource.slice(appSource.indexOf("if (accessResult.accessUpdated)"), appSource.indexOf("const portalUrl = accessResult.portalUrl;"));
assert.match(copyActiveBranch, /await navigator.clipboard.writeText\(accessResult.portalUrl\)/);
assert.match(copyActiveBranch, /portalLinkCopied: true/);
let reviewAccepted = false;
let reviewCalls = 0;
copyContext.window.confirm = () => reviewAccepted;
copyContext.fetch = async (_url, options) => {
  reviewCalls++;
  const body = JSON.parse(options.body);
  return body.bossReviewKey === "exact-selection-review" ?
    { ok: true, json: async () => ({ ok: true, accessStatus: "invitation_created", url: "https://example.test/invite" }) } :
    { ok: false, json: async () => ({ ok: false, bossReview: { key: "exact-selection-review", name: "Same Boss", selectedTravelerId: 31 } }) };
};
answers.push("BOSS");
assert.equal(await copyContext.copyAccess(), null, "Declining duplicate-name review must stop");
assert.equal(reviewCalls, 1);
reviewAccepted = true;
answers.push("BOSS");
assert.equal((await copyContext.copyAccess()).portalUrl, "https://example.test/invite");
assert.equal(reviewCalls, 3, "Only confirmed review continues the same invitation action");
console.log("Existing Copy + App Link PA/Boss selection, saved-traveller, active-access clipboard and cancellation passed.");

rows("travelers").push({ id: 44, company_id: 11, booker_id: 21, traveler_name: "Separate test Boss 44" });
const revokedPrincipalInvite = await invite("boss", 44);
const revokedPrincipal = rows("customer_access_principals").find((row) => row.id === revokedPrincipalInvite.principal_id);
revokedPrincipal.principal_status = "revoked";
revokedPrincipal.revoked_at = "2020-01-02T00:00:00.000Z";
rows("customer_access_invitations").find((row) => row.principal_id === revokedPrincipalInvite.principal_id).created_at = "2020-01-01T00:00:00.000Z";
const beforeRevoked = JSON.stringify([...tables]);
assert.equal((await api.completeCustomerPrincipalActivation({ invitation: revokedPrincipalInvite.token, pin: "123456", installationId: "reissued-local-installation" })).ok, false);
assert.equal(JSON.stringify([...tables]), beforeRevoked, "Pre-revocation invitation cannot reactivate access");
const reissued = await invite("boss", 44);
assert.equal((await api.completeCustomerPrincipalActivation({ invitation: reissued.token, pin: "123456", installationId: "reissued-local-installation" })).ok, true, "Explicit new invitation after revocation retains the existing reissue lane");
const beforeAdminRecovery = await api.customerPrincipalPinLogin({ pin: "123456", installationId: "reissued-local-installation", ipKey: "admin-recovery-fixture" });
assert.equal(beforeAdminRecovery.ok, true);
const oldRecoverySessionToken = decodeURIComponent(beforeAdminRecovery.data.cookie.split(";")[0].split("=").slice(1).join("="));
const accountCountBeforeRecovery = rows("customer_access_accounts").length;
assert.equal((await api.revokeCustomerPrincipalAccess({ principalId: reissued.principal_id }, actor)).ok, true);
assert.equal((await api.assertActiveCustomerPrincipalSession(oldRecoverySessionToken)).ok, false);
assert.equal((await api.customerPrincipalPinLogin({ pin: "123456", installationId: "reissued-local-installation" })).ok, false);
// A fresh invitation must be strictly later than the explicit revocation.
await new Promise((resolve) => setTimeout(resolve, 5));
const recoveryInvitation = await invite("boss", 44);
assert.equal(recoveryInvitation.principal_id, reissued.principal_id);
assert.equal((await api.completeCustomerPrincipalActivation({ invitation: recoveryInvitation.token, pin: "654321", installationId: "reissued-local-installation" })).ok, true);
assert.equal((await api.customerPrincipalPinLogin({ pin: "123456", installationId: "reissued-local-installation", ipKey: "admin-recovery-fixture" })).ok, false, "Old PIN must stop working after the customer chooses a new PIN");
const recovered = await api.customerPrincipalPinLogin({ pin: "654321", installationId: "reissued-local-installation", ipKey: "admin-recovery-fixture" });
assert.equal(recovered.ok, true);
const recoveredToken = decodeURIComponent(recovered.data.cookie.split(";")[0].split("=").slice(1).join("="));
const recoveredAccess = await api.assertActiveCustomerPrincipalSession(recoveredToken);
assert.equal(recoveredAccess.data.principal_id, reissued.principal_id);
assert.equal(recoveredAccess.data.memberships[0].company_id, 11);
assert.equal(recoveredAccess.data.memberships[0].booker_id, 21);
assert.equal(recoveredAccess.data.memberships[0].traveler_id, 44);
assert.equal(rows("customer_access_accounts").length, accountCountBeforeRecovery);
console.log("Explicit reissue after revocation retains its existing guarded activation lane.");

// Earlier email-based principals remain the same people, found by saved membership.
const legacy = { id: randomUUID(), normalized_email: "existing@example.test", principal_role: "pa", principal_status: "active", pin_hash: await api.hashCustomerPin("123456") };
rows("customer_access_principals").push(legacy);
rows("customer_access_accounts").push({ customer_account_reference: "102", company_id: 12, booker_id: 22, account_status: "active" });
rows("bookers").push({ id: 22, company_id: 12, customer_id: 102, booker_name: "PA", email: null });
rows("customer_access_memberships").push({ principal_id: legacy.id, company_id: 12, booker_id: 22, customer_account_reference: "102", traveler_id: null, membership_role: "managing_pa", membership_status: "active", verified_boss_name: "PA" });
const legacyInput = { principalRole: "pa", memberships: [{ companyId: 12, bookerId: 22, customerAccountReference: "102", travelerId: null, verifiedBossName: "Display only" }] };
const legacyBefore = JSON.stringify(rows("customer_access_principals"));
const reusedLegacy = await api.issueCustomerPrincipalInvitation(legacyInput, actor);
assert.equal(reusedLegacy.ok, true, reusedLegacy.error);
assert.equal(reusedLegacy.data.principal_id, legacy.id);
assert.equal(reusedLegacy.data.access_status, "access_updated");
assert.equal(JSON.stringify(rows("customer_access_principals")), legacyBefore, "Existing credentials must not be rewritten");
assert.equal((await api.customerPrincipalPinLogin({ email: legacy.normalized_email, pin: "123456", installationId: "legacy-new-device" })).status, 428, "Existing non-invitation email new-device sign-in stays intact");
const duplicate = { ...legacy, id: randomUUID(), normalized_email: "duplicate@example.test" };
rows("customer_access_principals").push(duplicate);
rows("customer_access_memberships").push({ ...rows("customer_access_memberships").at(-1), principal_id: duplicate.id });
const beforeAmbiguous = JSON.stringify([...tables]);
assert.equal((await api.issueCustomerPrincipalInvitation(legacyInput, actor)).status, 409);
assert.equal(JSON.stringify([...tables]), beforeAmbiguous);
console.log("Existing PA credentials reused by exact saved scope; ambiguous identities and non-invitation sign-in preserved.");

const identityMigration = readFileSync("supabase/migrations/20260908035346_customer_invitation_saved_identity.sql", "utf8");
assert.match(identityMigration, /alter column normalized_email drop not null/);
assert.match(identityMigration, /unique \(invitation_identity_key\)/);
assert.match(identityMigration, /normalized_email is not null or invitation_identity_key is not null/);
assert.doesNotMatch(identityMigration, /public\.(?:bookings|customer_invoice|customer_access_accounts|customer_access_memberships)|\b(?:insert|update|delete|grant|revoke)\b/i);
console.log("Nullable email and unique saved identity migration stays within the principal table.");

// Owner lock: same company + a different booker is another account/profile,
// regardless of identical or similar Boss names.
rows("customer_access_accounts").push({ customer_account_reference: "103", company_id: 11, booker_id: 23, account_status: "active" });
rows("bookers").push({ id: 23, company_id: 11, customer_id: 103, booker_name: "Other PA", email: null });
rows("travelers").push({ id: 51, company_id: 11, booker_id: 23, traveler_name: "Boss 31" });
const otherBooker = await api.issueCustomerPrincipalInvitation({ principalRole: "boss", memberships: [{ companyId: 11, bookerId: 23, customerAccountReference: "103", travelerId: 51, verifiedBossName: "ignored" }] }, actor);
assert.equal(otherBooker.ok, true, "Same Boss name under another Booker requires no duplicate-name review");
assert.notEqual(otherBooker.data.principal_id, bossA.principal_id);
const otherScope = rows("customer_access_invitations").at(-1).membership_scope[0];
assert.deepEqual([otherScope.company_id, otherScope.booker_id, otherScope.customer_account_reference, otherScope.traveler_id], [11, 23, "103", 51]);
assert.equal(rows("customer_access_accounts").filter(row => row.company_id === 11).length, 2);
assert.match(readFileSync("AGENTS.md", "utf8"), /same Company with a different Booker is a separate account\/profile/);
console.log("Same Company with different Booker stays a separate account despite identical Boss names.");
