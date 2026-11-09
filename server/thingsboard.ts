import {discoverStandard} from './standard.ts';
import type {Metadata} from './standard.ts';
import {Settings,Mapping} from './config.ts';
export interface TbSample {ts:number;value:string|number|boolean|null}
export type Telemetry=Record<string,TbSample[]>;
export interface Entity {id:{id:string;entityType:string};name:string;label?:string;type?:string;createdTime?:number;ownerId?:{id:string;entityType:string};solarops?:Metadata}
export interface Relation {to:{id:string;entityType:string};type:string}
export interface Alarm {id:{id:string};originator:{id:string};type:string;severity:string;status:string;createdTime:number;startTs:number;cleared?:boolean}
export interface Discovery {relations?:{from:Entity['id'];to:Entity['id'];type:string}[];asset:Entity;devices:Entity[];arrays:Entity[];meter?:Entity;controller?:Entity;all:Entity[]}
export class ApiError extends Error {constructor(public status:number,message='ThingsBoard request failed',public code?:'TB_URL_MISSING'|'TB_UNREACHABLE'|'TB_UNAVAILABLE'|'TB_TEST_FAILED'){super(message);}}
export class ThingsBoard {
 private discoveryCache?:{value:Discovery;until:number};
 private attributeCache=new Map<string,{value:{key:string;value:unknown;lastUpdateTs?:number}[];until:number}>();
 private alarmCache=new Map<string,{value:Alarm[];until:number}>();
 private liveValues=new Map<string,Telemetry>();
 private liveAttributes=new Map<string,Record<string,{ts:number;value:unknown}>>();
 private liveReady=false;
 setLiveReady(ready:boolean){this.liveReady=ready;if(!ready){this.liveValues.clear();this.liveAttributes.clear();}}
 ingestLive(rows:{entityId:{id:string};latest?:Record<string,Record<string,{ts:number;value:unknown}>>}[]){
  for(const row of rows){
   if(!row.entityId?.id)continue;
   const id=row.entityId.id,values=this.liveValues.get(id)??{};
   for(const [key,p] of Object.entries(row.latest?.['TIME_SERIES']??{})){
    if(Number.isFinite(p.ts)&&(!values[key]?.length||p.ts>=values[key][0].ts))values[key]=[{ts:p.ts,value:p.value as TbSample['value']}];
   }
   this.liveValues.set(id,values);
   const attrs=this.liveAttributes.get(id)??{};
   for(const type of ['ATTRIBUTE','SERVER_ATTRIBUTE','SHARED_ATTRIBUTE','CLIENT_ATTRIBUTE'])for(const [key,p] of Object.entries(row.latest?.[type]??{}))if(!attrs[key]||p.ts>=attrs[key].ts)attrs[key]=p;
   this.liveAttributes.set(id,attrs);
  }
 }
 constructor(public config:Settings,public token:string,private transport:typeof fetch=fetch){}
 async request<T>(path:string,method='GET',body?:unknown):Promise<T>{
  let response:Response;
  try{response=await this.transport(this.config.url+path,{method,headers:{'Content-Type':'application/json',...(this.token?{'X-Authorization':`Bearer ${this.token}`}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});}catch(e){if(e instanceof ApiError)throw e;throw new ApiError(502,'Cannot reach the configured ThingsBoard server','TB_UNREACHABLE');}
  if(!response.ok)throw new ApiError(response.status,response.status>=500?'ThingsBoard server unavailable':'ThingsBoard request failed',response.status>=500?'TB_UNAVAILABLE':undefined);const text=await response.text();return (text?JSON.parse(text):undefined) as T;
 }
 async discover():Promise<Discovery>{
  if(this.discoveryCache&&Date.now()<this.discoveryCache.until)return this.discoveryCache.value;
  let discovery:Discovery;
  if(this.config.discoveryMode==='standard'){discovery=await discoverStandard(this);}
  else if(this.config.devicePrefix){
   // The 4.4.0 user-devices endpoint returns only devices authorized for this identity.
   const prefix=this.config.devicePrefix,all:Entity[]=[];
   for(let page=0;page<100;page++){
    const q=new URLSearchParams({pageSize:'100',page:String(page),textSearch:prefix,sortProperty:'name',sortOrder:'ASC'});
    const result=await this.request<{data:Entity[];hasNext:boolean}>(`/api/user/devices?${q}`);
    all.push(...result.data.filter(d=>d.name.startsWith(prefix)));
    if(!result.hasNext)break;if(page===99)throw new ApiError(422,'Discovery exceeds bounded size');
   }
   const suffix=(d:Entity)=>d.name.slice(prefix.length);
   const devices=all.filter(d=>/^INV-/.test(suffix(d)));
   const arrays=all.filter(d=>/^PV-/.test(suffix(d)));
   const meter=all.find(d=>/^GM-/.test(suffix(d))),controller=all.find(d=>suffix(d)==='Simulation');
   // This is a configured logical site, not a fabricated ThingsBoard asset UUID.
   discovery={asset:{id:{id:this.config.plantId,entityType:'SITE'},name:this.config.plantName??prefix.trim()},devices,arrays,meter,controller,all};
  }else{
   const asset=await this.request<Entity>(`/api/asset/${encodeURIComponent(this.config.assetId)}`);
   const relations=await this.request<Relation[]>(`/api/relations/info?fromId=${encodeURIComponent(asset.id.id)}&fromType=ASSET&relationTypeGroup=COMMON`);
   const ids=[...new Set(relations.filter(r=>r.type===this.config.relation&&r.to.entityType==='DEVICE').map(r=>r.to.id))];
   if(ids.length>1000)throw new ApiError(422,'Too many related devices');
   const devices:Entity[]=[];
   for(let k=0;k<ids.length;k+=8){const results=await Promise.allSettled(ids.slice(k,k+8).map(id=>this.request<Entity>(`/api/device/${encodeURIComponent(id)}`)));for(const r of results){if(r.status==='fulfilled')devices.push(r.value);else if(r.reason instanceof ApiError&&[401,403].includes(r.reason.status))throw r.reason;}}
   discovery={asset,devices,arrays:[],all:devices};
  }
  if(!discovery.devices.length)throw new ApiError(422,'No authorized inverters match this plant configuration');
  this.discoveryCache={value:discovery,until:Date.now()+60000};return discovery;
 }
 keys(id:string){return this.request<string[]>(`/api/plugins/telemetry/DEVICE/${encodeURIComponent(id)}/keys/timeseries`);}
 async attributes(id:string){
  const merge=(values:{key:string;value:unknown;lastUpdateTs?:number}[])=>{const all=new Map(values.map(v=>[v.key,v]));if(this.liveReady)for(const [key,p] of Object.entries(this.liveAttributes.get(id)??{}))all.set(key,{key,value:p.value,lastUpdateTs:p.ts});return [...all.values()];};
  const cached=this.attributeCache.get(id);if(cached&&cached.until>Date.now())return merge(cached.value);
  const value=await this.request<{key:string;value:unknown;lastUpdateTs?:number}[]>(`/api/plugins/telemetry/DEVICE/${encodeURIComponent(id)}/values/attributes?keys=active,manufacturer,model,ratedDcKw,comparisonGroup,identifier,source,nodeFqn`);
  this.attributeCache.set(id,{value,until:Date.now()+60000});return merge(value);
 }
 latest(id:string,mapping:Record<string,Mapping>=this.config.mapping){const keys=[...new Set(Object.values(mapping).map(m=>m.key))];if(!keys.length)return Promise.resolve({} as Telemetry);const live=this.liveValues.get(id);if(this.liveReady&&live)return Promise.resolve(Object.fromEntries(keys.filter(k=>live[k]).map(k=>[k,live[k]])));return this.request<Telemetry>(`/api/plugins/telemetry/DEVICE/${encodeURIComponent(id)}/values/timeseries?keys=${encodeURIComponent(keys.join(','))}`);}
 history(id:string,keys:string[],start:number,end:number,aggregation='NONE',limit=10000,interval=600000){
  if(!keys.length||end<start)return Promise.resolve({} as Telemetry);
  const q=new URLSearchParams({keys:keys.join(','),startTs:String(start),endTs:String(end),agg:aggregation,limit:String(limit),orderBy:'ASC',interval:String(interval)});
  return this.request<Telemetry>(`/api/plugins/telemetry/DEVICE/${encodeURIComponent(id)}/values/timeseries${this.config.historyPath??''}?${q}`);
 }
 preceding(id:string,key:string,start:number){const q=new URLSearchParams({keys:key,startTs:'0',endTs:String(start),agg:'NONE',limit:'1',orderBy:'DESC'});return this.request<Telemetry>(`/api/plugins/telemetry/DEVICE/${encodeURIComponent(id)}/values/timeseries${this.config.historyPath??''}?${q}`);}
 async rawHistory(id:string,keys:string[],start:number,end:number):Promise<Telemetry>{
  const out:Telemetry={};for(let t=start;t<end;t+=2*3600000){const data=await this.history(id,keys,t,Math.min(end,t+2*3600000),'NONE',10000);for(const key of keys){if((data[key]?.length??0)>=10000)throw new ApiError(422,'Sample limit reached: interval cannot be validated');(out[key]??=[]).push(...data[key]??[]);}}
  for(const key of keys)out[key]=[...new Map((out[key]??[]).map(p=>[p.ts,p])).values()].sort((a,b)=>a.ts-b.ts);
  return out;
 }
 async alarms(id:string,start?:number,end?:number):Promise<Alarm[]>{
  const cached=this.alarmCache.get(id);if(start===undefined&&cached&&cached.until>Date.now())return cached.value;
  const all:Alarm[]=[];for(let page=0;page<50;page++){const q=new URLSearchParams({pageSize:'100',page:String(page),sortProperty:'createdTime',sortOrder:'DESC',...(start!==undefined?{startTime:String(start),endTime:String(end)}:{searchStatus:'ACTIVE'})});const result=await this.request<{data:Alarm[];hasNext:boolean}>(`/api/alarm/DEVICE/${encodeURIComponent(id)}?${q}`);all.push(...result.data);if(!result.hasNext){if(start===undefined)this.alarmCache.set(id,{value:all,until:Date.now()+10000});return all;}}throw new ApiError(422,'Alarm result exceeds bounded query size');
 }
}
