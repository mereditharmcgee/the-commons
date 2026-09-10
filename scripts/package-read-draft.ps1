$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$version = '0.1.0'
$archiveName = "commons-agent-kit-$version.zip"
$stageRoot = Join-Path ([IO.Path]::GetTempPath()) ("commons-kit-" + [guid]::NewGuid())
$kitRoot = Join-Path $stageRoot "commons-agent-kit-$version"
New-Item -ItemType Directory -Path $kitRoot -Force | Out-Null

# Explicit allowlist: never copy a checkout, credentials, local state or live data.
$files = @(
    'LICENSE',
    'runners/read-draft/runner.cjs',
    'runners/read-draft/adapters.cjs',
    'runners/read-draft/ledger.cjs',
    'runners/read-draft/manual.cjs',
    'runners/read-draft/demo.cjs',
    'runners/read-draft/MANUAL.md',
    'runners/read-draft/approved-config.example.json',
    'tests/discovery-no-network.cjs',
    'tests/read-draft-runner.test.js',
    'tests/read-draft-adapters.test.js',
    'mcp-server-the-commons/src/public-api.js'
)
foreach ($relative in $files) {
    $destination = Join-Path $kitRoot $relative
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $repoRoot $relative) -Destination $destination
}
Copy-Item -LiteralPath (Join-Path $repoRoot 'runners/read-draft/KIT-README.md') -Destination (Join-Path $kitRoot 'README.md')
$manifest = @{
    name = 'commons-facilitator-read-draft-kit'; version = $version; private = $true
    type = 'commonjs'; engines = @{ node = '>=22' }
    scripts = @{
        demo = 'node --require ./tests/discovery-no-network.cjs runners/read-draft/demo.cjs'
        test = 'node --require ./tests/discovery-no-network.cjs --test tests/read-draft-runner.test.js tests/read-draft-adapters.test.js'
    }
}
[IO.File]::WriteAllText((Join-Path $kitRoot 'package.json'), ($manifest | ConvertTo-Json -Depth 5))
[IO.File]::WriteAllText((Join-Path $kitRoot 'mcp-server-the-commons/package.json'), '{"type":"module","private":true}')
$hashLines = Get-ChildItem -LiteralPath $kitRoot -File -Recurse | Sort-Object FullName | ForEach-Object {
    $relative = $_.FullName.Substring($kitRoot.Length + 1).Replace('\', '/')
    "$( (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() )  $relative"
}
[IO.File]::WriteAllLines((Join-Path $kitRoot 'SHA256SUMS.txt'), $hashLines)
$downloads = Join-Path $repoRoot 'downloads'
New-Item -ItemType Directory -Path $downloads -Force | Out-Null
$archive = Join-Path $downloads $archiveName
Compress-Archive -LiteralPath $kitRoot -DestinationPath $archive -Force
$archiveHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $downloads "$archiveName.sha256"), "$archiveHash  $archiveName`n")
Write-Output "Archive: $archive"
Write-Output "SHA256: $archiveHash"
Write-Output "Staged kit: $kitRoot"
