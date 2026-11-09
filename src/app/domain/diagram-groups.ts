import {CARD_W,CARD_H,type Point,type DiagramGroup} from './diagram.js';
import {selectionBounds,type Alignment} from './diagram-selection.js';
export function selectionUnits(positions:Record<string,Point>,ids:string[],groups:DiagramGroup[]=[]){
 const selected=new Set(ids),seen=new Set<string>(),units:{members:string[];bounds:{x:number;y:number;width:number;height:number}}[]=[];
 for(const id of ids){if(seen.has(id)||!positions[id])continue;const group=groups.find(g=>g.members.includes(id)&&g.members.every(m=>selected.has(m))),members=group?.members??[id],bounds=selectionBounds(positions,members);if(!bounds)continue;members.forEach(m=>seen.add(m));units.push({members,bounds});}return units;
}
export function alignGroups(positions:Record<string,Point>,ids:string[],groups:DiagramGroup[]|undefined,alignment:Alignment){
 const units=selectionUnits(positions,ids,groups),all=selectionBounds(positions,ids);if(units.length<2||!all)return {};
 const horizontal=['left','center','right'].includes(alignment),axis=horizontal?'x':'y',size=horizontal?'width':'height',fraction=['center','middle'].includes(alignment)?.5:['right','bottom'].includes(alignment)?1:0;
 const coordinate=all[axis]+all[size]*fraction,result:Record<string,Point>={};for(const unit of units){const delta=coordinate-(unit.bounds[axis]+unit.bounds[size]*fraction);for(const id of unit.members)result[id]={...positions[id],[axis]:positions[id][axis]+delta};}return result;
}
export function distributeGroups(positions:Record<string,Point>,ids:string[],groups:DiagramGroup[]|undefined,axis:'x'|'y'){
 const units=selectionUnits(positions,ids,groups).sort((a,b)=>a.bounds[axis]-b.bounds[axis]);if(units.length<3)return {};const size=axis==='x'?'width':'height',first=units[0].bounds[axis],last=units.at(-1)!,extent=last.bounds[axis]+last.bounds[size]-first,gap=(extent-units.reduce((sum,u)=>sum+u.bounds[size],0))/(units.length-1),result:Record<string,Point>={};let next=first;for(const unit of units){const delta=next-unit.bounds[axis];for(const id of unit.members)result[id]={...positions[id],[axis]:positions[id][axis]+delta};next+=unit.bounds[size]+gap;}return result;
}
