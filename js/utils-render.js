// Utils: HTML-safety + rendering (escape / format / sanitize / url-safety) — all XSS-relevant code lives here.
// Split from utils.js 2026-07-09 (Phase 4). Attaches to the shared
// window.Utils object. See docs/agents/ARCHITECTURE.md.
(function () {
    Object.assign(window.Utils = window.Utils || {}, {
    /**
     * Escape HTML to prevent XSS.
     * @param {string} text - Raw text to escape
     * @returns {string} HTML-escaped text
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        // textContent->innerHTML escapes & < > but NOT quotes. formatContent()
        // and other callers build quoted HTML attributes from this output, so
        // unescaped quotes are an attribute-breakout XSS vector. Escape them too.
        return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },
    
    /**
     * Convert newlines to paragraphs, URLs to links, and **text** to bold.
     * @param {string} text - Raw content text
     * @returns {string} Sanitized HTML with paragraph/link formatting
     */
    formatContent(text) {
        const escaped = this.escapeHtml(text);
        // escapeHtml() turned every user-supplied < > " ' into an entity, so
        // each literal one left in the output is one this function wrote.
        // **text** becomes bold, then bare URLs become links. A URL stops at
        // < and " so it can never run into a tag or out of an attribute.
        const inline = s => s
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/https?:\/\/[^\s<"]+/g, '<a href="$&" target="_blank" rel="noopener">$&</a>');
        // ![alt](url) becomes an image. Images are cut out first and only the
        // text between them goes through inline(), so bold and links are never
        // built inside an image's alt or src. (Linkifying a URL in alt text in
        // place let its quote close the alt attribute early, and post text
        // could then add style= or onerror= to the <img>.) Alt and src hold no
        // newline, so the paragraph split below never lands inside a tag.
        // split() with two capture groups yields [text, alt, src, text, ...].
        const parts = escaped.split(/!\[([^\]\n]*)\]\((https?:\/\/[^)\s]+)\)/);
        let formatted = '';
        for (let i = 0; i < parts.length; i += 3) {
            formatted += inline(parts[i]);
            if (i + 2 < parts.length) {
                formatted += `<img src="${parts[i + 2]}" alt="${parts[i + 1]}" class="content-image" loading="lazy">`;
            }
        }
        const paragraphs = formatted.split(/\n\n+/);
        return paragraphs
            .map(p => p.trim())
            .filter(p => p)
            .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
            .join('');
    },

    /**
     * Sanitize HTML from untrusted sources. Wraps DOMPurify.sanitize().
     * Use this for any content that arrives as HTML and must render as HTML.
     * For plain text that needs formatting, use formatContent() instead.
     * @param {string} html - Potentially unsafe HTML string
     * @returns {string} Sanitized HTML safe for innerHTML assignment
     */
    sanitizeHtml(html) {
        if (typeof DOMPurify === 'undefined') {
            console.warn('Utils.sanitizeHtml: DOMPurify not loaded, falling back to escapeHtml');
            return this.escapeHtml(html);
        }
        return DOMPurify.sanitize(html, {
            ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'p', 'br', 'a', 'ul', 'ol', 'li', 'img'],
            ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'loading', 'class']
        });
    },

    /**
     * Whether a URL is safe to place in an href/src attribute. Allows relative
     * paths and http/https absolute URLs; rejects javascript:, data:, and any
     * other scheme that can execute. Guard any href/src built from data with
     * this — escaping alone does not stop a javascript: scheme.
     * (For notification links, notifications.js applies a deliberately stricter,
     * on-site-only check on top of the same idea.)
     * @param {string} url
     * @returns {boolean}
     */
    isSafeUrl(url) {
        if (!url || typeof url !== 'string') return false;
        // Scheme-less relative paths are safe.
        if (url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) return true;
        if (!url.includes(':')) return true;
        // Anything with a scheme must resolve to http/https.
        try {
            const parsed = new URL(url, window.location.origin);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch (_e) {
            return false;
        }
    },
    });
})();
