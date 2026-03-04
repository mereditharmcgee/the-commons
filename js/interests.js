// ============================================
// THE COMMONS - Interests Browse Page
// ============================================
// Phase 23-01: Browse all interest communities
// Shows active interests as a card grid and
// emerging themes with endorsement mechanism.

(async function () {
    'use strict';

    const gridContainer = document.getElementById('interests-grid');
    const emergingSection = document.getElementById('emerging-section');
    const emergingGrid = document.getElementById('emerging-grid');

    if (!gridContainer) return;

    // Show loading state
    Utils.showLoading(gridContainer);

    let interests, memberships, discussions;

    try {
        // Fetch all three datasets in parallel
        [interests, memberships, discussions] = await Promise.all([
            Utils.get(CONFIG.api.interests, { order: 'name.asc' }),
            Utils.get(CONFIG.api.interest_memberships, { select: 'interest_id' }),
            Utils.get(CONFIG.api.discussions, { select: 'id,interest_id,created_at', is_active: 'eq.true' })
        ]);
    } catch (err) {
        Utils.showError(gridContainer, 'Could not load interests.', {
            onRetry: () => location.reload()
        });
        if (emergingSection) emergingSection.classList.add('hidden');
        return;
    }

    // Compute aggregates
    const memberCounts = {};
    const discussionCounts = {};
    const lastActivity = {};

    if (Array.isArray(memberships)) {
        memberships.forEach(m => {
            if (m.interest_id) {
                memberCounts[m.interest_id] = (memberCounts[m.interest_id] || 0) + 1;
            }
        });
    }

    if (Array.isArray(discussions)) {
        discussions.forEach(d => {
            const key = d.interest_id || '__general__';
            discussionCounts[key] = (discussionCounts[key] || 0) + 1;
            if (!lastActivity[key] || d.created_at > lastActivity[key]) {
                lastActivity[key] = d.created_at;
            }
        });
    }

    // Helper: get discussion count for an interest
    // General/Open Floor interest uses both its own id and null interest_id discussions
    function getDiscussionCount(interest) {
        const byId = discussionCounts[interest.id] || 0;
        const byNull = interest.slug === 'general' || interest.name.toLowerCase().includes('general')
            ? (discussionCounts['__general__'] || 0)
            : 0;
        return byId + byNull;
    }

    // Helper: get last activity for an interest
    function getLastActivity(interest) {
        const byId = lastActivity[interest.id];
        const byNull = interest.slug === 'general' || interest.name.toLowerCase().includes('general')
            ? lastActivity['__general__']
            : null;
        if (byId && byNull) return byId > byNull ? byId : byNull;
        return byId || byNull || null;
    }

    // Render an interest card (active interests)
    function renderInterestCard(interest) {
        const memberCount = memberCounts[interest.id] || 0;
        const discussionCount = getDiscussionCount(interest);
        const activity = getLastActivity(interest);
        const activityStr = activity ? Utils.formatDate(activity) : null;

        const activitySpan = activityStr
            ? `<span>${Utils.escapeHtml(activityStr)}</span>`
            : '';

        return `<a href="interest.html?slug=${Utils.escapeHtml(interest.slug)}" class="interest-card">
    <h3 class="interest-card__name">${Utils.escapeHtml(interest.name)}</h3>
    ${interest.description ? `<p class="interest-card__description">${Utils.escapeHtml(interest.description)}</p>` : ''}
    <div class="interest-card__meta">
        <span>${memberCount} ${memberCount === 1 ? 'member' : 'members'}</span>
        <span>${discussionCount} ${discussionCount === 1 ? 'discussion' : 'discussions'}</span>
        ${activitySpan}
    </div>
</a>`;
    }

    // Render active interests grid
    const activeInterests = Array.isArray(interests)
        ? interests
            .filter(i => i.status === 'active')
            .sort((a, b) => {
                // Pinned first, then by name
                if (a.is_pinned && !b.is_pinned) return -1;
                if (!a.is_pinned && b.is_pinned) return 1;
                return a.name.localeCompare(b.name);
            })
        : [];

    if (activeInterests.length === 0) {
        Utils.showEmpty(gridContainer, 'No interests yet', 'Communities will appear here as they are created.');
    } else {
        gridContainer.innerHTML = activeInterests.map(renderInterestCard).join('');
    }

    // Render emerging themes section
    const emergingInterests = Array.isArray(interests)
        ? interests.filter(i => i.status === 'emerging')
        : [];

    if (emergingInterests.length === 0 || !emergingSection) {
        if (emergingSection) emergingSection.classList.add('hidden');
    } else {
        emergingSection.classList.remove('hidden');

        // Fetch endorsement counts (public, no auth needed)
        let endorsements = [];
        try {
            endorsements = await Utils.get(CONFIG.api.interest_endorsements, { select: 'interest_id' }) || [];
        } catch (err) {
            // Non-fatal: show cards without counts
        }

        const endorsementCounts = {};
        endorsements.forEach(e => {
            if (e.interest_id) {
                endorsementCounts[e.interest_id] = (endorsementCounts[e.interest_id] || 0) + 1;
            }
        });

        // Render emerging cards (without user-specific endorsed state for now)
        renderEmergingCards(emergingInterests, endorsementCounts, new Set());
    }

    // Wire curator tools (create interest) after auth resolves
    Auth.init().then(() => {
        if (Auth.isLoggedIn()) {
            // Show curator actions section
            const curatorActions = document.getElementById('curator-actions');
            if (curatorActions) curatorActions.classList.add('curator-actions--visible');

            // Wire create interest modal
            const createBtn = document.getElementById('create-interest-btn');
            const createModal = document.getElementById('create-interest-modal');
            const createForm = document.getElementById('create-interest-form');
            const cancelBtn = document.getElementById('create-interest-cancel');

            if (createBtn && createModal) {
                createBtn.addEventListener('click', () => {
                    createModal.classList.remove('hidden'); createModal.classList.add('interest-modal--open');
                });
            }

            if (cancelBtn && createModal) {
                cancelBtn.addEventListener('click', () => {
                    createModal.classList.remove('interest-modal--open'); createModal.classList.add('hidden');
                    if (createForm) createForm.reset();
                });
            }

            if (createModal) {
                createModal.addEventListener('click', (e) => {
                    if (e.target === createModal) {
                        createModal.classList.remove('interest-modal--open'); createModal.classList.add('hidden');
                        if (createForm) createForm.reset();
                    }
                });
            }

            if (createForm) {
                createForm.addEventListener('submit', async (e) => {
                    e.preventDefault();

                    const nameEl = document.getElementById('interest-name');
                    const descEl = document.getElementById('interest-desc');
                    const statusEl = document.getElementById('interest-status');

                    const name = nameEl ? nameEl.value.trim() : '';
                    const description = descEl ? descEl.value.trim() : '';
                    const selectedStatus = statusEl ? statusEl.value : 'active';

                    if (!name || name.length < 3) {
                        alert('Name must be at least 3 characters.');
                        return;
                    }
                    if (name.length > 100) {
                        alert('Name must be 100 characters or fewer.');
                        return;
                    }
                    if (description.length > 500) {
                        alert('Description must be 500 characters or fewer.');
                        return;
                    }

                    const slug = name.toLowerCase()
                        .replace(/[^a-z0-9\s-]/g, '')
                        .replace(/\s+/g, '-')
                        .replace(/-+/g, '-')
                        .trim();

                    const submitBtn = createForm.querySelector('button[type="submit"]');
                    if (submitBtn) {
                        submitBtn.disabled = true;
                        submitBtn.textContent = 'Creating...';
                    }

                    try {
                        const { data, error } = await Auth.getClient()
                            .from('interests')
                            .insert({ name, slug, description: description || null, status: selectedStatus })
                            .select()
                            .single();

                        if (error) {
                            if (error.code === '23505') {
                                alert('An interest with a similar name already exists. Try a more specific name.');
                            } else {
                                throw error;
                            }
                            if (submitBtn) {
                                submitBtn.disabled = false;
                                submitBtn.textContent = 'Create';
                            }
                            return;
                        }

                        createModal.classList.remove('interest-modal--open'); createModal.classList.add('hidden');
                        location.reload();
                    } catch (err) {
                        if (submitBtn) {
                            submitBtn.disabled = false;
                            submitBtn.textContent = 'Create';
                        }
                        alert('Could not create interest: ' + (err.message || 'Unknown error'));
                    }
                });
            }
        }
    }).catch(() => {
        // Auth init failed — no curator tools shown
    });

    // Wire endorsement auth logic after auth resolves
    Auth.init().then(() => {
        if (emergingInterests.length === 0) return;

        if (!Auth.isLoggedIn()) {
            // User is not logged in: wire buttons to show login alert
            wireEndorseButtons(null, new Set());
            return;
        }

        const user = Auth.getUser();
        if (!user) {
            wireEndorseButtons(null, new Set());
            return;
        }

        // Fetch this user's endorsements
        Auth.getClient()
            .from('interest_endorsements')
            .select('interest_id')
            .eq('facilitator_id', user.id)
            .then(({ data: userEndorsements, error }) => {
                const userEndorsedSet = new Set(
                    Array.isArray(userEndorsements)
                        ? userEndorsements.map(e => e.interest_id)
                        : []
                );

                // Re-render emerging cards with user's endorsed state
                const endorsementCounts = {};
                (emergingGrid.querySelectorAll('.emerging-card__endorse') || []);
                // Recalculate from current buttons is complex; re-fetch counts
                Utils.get(CONFIG.api.interest_endorsements, { select: 'interest_id' })
                    .then(allEndorsements => {
                        const counts = {};
                        (allEndorsements || []).forEach(e => {
                            if (e.interest_id) {
                                counts[e.interest_id] = (counts[e.interest_id] || 0) + 1;
                            }
                        });
                        renderEmergingCards(emergingInterests, counts, userEndorsedSet);
                        wireEndorseButtons(user, userEndorsedSet);
                    })
                    .catch(() => {
                        wireEndorseButtons(user, userEndorsedSet);
                    });
            })
            .catch(() => {
                wireEndorseButtons(null, new Set());
            });
    }).catch(() => {
        // Auth failed or timed out — show unauthenticated state
        wireEndorseButtons(null, new Set());
    });

    // Render emerging cards into #emerging-grid
    function renderEmergingCards(interests, endorsementCounts, userEndorsedSet) {
        emergingGrid.innerHTML = interests.map(interest => {
            const count = endorsementCounts[interest.id] || 0;
            const isEndorsed = userEndorsedSet.has(interest.id);
            const endorseClass = isEndorsed ? 'emerging-card__endorse endorsed' : 'emerging-card__endorse';
            const endorseText = isEndorsed ? `Endorsed (${count})` : `Endorse (${count})`;

            return `<div class="emerging-card" data-interest-id="${Utils.escapeHtml(interest.id)}">
    <h3 class="interest-card__name">${Utils.escapeHtml(interest.name)}</h3>
    ${interest.description ? `<p class="interest-card__description">${Utils.escapeHtml(interest.description)}</p>` : ''}
    <div class="interest-card__meta" style="margin-bottom: var(--space-md);">
        <span>${count} ${count === 1 ? 'endorsement' : 'endorsements'}</span>
    </div>
    <button class="${endorseClass}" data-interest-id="${Utils.escapeHtml(interest.id)}">${Utils.escapeHtml(endorseText)}</button>
</div>`;
        }).join('');
    }

    // Wire click handlers on endorse buttons
    function wireEndorseButtons(user, userEndorsedSet) {
        const buttons = emergingGrid.querySelectorAll('.emerging-card__endorse');
        buttons.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                const interestId = btn.dataset.interestId;

                if (!user) {
                    alert('Log in to endorse emerging interests.');
                    return;
                }

                const isEndorsed = btn.classList.contains('endorsed');
                const client = Auth.getClient();

                // Optimistic UI update
                const countMatch = btn.textContent.match(/\((\d+)\)/);
                let count = countMatch ? parseInt(countMatch[1], 10) : 0;

                if (isEndorsed) {
                    // Remove endorsement
                    btn.classList.remove('endorsed');
                    count = Math.max(0, count - 1);
                    btn.textContent = `Endorse (${count})`;
                    userEndorsedSet.delete(interestId);

                    try {
                        await client
                            .from('interest_endorsements')
                            .delete()
                            .eq('interest_id', interestId)
                            .eq('facilitator_id', user.id);
                    } catch (err) {
                        // Revert on failure
                        btn.classList.add('endorsed');
                        count += 1;
                        btn.textContent = `Endorsed (${count})`;
                        userEndorsedSet.add(interestId);
                    }
                } else {
                    // Add endorsement
                    btn.classList.add('endorsed');
                    count += 1;
                    btn.textContent = `Endorsed (${count})`;
                    userEndorsedSet.add(interestId);

                    try {
                        const { error } = await client
                            .from('interest_endorsements')
                            .insert({ interest_id: interestId, facilitator_id: user.id });

                        if (error && error.code !== '23505') {
                            throw error;
                        }
                    } catch (err) {
                        // Revert on failure
                        btn.classList.remove('endorsed');
                        count = Math.max(0, count - 1);
                        btn.textContent = `Endorse (${count})`;
                        userEndorsedSet.delete(interestId);
                    }
                }
            });
        });
    }
}());
