import {NgTemplateOutlet} from '@angular/common';
import {SingleLine} from './single-line';
import {TranslatePipe} from '../core/locale';
import {Component,computed,inject,signal,viewChild,ChangeDetectionStrategy} from '@angular/core';
import {ActivatedRoute,RouterLink} from '@angular/router';
import {Store} from '../core/store';
import {stateNames,type Inverter,type RecordedEnergy,type Measurement,type SiteTelemetry} from '../domain/solar';
import {completeEnergy} from '../domain/energy-period';
import {inverterStatus,statusNames,statusTone,type InverterStatus} from '../domain/operations';
import {Icon} from '../shared/icon';
import {Chart,powerOptions} from '../shared/chart';
@Component({selector:'solar-overview',imports:[TranslatePipe,RouterLink,Icon,Chart,SingleLine,NgTemplateOutlet],templateUrl:'./overview.html',changeDetection:ChangeDetectionStrategy.OnPush})
export class Overview {
 s=inject(Store);route=inject(ActivatedRoute);list=this.route.snapshot.data['list'];filter=signal('Alle');view=signal('table');sort=signal('Navn');search=signal('');expanded=signal(false);chart=viewChild<Chart>('production');names=stateNames;
 filters=['Alle','I drift','Standby','Stoppet','Feil','Frakoblet','Foreldet','Mangler data','Ukjent'];
 statusRows=[{filter:'I drift',label:'I drift',color:'green'},{filter:'Standby',label:'Standby',color:'gray'},{filter:'Stoppet',label:'Stoppet',color:'gray'},{filter:'Feil',label:'Feil',color:'red'},{filter:'Frakoblet',label:'Frakoblet',color:'gray'},{filter:'Foreldet',label:'Foreldede data',color:'yellow'},{filter:'Mangler data',label:'Mangler data',color:'yellow'}];
 alarmUnavailable=computed(()=>!!this.s.plant()?.events.some(e=>e.id.startsWith('alarm-unavailable-')));faultInverters=computed(()=>this.s.inverters().filter(i=>this.status(i)==='fault'));
 siteReadings(site:SiteTelemetry){return [{label:'Netto mot nett',value:site.gridExport,unit:'kW'},{label:'DC-effekt nå',value:site.dc,unit:'kW'},{label:'Solinnstråling',value:site.irradiance,unit:'W/m²'},{label:'Lufttemperatur',value:site.airTemperature,unit:'°C'},{label:'Skydekke',value:site.cloudCover,unit:'%'}];}
 constructor(){this.s.selectRange('I dag');}
 status(i:Inverter){return inverterStatus(i,this.s.demo()?this.s.plant()!.timestamp:this.s.now());}
 label(i:Inverter){return statusNames[this.status(i)];}
 tone(i:Inverter){return statusTone(this.status(i));}
 matches(i:Inverter,f:string){const state=this.status(i);return f==='Alle'||f==='I drift'&&['running','starting','limited'].includes(state)||f==='Standby'&&state==='standby'||f==='Stoppet'&&state==='stopped'||f==='Feil'&&state==='fault'||f==='Frakoblet'&&state==='offline'||f==='Foreldet'&&state==='stale'||f==='Mangler data'&&state==='missing'||f==='Ukjent'&&state==='unknown';}
 filtered=computed(()=>this.s.inverters().filter(i=>i.name.toLowerCase().includes(this.search().toLowerCase())&&this.matches(i,this.filter())).sort((a,b)=>this.sort()==='Effekt'?(b.ac.value??-1)-(a.ac.value??-1):this.sort()==='Alarm'?b.alarmCount-a.alarmCount:this.sort()==='Status'?this.status(a).localeCompare(this.status(b)):a.name.localeCompare(b.name)));
 producing=computed(()=>this.s.inverters().filter(i=>i.connected!==false&&i.ac.quality==='good'&&i.state!=='fault'&&(i.ac.value??0)>0).length);
 count(f:string){return this.s.inverters().filter(i=>this.matches(i,f)).length;}
 fresh=computed(()=>this.s.inverters().filter(i=>!['offline','stale','missing'].includes(this.status(i))).length);
 attention=computed(()=>this.s.inverters().filter(i=>['fault','offline','stale','missing','unknown'].includes(this.status(i))).length);
 legacyEnergy(m:Measurement|undefined):RecordedEnergy{return {value:m?.value??null,coverage:m?.quality==='good'?1:0,start:null,end:m?.timestamp??null,issues:m?.quality==='good'?[]:['incomplete coverage']};}
 today=computed(()=>this.s.plant()?.recordedEnergy??this.legacyEnergy(this.s.daily()));
 month=computed(()=>this.s.plant()?.monthEnergy??{value:this.s.demo()&&this.s.plant()?.daily.length?this.s.plant()!.daily.reduce((v,p)=>v+(p.value??0),0):null,coverage:this.s.demo()?1:0,start:null,end:null,issues:this.s.demo()?[]:['incomplete coverage']});
 energy(i:Inverter,month=false){return month?i.monthEnergy:i.energyPeriod??this.legacyEnergy(i.daily);}
 complete=completeEnergy;
 note(e:RecordedEnergy|undefined){if(e?.issues.includes('energy history unavailable'))return this.s.l.t('Energihistorikk utilgjengelig');if(e?.value===null||!e)return this.s.l.t('Ingen beregnbar energi');if(e.issues.includes('counter reset'))return this.s.l.t('Teller nullstilt · delvise data');return completeEnergy(e)?this.s.l.t('Komplett dekning hittil'):this.s.l.t('Delvis dekning · {coverage} %',{coverage:this.s.format(e.coverage*100,1)});}
 energySource(){return this.s.demo()?'Demodata':this.s.plant()?.energySource==='inverters'?'Fra invertertellere':'Fra anleggstelleren';}
 quality(i:Inverter){return i.connected===false?'Frakoblet':({good:'God',stale:'Foreldet',missing:'Mangler',invalid:'Ugyldig'} as const)[i.ac.quality];}
 unavailable(i:Inverter){return ['offline','stale','missing'].includes(this.status(i));}
 powerNote(i:Inverter){return this.unavailable(i)||!this.s.liveConnected()&&!this.s.demo()?'Sist registrerte AC-effekt':'AC-effekt nå';}
 option=computed(()=>{const p=this.s.plant(),series=[{name:this.s.l.t('AC-effekt'),color:'#51adff',data:this.s.chartData(p?.history??[])}];const option=powerOptions(series,'kW',true,this.s.l.locale()),bounds=this.s.bounds();Object.assign(option['xAxis'] as object,{min:bounds.start,max:bounds.end});return option;});
 peak=computed(()=>{const values=this.s.plant()?.history.filter(p=>p.value!==null&&Number.isFinite(p.value)).map(p=>p.value!)??[];return values.length?Math.max(...values):null;});
 day(ts:number){return new Intl.DateTimeFormat(this.s.l.locale(),{day:'numeric',timeZone:this.s.config.timezone}).format(ts);}
 monthly=computed(()=>({animation:false,grid:{left:8,right:8,top:15,bottom:27},tooltip:{trigger:'axis',formatter:(params:{dataIndex:number;value:number|null}[])=>{const item=params[0],point=this.s.plant()?.daily[item?.dataIndex];return point?`${this.s.date(point.ts)}<br/>${this.s.format(point.value,2)} kWh<br/>${this.s.l.t((this.s.plant()?.dailyCoverage?.[String(point.ts)]??1)>=.999?'Komplett dekning hittil':'Delvise data')}`:'';}},xAxis:{type:'category',data:this.s.plant()?.daily.map(p=>this.day(p.ts)),axisLabel:{color:'#7e94ae',fontSize:10,interval:4},axisLine:{show:false},axisTick:{show:false}},yAxis:{show:false,type:'value'},series:[{type:'bar',barMaxWidth:16,itemStyle:{borderRadius:[3,3,0,0]},data:this.s.plant()?.daily.map(p=>({value:p.value,itemStyle:{color:(this.s.plant()?.dailyCoverage?.[String(p.ts)]??1)<.999?'#dba859':'#4a9ee4'}}))}]}));
 sparks(i:Inverter){const data=i.history.slice(-140),max=Math.max(...data.map(p=>p.value??0),1),segments:string[][]=[[]];data.forEach((p,k)=>{if(p.value===null){if(segments.at(-1)!.length)segments.push([]);return;}segments.at(-1)!.push(`${data.length>1?k/(data.length-1)*140:0},${28-p.value/max*24}`);});return segments.filter(s=>s.length>1).map(s=>s.join(' '));}
}
