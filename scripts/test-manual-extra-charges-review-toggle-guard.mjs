import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPage = await readFile("app/page.tsx", "utf8");
const previewMarker = appPage.indexOf('data-manual-extra-charges-review-preview="true"');
const start = appPage.lastIndexOf("<details", previewMarker);
const end = appPage.indexOf("{jobCardCopyEditState.isEditing", start);

assert.notEqual(previewMarker, -1, "Manual Extra Charges review preview marker must exist.");
assert.notEqual(start, -1, "Manual Extra Charges review preview must exist.");
assert.notEqual(end, -1, "Manual Extra Charges review preview must have a stable end marker.");

const preview = appPage.slice(start, end);

for (const fragment of [
  'className="group mb-2',
  '<span className="group-open:hidden">Expand</span>',
  '<span className="hidden group-open:inline">Collapse</span>',
  'data-manual-extra-charges-review-boundary="true"',
  "Not billed, not saved, no total calculated.",
]) {
  assert.equal(preview.includes(fragment), true, `Manual Extra Charges toggle must include ${fragment}.`);
}

console.log("Manual Extra Charges review toggle guard passed.");
