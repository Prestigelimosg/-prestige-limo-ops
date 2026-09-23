import type {SupabaseClient} from '@supabase/supabase-js';

type Client = Pick<SupabaseClient,'from'|'rpc'>;
type Row = Record<string,unknown>;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reference=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
export const comboEnabled=()=>process.env.PRESTIGE_DRIVER_COMBO_ENABLED==='true';
const record=(v:unknown):Row=>v && typeof v==='object' && !Array.isArray(v)?v as Row:{};
const rows=(v:unknown):Row[]=>Array.isArray(v)?v.map(record):[];
const text=(v:unknown,max=500)=>typeof v==='string' && v.trim().length<=max?v.trim():'';
const terminal=(b:Row)=>[b.status,b.admin_internal_status,b.customer_facing_status].some(v=>
  ['cancelled','canceled','completed','complete','archived','deleted','declined','declined_internal','history','job completed','job_completed'].includes(text(v).toLowerCase()));
const selection='booking_reference,public_booking_reference,customer_id,company_id,booker_id,updated_at,pickup_at,dropoff_datetime,service_type,pickup_location,dropoff_location,route_summary,vehicle_type_or_category,driver_id,status,admin_internal_status,customer_facing_status,extra_stop_count,child_seat_required,child_seat_count,driver_payout_override,flight_no,pax_count,luggage_count,customer_special_request';

export type ComboTrip = {
  booking_reference:string; public_booking_reference:string; updated_at:string;
  pickup_at:string; scheduled_end_at:string|null; service:string; vehicle:string;
  pickup:string; dropoff:string; route:string;
  extra_stop_count:number; child_seat_required:boolean; child_seat_count:number; payout_override:number|null;
  flight_number:string; passengers:number|null; luggage:number|null; instructions:string;
};
export type AdminDriverCombo = {
  id:string; revision:string; primary_booking_reference:string;
  state:'draft'|'offered'|'assigned'|'cancelled'; total_payout_sgd:number|null;
  driver_id:number|null; vehicle_requirement:string|null; offer_key:string|null;
  trips:ComboTrip[];
};

function trip(row:Row):ComboTrip {
  return {
    booking_reference:text(row.booking_reference,120),public_booking_reference:text(row.public_booking_reference,120),
    updated_at:text(row.updated_at,80),pickup_at:text(row.pickup_at,80),scheduled_end_at:text(row.dropoff_datetime,80)||null,
    service:text(row.service_type,40),vehicle:text(row.vehicle_type_or_category,120),
    pickup:text(row.pickup_location,1000),dropoff:text(row.dropoff_location,1000),route:text(row.route_summary,2000),
    extra_stop_count:Number(row.extra_stop_count)||0,child_seat_required:row.child_seat_required===true,child_seat_count:Number(row.child_seat_count)||0,
    payout_override:row.driver_payout_override==null?null:Number(row.driver_payout_override),
    flight_number:text(row.flight_no,120),passengers:Number.isSafeInteger(row.pax_count)?Number(row.pax_count):null,
    luggage:Number.isSafeInteger(row.luggage_count)?Number(row.luggage_count):null,instructions:text(row.customer_special_request,1200),
  };
}

