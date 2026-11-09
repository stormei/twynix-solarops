import type {AccountProfile} from '../domain/account';
import {loginErrorMessage} from '../domain/login-error';
import {Preferences} from './preferences';
import type {AppPreferences} from '../domain/preferences';
import {freshMeasurement,refreshInverter} from '../domain/operations';
import {inject,Injectable,signal,computed,DestroyRef} from '@angular/core';
import {Locale} from './locale';
import {HttpClient,HttpErrorResponse} from '@angular/common/http';
import {firstValueFrom,Subscription} from 'rxjs';
import {localMidnight} from '../domain/time';
import {Plant,Point,PlantEvent,State,stateNames,sumGood} from '../domain/solar';
export interface Config {demoEnabled:boolean;apiBase:string;plantId:string;timezone:string;plantName?:string;serverVersion?:string;simulatedSource?:boolean;configured?:boolean;thingsboardUrl?:string;discoveryMode?:string;setupAvailable?:boolean;endpointConfigured?:boolean;preferences?:AppPreferences}
@Injectable({providedIn:'root'})
export class Store {
 readonly l=inject(Locale);readonly preferences=inject(Preferences);private http=inject(HttpClient); config:Config={demoEnabled:false,apiBase:'/api',plantId:'main',timezone:'Europe/Oslo'};
 account=signal<AccountProfile|null>(null);accountLoading=signal(false);accountError=signal('');private accountRequest=0;
 clearAccount(){this.accountRequest++;this.account.set(null);this.accountLoading.set(false);this.accountError.set('');}
 async loadAccount(){const request=++this.accountRequest;this.account.set(null);this.accountError.set('');if(this.demo())return;this.accountLoading.set(true);try{const profile=await firstValueFrom(this.http.get<AccountProfile>(`${this.config.apiBase}/session/user`));if(request===this.accountRequest)this.account.set(profile);}catch{if(request===this.accountRequest)this.accountError.set('Kunne ikke hente kontodetaljer. Prøv igjen.');}finally{if(request===this.accountRequest)this.accountLoading.set(false);}}
 now=signal(Date.now());
 connection=signal<Plant['connection']>(undefined);
 liveConnected=computed(()=>!this.error()&&this.connection()?.state==='connected');
 connectionLabel=computed(()=>this.demo()?'Demomiljø':this.liveConnected()?'Sanntid tilkoblet':this.plant()?'Kobler til sanntid …':'Ikke tilkoblet');
 authenticating=signal(false);plant=signal<Plant|null>(null);loading=signal(true);error=signal('');demo=signal(false);range=signal('I dag');customStart=signal('');customEnd=signal('');updated=signal(Date.now());private stream:EventSource|null=null;private historyRequest?:Subscription;
 inverters=computed(()=>this.demo()?this.plant()?.inverters??[]:this.plant()?.inverters.map(i=>refreshInverter(i,this.now()))??[]);ac=computed(()=>this.plant()?.site?.ac?freshMeasurement(this.plant()!.site!.ac,this.demo()?this.plant()!.timestamp:this.now()):sumGood(this.inverters().map(i=>i.connected===false?{value:null,timestamp:null,quality:'missing' as const}:i.ac)));dc=computed(()=>this.plant()?.site?.dc?freshMeasurement(this.plant()!.site!.dc,this.demo()?this.plant()!.timestamp:this.now()):sumGood(this.inverters().map(i=>i.connected===false?{value:null,timestamp:null,quality:'missing' as const}:i.dc)));daily=computed(()=>sumGood(this.inverters().map(i=>i.daily)));lifetime=computed(()=>this.plant()?.site?.energyCounter??sumGood(this.inverters().map(i=>i.lifetime)));alarms=computed(()=>this.plant()?.events.filter(e=>e.type==='alarm'&&e.active)??[]);
 constructor(){const timer=setInterval(()=>this.now.set(Date.now()),1000);inject(DestroyRef).onDestroy(()=>{clearInterval(timer);this.stream?.close();this.historyRequest?.unsubscribe();});void this.init();}
 async refreshConfig(){const config=await firstValueFrom(this.http.get<Config>('/config.json'));if(typeof config?.setupAvailable!=='boolean')throw Error('Invalid server configuration');this.config=config;this.preferences.configure(config.preferences,config.setupAvailable);}
 async init(){try{await this.refreshConfig();if(this.config.configured)await this.load(false);else{this.plant.set(null);this.loading.set(false);this.error.set('');}}catch{this.loading.set(false);this.error.set('Konfigurasjonen kunne ikke lastes.');}}
 async load(demo:boolean,preserve=false){this.stream?.close();this.connection.set(undefined);if(!preserve)this.plant.set(null);this.demo.set(demo);this.loading.set(true);this.error.set('');try{if(demo){this.plant.set((await import('./demo')).demoPlant());}else{this.plant.set(await firstValueFrom(this.http.get<Plant>(`${this.config.apiBase}/plants/${this.config.plantId}`)));this.stream=new EventSource(`${this.config.apiBase}/plants/${this.config.plantId}/stream`);this.stream.addEventListener('connection',e=>{this.connection.set(JSON.parse((e as MessageEvent).data));});this.stream.onmessage=e=>{const incoming=JSON.parse(e.data) as Plant;if(incoming.connection)this.connection.set(incoming.connection);const previous=this.plant();this.plant.set(previous?{...incoming,history:this.appendLive(previous.history,incoming.site?.ac??sumGood(incoming.inverters.map(i=>i.ac)),incoming),gridHistory:this.appendLive(previous.gridHistory??[],incoming.site?.gridExport,incoming),daily:incoming.daily,periodStart:previous.periodStart,periodEnd:previous.periodEnd,inverters:incoming.inverters.map(i=>{const old=previous.inverters.find(o=>o.id===i.id);return old?{...i,history:this.appendLive(old.history,i.ac,incoming),dcHistory:this.appendLive(old.dcHistory,i.dc,incoming),voltageHistory:this.appendLive(old.voltageHistory,i.voltage,incoming),currentHistory:this.appendLive(old.currentHistory,i.current,incoming),timeline:i.timeline.length?i.timeline:old.timeline}:i;})}:incoming);this.error.set('');this.updated.set(Date.now());};this.stream.addEventListener('connection-error',()=>this.error.set('Sanntid utilgjengelig. Kontroller forbindelsen eller logg inn igjen.'));this.stream.onerror=()=>{this.connection.set(undefined);this.error.set('Sanntidsforbindelsen er brutt. Venter på ny tilkobling.');};}this.updated.set(Date.now());}catch(e){this.error.set(e instanceof HttpErrorResponse&&e.status===401?'':'ThingsBoard er ikke tilkoblet. Logg inn og kontroller serverkonfigurasjonen.');}finally{this.loading.set(false);}}
 async login(username:string,password:string){this.clearAccount();this.authenticating.set(true);this.error.set('');try{await firstValueFrom(this.http.post(`${this.config.apiBase}/session`,{username,password}));await this.load(false);}catch(e){this.error.set(loginErrorMessage(e instanceof HttpErrorResponse?e.status:502,e instanceof HttpErrorResponse?e.error?.code:undefined));}finally{this.authenticating.set(false);}}
 async resetSetup(){await firstValueFrom(this.http.post('/api/setup/reset',{}));this.clearAccount();this.stream?.close();this.historyRequest?.unsubscribe();this.connection.set(undefined);this.plant.set(null);this.error.set('');this.loading.set(false);this.demo.set(false);this.config=await firstValueFrom(this.http.get<Config>('/config.json'));}
 async logout(){if(!this.demo())await firstValueFrom(this.http.delete(`${this.config.apiBase}/session`));this.clearAccount();this.stream?.close();this.plant.set(null);this.demo.set(false);this.connection.set(undefined);this.error.set('');}
 selectRange(range:string){this.range.set(range);this.historyRequest?.unsubscribe();if(this.demo()||!this.plant())return;this.loading.set(true);const q=this.bounds();this.historyRequest=this.http.get<Plant>(`${this.config.apiBase}/plants/${this.config.plantId}?start=${q.start}&end=${q.end}`).subscribe({next:p=>{this.plant.set(p);this.loading.set(false);},error:()=>{this.error.set('Historiske data kunne ikke hentes.');this.loading.set(false);}});}
 age(ts:number|null){if(ts===null)return this.l.t('Mangler');const seconds=Math.max(0,Math.floor(((this.demo()?(this.plant()?.timestamp??this.now()):this.now())-ts)/1000));return seconds<60?this.l.t('{count} sek siden',{count:seconds}):this.l.t('{count} min siden',{count:Math.floor(seconds/60)});}
 eventTitle(event:PlantEvent):string{
  if(event.type==='state'&&event.title.startsWith('Driftstilstand: ')){
   const state=event.title.slice('Driftstilstand: '.length) as State;
   return this.l.t('Driftstilstand')+': '+this.l.t(stateNames[state]??stateNames.unknown);
  }
  return this.demo()||event.type==='quality'?this.l.t(event.title):event.title;
 }
 appendLive(points:Point[],sample:{value:number|null;timestamp:number|null;quality:string}|undefined,plant:Plant):Point[]{
  if(!sample||sample.timestamp===null||sample.value===null||sample.quality!=='good'||!['I dag','12 timer','24 timer'].includes(this.range()))return points;
  const last=points.at(-1);if(last&&sample.timestamp<=last.ts)return points;
  const bounds=this.bounds(),upper=this.range()==='I dag'?bounds.end:plant.fetchedAt??Date.now();if(sample.timestamp<bounds.start||sample.timestamp>upper)return points;
  return [...points,...(last&&sample.timestamp-last.ts>180000?[{ts:last.ts+1,value:null}]:[]),{ts:sample.timestamp,value:sample.value}].slice(-5000);
 }
 subtotal(key:'ac'|'dc'|'daily'|'lifetime'){const good=this.inverters().map(i=>i[key]).filter(m=>m.value!==null&&m.quality==='good');return {value:good.length?good.reduce((a,m)=>a+m.value!,0):null,count:good.length};}

