import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const read = file => fs.readFileSync(file, 'utf8');
const signIn = read('app/admin-sign-in/page.tsx');
const admin = read('app/page.tsx');
const customer = read('app/my-bookings/page.tsx');
assert.match(signIn, /<PrivacyPolicyDisclosure\s*\/>/, 'Admin sign-in must expose the policy without navigation');
assert.match(admin, /<PrivacyPolicyDisclosure\s*\/>/, 'Signed-in Admin must expose the same policy without signing out');
assert.match(customer, /aria-label="Customer privacy information"[\s\S]*?href="\/privacy"/);
const allowed = new Map();
function load(file) {
  const loaded = { exports: {} };
  const source = read(file);
  assert.doesNotMatch(source, /fetch\(|localStorage|sessionStorage|useEffect|onClick|dangerouslySetInnerHTML/);
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(js, { module: loaded, exports: loaded.exports, require: name => {
    if (name === 'react/jsx-runtime') return require(name);
    assert.ok(allowed.has(name), `Unexpected policy dependency: ${name}`);
    return allowed.get(name);
  } });
  return loaded.exports;
}
const content = load('app/privacy/policy-content.tsx');
allowed.set('./policy-content', content);
const disclosure = load('app/privacy/policy-disclosure.tsx');
const html = renderToStaticMarkup(disclosure.PrivacyPolicyDisclosure());
assert.match(html, /<summary[^>]*>Privacy Policy<\/summary>/);
assert.doesNotMatch(html, /<details[^>]*\sopen[\s=>]/);
assert.doesNotMatch(html, /<(a|form|button|input|iframe)\b/);
for (const text of ['Customer app information and its use', 'Admin app information and its use', 'Driver app information and its use', 'Request account and data deletion', 'info@prestigelimo.sg']) assert.ok(html.includes(text), text);
const body = renderToStaticMarkup(content.PrivacyPolicyContent());
assert.ok(html.includes(body), 'Admin displays the same complete shared policy body');
const publicPage = read('app/privacy/page.tsx');
assert.match(publicPage, /<PrivacyPolicyContent\s*\/>/);
assert.match(publicPage, /intro=\{privacyPolicyIntro\}/);
assert.match(publicPage, /eyebrow=\{privacyPolicyUpdated\}/);
if (process.env.PRIVACY_PROOF_HTML) {
  fs.writeFileSync(process.env.PRIVACY_PROOF_HTML, '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><title>Local shared privacy disclosure proof</title><style>body{font:16px/1.6 system-ui;max-width:600px;margin:24px auto;padding:16px}summary{cursor:pointer;font-weight:bold}section{margin:24px 0}</style></head><body>' + html + '</body></html>');
}
console.log('PASS shared policy rendering, signed-in/signed-out Admin placement, Customer link, no navigation or data effects. Local component proof only.');
