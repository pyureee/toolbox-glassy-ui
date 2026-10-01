/* Render the custom preference with Toolbox's own BoolOption component. */
(() => {
    'use strict';
    const {ipcRenderer} = require('electron');
    const fs = require('fs');
    const path = require('path');
    const {fileURLToPath} = require('url');
    let enabled = false;
    let application;
    try {
        const root = path.resolve(path.dirname(fileURLToPath(location.href)),'../..');
        enabled = JSON.parse(fs.readFileSync(path.join(root,'custom-ui-settings.json'),'utf8')).autoUpdate === true;
    } catch (_) {}

    function findApp(vm) {
        if (!vm) return null;
        if (vm.$options && vm.$options.name === 'App') return vm;
        for (const child of vm.$children || []) {
            const found = findApp(child);
            if (found) return found;
        }
        return null;
    }
    function change({val}) {
        enabled = Boolean(val);
        ipcRenderer.send('custom-ui:set-auto-update',enabled);
    }
    function insertOption(node,vm) {
        if (!node || typeof node !== 'object') return;
        const children = node.componentOptions ? node.componentOptions.children : node.children;
        if (!children) return;
        const index = children.findIndex(child => child && child.componentOptions && child.componentOptions.propsData && child.componentOptions.propsData.field === 'autostart');
        if (index !== -1) {
            if (!children.some(child => child && child.key === 'toolbox-custom-ui-autoupdate')) {
                children.splice(index,0,vm.$createElement('BoolOption',{
                    key:'toolbox-custom-ui-autoupdate',
                    ref:'toolboxCustomUIAutoUpdate',
                    staticClass:'tb-custom-ui-checkbox',
                    attrs:{id:'tb-custom-ui-autoupdate',text:'Auto-Update Custom UI',field:'custom-ui-auto-update',startValue:enabled},
                    on:{update:change}
                }));
            }
            return;
        }
        for (const child of children) insertOption(child,vm);
    }
    function mount() {
        const element = document.getElementById('app');
        application = element && findApp(element.__vue__ && (element.__vue__.$root || element.__vue__));
        if (!application) return false;
        if (!application.__toolboxCustomUISettings) {
            const render = application.$options.render;
            application.$options.render = function(...args) {
                const tree = render.apply(this,args);
                insertOption(tree,this);
                return tree;
            };
            application.__toolboxCustomUISettings = true;
            application.$forceUpdate();
        }
        return true;
    }
    ipcRenderer.on('custom-ui:state',(_,state) => {
        enabled = state.enabled === true;
        if (!application) return;
        const option = application.$refs.toolboxCustomUIAutoUpdate;
        if (option && option.val !== enabled) option.val = enabled;
    });
    if (!mount()) {
        const observer = new MutationObserver(() => { if (mount()) observer.disconnect(); });
        observer.observe(document.body,{childList:true,subtree:true});
    }
    ipcRenderer.send('custom-ui:get-state');
})();
