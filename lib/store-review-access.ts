import "server-only";
import { resolveAdminAccountSession } from "./admin-dispatcher-auth-boundary";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type StoreReviewRole = "admin" | "driver" | "customer";
export type StoreReviewScope = {
  adminSaveBookingReference?: string;
  driverLinkBookingReference?: string;
  bookingIds: number[];
  bookingReferences: string[];
  companyId: number;
  bookerId: number;
  customerId: number;
  driverId: number;
  travelerIds: number[];
  bookingTargets?: { bookingId: number; bookingReference: string; travelerId: number | null }[];
};
type Env = Record<string, string | undefined>;
type HostedAccess = { enabled: boolean; origin: string; ownerSetupEnabled?: boolean };
type Config = { hostedAccess?: HostedAccess; databaseOrigin: string; expiresAt: number; credentials: Record<StoreReviewRole, string>; scope: StoreReviewScope; revision: string };
export type StoreReviewSession = { state: "valid"; role: StoreReviewRole; scope: StoreReviewScope; databaseOrigin: string; expiresAt: number };
export type StoreReviewResolution = StoreReviewSession | { state: "absent" | "invalid" };
export const storeReviewCookieName = "prestige_store_review_session";
const lifetime = 8 * 60 * 60 * 1000;
const aad = Buffer.from("prestige-store-review-v1");
const roles: StoreReviewRole[] = ["admin", "driver", "customer"];
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const positiveId = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;

