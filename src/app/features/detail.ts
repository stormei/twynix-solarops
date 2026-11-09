import {inverterMode,inverterCommunication} from '../domain/operations';
import {completeEnergy} from '../domain/energy-period';
import type {RecordedEnergy} from '../domain/solar';
import {TranslatePipe} from '../core/locale';
import {Component,computed,inject,input,signal,viewChild,ChangeDetectionStrategy} from '@angular/core';
import {RouterLink} from '@angular/router';
import {Store} from '../core/store';
import {ratio,stateNames} from '../domain/solar';
import {Chart,powerOptions} from '../shared/chart';
import {Icon} from '../shared/icon';
@Component({selector:'solar-detail',imports:[TranslatePipe,RouterLink,Chart,Icon],templateUrl:'./detail.html',changeDetection:ChangeDetectionStrategy.OnPush})
export class Detail {s=inject(Store);inverterId=input.required<string>();i=computed(()=>this.s.inverters().find(i=>i.id===this.inverterId()));names=stateNames;selected=signal('');power=viewChild<Chart>('powerChart');electrical=signal('DC');ratio=computed(()=>this.i()?ratio(this.i()!.ac,this.i()!.dc):null);
 modeInfo=computed(()=>inverterMode(this.i(),this.s.demo()?this.s.plant()!.timestamp:this.s.now()));
 statusLabel(){return this.names[this.modeInfo().state];}
 communicationName(){return inverterCommunication(this.i());}

 energyNote(e:RecordedEnergy|undefined){if(e?.issues.includes('energy history unavailable'))return 'Energihistorikk utilgjengelig';return !e||e.value===null?'Ingen beregnbar energi':completeEnergy(e)?'Komplett dekning hittil':e.issues.includes('counter reset')?'Teller nullstilt · delvise data':'Delvise data';}
 constructor(){this.s.selectRange('12 timer');}
 compare=computed(()=>this.s.inverters().find(i=>i.id===this.selected()));
 powerOption=computed(()=>{const i=this.i(),other=this.compare();const option=powerOptions([{name:'DC-inngang',color:'#8d8efb',data:this.s.chartData(i?.dcHistory??[])},{name:'AC-utgang',color:'#50adff',data:this.s.chartData(i?.history??[])},...(other?[{name:other.name+' AC',color:'#eeae60',data:this.s.chartData(other.history)}]:[])],'kW',true,this.s.l.locale());const bounds=this.s.bounds();(option['xAxis'] as Record<string,unknown>)['min']=bounds.start;(option['xAxis'] as Record<string,unknown>)['max']=bounds.end;return option;});
 dcOption=computed(()=>{const i=this.i();const o=powerOptions([{name:'DC-spenning',color:'#59bdba',data:this.s.chartData(i?.voltageHistory??[])},{name:'DC-strøm',color:'#e5b669',data:this.s.chartData(i?.currentHistory??[])}],'V / A',true,this.s.l.locale());o['yAxis']=[{type:'value',name:'V',axisLabel:{color:'#8fa3ba'},splitLine:{lineStyle:{color:'#25354a',type:'dashed'}}},{type:'value',name:'A',axisLabel:{color:'#8fa3ba'},splitLine:{show:false}}];const series=o['series'] as Record<string,unknown>[];series[1]['yAxisIndex']=1;const bounds=this.s.bounds();(o['xAxis'] as Record<string,unknown>)['min']=bounds.start;(o['xAxis'] as Record<string,unknown>)['max']=bounds.end;o['tooltip']={trigger:'axis',renderMode:'richText',formatter:(params:any[])=>params.map(p=>`${p.seriesName}: ${this.s.format(p.value[1])} ${p.seriesIndex===1?'A':'V'}`).join('\n')};return o;});
 timeline=computed(()=>{const i=this.i();return {animation:false,grid:{left:8,right:8,top:5,bottom:30},tooltip:{trigger:'item',formatter:(p:any)=>{const t=i?.timeline[p.dataIndex];return t?`${this.s.l.t(this.names[t.state])}<br>${this.s.time(t.start)}–${this.s.time(t.end)} · ${Math.round((t.end-t.start)/60000)} min`:'';}},xAxis:{type:'time',min:this.s.bounds().start,max:this.s.bounds().end,axisLabel:{color:'#8da2bc',formatter:(v:number)=>this.s.time(v)},splitLine:{show:false},axisLine:{show:false},axisTick:{show:false}},yAxis:{show:false,type:'category',data:[this.s.l.t('Tilstand')]},series:[{type:'custom',renderItem:(_p:any,api:any)=>{const a=api.coord([api.value(1),0]),b=api.coord([api.value(2),0]);return {type:'rect',shape:{x:Math.max(a[0],_p.coordSys.x),y:a[1]-13,width:Math.max(0,Math.min(b[0],_p.coordSys.x+_p.coordSys.width)-Math.max(a[0],_p.coordSys.x)-2),height:26,r:3},style:{fill:api.visual('color')}};},data:i?.timeline.map(t=>({value:[0,t.start,t.end],itemStyle:{color:({mppt:'#448cb5',standby:'#596c83',sleep:'#596c83',startup:'#a092e6',throttled:'#d7a653',fault:'#df6874',unknown:'#37485f',running:'#448cb5',stopped:'#596c83'})[t.state]}}))}]};});
 events=computed(()=>this.s.plant()?.events.filter(e=>e.device===this.i()?.name)??[]);
 duration=computed(()=>{const i=this.i();if(!i)return '—';const ms=i.timeline.filter(t=>t.state==='mppt'||t.state==='throttled'||t.state==='running').reduce((s,t)=>s+t.end-t.start,0);return this.s.l.t('{hours} t {minutes} min',{hours:Math.floor(ms/3600000),minutes:Math.floor(ms/60000)%60});});
}
