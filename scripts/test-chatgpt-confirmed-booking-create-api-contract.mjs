import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const confirmationPath = "lib/admin-booking-confirmation.ts";
const confirmedCreatePath = "lib/admin-booking-confirmed-create.ts";
const idempotencyPath = "lib/admin-booking-idempotency.ts";
const adminRoutePath = "app/api/admin-bookings/route.ts";
const previewRoutePath = "app/api/admin-booking-preview/route.ts";
const appPagePath = "app/page.tsx";
const migrationPath =
  "supabase/migrations/20260802231919_admin_booking_idempotency_reservations.sql";
const originalConfirmationSecret =
  process.env.PRESTIGE_ADMIN_BOOKING_CONFIRMATION_SECRET;

const [
  confirmationSource,
  confirmedCreateSource,
  idempotencySource,
  adminRouteSource,
  previewRouteSource,
  appPageSource,
  migrationSource,
] = await Promise.all([
  readFile(confirmationPath, "utf8"),
  readFile(confirmedCreatePath, "utf8"),
  readFile(idempotencyPath, "utf8"),
  readFile(adminRoutePath, "utf8"),
  readFile(previewRoutePath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(migrationPath, "utf8"),
]);

assert.match(confirmationSource, /createHmac/);
assert.match(confirmationSource, /timingSafeEqual/);
assert.match(confirmationSource, /PRESTIGE_ADMIN_BOOKING_CONFIRMATION_SECRET/);
assert.match(confirmedCreateSource, /normalizeChatGptBookingPreview/);
assert.match(confirmedCreateSource, /createAdminBooking/);
assert.match(confirmedCreateSource, /parseAdminBookingPersistencePayload/);
assert.match(idempotencySource, /admin_booking_idempotency_reservations/);
assert.match(idempotencySource, /idempotency_key_hash/);
assert.match(adminRouteSource, /chatgpt-confirmed-preview/);
assert.match(previewRouteSource, /x-prestige-booking-preview-confirmed/);
assert.match(previewRouteSource, /x-prestige-booking-confirmation-token/);
assert.match(appPageSource, /fetch\("\/api\/admin-bookings"/);
assert.doesNotMatch(appPageSource, /x-prestige-booking-request-source/);
assert.match(migrationSource, /idempotency_key_hash text primary key/);
assert.match(migrationSource, /enable row level security/);
assert.match(migrationSource, /revoke all .* from anon, authenticated/);
assert.match(migrationSource, /grant select, insert, update .* to service_role/);
assert.doesNotMatch(migrationSource, /security definer|create policy/i);
assert.doesNotMatch(
  migrationSource,
  /confirmation_token\s+text|idempotency_key\s+text|source_message\s+text/i,
);

function transpileTypescript(source, filename) {
  return ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
}

async function writeTranspiledFile(tempDir, relativePath) {
  const sourcePath = path.join(process.cwd(), relativePath);
  const outputPath = path.join(tempDir, relativePath.replace(/\.ts$/, ".js"));
  const source = await readFile(sourcePath, "utf8");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, transpileTypescript(source, sourcePath));
}

async function createHarness() {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "prestige-chatgpt-confirmed-booking-"),
  );

  await mkdir(path.join(tempDir, "node_modules/server-only"), { recursive: true });
  await writeFile(path.join(tempDir, "node_modules/server-only/index.js"), "module.exports = {};\n");
  await Promise.all(
    [
      "lib/admin-booking-persistence.ts",
      "lib/chatgpt-booking-preview.ts",
      confirmationPath,
      confirmedCreatePath,
    ].map((relativePath) => writeTranspiledFile(tempDir, relativePath)),
  );
  await writeFile(
    path.join(tempDir, "lib/admin-booking-supabase-adapter.js"),
    `
async function unavailable() {
  return { error: "Harness adapter unavailable.", ok: false, status: 503 };
}
module.exports = {
  createAdminBookingThroughSupabaseAdapter: unavailable,
  loadAdminBookingByReferenceThroughSupabaseAdapter: unavailable,
  listAdminBookingsThroughSupabaseAdapter: unavailable,
  updateAdminBookingThroughSupabaseAdapter: unavailable,
};
`,
  );
  await writeFile(
    path.join(tempDir, "lib/admin-booking-idempotency.js"),
    `
async function unavailable() {
  return { error: "Harness reservation unavailable.", ok: false, status: 503 };
}
module.exports = {
  claimAdminBookingIdempotencyReservation: unavailable,
  completeAdminBookingIdempotencyReservation: unavailable,
  failAdminBookingIdempotencyReservation: unavailable,
  loadAdminBookingIdempotencyReservation: unavailable,
};
`,
  );

  const requireFromHarness = createRequire(path.join(tempDir, "entry.js"));

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    confirmation: requireFromHarness(
      path.join(tempDir, "lib/admin-booking-confirmation.js"),
    ),
    confirmedCreate: requireFromHarness(
      path.join(tempDir, "lib/admin-booking-confirmed-create.js"),
    ),
    preview: requireFromHarness(path.join(tempDir, "lib/chatgpt-booking-preview.js")),
  };
}