function configuration(env: Env, now: number): Config | null {
  try {
    const raw = env.PRESTIGE_STORE_REVIEW_ACCESS || "";
    if (!raw || raw.length > 8000 || !Number.isFinite(now)) return null;
    const value = JSON.parse(raw);
    const scope = value.scope;
    const expiresAt = Date.parse(value.expiresAt);
    const origin = new URL(value.databaseOrigin);
    if (value.version !== 1 || !scope || !Number.isFinite(expiresAt) || expiresAt <= now ||
        origin.protocol !== "https:" || origin.href !== `${origin.origin}/` || origin.username || origin.password ||
        !origin.hostname.endsWith(".supabase.co") || origin.origin !== env.SUPABASE_URL?.replace(/\/$/, "") ||
        ![scope.companyId, scope.bookerId, scope.customerId, scope.driverId].every(positiveId) ||
        !Array.isArray(scope.bookingIds) || scope.bookingIds.length < 1 || scope.bookingIds.length > 10 ||
        !scope.bookingIds.every(positiveId) || new Set(scope.bookingIds).size !== scope.bookingIds.length ||
        !Array.isArray(scope.bookingReferences) || scope.bookingReferences.length !== scope.bookingIds.length ||
        !scope.bookingReferences.every((ref: unknown) => typeof ref === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(ref)) ||
        new Set(scope.bookingReferences).size !== scope.bookingReferences.length ||
        !Array.isArray(scope.travelerIds) || scope.travelerIds.length > 10 || !scope.travelerIds.every(positiveId) ||
        !roles.every(role => /^[a-f0-9]{64}$/.test(value.credentials?.[role] || "")) ||
        new Set(roles.map(role => value.credentials[role])).size !== 3) return null;
    if (scope.bookingTargets !== undefined && (!Array.isArray(scope.bookingTargets) ||
        scope.bookingTargets.length !== scope.bookingIds.length ||
        scope.bookingTargets.some((target: Record<string, unknown>, index: number) => !target ||
          Object.keys(target).sort().join(",") !== "bookingId,bookingReference,travelerId" ||
          target.bookingId !== scope.bookingIds[index] || target.bookingReference !== scope.bookingReferences[index] ||
          !(target.travelerId === null || (positiveId(target.travelerId) && scope.travelerIds.includes(target.travelerId)))))) return null;
    if (scope.adminSaveBookingReference !== undefined &&
        (typeof scope.adminSaveBookingReference !== "string" || !scope.bookingTargets?.some(
          (target: { bookingReference: string; travelerId: number | null }) =>
            target.bookingReference === scope.adminSaveBookingReference && positiveId(target.travelerId)))) return null;
    if (scope.driverLinkBookingReference !== undefined &&
        (typeof scope.driverLinkBookingReference !== "string" ||
         scope.driverLinkBookingReference === scope.adminSaveBookingReference ||
         !scope.bookingTargets?.some((target: { bookingReference: string; travelerId: number | null }) =>
           target.bookingReference === scope.driverLinkBookingReference && positiveId(target.travelerId)))) return null;
    const hostedAccess = value.hostedAccess;
    if (hostedAccess !== undefined && (!hostedAccess || typeof hostedAccess !== "object" || Array.isArray(hostedAccess) ||
        Object.keys(hostedAccess).some(key => !["enabled", "origin", "ownerSetupEnabled"].includes(key)) ||
        typeof hostedAccess.enabled !== "boolean" || hostedAccess.origin !== "https://app.prestigelimo.sg" ||
        (hostedAccess.ownerSetupEnabled !== undefined && typeof hostedAccess.ownerSetupEnabled !== "boolean") ||
        (hostedAccess.enabled && (!scope.adminSaveBookingReference || !scope.driverLinkBookingReference ||
          !scope.bookingTargets?.every((target: { travelerId: number | null }) => positiveId(target.travelerId)))))) return null;
    return { databaseOrigin: origin.origin, expiresAt, credentials: value.credentials, scope, hostedAccess, revision: digest(raw) };
  } catch { return null; }
}
// Hosted access is opt-in in the existing server-only configuration. Never infer
// permission from NODE_ENV, a forwarded Host header, or a reviewer-supplied flag.
function reviewRuntimeEnabled(config: Config, env: Env) {
  if (env.NODE_ENV === "production" || env.VERCEL_ENV) {
    return env.NODE_ENV === "production" && env.VERCEL_ENV === "production" && config.hostedAccess?.enabled === true;
  }
  return true; // Session crypto remains usable by local fixtures; requests also require the origin gate below.
}
function reviewOriginAllowed(origin: string, config: Config, ownerSetup = false) {
  try {
    const url = new URL(origin);
    if (url.origin !== origin || url.username || url.password) return false;
    if (["development", "test"].includes(process.env.NODE_ENV || "") && !process.env.VERCEL_ENV) {
      return ["http:", "https:"].includes(url.protocol) && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    }
    return reviewRuntimeEnabled(config, process.env) && process.env.NODE_ENV === "production" &&
      config.hostedAccess?.origin === origin && (!ownerSetup || config.hostedAccess.ownerSetupEnabled === true);
  } catch { return false; }
}
export function storeReviewRequestOriginAllowed(request: Request, ownerSetup = false) {
  const config = configuration(process.env, Date.now());
  try {
    const url = new URL(request.url);
    return Boolean(config && !url.username && !url.password && !url.hash && reviewOriginAllowed(url.origin, config, ownerSetup));
  } catch { return false; }
}
function encryptionKey(env: Env) {
  const secret = env.PRESTIGE_ADMIN_ACCOUNT_SESSION_SECRET || "";
  return secret.length >= 32 ? createHash("sha256").update(`store-review-v1:${secret}`).digest() : null;
}
function cookieValue(header: string | null) {
  const found = (header || "").split(";").map(part => part.trim()).filter(part => part.startsWith(`${storeReviewCookieName}=`));
  if (!found.length) return null;
  if (found.length !== 1) return "";
  return found[0].slice(storeReviewCookieName.length + 1);
}
export function clearStoreReviewSessionCookie() {
  return `${storeReviewCookieName}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax; Priority=High`;
}
export function issueStoreReviewSession(role: StoreReviewRole, credential: unknown, options: { env?: Env; now?: number } = {}) {
  const env = options.env || process.env;
  const now = options.now ?? Date.now();
  const config = configuration(env, now);
  const key = encryptionKey(env);
  if (!config || !reviewRuntimeEnabled(config, env) || !key || !roles.includes(role) || typeof credential !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(credential)) return null;
  if (!timingSafeEqual(Buffer.from(digest(credential), "hex"), Buffer.from(config.credentials[role], "hex"))) return null;
  const expiresAt = Math.min(now + lifetime, config.expiresAt);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify({ role, issuedAt: now, expiresAt, revision: config.revision })), cipher.final()]);
  const value = [iv, ciphertext, cipher.getAuthTag()].map(part => part.toString("base64url")).join(".");
  return `${storeReviewCookieName}=${value}; Path=/; Max-Age=${Math.floor((expiresAt - now) / 1000)}; HttpOnly; Secure; SameSite=Lax; Priority=High`;
}
export function resolveStoreReviewSession(header: string | null, options: { env?: Env; now?: number } = {}): StoreReviewResolution {
  const value = cookieValue(header);
  if (value === null) return { state: "absent" };
  const env = options.env || process.env;
  const now = options.now ?? Date.now();
  const config = configuration(env, now);
  const key = encryptionKey(env);
  if (!value || value.length > 1500 || !config || !reviewRuntimeEnabled(config, env) || !key) return { state: "invalid" };
  try {
    const parts = value.split(".");
    if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) return { state: "invalid" };
    const [iv, ciphertext, tag] = parts.map(part => Buffer.from(part, "base64url"));
    if (iv.length !== 12 || tag.length !== 16) return { state: "invalid" };
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(aad); decipher.setAuthTag(tag);
    const claims = JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8"));
    if (!roles.includes(claims.role) || claims.revision !== config.revision ||
        !Number.isFinite(claims.issuedAt) || !Number.isFinite(claims.expiresAt) ||
        claims.issuedAt > now || claims.expiresAt <= now || claims.expiresAt > config.expiresAt ||
        claims.expiresAt <= claims.issuedAt || claims.expiresAt - claims.issuedAt > lifetime) return { state: "invalid" };
    return { state: "valid", role: claims.role, scope: config.scope, databaseOrigin: config.databaseOrigin, expiresAt: claims.expiresAt };
  } catch { return { state: "invalid" }; }
}

