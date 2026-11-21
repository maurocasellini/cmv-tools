/* Image engine (module worker): HEIC decoding (libheif), encoding with the Squoosh codecs
   (MozJPEG, WebP, AVIF, OxiPNG), background removal (IS-Net) and face detection (YuNet), both via ONNX Runtime.
   Everything runs locally; the files come from this site. */
const V = './vendor/';
const mods = {};
const lazy = (name, path) => (mods[name] ||= import(V + path));

// ---------- HEIC / HEIF (iPhone photos) → RGBA
async function decodeHeic(buf) {
  const factory = (await lazy('heif', 'libheif/libheif-bundle.mjs')).default;
  const lib = await (mods.heifLib ||= Promise.resolve(factory()));
  const decoder = new lib.HeifDecoder();
  const images = decoder.decode(new Uint8Array(buf));
  if (!images || !images.length) throw new Error('HEIC-Datei konnte nicht gelesen werden.');
  const img = images[0];
  const width = img.get_width(), height = img.get_height();
  const data = await new Promise((res, rej) => {
    img.display({ data: new Uint8ClampedArray(width * height * 4), width, height }, (d) => (d ? res(d) : rej(new Error('HEIC-Datei konnte nicht gelesen werden.'))));
  });
  images.forEach((i) => i.free && i.free());
  return { data: data.data, width, height };
}

// ---------- Encoding
async function encode({ data, width, height, format, quality }) {
  const img = new ImageData(new Uint8ClampedArray(data.buffer || data), width, height);
  if (format === 'jpeg') return (await lazy('jpeg', 'jsquash/jpeg/encode.js')).default(img, { quality, progressive: true, optimize_coding: true });
  if (format === 'webp') return (await lazy('webp', 'jsquash/webp/encode.js')).default(img, { quality, method: 4 });
  if (format === 'avif') return (await lazy('avif', 'jsquash/avif/encode.js')).default(img, { quality, speed: 7 });
  if (format === 'png') {
    // single-threaded OxiPNG: its multi-threaded build (wasm-bindgen-rayon) can deadlock in nested workers
    const m = await (mods.pngReady ||= lazy('png', 'jsquash/oxipng/codec/pkg/squoosh_oxipng.js').then(async (x) => { await x.default(); return x; }));
    return m.optimise_raw(img.data, width, height, 2, false, true).buffer;
  }
  throw new Error('Unbekanntes Format');
}

async function getOrt() {
  const ort = await lazy('ort', 'ort/ort.wasm.min.mjs');
  ort.env.wasm.wasmPaths = new URL(V + 'ort/', self.location.href).href;
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)) : 1;
  return ort;
}

// ---------- Face detection (YuNet, 640×640 BGR input). The page sends tiles of the photo already scaled to
// 640 px (whole photo + overlapping parts, so that small faces in group photos are found too).
let faceSession = null;
async function detectFaces({ tiles }) {
  if (!faceSession) {
    const ort = await getOrt();
    const buf = await (await fetch(V + 'models/yunet.onnx')).arrayBuffer();
    faceSession = await ort.InferenceSession.create(new Uint8Array(buf), { executionProviders: ['wasm'] });
    faceSession.ort = ort;
  }
  const S = 640, N = S * S, found = [];
  for (const { data, w, h, x, y, scale } of tiles) {
    const input = new Float32Array(3 * N);          // zero padding right / bottom
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
      const i = r * S + c, j = (r * w + c) * 4;
      input[i] = data[j + 2]; input[i + N] = data[j + 1]; input[i + 2 * N] = data[j];
    }
    const out = await faceSession.run({ input: new faceSession.ort.Tensor('float32', input, [1, 3, S, S]) });
    for (const st of [8, 16, 32]) {
      const cols = S / st, cls = out['cls_' + st].data, obj = out['obj_' + st].data, bb = out['bbox_' + st].data;
      for (let i = 0; i < cls.length; i++) {
        const score = Math.sqrt(Math.min(1, Math.max(0, cls[i])) * Math.min(1, Math.max(0, obj[i])));
        if (score < 0.55) continue;
        const row = Math.floor(i / cols), col = i % cols;
        const cx = (col + bb[i * 4]) * st, cy = (row + bb[i * 4 + 1]) * st, bw = Math.exp(bb[i * 4 + 2]) * st, bh = Math.exp(bb[i * 4 + 3]) * st;
        found.push({ x: x + (cx - bw / 2) / scale, y: y + (cy - bh / 2) / scale, w: bw / scale, h: bh / scale, score });
      }
    }
  }
  // non-maximum suppression across all tiles
  found.sort((a, b) => b.score - a.score);
  const keep = [];
  for (const a of found) {
    if (keep.some((b) => {
      const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      const inter = ix * iy;
      return inter / (a.w * a.h + b.w * b.h - inter) > 0.3 || inter / Math.min(a.w * a.h, b.w * b.h) > 0.6;
    })) continue;
    keep.push(a);
  }
  return keep;
}

// ---------- Background removal (IS-Net, 1024×1024 input → alpha mask)
let session = null;
async function getSession(onProgress) {
  if (session) return session;
  const ort = await getOrt();
  const res = await fetch(V + 'models/isnet-small.onnx');
  const total = +res.headers.get('content-length') || 44342436;
  const reader = res.body.getReader();
  const buf = new Uint8Array(total);
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (got + value.length > buf.length) throw new Error('Modell unvollständig');
    buf.set(value, got);
    got += value.length;
    onProgress(got / total);
  }
  session = await ort.InferenceSession.create(buf.subarray(0, got), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  session.ort = ort;
  return session;
}

async function removeBg({ data, width, height }) {
  // the caller sends the photo already scaled to 1024×1024
  const s = await getSession((p) => self.postMessage({ type: 'progress', p }));
  const N = 1024 * 1024;
  const input = new Float32Array(3 * N);
  for (let i = 0, j = 0; i < N; i++, j += 4) {
    input[i] = (data[j] - 128) / 256;
    input[i + N] = (data[j + 1] - 128) / 256;
    input[i + 2 * N] = (data[j + 2] - 128) / 256;
  }
  const out = await s.run({ input: new s.ort.Tensor('float32', input, [1, 3, 1024, 1024]) });
  const m = out.output.data;
  const mask = new Uint8ClampedArray(N);
  // sharpen the matte: drop faint background noise, keep the subject fully opaque, soft edges in between
  const lo = 0.22, hi = 0.82;
  const local = boxBlur(m, 1024, 1024, 12);     // small isolated specks have a low neighbourhood average
  for (let i = 0; i < N; i++) mask[i] = local[i] < 0.3 ? 0 : Math.max(0, Math.min(1, (m[i] - lo) / (hi - lo))) * 255;
  return { mask, width: 1024, height: 1024 };
}

// separable box blur (radius r) of a w×h float image
function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / n;
      acc += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / n;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

self.onmessage = async (e) => {
  const { id, cmd, args } = e.data;
  try {
    let res, transfer = [];
    if (cmd === 'heic') { res = await decodeHeic(args.buf); transfer = [res.data.buffer]; }
    else if (cmd === 'encode') { res = await encode(args); transfer = [res]; }
    else if (cmd === 'faces') res = await detectFaces(args);
    else if (cmd === 'removeBg') { res = await removeBg(args); transfer = [res.mask.buffer]; }
    else if (cmd === 'warm') { await getSession((p) => self.postMessage({ type: 'progress', p })); res = true; }
    self.postMessage({ id, ok: true, res }, transfer);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};
