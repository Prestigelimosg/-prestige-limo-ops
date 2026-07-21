import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

const paths = {
  app: path.join(process.cwd(), "app/page.tsx"),
  book: path.join(process.cwd(), "app/book/page.tsx"),
  route: path.join(process.cwd(), "app/api/admin-ai-assistant/route.ts"),
  runtime: path.join(process.cwd(), "lib/admin-ai-runtime.ts"),
  schema: path.join(process.cwd(), "lib/ai-parser-schema.ts"),
  boundary: path.join(process.cwd(), "lib/admin-dispatcher-auth-boundary.ts"),
};
const originalFetch = globalThis.fetch;
const originalEnabled = process.env.PRESTIGE_ADMIN_AI_ENABLED;
const originalKey = process.env.OPENAI_API_KEY;
const sources = Object.fromEntries(
  await Promise.all(Object.entries(paths).map(async ([name, file]) => [name, await readFile(file, "utf8")])),
);

assert.equal((sources.app.match(/data-ai-assist-mode-selector=/g) || []).length, 1);
assert.equal((sources.app.match(/fetch\("\/api\/admin-ai-assistant"/g) || []).length, 1);
assert.match(sources.app, /data-ai-assist-mode=\{mode\}/);
assert.match(sources.app, /"Booking Parser"/);
assert.match(sources.app, /"Ask AI"/);
assert.match(sources.app, /"Send to AI"/);
assert.match(sources.app, /disabled=\{aiAssistMode !== "parser"\}/);
assert.match(sources.app, /onClick=\{handleParseBookingMessage\}/);
assert.match(sources.app, /setAiConversationMessages\(\[\]\)/);
assert.doesNotMatch(sources.book, /\/api\/(?:ai-parse|admin-ai-assistant)/);

for (const sourceName of ["route", "runtime"]) {
  for (const forbidden of [
    "@supabase",
    "adminLegacyDataClient",
    "customer_driver_app_notification_outbox",
    "/api/admin-saved-bookings",
    "/api/customer-driver-quick-replies",
    "driver_job_status_events",
    "driver_live_location_latest_positions",
    "customer_invoices",
  ]) {
    assert.equal(
      sources[sourceName].toLowerCase().includes(forbidden.toLowerCase()),
      false,
      `${sourceName} must not contain ${forbidden}`,
    );
  }
}

for (const required of [
  "store: false",
  "tools: []",
  "max_output_tokens: 600",
  "slice(-6)",
  "PRESTIGE_ADMIN_AI_ENABLED",
  "OPENAI_API_KEY",
  "MNG is an arrival or meet-and-greet pickup",
  "TRF is a point-to-point transfer that is not an arrival or departure",
  "If the text explicitly says arrival or MNG, use MNG",
]) {
  assert.match(sources.runtime, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
assert.match(sources.route, /write_action: false/);
assert.match(sources.route, /external_send: false/);
assert.match(sources.route, /allowServerSessionRoleMethodsWithoutRequestToken: \["POST"\]/);

function transpile(source, filename) {
  return ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  }).outputText;
}

const tempDir = await mkdtemp(path.join(process.cwd(), ".tmp-admin-ai-assistant-"));
const targets = {
  route: path.join(tempDir, "app/api/admin-ai-assistant/route.js"),
  runtime: path.join(tempDir, "lib/admin-ai-runtime.js"),
  schema: path.join(tempDir, "lib/ai-parser-schema.js"),
  boundary: path.join(tempDir, "lib/admin-dispatcher-auth-boundary.js"),
};

try {
  for (const name of Object.keys(targets)) {
    await mkdir(path.dirname(targets[name]), { recursive: true });
    await writeFile(targets[name], transpile(sources[name], paths[name]));
  }
  const require = createRequire(import.meta.url);
  const route = require(targets.route);
  const runtime = require(targets.runtime);

  const turns = runtime.parseAdminAiConversationTurns([
    { role: "invalid", text: "remove" },
    ...Array.from({ length: 8 }, (_, index) => ({ role: index % 2 ? "assistant" : "admin", text: `turn ${index}` })),
  ]);
  assert.equal(turns.length, 6);
  assert.equal(turns[0].text, "turn 2");

  delete process.env.PRESTIGE_ADMIN_AI_ENABLED;
  delete process.env.OPENAI_API_KEY;
  const request = new Request("http://localhost/api/admin-ai-assistant", {
    body: JSON.stringify({ message: "Summarise this." }),
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
      referer: "http://localhost/",
      "x-prestige-admin-purpose": "admin-ai-assistant",
    },
    method: "POST",
  });
  const disabled = await route.POST(request);
  assert.equal(disabled.status, 503);
  assert.deepEqual(await disabled.json(), {
    error: "Admin AI is not enabled.",
    external_send: false,
    ok: false,
    write_action: false,
  });

  let providerRequestBody = null;
  process.env.PRESTIGE_ADMIN_AI_ENABLED = "true";
  process.env.OPENAI_API_KEY = "test-key-not-a-secret";
  globalThis.fetch = async (_url, init) => {
    providerRequestBody = JSON.parse(String(init?.body || "{}"));

    return new Response(JSON.stringify({
      created_at: 1,
      id: "resp_test",
      model: "gpt-5.6-terra",
      object: "response",
      output: [{
        content: [{ annotations: [], text: "The pickup terminal is missing.", type: "output_text" }],
        id: "msg_test",
        role: "assistant",
        status: "completed",
        type: "message",
      }],
      status: "completed",
      usage: { input_tokens: 20, output_tokens: 7, total_tokens: 27 },
    }), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  };

  const successful = await runtime.requestAdminAiConversation("What is missing?", turns);
  assert.deepEqual(successful, {
    data: { answer: "The pickup terminal is missing." },
    model: "gpt-5.6-terra",
    ok: true,
    usage: { inputTokens: 20, outputTokens: 7, totalTokens: 27 },
  });
  assert.equal(providerRequestBody.store, false);
  assert.deepEqual(providerRequestBody.tools, []);
  assert.equal(providerRequestBody.max_output_tokens, 600);
  assert.equal(providerRequestBody.model, "gpt-5.6-terra");
} finally {
  globalThis.fetch = originalFetch;
  if (originalEnabled === undefined) delete process.env.PRESTIGE_ADMIN_AI_ENABLED;
  else process.env.PRESTIGE_ADMIN_AI_ENABLED = originalEnabled;
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
  await rm(tempDir, { force: true, recursive: true });
}

console.log("Admin AI Assistant read-only lane guard passed.");
