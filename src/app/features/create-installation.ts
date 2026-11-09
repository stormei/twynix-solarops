import {selectDetectedInverters} from '../domain/bulk-inverters';
import type {SetupDevice} from '../domain/device-discovery';
import {initialInverter,initialReadiness,initialSource,type InitialDeviceInfo} from '../domain/initial-setup';
import {TelemetryMap} from './telemetry-map';
import {Component,inject,signal,output,ChangeDetectionStrategy} from '@angular/core';
import {HttpClient,HttpErrorResponse} from '@angular/common/http';
import {firstValueFrom} from 'rxjs';
import {Store} from '../core/store';
import {TranslatePipe} from '../core/locale';
import {Icon} from '../shared/icon';
import type {FieldMapping,CommissionDraft,CommissionRow,CommissionReview,CommissionChange} from '../domain/commission';
type Device=SetupDevice;
@Component({selector:'solar-create-installation',imports:[TranslatePipe,Icon,TelemetryMap],templateUrl:'./create-installation.html',changeDetection:ChangeDetectionStrategy.OnPush})
export class CreateInstallation {
 s=inject(Store);private http=inject(HttpClient);cancelled=output<void>();saved=output<unknown>();busyChange=output<boolean>();
 bulkSelecting=signal(false);instance=signal('');step=signal(1);busy=signal(false);error=signal('');canCreate=signal(false);devices=signal<Device[]>([]);review=signal<CommissionReview|null>(null);activeRow=signal(0);deviceSearch=signal('');otherSearch=signal('');sourceChoice=signal<''|'physical'|'simulation'>('');details=new Map<string,InitialDeviceInfo>();
 private fallbackKey='site-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,6);
 draft=signal<CommissionDraft>({templateId:'minimal-site',site:{name:'',siteKey:'',timezone:this.s.config.timezone,dataSourceKind:'physical'},equipment:[]});
 constructor(){void this.load();}
 private loading(value:boolean){this.busy.set(value);this.busyChange.emit(value);}
 private failureMessage(e:unknown){return e instanceof HttpErrorResponse?(e.error?.error??'Kunne ikke fullføre oppsettet. Prøv igjen.'):e instanceof Error?e.message:'Kunne ikke fullføre oppsettet. Prøv igjen.';}
 private fail(e:unknown){this.error.set(this.failureMessage(e));}
 async load(){this.loading(true);try{const c=await firstValueFrom(this.http.get<{canCreate:boolean;url:string;devices:Device[]}>('/api/setup/create/options'));this.instance.set(c.url);this.canCreate.set(c.canCreate);this.devices.set(c.devices.sort((a,b)=>(a.label||a.name).localeCompare(b.label||b.name)));}catch(e){this.fail(e);}finally{this.loading(false);}}
 name(value:string){this.review.set(null);this.draft.update(d=>({...d,site:{...d.site,name:value,siteKey:value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80)||this.fallbackKey}}));}
 selected(id:string){return this.draft().equipment.some(r=>r.deviceId===id);}
 unavailable(id:string){const device=this.devices().find(d=>d.id.id===id),info=this.details.get(id);return device?.identification==='other'?'Annet utstyr': info?.siteIds.length?'Allerede i et anlegg':info?.metadata.solaropsRole&&info.metadata.solaropsRole!=='inverter'?'Annet utstyr':'';}
 deviceList(){return this.matchingDevices().filter(d=>d.identification==='inverter');}
 otherDevices(){const search=this.otherSearch().trim().toLowerCase();return this.devices().filter(d=>d.identification!=='inverter'&&((d.label||d.name).toLowerCase().includes(search)||d.name.toLowerCase().includes(search)));}
 otherDeviceCount(){return this.devices().filter(d=>d.identification!=='inverter').length;}
 inverterCount(){return this.devices().filter(d=>d.identification==='inverter').length;}
 private matchingDevices(){const search=this.deviceSearch().trim().toLowerCase();return this.devices().filter(d=>(d.label||d.name).toLowerCase().includes(search)||d.name.toLowerCase().includes(search));}
 mappingSummary(device:Device){return [device.savedMappings.acPower,device.savedMappings.lifetimeEnergy].filter((m):m is FieldMapping=>!!m).map(m=>m.key+' · '+m.unit).join(' / ');}
 async toggle(device:Device,event:Event){const checkbox=event.target as HTMLInputElement;if(this.busy()){checkbox.checked=this.selected(device.id.id);return;}this.error.set('');this.review.set(null);const id=device.id.id;if(this.selected(id)){this.draft.update(d=>({...d,equipment:d.equipment.filter(r=>r.deviceId!==id)}));return;}if(this.draft().equipment.length>=32){checkbox.checked=false;return;}
  this.loading(true);try{const info=await this.deviceInfo(id);const row=initialInverter(id,device.name,info);this.draft.update(d=>({...d,equipment:[...d.equipment,row]}));}catch(e){this.fail(e);}finally{checkbox.checked=this.selected(id);this.loading(false);}
 }
 private async deviceInfo(id:string){let info=this.details.get(id);if(!info){info=await firstValueFrom(this.http.get<InitialDeviceInfo>('/api/setup/create/devices/'+id));this.details.set(id,info);}return info;}
 pendingInverters(){return this.devices().filter(d=>d.identification==='inverter'&&!this.selected(d.id.id)&&!this.unavailable(d.id.id));}
 async selectAll(){if(this.busy()||!this.pendingInverters().length)return;this.error.set('');this.review.set(null);this.bulkSelecting.set(true);this.loading(true);try{const result=await selectDetectedInverters(this.pendingInverters(),this.draft().equipment,id=>this.deviceInfo(id));this.draft.update(d=>({...d,equipment:result.equipment}));if(result.limitExceeded)this.error.set('Velg maksimalt 32 invertere per installasjon.');else if(result.failures.length)this.error.set(result.failures.map(f=>(f.device.label||f.device.name)+': '+this.s.l.t(this.failureMessage(f.error))).join(' · '));}catch(e){this.fail(e);}finally{this.bulkSelecting.set(false);this.loading(false);}}
 source(){return initialSource(this.draft().equipment.map(r=>this.details.get(r.deviceId!)!));}
 canContinue(){const source=this.source();return !!this.draft().site.name.trim()&&!!this.draft().equipment.length&&!source.conflict&&(source.unclassified?!!this.sourceChoice()&&(!source.kind||this.sourceChoice()===source.kind):!!source.kind);}
 continue(){if(!this.canContinue())return;this.draft.update(d=>({...d,site:{...d.site,dataSourceKind:this.source().kind||this.sourceChoice()||'physical'}}));this.activeRow.set(0);this.error.set('');this.step.set(2);}
 rowName(row:CommissionRow){const device=this.devices().find(d=>d.id.id===row.deviceId);return device?.label||device?.name||row.name;}
 keys(row:CommissionRow){return this.details.get(row.deviceId!)?.keys??[];}
 latest(row:CommissionRow){return this.details.get(row.deviceId!)?.latest??{};}
 readiness(row:CommissionRow){return initialReadiness(row,this.details.get(row.deviceId!));}
 errors(){return this.draft().equipment.reduce((n,r)=>n+this.readiness(r).errors.length,0);}
 statusMapped(row:CommissionRow){return ['operatingState','runFeedback','faultActive'].some(key=>!!row.mapping[key]?.key);}
 async refresh(row:CommissionRow){this.loading(true);this.error.set('');try{this.details.set(row.deviceId!,await firstValueFrom(this.http.get<InitialDeviceInfo>('/api/setup/create/devices/'+row.deviceId)));}catch(e){this.fail(e);}finally{this.loading(false);}}
 setMapping(index:number,mapping:Record<string,FieldMapping>){this.review.set(null);this.draft.update(d=>({...d,equipment:d.equipment.map((r,i)=>i===index?{...r,mapping}:r)}));}
 async preview(){if(this.errors())return;this.loading(true);this.error.set('');try{const draft=structuredClone(this.draft());for(const row of draft.equipment)row.mapping=Object.fromEntries(Object.entries(row.mapping).filter(([,m])=>m.key.trim()).map(([field,m])=>[field,{key:m.key.trim(),unit:m.unit}]));this.review.set(await firstValueFrom(this.http.post<CommissionReview>('/api/setup/create/preview',draft)));this.step.set(3);}catch(e){this.fail(e);}finally{this.loading(false);}}
 async save(){if(!this.review()?.canSave||this.busy())return;this.loading(true);this.error.set('');try{this.saved.emit(await firstValueFrom(this.http.post('/api/setup/create/save',{planId:this.review()!.id,activate:true})));}catch(e){this.fail(e);this.review.set(null);}finally{this.loading(false);}}
 reviewIssues(){const grouped=new Map<string,{severity:'error'|'warning';message:string;entities:string[]}>();for(const issue of this.review()?.issues??[]){const key=issue.severity+'|'+issue.message,group=grouped.get(key)??{severity:issue.severity,message:issue.message,entities:[]};group.entities.push(issue.entity);grouped.set(key,group);}return [...grouped.values()];}
 changeLabel(change:CommissionChange){return change.kind==='asset'?'Opprett asset':change.kind==='profile'?'Opprett profil':change.kind==='attributes'?'Oppdater konfigurasjon':'Legg til i installasjonen';}
}
