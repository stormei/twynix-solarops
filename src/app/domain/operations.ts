import type {Inverter,Measurement} from './solar.js';
export type InverterStatus='running'|'starting'|'limited'|'standby'|'stopped'|'fault'|'offline'|'stale'|'missing'|'unknown';
export const statusNames:Record<InverterStatus,string>={running:'Kjører',starting:'Oppstart',limited:'Begrenset',standby:'Standby',stopped:'Stoppet',fault:'Feil',offline:'Frakoblet',stale:'Foreldet',missing:'Mangler data',unknown:'Ukjent'};
export function freshMeasurement(m:Measurement,now:number,staleMs=120000):Measurement {
 if(m.quality==='invalid'||m.value!==null&&!Number.isFinite(m.value)||m.timestamp!==null&&!Number.isFinite(m.timestamp))return {value:null,timestamp:m.timestamp,quality:'invalid'};
 if(m.value===null||m.timestamp===null||m.quality==='missing')return {...m,value:null,quality:'missing'};
 return {...m,quality:m.quality==='stale'||now-m.timestamp>staleMs?'stale':'good'};
}
export function refreshInverter(i:Inverter,now:number):Inverter {
 const m=(value:Measurement)=>freshMeasurement(value,now,i.staleAfterMs??120000);
 return {...i,ac:m(i.ac),dc:m(i.dc),voltage:m(i.voltage),current:m(i.current),temperature:m(i.temperature),lifetime:m(i.lifetime),ratedAcKw:i.ratedAcKw?m(i.ratedAcKw):undefined,phases:Object.fromEntries(Object.entries(i.phases).map(([key,value])=>[key,m(value)]))};
}
export function inverterStatus(i:Inverter,now=Date.now()):InverterStatus {
 if(i.connected===false)return 'offline';const ac=freshMeasurement(i.ac,now,i.staleAfterMs??120000);
 if(ac.quality==='missing'||ac.quality==='invalid')return 'missing';if(ac.quality==='stale')return 'stale';
 return ({mppt:'running',running:'running',startup:'starting',throttled:'limited',standby:'standby',sleep:'standby',stopped:'stopped',fault:'fault',unknown:'unknown'} as const)[i.state];
}
export function statusTone(status:InverterStatus){return status==='fault'?'red':['stale','missing','unknown'].includes(status)?'yellow':['offline','stopped','standby'].includes(status)?'gray':status==='starting'?'blue':status==='limited'?'yellow':'green';}

// Operational mode is kept separate from device connectivity and power freshness.
export function inverterMode(i:Inverter|undefined,now=Date.now()){
 const timestamp=i?.stateTimestamp??null;
 const quality=!i||timestamp===null?'missing':now-timestamp>(i.staleAfterMs??120000)?'stale':'good';
 return {state:i?.state??'unknown',quality,timestamp};
}
export function inverterCommunication(i:Inverter|undefined):'Tilkoblet'|'Frakoblet'|'Ukjent tilkobling'{return i?.connected===true?'Tilkoblet':i?.connected===false?'Frakoblet':'Ukjent tilkobling';}
