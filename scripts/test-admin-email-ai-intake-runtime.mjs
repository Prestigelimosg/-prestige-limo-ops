import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const sourcePaths = {
  runtime: path.join(root, "lib/admin-email-ai-intake.ts"),
  contract: path.join(root, "lib/admin-email-ai-intake-contract.ts"),
  schema: path.join(root, "lib/admin-email-ai-intake-schema.ts"),
  aiSchema: path.join(root, "lib/ai-parser-schema.ts"),
  route: path.join(root, "app/api/admin-email-ai-intake/route.ts"),
  cronRoute: path.join(root, "app/api/cron/admin-email-ai-intake/route.ts"),
  boundary: path.join(root, "lib/admin-dispatcher-auth-boundary.ts"),
};
const tempDir = await mkdtemp(path.join(root, ".tmp-email-ai-intake-"));
const targetPaths = {
  runtime: path.join(tempDir, "lib/admin-email-ai-intake.js"),
  contract: path.join(tempDir, "lib/admin-email-ai-intake-contract.js"),
  schema: path.join(tempDir, "lib/admin-email-ai-intake-schema.js"),
  aiSchema: path.join(tempDir, "lib/ai-parser-schema.js"),
  route: path.join(tempDir, "app/api/admin-email-ai-intake/route.js"),
  cronRoute: path.join(tempDir, "app/api/cron/admin-email-ai-intake/route.js"),
  boundary: path.join(tempDir, "lib/admin-dispatcher-auth-boundary.js"),
};
const envNames = [
  "OPENAI_API_KEY",
  "PRESTIGE_EMAIL_AI_ENABLED",
  "PRESTIGE_EMAIL_AI_IMAP_HOST",
  "PRESTIGE_EMAIL_AI_IMAP_PASSWORD",
  "PRESTIGE_EMAIL_AI_IMAP_PORT",
  "PRESTIGE_EMAIL_AI_IMAP_USER",
  "PRESTIGE_EMAIL_AI_CRON_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_URL",
];
const originalEnv = Object.fromEntries(
  envNames.map((name) => [name, process.env[name]]),
);
const originalLoad = Module._load;

function transpile(source, filename) {
  return ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
}

const mailboxState = new Map();
const intakeRows = [];

class FakeQuery {
  constructor(table) {
    this.table = table;
    this.operation = "select";
    this.payload = null;
    this.filters = [];
    this.inFilters = [];
    this.orExpression = "";
    this.rangeEnd = null;
    this.rangeStart = null;
  }

  select() {
    return this;
  }

  insert(payload) {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }

  update(payload) {
    this.operation = "update";
    this.payload = payload;
    return this;
  }

  upsert(payload) {
    this.operation = "upsert";
    this.payload = payload;
    return this;
  }

  eq(field, value) {
    this.filters.push([field, value]);
    return this;
  }

  in(field, values) {
    this.inFilters.push([field, values]);
    return this;
  }

  gte(field, value) {
    this.filters.push([field, value, "gte"]);
    return this;
  }

  lt(field, value) {
    this.filters.push([field, value, "lt"]);
    return this;
  }

  or(expression) {
    this.operation = "dedupe";
    this.orExpression = expression;
    return this;
  }

  order() {
    return this;
  }

  limit() {
    return this;
  }

  range(start, end) {
    this.rangeStart = start;
    this.rangeEnd = end;
    return this;
  }

  maybeSingle() {
    return Promise.resolve(this.execute(true));
  }

  single() {
    return Promise.resolve(this.execute(true));
  }

  then(resolve, reject) {
    return Promise.resolve(this.execute(false)).then(resolve, reject);
  }

