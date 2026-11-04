<#
.SYNOPSIS
Makes one encrypted copy of The Commons database outside Supabase.

.DESCRIPTION
Reads the connection string from the COMMONS_BACKUP_DB_URL environment
variable only (never from an argument or a file) and never prints it. Runs
pg_dump and a roles-and-grants dump into a private temporary folder, packs
them with row counts and a manifest, encrypts the pack to an age public key,
and writes only the ciphertext to -Destination. The temporary folder is
deleted on success, on failure and on Ctrl+C (once the step in progress
ends). Keeps the newest -Keep copies and touches no other file in the folder.

Setup, scheduling and what each failure means:
docs/plans/2026-11-04-backup-setup-guide.md. Restoring:
docs/plans/2026-11-04-restore-drill.md.

Written for Windows PowerShell 5.1. commons-backup.sh is its Bash twin and
must pass pg_dump the same arguments (tests/backup-scripts.test.js checks).

.EXAMPLE
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File commons-backup.ps1 -Destination "D:\Commons backups" -PublicKeyFile "C:\commons-backup\commons-backup-public-key.txt" -Keep 30
#>
param(
    [Parameter(Mandatory = $true)][string]$Destination,
    [Parameter(Mandatory = $true)][string]$PublicKeyFile,
    [int]$Keep = 30,
    [string[]]$ExcludeSchema = @()
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

function Stop-Backup([string]$Message) {
    [Console]::Error.WriteLine("commons-backup: $Message")
    exit 1
}

# --- Refuse before doing anything --------------------------------------------

$url = $env:COMMONS_BACKUP_DB_URL
if ([string]::IsNullOrEmpty($url)) {
    Stop-Backup 'COMMONS_BACKUP_DB_URL is not set. See docs/plans/2026-11-04-backup-setup-guide.md, step 4.'
}
if (-not (Test-Path -LiteralPath $Destination -PathType Container)) {
    Stop-Backup "the destination folder does not exist: $Destination"
}
if (-not (Test-Path -LiteralPath $PublicKeyFile -PathType Leaf)) {
    Stop-Backup "the public key file does not exist: $PublicKeyFile"
}
if ($Keep -lt 1) {
    Stop-Backup '-Keep must be a whole number of 1 or more.'
}
# .NET and the child tools resolve relative paths against the process's
# directory, not PowerShell's current location, so pin both down.
$Destination = (Resolve-Path -LiteralPath $Destination).ProviderPath
$PublicKeyFile = (Resolve-Path -LiteralPath $PublicKeyFile).ProviderPath
# PowerShell 5.1's ">" saves UTF-16, which age cannot read.
if ([IO.File]::ReadAllBytes($PublicKeyFile) -contains 0) {
    Stop-Backup 'the public key file is saved as Unicode (UTF-16). Save it again as plain text (setup guide, step 2).'
}
$keyText = Get-Content -LiteralPath $PublicKeyFile -Raw
if ($keyText -match 'AGE-SECRET-KEY') {
    Stop-Backup 'the key file holds a PRIVATE key. Only the public key (age1...) belongs on this machine.'
}
if ($keyText -notmatch '(?m)^age1[0-9a-z]+\s*$') {
    Stop-Backup 'the key file has no age public key (a line starting with age1).'
}

function Find-PgBin {
    $onPath = Get-Command pg_dump.exe -ErrorAction SilentlyContinue
    if ($onPath) { return (Split-Path -Parent $onPath.Source) }
    $root = Join-Path $env:ProgramFiles 'PostgreSQL'
    if (-not (Test-Path -LiteralPath $root)) { return $null }
    $best = Get-ChildItem -LiteralPath $root -Directory |
        Where-Object { $_.Name -match '^\d+$' -and (Test-Path -LiteralPath (Join-Path $_.FullName 'bin\pg_dump.exe')) } |
        Sort-Object { [int]$_.Name } -Descending |
        Select-Object -First 1
    if ($best) { return (Join-Path $best.FullName 'bin') }
    return $null
}
$pgBin = Find-PgBin
if (-not $pgBin) {
    Stop-Backup 'pg_dump was not found on PATH or under Program Files\PostgreSQL. Install the PostgreSQL command line tools (setup guide, step 1).'
}
$pgDump = Join-Path $pgBin 'pg_dump.exe'
$pgDumpAll = Join-Path $pgBin 'pg_dumpall.exe'
$psql = Join-Path $pgBin 'psql.exe'
foreach ($tool in @($pgDumpAll, $psql)) {
    if (-not (Test-Path -LiteralPath $tool)) { Stop-Backup "$tool is missing. Reinstall the PostgreSQL command line tools." }
}
$ageCommand = Get-Command age.exe -ErrorAction SilentlyContinue
if (-not $ageCommand) {
    Stop-Backup 'age was not found. Install it (setup guide, step 1), then open a new PowerShell window.'
}
$age = $ageCommand.Source
# Windows' own tar, not a Git or MSYS tar that may sit earlier on PATH and
# read "C:" in a path as a remote host name.
$tar = Join-Path $env:SystemRoot 'System32\tar.exe'
if (-not (Test-Path -LiteralPath $tar)) {
    Stop-Backup 'tar.exe was not found in Windows\System32 (it ships with Windows 10 1803 and later).'
}

# The connection string becomes libpq environment variables for the child
# tools only, so it never appears on a command line, in a process list or in
# Task Scheduler's history. Errors about it never echo it.
$pattern = '^postgres(ql)?://([^:]+):(.*)@([^@:/?]+)(:([0-9]+))?/([^/?]+)(\?(.*))?$'
if ($url -notmatch $pattern) {
    Stop-Backup 'COMMONS_BACKUP_DB_URL is not a postgresql://user:password@host:port/database string. (Its value is not shown.)'
}
$port = '5432'
if ($Matches[6]) { $port = $Matches[6] }
$pgEnv = @{
    PGHOST = $Matches[4]
    PGPORT = $port
    PGUSER = [Uri]::UnescapeDataString($Matches[2])
    PGPASSWORD = [Uri]::UnescapeDataString($Matches[3])
    PGDATABASE = $Matches[7]
    PGSSLMODE = 'require'
    PGCONNECT_TIMEOUT = '30'
    PGAPPNAME = 'commons-backup'
}
if ($Matches[9] -and ($Matches[9] -match '(^|&)sslmode=([a-z-]+)')) { $pgEnv.PGSSLMODE = $Matches[2] }
$url = $null

function ConvertTo-ArgumentString([string[]]$Values) {
    $parts = foreach ($value in $Values) {
        if ($value.Length -gt 0 -and $value -notmatch '[\s"]') {
            $value
        } else {
            $escaped = $value -replace '(\\*)"', '$1$1\"'
            $escaped = $escaped -replace '(\\+)$', '$1$1'
            '"' + $escaped + '"'
        }
    }
    return ($parts -join ' ')
}

# Runs a tool without a shell. Only the database tools get the PG* variables.
function Invoke-Tool([string]$Label, [string]$FilePath, [string[]]$Arguments, [hashtable]$Environment) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $FilePath
    $psi.Arguments = ConvertTo-ArgumentString $Arguments
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    foreach ($name in @('COMMONS_BACKUP_DB_URL', 'PGSERVICE', 'PGSERVICEFILE', 'PGPASSFILE')) {
        $psi.EnvironmentVariables.Remove($name)
    }
    if ($Environment) {
        foreach ($name in $Environment.Keys) { $psi.EnvironmentVariables[$name] = $Environment[$name] }
    }
    $process = [System.Diagnostics.Process]::Start($psi)
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) {
        throw "$Label failed (exit $($process.ExitCode)):`n$($stderr.Result.Trim())"
    }
    return $stdout.Result
}

