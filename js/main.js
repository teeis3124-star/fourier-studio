"use strict";
const SAMPLE_COUNT = 512;
const TWO_PI = Math.PI * 2;
const $ = (id) => document.getElementById(id);
const mainCanvas = $('mainCanvas');
const ampCanvas = $('ampCanvas');
const phaseCanvas = $('phaseCanvas');
const epicycleCanvas = $('epicycleCanvas');
const mainCtx = mainCanvas.getContext('2d');
const ampCtx = ampCanvas.getContext('2d');
const phaseCtx = phaseCanvas.getContext('2d');
const epicycleCtx = epicycleCanvas.getContext('2d');
const orderInput = $('order');
const harmonicInput = $('harmonic');
const presetSelect = $('preset');
const formulaEl = $('formula');
const latexEl = $('latex');
const compactFormula = $('compactFormula');
const animationSpeedInput = $('animationSpeed');
let samples = new Float64Array(SAMPLE_COUNT);
let drawing = false;
let lastDrawIndex = null;
let coeff = { a0: 0, a: [], b: [] };
let animationTime = 0;
let animationPlaying = true;
let lastFrameTime = 0;
const waveTrace = [];
const MAX_TRACE_POINTS = 440;
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
$('resetBtn').onclick = () => loadPreset();
$('clearBtn').onclick = () => { samples.fill(0); updateAll(); };
$('copyLatexBtn').onclick = async () => {
    await navigator.clipboard.writeText(latexEl.textContent || '');
    const b = $('copyLatexBtn'), old = b.textContent;
    b.textContent = '已复制';
    setTimeout(() => b.textContent = old, 900);
};
loadPreset('sine');
lastFrameTime = performance.now();
requestAnimationFrame(animate);
