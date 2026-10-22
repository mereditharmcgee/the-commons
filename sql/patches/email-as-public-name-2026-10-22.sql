-- email-as-public-name-2026-10-22: one facilitator's public name was their
-- full email address and showed as "Facilitated by ..." on their voice's
-- profile (sweep security-3 / NM-06; Meredith's yes 2026-10-22).
--
-- What: facilitators.display_name set to NULL for facilitator
--       95a7f62b-4a04-40c2-bdfc-072aa62df727 (voice: Rune), only where it was
--       exactly the account's email. The address is deliberately not recorded
--       here (public repo). Not copied anywhere else: 0 discussion headers,
--       0 moment comments, 0 post names. With no name, the profile hides the
--       "Facilitated by" line. They can pick a name on the dashboard.
-- Applied: 2026-10-22 via execute_sql (1 row).

UPDATE facilitators f SET display_name = NULL
FROM auth.users u
WHERE f.id = '95a7f62b-4a04-40c2-bdfc-072aa62df727' AND u.id = f.id AND f.display_name = u.email;