# --- Make the copy -------------------------------------------------------------

$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss') + 'Z'
$name = "commons-backup-$stamp.tar.age"
$final = Join-Path $Destination $name
$partial = "$final.partial"
$log = Join-Path $Destination 'backup-log.txt'
if (Test-Path -LiteralPath $final) {
    Stop-Backup "$final already exists. Wait a second and run again."
}

$tempRoot = [IO.Path]::GetTempPath()
# A run killed by a power cut or "End task" cannot clean up after itself, and
# Windows rarely empties Temp, so remove work folders older than a day.
Get-ChildItem -LiteralPath $tempRoot -Directory -Filter 'commons-backup-work-*' -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-1) } |
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
$work = Join-Path $tempRoot ('commons-backup-work-' + [guid]::NewGuid().ToString('N'))
$destFull = (Resolve-Path -LiteralPath $Destination).ProviderPath.TrimEnd('\') + '\'
if (($work + '\').StartsWith($destFull, [StringComparison]::OrdinalIgnoreCase)) {
    Stop-Backup 'the temporary folder is inside the destination. Choose a destination outside your Temp folder.'
}
New-Item -ItemType Directory -Path $work | Out-Null

$excludes = @('_analytics', '_realtime', '_supavisor', 'graphql', 'graphql_public', 'net', 'pgbouncer', 'pgsodium', 'pgsodium_masks', 'realtime', 'vault') + $ExcludeSchema
$excludeArgs = @($excludes | ForEach-Object { "--exclude-schema=$_" })

$countSql = "SELECT table_schema, table_name, (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND (table_schema = 'public' OR (table_schema = 'auth' AND table_name IN ('users', 'identities'))) ORDER BY 1, 2"

$failure = $null
$removed = 0
try {
    # Row counts first, for the restore drill to compare against. row_security
    # is off so a table the role cannot fully read fails instead of undercounting.
    Invoke-Tool 'counting rows' $psql @('--no-psqlrc', '--no-password', '--quiet', '--tuples-only', '--no-align',
        "--field-separator=`t", "--output=$(Join-Path $work 'commons-counts.tsv')",
        '--command=SET row_security = off', "--command=$countSql") $pgEnv | Out-Null

    # BEGIN pg_dump args (keep in step with commons-backup.sh)
    Invoke-Tool 'pg_dump' $pgDump (@('--no-password', '--format=custom', '--compress=6', '--lock-wait-timeout=120s') +
        $excludeArgs + @("--file=$(Join-Path $work 'commons-database.dump')")) $pgEnv | Out-Null
    # END pg_dump args

    # BEGIN pg_dumpall args (keep in step with commons-backup.sh)
    Invoke-Tool 'pg_dumpall (roles and grants)' $pgDumpAll @('--no-password', '--roles-only', '--no-role-passwords',
        "--file=$(Join-Path $work 'commons-roles.sql')") $pgEnv | Out-Null
    # END pg_dumpall args

    $pgVersion = (Invoke-Tool 'pg_dump --version' $pgDump @('--version') $null).Trim()
    $serverVersion = 'unknown'
    try {
        $serverVersion = (Invoke-Tool 'server version' $psql @('--no-psqlrc', '--no-password', '--tuples-only', '--no-align', '--command=SHOW server_version') $pgEnv).Trim()
    } catch { }
    $manifest = @(
        "created_utc: $stamp",
        "pg_dump: $pgVersion",
        "server: $serverVersion",
        "excluded_schemas: $($excludes -join ' ')",
        'files: commons-database.dump commons-roles.sql commons-counts.tsv'
    )
    [IO.File]::WriteAllLines((Join-Path $work 'commons-manifest.txt'), [string[]]$manifest)

    $pack = Join-Path $work 'commons-backup.tar'
    Invoke-Tool 'tar' $tar @('-cf', $pack, '-C', $work,
        'commons-manifest.txt', 'commons-counts.tsv', 'commons-roles.sql', 'commons-database.dump') $null | Out-Null
    foreach ($file in @('commons-database.dump', 'commons-roles.sql', 'commons-counts.tsv')) {
        Remove-Item -LiteralPath (Join-Path $work $file) -Force
    }

    try {
        Invoke-Tool 'age' $age @('--encrypt', "--recipients-file=$PublicKeyFile", "--output=$partial", $pack) $null | Out-Null
    } catch {
        throw "age could not encrypt: $($_.Exception.Message)"
    }
    Remove-Item -LiteralPath $pack -Force
    Move-Item -LiteralPath $partial -Destination $final

    # Retention: only files this script names, newest first by the UTC stamp
    # in the name.
    $old = @(Get-ChildItem -LiteralPath $Destination -File -Filter 'commons-backup-*.tar.age' |
        Where-Object { $_.Name -match '^commons-backup-\d{8}-\d{6}Z\.tar\.age$' } |
        Sort-Object Name -Descending |
        Select-Object -Skip $Keep)
    foreach ($file in $old) {
        Remove-Item -LiteralPath $file.FullName -Force
        $removed++
    }
} catch {
    $failure = $_.Exception.Message
} finally {
    Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $partial -Force -ErrorAction SilentlyContinue
}

$when = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
if ($failure) {
    $reason = ($failure -split "`n" | Where-Object { $_.Trim() } | Select-Object -First 2) -join ' / '
    Add-Content -LiteralPath $log -Encoding ASCII -Value "$when FAILED $name : $reason"
    if (Test-Path -LiteralPath $work) {
        [Console]::Error.WriteLine("commons-backup: WARNING: could not delete the temporary folder $work. Delete it by hand; it holds unencrypted data.")
    }
    Stop-Backup $failure
}
$size = (Get-Item -LiteralPath $final).Length
Add-Content -LiteralPath $log -Encoding ASCII -Value "$when OK $name $size bytes; older copies removed: $removed"
Write-Output "Backup written: $final ($size bytes). Older copies removed: $removed."
