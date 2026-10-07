import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const eventHelperPath = "lib/driver-job-calendar-event.ts";
const googleHelperPath = "lib/driver-google-calendar.ts";
const persistencePath = "lib/admin-driver-job-link-persistence.ts";
const routePath = "app/api/driver-job/[token]/calendar/route.ts";
const callbackPath = "app/api/driver-google-calendar-oauth/callback/route.ts";
const nativeStartPath = "app/api/driver-google-calendar-oauth/native-start/route.ts";
const pagePath = "app/driver-job/[token]/page.tsx";
const migrationPath = "supabase/migrations/20260719214500_driver_google_calendar_connection.sql";
const ledgerPath = "docs/current-implementation-ledger.md";
const suitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardPath = "scripts/test-driver-job-calendar-download-guard.mjs";

const [eventHelper, googleHelper, persistence, route, callback, nativeStart, page, migration, ledger, suite] =
  await Promise.all([
    readFile(eventHelperPath, "utf8"),
    readFile(googleHelperPath, "utf8"),
    readFile(persistencePath, "utf8"),
    readFile(routePath, "utf8"),
    readFile(callbackPath, "utf8"),
    readFile(nativeStartPath, "utf8"),
    readFile(pagePath, "utf8"),
    readFile(migrationPath, "utf8"),
    readFile(ledgerPath, "utf8"),
    readFile(suitePath, "utf8"),
  ]);