function previewInput(overrides = {}) {
  return {
    bag_count: 2,
    contact_email: "operations@example.com",
    contact_name: "Operations Booker",
    contact_phone: "+65 6123 4567",
    customer_or_company_name: "Example Travel",
    dropoff_location: "202 Kim Seng Road",
    flight_number: "TK54",
    passenger_count: 5,
    passenger_name: "Denis Leonardo",
    pickup_date: "2030-08-04",
    pickup_location: "Changi Airport",
    pickup_time: "17:55",
    service_type: "MNG",
    source_message: "Confirmed source message",
    vehicle_type: "VVV",
    ...overrides,
  };
}

function envelope(input, token, idempotencyKey) {
  return {
    booking_preview: input,
    confirmation_token: token,
    idempotency_key: idempotencyKey,
    request_source: "chatgpt-confirmed-preview",
  };
}

function bookingRecord(input) {
  const { booking, route_points: routePoints, service_items: serviceItems } = input;

  return {
    ...booking,
    route_points: routePoints,
    service_items: serviceItems,
  };
}

function inMemoryDependencies() {
  const reservations = new Map();
  const bookings = new Map();
  let createCount = 0;
  let createDelay = 0;

  return {
    bookings,
    dependencies: {
      async claimReservation(input) {
        const existing = reservations.get(input.idempotency_key_hash);

        if (!existing) {
          const reservation = {
            ...input,
            completed_at: null,
            state: "pending",
            updated_at: new Date("2030-08-01T00:00:00.000Z").toISOString(),
          };
          reservations.set(input.idempotency_key_hash, reservation);
          return { data: { decision: "claimed", reservation }, ok: true };
        }

        if (existing.payload_hash !== input.payload_hash) {
          return { data: { decision: "conflict", reservation: existing }, ok: true };
        }

        if (existing.state === "failed") {
          const reservation = {
            ...existing,
            owner_token_hash: input.owner_token_hash,
            state: "pending",
          };
          reservations.set(input.idempotency_key_hash, reservation);
          return { data: { decision: "claimed", reservation }, ok: true };
        }

        return {
          data: {
            decision: existing.state === "completed" ? "completed" : "pending",
            reservation: existing,
          },
          ok: true,
        };
      },
      async completeReservation(input) {
        const existing = reservations.get(input.idempotency_key_hash);
        const reservation = {
          ...existing,
          completed_at: "2030-08-01T00:00:01.000Z",
          state: "completed",
          updated_at: "2030-08-01T00:00:01.000Z",
        };
        reservations.set(input.idempotency_key_hash, reservation);
        return { data: reservation, ok: true };
      },
      async createBooking(input) {
        createCount += 1;
        if (createDelay) {
          await new Promise((resolve) => setTimeout(resolve, createDelay));
        }
        const record = bookingRecord(input);
        bookings.set(record.booking_reference, record);
        return { data: record, ok: true };
      },
      async failReservation(input) {
        const existing = reservations.get(input.idempotency_key_hash);
        const reservation = { ...existing, state: "failed" };
        reservations.set(input.idempotency_key_hash, reservation);
        return { data: reservation, ok: true };
      },
      async loadBooking(_actor, reference) {
        const record = bookings.get(reference);
        return record
          ? { data: record, ok: true }
          : { error: "Not found", ok: false, status: 404 };
      },
      async loadReservation(keyHash) {
        const reservation = reservations.get(keyHash);
        return reservation
          ? { data: reservation, ok: true }
          : { error: "Not found", ok: false, status: 404 };
      },
      now: () => Date.parse("2030-08-01T00:00:00.000Z"),
      randomBytes: (size) => Buffer.alloc(size, 7),
      wait: () => new Promise((resolve) => setTimeout(resolve, 1)),
    },
    get createCount() {
      return createCount;
    },
    setCreateDelay(milliseconds) {
      createDelay = milliseconds;
    },
  };
}

process.env.PRESTIGE_ADMIN_BOOKING_CONFIRMATION_SECRET =
  "stage-two-confirmation-secret-at-least-thirty-two-characters";

const harness = await createHarness();

