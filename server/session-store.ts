import session from 'express-session';
import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import path from 'node:path';

// Server-managed sessions survive application restarts. Tokens are encrypted at
// rest; passwords are never included. Files expire with the existing cookie TTL.
export class EncryptedSessionStore extends session.Store {
 private readonly key:Buffer;
 constructor(private readonly directory:string,secret:string){super();this.key=createHash('sha256').update(secret).digest();}
 private file(id:string){return path.join(this.directory,createHash('sha256').update(id).digest('hex')+'.session');}
 get(id:string,callback:(error:unknown,data?:session.SessionData|null)=>void){
  void(async()=>{
   try{
    const payload=JSON.parse(await readFile(this.file(id),'utf8')) as {iv:string;tag:string;data:string};
    const decipher=createDecipheriv('aes-256-gcm',this.key,Buffer.from(payload.iv,'base64'));decipher.setAuthTag(Buffer.from(payload.tag,'base64'));
    const plain=Buffer.concat([decipher.update(Buffer.from(payload.data,'base64')),decipher.final()]);
    const data=JSON.parse(plain.toString('utf8')) as session.SessionData;
    if(data.cookie.expires&&new Date(data.cookie.expires).getTime()<=Date.now()){await unlink(this.file(id));callback(null,null);return;}
    callback(null,data);
   }catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')callback(null,null);else callback(e);}
  })();
 }
 set(id:string,data:session.SessionData,callback?:(error?:unknown)=>void){
  void(async()=>{
   let temporary:string|undefined;
   try{
    await mkdir(this.directory,{recursive:true,mode:0o700});
    const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,iv);
    const encrypted=Buffer.concat([cipher.update(JSON.stringify(data),'utf8'),cipher.final()]);
    const payload=JSON.stringify({iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64')});
    temporary=this.file(id)+'.'+randomBytes(6).toString('hex')+'.tmp';
    await writeFile(temporary,payload,{mode:0o600,flag:'wx'});await rename(temporary,this.file(id));callback?.();
   }catch(e){if(temporary)await unlink(temporary).catch(()=>{});callback?.(e);}
  })();
 }
 destroy(id:string,callback?:(error?:unknown)=>void){void unlink(this.file(id)).then(()=>callback?.()).catch(e=>callback?.((e as NodeJS.ErrnoException).code==='ENOENT'?undefined:e));}
 touch(id:string,data:session.SessionData,callback?:(error?:unknown)=>void){this.set(id,data,callback);}
}
