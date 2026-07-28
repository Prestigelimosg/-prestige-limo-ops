import assert from "node:assert/strict";

const siteOrigin = "https://prestigelimo.sg";
const retiredPaths = [
  "/limousine-transport-5-reasons-why-you-should-use-corporate-limo/",
  "/page-not-found/",
  "/booking-mercedes-benz-e-class-4-pax/",
  "/pick-up-drop-airport-limousine-service-singapore/",
  "/chbs_vehicle_c/multi-purpose-vehicle-mpv/?paged=13",
  "/booking-mercedes-benz-s-class-4-pax/",
];
const verificationMissingPath =
  "/codex-soft-404-verification-does-not-exist-20260728/";

async function fetchPublic(path, redirect = "manual") {
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await fetch(new URL(path, siteOrigin), {
        headers: {
          "cache-control": "no-cache",
          connection: "close",
          "user-agent": "PrestigeLimoSoft404Guard/1.0",
        },
        redirect,
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      }
    }
  }

  throw lastError;
}

for (const path of [...retiredPaths, verificationMissingPath]) {
  const response = await fetchPublic(path);
  const html = await response.text();

  assert.equal(response.status, 404, `${path} must return a real HTTP 404`);
  assert.equal(
    response.headers.get("location"),
    null,
    `${path} must not redirect to a published placeholder`,
  );
  assert.match(
    html,
    /<meta[^>]+(?:name=["']robots["'][^>]+content=["'][^"']*noindex|content=["'][^"']*noindex[^"']*["'][^>]+name=["']robots["'])/i,
    `${path} must remain noindex`,
  );
}

const homeResponse = await fetchPublic("/");
const homeHtml = await homeResponse.text();
assert.equal(homeResponse.status, 200, "The public homepage must remain live");
assert.match(
  homeHtml,
  /<meta[^>]+(?:name=["']robots["'][^>]+content=["'][^"']*index|content=["'][^"']*index[^"']*["'][^>]+name=["']robots["'])/i,
  "The public homepage must remain indexable",
);

const sitemapResponse = await fetchPublic("/page-sitemap.xml", "follow");
const sitemapXml = await sitemapResponse.text();
assert.equal(sitemapResponse.status, 200, "The page sitemap must remain live");
for (const path of retiredPaths) {
  assert.equal(
    sitemapXml.includes(new URL(path, siteOrigin).href),
    false,
    `${path} must stay outside the page sitemap`,
  );
}

console.log("Public WordPress Soft 404 guard passed.");
