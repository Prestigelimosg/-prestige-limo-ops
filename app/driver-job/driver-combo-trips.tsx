"use client";

export type DriverComboTripSummary = {
  reference:string; service:string; pickup_at:string; scheduled_end_at:string|null;
  pickup:string; dropoff:string; route:string;
  completed?:boolean; href?:string|null;
  flight_number?:string; passengers?:number|null; luggage?:number|null; instructions?:string; child_seat?:string;
};

export function DriverComboTrips({vehicle,trips,activeReference}:{vehicle:string;trips:DriverComboTripSummary[];activeReference?:string}) {
  return <div data-driver-combo-trips="true">
    <h3 className="text-lg font-extrabold text-slate-950">{vehicle} Combo</h3>
    <ol className="mt-2 divide-y divide-slate-200">
      {trips.map(trip=>{
        const date=new Date(trip.pickup_at);
        const parts=Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-SG',{
          day:'2-digit',month:'short',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'Asia/Singapore',
        }).formatToParts(date) : [];
        const part=(type:string)=>parts.find(value=>value.type===type)?.value || '';
        const end=trip.scheduled_end_at ? new Date(trip.scheduled_end_at) : null;
        const details=[trip.flight_number ? `Flight ${trip.flight_number}` : '',trip.passengers ? `Pax ${trip.passengers}` : '',
          trip.luggage!=null ? `Luggage ${trip.luggage}` : '',trip.child_seat ? `Child seat: ${trip.child_seat}` : ''].filter(Boolean).join(' · ');
        return <li key={trip.reference} className="py-2 first:pt-0">
          <div className="flex items-baseline justify-between gap-2"><strong className="text-sm text-slate-950">{trip.service}</strong><span className="text-xs text-slate-500">{trip.reference}</span></div>
          <p className="text-sm font-semibold text-slate-800">{parts.length ? `${part('day')} ${part('month')} ${part('weekday')}, ${part('hour')}${part('minute')}hrs` : 'Pickup time unavailable'}</p>
          <p className="mt-0.5 break-words text-xs text-slate-600">{trip.route || [trip.pickup,trip.dropoff].filter(Boolean).join(' → ')}</p>
          {end && Number.isFinite(end.getTime()) ? <p className="text-xs text-slate-600">Until {new Intl.DateTimeFormat('en-SG',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'Asia/Singapore'}).format(end)}</p> : null}
          {details ? <p className="text-xs text-slate-600">{details}</p> : null}
          {trip.instructions ? <p className="whitespace-pre-wrap break-words text-xs text-slate-600">{trip.instructions}</p> : null}
          {trip.completed ? <span className="text-xs font-semibold text-emerald-700">Completed</span> : trip.href && activeReference ?
            trip.reference===activeReference ? <span className="text-xs font-semibold text-sky-700">Viewing this trip</span> :
            <a className="inline-block py-1 text-xs font-semibold text-sky-800 underline" href={trip.href}>View trip</a> : null}
        </li>;
      })}
    </ol>
  </div>;
}
