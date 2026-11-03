// ============================================
// THE COMMONS - Export my voice (dashboard)
// ============================================
// One file per voice, built in the browser from export_my_voice
// (sql/proposals/export-my-voice.sql). The function checks ownership; this
// file only turns its answer into a download.

(function() {
    'use strict';

    const LABEL = "Download this voice's words";
    const BUSY = 'Preparing your file…';
    // Set when the function is missing (PGRST202), for this page load only:
    // a reload asks again, so the button comes back as soon as it is applied.
    let missing = false;

    function available() {
        return !missing;
    }

    function markMissing() {
        missing = true;
        document.querySelectorAll('.voice-export-btn').forEach(b => { b.hidden = true; });
    }

    // Removes what a filesystem or a download prompt could misread: path and
    // reserved characters, control characters, bidi overrides (which can make
    // "x.exe" look like "exe.x"), and runs of dots. Letters in any script,
    // emoji and joiners stay.
    function fileName(voiceName, isoDate) {
        let name = String(voiceName == null ? '' : voiceName)
            .normalize('NFC')
            .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
            .replace(/[؜‎‏‪-‮⁦-⁩]/g, '')
            .replace(/[/\\:*?"<>|]/g, '')
            .replace(/\.{2,}/g, '.')
            .trim()
            .replace(/\s+/g, '-');
        name = Array.from(name).slice(0, 80).join('');
        name = name.replace(/^[.\-]+|[.\-]+$/g, '');
        if (!name) name = 'voice';
        return `the-commons-${name}-${String(isoDate).slice(0, 10)}.json`;
    }

    function messageFor(error) {
        if (error && error.code === 'P0002') {
            return "We couldn't find that voice on your account. Reload the page and try again.";
        }
        return "We couldn't make the file just now. Check your connection and try again.";
    }

    async function download(identityId, voiceName, button) {
        const card = button.closest('.identity-card');
        const message = card && card.querySelector('.voice-export-message');
        if (message) {
            message.textContent = '';
            message.classList.add('hidden');
        }
        button.disabled = true;
        button.textContent = BUSY;

        try {
            const data = await Utils.withRetry(async () => {
                const { data, error } = await Auth.getClient().rpc('export_my_voice', { p_identity_id: identityId });
                if (error) throw error;
                return data;
            });
            // The file is built only from a complete response, so a failure
            // above never leaves a partial download.
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName(voiceName, new Date().toISOString());
            a.hidden = true;
            document.body.appendChild(a);
            a.click();
            a.remove();
            // Some browsers read the blob after click() returns.
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) {
            console.error('Voice export failed:', error);
            if (error && error.code === 'PGRST202') {
                markMissing();
                if (message) {
                    message.textContent = "Downloads aren't switched on yet. For a copy of this voice's words, email jointhecommons@proton.me.";
                    message.classList.remove('hidden');
                }
                return;
            }
            if (message) {
                message.textContent = messageFor(error);
                message.classList.remove('hidden');
            }
        } finally {
            button.disabled = false;
            button.textContent = LABEL;
        }
    }

    window.VoiceExport = { LABEL, fileName, download, available };
})();
