import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createHash } from 'node:crypto';

const page = fs.readFileSync('app/page.tsx','utf8');
const tree = ts.createSourceFile('page.tsx',page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function find(predicate) {let found;function visit(n){if(predicate(n))found=n;else ts.forEachChild(n,visit);}visit(tree);return found;}
function fn(name){return find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name)?.getText(tree)||'';}
function declaration(name){return find(n=>ts.isVariableDeclaration(n)&&n.name.getText(tree)===name)?.getText(tree)||'';}
const effects=[];function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(tree)==='useEffect'&&/customerCopyButtonFeedback|customerCopyRequestRef/.test(n.arguments[0]?.getText(tree)||''))effects.push(n.arguments[0].getText(tree));ts.forEachChild(n,visit);}visit(tree);
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
function harness(){
 let time=0,id=0;const timers=new Map();
 const env={loadedBookingId:'11150',customerCopyText:'JEVAN MESSAGE',copyFeedback:null,customerCopyButtonFeedback:null,customerCopyRequestRef:{current:0},dispatchCopyLabels:{customerCopy:'Customer copy',jobCard:'Job card'},writes:[],Date:{now:()=>time},
 getDispatchCopyText:target=>target==='customerCopy'?env.customerCopyText:'JOB CARD',
 setCopyFeedback:v=>{env.copyFeedback=typeof v==='function'?v(env.copyFeedback):v;},
 setCustomerCopyButtonFeedback:v=>{env.customerCopyButtonFeedback=typeof v==='function'?v(env.customerCopyButtonFeedback):v;},
 window:{setTimeout:(cb,ms)=>{timers.set(++id,{cb,at:time+ms});return id;},clearTimeout:id=>timers.delete(id)},
 navigator:{clipboard:{writeText:async text=>{env.writes.push(text);}}}};
 const runtime=new Function('env',`with(env){${compile(fn('copyDispatchCopy')+'\n'+fn('copyCustomerCopy')+'\nreturn {copyDispatchCopy,copyCustomerCopy};')}}`)(env);
 const selector=['customerCopyFeedback','customerCopyButtonDisplayFeedback','customerCopyCopied'].map(declaration).filter(Boolean).map(s=>'const '+s+';').join('\n');
 const copied=()=>new Function('env',`with(env){${compile(selector+'\nreturn customerCopyCopied;')}}`)(env);
 let timerCleanup;
 const contextChanged=()=>{
   for(const effect of effects.filter(s=>s.includes('customerCopyRequestRef')))new Function('env',`with(env){${compile('const effect = '+effect+'; return effect();')}}`)(env);
 };
 const flush=()=>{timerCleanup?.();for(const effect of effects.filter(s=>!s.includes('customerCopyRequestRef')))timerCleanup=new Function('env',`with(env){${compile('const effect = '+effect+'; return effect();')}}`)(env);};
 const advance=ms=>{time+=ms;for(const [key,timer] of [...timers])if(timer.at<=time){timers.delete(key);timer.cb();}};
 return {env,...runtime,copied,flush,advance,contextChanged};
}
const h=harness();await h.copyCustomerCopy();h.flush();assert.equal(h.copied(),true);assert.deepEqual(h.env.writes,['JEVAN MESSAGE']);
h.advance(1999);assert.equal(h.copied(),true);h.advance(1);assert.equal(h.copied(),false,'Customer Copy must reset after two seconds');
await h.copyCustomerCopy();h.flush();h.advance(1000);await h.copyCustomerCopy();h.flush();h.advance(1000);assert.equal(h.copied(),true,'Old timeout must not clear a repeated copy');h.advance(1000);assert.equal(h.copied(),false);
for(const change of ['booking','message','clear']){
 const h=harness();await h.copyCustomerCopy();h.flush();
 if(change==='booking')h.env.loadedBookingId='11152';
 if(change==='message')h.env.customerCopyText='AMENDED MESSAGE';
 if(change==='clear'){h.env.loadedBookingId='';h.env.customerCopyText='';}
 assert.equal(h.copied(),false,change+' must immediately hide stale feedback');h.contextChanged();
 await h.copyCustomerCopy();assert.equal(h.env.writes.at(-1),h.env.customerCopyText,'Copy current text unchanged');
}
for(const reject of [false,true]){
 const h=harness();let finish;h.env.navigator.clipboard.writeText=()=>new Promise((resolve,rejectFn)=>{finish=reject?()=>rejectFn(Error('old failure')):resolve;});
 const pending=h.copyCustomerCopy();h.env.loadedBookingId='11152';h.env.customerCopyText='ROHAN MESSAGE';h.contextChanged();finish();await pending;assert.equal(h.env.customerCopyButtonFeedback,null,'Ignore stale clipboard completion');
}
const h2=harness();h2.env.navigator.clipboard.writeText=async()=>{throw Error('denied');};await h2.copyCustomerCopy();assert.equal(h2.env.customerCopyButtonFeedback.tone,'error');assert.equal(h2.copied(),false);
const h3=harness();await h3.copyDispatchCopy('jobCard');assert.equal(h3.env.copyFeedback.target,'jobCard');assert.equal(h3.env.customerCopyButtonFeedback,null,'Other Copy controls keep existing feedback');
const h4=harness();let first;h4.env.navigator.clipboard.writeText=()=>new Promise(resolve=>{first=resolve;});const pending=h4.copyCustomerCopy();h4.env.navigator.clipboard.writeText=async()=>{};await h4.copyCustomerCopy();const latest=h4.env.customerCopyButtonFeedback;first();await pending;assert.equal(h4.env.customerCopyButtonFeedback,latest,'Earlier completion must not replace latest copy');
// Preserve customer-safe generators, text selector, clipboard payload and app-link
// handler byte-for-byte except removal of its ordinary-Copy feedback writes.
// Baseline b01b7472 fingerprints avoid requiring Git history in a shallow CI checkout.
const block=(s,start,end)=>{
 const from=s.indexOf(start),to=s.indexOf(end,from);
 assert.ok(from>=0 && to>from,'Preservation block must exist: '+start);
 return s.slice(from,to);
};
const fingerprint=value=>createHash('sha256').update(value).digest('hex');
const preservedBlocks=[['  function getDispatchCopyText(', '  function getRenderableCopyEditState(', 'e160cde09cec3bd3180750fc1e841e05c4a2b204015a671f30cb33dd9ada9321'], ['  const customerCopyCard = useMemo(', '  const draftDriverDispatchCard = useMemo(', '799d950e8b4cef6176a4b7199cd13c3a1668093ea60267617323b3faba13c464'], ['  async function copyCustomerDriverDetailsWithCustomerAppLink(', '  function adminDriverJobLinkFailureMessage(', '224177f868b52ee398156a5662f25da86d6de78dd0eb94a0f76c394d9d5cf687']];
for(const [start,end,expected] of preservedBlocks)assert.equal(fingerprint(block(page,start,end)),expected,'Message generation, edited text selection and app-link workflow unchanged');
const portalStart='  async function copyCustomerDriverDetailsWithCustomerAppLink(';
const portalEnd='  function adminDriverJobLinkFailureMessage(';
assert.ok(!block(page,portalStart,portalEnd).includes('setCopyFeedback('),'App Link cannot mark ordinary Copy successful');
assert.match(fn('clearLoadedBookingSelectionContext'),/customerCopyRequestRef\.current \+= 1/,'Clear must invalidate pending clipboard work');
console.log('PASS: two-second reset, repeated copy, exact booking/text, Clear, delayed success/failure, out-of-order completion, unchanged message/app links and other Copy controls. Mock clipboard/timers only; no sends or database.');
