import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(),html=await readFile(path.join(root,'dist/index.html'),'utf8');
const active=html.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi,'');
const links=[...active.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/gi)].map(m=>m[0]);
assert.ok(links.some(tag=>!tag.includes('media="print"')),'The dashboard stylesheet must load directly for screen display under the server CSP.');
for(const tag of links){const href=/href="([^"]+)"/.exec(tag)?.[1];assert.ok(href);await access(path.join(root,'dist',href));}
for(const script of active.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))assert.ok(/\bsrc=/.test(script[1])||!script[2].trim(),'Inline script loading would be blocked by the local server CSP.');
console.log('Build verified: screen styles load directly, assets exist, and no inline script loader is required.');
