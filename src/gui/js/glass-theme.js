/* Mirror the native theme choice for detached toolbar controls. */
(() => {
    'use strict';
    const root = document.getElementById('app');
    let appearance;
    function syncAppearance() {
        const application = document.querySelector('.v-application');
        if (!application || application === appearance)
            return;
        appearance = application;
        const sync = () => document.body.classList.toggle('tb-glass-light', application.classList.contains('theme--light'));
        new MutationObserver(sync).observe(application, { attributes: true, attributeFilter: ['class'] });
        sync();
    }
    const mounted = new MutationObserver(syncAppearance);
    mounted.observe(root, { childList: true, subtree: true });
    syncAppearance();
})();
