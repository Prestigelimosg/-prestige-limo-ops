// Actual Pool component, synthetic transport only: discoverability, loading and multi-selection.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { createChromeClient, waitForChromeDebugPort, waitForChromePageTarget, waitForCondition, terminateChildProcess } from './browser-test-helpers.mjs';
const require = createRequire(import.meta.url);
const { webpack } = require('next/dist/compiled/webpack/webpack');
const dir = await mkdtemp('/private/tmp/prestige-assignment-picker-');
const options = { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true };
let client, chrome, server;
try {
  const source = await readFile('app/admin-driver-assignment-picker.tsx', 'utf8');
  await writeFile(path.join(dir, 'picker.js'), ts.transpileModule(source, { compilerOptions: options }).outputText);
  const entry = `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{AdminDriverAssignmentPicker}from'./picker';
    const roster=Array.from({length:405},(_,i)=>({id:i+1,driver_name:'QA Driver '+String(i+1).padStart(3,'0'),contact_number:'+65 8000 '+String(i+1).padStart(4,'0'),plate_number:'QA'+(i+1),vehicle_type:i===404?'VVV':'AVF',availability_status:'available'}));
    window.picker={loads:0,fail:location.pathname==='/failure',writes:[],reads:[],rankFail:location.pathname==='/rank-failure'};
    window.fetch=async(url,init={})=>{window.picker.reads.push(String(url));if(init.method!=='GET')throw Error('Only GET allowed');if(window.picker.rankFail)return Response.json({ok:false},{status:503});return Response.json({ok:true,window_days:90,frequent_drivers:[{driver_id:405,job_count:30},{driver_id:300,job_count:20}]});};
    function App(){const[drivers,setDrivers]=useState([]),[value,setValue]=useState(location.pathname==='/saved'?'saved:999':''),[loading,setLoading]=useState(false);
      return <main className="p-2"><div className="max-w-md"><AdminDriverAssignmentPicker drivers={drivers} value={value} savedLabel={value==='saved:999'?'Saved: Old Driver (inactive)':''} loading={loading}
      onLoad={async()=>{window.picker.loads++;setLoading(true);await new Promise(r=>setTimeout(r,100));setLoading(false);if(window.picker.fail)return false;setDrivers(location.pathname==='/empty'?[]:roster);return true;}}
      onChange={id=>{window.picker.writes.push(id);setValue(id)}} matchesSearch={(driver,query)=>[driver.driver_name,driver.plate_number,driver.contact_number,driver.vehicle_type].some(v=>v.toLowerCase().includes(query.toLowerCase()))}/></div><button id="outside">Outside</button></main>}
    createRoot(document.getElementById('root')).render(<App/>);`;
  await writeFile(path.join(dir, 'entry.js'), ts.transpileModule(entry, { compilerOptions: options }).outputText);
  await new Promise((resolve, reject) => webpack({ mode: 'development', entry: path.join(dir, 'entry.js'), resolve: { modules: [path.join(process.cwd(), 'node_modules')] }, output: { path: dir, filename: 'bundle.js' } }, (error, stats) => error || stats.hasErrors() ? reject(error || Error(stats.toString({ all: false, errors: true }))) : resolve()));
  const bundle = await readFile(path.join(dir, 'bundle.js'));
  const css = (await postcss([tailwind()]).process(await readFile('app/globals.css', 'utf8'), { from: 'app/globals.css' })).css;
  server = createServer((req, res) => { res.setHeader('Content-Type', req.url === '/bundle.js' ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');res.end(req.url === '/bundle.js' ? bundle : `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const port = Number(process.env.CHROME_DEBUG_PORT || 9252);
  chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new','--disable-gpu','--disable-background-networking','--no-first-run',`--user-data-dir=${path.join(dir,'chrome')}`,`--remote-debugging-port=${port}`,'about:blank'],{stdio:'ignore'});
  await waitForChromeDebugPort(port);client=createChromeClient((await waitForChromePageTarget(port)).webSocketDebuggerUrl);await client.ready;await client.send('Page.enable');await client.send('Runtime.enable');
  const errors=[];client.on('Runtime.exceptionThrown',e=>errors.push(e.exceptionDetails.text));
  const evaluate=async(expression)=>{const r=await client.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;};
  const wait=expr=>waitForCondition(()=>evaluate(expr),4000,expr);
  const navigate=async(route)=>{await client.send('Page.navigate',{url:origin+route});await wait('Boolean(window.picker)');};
  const click=label=>evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Missing enabled button');b.click()})()`);
  const open=async()=>{await evaluate(`document.querySelector('[data-driver-assignment-trigger]').click()`);await wait(`!document.body.innerText.includes('Loading drivers…')`);};
  const fill=async(value)=>{await evaluate(`(()=>{const el=document.querySelector('[aria-label="Search assignment drivers"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);};
  for(const width of [390,412,1280]){
    await client.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});
    await navigate('/');await open();
    await wait(`document.querySelectorAll('[data-driver-id]').length===20`);
    assert.equal(await evaluate(`document.querySelector('[data-driver-id]').dataset.driverId`),'405');
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'No horizontal overflow');
    assert.equal(await evaluate('window.picker.loads'),1);
    const screenshot=await client.send('Page.captureScreenshot',{format:'png'});
    await writeFile('/private/tmp/driver-assignment-search-'+width+'.png',Buffer.from(screenshot.data,'base64'));
    assert.deepEqual(await evaluate('window.picker.writes'),[],'Opening must not assign');
    await fill('QA Driver 250');await wait(`document.querySelectorAll('[data-driver-id]').length===1`);
    assert.equal(await evaluate(`document.querySelector('[data-driver-id]').dataset.driverId`),'250','Search reaches beyond top 20');
    await fill('QA405');await wait(`document.querySelector('[data-driver-id]')?.dataset.driverId==='405'`);
    await fill('8000 0300');await wait(`document.querySelector('[data-driver-id]')?.dataset.driverId==='300'`);
    await fill('VVV');await wait(`document.querySelector('[data-driver-id]')?.dataset.driverId==='405'`);
    await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});
    await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    await wait(`document.querySelector('[data-driver-assignment-trigger]').value==='405'`);
    assert.deepEqual(await evaluate('window.picker.writes'),['405']);
    await open();await fill('No such driver');await wait(`document.body.innerText.includes('No drivers match')`);
    await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await wait(`!document.querySelector('[role=listbox]')`);
    assert.equal(await evaluate(`document.querySelector('[data-driver-assignment-trigger]').value`),'405','Search/Escape preserves selection');
    await open();await evaluate(`document.querySelector('#outside').focus()`);await wait(`!document.querySelector('[role=listbox]')`);
    await open();await click('Select driver');await wait(`document.querySelector('[data-driver-assignment-trigger]').value===''`);
    console.log('PASS '+width+'px top 20, all 405 searchable, keyboard selection, clear, Escape/outside close, no overflow');
  }
  await navigate('/failure');await open();await wait(`document.body.innerText.includes('Drivers could not load.')`);
  assert.equal(await evaluate(`document.querySelector('[role=option]').disabled`),true);
  await evaluate('window.picker.fail=false');await click('Retry loading drivers');await wait(`document.querySelectorAll('[data-driver-id]').length===20`);
  assert.equal(await evaluate('window.picker.loads'),2);
  await navigate('/rank-failure');await open();await wait(`document.body.innerText.includes('Frequent list unavailable')`);
  await fill('QA Driver 405');await wait(`document.querySelector('[data-driver-id]')?.dataset.driverId==='405'`);
  await navigate('/saved');await open();await fill('nothing');await evaluate(`document.querySelector('#outside').focus()`);
  assert.equal(await evaluate(`document.querySelector('[data-driver-assignment-trigger]').value`),'saved:999');
  assert.equal(await evaluate(`document.querySelector('[data-driver-assignment-trigger]').textContent.includes('inactive')`),true);
  await navigate('/empty');await open();await wait(`document.body.innerText.includes('No drivers available.')`);
  assert.deepEqual(errors,[]);
  console.log('Driver assignment picker browser passed; no live backend requests or assignments.');
} finally {
  if(client)client.close();
  if(chrome)await terminateChildProcess(chrome);
  if(server)await new Promise(resolve=>server.close(resolve));
  await rm(dir,{recursive:true,force:true});
}
