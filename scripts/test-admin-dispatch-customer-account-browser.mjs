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
  { company_name: "Alson Chua UOB", domain: null, id: 46 },
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
          { requestStage: "Request", urlPattern: "*/api/admin-companies-crm-identity*" },
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

    const touchTap = async (selector) => {
      const point = await evaluate(`(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!(element instanceof HTMLElement)) return null;
        element.scrollIntoView({ block: "center", inline: "nearest" });
        const rect = element.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
      })()`);

      assert.ok(point, `Expected touch target ${selector}`);
      await client.send("Input.synthesizeTapGesture", {
        gestureSourceType: "touch",
        x: point.x,
        y: point.y,
      });
    };

    client.on("Fetch.requestPaused", ({ request, requestId }) => {
      const requestUrl = new URL(request.url);
      const method = request.method || "GET";
      let responseBody = null;

      if (requestUrl.pathname === "/api/admin-rate-setup" && method === "GET") {
        responseBody = { bookers, companies, ok: true, settings: null, travelers };
      } else if (requestUrl.pathname === "/api/admin-customer-accounts" && method === "GET") {
        responseBody = {
          accounts: [
            {
              customer_account: "Kim Hyun Soo",
              customer_folder_active: true,
              customer_id: "174",
              guest_account_billing_enabled: true,
              verified_company_id: "41",
            },
            {
              customer_account: "Alson Chua UOB",
              customer_folder_active: true,
              customer_id: "180",
              guest_account_billing_enabled: true,
              verified_company_id: "46",
            },
          ],
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
      } else if (
        requestUrl.pathname === "/api/admin-companies-crm-identity" &&
        method === "GET"
      ) {
        responseBody = {
          error: "Verified Company + Booker account gate passed; focused probe stopped before any write.",
          ok: false,
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
        const menu = [...chooser.children].find((child) => child instanceof HTMLDivElement);
        const summaryWidth = chooser.querySelector("summary")?.getBoundingClientRect().width || 0;
        const sectorWidth = chooser.closest('[data-admin-dispatch-crm-identity-selectors="true"]')?.getBoundingClientRect().width || 0;
        return menu instanceof HTMLDivElement && options.length === 4 && keys.includes("corporate:41:4101") ? {
          keys,
          optionTitles: Object.fromEntries(options.map((option) => [
            option.getAttribute("data-admin-dispatch-customer-account-option"),
            option.querySelector("span")?.textContent.trim() || "",
          ])),
          legacyCount: document.querySelectorAll('[data-admin-dispatch-agency-folder-select="true"], [data-admin-dispatch-corporate-customer-select="true"], [data-admin-dispatch-corporate-pair-select="true"]').length,
          listOverflowY: getComputedStyle(document.querySelector('[data-admin-dispatch-customer-account-options="true"]')).overflowY,
          menuPosition: getComputedStyle(menu).position,
          searchBackground: getComputedStyle(document.querySelector('[data-admin-dispatch-customer-account-search="true"]')).backgroundColor,
          widthRatio: sectorWidth ? summaryWidth / sectorWidth : 0,
        } : false;
      })()`),
      10000,
      "exact unified account options",
    );
    assert.deepEqual(initialState.keys.sort(), [
      "agency:180:46",
      "corporate:41:4101",
      "corporate:55:5501",
      "corporate:55:5502",
    ]);
    assert.equal(initialState.legacyCount, 0);
    assert.equal(initialState.optionTitles["corporate:41:4101"], "Kim Hyun Soo");
    assert.equal(
      initialState.optionTitles["corporate:55:5501"],
      "Nomura Singapore Limited (Mavis Lam)",
    );
    assert.equal(
      initialState.optionTitles["corporate:55:5502"],
      "Nomura Singapore Limited (No Traveller Booker)",
    );
    assert.doesNotMatch(
      Object.values(initialState.optionTitles).join(" "),
      /Kim Passenger|Mr Jwalant Nanavati|Alex Tan/,
      "Dispatch option titles must not use Passenger/Traveller/Boss names",
    );
    assert.equal(initialState.listOverflowY, "auto");
    assert.equal(initialState.menuPosition, "absolute");
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

    assert.equal(await search("Alson Chua UOB"), "agency:180:46");
    await evaluate(`document.querySelector('[data-admin-dispatch-customer-account-option="agency:180:46"]')?.click()`);
    const legacyProfileSelectionState = await waitForCondition(
      async () => evaluate(`(() => {
        const chooser = document.querySelector('[data-admin-dispatch-customer-account-select="true"]');
        return chooser?.dataset.companyId === "46" && chooser?.dataset.customerId === "180"
          ? {
              bookerId: chooser.dataset.bookerId || "",
              bookerName: [...document.querySelectorAll("label")]
                .find((label) => label.textContent.includes("Booker / PA name"))
                ?.querySelector("input")?.value || "",
              companyId: chooser.dataset.companyId,
              customerId: chooser.dataset.customerId,
              profileMessage: document.querySelector('[data-admin-dispatch-agency-folder-selected="true"]')
                ?.textContent.replace(/\\s+/g, " ").trim() || "",
              selectedText: chooser.querySelector("summary")?.textContent.replace(/\\s+/g, " ").trim() || "",
              travelerId: chooser.dataset.travelerId || "",
            }
          : false;
      })()`),
      10000,
      "existing legacy profile selected without inferred Booker or Traveller",
    );
    assert.deepEqual(
      {
        bookerId: legacyProfileSelectionState.bookerId,
        bookerName: legacyProfileSelectionState.bookerName,
        companyId: legacyProfileSelectionState.companyId,
        customerId: legacyProfileSelectionState.customerId,
        travelerId: legacyProfileSelectionState.travelerId,
      },
      {
        bookerId: "",
        bookerName: "",
        companyId: "46",
        customerId: "180",
        travelerId: "",
      },
    );
    assert.match(legacyProfileSelectionState.selectedText, /^Alson Chua UOB/);
    assert.match(legacyProfileSelectionState.profileMessage, /Enter and approve the exact Booker/);

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
              title: chooser.querySelector("summary")?.textContent.replace(/\\s+/g, " ").trim() || "",
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
      title: "Nomura Singapore Limited (No Traveller Booker)⌄",
      travelerId: "",
    });
    const preparedDirectSave = await evaluate(`(() => {
      const normalize = (value) => (value || "").replace(/\\s+\\*/g, " ").trim();
      const setField = (labelText, value) => {
        const label = [...document.querySelectorAll("label")].find(
          (candidate) => normalize(candidate.querySelector("span")?.textContent) === labelText,
        );
        const input = label?.querySelector("input");
        if (!(input instanceof HTMLInputElement)) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      };

      return [
        setField("Passenger name", ""),
        setField("Pickup date", "2026-09-01"),
        setField("Pickup time", "10:00"),
        setField("Pickup", "QA Pickup"),
        setField("Drop-off", "QA Drop-off"),
      ].every(Boolean);
    })()`);
    assert.equal(preparedDirectSave, true, "Expected direct Save + CRM probe fields");
    await waitForCondition(
      async () => evaluate(`(() => {
        const valueFor = (labelText) => [...document.querySelectorAll("label")]
          .find((candidate) => (candidate.querySelector("span")?.textContent || "").replace(/\\s+\\*/g, " ").trim() === labelText)
          ?.querySelector("input")?.value || "";
        const chooser = document.querySelector('[data-admin-dispatch-customer-account-select="true"]');
        return chooser?.dataset.bookerId === "5502" &&
          valueFor("Pickup date") === "2026-09-01" &&
          valueFor("Pickup time") === "10:00" &&
          valueFor("Pickup") === "QA Pickup" &&
          valueFor("Drop-off") === "QA Drop-off" &&
          valueFor("Passenger name") === "";
      })()`),
      10000,
      "direct Save + CRM local field state",
    );
    const clickedDirectSave = await evaluate(`(() => {
      const button = [...document.querySelectorAll("button")].find(
        (candidate) => /^(Save \\+ CRM|Save Booking \\+ CRM)$/.test(candidate.textContent.trim()),
      );
      if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
      button.click();
      return true;
    })()`);
    assert.equal(clickedDirectSave, true, "Expected direct Save + CRM click");
    const directSaveState = await waitForCondition(
      async () => evaluate(`(() => {
        const feedback = document.querySelector('[data-booking-save-feedback="job-card"]')
          ?.textContent.replace(/\\s+/g, " ").trim() || "";
        return feedback.includes("Verified Company + Booker account gate passed")
          ? {
              billingReview: document.querySelector('[data-save-crm-billing-identity-review="true"]')
                ?.textContent.replace(/\\s+/g, " ").trim() || "",
              feedback,
            }
          : false;
      })()`),
      10000,
      "verified Company + Booker Save + CRM account gate",
    );
    assert.equal(directSaveState.billingReview, "");
    assert.doesNotMatch(directSaveState.feedback, /Passenger|Traveller|Traveler|Boss/);
    assert.equal(bookingPosts.length, 0, "The focused Company + Booker probe must perform zero booking writes");
    await waitForCondition(
      async () => evaluate(`(() => {
        const button = [...document.querySelectorAll("button")].find(
          (candidate) => /^(Save \\+ CRM|Save Booking \\+ CRM)$/.test(candidate.textContent.trim()),
        );
        return button instanceof HTMLButtonElement && !button.disabled;
      })()`),
      10000,
      "Save + CRM recovery after focused account-gate stop",
    );

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
        return chooser instanceof HTMLDetailsElement &&
          !chooser.open &&
          chooser.dataset.bookerId === "5501" &&
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
        const searchInput = document.querySelector('[data-admin-dispatch-customer-account-search="true"]');
        const passenger = document.querySelector('input[placeholder="Passenger name"]');
        const review = document.querySelector('[data-admin-dispatch-customer-account-match-review="true"]');
        return chooser instanceof HTMLDetailsElement &&
          !chooser.open &&
          searchInput?.value === "" &&
          chooser.dataset.bookerId === "5501" &&
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

    reporter.step("checking iPhone Customer Account layout and touch selection");
    await Promise.all([
      client.send("Emulation.setDeviceMetricsOverride", {
        deviceScaleFactor: 3,
        height: 844,
        mobile: true,
        width: 390,
      }),
      client.send("Emulation.setTouchEmulationEnabled", {
        enabled: true,
        maxTouchPoints: 5,
      }),
    ]);
    await navigateWithLoadEvent(client, appUrl);
    await waitForSelector(evaluate, '[data-app-tab="dispatch"]', "mobile Dispatch tab");
    await waitForCondition(
      async () => evaluate(`(() => {
        const tab = document.querySelector('[data-app-tab="dispatch"]');
        if (!(tab instanceof HTMLButtonElement)) return false;
        if (tab.getAttribute("aria-selected") === "true") return true;
        tab.click();
        return false;
      })()`),
      10000,
      "active mobile Dispatch tab",
    );
    await waitForSelector(
      evaluate,
      '[data-mobile-dispatch-quick-step="details"]',
      "mobile Details quick step",
    );
    await waitForCondition(
      async () => evaluate(`(() => {
        const step = document.querySelector('[data-mobile-dispatch-quick-step="details"]');
        if (!(step instanceof HTMLButtonElement)) return false;
        if (step.getAttribute("aria-current") === "step") return true;
        step.click();
        return false;
      })()`),
      10000,
      "active mobile Details quick step",
    );
    await waitForSelector(
      evaluate,
      '[data-admin-dispatch-customer-account-select="true"]',
      "mobile Customer Account chooser",
    );
    await waitForCondition(
      async () => evaluate(`(() => {
        const summary = document.querySelector('[data-admin-dispatch-customer-account-select="true"] > summary');
        const rect = summary?.getBoundingClientRect();
        return Boolean(rect && rect.width > 0 && rect.height > 0);
      })()`),
      10000,
      "visible mobile Customer Account chooser",
    );
    await touchTap('[data-admin-dispatch-customer-account-select="true"] > summary');
    await waitForCondition(
      async () => evaluate(`document.querySelector('[data-admin-dispatch-customer-account-select="true"]')?.open === true`),
      10000,
      "touch-opened mobile Customer Account chooser",
    );

    const mobileOpenState = await evaluate(`(() => {
        const chooser = document.querySelector('[data-admin-dispatch-customer-account-select="true"]');
        if (!(chooser instanceof HTMLDetailsElement) || !chooser.open) {
          return { ready: false, reason: "chooser-not-open" };
        }
        const menu = [...chooser.children].find((child) => child instanceof HTMLDivElement);
        const section = chooser.closest('[data-dispatch-workflow-step="booking-details"]');
        const companyField = section
          ?.querySelector('input[placeholder="Company / Account"]')
          ?.closest("label");
        const options = chooser.querySelector('[data-admin-dispatch-customer-account-options="true"]');
        if (!(menu instanceof HTMLDivElement) || !(companyField instanceof HTMLLabelElement) ||
          !(options instanceof HTMLDivElement)) {
          return {
            companyFieldFound: companyField instanceof HTMLLabelElement,
            menuFound: menu instanceof HTMLDivElement,
            optionsFound: options instanceof HTMLDivElement,
            ready: false,
            reason: "mobile-geometry-target-missing",
          };
        }
        const menuRect = menu.getBoundingClientRect();
        const companyRect = companyField.getBoundingClientRect();
        return {
          companyTop: companyRect.top,
          menuBottom: menuRect.bottom,
          menuPosition: getComputedStyle(menu).position,
          optionsOverflowY: getComputedStyle(options).overflowY,
          overlapsCompanyField: menuRect.bottom > companyRect.top,
          pageOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
          ready: true,
          viewportWidth: window.innerWidth,
        };
      })()`);
    assert.equal(mobileOpenState.ready, true, JSON.stringify(mobileOpenState));
    assert.equal(mobileOpenState.viewportWidth, 390);
    assert.equal(mobileOpenState.menuPosition, "relative");
    assert.equal(mobileOpenState.overlapsCompanyField, false);
    assert.ok(mobileOpenState.companyTop >= mobileOpenState.menuBottom);
    assert.equal(mobileOpenState.optionsOverflowY, "auto");
    assert.equal(mobileOpenState.pageOverflow, 0);

    await touchTap('[data-admin-dispatch-customer-account-option="corporate:55:5501"]');
    const mobileSelectedState = await waitForCondition(
      async () => evaluate(`(() => {
        const chooser = document.querySelector('[data-admin-dispatch-customer-account-select="true"]');
        return chooser instanceof HTMLDetailsElement &&
          !chooser.open &&
          chooser.dataset.bookerId === "5501" &&
          chooser.dataset.companyId === "55" &&
          chooser.dataset.customerId === "550"
          ? {
              bookerId: chooser.dataset.bookerId,
              companyId: chooser.dataset.companyId,
              customerId: chooser.dataset.customerId,
              title: chooser.querySelector("summary")?.textContent.replace(/\\s+/g, " ").trim() || "",
              travelerId: chooser.dataset.travelerId || "",
            }
          : false;
      })()`),
      10000,
      "touch-selected exact mobile Customer Account",
    );
    assert.deepEqual(mobileSelectedState, {
      bookerId: "5501",
      companyId: "55",
      customerId: "550",
      title: "Nomura Singapore Limited (Mavis Lam)⌄",
      travelerId: "",
    });
    assert.equal(bookingPosts.length, 0);

    reporter.step("checking narrow-phone Customer Account containment");
    await client.send("Emulation.setDeviceMetricsOverride", {
      deviceScaleFactor: 2,
      height: 568,
      mobile: true,
      width: 320,
    });
    await evaluate(`(() => {
      const chooser = document.querySelector('[data-admin-dispatch-customer-account-select="true"]');
      if (chooser instanceof HTMLDetailsElement) {
        chooser.open = true;
        chooser.scrollIntoView({ block: "center", inline: "nearest" });
      }
    })()`);
    const narrowPhoneState = await waitForCondition(
      async () => evaluate(`(() => {
        const chooser = document.querySelector('[data-admin-dispatch-customer-account-select="true"]');
        if (!(chooser instanceof HTMLDetailsElement) || !chooser.open) return false;
        const menu = [...chooser.children].find((child) => child instanceof HTMLDivElement);
        const companyField = chooser
          .closest('[data-dispatch-workflow-step="booking-details"]')
          ?.querySelector('input[placeholder="Company / Account"]')
          ?.closest("label");
        if (!(menu instanceof HTMLDivElement) || !(companyField instanceof HTMLLabelElement)) return false;
        const menuRect = menu.getBoundingClientRect();
        const companyRect = companyField.getBoundingClientRect();
        return {
          menuPosition: getComputedStyle(menu).position,
          overlapsCompanyField: menuRect.bottom > companyRect.top,
          pageOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
          viewportWidth: window.innerWidth,
        };
      })()`),
      10000,
      "320px Customer Account containment",
    );
    assert.deepEqual(narrowPhoneState, {
      menuPosition: "relative",
      overlapsCompanyField: false,
      pageOverflow: 0,
      viewportWidth: 320,
    });
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
