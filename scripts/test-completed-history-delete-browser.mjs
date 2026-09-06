import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const appUrl = process.env.APP_URL || "http://127.0.0.1:3001";
const chromeBinary =
  process.env.CHROME_BINARY || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromeDebugPort = Number(process.env.CHROME_DEBUG_PORT || 9228);
const screenshotPath =
  process.env.SCREENSHOT_PATH || "/private/tmp/prestige-completed-history-delete-visible.png";

const fixture = {
  id: "visible-earlier-draft-delete-fixture",
  booking_reference: "VISIBLE-DELETE-DRAFT-001",
  public_booking_reference: "10901",
  booking_type: "TRF",
  vehicle: "AVF",
  pickup_at: "2026-08-05T05:10:00.000Z",
  pickup_datetime: "2026-08-05T05:10:00.000Z",
  pickup_time: "1310",
  pickup_address: "HarbourFront Ferry Terminal",
  dropoff_address: "Singapore Changi Airport T3",
  route: "HarbourFront Ferry Terminal > Singapore Changi Airport T3",
  pax: 2,
  job_card:
    "AVF TRF\n05 Aug 2026, 1310hrs\nHarbourFront Ferry Terminal > Singapore Changi Airport T3\nPassenger: VISIBLE EARLIER DRAFT TRAVELLER\nPax: 2",
  status: "draft",
  admin_internal_status: "draft",
  customer_facing_status: "pending",
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
  companies: {
    company_name: "VISIBLE EARLIER DRAFT COMPANY",
  },
  bookers: {
    booker_name: "VISIBLE TEST BOOKER",
  },
  travelers: {
    traveler_name: "VISIBLE EARLIER DRAFT TRAVELLER",
  },
};

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForCondition(check, description, timeoutMs = 15000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const value = await check();

    if (value) {
      return value;
    }

    await sleep(100);
  }

  throw new Error(`Timed out waiting for ${description}`);
}

function createChromeClient(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  const listeners = new Map();
  let nextId = 0;

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));

    if (typeof message.id === "number") {
      const request = pending.get(message.id);

      if (!request) {
        return;
      }

      pending.delete(message.id);
      if (message.error) {
        request.reject(new Error(message.error.message));
      } else {
        request.resolve(message.result);
      }
      return;
    }

    for (const listener of listeners.get(message.method) || []) {
      listener(message.params || {});
    }
  });

  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { reject, resolve });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  function on(method, listener) {
    listeners.set(method, [...(listeners.get(method) || []), listener]);
  }

  function once(method, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeoutMs);
      const listener = (params) => {
        clearTimeout(timeout);
        listeners.set(
          method,
          (listeners.get(method) || []).filter((candidate) => candidate !== listener),
        );
        resolve(params);
      };
      on(method, listener);
    });
  }

  async function close() {
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close();
      await sleep(100);
    }
  }

  return { close, on, once, ready, send };
}

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json();
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    awaitPromise: true,
    expression,
    returnByValue: true,
  });

  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text ||
        "Browser evaluation failed",
    );
  }

  return result.result?.value;
}

