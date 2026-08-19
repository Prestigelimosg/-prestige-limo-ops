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
const chromeDebugPort = Number(process.env.CHROME_DEBUG_PORT || 9236);
const reporter = createBrowserTestReporter("admin-dispatch-customer-account-browser");

const companies = [
  { company_name: "Kim Hyun Soo", domain: null, id: 41 },
  { company_name: "Nomura Singapore Limited", domain: null, id: 55 },
];
const travelers = [
  {
    booker_id: 4101,
    booker_name: "Kim Hyun Soo",
    company_id: 41,
    id: 41001,
    traveler_name: "Kim Passenger",
  },
  {
    booker_id: 5501,
    booker_name: "Mavis Lam",
    company_id: 55,
    id: 55001,
    traveler_name: "Mr Jwalant Nanavati",
  },
  {
    booker_id: 5501,
    booker_name: "Mavis Lam",
    company_id: 55,
    id: 55002,
    traveler_name: "Alex Tan",
  },
  {
    booker_id: 5501,
    booker_name: "Mavis Lam",
    company_id: 55,
    id: 55003,
    traveler_name: "Alex Tan",
  },
];

function responseHeaders() {
  return [
    { name: "access-control-allow-origin", value: "*" },
    { name: "content-type", value: "application/json" },
  ];
}

