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
        if (request.method === "POST" && body?.action === "start_activation") {
          await client.send("Fetch.fulfillRequest", {
            body: Buffer.from(JSON.stringify({
              data: { challenge_id: "00000000-0000-4000-8000-000000000001" },
              ok: true,
            })).toString("base64"),
            requestId,
            responseCode: 200,
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
    reporter.step("waiting for the established activation control to hydrate");
    await waitForSelector(
      evaluate,
      "button",
      "Customer principal invitation verification button",
    );
    await waitForCondition(
      () => evaluate(`(() => {
        const button = [...document.querySelectorAll("button")]
          .find((candidate) => candidate.textContent?.trim() === "Verify invited email");
        if (!button) return false;
        const reactPropsKey = Object.keys(button).find((key) => key.startsWith("__reactProps$"));
        return Boolean(reactPropsKey && typeof button[reactPropsKey]?.onClick === "function");
      })()`),
      10000,
      "Customer principal activation React handler",
    );

    const validInviteState = await evaluate(`(() => {
      const button = [...document.querySelectorAll("button")]
        .find((candidate) => candidate.textContent?.trim() === "Verify invited email");
      const reactPropsKey = Object.keys(button).find((key) => key.startsWith("__reactProps$"));
      return {
        domDisabled: button.disabled,
        hasInvite: new URLSearchParams(window.location.search).has("invite"),
        reactDisabled: button[reactPropsKey].disabled,
      };
    })()`);

    assert.deepEqual(validInviteState, {
      domDisabled: false,
      hasInvite: true,
      reactDisabled: false,
    });
    assert.deepEqual(principalRequests, [], "Hydration must not request or send an OTP.");

    const missingInviteUrl = new URL("/customer-access/activate", appUrl);
    await navigateWithLoadEvent(client, missingInviteUrl.toString());
    await waitForCondition(
      () => evaluate(`document.body.innerText.includes("This Customer access invitation is missing or invalid.")`),
      10000,
      "missing invitation fail-closed message",
    );
    const missingInviteDisabled = await evaluate(`(() => {
      const button = [...document.querySelectorAll("button")]
        .find((candidate) => candidate.textContent?.trim() === "Verify invited email");
      return button?.disabled === true;
    })()`);
    assert.equal(missingInviteDisabled, true);
    assert.deepEqual(principalRequests, [], "Missing invitation rendering must not call the principal API.");

    reporter.step("reproducing the Customer app foreground reload after the email challenge starts");
    await navigateWithLoadEvent(client, activationUrl.toString());
    await waitForCondition(
      () => evaluate(`(() => {
        const button = [...document.querySelectorAll("button")]
          .find((candidate) => candidate.textContent?.trim() === "Verify invited email");
        return button?.disabled === false;
      })()`),
      10000,
      "enabled invitation verification button before challenge",
    );
    await evaluate(`(() => {
      const button = [...document.querySelectorAll("button")]
        .find((candidate) => candidate.textContent?.trim() === "Verify invited email");
      button.click();
    })()`);
    await waitForCondition(
      () => evaluate(`document.body.innerText.includes("One-time email code")`),
      10000,
      "activation code and PIN step",
    );
    assert.deepEqual(principalRequests, ["POST"], "The safe diagnostic must start exactly one local challenge.");

    await evaluate(`(() => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      const values = ["244430", "123456", "123456"];
      [...document.querySelectorAll("input")].forEach((input, index) => {
        setValue.call(input, values[index]);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    })()`);

    await navigateWithLoadEvent(client, activationUrl.toString());
    await waitForCondition(
      () => evaluate(`document.body.innerText.includes("One-time email code")`),
      10000,
      "resumed activation code and PIN step after foreground reload",
    );
    const resumedState = await evaluate(`(() => {
      const storage = window.localStorage.getItem("prestige-customer-activation-resume-v1") || "";
      return {
        fieldValues: [...document.querySelectorAll("input")].map((input) => input.value),
        hasCreateAccess: document.body.innerText.includes("Create secure access"),
        hasVerifyInvite: document.body.innerText.includes("Verify invited email"),
        storageContainsInvitation: storage.includes(${JSON.stringify(diagnosticInvitation)}),
        storageContainsOtpOrPin: storage.includes("244430") || storage.includes("123456"),
      };
    })()`);
    assert.deepEqual(resumedState, {
      fieldValues: ["", "", ""],
      hasCreateAccess: true,
      hasVerifyInvite: false,
      storageContainsInvitation: false,
      storageContainsOtpOrPin: false,
    });
    assert.deepEqual(principalRequests, ["POST"], "Foreground resume must not send another email challenge.");

    await evaluate(`(() => {
      const key = "prestige-customer-activation-resume-v1";
      const stored = JSON.parse(window.localStorage.getItem(key));
      window.localStorage.setItem(key, JSON.stringify({ ...stored, expiresAt: Date.now() - 1 }));
    })()`);
    await navigateWithLoadEvent(client, activationUrl.toString());
    await waitForCondition(
      () => evaluate(`document.body.innerText.includes("Your email code expired. Verify invited email to request a new one.")`),
      10000,
      "expired activation challenge recovery",
    );
    const expiredState = await evaluate(`(() => ({
      resumeCleared: window.localStorage.getItem("prestige-customer-activation-resume-v1") === null,
      verifyInviteEnabled: [...document.querySelectorAll("button")]
        .some((candidate) => candidate.textContent?.trim() === "Verify invited email" && !candidate.disabled),
    }))()`);
    assert.deepEqual(expiredState, { resumeCleared: true, verifyInviteEnabled: true });
    assert.deepEqual(principalRequests, ["POST"], "Expiry recovery must not send another email challenge.");
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
