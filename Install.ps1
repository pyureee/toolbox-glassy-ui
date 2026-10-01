<#
.SYNOPSIS
Install the smoked-glass UI into an existing Windows TERA Toolbox installation.
#>
param([string]$ToolboxPath = 'C:\Program Files (x86)\TeraToolbox Private')
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts\Common.ps1')
$toolboxRoot = Get-ToolboxRoot $ToolboxPath
$gifPath = Join-Path $toolboxRoot 'bin\gui\assets\tb.gif'
if (-not (Test-Path -LiteralPath $gifPath -PathType Leaf)) { throw 'The installed Toolbox animated logo is missing.' }
$temporaryLogo = Join-Path ([IO.Path]::GetTempPath()) ('toolbox-ui-' + [Guid]::NewGuid().ToString('N') + '.png')
try {
    Add-Type -AssemblyName System.Drawing
    $animatedImage = [Drawing.Image]::FromFile($gifPath)
    try {
        [void]$animatedImage.SelectActiveFrame([Drawing.Imaging.FrameDimension]::Time, 0)
        $stillImage = New-Object Drawing.Bitmap($animatedImage)
        try { $stillImage.Save($temporaryLogo, [Drawing.Imaging.ImageFormat]::Png) }
        finally { $stillImage.Dispose() }
    } finally { $animatedImage.Dispose() }
    Invoke-CustomUI -ToolboxRoot $toolboxRoot -Arguments @('install', '--toolbox', $toolboxRoot, '--static-logo', $temporaryLogo)
} finally {
    if (Test-Path -LiteralPath $temporaryLogo) { Remove-Item -LiteralPath $temporaryLogo }
}
