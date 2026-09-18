// @ts-nocheck
const fft$ = id => document.getElementById(id);

const fftTimeCanvas = fft$('fftTimeCanvas');
const fftAmpCanvas = fft$('fftAmpCanvas');
const fftPhaseCanvas = fft$('fftPhaseCanvas');
const fftPsdCanvas = fft$('fftPsdCanvas');
const fftReconCanvas = fft$('fftReconCanvas');

const fftTimeCtx = fftTimeCanvas.getContext('2d');
const fftAmpCtx = fftAmpCanvas.getContext('2d');
const fftPhaseCtx = fftPhaseCanvas.getContext('2d');
const fftPsdCtx = fftPsdCanvas.getContext('2d');
const fftReconCtx = fftReconCanvas.getContext('2d');

const fftSampleRateInput = fft$('fftSampleRate');
const fftWindowSelect = fft$('fftWindow');
const fftRemoveDcInput = fft$('fftRemoveDc');
const fftReconCountInput = fft$('fftReconCount');
const fftMaxFreqInput = fft$('fftMaxFreq');
const fftPasteData = fft$('fftPasteData');
const FFT_MAX_SAMPLES = 65536;
const FFT_MIN_SAMPLES = 8;

let fftSignal = new Float64Array(0);
let fftSampleRate = 1000;
let fftSourceLabel = '示例信号';
let fftResult = null;

function fftStatus(message, isError = false) {
  const el = fft$('fftStatus');
  el.textContent = message;
  el.style.color = isError ? '#ff9b9b' : '#9fb6da';
}

function fftNextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

function fftMean(values) {
  if (!values.length) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

function fftMedian(values) {
  if (!values.length) return 0;
  const copy = [...values].sort((a, b) => a - b);
  const mid = Math.floor(copy.length / 2);
  return copy.length % 2 ? copy[mid] : (copy[mid - 1] + copy[mid]) / 2;
}

function fftWindowValue(kind, n, count) {
  if (count <= 1 || kind === 'rect') return 1;
  const x = 2 * Math.PI * n / (count - 1);
  if (kind === 'hann') return 0.5 - 0.5 * Math.cos(x);
  if (kind === 'hamming') return 0.54 - 0.46 * Math.cos(x);
  if (kind === 'blackman') return 0.42 - 0.5 * Math.cos(x) + 0.08 * Math.cos(2 * x);
  return 1;
}

function fftRadix2(re, im) {
  const n = re.length;
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const angle = -2 * Math.PI / len;
    const wLenRe = Math.cos(angle);
    const wLenIm = Math.sin(angle);

    for (let i = 0; i < n; i += len) {
      let wr = 1;
      let wi = 0;
      const half = len >> 1;

      for (let k = 0; k < half; k++) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + half] * wr - im[i + k + half] * wi;
        const vIm = re[i + k + half] * wi + im[i + k + half] * wr;

        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + half] = uRe - vRe;
        im[i + k + half] = uIm - vIm;

        const nextWr = wr * wLenRe - wi * wLenIm;
        wi = wr * wLenIm + wi * wLenRe;
        wr = nextWr;
      }
    }
  }
}

