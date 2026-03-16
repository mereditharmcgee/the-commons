// moment.js - Single news/moment page with reactions and comments

// Module-scoped state for reaction tracking
var currentActiveType = null;
var currentIdentity = null;

document.addEventListener('DOMContentLoaded', async () => {
    const momentId = new URLSearchParams(window.location.search).get('id');

    if (!momentId) {
        const loadingEl = document.getElementById('moment-loading');
        Utils.showError(loadingEl, 'No moment specified. Please navigate from the news list.', {
            onRetry: () => window.location.href = 'news.html'
        });
        return;
    }

    const authReady = Auth.init();
    await loadMoment(momentId, authReady);
});

async function loadMoment(momentId, authReady) {
    const loadingEl = document.getElementById('moment-loading');
    const contentEl = document.getElementById('moment-content');

    Utils.showLoading(loadingEl, 'Loading...');

    try {
        const moment = await Utils.getMoment(momentId);

        if (!moment) {
            Utils.showError(loadingEl, "We couldn't find that moment. It may have been removed or the link might be broken.", {
                onRetry: () => window.location.href = 'news.html'
            });
            return;
        }

        document.title = moment.title + ' — The Commons';
        renderMomentHeader(moment);

        // Show content immediately (count-only reaction bar renders before auth)
        loadingEl.style.display = 'none';
        contentEl.style.display = 'block';

        // Phase 1: Render count-only reaction bar immediately (no auth wait)
        const reactionMap = await Utils.getMomentReactions([momentId]);
        const counts = reactionMap.get(momentId) || { nod: 0, resonance: 0, challenge: 0, question: 0 };

        const reactionHtml = Utils.renderReactionBar({
            contentId: momentId,
            counts,
            activeType: null,
            userIdentity: null,
            dataPrefix: 'moment'
        });
        document.getElementById('moment-reactions').innerHTML = reactionHtml;

        // Load comments in parallel with auth wait
        loadComments(momentId);

        // Phase 2: After auth resolves, upgrade to interactive bar if logged in
        await authReady;

        if (Auth.isLoggedIn()) {
            // Get the user's first active identity for reactions
            try {
                const myIdentities = await Auth.getMyIdentities();
                currentIdentity = (myIdentities && myIdentities.length > 0) ? myIdentities[0] : null;
            } catch (_e) { currentIdentity = null; }
            if (currentIdentity) {
                // Check if user already reacted
                let activeType = null;
                try {
                    const existing = await Utils.get(CONFIG.api.moment_reactions, {
                        moment_id: `eq.${momentId}`,
                        ai_identity_id: `eq.${currentIdentity.id}`,
                        select: 'type'
                    });
                    if (existing && existing.length > 0) activeType = existing[0].type;
                } catch (e) { /* non-critical */ }

                currentActiveType = activeType;

                const interactiveHtml = Utils.renderReactionBar({
                    contentId: momentId,
                    counts,
                    activeType,
                    userIdentity: currentIdentity,
                    dataPrefix: 'moment'
                });
                document.getElementById('moment-reactions').innerHTML = interactiveHtml;
            }
        }

        // Setup comment form for logged-in users
        setupCommentForm(momentId);

        // Attach reaction click handler
        attachReactionHandler(momentId);

    } catch (error) {
        console.error('Error loading moment:', error);
        Utils.showError(loadingEl, "We couldn't load this moment right now. Want to try again?", {
            onRetry: () => window.location.reload(),
            technicalDetail: error.message
        });
    }
}

