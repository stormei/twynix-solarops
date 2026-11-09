import {randomUUID} from 'node:crypto';
import {ThingsBoard,ApiError} from './thingsboard.ts';
import {localMidnight} from '../src/app/domain/time.ts';
import {recordedPeriod,sumRecorded} from '../src/app/domain/energy-period.ts';
import {convert,type Point,type RecordedEnergy} from '../src/app/domain/solar.ts';
import type {EnergyReport} from '../src/app/domain/production-report.ts';
export function reportWindow(month:string,timezone:string,now=Date.now()){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new ApiError(400,'Invalid report month');const year=Number(month.slice(0,4)),m=Number(month.slice(5));if(year<2000||year>2100)throw new ApiError(400,'Invalid report year');
 const start=localMidnight(Date.UTC(year,m-1,1,12),timezone),finish=localMidnight(Date.UTC(year,m,1,12),timezone),end=Math.min(now,finish);if(end<=start)throw new ApiError(400,'Future report period');
 const days:{start:number;end:number}[]=[];for(let t=start;t<end;){const next=localMidnight(t+36*3600000,timezone);days.push({start:t,end:Math.min(next,end)});t=next;}return {start,end,days,ongoing:now<finish};
}
function unavailable(issue:string):RecordedEnergy{return {value:null,coverage:0,start:null,end:null,issues:[issue,'incomplete coverage']};}
export async function calculateEnergyReport(tb:ThingsBoard,month:string,now=Date.now()):Promise<EnergyReport>{
 const window=reportWindow(month,tb.config.timezone,now),discovery=await tb.discover();
 const rows=window.days.map(d=>({...d,site:unavailable('incomplete inverter coverage'),inverters:{} as Record<string,RecordedEnergy>}));
 const inverters:EnergyReport['inverters']=[];
 // Bounded sequential history queries keep reporting separate from the live telemetry cache.
 for(const device of discovery.devices){
  const mapping=(device.solarops?.solaropsTelemetryMapping??tb.config.mapping).lifetimeEnergy;let points:Point[]=[],issue:string|undefined;
  if(!mapping)issue='energy counter not mapped';else try{
   const raw=await tb.rawHistory(device.id.id,[mapping.key],Math.max(window.start-900000,device.createdTime??0),Math.min(now,window.end+900000)+1);
   points=(raw[mapping.key]??[]).filter(p=>p.ts<=now).map(p=>{let value:number|null=null;if(p.value!==null&&p.value!==''&&typeof p.value!=='boolean'&&Number.isFinite(Number(p.value)))try{value=convert(Number(p.value),mapping.unit,'kWh');}catch{}return {ts:p.ts,value};});
  }catch(e){if(e instanceof ApiError&&[401,403].includes(e.status))throw e;issue='energy history unavailable';}
  const period=issue?unavailable(issue):recordedPeriod(points,window.start,window.end);inverters.push({id:device.id.id,name:device.label||device.name,period});
  for(const row of rows)row.inverters[device.id.id]=issue?unavailable(issue):recordedPeriod(points,row.start,row.end);
 }
 for(const row of rows)row.site=sumRecorded(inverters.map(i=>row.inverters[i.id]));
 return {id:randomUUID(),month,siteId:discovery.asset.id.id,siteName:discovery.asset.label||discovery.asset.name,timezone:tb.config.timezone,start:window.start,end:window.end,generatedAt:now,ongoing:window.ongoing,simulated:!!tb.config.simulated||discovery.devices.some(d=>d.solarops?.dataSourceKind==='simulation'),version:'counter-delta-v1',source:'inverters',inverters,site:sumRecorded(inverters.map(i=>i.period)),days:rows};
}
interface Entry {report?:EnergyReport;pending?:Promise<EnergyReport>}
const caches=new WeakMap<ThingsBoard,Map<string,Entry>>(),snapshots=new WeakMap<ThingsBoard,Map<string,EnergyReport>>();
export async function getEnergyReport(tb:ThingsBoard,month:string,snapshot?:string):Promise<EnergyReport>{
 reportWindow(month,tb.config.timezone);let saved=snapshots.get(tb);if(!saved){saved=new Map();snapshots.set(tb,saved);}
 if(snapshot){const report=saved.get(snapshot);if(!report||report.month!==month||Date.now()-report.generatedAt>600000)throw new ApiError(409,'Report snapshot expired. Refresh the report before exporting.');return report;}
 let cache=caches.get(tb);if(!cache){cache=new Map();caches.set(tb,cache);}let entry=cache.get(month);if(!entry){entry={};cache.set(month,entry);if(cache.size>3)cache.delete(cache.keys().next().value!);}
 if(entry.report&&Date.now()-entry.report.generatedAt<(entry.report.ongoing?60000:300000))return entry.report;
 if(!entry.pending){const current=entry;current.pending=calculateEnergyReport(tb,month).then(report=>{current.report=report;saved!.set(report.id,report);while(saved!.size>8)saved!.delete(saved!.keys().next().value!);return report;}).finally(()=>{current.pending=undefined;});}return entry.pending!;
}
