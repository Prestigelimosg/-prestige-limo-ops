import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const appPath = new URL("../driver-companion/App.tsx", import.meta.url);
const contractPath = new URL(
  "../driver-companion/src/driver-job-contract.ts",
  import.meta.url,
);
const androidAssociationPath = new URL(
  "../app/.well-known/assetlinks.json/route.ts",
  import.meta.url,
);

const appSource = readFileSync(appPath, "utf8");
const contractSource = readFileSync(contractPath, "utf8");

assert.ok(
  existsSync(androidAssociationPath),
  "Android App Links must publish the verified Digital Asset Links association",
);
assert.doesNotMatch(
  appSource,
  /Linking\.openURL\s*\(/,
  "Installed Driver Job links must never hand ordinary reporting to Safari or Chrome",
);
assert.match(appSource, /Linking\.addEventListener\("url"/);
assert.match(appSource, /Linking\.getInitialURL\(\)/);
assert.match(appSource, /Save & Acknowledge Job/);
for (const action of ["OTW", "OTS", "POB", "Job Completed"]) {
  assert.ok(appSource.includes(action), `Native Driver flow must include ${action}`);
}
for (const field of ["Driver name", "Contact", "Plate", "Vehicle"]) {
  assert.ok(appSource.includes(field), `Native acknowledgement must include ${field}`);
}
assert.match(appSource, /TextInput/);

assert.match(contractSource, /\/api\/driver-job\/\$\{encodeURIComponent\(job\.token\)\}/);
assert.match(contractSource, /method:\s*"PATCH"/);
for (const key of [
  "driver_contact",
  "driver_name",
  "driver_plate_number",
  "driver_vehicle_model",
]) {
  assert.ok(contractSource.includes(key), `Acknowledgement must send ${key}`);
}
for (const forbidden of [
  "customer_price",
  "driver_payout",
  "paynow",
  "invoice",
  "internal_admin_note",
  "parser_debug",
]) {
  assert.ok(
    !appSource.toLowerCase().includes(forbidden) &&
      !contractSource.toLowerCase().includes(forbidden),
    `Driver native source must not expose ${forbidden}`,
  );
}

const associationSource = readFileSync(androidAssociationPath, "utf8");
assert.match(associationSource, /export const dynamic = "force-static"/);
assert.match(associationSource, /export function GET\(\)/);
assert.doesNotMatch(associationSource, /supabase|process\.env|POST|PATCH|DELETE/i);

const associationModule = await import(androidAssociationPath.href);
const associationResponse = associationModule.GET();
assert.equal(associationResponse.status, 200);
assert.equal(associationResponse.headers.get("content-type"), "application/json");
assert.deepEqual(await associationResponse.json(), [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "sg.prestigelimo.drivercompanion",
      sha256_cert_fingerprints: [
        "2C:15:46:61:3E:14:DA:3E:CB:C0:F9:0D:2A:30:6E:B7:C3:F8:13:D5:53:EF:E6:C3:7C:95:B7:C9:8F:42:24:24",
      ],
    },
  },
]);

const {
  loadDriverJobDetails,
  nextDriverJobStatusAction,
  productionOrigin,
  saveAndAcknowledgeDriverJob,
  updateDriverJobStatus,
} = await import(contractPath.href);

const token = "a".repeat(20);
const job = {
  jobUrl: `${productionOrigin}/driver-job/${token}`,
  origin: productionOrigin,
  token,
};
const requests = [];
const originalFetch = globalThis.fetch;

