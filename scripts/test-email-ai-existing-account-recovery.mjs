import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile('app/page.tsx', 'utf8');
const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['loadAdminEmailAiCustomerProfileRecommendation', 'adminEmailAiRecommendationEmail', 'adminEmailAiRecommendationCompanyName', 'adminEmailAiRecommendationBookerName', 'saveCrmComparableIdentityValue', 'adminDispatchVerifiedIdentityId'];
const extracted = [];
function visit(node) {
  if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) extracted.push(node.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
assert.equal(extracted.length, names.length);
const code = ts.transpileModule(extracted.join('\n'), {compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
const company = {id:71,company_name:'Example Company',operations_email:'booker@example.test'};
const legacy = {id:15,company_id:71,booker_name:'Jordan, Lee',email:'booker@example.test',customer_id:null};
const linked = {id:33,company_id:71,booker_name:'Jordan Lee',email:null,customer_id:174};
const account = {customer_id:'174',verified_company_id:71,customer_folder_active:true,customer_account:'Example Company / Jordan Lee'};
async function run({emailBooker=legacy,nameBooker=linked,accounts=[account],draft={}}={}) {
  const reads=[];
  const context={URLSearchParams,clean:v=>String(v??'').trim(),normaliseEmail:v=>String(v??'').trim().toLowerCase(),isValidEmail:v=>/^[^@]+@[^@]+\.[^@]+$/.test(v),adminCompaniesCrmIdentityApiPath:'/companies',adminBookersApiPath:'/bookers',adminCustomerAccountsApiPath:'/accounts',adminLegacyDataPurpose:'admin-legacy-data',fetch:async(url,options)=>{
    assert.equal(options.method,'GET','Recommendations must never write');
    const parsed=new URL(url,'https://offline.invalid');reads.push(parsed.pathname+parsed.search);
    const data=parsed.pathname==='/companies'?{company}:parsed.pathname==='/accounts'?{accounts}:{booker:parsed.searchParams.has('email')?emailBooker:nameBooker};
    return {ok:true,json:async()=>({ok:true,...data})};
  }};
  vm.createContext(context);vm.runInContext(code,context);
  const result=await context.loadAdminEmailAiCustomerProfileRecommendation({bookerEmail:'booker@example.test',booker:'Jordan Lee',company:'',name:'Passenger One',...draft});
  return {result,reads};
}
const recovered=await run();
assert.equal(recovered.result.status,'matched','Unlinked legacy email record must not hide the linked existing Company + Booker account');
assert.equal(recovered.result.customerId,'174');assert.equal(recovered.result.bookerId,33);
assert.ok(recovered.reads.some(v=>v.includes('booker_name=Jordan+Lee')));
assert.equal((await run({draft:{name:'Different Passenger'}})).result.customerId,'174','Passenger cannot select the account');
assert.equal((await run({nameBooker:{...linked,customer_id:null}})).result.status,'unmatched');
assert.equal((await run({accounts:[{...account,customer_folder_active:false}]})).result.status,'unavailable');
assert.equal((await run({nameBooker:{...linked,company_id:99}})).result.status,'unmatched','Never cross Company boundaries');
assert.equal((await run({draft:{company:'Different Company'}})).result.status,'ambiguous');
const alreadyLinked=await run({emailBooker:{...linked,email:'booker@example.test'}});
assert.equal(alreadyLinked.result.status,'matched');
assert.ok(!alreadyLinked.reads.some(v=>v.includes('booker_name=')),'A linked email match must not be replaced by a same-name Booker');
const otherBooker=await run({emailBooker:{...linked,id:34,customer_id:175,email:'booker@example.test'},accounts:[{...account,customer_id:'175'}]});
assert.equal(otherBooker.result.customerId,'175','Same Company with another linked Booker remains another account');
assert.ok(source.includes('data-bookings-service={bookingId}'),'Expanded booking card must show saved service');
assert.match(source, /saveCrmBillingIdentityReview && !\(activeAdminEmailAiIntakeId && adminEmailAiCustomerProfileSuggestion\?\.status === "matched"\)/, 'An exact Email AI account suggestion must not also show the legacy passenger-based new-customer prompt');
console.log('Email AI existing Company + Booker recovery and booking service guard passed.');
