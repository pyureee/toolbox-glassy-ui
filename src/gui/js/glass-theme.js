/* Share the saved glass tint between the main window and startup splash. */
(() => {
    'use strict';
    const fs = require('fs'), path = require('path');
    const {fileURLToPath} = require('url');
    let appearance = {themeColor:null,transparency:36};
    try {
        const root = path.resolve(path.dirname(fileURLToPath(location.href)),'../..');
        const saved = JSON.parse(fs.readFileSync(path.join(root,'custom-ui-settings.json'),'utf8')).appearance;
        if(saved && (saved.themeColor===null || /^#[a-f0-9]{6}$/i.test(saved.themeColor)) && Number.isInteger(saved.transparency) && saved.transparency>=0 && saved.transparency<=100) appearance=saved;
    } catch (_) {}
    const variables = ['--glass-base','--glass-fill','--glass-well','--tb-text','--tb-text-muted','--tb-accent','--tb-accent-soft','--tb-bg','--tb-surface-raised','--tb-surface-hover','--tb-border','--tb-border-soft','--glass-edge','--glass-top-edge'];
    function apply(value) {
        appearance={...value};
        const light=document.body.classList.contains('tb-glass-light');
        const hex=appearance.themeColor || (light?'#C5CBD2':'#2C3037');
        const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
        const alpha=1-appearance.transparency/100;
        const rgba=(color,a)=>'rgba('+color.join(',')+','+a.toFixed(3)+')';
        variables.forEach(name=>document.body.style.removeProperty(name));
        if(appearance.themeColor!==null || appearance.transparency!==36) {
            const bright=rgb.reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0)>155;
            const ink=bright?'#233243':'#F4F6F9',muted=bright?'#405369':'#CED5DF',accent=bright?'#236A9B':'#80BDF0';
            const scale=alpha/.64;
            const values={
                '--glass-base':rgba(rgb,alpha),'--tb-bg':hex,
                '--tb-surface-raised':bright?'#E5EBF2':'#38404A',
                '--tb-surface-hover':bright?'#D3DFE9':'#45515E',
                '--glass-fill':'linear-gradient(135deg,'+rgba([255,255,255],Math.min(.36,(bright?.36:.14)*scale))+','+rgba(rgb,.03*scale)+'),'+rgba(rgb,.22*scale),
                '--glass-well':'linear-gradient(135deg,'+rgba(rgb,.24*scale)+','+rgba(rgb.map(c=>Math.max(0,c-14)),.38*scale)+')',
                '--tb-text':ink,'--tb-text-muted':muted,'--tb-accent':accent,
                '--tb-accent-soft':bright?'rgba(35,106,155,.13)':'rgba(128,189,240,.15)',
                '--tb-border':bright?'rgba(35,50,67,.24)':'rgba(238,245,255,.24)',
                '--tb-border-soft':bright?'rgba(35,50,67,.16)':'rgba(238,245,255,.14)',
                '--glass-edge':bright?'rgba(255,255,255,.50)':'rgba(255,255,255,.24)',
                '--glass-top-edge':bright?'rgba(255,255,255,.80)':'rgba(255,255,255,.36)'
            };
            Object.entries(values).forEach(([name,val])=>document.body.style.setProperty(name,val));
        }
        document.body.style.setProperty('--splash-base',rgba(rgb,alpha));
        ['--splash-text','--splash-muted','--splash-accent'].forEach(name=>document.body.style.removeProperty(name));
        if(appearance.themeColor) {
            const bright=rgb.reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0)>155;
            document.body.style.setProperty('--splash-text',bright?'#233243':'#F4F6F9');
            document.body.style.setProperty('--splash-muted',bright?'#405369':'#CED5DF');
            document.body.style.setProperty('--splash-accent',bright?'#236A9B':'#80BDF0');
        }
        window.dispatchEvent(new CustomEvent('toolbox:appearance-applied',{detail:{...appearance}}));
    }
    window.toolboxAppearance={get:()=>({...appearance}),apply};
    apply(appearance);
    const root=document.getElementById('app');
    let native;
    function sync() {
        const application=document.querySelector('.v-application');
        if(!application || native===application)return;
        native=application;
        const update=()=>{document.body.classList.toggle('tb-glass-light',application.classList.contains('theme--light'));apply(appearance);};
        new MutationObserver(update).observe(application,{attributes:true,attributeFilter:['class']});update();
    }
    if(root){new MutationObserver(sync).observe(root,{childList:true,subtree:true});sync();}
})();
