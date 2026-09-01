/*
 * app.js
 *
 * Application logic for the estack FiTS Viewer MVP: wires together file
 * loading, stacking, the Group -> Layer -> Sublayer hierarchy, filter
 * isolation, hex color compositing, and the RGB curves panel.
 */

(function () {
    'use strict';

    var MAX_COMPOSITE_DIM = 640;
    var PALETTE = ['#ff3b30', '#34c759', '#0a84ff', '#ffd60a', '#bf5af2', '#ff9f0a', '#5ac8fa', '#ff2d55'];

    var idSeq = 1;
    function nextId(prefix) { return prefix + (idSeq++); }

    /** frameId -> frame record */
    var frames = new Map();
    var paletteIndex = 0;

    /** hierarchy: array of groups -> layers -> sublayers (each sublayer references a frameId) */
    var groups = [];

    var filterIsolation = 'all'; // 'all' or a filter label
    var activeChannel = 'r';
    var curvePointsByChannel = {
        r: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
        g: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
        b: [{ x: 0, y: 0 }, { x: 255, y: 255 }]
    };
    var lutsByChannel = {
        r: FitsCurves.buildLut(curvePointsByChannel.r),
        g: FitsCurves.buildLut(curvePointsByChannel.g),
        b: FitsCurves.buildLut(curvePointsByChannel.b)
    };
    var curveEditor = null;
    var curveColors = { r: '#c0392b', g: '#27ae60', b: '#2980b9' };

    // ---------------------------------------------------------------------
    // DOM references
    // ---------------------------------------------------------------------
    var fileInput = document.getElementById('fits-file-input');
    var frameListEl = document.getElementById('frame-list');
    var stackListEl = document.getElementById('stack-list');
    var stackModeEl = document.getElementById('stack-mode');
    var createStackBtn = document.getElementById('create-stack-btn');
    var hierarchyTreeEl = document.getElementById('hierarchy-tree');
    var addGroupBtn = document.getElementById('add-group-btn');
    var filterTogglesEl = document.getElementById('filter-toggles');
    var compositeCanvas = document.getElementById('composite-canvas');
    var compositeStatus = document.getElementById('composite-status');
    var curveCanvas = document.getElementById('curve-canvas');
    var curvesResetBtn = document.getElementById('curves-reset-btn');
    var dropZone = document.getElementById('drop-zone');
    var schemeFilterEl = document.getElementById('scheme-filter');
    var schemeColorEl = document.getElementById('scheme-color');
    var schemeHexEl = document.getElementById('scheme-hex');

    // ---------------------------------------------------------------------
    // Frame loading
    // ---------------------------------------------------------------------

    function hexToRgb01(hex) {
        var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
        if (!m) return { r: 1, g: 1, b: 1 };
        var n = parseInt(m[1], 16);
        return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
    }

    function createFrameRecord(name) {
        var color = PALETTE[paletteIndex % PALETTE.length];
        paletteIndex++;
        return {
            id: nextId('frame-'),
            name: name,
            status: 'pending', // pending | loading | ready | error
            progress: 0,
            error: null,
            width: 0,
            height: 0,
            data: null,
            min: 0,
            max: 1,
            filter: null,
            color: color,
            isStack: false,
            memberNames: []
        };
    }

    function inferFilterFromFilename(name) {
        var normalized = String(name).toUpperCase().replace(/[^A-Z0-9]+/g, ' ');
        if (/(^| )(NII|N II|N2|NITROGEN ?III)( |$)/.test(normalized)) return 'NII';
        if (/(^| )(HALPHA|H ALPHA|HA)( |$)/.test(normalized)) return 'H-alpha';
        if (/(^| )(HBETA|H BETA|HB)( |$)/.test(normalized)) return 'H-beta';
        if (/(^| )(OIII|O III|O3|OXYGEN ?III)( |$)/.test(normalized)) return 'OIII';
        if (/(^| )(SII|S2)( |$)/.test(normalized)) return 'SII';
        return null;
    }

    function autoOrganizeFrame(frame) {
        var filter = frame.filter || 'Unfiltered';
        var group = groups.filter(function (item) { return item.name === 'Spectra'; })[0];
        if (!group) {
            group = { id: nextId('group-'), name: 'Spectra', visible: true, layers: [] };
            groups.push(group);
        }
        var layer = group.layers.filter(function (item) { return item.name === filter; })[0];
        if (!layer) {
            layer = { id: nextId('layer-'), name: filter, visible: true, sublayers: [] };
            group.layers.push(layer);
        }
        if (!layer.sublayers.some(function (item) { return item.frameId === frame.id; })) {
            layer.sublayers.push({ id: nextId('sub-'), frameId: frame.id, visible: true });
        }
        renderHierarchy();
    }

    function renderFrameListItem(frame) {
        var li = frameListEl.querySelector('[data-frame-id="' + frame.id + '"]');
        if (!li) {
            li = document.createElement('li');
            li.dataset.frameId = frame.id;
            li.innerHTML =
                '<input type="checkbox" class="frame-select" title="Select for stacking" />' +
                '<span class="fits-frame-name"></span>' +
                '<span class="fits-frame-status"></span>' +
                '<progress class="fits-progress" max="100" value="0"></progress>' +
                '<select class="frame-filter">' +
                    ['H-alpha', 'H-beta', 'OIII', 'NII', 'SII', 'Luminance', 'Custom', 'Unfiltered'].map(function (label) {
                        return '<option value="' + label + '">' + label + '</option>';
                    }).join('') +
                '</select>' +
                '<input type="color" class="frame-color" title="Layer color" />' +
                '<button type="button" class="frame-add-layer">Assign &rarr; layer</button>';
            frameListEl.appendChild(li);

            li.querySelector('.frame-filter').addEventListener('change', function (e) {
                frame.filter = e.target.value === 'Unfiltered' ? null : e.target.value;
                recomposite();
                renderFilterToggles();
                renderColorControls();
            });
            li.querySelector('.frame-color').addEventListener('input', function (e) {
                frame.color = e.target.value;
                recomposite();
            });
            li.querySelector('.frame-add-layer').addEventListener('click', function () {
                assignFrameToLayerPrompt(frame.id);
            });
        }

        li.querySelector('.fits-frame-name').textContent = frame.name;
        var statusEl = li.querySelector('.fits-frame-status');
        var progressEl = li.querySelector('.fits-progress');
        var filterSelect = li.querySelector('.frame-filter');
        var colorInput = li.querySelector('.frame-color');

        if (frame.status === 'ready') {
            statusEl.textContent = frame.width + '\u00d7' + frame.height + ' \u00b7 ready';
            statusEl.classList.remove('error');
            progressEl.style.display = 'none';
        } else if (frame.status === 'error') {
            statusEl.textContent = 'Error: ' + frame.error;
            statusEl.classList.add('error');
            progressEl.style.display = 'none';
        } else {
            statusEl.textContent = 'Loading\u2026 ' + frame.progress + '%';
            statusEl.classList.remove('error');
            progressEl.style.display = '';
            progressEl.value = frame.progress;
        }
        filterSelect.value = frame.filter || 'Unfiltered';
        colorInput.value = frame.color;
        return li;
    }

    function loadFiles(fileList) {
        Array.prototype.forEach.call(fileList, function (file) {
            var frame = createFrameRecord(file.name);
            frame.status = 'loading';
            frame.filter = inferFilterFromFilename(file.name);
            frames.set(frame.id, frame);
            renderFrameListItem(frame);

            FitsParser.parseFile(file, {
                onProgress: function (p) {
                    frame.progress = p.total ? Math.round((p.loaded / p.total) * 100) : 0;
                    renderFrameListItem(frame);
                }
            }).then(function (result) {
                frame.status = 'ready';
                frame.width = result.width;
                frame.height = result.height;
                frame.data = result.data;
                frame.min = result.min;
                frame.max = result.max;
                if (result.filter) frame.filter = result.filter;
                renderFrameListItem(frame);
                renderFilterToggles();
                autoOrganizeFrame(frame);
                renderColorControls();
                recomposite();
            }).catch(function (err) {
                frame.status = 'error';
                frame.error = err && err.message ? err.message : String(err);
                renderFrameListItem(frame);
            });
        });
    }

    fileInput.addEventListener('change', function (e) {
        if (e.target.files && e.target.files.length) loadFiles(e.target.files);
        fileInput.value = '';
    });

    dropZone.addEventListener('click', function (e) {
        if (e.target.tagName !== 'LABEL') fileInput.click();
    });
    dropZone.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
    });
    ['dragenter', 'dragover'].forEach(function (eventName) {
        dropZone.addEventListener(eventName, function (e) { e.preventDefault(); dropZone.classList.add('dragging'); });
    });
    ['dragleave', 'drop'].forEach(function (eventName) {
        dropZone.addEventListener(eventName, function (e) { e.preventDefault(); dropZone.classList.remove('dragging'); });
    });
    dropZone.addEventListener('drop', function (e) {
        if (e.dataTransfer.files.length) loadFiles(e.dataTransfer.files);
    });

    // ---------------------------------------------------------------------
    // Stacking
    // ---------------------------------------------------------------------

    function stackFallback(mode, width, height, dataArrays) {
        // Main-thread fallback (chunked by rows, yielding between chunks) used when
        // Web Workers are unavailable (e.g. running from file:// without a server).
        return new Promise(function (resolve) {
            var pixelCount = width * height;
            var result = new Float32Array(pixelCount);
            var rowsPerChunk = Math.max(1, Math.floor(2e5 / width));
            var row = 0;

            function processChunk() {
                var endRow = Math.min(height, row + rowsPerChunk);
                for (var y = row; y < endRow; y++) {
                    for (var x = 0; x < width; x++) {
                        var idx = y * width + x;
                        if (mode === 'median') {
                            var col = dataArrays.map(function (d) { return d[idx]; }).sort(function (a, b) { return a - b; });
                            var mid = Math.floor(col.length / 2);
                            result[idx] = col.length % 2 ? col[mid] : (col[mid - 1] + col[mid]) / 2;
                        } else {
                            var sum = 0;
                            for (var i = 0; i < dataArrays.length; i++) sum += dataArrays[i][idx];
                            result[idx] = sum / dataArrays.length;
                        }
                    }
                }
                row = endRow;
                if (row < height) {
                    setTimeout(processChunk, 0);
                } else {
                    resolve(result);
                }
            }
            processChunk();
        });
    }

    function stackFrames(mode, selected) {
        var width = selected[0].width, height = selected[0].height;
        var buffers = selected.map(function (f) { return f.data.buffer.slice(0); });

        return new Promise(function (resolve, reject) {
            var worker;
            try {
                worker = new Worker('stack-worker.js');
            } catch (err) {
                stackFallback(mode, width, height, selected.map(function (f) { return f.data; })).then(resolve, reject);
                return;
            }
            var id = nextId('job-');
            worker.onmessage = function (e) {
                if (e.data.id !== id) return;
                worker.terminate();
                if (e.data.error) { reject(new Error(e.data.error)); return; }
                resolve(new Float32Array(e.data.buffer));
            };
            worker.onerror = function () {
                worker.terminate();
                stackFallback(mode, width, height, selected.map(function (f) { return f.data; })).then(resolve, reject);
            };
            worker.postMessage({ id: id, mode: mode, width: width, height: height, buffers: buffers }, buffers);
        });
    }

    createStackBtn.addEventListener('click', function () {
        var selectedIds = Array.prototype.slice.call(frameListEl.querySelectorAll('.frame-select:checked'))
            .map(function (cb) { return cb.closest('li').dataset.frameId; });
        var selected = selectedIds.map(function (id) { return frames.get(id); }).filter(function (f) { return f && f.status === 'ready'; });

        if (selected.length < 2) {
            alert('Select at least two ready frames to stack.');
            return;
        }
        var w = selected[0].width, h = selected[0].height;
        if (!selected.every(function (f) { return f.width === w && f.height === h; })) {
            alert('All selected frames must share the same dimensions to be stacked.');
            return;
        }

        createStackBtn.disabled = true;
        var mode = stackModeEl.value;
        stackFrames(mode, selected).then(function (data) {
            var stackFrame = createFrameRecord('Stack (' + mode + ') of ' + selected.length + ' frames');
            stackFrame.status = 'ready';
            stackFrame.width = w;
            stackFrame.height = h;
            stackFrame.data = data;
            stackFrame.isStack = true;
            stackFrame.memberNames = selected.map(function (f) { return f.name; });
            var min = Infinity, max = -Infinity;
            for (var i = 0; i < data.length; i++) { if (data[i] < min) min = data[i]; if (data[i] > max) max = data[i]; }
            stackFrame.min = min; stackFrame.max = max;
            stackFrame.filter = selected[0].filter;
            frames.set(stackFrame.id, stackFrame);
            renderStackListItem(stackFrame);
            renderFilterToggles();
            renderColorControls();
            recomposite();
        }).catch(function (err) {
            alert('Stacking failed: ' + (err && err.message ? err.message : err));
        }).finally(function () {
            createStackBtn.disabled = false;
        });
    });

    function renderStackListItem(frame) {
        var li = document.createElement('li');
        li.dataset.frameId = frame.id;
        li.innerHTML =
            '<span class="fits-frame-name"></span>' +
            '<span class="fits-frame-status"></span>' +
            '<input type="color" class="frame-color" title="Layer color" />' +
            '<button type="button" class="frame-add-layer">Assign &rarr; layer</button>';
        stackListEl.appendChild(li);
        li.querySelector('.fits-frame-name').textContent = frame.name;
        li.querySelector('.fits-frame-status').textContent =
            frame.width + '\u00d7' + frame.height + ' \u00b7 members: ' + frame.memberNames.join(', ');
        var colorInput = li.querySelector('.frame-color');
        colorInput.value = frame.color;
        colorInput.addEventListener('input', function (e) { frame.color = e.target.value; recomposite(); });
        li.querySelector('.frame-add-layer').addEventListener('click', function () {
            assignFrameToLayerPrompt(frame.id);
        });
    }

    // ---------------------------------------------------------------------
    // Group -> Layer -> Sublayer hierarchy
    // ---------------------------------------------------------------------

    function addGroup() {
        groups.push({ id: nextId('group-'), name: 'Group ' + groups.length + 1, visible: true, layers: [] });
        renderHierarchy();
    }
    addGroupBtn.addEventListener('click', addGroup);

    function addLayer(group) {
        group.layers.push({ id: nextId('layer-'), name: 'Layer ' + (group.layers.length + 1), visible: true, sublayers: [] });
        renderHierarchy();
    }

    function assignFrameToLayerPrompt(frameId) {
        if (!groups.length) addGroup();
        var options = [];
        groups.forEach(function (g) {
            g.layers.forEach(function (l) { options.push({ group: g, layer: l }); });
        });
        if (!options.length) {
            addLayer(groups[groups.length - 1]);
            options.push({ group: groups[groups.length - 1], layer: groups[groups.length - 1].layers[0] });
        }
        var labels = options.map(function (o, i) { return (i + 1) + ') ' + o.group.name + ' / ' + o.layer.name; }).join('\n');
        var choice = window.prompt('Assign to which layer?\n' + labels + '\n\nEnter a number, or 0 to create a new layer in "' + groups[groups.length - 1].name + '":', '1');
        if (choice === null) return;
        var n = parseInt(choice, 10);
        var target;
        if (!n || n < 1 || n > options.length) {
            var g = groups[groups.length - 1];
            addLayer(g);
            target = { group: g, layer: g.layers[g.layers.length - 1] };
        } else {
            target = options[n - 1];
        }
        var already = target.layer.sublayers.some(function (s) { return s.frameId === frameId; });
        if (!already) {
            target.layer.sublayers.push({ id: nextId('sub-'), frameId: frameId, visible: true });
        }
        renderHierarchy();
        recomposite();
    }

    function moveItem(arr, index, dir) {
        var newIndex = index + dir;
        if (newIndex < 0 || newIndex >= arr.length) return;
        var tmp = arr[index];
        arr[index] = arr[newIndex];
        arr[newIndex] = tmp;
    }

    function renderHierarchy() {
        hierarchyTreeEl.innerHTML = '';
        if (!groups.length) {
            hierarchyTreeEl.innerHTML = '<p class="fits-hint">No groups yet. Click "+ Group" to start, then assign frames via "Assign &rarr; layer".</p>';
            return;
        }
        var rootUl = document.createElement('ul');
        groups.forEach(function (group, gi) {
            var gLi = document.createElement('li');
            var gRow = document.createElement('div');
            gRow.className = 'fits-node-row';
            gRow.innerHTML =
                '<strong>Group</strong>' +
                '<input type="text" class="group-name" value="' + escapeAttr(group.name) + '" aria-label="Group name" />' +
                '<label><input type="checkbox" class="group-visible" ' + (group.visible ? 'checked' : '') + ' /> visible</label>' +
                '<button type="button" class="move-up">\u2191</button>' +
                '<button type="button" class="move-down">\u2193</button>' +
                '<button type="button" class="add-layer">+ Layer</button>' +
                '<button type="button" class="remove">Remove</button>';
            gRow.querySelector('.group-name').addEventListener('change', function (e) { group.name = e.target.value || group.name; });
            gRow.querySelector('.group-visible').addEventListener('change', function (e) { group.visible = e.target.checked; recomposite(); });
            gRow.querySelector('.move-up').addEventListener('click', function () { moveItem(groups, gi, -1); renderHierarchy(); recomposite(); });
            gRow.querySelector('.move-down').addEventListener('click', function () { moveItem(groups, gi, 1); renderHierarchy(); recomposite(); });
            gRow.querySelector('.add-layer').addEventListener('click', function () { addLayer(group); });
            gRow.querySelector('.remove').addEventListener('click', function () { groups.splice(gi, 1); renderHierarchy(); recomposite(); });
            gLi.appendChild(gRow);

            var layerUl = document.createElement('ul');
            group.layers.forEach(function (layer, li_) {
                var lLi = document.createElement('li');
                var lRow = document.createElement('div');
                lRow.className = 'fits-node-row';
                lRow.innerHTML =
                    '<strong>Layer</strong>' +
                    '<input type="text" class="layer-name" value="' + escapeAttr(layer.name) + '" aria-label="Layer name" />' +
                    '<label><input type="checkbox" class="layer-visible" ' + (layer.visible ? 'checked' : '') + ' /> visible</label>' +
                    '<button type="button" class="move-up">\u2191</button>' +
                    '<button type="button" class="move-down">\u2193</button>' +
                    '<button type="button" class="remove">Remove</button>';
                lRow.querySelector('.layer-name').addEventListener('change', function (e) { layer.name = e.target.value || layer.name; });
                lRow.querySelector('.layer-visible').addEventListener('change', function (e) { layer.visible = e.target.checked; recomposite(); });
                lRow.querySelector('.move-up').addEventListener('click', function () { moveItem(group.layers, li_, -1); renderHierarchy(); recomposite(); });
                lRow.querySelector('.move-down').addEventListener('click', function () { moveItem(group.layers, li_, 1); renderHierarchy(); recomposite(); });
                lRow.querySelector('.remove').addEventListener('click', function () { group.layers.splice(li_, 1); renderHierarchy(); recomposite(); });
                lLi.appendChild(lRow);

                var subUl = document.createElement('ul');
                layer.sublayers.forEach(function (sub, si) {
                    var frame = frames.get(sub.frameId);
                    var sLi = document.createElement('li');
                    var sRow = document.createElement('div');
                    sRow.className = 'fits-node-row';
                    sRow.innerHTML =
                        '<strong>Sublayer</strong>' +
                        '<span>' + escapeHtml(frame ? frame.name : '(missing frame)') + '</span>' +
                        '<label><input type="checkbox" class="sub-visible" ' + (sub.visible ? 'checked' : '') + ' /> visible</label>' +
                        '<button type="button" class="move-up">\u2191</button>' +
                        '<button type="button" class="move-down">\u2193</button>' +
                        '<button type="button" class="remove">Remove</button>';
                    sRow.querySelector('.sub-visible').addEventListener('change', function (e) { sub.visible = e.target.checked; recomposite(); });
                    sRow.querySelector('.move-up').addEventListener('click', function () { moveItem(layer.sublayers, si, -1); renderHierarchy(); recomposite(); });
                    sRow.querySelector('.move-down').addEventListener('click', function () { moveItem(layer.sublayers, si, 1); renderHierarchy(); recomposite(); });
                    sRow.querySelector('.remove').addEventListener('click', function () { layer.sublayers.splice(si, 1); renderHierarchy(); recomposite(); });
                    sLi.appendChild(sRow);
                    subUl.appendChild(sLi);
                });
                lLi.appendChild(subUl);
                layerUl.appendChild(lLi);
            });
            gLi.appendChild(layerUl);
            rootUl.appendChild(gLi);
        });
        hierarchyTreeEl.appendChild(rootUl);
    }

    function escapeAttr(s) { return String(s).replace(/"/g, '&quot;'); }
    function escapeHtml(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

    // ---------------------------------------------------------------------
    // Filter isolation
    // ---------------------------------------------------------------------

    function renderFilterToggles() {
        var labels = new Set(['all']);
        frames.forEach(function (f) { labels.add(f.filter || 'Unfiltered'); });
        filterTogglesEl.innerHTML = '';
        labels.forEach(function (label) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = label === 'all' ? 'All' : label;
            if (filterIsolation === label) btn.classList.add('active');
            btn.addEventListener('click', function () {
                filterIsolation = label;
                renderFilterToggles();
                recomposite();
            });
            filterTogglesEl.appendChild(btn);
        });
    }

    function renderColorControls() {
        var labels = Array.from(new Set(Array.from(frames.values()).map(function (frame) {
            return frame.filter || 'Unfiltered';
        })));
        var prior = schemeFilterEl.value;
        schemeFilterEl.innerHTML = '';
        labels.forEach(function (label) {
            var option = document.createElement('option');
            option.value = label;
            option.textContent = label;
            schemeFilterEl.appendChild(option);
        });
        if (labels.indexOf(prior) !== -1) schemeFilterEl.value = prior;
        syncColorControl();
    }

    function syncColorControl() {
        var selected = Array.from(frames.values()).filter(function (frame) {
            return (frame.filter || 'Unfiltered') === schemeFilterEl.value;
        })[0];
        var color = selected ? selected.color : '#fefefe';
        schemeColorEl.value = color;
        schemeHexEl.textContent = color.toUpperCase();
    }

    schemeFilterEl.addEventListener('change', syncColorControl);
    schemeColorEl.addEventListener('input', function () {
        var color = schemeColorEl.value;
        Array.from(frames.values()).forEach(function (frame) {
            if ((frame.filter || 'Unfiltered') === schemeFilterEl.value) {
                frame.color = color;
                var input = frameListEl.querySelector('[data-frame-id="' + frame.id + '"] .frame-color');
                if (input) input.value = color;
            }
        });
        schemeHexEl.textContent = color.toUpperCase();
        recomposite();
    });

    // ---------------------------------------------------------------------
    // Compositing
    // ---------------------------------------------------------------------

    function collectVisibleFrames() {
        var result = [];
        groups.forEach(function (group) {
            if (!group.visible) return;
            group.layers.forEach(function (layer) {
                if (!layer.visible) return;
                layer.sublayers.forEach(function (sub) {
                    if (!sub.visible) return;
                    var frame = frames.get(sub.frameId);
                    if (!frame || frame.status !== 'ready') return;
                    var frameFilterLabel = frame.filter || 'Unfiltered';
                    if (filterIsolation !== 'all' && frameFilterLabel !== filterIsolation) return;
                    result.push(frame);
                });
            });
        });
        return result;
    }

    function recomposite() {
        var ctx = compositeCanvas.getContext('2d');
        var active = collectVisibleFrames();
        if (!active.length) {
            compositeCanvas.width = 640;
            compositeCanvas.height = 480;
            ctx.clearRect(0, 0, compositeCanvas.width, compositeCanvas.height);
            compositeStatus.textContent = 'No visible frames \u2014 assign loaded frames/stacks to a visible layer above.';
            return;
        }

        var ref = active[0];
        var w = Math.min(MAX_COMPOSITE_DIM, ref.width);
        var h = Math.round(w * (ref.height / ref.width));
        if (h > MAX_COMPOSITE_DIM) { h = MAX_COMPOSITE_DIM; w = Math.round(h * (ref.width / ref.height)); }
        compositeCanvas.width = w;
        compositeCanvas.height = h;

        var pixelCount = w * h;
        var accR = new Float32Array(pixelCount);
        var accG = new Float32Array(pixelCount);
        var accB = new Float32Array(pixelCount);

        active.forEach(function (frame) {
            var tint = hexToRgb01(frame.color);
            var range = (frame.max - frame.min) || 1;
            var scaleX = frame.width / w, scaleY = frame.height / h;
            for (var cy = 0; cy < h; cy++) {
                var sy = Math.min(frame.height - 1, Math.floor(cy * scaleY));
                var rowOffset = sy * frame.width;
                var outRow = cy * w;
                for (var cx = 0; cx < w; cx++) {
                    var sx = Math.min(frame.width - 1, Math.floor(cx * scaleX));
                    var raw = frame.data[rowOffset + sx];
                    var norm = (raw - frame.min) / range;
                    if (norm < 0) norm = 0; else if (norm > 1) norm = 1;
                    var idx = outRow + cx;
                    accR[idx] = 1 - (1 - accR[idx]) * (1 - norm * tint.r);
                    accG[idx] = 1 - (1 - accG[idx]) * (1 - norm * tint.g);
                    accB[idx] = 1 - (1 - accB[idx]) * (1 - norm * tint.b);
                }
            }
        });

        var imgData = ctx.createImageData(w, h);
        var lutR = lutsByChannel.r, lutG = lutsByChannel.g, lutB = lutsByChannel.b;
        for (var p = 0; p < pixelCount; p++) {
            imgData.data[p * 4] = lutR[Math.round(accR[p] * 255)];
            imgData.data[p * 4 + 1] = lutG[Math.round(accG[p] * 255)];
            imgData.data[p * 4 + 2] = lutB[Math.round(accB[p] * 255)];
            imgData.data[p * 4 + 3] = 255;
        }
        ctx.putImageData(imgData, 0, 0);
        compositeStatus.textContent = active.length + ' frame(s) composited \u00b7 preview ' + w + '\u00d7' + h +
            (filterIsolation !== 'all' ? ' \u00b7 filter: ' + filterIsolation : '');
    }

    // ---------------------------------------------------------------------
    // Curves panel
    // ---------------------------------------------------------------------

    function initCurves() {
        curveEditor = FitsCurves.createCurveEditor(curveCanvas, {
            color: curveColors[activeChannel],
            onChange: function (lut) {
                lutsByChannel[activeChannel] = lut;
                curvePointsByChannel[activeChannel] = curveEditor.getPoints();
                recomposite();
            }
        });
        curveEditor.setPoints(curvePointsByChannel[activeChannel], true);

        document.querySelectorAll('.curve-tab').forEach(function (tab) {
            tab.addEventListener('click', function () {
                curvePointsByChannel[activeChannel] = curveEditor.getPoints();
                activeChannel = tab.dataset.channel;
                document.querySelectorAll('.curve-tab').forEach(function (t) { t.classList.toggle('active', t === tab); });
                curveEditor.setColor(curveColors[activeChannel]);
                curveEditor.setPoints(curvePointsByChannel[activeChannel], true);
            });
        });

        curvesResetBtn.addEventListener('click', function () {
            curveEditor.reset();
        });
    }

    // ---------------------------------------------------------------------
    // Init
    // ---------------------------------------------------------------------

    function init() {
        renderHierarchy();
        renderFilterToggles();
        initCurves();
        renderColorControls();
        recomposite();
    }

    init();
})();
