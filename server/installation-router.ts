import {prepareArchive,saveArchive} from './archive.ts';
import {Router,Request} from 'express';
import {createHash} from 'node:crypto';
import {Settings} from './config.ts';
import {ThingsBoard,ApiError} from './thingsboard.ts';
import {administrator,deviceDetails} from './commission.ts';
import {installationContext,prepareInstallation,saveInstallation} from './installation.ts';
import type {InstallationDraft} from '../src/app/domain/installation.ts';
declare module 'express-session' {interface SessionData {archivePlan?:{id:string;assetId:string;digest:string;expiresAt:number;identity:string;result?:any};managePlan?:{id:string;draft:InstallationDraft;digest:string;expiresAt:number;identity:string;result?:any}}}
export function installationRouter(cfg:Settings,reset:(id:string)=>void,options:{auditDirectory?:string}={}){
 const router=Router(),saving=new Set<string>(),receipts=new Map<string,any>();
 const active=(req:Request)=>{if(!req.session.token||!req.session.expires||Date.now()>=req.session.expires)throw new ApiError(401);const config=req.session.connection??cfg;return {tb:new ThingsBoard(config,req.session.token),config,identity:createHash('sha256').update(config.url+'|'+req.session.token).digest('hex')};};
 router.get('/',async(req,res,next)=>{try{const {tb,config}=active(req);res.json(await installationContext(tb,typeof req.query['assetId']==='string'?req.query['assetId']:config.assetId));}catch(e){next(e);}});
 router.get('/devices/:id',async(req,res,next)=>{try{const {tb}=active(req);await administrator(tb);const info=await deviceDetails(tb,req.params['id']);const requested=typeof req.query['keys']==='string'?req.query['keys'].split(',').slice(0,128):[];const keys=[...new Set([...requested,...Object.values(info.metadata.solaropsTelemetryMapping??{}).map(m=>m.key),'ACPower','DCPower','DCVoltage','DCCurrent','Energy',...info.keys])].filter(k=>info.keys.includes(k)).slice(0,128);const mappings=Object.fromEntries(keys.map(key=>[key,{key,unit:''}]));res.json({...info,latest:await tb.latest(req.params['id'],mappings),sampledAt:Date.now()});}catch(e){next(e);}});
 router.post('/preview',async(req,res,next)=>{try{const {tb,identity}=active(req),p=await prepareInstallation(tb,req.body);req.session.managePlan={id:p.review.id,draft:p.draft,digest:p.review.digest,expiresAt:p.review.expiresAt,identity};await new Promise<void>((resolve,reject)=>req.session.save(e=>e?reject(e):resolve()));res.json(p.review);}catch(e){next(e);}});
 router.post('/save',async(req,res,next)=>{
  let lock:string|undefined;
  try{
   const {tb,config,identity}=active(req),plan=req.session.managePlan;
   if(!plan||plan.id!==req.body.planId||plan.identity!==identity||plan.expiresAt<Date.now())throw new ApiError(409,'Review the hierarchy changes again before saving');
   await administrator(tb);
   if(plan.result){res.json(plan.result);return;}if(receipts.has(plan.id)){res.json(receipts.get(plan.id));return;}
   const key=config.url+'|'+plan.draft.assetId;if(saving.has(key))throw new ApiError(409,'This installation is already being saved');saving.add(key);lock=key;
   const p=await prepareInstallation(tb,plan.draft);if(p.review.digest!==plan.digest)throw new ApiError(409,'ThingsBoard changed after the review. Reload and review the hierarchy again.');
   const result=await saveInstallation(tb,p,plan.id,options.auditDirectory);plan.result=result;receipts.set(plan.id,result);if(receipts.size>100)receipts.delete(receipts.keys().next().value!);
   if(config.assetId===result.assetId){const site=result.draft.nodes.find(n=>n.id===result.assetId)!;req.session.connection={...config,plantName:site.label||site.name,timezone:result.draft.timezone};reset(req.sessionID);}
   await new Promise<void>((resolve,reject)=>req.session.save(e=>e?reject(e):resolve()));res.json(result);
  }catch(e){if(e instanceof ApiError&&e.status===502)delete req.session.managePlan;next(e);}finally{if(lock)saving.delete(lock);}
 });
 router.post('/archive/preview',async(req,res,next)=>{try{const {tb,identity}=active(req),p=await prepareArchive(tb,req.body.assetId);req.session.archivePlan={id:p.id,assetId:p.backup.siteId,digest:p.digest,expiresAt:p.expiresAt,identity};await new Promise<void>((resolve,reject)=>req.session.save(e=>e?reject(e):resolve()));res.json(p);}catch(e){next(e);}});
 router.post('/archive/save',async(req,res,next)=>{let lock:string|undefined;try{const {tb,config,identity}=active(req),plan=req.session.archivePlan;if(!plan||plan.id!==req.body.planId||plan.identity!==identity||plan.expiresAt<Date.now())throw new ApiError(409,'Review the archive again before saving');await administrator(tb);if(plan.result){res.json(plan.result);return;}const key=config.url+'|'+plan.assetId;if(saving.has(key))throw new ApiError(409,'This installation is already being saved');saving.add(key);lock=key;const p=await prepareArchive(tb,plan.assetId);if(p.digest!==plan.digest)throw new ApiError(409,'ThingsBoard changed after the archive review. Reload and review again.');if(req.body.confirmation!==p.backup.siteName)throw new ApiError(400,'Type the installation name to confirm archiving');p.id=plan.id;const result=await saveArchive(tb,p,options.auditDirectory?options.auditDirectory+'/archives':undefined);plan.result=result;if(config.assetId===plan.assetId){reset(req.sessionID);req.session.connection={...config,assetId:'',plantName:'SolarOps',discoveryMode:'standard',devicePrefix:''};}await new Promise<void>((resolve,reject)=>req.session.save(e=>e?reject(e):resolve()));res.json(result);}catch(e){next(e);}finally{if(lock)saving.delete(lock);}});
 return router;
}
