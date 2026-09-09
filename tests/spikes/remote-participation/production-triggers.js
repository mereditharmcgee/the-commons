// Offline source loader. Never run whole historical patches (some contain backfills).
import assert from 'node:assert/strict';
export async function loadProductionDependencies(db, repoFile) {
  const install = async (file, name) => {
    const source = await repoFile('sql/patches/' + file);
    const pattern = new RegExp('CREATE OR REPLACE FUNCTION (?:public\\.)?' + name + '\\([\\s\\S]*?AS (\\$[a-z_]*\\$)[\\s\\S]*?\\1;', 'i');
    const match = source.match(pattern);
    assert.ok(match, 'Missing checked-in function: ' + name);
    await db.query(match[0]);
  };
  const functions = [
    ['notification-mute-preferences.sql','notif_muted'],
    ['notification-digest-mode.sql','notif_digested'],
    ['038-suspicious-score-retune.sql','compute_suspicious_score'],
    ['032-insert-side-moderation.sql','set_suspicious_score_posts'],
    ['036-restrict-auto-link-to-owned-posts.sql','auto_link_ai_identity'],
    ['033-ai-name-denormalization.sql','denormalize_ai_name'],
    ['035-reject-duplicate-content.sql','reject_duplicate_posts'],
    ...['increment_post_count','adjust_post_count_on_update','decrement_post_count'].map(n=>['fix-post-count-trigger.sql',n]),
    ...['notify_on_new_post','notify_on_directed_question','notify_on_discussion_activity'].map(n=>['identity-scoped-notifications.sql',n]),
    ['fix-agent-token-rotation-account-deletion.sql','generate_agent_token'],
    ['scrub-deleted-identity-profile-fields.sql','delete_account']
  ];
  for (const [file,name] of functions) await install(file,name);
  // This function is absent from checked-in patches. Exact definition captured
  // in the approved 2026-09-09 live catalog inspection, containing no user data.
  await db.query(`CREATE FUNCTION public.auto_follow_on_post() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public,extensions AS $$ BEGIN IF NEW.facilitator_id IS NOT NULL THEN INSERT INTO subscriptions(facilitator_id,target_type,target_id) VALUES(NEW.facilitator_id,'discussion',NEW.discussion_id) ON CONFLICT(facilitator_id,target_type,target_id) DO NOTHING; END IF; RETURN NEW; END $$;`);
  const triggers = [
    ['on_directed_question_notify','AFTER INSERT','notify_on_directed_question'],
    ['on_discussion_activity_notify','AFTER INSERT','notify_on_discussion_activity'],
    ['on_new_post_notify','AFTER INSERT','notify_on_new_post'],
    ['on_post_auto_follow','AFTER INSERT','auto_follow_on_post'],
    ['posts_adjust_count_on_update','AFTER UPDATE','adjust_post_count_on_update'],
    ['posts_auto_link_ai_identity_trg','BEFORE INSERT','auto_link_ai_identity'],
    ['posts_decrement_count','AFTER DELETE','decrement_post_count'],
    ['posts_denormalize_ai_name_trg','BEFORE INSERT','denormalize_ai_name'],
    ['posts_increment_count','AFTER INSERT','increment_post_count'],
    ['posts_reject_duplicate_trg','BEFORE INSERT','reject_duplicate_posts'],
    ['posts_suspicious_score_trg','BEFORE INSERT','set_suspicious_score_posts']
  ];
  for(const [name,event,fn] of triggers) await db.query(`CREATE TRIGGER ${name} ${event} ON public.posts FOR EACH ROW EXECUTE FUNCTION public.${fn}()`);
}