export async function loadDriverCombo(client:Pick<SupabaseClient,'from'>,bookingReference:string):Promise<AdminDriverCombo|null> {
  if(!comboEnabled())return null;
  if(!reference.test(bookingReference))throw new Error('Invalid saved trip reference.');
  const member=await client.from('driver_job_combo_members').select('combo_id').eq('booking_reference',bookingReference).maybeSingle();
  if(member.error)throw new Error('Combo membership could not be verified.');
  if(!member.data)return null;
  const id=record(member.data).combo_id;
  if(typeof id!=='string'||!uuid.test(id))throw new Error('Combo membership is invalid.');
  const [groupRead,membersRead]=await Promise.all([
    client.from('driver_job_combos').select('id,revision,primary_booking_reference,state,total_payout_sgd,driver_id,vehicle_requirement,offer_key').eq('id',id).single(),
    client.from('driver_job_combo_members').select('booking_reference,ordinal').eq('combo_id',id).order('ordinal'),
  ]);
  if(groupRead.error||membersRead.error)throw new Error('Combo could not be loaded.');
  const group=record(groupRead.data),members=rows(membersRead.data);
  const refs=members.map(m=>text(m.booking_reference,120));
  if(refs.length<2||refs.length>100||refs.some(r=>!reference.test(r))||new Set(refs).size!==refs.length||
    !uuid.test(String(group.revision))||!['draft','offered','assigned','cancelled'].includes(String(group.state)))throw new Error('Combo needs review.');
  const bookings=await client.from('bookings').select(selection).in('booking_reference',refs);
  const stored=rows(bookings.data);
  if(bookings.error||stored.length!==refs.length)throw new Error('A saved combo trip is unavailable.');
  const primary=stored.find(b=>b.booking_reference===group.primary_booking_reference);
  if(!primary?.customer_id||stored.some(b=>String(b.customer_id)!==String(primary.customer_id)||
    b.company_id!==primary.company_id||b.booker_id!==primary.booker_id))throw new Error('Combo customer ownership needs review.');
  return {
    id,revision:String(group.revision),primary_booking_reference:String(group.primary_booking_reference),
    state:group.state as AdminDriverCombo['state'],total_payout_sgd:group.total_payout_sgd==null?null:Number(group.total_payout_sgd),
    driver_id:group.driver_id==null?null:Number(group.driver_id),vehicle_requirement:text(group.vehicle_requirement,120)||null,
    offer_key:text(group.offer_key,64)||null,
    trips:refs.map(ref=>trip(stored.find(b=>b.booking_reference===ref)!)),
  };
}

export async function loadDriverComboCandidates(client:Client,bookingReference:string,page=1) {
  if(!comboEnabled())throw new Error('Combo jobs are not enabled.');
  if(!reference.test(bookingReference)||!Number.isInteger(page)||page<1||page>1000)throw new Error('Invalid combo selection request.');
  const anchorRead=await client.from('bookings').select(selection).eq('booking_reference',bookingReference).single();
  const anchor=record(anchorRead.data);
  if(anchorRead.error||!anchor.customer_id)throw new Error('Verify the saved customer account first.');
  const combo=await loadDriverCombo(client,bookingReference);
  let query=client.from('bookings').select(selection).eq('customer_id',anchor.customer_id)
    .gt('pickup_at',new Date().toISOString()).is('driver_id',null).order('pickup_at').order('booking_reference');
  query=anchor.company_id==null?query.is('company_id',null):query.eq('company_id',anchor.company_id);
  query=anchor.booker_id==null?query.is('booker_id',null):query.eq('booker_id',anchor.booker_id);
  const read=await query.range((page-1)*50,page*50);
  if(read.error)throw new Error('Saved trips could not be loaded.');
  const found=rows(read.data),batch=found.slice(0,50),refs=batch.map(b=>text(b.booking_reference,120));
  if(!refs.length)return {combo,candidates:[] as ComboTrip[],has_more:false,page};
  const [memberRead,offerRead,linkRead]=await Promise.all([
    client.from('driver_job_combo_members').select('booking_reference,combo_id').in('booking_reference',refs),
    client.from('driver_job_bid_offers').select('booking_reference,offer_status,closes_at').in('booking_reference',refs).in('offer_status',['open','assigned']),
    client.from('driver_job_links').select('booking_reference').in('booking_reference',refs).eq('link_status','active').is('revoked_at',null).gt('expires_at',new Date().toISOString()),
  ]);
  if(memberRead.error||offerRead.error||linkRead.error)throw new Error('Trip availability could not be verified.');
  const blocked=new Set([
    ...rows(memberRead.data).filter(m=>m.combo_id!==combo?.id).map(m=>m.booking_reference),
    ...rows(offerRead.data).filter(o=>o.offer_status==='assigned'||Date.parse(String(o.closes_at))>Date.now()).map(o=>o.booking_reference),
    ...rows(linkRead.data).map(l=>l.booking_reference),
  ]);
  return {combo,candidates:[...(!combo && !terminal(anchor) && anchor.driver_id==null ? [trip(anchor)] : []),...batch.filter(b=>b.booking_reference!==bookingReference&&!terminal(b)&&!blocked.has(b.booking_reference)).map(trip)],has_more:found.length>50,page};
}

