<#
.SYNOPSIS
Restore the most recent UI backup, or a specified backup ID.
#>
param(
    [string]$ToolboxPath = 'C:\Program Files (x86)\TeraToolbox Private',
    [string]$BackupId
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts\Common.ps1')
$toolboxRoot = Get-ToolboxRoot $ToolboxPath
$restoreArguments = @('restore', '--toolbox', $toolboxRoot)
if ($BackupId) { $restoreArguments += @('--backup', $BackupId) }
Invoke-CustomUI -ToolboxRoot $toolboxRoot -Arguments $restoreArguments