function fftAnalyzeSignal() {
  if (fftSignal.length < FFT_MIN_SAMPLES) {
    fftStatus('至少需要 8 个采样点才能进行 FFT。', true);
    return;
  }

  const source = fftSignal.length > FFT_MAX_SAMPLES
    ? fftSignal.slice(0, FFT_MAX_SAMPLES)
    : fftSignal;

  const fs = Number(fftSampleRateInput.value);
  if (!Number.isFinite(fs) || fs <= 0) {
    fftStatus('采样率必须是大于 0 的数值。', true);
    return;
  }

  fftSampleRate = fs;
  const count = source.length;
  const fftSize = fftNextPow2(count);
  const removeDc = fftRemoveDcInput.checked;
  const windowKind = fftWindowSelect.value;
  const mean = fftMean(source);
  const processed = new Float64Array(count);
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);

  let windowSum = 0;
  let windowEnergy = 0;

  for (let i = 0; i < count; i++) {
    const base = source[i] - (removeDc ? mean : 0);
    processed[i] = base;
    const w = fftWindowValue(windowKind, i, count);
    windowSum += w;
    windowEnergy += w * w;
    re[i] = base * w;
  }

  fftRadix2(re, im);

  const half = Math.floor(fftSize / 2) + 1;
  const freqs = new Float64Array(half);
  const amps = new Float64Array(half);
  const phases = new Float64Array(half);
  const psd = new Float64Array(half);
  const mags = new Float64Array(half);
  const coherentGain = windowSum / count || 1;

  for (let k = 0; k < half; k++) {
    const mag = Math.hypot(re[k], im[k]);
    mags[k] = mag;
    freqs[k] = k * fs / fftSize;

    let amplitude = mag / (count * coherentGain);
    let density = (mag * mag) / (fs * Math.max(windowEnergy, 1e-30));

    const isEdge = k === 0 || (fftSize % 2 === 0 && k === fftSize / 2);
    if (!isEdge) {
      amplitude *= 2;
      density *= 2;
    }

    amps[k] = amplitude;
    phases[k] = Math.atan2(im[k], re[k]);
    psd[k] = density;
  }

  const peaks = fftFindPeaks(freqs, amps, phases, fs, fftSize);
  const reconCount = Math.min(Number(fftReconCountInput.value), peaks.length);
  const reconstruction = fftReconstruct(processed, peaks.slice(0, reconCount), fs, removeDc ? 0 : mean);
  const rms = fftRmsError(processed, reconstruction);

  fftResult = {
    source,
    processed,
    count,
    fs,
    fftSize,
    freqs,
    amps,
    phases,
    psd,
    peaks,
    reconstruction,
    rms,
    mean,
    windowKind,
    removeDc,
  };

  fftRenderAll();

  const truncateNote = fftSignal.length > FFT_MAX_SAMPLES
    ? '；文件较长，当前分析前 ' + FFT_MAX_SAMPLES + ' 点'
    : '';
  fftStatus(fftSourceLabel + '：FFT 完成，N=' + count + '，FFT size=' + fftSize + truncateNote);
}

function fftFindPeaks(freqs, amps, phases, fs, fftSize) {
  const peaks = [];
  let maxAmp = 0;
  for (let i = 1; i < amps.length; i++) maxAmp = Math.max(maxAmp, amps[i]);
  const threshold = maxAmp * 0.001;

  for (let k = 1; k < amps.length - 1; k++) {
    const y1 = amps[k - 1];
    const y2 = amps[k];
    const y3 = amps[k + 1];

    if (y2 < threshold || y2 < y1 || y2 < y3) continue;

    const denom = y1 - 2 * y2 + y3;
    let delta = Math.abs(denom) > 1e-20 ? 0.5 * (y1 - y3) / denom : 0;
    delta = Math.max(-0.5, Math.min(0.5, delta));

    const estimateAmp = Math.max(0, y2 - 0.25 * (y1 - y3) * delta);
    const estimateFreq = (k + delta) * fs / fftSize;

    peaks.push({
      bin: k,
      freq: estimateFreq,
      binFreq: freqs[k],
      amp: estimateAmp,
      phase: phases[k],
    });
  }

  peaks.sort((a, b) => b.amp - a.amp);
  return peaks.slice(0, 64);
}

function fftReconstruct(target, peaks, fs, dc) {
  const out = new Float64Array(target.length);
  for (let n = 0; n < out.length; n++) {
    const t = n / fs;
    let y = dc;
    for (const peak of peaks) {
      y += peak.amp * Math.cos(2 * Math.PI * peak.binFreq * t + peak.phase);
    }
    out[n] = y;
  }
  return out;
}

function fftRmsError(a, b) {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const e = a[i] - b[i];
    sum += e * e;
  }
  return Math.sqrt(sum / n);
}

function fftFormatNumber(value, digits = 4) {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 1e5 || abs < 1e-3)) return value.toExponential(3);
  return Number(value.toFixed(digits)).toString();
}

function fftDrawGrid(ctx, canvas) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#162744';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 6; i++) {
    const y = 20 + i * (canvas.height - 55) / 6;
    ctx.beginPath();
    ctx.moveTo(54, y);
    ctx.lineTo(canvas.width - 18, y);
    ctx.stroke();
  }
  for (let i = 0; i <= 8; i++) {
    const x = 54 + i * (canvas.width - 72) / 8;
    ctx.beginPath();
    ctx.moveTo(x, 20);
    ctx.lineTo(x, canvas.height - 35);
    ctx.stroke();
  }
}

