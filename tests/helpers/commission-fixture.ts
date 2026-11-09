import {randomUUID} from 'node:crypto';
import {ThingsBoard,Entity} from '../../server/thingsboard.ts';
import {settings} from '../../server/config.ts';
import {canonical} from '../../server/commission.ts';
import type {CommissionDraft} from '../../src/app/domain/commission.ts';
export function fakeInstallation(){
 const invId='12345678-1234-1234-1234-123456789abc',entities=new Map<string,Entity>([[invId,{id:{id:invId,entityType:'DEVICE'},name:'Existing inverter',ownerId:{id:'tenant',entityType:'TENANT'}}]]),attributes=new Map<string,any>(),profiles:Entity[]=[],relations:any[]=[],writes:{path:string;body:any;method?:string;query?:string}[]=[];
 const telemetry:Record<string,unknown>={ACPower:12,Energy:100};
 let authority='TENANT_ADMIN',failPath='';
 const transport:typeof fetch=async(input,options)=>{
  const u=new URL(String(input)),method=options?.method??'GET',body=options?.body?JSON.parse(String(options.body)):undefined,parts=u.pathname.split('/');
  if(method==='POST'||method==='DELETE')writes.push({path:u.pathname,body,method,query:u.search});
  if(failPath===u.pathname){failPath='';return new Response('',{status:503});}
  if(u.pathname==='/api/auth/login')return Response.json({token:'fake-user-token'});
  if(u.pathname==='/v3/api-docs')return Response.json({info:{version:'4.4.0'},paths:{'/api/user/assets':{},'/values/timeseries/history':{}}});
  if(u.pathname==='/api/auth/user')return Response.json({authority});
  if(u.pathname==='/api/user/assets'||u.pathname==='/api/user/devices')return Response.json({data:[...entities.values()].filter(e=>e.id.entityType===(u.pathname.endsWith('assets')?'ASSET':'DEVICE')),hasNext:false});
  if(u.pathname==='/api/assetProfiles')return Response.json({data:profiles,hasNext:false});
  if(u.pathname==='/api/assetProfile'&&method==='POST'){const e={id:{id:randomUUID(),entityType:'ASSET_PROFILE'},...body};profiles.push(e);return Response.json(e);}
  if(u.pathname==='/api/asset'&&method==='POST'){const e={...(body.id?entities.get(body.id.id):{}),...body,id:body.id??{id:randomUUID(),entityType:'ASSET'},version:((body.id?entities.get(body.id.id) as any:null)?.version??0)+1,ownerId:{id:'tenant',entityType:'TENANT'}};entities.set(e.id.id,e);return Response.json(e);}
  if(u.pathname==='/api/device'&&method==='POST'){const old=entities.get(body.id.id);if(!old)return new Response('',{status:404});const e={...old,...body,version:((old as any).version??0)+1};entities.set(e.id.id,e);return Response.json(e);}
  if(u.pathname==='/api/v2/relation'&&method==='DELETE'){for(let i=relations.length-1;i>=0;i--){const r=relations[i];if(r.from.id===u.searchParams.get('fromId')&&r.from.entityType===u.searchParams.get('fromType')&&r.to.id===u.searchParams.get('toId')&&r.to.entityType===u.searchParams.get('toType')&&r.type===u.searchParams.get('relationType'))relations.splice(i,1);}return new Response('',{status:200});}
  if((parts[2]==='asset'||parts[2]==='device')&&method==='GET'){const e=entities.get(parts[3]);return e?Response.json(e):new Response('',{status:404});}
  if(u.pathname.includes('/values/attributes'))return Response.json(Object.entries(attributes.get(parts[5])??{}).map(([key,value])=>({key,value})));
  if(u.pathname.includes('/attributes/SERVER_SCOPE')&&method==='POST'){attributes.set(parts[5],{...attributes.get(parts[5]),...body});return new Response('',{status:200});}
  if(u.pathname.includes('/keys/timeseries'))return Response.json(Object.keys(telemetry));
  if(u.pathname.endsWith('/values/timeseries'))return Response.json(Object.fromEntries(Object.entries(telemetry).map(([key,value])=>[key,[{ts:Date.now(),value}]])));
  if(u.pathname.includes('/relations/info/from/'))return Response.json(relations.filter(r=>r.from.id===parts.at(-1)));
  if(u.pathname.includes('/relations/info/to/'))return Response.json(relations.filter(r=>r.to.id===parts.at(-1)));
  if(u.pathname==='/api/v2/relation'&&method==='POST'){if(!relations.some(r=>canonical(r)===canonical(body)))relations.push(body);return new Response('',{status:200});}
  throw Error('Unexpected request: '+method+' '+u.pathname);
 };
 const tb=new ThingsBoard({...settings(),url:'https://commission.test'},'fake-user-token',transport);
 const draft:CommissionDraft={templateId:'minimal-site',site:{name:'New roof',siteKey:'new-roof',timezone:'Europe/Oslo',dataSourceKind:'physical'},equipment:[{equipmentKey:'inv-001',role:'inverter',kind:'device',deviceId:invId,name:'Ignored display name',mapping:{acPower:{key:'ACPower',unit:'kW'},lifetimeEnergy:{key:'Energy',unit:'kWh'}}},{equipmentKey:'pv-001',role:'pvArray',kind:'asset',name:'New roof / PV array',mapping:{},feedsTo:'inv-001'}]};
 return {tb,transport,telemetry,draft,entities,attributes,profiles,relations,writes,invId,setAuthority:(s:string)=>authority=s,fail:(s:string)=>failPath=s};
}
