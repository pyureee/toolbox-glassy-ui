(() => {
    'use strict';

    const state = {
        query: '',
        scheduled: false,
        version: null
    };

    function getToolboxVersion() {
        if (state.version)
            return state.version;

        try {
            const path = require('path');
            const { fileURLToPath } = require('url');
            const pagePath = fileURLToPath(document.baseURI);
            const packagePath = path.resolve(path.dirname(pagePath), '..', '..', 'package.json');
            state.version = require(packagePath).version;
        } catch (_) {
            state.version = 'unknown';
        }

        return state.version;
    }

    function updateTitleBarVersion() {
        const title = Array.from(document.querySelectorAll('span.ml-2.mr-2'))
            .find(element => element.textContent.trim() === 'TERA Toolbox') ||
            document.querySelector('span.ml-2.mr-2');
        if (!title)
            return;

        const label = `v${getToolboxVersion()}`;
        if (document.title !== label)
            document.title = label;
        if (title.textContent.trim() !== label)
            title.textContent = label;
    }

    const icon = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9.5 4a5.5 5.5 0 1 0 3.47 9.77l4.63 4.63 1.4-1.4-4.63-4.63A5.5 5.5 0 0 0 9.5 4Zm0 2a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z"/>
        </svg>`;

    function makeBrand() {
        const brand = document.createElement('div');
        brand.className = 'tb-brand';
        brand.innerHTML = `
            <img src="./assets/tb-static.png" alt="TERA Toolbox">
            <div class="tb-brand-copy">
                <strong>TERA</strong>
                <span>Toolbox</span>
            </div>`;
        return brand;
    }

    function makeHeading() {
        const heading = document.createElement('div');
        heading.className = 'tb-workspace-heading';
        heading.innerHTML = '<strong>Log</strong>';
        return heading;
    }

    function updateHeading() {
        const active = document.querySelector('.v-tabs-bar .v-tab--active');
        const title = document.querySelector('.tb-workspace-heading strong');
        if (active && title)
            title.textContent = active.textContent.trim();

        document.body.classList.toggle(
            'tb-my-mods-active',
            Boolean(active && active.classList.contains('tb-nav-tab-1'))
        );
    }

    function syncToolboxAction(content) {
        const original = content.querySelector('.v-btn');
        if (!original)
            return;

        let proxy = document.querySelector('body > .tb-toolbox-action');
        if (!proxy) {
            proxy = document.createElement('button');
            proxy.type = 'button';
            proxy.className = 'tb-toolbox-action';
            proxy.addEventListener('click', () => {
                const current = document.querySelector('.v-tabs-bar__content > .v-btn');
                if (current && !current.disabled)
                    current.click();
            });
            document.body.appendChild(proxy);
        }

        const visualClasses = Array.from(original.classList)
            .filter(name => name !== 'tb-toolbox-action');
        visualClasses.push('tb-toolbox-action');
        const className = visualClasses.join(' ');
        if (proxy.className !== className)
            proxy.className = className;
        if (proxy.innerHTML !== original.innerHTML)
            proxy.innerHTML = original.innerHTML;

        if (proxy.disabled !== original.disabled)
            proxy.disabled = original.disabled;
        const label = original.textContent.trim();
        if (proxy.getAttribute('aria-label') !== label)
            proxy.setAttribute('aria-label', label);
        if (original.getAttribute('aria-hidden') !== 'true')
            original.setAttribute('aria-hidden', 'true');
        if (original.tabIndex !== -1)
            original.tabIndex = -1;

        const brandImage = content.querySelector('.tb-brand img');
        if (brandImage) {
            const animated = original.classList.contains('border-bott-orange') ||
                original.classList.contains('border-bott-red');
            const source = animated ? './assets/tb.gif' : './assets/tb-static.png';
            if (brandImage.getAttribute('src') !== source)
                brandImage.setAttribute('src', source);
        }
    }

    function getInstalledPanels() {
        const items = document.querySelectorAll('.v-window__container > .v-window-item');
        if (items.length < 2)
            return [];

        return Array.from(items[1].querySelectorAll('.v-expansion-panel'));
    }

    function applyInstalledModFilter() {
        const words = state.query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
        let visible = 0;
        const panels = getInstalledPanels();

        panels.forEach(panel => {
            const haystack = panel.textContent.toLocaleLowerCase();
            const matches = words.length === 0 || words.every(word => haystack.includes(word));
            panel.classList.toggle('tb-search-hidden', !matches);
            if (matches)
                visible++;
        });

        const count = document.querySelector('.tb-mod-search-count');
        if (count)
            count.textContent = state.query ? `${visible} of ${panels.length}` : `${panels.length} installed`;
    }

    function makeInstalledSearch() {
        const search = document.createElement('label');
        search.className = 'tb-mod-search';
        search.innerHTML = `
            <span class="tb-mod-search-icon">${icon}</span>
            <input type="search" autocomplete="off" spellcheck="false" aria-label="Search installed mods" placeholder="Search installed mods…">
            <span class="tb-mod-search-count" aria-live="polite"></span>`;

        const input = search.querySelector('input');
        input.value = state.query;
        input.addEventListener('input', event => {
            state.query = event.target.value.trim();
            applyInstalledModFilter();
        });
        input.addEventListener('keydown', event => {
            if (event.key === 'Escape' && input.value) {
                input.value = '';
                state.query = '';
                applyInstalledModFilter();
                event.stopPropagation();
            }
        });
        return search;
    }

    function ensureShell() {
        const content = document.querySelector('.v-tabs-bar__content');
        if (!content)
            return;

        if (!content.querySelector('.tb-brand'))
            content.insertBefore(makeBrand(), content.firstChild);

        const wrap = document.querySelector('.v-application--wrap');
        if (wrap && !wrap.querySelector('.tb-workspace-heading'))
            wrap.appendChild(makeHeading());

        syncToolboxAction(content);
        updateTitleBarVersion();

        const items = document.querySelectorAll('.v-window__container > .v-window-item');
        if (items.length >= 2) {
            const modsContainer = items[1].querySelector('.container');
            if (modsContainer && !modsContainer.querySelector('.tb-mod-search'))
                modsContainer.insertBefore(makeInstalledSearch(), modsContainer.firstChild);
        }

        document.querySelectorAll('.v-tabs-bar .v-tab').forEach((tab, index) => {
            tab.classList.add(`tb-nav-tab-${index}`);
            if (!tab.dataset.comfortBound) {
                tab.dataset.comfortBound = 'true';
                tab.addEventListener('click', () => requestAnimationFrame(updateHeading));
            }
        });

        updateHeading();
        applyInstalledModFilter();
        document.body.classList.add('tb-shell-ready');
    }

    function scheduleShell() {
        if (state.scheduled)
            return;
        state.scheduled = true;
        requestAnimationFrame(() => {
            state.scheduled = false;
            ensureShell();
        });
    }

    const observer = new MutationObserver(scheduleShell);
    observer.observe(document.getElementById('app'), {
        attributes: true,
        characterData: true,
        childList: true,
        subtree: true
    });
    scheduleShell();
})();
