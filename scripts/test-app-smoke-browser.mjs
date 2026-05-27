import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createChromeClient,
  navigateWithLoadEvent,
  normalizeConsoleMessages,
  normalizeErrorMessage,
  waitForChildExit,
  waitForChromeDebugPort,
  waitForChromePageTarget,
  waitForBodyText,
  waitForCondition,
} from "./browser-test-helpers.mjs";

const appUrl = process.env.APP_URL || "http://localhost:3000";
const browserName = (process.env.BROWSER || "chrome").toLowerCase();
const chromeBinary =
  process.env.CHROME_BINARY || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromeDebugPort = Number(process.env.CHROME_DEBUG_PORT || 9226);
const browserErrors = [];
const browserConsoleErrors = [];
const tabLabels = ["Dispatch", "Bookings", "Completed", "Dashboard", "Drivers", "Rates"];
const tabExpectedText = {
  Dispatch: "Create Job Card",
  Bookings: "Load Bookings",
  Completed: "No completed bookings loaded yet.",
  Dashboard: "Operations Dashboard",
  Drivers: "Driver Database",
  Rates: "Load Rates",
};
const responsiveTabViewports = [
  { height: 667, label: "mobile 375px", mobile: true, scale: 2, width: 375 },
  { height: 915, label: "mobile 412px", mobile: true, scale: 2.625, width: 412 },
  { height: 1024, label: "iPad/tablet 768px", mobile: true, scale: 2, width: 768 },
  { height: 1366, label: "Android tablet 1024px", mobile: false, scale: 1, width: 1024 },
  { height: 900, label: "desktop 1440px", mobile: false, scale: 1, width: 1440 },
];
const driverDemoUrl = new URL("/driver-job-demo", appUrl).toString();
const driverJobWorkflowToken = "mock-driver-job-workflow-order";
const driverJobWorkflowUrl = new URL(`/driver-job/${driverJobWorkflowToken}`, appUrl).toString();
const driverJobWorkflowApiUrl = new URL(`/api/driver-job/${driverJobWorkflowToken}`, appUrl).toString();
const customerDashboardUrl = new URL("/customers", appUrl).toString();
const customerBookingUrl = new URL("/book", appUrl).toString();
const customerPortalUrl = new URL("/my-bookings", appUrl).toString();
const replacementLeakSentinels = {
  carPlate: "SXX9999Z-DO-NOT-LEAK",
  driverContact: "+65 9000 0000 DO NOT LEAK",
  driverName: "TEST REPLACEMENT DRIVER DO NOT LEAK",
  note: "TEST REPLACEMENT NOTE DO NOT LEAK",
  vehicleModel: "TEST REPLACEMENT MODEL DO NOT LEAK",
};
const replacementLeakSentinelValues = Object.values(replacementLeakSentinels);
const replacementStorageSentinels = {
  carPlate: "SYY8888Y-DO-NOT-PERSIST",
  driverContact: "+65 9111 1111 DO NOT PERSIST",
  driverName: "TEST STORAGE DRIVER DO NOT PERSIST",
  note: "TEST STORAGE NOTE DO NOT PERSIST",
  vehicleModel: "TEST STORAGE MODEL DO NOT PERSIST",
};
const replacementStorageSentinelValues = Object.values(replacementStorageSentinels);
const replacementAllSentinelValues = [
  ...replacementLeakSentinelValues,
  ...replacementStorageSentinelValues,
];
const replacementControlLabels = [
  "Replacement Car / Driver — Mock Only",
  "Save Replacement Details — Mock Only",
  "Mark Current Driver Cancelled — Mock Only",
  "Reassign Replacement Later — Future Staff Workflow",
];
const telegramBlockedUrlPattern =
  /api\.telegram\.org|telegram\.org|(?:^|[/:.])t\.me(?:[/:?]|$)|\/telegram\b|\/api\/telegram\b|\/api\/notifications\/telegram\b|\/api\/driver-alerts\/telegram\b|getUpdates|sendMessage|\b\d{6,12}:[A-Za-z0-9_-]{30,}\b/i;
const telegramPreviewBlockedCallPattern =
  /api\.telegram\.org|telegram\.org|(?:^|[/:.])t\.me(?:[/:?]|$)|\/telegram\b|\/api\/telegram\b|\/api\/notifications(?:\/|$)|\/api\/driver-alerts(?:\/|$)|notification[-_/ ]?logs?|getUpdates|sendMessage|\/rest\/v1\/|supabase\.co|\/storage\/v1\/|twilio|sendgrid|mailgun|postmark|api\/sms|api\/email|api\/whatsapp|whatsapp|sms|email/i;
const telegramAlertPreviewTitle = "Telegram Alert Preview — Mock Only";
const telegramAlertPreviewSafetyText =
  "Mock/local only. Does not send Telegram, WhatsApp, SMS, or email. Does not update booking, driver status, Supabase, notification logs, or customer/driver records.";
const telegramAlertPreviewOptions = [
  "New driver job assignment",
  "Driver acknowledgement reminder",
  "1-hour before pickup reminder",
  "OTW reminder",
  "OTS reminder",
  "POB reminder",
  "Job Completed reminder",
  "Dispatcher replacement alert",
];
const telegramBoundaryBrowserExpression = String.raw`(async () => {
  const telegramUrlPattern =
    /api\.telegram\.org|telegram\.org|(?:^|[/:.])t\.me(?:[/:?]|$)|\/telegram\b|\/api\/telegram\b|\/api\/notifications\/telegram\b|\/api\/driver-alerts\/telegram\b|getUpdates|sendMessage|\b\d{6,12}:[A-Za-z0-9_-]{30,}\b/i;
  const telegramTokenPattern = /\b\d{6,12}:[A-Za-z0-9_-]{30,}\b/g;
  const activeTelegramControlPattern =
    /\b(?:send|create|connect|enable|start|trigger|test|preview)\s+(?:telegram|driver alert)|telegram\s+(?:bot|alert|notification|send|preview|webhook|getupdates|sendmessage|control|button)/i;
  const telegramPreviewUiPattern =
    /telegram\s+alert\s+preview|telegram\s+mock(?:\/log)?(?:-only)?\s+preview|mock(?:\/log)?(?:-only)?\s+telegram\s+(?:alert\s+)?preview|telegram\s+(?:send|test|preview)\b|(?:send|test|preview)\s+telegram\b/i;
  const telegramPreviewStoragePattern =
    /Telegram Alert Preview|MOCK-JOB-042|secure job link placeholder|Mock only — no Telegram message sent|Mock\/local only\. Does not send Telegram/i;
  const telegramPreviewForbiddenControlPattern =
    /send\s*(?:telegram)?|test\s*(?:send|telegram)|telegram\s*send|sendmessage|getupdates/i;
  const controlText = (element) =>
    [
      element.textContent || "",
      element.getAttribute("aria-label") || "",
      element.getAttribute("placeholder") || "",
      element.getAttribute("name") || "",
      element.getAttribute("href") || "",
      "value" in element ? element.value || "" : "",
    ]
      .join(" ")
      .trim();
  const readStorage = (storage) => {
    const values = [];
    try {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index) || "";
        values.push(key + "=" + (storage.getItem(key) || ""));
      }
    } catch (error) {
      values.push("storage-read-error:" + (error?.message || String(error)));
    }
    return values;
  };
  const readIndexedDbNames = async () => {
    try {
      if (!globalThis.indexedDB?.databases) {
        return [];
      }

      const databases = await globalThis.indexedDB.databases();
      return databases.map((database) =>
        [database?.name || "", String(database?.version || "")].join(":"),
      );
    } catch (error) {
      return ["indexeddb-read-error:" + (error?.message || String(error))];
    }
  };
  const telegramPreviewSection = document.querySelector("[data-telegram-alert-preview]");
  const previewRect = telegramPreviewSection?.getBoundingClientRect();
  const bodyClone = document.body.cloneNode(true);
  bodyClone.querySelector("[data-telegram-alert-preview]")?.remove();
  const visibleText = bodyClone.innerText || "";
  const previewControls = telegramPreviewSection
    ? [...telegramPreviewSection.querySelectorAll("button,a,[role='button'],input,textarea,select,label")]
        .map(controlText)
        .filter(Boolean)
    : [];
  const resourceUrls = performance.getEntriesByType("resource").map((entry) => entry.name || "");
  const scriptTexts = [...document.scripts].map(
    (script) => (script.src || "") + "\n" + (script.textContent || ""),
  );
  const controls = [
    ...document.querySelectorAll("button,a,[role='button'],input,textarea,select,label"),
  ]
    .map(controlText)
    .filter(Boolean);
  const localStorageValues = readStorage(localStorage);
  const sessionStorageValues = readStorage(sessionStorage);
  const cookieValues = document.cookie
    ? document.cookie.split(";").map((value) => value.trim())
    : [];
  const indexedDbValues = await readIndexedDbNames();
  const combinedText = [
    visibleText,
    ...resourceUrls,
    ...scriptTexts,
    ...controls,
    ...localStorageValues,
    ...sessionStorageValues,
    ...cookieValues,
    ...indexedDbValues,
  ].join("\n");

  return {
    activeTelegramControls: controls.filter((value) => activeTelegramControlPattern.test(value)),
    telegramCookieLeaks: cookieValues.filter((value) => telegramUrlPattern.test(value)),
    telegramControlMentions: controls.filter((value) => /telegram/i.test(value)),
    telegramIndexedDbLeaks: indexedDbValues.filter((value) => telegramUrlPattern.test(value)),
    telegramLocalStorageLeaks: localStorageValues.filter((value) => telegramUrlPattern.test(value)),
    telegramPreviewControls: controls.filter((value) => telegramPreviewUiPattern.test(value)),
    telegramPreviewUiMentions: telegramPreviewUiPattern.test(visibleText)
      ? ["Telegram preview UI"]
      : [],
    telegramResourceUrls: resourceUrls.filter((value) => telegramUrlPattern.test(value)),
    telegramScriptLeaks: scriptTexts.filter((value) => telegramUrlPattern.test(value)),
    telegramSessionStorageLeaks: sessionStorageValues.filter((value) =>
      telegramUrlPattern.test(value),
    ),
    telegramMockPreview: {
      boundary: telegramPreviewSection?.querySelector("[data-telegram-alert-boundary]")?.textContent.trim() || "",
      feedback: telegramPreviewSection?.querySelector("[data-telegram-alert-feedback]")?.textContent.trim() || "",
      forbiddenControls: previewControls.filter((value) => telegramPreviewForbiddenControlPattern.test(value)),
      message: telegramPreviewSection?.querySelector("[data-telegram-alert-message]")?.textContent.trim() || "",
      options: telegramPreviewSection
        ? [...telegramPreviewSection.querySelectorAll("[data-telegram-alert-type] option")].map((option) =>
            option.textContent.trim(),
          )
        : [],
      selectedLabel:
        telegramPreviewSection?.querySelector("[data-telegram-alert-selected-label]")?.textContent.trim() || "",
      storageLeaks: [
        ...localStorageValues,
        ...sessionStorageValues,
        ...cookieValues,
        ...indexedDbValues,
      ].filter((value) => telegramPreviewStoragePattern.test(value)),
      title: telegramPreviewSection?.querySelector("[data-telegram-alert-title]")?.textContent.trim() || "",
      visible: Boolean(previewRect && previewRect.width > 0 && previewRect.height > 0),
    },
    telegramTokenLeaks: combinedText.match(telegramTokenPattern) || [],
    telegramVisibleMentions: /telegram/i.test(visibleText) ? ["Telegram"] : [],
  };
})()`;
const driverJobViewports = [
  { height: 667, label: "mobile 375px", mobile: true, scale: 2, width: 375 },
  { height: 900, label: "desktop 1440px", mobile: false, scale: 1, width: 1440 },
];
const driverDemoViewports = [
  { height: 568, label: "small phone 320px", mobile: true, scale: 2, width: 320 },
  { height: 667, label: "mobile 375px", mobile: true, scale: 2, width: 375 },
  { height: 915, label: "mobile 412px", mobile: true, scale: 2.625, width: 412 },
  { height: 1024, label: "tablet 768px", mobile: true, scale: 2, width: 768 },
  { height: 900, label: "desktop 1440px", mobile: false, scale: 1, width: 1440 },
];
const requiredVisibleText = [
  "Prestige Limo",
  "Booking",
  "Pricing",
  "Route Extras & Child Seat",
  "Job Card Preview",
  "Driver Dispatch",
  "Replacement Car / Driver — Mock Only",
  "Load Bookings",
  "No completed bookings loaded yet.",
  "Operations Dashboard",
  "Driver Database",
  "Save Driver Profile",
  "Rates",
  "Saved Rate Overrides",
  "Customers & Payments",
];
const forbiddenRuntimeText = [
  "formatOverrideSummary is not defined",
  "ReferenceError",
  "TypeError",
  "Unhandled Runtime Error",
];

function assertAppSmokeState(state) {
  const combinedErrors = [...state.errors, ...state.consoleErrors].join("\n");
  const combinedVisibleAndErrors = `${state.visibleText}\n${combinedErrors}`;
  const missingText = requiredVisibleText.filter((text) => !state.visibleText.includes(text));
  const forbiddenTextFound = forbiddenRuntimeText.filter((text) =>
    combinedVisibleAndErrors.includes(text),
  );

  assert.deepEqual(state.errors, [], `Expected no runtime errors:\n${state.errors.join("\n")}`);
  assert.deepEqual(
    state.consoleErrors,
    [],
    `Expected no browser console errors:\n${state.consoleErrors.join("\n")}`,
  );
  assert.deepEqual(missingText, [], `Missing visible smoke-test text: ${missingText.join(", ")}`);
  assert.deepEqual(
    forbiddenTextFound,
    [],
    `Forbidden runtime text appeared: ${forbiddenTextFound.join(", ")}`,
  );
}

async function runChromeTest() {
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), "prestige-limo-app-smoke-chrome-"));
  const chrome = spawn(
    chromeBinary,
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-extensions",
      "--no-first-run",
      "--no-default-browser-check",
      "--no-service-autorun",
      `--user-data-dir=${userDataDir}`,
      `--remote-debugging-port=${chromeDebugPort}`,
      "about:blank",
    ],
    {
      stdio: ["ignore", "ignore", "pipe"],
    },
  );

  let stderr = "";
  let client = null;
  const networkRequestUrls = [];

  chrome.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForChromeDebugPort(chromeDebugPort);

    const target = await waitForChromePageTarget(chromeDebugPort);
    client = createChromeClient(target.webSocketDebuggerUrl);
    await client.ready;

    client.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
      const description =
        exceptionDetails?.exception?.description ||
        exceptionDetails?.text ||
        "Unknown browser exception";
      browserErrors.push(description);
    });
    client.on("Runtime.consoleAPICalled", ({ type, args = [] }) => {
      if (type === "error") {
        browserConsoleErrors.push(normalizeConsoleMessages(args.map((value) => value?.value ?? value?.description ?? "")));
      }
    });
    client.on("Network.requestWillBeSent", ({ request }) => {
      const requestUrl = request?.url || "";
      if (requestUrl) {
        networkRequestUrls.push(requestUrl);
      }
    });

    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await client.send("Network.enable");

    await navigateWithLoadEvent(client, appUrl);

    const evaluate = async (expression) => {
      const result = await client.send("Runtime.evaluate", {
        awaitPromise: true,
        expression,
        returnByValue: true,
      });

      return result.result?.value;
    };

    const telegramBoundarySnapshots = [];
    const assertNoTelegramBoundaryState = (state, options = {}) => {
      const allowMockPreviewUi = Boolean(options.allowMockPreviewUi);
      assert.deepEqual(
        state.telegramNetworkRequests,
        [],
        `${state.context}: expected no Telegram network requests`,
      );
      assert.deepEqual(
        state.telegramResourceUrls,
        [],
        `${state.context}: expected no Telegram resource URLs`,
      );
      assert.deepEqual(
        state.telegramScriptLeaks,
        [],
        `${state.context}: expected no Telegram script/client bundle references`,
      );
      assert.deepEqual(
        state.telegramTokenLeaks,
        [],
        `${state.context}: expected no Telegram bot-token-looking values`,
      );
      assert.deepEqual(
        state.telegramLocalStorageLeaks,
        [],
        `${state.context}: expected no Telegram values in localStorage`,
      );
      assert.deepEqual(
        state.telegramSessionStorageLeaks,
        [],
        `${state.context}: expected no Telegram values in sessionStorage`,
      );
      assert.deepEqual(
        state.telegramCookieLeaks,
        [],
        `${state.context}: expected no Telegram values in cookies`,
      );
      assert.deepEqual(
        state.telegramIndexedDbLeaks,
        [],
        `${state.context}: expected no Telegram values in IndexedDB names`,
      );
      assert.deepEqual(
        state.telegramMockPreview.storageLeaks,
        [],
        `${state.context}: expected no Telegram preview wording persisted to browser storage`,
      );
      assert.deepEqual(
        state.telegramVisibleMentions,
        [],
        `${state.context}: expected no active Telegram UI text outside the admin mock preview`,
      );
      assert.deepEqual(
        state.telegramPreviewUiMentions,
        [],
        `${state.context}: expected no Telegram preview UI outside the admin mock preview`,
      );
      assert.deepEqual(
        state.telegramControlMentions,
        [],
        `${state.context}: expected no Telegram controls`,
      );
      assert.deepEqual(
        state.telegramPreviewControls,
        [],
        `${state.context}: expected no Telegram preview/send/test controls`,
      );
      assert.deepEqual(
        state.activeTelegramControls,
        [],
        `${state.context}: expected no Telegram send/connect/preview controls`,
      );

      if (allowMockPreviewUi) {
        assert.equal(
          state.telegramMockPreview.visible,
          true,
          `${state.context}: expected admin Telegram mock preview to be visible`,
        );
        assert.equal(
          state.telegramMockPreview.title,
          telegramAlertPreviewTitle,
          `${state.context}: expected Telegram mock preview title`,
        );
        assert.equal(
          state.telegramMockPreview.boundary,
          telegramAlertPreviewSafetyText,
          `${state.context}: expected Telegram mock/local safety wording`,
        );
        assert.deepEqual(
          state.telegramMockPreview.forbiddenControls,
          [],
          `${state.context}: expected no Telegram send/test/getUpdates/sendMessage controls`,
        );
      } else {
        assert.equal(
          state.telegramMockPreview.visible,
          false,
          `${state.context}: expected no Telegram mock preview UI`,
        );
      }
    };
    const checkTelegramBoundary = async (context, options = {}) => {
      const browserState = await evaluate(telegramBoundaryBrowserExpression);
      const state = {
        context,
        ...browserState,
        telegramNetworkRequests: networkRequestUrls.filter((url) =>
          telegramBlockedUrlPattern.test(url),
        ),
      };

      assertNoTelegramBoundaryState(state, options);
      telegramBoundarySnapshots.push({
        activeTelegramControls: state.activeTelegramControls.length,
        context,
        mockPreviewVisible: state.telegramMockPreview.visible,
        previewControls: state.telegramPreviewControls.length,
        previewMentions: state.telegramPreviewUiMentions.length,
        networkRequests: state.telegramNetworkRequests.length,
        resourceUrls: state.telegramResourceUrls.length,
        tokenLeaks: state.telegramTokenLeaks.length,
        visibleMentions: state.telegramVisibleMentions.length,
      });

      return state;
    };

    const clickTab = async (label) => {
      const clicked = await evaluate(`(() => {
        const tab = [...document.querySelectorAll("button[role='tab']")].find(
          (button) => button.textContent.trim() === ${JSON.stringify(label)},
        );

        if (!tab || tab.disabled) {
          return false;
        }

        tab.click();
        return true;
      })()`);
      assert.equal(clicked, true, `Expected ${label} tab to be clickable`);

      await waitForCondition(
        () =>
          evaluate(`(() => {
            const selectedTab = [...document.querySelectorAll("button[role='tab']")].find(
              (button) =>
                button.textContent.trim() === ${JSON.stringify(label)} &&
                button.getAttribute("aria-selected") === "true",
            );
            const expectedText = ${JSON.stringify(tabExpectedText[label] || "")};

            return Boolean(selectedTab) && (!expectedText || document.body.innerText.includes(expectedText));
          })()`),
        10000,
        `${label} tab content`,
      );
    };

    const waitForTabs = () =>
      waitForCondition(
        () =>
          evaluate(`(() => {
            const labels = [...document.querySelectorAll("button[role='tab']")].map(
              (button) => button.textContent.trim(),
            );

            return ${JSON.stringify(tabLabels)}.every((label) => labels.includes(label));
          })()`),
        10000,
        "Prestige Limo app tabs",
      );

    const setViewportAndReload = async (viewport) => {
      await client.send("Emulation.setDeviceMetricsOverride", {
        deviceScaleFactor: viewport.scale,
        height: viewport.height,
        mobile: viewport.mobile,
        width: viewport.width,
      });

      await navigateWithLoadEvent(client, appUrl);
      await waitForTabs();
    };

    const checkResponsiveTabs = async (viewport) => {
      await setViewportAndReload(viewport);

      const tabStates = [];
      for (const label of tabLabels) {
        await clickTab(label);
        const tabState = await evaluate(`(() => {
          const doc = document.documentElement;
          const nav = document.querySelector("nav[role='tablist']");
          const buttons = [...document.querySelectorAll("button[role='tab']")].map((button) => {
            const rect = button.getBoundingClientRect();

            return {
              bottom: Math.round(rect.bottom),
              height: Math.round(rect.height),
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              selected: button.getAttribute("aria-selected") === "true",
              text: button.textContent.trim(),
              top: Math.round(rect.top),
              width: Math.round(rect.width),
            };
          });
          const selected = buttons.find((button) => button.selected);
          const expectedText = ${JSON.stringify(tabExpectedText)}[${JSON.stringify(label)}] || "";

          return {
            activeTab: selected?.text || "",
            bodyScrollWidth: document.body.scrollWidth,
            docClientWidth: doc.clientWidth,
            docScrollWidth: doc.scrollWidth,
            expectedTextVisible: expectedText ? document.body.innerText.includes(expectedText) : true,
            navClientWidth: nav?.clientWidth || 0,
            navScrollWidth: nav?.scrollWidth || 0,
            tabButtons: buttons,
          };
        })()`);

        const overflowingWidth = Math.max(tabState.docScrollWidth, tabState.bodyScrollWidth);
        const offscreenTabs = tabState.tabButtons.filter(
          (button) => button.left < 0 || button.right > tabState.docClientWidth || button.width <= 0,
        );
        const smallTouchTargets = tabState.tabButtons.filter(
          (button) => button.height < 40 || button.width < 64,
        );

        assert.equal(
          overflowingWidth <= tabState.docClientWidth + 2,
          true,
          `${viewport.label} ${label}: expected no document-level horizontal overflow`,
        );
        assert.equal(
          tabState.navScrollWidth <= tabState.navClientWidth + 2,
          true,
          `${viewport.label} ${label}: expected tabs not to require horizontal scrolling`,
        );
        assert.deepEqual(
          offscreenTabs,
          [],
          `${viewport.label} ${label}: expected all tabs visible within viewport`,
        );
        assert.deepEqual(
          smallTouchTargets,
          [],
          `${viewport.label} ${label}: expected comfortable tab touch targets`,
        );
        assert.equal(tabState.activeTab, label, `${viewport.label}: expected selected tab ${label}`);
        assert.equal(
          tabState.expectedTextVisible,
          true,
          `${viewport.label} ${label}: expected tab content to be visible`,
        );

        if (label === "Dispatch") {
          const dispatchControlsVisible = await evaluate(`document.body.innerText.includes("AI Assist Parse (Mock)") &&
            document.body.innerText.includes("Create Job Card") &&
            document.body.innerText.includes("Clear Message")`);
          assert.equal(
            dispatchControlsVisible,
            true,
            `${viewport.label}: expected Dispatch tab controls visible`,
          );
        }

        await checkTelegramBoundary(`${viewport.label} ${label} admin tab`, {
          allowMockPreviewUi: label === "Dispatch",
        });

        tabStates.push({
          activeTab: tabState.activeTab,
          docClientWidth: tabState.docClientWidth,
          docScrollWidth: tabState.docScrollWidth,
          label,
          navClientWidth: tabState.navClientWidth,
          navScrollWidth: tabState.navScrollWidth,
          tabButtons: tabState.tabButtons.map((button) => ({
            height: button.height,
            text: button.text,
            width: button.width,
          })),
          viewport: viewport.label,
        });
      }

      return tabStates;
    };

    const checkAdminReplacementPlaceholder = async () => {
      await setViewportAndReload({
        height: 900,
        label: "desktop admin replacement",
        mobile: false,
        scale: 1,
        width: 1440,
      });
      await clickTab("Dispatch");
      await evaluate(`(() => {
        window.__adminReplacementIntegrationCalls = [];
        const originalFetch = window.__adminReplacementOriginalFetch || window.fetch.bind(window);
        window.__adminReplacementOriginalFetch = originalFetch;
        window.fetch = (...args) => {
          const [target, options = {}] = args;
          const method = options?.method || "GET";
          window.__adminReplacementIntegrationCalls.push(\`\${method} \${String(target)}\`);
          return originalFetch(...args);
        };

        const originalOpen = window.__adminReplacementOriginalXHROpen || window.XMLHttpRequest.prototype.open;
        window.__adminReplacementOriginalXHROpen = originalOpen;
        window.XMLHttpRequest.prototype.open = function(method, url, ...args) {
          window.__adminReplacementIntegrationCalls.push(\`\${method || "GET"} \${String(url)}\`);
          return originalOpen.call(this, method, url, ...args);
        };

        if (navigator.sendBeacon && !window.__adminReplacementOriginalSendBeacon) {
          const originalSendBeacon = navigator.sendBeacon.bind(navigator);
          window.__adminReplacementOriginalSendBeacon = originalSendBeacon;
          navigator.sendBeacon = (...args) => {
            window.__adminReplacementIntegrationCalls.push(\`BEACON \${String(args[0])}\`);
            return originalSendBeacon(...args);
          };
        }

        if (window.WebSocket && !window.__adminReplacementOriginalWebSocket) {
          const OriginalWebSocket = window.WebSocket;
          window.__adminReplacementOriginalWebSocket = OriginalWebSocket;
          window.WebSocket = function AdminReplacementWebSocket(url, protocols) {
            window.__adminReplacementIntegrationCalls.push(\`WEBSOCKET \${String(url)}\`);
            return protocols === undefined
              ? new OriginalWebSocket(url)
              : new OriginalWebSocket(url, protocols);
          };
          window.WebSocket.prototype = OriginalWebSocket.prototype;
          Object.setPrototypeOf(window.WebSocket, OriginalWebSocket);
        }
      })()`);

      const initialState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const section = document.querySelector("[data-admin-replacement-placeholder]");
            if (!section) {
              return false;
            }

            const rect = section.getBoundingClientRect();
            const fields = [...document.querySelectorAll("[data-admin-replacement-field]")].map((field) => ({
              field: field.getAttribute("data-admin-replacement-field") || "",
              label: field.closest("label")?.querySelector("span")?.textContent.trim() || "",
              type: field.getAttribute("type") || field.tagName.toLowerCase(),
              visible: field.getBoundingClientRect().height >= 40,
            }));
            const reasonOptions = [...document.querySelectorAll("[data-admin-replacement-field='reason'] option")].map(
              (option) => option.textContent.trim(),
            );
            const actions = [...document.querySelectorAll("[data-admin-replacement-action]")].map((button) => ({
              action: button.getAttribute("data-admin-replacement-action") || "",
              label: button.textContent.trim(),
              visible: button.getBoundingClientRect().height >= 40,
            }));

            return {
              boundary: document.querySelector("[data-admin-replacement-boundary]")?.textContent.trim() || "",
              docClientWidth: document.documentElement.clientWidth,
              docScrollWidth: document.documentElement.scrollWidth,
              fields,
              fileInputs: [...section.querySelectorAll("input[type='file'], input[capture], input[accept*='image'], input[accept*='photo']")]
                .map((input) => input.outerHTML),
              headingVisible: section.innerText.includes("Replacement Car / Driver — Mock Only"),
              reasonOptions,
              actions,
              visible: rect.width > 0 && rect.height > 0,
            };
          })()`),
        10000,
        "admin replacement placeholder",
      );

      assert.equal(initialState.visible, true, "Expected admin replacement placeholder to be visible");
      assert.equal(initialState.headingVisible, true, "Expected admin replacement placeholder heading");
      assert.equal(
        initialState.boundary,
        "Mock/local only. Does not update the real booking, driver assignment, dispatch, Supabase, or customer/driver notifications.",
        "Expected mock/local replacement boundary",
      );
      assert.deepEqual(
        initialState.fields.map((field) => field.label),
        [
          "Replacement driver name",
          "Replacement driver contact",
          "Replacement car plate",
          "Replacement vehicle model",
          "Reason",
          "Optional note",
        ],
        "Expected replacement placeholder fields",
      );
      assert.deepEqual(
        initialState.fields.filter((field) => !field.visible).map((field) => field.field),
        [],
        "Expected replacement placeholder fields to be touch-visible",
      );
      assert.deepEqual(
        initialState.reasonOptions,
        ["Breakdown", "Late driver", "Missed job", "Other"],
        "Expected replacement reason options",
      );
      assert.deepEqual(
        initialState.actions.map((action) => action.label),
        [
          "Save Replacement Details — Mock Only",
          "Mark Current Driver Cancelled — Mock Only",
          "Reassign Replacement Later — Future Staff Workflow",
        ],
        "Expected replacement mock actions",
      );
      assert.deepEqual(
        initialState.actions.filter((action) => !action.visible).map((action) => action.action),
        [],
        "Expected replacement mock actions to be touch-visible",
      );
      assert.deepEqual(initialState.fileInputs, [], "Expected no real file/photo upload in admin replacement placeholder");
      assert.equal(
        initialState.docScrollWidth <= initialState.docClientWidth + 2,
        true,
        "Expected admin replacement placeholder not to create horizontal overflow",
      );
      await checkTelegramBoundary("admin replacement placeholder", { allowMockPreviewUi: true });

      const fillReplacementFields = async (values) =>
        evaluate(`(() => {
        const values = ${JSON.stringify(values)};
        for (const [field, value] of Object.entries(values)) {
          const input = document.querySelector(\`[data-admin-replacement-field="\${field}"]\`);
          if (!input) {
            return { missingField: field };
          }

          const descriptor = Object.getOwnPropertyDescriptor(input.constructor.prototype, "value");
          descriptor?.set?.call(input, value);
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }

        const reason = document.querySelector("[data-admin-replacement-field='reason']");
        if (reason) {
          const descriptor = Object.getOwnPropertyDescriptor(reason.constructor.prototype, "value");
          descriptor?.set?.call(reason, "other");
          reason.dispatchEvent(new Event("input", { bubbles: true }));
          reason.dispatchEvent(new Event("change", { bubbles: true }));
        }

        return Object.fromEntries(
          Object.keys(values).map((field) => [
            field,
            document.querySelector(\`[data-admin-replacement-field="\${field}"]\`)?.value || "",
          ]),
        );
      })()`);

      const readAdminReplacementLeakState = async (sentinelValues) =>
        evaluate(`(() => {
        const sentinels = ${JSON.stringify(sentinelValues)};
        const section = document.querySelector("[data-admin-replacement-placeholder]");
        const bodyClone = document.body.cloneNode(true);
        bodyClone.querySelector("[data-admin-replacement-placeholder]")?.remove();
        const outsideText = bodyClone.innerText || "";
        const outsideControlValues = [...document.querySelectorAll("input, textarea, select")]
          .filter((control) => !section?.contains(control))
          .map((control) => control.value || control.textContent || "");
        const previewTextByTarget = {
          customerCopy: document.querySelector("[data-copy-preview='customerCopy']")?.innerText || "",
          driverDispatch: document.querySelector("[data-copy-preview='driverDispatch']")?.innerText || "",
          jobCard: document.querySelector("[data-copy-preview='jobCard']")?.innerText || "",
        };

        return {
          outsideControlValueLeaks: sentinels.filter((sentinel) =>
            outsideControlValues.some((value) => value.includes(sentinel)),
          ),
          outsideTextLeaks: sentinels.filter((sentinel) => outsideText.includes(sentinel)),
          previewLeaks: Object.fromEntries(
            Object.entries(previewTextByTarget).map(([target, text]) => [
              target,
              sentinels.filter((sentinel) => text.includes(sentinel)),
            ]),
          ),
        };
      })()`);

      const assertNoAdminReplacementLeaks = (state, description) => {
        assert.deepEqual(
          state.previewLeaks.customerCopy,
          [],
          `${description}: expected replacement sentinel values not to leak into customer copy`,
        );
        assert.deepEqual(
          state.previewLeaks.driverDispatch,
          [],
          `${description}: expected replacement sentinel values not to leak into driver dispatch copy`,
        );
        assert.deepEqual(
          state.previewLeaks.jobCard,
          [],
          `${description}: expected replacement sentinel values not to leak into WhatsApp/job-card copy`,
        );
        assert.deepEqual(
          state.outsideTextLeaks,
          [],
          `${description}: expected replacement sentinel values not to leak into visible admin page text outside the mock section`,
        );
        assert.deepEqual(
          state.outsideControlValueLeaks,
          [],
          `${description}: expected replacement sentinel values not to leak into controls outside the admin mock section`,
        );
      };

      const readReplacementPersistenceState = async (sentinelValues) =>
        evaluate(`(async () => {
        const sentinels = ${JSON.stringify(sentinelValues)};
        const matchingSentinels = (text) => {
          const value = String(text || "");
          return sentinels.filter((sentinel) => value.includes(sentinel));
        };
        const readStorageLeaks = (storage) => {
          const rows = [];
          try {
            for (let index = 0; index < storage.length; index += 1) {
              const key = storage.key(index) || "";
              rows.push(\`\${key}=\${storage.getItem(key) || ""}\`);
            }
          } catch (error) {
            rows.push(\`storage-read-error:\${error?.message || String(error)}\`);
          }
          return matchingSentinels(rows.join("\\n"));
        };
        const readIndexedDbText = (dbName) =>
          new Promise((resolve) => {
            if (!dbName || !window.indexedDB) {
              resolve("");
              return;
            }

            let settled = false;
            const finish = (value) => {
              if (!settled) {
                settled = true;
                resolve(value);
              }
            };
            const request = indexedDB.open(dbName);
            const timer = window.setTimeout(() => finish(""), 2000);

            request.onerror = () => {
              window.clearTimeout(timer);
              finish("");
            };
            request.onblocked = () => {
              window.clearTimeout(timer);
              finish("");
            };
            request.onsuccess = async () => {
              const db = request.result;
              const chunks = [];
              const readStore = (storeName) =>
                new Promise((resolveStore) => {
                  try {
                    const transaction = db.transaction(storeName, "readonly");
                    const storeRequest = transaction.objectStore(storeName).getAll();
                    storeRequest.onerror = () => resolveStore("");
                    storeRequest.onsuccess = () =>
                      resolveStore(
                        (storeRequest.result || [])
                          .map((item) => {
                            try {
                              return JSON.stringify(item) || "";
                            } catch {
                              return String(item || "");
                            }
                          })
                          .join("\\n"),
                      );
                  } catch {
                    resolveStore("");
                  }
                });

              for (const storeName of [...db.objectStoreNames]) {
                chunks.push(await readStore(storeName));
              }
              db.close();
              window.clearTimeout(timer);
              finish(chunks.join("\\n"));
            };
          });

        let indexedDbText = "";
        const indexedDbSupported = Boolean(window.indexedDB);
        try {
          const databases = typeof indexedDB.databases === "function" ? await indexedDB.databases() : [];
          for (const database of databases || []) {
            indexedDbText += await readIndexedDbText(database.name);
          }
        } catch (error) {
          indexedDbText += \`indexeddb-read-error:\${error?.message || String(error)}\`;
        }

        return {
          cookieLeaks: matchingSentinels(document.cookie || ""),
          indexedDbLeaks: matchingSentinels(indexedDbText),
          indexedDbSupported,
          localStorageLeaks: readStorageLeaks(window.localStorage),
          sessionStorageLeaks: readStorageLeaks(window.sessionStorage),
        };
      })()`);

      const assertNoReplacementPersistence = (state, description) => {
        assert.deepEqual(
          state.localStorageLeaks,
          [],
          `${description}: expected replacement sentinel values not to be written to localStorage`,
        );
        assert.deepEqual(
          state.sessionStorageLeaks,
          [],
          `${description}: expected replacement sentinel values not to be written to sessionStorage`,
        );
        assert.deepEqual(
          state.indexedDbLeaks,
          [],
          `${description}: expected replacement sentinel values not to be written to IndexedDB`,
        );
        assert.deepEqual(
          state.cookieLeaks,
          [],
          `${description}: expected replacement sentinel values not to be written to cookies`,
        );
      };

      const checkReplacementFieldsCleared = async (description) => {
        const resetState = await waitForCondition(
          () =>
            evaluate(`(() => {
              const sentinels = ${JSON.stringify(replacementAllSentinelValues)};
              const section = document.querySelector("[data-admin-replacement-placeholder]");
              if (!section) {
                return false;
              }
              const fieldValues = Object.fromEntries(
                ["driverName", "driverContact", "carPlate", "vehicleModel", "note"].map((field) => [
                  field,
                  document.querySelector(\`[data-admin-replacement-field="\${field}"]\`)?.value || "",
                ]),
              );
              const reason = document.querySelector("[data-admin-replacement-field='reason']")?.value || "";
              const allValues = [...Object.values(fieldValues), reason].join("\\n");

              return {
                fieldValues,
                reason,
                sentinelValueLeaks: sentinels.filter((sentinel) => allValues.includes(sentinel)),
              };
            })()`),
          10000,
          description,
        );

        assert.deepEqual(
          resetState.fieldValues,
          {
            carPlate: "",
            driverContact: "",
            driverName: "",
            note: "",
            vehicleModel: "",
          },
          `${description}: expected replacement mock text fields to reset`,
        );
        assert.equal(resetState.reason, "breakdown", `${description}: expected replacement reason to reset`);
        assert.deepEqual(
          resetState.sentinelValueLeaks,
          [],
          `${description}: expected replacement sentinel values to be gone`,
        );
      };

      const filledState = await fillReplacementFields(replacementLeakSentinels);
      assert.deepEqual(
        filledState,
        replacementLeakSentinels,
        "Expected replacement leak sentinel values to stay in the admin mock fields",
      );

      const clickReplacementAction = async (actionKey, expectedMessage, description) => {
        const beforeCallCount = await evaluate(`(window.__adminReplacementIntegrationCalls || []).length`);
        const clicked = await evaluate(`(() => {
          const button = document.querySelector(${JSON.stringify(`[data-admin-replacement-action="${actionKey}"]`)});
          if (!button) {
            return false;
          }

          button.click();
          return true;
        })()`);
        assert.equal(clicked, true, `Expected ${description} button to be clickable`);

        const actionState = await waitForCondition(
          () =>
            evaluate(`(() => {
              const actionKey = ${JSON.stringify(actionKey)};
              const expectedMessage = ${JSON.stringify(expectedMessage)};
              const button = document.querySelector(\`[data-admin-replacement-action="\${actionKey}"]\`);
              const message = document.querySelector(\`[data-admin-replacement-feedback="\${actionKey}"]\`);
              const buttonRect = button?.getBoundingClientRect();
              const messageRect = message?.getBoundingClientRect();

              return message?.textContent.trim() === expectedMessage
                ? {
                    callCount: (window.__adminReplacementIntegrationCalls || []).length,
                    distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                    visibleMessages: [...document.querySelectorAll("[data-admin-replacement-feedback]")]
                      .map((feedback) => feedback.getAttribute("data-admin-replacement-feedback")),
                  }
                : false;
            })()`),
          10000,
          `${description} local feedback`,
        );

        assert.equal(
          actionState.callCount,
          beforeCallCount,
          `${description}: expected no fetch, XHR, beacon, cancel, reassign, update, Supabase, or notification call`,
        );
        assert.equal(actionState.distance <= 16, true, `${description}: expected feedback near clicked control`);
        assert.deepEqual(
          actionState.visibleMessages,
          [actionKey],
          `${description}: expected only the clicked control feedback to be visible`,
        );
      };

      await clickReplacementAction(
        "save",
        "Mock replacement details saved locally only. No booking, driver assignment, dispatch, Supabase row, or notification was updated.",
        "Save Replacement Details mock action",
      );
      await clickReplacementAction(
        "cancel",
        "Mock cancellation note recorded locally only. The current driver assignment was not cancelled in any live system.",
        "Mark Current Driver Cancelled mock action",
      );
      await clickReplacementAction(
        "reassign",
        "Future staff reassign placeholder acknowledged locally only. No reassign API, dispatch update, or Supabase write was called.",
        "Reassign Replacement Later mock action",
      );

      const adminLeakState = await readAdminReplacementLeakState(replacementLeakSentinelValues);
      assertNoAdminReplacementLeaks(adminLeakState, "replacement leak sentinel values");

      const storageFilledState = await fillReplacementFields(replacementStorageSentinels);
      assert.deepEqual(
        storageFilledState,
        replacementStorageSentinels,
        "Expected replacement storage sentinel values to stay in the admin mock fields",
      );

      await clickReplacementAction(
        "save",
        "Mock replacement details saved locally only. No booking, driver assignment, dispatch, Supabase row, or notification was updated.",
        "Save Replacement Details storage-boundary mock action",
      );
      await clickReplacementAction(
        "cancel",
        "Mock cancellation note recorded locally only. The current driver assignment was not cancelled in any live system.",
        "Mark Current Driver Cancelled storage-boundary mock action",
      );
      await clickReplacementAction(
        "reassign",
        "Future staff reassign placeholder acknowledged locally only. No reassign API, dispatch update, or Supabase write was called.",
        "Reassign Replacement Later storage-boundary mock action",
      );

      const storagePersistenceState = await readReplacementPersistenceState(replacementStorageSentinelValues);
      assertNoReplacementPersistence(
        storagePersistenceState,
        "replacement storage sentinel values after mock actions",
      );

      const storageAdminLeakState = await readAdminReplacementLeakState(replacementStorageSentinelValues);
      assertNoAdminReplacementLeaks(storageAdminLeakState, "replacement storage sentinel values");

      const reloadEvent = client.once("Page.loadEventFired");
      await client.send("Page.reload", { ignoreCache: true });
      await reloadEvent;
      await waitForBodyText(
        evaluate,
        "Replacement Car / Driver — Mock Only",
        "admin replacement placeholder after reload",
      );
      await checkReplacementFieldsCleared("admin replacement mock fields after reload");
      const postReloadPersistenceState = await readReplacementPersistenceState(replacementStorageSentinelValues);
      assertNoReplacementPersistence(
        postReloadPersistenceState,
        "replacement storage sentinel values after reload",
      );

      const awayLoadEvent = client.once("Page.loadEventFired");
      await client.send("Page.navigate", { url: customerBookingUrl });
      await awayLoadEvent;
      await waitForBodyText(evaluate, "Booking Request", "replacement persistence navigation away");

      const backLoadEvent = client.once("Page.loadEventFired");
      await client.send("Page.navigate", { url: appUrl });
      await backLoadEvent;
      await waitForBodyText(
        evaluate,
        "Replacement Car / Driver — Mock Only",
        "replacement persistence navigation back",
      );
      await checkReplacementFieldsCleared("admin replacement mock fields after navigation away and back");
      const postNavigationPersistenceState = await readReplacementPersistenceState(replacementStorageSentinelValues);
      assertNoReplacementPersistence(
        postNavigationPersistenceState,
        "replacement storage sentinel values after navigation away and back",
      );

      const checkNoReplacementLeakOnRoute = async ({ expectedText, routeName, url }) => {
        await navigateWithLoadEvent(client, url);
        await waitForBodyText(evaluate, expectedText, `${routeName} leak-check route`);
        const routeState = await evaluate(`(() => {
          const sentinels = ${JSON.stringify(replacementAllSentinelValues)};
          const replacementControls = ${JSON.stringify(replacementControlLabels)};
          const text = document.body.innerText || "";
          const controlValues = [...document.querySelectorAll("input, textarea, select")]
            .map((control) => control.value || control.textContent || "");

          return {
            replacementControlText: replacementControls.filter((label) => text.includes(label)),
            replacementPlaceholderVisible: Boolean(document.querySelector("[data-admin-replacement-placeholder]")),
            sentinelControlValueLeaks: sentinels.filter((sentinel) =>
              controlValues.some((value) => value.includes(sentinel)),
            ),
            sentinelTextLeaks: sentinels.filter((sentinel) => text.includes(sentinel)),
          };
        })()`);

        assert.equal(
          routeState.replacementPlaceholderVisible,
          false,
          `${routeName}: expected no admin replacement placeholder`,
        );
        assert.deepEqual(
          routeState.replacementControlText,
          [],
          `${routeName}: expected no replacement mock controls`,
        );
        assert.deepEqual(
          routeState.sentinelTextLeaks,
          [],
          `${routeName}: expected no visible replacement sentinel leaks`,
        );
        assert.deepEqual(
          routeState.sentinelControlValueLeaks,
          [],
          `${routeName}: expected no replacement sentinel leaks in form controls`,
        );

        return routeName;
      };

      const leakProtectedRoutes = [
        await checkNoReplacementLeakOnRoute({
          expectedText: "Prestige Limo Driver Job",
          routeName: "public driver token page",
          url: driverJobWorkflowUrl,
        }),
        await checkNoReplacementLeakOnRoute({
          expectedText: "Booking Request",
          routeName: "/book",
          url: customerBookingUrl,
        }),
        await checkNoReplacementLeakOnRoute({
          expectedText: "My Bookings",
          routeName: "/my-bookings",
          url: customerPortalUrl,
        }),
      ];

      return {
        actions: initialState.actions.map((action) => action.label),
        fields: initialState.fields.map((field) => field.label),
        leakProtectedRoutes,
      };
    };

    const setCustomerViewportAndLoad = async (url, viewport) => {
      await client.send("Emulation.setDeviceMetricsOverride", {
        deviceScaleFactor: viewport.scale,
        height: viewport.height,
        mobile: viewport.mobile,
        width: viewport.width,
      });

      await navigateWithLoadEvent(client, url);
    };

    const checkAdminTelegramAlertPreview = async () => {
      const desktopViewport = { height: 900, label: "desktop admin Telegram preview", mobile: false, scale: 1, width: 1440 };

      await setCustomerViewportAndLoad(appUrl, desktopViewport);
      await waitForTabs();
      await clickTab("Dispatch");
      await waitForCondition(
        () => evaluate(`Boolean(document.querySelector("[data-telegram-alert-preview]"))`),
        10000,
        "admin Telegram mock preview",
      );

      const readPreviewState = () =>
        evaluate(`(() => {
          const section = document.querySelector("[data-telegram-alert-preview]");
          const rect = section?.getBoundingClientRect();
          const controlText = (element) =>
            [
              element.textContent || "",
              element.getAttribute("aria-label") || "",
              element.getAttribute("placeholder") || "",
              element.getAttribute("name") || "",
              element.getAttribute("href") || "",
              "value" in element ? element.value || "" : "",
            ]
              .join(" ")
              .trim();
          const controls = section
            ? [...section.querySelectorAll("button,a,[role='button'],input,textarea,select,label")]
                .map(controlText)
                .filter(Boolean)
            : [];
          const forbiddenControlPattern =
            /send\\s*(?:telegram)?|test\\s*(?:send|telegram)|telegram\\s*send|sendmessage|getupdates/i;

          return {
            boundary: section?.querySelector("[data-telegram-alert-boundary]")?.textContent.trim() || "",
            buttonLabels: [...(section?.querySelectorAll("button") || [])].map((button) =>
              button.textContent.trim(),
            ),
            feedback: section?.querySelector("[data-telegram-alert-feedback]")?.textContent.trim() || "",
            fileInputs: [...(section?.querySelectorAll("input[type='file']") || [])].map((input) =>
              input.getAttribute("name") || input.id || "file",
            ),
            forbiddenControls: controls.filter((value) => forbiddenControlPattern.test(value)),
            message: section?.querySelector("[data-telegram-alert-message]")?.textContent.trim() || "",
            options: [...(section?.querySelectorAll("[data-telegram-alert-type] option") || [])].map((option) =>
              option.textContent.trim(),
            ),
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
            selectedLabel: section?.querySelector("[data-telegram-alert-selected-label]")?.textContent.trim() || "",
            title: section?.querySelector("[data-telegram-alert-title]")?.textContent.trim() || "",
            visible: Boolean(rect && rect.width > 0 && rect.height > 0),
          };
        })()`);

      const readPreviewStorageState = () =>
        evaluate(`(async () => {
          const readStorage = (storage) => {
            const values = [];
            try {
              for (let index = 0; index < storage.length; index += 1) {
                const key = storage.key(index) || "";
                values.push(key + "=" + (storage.getItem(key) || ""));
              }
            } catch (error) {
              values.push("storage-read-error:" + (error?.message || String(error)));
            }
            return values;
          };
          const readIndexedDbNames = async () => {
            try {
              if (!globalThis.indexedDB?.databases) {
                return [];
              }

              const databases = await globalThis.indexedDB.databases();
              return databases.map((database) =>
                [database?.name || "", String(database?.version || "")].join(":"),
              );
            } catch (error) {
              return ["indexeddb-read-error:" + (error?.message || String(error))];
            }
          };
          const values = [
            ...readStorage(localStorage),
            ...readStorage(sessionStorage),
            ...(document.cookie ? document.cookie.split(";").map((value) => value.trim()) : []),
            ...(await readIndexedDbNames()),
          ];
          const previewPattern =
            /Telegram Alert Preview|MOCK-JOB-042|secure job link placeholder|Mock only — no Telegram message sent/i;

          return {
            cookieLeaks: (document.cookie ? document.cookie.split(";").map((value) => value.trim()) : []).filter(
              (value) => previewPattern.test(value),
            ),
            indexedDbLeaks: (await readIndexedDbNames()).filter((value) => previewPattern.test(value)),
            localStorageLeaks: readStorage(localStorage).filter((value) => previewPattern.test(value)),
            sessionStorageLeaks: readStorage(sessionStorage).filter((value) => previewPattern.test(value)),
            storageLeaks: values.filter((value) => previewPattern.test(value)),
          };
        })()`);
      const installPreviewNetworkGuard = () =>
        evaluate(`(() => {
          window.__telegramPreviewIntegrationCalls = [];

          const record = (kind, method, target) => {
            window.__telegramPreviewIntegrationCalls.push(
              [kind, method || "", String(target || "")].filter(Boolean).join(" "),
            );
          };

          if (!window.__telegramPreviewOriginalFetch) {
            window.__telegramPreviewOriginalFetch = window.fetch.bind(window);
            window.fetch = (...args) => {
              const request = args[0];
              const method = args[1]?.method || request?.method || "GET";
              const target = typeof request === "string" ? request : request?.url || request;
              record("FETCH", method, target);
              return window.__telegramPreviewOriginalFetch(...args);
            };
          }

          if (!window.__telegramPreviewOriginalXHROpen) {
            window.__telegramPreviewOriginalXHROpen = window.XMLHttpRequest.prototype.open;
            window.XMLHttpRequest.prototype.open = function patchedTelegramPreviewOpen(method, url, ...rest) {
              record("XHR", method || "GET", url);
              return window.__telegramPreviewOriginalXHROpen.call(this, method, url, ...rest);
            };
          }

          if (navigator.sendBeacon && !window.__telegramPreviewOriginalSendBeacon) {
            window.__telegramPreviewOriginalSendBeacon = navigator.sendBeacon.bind(navigator);
            navigator.sendBeacon = (...args) => {
              record("BEACON", "POST", args[0]);
              return window.__telegramPreviewOriginalSendBeacon(...args);
            };
          }

          if (window.WebSocket && !window.__telegramPreviewOriginalWebSocket) {
            const OriginalWebSocket = window.WebSocket;
            window.__telegramPreviewOriginalWebSocket = OriginalWebSocket;
            window.WebSocket = function TelegramPreviewWebSocket(url, protocols) {
              record("WEBSOCKET", "OPEN", url);
              return protocols === undefined
                ? new OriginalWebSocket(url)
                : new OriginalWebSocket(url, protocols);
            };
            window.WebSocket.prototype = OriginalWebSocket.prototype;
            Object.setPrototypeOf(window.WebSocket, OriginalWebSocket);
          }

          return true;
        })()`);
      const readPreviewNetworkState = () =>
        evaluate(`(() => {
          const blockedPattern =
            /api\\.telegram\\.org|telegram\\.org|(?:^|[/:.])t\\.me(?:[/:?]|$)|\\/telegram\\b|\\/api\\/telegram\\b|\\/api\\/notifications(?:\\/|$)|\\/api\\/driver-alerts(?:\\/|$)|notification[-_/ ]?logs?|getUpdates|sendMessage|\\/rest\\/v1\\/|supabase\\.co|\\/storage\\/v1\\/|twilio|sendgrid|mailgun|postmark|api\\/sms|api\\/email|api\\/whatsapp|whatsapp|sms|email/i;
          const calls = window.__telegramPreviewIntegrationCalls || [];

          return {
            blockedCalls: calls.filter((call) => blockedPattern.test(call)),
            calls,
          };
        })()`);
      const assertNoPreviewStorage = async (description) => {
        const storageState = await readPreviewStorageState();

        assert.deepEqual(
          storageState.localStorageLeaks,
          [],
          `${description}: expected Telegram mock preview content not to persist in localStorage`,
        );
        assert.deepEqual(
          storageState.sessionStorageLeaks,
          [],
          `${description}: expected Telegram mock preview content not to persist in sessionStorage`,
        );
        assert.deepEqual(
          storageState.indexedDbLeaks,
          [],
          `${description}: expected Telegram mock preview content not to persist in IndexedDB names`,
        );
        assert.deepEqual(
          storageState.cookieLeaks,
          [],
          `${description}: expected Telegram mock preview content not to persist in cookies`,
        );
        assert.deepEqual(
          storageState.storageLeaks,
          [],
          `${description}: expected Telegram mock preview content not to persist in browser storage`,
        );

        return storageState;
      };
      const assertNoPreviewIntegrationCalls = async (description) => {
        const networkState = await readPreviewNetworkState();

        assert.deepEqual(
          networkState.calls,
          [],
          `${description}: expected Telegram mock preview not to call fetch, XHR, sendBeacon, or WebSocket`,
        );
        assert.deepEqual(
          networkState.blockedCalls,
          [],
          `${description}: expected no Telegram, notification, driver-alert, Supabase, or provider calls`,
        );

        return networkState;
      };

      const initialState = await readPreviewState();
      assert.equal(initialState.visible, true, "Expected admin Telegram mock preview to be visible");
      assert.equal(initialState.title, telegramAlertPreviewTitle, "Expected Telegram mock preview title");
      assert.equal(
        initialState.boundary,
        telegramAlertPreviewSafetyText,
        "Expected Telegram mock/local safety wording",
      );
      assert.deepEqual(
        initialState.options,
        telegramAlertPreviewOptions,
        "Expected Telegram mock preview alert type options",
      );
      assert.deepEqual(
        initialState.buttonLabels,
        ["Generate Mock Preview"],
        "Expected only the local mock preview action",
      );
      assert.deepEqual(
        initialState.forbiddenControls,
        [],
        "Expected no Telegram send/test/getUpdates/sendMessage controls in admin preview",
      );
      assert.deepEqual(initialState.fileInputs, [], "Expected no file upload in Telegram mock preview");
      assert.equal(initialState.overflow, false, "Expected Telegram mock preview not to create horizontal overflow");
      assert.equal(initialState.message.includes("MOCK-JOB-042"), true, "Expected mock job reference in preview");
      assert.equal(
        initialState.message.includes("[secure job link placeholder]"),
        true,
        "Expected secure job link placeholder in preview",
      );
      assert.equal(initialState.message.includes("Payout"), false, "Expected no payout/pricing in preview");
      await checkTelegramBoundary("admin Telegram alert preview initial", {
        allowMockPreviewUi: true,
      });
      const previewBrowserRequestStartIndex = networkRequestUrls.length;
      const assertNoPreviewBrowserRequests = (description) => {
        const blockedRequests = networkRequestUrls
          .slice(previewBrowserRequestStartIndex)
          .filter((url) => telegramPreviewBlockedCallPattern.test(url));

        assert.deepEqual(
          blockedRequests,
          [],
          `${description}: expected no Telegram, notification, driver-alert, Supabase, or provider browser requests`,
        );
      };

      await installPreviewNetworkGuard();
      await assertNoPreviewStorage("initial Telegram mock preview");
      await assertNoPreviewIntegrationCalls("initial Telegram mock preview");

      const previewTypeChecks = [
        { label: "Driver acknowledgement reminder", messageText: "acknowledge", value: "acknowledgement" },
        { label: "1-hour before pickup reminder", messageText: "1 hour", value: "one-hour" },
        { label: "OTW reminder", messageText: "OTW", value: "otw" },
        { label: "OTS reminder", messageText: "OTS", value: "ots" },
        { label: "POB reminder", messageText: "POB", value: "pob" },
        { label: "Job Completed reminder", messageText: "Job Completed", value: "completed" },
        { label: "Dispatcher replacement alert", messageText: "replacement", value: "replacement" },
      ];

      let updatedState = initialState;
      for (const previewType of previewTypeChecks) {
        await evaluate(`(() => {
          const select = document.querySelector("[data-telegram-alert-type]");
          if (!select) {
            return false;
          }

          select.value = ${JSON.stringify(previewType.value)};
          select.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        })()`);
        await waitForCondition(
          () =>
            evaluate(
              `document.querySelector("[data-telegram-alert-selected-label]")?.textContent.trim() === ${JSON.stringify(previewType.label)}`,
            ),
          10000,
          `Telegram mock preview type change: ${previewType.label}`,
        );
        updatedState = await readPreviewState();
        assert.equal(
          updatedState.selectedLabel,
          previewType.label,
          `Expected selected Telegram preview type to update to ${previewType.label}`,
        );
        assert.equal(
          updatedState.message.includes(previewType.messageText),
          true,
          `Expected ${previewType.label} preview wording`,
        );
        assert.equal(
          updatedState.message.includes("MOCK-JOB-042"),
          true,
          `Expected ${previewType.label} to keep mock job reference`,
        );
        assert.equal(
          updatedState.message.includes("[secure job link placeholder]"),
          true,
          `Expected ${previewType.label} to keep secure job link placeholder`,
        );
        assert.equal(updatedState.message.includes("Payout"), false, "Expected no payout/pricing in preview");
        assert.equal(updatedState.feedback, "", "Expected type changes to keep feedback local and reset");
        await assertNoPreviewStorage(`Telegram mock preview type ${previewType.label}`);
        await assertNoPreviewIntegrationCalls(`Telegram mock preview type ${previewType.label}`);
        assertNoPreviewBrowserRequests(`Telegram mock preview type ${previewType.label}`);
      }

      await evaluate(`document.querySelector("[data-telegram-alert-generate]")?.click()`);
      const feedback = await waitForCondition(
        () => evaluate(`document.querySelector("[data-telegram-alert-feedback]")?.textContent.trim() || ""`),
        10000,
        "Telegram mock preview local feedback",
      );
      assert.equal(
        feedback,
        "Mock only — no Telegram message sent.",
        "Expected local-only Telegram mock preview feedback",
      );
      const postGenerateState = await readPreviewState();
      assert.deepEqual(
        postGenerateState.forbiddenControls,
        [],
        "Expected no Telegram send/test/getUpdates/sendMessage controls after generate",
      );
      await assertNoPreviewStorage("Telegram mock preview after generate");
      await assertNoPreviewIntegrationCalls("Telegram mock preview after generate");
      assertNoPreviewBrowserRequests("Telegram mock preview after generate");
      await checkTelegramBoundary("admin Telegram alert preview after generate", {
        allowMockPreviewUi: true,
      });

      const reloadEvent = client.once("Page.loadEventFired");
      await client.send("Page.reload", { ignoreCache: true });
      await reloadEvent;
      await waitForTabs();
      await clickTab("Dispatch");
      await waitForCondition(
        () => evaluate(`Boolean(document.querySelector("[data-telegram-alert-preview]"))`),
        10000,
        "admin Telegram mock preview after reload",
      );
      const postReloadState = await readPreviewState();
      assert.equal(
        postReloadState.selectedLabel,
        "New driver job assignment",
        "Expected Telegram mock preview selected type to reset after reload",
      );
      assert.equal(postReloadState.feedback, "", "Expected Telegram mock preview feedback to reset after reload");
      await assertNoPreviewStorage("Telegram mock preview after reload");
      assertNoPreviewBrowserRequests("Telegram mock preview after reload");
      await checkTelegramBoundary("admin Telegram alert preview after reload", {
        allowMockPreviewUi: true,
      });

      await setCustomerViewportAndLoad(customerBookingUrl, desktopViewport);
      await checkTelegramBoundary("Telegram mock preview persistence check /book navigation");
      await setCustomerViewportAndLoad(appUrl, desktopViewport);
      await waitForTabs();
      await clickTab("Dispatch");
      await waitForCondition(
        () => evaluate(`Boolean(document.querySelector("[data-telegram-alert-preview]"))`),
        10000,
        "admin Telegram mock preview after navigation away and back",
      );
      const postNavigationState = await readPreviewState();
      assert.equal(
        postNavigationState.selectedLabel,
        "New driver job assignment",
        "Expected Telegram mock preview selected type to reset after navigation away and back",
      );
      assert.equal(
        postNavigationState.feedback,
        "",
        "Expected Telegram mock preview feedback to reset after navigation away and back",
      );
      await assertNoPreviewStorage("Telegram mock preview after navigation away and back");
      assertNoPreviewBrowserRequests("Telegram mock preview after navigation away and back");
      await checkTelegramBoundary("admin Telegram alert preview after navigation away and back", {
        allowMockPreviewUi: true,
      });

      return {
        actions: postGenerateState.buttonLabels,
        boundary: postGenerateState.boundary,
        feedback,
        options: postGenerateState.options,
        persistence: {
          blockedBrowserRequests: networkRequestUrls
            .slice(previewBrowserRequestStartIndex)
            .filter((url) => telegramPreviewBlockedCallPattern.test(url)).length,
          postNavigationFeedback: postNavigationState.feedback,
          postNavigationSelectedLabel: postNavigationState.selectedLabel,
          postReloadFeedback: postReloadState.feedback,
          postReloadSelectedLabel: postReloadState.selectedLabel,
        },
        selectedLabel: postGenerateState.selectedLabel,
        title: postGenerateState.title,
      };
    };

    const blockedCustomerIntegrationPattern =
      /stripe|hitpay|paypal|paynow|api\/payment|api\/bank|api\/email|api\/sms|api\/calendar|calendar|googleapis|maps\.google|maps\.gstatic|api\/maps|api\/google|openai|chatgpt|api\/openai|api\/ai-parse|graph\.microsoft|outlook|ical|ics|webhook|notification|whatsapp|email|sms|telegram|api\.telegram\.org|getUpdates|sendMessage|supabase|\/rest\/v1\//i;
    const blockedDriverJobIntegrationPattern =
      /supabase|\/rest\/v1\/|api\/live-location|api\/driver-live-location|api\/driver-ots-photo|api\/photo-proof|api\/upload|api\/storage|api\/file|api\/driver-upload|api\/driver-file|api\/driver-exception|api\/driver-replacement|api\/driver-reassign|api\/driver-assignment|api\/driver-cancel|api\/cancel-driver|api\/reassign-driver|api\/flight|api\/reminder|api\/notification|api\/notify|api\/sms|api\/whatsapp|api\/email|api\/telegram|api\/driver-alerts\/telegram|api\/notifications\/telegram|api\/calendar|api\/payment|api\/bank|api\/invoice|api\/pdf|api\/statement|twilio|sendgrid|mailgun|postmark|telegram|api\.telegram\.org|getUpdates|sendMessage|stripe|hitpay|paypal|paynow|googleapis|maps\.google|maps\.gstatic/i;

    const assertNoPaymentIntegrationResources = (resourceCalls, context) => {
      assert.deepEqual(
        resourceCalls.filter((url) => blockedCustomerIntegrationPattern.test(url)),
        [],
        `${context}: expected no payment provider, bank API, calendar API, webhook, notification, WhatsApp, email, SMS, or Supabase resources`,
      );
    };

    const checkCustomerPaymentsRoute = async () => {
      const desktopViewport = { height: 900, label: "desktop customer dashboard", mobile: false, scale: 1, width: 1440 };
      const mobileViewport = { height: 667, label: "mobile customer dashboard", mobile: true, scale: 2, width: 375 };

      await setCustomerViewportAndLoad(appUrl, desktopViewport);
      await waitForTabs();
      const entryPointState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const entry = document.querySelector("[data-customers-payments-entry]");
            if (!entry) {
              return false;
            }

            const rect = entry.getBoundingClientRect();
            return {
              href: entry.getAttribute("href"),
              text: entry.textContent.trim(),
              visible: rect.width > 0 && rect.height >= 40,
            };
          })()`),
        10000,
        "Customers & Payments entry point",
      );
      assert.deepEqual(
        entryPointState,
        { href: "/customers", text: "Customers & Payments", visible: true },
        "Expected a visible Customers & Payments entry point to /customers",
      );

      const entryClicked = await evaluate(`(() => {
        const entry = document.querySelector("[data-customers-payments-entry]");
        if (!entry) {
          return false;
        }

        entry.click();
        return true;
      })()`);
      assert.equal(entryClicked, true, "Expected Customers & Payments entry point to be clickable");
      await waitForCondition(
        () =>
          evaluate(`location.pathname === "/customers" &&
            document.body.innerText.includes("Mock customer payments dashboard")`),
        10000,
        "Customers & Payments entry navigation",
      );

      await setCustomerViewportAndLoad(customerDashboardUrl, desktopViewport);
      await waitForBodyText(
        evaluate,
        "Mock customer payments dashboard",
        "mock customer dashboard route",
      );

      const dashboardState = await evaluate(`(() => {
        const text = document.body.innerText;
        const searchInput = document.querySelector("[data-customer-search]");
        const searchRect = searchInput?.getBoundingClientRect();
        const internalStaffNotice = document.querySelector("[data-customer-internal-staff-notice]");
        const internalStaffNoticeRect = internalStaffNotice?.getBoundingClientRect();
        return {
          customerInternalStaffNotice: internalStaffNotice?.textContent.trim() || "",
          customerInternalStaffNoticeVisible: Boolean(
            internalStaffNoticeRect && internalStaffNoticeRect.width > 0 && internalStaffNoticeRect.height > 0,
          ),
          customerRows: [...document.querySelectorAll("[data-customer-row]")].map((row) =>
            row.getAttribute("data-customer-row"),
          ),
          forbiddenText: ["driver payout", "private crm", "stripe", "hitpay", "paypal", "secret key"].filter(
            (value) => text.toLowerCase().includes(value),
          ),
          helperVisible: Boolean(document.querySelector("[data-customer-search-helper]")),
          links: [...document.querySelectorAll("[data-open-customer-folder]")].map((link) => link.getAttribute("href")),
          outstandingPaidInvoiceMentions: ["UBS-0002", "RITZ-0002", "VIP-0002"].filter((invoiceNumber) =>
            document.querySelector("[data-outstanding-payments-review]")?.innerText.includes(invoiceNumber),
          ),
          outstandingReviewBoundary:
            document.querySelector("[data-outstanding-review-boundary]")?.textContent.trim() || "",
          outstandingReviewFilterLabels: [
            ...document.querySelectorAll("[data-outstanding-review-filter]"),
          ].map((button) => button.textContent.trim()),
          outstandingReviewNoResultsVisible: Boolean(
            document.querySelector("[data-outstanding-payments-no-results]"),
          ),
          outstandingReviewPageSizeOptions: [
            ...document.querySelectorAll("[data-outstanding-review-page-size] option"),
          ].map((option) => option.textContent.trim()),
          outstandingReviewPreviousDisabled: Boolean(
            document.querySelector("[data-outstanding-review-previous]")?.disabled,
          ),
          outstandingReviewNextDisabled: Boolean(
            document.querySelector("[data-outstanding-review-next]")?.disabled,
          ),
          outstandingReviewSearchVisible: (() => {
            const input = document.querySelector("[data-outstanding-review-search]");
            const rect = input?.getBoundingClientRect();
            return Boolean(rect && rect.width > 0 && rect.height >= 40);
          })(),
          outstandingReviewShowing:
            document.querySelector("[data-outstanding-review-showing]")?.textContent.trim() || "",
          outstandingReviewSortOptions: [
            ...document.querySelectorAll("[data-outstanding-review-sort] option"),
          ].map((option) => option.textContent.trim()),
          outstandingReviewSummaryCards: [
            ...document.querySelectorAll("[data-outstanding-review-summary-card]"),
          ].map((card) => ({
            label: card.getAttribute("data-outstanding-review-summary-card") || "",
            text: card.textContent.trim(),
          })),
          outstandingRows: [...document.querySelectorAll("[data-outstanding-payment-row]")].map((row) => ({
            actions: [...row.querySelectorAll("[data-payment-action]")].map((button) => button.textContent.trim()),
            detailButtons: [...row.querySelectorAll("[data-outstanding-review-detail-toggle]")].map((button) =>
              button.textContent.trim(),
            ),
            href: row.querySelector("[data-outstanding-open-customer-folder]")?.getAttribute("href") || "",
            id: row.getAttribute("data-outstanding-payment-row"),
            text: row.innerText,
          })),
          collectionFollowUpBoundary:
            document.querySelector("[data-collection-follow-up-boundary]")?.textContent.trim() || "",
          collectionFollowUpNoSendBoundary:
            document.querySelector("[data-collection-follow-up-no-send-boundary]")?.textContent.trim() || "",
          collectionFollowUpRows: [...document.querySelectorAll("[data-collection-follow-up-row]")].map((row) => ({
            actions: [...row.querySelectorAll("[data-follow-up-action]")].map((button) => button.textContent.trim()),
            href: row.querySelector("[data-follow-up-open-customer-folder]")?.getAttribute("href") || "",
            id: row.getAttribute("data-collection-follow-up-row"),
            text: row.innerText,
          })),
          collectionFollowUpPaidInvoiceMentions: ["UBS-0002", "RITZ-0002", "VIP-0002"].filter((invoiceNumber) =>
            document.querySelector("[data-collection-follow-up-queue]")?.innerText.includes(invoiceNumber),
          ),
          monthlyStatementBoundary:
            document.querySelector("[data-monthly-statement-boundary]")?.textContent.trim() || "",
          monthlyStatementGroups: [...document.querySelectorAll("[data-monthly-statement-group]")].map((group) => ({
            action: group.querySelector("[data-statement-preview-action]")?.textContent.trim() || "",
            href: group.querySelector("[data-monthly-statement-open-customer-folder]")?.getAttribute("href") || "",
            id: group.getAttribute("data-monthly-statement-group"),
            rows: [...group.querySelectorAll("[data-monthly-statement-row]")].map((row) =>
              row.getAttribute("data-monthly-statement-row"),
            ),
            text: group.innerText,
            total: group.querySelector("[data-monthly-statement-total]")?.textContent.trim() || "",
          })),
          monthlyStatementNoNumberBoundary:
            document.querySelector("[data-monthly-statement-no-number-boundary]")?.textContent.trim() || "",
          monthlyStatementPaidInvoiceMentions: ["UBS-0002", "RITZ-0002", "VIP-0002"].filter((invoiceNumber) =>
            document.querySelector("[data-monthly-statement-preview]")?.innerText.includes(invoiceNumber),
          ),
          eventLogBoundary:
            document.querySelector("[data-mock-payment-event-log-boundary]")?.textContent.trim() || "",
          eventLogText: document.querySelector("[data-mock-payment-event-log]")?.innerText || "",
          followUpEventLogBoundary:
            document.querySelector("[data-mock-follow-up-event-log-boundary]")?.textContent.trim() || "",
          followUpEventLogText: document.querySelector("[data-mock-follow-up-event-log]")?.innerText || "",
          followUpSectionFeedback:
            document.querySelector("[data-follow-up-section-feedback]")?.textContent.trim() || "",
          paymentSectionFeedback:
            document.querySelector("[data-payment-section-feedback]")?.textContent.trim() || "",
          statementPreviewLogBoundary:
            document.querySelector("[data-mock-statement-preview-log-boundary]")?.textContent.trim() || "",
          statementPreviewLogText: document.querySelector("[data-mock-statement-preview-log]")?.innerText || "",
          resourceCalls: performance.getEntriesByType("resource").map((entry) => entry.name),
          regularBookingBoundary:
            document.querySelector("[data-regular-customer-booking-boundary]")?.textContent.trim() || "",
          regularBookingEmptyPreview: Boolean(
            document.querySelector("[data-regular-customer-booking-empty-preview]"),
          ),
          regularBookingFeedback:
            document.querySelector("[data-regular-customer-booking-feedback]")?.textContent.trim() || "",
          regularBookingFeedbackTone:
            document.querySelector("[data-regular-customer-booking-feedback]")?.getAttribute(
              "data-regular-customer-booking-feedback-tone",
            ) || "",
          regularMockSaveBoundary:
            document.querySelector("[data-regular-customer-mock-save-boundary]")?.textContent.trim() || "",
          regularMockSaveButtonText:
            document.querySelector("[data-regular-customer-mock-save]")?.textContent.trim() || "",
          regularMockSaveFeedback:
            document.querySelector("[data-regular-customer-mock-save-feedback]")?.textContent.trim() || "",
          regularMockSaveFeedbackTone:
            document.querySelector("[data-regular-customer-mock-save-feedback]")?.getAttribute(
              "data-regular-customer-mock-save-feedback-tone",
            ) || "",
          regularMockSaveReviewVisible: Boolean(
            document.querySelector("[data-regular-customer-mock-save-review]"),
          ),
          regularMockSaveVisible: (() => {
            const button = document.querySelector("[data-regular-customer-mock-save]");
            const rect = button?.getBoundingClientRect();
            return Boolean(rect && rect.width > 0 && rect.height >= 40);
          })(),
          regularSavedVisibilityBoundary:
            document.querySelector("[data-regular-customer-saved-visibility-boundary]")?.textContent.trim() || "",
          regularSavedVisibilityButtons: [
            ...document.querySelectorAll("[data-regular-customer-saved-visibility-section] button"),
          ].map((button) => button.textContent.trim()),
          regularSavedVisibilityHeading:
            document.querySelector("[data-regular-customer-saved-visibility-heading]")?.textContent.trim() || "",
          regularSavedVisibilityLocalRowNote:
            document.querySelector("[data-regular-customer-saved-visibility-local-row-note]")?.textContent.trim() ||
            "",
          regularSavedVisibilityNotes: [
            ...document.querySelectorAll("[data-regular-customer-saved-visibility-note]"),
          ].map((note) => ({
            label: note.getAttribute("data-regular-customer-saved-visibility-note") || "",
            text: note.textContent.trim(),
          })),
          regularSavedVisibilityText:
            document.querySelector("[data-regular-customer-saved-visibility-section]")?.innerText || "",
          regularSavedVisibilityVisible: Boolean(
            document.querySelector("[data-regular-customer-saved-visibility-section]"),
          ),
          regularBookingFields: [
            "customerId",
            "booker",
            "passengerName",
            "pickupDate",
            "pickupTime",
            "pickupLocation",
            "dropoffLocation",
            "flightNumber",
            "routeType",
            "vehicleType",
            "passengerCount",
            "luggage",
            "extraStops",
            "customerReference",
            "internalNote",
          ].map((field) => {
            const input = document.querySelector("[data-regular-booking-field='" + field + "']");
            const rect = input?.getBoundingClientRect();

            return {
              field,
              placeholder: input?.getAttribute("placeholder") || "",
              value: input?.value || "",
              visible: Boolean(rect && rect.width > 0 && rect.height >= 40),
            };
          }),
          regularBookingFolderLinkVisible: Boolean(
            document.querySelector("[data-regular-customer-folder-link]"),
          ),
          regularBookingFormText:
            document.querySelector("[data-regular-customer-booking-form]")?.innerText || "",
          regularBookingFormVisible: Boolean(document.querySelector("[data-regular-customer-booking-form]")),
          regularBookingListBoundary:
            document.querySelector("[data-regular-customer-booking-list-boundary]")?.textContent.trim() || "",
          regularBookingListEmpty: Boolean(document.querySelector("[data-regular-customer-booking-list-empty]")),
          regularBookingListRows: [...document.querySelectorAll("[data-regular-customer-booking-list-row]")].map(
            (row) => ({
              folderLink:
                row.querySelector("[data-regular-customer-booking-list-folder-link]")?.getAttribute("href") || "",
              id: row.getAttribute("data-regular-customer-booking-list-row"),
              noSaveBoundary:
                row.querySelector("[data-regular-customer-booking-list-no-save-boundary]")?.textContent.trim() || "",
              text: row.innerText,
            }),
          ),
          regularBookingListFilterControls: [
            ...document.querySelectorAll("[data-regular-customer-booking-list-filter]"),
          ].map((control) => {
            const rect = control.getBoundingClientRect();

            return {
              field: control.getAttribute("data-regular-customer-booking-list-filter") || "",
              label: control.closest("label")?.textContent.trim() || "",
              value: control.value || "",
              visible: rect.width > 0 && rect.height >= 40,
            };
          }),
          regularBookingListFilterCount:
            document.querySelector("[data-regular-customer-booking-list-filter-count]")?.textContent.trim() || "",
          regularBookingListFilterFeedback:
            document.querySelector("[data-regular-customer-booking-list-filter-feedback]")?.textContent.trim() || "",
          regularBookingListFiltersVisible: Boolean(
            document.querySelector("[data-regular-customer-booking-list-filters]"),
          ),
          regularBookingListClearFiltersVisible: Boolean(
            document.querySelector("[data-regular-customer-booking-list-clear-filters]"),
          ),
          regularBookingListVisible: Boolean(
            document.querySelector("[data-regular-customer-booking-list-preview]"),
          ),
          regularDraftInvoiceBoundary:
            document.querySelector("[data-regular-customer-draft-invoice-boundary]")?.textContent.trim() || "",
          regularDraftInvoiceCreateVisible: (() => {
            const button = document.querySelector("[data-regular-customer-draft-invoice-create]");
            const rect = button?.getBoundingClientRect();
            return Boolean(rect && rect.width > 0 && rect.height >= 40);
          })(),
          regularDraftInvoiceClearVisible: Boolean(
            document.querySelector("[data-regular-customer-draft-invoice-clear]"),
          ),
          regularDraftInvoiceEmpty: Boolean(document.querySelector("[data-regular-customer-draft-invoice-empty]")),
          regularDraftInvoiceEmptyText:
            document.querySelector("[data-regular-customer-draft-invoice-empty]")?.textContent.trim() || "",
          regularDraftInvoiceFeedback:
            document.querySelector("[data-regular-customer-draft-invoice-feedback]")?.textContent.trim() || "",
          regularDraftInvoiceFeedbackTone:
            document.querySelector("[data-regular-customer-draft-invoice-feedback]")?.getAttribute(
              "data-regular-customer-draft-invoice-feedback-tone",
            ) || "",
          regularDraftInvoicePreviewVisible: Boolean(
            document.querySelector("[data-regular-customer-draft-invoice-preview]"),
          ),
          regularDraftInvoiceSectionVisible: Boolean(
            document.querySelector("[data-regular-customer-draft-invoice-section]"),
          ),
          regularBookingLabels: [
            "Customer / account",
            "Booker / contact person",
            "Passenger name",
            "Pickup date",
            "Pickup time",
            "Pickup location",
            "Drop-off location",
            "Flight number if any",
            "Type of Service",
            "Vehicle type",
            "Number of passengers",
            "Luggage",
            "Extra stops",
            "Customer reference / PO number if any",
            "Internal note",
          ].filter((label) => text.includes(label)),
          regularBookingRequiredFieldCount: document.querySelectorAll("[data-regular-booking-required='true']").length,
          regularBookingRequiredNote:
            document.querySelector("[data-regular-customer-required-note]")?.textContent.trim() || "",
          regularBookingRemovedFieldSelectors: ["billingMonth", "billingStatus", "paymentMethod"].filter((field) =>
            document.querySelector("[data-regular-booking-field='" + field + "']"),
          ),
          regularBookingRouteOptionLabels: [
            ...document.querySelectorAll("[data-regular-booking-field='routeType'] option"),
          ].map((option) => option.textContent.trim()),
          regularBookingRouteOptionValues: [
            ...document.querySelectorAll("[data-regular-booking-field='routeType'] option"),
          ].map((option) => option.value),
          regularBookingSubmitVisible: Boolean(
            document.querySelector("[data-regular-customer-booking-submit]"),
          ),
          regularBookingVehicleOptionLabels: [
            ...document.querySelectorAll("[data-regular-booking-field='vehicleType'] option"),
          ].map((option) => option.textContent.trim()),
          regularBookingVehicleOptionValues: [
            ...document.querySelectorAll("[data-regular-booking-field='vehicleType'] option"),
          ].map((option) => option.value),
          regularMapSuggestSeparateSectionVisible: Boolean(
            document.querySelector("[data-regular-customer-map-suggest-helper]"),
          ),
          regularMapSuggestHint:
            document.querySelector("[data-regular-customer-map-suggest-hint]")?.textContent.trim() || "",
          regularMiniParserBoundary:
            document.querySelector("[data-regular-customer-mini-parser-boundary]")?.textContent.trim() || "",
          regularMiniParserFeedback:
            document.querySelector("[data-regular-customer-mini-parser-feedback]")?.textContent.trim() || "",
          regularMiniParserHeading:
            document.querySelector("[data-regular-customer-mini-parser-heading]")?.textContent.trim() || "",
          regularMiniParserVisible: Boolean(
            document.querySelector("[data-regular-customer-mini-parser-helper]"),
          ),
          searchInputVisible: Boolean(searchInput && searchRect.width > 0 && searchRect.height >= 40),
          summaryCards: [...document.querySelectorAll("[data-customer-summary-card]")].map((card) =>
            card.getAttribute("data-customer-summary-card"),
          ),
          text,
        };
      })()`);

      assert.deepEqual(
        dashboardState.summaryCards,
        ["Total Outstanding", "Overdue", "Paid This Month", "Follow-ups Today"],
        "Expected customer dashboard summary cards",
      );
      assert.deepEqual(dashboardState.customerRows, [], "Expected no customer rows before search");
      assert.deepEqual(dashboardState.links, [], "Expected no customer folder links before search");
      assert.equal(dashboardState.helperVisible, true, "Expected search helper before results");
      assert.equal(dashboardState.searchInputVisible, true, "Expected visible customer search input");
      assert.deepEqual(dashboardState.forbiddenText, [], "Expected no sensitive customer payment text");
      assert.equal(
        dashboardState.customerInternalStaffNoticeVisible,
        true,
        "Expected /customers internal staff-only notice to be visible",
      );
      assert.equal(
        dashboardState.customerInternalStaffNotice.includes("Internal Staff Dashboard — Not Customer-Facing"),
        true,
        "Expected /customers internal staff-only notice heading",
      );
      assert.equal(
        dashboardState.customerInternalStaffNotice.includes("Use /book for customer booking requests."),
        true,
        "Expected /customers notice to point customers to /book",
      );
      assert.equal(
        dashboardState.regularBookingFormVisible,
        true,
        "Expected internal regular customer booking form foundation to be visible",
      );
      assert.equal(
        dashboardState.regularBookingBoundary,
        "Mock/local only. Not customer-facing. No Supabase save, invoice number, invoice or statement generation, notification, calendar sync, payment API, or bank API is used.",
        "Expected mock/local boundary on regular customer booking form",
      );
      assert.deepEqual(
        dashboardState.regularBookingLabels,
        [
          "Customer / account",
          "Booker / contact person",
          "Passenger name",
          "Pickup date",
          "Pickup time",
          "Pickup location",
          "Drop-off location",
          "Flight number if any",
          "Type of Service",
          "Vehicle type",
          "Number of passengers",
          "Luggage",
          "Extra stops",
          "Customer reference / PO number if any",
          "Internal note",
        ],
        "Expected all regular customer booking fields to be visible",
      );
      assert.deepEqual(
        dashboardState.regularBookingFields.filter((field) => !field.visible).map((field) => field.field),
        [],
        "Expected regular customer booking fields to be touch-visible",
      );
      assert.equal(
        dashboardState.regularBookingFields.find((field) => field.field === "pickupLocation")?.placeholder,
        "Search pickup address — Google Map Suggest mock only",
        "Expected pickup placeholder to include Google Map Suggest mock wording",
      );
      assert.equal(
        dashboardState.regularBookingFields.find((field) => field.field === "dropoffLocation")?.placeholder,
        "Search drop-off address — Google Map Suggest mock only",
        "Expected drop-off placeholder to include Google Map Suggest mock wording",
      );
      assert.deepEqual(
        dashboardState.regularBookingRouteOptionLabels,
        [
          "Airport Arrival",
          "Airport Departure",
          "Point-to-Point Transfer",
          "Hourly / Disposal",
          "Event / VIP Movement",
          "Other / To Confirm",
        ],
        "Expected customer-facing Type of Service options",
      );
      assert.deepEqual(
        dashboardState.regularBookingRouteOptionValues,
        [
          "Airport Arrival",
          "Airport Departure",
          "Point-to-Point Transfer",
          "Hourly / Disposal",
          "Event / VIP Movement",
          "Other / To Confirm",
        ],
        "Expected Type of Service option values to stay customer-facing in this form",
      );
      assert.deepEqual(
        dashboardState.regularBookingRouteOptionLabels.filter((label) =>
          ["DEP", "MNG", "TRF", "DSP"].includes(label),
        ),
        [],
        "Expected old route codes not to be customer-facing service options",
      );
      assert.deepEqual(
        dashboardState.regularBookingVehicleOptionLabels,
        [
          "Alphard / Vellfire",
          "Mercedes Viano / V-Class",
          "Hi-roof Minibus",
          "Mercedes E-Class",
          "Mercedes S-Class",
        ],
        "Expected customer-facing Vehicle Type labels",
      );
      assert.deepEqual(
        dashboardState.regularBookingVehicleOptionValues,
        ["AVF", "VVV", "Combi", "E-Class", "S-Class"],
        "Expected Vehicle Type internal values to be mapped behind customer-facing labels",
      );
      assert.deepEqual(
        dashboardState.regularBookingVehicleOptionLabels.filter((label) =>
          ["AVF", "VVV", "Combi", "E class", "E-Class", "S class", "S-Class"].includes(label),
        ),
        [],
        "Expected vehicle dropdown labels not to expose internal codes",
      );
      for (const removedFormText of [
        "Route type",
        "Billing month",
        "Billing status default",
        "Payment method default",
      ]) {
        assert.equal(
          dashboardState.regularBookingFormText.includes(removedFormText),
          false,
          `Expected customer booking form not to show: ${removedFormText}`,
        );
      }
      assert.deepEqual(
        dashboardState.regularBookingRemovedFieldSelectors,
        [],
        "Expected Billing Month, Billing Status, and Payment Method controls to be removed from the customer booking form",
      );
      assert.equal(
        dashboardState.regularBookingFormText.includes("Type of Service"),
        true,
        "Expected customer booking form to show Type of Service",
      );
      assert.equal(
        dashboardState.regularMapSuggestSeparateSectionVisible,
        false,
        "Expected separate Google Map Suggest section to be removed from the customer booking form",
      );
      for (const expectedMapText of [
        "Google Map Suggest",
        "Mock/local only",
        "No Google API call",
        "no map billing/cost",
        "no location saved",
      ]) {
        assert.equal(
          dashboardState.regularMapSuggestHint.includes(expectedMapText),
          true,
          `Expected compact Google Map Suggest hint text: ${expectedMapText}`,
        );
      }
      assert.equal(
        dashboardState.regularMiniParserVisible,
        true,
        "Expected Mini Parser Helper mock helper to be visible",
      );
      assert.equal(
        dashboardState.regularMiniParserHeading,
        "Mini Parser Helper — Mock Only",
        "Expected Mini Parser Helper mock heading",
      );
      for (const expectedParserText of [
        "Future AI/parser helper may extract booking details.",
        "Not active yet.",
        "No OpenAI/ChatGPT API call",
        "no Supabase save",
        "no booking created",
      ]) {
        assert.equal(
          dashboardState.regularMiniParserBoundary.includes(expectedParserText),
          true,
          `Expected Mini Parser Helper boundary text: ${expectedParserText}`,
        );
      }
      assert.equal(
        dashboardState.regularBookingFeedback,
        "Mock/local form foundation only. Submit creates a local preview beside this button.",
        "Expected regular customer form helper near the submit button",
      );
      assert.equal(
        dashboardState.regularBookingFeedbackTone,
        "info",
        "Expected regular customer helper to start as an info message",
      );
      assert.equal(
        dashboardState.regularMockSaveVisible,
        true,
        "Expected mock Save Regular Booking placeholder to be visible",
      );
      assert.equal(
        dashboardState.regularMockSaveButtonText,
        "Save Regular Booking — Mock Only",
        "Expected mock Save Regular Booking placeholder label",
      );
      assert.equal(
        dashboardState.regularMockSaveBoundary,
        "Mock/local only. No booking saved, no customer folder linked, no Supabase call, no invoice number, no payment/bank action, and no notification/calendar action.",
        "Expected mock Save Regular Booking safety boundary",
      );
      assert.equal(
        dashboardState.regularMockSaveFeedback,
        "Future real save placeholder only. Mock/local only: no booking save, customer folder link write, Supabase call, invoice number, payment/bank action, notification, or calendar action.",
        "Expected mock Save Regular Booking helper near the save placeholder",
      );
      assert.equal(
        dashboardState.regularMockSaveFeedbackTone,
        "info",
        "Expected mock Save Regular Booking helper to start as info",
      );
      assert.equal(
        dashboardState.regularMockSaveReviewVisible,
        false,
        "Expected mock save confirmation review to stay hidden before a valid mock save click",
      );
      assert.equal(
        dashboardState.regularSavedVisibilityVisible,
        true,
        "Expected future saved booking visibility placeholder to be visible",
      );
      assert.equal(
        dashboardState.regularSavedVisibilityHeading,
        "Future Saved Booking Visibility — Mock Only",
        "Expected future saved booking visibility placeholder heading",
      );
      for (const expectedSavedVisibilityBoundaryText of [
        "Mock/local only.",
        "No booking saved",
        "no customer folder linked",
        "no Supabase call",
        "no invoice number",
        "no payment/bank action",
        "no notification/calendar action",
        "no audit record",
      ]) {
        assert.equal(
          dashboardState.regularSavedVisibilityBoundary.includes(expectedSavedVisibilityBoundaryText),
          true,
          `Expected future saved booking visibility boundary text: ${expectedSavedVisibilityBoundaryText}`,
        );
      }
      assert.deepEqual(
        dashboardState.regularSavedVisibilityNotes.map((note) => note.label),
        ["Customer folder", "Monthly billing review", "Future saved booking list", "Future edit/amend/cancel"],
        "Expected future saved booking visibility placeholder notes",
      );
      for (const expectedSavedVisibilityText of [
        "Future approved saves will appear in the selected customer folder",
        "Saved regular bookings will become eligible for monthly billing review later",
        "does not add or remove local rows",
        "Later edit/amend/cancel workflow will use saved booking ids only",
      ]) {
        assert.equal(
          dashboardState.regularSavedVisibilityText.includes(expectedSavedVisibilityText),
          true,
          `Expected future saved booking visibility text: ${expectedSavedVisibilityText}`,
        );
      }
      assert.deepEqual(
        dashboardState.regularSavedVisibilityButtons,
        [],
        "Expected future saved booking visibility placeholder to have no action buttons",
      );
      assert.equal(
        dashboardState.regularSavedVisibilityLocalRowNote.includes("No saved booking visibility data exists now"),
        true,
        "Expected future saved booking visibility placeholder to start without saved data",
      );
      assert.equal(
        dashboardState.regularSavedVisibilityLocalRowNote.includes("does not save, link, audit, invoice"),
        true,
        "Expected future saved booking visibility placeholder to stay passive",
      );
      assert.equal(
        /[A-Z]{2,}-\d{3,}/.test(dashboardState.regularSavedVisibilityText),
        false,
        "Expected future saved booking visibility placeholder not to create an invoice number",
      );
      assert.equal(
        dashboardState.regularBookingRequiredFieldCount,
        9,
        "Expected nine regular customer booking fields to be marked required",
      );
      assert.equal(
        dashboardState.regularBookingRequiredNote,
        "Required fields are marked with * and checked locally before a mock preview can be created.",
        "Expected required-field local validation note",
      );
      assert.equal(
        dashboardState.regularBookingEmptyPreview,
        true,
        "Expected no regular customer booking preview before local submit",
      );
      assert.equal(
        dashboardState.regularBookingFolderLinkVisible,
        false,
        "Expected no folder link until a regular customer is selected",
      );
      assert.equal(
        dashboardState.regularBookingSubmitVisible,
        true,
        "Expected regular customer booking submit button to be visible",
      );
      assert.equal(
        dashboardState.regularBookingListVisible,
        true,
        "Expected regular customer monthly billing list preview to be visible",
      );
      assert.equal(
        dashboardState.regularBookingListBoundary,
        "Mock/local only. Rows reset on refresh and are not saved. No Supabase save, customer/payment record, invoice number, invoice, statement, notification, calendar sync, payment API, or bank API is used.",
        "Expected mock/local boundary on regular customer booking list preview",
      );
      assert.equal(
        dashboardState.regularBookingListEmpty,
        true,
        "Expected regular customer booking list preview to start empty",
      );
      assert.equal(
        dashboardState.regularBookingListFiltersVisible,
        true,
        "Expected regular customer booking local filters to be visible",
      );
      assert.deepEqual(
        dashboardState.regularBookingListFilterControls.map((control) => ({
          field: control.field,
          value: control.value,
          visible: control.visible,
        })),
        [
          { field: "customerId", value: "", visible: true },
          { field: "billingMonth", value: "", visible: true },
          { field: "billingStatus", value: "", visible: true },
        ],
        "Expected regular customer booking local filter controls",
      );
      assert.equal(
        dashboardState.regularBookingListFilterControls.every((control) =>
          control.label.includes("(mock/local)"),
        ),
        true,
        "Expected regular customer booking list filters to be labelled mock/local",
      );
      assert.equal(
        dashboardState.regularBookingListClearFiltersVisible,
        true,
        "Expected regular customer booking list clear filters button",
      );
      assert.equal(
        dashboardState.regularBookingListFilterCount,
        "Showing 0 of 0 local mock rows.",
        "Expected regular customer booking list count to start at zero",
      );
      assert.equal(
        dashboardState.regularBookingListFilterFeedback,
        "Mock/local list filters only affect rows on this page. Nothing is saved or sent.",
        "Expected regular customer booking list local-only filter helper",
      );
      assert.deepEqual(
        dashboardState.regularBookingListRows,
        [],
        "Expected no regular customer booking list rows before valid local submit",
      );
      assert.equal(
        dashboardState.regularDraftInvoiceSectionVisible,
        true,
        "Expected regular customer mock draft invoice preview section",
      );
      assert.equal(
        dashboardState.regularDraftInvoiceCreateVisible,
        true,
        "Expected regular customer mock draft invoice preview button to be touch-visible",
      );
      assert.equal(
        dashboardState.regularDraftInvoiceClearVisible,
        false,
        "Expected regular customer mock draft clear button to appear only after a preview exists",
      );
      assert.equal(
        dashboardState.regularDraftInvoiceBoundary,
        "Preview-only. Not customer-facing. No invoice number, real invoice, statement, PDF, sending, Supabase save, payment API, bank API, notification, calendar sync, payment provider, or audit record is created.",
        "Expected mock/local draft invoice preview boundary",
      );
      assert.equal(
        dashboardState.regularDraftInvoiceFeedback,
        "Create a mock draft invoice preview from the currently visible local mock rows. Nothing is saved, numbered, generated, or sent.",
        "Expected regular customer draft invoice helper near the button",
      );
      assert.equal(
        dashboardState.regularDraftInvoiceFeedbackTone,
        "info",
        "Expected regular customer draft invoice helper to start as info",
      );
      assert.equal(
        dashboardState.regularDraftInvoiceEmpty,
        true,
        "Expected no regular customer draft invoice preview before local action",
      );
      assert.equal(
        dashboardState.regularDraftInvoiceEmptyText.includes("No draft invoice preview selected yet."),
        true,
        "Expected regular customer draft invoice empty state to explain no preview is selected",
      );
      assert.equal(
        dashboardState.regularDraftInvoiceEmptyText.includes("Select bookings from the mock monthly billing list"),
        true,
        "Expected regular customer draft invoice empty state to point staff to the mock list",
      );
      assert.equal(
        dashboardState.regularDraftInvoicePreviewVisible,
        false,
        "Expected draft invoice preview not to exist before local action",
      );
      assert.equal(
        dashboardState.outstandingReviewBoundary,
        "Mock/local only. Changes reset on refresh and are not saved. No payment API, bank API, notification, or Supabase write is used.",
        "Expected local-only mock boundary in outstanding payments review",
      );
      assert.deepEqual(
        dashboardState.outstandingReviewSummaryCards.map((card) => card.label),
        ["Total outstanding", "Overdue amount", "Due soon", "Needs follow-up"],
        "Expected compact outstanding review summary cards",
      );
      assert.equal(
        dashboardState.outstandingReviewSearchVisible,
        true,
        "Expected outstanding review search control to be visible",
      );
      assert.deepEqual(
        dashboardState.outstandingReviewFilterLabels,
        ["All", "Overdue", "Due soon", "Partial / pending", "Needs follow-up"],
        "Expected outstanding review filter controls",
      );
      assert.deepEqual(
        dashboardState.outstandingReviewSortOptions,
        ["Highest amount first", "Oldest overdue first", "Customer A-Z", "Last follow-up"],
        "Expected outstanding review sort options",
      );
      assert.deepEqual(
        dashboardState.outstandingReviewPageSizeOptions,
        ["10 customers", "25 customers"],
        "Expected outstanding review page size options",
      );
      assert.equal(
        dashboardState.outstandingReviewShowing,
        "Showing 1-5 of 5 customers",
        "Expected outstanding review limited-list showing count",
      );
      assert.equal(
        dashboardState.outstandingRows.length <= 10,
        true,
        "Expected outstanding review not to render more rows than the default page size",
      );
      assert.equal(
        dashboardState.outstandingReviewPreviousDisabled,
        true,
        "Expected outstanding review previous button to be disabled on the first page",
      );
      assert.equal(
        dashboardState.outstandingReviewNextDisabled,
        true,
        "Expected outstanding review next button to be disabled when the first page contains all mock rows",
      );
      assert.equal(
        dashboardState.outstandingReviewNoResultsVisible,
        false,
        "Expected outstanding review no-results state to stay hidden before filtering",
      );
      assert.deepEqual(
        dashboardState.outstandingRows.map((row) => row.id),
        [
          "vip-customer:VIP-0003",
          "ubs:UBS-0004",
          "ubs:UBS-0003",
          "ritz-carlton:RITZ-0004",
          "ritz-carlton:RITZ-0003",
        ],
        "Expected outstanding payment review to start highest amount first",
      );
      assert.deepEqual(
        dashboardState.outstandingRows.map((row) => row.href),
        [
          "/customers/vip-customer",
          "/customers/ubs",
          "/customers/ubs",
          "/customers/ritz-carlton",
          "/customers/ritz-carlton",
        ],
        "Expected every outstanding review row to link to its customer folder",
      );
      for (const row of dashboardState.outstandingRows) {
        assert.deepEqual(
          row.detailButtons,
          ["View details — Mock Only"],
          `Expected mock detail control on ${row.id}`,
        );
      }
      assert.deepEqual(
        dashboardState.outstandingPaidInvoiceMentions,
        [],
        "Expected fully paid invoices to stay out of Outstanding Payments Review",
      );
      assert.equal(
        dashboardState.collectionFollowUpBoundary,
        "Mock/local only. Follow-up changes reset on refresh and are not saved.",
        "Expected local-only mock boundary in collection follow-up queue",
      );
      assert.equal(
        dashboardState.collectionFollowUpNoSendBoundary,
        "No notification, WhatsApp message, email, payment record, bank record, or Supabase row is created.",
        "Expected no-send mock boundary in collection follow-up queue",
      );
      assert.deepEqual(
        dashboardState.collectionFollowUpRows.map((row) => row.id),
        [
          "ubs:UBS-0003",
          "ubs:UBS-0004",
          "ritz-carlton:RITZ-0003",
          "ritz-carlton:RITZ-0004",
          "vip-customer:VIP-0003",
        ],
        "Expected collection follow-up queue to include outstanding collection items",
      );
      assert.deepEqual(
        dashboardState.collectionFollowUpRows.map((row) => row.href),
        [
          "/customers/ubs",
          "/customers/ubs",
          "/customers/ritz-carlton",
          "/customers/ritz-carlton",
          "/customers/vip-customer",
        ],
        "Expected every collection follow-up row to link to its customer folder",
      );
      assert.deepEqual(
        dashboardState.collectionFollowUpPaidInvoiceMentions,
        [],
        "Expected fully paid invoices to stay out of Collection Follow-up Queue",
      );
      assert.equal(
        dashboardState.monthlyStatementBoundary,
        "Mock/read-only only. No statement record, invoice record, payment record, bank record, notification, or Supabase row is created.",
        "Expected mock/read-only statement preview boundary",
      );
      assert.equal(
        dashboardState.monthlyStatementNoNumberBoundary,
        "No statement is generated, sent, saved, or assigned a real statement number.",
        "Expected no-real-statement-number boundary",
      );
      assert.deepEqual(
        dashboardState.monthlyStatementGroups.map((group) => group.id),
        ["ubs"],
        "Expected monthly account statement preview to group outstanding monthly-account rows by customer",
      );
      assert.deepEqual(
        dashboardState.monthlyStatementGroups[0]?.rows,
        ["ubs:UBS-0003", "ubs:UBS-0004"],
        "Expected monthly statement preview to include UBS balance-due rows only",
      );
      assert.equal(
        dashboardState.monthlyStatementGroups[0]?.total,
        "$1,840",
        "Expected mock statement total to exclude fully paid UBS-0002",
      );
      assert.equal(
        dashboardState.monthlyStatementGroups[0]?.href,
        "/customers/ubs",
        "Expected monthly statement preview to link to the customer folder",
      );
      assert.equal(
        dashboardState.monthlyStatementGroups[0]?.action,
        "Preview Mock Statement",
        "Expected monthly statement preview action",
      );
      assert.equal(
        /STMT-\d|STATEMENT-\d|statement number:\s*[A-Z]+-\d/i.test(dashboardState.monthlyStatementGroups[0]?.text || ""),
        false,
        "Expected monthly statement preview not to generate a real statement number",
      );
      assert.deepEqual(
        dashboardState.monthlyStatementPaidInvoiceMentions,
        [],
        "Expected fully paid invoices to stay out of Monthly Account Statement Preview",
      );
      for (const row of dashboardState.outstandingRows) {
        assert.deepEqual(
          row.actions,
          ["Mark Invoice Sent", "Record Partial Payment", "Mark Paid", "Waive Balance"],
          `Expected mock manual payment controls on ${row.id}`,
        );
      }
      for (const row of dashboardState.collectionFollowUpRows) {
        assert.deepEqual(
          row.actions,
          ["Schedule Follow-up", "Mark Follow-up Done", "Add Mock Note"],
          `Expected mock collection follow-up controls on ${row.id}`,
        );
      }
      assert.equal(
        dashboardState.paymentSectionFeedback,
        "Mock controls only. Use the buttons to simulate manual payment tracking without saving records.",
        "Expected helper feedback near mock payment controls before actions",
      );
      assert.equal(
        dashboardState.followUpSectionFeedback,
        "Mock follow-up controls only. Use the buttons to simulate collection follow-up without sending messages.",
        "Expected helper feedback near mock follow-up controls before actions",
      );
      assert.equal(
        dashboardState.eventLogBoundary,
        "Mock only. No payment record, invoice record, bank record, notification, or Supabase row is created.",
        "Expected mock payment event log boundary",
      );
      assert.equal(
        dashboardState.eventLogText.includes("No mock payment actions recorded yet."),
        true,
        "Expected mock payment event log empty state before actions",
      );
      assert.equal(
        dashboardState.followUpEventLogBoundary,
        "Mock only. No notification, WhatsApp message, email, payment record, bank record, or Supabase row is created.",
        "Expected mock follow-up event log boundary",
      );
      assert.equal(
        dashboardState.followUpEventLogText.includes("No mock follow-up actions recorded yet."),
        true,
        "Expected mock follow-up event log empty state before actions",
      );
      assert.equal(
        dashboardState.statementPreviewLogBoundary,
        "Mock only. No statement record, invoice record, payment record, bank record, notification, WhatsApp message, email, SMS, or Supabase row is created.",
        "Expected mock statement preview log boundary",
      );
      assert.equal(
        dashboardState.statementPreviewLogText.includes("No mock statement previews recorded yet."),
        true,
        "Expected mock statement preview log empty state before actions",
      );
      for (const expectedOutstandingText of [
        "Outstanding Payments Review",
        "UBS",
        "UBS-0003",
        "UBS-0004",
        "RITZ-0003",
        "RITZ-0004",
        "VIP-0003",
        "Overdue",
        "Invoice Sent",
        "Partially Paid",
        "Unpaid",
        "Monthly Account",
        "Due date passed + balance due = Overdue",
        "Partial payment keeps balance visible",
        "Monthly account can be grouped later into statement",
        "Completed job + balance due = Outstanding",
      ]) {
        assert.ok(
          dashboardState.outstandingRows.some((row) => row.text.includes(expectedOutstandingText)) ||
            dashboardState.text.includes(expectedOutstandingText),
          `Expected outstanding payment review text: ${expectedOutstandingText}`,
        );
      }
      for (const expectedFollowUpText of [
        "Collection Follow-up Queue",
        "Mock/local only. Follow-up changes reset on refresh and are not saved.",
        "No notification, WhatsApp message, email, payment record, bank record, or Supabase row is created.",
        "NEXT FOLLOW-UP",
        "Overdue balance needs collection follow-up",
        "Partial payment still has balance due",
        "Invoice sent but balance remains due",
        "Monthly account can be grouped into statement later",
        "Unpaid balance needs collection follow-up",
        "Schedule Follow-up",
        "Mark Follow-up Done",
        "Add Mock Note",
        "Mock Follow-up Event Log",
        "Mock only. No notification, WhatsApp message, email, payment record, bank record, or Supabase row is created.",
      ]) {
        assert.ok(dashboardState.text.includes(expectedFollowUpText), `Expected collection follow-up text: ${expectedFollowUpText}`);
      }
      for (const expectedStatementText of [
        "Monthly Account Statement Preview",
        "Mock/read-only only. No statement record, invoice record, payment record, bank record, notification, or Supabase row is created.",
        "No statement is generated, sent, saved, or assigned a real statement number.",
        "Statement number: Not generated (mock/read-only preview)",
        "May 2026 billing cycle (mock preview)",
        "INCLUDED INVOICE/REFERENCE ROWS",
        "UBS-0003",
        "UBS-0004",
        "MOCK STATEMENT TOTAL",
        "$1,840",
        "Fully paid rows are excluded from this mock total.",
        "Monthly account can be grouped into statement later",
        "Balance due remains visible until paid",
        "Statement preview is not generated or saved",
        "Preview Mock Statement",
        "Mock Statement Preview Log",
        "Mock only. No statement record, invoice record, payment record, bank record, notification, WhatsApp message, email, SMS, or Supabase row is created.",
      ]) {
        assert.ok(dashboardState.text.includes(expectedStatementText), `Expected statement preview text: ${expectedStatementText}`);
      }
      for (const expectedText of [
        "Local/mock only. No payment API, bank API, notification, or Supabase write is used.",
        "Search customer/company",
        "Type a customer or company name to search.",
        "Unpaid",
        "Invoice Sent",
        "Partially Paid",
        "Paid",
        "Overdue",
        "Monthly Account",
        "Completed job + balance due = Outstanding",
        "Due date passed + balance due = Overdue",
        "Partial payment keeps the remaining balance visible",
        "Paid booking disappears from outstanding list but remains in customer history",
        "Monthly account jobs can be grouped later into statements",
        "Invoice numbers are unique and must not be reused.",
        "Once issued, invoice numbers are immutable.",
        "Changing a customer invoice prefix later requires warning/protection",
        "Mock/local only. Changes reset on refresh and are not saved.",
        "Mock Payment Event Log",
        "Mock only. No payment record, invoice record, bank record, notification, or Supabase row is created.",
      ]) {
        assert.ok(dashboardState.text.includes(expectedText), `Expected customer dashboard text: ${expectedText}`);
      }
      assertNoPaymentIntegrationResources(dashboardState.resourceCalls, "customer dashboard");
      await checkTelegramBoundary("/customers desktop");

      await evaluate(`(() => {
        window.__customerPaymentIntegrationCalls = [];
        const originalFetch = window.__customerPaymentOriginalFetch || window.fetch.bind(window);
        window.__customerPaymentOriginalFetch = originalFetch;
        window.fetch = (...args) => {
          const target = args[0]?.url || args[0];
          const method = args[1]?.method || args[0]?.method || "GET";
          window.__customerPaymentIntegrationCalls.push(\`\${method} \${String(target)}\`);
          return originalFetch(...args);
        };

        const originalOpen = window.__customerPaymentOriginalXHROpen || window.XMLHttpRequest.prototype.open;
        window.__customerPaymentOriginalXHROpen = originalOpen;
        window.XMLHttpRequest.prototype.open = function patchedCustomerPaymentOpen(method, url, ...rest) {
          window.__customerPaymentIntegrationCalls.push(\`\${method} \${String(url)}\`);
          return originalOpen.call(this, method, url, ...rest);
        };

        if (navigator.sendBeacon && !window.__customerPaymentOriginalSendBeacon) {
          const originalSendBeacon = navigator.sendBeacon.bind(navigator);
          window.__customerPaymentOriginalSendBeacon = originalSendBeacon;
          navigator.sendBeacon = (...args) => {
            window.__customerPaymentIntegrationCalls.push(\`BEACON \${String(args[0])}\`);
            return originalSendBeacon(...args);
          };
        }
      })()`);

      const clickMockPaymentAction = async (rowId, action, description) => {
        const rowSelector = `[data-outstanding-payment-row="${rowId}"]`;
        const actionSelector = `[data-payment-action="${action}"]`;
        const clicked = await evaluate(`(() => {
          const row = document.querySelector(${JSON.stringify(rowSelector)});
          const button = row?.querySelector(${JSON.stringify(actionSelector)});

          if (!button || button.disabled) {
            return false;
          }

          button.click();
          return true;
        })()`);
        assert.equal(clicked, true, `Expected ${description} button to be clickable`);
      };

      const clickMockFollowUpAction = async (rowId, action, description) => {
        const rowSelector = `[data-collection-follow-up-row="${rowId}"]`;
        const actionSelector = `[data-follow-up-action="${action}"]`;
        const clicked = await evaluate(`(() => {
          const row = document.querySelector(${JSON.stringify(rowSelector)});
          const button = row?.querySelector(${JSON.stringify(actionSelector)});

          if (!button || button.disabled) {
            return false;
          }

          button.click();
          return true;
        })()`);
        assert.equal(clicked, true, `Expected ${description} button to be clickable`);
      };

      const clickMockStatementPreviewAction = async (groupId, description) => {
        const clicked = await evaluate(`(() => {
          const button = document.querySelector(${JSON.stringify(`[data-statement-preview-action="${groupId}"]`)});

          if (!button || button.disabled) {
            return false;
          }

          button.click();
          return true;
        })()`);
        assert.equal(clicked, true, `Expected ${description} button to be clickable`);
      };

      await evaluate(`(() => {
        const input = document.querySelector("[data-outstanding-review-search]");
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter.call(input, "ritz");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      })()`);
      const outstandingSearchState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const rows = [...document.querySelectorAll("[data-outstanding-payment-row]")].map((row) => ({
              id: row.getAttribute("data-outstanding-payment-row"),
              text: row.innerText,
            }));

            if (rows.length !== 2 || rows.some((row) => !row.id?.includes("ritz-carlton"))) {
              return false;
            }

            return {
              integrationCalls: window.__customerPaymentIntegrationCalls || [],
              noResultsVisible: Boolean(document.querySelector("[data-outstanding-payments-no-results]")),
              rows,
              showing: document.querySelector("[data-outstanding-review-showing]")?.textContent.trim() || "",
            };
          })()`),
        10000,
        "outstanding payment review search filter",
      );
      assert.equal(
        outstandingSearchState.showing,
        "Showing 1-2 of 2 customers",
        "Expected outstanding review search to update the showing count",
      );
      assert.equal(
        outstandingSearchState.noResultsVisible,
        false,
        "Expected matching outstanding review search not to show the no-results state",
      );
      assert.deepEqual(
        outstandingSearchState.integrationCalls.filter((call) => blockedCustomerIntegrationPattern.test(call)),
        [],
        "Expected outstanding review search not to call payment, bank, notification, calendar, or Supabase APIs",
      );

      await evaluate(`(() => {
        const input = document.querySelector("[data-outstanding-review-search]");
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter.call(input, "");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        document.querySelector("[data-outstanding-review-filter='due-soon']")?.click();
      })()`);
      const outstandingDueSoonState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const rows = [...document.querySelectorAll("[data-outstanding-payment-row]")].map((row) =>
              row.getAttribute("data-outstanding-payment-row"),
            );

            if (rows.length !== 3 || !rows.includes("vip-customer:VIP-0003")) {
              return false;
            }

            return {
              integrationCalls: window.__customerPaymentIntegrationCalls || [],
              rows,
              showing: document.querySelector("[data-outstanding-review-showing]")?.textContent.trim() || "",
            };
          })()`),
        10000,
        "outstanding payment review due soon filter",
      );
      assert.deepEqual(
        outstandingDueSoonState.rows,
        ["vip-customer:VIP-0003", "ubs:UBS-0004", "ritz-carlton:RITZ-0004"],
        "Expected due soon filter to show due-today and upcoming mock balances only",
      );
      assert.equal(
        outstandingDueSoonState.showing,
        "Showing 1-3 of 3 customers",
        "Expected due soon filter to update the showing count",
      );
      assert.deepEqual(
        outstandingDueSoonState.integrationCalls.filter((call) => blockedCustomerIntegrationPattern.test(call)),
        [],
        "Expected outstanding due-soon filter not to call payment, bank, notification, calendar, or Supabase APIs",
      );

      await evaluate(`document.querySelector("[data-outstanding-review-filter='overdue']")?.click()`);
      const outstandingOverdueState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const rows = [...document.querySelectorAll("[data-outstanding-payment-row]")].map((row) =>
              row.getAttribute("data-outstanding-payment-row"),
            );

            if (rows.length !== 1 || rows[0] !== "ubs:UBS-0003") {
              return false;
            }

            return {
              integrationCalls: window.__customerPaymentIntegrationCalls || [],
              rows,
              showing: document.querySelector("[data-outstanding-review-showing]")?.textContent.trim() || "",
            };
          })()`),
        10000,
        "outstanding payment review overdue filter",
      );
      assert.equal(
        outstandingOverdueState.showing,
        "Showing 1-1 of 1 customers",
        "Expected overdue filter to update the showing count",
      );
      assert.deepEqual(
        outstandingOverdueState.integrationCalls.filter((call) => blockedCustomerIntegrationPattern.test(call)),
        [],
        "Expected outstanding overdue filter not to call payment, bank, notification, calendar, or Supabase APIs",
      );

      await evaluate(`(() => {
        document.querySelector("[data-outstanding-review-filter='all']")?.click();
        const sort = document.querySelector("[data-outstanding-review-sort]");
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
        setter.call(sort, "customer-az");
        sort.dispatchEvent(new Event("change", { bubbles: true }));
      })()`);
      const outstandingSortState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const rows = [...document.querySelectorAll("[data-outstanding-payment-row]")].map((row) =>
              row.getAttribute("data-outstanding-payment-row"),
            );

            if (rows[0] !== "vip-customer:VIP-0003") {
              return false;
            }

            return {
              integrationCalls: window.__customerPaymentIntegrationCalls || [],
              rows,
            };
          })()`),
        10000,
        "outstanding payment review customer sort",
      );
      assert.deepEqual(
        outstandingSortState.rows,
        [
          "vip-customer:VIP-0003",
          "ritz-carlton:RITZ-0003",
          "ritz-carlton:RITZ-0004",
          "ubs:UBS-0003",
          "ubs:UBS-0004",
        ],
        "Expected customer A-Z sort to reorder the compact outstanding review list",
      );
      assert.deepEqual(
        outstandingSortState.integrationCalls.filter((call) => blockedCustomerIntegrationPattern.test(call)),
        [],
        "Expected outstanding sort not to call payment, bank, notification, calendar, or Supabase APIs",
      );

      await evaluate(`(() => {
        const sort = document.querySelector("[data-outstanding-review-sort]");
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
        setter.call(sort, "highest-amount");
        sort.dispatchEvent(new Event("change", { bubbles: true }));
      })()`);
      const outstandingDetailClicked = await evaluate(`(() => {
        const button = document.querySelector("[data-outstanding-review-detail-toggle='ubs:UBS-0003']");

        if (!button) {
          return false;
        }

        button.click();
        return true;
      })()`);
      assert.equal(outstandingDetailClicked, true, "Expected outstanding mock detail button to be clickable");
      const outstandingDetailState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const detail = document.querySelector("[data-outstanding-review-detail='ubs:UBS-0003']");

            if (!detail) {
              return false;
            }

            return {
              detailText: detail.innerText,
              integrationCalls: window.__customerPaymentIntegrationCalls || [],
            };
          })()`),
        10000,
        "outstanding payment review mock detail",
      );
      for (const expectedDetailText of [
        "Mock/local detail only",
        "Customer folder reminder",
        "Follow-up note placeholder only",
        "No invoice, statement, PDF, invoice number, sending, Supabase call, payment API, bank API, notification, or calendar action.",
      ]) {
        assert.ok(
          outstandingDetailState.detailText.includes(expectedDetailText),
          `Expected outstanding detail text: ${expectedDetailText}`,
        );
      }
      assert.deepEqual(
        outstandingDetailState.integrationCalls.filter((call) => blockedCustomerIntegrationPattern.test(call)),
        [],
        "Expected outstanding detail view not to call payment, bank, notification, calendar, or Supabase APIs",
      );

      await evaluate(`(() => {
        const input = document.querySelector("[data-outstanding-review-search]");
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter.call(input, "no matching customer");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      })()`);
      const outstandingNoResultsState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const noResults = document.querySelector("[data-outstanding-payments-no-results]");

            if (!noResults) {
              return false;
            }

            return {
              integrationCalls: window.__customerPaymentIntegrationCalls || [],
              noResultsText: noResults.innerText,
              rowCount: document.querySelectorAll("[data-outstanding-payment-row]").length,
            };
          })()`),
        10000,
        "outstanding payment review no-results state",
      );
      assert.equal(outstandingNoResultsState.rowCount, 0, "Expected no-result search to hide visible rows only");
      assert.equal(
        outstandingNoResultsState.noResultsText.includes("No data was removed and no API was called."),
        true,
        "Expected outstanding no-results message to confirm data/API protection",
      );
      assert.deepEqual(
        outstandingNoResultsState.integrationCalls.filter((call) => blockedCustomerIntegrationPattern.test(call)),
        [],
        "Expected outstanding no-results search not to call payment, bank, notification, calendar, or Supabase APIs",
      );

      await evaluate(`(() => {
        const input = document.querySelector("[data-outstanding-review-search]");
        const inputSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        inputSetter.call(input, "");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        document.querySelector("[data-outstanding-review-filter='all']")?.click();
        const sort = document.querySelector("[data-outstanding-review-sort]");
        const selectSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
        selectSetter.call(sort, "highest-amount");
        sort.dispatchEvent(new Event("change", { bubbles: true }));
      })()`);
      await waitForCondition(
        () =>
          evaluate(`document.querySelector("[data-outstanding-payment-row]")?.getAttribute("data-outstanding-payment-row") === "vip-customer:VIP-0003"`),
        10000,
        "outstanding payment review reset after controls",
      );

      const clickRegularCustomerDraftInvoicePreview = async (description) => {
        const clicked = await evaluate(`(() => {
          const button = document.querySelector("[data-regular-customer-draft-invoice-create]");

          if (!button || button.disabled) {
            return false;
          }

          button.click();
          return true;
        })()`);
        assert.equal(clicked, true, `Expected ${description} button to be clickable`);
      };

      const clickRegularCustomerDraftInvoiceClear = async (description) => {
        const clicked = await evaluate(`(() => {
          const button = document.querySelector("[data-regular-customer-draft-invoice-clear]");

          if (!button || button.disabled) {
            return false;
          }

          button.click();
          return true;
        })()`);
        assert.equal(clicked, true, `Expected ${description} button to be clickable`);
      };

      const clickRegularCustomerMockSave = async (description) => {
        const clicked = await evaluate(`(() => {
          const button = document.querySelector("[data-regular-customer-mock-save]");

          if (!button || button.disabled) {
            return false;
          }

          button.click();
          return true;
        })()`);
        assert.equal(clicked, true, `Expected ${description} button to be clickable`);
      };

      const clickRegularCustomerMockSaveReviewButton = async (action, description) => {
        const clicked = await evaluate(`(() => {
          const button = document.querySelector(${JSON.stringify(
            `[data-regular-customer-mock-save-review-${action}]`,
          )});

          if (!button || button.disabled) {
            return false;
          }

          button.click();
          return true;
        })()`);
        assert.equal(clicked, true, `Expected ${description} button to be clickable`);
      };

      const setRegularCustomerMiniParserText = async (value) => {
        const actualValue = await evaluate(`(() => {
          const input = document.querySelector("[data-regular-customer-mini-parser-text]");

          if (!input) {
            return null;
          }

          const descriptor = Object.getOwnPropertyDescriptor(input.constructor.prototype, "value");
          descriptor?.set?.call(input, ${JSON.stringify(value)});
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));

          return input.value;
        })()`);
        assert.equal(actualValue, value, "Expected Mini Parser Helper text area to accept local test text");
      };

      const clickRegularCustomerMiniParserHelper = async (description) => {
        const clicked = await evaluate(`(() => {
          const button = document.querySelector("[data-regular-customer-mini-parser-button]");

          if (!button || button.disabled) {
            return false;
          }

          button.click();
          return true;
        })()`);
        assert.equal(clicked, true, `Expected ${description} button to be clickable`);
      };

      const readRegularCustomerHelperState = () =>
        evaluate(`(() => {
          const parserButton = document.querySelector("[data-regular-customer-mini-parser-button]");
          const parserFeedback = document.querySelector("[data-regular-customer-mini-parser-feedback]");
          const parserButtonRect = parserButton?.getBoundingClientRect();
          const parserFeedbackRect = parserFeedback?.getBoundingClientRect();

          return {
            integrationCalls: window.__customerPaymentIntegrationCalls || [],
            listRowCount: document.querySelectorAll("[data-regular-customer-booking-list-row]").length,
            parserDistanceFromButton:
              parserButtonRect && parserFeedbackRect
                ? Math.round(Math.abs(parserFeedbackRect.top - parserButtonRect.bottom))
                : 999,
            parserFeedback: parserFeedback?.textContent.trim() || "",
            previewVisible: Boolean(document.querySelector("[data-regular-customer-booking-preview]")),
          };
        })()`);

      const clickRegularCustomerMockRowAction = async (rowIndex, action, description) => {
        const clicked = await evaluate(`(() => {
          const row = document.querySelectorAll("[data-regular-customer-booking-list-row]")[${rowIndex}];
          const button = row?.querySelector(${JSON.stringify(`[data-regular-customer-booking-list-action="${action}"]`)});

          if (!button || button.disabled) {
            return false;
          }

          button.click();
          return true;
        })()`);
        assert.equal(clicked, true, `Expected ${description} button to be clickable`);
      };

      const setRegularCustomerBookingField = async (field, value) => {
        const actualValue = await evaluate(`(() => {
          const input = document.querySelector(${JSON.stringify(`[data-regular-booking-field="${field}"]`)});

          if (!input) {
            return null;
          }

          const descriptor = Object.getOwnPropertyDescriptor(input.constructor.prototype, "value");
          descriptor?.set?.call(input, ${JSON.stringify(value)});
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));

          return input.value;
        })()`);
        assert.equal(actualValue, value, `Expected regular booking field ${field} to accept test value`);
      };

      const setRegularCustomerBookingListFilter = async (filter, value) => {
        const actualValue = await evaluate(`(() => {
          const input = document.querySelector(${JSON.stringify(
            `[data-regular-customer-booking-list-filter="${filter}"]`,
          )});

          if (!input) {
            return null;
          }

          const descriptor = Object.getOwnPropertyDescriptor(input.constructor.prototype, "value");
          descriptor?.set?.call(input, ${JSON.stringify(value)});
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));

          return input.value;
        })()`);
        assert.equal(actualValue, value, `Expected regular booking list filter ${filter} to accept test value`);
      };

      const readRegularCustomerMockSaveState = () =>
        evaluate(`(() => {
          const button = document.querySelector("[data-regular-customer-mock-save]");
          const feedback = document.querySelector("[data-regular-customer-mock-save-feedback]");
          const review = document.querySelector("[data-regular-customer-mock-save-review]");
          const buttonRect = button?.getBoundingClientRect();
          const feedbackRect = feedback?.getBoundingClientRect();

          return {
            distanceFromButton:
              buttonRect && feedbackRect ? Math.round(Math.abs(feedbackRect.top - buttonRect.bottom)) : 999,
            emptyPreview: Boolean(document.querySelector("[data-regular-customer-booking-empty-preview]")),
            feedback: feedback?.textContent.trim() || "",
            feedbackTone: feedback?.getAttribute("data-regular-customer-mock-save-feedback-tone") || "",
            formValues: Object.fromEntries(
              [
                "customerId",
                "passengerName",
                "pickupDate",
                "pickupTime",
                "pickupLocation",
                "dropoffLocation",
                "vehicleType",
              ].map((field) => [
                field,
                document.querySelector("[data-regular-booking-field='" + field + "']")?.value || "",
              ]),
            ),
            integrationCalls: window.__customerPaymentIntegrationCalls || [],
            listRowCount: document.querySelectorAll("[data-regular-customer-booking-list-row]").length,
            listText:
              document.querySelector("[data-regular-customer-booking-list-preview]")?.innerText || "",
            missingFields: [...document.querySelectorAll("[data-regular-customer-booking-missing-field]")].map(
              (field) => field.textContent.trim(),
            ),
            previewVisible: Boolean(document.querySelector("[data-regular-customer-booking-preview]")),
            reviewBoundary:
              document.querySelector("[data-regular-customer-mock-save-review-boundary]")?.textContent.trim() || "",
            reviewButtons: [...document.querySelectorAll("[data-regular-customer-mock-save-review] button")].map(
              (button) => button.textContent.trim(),
            ),
            reviewFeedback:
              document.querySelector("[data-regular-customer-mock-save-review-feedback]")?.textContent.trim() || "",
            reviewFeedbackTone:
              document.querySelector("[data-regular-customer-mock-save-review-feedback]")?.getAttribute(
                "data-regular-customer-mock-save-review-feedback-tone",
              ) || "",
            reviewHeading:
              document.querySelector("[data-regular-customer-mock-save-review-heading]")?.textContent.trim() || "",
            reviewSummary: [
              ...document.querySelectorAll("[data-regular-customer-mock-save-review-summary]"),
            ].map((item) => ({
              field: item.getAttribute("data-regular-customer-mock-save-review-summary") || "",
              value: item.textContent.trim(),
            })),
            reviewText: review?.innerText || "",
            reviewVisible: Boolean(review),
          };
        })()`);

      const readRegularCustomerSavedVisibilityState = () =>
        evaluate(`(() => {
          const section = document.querySelector("[data-regular-customer-saved-visibility-section]");

          return {
            buttons: [...document.querySelectorAll("[data-regular-customer-saved-visibility-section] button")].map(
              (button) => button.textContent.trim(),
            ),
            integrationCalls: window.__customerPaymentIntegrationCalls || [],
            localRowNote:
              document.querySelector("[data-regular-customer-saved-visibility-local-row-note]")?.textContent.trim() ||
              "",
            rowCount: document.querySelectorAll("[data-regular-customer-booking-list-row]").length,
            text: section?.innerText || "",
            visible: Boolean(section),
          };
        })()`);

      const readRegularCustomerDraftInvoiceState = () =>
        evaluate(`(() => {
          const button = document.querySelector("[data-regular-customer-draft-invoice-create]");
          const clearButton = document.querySelector("[data-regular-customer-draft-invoice-clear]");
          const feedback = document.querySelector("[data-regular-customer-draft-invoice-feedback]");
          const preview = document.querySelector("[data-regular-customer-draft-invoice-preview]");
          const previewArea = document.querySelector("[data-regular-customer-draft-invoice-preview-area]");
          const buttonRect = button?.getBoundingClientRect();
          const clearButtonRect = clearButton?.getBoundingClientRect();
          const feedbackRect = feedback?.getBoundingClientRect();

          return {
            amountText:
              document.querySelector("[data-regular-customer-draft-invoice-amounts]")?.textContent.trim() || "",
            boundary:
              document.querySelector("[data-regular-customer-draft-invoice-boundary]")?.textContent.trim() || "",
            clearButtonText: clearButton?.textContent.trim() || "",
            clearDisabled: Boolean(clearButton?.disabled),
            clearVisible: Boolean(clearButton),
            distanceFromButton:
              buttonRect && feedbackRect ? Math.round(Math.abs(feedbackRect.top - buttonRect.bottom)) : 999,
            distanceFromClearButton:
              clearButtonRect && feedbackRect ? Math.round(Math.abs(feedbackRect.top - clearButtonRect.bottom)) : 999,
            emptyVisible: Boolean(document.querySelector("[data-regular-customer-draft-invoice-empty]")),
            emptyText:
              document.querySelector("[data-regular-customer-draft-invoice-empty]")?.textContent.trim() || "",
            feedback: feedback?.textContent.trim() || "",
            feedbackTone:
              feedback?.getAttribute("data-regular-customer-draft-invoice-feedback-tone") || "",
            integrationCalls: window.__customerPaymentIntegrationCalls || [],
            noSaveBoundary:
              document.querySelector("[data-regular-customer-draft-invoice-no-save-boundary]")?.textContent.trim() || "",
            previewAreaText: previewArea?.innerText || "",
            previewText: preview?.innerText || "",
            previewVisible: Boolean(preview),
            rows: [...document.querySelectorAll("[data-regular-customer-draft-invoice-row]")].map((row) => ({
              id: row.getAttribute("data-regular-customer-draft-invoice-row") || "",
              text: row.innerText,
            })),
            snapshotNotice:
              document.querySelector("[data-regular-customer-draft-invoice-snapshot-notice]")?.textContent.trim() || "",
          };
        })()`);

      const readRegularCustomerBookingListState = () =>
        evaluate(`(() => {
          const list = document.querySelector("[data-regular-customer-booking-list-preview]");

          return {
            countText:
              document.querySelector("[data-regular-customer-booking-list-filter-count]")?.textContent.trim() || "",
            feedback:
              document.querySelector("[data-regular-customer-booking-list-filter-feedback]")?.textContent.trim() || "",
            filterEmpty: Boolean(document.querySelector("[data-regular-customer-booking-list-filter-empty]")),
            filters: [...document.querySelectorAll("[data-regular-customer-booking-list-filter]")].map((input) => ({
              field: input.getAttribute("data-regular-customer-booking-list-filter") || "",
              value: input.value || "",
            })),
            integrationCalls: window.__customerPaymentIntegrationCalls || [],
            listText: list?.innerText || "",
            rows: [...document.querySelectorAll("[data-regular-customer-booking-list-row]")].map((row) => ({
              actionBoundary:
                row.querySelector("[data-regular-customer-booking-list-action-boundary]")?.textContent.trim() || "",
              actionFeedback:
                row.querySelector("[data-regular-customer-booking-list-action-feedback]")?.textContent.trim() || "",
              actionFeedbackKind:
                row.querySelector("[data-regular-customer-booking-list-action-feedback]")?.getAttribute(
                  "data-regular-customer-booking-list-action-feedback-kind",
                ) || "",
              actions: [...row.querySelectorAll("[data-regular-customer-booking-list-action]")].map((button) =>
                button.textContent.trim(),
              ),
              billingStatus:
                row.querySelector("[data-regular-customer-booking-list-billing-status]")?.textContent.trim() || "",
              distanceFromActiveAction: (() => {
                const feedback = row.querySelector("[data-regular-customer-booking-list-action-feedback]");
                const activeAction =
                  feedback?.getAttribute("data-regular-customer-booking-list-action-feedback-kind") || "";
                const button = activeAction
                  ? row.querySelector("[data-regular-customer-booking-list-action='" + activeAction + "']")
                  : null;
                const buttonRect = button?.getBoundingClientRect();
                const feedbackRect = feedback?.getBoundingClientRect();

                return buttonRect && feedbackRect ? Math.round(Math.abs(feedbackRect.top - buttonRect.bottom)) : 999;
              })(),
              folderLink:
                row.querySelector("[data-regular-customer-booking-list-folder-link]")?.getAttribute("href") || "",
              id: row.getAttribute("data-regular-customer-booking-list-row") || "",
              invoiceNumber:
                row.querySelector("[data-regular-customer-booking-list-invoice-number]")?.textContent.trim() || "",
              noSaveBoundary:
                row.querySelector("[data-regular-customer-booking-list-no-save-boundary]")?.textContent.trim() || "",
              passengerText:
                row.querySelector("[data-regular-customer-booking-list-passenger]")?.textContent.trim() || "",
              text: row.innerText,
            })),
          };
        })()`);

      const regularCustomerBookingFields = {
        booker: "Browser Test Booker",
        customerId: "ubs",
        customerReference: "PO MAY TEST",
        dropoffLocation: "Raffles Place",
        extraStops: "Marina Bay Sands",
        flightNumber: "SQ333",
        internalNote: "Mock/local browser smoke note",
        luggage: "2 large bags",
        passengerCount: "2",
        passengerName: "Browser Test Passenger",
        pickupDate: "2026-05-28",
        pickupLocation: "Changi Airport T3",
        pickupTime: "1530hrs",
        routeType: "Airport Arrival",
        vehicleType: "AVF",
      };
      const secondRegularCustomerBookingFields = {
        ...regularCustomerBookingFields,
        booker: "Browser Filter Booker",
        customerId: "ritz-carlton",
        customerReference: "PO JUN TEST",
        dropoffLocation: "Marina Bay Cruise Centre",
        extraStops: "None",
        internalNote: "Second local mock filter note",
        luggage: "1 carry-on",
        passengerCount: "1",
        passengerName: "Browser Filter Passenger",
        pickupDate: "2026-06-03",
        pickupLocation: "Ritz Carlton",
        pickupTime: "0900hrs",
        routeType: "Point-to-Point Transfer",
        vehicleType: "E-Class",
      };

      await setRegularCustomerMiniParserText(
        "SQ333 arrival for Browser Test Passenger, Changi T3 to Raffles Place",
      );
      await clickRegularCustomerMiniParserHelper("Mini Parser Helper mock helper");
      const miniParserClickedState = await waitForCondition(
        async () => {
          const candidateState = await readRegularCustomerHelperState();
          return candidateState.parserFeedback.includes("Mini Parser Helper checked this local text only")
            ? candidateState
            : false;
        },
        10000,
        "Mini Parser Helper mock feedback",
      );
      for (const expectedParserFeedback of [
        "Mini Parser Helper checked this local text only",
        "no OpenAI/ChatGPT API call",
        "no Supabase save",
        "no booking created",
      ]) {
        assert.equal(
          miniParserClickedState.parserFeedback.includes(expectedParserFeedback),
          true,
          `Expected Mini Parser Helper feedback text: ${expectedParserFeedback}`,
        );
      }
      assert.equal(
        miniParserClickedState.parserDistanceFromButton < 180,
        true,
        "Expected Mini Parser Helper feedback near the clicked control",
      );
      assert.equal(
        miniParserClickedState.listRowCount,
        0,
        "Expected Mini Parser Helper mock helper not to add local booking rows",
      );
      assert.equal(
        miniParserClickedState.previewVisible,
        false,
        "Expected Mini Parser Helper mock helper not to create a booking preview",
      );
      assert.deepEqual(
        miniParserClickedState.integrationCalls.filter((call) => blockedCustomerIntegrationPattern.test(call)),
        [],
        "Expected Mini Parser Helper mock helper not to call OpenAI, ChatGPT, Supabase, payment, bank, notification, or calendar APIs",
      );

      await clickRegularCustomerDraftInvoicePreview("empty regular customer draft invoice preview");
      const regularDraftNoRowsState = await waitForCondition(
        async () => {
          const candidateState = await readRegularCustomerDraftInvoiceState();
          return candidateState.feedback.includes("No visible local mock booking rows") ? candidateState : false;
        },
        10000,
        "regular customer draft invoice preview with no visible rows",
      );
      assert.equal(
        regularDraftNoRowsState.feedbackTone,
        "error",
        "Expected empty draft invoice preview attempt to show a local error",
      );
      assert.equal(
        regularDraftNoRowsState.distanceFromButton < 160,
        true,
        "Expected empty draft invoice preview help to appear near its button",
      );
      assert.equal(
        regularDraftNoRowsState.previewVisible,
        false,
        "Expected empty draft invoice preview attempt not to create a preview",
      );
      assert.equal(
        regularDraftNoRowsState.emptyVisible,
        true,
        "Expected draft invoice empty state to remain visible after no-row attempt",
      );
      assert.deepEqual(
        regularDraftNoRowsState.integrationCalls.filter((call) =>
          blockedCustomerIntegrationPattern.test(call),
        ),
        [],
        "Expected empty draft invoice preview not to call Supabase, payment, bank, notification, or calendar APIs",
      );

      await clickRegularCustomerMockSave("invalid regular customer mock save placeholder");
      const invalidMockSaveState = await waitForCondition(
        async () => {
          const candidateState = await readRegularCustomerMockSaveState();
          return candidateState.feedback.includes("Real Save Regular Booking is not active yet")
            ? candidateState
            : false;
        },
        10000,
        "regular customer invalid mock save placeholder",
      );
      assert.equal(
        invalidMockSaveState.feedbackTone,
        "error",
        "Expected invalid mock save placeholder to show an error near the mock save control",
      );
      assert.equal(
        invalidMockSaveState.distanceFromButton < 160,
        true,
        "Expected invalid mock save feedback near the mock save control",
      );
      assert.deepEqual(
        invalidMockSaveState.missingFields,
        [
          "Customer / account",
          "Booker / contact person",
          "Passenger name",
          "Pickup date",
          "Pickup time",
          "Pickup location",
          "Drop-off location",
        ],
        "Expected invalid mock save to list future required-field checks",
      );
      assert.equal(
        invalidMockSaveState.emptyPreview,
        true,
        "Expected invalid mock save not to create a mock preview",
      );
      assert.equal(
        invalidMockSaveState.previewVisible,
        false,
        "Expected invalid mock save not to show a regular customer preview",
      );
      assert.equal(
        invalidMockSaveState.reviewVisible,
        false,
        "Expected invalid mock save not to show the mock confirmation review",
      );
      assert.equal(
        invalidMockSaveState.listRowCount,
        0,
        "Expected invalid mock save not to add a local monthly billing row",
      );
      assert.equal(
        /[A-Z]{2,}-\d{3,}/.test(invalidMockSaveState.feedback),
        false,
        "Expected invalid mock save feedback not to allocate an invoice number",
      );
      assert.deepEqual(
        invalidMockSaveState.integrationCalls.filter((call) => blockedCustomerIntegrationPattern.test(call)),
        [],
        "Expected invalid mock save not to call Supabase, payment, bank, notification, or calendar APIs",
      );
      const invalidSavedVisibilityState = await readRegularCustomerSavedVisibilityState();
      assert.equal(
        invalidSavedVisibilityState.visible,
        true,
        "Expected future saved booking visibility placeholder to remain visible after invalid mock save",
      );
      assert.equal(
        invalidSavedVisibilityState.rowCount,
        0,
        "Expected future saved booking visibility placeholder not to add rows after invalid mock save",
      );
      assert.deepEqual(
        invalidSavedVisibilityState.buttons,
        [],
        "Expected future saved booking visibility placeholder to remain read-only after invalid mock save",
      );
      assert.equal(
        invalidSavedVisibilityState.localRowNote.includes("No saved booking visibility data exists now"),
        true,
        "Expected future saved booking visibility placeholder not to pretend invalid mock save created saved data",
      );
      assert.deepEqual(
        invalidSavedVisibilityState.integrationCalls.filter((call) =>
          blockedCustomerIntegrationPattern.test(call),
        ),
        [],
        "Expected future saved booking visibility placeholder not to call Supabase, payment, bank, notification, or calendar APIs after invalid mock save",
      );

      const regularBookingInvalidClicked = await evaluate(`(() => {
        const button = document.querySelector("[data-regular-customer-booking-submit]");

        if (!button || button.disabled) {
          return false;
        }

        button.click();
        return true;
      })()`);
      assert.equal(
        regularBookingInvalidClicked,
        true,
        "Expected regular customer booking invalid submit button to be clickable",
      );

      const regularBookingInvalidState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const button = document.querySelector("[data-regular-customer-booking-submit]");
            const feedback = document.querySelector("[data-regular-customer-booking-feedback]");

            if (!feedback?.textContent.includes("Please complete required fields")) {
              return false;
            }

            const buttonRect = button?.getBoundingClientRect();
            const feedbackRect = feedback.getBoundingClientRect();

            return {
              distanceFromSubmit:
                buttonRect && feedbackRect ? Math.round(Math.abs(feedbackRect.top - buttonRect.bottom)) : 999,
              emptyPreview: Boolean(document.querySelector("[data-regular-customer-booking-empty-preview]")),
              feedbackText: feedback.textContent.trim(),
              feedbackTone: feedback.getAttribute("data-regular-customer-booking-feedback-tone") || "",
              integrationCalls: window.__customerPaymentIntegrationCalls || [],
              listRowCount: document.querySelectorAll("[data-regular-customer-booking-list-row]").length,
              listStillEmpty: Boolean(document.querySelector("[data-regular-customer-booking-list-empty]")),
              missingFields: [...document.querySelectorAll("[data-regular-customer-booking-missing-field]")].map(
                (field) => field.textContent.trim(),
              ),
              previewVisible: Boolean(document.querySelector("[data-regular-customer-booking-preview]")),
            };
          })()`),
        10000,
        "regular customer booking local validation error",
      );

      assert.equal(
        regularBookingInvalidState.feedbackTone,
        "error",
        "Expected empty regular customer submit to show an error near the submit button",
      );
      assert.deepEqual(
        regularBookingInvalidState.missingFields,
        [
          "Customer / account",
          "Booker / contact person",
          "Passenger name",
          "Pickup date",
          "Pickup time",
          "Pickup location",
          "Drop-off location",
        ],
        "Expected empty regular customer submit to list missing required fields",
      );
      assert.equal(
        regularBookingInvalidState.emptyPreview,
        true,
        "Expected invalid regular customer submit to keep the empty preview state",
      );
      assert.equal(
        regularBookingInvalidState.previewVisible,
        false,
        "Expected invalid regular customer submit not to create a mock preview",
      );
      assert.equal(
        regularBookingInvalidState.listStillEmpty,
        true,
        "Expected invalid regular customer submit to keep the local booking list empty",
      );
      assert.equal(
        regularBookingInvalidState.listRowCount,
        0,
        "Expected invalid regular customer submit not to add a monthly billing list row",
      );
      assert.equal(
        regularBookingInvalidState.distanceFromSubmit < 120,
        true,
        "Expected validation error to appear near the regular customer submit button",
      );
      assert.deepEqual(
        regularBookingInvalidState.integrationCalls.filter((call) => blockedCustomerIntegrationPattern.test(call)),
        [],
        "Expected invalid regular customer submit not to call Supabase, payment, bank, notification, or calendar APIs",
      );

      for (const [field, value] of Object.entries(regularCustomerBookingFields)) {
        await setRegularCustomerBookingField(field, value);
      }

      await clickRegularCustomerMockSave("valid regular customer mock save placeholder");
      const validMockSaveState = await waitForCondition(
        async () => {
          const candidateState = await readRegularCustomerMockSaveState();
          return candidateState.feedback.includes("UBS Save Regular Booking placeholder clicked")
            ? candidateState
            : false;
        },
        10000,
        "regular customer valid mock save placeholder",
      );
      assert.equal(
        validMockSaveState.feedbackTone,
        "success",
        "Expected valid mock save placeholder to show a success helper without saving",
      );
      assert.equal(
        validMockSaveState.distanceFromButton < 160,
        true,
        "Expected valid mock save feedback near the mock save control",
      );
      for (const expectedMockSaveText of [
        "Future real save will require staff confirmation",
        "separate Supabase approval",
        "No booking was saved",
        "no customer folder was linked",
        "no local row was added",
        "no row data changed",
        "no invoice number or audit record was created",
        "no payment, bank, notification, calendar, or Supabase call was made",
      ]) {
        assert.equal(
          validMockSaveState.feedback.includes(expectedMockSaveText),
          true,
          `Expected valid mock save feedback text: ${expectedMockSaveText}`,
        );
      }
      assert.deepEqual(
        validMockSaveState.missingFields,
        [],
        "Expected valid mock save to clear required-field helper markers",
      );
      assert.equal(
        validMockSaveState.emptyPreview,
        true,
        "Expected valid mock save not to create a mock preview",
      );
      assert.equal(
        validMockSaveState.previewVisible,
        false,
        "Expected valid mock save not to show a regular customer preview",
      );
      assert.equal(
        validMockSaveState.listRowCount,
        0,
        "Expected valid mock save not to add a local monthly billing row",
      );
      assert.equal(
        validMockSaveState.listText.includes("No mock regular customer monthly billing rows yet"),
        true,
        "Expected valid mock save to keep the local monthly billing list empty",
      );
      assert.equal(
        /[A-Z]{2,}-\d{3,}/.test(validMockSaveState.feedback),
        false,
        "Expected valid mock save feedback not to allocate an invoice number",
      );
      assert.deepEqual(
        validMockSaveState.integrationCalls.filter((call) => blockedCustomerIntegrationPattern.test(call)),
        [],
        "Expected valid mock save not to call Supabase, payment, bank, notification, or calendar APIs",
      );
      assert.equal(
        validMockSaveState.reviewVisible,
        true,
        "Expected valid mock save to show the mock confirmation review",
      );
      assert.equal(
        validMockSaveState.reviewHeading,
        "Mock Save Confirmation — Not Active",
        "Expected mock save confirmation review heading",
      );
      for (const expectedReviewBoundaryText of [
        "Mock/local only.",
        "No booking saved",
        "no customer folder linked",
        "no Supabase call",
        "no invoice number",
        "no audit record",
        "no payment/bank action",
        "no notification/calendar action",
      ]) {
        assert.equal(
          validMockSaveState.reviewBoundary.includes(expectedReviewBoundaryText),
          true,
          `Expected mock save confirmation boundary text: ${expectedReviewBoundaryText}`,
        );
      }
      assert.deepEqual(
        validMockSaveState.reviewButtons,
        ["Confirm Mock Save Review", "Dismiss Mock Review"],
        "Expected mock save confirmation review controls",
      );
      const validMockSaveReviewSummary = Object.fromEntries(
        validMockSaveState.reviewSummary.map((item) => [item.field, item.value]),
      );
      assert.deepEqual(
        validMockSaveReviewSummary,
        {
          billingMonth: "2026-05",
          customerName: "UBS",
          dropoffLocation: "Raffles Place",
          passengerName: "Browser Test Passenger",
          pickupDateTime: "2026-05-28 / 1530hrs",
          pickupLocation: "Changi Airport T3",
          vehicleType: "Alphard / Vellfire",
        },
        "Expected mock save confirmation review to summarize the future save review fields",
      );
      for (const expectedReviewText of [
        "Mock/local only",
        "No booking saved",
        "no customer folder linked",
        "no Supabase call",
        "no invoice number",
        "no audit record",
        "no payment/bank action",
        "no notification/calendar action",
      ]) {
        assert.equal(
          validMockSaveState.reviewText.includes(expectedReviewText),
          true,
          `Expected mock save confirmation review text: ${expectedReviewText}`,
        );
      }
      assert.equal(
        /[A-Z]{2,}-\d{3,}/.test(validMockSaveState.reviewText),
        false,
        "Expected mock save confirmation review not to create an invoice number",
      );

      await clickRegularCustomerMockSaveReviewButton("confirm", "confirm mock save review");
      const confirmedMockSaveReviewState = await waitForCondition(
        async () => {
          const candidateState = await readRegularCustomerMockSaveState();
          return candidateState.reviewFeedback.includes("Future real save will require business approval")
            ? candidateState
            : false;
        },
        10000,
        "regular customer confirm mock save review local feedback",
      );
      assert.equal(
        confirmedMockSaveReviewState.reviewVisible,
        true,
        "Expected confirming mock save review to keep the review panel visible",
      );
      assert.equal(
        confirmedMockSaveReviewState.reviewFeedbackTone,
        "success",
        "Expected confirming mock save review to show success feedback near the panel",
      );
      for (const expectedConfirmText of [
        "Supabase implementation",
        "No save happened now",
        "no booking was saved",
        "no customer folder was linked",
        "no local row was added or removed",
        "no row data changed",
        "no invoice number or audit record was created",
        "no Supabase, payment, bank, notification, or calendar call was made",
      ]) {
        assert.equal(
          confirmedMockSaveReviewState.reviewFeedback.includes(expectedConfirmText),
          true,
          `Expected confirm mock save review feedback text: ${expectedConfirmText}`,
        );
      }
      assert.equal(
        confirmedMockSaveReviewState.listRowCount,
        0,
        "Expected confirming mock save review not to add a local monthly billing row",
      );
      assert.equal(
        confirmedMockSaveReviewState.emptyPreview,
        true,
        "Expected confirming mock save review not to create a mock preview",
      );
      assert.equal(
        /[A-Z]{2,}-\d{3,}/.test(confirmedMockSaveReviewState.reviewFeedback),
        false,
        "Expected confirming mock save review not to allocate an invoice number",
      );
      assert.deepEqual(
        confirmedMockSaveReviewState.integrationCalls.filter((call) =>
          blockedCustomerIntegrationPattern.test(call),
        ),
        [],
        "Expected confirming mock save review not to call Supabase, payment, bank, notification, or calendar APIs",
      );

      await clickRegularCustomerMockSaveReviewButton("dismiss", "dismiss mock save review");
      const dismissedMockSaveReviewState = await waitForCondition(
        async () => {
          const candidateState = await readRegularCustomerMockSaveState();
          return !candidateState.reviewVisible ? candidateState : false;
        },
        10000,
        "regular customer dismiss mock save review",
      );
      assert.equal(
        dismissedMockSaveReviewState.listRowCount,
        0,
        "Expected dismissing mock save review not to add a local monthly billing row",
      );
      assert.equal(
        dismissedMockSaveReviewState.formValues.passengerName,
        "Browser Test Passenger",
        "Expected dismissing mock save review not to change form data",
      );
      assert.equal(
        dismissedMockSaveReviewState.formValues.customerId,
        "ubs",
        "Expected dismissing mock save review not to change selected customer",
      );
      assert.deepEqual(
        dismissedMockSaveReviewState.integrationCalls.filter((call) =>
          blockedCustomerIntegrationPattern.test(call),
        ),
        [],
        "Expected dismissing mock save review not to call Supabase, payment, bank, notification, or calendar APIs",
      );
      const validSavedVisibilityState = await readRegularCustomerSavedVisibilityState();
      assert.equal(
        validSavedVisibilityState.rowCount,
        0,
        "Expected future saved booking visibility placeholder not to add rows after valid mock save",
      );
      assert.deepEqual(
        validSavedVisibilityState.buttons,
        [],
        "Expected future saved booking visibility placeholder to have no save/link action after valid mock save",
      );
      assert.equal(
        validSavedVisibilityState.localRowNote.includes("No saved booking visibility data exists now"),
        true,
        "Expected future saved booking visibility placeholder not to show saved data after valid mock save",
      );
      assert.equal(
        /[A-Z]{2,}-\d{3,}/.test(validSavedVisibilityState.text),
        false,
        "Expected future saved booking visibility placeholder not to create an invoice number after valid mock save",
      );
      assert.deepEqual(
        validSavedVisibilityState.integrationCalls.filter((call) => blockedCustomerIntegrationPattern.test(call)),
        [],
        "Expected future saved booking visibility placeholder not to call Supabase, payment, bank, notification, or calendar APIs after valid mock save",
      );

      const regularBookingClicked = await evaluate(`(() => {
        const button = document.querySelector("[data-regular-customer-booking-submit]");

        if (!button || button.disabled) {
          return false;
        }

        button.click();
        return true;
      })()`);
      assert.equal(regularBookingClicked, true, "Expected regular customer booking preview button to be clickable");

      const regularBookingActionState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const preview = document.querySelector("[data-regular-customer-booking-preview]");

            if (!preview) {
              return false;
            }

            return {
              feedback:
                document.querySelector("[data-regular-customer-booking-feedback]")?.textContent.trim() || "",
              folderLink:
                document.querySelector("[data-regular-customer-preview-folder-link]")?.getAttribute("href") || "",
              integrationCalls: window.__customerPaymentIntegrationCalls || [],
              listRows: [...document.querySelectorAll("[data-regular-customer-booking-list-row]")].map((row) => ({
                folderLink:
                  row.querySelector("[data-regular-customer-booking-list-folder-link]")?.getAttribute("href") || "",
                noSaveBoundary:
                  row.querySelector("[data-regular-customer-booking-list-no-save-boundary]")?.textContent.trim() || "",
                text: row.innerText,
              })),
              noSaveBoundary:
                document.querySelector("[data-regular-customer-booking-no-save-boundary]")?.textContent.trim() || "",
              previewText: preview.innerText,
            };
          })()`),
        10000,
        "regular customer booking mock/local preview",
      );

      assert.equal(
        regularBookingActionState.feedback.includes("UBS mock/local preview created"),
        true,
        "Expected regular customer booking feedback near submit button",
      );
      assert.equal(
        regularBookingActionState.feedback.includes("No booking was saved"),
        true,
        "Expected regular customer booking feedback to confirm no save",
      );
      assert.equal(
        regularBookingActionState.feedback.includes("no invoice number was created"),
        true,
        "Expected regular customer booking feedback to confirm no invoice number",
      );
      assert.equal(
        regularBookingActionState.feedback.includes("no payment, bank, or Supabase call was made"),
        true,
        "Expected regular customer booking feedback to confirm no integration call",
      );
      assert.equal(
        regularBookingActionState.previewText.includes("Mock/local preview only"),
        true,
        "Expected regular customer booking preview to be clearly mock/local",
      );
      for (const expectedPreviewText of [
        "Browser Test Booker",
        "Browser Test Passenger",
        "Changi Airport T3",
        "Raffles Place",
        "2026-05",
        "unbilled / draft",
        "monthly bank transfer manual",
        "Invoice number: Not created",
      ]) {
        assert.equal(
          regularBookingActionState.previewText.includes(expectedPreviewText),
          true,
          `Expected regular customer booking preview text: ${expectedPreviewText}`,
        );
      }
      assert.equal(
        /[A-Z]{2,}-\d{3,}/.test(regularBookingActionState.previewText),
        false,
        "Expected regular customer booking preview not to allocate an invoice number",
      );
      assert.equal(
        regularBookingActionState.noSaveBoundary,
        "Booking save: Not saved. Customer link write: Not written. Invoice/statement: Not generated. Notification/calendar/payment/bank/Supabase calls: None.",
        "Expected regular customer booking no-save boundary",
      );
      assert.equal(
        regularBookingActionState.folderLink,
        "/customers/ubs",
        "Expected regular customer booking preview to link to the selected mock customer folder",
      );
      assert.deepEqual(
        regularBookingActionState.integrationCalls.filter((call) => blockedCustomerIntegrationPattern.test(call)),
        [],
        "Expected regular customer booking preview not to call Supabase, payment, bank, notification, or calendar APIs",
      );
      assert.equal(
        regularBookingActionState.listRows.length,
        1,
        "Expected valid regular customer submit to add one local monthly billing list row",
      );
      for (const expectedListText of [
        "Browser Test Passenger",
        "Changi Airport T3",
        "Raffles Place",
        "Airport Arrival / Alphard / Vellfire",
        "2026-05 / unbilled / draft",
        "monthly bank transfer manual",
        "PO MAY TEST",
        "Not created",
        "List row only. No save, invoice, statement, notification, calendar, payment, bank, audit, or Supabase record.",
      ]) {
        assert.equal(
          regularBookingActionState.listRows[0].text.includes(expectedListText),
          true,
          `Expected regular customer monthly billing list row text: ${expectedListText}`,
        );
      }
      assert.equal(
        regularBookingActionState.listRows[0].text.toLowerCase().includes("invoice number"),
        true,
        "Expected regular customer booking list row to show the invoice number status label",
      );
      assert.equal(
        /[A-Z]{2,}-\d{3,}/.test(regularBookingActionState.listRows[0].text),
        false,
        "Expected regular customer booking list not to allocate an invoice number",
      );
      assert.equal(
        regularBookingActionState.listRows[0].folderLink,
        "/customers/ubs",
        "Expected regular customer booking list row to link to the selected mock customer folder",
      );
      assert.equal(
        regularBookingActionState.listRows[0].noSaveBoundary,
        "List row only. No save, invoice, statement, notification, calendar, payment, bank, audit, or Supabase record.",
        "Expected regular customer booking list row no-save boundary",
      );
      assert.equal(
        (await readRegularCustomerBookingListState()).countText,
        "Showing 1 of 1 local mock row.",
        "Expected regular customer booking list count after first valid submit",
      );
      const savedVisibilityWithOneLocalRowState = await readRegularCustomerSavedVisibilityState();
      assert.equal(
        savedVisibilityWithOneLocalRowState.rowCount,
        1,
        "Expected future saved booking visibility placeholder to observe one local row without creating it",
      );
      assert.equal(
        savedVisibilityWithOneLocalRowState.localRowNote.includes(
          "1 local mock monthly billing row is present on this page",
        ),
        true,
        "Expected future saved booking visibility placeholder to explain the local row is still mock-only",
      );
      for (const expectedSavedVisibilityAfterRowText of [
        "Future saved booking will appear here after real save is approved",
        "none is saved, linked, audited, invoiced, paid, synced, sent, or written to Supabase",
      ]) {
        assert.equal(
          savedVisibilityWithOneLocalRowState.localRowNote.includes(expectedSavedVisibilityAfterRowText),
          true,
          `Expected future saved booking visibility local-row note: ${expectedSavedVisibilityAfterRowText}`,
        );
      }
      assert.deepEqual(
        savedVisibilityWithOneLocalRowState.buttons,
        [],
        "Expected future saved booking visibility placeholder not to expose actions after a local row exists",
      );
      assert.equal(
        /[A-Z]{2,}-\d{3,}/.test(savedVisibilityWithOneLocalRowState.text),
        false,
        "Expected future saved booking visibility placeholder not to create an invoice number after a local row exists",
      );
      assert.deepEqual(
        savedVisibilityWithOneLocalRowState.integrationCalls.filter((call) =>
          blockedCustomerIntegrationPattern.test(call),
        ),
        [],
        "Expected future saved booking visibility placeholder not to call Supabase, payment, bank, notification, or calendar APIs after a local row exists",
      );

      for (const [field, value] of Object.entries(secondRegularCustomerBookingFields)) {
        await setRegularCustomerBookingField(field, value);
      }

      const secondRegularBookingClicked = await evaluate(`(() => {
        const button = document.querySelector("[data-regular-customer-booking-submit]");

        if (!button || button.disabled) {
          return false;
        }

        button.click();
        return true;
      })()`);
      assert.equal(secondRegularBookingClicked, true, "Expected second regular customer booking submit to be clickable");

      const regularBookingTwoRowsState = await waitForCondition(
        async () => {
          const candidateState = await readRegularCustomerBookingListState();
          return candidateState.rows.length === 2 ? candidateState : false;
        },
        10000,
        "regular customer booking second mock/local row",
      );
      assert.equal(
        regularBookingTwoRowsState.countText,
        "Showing 2 of 2 local mock rows.",
        "Expected regular customer booking list count after second valid submit",
      );
      for (const expectedListText of [
        "Browser Test Passenger",
        "Browser Filter Passenger",
        "UBS",
        "Ritz Carlton",
        "2026-05 / unbilled / draft",
        "2026-06 / unbilled / draft",
        "PO MAY TEST",
        "PO JUN TEST",
        "Not created",
      ]) {
        assert.equal(
          regularBookingTwoRowsState.listText.includes(expectedListText),
          true,
          `Expected two-row regular customer list text: ${expectedListText}`,
        );
      }
      assert.deepEqual(
        regularBookingTwoRowsState.rows.map((row) => row.actions),
        [
          ["Edit mock row", "Amend mock row", "Cancel mock row"],
          ["Edit mock row", "Amend mock row", "Cancel mock row"],
        ],
        "Expected each local mock booking row to expose edit/amend/cancel controls",
      );
      for (const row of regularBookingTwoRowsState.rows) {
        for (const expectedActionBoundaryText of [
          "Mock/local only.",
          "Internal staff-only.",
          "Not saved.",
          "No audit record created yet.",
          "No invoice, payment, bank, notification, calendar, or Supabase action.",
        ]) {
          assert.equal(
            row.actionBoundary.includes(expectedActionBoundaryText),
            true,
            `Expected regular customer row action boundary text: ${expectedActionBoundaryText}`,
          );
        }
        assert.equal(
          row.actionFeedback.includes("Choose a mock row action"),
          true,
          "Expected row action helper to start as local guidance",
        );
        assert.equal(row.invoiceNumber, "Not created", "Expected row action controls not to create invoice numbers");
      }

      const mockRowActionExpectations = [
        {
          action: "edit",
          messageText: ["edit workflow is planned but not active yet", "Row data was not changed"],
        },
        {
          action: "amend",
          messageText: ["amend workflow is planned but not active yet", "reason and old/new value review"],
        },
        {
          action: "cancel",
          messageText: ["cancel workflow is planned but not active yet", "not removed", "billing review"],
        },
      ];

      for (const { action, messageText } of mockRowActionExpectations) {
        await clickRegularCustomerMockRowAction(0, action, `regular customer ${action} mock row`);
        const rowActionState = await waitForCondition(
          async () => {
            const candidateState = await readRegularCustomerBookingListState();
            return candidateState.rows[0]?.actionFeedbackKind === action ? candidateState : false;
          },
          10000,
          `regular customer ${action} mock row local feedback`,
        );
        const activeRow = rowActionState.rows[0];

        assert.equal(rowActionState.rows.length, 2, `Expected ${action} mock row not to remove list rows`);
        assert.equal(
          rowActionState.countText,
          "Showing 2 of 2 local mock rows.",
          `Expected ${action} mock row not to change the local list count`,
        );
        assert.equal(
          activeRow.passengerText.includes("Browser Filter Passenger"),
          true,
          `Expected ${action} mock row not to change the passenger row data`,
        );
        assert.equal(
          activeRow.billingStatus,
          "2026-06 / unbilled / draft",
          `Expected ${action} mock row not to change billing status`,
        );
        assert.equal(activeRow.invoiceNumber, "Not created", `Expected ${action} mock row not to create an invoice number`);
        assert.equal(
          activeRow.distanceFromActiveAction < 180,
          true,
          `Expected ${action} mock row feedback near the clicked row control`,
        );
        for (const expectedMessageText of messageText) {
          assert.equal(
            activeRow.actionFeedback.includes(expectedMessageText),
            true,
            `Expected ${action} mock row feedback text: ${expectedMessageText}`,
          );
        }
        assert.deepEqual(
          rowActionState.integrationCalls.filter((call) => blockedCustomerIntegrationPattern.test(call)),
          [],
          `Expected ${action} mock row not to call Supabase, payment, bank, notification, or calendar APIs`,
        );
      }

      await setRegularCustomerBookingListFilter("customerId", "ubs");
      const regularBookingCustomerFilterState = await waitForCondition(
        async () => {
          const candidateState = await readRegularCustomerBookingListState();
          return candidateState.countText === "Showing 1 of 2 local mock rows." ? candidateState : false;
        },
        10000,
        "regular customer booking customer local filter",
      );
      assert.equal(
        regularBookingCustomerFilterState.rows.length,
        1,
        "Expected customer filter to show one local mock row",
      );
      assert.equal(
        regularBookingCustomerFilterState.rows[0].text.includes("Browser Test Passenger"),
        true,
        "Expected customer filter to show the UBS local row",
      );
      assert.equal(
        regularBookingCustomerFilterState.feedback.includes("Local mock filters updated"),
        true,
        "Expected customer filter feedback near local filter controls",
      );
      assert.deepEqual(
        regularBookingCustomerFilterState.integrationCalls.filter((call) =>
          blockedCustomerIntegrationPattern.test(call),
        ),
        [],
        "Expected customer local filter not to call Supabase, payment, bank, notification, or calendar APIs",
      );

      await setRegularCustomerBookingListFilter("customerId", "");
      await setRegularCustomerBookingListFilter("billingMonth", "2026-06");
      const regularBookingMonthFilterState = await waitForCondition(
        async () => {
          const candidateState = await readRegularCustomerBookingListState();
          return candidateState.countText === "Showing 1 of 2 local mock rows." &&
            candidateState.rows[0]?.text.includes("Browser Filter Passenger")
            ? candidateState
            : false;
        },
        10000,
        "regular customer booking billing month local filter",
      );
      assert.equal(
        regularBookingMonthFilterState.rows[0].text.includes("Ritz Carlton"),
        true,
        "Expected billing month filter to show the June local row",
      );
      assert.deepEqual(
        regularBookingMonthFilterState.integrationCalls.filter((call) =>
          blockedCustomerIntegrationPattern.test(call),
        ),
        [],
        "Expected billing month local filter not to call Supabase, payment, bank, notification, or calendar APIs",
      );

      await clickRegularCustomerDraftInvoicePreview("single-customer draft invoice preview");
      const regularDraftSinglePreviewState = await waitForCondition(
        async () => {
          const candidateState = await readRegularCustomerDraftInvoiceState();
          return candidateState.previewVisible && candidateState.rows.length === 1 ? candidateState : false;
        },
        10000,
        "regular customer draft invoice preview for one filtered row",
      );
      assert.equal(
        regularDraftSinglePreviewState.feedback.includes("1 visible local mock row added"),
        true,
        "Expected single-row draft invoice preview feedback near its button",
      );
      for (const expectedDraftText of [
        "Mock/local draft invoice preview",
        "Draft Preview / Not Issued",
        "internal staff-only",
        "Ritz Carlton",
        "2026-06",
        "monthly bank transfer manual",
        "Not created",
        "Browser Filter Passenger",
        "Ritz Carlton",
        "Marina Bay Cruise Centre",
        "Point-to-Point Transfer / Mercedes E-Class",
        "PO JUN TEST",
        "Amount not calculated in this mock preview",
        "No subtotal, GST, discount, or grand total is created",
      ]) {
        assert.equal(
          regularDraftSinglePreviewState.previewText.includes(expectedDraftText),
          true,
          `Expected single-row draft invoice preview text: ${expectedDraftText}`,
        );
      }
      assert.equal(
        regularDraftSinglePreviewState.previewText.toLowerCase().includes("invoice number"),
        true,
        "Expected single-row draft invoice preview to show the invoice number status label",
      );
      for (const expectedBoundaryText of [
        "Bank transfer is manual-record only.",
        "No bank API, payment API, payment provider, or production payment behavior.",
        "No invoice number, PDF, real invoice, statement, or sending.",
        "No Supabase save, notification, WhatsApp, email, SMS, calendar sync, or audit record.",
      ]) {
        assert.equal(
          regularDraftSinglePreviewState.noSaveBoundary.includes(expectedBoundaryText),
          true,
          `Expected single-row draft invoice locked note: ${expectedBoundaryText}`,
        );
      }
      assert.equal(
        /[A-Z]{2,}-\d{3,}/.test(regularDraftSinglePreviewState.previewText),
        false,
        "Expected single-row draft invoice preview not to allocate an invoice number",
      );
      assert.deepEqual(
        regularDraftSinglePreviewState.integrationCalls.filter((call) =>
          blockedCustomerIntegrationPattern.test(call),
        ),
        [],
        "Expected single-row draft invoice preview not to call Supabase, payment, bank, notification, or calendar APIs",
      );
      assert.equal(
        regularDraftSinglePreviewState.clearVisible,
        true,
        "Expected clear mock draft preview button to appear after creating a draft preview",
      );
      assert.equal(
        regularDraftSinglePreviewState.clearButtonText,
        "Clear Mock Draft Preview",
        "Expected clear draft preview button to be labelled clearly",
      );
      assert.equal(
        regularDraftSinglePreviewState.snapshotNotice.includes("Snapshot is current"),
        true,
        "Expected new draft preview to show the current local snapshot helper",
      );

      await setRegularCustomerBookingListFilter("billingMonth", "");
      const regularDraftStaleAfterMonthFilterState = await waitForCondition(
        async () => {
          const candidateState = await readRegularCustomerDraftInvoiceState();
          return candidateState.feedback.includes("earlier local snapshot") ? candidateState : false;
        },
        10000,
        "regular customer draft invoice stale snapshot after filter change",
      );
      assert.equal(
        regularDraftStaleAfterMonthFilterState.previewVisible,
        true,
        "Expected filter changes to keep the existing mock draft preview visible as a snapshot",
      );
      assert.equal(
        regularDraftStaleAfterMonthFilterState.rows.length,
        1,
        "Expected filter changes not to rebuild the existing draft preview automatically",
      );
      assert.equal(
        regularDraftStaleAfterMonthFilterState.snapshotNotice.includes("Filters or local rows changed"),
        true,
        "Expected filter changes to mark the existing draft preview as a snapshot",
      );
      assert.equal(
        regularDraftStaleAfterMonthFilterState.snapshotNotice.includes("create a new mock draft preview"),
        true,
        "Expected stale snapshot notice to tell staff to recreate the preview for latest filtered rows",
      );
      assert.deepEqual(
        regularDraftStaleAfterMonthFilterState.integrationCalls.filter((call) =>
          blockedCustomerIntegrationPattern.test(call),
        ),
        [],
        "Expected draft preview stale snapshot notice not to call Supabase, payment, bank, notification, or calendar APIs",
      );

      await setRegularCustomerBookingListFilter("billingStatus", "paid");
      const regularBookingStatusEmptyFilterState = await waitForCondition(
        async () => {
          const candidateState = await readRegularCustomerBookingListState();
          return candidateState.countText === "Showing 0 of 2 local mock rows." ? candidateState : false;
        },
        10000,
        "regular customer booking billing status empty local filter",
      );
      assert.equal(
        regularBookingStatusEmptyFilterState.filterEmpty,
        true,
        "Expected paid status filter to show a local empty state",
      );
      assert.equal(
        /[A-Z]{2,}-\d{3,}/.test(regularBookingStatusEmptyFilterState.listText),
        false,
        "Expected regular customer status filter not to create an invoice number",
      );
      assert.equal(
        regularBookingStatusEmptyFilterState.listText.includes("No local mock rows match these filters"),
        true,
        "Expected filtered empty state to stay local/mock",
      );
      assert.deepEqual(
        regularBookingStatusEmptyFilterState.integrationCalls.filter((call) =>
          blockedCustomerIntegrationPattern.test(call),
        ),
        [],
        "Expected billing status local filter not to call Supabase, payment, bank, notification, or calendar APIs",
      );

      await clickRegularCustomerDraftInvoicePreview("paid-filter empty draft invoice preview");
      const regularDraftFilteredEmptyState = await waitForCondition(
        async () => {
          const candidateState = await readRegularCustomerDraftInvoiceState();
          return candidateState.feedback.includes("No visible local mock booking rows") ? candidateState : false;
        },
        10000,
        "regular customer draft invoice preview for empty filtered rows",
      );
      assert.equal(
        regularDraftFilteredEmptyState.previewVisible,
        true,
        "Expected paid-filter draft invoice attempt to leave the existing mock snapshot visible",
      );
      assert.equal(
        regularDraftFilteredEmptyState.rows.length,
        1,
        "Expected paid-filter draft invoice attempt not to create a new preview row set",
      );
      assert.equal(
        regularDraftFilteredEmptyState.feedback.includes("No new draft preview was created"),
        true,
        "Expected paid-filter draft invoice attempt to explain that no new preview was created",
      );
      assert.equal(
        regularDraftFilteredEmptyState.feedbackTone,
        "error",
        "Expected paid-filter draft invoice attempt to stay local/error",
      );
      assert.deepEqual(
        regularDraftFilteredEmptyState.integrationCalls.filter((call) =>
          blockedCustomerIntegrationPattern.test(call),
        ),
        [],
        "Expected paid-filter draft invoice attempt not to call Supabase, payment, bank, notification, or calendar APIs",
      );

      await setRegularCustomerBookingListFilter("billingStatus", "unbilled / draft");
      const regularBookingStatusFilterState = await waitForCondition(
        async () => {
          const candidateState = await readRegularCustomerBookingListState();
          return candidateState.countText === "Showing 2 of 2 local mock rows." ? candidateState : false;
        },
        10000,
        "regular customer booking billing status local filter",
      );
      assert.equal(
        regularBookingStatusFilterState.rows.length,
        2,
        "Expected unbilled draft status filter to show both local mock rows",
      );
      assert.equal(
        regularBookingStatusFilterState.listText.toLowerCase().includes("invoice number"),
        true,
        "Expected billing status filter to preserve invoice number status labels",
      );
      assert.equal(
        regularBookingStatusFilterState.listText.includes("Invoice number: Not created"),
        false,
        "Expected list cards not to allocate issued invoice numbers while filtering",
      );

      await clickRegularCustomerDraftInvoicePreview("mixed draft invoice preview");
      const regularDraftMixedPreviewState = await waitForCondition(
        async () => {
          const candidateState = await readRegularCustomerDraftInvoiceState();
          return candidateState.previewVisible && candidateState.rows.length === 2 ? candidateState : false;
        },
        10000,
        "regular customer mixed draft invoice preview",
      );
      for (const expectedMixedDraftText of [
        "Mixed customer mock preview",
        "Mixed mock preview only; not a real customer invoice.",
        "Mixed billing months mock preview",
        "Mixed mock preview only; not a final billing period.",
        "Browser Test Passenger",
        "Browser Filter Passenger",
        "UBS / 2026-05",
        "Ritz Carlton / 2026-06",
        "2 local mock rows",
        "Draft Preview / Not Issued",
        "Amount not calculated in this mock preview",
      ]) {
        assert.equal(
          regularDraftMixedPreviewState.previewText.includes(expectedMixedDraftText),
          true,
          `Expected mixed draft invoice preview text: ${expectedMixedDraftText}`,
        );
      }
      assert.equal(
        regularDraftMixedPreviewState.feedback.includes("2 visible local mock rows added"),
        true,
        "Expected mixed draft invoice preview feedback near its button",
      );
      assert.equal(
        /[A-Z]{2,}-\d{3,}/.test(regularDraftMixedPreviewState.previewText),
        false,
        "Expected mixed draft invoice preview not to allocate an invoice number",
      );
      assert.deepEqual(
        regularDraftMixedPreviewState.integrationCalls.filter((call) =>
          blockedCustomerIntegrationPattern.test(call),
        ),
        [],
        "Expected mixed draft invoice preview not to call Supabase, payment, bank, notification, or calendar APIs",
      );
      assert.equal(
        regularDraftMixedPreviewState.clearVisible,
        true,
        "Expected clear mock draft preview control to remain visible while preview exists",
      );

      await clickRegularCustomerDraftInvoiceClear("clear mock draft invoice preview");
      const regularDraftClearedState = await waitForCondition(
        async () => {
          const draftState = await readRegularCustomerDraftInvoiceState();
          const listState = await readRegularCustomerBookingListState();
          const formState = await evaluate(`(() => ({
            customerId: document.querySelector('[data-regular-booking-field="customerId"]')?.value || "",
            customerSearch: document.querySelector("[data-customer-search]")?.value || "",
            passengerName: document.querySelector('[data-regular-booking-field="passengerName"]')?.value || "",
            pickupLocation: document.querySelector('[data-regular-booking-field="pickupLocation"]')?.value || "",
          }))()`);

          return draftState.feedback.includes("cleared locally")
            ? {
                ...draftState,
                formState,
                listState,
              }
            : false;
        },
        10000,
        "regular customer clear mock draft preview",
      );
      assert.equal(
        regularDraftClearedState.previewVisible,
        false,
        "Expected clear mock draft preview to remove only the draft preview from view",
      );
      assert.equal(
        regularDraftClearedState.emptyVisible,
        true,
        "Expected clear mock draft preview to return the preview area to its empty state",
      );
      assert.equal(
        regularDraftClearedState.emptyText.includes("No draft invoice preview selected yet."),
        true,
        "Expected clear mock draft preview to show a simple empty state title",
      );
      assert.equal(
        regularDraftClearedState.emptyText.includes("Select bookings from the mock monthly billing list"),
        true,
        "Expected clear mock draft preview empty state to guide staff back to the mock list",
      );
      assert.equal(
        regularDraftClearedState.previewText,
        "",
        "Expected clear mock draft preview to remove visible preview text",
      );
      assert.deepEqual(
        regularDraftClearedState.rows,
        [],
        "Expected clear mock draft preview to remove visible preview rows",
      );
      for (const stalePreviewText of [
        "Mixed customer mock preview",
        "Mixed billing months mock preview",
        "Browser Test Passenger",
        "Browser Filter Passenger",
        "Ritz Carlton / 2026-06",
        "UBS / 2026-05",
        "Amount not calculated in this mock preview",
        "No subtotal, GST, discount, or grand total is created",
        "Draft Preview / Not Issued",
        "unbilled / draft",
      ]) {
        assert.equal(
          regularDraftClearedState.previewAreaText.includes(stalePreviewText),
          false,
          `Expected cleared draft invoice preview area not to show stale preview text: ${stalePreviewText}`,
        );
      }
      assert.equal(
        regularDraftClearedState.clearVisible,
        true,
        "Expected clear mock draft preview control to remain beside its local feedback after clearing",
      );
      assert.equal(
        regularDraftClearedState.clearDisabled,
        true,
        "Expected clear mock draft preview control to be disabled after the preview is removed",
      );
      assert.equal(
        regularDraftClearedState.distanceFromClearButton < 160,
        true,
        "Expected clear draft preview feedback to appear near the clicked clear control",
      );
      assert.equal(
        regularDraftClearedState.listState.rows.length,
        2,
        "Expected clear mock draft preview not to remove local monthly billing list rows",
      );
      assert.equal(
        regularDraftClearedState.listState.countText,
        "Showing 2 of 2 local mock rows.",
        "Expected clear mock draft preview not to change the local list count",
      );
      assert.deepEqual(
        regularDraftClearedState.listState.filters,
        [
          { field: "customerId", value: "" },
          { field: "billingMonth", value: "" },
          { field: "billingStatus", value: "unbilled / draft" },
        ],
        "Expected clear mock draft preview not to reset the local filters",
      );
      assert.deepEqual(
        regularDraftClearedState.formState,
        {
          customerId: "ritz-carlton",
          customerSearch: "",
          passengerName: "Browser Filter Passenger",
          pickupLocation: "Ritz Carlton",
        },
        "Expected clear mock draft preview not to reset the regular customer form or customer search",
      );
      assert.deepEqual(
        regularDraftClearedState.integrationCalls.filter((call) =>
          blockedCustomerIntegrationPattern.test(call),
        ),
        [],
        "Expected clear mock draft preview not to call Supabase, payment, bank, notification, or calendar APIs",
      );

      await setRegularCustomerBookingListFilter("customerId", "ubs");
      await setRegularCustomerBookingListFilter("billingMonth", "2026-05");
      await waitForCondition(
        async () => {
          const candidateState = await readRegularCustomerBookingListState();
          return candidateState.countText === "Showing 1 of 2 local mock rows." &&
            candidateState.rows[0]?.text.includes("Browser Test Passenger")
            ? candidateState
            : false;
        },
        10000,
        "regular customer filters before recreated draft invoice preview",
      );
      await clickRegularCustomerDraftInvoicePreview("new single-row draft invoice preview after clear");
      const regularDraftPreviewAfterClearState = await waitForCondition(
        async () => {
          const candidateState = await readRegularCustomerDraftInvoiceState();
          return candidateState.previewVisible && candidateState.rows.length === 1 ? candidateState : false;
        },
        10000,
        "regular customer new mock draft invoice preview after clear",
      );
      for (const expectedNewPreviewText of [
        "Mock/local draft invoice preview",
        "UBS",
        "2026-05",
        "Browser Test Passenger",
        "PO MAY TEST",
        "Amount not calculated in this mock preview",
      ]) {
        assert.equal(
          regularDraftPreviewAfterClearState.previewText.includes(expectedNewPreviewText),
          true,
          `Expected new draft invoice preview after clear to show: ${expectedNewPreviewText}`,
        );
      }
      for (const staleClearedPreviewText of [
        "Browser Filter Passenger",
        "Ritz Carlton / 2026-06",
        "PO JUN TEST",
        "Mixed customer mock preview",
        "Mixed billing months mock preview",
      ]) {
        assert.equal(
          regularDraftPreviewAfterClearState.previewText.includes(staleClearedPreviewText),
          false,
          `Expected new draft invoice preview after clear not to show stale text: ${staleClearedPreviewText}`,
        );
      }
      assert.deepEqual(
        regularDraftPreviewAfterClearState.integrationCalls.filter((call) =>
          blockedCustomerIntegrationPattern.test(call),
        ),
        [],
        "Expected new draft invoice preview after clear not to call Supabase, payment, bank, notification, or calendar APIs",
      );

      await clickRegularCustomerDraftInvoiceClear("clear new mock draft invoice preview after recreate");
      const regularDraftSecondClearedState = await waitForCondition(
        async () => {
          const candidateState = await readRegularCustomerDraftInvoiceState();
          return candidateState.emptyVisible && candidateState.feedback.includes("cleared locally")
            ? candidateState
            : false;
        },
        10000,
        "regular customer clear recreated mock draft invoice preview",
      );
      assert.equal(
        regularDraftSecondClearedState.previewAreaText.includes("Browser Test Passenger"),
        false,
        "Expected clearing the recreated draft invoice preview not to leave stale UBS passenger text",
      );
      assert.equal(
        regularDraftSecondClearedState.previewAreaText.includes("UBS / 2026-05"),
        false,
        "Expected clearing the recreated draft invoice preview not to leave stale UBS month text",
      );

      const clearRegularBookingFiltersClicked = await evaluate(`(() => {
        const button = document.querySelector("[data-regular-customer-booking-list-clear-filters]");

        if (!button || button.disabled) {
          return false;
        }

        button.click();
        return true;
      })()`);
      assert.equal(
        clearRegularBookingFiltersClicked,
        true,
        "Expected regular customer booking list clear filters button to be clickable",
      );
      const regularBookingClearFiltersState = await waitForCondition(
        async () => {
          const candidateState = await readRegularCustomerBookingListState();
          return candidateState.feedback.includes("Local mock filters cleared") ? candidateState : false;
        },
        10000,
        "regular customer booking clear local filters",
      );
      assert.equal(
        regularBookingClearFiltersState.countText,
        "Showing 2 of 2 local mock rows.",
        "Expected clearing local filters to show both local mock rows",
      );
      assert.deepEqual(
        regularBookingClearFiltersState.filters,
        [
          { field: "customerId", value: "" },
          { field: "billingMonth", value: "" },
          { field: "billingStatus", value: "" },
        ],
        "Expected regular customer booking list filters to clear locally",
      );
      assert.deepEqual(
        regularBookingClearFiltersState.integrationCalls.filter((call) =>
          blockedCustomerIntegrationPattern.test(call),
        ),
        [],
        "Expected clearing regular customer filters not to call Supabase, payment, bank, notification, or calendar APIs",
      );
      assert.equal(
        (await readRegularCustomerDraftInvoiceState()).previewVisible,
        false,
        "Expected clearing local filters to clear only the draft preview, not the booking list",
      );

      const regularBookingClearClicked = await evaluate(`(() => {
        const button = document.querySelector("[data-regular-customer-booking-clear]");

        if (!button || button.disabled) {
          return false;
        }

        button.click();
        return true;
      })()`);
      assert.equal(regularBookingClearClicked, true, "Expected regular customer booking clear button to be clickable");

      const regularBookingClearState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const feedback =
              document.querySelector("[data-regular-customer-booking-clear-feedback]")?.textContent.trim() || "";

            if (!feedback.includes("cleared locally")) {
              return false;
            }

            return {
              emptyPreview: Boolean(document.querySelector("[data-regular-customer-booking-empty-preview]")),
              feedback,
              integrationCalls: window.__customerPaymentIntegrationCalls || [],
              listRowCount: document.querySelectorAll("[data-regular-customer-booking-list-row]").length,
            };
          })()`),
        10000,
        "regular customer booking local clear",
      );

      assert.equal(
        regularBookingClearState.emptyPreview,
        true,
        "Expected regular customer booking clear to remove only the local preview",
      );
      assert.equal(
        regularBookingClearState.feedback.includes("No booking, customer folder, billing, invoice, calendar, payment, bank, notification, or Supabase record was changed."),
        true,
        "Expected regular customer booking clear feedback near the clear button",
      );
      assert.deepEqual(
        regularBookingClearState.integrationCalls.filter((call) => blockedCustomerIntegrationPattern.test(call)),
        [],
        "Expected regular customer booking clear not to call Supabase, payment, bank, notification, or calendar APIs",
      );
      assert.equal(
        regularBookingClearState.listRowCount,
        2,
        "Expected regular customer booking clear to keep local monthly billing list rows",
      );

      await clickMockStatementPreviewAction("ubs", "Preview Mock Statement");

      const statementPreviewActionState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const eventRows = [...document.querySelectorAll("[data-mock-statement-preview-event]")].map((event) => ({
              customer: event.getAttribute("data-mock-statement-preview-event"),
              text: event.innerText,
            }));

            if (eventRows.length < 1) {
              return false;
            }

            return {
              eventLogBoundary:
                document.querySelector("[data-mock-statement-preview-log-boundary]")?.textContent.trim() || "",
              eventLogText: document.querySelector("[data-mock-statement-preview-log]")?.innerText || "",
              eventRows,
              feedback:
                document.querySelector("[data-statement-preview-feedback='ubs']")?.textContent.trim() || "",
              integrationCalls: window.__customerPaymentIntegrationCalls || [],
              statementRows: [...document.querySelectorAll("[data-monthly-statement-row]")].map((row) =>
                row.getAttribute("data-monthly-statement-row"),
              ),
            };
          })()`),
        10000,
        "mock statement preview action updates",
      );

      assert.deepEqual(
        statementPreviewActionState.statementRows,
        ["ubs:UBS-0003", "ubs:UBS-0004"],
        "Expected Preview Mock Statement to keep statement preview rows read-only",
      );
      assert.equal(
        statementPreviewActionState.feedback.includes("UBS mock statement preview opened locally"),
        true,
        "Expected Preview Mock Statement feedback near the UBS preview control",
      );
      assert.equal(
        statementPreviewActionState.eventLogBoundary,
        "Mock only. No statement record, invoice record, payment record, bank record, notification, WhatsApp message, email, SMS, or Supabase row is created.",
        "Expected statement preview log to keep the no-record/no-send boundary after action",
      );
      for (const expectedEventText of [
        "UBS",
        "May 2026 billing cycle (mock preview)",
        "Previewed mock statement",
        "Mock statement preview only",
        "no statement record",
        "WhatsApp message",
        "Supabase row",
      ]) {
        assert.ok(
          statementPreviewActionState.eventLogText.includes(expectedEventText),
          `Expected mock statement preview log text: ${expectedEventText}`,
        );
      }
      assert.deepEqual(
        statementPreviewActionState.integrationCalls.filter((call) =>
          /stripe|hitpay|paypal|paynow|api\/payment|api\/bank|api\/email|api\/sms|webhook|notification|whatsapp|email|sms|supabase|\/rest\/v1\//i.test(call),
        ),
        [],
        "Expected Preview Mock Statement not to call payment, bank, webhook, notification, WhatsApp, email, SMS, or Supabase resources",
      );

      await clickMockFollowUpAction("ubs:UBS-0003", "schedule", "Schedule Follow-up");
      await clickMockFollowUpAction("ritz-carlton:RITZ-0003", "done", "Mark Follow-up Done");
      await clickMockFollowUpAction("vip-customer:VIP-0003", "note", "Add Mock Note");

      const followUpActionState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const rows = [...document.querySelectorAll("[data-collection-follow-up-row]")].map((row) => ({
              id: row.getAttribute("data-collection-follow-up-row"),
              text: row.innerText,
            }));
            const eventRows = [...document.querySelectorAll("[data-mock-follow-up-event]")].map((event) => ({
              invoice: event.getAttribute("data-mock-follow-up-event"),
              text: event.innerText,
            }));

            if (eventRows.length < 3) {
              return false;
            }

            return {
              eventLogBoundary:
                document.querySelector("[data-mock-follow-up-event-log-boundary]")?.textContent.trim() || "",
              eventLogText: document.querySelector("[data-mock-follow-up-event-log]")?.innerText || "",
              eventRows,
              followUpSectionFeedback:
                document.querySelector("[data-follow-up-section-feedback]")?.textContent.trim() || "",
              integrationCalls: window.__customerPaymentIntegrationCalls || [],
              rowFeedback: Object.fromEntries(
                [...document.querySelectorAll("[data-follow-up-action-feedback]")].map((feedback) => [
                  feedback.getAttribute("data-follow-up-action-feedback"),
                  feedback.textContent.trim(),
                ]),
              ),
              rows,
            };
          })()`),
        10000,
        "mock collection follow-up action updates",
      );

      assert.deepEqual(
        followUpActionState.rows.map((row) => row.id),
        [
          "ubs:UBS-0003",
          "ubs:UBS-0004",
          "ritz-carlton:RITZ-0003",
          "ritz-carlton:RITZ-0004",
          "vip-customer:VIP-0003",
        ],
        "Expected mock follow-up actions to keep collection rows visible while balances remain due",
      );
      assert.equal(
        followUpActionState.rows.find((row) => row.id === "ubs:UBS-0003")?.text.includes("Tomorrow (mock/local)"),
        true,
        "Expected Schedule Follow-up to update the local follow-up date",
      );
      assert.equal(
        followUpActionState.rowFeedback["ubs:UBS-0003"]?.includes("follow-up scheduled locally"),
        true,
        "Expected Schedule Follow-up feedback near that row",
      );
      assert.equal(
        followUpActionState.rowFeedback["ritz-carlton:RITZ-0003"]?.includes("follow-up marked done locally"),
        true,
        "Expected Mark Follow-up Done feedback near that row",
      );
      assert.equal(
        followUpActionState.rowFeedback["vip-customer:VIP-0003"]?.includes("mock note added locally"),
        true,
        "Expected Add Mock Note feedback near that row",
      );
      assert.equal(
        followUpActionState.followUpSectionFeedback.includes("VIP-0003 mock note added locally"),
        true,
        "Expected section feedback near follow-up controls after Add Mock Note",
      );
      for (const expectedEventText of [
        "UBS-0003",
        "Scheduled follow-up",
        "RITZ-0003",
        "Marked follow-up done",
        "VIP-0003",
        "Added mock note",
        "Mock follow-up schedule only",
        "Mock follow-up completion only",
        "Mock note only",
      ]) {
        assert.ok(
          followUpActionState.eventLogText.includes(expectedEventText),
          `Expected mock follow-up event log text: ${expectedEventText}`,
        );
      }
      assert.equal(
        followUpActionState.eventLogBoundary,
        "Mock only. No notification, WhatsApp message, email, payment record, bank record, or Supabase row is created.",
        "Expected follow-up event log to keep the no-send/no-record boundary after actions",
      );
      assert.deepEqual(
        followUpActionState.integrationCalls.filter((call) =>
          /stripe|hitpay|paypal|paynow|api\/payment|api\/bank|api\/email|api\/sms|webhook|notification|whatsapp|email|sms|supabase|\/rest\/v1\//i.test(call),
        ),
        [],
        "Expected mock follow-up buttons not to call payment, bank, webhook, notification, WhatsApp, email, SMS, or Supabase resources",
      );

      await clickMockPaymentAction("ritz-carlton:RITZ-0004", "invoice-sent", "Mark Invoice Sent");
      await clickMockPaymentAction("ubs:UBS-0004", "partial-payment", "Record Partial Payment");
      await clickMockPaymentAction("ritz-carlton:RITZ-0003", "paid", "Mark Paid");
      await clickMockPaymentAction("vip-customer:VIP-0003", "waived", "Waive Balance");

      const paymentActionState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const rows = [...document.querySelectorAll("[data-outstanding-payment-row]")].map((row) => ({
              id: row.getAttribute("data-outstanding-payment-row"),
              text: row.innerText,
            }));
            const followUpRows = [...document.querySelectorAll("[data-collection-follow-up-row]")].map((row) => ({
              id: row.getAttribute("data-collection-follow-up-row"),
              text: row.innerText,
            }));
            const eventRows = [...document.querySelectorAll("[data-mock-payment-event]")].map((event) => ({
              invoice: event.getAttribute("data-mock-payment-event"),
              text: event.innerText,
            }));

            if (
              eventRows.length < 4 ||
              rows.some((row) => row.id === "ritz-carlton:RITZ-0003") ||
              rows.some((row) => row.id === "vip-customer:VIP-0003") ||
              followUpRows.some((row) => row.id === "ritz-carlton:RITZ-0003") ||
              followUpRows.some((row) => row.id === "vip-customer:VIP-0003")
            ) {
              return false;
            }

            return {
              eventLogBoundary:
                document.querySelector("[data-mock-payment-event-log-boundary]")?.textContent.trim() || "",
              eventLogText: document.querySelector("[data-mock-payment-event-log]")?.innerText || "",
              eventRows,
              followUpRows,
              integrationCalls: window.__customerPaymentIntegrationCalls || [],
              paymentSectionFeedback:
                document.querySelector("[data-payment-section-feedback]")?.textContent.trim() || "",
              rowFeedback: Object.fromEntries(
                [...document.querySelectorAll("[data-payment-action-feedback]")].map((feedback) => [
                  feedback.getAttribute("data-payment-action-feedback"),
                  feedback.textContent.trim(),
                ]),
              ),
              rows,
            };
          })()`),
        10000,
        "mock manual payment action updates",
      );

      assert.deepEqual(
        paymentActionState.rows.map((row) => row.id),
        ["ubs:UBS-0003", "ubs:UBS-0004", "ritz-carlton:RITZ-0004"],
        "Expected paid and waived mock rows to leave Outstanding Payments Review locally",
      );
      assert.deepEqual(
        paymentActionState.followUpRows.map((row) => row.id),
        ["ubs:UBS-0003", "ubs:UBS-0004", "ritz-carlton:RITZ-0004"],
        "Expected paid and waived mock rows to leave Collection Follow-up Queue locally",
      );
      assert.equal(
        paymentActionState.rows.find((row) => row.id === "ubs:UBS-0004")?.text.includes("Partially Paid"),
        true,
        "Expected Record Partial Payment to keep the row visible with partial status",
      );
      assert.equal(
        paymentActionState.rows.find((row) => row.id === "ubs:UBS-0004")?.text.includes("$600"),
        true,
        "Expected Record Partial Payment to show a local remaining balance",
      );
      assert.equal(
        paymentActionState.rows.find((row) => row.id === "ritz-carlton:RITZ-0004")?.text.includes("Invoice Sent"),
        true,
        "Expected Mark Invoice Sent to keep the row visible with invoice-sent status",
      );
      assert.equal(
        paymentActionState.rowFeedback["ritz-carlton:RITZ-0004"]?.includes("marked invoice sent locally"),
        true,
        "Expected Mark Invoice Sent feedback near that row",
      );
      assert.equal(
        paymentActionState.rowFeedback["ubs:UBS-0004"]?.includes("partial payment recorded locally"),
        true,
        "Expected Record Partial Payment feedback near that row",
      );
      assert.equal(
        paymentActionState.paymentSectionFeedback.includes("VIP-0003 balance waived locally"),
        true,
        "Expected section feedback near the controls after a removed-row action",
      );
      for (const expectedEventText of [
        "RITZ-0004",
        "Marked invoice sent",
        "UBS-0004",
        "Recorded partial payment",
        "RITZ-0003",
        "Marked paid",
        "VIP-0003",
        "Waived balance",
        "Mock invoice-sent status only",
        "Mock partial payment only",
        "Mock paid action only",
        "Mock waiver only",
      ]) {
        assert.ok(
          paymentActionState.eventLogText.includes(expectedEventText),
          `Expected mock payment event log text: ${expectedEventText}`,
        );
      }
      assert.equal(
        paymentActionState.eventLogBoundary,
        "Mock only. No payment record, invoice record, bank record, notification, or Supabase row is created.",
        "Expected event log to keep the no-record boundary after actions",
      );
      assert.deepEqual(
        paymentActionState.integrationCalls.filter((call) =>
          /stripe|hitpay|paypal|paynow|api\/payment|api\/bank|api\/email|api\/sms|webhook|notification|whatsapp|email|sms|supabase|\/rest\/v1\//i.test(call),
        ),
        [],
        "Expected mock payment buttons not to call payment, bank, webhook, notification, WhatsApp, email, SMS, or Supabase resources",
      );

      const searchCustomers = async (term, expectedRows, description) =>
        waitForCondition(
          () =>
            evaluate(`(() => {
              const input = document.querySelector("[data-customer-search]");
              const expectedRows = ${JSON.stringify(expectedRows)};
              if (!input) {
                return false;
              }

              const descriptor = Object.getOwnPropertyDescriptor(input.constructor.prototype, "value");
              descriptor?.set?.call(input, ${JSON.stringify(term)});
              input.dispatchEvent(new Event("input", { bubbles: true }));

              const rows = [...document.querySelectorAll("[data-customer-row]")].map((row) =>
                row.getAttribute("data-customer-row"),
              );
              const links = [...document.querySelectorAll("[data-open-customer-folder]")].map((link) =>
                link.getAttribute("href"),
              );
              const noResultsVisible = Boolean(document.querySelector("[data-customer-empty-state]"));
              const text = document.body.innerText;
              const rowsMatch =
                rows.length === expectedRows.length &&
                expectedRows.every((row, index) => rows[index] === row);

              if (!rowsMatch || (expectedRows.length === 0 && !noResultsVisible)) {
                return false;
              }

              return {
                links,
                noResultsVisible,
                rows,
                text,
              };
            })()`),
          10000,
          description,
        ).then((state) => {
          assert.deepEqual(state.rows, expectedRows, `Expected customer search rows for ${term}`);
          return state;
        });

      const ubsSearchState = await searchCustomers("UBS", ["ubs"], "mock customer UBS search");
      assert.equal(ubsSearchState.text.includes("UBS"), true, "Expected UBS result text");
      assert.equal(ubsSearchState.text.includes("UBS-0001, UBS-0002, UBS-0003"), true, "Expected UBS invoice examples");
      assert.deepEqual(ubsSearchState.links, ["/customers/ubs"], "Expected UBS folder link");

      const ritzSearchState = await searchCustomers("Ritz", ["ritz-carlton"], "mock customer Ritz search");
      assert.equal(ritzSearchState.text.includes("Ritz Carlton"), true, "Expected Ritz Carlton result text");
      assert.equal(
        ritzSearchState.text.includes("RITZ-0001, RITZ-0002, RITZ-0003"),
        true,
        "Expected Ritz invoice examples",
      );
      assert.deepEqual(ritzSearchState.links, ["/customers/ritz-carlton"], "Expected Ritz Carlton folder link");

      const ritzPrefixSearchState = await searchCustomers("RITZ", ["ritz-carlton"], "mock customer RITZ prefix search");
      assert.deepEqual(
        ritzPrefixSearchState.links,
        ["/customers/ritz-carlton"],
        "Expected RITZ invoice prefix search to find Ritz Carlton",
      );

      const vipSearchState = await searchCustomers("VIP", ["vip-customer"], "mock customer VIP search");
      assert.equal(
        vipSearchState.text.includes("Individual VIP Customer"),
        true,
        "Expected Individual VIP Customer result text",
      );
      assert.equal(vipSearchState.text.includes("VIP-0001, VIP-0002"), true, "Expected VIP invoice examples");
      assert.deepEqual(vipSearchState.links, ["/customers/vip-customer"], "Expected VIP folder link");

      const noMatchSearchState = await searchCustomers("No Match Customer", [], "mock customer no-match search");
      assert.equal(noMatchSearchState.noResultsVisible, true, "Expected no-results message for unmatched customer search");
      assert.equal(
        noMatchSearchState.text.includes("No mock customers match this search."),
        true,
        "Expected customer no-results message",
      );

      await searchCustomers("RITZ", ["ritz-carlton"], "mock customer Ritz folder search");
      const folderClicked = await evaluate(`(() => {
        const link = document.querySelector("[data-open-customer-folder='ritz-carlton']");
        if (!link) {
          return false;
        }

        link.click();
        return true;
      })()`);
      assert.equal(folderClicked, true, "Expected Ritz customer folder link to be clickable");
      await waitForCondition(
        () =>
          evaluate(`location.pathname === "/customers/ritz-carlton" &&
            document.body.innerText.includes("Ritz Carlton") &&
            document.body.innerText.includes("RITZ-0001, RITZ-0002, RITZ-0003")`),
        10000,
        "mock customer folder link navigation",
      );

      const inspectCustomerFolder = async ({
        customerId,
        customerName,
        excludedPaidInvoices,
        expectedRows,
        expectedText,
        unrelatedInvoices,
      }) => {
        const folderUrl = new URL(`/customers/${customerId}`, appUrl).toString();

        await setCustomerViewportAndLoad(folderUrl, desktopViewport);
        await waitForCondition(
          () =>
            evaluate(`document.body.innerText.includes("CUSTOMER FOLDER") &&
              document.body.innerText.includes(${JSON.stringify(customerName)}) &&
              Boolean(document.querySelector("[data-payment-collection-detail='${customerId}']"))`),
          10000,
          `${customerName} mock customer folder route`,
        );

        const state = await evaluate(`(() => {
          const text = document.body.innerText;
          const detail = document.querySelector("[data-payment-collection-detail='${customerId}']");
          return {
            bookingHistory: document.querySelector("[data-customer-booking-history]")?.innerText || "",
            boundary: detail?.querySelector("[data-payment-collection-boundary]")?.textContent.trim() || "",
            detailText: detail?.innerText || "",
            forbiddenText: ["driver payout", "private crm", "stripe", "hitpay", "paypal", "secret key"].filter(
              (value) => text.toLowerCase().includes(value),
            ),
            invoiceRulesText: document.querySelector("[data-customer-invoice-rules]")?.innerText || "",
            isolation:
              detail?.querySelector("[data-payment-collection-isolation]")?.textContent.trim() || "",
            paymentHistory: document.body.innerText.includes("Payment history"),
            resourceCalls: performance.getEntriesByType("resource").map((entry) => entry.name),
            rows: [...(detail?.querySelectorAll("[data-payment-collection-row]") || [])].map((row) => ({
              id: row.getAttribute("data-payment-collection-row"),
              text: row.innerText,
            })),
            statementReadiness:
              detail?.querySelector("[data-payment-collection-statement-readiness]")?.innerText || "",
            text,
          };
        })()`);

        assert.deepEqual(state.forbiddenText, [], `Expected no sensitive ${customerName} customer folder text`);
        assert.equal(
          state.boundary,
          "Mock/read-only only. No payment record, invoice record, statement record, notification, bank record, or Supabase row is created.",
          `Expected mock/read-only collection detail boundary for ${customerName}`,
        );
        assert.equal(
          state.isolation,
          "This folder only shows this selected customer's mock payment collection detail.",
          `Expected selected-customer-only boundary for ${customerName}`,
        );
        assert.deepEqual(
          state.rows.map((row) => row.id),
          expectedRows,
          `Expected active collection rows for ${customerName}`,
        );
        for (const invoiceNumber of excludedPaidInvoices) {
          assert.equal(
            state.detailText.includes(invoiceNumber),
            false,
            `Expected paid ${invoiceNumber} not to appear in active collection detail for ${customerName}`,
          );
          assert.equal(
            state.bookingHistory.includes(invoiceNumber) || state.invoiceRulesText.includes(invoiceNumber),
            true,
            `Expected paid ${invoiceNumber} to remain in ${customerName} folder history`,
          );
        }
        for (const invoiceNumber of unrelatedInvoices) {
          assert.equal(
            state.detailText.includes(invoiceNumber),
            false,
            `Expected ${customerName} payment collection detail not to leak ${invoiceNumber}`,
          );
        }
        for (const expected of expectedText) {
          assert.ok(state.text.includes(expected), `Expected ${customerName} folder text: ${expected}`);
        }
        assert.equal(state.paymentHistory, true, `Expected ${customerName} payment history to remain visible`);
        assert.equal(
          state.text.includes("All booking history"),
          true,
          `Expected ${customerName} booking history to remain visible`,
        );
        assertNoPaymentIntegrationResources(state.resourceCalls, `${customerName} customer folder`);

        return state;
      };

      const ubsFolderState = await inspectCustomerFolder({
        customerId: "ubs",
        customerName: "UBS",
        excludedPaidInvoices: ["UBS-0002"],
        expectedRows: ["ubs:UBS-0003", "ubs:UBS-0004"],
        expectedText: [
          "Payment Collection Detail",
          "UBS",
          "Fixed invoice prefix",
          "UBS",
          "Outstanding balance",
          "$1,840",
          "OVERDUE BALANCE",
          "$640",
          "UBS-0003",
          "UBS-0004",
          "Overdue",
          "Invoice Sent",
          "22 May 2026",
          "30 May 2026",
          "29 May 2026",
          "Due date passed + balance due = Overdue",
          "Invoice sent but balance remains due",
          "Paid items remain in history but are not collection due.",
          "Statement readiness",
          "Monthly account can be grouped into statement later.",
          "Mock statement-ready total: $1,840",
          "No statement is generated, saved, sent, or numbered.",
          "UBS-0001, UBS-0002, UBS-0003",
          "Payment collection rules",
        ],
        unrelatedInvoices: ["RITZ-0003", "RITZ-0004", "VIP-0003"],
      });
      assert.equal(
        ubsFolderState.statementReadiness.includes("Monthly account can be grouped into statement later."),
        true,
        "Expected UBS monthly account statement readiness",
      );

      const ritzFolderState = await inspectCustomerFolder({
        customerId: "ritz-carlton",
        customerName: "Ritz Carlton",
        excludedPaidInvoices: ["RITZ-0002"],
        expectedRows: ["ritz-carlton:RITZ-0003", "ritz-carlton:RITZ-0004"],
        expectedText: [
          "Payment Collection Detail",
          "Ritz Carlton",
          "Fixed invoice prefix",
          "RITZ",
          "Outstanding balance",
          "$800",
          "OVERDUE BALANCE",
          "$380",
          "RITZ-0003",
          "RITZ-0004",
          "Partially Paid",
          "Unpaid",
          "19 May 2026",
          "31 May 2026",
          "23 May 2026",
          "Partial payment still has balance due",
          "Completed job + balance due = Outstanding",
          "Paid items remain in history but are not collection due.",
          "RITZ-0001, RITZ-0002, RITZ-0003",
          "Payment collection rules",
        ],
        unrelatedInvoices: ["UBS-0003", "UBS-0004", "VIP-0003"],
      });
      assert.equal(
        ritzFolderState.statementReadiness,
        "",
        "Expected Ritz folder not to show monthly account statement readiness",
      );

      const vipFolderState = await inspectCustomerFolder({
        customerId: "vip-customer",
        customerName: "Individual VIP Customer",
        excludedPaidInvoices: ["VIP-0002"],
        expectedRows: ["vip-customer:VIP-0003"],
        expectedText: [
          "Payment Collection Detail",
          "Individual VIP Customer",
          "Fixed invoice prefix",
          "VIP",
          "Outstanding balance",
          "$1,700",
          "OVERDUE BALANCE",
          "$0",
          "VIP-0003",
          "Invoice Sent",
          "25 May 2026",
          "Invoice sent but balance remains due",
          "Paid items remain in history but are not collection due.",
          "VIP-0001, VIP-0002",
          "Payment collection rules",
        ],
        unrelatedInvoices: ["UBS-0003", "RITZ-0003", "RITZ-0004"],
      });
      assert.equal(
        vipFolderState.statementReadiness,
        "",
        "Expected VIP folder not to show monthly account statement readiness",
      );

      await setCustomerViewportAndLoad(customerDashboardUrl, desktopViewport);
      const outstandingFolderClicked = await evaluate(`(() => {
        const link = document.querySelector("[data-outstanding-open-customer-folder='ubs:UBS-0003']");
        if (!link) {
          return false;
        }

        link.click();
        return true;
      })()`);
      assert.equal(outstandingFolderClicked, true, "Expected outstanding review folder link to be clickable");
      await waitForCondition(
        () =>
          evaluate(`location.pathname === "/customers/ubs" &&
            document.body.innerText.includes("UBS") &&
            document.body.innerText.includes("UBS-0001, UBS-0002, UBS-0003")`),
        10000,
        "outstanding review folder link navigation",
      );

      await setCustomerViewportAndLoad(customerDashboardUrl, mobileViewport);
      const mobileDashboardState = await waitForCondition(
        () =>
          evaluate(`(() => {
            if (!document.body.innerText.includes("Mock customer payments dashboard")) {
              return false;
            }

            return {
              docClientWidth: document.documentElement.clientWidth,
              docScrollWidth: document.documentElement.scrollWidth,
              helperVisible: Boolean(document.querySelector("[data-customer-search-helper]")),
              internalStaffNotice:
                document.querySelector("[data-customer-internal-staff-notice]")?.textContent.trim() || "",
              internalStaffNoticeVisible: Boolean(document.querySelector("[data-customer-internal-staff-notice]")),
              rowCount: document.querySelectorAll("[data-customer-row]").length,
            };
          })()`),
        10000,
        "mobile mock customer dashboard",
      );
      assert.equal(mobileDashboardState.rowCount, 0, "Expected no customer rows on mobile before search");
      assert.equal(mobileDashboardState.helperVisible, true, "Expected mobile customer search helper before results");
      assert.equal(
        mobileDashboardState.internalStaffNoticeVisible,
        true,
        "Expected mobile /customers internal staff-only notice to be visible",
      );
      assert.equal(
        mobileDashboardState.internalStaffNotice.includes("Use /book for customer booking requests."),
        true,
        "Expected mobile /customers internal staff-only notice to mention /book",
      );
      assert.ok(
        mobileDashboardState.docScrollWidth <= mobileDashboardState.docClientWidth + 2,
        `Expected mobile customer dashboard not to overflow horizontally: ${mobileDashboardState.docScrollWidth} > ${mobileDashboardState.docClientWidth}`,
      );
      await checkTelegramBoundary("/customers mobile");

      await setCustomerViewportAndLoad(new URL("/customers/ubs", appUrl).toString(), mobileViewport);
      const mobileFolderState = await waitForCondition(
        () =>
          evaluate(`(() => {
            if (!document.body.innerText.includes("UBS") || !document.body.innerText.includes("All booking history")) {
              return false;
            }

            return {
              docClientWidth: document.documentElement.clientWidth,
              docScrollWidth: document.documentElement.scrollWidth,
            };
          })()`),
        10000,
        "mobile mock customer folder",
      );
      assert.ok(
        mobileFolderState.docScrollWidth <= mobileFolderState.docClientWidth + 2,
        `Expected mobile customer folder not to overflow horizontally: ${mobileFolderState.docScrollWidth} > ${mobileFolderState.docClientWidth}`,
      );

      return {
        dashboardRowsBeforeSearch: dashboardState.customerRows,
        folder: "/customers/ritz-carlton",
        mobileDashboard: mobileDashboardState,
        mobileFolder: mobileFolderState,
        searchRows: {
          noMatch: noMatchSearchState.rows,
          ritz: ritzSearchState.rows,
          ubs: ubsSearchState.rows,
          vip: vipSearchState.rows,
        },
        summaryCards: dashboardState.summaryCards,
      };
    };

    const setCustomerBookingViewportAndLoad = async (viewport) => {
      await client.send("Emulation.setDeviceMetricsOverride", {
        deviceScaleFactor: viewport.scale,
        height: viewport.height,
        mobile: viewport.mobile,
        width: viewport.width,
      });

      await navigateWithLoadEvent(client, customerBookingUrl);
      await waitForCondition(
        () => evaluate(`Boolean(document.querySelector("[data-customer-booking-page]"))`),
        10000,
        `${viewport.label} customer-facing booking route`,
      );
      await evaluate(`(() => {
        window.__customerBookingIntegrationCalls = [];
        const originalFetch = window.__customerBookingOriginalFetch || window.fetch.bind(window);
        window.__customerBookingOriginalFetch = originalFetch;
        window.fetch = (...args) => {
          const target = args[0]?.url || args[0];
          const method = args[1]?.method || args[0]?.method || "GET";
          window.__customerBookingIntegrationCalls.push(\`\${method} \${String(target)}\`);
          return originalFetch(...args);
        };

        const originalOpen = window.__customerBookingOriginalXHROpen || window.XMLHttpRequest.prototype.open;
        window.__customerBookingOriginalXHROpen = originalOpen;
        window.XMLHttpRequest.prototype.open = function patchedCustomerBookingOpen(method, url, ...rest) {
          window.__customerBookingIntegrationCalls.push(\`\${method} \${String(url)}\`);
          return originalOpen.call(this, method, url, ...rest);
        };

        if (navigator.sendBeacon && !window.__customerBookingOriginalSendBeacon) {
          const originalSendBeacon = navigator.sendBeacon.bind(navigator);
          window.__customerBookingOriginalSendBeacon = originalSendBeacon;
          navigator.sendBeacon = (...args) => {
            window.__customerBookingIntegrationCalls.push(\`BEACON \${String(args[0])}\`);
            return originalSendBeacon(...args);
          };
        }
      })()`);
    };

    const setCustomerBookingField = async (field, value) => {
      const actualValue = await evaluate(`(() => {
        if (${JSON.stringify(field)} === "pickupTime") {
          const [hour, minute] = ${JSON.stringify(value)}.split(":");
          const hourSelect = document.querySelector("[data-customer-booking-time-part='hour']");
          const minuteSelect = document.querySelector("[data-customer-booking-time-part='minute']");

          if (!hourSelect || !minuteSelect || !hour || !minute) {
            return null;
          }

          const setControlValue = (control, nextValue) => {
            const descriptor = Object.getOwnPropertyDescriptor(control.constructor.prototype, "value");
            descriptor?.set?.call(control, nextValue);
            control.dispatchEvent(new Event("input", { bubbles: true }));
            control.dispatchEvent(new Event("change", { bubbles: true }));
          };

          setControlValue(hourSelect, hour);
          setControlValue(minuteSelect, minute);

          return \`\${hourSelect.value}:\${minuteSelect.value}\`;
        }

        const input = document.querySelector(${JSON.stringify(`[data-customer-booking-field="${field}"]`)});

        if (!input) {
          return null;
        }

        const descriptor = Object.getOwnPropertyDescriptor(input.constructor.prototype, "value");
        descriptor?.set?.call(input, ${JSON.stringify(value)});
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));

        return input.value;
      })()`);
      assert.equal(actualValue, value, `Expected customer booking field ${field} to accept test value`);
    };

    const clickCustomerBookingSubmit = async (description) => {
      const clicked = await evaluate(`(() => {
        const button = document.querySelector("[data-customer-booking-submit]");

        if (!button || button.disabled) {
          return false;
        }

        button.click();
        return true;
      })()`);
      assert.equal(clicked, true, `Expected ${description} button to be clickable`);
    };

    const readCustomerBookingPageState = () =>
      evaluate(`(() => {
        const text = document.body.innerText;
        const lowerText = text.toLowerCase();
        const submit = document.querySelector("[data-customer-booking-submit]");
        const feedback = document.querySelector("[data-customer-booking-feedback]");
        const submitRect = submit?.getBoundingClientRect();
        const feedbackRect = feedback?.getBoundingClientRect();

        const fieldState = Object.fromEntries(
          [
            "companyName",
            "contactNo",
            "emailAddress",
            "passengerName",
            "pickupDate",
            "pickupTime",
            "flightNumber",
            "pickupLocation",
            "dropoffLocation",
            "serviceType",
            "vehicleType",
            "passengerCount",
            "luggage",
            "extraStops",
            "specialRequest",
          ].map((field) => {
            if (field === "pickupTime") {
              const control = document.querySelector("[data-customer-booking-field='pickupTime']");
              const valueInput = document.querySelector("[data-customer-booking-time-value]");
              const rect = control?.getBoundingClientRect();
              return [
                field,
                {
                  control: control?.getAttribute("data-customer-booking-time-control") || "",
                  label: control?.querySelector("legend")?.innerText.trim() || "",
                  required: control?.getAttribute("data-required") === "true",
                  step: control?.getAttribute("data-step") || "",
                  value: control?.getAttribute("data-value") || valueInput?.value || "",
                  visible: Boolean(rect && rect.width > 0 && rect.height >= 40),
                },
              ];
            }

            const input = document.querySelector("[data-customer-booking-field='" + field + "']");
            const rect = input?.getBoundingClientRect();
            return [
              field,
              {
                label: input?.closest("label")?.innerText.trim() || "",
                required: Boolean(input?.required),
                step: input?.getAttribute("step") || "",
                value: input?.value || "",
                visible: Boolean(rect && rect.width > 0 && rect.height >= 40),
              },
            ];
          }),
        );

        return {
          docClientWidth: document.documentElement.clientWidth,
          docScrollWidth: document.documentElement.scrollWidth,
          fieldState,
          feedbackDistanceFromSubmit:
            submitRect && feedbackRect ? Math.round(Math.abs(feedbackRect.top - submitRect.bottom)) : 999,
          feedbackText: feedback?.textContent.trim() || "",
          feedbackTone: feedback?.getAttribute("data-customer-booking-feedback-tone") || "",
          forbiddenVisibleText: [
            "invoice",
            "outstanding payment",
            "billing",
            "admin",
            "supabase",
            "mock",
            "internal",
            "statement",
            "payment follow-up",
            "replacement car",
            "replacement driver",
            "reassign replacement",
            "current driver cancelled",
          ].filter((value) => lowerText.includes(value)),
          integrationCalls: window.__customerBookingIntegrationCalls || [],
          sameTimeBlockingText: [
            "already booked",
            "same date",
            "same time",
            "time conflict",
            "time slot unavailable",
            "pickup time unavailable",
            "fully booked",
          ].filter((value) => lowerText.includes(value)),
          timeStepNote: document.querySelector("[data-customer-booking-time-step-note]")?.textContent.trim() || "",
          nativePickupTimeInputCount: document.querySelectorAll(
            "input[type='time'][name='pickupTime'], input[type='time'][data-customer-booking-field='pickupTime']",
          ).length,
          pickupMinuteOptions: [
            ...document.querySelectorAll("[data-customer-booking-time-part='minute'] option"),
          ].map((option) => option.value),
          missingFields: [...document.querySelectorAll("[data-customer-booking-missing-field]")].map((field) =>
            field.textContent.trim(),
          ),
          removedInternalControls: [
            "Customer / account",
            "Customer reference / PO",
            "Billing Month",
            "Billing Status",
            "Payment Method",
            "Invoice number",
            "Internal staff note",
          ].filter((value) => text.includes(value)),
          resourceCalls: performance.getEntriesByType("resource").map((entry) => entry.name),
          serviceOptionLabels: [
            ...document.querySelectorAll("[data-customer-booking-field='serviceType'] option"),
          ].map((option) => option.textContent.trim()),
          serviceOptionValues: [
            ...document.querySelectorAll("[data-customer-booking-field='serviceType'] option"),
          ].map((option) => option.value),
          submitVisible: Boolean(submitRect && submitRect.width > 0 && submitRect.height >= 44),
          text,
          vehicleOptionLabels: [
            ...document.querySelectorAll("[data-customer-booking-field='vehicleType'] option"),
          ].filter((option) => option.value).map((option) => option.textContent.trim()),
          vehicleOptionValues: [
            ...document.querySelectorAll("[data-customer-booking-field='vehicleType'] option"),
          ].filter((option) => option.value).map((option) => option.value),
        };
      })()`);

    const checkCustomerBookingRoute = async () => {
      const desktopViewport = { height: 900, label: "desktop customer booking", mobile: false, scale: 1, width: 1440 };
      const mobileViewport = { height: 812, label: "mobile customer booking", mobile: true, scale: 3, width: 375 };

      await setCustomerBookingViewportAndLoad(desktopViewport);

      const initialState = await readCustomerBookingPageState();
      assert.equal(
        initialState.text.includes("Booking Request"),
        true,
        "Expected /book customer-facing booking request heading",
      );
      assert.equal(
        initialState.text.includes("Submit Booking Request"),
        true,
        "Expected /book customer-safe submit button",
      );
      for (const expectedField of [
        "Customer / company name",
        "Contact no.",
        "Email address",
        "Passenger name",
        "Pickup date",
        "Pickup time",
        "Flight number if any",
        "Pickup location",
        "Drop-off location",
        "Type of Service",
        "Vehicle type",
        "Number of passengers",
        "Luggage",
        "Extra stops",
        "Special request / note",
      ]) {
        assert.equal(initialState.text.includes(expectedField), true, `Expected /book field: ${expectedField}`);
      }
      assert.deepEqual(
        Object.entries(initialState.fieldState)
          .filter(([, state]) => !state.visible)
          .map(([field]) => field),
        [],
        "Expected all customer booking fields to be visible and touch-friendly",
      );
      assert.deepEqual(
        initialState.removedInternalControls,
        [],
        "Expected /book not to show internal customer/account, PO, billing, payment, invoice, or staff-note controls",
      );
      assert.deepEqual(
        initialState.forbiddenVisibleText,
        [],
        "Expected /book not to show internal/admin/mock/finance wording",
      );
      assert.equal(initialState.fieldState.contactNo.required, true, "Expected contact no. to be required");
      assert.equal(initialState.fieldState.passengerName.required, true, "Expected passenger name to be required");
      assert.equal(initialState.fieldState.pickupDate.required, true, "Expected pickup date to be required");
      assert.equal(initialState.fieldState.pickupTime.required, true, "Expected pickup time to be required");
      assert.equal(
        initialState.fieldState.pickupTime.control,
        "selects",
        "Expected pickup time to use visible hour/minute selects",
      );
      assert.equal(initialState.fieldState.pickupTime.step, "300", "Expected pickup time to use 5-minute steps");
      assert.equal(
        initialState.nativePickupTimeInputCount,
        0,
        "Expected /book pickup time not to use a native unrestricted minute picker",
      );
      assert.deepEqual(
        initialState.pickupMinuteOptions,
        ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"],
        "Expected /book pickup minute choices to be visible 5-minute options only",
      );
      assert.deepEqual(
        initialState.pickupMinuteOptions.filter((minute) =>
          ["01", "02", "03", "04", "06", "07", "08", "09"].includes(minute),
        ),
        [],
        "Expected /book pickup minute choices not to include one-minute options",
      );
      assert.equal(
        initialState.text.includes(
          "Pickup time is selected in 5-minute intervals. Booking is not confirmed until staff replies.",
        ),
        false,
        "Expected /book not to show the removed pickup time helper sentence",
      );
      assert.equal(initialState.timeStepNote, "", "Expected /book pickup time helper sentence element to be removed");
      assert.equal(initialState.fieldState.pickupLocation.required, false, "Expected pickup location to be optional");
      assert.equal(initialState.fieldState.dropoffLocation.required, false, "Expected drop-off location to be optional");
      assert.equal(initialState.fieldState.vehicleType.required, false, "Expected vehicle type to be optional");
      assert.equal(
        initialState.fieldState.pickupLocation.label.includes("*") ||
          initialState.fieldState.dropoffLocation.label.includes("*") ||
          initialState.fieldState.vehicleType.label.includes("*"),
        false,
        "Expected pickup, drop-off, and vehicle labels not to show required stars",
      );
      assert.deepEqual(
        initialState.serviceOptionLabels,
        [
          "Airport Arrival",
          "Airport Departure",
          "Point-to-Point Transfer",
          "Hourly / Disposal",
          "Event / VIP Movement",
          "Other / To Confirm",
        ],
        "Expected customer-facing Type of Service labels on /book",
      );
      assert.deepEqual(
        initialState.serviceOptionValues,
        [
          "Airport Arrival",
          "Airport Departure",
          "Point-to-Point Transfer",
          "Hourly / Disposal",
          "Event / VIP Movement",
          "Other / To Confirm",
        ],
        "Expected customer-facing Type of Service values on /book",
      );
      assert.deepEqual(
        initialState.serviceOptionLabels.filter((label) => ["DEP", "MNG", "TRF", "DSP"].includes(label)),
        [],
        "Expected /book not to show internal route codes",
      );
      assert.deepEqual(
        initialState.vehicleOptionLabels,
        [
          "Alphard / Vellfire",
          "Mercedes Viano / V-Class",
          "Hi-roof Minibus",
          "Mercedes E-Class",
          "Mercedes S-Class",
        ],
        "Expected customer-facing Vehicle Type labels on /book",
      );
      assert.deepEqual(
        initialState.vehicleOptionValues,
        [
          "Alphard / Vellfire",
          "Mercedes Viano / V-Class",
          "Hi-roof Minibus",
          "Mercedes E-Class",
          "Mercedes S-Class",
        ],
        "Expected customer-facing Vehicle Type values on /book",
      );
      assert.deepEqual(
        [...initialState.vehicleOptionLabels, ...initialState.vehicleOptionValues].filter((value) =>
          ["AVF", "VVV", "Combi"].includes(value),
        ),
        [],
        "Expected /book not to expose internal vehicle codes",
      );
      assert.equal(
        /[A-Z]{2,}-\d{3,}/.test(initialState.text),
        false,
        "Expected /book not to create or display an invoice-style number",
      );
      assertNoPaymentIntegrationResources(initialState.resourceCalls, "customer booking page load");
      await checkTelegramBoundary("/book desktop");

      await clickCustomerBookingSubmit("invalid customer booking request");
      const invalidState = await waitForCondition(
        async () => {
          const candidateState = await readCustomerBookingPageState();
          return candidateState.feedbackText.includes("Please complete contact no.") ? candidateState : false;
        },
        10000,
        "invalid customer booking request feedback",
      );
      assert.equal(invalidState.feedbackTone, "error", "Expected invalid /book submit to show a local error");
      assert.deepEqual(
        invalidState.missingFields,
        ["Contact no.", "Passenger name", "Pickup date", "Pickup time"],
        "Expected invalid /book submit to list missing required fields only",
      );
      assert.equal(
        invalidState.feedbackDistanceFromSubmit < 160,
        true,
        "Expected invalid /book feedback near the submit button",
      );
      assert.deepEqual(
        invalidState.integrationCalls.filter((call) => blockedCustomerIntegrationPattern.test(call)),
        [],
        "Expected invalid /book submit not to call Supabase, payment, bank, notification, or calendar APIs",
      );
      assert.equal(
        /[A-Z]{2,}-\d{3,}/.test(invalidState.text),
        false,
        "Expected invalid /book submit not to create an invoice-style number",
      );

      await setCustomerBookingField("contactNo", "+65 9000 1111");
      await setCustomerBookingField("passengerName", "Customer Test Passenger");
      await setCustomerBookingField("pickupDate", "2026-05-29");
      await setCustomerBookingField("pickupTime", "09:30");
      const requiredOnlyState = await readCustomerBookingPageState();
      assert.equal(requiredOnlyState.fieldState.pickupTime.value, "09:30", "Expected hour/minute selects to set pickupTime");
      assert.equal(requiredOnlyState.fieldState.pickupLocation.value, "", "Expected pickup location to remain optional");
      assert.equal(requiredOnlyState.fieldState.dropoffLocation.value, "", "Expected drop-off location to remain optional");
      assert.equal(requiredOnlyState.fieldState.vehicleType.value, "", "Expected vehicle type to remain optional");

      await clickCustomerBookingSubmit("valid customer booking request");
      const validState = await waitForCondition(
        async () => {
          const candidateState = await readCustomerBookingPageState();
          return candidateState.feedbackText.includes("Booking request received for review")
            ? candidateState
            : false;
        },
        10000,
        "valid customer booking request feedback",
      );
      assert.equal(validState.feedbackTone, "success", "Expected valid /book submit to show a local success message");
      assert.equal(
        validState.feedbackText,
        "Booking request received for review. This is not confirmed yet. Our staff will reply to confirm availability.",
        "Expected customer-safe not-confirmed success feedback",
      );
      assert.equal(validState.feedbackDistanceFromSubmit < 160, true, "Expected valid /book feedback near the submit button");
      assert.equal(
        /[A-Z]{2,}-\d{3,}/.test(validState.text),
        false,
        "Expected valid /book submit not to create an invoice-style number",
      );
      assert.deepEqual(
        validState.integrationCalls.filter((call) => blockedCustomerIntegrationPattern.test(call)),
        [],
        "Expected valid /book submit not to call Supabase, payment, bank, notification, or calendar APIs",
      );
      assert.deepEqual(
        validState.sameTimeBlockingText,
        [],
        "Expected valid /book submit not to show same-date or same-time blocking",
      );

      await clickCustomerBookingSubmit("second valid customer booking request for same pickup date/time");
      const sameTimeRepeatState = await readCustomerBookingPageState();
      assert.equal(
        sameTimeRepeatState.feedbackText,
        "Booking request received for review. This is not confirmed yet. Our staff will reply to confirm availability.",
        "Expected same-date/same-time /book submit to remain a staff-reviewed request",
      );
      assert.deepEqual(
        sameTimeRepeatState.sameTimeBlockingText,
        [],
        "Expected /book not to block repeated requests for the same pickup date and time",
      );
      assert.deepEqual(
        sameTimeRepeatState.integrationCalls.filter((call) => blockedCustomerIntegrationPattern.test(call)),
        [],
        "Expected repeated same-date/same-time /book submit not to call Supabase, payment, bank, notification, or calendar APIs",
      );

      await setCustomerBookingViewportAndLoad(mobileViewport);
      const mobileState = await readCustomerBookingPageState();
      assert.ok(
        mobileState.docScrollWidth <= mobileState.docClientWidth + 2,
        `Expected /book mobile page not to overflow horizontally: ${mobileState.docScrollWidth} > ${mobileState.docClientWidth}`,
      );
      assert.equal(mobileState.submitVisible, true, "Expected /book submit button to remain touch-friendly on mobile");
      assert.deepEqual(
        Object.entries(mobileState.fieldState)
          .filter(([, state]) => !state.visible)
          .map(([field]) => field),
        [],
        "Expected /book mobile fields to remain touch-friendly",
      );
      assert.deepEqual(
        mobileState.forbiddenVisibleText,
        [],
        "Expected /book mobile view not to show internal/admin/mock/finance wording",
      );
      assertNoPaymentIntegrationResources(mobileState.resourceCalls, "mobile customer booking page");
      await checkTelegramBoundary("/book mobile");

      return {
        forbiddenVisibleText: initialState.forbiddenVisibleText,
        mobile: {
          docClientWidth: mobileState.docClientWidth,
          docScrollWidth: mobileState.docScrollWidth,
        },
        requiredFields: Object.fromEntries(
          Object.entries(initialState.fieldState).map(([field, state]) => [field, state.required]),
        ),
        route: "/book",
        pickupTimeControl: initialState.fieldState.pickupTime.control,
        pickupTimeStep: initialState.fieldState.pickupTime.step,
        nativePickupTimeInputCount: initialState.nativePickupTimeInputCount,
        pickupMinuteOptions: initialState.pickupMinuteOptions,
        serviceOptions: initialState.serviceOptionLabels,
        vehicleOptions: initialState.vehicleOptionLabels,
      };
    };

    const setCustomerPortalViewportAndLoad = async (viewport) => {
      await client.send("Emulation.setDeviceMetricsOverride", {
        deviceScaleFactor: viewport.scale,
        height: viewport.height,
        mobile: viewport.mobile,
        width: viewport.width,
      });

      await navigateWithLoadEvent(client, customerPortalUrl);
      await waitForCondition(
        () => evaluate(`Boolean(document.querySelector("[data-customer-portal-page]"))`),
        10000,
        `${viewport.label} customer portal route`,
      );
      await evaluate(`(() => {
        window.__customerPortalIntegrationCalls = [];
        const originalFetch = window.__customerPortalOriginalFetch || window.fetch.bind(window);
        window.__customerPortalOriginalFetch = originalFetch;
        window.fetch = (...args) => {
          const target = args[0]?.url || args[0];
          const method = args[1]?.method || args[0]?.method || "GET";
          window.__customerPortalIntegrationCalls.push(\`\${method} \${String(target)}\`);
          return originalFetch(...args);
        };

        const originalOpen = window.__customerPortalOriginalXHROpen || window.XMLHttpRequest.prototype.open;
        window.__customerPortalOriginalXHROpen = originalOpen;
        window.XMLHttpRequest.prototype.open = function patchedCustomerPortalOpen(method, url, ...rest) {
          window.__customerPortalIntegrationCalls.push(\`\${method} \${String(url)}\`);
          return originalOpen.call(this, method, url, ...rest);
        };

        if (navigator.sendBeacon && !window.__customerPortalOriginalSendBeacon) {
          const originalSendBeacon = navigator.sendBeacon.bind(navigator);
          window.__customerPortalOriginalSendBeacon = originalSendBeacon;
          navigator.sendBeacon = (...args) => {
            window.__customerPortalIntegrationCalls.push(\`BEACON \${String(args[0])}\`);
            return originalSendBeacon(...args);
          };
        }
      })()`);
    };

    const readCustomerPortalState = () =>
      evaluate(`(() => {
        const text = document.body.innerText;
        const lowerText = text.toLowerCase();
        const search = document.querySelector("[data-customer-portal-search]");
        const searchRect = search?.getBoundingClientRect();
        const activeSection = document.querySelector("[data-customer-portal-section][data-active='true']");
        const rows = [...document.querySelectorAll("[data-customer-portal-row]")];
        const firstRowRect = rows[0]?.getBoundingClientRect();
        const activeFilter = document.querySelector("[data-customer-portal-filter][data-active='true']");
        const detail = document.querySelector("[data-customer-portal-detail]");
        const feedback = document.querySelector("[data-customer-portal-feedback]");
        const feedbackRow = feedback?.closest("[data-customer-portal-row]");
        const feedbackRect = feedback?.getBoundingClientRect();
        const feedbackRowRect = feedbackRow?.getBoundingClientRect();
        const requestForm = document.querySelector("[data-customer-portal-request-form]");
        const requestFeedback = document.querySelector("[data-customer-portal-request-feedback]");
        const pickupHour = document.querySelector("[data-customer-portal-pickup-hour]");
        const pickupMinute = document.querySelector("[data-customer-portal-pickup-minute]");
        const previousPageButton = document.querySelector("[data-customer-portal-prev]");
        const nextPageButton = document.querySelector("[data-customer-portal-next]");
        const monthButtons = [...document.querySelectorAll("[data-customer-portal-month-button]")];
        const activePastMonthButton = document.querySelector("[data-customer-portal-month-button][data-active='true']");
        const currentMonthButton = document.querySelector("[data-customer-portal-current-month]");
        const requestFieldState = (field) => {
          const control = document.querySelector(\`[data-customer-portal-request-field="\${field}"]\`);
          const rect = control?.getBoundingClientRect();

          return {
            required: Boolean(control?.required),
            value: control?.value || "",
            visible: Boolean(rect && rect.width > 0 && rect.height >= 40),
          };
        };

        return {
          activeSection: activeSection?.textContent.trim() || "",
          activeFilter: activeFilter?.textContent.trim() || "",
          detailId: detail?.getAttribute("data-customer-portal-detail") || "",
          detailText: detail?.innerText || "",
          docClientWidth: document.documentElement.clientWidth,
          docScrollWidth: document.documentElement.scrollWidth,
          feedbackDistanceFromRow:
            feedbackRect && feedbackRowRect ? Math.round(Math.abs(feedbackRect.top - feedbackRowRect.bottom)) : 999,
          feedbackRowId: feedbackRow?.getAttribute("data-customer-portal-row") || "",
          feedbackText: feedback?.textContent.trim() || "",
          forbiddenVisibleText: [
            "admin",
            "internal",
            "mock",
            "supabase",
            "billing",
            "invoice",
            "statement",
            "outstanding payment",
            "payment follow-up",
            "driver payout",
            "margin",
            "profit",
            "invoice controls",
            "statement controls",
            "staff notes",
            "staff-only",
            "developer",
            "replacement car",
            "replacement driver",
            "reassign replacement",
            "current driver cancelled",
          ].filter((value) => lowerText.includes(value)),
          form: {
            feedbackText: requestFeedback?.textContent.trim() || "",
            fieldState: {
              companyName: requestFieldState("companyName"),
              contactNo: requestFieldState("contactNo"),
              emailAddress: requestFieldState("emailAddress"),
              passengerName: requestFieldState("passengerName"),
              pickupDate: requestFieldState("pickupDate"),
              pickupTime: {
                control: pickupHour && pickupMinute ? "selects" : "missing",
                required: Boolean(pickupHour?.required && pickupMinute?.required),
                value: pickupHour?.value ? \`\${pickupHour.value}:\${pickupMinute?.value || "00"}\` : "",
                visible: Boolean(
                  pickupHour?.getBoundingClientRect().height >= 40 &&
                    pickupMinute?.getBoundingClientRect().height >= 40,
                ),
              },
              flightNumber: requestFieldState("flightNumber"),
              pickupLocation: requestFieldState("pickupLocation"),
              dropoffLocation: requestFieldState("dropoffLocation"),
              serviceType: requestFieldState("serviceType"),
              vehicleType: requestFieldState("vehicleType"),
              passengerCount: requestFieldState("passengerCount"),
              luggage: requestFieldState("luggage"),
              extraStops: requestFieldState("extraStops"),
              specialRequest: requestFieldState("specialRequest"),
            },
            nativePickupTimeInputCount: document.querySelectorAll("[data-customer-portal-request-form] input[type='time']").length,
            pickupMinuteOptions: pickupMinute
              ? [...pickupMinute.options].filter((option) => option.value).map((option) => option.textContent.trim())
              : [],
            serviceOptionLabels: [...document.querySelectorAll("[data-customer-portal-request-field='serviceType'] option")]
              .map((option) => option.textContent.trim()),
            submitVisible: Boolean(document.querySelector("[data-customer-portal-submit-request]")),
            vehicleOptionLabels: [...document.querySelectorAll("[data-customer-portal-request-field='vehicleType'] option")]
              .map((option) => option.textContent.trim())
              .filter((label) => label !== "To confirm"),
            visible: Boolean(requestForm),
          },
          integrationCalls: window.__customerPortalIntegrationCalls || [],
          activeMonthLabel: document.querySelector("[data-customer-portal-active-month]")?.textContent.trim() || "",
          currentMonthActive: currentMonthButton?.getAttribute("data-active") === "true",
          monthGroupsVisible: Boolean(document.querySelector("[data-customer-portal-month-groups]")),
          monthLabels: monthButtons.map((button) => button.textContent.trim()),
          monthKeys: monthButtons.map((button) => button.getAttribute("data-customer-portal-month-button") || ""),
          pageSummary: document.querySelector("[data-customer-portal-page-summary]")?.textContent.trim() || "",
          pagination: {
            nextDisabled: Boolean(nextPageButton?.disabled),
            previousDisabled: Boolean(previousPageButton?.disabled),
            visible: Boolean(document.querySelector("[data-customer-portal-pagination]")),
          },
          resourceCalls: performance.getEntriesByType("resource").map((entry) => entry.name),
          rowCount: rows.length,
          rowIds: rows.map((row) => row.getAttribute("data-customer-portal-row") || ""),
          rows: rows.map((row) => ({
            id: row.getAttribute("data-customer-portal-row") || "",
            requestButtonCount: row.querySelectorAll("[data-customer-portal-request-change]").length,
            status: row.getAttribute("data-customer-portal-status") || "",
            text: row.innerText,
          })),
          searchBeforeRows:
            searchRect && firstRowRect ? searchRect.top < firstRowRect.top : false,
          searchVisible: Boolean(searchRect && searchRect.width > 0 && searchRect.height >= 40),
          selectedPastMonthKey: activePastMonthButton?.getAttribute("data-customer-portal-month-button") || "",
          sectionLabels: [...document.querySelectorAll("[data-customer-portal-section]")]
            .map((button) => button.textContent.trim()),
          showingText: document.querySelector("[data-customer-portal-showing]")?.textContent.trim() || "",
          text,
        };
      })()`);

    const setCustomerPortalSearch = async (value) => {
      const actualValue = await evaluate(`(() => {
        const input = document.querySelector("[data-customer-portal-search]");

        if (!input) {
          return null;
        }

        const descriptor = Object.getOwnPropertyDescriptor(input.constructor.prototype, "value");
        descriptor?.set?.call(input, ${JSON.stringify(value)});
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));

        return input.value;
      })()`);
      assert.equal(actualValue, value, "Expected customer portal search to accept test value");
    };

    const clickCustomerPortalSection = async (section) => {
      const clicked = await evaluate(`(() => {
        const button = document.querySelector(${JSON.stringify(`[data-customer-portal-section="${section}"]`)});

        if (!button) {
          return false;
        }

        button.click();
        return true;
      })()`);
      assert.equal(clicked, true, `Expected customer portal ${section} section to be clickable`);
    };

    const setCustomerPortalRequestField = async (field, value) => {
      const actualValue = await evaluate(`(() => {
        const control = document.querySelector(${JSON.stringify(`[data-customer-portal-request-field="${field}"]`)});

        if (!control) {
          return null;
        }

        const descriptor = Object.getOwnPropertyDescriptor(control.constructor.prototype, "value");
        descriptor?.set?.call(control, ${JSON.stringify(value)});
        control.dispatchEvent(new Event("input", { bubbles: true }));
        control.dispatchEvent(new Event("change", { bubbles: true }));

        return control.value;
      })()`);
      assert.equal(actualValue, value, `Expected customer portal request field ${field} to accept test value`);
    };

    const setCustomerPortalPickupTime = async (hour, minute) => {
      const actualValue = await evaluate(`(() => {
        const hourSelect = document.querySelector("[data-customer-portal-pickup-hour]");
        const minuteSelect = document.querySelector("[data-customer-portal-pickup-minute]");

        if (!hourSelect || !minuteSelect) {
          return null;
        }

        hourSelect.value = ${JSON.stringify(hour)};
        hourSelect.dispatchEvent(new Event("input", { bubbles: true }));
        hourSelect.dispatchEvent(new Event("change", { bubbles: true }));
        minuteSelect.value = ${JSON.stringify(minute)};
        minuteSelect.dispatchEvent(new Event("input", { bubbles: true }));
        minuteSelect.dispatchEvent(new Event("change", { bubbles: true }));

        return \`\${hourSelect.value}:\${minuteSelect.value}\`;
      })()`);
      assert.equal(actualValue, `${hour}:${minute}`, "Expected customer portal pickup time selects to accept test value");
    };

    const submitCustomerPortalBookingRequest = async () => {
      const submitted = await evaluate(`(() => {
        const button = document.querySelector("[data-customer-portal-submit-request]");

        if (!button) {
          return false;
        }

        button.click();
        return true;
      })()`);
      assert.equal(submitted, true, "Expected customer portal booking request submit to be clickable");
    };

    const clickCustomerPortalFilter = async (filter) => {
      const clicked = await evaluate(`(() => {
        const button = document.querySelector(${JSON.stringify(`[data-customer-portal-filter="${filter}"]`)});

        if (!button) {
          return false;
        }

        button.click();
        return true;
      })()`);
      assert.equal(clicked, true, `Expected customer portal ${filter} filter to be clickable`);
    };

    const clickCustomerPortalPageButton = async (direction) => {
      const selector = direction === "next" ? "[data-customer-portal-next]" : "[data-customer-portal-prev]";
      const clicked = await evaluate(`(() => {
        const button = document.querySelector(${JSON.stringify(selector)});

        if (!button || button.disabled) {
          return false;
        }

        button.click();
        return true;
      })()`);
      assert.equal(clicked, true, `Expected customer portal ${direction} page button to be clickable`);
    };

    const clickCustomerPortalMonth = async (monthKey) => {
      const clicked = await evaluate(`(() => {
        const button = document.querySelector(${JSON.stringify(`[data-customer-portal-month-button="${monthKey}"]`)});

        if (!button) {
          return false;
        }

        button.click();
        return true;
      })()`);
      assert.equal(clicked, true, `Expected customer portal month ${monthKey} to be clickable`);
    };

    const clickCustomerPortalDetail = async (bookingId) => {
      const clicked = await evaluate(`(() => {
        const button = document.querySelector(${JSON.stringify(`[data-customer-portal-detail-button="${bookingId}"]`)});

        if (!button) {
          return false;
        }

        button.click();
        return true;
      })()`);
      assert.equal(clicked, true, `Expected customer portal detail button for ${bookingId} to be clickable`);
    };

    const clickCustomerPortalRequestChange = async (bookingId) => {
      const clicked = await evaluate(`(() => {
        const button = document.querySelector(${JSON.stringify(`[data-customer-portal-request-change="${bookingId}"]`)});

        if (!button) {
          return false;
        }

        button.click();
        return true;
      })()`);
      assert.equal(clicked, true, `Expected customer portal request change button for ${bookingId} to be clickable`);
    };

    const assertCustomerPortalPagedState = (state, expected) => {
      const label = expected.label;

      if (expected.activeFilter) {
        assert.equal(state.activeFilter, expected.activeFilter, `${label}: expected active filter`);
      }

      assert.equal(state.showingText, expected.showingText, `${label}: expected showing text`);
      assert.equal(state.pageSummary, expected.pageSummary, `${label}: expected page summary`);
      assert.equal(state.rowCount, expected.rowCount, `${label}: expected compact row count`);
      assert.equal(state.rowCount <= 10, true, `${label}: expected no giant booking list`);
      assert.equal(
        state.pagination.previousDisabled,
        expected.previousDisabled,
        `${label}: expected Previous disabled state`,
      );
      assert.equal(state.pagination.nextDisabled, expected.nextDisabled, `${label}: expected Next disabled state`);

      if (expected.currentMonthActive !== undefined) {
        assert.equal(state.currentMonthActive, expected.currentMonthActive, `${label}: expected current month active state`);
      }

      if (expected.selectedPastMonthKey !== undefined) {
        assert.equal(
          state.selectedPastMonthKey,
          expected.selectedPastMonthKey,
          `${label}: expected selected past month key`,
        );
      }

      if (expected.activeMonthLabel !== undefined) {
        assert.equal(state.activeMonthLabel, expected.activeMonthLabel, `${label}: expected active month label`);
      }

      if (expected.status) {
        assert.deepEqual(
          [...new Set(state.rows.map((row) => row.status))],
          [expected.status],
          `${label}: expected visible booking status`,
        );
      }

      if (expected.rowIdIncludes) {
        assert.equal(
          state.rowIds.every((id) => id.includes(expected.rowIdIncludes)),
          true,
          `${label}: expected row ids to match selected month`,
        );
      }
    };

    const checkCustomerPortalRoute = async () => {
      const desktopViewport = { height: 900, label: "desktop customer portal", mobile: false, scale: 1, width: 1440 };
      const mobileViewport = { height: 812, label: "mobile customer portal", mobile: true, scale: 3, width: 375 };

      await setCustomerPortalViewportAndLoad(desktopViewport);

      const initialState = await readCustomerPortalState();
      assert.equal(initialState.text.includes("My Bookings"), true, "Expected /my-bookings page title");
      assert.equal(
        initialState.text.includes("Customers can view booking requests and booking history here after staff confirmation."),
        true,
        "Expected /my-bookings customer-safe explanation",
      );
      assert.equal(initialState.searchVisible, true, "Expected /my-bookings search input to be visible");
      assert.equal(initialState.searchBeforeRows, true, "Expected /my-bookings search to appear before rows");
      assert.equal(initialState.activeFilter, "Upcoming", "Expected /my-bookings to default to Upcoming");
      assert.equal(initialState.rowCount, 10, "Expected /my-bookings to show at most 10 rows by default");
      assert.equal(initialState.showingText, "Showing 1-10 of 12 bookings", "Expected /my-bookings showing count");
      assert.equal(initialState.pageSummary, "Page 1 of 2", "Expected /my-bookings first page summary");
      assert.equal(initialState.pagination.visible, true, "Expected /my-bookings pagination controls");
      assert.equal(initialState.pagination.previousDisabled, true, "Expected first page previous control to be disabled");
      assert.equal(initialState.pagination.nextDisabled, false, "Expected first page next control to be enabled");
      assert.deepEqual(
        initialState.sectionLabels,
        ["New Booking Request", "Upcoming", "Completed", "Cancelled"],
        "Expected /my-bookings to expose the customer portal sections",
      );
      assert.deepEqual(
        initialState.rows.filter((row) => ["Completed", "Cancelled"].includes(row.status)).map((row) => row.status),
        [],
        "Expected Upcoming filter to hide completed and cancelled bookings",
      );
      assert.deepEqual(
        initialState.forbiddenVisibleText,
        [],
        "Expected /my-bookings not to show internal/admin/mock/Supabase/payment/billing wording",
      );
      assert.equal(/[A-Z]{2,}-\d{3,}/.test(initialState.text), false, "Expected /my-bookings not to create invoice-style numbers");
      assertNoPaymentIntegrationResources(initialState.resourceCalls, "customer portal page load");
      await checkTelegramBoundary("/my-bookings desktop");

      await clickCustomerPortalPageButton("next");
      const upcomingPageTwoState = await waitForCondition(
        async () => {
          const candidateState = await readCustomerPortalState();
          return candidateState.showingText === "Showing 11-12 of 12 bookings" ? candidateState : false;
        },
        10000,
        "customer portal Upcoming page two",
      );
      assert.equal(upcomingPageTwoState.rowCount, 2, "Expected Upcoming page two to show remaining compact rows");
      assert.equal(upcomingPageTwoState.pageSummary, "Page 2 of 2", "Expected Upcoming page two summary");
      assert.equal(upcomingPageTwoState.pagination.previousDisabled, false, "Expected page two previous control to be enabled");
      assert.equal(upcomingPageTwoState.pagination.nextDisabled, true, "Expected page two next control to be disabled");

      await clickCustomerPortalFilter("Completed");
      const completedAfterUpcomingPageTwoState = await waitForCondition(
        async () => {
          const candidateState = await readCustomerPortalState();
          return candidateState.activeFilter === "Completed" && candidateState.showingText === "Showing 1-10 of 13 bookings"
            ? candidateState
            : false;
        },
        10000,
        "customer portal Completed reset after Upcoming page two",
      );
      assertCustomerPortalPagedState(completedAfterUpcomingPageTwoState, {
        activeFilter: "Completed",
        activeMonthLabel: "May 2026",
        currentMonthActive: true,
        label: "Completed after Upcoming page two",
        nextDisabled: false,
        pageSummary: "Page 1 of 2",
        previousDisabled: true,
        rowCount: 10,
        selectedPastMonthKey: "",
        showingText: "Showing 1-10 of 13 bookings",
        status: "Completed",
      });

      await clickCustomerPortalFilter("Upcoming");
      const upcomingAfterCompletedSwitchState = await waitForCondition(
        async () => {
          const candidateState = await readCustomerPortalState();
          return candidateState.activeFilter === "Upcoming" && candidateState.showingText === "Showing 1-10 of 12 bookings"
            ? candidateState
            : false;
        },
        10000,
        "customer portal Upcoming reset after Completed switch",
      );
      assertCustomerPortalPagedState(upcomingAfterCompletedSwitchState, {
        activeFilter: "Upcoming",
        label: "Upcoming after Completed switch",
        nextDisabled: false,
        pageSummary: "Page 1 of 2",
        previousDisabled: true,
        rowCount: 10,
        showingText: "Showing 1-10 of 12 bookings",
      });

      await clickCustomerPortalSection("New Booking Request");
      const requestFormState = await waitForCondition(
        async () => {
          const candidateState = await readCustomerPortalState();
          return candidateState.form.visible ? candidateState : false;
        },
        10000,
        "customer portal booking request form",
      );
      assert.equal(requestFormState.activeSection, "New Booking Request", "Expected /my-bookings request form tab");
      assert.equal(requestFormState.form.submitVisible, true, "Expected customer portal request submit button");
      assert.equal(requestFormState.form.nativePickupTimeInputCount, 0, "Expected /my-bookings pickup time not to use native type=time");
      assert.equal(requestFormState.form.fieldState.pickupTime.control, "selects", "Expected visible pickup hour/minute selects");
      assert.deepEqual(
        requestFormState.form.pickupMinuteOptions,
        ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"],
        "Expected /my-bookings pickup minute options to be five-minute choices",
      );
      for (const unavailableMinute of ["01", "02", "03", "04", "06", "07", "08", "09"]) {
        assert.equal(
          requestFormState.form.pickupMinuteOptions.includes(unavailableMinute),
          false,
          `Expected /my-bookings minute option ${unavailableMinute} not to be selectable`,
        );
      }
      assert.deepEqual(
        Object.fromEntries(
          Object.entries(requestFormState.form.fieldState).map(([field, state]) => [field, state.required]),
        ),
        {
          companyName: false,
          contactNo: true,
          emailAddress: false,
          passengerName: true,
          pickupDate: true,
          pickupTime: true,
          flightNumber: false,
          pickupLocation: false,
          dropoffLocation: false,
          serviceType: false,
          vehicleType: false,
          passengerCount: false,
          luggage: false,
          extraStops: false,
          specialRequest: false,
        },
        "Expected /my-bookings request form required/optional fields",
      );
      assert.deepEqual(
        requestFormState.form.serviceOptionLabels,
        [
          "Airport Arrival",
          "Airport Departure",
          "Point-to-Point Transfer",
          "Hourly / Disposal",
          "Event / VIP Movement",
          "Other / To Confirm",
        ],
        "Expected /my-bookings customer-facing service options",
      );
      assert.deepEqual(
        requestFormState.form.vehicleOptionLabels,
        [
          "Alphard / Vellfire",
          "Mercedes Viano / V-Class",
          "Hi-roof Minibus",
          "Mercedes E-Class",
          "Mercedes S-Class",
        ],
        "Expected /my-bookings customer-facing vehicle options",
      );
      for (const hiddenInternalCode of ["DEP", "MNG", "TRF", "DSP", "AVF", "VVV", "Combi"]) {
        assert.equal(
          requestFormState.text.includes(hiddenInternalCode),
          false,
          `Expected /my-bookings not to show internal code ${hiddenInternalCode}`,
        );
      }

      await submitCustomerPortalBookingRequest();
      const invalidRequestState = await waitForCondition(
        async () => {
          const candidateState = await readCustomerPortalState();
          return candidateState.form.feedbackText.includes("Please complete contact no.") ? candidateState : false;
        },
        10000,
        "customer portal invalid booking request feedback",
      );
      assert.deepEqual(
        invalidRequestState.integrationCalls.filter((call) => blockedCustomerIntegrationPattern.test(call)),
        [],
        "Expected invalid /my-bookings request not to call Supabase, payment, bank, notification, or calendar APIs",
      );

      await setCustomerPortalRequestField("contactNo", "+65 9000 0123");
      await setCustomerPortalRequestField("passengerName", "Portal Test Passenger");
      await setCustomerPortalRequestField("pickupDate", "2026-06-15");
      await setCustomerPortalPickupTime("10", "05");
      await submitCustomerPortalBookingRequest();
      const validRequestState = await waitForCondition(
        async () => {
          const candidateState = await readCustomerPortalState();
          return candidateState.form.feedbackText.includes("Booking request received for review") ? candidateState : false;
        },
        10000,
        "customer portal valid booking request feedback",
      );
      assert.equal(
        validRequestState.form.fieldState.pickupTime.value,
        "10:05",
        "Expected selecting hour and minute to create HH:mm pickup time",
      );
      assert.deepEqual(
        validRequestState.integrationCalls.filter((call) => blockedCustomerIntegrationPattern.test(call)),
        [],
        "Expected valid /my-bookings request not to call Supabase, payment, bank, notification, or calendar APIs",
      );
      assert.equal(/[A-Z]{2,}-\d{3,}/.test(validRequestState.text), false, "Expected /my-bookings request not to create invoice-style numbers");

      await submitCustomerPortalBookingRequest();
      const repeatedRequestState = await waitForCondition(
        async () => {
          const candidateState = await readCustomerPortalState();
          return candidateState.form.feedbackText.includes("Booking request received for review") ? candidateState : false;
        },
        10000,
        "customer portal same-date same-time booking request",
      );
      assert.deepEqual(
        repeatedRequestState.integrationCalls.filter((call) => blockedCustomerIntegrationPattern.test(call)),
        [],
        "Expected repeated same-date/same-time /my-bookings request not to call Supabase, payment, bank, notification, or calendar APIs",
      );

      await clickCustomerPortalFilter("Upcoming");
      await waitForCondition(
        async () => {
          const candidateState = await readCustomerPortalState();
          return candidateState.activeFilter === "Upcoming" && candidateState.rowCount === 10 ? candidateState : false;
        },
        10000,
        "customer portal returned to Upcoming bookings",
      );

      await clickCustomerPortalDetail("booking-001");
      const detailState = await waitForCondition(
        async () => {
          const candidateState = await readCustomerPortalState();
          return candidateState.detailId === "booking-001" ? candidateState : false;
        },
        10000,
        "customer portal expanded detail",
      );
      for (const expectedDetail of [
        "Booking Details",
        "Pickup date/time",
        "Pickup location",
        "Drop-off location",
        "Type of service",
        "Vehicle type",
        "Passenger name",
        "Flight number",
        "Special request / note",
      ]) {
        assert.equal(detailState.detailText.includes(expectedDetail), true, `Expected /my-bookings detail: ${expectedDetail}`);
      }

      await clickCustomerPortalRequestChange("booking-001");
      const changeState = await waitForCondition(
        async () => {
          const candidateState = await readCustomerPortalState();
          return candidateState.feedbackText.includes("Change request noted for review") ? candidateState : false;
        },
        10000,
        "customer portal request change feedback",
      );
      assert.equal(
        changeState.feedbackText,
        "Change request noted for review. Prestige Limo staff will review it before confirmation.",
        "Expected customer portal change request to stay staff-reviewed",
      );
      assert.equal(changeState.feedbackRowId, "booking-001", "Expected request change feedback near the clicked row");
      assert.equal(
        changeState.rows.find((row) => row.id === "booking-001")?.text.includes("Alicia Tan"),
        true,
        "Expected request change not to change row data",
      );
      assert.deepEqual(
        changeState.integrationCalls.filter((call) => blockedCustomerIntegrationPattern.test(call)),
        [],
        "Expected request change not to call Supabase, payment, bank, notification, or calendar APIs",
      );

      await setCustomerPortalSearch("Sentosa");
      const searchState = await readCustomerPortalState();
      assert.equal(searchState.showingText, "Showing 1-2 of 2 bookings", "Expected /my-bookings search to filter rows");
      assert.equal(searchState.rowCount, 2, "Expected /my-bookings search to keep compact rows");

      await setCustomerPortalSearch("");
      await clickCustomerPortalFilter("Completed");
      const completedState = await waitForCondition(
        async () => {
          const candidateState = await readCustomerPortalState();
          return candidateState.activeFilter === "Completed" && candidateState.showingText === "Showing 1-10 of 13 bookings"
            ? candidateState
            : false;
        },
        10000,
        "customer portal completed filter",
      );
      assert.equal(completedState.monthGroupsVisible, true, "Expected Completed bookings to expose compact month rows");
      assert.deepEqual(
        completedState.monthKeys,
        ["2026-03", "2026-02"],
        "Expected Completed past months to be grouped as compact rows",
      );
      assert.equal(completedState.showingText, "Showing 1-10 of 13 bookings", "Expected current-month Completed page count");
      assert.equal(completedState.pageSummary, "Page 1 of 2", "Expected current-month Completed first page summary");
      assert.equal(completedState.pagination.previousDisabled, true, "Expected Completed first page previous to be disabled");
      assert.equal(completedState.pagination.nextDisabled, false, "Expected Completed first page next to be enabled");
      assert.deepEqual(
        [...new Set(completedState.rows.map((row) => row.status))],
        ["Completed"],
        "Expected Completed filter rows",
      );
      assert.equal(
        completedState.rows.reduce((total, row) => total + row.requestButtonCount, 0),
        0,
        "Expected completed bookings to be read-only without Request change buttons",
      );

      await clickCustomerPortalPageButton("next");
      const completedPageTwoState = await waitForCondition(
        async () => {
          const candidateState = await readCustomerPortalState();
          return candidateState.showingText === "Showing 11-13 of 13 bookings" ? candidateState : false;
        },
        10000,
        "customer portal current-month Completed page two",
      );
      assert.equal(completedPageTwoState.rowCount, 3, "Expected Completed page two to avoid a long list");
      assert.equal(completedPageTwoState.pagination.nextDisabled, true, "Expected Completed page two next to be disabled");

      await clickCustomerPortalFilter("Cancelled");
      const cancelledAfterCompletedPageTwoState = await waitForCondition(
        async () => {
          const candidateState = await readCustomerPortalState();
          return candidateState.activeFilter === "Cancelled" && candidateState.showingText === "Showing 1-10 of 12 bookings"
            ? candidateState
            : false;
        },
        10000,
        "customer portal Cancelled reset after Completed page two",
      );
      assertCustomerPortalPagedState(cancelledAfterCompletedPageTwoState, {
        activeFilter: "Cancelled",
        activeMonthLabel: "May 2026",
        currentMonthActive: true,
        label: "Cancelled after Completed page two",
        nextDisabled: false,
        pageSummary: "Page 1 of 2",
        previousDisabled: true,
        rowCount: 10,
        selectedPastMonthKey: "",
        showingText: "Showing 1-10 of 12 bookings",
        status: "Cancelled",
      });

      await clickCustomerPortalFilter("Completed");
      const completedAfterCancelledSwitchState = await waitForCondition(
        async () => {
          const candidateState = await readCustomerPortalState();
          return candidateState.activeFilter === "Completed" && candidateState.showingText === "Showing 1-10 of 13 bookings"
            ? candidateState
            : false;
        },
        10000,
        "customer portal Completed reset after Cancelled switch",
      );
      assertCustomerPortalPagedState(completedAfterCancelledSwitchState, {
        activeFilter: "Completed",
        activeMonthLabel: "May 2026",
        currentMonthActive: true,
        label: "Completed after Cancelled switch",
        nextDisabled: false,
        pageSummary: "Page 1 of 2",
        previousDisabled: true,
        rowCount: 10,
        selectedPastMonthKey: "",
        showingText: "Showing 1-10 of 13 bookings",
        status: "Completed",
      });

      await clickCustomerPortalMonth("2026-03");
      const completedPastMonthState = await waitForCondition(
        async () => {
          const candidateState = await readCustomerPortalState();
          return candidateState.showingText === "Showing 1-10 of 11 bookings" &&
            candidateState.rowIds.every((id) => id.includes("completed-march"))
            ? candidateState
            : false;
        },
        10000,
        "customer portal March completed bookings",
      );
      assertCustomerPortalPagedState(completedPastMonthState, {
        activeFilter: "Completed",
        activeMonthLabel: "March 2026",
        currentMonthActive: false,
        label: "Completed March past month page one",
        nextDisabled: false,
        pageSummary: "Page 1 of 2",
        previousDisabled: true,
        rowCount: 10,
        rowIdIncludes: "completed-march",
        selectedPastMonthKey: "2026-03",
        showingText: "Showing 1-10 of 11 bookings",
        status: "Completed",
      });

      await clickCustomerPortalPageButton("next");
      const completedPastMonthPageTwoState = await waitForCondition(
        async () => {
          const candidateState = await readCustomerPortalState();
          return candidateState.showingText === "Showing 11-11 of 11 bookings" ? candidateState : false;
        },
        10000,
        "customer portal March completed page two",
      );
      assert.equal(completedPastMonthPageTwoState.rowCount, 1, "Expected selected Completed month page two to show the final row");

      await clickCustomerPortalMonth("2026-02");
      const completedFebruaryState = await waitForCondition(
        async () => {
          const candidateState = await readCustomerPortalState();
          return candidateState.showingText === "Showing 1-1 of 1 bookings" &&
            candidateState.rowIds.every((id) => id.includes("completed-february"))
            ? candidateState
            : false;
        },
        10000,
        "customer portal February completed bookings after March page two",
      );
      assertCustomerPortalPagedState(completedFebruaryState, {
        activeFilter: "Completed",
        activeMonthLabel: "February 2026",
        currentMonthActive: false,
        label: "Completed February after March page two",
        nextDisabled: true,
        pageSummary: "Page 1 of 1",
        previousDisabled: true,
        rowCount: 1,
        rowIdIncludes: "completed-february",
        selectedPastMonthKey: "2026-02",
        showingText: "Showing 1-1 of 1 bookings",
        status: "Completed",
      });

      await clickCustomerPortalMonth("2026-03");
      const completedMarchAfterFebruaryState = await waitForCondition(
        async () => {
          const candidateState = await readCustomerPortalState();
          return candidateState.showingText === "Showing 1-10 of 11 bookings" &&
            candidateState.rowIds.every((id) => id.includes("completed-march"))
            ? candidateState
            : false;
        },
        10000,
        "customer portal March completed bookings after February switch",
      );
      assertCustomerPortalPagedState(completedMarchAfterFebruaryState, {
        activeFilter: "Completed",
        activeMonthLabel: "March 2026",
        currentMonthActive: false,
        label: "Completed March after February switch",
        nextDisabled: false,
        pageSummary: "Page 1 of 2",
        previousDisabled: true,
        rowCount: 10,
        rowIdIncludes: "completed-march",
        selectedPastMonthKey: "2026-03",
        showingText: "Showing 1-10 of 11 bookings",
        status: "Completed",
      });

      await clickCustomerPortalFilter("Cancelled");
      const cancelledState = await waitForCondition(
        async () => {
          const candidateState = await readCustomerPortalState();
          return candidateState.activeFilter === "Cancelled" && candidateState.showingText === "Showing 1-10 of 12 bookings"
            ? candidateState
            : false;
        },
        10000,
        "customer portal cancelled filter",
      );
      assert.equal(cancelledState.monthGroupsVisible, true, "Expected Cancelled bookings to expose compact month rows");
      assert.deepEqual(
        cancelledState.monthKeys,
        ["2026-04", "2026-01"],
        "Expected Cancelled past months to be grouped as compact rows",
      );
      assert.equal(cancelledState.showingText, "Showing 1-10 of 12 bookings", "Expected current-month Cancelled page count");
      assert.equal(cancelledState.pageSummary, "Page 1 of 2", "Expected current-month Cancelled first page summary");
      assert.deepEqual(
        [...new Set(cancelledState.rows.map((row) => row.status))],
        ["Cancelled"],
        "Expected Cancelled filter rows",
      );
      assert.equal(
        cancelledState.rows.reduce((total, row) => total + row.requestButtonCount, 0),
        0,
        "Expected cancelled bookings not to show Request change buttons",
      );

      await clickCustomerPortalPageButton("next");
      const cancelledPageTwoState = await waitForCondition(
        async () => {
          const candidateState = await readCustomerPortalState();
          return candidateState.showingText === "Showing 11-12 of 12 bookings" ? candidateState : false;
        },
        10000,
        "customer portal current-month Cancelled page two",
      );
      assert.equal(cancelledPageTwoState.rowCount, 2, "Expected Cancelled page two to avoid a long list");
      assert.equal(cancelledPageTwoState.pagination.nextDisabled, true, "Expected Cancelled page two next to be disabled");

      await clickCustomerPortalFilter("Upcoming");
      const upcomingAfterCancelledPageTwoState = await waitForCondition(
        async () => {
          const candidateState = await readCustomerPortalState();
          return candidateState.activeFilter === "Upcoming" && candidateState.showingText === "Showing 1-10 of 12 bookings"
            ? candidateState
            : false;
        },
        10000,
        "customer portal Upcoming reset after Cancelled page two",
      );
      assertCustomerPortalPagedState(upcomingAfterCancelledPageTwoState, {
        activeFilter: "Upcoming",
        label: "Upcoming after Cancelled page two",
        nextDisabled: false,
        pageSummary: "Page 1 of 2",
        previousDisabled: true,
        rowCount: 10,
        showingText: "Showing 1-10 of 12 bookings",
      });

      await clickCustomerPortalFilter("Cancelled");
      const cancelledAfterUpcomingSwitchState = await waitForCondition(
        async () => {
          const candidateState = await readCustomerPortalState();
          return candidateState.activeFilter === "Cancelled" && candidateState.showingText === "Showing 1-10 of 12 bookings"
            ? candidateState
            : false;
        },
        10000,
        "customer portal Cancelled reset after Upcoming switch",
      );
      assertCustomerPortalPagedState(cancelledAfterUpcomingSwitchState, {
        activeFilter: "Cancelled",
        activeMonthLabel: "May 2026",
        currentMonthActive: true,
        label: "Cancelled after Upcoming switch",
        nextDisabled: false,
        pageSummary: "Page 1 of 2",
        previousDisabled: true,
        rowCount: 10,
        selectedPastMonthKey: "",
        showingText: "Showing 1-10 of 12 bookings",
        status: "Cancelled",
      });

      await clickCustomerPortalMonth("2026-04");
      const cancelledPastMonthState = await waitForCondition(
        async () => {
          const candidateState = await readCustomerPortalState();
          return candidateState.showingText === "Showing 1-10 of 11 bookings" &&
            candidateState.rowIds.every((id) => id.includes("cancelled-april"))
            ? candidateState
            : false;
        },
        10000,
        "customer portal April cancelled bookings",
      );
      assertCustomerPortalPagedState(cancelledPastMonthState, {
        activeFilter: "Cancelled",
        activeMonthLabel: "April 2026",
        currentMonthActive: false,
        label: "Cancelled April past month page one",
        nextDisabled: false,
        pageSummary: "Page 1 of 2",
        previousDisabled: true,
        rowCount: 10,
        rowIdIncludes: "cancelled-april",
        selectedPastMonthKey: "2026-04",
        showingText: "Showing 1-10 of 11 bookings",
        status: "Cancelled",
      });

      await clickCustomerPortalPageButton("next");
      const cancelledPastMonthPageTwoState = await waitForCondition(
        async () => {
          const candidateState = await readCustomerPortalState();
          return candidateState.showingText === "Showing 11-11 of 11 bookings" ? candidateState : false;
        },
        10000,
        "customer portal April cancelled page two",
      );
      assert.equal(cancelledPastMonthPageTwoState.rowCount, 1, "Expected selected Cancelled month page two to show the final row");

      await clickCustomerPortalMonth("2026-01");
      const cancelledJanuaryState = await waitForCondition(
        async () => {
          const candidateState = await readCustomerPortalState();
          return candidateState.showingText === "Showing 1-1 of 1 bookings" &&
            candidateState.rowIds.every((id) => id.includes("cancelled-january"))
            ? candidateState
            : false;
        },
        10000,
        "customer portal January cancelled bookings after April page two",
      );
      assertCustomerPortalPagedState(cancelledJanuaryState, {
        activeFilter: "Cancelled",
        activeMonthLabel: "January 2026",
        currentMonthActive: false,
        label: "Cancelled January after April page two",
        nextDisabled: true,
        pageSummary: "Page 1 of 1",
        previousDisabled: true,
        rowCount: 1,
        rowIdIncludes: "cancelled-january",
        selectedPastMonthKey: "2026-01",
        showingText: "Showing 1-1 of 1 bookings",
        status: "Cancelled",
      });

      await clickCustomerPortalMonth("2026-04");
      const cancelledAprilAfterJanuaryState = await waitForCondition(
        async () => {
          const candidateState = await readCustomerPortalState();
          return candidateState.showingText === "Showing 1-10 of 11 bookings" &&
            candidateState.rowIds.every((id) => id.includes("cancelled-april"))
            ? candidateState
            : false;
        },
        10000,
        "customer portal April cancelled bookings after January switch",
      );
      assertCustomerPortalPagedState(cancelledAprilAfterJanuaryState, {
        activeFilter: "Cancelled",
        activeMonthLabel: "April 2026",
        currentMonthActive: false,
        label: "Cancelled April after January switch",
        nextDisabled: false,
        pageSummary: "Page 1 of 2",
        previousDisabled: true,
        rowCount: 10,
        rowIdIncludes: "cancelled-april",
        selectedPastMonthKey: "2026-04",
        showingText: "Showing 1-10 of 11 bookings",
        status: "Cancelled",
      });

      await setCustomerPortalViewportAndLoad(mobileViewport);
      const mobileState = await readCustomerPortalState();
      assert.ok(
        mobileState.docScrollWidth <= mobileState.docClientWidth + 2,
        `Expected /my-bookings mobile page not to overflow horizontally: ${mobileState.docScrollWidth} > ${mobileState.docClientWidth}`,
      );
      assert.equal(mobileState.searchVisible, true, "Expected /my-bookings search to remain touch-friendly on mobile");
      assert.equal(mobileState.rowCount, 10, "Expected /my-bookings mobile view to keep the 10-row limit");
      assert.deepEqual(
        mobileState.forbiddenVisibleText,
        [],
        "Expected /my-bookings mobile view not to show internal/admin/mock/Supabase/payment/billing wording",
      );
      assertNoPaymentIntegrationResources(mobileState.resourceCalls, "mobile customer portal page");
      await checkTelegramBoundary("/my-bookings mobile");

      return {
        activeFilter: initialState.activeFilter,
        forbiddenVisibleText: initialState.forbiddenVisibleText,
        mobile: {
          docClientWidth: mobileState.docClientWidth,
          docScrollWidth: mobileState.docScrollWidth,
        },
        route: "/my-bookings",
        rowLimit: initialState.rowCount,
        showingText: initialState.showingText,
      };
    };

    const resetDriverJobWorkflowMock = async () => {
      const response = await fetch(driverJobWorkflowApiUrl, {
        headers: { "x-prestige-driver-job-mock-reset": "1" },
      });
      assert.equal(response.ok, true, "Expected driver job workflow mock reset to succeed");
      const result = await response.json();
      assert.equal(result.ok, true, "Expected driver job workflow mock reset payload");
    };

    const setDriverJobViewportAndLoad = async (viewport) => {
      await resetDriverJobWorkflowMock();
      await client.send("Emulation.setDeviceMetricsOverride", {
        deviceScaleFactor: viewport.scale,
        height: viewport.height,
        mobile: viewport.mobile,
        width: viewport.width,
      });

      await navigateWithLoadEvent(client, driverJobWorkflowUrl);
      await waitForBodyText(
        evaluate,
        "Mock Workflow Pickup",
        `${viewport.label} driver job link route`,
      );
      await evaluate(`(() => {
        const blockedDriverJobUrlPattern = /supabase|\\/rest\\/v1\\/|api\\/live-location|api\\/driver-live-location|api\\/driver-ots-photo|api\\/photo-proof|api\\/upload|api\\/storage|api\\/file|api\\/driver-upload|api\\/driver-file|api\\/driver-exception|api\\/driver-replacement|api\\/driver-reassign|api\\/driver-assignment|api\\/driver-cancel|api\\/cancel-driver|api\\/reassign-driver|api\\/flight|api\\/reminder|api\\/notification|api\\/notify|api\\/sms|api\\/whatsapp|api\\/email|api\\/calendar|api\\/payment|api\\/bank|api\\/invoice|api\\/pdf|api\\/statement|twilio|sendgrid|mailgun|postmark|stripe|hitpay|paypal|paynow|googleapis|maps\\.google|maps\\.gstatic/i;
        window.__driverJobFetchCalls = [];
        window.__driverJobNetworkCalls = [];
        const originalFetch = window.__driverJobOriginalFetch || window.fetch.bind(window);
        window.__driverJobOriginalFetch = originalFetch;
        window.fetch = (...args) => {
          const target = args[0]?.url || args[0];
          const method = args[1]?.method || args[0]?.method || "GET";
          const url = String(target);
          const call = \`\${method} \${url}\`;

          window.__driverJobFetchCalls.push(call);
          window.__driverJobNetworkCalls.push(call);

          if (blockedDriverJobUrlPattern.test(url)) {
            return Promise.resolve(
              new Response(JSON.stringify({ message: "Driver job smoke test blocked a forbidden integration call" }), {
                status: 500,
                headers: { "content-type": "application/json" },
              }),
            );
          }

          return originalFetch(...args);
        };

        const originalOpen = window.__driverJobOriginalXHROpen || window.XMLHttpRequest.prototype.open;
        window.__driverJobOriginalXHROpen = originalOpen;
        window.XMLHttpRequest.prototype.open = function patchedDriverJobOpen(method, url, ...rest) {
          window.__driverJobNetworkCalls.push(\`\${method} \${String(url)}\`);
          return originalOpen.call(this, method, url, ...rest);
        };

        if (navigator.sendBeacon && !window.__driverJobOriginalSendBeacon) {
          const originalSendBeacon = navigator.sendBeacon.bind(navigator);
          window.__driverJobOriginalSendBeacon = originalSendBeacon;
          navigator.sendBeacon = (...args) => {
            const target = String(args[0]);
            window.__driverJobNetworkCalls.push(\`BEACON \${target}\`);
            return blockedDriverJobUrlPattern.test(target) ? false : originalSendBeacon(...args);
          };
        }
      })()`);
    };

    const clickDriverJobButton = async (selector, description) => {
      const clicked = await evaluate(`(() => {
        const button = document.querySelector(${JSON.stringify(selector)});

        if (!button || button.disabled) {
          return false;
        }

        button.click();
        return true;
      })()`);
      assert.equal(clicked, true, `Expected ${description} button to be clickable`);
    };

    const setDriverJobField = async (selector, value) => {
      const actualValue = await evaluate(`(() => {
        const input = document.querySelector(${JSON.stringify(selector)});

        if (!input) {
          return null;
        }

        const descriptor = Object.getOwnPropertyDescriptor(input.constructor.prototype, "value");
        descriptor?.set?.call(input, ${JSON.stringify(value)});
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));

        return input.value;
      })()`);
      assert.equal(actualValue, value, `Expected driver job field ${selector} to accept test value`);
    };

    const readDriverJobNetworkState = () =>
      evaluate(`(() => ({
        fetchCalls: window.__driverJobFetchCalls || [],
        networkCalls: window.__driverJobNetworkCalls || [],
        resourceCalls: performance.getEntriesByType("resource").map((entry) => entry.name),
      }))()`);

    const assertNoForbiddenDriverJobNetwork = (networkState, context) => {
      const calls = [
        ...networkState.fetchCalls,
        ...networkState.networkCalls,
        ...networkState.resourceCalls,
      ];
      assert.deepEqual(
        calls.filter((call) => blockedDriverJobIntegrationPattern.test(call)),
        [],
        `${context}: expected no Supabase, notification, WhatsApp, email, SMS, calendar, live-location, flight, file/photo, invoice, PDF, payment, or bank calls`,
      );
    };

    const readDriverJobState = () =>
      evaluate(`(() => {
        const text = document.body.innerText;
        const lowerText = text.toLowerCase();
        const doc = document.documentElement;
        const body = document.body;
        const inputs = [...document.querySelectorAll("input")].map((input) => ({
          height: Math.round(input.getBoundingClientRect().height),
          inputMode: input.getAttribute("inputmode") || input.inputMode || "",
          label: input.closest("label")?.innerText.trim() || "",
          type: input.getAttribute("type") || "",
          width: Math.round(input.getBoundingClientRect().width),
        }));
        const buttons = [...document.querySelectorAll("button")].map((button) => ({
          height: Math.round(button.getBoundingClientRect().height),
          text: button.textContent.trim(),
          width: Math.round(button.getBoundingClientRect().width),
        }));
        const workflowSummaryRows = Object.fromEntries(
          [...document.querySelectorAll("[data-driver-job-workflow-summary-row]")].map((row) => [
            row.getAttribute("data-driver-job-workflow-summary-row"),
            row.querySelector("[data-driver-job-workflow-summary-value]")?.textContent.trim() || "",
          ]),
        );

        return {
          adminTabsVisible: document.querySelectorAll("button[role='tab']").length,
          bodyScrollWidth: body.scrollWidth,
          buttonLabels: buttons.map((button) => button.text),
          buttons,
          currentStatus: document.querySelector("[data-driver-job-current-status]")?.textContent.trim() || "",
          docClientWidth: doc.clientWidth,
          docScrollWidth: doc.scrollWidth,
          fileInputs: [...document.querySelectorAll("input[type='file'], input[capture], input[accept*='image'], input[accept*='photo']")]
            .map((input) => input.closest("label")?.innerText.trim() || input.outerHTML),
          dispatcherExceptionText: [
            "cancel current driver assignment",
            "cancel driver assignment",
            "cancel assignment",
            "replacement driver",
            "replacement car",
            "reassign replacement driver",
            "reassign driver",
            "car breakdown",
            "driver missed job",
            "late driver",
          ].filter((value) => lowerText.includes(value)),
          forbiddenText: [
            "pricing",
            "payout",
            "crm",
            "booker email",
            "internal notes",
            "driver dispatch",
            "dispatcher intake",
            "dashboard",
            "driver database",
            "rates",
            "invoice",
            "statement",
            "pdf",
            "payment",
            "bank",
          ].filter((value) => lowerText.includes(value)),
          inputs,
          payNowFieldPresent: inputs.some((input) => /pay\\s*now|paynow/i.test(input.label)),
          resourceCalls: performance.getEntriesByType("resource").map((entry) => entry.name),
          text,
          workflowSummaryRows,
        };
      })()`);

    const checkDriverJobRoute = async (viewport) => {
      const statusEndpointPath = `/api/driver-job/${driverJobWorkflowToken}/status`;
      await setDriverJobViewportAndLoad(viewport);

      const initialState = await readDriverJobState();
      const overflowingWidth = Math.max(initialState.docScrollWidth, initialState.bodyScrollWidth);
      const smallInputs = initialState.inputs.filter((input) => input.height < 44 || input.width < 220);
      const smallButtons = initialState.buttons.filter((button) => button.height < 44 || button.width < 96);

      assert.equal(
        overflowingWidth <= initialState.docClientWidth + 2,
        true,
        `${viewport.label}: expected driver job link to avoid horizontal document overflow`,
      );
      assert.equal(initialState.adminTabsVisible, 0, `${viewport.label}: expected no admin tabs on driver job link`);
      assert.equal(initialState.currentStatus, "Assigned", `${viewport.label}: expected driver job link to start assigned`);
      assert.deepEqual(
        initialState.forbiddenText,
        [],
        `${viewport.label}: expected no pricing, payout, CRM, invoice, payment, bank, or admin text on driver job link`,
      );
      assert.deepEqual(initialState.fileInputs, [], `${viewport.label}: expected no real file/photo upload inputs`);
      assert.deepEqual(
        initialState.dispatcherExceptionText,
        [],
        `${viewport.label}: expected dispatcher cancel/replacement workflow to remain absent and future staff-controlled`,
      );
      assert.equal(initialState.payNowFieldPresent, true, `${viewport.label}: expected local PayNow number field`);
      assert.deepEqual(
        [
          "Prestige Limo Driver Job",
          "Job Summary",
          "Mock Workflow Pickup",
          "Mock Workflow Dropoff",
          "Mock Workflow Pickup > Mock Workflow Waypoint > Mock Workflow Dropoff",
          "SQ889",
          "Mock Workflow Passenger",
          "Mock Workflow Driver",
          "Driver Details",
          "Job Acknowledgement",
          "Mock Live Location",
          "Mock Driver Reminder",
          "Job Status",
        ].filter((value) => !initialState.text.includes(value)),
        [],
        `${viewport.label}: expected readable driver job card details and workflow sections`,
      );
      assert.deepEqual(
        ["Driver name", "Contact", "Car plate", "Vehicle model", "PayNow number"].filter(
          (label) => !initialState.inputs.some((input) => input.label.includes(label)),
        ),
        [],
        `${viewport.label}: expected current driver detail fields`,
      );
      assert.deepEqual(
        initialState.inputs.map((input) => input.type),
        ["text", "tel", "text", "text", "tel"],
        `${viewport.label}: expected current driver detail input types`,
      );
      assert.equal(
        initialState.inputs.find((input) => input.label.includes("Contact"))?.inputMode,
        "tel",
        `${viewport.label}: expected contact field to use telephone input mode`,
      );
      assert.deepEqual(smallInputs, [], `${viewport.label}: expected comfortable driver job inputs`);
      assert.deepEqual(smallButtons, [], `${viewport.label}: expected comfortable driver job buttons`);
      assert.deepEqual(
        [
          "Acknowledge Job",
          "Activate Mock Live Location",
          "Trigger Mock 1-Hour Reminder",
          "Save",
          "OTW",
          "OTS",
          "POB",
          "Job Completed",
        ].filter((label) => !initialState.buttonLabels.includes(label)),
        [],
        `${viewport.label}: expected current driver job workflow controls`,
      );
      assert.equal(
        initialState.text.includes("Mock/local only. No phone location is captured or sent."),
        true,
        `${viewport.label}: expected mock live-location boundary text`,
      );
      assert.equal(
        initialState.text.includes("Mock/local only. No real notification, WhatsApp, or SMS is sent."),
        true,
        `${viewport.label}: expected mock notification boundary text`,
      );
      assert.equal(
        initialState.text.includes("Mock only. No real message was sent."),
        true,
        `${viewport.label}: expected no-real-message workflow summary`,
      );
      assertNoForbiddenDriverJobNetwork(
        {
          fetchCalls: [],
          networkCalls: [],
          resourceCalls: initialState.resourceCalls,
        },
        `${viewport.label} driver job link load`,
      );
      await checkTelegramBoundary(`${viewport.label} public driver token page`);

      const clickBlockedDriverJobStatus = async (label, expectedMessage, expectedStatus) => {
        const beforeNetwork = await readDriverJobNetworkState();
        await clickDriverJobButton(
          `[data-driver-job-status="${label}"]`,
          `${viewport.label} blocked ${label}`,
        );
        const blockedState = await waitForCondition(
          () =>
            evaluate(`(() => {
              const label = ${JSON.stringify(label)};
              const expectedMessage = ${JSON.stringify(expectedMessage)};
              const message = document.querySelector(\`[data-driver-job-status-message="\${label}"]\`);
              const currentStatus = document.querySelector("[data-driver-job-current-status]")?.textContent.trim() || "";

              return message?.textContent.trim() === expectedMessage && currentStatus === ${JSON.stringify(expectedStatus)}
                ? {
                    currentStatus,
                    fetchCalls: window.__driverJobFetchCalls || [],
                    messageText: message.textContent.trim(),
                  }
                : false;
            })()`),
          10000,
          `${viewport.label} blocked ${label} status`,
        );
        assert.equal(blockedState.currentStatus, expectedStatus);
        const afterNetwork = await readDriverJobNetworkState();
        assert.deepEqual(afterNetwork.fetchCalls, beforeNetwork.fetchCalls, `${viewport.label}: expected blocked ${label} to stay local`);
        assertNoForbiddenDriverJobNetwork(afterNetwork, `${viewport.label} blocked ${label}`);
      };

      const clickValidDriverJobStatus = async (label, expectedStatus, expectedMessage) => {
        const beforeNetwork = await readDriverJobNetworkState();
        await clickDriverJobButton(
          `[data-driver-job-status="${label}"]`,
          `${viewport.label} ${label}`,
        );
        const statusState = await waitForCondition(
          () =>
            evaluate(`(() => {
              const label = ${JSON.stringify(label)};
              const expectedStatus = ${JSON.stringify(expectedStatus)};
              const expectedMessage = ${JSON.stringify(expectedMessage)};
              const message = document.querySelector(\`[data-driver-job-status-message="\${label}"]\`);
              const currentStatus = document.querySelector("[data-driver-job-current-status]")?.textContent.trim() || "";

              return message?.textContent.trim() === expectedMessage && currentStatus === expectedStatus
                ? {
                    currentStatus,
                    fetchCalls: window.__driverJobFetchCalls || [],
                    messageText: message.textContent.trim(),
                  }
                : false;
            })()`),
          10000,
          `${viewport.label} ${label} status`,
        );
        assert.equal(statusState.currentStatus, expectedStatus);
        const afterNetwork = await readDriverJobNetworkState();
        const newFetchCalls = afterNetwork.fetchCalls.slice(beforeNetwork.fetchCalls.length);
        assert.deepEqual(
          newFetchCalls.filter((call) => !call.includes(statusEndpointPath)),
          [],
          `${viewport.label}: expected ${label} to call only the protected driver job status endpoint`,
        );
        assert.equal(
          newFetchCalls.filter((call) => call.includes(statusEndpointPath)).length,
          1,
          `${viewport.label}: expected ${label} to call the protected driver job status endpoint once`,
        );
        assertNoForbiddenDriverJobNetwork(afterNetwork, `${viewport.label} ${label}`);
      };

      await clickBlockedDriverJobStatus("OTW", "Acknowledge this job before updating status.", "Assigned");

      await setDriverJobField("[data-driver-job-detail-name]", "Smoke Driver");
      await setDriverJobField("[data-driver-job-detail-contact]", "+65 9000 2222");
      await setDriverJobField("[data-driver-job-detail-plate]", "SMK1234Z");
      await setDriverJobField("[data-driver-job-detail-vehicle-model]", "Mercedes V Class");
      await setDriverJobField("[data-driver-job-detail-paynow]", "8123 4567");
      const beforeSaveNetwork = await readDriverJobNetworkState();
      await clickDriverJobButton("[data-driver-job-save-details]", `${viewport.label} Save driver details`);
      const savedDetailsState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const message = document.querySelector("[data-driver-job-details-message]");
            const savedDetails = document.querySelector("[data-driver-job-saved-details]");

            return message?.textContent.trim() === "Driver details saved locally for this mock driver page." &&
              savedDetails?.innerText.includes("Smoke Driver") &&
              savedDetails?.innerText.includes("+65 9000 2222") &&
              savedDetails?.innerText.includes("SMK1234Z") &&
              savedDetails?.innerText.includes("Mercedes V Class") &&
              savedDetails?.innerText.includes("8123 4567")
              ? {
                  fetchCalls: window.__driverJobFetchCalls || [],
                  messageText: message.textContent.trim(),
                  savedDetailsText: savedDetails.innerText,
                }
              : false;
          })()`),
        10000,
        `${viewport.label} local driver details save`,
      );
      assert.deepEqual(
        savedDetailsState.fetchCalls,
        beforeSaveNetwork.fetchCalls,
        `${viewport.label}: expected driver details save to stay mock/local`,
      );

      const beforeAcknowledgeNetwork = await readDriverJobNetworkState();
      await clickDriverJobButton("[data-driver-job-acknowledge]", `${viewport.label} Acknowledge Job`);
      const acknowledgedState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const message = document.querySelector("[data-driver-job-acknowledge-message]");
            const acknowledged = document.querySelector("[data-driver-job-acknowledged-state]");
            const workflowAcknowledgement = document
              .querySelector("[data-driver-job-workflow-summary-row='job-acknowledged'] [data-driver-job-workflow-summary-value]")
              ?.textContent.trim();

            return message?.textContent.trim() === "Job acknowledged locally for this mock driver page." &&
              acknowledged?.textContent.trim() === "Acknowledged" &&
              workflowAcknowledgement === "Acknowledged"
              ? {
                  fetchCalls: window.__driverJobFetchCalls || [],
                  messageText: message.textContent.trim(),
                  stateText: acknowledged.textContent.trim(),
                }
              : false;
          })()`),
        10000,
        `${viewport.label} local job acknowledgement`,
      );
      assert.deepEqual(
        acknowledgedState.fetchCalls,
        beforeAcknowledgeNetwork.fetchCalls,
        `${viewport.label}: expected acknowledgement to stay mock/local`,
      );

      const beforeLiveLocationNetwork = await readDriverJobNetworkState();
      await clickDriverJobButton("[data-driver-job-live-location]", `${viewport.label} Activate Mock Live Location`);
      const liveLocationState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const message = document.querySelector("[data-driver-job-live-location-message]");
            const state = document.querySelector("[data-driver-job-live-location-state]");
            const workflowLiveLocation = document
              .querySelector("[data-driver-job-workflow-summary-row='live-location'] [data-driver-job-workflow-summary-value]")
              ?.textContent.trim();

            return message?.textContent.trim() ===
              "Mock live location active locally for this mock driver page. No phone location is captured or sent." &&
              state?.textContent.trim() === "Mock live location active" &&
              workflowLiveLocation === "Active"
              ? {
                  fetchCalls: window.__driverJobFetchCalls || [],
                  messageText: message.textContent.trim(),
                  stateText: state.textContent.trim(),
                }
              : false;
          })()`),
        10000,
        `${viewport.label} mock live location local activation`,
      );
      assert.deepEqual(
        liveLocationState.fetchCalls,
        beforeLiveLocationNetwork.fetchCalls,
        `${viewport.label}: expected mock live-location activation to stay local`,
      );

      const beforeReminderNetwork = await readDriverJobNetworkState();
      await clickDriverJobButton("[data-driver-job-reminder]", `${viewport.label} Trigger Mock 1-Hour Reminder`);
      const reminderState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const message = document.querySelector("[data-driver-job-reminder-message]");
            const status = document.querySelector("[data-driver-job-reminder-summary-status]");
            const dispatcherLog = document.querySelector("[data-driver-job-dispatcher-notification-log]");

            return message?.textContent.trim() ===
              "Mock 1-hour reminder triggered locally. No real notification, WhatsApp, or SMS was sent." &&
              status?.textContent.trim() === "Triggered locally" &&
              dispatcherLog?.innerText.includes("Mock only. No message was sent.")
              ? {
                  fetchCalls: window.__driverJobFetchCalls || [],
                  messageText: message.textContent.trim(),
                }
              : false;
          })()`),
        10000,
        `${viewport.label} mock reminder local trigger`,
      );
      assert.deepEqual(
        reminderState.fetchCalls,
        beforeReminderNetwork.fetchCalls,
        `${viewport.label}: expected mock reminder to stay local`,
      );

      await clickValidDriverJobStatus("OTW", "OTW", "Status updated to OTW.");
      await clickBlockedDriverJobStatus("POB", "Update OTS before POB.", "OTW");
      await clickValidDriverJobStatus("OTS", "OTS", "Status updated to OTS.");
      await clickBlockedDriverJobStatus("Job Completed", "Update POB before Job Completed.", "OTS");
      await clickValidDriverJobStatus("POB", "POB", "Status updated to POB. Mock live location ended locally.");
      await waitForCondition(
        () =>
          evaluate(`document.querySelector("[data-driver-job-live-location-state]")?.textContent.trim() === "Mock live location inactive" &&
            document.querySelector("[data-driver-job-workflow-summary-row='pob'] [data-driver-job-workflow-summary-value]")?.textContent.trim() === "Done" &&
            document.querySelector("[data-driver-job-workflow-summary-row='live-location'] [data-driver-job-workflow-summary-value]")?.textContent.trim() === "Inactive"`),
        10000,
        `${viewport.label} mock live location ended at POB`,
      );

      const beforeEndedLiveLocationNetwork = await readDriverJobNetworkState();
      await clickDriverJobButton("[data-driver-job-live-location]", `${viewport.label} blocked mock live location after POB`);
      const endedLiveLocationState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const message = document.querySelector("[data-driver-job-live-location-message]");
            const state = document.querySelector("[data-driver-job-live-location-state]");

            return message?.textContent.trim() === "Mock live location has ended for this job." &&
              state?.textContent.trim() === "Mock live location inactive"
              ? {
                  fetchCalls: window.__driverJobFetchCalls || [],
                  messageText: message.textContent.trim(),
                }
              : false;
          })()`),
        10000,
        `${viewport.label} mock live location remains ended after POB`,
      );
      assert.deepEqual(
        endedLiveLocationState.fetchCalls,
        beforeEndedLiveLocationNetwork.fetchCalls,
        `${viewport.label}: expected ended mock live-location action to stay local`,
      );

      await clickValidDriverJobStatus("Job Completed", "Job Completed", "Status updated to Job Completed.");

      const finalNetwork = await readDriverJobNetworkState();
      assertNoForbiddenDriverJobNetwork(finalNetwork, `${viewport.label} completed driver job link workflow`);
      assert.deepEqual(
        finalNetwork.fetchCalls.filter((call) => call.includes(statusEndpointPath)).length,
        4,
        `${viewport.label}: expected exactly four protected mock status API calls for OTW, OTS, POB, and Job Completed`,
      );

      return {
        buttons: initialState.buttonLabels,
        docClientWidth: initialState.docClientWidth,
        docScrollWidth: initialState.docScrollWidth,
        fileInputs: initialState.fileInputs.length,
        inputs: initialState.inputs.map((input) => ({
          label: input.label.split("\\n")[0],
          type: input.type,
        })),
        otsPresent: initialState.buttonLabels.includes("OTS"),
        payNowFieldPresent: initialState.payNowFieldPresent,
        route: `/driver-job/${driverJobWorkflowToken}`,
        viewport: viewport.label,
      };
    };

    const setDriverDemoViewportAndLoad = async (viewport) => {
      await client.send("Emulation.setDeviceMetricsOverride", {
        deviceScaleFactor: viewport.scale,
        height: viewport.height,
        mobile: viewport.mobile,
        width: viewport.width,
      });

      await navigateWithLoadEvent(client, driverDemoUrl);
      await waitForBodyText(
        evaluate,
        "Prestige Limo Driver Job",
        `${viewport.label} driver job demo route`,
      );
      await evaluate(`(() => {
        window.__driverDemoFetchCalls = [];
        const blockedDriverDemoUrlPattern = /supabase|\\/rest\\/v1\\/|api\\/live-location|api\\/driver-live-location|api\\/driver-ots-photo|api\\/photo-proof|api\\/upload|api\\/storage|api\\/file|api\\/driver-upload|api\\/driver-file|api\\/driver-exception|api\\/driver-replacement|api\\/driver-reassign|api\\/driver-assignment|api\\/driver-cancel|api\\/cancel-driver|api\\/reassign-driver|api\\/flight|api\\/reminder|api\\/notification|api\\/notify|api\\/sms|api\\/whatsapp|api\\/email|api\\/calendar|api\\/payment|api\\/bank|api\\/invoice|api\\/pdf|api\\/statement|twilio|sendgrid|mailgun|postmark|stripe|hitpay|paypal|paynow|googleapis|maps\\.google|maps\\.gstatic/i;
        const originalFetch = window.__driverDemoOriginalFetch || window.fetch.bind(window);
        window.__driverDemoOriginalFetch = originalFetch;
        window.fetch = (...args) => {
          const target = args[0]?.url || args[0];
          const method = args[1]?.method || args[0]?.method || "GET";
          const url = String(target);

          window.__driverDemoFetchCalls.push(\`\${method} \${url}\`);

          if (blockedDriverDemoUrlPattern.test(url)) {
            return Promise.resolve(
              new Response(JSON.stringify({ message: "Driver demo smoke test blocked a forbidden integration call" }), {
                status: 500,
                headers: { "content-type": "application/json" },
              }),
            );
          }

          return originalFetch(...args);
        };
      })()`);
    };

    const clickDriverDemoButton = async (selector, description) => {
      const clicked = await evaluate(`(() => {
        const button = document.querySelector(${JSON.stringify(selector)});

        if (!button || button.disabled) {
          return false;
        }

        button.click();
        return true;
      })()`);
      assert.equal(clicked, true, `Expected ${description} button to be clickable`);
    };

    const checkDriverDemoRoute = async (viewport) => {
      await setDriverDemoViewportAndLoad(viewport);

      const initialState = await evaluate(`(() => {
        const text = document.body.innerText;
        const lowerText = text.toLowerCase();
        const doc = document.documentElement;
        const body = document.body;
        const inputs = [...document.querySelectorAll("input")].map((input) => ({
          height: Math.round(input.getBoundingClientRect().height),
          label: input.closest("label")?.innerText.trim() || "",
          type: input.getAttribute("type") || "",
          width: Math.round(input.getBoundingClientRect().width),
        }));
        const textareas = [...document.querySelectorAll("textarea")].map((textarea) => ({
          height: Math.round(textarea.getBoundingClientRect().height),
          label: textarea.closest("label")?.innerText.trim() || "",
          width: Math.round(textarea.getBoundingClientRect().width),
        }));
        const buttons = [...document.querySelectorAll("button")].map((button) => ({
          className: button.className,
          height: Math.round(button.getBoundingClientRect().height),
          text: button.textContent.trim(),
          width: Math.round(button.getBoundingClientRect().width),
        }));

        return {
          adminTabsVisible: document.querySelectorAll("button[role='tab']").length,
          activityLogLabels: [...document.querySelectorAll("[data-driver-demo-activity-log-label]")]
            .map((item) => item.textContent.trim()),
          bodyScrollWidth: body.scrollWidth,
          buttonLabels: buttons.map((button) => button.text),
          buttons,
          docClientWidth: doc.clientWidth,
          docScrollWidth: doc.scrollWidth,
          dispatcherExceptionButtons: [...document.querySelectorAll("[data-driver-demo-dispatcher-exception-action]")]
            .map((button) => button.textContent.trim()),
          dispatcherExceptionMessages: [...document.querySelectorAll("[data-driver-demo-dispatcher-exception-message]")]
            .map((message) => message.textContent.trim()),
          dispatcherExceptionSection: document.querySelector("[data-driver-demo-dispatcher-exception]")?.innerText || "",
          fileInputs: [...document.querySelectorAll("input[type='file'], input[capture], input[accept*='image'], input[accept*='photo']")]
            .map((input) => input.closest("label")?.innerText.trim() || input.outerHTML),
          dispatcherExceptionText: [
            "cancel current driver assignment",
            "cancel driver assignment",
            "cancel assignment",
            "replacement driver",
            "replacement car",
            "reassign replacement driver",
            "reassign driver",
            "car breakdown",
            "driver missed job",
            "late driver",
          ].filter((value) => lowerText.includes(value)),
          forbiddenText: [
            "pricing",
            "payout",
            "crm",
            "booker email",
            "internal notes",
            "driver dispatch",
            "dispatcher intake",
            "dashboard",
            "driver database",
            "rates",
          ].filter((value) => lowerText.includes(value)),
          inputs,
          text,
          textareas,
          warningVisible: Boolean(document.querySelector("[data-driver-demo-warning]")),
          workflowSummaryRows: Object.fromEntries(
            [...document.querySelectorAll("[data-driver-demo-workflow-summary-row]")].map((row) => [
              row.getAttribute("data-driver-demo-workflow-summary-row"),
              row.querySelector("[data-driver-demo-workflow-summary-value]")?.textContent.trim() || "",
            ]),
          ),
        };
      })()`);

      const overflowingWidth = Math.max(initialState.docScrollWidth, initialState.bodyScrollWidth);
      const smallInputs = initialState.inputs.filter((input) => input.height < 44 || input.width < 220);
      const smallTextareas = initialState.textareas.filter((textarea) => textarea.height < 96 || textarea.width < 220);
      const smallButtons = initialState.buttons.filter((button) => button.height < 44 || button.width < 96);

      assert.equal(
        overflowingWidth <= initialState.docClientWidth + 2,
        true,
        `${viewport.label}: expected driver demo to avoid horizontal document overflow`,
      );
      assert.equal(initialState.warningVisible, true, `${viewport.label}: expected driver demo warning`);
      assert.equal(initialState.adminTabsVisible, 0, `${viewport.label}: expected no admin tabs`);
      assert.deepEqual(
        initialState.forbiddenText,
        [],
        `${viewport.label}: expected no pricing, payout, CRM, or admin text on driver demo`,
      );
      assert.deepEqual(initialState.fileInputs, [], `${viewport.label}: expected no real file/photo upload inputs on driver demo`);
      assert.deepEqual(
        initialState.dispatcherExceptionText,
        [
          "cancel current driver assignment",
          "replacement driver",
          "replacement car",
          "reassign replacement driver",
          "car breakdown",
          "driver missed job",
          "late driver",
        ],
        `${viewport.label}: expected demo-only dispatcher exception placeholder text`,
      );
      assert.equal(
        initialState.dispatcherExceptionSection.includes("Dispatcher Exception / Replacement — Mock Only"),
        true,
        `${viewport.label}: expected dispatcher exception placeholder heading`,
      );
      assert.equal(
        initialState.dispatcherExceptionSection.includes("Staff/demo placeholder only. Not shown on the secure public driver token page."),
        true,
        `${viewport.label}: expected staff/demo-only dispatcher exception boundary`,
      );
      assert.equal(
        initialState.dispatcherExceptionSection.includes("Mock/local only"),
        true,
        `${viewport.label}: expected mock/local dispatcher exception wording`,
      );
      assert.equal(
        initialState.dispatcherExceptionSection.includes("No real cancel/reassign API"),
        true,
        `${viewport.label}: expected no real cancel/reassign API wording`,
      );
      assert.deepEqual(
        initialState.dispatcherExceptionButtons,
        [
          "Cancel current driver assignment — Mock Only",
          "Replacement driver/car details — Mock Only",
          "Reassign replacement driver later — Future staff-controlled workflow",
        ],
        `${viewport.label}: expected demo-only dispatcher exception buttons`,
      );
      assert.deepEqual(
        ["Driver name", "Mobile number", "Car plate", "Vehicle model", "PayNow number"].filter(
          (label) => !initialState.inputs.some((input) => input.label.includes(label)),
        ),
        [],
        `${viewport.label}: expected all driver detail fields`,
      );
      assert.deepEqual(
        initialState.inputs.map((input) => input.type),
        ["text", "tel", "text", "text", "tel"],
        `${viewport.label}: expected mobile-friendly input types`,
      );
      assert.deepEqual(
        ["Paste Driver Details"].filter(
          (label) => !initialState.textareas.some((textarea) => textarea.label.includes(label)),
        ),
        [],
        `${viewport.label}: expected driver details paste textarea`,
      );
      assert.deepEqual(smallInputs, [], `${viewport.label}: expected comfortable driver inputs`);
      assert.deepEqual(smallTextareas, [], `${viewport.label}: expected comfortable paste textarea`);
      assert.deepEqual(smallButtons, [], `${viewport.label}: expected comfortable driver buttons`);
      assert.deepEqual(
        [
          "Acknowledge Job",
          "Activate Mock Live Location",
          "Trigger Mock 1-Hour Reminder",
          "Acknowledge Latest ETA",
          "Parse Driver Details",
          "Save",
          "Cancel current driver assignment — Mock Only",
          "Replacement driver/car details — Mock Only",
          "Reassign replacement driver later — Future staff-controlled workflow",
          "OTW",
          "OTS",
          "POB",
          "Job Completed",
        ].filter(
          (label) => !initialState.buttonLabels.includes(label),
        ),
        [],
        `${viewport.label}: expected all driver action buttons`,
      );
      assert.deepEqual(
        ["Acknowledge Job", "Parse Driver Details", "Save"].filter((label) => {
          const button = initialState.buttons.find((candidate) => candidate.text === label);
          return !button?.className.includes("bg-slate-950") || !button.className.includes("text-white");
        }),
        [],
        `${viewport.label}: expected driver details actions to use primary button styling`,
      );
      assert.equal(
        initialState.text.includes("Demo only — not connected to live bookings yet."),
        true,
        `${viewport.label}: expected exact demo-only warning`,
      );
      assert.equal(
        initialState.text.includes("Mock Driver Reminder"),
        true,
        `${viewport.label}: expected mock driver reminder section`,
      );
      assert.equal(
        initialState.text.includes("Mock Dispatcher Driver Workflow Summary"),
        true,
        `${viewport.label}: expected mock dispatcher workflow summary`,
      );
      assert.equal(
        initialState.text.includes("Mock/local only. Dispatcher-facing workflow checklist for this mock driver page."),
        true,
        `${viewport.label}: expected mock dispatcher workflow summary local-only text`,
      );
      assert.deepEqual(
        initialState.workflowSummaryRows,
        {
          completed: "Pending",
          "dispatcher-log": "No mock dispatcher notification recorded yet.",
          "job-acknowledged": "Waiting",
          "latest-eta": "Pending acknowledgement",
          "live-location": "Inactive",
          ots: "Pending",
          "ots-photo-proof": "Pending proof",
          otw: "Pending",
          pob: "Pending",
          "reminder-status": "Pending local trigger (Not triggered)",
        },
        `${viewport.label}: expected initial mock dispatcher workflow summary state`,
      );
      assert.equal(
        initialState.text.includes("Mock dispatcher reminder summary"),
        true,
        `${viewport.label}: expected mock dispatcher reminder summary`,
      );
      assert.equal(
        initialState.text.includes("Mock driver reminder status"),
        true,
        `${viewport.label}: expected mock driver reminder status`,
      );
      assert.equal(
        initialState.text.includes("Pending local trigger"),
        true,
        `${viewport.label}: expected initial mock reminder status`,
      );
      assert.equal(
        initialState.text.includes("Reminder triggered / blocked state"),
        true,
        `${viewport.label}: expected mock reminder triggered/blocked state`,
      );
      assert.equal(
        initialState.text.includes("No mock dispatcher notification recorded yet."),
        true,
        `${viewport.label}: expected empty mock dispatcher notification log`,
      );
      assert.equal(
        initialState.text.includes("Mock only. No real message was sent."),
        true,
        `${viewport.label}: expected no-real-message mock dispatcher summary`,
      );
      assert.equal(
        initialState.text.includes("Mock/local only. No real notification, WhatsApp, or SMS is sent."),
        true,
        `${viewport.label}: expected mock/local reminder explanation`,
      );
      assert.equal(
        initialState.text.includes("Mock reminder: 1 hour before pickup"),
        true,
        `${viewport.label}: expected mock 1-hour reminder timing`,
      );
      assert.equal(
        initialState.text.includes("Mock Latest Flight ETA"),
        true,
        `${viewport.label}: expected mock latest flight ETA section`,
      );
      assert.equal(
        initialState.text.includes("Latest mock flight ETA: 15:45"),
        true,
        `${viewport.label}: expected mock latest flight ETA value`,
      );
      assert.equal(
        initialState.text.includes("Mock/local only. No real flight API is called and no notification is sent."),
        true,
        `${viewport.label}: expected mock/local latest ETA explanation`,
      );
      assert.equal(
        initialState.text.includes("Driver Activity Log"),
        true,
        `${viewport.label}: expected driver activity log section`,
      );
      assert.deepEqual(
        initialState.activityLogLabels,
        [],
        `${viewport.label}: expected empty driver activity log before successful actions`,
      );

      const clickDispatcherExceptionPlaceholder = async (actionKey, expectedMessage, description) => {
        const beforeFetchCount = await evaluate(`(window.__driverDemoFetchCalls || []).length`);
        const beforeLogLabels = await evaluate(
          `[...document.querySelectorAll("[data-driver-demo-activity-log-label]")].map((item) => item.textContent.trim())`,
        );
        await clickDriverDemoButton(
          `[data-driver-demo-dispatcher-exception-action="${actionKey}"]`,
          `${viewport.label} ${description}`,
        );
        const exceptionState = await waitForCondition(
          () =>
            evaluate(`(() => {
              const actionKey = ${JSON.stringify(actionKey)};
              const expectedMessage = ${JSON.stringify(expectedMessage)};
              const button = document.querySelector(\`[data-driver-demo-dispatcher-exception-action="\${actionKey}"]\`);
              const message = document.querySelector(\`[data-driver-demo-dispatcher-exception-message="\${actionKey}"]\`);
              const section = document.querySelector("[data-driver-demo-dispatcher-exception]");
              const buttonRect = button?.getBoundingClientRect();
              const messageRect = message?.getBoundingClientRect();

              return section?.innerText.includes("Staff/demo placeholder only.") &&
                section?.innerText.includes("Mock/local only") &&
                section?.innerText.includes("No real cancel/reassign API") &&
                message?.textContent.trim() === expectedMessage
                ? {
                    currentStatus: document.querySelector("[data-driver-demo-current-status]")?.textContent.trim() || "",
                    distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                    fetchCount: (window.__driverDemoFetchCalls || []).length,
                    messageText: message.textContent.trim(),
                  }
                : false;
            })()`),
          10000,
          `${viewport.label} ${description} local feedback`,
        );

        assert.equal(exceptionState.currentStatus, "Assigned");
        assert.equal(exceptionState.fetchCount, beforeFetchCount);
        assert.deepEqual(
          await evaluate(`[...document.querySelectorAll("[data-driver-demo-activity-log-label]")].map((item) => item.textContent.trim())`),
          beforeLogLabels,
          `${viewport.label}: expected ${description} not to alter the driver activity log`,
        );
        assert.equal(
          exceptionState.distance <= 16,
          true,
          `${viewport.label}: expected ${description} feedback close to clicked control`,
        );
      };

      await clickDispatcherExceptionPlaceholder(
        "cancel-assignment",
        "Mock cancel note recorded locally. No real driver assignment was cancelled and no cancel API was called.",
        "Cancel current driver assignment mock placeholder",
      );
      await clickDispatcherExceptionPlaceholder(
        "replacement-details",
        "Mock replacement details note recorded locally. No replacement car or driver details were saved to any live system.",
        "Replacement driver/car details mock placeholder",
      );
      await clickDispatcherExceptionPlaceholder(
        "reassign-later",
        "Future reassign placeholder acknowledged locally. No reassign API or dispatch change was called.",
        "Reassign replacement driver later mock placeholder",
      );

      const preAcknowledgementFetchCount = await evaluate(`(window.__driverDemoFetchCalls || []).length`);
      const preAcknowledgementLogLabels = await evaluate(
        `[...document.querySelectorAll("[data-driver-demo-activity-log-label]")].map((item) => item.textContent.trim())`,
      );
      await clickDriverDemoButton("[data-driver-demo-status=\"OTW\"]", `${viewport.label} blocked pre-ack OTW`);
      const preAcknowledgementStatusState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const button = document.querySelector("[data-driver-demo-status='OTW']");
            const message = document.querySelector("[data-driver-demo-status-message='OTW']");
            const buttonRect = button?.getBoundingClientRect();
            const messageRect = message?.getBoundingClientRect();

            return message?.textContent.trim() === "Acknowledge this job before updating status." &&
              document.querySelector("[data-driver-demo-current-status]")?.textContent.trim() === "Assigned"
              ? {
                  currentStatus: "Assigned",
                  distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                  fetchCount: (window.__driverDemoFetchCalls || []).length,
                  messageText: message.textContent.trim(),
                }
              : false;
          })()`),
        10000,
        `${viewport.label} pre-acknowledgement status block`,
      );
      assert.equal(preAcknowledgementStatusState.currentStatus, "Assigned");
      assert.equal(preAcknowledgementStatusState.fetchCount, preAcknowledgementFetchCount);
      assert.deepEqual(
        await evaluate(`[...document.querySelectorAll("[data-driver-demo-activity-log-label]")].map((item) => item.textContent.trim())`),
        preAcknowledgementLogLabels,
        `${viewport.label}: expected blocked pre-ack OTW not to create a log entry`,
      );
      assert.equal(
        preAcknowledgementStatusState.distance <= 16,
        true,
        `${viewport.label}: expected pre-acknowledgement status feedback close to OTW`,
      );

      const preAcknowledgementLiveLocationFetchCount = await evaluate(`(window.__driverDemoFetchCalls || []).length`);
      const preAcknowledgementLiveLocationLogLabels = await evaluate(
        `[...document.querySelectorAll("[data-driver-demo-activity-log-label]")].map((item) => item.textContent.trim())`,
      );
      await clickDriverDemoButton(
        "[data-driver-demo-live-location]",
        `${viewport.label} blocked pre-ack mock live location`,
      );
      const preAcknowledgementLiveLocationState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const button = document.querySelector("[data-driver-demo-live-location]");
            const message = document.querySelector("[data-driver-demo-live-location-message]");
            const state = document.querySelector("[data-driver-demo-live-location-state]");
            const buttonRect = button?.getBoundingClientRect();
            const messageRect = message?.getBoundingClientRect();

            return message?.textContent.trim() === "Acknowledge this job before activating mock live location." &&
              state?.textContent.trim() === "Mock live location inactive"
              ? {
                  distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                  fetchCount: (window.__driverDemoFetchCalls || []).length,
                  messageText: message.textContent.trim(),
                  stateText: state.textContent.trim(),
                }
              : false;
          })()`),
        10000,
        `${viewport.label} pre-acknowledgement mock live location block`,
      );
      assert.equal(preAcknowledgementLiveLocationState.fetchCount, preAcknowledgementLiveLocationFetchCount);
      assert.deepEqual(
        await evaluate(`[...document.querySelectorAll("[data-driver-demo-activity-log-label]")].map((item) => item.textContent.trim())`),
        preAcknowledgementLiveLocationLogLabels,
        `${viewport.label}: expected blocked pre-ack mock live location not to create a log entry`,
      );
      assert.equal(
        preAcknowledgementLiveLocationState.distance <= 16,
        true,
        `${viewport.label}: expected pre-acknowledgement live location feedback close to button`,
      );

      await clickDriverDemoButton("[data-driver-demo-acknowledge]", `${viewport.label} Acknowledge Job`);
      const acknowledgedState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const button = document.querySelector("[data-driver-demo-acknowledge]");
            const message = document.querySelector("[data-driver-demo-acknowledge-message]");
            const acknowledged = document.querySelector("[data-driver-demo-acknowledged-state]");
            const workflowAcknowledgement = document
              .querySelector("[data-driver-demo-workflow-summary-row='job-acknowledged'] [data-driver-demo-workflow-summary-value]")
              ?.textContent.trim();
            const buttonRect = button?.getBoundingClientRect();
            const messageRect = message?.getBoundingClientRect();

            return message?.textContent.trim() === "Job acknowledged locally for this mock driver page." &&
              acknowledged?.textContent.trim() === "Acknowledged" &&
              workflowAcknowledgement === "Acknowledged"
              ? {
                  distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                  messageText: message.textContent.trim(),
                  stateText: acknowledged.textContent.trim(),
                }
              : false;
          })()`),
        10000,
        `${viewport.label} acknowledgement message`,
      );
      assert.equal(acknowledgedState.stateText, "Acknowledged");
      assert.equal(
        acknowledgedState.distance <= 16,
        true,
        `${viewport.label}: expected acknowledgement feedback close to Acknowledge Job`,
      );

      const liveLocationFetchCount = await evaluate(`(window.__driverDemoFetchCalls || []).length`);
      await clickDriverDemoButton(
        "[data-driver-demo-live-location]",
        `${viewport.label} Activate Mock Live Location`,
      );
      const liveLocationState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const button = document.querySelector("[data-driver-demo-live-location]");
            const message = document.querySelector("[data-driver-demo-live-location-message]");
            const state = document.querySelector("[data-driver-demo-live-location-state]");
            const workflowLiveLocation = document
              .querySelector("[data-driver-demo-workflow-summary-row='live-location'] [data-driver-demo-workflow-summary-value]")
              ?.textContent.trim();
            const buttonRect = button?.getBoundingClientRect();
            const messageRect = message?.getBoundingClientRect();

            return message?.textContent.trim() ===
              "Mock live location active locally for this mock driver page. No phone location is captured or sent." &&
              state?.textContent.trim() === "Mock live location active" &&
              workflowLiveLocation === "Active"
              ? {
                  distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                  fetchCount: (window.__driverDemoFetchCalls || []).length,
                  messageText: message.textContent.trim(),
                  stateText: state.textContent.trim(),
                }
              : false;
          })()`),
        10000,
        `${viewport.label} mock live location activation`,
      );
      assert.equal(liveLocationState.fetchCount, liveLocationFetchCount);
      assert.equal(
        liveLocationState.distance <= 16,
        true,
        `${viewport.label}: expected mock live location feedback close to button`,
      );

      const parseDriverDetailsSample = async (sample, description) => {
        const pastedDriverDetails = await evaluate(`(() => {
          const textarea = document.querySelector("[data-driver-demo-paste-details]");
          if (!textarea) return false;
          const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
          setter?.call(textarea, ${JSON.stringify(sample)});
          textarea.dispatchEvent(new Event("input", { bubbles: true }));
          return true;
        })()`);
        assert.equal(pastedDriverDetails, true, `${viewport.label}: expected paste textarea to accept ${description}`);

        await clickDriverDemoButton("[data-driver-demo-parse-details]", `${viewport.label} Parse Driver Details`);
        return waitForCondition(
          () =>
            evaluate(`(() => {
              const parseButton = document.querySelector("[data-driver-demo-parse-details]");
              const parseMessage = document.querySelector("[data-driver-demo-parse-message]");
              const paymentHelper = document.querySelector("[data-driver-demo-payment-helper]");
              const buttonRect = parseButton?.getBoundingClientRect();
              const messageRect = parseMessage?.getBoundingClientRect();

              const state = {
                databaseCheckVisible: Boolean(document.querySelector("[data-driver-demo-database-check]")),
                overwritePromptVisible: Boolean(document.querySelector("[data-driver-demo-overwrite-prompt]")),
                helperText: paymentHelper?.textContent.trim() || "",
                messageDistance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                messageText: parseMessage?.textContent.trim() || "",
                mobile: document.querySelector("[data-driver-demo-mobile]")?.value || "",
                name: document.querySelector("[data-driver-demo-name]")?.value || "",
                payNowNumber: document.querySelector("[data-driver-demo-paynow]")?.value || "",
                plate: document.querySelector("[data-driver-demo-plate]")?.value || "",
                vehicleModel: document.querySelector("[data-driver-demo-vehicle-model]")?.value || "",
              };

              return state.messageText === "Driver details parsed. Please review before saving." &&
                state.databaseCheckVisible === false &&
                state.overwritePromptVisible === false &&
                state.helperText === "PayNow or bank details were detected. PayNow is local driver info only; no payment or bank action is created."
                ? state
                : false;
            })()`),
          10000,
          `${viewport.label} parsed ${description}`,
        );
      };

      const labelledDriverDetails = [
        "Name: Ah Seng",
        "Contact: 91234567",
        "Plate: S1234Z",
        "Vehicle model: Toyota Alphard",
        "PayNow: 81234567",
        "Bank: 123-456-789",
      ].join("\n");

      const labelledDetailsState = await parseDriverDetailsSample(labelledDriverDetails, "labelled driver details");
      assert.equal(labelledDetailsState.name, "Ah Seng");
      assert.equal(labelledDetailsState.mobile, "91234567");
      assert.equal(labelledDetailsState.payNowNumber, "81234567");
      assert.equal(labelledDetailsState.plate, "S1234Z");
      assert.equal(labelledDetailsState.vehicleModel, "Toyota Alphard");
      assert.equal(
        labelledDetailsState.messageDistance <= 16,
        true,
        `${viewport.label}: expected parse feedback close to Parse Driver Details`,
      );
      assert.notEqual(
        labelledDetailsState.mobile,
        "81234567",
        `${viewport.label}: expected PayNow number not to overwrite explicit contact number`,
      );
      assert.notEqual(
        labelledDetailsState.plate,
        "123-456-789",
        `${viewport.label}: expected bank details not to populate car plate`,
      );
      assert.notEqual(
        labelledDetailsState.vehicleModel,
        "123-456-789",
        `${viewport.label}: expected bank details not to populate vehicle model`,
      );

      await setDriverDemoViewportAndLoad(viewport);

      const freeformDriverDetails = [
        "Juraimi",
        "Alphard HS/ Black",
        "SNH4429M",
        "8189 5041",
        "8200 8671(Paynow)",
      ].join("\n");
      const freeformDetailsState = await parseDriverDetailsSample(
        freeformDriverDetails,
        "freeform Juraimi driver details",
      );
      assert.equal(freeformDetailsState.name, "Juraimi");
      assert.equal(freeformDetailsState.vehicleModel, "Alphard HS/ Black");
      assert.equal(freeformDetailsState.plate, "SNH4429M");
      assert.equal(freeformDetailsState.mobile.replace(/\D/g, ""), "81895041");
      assert.equal(freeformDetailsState.payNowNumber.replace(/\D/g, ""), "82008671");
      assert.notEqual(
        freeformDetailsState.mobile.replace(/\D/g, ""),
        "82008671",
        `${viewport.label}: expected PayNow number not to overwrite freeform mobile number`,
      );
      assert.equal(
        freeformDetailsState.messageDistance <= 16,
        true,
        `${viewport.label}: expected freeform parse feedback close to Parse Driver Details`,
      );

      await clickDriverDemoButton("[data-driver-demo-save-details]", `${viewport.label} Save`);
      const savedDetailsState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const button = document.querySelector("[data-driver-demo-save-details]");
            const message = document.querySelector("[data-driver-demo-details-message]");
            const buttonRect = button?.getBoundingClientRect();
            const messageRect = message?.getBoundingClientRect();

            const messageText = message?.textContent.trim() || "";

            return messageText === "Driver details saved locally for this mock driver page."
              ? {
                  distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                  messageText,
                }
              : false;
          })()`),
        10000,
        `${viewport.label} driver details saved message`,
      );
      assert.equal(
        savedDetailsState.messageText,
        "Driver details saved locally for this mock driver page.",
      );
      assert.equal(
        savedDetailsState.distance <= 16,
        true,
        `${viewport.label}: expected driver details saved message close to button`,
      );

      await clickDriverDemoButton(
        "[data-driver-demo-acknowledge]",
        `${viewport.label} Acknowledge Job after driver details reload`,
      );
      await waitForCondition(
        () =>
          evaluate(`document.querySelector("[data-driver-demo-acknowledged-state]")?.textContent.trim() === "Acknowledged"`),
        10000,
        `${viewport.label} acknowledgement after driver details reload`,
      );

      await clickDriverDemoButton(
        "[data-driver-demo-live-location]",
        `${viewport.label} Activate Mock Live Location before valid status flow`,
      );
      await waitForCondition(
        () =>
          evaluate(`document.querySelector("[data-driver-demo-live-location-state]")?.textContent.trim() === "Mock live location active"`),
        10000,
        `${viewport.label} active mock live location before status flow`,
      );

      const clickMockDriverReminder = async (expectedStatus) => {
        const beforeFetchCount = await evaluate(`(window.__driverDemoFetchCalls || []).length`);
        const beforeLogLabels = await evaluate(
          `[...document.querySelectorAll("[data-driver-demo-activity-log-label]")].map((item) => item.textContent.trim())`,
        );
        await clickDriverDemoButton(
          "[data-driver-demo-reminder]",
          `${viewport.label} Trigger Mock 1-Hour Reminder`,
        );
        const reminderState = await waitForCondition(
          () =>
            evaluate(`(() => {
              const button = document.querySelector("[data-driver-demo-reminder]");
              const message = document.querySelector("[data-driver-demo-reminder-message]");
              const section = document.querySelector("[data-driver-demo-reminder-section]");
              const dispatcherLog = document.querySelector("[data-driver-demo-dispatcher-notification-log]");
              const summary = document.querySelector("[data-driver-demo-reminder-summary]");
              const summaryStatus = document.querySelector("[data-driver-demo-reminder-summary-status]");
              const summaryState = document.querySelector("[data-driver-demo-reminder-summary-state]");
              const summaryLog = document.querySelector("[data-driver-demo-reminder-summary-log]");
              const summaryMockOnly = document.querySelector("[data-driver-demo-reminder-summary-mock-only]");
              const workflowReminder = document
                .querySelector("[data-driver-demo-workflow-summary-row='reminder-status'] [data-driver-demo-workflow-summary-value]")
                ?.textContent.trim();
              const workflowDispatcherLog = document
                .querySelector("[data-driver-demo-workflow-summary-row='dispatcher-log'] [data-driver-demo-workflow-summary-value]")
                ?.textContent.trim();
              const workflowMockOnly = document.querySelector("[data-driver-demo-workflow-summary-mock-only]");
              const buttonRect = button?.getBoundingClientRect();
              const messageRect = message?.getBoundingClientRect();
              const currentStatus = document.querySelector("[data-driver-demo-current-status]")?.textContent.trim() || "";

              return section?.innerText.includes("Mock Driver Reminder") &&
                summary?.innerText.includes("Mock dispatcher reminder summary") &&
                summaryStatus?.textContent.trim() === "Triggered locally" &&
                summaryState?.textContent.trim() === "Triggered" &&
                summaryLog?.textContent.includes("Mock dispatcher notification log: Driver reminder recorded locally.") &&
                summaryMockOnly?.textContent.trim() === "Mock only. No real message was sent." &&
                workflowReminder === "Triggered locally (Triggered)" &&
                workflowDispatcherLog?.includes("Mock dispatcher notification log: Driver reminder recorded locally.") &&
                workflowMockOnly?.textContent.trim() === "Mock only. No real message was sent." &&
                section?.innerText.includes("Mock/local only. No real notification, WhatsApp, or SMS is sent.") &&
                section?.innerText.includes("Mock reminder: 1 hour before pickup") &&
                section?.innerText.includes("Reminder tells the driver to activate mock live location and continue workflow.") &&
                message?.textContent.trim() === "Mock 1-hour reminder triggered locally. No real notification, WhatsApp, or SMS was sent." &&
                dispatcherLog?.textContent.includes("Mock dispatcher notification log") &&
                dispatcherLog?.textContent.includes("Mock only. No message was sent.") &&
                currentStatus === ${JSON.stringify(expectedStatus)}
                ? {
                    currentStatus,
                    distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                    fetchCount: (window.__driverDemoFetchCalls || []).length,
                    messageText: message.textContent.trim(),
                  }
                : false;
            })()`),
          10000,
          `${viewport.label} mock 1-hour reminder`,
        );

        assert.equal(reminderState.currentStatus, expectedStatus);
        assert.equal(reminderState.fetchCount, beforeFetchCount);
        assert.deepEqual(
          await evaluate(`[...document.querySelectorAll("[data-driver-demo-activity-log-label]")].map((item) => item.textContent.trim())`),
          [...beforeLogLabels, "Mock 1-hour reminder triggered"],
          `${viewport.label}: expected mock reminder to create a local log entry`,
        );
        assert.equal(
          reminderState.distance <= 16,
          true,
          `${viewport.label}: expected reminder feedback close to button`,
        );
      };

      const clickBlockedMockDriverReminder = async (expectedStatus) => {
        const beforeFetchCount = await evaluate(`(window.__driverDemoFetchCalls || []).length`);
        const beforeLogLabels = await evaluate(
          `[...document.querySelectorAll("[data-driver-demo-activity-log-label]")].map((item) => item.textContent.trim())`,
        );
        await clickDriverDemoButton(
          "[data-driver-demo-reminder]",
          `${viewport.label} blocked Trigger Mock 1-Hour Reminder`,
        );
        const reminderState = await waitForCondition(
          () =>
            evaluate(`(() => {
              const button = document.querySelector("[data-driver-demo-reminder]");
              const message = document.querySelector("[data-driver-demo-reminder-message]");
              const dispatcherLog = document.querySelector("[data-driver-demo-dispatcher-notification-log]");
              const summary = document.querySelector("[data-driver-demo-reminder-summary]");
              const summaryStatus = document.querySelector("[data-driver-demo-reminder-summary-status]");
              const summaryState = document.querySelector("[data-driver-demo-reminder-summary-state]");
              const summaryLog = document.querySelector("[data-driver-demo-reminder-summary-log]");
              const summaryMockOnly = document.querySelector("[data-driver-demo-reminder-summary-mock-only]");
              const workflowReminder = document
                .querySelector("[data-driver-demo-workflow-summary-row='reminder-status'] [data-driver-demo-workflow-summary-value]")
                ?.textContent.trim();
              const workflowDispatcherLog = document
                .querySelector("[data-driver-demo-workflow-summary-row='dispatcher-log'] [data-driver-demo-workflow-summary-value]")
                ?.textContent.trim();
              const workflowMockOnly = document.querySelector("[data-driver-demo-workflow-summary-mock-only]");
              const buttonRect = button?.getBoundingClientRect();
              const messageRect = message?.getBoundingClientRect();
              const currentStatus = document.querySelector("[data-driver-demo-current-status]")?.textContent.trim() || "";

              return message?.textContent.trim() === "Mock reminder is blocked after POB or Job Completed." &&
                summary?.innerText.includes("Mock dispatcher reminder summary") &&
                summaryStatus?.textContent.trim() === "Blocked locally" &&
                summaryState?.textContent.trim() === "Blocked" &&
                summaryLog?.textContent.includes("Mock dispatcher notification log: Reminder blocked locally after POB or Job Completed.") &&
                summaryMockOnly?.textContent.trim() === "Mock only. No real message was sent." &&
                workflowReminder === "Blocked locally (Blocked)" &&
                workflowDispatcherLog?.includes("Mock dispatcher notification log: Reminder blocked locally after POB or Job Completed.") &&
                workflowMockOnly?.textContent.trim() === "Mock only. No real message was sent." &&
                dispatcherLog?.textContent.includes("Mock dispatcher notification log") &&
                dispatcherLog?.textContent.includes("Mock only. No message was sent.") &&
                currentStatus === ${JSON.stringify(expectedStatus)}
                ? {
                    currentStatus,
                    distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                    fetchCount: (window.__driverDemoFetchCalls || []).length,
                    messageText: message.textContent.trim(),
                  }
                : false;
            })()`),
          10000,
          `${viewport.label} blocked mock 1-hour reminder`,
        );

        assert.equal(reminderState.currentStatus, expectedStatus);
        assert.equal(reminderState.fetchCount, beforeFetchCount);
        assert.deepEqual(
          await evaluate(`[...document.querySelectorAll("[data-driver-demo-activity-log-label]")].map((item) => item.textContent.trim())`),
          [...beforeLogLabels, "Mock reminder blocked"],
          `${viewport.label}: expected blocked mock reminder to create a local log entry`,
        );
        assert.equal(
          reminderState.distance <= 16,
          true,
          `${viewport.label}: expected blocked reminder feedback close to button`,
        );
      };

      const clickBlockedStatus = async (label, expectedMessage, expectedStatus) => {
        const beforeLogLabels = await evaluate(
          `[...document.querySelectorAll("[data-driver-demo-activity-log-label]")].map((item) => item.textContent.trim())`,
        );
        await clickDriverDemoButton(
          `[data-driver-demo-status="${label}"]`,
          `${viewport.label} blocked ${label}`,
        );
        const blockedStatusState = await waitForCondition(
          () =>
            evaluate(`(() => {
              const statusLabel = ${JSON.stringify(label)};
              const expectedMessage = ${JSON.stringify(expectedMessage)};
              const expectedStatus = ${JSON.stringify(expectedStatus)};
              const button = document.querySelector(\`[data-driver-demo-status="\${statusLabel}"]\`);
              const message = document.querySelector(\`[data-driver-demo-status-message="\${statusLabel}"]\`);
              const buttonRect = button?.getBoundingClientRect();
              const messageRect = message?.getBoundingClientRect();
              const currentStatus = document.querySelector("[data-driver-demo-current-status]")?.textContent.trim() || "";

              return message?.textContent.trim() === expectedMessage && currentStatus === expectedStatus
                ? {
                    currentStatus,
                    distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                    messageCount: document.querySelectorAll("[data-driver-demo-status-message]").length,
                    messageText: message.textContent.trim(),
                  }
                : false;
            })()`),
          10000,
          `${viewport.label} blocked ${label} status message`,
        );

        assert.equal(blockedStatusState.currentStatus, expectedStatus);
        assert.deepEqual(
          await evaluate(`[...document.querySelectorAll("[data-driver-demo-activity-log-label]")].map((item) => item.textContent.trim())`),
          beforeLogLabels,
          `${viewport.label}: expected blocked ${label} not to create a log entry`,
        );
        assert.equal(blockedStatusState.messageText, expectedMessage);
        assert.equal(blockedStatusState.messageCount, 1);
        assert.equal(
          blockedStatusState.distance <= 16,
          true,
          `${viewport.label}: expected blocked ${label} status message close to button`,
        );
      };

      const clickMissingEtaOtw = async () => {
        const beforeFetchCount = await evaluate(`(window.__driverDemoFetchCalls || []).length`);
        const beforeLogLabels = await evaluate(
          `[...document.querySelectorAll("[data-driver-demo-activity-log-label]")].map((item) => item.textContent.trim())`,
        );
        await clickDriverDemoButton("[data-driver-demo-status=\"OTW\"]", `${viewport.label} missing-ETA OTW`);
        const blockedEtaState = await waitForCondition(
          () =>
            evaluate(`(() => {
              const button = document.querySelector("[data-driver-demo-status='OTW']");
              const message = document.querySelector("[data-driver-demo-status-message='OTW']");
              const buttonRect = button?.getBoundingClientRect();
              const messageRect = message?.getBoundingClientRect();
              const activityLogText = document.querySelector("[data-driver-demo-activity-log]")?.innerText || "";
              const workflowOtw = document
                .querySelector("[data-driver-demo-workflow-summary-row='otw'] [data-driver-demo-workflow-summary-value]")
                ?.textContent.trim();
              const workflowLatestEta = document
                .querySelector("[data-driver-demo-workflow-summary-row='latest-eta'] [data-driver-demo-workflow-summary-value]")
                ?.textContent.trim();

              return message?.textContent.trim() === "Acknowledge latest mock flight ETA before OTW." &&
                document.querySelector("[data-driver-demo-current-status]")?.textContent.trim() === "Assigned" &&
                workflowOtw === "Pending" &&
                workflowLatestEta === "Pending acknowledgement" &&
                activityLogText.includes("OTW blocked") &&
                activityLogText.includes("OTW was blocked because latest ETA acknowledgement is missing.")
                ? {
                    currentStatus: "Assigned",
                    distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                    fetchCount: (window.__driverDemoFetchCalls || []).length,
                    messageText: message.textContent.trim(),
                  }
                : false;
            })()`),
          10000,
          `${viewport.label} missing-ETA OTW block`,
        );

        assert.equal(blockedEtaState.currentStatus, "Assigned");
        assert.equal(blockedEtaState.fetchCount, beforeFetchCount);
        assert.deepEqual(
          await evaluate(`[...document.querySelectorAll("[data-driver-demo-activity-log-label]")].map((item) => item.textContent.trim())`),
          [...beforeLogLabels, "OTW blocked"],
          `${viewport.label}: expected missing-ETA OTW to create a blocked log entry`,
        );
        assert.equal(
          blockedEtaState.distance <= 16,
          true,
          `${viewport.label}: expected missing-ETA OTW feedback close to button`,
        );
      };

      const clickAcknowledgeLatestEta = async () => {
        const beforeFetchCount = await evaluate(`(window.__driverDemoFetchCalls || []).length`);
        await waitForCondition(
          () =>
            evaluate(`Boolean(document.querySelector("[data-driver-demo-latest-eta-section]")) &&
              document.querySelector("[data-driver-demo-latest-eta-section]")?.innerText.includes("Latest mock flight ETA: 15:45") &&
              document.querySelector("[data-driver-demo-latest-eta-section]")?.innerText.includes("Mock/local only. No real flight API is called and no notification is sent.")`),
          10000,
          `${viewport.label} mock latest flight ETA section`,
        );
        await clickDriverDemoButton(
          "[data-driver-demo-latest-eta]",
          `${viewport.label} Acknowledge Latest ETA`,
        );
        const etaState = await waitForCondition(
          () =>
            evaluate(`(() => {
              const button = document.querySelector("[data-driver-demo-latest-eta]");
              const message = document.querySelector("[data-driver-demo-latest-eta-message]");
              const state = document.querySelector("[data-driver-demo-latest-eta-state]");
              const workflowLatestEta = document
                .querySelector("[data-driver-demo-workflow-summary-row='latest-eta'] [data-driver-demo-workflow-summary-value]")
                ?.textContent.trim();
              const buttonRect = button?.getBoundingClientRect();
              const messageRect = message?.getBoundingClientRect();

              return message?.textContent.trim() === "Latest mock flight ETA acknowledged locally. No real flight API or notification was used." &&
                state?.textContent.trim() === "Latest mock flight ETA acknowledged" &&
                workflowLatestEta === "Acknowledged"
                ? {
                    distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                    fetchCount: (window.__driverDemoFetchCalls || []).length,
                    messageText: message.textContent.trim(),
                  }
                : false;
            })()`),
          10000,
          `${viewport.label} mock latest flight ETA acknowledged`,
        );

        assert.equal(etaState.fetchCount, beforeFetchCount);
        assert.deepEqual(
          await evaluate(`[...document.querySelectorAll("[data-driver-demo-activity-log-label]")].map((item) => item.textContent.trim())`),
          [
            "Mock driver details saved",
            "Job acknowledged",
            "Mock live location activated",
            "Mock 1-hour reminder triggered",
            "OTW blocked",
            "Latest ETA acknowledged",
          ],
          `${viewport.label}: expected latest ETA acknowledgement to create a local log entry`,
        );
        assert.equal(
          etaState.distance <= 16,
          true,
          `${viewport.label}: expected latest ETA feedback close to button`,
        );
      };

      const clickValidStatus = async (label, expectedMessage) => {
        await clickDriverDemoButton(
          `[data-driver-demo-status="${label}"]`,
          `${viewport.label} ${label}`,
        );
        const statusState = await waitForCondition(
          () =>
            evaluate(`(() => {
              const statusLabel = ${JSON.stringify(label)};
              const expectedMessage = ${JSON.stringify(expectedMessage)};
              const button = document.querySelector(\`[data-driver-demo-status="\${statusLabel}"]\`);
              const message = document.querySelector(\`[data-driver-demo-status-message="\${statusLabel}"]\`);
              const workflowKey = ${JSON.stringify({
                "Job Completed": "completed",
                OTS: "ots",
                OTW: "otw",
                POB: "pob",
              }[label])};
              const workflowValue = workflowKey
                ? document
                    .querySelector(\`[data-driver-demo-workflow-summary-row="\${workflowKey}"] [data-driver-demo-workflow-summary-value]\`)
                    ?.textContent.trim()
                : "";
              const buttonRect = button?.getBoundingClientRect();
              const messageRect = message?.getBoundingClientRect();

              return message?.textContent.trim() === expectedMessage &&
                (!workflowKey || workflowValue === "Done")
                ? {
                    currentStatus: document.querySelector("[data-driver-demo-current-status]")?.textContent.trim() || "",
                    distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                    messageCount: document.querySelectorAll("[data-driver-demo-status-message]").length,
                    messageText: message.textContent.trim(),
                  }
                : false;
            })()`),
          10000,
          `${viewport.label} ${label} status message`,
        );

        assert.equal(statusState.currentStatus, label);
        assert.equal(statusState.messageText, expectedMessage);
        assert.equal(statusState.messageCount, 1);
        assert.equal(
          statusState.distance <= 16,
          true,
          `${viewport.label}: expected ${label} status message close to button`,
        );
      };

      const clickMissingProofPob = async () => {
        const beforeFetchCount = await evaluate(`(window.__driverDemoFetchCalls || []).length`);
        const beforeLogLabels = await evaluate(
          `[...document.querySelectorAll("[data-driver-demo-activity-log-label]")].map((item) => item.textContent.trim())`,
        );
        await clickDriverDemoButton("[data-driver-demo-status=\"POB\"]", `${viewport.label} missing-proof POB`);
        const blockedProofState = await waitForCondition(
          () =>
            evaluate(`(() => {
              const button = document.querySelector("[data-driver-demo-status='POB']");
              const message = document.querySelector("[data-driver-demo-status-message='POB']");
              const buttonRect = button?.getBoundingClientRect();
              const messageRect = message?.getBoundingClientRect();
              const activityLogText = document.querySelector("[data-driver-demo-activity-log]")?.innerText || "";
              const workflowPob = document
                .querySelector("[data-driver-demo-workflow-summary-row='pob'] [data-driver-demo-workflow-summary-value]")
                ?.textContent.trim();
              const workflowProof = document
                .querySelector("[data-driver-demo-workflow-summary-row='ots-photo-proof'] [data-driver-demo-workflow-summary-value]")
                ?.textContent.trim();

              return message?.textContent.trim() === "Add mock OTS photo proof before POB." &&
                document.querySelector("[data-driver-demo-current-status]")?.textContent.trim() === "OTS" &&
                workflowPob === "Pending" &&
                workflowProof === "Pending proof" &&
                activityLogText.includes("POB blocked") &&
                activityLogText.includes("POB was blocked because OTS photo proof is missing.")
                ? {
                    currentStatus: "OTS",
                    distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                    fetchCount: (window.__driverDemoFetchCalls || []).length,
                    messageText: message.textContent.trim(),
                  }
                : false;
            })()`),
          10000,
          `${viewport.label} missing-proof POB block`,
        );

        assert.equal(blockedProofState.currentStatus, "OTS");
        assert.equal(blockedProofState.fetchCount, beforeFetchCount);
        assert.deepEqual(
          await evaluate(`[...document.querySelectorAll("[data-driver-demo-activity-log-label]")].map((item) => item.textContent.trim())`),
          [...beforeLogLabels, "POB blocked"],
          `${viewport.label}: expected missing-proof POB to create a blocked log entry`,
        );
        assert.equal(
          blockedProofState.distance <= 16,
          true,
          `${viewport.label}: expected missing-proof POB feedback close to button`,
        );
      };

      const clickAddMockOtsPhotoProof = async () => {
        const beforeFetchCount = await evaluate(`(window.__driverDemoFetchCalls || []).length`);
        await waitForCondition(
          () =>
            evaluate(`Boolean(document.querySelector("[data-driver-demo-ots-photo-proof-section]")) &&
              document.querySelector("[data-driver-demo-ots-photo-proof-section]")?.innerText.includes("Mock/local only. No real file upload, camera, or storage is used.")`),
          10000,
          `${viewport.label} mock OTS photo proof section`,
        );
        await clickDriverDemoButton(
          "[data-driver-demo-ots-photo-proof]",
          `${viewport.label} Add Mock OTS Photo Proof`,
        );
        const proofState = await waitForCondition(
          () =>
            evaluate(`(() => {
              const button = document.querySelector("[data-driver-demo-ots-photo-proof]");
              const message = document.querySelector("[data-driver-demo-ots-photo-proof-message]");
              const state = document.querySelector("[data-driver-demo-ots-photo-proof-state]");
              const workflowProof = document
                .querySelector("[data-driver-demo-workflow-summary-row='ots-photo-proof'] [data-driver-demo-workflow-summary-value]")
                ?.textContent.trim();
              const buttonRect = button?.getBoundingClientRect();
              const messageRect = message?.getBoundingClientRect();

              return message?.textContent.trim() === "Mock OTS photo proof added locally. No real file upload, camera, or storage was used." &&
                state?.textContent.trim() === "Mock OTS photo proof added" &&
                workflowProof === "Added"
                ? {
                    distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                    fetchCount: (window.__driverDemoFetchCalls || []).length,
                    messageText: message.textContent.trim(),
                  }
                : false;
            })()`),
          10000,
          `${viewport.label} mock OTS photo proof added`,
        );

        assert.equal(proofState.fetchCount, beforeFetchCount);
        assert.equal(
          proofState.distance <= 16,
          true,
          `${viewport.label}: expected proof feedback close to proof button`,
        );
      };

      const clickBlockedLiveLocationAfterEnd = async (description) => {
        const beforeFetchCount = await evaluate(`(window.__driverDemoFetchCalls || []).length`);
        const beforeLogLabels = await evaluate(
          `[...document.querySelectorAll("[data-driver-demo-activity-log-label]")].map((item) => item.textContent.trim())`,
        );
        await clickDriverDemoButton("[data-driver-demo-live-location]", description);
        const blockedLiveLocationState = await waitForCondition(
          () =>
            evaluate(`(() => {
              const button = document.querySelector("[data-driver-demo-live-location]");
              const message = document.querySelector("[data-driver-demo-live-location-message]");
              const state = document.querySelector("[data-driver-demo-live-location-state]");
              const buttonRect = button?.getBoundingClientRect();
              const messageRect = message?.getBoundingClientRect();

              return message?.textContent.trim() === "Mock live location has ended for this job." &&
                state?.textContent.trim() === "Mock live location inactive"
                ? {
                    distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                    fetchCount: (window.__driverDemoFetchCalls || []).length,
                    messageText: message.textContent.trim(),
                    stateText: state.textContent.trim(),
                  }
                : false;
            })()`),
          10000,
          `${viewport.label} mock live location remains ended`,
        );

        assert.equal(blockedLiveLocationState.fetchCount, beforeFetchCount);
        assert.deepEqual(
          await evaluate(`[...document.querySelectorAll("[data-driver-demo-activity-log-label]")].map((item) => item.textContent.trim())`),
          beforeLogLabels,
          `${viewport.label}: expected blocked ended mock live location not to create a log entry`,
        );
        assert.equal(
          blockedLiveLocationState.distance <= 16,
          true,
          `${viewport.label}: expected ended mock live location feedback close to button`,
        );
      };

      await clickMockDriverReminder("Assigned");
      await clickBlockedStatus("OTS", "Update OTW before OTS.", "Assigned");
      await clickBlockedStatus("POB", "Update OTW before POB.", "Assigned");
      await clickBlockedStatus("Job Completed", "Update OTW before Job Completed.", "Assigned");
      await clickMissingEtaOtw();
      await clickAcknowledgeLatestEta();
      await clickValidStatus("OTW", "Status updated: OTW");
      await clickBlockedStatus("POB", "Update OTS before POB.", "OTW");
      await clickValidStatus("OTS", "Status updated: OTS");
      await clickBlockedStatus("Job Completed", "Update POB before Job Completed.", "OTS");
      await clickMissingProofPob();
      await clickAddMockOtsPhotoProof();
      await clickValidStatus("POB", "Status updated: POB. Mock live location ended locally.");
      await waitForCondition(
        () =>
          evaluate(`document.querySelector("[data-driver-demo-live-location-state]")?.textContent.trim() === "Mock live location inactive" &&
            document.querySelector("[data-driver-demo-workflow-summary-row='pob'] [data-driver-demo-workflow-summary-value]")?.textContent.trim() === "Done" &&
            document.querySelector("[data-driver-demo-workflow-summary-row='live-location'] [data-driver-demo-workflow-summary-value]")?.textContent.trim() === "Inactive"`),
        10000,
        `${viewport.label} mock live location ended at POB`,
      );
      await clickBlockedMockDriverReminder("POB");
      await clickBlockedLiveLocationAfterEnd(
        `${viewport.label} blocked mock live location after POB`,
      );
      await clickValidStatus("Job Completed", "Status updated: Completed");
      await waitForCondition(
        () =>
          evaluate(`document.querySelector("[data-driver-demo-live-location-state]")?.textContent.trim() === "Mock live location inactive" &&
            document.querySelector("[data-driver-demo-workflow-summary-row='completed'] [data-driver-demo-workflow-summary-value]")?.textContent.trim() === "Done"`),
        10000,
        `${viewport.label} mock live location remains ended after Job Completed`,
      );
      await clickBlockedLiveLocationAfterEnd(
        `${viewport.label} blocked mock live location after Job Completed`,
      );
      assert.deepEqual(
        await evaluate(`[...document.querySelectorAll("[data-driver-demo-activity-log-label]")].map((item) => item.textContent.trim())`),
        [
          "Mock driver details saved",
          "Job acknowledged",
          "Mock live location activated",
          "Mock 1-hour reminder triggered",
          "OTW blocked",
          "Latest ETA acknowledged",
          "OTW marked",
          "OTS marked",
          "OTS photo proof requested",
          "POB blocked",
          "Mock OTS photo proof added",
          "POB marked",
          "Mock live location auto-ended at POB",
          "Mock reminder blocked",
          "Job Completed marked",
        ],
        `${viewport.label}: expected driver demo activity log to preserve successful event order`,
      );

      const networkState = await evaluate(`(() => {
        const resourceCalls = performance.getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((name) =>
            name.includes("/rest/v1/") ||
            name.includes("/api/") ||
            name.toLowerCase().includes("supabase"),
          );

        return {
          fetchCalls: window.__driverDemoFetchCalls || [],
          resourceCalls,
        };
      })()`);

      assert.deepEqual(
        networkState.fetchCalls.filter((call) => call.includes("/rest/v1/drivers")),
        [],
        `${viewport.label}: expected no public browser Driver Database fetches on driver demo route`,
      );
      assert.deepEqual(
        networkState.resourceCalls,
        [],
        `${viewport.label}: expected no Supabase/API resources on driver demo route`,
      );
      await checkTelegramBoundary(`${viewport.label} driver demo page`);

      return {
        buttons: initialState.buttonLabels,
        docClientWidth: initialState.docClientWidth,
        docScrollWidth: initialState.docScrollWidth,
        dispatcherExceptionButtons: initialState.dispatcherExceptionButtons,
        inputs: initialState.inputs.map((input) => ({
          label: input.label.split("\\n")[0],
          type: input.type,
        })),
        textareas: initialState.textareas.map((textarea) => textarea.label.split("\\n")[0]),
        viewport: viewport.label,
      };
    };

    await evaluate(`window.__prestigeErrors = [];
      window.__prestigeConsoleErrors = [];
      window.addEventListener("error", (event) => window.__prestigeErrors.push(event.message));
      window.addEventListener("unhandledrejection", (event) => window.__prestigeErrors.push(String(event.reason)));
      const originalError = console.error;
      console.error = (...args) => {
        window.__prestigeConsoleErrors.push(args.map(String).join(" "));
        originalError.apply(console, args);
      };`);

    await waitForTabs();

    const visibleSnapshots = [];
    const buttonLabels = [];
    for (const label of tabLabels) {
      await clickTab(label);
      visibleSnapshots.push(await evaluate("document.body?.innerText || ''"));
      buttonLabels.push(
        ...(await evaluate(`[...document.querySelectorAll("button")].map((button) => button.textContent.trim())`)),
      );
      await checkTelegramBoundary(`${label} admin tab initial sweep`, {
        allowMockPreviewUi: label === "Dispatch",
      });
    }

    const state = {
      buttonLabels: [...new Set(buttonLabels)],
      consoleErrors: await evaluate("window.__prestigeConsoleErrors || []"),
      errors: await evaluate("window.__prestigeErrors || []"),
      visibleText: visibleSnapshots.join("\n\n"),
    };
    state.adminTelegramAlertPreview = await checkAdminTelegramAlertPreview();
    state.adminReplacement = await checkAdminReplacementPlaceholder();
    state.responsiveTabs = [];
    for (const viewport of responsiveTabViewports) {
      const responsiveStates = await checkResponsiveTabs(viewport);
      state.responsiveTabs.push(...responsiveStates);
    }
    state.customerPayments = await checkCustomerPaymentsRoute();
    state.customerBooking = await checkCustomerBookingRoute();
    state.customerPortal = await checkCustomerPortalRoute();
    state.driverJobLink = [];
    for (const viewport of driverJobViewports) {
      state.driverJobLink.push(await checkDriverJobRoute(viewport));
    }
    state.driverJobDemo = [];
    for (const viewport of driverDemoViewports) {
      state.driverJobDemo.push(await checkDriverDemoRoute(viewport));
    }
    await checkTelegramBoundary("final browser state");
    state.telegramBoundaries = telegramBoundarySnapshots;
    state.errors = [...browserErrors, ...(state.errors || [])];
    state.consoleErrors = [...browserConsoleErrors, ...(state.consoleErrors || [])];

    assertAppSmokeState(state);
    console.log(JSON.stringify(state, null, 2));
  } catch (error) {
    let pageSnapshot = "";

    if (client) {
      try {
        const snapshot = await client.send("Runtime.evaluate", {
          expression: `({
            href: location.href,
            readyState: document.readyState,
            buttonLabels: [...document.querySelectorAll("button")].map((button) => button.textContent.trim()),
            bodyText: document.body?.innerText?.slice(0, 1000) || "",
          })`,
          returnByValue: true,
        });
        pageSnapshot = `\n${JSON.stringify(snapshot.result?.value ?? {}, null, 2)}`;
      } catch {
        pageSnapshot = "";
      }
    }

    const message = stderr
      ? `${normalizeErrorMessage(error)}${pageSnapshot}\n${stderr}`
      : `${normalizeErrorMessage(error)}${pageSnapshot}`;
    throw new Error(message.trim());
  } finally {
    if (client) {
      await client.close();
    }

    chrome.kill("SIGTERM");
    await waitForChildExit(chrome);
    await rm(userDataDir, { force: true, recursive: true }).catch(() => {});
  }
}

async function runBrowserTest() {
  if (browserName === "chrome") {
    await runChromeTest();
    return;
  }

  throw new Error(`Unsupported browser "${browserName}". Use "chrome".`);
}

await runBrowserTest();
