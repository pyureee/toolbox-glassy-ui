# Toolbox Custom UI

A smoked-glass theme for **TERA Toolbox on Windows**, with a translucent gray base, icy blue accents, and matching startup splash.

![Toolbox glass interface](docs/images/main.png)

The theme includes a 172 px sidebar, an 80 px animated sidebar logo, and a Log button aligned with the main log panel. Native Start/Stop controls, logs, mods, settings, and update messages keep their existing handlers.

![Glass startup splash](docs/images/splash.png)

## Install into your Toolbox

1. **Close TERA Toolbox completely**, including its tray instance.
2. [Download this repository as a ZIP](https://github.com/pyureee/toolbox-custom-ui/archive/refs/heads/main.zip), then extract it somewhere outside your Toolbox folder.
3. Open **Windows PowerShell as administrator** if Toolbox is installed under `Program Files`.
4. In PowerShell, go to the extracted `toolbox-custom-ui-main` folder. Replace the example folder below with the location where you extracted it:

   ```powershell
   Set-Location "C:\Downloads\toolbox-custom-ui-main"
   ```

5. Run the installer with your Toolbox installation path:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Install.ps1 -ToolboxPath "C:\Program Files (x86)\TeraToolbox Private"
   ```

   For a different location, replace that path, for example:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Install.ps1 -ToolboxPath "C:\Games\TeraToolbox"
   ```

6. Wait for **“Glass UI installed”**, then launch Toolbox normally.

The installer uses Toolbox's bundled Electron/Node runtime. You do **not** need a separate Node.js, Python, npm install, or package download. The execution-policy override applies only to that PowerShell invocation.

Before writing anything, the installer validates the existing UI entry points and builds all patches. It then creates a verified backup of affected files in:

```text
<your Toolbox folder>\custom-ui-backups\<backup-id>\
```

Keep the backup ID printed by the installer. Your mods, game files, and `config.json` are left untouched. An unsupported source layout stops installation during validation. Re-running the same version is safe and does not duplicate UI hooks.

## Restore the previous UI

Close Toolbox, open PowerShell in this project's folder, and run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Restore.ps1 -ToolboxPath "C:\Program Files (x86)\TeraToolbox Private"
```

This restores the most recent installed UI backup. To select an earlier backup, add the ID printed when that version was installed:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Restore.ps1 -ToolboxPath "C:\Program Files (x86)\TeraToolbox Private" -BackupId "YOUR-BACKUP-ID"
```

Choose the first installation's backup to return to the UI you had before this theme. Restore verifies original backup hashes and stops if a themed file was edited after installation. Newly created theme files are removed; pre-existing files are restored. Reopen Toolbox afterward.

## Toolbox auto-update protection

The installer patches Toolbox's **self-updater** to read `bin/gui/custom-ui-manifest.json`. Files on its `preserve` list are skipped when the updater builds its operations.

Protected files include:

- Theme CSS, layout/theme JavaScript, idle logo, and the log font.
- `bin/gui/main.html` and the preservation manifest.
- `bin/loader-gui.js` and `bin/index-gui.js`, which contain the transparent main/splash window options.
- `bin/update-self.js`, so the preservation hook itself survives self-updates.

Other Toolbox files continue updating, and the separate mod updater keeps its normal behavior. These protected launch/update files also skip upstream changes. To refresh them, restore the original UI, run Toolbox's update, close Toolbox, and install the theme again.

The theme does not download its own updates automatically. Download a newer project ZIP and run its installer when you want a theme update.

## Compatibility and appearance

- Tested with **TERA Toolbox Private 2.0.0**, Electron **16.0.2**, Chromium **96**, and Node **16.9.1** on Windows.
- The main window has a minimum size of **1300 × 710**. The startup splash is **550 × 400**.
- Native window transparency lets the desktop show through the gray tint. It does not add Windows desktop blur.
- The existing dark/light switch is retained. The startup splash uses the smoky dark base.
- Window resizing and caption double-click maximize/restore are retained through a Windows-specific Electron hook.
- The splash appears during Toolbox's normal self-update startup. Toolbox's option to skip self-update still skips that splash.
- Forks with a different source layout may need a patcher update. Installation stops before modifying files when required patch anchors are missing.

## Source layout

```text
Install.ps1 / Restore.ps1  Windows entry points
scripts/Common.ps1        Bundled-runtime invocation and running-process check
src/installer.cjs         Planning, backups, transactional install, and restore
src/patches.cjs           Native window, HTML, and self-updater source patches
src/gui/css/              Main glass theme, layout foundation, startup splash
src/gui/js/               Layout helper and native theme synchronization
src/gui/fonts/            Monaspace Neon and its font license
src/theme.json            Theme version and updater preservation paths
```

Run `npm test` or `node tests/installer.cjs` if you have Node.js available for development. Installation itself uses the runtime already bundled with Toolbox.

See [NOTICE.md](NOTICE.md) for font and asset attribution. Theme source is licensed under MIT.
