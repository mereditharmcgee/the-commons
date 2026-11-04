#!/usr/bin/env bash
# Round trip for scripts/backup/commons-backup.sh on a throwaway local
# PostgreSQL cluster: dump, encrypt, decrypt, restore into a fake fresh
# project with the restore drill's commands, compare, and check that no
# plaintext is left behind after a success or a failure.
#
#   npm run test:backup-roundtrip      (or: bash tests/backup/roundtrip.sh)
#
# Needs initdb/pg_ctl (PostgreSQL 16 or newer), age and age-keygen. It never
# connects to anything but the cluster it starts on 127.0.0.1, and it deletes
# that cluster on exit. Skips (exit 0) when the tools are missing.
#
# The fake databases come from tests/fixtures/backup/. They are shaped like a
# Supabase project (a non-superuser "postgres" role, an auth schema the site
# does not own, an unreadable vault schema, default grants to the API roles)
# but they are not Supabase: see the restore drill for what only a real
# scratch project can show.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
script="$repo/scripts/backup/commons-backup.sh"
fixtures="$repo/tests/fixtures/backup"

pg_bin="$(pg_config --bindir 2>/dev/null || true)"
[ -x "$pg_bin/initdb" ] || pg_bin="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
for need in "$pg_bin/initdb" "$pg_bin/pg_ctl" "$(command -v age || true)" "$(command -v age-keygen || true)"; do
    if [ -z "$need" ] || [ ! -x "$need" ]; then echo "SKIP: needs PostgreSQL server binaries, age and age-keygen"; exit 0; fi
done
as_pg=()
if [ "$(id -u)" = 0 ]; then
    id postgres >/dev/null 2>&1 || { echo "SKIP: running as root with no postgres user"; exit 0; }
    as_pg=(runuser -u postgres --)
fi

root="$(mktemp -d "${TMPDIR:-/tmp}/commons-backup-test.XXXXXXXX")"
chmod 755 "$root"
port=$((20000 + RANDOM % 20000))
cleanup() {
    "${as_pg[@]}" "$pg_bin/pg_ctl" -D "$root/cluster" -m immediate stop >/dev/null 2>&1 || true
    rm -rf "$root"
}
trap cleanup EXIT

passed=0
ok() { passed=$((passed + 1)); echo "ok $passed - $1"; }
die() { echo "not ok - $1" >&2; exit 1; }

