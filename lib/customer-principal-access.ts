import "server-only";

import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { isIP } from "node:net";
import { promisify } from "node:util";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { AdminBookingResult } from "./admin-booking-persistence";
import type { AdminBookingPersistenceAdapterActor } from "./admin-booking-supabase-adapter";

export const customerPrincipalAccessVersion = "customer-principal-access-v1";
export const customerPrincipalInviteLifetimeSeconds = 30 * 60;
export const customerPrincipalPinLockSeconds = 15 * 60;
export const customerPrincipalSessionLifetimeSeconds = 180 * 24 * 60 * 60;
export const customerPinPattern = /^\d{6}$/;

const scrypt = promisify(scryptCallback);
const invitationPrefix = "customer_invite_v1";
const sessionPrefix = "customer_principal_v1";
const sessionCookieName = "prestige_customer_saved_bookings_session";
const emailChallengeLifetimeSeconds = 10 * 60;
const maxPinFailuresPerDeviceWindow = 5;
const principalAccessTable = "customer_access_principals";
const membershipTable = "customer_access_memberships";
const invitationTable = "customer_access_invitations";
const challengeTable = "customer_access_email_challenges";
const deviceTable = "customer_access_devices";
const sessionTable = "customer_access_device_sessions";
const attemptTable = "customer_access_pin_attempts";
const resendEmailApiUrl = "https://api.resend.com/emails";
const reserveEmailChallengeRpc = "reserve_customer_principal_email_challenge";

type PrincipalRole = "boss" | "pa";
type MembershipRole = "boss" | "managing_pa";
type EmailChallengePurpose = "activation" | "forgot_pin" | "new_device";
type PrincipalClient = Pick<SupabaseClient, "from" | "rpc">;

type EmailChallengeConfig = {
  apiKey: string;
  from: string;
};

type PrincipalSessionPayload = {
  device_id: string;
  exp: number;
  iat: number;
  principal_id: string;
  session_id: string;
  type: typeof customerPrincipalAccessVersion;
};

export type CustomerPrincipalSession = {
  device_id: string;
  expires_at: string;
  principal_id: string;
  session_id: string;
};

export type CustomerPrincipalMembership = {
  booker_id: number;
  company_id: number;
  customer_account_reference: string;
  membership_role: MembershipRole;
  traveler_id: number | null;
  verified_boss_name: string;
};

export type CustomerPrincipalAccessContext = CustomerPrincipalSession & {
  memberships: CustomerPrincipalMembership[];
  normalized_email: string;
  principal_role: PrincipalRole;
  renewed_cookie?: string;
};

type CustomerPrincipalDeviceSessionResult = {
  cookie: string;
  device_id: string;
};

type CustomerPrincipalRevokeResult = {
  principal_id: string;
  revoked: true;
};

type InviteMembershipInput = {
  bookerId: unknown;
  companyId: unknown;
  customerAccountReference: unknown;
  travelerId: unknown;
  verifiedBossName: unknown;
};

type InviteInput = {
  email: unknown;
  memberships: unknown;
  principalRole: unknown;
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, max = 254) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const cleaned = String(value).replace(/\s+/g, " ").trim();
  return cleaned && cleaned.length <= max ? cleaned : null;
}

function uuid(value: unknown) {
  const cleaned = text(value, 36);
  return cleaned && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleaned)
    ? cleaned
    : null;
}

