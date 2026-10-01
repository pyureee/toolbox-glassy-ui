'use strict';

// Each patch is scoped to the existing UI entry points. Unknown layouts abort
// during planning, before the installer writes to the Toolbox directory.
function replaceOnce(source, pattern, replacement, label) {
    const flags = pattern.flags.replace('g', '') + 'g';
    const matches = Array.from(source.matchAll(new RegExp(pattern.source, flags)));
    if (matches.length !== 1) throw new Error(`Unsupported Toolbox source: ${label} (found ${matches.length} matches).`);
    return source.replace(pattern, replacement);
}

function closingBrace(source, opening) {
    let depth = 0, quote = null, escaped = false, lineComment = false, blockComment = false;
    for (let i = opening; i < source.length; i++) {
        const c = source[i], next = source[i + 1];
        if (lineComment) { if (c === '\n') lineComment = false; continue; }
        if (blockComment) { if (c === '*' && next === '/') { blockComment = false; i++; } continue; }
        if (quote) {
            if (escaped) escaped = false;
            else if (c === '\\') escaped = true;
            else if (c === quote) quote = null;
            continue;
        }
        if (c === '/' && next === '/') { lineComment = true; i++; continue; }
        if (c === '/' && next === '*') { blockComment = true; i++; continue; }
        if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
        if (c === '{') depth++;
        if (c === '}' && --depth === 0) return i;
    }
    throw new Error('Unsupported Toolbox source: unclosed window options.');
}

function property(options, name, value, newline) {
    const pattern = new RegExp(`^([ \\t]*)${name}:[^\\r\\n]*`, 'm');
    if (pattern.test(options)) return replaceOnce(options, pattern, (_, indent) => `${indent}${name}: ${value},`, `window option ${name}`);
    const anchor = options.match(/^([ \t]*)\w+:/m);
    if (!anchor) throw new Error(`Unsupported Toolbox source: cannot insert ${name}.`);
    return options.slice(0, anchor.index) + `${anchor[1]}${name}: ${value},${newline}` + options.slice(anchor.index);
}

function patchWindow(source, receiver, values, captionHook) {
    const newline = source.includes('\r\n') ? '\r\n' : '\n';
    const escaped = receiver.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^([ \\t]*)${escaped}\\s*=\\s*new BrowserWindow\\(\\s*\\{`, 'm');
    const matches = Array.from(source.matchAll(new RegExp(pattern.source, 'gm')));
    if (matches.length !== 1) throw new Error(`Unsupported Toolbox source: ${receiver} window.`);
    const match = matches[0], opening = match.index + match[0].lastIndexOf('{');
    const closing = closingBrace(source, opening);
    let options = source.slice(opening + 1, closing);
    for (const [name, value] of Object.entries(values)) options = property(options, name, value, newline);
    const prefs = options.match(/\bwebPreferences:\s*\{/);
    if (!prefs) throw new Error('Unsupported Toolbox source: webPreferences missing.');
    const prefsOpening = prefs.index + prefs[0].lastIndexOf('{');
    const prefsClosing = closingBrace(options, prefsOpening);
    const prefsBody = property(options.slice(prefsOpening + 1, prefsClosing), 'contextIsolation', 'false', newline);
    options = options.slice(0, prefsOpening + 1) + prefsBody + options.slice(prefsClosing);
    let result = source.slice(0, opening + 1) + options + source.slice(closing);
    if (captionHook && !/hookWindowMessage\(0x00A3\b/.test(result)) {
        const newClosing = opening + 1 + options.length;
        const tail = result.slice(newClosing + 1).match(/^[ \t\r\n]*\)[ \t]*;?/);
        if (!tail) throw new Error('Unsupported Toolbox source: main window constructor terminator.');
        const insertAt = newClosing + 1 + tail[0].length;
        const indent = match[1];
        const hook = [
            '', '',
            `${indent}// toolbox-custom-ui: preserve caption double-click on transparent Electron 16.`,
            `${indent}if (process.platform === 'win32') {`,
            `${indent}    const mainWindow = this.window;`,
            `${indent}    mainWindow.hookWindowMessage(0x00A3, (wParam) => {`,
            `${indent}        if (wParam.readUInt32LE(0) !== 2) return; // HTCAPTION`,
            `${indent}        if (mainWindow.isMaximized()) mainWindow.unmaximize();`,
            `${indent}        else mainWindow.maximize();`,
            `${indent}    });`,
            `${indent}}`
        ].join(newline);
        result = result.slice(0, insertAt) + hook + result.slice(insertAt);
    }
    return result;
}

