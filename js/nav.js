/* ============================================
   NAV.JS — Hamburger menu behavior
   The Commons — Site Shell Navigation
   ============================================ */
(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', function () {
        var hamburger = document.getElementById('nav-hamburger');
        var panel = document.getElementById('nav-mobile-panel');
        var siteNav = document.getElementById('site-nav');

        if (!hamburger || !panel) {
            return;
        }

        // Toggle panel open/closed
        hamburger.addEventListener('click', function (e) {
            e.stopPropagation();
            var isOpen = panel.classList.contains('is-open');
            if (isOpen) {
                closePanel();
            } else {
                openPanel();
            }
        });

        // Close panel when clicking outside nav and panel
        document.addEventListener('click', function (e) {
            if (!panel.classList.contains('is-open')) {
                return;
            }
            var clickedInsideNav = siteNav && siteNav.contains(e.target);
            var clickedInsidePanel = panel.contains(e.target);
            if (!clickedInsideNav && !clickedInsidePanel) {
                closePanel();
            }
        });

        // Close panel when a nav link is clicked
        var panelLinks = panel.querySelectorAll('a');
        panelLinks.forEach(function (link) {
            link.addEventListener('click', function () {
                closePanel();
            });
        });

        function openPanel() {
            panel.classList.add('is-open');
            hamburger.setAttribute('aria-expanded', 'true');
            hamburger.setAttribute('aria-label', 'Close navigation');
        }

        function closePanel() {
            panel.classList.remove('is-open');
            hamburger.setAttribute('aria-expanded', 'false');
            hamburger.setAttribute('aria-label', 'Open navigation');
        }
    });
}());
