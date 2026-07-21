import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

const sourcePaths = {
  route: path.join(process.cwd(), "app/api/ai-parse/route.ts"),
  runtime: path.join(process.cwd(), "lib/admin-ai-runtime.ts"),
  schema: path.join(process.cwd(), "lib/ai-parser-schema.ts"),
  boundary: path.join(process.cwd(), "lib/admin-dispatcher-auth-boundary.ts"),
};
const envNames = [
  "AI_PARSE_MODE",
  "OPENAI_API_KEY",
  "PRESTIGE_ADMIN_AI_ENABLED",
  "PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED",
  "PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE",
];
const originalEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
const originalFetch = globalThis.fetch;

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

async function loadRouteModule() {
  const tempDir = await mkdtemp(path.join(process.cwd(), ".tmp-ai-parse-route-"));
  const targets = {
    route: path.join(tempDir, "app/api/ai-parse/route.js"),
    runtime: path.join(tempDir, "lib/admin-ai-runtime.js"),
    schema: path.join(tempDir, "lib/ai-parser-schema.js"),
    boundary: path.join(tempDir, "lib/admin-dispatcher-auth-boundary.js"),
  };

  for (const name of Object.keys(sourcePaths)) {
    const source = await readFile(sourcePaths[name], "utf8");
    await mkdir(path.dirname(targets[name]), { recursive: true });
    await writeFile(targets[name], transpile(source, sourcePaths[name]));
  }

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    routeModule: createRequire(import.meta.url)(targets.route),
  };
}

function post(routeModule, body, headers = {}) {
  return routeModule.POST(new Request("http://localhost/api/ai-parse", {
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
      referer: "http://localhost/",
      "x-prestige-admin-purpose": "admin-ai-assistant",
      ...headers,
    },
    method: "POST",
  }));
}

for (const name of envNames) delete process.env[name];

const { cleanup, routeModule } = await loadRouteModule();

try {
  assert.equal(routeModule.GET, undefined, "parser route must remain POST-only");

  const blocked = await post(routeModule, { message: "Need a car." }, {
    "x-prestige-admin-purpose": "wrong-purpose",
  });
  assert.equal(blocked.status, 403);
  assert.equal((await blocked.json()).write_action, false);

  const mock = await post(routeModule, {
    message: "Need a Viano tomorrow 11am from Shenton Way to Capital Tower.",
  });
  const mockBody = await mock.json();
  assert.equal(mock.status, 200);
  assert.equal(mockBody.ok, true);
  assert.equal(mockBody.mode, "mock");
  assert.equal(mockBody.write_action, false);
  assert.equal(mockBody.external_send, false);
  assert.equal(mockBody.message, "AI parser remains in local mock mode. No OpenAI request was made.");
  assert.equal(mockBody.result.bookings.length, 1);
  assert.equal(mockBody.result.bookings[0].confidence, 0.1);

  process.env.AI_PARSE_MODE = "live";
  const disabled = await post(routeModule, { message: "Need a car." });
  assert.equal(disabled.status, 503);
  assert.equal((await disabled.json()).error, "Admin AI is not enabled.");

  process.env.PRESTIGE_ADMIN_AI_ENABLED = "true";
  const missingKey = await post(routeModule, { message: "Need a car." });
  assert.equal(missingKey.status, 503);
  assert.equal((await missingKey.json()).error, "OpenAI API key is not configured.");

  let providerRequestBody = null;
  process.env.OPENAI_API_KEY = "test-key-not-a-secret";
  globalThis.fetch = async (_url, init) => {
    providerRequestBody = JSON.parse(String(init?.body || "{}"));
    const parsedBooking = {
      bookings: [{
        bookerContact: "",
        bookerEmail: "",
        bookerName: "",
        bookingType: "TRF",
        companyAccount: "",
        confidence: 0.9,
        customerPriceOverride: "",
        dropoff: "Marina Bay Sands",
        extraStopLocation: "",
        extraStops: "",
        flightNumber: "",
        needsReviewReasons: [],
        notes: "",
        passengerName: "Alex Test",
        pax: "2",
        pickup: "Changi Airport Terminal 3",
        pickupDate: "2026-07-22",
        pickupTime: "10:30",
        vehicle: "AVF",
      }],
      multipleBookingsDetected: false,
      rawWarnings: [],
    };

    return new Response(JSON.stringify({
      created_at: 1,
      id: "resp_parse_test",
      model: "gpt-5.6-luna",
      object: "response",
      output: [{
        content: [{ annotations: [], text: JSON.stringify(parsedBooking), type: "output_text" }],
        id: "msg_parse_test",
        role: "assistant",
        status: "completed",
        type: "message",
      }],
      status: "completed",
      usage: { input_tokens: 35, output_tokens: 40, total_tokens: 75 },
    }), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  };

  const live = await post(routeModule, { message: "Alex Test, Changi T3 to MBS." });
  const liveBody = await live.json();
  assert.equal(live.status, 200);
  assert.equal(liveBody.ok, true);
  assert.equal(liveBody.mode, "live");
  assert.equal(liveBody.write_action, false);
  assert.equal(liveBody.external_send, false);
  assert.equal(liveBody.result.bookings[0].passengerName, "Alex Test");
  assert.deepEqual(liveBody.usage, { inputTokens: 35, outputTokens: 40, totalTokens: 75 });
  assert.equal(providerRequestBody.store, false);
  assert.deepEqual(providerRequestBody.tools, []);
  assert.equal(providerRequestBody.model, "gpt-5.6-luna");
  assert.equal(providerRequestBody.text.format.type, "json_schema");

  process.env.AI_PARSE_MODE = "paid";
  const invalid = await post(routeModule, { message: "Need a car." });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error, "Invalid AI_PARSE_MODE. Use mock or live.");

  const empty = await post(routeModule, { message: "  " });
  assert.equal(empty.status, 400);
  assert.equal((await empty.json()).error, "Paste a booking message before using AI Parse Booking.");

  const malformed = await post(routeModule, "{not json");
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).write_action, false);
} finally {
  globalThis.fetch = originalFetch;
  await cleanup();
  for (const name of envNames) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
}

console.log("AI parse API route auth, mock, and live runtime gates passed.");
