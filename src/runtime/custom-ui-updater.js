'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const crypto = require('crypto');
const REPOSITORY = 'pyureee/toolbox-glassy-ui';
const MANIFEST_URL = 'https://raw.githubusercontent.com/'+REPOSITORY+'/main/updates/latest.json';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function fetchBytes(url,{maxBytes=4*1024*1024,signal}={}) {
    return new Promise((resolve,reject) => {
        const request = https.get(url,{signal,headers:{'User-Agent':'Toolbox-Custom-UI','Accept':'application/octet-stream'}},response => {
            if(response.statusCode!==200) {response.resume();reject(new Error('GitHub returned HTTP '+response.statusCode));return;}
            let size=0;const parts=[];
            response.on('data',chunk=>{size+=chunk.length;if(size>maxBytes)request.destroy(new Error('Download exceeded its size limit.'));else parts.push(chunk);});
            response.on('end',()=>resolve(Buffer.concat(parts)));
            response.on('error',reject);
        });
        request.setTimeout(15000,()=>request.destroy(new Error('GitHub download timed out.')));
        request.on('error',reject);
    });
}
function versionParts(version) {
    if(typeof version!=='string'||!/^\d+\.\d+\.\d+$/.test(version))throw new Error('Invalid custom UI version.');
    return version.split('.').map(Number);
}
function newer(a,b) {
    const aa=versionParts(a),bb=versionParts(b);
    for(let i=0;i<3;i++)if(aa[i]!==bb[i])return aa[i]>bb[i];
    return false;
}
function validateManifest(manifest) {
    if(!manifest||manifest.schema!==1||!/^[a-f0-9]{40}$/.test(manifest.commit)||!Array.isArray(manifest.files)||manifest.files.length<5||manifest.files.length>64)throw new Error('Invalid GitHub update manifest.');
    versionParts(manifest.version);
    const required=new Set(['src/installer.cjs','src/patches.cjs','src/theme.json','src/runtime/custom-ui-updater.js','src/gui/js/custom-ui-settings.js']);
    const seen=new Set();let total=0;
    for(const file of manifest.files) {
        const name=file.path;
        if(typeof name!=='string'||name.includes('..')||name.includes('\\')||!(/^(src\/(installer\.cjs|patches\.cjs|theme\.json|runtime\/custom-ui-updater\.js)|src\/gui\/[a-zA-Z0-9_./-]+\.(css|js|woff2|txt|png))$/.test(name))||seen.has(name)||!/^[a-f0-9]{64}$/.test(file.sha256)||!Number.isSafeInteger(file.size)||file.size<1||file.size>4*1024*1024)throw new Error('Invalid update file record.');
        seen.add(name);required.delete(name);total+=file.size;
    }
    if(required.size||total>16*1024*1024)throw new Error('Incomplete or oversized UI update.');
    return manifest;
}
class CustomUIUpdater {
    constructor(root,{fetch=fetchBytes,notify=()=>{},install}={}) {
        this.root=fs.realpathSync(root);this.fetch=fetch;this.notify=notify;this.install=install;
        this.settingsFile=path.join(this.root,'custom-ui-settings.json');this.started=false;this.running=null;this.abort=null;this.disposed=false;
        this.state={enabled:false,version:'1.2.2',message:'Automatic custom UI updates are off.'};
        this.refresh();
    }
    readSettings() {return fs.existsSync(this.settingsFile)?JSON.parse(fs.readFileSync(this.settingsFile,'utf8')):{autoUpdate:false};}
    refresh() {
        try {this.state.enabled=this.readSettings().autoUpdate===true;} catch(error) {this.state.enabled=false;this.state.message='Could not read custom UI settings: '+error.message;}
        try {this.state.appearance=validateAppearance(this.readSettings().appearance || {themeColor:null,transparency:36});} catch (_) {this.state.appearance={themeColor:null,transparency:36};}
        try {this.state.version=JSON.parse(fs.readFileSync(path.join(this.root,'bin/gui/custom-ui-manifest.json'),'utf8')).themeVersion||this.state.version;} catch(_) {}
        return {...this.state};
    }
    emit(message) {if(message)this.state.message=message;if(!this.disposed)this.notify({...this.state});}
    start() {
        if(this.disposed||this.started)return;
        this.started=true;
        if(this.state.enabled)return this.check();
    }
    setEnabled(enabled) {
        if(typeof enabled!=='boolean')throw new Error('The custom UI update option must be a checkbox value.');
        const settings=this.readSettings();
        const temp=this.settingsFile+'.tmp-'+crypto.randomBytes(4).toString('hex');
        try {fs.writeFileSync(temp,JSON.stringify({...settings,autoUpdate:enabled},null,2)+'\n');fs.renameSync(temp,this.settingsFile);} finally {if(fs.existsSync(temp))fs.unlinkSync(temp);}
        this.state.enabled=enabled;
        if(!enabled) {if(this.abort)this.abort.abort();this.emit('Automatic custom UI updates are off.');}
        else this.emit('Custom UI updates will be checked next time Toolbox starts.');
        return {...this.state};
    }
    setAppearance(value) {
        const appearance=validateAppearance(value);
        const settings=this.readSettings();
        const temp=this.settingsFile+'.tmp-'+crypto.randomBytes(4).toString('hex');
        try {fs.writeFileSync(temp,JSON.stringify({...settings,appearance},null,2)+'\n');fs.renameSync(temp,this.settingsFile);} finally {if(fs.existsSync(temp))fs.unlinkSync(temp);}
        this.state.appearance=appearance;this.emit();
        return {...this.state};
    }
    check() {
        if(this.disposed||!this.state.enabled)return Promise.resolve({skipped:true});
        if(this.running)return this.running;
        this.running=this.performCheck().finally(()=>{this.running=null;this.abort=null;});
        return this.running;
    }
    async performCheck() {
        let stage;
        this.abort=new AbortController();
        const stillEnabled=()=>{if(this.disposed||!this.state.enabled||this.readSettings().autoUpdate!==true)throw new Error('Custom UI updates were disabled.');};
        try {
            this.emit('Checking GitHub for custom UI updates...');
            const bytes=await this.fetch(MANIFEST_URL,{maxBytes:128*1024,signal:this.abort.signal});
            stillEnabled();
            const manifest=validateManifest(JSON.parse(bytes.toString('utf8')));
            this.refresh();
            if(!newer(manifest.version,this.state.version)) {this.emit('Your custom UI is up to date.');return {updated:false};}
            stage=fs.mkdtempSync(path.join(os.tmpdir(),'toolbox-custom-ui-download-'));
            this.emit('Downloading custom UI '+manifest.version+'...');
            for(const file of manifest.files) {
                stillEnabled();
                const data=await this.fetch('https://raw.githubusercontent.com/'+REPOSITORY+'/'+manifest.commit+'/'+file.path,{maxBytes:file.size,signal:this.abort.signal});
                if(data.length!==file.size||hash(data)!==file.sha256)throw new Error('Download verification failed: '+file.path);
                const target=path.join(stage,...file.path.split('/'));
                fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data);
            }
            stillEnabled();
            const sourceRoot=path.join(stage,'src');
            if(JSON.parse(fs.readFileSync(path.join(sourceRoot,'theme.json'),'utf8')).version!==manifest.version)throw new Error('Update version did not match its manifest.');
            const engine=this.install?null:require(path.join(sourceRoot,'installer.cjs'));
            const result=this.install?this.install(sourceRoot):engine.applyInstall(engine.planInstall(this.root,path.join(this.root,'bin/gui/assets/tb-static.png'),sourceRoot));
            this.refresh();this.state.version=manifest.version;
            this.emit('Updated to '+manifest.version+'. Reopen Toolbox to apply.');
            return {updated:true,...result};
        } catch(error) {
            if(this.disposed||!this.state.enabled) return {skipped:true};
            this.emit('Custom UI update failed; your current UI was kept. '+error.message);
            return {updated:false,error:error.message};
        } finally {
            if(stage&&fs.existsSync(stage)) {
                const absolute=fs.realpathSync(stage),tempRoot=fs.realpathSync(os.tmpdir());
                if(path.dirname(absolute)===tempRoot&&path.basename(absolute).startsWith('toolbox-custom-ui-download-'))fs.rmSync(absolute,{recursive:true,force:true});
            }
        }
    }
    dispose() {this.disposed=true;if(this.abort)this.abort.abort();}
}
function validateAppearance(value) {
    if(!value || (value.themeColor!==null && (typeof value.themeColor!=='string' || !/^#[a-f0-9]{6}$/i.test(value.themeColor))) || !Number.isInteger(value.transparency) || value.transparency<0 || value.transparency>100)throw new Error('Invalid custom UI appearance.');
    return {themeColor:value.themeColor===null?null:value.themeColor.toUpperCase(),transparency:value.transparency};
}
function attach(window,ipcMain,options={}) {
    if(window.__toolboxCustomUIUpdater)return window.__toolboxCustomUIUpdater;
    const updater=new CustomUIUpdater(options.root||path.join(__dirname,'..'),{...options,notify:state=>{if(!window.isDestroyed()&&!window.webContents.isDestroyed())window.webContents.send('custom-ui:state',state);}});
    const valid=event=>!window.isDestroyed()&&event.sender===window.webContents;
    const get=event=>{if(valid(event))event.sender.send('custom-ui:state',updater.refresh());};
    const set=(event,enabled)=>{if(!valid(event))return;try {updater.setEnabled(enabled);} catch(error) {updater.emit('Could not save custom UI settings: '+error.message);}};
    const appearance=(event,value)=>{if(!valid(event))return;try {updater.setAppearance(value);} catch(error) {updater.emit('Could not save custom UI appearance: '+error.message);}};
    ipcMain.on('custom-ui:get-state',get);ipcMain.on('custom-ui:set-auto-update',set);
    ipcMain.on('custom-ui:set-appearance',appearance);
    window.once('closed',()=>{ipcMain.removeListener('custom-ui:get-state',get);ipcMain.removeListener('custom-ui:set-auto-update',set);ipcMain.removeListener('custom-ui:set-appearance',appearance);updater.dispose();});
    window.__toolboxCustomUIUpdater=updater;updater.start();return updater;
}
module.exports={CustomUIUpdater,attach,fetchBytes,validateManifest,newer,MANIFEST_URL};
