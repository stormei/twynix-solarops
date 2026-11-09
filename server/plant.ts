import {measured} from './measurements.ts';
import {singleLineTelemetry} from './single-line.ts';
import {validatedStates} from './state-profile.ts';
import {CounterSeries} from './counter-series.ts';
import {recordedPeriod,sumRecorded} from '../src/app/domain/energy-period.ts';
import {ThingsBoard,Entity,Telemetry,ApiError,Discovery} from './thingsboard.ts';
import {Mapping} from './config.ts';
import {Measurement,Point,Plant,Inverter,PlantEvent,RecordedEnergy,SiteTelemetry,State,measurement,convert,energy,reconstruct,operatingState,operatingStateEvidence,booleanValue} from '../src/app/domain/solar.ts';
type Unit='kW'|'kWh'|'V'|'A'|'°C'|'Hz'|'W/m²'|'%';
export {localMidnight} from '../src/app/domain/time.ts';
import {localMidnight} from '../src/app/domain/time.ts';
export function gaps(points:Point[],maxGap:number):Point[]{const sorted=[...points].sort((a,b)=>a.ts-b.ts);return sorted.flatMap((p,k)=>k>0&&p.ts-sorted[k-1].ts>maxGap?[{ts:sorted[k-1].ts+1,value:null},p]:[p]);}
export function plantHistory(devices:Inverter[],interval:number):Point[]{if(!devices.length)return [];const buckets=new Map<number,(number|null)[]>();for(let k=0;k<devices.length;k++)for(const p of devices[k].history){const t=Math.floor(p.ts/interval)*interval;const values=buckets.get(t)??Array(devices.length).fill(null);values[k]=p.value;buckets.set(t,values);}return gaps([...buckets].sort(([a],[b])=>a-b).map(([ts,v])=>({ts,value:v.every(n=>n!==null)?v.reduce<number>((a,n)=>a+n!,0):null})),interval*2.5);}

export {measured} from './measurements.ts';
export function numericSeries(data:Telemetry,mapping:Mapping|undefined,unit:Unit,gapMs:number):Point[]{
 if(!mapping)return [];
 return gaps((data[mapping.key]??[]).map(p=>{
  let value:number|null=null;
  if(p.value!==null&&p.value!==''&&typeof p.value!=='boolean'&&Number.isFinite(Number(p.value))){try{value=convert(Number(p.value),mapping.unit,unit);}catch{}}
  return {ts:p.ts,value};
 }),gapMs);
}
export const recordedEnergy=recordedPeriod;
export function stateHistory(data:Telemetry,mapping:Record<string,Mapping>,states:Record<string,State>):{ts:number;state:State}[]{
 const keys=['operatingState','runFeedback','faultActive'] as const;
 const changes=new Map<number,Partial<Record<typeof keys[number],unknown>>>();
 for(const name of keys){const key=mapping[name]?.key;if(!key)continue;for(const p of data[key]??[]){const row=changes.get(p.ts)??{};row[name]=p.value;changes.set(p.ts,row);}}
 const current:Partial<Record<typeof keys[number],unknown>>={},result:{ts:number;state:State}[]=[];
 for(const [ts,values] of [...changes].sort(([a],[b])=>a-b)){Object.assign(current,values);const state=operatingState(current.operatingState,states,current.runFeedback,current.faultActive);if(result.at(-1)?.state!==state)result.push({ts,state});}
 return result;
}
export function inverterStateSample(latest:Telemetry,keys:Record<string,Mapping>,states:Record<string,State>){
 const value=(name:string)=>latest[keys[name]?.key]?.at(-1)?.value;
 const mode=operatingStateEvidence(value('operatingState'),states,value('runFeedback'),value('faultActive'));
 const field=mode.source==='mapped'||mode.source==='canonical'?'operatingState':booleanValue(value('faultActive'))===true?'faultActive':mode.source==='feedback'?'runFeedback':'operatingState';
 const rawField=keys.rawOperatingState?'rawOperatingState':'operatingState',raw=value(rawField);
 return {state:mode.state,stateSource:mode.source,stateTimestamp:latest[keys[field]?.key]?.at(-1)?.ts??null,rawState:typeof raw==='string'?raw.slice(0,256):typeof raw==='number'&&Number.isFinite(raw)?raw:null,rawStateTimestamp:latest[keys[rawField]?.key]?.at(-1)?.ts??null,stateCode:raw===undefined||raw===null||typeof raw==='string'&&!raw.trim()||typeof raw==='boolean'||!Number.isFinite(Number(raw))?null:Number(raw)};
}
async function optionalHistory<T>(request:Promise<T>,empty:T):Promise<T>{try{return await request;}catch(e){if(e instanceof ApiError&&[401,403].includes(e.status))throw e;return empty;}}
function mergeTelemetry(...sets:Telemetry[]):Telemetry {
 const result:Telemetry={};for(const set of sets)for(const [key,values] of Object.entries(set))result[key]=[...new Map([...(result[key]??[]),...values].map(p=>[p.ts,p])).values()].sort((a,b)=>a.ts-b.ts);return result;
}
export class PlantService {
 last?:Plant;
 private counters:CounterSeries;
 constructor(public tb:ThingsBoard){this.counters=new CounterSeries(tb);}

