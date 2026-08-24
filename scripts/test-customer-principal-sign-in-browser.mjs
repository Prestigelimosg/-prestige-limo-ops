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
} from "./browser-test-helpers.mjs";

const appUrl = process.env.APP_URL || "http://localhost:3000";
const chromeBinary =
  process.env.CHROME_BINARY || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromeDebugPort = Number(process.env.CHROME_DEBUG_PORT || 9249);
const reporter = createBrowserTestReporter("customer-principal-sign-in-browser");
const testEmail = "boss.qa@example.com";

async function main() {
  const chromeProfileDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-sign-in-chrome-"));
  const chromeArgs = [
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-gpu",
    "--no-default-browser-check",
    "--no-first-run",
    "--no-service-autorun",
    `--remote-debugging-port=${chromeDebugPort}`,
    `--user-data-dir=${chromeProfileDir}`,
    "--window-size=430,932",
    "about:blank",
  ];

  if (!/^(1|true|yes)$/i.test(process.env.PRESTIGE_BROWSER_VISIBLE || "")) {
    chromeArgs.unshift("--headless=new");
  }

  reporter.step("launching Chrome");
  const chromeProcess = spawn(chromeBinary, chromeArgs, { stdio: "ignore" });
  let client = null;
  const principalRequests = [];

  try {
    await waitForChromeDebugPort(chromeDebugPort);
    const target = await waitForChromePageTarget(chromeDebugPort);
    client = createChromeClient(target.webSocketDebuggerUrl);
    await client.ready;
    await Promise.all([
      client.send("Page.enable"),
      client.send("Runtime.enable"),
      client.send("Network.enable"),
    ]);

    const evaluate = async (expression) => {
      const result = await client.send("Runtime.evaluate", {
        awaitPromise: true,
        expression,
        returnByValue: true,
      });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.text || "Browser evaluation failed");
      }
      return result.result?.value;
    };

    client.on("Network.requestWillBeSent", ({ request }) => {
      const requestUrl = new URL(request.url);
      if (requestUrl.pathname === "/api/customer-principal-access") {
        principalRequests.push(request.method || "GET");
      }
    });

    const signInUrl = new URL("/customer-access/sign-in", appUrl);
    signInUrl.searchParams.set("installation", "11111111-1111-4111-8111-111111111111");
    await navigateWithLoadEvent(client, signInUrl.toString());
    await waitForCondition(
      () => evaluate(`document.querySelector('[data-customer-sign-in-email-step="true"]') !== null`),
      10000,
      "Customer email-only sign-in step",
    );

    const initial = await evaluate(`(() => ({
      continueVisible: [...document.querySelectorAll("button")]
        .some((button) => button.textContent?.trim() === "Continue"),
      emailAutocomplete: document.querySelector('input[type="email"]')?.autocomplete || "",
      emailCount: document.querySelectorAll('input[type="email"]').length,
      passwordCount: document.querySelectorAll('input[type="password"]').length,
    }))()`);
    assert.deepEqual(initial, {
      continueVisible: true,
      emailAutocomplete: "email",
      emailCount: 1,
      passwordCount: 0,
    });

    await evaluate(`(() => {
      const input = document.querySelector('input[type="email"]');
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setValue.call(input, ${JSON.stringify(testEmail)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);
    await evaluate(`new Promise((resolve) => requestAnimationFrame(() => resolve(true)))`);
    await evaluate(`(() => {
      [...document.querySelectorAll("button")]
        .find((button) => button.textContent?.trim() === "Continue")
        .click();
    })()`);
    await waitForCondition(
      () => evaluate(`document.querySelector('[data-customer-sign-in-credentials-step="true"]') !== null`),
      10000,
      "Customer PIN sign-in step",
    );

    const credentials = await evaluate(`(() => {
      const pin = document.querySelector('input[type="password"]');
      return {
        changeEmailVisible: [...document.querySelectorAll("button")]
          .some((button) => button.textContent?.trim() === "Change email"),
        confirmedEmailVisible: document.body.innerText.includes(${JSON.stringify(testEmail)}),
        emailCount: document.querySelectorAll('input[type="email"]').length,
        pinAutocomplete: pin?.autocomplete || "",
        pinInputMode: pin?.inputMode || "",
        passwordCount: document.querySelectorAll('input[type="password"]').length,
      };
    })()`);
    assert.deepEqual(credentials, {
      changeEmailVisible: true,
      confirmedEmailVisible: true,
      emailCount: 0,
      pinAutocomplete: "current-password",
      pinInputMode: "numeric",
      passwordCount: 1,
    });
    assert.deepEqual(principalRequests, [], "Email Continue must not call the Customer principal API.");

    await evaluate(`(() => {
      const pin = document.querySelector('input[type="password"]');
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setValue.call(pin, "246802");
      pin.dispatchEvent(new Event("input", { bubbles: true }));
      [...document.querySelectorAll("button")]
        .find((button) => button.textContent?.trim() === "Change email")
        .click();
    })()`);
    await waitForCondition(
      () => evaluate(`document.querySelector('[data-customer-sign-in-email-step="true"]') !== null`),
      10000,
      "Customer email step after Change email",
    );
    const changed = await evaluate(`(() => ({
      emailValue: document.querySelector('input[type="email"]')?.value || "",
      passwordCount: document.querySelectorAll('input[type="password"]').length,
    }))()`);
    assert.deepEqual(changed, { emailValue: testEmail, passwordCount: 0 });
    assert.deepEqual(principalRequests, [], "Change email must not call the Customer principal API.");

    console.log(JSON.stringify(reporter.summary({ ok: true }), null, 2));
    console.log("Customer principal sign-in browser guard passed.");
  } finally {
    client?.close();
    await terminateChildProcess(chromeProcess);
    await rm(chromeProfileDir, { force: true, recursive: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
