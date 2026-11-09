import {testThingsBoardConnection} from './connection-test.ts';
import {setupDevices} from './device-discovery.ts';
import {createHash} from 'node:crypto';
import {administrator,templates,deviceDetails,prepareCommission,saveCommission} from './commission.ts';
import type {CommissionDraft} from '../src/app/domain/commission.ts';
import {fileURLToPath} from 'node:url';
import {Router,Request} from 'express';
import {ThingsBoard,ApiError} from './thingsboard.ts';
import {Settings} from './config.ts';
import {inspectSite,listSites} from './standard.ts';
export interface SetupConnection {token:string;expires:number;config:Settings}
declare module 'express-session' {interface SessionData {connection?:Settings;setup?:SetupConnection;commission?:{id:string;draft:CommissionDraft;digest:string;expiresAt:number;identity:string;result?:any}}}
export function installationUrl(value:unknown){
 if(typeof value!=='string'||value.length>500)throw new ApiError(400,'Enter a ThingsBoard address');
 let url:URL;try{url=new URL(value);}catch{throw new ApiError(400,'Enter a valid ThingsBoard URL');}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))throw new ApiError(400,'Use only the ThingsBoard http(s) origin, including its port');
 // Private LAN installations are supported, but cloud instance metadata and
 // loopback endpoints are not valid remote ThingsBoard destinations.
 const host=url.hostname.replace(/^\[|\]$/g,'').toLowerCase();
 if(['localhost','::1','0.0.0.0','metadata.google.internal'].includes(host)||/^127\./.test(host)||/^169\.254\./.test(host)||/^fe[89ab]/i.test(host)||host.startsWith('::ffff:'))throw new ApiError(400,'Use the reachable ThingsBoard server address');
 return url.origin;
}
function candidate(req:Request,cfg:Settings):SetupConnection{
 const selected=req.session.setup??(req.session.token?{token:req.session.token,expires:req.session.expires!,config:req.session.connection??cfg}:undefined);
 if(!selected||!selected.expires||selected.expires<=Date.now())throw new ApiError(401);return selected;
}
export function selectedSettings(base:Settings,metadata:{timezone?:string;dataSourceKind?:string},assetId:string,name:string):Settings{
 return {...base,assetId,devicePrefix:'',discoveryMode:'standard',plantName:name,timezone:metadata.timezone!,simulated:metadata.dataSourceKind==='simulation',mapping:{},siteMapping:{},states:{},verified:true};
}
export function setupRouter(cfg:Settings,reset:(id:string)=>void,options:{auditDirectory?:string;saveConnection?:(s:Settings)=>Promise<void>}={}){
 const router=Router();const connectionTests=new Map<string,{count:number;until:number}>();let pendingTest:ReturnType<typeof testThingsBoardConnection>|undefined;const saving=new Set<string>();const receipts=new Map<string,any>();const attempts=new Map<string,{count:number;until:number}>();
 router.post('/test-connection',async(req,res,next)=>{
  const now=Date.now(),ip=req.ip??'local';for(const [key,value] of connectionTests)if(value.until<=now)connectionTests.delete(key);
  const rate=connectionTests.get(ip);if(rate&&rate.count>=6){res.status(429).json({error:'Too many connection tests'});return;}
  connectionTests.set(ip,{count:(rate?.count??0)+1,until:rate?.until??now+60000});
  try{
   if(!cfg.url)throw new ApiError(400,'Set TB_URL in .env and restart SolarOps before signing in','TB_URL_MISSING');
   if(req.body&&Object.keys(req.body).length)throw new ApiError(400,'Connection tests use only TB_URL from .env');
   const url=installationUrl(cfg.url);
   if(!pendingTest)pendingTest=testThingsBoardConnection(url).finally(()=>{pendingTest=undefined;});
   res.json(await pendingTest);
  }catch(e){next(e);}
 });
 router.get('/templates/:name',(req,res)=>{if(!['minimal-site','twynix-solar'].includes(req.params['name'])){res.status(404).end();return;}res.download(fileURLToPath(new URL('../templates/solarops-v1/'+req.params['name']+'.json',import.meta.url)));});
 router.get('/create/options',async(req,res,next)=>{try{const c=candidate(req,cfg),tb=new ThingsBoard(c.config,c.token);const user=await tb.request<{authority:string}>('/api/auth/user');const canCreate=user.authority==='TENANT_ADMIN';res.json({canCreate,url:c.config.url,templates:await templates(),devices:canCreate?await setupDevices(tb):[]});}catch(e){next(e);}});
 router.get('/create/devices/:id',async(req,res,next)=>{try{const c=candidate(req,cfg),tb=new ThingsBoard(c.config,c.token);await administrator(tb);const info=await deviceDetails(tb,req.params['id']);res.json({...info,latest:await tb.latest(req.params['id'],Object.fromEntries(info.keys.slice(0,128).map(key=>[key,{key,unit:''}])))});}catch(e){next(e);}});
 router.post('/create/preview',async(req,res,next)=>{try{const c=candidate(req,cfg),p=await prepareCommission(new ThingsBoard(c.config,c.token),req.body,options.auditDirectory);req.session.commission={id:p.review.id,draft:p.draft,digest:p.review.digest,expiresAt:p.review.expiresAt,identity:createHash('sha256').update(c.config.url+'|'+c.token).digest('hex')};await new Promise<void>((resolve,reject)=>req.session.save(e=>e?reject(e):resolve()));res.json(p.review);}catch(e){next(e);}});
 router.post('/create/save',async(req,res,next)=>{
  let lock:string|undefined;
  try{
   const c=candidate(req,cfg),plan=req.session.commission,identity=createHash('sha256').update(c.config.url+'|'+c.token).digest('hex');
   if(!plan||plan.id!==req.body.planId||plan.expiresAt<Date.now()||plan.identity!==identity)throw new ApiError(409,'Review this installation again before saving');
   const finish=async(result:any)=>{if(req.body.activate===true){const selected=selectedSettings(c.config,result.report.metadata,result.siteId,result.report.site.label||result.report.site.name);await options.saveConnection?.(selected);reset(req.sessionID);req.session.token=c.token;req.session.expires=c.expires;req.session.connection=selected;delete req.session.setup;result={...result,activated:true,connection:{plantId:selected.plantId,plantName:selected.plantName,timezone:selected.timezone,serverVersion:selected.version,simulatedSource:selected.simulated,configured:true}};}await new Promise<void>((resolve,reject)=>req.session.save(e=>e?reject(e):resolve()));res.json(result);};if(plan.result){await finish(plan.result);return;}const receipt=receipts.get(plan.id);if(receipt){await finish(receipt);return;}
   const key=c.config.url+'|'+plan.draft.site.siteKey;if(saving.has(key))throw new ApiError(409,'This installation is already being saved');saving.add(key);lock=key;
   const tb=new ThingsBoard(c.config,c.token),p=await prepareCommission(tb,plan.draft,options.auditDirectory);
   if(p.review.digest!==plan.digest)throw new ApiError(409,'ThingsBoard changed since this review. Review the updated changes before saving');
   if(!p.review.canSave)throw new ApiError(422,'Resolve the installation errors before saving');
   const result=await saveCommission(tb,p,plan.id,options.auditDirectory);plan.result=result;receipts.set(plan.id,result);if(receipts.size>100)receipts.delete(receipts.keys().next().value!);
   await finish(result);
  }catch(e){if(e instanceof ApiError&&e.status===502)delete req.session.commission;next(e);}finally{if(lock)saving.delete(lock);}
 });
 router.get('/status',(req,res)=>{const selected=req.session.setup??{token:req.session.token,expires:req.session.expires,config:req.session.connection??cfg};res.json({authenticated:!!selected.token&&Date.now()<(selected.expires??0),url:selected.config.url,selectedSiteId:selected.config.assetId,standard:selected.config.discoveryMode==='standard'});});
 router.post('/connect',async(req,res,next)=>{
  const ip=req.ip??'local',now=Date.now();for(const [k,v] of attempts)if(v.until<now)attempts.delete(k);
  const rate=attempts.get(ip);if(rate&&rate.count>=10&&rate.until>now){res.status(429).json({error:'Too many login attempts'});return;}attempts.set(ip,{count:(rate?.until??0)>now?rate!.count+1:1,until:now+900000});
  try{
   if(!cfg.url)throw new ApiError(400,'Set TB_URL in .env and restart SolarOps before signing in','TB_URL_MISSING');
   if(Object.hasOwn(req.body,'url'))throw new ApiError(400,'Configure the ThingsBoard endpoint using TB_URL in .env');
   const url=installationUrl(cfg.url),{username,password}=req.body;
   if(typeof username!=='string'||!username||username.length>250||typeof password!=='string'||!password||password.length>1000)throw new ApiError(400,'Username and password are required');
   const probe=new ThingsBoard({...cfg,url},'');
   const auth=await probe.request<{token:string}>('/api/auth/login','POST',{username,password});
   const authenticated=new ThingsBoard({...cfg,url},auth.token);
   const docs=await authenticated.request<{info?:{version?:string};paths:Record<string,unknown>}>('/v3/api-docs');
   const hasHistory=Object.keys(docs.paths??{}).some(p=>p.endsWith('/values/timeseries/history'));
   const supported=Object.keys(docs.paths??{}).some(p=>p==='/api/user/assets');
   if(!supported)throw new ApiError(422,'This ThingsBoard API is not supported by SolarOps v1');
   const config:Settings={...cfg,url,version:docs.info?.version??'unknown',historyPath:hasHistory?'/history':'',assetId:'',devicePrefix:'',discoveryMode:'standard',mapping:{},siteMapping:{},states:{},verified:true};
   const tb=new ThingsBoard(config,auth.token);await tb.request('/api/auth/user');
   let expires=now+7200000;try{expires=Math.min(expires,Number(JSON.parse(Buffer.from(auth.token.split('.')[1],'base64url').toString()).exp)*1000);}catch{}
   if(!Number.isFinite(expires)||expires<=now)throw new ApiError(401);
   if(!req.session.token)await new Promise<void>((resolve,reject)=>req.session.regenerate(e=>e?reject(e):resolve()));
   delete req.session.commission;req.session.setup={token:auth.token,expires,config};
   await new Promise<void>((resolve,reject)=>req.session.save(e=>e?reject(e):resolve()));
   res.json({connected:true,url,version:config.version});
  }catch(e){next(e);}
 });
 router.get('/sites',async(req,res,next)=>{try{const c=candidate(req,cfg);res.json({sites:await listSites(new ThingsBoard(c.config,c.token)),url:c.config.url,version:c.config.version});}catch(e){next(e);}});
 router.post('/inspect',async(req,res,next)=>{try{const c=candidate(req,cfg);if(typeof req.body.assetId!=='string'||!/^[0-9a-f-]{36}$/i.test(req.body.assetId))throw new ApiError(400,'Choose a site');res.json(await inspectSite(new ThingsBoard(c.config,c.token),req.body.assetId));}catch(e){next(e);}});
 router.post('/activate',async(req,res,next)=>{
  try{
   const c=candidate(req,cfg);if(typeof req.body.assetId!=='string'||!/^[0-9a-f-]{36}$/i.test(req.body.assetId))throw new ApiError(400,'Choose a site');
   const report=await inspectSite(new ThingsBoard(c.config,c.token),req.body.assetId);
   if(!report.compatible){res.status(422).json({error:'Resolve installation errors before monitoring',issues:report.issues});return;}
   const selected=selectedSettings(c.config,report.metadata,report.site.id.id,report.site.label||report.site.name);
   await options.saveConnection?.(selected);reset(req.sessionID);await new Promise<void>((resolve,reject)=>req.session.regenerate(e=>e?reject(e):resolve()));
   req.session.token=c.token;req.session.expires=c.expires;req.session.connection=selected;
   await new Promise<void>((resolve,reject)=>req.session.save(e=>e?reject(e):resolve()));
   res.json({activated:true,plantId:selected.plantId,plantName:selected.plantName,timezone:selected.timezone,serverVersion:selected.version,simulatedSource:selected.simulated,configured:true});
  }catch(e){next(e);}
 });
 router.post('/reset',async(req,res,next)=>{try{
  reset(req.sessionID);await new Promise<void>((resolve,reject)=>req.session.regenerate(e=>e?reject(e):resolve()));
  req.session.connection={...cfg,url:cfg.url,assetId:'',devicePrefix:'',plantName:'SolarOps',timezone:'Europe/Oslo',version:undefined,historyPath:'',discoveryMode:'standard',mapping:{},siteMapping:{},states:{},verified:false,simulated:false,deviceModel:undefined};
  await options.saveConnection?.({...req.session.connection,url:cfg.url});await new Promise<void>((resolve,reject)=>req.session.save(e=>e?reject(e):resolve()));res.json({reset:true});
 }catch(e){next(e);}});
 router.delete('/candidate',(req,res)=>{delete req.session.setup;delete req.session.commission;res.status(204).end();});
 return router;
}