const pages: Record<StoreReviewRole, string[]> = {
  admin: ["/", "/admin-sign-in"],
  driver: ["/driver-portal"],
  customer: ["/my-bookings", "/customer-access/sign-in"],
};
const reads: Record<StoreReviewRole, string[]> = {
  admin: ["/api/admin-saved-bookings"],
  driver: ["/api/driver-portal/jobs"],
  customer: ["/api/customer-saved-bookings", "/api/customer-principal-access"],
};
const authPaths: Record<StoreReviewRole, string> = {
  admin: "/api/admin-auth/session", driver: "/api/driver-auth/session", customer: "/api/customer-principal-access",
};
// Deliberately deny all operational writes and all unreviewed routes. This is
// read-access preparation, not complete store-review feature acceptance.
export function storeReviewRequestAllowed(session: StoreReviewSession, pathname: string, method: string, request?: Request) {
  if (request ? !storeReviewRequestOriginAllowed(request) : process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL_ENV)) return false;
  if (request && session.role === "customer" && method === "GET" &&
      (pathname === "/api/customer-invoices" || /^\/api\/customer-invoice-pdf\/[A-Z0-9-]+$/.test(pathname)) &&
      storeReviewSameOrigin(request, "customer") &&
      request.headers.get("x-prestige-customer-purpose") === "customer-saved-bookings-read") return true;
  if (request && pathname === "/api/admin-bookings" && method === "PATCH" &&
      resolveStoreReviewAdminSaveRequest(request).state === "review") return true;
  // The API independently verifies the session,
  // exact target, current ownership and revision before reading or acknowledging.
  if (request && session.role === "driver") {
    const url = new URL(request.url);
    const match = pathname.match(/^\/(api\/)?driver-job\/(review-[1-9][0-9]{0,15})$/);
    if (!url.search && match && session.scope.bookingTargets?.some(target =>
        match[2] === `review-${target.bookingId}` && (!session.scope.driverLinkBookingReference ||
          target.bookingReference === session.scope.driverLinkBookingReference))) {
      if (!match[1] && method === "GET") return true;
      return resolveStoreReviewJobRequest(request, match[2]).state === "review";
    }
  }
  if (method === "GET" && (pages[session.role].includes(pathname) || reads[session.role].includes(pathname) || pathname === "/privacy")) return true;
  return pathname === authPaths[session.role] && (method === "POST" || method === "DELETE");
}
export function storeReviewBlockedResponse() {
  return Response.json({ ok: false, error: "This action is not available with test-record review access." }, { status: 403, headers: { "cache-control": "private, no-store" } });
}

