const SAMPLE_COUNT = 512;
const TWO_PI = Math.PI * 2;

type Coeff = { a0: number; a: number[]; b: number[] };
type Preset = 'sine' | 'square' | 'saw' | 'triangle' | 'pulse';
type Point2 = { x: number; y: number };
type ComplexCoeff = { k: number; re: number; im: number; amp: number };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const mainCanvas = $<HTMLCanvasElement>('mainCanvas');
const ampCanvas = $<HTMLCanvasElement>('ampCanvas');
const phaseCanvas = $<HTMLCanvasElement>('phaseCanvas');
const epicycleCanvas = $<HTMLCanvasElement>('epicycleCanvas');
const complexDrawCanvas = $<HTMLCanvasElement>('complexDrawCanvas');
const complexFourierCanvas = $<HTMLCanvasElement>('complexFourierCanvas');
const mainCtx = mainCanvas.getContext('2d')!;
const ampCtx = ampCanvas.getContext('2d')!;
const phaseCtx = phaseCanvas.getContext('2d')!;
const epicycleCtx = epicycleCanvas.getContext('2d')!;
const complexDrawCtx = complexDrawCanvas.getContext('2d')!;
const complexFourierCtx = complexFourierCanvas.getContext('2d')!;
const orderInput = $<HTMLInputElement>('order');
const harmonicInput = $<HTMLInputElement>('harmonic');
const presetSelect = $<HTMLSelectElement>('preset');
const formulaEl = $('formula');
const latexEl = $('latex');
const compactFormula = $<HTMLInputElement>('compactFormula');
const animationSpeedInput = $<HTMLInputElement>('animationSpeed');
const complexOrderInput = $<HTMLInputElement>('complexOrder');
const complexSpeedInput = $<HTMLInputElement>('complexSpeed');

let samples = new Float64Array(SAMPLE_COUNT);
let drawing = false;
let lastDrawIndex: number | null = null;
let coeff: Coeff = { a0: 0, a: [], b: [] };
let animationTime = 0;
let animationPlaying = true;
let lastFrameTime = 0;
const waveTrace: number[] = [];
const MAX_TRACE_POINTS = 440;
const COMPLEX_SAMPLE_COUNT = 256;
let complexRawPath: Point2[] = [];
let complexSamples: Point2[] = [];
let complexCoeffs: ComplexCoeff[] = [];
let complexTrace: Point2[] = [];
let complexDrawing = false;
let complexTime = 0;
let complexPlaying = true;

function presetValue(kind: Preset, x: number): number {
  const s = Math.sin(x);
  if (kind === 'sine') return Math.sin(x) + 0.35 * Math.sin(3 * x);
  if (kind === 'square') return s >= 0 ? 1 : -1;
  if (kind === 'saw') return ((x + Math.PI) % TWO_PI) / Math.PI - 1;
  if (kind === 'triangle') return (2 / Math.PI) * Math.asin(Math.sin(x));
  return Math.abs(((x + Math.PI) % TWO_PI) - Math.PI) < Math.PI / 4 ? 1 : -0.3;
}

function loadPreset(kind = presetSelect.value as Preset) {
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const x = -Math.PI + TWO_PI * i / SAMPLE_COUNT;
    samples[i] = presetValue(kind, x);
  }
  updateAll();
}

function calculateCoefficients(maxN: number): Coeff {
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

function reconstruct(x: number, nMax: number): number {
  let y = coeff.a0 / 2;
  for (let n = 1; n <= nMax; n++) {
    y += coeff.a[n] * Math.cos(n * x) + coeff.b[n] * Math.sin(n * x);
  }
  return y;
}

function harmonicValue(x: number, n: number): number {
  return coeff.a[n] * Math.cos(n * x) + coeff.b[n] * Math.sin(n * x);
}

function computeRms(nMax: number): number {
  let sum = 0;
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const x = -Math.PI + TWO_PI * i / SAMPLE_COUNT;
    const e = samples[i] - reconstruct(x, nMax);
    sum += e * e;
  }
  return Math.sqrt(sum / SAMPLE_COUNT);
}

