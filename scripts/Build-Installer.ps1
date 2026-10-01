param([string]$OutputPath, [string]$SourceRef)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $OutputPath) { $OutputPath = Join-Path $projectRoot 'downloads\ToolboxCustomUI-Setup.exe' }
$OutputPath = [IO.Path]::GetFullPath($OutputPath)
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
if (-not (Test-Path -LiteralPath $compiler)) { throw 'The Windows .NET Framework C# compiler is required to build the installer.' }
$buildRoot = Join-Path $projectRoot 'build'
New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null
New-Item -ItemType Directory -Path (Split-Path -Parent $OutputPath) -Force | Out-Null
$payload = Join-Path $buildRoot ('package-' + [Guid]::NewGuid().ToString('N') + '.zip')
Add-Type -AssemblyName System.IO.Compression.FileSystem
try {
    if ($SourceRef) {
        & git -C $projectRoot archive --format=zip "--output=$payload" $SourceRef Install.ps1 Restore.ps1 LICENSE NOTICE.md scripts/Common.ps1 src
        if ($LASTEXITCODE -ne 0) { throw 'Could not package the committed source.' }
    } else {
        $archive = [IO.Compression.ZipFile]::Open($payload,[IO.Compression.ZipArchiveMode]::Create)
        try {
        $files = @('Install.ps1','Restore.ps1','LICENSE','NOTICE.md','scripts\Common.ps1') | ForEach-Object { Get-Item -LiteralPath (Join-Path $projectRoot $_) }
        $files += Get-ChildItem -LiteralPath (Join-Path $projectRoot 'src') -File -Recurse
        foreach ($file in $files) {
            $relative = $file.FullName.Substring($projectRoot.Length+1).Replace('\','/')
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$file.FullName,$relative,[IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
        } finally { $archive.Dispose() }
    }
    & $compiler /nologo /target:winexe /platform:anycpu /optimize+ "/out:$OutputPath" "/win32manifest:$(Join-Path $projectRoot 'installer\app.manifest')" "/resource:$payload,package.zip" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll (Join-Path $projectRoot 'installer\Setup.cs')
    if ($LASTEXITCODE -ne 0) { throw 'Installer compilation failed.' }
    $digest = (Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText($OutputPath+'.sha256',$digest+'  '+[IO.Path]::GetFileName($OutputPath)+"`n",(New-Object Text.UTF8Encoding($false)))
    Write-Output "Built: $OutputPath"
    Write-Output "SHA256: $digest"
} finally { if (Test-Path -LiteralPath $payload) { Remove-Item -LiteralPath $payload } }