try {
  const actor = {
    actor_label: "Confirmed booking guard",
    actor_role: "admin",
    boundary_mode: "server-session-role-surface",
    source_surface: "admin_api",
  };
  const firstInput = previewInput();
  const normalized = harness.preview.normalizeChatGptBookingPreview(firstInput);
  assert.equal(normalized.ok, true);
  const confirmation = harness.confirmation.issueAdminBookingConfirmationToken(
    normalized.canonical_payload,
    normalized.preview,
    firstInput,
    Date.parse("2030-08-01T00:00:00.000Z"),
  );
  assert.equal(confirmation.ok, true);

  const store = inMemoryDependencies();
  const firstResult = await harness.confirmedCreate.createConfirmedAdminBooking(
    envelope(firstInput, confirmation.token, "confirmed-booking-key-0001"),
    actor,
    store.dependencies,
  );
  assert.equal(firstResult.status, 200);
  assert.equal(firstResult.body.success, true);
  assert.match(firstResult.body.booking_reference, /^ADM-GPT-20300801-/);
  assert.deepEqual(Object.keys(firstResult.body).sort(), [
    "booking_reference",
    "saved_booking",
    "success",
    "validation_issues",
  ]);
  assert.deepEqual(Object.keys(firstResult.body.saved_booking).sort(), [
    "bag_count",
    "dropoff_location",
    "flight_number",
    "passenger_count",
    "passenger_name",
    "pickup_datetime_sgt",
    "pickup_location",
    "service_type",
    "vehicle_type",
  ]);
  assert.doesNotMatch(
    JSON.stringify(firstResult.body),
    /customer_id|company_id|booker_id|traveler_id|audit|parser|supabase|secret|provider|contact_email|contact_phone/i,
  );
  assert.equal(store.createCount, 1);

  const replayResult = await harness.confirmedCreate.createConfirmedAdminBooking(
    envelope(firstInput, confirmation.token, "confirmed-booking-key-0001"),
    actor,
    store.dependencies,
  );
  assert.equal(replayResult.status, 200);
  assert.equal(replayResult.body.booking_reference, firstResult.body.booking_reference);
  assert.equal(store.createCount, 1, "A completed replay must not create another booking.");

  const changedInput = previewInput({ dropoff_location: "Different destination" });
  const changedNormalized = harness.preview.normalizeChatGptBookingPreview(changedInput);
  const changedConfirmation = harness.confirmation.issueAdminBookingConfirmationToken(
    changedNormalized.canonical_payload,
    changedNormalized.preview,
    changedInput,
    Date.parse("2030-08-01T00:00:00.000Z"),
  );
  const conflictResult = await harness.confirmedCreate.createConfirmedAdminBooking(
    envelope(changedInput, changedConfirmation.token, "confirmed-booking-key-0001"),
    actor,
    store.dependencies,
  );
  assert.equal(conflictResult.status, 409);
  assert.equal(conflictResult.body.success, false);
  assert.equal(
    conflictResult.body.validation_issues[0].code,
    "idempotency_payload_conflict",
  );
  assert.equal(store.createCount, 1);

  const invalidConfirmationResult =
    await harness.confirmedCreate.createConfirmedAdminBooking(
      envelope(firstInput, "invalid", "confirmed-booking-key-0002"),
      actor,
      store.dependencies,
    );
  assert.equal(invalidConfirmationResult.status, 400);
  assert.equal(
    invalidConfirmationResult.body.validation_issues[0].code,
    "confirmation_invalid",
  );

  const expiredConfirmation = harness.confirmation.issueAdminBookingConfirmationToken(
    normalized.canonical_payload,
    normalized.preview,
    firstInput,
    Date.parse("2030-07-31T23:40:00.000Z"),
  );
  const expiredResult = await harness.confirmedCreate.createConfirmedAdminBooking(
    envelope(firstInput, expiredConfirmation.token, "confirmed-booking-key-0003"),
    actor,
    store.dependencies,
  );
  assert.equal(expiredResult.status, 400);
  assert.equal(expiredResult.body.validation_issues[0].code, "confirmation_expired");

  const concurrentInput = previewInput({ passenger_name: "Concurrent Passenger" });
  const concurrentNormalized = harness.preview.normalizeChatGptBookingPreview(concurrentInput);
  const concurrentConfirmation = harness.confirmation.issueAdminBookingConfirmationToken(
    concurrentNormalized.canonical_payload,
    concurrentNormalized.preview,
    concurrentInput,
    Date.parse("2030-08-01T00:00:00.000Z"),
  );
  const concurrentStore = inMemoryDependencies();
  concurrentStore.setCreateDelay(20);
  const concurrentEnvelope = envelope(
    concurrentInput,
    concurrentConfirmation.token,
    "confirmed-booking-key-concurrent",
  );
  const [concurrentFirst, concurrentSecond] = await Promise.all([
    harness.confirmedCreate.createConfirmedAdminBooking(
      concurrentEnvelope,
      actor,
      concurrentStore.dependencies,
    ),
    harness.confirmedCreate.createConfirmedAdminBooking(
      concurrentEnvelope,
      actor,
      concurrentStore.dependencies,
    ),
  ]);
  assert.equal(concurrentFirst.status, 200);
  assert.equal(concurrentSecond.status, 200);
  assert.equal(concurrentFirst.body.booking_reference, concurrentSecond.body.booking_reference);
  assert.equal(
    concurrentStore.createCount,
    1,
    "Concurrent identical requests must call the canonical create workflow once.",
  );
} finally {
  if (originalConfirmationSecret === undefined) {
    delete process.env.PRESTIGE_ADMIN_BOOKING_CONFIRMATION_SECRET;
  } else {
    process.env.PRESTIGE_ADMIN_BOOKING_CONFIRMATION_SECRET = originalConfirmationSecret;
  }
  await harness.cleanup();
}

console.log("ChatGPT confirmed booking create API contract guard passed.");