 bounds(){
  const p=this.plant(),end=p?.fetchedAt??p?.timestamp??Date.now(),zone=this.config.timezone;
  const today=localMidnight(end,zone),r=this.range();
  if(r==='I går')return {start:localMidnight(today-12*3600000,zone),end:today};
  if(r==='7 dager')return {start:end-7*86400000,end};
  if(r==='30 dager')return {start:end-30*86400000,end};
  if(r==='12 timer')return {start:end-12*3600000,end};
  if(r==='24 timer')return {start:end-24*3600000,end};
  if(r==='Egendefinert'&&this.customStart()&&this.customEnd()){
   const start=localMidnight(Date.parse(this.customStart()+'T12:00:00Z'),zone);
   const last=localMidnight(Date.parse(this.customEnd()+'T12:00:00Z'),zone);
   return {start,end:localMidnight(last+36*3600000,zone)-1};
  }
  return {start:today,end:localMidnight(today+36*3600000,zone)};
 }

 chartData(points:Point[]):Point[]{if(!this.demo())return points;const r=this.range();if(r==='I dag'||r==='12 timer'||r==='24 timer')return points;if(r==='I går')return points.map(p=>({ts:p.ts-86400000,value:p.value===null?null:p.value*.92}));const b=this.bounds();const days=Math.min(30,Math.max(1,Math.ceil((b.end-b.start)/86400000)));return Array.from({length:days},(_,d)=>points.filter(p=>p.value!==null).map(p=>({ts:b.start+d*86400000+(p.ts%86400000),value:p.value===null?null:p.value*(.65+.3*Math.abs(Math.sin(d+1)))}))).flat().sort((a,b)=>a.ts-b.ts);}
 format(v:number|null|undefined,dec=1){return v===null||v===undefined?'—':new Intl.NumberFormat(this.l.locale(),{maximumFractionDigits:dec,minimumFractionDigits:dec}).format(v);}
 time(ts:number){return new Intl.DateTimeFormat(this.l.locale(),{hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:this.config.timezone}).format(ts);}
 date(ts:number){return new Intl.DateTimeFormat(this.l.locale(),{day:'numeric',month:'long',year:'numeric',timeZone:this.config.timezone}).format(ts);}
}
