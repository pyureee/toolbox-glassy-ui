/* Independent opt-in theme updates; native Toolbox settings keep their own IPC. */
(() => {
    'use strict';
    const {ipcRenderer} = require('electron');
    let state = {enabled:false,version:'',message:'Loading custom UI settings...'};
    let pending = false;
    function paint() {
        const panel = document.querySelector('.v-window__container > .v-window-item:nth-child(4) > .container');
        if (!panel) return;
        let row = panel.querySelector('.tb-custom-ui-settings');
        if (!row) {
            row = document.createElement('section');
            row.className = 'tb-custom-ui-settings';
            const label = document.createElement('label');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = 'tb-custom-ui-autoupdate';
            label.htmlFor = checkbox.id;
            const title = document.createElement('span');
            title.textContent = 'Auto-Update Custom UI';
            label.append(checkbox,title);
            const status = document.createElement('p');
            status.className = 'tb-custom-ui-status';
            status.setAttribute('aria-live','polite');
            row.append(label,status);
            const scroller = panel.querySelector('.scroller') || panel;
            const themeSelect = scroller.querySelectorAll(':scope > .v-select')[1];
            if (themeSelect) themeSelect.insertAdjacentElement('afterend',row);
            else scroller.appendChild(row);
            checkbox.addEventListener('change',() => {
                pending = true;
                checkbox.disabled = true;
                ipcRenderer.send('custom-ui:set-auto-update',checkbox.checked);
            });
        }
        const checkbox = row.querySelector('input');
        checkbox.checked = Boolean(state.enabled);
        checkbox.disabled = pending;
        const text = (state.version ? 'Version '+state.version+' · ' : '') + state.message;
        const status = row.querySelector('.tb-custom-ui-status');
        if (status.textContent !== text) status.textContent = text;
    }
    ipcRenderer.on('custom-ui:state',(_,next) => {
        state = next;
        pending = false;
        paint();
    });
    new MutationObserver(paint).observe(document.getElementById('app'),{childList:true,subtree:true});
    paint();
    ipcRenderer.send('custom-ui:get-state');
})();
