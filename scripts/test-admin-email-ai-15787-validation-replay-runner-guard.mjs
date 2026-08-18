import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const runnerPath = path.join(
  root,
  "scripts/run-admin-email-ai-15787-validation-replay.mjs",
);
const runtimePath = path.join(root, "lib/admin-email-ai-intake.ts");
const ledgerPath = path.join(root, "docs/current-implementation-ledger.md");
const runnerSource = await readFile(runnerPath, "utf8");
const runtimeSource = await readFile(runtimePath, "utf8");
const ledgerSource = await readFile(ledgerPath, "utf8");

assert.equal(
  /import\s+[^;]*\sfrom\s+["'](?:typescript|openai)["']/.test(runnerSource),
  false,
  "the replay runner must not resolve workspace packages before evidence starts",
);
assert.equal(
  /fileURLToPath\s*\(\s*import\.meta\.url\s*\)/.test(runnerSource),
  true,
  "the replay runner must resolve its repository root from its own file",
);
assert.equal(
  /process\.cwd\s*\(/.test(runnerSource),
  false,
  "the replay runner must not depend on the caller working directory",
);

assert.equal(
  /from\s+["']@supabase\/supabase-js["']/.test(runtimeSource),
  true,
);
assert.equal(/from\s+["']imapflow["']/.test(runtimeSource), true);
assert.equal(/from\s+["']mailparser["']/.test(runtimeSource), true);
for (const forbiddenModule of [
  "@supabase/supabase-js",
  "@supabase/ssr",
  "pg",
  "postgres",
  "@vercel/postgres",
  "@neondatabase/serverless",
  "mysql2",
  "mysql2/promise",
  "sqlite3",
  "better-sqlite3",
  "imapflow",
  "imap",
  "mailparser",
]) {
  assert.equal(
    runnerSource.includes(`\"${forbiddenModule}\"`),
    true,
    `replay runner must trap transitive module ${forbiddenModule}`,
  );
}
for (const requiredTrapPhrase of [
  "forbidden_database_module",
  "forbidden_imap_module",
  "forbidden_mailparser_module",
  "runtime_io_attempts",
  "self_test_runtime_sandbox_complete",
]) {
  assert.equal(
    runnerSource.includes(requiredTrapPhrase),
    true,
    `replay runner must include ${requiredTrapPhrase}`,
  );
}

assert.equal(
  /\.from\s*\(["'][A-Za-z0-9_]+["']\)|\.insert\s*\(\s*\{|\.update\s*\(\s*\{|\.delete\s*\(\s*\)/.test(
    runnerSource,
  ),
  false,
  "the validation-only replay runner must not contain a direct database writer",
);
assert.equal(
  /\b(?:raw_provider_output|provider_result|canonical_booking_text)\s*:/.test(
    runnerSource,
  ),
  false,
  "private provider output and canonical booking text must not be persisted",
);

for (const required of [
  'const expectedApproval = "email-ai-15787-validation-replay-one-call-approved";',
  "maxRetries: 0",
  "provider_call_limit_exceeded",
  'await writeEvidence({ ...evidence, status: "started" });',
  'const ts = requireFromRoot("typescript");',
  'const realOpenAiModule = requireFromRoot("openai");',
  'status: "accepted"',
  "provider_calls: providerCalls",
  "acceptance_ok: false",
  "provider_output_sha256",
  "provider_result_sha256",
  "canonical_booking_text_sha256",
  "runtime_source_sha256",
  "verifiedRuntimeSources",
  "expected_build_commit",
  "local_git_head",
  "retention_boundary",
  "await writeEvidence(evidence);",
]) {
  assert.equal(
    runnerSource.includes(required),
    true,
    `replay runner must include ${required}`,
  );
}

assert.match(
  runnerSource,
  /const\s+approvalEnvName\s*=\s*[\r\n\s]*"PRESTIGE_ADMIN_EMAIL_AI_15787_VALIDATION_REPLAY_APPROVED";/,
  "replay runner must require the exact approval environment",
);
assert.ok(
  runnerSource.indexOf('await writeEvidence({ ...evidence, status: "started" });') <
    runnerSource.indexOf('const ts = requireFromRoot("typescript");'),
  "started evidence must be durable before workspace dependency resolution",
);

for (const requiredLedgerPhrase of [
  "### Email AI 15787 Validation Replay Evidence Runner Repair (2026-08-09)",
  "failed before any provider call",
  "`ERR_MODULE_NOT_FOUND`",
  "mode-`0600`",
  "transitive Supabase/database, IMAP, and mailparser modules fail closed",
  "exact locally resolved expected build commit",
  "source SHA-256",
  "owner-only local review evidence",
  "deleted after the bounded review handoff",
  "exactly one provider call with SDK retries disabled",
  "is not executed by this repair",
]) {
  assert.equal(
    ledgerSource.includes(requiredLedgerPhrase),
    true,
    `ledger must include ${requiredLedgerPhrase}`,
  );
}

const headRun = spawnSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
});
assert.equal(headRun.status, 0, headRun.stderr);
const localGitHead = headRun.stdout.trim();
assert.match(localGitHead, /^[0-9a-f]{40}$/);

let unresolvableBuild = "";
for (const candidate of ["00000000", "ffffffff", "11111111", "22222222"]) {
  const candidateRun = spawnSync(
    "git",
    ["rev-parse", "--verify", `${candidate}^{commit}`],
    { cwd: root, encoding: "utf8" },
  );
  if (candidateRun.status !== 0) {
    unresolvableBuild = candidate;
    break;
  }
}
assert.notEqual(unresolvableBuild, "", "guard needs one unresolvable commit prefix");

const tempDir = await mkdtemp(
  path.join(os.tmpdir(), "email-ai-replay-runner-guard-"),
);
const privateEvidencePattern =
  /Kim Hyun Soo|Pui Yu Chan|Newton Road|Newton Rd|Suffolk Walk|6598156017|6596389322/i;

function runRunner(name, extraEnv = {}) {
  const evidencePath = path.join(tempDir, `${name}.json`);
  const env = {
    ...process.env,
    PRESTIGE_ADMIN_EMAIL_AI_15787_VALIDATION_REPLAY_APPROVED: "",
    PRESTIGE_ADMIN_EMAIL_AI_15787_VALIDATION_REPLAY_EVIDENCE_PATH: evidencePath,
    PRESTIGE_ADMIN_EMAIL_AI_15787_VALIDATION_REPLAY_EXPECTED_BUILD:
      localGitHead.slice(0, 8),
    PRESTIGE_ADMIN_EMAIL_AI_15787_VALIDATION_REPLAY_SELF_TEST: "",
    ...extraEnv,
  };

  const result = spawnSync(process.execPath, [runnerPath], {
    cwd: tempDir,
    encoding: "utf8",
    env,
  });

  return { evidencePath, result };
}

async function readEvidence(run) {
  assert.equal(run.result.status, 2);
  assert.equal(run.result.stderr, "");
  assert.equal(
    privateEvidencePattern.test(run.result.stdout),
    false,
    "runner summary must not print private replay facts",
  );
  const serialized = await readFile(run.evidencePath, "utf8");
  assert.equal(
    privateEvidencePattern.test(serialized),
    false,
    "runner evidence must not persist private replay facts",
  );
  assert.equal((await stat(run.evidencePath)).mode & 0o777, 0o600);
  return JSON.parse(serialized);
}

try {
  const blockedEvidence = await readEvidence(runRunner("blocked"));
  assert.equal(blockedEvidence.status, "blocked");
  assert.equal(blockedEvidence.provider_calls, 0);
  assert.equal(blockedEvidence.acceptance_ok, false);
  assert.equal(
    blockedEvidence.acceptance_error?.code,
    "missing_exact_replay_approval",
  );

  const earlyFailureEvidence = await readEvidence(
    runRunner("early-dependency-failure", {
      NODE_ENV: "test",
      PRESTIGE_ADMIN_EMAIL_AI_15787_VALIDATION_REPLAY_SELF_TEST:
        "early-dependency-failure",
    }),
  );
  assert.equal(earlyFailureEvidence.status, "failed");
  assert.equal(earlyFailureEvidence.provider_calls, 0);
  assert.equal(
    earlyFailureEvidence.acceptance_error?.code,
    "self_test_early_dependency_failure",
  );

  for (const [kind, moduleName] of [
    ["database", "@supabase/supabase-js"],
    ["imap", "imapflow"],
    ["mailparser", "mailparser"],
  ]) {
    const trappedEvidence = await readEvidence(
      runRunner(`forbidden-${kind}`, {
        NODE_ENV: "test",
        PRESTIGE_ADMIN_EMAIL_AI_15787_VALIDATION_REPLAY_SELF_TEST:
          `forbidden-${kind}`,
      }),
    );
    assert.equal(trappedEvidence.status, "failed");
    assert.equal(trappedEvidence.provider_calls, 0);
    assert.equal(
      trappedEvidence.acceptance_error?.code,
      `forbidden_${kind}_module`,
    );
    assert.equal(trappedEvidence.acceptance_error?.module, moduleName);
    assert.equal(trappedEvidence.runtime_io_attempts?.[kind], 1);
  }

  const sandboxEvidence = await readEvidence(
    runRunner("runtime-sandbox", {
      NODE_ENV: "test",
      PRESTIGE_ADMIN_EMAIL_AI_15787_VALIDATION_REPLAY_APPROVED:
        "email-ai-15787-validation-replay-one-call-approved",
      PRESTIGE_ADMIN_EMAIL_AI_15787_VALIDATION_REPLAY_SELF_TEST:
        "runtime-sandbox-call",
    }),
  );
  assert.equal(
    sandboxEvidence.acceptance_error?.code,
    "self_test_runtime_sandbox_complete",
  );
  assert.equal(sandboxEvidence.provider_calls, 0);
  assert.deepEqual(sandboxEvidence.runtime_io_attempts, {
    database: 0,
    imap: 0,
    mailparser: 0,
  });

  const bindingEvidence = await readEvidence(
    runRunner("source-binding", {
      NODE_ENV: "test",
      PRESTIGE_ADMIN_EMAIL_AI_15787_VALIDATION_REPLAY_APPROVED:
        "email-ai-15787-validation-replay-one-call-approved",
      PRESTIGE_ADMIN_EMAIL_AI_15787_VALIDATION_REPLAY_SELF_TEST:
        "source-binding-complete",
    }),
  );
  assert.equal(
    bindingEvidence.acceptance_error?.code,
    "self_test_source_binding_complete",
  );
  assert.equal(bindingEvidence.expected_build_commit, localGitHead);
  assert.equal(bindingEvidence.local_git_head, localGitHead);
  assert.equal(bindingEvidence.provider_calls, 0);
  assert.equal(Object.keys(bindingEvidence.runtime_source_sha256 || {}).length, 4);
  for (const digest of Object.values(bindingEvidence.runtime_source_sha256)) {
    assert.match(digest, /^[0-9a-f]{64}$/);
  }
  assert.match(bindingEvidence.runner_sha256, /^[0-9a-f]{64}$/);

  const invalidBuildEvidence = await readEvidence(
    runRunner("invalid-build", {
      PRESTIGE_ADMIN_EMAIL_AI_15787_VALIDATION_REPLAY_APPROVED:
        "email-ai-15787-validation-replay-one-call-approved",
      PRESTIGE_ADMIN_EMAIL_AI_15787_VALIDATION_REPLAY_EXPECTED_BUILD:
        unresolvableBuild,
    }),
  );
  assert.equal(
    invalidBuildEvidence.acceptance_error?.code,
    "expected_build_commit_not_found",
  );
  assert.equal(invalidBuildEvidence.provider_calls, 0);
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

await assert.rejects(stat(tempDir), { code: "ENOENT" });

console.log("Email AI 15787 validation replay evidence runner guard passed.");
