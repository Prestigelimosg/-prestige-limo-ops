import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import Module, { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const runnerPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(runnerPath), "..");
const targetId = "194d2756-1ad7-4522-a199-aabfff455fb2";
const recoveryPath =
  "/var/tmp/prestige-email-ai-15787-recovery-2026-08-08T14-05-37-043Z.json";
const expectedRecoverySha =
  "102e0cca84493e01e2a22b9c906776ab1cc6b17af1b312537c70915ecae0016e";
const approvalEnvName =
  "PRESTIGE_ADMIN_EMAIL_AI_15787_VALIDATION_REPLAY_APPROVED";
const expectedApproval = "email-ai-15787-validation-replay-one-call-approved";
const expectedBuildEnvName =
  "PRESTIGE_ADMIN_EMAIL_AI_15787_VALIDATION_REPLAY_EXPECTED_BUILD";
const evidencePathEnvName =
  "PRESTIGE_ADMIN_EMAIL_AI_15787_VALIDATION_REPLAY_EVIDENCE_PATH";
const selfTestEnvName =
  "PRESTIGE_ADMIN_EMAIL_AI_15787_VALIDATION_REPLAY_SELF_TEST";
const expectedBuild = String(process.env[expectedBuildEnvName] || "").trim();
const defaultEvidenceName = `prestige-email-ai-15787-validation-replay-${
  /^[0-9a-f]{8,40}$/i.test(expectedBuild) ? expectedBuild.slice(0, 40) : "pending"
}.json`;
const evidencePath = safeEvidencePath(
  process.env[evidencePathEnvName] || path.join("/var/tmp", defaultEvidenceName),
);
const clientRequestId = `prestige-email-ai-15787-validation-${randomUUID()}`;
const retentionBoundary =
  "owner-only local review evidence; delete the exact file after the bounded review handoff";
const runtimeSourceRelativePaths = {
  aiSchema: "lib/ai-parser-schema.ts",
  contract: "lib/admin-email-ai-intake-contract.ts",
  runtime: "lib/admin-email-ai-intake.ts",
  schema: "lib/admin-email-ai-intake-schema.ts",
};
const runtimeSourcePaths = Object.fromEntries(
  Object.entries(runtimeSourceRelativePaths).map(([name, relativePath]) => [
    name,
    path.join(root, relativePath),
  ]),
);
const forbiddenModuleKinds = new Map([
  ["@supabase/supabase-js", "database"],
  ["@supabase/ssr", "database"],
  ["pg", "database"],
  ["postgres", "database"],
  ["@vercel/postgres", "database"],
  ["@neondatabase/serverless", "database"],
  ["mysql2", "database"],
  ["mysql2/promise", "database"],
  ["sqlite3", "database"],
  ["better-sqlite3", "database"],
  ["imapflow", "imap"],
  ["imap", "imap"],
  ["mailparser", "mailparser"],
]);
const forbiddenModuleCodes = {
  database: "forbidden_database_module",
  imap: "forbidden_imap_module",
  mailparser: "forbidden_mailparser_module",
};

let providerCalls = 0;
let providerRequestId = "";
let providerModel = "";
let providerUsage = null;
let providerError = null;
let providerOutputSha256 = "";
let providerResultSha256 = "";
let canonicalBookingTextSha256 = "";
let tempDir = "";
let originalLoad = null;
let capturingOpenAiClass = null;
let verifiedRuntimeSources = null;
const runtimeIoAttempts = {
  database: 0,
  imap: 0,
  mailparser: 0,
};
const validationChecks = {};
let evidence = {
  acceptance_error: null,
  acceptance_ok: false,
  canonical_booking_text_sha256: "",
  client_request_id: clientRequestId,
  evidence_version: 2,
  expected_build: expectedBuild,
  expected_build_commit: "",
  local_git_head: "",
  provider_calls: 0,
  provider_error: null,
  provider_model: "",
  provider_output_sha256: "",
  provider_request_id: "",
  provider_result_sha256: "",
  provider_usage: null,
  recovery_sha256: expectedRecoverySha,
  retention_boundary: retentionBoundary,
  runner_sha256: "",
  runtime_io_attempts: { ...runtimeIoAttempts },
  runtime_source_sha256: {},
  status: "starting",
  target_id: targetId,
  updated_at: new Date().toISOString(),
  validation_checks: null,
};

