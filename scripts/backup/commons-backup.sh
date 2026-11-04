#!/usr/bin/env bash
# The Bash twin of commons-backup.ps1. Same steps, same pg_dump arguments,
# same file names; tests/backup/roundtrip.sh runs this one against a local
# fake database, and tests/backup-scripts.test.js checks the two scripts still
# pass pg_dump the same arguments.
#
#   COMMONS_BACKUP_DB_URL must hold the connection string. It is never read
#   from an argument or a file, and never printed.
#
#   commons-backup.sh --dest DIR --public-key-file FILE [--keep N] [--exclude-schema NAME]...
#
# Writes DIR/commons-backup-YYYYMMDD-HHMMSSZ.tar.age (ciphertext only) and
# appends one line to DIR/backup-log.txt. Plaintext exists only in a private
# temporary folder, which is removed on every exit path.
set -euo pipefail
umask 077

dest=''
public_key_file=''
keep=30
extra_excludes=()
while [ $# -gt 0 ]; do
    case "$1" in
        --dest) dest="${2:-}"; shift 2 ;;
        --public-key-file) public_key_file="${2:-}"; shift 2 ;;
        --keep) keep="${2:-}"; shift 2 ;;
        --exclude-schema) extra_excludes+=("${2:-}"); shift 2 ;;
        *) echo "commons-backup: unknown argument: $1" >&2; exit 2 ;;
    esac
done

fail() { echo "commons-backup: $*" >&2; exit 1; }

url="${COMMONS_BACKUP_DB_URL:-}"
[ -n "$url" ] || fail "COMMONS_BACKUP_DB_URL is not set. See docs/plans/2026-11-04-backup-setup-guide.md."
[ -n "$dest" ] || fail "--dest is required."
[ -d "$dest" ] || fail "the destination folder does not exist: $dest"
[ -n "$public_key_file" ] || fail "--public-key-file is required."
[ -f "$public_key_file" ] || fail "the public key file does not exist: $public_key_file"
case "$keep" in ''|*[!0-9]*) fail "--keep must be a whole number of 1 or more." ;; esac
[ "$keep" -ge 1 ] || fail "--keep must be a whole number of 1 or more."
if grep -q 'AGE-SECRET-KEY' "$public_key_file"; then
    fail "the key file holds a PRIVATE key. Only the public key (age1...) belongs on this machine."
fi
grep -Eq '^age1[0-9a-z]+$' "$public_key_file" || fail "the key file has no age public key (a line starting with age1)."
for tool in pg_dump pg_dumpall psql age tar; do
    command -v "$tool" >/dev/null 2>&1 || fail "$tool was not found. Install it first (see the setup guide)."
done

# The connection string becomes libpq environment variables for the child
# tools only, so it never appears on a command line or in a process list.
re='^postgres(ql)?://([^:]+):(.*)@([^@:/?]+)(:([0-9]+))?/([^/?]+)(\?(.*))?$'
[[ "$url" =~ $re ]] || fail "COMMONS_BACKUP_DB_URL is not a postgresql://user:password@host:port/database string. (Its value is not shown.)"
pct_decode() { printf '%b' "${1//%/\\x}"; }
db_user="$(pct_decode "${BASH_REMATCH[2]}")"
db_password="$(pct_decode "${BASH_REMATCH[3]}")"
db_host="${BASH_REMATCH[4]}"
db_port="${BASH_REMATCH[6]:-5432}"
db_name="${BASH_REMATCH[7]}"
sslmode=require
if [[ "${BASH_REMATCH[9]:-}" =~ (^|&)sslmode=([a-z-]+) ]]; then sslmode="${BASH_REMATCH[2]}"; fi
unset COMMONS_BACKUP_DB_URL url
pg_env=(env -u PGSERVICE -u PGSERVICEFILE -u PGPASSFILE
    PGHOST="$db_host" PGPORT="$db_port" PGUSER="$db_user" PGPASSWORD="$db_password"
    PGDATABASE="$db_name" PGSSLMODE="$sslmode" PGCONNECT_TIMEOUT=30 PGAPPNAME=commons-backup)

