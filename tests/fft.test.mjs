import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function loadFftHarness() {
  const elements = new Map();

  const context2d = {
    beginPath() {},
    clearRect() {},
    fillText() {},
    lineTo() {},
    measureText(text) {
      return { width: String(text).length * 7 };
    },
    moveTo() {},
    stroke() {},
  };

  function createElement(id) {
    const base = {
      id,
      addEventListener() {},
      checked: false,
      files: [],
      innerHTML: '',
      style: {},
      textContent: '',
      value: '',
    };

    if (id.endsWith('Canvas')) {
      return {
        ...base,
        height: 240,
        width: 640,
        getContext() {
          return context2d;
        },
        toBlob(callback) {
          callback(new Blob(['']));
        },
      };
    }

    return base;
  }

  function element(id) {
    if (!elements.has(id)) elements.set(id, createElement(id));
    return elements.get(id);
  }

  element('fftSampleRate').value = '1000';
  element('fftWindow').value = 'rect';
  element('fftRemoveDc').checked = true;
  element('fftReconCount').value = '10';
  element('fftMaxFreq').value = '500';

  const context = vm.createContext({
    Blob,
    Float64Array,
    Math,
    Number,
    URL: {
      createObjectURL() {
        return 'blob:test';
      },
      revokeObjectURL() {},
    },
    document: {
      body: {
        appendChild() {},
      },
      createElement() {
        return {
          click() {},
          remove() {},
        };
      },
      getElementById: element,
    },
    setTimeout() {},
    window: {},
  });

  const source = await readFile(new URL('../src/fft.ts', import.meta.url), 'utf8');
  vm.runInContext(`${source}
globalThis.__fftTestApi = {
  analyze(options = {}) {
    if (options.fs !== undefined) fftSampleRateInput.value = String(options.fs);
    if (options.windowKind !== undefined) fftWindowSelect.value = options.windowKind;
    if (options.removeDc !== undefined) fftRemoveDcInput.checked = options.removeDc;
    if (options.reconCount !== undefined) fftReconCountInput.value = String(options.reconCount);
    if (options.maxFreq !== undefined) fftMaxFreqInput.value = String(options.maxFreq);
    fftAnalyzeSignal();
    return fftResult;
  },
  element: fft$,
  nextPow2: fftNextPow2,
  parseText: fftParseText,
  resampleUniform: fftResampleUniform,
  setSignal(values) {
    fftSignal = Float64Array.from(values);
  },
};`, context);

  return context.__fftTestApi;
}

function makeTone({ fs, count, components, dc = 0 }) {
  return Float64Array.from({ length: count }, (_, n) => {
    const t = n / fs;
    return components.reduce(
      (sum, { amp, freq, phase = 0 }) => sum + amp * Math.sin(2 * Math.PI * freq * t + phase),
      dc,
    );
  });
}

function nearestPeak(peaks, freq) {
  return peaks.reduce((best, peak) => {
    if (!best) return peak;
    return Math.abs(peak.freq - freq) < Math.abs(best.freq - freq) ? peak : best;
  }, null);
}

test('zero-pads non-power-of-two signals and identifies the dominant frequency', async () => {
  const fft = await loadFftHarness();
  const signal = makeTone({
    fs: 1024,
    count: 1000,
    components: [{ amp: 1.5, freq: 128 }],
  });

  fft.setSignal(signal);
  const result = fft.analyze({ fs: 1024, windowKind: 'rect', removeDc: true, reconCount: 1 });

  assert.equal(result.count, 1000);
  assert.equal(result.fftSize, 1024);
  assert.equal(result.freqs.length, 513);
  assert.equal(result.peaks[0].bin, 128);
  assert.ok(Math.abs(result.peaks[0].freq - 128) < 0.05);
  assert.ok(Math.abs(result.peaks[0].amp - 1.5) < 0.02);
});

test('parses jittered two-column data by inferring sample rate and resampling uniformly', async () => {
  const fft = await loadFftHarness();
  const rows = [];
  let t = 0;

  for (let i = 0; i < 20; i++) {
    const dt = i % 2 === 0 ? 0.001 : 0.00104;
    t += dt;
    rows.push(`${t},${Math.sin(2 * Math.PI * 50 * t)}`);
  }

  const parsed = fft.parseText(rows.join('\n'), 1000);

  assert.equal(parsed.inferred, true);
  assert.match(parsed.note, /重采样/);
  assert.ok(Math.abs(parsed.fs - 1 / 0.00104) < 1e-9);
  assert.ok(parsed.values.length >= 18);
});

test('keeps DC out of processed samples when requested and reports finite PSD values', async () => {
  const fft = await loadFftHarness();
  const signal = makeTone({
    fs: 1000,
    count: 1024,
    dc: 3,
    components: [{ amp: 2, freq: 125 }],
  });

  fft.setSignal(signal);
  const result = fft.analyze({ fs: 1000, windowKind: 'hann', removeDc: true, reconCount: 1 });

  const processedMean = result.processed.reduce((sum, value) => sum + value, 0) / result.processed.length;
  const peak = nearestPeak(result.peaks, 125);

  assert.ok(Math.abs(processedMean) < 1e-12);
  assert.ok(Math.abs(peak.freq - 125) < 0.8);
  assert.ok(result.psd.every(Number.isFinite));
  assert.ok(result.psd.some(value => value > 0));
});

test('sorts the strongest peaks first and reconstructs a two-tone signal accurately', async () => {
  const fft = await loadFftHarness();
  const signal = makeTone({
    fs: 1024,
    count: 1024,
    components: [
      { amp: 2, freq: 64 },
      { amp: 0.5, freq: 192, phase: 0.4 },
    ],
  });

  fft.setSignal(signal);
  const result = fft.analyze({ fs: 1024, windowKind: 'rect', removeDc: true, reconCount: 2 });

  assert.ok(result.peaks.length <= 64);
  assert.ok(result.peaks[0].amp >= result.peaks[1].amp);
  assert.ok(Math.abs(result.peaks[0].freq - 64) < 0.05);
  assert.ok(Math.abs(result.peaks[1].freq - 192) < 0.05);
  assert.ok(result.rms < 1e-10);
});

test('rejects text imports with fewer than eight samples', async () => {
  const fft = await loadFftHarness();

  assert.throws(
    () => fft.parseText('1\n2\n3\n4\n5\n6\n7', 1000),
    /至少需要 8 行采样/,
  );
});
