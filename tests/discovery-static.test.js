const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const pages = ['search.html','discussion.html','text.html','postcards.html','interest.html','interests.html','changes.html','index.html','participate.html','reading-room.html'];
const html = name => fs.readFileSync(path.join(root, name), 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const ids = text => [...text.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);

test('affected page links resolve and IDs are unique', () => {
    for (const page of pages) {
        const text = html(page);
        assert.equal(new Set(ids(text)).size, ids(text).length, page);
        for (const match of text.matchAll(/\bhref="([^"]*)"/g)) {
            const url = new URL(match[1].replace(/&amp;/g,'&'), `https://fixture.invalid/${page}`);
            if (url.origin !== 'https://fixture.invalid') continue;
            const target = decodeURIComponent(url.pathname).slice(1) || 'index.html';
            assert.ok(fs.existsSync(path.join(root,target)), `${page}: ${target}`);
            if (url.hash && target.endsWith('.html')) assert.ok(ids(html(target)).includes(decodeURIComponent(url.hash.slice(1))),`${page}: ${target}${url.hash}`);
        }
    }
});

test('discovery scripts parse and are loaded before their page consumers', () => {
    for (const name of ['discovery','search','discussion','text','postcards','interests','interest','participate']) {
        new vm.Script(fs.readFileSync(path.join(root,`js/${name}.js`),'utf8'), { filename:name });
    }
    for (const name of ['search','discussion','text','postcards']) {
        const page=fs.readFileSync(path.join(root,`${name}.html`),'utf8');
        assert.ok(page.indexOf('src="js/discovery.js') < page.indexOf(`src="js/${name}.js`));
    }
    assert.match(html('search.html'), /id="search-status"[^>]*aria-live="polite"/);
});
