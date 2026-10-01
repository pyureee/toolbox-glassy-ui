# Validation

Validated on Windows with the Toolbox-bundled Electron 16.0.2 / Node 16.9.1 runtime.

| Check | Result |
| --- | --- |
| Project installer checks | 13 passed |
| PowerShell install on a fresh-layout test copy | Passed |
| PowerShell install on an already themed test copy | Passed |
| Reinstall of the same version | No changes or duplicate hooks |
| PowerShell restore of both test copies | Every original file hash restored; new theme files removed |
| Native main renderer | 43 checks and 18 mouse hit tests passed |
| Version 1.0.1 rounded window corners | 48 pixel checks passed across dark/light UI states and 1300x710, 1366x768, and 1600x900 windows |
| Actual self-updater operation planning | Protected UI paths skipped; ordinary core update retained |
| Config and mod sentinel files | Unchanged |

The renderer check exercised Start/Stop states through isolated fixture IPC, logs and search, mod controls, catalogue installation, settings and light/dark switching, popup dialogs, and native window-action forwarding. Native window resize and caption maximize/restore were also verified while developing the theme. The splash retained its animated logo, caption/detail IPC, and close-after-handoff lifecycle.

The corner fix clips the full painted document to the existing 14 px border radius. Native Electron screenshots confirmed zero alpha outside all four curves while the adjacent surface remained visible. Captures waited for popup fade transitions to finish. The existing 43 renderer checks and 18 mouse hit tests also passed with this fix.

The integration checks used separate local test copies. They did not run a real game proxy or install an actual network update. The Windows scripts were exercised through Windows PowerShell, including the bundled-runtime launch and generated idle logo.

This validates the tested source layouts and runtime. Other Toolbox forks may use different UI entry points; patch planning stops when its required anchors are missing.
