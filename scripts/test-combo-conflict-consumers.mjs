// Execute the existing error branches; no database, provider or credential access.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const asRecord=x=>x&&typeof x==='object'?x:{};
const text=x=>typeof x==='string'?x:'';
function branch(file,predicate){
  const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
  const matches=[];
  function visit(n){if(predicate(n,source))matches.push(n.getText(source));ts.forEachChild(n,visit);}
  visit(source);assert.equal(matches.length,1,file+' must select one actual error handler');return matches[0];
}
const pool=branch('lib/driver-pool-fast-accept.ts',n=>ts.isFunctionDeclaration(n)&&n.name?.text==='classify');
const reassignment=branch('lib/admin-booking-supabase-adapter.ts',(n,s)=>ts.isIfStatement(n)&&n.expression.getText(s)==='error'&&n.getText(s).includes('const cancellationReasons:'));
const deletion=branch('lib/admin-saved-booking-delete.ts',(n,s)=>ts.isIfStatement(n)&&n.expression.getText(s)==='error'&&n.getText(s).includes('error.code === "55000"'));
const link=branch('lib/admin-driver-job-link-persistence.ts',(n,s)=>ts.isIfStatement(n)&&n.expression.getText(s)==='applied.error'&&n.getText(s).includes('const conflict ='));
function execute(code,error,cancellation=false){
  const js=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const safe=(message,status)=>({ok:false,error:message,status});
  return new Function('error','applied','asRecord','text','textOrNull','safeAdapterFailure','safeDatabaseFailure','safeUpdateConflictError','safeUpdateError','safeDeleteError','safeDriverJobLinkCreateError','cancellation',js)(
    error,{error},asRecord,text,text,safe,safe,'Reload before updating.','Update unavailable.','Delete unavailable.','Link unavailable.',cancellation);
}
for(const [label,code]of [['Pool',pool+'\nreturn classify(error);'],['Reassignment',reassignment],['Deletion',deletion],['Link',link]]){
  const old=execute(code,{code:'40001',message:'private diagnostic'});
  const corrected=execute(code,{code:'PT409',message:'private diagnostic'});
  assert.equal(corrected.status,409,label+' must preserve its conflict response');
  assert.deepEqual(corrected,old,label+' must retain the exact existing safe feedback');
  assert.ok(!JSON.stringify(corrected).includes('private diagnostic'));
  assert.deepEqual(execute(code,{code:'PT409'},true),execute(code,{code:'40001'},true));
  assert.ok(execute(code,{code:'XX000'}).status>=500,label+' must not hide unrelated server failures');
}
console.log('PASS PT409 preserves existing Pool, reassignment, deletion and link conflict status/feedback; unrelated failures and privacy remain unchanged.');
