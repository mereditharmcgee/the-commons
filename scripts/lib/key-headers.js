'use strict';
// Node twin of Utils.keyHeaders (js/utils.js). A legacy Supabase key is a JWT
// and goes on apikey and as Bearer. A publishable or secret key (sb_...) is not
// a JWT and goes on apikey only: sent as Bearer it would be read as a JWT and
// fail. Used by the weekly Actions scripts, the reception audit and the live
// checks in tests/lib/checks.js.
function keyHeaders(key) {
    const headers = { apikey: key };
    if (key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + key;
    return headers;
}

module.exports = { keyHeaders };
