'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),{EventEmitter}=require('events');
const {CustomUIUpdater,attach,validateManifest,newer,MANIFEST_URL}=require('../src/runtime/custom-ui-updater.js');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'toolbox-custom-ui-updater-test-'));
let passed=0;
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
function write(name,data){const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data);}
const bytes=new Map();
for(const name of ['src/installer.cjs','src/patches.cjs','src/theme.json','src/runtime/custom-ui-updater.js','src/gui/js/custom-ui-settings.js','src/gui/css/glass.css']) {
    const data=name==='src/theme.json'?Buffer.from('{"version":"1.1.1"}'):fs.readFileSync(path.join(__dirname,'..',name));bytes.set(name,data);
}
const manifest={schema:1,version:'1.1.1',commit:'a'.repeat(40),files:Array.from(bytes,([name,data])=>({path:name,sha256:hash(data),size:data.length}))};
function reset(enabled=false){write('custom-ui-settings.json',JSON.stringify({autoUpdate:enabled,sentinel:'keep'}));write('bin/gui/custom-ui-manifest.json','{"themeVersion":"1.1.0"}');}
function fakeFetch(calls){return async url=>{calls.push(url);if(url===MANIFEST_URL)return Buffer.from(JSON.stringify(manifest));return bytes.get(url.split('/'+'a'.repeat(40)+'/')[1]);};}
async function check(name,body){reset();await body();passed++;console.log('PASS '+name);}
(async()=>{
    await check('disabled custom UI updates make no network requests',async()=>{const calls=[];const updater=new CustomUIUpdater(root,{fetch:fakeFetch(calls)});assert.deepStrictEqual(await updater.check(),{skipped:true});assert.strictEqual(calls.length,0);updater.dispose();});
    await check('checkbox persists separately and downloads from the pinned GitHub commit',async()=>{
        const calls=[];let installed=0;
        const updater=new CustomUIUpdater(root,{fetch:fakeFetch(calls),install:stage=>{installed++;for(const [name,data] of bytes)assert.strictEqual(hash(fs.readFileSync(path.join(stage,name.slice(4)))),hash(data));return {backupId:'fixture-backup'};}});
        updater.setEnabled(true);const result=await updater.check();assert(result.updated);assert.strictEqual(installed,1);assert(calls.slice(1).every(url=>url.includes('/'+'a'.repeat(40)+'/')));assert.strictEqual(JSON.parse(fs.readFileSync(path.join(root,'custom-ui-settings.json'))).sentinel,'keep');assert.strictEqual(updater.state.version,'1.1.1');assert(updater.state.message.includes('Reopen Toolbox'));updater.dispose();
    });
    await check('new updater instance retains the checkbox preference',async()=>{reset(true);const updater=new CustomUIUpdater(root);assert.strictEqual(updater.state.enabled,true);updater.dispose();});
    await check('enabling waits for the next launch and startup checks only once without timers',async()=>{
        let calls=0;
        const fetch=async()=>{calls++;return Buffer.from(JSON.stringify({...manifest,version:'1.0.0'}));};
        const previousInterval=global.setInterval;
        global.setInterval=()=>assert.fail('Custom UI updates must not schedule periodic checks');
        try {
            const current=new CustomUIUpdater(root,{fetch});current.start();current.setEnabled(true);await Promise.resolve();assert.strictEqual(calls,0);current.start();assert.strictEqual(calls,0);current.dispose();
            const nextLaunch=new CustomUIUpdater(root,{fetch});await nextLaunch.start();assert.strictEqual(calls,1);nextLaunch.start();nextLaunch.setEnabled(false);nextLaunch.setEnabled(true);nextLaunch.start();await Promise.resolve();assert.strictEqual(calls,1);nextLaunch.dispose();
        } finally {global.setInterval=previousInterval;}
    });
    await check('up-to-date versions do not download or install assets',async()=>{reset(true);write('bin/gui/custom-ui-manifest.json','{"themeVersion":"1.1.1"}');let calls=0;const updater=new CustomUIUpdater(root,{fetch:async()=>{calls++;return Buffer.from(JSON.stringify(manifest));},install:()=>assert.fail('No install expected')});assert.strictEqual((await updater.check()).updated,false);assert.strictEqual(calls,1);updater.dispose();});
    await check('concurrent checks share one download and install',async()=>{reset(true);let installs=0;const updater=new CustomUIUpdater(root,{fetch:fakeFetch([]),install:()=>{installs++;return {};}});const first=updater.check(),second=updater.check();assert.strictEqual(first,second);await Promise.all([first,second]);assert.strictEqual(installs,1);updater.dispose();});
    await check('a corrupt download never reaches installation',async()=>{reset(true);const fetch=fakeFetch([]);const updater=new CustomUIUpdater(root,{fetch:async url=>url===MANIFEST_URL?fetch(url):Buffer.from('corrupt'),install:()=>assert.fail('Corrupt bytes must not install')});const result=await updater.check();assert(result.error.includes('verification failed'));assert.strictEqual(JSON.parse(fs.readFileSync(path.join(root,'bin/gui/custom-ui-manifest.json'))).themeVersion,'1.1.0');updater.dispose();});
    await check('network errors keep the installed UI and enabled preference',async()=>{reset(true);const updater=new CustomUIUpdater(root,{fetch:async()=>{throw new Error('network fixture error');},install:()=>assert.fail()});assert((await updater.check()).error.includes('network fixture error'));assert.strictEqual(updater.state.enabled,true);assert.strictEqual(updater.state.version,'1.1.0');updater.dispose();});
    await check('disabling during a check prevents installation',async()=>{
        reset(true);let release;const waiting=new Promise(resolve=>{release=resolve;});const updater=new CustomUIUpdater(root,{fetch:()=>waiting,install:()=>assert.fail('Disabled updates must not install')});const pending=updater.check();updater.setEnabled(false);release(Buffer.from(JSON.stringify(manifest)));assert.deepStrictEqual(await pending,{skipped:true});updater.dispose();
    });
    await check('manifest rejects traversal, duplicate files, mutable refs, and invalid hashes',async()=>{
        for(const mutate of [m=>m.files[0].path='../mods/private.js',m=>m.files.push({...m.files[0]}),m=>m.commit='main',m=>m.files[0].sha256='bad',m=>m.files[0].size=99999999,m=>m.files=m.files.slice(1)]) {
            const bad=JSON.parse(JSON.stringify(manifest));mutate(bad);assert.throws(()=>validateManifest(bad));
        }
        assert(validateManifest(manifest));assert(newer('1.2.0','1.1.9'));assert(!newer('1.1.0','1.1.0'));assert(!newer('1.0.9','1.1.0'));
    });
    await check('window IPC owns its settings messages and cleans up on close',async()=>{
        const ipc=new EventEmitter(),window=new EventEmitter(),sent=[];
        window.isDestroyed=()=>false;window.webContents={isDestroyed:()=>false,send:(...message)=>sent.push(message)};
        const updater=attach(window,ipc,{root,fetch:async()=>Buffer.from(JSON.stringify({...manifest,version:'1.0.0'}))});
        ipc.emit('custom-ui:set-auto-update',{sender:{send:()=>{}}},true);assert.strictEqual(updater.state.enabled,false);
        ipc.emit('custom-ui:set-auto-update',{sender:window.webContents},true);await updater.check();assert.strictEqual(updater.state.enabled,true);
        assert.strictEqual(attach(window,ipc,{root}),updater);assert.strictEqual(ipc.listenerCount('custom-ui:get-state'),1);
        window.emit('closed');assert.strictEqual(ipc.listenerCount('custom-ui:get-state'),0);assert.strictEqual(ipc.listenerCount('custom-ui:set-auto-update'),0);assert(updater.disposed);assert(sent.length);
    });
    console.log(passed+' custom UI updater checks passed.');
})().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(()=>{
    const absolute=fs.realpathSync(root),tempRoot=fs.realpathSync(os.tmpdir());
    if(path.dirname(absolute)===tempRoot&&path.basename(absolute).startsWith('toolbox-custom-ui-updater-test-'))fs.rmSync(absolute,{recursive:true,force:true});
});