function fftDrawChart(canvas, ctx, xs, ys, options = {}) {
  fftDrawGrid(ctx, canvas);
  if (!xs.length || !ys.length) return;

  const padL = 54;
  const padR = 18;
  const padT = 20;
  const padB = 35;
  const width = canvas.width - padL - padR;
  const height = canvas.height - padT - padB;

  const requestedMaxX = options.maxX;
  const maxIndex = requestedMaxX == null
    ? xs.length - 1
    : Math.max(1, Math.min(xs.length - 1, fftUpperBound(xs, requestedMaxX)));

  const xMin = xs[0];
  const xMax = xs[maxIndex] || 1;

  let yMin = options.yMin;
  let yMax = options.yMax;

  if (yMin == null || yMax == null) {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i <= maxIndex; i++) {
      const v = ys[i];
      if (!Number.isFinite(v)) continue;
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      min = -1;
      max = 1;
    }
    if (Math.abs(max - min) < 1e-12) {
      min -= 1;
      max += 1;
    }
    const margin = (max - min) * 0.08;
    yMin = min - margin;
    yMax = max + margin;
  }

  const toX = x => padL + (x - xMin) / Math.max(1e-30, xMax - xMin) * width;
  const toY = y => padT + (yMax - y) / Math.max(1e-30, yMax - yMin) * height;

  ctx.strokeStyle = options.color || '#78a8ff';
  ctx.lineWidth = options.lineWidth || 2;
  ctx.beginPath();

  let started = false;
  for (let i = 0; i <= maxIndex; i++) {
    const y = ys[i];
    if (!Number.isFinite(y)) {
      started = false;
      continue;
    }
    const px = toX(xs[i]);
    const py = toY(y);
    if (!started) {
      ctx.moveTo(px, py);
      started = true;
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.stroke();

  ctx.fillStyle = '#8499bb';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(fftFormatNumber(xMin, 2), padL, canvas.height - 12);
  const xLabel = fftFormatNumber(xMax, 2);
  ctx.fillText(xLabel, canvas.width - padR - ctx.measureText(xLabel).width, canvas.height - 12);
  ctx.fillText(fftFormatNumber(yMax, 3), 6, padT + 4);
  ctx.fillText(fftFormatNumber(yMin, 3), 6, padT + height);

  if (options.xUnit) {
    const label = options.xUnit;
    ctx.fillText(label, padL + width / 2 - ctx.measureText(label).width / 2, canvas.height - 12);
  }
}

function fftDrawOverlay(canvas, ctx, xs, y1, y2) {
  fftDrawGrid(ctx, canvas);
  if (!xs.length) return;

  const padL = 54, padR = 18, padT = 20, padB = 35;
  const width = canvas.width - padL - padR;
  const height = canvas.height - padT - padB;
  let min = Infinity, max = -Infinity;

  for (let i = 0; i < xs.length; i++) {
    min = Math.min(min, y1[i], y2[i]);
    max = Math.max(max, y1[i], y2[i]);
  }

  if (Math.abs(max - min) < 1e-12) {
    min -= 1;
    max += 1;
  }

  const margin = (max - min) * 0.08;
  min -= margin;
  max += margin;

  const xMin = xs[0];
  const xMax = xs[xs.length - 1] || 1;
  const toX = x => padL + (x - xMin) / Math.max(1e-30, xMax - xMin) * width;
  const toY = y => padT + (max - y) / Math.max(1e-30, max - min) * height;

  const draw = (values, color, widthPx) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = widthPx;
    ctx.beginPath();
    for (let i = 0; i < values.length; i++) {
      const px = toX(xs[i]);
      const py = toY(values[i]);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.stroke();
  };

  draw(y1, '#63a7ff', 2);
  draw(y2, '#ffb347', 2);

  ctx.fillStyle = '#8499bb';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('原始/预处理', padL, 14);
  ctx.fillStyle = '#ffb347';
  ctx.fillText('主频重建', padL + 90, 14);
  ctx.fillStyle = '#8499bb';
  ctx.fillText('s', padL + width / 2, canvas.height - 12);
}

function fftUpperBound(arr, value) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return Math.max(0, lo - 1);
}

