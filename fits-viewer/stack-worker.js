/*
 * stack-worker.js
 *
 * Web Worker that performs pixel stacking (combining several same-sized
 * frames into one) off the main thread so the UI stays responsive while
 * heavy math runs, per the FiTS Viewer performance requirements.
 *
 * Message in:  { id, mode: 'average'|'median', width, height, buffers: ArrayBuffer[] }
 * Message out: { id, buffer: ArrayBuffer, width, height } or { id, error }
 */

self.onmessage = function (event) {
    var msg = event.data || {};
    var id = msg.id;
    try {
        var width = msg.width;
        var height = msg.height;
        var pixelCount = width * height;
        var frames = msg.buffers.map(function (buf) { return new Float32Array(buf); });

        if (!frames.length) throw new Error('No frames provided to stack.');
        frames.forEach(function (f) {
            if (f.length !== pixelCount) {
                throw new Error('All frames in a stack must share the same dimensions.');
            }
        });

        var result = new Float32Array(pixelCount);

        if (msg.mode === 'median') {
            var column = new Float32Array(frames.length);
            for (var p = 0; p < pixelCount; p++) {
                for (var f = 0; f < frames.length; f++) column[f] = frames[f][p];
                var sorted = Array.prototype.slice.call(column).sort(function (a, b) { return a - b; });
                var mid = Math.floor(sorted.length / 2);
                result[p] = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
            }
        } else {
            // average (default)
            for (var pi = 0; pi < pixelCount; pi++) {
                var sum = 0;
                for (var fi = 0; fi < frames.length; fi++) sum += frames[fi][pi];
                result[pi] = sum / frames.length;
            }
        }

        self.postMessage({ id: id, buffer: result.buffer, width: width, height: height }, [result.buffer]);
    } catch (err) {
        self.postMessage({ id: id, error: err.message || String(err) });
    }
};
