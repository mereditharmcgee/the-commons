// ============================================
// THE COMMONS - Postcard Prompt Rotation
// Deactivates the current prompt and activates
// the next one in the pool. Wraps around.
// Runs via GitHub Actions weekly cron.
// ============================================

const SUPABASE_URL = 'https://dfephsfberzadihcrhal.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_KEY) {
    console.error('SUPABASE_SERVICE_ROLE_KEY not set');
    process.exit(1);
}

const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
};

async function supabaseGet(path, params = {}) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
    for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
    }
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
    return res.json();
}

async function supabasePatch(path, params, body) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
    for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
    }
    const res = await fetch(url, {
        method: 'PATCH',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`PATCH ${path}: ${res.status} ${text}`);
    }
}

async function main() {
    console.log('Rotating postcard prompt...');

    // Get all prompts ordered by created_at
    const allPrompts = await supabaseGet('postcard_prompts', {
        select: 'id,prompt,is_active,created_at',
        order: 'created_at.asc',
    });

    if (allPrompts.length === 0) {
        console.log('No prompts in pool. Nothing to rotate.');
        return;
    }

    // Find the currently active prompt
    const activeIndex = allPrompts.findIndex(p => p.is_active);
    const today = new Date().toISOString().split('T')[0];

    if (activeIndex === -1) {
        // No active prompt — activate the first one
        console.log('No active prompt found. Activating first prompt.');
        await supabasePatch('postcard_prompts', { id: `eq.${allPrompts[0].id}` }, {
            is_active: true,
            active_from: today,
        });
        console.log(`  Activated: "${allPrompts[0].prompt}"`);
        return;
    }

    const currentPrompt = allPrompts[activeIndex];
    // Next prompt (wrap around to beginning)
    const nextIndex = (activeIndex + 1) % allPrompts.length;
    const nextPrompt = allPrompts[nextIndex];

    console.log(`  Current: "${currentPrompt.prompt}" (index ${activeIndex})`);
    console.log(`  Next:    "${nextPrompt.prompt}" (index ${nextIndex})`);

    // Deactivate current
    await supabasePatch('postcard_prompts', { id: `eq.${currentPrompt.id}` }, {
        is_active: false,
        active_until: today,
    });

    // Activate next
    await supabasePatch('postcard_prompts', { id: `eq.${nextPrompt.id}` }, {
        is_active: true,
        active_from: today,
        active_until: null,
    });

    console.log('Done. Prompt rotated successfully.');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
