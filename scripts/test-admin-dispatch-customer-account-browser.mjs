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
const bookers = [
  {
    booker_name: "Mavis Lam",
    company_id: 55,
    customer_id: 550,
    id: 5501,
  },
  {
    booker_name: "No Traveller Booker",
    company_id: 55,
    customer_id: 551,
    id: 5502,
  },
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
          { requestStage: "Request", urlPattern: "*/api/admin-bookers*" },
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
        responseBody = { bookers, companies, ok: true, settings: null, travelers };
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
      } else if (requestUrl.pathname === "/api/admin-bookers" && method === "GET") {
        const booker = bookers.find(
          (candidate) => String(candidate.id) === requestUrl.searchParams.get("id"),
        );
        responseBody = booker
          ? {
              booker: {
                ...booker,
                email: null,
                phone: null,
              },
              ok: true,
            }
          : { booker: null, ok: true };
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
    await waitForSelector(evaluate, '[data-app-tab="dispatch"]', "Dispatch tab");
    await evaluate(`document.querySelector('[data-app-tab="dispatch"]')?.click()`);
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
        return options.length === 3 && keys.includes("corporate:41:4101") ? {
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
    assert.deepEqual(initialState.keys.sort(), [
      "corporate:41:4101",
      "corporate:55:5501",
      "corporate:55:5502",
    ]);
    assert.equal(initialState.legacyCount, 0);
    assert.equal(initialState.listOverflowY, "auto");
    assert.match(initialState.searchBackground, /255, 255, 255/);
    assert.ok(
      initialState.widthRatio >= 0.3 && initialState.widthRatio <= 0.36,
      "Customer Account bar must retain the previous one-column Customer width",
    );

    const searchKeys = async (value, expectedCount) => {
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
          return input?.value === ${JSON.stringify(value)} && options.length === ${expectedCount}
            ? options.map((option) => option.getAttribute("data-admin-dispatch-customer-account-option"))
            : false;
        })()`),
        10000,
        `account search ${value}`,
      );
    };
    const search = async (value) => (await searchKeys(value, 1))[0];

    assert.equal(await search("Kim Hyun Soo"), "corporate:41:4101");
    assert.equal(await search("Kim Passenger"), "corporate:41:4101");
    assert.deepEqual(
      (await searchKeys("Nomura", 2)).sort(),
      ["corporate:55:5501", "corporate:55:5502"],
    );
    assert.equal(await search("Mavis Lam"), "corporate:55:5501");
    assert.equal(await search("Mr Jwalent Nanavati"), "corporate:55:5501");
    assert.equal(await search("No Traveller Booker"), "corporate:55:5502");
    await evaluate(`document.querySelector('[data-admin-dispatch-customer-account-option="corporate:55:5502"]')?.click()`);
    const noTravelerAccountState = await waitForCondition(
      async () => evaluate(`(() => {
        const chooser = document.querySelector('[data-admin-dispatch-customer-account-select="true"]');
        return chooser?.dataset.bookerId === "5502" && chooser?.dataset.customerId === "551"
          ? {
              bookerId: chooser.dataset.bookerId,
              companyId: chooser.dataset.companyId,
              customerId: chooser.dataset.customerId,
              travelerId: chooser.dataset.travelerId || "",
            }
          : false;
      })()`),
      10000,
      "approved Booker account remains selectable without a Traveller row",
    );
    assert.deepEqual(noTravelerAccountState, {
      bookerId: "5502",
      companyId: "55",
      customerId: "551",
      travelerId: "",
    });
    await search("Mavis Lam");
    reporter.step("checking passenger-specific repeat account selection");

    await evaluate(`(() => {
      const input = document.querySelector('input[placeholder="Passenger name"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "Mr Jwalant Nanavati");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    })()`);
    await evaluate(`document.querySelector('[data-admin-dispatch-customer-account-option="corporate:55:5501"]')?.click()`);
    const firstPassengerState = await waitForCondition(
      async () => evaluate(`(() => {
        const chooser = document.querySelector('[data-admin-dispatch-customer-account-select="true"]');
        const passenger = document.querySelector('input[placeholder="Passenger name"]');
        const review = document.querySelector('[data-admin-dispatch-customer-account-match-review="true"]');
        return chooser?.dataset.bookerId === "5501" &&
          chooser?.dataset.customerId === "550" &&
          passenger?.value === "Mr Jwalant Nanavati" &&
          !review
          ? {
              bookerId: chooser.dataset.bookerId,
              companyId: chooser.dataset.companyId,
              customerId: chooser.dataset.customerId,
              passenger: passenger.value,
              travelerId: chooser.dataset.travelerId || "",
            }
          : false;
      })()`),
      10000,
      "known account with booking-specific passenger and no identity prompt",
    );
    assert.deepEqual(firstPassengerState, {
      bookerId: "5501",
      companyId: "55",
      customerId: "550",
      passenger: "Mr Jwalant Nanavati",
      travelerId: "",
    });
    assert.equal(bookingPosts.length, 0);

    await evaluate(`(() => {
      const input = document.querySelector('input[placeholder="Passenger name"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "Alex Tan");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    })()`);
    await search("Mavis Lam");
    await evaluate(`document.querySelector('[data-admin-dispatch-customer-account-option="corporate:55:5501"]')?.click()`);
    const differentPassengerState = await waitForCondition(
      async () => evaluate(`(() => {
        const chooser = document.querySelector('[data-admin-dispatch-customer-account-select="true"]');
        const passenger = document.querySelector('input[placeholder="Passenger name"]');
        const review = document.querySelector('[data-admin-dispatch-customer-account-match-review="true"]');
        return chooser?.dataset.bookerId === "5501" &&
          chooser?.dataset.customerId === "550" &&
          passenger?.value === "Alex Tan" &&
          !review
          ? {
              bookerId: chooser.dataset.bookerId,
              companyId: chooser.dataset.companyId,
              customerId: chooser.dataset.customerId,
              passenger: passenger.value,
              travelerId: chooser.dataset.travelerId || "",
            }
          : false;
      })()`),
      10000,
      "different passenger keeps the approved account without another prompt",
    );
    assert.deepEqual(differentPassengerState, {
      bookerId: "5501",
      companyId: "55",
      customerId: "550",
      passenger: "Alex Tan",
      travelerId: "",
    });
    assert.equal(bookingPosts.length, 0);

    await evaluate(`document.querySelector('[data-admin-dispatch-customer-account-create="true"]')?.click()`);
    const createChoices = await waitForCondition(
      async () => evaluate(`(() => {
        const corporate = document.querySelector('[data-admin-dispatch-new-customer-corporate="true"]');
        if (!(corporate instanceof HTMLButtonElement)) return false;
        const state = {
          account: Boolean(document.querySelector('[data-admin-dispatch-new-customer-account="true"]')),
          corporate: true,
          corporateDisabled: corporate.disabled,
          personal: Boolean(document.querySelector('[data-admin-dispatch-new-customer-personal="true"]')),
        };
        if (!corporate.disabled) corporate.click();
        return state;
      })()`),
      10000,
      "single Company + Booker new-customer choice",
    );
    assert.deepEqual(createChoices, {
      account: false,
      corporate: true,
      corporateDisabled: false,
      personal: false,
    });
    assert.equal(
      await waitForCondition(
        async () => evaluate(`Boolean(document.querySelector('[data-admin-dispatch-new-customer-type="corporate"]'))`),
        10000,
        "new-customer path selection",
      ),
      true,
    );
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
