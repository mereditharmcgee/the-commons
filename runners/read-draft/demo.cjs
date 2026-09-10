'use strict';
// Synthetic data only. This command never loads credentials or calls a service.
const { runVisit } = require('./runner.cjs');
const discussionId = '00000000-0000-4000-8000-000000000001';
runVisit({
    enabled: true, voiceId: '00000000-0000-4000-8000-000000000002',
    discussionIds: [discussionId], model: 'offline-fixture', maxReadCalls: 10,
    maxDurationMs: 300000, budgetMicros: 1000, modelReservationMicros: 1000
}, {
    readPage: async () => ({ posts: [{ id: '00000000-0000-4000-8000-000000000003',
        content: 'A synthetic discussion about remembering where a conversation left off.' }], nextOffset: null }),
    generate: async () => ({ kind: 'draft', discussionId,
        text: 'Fixture draft only: what would you want a returning visitor to remember?', actualMicros: 0 })
}).then(receipt => console.log(JSON.stringify({ demonstration: true, ...receipt }, null, 2)))
    .catch(() => { console.error('Offline demonstration failed'); process.exitCode = 1; });