 async device(entity:Entity,start:number,end:number,historical=true,prior?:Inverter):Promise<Inverter>{
  const now=Date.now(),cfg=this.tb.config,keys=entity.solarops?.solaropsTelemetryMapping??cfg.mapping,states=validatedStates(entity,cfg.states);
  const [latest,attrs]=await Promise.all([this.tb.latest(entity.id.id,keys),this.tb.attributes(entity.id.id)]);
  const attr=(key:string)=>attrs.find(a=>a.key===key)?.value;
  const m=(name:string,unit:Unit)=>measured(latest,keys[name],unit,now,entity.solarops?.staleAfterMs??cfg.staleMs);
  const interval=Math.max(60000,Math.ceil((end-start)/600/60000)*60000);
  const historyKeys=['acPower','dcPower','dcVoltage','dcCurrent'].map(k=>keys[k]?.key).filter((v):v is string=>!!v);
  const stateKeys=['operatingState','runFeedback','faultActive'].map(k=>keys[k]?.key).filter((v):v is string=>!!v);
  const earliest=Math.max(0,entity.createdTime??0);
  const [history,stateData,preceding]=await Promise.all([
   historical?optionalHistory(this.tb.history(entity.id.id,historyKeys,start,end,'AVG',1000,interval),{} as Telemetry):Promise.resolve({} as Telemetry),
   historical?optionalHistory(this.tb.rawHistory(entity.id.id,stateKeys,Math.max(start,earliest),end),{} as Telemetry):Promise.resolve({} as Telemetry),
   historical?optionalHistory(Promise.all(stateKeys.map(key=>this.tb.preceding(entity.id.id,key,start))),[] as Telemetry[]):Promise.resolve([] as Telemetry[]),
  ]);
  const transitions=stateHistory(mergeTelemetry(...preceding,stateData),keys,states);
  const production=await this.counters.read(entity.id.id,keys.lifetimeEnergy,m('lifetimeEnergy','kWh'),earliest,now),day=production.today;
  const phases:Record<string,Measurement>={};
  for(const [name,key,unit] of [['L1 strøm','acCurrentL1','A'],['L2 strøm','acCurrentL2','A'],['L3 strøm','acCurrentL3','A'],['L1–N spenning','acVoltageL1N','V'],['L2–N spenning','acVoltageL2N','V'],['L3–N spenning','acVoltageL3N','V'],['AC spenning L–L','acVoltage','V'],['AC linjestrøm','acCurrent','A'],['Frekvens','frequency','Hz']] as const)phases[name]=m(key,unit);
  return {
   id:entity.id.id,name:entity.label||entity.name,model:entity.solarops?.model??(typeof attr('model')==='string'?String(attr('model')):cfg.deviceModel??null),
   ...inverterStateSample(latest,keys,states),
   telemetryMapping:keys,staleAfterMs:entity.solarops?.staleAfterMs??cfg.staleMs,
   connected:booleanValue(attr('active')),alarmCount:0,
   ac:m('acPower','kW'),dc:m('dcPower','kW'),voltage:m('dcVoltage','V'),current:m('dcCurrent','A'),temperature:m('cabinetTemperature','°C'),
   lifetime:m('lifetimeEnergy','kWh'),daily:day?{value:day.value,timestamp:day.end,quality:day.coverage>=.999&&!day.issues.length?'good':'missing'}:measurement(null,null),energyPeriod:day,monthEnergy:production.month,energyDaily:production.daily,energyDailyCoverage:production.coverage,
   phases,history:historical?numericSeries(history,keys['acPower'],'kW',interval*2.5):prior?.history??[],dcHistory:historical?numericSeries(history,keys['dcPower'],'kW',interval*2.5):prior?.dcHistory??[],
   voltageHistory:historical?numericSeries(history,keys['dcVoltage'],'V',interval*2.5):prior?.voltageHistory??[],currentHistory:historical?numericSeries(history,keys['dcCurrent'],'A',interval*2.5):prior?.currentHistory??[],
   timeline:historical?reconstruct(transitions,start,end,Infinity):prior?.timeline??[],ratedAcKw:m('ratedAcPower','kW'),
   ratedDcKw:typeof attr('ratedDcKw')==='number'?Number(attr('ratedDcKw')):null,group:typeof attr('comparisonGroup')==='string'?String(attr('comparisonGroup')):null,
  };
 }

