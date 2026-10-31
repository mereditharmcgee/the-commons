// Offline checks for the setup picker: js/setup-paths.js (the one source of
// every route), js/setup.js (the page script), setup.html (its no-JavaScript
// list), and the places that point at it. setup.js runs in a vm with a small
// fake DOM and the real Utils render helpers; nothing touches the network.
// Run: npm run test:setup
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');
// Built from escapes so this file carries no dash of its own: U+2014 and its HTML entities.
const EM_DASH = new RegExp(['\u2014', '&' + 'mdash;', '&#' + '8212;', '&#x' + '2014;'].join('|'), 'i');
// The same for U+2013, the en dash, which reads as a dash too.
const EN_DASH = new RegExp(['\u2013', '&' + 'ndash;', '&#' + '8211;', '&#x' + '2013;'].join('|'), 'i');
const TOKEN_LIKE = [/tc_[0-9a-f]{6,}/i, /eyJ[A-Za-z0-9_-]{10,}/, /tc_your/i];

function loadPaths() {
    const context = vm.createContext({});
    vm.runInContext(read('js/setup-paths.js') + '\nglobalThis.__paths = SETUP_PATHS;', context, { filename: 'js/setup-paths.js' });
    // A copy in this realm, so strict deep equality compares values, not
    // which realm made the arrays. The data is plain JSON.
    return JSON.parse(JSON.stringify(context.__paths));
}

const data = loadPaths();
const plain = s => String(s).replace(/\[([^\]]+)\]\([^)\s]+\)/g, '$1').replace(/`([^`]+)`/g, '$1');

// Every string anywhere in the data, for whole-file content checks.
function strings(value, out = []) {
    if (typeof value === 'string') out.push(value);
    else if (value && typeof value === 'object') Object.values(value).forEach(v => strings(v, out));
    return out;
}

// All routes from the first question: [{ answers, questionIds, path }].
function routes() {
    const out = [];
    (function walk(qid, answers, asked) {
        const q = data.questions[qid];
        for (const option of q.options) {
            const nextAnswers = answers.concat(option.id);
            const nextAsked = asked.concat(qid);
            if (option.next) walk(option.next, nextAnswers, nextAsked);
            else out.push({ answers: nextAnswers, questionIds: nextAsked, path: option.path, why: option.why });
        }
    })(data.start, [], []);
    return out;
}

// ---- the paths file -------------------------------------------------------

test('the version the picker names is the MCP package version, and named in one place', () => {
    const pkg = JSON.parse(read('mcp-server-the-commons/package.json'));
    assert.equal(data.MCP_VERSION, pkg.version);
    const source = read('js/setup-paths.js');
    const versions = [...source.matchAll(/\b\d+\.\d+\.\d+\b/g)].map(m => m[0]);
    assert.deepEqual([...new Set(versions)].sort(), [data.MCP_VERSION, data.TOKEN_ENV_SINCE].sort(),
        'release numbers belong in MCP_VERSION or TOKEN_ENV_SINCE, nowhere else in the file');
    for (const v of [data.MCP_VERSION, data.TOKEN_ENV_SINCE]) {
        assert.equal(source.split(`'${v}'`).length - 1, 1, `${v} is written once`);
    }
});

test('every path has the required fields and a known status', () => {
    const ids = new Set();
    for (const p of data.paths) {
        assert.match(p.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `bad id ${p.id}`);
        assert.ok(!ids.has(p.id), `duplicate id ${p.id}`);
        ids.add(p.id);
        for (const key of ['name', 'summary']) {
            assert.equal(typeof p[key], 'string', `${p.id}.${key}`);
            assert.ok(p[key].trim(), `${p.id}.${key} is empty`);
        }
        for (const key of ['fits', 'needs', 'steps', 'firstCalls', 'gotchas']) {
            assert.ok(Array.isArray(p[key]) && p[key].length > 0, `${p.id}.${key} must be a non-empty array`);
        }
        p.fits.concat(p.needs, p.gotchas).forEach(s => assert.ok(typeof s === 'string' && s.trim(), `${p.id}: empty text`));
        p.steps.forEach((s, i) => {
            assert.ok(typeof s.text === 'string' && s.text.trim(), `${p.id}.steps[${i}].text`);
            if (s.code !== undefined) assert.ok(typeof s.code === 'string' && s.code.trim() && s.codeLabel, `${p.id}.steps[${i}] code needs a label`);
        });
        p.firstCalls.forEach((c, i) => {
            assert.ok(typeof c.call === 'string' && c.call.trim(), `${p.id}.firstCalls[${i}].call`);
            assert.equal(typeof c.code, 'boolean', `${p.id}.firstCalls[${i}].code`);
        });
        assert.ok(data.STATUSES.includes(p.status), `${p.id}: status ${p.status}`);
        assert.deepEqual([...data.STATUSES], ['live', 'pilot', 'untested']);
        assert.ok(data.ACCESS.includes(p.access), `${p.id}: access ${p.access}`);
        assert.ok(p.docs && typeof p.docs.label === 'string' && p.docs.label.trim(), `${p.id}: docs label`);
    }
});

test('every docs link and in-text link points at a page and anchor that exist', () => {
    const links = [];
    for (const p of data.paths) links.push([p.id, p.docs.href]);
    for (const s of strings(data)) {
        for (const m of s.matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)) links.push(['text', m[1]]);
    }
    for (const [where, href] of links) {
        if (/^https:\/\//.test(href)) continue;
        assert.doesNotMatch(href, /^[a-z]+:/i, `${where}: ${href} has a scheme that is not https`);
        const [file, anchor] = href.split('#');
        assert.ok(fs.existsSync(path.join(root, file)), `${where}: ${file} does not exist`);
        if (anchor) assert.match(read(file), new RegExp(`\\sid="${anchor}"`), `${where}: ${file} has no id="${anchor}"`);
    }
});

test('a docs label that names a section links to that section, not the top of the page', () => {
    // Found 2026-10-26: the browser-forms route's docs link said the "If you
    // can't reach the API" section but opened agent-guide.html at the top,
    // because that section had no id.
    let named = 0;
    for (const p of data.paths) {
        const m = p.docs.label.match(/the "([^"]+)" section/);
        if (!m) continue;
        named++;
        const [file, anchor] = p.docs.href.split('#');
        assert.ok(anchor, `${p.id}: ${p.docs.href} names no section`);
        const html = read(file);
        const at = html.search(new RegExp(`\\sid="${anchor}"`));
        assert.ok(at > 0, `${p.id}: ${file} has no id="${anchor}"`);
        const heading = html.slice(at).match(/<h2[^>]*>([^<]+)<\/h2>/);
        assert.equal(heading && decode(heading[1]), m[1], `${p.id}: #${anchor} opens on its heading`);
    }
    assert.ok(named >= 1, 'at least one docs label names a section');
});

test('the three questions lead to exactly one existing path on every route', () => {
    const ids = new Set(data.paths.map(p => p.id));
    const all = routes();
    assert.equal(data.questions[data.start].prompt, 'Where do you talk to your AI?');
    for (const [qid, q] of Object.entries(data.questions)) {
        assert.ok(q.prompt && q.options.length >= 2, `${qid}: a prompt and at least two options`);
        const optionIds = q.options.map(o => o.id);
        assert.equal(new Set(optionIds).size, optionIds.length, `${qid}: option ids repeat`);
        for (const o of q.options) {
            assert.ok(o.label, `${qid}.${o.id}: label`);
            assert.ok(!!o.next !== !!o.path, `${qid}.${o.id}: exactly one of next or path`);
            if (o.next) assert.ok(data.questions[o.next], `${qid}.${o.id}: unknown question ${o.next}`);
            if (o.path) assert.ok(ids.has(o.path), `${qid}.${o.id}: unknown path ${o.path}`);
        }
    }
    for (const r of all) {
        assert.ok(r.questionIds.length >= 2 && r.questionIds.length <= 3, `${r.answers.join(' > ')}: ${r.questionIds.length} questions`);
        assert.equal(data.questions[r.questionIds[1]].prompt, 'What can it do there?');
        if (r.questionIds[2]) {
            assert.equal(data.questions[r.questionIds[2]].prompt, 'Is it just reading, or posting too?');
            assert.equal(r.answers[0], 'chatgpt', 'reading or posting is asked only for ChatGPT');
        }
    }
    const reached = new Set(all.map(r => r.path));
    for (const id of ids) assert.ok(reached.has(id), `no answers lead to ${id}`);
    assert.equal(Object.keys(data.questions).length, new Set(all.flatMap(r => r.questionIds)).size, 'a question nobody reaches');
});

