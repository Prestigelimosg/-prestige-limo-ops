import "server-only";
import { createHash, createHmac } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { hashDriverJobLinkToken, isDriverJobLinkExpired, isDriverJobLinkExpiryOutsideAllowedWindow } from "./driver-job-link.ts";
import { driverAccountPasswordIsReady } from "./driver-account-password.ts";
import { driverAccountDeviceLockVersion, verifyDriverAccountSession } from "./driver-account-device-lock.ts";
import { issueDriverPortalAccountSession, resolveDriverPortalSession } from "./driver-portal-session.ts";

type Row = Record<string, unknown>;
type Env = Record<string, string | undefined>;
type Client = { rpc: (name: string, args: Row) => Promise<{ data: unknown; error: unknown }>; from?: SupabaseClient["from"] };
type Auth = { createUser: (input: { email: string; password: string; email_confirm: true; app_metadata: Record<string,string> }) => Promise<{ data: { user?: { id?: string } | null } | null; error: unknown }> };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const userId = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const text = (v: unknown) => typeof v === "string" ? v.trim() : "";
const row = (v: unknown): Row => v && typeof v === "object" && !Array.isArray(v) ? v as Row : {};
const messages: Record<string,string> = {
  invalid_input: "Check your email and six-digit PIN in Prestige Driver, then reopen Admin's Job Link.",
  invalid_link: "This Job Link is no longer active. Ask Admin for the current Job Link, then open it in Prestige Driver.",
  account_exists: "An account or setup already exists. If you already have an account, tap Back to jobs, then Already have an account? Sign in. Otherwise reopen your original setup link or contact Admin. Do not create another account.",
  assignment_changed: "This job's driver assignment changed. Ask Admin to confirm your current Job Link before activating.",
  activation_unavailable: "This setup does not match this phone and Job Link. Return to the original phone and Admin's original message, or contact Admin.",
  review_required: "Account setup could not be confirmed. Contact Admin to check it before starting another setup. Your job acknowledgement is not changed.",
  not_configured: "Account activation is not available in this version yet. Contact Admin for the supported app version.",
};
function fail(reason: string) { return { ok: false as const, reason, error: messages[reason] || messages.review_required }; }

