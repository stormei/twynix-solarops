import type {Point} from './diagram.js';
export const MIN_ZOOM=.25,MAX_ZOOM=4;
export function zoomAt(pan:Point,oldZoom:number,requested:number,anchor:Point){
 const zoom=Math.min(MAX_ZOOM,Math.max(MIN_ZOOM,requested));
 const ratio=oldZoom/zoom;
 return {zoom,pan:{x:anchor.x+(pan.x-anchor.x)*ratio,y:anchor.y+(pan.y-anchor.y)*ratio}};
}
export function wheelZoom(zoom:number,delta:number,mode:number,pageHeight:number){
 const pixels=delta*(mode===1?16:mode===2?pageHeight:1);
 return zoom*Math.exp(-Math.max(-120,Math.min(120,pixels))*.002);
}
