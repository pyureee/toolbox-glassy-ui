# Validation

Validated on Windows with the Toolbox-bundled Electron 16.0.2 / Node 16.9.1 runtime.

| Check | Result |
| --- | --- |
| Project installer checks | 15 passed |
| Separate GitHub updater and appearance persistence checks | 13 passed |
| EXE installer payload and folder-selection UI | Verified |
| EXE install on clean and already-themed copies | Passed |
| EXE restore after installations and automatic updates | Both copies returned to every original file hash |
| Full custom UI update through GitHub download fixtures | New version installed with verified backup; config and mods unchanged |
| PowerShell install on a fresh-layout test copy | Passed |
| PowerShell install on an already themed test copy | Passed |
| Reinstall of the same version | No changes or duplicate hooks |
| PowerShell restore of both test copies | Every original file hash restored; new theme files removed |
| Native main renderer | 43 checks and 18 mouse hit tests passed |
| Version 1.1.0 main renderer and settings checkbox | 101 checks and 20 mouse hit tests passed |
| Version 1.1.1 native checkbox and main renderer | 104 checks and 20 mouse hit tests passed |
| Version 1.2.0 appearance controls and main renderer | 128 checks and 20 mouse hit tests passed |
| Saved color and transparency on the first Settings frame | 7 checks passed with a deliberately delayed IPC reply |
| First-frame checkbox with an enabled saved preference | 6 checks passed, including a deliberately delayed settings reply |
| Version 1.0.1 rounded window corners | 48 pixel checks passed across dark/light UI states and 1300x710, 1366x768, and 1600x900 windows |
| Actual self-updater operation planning | Protected UI paths skipped; ordinary core update retained |
| Config and mod sentinel files | Unchanged |

The renderer check exercised Start/Stop states through isolated fixture IPC, logs and search, mod controls, catalogue installation, settings and light/dark switching, popup dialogs, and native window-action forwarding. Native window resize and caption maximize/restore were also verified while developing the theme. The splash retained its animated logo, caption/detail IPC, and close-after-handoff lifecycle.

The corner fix clips the full painted document to the existing 14 px border radius. Native Electron screenshots confirmed zero alpha outside all four curves while the adjacent surface remained visible. Captures waited for popup fade transitions to finish. The existing 43 renderer checks and 18 mouse hit tests also passed with this fix.

The custom updater was tested with pinned-commit download fixtures, corrupt content, network failures, concurrent requests, cancellation while disabling the checkbox, saved preferences, IPC sender ownership, and cleanup when the window closes. A complete newer-version fixture exercised the same downloaded installer and backup transaction used by automatic updates. The EXE exercised the embedded package through Windows PowerShell on separate Toolbox copies.

Version 1.1.1 reuses Toolbox's native BoolOption render component. Pixel geometry checks confirmed matching icon position, icon dimensions, label position, and font size. The checkbox appeared with the other settings on their first visible frame, retained its saved enabled state before an intentionally delayed IPC reply, and rendered without status/version text. Enabling waits until the next launch; one startup check runs without any periodic timer.

Version 1.2.0 previews the theme tint and surface transparency without fading text or icons. Renderer checks exercised color-picker events, HEX/RGB input, invalid HEX rejection, 0%/100% endpoints, native window pixel alpha, reset, and the shared saved splash appearance. A separate cold launch loaded the saved color and transparency on the first Settings frame before a two-second settings IPC delay. Backend checks verified appearance validation, persistence, checkbox independence, IPC sender ownership, and cleanup. Hidden-window screenshot captures drain the compositor before pixel checks; fresh-launch persistence uses a separate process.

The integration checks used separate local test copies. They did not run a real game proxy or install an actual network update. The Windows scripts were exercised through Windows PowerShell, including the bundled-runtime launch and generated idle logo.

This validates the tested source layouts and runtime. Other Toolbox forks may use different UI entry points; patch planning stops when its required anchors are missing.
