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
const chromeBinary =
  process.env.CHROME_BINARY || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromeDebugPort = Number(process.env.CHROME_DEBUG_PORT || 9241);
const reporter = createBrowserTestReporter("admin-ai-account-brief-browser");

function responseHeaders() {
  return [
    { name: "access-control-allow-origin", value: "*" },
    { name: "content-type", value: "application/json" },
  ];
}

function accountResponse(query) {
  return {
    account_brief: {
      account: {
        booker_id: 11,
        booker_name: "Su Ling",
        company_id: 7,
        company_name: "Tiger Global",
        completed_count: 4,
        customer_id: 197,
        identity_anomalies: ["Some issued invoice rows have no verified Booker identity and were excluded."],
        issued_invoice_count: 3,
        issued_invoice_total_label: "SGD1,200.00",
        jobs_not_billed_count: 2,
        open_customer_path: "/customers/197?name=Tiger%20Global%20%C2%B7%20Su%20Ling",
        unpaid_invoice_balance_label: "SGD250.00",
        unpaid_invoice_count: 1,
        upcoming_count: 2,
      },
      accounts_with_jobs_not_billed: [],
      answer: "Tiger Global · Su Ling has 2 Jobs not billed yet and 1 unpaid invoice.",
      company_options: [],
      has_more: false,
      intent: "find_customer_account_brief",
      jobs_not_billed: [
        {
          booking_reference: "ADM-ACCOUNT-ONE",
          pickup_at: "2026-09-02T02:00:00.000Z",
          public_booking_reference: "10991",
          service_type: "TRF",
          status: "Completed",
        },
        {
          booking_reference: "ADM-ACCOUNT-TWO",
          pickup_at: "2026-09-03T03:00:00.000Z",
          public_booking_reference: "10992",
          service_type: "DSP",
          status: "Confirmed",
        },
      ],
      kind: "unpaid_bookings",
      manual_folder_guidance: null,
      page: 1,
      page_size: 10,
      query,
      read_at: "2026-09-01T04:00:00.000Z",
      status: "results",
      total_count: 2,
      unpaid_invoices: [
        {
          amount_label: "SGD250.00",
          balance_label: "SGD250.00",
          due_date: "15 Sep 2026",
          invoice_number: "INV-20260901-0002",
          status: "Unpaid",
        },
      ],
    },
    answer: "Tiger Global · Su Ling has 2 Jobs not billed yet and 1 unpaid invoice.",
    external_send: false,
    model: "Prestige live records",
    ok: true,
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    write_action: false,
  };
}

function allAccountsResponse(query, page) {
  const start = page === 1 ? 1 : 11;
  const count = page === 1 ? 10 : 2;
  const rows = Array.from({ length: count }, (_, index) => {
    const number = start + index;
    return {
      booker_id: number,
      booker_name: `Booker ${number}`,
      company_id: number,
      company_name: `Company ${String(number).padStart(2, "0")}`,
      customer_id: number + 100,
      jobs_not_billed_count: 1,
      open_customer_path: `/customers/${number + 100}?name=Company%20${number}`,
    };
  });

  return {
    account_brief: {
      account: null,
      accounts_with_jobs_not_billed: rows,
      answer: "Found 12 exact Company + Booker accounts with Jobs not billed yet.",
      company_options: [],
      has_more: page === 1,
      intent: "find_customer_account_brief",
      jobs_not_billed: [],
      kind: "all_unpaid_bookings",
      manual_folder_guidance: null,
      page,
      page_size: 10,
      query,
      read_at: "2026-09-01T04:00:00.000Z",
      status: "results",
      total_count: 12,
      unpaid_invoices: [],
    },
    answer: "Found 12 exact Company + Booker accounts with Jobs not billed yet.",
    external_send: false,
    model: "Prestige live records",
    ok: true,
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    write_action: false,
  };
}