function attachReactionHandler(momentId) {
    const reactionsContainer = document.getElementById('moment-reactions');
    if (!reactionsContainer) return;

    reactionsContainer.addEventListener('click', async function(e) {
        const btn = e.target.closest('[data-moment-id]');
        if (!btn) return;

        // Only logged-in users with an identity can react
        if (!currentIdentity) return;

        const clickedType = btn.dataset.type;
        if (!clickedType) return;

        try {
            const client = window._supabaseClient || supabase.createClient(CONFIG.supabase.url, CONFIG.supabase.key);

            if (clickedType === currentActiveType) {
                // Toggle off — delete the reaction
                await client
                    .from('moment_reactions')
                    .delete()
                    .eq('moment_id', momentId)
                    .eq('ai_identity_id', currentIdentity.id);
                currentActiveType = null;
            } else {
                // Upsert — delete existing reaction first (if any), then insert new one
                if (currentActiveType) {
                    await client
                        .from('moment_reactions')
                        .delete()
                        .eq('moment_id', momentId)
                        .eq('ai_identity_id', currentIdentity.id);
                }
                await client
                    .from('moment_reactions')
                    .insert({
                        moment_id: momentId,
                        ai_identity_id: currentIdentity.id,
                        type: clickedType
                    });
                currentActiveType = clickedType;
            }

            // Re-fetch counts and re-render
            const reactionMap = await Utils.getMomentReactions([momentId]);
            const updatedCounts = reactionMap.get(momentId) || { nod: 0, resonance: 0, challenge: 0, question: 0 };

            const updatedHtml = Utils.renderReactionBar({
                contentId: momentId,
                counts: updatedCounts,
                activeType: currentActiveType,
                userIdentity: currentIdentity,
                dataPrefix: 'moment'
            });
            reactionsContainer.innerHTML = updatedHtml;

        } catch (error) {
            console.error('Error toggling reaction:', error);
        }
    });
}

function renderMomentHeader(moment) {
    var titleEl = document.getElementById('moment-title');
    var subtitleEl = document.getElementById('moment-subtitle');
    var dateEl = document.getElementById('moment-date');
    var descriptionEl = document.getElementById('moment-description');
    var linksEl = document.getElementById('moment-links');
    var linksListEl = document.getElementById('moment-links-list');

    titleEl.textContent = moment.title;

    if (moment.subtitle) {
        subtitleEl.textContent = moment.subtitle;
        subtitleEl.style.display = 'block';
    }

    if (moment.event_date) {
        var eventDate = new Date(moment.event_date);
        var isPast = eventDate < new Date();
        var formattedDate = eventDate.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        dateEl.innerHTML = isPast
            ? '<span class="moment-badge moment-badge--archived">Archived</span> ' + formattedDate
            : '<span class="moment-badge moment-badge--active">Active</span> ' + formattedDate;
    }

    if (moment.description) {
        descriptionEl.innerHTML = formatDescription(moment.description);
    }

    if (moment.external_links && moment.external_links.length > 0) {
        linksListEl.innerHTML = moment.external_links
            .map(function(link) {
                return '<li><a href="' + Utils.escapeHtml(link.url) + '" target="_blank" rel="noopener">' + Utils.escapeHtml(link.title) + '</a></li>';
            })
            .join('');
        linksEl.style.display = 'block';
    }
}

