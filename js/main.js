"use strict";
const SAMPLE_COUNT = 512;
const TWO_PI = Math.PI * 2;
const $ = (id) => document.getElementById(id);
const mainCanvas = $('mainCanvas');
const ampCanvas = $('ampCanvas');
const phaseCanvas = $('phaseCanvas');
const epicycleCanvas = $('epicycleCanvas');
const complexDrawCanvas = $('complexDrawCanvas');
const complexFourierCanvas = $('complexFourierCanvas');
const errorCanvas = $('errorCanvas');
const mainCtx = mainCanvas.getContext('2d');
const ampCtx = ampCanvas.getContext('2d');
const phaseCtx = phaseCanvas.getContext('2d');
const epicycleCtx = epicycleCanvas.getContext('2d');
const complexDrawCtx = complexDrawCanvas.getContext('2d');
const complexFourierCtx = complexFourierCanvas.getContext('2d');
const errorCtx = errorCanvas.getContext('2d');
const orderInput = $('order');
const harmonicInput = $('harmonic');
const presetSelect = $('preset');
const formulaEl = $('formula');
const latexEl = $('latex');
const compactFormula = $('compactFormula');
const animationSpeedInput = $('animationSpeed');
const complexOrderInput = $('complexOrder');
const complexSpeedInput = $('complexSpeed');
const contourTextInput = $('contourText');
const contourImageInput = $('contourImageInput');
const contourThresholdInput = $('contourThreshold');
const contourRasterCanvas = document.createElement('canvas');
contourRasterCanvas.width = 340;
contourRasterCanvas.height = 260;
const contourRasterCtx = contourRasterCanvas.getContext('2d');
let samples = new Float64Array(SAMPLE_COUNT);
let drawing = false;
let lastDrawIndex = null;
let coeff = { a0: 0, a: [], b: [] };
let animationTime = 0;
let animationPlaying = true;
let lastFrameTime = 0;
const waveTrace = [];
const MAX_TRACE_POINTS = 440;
const COMPLEX_SAMPLE_COUNT = 256;
let complexRawPath = [];
let complexSamples = [];
let complexCoeffs = [];
let complexTrace = [];
let complexDrawing = false;
let complexTime = 0;
let complexPlaying = true;
let contourRasterReady = false;
function presetValue(kind, x) {
    const s = Math.sin(x);
    if (kind === 'sine') return Math.sin(x) + 0.35 * Math.sin(3 * x);
    if (kind === 'square') return s >= 0 ? 1 : -1;
    if (kind === 'saw') return ((x + Math.PI) % TWO_PI) / Math.PI - 1;
    if (kind === 'triangle') return (2 / Math.PI) * Math.asin(Math.sin(x));
    return Math.abs(((x + Math.PI) % TWO_PI) - Math.PI) < Math.PI / 4 ? 1 : -0.3;
}
function loadPreset(kind = presetSelect.value) {
    for (let i = 0; i < SAMPLE_COUNT; i++) {
        const x = -Math.PI + TWO_PI * i / SAMPLE_COUNT;
        samples[i] = presetValue(kind, x);
    }
    updateAll();
}
function calculateCoefficients(maxN) {
    let a0 = 0;
    const a = Array(maxN + 1).fill(0);
    const b = Array(maxN + 1).fill(0);
    for (let i = 0; i < SAMPLE_COUNT; i++) {
        const x = -Math.PI + TWO_PI * i / SAMPLE_COUNT;
        const y = samples[i];
        a0 += y;
        for (let n = 1; n <= maxN; n++) {
            a[n] += y * Math.cos(n * x);
            b[n] += y * Math.sin(n * x);
        }
    }
    const scale = 2 / SAMPLE_COUNT;
    return { a0: a0 * scale, a: a.map(v => v * scale), b: b.map(v => v * scale) };
}
function reconstruct(x, nMax) {
    let y = coeff.a0 / 2;
    for (let n = 1; n <= nMax; n++) y += coeff.a[n] * Math.cos(n * x) + coeff.b[n] * Math.sin(n * x);
    return y;
}
function harmonicValue(x, n) {
    return coeff.a[n] * Math.cos(n * x) + coeff.b[n] * Math.sin(n * x);
}
function computeRms(nMax) {
    let sum = 0;
    for (let i = 0; i < SAMPLE_COUNT; i++) {
        const x = -Math.PI + TWO_PI * i / SAMPLE_COUNT;
        const e = samples[i] - reconstruct(x, nMax);
        sum += e * e;
    }
    return Math.sqrt(sum / SAMPLE_COUNT);
}
function canvasY(y, h, range = 1.8) { return h / 2 - y * (h / (2 * range)); }
function drawGrid(ctx, canvas, yRange = 1.8) {
    const { width: w, height: h } = canvas;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#172846';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 8; i++) {
        const x = i * w / 8;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let i = -2; i <= 2; i++) {
        const y = canvasY(i * yRange / 2, h, yRange);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    ctx.strokeStyle = '#38527f';
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
}
function drawCurve(ctx, canvas, fn, color, width = 2) {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
    for (let px = 0; px < canvas.width; px++) {
        const i = Math.min(SAMPLE_COUNT - 1, Math.floor(px / canvas.width * SAMPLE_COUNT));
        const x = -Math.PI + TWO_PI * px / canvas.width;
        const y = canvasY(fn(x, i), canvas.height);
        px === 0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y);
    }
    ctx.stroke();
}
function drawMain() {
    drawGrid(mainCtx, mainCanvas);
    const nMax = +orderInput.value;
    const hN = +harmonicInput.value;
    drawCurve(mainCtx, mainCanvas, (_x, i) => samples[i], '#63a7ff', 2.7);
    drawCurve(mainCtx, mainCanvas, x => reconstruct(x, nMax), '#f3f6ff', 2.2);
    drawCurve(mainCtx, mainCanvas, x => harmonicValue(x, hN), '#ffb347', 2.2);
}
function drawSpectrum(ctx, canvas, values, phase = false) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const pad = 42, w = canvas.width - pad * 2, h = canvas.height - pad * 2;
    ctx.strokeStyle = '#38527f';
    ctx.beginPath(); ctx.moveTo(pad, pad); ctx.lineTo(pad, pad + h); ctx.lineTo(pad + w, pad + h); ctx.stroke();
    const maxAbs = phase ? Math.PI : Math.max(0.001, ...values.map(Math.abs));
    const barW = Math.max(2, w / Math.max(values.length, 1) * .62);
    values.forEach((v, idx) => {
        const x = pad + (idx + .5) * w / values.length;
        const zeroY = phase ? pad + h / 2 : pad + h;
        const y = phase ? zeroY - v / maxAbs * h / 2 : zeroY - v / maxAbs * h;
        ctx.strokeStyle = idx + 1 === +harmonicInput.value ? '#ffb347' : '#78a8ff';
        ctx.lineWidth = barW;
        ctx.beginPath(); ctx.moveTo(x, zeroY); ctx.lineTo(x, y); ctx.stroke();
    });
}




