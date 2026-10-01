'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const Module = require('module');
const patches = require('./patches.cjs');
const theme = require('./theme.json');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const samePath = (a,b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
const within = (root,target) => samePath(root,target) || (process.platform === 'win32' ? target.toLowerCase().startsWith(root.toLowerCase()+path.sep) : target.startsWith(root+path.sep));

function safePath(root, relative) {
    if (!relative || /^[\\/]/.test(relative) || relative.includes(':') || relative.split(/[\\/]/).some(part=>part==='..'||part==='.')) throw new Error(`Invalid relative path: ${relative}`);
    const target = path.resolve(root,relative);
    if (!within(root,target) || samePath(root,target)) throw new Error(`Path escaped Toolbox: ${relative}`);
    let ancestor=target;
    while(!fs.existsSync(ancestor)) ancestor=path.dirname(ancestor);
    if(!within(root,fs.realpathSync(ancestor))) throw new Error(`Path follows a link outside Toolbox: ${relative}`);
    return target;
}

function walk(directory) {
    return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
        const full=path.join(directory,entry.name);
        if(entry.isSymbolicLink()) throw new Error(`Source asset must not be a symbolic link: ${full}`);
        return entry.isDirectory()?walk(full):[full];
    });
}

function planInstall(toolboxRoot, staticLogo, sourceRoot=__dirname) {
    const root=fs.realpathSync(path.resolve(toolboxRoot));
    const required=['bin/loader-gui.js','bin/index-gui.js','bin/update-self.js','bin/gui/main.html','bin/gui/splash.html','bin/gui/js/app.js','bin/gui/js/splash.js','bin/gui/css/app.css','bin/gui/assets/tb.gif'];
    for(const relative of required) if(!fs.existsSync(safePath(root,relative))) throw new Error(`Not a supported Toolbox installation: missing ${relative}`);
    const changes=new Map();
    const read=relative=>fs.readFileSync(safePath(root,relative),'utf8');
    changes.set('bin/loader-gui.js',Buffer.from(patches.patchMainWindow(read('bin/loader-gui.js'))));
    changes.set('bin/index-gui.js',Buffer.from(patches.patchSplashWindow(read('bin/index-gui.js'))));
    changes.set('bin/update-self.js',Buffer.from(patches.patchUpdater(read('bin/update-self.js'))));
    changes.set('bin/gui/main.html',Buffer.from(patches.patchMainHtml(read('bin/gui/main.html'))));
    const assets=path.join(sourceRoot,'gui');
    for(const file of walk(assets)) changes.set('bin/gui/'+path.relative(assets,file).split(path.sep).join('/'),fs.readFileSync(file));
    const logo=fs.readFileSync(staticLogo);
    if(logo.length<24||logo.subarray(0,8).toString('hex')!=='89504e470d0a1a0a') throw new Error('Generated static logo is not a PNG.');
    changes.set('bin/gui/assets/tb-static.png',logo);
    const manifestPath='bin/gui/custom-ui-manifest.json';
    let existing={};
    if(fs.existsSync(safePath(root,manifestPath))) existing=JSON.parse(read(manifestPath));
    if(existing.preserve!==undefined&&!Array.isArray(existing.preserve)) throw new Error('Existing UI preserve manifest has an invalid preserve list.');
    const normalize=p=>p.replace(/\\/g,'/').replace(/^\.\//,'').toLowerCase();
    const preserve=Array.from(new Set([...(existing.preserve||[]),...theme.preserve,...changes.keys()].map(normalize)));
    changes.set(manifestPath,Buffer.from(JSON.stringify({...existing,version:1,description:'Toolbox Custom UI: smoked-glass appearance protected from self-update.',themeVersion:theme.version,preserve},null,2)+'\n'));
    for(const [relative,data] of changes) {
        safePath(root,relative);
        if(relative.endsWith('.js')) new vm.Script(Module.wrap(data.toString('utf8')),{filename:relative});
    }
    const ordered=Array.from(changes).sort(([a],[b])=>{
        const priority=r=>r===manifestPath?0:r==='bin/update-self.js'?1:2;
        return priority(a)-priority(b)||a.localeCompare(b);
    });
    const records=ordered.map(([relative,data])=>{
        const target=safePath(root,relative), existed=fs.existsSync(target);
        const original=existed?fs.readFileSync(target):null;
        return {path:relative,data,original,existed,originalSha256:original?hash(original):null,installedSha256:hash(data)};
    }).filter(record=>!record.existed||hash(record.original)!==record.installedSha256);
    return {root,records};
}

function applyInstall(plan) {
    if(!plan.records.length) return {changed:0,backupId:null,message:'This theme version is already installed. No files changed.'};
    const id=new Date().toISOString().replace(/[-:.]/g,'').slice(0,15)+'Z-'+crypto.randomBytes(3).toString('hex');
    const backup=safePath(plan.root,'custom-ui-backups/'+id);
    fs.mkdirSync(backup,{recursive:true});
    const manifest={format:1,themeVersion:theme.version,toolboxRoot:plan.root,created:new Date().toISOString(),status:'prepared',files:plan.records.map(({data,original,...record})=>record)};
    for(const record of plan.records) if(record.existed) {
        const target=safePath(plan.root,'custom-ui-backups/'+id+'/files/'+record.path);
        fs.mkdirSync(path.dirname(target),{recursive:true});
        fs.writeFileSync(target,record.original);
        if(hash(fs.readFileSync(target))!==record.originalSha256) throw new Error('Backup verification failed: '+record.path);
    }
    const manifestFile=safePath(plan.root,'custom-ui-backups/'+id+'/backup.json');
    fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n');
    const applied=[];
    try {
        for(const record of plan.records) {
            const target=safePath(plan.root,record.path);
            const current=fs.existsSync(target)?hash(fs.readFileSync(target)):null;
            if(current!==record.originalSha256) throw new Error('File changed during installation: '+record.path);
            fs.mkdirSync(path.dirname(target),{recursive:true});
            applied.push(record);
            fs.writeFileSync(target,record.data);
            if(hash(fs.readFileSync(target))!==record.installedSha256) throw new Error('Installed file verification failed: '+record.path);
        }
        manifest.status='installed';
        fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n');
    } catch(error) {
        const rollbackErrors=[];
        for(const record of applied.reverse()) {
            try {
                const target=safePath(plan.root,record.path);
                if(record.existed) fs.writeFileSync(target,record.original);
                else if(fs.existsSync(target)) fs.unlinkSync(target);
            } catch(rollbackError) { rollbackErrors.push(rollbackError.message); }
        }
        manifest.status='failed';
        manifest.rollbackErrors=rollbackErrors;
        fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n');
        throw new Error(error.message+(rollbackErrors.length?' Rollback errors: '+rollbackErrors.join('; '):' Original files were restored.'));
    }
    return {changed:plan.records.length,backupId:id,backupDirectory:backup,message:'Glass UI installed. Close and reopen Toolbox.'};
}

function allowedPaths() {
    return new Set([...theme.preserve,...walk(path.join(__dirname,'gui')).map(file=>'bin/gui/'+path.relative(path.join(__dirname,'gui'),file).split(path.sep).join('/'))]);
}

function restore(toolboxRoot, backupId) {
    const root=fs.realpathSync(path.resolve(toolboxRoot));
    if(!backupId) {
        const directory=safePath(root,'custom-ui-backups');
        if(!fs.existsSync(directory)) throw new Error('No UI backups were found.');
        const ids=fs.readdirSync(directory).filter(id=>/^\d{8}T\d{6}Z-[a-f0-9]{6}$/.test(id)).sort().reverse();
        backupId=ids.find(id=>{
            const file=safePath(root,'custom-ui-backups/'+id+'/backup.json');
            return fs.existsSync(file)&&JSON.parse(fs.readFileSync(file,'utf8')).status==='installed';
        });
    }
    if(!backupId||!/^\d{8}T\d{6}Z-[a-f0-9]{6}$/.test(backupId)) throw new Error('A valid UI backup ID is required.');
    const relativeBackup='custom-ui-backups/'+backupId;
    const manifestFile=safePath(root,relativeBackup+'/backup.json');
    const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
    if(manifest.format!==1||manifest.status!=='installed'||!samePath(manifest.toolboxRoot,root)||!Array.isArray(manifest.files)||!manifest.files.length) throw new Error('Backup is not an installed theme backup for this Toolbox directory.');
    const permitted=allowedPaths(),seen=new Set();
    const records=manifest.files.map(record=>{
        if(!permitted.has(record.path)||seen.has(record.path)||typeof record.existed!=='boolean'||!/^[a-f0-9]{64}$/.test(record.installedSha256)) throw new Error('Invalid UI backup file record.');
        seen.add(record.path);
        const target=safePath(root,record.path);
        if(!fs.existsSync(target)||hash(fs.readFileSync(target))!==record.installedSha256) throw new Error('File was edited after installation; restore stopped: '+record.path);
        const current=fs.readFileSync(target);
        let original=null;
        if(record.existed) {
            original=fs.readFileSync(safePath(root,relativeBackup+'/files/'+record.path));
            if(hash(original)!==record.originalSha256) throw new Error('Backup file hash mismatch: '+record.path);
        }
        return {...record,target,current,original};
    });
    const applied=[];
    try {
        for(const record of records.slice().reverse()) {
            applied.push(record);
            if(record.existed) fs.writeFileSync(record.target,record.original);
            else fs.unlinkSync(record.target);
        }
        manifest.status='restored';
        manifest.restored=new Date().toISOString();
        fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n');
    } catch(error) {
        for(const record of applied.reverse()) fs.writeFileSync(safePath(root,record.path),record.current);
        throw error;
    }
    return {restored:records.length,backupId,message:'Previous UI restored. Close and reopen Toolbox.'};
}

function cli(args) {
    const command=args.shift(),parameters={};
    while(args.length) {
        const key=args.shift(),value=args.shift();
        if(!['--toolbox','--static-logo','--backup'].includes(key)||!value||parameters[key]) throw new Error('Invalid installer arguments. Use Install.ps1 or Restore.ps1.');
        parameters[key]=value;
    }
    if(!parameters['--toolbox']) throw new Error('Toolbox directory is required.');
    let result;
    if(command==='install') {
        if(!parameters['--static-logo']) throw new Error('Static logo input is required.');
        result=applyInstall(planInstall(parameters['--toolbox'],parameters['--static-logo']));
    } else if(command==='restore') result=restore(parameters['--toolbox'],parameters['--backup']);
    else throw new Error('Unknown command. Use install or restore.');
    console.log(result.message);
    if(result.backupId) console.log('Backup ID: '+result.backupId);
    if(result.backupDirectory) console.log('Backup directory: '+result.backupDirectory);
    return result;
}

if(require.main===module) {
    try { cli(process.argv.slice(2)); }
    catch(error) { console.error('Toolbox Custom UI: '+error.message); process.exitCode=1; }
}
module.exports={planInstall,applyInstall,restore,safePath,cli};
