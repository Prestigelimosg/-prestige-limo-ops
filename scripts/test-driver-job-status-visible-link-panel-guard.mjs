import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile("app/page.tsx", "utf8");
const linkStart = app.indexOf('data-dispatch-workflow-step="driver-job-link"');
const linkEnd = app.indexOf('data-dispatch-workflow-step="admin-lower-status"', linkStart);
const linkPanel = app.slice(linkStart, linkEnd);

assert.notEqual(linkStart, -1, "Missing existing Driver Job Link panel.");
assert.notEqual(linkEnd, -1, "Missing Driver Job Link panel boundary.");
assert.match(linkPanel, /data-admin-driver-job-status-readout="true"/);
assert.match(linkPanel, /data-admin-driver-job-status-refresh="true"/);
assert.match(linkPanel, /adminDriverJobStatusLatestLabel/);
assert.match(linkPanel, /adminDriverJobStatusLatestTime/);
assert.equal((app.match(/data-admin-driver-job-status-readout="true"/g) || []).length, 1);

console.log("Driver job status visible link-panel guard passed");
