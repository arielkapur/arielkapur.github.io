/*
 * curves.js
 *
 * A small, dependency-free Photoshop-style curves editor for the FiTS
 * Viewer. Renders one channel (R, G or B) at a time on a &lt;canvas&gt;,
 * lets the user add/drag/remove control points, and produces a 256-entry
 * lookup table (LUT) used to remap pixel intensities in the live preview.
 */

(function (global) {
    'use strict';

    var SIZE = 256; // logical curve space, 0-255 in and out

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    /** Builds a piecewise-linear 256 entry LUT from sorted control points. */
    function buildLut(points) {
        var pts = points.slice().sort(function (a, b) { return a.x - b.x; });
        var lut = new Uint8ClampedArray(SIZE);
        for (var x = 0; x < SIZE; x++) {
            var lo = pts[0], hi = pts[pts.length - 1];
            for (var i = 0; i < pts.length - 1; i++) {
                if (x >= pts[i].x && x <= pts[i + 1].x) { lo = pts[i]; hi = pts[i + 1]; break; }
            }
            if (x <= pts[0].x) { lut[x] = clamp(pts[0].y, 0, 255); continue; }
            if (x >= pts[pts.length - 1].x) { lut[x] = clamp(pts[pts.length - 1].y, 0, 255); continue; }
            var span = hi.x - lo.x;
            var t = span === 0 ? 0 : (x - lo.x) / span;
            lut[x] = clamp(Math.round(lo.y + t * (hi.y - lo.y)), 0, 255);
        }
        return lut;
    }

    /**
     * Creates a curve editor bound to a canvas element.
     * @param {HTMLCanvasElement} canvas
     * @param {Object} [opts]
     * @param {string} [opts.color] stroke color for the curve line
     * @param {function(Uint8ClampedArray)} [opts.onChange] called whenever the curve changes
     */
    function createCurveEditor(canvas, opts) {
        opts = opts || {};
        var color = opts.color || '#333';
        var onChange = opts.onChange || function () {};
        var ctx = canvas.getContext('2d');
        var points = [{ x: 0, y: 0 }, { x: 255, y: 255 }];
        var dragIndex = -1;
        var selectedIndex = -1;

        function toCanvas(pt) {
            var w = canvas.width, h = canvas.height;
            return { cx: (pt.x / 255) * w, cy: h - (pt.y / 255) * h };
        }
        function fromCanvas(cx, cy) {
            var w = canvas.width, h = canvas.height;
            return { x: clamp(Math.round((cx / w) * 255), 0, 255), y: clamp(Math.round(((h - cy) / h) * 255), 0, 255) };
        }

        function draw() {
            var w = canvas.width, h = canvas.height;
            ctx.clearRect(0, 0, w, h);

            // grid
            ctx.strokeStyle = 'rgba(0,0,0,0.08)';
            ctx.lineWidth = 1;
            for (var g = 1; g < 4; g++) {
                var gx = (w / 4) * g, gy = (h / 4) * g;
                ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
            }

            // reference diagonal
            ctx.strokeStyle = 'rgba(0,0,0,0.15)';
            ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(w, 0); ctx.stroke();

            // curve
            var sorted = points.slice().sort(function (a, b) { return a.x - b.x; });
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            sorted.forEach(function (pt, i) {
                var c = toCanvas(pt);
                if (i === 0) ctx.moveTo(c.cx, c.cy); else ctx.lineTo(c.cx, c.cy);
            });
            ctx.stroke();

            // control points
            sorted.forEach(function (pt) {
                var c = toCanvas(pt);
                var isSelected = points.indexOf(pt) === selectedIndex;
                ctx.beginPath();
                ctx.arc(c.cx, c.cy, isSelected ? 6 : 4, 0, Math.PI * 2);
                ctx.fillStyle = isSelected ? '#000' : color;
                ctx.fill();
            });
        }

        function nearestPointIndex(cx, cy, threshold) {
            var best = -1, bestDist = threshold;
            points.forEach(function (pt, i) {
                var c = toCanvas(pt);
                var d = Math.hypot(c.cx - cx, c.cy - cy);
                if (d < bestDist) { bestDist = d; best = i; }
            });
            return best;
        }

        function emitChange() {
            onChange(buildLut(points));
        }

        function pointerPos(evt) {
            var rect = canvas.getBoundingClientRect();
            var clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
            var clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
            return { cx: (clientX - rect.left) * (canvas.width / rect.width), cy: (clientY - rect.top) * (canvas.height / rect.height) };
        }

        canvas.addEventListener('pointerdown', function (evt) {
            var pos = pointerPos(evt);
            var idx = nearestPointIndex(pos.cx, pos.cy, 14);
            if (idx === -1) {
                var np = fromCanvas(pos.cx, pos.cy);
                points.push(np);
                idx = points.length - 1;
            }
            dragIndex = idx;
            selectedIndex = idx;
            canvas.setPointerCapture(evt.pointerId);
            draw();
        });

        canvas.addEventListener('pointermove', function (evt) {
            if (dragIndex === -1) return;
            var pos = pointerPos(evt);
            var np = fromCanvas(pos.cx, pos.cy);
            // keep the first/last points pinned to x=0 / x=255 so the LUT always spans the full range
            if (dragIndex === 0) np.x = 0;
            if (dragIndex === points.length - 1) np.x = 255;
            points[dragIndex].x = np.x;
            points[dragIndex].y = np.y;
            draw();
            emitChange();
        });

        function endDrag() { dragIndex = -1; }
        canvas.addEventListener('pointerup', endDrag);
        canvas.addEventListener('pointercancel', endDrag);

        canvas.addEventListener('dblclick', function (evt) {
            var pos = pointerPos(evt);
            var idx = nearestPointIndex(pos.cx, pos.cy, 14);
            if (idx > 0 && idx < points.length - 1) {
                points.splice(idx, 1);
                selectedIndex = -1;
                draw();
                emitChange();
            }
        });

        canvas.tabIndex = 0;
        canvas.addEventListener('keydown', function (evt) {
            if (selectedIndex === -1) return;
            var step = evt.shiftKey ? 10 : 2;
            var pt = points[selectedIndex];
            if (evt.key === 'ArrowUp') { pt.y = clamp(pt.y + step, 0, 255); evt.preventDefault(); }
            else if (evt.key === 'ArrowDown') { pt.y = clamp(pt.y - step, 0, 255); evt.preventDefault(); }
            else if (evt.key === 'ArrowRight' && selectedIndex !== 0 && selectedIndex !== points.length - 1) { pt.x = clamp(pt.x + step, 0, 255); evt.preventDefault(); }
            else if (evt.key === 'ArrowLeft' && selectedIndex !== 0 && selectedIndex !== points.length - 1) { pt.x = clamp(pt.x - step, 0, 255); evt.preventDefault(); }
            else return;
            draw();
            emitChange();
        });

        draw();

        return {
            reset: function () {
                points = [{ x: 0, y: 0 }, { x: 255, y: 255 }];
                selectedIndex = -1;
                draw();
                emitChange();
            },
            getLut: function () { return buildLut(points); },
            getPoints: function () { return points.map(function (p) { return { x: p.x, y: p.y }; }); },
            setPoints: function (newPoints, silent) {
                points = (newPoints && newPoints.length >= 2 ? newPoints : [{ x: 0, y: 0 }, { x: 255, y: 255 }])
                    .map(function (p) { return { x: p.x, y: p.y }; });
                selectedIndex = -1;
                draw();
                if (!silent) emitChange();
            },
            setColor: function (c) { color = c; draw(); },
            redraw: draw
        };
    }

    global.FitsCurves = {
        createCurveEditor: createCurveEditor,
        buildLut: buildLut
    };
})(typeof window !== 'undefined' ? window : this);
