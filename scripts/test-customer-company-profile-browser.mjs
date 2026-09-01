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
const originalCompanyName = "Transzend Groundbooker";
const originalBookerName = "David Kelly";
const correctedBookerName = "June";
const customerId = "161";
const companyId = 501;
const bookerId = 701;

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
  let currentFolderName = originalFolderName;
  let currentCompanyName = originalCompanyName;
  let currentBookerName = originalBookerName;
  let profilePatchPayload = null;

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
          { requestStage: "Request", urlPattern: "*/api/admin-rate-setup*" },
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
            customer_account: `${currentCompanyName} (${currentBookerName})`,
            customer_directory_label: currentFolderName,
            customer_id: customerId,
            guest_account_billing_enabled: true,
            verified_company_id: String(companyId),
          }],
          ok: true,
        };
      } else if (requestUrl.pathname === "/api/admin-companies-crm-identity" && method === "GET") {
        responseBody = {
          company: {
            accounts_email: "accounts@groundbooker.com",
            billing_address: "",
            billing_email: "",
            company_name: currentCompanyName,
            domain: "groundbooker.com",
            id: companyId,
            main_phone: "",
            mobile_phone: "",
            operations_email: "transzend@groundbooker.com",
            primary_contact_name: "GroundBooker",
            website: "groundbooker.com",
          },
          ok: true,
        };
      } else if (requestUrl.pathname === "/api/admin-rate-setup" && method === "GET") {
        responseBody = {
          bookers: [{
            booker_name: currentBookerName,
            company_id: companyId,
            customer_id: Number(customerId),
            email: "booker@groundbooker.com",
            id: bookerId,
            phone: "+65 6000 0000",
          }],
          companies: [{ company_name: currentCompanyName, id: companyId }],
          ok: true,
        };
      } else if (requestUrl.pathname === "/api/admin-customer-accounts" && method === "PATCH") {
        profilePatchPayload = JSON.parse(request.postData || "{}");
        currentFolderName = profilePatchPayload.customer_display_name;
        currentCompanyName = profilePatchPayload.company_profile.company_name;
        currentBookerName = profilePatchPayload.booker_profile.booker_name;
        responseBody = {
          account: {
            booker_id: bookerId,
            booker_name: currentBookerName,
            company_id: companyId,
            company_name: currentCompanyName,
            customer_display_name: currentFolderName,
            customer_id: Number(customerId),
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
    reporter.step("opening exact Company + Booker profile");
    await waitForSelector(
      evaluate,
      `[data-customer-company-profile-edit="${customerId}"]`,
      "customer profile edit button",
    );
    await waitForCondition(
      () =>
        evaluate(`(() => {
          const button = document.querySelector('[data-customer-company-profile-edit="${customerId}"]');
          if (!button) {
            return false;
          }
          const reactPropsKey = Object.keys(button).find((key) => key.startsWith("__reactProps$"));
          return Boolean(
            reactPropsKey &&
              button[reactPropsKey] &&
              typeof button[reactPropsKey].onClick === "function"
          );
        })()`),
      10000,
      "hydrated customer profile edit button",
    );
    await evaluate(`document.querySelector('[data-customer-company-profile-edit="${customerId}"]').click()`);
    await waitForSelector(
      evaluate,
      `[data-customer-folder-name="${customerId}"]`,
      "customer folder-name field",
    );

    const openedState = await evaluate(`(() => ({
      classificationControlCount: document.querySelectorAll('[data-customer-guest-account-billing="${customerId}"]').length,
      folderName: document.querySelector('[data-customer-folder-name="${customerId}"]')?.value || "",
      requiredIdentityVisible: Boolean(document.querySelector('[data-customer-company-booker-required="true"]')),
      topBanner: document.querySelector('[data-customer-authoritative-title="${customerId}"]')?.textContent?.trim() || "",
      travellerEditorVisible: Boolean(document.querySelector('[data-customer-verified-identities="true"]')),
    }))()`);

    assert.deepEqual(openedState, {
      classificationControlCount: 0,
      folderName: originalFolderName,
      requiredIdentityVisible: true,
      topBanner: `${originalCompanyName} (${originalBookerName})`,
      travellerEditorVisible: true,
    });

    reporter.step("checking raw Customer folder field at 390px");
    await client.send("Emulation.setDeviceMetricsOverride", {
      deviceScaleFactor: 3,
      height: 844,
      mobile: true,
      width: 390,
    });
    const mobileOpenedState = await evaluate(`(() => ({
      folderName: document.querySelector('[data-customer-folder-name="${customerId}"]')?.value || "",
      pageOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      title: document.querySelector('[data-customer-authoritative-title="${customerId}"]')?.textContent?.trim() || "",
      viewportWidth: window.innerWidth,
    }))()`);
    assert.deepEqual(mobileOpenedState, {
      folderName: originalFolderName,
      pageOverflow: 0,
      title: `${originalCompanyName} (${originalBookerName})`,
      viewportWidth: 390,
    });

    reporter.step("saving Customer folder + exact Company + Booker atomically");
    await evaluate(`(() => {
      const input = document.querySelector('[data-customer-folder-name="${customerId}"]');
      const booker = document.querySelector('[data-customer-required-booker-name="true"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(input, ${JSON.stringify(correctedFolderName)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      setter.call(booker, ${JSON.stringify(correctedBookerName)});
      booker.dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelector('[data-customer-company-profile-save="${customerId}"]').click();
    })()`);

    await waitForCondition(
      async () => {
        const banner = await evaluate(
          `document.querySelector('[data-customer-authoritative-title="${customerId}"]')?.textContent?.trim() || ""`,
        );
        return banner === `${originalCompanyName} (${correctedBookerName})` && profilePatchPayload;
      },
      10000,
      "reloaded authoritative Company + Booker title",
    );

    assert.deepEqual(profilePatchPayload, {
      action_type: "customer_company_booker_profile_overwrite",
      booker_id: bookerId,
      booker_profile: {
        booker_name: correctedBookerName,
        email: "booker@groundbooker.com",
        phone: "+65 6000 0000",
      },
      company_id: companyId,
      company_profile: {
        accounts_email: "accounts@groundbooker.com",
        billing_address: null,
        billing_email: null,
        company_name: originalCompanyName,
        domain: "groundbooker.com",
        main_phone: null,
        mobile_phone: null,
        operations_email: "transzend@groundbooker.com",
        primary_contact_name: "GroundBooker",
        website: "groundbooker.com",
      },
      customer_display_name: correctedFolderName,
      customer_id: customerId,
      expected_booker_customer_id: Number(customerId),
      expected_booker_profile: {
        booker_name: originalBookerName,
        email: "booker@groundbooker.com",
        phone: "+65 6000 0000",
      },
      expected_company_profile: {
        accounts_email: "accounts@groundbooker.com",
        billing_address: null,
        billing_email: null,
        company_name: originalCompanyName,
        domain: "groundbooker.com",
        main_phone: null,
        mobile_phone: null,
        operations_email: "transzend@groundbooker.com",
        primary_contact_name: "GroundBooker",
        website: "groundbooker.com",
      },
      expected_customer_display_name: originalFolderName,
    });
    assert.equal(Object.hasOwn(profilePatchPayload, "traveller_name"), false);
    assert.equal(Object.hasOwn(profilePatchPayload, "guest_account_billing_enabled"), false);
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
      topBanner: document.querySelector('[data-customer-authoritative-title="${customerId}"]')?.textContent?.trim() || "",
      travellerEditorVisible: Boolean(document.querySelector('[data-customer-verified-identities="true"]')),
    }))()`);

    assert.deepEqual(finalState, {
      editButtonVisible: true,
      editorVisible: false,
      folderInputVisible: false,
      savedMessage: `Saved, reloaded and verified ${originalCompanyName} (${correctedBookerName}).`,
      saveButtonVisible: false,
      topBanner: `${originalCompanyName} (${correctedBookerName})`,
      travellerEditorVisible: false,
    });

    reporter.step("navigating away and reopening the same exact profile");
    await navigateWithLoadEvent(client, new URL("/customers", appUrl).toString());
    const reopenedUrl = new URL(`/customers/${customerId}`, appUrl);
    reopenedUrl.searchParams.set("name", correctedFolderName);
    await navigateWithLoadEvent(client, reopenedUrl.toString());
    await waitForSelector(
      evaluate,
      `[data-customer-company-profile-edit="${customerId}"]`,
      "reopened customer profile edit button",
    );
    await waitForCondition(
      async () =>
        (await evaluate(
          `document.querySelector('[data-customer-authoritative-title="${customerId}"]')?.textContent?.trim() || ""`,
        )) === `${originalCompanyName} (${correctedBookerName})`,
      10000,
      "persisted authoritative Company + Booker title after reopening",
    );
    await evaluate(`document.querySelector('[data-customer-company-profile-edit="${customerId}"]').click()`);
    await waitForSelector(
      evaluate,
      `[data-customer-required-booker-name="true"]`,
      "reopened exact Booker field",
    );
    const reopenedState = await evaluate(`(() => ({
      bookerName: document.querySelector('[data-customer-required-booker-name="true"]')?.value || "",
      companyName: document.querySelector('[data-customer-company-profile-name="${customerId}"]')?.value || "",
      folderName: document.querySelector('[data-customer-folder-name="${customerId}"]')?.value || "",
      topBanner: document.querySelector('[data-customer-authoritative-title="${customerId}"]')?.textContent?.trim() || "",
    }))()`);

    assert.deepEqual(reopenedState, {
      bookerName: correctedBookerName,
      companyName: originalCompanyName,
      folderName: correctedFolderName,
      topBanner: `${originalCompanyName} (${correctedBookerName})`,
    });
    assert.equal(
      interceptedRequests.filter((value) => value === "PATCH /api/admin-customer-accounts").length,
      1,
      "Reopening must not create a second write",
    );

    console.log(JSON.stringify(reporter.summary({
      errorCount: 0,
      ok: true,
      patchPayload: profilePatchPayload,
      reopenedState,
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