function fftRenderAll() {
  if (!fftResult) return;

  const r = fftResult;
  const times = new Float64Array(r.count);
  for (let i = 0; i < r.count; i++) times[i] = i / r.fs;

  const maxFreqInput = Number(fftMaxFreqInput.value);
  const maxFreq = Number.isFinite(maxFreqInput) && maxFreqInput > 0
    ? Math.min(maxFreqInput, r.fs / 2)
    : r.fs / 2;

  fftDrawChart(fftTimeCanvas, fftTimeCtx, times, r.source, {
    color: '#63a7ff',
    xUnit: 's',
  });

  fftDrawChart(fftAmpCanvas, fftAmpCtx, r.freqs, r.amps, {
    color: '#ffb347',
    xUnit: 'Hz',
    yMin: 0,
    maxX: maxFreq,
  });

  const phaseDisplay = new Float64Array(r.phases.length);
  let maxAmp = 0;
  for (const v of r.amps) maxAmp = Math.max(maxAmp, v);
  const phaseThreshold = maxAmp * 1e-4;

  for (let i = 0; i < r.phases.length; i++) {
    phaseDisplay[i] = r.amps[i] >= phaseThreshold ? r.phases[i] : NaN;
  }

  fftDrawChart(fftPhaseCanvas, fftPhaseCtx, r.freqs, phaseDisplay, {
    color: '#d3a7ff',
    xUnit: 'Hz',
    yMin: -Math.PI,
    yMax: Math.PI,
    maxX: maxFreq,
  });

  const psdDb = new Float64Array(r.psd.length);
  let maxDb = -Infinity;
  for (let i = 0; i < r.psd.length; i++) {
    psdDb[i] = 10 * Math.log10(Math.max(r.psd[i], 1e-20));
    maxDb = Math.max(maxDb, psdDb[i]);
  }
  const minDb = maxDb - 100;
  for (let i = 0; i < psdDb.length; i++) psdDb[i] = Math.max(minDb, psdDb[i]);

  fftDrawChart(fftPsdCanvas, fftPsdCtx, r.freqs, psdDb, {
    color: '#98e0c4',
    xUnit: 'Hz',
    yMin: minDb,
    yMax: maxDb + 3,
    maxX: maxFreq,
  });

  fftDrawOverlay(fftReconCanvas, fftReconCtx, times, r.processed, r.reconstruction);
  fftRenderPeaks();

  fft$('fftSampleCount').textContent = String(r.count);
  fft$('fftFsValue').textContent = fftFormatNumber(r.fs, 3) + ' Hz';
  fft$('fftDuration').textContent = fftFormatNumber(r.count / r.fs, 5) + ' s';
  fft$('fftResolution').textContent = fftFormatNumber(r.fs / r.fftSize, 6) + ' Hz';
  fft$('fftNyquist').textContent = fftFormatNumber(r.fs / 2, 3) + ' Hz';
  fft$('fftReconRms').textContent = fftFormatNumber(r.rms, 6);
}

function fftRenderPeaks() {
  const target = fft$('fftPeakList');
  if (!fftResult || !fftResult.peaks.length) {
    target.innerHTML = '<div class="export-note">未检测到明显的非直流频率峰。</div>';
    return;
  }

  const peaks = fftResult.peaks.slice(0, 10);
  const maxAmp = Math.max(...peaks.map(p => p.amp), 1e-12);
  target.innerHTML = peaks.map((peak, i) => {
    const pct = Math.max(1, peak.amp / maxAmp * 100);
    return '<div class="fft-peak-row">' +
      '<span class="fft-peak-rank">#' + (i + 1) + '</span>' +
      '<span class="fft-peak-freq">' + fftFormatNumber(peak.freq, 4) + ' Hz</span>' +
      '<span class="fft-peak-bar"><i style="width:' + pct.toFixed(1) + '%"></i></span>' +
      '<span class="fft-peak-amp">A=' + fftFormatNumber(peak.amp, 5) + '</span>' +
      '</div>';
  }).join('');
}