  execute(single) {
    if (this.table === "admin_email_ai_mailbox_state") {
      if (this.operation === "upsert") {
        mailboxState.set(this.payload.mailbox_address, { ...this.payload });
        return { data: null, error: null };
      }

      const mailbox = this.filters.find(([field]) => field === "mailbox_address")?.[1];
      return {
        data: mailboxState.get(mailbox) || null,
        error: null,
      };
    }

    if (this.operation === "dedupe") {
      const messageIdHash = this.orExpression.match(
        /message_id_hash\.eq\.([0-9a-f]{64})/,
      )?.[1];
      const uidValidity = this.orExpression.match(
        /uid_validity\.eq\.([0-9]+)/,
      )?.[1];
      const imapUid = this.orExpression.match(
        /imap_uid\.eq\.([0-9]+)/,
      )?.[1];
      const matchingRows = intakeRows.filter(
        (row) =>
          row.message_id_hash === messageIdHash ||
          (String(row.uid_validity) === uidValidity &&
            String(row.imap_uid) === imapUid),
      );

      return {
        data: matchingRows.map((row) => ({ id: row.id })),
        error: null,
      };
    }

    if (this.operation === "insert") {
      const row = {
        ...this.payload,
        created_at: "2026-07-27T13:30:00.000Z",
        id: `00000000-0000-4000-8000-${String(
          intakeRows.length + 1,
        ).padStart(12, "0")}`,
      };
      intakeRows.push(row);
      return { data: single ? { id: row.id } : [row], error: null };
    }

    if (this.operation === "update") {
      const row = intakeRows.find((item) => {
        const exactFiltersPass = this.filters.every(
          ([field, value]) => item[field] === value,
        );
        const inFiltersPass = this.inFilters.every(
          ([field, values]) => values.includes(item[field]),
        );

        return exactFiltersPass && inFiltersPass;
      });

      if (row) {
        Object.assign(row, this.payload);
      }

      return {
        data: single ? row || null : row ? [row] : [],
        error: null,
      };
    }

    const selectedRows = intakeRows.filter((row) => {
      const exactFiltersPass = this.filters.every(
        ([field, value, operator]) =>
          operator === "gte"
            ? row[field] >= value
            : operator === "lt"
              ? row[field] < value
              : row[field] === value,
      );
      const inFiltersPass = this.inFilters.every(
        ([field, values]) => values.includes(row[field]),
      );

      return exactFiltersPass && inFiltersPass;
    });
    const rangedRows =
      this.rangeStart === null || this.rangeEnd === null
        ? selectedRows
        : selectedRows.slice(this.rangeStart, this.rangeEnd + 1);
    return {
      data: single ? rangedRows[0] || null : rangedRows,
      error: null,
    };
  }
}

const fakeDatabase = {
  from(table) {
    return new FakeQuery(table);
  },
};

const syntheticAllowedSource = Buffer.from(
  [
    "Return-Path: <info@prestigelimo.sg>",
    "Delivered-To: booking@prestigelimo.sg",
    "From: Prestige Transport <info@prestigelimo.sg>",
    "To: booking@prestigelimo.sg",
    "Message-ID: <synthetic-booking-1@example.test>",
    "Date: Mon, 27 Jul 2026 13:30:00 +0800",
    "Subject: Synthetic confirmed booking",
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "",
    "<html><body><h1>Confirmed booking</h1><p>Passenger: Test Guest</p><p>Pickup: Changi Airport</p><p>Drop-off: Marina Bay</p></body></html>",
  ].join("\r\n"),
);
const syntheticEnquirySource = Buffer.from(
  [
    "Return-Path: <info@prestigelimo.sg>",
    "Delivered-To: booking@prestigelimo.sg",
    "From: Prestige Transport <info@prestigelimo.sg>",
    "To: booking@prestigelimo.sg",
    "Message-ID: <synthetic-enquiry-1@example.test>",
    "Date: Mon, 27 Jul 2026 13:31:00 +0800",
    "Subject: Synthetic availability enquiry",
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    "Are you available tomorrow at 12pm from Changi Airport to MBS for two passengers?",
  ].join("\r\n"),
);

const fakeMailbox = {
  messages: [],
  uidNext: 101,
};
let downloadCalls = 0;
let downloadOptions = [];
let providerRequestBodies = [];
let supabaseCreateClientCalls = 0;
const adminDevicePushEvents = [];

