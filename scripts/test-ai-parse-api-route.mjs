import assert from "node:assert/strict";

const appUrl = process.env.APP_URL || "http://localhost:3000";
const emptyMessageError = "Paste a booking message before using AI Assist Parse.";
const mockRouteMessage = "AI parser API route is ready but not connected to OpenAI yet.";
const originalOpenAiApiKey = process.env.OPENAI_API_KEY;

delete process.env.OPENAI_API_KEY;

try {
  const routeUrl = new URL("/api/ai-parse", appUrl);
  assert.match(routeUrl.origin, /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/);

  const getResponse = await fetch(routeUrl, { method: "GET" });
  assert.equal(getResponse.status, 405);

  const emptyResponse = await fetch(routeUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "   " }),
  });
  assert.equal(emptyResponse.status, 400);
  assert.deepEqual(await emptyResponse.json(), {
    ok: false,
    error: emptyMessageError,
  });

  const malformedResponse = await fetch(routeUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{not json",
  });
  assert.equal(malformedResponse.status, 400);
  assert.equal((await malformedResponse.json()).error, emptyMessageError);

  const successResponse = await fetch(routeUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "Need a Viano tomorrow 11am from Shenton Way to Capital Tower." }),
  });
  assert.equal(successResponse.status, 200);

  const successJson = await successResponse.json();
  assert.equal(successJson.ok, true);
  assert.equal(successJson.mode, "mock");
  assert.equal(successJson.message, mockRouteMessage);
  assert.equal(successJson.savedBookingId, undefined);
  assert.equal(successJson.bookingId, undefined);
  assert.equal(successJson.result.multipleBookingsDetected, false);
  assert.equal(Array.isArray(successJson.result.bookings), true);
  assert.equal(Array.isArray(successJson.result.rawWarnings), true);
  assert.equal(successJson.result.rawWarnings.includes(mockRouteMessage), true);
  assert.equal(successJson.result.bookings.length, 1);

  const booking = successJson.result.bookings[0];
  assert.equal(booking.confidence, 0.1);
  assert.equal(Array.isArray(booking.needsReviewReasons), true);
  assert.equal(booking.needsReviewReasons.includes("Mock response only — review required"), true);
  assert.equal(booking.bookingType, "");
  assert.equal(booking.companyAccount, "");
  assert.equal(booking.pickupDate, "");
  assert.equal(booking.flightNumber, "");
  assert.equal(booking.pickup, "");
  assert.equal(booking.dropoff, "");
  assert.equal(booking.savedBookingId, undefined);
  assert.equal(booking.bookingId, undefined);

} finally {
  if (originalOpenAiApiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalOpenAiApiKey;
  }
}

console.log("AI parse API route skeleton tests passed.");
