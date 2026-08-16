import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  createBrowserTestReporter,
  createChromeClient,
  navigateWithLoadEvent,
  normalizeErrorMessage,
  terminateChildProcess,
  waitForChromeDebugPort,
  waitForChromePageTarget,
  waitForCondition,
  waitForSelector,
} from "./browser-test-helpers.mjs";

const appUrl = process.env.APP_URL || "http://localhost:3000";
const chromeBinary =
  process.env.CHROME_BINARY || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromeDebugPort = Number(process.env.CHROME_DEBUG_PORT || 9232);
const reporter = createBrowserTestReporter("customer-company-profile-browser");
const originalFolderName = "Transzend Groundbooker [Mr David Kelly]";
const correctedFolderName = "Transzend Groundbooker";
const customerId = "161";

function responseHeaders() {
  return [
    { name: "access-control-allow-origin", value: "*" },
    { name: "content-type", value: "application/json" },
  ];
}

async function main() {
  const chromeProfileDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-profile-chrome-"));
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
    "--window-size=1440,1000",
    "about:blank",
  ];

  if (!/^(1|true|yes)$/i.test(process.env.PRESTIGE_BROWSER_VISIBLE || "")) {
    chromeArgs.unshift("--headless=new");
  }

  reporter.step("launching Chrome");
  const chromeProcess = spawn(chromeBinary, chromeArgs, { stdio: "ignore" });
  let client = null;
  const interceptedRequests = [];
  let companySavePayload = null;
  let folderPatchPayload = null;

  try {
    await waitForChromeDebugPort(chromeDebugPort);
    const target = await waitForChromePageTarget(chromeDebugPort);
    client = createChromeClient(target.webSocketDebuggerUrl);
    await client.ready;
    await Promise.all([
      client.send("Page.enable"),
      client.send("Runtime.enable"),
      client.send("Fetch.enable", {
        patterns: [
          { requestStage: "Request", urlPattern: "*/api/admin-customer-accounts*" },
          { requestStage: "Request", urlPattern: "*/api/admin-companies-crm-identity*" },
          {
            requestStage: "Request",
            urlPattern: "*/api/admin-company-traveler-crm-runtime-write-action*",
          },
        ],
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

    client.on("Page.javascriptDialogOpening", () => {
      client.send("Page.handleJavaScriptDialog", { accept: true }).catch(() => {});
    });

    client.on("Fetch.requestPaused", ({ request, requestId }) => {
      const requestUrl = new URL(request.url);
      const method = request.method || "GET";
      interceptedRequests.push(`${method} ${requestUrl.pathname}`);
      let responseBody;

      if (requestUrl.pathname === "/api/admin-customer-accounts" && method === "GET") {
        responseBody = {
          accounts: [{
            customer_account: originalFolderName,
            customer_id: customerId,
            guest_account_billing_enabled: true,
          }],
          ok: true,
        };
      } else if (requestUrl.pathname === "/api/admin-companies-crm-identity" && method === "GET") {
        responseBody = {
          company: {
            accounts_email: "accounts@groundbooker.com",
            billing_address: "",
            billing_email: "",
            company_name: correctedFolderName,
            domain: "groundbooker.com",
            id: 501,
            main_phone: "",
            mobile_phone: "",
            operations_email: "transzend@groundbooker.com",
            primary_contact_name: "GroundBooker",
            website: "groundbooker.com",
          },
          ok: true,
        };
      } else if (
        requestUrl.pathname === "/api/admin-company-traveler-crm-runtime-write-action" &&
        method === "POST"
      ) {
        companySavePayload = JSON.parse(request.postData || "{}");
        responseBody = {
          ok: true,
          record: { id: 501, ...companySavePayload },
          status: "saved",
        };
      } else if (requestUrl.pathname === "/api/admin-customer-accounts" && method === "PATCH") {
        folderPatchPayload = JSON.parse(request.postData || "{}");
        responseBody = {
          account: {
            customer_account: folderPatchPayload.display_name,
            customer_id: customerId,
            guest_account_billing_enabled: true,
          },
          ok: true,
        };
      } else {
        responseBody = { error: "Unexpected customer profile browser request.", ok: false };
      }

      client
        .send("Fetch.fulfillRequest", {
          body: Buffer.from(JSON.stringify(responseBody)).toString("base64"),
          requestId,
          responseCode: responseBody.ok ? 200 : 500,
          responseHeaders: responseHeaders(),
        })
        .catch(() => {});
    });

    const customerUrl = new URL(`/customers/${customerId}`, appUrl);
    customerUrl.searchParams.set("name", originalFolderName);
    await navigateWithLoadEvent(client, customerUrl.toString());
    reporter.step("opening checked agency profile");
    await waitForSelector(
      evaluate,
      `[data-customer-company-profile-edit="${customerId}"]`,
      "customer profile edit button",
    );
    await evaluate(`document.querySelector('[data-customer-company-profile-edit="${customerId}"]').click()`);
    await waitForSelector(
      evaluate,
      `[data-customer-folder-name="${customerId}"]`,
      "customer folder-name field",
    );

    const openedState = await evaluate(`(() => ({
      agencyChecked: document.querySelector('[data-customer-guest-account-billing="${customerId}"] input')?.checked === true,
      folderName: document.querySelector('[data-customer-folder-name="${customerId}"]')?.value || "",
      guidanceVisible: Boolean(document.querySelector('[data-customer-agency-guest-guidance="${customerId}"]')),
      topBanner: document.querySelector('[data-customer-folder-sector="profile"] h1')?.textContent?.trim() || "",
      travellerEditorVisible: Boolean(document.querySelector('[data-customer-verified-identities="true"]')),
    }))()`);

    assert.deepEqual(openedState, {
      agencyChecked: true,
      folderName: originalFolderName,
      guidanceVisible: true,
      topBanner: originalFolderName,
      travellerEditorVisible: false,
    });

    reporter.step("saving folder-only agency correction");
    await evaluate(`(() => {
      const input = document.querySelector('[data-customer-folder-name="${customerId}"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(input, ${JSON.stringify(correctedFolderName)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelector('[data-customer-company-profile-save="${customerId}"]').click();
    })()`);

    await waitForCondition(
      async () => {
        const banner = await evaluate(
          `document.querySelector('[data-customer-folder-sector="profile"] h1')?.textContent?.trim() || ""`,
        );
        return banner === correctedFolderName && folderPatchPayload;
      },
      10000,
      "corrected customer folder banner",
    );

    assert.deepEqual(folderPatchPayload, {
      customer_id: customerId,
      display_name: correctedFolderName,
    });
    assert.equal(Object.hasOwn(folderPatchPayload, "traveller_name"), false);
    assert.equal(companySavePayload.action_type, "company_update");
    assert.equal(companySavePayload.company_name, correctedFolderName);
    assert.equal(Object.hasOwn(companySavePayload, "traveller_name"), false);
    assert.equal(
      interceptedRequests.filter((value) => value === "PATCH /api/admin-customer-accounts").length,
      1,
    );

    const finalState = await evaluate(`(() => ({
      editButtonVisible: Boolean(document.querySelector('[data-customer-company-profile-edit="${customerId}"]')),
      editorVisible: Boolean(document.querySelector('[data-customer-company-profile-editor="${customerId}"]')),
      folderInputVisible: Boolean(document.querySelector('[data-customer-folder-name="${customerId}"]')),
      savedMessage: document.querySelector('[data-customer-company-profile-edit="${customerId}"]')?.nextElementSibling?.textContent?.trim() || "",
      saveButtonVisible: Boolean(document.querySelector('[data-customer-company-profile-save="${customerId}"]')),
      topBanner: document.querySelector('[data-customer-folder-sector="profile"] h1')?.textContent?.trim() || "",
      travellerEditorVisible: Boolean(document.querySelector('[data-customer-verified-identities="true"]')),
    }))()`);

    assert.deepEqual(finalState, {
      editButtonVisible: true,
      editorVisible: false,
      folderInputVisible: false,
      savedMessage: `Saved customer company profile for ${correctedFolderName}.`,
      saveButtonVisible: false,
      topBanner: correctedFolderName,
      travellerEditorVisible: false,
    });

    console.log(JSON.stringify(reporter.summary({
      errorCount: 0,
      ok: true,
      patchPayload: folderPatchPayload,
    }), null, 2));
  } finally {
    await client?.close().catch(() => {});
    await terminateChildProcess(chromeProcess);
    await rm(chromeProfileDir, { force: true, recursive: true });
  }
}

main().catch((error) => {
  console.error(JSON.stringify(reporter.summary({
    error: normalizeErrorMessage(error),
    errorCount: 1,
    ok: false,
  }), null, 2));
  process.exitCode = 1;
});
