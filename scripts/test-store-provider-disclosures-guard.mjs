import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const files = [
  ["app/privacy/policy-content.tsx", "Maps, app updates and optional processing", "77b52e21adfa2c48256b1f133e6a330916b30dc60c2b6b13a194e882134303a7"],
  ["app/terms/page.tsx", "Google Maps in Admin and Customer", "ad51a1b25988c1312d9111585de6229ab0b726f276e2cc918bdecc7b954b8721"],
];
function load(file) {
  const source = fs.readFileSync(file, "utf8");
  assert.doesNotMatch(source, /fetch\(|useEffect|localStorage|sessionStorage|onClick|dangerouslySetInnerHTML|<iframe|<form/);
  const loaded = { exports: {} };
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    reportDiagnostics: true,
  });
  assert.equal(output.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  vm.runInNewContext(output.outputText, { module: loaded, exports: loaded.exports, require: name => {
    if (name === "react/jsx-runtime") return require(name);
    if (name === "../public-information-shell") return { PublicInformationShell: ({ children }) => createElement("main", null, children) };
    assert.fail(`Unexpected text-page dependency: ${name}`);
  }});
  return loaded.exports;
}
for (const [file, heading, baselineHash] of files) {
  const source = fs.readFileSync(file, "utf8");
  const sections = source.match(/      <section>[\s\S]*?      <\/section>\n\n/g) || [];
  const added = sections.filter(section => section.includes(heading));
  assert.equal(added.length, 1, `Missing exactly one disclosure section: ${heading}`);
  const restored = source.replace(added[0], "");
  assert.equal(createHash("sha256").update(restored).digest("hex"), baselineHash,
    "Only the approved static section may be added; preserve all existing Driver/Calendar/deletion text");
  assert.doesNotMatch(added[0], /<(a|button|input|form|iframe)\b/, "No new native navigation or controls");
}
const policy = load(files[0][0]);
const html = renderToStaticMarkup(policy.PrivacyPolicyContent());
for (const phrase of ["Google Maps", "IP address", "fatal error", "OpenAI", "https://policies.google.com/privacy", "https://www.google.com/help/terms_maps/"]) {
  assert.ok(html.includes(phrase), `Rendered policy missing ${phrase}`);
}
const terms = renderToStaticMarkup(load(files[1][0]).default());
assert.ok(terms.includes("Google Maps/Google Earth"));
assert.ok(terms.includes("https://policies.google.com/privacy"));
console.log("PASS provider disclosures render; existing policy/Calendar/deletion source preserved; no effects, navigation or record access added.");
