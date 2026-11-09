import {Preferences} from '../core/preferences';
import {Component,input,output,signal,computed,inject,HostListener,ChangeDetectionStrategy} from '@angular/core';
import {Store} from '../core/store';
import {TranslatePipe} from '../core/locale';
import {arrange,snap,type DiagramLayout,type Point} from '../domain/diagram';
import type {InstallationNode} from '../domain/installation';
import {hmiReading,hmiTrend,hmiEndpoint,hmiWirePath,type HmiElement} from '../domain/hmi';
@Component({selector:'g[solarHmiLayer]',imports:[TranslatePipe],templateUrl:'./hmi-layer.html',changeDetection:ChangeDetectionStrategy.OnPush})
export class HmiLayer {
 private preferences=inject(Preferences);s=inject(Store);nodes=input.required<InstallationNode[]>();layout=input<DiagramLayout>();editable=input(false);selected=input('');now=input(Date.now());selection=output<string>();changed=output<DiagramLayout>();
 connecting=signal(false);source=signal('');circuit=signal<'ac'|'dc'>('ac');movePreview=signal<{id:string;x:number;y:number}|null>(null);bendPreview=signal<{id:string;x:number}|null>(null);notice=signal('');
 drawing=computed(()=>({...this.layout(),version:1 as const,positions:{...arrange(this.nodes()).positions,...this.layout()?.positions}}));
 elements=computed(()=>this.layout()?.hmi?.elements.map(e=>this.movePreview()?.id===e.id?{...e,...this.movePreview()!}:e).sort((a,b)=>Number(b.kind==='area')-Number(a.kind==='area'))??[]);
 wires=computed(()=>{const d={...this.drawing(),hmi:{elements:this.elements(),connections:this.layout()?.hmi?.connections??[]}};return d.hmi.connections.map(w=>{const a=hmiEndpoint(w.from,d,this.nodes(),true),b=hmiEndpoint(w.to,d,this.nodes(),false),bend=this.bendPreview()?.id===w.id?this.bendPreview()!.x:w.bend;return {...w,path:hmiWirePath(a,b,bend),handle:{x:bend??(a.x+b.x)/2,y:(a.y+b.y)/2}};});});
 interacting(){return this.drag!==null;}
 toggleWiring(){if(!this.editable())return;this.connecting.update(v=>!v);this.source.set('');this.notice.set('');}
 connect(id:string){if(!this.editable()||!this.connecting())return;const source=this.source();if(!source){this.source.set(id);return;}if(source===id){this.source.set('');return;}const d=this.drawing(),h=d.hmi??{elements:[],connections:[]};if(h.connections.length>=128)return;if(!h.connections.some(w=>w.from===source&&w.to===id&&w.circuit===this.circuit()))this.changed.emit({...d,hmi:{...h,connections:[...h.connections,{id:'hmi_'+crypto.randomUUID(),from:source,to:id,circuit:this.circuit()}]}});this.source.set('');this.connecting.set(false);}
 value(e:HmiElement){return hmiReading(e,this.s.plant(),this.nodes(),this.now());}
 trend(e:HmiElement){return hmiTrend(e,this.s.plant());}
 quality(e:HmiElement){return this.s.l.t(this.value(e).measurement.quality==='good'?'God':this.value(e).measurement.quality==='stale'?'Foreldet':'Mangler');}
 private drag:{id:string;start:Point;x:number;y:number;svg:SVGSVGElement;pointer:number;wire:boolean}|null=null;
 start(event:PointerEvent,e:HmiElement){event.stopPropagation();if(event.button!==0)return;if(this.connecting()){this.connect(e.id);return;}this.selection.emit(e.id);if(!this.editable())return;this.begin(event,e.id,e.x,e.y,false);}
 startWire(event:PointerEvent,id:string,x:number){event.stopPropagation();if(!this.editable()||event.button!==0)return;this.begin(event,id,x,0,true);}
 private begin(event:PointerEvent,id:string,x:number,y:number,wire:boolean){event.preventDefault();const root=event.currentTarget as SVGElement,svg=root.ownerSVGElement!;const start=new DOMPoint(event.clientX,event.clientY).matrixTransform(svg.getScreenCTM()!.inverse());this.drag={id,start,x,y,svg,pointer:event.pointerId,wire};root.setPointerCapture(event.pointerId);}
 @HostListener('pointermove',['$event']) move(event:PointerEvent){const d=this.drag;if(!d||d.pointer!==event.pointerId)return;event.stopPropagation();const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(d.svg.getScreenCTM()!.inverse());if(d.wire)this.bendPreview.set({id:d.id,x:Math.max(0,Math.min(22000,d.x+p.x-d.start.x))});else{const point={x:d.x+p.x-d.start.x,y:d.y+p.y-d.start.y};this.movePreview.set({id:d.id,...(this.preferences.value().snapGrid&&!event.altKey?snap(point):{x:Math.max(0,Math.min(20000,point.x)),y:Math.max(0,Math.min(20000,point.y))})});}}
 @HostListener('pointerup',['$event']) end(event:PointerEvent){const d=this.drag;if(!d||d.pointer!==event.pointerId)return;event.stopPropagation();this.drag=null;const drawing=this.drawing(),h=drawing.hmi;if(this.editable()&&h){const p=this.movePreview(),b=this.bendPreview();if(d.wire&&b)this.changed.emit({...drawing,hmi:{...h,connections:h.connections.map(w=>w.id===d.id?{...w,bend:b.x}:w)}});else if(p)this.changed.emit({...drawing,hmi:{...h,elements:h.elements.map(e=>e.id===d.id?{...e,x:p.x,y:p.y}:e)}});}this.movePreview.set(null);this.bendPreview.set(null);}
 @HostListener('pointercancel') cancel(){this.drag=null;this.movePreview.set(null);this.bendPreview.set(null);}
 key(event:KeyboardEvent,e:HmiElement){if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();if(this.connecting())this.connect(e.id);else this.selection.emit(e.id);}}
}
