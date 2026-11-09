import {localMidnight,localMonthStart} from '../src/app/domain/time.ts';
import {convert,counterDelta,type Point,type Measurement,type RecordedEnergy} from '../src/app/domain/solar.ts';
import type {Mapping} from './config.ts';
import {ApiError,type ThingsBoard} from './thingsboard.ts';
interface Day {start:number;end:number;total:number;covered:number;first:number|null;last:number|null;issues:Set<string>}
interface Entry {points:Point[];fetched:number;loaded:boolean;days:Day[];unavailable?:boolean;pending?:Promise<void>}
function period(days:Day[],start:number,end:number):RecordedEnergy {
 const relevant=days.filter(d=>d.start>=start&&d.start<end),covered=relevant.reduce((n,d)=>n+d.covered,0),coverage=end>start?Math.min(1,covered/(end-start)):0;
 const issues=new Set(relevant.flatMap(d=>[...d.issues]));if(coverage<.999)issues.add('incomplete coverage');const known=relevant.filter(d=>d.first!==null);
 return {value:covered?relevant.reduce((n,d)=>n+d.total,0):null,coverage,start:known[0]?.first??null,end:known.at(-1)?.last??null,issues:[...issues]};
}
function apply(entry:Entry,a:Point,b:Point){
 if(b.ts<=a.ts)return;const delta=counterDelta(a,b);
 for(const day of entry.days){if(b.ts<=day.start||a.ts>=day.end)continue;const start=Math.max(day.start,a.ts),end=Math.min(day.end,b.ts);
  if(delta.value===null){if(delta.issue)day.issues.add(delta.issue);continue;}
  day.total+=delta.value*(end-start)/(b.ts-a.ts);day.covered+=end-start;day.first=day.first===null?start:Math.min(day.first,start);day.last=day.last===null?end:Math.max(day.last,end);
 }
}
export class CounterSeries {
 private entries=new Map<string,Entry>();
 constructor(private tb:ThingsBoard){}
 async read(id:string,mapping:Mapping|undefined,latest:Measurement,created:number,now:number){
  const timezone=this.tb.config.timezone,monthStart=localMonthStart(now,timezone),today=localMidnight(now,timezone),key=[id,mapping?.key,mapping?.unit,timezone,monthStart].join('|');
  let entry=this.entries.get(key);if(!entry){for(const old of this.entries.keys())if(old.startsWith(id+'|'))this.entries.delete(old);entry={points:[],fetched:0,loaded:false,days:[]};for(let t=monthStart;t<=today;){const end=localMidnight(t+36*3600000,timezone);entry.days.push({start:t,end,total:0,covered:0,first:null,last:null,issues:new Set()});t=end;}this.entries.set(key,entry);}
  const current=entry;
  if(current.days.at(-1)!.start<today)for(let t=current.days.at(-1)!.end;t<=today;){const end=localMidnight(t+36*3600000,timezone);current.days.push({start:t,end,total:0,covered:0,first:null,last:null,issues:new Set()});t=end;}
  if(mapping&&(!current.fetched||now-current.fetched>=60000)){
   if(!current.pending){current.pending=(async()=>{const from=Math.max(monthStart-900000,created,current.loaded?(current.points.at(-1)?.ts??monthStart)-900000:0),raw=await this.tb.rawHistory(id,[mapping.key],from,now);const points=(raw[mapping.key]??[]).map(p=>{let value:number|null=null;if(p.value!==null&&p.value!==''&&typeof p.value!=='boolean'&&Number.isFinite(Number(p.value)))try{value=convert(Number(p.value),mapping.unit,'kWh');}catch{}return {ts:p.ts,value};});current.points=[...new Map([...current.points,...points].filter(p=>p.ts>=monthStart-900000&&p.ts<=now).map(p=>[p.ts,p])).values()].sort((a,b)=>a.ts-b.ts);for(const d of current.days){d.total=0;d.covered=0;d.first=null;d.last=null;d.issues.clear();}for(let i=1;i<current.points.length;i++)apply(current,current.points[i-1],current.points[i]);current.loaded=true;current.unavailable=false;})().catch(e=>{if(e instanceof ApiError&&[401,403].includes(e.status))throw e;current.unavailable=true;}).finally(()=>{current.fetched=now;current.pending=undefined;});}
   await current.pending;
  }
  if(mapping&&latest.timestamp!==null&&Number.isFinite(latest.timestamp)&&latest.timestamp>=monthStart-900000&&latest.timestamp<=now){const last=current.points.at(-1),point={ts:latest.timestamp,value:latest.value};if(!last||point.ts>last.ts){if(last)apply(current,last,point);current.points.push(point);}}
  const daily:Point[]=[],coverage:Record<string,number>={};
  const first=current.points.find(p=>p.ts>=monthStart)?.ts;
  if(first!==undefined)for(const day of current.days.filter(d=>d.end>first&&d.start<now)){const calc=period([day],day.start,Math.min(day.end,now));daily.push({ts:day.start,value:calc.value});coverage[String(day.start)]=calc.coverage;}
  const todayPeriod=period(current.days,today,now),monthPeriod=period(current.days,monthStart,now);if(current.unavailable){todayPeriod.issues.push('energy history unavailable');monthPeriod.issues.push('energy history unavailable');}
  return {today:todayPeriod,month:monthPeriod,daily,coverage};
 }
}