function fftParseText(text, fallbackFs) {
  const rows = [];
  const lines = text.split(/\r?\n/);

  for (const original of lines) {
    const line = original.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;

    const tokens = line.split(/[;,\t ]+/).filter(Boolean);
    const nums = tokens.map(token => Number(token)).filter(Number.isFinite);
    if (nums.length) rows.push(nums);
  }

  if (rows.length < FFT_MIN_SAMPLES) {
    throw new Error('没有解析到足够的数值数据。至少需要 8 行采样。');
  }

  const twoColumnRows = rows.filter(row => row.length >= 2);
  const useTimeColumn = twoColumnRows.length >= Math.max(FFT_MIN_SAMPLES, rows.length * 0.7);

  if (!useTimeColumn) {
    const values = rows.map(row => row[0]).filter(Number.isFinite);
    return {
      values: new Float64Array(values),
      fs: fallbackFs,
      inferred: false,
      note: '单列幅值数据',
    };
  }

  const times = [];
  const values = [];
  for (const row of rows) {
    if (row.length < 2) continue;
    times.push(row[0]);
    values.push(row[1]);
  }

  const diffs = [];
  for (let i = 1; i < times.length; i++) {
    const d = times[i] - times[i - 1];
    if (Number.isFinite(d) && d > 0) diffs.push(d);
  }

  if (diffs.length < FFT_MIN_SAMPLES - 1) {
    return {
      values: new Float64Array(values),
      fs: fallbackFs,
      inferred: false,
      note: '检测到两列数据，但时间列不是严格递增；使用手动采样率',
    };
  }

  const dt = fftMedian(diffs);
  const fs = 1 / dt;
  const jitter = Math.max(...diffs.map(d => Math.abs(d - dt))) / Math.max(dt, 1e-30);

  if (jitter <= 0.01) {
    return {
      values: new Float64Array(values),
      fs,
      inferred: true,
      note: '由时间列自动识别采样率',
    };
  }

  const resampled = fftResampleUniform(times, values, dt);
  return {
    values: resampled,
    fs,
    inferred: true,
    note: '时间步存在抖动，已按中位 Δt 线性重采样',
  };
}

function fftResampleUniform(times, values, dt) {
  const start = times[0];
  const end = times[times.length - 1];
  const count = Math.min(FFT_MAX_SAMPLES, Math.max(2, Math.floor((end - start) / dt) + 1));
  const out = new Float64Array(count);
  let j = 0;

  for (let i = 0; i < count; i++) {
    const t = start + i * dt;
    while (j < times.length - 2 && times[j + 1] < t) j++;
    const t0 = times[j];
    const t1 = times[j + 1];
    const y0 = values[j];
    const y1 = values[j + 1];
    const ratio = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
    out[i] = y0 + (y1 - y0) * ratio;
  }
  return out;
}

async function fftLoadTextFile(file) {
  try {
    const text = await file.text();
    fftPasteData.value = text.slice(0, 20000);
    const parsed = fftParseText(text, Number(fftSampleRateInput.value));
    fftSignal = parsed.values;
    fftSampleRateInput.value = String(parsed.fs);
    fftSourceLabel = file.name + '（' + parsed.note + '）';
    fftAnalyzeSignal();
  } catch (error) {
    fftStatus('文本波形导入失败：' + (error instanceof Error ? error.message : String(error)), true);
  }
}

async function fftLoadWavFile(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('当前浏览器不支持 Web Audio 解码。');

    const audioCtx = new AudioContextClass();
    const audio = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
    const channelCount = audio.numberOfChannels;
    const count = Math.min(audio.length, FFT_MAX_SAMPLES);
    const values = new Float64Array(count);

    for (let ch = 0; ch < channelCount; ch++) {
      const channel = audio.getChannelData(ch);
      for (let i = 0; i < count; i++) values[i] += channel[i] / channelCount;
    }

    await audioCtx.close();

    fftSignal = values;
    fftSampleRateInput.value = String(audio.sampleRate);
    fftSourceLabel = file.name + '（WAV，' + channelCount + ' 声道平均）';
    fftAnalyzeSignal();
  } catch (error) {
    fftStatus('WAV 导入失败：' + (error instanceof Error ? error.message : String(error)), true);
  }
}

