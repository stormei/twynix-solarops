export function contextMenuPoint(x:number,y:number,viewportWidth:number,viewportHeight:number,width=270,height=520){
 return {x:Math.max(8,Math.min(x,viewportWidth-width-8)),y:Math.max(8,Math.min(y,viewportHeight-height-8))};
}
