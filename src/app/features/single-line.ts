import {stateNames} from '../domain/solar';
import {Component,computed,inject,signal,ChangeDetectionStrategy} from '@angular/core';
import {RouterLink} from '@angular/router';
import {Store} from '../core/store';
import {TranslatePipe} from '../core/locale';
import {Icon} from '../shared/icon';
import {EquipmentGlyph} from '../shared/equipment-glyph';
import {singleLineLayout,measuredPowerState,powerFlow,type ArrayTelemetry} from '../domain/single-line';
import {freshMeasurement,inverterStatus,statusNames,statusTone,inverterMode,inverterCommunication} from '../domain/operations';
import {measurement,type Measurement,type Inverter} from '../domain/solar';
@Component({selector:'solar-single-line',imports:[RouterLink,TranslatePipe,Icon,EquipmentGlyph],templateUrl:'./single-line.html',changeDetection:ChangeDetectionStrategy.OnPush,host:{'(document:keydown.escape)':'expanded.set(false)'}})
export class SingleLine {
 s=inject(Store);expanded=signal(false);selected=signal<{kind:'array'|'inverter'|'grid';id:string}|null>(null);
 now=computed(()=>this.s.demo()?this.s.plant()!.timestamp:this.s.now());
 arrays=computed(()=>this.s.plant()?.singleLine?.arrays.map(a=>({...a,dc:freshMeasurement(a.dc,this.now(),a.staleAfterMs)}))??[]);
 inverters=this.s.inverters;grid=computed(()=>{const g=this.s.plant()?.singleLine?.grid;return g?{...g,power:freshMeasurement(g.power,this.now(),g.staleAfterMs)}:null;});
 layout=computed(()=>singleLineLayout(this.inverters(),this.arrays()));
 rows=computed(()=>this.layout().inverters.map(p=>({...p,inverter:this.inverters().find(i=>i.id===p.id)!})));
 panels=computed(()=>this.layout().arrays.map(p=>({...p,array:this.arrays().find(a=>a.id===p.id)!})));
 wires=computed(()=>this.layout().links.map(l=>{const a=this.layout().arrays.find(p=>p.id===l.source)!,i=this.layout().inverters.find(p=>p.id===l.target)!,array=this.arrays().find(a=>a.id===l.source)!;return {...l,path:`M264 ${a.y+41} H312 V${i.y+41} H360`,flow:this.flow(array.dc,array.connected)};}));
 live(){return this.s.liveConnected()||this.s.demo();}
 flow(power:Measurement,connected:boolean|null=null){return powerFlow(power,connected,this.live());}
 arrayState(a:ArrayTelemetry){return measuredPowerState(a.dc,a.connected,!a.measurementDeviceId);}
 arrayTone(a:ArrayTelemetry){return !a.measurementDeviceId?'muted':a.connected===false||a.dc.quality!=='good'?'warning':'normal';}
 state(i:Inverter){return inverterStatus(i,this.now());}stateName(i:Inverter){return stateNames[inverterMode(i,this.now()).state];}modeQuality(i:Inverter){return inverterMode(i,this.now()).quality;}communication(i:Inverter){return inverterCommunication(i);}tone(i:Inverter){return statusTone(this.state(i));}
 gridState(){const g=this.grid();if(!g)return 'Mangler data';if(g.connected===false)return 'Frakoblet';if(g.power.quality!=='good'||g.power.value===null)return g.power.quality==='stale'?'Foreldet':'Mangler data';return g.power.value>.05?'Eksport':g.power.value<-.05?'Import':'Ingen effektflyt';}
 gridPower(){const value=this.grid()?.power.value;return value===null||value===undefined?null:Math.abs(value);}
 gridFlow(){const g=this.grid();return g?this.flow(g.power,g.connected):'idle';}
 select(kind:'array'|'inverter'|'grid',id:string){this.selected.set({kind,id});}
 selectedDetails=computed(()=>{const selected=this.selected();if(!selected)return null;
  if(selected.kind==='inverter'){const i=this.inverters().find(i=>i.id===selected.id);return i?{id:i.id,kind:selected.kind,name:i.name,power:i.ac,secondary:i.dc,state:this.stateName(i),communication:this.communication(i),modeQuality:this.modeQuality(i),rawState:i.rawState??i.stateCode??null,source:i.telemetryMapping?.acPower?.key??'',sourceName:i.name}:null;}
  if(selected.kind==='array'){const a=this.arrays().find(a=>a.id===selected.id);return a?{id:a.id,kind:selected.kind,name:a.name,power:a.dc,secondary:null,state:this.arrayState(a),communication:null,modeQuality:null,rawState:null,source:a.measurementDeviceId??'',sourceName:a.measurementDeviceId??this.s.l.t('Ikke målt')}:null;}
  const g=this.grid();return g?{id:g.id,kind:selected.kind,name:this.s.l.t('Nett'),power:g.power,secondary:null,state:this.gridState(),communication:null,modeQuality:null,rawState:null,source:g.id,sourceName:g.name}:null;
 });
 short(value:string,max=27){return value.length>max?value.slice(0,max-1)+'…':value;}
 empty=measurement(null,null);
}