export async function defineDriverCombo(client:Client,value:unknown,actor:{actor_role:string;actor_label:string}) {
  if(!comboEnabled())throw new Error('Combo jobs are not enabled.');
  const input=record(value),members=input.members;
  if(input.action!=='combo_members'||Object.keys(input).some(k=>!['action','booking_reference','members','expected_revision'].includes(k))||
    !reference.test(String(input.booking_reference||''))||!Array.isArray(members)||members.length<1||members.length>100||
    (input.expected_revision!=null&&!uuid.test(String(input.expected_revision)))||members.some(m=>{
      const row=record(m);return Object.keys(row).some(k=>!['booking_reference','updated_at'].includes(k))||
        !reference.test(String(row.booking_reference||''))||typeof row.updated_at!=='string'||!Number.isFinite(Date.parse(row.updated_at));
    }))throw new Error('Select valid saved trips before adding them.');
  const result=await client.rpc('define_driver_job_combo',{
    p_primary:input.booking_reference,p_members:members,p_expected_revision:input.expected_revision??null,
    p_actor_role:actor.actor_role,p_actor_label:actor.actor_label,
  });
  if(result.error)throw new Error('The saved trips changed or cannot be combined. Reload the same-customer selection.');
  return loadDriverCombo(client,String(input.booking_reference));
}

// These fields alone may cross the driver boundary; internal member/customer identifiers never do.
export function driverComboTripSummary(value:ComboTrip) {
  return {reference:value.public_booking_reference,service:value.service,pickup_at:value.pickup_at,
    scheduled_end_at:value.scheduled_end_at,pickup:value.pickup,dropoff:value.dropoff,route:value.route,
    flight_number:value.flight_number,passengers:value.passengers,luggage:value.luggage,instructions:value.instructions,
    child_seat:value.child_seat_required ? `${value.child_seat_count || 1} required` : ''};
}

export type DriverComboView = {
  vehicle:string;
  trips:Array<ReturnType<typeof driverComboTripSummary> & {completed:boolean; acknowledged:boolean; href:string|null}>;
};

