import assert from "node:assert/strict";

import { formatCustomerInvoiceLineDescription } from "../lib/customer-invoice-line-description.ts";

const common = {
  dropoffLocation: "Changi Airport T3",
  passengerName: "Deep July",
  pickupAt: "2026-07-17T22:10:00.000Z",
  pickupLocation: "327 River Valley Road",
  publicReference: "10826",
  route: "327 River Valley Road > Changi Airport T3",
  vehicleType: "AVF",
};

assert.equal(
  formatCustomerInvoiceLineDescription({ ...common, flightNumber: "SQ12", serviceType: "MNG" }),
  "AIRPORT ARRIVAL | SQ12 | 18 JUL 2026, 06:10 | 327 RIVER VALLEY ROAD > CHANGI AIRPORT T3\n" +
    "ALPHARD / VELLFIRE | DEEP JULY | REF 10826",
);

assert.equal(
  formatCustomerInvoiceLineDescription({ ...common, flightNumber: "SQ12", serviceType: "DEP" }),
  "AIRPORT DEPARTURE | SQ12 | 18 JUL 2026, 06:10 | 327 RIVER VALLEY ROAD > CHANGI AIRPORT T3\n" +
    "ALPHARD / VELLFIRE | DEEP JULY | REF 10826",
);

assert.equal(
  formatCustomerInvoiceLineDescription({ ...common, serviceType: "TRF", vehicleType: "VVV" }),
  "CITY TRANSFER | 18 JUL 2026, 06:10 | 327 RIVER VALLEY ROAD > CHANGI AIRPORT T3\n" +
    "MERCEDES VIANO / V-CLASS | DEEP JULY | REF 10826",
);

assert.equal(
  formatCustomerInvoiceLineDescription({ ...common, serviceType: "TRF", vehicleType: "E / AVF" }),
  "CITY TRANSFER | 18 JUL 2026, 06:10 | 327 RIVER VALLEY ROAD > CHANGI AIRPORT T3\n" +
    "MERCEDES E-CLASS / ALPHARD / VELLFIRE | DEEP JULY | REF 10826",
);

assert.equal(
  formatCustomerInvoiceLineDescription({
    ...common,
    dspEndedAt: "2026-07-18T01:25:00.000Z",
    dspStartedAt: "2026-07-17T22:10:00.000Z",
    serviceType: "DSP",
  }),
  "HOURLY / DISPOSAL | 18 JUL 2026, 06:10-09:25 | ALPHARD / VELLFIRE | DEEP JULY | REF 10826",
);

assert.equal(
  formatCustomerInvoiceLineDescription({ serviceType: "MNG" }),
  "AIRPORT ARRIVAL | NIL | NIL | NIL > NIL\nNIL | NIL | REF NIL",
);

assert.equal(
  formatCustomerInvoiceLineDescription({
    ...common,
    dropoffLocation: "",
    route: "327 River Valley Road",
    serviceType: "DEP",
  }),
  "AIRPORT DEPARTURE | NIL | 18 JUL 2026, 06:10 | 327 RIVER VALLEY ROAD > NIL\n" +
    "ALPHARD / VELLFIRE | DEEP JULY | REF 10826",
);

assert.equal(
  formatCustomerInvoiceLineDescription({ serviceType: "DSP" }),
  "HOURLY / DISPOSAL | NIL-NIL | NIL | NIL | REF NIL",
);

console.log("Customer invoice line-description format tests passed");
