import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import {
  createBrowserTestReporter,
  createChromeClient,
  navigateWithLoadEvent,
  normalizeErrorMessage,
  normalizeConsoleMessages,
  terminateChildProcess,
  waitForChildExit,
  waitForChromeDebugPort,
  waitForChromePageTarget,
  waitForCondition,
} from "./browser-test-helpers.mjs";

const configuredAppUrl = process.env.APP_URL?.trim() || "";
const chromeBinary =
  process.env.CHROME_BINARY || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const configuredChromeDebugPort = process.env.CHROME_DEBUG_PORT
  ? Number(process.env.CHROME_DEBUG_PORT)
  : null;
const dismissedStorageKey = "prestige-admin-dismissed-pending-driver-ack-links";
const firstLinkId = "11111111-2222-4333-8444-555555555555";
const secondLinkId = "22222222-3333-4444-8555-666666666666";
const amendedLinkId = "66666666-7777-4888-8999-000000000000";

const firstPickup = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const secondPickup = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

const bookings = [
  {
    id: "ack-close-booking-one",
    booking_reference: "ACK-CLOSE-BOOKING-ONE",
    public_booking_reference: "12001",
    pickup_at: firstPickup,
    pickup_datetime: firstPickup,
    pickup_address: "Changi Airport Terminal 3",
    dropoff_address: "Raffles Hotel Singapore",
    route: "Changi Airport Terminal 3 > Raffles Hotel Singapore",
    job_card:
      "AVF MNG\nPending ACK Queue fixture one\nChangi Airport Terminal 3 > Raffles Hotel Singapore\nPassenger: ACK QUEUE ONE",
    passenger_name: "ACK QUEUE ONE",
    status: "assigned",
    driver_id: "ack-driver-one",
    driver_name: "ACK DRIVER ONE",
    driver_contact: "+65 8000 0001",
    driver_plate_number: "SLA1001A",
  },
  {
    id: "ack-close-booking-two",
    booking_reference: "ACK-CLOSE-BOOKING-TWO",
    public_booking_reference: "12002",
    pickup_at: secondPickup,
    pickup_datetime: secondPickup,
    pickup_address: "Marina Bay Sands",
    dropoff_address: "The Fullerton Hotel Singapore",
    route: "Marina Bay Sands > The Fullerton Hotel Singapore",
    job_card:
      "AVF TRF\nPending ACK Queue fixture two\nMarina Bay Sands > The Fullerton Hotel Singapore\nPassenger: ACK QUEUE TWO",
    passenger_name: "ACK QUEUE TWO",
    status: "assigned",
    driver_id: "ack-driver-two",
    driver_name: "ACK DRIVER TWO",
    driver_contact: "+65 8000 0002",
    driver_plate_number: "SLA1002B",
  },
];

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;

      server.close(() => resolve(port));
    });
  });
}