function calculateErrorCurve(maxOrder = 64) {
    const full = calculateCoefficients(maxOrder);
    const recon = new Float64Array(SAMPLE_COUNT);
    recon.fill(full.a0 / 2);
    const errors = [];
    for (let n = 1; n <= maxOrder; n++) {
        let sum = 0;
        for (let i = 0; i < SAMPLE_COUNT; i++) {
            const x = -Math.PI + TWO_PI * i / SAMPLE_COUNT;
            recon[i] += full.a[n] * Math.cos(n * x) + full.b[n] * Math.sin(n * x);
            const e = samples[i] - recon[i];
            sum += e * e;
        }
        errors.push(Math.sqrt(sum / SAMPLE_COUNT));
    }
    return errors;
}
function drawErrorCurve(errors) {
    const ctx = errorCtx;
    const canvas = errorCanvas;
    const padLeft = 54;
    const padRight = 22;
    const padTop = 20;
    const padBottom = 38;
    const w = canvas.width - padLeft - padRight;
    const h = canvas.height - padTop - padBottom;
    const maxErr = Math.max(0.001, ...errors);
    const currentN = +orderInput.value;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#172846';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = padTop + i * h / 4;
        ctx.beginPath();
        ctx.moveTo(padLeft, y);
        ctx.lineTo(padLeft + w, y);
        ctx.stroke();
    }
    ctx.strokeStyle = '#38527f';
    ctx.beginPath();
    ctx.moveTo(padLeft, padTop);
    ctx.lineTo(padLeft, padTop + h);
    ctx.lineTo(padLeft + w, padTop + h);
    ctx.stroke();
    ctx.fillStyle = '#8399bd';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(maxErr.toFixed(3), 7, padTop + 4);
    ctx.fillText('0', 28, padTop + h + 4);
    [1, 16, 32, 48, 64].forEach(n => {
        const x = padLeft + (n - 1) / 63 * w;
        ctx.fillText(String(n), x - 7, canvas.height - 12);
    });
    ctx.strokeStyle = '#78a8ff';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    errors.forEach((err, i) => {
        const x = padLeft + i / Math.max(1, errors.length - 1) * w;
        const y = padTop + h - err / maxErr * h;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    const activeIndex = Math.max(0, Math.min(errors.length - 1, currentN - 1));
    const ax = padLeft + activeIndex / Math.max(1, errors.length - 1) * w;
    const ay = padTop + h - errors[activeIndex] / maxErr * h;
    ctx.fillStyle = '#ffb347';
    ctx.beginPath();
    ctx.arc(ax, ay, 5, 0, TWO_PI);
    ctx.fill();
    ctx.fillStyle = '#ffd18f';
    ctx.fillText('N=' + currentN + ' · ' + errors[activeIndex].toFixed(4), Math.min(ax + 9, canvas.width - 130), Math.max(16, ay - 8));
}
function updateCoeffRanking() {
    const nMax = +orderInput.value;
    const rows = Array.from({ length: nMax }, (_, i) => {
        const n = i + 1;
        return {
            n,
            amp: Math.hypot(coeff.a[n] || 0, coeff.b[n] || 0),
        };
    }).sort((a, b) => b.amp - a.amp).slice(0, 8);
    const maxAmp = Math.max(0.001, ...rows.map(r => r.amp));
    const target = $('coeffRanking');
    if (!rows.length) {
        target.innerHTML = '<div class="export-note">当前没有可显示的谐波分量。</div>';
        return;
    }
    target.innerHTML = rows.map(row => {
        const pct = Math.max(1, row.amp / maxAmp * 100);
        return '<button class="coeff-row" data-n="' + row.n + '">' +
            '<span class="coeff-name">n=' + row.n + '</span>' +
            '<span class="coeff-bar"><i style="width:' + pct.toFixed(1) + '%"></i></span>' +
            '<span class="coeff-value">' + row.amp.toFixed(4) + '</span>' +
            '</button>';
    }).join('');
    target.querySelectorAll('[data-n]').forEach(button => {
        button.onclick = () => {
            const n = Number(button.dataset.n);
            harmonicInput.value = String(n);
            updateAll(false);
        };
    });
}
function updateAnalytics() {
    drawErrorCurve(calculateErrorCurve(64));
    updateCoeffRanking();
}
function setDisplayMode(mode) {
    document.body.dataset.mode = mode;
    document.querySelectorAll('.mode-btn').forEach(button => {
        button.classList.toggle('active', button.dataset.mode === mode);
    });
    try {
        localStorage.setItem('fourier-studio-mode', mode);
    }
    catch {
    }
}
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportCanvasPng(canvas, filename) {
    canvas.toBlob(blob => {
        if (blob) downloadBlob(blob, filename);
    }, 'image/png');
}
function writeAscii(out, text) {
    for (let i = 0; i < text.length; i++) out.push(text.charCodeAt(i) & 0xff);
}
function writeU16(out, value) {
    out.push(value & 0xff, (value >> 8) & 0xff);
}
function make332Palette() {
    const palette = [];
    for (let i = 0; i < 256; i++) {
        const r = Math.round(((i >> 5) & 7) * 255 / 7);
        const g = Math.round(((i >> 2) & 7) * 255 / 7);
        const b = Math.round((i & 3) * 255 / 3);
        palette.push(r, g, b);
    }
    return palette;
}
function rgbaTo332(data) {
    const result = new Uint8Array(data.width * data.height);
    for (let i = 0; i < result.length; i++) {
        const j = i * 4;
        const r = data.data[j];
        const g = data.data[j + 1];
        const b = data.data[j + 2];
        result[i] = ((r >> 5) << 5) | ((g >> 5) << 2) | (b >> 6);
    }
    return result;
}
function gifLzwEncode(indices, minCodeSize = 8) {
    const clearCode = 1 << minCodeSize;
    const endCode = clearCode + 1;
    let nextCode = endCode + 1;
    let codeSize = minCodeSize + 1;
    let dictionary = new Map();
    const bytes = [];
    let bitBuffer = 0;
    let bitCount = 0;
    const emit = (code) => {
        bitBuffer |= code << bitCount;
        bitCount += codeSize;
        while (bitCount >= 8) {
            bytes.push(bitBuffer & 0xff);
            bitBuffer >>>= 8;
            bitCount -= 8;
        }
    };
    const reset = () => {
        dictionary = new Map();
        nextCode = endCode + 1;
        codeSize = minCodeSize + 1;
    };
    emit(clearCode);
    if (!indices.length) {
        emit(endCode);
        if (bitCount > 0) bytes.push(bitBuffer & 0xff);
        return new Uint8Array(bytes);
    }
    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
        const value = indices[i];
        const key = (prefix << 8) | value;
        const existing = dictionary.get(key);
        if (existing !== undefined) {
            prefix = existing;
            continue;
        }
        emit(prefix);
        if (nextCode < 4096) {
            dictionary.set(key, nextCode++);
            if (nextCode === (1 << codeSize) && codeSize < 12) codeSize++;
        }
        else {
            emit(clearCode);
            reset();
        }
        prefix = value;
    }
    emit(prefix);
    emit(endCode);
    if (bitCount > 0) bytes.push(bitBuffer & 0xff);
    return new Uint8Array(bytes);
}
function encodeGif(frames, width, height, delayCentiseconds) {
    const out = [];
    writeAscii(out, 'GIF89a');
    writeU16(out, width);
    writeU16(out, height);
    out.push(0xf7, 0x00, 0x00);
    out.push(...make332Palette());
    out.push(0x21, 0xff, 0x0b);
    writeAscii(out, 'NETSCAPE2.0');
    out.push(0x03, 0x01, 0x00, 0x00, 0x00);
    for (const frame of frames) {
        out.push(0x21, 0xf9, 0x04, 0x00);
        writeU16(out, delayCentiseconds);
        out.push(0x00, 0x00);
        out.push(0x2c);
        writeU16(out, 0);
        writeU16(out, 0);
        writeU16(out, width);
        writeU16(out, height);
        out.push(0x00);
        out.push(0x08);
        const encoded = gifLzwEncode(frame, 8);
        for (let i = 0; i < encoded.length; i += 255) {
            const len = Math.min(255, encoded.length - i);
            out.push(len);
            for (let j = 0; j < len; j++) out.push(encoded[i + j]);
        }
        out.push(0x00);
    }
    out.push(0x3b);
    return new Blob([new Uint8Array(out)], { type: 'image/gif' });
}
async function exportComplexGif() {
    if (!complexCoeffs.length) {
        $('contourStatus').textContent = '请先手绘、输入文字或导入图片，再导出 GIF。';
        return;
    }
    const button = $('exportComplexGifBtn');
    const oldLabel = button.textContent || '导出 GIF';
    button.disabled = true;
    button.classList.add('busy');
    button.textContent = '正在生成 GIF…';
    const oldTime = complexTime;
    const oldTrace = complexTrace.map(p => ({ ...p }));
    const oldPlaying = complexPlaying;
    complexPlaying = false;
    try {
        const width = 360;
        const height = Math.round(width * complexFourierCanvas.height / complexFourierCanvas.width);
        const capture = document.createElement('canvas');
        capture.width = width;
        capture.height = height;
        const captureCtx = capture.getContext('2d');
        const frames = [];
        const frameCount = 36;
        for (let frame = 0; frame < frameCount; frame++) {
            complexTime = TWO_PI * frame / frameCount;
            complexTrace = [];
            const traceSteps = Math.max(2, Math.round(COMPLEX_SAMPLE_COUNT * (frame + 1) / frameCount));
            for (let j = 0; j < traceSteps; j++) {
                complexTrace.push(complexPointAtTime(TWO_PI * j / COMPLEX_SAMPLE_COUNT));
            }
            drawComplexFourier();
            captureCtx.clearRect(0, 0, width, height);
            captureCtx.drawImage(complexFourierCanvas, 0, 0, width, height);
            frames.push(rgbaTo332(captureCtx.getImageData(0, 0, width, height)));
            if (frame % 4 === 0) {
                button.textContent = '生成 GIF ' + Math.round((frame + 1) / frameCount * 100) + '%';
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
        const gif = encodeGif(frames, width, height, 8);
        downloadBlob(gif, 'fourier-studio-2d.gif');
        $('contourStatus').textContent = 'GIF 已生成：36 帧，循环播放。';
    }
    finally {
        complexTime = oldTime;
        complexTrace = oldTrace;
        complexPlaying = oldPlaying;
        drawComplexFourier();
        button.disabled = false;
        button.classList.remove('busy');
        button.textContent = oldLabel;
    }
}
function rasterKey(x2, y2) {
    return y2 * 2048 + x2;
}
function contourArea(points) {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const q = points[(i + 1) % points.length];
        area += p.x * q.y - q.x * p.y;
    }
    return area / 2;
}
function extractRasterContours(threshold) {
    const w = contourRasterCanvas.width;
    const h = contourRasterCanvas.height;
    const image = contourRasterCtx.getImageData(0, 0, w, h);
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
        const j = i * 4;
        const alpha = image.data[j + 3] / 255;
        const r = image.data[j];
        const g = image.data[j + 1];
        const b = image.data[j + 2];
        const luminance = alpha * (0.2126 * r + 0.7152 * g + 0.0722 * b) + (1 - alpha) * 255;
        mask[i] = luminance < threshold ? 1 : 0;
    }
    const edges = [];
    const adjacency = new Map();
    const addSegment = (a, b) => {
        const index = edges.length;
        edges.push([a, b]);
        const aa = adjacency.get(a) || [];
        aa.push({ to: b, edge: index });
        adjacency.set(a, aa);
        const bb = adjacency.get(b) || [];
        bb.push({ to: a, edge: index });
        adjacency.set(b, bb);
    };
    const addCellSegment = (x, y, e1, e2) => {
        const pointFor = (edge) => {
            if (edge === 'T') return rasterKey(2 * x + 1, 2 * y);
            if (edge === 'R') return rasterKey(2 * x + 2, 2 * y + 1);
            if (edge === 'B') return rasterKey(2 * x + 1, 2 * y + 2);
            return rasterKey(2 * x, 2 * y + 1);
        };
        addSegment(pointFor(e1), pointFor(e2));
    };
    for (let y = 0; y < h - 1; y++) {
        for (let x = 0; x < w - 1; x++) {
            const tl = mask[y * w + x] ? 1 : 0;
            const tr = mask[y * w + x + 1] ? 2 : 0;
            const br = mask[(y + 1) * w + x + 1] ? 4 : 0;
            const bl = mask[(y + 1) * w + x] ? 8 : 0;
            const code = tl | tr | br | bl;
            switch (code) {
                case 1: addCellSegment(x, y, 'L', 'T'); break;
                case 2: addCellSegment(x, y, 'T', 'R'); break;
                case 3: addCellSegment(x, y, 'L', 'R'); break;
                case 4: addCellSegment(x, y, 'R', 'B'); break;
                case 5:
                    addCellSegment(x, y, 'L', 'T');
                    addCellSegment(x, y, 'R', 'B');
                    break;
                case 6: addCellSegment(x, y, 'T', 'B'); break;
                case 7: addCellSegment(x, y, 'L', 'B'); break;
                case 8: addCellSegment(x, y, 'B', 'L'); break;
                case 9: addCellSegment(x, y, 'T', 'B'); break;
                case 10:
                    addCellSegment(x, y, 'T', 'R');
                    addCellSegment(x, y, 'B', 'L');
                    break;
                case 11: addCellSegment(x, y, 'R', 'B'); break;
                case 12: addCellSegment(x, y, 'L', 'R'); break;
                case 13: addCellSegment(x, y, 'T', 'R'); break;
                case 14: addCellSegment(x, y, 'L', 'T'); break;
            }
        }
    }
    const used = new Uint8Array(edges.length);
    const contours = [];
    const xScale = complexDrawCanvas.width / Math.max(1, w - 1);
    const yScale = complexDrawCanvas.height / Math.max(1, h - 1);
    for (let startEdge = 0; startEdge < edges.length; startEdge++) {
        if (used[startEdge]) continue;
        const start = edges[startEdge][0];
        let current = start;
        let edgeIndex = startEdge;
        const keys = [];
        let guard = 0;
        while (guard++ < edges.length + 8) {
            used[edgeIndex] = 1;
            keys.push(current);
            const edge = edges[edgeIndex];
            const next = edge[0] === current ? edge[1] : edge[0];
            current = next;
            if (current === start) break;
            const options = (adjacency.get(current) || []).filter(item => !used[item.edge]);
            if (!options.length) break;
            edgeIndex = options[0].edge;
        }
        if (keys.length < 10 || current !== start) continue;
        const points = keys.map(key => {
            const x2 = key % 2048;
            const y2 = Math.floor(key / 2048);
            return {
                x: (x2 / 2) * xScale,
                y: (y2 / 2) * yScale,
            };
        });
        if (Math.abs(contourArea(points)) < 18) continue;
        const step = Math.max(1, Math.ceil(points.length / 320));
        contours.push(points.filter((_, i) => i % step === 0));
    }
    return contours;
}
function stitchContours(contours) {
    if (!contours.length) return [];
    const remaining = contours
        .filter(c => c.length >= 4)
        .sort((a, b) => {
            const ax = Math.min(...a.map(p => p.x));
            const bx = Math.min(...b.map(p => p.x));
            return ax - bx;
        });
    if (!remaining.length) return [];
    const first = remaining.shift();
    const result = [...first, first[0]];
    while (remaining.length) {
        const end = result[result.length - 1];
        let bestContour = 0;
        let bestPoint = 0;
        let bestDistance = Infinity;
        for (let ci = 0; ci < remaining.length; ci++) {
            const contour = remaining[ci];
            for (let pi = 0; pi < contour.length; pi++) {
                const d = Math.hypot(contour[pi].x - end.x, contour[pi].y - end.y);
                if (d < bestDistance) {
                    bestDistance = d;
                    bestContour = ci;
                    bestPoint = pi;
                }
            }
        }
        const contour = remaining.splice(bestContour, 1)[0];
        const rotated = [...contour.slice(bestPoint), ...contour.slice(0, bestPoint)];
        result.push(...rotated, rotated[0]);
    }
    return result;
}
function applyRasterContour(source) {
    const threshold = Number(contourThresholdInput.value);
    const contours = extractRasterContours(threshold);
    const path = stitchContours(contours);
    if (path.length < 6) {
        $('contourStatus').textContent = '没有检测到足够清晰的深色轮廓，请调整阈值或换一张图。';
        return;
    }
    complexRawPath = path;
    complexDrawing = false;
    complexPlaying = true;
    $('complexPlayBtn').textContent = '暂停';
    rebuildComplexModel();
    $('contourStatus').textContent =
        source + '：提取 ' + contours.length + ' 个闭合轮廓，拼接为 ' + path.length + ' 个路径点';
}
function renderTextContour() {
    const text = contourTextInput.value.trim() || 'FOURIER';
    const ctx = contourRasterCtx;
    const w = contourRasterCanvas.width;
    const h = contourRasterCanvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = 118;
    do {
        ctx.font = '800 ' + size + 'px Arial, "Microsoft YaHei", "PingFang SC", sans-serif';
        if (ctx.measureText(text).width <= w - 24) break;
        size -= 4;
    } while (size > 22);
    ctx.fillText(text, w / 2, h / 2);
    contourRasterReady = true;
    applyRasterContour('文字“' + text + '”');
}
function importContourImage(file) {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
        const ctx = contourRasterCtx;
        const w = contourRasterCanvas.width;
        const h = contourRasterCanvas.height;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        const margin = 10;
        const scale = Math.min((w - margin * 2) / image.width, (h - margin * 2) / image.height);
        const dw = image.width * scale;
        const dh = image.height * scale;
        ctx.drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh);
        URL.revokeObjectURL(url);
        contourRasterReady = true;
        applyRasterContour('图片“' + file.name + '”');
    };
    image.onerror = () => {
        URL.revokeObjectURL(url);
        $('contourStatus').textContent = '图片读取失败，请换一个 PNG / JPG / WebP 文件。';
    };
    image.src = url;
}
function drawComplexGrid(ctx, canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#162744';
    ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
        const x = i * canvas.width / 8;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let i = 1; i < 6; i++) {
        const y = i * canvas.height / 6;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
    ctx.strokeStyle = '#324c78';
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 0);
    ctx.lineTo(canvas.width / 2, canvas.height);
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
}
function resampleClosedPath(points, count) {
    if (points.length < 2) return [];
    const closed = [...points, points[0]];
    const lengths = [0];
    let total = 0;
    for (let i = 1; i < closed.length; i++) {
        total += Math.hypot(closed[i].x - closed[i - 1].x, closed[i].y - closed[i - 1].y);
        lengths.push(total);
    }
    if (total < 1) return [];
    const result = [];
    let seg = 1;
    for (let j = 0; j < count; j++) {
        const target = total * j / count;
        while (seg < lengths.length - 1 && lengths[seg] < target) seg++;
        const l0 = lengths[seg - 1];
        const l1 = lengths[seg];
        const t = l1 === l0 ? 0 : (target - l0) / (l1 - l0);
        const p0 = closed[seg - 1];
        const p1 = closed[seg];
        result.push({
            x: p0.x + (p1.x - p0.x) * t,
            y: p0.y + (p1.y - p0.y) * t,
        });
    }
    return result;
}
function normalizeComplexSamples(points) {
    if (!points.length) return [];
    const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
    let maxRadius = 1;
    for (const p of points) maxRadius = Math.max(maxRadius, Math.hypot(p.x - cx, p.y - cy));
    const targetRadius = Math.min(complexFourierCanvas.width, complexFourierCanvas.height) * 0.34;
    const scale = targetRadius / maxRadius;
    return points.map(p => ({
        x: (p.x - cx) * scale,
        y: -(p.y - cy) * scale,
    }));
}
function calculateComplexCoefficients(points, order) {
    if (!points.length) return [];
    const result = [];
    const m = points.length;
    for (let k = -order; k <= order; k++) {
        let re = 0;
        let im = 0;
        for (let j = 0; j < m; j++) {
            const theta = TWO_PI * k * j / m;
            const cos = Math.cos(theta);
            const sin = Math.sin(theta);
            re += points[j].x * cos + points[j].y * sin;
            im += points[j].y * cos - points[j].x * sin;
        }
        re /= m;
        im /= m;
        result.push({ k, re, im, amp: Math.hypot(re, im) });
    }
    return result.sort((a, b) => {
        const aa = Math.abs(a.k);
        const bb = Math.abs(b.k);
        if (aa !== bb) return aa - bb;
        return b.k - a.k;
    });
}
function rebuildComplexModel() {
    const resampled = resampleClosedPath(complexRawPath, COMPLEX_SAMPLE_COUNT);
    complexSamples = normalizeComplexSamples(resampled);
    complexCoeffs = calculateComplexCoefficients(complexSamples, +complexOrderInput.value);
    complexTrace = [];
    complexTime = 0;
    $('complexOrderValue').textContent = complexOrderInput.value;
    $('complexSampleValue').textContent = complexSamples.length ? String(complexSamples.length) : '0';
    $('complexCoeffValue').textContent = String(complexCoeffs.length);
    drawComplexInput();
    drawComplexFourier();
}
function drawComplexInput() {
    drawComplexGrid(complexDrawCtx, complexDrawCanvas);
    if (!complexRawPath.length) {
        complexDrawCtx.fillStyle = '#7188ad';
        complexDrawCtx.font = '16px system-ui, sans-serif';
        complexDrawCtx.textAlign = 'center';
        complexDrawCtx.fillText('按住鼠标，在这里画任意闭合轮廓', complexDrawCanvas.width / 2, complexDrawCanvas.height / 2);
        complexDrawCtx.textAlign = 'start';
        return;
    }
    complexDrawCtx.strokeStyle = '#63a7ff';
    complexDrawCtx.lineWidth = 3;
    complexDrawCtx.lineJoin = 'round';
    complexDrawCtx.lineCap = 'round';
    complexDrawCtx.beginPath();
    complexRawPath.forEach((p, i) => i === 0 ? complexDrawCtx.moveTo(p.x, p.y) : complexDrawCtx.lineTo(p.x, p.y));
    complexDrawCtx.stroke();
    if (!complexDrawing && complexRawPath.length > 2) {
        const first = complexRawPath[0];
        const last = complexRawPath[complexRawPath.length - 1];
        complexDrawCtx.setLineDash([7, 7]);
        complexDrawCtx.strokeStyle = '#3d679e';
        complexDrawCtx.lineWidth = 1.2;
        complexDrawCtx.beginPath();
        complexDrawCtx.moveTo(last.x, last.y);
        complexDrawCtx.lineTo(first.x, first.y);
        complexDrawCtx.stroke();
        complexDrawCtx.setLineDash([]);
    }
}
function complexPointAtTime(t) {
    let x = 0;
    let y = 0;
    for (const c of complexCoeffs) {
        const angle = c.k * t;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        x += c.re * cos - c.im * sin;
        y += c.re * sin + c.im * cos;
    }
    return { x, y };
}
function drawComplexFourier() {
    const ctx = complexFourierCtx;
    const canvas = complexFourierCanvas;
    drawComplexGrid(ctx, canvas);
    if (!complexCoeffs.length) {
        ctx.fillStyle = '#7188ad';
        ctx.font = '16px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('左侧完成手绘后，这里会自动进行复傅里叶重建', canvas.width / 2, canvas.height / 2);
        ctx.textAlign = 'start';
        return;
    }
    let x = canvas.width / 2;
    let y = canvas.height / 2;
    for (const c of complexCoeffs) {
        const angle = c.k * complexTime;
        const vx = c.re * Math.cos(angle) - c.im * Math.sin(angle);
        const vy = c.re * Math.sin(angle) + c.im * Math.cos(angle);
        const radius = c.amp;
        const emphasized = Math.abs(c.k) <= 2;
        if (radius > 0.7) {
            ctx.save();
            ctx.globalAlpha = c.k === 0 ? 0.18 : emphasized ? 0.35 : 0.18;
            ctx.strokeStyle = c.k === 0 ? '#86b5ff' : '#78a8ff';
            ctx.lineWidth = emphasized ? 1.5 : 1;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, TWO_PI);
            ctx.stroke();
            ctx.restore();
        }
        const nextX = x + vx;
        const nextY = y - vy;
        ctx.strokeStyle = c.k === 0 ? '#86b5ff' : '#91a9ce';
        ctx.lineWidth = Math.abs(c.k) <= 2 ? 1.8 : 1.1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(nextX, nextY);
        ctx.stroke();
        x = nextX;
        y = nextY;
    }
    if (complexTrace.length > 1) {
        ctx.strokeStyle = '#ffb347';
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        complexTrace.forEach((p, i) => {
            const px = canvas.width / 2 + p.x;
            const py = canvas.height / 2 - p.y;
            i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        });
        ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, TWO_PI);
    ctx.fill();
    ctx.fillStyle = '#8399bd';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('Σ cₖ eⁱᵏᵗ', 14, 22);
    $('complexTimeValue').textContent = complexTime.toFixed(2);
}
function complexCanvasPoint(e) {
    const rect = complexDrawCanvas.getBoundingClientRect();
    return {
        x: (e.clientX - rect.left) / rect.width * complexDrawCanvas.width,
        y: (e.clientY - rect.top) / rect.height * complexDrawCanvas.height,
    };
}
function loadComplexStarDemo() {
    contourRasterReady = false;
    complexRawPath = [];
    const cx = complexDrawCanvas.width / 2;
    const cy = complexDrawCanvas.height / 2;
    const outer = 185;
    const inner = 78;
    const vertices = [];
    for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const a = -Math.PI / 2 + i * Math.PI / 5;
        vertices.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
    for (let i = 0; i < vertices.length; i++) {
        const p0 = vertices[i];
        const p1 = vertices[(i + 1) % vertices.length];
        for (let j = 0; j < 28; j++) {
            const t = j / 28;
            complexRawPath.push({
                x: p0.x + (p1.x - p0.x) * t,
                y: p0.y + (p1.y - p0.y) * t,
            });
        }
    }
    rebuildComplexModel();
    $('contourStatus').textContent = '当前：内置星形路径';
}
function drawEpicycle() {
    const ctx = epicycleCtx;
    const canvas = epicycleCanvas;
    const w = canvas.width;
    const h = canvas.height;
    const nMax = +orderInput.value;
    const selected = +harmonicInput.value;
    const splitX = w * 0.45;
    const graphX = w * 0.51;
    const graphRight = w - 28;
    const centerY = h / 2;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#172846';
    ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
        const y = i * h / 6;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }
    ctx.strokeStyle = '#314a75';
    ctx.beginPath();
    ctx.moveTo(splitX, 22);
    ctx.lineTo(splitX, h - 22);
    ctx.stroke();
    ctx.strokeStyle = '#38527f';
    ctx.beginPath();
    ctx.moveTo(graphX, centerY);
    ctx.lineTo(graphRight, centerY);
    ctx.stroke();
    let totalMagnitude = Math.abs(coeff.a0 / 2);
    for (let n = 1; n <= nMax; n++) {
        totalMagnitude += Math.hypot(coeff.a[n] || 0, coeff.b[n] || 0);
    }
    const availableRadius = Math.min(splitX * 0.35, h * 0.37);
    const scale = availableRadius / Math.max(0.75, totalMagnitude);
    let x = splitX * 0.43;
    let y = centerY - (coeff.a0 / 2) * scale;
    ctx.fillStyle = '#86b5ff';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('a₀ / 2', 18, 26);
    for (let n = 1; n <= nMax; n++) {
        const a = coeff.a[n] || 0;
        const b = coeff.b[n] || 0;
        const amplitude = Math.hypot(a, b);
        const radius = amplitude * scale;
        const phase = Math.atan2(a, b);
        const theta = n * animationTime + phase;
        const dx = amplitude * Math.cos(theta) * scale;
        const dy = -amplitude * Math.sin(theta) * scale;
        const active = n === selected;
        if (radius > 0.7) {
            ctx.save();
            ctx.globalAlpha = active ? 0.95 : 0.28;
            ctx.strokeStyle = active ? '#ffb347' : '#78a8ff';
            ctx.lineWidth = active ? 2.4 : 1.2;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, TWO_PI);
            ctx.stroke();
            ctx.restore();
        }
        ctx.strokeStyle = active ? '#ffb347' : '#7f9fcf';
        ctx.lineWidth = active ? 2.8 : 1.35;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + dx, y + dy);
        ctx.stroke();
        if (active && radius > 9) {
            ctx.fillStyle = '#ffd18f';
            ctx.font = '12px system-ui, sans-serif';
            ctx.fillText(`n=${n}`, x + 7, y - 7);
        }
        x += dx;
        y += dy;
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, TWO_PI);
    ctx.fill();
    ctx.setLineDash([7, 7]);
    ctx.strokeStyle = '#788eaf';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(graphX, y);
    ctx.stroke();
    ctx.setLineDash([]);
    if (waveTrace.length > 1) {
        ctx.strokeStyle = '#f3f6ff';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        const graphWidth = graphRight - graphX;
        for (let i = 0; i < waveTrace.length; i++) {
            const px = graphX + i * graphWidth / (MAX_TRACE_POINTS - 1);
            const py = centerY - waveTrace[i] * scale;
            i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.stroke();
    }
    ctx.fillStyle = '#8da4c8';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('旋转相量链', 18, h - 18);
    ctx.fillText('端点随时间扫出的 N 阶重建波形 →', graphX, h - 18);
    $('timeValue').textContent = animationTime.toFixed(2);
}
function animate(now) {
    const dt = lastFrameTime === 0 ? 0 : Math.min(0.05, (now - lastFrameTime) / 1000);
    lastFrameTime = now;
    if (animationPlaying) {
        const speed = +animationSpeedInput.value;
        animationTime = (animationTime + dt * 0.9 * speed) % TWO_PI;
        waveTrace.unshift(reconstruct(animationTime, +orderInput.value));
        if (waveTrace.length > MAX_TRACE_POINTS)
            waveTrace.pop();
        drawEpicycle();
    }
    if (complexPlaying && complexCoeffs.length) {
        const complexSpeed = +complexSpeedInput.value;
        const previous = complexTime;
        complexTime = (complexTime + dt * 1.05 * complexSpeed) % TWO_PI;
        if (complexTime < previous) complexTrace = [];
        complexTrace.push(complexPointAtTime(complexTime));
        if (complexTrace.length > COMPLEX_SAMPLE_COUNT * 2) complexTrace.shift();
        drawComplexFourier();
    }
    requestAnimationFrame(animate);
}
function fmt(value) {
    const v = Math.abs(value) < 5e-4 ? 0 : value;
    return Number(v.toFixed(3)).toString();
}
function termHtml(coefValue, trig, n) {
    const sign = coefValue < 0 ? '−' : '+';
    return `<span class="formula-term formula-${trig}" data-n="${n}">${sign}${fmt(Math.abs(coefValue))} ${trig}(${n === 1 ? '' : n}x)</span>`;
}
function updateFormula() {
    const nMax = +orderInput.value;
    const compact = compactFormula.checked;
    const parts = [];
    const latexParts = [];
    const c0 = coeff.a0 / 2;
    parts.push(`<span class="formula-constant">f_${nMax}(x) = ${fmt(c0)}</span>`);
    latexParts.push(`f_{${nMax}}(x)=${fmt(c0)}`);
    for (let n = 1; n <= nMax; n++) {
        const entries = [[coeff.a[n], 'cos'], [coeff.b[n], 'sin']];
        for (const [c, t] of entries) {
            if (compact && Math.abs(c) < 0.005) continue;
            parts.push(termHtml(c, t, n));
            const sign = c < 0 ? '-' : '+';
            latexParts.push(`${sign}${fmt(Math.abs(c))}\\${t}(${n === 1 ? '' : n}x)`);
        }
    }
    formulaEl.innerHTML = parts.join(' ');
    latexEl.textContent = latexParts.join(' ');
    formulaEl.querySelectorAll('[data-n]').forEach(el => {
        const n = Number(el.dataset.n);
        if (n === +harmonicInput.value) el.classList.add('active');
        el.onclick = () => { harmonicInput.value = String(n); updateAll(false); };
    });
}
function updateStats() {
    const n = +harmonicInput.value;
    const amp = Math.hypot(coeff.a[n] || 0, coeff.b[n] || 0);
    $('rmsValue').textContent = computeRms(+orderInput.value).toFixed(4);
    $('a0Value').textContent = fmt(coeff.a0 / 2);
    $('ampValue').textContent = amp.toFixed(4);
}
function updateAll(recalc = true) {
    const nMax = +orderInput.value;
    if (recalc) {
        coeff = calculateCoefficients(nMax);
        waveTrace.length = 0;
    }
    harmonicInput.max = String(nMax);
    if (+harmonicInput.value > nMax) harmonicInput.value = String(nMax);
    $('orderValue').textContent = orderInput.value;
    $('harmonicValue').textContent = harmonicInput.value;
    drawMain();
    drawSpectrum(ampCtx, ampCanvas, Array.from({ length: nMax }, (_, i) => Math.hypot(coeff.a[i + 1], coeff.b[i + 1])));
    drawSpectrum(phaseCtx, phaseCanvas, Array.from({ length: nMax }, (_, i) => Math.atan2(-coeff.b[i + 1], coeff.a[i + 1])), true);
    updateFormula();
    updateStats();
    drawEpicycle();
    if (recalc) updateAnalytics();
}
function pointerToSample(e) {
    const rect = mainCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const yPx = (e.clientY - rect.top) / rect.height * mainCanvas.height;
    const y = (mainCanvas.height / 2 - yPx) / (mainCanvas.height / (2 * 1.8));
    return {
        index: Math.max(0, Math.min(SAMPLE_COUNT - 1, Math.round(x * (SAMPLE_COUNT - 1)))),
        y: Math.max(-1.8, Math.min(1.8, y))
    };
}
function applyDraw(index, y) {
    if (lastDrawIndex == null) samples[index] = y;
    else {
        const start = Math.min(lastDrawIndex, index), end = Math.max(lastDrawIndex, index);
        const y0 = samples[lastDrawIndex];
        for (let i = start; i <= end; i++) {
            const t = end === start ? 1 : (i - start) / (end - start);
            samples[i] = lastDrawIndex <= index ? y0 + (y - y0) * t : y + (y0 - y) * t;
        }
    }
    lastDrawIndex = index;
    updateAll();
}
mainCanvas.addEventListener('pointerdown', e => {
    drawing = true; lastDrawIndex = null; mainCanvas.setPointerCapture(e.pointerId);
    const p = pointerToSample(e); applyDraw(p.index, p.y);
});
mainCanvas.addEventListener('pointermove', e => {
    if (!drawing) return;
    const p = pointerToSample(e); applyDraw(p.index, p.y);
});
mainCanvas.addEventListener('pointerup', () => { drawing = false; lastDrawIndex = null; });
mainCanvas.addEventListener('pointercancel', () => { drawing = false; lastDrawIndex = null; });
document.querySelectorAll('.mode-btn').forEach(button => {
    button.onclick = () => {
        const mode = button.dataset.mode;
        if (mode === 'all' || mode === 'one' || mode === 'two') setDisplayMode(mode);
    };
});
errorCanvas.addEventListener('click', e => {
    const rect = errorCanvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const fraction = rect.width > 0 ? x / rect.width : 0;
    const n = Math.max(1, Math.min(64, Math.round(fraction * 63) + 1));
    orderInput.value = String(n);
    updateAll();
});
$('exportMainPngBtn').onclick = () => exportCanvasPng(mainCanvas, 'fourier-studio-time-domain.png');
$('exportEpicyclePngBtn').onclick = () => exportCanvasPng(epicycleCanvas, 'fourier-studio-epicycles.png');
$('exportComplexPngBtn').onclick = () => exportCanvasPng(complexFourierCanvas, 'fourier-studio-2d.png');
$('exportComplexGifBtn').onclick = () => {
    void exportComplexGif();
};
orderInput.oninput = () => updateAll();
harmonicInput.oninput = () => updateAll(false);
presetSelect.onchange = () => loadPreset();
compactFormula.onchange = () => updateFormula();
animationSpeedInput.oninput = () => {
    $('speedValue').textContent = `${Number(animationSpeedInput.value).toFixed(2)}×`;
};
$('playBtn').onclick = () => {
    animationPlaying = !animationPlaying;
    $('playBtn').textContent = animationPlaying ? '暂停' : '继续';
    lastFrameTime = performance.now();
    drawEpicycle();
};
$('restartAnimationBtn').onclick = () => {
    animationTime = 0;
    waveTrace.length = 0;
    animationPlaying = true;
    $('playBtn').textContent = '暂停';
    lastFrameTime = performance.now();
    drawEpicycle();
};

