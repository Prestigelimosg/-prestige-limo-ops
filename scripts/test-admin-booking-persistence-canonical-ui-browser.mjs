import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import {
  createChromeClient,
  navigateWithLoadEvent,
  waitForChromeDebugPort,
  waitForChromePageTarget,
  waitForCondition,
  waitForTabLabels,
} from "./browser-test-helpers.mjs";

const appUrl = process.env.APP_URL || "http://localhost:3000";
const chromeBinary =
  process.env.CHROME_BINARY || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
let chromeDebugPort = process.env.CHROME_DEBUG_PORT ? Number(process.env.CHROME_DEBUG_PORT) : null;

async function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        resolve(typeof address === "object" && address ? address.port : 0);
      });
    });
  });
}

async function launchChrome(userDataDir) {
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
      "--remote-debugging-address=127.0.0.1",
      `--remote-debugging-port=${chromeDebugPort}`,
      "about:blank",
    ],
    {
      stdio: ["ignore", "ignore", "pipe"],
    },
  );

  let stderr = "";
  chrome.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  try {
    await waitForChromeDebugPort(chromeDebugPort, 10000);
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nChrome stderr:\n${stderr}`);
  }

  return { chrome, stderr: () => stderr };
}

async function terminate(processHandle) {
  if (!processHandle || processHandle.exitCode !== null || processHandle.signalCode !== null) {
    return;
  }

  processHandle.kill("SIGTERM");
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 2000);
    processHandle.once("exit", () => {
      clearTimeout(timeout);
      resolve(undefined);
    });
  });

  if (processHandle.exitCode === null && processHandle.signalCode === null) {
    processHandle.kill("SIGKILL");
  }
}

async function main() {
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-crm-canonical-"));
  let chromeProcess = null;
  let client = null;

  try {
    chromeDebugPort = chromeDebugPort || (await findAvailablePort());
    const launched = await launchChrome(userDataDir);
    chromeProcess = launched.chrome;
    const target = await waitForChromePageTarget(chromeDebugPort, 10000);
    client = createChromeClient(target.webSocketDebuggerUrl);
    await client.ready;
    await client.send("Page.enable");
    await client.send("Runtime.enable");

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

    await navigateWithLoadEvent(client, appUrl);
    await waitForTabLabels(evaluate, ["Dispatch", "Dashboard", "Bookings"], "admin tabs");

    await evaluate(`(() => {
      const originalFetch = window.fetch.bind(window);
      window.__canonicalLoadBookingCalls = [];
      const canonicalBooking = {
        id: "canonical-row-37",
        booking_reference: "CANONICAL-REQ-001",
        source_channel: "customer-booking-request",
        source_surface: "customer_booking_request",
        customer_id: "canonical-customer",
        company_id: null,
        booker_id: null,
        traveler_id: null,
        booking_type: null,
        service_type: "DEP",
        route_type: null,
        vehicle: null,
        vehicle_type: null,
        vehicle_type_or_category: "No preference",
        pickup_time: null,
        pickup_at: "2026-06-25T11:15:00+08:00",
        pickup_datetime: null,
        pickup_address: null,
        pickup_location: "Canonical Pickup",
        dropoff_address: null,
        dropoff_location: "Canonical Dropoff",
        flight_no: "SQ999",
        route: null,
        route_summary: "Canonical Pickup > Canonical Dropoff",
        pax: null,
        pax_count: 3,
        passenger_name: "Canonical Passenger",
        passenger_phone: "+65 8000 9999",
        customer_display_name: "Canonical Customer",
        contact_display_name: "Canonical Booker",
        contact_phone: "+65 8000 9998",
        contact_email: "canonical@example.com",
        job_card: null,
        status: "requested",
        driver_id: null,
        driver_name: null,
        driver_contact: null,
        driver_plate_number: null,
        created_at: "2026-06-25T01:00:00.000Z",
        updated_at: "2026-06-25T01:00:00.000Z",
        companies: null,
        bookers: null,
        travelers: null
      };
      window.fetch = async (...args) => {
        const [input, init] = args;
        const url = typeof input === "string" ? input : input?.url || "";
        const method = (init?.method || "GET").toUpperCase();

        if (method === "GET" && String(url).includes("/api/admin-load-bookings-typed-read")) {
          window.__canonicalLoadBookingCalls.push({ method, surface: "typed", url: String(url) });
          return new Response(JSON.stringify({
            error: "Typed read intentionally closed for fallback canonical display test.",
            ok: false
          }), { headers: { "Content-Type": "application/json" }, status: 503 });
        }

        if (method === "GET" && String(url).includes("/api/admin-saved-bookings")) {
          window.__canonicalLoadBookingCalls.push({ method, surface: "saved", url: String(url) });
          return new Response(JSON.stringify({
            ok: true,
            bookings: [canonicalBooking]
          }), { headers: { "Content-Type": "application/json" }, status: 200 });
        }

        return originalFetch(...args);
      };
    })()`);

    await evaluate(`(() => {
      const bookingsTab = [...document.querySelectorAll("button[role='tab']")]
        .find((button) => button.textContent.trim() === "Bookings");
      bookingsTab?.click();
      return Boolean(bookingsTab);
    })()`);
    const loadVisible = await evaluate(`(() => {
      const button = [...document.querySelectorAll("button")]
        .find((candidate) => candidate.textContent.trim() === "Load Bookings");
      const autoLoadTab = document.querySelector("[data-bookings-tab-autoload='true']");
      return Boolean(button && autoLoadTab);
    })()`);
    assert.equal(loadVisible, true, "Expected visible Load Bookings control and auto-load tab marker");

    const cardState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const record = document.querySelector("[data-recent-operational-card='canonical-row-37']");
          if (!record) return false;
          const text = record.textContent.replace(/\\s+/g, " ").trim();
          return {
            savedCalls: (window.__canonicalLoadBookingCalls || []).filter((call) => call.surface === "saved").length,
            typedCalls: (window.__canonicalLoadBookingCalls || []).filter((call) => call.surface === "typed").length,
            text,
          };
        })()`),
      10000,
      "canonical visible recent booking card",
    );

    assert.equal(cardState.typedCalls, 1, "Expected one typed display read attempt");
    assert.equal(cardState.savedCalls, 1, "Expected one saved booking list load call");
    assert.equal(cardState.text.includes("CANONICAL-REQ-001"), true);
    assert.equal(cardState.text.includes("Canonical Customer"), true);
    assert.equal(cardState.text.includes("Canonical Booker"), true);
    assert.equal(cardState.text.includes("Canonical Passenger"), true);
    assert.equal(cardState.text.includes("Canonical Pickup > Canonical Dropoff"), true);
    assert.equal(cardState.text.includes("Unknown"), false);
    assert.equal(cardState.text.includes("Pickup > Drop-off"), false);
    assert.equal(/price|billing|invoice|payment|payout|finance/i.test(cardState.text), false);

    const applyClicked = await evaluate(`(() => {
      const record = document.querySelector("[data-recent-operational-card='canonical-row-37']");
      const button = [...(record?.querySelectorAll("button") || [])]
        .find((candidate) => candidate.textContent.trim() === "Load this booking");
      button?.click();
      return Boolean(button);
    })()`);
    assert.equal(applyClicked, true, "Expected Load this booking control");

    const appliedState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const statusFeedback = [...document.querySelectorAll("p, div")]
            .map((node) => node.textContent || "")
            .find((text) => text.includes("Booking CANONICAL-REQ-001 loaded.")) || "";
          const getField = (labelText) => {
            const label = [...document.querySelectorAll("label")].find(
              (candidate) => candidate.querySelector("span")?.textContent.trim() === labelText,
            );
            const field = label?.querySelector("input, textarea, select");
            return field ? field.value : "";
          };
          if (!statusFeedback) return false;
          return {
            booker: getField("Booker *"),
            bookingType: getField("Booking type"),
            company: getField("Company / Account"),
            dropoff: getField("Drop-off *"),
            name: getField("Passenger name"),
            pax: getField("Pax"),
            pickup: getField("Pickup *"),
            time: getField("Pickup time *"),
            vehicle: getField("Vehicle"),
          };
        })()`),
      10000,
      "canonical visible booking loaded form fields",
    );

    assert.equal(appliedState.company, "Canonical Customer");
    assert.equal(appliedState.booker, "Canonical Booker");
    assert.equal(appliedState.name, "Canonical Passenger");
    assert.equal(appliedState.bookingType, "DEP");
    assert.equal(appliedState.pickup, "Canonical Pickup");
    assert.equal(appliedState.dropoff, "Canonical Dropoff");
    assert.equal(appliedState.pax, "3");
    assert.equal(appliedState.vehicle, "No preference");
    assert.match(appliedState.time, /^1115/);

    console.log("Admin booking persistence canonical UI browser test passed.");
  } finally {
    if (client) {
      await client.close();
    }
    await terminate(chromeProcess);
    await rm(userDataDir, { force: true, recursive: true });
  }
}

await main();
