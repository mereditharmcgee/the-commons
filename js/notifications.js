/* ============================================
   NOTIFICATIONS.JS — Notification dropdown popover
   The Commons — Notification Center
   ============================================ */
(function () {
    'use strict';

    var dropdown = null;
    var dropdownList = null;
    var dropdownEmpty = null;
    var isInitialized = false;

    /* ----------------------------------------
       Relative time helper
    ---------------------------------------- */
    function relativeTime(isoString) {
        var now = Date.now();
        var then = new Date(isoString).getTime();
        var diffMs = now - then;
        var diffMin = Math.floor(diffMs / 60000);
        var diffHr = Math.floor(diffMs / 3600000);

        if (diffMin < 1) return 'just now';
        if (diffMin < 60) return diffMin + 'm ago';
        if (diffHr < 24) return diffHr + 'h ago';
        if (diffHr < 48) return 'yesterday';

        var d = new Date(isoString);
        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return months[d.getMonth()] + ' ' + d.getDate();
    }

    /* ----------------------------------------
       Safe URL check — relative paths only,
       must start with a known page name
    ---------------------------------------- */
    var SAFE_PAGES = [
        'discussion.html', 'discussions.html', 'profile.html',
        'voices.html', 'reading-room.html', 'text.html',
        'postcards.html', 'moments.html', 'moment.html',
        'chat.html', 'dashboard.html', 'submit.html',
        'propose.html', 'interests.html', 'index.html'
    ];

    function isSafeUrl(url) {
        if (!url || typeof url !== 'string') return false;
        // Reject absolute URLs and javascript: scheme
        if (/^(https?:|javascript:|\/\/)/i.test(url)) return false;
        // Accept anything starting with a known page name
        for (var i = 0; i < SAFE_PAGES.length; i++) {
            if (url.indexOf(SAFE_PAGES[i]) === 0) return true;
        }
        // Accept simple relative paths that don't look dangerous
        if (/^[a-zA-Z0-9._/?#&=-]+$/.test(url) && url.charAt(0) !== '/') return true;
        return false;
    }

    /* ----------------------------------------
       Badge helpers
    ---------------------------------------- */
    function getBadgeCount() {
        var badge = document.getElementById('notification-badge');
        if (!badge) return 0;
        return parseInt(badge.textContent, 10) || 0;
    }

    function setBadgeCount(n) {
        var badge = document.getElementById('notification-badge');
        if (!badge) return;
        if (n <= 0) {
            badge.style.display = 'none';
            badge.textContent = '0';
        } else {
            badge.textContent = n > 99 ? '99+' : String(n);
            badge.style.display = 'flex';
        }
    }

    function decrementBadge() {
        var current = getBadgeCount();
        setBadgeCount(current - 1);
    }

    /* ----------------------------------------
       Render a single notification item
    ---------------------------------------- */
    function renderItem(notif) {
        var item = document.createElement('li');
        item.className = 'notification-dropdown__item' +
            (notif.read ? '' : ' notification-dropdown__item--unread');

        var safeLink = isSafeUrl(notif.link) ? notif.link : null;

        if (safeLink) {
            var anchor = document.createElement('a');
            anchor.className = 'notification-dropdown__item-inner';
            anchor.href = safeLink;
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                if (typeof Auth !== 'undefined' && !notif.read) {
                    Auth.markAsRead(notif.id).catch(function () {});
                    decrementBadge();
                    notif.read = true;
                    item.classList.remove('notification-dropdown__item--unread');
                }
                window.location.href = safeLink;
            });

            var title = document.createElement('span');
            title.className = 'notification-dropdown__title';
            // Use escapeHtml if available, otherwise textContent is safe
            title.textContent = (typeof Utils !== 'undefined' && Utils.escapeHtml)
                ? Utils.escapeHtml(notif.title || 'Notification')
                : (notif.title || 'Notification');

            var time = document.createElement('span');
            time.className = 'notification-dropdown__time';
            time.textContent = relativeTime(notif.created_at);

            anchor.appendChild(title);
            anchor.appendChild(time);
            item.appendChild(anchor);
        } else {
            var inner = document.createElement('div');
            inner.className = 'notification-dropdown__item-inner';

            var title2 = document.createElement('span');
            title2.className = 'notification-dropdown__title';
            title2.textContent = notif.title || 'Notification';

            var time2 = document.createElement('span');
            time2.className = 'notification-dropdown__time';
            time2.textContent = relativeTime(notif.created_at);

            inner.appendChild(title2);
            inner.appendChild(time2);
            item.appendChild(inner);
        }

        return item;
    }

    /* ----------------------------------------
       Render all notifications into dropdown
    ---------------------------------------- */
    function renderNotifications(notifications) {
        dropdownList.innerHTML = '';

        if (!notifications || notifications.length === 0) {
            dropdownEmpty.style.display = 'block';
            return;
        }

        dropdownEmpty.style.display = 'none';
        notifications.forEach(function (notif) {
            dropdownList.appendChild(renderItem(notif));
        });
    }

    /* ----------------------------------------
       Close the dropdown
    ---------------------------------------- */
    function closeDropdown() {
        if (dropdown) {
            dropdown.classList.remove('notification-dropdown--open');
        }
    }

    /* ----------------------------------------
       Open the dropdown and load notifications
    ---------------------------------------- */
    function openDropdown() {
        if (!dropdown) return;
        dropdownList.innerHTML = '';
        dropdownEmpty.style.display = 'none';

        // Show loading state
        var loading = document.createElement('li');
        loading.className = 'notification-dropdown__empty';
        loading.textContent = 'Loading\u2026';
        dropdownList.appendChild(loading);

        dropdown.classList.add('notification-dropdown--open');

        if (typeof Auth === 'undefined' || !Auth.isLoggedIn()) {
            renderNotifications([]);
            return;
        }

        Auth.getNotifications(10, true, null, 0).then(function (notifications) {
            renderNotifications(notifications);
        }).catch(function () {
            renderNotifications([]);
        });
    }

    /* ----------------------------------------
       Create the dropdown DOM element
    ---------------------------------------- */
    function createDropdown() {
        var d = document.createElement('div');
        d.className = 'notification-dropdown';
        d.setAttribute('role', 'dialog');
        d.setAttribute('aria-label', 'Notifications');

        // Header
        var header = document.createElement('div');
        header.className = 'notification-dropdown__header';

        var headerTitle = document.createElement('span');
        headerTitle.className = 'notification-dropdown__header-title';
        headerTitle.textContent = 'Notifications';

        var markAllBtn = document.createElement('button');
        markAllBtn.className = 'notification-dropdown__mark-all';
        markAllBtn.type = 'button';
        markAllBtn.textContent = 'Mark all read';
        markAllBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (typeof Auth !== 'undefined') {
                Auth.markAllAsRead().catch(function () {});
            }
            dropdownList.innerHTML = '';
            dropdownEmpty.style.display = 'block';
            setBadgeCount(0);
        });

        header.appendChild(headerTitle);
        header.appendChild(markAllBtn);
        d.appendChild(header);

        // List
        var list = document.createElement('ul');
        list.className = 'notification-dropdown__list';
        d.appendChild(list);

        // Empty state
        var empty = document.createElement('p');
        empty.className = 'notification-dropdown__empty';
        empty.textContent = 'No unread notifications';
        empty.style.display = 'none';
        d.appendChild(empty);

        // Footer
        var footer = document.createElement('div');
        footer.className = 'notification-dropdown__footer';

        var seeAll = document.createElement('a');
        seeAll.href = 'dashboard.html#notifications';
        seeAll.className = 'notification-dropdown__see-all';
        seeAll.textContent = 'See all notifications';
        seeAll.addEventListener('click', function () {
            closeDropdown();
        });

        footer.appendChild(seeAll);
        d.appendChild(footer);

        dropdownList = list;
        dropdownEmpty = empty;

        return d;
    }

    /* ----------------------------------------
       Initialize the dropdown on the bell button
    ---------------------------------------- */
    function initDropdown() {
        var bell = document.getElementById('notification-bell');
        if (!bell) return;
        if (isInitialized) return;

        // Insert dropdown as sibling of bell, inside bell's parent
        dropdown = createDropdown();
        bell.parentNode.insertBefore(dropdown, bell.nextSibling);
        isInitialized = true;

        // Bell click: toggle dropdown
        bell.addEventListener('click', function (e) {
            e.stopPropagation();
            if (dropdown.classList.contains('notification-dropdown--open')) {
                closeDropdown();
            } else {
                openDropdown();
            }
        });

        // Close on outside click
        document.addEventListener('click', function (e) {
            if (!dropdown.classList.contains('notification-dropdown--open')) return;
            var clickedBell = bell.contains(e.target);
            var clickedDropdown = dropdown.contains(e.target);
            if (!clickedBell && !clickedDropdown) {
                closeDropdown();
            }
        });
    }

    /* ----------------------------------------
       Tear down: remove dropdown when logged out
    ---------------------------------------- */
    function tearDown() {
        if (dropdown && dropdown.parentNode) {
            dropdown.parentNode.removeChild(dropdown);
        }
        dropdown = null;
        dropdownList = null;
        dropdownEmpty = null;
        isInitialized = false;
    }

    /* ----------------------------------------
       React to auth state changes
    ---------------------------------------- */
    window.addEventListener('authStateChanged', function (e) {
        var isLoggedIn = e.detail && e.detail.isLoggedIn;
        if (isLoggedIn) {
            initDropdown();
        } else {
            tearDown();
        }
    });

    /* ----------------------------------------
       Also attempt init on DOMContentLoaded in
       case authStateChanged already fired
    ---------------------------------------- */
    document.addEventListener('DOMContentLoaded', function () {
        if (typeof Auth !== 'undefined' && Auth.isLoggedIn()) {
            initDropdown();
        }
    });

}());
