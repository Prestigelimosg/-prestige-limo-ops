import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";

const helperPath = "lib/supabase-modern-secret-fetch-compat.ts";
const instrumentationPath = "instrumentation.ts";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationPath = "scripts/test-preactivation-verification-suite.mjs";

const [helperSource, instrumentationSource, ledger, preactivation] = await Promise.all([
  readFile(helperPath, "utf8"),
  readFile(instrumentationPath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationPath, "utf8"),
]);

for (const phrase of [
  'import "server-only";',
  'apiKey.startsWith("sb_secret_")',
  'authorization === `Bearer ${apiKey}`',
  'headers.delete("authorization")',
  "requestUrl.origin !== supabaseOrigin",
]) {
  assert.ok(helperSource.includes(phrase), `Modern secret fetch helper missing: ${phrase}`);
}

for (const phrase of [
  'process.env.NEXT_RUNTIME === "nodejs"',
  'process.env.SUPABASE_URL',
  '"./lib/supabase-modern-secret-fetch-compat.ts"',
  "installSupabaseModernSecretFetchCompatibility",
]) {
  assert.ok(
    instrumentationSource.includes(phrase),
    `Server instrumentation missing: ${phrase}`,
  );
}

assert.ok(
  ledger.includes("Modern Supabase Secret-Key Server Fetch Compatibility Repair"),
  "Implementation ledger must record the modern secret-key compatibility repair",
);
assert.ok(
  preactivation.includes("scripts/test-supabase-modern-secret-server-fetch-guard.mjs"),
  "Preactivation suite must register the modern secret-key guard",
);

const executableHelperSource = helperSource.replace('import "server-only";', "");
const transpiled = ts.transpileModule(executableHelperSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: helperPath,
}).outputText;
const helperModule = await import(
  `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`
);

assert.equal(
  typeof helperModule.installSupabaseModernSecretFetchCompatibility,
  "function",
  "Modern secret fetch helper must export its bounded installer",
);

const originalFetch = globalThis.fetch;
const capturedRequests = [];
const supabaseUrl = "https://project-ref.supabase.co";
const modernSecret = `sb_secret_${"x".repeat(48)}`;
const legacyServiceRole = `eyJ${"x".repeat(48)}.${"y".repeat(48)}.${"z".repeat(48)}`;
const userAccessToken = `eyJ${"a".repeat(36)}.${"b".repeat(36)}.${"c".repeat(36)}`;

try {
  globalThis.fetch = async (input, init = {}) => {
    const url =
      typeof input === "string" || input instanceof URL ? String(input) : String(input.url);
    const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
    capturedRequests.push({ url, headers });
    return new Response(null, {
      status: 200,
      headers: {
        "content-range": "0-0/0",
        "content-type": "application/json",
      },
    });
  };

  const unconfiguredFetch = globalThis.fetch;
  helperModule.installSupabaseModernSecretFetchCompatibility(undefined);
  assert.equal(
    globalThis.fetch,
    unconfiguredFetch,
    "Missing Supabase URL must leave the runtime fetch unchanged",
  );

  helperModule.installSupabaseModernSecretFetchCompatibility(supabaseUrl);
  const installedFetch = globalThis.fetch;
  helperModule.installSupabaseModernSecretFetchCompatibility(supabaseUrl);
  assert.equal(globalThis.fetch, installedFetch, "Compatibility installer must be idempotent");

  const modernClient = createClient(supabaseUrl, modernSecret, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  await modernClient
    .from("company_profile_settings")
    .select("id", { head: true, count: "exact" });

  assert.equal(capturedRequests.length, 1, "Modern secret probe must issue one request");
  assert.equal(
    capturedRequests[0].headers.get("apikey"),
    modernSecret,
    "Modern secret must remain in the apikey header",
  );
  assert.equal(
    capturedRequests[0].headers.has("authorization"),
    false,
    "Modern secret must not be duplicated into Authorization",
  );

  const legacyClient = createClient(supabaseUrl, legacyServiceRole, {
    auth: { persistSession: false },
  });
  await legacyClient.from("company_profile_settings").select("id", { head: true });

  assert.equal(capturedRequests.length, 2, "Legacy credential probe must issue one request");
  assert.equal(
    capturedRequests[1].headers.get("authorization"),
    `Bearer ${legacyServiceRole}`,
    "Legacy service-role Authorization behavior must remain unchanged",
  );

  const userScopedClient = createClient(supabaseUrl, modernSecret, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${userAccessToken}` } },
  });
  await userScopedClient.from("company_profile_settings").select("id", { head: true });

  assert.equal(capturedRequests.length, 3, "User-token probe must issue one request");
  assert.equal(
    capturedRequests[2].headers.get("authorization"),
    `Bearer ${userAccessToken}`,
    "A real user Authorization token must remain unchanged",
  );

  await globalThis.fetch("https://other.example.test/rest/v1/example", {
    headers: {
      apikey: modernSecret,
      Authorization: `Bearer ${modernSecret}`,
    },
  });

  assert.equal(capturedRequests.length, 4, "Off-origin probe must issue one request");
  assert.equal(
    capturedRequests[3].headers.get("authorization"),
    `Bearer ${modernSecret}`,
    "The compatibility repair must not rewrite off-origin requests",
  );
} finally {
  globalThis.fetch = originalFetch;
}

console.log("Modern Supabase secret-key server fetch guard passed");
