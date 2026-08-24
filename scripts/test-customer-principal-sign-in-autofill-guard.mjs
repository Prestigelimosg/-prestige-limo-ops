import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const signInSource = read("app/customer-access/sign-in/page.tsx");
const preactivation = read("scripts/test-preactivation-verification-suite.mjs");

assert.match(
  preactivation,
  /scripts\/test-customer-principal-sign-in-autofill-guard\.mjs/,
  "The Customer sign-in AutoFill guard must stay in the preactivation suite.",
);
assert.match(signInSource, /const \[emailConfirmed, setEmailConfirmed\] = useState\(false\)/);
assert.match(signInSource, /data-customer-sign-in-email-step="true"/);
assert.match(signInSource, /autoComplete="email"/);
assert.match(signInSource, /autoCapitalize="none"/);
assert.match(signInSource, /autoCorrect="off"/);
assert.match(signInSource, /spellCheck=\{false\}/);
assert.match(signInSource, /data-customer-sign-in-credentials-step="true"/);
assert.match(signInSource, /autoComplete="current-password"/);
assert.match(signInSource, /inputMode="numeric"/);
assert.match(signInSource, /Continue/);
assert.match(signInSource, /Change email/);
assert.match(
  signInSource,
  /if \(!email\.trim\(\)\)[\s\S]{0,500}setEmailConfirmed\(true\)/,
  "Email Continue must validate locally and advance without a request.",
);
assert.match(
  signInSource,
  /function changeEmail\(\)[\s\S]{0,900}setPin\(""\)[\s\S]{0,900}setCode\(""\)[\s\S]{0,900}setChallengeId\(""\)[\s\S]{0,900}setMode\("login"\)[\s\S]{0,900}setEmailConfirmed\(false\)/,
  "Change email must clear only the unsaved credential/challenge state and return to the email step.",
);
const emailStepSource = signInSource
  .split('data-customer-sign-in-email-step="true"')[1]
  ?.split(") : (")[0] || "";
assert.doesNotMatch(
  emailStepSource,
  /type="password"/,
  "The email-entry stage must not mount a Password/PIN control for iOS AutoFill to classify together.",
);

console.log("Customer principal sign-in email-first AutoFill guard passed.");
