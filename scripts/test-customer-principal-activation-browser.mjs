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
