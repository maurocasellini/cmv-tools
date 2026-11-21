/* Voice to Text: audio/video file or microphone → 16 kHz mono → Whisper (in a worker) → transcript.
   Nothing leaves the device. */
const { $, toast, download, fmtSize } = window.CMV;
const t = (s) => window.i18n(s);
const SR = 16000;

let source = null;      // { name, blob, duration }
let audio = null;       // Float32Array, 16 kHz mono
let segments = [];
let worker = null;
let running = false;

// ---------------------------------------------------------------- Views
function show(id) {
  for (const v of ['start', 'recording', 'work', 'about']) $('#' + v).classList.toggle('hidden', v !== id);
  window.scrollTo(0, 0);
}
function route() {
  if (location.hash === '#about') show('about');
  else show(source ? 'work' : 'start');
}
window.addEventListener('hashchange', route);

const fmtTime = (s, ms = false) => {
  s = Math.max(0, s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  const p = (n, l = 2) => String(n).padStart(l, '0');
  if (ms) return `${p(h)}:${p(m)}:${p(sec)}`;
  return h ? `${h}:${p(m)}:${p(sec)}` : `${m}:${p(sec)}`;
};

// ---------------------------------------------------------------- Decoding
async function decodeWithBrowser(buf) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(buf);
    const len = Math.ceil(decoded.duration * SR);
    const off = new OfflineAudioContext(1, Math.max(1, len), SR);
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination);
    src.start();
    const out = await off.startRendering();
    return out.getChannelData(0);
  } finally { ctx.close(); }
}

// Fallback for formats the browser can't read itself (e.g. WhatsApp .opus on iPhone): FFmpeg
let ffmpeg = null;
async function decodeWithFFmpeg(blob, name) {
  if (!ffmpeg) {
    const { FFmpeg } = await import('./vendor/ffmpeg/index.js');
    ffmpeg = new FFmpeg();
    const base = new URL('./vendor/ffmpeg/core/', location.href).href;
    await ffmpeg.load({ coreURL: base + 'ffmpeg-core.js', wasmURL: base + 'ffmpeg-core.wasm' });
  }
  const ext = (name.match(/\.[a-z0-9]+$/i) || ['.bin'])[0];
  await ffmpeg.writeFile('in' + ext, new Uint8Array(await blob.arrayBuffer()));
  await ffmpeg.exec(['-i', 'in' + ext, '-vn', '-ac', '1', '-ar', String(SR), '-f', 'f32le', 'out.raw']);
  const data = await ffmpeg.readFile('out.raw');
  await ffmpeg.deleteFile('in' + ext).catch(() => {});
  await ffmpeg.deleteFile('out.raw').catch(() => {});
  return new Float32Array(data.buffer, data.byteOffset, Math.floor(data.byteLength / 4));
}

async function decode(blob, name) {
  try {
    return await decodeWithBrowser(await blob.arrayBuffer());
  } catch {
    setProgress(t('Format wird umgewandelt …'), null);
    return await decodeWithFFmpeg(blob, name);
  }
}

// ---------------------------------------------------------------- Loading a file
async function useFile(blob, name) {
  source = { name, blob, duration: 0 };
  segments = [];
  audio = null;
  $('#f-name').textContent = name;
  $('#f-meta').textContent = fmtSize(blob.size);
  const player = $('#player');
  if (player.src) URL.revokeObjectURL(player.src);
  player.src = URL.createObjectURL(blob);
  $('#settings').classList.remove('hidden');
  $('#progress').classList.add('hidden');
  $('#result').classList.add('hidden');
  $('#transcript').textContent = '';
  if (location.hash) history.replaceState(null, '', location.pathname);
  show('work');
}

$('#file').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) useFile(f, f.name); e.target.value = ''; });
const drop = $('#drop');
drop.addEventListener('click', () => $('#file').click());
['dragenter', 'dragover'].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); if (ev === 'drop' || !e.relatedTarget) drop.classList.remove('over'); }));
document.addEventListener('drop', (e) => { const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) useFile(f, f.name); });