class FakeImapFlow {
  fetchActive = false;
  usable = true;

  async connect() {}

  async mailboxOpen() {
    return {
      uidNext: fakeMailbox.uidNext,
      uidValidity: 777n,
    };
  }

  async *fetch(range) {
    const startUid = Number(String(range).split(":")[0]);

    this.fetchActive = true;

    try {
      for (const message of fakeMailbox.messages) {
        if (message.uid >= startUid) {
          yield message;
        }
      }
    } finally {
      this.fetchActive = false;
    }
  }

  async download(uid, part, options) {
    if (this.fetchActive) {
      throw new Error("nested_imap_command_deadlock");
    }

    downloadCalls += 1;
    downloadOptions.push({ options, part });
    const message = fakeMailbox.messages.find(
      (item) => item.uid === Number(uid),
    );

    return {
      content: {
        async *[Symbol.asyncIterator]() {
          if (message) {
            const midpoint = Math.ceil(message.source.length / 2);
            yield message.source.subarray(0, midpoint);
            yield message.source.subarray(midpoint);
          }
        },
      },
      meta: {
        contentType: "message/rfc822",
        expectedSize: message?.source.length || 0,
      },
    };
  }

  async logout() {
    this.usable = false;
  }

  close() {
    this.usable = false;
  }
}

class FakeOpenAI {
  responses = {
    create: async (body) => {
      providerRequestBodies.push(body);
      const isEnquiry = body.input.includes(
        "Synthetic availability enquiry",
      );
      const analysis = isEnquiry
        ? {
            bookingResult: {
              bookings: [],
              multipleBookingsDetected: false,
              rawWarnings: [],
            },
            classification: "enquiry",
            confidence: 0.99,
            reviewReasons: [],
            suggestedReply: "",
            summary: "Customer asks for availability and a quote.",
          }
        : {
            bookingResult: {
              bookings: [
                {
                  bookerContact: "",
                  bookerEmail: "",
                  bookerName: "",
                  bookingType: "MNG",
                  companyAccount: "",
                  confidence: 0.98,
                  customerPriceOverride: "",
                  dropoff: "Marina Bay",
                  extraStopLocation: "",
                  extraStops: "",
                  flightNumber: "",
                  needsReviewReasons: ["Flight number missing"],
                  notes: "",
                  passengerName: "Test Guest",
                  pax: "1",
                  pickup: "Changi Airport",
                  pickupDate: "2026-07-28",
                  pickupTime: "12:00",
                  vehicle: "AVF",
                },
              ],
              multipleBookingsDetected: false,
              rawWarnings: [],
            },
            classification: "confirmed_booking",
            confidence: 0.98,
            reviewReasons: ["Flight number missing"],
            suggestedReply: "",
            summary: "Confirmed airport booking requires flight-number review.",
          };

      return {
        model: "gpt-5.6-luna",
        output_text: JSON.stringify(analysis),
        usage: {
          input_tokens: 100,
          output_tokens: 80,
        },
      };
    },
  };
}