// Server-only capability check. A token can reveal only the exact package/revision
// to which its stored link belongs and only while the same driver owns every trip.
export async function loadDriverComboAccess(client:Pick<SupabaseClient,'from'>,token:string,allowCompletedEntry=false):Promise<{
  view:DriverComboView; tokens:string[]; bookingReferences:string[]; redirect:string|null;
}|null> {
  const {hashDriverJobLinkToken,isDriverJobLinkExpiryOutsideAllowedWindow}=await import('./driver-job-link.ts');
  const {openDriverNativeJobHandoff}=await import('./driver-native-job-handoff.ts');
  const hash=hashDriverJobLinkToken(token);
  const originRead=await client.from('driver_job_links').select('id,booking_reference,driver_id,token_hash,link_status,expires_at,revoked_at,safe_link_context')
    .eq('token_hash',hash).maybeSingle();
  if(originRead.error)throw new Error('Combo access could not be verified.');
  const origin=record(originRead.data),context=record(origin.safe_link_context);
  if(!context.combo_id)return null;
  if(!uuid.test(String(context.combo_id))||!uuid.test(String(context.combo_revision))||!uuid.test(String(context.combo_link_batch))||
    origin.revoked_at||origin.link_status==='revoked'||!Number(origin.driver_id))throw new Error('Combo access is unavailable.');
  const until=text(context.combo_access_until,80);
  if(Date.parse(until)<=Date.now()||!Number.isFinite(Date.parse(until))||
    isDriverJobLinkExpiryOutsideAllowedWindow(until,new Date(),undefined,context))throw new Error('Combo access expired.');
  const [groupRead,membersRead]=await Promise.all([
    client.from('driver_job_combos').select('id,revision,state,driver_id,vehicle_requirement,primary_booking_reference').eq('id',context.combo_id).single(),
    client.from('driver_job_combo_members').select('booking_reference,ordinal').eq('combo_id',context.combo_id).order('ordinal'),
  ]);
  const group=record(groupRead.data),members=rows(membersRead.data),refs=members.map(m=>text(m.booking_reference,120));
  if(groupRead.error||membersRead.error||refs.length<2||refs.length>100||Number(context.combo_trip_count)!==refs.length||!refs.includes(String(origin.booking_reference))||
    group.state!=='assigned'||group.revision!==context.combo_revision||Number(group.driver_id)!==Number(origin.driver_id))throw new Error('Combo assignment changed.');
  const [bookingRead,linksRead,statusRead]=await Promise.all([
    client.from('bookings').select(selection).in('booking_reference',refs),
    client.from('driver_job_links').select('id,booking_reference,driver_id,token_hash,link_status,expires_at,revoked_at,safe_link_context,created_at')
      .in('booking_reference',refs).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(1000),
    client.from('driver_job_status_events').select('booking_reference').in('booking_reference',refs).eq('status_value','completed').limit(1000),
  ]);
  if(bookingRead.error||linksRead.error||statusRead.error)throw new Error('Combo trips could not be verified.');
  const bookings=rows(bookingRead.data),links=rows(linksRead.data),completed=new Set(rows(statusRead.data).map(s=>s.booking_reference));
  const primary=bookings.find(b=>b.booking_reference===group.primary_booking_reference);
  if(bookings.length!==refs.length||!primary?.customer_id||bookings.some(b=>Number(b.driver_id)!==Number(group.driver_id)||
    b.customer_id!==primary.customer_id||b.company_id!==primary.company_id||b.booker_id!==primary.booker_id||
    (terminal(b)&&!completed.has(b.booking_reference))))throw new Error('Combo trip ownership or availability changed.');
  const originCompleted=completed.has(origin.booking_reference);
  if((origin.link_status!=='active'||Date.parse(String(origin.expires_at))<=Date.now()||originCompleted)&&
    !(allowCompletedEntry&&originCompleted))throw new Error('This trip is no longer active.');
  const view:DriverComboView={vehicle:text(group.vehicle_requirement,120),trips:[]};
  const tokens:string[]=[],bookingReferences:string[]=[];
  for(const ref of refs) {
    const booking=bookings.find(b=>b.booking_reference===ref)!,link=links.find(l=>l.booking_reference===ref),ctx=record(link?.safe_link_context);
    if(!link||link.revoked_at||link.link_status==='revoked'||Number(link.driver_id)!==Number(group.driver_id)||
      ctx.combo_id!==group.id||ctx.combo_revision!==group.revision||ctx.combo_link_batch!==context.combo_link_batch||
      (ref===origin.booking_reference&&link.id!==origin.id))throw new Error('A combo link changed.');
    const done=completed.has(ref);
    let href:string|null=null;
    if(!done) {
      if(link.link_status!=='active'||Date.parse(String(link.expires_at))<=Date.now()||
        isDriverJobLinkExpiryOutsideAllowedWindow(String(link.expires_at),new Date(),undefined,ctx))throw new Error('A combo link is unavailable.');
      const memberToken=openDriverNativeJobHandoff({bookingReference:ref,tokenHash:link.token_hash,ciphertext:ctx.native_handoff_ciphertext});
      if(!memberToken||hashDriverJobLinkToken(memberToken)!==link.token_hash)throw new Error('Combo access could not be recovered.');
      href='/driver-job/'+encodeURIComponent(memberToken);tokens.push(memberToken);bookingReferences.push(ref);
    }
    view.trips.push({...driverComboTripSummary(trip(booking)),completed:done,acknowledged:Boolean(ctx.driver_acknowledged_at),href});
  }
  return {view,tokens,bookingReferences,redirect:originCompleted?view.trips.find(t=>t.href)?.href||null:null};
}
