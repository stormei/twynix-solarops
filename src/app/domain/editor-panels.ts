export type PanelSide = 'left' | 'right';
export interface PanelWidths {left:number;right:number}
export const panelWidthKey='solarops.installation.panelWidths';
export const panelLimits={left:{min:160,max:420},right:{min:240,max:520}};
export const clampPanel=(side:PanelSide,value:number)=>Math.round(Math.max(panelLimits[side].min,Math.min(panelLimits[side].max,value)));
export function readPanelWidths(raw:string|null,viewport:number):PanelWidths {
 const defaults=viewport>=1600?{left:240,right:340}:viewport<=1100?{left:180,right:280}:{left:210,right:310};
 try {const saved=JSON.parse(raw??'null');if(saved?.version===1)return {left:typeof saved.left==='number'&&Number.isFinite(saved.left)?clampPanel('left',saved.left):defaults.left,right:typeof saved.right==='number'&&Number.isFinite(saved.right)?clampPanel('right',saved.right):defaults.right};}catch{}
 return defaults;
}
// Keep a usable canvas when reopening a wide-screen layout on a smaller screen.
// Effective sizes never overwrite the user's saved desktop preferences.
export function fitPanelWidths(preferred:PanelWidths,viewport:number,leftOpen:boolean,rightOpen:boolean):PanelWidths {
 let left=leftOpen?clampPanel('left',preferred.left):0,right=rightOpen?clampPanel('right',preferred.right):0;
 const budget=Math.max(0,viewport-320-(leftOpen?6:0)-(rightOpen?6:0));
 if(left+right>budget){const minLeft=leftOpen?160:0,minRight=rightOpen?240:0,extra=Math.max(0,budget-minLeft-minRight),wanted=left+right-minLeft-minRight;const ratio=wanted?Math.min(1,extra/wanted):0;left=leftOpen?Math.floor(minLeft+(left-minLeft)*ratio):0;right=rightOpen?Math.floor(minRight+(right-minRight)*ratio):0;}
 return {left,right};
}
