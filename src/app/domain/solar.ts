import type {SingleLineTelemetry} from './single-line.js';
export type Quality='good'|'stale'|'missing'|'invalid';
export const operatingModes=['mppt','sleep','standby','startup','throttled','fault','unknown','running','stopped'] as const;
export type State=typeof operatingModes[number];
export interface Measurement { value:number|null; timestamp:number|null; quality:Quality }
export interface Point {ts:number;value:number|null}
export interface Interval {state:State;start:number;end:number}
export interface Inverter {id:string;name:string;model:string|null;state:State;connected:boolean|null;alarmCount:number;ac:Measurement;dc:Measurement;voltage:Measurement;current:Measurement;temperature:Measurement;lifetime:Measurement;daily:Measurement;phases:Record<string,Measurement>;history:Point[];dcHistory:Point[];voltageHistory:Point[];currentHistory:Point[];timeline:Interval[];ratedDcKw:number|null;group:string|null;stateCode?:number|null;rawState?:string|number|null;rawStateTimestamp?:number|null;stateSource?:'mapped'|'canonical'|'feedback'|'unknown';ratedAcKw?:Measurement;energyPeriod?:RecordedEnergy;monthEnergy?:RecordedEnergy;energyDaily?:Point[];energyDailyCoverage?:Record<string,number>;telemetryMapping?:Record<string,{key:string;unit:string}>;staleAfterMs?:number;stateTimestamp?:number|null}
export interface PlantEvent {id:string;type:'alarm'|'state'|'connectivity'|'quality';severity:'warning'|'critical'|'info';device:string;title:string;timestamp:number;active:boolean}
export interface RecordedEnergy {value:number|null;coverage:number;start:number|null;end:number|null;issues:string[]}
export interface SiteTelemetry {ac:Measurement;dc:Measurement;energyCounter:Measurement;gridExport:Measurement;irradiance:Measurement;airTemperature:Measurement;cloudCover:Measurement;controllerName:string;arrayCount:number;gridMeterName:string|null}
export interface Plant {singleLine?:SingleLineTelemetry;id:string;name:string;timestamp:number;inverters:Inverter[];history:Point[];daily:Point[];events:PlantEvent[];demo:boolean;periodStart:number;periodEnd:number;source?:{name:string;version:string;simulated:boolean};site?:SiteTelemetry;gridHistory?:Point[];recordedEnergy?:RecordedEnergy;monthEnergy?:RecordedEnergy;energySource?:'controller'|'inverters';fetchedAt?:number;connection?:{transport:'websocket';state:string;receivedMessages:number;lastMessageAt:number|null;lastError?:string|null};dailyCoverage?:Record<string,number>}
export const stateNames:Record<State,string>={mppt:'MPPT',sleep:'Hvilemodus',standby:'Standby',startup:'Oppstart',throttled:'Begrenset',fault:'Feil',unknown:'Ukjent',running:'Kjører',stopped:'Stoppet'};
export function measurement(value:unknown,ts:number|null,now=Date.now(),staleMs=120000):Measurement {if(value===null||value===undefined||value==='')return {value:null,timestamp:ts,quality:'missing'};const n=typeof value==='boolean'?NaN:Number(value);return {value:Number.isFinite(n)?n:null,timestamp:ts,quality:!Number.isFinite(n)||ts!==null&&!Number.isFinite(ts)?'invalid':ts===null?'missing':now-ts>staleMs?'stale':'good'};}
export function convert(value:number,unit:string,target:'kW'|'kWh'|'V'|'A'|'°C'|'Hz'|'W/m²'|'%'):number {const factors:Record<string,number>={'W:kW':.001,'kW:kW':1,'MW:kW':1000,'Wh:kWh':.001,'kWh:kWh':1,'MWh:kWh':1000,'V:V':1,'A:A':1,'°C:°C':1,'Hz:Hz':1,'W/m²:W/m²':1,'%:%':1};const f=factors[`${unit}:${target}`];if(f===undefined)throw Error(`Unsupported unit ${unit} → ${target}`);return value*f;}
export function mapState(code:unknown,mapping:Record<string,State>):State{const raw=String(code);const normalized=raw.trim()!==''&&Number.isFinite(Number(raw))?String(Number(raw)):raw;return mapping[normalized]??'unknown';}
export function sumGood(values:Measurement[]):Measurement {if(!values.length||values.some(v=>v.value===null||v.quality!=='good'))return {value:null,timestamp:null,quality:'missing'};return {value:values.reduce((a,v)=>a+v.value!,0),timestamp:Math.min(...values.map(v=>v.timestamp!)),quality:'good'};}
export function ratio(ac:Measurement,dc:Measurement,minDc=1,maxSkewMs=10000):number|null{return ac.quality==='good'&&dc.quality==='good'&&ac.value!==null&&dc.value!==null&&dc.value>=minDc&&ac.timestamp!==null&&dc.timestamp!==null&&Math.abs(ac.timestamp-dc.timestamp)<=maxSkewMs?ac.value/dc.value*100:null;}
export function normalized(i:Inverter):number|null{return i.ratedDcKw&&i.ratedDcKw>0&&i.group&&i.ac.quality==='good'&&i.ac.value!==null?i.ac.value/i.ratedDcKw:null;}
export function counterDelta(a:Point,b:Point,opts:{maxGapMs?:number;rollover?:number}={}):{value:number|null;issue?:string} {
 if(a.value===null||b.value===null||!Number.isFinite(a.value)||!Number.isFinite(b.value)||a.value<0||b.value<0)return {value:null,issue:'invalid sample'};
 if(b.ts-a.ts>(opts.maxGapMs??900000))return {value:null,issue:'missing samples'};
 let value=b.value-a.value;if(value<0){if(opts.rollover&&a.value>opts.rollover*.9&&b.value<opts.rollover*.1)value=opts.rollover-a.value+b.value;else return {value:null,issue:'counter reset'};}return {value};
}
export function energy(points:Point[],start:number,end:number,opts:{maxGapMs?:number;rollover?:number}={}):{value:number|null;quality:Quality;coverage:number;issues:string[];version:string} {
 const p=[...new Map(points.filter(p=>Number.isFinite(p.ts)).map(p=>[p.ts,p])).values()].sort((a,b)=>a.ts-b.ts);let total=0,covered=0;const issues=new Set<string>();
 for(let k=1;k<p.length;k++){const a=p[k-1],b=p[k];if(b.ts<=start||a.ts>=end)continue;const dt=b.ts-a.ts;const delta=counterDelta(a,b,opts);if(delta.value===null){if(delta.issue)issues.add(delta.issue);continue;}const d=delta.value;const overlap=Math.min(end,b.ts)-Math.max(start,a.ts);total+=d*overlap/dt;covered+=overlap;}
 const coverage=end>start?Math.min(1,covered/(end-start)):0;if(coverage<.999)issues.add('incomplete coverage');return {value:covered?total:null,quality:coverage>=.999&&!issues.size?'good':'missing',coverage,issues:[...issues],version:'counter-delta-v1'};
}
export function reconstruct(transitions:{ts:number;state:State}[],start:number,end:number,maxGap=900000):Interval[]{const sorted=transitions.filter(t=>t.ts<=end).sort((a,b)=>a.ts-b.ts);const before=sorted.filter(t=>t.ts<=start).at(-1);let state:State=before&&start-before.ts<=maxGap?before.state:'unknown',cursor=start;const out:Interval[]=[];for(const t of sorted.filter(t=>t.ts>start)){out.push({state,start:cursor,end:t.ts});cursor=t.ts;state=t.state;}out.push({state,start:cursor,end});return out.filter(i=>i.end>i.start);}

export function booleanValue(value:unknown):boolean|null {
 if(value===true||value==='true')return true;
 if(value===false||value==='false')return false;
 return null;
}
// Run feedback describes running/stopped without assigning unverified KACO code meanings.
export function operatingStateEvidence(code:unknown,mapping:Record<string,State>,run:unknown,fault:unknown):{state:State;source:'mapped'|'canonical'|'feedback'|'unknown'} {
 if(booleanValue(fault)===true)return {state:'fault',source:'feedback'};
 const mapped=mapState(code,mapping);if(mapped!=='unknown')return {state:mapped,source:'mapped'};
 if(typeof code==='string'&&operatingModes.includes(code as State)&&code!=='unknown')return {state:code as State,source:'canonical'};
 const running=booleanValue(run);return {state:running===true?'running':running===false?'stopped':'unknown',source:running===null?'unknown':'feedback'};
}
export function operatingState(code:unknown,mapping:Record<string,State>,run:unknown,fault:unknown):State {return operatingStateEvidence(code,mapping,run,fault).state;}
