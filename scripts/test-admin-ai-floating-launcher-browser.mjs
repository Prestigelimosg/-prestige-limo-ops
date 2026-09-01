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
const chromeDebugPort = Number(process.env.CHROME_DEBUG_PORT || 9244);
const reporter = createBrowserTestReporter("admin-ai-floating-launcher-browser");

async function main() {
  const chromeProfileDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-ai-launcher-chrome-"));
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
      assistantRequests.push({ method: request.method, url: request.url });
      client.send("Fetch.fulfillRequest", {
        body: Buffer.from(JSON.stringify({
          answer: "No automatic request expected.",
          external_send: false,
          ok: true,
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          write_action: false,
        })).toString("base64"),
        requestId,
        responseCode: 200,
        responseHeaders: [{ name: "content-type", value: "application/json" }],
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

    const clickSelector = async (selector) => evaluate(`(() => {
      const target = document.querySelector(${JSON.stringify(selector)});
      if (!(target instanceof HTMLButtonElement) || target.disabled) return false;
      target.click();
      return true;
    })()`);

    await navigateWithLoadEvent(client, appUrl);
    await waitForSelector(evaluate, '[data-admin-ai-floating-launcher="true"]', "floating Ask AI launcher");

    reporter.step("preserving the existing Dispatcher Intake draft");
    assert.equal(await clickSelector('[data-app-tab="dispatch"]'), true);
    await waitForSelector(evaluate, 'textarea[placeholder="Paste WhatsApp, email, or screenshot OCR text here."]', "Parser input");
    assert.equal(await evaluate(`(() => {
      const input = document.querySelector('textarea[placeholder="Paste WhatsApp, email, or screenshot OCR text here."]');
      if (!(input instanceof HTMLTextAreaElement)) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(input, "Keep this existing Dispatcher Intake draft");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`), true);
    assert.equal(await clickSelector('[data-app-tab="dashboard"]'), true);

    reporter.step("checking the desktop launcher in light mode");
    const desktopLauncher = await evaluate(`(() => {
      const launcher = document.querySelector('[data-admin-ai-floating-launcher="true"]');
      if (!(launcher instanceof HTMLButtonElement)) return null;
      const rect = launcher.getBoundingClientRect();
      return {
        ariaLabel: launcher.getAttribute("aria-label"),
        bodyBackground: getComputedStyle(document.body).backgroundColor,
        bottomGap: Math.round(window.innerHeight - rect.bottom),
        position: getComputedStyle(launcher).position,
        rightGap: Math.round(window.innerWidth - rect.right),
        visibleText: launcher.textContent?.trim(),
      };
    })()`);
    assert.deepEqual(desktopLauncher, {
      ariaLabel: "Open Ask AI",
      bodyBackground: "rgb(250, 250, 249)",
      bottomGap: 24,
      position: "fixed",
      rightGap: 24,
      visibleText: "Ask AI",
    });
    assert.equal(await clickSelector('[data-admin-ai-floating-launcher="true"]'), true);
    const desktopOpenState = await waitForCondition(
      async () => evaluate(`(() => {
        const input = document.querySelector('textarea[placeholder="Ask a question or paste text for a read-only AI review."]');
        const dispatch = document.querySelector('[data-app-tab="dispatch"]');
        const workflow = document.querySelector('[data-dispatch-workflow="true"]');
        if (!(input instanceof HTMLTextAreaElement) || dispatch?.getAttribute("aria-selected") !== "true") return false;
        return {
          boardCount: document.querySelectorAll('[data-admin-ai-assistant-board="true"]').length,
          conversationCount: document.querySelectorAll('[data-admin-ai-conversation="true"]').length,
          createJobDisabled: [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Create Job Card")?.disabled,
          focused: document.activeElement === input,
          launcherCount: document.querySelectorAll('[data-admin-ai-floating-launcher="true"]').length,
          messageStep: workflow?.getAttribute("data-mobile-dispatch-step"),
          modeSelected: document.querySelector('[data-ai-assist-mode="conversation"]')?.getAttribute("aria-pressed"),
          preservedDraft: input.value,
          safetyAccepted: document.querySelector('[data-ai-assist-safety-checkbox="true"]')?.checked,
          selectorCount: document.querySelectorAll('[data-ai-assist-mode-selector="true"]').length,
        };
      })()`),
      5000,
      "desktop existing Ask AI board",
    );
    assert.deepEqual(desktopOpenState, {
      boardCount: 1,
      conversationCount: 1,
      createJobDisabled: true,
      focused: true,
      launcherCount: 1,
      messageStep: "message",
      modeSelected: "true",
      preservedDraft: "Keep this existing Dispatcher Intake draft",
      safetyAccepted: false,
      selectorCount: 1,
    });
    assert.equal(assistantRequests.length, 0);

    reporter.step("checking the mobile safe-area launcher in light mode");
    await client.send("Emulation.setDeviceMetricsOverride", {
      deviceScaleFactor: 3,
      height: 844,
      mobile: true,
      width: 390,
    });
    assert.equal(await clickSelector('[data-app-tab="dashboard"]'), true);
    const mobileLauncher = await waitForCondition(
      async () => evaluate(`(() => {
        const launcher = document.querySelector('[data-admin-ai-floating-launcher="true"]');
        if (!(launcher instanceof HTMLButtonElement)) return false;
        const rect = launcher.getBoundingClientRect();
        return {
          bottomGap: Math.round(window.innerHeight - rect.bottom),
          height: Math.round(rect.height),
          position: getComputedStyle(launcher).position,
          rightGap: Math.round(window.innerWidth - rect.right),
          visibleText: launcher.textContent?.trim(),
          width: Math.round(rect.width),
        };
      })()`),
      5000,
      "mobile floating launcher",
    );
    assert.equal(mobileLauncher.bottomGap, 16);
    assert.equal(mobileLauncher.height, 48);
    assert.equal(mobileLauncher.position, "fixed");
    assert.equal(mobileLauncher.rightGap, 16);
    assert.equal(mobileLauncher.visibleText, "Ask AI");
    assert.ok(mobileLauncher.width >= 48 && mobileLauncher.width <= 96);
    assert.equal(await clickSelector('[data-admin-ai-floating-launcher="true"]'), true);
    const mobileOpenState = await waitForCondition(
      async () => evaluate(`(() => {
        const input = document.querySelector('textarea[placeholder="Ask a question or paste text for a read-only AI review."]');
        const dispatch = document.querySelector('[data-app-tab="dispatch"]');
        const workflow = document.querySelector('[data-dispatch-workflow="true"]');
        if (!(input instanceof HTMLTextAreaElement) || dispatch?.getAttribute("aria-selected") !== "true") return false;
        return {
          docClientWidth: document.documentElement.clientWidth,
          docScrollWidth: document.documentElement.scrollWidth,
          focused: document.activeElement === input,
          messageStep: workflow?.getAttribute("data-mobile-dispatch-step"),
          visible: input.getBoundingClientRect().height > 0,
        };
      })()`),
      5000,
      "mobile existing Ask AI board",
    );
    assert.equal(mobileOpenState.focused, true);
    assert.equal(mobileOpenState.messageStep, "message");
    assert.equal(mobileOpenState.visible, true);
    assert.ok(mobileOpenState.docScrollWidth <= mobileOpenState.docClientWidth + 2);
    assert.equal(assistantRequests.length, 0);

    const unexpectedMutations = mutationRequests.filter(({ url }) => !url.includes("/_next/"));
    const actionableConsoleErrors = consoleErrors.filter((message) =>
      !/Failed to load resource: the server responded with a status of 403 \(Forbidden\)/.test(message),
    );
    assert.deepEqual(unexpectedMutations, []);
    assert.deepEqual(actionableConsoleErrors, []);
    console.log(JSON.stringify(reporter.summary({
      actionableConsoleErrorCount: actionableConsoleErrors.length,
      assistantRequestCount: assistantRequests.length,
      desktop: desktopLauncher,
      mobile: mobileLauncher,
      ok: true,
      unexpectedMutationCount: unexpectedMutations.length,
    }), null, 2));
  } finally {
    if (client) {
      await client.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
      await client.close().catch(() => {});
    }
    await terminateChildProcess(chromeProcess);
    await rm(chromeProfileDir, { force: true, recursive: true });
  }
}

await main();