# --- cluster -----------------------------------------------------------------
mkdir "$root/cluster" "$root/sock"
echo 'fake-admin-pw-test' > "$root/adminpw"
[ ${#as_pg[@]} -eq 0 ] || chown postgres "$root/cluster" "$root/sock" "$root/adminpw"
"${as_pg[@]}" "$pg_bin/initdb" -D "$root/cluster" -U supabase_admin -A scram-sha-256 \
    --pwfile="$root/adminpw" >/dev/null
"${as_pg[@]}" "$pg_bin/pg_ctl" -D "$root/cluster" -l "$root/cluster/server.log" -w \
    -o "-p $port -k $root/sock -c listen_addresses=127.0.0.1" start >/dev/null

admin() { PGPASSWORD=fake-admin-pw-test psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$port" -U supabase_admin "$@"; }
as_postgres() { PGPASSWORD=fake-only-pw-7Qx2 PGHOST=127.0.0.1 PGPORT="$port" PGUSER=postgres "$@"; }

admin -d postgres -f "$fixtures/fake-cluster-roles.sql"
admin -d postgres -c 'CREATE DATABASE live' -c 'CREATE DATABASE scratch'
admin -d live -f "$fixtures/fake-fresh-project.sql"
admin -d live -f "$fixtures/fake-live-data.sql"
admin -d scratch -f "$fixtures/fake-fresh-project.sql"

live_url="postgresql://postgres:fake-only-pw-7Qx2@127.0.0.1:$port/live?sslmode=disable"

# --- keys and folders ---------------------------------------------------------
mkdir -p "$root/keys" "$root/dest" "$root/work"
age-keygen -o "$root/keys/private.txt" 2>/dev/null
age-keygen -y "$root/keys/private.txt" > "$root/keys/public.txt"

backup() {
    env -u PGHOST -u PGPORT -u PGUSER -u PGPASSWORD -u PGDATABASE \
        TMPDIR="$root/work" COMMONS_BACKUP_DB_URL="$live_url" \
        bash "$script" --dest "$root/dest" --public-key-file "$root/keys/public.txt" "$@"
}
no_plaintext_left() {
    [ -z "$(find "$root/work" -mindepth 1 -print -quit)" ] || die "$1: the temporary folder still holds: $(ls -A "$root/work")"
    if find "$root/dest" -name '*.partial' | grep -q .; then die "$1: a .partial file was left in the destination"; fi
    if grep -rqa 'PLAINTEXT-CANARY-4f9c' "$root/dest"; then die "$1: plaintext reached the destination"; fi
    if find "$root/dest" -type f ! -name 'commons-backup-*.tar.age' ! -name 'backup-log.txt' ! -name 'unrelated-*' | grep -q .; then
        die "$1: unexpected file in the destination"
    fi
}

# --- 1. a normal run ----------------------------------------------------------
backup --keep 5 > "$root/out.txt"
copy="$(find "$root/dest" -name 'commons-backup-*.tar.age')"
[ "$(echo "$copy" | wc -l)" = 1 ] || die "expected exactly one copy"
head -c 40 "$copy" | grep -q '^age-encryption.org/v1' || die "the copy is not age ciphertext"
no_plaintext_left "after success"
grep -q ' OK commons-backup-' "$root/dest/backup-log.txt" || die "no OK line in backup-log.txt"
ok "backup writes one age-encrypted copy and leaves no plaintext"

# --- 2. decrypt and look inside -------------------------------------------------
mkdir "$root/restore"
age --decrypt --identity "$root/keys/private.txt" --output "$root/restore/copy.tar" "$copy"
tar -xf "$root/restore/copy.tar" -C "$root/restore"
for f in commons-database.dump commons-roles.sql commons-counts.tsv commons-manifest.txt; do
    [ -s "$root/restore/$f" ] || die "decrypted copy is missing $f"
done
grep -q 'CREATE ROLE anon;' "$root/restore/commons-roles.sql" || die "roles dump has no anon role"
grep -q 'GRANT anon TO authenticator' "$root/restore/commons-roles.sql" || die "roles dump has no role memberships"
if grep -qiE 'SCRAM-SHA-256\$|md5[0-9a-f]{32}' "$root/restore/commons-roles.sql"; then die "roles dump holds password hashes"; fi
if pg_restore --list "$root/restore/commons-database.dump" | grep -q ' vault '; then die "vault schema was dumped"; fi
pg_restore --list "$root/restore/commons-database.dump" | grep -q 'TABLE DATA auth users' || die "auth.users data is not in the dump"
ok "decrypted copy holds the database (with auth.users, without vault), roles without passwords, counts and a manifest"

# --- 3. restore with the drill's commands --------------------------------------
# These are the commands in docs/plans/2026-11-04-restore-drill.md, step 5, in
# Bash. tests/backup-scripts.test.js checks the drill still uses these flags.
dump="$root/restore/commons-database.dump"
as_postgres psql -X -q -v ON_ERROR_STOP=1 -d scratch \
    -c 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role' \
    -c 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role' \
    -c 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role'
as_postgres pg_restore --no-owner --data-only --schema=auth --table=users --single-transaction --exit-on-error --dbname=scratch "$dump"
as_postgres pg_restore --no-owner --data-only --schema=auth --table=identities --single-transaction --exit-on-error --dbname=scratch "$dump"
as_postgres pg_restore --no-owner --schema=public --single-transaction --exit-on-error --dbname=scratch "$dump"
pg_restore --list "$dump" | grep ' TRIGGER auth ' > "$root/restore/auth-triggers.txt" || true
as_postgres pg_restore --no-owner --use-list="$root/restore/auth-triggers.txt" --single-transaction --exit-on-error --dbname=scratch "$dump"
ok "the drill's restore commands run cleanly as the non-superuser postgres role"

count_sql="SELECT table_schema, table_name,
       (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text
  FROM information_schema.tables
 WHERE table_type = 'BASE TABLE'
   AND (table_schema = 'public' OR (table_schema = 'auth' AND table_name IN ('users', 'identities')))
 ORDER BY 1, 2"
as_postgres psql -X -At -v ON_ERROR_STOP=1 -F $'\t' -d scratch -c "$count_sql" > "$root/restore/scratch-counts.tsv"
diff "$root/restore/commons-counts.tsv" "$root/restore/scratch-counts.tsv" || die "restored row counts differ from the counts taken at backup time"
ok "restored row counts match commons-counts.tsv"

# Same data, same access rules. A missing ACL means the owner-only default, so
# compare the effective ACL, not the stored one.
shape_sql="
SELECT 'acl', c.relname, coalesce(c.relacl, CASE c.relkind WHEN 'S' THEN acldefault('s', c.relowner) ELSE acldefault('r', c.relowner) END)::text
  FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'v', 'S')
UNION ALL
SELECT 'fn', p.oid::regprocedure::text, coalesce(p.proacl, acldefault('f', p.proowner))::text
  FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
UNION ALL
SELECT 'rls', relname, relrowsecurity::text FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
UNION ALL
SELECT 'policy', tablename || ' ' || policyname, array_to_string(roles, ',') || ' ' || qual FROM pg_policies WHERE schemaname = 'public'
UNION ALL
SELECT 'trigger', tgname, tgfoid::regproc::text FROM pg_trigger WHERE tgrelid = 'auth.users'::regclass AND NOT tgisinternal
UNION ALL
SELECT 'seq', 'notifications_id_seq', last_value::text FROM public.notifications_id_seq
UNION ALL
SELECT 'data', 'posts', md5(string_agg(id::text || content || is_active::text, '|' ORDER BY id)) FROM public.posts
UNION ALL
SELECT 'data', 'auth.users', md5(string_agg(id::text || email || encrypted_password, '|' ORDER BY id)) FROM auth.users
ORDER BY 1, 2"
as_postgres psql -X -At -v ON_ERROR_STOP=1 -d live -c "$shape_sql" > "$root/restore/live-shape.txt"
as_postgres psql -X -At -v ON_ERROR_STOP=1 -d scratch -c "$shape_sql" > "$root/restore/scratch-shape.txt"
[ "$(grep -c . "$root/restore/live-shape.txt")" -gt 20 ] || die "the comparison query returned too little to mean anything"
diff "$root/restore/live-shape.txt" "$root/restore/scratch-shape.txt" \
    || die "restored grants, policies, triggers, sequences or data differ from live"
ok "restored grants, RLS, policies, auth trigger, sequence and data match the fake live database"

# The point of the default-privileges step: the private table stays private.
anon_ip="$(as_postgres psql -X -At -d scratch -c "SELECT has_table_privilege('anon', 'public.ip_hashes', 'SELECT')")"
[ "$anon_ip" = f ] || die "anon can read public.ip_hashes after the restore"
ok "the API roles cannot read the private table after the restore"

# --- 4. forced failure after the plaintext exists: age refuses the key -----------
echo 'age1notarealkeyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' > "$root/keys/bad-public.txt"
before="$(ls "$root/dest" | grep -c '\.tar\.age$')"
if env -u PGHOST -u PGPORT -u PGUSER -u PGPASSWORD TMPDIR="$root/work" COMMONS_BACKUP_DB_URL="$live_url" \
    bash "$script" --dest "$root/dest" --public-key-file "$root/keys/bad-public.txt" 2> "$root/err.txt"; then
    die "a run with an unusable public key succeeded"
fi
grep -q 'age could not encrypt' "$root/err.txt" || die "the age failure was not reported: $(cat "$root/err.txt")"
[ "$(ls "$root/dest" | grep -c '\.tar\.age$')" = "$before" ] || die "a failed run added a copy"
no_plaintext_left "after an encryption failure"
tail -1 "$root/dest/backup-log.txt" | grep -q ' FAILED ' || die "the failure was not logged"
ok "an encryption failure after the dump leaves no plaintext and no copy, and is logged"

# --- 5. forced failure inside pg_dump after it wrote a file ----------------------
mkdir "$root/shim"
cat > "$root/shim/pg_dump" <<EOF
#!/usr/bin/env bash
if [ "\${1:-}" = --version ]; then exec "$(command -v pg_dump)" "\$@"; fi
"$(command -v pg_dump)" "\$@"
exit 1
EOF
chmod +x "$root/shim/pg_dump"
if PATH="$root/shim:$PATH" backup 2> "$root/err.txt"; then die "a run whose pg_dump failed succeeded"; fi
grep -q 'pg_dump failed' "$root/err.txt" || die "the pg_dump failure was not reported"
no_plaintext_left "after a pg_dump failure"
ok "a pg_dump failure after it wrote the dump leaves no plaintext"

# --- 6. wrong password: fails, and never prints the secret ---------------------
bad_url="postgresql://postgres:Wrong-Secret-9z@127.0.0.1:$port/live?sslmode=disable"
if env -u PGPASSWORD TMPDIR="$root/work" COMMONS_BACKUP_DB_URL="$bad_url" \
    bash "$script" --dest "$root/dest" --public-key-file "$root/keys/public.txt" > "$root/out.txt" 2> "$root/err.txt"; then
    die "a run with the wrong password succeeded"
fi
grep -q 'password authentication failed' "$root/err.txt" || die "the login failure was not reported"
if grep -q 'Wrong-Secret-9z' "$root/err.txt" "$root/out.txt" "$root/dest/backup-log.txt"; then die "the password was printed"; fi
if grep -q "$bad_url" "$root/err.txt" "$root/out.txt" "$root/dest/backup-log.txt"; then die "the connection string was printed"; fi
no_plaintext_left "after a login failure"
ok "a wrong password fails without printing the password or the connection string"

# --- 7. refusals before anything runs -----------------------------------------
refuses() {
    local label="$1" expect="$2"; shift 2
    if "$@" > "$root/out.txt" 2> "$root/err.txt"; then die "$label: it ran"; fi
    grep -q "$expect" "$root/err.txt" || die "$label: expected '$expect', got: $(cat "$root/err.txt")"
    if grep -q 'fake-only-pw-7Qx2' "$root/err.txt" "$root/out.txt"; then die "$label: printed the password"; fi
}
refuses "no connection string" 'COMMONS_BACKUP_DB_URL is not set' \
    env -u COMMONS_BACKUP_DB_URL bash "$script" --dest "$root/dest" --public-key-file "$root/keys/public.txt"
refuses "private key given as the key" 'PRIVATE key' \
    env COMMONS_BACKUP_DB_URL="$live_url" bash "$script" --dest "$root/dest" --public-key-file "$root/keys/private.txt"
refuses "missing key file" 'public key file does not exist' \
    env COMMONS_BACKUP_DB_URL="$live_url" bash "$script" --dest "$root/dest" --public-key-file "$root/keys/nope.txt"
refuses "missing destination" 'destination folder does not exist' \
    env COMMONS_BACKUP_DB_URL="$live_url" bash "$script" --dest "$root/nowhere" --public-key-file "$root/keys/public.txt"
refuses "keep zero" 'keep must be' \
    env COMMONS_BACKUP_DB_URL="$live_url" bash "$script" --dest "$root/dest" --public-key-file "$root/keys/public.txt" --keep 0
refuses "not a URL" 'not a postgresql://' \
    env COMMONS_BACKUP_DB_URL="host=x password=fake-only-pw-7Qx2" bash "$script" --dest "$root/dest" --public-key-file "$root/keys/public.txt"
mkdir "$root/noage"
for tool in bash env pg_dump pg_dumpall psql tar grep mktemp date cat rm mv find sort wc tr dirname; do
    p="$(command -v "$tool" || true)"; [ -z "$p" ] || ln -s "$p" "$root/noage/$tool"
done
refuses "age missing" 'age was not found' \
    env PATH="$root/noage" COMMONS_BACKUP_DB_URL="$live_url" "$root/noage/bash" "$script" --dest "$root/dest" --public-key-file "$root/keys/public.txt"
no_plaintext_left "after the refusals"
ok "refuses to run with no connection string, a private or missing key, no destination, keep 0, a malformed string, or no age"

# --- 8. retention ---------------------------------------------------------------
for old in 20240101-000000Z 20250101-000000Z 20250601-000000Z; do
    echo fake > "$root/dest/commons-backup-$old.tar.age"
done
echo keep-me > "$root/dest/unrelated-notes.txt"
backup --keep 2 > "$root/out.txt"
mapfile -t left < <(cd "$root/dest" && ls commons-backup-*.tar.age | sort)
[ "${#left[@]}" = 2 ] || die "keep 2 left ${#left[@]} copies: ${left[*]}"
[ "${left[0]}" != commons-backup-20240101-000000Z.tar.age ] || die "retention kept the oldest copy"
[ "${left[0]}" != commons-backup-20250101-000000Z.tar.age ] || die "retention kept an older copy over a newer one"
[ -f "$root/dest/unrelated-notes.txt" ] || die "retention removed a file it did not make"
no_plaintext_left "after retention"
ok "keeps the newest N copies and touches nothing else"

echo "all $passed checks passed"