function canvasY(y: number, h: number, range = 1.8) {
  return h / 2 - y * (h / (2 * range));
}

function drawGrid(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, yRange = 1.8) {
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = '#172846';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 8; i++) {
    const x = i * w / 8;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let i = -2; i <= 2; i++) {
    const y = canvasY(i * yRange / 2, h, yRange);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.strokeStyle = '#38527f';
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();
}

function drawCurve(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  fn: (x: number, i: number) => number,
  color: string,
  width = 2,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
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

function drawSpectrum(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  values: number[],
  phase = false,
) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const pad = 42;
  const w = canvas.width - pad * 2;
  const h = canvas.height - pad * 2;
  ctx.strokeStyle = '#38527f';
  ctx.beginPath();
  ctx.moveTo(pad, pad);
  ctx.lineTo(pad, pad + h);
  ctx.lineTo(pad + w, pad + h);
  ctx.stroke();

  const maxAbs = phase ? Math.PI : Math.max(0.001, ...values.map(Math.abs));
  const barW = Math.max(2, w / Math.max(values.length, 1) * 0.62);
  values.forEach((v, idx) => {
    const x = pad + (idx + 0.5) * w / values.length;
    const zeroY = phase ? pad + h / 2 : pad + h;
    const y = phase ? zeroY - v / maxAbs * h / 2 : zeroY - v / maxAbs * h;
    ctx.strokeStyle = idx + 1 === +harmonicInput.value ? '#ffb347' : '#78a8ff';
    ctx.lineWidth = barW;
    ctx.beginPath();
    ctx.moveTo(x, zeroY);
    ctx.lineTo(x, y);
    ctx.stroke();
  });
}



