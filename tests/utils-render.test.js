// Offline check for Utils.formatContent (js/utils-render.js), the one shared
// renderer behind posts, guestbook entries, comments, revisions, texts and the
// admin inbox. Its output goes straight into innerHTML, so the test reads the
// output the way a browser's tokenizer does and asserts the only markup is the
// markup formatContent means to write: p, br, strong, a (href/target/rel) and
// img (src/alt/class/loading). Regression for F08 (2026-10 sweep): a URL inside
// markdown-image alt text was linkified in place, its quote closed the alt
// attribute early, and post text could add style= or onerror= to the <img>.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// escapeHtml() round-trips text through a div. Serializing a text node
// escapes & < > and U+00A0, and nothing else.
function fakeDocument() {
    return {
        createElement() {
            let text = '';
            return {
                set textContent(value) { text = String(value); },
                get innerHTML() {
                    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\xa0/g, '&nbsp;');
                }
            };
        }
    };
}

function loadUtils() {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js/utils-render.js'), 'utf8');
    const sandbox = { window: {}, document: fakeDocument(), console };
    vm.runInNewContext(source, sandbox, { filename: 'js/utils-render.js' });
    return sandbox.window.Utils;
}

const Utils = loadUtils();

// Start tags as the WHATWG tokenizer reads them: attribute names end at
// whitespace, / > or =; a value is double-quoted, single-quoted or runs to
// whitespace or >; / between attributes is skipped; no whitespace is needed
// after a quoted value before the next name.
function startTags(html) {
    const tags = [];
    const ws = c => c === ' ' || c === '\t' || c === '\n' || c === '\f' || c === '\r';
    let i = 0;
    while ((i = html.indexOf('<', i)) !== -1) {
        i++;
        if (!/[A-Za-z]/.test(html[i] || '')) continue; // end tag or a literal '<'
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

const ALLOWED = {
    p: [],
    br: [],
    strong: [],
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt', 'class', 'loading']
};

function assertOnlyOwnMarkup(input) {
    const html = Utils.formatContent(input);
    for (const tag of startTags(html)) {
        assert.ok(Object.hasOwn(ALLOWED, tag.name), `unexpected <${tag.name}> from ${JSON.stringify(input)}\n${html}`);
        for (const attr of tag.attrs) {
            assert.ok(ALLOWED[tag.name].includes(attr.name),
                `unexpected ${attr.name}= on <${tag.name}> from ${JSON.stringify(input)}\n${html}`);
        }
        const url = tag.attrs.find(a => a.name === 'href' || a.name === 'src');
        if (url) assert.match(url.value, /^https?:\/\//, `non-http ${url.name} from ${JSON.stringify(input)}\n${html}`);
    }
    return html;
}

const SELF_HOSTED = 'https://jointhecommons.space/favicon.png';

test('a URL in image alt text cannot add a style attribute to the image', () => {
    const html = assertOnlyOwnMarkup(`![x https://a.example/style=position:fixed;z-index:99999;top:0;left:0;width:100vw;height:100vh;max-width:none](${SELF_HOSTED})`);
    const imgs = startTags(html).filter(t => t.name === 'img');
    assert.equal(imgs.length, 1);
    assert.deepEqual(imgs[0].attrs.map(a => a.name), ['src', 'alt', 'class', 'loading']);
    assert.equal(imgs[0].attrs.find(a => a.name === 'src').value, SELF_HOSTED);
});

test('a URL in image alt text cannot add an event handler to the image', () => {
    const html = assertOnlyOwnMarkup(`![x https://a.example/onerror=alert(document.domain)](https://a.example/missing.png)`);
    assert.equal(/onerror/i.test(startTags(html).flatMap(t => t.attrs.map(a => a.name)).join(' ')), false);
});

test('bold and quotes inside image alt text stay text', () => {
    assertOnlyOwnMarkup(`![**https://a.example/style=color:red**](${SELF_HOSTED})`);
    assertOnlyOwnMarkup(`![a "b" 'c' https://a.example/x](${SELF_HOSTED})`);
    assertOnlyOwnMarkup(`![a](https://a.example/"onerror=alert(1)//)`);
    assertOnlyOwnMarkup(`![a\n\nhttps://a.example/style=color:red](${SELF_HOSTED})`);
});

test('ordinary formatting still renders: paragraphs, breaks, bold, links, images', () => {
    assert.equal(Utils.formatContent('one\ntwo\n\nthree'), '<p>one<br>two</p><p>three</p>');
    assert.equal(Utils.formatContent('a **bold** word'), '<p>a <strong>bold</strong> word</p>');
    assert.equal(Utils.formatContent('see https://example.com/a?b=1 now'),
        '<p>see <a href="https://example.com/a?b=1" target="_blank" rel="noopener">https://example.com/a?b=1</a> now</p>');
    assert.equal(Utils.formatContent('**https://example.com**'),
        '<p><strong><a href="https://example.com" target="_blank" rel="noopener">https://example.com</a></strong></p>');
    assert.equal(Utils.formatContent(`look ![a cat](${SELF_HOSTED}) here`),
        `<p>look <img src="${SELF_HOSTED}" alt="a cat" class="content-image" loading="lazy"> here</p>`);
    assert.equal(Utils.formatContent(`![a](${SELF_HOSTED}) then https://example.com`),
        `<p><img src="${SELF_HOSTED}" alt="a" class="content-image" loading="lazy"> then <a href="https://example.com" target="_blank" rel="noopener">https://example.com</a></p>`);
    assert.equal(Utils.formatContent('<script>alert(1)</script>'), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
});

test('no mix of post syntax produces markup formatContent did not mean to write', () => {
    const pieces = ['![', '](', ')', ']', '[', '**', 'https://a.example/', 'http://b.example/x', 'style=', 'onerror=',
        'alert(1)', '"', "'", '\n', '\n\n', ' ', '<', '>', '&', '=', '/', 'x', 'img', 'a ', 'position:fixed;'];
    let seed = 0x5eed;
    const next = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 0x100000000;
    const run = max => {
        let s = '';
        for (let k = Math.floor(next() * (max + 1)); k > 0; k--) s += pieces[Math.floor(next() * pieces.length)];
        return s;
    };
    // Mostly well-formed images and bold spans with hostile insides, plus loose pieces.
    const chunk = () => {
        const roll = next();
        if (roll < 0.35) return `![${run(5)}](https://a.example/${run(3)})`;
        if (roll < 0.5) return `**${run(4)}**`;
        return run(2);
    };
    for (let n = 0; n < 4000; n++) {
        let input = '';
        for (let k = 1 + Math.floor(next() * 5); k > 0; k--) input += chunk();
        assertOnlyOwnMarkup(input);
    }
});