 private async site(discovery:Discovery,start:number,end:number,historical:boolean,prior?:Plant):Promise<Partial<Plant>>{
  const entity=discovery.controller,mapping=entity?.solarops?.solaropsTelemetryMapping??this.tb.config.siteMapping??{};
  if(!entity||!Object.keys(mapping).length)return {};
  const cfg=this.tb.config,now=Date.now(),interval=Math.max(60000,Math.ceil((end-start)/600/60000)*60000);
  const latest=await this.tb.latest(entity.id.id,mapping),m=(name:string,unit:Unit)=>measured(latest,mapping[name],unit,now,entity.solarops?.staleAfterMs??cfg.staleMs);
  const site:SiteTelemetry={ac:m('acPower','kW'),dc:m('dcPower','kW'),energyCounter:m('energy','kWh'),gridExport:m('gridExport','kW'),irradiance:m('irradiance','W/m²'),airTemperature:m('airTemperature','°C'),cloudCover:m('cloudCover','%'),controllerName:entity.name,arrayCount:discovery.arrays.length,gridMeterName:discovery.meter?.name??null};
  const historyKeys=['acPower','gridExport'].map(k=>mapping[k]?.key).filter((k):k is string=>!!k);
  const history=historical?await optionalHistory(this.tb.history(entity.id.id,historyKeys,start,end,'AVG',1000,interval),{} as Telemetry):{};
  const production=await this.counters.read(entity.id.id,mapping.energy,site.energyCounter,entity.createdTime??0,now);
  return {site,history:historical?numericSeries(history,mapping['acPower'],'kW',interval*2.5):prior?.history,gridHistory:historical?numericSeries(history,mapping['gridExport'],'kW',interval*2.5):prior?.gridHistory,daily:production.daily,dailyCoverage:production.coverage,recordedEnergy:production.today,monthEnergy:production.month,energySource:'controller'};

 }