class ReplayFailure extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.blocked = options.blocked === true;
    this.code = code;
    this.module = String(options.module || "");
    this.name = "ReplayFailure";
  }
}

function within(rootPath, candidatePath) {
  const relative = path.relative(path.resolve(rootPath), candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function safeEvidencePath(value) {
  const candidate = path.resolve(String(value || ""));
  const allowedRoots = ["/var/tmp", "/private/var/tmp", os.tmpdir()];

  if (
    path.extname(candidate).toLowerCase() !== ".json" ||
    !allowedRoots.some((allowedRoot) => within(allowedRoot, candidate))
  ) {
    throw new Error("invalid_validation_replay_evidence_path");
  }

  return candidate;
}

function sanitizedError(error) {
  const candidate = error && typeof error === "object" ? error : {};
  const knownReplayFailure = error instanceof ReplayFailure;

  return {
    code: candidate.code ? String(candidate.code).slice(0, 120) : null,
    message: knownReplayFailure
      ? String(candidate.message || "Validation replay failed.").slice(0, 240)
      : "Unexpected validation replay failure.",
    module:
      knownReplayFailure && candidate.module
        ? String(candidate.module).slice(0, 120)
        : null,
    name: String(candidate.name || "Error").slice(0, 80),
    request_id: candidate.request_id
      ? String(candidate.request_id).slice(0, 160)
      : null,
    status: Number.isFinite(candidate.status) ? candidate.status : null,
    type: candidate.type ? String(candidate.type).slice(0, 120) : null,
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function requireReplay(condition, code, message, options) {
  if (!condition) throw new ReplayFailure(code, message, options);
}

function accept(condition, code) {
  requireReplay(
    condition,
    `acceptance_${code}`,
    `Validation replay failed the ${code.replaceAll("_", " ")} check.`,
  );
  validationChecks[code] = true;
}

async function writeEvidence(value) {
  const parent = path.dirname(evidencePath);
  const temporaryPath = `${evidencePath}.${process.pid}.tmp`;
  await mkdir(parent, { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, evidencePath);
  await chmod(evidencePath, 0o600);
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function compile(ts, source, filename) {
  return ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
}

async function loadCompiledRuntime(ts, requireFromRoot) {
  requireReplay(
    !tempDir,
    "compiled_runtime_already_loaded",
    "The validation replay runtime may be compiled only once.",
  );
  requireReplay(
    verifiedRuntimeSources &&
      Object.keys(verifiedRuntimeSources).length ===
        Object.keys(runtimeSourceRelativePaths).length,
    "verified_runtime_sources_unavailable",
    "The verified Email AI runtime sources are unavailable.",
  );
  tempDir = await mkdtemp(
    path.join(os.tmpdir(), "prestige-email-ai-15787-validation-"),
  );
  const targetPaths = {
    aiSchema: path.join(tempDir, "lib/ai-parser-schema.js"),
    contract: path.join(tempDir, "lib/admin-email-ai-intake-contract.js"),
    runtime: path.join(tempDir, "lib/admin-email-ai-intake.js"),
    schema: path.join(tempDir, "lib/admin-email-ai-intake-schema.js"),
  };
  await mkdir(path.join(tempDir, "lib"), { recursive: true });

  for (const [name, verifiedSource] of Object.entries(verifiedRuntimeSources)) {
    let source = verifiedSource;
    if (name === "runtime") {
      source += "\nexport { analyseAllowedEmail as testAnalyseAllowedEmail };\n";
    }
    await writeFile(
      targetPaths[name],
      compile(ts, source, runtimeSourcePaths[name]),
    );
  }

  return {
    runtime: requireFromRoot(targetPaths.runtime),
    schema: requireFromRoot(targetPaths.schema),
  };
}

function runGitText(args, code, message) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    throw new ReplayFailure(code, message);
  }
}

function runGitBytes(args, code, message) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      maxBuffer: 4 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw new ReplayFailure(code, message);
  }
}

async function bindRuntimeSourceToExpectedBuild() {
  const localGitHead = runGitText(
    ["rev-parse", "--verify", "HEAD^{commit}"],
    "local_git_head_unavailable",
    "The local Git HEAD commit could not be resolved.",
  );
  const expectedBuildCommit = runGitText(
    ["rev-parse", "--verify", `${expectedBuild}^{commit}`],
    "expected_build_commit_not_found",
    "The expected Production build is not an exact locally resolvable commit.",
  );

  try {
    execFileSync(
      "git",
      ["merge-base", "--is-ancestor", expectedBuildCommit, localGitHead],
      {
        cwd: root,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch {
    throw new ReplayFailure(
      "expected_build_not_local_ancestor",
      "The expected Production build is not an ancestor of the local runner checkout.",
    );
  }

  const runtimeSourceSha256 = {};
  const runtimeSources = {};
  for (const [name, relativePath] of Object.entries(runtimeSourceRelativePaths)) {
    const currentBytes = await readFile(runtimeSourcePaths[name]);
    const expectedBytes = runGitBytes(
      ["show", `${expectedBuildCommit}:${relativePath}`],
      "expected_build_source_unavailable",
      "A required runtime source file is unavailable in the expected build.",
    );
    const currentDigest = sha256(currentBytes);
    requireReplay(
      currentDigest === sha256(expectedBytes),
      "runtime_source_mismatch",
      "The local Email AI runtime source does not match the expected Production build.",
    );
    runtimeSourceSha256[relativePath] = currentDigest;
    runtimeSources[name] = currentBytes.toString("utf8");
  }

  return {
    expectedBuildCommit,
    localGitHead,
    runnerSha256: sha256(await readFile(runnerPath)),
    runtimeSources,
    runtimeSourceSha256,
  };
}

function forbiddenModuleKind(request) {
  for (const [moduleName, kind] of forbiddenModuleKinds) {
    if (request === moduleName || request.startsWith(`${moduleName}/`)) {
      return { kind, moduleName };
    }
  }
  return null;
}

function forbiddenModuleStub(kind, moduleName) {
  const reject = () => {
    runtimeIoAttempts[kind] += 1;
    throw new ReplayFailure(
      forbiddenModuleCodes[kind],
      `Validation replay blocked transitive ${kind} execution.`,
      { module: moduleName },
    );
  };
  const forbiddenCallable = new Proxy(function forbiddenIoCall() {}, {
    apply: reject,
    construct: reject,
  });

  return new Proxy(
    { __esModule: true, default: forbiddenCallable },
    {
      get(target, property) {
        if (property in target) return target[property];
        if (property === Symbol.toStringTag) return "Module";
        return forbiddenCallable;
      },
    },
  );
}

function exerciseForbiddenIoSelfTest(selfTest, requireFromRoot) {
  if (selfTest === "forbidden-database") {
    requireFromRoot("@supabase/supabase-js").createClient();
  }
  if (selfTest === "forbidden-imap") {
    const { ImapFlow } = requireFromRoot("imapflow");
    new ImapFlow();
  }
  if (selfTest === "forbidden-mailparser") {
    requireFromRoot("mailparser").simpleParser();
  }
}

function safeSummary() {
  return {
    acceptance_error: evidence.acceptance_error,
    acceptance_ok: evidence.acceptance_ok,
    client_request_id: evidence.client_request_id,
    evidence_path: evidencePath,
    expected_build_commit: evidence.expected_build_commit,
    provider_calls: evidence.provider_calls,
    provider_error: evidence.provider_error,
    provider_model: evidence.provider_model,
    provider_request_id: evidence.provider_request_id,
    provider_usage: evidence.provider_usage,
    status: evidence.status,
  };
}

try {
  await writeEvidence({ ...evidence, status: "started" });

  const selfTest =
    process.env.NODE_ENV === "test"
      ? String(process.env[selfTestEnvName] || "").trim()
      : "";
  const allowedSelfTests = new Set([
    "",
    "early-dependency-failure",
    "forbidden-database",
    "forbidden-imap",
    "forbidden-mailparser",
    "runtime-sandbox-call",
    "source-binding-complete",
  ]);
  requireReplay(
    allowedSelfTests.has(selfTest),
    "invalid_self_test_mode",
    "The validation replay self-test mode is invalid.",
  );

  const requireFromRoot = createRequire(path.join(root, "package.json"));
  originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "server-only") return {};
    const forbidden = forbiddenModuleKind(request);
    if (forbidden) {
      return forbiddenModuleStub(forbidden.kind, forbidden.moduleName);
    }
    if (request === "openai" && capturingOpenAiClass) {
      return { __esModule: true, default: capturingOpenAiClass };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  if (selfTest === "early-dependency-failure") {
    throw new ReplayFailure(
      "self_test_early_dependency_failure",
      "Synthetic early dependency failure.",
    );
  }
  exerciseForbiddenIoSelfTest(selfTest, requireFromRoot);

  if (process.env[approvalEnvName] !== expectedApproval) {
    throw new ReplayFailure(
      "missing_exact_replay_approval",
      `Missing exact approval environment: ${approvalEnvName}.`,
      { blocked: true },
    );
  }

  requireReplay(
    /^[0-9a-f]{8,40}$/i.test(expectedBuild),
    "invalid_expected_production_build",
    `Invalid ${expectedBuildEnvName}.`,
  );

  const sourceBinding = await bindRuntimeSourceToExpectedBuild();
  evidence = {
    ...evidence,
    expected_build_commit: sourceBinding.expectedBuildCommit,
    local_git_head: sourceBinding.localGitHead,
    runner_sha256: sourceBinding.runnerSha256,
    runtime_source_sha256: sourceBinding.runtimeSourceSha256,
    updated_at: new Date().toISOString(),
  };
  verifiedRuntimeSources = sourceBinding.runtimeSources;

  if (selfTest === "source-binding-complete") {
    throw new ReplayFailure(
      "self_test_source_binding_complete",
      "Synthetic source-binding completion stop.",
    );
  }

  if (selfTest === "runtime-sandbox-call") {
    const ts = requireFromRoot("typescript");
    capturingOpenAiClass = class SelfTestOpenAI {
      constructor() {
        this.responses = {
          create: async () => {
            throw new ReplayFailure(
              "self_test_provider_call_blocked",
              "Synthetic provider call blocked by the runtime sandbox self-test.",
            );
          },
        };
      }
    };
    const { runtime } = await loadCompiledRuntime(ts, requireFromRoot);
    const sandboxResult = await runtime.testAnalyseAllowedEmail({
      body: "Synthetic no-provider runtime sandbox input.",
      senderAddress: "info@prestigelimo.sg",
      subject: "Synthetic runtime sandbox",
    });
    requireReplay(
      sandboxResult?.ok === false,
      "self_test_runtime_sandbox_result_invalid",
      "The runtime sandbox self-test returned an unexpected result.",
    );
    requireReplay(
      providerCalls === 0,
      "self_test_runtime_sandbox_provider_call",
      "The runtime sandbox self-test attempted a provider call.",
    );
    requireReplay(
      Object.values(runtimeIoAttempts).every((count) => count === 0),
      "self_test_runtime_sandbox_io_attempt",
      "The runtime sandbox self-test attempted forbidden I/O.",
    );
    throw new ReplayFailure(
      "self_test_runtime_sandbox_complete",
      "Synthetic runtime sandbox completion stop.",
    );
  }

  process.loadEnvFile(path.join(root, ".env.local"));
  requireReplay(
    Boolean(process.env.OPENAI_API_KEY),
    "openai_api_key_missing",
    "The OpenAI API key is not configured.",
  );

  const recoveryBytes = await readFile(recoveryPath);
  const recoverySha = sha256(recoveryBytes);
  requireReplay(
    recoverySha === expectedRecoverySha,
    "recovery_sha256_mismatch",
    "The retained Email AI recovery evidence hash does not match.",
  );
  const recovery = JSON.parse(recoveryBytes.toString("utf8"));
  requireReplay(
    recovery.target_id === targetId,
    "recovery_target_mismatch",
    "The retained Email AI recovery evidence targets a different intake.",
  );
  requireReplay(
    recovery.row?.processing_status === "queued",
    "recovery_status_not_queued",
    "The retained Email AI recovery evidence is not queued.",
  );

  const ts = requireFromRoot("typescript");
  const realOpenAiModule = requireFromRoot("openai");
  const RealOpenAI = realOpenAiModule.default || realOpenAiModule;

  class CapturingOpenAI {
    constructor(options) {
      const client = new RealOpenAI({ ...options, maxRetries: 0 });
      this.responses = {
        create: async (body) => {
          if (providerCalls !== 0) {
            throw new ReplayFailure(
              "provider_call_limit_exceeded",
              "The validation replay allows exactly one provider call.",
            );
          }

          providerCalls += 1;

          try {
            const response = await client.responses.create(body, {
              headers: { "X-Client-Request-Id": clientRequestId },
            });
            providerRequestId = String(response._request_id || "");
            providerModel = String(response.model || "");
            providerUsage = response.usage || null;
            providerOutputSha256 = sha256(String(response.output_text || ""));
            return response;
          } catch (error) {
            providerError = sanitizedError(error);
            throw error;
          }
        },
      };
    }
  }
  capturingOpenAiClass = CapturingOpenAI;

  const { runtime, schema } = await loadCompiledRuntime(ts, requireFromRoot);
  const providerResult = await runtime.testAnalyseAllowedEmail({
    body: recovery.row.normalized_text,
    senderAddress: recovery.row.sender_address,
    subject: recovery.row.subject,
  });
  providerResultSha256 = sha256(JSON.stringify(providerResult));

  accept(providerCalls === 1, "one_provider_call");
  accept(providerResult.ok === true, "provider_result_ok");
  accept(
    providerResult.analysis.classification === "confirmed_booking",
    "confirmed_booking_classification",
  );
  accept(
    providerResult.analysis.bookingResult.multipleBookingsDetected === false,
    "single_booking_flag",
  );
  accept(
    providerResult.analysis.bookingResult.bookings.length === 1,
    "single_booking_count",
  );

  const booking = providerResult.analysis.bookingResult.bookings[0];
  accept(booking.bookingType === "DEP", "booking_type");
  accept(booking.pickupDate === "2026-08-19", "pickup_date");
  accept(booking.pickupTime === "10:00", "pickup_time");
  accept(
    /26\s*Newton\s*(?:Rd|Road)[\s\S]*307957/i.test(booking.pickup),
    "primary_pickup",
  );
  accept(booking.extraStopCount === "1", "extra_stop_count");
  accept(
    /6\s*Suffolk\s*Walk[\s\S]*307464/i.test(booking.extraStopLocation),
    "extra_stop_location",
  );
  accept(
    /6\s*Suffolk\s*Walk[\s\S]*307464/i.test(booking.extraStops),
    "legacy_extra_stops",
  );
  accept(booking.bookerName === "Kim Hyun Soo", "booker_name");
  accept(normalizePhone(booking.bookerContact) === "6598156017", "booker_contact");
  accept(booking.passengerName === "Pui Yu Chan", "passenger_name");
  accept(
    normalizePhone(booking.passengerContact) === "6596389322",
    "passenger_contact",
  );
  accept(booking.pax === "2", "passenger_count");
  accept(booking.bagCount === "3", "bag_count");
  accept(/Toyota\s+Alphard\s+2\.5/i.test(booking.vehicle), "vehicle");
  accept(booking.flightNumber === "SQ958", "flight_number");
  accept(booking.companyAccount === "", "company_account_empty");
  accept(booking.customerPriceOverride === "", "customer_price_empty");
  accept(/airport/i.test(booking.dropoff), "airport_dropoff");
  accept(!/terminal|\bT[1-4]\b/i.test(booking.dropoff), "no_invented_terminal");
  accept(
    !/Stripe|S\$\s*120|S\$\s*25|order total|tax(?:es)?/i.test(
      [
        booking.pickup,
        booking.dropoff,
        booking.extraStopLocation,
        booking.extraStops,
        booking.notes,
        booking.customerPriceOverride,
        booking.companyAccount,
      ].join("\n"),
    ),
    "finance_excluded",
  );

  const remainingReviewReasons = [
    ...providerResult.analysis.reviewReasons,
    ...booking.needsReviewReasons,
  ];
  accept(
    remainingReviewReasons.some((reason) => /airport|terminal/i.test(reason)),
    "terminal_review_preserved",
  );
  accept(
    !remainingReviewReasons.some(
      (reason) =>
        /booker/i.test(reason) &&
        /not\s+clearly|unclear|ambiguous|confirm|confirmation|conflict|missing|uncertain|unknown|unverified|verify|verification/i.test(
          reason,
        ),
    ),
    "resolved_booker_review_removed",
  );
  accept(
    !remainingReviewReasons.some(
      (reason) =>
        /extra[\s-]+stop|route[\s-]+stop|second[\s-]+pickup|waypoint/i.test(
          reason,
        ) &&
        /ambiguous|confirm|confirmation|confirmed|missing|not\s+clearly|supported|unclear|uncertain|verify|verification|whether/i.test(
          reason,
        ),
    ),
    "resolved_extra_stop_review_removed",
  );
  accept(
    Object.values(runtimeIoAttempts).every((count) => count === 0),
    "no_forbidden_runtime_io",
  );

  canonicalBookingTextSha256 = sha256(
    schema.adminEmailAiCanonicalBookingText(providerResult.analysis),
  );
  evidence = {
    ...evidence,
    acceptance_error: null,
    acceptance_ok: true,
    canonical_booking_text_sha256: canonicalBookingTextSha256,
    provider_calls: providerCalls,
    provider_error: providerError,
    provider_model: providerModel,
    provider_output_sha256: providerOutputSha256,
    provider_request_id: providerRequestId,
    provider_result_sha256: providerResultSha256,
    provider_usage: providerUsage,
    recovery_sha256: recoverySha,
    runtime_io_attempts: { ...runtimeIoAttempts },
    status: "accepted",
    updated_at: new Date().toISOString(),
    validation_checks: { ...validationChecks },
  };
} catch (error) {
  const blocked = error instanceof ReplayFailure && error.blocked;
  evidence = {
    ...evidence,
    acceptance_error: sanitizedError(error),
    acceptance_ok: false,
    canonical_booking_text_sha256: canonicalBookingTextSha256,
    provider_calls: providerCalls,
    provider_error: providerError,
    provider_model: providerModel,
    provider_output_sha256: providerOutputSha256,
    provider_request_id: providerRequestId,
    provider_result_sha256: providerResultSha256,
    provider_usage: providerUsage,
    runtime_io_attempts: { ...runtimeIoAttempts },
    status: blocked ? "blocked" : "failed",
    updated_at: new Date().toISOString(),
    validation_checks:
      Object.keys(validationChecks).length > 0 ? { ...validationChecks } : null,
  };
} finally {
  if (originalLoad) Module._load = originalLoad;
  if (tempDir) {
    try {
      await rm(tempDir, { force: true, recursive: true });
    } catch (error) {
      evidence.cleanup_error = sanitizedError(error);
    }
  }

  await writeEvidence(evidence);
  console.log(JSON.stringify(safeSummary()));
  if (!evidence.acceptance_ok) process.exitCode = 2;
}