async function waitForAppReady(appUrl, getServerLogs) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < 30000) {
    try {
      const response = await fetch(appUrl);

      if (response.ok) {
        return;
      }

      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(
    `Pending Driver ACK browser test server did not become ready: ${normalizeErrorMessage(
      lastError,
    )}\n${getServerLogs()}`,
  );
}

async function stopProcessGroup(childProcess) {
  if (!childProcess?.pid || childProcess.exitCode !== null || childProcess.signalCode !== null) {
    return;
  }

  try {
    process.kill(-childProcess.pid, "SIGTERM");
  } catch {
    childProcess.kill("SIGTERM");
  }

  await waitForChildExit(childProcess);
}

async function startFocusedTestApp() {
  if (configuredAppUrl) {
    return {
      appUrl: configuredAppUrl,
      getServerLogs: () => "Using externally managed APP_URL.",
      server: null,
    };
  }

  const appPort = await getFreePort();
  const appUrl = `http://127.0.0.1:${appPort}`;
  let stdout = "";
  let stderr = "";
  const server = spawn(
    "npm",
    ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(appPort)],
    {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  server.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const getServerLogs = () => `stdout:\n${stdout}\nstderr:\n${stderr}`;

  try {
    await waitForAppReady(appUrl, getServerLogs);
  } catch (error) {
    await stopProcessGroup(server);
    throw error;
  }

  return { appUrl, getServerLogs, server };
}

function pageFixtureScript() {
  return `(() => {
    const bookings = ${JSON.stringify(bookings)};
    const firstLinkId = ${JSON.stringify(firstLinkId)};
    const secondLinkId = ${JSON.stringify(secondLinkId)};
    const amendedLinkId = ${JSON.stringify(amendedLinkId)};
    const originalFetch = window.fetch.bind(window);

    const makeLink = ({ bookingReference, id, jobCardKind }) => ({
      booking_reference: bookingReference,
      created_at: "2026-07-20T12:00:00.000Z",
      expires_at: "2026-07-22T12:00:00.000Z",
      id,
      issued_at: "2026-07-20T12:00:00.000Z",
      link_status: "active",
      revoked_at: null,
      safe_summary: {
        acknowledged: false,
        acknowledged_at: null,
        assigned_driver: null,
        job_card_kind: jobCardKind,
        pickup_datetime: null,
        route: null,
        vehicle: null,
      },
      updated_at: "2026-07-20T12:00:00.000Z",
    });

    const currentLinks = () => {
      const amendmentMode = window.localStorage.getItem("prestige-ack-queue-browser-link-mode") === "amendment";

      return [
        makeLink({
          bookingReference: "ACK-CLOSE-BOOKING-ONE",
          id: amendmentMode ? amendedLinkId : firstLinkId,
          jobCardKind: amendmentMode ? "amendment" : "reissued",
        }),
        makeLink({
          bookingReference: "ACK-CLOSE-BOOKING-TWO",
          id: secondLinkId,
          jobCardKind: "new",
        }),
      ];
    };

    window.__prestigeAckQueueRequests = [];
    window.__prestigeAckQueueLinks = currentLinks();
    window.fetch = async (...args) => {
      const target = args[0]?.url || args[0];
      const url = new URL(String(target), window.location.origin);
      const method = String(args[1]?.method || args[0]?.method || "GET").toUpperCase();
      const request = { method, url: url.pathname + url.search };
      window.__prestigeAckQueueRequests.push(request);

      const json = (body, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        });

      if (url.pathname === "/api/admin-load-bookings-typed-read") {
        return json({
          bookings: [],
          ok: true,
          read_gate_open: true,
          status: "ready",
          version: "pending-ack-close-browser-typed-read",
        });
      }

      if (url.pathname === "/api/admin-saved-bookings" && method === "GET") {
        return json({
          bookings,
          ok: true,
          version: "pending-ack-close-browser-saved-bookings",
        });
      }

      if (url.pathname === "/api/admin-driver-job-links" && method === "GET") {
        const bookingReference = url.searchParams.get("booking_reference") || "";
        const links = currentLinks().filter(
          (link) => !bookingReference || link.booking_reference === bookingReference,
        );
        window.__prestigeAckQueueLinks = currentLinks();

        return json({
          links,
          ok: true,
          pagination: {
            has_next_page: false,
            has_previous_page: false,
            page: 1,
            page_count: links.length ? 1 : 0,
            page_size: 1,
            total_link_count: links.length,
          },
          version: "pending-ack-close-browser-driver-links",
        });
      }

      if (url.origin === window.location.origin && url.pathname.startsWith("/api/") && method === "GET") {
        return json({ ok: true });
      }

      if (url.origin === window.location.origin && url.pathname.startsWith("/api/")) {
        return json({ error: "Unexpected mutation in pending ACK Close browser guard.", ok: false }, 405);
      }

      return originalFetch(...args);
    };
  })()`;
}

async function runChromeTest() {
  const reporter = createBrowserTestReporter("pending-driver-ack-queue-browser");
  const app = await startFocusedTestApp();
  const appUrl = app.appUrl;
  const chromeDebugPort = configuredChromeDebugPort || (await getFreePort());
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), "prestige-pending-ack-close-chrome-"));
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
    { stdio: ["ignore", "ignore", "pipe"] },
  );

  const browserErrors = [];
  const browserConsoleErrors = [];
  let client = null;
  let stderr = "";

  chrome.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForChromeDebugPort(chromeDebugPort);
    const target = await waitForChromePageTarget(chromeDebugPort);
    client = createChromeClient(target.webSocketDebuggerUrl);
    await client.ready;
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    client.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
      browserErrors.push(
        exceptionDetails?.exception?.description || exceptionDetails?.text || "Unknown browser exception",
      );
    });
    client.on("Runtime.consoleAPICalled", ({ type, args = [] }) => {
      if (type === "error") {
        browserConsoleErrors.push(
          normalizeConsoleMessages(args.map((value) => value?.value ?? value?.description ?? "")),
        );
      }
    });

    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: pageFixtureScript(),
    });
    await navigateWithLoadEvent(client, appUrl);
    reporter.step("admin app loaded with two pending links");

    const evaluate = async (expression) => {
      const result = await client.send("Runtime.evaluate", {
        awaitPromise: true,
        expression,
        returnByValue: true,
      });

      return result.result?.value;
    };

    const readQueue = () =>
      evaluate(`(() => {
        const queue = document.querySelector("[data-pending-driver-ack-queue='true']");
        const items = [...(queue?.querySelectorAll("[data-pending-driver-ack-queue-item='true']") || [])];

        return queue
          ? {
              count: queue.getAttribute("data-pending-driver-ack-queue-count"),
              ids: items.map((item) => item.getAttribute("data-pending-driver-ack-queue-link-id")),
              pulsing: queue.getAttribute("data-pending-driver-ack-queue-pulsing"),
              text: queue.textContent.replace(/\\s+/g, " ").trim(),
            }
          : null;
      })()`);

    const initialQueue = await waitForCondition(
      async () => {
        const state = await readQueue();
        return state?.count === "2" ? state : false;
      },
      15000,
      "two independent pending Driver ACK rows",
    );
    assert.equal(initialQueue.pulsing, "true");
    assert.deepEqual(initialQueue.ids, [firstLinkId, secondLinkId]);
    assert.match(initialQueue.text, /12001 · Reissued · Link issued/);
    assert.match(initialQueue.text, /12002 · New · Link issued/);

    const requestsBeforeClose = await evaluate(`window.__prestigeAckQueueRequests.length`);
    const clickedClose = await evaluate(`(() => {
      const button = document.querySelector(
        "[data-pending-driver-ack-dismiss='${firstLinkId}']",
      );
      if (!button || button.textContent.trim() !== "Close") return false;
      button.click();
      return true;
    })()`);
    assert.equal(clickedClose, true, "Expected the first exact-link Close button to be clickable.");

    const isolatedQueue = await waitForCondition(
      async () => {
        const state = await readQueue();
        return state?.count === "1" ? state : false;
      },
      10000,
      "one exact alert dismissed while the second remains",
    );
    assert.deepEqual(isolatedQueue.ids, [secondLinkId]);
    assert.equal(isolatedQueue.pulsing, "true");
    assert.doesNotMatch(isolatedQueue.text, /12001/);
    assert.match(isolatedQueue.text, /12002/);

    const closePersistence = await evaluate(`(() => ({
      dismissed: JSON.parse(window.localStorage.getItem(${JSON.stringify(dismissedStorageKey)}) || "[]"),
      links: window.__prestigeAckQueueLinks,
      requestDelta: window.__prestigeAckQueueRequests.slice(${requestsBeforeClose}),
    }))()`);
    assert.deepEqual(closePersistence.dismissed, [firstLinkId]);
    assert.equal(
      closePersistence.links.find((link) => link.id === firstLinkId)?.link_status,
      "active",
      "Close must leave the exact private link active.",
    );
    assert.deepEqual(
      closePersistence.requestDelta.filter((request) => request.method !== "GET"),
      [],
      "Close must not create POST, PATCH, DELETE, or other mutations.",
    );

    await navigateWithLoadEvent(client, appUrl);
    reporter.step("hard refresh retained exact-link dismissal");
    const refreshedQueue = await waitForCondition(
      async () => {
        const state = await readQueue();
        return state?.count === "1" ? state : false;
      },
      15000,
      "dismissed exact link remains hidden after hard refresh",
    );
    assert.deepEqual(refreshedQueue.ids, [secondLinkId]);
    assert.doesNotMatch(refreshedQueue.text, /12001/);
    assert.match(refreshedQueue.text, /12002/);
    assert.deepEqual(
      await evaluate(
        `JSON.parse(window.localStorage.getItem(${JSON.stringify(dismissedStorageKey)}) || "[]")`,
      ),
      [firstLinkId],
    );

    await evaluate(
      `window.localStorage.setItem("prestige-ack-queue-browser-link-mode", "amendment")`,
    );
    await navigateWithLoadEvent(client, appUrl);
    reporter.step("new exact link appeared as a fresh pending alert");
    const amendedQueue = await waitForCondition(
      async () => {
        const state = await readQueue();
        return state?.count === "2" && state.ids.includes(amendedLinkId) ? state : false;
      },
      15000,
      "new link ID for the same booking appears after older dismissal",
    );
    assert.deepEqual(amendedQueue.ids, [amendedLinkId, secondLinkId]);
    assert.match(amendedQueue.text, /12001 · Amendment · Link issued/);
    assert.match(amendedQueue.text, /12002 · New · Link issued/);
    assert.equal(amendedQueue.pulsing, "true");

    assert.deepEqual(browserErrors, [], `Expected no browser errors:\n${browserErrors.join("\n")}`);
    assert.deepEqual(
      browserConsoleErrors,
      [],
      `Expected no browser console errors:\n${browserConsoleErrors.join("\n")}`,
    );

    console.log(
      JSON.stringify(
        reporter.summary({
          amendedLinkId,
          dismissedLinkId: firstLinkId,
          finalPendingCount: amendedQueue.count,
          secondLinkId,
        }),
        null,
        2,
      ),
    );
  } finally {
    if (client) {
      await client.close().catch(() => undefined);
    }
    await terminateChildProcess(chrome);
    await rm(userDataDir, { recursive: true, force: true });
    await stopProcessGroup(app.server);
    if (stderr && process.env.PRESTIGE_BROWSER_TEST_VERBOSE) {
      process.stderr.write(stderr);
    }
  }
}

await runChromeTest();