complexDrawCanvas.addEventListener('pointerdown', e => {
    contourRasterReady = false;
    $('contourStatus').textContent = '当前：手绘路径';
    complexDrawing = true;
    complexRawPath = [];
    complexTrace = [];
    complexDrawCanvas.setPointerCapture(e.pointerId);
    complexRawPath.push(complexCanvasPoint(e));
    drawComplexInput();
});
complexDrawCanvas.addEventListener('pointermove', e => {
    if (!complexDrawing) return;
    const p = complexCanvasPoint(e);
    const last = complexRawPath[complexRawPath.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= 2.5) {
        complexRawPath.push(p);
        drawComplexInput();
    }
});
const finishComplexDraw = () => {
    if (!complexDrawing) return;
    complexDrawing = false;
    if (complexRawPath.length >= 6) rebuildComplexModel();
    else drawComplexInput();
};
complexDrawCanvas.addEventListener('pointerup', finishComplexDraw);
complexDrawCanvas.addEventListener('pointercancel', finishComplexDraw);
$('contourTextBtn').onclick = () => renderTextContour();
contourTextInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') renderTextContour();
});
contourImageInput.onchange = () => {
    const file = contourImageInput.files?.[0];
    if (file) importContourImage(file);
};
contourThresholdInput.oninput = () => {
    $('contourThresholdValue').textContent = contourThresholdInput.value;
    if (contourRasterReady) applyRasterContour('阈值更新');
};
complexOrderInput.oninput = () => rebuildComplexModel();
complexSpeedInput.oninput = () => {
    $('complexSpeedValue').textContent = `${Number(complexSpeedInput.value).toFixed(2)}×`;
};
$('complexPlayBtn').onclick = () => {
    complexPlaying = !complexPlaying;
    $('complexPlayBtn').textContent = complexPlaying ? '暂停' : '继续';
    drawComplexFourier();
};
$('complexRestartBtn').onclick = () => {
    complexTime = 0;
    complexTrace = [];
    complexPlaying = true;
    $('complexPlayBtn').textContent = '暂停';
    drawComplexFourier();
};
$('complexClearBtn').onclick = () => {
    contourRasterReady = false;
    complexRawPath = [];
    complexSamples = [];
    complexCoeffs = [];
    complexTrace = [];
    complexTime = 0;
    drawComplexInput();
    drawComplexFourier();
    $('complexSampleValue').textContent = '0';
    $('complexCoeffValue').textContent = '0';
    $('contourStatus').textContent = '画布已清空，可直接手绘，或使用上方文字 / 图片导入。';
};
$('complexDemoBtn').onclick = () => loadComplexStarDemo();
$('resetBtn').onclick = () => loadPreset();
$('clearBtn').onclick = () => { samples.fill(0); updateAll(); };
$('copyLatexBtn').onclick = async () => {
    await navigator.clipboard.writeText(latexEl.textContent || '');
    const b = $('copyLatexBtn'), old = b.textContent;
    b.textContent = '已复制';
    setTimeout(() => b.textContent = old, 900);
};
let initialMode = 'all';
try {
    const savedMode = localStorage.getItem('fourier-studio-mode');
    if (savedMode === 'one' || savedMode === 'two' || savedMode === 'all') initialMode = savedMode;
}
catch {
}
setDisplayMode(initialMode);
loadPreset('sine');
loadComplexStarDemo();
lastFrameTime = performance.now();
requestAnimationFrame(animate);