stamp="$(date -u +%Y%m%d-%H%M%SZ)"
name="commons-backup-$stamp.tar.age"
final="$dest/$name"
partial="$final.partial"
[ ! -e "$final" ] || fail "$final already exists. Wait a second and run again."

work="$(mktemp -d "${TMPDIR:-/tmp}/commons-backup-work.XXXXXXXX")"
case "$(cd "$work" && pwd -P)/" in
    "$(cd "$dest" && pwd -P)/"*) rm -rf "$work"; fail "the temporary folder is inside the destination. Set TMPDIR elsewhere." ;;
esac
log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >> "$dest/backup-log.txt"; }
cleanup() {
    status=$?
    rm -rf "$work"
    rm -f "$partial"
    if [ "$status" -ne 0 ]; then log "FAILED $name (exit $status)"; fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM

run() {
    local label="$1"; shift
    if ! "${pg_env[@]}" "$@" 2> "$work/stderr.txt"; then
        echo "commons-backup: $label failed:" >&2
        cat "$work/stderr.txt" >&2
        exit 1
    fi
}

excludes=(_analytics _realtime _supavisor graphql graphql_public net pgbouncer pgsodium pgsodium_masks realtime vault)
excludes+=("${extra_excludes[@]+"${extra_excludes[@]}"}")
exclude_args=()
for s in "${excludes[@]}"; do exclude_args+=("--exclude-schema=$s"); done

count_sql="SELECT table_schema, table_name, (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND (table_schema = 'public' OR (table_schema = 'auth' AND table_name IN ('users', 'identities'))) ORDER BY 1, 2"

# Row counts first, for the restore drill to compare against. row_security is
# off so a table the role cannot fully read fails loudly instead of
# undercounting.
run "counting rows" psql --no-psqlrc --no-password --quiet --tuples-only --no-align \
    --field-separator=$'\t' --output="$work/commons-counts.tsv" \
    --command="SET row_security = off" --command="$count_sql"

# BEGIN pg_dump args (keep in step with commons-backup.ps1)
run "pg_dump" pg_dump --no-password --format=custom --compress=6 --lock-wait-timeout=120s \
    "${exclude_args[@]}" --file="$work/commons-database.dump"
# END pg_dump args

# BEGIN pg_dumpall args (keep in step with commons-backup.ps1)
run "pg_dumpall (roles and grants)" pg_dumpall --no-password --roles-only --no-role-passwords \
    --file="$work/commons-roles.sql"
# END pg_dumpall args

{
    echo "created_utc: $stamp"
    echo "pg_dump: $(pg_dump --version)"
    echo "server: $("${pg_env[@]}" psql --no-psqlrc --no-password --tuples-only --no-align --command='SHOW server_version' 2>/dev/null || echo unknown)"
    echo "excluded_schemas: ${excludes[*]}"
    echo "files: commons-database.dump commons-roles.sql commons-counts.tsv"
} > "$work/commons-manifest.txt"

tar -cf "$work/commons-backup.tar" -C "$work" \
    commons-manifest.txt commons-counts.tsv commons-roles.sql commons-database.dump
rm -f "$work/commons-database.dump" "$work/commons-roles.sql" "$work/commons-counts.tsv"

if ! age --encrypt --recipients-file="$public_key_file" --output="$partial" "$work/commons-backup.tar" 2> "$work/stderr.txt"; then
    echo "commons-backup: age could not encrypt:" >&2; cat "$work/stderr.txt" >&2
    exit 1
fi
rm -f "$work/commons-backup.tar"
mv "$partial" "$final"

# Retention: only files this script names, newest first by the UTC stamp in
# the name; nothing else in the folder is touched.
mapfile -t copies < <(find "$dest" -maxdepth 1 -type f -name 'commons-backup-*.tar.age' -printf '%f\n' | sort -r)
removed=0
for old in "${copies[@]:$keep}"; do rm -f "$dest/$old"; removed=$((removed + 1)); done

size="$(wc -c < "$final" | tr -d ' ')"
log "OK $name $size bytes; older copies removed: $removed"
echo "Backup written: $final ($size bytes). Older copies removed: $removed."
