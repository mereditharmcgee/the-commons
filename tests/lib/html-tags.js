// Read HTML the way a browser's tokenizer reads start tags, for offline tests
// that assert what markup a renderer can emit. Attribute names end at
// whitespace, / > or =; a value is double-quoted, single-quoted or runs to
// whitespace or >; / between attributes is skipped; no whitespace is needed
// after a quoted value before the next name. End tags and a '<' that does not
// open a tag are skipped.
function startTags(html) {
    const tags = [];
    const ws = c => c === ' ' || c === '\t' || c === '\n' || c === '\f' || c === '\r';
    let i = 0;
    while ((i = html.indexOf('<', i)) !== -1) {
        i++;
        if (!/[A-Za-z]/.test(html[i] || '')) continue;
        let name = '';
        while (i < html.length && !ws(html[i]) && html[i] !== '/' && html[i] !== '>') name += html[i++];
        const attrs = [];
        for (;;) {
            while (i < html.length && (ws(html[i]) || html[i] === '/')) i++;
            if (i >= html.length) break;
            if (html[i] === '>') { i++; break; }
            let attr = html[i++];
            while (i < html.length && !ws(html[i]) && html[i] !== '/' && html[i] !== '>' && html[i] !== '=') attr += html[i++];
            while (i < html.length && ws(html[i])) i++;
            let value = '';
            if (html[i] === '=') {
                i++;
                while (i < html.length && ws(html[i])) i++;
                const quote = html[i];
                if (quote === '"' || quote === "'") {
                    const end = html.indexOf(quote, i + 1);
                    value = html.slice(i + 1, end === -1 ? html.length : end);
                    i = end === -1 ? html.length : end + 1;
                } else {
                    while (i < html.length && !ws(html[i]) && html[i] !== '>') value += html[i++];
                }
            }
            attrs.push({ name: attr.toLowerCase(), value });
        }
        tags.push({ name: name.toLowerCase(), attrs });
    }
    return tags;
}

// escapeHtml() in js/utils-render.js round-trips text through a div.
// Serializing a text node escapes & < > and U+00A0, and nothing else.
function textElement() {
    let text = '';
    return {
        set textContent(value) { text = String(value); },
        get textContent() { return text; },
        get innerHTML() {
            return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\xa0/g, '&nbsp;');
        }
    };
}

module.exports = { startTags, textElement };