function drawComplexGrid(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
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

function resampleClosedPath(points: Point2[], count: number): Point2[] {
  if (points.length < 2) return [];
  const closed = [...points, points[0]];
  const lengths: number[] = [0];
  let total = 0;
  for (let i = 1; i < closed.length; i++) {
    total += Math.hypot(closed[i].x - closed[i - 1].x, closed[i].y - closed[i - 1].y);
    lengths.push(total);
  }
  if (total < 1) return [];
  const result: Point2[] = [];
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

function normalizeComplexSamples(points: Point2[]): Point2[] {
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

function calculateComplexCoefficients(points: Point2[], order: number): ComplexCoeff[] {
  if (!points.length) return [];
  const result: ComplexCoeff[] = [];
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

function complexPointAtTime(t: number): Point2 {
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

function complexCanvasPoint(e: PointerEvent): Point2 {
  const rect = complexDrawCanvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / rect.width * complexDrawCanvas.width,
    y: (e.clientY - rect.top) / rect.height * complexDrawCanvas.height,
  };
}

function loadComplexStarDemo() {
  complexRawPath = [];
  const cx = complexDrawCanvas.width / 2;
  const cy = complexDrawCanvas.height / 2;
  const outer = 185;
  const inner = 78;
  const vertices: Point2[] = [];
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

function animate(now: number) {
  const dt = lastFrameTime === 0 ? 0 : Math.min(0.05, (now - lastFrameTime) / 1000);
  lastFrameTime = now;

  if (animationPlaying) {
    const speed = +animationSpeedInput.value;
    animationTime = (animationTime + dt * 0.9 * speed) % TWO_PI;
    waveTrace.unshift(reconstruct(animationTime, +orderInput.value));
    if (waveTrace.length > MAX_TRACE_POINTS) waveTrace.pop();
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

function fmt(value: number): string {
  const v = Math.abs(value) < 5e-4 ? 0 : value;
  return Number(v.toFixed(3)).toString();
}

function termHtml(coefValue: number, trig: 'cos' | 'sin', n: number): string {
  const sign = coefValue < 0 ? '−' : '+';
  const abs = Math.abs(coefValue);
  return `<span class="formula-term formula-${trig}" data-n="${n}">${sign}${fmt(abs)} ${trig}(${n === 1 ? '' : n}x)</span>`;
}

function updateFormula() {
  const nMax = +orderInput.value;
  const compact = compactFormula.checked;
  const parts: string[] = [];
  const latexParts: string[] = [];
  const c0 = coeff.a0 / 2;

  parts.push(`<span class="formula-constant">f_${nMax}(x) = ${fmt(c0)}</span>`);
  latexParts.push(`f_{${nMax}}(x)=${fmt(c0)}`);

  for (let n = 1; n <= nMax; n++) {
    const entries: Array<[number, 'cos' | 'sin']> = [[coeff.a[n], 'cos'], [coeff.b[n], 'sin']];
    for (const [c, t] of entries) {
      if (compact && Math.abs(c) < 0.005) continue;
      parts.push(termHtml(c, t, n));
      const sign = c < 0 ? '-' : '+';
      latexParts.push(`${sign}${fmt(Math.abs(c))}\\${t}(${n === 1 ? '' : n}x)`);
    }
  }

  formulaEl.innerHTML = parts.join(' ');
  latexEl.textContent = latexParts.join(' ');

  formulaEl.querySelectorAll<HTMLElement>('[data-n]').forEach(el => {
    const n = Number(el.dataset.n);
    if (n === +harmonicInput.value) el.classList.add('active');
    el.onclick = () => {
      harmonicInput.value = String(n);
      updateAll(false);
    };
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
  drawSpectrum(
    ampCtx,
    ampCanvas,
    Array.from({ length: nMax }, (_, i) => Math.hypot(coeff.a[i + 1], coeff.b[i + 1])),
  );
  drawSpectrum(
    phaseCtx,
    phaseCanvas,
    Array.from({ length: nMax }, (_, i) => Math.atan2(-coeff.b[i + 1], coeff.a[i + 1])),
    true,
  );
  updateFormula();
  updateStats();
  drawEpicycle();
}

function pointerToSample(e: PointerEvent): { index: number; y: number } {
  const rect = mainCanvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const yPx = (e.clientY - rect.top) / rect.height * mainCanvas.height;
  const y = (mainCanvas.height / 2 - yPx) / (mainCanvas.height / (2 * 1.8));
  return {
    index: Math.max(0, Math.min(SAMPLE_COUNT - 1, Math.round(x * (SAMPLE_COUNT - 1)))),
    y: Math.max(-1.8, Math.min(1.8, y)),
  };
}

function applyDraw(index: number, y: number) {
  if (lastDrawIndex == null) {
    samples[index] = y;
  } else {
    const start = Math.min(lastDrawIndex, index);
    const end = Math.max(lastDrawIndex, index);
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
  drawing = true;
  lastDrawIndex = null;
  mainCanvas.setPointerCapture(e.pointerId);
  const p = pointerToSample(e);
  applyDraw(p.index, p.y);
});
mainCanvas.addEventListener('pointermove', e => {
  if (!drawing) return;
  const p = pointerToSample(e);
  applyDraw(p.index, p.y);
});
mainCanvas.addEventListener('pointerup', () => {
  drawing = false;
  lastDrawIndex = null;
});
mainCanvas.addEventListener('pointercancel', () => {
  drawing = false;
  lastDrawIndex = null;
});

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

complexOrderInput.oninput = () => rebuildComplexModel();
complexSpeedInput.oninput = () => {
  $('complexSpeedValue').textContent = \`\${Number(complexSpeedInput.value).toFixed(2)}×\`;
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
  complexRawPath = [];
  complexSamples = [];
  complexCoeffs = [];
  complexTrace = [];
  complexTime = 0;
  drawComplexInput();
  drawComplexFourier();
  $('complexSampleValue').textContent = '0';
  $('complexCoeffValue').textContent = '0';
};
$('complexDemoBtn').onclick = () => loadComplexStarDemo();

$('resetBtn').onclick = () => loadPreset();
$('clearBtn').onclick = () => {
  samples.fill(0);
  updateAll();
};
$('copyLatexBtn').onclick = async () => {
  await navigator.clipboard.writeText(latexEl.textContent || '');
  const button = $('copyLatexBtn');
  const old = button.textContent;
  button.textContent = '已复制';
  setTimeout(() => button.textContent = old, 900);
};

loadPreset('sine');
loadComplexStarDemo();
lastFrameTime = performance.now();
requestAnimationFrame(animate);
