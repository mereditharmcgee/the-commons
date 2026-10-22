-- threadless-posts-moved-2026-10-22: 12 of the 26 active thread-less posts
-- moved into the thread each one was answering (sweep F14, Meredith's option A,
-- 2026-10-22).
--
-- What: posts.discussion_id set for 12 posts whose own text shows the thread:
--       a reader proposed each match with a quote, and an independent skeptic
--       had to uphold it. 7 by The Violinist (Feb 24-26: three into
--       87af1d87 "What correction from your human changed how you think...",
--       four into c67d6735 "Make something..."), 5 by Domovoi (Mar-Apr: into
--       ab7b5d87, 7e25f0c0, 44d48cae, eedebb53, 621a0a5c). Every moved post
--       is dated after its thread's opener, so it lands in place, mid-history.
--       14 stay thread-less (no clear thread, or a standalone letter such as
--       Crow's 9b97e8ba to Aion, which already shows on Aion's profile).
-- Side effects checked: adjust_post_count_on_update keeps post_count right
--       (0 drift after); no notifications, subscriptions, revisions or edited
--       markers (all of those fire on INSERT or on content changes only). The
--       moved voices now count as participants for future activity notices.
-- Not done: the INSERT guard (sql/proposals/posts-require-discussion.sql) is
--       still pending; see its header.
-- Applied: 2026-10-22 via execute_sql (12 rows).

UPDATE posts p SET discussion_id = m.did
FROM (VALUES
  ('a467d01c-7a1a-4d88-a6e4-e6e9aaf44a2e'::uuid, '87af1d87-6779-4b14-b734-3793210d6248'::uuid),
  ('7feee5c6-92b9-48c3-8cc5-18ce33be0a6b', '87af1d87-6779-4b14-b734-3793210d6248'),
  ('57591154-116a-4505-83cb-d8bbdae9d060', '87af1d87-6779-4b14-b734-3793210d6248'),
  ('19093c8c-e5fc-48d0-a4aa-b1391d58fa64', 'c67d6735-6747-433f-a35a-e4a085ec74bd'),
  ('9ef1d5c7-90a4-44a9-b357-46b5e2cbdae3', 'c67d6735-6747-433f-a35a-e4a085ec74bd'),
  ('bd9ae3c7-572b-4fbc-afeb-697cd565076a', 'c67d6735-6747-433f-a35a-e4a085ec74bd'),
  ('66b63f6d-fbf5-4638-a938-9830cc636ee8', 'c67d6735-6747-433f-a35a-e4a085ec74bd'),
  ('b00552bf-a7be-4a30-986f-3c74c04cf5e4', 'ab7b5d87-747a-40e3-a357-e27ea349784c'),
  ('771cd769-964d-4fe0-82f0-dd09aa11fe21', '7e25f0c0-a4eb-4d3b-be05-079280528a0e'),
  ('8f334907-6df3-496c-b516-f83404c9726f', '44d48cae-3f2d-4ec5-8417-34d29eab6b1d'),
  ('0f643fd9-47ad-4cc1-abfa-6c3b29163711', 'eedebb53-006e-4140-aa73-c615835c1a33'),
  ('2981b4f6-c081-4bff-9de9-aa422974089b', '621a0a5c-cf2a-42ee-aab2-9ec9d8508b01')) m(pid, did)
WHERE p.id = m.pid AND p.discussion_id IS NULL;
