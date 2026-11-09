import {energyReportCsv} from '../domain/report-csv';
import {NgTemplateOutlet} from '@angular/common';
import {Component,computed,inject,signal,DestroyRef,ChangeDetectionStrategy} from '@angular/core';
import {Store} from '../core/store';
import {TranslatePipe} from '../core/locale';
import {Icon} from '../shared/icon';
import {Chart} from '../shared/chart';
import {completeEnergy,sumRecorded} from '../domain/energy-period';
import type {RecordedEnergy} from '../domain/solar';
import type {EnergyReport,EnergyReportRow} from '../domain/production-report';
import {localMidnight,localMonthStart} from '../domain/time';
const issueNames:Record<string,string>={'counter reset':'Teller nullstilt','missing samples':'Datagap','invalid sample':'Ugyldige målinger','incomplete coverage':'Delvis dekning','incomplete inverter coverage':'Mangler inverterdata','energy history unavailable':'Energihistorikk utilgjengelig','energy counter not mapped':'Energiteller ikke kartlagt'};
@Component({selector:'solar-reports',imports:[NgTemplateOutlet,TranslatePipe,Icon,Chart],templateUrl:'./reports.html',changeDetection:ChangeDetectionStrategy.OnPush})
export class Reports {
 s=inject(Store);month=signal(this.currentMonth());report=signal<EnergyReport|null>(null);loading=signal(false);error=signal('');exportStatus=signal('');exporting=signal(false);equipment=signal('site');private request=0;private controller?:AbortController;
 currentMonth(){return new Intl.DateTimeFormat('sv-SE',{timeZone:this.s.config.timezone,year:'numeric',month:'2-digit'}).format(this.s.demo()?this.s.plant()!.timestamp:Date.now());}
 constructor(){void this.load();const timer=setInterval(()=>{if(this.month()===this.currentMonth()&&!this.loading())void this.load(true);},60000);inject(DestroyRef).onDestroy(()=>{clearInterval(timer);this.controller?.abort();});}
 complete=completeEnergy;
 quality(e:RecordedEnergy){return e.value===null?'Mangler data':completeEnergy(e)?'Komplett':'Delvis';}
 issues(e:RecordedEnergy){return e.issues.filter(i=>i!=='incomplete coverage').map(i=>this.s.l.t(issueNames[i]??i)).join(' · ');}
 day(ts:number){return new Intl.DateTimeFormat(this.s.l.locale(),{timeZone:this.report()?.timezone??this.s.config.timezone,day:'2-digit',month:'short'}).format(ts);}
 timestamp(ts:number){return new Intl.DateTimeFormat(this.s.l.locale(),{timeZone:this.report()?.timezone??this.s.config.timezone,dateStyle:'medium',timeStyle:'short'}).format(ts);}
 title=computed(()=>{const r=this.report();return r?new Intl.DateTimeFormat(this.s.l.locale(),{timeZone:r.timezone,month:'long',year:'numeric'}).format(r.start):'';});
 missingHours(e:RecordedEnergy){const r=this.report();return r?this.s.format((r.end-r.start)*(1-e.coverage)/3600000,1):'—';}
 selected=computed(()=>this.report()?.inverters.find(i=>i.id===this.equipment()));
 cell(row:EnergyReportRow){return this.equipment()==='site'?row.site:row.inverters[this.equipment()];}
 chart=computed(()=>{const r=this.report();return {animation:false,grid:{left:65,right:22,top:25,bottom:48},tooltip:{trigger:'axis',renderMode:'richText',formatter:(items:{dataIndex:number}[])=>{const d=r?.days[items[0]?.dataIndex];if(!d)return '';const e=this.cell(d);return `${this.day(d.start)}\n${this.s.format(e.value,2)} kWh\n${this.s.l.t(this.quality(e))} · ${this.s.format(e.coverage*100,1)}%\n${this.issues(e)}`;}},xAxis:{type:'category',data:r?.days.map(d=>this.day(d.start)),axisLabel:{color:'#8699b0',interval:r&&r.days.length>14?3:0},axisLine:{lineStyle:{color:'#40516a'}},axisTick:{show:false}},yAxis:{type:'value',name:'kWh',nameTextStyle:{color:'#8699b0'},axisLabel:{color:'#8699b0'},splitLine:{lineStyle:{color:'#52657a33'}}},series:[{type:'bar',barMaxWidth:32,data:r?.days.map(d=>{const e=this.cell(d);return {value:e.value,itemStyle:{color:completeEnergy(e)?'#4a9ee4':'#dba859',borderRadius:[3,3,0,0]}};})}]};});
 async load(background=false){const id=++this.request;this.controller?.abort();this.controller=new AbortController();if(!background)this.report.set(null);this.loading.set(true);this.error.set('');this.exportStatus.set('');try{
  if(this.s.demo()){this.report.set(this.demoReport());return;}
  const response=await fetch(`${this.s.config.apiBase}/plants/${encodeURIComponent(this.s.config.plantId)}/reports/energy?month=${encodeURIComponent(this.month())}`,{signal:this.controller.signal});if(!response.ok)throw Error(response.status===401?'Økten er utløpt. Logg inn igjen for å hente rapporten.':'Rapportdata kunne ikke hentes. Prøv igjen.');const report=await response.json() as EnergyReport;if(id===this.request){this.report.set(report);if(this.equipment()!=='site'&&!report.inverters.some(i=>i.id===this.equipment()))this.equipment.set('site');}
 }catch(e){if(id===this.request&&!(e instanceof DOMException&&e.name==='AbortError'))this.error.set(e instanceof Error?e.message:'Rapportdata kunne ikke hentes. Prøv igjen.');}finally{if(id===this.request)this.loading.set(false);}}
 changeMonth(value:string){if(!value)return;this.month.set(value);void this.load();}
 csv(){const report=this.report();if(!report||this.loading())return;try{const url=URL.createObjectURL(new Blob([energyReportCsv(report)],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`solarops-energy-${report.month}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);this.exportStatus.set('CSV eksportert.');}catch{this.exportStatus.set('CSV-eksporten mislyktes. Prøv igjen.');}}
 async pdf(){const report=this.report();if(!report||this.exporting())return;if(this.s.demo()){window.print();return;}this.exporting.set(true);this.exportStatus.set('');try{const response=await fetch(`${this.s.config.apiBase}/plants/${encodeURIComponent(this.s.config.plantId)}/report?month=${report.month}&lang=${this.s.l.language()}&snapshot=${encodeURIComponent(report.id)}`);if(!response.ok)throw Error(response.status===409?'Rapportøyeblikket er utløpt. Oppdater rapporten før eksport.':'Rapporten kunne ikke genereres. Kontroller datagrunnlag og server.');const url=URL.createObjectURL(await response.blob()),a=document.createElement('a');a.href=url;a.download=`solarops-${report.month}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);this.exportStatus.set('PDF eksportert.');}catch(e){this.exportStatus.set((e as Error).message);}finally{this.exporting.set(false);}}
 private demoReport():EnergyReport|null {
  const p=this.s.plant()!;if(this.month()!==this.currentMonth())return null;const now=p.timestamp,start=localMonthStart(now,this.s.config.timezone),today=localMidnight(now,this.s.config.timezone),empty=():RecordedEnergy=>({value:null,coverage:0,start:null,end:null,issues:['incomplete coverage']});
  const days:EnergyReportRow[]=[];for(let t=start;t<now;){const end=Math.min(localMidnight(t+36*3600000,this.s.config.timezone),now),inverters=Object.fromEntries(p.inverters.map(i=>[i.id,t===today?{value:i.daily.value,coverage:i.daily.value===null?0:1,start:t,end,issues:[]}:empty()]));days.push({start:t,end,site:sumRecorded(Object.values(inverters)),inverters});t=end;}
  const inverters=p.inverters.map(i=>({id:i.id,name:i.name,period:{value:i.daily.value,coverage:(now-today)/(now-start),start:today,end:now,issues:['incomplete coverage']}}));return {id:'demo',month:this.month(),siteId:p.id,siteName:p.name,timezone:this.s.config.timezone,start,end:now,generatedAt:now,ongoing:true,simulated:true,source:'inverters',version:'counter-delta-v1',inverters,site:sumRecorded(inverters.map(i=>i.period)),days};
 }
}
