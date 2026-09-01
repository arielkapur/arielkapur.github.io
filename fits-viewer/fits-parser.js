/*
 * fits-parser.js
 *
 * Minimal, dependency-free FITS (Flexible Image Transport System) reader
 * for the primary HDU (Header Data Unit) of a FITS file, designed to run
 * entirely in the browser without uploading data anywhere.
 *
 * FITS files are organized as 2880-byte blocks. The header is made up of
 * 80-character ASCII "cards" (KEYWORD = value / comment) and is terminated
 * by an "END" card, padded to a multiple of 2880 bytes. The data section
 * immediately follows, stored big-endian, and is also padded to 2880 bytes.
 *
 * This parser reads the header first (small, cheap), then streams the
 * pixel data in configurable chunks via Blob.slice()/arrayBuffer() so that
 * very large files (100MB+) can be processed piecemeal with progress
 * feedback instead of blocking the UI or requiring the whole file in
 * memory at once as a single synchronous operation.
 */

(function (global) {
    'use strict';

    var BLOCK_SIZE = 2880;
    var CARD_SIZE = 80;
    var DEFAULT_CHUNK_SIZE = 4 * 1024 * 1024; // 4MB per chunk

    /** Known filter keyword aliases we look for in the header, mapped to a normalized label. */
    var FILTER_LABELS = {
        'HALPHA': 'H-alpha',
        'H-ALPHA': 'H-alpha',
        'HA': 'H-alpha',
        'HBETA': 'H-beta',
        'H-BETA': 'H-beta',
        'HB': 'H-beta',
        'OIII': 'OIII',
        'O3': 'OIII',
        'NII': 'NII',
        'N2': 'NII',
        'SII': 'SII',
        'S2': 'SII',
        'RED': 'Red',
        'GREEN': 'Green',
        'BLUE': 'Blue',
        'LUM': 'Luminance',
        'LUMINANCE': 'Luminance'
    };

    function normalizeFilterLabel(raw) {
        if (!raw) return null;
        var key = String(raw).trim().toUpperCase();
        if (FILTER_LABELS[key]) return FILTER_LABELS[key];
        return String(raw).trim() || null;
    }

    /** Parses a single 80-char FITS card into {key, value, comment}. */
    function parseCard(card) {
        var key = card.substring(0, 8).trim();
        if (!key || key === 'COMMENT' || key === 'HISTORY' || key === 'END') {
            return { key: key, value: null, comment: card.substring(8).trim() };
        }
        var rest = card.substring(8);
        if (rest.charAt(0) !== '=') {
            return { key: key, value: null, comment: rest.trim() };
        }
        rest = rest.substring(1);
        var value, comment = '';
        var slashIndex = -1;
        if (rest.trim().charAt(0) === "'") {
            // string value, quotes may contain '/'
            var afterQuote = rest.indexOf("'", rest.indexOf("'") + 1);
            value = rest.substring(rest.indexOf("'") + 1, afterQuote).trim();
            slashIndex = rest.indexOf('/', afterQuote);
        } else {
            slashIndex = rest.indexOf('/');
            var valuePart = slashIndex >= 0 ? rest.substring(0, slashIndex) : rest;
            value = valuePart.trim();
        }
        if (slashIndex >= 0) comment = rest.substring(slashIndex + 1).trim();
        return { key: key, value: value, comment: comment };
    }

    function toNumber(value, fallback) {
        if (value === null || value === undefined || value === '') return fallback;
        var n = parseFloat(value);
        return isNaN(n) ? fallback : n;
    }

    /** Reads the header of a File/Blob, returning {header, headerBlocks, cards}. */
    function readHeader(file) {
        return new Promise(function (resolve, reject) {
            var cards = {};
            var rawLines = [];
            var blockIndex = 0;
            var foundEnd = false;
            var MAX_BLOCKS = 200; // generous safety cap (~576KB of header)

            function readNextBlock() {
                if (foundEnd) {
                    resolve({ cards: cards, headerBlocks: blockIndex, rawLines: rawLines });
                    return;
                }
                if (blockIndex >= MAX_BLOCKS) {
                    reject(new Error('FITS header too large or missing END card.'));
                    return;
                }
                var start = blockIndex * BLOCK_SIZE;
                var slice = file.slice(start, start + BLOCK_SIZE);
                var reader = new FileReader();
                reader.onerror = function () { reject(new Error('Failed to read FITS header.')); };
                reader.onload = function () {
                    var text = reader.result;
                    if (!text || text.length < BLOCK_SIZE) {
                        reject(new Error('Unexpected end of file while reading FITS header.'));
                        return;
                    }
                    for (var i = 0; i < BLOCK_SIZE / CARD_SIZE; i++) {
                        var card = text.substring(i * CARD_SIZE, (i + 1) * CARD_SIZE);
                        var parsed = parseCard(card);
                        rawLines.push(card);
                        if (parsed.key === 'END') {
                            foundEnd = true;
                            break;
                        }
                        if (parsed.key) cards[parsed.key] = parsed;
                    }
                    blockIndex++;
                    readNextBlock();
                };
                // FITS header is plain ASCII; latin1 keeps byte-for-byte fidelity.
                reader.readAsText(slice, 'iso-8859-1');
            }

            readNextBlock();
        });
    }

    function bytesPerPixel(bitpix) {
        return Math.abs(bitpix) / 8;
    }

    /** Reads a typed value out of a DataView at `offset` according to BITPIX (big-endian). */
    function readSample(view, offset, bitpix) {
        switch (bitpix) {
            case 8: return view.getUint8(offset);
            case 16: return view.getInt16(offset, false);
            case 32: return view.getInt32(offset, false);
            case -32: return view.getFloat32(offset, false);
            case -64: return view.getFloat64(offset, false);
            default: throw new Error('Unsupported BITPIX value: ' + bitpix);
        }
    }

    /**
     * Parses a FITS file's primary HDU.
     * @param {File} file
     * @param {Object} [options]
     * @param {number} [options.chunkSize] bytes per read chunk (default 4MB)
     * @param {function(Object)} [options.onProgress] called with {loaded, total, phase}
     * @returns {Promise<Object>} resolved data descriptor
     */
    function parseFile(file, options) {
        options = options || {};
        var chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE;
        var onProgress = options.onProgress || function () {};

        return readHeader(file).then(function (headerInfo) {
            var cards = headerInfo.cards;

            if (!cards.SIMPLE) {
                throw new Error('Not a valid FITS file (missing SIMPLE keyword).');
            }
            var bitpix = toNumber(cards.BITPIX && cards.BITPIX.value, null);
            if (bitpix === null || [8, 16, 32, -32, -64].indexOf(bitpix) === -1) {
                throw new Error('Unsupported or missing BITPIX value.');
            }
            var naxis = toNumber(cards.NAXIS && cards.NAXIS.value, 0);
            if (!naxis || naxis < 1) {
                throw new Error('FITS file has no image data (NAXIS=0).');
            }
            var dims = [];
            for (var i = 1; i <= naxis; i++) {
                var d = toNumber(cards['NAXIS' + i] && cards['NAXIS' + i].value, 0);
                if (!d || d < 1) throw new Error('Invalid NAXIS' + i + ' dimension.');
                dims.push(d);
            }
            var width = dims[0];
            var height = dims.length > 1 ? dims[1] : 1;
            var planeCount = dims.length > 2 ? dims.slice(2).reduce(function (a, b) { return a * b; }, 1) : 1;
            var pixelCount = dims.reduce(function (a, b) { return a * b; }, 1);

            var bzero = toNumber(cards.BZERO && cards.BZERO.value, 0);
            var bscale = toNumber(cards.BSCALE && cards.BSCALE.value, 1);

            var rawFilter = (cards.FILTER && cards.FILTER.value) || (cards.FILTER1 && cards.FILTER1.value) || null;
            var filterLabel = normalizeFilterLabel(rawFilter);

            var headerBytes = headerInfo.headerBlocks * BLOCK_SIZE;
            var bpp = bytesPerPixel(bitpix);
            var dataBytes = pixelCount * bpp;

            if (headerBytes + dataBytes > file.size) {
                throw new Error('FITS data section is truncated (file smaller than expected).');
            }

            var out = new Float32Array(pixelCount);
            var min = Infinity, max = -Infinity;
            var bytesRead = 0;

            function readChunk(offset) {
                if (offset >= dataBytes) {
                    return Promise.resolve();
                }
                var end = Math.min(offset + chunkSize, dataBytes);
                // Align chunk end to a whole pixel boundary so samples never split across reads.
                var remainder = (end - offset) % bpp;
                if (remainder !== 0 && end < dataBytes) end -= remainder;
                var slice = file.slice(headerBytes + offset, headerBytes + end);
                return slice.arrayBuffer().then(function (buf) {
                    var view = new DataView(buf);
                    var sampleStart = offset / bpp;
                    var samplesInChunk = buf.byteLength / bpp;
                    for (var s = 0; s < samplesInChunk; s++) {
                        var raw = readSample(view, s * bpp, bitpix);
                        var value = bzero + bscale * raw;
                        out[sampleStart + s] = value;
                        if (value < min) min = value;
                        if (value > max) max = value;
                    }
                    bytesRead += buf.byteLength;
                    onProgress({ loaded: bytesRead, total: dataBytes, phase: 'data' });
                    // Yield to the event loop between chunks to keep the UI responsive.
                    return new Promise(function (resolve) {
                        setTimeout(function () { resolve(readChunk(end)); }, 0);
                    });
                });
            }

            onProgress({ loaded: 0, total: dataBytes, phase: 'data' });
            return readChunk(0).then(function () {
                return {
                    fileName: file.name,
                    width: width,
                    height: height,
                    planeCount: planeCount,
                    bitpix: bitpix,
                    naxis: naxis,
                    dims: dims,
                    filter: filterLabel,
                    rawFilter: rawFilter,
                    header: cards,
                    data: out,
                    min: min,
                    max: max
                };
            });
        });
    }

    global.FitsParser = {
        parseFile: parseFile,
        normalizeFilterLabel: normalizeFilterLabel,
        FILTER_LABELS: FILTER_LABELS,
        BLOCK_SIZE: BLOCK_SIZE
    };
})(typeof window !== 'undefined' ? window : self);
