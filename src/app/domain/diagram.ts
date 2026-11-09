import {validHmi,type HmiDrawing} from './hmi.js';
import type {InstallationNode} from './installation.js';
export interface Point {x:number;y:number}
export interface DiagramGroup {id:string;name:string;members:string[]}
export interface DiagramLayout {version:1;positions:Record<string,Point>;groups?:DiagramGroup[];hmi?:HmiDrawing}
export const CARD_W=212,CARD_H=94;
export function validLayout(value:unknown,ids:Set<string>):value is DiagramLayout {
 const v=value as DiagramLayout;
 const used=new Set<string>(),groupIds=new Set<string>();
 const groupsValid=v?.groups===undefined||Array.isArray(v.groups)&&v.groups.length<=64&&v.groups.every(g=>{if(!g||typeof g.id!=='string'||!/^[-a-zA-Z0-9_]{1,80}$/.test(g.id)||groupIds.has(g.id)||typeof g.name!=='string'||!g.name.trim()||g.name.length>80||!Array.isArray(g.members)||g.members.length<2||g.members.length>128)return false;groupIds.add(g.id);return g.members.every(id=>{if(typeof id!=='string'||!ids.has(id)||used.has(id)||!v.positions?.[id])return false;used.add(id);return true;});});
 return validHmi(v?.hmi,ids)&&groupsValid&&!!v&&v.version===1&&!!v.positions&&typeof v.positions==='object'&&!Array.isArray(v.positions)&&Object.keys(v.positions).length<=128&&Object.entries(v.positions).every(([id,p])=>ids.has(id)&&!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.y>=0&&p.x<=20000&&p.y<=20000);
}
export function arrange(nodes:InstallationNode[]):DiagramLayout {
 const positions:Record<string,Point>={},columns=new Map<number,number>();
 const rank=(n:InstallationNode)=>n.role==='site'?0:n.role==='zone'?1:['pvArray','pvString'].includes(n.role)?2:n.role==='inverter'?3:4;
 const ranks=[...new Set(nodes.map(rank))].sort((a,b)=>a-b);
 for(const n of [...nodes].sort((a,b)=>rank(a)-rank(b))){const col=ranks.indexOf(rank(n)),row=columns.get(col)??0;positions[n.id]={x:40+col*280,y:60+row*150};columns.set(col,row+1);}
 return {version:1,positions};
}
export function canParent(nodes:InstallationNode[],child:string,parent:string):boolean {
 const target=nodes.find(n=>n.id===parent),node=nodes.find(n=>n.id===child);
 if(!node||node.role==='site'||!target||target.entityType!=='ASSET'||target.role==='pvString'||child===parent)return false;
 let cursor:InstallationNode|undefined=target;const seen=new Set<string>();
 while(cursor){if(cursor.id===child||seen.has(cursor.id))return false;seen.add(cursor.id);cursor=nodes.find(n=>n.id===cursor!.parentId);}
 return seen.size<12;
}
export function canFeed(nodes:InstallationNode[],source:string,target:string):boolean {return nodes.some(n=>n.id===source&&n.role==='pvArray')&&nodes.some(n=>n.id===target&&n.role==='inverter'&&n.entityType==='DEVICE');}
export function snap(p:Point):Point {return {x:Math.max(0,Math.min(20000,Math.round(p.x/20)*20)),y:Math.max(0,Math.min(20000,Math.round(p.y/20)*20))};}
export function wirePath(a:Point,b:Point):string {const mid=(a.x+b.x)/2;return `M ${a.x} ${a.y} H ${mid} V ${b.y} H ${b.x}`;}

export function freePosition(point:Point,positions:Record<string,Point>,exclude=''):Point {
 let candidate=snap(point);
 for(let i=0;i<256;i++){if(!Object.entries(positions).some(([id,p])=>id!==exclude&&Math.abs(p.x-candidate.x)<CARD_W+20&&Math.abs(p.y-candidate.y)<CARD_H+20))return candidate;candidate=candidate.y+140>20000?{x:Math.min(20000,candidate.x+240),y:0}:{...candidate,y:candidate.y+140};}
 return candidate;
}

export function dcTarget(nodes:InstallationNode[],positions:Record<string,Point>,point:Point):InstallationNode|undefined {
 return nodes.find(n=>n.role==='inverter'&&n.entityType==='DEVICE'&&positions[n.id]&&Math.hypot(point.x-positions[n.id].x,point.y-positions[n.id].y-CARD_H/2)<=18);
}

export function pruneGroups(groups:DiagramGroup[]|undefined,ids:Set<string>):DiagramGroup[]|undefined {return groups?.map(g=>({...g,members:g.members.filter(id=>ids.has(id))})).filter(g=>g.members.length>=2);}
export function expandGroups(ids:string[],groups:DiagramGroup[]=[]):string[] {const selected=new Set(ids);for(const g of groups)if(g.members.some(id=>selected.has(id)))for(const id of g.members)selected.add(id);return [...selected];}
export function groupSelection(layout:DiagramLayout,ids:string[],name:string,id='group_'+crypto.randomUUID()):DiagramLayout {const members=expandGroups(ids,layout.groups);if(members.length<2)return layout;const selected=new Set(members);if(layout.groups?.some(g=>g.members.length===members.length&&g.members.every(id=>selected.has(id))))return layout;return {...layout,groups:[...(layout.groups??[]).filter(g=>!g.members.some(id=>selected.has(id))),{id,name,members}]};}
export function ungroupSelection(layout:DiagramLayout,ids:string[]):DiagramLayout {const selected=new Set(ids),groups=(layout.groups??[]).filter(g=>!g.members.some(id=>selected.has(id)));return groups.length===(layout.groups??[]).length?layout:{...layout,groups};}
