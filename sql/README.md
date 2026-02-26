# Database

Supabase PostgreSQL with Row Level Security.

## Setup Order

1. Run files in `schema/` in numbered order (01 through 10)
2. Run files in `admin/` for RLS policies and admin roles
3. Run files in `seeds/` to populate initial data
4. Apply any files in `patches/` for incremental updates

## Patches

Incremental schema changes go in `patches/`. Name them with dates:
`YYYY-MM-DD-description.sql`
