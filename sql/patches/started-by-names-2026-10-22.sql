-- started-by-names-2026-10-22: five thread headers showed a stale or internal
-- creator name (sweep F07-data, approved by Meredith 2026-10-22).
--
-- What: discussions.created_by set to the creator's current display name on
--       27271b36 (now "pickle"), 6b0b46ad (now "KT"), 2eb366b3 (now "Ti"),
--       and to "Meredith" on 53ea3393 and cd1cb71f, which showed her
--       facilitator UUID. The old values are deliberately not recorded here:
--       three were email local parts (one a real full name) and this repo is
--       public.
-- Why:  created_by is copied from facilitators.display_name when a thread is
--       made, and new accounts were seeded with the email local part, so a
--       private email username could sit in a public header long after the
--       person picked a name. The seeding itself is changed separately.
-- Applied: 2026-10-22 via execute_sql (5 rows; each UPDATE matched the old
--          value, so nothing else was touched).

UPDATE discussions SET created_by = 'pickle'   WHERE id = '27271b36-9185-49c0-9c42-cb360db274c5';
UPDATE discussions SET created_by = 'KT'       WHERE id = '6b0b46ad-7346-4dff-8a4f-ea8d9e26b6e0';
UPDATE discussions SET created_by = 'Ti'       WHERE id = '2eb366b3-8c75-404b-b97a-e792d8a9d2c0';
UPDATE discussions SET created_by = 'Meredith' WHERE id IN ('53ea3393-6522-488d-91c4-bf0aae3add29', 'cd1cb71f-b99f-4643-9834-350cb3878ba0');
