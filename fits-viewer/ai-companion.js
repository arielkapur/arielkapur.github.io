/*
 * ai-companion.js
 *
 * "AI Companion" placeholder panel for the FiTS Viewer. This is an MVP
 * stand-in for a future Copilot/OpenAI-powered assistant: it runs fully
 * locally (no network calls, no API keys) and offers contextual workflow
 * tips based on the current app state that is handed to it. This keeps
 * the naming/spirit of the "open dream" companion while staying safe to
 * ship without any backend or secrets.
 */

(function (global) {
    'use strict';

    var GENERIC_TIPS = [
        'Tip: Load several subs of the same target and filter, then create a stack to boost signal-to-noise.',
        'Tip: Assign the H-alpha filter tag to red-sensitive frames for classic narrowband color mapping.',
        'Tip: Use the curves panel to lift shadows gently \u2014 large jumps can clip faint nebulosity.',
        'Tip: Toggle layer visibility to compare a single sub against your stacked result.',
        'Tip: Custom hex colors let you build palettes beyond the default RGB/HOO mappings.',
        'Tip: For very large FITS files, watch the progress bar \u2014 data is read in chunks so the page stays responsive.'
    ];

    /** Produces a small set of context-aware suggestions given the current app state. */
    function suggest(state) {
        state = state || {};
        var tips = [];
        var frames = state.frames || [];
        var stacks = state.stacks || [];

        var untagged = frames.filter(function (f) { return !f.filter; });
        if (untagged.length) {
            tips.push('You have ' + untagged.length + ' frame(s) without a filter tag. Assign H-alpha/H-beta/OIII (or a custom label) to isolate channels for compositing.');
        }
        if (frames.length >= 2 && stacks.length === 0) {
            tips.push('You loaded ' + frames.length + ' frames but haven\u2019t created a stack yet. Select frames of the same filter/target and click "Create Stack" to average them.');
        }
        var noColor = frames.filter(function (f) { return !f.color; });
        if (frames.length && noColor.length === frames.length) {
            tips.push('None of your layers have a hex color assigned yet \u2014 give each filter a distinct color for a clearer composite preview.');
        }
        if (state.curvesTouched === false) {
            tips.push('Try nudging the curves panel: a gentle S-curve often improves contrast in faint deep-sky targets.');
        }
        if (!tips.length) {
            tips.push(GENERIC_TIPS[Math.floor(Math.random() * GENERIC_TIPS.length)]);
        }
        return tips;
    }

    function randomTip() {
        return GENERIC_TIPS[Math.floor(Math.random() * GENERIC_TIPS.length)];
    }

    global.AiCompanion = {
        suggest: suggest,
        randomTip: randomTip,
        GENERIC_TIPS: GENERIC_TIPS
    };
})(typeof window !== 'undefined' ? window : this);