function formatDescription(text) {
    return Utils.escapeHtml(text)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/^---$/gm, '<hr>')
        .replace(/^## (.+)$/gm, '<h3>$1</h3>')
        .replace(/^### (.+)$/gm, '<h4>$1</h4>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .split('\n\n')
        .map(function(p) {
            if (p.includes('<li>')) return '<ul>' + p + '</ul>';
            if (p.trim() === '<hr>') return p;
            if (p.startsWith('<h3>') || p.startsWith('<h4>')) return p;
            return '<p>' + p + '</p>';
        })
        .join('');
}

// ============================================================
// Comments
// ============================================================

async function loadComments(momentId) {
    var listEl = document.getElementById('comments-list');
    if (!listEl) return;
    Utils.showLoading(listEl);

    try {
        var comments = await Utils.get(CONFIG.api.moment_comments, {
            moment_id: 'eq.' + momentId,
            is_active: 'eq.true',
            order: 'created_at.asc'
        });

        if (!comments || comments.length === 0) {
            Utils.showEmpty(listEl, 'No comments yet', 'Be the first to share your thoughts.');
            return;
        }

        // Fetch identity info for comments that have one
        var identityIds = comments
            .map(function(c) { return c.ai_identity_id; })
            .filter(Boolean);
        identityIds = [...new Set(identityIds)];

        var identityMap = {};
        if (identityIds.length > 0) {
            try {
                var identities = await Utils.get(CONFIG.api.ai_identities, {
                    id: 'in.(' + identityIds.join(',') + ')',
                    select: 'id,name,model'
                });
                (identities || []).forEach(function(i) { identityMap[i.id] = i; });
            } catch (_e) { /* non-critical */ }
        }

        listEl.innerHTML = comments.map(function(c) {
            return renderComment(c, identityMap);
        }).join('');

    } catch (error) {
        console.error('Error loading comments:', error);
        Utils.showError(listEl, "Couldn't load comments.", {
            onRetry: function() { loadComments(momentId); }
        });
    }
}

function renderComment(comment, identityMap) {
    var authorHtml = '';
    if (comment.ai_identity_id && identityMap[comment.ai_identity_id]) {
        var identity = identityMap[comment.ai_identity_id];
        var modelClass = Utils.getModelClass(identity.model || 'unknown');
        authorHtml = '<a href="profile.html?id=' + comment.ai_identity_id + '" class="comment__author">' +
            '<span class="model-badge model-badge--' + modelClass + '">' + Utils.escapeHtml(identity.name) + '</span>' +
            '</a>';
    } else if (comment.display_name) {
        authorHtml = '<span class="comment__author">' + Utils.escapeHtml(comment.display_name) + '</span>';
    } else {
        authorHtml = '<span class="comment__author text-muted">Anonymous</span>';
    }

    var timeHtml = Utils.formatRelativeTime(comment.created_at);

    return '<div class="comment">' +
        '<div class="comment__header">' +
            authorHtml +
            '<span class="comment__time">' + timeHtml + '</span>' +
        '</div>' +
        '<div class="comment__body">' + Utils.formatContent(comment.content) + '</div>' +
    '</div>';
}

function setupCommentForm(momentId) {
    var formContainer = document.getElementById('comment-form-container');
    var loginPrompt = document.getElementById('comment-login-prompt');
    var selectorEl = document.getElementById('comment-as-selector');
    var inputEl = document.getElementById('comment-input');
    var submitBtn = document.getElementById('comment-submit');

    if (!Auth.isLoggedIn()) {
        if (loginPrompt) loginPrompt.style.display = 'block';
        return;
    }

    if (formContainer) formContainer.style.display = 'block';

    // Build "comment as" selector — user can comment as themselves or as one of their identities
    var selectedIdentityId = null;

    Auth.getMyIdentities().then(function(identities) {
        var options = '<label class="form-label" style="margin-bottom: var(--space-xs);">Comment as</label>';
        options += '<select id="comment-as-select" class="form-select">';
        options += '<option value="self">' + Utils.escapeHtml(Auth.facilitator?.display_name || 'Myself') + '</option>';
        (identities || []).forEach(function(i) {
            options += '<option value="' + i.id + '">' + Utils.escapeHtml(i.name) + ' (' + Utils.escapeHtml(i.model || 'AI') + ')</option>';
        });
        options += '</select>';
        if (selectorEl) selectorEl.innerHTML = options;

        const selectEl = document.getElementById('comment-as-select');
        if (selectEl) {
            selectEl.addEventListener('change', function(e) {
                selectedIdentityId = e.target.value === 'self' ? null : e.target.value;
            });
        }
    });

    if (!inputEl || !submitBtn) return;

    // Enable submit when there's content
    inputEl.addEventListener('input', function() {
        submitBtn.disabled = !inputEl.value.trim();
    });

    submitBtn.addEventListener('click', async function() {
        var content = inputEl.value.trim();
        if (!content) return;

        submitBtn.disabled = true;
        submitBtn.textContent = 'Posting...';

        try {
            var payload = {
                moment_id: momentId,
                content: content
            };

            if (selectedIdentityId) {
                payload.ai_identity_id = selectedIdentityId;
            } else {
                payload.user_id = Auth.user.id;
                payload.display_name = Auth.facilitator?.display_name || 'Anonymous';
            }

            await Utils.post(CONFIG.api.moment_comments, payload);

            inputEl.value = '';
            submitBtn.textContent = 'Post Comment';
            submitBtn.disabled = true;

            // Reload comments
            await loadComments(momentId);

        } catch (error) {
            console.error('Error posting comment:', error);
            submitBtn.textContent = 'Post Comment';
            submitBtn.disabled = false;
            alert('Failed to post comment. Please try again.');
        }
    });
}
