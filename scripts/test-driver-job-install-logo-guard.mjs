import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
const Image = require('next/image').default;
const source = fs.readFileSync('app/driver-job/[token]/page.tsx', 'utf8');
assert.match(source, /import driverAppIcon from "\.\.\/\.\.\/\.\.\/driver-companion\/assets\/icon.png"/);
const config = JSON.parse(fs.readFileSync('driver-companion/app.json', 'utf8'));
assert.equal(config.expo.ios.icon, './assets/icon.png', 'Reuse the real Driver app icon');
const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let section;
function visit(node) {
  if (ts.isJsxExpression(node) && node.expression?.getText(ast).startsWith('(androidBrowser || iosBrowser)') && node.getText(ast).includes('data-driver-beta-install')) section = node.expression;
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(section, 'Preserve existing mobile-browser/valid-job/native exclusion gate');
const compile = ts.transpileModule(`return (${section.getText(ast)});`, {compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText;
const androidUrl = source.match(/const driverBetaApkDownloadUrl = "([^"]+)"/)[1];
const iphoneUrl = source.match(/const driverBetaTestFlightUrl = "([^"]+)"/)[1];
const icon = {src:'/driver-icon-test.png',width:1024,height:1024};
function render({android=false,ios=false,native=false,kind='ready',appSetup=false}={}) {
  const vars = {React,Image,driverAppIcon:icon,androidBrowser:android,iosBrowser:ios,embeddedDriverApp:native,pageState:{kind},appOnlyAccountSetup:appSetup,token:'qa-private-token',driverBetaApkDownloadUrl:androidUrl,driverBetaTestFlightUrl:iphoneUrl};
  return renderToStaticMarkup(new Function(...Object.keys(vars),compile)(...Object.values(vars)));
}
for(const appSetup of [false,true]) for(const platform of ['ios','android']) {
  const html=render({[platform]:true,appSetup});
  assert.equal((html.match(/data-driver-app-logo="true"/g)||[]).length,1);
  assert.match(html,/alt="Prestige Driver app logo"/);
  assert.match(html,/width="56"/); assert.match(html,/height="56"/);
  assert.ok(html.includes('driver-icon-test.png'));
  assert.equal((html.match(/data-driver-beta-download="true"/g)||[]).length,1);
  assert.ok(html.includes((platform==='ios'?iphoneUrl:androidUrl).replaceAll('&','&amp;')));
  assert.match(html,/referrerPolicy="no-referrer"/);
  assert.match(html,/rel="noopener noreferrer"/);
  assert.match(html,/target="_blank"/);
  assert.equal(html.includes('intent://'),platform==='android');
}
for(const kind of ['loading','blocked']) assert.equal(render({ios:true,kind}),'');
assert.equal(render({ios:true,native:true}),'');
assert.equal(render({android:true,native:true}),'');
assert.equal(render(),'');
assert.doesNotMatch(section.getText(ast),/onClick|fetch\(|localStorage|sessionStorage/);
console.log('PASS actual install-section rendering: real Driver icon, iOS/Android links, both setup modes, blocked/loading/desktop/native exclusion, no added write handler.');
