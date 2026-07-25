import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const appPagePath = "app/page.tsx";
const bookingPagePath = "app/book/page.tsx";
const invitationHelperPath = "lib/customer-booking-invitation.ts";
const invitationRoutePath = "app/api/admin-customer-booking-invitations/route.ts";
const bookingRequestRoutePath = "app/api/customer-booking-requests/route.ts";
const bookingRequestAdapterPath = "lib/customer-booking-request-adapter.ts";
const bookingPersistencePath = "lib/admin-booking-persistence.ts";
const bookingSupabaseAdapterPath = "lib/admin-booking-supabase-adapter.ts";
const ledgerPath = "docs/current-implementation-ledger.md";

const [
  appPageSource,
  bookingPageSource,
  invitationHelperSource,
  invitationRouteSource,
  bookingRequestRouteSource,
  bookingRequestAdapterSource,
  bookingPersistenceSource,
  bookingSupabaseAdapterSource,
  ledgerSource,
] = await Promise.all(
  [
    appPagePath,
    bookingPagePath,
    invitationHelperPath,
    invitationRoutePath,
    bookingRequestRoutePath,
    bookingRequestAdapterPath,
    bookingPersistencePath,
    bookingSupabaseAdapterPath,
    ledgerPath,
  ].map((relativePath) => readFile(path.join(process.cwd(), relativePath), "utf8")),
);

assert.equal(
  invitationHelperSource.includes('import "server-only"') &&
    invitationHelperSource.includes("createHmac") &&
    invitationHelperSource.includes("timingSafeEqual") &&
    invitationHelperSource.includes("randomBytes") &&
    invitationHelperSource.includes("PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_SECRET") &&
    invitationHelperSource.includes("customerBookingInvitationReference"),
  true,
  "Booking invitations must be random, signed, server-only, and map to one deterministic booking reference.",
);