try {
  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), init });
    const body = init.body ? JSON.parse(String(init.body)) : null;

    if (String(url).endsWith("/status")) {
      return Response.json({
        ok: true,
        payload: safePayload({
          acknowledged: true,
          status:
            body.status === "OTW"
              ? "driver_otw"
              : body.status === "Job Completed"
                ? "completed"
                : body.status.toLowerCase(),
        }),
      });
    }

    return Response.json({
      ok: true,
      payload: safePayload({ acknowledged: init.method === "PATCH" }),
    });
  };

  const details = await loadDriverJobDetails(job);
  assert.deepEqual(details, safeExpected());
  assert.equal("customer_price" in details, false);
  assert.equal("driver_payout" in details, false);
  assert.equal("internal_admin_note" in details, false);

  const acknowledged = await saveAndAcknowledgeDriverJob(job, {
    contact: "+65 9000 0000",
    name: "Safe Driver",
    plate: "SLH1234A",
    vehicleModel: "Alphard",
  });
  assert.equal(acknowledged.acknowledged, true);
  assert.deepEqual(JSON.parse(String(requests.at(-1).init.body)), {
    driver_contact: "+65 9000 0000",
    driver_name: "Safe Driver",
    driver_plate_number: "SLH1234A",
    driver_vehicle_model: "Alphard",
  });

  const expectedActions = [
    ["assigned", "OTW"],
    ["driver_otw", "OTS"],
    ["ots", "POB"],
    ["pob", "Job Completed"],
    ["completed", null],
  ];
  for (const [status, action] of expectedActions) {
    assert.equal(nextDriverJobStatusAction(status), action);
  }

  for (const status of ["OTW", "OTS", "POB", "Job Completed"]) {
    await updateDriverJobStatus(job, status);
    const request = requests.at(-1);
    assert.equal(request.url, `${productionOrigin}/api/driver-job/${token}/status`);
    assert.equal(request.init.method, "PATCH");
    assert.deepEqual(JSON.parse(String(request.init.body)), { status });
  }
} finally {
  globalThis.fetch = originalFetch;
}

function safePayload(overrides = {}) {
  return {
    acknowledged: false,
    assignedDriver: {
      contact: "+65 9000 0000",
      name: "Safe Driver",
      plate: "SLH1234A",
      vehicleModel: "Alphard",
    },
    bookingType: "MNG",
    bookingTypeLabel: "Arrival transfer",
    customer_price: "999.00",
    driver_payout: "100.00",
    flightNumber: "SQ12",
    internal_admin_note: "never expose",
    passengerName: "Safe Passenger",
    pickupDate: "2026-08-15",
    pickupDateTime: "2026-08-15T11:00",
    pickupLocation: "Changi Airport",
    pickupTime: "11:00",
    reference: "10889",
    route: "Changi Airport > Hilton Hotel",
    status: "assigned",
    statusHistory: [
      {
        occurredAt: "2026-08-15T10:00:00.000Z",
        safeNote: "Driver assigned",
        status: "assigned",
        statusLabel: "Assigned",
      },
    ],
    statusLabel: "Assigned",
    waypoints: ["Terminal 3"],
    dropoffLocation: "Hilton Hotel",
    ...overrides,
  };
}

function safeExpected() {
  return {
    acknowledged: false,
    assignedDriver: {
      contact: "+65 9000 0000",
      name: "Safe Driver",
      plate: "SLH1234A",
      vehicleModel: "Alphard",
    },
    bookingType: "MNG",
    bookingTypeLabel: "Arrival transfer",
    dropoffLocation: "Hilton Hotel",
    flightNumber: "SQ12",
    passengerName: "Safe Passenger",
    pickupDate: "2026-08-15",
    pickupDateTime: "15 Aug 2026, 1100hrs SGT",
    pickupLocation: "Changi Airport",
    pickupTime: "11:00",
    reference: "10889",
    route: "Changi Airport > Hilton Hotel",
    status: "assigned",
    statusHistory: [
      {
        occurredAt: "2026-08-15T10:00:00.000Z",
        safeNote: "Driver assigned",
        status: "assigned",
        statusLabel: "Assigned",
      },
    ],
    statusLabel: "Assigned",
    waypoints: ["Terminal 3"],
  };
}

console.log("Driver Companion internal ACK and status guard passed");
