<# Run after committing the release source, then commit the generated manifest and EXE. #>
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Push-Location $projectRoot
try {
    $commit = (git rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or $commit -notmatch '^[a-f0-9]{40}$') { throw 'A committed Git source version is required.' }
    $dirty = git status --porcelain -- src Install.ps1 Restore.ps1 scripts/Common.ps1 installer scripts/Build-Installer.ps1
    if ($dirty) { throw 'Commit the release source before publishing an update manifest.' }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    New-Item -ItemType Directory -Path 'build' -Force | Out-Null
    $sourceArchive = Join-Path $projectRoot ('build\release-source-'+[Guid]::NewGuid().ToString('N')+'.zip')
    git archive --format=zip "--output=$sourceArchive" $commit src
    if ($LASTEXITCODE -ne 0) { throw 'Could not read the committed release source.' }
    $records = @()
    $archive = [IO.Compression.ZipFile]::OpenRead($sourceArchive)
    try {
        foreach ($entry in ($archive.Entries | Where-Object { $_.Name } | Sort-Object FullName)) {
            $stream=$entry.Open(); $buffer=New-Object IO.MemoryStream
            try { $stream.CopyTo($buffer); $data=$buffer.ToArray() } finally { $stream.Dispose();$buffer.Dispose() }
            $hasher=[Security.Cryptography.SHA256]::Create()
            try { $digest=([BitConverter]::ToString($hasher.ComputeHash($data))).Replace('-','').ToLowerInvariant() } finally { $hasher.Dispose() }
            $records += [ordered]@{path=$entry.FullName;sha256=$digest;size=$data.Length}
            if ($entry.FullName -eq 'src/theme.json') { $theme=[Text.Encoding]::UTF8.GetString($data) | ConvertFrom-Json }
        }
    } finally { $archive.Dispose(); Remove-Item -LiteralPath $sourceArchive }
    New-Item -ItemType Directory -Path 'updates' -Force | Out-Null
    $manifest = [ordered]@{schema=1;version=$theme.version;commit=$commit;files=$records}
    [IO.File]::WriteAllText((Join-Path $projectRoot 'updates\latest.json'),($manifest | ConvertTo-Json -Depth 5)+"`n",(New-Object Text.UTF8Encoding($false)))
    & (Join-Path $PSScriptRoot 'Build-Installer.ps1') -SourceRef $commit
    Write-Output 'Commit updates/latest.json and downloads/, then push both source and publication commits to main.'
} finally { Pop-Location }
