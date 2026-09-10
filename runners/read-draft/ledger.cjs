'use strict';
const fs = require('node:fs');
const path = require('node:path');
const integer = n => Number.isSafeInteger(n) && n >= 0;

// One journal and lock for all voices on this machine. No stale-lock auto-recovery:
// after a crash an operator must reconcile the pending charge before unlocking.
function openLedger(directory, monthlyCapMicros) {
    if (!integer(monthlyCapMicros) || !monthlyCapMicros) throw Error('invalid_monthly_cap');
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const lock = path.join(directory, 'run.lock');
    fs.mkdirSync(lock);
    const journal = path.join(directory, 'spending.jsonl');
    let events;
    try {
        if (fs.existsSync(journal) && fs.statSync(journal).size > 5000000) throw Error('journal_review_required');
        const raw = fs.existsSync(journal) ? fs.readFileSync(journal, 'utf8') : '';
        if (raw && !raw.endsWith('\n')) throw Error('incomplete_journal');
        events = raw ? raw.trimEnd().split('\n').map(line => JSON.parse(line)) : [];
        const runs = new Map();
        for (const e of events) {
            if (e.type === 'reserve' && typeof e.id === 'string' && !runs.has(e.id) &&
                /^\d{4}-\d{2}$/.test(e.month) && integer(e.micros) && integer(e.cap) && e.cap > 0) runs.set(e.id, e);
            else if (e.type === 'settle' && runs.has(e.id) && !runs.get(e.id).settled &&
                integer(e.micros) && e.micros <= runs.get(e.id).micros) runs.get(e.id).settled = true;
            else throw Error('invalid_journal');
        }
    } catch (error) {
        fs.rmdirSync(lock);
        throw error;
    }
    function append(event) {
        const fd = fs.openSync(journal, 'a', 0o600);
        try { fs.writeFileSync(fd, JSON.stringify(event) + '\n'); fs.fsyncSync(fd); }
        finally { fs.closeSync(fd); }
        events.push(event);
    }
    return {
        reserve(id, month, micros) {
            if (!integer(micros) || micros < 1 || !/^\d{4}-\d{2}$/.test(month) ||
                typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(id)) throw Error('invalid_reservation');
            if (events.some(e => e.id === id)) throw Error('duplicate_run');
            const reservations = events.filter(e => e.type === 'reserve' && e.month === month);
            if (reservations.some(e => e.cap !== monthlyCapMicros)) throw Error('monthly_cap_changed');
            let used = 0;
            for (const e of reservations) used += events.find(s => s.type === 'settle' && s.id === e.id)?.micros ?? e.micros;
            if (!Number.isSafeInteger(used) || micros > monthlyCapMicros - used) throw Error('monthly_budget_exhausted');
            append({ type: 'reserve', id, month, micros, cap: monthlyCapMicros });
        },
        settle(id, micros) {
            const reserved = events.find(e => e.type === 'reserve' && e.id === id);
            if (!reserved || !integer(micros) || micros > reserved.micros || events.some(e => e.type === 'settle' && e.id === id)) throw Error('invalid_settlement');
            append({ type: 'settle', id, micros });
        },
        close() { fs.rmdirSync(lock); }
    };
}
module.exports = { openLedger };
