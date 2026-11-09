import type {DiagramGroup,DiagramLayout} from './diagram.js';
export function groupNameIssue(groups:DiagramGroup[],id:string,value:string){
 const group=groups.find(g=>g.id===id),name=value.trim();
 if(!group)return 'Gruppen finnes ikke lenger.';
 if(!name||name.length>80)return 'Gruppenavnet må ha 1–80 tegn.';
 if(groups.some(g=>g.id!==id&&g.name.trim().toLowerCase()===name.toLowerCase()))return 'En annen gruppe bruker dette navnet.';
 return '';
}
export function renameDrawingGroup(layout:DiagramLayout,id:string,value:string):DiagramLayout {
 const error=groupNameIssue(layout.groups??[],id,value);if(error)throw Error(error);
 const name=value.trim();if(layout.groups!.find(g=>g.id===id)!.name===name)return layout;
 return {...layout,groups:layout.groups!.map(g=>g.id===id?{...g,name}:g)};
}