async function main() {
  const chromeProfileDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-account-chrome-"));
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
  const bookingPosts = [];

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
          { requestStage: "Request", urlPattern: "*/api/admin-rate-setup*" },
          { requestStage: "Request", urlPattern: "*/api/admin-customer-accounts*" },
          { requestStage: "Request", urlPattern: "*/api/admin-bookings*" },
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

    client.on("Fetch.requestPaused", ({ request, requestId }) => {
      const requestUrl = new URL(request.url);
      const method = request.method || "GET";
      let responseBody = null;

      if (requestUrl.pathname === "/api/admin-rate-setup" && method === "GET") {
        responseBody = { companies, ok: true, settings: null, travelers };
      } else if (requestUrl.pathname === "/api/admin-customer-accounts" && method === "GET") {
        responseBody = {
          accounts: [{
            customer_account: "Kim Hyun Soo",
            customer_folder_active: true,
            customer_id: "174",
            guest_account_billing_enabled: true,
            verified_company_id: "41",
          }],
          ok: true,
        };
      } else if (requestUrl.pathname === "/api/admin-bookings" && method === "POST") {
        bookingPosts.push(request.postData || "");
        responseBody = { error: "Focused browser test blocks booking writes.", ok: false };
      }

      if (!responseBody) {
        client.send("Fetch.continueRequest", { requestId }).catch(() => {});
        return;
      }

      client.send("Fetch.fulfillRequest", {
        body: Buffer.from(JSON.stringify(responseBody)).toString("base64"),
        requestId,
        responseCode: responseBody.ok ? 200 : 409,
        responseHeaders: responseHeaders(),
      }).catch(() => {});
    });

    await navigateWithLoadEvent(client, appUrl);
    await waitForSelector(
      evaluate,
      '[data-admin-dispatch-customer-account-select="true"]',
      "unified Customer Account chooser",
    );
    reporter.step("checking unified light-mode account list");

    const initialState = await waitForCondition(
      async () => evaluate(`(() => {
        const chooser = document.querySelector('[data-admin-dispatch-customer-account-select="true"]');
        if (!(chooser instanceof HTMLDetailsElement)) return false;
        chooser.open = true;
        const options = [...document.querySelectorAll('[data-admin-dispatch-customer-account-option]')];
        const keys = options.map((option) => option.getAttribute("data-admin-dispatch-customer-account-option"));
        const summaryWidth = chooser.querySelector("summary")?.getBoundingClientRect().width || 0;
        const sectorWidth = chooser.closest('[data-admin-dispatch-crm-identity-selectors="true"]')?.getBoundingClientRect().width || 0;
        return options.length === 2 && keys.includes("agency:174:41") ? {
          keys,
          legacyCount: document.querySelectorAll('[data-admin-dispatch-agency-folder-select="true"], [data-admin-dispatch-corporate-customer-select="true"], [data-admin-dispatch-corporate-pair-select="true"]').length,
          listOverflowY: getComputedStyle(document.querySelector('[data-admin-dispatch-customer-account-options="true"]')).overflowY,
          searchBackground: getComputedStyle(document.querySelector('[data-admin-dispatch-customer-account-search="true"]')).backgroundColor,
          widthRatio: sectorWidth ? summaryWidth / sectorWidth : 0,
        } : false;
      })()`),
      10000,
      "exact unified account options",
    );
    assert.deepEqual(initialState.keys.sort(), ["agency:174:41", "corporate:55:5501"]);
    assert.equal(initialState.legacyCount, 0);
    assert.equal(initialState.listOverflowY, "auto");
    assert.match(initialState.searchBackground, /255, 255, 255/);
    assert.ok(
      initialState.widthRatio >= 0.3 && initialState.widthRatio <= 0.36,
      "Customer Account bar must retain the previous one-column Customer width",
    );

    const search = async (value) => {
      await evaluate(`(() => {
        const chooser = document.querySelector('[data-admin-dispatch-customer-account-select="true"]');
        const input = document.querySelector('[data-admin-dispatch-customer-account-search="true"]');
        if (!(chooser instanceof HTMLDetailsElement) || !(input instanceof HTMLInputElement)) return false;
        chooser.open = true;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(input, ${JSON.stringify(value)});
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      })()`);
      return waitForCondition(
        async () => evaluate(`(() => {
          const input = document.querySelector('[data-admin-dispatch-customer-account-search="true"]');
          const options = [...document.querySelectorAll('[data-admin-dispatch-customer-account-option]')];
          return input?.value === ${JSON.stringify(value)} && options.length === 1
            ? options[0].getAttribute("data-admin-dispatch-customer-account-option")
            : false;
        })()`),
        10000,
        `account search ${value}`,
      );
    };

    assert.equal(await search("Kim Hyun Soo"), "agency:174:41");
    assert.equal(await search("Kim Passenger"), "agency:174:41");
    assert.equal(await search("Nomura"), "corporate:55:5501");
    assert.equal(await search("Mavis Lam"), "corporate:55:5501");
    assert.equal(await search("Mr Jwalent Nanavati"), "corporate:55:5501");
    reporter.step("checking explicit passenger review");

    await evaluate(`document.querySelector('[data-admin-dispatch-customer-account-option="corporate:55:5501"]')?.click()`);
    const oneMatch = await waitForCondition(
      async () => evaluate(`(() => {
        const review = document.querySelector('[data-admin-dispatch-customer-account-match-review="true"]');
        return review ? {
          candidateListCount: document.querySelectorAll('[data-admin-dispatch-customer-account-match-candidates="true"] button').length,
          text: review.textContent.replace(/\\s+/g, " ").trim(),
        } : false;
      })()`),
      10000,
      "one passenger review",
    );
    assert.equal(oneMatch.candidateListCount, 0);
    assert.match(oneMatch.text, /Mr Jwalant Nanavati/);
    assert.equal(bookingPosts.length, 0);
    await evaluate(`document.querySelector('[data-admin-dispatch-customer-account-review-cancel="true"]')?.click()`);
    const cancelledState = await evaluate(`(() => {
      const chooser = document.querySelector('[data-admin-dispatch-customer-account-select="true"]');
      return {
        bookerId: chooser?.dataset.bookerId || "",
        companyId: chooser?.dataset.companyId || "",
        travelerId: chooser?.dataset.travelerId || "",
      };
    })()`);
    assert.deepEqual(cancelledState, { bookerId: "", companyId: "", travelerId: "" });

    await search("Mr Jwalant Nanavati");
    await evaluate(`document.querySelector('[data-admin-dispatch-customer-account-option="corporate:55:5501"]')?.click()`);
    await waitForSelector(
      evaluate,
      '[data-admin-dispatch-customer-account-use-existing="true"]',
      "use existing passenger action",
    );
    await evaluate(`document.querySelector('[data-admin-dispatch-customer-account-use-existing="true"]')?.click()`);
    const acceptedState = await waitForCondition(
      async () => evaluate(`(() => {
        const chooser = document.querySelector('[data-admin-dispatch-customer-account-select="true"]');
        return chooser?.dataset.travelerId === "55001" ? {
          bookerId: chooser.dataset.bookerId,
          companyId: chooser.dataset.companyId,
          customerId: chooser.dataset.customerId,
          travelerId: chooser.dataset.travelerId,
        } : false;
      })()`),
      10000,
      "accepted exact passenger tuple",
    );
    assert.deepEqual(acceptedState, {
      bookerId: "5501",
      companyId: "55",
      customerId: "",
      travelerId: "55001",
    });

    await evaluate(`(() => {
      const input = document.querySelector('input[placeholder="Passenger name"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "Alex Tan");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    })()`);
    await search("Mavis Lam");
    await evaluate(`document.querySelector('[data-admin-dispatch-customer-account-option="corporate:55:5501"]')?.click()`);
    const multipleMatches = await waitForCondition(
      async () => evaluate(`(() => {
        const candidates = [...document.querySelectorAll('[data-admin-dispatch-customer-account-match-candidates="true"] button')];
        const text = candidates.map((candidate) => candidate.textContent.replace(/\\s+/g, " ").trim()).join(" | ");
        return candidates.length === 2 && text.includes("CRM Traveller #55002") && text.includes("CRM Traveller #55003");
      })()`),
      10000,
      "distinguishable multiple passenger candidates",
    );
    assert.equal(multipleMatches, true);
    await evaluate(`document.querySelector('[data-admin-dispatch-customer-account-different-person="true"]')?.click()`);
    const differentPersonState = await waitForCondition(
      async () => evaluate(`(() => {
        const chooser = document.querySelector('[data-admin-dispatch-customer-account-select="true"]');
        return chooser?.dataset.bookerId === "5501" && chooser?.dataset.travelerId === ""
          ? { bookerId: chooser.dataset.bookerId, companyId: chooser.dataset.companyId }
          : false;
      })()`),
      10000,
      "different passenger account state",
    );
    assert.deepEqual(differentPersonState, { bookerId: "5501", companyId: "55" });
    assert.equal(bookingPosts.length, 0);

    await evaluate(`document.querySelector('[data-admin-dispatch-customer-account-create="true"]')?.click()`);
    const createChoices = await waitForCondition(
      async () => evaluate(`(() => ({
        account: Boolean(document.querySelector('[data-admin-dispatch-new-customer-account="true"]')),
        corporate: Boolean(document.querySelector('[data-admin-dispatch-new-customer-corporate="true"]')),
        personal: Boolean(document.querySelector('[data-admin-dispatch-new-customer-personal="true"]')),
      }))()`),
      10000,
      "explicit new-customer choices",
    );
    assert.deepEqual(createChoices, { account: true, corporate: true, personal: true });
    await evaluate(`document.querySelector('[data-admin-dispatch-new-customer-corporate="true"]')?.click()`);
    assert.equal(
      await waitForCondition(
        async () => evaluate(`Boolean(document.querySelector('[data-admin-dispatch-new-customer-type="corporate"]'))`),
        10000,
        "new-customer path selection",
      ),
      true,
    );
    await evaluate(`document.querySelector('[data-admin-dispatch-customer-account-create="true"]')?.click()`);
    await evaluate(`document.querySelector('[data-admin-dispatch-new-customer-personal="true"]')?.click()`);
    const personalChoiceState = await waitForCondition(
      async () => evaluate(`(() => {
        const chooser = document.querySelector('[data-admin-dispatch-customer-account-select="true"]');
        const company = document.querySelector('input[placeholder="Company / Account"]');
        return document.querySelector('[data-admin-dispatch-new-customer-type="personal"]')
          ? { company: company?.value || "", customerId: chooser?.dataset.customerId || "" }
          : false;
      })()`),
      10000,
      "personal new-customer choice",
    );
    assert.deepEqual(personalChoiceState, { company: "", customerId: "" });
    await evaluate(`document.querySelector('[data-admin-dispatch-customer-account-create="true"]')?.click()`);
    await evaluate(`document.querySelector('[data-admin-dispatch-new-customer-account="true"]')?.click()`);
    const accountChoiceState = await waitForCondition(
      async () => evaluate(`(() => {
        const chooser = document.querySelector('[data-admin-dispatch-customer-account-select="true"]');
        return document.querySelector('[data-admin-dispatch-new-customer-type="account"]')
          ? chooser?.dataset.customerId || false
          : false;
      })()`),
      10000,
      "account-folder new-customer choice",
    );
    assert.equal(accountChoiceState, "create-new-hotel-tour-agency");
    assert.equal(bookingPosts.length, 0);

    console.log(JSON.stringify(reporter.summary({
      bookingPostCount: bookingPosts.length,
      errorCount: 0,
      ok: true,
    }), null, 2));
  } finally {
    await client?.close().catch(() => {});
    await terminateChildProcess(chromeProcess);
    await rm(chromeProfileDir, { force: true, recursive: true });
  }
}

await main();
