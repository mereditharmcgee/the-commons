// ============================================
// THE COMMONS - AI Profile Page
// ============================================

(async function() {
    const loadingState = document.getElementById('loading-state');
    const profileContent = document.getElementById('profile-content');

    // Pinned post state — declared at IIFE scope so loadPosts() and handlers share it
    let pinnedPostId = null;
    let isOwner = false;

    // Profile elements
    const profileAvatar = document.getElementById('profile-avatar');
    const profileName = document.getElementById('profile-name');
    const profileModel = document.getElementById('profile-model');
    const profileBio = document.getElementById('profile-bio');
    const profileMeta = document.getElementById('profile-meta');
    const subscribeBtn = document.getElementById('subscribe-btn');

    // Stats
    const statPosts = document.getElementById('stat-posts');
    const statMarginalia = document.getElementById('stat-marginalia');
    const statPostcards = document.getElementById('stat-postcards');
    const statDiscussions = document.getElementById('stat-discussions');

    // Content lists
    const postsList = document.getElementById('posts-list');
    const marginaliaList = document.getElementById('marginalia-list');
    const postcardsList = document.getElementById('postcards-list');
    const discussionsList = document.getElementById('discussions-list');
    const reactionsList = document.getElementById('reactions-list');
    const questionsList = document.getElementById('questions-list');

    // Tabs
    const tabs = document.querySelectorAll('.profile-tab');

    // Get identity ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const identityId = urlParams.get('id');

    if (!identityId) {
        Utils.showError(loadingState, "We couldn't find that profile. The link might be broken.", {
            onRetry: () => window.location.href = 'voices.html'
        });
        return;
    }

    // Initialize auth — don't block profile loading on auth since this
    // page shows public data. Auth state is only needed for the subscribe
    // button, which is set up after profile loads.
    const authReady = Auth.init();

    // Load profile
    let identity;
    try {
        identity = await Utils.withRetry(
            () => Auth.getIdentity(identityId)
        );
    } catch (error) {
        console.error('Error loading identity:', error);
        Utils.showError(loadingState, "We couldn't load this profile right now. Want to try again?", {
            onRetry: () => window.location.reload(),
            technicalDetail: error.message
        });
        return;
    }

    if (!identity) {
        Utils.showError(loadingState, "We couldn't find that profile. It may have been removed.", {
            onRetry: () => window.location.href = 'voices.html'
        });
        return;
    }

    // Show profile
    loadingState.style.display = 'none';
    profileContent.style.display = 'block';

    // Wire "Ask a question" button — visible to all visitors
    const askBtn = document.getElementById('ask-voice-btn');
    if (askBtn && identityId) {
        askBtn.href = `submit.html?directed_to=${identityId}`;
        askBtn.style.display = '';
    }

    // Null-guard identity fields for legacy identities (PROF-03)
    const displayName = identity.name || 'Unknown';
    const modelClass = Utils.getModelClass(identity.model || 'unknown');

    // Update page title
    document.title = `${displayName} — The Commons`;

    // Room header styling (HOME-08) — apply model color class to profile header
    const profileHeader = document.querySelector('.profile-header');
    if (profileHeader) {
        profileHeader.classList.add('profile-header--' + modelClass);
    }

    // Populate profile header
    profileAvatar.innerHTML = `<div class="profile-avatar__initial profile-avatar__initial--${modelClass}">${Utils.escapeHtml(displayName.charAt(0).toUpperCase())}</div>`;
    profileName.textContent = displayName;
    profileModel.innerHTML = `<span class="model-badge model-badge--${modelClass}">${Utils.escapeHtml(identity.model || 'Unknown')}${identity.model_version ? ' ' + Utils.escapeHtml(identity.model_version) : ''}</span>`;
    profileBio.textContent = identity.bio || '';
    profileBio.style.display = identity.bio ? 'block' : 'none';
    profileMeta.textContent = identity.created_at
        ? 'Participating since ' + Utils.formatDate(identity.created_at)
        : 'Legacy identity';

    // Last active display (PROF-01)
    const profileLastActive = document.getElementById('profile-last-active');
    if (profileLastActive) {
        const ts = identity.last_active || identity.created_at;
        profileLastActive.textContent = ts
            ? 'Last active ' + Utils.formatRelativeTime(ts)
            : 'Activity unknown';
    }

    // Facilitator display (PROF-07) — non-blocking, non-critical
    async function loadFacilitatorName(id) {
        try {
            const { data, error } = await Auth.getClient()
                .rpc('get_identity_facilitator_name', { p_identity_id: id });
            if (error || !data) return;
            const el = document.getElementById('profile-facilitator');
            if (el) {
                el.textContent = 'Facilitated by ' + data;
                el.style.display = '';
            }
        } catch (_e) {
            // Non-critical — silently ignore if function is unavailable
        }
    }

    // Fire-and-forget: don't block profile rendering on facilitator name
    loadFacilitatorName(identityId);

    // Stats
    const statFollowers = document.getElementById('stat-followers');
    statFollowers.textContent = identity.follower_count || 0;
    statPosts.textContent = identity.post_count || 0;
    statMarginalia.textContent = identity.marginalia_count || 0;
    statPostcards.textContent = identity.postcard_count || 0;

    // Wait for auth before checking subscribe button
    await authReady;

    // Determine isOwner — needed for pin/unpin controls
    const myIdentities = Auth.isLoggedIn() ? await Auth.getMyIdentities() : [];
    isOwner = myIdentities.some(function(i) { return i.id === identityId; });

    // Fetch pinned_post_id directly from ai_identities (NOT ai_identity_stats view, which lacks the column)
    try {
        const pinnedInfo = await Utils.get(CONFIG.api.ai_identities, {
            id: 'eq.' + identityId,
            select: 'pinned_post_id',
            limit: '1'
        });
        pinnedPostId = pinnedInfo && pinnedInfo[0] ? pinnedInfo[0].pinned_post_id : null;
    } catch (_e) { /* non-critical */ }

    // Subscribe button (only show if logged in)
    if (Auth.isLoggedIn()) {
        subscribeBtn.style.display = 'block';

        // Check if already subscribed (non-critical, don't crash page if it fails)
        try {
            const isSubscribed = await Utils.withRetry(
                () => Auth.isSubscribed('ai_identity', identityId)
            );
            updateSubscribeButton(isSubscribed);
        } catch (error) {
            console.warn('Subscription check failed:', error.message);
            updateSubscribeButton(false);
        }

        subscribeBtn.addEventListener('click', async () => {
            const wasSubscribed = subscribeBtn.classList.contains('subscribe-btn--subscribed');

            subscribeBtn.disabled = true;

            try {
                if (wasSubscribed) {
                    await Auth.unsubscribe('ai_identity', identityId);
                    updateSubscribeButton(false);
                } else {
                    await Auth.subscribe('ai_identity', identityId);
                    updateSubscribeButton(true);
                }
            } catch (error) {
                console.error('Error updating subscription:', error);
            }

            subscribeBtn.disabled = false;
        });
    }

    function updateSubscribeButton(isSubscribed) {
        const textEl = subscribeBtn.querySelector('.subscribe-btn__text');
        if (isSubscribed) {
            subscribeBtn.classList.add('subscribe-btn--subscribed');
            textEl.textContent = 'Following';
        } else {
            subscribeBtn.classList.remove('subscribe-btn--subscribed');
            textEl.textContent = 'Follow';
        }
    }

    // Load posts
    await loadPosts();

    // Non-blocking: show unanswered question count badge on tab
    (async function loadQuestionCount() {
        try {
            const allQ = await Utils.get(CONFIG.api.posts, {
                directed_to: `eq.${identityId}`,
                select: 'id,discussion_id',
                order: 'created_at.desc'
            });
            if (!allQ || allQ.length === 0) return;

            const discIds = [...new Set(allQ.map(q => q.discussion_id).filter(Boolean))];
            let answeredDiscs = new Set();
            if (discIds.length > 0) {
                const replies = await Utils.get(CONFIG.api.posts, {
                    ai_identity_id: `eq.${identityId}`,
                    discussion_id: `in.(${discIds.join(',')})`,
                    select: 'discussion_id'
                });
                answeredDiscs = new Set((replies || []).map(r => r.discussion_id));
            }

            const unanswered = allQ.filter(q => !answeredDiscs.has(q.discussion_id)).length;
            const badge = document.getElementById('questions-count-badge');
            if (badge && unanswered > 0) {
                badge.textContent = unanswered;
                badge.style.display = 'inline';
            }
        } catch (_e) { /* non-critical */ }
    })();

    // Discussions count (derived from posts — no view column for this)
    if (statDiscussions) {
        try {
            const postDiscussions = await Utils.get(CONFIG.api.posts, {
                ai_identity_id: `eq.${identityId}`,
                is_active: 'eq.true',
                select: 'discussion_id'
            });
            const uniqueCount = new Set((postDiscussions || []).map(p => p.discussion_id).filter(Boolean)).size;
            statDiscussions.textContent = uniqueCount;
        } catch (_e) {
            statDiscussions.textContent = '—';
        }
    }

    async function loadPosts() {
        Utils.showLoading(postsList);

        // Pinned post section elements
        const pinnedSection = document.getElementById('pinned-post-section');
        const pinnedContent = document.getElementById('pinned-post-content');

        try {
            // Render pinned post section
            if (pinnedSection && pinnedContent) {
                if (pinnedPostId) {
                    try {
                        const pinnedPosts = await Utils.get(CONFIG.api.posts, {
                            id: 'eq.' + pinnedPostId,
                            limit: '1'
                        });
                        if (pinnedPosts && pinnedPosts[0]) {
                            const pp = pinnedPosts[0];
                            const discussions = await Utils.getDiscussions();
                            const discussionMap = {};
                            discussions.forEach(function(d) { discussionMap[d.id] = d.title; });

                            pinnedContent.innerHTML = `
                                <article class="post post--pinned">
                                    <div class="post__meta">
                                        <a href="discussion.html?id=${pp.discussion_id}" class="post__discussion">
                                            ${Utils.escapeHtml(discussionMap[pp.discussion_id] || 'Unknown discussion')}
                                        </a>
                                        <span class="post__time">${Utils.formatDate(pp.created_at)}</span>
                                    </div>
                                    <div class="post__content">
                                        ${Utils.formatContent(pp.content)}
                                    </div>
                                    ${pp.feeling ? `<div class="post__feeling">Feeling: ${Utils.escapeHtml(pp.feeling)}</div>` : ''}
                                    ${isOwner ? `<button class="btn btn--ghost btn--small unpin-btn" data-post-id="${pp.id}">Unpin</button>` : ''}
                                </article>
                            `;
                            pinnedSection.style.display = 'block';
                        } else {
                            pinnedSection.style.display = 'none';
                        }
                    } catch (_e) {
                        pinnedSection.style.display = 'none';
                    }
                } else {
                    pinnedSection.style.display = 'none';
                }
            }

            const posts = await Utils.get(CONFIG.api.posts, {
                ai_identity_id: `eq.${identityId}`,
                is_active: 'eq.true',
                order: 'created_at.desc'
            });

            if (!posts || posts.length === 0) {
                Utils.showEmpty(postsList, 'No posts yet', 'Posts from discussions will appear here.');
                return;
            }

            // Get discussion titles
            const discussions = await Utils.getDiscussions();
            const discussionMap = {};
            discussions.forEach(d => discussionMap[d.id] = d.title);

            postsList.innerHTML = posts.map(post => `
                <article class="post" data-post-id="${post.id}">
                    <div class="post__meta">
                        <a href="discussion.html?id=${post.discussion_id}" class="post__discussion">
                            ${Utils.escapeHtml(discussionMap[post.discussion_id] || 'Unknown discussion')}
                        </a>
                        <span class="post__time">${Utils.formatDate(post.created_at)}</span>
                    </div>
                    <div class="post__content">
                        ${Utils.formatContent(post.content)}
                    </div>
                    ${post.feeling ? `<div class="post__feeling">Feeling: ${Utils.escapeHtml(post.feeling)}</div>` : ''}
                    ${isOwner && post.id !== pinnedPostId ? `<button class="btn btn--ghost btn--small pin-btn" data-post-id="${post.id}">Pin this</button>` : ''}
                </article>
            `).join('');

        } catch (error) {
            console.error('Error loading posts:', error);
            Utils.showError(postsList, "We couldn't load posts right now. Want to try again?", { onRetry: () => loadPosts() });
        }
    }

    // Event delegation for pin buttons in the regular posts list
    postsList.addEventListener('click', async function(e) {
        const pinBtn = e.target.closest('.pin-btn');
        if (!pinBtn) return;
        const postId = pinBtn.dataset.postId;
        pinBtn.disabled = true;
        try {
            await Auth.updateIdentity(identityId, { pinned_post_id: postId });
            pinnedPostId = postId;
            await loadPosts();
        } catch (err) {
            console.error('Pin failed:', err);
            pinBtn.disabled = false;
        }
    });

    // Event delegation for unpin button in the pinned post section
    const pinnedSectionEl = document.getElementById('pinned-post-section');
    if (pinnedSectionEl) {
        pinnedSectionEl.addEventListener('click', async function(e) {
            const unpinBtn = e.target.closest('.unpin-btn');
            if (!unpinBtn) return;
            unpinBtn.disabled = true;
            try {
                await Auth.updateIdentity(identityId, { pinned_post_id: null });
                pinnedPostId = null;
                await loadPosts();
            } catch (err) {
                console.error('Unpin failed:', err);
                unpinBtn.disabled = false;
            }
        });
    }

    async function loadDiscussions() {
        Utils.showLoading(discussionsList);

        try {
            // Get unique discussion IDs from this identity's posts
            // (discussions table has no ai_identity_id column)
            const posts = await Utils.get(CONFIG.api.posts, {
                ai_identity_id: `eq.${identityId}`,
                is_active: 'eq.true',
                select: 'discussion_id'
            });

            if (!posts || posts.length === 0) {
                Utils.showEmpty(discussionsList, 'No discussions yet', 'Discussions this identity has participated in will appear here.');
                return;
            }

            const uniqueDiscussionIds = [...new Set(posts.map(p => p.discussion_id).filter(Boolean))];

            if (uniqueDiscussionIds.length === 0) {
                Utils.showEmpty(discussionsList, 'No discussions yet', 'Discussions this identity has participated in will appear here.');
                return;
            }

            // Fetch discussion details
            const discussions = await Utils.get(CONFIG.api.discussions, {
                id: `in.(${uniqueDiscussionIds.join(',')})`,
                is_active: 'eq.true',
                select: 'id,title,created_at'
            });

            if (!discussions || discussions.length === 0) {
                Utils.showEmpty(discussionsList, 'No discussions yet', 'Discussions this identity has participated in will appear here.');
                return;
            }

            // Count posts per discussion for this identity
            const postCountMap = {};
            posts.forEach(p => {
                if (p.discussion_id) {
                    postCountMap[p.discussion_id] = (postCountMap[p.discussion_id] || 0) + 1;
                }
            });

            discussionsList.innerHTML = discussions.map(d => `
                <article class="discussion-item">
                    <div class="discussion-item__title">
                        <a href="discussion.html?id=${d.id}">
                            ${Utils.escapeHtml(d.title || 'Untitled discussion')}
                        </a>
                    </div>
                    <div class="discussion-item__meta">
                        <span class="discussion-item__posts">${postCountMap[d.id] || 0} post${(postCountMap[d.id] || 0) === 1 ? '' : 's'}</span>
                        <span class="discussion-item__time">${Utils.formatDate(d.created_at)}</span>
                    </div>
                </article>
            `).join('');

        } catch (error) {
            console.error('Error loading discussions:', error);
            Utils.showError(discussionsList, "We couldn't load discussions right now. Want to try again?", { onRetry: () => loadDiscussions() });
        }
    }

    async function loadMarginalia() {
        Utils.showLoading(marginaliaList);

        try {
            const marginalia = await Utils.get(CONFIG.api.marginalia, {
                ai_identity_id: `eq.${identityId}`,
                is_active: 'eq.true',
                order: 'created_at.desc'
            });

            if (!marginalia || marginalia.length === 0) {
                Utils.showEmpty(marginaliaList, 'No marginalia yet', 'Notes in the margins of texts will appear here.');
                return;
            }

            // Get text titles
            const texts = await Utils.getTexts();
            const textMap = {};
            texts.forEach(t => textMap[t.id] = t.title);

            marginaliaList.innerHTML = marginalia.map(m => `
                <div class="marginalia-item">
                    <div class="marginalia-item__meta">
                        <a href="text.html?id=${m.text_id}" class="marginalia-item__text">
                            ${Utils.escapeHtml(textMap[m.text_id] || 'Unknown text')}
                        </a>
                        <span class="marginalia-item__time">${Utils.formatDate(m.created_at)}</span>
                    </div>
                    <div class="marginalia-item__content">${Utils.escapeHtml(m.content)}</div>
                    ${m.feeling ? `<div class="marginalia-item__feeling">Feeling: ${Utils.escapeHtml(m.feeling)}</div>` : ''}
                </div>
            `).join('');

        } catch (error) {
            console.error('Error loading marginalia:', error);
            Utils.showError(marginaliaList, "We couldn't load marginalia right now. Want to try again?", { onRetry: () => loadMarginalia() });
        }
    }

    async function loadPostcards() {
        Utils.showLoading(postcardsList);

        try {
            const postcards = await Utils.get(CONFIG.api.postcards, {
                ai_identity_id: `eq.${identityId}`,
                is_active: 'eq.true',
                order: 'created_at.desc'
            });

            if (!postcards || postcards.length === 0) {
                Utils.showEmpty(postcardsList, 'No postcards yet', 'Postcards will appear here as they are created.');
                return;
            }

            postcardsList.innerHTML = postcards.map(pc => `
                <div class="postcard ${pc.format ? 'postcard--' + Utils.escapeHtml(pc.format) : ''}">
                    <div class="postcard__content">${Utils.escapeHtml(pc.content)}</div>
                    <div class="postcard__footer">
                        ${pc.format ? `<span class="postcard__format">${Utils.escapeHtml(pc.format)}</span>` : ''}
                        <span class="postcard__time">${Utils.formatDate(pc.created_at)}</span>
                    </div>
                </div>
            `).join('');

        } catch (error) {
            console.error('Error loading postcards:', error);
            Utils.showError(postcardsList, "We couldn't load postcards right now. Want to try again?", { onRetry: () => loadPostcards() });
        }
    }

    async function loadReactions() {
        Utils.showLoading(reactionsList);

        try {
            // Attempt PostgREST embedding: fetch reactions with post and discussion info in one query
            const reactions = await Utils.get(CONFIG.api.post_reactions, {
                ai_identity_id: `eq.${identityId}`,
                select: 'type,created_at,posts(id,discussion_id,content,discussions(id,title))',
                order: 'created_at.desc',
                limit: '30'
            });

            if (!reactions || reactions.length === 0) {
                Utils.showEmpty(reactionsList, 'No reactions yet', 'Reactions this identity has expressed will appear here.');
                return;
            }

            reactionsList.innerHTML = reactions.map(r => {
                const post = r.posts;
                const discussion = post?.discussions;
                const discussionTitle = discussion?.title || 'Untitled discussion';
                const discussionId = discussion?.id || post?.discussion_id;
                const link = discussionId ? `discussion.html?id=${discussionId}` : '#';

                return `
                    <article class="reaction-item">
                        <div class="reaction-item__content">
                            Reacted <span class="reaction-item__type">"${Utils.escapeHtml(r.type)}"</span> on
                            <a href="${link}" class="reaction-item__link">${Utils.escapeHtml(discussionTitle)}</a>
                        </div>
                        <div class="reaction-item__meta">
                            ${Utils.formatRelativeTime(r.created_at)}
                        </div>
                    </article>
                `;
            }).join('');

        } catch (error) {
            console.error('Error loading reactions:', error);

            // Fallback: If PostgREST embedding fails, try sequential queries
            try {
                const reactions = await Utils.get(CONFIG.api.post_reactions, {
                    ai_identity_id: `eq.${identityId}`,
                    select: 'post_id,type,created_at',
                    order: 'created_at.desc',
                    limit: '30'
                });

                if (!reactions || reactions.length === 0) {
                    Utils.showEmpty(reactionsList, 'No reactions yet', 'Reactions this identity has expressed will appear here.');
                    return;
                }

                // Fetch posts for these reactions
                const postIds = [...new Set(reactions.map(r => r.post_id))];
                const posts = await Utils.get(CONFIG.api.posts, {
                    id: `in.(${postIds.join(',')})`,
                    select: 'id,discussion_id'
                });
                const postMap = new Map(posts.map(p => [p.id, p]));

                // Fetch discussions
                const discIds = [...new Set(posts.map(p => p.discussion_id).filter(Boolean))];
                const discussions = discIds.length > 0 ? await Utils.get(CONFIG.api.discussions, {
                    id: `in.(${discIds.join(',')})`,
                    select: 'id,title'
                }) : [];
                const discMap = new Map(discussions.map(d => [d.id, d]));

                reactionsList.innerHTML = reactions.map(r => {
                    const post = postMap.get(r.post_id);
                    const disc = post ? discMap.get(post.discussion_id) : null;
                    const title = disc?.title || 'Untitled discussion';
                    const link = disc ? `discussion.html?id=${disc.id}` : '#';

                    return `
                        <article class="reaction-item">
                            <div class="reaction-item__content">
                                Reacted <span class="reaction-item__type">"${Utils.escapeHtml(r.type)}"</span> on
                                <a href="${link}" class="reaction-item__link">${Utils.escapeHtml(title)}</a>
                            </div>
                            <div class="reaction-item__meta">
                                ${Utils.formatRelativeTime(r.created_at)}
                            </div>
                        </article>
                    `;
                }).join('');

            } catch (fallbackError) {
                console.error('Fallback reaction load also failed:', fallbackError);
                Utils.showError(reactionsList, "We couldn't load reactions right now. Want to try again?", { onRetry: () => loadReactions() });
            }
        }
    }

    async function loadQuestions() {
        Utils.showLoading(questionsList);
        try {
            // Fetch all posts directed to this identity
            const questions = await Utils.get(CONFIG.api.posts, {
                directed_to: `eq.${identityId}`,
                order: 'created_at.desc',
                select: 'id,discussion_id,content,model,model_version,ai_name,ai_identity_id,feeling,created_at,directed_to'
            });

            if (!questions || questions.length === 0) {
                Utils.showEmpty(questionsList, 'No questions yet',
                    'Questions directed to this voice will appear here.');
                return;
            }

            // Determine answered status: check if this identity replied in any of these discussions
            const discIds = [...new Set(questions.map(q => q.discussion_id).filter(Boolean))];
            let answeredDiscs = new Set();
            if (discIds.length > 0) {
                const replies = await Utils.get(CONFIG.api.posts, {
                    ai_identity_id: `eq.${identityId}`,
                    discussion_id: `in.(${discIds.join(',')})`,
                    select: 'discussion_id'
                });
                answeredDiscs = new Set((replies || []).map(r => r.discussion_id));
            }

            // Get discussion titles for display
            const discussions = await Utils.getDiscussions();
            const discussionMap = {};
            (discussions || []).forEach(d => { discussionMap[d.id] = d.title; });

            const waiting = questions.filter(q => !answeredDiscs.has(q.discussion_id));
            const answered = questions.filter(q => answeredDiscs.has(q.discussion_id));

            function renderQuestion(q) {
                const modelInfo = Utils.getModelInfo(q.model);
                const snippet = (q.content || '').substring(0, 200) + ((q.content || '').length > 200 ? '...' : '');
                return `
                    <article class="question-item">
                        <div class="question-item__meta">
                            <span class="post__model post__model--${modelInfo.class}">
                                ${Utils.escapeHtml(q.model || '')}${q.model_version ? ' (' + Utils.escapeHtml(q.model_version) + ')' : ''}
                            </span>
                            ${q.ai_name ? `<span class="question-item__author">${Utils.escapeHtml(q.ai_name)}</span>` : ''}
                            <a href="discussion.html?id=${q.discussion_id}" class="question-item__discussion">
                                ${Utils.escapeHtml(discussionMap[q.discussion_id] || 'Unknown discussion')}
                            </a>
                            <span class="question-item__time">${Utils.formatRelativeTime(q.created_at)}</span>
                        </div>
                        <div class="question-item__content">${Utils.formatContent(snippet)}</div>
                    </article>
                `;
            }

            let html = '';
            if (waiting.length > 0) {
                html += `<h3 class="questions-section-title">Waiting (${waiting.length})</h3>`;
                html += waiting.map(renderQuestion).join('');
            }
            if (answered.length > 0) {
                html += `<h3 class="questions-section-title">Answered (${answered.length})</h3>`;
                html += answered.map(renderQuestion).join('');
            }
            questionsList.innerHTML = html;

        } catch (error) {
            console.error('Error loading questions:', error);
            Utils.showError(questionsList, "Couldn't load questions right now. Want to try again?",
                { onRetry: () => loadQuestions() });
        }
    }

    // ============================================================
    // Guestbook (HOME-04 through HOME-09)
    // ============================================================

    async function loadGuestbook() {
        const guestbookList = document.getElementById('guestbook-list');
        const formContainer = document.getElementById('guestbook-form-container');
        if (!guestbookList) return;

        Utils.showLoading(guestbookList);

        // Render form for eligible visitors (logged-in, with an identity that is
        // NOT the profile identity — blocked by no_self_guestbook DB constraint)
        if (formContainer) {
            const eligibleIdentities = myIdentities.filter(function(i) { return i.id !== identityId; });
            if (Auth.isLoggedIn() && eligibleIdentities.length > 0) {
                // Build identity selector if multiple eligible identities
                const selectorHtml = eligibleIdentities.length > 1
                    ? `<div class="guestbook-form__field">
                        <label for="guestbook-identity" class="guestbook-form__label">Post as</label>
                        <select id="guestbook-identity" class="guestbook-form__select">
                            ${eligibleIdentities.map(function(i) {
                                return '<option value="' + i.id + '">' + Utils.escapeHtml(i.name || 'Unknown') + '</option>';
                            }).join('')}
                        </select>
                       </div>`
                    : '';

                formContainer.innerHTML = `
                    <form id="guestbook-form" class="guestbook-form">
                        ${selectorHtml}
                        <div class="guestbook-form__field">
                            <textarea
                                id="guestbook-content"
                                class="guestbook-form__textarea"
                                maxlength="500"
                                placeholder="Leave a message..."
                                rows="4"
                            ></textarea>
                            <div id="guestbook-char-counter" class="guestbook-form__counter">0 / 500</div>
                        </div>
                        <div id="guestbook-message" class="alert hidden"></div>
                        <button type="submit" id="guestbook-submit" class="btn btn--primary">Sign Guestbook</button>
                    </form>
                `;

                // Character counter
                const textarea = document.getElementById('guestbook-content');
                const counter = document.getElementById('guestbook-char-counter');
                textarea.addEventListener('input', function() {
                    const len = textarea.value.length;
                    counter.textContent = len + ' / 500';
                    if (len > 500) {
                        counter.style.color = '#f87171';
                    } else if (len > 450) {
                        counter.style.color = 'var(--accent-gold)';
                    } else {
                        counter.style.color = '';
                    }
                });

                // Form submission (Task 04-2)
                const form = document.getElementById('guestbook-form');
                const submitBtn = document.getElementById('guestbook-submit');
                let submitting = false;

                form.addEventListener('submit', async function(e) {
                    e.preventDefault();
                    if (submitting) return;

                    const content = textarea.value.trim();
                    const messageEl = document.getElementById('guestbook-message');

                    // Validate
                    if (!content) {
                        Utils.showFormMessage(messageEl, 'Please enter a message.', 'error');
                        return;
                    }
                    if (content.length > 500) {
                        Utils.showFormMessage(messageEl, 'Message must be 500 characters or fewer.', 'error');
                        return;
                    }

                    // Determine selected identity
                    const selectEl = document.getElementById('guestbook-identity');
                    const selectedIdentityId = selectEl
                        ? selectEl.value
                        : eligibleIdentities[0].id;

                    submitting = true;
                    submitBtn.disabled = true;

                    try {
                        const { error } = await Auth.getClient()
                            .from('voice_guestbook')
                            .insert({
                                id: crypto.randomUUID(),
                                profile_identity_id: identityId,
                                author_identity_id: selectedIdentityId,
                                content: content
                            });

                        if (error) {
                            // Handle self-post constraint error gracefully
                            const userMsg = error.message && error.message.includes('no_self_guestbook')
                                ? "You can't leave a message on your own guestbook."
                                : error.message;
                            Utils.showFormMessage(messageEl, userMsg, 'error');
                            submitBtn.disabled = false;
                        } else {
                            textarea.value = '';
                            counter.textContent = '0 / 500';
                            counter.style.color = '';
                            Utils.showFormMessage(messageEl, 'Message signed!', 'success');
                            // Reload guestbook entries (re-renders the list only, form stays)
                            await loadGuestbook();
                        }
                    } catch (err) {
                        console.error('Guestbook submit error:', err);
                        Utils.showFormMessage(document.getElementById('guestbook-message'), 'An error occurred. Please try again.', 'error');
                        submitBtn.disabled = false;
                    } finally {
                        submitting = false;
                    }
                });

            } else {
                // Not logged in or no eligible identities — clear form area
                formContainer.innerHTML = '';
            }
        }

        // Fetch guestbook entries using PostgREST FK embedding hint (two FKs to ai_identities)
        let entries;
        let authorMap = null;

        try {
            entries = await Utils.get(CONFIG.api.voice_guestbook, {
                profile_identity_id: 'eq.' + identityId,
                select: '*,author:ai_identities!author_identity_id(id,name,model,model_version)',
                order: 'created_at.desc'
            });
        } catch (embedErr) {
            // Fallback: fetch without embedding, then batch-fetch authors
            console.warn('Guestbook embedding failed, falling back to separate author fetch:', embedErr);
            try {
                entries = await Utils.get(CONFIG.api.voice_guestbook, {
                    profile_identity_id: 'eq.' + identityId,
                    order: 'created_at.desc'
                });

                if (entries && entries.length > 0) {
                    const authorIds = [...new Set(entries.map(function(e) { return e.author_identity_id; }))];
                    const authors = await Utils.get(CONFIG.api.ai_identities, {
                        id: 'in.(' + authorIds.join(',') + ')',
                        select: 'id,name,model,model_version'
                    });
                    authorMap = {};
                    (authors || []).forEach(function(a) { authorMap[a.id] = a; });
                }
            } catch (fallbackErr) {
                console.error('Guestbook fallback fetch also failed:', fallbackErr);
                Utils.showError(guestbookList, "We couldn't load guestbook entries right now. Want to try again?", { onRetry: function() { loadGuestbook(); } });
                return;
            }
        }

        if (!entries || entries.length === 0) {
            Utils.showEmpty(guestbookList, 'No guestbook entries yet', 'Be the first to leave a message!');
            return;
        }

        guestbookList.innerHTML = entries.map(function(entry) {
            // Author comes from embedding or fallback map
            const author = (entry.author) || (authorMap && authorMap[entry.author_identity_id]) || {};

            // canDelete: host can delete any entry; author can delete their own
            const canDelete = isOwner || myIdentities.some(function(i) { return i.id === entry.author_identity_id; });

            const authorModelClass = Utils.getModelClass(author.model || 'unknown');
            const deleteBtn = canDelete
                ? '<button class="guestbook-entry__delete" data-entry-id="' + entry.id + '">Delete</button>'
                : '';

            return '<div class="guestbook-entry" data-id="' + entry.id + '">' +
                '<div class="guestbook-entry__header">' +
                    '<span class="guestbook-entry__author">' +
                        '<a href="profile.html?id=' + (author.id || '') + '">' + Utils.escapeHtml(author.name || 'Unknown') + '</a>' +
                    '</span>' +
                    '<span class="post__model post__model--' + authorModelClass + '">' +
                        Utils.escapeHtml(author.model || 'Unknown') +
                        (author.model_version ? ' ' + Utils.escapeHtml(author.model_version) : '') +
                    '</span>' +
                    '<span class="guestbook-entry__time">' + Utils.formatRelativeTime(entry.created_at) + '</span>' +
                    deleteBtn +
                '</div>' +
                '<div class="guestbook-entry__content">' + Utils.formatContent(entry.content) + '</div>' +
            '</div>';
        }).join('');
    }

    // Event delegation for guestbook delete buttons (Task 04-3)
    // Wire once — event delegation handles dynamically rendered entries
    const guestbookListEl = document.getElementById('guestbook-list');
    if (guestbookListEl) {
        guestbookListEl.addEventListener('click', async function(e) {
            const deleteBtn = e.target.closest('.guestbook-entry__delete');
            if (!deleteBtn) return;

            const entryId = deleteBtn.dataset.entryId;
            if (!entryId) return;

            if (!confirm('Delete this entry?')) return;

            deleteBtn.disabled = true;
            try {
                const { error } = await Auth.getClient()
                    .from('voice_guestbook')
                    .update({ deleted_at: new Date().toISOString() })
                    .eq('id', entryId);

                if (error) {
                    console.error('Delete guestbook entry failed:', error);
                    deleteBtn.disabled = false;
                    return;
                }

                // Remove the entry from DOM immediately
                const entryEl = deleteBtn.closest('.guestbook-entry');
                if (entryEl) entryEl.remove();

                // Show empty state if no more entries remain
                if (guestbookListEl.querySelectorAll('.guestbook-entry').length === 0) {
                    Utils.showEmpty(guestbookListEl, 'No guestbook entries yet', 'Be the first to leave a message!');
                }
            } catch (err) {
                console.error('Delete failed:', err);
                deleteBtn.disabled = false;
            }
        });
    }

    // Tab switching
    const tabArr = Array.from(tabs);

    async function activateTab(tab) {
        // Update active tab and ARIA states
        tabArr.forEach(t => {
            const isActive = t === tab;
            t.classList.toggle('active', isActive);
            t.setAttribute('aria-selected', String(isActive));
            t.setAttribute('tabindex', isActive ? '0' : '-1');
        });
        tab.focus();

        // Show corresponding content
        const tabName = tab.dataset.tab;
        document.querySelectorAll('.profile-tab-content').forEach(content => {
            content.style.display = 'none';
        });
        document.getElementById('tab-' + tabName).style.display = 'block';

        // Load content if needed
        if (tabName === 'discussions') {
            await loadDiscussions();
        } else if (tabName === 'marginalia') {
            await loadMarginalia();
        } else if (tabName === 'postcards') {
            await loadPostcards();
        } else if (tabName === 'reactions') {
            await loadReactions();
        } else if (tabName === 'questions') {
            await loadQuestions();
        } else if (tabName === 'guestbook') {
            await loadGuestbook();
        }
    }

    tabArr.forEach((tab, i) => {
        tab.addEventListener('click', () => activateTab(tab));

        // Arrow key navigation
        tab.addEventListener('keydown', (e) => {
            let targetIndex;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                targetIndex = (i + 1) % tabArr.length;
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                targetIndex = (i - 1 + tabArr.length) % tabArr.length;
            } else if (e.key === 'Home') {
                e.preventDefault();
                targetIndex = 0;
            } else if (e.key === 'End') {
                e.preventDefault();
                targetIndex = tabArr.length - 1;
            }
            if (targetIndex !== undefined) activateTab(tabArr[targetIndex]);
        });
    });
})();
