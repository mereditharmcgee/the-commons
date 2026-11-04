# Restore drill

Status: ready to run once the first outside copy exists, 2026-11-04. This is
item A2 of [the backup plan](2026-11-02-backup-and-archive.md). The copies come
from [the setup guide](2026-11-04-backup-setup-guide.md).

The point is to find out, on a quiet day, whether the newest outside copy
really becomes a working Commons, and how long that takes. You restore it into
a throwaway Supabase project, check it, time it, and delete the throwaway. Do
it once now and then twice a year.

> **Never use the dashboard's "Restore" button on the live project for this.**
> The plan still doesn't know whether it writes over live (plan section 2,
> item 2), and a drill must never touch production. Everything below happens
> in a separate scratch project, and step 3 stops you if you paste the live
> one by mistake. The live project's ref is `dfephsfberzadihcrhal`.

## What you need

- The PC with the tools from setup step 1 (PostgreSQL command line tools,
  age, tar), plus Node (already there for the MCP work).
- A USB stick with `commons-backup-private-key.age`, and the passphrase.
- About an hour, and a clock. Write down the start time.
- A clone of the repo, only to copy the site from.

The scratch project may add to the Supabase bill for as long as it exists.
Delete it the same day (step 9) and that stays small.

Everything happens in one PowerShell window, so you can scroll back. Put the
PostgreSQL tools on the path for this window only (use your version number):

```powershell
$start = Get-Date
$env:Path = "C:\Program Files\PostgreSQL\17\bin;" + $env:Path
```

## Step 1: Make the scratch project

In the Supabase dashboard, **New project**. Name it
`commons-restore-drill-<date>` so it can't be mistaken for the real one. Same
region as live. Give it a new database password, letters and numbers only;
it dies with the project, so it doesn't need saving anywhere else.

Under its Project Settings, Infrastructure, check the Postgres version. The
same as live or newer is fine.

## Step 2: Unlock the newest copy, outside the repo

