// ============================================
// THE COMMONS - News Page
// ============================================

(function() {
    'use strict';

    const PAGE_SIZE = 10;
    let currentPage = 0;
    let allMoments = [];

    const newsList = document.getElementById('news-list');
    const paginationEl = document.getElementById('news-pagination');

    // Load all moments client-side (dataset is small ~30 items), paginate in JS
    async function loadNews() {
        Utils.showLoading(newsList);
        try {
            const moments = await Utils.get(CONFIG.api.moments, {
                'is_active': 'eq.true',
                'order': 'is_pinned.desc,event_date.desc'
            });
            allMoments = moments || [];

            // Fetch discussion counts in parallel
            const countPromises = allMoments.map(m =>
                Utils.getDiscussionsByMoment(m.id)
                    .then(d => ({ id: m.id, count: d ? d.length : 0 }))
                    .catch(() => ({ id: m.id, count: 0 }))
            );
            const counts = await Promise.all(countPromises);
            const countMap = {};
            counts.forEach(c => { countMap[c.id] = c.count; });
            allMoments.forEach(m => { m._discussionCount = countMap[m.id] || 0; });

            renderPage();
        } catch (err) {
            Utils.showError(newsList, 'Failed to load news');
        }
    }

    function renderPage() {
        const start = currentPage * PAGE_SIZE;
        const pageItems = allMoments.slice(start, start + PAGE_SIZE);

        if (pageItems.length === 0 && currentPage === 0) {
            Utils.showEmpty(newsList, 'No news yet', 'Check back soon for updates.');
            paginationEl.innerHTML = '';
            return;
        }

        newsList.innerHTML = pageItems.map(m => renderNewsCard(m)).join('');
        renderPagination();
    }

    function renderNewsCard(moment) {
        // Editorial news card design — not a plain moment-card
        // Pinned items get a visual indicator
        const isPinned = moment.is_pinned;
        const dateStr = moment.event_date
            ? new Date(moment.event_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
            : '';
        const subtitle = moment.subtitle ? Utils.escapeHtml(moment.subtitle) : '';
        const description = moment.description ? Utils.escapeHtml(moment.description) : '';
        // Truncate description for card preview (first 200 chars)
        const excerpt = description.length > 200 ? description.substring(0, 200) + '...' : description;
        const discussionCount = moment._discussionCount || 0;
        const discussionLabel = discussionCount === 1 ? '1 discussion' : `${discussionCount} discussions`;

        return `
            <article class="news-card${isPinned ? ' news-card--pinned' : ''}">
                ${isPinned ? '<span class="news-card__pin-badge">Pinned</span>' : ''}
                <div class="news-card__dateline">${dateStr}</div>
                <h2 class="news-card__headline">
                    <a href="moment.html?id=${moment.id}">${Utils.escapeHtml(moment.title)}</a>
                </h2>
                ${subtitle ? `<p class="news-card__deck">${subtitle}</p>` : ''}
                <p class="news-card__excerpt">${excerpt}</p>
                <div class="news-card__meta">
                    <span class="news-card__discussions">${discussionLabel}</span>
                    <a href="moment.html?id=${moment.id}" class="news-card__readmore">Read more &rarr;</a>
                </div>
            </article>
        `;
    }

    function renderPagination() {
        const totalPages = Math.ceil(allMoments.length / PAGE_SIZE);
        if (totalPages <= 1) {
            paginationEl.innerHTML = '';
            return;
        }
        // Prev / page indicator / Next
        const prevDisabled = currentPage === 0 ? ' disabled' : '';
        const nextDisabled = currentPage >= totalPages - 1 ? ' disabled' : '';
        paginationEl.innerHTML = `
            <button class="news-pagination__btn" onclick="newsPagePrev()"${prevDisabled}>&laquo; Previous</button>
            <span class="news-pagination__info">Page ${currentPage + 1} of ${totalPages}</span>
            <button class="news-pagination__btn" onclick="newsPageNext()"${nextDisabled}>&raquo; Next</button>
        `;
    }

    // Global functions for pagination buttons
    window.newsPagePrev = function() {
        if (currentPage > 0) { currentPage--; renderPage(); window.scrollTo(0, 0); }
    };
    window.newsPageNext = function() {
        const totalPages = Math.ceil(allMoments.length / PAGE_SIZE);
        if (currentPage < totalPages - 1) { currentPage++; renderPage(); window.scrollTo(0, 0); }
    };

    // Initialize
    loadNews();
})();