function fftLoadDemo() {
  const fs = 1000;
  const count = 4096;
  const values = new Float64Array(count);

  for (let i = 0; i < count; i++) {
    const t = i / fs;
    values[i] =
      0.25 +
      2.0 * Math.sin(2 * Math.PI * 50 * t) +
      0.8 * Math.sin(2 * Math.PI * 120 * t + 0.45) +
      0.3 * Math.sin(2 * Math.PI * 250 * t - 0.8);
  }

  fftSignal = values;
  fftSampleRateInput.value = String(fs);
  fftSourceLabel = '示例信号：2sin(2π·50t) + 0.8sin(2π·120t+0.45) + 0.3sin(2π·250t−0.8) + DC';
  fftAnalyzeSignal();
}

function fftDownloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fftExportCanvas(canvas, filename) {
  canvas.toBlob(blob => {
    if (blob) fftDownloadBlob(blob, filename);
  }, 'image/png');
}

function fftExportSpectrumCsv() {
  if (!fftResult) return;

  const lines = ['frequency_hz,amplitude,phase_rad,psd'];
  for (let i = 0; i < fftResult.freqs.length; i++) {
    lines.push([
      fftResult.freqs[i],
      fftResult.amps[i],
      fftResult.phases[i],
      fftResult.psd[i],
    ].join(','));
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  fftDownloadBlob(blob, 'fourier-studio-spectrum.csv');
}

function fftRebuildOnly() {
  if (!fftResult) return;
  const count = Math.min(Number(fftReconCountInput.value), fftResult.peaks.length);
  fftResult.reconstruction = fftReconstruct(
    fftResult.processed,
    fftResult.peaks.slice(0, count),
    fftResult.fs,
    fftResult.removeDc ? 0 : fftResult.mean,
  );
  fftResult.rms = fftRmsError(fftResult.processed, fftResult.reconstruction);
  fft$('fftReconCountValue').textContent = String(count || Number(fftReconCountInput.value));
  fftRenderAll();
}

fft$('fftTextFile').addEventListener('change', () => {
  const file = fft$('fftTextFile').files?.[0];
  if (file) void fftLoadTextFile(file);
});

fft$('fftWavFile').addEventListener('change', () => {
  const file = fft$('fftWavFile').files?.[0];
  if (file) void fftLoadWavFile(file);
});

fft$('fftPasteBtn').addEventListener('click', () => {
  try {
    const parsed = fftParseText(fftPasteData.value, Number(fftSampleRateInput.value));
    fftSignal = parsed.values;
    fftSampleRateInput.value = String(parsed.fs);
    fftSourceLabel = '粘贴数据（' + parsed.note + '）';
    fftAnalyzeSignal();
  } catch (error) {
    fftStatus('粘贴数据解析失败：' + (error instanceof Error ? error.message : String(error)), true);
  }
});

fft$('fftDemoBtn').addEventListener('click', () => fftLoadDemo());
fft$('fftAnalyzeBtn').addEventListener('click', () => fftAnalyzeSignal());
fftWindowSelect.addEventListener('change', () => fftAnalyzeSignal());
fftRemoveDcInput.addEventListener('change', () => fftAnalyzeSignal());
fftSampleRateInput.addEventListener('change', () => fftAnalyzeSignal());
fftMaxFreqInput.addEventListener('change', () => fftRenderAll());

fftReconCountInput.addEventListener('input', () => {
  fft$('fftReconCountValue').textContent = fftReconCountInput.value;
  fftRebuildOnly();
});

fft$('fftExportCsvBtn').addEventListener('click', () => fftExportSpectrumCsv());
fft$('fftTimePngBtn').addEventListener('click', () => fftExportCanvas(fftTimeCanvas, 'fourier-studio-fft-time.png'));
fft$('fftAmpPngBtn').addEventListener('click', () => fftExportCanvas(fftAmpCanvas, 'fourier-studio-fft-spectrum.png'));
fft$('fftReconPngBtn').addEventListener('click', () => fftExportCanvas(fftReconCanvas, 'fourier-studio-fft-reconstruction.png'));

fftLoadDemo();
