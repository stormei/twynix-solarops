import type {AccountProfile} from '../src/app/domain/account.ts';

// Return display fields only; ThingsBoard's full account record stays on the server.
export function accountProfile(value:unknown):AccountProfile {
 const user=value&&typeof value==='object'?value as Record<string,unknown>:{};
 const text=(key:string)=>typeof user[key]==='string'?(user[key] as string).trim().slice(0,256):'';
 return {name:[text('firstName'),text('lastName')].filter(Boolean).join(' ')||null,email:text('email')||null};
}
