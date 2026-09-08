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
const chromeDebugPort = Number(process.env.CHROME_DEBUG_PORT || 9247);
const reporter = createBrowserTestReporter("customer-principal-activation-browser");
const diagnosticInvitation = "diagnostic-only-000000000000000000000000000000000000000000000000";

async function main() {
  const chromeProfileDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-activation-chrome-"));
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
      client.send("Fetch.enable", {
        patterns: [{ requestStage: "Request", urlPattern: "*/api/customer-principal-access" }],
      }),
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

    client.on("Fetch.requestPaused", ({ requestId, request }) => {
      void (async () => {
        let body = null;
        try {
          body = JSON.parse(request.postData || "");
        } catch {}
        if (request.method === "POST" && body?.action === "complete_activation") {
          await client.send("Fetch.fulfillRequest", {
            body: Buffer.from(JSON.stringify({
              error: "Customer invitation is invalid or has already been used.",
              ok: false,
            })).toString("base64"),
            requestId,
            responseCode: 409,
            responseHeaders: [{ name: "content-type", value: "application/json; charset=utf-8" }],
          });
          return;
        }
        await client.send("Fetch.failRequest", { errorReason: "BlockedByClient", requestId });
      })();
    });

    const activationUrl = new URL("/customer-access/activate", appUrl);
    activationUrl.searchParams.set("invite", diagnosticInvitation);
    await navigateWithLoadEvent(client, activationUrl.toString());
    reporter.step("checking direct PIN setup without an email step");
    await waitForCondition(
      () => evaluate(`document.querySelector('button[type="submit"]')?.disabled === false`),
      10000, "hydrated PIN setup",
    );
    assert.equal(await evaluate(`document.querySelectorAll('input[type="password"]').length`), 2);
    assert.equal(await evaluate(`/Verify invited email|One-time email code/.test(document.body.innerText)`), false);
    assert.deepEqual(principalRequests, [], "Opening an invitation sends no OTP and performs no activation");
    await evaluate(`document.querySelector('button[type="submit"]').click()`);
    await waitForCondition(() => evaluate(`document.body.innerText.includes("Enter the same 6-digit PIN twice.")`), 10000, "PIN validation");
    assert.deepEqual(principalRequests, [], "Invalid PIN sends no request");
    await evaluate(`(() => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      [...document.querySelectorAll("input")].forEach((input) => {
        setValue.call(input, "123456");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    })()`);
    await navigateWithLoadEvent(client, activationUrl.toString());
    await waitForCondition(() => evaluate(`document.querySelector('button[type="submit"]')?.disabled === false`), 10000, "PIN setup after reload");
    assert.deepEqual(await evaluate(`[...document.querySelectorAll("input")].map(input => input.value)`), ["", ""], "PIN must not survive reload in storage");
    assert.deepEqual(principalRequests, [], "Foreground reload never sends an email");
    await evaluate(`(() => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      [...document.querySelectorAll("input")].forEach((input) => {
        setValue.call(input, "123456");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    })()`);
    await evaluate(`document.querySelector('button[type="submit"]').click()`);
    await waitForCondition(() => evaluate(`document.body.innerText.includes("Customer invitation is invalid or has already been used.")`), 10000, "invalid or reused invitation feedback");
    assert.deepEqual(principalRequests, ["POST"], "One explicit submit uses the existing activation endpoint once");
    await navigateWithLoadEvent(client, new URL("/customer-access/activate", appUrl).toString());
    await waitForCondition(() => evaluate(`document.body.innerText.includes("This Customer access invitation is missing or invalid.")`), 10000, "missing invitation");
    assert.equal(await evaluate(`document.querySelector('button[type="submit"]').disabled`), true);
    assert.deepEqual(principalRequests, ["POST"], "Missing invitation performs no write");
    console.log(JSON.stringify(reporter.summary({ ok: true }), null, 2));
    console.log("Customer principal activation hydration browser guard passed.");
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
