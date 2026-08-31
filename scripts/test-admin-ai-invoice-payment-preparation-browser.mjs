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
const chromeDebugPort = Number(process.env.CHROME_DEBUG_PORT || 9245);
const reporter = createBrowserTestReporter("admin-ai-invoice-payment-preparation-browser");

function responseHeaders() {
  return [
    { name: "access-control-allow-origin", value: "*" },
    { name: "content-type", value: "application/json" },
  ];
}

function preparationResponse(query) {
  const alreadyPaid = query.startsWith("Help me");
  const status = alreadyPaid ? "already_paid" : "ready";
  const answer = alreadyPaid
    ? "DEEP-0001 is already Paid. No Mark paid preparation or payment action is available."
    : "DEEP-0001 is ready for manual payment review in the existing Customer Account Section 2. Ask AI has not marked it paid.";
  return {
    answer,
    external_send: false,
    invoice_payment_preparation: {
      answer,
      intent: "prepare_invoice_payment_review",
      invoice: {
        amount_label: "SGD155.00",
        balance_label: alreadyPaid ? "SGD0.00" : "SGD155.00",
        booker_id: 12,
        booker_name: "Deep",
        booking_references: ["MULTI-10827-2", "10827", "10826"],
        company_id: 7,
        company_name: "Tiger Global",
        customer_id: 197,
        due_date: "10 Sep 2026",
        invoice_number: "DEEP-0001",
        issue_date: "01 Sep 2026",
        status: alreadyPaid ? "Paid" : "Unpaid",
      },
      open_customer_path: "/customers/197?name=Tiger%20Global%20%C2%B7%20Deep",
      query,
      read_at: "2026-09-01T04:00:00.000Z",
      ready_for_manual_review: !alreadyPaid,
      requirements: alreadyPaid ? null : {
        payment_method_required: true,
        payment_methods: ["Bank transfer", "Card", "Cash"],
        thank_you_choice_required: true,
      },
      status,
    },
    model: "Prestige live records",
    ok: true,
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    write_action: false,
  };
}

async function main() {
  const chromeProfileDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-ai-invoice-payment-preparation-chrome-"));
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
      client.send("Fetch.fulfillRequest", {
        body: Buffer.from(JSON.stringify(preparationResponse(query))).toString("base64"),
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

    reporter.step("checking exact invoice preparation in light mode");
    assert.equal(await setQuestion("Prepare invoice DEEP-0001 to mark paid"), true);
    assert.equal(await clickButton("Send to AI"), true);
    await waitForSelector(evaluate, '[data-admin-ai-invoice-payment-preparation="true"]', "invoice payment preparation");
    const readyState = await evaluate(`(() => {
      const card = document.querySelector('[data-admin-ai-invoice-payment-preparation="true"]');
      const link = card?.querySelector('[data-admin-ai-invoice-payment-preparation-open-customer="true"]');
      return card instanceof HTMLElement ? {
        background: getComputedStyle(card).backgroundColor,
        bodyBackground: getComputedStyle(document.body).backgroundColor,
        createJobDisabled: [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Create Job Card")?.disabled,
        hasAccount: card.textContent?.includes("Tiger Global · Deep"),
        hasAmounts: card.textContent?.includes("SGD155.00"),
        hasDates: card.textContent?.includes("01 Sep 2026") && card.textContent?.includes("10 Sep 2026"),
        hasNoWriteCopy: card.textContent?.includes("Ask AI cannot confirm, save, or send it."),
        hasReferences: card.textContent?.includes("MULTI-10827-2") && card.textContent?.includes("10826"),
        hasRequirements: card.textContent?.includes("Bank transfer / Card / Cash") && card.textContent?.includes("payment thank-you email"),
        href: link instanceof HTMLAnchorElement ? link.getAttribute("href") : null,
        status: card.getAttribute("data-admin-ai-invoice-payment-preparation-status"),
      } : null;
    })()`);
    assert.match(readyState.background, /^(?:rgb\(236, 253, 245\)|lab\(97\.)/);
    assert.equal(readyState.bodyBackground, "rgb(250, 250, 249)");
    assert.equal(readyState.createJobDisabled, true);
    assert.equal(readyState.hasAccount, true);
    assert.equal(readyState.hasAmounts, true);
    assert.equal(readyState.hasDates, true);
    assert.equal(readyState.hasNoWriteCopy, true);
    assert.equal(readyState.hasReferences, true);
    assert.equal(readyState.hasRequirements, true);
    assert.match(readyState.href, /^\/customers\/197\?name=/);
    assert.equal(readyState.status, "ready");
    assert.deepEqual(assistantRequests[0].history, []);

    assert.equal(await clickButton("Clear Message"), true);
    await waitForCondition(
      async () => (await evaluate(`!document.querySelector('[data-admin-ai-invoice-payment-preparation="true"]')`)) === true,
      5000,
      "invoice preparation clear",
    );

    reporter.step("checking already-paid preparation is non-executable");
    assert.equal(await setQuestion("Help me mark invoice DEEP-0001 paid"), true);
    assert.equal(await clickButton("Send to AI"), true);
    await waitForSelector(evaluate, '[data-admin-ai-invoice-payment-preparation-status="already_paid"]', "already paid review");
    const paidState = await evaluate(`(() => {
      const card = document.querySelector('[data-admin-ai-invoice-payment-preparation="true"]');
      return {
        hasBalanceZero: card?.textContent?.includes("SGD0.00"),
        hasRequirements: Boolean(card?.querySelector('[data-admin-ai-invoice-payment-preparation-requirements="true"]')),
        text: card?.textContent || "",
      };
    })()`);
    assert.equal(paidState.hasBalanceZero, true);
    assert.equal(paidState.hasRequirements, false);
    assert.match(paidState.text, /already Paid/);
    assert.deepEqual(assistantRequests[1].history, []);

    const unexpectedMutations = mutationRequests.filter(({ url }) => !url.includes("/api/admin-ai-assistant"));
    const expectedLocalBoundaryLogs = consoleErrors.filter((message) => /Failed to load resource: the server responded with a status of 403 \(Forbidden\)/.test(message));
    const actionableConsoleErrors = consoleErrors.filter((message) => !/Failed to load resource: the server responded with a status of 403 \(Forbidden\)/.test(message));
    assert.deepEqual(unexpectedMutations, []);
    assert.equal(assistantRequests.length, 2);
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
