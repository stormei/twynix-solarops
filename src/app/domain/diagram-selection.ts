import {CARD_W,CARD_H,type Point} from './diagram.js';
export type Alignment='left'|'center'|'right'|'top'|'middle'|'bottom';
export function selectionBounds(positions:Record<string,Point>,ids:string[]){
 const points=ids.map(id=>positions[id]).filter(Boolean);if(!points.length)return null;
 const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y));
 return {x,y,width:Math.max(...points.map(p=>p.x+CARD_W))-x,height:Math.max(...points.map(p=>p.y+CARD_H))-y};
}
export function moveSelection(positions:Record<string,Point>,ids:string[],delta:Point,grid=true){
 const points=ids.filter(id=>positions[id]);if(!points.length)return {};
 const xs=points.map(id=>positions[id].x),ys=points.map(id=>positions[id].y);
 const dx=Math.max(-Math.min(...xs),Math.min(20000-Math.max(...xs),grid?Math.round(delta.x/20)*20:delta.x)),dy=Math.max(-Math.min(...ys),Math.min(20000-Math.max(...ys),grid?Math.round(delta.y/20)*20:delta.y));
 return Object.fromEntries(points.map(id=>[id,{x:positions[id].x+dx,y:positions[id].y+dy}]));
}
export function alignSelection(positions:Record<string,Point>,ids:string[],alignment:Alignment){
 const bounds=selectionBounds(positions,ids);if(!bounds)return {};
 const horizontal=['left','center','right'].includes(alignment),value=horizontal?bounds.x+(alignment==='center'?(bounds.width-CARD_W)/2:alignment==='right'?bounds.width-CARD_W:0):bounds.y+(alignment==='middle'?(bounds.height-CARD_H)/2:alignment==='bottom'?bounds.height-CARD_H:0);
 return Object.fromEntries(ids.filter(id=>positions[id]).map(id=>[id,{...positions[id],[horizontal?'x':'y']:value}]));
}
export function distributeSelection(positions:Record<string,Point>,ids:string[],axis:'x'|'y'){
 const sorted=ids.filter(id=>positions[id]).sort((a,b)=>positions[a][axis]-positions[b][axis]);if(sorted.length<3)return {};
 const first=positions[sorted[0]][axis],last=positions[sorted.at(-1)!][axis],step=(last-first)/(sorted.length-1);
 return Object.fromEntries(sorted.map((id,i)=>[id,{...positions[id],[axis]:first+step*i}]));
}
export function boxedSelection(positions:Record<string,Point>,start:Point,end:Point){
 const x=Math.min(start.x,end.x),y=Math.min(start.y,end.y),right=Math.max(start.x,end.x),bottom=Math.max(start.y,end.y);
 return Object.keys(positions).filter(id=>positions[id].x<=right&&positions[id].x+CARD_W>=x&&positions[id].y<=bottom&&positions[id].y+CARD_H>=y);
}
