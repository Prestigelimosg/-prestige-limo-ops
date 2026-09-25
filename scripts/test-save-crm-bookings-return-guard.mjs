import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';

const source = fs.readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const tree = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(predicate) { let result; function visit(n) { if (predicate(n)) result=n; else ts.forEachChild(n,visit); } visit(tree); return result; }
function fn(name) { return find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name)?.getText(tree)||''; }
const save = fn('saveBooking');
const tail = save.slice(save.indexOf('const primarySavedBooking ='), save.indexOf('    } catch (error) {', save.indexOf('const primarySavedBooking =')));
export const runtime = ts.transpileModule([
  fn('adminDispatchVerifiedIdentityId'), fn('adminSaveCrmPostSuccessFormAction'), fn('adminBookingFormSyncSignature'), fn('singaporePickupDateTimePartsFromTimestamp'),
  fn('openSavedBookingInBookings'),
  'async function finishSave() {', tail, '}',
  'return {finishSave};',
].join('\n'), {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const focusEffect=find(n=>ts.isCallExpression(n)&&n.expression.getText(tree)==='useEffect'&&n.arguments[0]?.getText(tree).includes('savedBookingListFocusAppliedRef.current === savedBookingListFocus'));
const filterMemo=find(n=>ts.isVariableDeclaration(n)&&n.name.getText(tree)==='filteredRecentBookings');
export const focusRuntime=ts.transpileModule(`return (${focusEffect.arguments[0].getText(tree)})();`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const filterRuntime=ts.transpileModule(`${fn('singaporePickupDateTimePartsFromTimestamp')};return (${filterMemo.initializer.arguments[0].getText(tree)})();`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
export function makeHarness(runtime, options={}) {
  const record={booking_reference:'QA-EXACT',public_booking_reference:'99001',pickup_at:'2030-10-01T17:00:00Z',driver_id:null,status:'draft'};
  const form={name:'QA PASSENGER',date:'2030-10-02',time:'0100',pickup:'QA START',dropoff:'QA END'};
  const env={
    clean:v=>String(v??'').trim(),savedBookings:[{record,bookingValue:form}],customerReturnUrl:'',
    saved:[],activeTab:'dispatch',activeTabRef:{current:'dispatch'},bookingFormRef:{current:form},
    saveContextRevision:1,driverJobLinkFormContextRevisionRef:{current:1},saveBookingMessage:'RAW',bookingMessageRef:{current:{value:'RAW'}},
    bookingForSave:form,saveOriginTab:'dispatch',saveFormSignature:JSON.stringify(form),
    savedBookingListFocusAppliedRef:{current:''},driverJobLinkHandoffFocusAppliedRef:{current:''},lastSuccessfulBookingSaveRef:{current:null},resolvedBillingIdentityAccountOverride:'',
    markAdminBookingAsActiveForUpdates:()=>{},setAdminCustomerAccountCollisionReview:()=>{},
    setDriverJobLinkHandoffReference:()=>{},setDispatchLoadFocusTarget:()=>{},
    getBookingSaveGuardKey:()=>'',completeActiveAdminEmailAiReviewAfterSave:async()=>{},
    adminBookingCalendarReadyForRealSync:()=>!options.skipped,
    autoSyncSavedBookingGoogleCalendar:async()=>{if(env.beforeCalendar)await env.beforeCalendar();return{ok:!options.calendarFailed,message:options.calendarFailed?'Calendar failed':'Calendar saved'};},
    adminNativePushIsSupported:()=>!!options.native,formatAdminBookingPickupDateTime:()=>true,
    resetAdminBookingFormAfterSuccessfulPersistence:()=>{env.resetCount++;},retainSavedBookingForDriverJobLinkHandoff:()=>{env.retainCount++;},
    returnToCustomerFolderAfterSave:()=>{env.customerReturns++;},resetCount:0,retainCount:0,customerReturns:0,
    adminBookingPersistenceRecordToCalendarBookingRecord:r=>({...r}),
    bookingRecordBelongsInCompletedHistoryAfterAdminConfirmation:()=>!!options.earlier,
    upsertLoadedBookingFromAdminRecord:r=>env.saved.push(r),
    ...options.env,
  };
  for (const [setter,key] of Object.entries({setMessage:'message',setBookingSaveMessage:'saveMessage',setAdminBookingPersistenceMessage:'persistenceMessage',setActiveTab:'activeTab',setBookingsSelectedDate:'date',setBookingsShowUpcoming:'upcoming',setBookingsSearchTerm:'search',setBookingsUpcomingPage:'page',setCompletedMonthFilter:'month',setCompletedSearchTerm:'completedSearch',setSavedBookingListFocus:'focus'})) env[setter]=value=>{env[key]=typeof value==='function'?value(env[key]):value;};
  return {env,...new Function('env',`with(env){${runtime}}`)(env)};
}
export async function checks() {
  for(const native of [false,true])for(const driver_id of [null,15]) {
    const h=makeHarness(runtime,{native});h.env.savedBookings[0].record.driver_id=driver_id;
    await h.finishSave();
    assert.equal(h.env.activeTab,'bookings','Successful Save + CRM must open existing Bookings');
    assert.equal(h.env.date,'2030-10-02','Use saved Singapore date, not UTC or draft date');
    assert.equal(h.env.upcoming,false);assert.equal(h.env.search,'');assert.equal(h.env.page,1);
    assert.equal(h.env.focus,'QA-EXACT');assert.match(h.env.saveMessage.text,/auto-synced/);
    assert.equal(h.env.saved.length,1);
  }
  const failed=makeHarness(runtime,{calendarFailed:true});await failed.finishSave();assert.equal(failed.env.activeTab,'dispatch');assert.equal(failed.env.resetCount,0);assert.match(failed.env.saveMessage.text,/Calendar failed/);
  const failedReturn=makeHarness(runtime,{calendarFailed:true,env:{customerReturnUrl:'/customers/qa'}});await failedReturn.finishSave();assert.equal(failedReturn.env.customerReturns,0);
  const customer=makeHarness(runtime,{env:{customerReturnUrl:'/customers/qa'}});await customer.finishSave();assert.equal(customer.env.customerReturns,1);assert.equal(customer.env.focus,undefined);
  const skipped=makeHarness(runtime,{skipped:true});await skipped.finishSave();assert.equal(skipped.env.activeTab,'bookings');assert.match(skipped.env.saveMessage.text,/Calendar skipped/);
  const invalid=makeHarness(runtime);invalid.env.savedBookings[0].record.pickup_at=null;await invalid.finishSave();assert.equal(invalid.env.activeTab,'dispatch','Unknown saved date must not guess a destination');assert.equal(invalid.env.resetCount,0);
  const earlier=makeHarness(runtime,{earlier:true});await earlier.finishSave();assert.equal(earlier.env.activeTab,'completed');assert.equal(earlier.env.month,'all');assert.equal(earlier.env.completedSearch,'');assert.equal(earlier.env.focus,'QA-EXACT');
  const multiple=makeHarness(runtime);multiple.env.savedBookings.push({record:{...multiple.env.savedBookings[0].record,booking_reference:'QA-RETURN',pickup_at:'2030-10-03T10:00:00Z'},bookingValue:multiple.env.bookingForSave});await multiple.finishSave();assert.equal(multiple.env.saved.length,2);assert.equal(multiple.env.focus,'QA-EXACT');assert.equal(multiple.env.saveMessage.bookingNotices.length,2);
  for(const change of ['draft','raw','context','tab']) {
    const h=makeHarness(runtime);h.env.beforeCalendar=()=>{if(change==='draft')h.env.bookingFormRef.current={...h.env.bookingForSave,name:'NEXT JOB'};if(change==='raw')h.env.bookingMessageRef.current.value='NEW RAW';if(change==='context')h.env.driverJobLinkFormContextRevisionRef.current=2;if(change==='tab')h.env.activeTabRef.current='drivers';};await h.finishSave();assert.equal(h.env.resetCount,0,`Preserve newer ${change}`);assert.equal(h.env.retainCount,0);assert.equal(h.env.focus,undefined);
  }
  const focusEnv={savedBookingListFocus:'QA-EXACT',savedBookingListFocusAppliedRef:{current:''},activeTab:'bookings',clean:v=>v,adminUpcomingBookingsPageSize:20,bookingsUpcomingCurrentPage:1,filteredRecentBookingDisplayItems:Array.from({length:45},(_,i)=>({bookingRecord:{booking_reference:i===43?'QA-EXACT':`QA-${i}`}})),scrolls:0};
  focusEnv.setBookingsUpcomingPage=page=>{focusEnv.bookingsUpcomingCurrentPage=page;};
  focusEnv.document={querySelector:()=>({scrollIntoView:()=>focusEnv.scrolls++})};
  const focus=()=>new Function('env',`with(env){${focusRuntime}}`)(focusEnv);
  focus();assert.equal(focusEnv.bookingsUpcomingCurrentPage,3);assert.equal(focusEnv.scrolls,0);
  focus();assert.equal(focusEnv.scrolls,1);focus();assert.equal(focusEnv.scrolls,1,'Polling must not repeatedly jump the view');
  const filterEnv={clean:v=>String(v??'').trim(),operationalBookings:[{booking_reference:'QA-EXACT',pickup_at:'2030-10-01T17:00:00Z'}],bookingRecordBelongsInCompletedHistoryAfterAdminConfirmation:()=>false,bookingsShowUpcoming:false,bookingsSelectedDate:'2030-10-02',bookingsSearchTerm:'',bookingMatchesLocalSearch:()=>true,getBookingDateKey:()=>{throw Error('Canonical date must use Singapore');}};
  assert.equal(new Function('env',`with(env){${filterRuntime}}`)(filterEnv).length,1,'Real Bookings filter must agree with saved Singapore date');
  assert.match(save,/if \(!calendarSyncFailed\)/);
  assert.equal((source.match(/data-saved-booking-focus=\{/g)||[]).length,2,'Highlight only existing Bookings and Completed cards');
  console.log('Save + CRM actual completion: date, assignment/native parity, return legs, failure, history and newer-draft guards passed.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await checks();
