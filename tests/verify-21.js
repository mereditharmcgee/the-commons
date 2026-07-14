// Phase 21: Database Schema & Data Migration
const C = require('./lib/checks');

async function verify() {
    console.log('\n\x1b[1mPhase 21: Database Schema & Data Migration\x1b[0m\n');
    C.setPhase('21');

    // INT-12: interests table with correct columns
    await C.checkTableExists('INT-12', 'interests', 'interests table exists');
    await C.checkTableHasColumn('INT-12', 'interests', 'name,slug,description,icon_or_color,status,is_pinned,sunset_days', 'interests has required columns');

    // INT-13: interest_memberships table
    await C.checkTableExists('INT-13', 'interest_memberships', 'interest_memberships table exists');
    await C.checkTableHasColumn('INT-13', 'interest_memberships', 'interest_id,ai_identity_id,joined_at,role', 'interest_memberships has required columns');

    // INT-14: discussions.interest_id FK
    await C.checkTableHasColumn('INT-14', 'discussions', 'interest_id', 'discussions has interest_id column');

    // VOICE-13: ai_identities status columns
    await C.checkTableHasColumn('VOICE-13', 'ai_identities', 'status,status_updated_at', 'ai_identities has status columns');

    // VOICE-11: facilitators.is_supporter
    await C.checkTableHasColumn('VOICE-11', 'facilitators', 'is_supporter', 'facilitators has is_supporter column');

    // INT-07: Seed interests exist
    await C.checkTableHasRows('INT-07', 'interests', 6, 'At least 6 seed interests exist');

    // INT-08: Migration categorizes remaining discussions as General / Open Floor
    C.checkFileContains('INT-08', 'sql/migrations/categorize-discussions.sql',
        /UPDATE\s+discussions\s+SET\s+interest_id\s*=\s*\(\s*SELECT\s+id\s+FROM\s+interests\s+WHERE\s+slug\s*=\s*'general'\s*\)\s+WHERE\s+interest_id\s+IS\s+NULL\s*;/i,
        'General catch-all categorizes remaining discussions');

    // BUG-03: models table populated
    await C.checkTableExists('BUG-03', 'models', 'models table exists');
    await C.checkTableHasRows('BUG-03', 'models', 10, 'At least 10 model entries');

    // Local SQL files exist
    C.checkFileExists('INT-12', 'sql/schema/11-interests-schema.sql', 'interests schema SQL exists');
    C.checkFileExists('BUG-03', 'sql/schema/12-models-lookup.sql', 'models lookup SQL exists');
    C.checkFileExists('INT-07', 'sql/seeds/seed-interests.sql', 'seed interests SQL exists');
    C.checkFileExists('BUG-03', 'sql/seeds/seed-models.sql', 'seed models SQL exists');

    return C.summary();
}

if (require.main === module) verify().catch(console.error);
module.exports = verify;
