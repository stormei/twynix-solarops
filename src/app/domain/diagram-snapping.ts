import {CARD_W,CARD_H,type Point} from './diagram.js';
import {moveSelection,selectionBounds} from './diagram-selection.js';
export interface AlignmentGuide {x1:number;y1:number;x2:number;y2:number}
export interface SnapPreferences {grid:boolean;guides:boolean}
export const snapPreferenceKey='solarops.installation.snapping';
export function readSnapPreferences(raw:string|null):SnapPreferences {
 try{const p=JSON.parse(raw??'null');if(p?.version===1)return {grid:typeof p.grid==='boolean'?p.grid:true,guides:typeof p.guides==='boolean'?p.guides:true};}catch{}
 return {grid:true,guides:true};
}
export function snapSelection(positions:Record<string,Point>,ids:string[],anchorId:string,delta:Point,options:SnapPreferences&{tolerance:number}) {
 const raw=moveSelection(positions,ids,delta,false),b=selectionBounds(raw,ids),anchor=positions[anchorId];
 if(!b||!anchor)return {positions:raw,guides:[] as AlignmentGuide[]};
 const selected=new Set(ids),stationary=Object.entries(positions).filter(([id])=>!selected.has(id));
 type Candidate={distance:number;correction:number;coordinate:number;target:Point;sourceOffset:number};
 const closest=(axis:'x'|'y'):Candidate|null=>{
  if(!options.guides)return null;
  const offsets=axis==='x'?[0,b.width/2,b.width]:[0,b.height/2,b.height],size=axis==='x'?CARD_W:CARD_H;
  let best:Candidate|null=null;
  for(const [,target] of stationary)for(const sourceOffset of offsets)for(const offset of [0,size/2,size]){const coordinate=target[axis]+offset,correction=coordinate-(b[axis]+sourceOffset),distance=Math.abs(correction);if(distance<=options.tolerance&&(!best||distance<best.distance))best={distance,correction,coordinate,target,sourceOffset};}
  return best;
 };
 const x=closest('x'),y=closest('y'),rawDelta={x:raw[anchorId].x-anchor.x,y:raw[anchorId].y-anchor.y};
 const dx=x?rawDelta.x+x.correction:options.grid?Math.round((anchor.x+rawDelta.x)/20)*20-anchor.x:rawDelta.x;
 const dy=y?rawDelta.y+y.correction:options.grid?Math.round((anchor.y+rawDelta.y)/20)*20-anchor.y:rawDelta.y;
 const result=moveSelection(positions,ids,{x:dx,y:dy},false),final=selectionBounds(result,ids)!,guides:AlignmentGuide[]=[];
 if(x&&Math.abs(final.x+x.sourceOffset-x.coordinate)<.01)guides.push({x1:x.coordinate,x2:x.coordinate,y1:Math.min(final.y,x.target.y)-24,y2:Math.max(final.y+final.height,x.target.y+CARD_H)+24});
 if(y&&Math.abs(final.y+y.sourceOffset-y.coordinate)<.01)guides.push({y1:y.coordinate,y2:y.coordinate,x1:Math.min(final.x,y.target.x)-24,x2:Math.max(final.x+final.width,y.target.x+CARD_W)+24});
 return {positions:result,guides};
}