async function main() {
  const chromeProfileDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-ai-account-brief-chrome-"));
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

  if (!/^(1|true|yes)$/i.test(process.env.PRESTIGE_BROWSER_VISIBLE || "")) {
    chromeArgs.unshift("--headless=new");
  }

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
      client.send("Fetch.enable", {
        patterns: [{ requestStage: "Request", urlPattern: "*/api/admin-ai-assistant*" }],
      }),
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
      try {
        body = JSON.parse(request.postData || "{}");
      } catch {
        body = {};
      }
      assistantRequests.push(body);
      const query = String(body.message || "");
      const responseBody = query === "Show all customers with unpaid bookings"
        ? allAccountsResponse(query, Number(body.account_brief_page) || 1)
        : accountResponse(query);
      client.send("Fetch.fulfillRequest", {
        body: Buffer.from(JSON.stringify(responseBody)).toString("base64"),
        requestId,
        responseCode: 200,
        responseHeaders: responseHeaders(),
      }).catch(() => {});
    });

    const evaluate = async (expression) => {
      const response = await client.send("Runtime.evaluate", {
        awaitPromise: true,
        expression,
        returnByValue: true,
      });
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

    reporter.step("checking exact account brief in light mode");
    assert.equal(await setQuestion("Show Su Ling's unpaid bookings"), true);
    assert.equal(await clickButton("Send to AI"), true);
    await waitForSelector(evaluate, '[data-admin-ai-account-card="true"]', "exact account card");
    const exactState = await evaluate(`(() => {
      const card = document.querySelector('[data-admin-ai-account-brief="true"]');
      return card instanceof HTMLElement ? {
        background: getComputedStyle(card).backgroundColor,
        bodyBackground: getComputedStyle(document.body).backgroundColor,
        createJobDisabled: [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Create Job Card")?.disabled,
        hasAccount: card.textContent?.includes("Tiger Global · Su Ling"),
        hasAnomaly: card.textContent?.includes("excluded"),
        hasJobs: card.textContent?.includes("Jobs not billed yet") && card.textContent?.includes("Booking 10991") && card.textContent?.includes("Booking 10992"),
        hasUnpaid: card.textContent?.includes("Unpaid invoices") && card.textContent?.includes("INV-20260901-0002") && card.textContent?.includes("SGD250.00"),
        openPath: card.querySelector('[data-admin-ai-account-open-customer="true"]')?.getAttribute("href"),
      } : null;
    })()`);
    assert.match(exactState.background, /^(?:rgb\(240, 253, 250\)|lab\(98\.)/);
    assert.equal(exactState.bodyBackground, "rgb(250, 250, 249)");
    assert.equal(exactState.createJobDisabled, true);
    assert.equal(exactState.hasAccount, true);
    assert.equal(exactState.hasAnomaly, true);
    assert.equal(exactState.hasJobs, true);
    assert.equal(exactState.hasUnpaid, true);
    assert.equal(
      exactState.openPath,
      "/customers/197?name=Tiger%20Global%20%C2%B7%20Su%20Ling",
    );
    assert.deepEqual(assistantRequests[0].history, []);
    assert.equal(assistantRequests[0].account_brief_page, 1);

    assert.equal(await clickButton("Clear Message"), true);
    await waitForCondition(
      async () => (await evaluate(`!document.querySelector('[data-admin-ai-account-brief="true"]')`)) === true,
      5000,
      "account brief clear",
    );

    reporter.step("checking all-account server pages");
    assert.equal(await setQuestion("Show all customers with unpaid bookings"), true);
    assert.equal(await clickButton("Send to AI"), true);
    await waitForSelector(evaluate, '[data-admin-ai-account-brief-load-more="true"]', "account brief load more");
    assert.equal(await clickButton("Load more"), true);
    const allState = await waitForCondition(
      async () => evaluate(`(() => {
        const section = document.querySelector('[data-admin-ai-accounts-with-unpaid-bookings="true"]');
        const loadMore = document.querySelector('[data-admin-ai-account-brief-load-more="true"]');
        if (!(section instanceof HTMLElement) || loadMore) return false;
        return {
          accountLinks: section.querySelectorAll('a[href^="/customers/"]').length,
          company01: section.textContent?.includes("Company 01 · Booker 1"),
          company12: section.textContent?.includes("Company 12 · Booker 12"),
        };
      })()`),
      5000,
      "second all-account page",
    );
    assert.deepEqual(allState, { accountLinks: 12, company01: true, company12: true });
    assert.equal(assistantRequests[1].account_brief_page, 1);
    assert.equal(assistantRequests[2].account_brief_page, 2);
    assert.deepEqual(assistantRequests[1].history, []);
    assert.deepEqual(assistantRequests[2].history, []);

    const unexpectedMutations = mutationRequests.filter(({ url }) => !url.includes("/api/admin-ai-assistant"));
    const expectedLocalBoundaryLogs = consoleErrors.filter((message) =>
      /Failed to load resource: the server responded with a status of 403 \(Forbidden\)/.test(message),
    );
    const actionableConsoleErrors = consoleErrors.filter((message) =>
      !/Failed to load resource: the server responded with a status of 403 \(Forbidden\)/.test(message),
    );
    assert.deepEqual(unexpectedMutations, []);
    assert.equal(assistantRequests.length, 3);
    assert.ok(expectedLocalBoundaryLogs.length > 0, "Expected the isolated local unauthenticated boundary reads to fail closed");
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