export async function activateDriverJobAccount(token: string, body: Row, dependencies: {
  env?: Env; client?: Client; auth?: Auth;
  cookieHeader?: string | null;
  issueSession?: typeof issueDriverPortalAccountSession;
} = {}) {
  const env = dependencies.env ?? process.env;
  if (env.PRESTIGE_DRIVER_JOB_ACCOUNT_ACTIVATION_ENABLED !== "true" || env.PRESTIGE_DRIVER_ACCOUNT_AUTH_ENABLED !== "true") return fail("not_configured");
  const secret = text(env.PRESTIGE_DRIVER_ACCOUNT_DEVICE_SECRET);
  if (secret.length < 32 || text(env.PRESTIGE_DRIVER_PORTAL_SESSION_SECRET).length < 32) return fail("not_configured");
  const action = text(body.action), installation = text(body.installation_id).toLowerCase(), setup = text(body.setup_id).toLowerCase();
  if (!["activate","resume"].includes(action) || !uuid.test(installation) || !uuid.test(setup)
    || Object.keys(body).some(k => !["action","installation_id","setup_id","email","password"].includes(k))) return fail("invalid_input");
  const email = text(body.email).toLowerCase();
  if (action === "activate" && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !driverAccountPasswordIsReady(body.password))) return fail("invalid_input");
  if (action === "resume" && (body.email !== undefined || body.password !== undefined)) return fail("invalid_input");
  let tokenHash: string;
  try { tokenHash = hashDriverJobLinkToken(token); } catch { return fail("invalid_link"); }
  const deviceHash = createHash("sha256").update(`${driverAccountDeviceLockVersion}:${secret}:${installation}`).digest("hex");
  const setupHash = createHmac("sha256",secret).update(`driver-job-activation:${deviceHash}:${setup}`).digest("hex");
  try {
    const configured = dependencies.client ? null : createClient(env.SUPABASE_URL || "",env.SUPABASE_SERVICE_ROLE_KEY || "", { auth: { persistSession: false, autoRefreshToken: false } });
    const client = dependencies.client ?? configured!;
    const args = { p_token_hash: tokenHash, p_device_hash: deviceHash, p_setup_hash: setupHash };
    const first = await client.rpc("driver_job_account_activation", { ...args, p_action: action === "activate" ? "claim" : "resume", ...(action === "activate" ? { p_email: email } : {}) });
    let result = row(first.data);
    // Recover an unclaimed local setup only through an already authenticated account.
    // The activation RPC still validates the job first; an account_exists response
    // alone is never identity proof and must not create or rebind any account.
    if (!first.error && result.ok !== true && result.reason === "account_exists"
      && action === "activate" && dependencies.cookieHeader && client.from) {
      const session = resolveDriverPortalSession(dependencies.cookieHeader, { env });
      if (session.ok && session.claims.accountId && session.claims.deviceIdHash === deviceHash) {
        const readClient = { from: client.from.bind(client) };
        const verified = await verifyDriverAccountSession({
          client: readClient, env, installationId: installation,
          accountId: session.claims.accountId, driverId: session.claims.driverId,
          deviceIdHash: deviceHash, sessionIssuedAt: session.claims.issuedAt,
        });
        if (verified) {
          const { data: linkData, error: linkError } = await readClient.from("driver_job_links")
            .select("driver_id, booking_reference, link_status, revoked_at, expires_at, safe_link_context")
            .eq("token_hash", tokenHash).maybeSingle();
          const link = row(linkData);
          if (!linkError && link.driver_id === session.claims.driverId && text(link.booking_reference)
            && link.link_status === "active" && !link.revoked_at
            && !isDriverJobLinkExpired(text(link.expires_at))
            && !isDriverJobLinkExpiryOutsideAllowedWindow(text(link.expires_at), new Date(), undefined, link.safe_link_context)) {
            const { data: bookingData, error: bookingError } = await readClient.from("bookings")
              .select("driver_id").eq("booking_reference", text(link.booking_reference)).maybeSingle();
            if (!bookingError && row(bookingData).driver_id === session.claims.driverId) {
              // The existing native completion message clears only this exact job's
              // local setup. Keep the current cookie, PIN, phone binding and job intact.
              return { ok: true as const, activated: true, accountReady: true, cookie: null };
            }
          }
        }
      }
    }
    if (first.error || result.ok !== true) return fail(text(result.reason) || "review_required");
    if (result.create_auth === true) {
      const auth = dependencies.auth ?? configured?.auth.admin;
      if (!auth || action !== "activate" || !userId.test(text(result.enrollment_id))) return fail("review_required");
      const created = await auth.createUser({ email: text(result.email), password: body.password as string, email_confirm: true,
        app_metadata: { prestige_enrollment_id: text(result.enrollment_id) } });
      const id = text(created.data?.user?.id);
      if (created.error || !userId.test(id)) return fail("review_required");
      // A timeout may have committed: never repeat Auth creation or delete a possibly bound identity.
      const finished = await client.rpc("driver_job_account_activation", { ...args, p_action: "record_auth", p_auth_user_id: id });
      result = row(finished.data);
      if (finished.error || result.ok !== true) return fail(text(result.reason) || "review_required");
    }
    if (result.activated !== true) return fail("review_required");
    if (result.scope === "this_job") return { ok: true as const, activated: true, accountReady: false, cookie: null };
    const driverId = Number(result.driver_id), accountId = text(result.account_id);
    if (result.scope !== "account" || !Number.isSafeInteger(driverId) || driverId <= 0 || !userId.test(accountId)) return fail("review_required");
    const cookie = (dependencies.issueSession ?? issueDriverPortalAccountSession)({ accountId,driverId,deviceIdHash:deviceHash,env });
    if (!cookie) return fail("not_configured");
    return { ok: true as const, activated: true, accountReady: true, cookie };
  } catch { return fail("review_required"); }
}
