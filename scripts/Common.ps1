$ErrorActionPreference = 'Stop'

function Get-ToolboxRoot([string]$ToolboxPath) {
    if ($env:OS -ne 'Windows_NT') { throw 'This theme installer supports Windows.' }
    if (-not (Test-Path -LiteralPath $ToolboxPath -PathType Container)) { throw "Toolbox directory not found: $ToolboxPath" }
    $root = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $ToolboxPath).Path).TrimEnd('\')
    $runtime = Join-Path $root 'node_modules\electron\dist\electron.exe'
    if (-not (Test-Path -LiteralPath $runtime -PathType Leaf)) { throw 'The Toolbox bundled Electron runtime is missing.' }
    $running = Get-CimInstance Win32_Process | Where-Object {
        $_.ExecutablePath -and $_.ExecutablePath.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase)
    }
    if ($running) { throw 'Close Toolbox completely before installing or restoring its UI.' }
    return $root
}

function Invoke-CustomUI([string]$ToolboxRoot, [string[]]$Arguments) {
    $runtime = Join-Path $ToolboxRoot 'node_modules\electron\dist\electron.exe'
    $entry = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\src\installer.cjs'))
    $previousMode = $env:ELECTRON_RUN_AS_NODE
    $outputId = 'toolbox-ui-' + [Guid]::NewGuid().ToString('N')
    $standardOutput = Join-Path ([IO.Path]::GetTempPath()) ($outputId + '.stdout')
    $standardError = Join-Path ([IO.Path]::GetTempPath()) ($outputId + '.stderr')
    try {
        $env:ELECTRON_RUN_AS_NODE = '1'
        $nativeArguments = @($entry) + $Arguments
        $quotedArguments = foreach ($argument in $nativeArguments) {
            $escaped = [Regex]::Replace($argument, '(\\*)"', '$1$1\"')
            $escaped = [Regex]::Replace($escaped, '(\\+)$', '$1$1')
            '"' + $escaped + '"'
        }
        # Electron is a GUI executable: explicitly wait before cleaning temporary input files.
        $operation = Start-Process -FilePath $runtime -ArgumentList ($quotedArguments -join ' ') -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput $standardOutput -RedirectStandardError $standardError
        if (Test-Path -LiteralPath $standardOutput) { Get-Content -LiteralPath $standardOutput -Encoding UTF8 }
        if ($operation.ExitCode -ne 0) {
            $details = if (Test-Path -LiteralPath $standardError) { Get-Content -LiteralPath $standardError -Encoding UTF8 -Raw } else { '' }
            throw ('The UI operation failed. ' + $details.Trim())
        }
    } finally {
        if ($null -eq $previousMode) { Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue }
        else { $env:ELECTRON_RUN_AS_NODE = $previousMode }
        foreach ($temporaryOutput in @($standardOutput, $standardError)) {
            if (Test-Path -LiteralPath $temporaryOutput) { Remove-Item -LiteralPath $temporaryOutput }
        }
    }
}
