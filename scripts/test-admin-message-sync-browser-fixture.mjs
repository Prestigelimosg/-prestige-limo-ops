// Synthetic local-only backend for the compiled Admin page. No Production API or send.
// Run Next locally on 3197, then this fixture on 3198. Use localhost and 127.0.0.1
// for independent browser storage backed by the same disposable server attention.
import http from 'node:http';
const now=Date.now();const done=new Set();let writes=0;
const booking=(ref,pub)=>({id:ref,booking_reference:ref,public_booking_reference:pub,booking_type:'TRF',vehicle:'AVF',pickup_at:new Date(now-3600000).toISOString(),pickup_datetime:new Date(now-3600000).toISOString(),pickup_address:'Example pickup',dropoff_address:'Example destination',passenger_name:'QA Customer',driver_name:'QA Driver',driver_id:71,status:'assigned',pax:1,created_at:new Date(now).toISOString(),updated_at:new Date(now).toISOString()});
const bookings=[booking('EXACT-A','99001'),booking('EXACT-B','99002')];
const messages=[{id:'11111111-1111-4111-8111-111111111111',booking_reference:'EXACT-A',safe_title:'Driver reply',safe_message:'Please confirm pickup point.',workflow_area:'admin_driver_job_messages',delivery_surface:'driver_app',actor_role:'driver',safe_context:{direction:'driver_to_admin'},created_at:new Date(now).toISOString()},
{id:'22222222-2222-4222-8222-222222222222',booking_reference:'EXACT-B',safe_title:'QA Customer B',safe_message:'We are at the lobby.',workflow_area:'customer_driver_quick_replies',delivery_surface:'driver_app',actor_role:'customer',safe_context:{direction:'customer_to_driver'},created_at:new Date(now).toISOString()}];
const server=http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://127.0.0.1:3198');
 const json=(body,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body));};
 if(u.pathname==='/__qa-state')return json({done:[...done],writes,history:messages});
 if(u.pathname.startsWith('/api/')){
  if(req.method!=='GET'){
   if(req.method==='POST'&&u.pathname==='/api/admin-customer-driver-app-notifications'){
    let raw='';for await(const part of req)raw+=part;
    const body=JSON.parse(raw);if(body.action!=='dismiss_admin_messages')return json({ok:false},403);
    const ids=body.message_ids.filter(id=>messages.some(m=>m.id===id));ids.forEach(id=>done.add(id));writes++;
    return json({ok:true,message_ids:ids});
   }
   return json({ok:false},403);
  }
  if(u.pathname==='/api/admin-saved-bookings')return json({ok:true,bookings});
  if(u.pathname==='/api/admin-load-bookings-typed-read')return json({ok:true,bookings:[],read_gate_open:true,status:'ready'});
  if(u.pathname==='/api/admin-customer-driver-app-notifications')return json({ok:true,notifications:u.searchParams.get('scope')==='admin_incoming_messages'?messages.filter(m=>!done.has(m.id)):messages.filter(m=>m.booking_reference===u.searchParams.get('booking_reference')),pagination:{has_next_page:false}});
  if(u.pathname==='/api/admin-app-notifications')return json({ok:true,notifications:[{id:'existing',workflow_area:'other',notification_status:'queued',safe_title:'Existing operational alert',safe_message:'Existing alert stays available'}],pagination:{has_next_page:false}});
  return json({ok:true,external_send:false,write_action:false,enabled:false,records:[],bookings:[],notifications:[],statuses:[],items:[],links:[],settings:{enabled:false},has_more:false});
 }
 if(req.method!=='GET')return json({ok:false},405);
 const response=await fetch('http://127.0.0.1:3197'+u.pathname+u.search,{redirect:'manual'});
 const headers={'content-type':response.headers.get('content-type')||'text/plain'};
 res.writeHead(response.status,headers);res.end(Buffer.from(await response.arrayBuffer()));
}catch(e){res.writeHead(500);res.end(String(e.message));}});
server.listen(3198,"127.0.0.1",()=>console.log('Synthetic shared Admin attention fixture: http://127.0.0.1:3198 and http://localhost:3198'));
