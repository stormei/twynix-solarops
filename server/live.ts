import WebSocket from 'ws';
import {Response} from 'express';
import {PlantService} from './plant.ts';
import {Plant} from '../src/app/domain/solar.ts';

export class LiveConnection {
 private clients=new Set<Response>();
 private ws?:WebSocket;
 private retry?:ReturnType<typeof setTimeout>;
 private heartbeat?:ReturnType<typeof setInterval>;
 private refresh?:ReturnType<typeof setTimeout>;
 private attempt=0;private stopped=false;private lastPong=Date.now();
 private busy=false;private dirty=false;private current?:Plant;
 private receivedMessages=0;private lastMessageAt:number|null=null;private authenticated=false;
 private lastError:string|null=null;
 constructor(private service:PlantService,private expires:number){this.current=service.last;}
 add(res:Response){
  this.clients.add(res);
  res.on('close',()=>{this.clients.delete(res);if(!this.clients.size)this.stop();});
  if(this.current)res.write(`data: ${JSON.stringify({...this.current,connection:this.diagnostics})}\n\n`);
  this.status();if(!this.ws&&!this.retry)this.connect();
 }
 private status(){for(const res of this.clients)res.write(`event: connection\ndata: ${JSON.stringify(this.diagnostics)}\n\n`);}
 private schedule(){if(!this.refresh)this.refresh=setTimeout(()=>{this.refresh=undefined;void this.update();},150);}
 private async update(){
  if(this.stopped)return;if(this.busy){this.dirty=true;return;}this.busy=true;
  try{
   this.current=await this.service.query(undefined,undefined,this.current);
   this.current.connection=this.diagnostics;
   for(const res of this.clients)res.write(`data: ${JSON.stringify(this.current)}\n\n`);
  }catch{for(const res of this.clients)res.write('event: connection-error\ndata: {}\n\n');}
  finally{this.busy=false;if(this.dirty){this.dirty=false;this.schedule();}}
 }
 private connect(){
  this.retry=undefined;
  if(this.stopped||Date.now()>=this.expires){this.stop();return;}
  const cfg=this.service.tb.config,url=cfg.url.replace(/^http/,'ws')+'/api/ws';
  const ws=this.ws=new WebSocket(url,{handshakeTimeout:15000});this.status();
  ws.on('open',async()=>{
   try{
    this.lastPong=Date.now();const {all:devices}=await this.service.tb.discover();
    if(this.stopped||ws.readyState!==WebSocket.OPEN)return;
    // Union the actual telemetry key names; object spreading drops acPower/DC
    // mappings when the inverter and site use the same logical field names.
    const telemetry=[...new Set([...Object.values(cfg.mapping),...Object.values(cfg.siteMapping??{}),...devices.flatMap(d=>Object.values(d.solarops?.solaropsTelemetryMapping??{}))].map(m=>m.key))].map(key=>({type:'TIME_SERIES',key}));
    const keys=[...telemetry,{type:'ATTRIBUTE',key:'active'}];
    ws.send(JSON.stringify({authCmd:{cmdId:0,token:this.service.tb.token},cmds:[{
     cmdId:1,type:'ENTITY_DATA',query:{
      entityFilter:{type:'entityList',entityType:'DEVICE',entityList:devices.map(d=>d.id.id)},
      pageLink:{pageSize:Math.max(1,devices.length),page:0},
      entityFields:[{type:'ENTITY_FIELD',key:'name'}],latestValues:keys,keyFilters:[]
     },latestCmd:{keys}
    }]}));
    this.heartbeat=setInterval(()=>{
     if(Date.now()>=this.expires){this.stop();return;}
     if(Date.now()-this.lastPong>60000){ws.terminate();return;}
     ws.ping();this.status();for(const res of this.clients)res.write(': heartbeat\n\n');void this.update();
    },15000);
   }catch{this.lastError='Subscription failed';ws.close();}
  });
  ws.on('pong',()=>{this.lastPong=Date.now();});
  ws.on('message',raw=>{
   this.lastPong=Date.now();
   try{
    const msg=JSON.parse(String(raw));this.receivedMessages++;this.lastMessageAt=Date.now();
    if(msg.errorCode){this.lastError=`ThingsBoard error ${msg.errorCode}: ${String(msg.errorMsg??'Subscription rejected').slice(0,200)}`;if(msg.errorCode===3){this.stop();return;}ws.close();return;}
    if(msg.cmdId===1&&(msg.data||msg.update)){
     const rows=msg.data?.data??msg.update??[];
     this.service.tb.ingestLive(Array.isArray(rows)?rows:[]);
     this.service.tb.setLiveReady(true);this.authenticated=true;this.lastError=null;this.attempt=0;
     this.status();this.schedule();
    }
   }catch{this.lastError='Invalid WebSocket response';ws.close();}
  });
  ws.on('error',()=>{this.lastError='ThingsBoard WebSocket unavailable';ws.close();});
  ws.on('close',()=>{
   if(this.heartbeat)clearInterval(this.heartbeat);
   this.ws=undefined;this.authenticated=false;this.service.tb.setLiveReady(false);this.status();
   if(!this.stopped){this.attempt++;this.retry=setTimeout(()=>this.connect(),Math.min(30000,1000*2**Math.min(this.attempt,5))+Math.random()*500);}
  });
 }
 stop(){
  if(this.stopped)return;this.stopped=true;
  if(this.retry)clearTimeout(this.retry);if(this.refresh)clearTimeout(this.refresh);if(this.heartbeat)clearInterval(this.heartbeat);
  this.service.tb.setLiveReady(false);this.ws?.close();this.status();
  for(const res of this.clients){res.write('event: connection-error\ndata: {}\n\n');res.end();}this.clients.clear();
 }
 get diagnostics(){return {transport:'websocket' as const,state:this.stopped?'closed':this.ws?.readyState===WebSocket.OPEN?(this.authenticated?'connected':'authenticating'):'reconnecting',receivedMessages:this.receivedMessages,lastMessageAt:this.lastMessageAt,lastError:this.lastError};}
 get closed(){return this.stopped;}
}
