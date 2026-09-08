// Shared read-only destination handling for search and contribution links.
const Discovery = (() => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validId = value => typeof value === 'string' && uuid.test(value);

    function url(type, row) {
        if (!validId(row.id)) return null;
        if (type === 'discussion') return `discussion.html?id=${row.id}`;
        if (type === 'post' && validId(row.discussion_id)) return `discussion.html?id=${row.discussion_id}&post=${row.id}`;
        if (type === 'marginalia' && validId(row.text_id)) return `text.html?id=${row.text_id}&marginalia=${row.id}`;
        if (type === 'postcard') return `postcards.html?postcard=${row.id}`;
        return null;
    }

    async function resolve({ id, rows, table, columns, parentField, parentId, allowNullActive = false }) {
        if (!id) return { status: 'none' };
        if (!validId(id) || (parentField && !validId(parentId))) return { status: 'invalid' };
        id = id.toLowerCase();
        if (parentField) parentId = parentId.toLowerCase();
        const matches = row => row.id === id && row.is_active !== false &&
            (!parentField || row[parentField] === parentId);
        const existing = rows.find(matches);
        if (existing) return { status: 'found', row: existing };
        const params = { id: `eq.${id}`, select: columns, limit: '1' };
        if (allowNullActive) params.or = '(is_active.eq.true,is_active.is.null)';
        else params.is_active = 'eq.true';
        if (parentField) params[parentField] = `eq.${parentId}`;
        try {
            const result = await Utils.get(table, params);
            if (!Array.isArray(result)) throw new Error('Invalid target response');
            const row = result.find(matches);
            return row ? { status: 'found', row } : { status: 'missing' };
        } catch (error) {
            return { status: 'error' };
        }
    }

    function notice(container, result, collectionUrl, retry) {
        const noticeId = container.id + '-target-notice';
        let box = document.getElementById(noticeId);
        if (result.status === 'none') {
            if (box) box.remove();
            return;
        }
        if (!box) {
            box = document.createElement('div');
            box.id = noticeId;
            box.className = 'alert alert--info discovery-notice';
            box.setAttribute('role', 'status');
            container.before(box);
        }
        box.replaceChildren();
        const message = document.createElement('p');
        message.textContent = result.status === 'found' ? 'Linked contribution highlighted below.' :
            result.status === 'error' ? 'The linked contribution could not be loaded.' :
            result.status === 'invalid' ? 'This contribution link is invalid.' : 'The linked contribution is unavailable.';
        box.append(message);
        const link = document.createElement('a');
        link.href = collectionUrl;
        link.textContent = 'Browse the surrounding collection';
        box.append(link);
        if (result.status === 'error') {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn btn--secondary';
            button.textContent = 'Retry linked contribution';
            button.addEventListener('click', async () => {
                button.disabled = true;
                await retry();
                // If rerender replaced this control, retain keyboard position at the notice.
                const updated = document.getElementById(noticeId);
                if (updated) { updated.tabIndex = -1; updated.focus({ preventScroll: true }); }
            });
            box.append(button);
        }
    }

    function highlight(element, scroll = true) {
        if (!element) return;
        element.classList.add('discovery-target');
        if (scroll) requestAnimationFrame(() => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
    }
    return { validId, url, resolve, notice, highlight };
})();