// The existing readers keep their field sanitizers. This additional boundary
// constrains the actual Data API request, before pagination, to exact QA IDs.
// No RPC, insert, update, delete, foreign host, or new table is permitted.
export function storeReviewReadFetch(session: StoreReviewSession, databaseOrigin: string, downstream: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (url.origin !== session.databaseOrigin || url.origin !== databaseOrigin.replace(/\/$/, "") || method !== "GET" || url.username || url.password || url.hash) throw new Error("Reviewer database access denied.");
    const table = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/)?.[1];
    const scope = session.scope;
    const add = (name: string, value: string) => url.searchParams.append(name, value);
    if (table === "bookings") {
      add("id", `in.(${scope.bookingIds.join(",")})`);
      add("booking_reference", `in.(${scope.bookingReferences.join(",")})`);
      add("company_id", `eq.${scope.companyId}`);
      add("booker_id", `eq.${scope.bookerId}`);
      add("customer_id", `eq.${scope.customerId}`);
      add("driver_id", `eq.${scope.driverId}`);
      if (scope.travelerIds.length) add("or", `(traveler_id.is.null,traveler_id.in.(${scope.travelerIds.join(",")}))`);
      else add("traveler_id", "is.null");
    } else if (session.role === "customer" && table === "bookers") {
      add("id", `eq.${scope.bookerId}`);
      add("company_id", `eq.${scope.companyId}`);
      add("customer_id", `eq.${scope.customerId}`);
    } else if (session.role === "customer" && table === "customer_invoice_records" && scope.travelerIds.length) {
      add("customer_id", `eq.${scope.customerId}`);
      add("booker_id", `eq.${scope.bookerId}`);
      add("traveler_id", `in.(${scope.travelerIds.join(",")})`);
      add("reference", `in.(${scope.bookingReferences.join(",")})`);
      add("document_state", "eq.issued");
    } else if (session.role === "driver" && ["driver_job_links", "driver_job_status_events", "customer_driver_app_notification_outbox"].includes(table || "")) {
      add("booking_reference", `in.(${scope.bookingReferences.join(",")})`);
      if (table === "driver_job_links") add("driver_id", `eq.${scope.driverId}`);
      if (table === "customer_driver_app_notification_outbox") add("delivery_surface", "eq.driver_app");
    } else { throw new Error("Reviewer database access denied."); }
    return downstream(url, { ...init, method: "GET", redirect: "error", cache: "no-store" });
  };
}

