import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

function sliceBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `Missing end marker after ${startMarker}: ${endMarker}`);
  return source.slice(start, end);
}

const jobCardPreviewBlock = sliceBetween(
  "const jobCardPreview = useMemo(() => {",
  "const draftPricing = useMemo(() => {",
);
assert.match(
  jobCardPreviewBlock,
  /formatWhatsAppJobCard\(booking\)/,
  "Job Card Preview must use the compact WhatsApp job-card formatter.",
);
assert.doesNotMatch(
  jobCardPreviewBlock,
  /normalizeCompanyAccount|Company:|Flight:\s*\$\{/,
  "Job Card Preview must not reintroduce company lines or standalone Flight labels.",
);

const generatedCopyBlock = sliceBetween(
  "const generatedDispatchCopyMessages = useMemo(",
  "const dispatchCopyResetKey = useMemo(",
);
assert.match(
  generatedCopyBlock,
  /customerCopy:\s*customerCopyCard/,
  "Customer Copy target must remain wired to the existing Customer Copy formatter.",
);
assert.match(
  generatedCopyBlock,
  /driverDispatch:\s*draftDriverDispatchCard/,
  "Driver Dispatch target must remain wired to the existing Driver Dispatch formatter.",
);
assert.match(
  generatedCopyBlock,
  /jobCard:\s*jobCardPreview/,
  "Job Card target must remain wired to the Job Card Preview formatter.",
);

console.log("WhatsApp job card preview wiring guard passed.");