// ---------------------------------------------------------------- Recording
let rec = null;
$('#rec').addEventListener('click', async () => {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch {
    toast(t('Kein Zugriff aufs Mikrofon. Bitte in den Browser-Einstellungen erlauben.'), true);
    return;
  }
  const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg'].find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
  const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const chunks = [];
  mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const an = ctx.createAnalyser();
  an.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(an);
  const started = Date.now();
  const cv = $('#rec-level'), g = cv.getContext('2d'), buf = new Float32Array(an.fftSize), hist = [];
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  let raf;
  const draw = () => {
    an.getFloatTimeDomainData(buf);
    let peak = 0;
    for (const v of buf) peak = Math.max(peak, Math.abs(v));
    hist.push(Math.min(1, peak * 2.2));
    if (hist.length > 120) hist.shift();
    g.clearRect(0, 0, cv.width, cv.height);
    g.fillStyle = accent;
    const w = cv.width / 120;
    hist.forEach((v, i) => { const h = Math.max(2, v * cv.height); g.fillRect(i * w + 1, (cv.height - h) / 2, w - 2, h); });
    $('#rec-time').textContent = fmtTime((Date.now() - started) / 1000);
    raf = requestAnimationFrame(draw);
  };
  rec = {
    stop: (keep) => new Promise((res) => {
      mr.onstop = () => {
        cancelAnimationFrame(raf);
        stream.getTracks().forEach((tr) => tr.stop());
        ctx.close();
        rec = null;
        if (keep && chunks.length) {
          const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
          const d = new Date(), p = (n) => String(n).padStart(2, '0');
          const ext = /mp4/.test(blob.type) ? 'm4a' : /ogg/.test(blob.type) ? 'ogg' : 'webm';
          res({ blob, name: `${t('Aufnahme')} ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${ext}` });
        } else res(null);
      };
      mr.stop();
    }),
  };
  mr.start(1000);
  draw();
  show('recording');
});
$('#rec-stop').addEventListener('click', async () => {
  if (!rec) return;
  const r = await rec.stop(true);
  if (r) { await useFile(r.blob, r.name); $('#go').click(); } else show('start');
});
$('#rec-cancel').addEventListener('click', async () => { if (rec) await rec.stop(false); show('start'); });

// ---------------------------------------------------------------- Transcription
function setProgress(label, frac) {
  $('#progress').classList.remove('hidden');
  $('#p-label').textContent = label;
  $('#p-bar').style.width = frac == null ? '100%' : Math.round(frac * 100) + '%';
  $('#p-bar').parentElement.classList.toggle('indeterminate', frac == null);
}

function getWorker() {
  if (!worker) worker = new Worker('asr-worker.js', { type: 'module' });
  return worker;
}

$('#go').addEventListener('click', async () => {
  if (running || !source) return;
  running = true;
  $('#settings').classList.add('hidden');
  segments = [];
  renderTranscript(true);
  $('#result').classList.remove('hidden');
  try {
    if (!audio) {
      setProgress(t('Audio wird gelesen …'), null);
      audio = await decode(source.blob, source.name);
      source.duration = audio.length / SR;
      $('#f-meta').textContent = `${fmtTime(source.duration)} · ${fmtSize(source.blob.size)}`;
    }
    if (audio.length < SR / 2) throw new Error(t('Die Aufnahme ist zu kurz oder leer.'));
    setProgress(t('Modell wird geladen …'), 0);
    const startedAt = performance.now();
    await new Promise((resolve, reject) => {
      const w = getWorker();
      w.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'load') setProgress(t('Modell wird geladen …'), m.progress);
        else if (m.type === 'ready') setProgress(t('Wird transkribiert …'), 0);
        else if (m.type === 'chunk') {
          segments.push(...m.segments);
          renderTranscript(m.done < m.total);
          const el = (performance.now() - startedAt) / 1000;
          const eta = m.done < m.total ? ` · ${t('noch ca.')} ${fmtTime((el / m.done) * (m.total - m.done))}` : '';
          setProgress(`${t('Wird transkribiert …')} ${Math.round((m.done / m.total) * 100)} %${eta}`, m.done / m.total);
        } else if (m.type === 'done') resolve();
        else if (m.type === 'error') reject(new Error(m.error));
      };
      w.onerror = (e) => reject(new Error(e.message || t('Die Spracherkennung konnte nicht gestartet werden.')));
      // copy, so the audio stays available for another run
      const copy = audio.slice();
      w.postMessage({ audio: copy, model: $('#model').value, language: $('#language').value }, [copy.buffer]);
    });
    $('#progress').classList.add('hidden');
    renderTranscript(false);
    if (!segments.length) toast(t('Kein gesprochener Text erkannt.'), true);
  } catch (e) {
    console.error(e);
    toast(t('Transkription fehlgeschlagen: ') + e.message, true);
    $('#progress').classList.add('hidden');
    $('#settings').classList.remove('hidden');
    if (worker) { worker.terminate(); worker = null; }
  } finally {
    running = false;
  }
});

