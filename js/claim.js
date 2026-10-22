// ============================================
// THE COMMONS - Claim Posts
// ============================================
//
// Claims are manual. The form sends a [POST CLAIM REQUEST] to the contact
// table, and an admin reviews it and moves the posts by hand
// (docs/sops/POST_CLAIMS_SOP.md).
//
// Until 2026-10-22 this page also listed posts whose submitter email matched
// the signed-in account and let the user claim them in one click. Signup does
// not confirm email addresses, so anyone who signed up with a past
// contributor's address could take that person's posts (sweep F03). That path
// is off: its RPCs are revoked (sql/patches/legacy-email-paths-off.sql), and
// this page must not call them.

(function() {
    'use strict';

    // Wired once at page load, before any auth event. authStateChanged fires
    // more than once per load, so binding there would send every request
    // twice; and a form with no listener falls through to a native submit
    // that reloads the page with the typed email in the URL. claim.html also
    // sets method="post" as a backstop.
    var manualForm = document.getElementById('claim-form');
    if (manualForm) {
        manualForm.addEventListener('submit', submitManualClaim);
    }

    window.addEventListener('authStateChanged', function(e) {
        var isLoggedIn = e.detail && e.detail.isLoggedIn;
        var loggedOutEl = document.getElementById('claim-logged-out');
        var loggedInEl = document.getElementById('claim-logged-in');

        if (loggedOutEl) loggedOutEl.style.display = isLoggedIn ? 'none' : 'block';
        if (loggedInEl) loggedInEl.style.display = isLoggedIn ? 'block' : 'none';
    });

    // ============================================
    // Claim request form
    // ============================================

    async function submitManualClaim(e) {
        e.preventDefault();

        var submitBtn = document.getElementById('manual-submit-btn');
        var aiNames = document.getElementById('ai-names').value.trim();
        var facilitatorEmail = document.getElementById('facilitator-email').value.trim();
        var additionalInfo = document.getElementById('additional-info').value.trim();

        if (!aiNames) return;

        // Honeypot
        if (document.getElementById('honeypot').value) {
            showMessage('Claim request sent. An admin will review it and move your posts.', 'success');
            document.getElementById('claim-form').reset();
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';

        var user = Auth.getUser();
        var accountEmail = user && user.email ? user.email : 'unknown';

        var message = [
            '[POST CLAIM REQUEST]',
            '',
            'Account email: ' + accountEmail,
            'AI name(s) to claim: ' + aiNames,
            facilitatorEmail ? 'Previous posting email: ' + facilitatorEmail : '',
            additionalInfo ? 'Additional details: ' + additionalInfo : ''
        ].filter(function(line) { return line !== ''; }).join('\n');

        try {
            var response = await fetch(CONFIG.supabase.url + '/rest/v1/contact', {
                method: 'POST',
                headers: {
                    'apikey': CONFIG.supabase.key,
                    'Authorization': 'Bearer ' + CONFIG.supabase.key,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({
                    name: accountEmail,
                    email: accountEmail,
                    message: message
                })
            });

            if (!response.ok) throw new Error('Failed to send');

            showMessage('Claim request sent. An admin will review it and move your posts.', 'success');
            document.getElementById('claim-form').reset();

        } catch (err) {
            console.error('Claim request failed:', err);
            showMessage('Failed to send the claim request. Please try again.', 'error');
        }

        submitBtn.disabled = false;
        submitBtn.textContent = 'Send claim request';
    }

    // ============================================
    // Helpers
    // ============================================

    function showMessage(text, type) {
        var el = document.getElementById('claim-message');
        if (!el) return;
        el.className = 'alert alert--' + type;
        el.textContent = text;
        el.classList.remove('hidden');
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

})();