function positiveId(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizedEmail(value: unknown) {
  const cleaned = text(value)?.toLowerCase();
  return cleaned && /^[^\s@<>()[\],;:"\\]+@[^\s@<>()[\],;:"\\]+\.[^\s@<>()[\],;:"\\]+$/.test(cleaned)
    ? cleaned
    : null;
}

function safeAccountReference(value: unknown) {
  const cleaned = text(value, 120);
  return cleaned && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(cleaned)
    ? cleaned
    : null;
}

function hashSecret(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function configValue(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length >= 24 && !/^(?:changeme|placeholder|example)$/i.test(value)
    ? value
    : null;
}

function principalSessionSecret() {
  return configValue("PRESTIGE_CUSTOMER_PRINCIPAL_SESSION_SECRET");
}

function normalizedRequestIp(value: unknown) {
  if (typeof value !== "string") return null;
  const candidate = value.split(",")[0]?.trim().toLowerCase() || "";
  return isIP(candidate) ? candidate : null;
}

function customerPrincipalEmailIpHash(value: unknown) {
  const requestIp = normalizedRequestIp(value);
  const secret = principalSessionSecret();
  if (!requestIp || !secret) return null;
  return createHmac("sha256", secret)
    .update(`customer-principal-email-ip-v1:${requestIp}`)
    .digest("hex");
}

function principalClient(): AdminBookingResult<PrincipalClient> {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey || !url.startsWith("https://") || serviceRoleKey.length < 24) {
    return { error: "Customer access configuration is not ready.", ok: false, status: 503 };
  }
  try {
    return {
      data: createClient(url, serviceRoleKey, { auth: { persistSession: false } }),
      ok: true,
    };
  } catch {
    return { error: "Customer access configuration is not ready.", ok: false, status: 503 };
  }
}

function principalFailure<T>(error: string, status: number): AdminBookingResult<T> {
  return { error, ok: false, status };
}

function tokenSignature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function signaturesMatch(left: string, right: string) {
  try {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function signedToken(prefix: string, payload: UnknownRecord, secret: string) {
  const segment = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${prefix}.${segment}.${tokenSignature(segment, secret)}`;
}

function parseSignedToken(value: string, expectedPrefix: string, secret: string) {
  const [prefix, segment, signature, extra] = value.split(".");
  if (prefix !== expectedPrefix || !segment || !signature || extra) return null;
  if (!signaturesMatch(signature, tokenSignature(segment, secret))) return null;
  try {
    return asRecord(JSON.parse(Buffer.from(segment, "base64url").toString("utf8")));
  } catch {
    return null;
  }
}

function invitationSecret() {
  return configValue("PRESTIGE_CUSTOMER_PRINCIPAL_INVITATION_SECRET");
}

function inviteMembership(value: unknown, role: PrincipalRole): CustomerPrincipalMembership | null {
  const input = asRecord(value) as InviteMembershipInput;
  const companyId = positiveId(input.companyId);
  const bookerId = positiveId(input.bookerId);
  const travelerId = positiveId(input.travelerId);
  const customerAccountReference = safeAccountReference(input.customerAccountReference);
  const verifiedBossName = text(input.verifiedBossName, 160);
  if (!companyId || !bookerId || !travelerId || !customerAccountReference || !verifiedBossName) {
    return null;
  }
  return {
    booker_id: bookerId,
    company_id: companyId,
    customer_account_reference: customerAccountReference,
    membership_role: role === "pa" ? "managing_pa" : "boss",
    traveler_id: travelerId,
    verified_boss_name: verifiedBossName,
  };
}

function bookerRootMembership(value: unknown): CustomerPrincipalMembership | null {
  const input = asRecord(value) as InviteMembershipInput;
  const companyId = positiveId(input.companyId);
  const bookerId = positiveId(input.bookerId);
  const customerAccountReference = safeAccountReference(input.customerAccountReference);
  const verifiedBookerName = text(input.verifiedBossName, 160);
  if (!companyId || !bookerId || !customerAccountReference || !verifiedBookerName) return null;
  return {
    booker_id: bookerId,
    company_id: companyId,
    customer_account_reference: customerAccountReference,
    membership_role: "managing_pa",
    traveler_id: null,
    verified_boss_name: verifiedBookerName,
  };
}

function parseInviteInput(input: unknown) {
  const body = asRecord(input) as InviteInput;
  const email = normalizedEmail(body.email);
  const principalRole = body.principalRole === "pa" || body.principalRole === "boss"
    ? body.principalRole
    : null;
  const memberships = principalRole
    ? asArray(body.memberships)
        .map((value) => inviteMembership(value, principalRole))
        .filter((value): value is CustomerPrincipalMembership => Boolean(value))
    : [];
  if (!email || !principalRole || memberships.length === 0 || memberships.length !== asArray(body.memberships).length) {
    return null;
  }
  if (principalRole === "boss" && memberships.length !== 1) return null;
  return { email, memberships, principalRole };
}

function parseBookerRootInviteInput(input: unknown) {
  const body = asRecord(input) as InviteInput;
  const email = normalizedEmail(body.email);
  const rawMemberships = asArray(body.memberships);
  const membership = rawMemberships.length === 1
    ? bookerRootMembership(rawMemberships[0])
    : null;
  return email && body.principalRole === "pa" && membership
    ? { email, memberships: [membership], principalRole: "pa" as const }
    : null;
}

async function persistBookerRootMembership(
  client: PrincipalClient,
  membership: CustomerPrincipalMembership,
  principalId: string,
) {
  const { data: existingRows, error: existingError } = await client
    .from(membershipTable)
    .select("id")
    .eq("principal_id", principalId)
    .eq("company_id", membership.company_id)
    .eq("booker_id", membership.booker_id)
    .is("traveler_id", null)
    .limit(2);
  const rows = asArray(existingRows);
  const existingId = uuid(asRecord(rows[0]).id);
  if (existingError || rows.length > 1) return false;
  const payload = {
    ...membership,
    membership_status: "active",
    principal_id: principalId,
    revoked_at: null,
  };
  const { error } = existingId
    ? await client.from(membershipTable).update(payload).eq("id", existingId)
    : await client.from(membershipTable).insert(payload);
  return !error;
}

export async function hashCustomerPin(pin: string) {
  if (!customerPinPattern.test(pin)) throw new Error("Invalid customer PIN.");
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(pin, salt, 64)) as Buffer;
  return `scrypt:${salt}:${derived.toString("hex")}`;
}

export async function verifyCustomerPin(pin: string, encoded: string) {
  if (!customerPinPattern.test(pin)) return false;
  const [algorithm, salt, expectedHex, extra] = encoded.split(":");
  if (algorithm !== "scrypt" || !salt || !expectedHex || extra || !/^[0-9a-f]{128}$/i.test(expectedHex)) {
    return false;
  }
  const actual = (await scrypt(pin, salt, 64)) as Buffer;
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function adminMayIssue(actor: AdminBookingPersistenceAdapterActor) {
  return actor.actor_role === "admin" && actor.source_surface === "admin_api";
}

export async function issueCustomerPrincipalInvitation(
  input: unknown,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<{
  access_status: "access_updated" | "invitation_created";
  expires_at: string | null;
  invitation_url_path: string | null;
  principal_id: string;
}>> {
  if (!adminMayIssue(actor)) {
    return principalFailure("Only Owner Admin may manage Customer app access.", 403);
  }
  const parsed = parseBookerRootInviteInput(input) || parseInviteInput(input);
  const clientResult = principalClient();
  if (!parsed) return principalFailure("Customer access invitation details are invalid.", 400);
  if (!clientResult.ok) return principalFailure("Customer access configuration is not ready.", 503);

  const client = clientResult.data;
  const verifiedMemberships: CustomerPrincipalMembership[] = [];
  for (const membership of parsed.memberships) {
    if (membership.traveler_id === null) {
      const [{ data: accountRows, error: accountError }, { data: bookerRows, error: bookerError }] =
        await Promise.all([
          client
            .from("customer_access_accounts")
            .select("customer_account_reference, company_id, booker_id, account_status")
            .eq("customer_account_reference", membership.customer_account_reference)
            .eq("company_id", membership.company_id)
            .eq("booker_id", membership.booker_id)
            .eq("account_status", "active")
            .limit(1),
          client
            .from("bookers")
            .select("id, company_id, customer_id, booker_name")
            .eq("id", membership.booker_id)
            .eq("company_id", membership.company_id)
            .limit(1),
        ]);
      const account = asRecord(asArray(accountRows)[0]);
      const booker = asRecord(asArray(bookerRows)[0]);
      const verifiedBookerName = text(booker.booker_name, 160);
      if (
        accountError ||
        bookerError ||
        safeAccountReference(account.customer_account_reference) !== membership.customer_account_reference ||
        positiveId(booker.id) !== membership.booker_id ||
        positiveId(booker.company_id) !== membership.company_id ||
        positiveId(booker.customer_id) !== positiveId(membership.customer_account_reference) ||
        !verifiedBookerName
      ) {
        return principalFailure(
          "Customer access invitation requires an exact verified CRM scope.",
          409,
        );
      }
      verifiedMemberships.push({ ...membership, verified_boss_name: verifiedBookerName });
      continue;
    }
    const [{ data: accountRows, error: accountError }, { data: travelerRows, error: travelerError }] =
      await Promise.all([
        client
          .from("customer_access_accounts")
          .select("customer_account_reference, company_id, booker_id, account_status")
          .eq("customer_account_reference", membership.customer_account_reference)
          .eq("company_id", membership.company_id)
          .eq("booker_id", membership.booker_id)
          .eq("account_status", "active")
          .limit(1),
        client
          .from("travelers")
          .select("id, company_id, booker_id, traveler_name")
          .eq("id", membership.traveler_id)
          .eq("company_id", membership.company_id)
          .eq("booker_id", membership.booker_id)
          .limit(1),
      ]);
    const account = asRecord(asArray(accountRows)[0]);
    const traveler = asRecord(asArray(travelerRows)[0]);
    const verifiedBossName = text(traveler.traveler_name, 160);
    if (
      accountError ||
      travelerError ||
      safeAccountReference(account.customer_account_reference) !==
        membership.customer_account_reference ||
      positiveId(traveler.id) !== membership.traveler_id ||
      !verifiedBossName
    ) {
      return principalFailure(
        "Customer access invitation requires an exact verified CRM scope.",
        409,
      );
    }
    verifiedMemberships.push({ ...membership, verified_boss_name: verifiedBossName });
  }
  if (parsed.principalRole === "pa") {
    const roots = new Map<string, CustomerPrincipalMembership>();
    for (const membership of verifiedMemberships) {
      roots.set(
        `${membership.company_id}:${membership.booker_id}:${membership.customer_account_reference}`,
        membership,
      );
    }
    if (roots.size !== 1) {
      return principalFailure(
        "One Booker invitation must use one exact verified company and booker scope.",
        409,
      );
    }
    const root = [...roots.values()][0];
    if (root.traveler_id === null) {
      verifiedMemberships.splice(0, verifiedMemberships.length, root);
    } else {
    const { data: travelerRows, error: travelerError } = await client
      .from("travelers")
      .select("id, company_id, booker_id, traveler_name")
      .eq("company_id", root.company_id)
      .eq("booker_id", root.booker_id);
    const allVerifiedBosses = asArray(travelerRows)
      .map((row): CustomerPrincipalMembership | null => {
        const record = asRecord(row);
        const travelerId = positiveId(record.id);
        const verifiedBossName = text(record.traveler_name, 160);
        return travelerId && verifiedBossName
          ? {
              ...root,
              membership_role: "managing_pa" as const,
              traveler_id: travelerId,
              verified_boss_name: verifiedBossName,
            }
          : null;
      })
      .filter((membership): membership is CustomerPrincipalMembership => Boolean(membership));
    if (travelerError || allVerifiedBosses.length === 0) {
      return principalFailure(
        "PA access requires at least one exact verified Boss under that booker.",
        409,
      );
    }
    verifiedMemberships.splice(0, verifiedMemberships.length, ...allVerifiedBosses);
    }
  }
  const { data: existingRows, error: existingError } = await client
    .from(principalAccessTable)
    .select("id, principal_role, principal_status")
    .eq("normalized_email", parsed.email)
    .limit(1);
  if (existingError) return principalFailure("Customer access invitation failed safely.", 500);

  const existingPrincipal = asRecord(asArray(existingRows)[0]);
  let principalId = uuid(existingPrincipal.id);
  if (principalId && existingPrincipal.principal_role !== parsed.principalRole) {
    return principalFailure("That email is already bound to another Customer role.", 409);
  }
  if (
    principalId &&
    existingPrincipal.principal_status === "active" &&
    parsed.principalRole === "pa"
  ) {
    const requestedRoot = verifiedMemberships[0];
    const { data: existingMembershipRows, error: existingMembershipError } = await client
      .from(membershipTable)
      .select("company_id, booker_id, customer_account_reference")
      .eq("principal_id", principalId)
      .eq("membership_role", "managing_pa")
      .eq("membership_status", "active");
    const existingRoots = new Set(
      asArray(existingMembershipRows).map((row) => {
        const membership = asRecord(row);
        return `${positiveId(membership.company_id) || 0}:${positiveId(membership.booker_id) || 0}:${safeAccountReference(membership.customer_account_reference) || ""}`;
      }),
    );
    const requestedRootKey = `${requestedRoot.company_id}:${requestedRoot.booker_id}:${requestedRoot.customer_account_reference}`;
    if (
      existingMembershipError ||
      existingRoots.size !== 1 ||
      !existingRoots.has(requestedRootKey)
    ) {
      return principalFailure(
        "That PA account is already bound to another verified company or booker.",
        409,
      );
    }
    if (requestedRoot.traveler_id !== null) {
      const { error: membershipError } = await client.from(membershipTable).upsert(
        verifiedMemberships.map((membership) => ({
          ...membership,
          membership_status: "active",
          principal_id: principalId,
          revoked_at: null,
        })),
        { onConflict: "principal_id,company_id,booker_id,traveler_id" },
      );
      if (membershipError) {
        return principalFailure("PA access update failed safely.", 500);
      }
    }
    return {
      data: {
        access_status: "access_updated",
        expires_at: null,
        invitation_url_path: null,
        principal_id: principalId,
      },
      ok: true,
    };
  }
  if (principalId && existingPrincipal.principal_status === "active") {
    return principalFailure("That Boss account is already active. Revoke it before issuing replacement access.", 409);
  }
  if (!principalId) {
    const { data, error } = await client
      .from(principalAccessTable)
      .insert({
        normalized_email: parsed.email,
        principal_role: parsed.principalRole,
        principal_status: "invited",
      })
      .select("id")
      .single();
    if (error) return principalFailure("Customer access invitation failed safely.", 500);
    principalId = uuid(asRecord(data).id);
  }
  if (!principalId) return principalFailure("Customer access invitation failed safely.", 500);

  const secret = invitationSecret();
  if (!secret) return principalFailure("Customer access configuration is not ready.", 503);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + customerPrincipalInviteLifetimeSeconds * 1000);
  const rawInvite = randomBytes(32).toString("base64url");
  const invitationPayload = {
    exp: Math.floor(expiresAt.getTime() / 1000),
    iat: Math.floor(now.getTime() / 1000),
    principal_id: principalId,
    raw: rawInvite,
    type: customerPrincipalAccessVersion,
  };
  const invitationToken = signedToken(invitationPrefix, invitationPayload, secret);

  const { error: invitationError } = await client.from(invitationTable).insert({
    expires_at: expiresAt.toISOString(),
    invitation_token_hash: hashSecret(invitationToken),
    issued_by_admin_actor_label: actor.actor_label.slice(0, 160),
    issued_by_admin_user_id: actor.actor_label.match(/[0-9a-f-]{36}/i)?.[0] || null,
    membership_scope: verifiedMemberships,
    principal_id: principalId,
  });
  if (invitationError) return principalFailure("Customer access invitation failed safely.", 500);

  return {
    data: {
      access_status: "invitation_created",
      expires_at: expiresAt.toISOString(),
      invitation_url_path: `/customer-access/activate?invite=${encodeURIComponent(invitationToken)}`,
      principal_id: principalId,
    },
    ok: true,
  };
}

function parseInvitation(value: unknown) {
  const token = text(value, 4096);
  const secret = invitationSecret();
  if (!token || !secret) return null;
  const payload = parseSignedToken(token, invitationPrefix, secret);
  const principalId = uuid(payload?.principal_id);
  const issuedAt = Number(payload?.iat);
  const expiresAt = Number(payload?.exp);
  if (
    payload?.type !== customerPrincipalAccessVersion ||
    !principalId ||
    !Number.isInteger(issuedAt) ||
    !Number.isInteger(expiresAt) ||
    expiresAt - issuedAt > customerPrincipalInviteLifetimeSeconds ||
    expiresAt <= Math.floor(Date.now() / 1000)
  ) return null;
  return { expiresAt, principalId, token };
}

function sixDigitOtp() {
  return String(Number.parseInt(randomBytes(4).toString("hex"), 16) % 1_000_000).padStart(6, "0");
}

function emailChallengeConfig(): EmailChallengeConfig | null {
  if (process.env.PRESTIGE_CUSTOMER_PRINCIPAL_EMAIL_OTP_ENABLED !== "true") return null;
  const apiKey = configValue("RESEND_API_KEY");
  const from = process.env.PRESTIGE_CUSTOMER_PRINCIPAL_EMAIL_FROM?.trim();
  const fromAddress = from?.match(/<([^<>]+)>$/)?.[1] || from;
  if (!apiKey || !from || /[\r\n]/.test(from) || !normalizedEmail(fromAddress)) return null;
  return { apiKey, from };
}

async function sendEmailChallenge(
  email: string,
  code: string,
  purpose: EmailChallengePurpose,
  config: EmailChallengeConfig,
) {
  try {
    const response = await fetch(resendEmailApiUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: config.from,
        subject: "Your Prestige SG verification code",
        text: `Your Prestige SG verification code is ${code}. It expires in ${emailChallengeLifetimeSeconds / 60} minutes.`,
        to: [email],
        headers: { "X-Entity-Ref-ID": hashSecret(`${email}:${purpose}:${code}`) },
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function reserveCustomerPrincipalEmailChallenge(
  client: PrincipalClient,
  principalId: string,
  purpose: EmailChallengePurpose,
  challengeHash: string,
  requestIpHash: string,
) {
  const { data, error } = await client.rpc(reserveEmailChallengeRpc, {
    p_challenge_hash: challengeHash,
    p_challenge_purpose: purpose,
    p_principal_id: principalId,
    p_request_ip_hash: requestIpHash,
  });
  const row = asRecord(asArray(data)[0]);
  if (error || typeof row.allowed !== "boolean") return null;
  const challengeId = uuid(row.challenge_id);
  if (row.allowed && !challengeId) return null;
  return { allowed: row.allowed, challengeId };
}

export async function startCustomerPrincipalEmailChallenge(
  input: unknown,
): Promise<AdminBookingResult<{ challenge_id: string; purpose: EmailChallengePurpose }>> {
  const body = asRecord(input);
  const purpose: EmailChallengePurpose = body.purpose === "forgot_pin"
    ? "forgot_pin"
    : body.purpose === "new_device"
      ? "new_device"
      : "activation";
  const invite = purpose === "activation" ? parseInvitation(body.invitation) : null;
  const email = normalizedEmail(body.email);
  const clientResult = principalClient();
  if (!clientResult.ok) return clientResult;

  let principalId = invite?.principalId || null;
  if (invite) {
    const { data, error } = await clientResult.data
      .from(invitationTable)
      .select("id, used_at, revoked_at, expires_at")
      .eq("invitation_token_hash", hashSecret(invite.token))
      .eq("principal_id", invite.principalId)
      .limit(1);
    const row = asRecord(asArray(data)[0]);
    if (error || !row.id || row.used_at || row.revoked_at || Date.parse(String(row.expires_at)) <= Date.now()) {
      return principalFailure("Customer invitation is invalid or has already been used.", 403);
    }
  } else if (email) {
    const { data } = await clientResult.data
      .from(principalAccessTable)
      .select("id")
      .eq("normalized_email", email)
      .eq("principal_status", "active")
      .limit(1);
    principalId = uuid(asRecord(asArray(data)[0]).id);
  }
  if (!principalId) return principalFailure("Customer verification request is invalid.", 403);

  const { data: principalRows } = await clientResult.data
    .from(principalAccessTable)
    .select("normalized_email")
    .eq("id", principalId)
    .limit(1);
  const targetEmail = normalizedEmail(asRecord(asArray(principalRows)[0]).normalized_email);
  if (!targetEmail) return principalFailure("Customer verification request is invalid.", 403);

  const emailConfig = emailChallengeConfig();
  const requestIpHash = customerPrincipalEmailIpHash(body.requestIp);
  if (!emailConfig || !requestIpHash) {
    return principalFailure("Customer verification email could not be sent.", 503);
  }
  const code = sixDigitOtp();
  const reservation = await reserveCustomerPrincipalEmailChallenge(
    clientResult.data,
    principalId,
    purpose,
    hashSecret(`${principalId}:${purpose}:${code}`),
    requestIpHash,
  );
  if (!reservation) {
    return principalFailure("Customer verification request failed safely.", 503);
  }
  if (!reservation.allowed) {
    return principalFailure("Too many verification requests. Try again in 15 minutes.", 429);
  }
  if (!reservation.challengeId || !(await sendEmailChallenge(targetEmail, code, purpose, emailConfig))) {
    return principalFailure("Customer verification email could not be sent.", 503);
  }
  return { data: { challenge_id: reservation.challengeId, purpose }, ok: true };
}

function installationId(value: unknown) {
  const cleaned = text(value, 160);
  return cleaned && /^[A-Za-z0-9._:-]{16,160}$/.test(cleaned) ? cleaned : null;
}

function serializeSessionCookie(token: string) {
  return [
    `${sessionCookieName}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${customerPrincipalSessionLifetimeSeconds}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Priority=High",
  ].join("; ");
}

export function readCustomerPrincipalTokenFromRequest(request: Request) {
  const header = request.headers.get("x-prestige-customer-session-token")?.trim();
  if (header && isCustomerPrincipalSessionToken(header)) return header;
  const cookie = request.headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== sessionCookieName) continue;
    try {
      const value = decodeURIComponent(rest.join("=")).trim();
      return isCustomerPrincipalSessionToken(value) ? value : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function expiredCustomerPrincipalSessionCookie() {
  return [
    `${sessionCookieName}=`,
    "Path=/",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Priority=High",
  ].join("; ");
}

async function createPrincipalDeviceSession(
  client: PrincipalClient,
  principalId: string,
  rawInstallationId: string,
  faceIdEnrolled: boolean,
) {
  const installationHash = hashSecret(rawInstallationId);
  const { data: existingRows } = await client
    .from(deviceTable)
    .select("id, principal_id, device_status")
    .eq("installation_id_hash", installationHash)
    .limit(1);
  const existing = asRecord(asArray(existingRows)[0]);
  if (existing.id && existing.principal_id !== principalId) {
    return principalFailure<{ cookie: string; device_id: string }>("This app installation is already bound to another account.", 409);
  }
  let deviceId = uuid(existing.id);
  if (deviceId && existing.device_status !== "active") {
    const { error } = await client
      .from(deviceTable)
      .update({
        device_status: "active",
        face_id_enrolled: faceIdEnrolled,
        last_seen_at: new Date().toISOString(),
        revoked_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", deviceId)
      .eq("principal_id", principalId);
    if (error) {
      return principalFailure<{ cookie: string; device_id: string }>(
        "Customer device enrollment failed safely.",
        500,
      );
    }
  }
  if (!deviceId) {
    const { data, error } = await client
      .from(deviceTable)
      .insert({
        device_status: "active",
        face_id_enrolled: faceIdEnrolled,
        installation_id_hash: installationHash,
        last_seen_at: new Date().toISOString(),
        principal_id: principalId,
      })
      .select("id")
      .single();
    if (error) return principalFailure<{ cookie: string; device_id: string }>("Customer device enrollment failed safely.", 500);
    deviceId = uuid(asRecord(data).id);
  }
  if (!deviceId) return principalFailure<{ cookie: string; device_id: string }>("Customer device enrollment failed safely.", 500);

  return createSessionForExistingDevice(client, principalId, deviceId);
}

async function createSessionForExistingDevice(
  client: PrincipalClient,
  principalId: string,
  deviceId: string,
) {
  const sessionId = randomUUID();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresAtSeconds = nowSeconds + customerPrincipalSessionLifetimeSeconds;
  const secret = principalSessionSecret();
  if (!secret) return principalFailure<{ cookie: string; device_id: string }>("Customer access configuration is not ready.", 503);
  const token = signedToken(sessionPrefix, {
    device_id: deviceId,
    exp: expiresAtSeconds,
    iat: nowSeconds,
    principal_id: principalId,
    session_id: sessionId,
    type: customerPrincipalAccessVersion,
  }, secret);
  const { error } = await client.from(sessionTable).insert({
    device_id: deviceId,
    expires_at: new Date(expiresAtSeconds * 1000).toISOString(),
    id: sessionId,
    principal_id: principalId,
    session_status: "active",
    session_token_hash: hashSecret(token),
  });
  if (error) return principalFailure<{ cookie: string; device_id: string }>("Customer device enrollment failed safely.", 500);
  return { data: { cookie: serializeSessionCookie(token), device_id: deviceId }, ok: true } as const;
}

export async function completeCustomerPrincipalActivation(
  input: unknown,
): Promise<AdminBookingResult<CustomerPrincipalDeviceSessionResult>> {
  const body = asRecord(input);
  const invite = parseInvitation(body.invitation);
  const challengeId = uuid(body.challengeId);
  const code = text(body.code, 6);
  const pin = text(body.pin, 6);
  const rawInstallationId = installationId(body.installationId);
  const faceIdEnrolled = body.faceIdEnrolled === true;
  if (!invite || !challengeId || !code || !pin || !rawInstallationId || !customerPinPattern.test(code) || !customerPinPattern.test(pin)) {
    return principalFailure<{ cookie: string; device_id: string }>("Customer activation details are invalid.", 400);
  }
  const clientResult = principalClient();
  if (!clientResult.ok) return clientResult;
  const client = clientResult.data;
  const { data: challengeRows } = await client
    .from(challengeTable)
    .select("id, principal_id, challenge_hash, challenge_purpose, expires_at, used_at, attempt_count")
    .eq("id", challengeId)
    .eq("principal_id", invite.principalId)
    .limit(1);
  const challenge = asRecord(asArray(challengeRows)[0]);
  if (
    challenge.challenge_purpose !== "activation" || challenge.used_at ||
    Date.parse(String(challenge.expires_at)) <= Date.now() ||
    Number(challenge.attempt_count) >= maxPinFailuresPerDeviceWindow ||
    challenge.challenge_hash !== hashSecret(`${invite.principalId}:activation:${code}`)
  ) {
    await client.from(challengeTable).update({ attempt_count: Math.min(5, Number(challenge.attempt_count || 0) + 1) }).eq("id", challengeId);
    return principalFailure<{ cookie: string; device_id: string }>("Customer verification code is invalid or expired.", 403);
  }
  const pinHash = await hashCustomerPin(pin);
  const now = new Date().toISOString();
  const { data: claimedChallenge, error: challengeClaimError } = await client
    .from(challengeTable)
    .update({ used_at: now })
    .eq("id", challengeId)
    .eq("principal_id", invite.principalId)
    .is("used_at", null)
    .select("id")
    .maybeSingle();
  if (challengeClaimError || uuid(asRecord(claimedChallenge).id) !== challengeId) {
    return principalFailure<CustomerPrincipalDeviceSessionResult>(
      "Customer verification code is invalid or has already been used.",
      409,
    );
  }
  const { data: claimedInvitation, error: invitationClaimError } = await client
    .from(invitationTable)
    .update({ used_at: now })
    .eq("invitation_token_hash", hashSecret(invite.token))
    .eq("principal_id", invite.principalId)
    .is("used_at", null)
    .is("revoked_at", null)
    .gt("expires_at", now)
    .select("id, membership_scope")
    .maybeSingle();
  if (invitationClaimError || !uuid(asRecord(claimedInvitation).id)) {
    return principalFailure<CustomerPrincipalDeviceSessionResult>(
      "Customer invitation is invalid or has already been used.",
      409,
    );
  }
  const { data: principalRoleRows, error: principalRoleError } = await client
    .from(principalAccessTable)
    .select("principal_role")
    .eq("id", invite.principalId)
    .limit(1);
  const principalRoleValue = asRecord(asArray(principalRoleRows)[0]).principal_role;
  const principalRole: PrincipalRole | null =
    principalRoleValue === "pa" || principalRoleValue === "boss"
      ? principalRoleValue
      : null;
  const scopedMemberships = principalRole
    ? asArray(asRecord(claimedInvitation).membership_scope)
        .map((entry) => {
          const row = asRecord(entry);
          const membershipInput = {
            bookerId: row.booker_id,
            companyId: row.company_id,
            customerAccountReference: row.customer_account_reference,
            travelerId: row.traveler_id,
            verifiedBossName: row.verified_boss_name,
          };
          return principalRole === "pa" && row.traveler_id === null
            ? bookerRootMembership(membershipInput)
            : inviteMembership(membershipInput, principalRole);
        })
        .filter((entry): entry is CustomerPrincipalMembership => Boolean(entry))
    : [];
  if (
    principalRoleError ||
    !principalRole ||
    scopedMemberships.length === 0 ||
    scopedMemberships.length !== asArray(asRecord(claimedInvitation).membership_scope).length ||
    (principalRole === "boss" && scopedMemberships.length !== 1)
  ) {
    return principalFailure<CustomerPrincipalDeviceSessionResult>(
      "Customer invitation scope is invalid.",
      409,
    );
  }
  const rootMembership = scopedMemberships.length === 1 && scopedMemberships[0].traveler_id === null
    ? scopedMemberships[0]
    : null;
  const membershipSaved = rootMembership
    ? await persistBookerRootMembership(client, rootMembership, invite.principalId)
    : !(
        await client.from(membershipTable).upsert(
          scopedMemberships.map((membership) => ({
            ...membership,
            membership_status: "active",
            principal_id: invite.principalId,
            revoked_at: null,
          })),
          { onConflict: "principal_id,company_id,booker_id,traveler_id" },
        )
      ).error;
  if (!membershipSaved) {
    return principalFailure<CustomerPrincipalDeviceSessionResult>(
      "Customer activation failed safely.",
      500,
    );
  }
  const { error: principalError } = await client.from(principalAccessTable).update({
    email_verified_at: now,
    pin_hash: pinHash,
    pin_updated_at: now,
    principal_status: "active",
    updated_at: now,
  }).eq("id", invite.principalId);
  if (principalError) return principalFailure<{ cookie: string; device_id: string }>("Customer activation failed safely.", 500);

  const { data: memberships } = await client.from(membershipTable).select("customer_account_reference").eq("principal_id", invite.principalId).eq("membership_status", "active");
  for (const row of asArray(memberships).map(asRecord)) {
    const reference = safeAccountReference(row.customer_account_reference);
    if (reference) {
      await client.from("customer_access_accounts").update({ principal_cutover_at: now, legacy_link_revoked_at: now }).eq("customer_account_reference", reference);
    }
  }
  return createPrincipalDeviceSession(client, invite.principalId, rawInstallationId, faceIdEnrolled);
}

export function isCustomerPrincipalSessionToken(value: unknown) {
  return Boolean(resolveCustomerPrincipalSessionToken(value));
}

export function resolveCustomerPrincipalSessionToken(value: unknown): CustomerPrincipalSession | null {
  const token = text(value, 4096);
  const secret = principalSessionSecret();
  if (!token || !secret) return null;
  const payload = parseSignedToken(token, sessionPrefix, secret) as PrincipalSessionPayload | null;
  const principalId = uuid(payload?.principal_id);
  const deviceId = uuid(payload?.device_id);
  const sessionId = uuid(payload?.session_id);
  const expiresAt = Number(payload?.exp);
  if (
    payload?.type !== customerPrincipalAccessVersion || !principalId || !deviceId || !sessionId ||
    !Number.isInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)
  ) return null;
  return {
    device_id: deviceId,
    expires_at: new Date(expiresAt * 1000).toISOString(),
    principal_id: principalId,
    session_id: sessionId,
  };
}

export async function assertActiveCustomerPrincipalSession(
  token: string,
): Promise<AdminBookingResult<CustomerPrincipalAccessContext>> {
  const session = resolveCustomerPrincipalSessionToken(token);
  const clientResult = principalClient();
  if (!session || !clientResult.ok) return principalFailure("Customer app access is required.", 403);
  const client = clientResult.data;
  const tokenHash = hashSecret(token);
  const { data: sessionRows } = await client.from(sessionTable)
    .select("id, principal_id, device_id, session_status, expires_at")
    .eq("id", session.session_id).eq("session_token_hash", tokenHash).limit(1);
  const sessionRow = asRecord(asArray(sessionRows)[0]);
  if (sessionRow.session_status !== "active" || Date.parse(String(sessionRow.expires_at)) <= Date.now()) {
    return principalFailure("Customer app access is required.", 403);
  }
  const { data: deviceRows } = await client.from(deviceTable)
    .select("id, principal_id, device_status").eq("id", session.device_id).limit(1);
  const device = asRecord(asArray(deviceRows)[0]);
  if (device.device_status !== "active" || device.principal_id !== session.principal_id) {
    return principalFailure("Customer app access is required.", 403);
  }
  const { data: principalRows } = await client.from(principalAccessTable)
    .select("id, normalized_email, principal_role, principal_status")
    .eq("id", session.principal_id).limit(1);
  const principal = asRecord(asArray(principalRows)[0]);
  if (principal.principal_status !== "active") return principalFailure("Customer app access is required.", 403);
  const role = principal.principal_role === "pa" || principal.principal_role === "boss" ? principal.principal_role : null;
  const email = normalizedEmail(principal.normalized_email);
  if (!role || !email) return principalFailure("Customer app access is required.", 403);
  const { data: membershipRows } = await client.from(membershipTable)
    .select("company_id, booker_id, traveler_id, customer_account_reference, membership_role, membership_status, verified_boss_name")
    .eq("principal_id", session.principal_id).eq("membership_status", "active");
  const memberships = asArray(membershipRows)
    .map((row) => {
      const record = asRecord(row);
      const membershipInput = {
        bookerId: record.booker_id,
        companyId: record.company_id,
        customerAccountReference: record.customer_account_reference,
        travelerId: record.traveler_id,
        verifiedBossName: record.verified_boss_name,
      };
      return role === "pa" && record.traveler_id === null
        ? bookerRootMembership(membershipInput)
        : inviteMembership(membershipInput, role);
    })
    .filter((value): value is CustomerPrincipalMembership => Boolean(value));
  if (memberships.length === 0) return principalFailure("Customer app access is required.", 403);
  let effectiveMemberships = memberships;
  const bookerRoot = role === "pa"
    ? memberships.find((membership) => membership.traveler_id === null)
    : null;
  if (bookerRoot) {
    effectiveMemberships = [bookerRoot];
  } else if (role === "pa") {
    const roots = new Map<string, CustomerPrincipalMembership>();
    for (const membership of memberships) {
      roots.set(
        `${membership.company_id}:${membership.booker_id}:${membership.customer_account_reference}`,
        membership,
      );
    }
    const expandedMemberships: CustomerPrincipalMembership[] = [];
    for (const root of roots.values()) {
      const { data: travelerRows, error: travelerError } = await client
        .from("travelers")
        .select("id, company_id, booker_id, traveler_name")
        .eq("company_id", root.company_id)
        .eq("booker_id", root.booker_id);
      if (travelerError) return principalFailure("Customer app access is required.", 403);
      for (const row of asArray(travelerRows)) {
        const traveler = asRecord(row);
        const travelerId = positiveId(traveler.id);
        const verifiedBossName = text(traveler.traveler_name, 160);
        if (travelerId && verifiedBossName) {
          expandedMemberships.push({
            ...root,
            membership_role: "managing_pa",
            traveler_id: travelerId,
            verified_boss_name: verifiedBossName,
          });
        }
      }
    }
    if (expandedMemberships.length === 0) {
      return principalFailure("Customer app access is required.", 403);
    }
    effectiveMemberships = expandedMemberships;
  }
  const now = new Date();
  await client.from(sessionTable).update({ last_seen_at: now.toISOString(), updated_at: now.toISOString() }).eq("id", session.session_id);
  let renewedCookie: string | undefined;
  if (Date.parse(session.expires_at) - now.getTime() < 30 * 24 * 60 * 60 * 1000) {
    const renewed = await createSessionForExistingDevice(
      client,
      session.principal_id,
      session.device_id,
    );
    if (renewed.ok) renewedCookie = renewed.data.cookie;
  }
  return {
    data: {
      ...session,
      memberships: effectiveMemberships,
      normalized_email: email,
      principal_role: role,
      ...(renewedCookie ? { renewed_cookie: renewedCookie } : {}),
    },
    ok: true,
  };
}

export async function customerPrincipalPinLogin(
  input: unknown,
): Promise<AdminBookingResult<CustomerPrincipalDeviceSessionResult>> {
  const body = asRecord(input);
  const email = normalizedEmail(body.email);
  const pin = text(body.pin, 6);
  const rawInstallationId = installationId(body.installationId);
  const otpChallengeId = uuid(body.challengeId);
  const otpCode = text(body.code, 6);
  if (!email || !pin || !rawInstallationId || !customerPinPattern.test(pin)) {
    return principalFailure<{ cookie: string; device_id: string }>("Customer sign in details are invalid.", 400);
  }
  const clientResult = principalClient();
  if (!clientResult.ok) return clientResult;
  const client = clientResult.data;
  const { data: principalRows } = await client.from(principalAccessTable)
    .select("id, pin_hash, principal_status").eq("normalized_email", email).limit(1);
  const principal = asRecord(asArray(principalRows)[0]);
  const principalId = uuid(principal.id);
  if (!principalId || principal.principal_status !== "active" || typeof principal.pin_hash !== "string") {
    return principalFailure("Customer sign in failed safely.", 403);
  }
  const installationHash = hashSecret(rawInstallationId);
  const { data: deviceRows } = await client.from(deviceTable)
    .select("id, principal_id, device_status").eq("installation_id_hash", installationHash).limit(1);
  const device = asRecord(asArray(deviceRows)[0]);
  const genuinelyNewDevice = !device.id || device.device_status !== "active";
  if (device.id && device.principal_id !== principalId) {
    return principalFailure("This app installation is already bound to another account.", 409);
  }
  let validatedNewDeviceChallengeId: string | null = null;
  if (genuinelyNewDevice) {
    if (!otpChallengeId || !otpCode || !customerPinPattern.test(otpCode)) {
      return principalFailure("One-time email verification is required on a new device.", 428);
    }
    const { data: challengeRows } = await client.from(challengeTable)
      .select("challenge_hash, challenge_purpose, expires_at, used_at")
      .eq("id", otpChallengeId).eq("principal_id", principalId).limit(1);
    const challenge = asRecord(asArray(challengeRows)[0]);
    if (challenge.challenge_purpose !== "new_device" || challenge.used_at || Date.parse(String(challenge.expires_at)) <= Date.now() || challenge.challenge_hash !== hashSecret(`${principalId}:new_device:${otpCode}`)) {
      return principalFailure("One-time email verification is invalid or expired.", 403);
    }
    validatedNewDeviceChallengeId = otpChallengeId;
  }

  const ipHash = hashSecret(text(body.ipKey, 256) || "unavailable");
  const deviceId = uuid(device.id);
  const { data: attemptRows } = await client.from(attemptTable)
    .select("id, installation_id_hash, failure_count, window_started_at, locked_until")
    .eq("principal_id", principalId).eq("ip_hash", ipHash)
    .limit(100);
  const attempts = asArray(attemptRows).map(asRecord);
  const attempt = attempts.find((row) => row.installation_id_hash === installationHash) || {};
  const accountIpFailures = attempts.reduce((total, row) => {
    const withinWindow =
      Date.now() - Date.parse(String(row.window_started_at || 0)) <
      customerPrincipalPinLockSeconds * 1000;
    return total + (withinWindow ? Number(row.failure_count || 0) : 0);
  }, 0);
  if (
    accountIpFailures >= maxPinFailuresPerDeviceWindow * 2 ||
    attempts.some(
      (row) => row.locked_until && Date.parse(String(row.locked_until)) > Date.now(),
    )
  ) {
    return principalFailure("Customer sign in is temporarily locked. Try again in 15 minutes.", 429);
  }
  if (!(await verifyCustomerPin(pin, String(principal.pin_hash)))) {
    const withinWindow = Date.now() - Date.parse(String(attempt.window_started_at || 0)) < customerPrincipalPinLockSeconds * 1000;
    const failures = withinWindow ? Number(attempt.failure_count || 0) + 1 : 1;
    const update = {
      failure_count: failures,
      installation_id_hash: installationHash,
      locked_until: failures >= maxPinFailuresPerDeviceWindow ? new Date(Date.now() + customerPrincipalPinLockSeconds * 1000).toISOString() : null,
      principal_id: principalId,
      device_id: deviceId,
      ip_hash: ipHash,
      window_started_at: withinWindow ? attempt.window_started_at : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (attempt.id) await client.from(attemptTable).update(update).eq("id", attempt.id);
    else await client.from(attemptTable).insert(update);
    return principalFailure("Customer sign in failed safely.", failures >= maxPinFailuresPerDeviceWindow ? 429 : 403);
  }
  if (validatedNewDeviceChallengeId) {
    const { data: claimedChallenge, error: claimError } = await client
      .from(challengeTable)
      .update({ used_at: new Date().toISOString() })
      .eq("id", validatedNewDeviceChallengeId)
      .eq("principal_id", principalId)
      .is("used_at", null)
      .select("id")
      .maybeSingle();
    if (
      claimError ||
      uuid(asRecord(claimedChallenge).id) !== validatedNewDeviceChallengeId
    ) {
      return principalFailure("One-time email verification has already been used.", 409);
    }
  }
  if (attempt.id) await client.from(attemptTable).update({ failure_count: 0, locked_until: null, window_started_at: new Date().toISOString() }).eq("id", attempt.id);
  return createPrincipalDeviceSession(client, principalId, rawInstallationId, body.faceIdEnrolled === true);
}

export async function revokeCustomerPrincipalAccess(
  input: unknown,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<CustomerPrincipalRevokeResult>> {
  if (!adminMayIssue(actor)) return principalFailure("Only Owner Admin may manage Customer app access.", 403);
  const principalId = uuid(asRecord(input).principalId);
  if (!principalId) return principalFailure("Customer access revoke request is invalid.", 400);
  const clientResult = principalClient();
  if (!clientResult.ok) return clientResult;
  const now = new Date().toISOString();
  await clientResult.data.from(principalAccessTable).update({ principal_status: "revoked", revoked_at: now }).eq("id", principalId);
  await clientResult.data.from(membershipTable).update({ membership_status: "revoked", revoked_at: now }).eq("principal_id", principalId);
  await clientResult.data.from(deviceTable).update({ device_status: "revoked", revoked_at: now }).eq("principal_id", principalId);
  await clientResult.data.from(sessionTable).update({ session_status: "revoked", revoked_at: now }).eq("principal_id", principalId);
  await clientResult.data.from("customer_device_push_subscriptions").update({ subscription_status: "revoked", revoked_at: now }).eq("principal_id", principalId);
  return { data: { principal_id: principalId, revoked: true }, ok: true } as const;
}

export async function completeCustomerPrincipalPinRecovery(
  input: unknown,
): Promise<AdminBookingResult<CustomerPrincipalDeviceSessionResult>> {
  const body = asRecord(input);
  const email = normalizedEmail(body.email);
  const challengeId = uuid(body.challengeId);
  const code = text(body.code, 6);
  const pin = text(body.pin, 6);
  const rawInstallationId = installationId(body.installationId);
  if (!email || !challengeId || !code || !pin || !rawInstallationId || !customerPinPattern.test(code) || !customerPinPattern.test(pin)) {
    return principalFailure<{ cookie: string; device_id: string }>("Customer PIN recovery details are invalid.", 400);
  }
  const clientResult = principalClient();
  if (!clientResult.ok) return clientResult;
  const client = clientResult.data;
  const { data: principalRows } = await client.from(principalAccessTable)
    .select("id, principal_status").eq("normalized_email", email).limit(1);
  const principal = asRecord(asArray(principalRows)[0]);
  const principalId = uuid(principal.id);
  if (!principalId || principal.principal_status !== "active") {
    return principalFailure("Customer PIN recovery failed safely.", 403);
  }
  const { data: challengeRows } = await client.from(challengeTable)
    .select("challenge_hash, challenge_purpose, expires_at, used_at")
    .eq("id", challengeId).eq("principal_id", principalId).limit(1);
  const challenge = asRecord(asArray(challengeRows)[0]);
  if (challenge.challenge_purpose !== "forgot_pin" || challenge.used_at || Date.parse(String(challenge.expires_at)) <= Date.now() || challenge.challenge_hash !== hashSecret(`${principalId}:forgot_pin:${code}`)) {
    return principalFailure("Customer verification code is invalid or expired.", 403);
  }
  const now = new Date().toISOString();
  const pinHash = await hashCustomerPin(pin);
  const { data: claimedChallenge, error: claimError } = await client
    .from(challengeTable)
    .update({ used_at: now })
    .eq("id", challengeId)
    .eq("principal_id", principalId)
    .is("used_at", null)
    .select("id")
    .maybeSingle();
  if (claimError || uuid(asRecord(claimedChallenge).id) !== challengeId) {
    return principalFailure<CustomerPrincipalDeviceSessionResult>(
      "Customer verification code is invalid or has already been used.",
      409,
    );
  }
  const { error } = await client.from(principalAccessTable).update({
    pin_hash: pinHash,
    pin_updated_at: now,
    updated_at: now,
  }).eq("id", principalId).eq("principal_status", "active");
  if (error) return principalFailure("Customer PIN recovery failed safely.", 500);
  await client.from(sessionTable).update({ session_status: "revoked", revoked_at: now }).eq("principal_id", principalId);
  await client.from(deviceTable).update({ device_status: "revoked", revoked_at: now }).eq("principal_id", principalId);
  await client.from("customer_device_push_subscriptions").update({ subscription_status: "revoked", revoked_at: now }).eq("principal_id", principalId);
  return createPrincipalDeviceSession(client, principalId, rawInstallationId, body.faceIdEnrolled === true);
}

export async function logoutCustomerPrincipalDevice(token: unknown) {
  const rawToken = text(token, 4096);
  const session = resolveCustomerPrincipalSessionToken(rawToken);
  const clientResult = principalClient();
  if (!rawToken || !session || !clientResult.ok) return principalFailure("Customer app access is required.", 403);
  const now = new Date().toISOString();
  await clientResult.data.from(sessionTable).update({ session_status: "revoked", revoked_at: now }).eq("id", session.session_id).eq("session_token_hash", hashSecret(rawToken));
  await clientResult.data.from(deviceTable).update({ device_status: "revoked", revoked_at: now }).eq("id", session.device_id).eq("principal_id", session.principal_id);
  await clientResult.data.from("customer_device_push_subscriptions").update({ subscription_status: "revoked", revoked_at: now }).eq("device_id", session.device_id).eq("principal_id", session.principal_id);
  return { data: { logged_out: true }, ok: true } as const;
}