try {
  for (const name of Object.keys(sourcePaths)) {
    const source = await readFile(sourcePaths[name], "utf8");
    await mkdir(path.dirname(targetPaths[name]), { recursive: true });
    await writeFile(
      targetPaths[name],
      transpile(source, sourcePaths[name]),
    );
  }

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "server-only") return {};
    if (request === "@supabase/supabase-js") {
      return {
        createClient: () => {
          supabaseCreateClientCalls += 1;
          return fakeDatabase;
        },
      };
    }
    if (request === "imapflow") return { ImapFlow: FakeImapFlow };
    if (request === "openai") {
      return { __esModule: true, default: FakeOpenAI };
    }
    if (request === "./admin-device-push-notification") {
      return {
        sendAdminDevicePushAlert: async (eventType) => {
          adminDevicePushEvents.push(eventType);
          return {
            ok: true,
            reason: "send_succeeded",
          };
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  Object.assign(process.env, {
    OPENAI_API_KEY: "synthetic-test-key",
    PRESTIGE_EMAIL_AI_ENABLED: "true",
    PRESTIGE_EMAIL_AI_IMAP_HOST: "imap.example.test",
    PRESTIGE_EMAIL_AI_IMAP_PASSWORD: "synthetic-test-password",
    PRESTIGE_EMAIL_AI_IMAP_PORT: "993",
    PRESTIGE_EMAIL_AI_IMAP_USER: "booking@prestigelimo.sg",
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-role-key",
    SUPABASE_URL: "https://example.supabase.co",
  });

  const runtime = createRequire(import.meta.url)(targetPaths.runtime);

  process.env.PRESTIGE_EMAIL_AI_ENABLED = "false";
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_URL;
  const disabledRead = await runtime.loadAdminEmailAiIntake();
  assert.equal(disabledRead.ok, true);
  assert.equal(disabledRead.data.enabled, false);
  assert.deepEqual(disabledRead.data.records, []);
  assert.equal(disabledRead.data.token_usage.available, false);
  assert.equal(
    supabaseCreateClientCalls,
    0,
    "disabled intake read must not construct an unconfigured Supabase client",
  );
  Object.assign(process.env, {
    PRESTIGE_EMAIL_AI_ENABLED: "true",
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-role-key",
    SUPABASE_URL: "https://example.supabase.co",
  });

  const initialized = await runtime.runAdminEmailAiIntake();
  assert.equal(initialized.ok, true);
  assert.equal(initialized.initialized, true);
  assert.equal(providerRequestBodies.length, 0);
  assert.equal(
    mailboxState.get("booking@prestigelimo.sg").last_seen_uid,
    100,
  );

  fakeMailbox.uidNext = 102;
  fakeMailbox.messages = [
    {
      envelope: {
        from: [{ address: "info@prestigelimo.sg" }],
        to: [{ address: "booking@prestigelimo.sg" }],
      },
      size: syntheticAllowedSource.length,
      source: syntheticAllowedSource,
      uid: 101,
    },
  ];

  const parsed = await runtime.runAdminEmailAiIntake();
  assert.equal(parsed.ok, true);
  assert.equal(parsed.parsed, 1);
  assert.equal(parsed.skipped, 0);
  assert.equal(providerRequestBodies.length, 1);
  assert.equal(downloadCalls, 1);
  assert.deepEqual(downloadOptions, [
    {
      options: {
        chunkSize: 64_000,
        maxBytes: 256_000,
        uid: true,
      },
      part: undefined,
    },
  ]);
  assert.equal(providerRequestBodies[0].store, false);
  assert.deepEqual(providerRequestBodies[0].tools, []);
  assert.equal(providerRequestBodies[0].parallel_tool_calls, false);
  assert.match(providerRequestBodies[0].input, /Synthetic confirmed booking/);
  assert.equal(intakeRows.length, 1);
  assert.equal(intakeRows[0].mailbox_address, "booking@prestigelimo.sg");
  assert.equal(intakeRows[0].sender_address, "info@prestigelimo.sg");
  assert.equal(intakeRows[0].processing_status, "queued");
  assert.equal(intakeRows[0].classification, "confirmed_booking");
  assert.equal(intakeRows[0].suggested_reply, "");
  assert.match(intakeRows[0].canonical_booking_text, /Passenger: Test Guest/);
  assert.deepEqual(adminDevicePushEvents, ["email_confirmed_booking"]);

  const duplicatePoll = await runtime.runAdminEmailAiIntake();
  assert.equal(duplicatePoll.ok, true);
  assert.equal(duplicatePoll.inspected, 0);
  assert.equal(providerRequestBodies.length, 1);
  assert.deepEqual(adminDevicePushEvents, ["email_confirmed_booking"]);

  fakeMailbox.uidNext = 103;
  fakeMailbox.messages.push({
    envelope: {
      from: [{ address: "info@prestigelimo.sg" }],
      to: [{ address: "booking@prestigelimo.sg" }],
    },
    size: syntheticEnquirySource.length,
    source: syntheticEnquirySource,
    uid: 102,
  });

  const ignoredEnquiry = await runtime.runAdminEmailAiIntake();
  assert.equal(ignoredEnquiry.ok, true);
  assert.equal(ignoredEnquiry.parsed, 1);
  assert.equal(ignoredEnquiry.skipped, 0);
  assert.equal(providerRequestBodies.length, 2);
  assert.equal(downloadCalls, 2);
  assert.equal(intakeRows.length, 2);
  assert.equal(intakeRows[1].classification, "enquiry");
  assert.equal(intakeRows[1].processing_status, "dismissed");
  assert.equal(intakeRows[1].suggested_reply, "");
  assert.deepEqual(
    adminDevicePushEvents,
    ["email_confirmed_booking"],
    "enquiries must remain silent on admin device push",
  );

  const blockedSource = Buffer.from(
    syntheticAllowedSource
      .toString()
      .replaceAll("info@prestigelimo.sg", "other@example.test")
      .replace("synthetic-booking-1", "synthetic-booking-2"),
  );
  fakeMailbox.uidNext = 104;
  fakeMailbox.messages.push({
    envelope: {
      from: [{ address: "other@example.test" }],
      to: [{ address: "booking@prestigelimo.sg" }],
    },
    size: blockedSource.length,
    source: blockedSource,
    uid: 103,
  });

  const skipped = await runtime.runAdminEmailAiIntake();
  assert.equal(skipped.ok, true);
  assert.equal(skipped.parsed, 0);
  assert.equal(skipped.skipped, 1);
  assert.equal(providerRequestBodies.length, 2);
  assert.equal(downloadCalls, 2, "blocked sender body must not be fetched");
  assert.equal(intakeRows.length, 2);

  const loaded = await runtime.loadAdminEmailAiIntake(fakeDatabase);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.data.records.length, 1);
  assert.equal(loaded.data.records[0].classification, "confirmed_booking");
  assert.deepEqual(loaded.data.token_usage, {
    available: true,
    input_tokens: 200,
    month_key: loaded.data.token_usage.month_key,
    output_tokens: 160,
    total_tokens: 360,
  });

  const route = createRequire(import.meta.url)(targetPaths.route);
  assert.equal(route.POST, undefined);
  assert.equal(typeof route.PATCH, "function");
  const blockedRead = await route.GET(
    new Request("http://localhost/api/admin-email-ai-intake", {
      headers: {
        origin: "http://localhost",
        referer: "http://localhost/",
        "x-prestige-admin-purpose": "wrong-purpose",
      },
    }),
  );
  assert.equal(blockedRead.status, 403);

  const allowedRead = await route.GET(
    new Request("http://localhost/api/admin-email-ai-intake", {
      headers: {
        origin: "http://localhost",
        referer: "http://localhost/",
        "x-prestige-admin-purpose": "admin-email-ai-intake",
      },
    }),
  );
  const allowedReadBody = await allowedRead.json();
  assert.equal(allowedRead.status, 200);
  assert.equal(allowedReadBody.ok, true);
  assert.equal(allowedReadBody.external_send, false);
  assert.equal(allowedReadBody.write_action, false);
  assert.equal(allowedReadBody.records.length, 1);
  assert.equal(allowedReadBody.token_usage.total_tokens, 360);

  const actionableIntakeId = allowedReadBody.records[0].id;
  const blockedReview = await route.PATCH(
    new Request("http://localhost/api/admin-email-ai-intake", {
      body: JSON.stringify({
        intake_id: actionableIntakeId,
        processing_status: "reviewed",
      }),
      headers: {
        "content-type": "application/json",
        origin: "http://localhost",
        referer: "http://localhost/",
        "x-prestige-admin-purpose": "wrong-purpose",
      },
      method: "PATCH",
    }),
  );
  assert.equal(blockedReview.status, 403);
  assert.equal(intakeRows[0].processing_status, "queued");

  const invalidReview = await route.PATCH(
    new Request("http://localhost/api/admin-email-ai-intake", {
      body: JSON.stringify({
        intake_id: actionableIntakeId,
        processing_status: "dismissed",
      }),
      headers: {
        "content-type": "application/json",
        origin: "http://localhost",
        referer: "http://localhost/",
        "x-prestige-admin-purpose": "admin-email-ai-intake",
      },
      method: "PATCH",
    }),
  );
  assert.equal(invalidReview.status, 400);
  assert.equal(intakeRows[0].processing_status, "queued");

  const allowedReview = await route.PATCH(
    new Request("http://localhost/api/admin-email-ai-intake", {
      body: JSON.stringify({
        intake_id: actionableIntakeId,
        processing_status: "reviewed",
      }),
      headers: {
        "content-type": "application/json",
        origin: "http://localhost",
        referer: "http://localhost/",
        "x-prestige-admin-purpose": "admin-email-ai-intake",
      },
      method: "PATCH",
    }),
  );
  const allowedReviewBody = await allowedReview.json();
  assert.equal(allowedReview.status, 200);
  assert.deepEqual(allowedReviewBody, {
    external_send: false,
    intake_id: actionableIntakeId,
    ok: true,
    processing_status: "reviewed",
    version: "private-semantic-email-ai-intake-v1",
    write_action: true,
  });
  assert.equal(intakeRows[0].processing_status, "reviewed");

  const repeatedReview = await route.PATCH(
    new Request("http://localhost/api/admin-email-ai-intake", {
      body: JSON.stringify({
        intake_id: actionableIntakeId,
        processing_status: "reviewed",
      }),
      headers: {
        "content-type": "application/json",
        origin: "http://localhost",
        referer: "http://localhost/",
        "x-prestige-admin-purpose": "admin-email-ai-intake",
      },
      method: "PATCH",
    }),
  );
  assert.equal(repeatedReview.status, 200);

  const afterReviewRead = await route.GET(
    new Request("http://localhost/api/admin-email-ai-intake", {
      headers: {
        origin: "http://localhost",
        referer: "http://localhost/",
        "x-prestige-admin-purpose": "admin-email-ai-intake",
      },
    }),
  );
  assert.equal(afterReviewRead.status, 200);
  assert.deepEqual((await afterReviewRead.json()).records, []);

  const cronRoute = createRequire(import.meta.url)(targetPaths.cronRoute);
  delete process.env.PRESTIGE_EMAIL_AI_CRON_SECRET;
  const blockedCron = await cronRoute.GET(
    new Request("http://localhost/api/cron/admin-email-ai-intake"),
  );
  assert.equal(blockedCron.status, 401);

  process.env.PRESTIGE_EMAIL_AI_CRON_SECRET =
    "synthetic-cron-secret-with-more-than-32-characters";
  const parameterBlockedCron = await cronRoute.GET(
    new Request(
      "http://localhost/api/cron/admin-email-ai-intake?mailbox=another",
      {
        headers: {
          authorization:
            `Bearer ${process.env.PRESTIGE_EMAIL_AI_CRON_SECRET}`,
        },
      },
    ),
  );
  assert.equal(parameterBlockedCron.status, 400);

  const allowedCron = await cronRoute.GET(
    new Request("http://localhost/api/cron/admin-email-ai-intake", {
      headers: {
        authorization:
          `Bearer ${process.env.PRESTIGE_EMAIL_AI_CRON_SECRET}`,
      },
    }),
  );
  assert.equal(allowedCron.status, 200);
  assert.equal((await allowedCron.json()).ok, true);

  process.env.PRESTIGE_EMAIL_AI_IMAP_USER = "another@prestigelimo.sg";
  const wrongMailbox = await runtime.runAdminEmailAiIntake();
  assert.equal(wrongMailbox.ok, false);
  assert.equal(wrongMailbox.status, 503);
  assert.equal(providerRequestBodies.length, 2);
} finally {
  Module._load = originalLoad;
  await rm(tempDir, { force: true, recursive: true });

  for (const name of envNames) {
    if (originalEnv[name] === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = originalEnv[name];
    }
  }
}

console.log("Private semantic email AI intake runtime tests passed.");