function sameOriginReviewReferer(request: Request, role: StoreReviewRole) {
  try {
    const url = new URL(request.url), referer = new URL(request.headers.get("referer") || "");
    const allowed = { admin: ["/", "/admin-sign-in"], driver: ["/driver-portal"], customer: ["/my-bookings", "/customer-access/sign-in"] };
    return (!request.headers.get("origin") || request.headers.get("origin") === url.origin) && referer.origin === url.origin && allowed[role].includes(referer.pathname);
  } catch { return false; }
}
export function storeReviewSameOrigin(request: Request, role: StoreReviewRole) {
  return storeReviewRequestOriginAllowed(request) && sameOriginReviewReferer(request, role);
}
export function storeReviewAuthResponse(request: Request, role: StoreReviewRole, body: Record<string, unknown> = {}): Response | null {
  const session = resolveStoreReviewSession(request.headers.get("cookie"));
  const signIn = request.method === "POST" && body.action === "reviewer_sign_in";
  const signOut = body.action === "reviewer_sign_out" || request.headers.get("x-prestige-review-purpose") === "sign-out";
  if (!signIn && !signOut && session.state === "absent") return null;
  if (!sameOriginReviewReferer(request, role)) return storeReviewBlockedResponse();
  if (signIn && ((role === "admin" && request.headers.get("x-prestige-admin-auth-purpose") !== "admin-account-sign-in") ||
      (role === "driver" && request.headers.get("x-prestige-driver-purpose") !== "driver-account-sign-in"))) return storeReviewBlockedResponse();
  const headers = new Headers({ "cache-control": "private, no-store" });
  if (request.method === "DELETE" || (request.method === "POST" && (body.action === "logout" || signOut))) {
    headers.append("set-cookie", clearStoreReviewSessionCookie());
    return Response.json({ ok: true, session: "ended" }, { headers });
  }
  if (!storeReviewRequestOriginAllowed(request) || !signIn || Object.keys(body).some(key => !["action", "access_code"].includes(key))) return storeReviewBlockedResponse();
  const cookie = issueStoreReviewSession(role, body.access_code);
  if (!cookie) return Response.json({ ok: false, error: "Reviewer credentials were not accepted." }, { status: 401, headers });
  headers.append("set-cookie", cookie);
  // A reviewer must never inherit an ordinary account cookie from this browser.
  for (const name of ["prestige_admin_account_session", "prestige_driver_portal_session", "prestige_customer_saved_bookings_session"]) {
    headers.append("set-cookie", `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
  }
  return Response.json({ ok: true, session: "reviewer", access: "test-record-read-only" }, { headers });
}

// Server-only authority for the prepared job branch. Never deserialize this proof
// from a request or infer the expected owner from a freshly read database row.
export type StoreReviewBookingProof = {
  booking: { bookingId: number; bookingReference: string; companyId: number; bookerId: number;
    customerId: number; travelerId: number | null; driverId: number };
  expiresAt: number;
  databaseOrigin: string;
  origin: string;
  revision: string;
};
const reviewBookingProofs = new WeakSet<object>();
export function isStoreReviewBookingProof(value: unknown): value is StoreReviewBookingProof {
  return Boolean(value && typeof value === "object" && reviewBookingProofs.has(value) &&
    currentReviewProof(value as StoreReviewBookingProof));
}
export function resolveStoreReviewJobRequest(request: Request, token: string):
  { state: "ordinary" } | { state: "blocked" } | { state: "review"; proof: StoreReviewBookingProof } {
  const session = resolveStoreReviewSession(request.headers.get("cookie"));
  if (session.state === "absent" && !/^review-[1-9][0-9]{0,15}$/.test(token)) return { state: "ordinary" };
  if (!storeReviewRequestOriginAllowed(request) || session.state !== "valid" || session.role !== "driver" ||
      !["GET", "PATCH"].includes(request.method)) return { state: "blocked" };
  try {
    const url = new URL(request.url), referrer = new URL(request.headers.get("referer") || "");
    if (url.pathname !== `/api/driver-job/${token}` || url.search ||
        (request.headers.get("origin") ? request.headers.get("origin") !== url.origin : request.method !== "GET") || referrer.origin !== url.origin ||
        !["/driver-portal", `/driver-job/${token}`].includes(referrer.pathname) ||
        !/^review-[1-9][0-9]{0,15}$/.test(token)) return { state: "blocked" };
    const target = session.scope.bookingTargets?.find(item => token === `review-${item.bookingId}`);
    if (!target || (session.scope.driverLinkBookingReference &&
        target.bookingReference !== session.scope.driverLinkBookingReference)) return { state: "blocked" };
    const proof: StoreReviewBookingProof = Object.freeze({
      booking: Object.freeze({ ...target, companyId: session.scope.companyId, bookerId: session.scope.bookerId,
        customerId: session.scope.customerId, driverId: session.scope.driverId }), expiresAt: session.expiresAt,
      databaseOrigin: session.databaseOrigin, origin: url.origin, revision: configuration(process.env, Date.now())!.revision,
    });
    reviewBookingProofs.add(proof);
    return { state: "review", proof };
  } catch { return { state: "blocked" }; }
}

// This purpose cannot mint or borrow ordinary Admin authority.
export const storeReviewAdminSavePurpose = "admin-qa-bags-save";
export type StoreReviewAdminSaveProof = StoreReviewBookingProof;
function currentReviewProof(proof: StoreReviewBookingProof, ownerSetup = false) {
  const config = configuration(process.env, Date.now());
  return Boolean(config && proof.expiresAt > Date.now() && proof.revision === config.revision &&
    proof.databaseOrigin === config.databaseOrigin && reviewOriginAllowed(proof.origin, config, ownerSetup));
}
const adminSaveProofs = new WeakSet<object>();
export function isStoreReviewAdminSaveProof(value: unknown): value is StoreReviewAdminSaveProof {
  return Boolean(value && typeof value === "object" && adminSaveProofs.has(value) &&
    currentReviewProof(value as StoreReviewAdminSaveProof));
}
export function resolveStoreReviewAdminSaveRequest(request: Request):
  { state: "ordinary" } | { state: "blocked" } | { state: "review"; proof: StoreReviewAdminSaveProof } {
  const session = resolveStoreReviewSession(request.headers.get("cookie"));
  const purpose = request.headers.get("x-prestige-admin-purpose");
  if (session.state === "absent" && purpose !== storeReviewAdminSavePurpose) return { state: "ordinary" };
  if (session.state !== "valid" || session.role !== "admin" || purpose !== storeReviewAdminSavePurpose ||
      request.method !== "PATCH" || !storeReviewRequestOriginAllowed(request)) return { state: "blocked" };
  try {
    const url = new URL(request.url), referer = new URL(request.headers.get("referer") || "");
    if (url.pathname !== "/api/admin-bookings" ||
        url.search || request.headers.get("origin") !== url.origin || referer.origin !== url.origin ||
        referer.pathname !== "/") return { state: "blocked" };
    const config = configuration(process.env, Date.now());
    const target = session.scope.bookingTargets?.find(item => item.bookingReference === session.scope.adminSaveBookingReference);
    if (!config || !target || !positiveId(target.travelerId)) return { state: "blocked" };
    const proof: StoreReviewAdminSaveProof = Object.freeze({
      booking: Object.freeze({ ...target, companyId: session.scope.companyId, bookerId: session.scope.bookerId,
        customerId: session.scope.customerId, driverId: session.scope.driverId }),
      databaseOrigin: session.databaseOrigin, origin: url.origin, expiresAt: session.expiresAt, revision: config.revision,
    });
    adminSaveProofs.add(proof);
    return { state: "review", proof };
  } catch { return { state: "blocked" }; }
}

// Durable purpose, independent of reviewer config expiry. Even malformed markers
// must never fall back to ordinary delivery or a normal Driver capability.
export function isStoreReviewLinkContext(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const context = value as Record<string, unknown>;
  return Object.prototype.hasOwnProperty.call(context, "store_review_booking") ||
    (typeof context.link_purpose === "string" && context.link_purpose.startsWith("store_review"));
}
export type StoreReviewLinkSetupProof = StoreReviewAdminSaveProof;
const linkSetupProofs = new WeakSet<object>();
export function isStoreReviewLinkSetupProof(value: unknown): value is StoreReviewLinkSetupProof {
  return Boolean(value && typeof value === "object" && linkSetupProofs.has(value) &&
    currentReviewProof(value as StoreReviewLinkSetupProof, true));
}
export function resolveStoreReviewLinkSetupRequest(request: Request,
  actor: { actor_role: string; boundary_mode?: string }):
  { state: "ordinary" } | { state: "blocked" } | { state: "review"; proof: StoreReviewLinkSetupProof } {
  const purpose = request.headers.get("x-prestige-review-setup");
  if (purpose === null) return { state: "ordinary" };
  const owner = resolveAdminAccountSession(request.headers.get("cookie"));
  if (!owner.ok || owner.claims.role !== "admin" || purpose !== "driver-qa-link" || request.method !== "POST" || actor.actor_role !== "admin" ||
      actor.boundary_mode !== "server-session-role-surface" ||
      resolveStoreReviewSession(request.headers.get("cookie")).state !== "absent" ||
      !storeReviewRequestOriginAllowed(request, true)) return { state: "blocked" };
  try {
    const url = new URL(request.url), referer = new URL(request.headers.get("referer") || "");
    if (url.search ||
        url.pathname !== "/api/admin-driver-job-links" || request.headers.get("origin") !== url.origin ||
        referer.origin !== url.origin || referer.pathname !== "/") return { state: "blocked" };
    const config = configuration(process.env, Date.now());
    const target = config?.scope.bookingTargets?.find(item => item.bookingReference === config.scope.driverLinkBookingReference);
    if (!config || !target || !positiveId(target.travelerId)) return { state: "blocked" };
    const proof: StoreReviewLinkSetupProof = Object.freeze({
      booking: Object.freeze({ ...target, companyId: config.scope.companyId, bookerId: config.scope.bookerId,
        customerId: config.scope.customerId, driverId: config.scope.driverId }),
      databaseOrigin: config.databaseOrigin, origin: url.origin, expiresAt: config.expiresAt, revision: config.revision,
    });
    linkSetupProofs.add(proof);
    return { state: "review", proof };
  } catch { return { state: "blocked" }; }
}
