import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

// Execute the actual component with isolated hook instances and a shared document.
// A remount discards refs/state just as React does, without calling any live API.
const source = await readFile("app/driver-job/driver-account-activation.tsx", "utf8");
const code = ts.transpileModule(source, { compilerOptions: {
  jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText;
const token = "a".repeat(64), otherToken = "b".repeat(64);
const installation = "11111111-1111-4111-8111-111111111111";
const draft = () => ({ setupId: "22222222-2222-4222-8222-222222222222",
  email: "synthetic@example.test", password: "123456", activated: false,
  jobUrl: `https://app.test/driver-job/${token}` });
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function fixture({ injected = draft(), respond } = {}) {
  let active;
  const calls = [], messages = [], timers = new Map();
  const w = { location: { origin: "https://app.test" },
    __PRESTIGE_DRIVER_INSTALLATION_ID__: installation,
    __PRESTIGE_DRIVER_ACCOUNT_ACTIVATION__: injected,
    ReactNativeWebView: { postMessage: value => messages.push(JSON.parse(value)) } };
  const hooks = {
    useState(initial) {
      const owner = active, index = owner.index++;
      if (!(index in owner.cells)) owner.cells[index] = initial;
      return [owner.cells[index], value => { owner.cells[index] = typeof value === "function" ? value(owner.cells[index]) : value; }];
    },
    useRef(initial) {
      const owner = active, index = owner.index++;
      return owner.cells[index] ??= { current: initial };
    },
    useEffect(fn, deps) {
      const owner = active, index = owner.index++, old = owner.cells[index];
      if (!old || deps.some((v, i) => v !== old.deps[i])) {
        owner.effects.push(() => { old?.cleanup?.(); owner.cells[index] = { deps, cleanup: fn() }; });
      }
    },
  };
  const jsx = (type, props) => ({ type, props });
  const context = { exports: {}, window: w, URL, AbortController,
    setTimeout: fn => { const id = {}; timers.set(id, fn); return id; },
    clearTimeout: id => timers.delete(id),
    fetch: async (url, options) => {
      const call = { url, body: JSON.parse(options.body), signal: options.signal };
      calls.push(call);
      if (respond) return respond(call);
      return { ok: true, json: async () => ({ ok: true, account_ready: false }) };
    },
    require: name => name === "react" ? hooks : name === "react/jsx-runtime" ? { jsx, jsxs: jsx } : assert.fail(name),
  };
  vm.runInNewContext(code, context);
  function mount(props = {}) {
    const ready = [], instance = { cells: [], effects: [], index: 0 };
    let current = { token, acknowledged: false, onReady: value => ready.push(value), ...props };
    const render = (next = {}) => {
      current = { ...current, ...next }; instance.index = 0; active = instance;
      instance.tree = context.exports.DriverAccountActivation(current);
      for (const effect of instance.effects.splice(0)) effect();
      return instance.tree;
    };
    const unmount = () => instance.cells.forEach(cell => cell?.cleanup?.());
    render();
    return { render, unmount, ready, get tree() { return instance.tree; } };
  }
  const buttons = tree => [tree, ...Object.values(tree?.props || {}).flat(Infinity)]
    .flatMap(item => item?.type === "button" ? [item] : item && item !== tree && typeof item === "object" ? buttons(item) : []);
  return { w, calls, messages, timers, mount, retry(instance) {
    instance.render(); const button = buttons(instance.tree).find(b => b.props.children === "Check activation");
    assert.ok(button, "Recovery must use the existing Check activation control");
    button.props.onClick(); instance.render();
  } };
}

// Primary reproduced failure: successful activation, discarded component, no native reinjection.
let f = fixture(), page = f.mount(); await tick();
assert.deepEqual(page.ready, [false]); page.unmount();
page = f.mount(); await tick();
assert.deepEqual(page.ready, [false], "A remount must recover the exact verified setup instead of locking ACK forever");
assert.equal(f.calls[1].body.action, "resume");
assert.equal(f.calls[1].body.password, undefined);
assert.equal(f.calls[1].body.email, undefined);
assert.equal(f.w.__PRESTIGE_DRIVER_ACCOUNT_ACTIVATION__, undefined);

// A new document cannot acquire proof from the prior document's module lifetime.
const freshDocument = fixture({ injected: null });
const freshPage = freshDocument.mount(); await tick();
assert.deepEqual(freshPage.ready, []); assert.equal(freshDocument.calls.length, 0);
freshDocument.retry(freshPage); await tick(); assert.deepEqual(freshPage.ready, []);

// A remount while activation is pending must share one request, including late success.
let finish;
f = fixture({ respond: () => new Promise(resolve => { finish = resolve; }) });
const oldPage = f.mount(); oldPage.unmount(); page = f.mount();
assert.equal(f.calls.length, 1, "Remount must not start another Auth attempt");
finish({ ok: true, json: async () => ({ ok: true, account_ready: false }) }); await tick();
assert.deepEqual(oldPage.ready, []); assert.deepEqual(page.ready, [false]);
page.render({ acknowledged: true }); await tick();
assert.equal(f.calls[1].body.action, "resume");
assert.equal(f.calls[1].body.password, undefined);

// Missing injection must fail visibly, and the same control can pick up a late native draft.
f = fixture({ injected: null }); page = f.mount(); await tick();
assert.deepEqual(page.ready, []); assert.equal(f.calls.length, 0);
f.w.__PRESTIGE_DRIVER_ACCOUNT_ACTIVATION__ = draft(); f.retry(page); await tick();
assert.deepEqual(page.ready, [false]);

// A different job, phone or setup must never inherit a completed activation.
for (const change of ["job", "phone", "setup"]) {
  f = fixture(); page = f.mount(); await tick(); page.unmount();
  if (change === "phone") f.w.__PRESTIGE_DRIVER_INSTALLATION_ID__ = "other-phone";
  if (change === "setup") f.w.__PRESTIGE_DRIVER_ACCOUNT_ACTIVATION__ = { ...draft(), jobUrl: `https://app.test/driver-job/${otherToken}` };
  page = f.mount(change === "job" ? { token: otherToken } : {}); await tick();
  assert.deepEqual(page.ready, [], change + " must stay closed");
  assert.equal(f.calls.length, 1, change + " must not reuse another setup");
  f.retry(page); await tick(); assert.deepEqual(page.ready, []);
}

// A late result from a replaced setup cannot complete the new setup or notify native.
const finishes = [];
f = fixture({ respond: () => new Promise(resolve => finishes.push(resolve)) });
page = f.mount(); page.unmount();
f.w.__PRESTIGE_DRIVER_ACCOUNT_ACTIVATION__ = { ...draft(), setupId: "33333333-3333-4333-8333-333333333333" };
page = f.mount();
finishes[0]({ ok: true, json: async () => ({ ok: true, account_ready: true }) }); await tick();
assert.deepEqual(page.ready, []); assert.equal(f.messages.length, 0);
finishes[1]({ ok: true, json: async () => ({ ok: true, account_ready: false }) }); await tick();
assert.deepEqual(page.ready, [false]); assert.equal(f.messages.length, 1);

// A rejected/revoked link and an interrupted request remain locked with visible recovery.
f = fixture({ respond: async () => ({ ok: false, json: async () => ({ ok: false, error: "Link revoked" }) }) });
page = f.mount(); await tick(); f.retry(page); await tick(); assert.deepEqual(page.ready, []);
f = fixture({ respond: call => new Promise((_, reject) => call.signal?.addEventListener("abort", () => reject(Error("timeout")))) });
page = f.mount();
assert.equal(f.timers.size, 1, "A hung request must have a bounded timeout");
for (const expire of [...f.timers.values()]) expire(); await tick();
f.retry(page); assert.equal(f.calls.length, 2); assert.deepEqual(page.ready, []);
assert.ok(!/localStorage|sessionStorage/.test(source), "Activation proof must not enter browser storage");
console.log("PASS activation recovery: remount, in-flight deduplication, PIN-free resume, late injection, exact job/device isolation, revoked link and bounded timeout.");
