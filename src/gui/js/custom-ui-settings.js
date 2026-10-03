/* Render custom settings alongside Toolbox's native controls. */
(() => {
    'use strict';
    const {ipcRenderer}=require('electron');
    const fs=require('fs'),path=require('path'),{fileURLToPath}=require('url');
    let enabled=false,application;
    try {const root=path.resolve(path.dirname(fileURLToPath(location.href)),'../..');enabled=JSON.parse(fs.readFileSync(path.join(root,'custom-ui-settings.json'),'utf8')).autoUpdate===true;} catch (_) {}
    function findApp(vm) {
        if(!vm)return null;
        if(vm.$options && vm.$options.name==='App')return vm;
        for(const child of vm.$children || []){const found=findApp(child);if(found)return found;}
        return null;
    }
    function change({val}){enabled=Boolean(val);ipcRenderer.send('custom-ui:set-auto-update',enabled);}
    const Appearance={
        name:'ToolboxCustomAppearance',
        data(){return {appearance:window.toolboxAppearance.get(),hexDraft:'',error:''};},
        computed:{
            color(){return this.appearance.themeColor || (document.body.classList.contains('tb-glass-light')?'#C5CBD2':'#2C3037');},
            rgb(){return [1,3,5].map(i=>parseInt(this.color.slice(i,i+2),16));}
        },
        mounted(){this.hexDraft=this.color;this.sync=event=>{this.appearance=event.detail;this.hexDraft=this.color;};window.addEventListener('toolbox:appearance-applied',this.sync);},
        beforeDestroy(){window.removeEventListener('toolbox:appearance-applied',this.sync);},
        methods:{
            preview(value){this.error='';this.appearance={...this.appearance,...value};window.toolboxAppearance.apply(this.appearance);},
            save(){ipcRenderer.send('custom-ui:set-appearance',{...this.appearance});},
            hex(value){const color='#'+value.trim().replace(/^#/,'');if(!/^#[a-f0-9]{6}$/i.test(color)){this.error='Enter a six-digit HEX color.';this.hexDraft=this.color;return;}this.preview({themeColor:color.toUpperCase()});this.save();},
            channel(index,value){if(!/^\d{1,3}$/.test(value)||Number(value)>255){this.error='RGB values must be 0 to 255.';this.$forceUpdate();return;}const rgb=this.rgb.slice();rgb[index]=Number(value);this.preview({themeColor:'#'+rgb.map(c=>c.toString(16).padStart(2,'0')).join('').toUpperCase()});this.save();},
            reset(){this.preview({themeColor:null,transparency:36});this.save();}
        },
        render(h){
            const id='tb-appearance';
            const field=(label,input)=>h('label',{class:'tb-appearance-field'},[h('span',label),input]);
            return h('section',{class:'tb-appearance',attrs:{'aria-labelledby':id+'-title'}},[
                h('div',{class:'tb-appearance-heading'},[h('h3',{attrs:{id:id+'-title'}},'Appearance'),h('button',{class:'tb-appearance-reset',attrs:{type:'button',id:id+'-reset'},on:{click:this.reset}},'Reset to default')]),
                h('div',{class:'tb-appearance-colors'},[
                    field('Theme color',h('input',{class:'tb-color-swatch',attrs:{type:'color',id:id+'-color','aria-label':'Theme color'},domProps:{value:this.color},on:{input:event=>this.preview({themeColor:event.target.value.toUpperCase()}),change:this.save}})),
                    field('HEX',h('input',{attrs:{type:'text',id:id+'-hex',maxlength:7,spellcheck:'false','aria-label':'HEX color'},domProps:{value:this.hexDraft},on:{input:event=>{this.hexDraft=event.target.value;},change:event=>this.hex(event.target.value),keydown:event=>{if(event.key==='Enter'){this.hex(event.target.value);event.target.blur();}}}})),
                    ...['R','G','B'].map((label,index)=>field(label,h('input',{attrs:{type:'number',id:id+'-'+label.toLowerCase(),min:0,max:255,step:1,'aria-label':label+' color channel'},domProps:{value:this.rgb[index]},on:{change:event=>{this.channel(index,event.target.value);if(this.error)event.target.value=this.rgb[index];}}})))
                ]),
                h('div',{class:'tb-transparency-heading'},[h('label',{attrs:{for:id+'-transparency'}},'Transparency'),h('output',{attrs:{for:id+'-transparency'}},this.appearance.transparency+'%')]),
                h('input',{class:'tb-transparency',attrs:{type:'range',id:id+'-transparency',min:0,max:100,step:1,'aria-label':'Glass transparency','aria-valuetext':this.appearance.transparency+'% transparent'},domProps:{value:this.appearance.transparency},style:{'--tb-range-fill':this.appearance.transparency+'%'},on:{input:event=>this.preview({transparency:Number(event.target.value)}),change:this.save}}),
                h('div',{class:'tb-transparency-labels'},[h('span','Solid'),h('span','Transparent')]),
                this.error?h('div',{class:'tb-appearance-error',attrs:{role:'alert'}},this.error):null
            ]);
        }
    };
    function insertOption(node,vm) {
        if(!node || typeof node!=='object')return;
        const children=node.componentOptions?node.componentOptions.children:node.children;
        if(!children)return;
        let index=children.findIndex(child=>child && child.componentOptions && child.componentOptions.propsData && child.componentOptions.propsData.field==='autostart');
        if(index!==-1){
            const themeIndex=children.findIndex(child=>child && child.componentOptions && child.componentOptions.propsData && child.componentOptions.propsData.field==='theme');
            if(themeIndex!==-1){children.splice(themeIndex,1);if(themeIndex<index)index--;}
            if(!children.some(child=>child && child.key==='toolbox-custom-ui-autoupdate'))children.splice(index,0,
                vm.$createElement(Appearance,{key:'toolbox-custom-appearance',ref:'toolboxCustomAppearance'}),
                vm.$createElement('BoolOption',{key:'toolbox-custom-ui-autoupdate',ref:'toolboxCustomUIAutoUpdate',staticClass:'tb-custom-ui-checkbox',attrs:{id:'tb-custom-ui-autoupdate',text:'Auto-Update Custom UI',field:'custom-ui-auto-update',startValue:enabled},on:{update:change}}));
            return;
        }
        for(const child of children)insertOption(child,vm);
    }
    function mount() {
        const element=document.getElementById('app');
        application=element && findApp(element.__vue__ && (element.__vue__.$root || element.__vue__));
        if(!application)return false;
        if(!application.__toolboxCustomUISettings){
            const render=application.$options.render;
            application.$options.render=function(...args){const tree=render.apply(this,args);insertOption(tree,this);return tree;};
            application.__toolboxCustomUISettings=true;application.$forceUpdate();
        }
        return true;
    }
    ipcRenderer.on('custom-ui:state',(_,state)=>{
        enabled=state.enabled===true;
        // Appearance messages are sent after a completed edit, so dragging stays local.
        if(state.appearance)window.toolboxAppearance.apply(state.appearance);
        if(!application)return;
        const editor=application.$refs.toolboxCustomAppearance;
        if(editor && state.message && state.message.startsWith('Could not save custom UI appearance:'))editor.error='Could not save appearance. '+state.message.split(':').slice(1).join(':').trim();
        const option=application.$refs.toolboxCustomUIAutoUpdate;if(option && option.val!==enabled)option.val=enabled;
    });
    if(!mount()){const observer=new MutationObserver(()=>{if(mount())observer.disconnect();});observer.observe(document.body,{childList:true,subtree:true});}
    ipcRenderer.send('custom-ui:get-state');
})();
