/* Speech recognition in a web worker: Whisper (OpenAI) via transformers.js / ONNX Runtime
   (WebAssembly). Model files are served by this site – nothing is sent anywhere. */
import { pipeline, env } from './vendor/transformers.min.js';

const base = new URL('./vendor/', self.location.href).href;
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = new URL('./vendor/models/', self.location.href).pathname;   // a path, not a URL: transformers.js only probes local files for paths
env.useBrowserCache = false;          // the service worker already caches the model files
env.backends.onnx.wasm.wasmPaths = base + 'ort/';
env.backends.onnx.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)) : 1;

// Large model files are served in parts (see build.py → vendor/split.json): stitch them back
// together as one streamed response
let split = null;
const plainFetch = env.fetch || fetch;
env.fetch = async (url, init) => {
  split ||= plainFetch(base + 'split.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  const href = new URL(url, self.location.href).href;
  const info = href.startsWith(base) && (await split)[decodeURIComponent(href.slice(base.length))];
  if (!info) return plainFetch(url, init);
  const parts = Array.from({ length: info.parts }, (_, i) => `${href}.part${i}`);
  // pull-based: nothing is downloaded until the body is actually read (metadata checks only need headers)
  let i = 0, reader = null;
  const body = new ReadableStream({
    async pull(ctrl) {
      for (;;) {
        if (!reader) {
          if (i >= parts.length) { ctrl.close(); return; }
          const r = await plainFetch(parts[i++]);
          if (!r.ok) throw new Error(`${parts[i - 1]}: ${r.status}`);
          reader = r.body.getReader();
        }
        const { done, value } = await reader.read();
        if (!done) { ctrl.enqueue(value); return; }
        reader = null;
      }
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Length': String(info.size), 'Content-Type': 'application/octet-stream' } });
};

const MODELS = { base: 'Xenova/whisper-base', tiny: 'Xenova/whisper-tiny' };
let asr = null, loaded = null;

async function load(model) {
  if (asr && loaded === model) return asr;
  if (asr) { await asr.dispose(); asr = null; }
  const files = {};
  asr = await pipeline('automatic-speech-recognition', MODELS[model], {
    dtype: 'q8',
    device: 'wasm',
    progress_callback: (p) => {
      if (p.status === 'progress' && p.total) {
        files[p.file] = [p.loaded, p.total];
        const v = Object.values(files);
        self.postMessage({ type: 'load', progress: v.reduce((a, x) => a + x[0], 0) / v.reduce((a, x) => a + x[1], 0) });
      }
    },
  });
  loaded = model;
  return asr;
}

// Split long audio into windows of at most 28 s, cutting in the quietest spot near the end
const SR = 16000;
function windows(audio) {
  const out = [];
  let start = 0;
  while (start < audio.length) {
    let end = Math.min(audio.length, start + 28 * SR);
    if (end < audio.length) {
      const from = start + 20 * SR, frame = SR / 10;
      let best = end, bestE = Infinity;
      for (let i = from; i + frame <= end; i += frame / 2) {
        let e = 0;
        for (let k = i; k < i + frame; k++) e += audio[k] * audio[k];
        if (e < bestE) { bestE = e; best = i + frame / 2; }
      }
      end = Math.round(best);
    }
    out.push([start, end]);
    start = end;
  }
  return out;
}

function silent(seg) {
  let e = 0;
  for (let i = 0; i < seg.length; i += 4) e += seg[i] * seg[i];
  return e / (seg.length / 4) < 1e-6;
}

self.onmessage = async (e) => {
  const { audio, model, language } = e.data;
  try {
    const run = await load(model);
    self.postMessage({ type: 'ready' });
    const wins = windows(audio);
    let lastText = '';
    for (let i = 0; i < wins.length; i++) {
      const [s, t] = wins[i];
      const seg = audio.subarray(s, t);
      let segments = [];
      if (!silent(seg)) {
        const res = await run(seg, { language: language || null, task: 'transcribe', return_timestamps: true });
        const off = s / SR, len = (t - s) / SR;
        segments = (res.chunks || [{ timestamp: [0, len], text: res.text }])
          .map((c) => ({
            start: off + (c.timestamp[0] ?? 0),
            end: off + Math.min(len, c.timestamp[1] ?? len),
            text: (c.text || '').trim(),
          }))
          .filter((c) => c.text && !/^\[.*\]$|^\(.*\)$/.test(c.text));   // drop “[Music]”, “(silence)” …
        // Whisper sometimes “hallucinates” the same sentence over and over: keep it once
        segments = segments.filter((c) => {
          const k = c.text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
          if (k && k === lastText) return false;
          lastText = k;
          return true;
        });
        segments.forEach((c) => { if (c.end < c.start) c.end = Math.min(off + len, c.start + 2); });
      }
      self.postMessage({ type: 'chunk', done: i + 1, total: wins.length, segments });
    }
    self.postMessage({ type: 'done' });
  } catch (err) {
    self.postMessage({ type: 'error', error: String((err && err.message) || err) });
  }
};
