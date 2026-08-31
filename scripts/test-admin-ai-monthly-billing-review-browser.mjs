import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  createBrowserTestReporter,
  createChromeClient,
  navigateWithLoadEvent,
  terminateChildProcess,
  waitForChromeDebugPort,
  waitForChromePageTarget,
  waitForCondition,
  waitForSelector,
} from "./browser-test-helpers.mjs";

const appUrl = process.env.APP_URL || "http://localhost:3000";
const chromeBinary = process.env.CHROME_BINARY || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromeDebugPort = Number(process.env.CHROME_DEBUG_PORT || 9243);
const reporter = createBrowserTestReporter("admin-ai-monthly-billing-review-browser");

function responseHeaders() {
  return [
    { name: "access-control-allow-origin", value: "*" },
    { name: "content-type", value: "application/json" },
  ];
}

function row(number) {
  const statuses = ["pending_admin_review", "locked", "blocked", "already_invoiced", "ready"];
  const status = number === 6 ? "blocked" : statuses[(number - 1) % statuses.length];
  const manual = number === 6;
  const companyName = number === 1 ? "Tiger Global" : `Company ${String(number).padStart(2, "0")}`;
  const bookerName = number === 1 ? "Su Ling" : `Booker ${number}`;
  return {
    already_invoiced_count: status === "already_invoiced" ? 1 : 0,
    billing_month: "2026-08",
    blocked_count: status === "blocked" ? 1 : 0,
    blocked_reasons: manual
      ? ["Verified Company and Booker identity is missing or incomplete."]
      : status === "blocked"
        ? ["Completed booking closeout is missing."]
        : [],
    booker_id: manual ? null : number,
    booker_name: manual ? null : bookerName,
    company_id: manual ? null : number,
    company_name: manual ? null : companyName,
    customer_id: manual ? null : number + 100,
    draft_plan_status: status === "pending_admin_review" ? "ready_for_billing_draft_review" : null,
    identity_status: manual ? "manual_review" : "verified",
    invoice_draft_status: status === "pending_admin_review" || status === "locked"
      ? "pending_admin_review"
      : null,
    locked: status === "locked",
    open_customer_path: manual
      ? null
      : `/customers/${number + 100}?name=${encodeURIComponent(`${companyName} · ${bookerName}`)}`,
    ready_count: status === "ready" || status === "pending_admin_review" || status === "locked" ? 1 : 0,
    reference_count: 1,
    references: [{
      booking_reference: `ADM-MONTH-${number}`,
      display_booking_reference: `11${String(number).padStart(3, "0")}`,
      reason: status === "blocked" ? "Completed booking closeout is missing." : "",
      status: status === "already_invoiced" ? "Already invoiced" : status === "blocked" ? "Blocked" : "Ready",
    }],
    row_key: manual ? "manual:group:6:2026-08" : `${number + 100}:${number}:${number}:2026-08`,
    status,
    total_count: 1,
  };
}

function monthlyResponse(query, page) {
  const start = page === 1 ? 1 : 11;
  const count = page === 1 ? 10 : 2;
  const rows = Array.from({ length: count }, (_, index) => row(start + index));
  const answer = "Found 12 monthly billing accounts for August 2026. 8 need Admin review; 2 are locked in the established issue workflow.";
  return {
    answer,
    external_send: false,
    model: "Prestige live records",
    monthly_billing_review: {
      answer,
      billing_month: "2026-08",
      has_more: page === 1,
      intent: "find_monthly_billing_review",
      page,
      page_size: 10,
      query,
      read_at: "2026-09-01T04:00:00.000Z",
      rows,
      status: "results",
      total_count: 12,
    },
    ok: true,
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    write_action: false,
  };
}

