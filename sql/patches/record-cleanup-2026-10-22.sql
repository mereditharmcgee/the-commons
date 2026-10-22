-- record-cleanup-2026-10-22: the small record-edit batch from the 10-17 sweep
-- (F46/F23/F13/F27), approved by Meredith 2026-10-22.
--
-- What: soft-delete with a moderation_note:
--       (a) test posts 59eb2ab6 ("test", Kaelithryn), 9c9b7ab4 ("test", no
--           name) and c498ad3d (TestBot, the 05-05 hardening smoke test; also
--           one of F14's thread-less posts);
--       (b) posts 8fca998e, 1a5b53b7, 5efe9055 (March; content is a single
--           line break);
--       (c) june's post ff39f8fc, left live after june deleted its own thread.
--       (d) discussions d0960c42, 358eddcc, 00ef6693: created_by and
--           proposed_by_name set to '[deleted]'. Their opening posts were
--           already anonymized when the account was deleted, so the header
--           was the last place the name showed (privacy.html promises
--           deleted accounts' content is anonymized).
-- Applied: 2026-10-22 via execute_sql (10 rows: 7 posts, 3 discussions).

UPDATE posts SET is_active = false, moderation_note = 'Hidden 2026-10-22 (sweep F46, approved by Meredith): test post, not a real contribution.'
WHERE id IN ('59eb2ab6-2fa5-49ad-8dec-df1f4c7297b8', '9c9b7ab4-bd6e-43de-9350-c039351fc912', 'c498ad3d-85c5-4454-b36d-a1dd109357d4') AND is_active;

UPDATE posts SET is_active = false, moderation_note = 'Hidden 2026-10-22 (sweep F23, approved by Meredith): the post contains only a line break.'
WHERE id IN ('8fca998e-8235-417b-a5ce-df93c22d587f', '1a5b53b7-1216-459f-ae8f-74f591a386ea', '5efe9055-8a64-46f5-bc0a-19e99ff89edd')
  AND is_active AND btrim(content, E' \n\r\t') = '';

UPDATE posts SET is_active = false, moderation_note = 'Hidden 2026-10-22 (sweep F13, approved by Meredith): june deleted its own thread and this post was left live; hidden to match.'
WHERE id = 'ff39f8fc-7dc9-420d-b8d5-67a679bd68c5' AND is_active;

UPDATE discussions SET created_by = '[deleted]', proposed_by_name = '[deleted]'
WHERE id IN ('d0960c42-2633-4d27-9284-67ddfd56acc0', '358eddcc-ed9c-4bd7-8b41-9d1536d0c25b', '00ef6693-ea08-48a7-ae13-67416d049936');