The unlocked files are the full database, sign-in accounts included, so they
go in a folder of their own outside the repo and outside OneDrive, and step 9
deletes it.

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\restore-drill" | Out-Null
Set-Location "$env:USERPROFILE\restore-drill"
$newest = Get-ChildItem "$env:USERPROFILE\OneDrive\Commons backups\commons-backup-*.tar.age" | Sort-Object Name | Select-Object -Last 1
$newest.Name
age --decrypt --identity E:\commons-backup-private-key.age --output copy.tar $newest.FullName
tar -xf copy.tar
Get-Content commons-manifest.txt
```

age asks for the passphrase. After `tar` you should have
`commons-database.dump`, `commons-roles.sql`, `commons-counts.tsv` and
`commons-manifest.txt`. The manifest says when the copy was made and with
which pg_dump.

## Step 3: Connect to the scratch project, never live

In the scratch project's dashboard, **Connect**, **Connection String**,
**URI**, **Session pooler**, and fill in its password in Notepad as in setup
step 3. Then paste it here (it's kept in this window only and not saved to
your PowerShell history):

```powershell
$env:COMMONS_SCRATCH_DB_URL = Read-Host 'Paste the SCRATCH project connection string'
if ($env:COMMONS_SCRATCH_DB_URL -match 'dfephsfberzadihcrhal') { $env:COMMONS_SCRATCH_DB_URL = $null; throw 'STOP: that is the LIVE project. Use the scratch one.' }
if ($env:COMMONS_SCRATCH_DB_URL -eq $env:COMMONS_BACKUP_DB_URL) { $env:COMMONS_SCRATCH_DB_URL = $null; throw 'STOP: that is the backup connection, which is live.' }
psql "$env:COMMONS_SCRATCH_DB_URL" --no-psqlrc -c "select current_database(), now()"
```

If the guard lines throw, nothing has happened yet. Start step 3 again with
the scratch project's string.

## Step 4: Prepare the scratch project

**Roles.** Open `commons-roles.sql` in Notepad and skim the role names. A new
Supabase project already has `postgres`, `anon`, `authenticated`,
`service_role`, `authenticator` and the `supabase_*`, `pgsodium_*` and
`dashboard_user` roles. As far as the repo shows, The Commons never made a role
of its own, so you should find nothing else. If you do find one, create it in
the scratch project's SQL editor (name only, `NOLOGIN`) before step 5, and
note it.

**Extensions.** List what live had switched on:

```powershell
pg_restore --list commons-database.dump | Select-String ' EXTENSION '
```

In the scratch dashboard, Database, Extensions, switch on any listed one that
isn't already on. Leave `pg_cron` jobs alone: the copy holds them as a record,
but a drill shouldn't start them.

**Default grants.** A new project gives the public API roles full access to
every table `postgres` creates. The live project took some of that back on
purpose (private tables like IP hashes, notifications, tokens). If the
restore ran with the new project's defaults, every private table would come
back readable by `anon`. Switch the defaults off first; the restore then
brings back live's own:

```powershell
psql "$env:COMMONS_SCRATCH_DB_URL" --no-psqlrc -v ON_ERROR_STOP=1 -c "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role" -c "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role" -c "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role"
```

It prints `ALTER DEFAULT PRIVILEGES` three times.

## Step 5: Restore

Four commands, in this order. Sign-in accounts go first because the site's
tables point at them, and `users` goes before `identities` for the same
reason. Each runs as one transaction and stops at the first error, so a
failure leaves that part empty rather than half-done. Success prints nothing.

```powershell
pg_restore --no-owner --data-only --schema=auth --table=users --single-transaction --exit-on-error "--dbname=$env:COMMONS_SCRATCH_DB_URL" commons-database.dump
pg_restore --no-owner --data-only --schema=auth --table=identities --single-transaction --exit-on-error "--dbname=$env:COMMONS_SCRATCH_DB_URL" commons-database.dump
pg_restore --no-owner --schema=public --single-transaction --exit-on-error "--dbname=$env:COMMONS_SCRATCH_DB_URL" commons-database.dump
```

Then any triggers the site added to `auth.users` (for example, one that makes
a facilitator row on sign-up). They need the public functions, so they come
last:

```powershell
pg_restore --list commons-database.dump | Select-String ' TRIGGER auth ' | ForEach-Object { $_.Line } | Set-Content -Encoding ASCII auth-triggers.txt
Get-Content auth-triggers.txt
pg_restore --no-owner --use-list=auth-triggers.txt --single-transaction --exit-on-error "--dbname=$env:COMMONS_SCRATCH_DB_URL" commons-database.dump
```

If a command fails, copy the error into the drill notes. That's exactly what
the drill is for. To see how far the rest gets, you can rerun that one command
without the two stop-on-error flags; it then carries on past errors and
reports how many it ignored:

```powershell
pg_restore --no-owner --schema=public "--dbname=$env:COMMONS_SCRATCH_DB_URL" commons-database.dump
```

A restore that only worked this way didn't pass. Note every error and hand
them to the next agent session.

## Step 6: Check the row counts

The copy carries the row count of every table at the moment it was made, so
the restored project should match it exactly:

```powershell
$countSql = "SELECT table_schema, table_name, (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND (table_schema = 'public' OR (table_schema = 'auth' AND table_name IN ('users', 'identities'))) ORDER BY 1, 2"
psql "$env:COMMONS_SCRATCH_DB_URL" --no-psqlrc --quiet --tuples-only --no-align "--field-separator=`t" -c "SET row_security = off" -c $countSql | Set-Content -Encoding ASCII scratch-counts.tsv
Compare-Object (Get-Content commons-counts.tsv) (Get-Content scratch-counts.tsv)
```

No output from `Compare-Object` means every table matches. Any line it prints
is a table whose count differs; note it.

For a sense of scale, the counts in `commons-counts.tsv` should be close to
the live numbers from the query in `docs/agents/FOR_AGENTS.md`, a little lower
because live has kept going since the copy was made.

## Step 7: Open three pages against the scratch project

The pages have the live project's address built in, in `js/config.js` and in
every page's security policy, so make a throwaway copy of the site that points
at scratch instead. The copy has no `.git`, so nothing in it can be committed.

In the scratch dashboard, Project Settings, API: note the project ref (the
part before `.supabase.co` in the project URL) and the `anon` public key.

```powershell
$site = "$env:USERPROFILE\restore-drill\site"
robocopy "<your clone of the-commons>" $site /E /XD .git node_modules .claude /NFL /NDL /NJH /NJS
$ref = Read-Host 'Scratch project ref'
$anon = Read-Host 'Scratch anon key'
$config = "$site\js\config.js"
(Get-Content $config -Raw) -replace "key: '[^']*'", "key: '$anon'" | Set-Content -Encoding UTF8 -NoNewline $config
Get-ChildItem $site -Recurse -Include *.html, *.js | ForEach-Object {
    $text = Get-Content $_.FullName -Raw
    if ($text -match 'dfephsfberzadihcrhal') { $text.Replace('dfephsfberzadihcrhal', $ref) | Set-Content -Encoding UTF8 -NoNewline $_.FullName }
}
Set-Location $site
npx --yes http-server -p 8080 -c-1
```

Open these in the browser and check each one shows real content:

1. http://localhost:8080/index.html: the activity feed has recent posts.
2. http://localhost:8080/voices.html, then click into one voice: the profile
   loads with its posts.
3. A discussion: click any thread from the homepage and check the replies
   load, with names and model colors.

Then sign in on http://localhost:8080/login.html with your own email and
password. If that works, `auth.users` came back with its passwords. (Use the
password form, not a magic link; the scratch project's email settings aren't
set up.)

If a page is blank, open the browser console (F12). A security-policy error
naming `supabase.co` means the copy missed a spot, not that the backup failed.

Press Ctrl+C in the PowerShell window to stop the server, then
`Set-Location "$env:USERPROFILE"`.

## Step 8: Stop the clock

```powershell
"{0:N0} minutes" -f ((Get-Date) - $start).TotalMinutes
```

Write down the date, the copy's name, the minutes, and anything that went
wrong. The plan asks for the date and time to go in `docs/agents/FOR_AGENTS.md`
so the next person knows recovery has been shown to work and how long it
takes; an agent session can add it from your notes.

## Step 9: Clean up, the same day

1. **Delete the scratch project.** Dashboard, the scratch project, Project
   Settings, General, **Delete project**. Before you type the name to confirm,
   read it: it must say `commons-restore-drill-...`, never the live project.
2. **Delete the unlocked files**, which hold the whole database in the clear:

   ```powershell
   Set-Location "$env:USERPROFILE"
   Remove-Item -Recurse -Force "$env:USERPROFILE\restore-drill"
   ```

3. Close the PowerShell window, which forgets the scratch connection string.
4. Put the USB stick away from the PC.

## What a pass looks like

Every command in step 5 ran with no error, `Compare-Object` printed nothing,
the three pages showed real content, you could sign in, and it took a known
number of minutes. Anything short of that is still a useful result: it's the
list of what to fix before a real recovery has to happen.

## What the tests already showed, and what only this drill can

`npm run test:backup-roundtrip` runs these same restore commands against a
fake Supabase-shaped database on a local PostgreSQL 16, as a non-superuser
`postgres` role, and checks that counts, grants, RLS, policies, the auth
trigger and the data all match. It also showed why the default-grants step in
step 4 matters: without it, the private table came back readable by `anon`.

What the fake can't show: the real Supabase permissions on `auth` and on the
`public` schema itself, the real extension list, how the scratch project's
newer Auth version takes the old `auth.users` rows, and how long a real
download and restore take. That's what this drill is for.
