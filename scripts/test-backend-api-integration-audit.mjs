import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const apiRoot = path.join(process.cwd(), "app/api");
const auditPath = path.join(process.cwd(), "docs/backend-api-integration-audit.md");

async function routeFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await routeFiles(fullPath)));
    } else if (entry.name === "route.ts") {
      files.push(fullPath);
    }
  }

  return files;
}

function routePathForFile(filePath) {
  const relativePath = path.relative(apiRoot, path.dirname(filePath));

  return `/api/${relativePath.split(path.sep).join("/")}`;
}

const [auditText, files] = await Promise.all([readFile(auditPath, "utf8"), routeFiles(apiRoot)]);
const routes = files.map(routePathForFile).sort();

assert.ok(routes.length > 0, "Expected API routes to audit.");

for (const route of routes) {
  assert.ok(auditText.includes(`\`${route}\``), `Expected audit doc to include ${route}.`);
}

for (const requiredBoundary of [
  "No Supabase migration apply without explicit approval.",
  "No broad production writes.",
  "No invoice generation",
  "No Telegram",
  "No customer auth activation",
  "No parser learning",
]) {
  assert.ok(
    auditText.includes(requiredBoundary),
    `Expected audit doc to keep blocked boundary: ${requiredBoundary}`,
  );
}

console.log(`Backend API integration audit covers ${routes.length} API routes.`);
