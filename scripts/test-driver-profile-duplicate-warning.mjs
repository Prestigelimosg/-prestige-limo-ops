import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const source = await fs.readFile("app/page.tsx", "utf8");
function section(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `Missing duplicate warning: ${start}`);
  return source.slice(a, b);
}
const calculation = section("  const driverProfilePossibleDuplicates = useMemo(", "  const filteredDrivers = useMemo(");
const plateStart = source.indexOf("value={driverProfileDraft.plateNumber}");
const labelStart = source.lastIndexOf("<label>", plateStart);
const labelEnd = source.indexOf("</label>", plateStart) + "</label>".length;
const plateLabel = source.slice(labelStart, labelEnd);
assert.ok(plateLabel.includes('data-driver-profile-duplicate-warning="true"'));
assert.ok(plateLabel.includes('role="status"'));
assert.ok(plateLabel.includes("Check name and contact."));
assert.ok(plateLabel.includes("text-xs"), "Keep the warning compact");
assert.ok(!/fetch\(|\.update\(|\.insert\(|setDriverProfileDraft/.test(calculation));

const drivers = [
  { id: 1, driver_name: "SYNTHETIC ONE", plate_number: "SBF1234A", availability_status: "available" },
  { id: 2, driver_name: "SYNTHETIC TWO", plate_number: "01234", availability_status: "inactive" },
  { id: 3, driver_name: "SYNTHETIC THREE", plate_number: "SGX1234", availability_status: "inactive" },
  { id: 4, driver_name: "SYNTHETIC FOUR", plate_number: "5678", availability_status: "available" },
];
const before = JSON.stringify(drivers);
const match = (plateNumber, driverId = "", rows = drivers) => JSON.parse(JSON.stringify(vm.runInNewContext(
  ts.transpileModule(calculation + "\ndriverProfilePossibleDuplicates", {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText,
  { drivers: rows, driverProfileDraft: { plateNumber, driverId }, clean: v => String(v ?? "").trim(), useMemo: f => f() },
)));
assert.deepEqual(match("1234").map(d => d.id), [1, 3]);
assert.deepEqual(match(" sbf 1234 a ").map(d => d.id), [1, 3]);
assert.deepEqual(match("1234", "1").map(d => d.id), [3], "Exclude only the selected record");
assert.deepEqual(match("01234").map(d => d.id), [2], "Leading zero is significant");
assert.deepEqual(match("0001234"), []);
assert.deepEqual(match("5678", "4"), []);
for (const value of ["", "SBF", "12A34", "12345", "123", "1234/5678"]) assert.deepEqual(match(value), [], value);
assert.deepEqual(match("1234", "", []), [], "No matches claimed before records load");
assert.equal(JSON.stringify(drivers), before);

// The warning must stay advisory: no new save gate, automatic merge or changed identity lookup.
const save = section("  async function saveDriverProfile()", "  function clearDeletedDriverIdFromBookingState");
assert.ok(!save.includes("driverProfilePossibleDuplicates"));
for (const text of ["Contact number already belongs to", "Plate number already belongs to", ".eq(\"id\", existingDriverId)", "saveFullDriverProfileRuntime("])
  assert.ok(save.includes(text), `Preserve existing save behavior: ${text}`);
assert.equal(source.split('data-driver-profile-duplicate-warning="true"').length - 1, 1);
console.log("Driver duplicate warning guard passed: plate digits, significant zeros, selected ID, inactive records and advisory-only behavior.");

if (process.argv.includes("--browser")) {
  const path = await import("node:path"), os = await import("node:os");
  const { createRequire } = await import("node:module");
  const { spawn } = await import("node:child_process");
  const { createChromeClient, waitForChromeDebugPort, waitForChromePageTarget, waitForCondition, terminateChildProcess } = await import("./browser-test-helpers.mjs");
  const require = createRequire(import.meta.url);
  const { webpack } = require("next/dist/compiled/webpack/webpack");
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "prestige-driver-duplicate-browser-"));
  let chrome, client;
  try {
    const entry = `
      const React=require('react');const {createRoot}=require('react-dom/client');
      const {useMemo}=React; const clean=v=>String(v??'').trim();
      const drivers=${JSON.stringify(drivers)};window.writes=[];
      window.fetch=()=>{window.writes.push('fetch');throw new Error('Unexpected request');};
      function App(){
        const [driverProfileDraft,setDriverProfileDraft]=React.useState({plateNumber:'',driverId:''});
        window.editDriver=(driverId)=>setDriverProfileDraft(v=>({...v,driverId}));
        ${calculation}
        return <form onSubmit={e=>e.preventDefault()} className="max-w-md p-3">${plateLabel}<button type="submit">Save Driver Profile</button></form>;
      }
      createRoot(document.getElementById('root')).render(<App/>);
    `;
    await fs.writeFile(path.join(temp,"entry.js"), ts.transpileModule(entry, {
      compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText);
    await new Promise((resolve,reject)=>webpack({ mode:"production",entry:path.join(temp,"entry.js"),
      output:{path:temp,filename:"bundle.js"},resolve:{modules:[path.resolve("node_modules")]},optimization:{minimize:false},
    },(error,stats)=>error||stats.hasErrors()?reject(error||new Error(stats.toString({all:false,errors:true}))):resolve()));
    const cssFiles=(await fs.readdir('.next/static',{recursive:true})).filter(n=>n.endsWith('.css'));
    assert.ok(cssFiles.length,'Production CSS required');
    const css=(await Promise.all(cssFiles.map(n=>fs.readFile('.next/static/'+n,'utf8')))).join('\n');
    await fs.writeFile(path.join(temp,'index.html'),'<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><div id="root"></div><script src="bundle.js"></script>');
    const port=Number(process.env.CHROME_DEBUG_PORT||9274);
    chrome=spawn(process.env.CHROME_BINARY||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
      '--headless=new','--disable-gpu','--disable-background-networking','--disable-extensions','--no-first-run','--no-default-browser-check',
      '--remote-debugging-port='+port,'--user-data-dir='+path.join(temp,'profile'),'about:blank'],{stdio:'ignore'});
    await waitForChromeDebugPort(port);
    const target=await waitForChromePageTarget(port);client=createChromeClient(target.webSocketDebuggerUrl);await client.ready;
    await client.send('Page.enable');await client.send('Runtime.enable');
    const errors=[];client.on('Runtime.exceptionThrown',e=>errors.push(e));
    const evaluate=async(expression)=>{const r=await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
      if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result?.value;};
    await client.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await client.send('Page.navigate',{url:'file://'+path.join(temp,'index.html')});
    await waitForCondition(()=>evaluate('!!document.querySelector("input")'),10000,'plate input');
    assert.equal(await evaluate('!!document.querySelector("[role=status]")'),false);
    const type=async value=>evaluate(`(()=>{const e=document.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await type('1234');
    await waitForCondition(()=>evaluate('document.querySelector("[role=status]")?.textContent.includes("SYNTHETIC THREE")'),5000,'duplicate warning');
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
    assert.equal(await evaluate('document.querySelector("button").disabled'),false);
    assert.equal(await evaluate('parseFloat(getComputedStyle(document.querySelector("[role=status]")).fontSize)<=12'),true);
    await type('01234');
    await waitForCondition(()=>evaluate('document.querySelector("[role=status]")?.textContent.includes("SYNTHETIC TWO")'),5000,'zero preserved');
    assert.equal(await evaluate('document.querySelector("[role=status]").textContent.includes("SYNTHETIC ONE")'),false);
    await evaluate('window.editDriver("2")');
    await waitForCondition(()=>evaluate('!document.querySelector("[role=status]")'),5000,'own record excluded');
    assert.deepEqual(await evaluate('window.writes'),[]);
    assert.deepEqual(errors,[]);
    console.log('Driver duplicate warning browser passed: actual plate input and warning at 390px, leading zero, selected-record exclusion, no writes.');
  } finally {client?.close();if(chrome)await terminateChildProcess(chrome);await fs.rm(temp,{recursive:true,force:true});}
}