// Execute the real ACK callback with an already-open page's stale saved status.
// Replace only network and React setters; no copied acknowledgement logic.
const ackTree = ts.createSourceFile(pagePath, page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let ackNode;
let refreshNode;
function findAck(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "saveAndAcknowledgeJob") ackNode = node;
  if (ts.isVariableDeclaration(node) && node.name.getText(ackTree) === "refreshDriverAppUpdates") refreshNode = node.initializer.arguments[0];
  ts.forEachChild(node, findAck);
}
findAck(ackTree);
assert.ok(ackNode);
const ackRuntime = ts.transpileModule(`${ackNode.getText(ackTree)}\nconst refresh = ${refreshNode.getText(ackTree)};\nreturn {run:saveAndAcknowledgeJob,refresh};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
function ackHarness(options = {}) {
  const details = {name:"QA Driver",contact:"00000000",plate:"QA",vehicleModel:"QA car"};
  const env = {
    accountActivationRequired:false, accountActivationPassed:true, driverDetails:details,
    cleanDriverDetails:v=>v, embeddedDriverApp:true, acknowledged:true, token:"qa-calendar-ack",
    pageState:{kind:"ready",job:{amendmentAckPending:true,acknowledgementRevision:"a".repeat(64)}},
    driverCalendar:{action:"idle",status:"cal_saved",connected:true,feedback:{tone:"success",text:"Old saved feedback"}},
    emptyDriverCalendarState:{action:"idle",status:"unavailable",connected:false,feedback:null},
    loadedDriverJobTokenRef:{current:"qa-calendar-ack"}, driverCalendarActionRevisionRef:{current:0},
    driverAppUpdatesRequestSequenceRef:{current:0}, driverAppUpdatesAbortControllerRef:{current:null},
    driverAmendmentRefreshKeyRef:{current:""}, reportDriverActivity:()=>{},
    currentEmbeddedDriverInstallationId:()=>"qa-installation", driverDeviceAlertReadiness:{ready:false},
    requestEmbeddedNativeNotificationsOnce:()=>false, addActivity:()=>{},
    defaultAcknowledgedDetailsFeedback:{tone:"success",text:"Acknowledged"},
    normalizeBlockedReason:()=>"unavailable", blockedMessages:{unavailable:"ACK failed"},
    ...options,
  };
  for (const key of ["DriverDetails","SavedDriverDetails","DriverDetailsEditorOpen","Acknowledged","DriverCalendar","DriverAppUpdates","StatusFeedback","WorkflowStatus","PageState","DriverPortalEnrolled","DetailsFeedback","SavingDriverDetails"]) {
    const state = key[0].toLowerCase()+key.slice(1);
    env[`set${key}`] = value => { env[state] = typeof value === "function" ? value(env[state]) : value; };
  }
  env.calls=[];
  env.fetch=async (url, init={}) => {
    env.calls.push([init.method || "GET",url]);
    if(url.includes("/notifications")) return {ok:true,json:async()=>({ok:true,notifications:[{id:"qa-amendment",workflow_area:"driver_job_link_delivery"}]})};
    if(!url.endsWith("/calendar") && !init.method) return {ok:true,json:async()=>({ok:true,payload:{...env.pageState.job,acknowledged:true}})};
    if(init.method === "PATCH") return {ok:!env.ackFails,json:async()=>env.ackFails
      ? {ok:false,reason:"unavailable"}
      : {ok:true,payload:{assignedDriver:details,acknowledged:true,amendmentAckPending:false,status:"assigned"}}};
    assert.equal(url,"/api/driver-job/qa-calendar-ack/calendar");
    assert.equal(init.cache,"no-store");
    if(env.duringRead) env.duringRead();
    if(env.readThrows) throw Error("offline");
    return {ok:!env.readFails,json:async()=>env.readFails ? {ok:false} : {ok:true,connected:true,status:env.returnStatus || "update_calendar"}};
  };
  Object.assign(env,new Function("env",`with(env){${ackRuntime}}`)(env));
  return env;
}
const staleAck = ackHarness();
await staleAck.run();
assert.equal(staleAck.driverCalendar.status,"update_calendar","Successful amendment ACK must refresh a stale Calendar saved status without reopening");
assert.equal(staleAck.driverCalendar.feedback,null,"Old saved feedback must not survive the amendment status read");
assert.deepEqual(staleAck.calls,[["PATCH","/api/driver-job/qa-calendar-ack"],["GET","/api/driver-job/qa-calendar-ack/calendar"]],"ACK only reads Calendar; never auto-writes the provider");
for (const options of [{readFails:true},{readThrows:true}]) {
  const h=ackHarness(options); await h.run();
  assert.equal(h.acknowledged,true); assert.ok(h.savedDriverDetails);
  assert.equal(h.detailsFeedback.tone,"success","Calendar read failure must not report the saved ACK as failed");
  assert.equal(h.driverCalendar.status,"unavailable","Failed status read must not preserve a stale saved badge");
  assert.equal(h.driverCalendar.feedback.tone,"error");
}
for (const options of [{ackFails:true},{acknowledged:false},{pageState:{kind:"ready",job:{amendmentAckPending:false}}}]) {
  const h=ackHarness(options); await h.run(); assert.equal(h.calls.length,1,"No new read for failed ACK, first ACK or ordinary details save");
}
for (const mode of ["token","calendarAction"]) {
  const h=ackHarness(); const before=h.driverCalendar;
  h.duringRead=()=>{if(mode==="token")h.loadedDriverJobTokenRef.current="another-job";else h.driverCalendarActionRevisionRef.current++;};
  await h.run(); assert.equal(h.driverCalendar,before,"Late status read cannot overwrite another job or newer Calendar action");
}
const alreadyCurrent=ackHarness({returnStatus:"cal_saved"}); await alreadyCurrent.run();
assert.equal(alreadyCurrent.driverCalendar.status,"cal_saved","Use server status, never assume every amendment changes the event");
const lateBackground=ackHarness();
const normalFetch=lateBackground.fetch;
let releaseOldRead, signalOldRead;
const oldReadStarted=new Promise(resolve=>{signalOldRead=resolve;});
let calendarReads=0;
lateBackground.fetch=async (url,init)=>{
  if(url.endsWith("/calendar") && ++calendarReads===1){
    signalOldRead();
    return new Promise(resolve=>{releaseOldRead=()=>resolve({ok:true,json:async()=>({ok:true,connected:true,status:"cal_saved"})});});
  }
  return normalFetch(url,init);
};
const backgroundRead=lateBackground.refresh({preserveContent:true});
await oldReadStarted;
await lateBackground.run();
releaseOldRead(); await backgroundRead;
assert.equal(lateBackground.driverCalendar.status,"update_calendar","Actual delayed background refresh cannot restore a stale saved badge after ACK");

for (const fragment of [
  "buildDriverJobGoogleCalendarEvent",
  'timeZone: "Asia/Singapore"',
  'title: "Open Driver Job"',
  'prestigeSource: "prestige_limo_ops_driver_job"',
  'overrides: [{ method: "popup", minutes: 60 }]',
  "prestige-driver:${driverId}:booking:${reference}",
  "Open Driver Job:",
  "Private driver link - do not share this calendar event.",
]) {
  assert.equal(eventHelper.includes(fragment), true, `Driver event helper must include ${fragment}.`);
}

assert.doesNotMatch(
  eventHelper,
  /MIDNIGHT JOB|23:30|buildMidnightCalendarDisplayAdjustment/,
  "Driver Google event must keep the actual pickup time, not the admin midnight adjustment.",
);
assert.doesNotMatch(
  eventHelper,
  /BEGIN:VCALENDAR|text\/calendar|buildDriverJobCalendarDownload|\.ics\b/,
  "Retired driver ICS creation must not remain as a second calendar path.",
);
assert.doesNotMatch(
  eventHelper,
  /customer_price|billing|invoice|payment|paynow|payout|finance|internal_admin_note|parser_debug|mock_archive|token_hash/i,
  "Driver Google event must exclude driver-forbidden and internal fields.",
);

for (const fragment of [
  'driverGoogleCalendarScope = "https://www.googleapis.com/auth/calendar.events"',
  'access_type", "offline"',
  'code_challenge_method", "S256"',
  'include_granted_scopes", "true"',
  "aes-256-gcm",
  "timingSafeEqual",
  'from("driver_google_calendar_connections")',
  'from("driver_job_links")',
  'from("bookings")',
  '.select("driver_id")',
  "currentDriverId !== driverId",
  'calendars/primary/events/${encodeURIComponent(context.event.event.id)}?sendUpdates=none',
  'google_calendar_event_id: context.event.event.id',
  'google_calendar_revision: context.event.revision',
  'request(eventPath, "PUT")',
  '"POST",',
  'input.providerError === "invalid_grant"',
  "buildAuthorizationResult(config, token)",
]) {
  assert.equal(googleHelper.includes(fragment), true, `Driver Google helper must include ${fragment}.`);
}

assert.doesNotMatch(
  googleHelper,
  /auth\/calendar(?!\.events)|userinfo\.email|openid|gmail|attendees|sendUpdates=(?:all|externalOnly)/i,
  "Driver OAuth must use calendar.events only, without identity/email scopes, attendees, or guest sends.",
);

for (const envName of [
  "PRESTIGE_DRIVER_GOOGLE_CALENDAR_SYNC_ENABLED",
  "PRESTIGE_DRIVER_GOOGLE_OAUTH_CLIENT_ID",
  "PRESTIGE_DRIVER_GOOGLE_OAUTH_CLIENT_SECRET",
  "PRESTIGE_DRIVER_GOOGLE_OAUTH_REDIRECT_URI",
  "PRESTIGE_DRIVER_GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY",
]) {
  assert.equal(googleHelper.includes(envName), true, `Driver Google helper must require ${envName}.`);
}

for (const fragment of [
  'from("bookings")',
  '"driver_id, updated_at, service_type',
  "p_booking_reference: input.booking_reference",
  "Number.isSafeInteger(verifiedDriverId)",
  "p_driver_id:",
]) {
  assert.equal(persistence.includes(fragment), true, `Existing link issuer must bind verified driver identity with ${fragment}.`);
}

for (const fragment of [
  "readDriverGoogleCalendarStatus",
  "saveOrAuthorizeDriverGoogleCalendar",
  "export async function GET",
  "export async function POST",
  "isProductionDriverJobLinkMode",
  'reason: "not_configured"',
  '"cache-control": "private, no-store, max-age=0"',
  "driverGoogleCalendarOauthCookieName",
  "google_consent_url: result.authorization_url",
  "httpOnly: true",
  'sameSite: "lax"',
]) {
  assert.equal(route.includes(fragment), true, `Existing calendar route must include ${fragment}.`);
}
assert.doesNotMatch(route, /text\/calendar|content-disposition|\.ics|buildDriverJobCalendarDownload/);

for (const fragment of [
  "completeDriverGoogleCalendarOauth",
  "driverGoogleCalendarOauthCookieName",
  'searchParams.get("state")',
  'searchParams.get("code")',
  "cookieStore.delete",
  'searchParams.set("calendar", result.ok ? "saved" : "error")',
  "Response.redirect",
]) {
  assert.equal(callback.includes(fragment), true, `OAuth callback must include ${fragment}.`);
}

for (const fragment of [
  "readDriverGoogleCalendarNativeOauthStart",
  "driverGoogleCalendarOauthCookieName",
  'searchParams.get("state")',
  "httpOnly: true",
  'sameSite: "lax"',
  "const response =",
]) {
  assert.equal(nativeStart.includes(fragment), true, `Native OAuth start must include ${fragment}.`);
}
assert.doesNotMatch(nativeStart, /createClient|\.from\(|POST|PATCH|DELETE/);

const nativeStartResponseConstructionStart = nativeStart.indexOf("  const response =");
const nativeStartResponseConstructionEnd = nativeStart.indexOf(
  "\n  return response;",
  nativeStartResponseConstructionStart,
);
assert.notEqual(
  nativeStartResponseConstructionStart,
  -1,
  "Native OAuth start must keep one bounded redirect response construction.",
);
assert.notEqual(
  nativeStartResponseConstructionEnd,
  -1,
  "Native OAuth start must return its bounded redirect response.",
);
const nativeStartResponseConstruction = nativeStart.slice(
  nativeStartResponseConstructionStart,
  nativeStartResponseConstructionEnd + "\n  return response;".length,
);
const nativeStartResponseModule = { exports: {} };
const nativeStartResponseJavascript = ts.transpileModule(
  `export function executeNativeStartResponse(result: { authorization_url: string }) {\n${nativeStartResponseConstruction}\n}`,
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  },
).outputText;
new Function("exports", "Response", nativeStartResponseJavascript)(
  nativeStartResponseModule.exports,
  Response,
);
let nativeStartResponse;
assert.doesNotThrow(
  () => {
    nativeStartResponse = nativeStartResponseModule.exports.executeNativeStartResponse({
      authorization_url: "https://accounts.google.com/o/oauth2/v2/auth",
    });
  },
  "Native OAuth start must construct its 303 response without mutating immutable redirect headers.",
);
assert.equal(nativeStartResponse.status, 303);
assert.equal(
  nativeStartResponse.headers.get("location"),
  "https://accounts.google.com/o/oauth2/v2/auth",
);
assert.equal(nativeStartResponse.headers.get("cache-control"), "private, no-store, max-age=0");
assert.equal(nativeStartResponse.headers.get("referrer-policy"), "no-referrer");
assert.doesNotMatch(
  nativeStart,
  /Response\.redirect|response\.headers\.set/,
  "Native OAuth start must not mutate the immutable headers returned by Response.redirect().",
);

for (const fragment of [
  'data-driver-job-calendar-action="true"',
  'data-driver-job-calendar-source="current-driver-job-schedule"',
  'data-driver-job-calendar-saved="true"',
  'fetch(`/api/driver-job/${encodeURIComponent(token)}/calendar`',
  'method: "POST"',
  "safeGoogleConsentUrl",
  'url.hostname === "accounts.google.com"',
  "safeDriverNativeCalendarOauthStartUrl",
  "embeddedDriverApp",
  "window.location.assign(calendarNavigationUrl)",
  'searchParams.get("calendar")',
  'searchParams.delete("calendar")',
  "window.history.replaceState",
  "Calendar connected and saved. Open the event and tap Open Driver Job for reporting.",
  "Google Calendar connection was not completed. Try Add / Update Calendar again.",
  "Calendar saved",
  "Add / Update Calendar",
  "no file download",
  "Open Driver Job for OTW, OTS, POB and",
]) {
  assert.equal(page.includes(fragment), true, `Driver Job page must include ${fragment}.`);
}
for (const forbidden of [
  "openDriverCalendarImport",
  "document.createElement(\"a\")",
  "window.URL.createObjectURL",
  ".download =",
  "text/calendar",
  ".ics",
]) {
  assert.equal(page.includes(forbidden), false, `Driver page must not retain download behavior: ${forbidden}.`);
}

for (const fragment of [
  "add column if not exists driver_id bigint references public.drivers(id)",
  "create table if not exists public.driver_google_calendar_connections",
  "booking.booking_reference = link.booking_reference",
  "booking.driver_id is not null",
  "encrypted_refresh_token text not null",
  "enable row level security",
  "revoke all on table public.driver_google_calendar_connections from anon, authenticated",
  "to service_role",
]) {
  assert.equal(migration.includes(fragment), true, `Driver Google migration must include ${fragment}.`);
}
assert.doesNotMatch(migration, /grant .* to (?:anon|authenticated)/i);

assert.equal(
  ledger.includes("### Driver Personal Google Calendar Connection"),
  true,
  "Ledger must record the exact in-place Google Calendar repair.",
);
for (const productionEvidence of [
  "Production activation proof opened that saved Google event",
  "Google retained event ID `9379e3a443911206f67238be115e3b152bf05025c5e8d3e8bea2`",
  "The booking and personal event were then restored to `Town`",
  "all four timestamps remained `Not recorded`",
]) {
  assert.equal(
    ledger.includes(productionEvidence),
    true,
    `Ledger must retain verified Production calendar evidence: ${productionEvidence}.`,
  );
}
assert.equal(suite.includes(guardPath), true, "Preactivation suite must keep the focused calendar guard.");

const refreshClassifierStart = googleHelper.indexOf(
  "export function classifyDriverGoogleCalendarRefreshResult",
);
const refreshClassifierEnd = googleHelper.indexOf(
  "\n\nasync function writeGoogleEvent",
  refreshClassifierStart,
);
assert.notEqual(refreshClassifierStart, -1, "Driver Google refresh classifier must exist.");
assert.notEqual(refreshClassifierEnd, -1, "Driver Google refresh classifier must remain bounded.");
const refreshClassifierModule = { exports: {} };
const refreshClassifierSource = googleHelper.slice(refreshClassifierStart, refreshClassifierEnd);
const refreshClassifierJavascript = ts.transpileModule(refreshClassifierSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
new Function("exports", refreshClassifierJavascript)(refreshClassifierModule.exports);
const { classifyDriverGoogleCalendarRefreshResult } = refreshClassifierModule.exports;
const { buildDriverJobGoogleCalendarEvent } = await import("../lib/driver-job-calendar-event.ts");
assert.equal(
  classifyDriverGoogleCalendarRefreshResult({ accessToken: "", providerError: "invalid_grant" }),
  "reauthorize",
  "An invalid Google refresh grant must restart the same bounded OAuth flow.",
);
assert.equal(
  classifyDriverGoogleCalendarRefreshResult({ accessToken: "", providerError: "temporarily_unavailable" }),
  "provider_failed",
  "A transient Google failure must remain retryable without forcing reconnection.",
);
assert.equal(
  classifyDriverGoogleCalendarRefreshResult({ accessToken: "safe-access-token", providerError: "" }),
  "use_access_token",
  "A valid refreshed access token must continue to the existing event upsert.",
);
const calendarJobUrl = "https://ops.example/driver-job/safe-calendar-token";
const payload = {
  acknowledged: true,
  assignedDriver: { contact: "", name: "Safe Driver", plate: "SLV1234X", vehicleModel: "V Class" },
  bookingType: "MNG",
  bookingTypeLabel: "Arrival",
  dropoffLocation: "Marina Bay Sands",
  flightNumber: "SQ 318",
  passengerName: "Safe Passenger",
  pickupDate: "2026-07-15",
  pickupDateTime: "15 Jul 2026, 00:30",
  pickupLocation: "Changi Airport Terminal 3",
  pickupTime: "0030hrs",
  reference: "ADM-20260715003000",
  route: "Changi Airport Terminal 3 > Marina Bay Sands",
  scheduleUpdatedAt: "2026-07-13T02:52:22.000Z",
  status: "assigned",
  statusHistory: [],
  statusLabel: "Assigned",
  waypoints: [],
};
const initial = buildDriverJobGoogleCalendarEvent(payload, 27, calendarJobUrl);
assert.equal(initial.ok, true);
assert.equal(initial.event.start.dateTime, "2026-07-15T00:30:00+08:00");
assert.equal(initial.event.end.dateTime, "2026-07-15T02:00:00+08:00");
assert.equal(initial.event.location, "Changi Airport Terminal 3");
assert.equal(initial.event.source.url, calendarJobUrl);
assert.equal(initial.event.reminders.overrides[0].minutes, 60);
assert.equal(initial.event.summary.includes("safe-calendar-token"), false);
assert.doesNotMatch(JSON.stringify(initial.event), /customer_price|billing|invoice|payment|paynow|payout/i);

const amended = buildDriverJobGoogleCalendarEvent({
  ...payload,
  pickupDateTime: "15 Jul 2026, 01:00",
  pickupTime: "0100hrs",
  pickupLocation: "Changi Airport Terminal 2",
}, 27, calendarJobUrl);
assert.equal(amended.ok, true);
assert.equal(amended.event.id, initial.event.id, "Amendment must keep one stable Google event ID.");
assert.notEqual(amended.revision, initial.revision, "Amendment must require a new event revision.");
assert.equal(amended.event.start.dateTime, "2026-07-15T01:00:00+08:00");
assert.equal(amended.event.location, "Changi Airport Terminal 2");

const otherDriver = buildDriverJobGoogleCalendarEvent(payload, 28, calendarJobUrl);
assert.equal(otherDriver.ok, true);
assert.notEqual(otherDriver.event.id, initial.event.id, "Different verified drivers must not share event identity.");
assert.equal(buildDriverJobGoogleCalendarEvent(payload, 0, calendarJobUrl).ok, false);
assert.equal(buildDriverJobGoogleCalendarEvent(payload, 27, "javascript:alert(1)").ok, false);

console.log("Driver Job personal Google Calendar guard passed");
