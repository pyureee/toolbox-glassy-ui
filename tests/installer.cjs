'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const {planInstall,applyInstall,restore,safePath} = require('../src/installer.cjs');
const patches = require('../src/patches.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'toolbox-custom-ui-test-'));
let passed=0;
function check(name,body) {body();passed++;console.log('PASS '+name);}
function write(relative,data) {const target=path.join(root,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data);}
function snapshot() {
    const result={};
    function visit(directory) {
        for(const entry of fs.readdirSync(directory,{withFileTypes:true})) {
            if(entry.name==='custom-ui-backups')continue;
            const full=path.join(directory,entry.name);
            if(entry.isDirectory())visit(full);
            else result[path.relative(root,full)]=fs.readFileSync(full).toString('base64');
        }
    }
    visit(root);return result;
}
const main=`module.exports = function(config, BrowserWindow) {
    this.window = new BrowserWindow({
        title: 'TERA Toolbox',
        width: config?.gui?.width || 743,
        height: config?.gui?.height || 514,
        minWidth: 743,
        minHeight: 514,
        frame: false,
        resizable: true,
        backgroundColor: '#292F33',
        webPreferences: {
            nodeIntegration: true,
            enableRemoteModule: true
        }
    });
    this.window.nativeHandler = 'keep existing behavior';
    return this.window;
};`;
const splash=`let SplashScreen;
function showSplashScreen(BrowserWindow) {
    SplashScreen = new BrowserWindow({
        title: 'TERA Toolbox',
        width: 880,
        height: 500,
        minWidth: 880,
        minHeight: 500,
        frame: false,
        resizable: false,
        backgroundColor: '#292F33',
        webPreferences: {nodeIntegration: true}
    });
    return SplashScreen;
}
module.exports = showSplashScreen;`;
const updater=`const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
class Updater extends EventEmitter {
    constructor(branch = 'master') {
        super();
        this.branch = branch;
    }
    check(manifest) {
        let operations = [];
        Object.keys(manifest.files).forEach(relpath => {
            operations.push(relpath);
        });
        return operations;
    }
}
module.exports = Updater;`;

try {
    write('bin/loader-gui.js',main);write('bin/index-gui.js',splash);write('bin/update-self.js',updater);
    write('bin/gui/main.html','<!doctype html><html><head><script>window.renderer = "native";</script></head><body data-original="yes"><div id="app"></div><script src="./js/app.js"></script></body></html>');
    for(const relative of ['bin/gui/splash.html','bin/gui/js/app.js','bin/gui/js/splash.js','bin/gui/css/app.css'])write(relative,'native file retained');
    write('bin/gui/assets/tb.gif',Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64'));
    write('config.json','{"gui":{"theme":"dark"},"nativeSetting":true}');
    write('mods/example/index.js','module.exports = "native mod";');
    const logo=path.join(root,'logo-input.png');
    fs.writeFileSync(logo,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB2kAAAAASUVORK5CYII=','base64'));
    const original=snapshot();
    let plan,result;
    check('planning leaves original Toolbox bytes untouched',()=>{plan=planInstall(root,logo);assert.deepStrictEqual(snapshot(),original);});
    check('install creates verified backups and preserves settings and mods',()=>{result=applyInstall(plan);assert(result.changed>0);assert(result.backupId);assert.strictEqual(fs.readFileSync(path.join(root,'config.json'),'base64'),original['config.json']);assert.strictEqual(fs.readFileSync(path.join(root,'mods/example/index.js'),'base64'),original[path.join('mods','example','index.js')]);});
    check('main window retains native handler and valid caption behavior',()=>{
        const module={exports:{}};
        let attached=0;
        vm.runInNewContext(fs.readFileSync(path.join(root,'bin/loader-gui.js'),'utf8'),{module,process:{platform:'win32'},ipcMain:{},require:name=>{assert.strictEqual(name,'./custom-ui-updater');return {attach:()=>attached++};}});
        let hook;
        function Window(options){this.options=options;this.max=false;this.hookWindowMessage=(message,callback)=>{assert.strictEqual(message,0xA3);hook=callback;};this.isMaximized=()=>this.max;this.maximize=()=>{this.max=true;};this.unmaximize=()=>{this.max=false;};}
        const window=new module.exports({gui:{width:1600,height:900}},Window);
        assert.strictEqual(attached,1);
        assert.strictEqual(window.nativeHandler,'keep existing behavior');assert.strictEqual(window.options.width,1600);assert.strictEqual(window.options.transparent,true);assert.strictEqual(window.options.webPreferences.contextIsolation,false);
        hook(Buffer.from([1,0,0,0]));assert.strictEqual(window.max,false);
        hook(Buffer.from([2,0,0,0]));assert.strictEqual(window.max,true);
        hook(Buffer.from([2,0,0,0]));assert.strictEqual(window.max,false);
    });
    check('self-updater skips UI paths and still allows other updates',()=>{
        const Updater=require(path.join(root,'bin/update-self.js'));
        const operations=new Updater('test').check({files:{'BIN\\GUI\\CSS\\GLASS.CSS':'hash','./bin/index-gui.js':'hash','bin/update-self.js':'hash','bin/custom-ui-updater.js':'hash','bin/custom-ui-installer/installer.cjs':'hash','custom-ui-settings.json':'hash','bin/core-update.js':'hash','mods/example/index.js':'hash'}});
        assert.deepStrictEqual(operations,['bin/core-update.js','mods/example/index.js']);
    });
    check('reinstall is idempotent and does not duplicate hooks or create backups',()=>{const again=planInstall(root,logo);assert.strictEqual(again.records.length,0);assert.strictEqual(applyInstall(again).backupId,null);});
    check('custom UI update preference is separate and survives reinstalls',()=>{write('custom-ui-settings.json','{"autoUpdate":true}');assert(!planInstall(root,logo).records.some(record=>record.path==='custom-ui-settings.json'));});
    check('restore refuses post-install edits before changing other files',()=>{
        const target=path.join(root,'bin/gui/css/glass.css'),installed=fs.readFileSync(target);fs.appendFileSync(target,'\n/* user edit */');const before=snapshot();assert.throws(()=>restore(root,result.backupId),/edited after installation/);assert.deepStrictEqual(snapshot(),before);fs.writeFileSync(target,installed);
    });
    check('restore refuses a corrupted backup before changing Toolbox',()=>{
        const target=path.join(result.backupDirectory,'files/bin/loader-gui.js'),originalBackup=fs.readFileSync(target);fs.appendFileSync(target,'corruption');const before=snapshot();assert.throws(()=>restore(root,result.backupId),/hash mismatch/);assert.deepStrictEqual(snapshot(),before);fs.writeFileSync(target,originalBackup);
    });
    check('restore returns every original file and removes new theme assets',()=>{restore(root,result.backupId);assert.deepStrictEqual(snapshot(),original);});
    check('unknown source layout aborts planning without installation writes',()=>{
        write('bin/loader-gui.js','different unsupported launcher');const before=snapshot();assert.throws(()=>planInstall(root,logo),/Unsupported Toolbox source/);assert.deepStrictEqual(snapshot(),before);write('bin/loader-gui.js',main);
    });
    check('valid CommonJS launch files can contain a top-level return',()=>{
        write('bin/loader-gui.js',main+'\nreturn;\n');assert(planInstall(root,logo).records.length>0);write('bin/loader-gui.js',main);
    });
    check('external file changes cause rollback of already applied UI files',()=>{
        const pending=planInstall(root,logo);fs.appendFileSync(path.join(root,'bin/update-self.js'),'\n// outside change');const before=snapshot();assert.throws(()=>applyInstall(pending),/changed during installation/);assert.deepStrictEqual(snapshot(),before);write('bin/update-self.js',updater);
    });
    check('paths outside Toolbox are rejected',()=>{assert.throws(()=>safePath(root,'../outside'),/Invalid relative path/);assert.throws(()=>safePath(root,'C:\\outside'),/Invalid relative path/);});
    check('HTML patch preserves native scripts and existing body attributes',()=>{const html=patches.patchMainHtml('<html><head></head><body class="original" data-keep="yes"><script src="js/app.js"></script></body></html>');assert(html.includes('data-keep="yes"'));assert(html.includes('class="original toolbox-modern"'));assert.strictEqual(patches.patchMainHtml(html),html);});
    console.log(`${passed} installer checks passed.`);
} finally {
    const resolved=fs.realpathSync(root),tempRoot=fs.realpathSync(os.tmpdir());
    if(path.dirname(resolved)===tempRoot&&path.basename(resolved).startsWith('toolbox-custom-ui-test-'))fs.rmSync(resolved,{recursive:true,force:true});
}