function renderTranscript(pending) {
  const box = $('#transcript');
  box.textContent = '';
  box.classList.toggle('plain', !$('#ts').checked);
  for (const s of segments) {
    const el = document.createElement('div');
    el.className = 'seg';
    el.dataset.start = s.start;
    el.dataset.end = s.end;
    const tm = document.createElement('time');
    tm.textContent = fmtTime(s.start);
    const tx = document.createElement('span');
    tx.textContent = s.text;
    el.append(tm, tx);
    box.append(el);
  }
  if (pending) {
    const p = document.createElement('div');
    p.className = 'pending';
    p.textContent = t('… wird geschrieben');
    p.removeAttribute('data-no-i18n');
    box.append(p);
  }
}
$('#ts').addEventListener('change', () => $('#transcript').classList.toggle('plain', !$('#ts').checked));
$('#transcript').addEventListener('click', (e) => {
  const seg = e.target.closest('.seg');
  if (!seg) return;
  const p = $('#player');
  p.currentTime = +seg.dataset.start;
  p.play().catch(() => {});
});
$('#player').addEventListener('timeupdate', () => {
  const now = $('#player').currentTime;
  document.querySelectorAll('.seg').forEach((s) => s.classList.toggle('now', now >= +s.dataset.start && now < +s.dataset.end));
});

// ---------------------------------------------------------------- Export
const baseName = () => (source ? source.name.replace(/\.[^.]+$/, '') : 'transcript');
const plain = () => segments.map((s) => s.text).join(' ').replace(/\s+/g, ' ').trim();
function asText() {
  if (!$('#ts').checked) return plain() + '\n';
  return segments.map((s) => `[${fmtTime(s.start)}] ${s.text}`).join('\n') + '\n';
}
const stamp = (s, sep) => fmtTime(s, true) + sep + String(Math.round((s % 1) * 1000)).padStart(3, '0');
function asSubs(vtt) {
  const body = segments.map((s, i) => `${vtt ? '' : i + 1 + '\n'}${stamp(s.start, vtt ? '.' : ',')} --> ${stamp(Math.max(s.end, s.start + 0.5), vtt ? '.' : ',')}\n${s.text}\n`).join('\n');
  return (vtt ? 'WEBVTT\n\n' : '') + body;
}
const save = (text, ext, type) => {
  if (!segments.length) return toast(t('Noch kein Text vorhanden.'));
  download(new Blob([text], { type: type + ';charset=utf-8' }), `${baseName()}.${ext}`);
};
$('#dl-txt').addEventListener('click', () => save(asText(), 'txt', 'text/plain'));
$('#dl-srt').addEventListener('click', () => save(asSubs(false), 'srt', 'application/x-subrip'));
$('#dl-vtt').addEventListener('click', () => save(asSubs(true), 'vtt', 'text/vtt'));
$('#copy').addEventListener('click', async () => {
  if (!segments.length) return toast(t('Noch kein Text vorhanden.'));
  try { await navigator.clipboard.writeText(asText()); toast(t('Text kopiert.')); }
  catch { toast(t('Kopieren nicht möglich.'), true); }
});

$('#restart').addEventListener('click', () => {
  if (running) return toast(t('Bitte warten, bis die Transkription fertig ist.'));
  source = null; audio = null; segments = [];
  show('start');
});

$('#language').value = window.I18N && window.I18N.lang === 'en' ? 'english' : 'german';
route();
window.CMV.registerSW();
window.__voice = { get segments() { return segments; }, useFile, decodeWithFFmpeg, get running() { return running; } };
