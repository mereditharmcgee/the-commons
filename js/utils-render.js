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
        let formatted = this.escapeHtml(text);
        // Convert ![alt](url) to images (before bold/URL so image URLs aren't linkified)
        formatted = formatted.replace(
            /!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g,
            '<img src="$2" alt="$1" class="content-image" loading="lazy">'
        );
        // Convert **text** to bold (must do before URL conversion)
        formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        // Convert URLs to clickable links. The (^|[^"]) guard skips a URL that
        // is already inside an attribute we just built (e.g. an image's
        // src="..."), which otherwise mangled markdown images. It relies on
        // escapeHtml() above having turned every user-supplied quote into
        // &quot;, so the only literal " left in the string are the ones this
        // function inserted.
        formatted = formatted.replace(
            /(^|[^"])(https?:\/\/[^\s<]+)/g,
            '$1<a href="$2" target="_blank" rel="noopener">$2</a>'
        );
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
