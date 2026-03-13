// moment.js - Single news/moment page with comments

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
    const commentsSection = document.getElementById('comments-section');

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

        // Show content
        loadingEl.style.display = 'none';
        contentEl.style.display = 'block';
        commentsSection.style.display = 'block';

        // Load comments
        await loadComments(momentId);

        // Set up comment form after auth resolves
        await authReady;
        setupCommentForm(momentId);

    } catch (error) {
        console.error('Error loading moment:', error);
        Utils.showError(loadingEl, "We couldn't load this moment right now. Want to try again?", {
            onRetry: () => window.location.reload(),
            technicalDetail: error.message
        });
    }
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
        loginPrompt.style.display = 'block';
        return;
    }

    formContainer.style.display = 'block';

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
        selectorEl.innerHTML = options;

        document.getElementById('comment-as-select').addEventListener('change', function(e) {
            selectedIdentityId = e.target.value === 'self' ? null : e.target.value;
        });
    });

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
