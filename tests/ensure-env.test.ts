import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {parse} from 'dotenv';
import {ensureEnv} from '../scripts/ensure-env.mjs';
test('first launch creates a private .env with a unique secret and never overwrites an existing configuration',async()=>{const root=await mkdtemp(path.join(tmpdir(),'solarops-first-env-'));try{await writeFile(path.join(root,'.env.example'),'SESSION_SECRET=replace-me\nDEFAULT_LANGUAGE=en\nDEFAULT_THEME=light\nTB_URL=\n');assert.equal(await ensureEnv(root),true);const original=await readFile(path.join(root,'.env'),'utf8'),env=parse(original);assert.ok(env.SESSION_SECRET.length>=32);assert.notEqual(env.SESSION_SECRET,'replace-me');assert.equal(env.DEFAULT_THEME,'light');assert.equal((await stat(path.join(root,'.env'))).mode&0o777,0o600);await writeFile(path.join(root,'.env'),original+'CUSTOM_SETTING=keep-me\n');assert.equal(await ensureEnv(root),false);assert.equal(await readFile(path.join(root,'.env'),'utf8'),original+'CUSTOM_SETTING=keep-me\n');}finally{await rm(root,{recursive:true,force:true});}});