 async query(start?:number,end?:number,prior?:Plant):Promise<Plant>{
  const now=Date.now(),cfg=this.tb.config,from=start??localMidnight(now,cfg.timezone),to=Math.min(end??now,now);
  const discovery=await this.tb.discover(),{asset,devices}=discovery,inverters:Inverter[]=[],events:PlantEvent[]=[];
  for(let k=0;k<devices.length;k+=4){
   const result=await Promise.allSettled(devices.slice(k,k+4).map(d=>this.device(d,from,to,!prior,prior?.inverters.find(i=>i.id===d.id.id))));
   for(let j=0;j<result.length;j++){
    const r=result[j],d=devices[k+j];
    if(r.status==='fulfilled'){
     inverters.push(r.value);
     if(r.value.ac.quality!=='good')events.push({id:'quality-'+d.id.id,type:'quality',severity:'warning',device:r.value.name,title:'Telemetri mangler eller er foreldet',timestamp:r.value.ac.timestamp??now,active:true});
    }else{
     if(r.reason instanceof ApiError&&[401,403].includes(r.reason.status))throw r.reason;
     const empty=measurement(null,null);
     inverters.push({id:d.id.id,name:d.label||d.name,model:null,state:'unknown',connected:null,alarmCount:0,ac:empty,dc:empty,voltage:empty,current:empty,temperature:empty,lifetime:empty,daily:empty,phases:{},history:[],dcHistory:[],voltageHistory:[],currentHistory:[],timeline:[],ratedDcKw:null,group:null});
     events.push({id:'unavailable-'+d.id.id,type:'quality',severity:'warning',device:d.name,title:'Enhetsdata kunne ikke hentes',timestamp:now,active:true});
    }
   }
  }
  for(const d of devices){
   try{
    const active=await this.tb.alarms(d.id.id),selected=!prior?await this.tb.alarms(d.id.id,from,to):[];
    const inverter=inverters.find(i=>i.id===d.id.id);if(inverter)inverter.alarmCount=active.length;
    for(const a of [...new Map([...selected,...active].map(a=>[a.id.id,a])).values()])events.push({id:a.id.id,type:'alarm',severity:['CRITICAL','MAJOR'].includes(a.severity)?'critical':'warning',device:d.label||d.name,title:a.type,timestamp:a.startTs||a.createdTime,active:active.some(x=>x.id.id===a.id.id)});
   }catch(e){if(e instanceof ApiError&&[401,403].includes(e.status))throw e;events.push({id:'alarm-unavailable-'+d.id.id,type:'quality',severity:'warning',device:d.name,title:'Alarmstatus kunne ikke hentes',timestamp:now,active:true});}
  }
  for(const i of inverters){for(const interval of i.timeline){if(interval.start>from&&interval.state!=='unknown')events.push({id:`state-${i.id}-${interval.start}`,type:'state',severity:'info',device:i.name,title:`Driftstilstand: ${interval.state}`,timestamp:interval.start,active:false});}}
  let site:Partial<Plant>={};try{site=await this.site(discovery,from,to,!prior,prior);}catch(e){if(e instanceof ApiError&&[401,403].includes(e.status))throw e;events.push({id:'site-telemetry',type:'quality',severity:'warning',device:asset.name,title:'Anleggsaggregater kunne ikke hentes',timestamp:now,active:true});}
  const inverterToday=sumRecorded(inverters.map(i=>i.energyPeriod)),inverterMonth=sumRecorded(inverters.map(i=>i.monthEnergy));
  if(inverterToday.value!==null||!site.recordedEnergy){const days=[...new Set(inverters.flatMap(i=>i.energyDaily?.map(p=>p.ts)??[]))].sort((a,b)=>a-b),dailyCoverage:Record<string,number>={};site={...site,recordedEnergy:inverterToday,monthEnergy:inverterMonth,energySource:'inverters',daily:days.map(ts=>{const points=inverters.map(i=>i.energyDaily?.find(p=>p.ts===ts));dailyCoverage[String(ts)]=Math.min(...inverters.map(i=>i.energyDailyCoverage?.[String(ts)]??0));return {ts,value:points.length&&points.every(p=>p?.value!==null&&p?.value!==undefined)?points.reduce((sum,p)=>sum+p!.value!,0):null};}),dailyCoverage};}
  const interval=Math.max(60000,Math.ceil((to-from)/600/60000)*60000),viewEnd=end??localMidnight(from+36*3600000,cfg.timezone);
  const lastTelemetry=site.site?.ac.timestamp??Math.max(0,...inverters.map(i=>i.ac.timestamp??0));
  const singleLine=await singleLineTelemetry(this.tb,discovery,now);
  const plant:Plant={singleLine,id:cfg.plantId,name:asset.label||asset.name,timestamp:lastTelemetry||now,fetchedAt:now,inverters,events:events.sort((a,b)=>b.timestamp-a.timestamp),history:prior?.history??plantHistory(inverters,interval),daily:[],demo:false,periodStart:from,periodEnd:viewEnd,source:{name:'ThingsBoard',version:cfg.version??'',simulated:cfg.simulated??false},...site};
  this.last=plant;return plant;
 }
}
