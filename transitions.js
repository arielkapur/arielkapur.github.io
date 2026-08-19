(function () {
    var EXIT_DURATION = 380; // must match the opacity transition time in transitions.css

    function isInternalLink(a) {
        if (!a || !a.getAttribute) return false;
        var href = a.getAttribute('href');
        if (!href || href.indexOf('mailto:') === 0 || href.indexOf('tel:') === 0) return false;
        if (a.target && a.target !== '' && a.target !== '_self') return false;
        if (a.hasAttribute('download')) return false;
        var url;
        try {
            url = new URL(a.href, window.location.href);
        } catch (e) {
            return false;
        }
        if (url.origin !== window.location.origin) return false;
        // same-page anchor links (e.g. sidebar jump to #yantra) should just jump, not transition
        if (url.pathname === window.location.pathname && url.hash) return false;
        return true;
    }

    document.addEventListener('click', function (e) {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        var a = e.target.closest ? e.target.closest('a') : null;
        if (!a || !isInternalLink(a)) return;

        e.preventDefault();
        var dest = a.href;
        document.body.classList.add('page-exit');
        window.setTimeout(function () {
            window.location.href = dest;
        }, EXIT_DURATION);
    }, true);

    function runEntrance() {
        document.body.classList.remove('page-exit');
        // double rAF so the browser registers the hidden starting state
        // before we flip the classes that animate it in
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                document.body.classList.add('page-loaded');
                var hasBlock = document.querySelector('[data-transition="block"]');
                if (hasBlock) {
                    setTimeout(function () { document.body.classList.add('content-in'); }, 180);
                    setTimeout(function () { document.body.classList.add('text-in'); }, 180 + 560);
                } else {
                    setTimeout(function () { document.body.classList.add('text-in'); }, 120);
                }
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runEntrance);
    } else {
        runEntrance();
    }

    // handle back/forward cache restores, where the page can come back
    // still carrying the 'page-exit' class from when it was left
    window.addEventListener('pageshow', function (e) {
        if (e.persisted) runEntrance();
    });
})();
