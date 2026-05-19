import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const emptyMessageError = "Paste a booking message before using AI Assist Parse.";
const mockRouteMessage = "AI parser API route is ready but not connected to OpenAI yet.";
const liveModeDisabledError = "Live AI parsing is not enabled yet. Use AI_PARSE_MODE=mock.";
const invalidModeError = "Invalid AI_PARSE_MODE. Use mock.";
const originalAiParseMode = process.env.AI_PARSE_MODE;
const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
const routeSourcePath = path.join(process.cwd(), "app/api/ai-parse/route.ts");
const schemaSourcePath = path.join(process.cwd(), "lib/ai-parser-schema.ts");

function transpileTypescript(source, filename) {
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-ai-parse-route-"));
  const routeOutputPath = path.join(tempDir, "app/api/ai-parse/route.js");
  const schemaOutputPath = path.join(tempDir, "lib/ai-parser-schema.js");
  const routeSource = await readFile(routeSourcePath, "utf8");
  const schemaSource = await readFile(schemaSourcePath, "utf8");

  assert.equal(routeSource.includes("OPENAI_API_KEY"), false);
  assert.equal(routeSource.includes("api.openai.com"), false);
  assert.equal(routeSource.includes("fetch("), false);
  assert.equal(routeSource.includes("@supabase"), false);
  assert.equal(routeSource.toLowerCase().includes("createclient"), false);

  await mkdir(path.dirname(routeOutputPath), { recursive: true });
  await mkdir(path.dirname(schemaOutputPath), { recursive: true });
  await writeFile(routeOutputPath, transpileTypescript(routeSource, routeSourcePath));
  await writeFile(schemaOutputPath, transpileTypescript(schemaSource, schemaSourcePath));

  const require = createRequire(import.meta.url);
  return {
    routeModule: require(routeOutputPath),
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
  };
}

async function postJson(routeModule, body) {
  return routeModule.POST(
    new Request("http://localhost/api/ai-parse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function postRaw(routeModule, body) {
  return routeModule.POST(
    new Request("http://localhost/api/ai-parse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }),
  );
}

async function assertMockSuccess(routeModule, message) {
  const response = await postJson(routeModule, { message });
  assert.equal(response.status, 200);

  const responseJson = await response.json();
  assert.equal(responseJson.ok, true);
  assert.equal(responseJson.mode, "mock");
  assert.equal(responseJson.message, mockRouteMessage);
  assert.equal(responseJson.savedBookingId, undefined);
  assert.equal(responseJson.bookingId, undefined);
  assert.equal(responseJson.result.multipleBookingsDetected, false);
  assert.equal(Array.isArray(responseJson.result.bookings), true);
  assert.equal(Array.isArray(responseJson.result.rawWarnings), true);
  assert.equal(responseJson.result.rawWarnings.includes(mockRouteMessage), true);
  assert.equal(responseJson.result.bookings.length, 1);

  const booking = responseJson.result.bookings[0];
  assert.equal(booking.confidence, 0.1);
  assert.equal(Array.isArray(booking.needsReviewReasons), true);
  assert.equal(booking.needsReviewReasons.includes("Mock response only — review required"), true);
  assert.equal(booking.bookingType, "");
  assert.equal(booking.companyAccount, "");
  assert.equal(booking.pickupDate, "");
  assert.equal(booking.flightNumber, "");
  assert.equal(booking.pickup, "");
  assert.equal(booking.dropoff, "");
  assert.equal(booking.savedBookingId, undefined);
  assert.equal(booking.bookingId, undefined);
}

delete process.env.OPENAI_API_KEY;

const { routeModule, cleanup } = await loadRouteModule();

try {
  assert.equal(routeModule.GET, undefined);

  delete process.env.AI_PARSE_MODE;
  await assertMockSuccess(
    routeModule,
    "Need a Viano tomorrow 11am from Shenton Way to Capital Tower.",
  );

  process.env.AI_PARSE_MODE = "mock";
  await assertMockSuccess(routeModule, "Need an E-class on 27/05/2026 at 15:30.");

  process.env.AI_PARSE_MODE = "live";
  const liveResponse = await postJson(routeModule, { message: "Need a car tomorrow." });
  assert.equal(liveResponse.status, 503);
  assert.deepEqual(await liveResponse.json(), {
    ok: false,
    mode: "live",
    error: liveModeDisabledError,
    result: {
      multipleBookingsDetected: false,
      bookings: [],
      rawWarnings: [liveModeDisabledError],
    },
  });

  process.env.AI_PARSE_MODE = "paid";
  const invalidModeResponse = await postJson(routeModule, { message: "Need a car tomorrow." });
  assert.equal(invalidModeResponse.status, 400);
  assert.deepEqual(await invalidModeResponse.json(), {
    ok: false,
    mode: "paid",
    error: invalidModeError,
    result: {
      multipleBookingsDetected: false,
      bookings: [],
      rawWarnings: [invalidModeError],
    },
  });

  process.env.AI_PARSE_MODE = "live";
  const emptyResponse = await postJson(routeModule, { message: "   " });
  assert.equal(emptyResponse.status, 400);
  assert.deepEqual(await emptyResponse.json(), {
    ok: false,
    error: emptyMessageError,
  });

  const malformedResponse = await postRaw(routeModule, "{not json");
  assert.equal(malformedResponse.status, 400);
  assert.equal((await malformedResponse.json()).error, emptyMessageError);
} finally {
  await cleanup();

  if (originalAiParseMode === undefined) {
    delete process.env.AI_PARSE_MODE;
  } else {
    process.env.AI_PARSE_MODE = originalAiParseMode;
  }

  if (originalOpenAiApiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalOpenAiApiKey;
  }
}

console.log("AI parse API route mode gate tests passed.");