assert.equal(
    invitationRouteSource.includes("resolveAdminCustomerInvoiceBoundary") &&
    invitationRouteSource.includes("createCustomerBookingInvitationToken") &&
    invitationRouteSource.includes('`/book?invite=${encodeURIComponent(result.data.token)}`') &&
    !/supabase|\.from\(|\.insert\(|\.update\(|\.delete\(/i.test(invitationRouteSource),
  true,
  "The invitation issuer must use the existing admin boundary and remain stateless/provider-free.",
);

assert.equal(
  bookingRequestRouteSource.includes("verifyCustomerBookingInvitationToken") &&
    bookingRequestRouteSource.includes("loadAdminBookingByReference") &&
    bookingRequestRouteSource.includes("customer-booking-invitation") &&
    bookingRequestRouteSource.includes("invitation_used") &&
    bookingRequestRouteSource.includes("groupReferenceOverride") &&
    bookingRequestRouteSource.includes("verifyCustomerBookingPhoneOtpProof"),
  true,
  "Private invitations must retain priority over the additive public phone-proof boundary while the established route remains the only write lane.",
);

assert.equal(
  bookingRequestRouteSource.includes("await notifyAdminNewBookingRequest(primaryRequest)") &&
    bookingSupabaseAdapterSource.includes(
      "const customerIdResult = await findOrCreateCustomerId(client, input.booking, actor);",
    ) &&
    bookingSupabaseAdapterSource.includes(
      "const contactResult = await ensureCustomerContact(client, customerId, input.booking);",
    ),
  true,
  "An invited request must retain the existing CRM customer/contact creation and admin alert handoff.",
);

assert.equal(
  bookingPersistenceSource.includes("groupReferenceOverride?: string") &&
    bookingPersistenceSource.includes("options.groupReferenceOverride") &&
    bookingPersistenceSource.includes("createCustomerBookingRequestReference()"),
  true,
  "The existing parser must accept only a server-supplied invitation reference override and preserve normal references.",
);

assert.equal(
  bookingRequestAdapterSource.includes("invitationToken?: string") &&
    bookingRequestAdapterSource.includes('"x-prestige-customer-booking-invitation"') &&
    bookingRequestAdapterSource.includes('"invitation_required"') &&
    bookingRequestAdapterSource.includes('"invitation_invalid"') &&
    bookingRequestAdapterSource.includes('"invitation_used"') &&
    bookingPageSource.includes('searchParams.get("invite")') &&
    bookingPageSource.includes("Ask Prestige Limo for a new booking invitation"),
  true,
  "The existing /book form must carry the private invitation outside the booking payload and show a safe recovery message.",
);

assert.equal(
  appPageSource.includes('const adminCustomerBookingInvitationsApiPath = "/api/admin-customer-booking-invitations"') &&
    appPageSource.includes("Copy Booking Invite") &&
    appPageSource.includes("createCustomerBookingInvitationLink") &&
    appPageSource.includes("copyCustomerDriverDetailsWithCustomerAppLink") &&
    appPageSource.includes("data-admin-customer-driver-details-copy-with-portal-link=\"true\""),
  true,
  "Dispatch must reuse the existing Copy + App Link control for the no-booking invitation mode.",
);

assert.equal(
  ledgerSource.includes("Admin-Issued One-Time Customer Booking Invitation") &&
    ledgerSource.includes("existing `Copy + App Link` control") &&
    ledgerSource.includes("Invitation creation remains stateless and provider-free"),
  true,
  "The ledger must record the exact established invitation lane and its provider-free boundary.",
);

const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-booking-invitation-"));
const helperOutputPath = path.join(tempDir, "lib/customer-booking-invitation.js");
const boundaryStubPath = path.join(tempDir, "lib/admin-customer-invoice-boundary.js");
const routeOutputPath = path.join(
  tempDir,
  "app/api/admin-customer-booking-invitations/route.js",
);
const serverOnlyStubPath = path.join(tempDir, "node_modules/server-only/index.js");
const originalEnabled = process.env.PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_ENABLED;
const originalSecret = process.env.PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_SECRET;

try {
  await mkdir(path.dirname(helperOutputPath), { recursive: true });
  await mkdir(path.dirname(routeOutputPath), { recursive: true });
  await mkdir(path.dirname(serverOnlyStubPath), { recursive: true });
  await writeFile(serverOnlyStubPath, "module.exports = {};\n");
  await writeFile(
    boundaryStubPath,
    [
      "function resolveAdminCustomerInvoiceBoundary() {",
      "  return globalThis.__prestigeCustomerBookingInvitationBoundary;",
      "}",
      "module.exports = { resolveAdminCustomerInvoiceBoundary };",
    ].join("\n"),
  );
  await writeFile(
    helperOutputPath,
    ts.transpileModule(invitationHelperSource, {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: invitationHelperPath,
    }).outputText,
  );
  await writeFile(
    routeOutputPath,
    ts.transpileModule(invitationRouteSource, {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: invitationRoutePath,
    }).outputText,
  );

  process.env.PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_ENABLED = "true";
  process.env.PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_SECRET =
    "customer-booking-invitation-focused-test-secret-value";

  const helper = createRequire(import.meta.url)(helperOutputPath);
  const fixedNow = Date.UTC(2026, 6, 25, 12, 0, 0);
  const created = helper.createCustomerBookingInvitationToken(fixedNow);
  const secondCreated = helper.createCustomerBookingInvitationToken(fixedNow);

  assert.equal(created.ok, true);
  assert.equal(secondCreated.ok, true);
  assert.notEqual(created.data.token, secondCreated.data.token);
  assert.notEqual(created.data.booking_reference, secondCreated.data.booking_reference);

  const verified = helper.verifyCustomerBookingInvitationToken(created.data.token, fixedNow);
  assert.equal(verified.ok, true);
  assert.equal(verified.data.booking_reference, created.data.booking_reference);
  assert.equal(
    helper.customerBookingInvitationReference(verified.data.invitation_id),
    created.data.booking_reference,
  );

  const tampered = helper.verifyCustomerBookingInvitationToken(
    `${created.data.token.slice(0, -1)}${created.data.token.endsWith("x") ? "y" : "x"}`,
    fixedNow,
  );
  assert.equal(tampered.ok, false);
  assert.equal(tampered.status, 403);

  const expired = helper.verifyCustomerBookingInvitationToken(
    created.data.token,
    fixedNow + 7 * 24 * 60 * 60 * 1000,
  );
  assert.equal(expired.ok, false);
  assert.equal(expired.status, 403);

  process.env.PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_ENABLED = "false";
  const disabled = helper.createCustomerBookingInvitationToken(fixedNow);
  assert.equal(disabled.ok, false);
  assert.equal(disabled.status, 503);

  process.env.PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_ENABLED = "true";
  globalThis.__prestigeCustomerBookingInvitationBoundary = {
    actor: { role: "local-dev-admin" },
    context: { role: "local-dev-admin" },
    ok: true,
  };
  const route = createRequire(import.meta.url)(routeOutputPath);
  const routeSuccess = await route.POST(
    new Request("http://localhost/api/admin-customer-booking-invitations", {
      method: "POST",
    }),
  );
  const routeSuccessBody = await routeSuccess.json();

  assert.equal(routeSuccess.status, 200);
  assert.equal(routeSuccessBody.ok, true);
  assert.match(
    routeSuccessBody.url,
    /^http:\/\/localhost\/book\?invite=customer_booking_invitation_v1\./,
  );
  assert.equal(routeSuccess.headers.get("cache-control"), "no-store");

  globalThis.__prestigeCustomerBookingInvitationBoundary = {
    error: "blocked safely",
    ok: false,
    status: 403,
  };
  const routeBlocked = await route.POST(
    new Request("http://localhost/api/admin-customer-booking-invitations", {
      method: "POST",
    }),
  );
  assert.equal(routeBlocked.status, 403);

  for (const method of ["GET", "PUT", "PATCH", "DELETE"]) {
    const blockedMethod = await route[method]();
    assert.equal(blockedMethod.status, 403, `${method} must not issue a booking invitation.`);
  }
} finally {
  delete globalThis.__prestigeCustomerBookingInvitationBoundary;
  if (originalEnabled === undefined) {
    delete process.env.PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_ENABLED;
  } else {
    process.env.PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_ENABLED = originalEnabled;
  }

  if (originalSecret === undefined) {
    delete process.env.PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_SECRET;
  } else {
    process.env.PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_SECRET = originalSecret;
  }

  await rm(tempDir, { force: true, recursive: true });
}

console.log("Customer booking invitation guard passed.");