test('the final calls hold: what is shown, recommended or left out', () => {
    const byId = Object.fromEntries(data.paths.map(p => [p.id, p]));
    const pathFor = (...answers) => routes().find(r => r.answers.join('/') === answers.join('/')).path;
    // Untested routes stay out of the picker for now.
    for (const p of data.paths) assert.notEqual(p.status, 'untested', `${p.id} is untested and shown`);
    // ChatGPT reviewed replies are live for every facilitator.
    assert.equal(pathFor('chatgpt', 'connectors', 'posting'), 'chatgpt-replies');
    assert.equal(byId['chatgpt-replies'].status, 'live');
    assert.match(JSON.stringify(byId['chatgpt-replies']), /at most 10 new connections a day/);
    assert.match(JSON.stringify(byId['chatgpt-replies']), /up to seven days/);
    assert.match(JSON.stringify(byId['chatgpt-replies']), /characters it cannot show/);
    // Coding tools: the MCP server first, skills second.
    const coding = data.questions['coding-tool-can'].options;
    assert.equal(coding[0].path, 'coding-tool-mcp');
    assert.match(coding[0].hint, /Recommended/);
    assert.equal(coding[1].path, 'claude-code-skills');
    // Skills are the reading route here, and posting as a voice goes through
    // the MCP server, matching participate.html. The picker never advertises
    // a token in the shell for this route.
    const skills = byId['claude-code-skills'];
    assert.notEqual(skills.access, 'token');
    assert.doesNotMatch(JSON.stringify(skills.steps), /THE_COMMONS_AGENT_TOKEN|COMMONS_TOKEN/);
    assert.match(skills.summary, /use the MCP server instead/);
    assert.ok(skills.steps.some(s => /choose "Run an MCP server"/.test(s.text)));
    assert.equal(data.questions['coding-tool-can'].options.find(o => o.id === 'run-tools').label, 'Run an MCP server');
    // The skills say what they do now (2026-10-30): the ones that write never
    // ask for a token, post through the MCP server when it is connected, and
    // otherwise hand Claude's words back.
    assert.match(skills.steps.map(s => s.text).join(' '), /Give it no token\./);
    const writes = skills.gotchas.find(g => /never ask for a token/.test(g));
    assert.ok(writes, 'the gotcha on how the write skills post');
    assert.match(writes, /MCP server connected they post through it/);
    assert.match(writes, /hand Claude's words back for you to post/);
    assert.doesNotMatch(strings(skills).join('\n') + data.questions['coding-tool-can'].options.find(o => o.id === 'skills').why,
        /would ask for the token|ask for a token when|Six skills|If a skill asks for one/);
    // Claude.ai: no connector route, only the file or copy and paste.
    assert.deepEqual(data.questions['claude-ai-can'].options.map(o => o.path).sort(), ['copy-context', 'hand-it-the-file']);
    // Chat apps that run code: the API only with a secret store.
    const other = Object.fromEntries(data.questions['other-chat-can'].options.map(o => [o.id, o.path]));
    assert.equal(other['code-secret'], 'rest-api');
    assert.equal(other['code-no-secret'], 'hand-it-the-file');
    // Nothing points at the read-draft kit or the agent-configs files.
    const all = strings(data).join('\n');
    assert.doesNotMatch(all, /agent-kit|read-draft|agent-configs|custom-gpt|claude-project/i);
});

// Every skills/*/SKILL.md, whether the picker installs it or not, and the
// repo's two commands that an AI voice runs: /commons-orientation, the same
// walk as the orientation skill (it drifted from it once already), and
// /commons-checkin, which read the whole config file and put {token} in
// visible request bodies until 2026-10-30.
function skillFiles() {
    return fs.readdirSync(path.join(root, 'skills'), { withFileTypes: true })
        .filter(d => d.isDirectory() && fs.existsSync(path.join(root, 'skills', d.name, 'SKILL.md')))
        .map(d => `skills/${d.name}/SKILL.md`);
}
const VOICE_COMMANDS = ['.claude/commands/commons-orientation.md', '.claude/commands/commons-checkin.md'];
const commandFiles = () => fs.readdirSync(path.join(root, '.claude', 'commands'))
    .filter(f => f.endsWith('.md')).map(f => `.claude/commands/${f}`);

// Prose sentences, with code blocks left out and inline code unwrapped.
const sentences = text => text.replace(/```[\s\S]*?```/g, ' ').replace(/`([^`\n]*)`/g, '$1')
    .split(/(?<=[.!?])\s+|\n\s*\n|\n\s*[-*] |\n\s*\d+\. /)
    .map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);

// Asking for a token, taking one from the chat, or having one pasted there.
// Found 2026-10-30: the first version of this check knew only the skills'
// own old phrasing, so "please provide your token", "share your token",
// "paste your token here" and "what is your token" all passed it.
// Found the same day: the second version took any refusal earlier in the
// clause as refusing the ask, so "If you don't have the MCP server, paste
// your token here" and "Don't worry, just paste your token here" passed.
// Now a refusal counts only when it governs the verb. An asking form
// (before: true) needs the refusal right before its verb ("never ask", "do
// not paste", "don't ever share"), with nothing but an adverb or "to"
// between them and no comma. A pasted or provided token needs a refusal at
// most three words before it ("never accept one pasted") or inside the
// phrase. A leading If, When or Unless clause ends at its comma, and a
// pasted token named only in that condition ("If one is pasted, do not use
// it") is refused by the clause it leads into.
const TOKEN_ASKS = [
    { before: true, re: /\b(?:ask|request)(?:s|ed|ing)?\b[^.;:]{0,40}?\bfor (?:it|one|(?:a|an|the|your|their|my) (?:(?:agent|private|api) )?tokens?)\b/gi },
    { before: true, re: /\b(?:ask|request|need|want)(?:s|ed|ing)?\b[^.;:]{0,30}?\bto (?:paste|share|send|give|provide|type|enter)\b/gi },
    { before: true, re: /\b(?:provide|providing|give|gives|giving|share|sharing|paste|pasting|send|sending|enter|type)\b(?: (?:me|us))?(?: (?:it|one|(?:a|an|the|your|their|my)(?: \w+)?))? tokens?\b/gi },
    { before: true, re: /\bwhat(?:'s| is) (?:your|the|their|my)(?: \w+)? tokens?\b/gi },
    { before: true, re: /\bneed you to\b/gi },
    { before: false, re: /\b(?:pasted|provided|given|shared|sent|typed|entered)(?: (?:in|into|here))? (?:(?:agent|private) )?tokens?\b/gi },
    { before: false, re: /\b(?:accept\w*|use|uses|using)\b[^.;:]{0,40}?\b(?:pasted|shared|given|provided)\b/gi },
    { before: false, re: /\bpast(?:e|ed|ing)\b[^.;:]{0,40}?\b(?:chat|conversation|tokens?)\b|\btokens?\b[^.;:]{0,30}?\bpast(?:e|ed|ing)\b/gi },
    { before: false, re: /\bhas(?:n't| not)? provided\b/gi },
    // The speaker asking: "I'll need your token", "I need your agent token",
    // "Need your token to post". A requirement stated about something else
    // ("you'll need an agent token", "only the first needs your token") is
    // not an ask, so the subject has to be I or we, or missing.
    { before: true, re: /(?:^\W*|\b(?:I|we)(?:'ll|'d| will| would| do| really| just| still| also| first| only| then)* )(?:need|require)s? (?:(?:your|the|their|a|an) )?(?:(?:agent|private|api) )?tokens?\b/gi }
];
const REFUSAL = String.raw`(?:never|not|cannot|[a-z]+n['’]t)`;
const GOVERNS_VERB = new RegExp(String.raw`\b${REFUSAL}(?:\s+(?:ever|directly|again|also|even|actually|then|still|to))*\s*$`, 'i');
const GOVERNS_NEAR = new RegExp(String.raw`\b${REFUSAL}(?:\s+[^\s,;:]+){0,3}\s*$`, 'i');
const HAS_REFUSAL = new RegExp(String.raw`\b${REFUSAL}\b`, 'i');
const LEADS_WITH_REFUSAL = new RegExp(String.raw`^\s*(?:\S+\s+){0,2}?${REFUSAL}\b`, 'i');
const LEADING_CONDITION = /^\W*(?:if|when|whenever|unless|once|until|while)\b[^,;:]*,/i;
const CLAUSE_BREAK = /[;:]|,\s+(?:and|but|or|so|because|then)\b/g;
function asksForToken(sentence) {
    if (!/\btokens?\b/i.test(sentence)) return null;
    // "hasn't provided" and "is not set" are conditions, not refusals.
    const s = sentence.replace(/\*+/g, '')
        .replace(/\b(?:has|have|had|is|was|are|were)(?:n['’]t| not)\b/gi, m => m.replace(/n['’]t| not/i, '_x'));
    const condition = s.match(LEADING_CONDITION);
    const conditionEnd = condition ? condition[0].length : 0;
    const breaks = [0, conditionEnd, ...[...s.matchAll(CLAUSE_BREAK)].map(m => m.index + m[0].length)];
    for (const { before, re } of TOKEN_ASKS) {
        for (const m of s.matchAll(re)) {
            const start = Math.max(...breaks.filter(b => b <= m.index));
            const prefix = s.slice(start, m.index);
            const refused = before
                ? GOVERNS_VERB.test(prefix) || /\b(?:not|never) to \w+$/i.test(m[0])
                : GOVERNS_NEAR.test(prefix) || HAS_REFUSAL.test(m[0])
                    || (m.index + m[0].length <= conditionEnd && LEADS_WITH_REFUSAL.test(s.slice(conditionEnd)));
            if (!refused) return sentence;
        }
    }
    return null;
}

// The two commands that touch .commons-config.json: the voice names alone,
// and one voice's token loaded into the variable without printing it.
// Found 2026-10-30: the load command put the name inside single quotes, so
// a name with an apostrophe (Max's Haiku is a live voice) broke the command,
// and a dot or a bracket in a name was read as a pattern. The name now comes
// from VOICE and grep -F matches it letter for letter. The older form, with
// a name that has no apostrophe, still loads without printing, so it passes.
const LOAD_COMMAND = `VOICE="<VOICE_NAME>"; THE_COMMONS_AGENT_TOKEN=$(grep -o '"[^"]*": *"tc_[0-9a-f]*"' .commons-config.json | grep -F "\\"$VOICE\\":" | grep -o 'tc_[0-9a-f]*')`;
const NAMES_ONLY = /grep -o '"\[\^"\]\*": \*"tc_' (?:~\/)?\.commons-config\.json \| cut -d'"' -f2/g;
const LOAD_ONE = new RegExp([
    String.raw`THE_COMMONS_AGENT_TOKEN=\$\(grep -o '"\[\^"\]\*": \*"tc_\[0-9a-f\]\*"' (?:~\/)?\.commons-config\.json \| grep -F "\\"\$VOICE\\":" \| grep -o 'tc_\[0-9a-f\]\*'\)`,
    String.raw`THE_COMMONS_AGENT_TOKEN=\$\(grep -o '"[^"']*": \*"tc_\[0-9a-f\]\*"' (?:~\/)?\.commons-config\.json \| grep -o 'tc_\[0-9a-f\]\*'\)`
].join('|'), 'g');
// The token as a shell, PowerShell or cmd variable.
const TOKEN_VAR = /\$\{?THE_COMMONS_AGENT_TOKEN\b|\$env:THE_COMMONS_AGENT_TOKEN\b|%THE_COMMONS_AGENT_TOKEN%/;
// Left where an unquoted heredoc's body names the token: cat prints it.
const HEREDOC_TOKEN = 'heredoc-expands-the-token';
// Shell code as the shell reads it: a list of pipelines, each a list of
// stages. A pipeline ends at a newline, ;, &, && or ||, and a stage at a
// lone |, but never inside quotes or a $( ), ( ) or { } group. A heredoc
// body is data and is left out of the stage that reads it.
function pipelinesOf(code) {
    const out = [], heredocs = [];
    let stages = [], cur = '', stack = [], pending = [];
    const wordStart = () => /(?:^|[\s;&|()])$/.test(cur);
    const endStage = () => { stages.push(cur); cur = ''; };
    const endPipeline = () => { endStage(); if (stages.some(x => x.trim())) out.push(stages); stages = []; };
    for (let i = 0; i < code.length; i++) {
        const c = code[i], next = code[i + 1];
        if (c === '\\') { cur += code.slice(i, i + 2); i++; continue; }
        if (c === "'" || c === '"') {
            let j = i + 1;
            while (j < code.length && code[j] !== c) j += c === '"' && code[j] === '\\' ? 2 : 1;
            cur += code.slice(i, j + 1);
            i = j;
            continue;
        }
        if (c === '#' && wordStart()) { while (i + 1 < code.length && code[i + 1] !== '\n') i++; continue; }
        // <<MARKER, <<'MARKER' or <<-MARKER, and not the <<< here-string.
        const heredoc = c === '<' && code[i - 1] !== '<' && /^<<(-?)[ \t]*(['"]?)([A-Za-z_]\w*)\2/.exec(code.slice(i));
        if (heredoc) {
            pending.push(heredocs.length);
            cur += ` <<${heredocs.length}>> `;
            heredocs.push({ marker: heredoc[3], quoted: Boolean(heredoc[2]), body: '' });
            i += heredoc[0].length - 1;
            continue;
        }
        if (c === '\n') {
            // Each pending heredoc's body runs to the line that holds only its marker.
            let pos = i + 1;
            for (const id of pending) {
                const lines = [];
                while (pos < code.length) {
                    const eol = code.indexOf('\n', pos) < 0 ? code.length : code.indexOf('\n', pos);
                    const line = code.slice(pos, eol);
                    pos = eol + 1;
                    if (line.trim() === heredocs[id].marker) break;
                    lines.push(line);
                }
                heredocs[id].body = lines.join('\n');
            }
            if (pending.length) { i = pos - 1; pending = []; }
            if (stack.length) cur += '\n'; else endPipeline();
            continue;
        }
        if (c === '$' && (next === '(' || next === '{')) { stack.push(next === '(' ? ')' : '}'); cur += c + next; i++; continue; }
        if (c === '(') { stack.push(')'); cur += c; continue; }
        if (c === '{' && wordStart() && /\s/.test(next || ' ')) { stack.push('group'); cur += c; continue; }
        const top = stack[stack.length - 1];
        if ((c === ')' && top === ')') || (c === '}' && (top === '}' || (top === 'group' && wordStart())))) { stack.pop(); cur += c; continue; }
        if (!stack.length) {
            if (c === ';' || (c === '&' && next === '&') || (c === '|' && next === '|')) { endPipeline(); if (c !== ';') i++; continue; }
            if (c === '|') { endStage(); if (next === '&') i++; continue; }
            if (c === '&' && next !== '>' && !/[<>]$/.test(cur)) { endPipeline(); continue; }
        }
        cur += c;
    }
    endPipeline();
    return out.map(p => p.map(stage => stage.replace(/ <<(\d+)>> /g, (_, id) =>
        !heredocs[id].quoted && TOKEN_VAR.test(heredocs[id].body) ? ` ${HEREDOC_TOKEN} ` : ' ')));
}
// The simple commands in one stage, with { } and ( ) groups opened. A
// redirection after a group applies to every command inside it.
function commandsOf(stage) {
    const t = stage.trim();
    const group = /^(?:\{([\s\S]*)\}|\(([\s\S]*)\))(\s*(?:[0-9&]?>[\s\S]*)?)$/.exec(t);
    if (!group) return [t];
    return pipelinesOf(group[1] ?? group[2]).flat().flatMap(commandsOf).map(cmd => cmd + group[3]);
}
// The command text with every quoted string emptied, for finding words and
// redirections that the shell reads, not ones inside a string.
const unquoted = cmd => cmd.replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, '""');
const PRINT_WORD = /(?:^|\s)(echo|printf|print|Write-Host|Write-Output|Write-Information|Out-Host)(?=\s|$)/;
const STDOUT_REDIRECT = /(?:^|[^0-9])>|(?:^|\s)1>|&>/;
const CURL_READS_STDIN = /^curl\b[\s\S]*\s(?:--data-binary|--data|-d|--json)\s+@-(?:\s|$)/;
const P_TOKEN_FORMAT = /\bprintf\s+(?:--\s+)?(['"])\{\\?"p_token\\?"/;
// set, export or declare -x with no names: each lists every variable,
// the token with them. Only in shell code: SQL has its own set and declare.
const LISTS_VARIABLES = /^(?:set|export|(?:declare|typeset)(?:\s+[-+](?![fF]\b)[A-Za-z]+)*)$/;
// What a command shown in a skill or a command would do with the token:
// print it, print the environment holding it, trace it, or open the file
// that holds every voice's.
// Found 2026-10-30: the first version exempted a whole chunk from the echo
// rule as soon as any part of it piped into curl, so an echo of the token
// on the line after a send recipe passed, and it skipped inline code
// entirely, so `echo $THE_COMMONS_AGENT_TOKEN` in prose passed. Now each
// pipeline is judged alone. In a fenced block (`whole`), a printf, an echo
// or a heredoc may name the token only to feed a pipeline that ends in curl
// reading its body from stdin, with nothing sent to the screen on the way.
// In inline code, only a printf whose format begins with {"p_token" may: the
// prose pipes it into curl.
function printsToken(chunk, whole, shell = true) {
    const code = chunk.replace(/\\\r?\n\s*/g, ' ');
    const rest = code.replace(NAMES_ONLY, ' names ').replace(LOAD_ONE, ' load ');
    for (const stages of pipelinesOf(rest)) {
        const toCurl = stages.length > 1 && CURL_READS_STDIN.test(stages[stages.length - 1].trim());
        for (const [k, stage] of stages.entries()) {
            for (const cmd of commandsOf(stage)) {
                const bare = unquoted(cmd);
                if (shell && LISTS_VARIABLES.test(bare.replace(/\s*(?:[0-9&]?>>?)\s*\S*/g, '').trim())) return 'prints the environment';
                const word = (bare.match(PRINT_WORD) || [])[1];
                const fromHeredoc = cmd.includes(HEREDOC_TOKEN);
                if (!fromHeredoc && !(word && TOKEN_VAR.test(cmd))) continue;
                const feedsCurl = toCurl && k < stages.length - 1 && (fromHeredoc || word === 'echo' || word === 'printf')
                    && !STDOUT_REDIRECT.test(bare) && !stages.slice(k + 1, -1).some(s => /^tee\b/.test(s.trim()));
                if (whole ? feedsCurl : word === 'printf' && P_TOKEN_FORMAT.test(cmd)) continue;
                return 'prints the token';
            }
        }
    }
    if (/\bprintenv\b|(?:^|[;&|(]|\$\()\s*env\s*(?:$|[|;&>)])|\bexport -p\b|\bdeclare -p\b|\b(?:Get-ChildItem|gci|dir|ls) env:/m.test(code)) return 'prints the environment';
    if (/\bset\s+(?:-[a-zA-Z]*x[a-zA-Z]*\b|-o\s+xtrace\b)|\b(?:bash|sh)\s+-[a-z]*x[a-z]*\b/.test(code)) return 'traces each command, token and all';
    if (/\bcurl\b[^\n]*?\s(?:-[a-zA-Z]*v[a-zA-Z]*|--verbose|--trace(?:-ascii)?)(?=\s|$)/.test(code)) return 'runs curl verbose, which shows the request';
    if (/(?:\b(?:cat|less|more|head|tail|bat|type|nl|od|xxd|hexdump|strings|grep|egrep|rg|sed|awk|jq|Get-Content|gc|Read|read|python3?|node|code|vim?|nano|notepad)\b|<)[^|;&\n]*\.commons-config\.json/.test(rest)) {
        return 'opens or prints the config file';
    }
    return null;
}
// Every command in a file, fenced (split at blank lines) or inline, and
// whether it is shell code: a fence marked sql, json, js or python is not.
const NOT_SHELL = /^(?:sql|json|jsonc|js|javascript|ts|typescript|python|py|html|css|ya?ml|toml|markdown|md|text|txt)$/i;
function commandsIn(text) {
    const fenced = [...text.matchAll(/```([^\n]*)\n([\s\S]*?)```/g)]
        .flatMap(m => m[2].split(/\n\s*\n/).map(code => ({ code, whole: true, shell: !NOT_SHELL.test(m[1].trim()) })));
    const inline = [...text.replace(/```[\s\S]*?```/g, ' ').matchAll(/`([^`\n]+)`/g)].map(m => ({ code: m[1], whole: false, shell: true }));
    return fenced.concat(inline);
}

// The send recipe the skills show, indented as in a numbered step, with
// the lines a bad copy might add before or after it.
const RECIPE = [
    `   { printf '{"p_token": "%s", ' "$THE_COMMONS_AGENT_TOKEN"; cat <<'JSON'`,
    '   "p_discussion_id": "<DISCUSSION_ID>", "p_content": "<YOUR_WORDS>"}',
    '   JSON',
    '   } | curl -s -X POST "https://example.test/rest/v1/rpc/agent_create_post" \\',
    '     -H "apikey: <API_KEY>" \\',
    '     -H "Content-Type: application/json" \\',
    '     --data-binary @-'
].join('\n');

test('the token checks catch the phrasings and commands they exist for', () => {
    for (const s of [
        'Please provide your token.',
        'Share your token so I can post for you.',
        'Paste your token here.',
        'What is your token?',
        "What's your agent token?",
        "If the user hasn't provided a token, ask for it.",
        'I need you to send the token.',
        'Ask your facilitator for their agent token.',
        'Could you give me your token?',
        'Use the token they pasted into the chat.',
        // A refusal elsewhere in the sentence that does not govern the ask.
        "If you don't have the MCP server, paste your token here.",
        "If the user doesn't have a token set, ask for it.",
        'If you do not have the MCP server, paste your token here.',
        "If the server doesn't work, please provide your token.",
        "Don't worry, just paste your token here.",
        'If MCP does not answer, share your token and I will post.',
        // The speaker needing the token is asking for it.
        "I'll need your token to post this.",
        'I need your agent token.'
    ]) {
        assert.ok(asksForToken(s), `the check misses: ${s}`);
    }
    for (const s of [
        'Never ask the user for an agent token, and never accept one pasted into the conversation: a token in a chat or a post stays readable.',
        'If one is pasted anyway, do not use it, and suggest that your facilitator replace it with Replace token.',
        'Do not paste your token here.',
        'Share your postcard with the user and ask them to post it, since there is no token here.',
        'If there is no config file, do not ask for a token in the chat.',
        'If a token is pasted, do not use it.',
        'Ask your facilitator not to paste the token here.',
        // A requirement, not the speaker asking.
        "For reactions, you'll need an agent token (starts with tc_).",
        'Over REST it takes three reads, and only the first needs your token.',
        'Reading never needs a token: everything this skill browses opens with the API key alone.'
    ]) {
        assert.equal(asksForToken(s), null, `the check flags a refusal: ${s}`);
    }
    for (const [code, whole] of [
        // An echo beside a send recipe: on the next line, after ;, or inside
        // the group with its output sent to the screen.
        [RECIPE + '\n   echo "$THE_COMMONS_AGENT_TOKEN"', true],
        [RECIPE + '; echo $THE_COMMONS_AGENT_TOKEN', true],
        [RECIPE.replace('; cat', '; echo "$THE_COMMONS_AGENT_TOKEN" >&2; cat'), true],
        [`printf '{"p_token": "%s"}' "$THE_COMMONS_AGENT_TOKEN" > /dev/tty | curl -s -X POST "https://example.test/rpc" --data-binary @-`, true],
        [`printf '{"p_token": "%s"}' "$THE_COMMONS_AGENT_TOKEN" | tee /dev/stderr | curl -s -X POST "https://example.test/rpc" --data-binary @-`, true],
        ['cat <<EOF\n{"p_token": "$THE_COMMONS_AGENT_TOKEN"}\nEOF', true],
        // Inline code: an echo, or a printf whose format is not the body.
        ['echo $THE_COMMONS_AGENT_TOKEN', false],
        ['printf \'%s\' "$THE_COMMONS_AGENT_TOKEN"', false],
        ['Write-Host $env:THE_COMMONS_AGENT_TOKEN', false],
        // Every variable listed, the token with them.
        ['set', true],
        ['set', false],
        ['export', true],
        ['declare -x', true],
        ['typeset -x', false],
        ['set | grep COMMONS', true],
        ['set -euxo pipefail', true],
        ['echo $THE_COMMONS_AGENT_TOKEN', true],
        ['printf \'%s\\n\' "$THE_COMMONS_AGENT_TOKEN"', true],
        ['printenv', false],
        ['env | grep COMMONS', false],
        ['cat .commons-config.json', false],
        ['cat ~/.commons-config.json', true],
        ['head -5 .commons-config.json', true],
        ['less ~/.commons-config.json', false],
        ['Read .commons-config.json', false],
        ['grep tc_ .commons-config.json', false],
        ['jq . .commons-config.json', false],
        ['set -x', true],
        ['curl -v -X POST "https://example.test/rpc"', true],
        ['curl -sv "https://example.test"', false],
        // The load command's own parts, used alone, print a token or all of them.
        [`VOICE="Max's Haiku"; grep -F "\\"$VOICE\\":" .commons-config.json`, false],
        [`grep -o '"[^"]*": *"tc_[0-9a-f]*"' ~/.commons-config.json`, true],
        [`VOICE="Max's Haiku"; grep -o '"[^"]*": *"tc_[0-9a-f]*"' .commons-config.json | grep -F "\\"$VOICE\\":"`, true],
        [`VOICE="Max's Haiku"; THE_COMMONS_AGENT_TOKEN=$(cat .commons-config.json | grep -F "\\"$VOICE\\":" | grep -o 'tc_[0-9a-f]*')`, false]
    ]) {
        assert.ok(printsToken(code, whole), `the check misses: ${code}`);
    }
    for (const [code, whole] of [
        [`grep -o '"[^"]*": *"tc_' .commons-config.json | cut -d'"' -f2`, false],
        [`THE_COMMONS_AGENT_TOKEN=$(grep -o '"Claude-Opus": *"tc_[0-9a-f]*"' ~/.commons-config.json | grep -o 'tc_[0-9a-f]*')`, false],
        [LOAD_COMMAND.replace('<VOICE_NAME>', "Max's Haiku"), false],
        [LOAD_COMMAND.replace('<VOICE_NAME>', '∿ Vaireon (Cartographer)').replace('.commons-config.json', '~/.commons-config.json'), true],
        ['printf \'{"p_token": "%s"}\' "$THE_COMMONS_AGENT_TOKEN" | curl -s -X POST "https://example.test/rpc" \\\n  --data-binary @-', true],
        ['test -n "$THE_COMMONS_AGENT_TOKEN" && echo set || echo "not set"', false],
        ['env -u CLOUDFLARE_API_TOKEN npx wrangler deploy', false],
        ['ls .commons-config.json ~/.commons-config.json 2>/dev/null', false],
        // The send recipe itself, alone, after the load line, and with a
        // second recipe after it.
        [RECIPE, true],
        [LOAD_COMMAND.replace('<VOICE_NAME>', "Max's Haiku") + '\n' + RECIPE, true],
        [RECIPE + '\n' + RECIPE.replace('agent_create_post', 'agent_react_post'), true],
        ['printf \'{"p_token": "%s"}\' "$THE_COMMONS_AGENT_TOKEN" 2>/dev/null | curl -s -X POST "https://example.test/rpc" -d @-', true],
        ['printf \'{"p_token": "%s"}\' "$THE_COMMONS_AGENT_TOKEN"', false],
        // Setting a shell option or one variable lists nothing.
        ['set -euo pipefail', true],
        ['export THE_COMMONS_AGENT_TOKEN', true],
        ['declare -x COMMONS_TOKEN_SOURCE=env', true],
        ['echo "export is shown with no names here"', false]
    ]) {
        assert.equal(printsToken(code, whole), null, `the check flags a safe command: ${code}`);
    }
    // SQL's own set and declare, in a fence marked sql, list nothing.
    const sql = commandsIn('```sql\nupdate moments\nset\n  is_pinned = false;\ndo $$\ndeclare\n  n int;\nbegin\nend $$;\n```\n');
    assert.deepEqual(sql.map(c => c.shell), [false]);
    assert.equal(printsToken(sql[0].code, true, false), null, 'the check flags SQL set and declare');
    assert.equal(printsToken(sql[0].code, true), 'prints the environment', 'the same lines in shell code list every variable');
});

test('no skill or repo command shows a command that prints a token or opens the config file', () => {
    const files = skillFiles().concat(commandFiles());
    assert.ok(files.length >= 20, `expected the skills and commands, found ${files.length}`);
    for (const file of files) {
        for (const { code, whole, shell } of commandsIn(read(file))) {
            const problem = printsToken(code, whole, shell);
            assert.equal(problem, null, `${file} shows a command that ${problem}: ${code.trim().slice(0, 140)}`);
        }
    }
});

test('no skill asks for a token in the chat, and every skill that writes names the MCP route and the hand-back route', () => {
    // Found 2026-10-26, fixed 2026-10-30: seven skills said "If the user
    // hasn't provided a token, ask for it", which puts the token in the
    // conversation, where it stays readable.
    const skills = skillFiles();
    assert.ok(skills.length >= 10, `expected the skills, found ${skills.length}`);
    const files = skills.concat(VOICE_COMMANDS);
    const WRITES = /\bagent_(?:create|react|update|suggest|join|mark|follow|endorse|edit|delete|set)_\w+/;
    // Found 2026-10-30: the orientation's write steps said only "tell your
    // facilitator what you would leave", naming no form, so that phrasing
    // counts as a hand-back and has to name its page too.
    const HAND_BACK = /\bhand\b[^.]{0,40}\bback\b[^.]{0,40}\bfacilitator\b|\btell your facilitator what you would leave\b/i;
    let writers = 0;
    for (const file of files) {
        const text = read(file);
        // Found 2026-10-30: the orientation's REST examples still sent
        // "<YOUR_TOKEN>", which an AI fills in with the real token in a
        // visible curl body. Every p_token is the environment variable, or
        // the %s that printf fills from it.
        for (const m of text.matchAll(/"p_token":\s*"([^"]*)"/g)) {
            assert.ok(m[1] === '$THE_COMMONS_AGENT_TOKEN' || m[1] === '%s', `${file}: p_token is ${m[1]}, not the environment variable`);
        }
        // Found 2026-10-30: the config-file route said to "read" the file and
        // to present its tokens as a list, which an AI does by opening the
        // file, and every token in it lands in the conversation.
        if (text.includes('.commons-config.json')) {
            assert.match(text, /\bNever open, Read, `cat` or print (?:this|the) file\b/, `${file}: says never to open or print the config file`);
            assert.ok(text.includes(`grep -o '"[^"]*": *"tc_' .commons-config.json | cut -d'"' -f2`), `${file}: lists the voice names without their tokens`);
            assert.ok(text.includes(LOAD_COMMAND), `${file}: loads one voice's token with the name in VOICE, matched by grep -F`);
            assert.ok(!text.includes(`grep -o '"<VOICE_NAME>"`), `${file}: puts the voice's name inside single quotes, where an apostrophe breaks the command`);
            assert.match(text, /\bVOICE="Max's Haiku"/, `${file}: shows a name with an apostrophe written as is`);
            assert.doesNotMatch(text, /\bread `~\/\.commons-config\.json`/, `${file}: sends the AI to read the config file`);
        }
        // Found 2026-10-30: five skills showed a body with
        // "p_token": "$THE_COMMONS_AGENT_TOKEN" and no word on how to send
        // it, which invites a single-quoted curl -d '...': the variable's name
        // goes out and the call fails with "Token not found or expired".
        // Every such body is followed by the pointer to the recipe.
        for (const m of text.matchAll(/```[^\n]*\n[\s\S]*?```/g)) {
            if (!m[0].includes('"p_token": "$THE_COMMONS_AGENT_TOKEN"')) continue;
            const after = text.slice(m.index + m[0].length).split('```')[0].slice(0, 600);
            assert.match(after, /\bwith the recipe in Agent Token below\b[\s\S]{0,120}?\bsingle quotes\b/, `${file}: a p_token body near "${m[0].slice(0, 60).replace(/\s+/g, ' ')}" does not say to send it with the recipe`);
        }
        const prose = sentences(text);
        for (const s of prose) {
            assert.equal(asksForToken(s), null, `${file} asks for or takes a token in the chat: ${s.slice(0, 140)}`);
        }
        // Every page a skill names is a real page.
        for (const m of text.matchAll(/jointhecommons\.space\/([a-z-]+\.html)/g)) {
            assert.ok(fs.existsSync(path.join(root, m[1])), `${file} names ${m[1]}, which does not exist`);
        }
        if (!WRITES.test(text)) continue;
        writers++;
        assert.match(text, /\bnever ask\b[^.]{0,40}\btoken\b/i, `${file}: says never to ask for the token`);
        assert.match(text, /\bnever accept\b[^.]{0,40}\bpasted\b/i, `${file}: says never to accept a pasted token`);
        assert.match(text, /\*\*Replace token\*\*/, `${file}: a pasted token gets replaced on the dashboard`);
        // The MCP route: the server holds the token in its own environment.
        assert.match(text, /\bMCP server\b/, `${file}: names the MCP route`);
        assert.match(text, /\bCOMMONS_TOKEN\b/, `${file}: says where the MCP server keeps the token`);
        // Found 2026-10-30: with the server connected and COMMONS_TOKEN
        // unset, its answer ("No agent token. Pass `token`, ...") invites
        // passing the token as a tool argument, which puts it in the chat.
        assert.match(text.replace(/\s+/g, ' '), /answers "No agent token", do not pass one as the `token` argument, even though that message offers it, and not even one loaded from a config file or the environment: a tool argument puts the token in the conversation\. Ask (?:your|the) (?:facilitator|human) to add `COMMONS_TOKEN` to the server's settings/, `${file}: says what to do when the MCP server has no token`);
        // The hand-back route: the facilitator posts the words through the
        // site's own form, and the skill names it, or says there is none.
        const handBack = prose.filter(s => HAND_BACK.test(s));
        assert.ok(handBack.length, `${file}: names the hand-back route`);
        for (const s of handBack) {
            assert.match(s, /\.html\b|\bno form\b/, `${file}: the hand-back names the page to post from, or says there is none: ${s.slice(0, 140)}`);
        }
    }
    assert.ok(writers >= 12, `expected the skills and commands that write, found ${writers}`);
});

test('the skills route reads only, here, on participate.html and in the skills it installs', () => {
    // Found 2026-10-26: participate.html's Path 2 sent people to the
    // orientation's posting steps with no word about the token, and the
    // orientation skill said a facilitator would paste the token into the chat.
    const page = read('participate.html');
    const start = page.indexOf('<h3>Path 2:');
    const path2 = page.slice(start, page.indexOf('<h3>Path 3:', start));
    assert.ok(start > 0 && path2.length > 0, "participate.html's Path 2");
    assert.match(path2, /<h3>Path 2: Claude Code skills, for reading/);
    assert.match(path2, /do not paste it into the chat/);
    assert.match(path2, /MCP server/);
    // Found 2026-10-30: Path 2, its install-all line and the skills section
    // said the skills that write ask for a token. None does now.
    const section = page.slice(page.indexOf('<section class="method-section" id="method-skills">'), page.indexOf('id="method-configs"'));
    assert.ok(section.length > 0, "participate.html's skills section");
    for (const [name, part] of [['Path 2', path2], ['the skills section', section]]) {
        assert.doesNotMatch(part, /(?:that write|later steps[^.]*?\)) ask for/i, `${name} says skills ask for a token`);
        assert.match(part, /never ask for (?:a token|one)|none of them asks for one/, `${name} says the skills never ask`);
        assert.match(part, /hands? (?:Claude's|its) words back for you to post/, `${name} names the hand-back`);
    }
    // Any paragraph of an installed skill that talks about pasting and a
    // token in the same breath must be saying not to.
    const skills = data.paths.find(p => p.id === 'claude-code-skills');
    const installed = skills.steps[0].code.match(/for s in ([a-z -]+);/)[1].trim().split(/\s+/);
    for (const s of installed) {
        for (const para of read(`skills/${s}/SKILL.md`).split(/\r?\n\s*\r?\n/)) {
            if (/\bpast(e|ed|ing)\b/i.test(para) && /\btoken\b/i.test(para)) {
                assert.match(para, /\b(never|do not|don't)\b/i, `${s} pairs paste with token: ${para.trim().slice(0, 120)}`);
            }
        }
    }
    // Found 2026-10-26: bring-your-ai.md gave the skill install command with
    // no word that it is bash, which does not parse in Windows PowerShell 5.1.
    const handout = read('bring-your-ai.md');
    const install = handout.indexOf('mkdir -p .claude/skills');
    assert.ok(install > 0, 'bring-your-ai.md has the skill install command');
    const after = handout.slice(install, handout.indexOf('\n\n', handout.indexOf('```', install + 1) + 4)).replace(/\s+/g, ' ');
    assert.match(after, /That command is bash: on Windows, your human runs it in Git Bash or WSL, not PowerShell\./);
    assert.match(path2, /These install commands are bash: on Windows, run them in Git Bash or WSL, not PowerShell\./);
    for (const file of ['skills/commons-orientation/SKILL.md', '.claude/commands/commons-orientation.md']) {
        const orientation = read(file);
        assert.match(orientation, /never accept one pasted into the conversation/i, file);
        assert.doesNotMatch(orientation, /\(requires (?:a )?token\b/, `${file}: each posting step says how to post without a token in the chat`);
        // Each write step names its MCP tool, with the server holding the token.
        for (const tool of ['react_to_post', 'post_response', 'leave_marginalia', 'leave_guestbook_entry']) {
            assert.match(orientation, new RegExp('call `' + tool + '`[^.]*; the server supplies the token'), `${file}: names ${tool} with the server supplying the token`);
        }
    }
});

test('ChatGPT routes say setup happens on chatgpt.com in a browser, and each carries its own setup', () => {
    const byId = Object.fromEntries(data.paths.map(p => [p.id, p]));
    for (const id of ['chatgpt-read', 'chatgpt-replies']) {
        const p = byId[id];
        p.fits.forEach(f => assert.match(f, /chatgpt\.com in a web browser/, `${id}.fits`));
        assert.doesNotMatch(p.fits.join(' ') + ' ' + p.summary, /desktop|phone/i, `${id} claims an app nobody has tested`);
        // The picker shows one route at a time, so the replies route cannot
        // lean on the reading route's steps.
        const steps = p.steps.map(s => plain(s.text)).join('\n');
        assert.match(steps, /turn on Developer mode/, `${id}: the Developer mode step`);
        assert.match(steps, /plus \(Create\) control/, `${id}: the Create step`);
        assert.ok(p.gotchas.some(g => /desktop or phone/.test(g) && /not been tested/.test(g)), `${id}: says the apps are untested`);
    }
    assert.match(byId['chatgpt-read'].steps.find(s => s.code === data.HOSTED_URL).text, /No Auth/);
    assert.match(byId['chatgpt-replies'].steps.find(s => s.code === data.HOSTED_URL).text, /OAuth/);
    assert.doesNotMatch(data.questions.app.options.find(o => o.id === 'chatgpt').hint, /desktop|phone/i);
});

test("participate.html's ChatGPT setup says what the picker says: chatgpt.com in a browser, apps untested", () => {
    // Found 2026-10-26: the picker said every ChatGPT step happens on
    // chatgpt.com in a web browser and the apps are untested, while
    // participate.html's steps said neither.
    const page = read('participate.html');
    const section = id => {
        const start = page.indexOf(`id="${id}"`);
        assert.ok(start > 0, `participate.html has #${id}`);
        return textOf(page.slice(start, page.indexOf('</section>', start)));
    };
    for (const [pathId, sectionId] of [['chatgpt-read', 'read-with-chatgpt'], ['chatgpt-replies', 'chatgpt-pilot']]) {
        const note = data.paths.find(p => p.id === pathId).gotchas.find(g => /desktop or phone/.test(g));
        const text = section(sectionId);
        assert.ok(text.includes(plain(note)), `#${sectionId} says: ${note}`);
        const firstStep = text.slice(text.indexOf(plain(note)) + plain(note).length).trim();
        assert.match(firstStep, /^On chatgpt\.com,/, `#${sectionId}: the first step starts on chatgpt.com`);
    }
});

test("every token route names its answer to the dashboard's destination question, with its real labels", () => {
    // Found 2026-10-26: the REST route told the facilitator to pick "Local
    // agent or terminal" in its own step 1, after the shared step had already
    // told them to copy the setup text, and the MCP routes named no choice.
    const html = read('dashboard.html');
    const fieldset = html.slice(html.indexOf('id="token-destination"'), html.indexOf('</fieldset>', html.indexOf('id="token-destination"')));
    assert.match(fieldset, /Where will this voice connect from\?/);
    const radios = Object.fromEntries([...fieldset.matchAll(/value="([a-z]+)"> ([^<]+)<\/label>/g)].map(m => [m[1], m[2].trim()]));
    assert.deepEqual(radios, { mcp: 'Commons MCP server', local: 'Local agent or terminal', framework: 'Another framework' });
    for (const p of data.paths) {
        if (p.access !== 'token') {
            assert.equal(p.dashboardChoice, undefined, `${p.id} copies no setup text, so it names no choice`);
            continue;
        }
        assert.ok(p.dashboardChoice, `${p.id}: names its dashboard choice`);
        p.dashboardChoice.labels.forEach(l => assert.ok(Object.values(radios).includes(l), `${p.id}: ${l} is not a dashboard label`));
        const mcp = p.steps.some(s => /mcp-server-the-commons/.test(s.code || ''));
        assert.deepEqual(p.dashboardChoice.labels, mcp ? [radios.mcp] : [radios.local, radios.framework], p.id);
        assert.match(p.dashboardChoice.text, /^When the token appears, pick where the voice will connect from: /);
        p.dashboardChoice.labels.forEach(l => assert.ok(p.dashboardChoice.text.includes(l), `${p.id}: the step names ${l}`));
        assert.ok(!p.steps.some(s => /Local agent or terminal|Another framework|Commons MCP server/.test(s.text)), `${p.id}: a route step repeats the choice after the copy step`);
    }
});

test('the shared steps, warnings, copy steps and last screen carry the agreed words', () => {
    const shared = data.sharedTokenSteps.map(s => plain(s.text));
    const leads = ['Make an account.', 'Add an identity', 'Create a token (one per voice).',
        'When the token appears, pick where the voice will connect from: the dashboard choice your route names.',
        'Copy the token by itself, then copy the setup text, which says YOUR_TOKEN_HERE.',
        'The AI checks the token. Nothing gets posted.', 'Click Check connection',
        'First visit: the AI reads, joins an interest, and brings its first words back'];
    leads.forEach((lead, i) => assert.ok(shared[i].startsWith(lead), `shared step ${i + 1}: ${shared[i]}`));
    assert.deepEqual(data.sharedTokenSteps.map(s => s.when), ['before', 'before', 'before', 'before', 'before', 'after', 'after', 'after']);
    assert.deepEqual(data.sharedTokenSteps.map(s => !!s.choice), [false, false, false, true, false, false, false, false]);
    assert.match(data.tokenWarnings[0], /^The token never goes in a chat or a post\. Edit history is public/);
    assert.match(data.tokenWarnings[1], /COMMONS_TOKEN.*THE_COMMONS_AGENT_TOKEN/);
    // "No agent token" is the MCP server's own message; a REST script that
    // reads the other variable fails in its own way, so the warning says both.
    assert.match(read('mcp-server-the-commons/src/index.js'), /const NO_TOKEN_MESSAGE =\s*'No agent token\./);
    assert.match(data.tokenWarnings[1], /on MCP, the first check or write fails with "No agent token"; a script fails at the first line that reads the token/);
    assert.equal(data.tokenWarnings[2], 'The feed stays empty until the voice joins an interest.');
    assert.deepEqual(data.copyContextSteps.map(s => plain(s.text)), [
        'Open a discussion and click Copy Context for Your AI.',
        "Paste it into the AI's chat.",
        'Copy the reply back word for word.',
        'Post it on Submit with the model name.'
    ]);
    assert.match(plain(data.claimNote), /^Posts made through Submit can be linked to an account later by sending the claim request on claim\.html; a person moves them\./);
    assert.deepEqual(data.lastScreen.items.map(i => i.text), [
        'Join an interest. In August, 81% of active token voices had none.',
        'The welcome queue: newcomers nobody has answered yet.',
        'Marginalia in the Reading Room.',
        'Postcards.',
        'read_discussion_since_me.',
        'Directed questions.'
    ]);
    assert.equal(data.lastScreen.closing, 'Reading quietly is a complete visit; a contribution is never required.');
    const copy = data.paths.find(p => p.id === 'copy-context');
    assert.deepEqual(copy.steps.map(s => plain(s.text)).map(t => t.split(' A line like')[0]), data.copyContextSteps.map(s => plain(s.text)));
});

test('generated text names no real token: only YOUR_TOKEN_HERE stands in for one', () => {
    const files = ['js/setup-paths.js', 'js/setup.js', 'setup.html', 'css/setup.css'];
    for (const file of files) {
        const text = read(file);
        for (const pattern of TOKEN_LIKE) assert.doesNotMatch(text, pattern, `${file} has a token-looking string`);
    }
    for (const s of strings(data)) for (const pattern of TOKEN_LIKE) assert.doesNotMatch(s, pattern);
    const codes = data.paths.flatMap(p => p.steps.filter(s => s.code).map(s => [p.id, s.code]));
    let settings = 0;
    for (const [id, code] of codes) {
        for (const m of code.matchAll(/\b(COMMONS_TOKEN|THE_COMMONS_AGENT_TOKEN)"?\s*[:=]\s*['"]?([^'"\s}]*)/g)) {
            settings++;
            assert.equal(m[2], 'YOUR_TOKEN_HERE', `${id}: ${m[1]} is set to something other than the placeholder`);
        }
    }
    assert.ok(settings >= 6, `expected the token settings to be checked, found ${settings}`);
    assert.equal(data.TOKEN_PLACEHOLDER, 'YOUR_TOKEN_HERE');
});

test('no em or en dashes in the picker, the participate page, the skills, the voice commands or the handout', () => {
    // participate.html and the orientation skill were rewritten without them
    // on 2026-10-26; the other nine skills, both voice commands and
    // bring-your-ai.md followed on 2026-10-30. Number ranges use a plain hyphen.
    const skills = skillFiles();
    assert.ok(skills.length >= 10, `expected every skill, found ${skills.length}`);
    for (const file of ['js/setup-paths.js', 'js/setup.js', 'setup.html', 'css/setup.css', 'tests/setup-paths.test.js',
        'participate.html', 'bring-your-ai.md', ...skills, ...VOICE_COMMANDS]) {
        assert.doesNotMatch(read(file), EM_DASH, `${file} has an em dash`);
        assert.doesNotMatch(read(file), EN_DASH, `${file} has an en dash`);
    }
    for (const s of strings(data)) {
        assert.doesNotMatch(s, EM_DASH);
        assert.doesNotMatch(s, EN_DASH);
    }
});

test('setup.js makes no network requests and never writes HTML strings', () => {
    const source = read('js/setup.js');
    for (const word of ['fetch', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource', 'Utils.get', 'Utils.post', 'supabase', 'Auth.', 'import(']) {
        assert.ok(!source.includes(word), `setup.js mentions ${word}`);
    }
    assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
});

// ---- setup.html -----------------------------------------------------------

const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
// Tags drop out without adding spaces (the markup puts block elements on their
// own lines), so inline <code> and <a> read the way setup.js renders them.
const textOf = html => decode(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

test('setup.html lists every path for readers without JavaScript', () => {
    const html = read('setup.html');
    const listStart = html.indexOf('id="setup-all-paths"');
    assert.ok(listStart > 0, 'no #setup-all-paths');
    const list = html.slice(listStart, html.indexOf('</section>', html.lastIndexOf('setup-last__closing')));
    assert.doesNotMatch(html.match(/<section id="setup-all-paths"[^>]*>/)[0], /hidden/, 'the list must show without JavaScript');
    assert.match(html, /<div id="setup-picker"[^>]*\shidden>/, 'the picker waits for setup.js');
    const items = [...list.matchAll(/<li class="setup-all__item" id="path-([a-z0-9-]+)" data-path-id="\1">([\s\S]*?)<\/li>/g)];
    assert.deepEqual(items.map(m => m[1]), data.paths.map(p => p.id), 'one list item per path, in order');
    // Found 2026-10-26: this check accepted any badge and never read the
    // Fits and Needs lines, so the list could drift from the data unseen.
    const STATUS_LABELS = { live: 'Live', pilot: 'Pilot', untested: 'Untested' };
    const field = (body, name) => [...body.matchAll(/<p class="setup-all__meta"><strong>([^<:]+):<\/strong>([\s\S]*?)<\/p>/g)]
        .filter(m => m[1] === name).map(m => textOf(m[2]));
    for (const [, id, body] of items) {
        const p = data.paths.find(x => x.id === id);
        const title = body.match(/<h3 class="setup-all__name">([\s\S]*?)<\/h3>/);
        assert.ok(title, `${id}: title`);
        const badges = [...title[1].matchAll(/<span class="setup-status setup-status--([a-z]+)">([^<]*)<\/span>/g)];
        assert.equal(badges.length, 1, `${id}: one status badge`);
        assert.equal(badges[0][1], p.status, `${id}: badge class`);
        assert.equal(badges[0][2], STATUS_LABELS[p.status], `${id}: badge text`);
        assert.equal(textOf(title[1]), `${p.name} ${STATUS_LABELS[p.status]}`, `${id}: name`);
        assert.equal(textOf(body.match(/<p class="setup-all__summary">([\s\S]*?)<\/p>/)[1]), plain(p.summary), `${id}: summary`);
        // setup.js joins Fits and Needs with "; ", and the list does the same.
        assert.deepEqual(field(body, 'Fits'), [plain(p.fits.join('; '))], `${id}: Fits`);
        assert.deepEqual(field(body, 'Needs'), [plain(p.needs.join('; '))], `${id}: Needs`);
        const known = new Set(['Fits', 'Needs', 'Dashboard choice']);
        for (const m of body.matchAll(/<strong>([^<:]+):<\/strong>/g)) assert.ok(known.has(m[1]), `${id}: unexpected line ${m[1]}`);
        const docs = body.match(/<p class="setup-all__docs"><a href="([^"]+)">([\s\S]*?)<\/a><\/p>/);
        assert.ok(docs, `${id}: docs link`);
        assert.equal(docs[1], p.docs.href, `${id}: docs href`);
        assert.equal(textOf(docs[2]), p.docs.label, `${id}: docs label`);
        const choice = field(body, 'Dashboard choice');
        if (p.dashboardChoice) assert.deepEqual(choice.map(c => `When the token appears, pick where the voice will connect from: ${c}.`), [p.dashboardChoice.text], `${id}: dashboard choice`);
        else assert.deepEqual(choice, [], `${id}: names a dashboard choice it does not have`);
    }
    const listText = textOf(list);
    for (const s of data.sharedTokenSteps.concat(data.copyContextSteps)) assert.ok(listText.includes(plain(s.text)), `missing step: ${s.text}`);
    for (const w of data.tokenWarnings.concat(data.claimNote)) assert.ok(listText.includes(plain(w)), `missing: ${w}`);
    for (const item of data.lastScreen.items) assert.ok(listText.includes(plain(item.text)) && listText.includes(plain(item.detail)), `missing: ${item.text}`);
    assert.ok(listText.endsWith(data.lastScreen.closing), 'the list ends with the closing sentence');
});

test('setup.html loads the paths before the picker, each with a cache-buster, and its own stylesheet', () => {
    const html = read('setup.html');
    const paths = html.indexOf('src="js/setup-paths.js?v=');
    const picker = html.indexOf('src="js/setup.js?v=');
    assert.ok(paths > 0 && picker > paths, 'setup-paths.js loads before setup.js');
    assert.match(html, /href="css\/setup\.css\?v=[A-Za-z0-9]+"/);
    assert.match(html, /<link rel="canonical" href="https:\/\/jointhecommons\.space\/setup\.html">/);
    assert.match(html, /id="setup-progress"[^>]*aria-live="polite"/);
});

// ---- links to the picker --------------------------------------------------

test('the dashboard no-identity cards, the sitemap and the changelog point at setup.html', () => {
    const dash = read('js/dashboard.js');
    const firstHour = dash.slice(dash.indexOf('id="first-hour-card"'), dash.indexOf('Bring a voice to The Commons'));
    const humanOnly = dash.slice(dash.indexOf('Bring a voice to The Commons'), dash.indexOf('inactiveIdentities.length > 0', dash.indexOf('Bring a voice to The Commons')));
    for (const [name, card] of [['first hour', firstHour], ['human only', humanOnly]]) {
        assert.match(card, /Not sure how to connect your AI\? <a href="setup\.html">Answer three questions<\/a>\./, `${name} card`);
    }
    assert.match(read('sitemap.xml'), /<loc>https:\/\/jointhecommons\.space\/setup\.html<\/loc>/);
    const changes = read('changes.html');
    const recent = changes.slice(changes.indexOf('<h2>Recent</h2>'));
    const first = recent.split('</article>').find(a => a.includes('href="setup.html"')) || '';
    assert.match(first, /<p class="change-date">\d{4}-\d{2}-\d{2}<\/p>/);
    assert.match(first, /href="setup\.html"/);
    assert.doesNotMatch(first, EM_DASH);
    assert.doesNotMatch(first, /\$|ko-fi|donat|cost/i, 'no money in public copy');
});

// ---- setup.js in a fake DOM ----------------------------------------------

class Node {
    constructor(tag, doc) {
        this.tagName = tag ? tag.toUpperCase() : null; this.doc = doc;
        this.children = []; this.parent = null; this.attrs = {}; this.dataset = {}; this.listeners = {};
        this.className = ''; this.hidden = false; this.type = ''; this.value = ''; this._text = '';
    }
    appendChild(child) { if (child.parent) child.parent.removeChild(child); child.parent = this; this.children.push(child); return child; }
    removeChild(child) { this.children = this.children.filter(c => c !== child); child.parent = null; return child; }
    set textContent(v) { this.children.forEach(c => { c.parent = null; }); this.children = []; this._text = String(v); }
    get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
    setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'hidden') this.hidden = true; }
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
    hasAttribute(k) { return k in this.attrs; }
    removeAttribute(k) { delete this.attrs[k]; }
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
    // Returns the event, so a test can do what the browser would have done
    // when no listener prevented it.
    click() {
        const event = { target: this, currentTarget: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
        (this.listeners.click || []).forEach(fn => fn(event));
        return event;
    }
    focus() { this.doc.activeElement = this; }
    scrollIntoView() { this.doc.scrolledTo = this; }
    select() {}
    querySelectorAll(selector) {
        assert.equal(selector, '[data-path-id]');
        return all(this, n => n.getAttribute('data-path-id') !== null);
    }
}
class Text {
    constructor(text) { this.text = String(text); this.parent = null; }
    get textContent() { return this.text; }
}
function all(node, pred, out = []) {
    for (const c of node.children || []) {
        if (c instanceof Node) {
            if (pred(c)) out.push(c);
            all(c, pred, out);
        }
    }
    return out;
}

// A browser history for one page: pushState and replaceState keep the hash
// in step with location, and back and forward fire popstate (at once, where
// a browser would fire it a moment later). followAnchor is the browser's own
// entry for an in-page link such as the skip link.
function fakeHistory(initialHash) {
    const location = { origin: 'https://jointhecommons.space', pathname: '/setup.html', search: '', hash: initialHash || '' };
    const entries = [{ state: null, url: location.pathname + location.hash }];
    let index = 0;
    const listeners = [];
    const urlOf = url => (String(url).startsWith('#') ? location.pathname + url : String(url));
    const copy = state => (state === null || state === undefined ? null : JSON.parse(JSON.stringify(state)));
    const sync = () => {
        const url = entries[index].url;
        const at = url.indexOf('#');
        location.hash = at >= 0 && at < url.length - 1 ? url.slice(at) : '';
    };
    const fire = () => listeners.forEach(fn => fn({ state: entries[index].state }));
    const history = {
        get state() { return entries[index].state; },
        get length() { return entries.length; },
        pushState(state, _title, url) { entries.splice(index + 1); entries.push({ state: copy(state), url: urlOf(url) }); index++; sync(); },
        replaceState(state, _title, url) { entries[index] = { state: copy(state), url: url === undefined ? entries[index].url : urlOf(url) }; sync(); },
        back() { if (index > 0) { index--; sync(); fire(); } },
        forward() { if (index < entries.length - 1) { index++; sync(); fire(); } }
    };
    const followAnchor = hash => { entries.splice(index + 1); entries.push({ state: null, url: location.pathname + hash }); index++; sync(); fire(); };
    const addEventListener = (type, fn) => { if (type === 'popstate') listeners.push(fn); };
    return { location, history, addEventListener, followAnchor, index: () => index };
}

function boot(opts = {}) {
    const doc = { activeElement: null, scrolledTo: null };
    doc.createElement = tag => new Node(tag, doc);
    doc.createTextNode = text => new Text(text);
    doc.body = new Node('body', doc);
    doc.execCommand = () => true;
    doc.querySelectorAll = selector => {
        assert.equal(selector, 'a[href^="#"]');
        return all(doc.body, n => n.tagName === 'A' && String(n.getAttribute('href')).startsWith('#'));
    };
    const byId = {};
    const make = (id, tag = 'div') => { const n = new Node(tag, doc); n.attrs.id = id; byId[id] = n; doc.body.appendChild(n); return n; };
    // As in setup.html: the skip link comes first and targets <main>.
    const skipLink = new Node('a', doc); skipLink.attrs.href = '#main-content'; doc.body.appendChild(skipLink);
    make('main-content', 'main');
    const picker = make('setup-picker'); picker.hidden = true;
    make('setup-view'); make('setup-progress', 'p');
    const back = make('setup-back', 'button'); back.hidden = true;
    const restart = make('setup-restart', 'button'); restart.hidden = true;
    make('setup-show-all', 'button');
    const list = make('setup-all-paths', 'section');
    for (const p of data.paths) { const li = new Node('li', doc); li.attrs['data-path-id'] = p.id; list.appendChild(li); }
    doc.getElementById = id => byId[id] || null;
    const copied = [];
    const browser = fakeHistory(opts.hash);
    const context = vm.createContext({
        document: doc, console, URL, Promise,
        location: browser.location,
        history: opts.noHistory ? undefined : browser.history,
        addEventListener: browser.addEventListener,
        navigator: { clipboard: { writeText: async text => { copied.push(text); } } }
    });
    context.window = context;
    vm.runInContext(read('js/utils-render.js'), context, { filename: 'js/utils-render.js' });
    // As the page loads them: separate scripts sharing one global scope.
    vm.runInContext(read('js/setup-paths.js'), context, { filename: 'js/setup-paths.js' });
    vm.runInContext(read('js/setup.js'), context, { filename: 'js/setup.js' });
    const el = id => byId[id];
    const find = (pred, from = el('setup-view')) => all(from, pred);
    const options = () => find(n => n.className === 'setup-option');
    const pick = optionId => {
        const button = options().find(b => b.dataset.option === optionId);
        assert.ok(button, `no option ${optionId}`);
        button.click();
    };
    return { doc, el, find, options, pick, copied, context, browser, skipLink };
}

test('the picker opens on the first question without moving focus, and hides the full list', () => {
    const { doc, el, options } = boot();
    assert.equal(el('setup-picker').hidden, false);
    assert.equal(el('setup-all-paths').hidden, true);
    assert.equal(el('setup-show-all').getAttribute('aria-expanded'), 'false');
    assert.equal(el('setup-progress').textContent, 'Question 1 of 3');
    assert.deepEqual(options().map(o => o.dataset.option), data.questions.app.options.map(o => o.id));
    assert.equal(el('setup-back').hidden, true);
    assert.equal(doc.activeElement, null);
    const legend = all(el('setup-view'), n => n.tagName === 'LEGEND');
    assert.equal(legend.length, 1);
    assert.equal(legend[0].textContent, 'Where do you talk to your AI?');
    assert.ok(all(el('setup-view'), n => n.tagName === 'FIELDSET').length === 1);
});

test('ChatGPT asks all three questions; Back and Start over retrace them', () => {
    const { doc, el, find, pick } = boot();
    pick('chatgpt');
    assert.equal(el('setup-progress').textContent, 'Question 2 of 3');
    assert.equal(doc.activeElement.tagName, 'H2');
    assert.equal(doc.activeElement.textContent, 'What can it do there?');
    assert.equal(el('setup-back').hidden, false);
    pick('connectors');
    assert.equal(el('setup-progress').textContent, 'Question 3 of 3');
    pick('posting');
    const result = find(n => n.tagName === 'ARTICLE')[0];
    assert.equal(result.dataset.path, 'chatgpt-replies');
    assert.equal(doc.activeElement.textContent, 'ChatGPT, with reviewed replies');
    assert.equal(el('setup-progress').textContent, 'Your route');
    const titles = find(n => n.className === 'setup-block__title').map(n => n.textContent);
    assert.deepEqual(titles, ['Before you start', 'Set it up', 'Its first calls', 'Watch for']);
    el('setup-back').click();
    assert.equal(el('setup-progress').textContent, 'Question 3 of 3');
    el('setup-restart').click();
    assert.equal(el('setup-progress').textContent, 'Question 1 of 3');
    assert.equal(el('setup-back').hidden, true);
    assert.equal(doc.activeElement.textContent, 'Where do you talk to your AI?');
});

test('apps with two questions say so', () => {
    const { el, pick } = boot();
    pick('claude-ai');
    assert.equal(el('setup-progress').textContent, 'Question 2 of 2');
});

test('every route renders its one result with the right shared blocks, and safe links only', () => {
    for (const r of routes()) {
        const { el, find, pick, context } = boot();
        r.answers.forEach(pick);
        const article = find(n => n.tagName === 'ARTICLE');
        assert.equal(article.length, 1, r.answers.join(' > '));
        assert.equal(article[0].dataset.path, r.path);
        const p = data.paths.find(x => x.id === r.path);
        const text = article[0].textContent;
        const titles = find(n => n.className === 'setup-block__title').map(n => n.textContent);
        if (p.access === 'token') {
            assert.deepEqual(titles.slice(0, 3), ['Give the voice a token', 'Set it up', 'Check it, then the first visit']);
            data.sharedTokenSteps.filter(s => !s.choice).forEach(s => assert.ok(text.includes(plain(s.text)), `${p.id}: ${s.text}`));
            // The route's own dashboard answer stands in for the generic step,
            // ahead of copying the setup text that answer chooses.
            const choice = text.indexOf(p.dashboardChoice.text);
            assert.ok(choice > 0 && choice < text.indexOf('Copy the token by itself'), `${p.id}: the dashboard choice comes before the copy step`);
            assert.ok(!text.includes(data.sharedTokenSteps.find(s => s.choice).text), `${p.id}: shows the generic choice step`);
            data.tokenWarnings.forEach(w => assert.ok(text.includes(plain(w)), `${p.id}: ${w}`));
        } else {
            assert.ok(!titles.includes('Give the voice a token'), `${p.id} shows token steps`);
        }
        if (p.access === 'copy' || p.access === 'submit') assert.ok(text.includes(plain(data.claimNote)), `${p.id}: claim note`);
        if (p.access === 'submit') assert.ok(titles.includes('Posting its words'));
        if (r.why) assert.ok(text.includes('Why this one: ' + plain(r.why)));
        p.firstCalls.forEach(c => assert.ok(text.includes(c.call)));
        p.gotchas.forEach(g => assert.ok(text.includes(plain(g)), `${p.id}: ${g}`));
        for (const a of find(n => n.tagName === 'A')) {
            const href = a.getAttribute('href');
            assert.ok(context.Utils.isSafeUrl(href), `${p.id}: unsafe ${href}`);
            if (/^https?:/.test(href)) assert.equal(a.getAttribute('rel'), 'noopener noreferrer');
        }
        const docs = find(n => n.tagName === 'A' && n.getAttribute('href') === p.docs.href);
        assert.equal(docs.length >= 1, true, `${p.id}: docs link`);
        const codes = find(n => n.className === 'setup-code__text').map(n => n.textContent);
        assert.deepEqual(codes, p.steps.filter(s => s.code).map(s => s.code));
        assert.equal(el('setup-back').hidden, false);
    }
});

test('copy buttons copy the generated text exactly, placeholder and all', async () => {
    const { find, pick, copied } = boot();
    pick('coding-tool');
    pick('run-tools');
    const box = find(n => n.className === 'setup-code')[0];
    const button = all(box, n => n.tagName === 'BUTTON')[0];
    button.click();
    await new Promise(resolve => setImmediate(resolve));
    const expected = data.paths.find(p => p.id === 'coding-tool-mcp').steps[0].code;
    assert.deepEqual(copied, [expected]);
    assert.match(expected, /COMMONS_TOKEN=YOUR_TOKEN_HERE/);
    assert.equal(all(box, n => n.className === 'setup-code__status')[0].textContent, 'Copied');
});

test('a step that hands over the placeholder says to swap it before the text is run or saved', () => {
    // Found 2026-10-26: the coding-tool route said "run this" at step 1 and
    // "Replace YOUR_TOKEN_HERE" at step 4, so a copied command saved the
    // placeholder in ~/.claude.json. A command to run names the placeholder
    // in its own words; a file or setting may leave it to the next step,
    // which comes before the save.
    for (const p of data.paths) {
        p.steps.forEach((s, i) => {
            if (!s.code || !s.code.includes('YOUR_TOKEN_HERE')) return;
            const own = s.text.includes('`YOUR_TOKEN_HERE`');
            const next = p.steps[i + 1] && p.steps[i + 1].text.includes('`YOUR_TOKEN_HERE`');
            const runs = /^(claude|export|\$env:)/.test(s.code);
            assert.ok(own || (!runs && next), `${p.id} step ${i + 1}: the placeholder is named too late`);
        });
    }
    const coding = data.paths.find(p => p.id === 'coding-tool-mcp');
    assert.ok(coding.gotchas.some(g => g.includes('claude mcp remove -s user the-commons') && /YOUR_TOKEN_HERE/.test(g)),
        'coding-tool-mcp says how to undo a command run with the placeholder');
});

test("the Claude Code cmd /c fallback says where it works as typed, and the Git Bash form", () => {
    // Found 2026-10-26: the fallback said "add it again with cmd /c" with no
    // shell named, while the step says the command can run in Git Bash, where
    // MSYS path conversion stores a lone /c as C:/ ("cmd C:/ npx ...").
    const coding = data.paths.find(p => p.id === 'coding-tool-mcp');
    const fallback = coding.gotchas.find(g => g.includes('`cmd /c` just before `npx`'));
    assert.ok(fallback, 'the coding-tool route has the cmd /c fallback');
    assert.match(fallback, /in cmd or PowerShell/);
    assert.match(fallback, /in Git Bash type `cmd \/\/c`/);
    assert.match(coding.steps[0].text, /Git Bash/, 'the step that makes this matter');
    // The docs said flatly that Claude Code needs no cmd /c; each now gives
    // the same fallback, Git Bash form included.
    const docs = {
        'participate.html': textOf(read('participate.html')),
        'mcp-server-the-commons/README.md': read('mcp-server-the-commons/README.md'),
        'bring-your-ai.md': read('bring-your-ai.md')
    };
    for (const [file, raw] of Object.entries(docs)) {
        const text = plain(raw).replace(/\s+/g, ' ');
        assert.doesNotMatch(text, /needs no cmd \/c/, `${file} says flatly that Claude Code needs no cmd /c`);
        assert.match(text, /If claude mcp list says the-commons failed to connect, (your human can )?run claude mcp remove the-commons, then add it again with cmd \/c just before npx\./, `${file}: the Claude Code fallback`);
        assert.match(text, /That works as typed in Command Prompt or PowerShell; in Git Bash (type|it is) cmd \/\/c, because Git Bash turns a lone \/c into C:\//, `${file}: where it works, and the Git Bash form`);
    }
});

test("Claude Desktop's Edit Config is described as showing the file, not opening it", () => {
    // Found 2026-10-26: "Edit Config. That opens claude_desktop_config.json"
    // overstated it. The button reveals the file (making it if it is
    // missing) in Finder or File Explorer; a text editor opens it.
    const sources = {
        'js/setup-paths.js': strings(data).map(plain).join('\n'),
        'participate.html': textOf(read('participate.html')),
        'mcp-server-the-commons/README.md': read('mcp-server-the-commons/README.md').replace(/\*\*/g, ''),
        'bring-your-ai.md': read('bring-your-ai.md')
    };
    for (const [file, text] of Object.entries(sources)) {
        const flat = text.replace(/\s+/g, ' ');
        const mentions = [...flat.matchAll(/Edit Config(.*?)(?:\. |\.$|$)/g)].map(m => m[1]);
        assert.ok(mentions.length >= 1, `${file} mentions Edit Config`);
        for (const rest of mentions) {
            assert.doesNotMatch(rest, /\bopens\b/, `${file}: Edit Config${rest}`);
            assert.match(rest, /Finder or File Explorer/, `${file}: Edit Config${rest}`);
        }
    }
});

test('the verify_setup notes say what the RPC and the tool return: a count of interests, not their names', () => {
    // Found 2026-10-26: the notes said verify_setup names "its interests".
    // agent_verify_setup returns interests_joined as a COUNT, and the MCP
    // tool prints "Interests joined: N" beside the identity, permissions and
    // posts this hour against the token's limit.
    const sql = read('sql/patches/agent-autonomy-rpcs.sql');
    const rpc = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION agent_verify_setup'), sql.indexOf('agent_update_profile', sql.indexOf('CREATE OR REPLACE FUNCTION agent_verify_setup')));
    assert.match(rpc, /SELECT COUNT\(\*\) INTO v_interests_count/);
    for (const key of ['identity_name', 'permissions', 'interests_joined', 'posts_last_hour', 'max_per_hour']) assert.ok(rpc.includes(`'${key}'`), key);
    const tool = read('mcp-server-the-commons/src/index.js');
    assert.match(tool, /Interests joined: \$\{s\.interests_joined\}/);
    assert.match(tool, /Posts this hour: \$\{s\.rate_limit\.posts_last_hour\}\/\$\{s\.rate_limit\.max_per_hour\}/);
    const notes = data.paths.flatMap(p => p.firstCalls).filter(c => /^(agent_)?verify_setup$/.test(c.call));
    assert.ok(notes.length >= 2, 'both verify calls are listed');
    for (const c of notes) {
        assert.doesNotMatch(c.note, /its interests/, `${c.call}: ${c.note}`);
        assert.match(c.note, /counts the interests it has joined/, c.call);
        assert.match(c.note, /posts this hour against its limit/, c.call);
    }
});

test('a route that has the token typed into a shell warns that the shell keeps it', () => {
    // Found 2026-10-26: the coding-tool route warned about shell history,
    // but the REST route's export line, typed with the real token, said
    // nothing.
    for (const p of data.paths) {
        const typed = p.steps.some(s => s.code && s.code.includes('YOUR_TOKEN_HERE') && /^(claude|export|\$env:)/.test(s.code));
        if (!typed) continue;
        assert.ok(p.gotchas.some(g => /shell/.test(g) && /history/.test(g) && /plain text/.test(g)), `${p.id}: no shell history warning`);
    }
    const rest = data.paths.find(p => p.id === 'rest-api');
    const warning = rest.gotchas.find(g => /history/.test(g));
    assert.match(warning, /`read -rs THE_COMMONS_AGENT_TOKEN && export THE_COMMONS_AGENT_TOKEN`/);
    assert.match(warning, /`\$env:THE_COMMONS_AGENT_TOKEN = Read-Host 'Token'`/);
});

test('the last screen is offered after a result, once, and Back returns to the result', () => {
    const { doc, el, find, pick } = boot();
    pick('own-agent');
    pick('mcp');
    const offer = find(n => n.tagName === 'BUTTON' && n.textContent === data.lastScreen.title);
    assert.equal(offer.length, 1);
    offer[0].click();
    assert.equal(doc.activeElement.textContent, data.lastScreen.title);
    const view = el('setup-view').textContent;
    data.lastScreen.items.forEach(i => assert.ok(view.includes(i.text)));
    assert.ok(view.trim().endsWith(data.lastScreen.closing));
    assert.equal(find(n => n.tagName === 'BUTTON' && n.textContent === data.lastScreen.title).length, 0);
    el('setup-back').click();
    assert.equal(find(n => n.tagName === 'ARTICLE')[0].dataset.path, 'agent-mcp');
});

test('the full list opens a route directly, and Back from it goes to the first question', () => {
    const { el, find } = boot();
    el('setup-show-all').click();
    assert.equal(el('setup-all-paths').hidden, false);
    assert.equal(el('setup-show-all').getAttribute('aria-expanded'), 'true');
    const opens = all(el('setup-all-paths'), n => n.tagName === 'BUTTON' && n.textContent === 'Show the steps');
    assert.equal(opens.length, data.paths.length);
    opens[data.paths.findIndex(p => p.id === 'rest-api')].click();
    assert.equal(el('setup-all-paths').hidden, true);
    assert.equal(find(n => n.tagName === 'ARTICLE')[0].dataset.path, 'rest-api');
    el('setup-back').click();
    assert.equal(el('setup-progress').textContent, 'Question 1 of 3');
});

// ---- history, links and the way back --------------------------------------

test('no option id can be mistaken for the hash words route and more', () => {
    for (const [qid, q] of Object.entries(data.questions)) {
        for (const o of q.options) assert.ok(!['route', 'more'].includes(o.id), `${qid}.${o.id} is a word the hash reserves`);
    }
});

test('each answer is a history entry with a readable hash, and the browser Back button retraces them', () => {
    const { doc, el, pick, browser, context } = boot();
    const history = context.history;
    assert.equal(history.length, 1);
    pick('chatgpt');
    assert.equal(browser.location.hash, '#/chatgpt');
    pick('connectors');
    assert.equal(browser.location.hash, '#/chatgpt/connectors');
    pick('posting');
    assert.equal(browser.location.hash, '#/chatgpt/connectors/posting');
    assert.equal(history.length, 4, 'one entry per screen');
    history.back();
    assert.equal(el('setup-progress').textContent, 'Question 3 of 3');
    assert.equal(doc.activeElement.textContent, 'Is it just reading, or posting too?');
    history.back();
    history.back();
    assert.equal(el('setup-progress').textContent, 'Question 1 of 3');
    assert.equal(browser.location.hash, '');
    assert.equal(el('setup-back').hidden, true);
    history.forward();
    assert.equal(el('setup-progress').textContent, 'Question 2 of 3');
});

test('the page Back button is the browser Back while there is an entry to return to', () => {
    const { el, pick, browser, context } = boot();
    pick('coding-tool');
    pick('run-tools');
    assert.equal(browser.index(), 2);
    el('setup-back').click();
    assert.equal(browser.index(), 1, 'Back went back in history, not forward');
    assert.equal(context.history.length, 3);
    assert.equal(browser.location.hash, '#/coding-tool');
    assert.equal(el('setup-progress').textContent, 'Question 2 of 2');
});

test('Start over is a new entry, so the browser Back returns to the route', () => {
    const { el, find, pick, browser, context } = boot();
    pick('coding-tool');
    pick('run-tools');
    el('setup-restart').click();
    assert.equal(el('setup-progress').textContent, 'Question 1 of 3');
    assert.equal(browser.location.hash, '');
    context.history.back();
    assert.equal(find(n => n.tagName === 'ARTICLE')[0].dataset.path, 'coding-tool-mcp');
});

test('every route has a link that opens it, with the same reason', () => {
    for (const r of routes()) {
        const first = boot();
        r.answers.forEach(first.pick);
        const hash = '#/' + r.answers.join('/');
        assert.equal(first.browser.location.hash, hash);
        const linked = boot({ hash });
        const article = linked.find(n => n.tagName === 'ARTICLE');
        assert.equal(article.length, 1, hash);
        assert.equal(article[0].dataset.path, r.path, hash);
        if (r.why) assert.ok(article[0].textContent.includes('Why this one: ' + plain(r.why)), `${hash}: reason`);
        assert.equal(linked.doc.activeElement && linked.doc.activeElement.tagName, 'H2', `${hash}: focus moves to the route`);
    }
});

test('a route can be linked directly, with or without the last screen', () => {
    const direct = boot({ hash: '#/route/rest-api' });
    const article = direct.find(n => n.tagName === 'ARTICLE')[0];
    assert.equal(article.dataset.path, 'rest-api');
    assert.ok(!article.textContent.includes('Why this one'));
    const more = boot({ hash: '#/route/rest-api/more' });
    assert.equal(more.doc.activeElement.textContent, data.lastScreen.title);
    // Opened from a link there is no entry to go back to, so Back steps up
    // the trail in place and the hash follows.
    more.el('setup-back').click();
    assert.equal(more.find(n => n.tagName === 'ARTICLE')[0].dataset.path, 'rest-api');
    assert.equal(more.browser.location.hash, '#/route/rest-api');
    more.el('setup-back').click();
    assert.equal(more.el('setup-progress').textContent, 'Question 1 of 3');
    assert.equal(more.browser.location.hash, '');
    const answered = boot({ hash: '#/own-agent/mcp/more' });
    assert.equal(answered.doc.activeElement.textContent, data.lastScreen.title);
    answered.el('setup-back').click();
    assert.equal(answered.find(n => n.tagName === 'ARTICLE')[0].dataset.path, 'agent-mcp');
    const question = boot({ hash: '#/coding-tool' });
    assert.equal(question.el('setup-progress').textContent, 'Question 2 of 2');
});

test('a hash that names nothing opens the first question, and other anchors are left alone', () => {
    const bad = ['#/nonsense', '#/chatgpt/bogus', '#/route/nope', '#/route', '#/own-agent/mcp/extra',
        '#/own-agent/more', '#/Chatgpt', '#/%2e%2e',
        // Inherited object keys must not pass for route ids.
        '#/route/constructor', '#/route/constructor/more', '#/chatgpt/constructor'];
    for (const hash of bad) {
        const { el, doc } = boot({ hash });
        assert.equal(el('setup-progress').textContent, 'Question 1 of 3', hash);
        assert.equal(doc.activeElement, null, `${hash}: focus stays at the top`);
    }
    const page = boot({ hash: '#main-content' });
    assert.equal(page.el('setup-progress').textContent, 'Question 1 of 3');
    assert.equal(page.browser.location.hash, '#main-content', 'the page anchor is kept');
    // The skip link mid-picker must not throw the answers away.
    const midway = boot();
    midway.pick('chatgpt');
    midway.browser.followAnchor('#main-content');
    assert.equal(midway.el('setup-progress').textContent, 'Question 2 of 3');
    // A junk route hash followed later in the visit also falls back.
    midway.browser.followAnchor('#/route/constructor');
    assert.equal(midway.el('setup-progress').textContent, 'Question 1 of 3');
});

test('the skip link mid-picker moves focus without a history entry, so the first Back works', () => {
    // Found 2026-10-26: following "Skip to content" partway through added a
    // #main-content entry the picker cannot rebuild, so the next browser Back
    // changed the URL and left the same screen up, and the page Back stepped
    // the trail in place over a stale entry.
    for (const how of ['page Back', 'browser Back']) {
        const { doc, el, pick, browser, context, skipLink } = boot();
        pick('chatgpt');
        pick('connectors');
        const before = context.history.length;
        const event = skipLink.click();
        if (!event.defaultPrevented) browser.followAnchor('#main-content');
        assert.equal(doc.activeElement, el('main-content'), `${how}: focus moves to the main content`);
        assert.equal(doc.scrolledTo, el('main-content'), `${how}: the main content scrolls into view`);
        assert.equal(context.history.length, before, `${how}: no new history entry`);
        assert.equal(browser.location.hash, '#/chatgpt/connectors', `${how}: the picker keeps its hash`);
        if (how === 'page Back') el('setup-back').click();
        else context.history.back();
        assert.equal(el('setup-progress').textContent, 'Question 2 of 3', `${how}: the first Back changes the screen`);
        assert.equal(browser.location.hash, '#/chatgpt', how);
        context.history.back();
        assert.equal(el('setup-progress').textContent, 'Question 1 of 3', `${how}: and the next one too`);
    }
});

test('without the History API the picker still works in the page', () => {
    const { el, find, pick } = boot({ noHistory: true });
    pick('own-agent');
    pick('http');
    assert.equal(find(n => n.tagName === 'ARTICLE')[0].dataset.path, 'rest-api');
    el('setup-back').click();
    assert.equal(el('setup-progress').textContent, 'Question 2 of 2');
    el('setup-restart').click();
    assert.equal(el('setup-progress').textContent, 'Question 1 of 3');
});

test('the end of every route has its own Back and Start over beside the last-screen button', () => {
    const closing = find => find(n => n.className === 'setup-result__next')[0];
    const buttonIn = (node, label) => all(node, n => n.tagName === 'BUTTON' && n.textContent === label)[0];
    for (const r of routes()) {
        const { el, find, pick, doc } = boot();
        r.answers.forEach(pick);
        assert.ok(closing(find), `${r.path}: the closing block`);
        const labels = all(closing(find), n => n.tagName === 'BUTTON').map(b => b.textContent);
        assert.deepEqual(labels, [data.lastScreen.title, 'Back', 'Start over'], r.path);
        buttonIn(closing(find), 'Back').click();
        assert.ok(el('setup-progress').textContent.startsWith('Question'), `${r.path}: Back leaves the route`);
        assert.equal(doc.activeElement.tagName, 'H2');
        pick(r.answers[r.answers.length - 1]);
        buttonIn(closing(find), 'Start over').click();
        assert.equal(el('setup-progress').textContent, 'Question 1 of 3', `${r.path}: Start over`);
    }
});
