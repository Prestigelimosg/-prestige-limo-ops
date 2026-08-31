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
  bookingParser: path.join(root, "lib/booking-parser.ts"),
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
  bookingParser: path.join(tempDir, "lib/booking-parser.js"),
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

function currentSingaporeMonthFixtureTimestamp(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      month: "2-digit",
      timeZone: "Asia/Singapore",
      year: "numeric",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );

  return `${parts.year}-${parts.month}-15T04:00:00.000Z`;
}

const currentSingaporeMonthCreatedAt =
  currentSingaporeMonthFixtureTimestamp();

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
        created_at: currentSingaporeMonthCreatedAt,
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
const syntheticGroundBookerSource = Buffer.from(
  [
    "Return-Path: <transzend@groundbooker.com>",
    "Delivered-To: booking@prestigelimo.sg",
    "From: GroundBooker <transzend@groundbooker.com>",
    "To: info@prestigelimo.sg",
    "Message-ID: <synthetic-groundbooker-booking-1@example.test>",
    "Date: Mon, 27 Jul 2026 13:32:00 +0800",
    "Subject: Synthetic GroundBooker confirmed booking",
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    "Confirmed booking. Passenger: Test Guest. Pickup: Changi Airport. Drop-off: Marina Bay.",
  ].join("\r\n"),
);
const syntheticGroundBookerOrderRequestSource = Buffer.from(
  [
    "Return-Path: <transzend@groundbooker.com>",
    "Delivered-To: booking@prestigelimo.sg",
    "From: GroundBooker <transzend@groundbooker.com>",
    "To: info@prestigelimo.sg",
    "Message-ID: <synthetic-groundbooker-order-request-1@example.test>",
    "Date: Fri, 14 Aug 2026 10:16:00 +0800",
    "Subject: AUG 16th | Departure Transfer to Main Terminal - order from Groundbooker Transzend [INQ#817905]",
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    "I have a request for an airport transfer. Pickup: Fullerton Hotel at 00:45 on 16 August 2026. Drop-off: Singapore Changi Airport Main Terminal. Passenger: Synthetic Guest. Please can you confirm this ground transportation service?",
  ].join("\r\n"),
);
const syntheticPrestigeTransportIdentityConflictSource = Buffer.from(
  [
    "Return-Path: <info@prestigelimo.sg>",
    "Delivered-To: booking@prestigelimo.sg",
    "From: Prestige Transport <info@prestigelimo.sg>",
    "To: booking@prestigelimo.sg",
    "Message-ID: <synthetic-prestige-transport-15782@example.test>",
    "Date: Mon, 3 Aug 2026 01:45:00 +0000",
    'Subject: New booking "Prestige Transport 15782" has been received',
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    "General",
    "Title Prestige Transport 15782 Service type Airport transfer Transfer type One Way Pickup date and time 16-08-2026 17:45",
    "Comment Passenger: Mr. Zenji Nakamura (Japan Country Head, UBS Group)",
    "Route",
    "Route name Airport arrival",
    "Route locations",
    "Drop off Location 1. 5 Raffles Ave., Singapore 039797",
    "Vehicle",
    "Vehicle name Toyota Alphard 2.5 Bag count 3 Passengers count 4",
    "Client details",
    "First name Zenji Last name Nakamura E-mail address yasuko.kunisawa@ubs.com Phone number +81352933407 Passangers 1 Flight No. JL37",
    "Payment",
    "Payment Stripe",
  ].join("\r\n"),
);
const syntheticPrestigeTransportDepartureRoleTextSource = Buffer.from(
  [
    "Return-Path: <info@prestigelimo.sg>",
    "Delivered-To: booking@prestigelimo.sg",
    "From: Prestige Transport <info@prestigelimo.sg>",
    "To: booking@prestigelimo.sg",
    "Message-ID: <synthetic-prestige-transport-19001@example.test>",
    "Date: Mon, 17 Aug 2026 05:01:26 +0000",
    'Subject: New booking "Prestige Transport 19001" has been received',
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    "General",
    "Title Prestige Transport 19001 Status Pending (new) Service type Airport transfer Transfer type One Way Pickup date and time 19-08-2026 19:00",
    "Order total amount S$95.00 Taxes S$0.00 (0%) Comment",
    "Passenger: Mr. Test Guest (Regional Head, Example Group) Passenger mobile: +819000000001 English-speaking driver preferred.",
    "Route",
    "Route name Airport Departure",
    "Route locations",
    "Pick Up Location 1. 9 Example Rd, Singapore 238459",
    "Vehicle",
    "Vehicle name Toyota Alphard 2.5 Bag count 3 Passengers count 4",
    "Client details",
    "First name Test Last name Guest E-mail address requester.person@example.com Phone number +819000000001 Passangers 1 Flight No. JL36",
    "Payment",
    "Payment Stripe",
  ].join("\r\n"),
);
const syntheticPrestigeTransport15784Source = Buffer.from(
  [
    "Return-Path: <info@prestigelimo.sg>",
    "Delivered-To: booking@prestigelimo.sg",
    "From: Prestige Transport <info@prestigelimo.sg>",
    "To: booking@prestigelimo.sg",
    "Message-ID: <synthetic-prestige-transport-15784@example.test>",
    "Date: Thu, 6 Aug 2026 15:05:18 +0000",
    'Subject: New booking "Prestige Transport 15784" has been received',
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    "General",
    "Title Prestige Transport 15784 Service type Airport transfer Transfer type One Way Pickup date and time 17-08-2026 16:25",
    "Comment Trip Organizer: Mr. Kim, Hyun Soo (Tel. No.: +65 98156017)",
    "Route name Airport arrival Drop off Location 1. 7 Raffles Blvd, Singapore 039595",
    "Vehicle name Mercedes Benz Viano Bag count 5 Passengers count 7",
    "Client details",
    "First name Shohei Last name Ogasawara E-mail address hyunsoostar@hotmail.com Phone number +818024138363 Passangers 3 Flight No. SQ619",
  ].join("\r\n"),
);
const syntheticPrestigeTransport15785Source = Buffer.from(
  [
    "Return-Path: <info@prestigelimo.sg>",
    "Delivered-To: booking@prestigelimo.sg",
    "From: Prestige Transport <info@prestigelimo.sg>",
    "To: booking@prestigelimo.sg",
    "Message-ID: <synthetic-prestige-transport-15785@example.test>",
    "Date: Thu, 6 Aug 2026 15:10:29 +0000",
    'Subject: New booking "Prestige Transport 15785" has been received',
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    "General",
    "Title Prestige Transport 15785 Service type Airport transfer Transfer type One Way Pickup date and time 19-08-2026 6:30",
    "Comment Trip Organizer: Mr. Kim, Hyun Soo (Tel. No.: +65 98156017)",
    "Route name Airport departure Pick Up Location 1. 7 Raffles Blvd, Singapore 039595",
    "Vehicle name Mercedes Benz Viano Bag count 5 Passengers count 7",
    "Client details",
    "First name Shohei Last name Ogasawara E-mail address hyunsoostar@hotmail.com Phone number +818024138363 Passangers 3 Flight No. SQ620",
  ].join("\r\n"),
);
const syntheticPrestigeTransport15787Source = Buffer.from(
  [
    "Return-Path: <info@prestigelimo.sg>",
    "Delivered-To: booking@prestigelimo.sg",
    "From: Prestige Transport <info@prestigelimo.sg>",
    "To: booking@prestigelimo.sg",
    "Message-ID: <synthetic-prestige-transport-15787@example.test>",
    "Date: Fri, 7 Aug 2026 12:00:00 +0000",
    'Subject: New booking "Prestige Transport 15787" has been received',
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    "GENERAL",
    "Title Prestige Transport 15787 Service type Airport transfer Transfer type One Way Pickup date and time 19-08-2026 10:00",
    "Order total amount S$120.00 Taxes S$0.00 (0%) Distance 12.8 km Duration 24 minutes",
    "Comment 1st Pick up: Ms. Chan (26 Newton Road), 2nd Pick up: Mr. Kim (6 Suffolk Walk)",
    "ROUTE",
    "Route name Airport Departure",
    "ROUTE LOCATIONS",
    "6 Suffolk Walk, 싱가포르 6 Suffolk Walk, Singapore 307464",
    "PICK UP LOCATION",
    "26 Newton Rd, 싱가포르 307957",
    "VEHICLE",
    "Vehicle name Toyota Alphard 2.5 Bag count 3 Passengers count 4",
    "EXTRA",
    "1 x Waypoint 1 - S$25.00",
    "CLIENT DETAILS",
    "First name Pui Yu Last name Chan E-mail address hyunsoostar@hotmail.com Phone number +6596389322 Passangers 2 Flight No. SQ958",
    "PAYMENT",
    "Stripe",
  ].join("\r\n"),
);
const syntheticPrestigeTransport15787Body = syntheticPrestigeTransport15787Source
  .toString()
  .split("\r\n\r\n")[1]
  .replaceAll("\r\n", "\n");

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
      const isPrestigeTransportIdentityConflict = body.input.includes(
        'New booking "Prestige Transport 15782" has been received',
      );
      const isPrestigeTransport15784 = body.input.includes(
        'New booking "Prestige Transport 15784" has been received',
      );
      const isPrestigeTransport15785 = body.input.includes(
        'New booking "Prestige Transport 15785" has been received',
      );
      const isPrestigeTransport15787 = body.input.includes(
        'New booking "Prestige Transport 15787" has been received',
      );
      const isPrestigeTransportDepartureRoleText = body.input.includes(
        'New booking "Prestige Transport 19001" has been received',
      );
      const companyAccountDescription =
        body.text?.format?.schema?.properties?.bookingResult?.properties
          ?.bookings?.items?.properties?.companyAccount?.description || "";
      const dropoffDescription =
        body.text?.format?.schema?.properties?.bookingResult?.properties
          ?.bookings?.items?.properties?.dropoff?.description || "";
      const supportsExplicitDepartureAndPassengerRoleContract =
        body.instructions.includes(
          "An exact labelled Route name Airport Departure always maps to DEP",
        ) &&
        body.instructions.includes(
          "Passenger role, title, employer, or affiliation text inside or beside the labelled Passenger value is passenger context only.",
        ) &&
        body.instructions.includes("Approved Job Card Format memory:") &&
        body.instructions.includes(
          "Memory examples are interpretation rules only; never copy a historical passenger, contact, company, place, flight, price, or note into the current email result.",
        ) &&
        body.instructions.includes(
          "The Email AI result is the richer app booking needed for CRM review, not the short driver-facing WhatsApp Job Card.",
        ) &&
        body.instructions.includes(
          "When an exact Airport Departure supplies a Singapore street pickup and flight number but no named airport or terminal, complete the structured app booking with dropoff Changi Airport and no terminal.",
        ) &&
        companyAccountDescription.includes(
          "Prestige Transport branding and passenger role, employer, or affiliation text are never a customer company",
        ) &&
        dropoffDescription.includes("return Changi Airport without a terminal");
      const supportsCompleteSemanticBookingContract =
        body.instructions.includes(
          "Read the complete email before producing the structured booking result.",
        ) &&
        body.instructions.includes("passengerContact") &&
        body.instructions.includes("bagCount") &&
        body.instructions.includes("extraStopCount");
      const isGroundBooker = body.input.includes(
        "Synthetic GroundBooker confirmed booking",
      );
      const isGroundBookerOrderRequest = body.input.includes(
        "order from Groundbooker Transzend [INQ#817905]",
      );
      const analysis = isPrestigeTransportDepartureRoleText
        ? {
            bookingResult: {
              bookings: [
                {
                  bagCount: "3",
                  bookerContact: "+819000000001",
                  bookerEmail: "requester.person@example.com",
                  bookerName: "Test Guest",
                  bookingType: supportsExplicitDepartureAndPassengerRoleContract
                    ? "DEP"
                    : "TRF",
                  companyAccount: supportsExplicitDepartureAndPassengerRoleContract
                    ? ""
                    : "Example Group",
                  confidence: 0.98,
                  customerPriceOverride: "",
                  dropoff: "Changi Airport",
                  extraStopLocation: "",
                  extraStops: "",
                  flightNumber: "JL36",
                  needsReviewReasons: [],
                  notes: "English-speaking driver preferred.",
                  passengerContact: "+819000000001",
                  passengerName: "Mr. Test Guest",
                  pax: "1",
                  pickup: "9 Example Rd, Singapore 238459",
                  pickupDate: "2026-08-19",
                  pickupTime: "19:00",
                  vehicle: "Toyota Alphard 2.5",
                },
              ],
              multipleBookingsDetected: false,
              rawWarnings: [],
            },
            classification: "confirmed_booking",
            confidence: 0.98,
            reviewReasons: [],
            suggestedReply: "",
            summary: "Confirmed airport booking for a synthetic passenger.",
          }
        : isPrestigeTransport15787
        ? supportsCompleteSemanticBookingContract
          ? {
              bookingResult: {
                bookings: [
                  {
                    bagCount: "3",
                    bookerContact: "+6598156017",
                    bookerEmail: "hyunsoostar@hotmail.com",
                    bookerName: "Kim Hyun Soo",
                    bookingType: "DEP",
                    companyAccount: "",
                    confidence: 0.94,
                    customerPriceOverride: "",
                    dropoff: "Changi Airport",
                    extraStopCount: "1",
                    extraStopLocation: "6 Suffolk Walk, Singapore 307464",
                    extraStops: "Second pickup: Mr. Kim",
                    flightNumber: "SQ958",
                    needsReviewReasons: [
                      "The Booker is not clearly identified even though the structured Booker fields are complete.",
                      "The source contains a second pickup/waypoint relationship that should be confirmed operationally.",
                      "Airport name and terminal are not explicitly stated.",
                      "Verify whether Pending (new) represents a final confirmed booking.",
                      "Unrelated dispatch instruction requires manual confirmation.",
                    ],
                    notes:
                      "1st Pick up: Ms. Chan (26 Newton Road), 2nd Pick up: Mr. Kim (6 Suffolk Walk).",
                    passengerContact: "+6596389322",
                    passengerName: "Pui Yu Chan",
                    pax: "2",
                    pickup: "26 Newton Rd, Singapore 307957",
                    pickupDate: "19-08-2026",
                    pickupTime: "10:00",
                    vehicle: "Toyota Alphard 2.5",
                  },
                ],
                multipleBookingsDetected: false,
                rawWarnings: [],
              },
              classification: "confirmed_booking",
              confidence: 0.94,
              reviewReasons: [
                "The Booker is not clearly identified even though the structured Booker fields are complete.",
                "The source contains a second pickup/waypoint relationship that should be confirmed operationally.",
                "Booking status is Pending (new); verify whether this is final and confirmed.",
                "Airport name and terminal are not explicitly stated.",
                "Unrelated dispatch instruction requires manual confirmation.",
              ],
              suggestedReply: "",
              summary: "Prestige Transport 15787 airport departure for Pui Yu Chan.",
            }
          : {
            bookingResult: {
              bookings: [
                {
                  bookerContact: "+6596389322",
                  bookerEmail: "hyunsoostar@hotmail.com",
                  bookerName: "Pui Yu Chan",
                  bookingType: "DEP",
                  companyAccount: "",
                  confidence: 0.87,
                  customerPriceOverride: "120.00 SGD",
                  dropoff: "",
                  extraStopLocation: "",
                  extraStops: "1 waypoint",
                  flightNumber: "SQ958",
                  needsReviewReasons: [
                    "Airport drop-off missing.",
                    "Waypoint location missing.",
                    "Client details list 2 passengers versus vehicle capacity 4.",
                    "Booker name requires confirmation.",
                  ],
                  notes: "Airport Departure; one way; second pickup: 6 Suffolk Walk, Singapore 307464; order total S$120.00; comment: 1st Pick up: Ms. Chan (26 Newton Road), 2nd Pick up: Mr. Kim (6 Suffolk Walk).",
                  passengerName: "Pui Yu Chan",
                  pax: "2",
                  pickup: "26 Newton Rd, Singapore 307957",
                  pickupDate: "2026-08-19",
                  pickupTime: "10:00",
                  vehicle: "Toyota Alphard 2.5",
                },
              ],
              multipleBookingsDetected: false,
              rawWarnings: [],
            },
            classification: "confirmed_booking",
            confidence: 0.87,
            reviewReasons: [
              "Airport drop-off missing.",
              "Waypoint location missing.",
              "Client details list 2 passengers versus vehicle capacity 4.",
              "Booker name requires confirmation.",
            ],
            suggestedReply: "",
            summary: "Prestige Transport 15787 airport departure for Pui Yu Chan.",
          }
        : isPrestigeTransport15784 || isPrestigeTransport15785
        ? {
            bookingResult: {
              bookings: [
                {
                  bagCount: "5",
                  bookerContact: isPrestigeTransport15784
                    ? "+65 98156017"
                    : "+818024138363",
                  bookerEmail: "hyunsoostar@hotmail.com",
                  bookerName: "",
                  bookingType: isPrestigeTransport15784 ? "MNG" : "DEP",
                  companyAccount: "",
                  confidence: 0.96,
                  customerPriceOverride: "",
                  dropoff: isPrestigeTransport15784
                    ? "7 Raffles Blvd, Singapore 039595"
                    : "",
                  extraStopLocation: "",
                  extraStops: "",
                  flightNumber: isPrestigeTransport15784 ? "SQ619" : "SQ620",
                  needsReviewReasons: ["Confirm Booker identity and contact details."],
                  notes: "Organizer: Mr. Kim, Hyun Soo.",
                  passengerContact: "+818024138363",
                  passengerName: "Shohei Ogasawara",
                  pax: "3",
                  pickup: isPrestigeTransport15784
                    ? ""
                    : "7 Raffles Blvd, Singapore 039595",
                  pickupDate: isPrestigeTransport15784 ? "17-08-2026" : "19-08-2026",
                  pickupTime: isPrestigeTransport15784 ? "16:25" : "6:30",
                  vehicle: "Mercedes Benz Viano",
                },
              ],
              multipleBookingsDetected: false,
              rawWarnings: [],
            },
            classification: "confirmed_booking",
            confidence: 0.96,
            reviewReasons: [],
            suggestedReply: "",
            summary: "Prestige Transport booking for Shohei Ogasawara.",
          }
        : isPrestigeTransportIdentityConflict
        ? {
            bookingResult: {
              bookings: [
                {
                  bagCount: "3",
                  bookerContact: "+81352933407",
                  bookerEmail: "yasuko.kunisawa@ubs.com",
                  bookerName: "Zenji Nakamura",
                  bookingType: "MNG",
                  companyAccount: "",
                  confidence: 0.98,
                  customerPriceOverride: "",
                  dropoff: "5 Raffles Ave., Singapore 039797",
                  extraStopLocation: "",
                  extraStops: "",
                  flightNumber: "JL37",
                  needsReviewReasons: [
                    "Pickup airport/seaport is not specified.",
                  ],
                  notes: "Bag count: 3.",
                  passengerContact: "+81352933407",
                  passengerName: "Mr. Zenji Nakamura",
                  pax: "1",
                  pickup: "",
                  pickupDate: "2026-08-16",
                  pickupTime: "17:45",
                  vehicle: "Toyota Alphard 2.5",
                },
              ],
              multipleBookingsDetected: false,
              rawWarnings: [],
            },
            classification: "confirmed_booking",
            confidence: 0.99,
            reviewReasons: [
              "Pickup airport is not provided; verify before dispatch.",
            ],
            suggestedReply: "",
            summary: "Confirmed airport arrival booking for Zenji Nakamura.",
          }
        : isGroundBookerOrderRequest
        ? {
            bookingResult: {
              bookings: [
                {
                  bookerContact: "",
                  bookerEmail: "transzend@groundbooker.com",
                  bookerName: "Pat",
                  bookingType: "DEP",
                  companyAccount: "Transzend",
                  confidence: 0.98,
                  customerPriceOverride: "",
                  dropoff: "Singapore Changi Airport Main Terminal",
                  extraStopLocation: "",
                  extraStops: "",
                  flightNumber: "QR945",
                  needsReviewReasons: [
                    "Sender asks for confirmation; booking is not clearly confirmed.",
                  ],
                  notes: "",
                  passengerContact: "+6590000000",
                  passengerName: "Synthetic Guest",
                  pax: "1",
                  pickup: "Fullerton Hotel",
                  pickupDate: "2026-08-16",
                  pickupTime: "00:45",
                  vehicle: "",
                },
              ],
              multipleBookingsDetected: false,
              rawWarnings: [],
            },
            classification: "enquiry",
            confidence: 0.98,
            reviewReasons: [
              "Sender asks for confirmation; booking is not clearly confirmed.",
            ],
            suggestedReply: "",
            summary: "GroundBooker asks Prestige to confirm one transport order.",
          }
        : isGroundBooker
        ? {
            bookingResult: {
              bookings: [
                {
                  bookerContact: "",
                  bookerEmail: "transzend@groundbooker.com",
                  bookerName: "Pat",
                  bookingType: "MNG",
                  companyAccount: "Transzend",
                  confidence: 0.99,
                  customerPriceOverride: "",
                  dropoff: "Marina Bay",
                  extraStopLocation: "",
                  extraStops: "",
                  flightNumber: "BA11",
                  needsReviewReasons: [],
                  notes: "",
                  passengerName: "Simran Shah",
                  pax: "1",
                  pickup: "Changi Airport T1",
                  pickupDate: "2026-08-05",
                  pickupTime: "16:05",
                  vehicle: "AVF",
                },
              ],
              multipleBookingsDetected: false,
              rawWarnings: [],
            },
            classification: "confirmed_booking",
            confidence: 0.99,
            reviewReasons: [],
            suggestedReply: "",
            summary: "GroundBooker booking for Simran Shah.",
          }
        : isEnquiry
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
    let source = await readFile(sourcePaths[name], "utf8");
    if (name === "runtime") {
      source +=
        "\nexport { enforceStructuredPickupSeparation as testEnforceStructuredPickupSeparation, preserveValidatedExplicitCompanyDisplay as testPreserveValidatedExplicitCompanyDisplay, validateExplicitSourceFactsCompleteness as testValidateExplicitSourceFactsCompleteness };\n";
    }
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
  const emailAiSchema = createRequire(import.meta.url)(targetPaths.schema);
  const bookingParser = createRequire(import.meta.url)(targetPaths.bookingParser);

  const unsafeCombinedPickup = runtime.testEnforceStructuredPickupSeparation({
    bookingResult: {
      bookings: [
        {
          extraStopCount: "1",
          extraStopLocation: "6 Suffolk Walk, Singapore 307464",
          needsReviewReasons: ["Airport terminal not specified."],
          pickup: "6 Suffolk Walk Singapore 307464",
        },
      ],
      multipleBookingsDetected: false,
      rawWarnings: [],
    },
    classification: "confirmed_booking",
    confidence: 0.8,
    reviewReasons: ["Airport terminal not specified."],
    suggestedReply: "",
    summary: "Unsafe combined pickup test.",
  });
  assert.equal(
    unsafeCombinedPickup.bookingResult.bookings[0].pickup,
    "",
    "An inseparable pickup/waypoint overlap must fail visibly instead of keeping a wrong primary pickup.",
  );
  assert.match(
    unsafeCombinedPickup.bookingResult.bookings[0].needsReviewReasons.join("\n"),
    /AI combined the primary pickup and extra stop; confirm the primary pickup before Create Job Card\./,
  );
  assert.match(
    unsafeCombinedPickup.reviewReasons.join("\n"),
    /AI combined the primary pickup and extra stop; confirm the primary pickup before Create Job Card\./,
  );
  assert.match(
    unsafeCombinedPickup.reviewReasons.join("\n"),
    /Airport terminal not specified\./,
    "Unrelated review reasons must survive the fail-visible location guard.",
  );

  const completeExplicitSourceFactsBooking = {
    bagCount: "3",
    bookerContact: "+65 98156017",
    bookerEmail: "hyunsoostar@hotmail.com",
    bookerName: "Kim Hyun Soo",
    bookingType: "DEP",
    companyAccount: "",
    customerPriceOverride: "",
    dropoff: "Changi Airport",
    extraStopCount: "1",
    extraStopLocation: "6 Suffolk Walk, Singapore 307464",
    extraStops: "6 Suffolk Walk, Singapore 307464",
    flightNumber: "SQ958",
    needsReviewReasons: ["Airport terminal is not explicitly stated."],
    notes:
      "1st Pick up: Ms. Chan (26 Newton Road), 2nd Pick up: Mr. Kim (6 Suffolk Walk).",
    passengerContact: "+6596389322",
    passengerName: "Pui Yu Chan",
    pax: "2",
    pickup: "26 Newton Rd, Singapore 307957",
    pickupDate: "2026-08-19",
    pickupTime: "10:00",
    vehicle: "Toyota Alphard 2.5",
  };
  const completeExplicitSourceFactsAnalysis = {
    bookingResult: {
      bookings: [completeExplicitSourceFactsBooking],
      multipleBookingsDetected: false,
      rawWarnings: [],
    },
    classification: "confirmed_booking",
    confidence: 0.94,
    reviewReasons: ["Airport terminal is not explicitly stated."],
    suggestedReply: "",
    summary: "Complete source-fact validation test.",
  };
  const completeExplicitSourceFacts = runtime.testValidateExplicitSourceFactsCompleteness(
    {
      body: syntheticPrestigeTransport15787Body,
    },
    completeExplicitSourceFactsAnalysis,
  );
  assert.equal(completeExplicitSourceFacts.ok, true);
  assert.equal(
    completeExplicitSourceFacts.analysis,
    completeExplicitSourceFactsAnalysis,
    "A complete source-consistent AI result must pass through unchanged, never be populated from source text.",
  );
  assert.deepEqual(completeExplicitSourceFacts.analysis.reviewReasons, [
    "Airport terminal is not explicitly stated.",
  ]);

  const possessivePassengerMobileBody = [
    syntheticPrestigeTransport15787Body,
    "Comment",
    "Passenger: Pui Yu Chan (Synthetic Guest)",
    "Ms. Chan's mobile: +65 9000 1234",
  ].join("\n");
  const possessivePassengerMobileAnalysis = {
    ...completeExplicitSourceFactsAnalysis,
    bookingResult: {
      ...completeExplicitSourceFactsAnalysis.bookingResult,
      bookings: [
        {
          ...completeExplicitSourceFactsBooking,
          bookerContact: "+6596389322",
          passengerContact: "+6590001234",
        },
      ],
    },
  };
  const possessivePassengerMobile =
    runtime.testValidateExplicitSourceFactsCompleteness(
      { body: possessivePassengerMobileBody },
      possessivePassengerMobileAnalysis,
    );
  assert.equal(
    possessivePassengerMobile.ok,
    true,
    "An exact possessive mobile label tied to the named Passenger must override the different Client-details phone for passengerContact.",
  );
  assert.equal(
    possessivePassengerMobile.analysis.bookingResult.bookings[0]
      .bookerContact,
    "+6596389322",
    "The separate Client-details phone must remain available as Booker contact evidence.",
  );
  const clientPhoneSubstitutedForPassenger =
    runtime.testValidateExplicitSourceFactsCompleteness(
      { body: possessivePassengerMobileBody },
      {
        ...possessivePassengerMobileAnalysis,
        bookingResult: {
          ...possessivePassengerMobileAnalysis.bookingResult,
          bookings: [
            {
              ...possessivePassengerMobileAnalysis.bookingResult.bookings[0],
              passengerContact: "+6596389322",
            },
          ],
        },
      },
    );
  assert.equal(
    clientPhoneSubstitutedForPassenger.ok,
    false,
    "A different Client-details phone must not replace an exact Passenger-labelled mobile.",
  );
  const unrelatedPossessiveMobile =
    runtime.testValidateExplicitSourceFactsCompleteness(
      {
        body: [
          syntheticPrestigeTransport15787Body,
          "Comment",
          "Passenger: Pui Yu Chan (Synthetic Guest)",
          "Mr. Lim's mobile: +65 9000 5678",
        ].join("\n"),
      },
      completeExplicitSourceFactsAnalysis,
    );
  assert.equal(
    unrelatedPossessiveMobile.ok,
    true,
    "A possessive mobile belonging to another named person must not override the Passenger contact.",
  );
  const completeExplicitSourceCanonicalText =
    emailAiSchema.adminEmailAiCanonicalBookingText(
      completeExplicitSourceFacts.analysis,
    );
  const completeExplicitSourceDispatchBooking =
    bookingParser.parseBookingMessage(completeExplicitSourceCanonicalText);
  assert.deepEqual(
    {
      bookingType: completeExplicitSourceDispatchBooking.bookingType,
      date: completeExplicitSourceDispatchBooking.date,
      extraStopCount: completeExplicitSourceDispatchBooking.extraStopCount,
      extraStopLocation:
        completeExplicitSourceDispatchBooking.extraStopLocation,
      flight: completeExplicitSourceDispatchBooking.flight,
      luggageCount: completeExplicitSourceDispatchBooking.luggageCount,
      name: completeExplicitSourceDispatchBooking.name,
      passengerContact:
        completeExplicitSourceDispatchBooking.passengerContact,
      pax: completeExplicitSourceDispatchBooking.pax,
      pickup: completeExplicitSourceDispatchBooking.pickup,
      time: completeExplicitSourceDispatchBooking.time,
      vehicle: completeExplicitSourceDispatchBooking.vehicle,
    },
    {
      bookingType: "DEP",
      date: "2026-08-19",
      extraStopCount: "1",
      extraStopLocation: "6 Suffolk Walk, Singapore 307464",
      flight: "SQ958",
      luggageCount: "3",
      name: "Pui Yu Chan",
      passengerContact: "+6596389322",
      pax: "2",
      pickup: "26 Newton Rd, Singapore 307957",
      time: "1000hrs",
      vehicle: "AVF",
    },
    "A complete verified AI structure must map through canonical text to the established Dispatch parser without losing a supplied operational field.",
  );

  const incompleteOrConflictingExplicitSourceFacts = [
    ["missing service meaning", { bookingType: "" }],
    ["conflicting service meaning", { bookingType: "MNG" }],
    ["missing pickup date", { pickupDate: "" }],
    ["conflicting pickup date", { pickupDate: "2026-08-20" }],
    ["missing pickup time", { pickupTime: "" }],
    ["conflicting pickup time", { pickupTime: "11:00" }],
    ["missing primary pickup", { pickup: "" }],
    [
      "combined primary pickup and waypoint",
      {
        pickup:
          "26 Newton Rd, Singapore 307957; 6 Suffolk Walk, Singapore 307464",
      },
    ],
    ["missing waypoint count", { extraStopCount: "" }],
    ["conflicting waypoint count", { extraStopCount: "2" }],
    ["missing waypoint location", { extraStopLocation: "" }],
    [
      "primary pickup substituted for waypoint",
      { extraStopLocation: "26 Newton Rd, Singapore 307957" },
    ],
    ["missing passenger name", { passengerName: "" }],
    ["conflicting passenger name", { passengerName: "Kim Hyun Soo" }],
    ["missing passenger phone", { passengerContact: "" }],
    ["conflicting passenger phone", { passengerContact: "+6591111111" }],
    ["missing booked passenger count", { pax: "" }],
    ["vehicle capacity substituted for booked passengers", { pax: "4" }],
    ["missing bag count", { bagCount: "" }],
    ["conflicting bag count", { bagCount: "4" }],
    ["missing vehicle", { vehicle: "" }],
    ["conflicting vehicle", { vehicle: "Mercedes Benz Viano" }],
    ["missing flight", { flightNumber: "" }],
    ["conflicting flight", { flightNumber: "SQ959" }],
    ["unsupported override", { customerPriceOverride: "unexpected" }],
    ["invented company without explicit evidence", { companyAccount: "Invented Agency" }],
  ];

  for (const [label, bookingPatch] of incompleteOrConflictingExplicitSourceFacts) {
    const result = runtime.testValidateExplicitSourceFactsCompleteness(
      { body: syntheticPrestigeTransport15787Body },
      {
        ...completeExplicitSourceFactsAnalysis,
        bookingResult: {
          ...completeExplicitSourceFactsAnalysis.bookingResult,
          bookings: [
            {
              ...completeExplicitSourceFactsBooking,
              ...bookingPatch,
            },
          ],
        },
      },
    );
    assert.equal(result.ok, false, `${label} must fail closed`);
    assert.match(
      result.error,
      /AI booking result is missing or conflicts with explicit source evidence; manual review required\./,
      `${label} must return the bounded source-consistency reason`,
    );
  }

  const ambiguousExplicitSourceFacts = runtime.testValidateExplicitSourceFactsCompleteness(
    {
      body: `${syntheticPrestigeTransport15787Body}\nPassenger phone: +65 9111 1111`,
    },
    completeExplicitSourceFactsAnalysis,
  );
  assert.equal(ambiguousExplicitSourceFacts.ok, false);

  const multipleBookingExplicitSourceFacts = runtime.testValidateExplicitSourceFactsCompleteness(
    { body: syntheticPrestigeTransport15787Body },
    {
      ...completeExplicitSourceFactsAnalysis,
      bookingResult: {
        ...completeExplicitSourceFactsAnalysis.bookingResult,
        bookings: [
          completeExplicitSourceFactsBooking,
          { ...completeExplicitSourceFactsBooking },
        ],
        multipleBookingsDetected: true,
      },
    },
  );
  assert.equal(multipleBookingExplicitSourceFacts.ok, false);
  assert.match(
    multipleBookingExplicitSourceFacts.error,
    /AI booking result is missing or conflicts with explicit source evidence; manual review required\./,
  );

  const explicitOrganisationBody = `${syntheticPrestigeTransport15787Body}\nAgency name Atlas Travel Partners`;
  const explicitOrganisationAnalysis = {
    ...completeExplicitSourceFactsAnalysis,
    bookingResult: {
      ...completeExplicitSourceFactsAnalysis.bookingResult,
      bookings: [
        {
          ...completeExplicitSourceFactsBooking,
          companyAccount: "Atlas Travel Partners",
        },
      ],
    },
  };
  const completeExplicitOrganisation = runtime.testValidateExplicitSourceFactsCompleteness(
    { body: explicitOrganisationBody },
    explicitOrganisationAnalysis,
  );
  assert.equal(completeExplicitOrganisation.ok, true);
  assert.equal(completeExplicitOrganisation.analysis, explicitOrganisationAnalysis);

  const sameLineCompanyAddressLabelBody = [
    syntheticPrestigeTransport15787Body,
    "Billing address",
    "Company name Atlas Example Wealth Management Co., Ltd. Company Address",
    "Example Tower, 1 Sample Street, Tokyo 100-0005",
  ].join("\n");
  const sameLineCompanyAddressLabelAnalysis = {
    ...completeExplicitSourceFactsAnalysis,
    bookingResult: {
      ...completeExplicitSourceFactsAnalysis.bookingResult,
      bookings: [
        {
          ...completeExplicitSourceFactsBooking,
          companyAccount: "Atlas Example Wealth Management Co., Ltd.",
        },
      ],
    },
  };
  const sameLineCompanyAddressLabel =
    runtime.testValidateExplicitSourceFactsCompleteness(
      { body: sameLineCompanyAddressLabelBody },
      sameLineCompanyAddressLabelAnalysis,
    );
  assert.equal(
    sameLineCompanyAddressLabel.ok,
    true,
    "A trailing Company Address field label must not become part of the explicit customer company name.",
  );

  const sourcePunctuationRestored =
    runtime.testValidateExplicitSourceFactsCompleteness(
      { body: sameLineCompanyAddressLabelBody },
      {
        ...sameLineCompanyAddressLabelAnalysis,
        bookingResult: {
          ...sameLineCompanyAddressLabelAnalysis.bookingResult,
          bookings: [
            {
              ...completeExplicitSourceFactsBooking,
              companyAccount: "Atlas Example Wealth Management Co., Ltd",
            },
          ],
        },
      },
    );
  assert.equal(
    sourcePunctuationRestored.ok,
    true,
    "Equivalent Company punctuation must still pass the established normalized evidence check.",
  );
  assert.equal(
    sourcePunctuationRestored.analysis.bookingResult.bookings[0].companyAccount,
    "Atlas Example Wealth Management Co., Ltd",
    "The explicit-source validator must remain a pure accept-or-reject guard.",
  );
  const sourcePunctuationPreserved =
    runtime.testPreserveValidatedExplicitCompanyDisplay(
      sameLineCompanyAddressLabelBody,
      sourcePunctuationRestored.analysis,
    );
  assert.equal(
    sourcePunctuationPreserved.bookingResult.bookings[0].companyAccount,
    "Atlas Example Wealth Management Co., Ltd.",
    "A semantically validated explicit Company must retain the exact source punctuation in the queued result.",
  );
  assert.equal(
    runtime.testPreserveValidatedExplicitCompanyDisplay(
      sameLineCompanyAddressLabelBody,
      sameLineCompanyAddressLabelAnalysis,
    ),
    sameLineCompanyAddressLabelAnalysis,
    "An already exact Company display must retain the established analysis object unchanged.",
  );

  for (const [label, companyAccount] of [
    ["missing same-line company", ""],
    ["truncated same-line company", "Atlas Example Wealth Management"],
    ["address label substituted for company", "Company Address"],
  ]) {
    const result = runtime.testValidateExplicitSourceFactsCompleteness(
      { body: sameLineCompanyAddressLabelBody },
      {
        ...sameLineCompanyAddressLabelAnalysis,
        bookingResult: {
          ...sameLineCompanyAddressLabelAnalysis.bookingResult,
          bookings: [
            {
              ...completeExplicitSourceFactsBooking,
              companyAccount,
            },
          ],
        },
      },
    );
    assert.equal(result.ok, false, `${label} must still fail closed`);
  }

  const companyAddressIsNotACompany =
    runtime.testValidateExplicitSourceFactsCompleteness(
      {
        body: `${syntheticPrestigeTransport15787Body}\nCompany Address Example Tower, 1 Sample Street`,
      },
      completeExplicitSourceFactsAnalysis,
    );
  assert.equal(
    companyAddressIsNotACompany.ok,
    true,
    "A Company Address field must never be interpreted as a customer company name.",
  );

  for (const [label, companyAccount] of [
    ["missing explicit source organisation", ""],
    ["conflicting explicit source organisation", "Atlas Travel"],
  ]) {
    const result = runtime.testValidateExplicitSourceFactsCompleteness(
      { body: explicitOrganisationBody },
      {
        ...explicitOrganisationAnalysis,
        bookingResult: {
          ...explicitOrganisationAnalysis.bookingResult,
          bookings: [
            {
              ...completeExplicitSourceFactsBooking,
              companyAccount,
            },
          ],
        },
      },
    );
    assert.equal(result.ok, false, `${label} must fail closed`);
  }

  const internalPrestigeBrandingIsNotCustomerCompany =
    runtime.testValidateExplicitSourceFactsCompleteness(
      {
        body: `${syntheticPrestigeTransport15787Body}\nCompany name Prestige Transport`,
      },
      completeExplicitSourceFactsAnalysis,
    );
  assert.equal(internalPrestigeBrandingIsNotCustomerCompany.ok, true);
  assert.equal(
    internalPrestigeBrandingIsNotCustomerCompany.analysis.bookingResult
      .bookings[0].companyAccount,
    "",
    "Legacy internal Prestige Transport branding must never become a customer company account.",
  );

  const verifiedSenderCanonicalDisplayAccount =
    runtime.testValidateExplicitSourceFactsCompleteness(
      {
        body: "Confirmed booking without a separately labelled organisation.",
        senderAddress: "transzend@groundbooker.com",
      },
      {
        ...completeExplicitSourceFactsAnalysis,
        bookingResult: {
          ...completeExplicitSourceFactsAnalysis.bookingResult,
          bookings: [
            {
              ...completeExplicitSourceFactsBooking,
              companyAccount: "Transzend Groundbooker",
            },
          ],
        },
      },
    );
  assert.equal(verifiedSenderCanonicalDisplayAccount.ok, true);

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

  fakeMailbox.uidNext = 104;
  fakeMailbox.messages.push({
    envelope: {
      from: [{ address: "transzend@groundbooker.com" }],
      to: [{ address: "info@prestigelimo.sg" }],
    },
    size: syntheticGroundBookerSource.length,
    source: syntheticGroundBookerSource,
    uid: 103,
  });

  const groundBookerParsed = await runtime.runAdminEmailAiIntake();
  assert.equal(groundBookerParsed.ok, true);
  assert.equal(groundBookerParsed.parsed, 1);
  assert.equal(groundBookerParsed.skipped, 0);
  assert.equal(providerRequestBodies.length, 3);
  assert.equal(downloadCalls, 3);
  assert.equal(intakeRows.length, 3);
  assert.equal(
    intakeRows[2].sender_address,
    "transzend@groundbooker.com",
  );
  assert.equal(intakeRows[2].classification, "confirmed_booking");
  assert.equal(intakeRows[2].processing_status, "queued");
  assert.equal(
    intakeRows[2].booking_parse_result.bookings[0].companyAccount,
    "Transzend Groundbooker",
    "The exact verified GroundBooker sender must retain one canonical display-only company account even when AI shortens it.",
  );
  assert.equal(intakeRows[2].booking_parse_result.bookings[0].bookerName, "Pat");
  assert.equal(intakeRows[2].booking_parse_result.bookings[0].passengerName, "Simran Shah");
  assert.equal(
    intakeRows[2].booking_parse_result.bookings[0].companyId,
    undefined,
    "Email AI sender canonicalization must never infer a verified company ID.",
  );
  assert.deepEqual(adminDevicePushEvents, [
    "email_confirmed_booking",
    "email_confirmed_booking",
  ]);

  fakeMailbox.uidNext = 105;
  fakeMailbox.messages.push({
    envelope: {
      from: [{ address: "info@prestigelimo.sg" }],
      to: [{ address: "booking@prestigelimo.sg" }],
    },
    size: syntheticPrestigeTransportIdentityConflictSource.length,
    source: syntheticPrestigeTransportIdentityConflictSource,
    uid: 104,
  });

  const prestigeTransportParsed = await runtime.runAdminEmailAiIntake();
  assert.equal(prestigeTransportParsed.ok, true);
  assert.equal(prestigeTransportParsed.parsed, 1);
  assert.equal(prestigeTransportParsed.skipped, 0);
  assert.equal(providerRequestBodies.length, 4);
  assert.equal(downloadCalls, 4);
  assert.equal(intakeRows.length, 4);
  assert.equal(intakeRows[3].classification, "confirmed_booking");
  assert.equal(intakeRows[3].processing_status, "queued");
  assert.equal(
    intakeRows[3].booking_parse_result.bookings[0].bookerName,
    "",
    "Prestige Transport client details must not silently reuse the passenger as Booker when the labelled email belongs to a different person",
  );
  assert.equal(
    intakeRows[3].booking_parse_result.bookings[0].passengerName,
    "Mr. Zenji Nakamura",
  );
  assert.match(
    intakeRows[3].review_reasons.join("\n"),
    /Booker name conflicts with the labelled client email; confirm the Booker before Save \+ CRM\./,
  );
  assert.match(
    intakeRows[3].booking_parse_result.bookings[0].needsReviewReasons.join("\n"),
    /Booker name conflicts with the labelled client email; confirm the Booker before Save \+ CRM\./,
  );
  assert.doesNotMatch(
    intakeRows[3].canonical_booking_text,
    /^Booker: Zenji Nakamura$/m,
  );
  assert.match(
    intakeRows[3].canonical_booking_text,
    /^Passenger: Mr\. Zenji Nakamura$/m,
  );
  assert.deepEqual(adminDevicePushEvents, [
    "email_confirmed_booking",
    "email_confirmed_booking",
    "email_confirmed_booking",
  ]);

  fakeMailbox.uidNext = 106;
  fakeMailbox.messages.push({
    envelope: {
      from: [{ address: "info@prestigelimo.sg" }],
      to: [{ address: "booking@prestigelimo.sg" }],
    },
    size: syntheticPrestigeTransport15784Source.length,
    source: syntheticPrestigeTransport15784Source,
    uid: 105,
  });

  const prestigeTransport15784Parsed = await runtime.runAdminEmailAiIntake();
  assert.equal(prestigeTransport15784Parsed.ok, true);
  assert.equal(intakeRows.length, 5);
  assert.equal(intakeRows[4].booking_parse_result.bookings[0].bookerName, "Kim Hyun Soo");
  assert.equal(intakeRows[4].booking_parse_result.bookings[0].bookerEmail, "hyunsoostar@hotmail.com");
  assert.equal(intakeRows[4].booking_parse_result.bookings[0].bookerContact, "+65 98156017");
  assert.equal(intakeRows[4].booking_parse_result.bookings[0].passengerName, "Shohei Ogasawara");
  assert.equal(intakeRows[4].booking_parse_result.bookings[0].bookingType, "MNG");
  assert.equal(intakeRows[4].booking_parse_result.bookings[0].pickupDate, "2026-08-17");
  assert.equal(intakeRows[4].booking_parse_result.bookings[0].companyId, undefined);
  assert.equal(intakeRows[4].booking_parse_result.bookings[0].bookerId, undefined);
  assert.equal(intakeRows[4].booking_parse_result.bookings[0].travelerId, undefined);
  assert.match(intakeRows[4].canonical_booking_text, /^Booker: Kim Hyun Soo$/m);
  assert.doesNotMatch(intakeRows[4].canonical_booking_text, /^Booker: hyunsoostar$/m);

  fakeMailbox.uidNext = 107;
  fakeMailbox.messages.push({
    envelope: {
      from: [{ address: "info@prestigelimo.sg" }],
      to: [{ address: "booking@prestigelimo.sg" }],
    },
    size: syntheticPrestigeTransport15785Source.length,
    source: syntheticPrestigeTransport15785Source,
    uid: 106,
  });

  const prestigeTransport15785Parsed = await runtime.runAdminEmailAiIntake();
  assert.equal(prestigeTransport15785Parsed.ok, true);
  assert.equal(intakeRows.length, 6);
  assert.equal(intakeRows[5].booking_parse_result.bookings[0].bookerName, "Kim Hyun Soo");
  assert.equal(intakeRows[5].booking_parse_result.bookings[0].bookerEmail, "hyunsoostar@hotmail.com");
  assert.equal(intakeRows[5].booking_parse_result.bookings[0].bookerContact, "+65 98156017");
  assert.equal(intakeRows[5].booking_parse_result.bookings[0].passengerName, "Shohei Ogasawara");
  assert.equal(intakeRows[5].booking_parse_result.bookings[0].bookingType, "DEP");
  assert.equal(intakeRows[5].booking_parse_result.bookings[0].pickupDate, "2026-08-19");
  assert.match(intakeRows[5].normalized_text, /Phone number \+818024138363/);
  assert.equal(intakeRows[5].booking_parse_result.bookings[0].companyId, undefined);
  assert.equal(intakeRows[5].booking_parse_result.bookings[0].bookerId, undefined);
  assert.equal(intakeRows[5].booking_parse_result.bookings[0].travelerId, undefined);
  assert.match(intakeRows[5].canonical_booking_text, /^Booker: Kim Hyun Soo$/m);
  assert.match(intakeRows[5].canonical_booking_text, /^Contact: \+65 98156017$/m);
  assert.doesNotMatch(intakeRows[5].canonical_booking_text, /^Booker: hyunsoostar$/m);
  assert.deepEqual(adminDevicePushEvents, [
    "email_confirmed_booking",
    "email_confirmed_booking",
    "email_confirmed_booking",
    "email_confirmed_booking",
    "email_confirmed_booking",
  ]);

  fakeMailbox.uidNext = 108;
  fakeMailbox.messages.push({
    envelope: {
      from: [{ address: "info@prestigelimo.sg" }],
      to: [{ address: "booking@prestigelimo.sg" }],
    },
    size: syntheticPrestigeTransport15787Source.length,
    source: syntheticPrestigeTransport15787Source,
    uid: 107,
  });

  const prestigeTransport15787Parsed = await runtime.runAdminEmailAiIntake();
  assert.equal(prestigeTransport15787Parsed.ok, true);
  assert.equal(prestigeTransport15787Parsed.parsed, 1);
  assert.equal(intakeRows.length, 7);
  assert.match(
    providerRequestBodies[6].instructions,
    /Read the complete email before producing the structured booking result\./,
  );
  assert.match(
    providerRequestBodies[6].input,
    /Comment 1st Pick up: Ms\. Chan \(26 Newton Road\), 2nd Pick up: Mr\. Kim \(6 Suffolk Walk\)/,
  );
  assert.equal(
    providerRequestBodies[6].input,
    `Subject:\nNew booking "Prestige Transport 15787" has been received\n\nEmail body:\n${syntheticPrestigeTransport15787Body}`,
    "The complete parsed original email body must reach the AI contract without omitted or reordered sections.",
  );
  assert.match(
    providerRequestBodies[6].input,
    /ROUTE LOCATIONS\s+6 Suffolk Walk, 싱가포르 6 Suffolk Walk, Singapore 307464\s+PICK UP LOCATION\s+26 Newton Rd, 싱가포르 307957/,
  );
  assert.equal(intakeRows[6].processing_status, "queued");
  assert.equal(
    intakeRows[6].booking_parse_result.bookings[0].extraStopLocation,
    "6 Suffolk Walk, Singapore 307464",
  );
  assert.equal(
    intakeRows[6].booking_parse_result.bookings[0].extraStops,
    "6 Suffolk Walk, Singapore 307464",
    "The legacy extraStops field must agree with the exact AI-returned structured extraStopLocation.",
  );
  assert.equal(
    intakeRows[6].booking_parse_result.bookings[0].bookerName,
    "Kim Hyun Soo",
  );
  assert.equal(
    intakeRows[6].booking_parse_result.bookings[0].passengerContact,
    "+6596389322",
  );
  assert.deepEqual(intakeRows[6].review_reasons, [
    "Booking status is Pending (new); verify whether this is final and confirmed.",
    "Airport name and terminal are not explicitly stated.",
    "Unrelated dispatch instruction requires manual confirmation.",
  ]);
  assert.deepEqual(
    intakeRows[6].booking_parse_result.bookings[0].needsReviewReasons,
    [
      "Airport name and terminal are not explicitly stated.",
      "Verify whether Pending (new) represents a final confirmed booking.",
      "Unrelated dispatch instruction requires manual confirmation.",
    ],
  );
  assert.equal(intakeRows[6].openai_input_tokens, 100);
  assert.equal(intakeRows[6].openai_output_tokens, 80);
  assert.deepEqual(adminDevicePushEvents, [
    "email_confirmed_booking",
    "email_confirmed_booking",
    "email_confirmed_booking",
    "email_confirmed_booking",
    "email_confirmed_booking",
    "email_confirmed_booking",
  ]);

  fakeMailbox.uidNext = 109;
  fakeMailbox.messages.push({
    envelope: {
      from: [{ address: "transzend@groundbooker.com" }],
      to: [{ address: "info@prestigelimo.sg" }],
    },
    size: syntheticGroundBookerOrderRequestSource.length,
    source: syntheticGroundBookerOrderRequestSource,
    uid: 108,
  });

  const groundBookerOrderRequestParsed =
    await runtime.runAdminEmailAiIntake();
  assert.equal(groundBookerOrderRequestParsed.ok, true);
  assert.equal(groundBookerOrderRequestParsed.parsed, 1);
  assert.equal(groundBookerOrderRequestParsed.skipped, 0);
  assert.equal(providerRequestBodies.length, 8);
  assert.equal(downloadCalls, 8);
  assert.equal(intakeRows.length, 8);
  assert.equal(intakeRows[7].classification, "enquiry");
  assert.equal(
    intakeRows[7].processing_status,
    "queued",
    "Only an exact verified GroundBooker order-shaped enquiry must enter the established Admin review lane.",
  );
  assert.equal(
    intakeRows[7].booking_parse_result.bookings[0].companyAccount,
    "Transzend Groundbooker",
  );
  assert.deepEqual(
    adminDevicePushEvents,
    [
      "email_confirmed_booking",
      "email_confirmed_booking",
      "email_confirmed_booking",
      "email_confirmed_booking",
      "email_confirmed_booking",
      "email_confirmed_booking",
    ],
    "An honestly classified GroundBooker confirmation request must not emit a misleading confirmed-booking push.",
  );

  fakeMailbox.uidNext = 110;
  fakeMailbox.messages.push({
    envelope: {
      from: [{ address: "info@prestigelimo.sg" }],
      to: [{ address: "booking@prestigelimo.sg" }],
    },
    size: syntheticPrestigeTransportDepartureRoleTextSource.length,
    source: syntheticPrestigeTransportDepartureRoleTextSource,
    uid: 109,
  });

  const prestigeTransportDepartureRoleTextParsed =
    await runtime.runAdminEmailAiIntake();
  assert.equal(prestigeTransportDepartureRoleTextParsed.ok, true);
  assert.equal(prestigeTransportDepartureRoleTextParsed.parsed, 1);
  assert.equal(prestigeTransportDepartureRoleTextParsed.skipped, 0);
  assert.equal(providerRequestBodies.length, 9);
  assert.equal(downloadCalls, 9);
  assert.equal(intakeRows.length, 9);
  assert.equal(
    intakeRows[8].processing_status,
    "queued",
    "The repaired AI instruction contract must keep an explicit Airport Departure automatically reviewable without inferring a company from passenger role text.",
  );
  assert.equal(intakeRows[8].classification, "confirmed_booking");
  assert.equal(
    intakeRows[8].booking_parse_result.bookings[0].bookingType,
    "DEP",
  );
  assert.equal(
    intakeRows[8].booking_parse_result.bookings[0].companyAccount,
    "",
  );
  assert.equal(
    intakeRows[8].booking_parse_result.bookings[0].passengerContact,
    "+819000000001",
  );
  assert.equal(intakeRows[8].booking_parse_result.bookings[0].pax, "1");
  assert.equal(intakeRows[8].booking_parse_result.bookings[0].bagCount, "3");
  assert.equal(intakeRows[8].booking_parse_result.bookings[0].bookerName, "");
  assert.match(
    intakeRows[8].review_reasons.join("\n"),
    /Booker name conflicts with the labelled client email; confirm the Booker before Save \+ CRM\./,
  );
  assert.equal(adminDevicePushEvents.at(-1), "email_confirmed_booking");
  assert.equal(adminDevicePushEvents.length, 7);

  const blockedSource = Buffer.from(
    syntheticAllowedSource
      .toString()
      .replaceAll("info@prestigelimo.sg", "other@example.test")
      .replace("synthetic-booking-1", "synthetic-booking-2"),
  );
  fakeMailbox.uidNext = 111;
  fakeMailbox.messages.push({
    envelope: {
      from: [{ address: "other@example.test" }],
      to: [{ address: "booking@prestigelimo.sg" }],
    },
    size: blockedSource.length,
    source: blockedSource,
    uid: 110,
  });

  const skipped = await runtime.runAdminEmailAiIntake();
  assert.equal(skipped.ok, true);
  assert.equal(skipped.parsed, 0);
  assert.equal(skipped.skipped, 1);
  assert.equal(providerRequestBodies.length, 9);
  assert.equal(downloadCalls, 9, "blocked sender body must not be fetched");
  assert.equal(intakeRows.length, 9);

  const loaded = await runtime.loadAdminEmailAiIntake(fakeDatabase);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.data.records.length, 8);
  assert.equal(
    loaded.data.records.some(
      (record) => record.id === intakeRows[1].id,
    ),
    false,
    "An ordinary queued enquiry must remain excluded from the existing app review feed.",
  );
  assert.equal(
    loaded.data.records.some(
      (record) => record.id === intakeRows[7].id,
    ),
    true,
    "The exact verified GroundBooker order-shaped enquiry must survive the guarded server read.",
  );
  assert.equal(loaded.data.records[0].classification, "confirmed_booking");
  assert.equal(
    loaded.data.records[1].sender_address,
    "transzend@groundbooker.com",
  );
  assert.deepEqual(loaded.data.token_usage, {
    available: true,
    input_tokens: 900,
    month_key: loaded.data.token_usage.month_key,
    output_tokens: 720,
    total_tokens: 1620,
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
  assert.equal(allowedReadBody.records.length, 8);
  assert.equal(allowedReadBody.token_usage.total_tokens, 1620);

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

  const groundBookerOrderRequestRecord = allowedReadBody.records.find(
    (record) => record.subject.includes("[INQ#817905]"),
  );
  assert.ok(groundBookerOrderRequestRecord);
  const groundBookerOrderRequestReview = await route.PATCH(
    new Request("http://localhost/api/admin-email-ai-intake", {
      body: JSON.stringify({
        intake_id: groundBookerOrderRequestRecord.id,
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
  assert.equal(groundBookerOrderRequestReview.status, 200);
  assert.equal(intakeRows[7].processing_status, "reviewed");

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
  const afterReviewRecords = (await afterReviewRead.json()).records;
  assert.equal(afterReviewRecords.length, 6);
  assert.equal(
    afterReviewRecords[0].sender_address,
    "transzend@groundbooker.com",
  );
  assert.equal(afterReviewRecords[0].processing_status, "queued");

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
  assert.equal(providerRequestBodies.length, 9);
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