function patchMainWindow(source) {
    return patchWindow(source, 'this.window', {
        width: 'Math.max(config?.gui?.width || 1300, 1300)',
        height: 'Math.max(config?.gui?.height || 710, 710)',
        minWidth: '1300', minHeight: '710', frame: 'false', resizable: 'true',
        transparent: 'true', backgroundColor: "'#00000000'"
    }, true);
}

function patchSplashWindow(source) {
    return patchWindow(source, 'SplashScreen', {
        width: '550', height: '400', minWidth: '550', minHeight: '400',
        frame: 'false', resizable: 'false', transparent: 'true', backgroundColor: "'#00000000'"
    }, false);
}

function patchMainHtml(source) {
    let result = replaceOnce(source, /<body\b([^>]*)>/i, (_, attributes) => {
        const classMatch = attributes.match(/\bclass\s*=\s*(["'])(.*?)\1/i);
        if (classMatch) {
            const classes = classMatch[2].split(/\s+/).filter(Boolean);
            if (!classes.includes('toolbox-modern')) classes.push('toolbox-modern');
            attributes = attributes.replace(classMatch[0], `class="${classes.join(' ')}"`);
        } else attributes += ' class="toolbox-modern"';
        return `<body${attributes}>`;
    }, 'HTML body');
    const newline = result.includes('\r\n') ? '\r\n' : '\n';
    const styles = ['comfort.css', 'glass.css'].filter(name => !new RegExp(`href=["'][^"']*css/${name.replace('.', '\\.')}`).test(result));
    if (styles.length) result = replaceOnce(result, /<\/head>/i, styles.map(name => `\t<link rel="stylesheet" href="./css/${name}">`).join(newline) + newline + '</head>', 'HTML head');
    const scripts = ['comfort-layout.js', 'glass-theme.js'].filter(name => !new RegExp(`src=["'][^"']*js/${name.replace('.', '\\.')}`).test(result));
    if (scripts.length) result = replaceOnce(result, /<\/body>/i, scripts.map(name => `\t<script src="./js/${name}"></script>`).join(newline) + newline + '</body>', 'HTML body end');
    return result;
}

function patchUpdater(source) {
    // Reuse the complete preservation hook on installations already themed.
    if (source.includes('custom-ui-manifest.json') && /this\.preservedFiles\s*=/.test(source) && /this\.preservedFiles\.has\(/.test(source)) return source;
    if (source.includes('toolboxCustomUIPreservedFiles')) throw new Error('Incomplete existing UI updater patch.');
    const newline = source.includes('\r\n') ? '\r\n' : '\n';
    const helper = [
        '// toolbox-custom-ui: preserve local appearance files during self-update.',
        'function toolboxCustomUINormalize(relativePath) {',
        "    return relativePath.replace(/\\\\/g, '/').replace(/^\\.\\//, '').toLowerCase();",
        '}',
        'function toolboxCustomUIPreservedFiles() {',
        '    try {',
        "        const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'gui', 'custom-ui-manifest.json'), 'utf8'));",
        '        return new Set(Array.isArray(manifest.preserve) ? manifest.preserve.map(toolboxCustomUINormalize) : []);',
        '    } catch (_) { return new Set(); }',
        '}', '', ''
    ].join(newline);
    let result = replaceOnce(source, /^class Updater extends EventEmitter\s*\{/m, helper + 'class Updater extends EventEmitter {', 'updater class');
    result = replaceOnce(result, /^([ \t]*)this\.branch\s*=[^;\r\n]+;/m, (line, indent) => line + newline + `${indent}this.preservedFiles = toolboxCustomUIPreservedFiles();`, 'updater branch assignment');
    result = replaceOnce(result, /^([ \t]*)Object\.keys\(manifest\.files\)\.forEach\(relpath\s*=>\s*\{/m, (line, indent) => line + newline + `${indent}    if (this.preservedFiles.has(toolboxCustomUINormalize(relpath))) return;`, 'updater operation loop');
    return result;
}

module.exports = {patchMainWindow, patchSplashWindow, patchMainHtml, patchUpdater};