const userDataDir = await mkdtemp(path.join(os.tmpdir(), "prestige-visible-delete-"));
const chrome = spawn(
  chromeBinary,
  [
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-features=WebContentsForceDark",
    "--no-first-run",
    "--no-default-browser-check",
    "--no-service-autorun",
    "--window-position=80,80",
    "--window-size=1440,1000",
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${chromeDebugPort}`,
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);

let client;

try {
  await waitForCondition(async () => {
    try {
      await fetchJson(`http://127.0.0.1:${chromeDebugPort}/json/version`);
      return true;
    } catch {
      return false;
    }
  }, "visible Chrome debug port");

  const target = await waitForCondition(async () => {
    const targets = await fetchJson(`http://127.0.0.1:${chromeDebugPort}/json/list`);
    return targets.find((candidate) => candidate.type === "page" && candidate.webSocketDebuggerUrl);
  }, "visible Chrome page target");

  client = createChromeClient(target.webSocketDebuggerUrl);
  await client.ready;
  await client.send("Runtime.enable");
  await client.send("Page.enable");

  client.on("Fetch.requestPaused", ({ request, requestId }) => {
    const method = String(request?.method || "GET").toUpperCase();
    client.send("Fetch.fulfillRequest", {
      body: Buffer.from(JSON.stringify(method === "GET" ? [] : {
        error: "Blocked Supabase mutation during visible delete verification.",
      })).toString("base64"),
      requestId,
      responseCode: method === "GET" ? 200 : 500,
      responseHeaders: [{ name: "content-type", value: "application/json" }],
    }).catch(() => {});
  });
  await client.send("Fetch.enable", {
    patterns: [{ requestStage: "Request", urlPattern: "*://*/rest/v1/*" }],
  });

  const loadEvent = client.once("Page.loadEventFired");
  await client.send("Page.navigate", { url: appUrl });
  await loadEvent;

  await waitForCondition(
    () => evaluate(client, "document.readyState === 'complete' && Boolean(document.querySelector('[role=tab]'))"),
    "local admin app",
  );

  await evaluate(client, `(() => {
    const fixture = ${JSON.stringify(fixture)};
    const originalFetch = window.fetch.bind(window);
    window.__visibleDeleteRequests = [];
    window.__visibleConfirmMessages = [];
    window.__visibleSavedBookingReads = [];
    window.fetch = async (input, init = {}) => {
      const target = typeof input === "string" ? input : input?.url || String(input);
      const method = String(init.method || input?.method || "GET").toUpperCase();

      if (method === "GET" && target.includes("/api/admin-saved-bookings")) {
        window.__visibleSavedBookingReads.push(target);
        return new Response(JSON.stringify({
          bookings: [fixture],
          ok: true,
          version: "visible-completed-history-list-mock",
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (method === "DELETE" && target.includes("/api/admin-saved-bookings")) {
        window.__visibleDeleteRequests.push({ method, target });
        return new Response(JSON.stringify({ error: "Visible verification must not delete." }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }

      return originalFetch(input, init);
    };
    window.confirm = (message) => {
      window.__visibleConfirmMessages.push(String(message));
      return false;
    };
    return true;
  })()`);

  await waitForCondition(
    () => evaluate(client, `(() => {
      const button = [...document.querySelectorAll("button")].find(
        (candidate) => candidate.textContent.trim() === "Refresh Dashboard",
      );
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })()`),
    "enabled Refresh Dashboard",
  );

  await waitForCondition(
    () => evaluate(client, `(() => {
      const tab = [...document.querySelectorAll('[role="tab"]')].find(
        (candidate) => candidate.textContent.trim() === "Bookings",
      );
      if (!tab) return false;
      tab.click();
      return true;
    })()`),
    "Bookings tab",
  );

  await waitForCondition(
    () => evaluate(client, "(window.__visibleSavedBookingReads || []).length > 0"),
    "mocked saved-booking read",
  );

  await waitForCondition(
    () => evaluate(client, `(() => {
      const tab = [...document.querySelectorAll('[role="tab"]')].find(
        (candidate) => candidate.textContent.trim() === "Completed",
      );
      if (!tab) return false;
      tab.click();
      return true;
    })()`),
    "Completed tab",
  );

  let visibleState;

  try {
    visibleState = await waitForCondition(
      () => evaluate(client, `(() => {
        const article = [...document.querySelectorAll("article")].find(
          (candidate) => candidate.innerText.includes("VISIBLE EARLIER DRAFT TRAVELLER"),
        );
        const deleteButton = article?.querySelector("[data-completed-delete-booking]");
        if (!article || !deleteButton || !article.innerText.includes("Earlier")) return false;
        return {
          articleText: article.innerText,
          bodyBackground: getComputedStyle(document.body).backgroundColor,
          deleteKey: deleteButton.getAttribute("data-completed-delete-booking"),
          deleteLabel: deleteButton.textContent.trim(),
        };
      })()`),
      "Earlier draft row with Delete",
    );
  } catch (error) {
    const diagnostic = await evaluate(client, `({
      articles: [...document.querySelectorAll("article")].map((article) => article.innerText),
      bodyText: document.body.innerText.slice(0, 10000),
      reads: window.__visibleSavedBookingReads || [],
    })`);
    console.error(JSON.stringify(diagnostic, null, 2));
    throw error;
  }

  assert.equal(visibleState.deleteLabel, "Delete");
  assert.match(visibleState.articleText, /draft/i);
  assert.match(visibleState.articleText, /Earlier/);

  const clicked = await evaluate(client, `(() => {
    const article = [...document.querySelectorAll("article")].find(
      (candidate) => candidate.innerText.includes("VISIBLE EARLIER DRAFT TRAVELLER"),
    );
    const button = article?.querySelector("[data-completed-delete-booking]");
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`);
  assert.equal(clicked, true);

  const cancelledState = await waitForCondition(
    () => evaluate(client, `(() => {
      const message = document.querySelector(
        "[data-booking-completion-message]",
      )?.textContent.trim();
      return message === "Delete cancelled."
        ? {
            confirmMessages: window.__visibleConfirmMessages || [],
            deleteRequests: window.__visibleDeleteRequests || [],
            message,
          }
        : false;
    })()`),
    "cancelled permanent-delete confirmation",
  );

  assert.deepEqual(cancelledState.confirmMessages, [
    "Permanently delete this job and its linked operational records from the app and Supabase? This cannot be undone.",
  ]);
  assert.deepEqual(cancelledState.deleteRequests, []);

  const screenshot = await client.send("Page.captureScreenshot", { format: "png" });
  await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
  await sleep(1500);

  console.log(`Visible Completed / Earlier delete browser guard passed. Screenshot: ${screenshotPath}`);
} finally {
  await client?.close().catch(() => {});
  chrome.kill("SIGTERM");
  await sleep(250);
  await rm(userDataDir, { force: true, recursive: true });
}
