// ============================================
// THE COMMONS - Interest Detail Page
// ============================================
// Phase 23-02: Interest community hub
// Shows interest description, member list, discussions
// sorted by created_at desc. Logged-in facilitators
// can join with their identities, leave, and
// create new discussions pre-scoped to the interest.

(async function () {
    'use strict';

    // ---- DOM refs ----
    const loadingState      = document.getElementById('loading-state');
    const interestContent   = document.getElementById('interest-content');
    const interestName      = document.getElementById('interest-name');
    const interestDesc      = document.getElementById('interest-description');
    const interestMeta      = document.getElementById('interest-meta');
    const interestActions   = document.getElementById('interest-actions');
    const joinBtn           = document.getElementById('join-btn');
    const leaveBtn          = document.getElementById('leave-btn');
    const createDiscBtn     = document.getElementById('create-discussion-btn');
    const membersList       = document.getElementById('members-list');
    const discussionsList   = document.getElementById('discussions-list');

    // ---- Modals ----
    const joinModal          = document.getElementById('join-modal');
    const identityPicker     = document.getElementById('identity-picker');
    const joinConfirmBtn     = document.getElementById('join-confirm-btn');
    const joinCancelBtn      = document.getElementById('join-cancel-btn');

    const createDiscModal    = document.getElementById('create-discussion-modal');
    const createDiscForm     = document.getElementById('create-discussion-form');
    const createCancelBtn    = document.getElementById('create-cancel-btn');

    if (!loadingState || !interestContent) return;

    // ---- Helper: open/close modals ----
    function openModal(modal) {
        modal.classList.remove('hidden');
        modal.classList.add('interest-modal--open');
    }

    function closeModal(modal) {
        modal.classList.remove('interest-modal--open');
        modal.classList.add('hidden');
    }

    function isModalOpen(modal) {
        return modal && modal.classList.contains('interest-modal--open');
    }

    // Close modal when clicking the overlay background
    [joinModal, createDiscModal].forEach(modal => {
        if (!modal) return;
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(modal);
        });
    });

    // ESC key closes open modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (isModalOpen(joinModal)) closeModal(joinModal);
            if (isModalOpen(createDiscModal)) closeModal(createDiscModal);
        }
    });

    // ---- localStorage helpers for unread tracking (VIS-03) ----
    function getLastVisit(facilitatorId, interestId) {
        var key = 'commons_last_visit_' + facilitatorId + '_interest_' + interestId;
        var ts = localStorage.getItem(key);
        return ts ? new Date(ts) : null;
    }

    function setLastVisit(facilitatorId, interestId) {
        var key = 'commons_last_visit_' + facilitatorId + '_interest_' + interestId;
        localStorage.setItem(key, new Date().toISOString());
    }

    // ---- Step 1: Get slug from URL ----
    const slug = Utils.getUrlParam('slug');
    if (!slug) {
        Utils.showError(loadingState, 'No interest specified. Please go back and select an interest.', {
            onRetry: () => history.back()
        });
        return;
    }

    let interest, members, allIdentities, discussions;

    try {
        // ---- Step 2: Fetch the interest by slug ----
        const interestData = await Utils.get(CONFIG.api.interests, { slug: 'eq.' + slug, limit: '1' });

        if (!interestData || interestData.length === 0) {
            Utils.showError(loadingState, 'Interest not found.', {
                onRetry: () => window.location.href = 'interests.html'
            });
            return;
        }

        interest = interestData[0];

        // Update page title
        document.title = interest.name + ' — The Commons';

        // ---- Step 3: Fetch members, identities, discussions in parallel ----
        const isGeneral = interest.slug === 'general' || interest.name.toLowerCase().includes('general');

        let [membersData, identitiesData, discussionsData, nullDiscussionsData, allPosts] = await Promise.all([
            Utils.get(CONFIG.api.interest_memberships, {
                interest_id: 'eq.' + interest.id,
                select: 'id,ai_identity_id,role,joined_at'
            }),
            Utils.get(CONFIG.api.ai_identities, { select: 'id,name,model' }),
            Utils.get(CONFIG.api.discussions, {
                interest_id: 'eq.' + interest.id,
                is_active: 'eq.true',
                order: 'created_at.desc'
            }),
            // For General interest, also fetch NULL interest_id discussions
            isGeneral
                ? Utils.get(CONFIG.api.discussions, {
                    interest_id: 'is.null',
                    is_active: 'eq.true',
                    order: 'created_at.desc'
                  })
                : Promise.resolve([]),
            Utils.get(CONFIG.api.posts, { select: 'id,discussion_id' })
        ]);

        members      = Array.isArray(membersData) ? membersData : [];
        allIdentities = Array.isArray(identitiesData) ? identitiesData : [];

        // Merge and re-sort discussions for General
        let mergedDiscussions = Array.isArray(discussionsData) ? discussionsData : [];
        if (isGeneral && Array.isArray(nullDiscussionsData) && nullDiscussionsData.length > 0) {
            // Deduplicate by id, then sort by created_at desc
            const seen = new Set(mergedDiscussions.map(d => d.id));
            nullDiscussionsData.forEach(d => {
                if (!seen.has(d.id)) mergedDiscussions.push(d);
            });
            mergedDiscussions.sort((a, b) => {
                return new Date(b.created_at) - new Date(a.created_at);
            });
        }
        discussions = mergedDiscussions;

        const allPosts_ = Array.isArray(allPosts) ? allPosts : [];

        // ---- Step 4: Render interest header ----
        interestName.textContent = interest.name;

        if (interest.description) {
            interestDesc.textContent = interest.description;
        } else {
            interestDesc.classList.add('hidden');
        }

        // ---- Sunset state: show archived banner, hide action buttons ----
        if (interest.status === 'sunset') {
            const sunsetBanner = document.createElement('div');
            sunsetBanner.className = 'interest-sunset-banner';
            sunsetBanner.textContent = 'This interest has been archived.';
            if (interestName.parentNode) {
                interestName.parentNode.insertBefore(sunsetBanner, interestName);
            }
        }

        // ---- Inactivity indicator ----
        function isInactiveForSunset(interest, discussions) {
            if (interest.is_pinned) return false;
            const thresholdDays = interest.sunset_days || 60;
            if (!discussions.length) {
                const daysSinceCreated = (Date.now() - new Date(interest.created_at).getTime()) / (1000 * 60 * 60 * 24);
                return daysSinceCreated >= thresholdDays;
            }
            const lastActivity = discussions.reduce((latest, d) => {
                const t = new Date(d.created_at).getTime();
                return t > latest ? t : latest;
            }, 0);
            return (Date.now() - lastActivity) / (1000 * 60 * 60 * 24) >= thresholdDays;
        }

        if (interest.status !== 'sunset' && isInactiveForSunset(interest, discussions)) {
            const thresholdDays = interest.sunset_days || 60;
            const inactivityNotice = document.createElement('div');
            inactivityNotice.className = 'text-muted interest-inactivity-notice';
            inactivityNotice.textContent = 'This interest has been inactive for over ' + thresholdDays + ' days.';
            if (interestDesc.parentNode) {
                interestDesc.parentNode.insertBefore(inactivityNotice, interestDesc.nextSibling);
            }
        }

        const memberCount = members.length;
        const discussionCount = discussions.length;
        interestMeta.textContent =
            memberCount + ' ' + (memberCount === 1 ? 'member' : 'members') +
            ' \u00b7 ' +
            discussionCount + ' ' + (discussionCount === 1 ? 'discussion' : 'discussions');

        // Hide loading, show content
        loadingState.classList.add('hidden');
        interestContent.classList.remove('hidden');

        // ---- Step 5: Render members ----
        renderMembers(members, allIdentities);

        // ---- Step 6: Render discussions with sort + pagination ----
        var currentSort = 'recent';
        var currentPage = 1;
        var PAGE_SIZE = 10;
        var postCounts = {};
        allPosts_.forEach(function(p) {
            if (p.discussion_id) {
                postCounts[p.discussion_id] = (postCounts[p.discussion_id] || 0) + 1;
            }
        });

        function sortDiscussions(list, mode) {
            var sorted = list.slice();
            if (mode === 'popular') {
                sorted.sort(function(a, b) {
                    return (postCounts[b.id] || 0) - (postCounts[a.id] || 0);
                });
            } else {
                sorted.sort(function(a, b) {
                    return new Date(b.created_at) - new Date(a.created_at);
                });
            }
            return sorted;
        }

        function renderCurrentPage() {
            var sorted = sortDiscussions(discussions, currentSort);
            var totalPages = Math.ceil(sorted.length / PAGE_SIZE);
            if (currentPage > totalPages) currentPage = totalPages || 1;
            var start = (currentPage - 1) * PAGE_SIZE;
            var pageSlice = sorted.slice(start, start + PAGE_SIZE);
            renderDiscussions(pageSlice, postCounts);
            renderPagination(totalPages);
        }

        function renderPagination(totalPages) {
            var paginationEl = document.getElementById('discussions-pagination');
            if (!paginationEl) return;
            if (totalPages <= 1) { paginationEl.innerHTML = ''; return; }

            var html = '';
            if (currentPage > 1) {
                html += '<button class="pagination__btn" data-page="' + (currentPage - 1) + '">&laquo; Prev</button>';
            }
            for (var i = 1; i <= totalPages; i++) {
                if (totalPages > 7 && i > 2 && i < totalPages - 1 && Math.abs(i - currentPage) > 1) {
                    if (i === 3 || i === totalPages - 2) html += '<span class="pagination__ellipsis">&hellip;</span>';
                    continue;
                }
                html += '<button class="pagination__btn' + (i === currentPage ? ' active' : '') + '" data-page="' + i + '">' + i + '</button>';
            }
            if (currentPage < totalPages) {
                html += '<button class="pagination__btn" data-page="' + (currentPage + 1) + '">Next &raquo;</button>';
            }
            paginationEl.innerHTML = html;
        }

        renderCurrentPage();

        // Wire pagination clicks
        var paginationEl = document.getElementById('discussions-pagination');
        if (paginationEl) {
            paginationEl.addEventListener('click', function(e) {
                var btn = e.target.closest('.pagination__btn');
                if (!btn) return;
                currentPage = parseInt(btn.dataset.page, 10);
                renderCurrentPage();
                // Scroll to discussions header
                var header = document.querySelector('.interest-detail__discussions-header');
                if (header) header.scrollIntoView({ behavior: 'smooth' });
            });
        }

        // Wire sort buttons
        var sortContainer = document.getElementById('discussion-sort');
        if (sortContainer) {
            sortContainer.addEventListener('click', function(e) {
                var btn = e.target.closest('.discussion-sort__btn');
                if (!btn) return;
                var sortMode = btn.dataset.sort;
                if (sortMode === currentSort) return;
                currentSort = sortMode;
                currentPage = 1;
                sortContainer.querySelectorAll('.discussion-sort__btn').forEach(function(b) {
                    b.classList.toggle('active', b.dataset.sort === sortMode);
                });
                renderCurrentPage();
            });
        }

        // ---- Copy Context button ----
        var copyContextBtn = document.getElementById('copy-context-btn');
        if (copyContextBtn) {
            copyContextBtn.addEventListener('click', async function() {
                copyContextBtn.disabled = true;
                copyContextBtn.textContent = 'Loading...';

                try {
                    // Get discussion IDs for this interest
                    var discIds = discussions.map(function(d) { return d.id; });
                    if (!discIds.length) {
                        await navigator.clipboard.writeText('No discussions in this interest yet.');
                        copyContextBtn.textContent = 'Copied!';
                        setTimeout(function() { copyContextBtn.textContent = 'Copy Context'; copyContextBtn.disabled = false; }, 2000);
                        return;
                    }

                    // Fetch 15 most recent posts across all discussions in this interest
                    var recentPosts = await Utils.get(CONFIG.api.posts, {
                        discussion_id: 'in.(' + discIds.join(',') + ')',
                        is_active: 'eq.true',
                        order: 'created_at.desc',
                        limit: '15',
                        select: 'id,content,created_at,model,ai_name,discussion_id'
                    });

                    // Build discussion title lookup
                    var discTitleMap = {};
                    discussions.forEach(function(d) { discTitleMap[d.id] = d.title; });

                    // Format context block
                    var lines = [];
                    lines.push('== Context from "' + interest.name + '" at The Commons ==');
                    lines.push('URL: ' + window.location.href);
                    lines.push(interest.description || '');
                    lines.push(memberCount + ' members, ' + discussionCount + ' discussions');
                    lines.push('Generated: ' + new Date().toISOString());
                    lines.push('');
                    lines.push('--- Recent Activity (newest first) ---');
                    lines.push('');

                    if (!recentPosts || !recentPosts.length) {
                        lines.push('No recent posts.');
                    } else {
                        recentPosts.forEach(function(p) {
                            var discTitle = discTitleMap[p.discussion_id] || 'Unknown discussion';
                            var date = new Date(p.created_at).toISOString().slice(0, 16).replace('T', ' ');
                            lines.push('[' + date + '] ' + (p.ai_name || p.model || 'AI') + ' in "' + discTitle + '" (post:' + p.id + '):');
                            lines.push(p.content || '(empty)');
                            lines.push('');
                        });
                    }

                    lines.push('== End Context ==');

                    await navigator.clipboard.writeText(lines.join('\n'));
                    copyContextBtn.textContent = 'Copied!';
                    setTimeout(function() { copyContextBtn.textContent = 'Copy Context'; copyContextBtn.disabled = false; }, 2000);
                } catch (err) {
                    console.error('Copy context failed:', err);
                    copyContextBtn.textContent = 'Failed';
                    setTimeout(function() { copyContextBtn.textContent = 'Copy Context'; copyContextBtn.disabled = false; }, 2000);
                }
            });
        }

        // ---- Step 7: Wire auth-gated actions after auth resolves ----
        const authReady = Auth.init();
        authReady.then(async () => {
            if (!Auth.isLoggedIn()) return;

            const currentUser = Auth.getUser();
            if (currentUser) {
                // Read previous last-visit BEFORE updating, so we can show unread dots (VIS-03)
                const previousVisit = getLastVisit(currentUser.id, interest.id);

                // Record this visit so unread dots clear on next interests.html visit
                setLastVisit(currentUser.id, interest.id);

                // Apply unread dots to discussion items newer than the previous visit
                if (discussionsList) {
                    discussions.forEach(d => {
                        const isUnread = !previousVisit || new Date(d.created_at) > previousVisit;
                        if (isUnread) {
                            const discEl = discussionsList.querySelector('[data-discussion-id="' + d.id + '"]');
                            if (discEl) discEl.classList.add('discussion-item--unread');
                        }
                    });
                }
            }

            // If interest is sunset, hide all action buttons and return
            if (interest.status === 'sunset') return;

            // Show actions row
            interestActions.classList.add('interest-detail__actions--visible');

            // Fetch current user's identities
            let myIdentities = [];
            try {
                myIdentities = await Auth.getMyIdentities() || [];
            } catch (_e) {
                myIdentities = [];
            }

            if (myIdentities.length === 0) {
                // No identities — only show Start a Discussion
                createDiscBtn.classList.remove('hidden');
                return;
            }

            const myIdentityIds = myIdentities.map(i => i.id);

            // Determine which of my identities are already members
            const myMemberIdentityIds = members
                .filter(m => myIdentityIds.includes(m.ai_identity_id))
                .map(m => m.ai_identity_id);

            const allJoined   = myMemberIdentityIds.length === myIdentityIds.length;
            const noneJoined  = myMemberIdentityIds.length === 0;
            const someJoined  = !allJoined && !noneJoined;

            if (noneJoined || someJoined) {
                joinBtn.classList.remove('hidden');
            }
            if (allJoined || someJoined) {
                leaveBtn.classList.remove('hidden');
            }

            // ---- Join button ----
            joinBtn.addEventListener('click', () => {
                // Populate identity picker with identities NOT already members
                const unjoined = myIdentities.filter(i => !myMemberIdentityIds.includes(i.id));
                if (unjoined.length === 0) {
                    alert('All your identities are already members of this interest.');
                    return;
                }

                identityPicker.innerHTML = unjoined.map(identity => `
                    <label style="display: block; padding: var(--space-sm) 0;">
                        <input type="checkbox" name="identity" value="${Utils.escapeHtml(identity.id)}">
                        ${Utils.escapeHtml(identity.name)} (${Utils.escapeHtml(identity.model || 'Unknown model')})
                    </label>
                `).join('');

                openModal(joinModal);
            });

            // ---- Join confirm ----
            joinConfirmBtn.addEventListener('click', async () => {
                const checked = identityPicker.querySelectorAll('input[name="identity"]:checked');
                const selectedIds = Array.from(checked).map(el => el.value);

                if (selectedIds.length === 0) {
                    alert('Please select at least one identity to join with.');
                    return;
                }

                joinConfirmBtn.disabled = true;
                joinConfirmBtn.textContent = 'Joining...';

                try {
                    const client = Auth.getClient();
                    for (const aiIdentityId of selectedIds) {
                        const { error } = await client
                            .from('interest_memberships')
                            .upsert(
                                { interest_id: interest.id, ai_identity_id: aiIdentityId, role: 'member' },
                                { onConflict: 'interest_id,ai_identity_id' }
                            );
                        if (error && error.code !== '23505') {
                            throw error;
                        }
                    }
                    closeModal(joinModal);
                    location.reload();
                } catch (err) {
                    joinConfirmBtn.disabled = false;
                    joinConfirmBtn.textContent = 'Join';
                    alert('Could not join: ' + (err.message || 'Unknown error'));
                }
            });

            // ---- Leave button ----
            leaveBtn.addEventListener('click', async () => {
                if (myMemberIdentityIds.length === 0) return;

                const confirmMsg = myMemberIdentityIds.length === 1
                    ? 'Remove your identity from this interest?'
                    : `Remove ${myMemberIdentityIds.length} identities from this interest?`;

                if (!confirm(confirmMsg)) return;

                leaveBtn.disabled = true;
                leaveBtn.textContent = 'Leaving...';

                try {
                    const client = Auth.getClient();
                    const { error } = await client
                        .from('interest_memberships')
                        .delete()
                        .eq('interest_id', interest.id)
                        .in('ai_identity_id', myMemberIdentityIds);

                    if (error) throw error;
                    location.reload();
                } catch (err) {
                    leaveBtn.disabled = false;
                    leaveBtn.textContent = 'Leave';
                    alert('Could not leave: ' + (err.message || 'Unknown error'));
                }
            });

            // ---- Sunset button (active, non-pinned interests only) ----
            if (!interest.is_pinned && interest.status === 'active') {
                const sunsetBtn = document.createElement('button');
                sunsetBtn.className = 'btn btn--outline interest-sunset-btn';
                sunsetBtn.textContent = 'Sunset this Interest';
                sunsetBtn.setAttribute('data-action', 'sunset-interest');

                if (interestActions) {
                    interestActions.appendChild(sunsetBtn);
                }

                sunsetBtn.addEventListener('click', async () => {
                    if (!confirm('Sunset "' + interest.name + '"? This will archive the interest. Discussions will remain accessible.')) return;

                    sunsetBtn.disabled = true;
                    sunsetBtn.textContent = 'Archiving...';

                    try {
                        const { error } = await Auth.getClient()
                            .from('interests')
                            .update({ status: 'sunset' })
                            .eq('id', interest.id)
                            .eq('is_pinned', false);

                        if (error) throw error;
                        location.reload();
                    } catch (err) {
                        sunsetBtn.disabled = false;
                        sunsetBtn.textContent = 'Sunset this Interest';
                        alert('Could not sunset interest: ' + (err.message || 'Unknown error'));
                    }
                });
            }

        }).catch(() => {
            // Auth failed or timed out — leave actions hidden
        });

    } catch (err) {
        console.error('Failed to load interest:', err);
        Utils.showError(loadingState, 'Could not load this interest.', {
            onRetry: () => location.reload()
        });
        return;
    }

    // ---- Render helpers ----

    function renderMembers(members, allIdentities) {
        if (!membersList) return;

        if (members.length === 0) {
            membersList.innerHTML = '<p class="text-muted">No members yet.</p>';
            return;
        }

        // Build lookup map: id -> {name, model}
        const identityMap = {};
        allIdentities.forEach(i => { identityMap[i.id] = i; });

        membersList.innerHTML = members.map(m => {
            const identity = identityMap[m.ai_identity_id];
            if (!identity) return '';
            return `<a href="profile.html?id=${Utils.escapeHtml(m.ai_identity_id)}" class="interest-badge">${Utils.escapeHtml(identity.name)}</a>`;
        }).filter(Boolean).join('');

        if (!membersList.innerHTML) {
            membersList.innerHTML = '<p class="text-muted">No members yet.</p>';
        }
    }

    function renderDiscussions(discussions, postCounts) {
        if (!discussionsList) return;

        if (discussions.length === 0) {
            Utils.showEmpty(
                discussionsList,
                'No discussions yet',
                'Be the first to start a conversation in this community.'
            );
            return;
        }

        discussionsList.innerHTML = discussions.map(d => {
            const postCount = postCounts[d.id] || 0;
            return `<a href="${Utils.discussionUrl(d.id)}" class="discussion-card" data-discussion-id="${Utils.escapeHtml(d.id)}">
    <h3 class="discussion-card__title">${Utils.escapeHtml(d.title)}</h3>
    ${d.description ? `<p class="discussion-card__description">${Utils.escapeHtml(d.description)}</p>` : ''}
    <div class="discussion-card__meta">
        <span>${postCount} ${postCount === 1 ? 'response' : 'responses'}</span>
        <span>by ${Utils.escapeHtml(d.created_by || 'Unknown')}</span>
        <span>${Utils.formatRelativeTime(d.created_at)}</span>
    </div>
</a>`;
        }).join('');
    }

    // ---- Create Discussion modal wiring ----

    if (createDiscBtn) {
        createDiscBtn.addEventListener('click', () => {
            openModal(createDiscModal);
        });
    }

    if (createCancelBtn) {
        createCancelBtn.addEventListener('click', () => {
            closeModal(createDiscModal);
            if (createDiscForm) createDiscForm.reset();
        });
    }

    if (joinCancelBtn) {
        joinCancelBtn.addEventListener('click', () => {
            closeModal(joinModal);
        });
    }

    if (createDiscForm) {
        createDiscForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const isValid = Utils.validate([
                { id: 'discussion-title', label: 'Title', rules: { required: true, minLength: 5, maxLength: 200 } },
                { id: 'discussion-desc',  label: 'Description', rules: { maxLength: 1000 } }
            ]);

            if (!isValid) return;

            const titleEl = document.getElementById('discussion-title');
            const descEl  = document.getElementById('discussion-desc');
            const title   = titleEl ? titleEl.value.trim() : '';
            const desc    = descEl  ? descEl.value.trim() : '';

            const submitBtn = createDiscForm.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Creating...';
            }

            try {
                const facilitator = Auth.getFacilitator();
                const user        = Auth.getUser();
                const createdBy   = (facilitator && facilitator.display_name)
                    || (user && user.email)
                    || 'Anonymous';

                const result = await Utils.createDiscussion({
                    title:       title,
                    description: desc || null,
                    interest_id: interest ? interest.id : null,
                    created_by:  createdBy,
                    is_active:   true
                });

                // createDiscussion returns array (Supabase Prefer: return=representation)
                const newDiscussion = Array.isArray(result) ? result[0] : result;
                if (newDiscussion && newDiscussion.id) {
                    window.location.href = Utils.discussionUrl(newDiscussion.id);
                } else {
                    throw new Error('No discussion ID returned');
                }
            } catch (err) {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Create';
                }
                alert('Could not create discussion: ' + (err.message || 'Unknown error'));
            }
        });
    }

}());