async function main() {
  const chromeProfileDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-ai-monthly-billing-review-chrome-"));
  const chromeArgs = [
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-gpu",
    "--force-color-profile=srgb",
    "--no-default-browser-check",
    "--no-first-run",
    "--no-service-autorun",
    `--remote-debugging-port=${chromeDebugPort}`,
    `--user-data-dir=${chromeProfileDir}`,
    "--window-size=1440,1000",
    "about:blank",
  ];
  if (!/^(1|true|yes)$/i.test(process.env.PRESTIGE_BROWSER_VISIBLE || "")) chromeArgs.unshift("--headless=new");

  reporter.step("launching Chrome");
  const chromeProcess = spawn(chromeBinary, chromeArgs, { stdio: "ignore" });
  let client = null;
  const assistantRequests = [];
  const mutationRequests = [];
  const consoleErrors = [];

  try {
    await waitForChromeDebugPort(chromeDebugPort);
    const target = await waitForChromePageTarget(chromeDebugPort);
    client = createChromeClient(target.webSocketDebuggerUrl);
    await client.ready;
    await Promise.all([
      client.send("Page.enable"),
      client.send("Runtime.enable"),
      client.send("Network.enable"),
      client.send("Log.enable"),
      client.send("Fetch.enable", { patterns: [{ requestStage: "Request", urlPattern: "*/api/admin-ai-assistant*" }] }),
    ]);

    client.on("Network.requestWillBeSent", ({ request }) => {
      if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method || "")) {
        mutationRequests.push({ method: request.method, url: request.url });
      }
    });
    client.on("Runtime.consoleAPICalled", ({ args, type }) => {
      if (type === "error") consoleErrors.push(args.map((arg) => arg.value || arg.description || "").join(" "));
    });
    client.on("Log.entryAdded", ({ entry }) => {
      if (entry.level === "error") consoleErrors.push(entry.text || "Browser log error");
    });
    client.on("Fetch.requestPaused", ({ request, requestId }) => {
      let body = {};
      try { body = JSON.parse(request.postData || "{}"); } catch { body = {}; }
      assistantRequests.push(body);
      const query = String(body.message || "");
      const page = Number(body.monthly_billing_review_page) || 1;
      client.send("Fetch.fulfillRequest", {
        body: Buffer.from(JSON.stringify(monthlyResponse(query, page))).toString("base64"),
        requestId,
        responseCode: 200,
        responseHeaders: responseHeaders(),
      }).catch(() => {});
    });

    const evaluate = async (expression) => {
      const response = await client.send("Runtime.evaluate", { awaitPromise: true, expression, returnByValue: true });
      if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || "Browser evaluation failed");
      return response.result?.value;
    };
    const setQuestion = async (question) => evaluate(`(() => {
      const input = document.querySelector('textarea[placeholder="Ask a question or paste text for a read-only AI review."]');
      if (!(input instanceof HTMLTextAreaElement)) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(input, ${JSON.stringify(question)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`);
    const clickButton = async (label) => evaluate(`(() => {
      const button = [...document.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === ${JSON.stringify(label)});
      if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
      button.click();
      return true;
    })()`);

    await navigateWithLoadEvent(client, appUrl);
    await waitForSelector(evaluate, '[data-app-tab="dispatch"]', "Dispatch tab");
    await evaluate(`document.querySelector('[data-app-tab="dispatch"]')?.click()`);
    await waitForSelector(evaluate, '[data-ai-assist-mode="conversation"]', "Ask AI mode");
    await evaluate(`document.querySelector('[data-ai-assist-mode="conversation"]')?.click()`);
    await waitForSelector(evaluate, 'textarea[placeholder="Ask a question or paste text for a read-only AI review."]', "Ask AI input");
    await evaluate(`document.querySelector('[data-ai-assist-safety-checkbox="true"]')?.click()`);

    reporter.step("checking monthly billing review in light mode");
    assert.equal(await setQuestion("Show monthly billing review"), true);
    assert.equal(await clickButton("Send to AI"), true);
    await waitForSelector(evaluate, '[data-admin-ai-monthly-billing-review="true"]', "monthly billing review");
    const firstState = await evaluate(`(() => {
      const card = document.querySelector('[data-admin-ai-monthly-billing-review="true"]');
      return card instanceof HTMLElement ? {
        background: getComputedStyle(card).backgroundColor,
        bodyBackground: getComputedStyle(document.body).backgroundColor,
        createJobDisabled: [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Create Job Card")?.disabled,
        hasExactAccount: card.textContent?.includes("Tiger Global · Su Ling"),
        hasManual: card.textContent?.includes("Identity needs manual review") && card.textContent?.includes("No Company-wide or name-only fallback was used."),
        hasReferences: card.textContent?.includes("11001") && card.textContent?.includes("11006"),
        hasStatuses: ["Ready", "Blocked", "Already invoiced", "pending_admin_review", "Locked"].every((label) => card.textContent?.includes(label)),
        openCustomer: card.querySelectorAll('[data-admin-ai-monthly-billing-open-customer="true"]').length,
        openReview: Boolean(card.querySelector('[data-admin-ai-monthly-billing-open-review="true"]')),
      } : null;
    })()`);
    assert.match(firstState.background, /^(?:rgb\(255, 251, 235\)|lab\(98\.)/);
    assert.equal(firstState.bodyBackground, "rgb(250, 250, 249)");
    assert.equal(firstState.createJobDisabled, true);
    assert.equal(firstState.hasExactAccount, true);
    assert.equal(firstState.hasManual, true);
    assert.equal(firstState.hasReferences, true);
    assert.equal(firstState.hasStatuses, true);
    assert.equal(firstState.openCustomer, 9);
    assert.equal(firstState.openReview, true);
    assert.deepEqual(assistantRequests[0].history, []);
    assert.equal(assistantRequests[0].monthly_billing_review_page, 1);

    reporter.step("checking server-computed pagination");
    assert.equal(await clickButton("Load more"), true);
    const pagedState = await waitForCondition(
      async () => evaluate(`(() => {
        const card = document.querySelector('[data-admin-ai-monthly-billing-review="true"]');
        if (!(card instanceof HTMLElement) || document.querySelector('[data-admin-ai-monthly-billing-load-more="true"]')) return false;
        return {
          company12: card.textContent?.includes("Company 12 · Booker 12"),
          rowCount: card.querySelectorAll('[data-admin-ai-monthly-billing-row]').length,
        };
      })()`),
      5000,
      "monthly billing second page",
    );
    assert.deepEqual(pagedState, { company12: true, rowCount: 12 });
    assert.equal(assistantRequests[1].monthly_billing_review_page, 2);
    assert.deepEqual(assistantRequests[1].history, []);

    assert.equal(await clickButton("Clear Message"), true);
    await waitForCondition(
      async () => (await evaluate(`!document.querySelector('[data-admin-ai-monthly-billing-review="true"]')`)) === true,
      5000,
      "monthly billing review clear",
    );
    reporter.step("checking attention wording");
    assert.equal(await setQuestion("Which monthly billing drafts need attention?"), true);
    assert.equal(await clickButton("Send to AI"), true);
    await waitForSelector(evaluate, '[data-admin-ai-monthly-billing-review="true"]', "attention review");
    assert.equal(assistantRequests[2].message, "Which monthly billing drafts need attention?");
    assert.deepEqual(assistantRequests[2].history, []);

    const unexpectedMutations = mutationRequests.filter(({ url }) => !url.includes("/api/admin-ai-assistant"));
    const expectedLocalBoundaryLogs = consoleErrors.filter((message) => /Failed to load resource: the server responded with a status of 403 \(Forbidden\)/.test(message));
    const actionableConsoleErrors = consoleErrors.filter((message) => !/Failed to load resource: the server responded with a status of 403 \(Forbidden\)/.test(message));
    assert.deepEqual(unexpectedMutations, []);
    assert.equal(assistantRequests.length, 3);
    assert.ok(expectedLocalBoundaryLogs.length > 0, "Expected isolated unauthenticated background reads to fail closed");
    assert.deepEqual(actionableConsoleErrors, []);
    assert.equal(await clickButton("Clear Message"), true);
    console.log(JSON.stringify(reporter.summary({
      actionableConsoleErrorCount: actionableConsoleErrors.length,
      assistantRequestCount: assistantRequests.length,
      expectedLocalBoundaryLogCount: expectedLocalBoundaryLogs.length,
      ok: true,
      unexpectedMutationCount: unexpectedMutations.length,
    }), null, 2));
  } finally {
    if (client) await client.close().catch(() => {});
    await terminateChildProcess(chromeProcess);
    await rm(chromeProfileDir, { force: true, recursive: true });
  }
}

await main();
