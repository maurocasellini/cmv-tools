/* Translator: Mozilla Bergamot (WebAssembly) with Firefox Translations models served by this site.
   Live translation while typing, plus .txt / .srt / .vtt files. Text never leaves the device. */
import { LatencyOptimisedTranslator, BatchTranslator } from './vendor/bergamot/translator.js';

const { $, toast, download } = window.CMV;
const t = (s) => window.i18n(s);

const LANGS = [['de', 'Deutsch'], ['en', 'Englisch'], ['fr', 'Französisch'], ['it', 'Italienisch'], ['es', 'Spanisch']];
const options = { registryUrl: new URL('vendor/models/registry.json', location.href).href, pivotLanguage: 'en', downloadTimeout: 0, cacheSize: 2000 };
let live = null, batch = null;
const loaded = new Set();

// ---------------------------------------------------------------- Languages
const KEY = 'translate-langs';
function fill() {
  for (const id of ['from', 'to']) {
    const sel = $('#' + id), v = sel.value;
    sel.textContent = '';
    for (const [code, name] of LANGS) sel.append(new Option(t(name), code));
    if (v) sel.value = v;
  }
}
fill();
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved) { $('#from').value = saved[0]; $('#to').value = saved[1]; } else throw 0;
} catch {
  const ui = window.I18N && window.I18N.lang === 'en' ? 'en' : 'de';
  $('#from').value = ui;
  $('#to').value = ui === 'de' ? 'en' : 'de';
}
document.addEventListener('langchange', fill);

function pair() { return [$('#from').value, $('#to').value]; }
function saveLangs() { try { localStorage.setItem(KEY, JSON.stringify(pair())); } catch { /* private mode */ } }

$('#swap').addEventListener('click', () => {
  const [a, b] = pair();
  $('#from').value = b; $('#to').value = a;
  const out = $('#dst').textContent;
  if (out) $('#src').value = out;
  changed();
});
for (const id of ['#from', '#to']) $(id).addEventListener('change', () => {
  if ($('#from').value === $('#to').value) {
    const other = LANGS.map((l) => l[0]).find((c) => c !== $('#from').value);
    (id === '#from' ? $('#to') : $('#from')).value = other;
  }
  changed();
});

// ---------------------------------------------------------------- Live translation
function status(s) { $('#status').textContent = s; }
function needsDownload(from, to) {
  const models = from === 'en' || to === 'en' ? [from + to] : [from + 'en', 'en' + to];
  return models.some((m) => !loaded.has(m));
}
function markLoaded(from, to) {
  if (from === 'en' || to === 'en') loaded.add(from + to); else { loaded.add(from + 'en'); loaded.add('en' + to); }
}

let timer = null, seq = 0;
function changed() {
  saveLangs();
  $('#count').textContent = `${$('#src').value.length} ${t('Zeichen')}`;
  clearTimeout(timer);
  timer = setTimeout(translateNow, 450);
}
$('#src').addEventListener('input', changed);

async function translateNow() {
  const text = $('#src').value;
  const [from, to] = pair();
  if (!text.trim()) { $('#dst').textContent = ''; status(''); return; }
  const my = ++seq;
  live ||= new LatencyOptimisedTranslator(options);
  $('#dst').classList.add('busy');
  status(needsDownload(from, to) ? t('Sprachmodell wird geladen (einmalig ca. 23 MB) …') : t('Wird übersetzt …'));
  try {
    const started = performance.now();
    const res = await live.translate({ from, to, text, html: false });
    if (my !== seq) return;
    markLoaded(from, to);
    $('#dst').textContent = res.target.text;
    status(`${t('Übersetzt in')} ${((performance.now() - started) / 1000).toFixed(1)} s`);
  } catch (e) {
    if (e && e.name === 'CancelledError') return;
    console.error(e);
    if (my === seq) status(t('Übersetzung fehlgeschlagen: ') + (e.message || e));
  } finally {
    if (my === seq) $('#dst').classList.remove('busy');
  }
}

$('#clear').addEventListener('click', () => { $('#src').value = ''; changed(); $('#src').focus(); });
$('#copy').addEventListener('click', async () => {
  const s = $('#dst').textContent;
  if (!s) return;
  try { await navigator.clipboard.writeText(s); toast(t('Übersetzung kopiert.')); } catch { toast(t('Kopieren nicht möglich.'), true); }
});

// ---------------------------------------------------------------- Files (.txt, .srt, .vtt)
const CUE_TIME = /^\s*(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{3}\s+-->\s+/;
function parseCues(text) {
  // blocks separated by blank lines; the text lines follow the timing line
  return text.replace(/\r/g, '').split(/\n{2,}/).map((block) => {
    const lines = block.split('\n');
    const ti = lines.findIndex((l) => CUE_TIME.test(l));
    return ti < 0 ? { head: lines, body: [] } : { head: lines.slice(0, ti + 1), body: lines.slice(ti + 1) };
  });
}

$('#file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const [from, to] = pair();
  const text = await f.text();
  const subs = /\.(srt|vtt)$/i.test(f.name) || CUE_TIME.test(text.split('\n').slice(0, 6).join('\n'));
  batch ||= new BatchTranslator({ ...options, batchSize: 16, workers: 1 });
  window.CMV.busy(needsDownload(from, to) ? t('Sprachmodell wird geladen (einmalig ca. 23 MB) …') : t('Wird übersetzt …'), 0);
  try {
    let out;
    if (subs) {
      const cues = parseCues(text);
      let done = 0;
      const total = cues.filter((c) => c.body.length).length || 1;
      await Promise.all(cues.map(async (c) => {
        if (!c.body.length) return;
        const r = await batch.translate({ from, to, text: c.body.join('\n'), html: false });
        c.body = r.target.text.split('\n');
        window.CMV.busy(`${t('Wird übersetzt …')} ${++done} / ${total}`, done / total);
      }));
      out = cues.map((c) => [...c.head, ...c.body].join('\n')).join('\n\n') + '\n';
    } else {
      const paras = text.replace(/\r/g, '').split(/(\n\s*\n)/);
      let done = 0;
      const total = paras.filter((p) => p.trim()).length || 1;
      const res = await Promise.all(paras.map(async (p) => {
        if (!p.trim()) return p;
        const r = await batch.translate({ from, to, text: p, html: false });
        window.CMV.busy(`${t('Wird übersetzt …')} ${++done} / ${total}`, done / total);
        return r.target.text;
      }));
      out = res.join('');
    }
    markLoaded(from, to);
    const name = f.name.replace(/(\.[^.]+)?$/, `.${to}$1`);
    download(new Blob([out], { type: 'text/plain;charset=utf-8' }), name);
    toast(`${t('Fertig:')} ${name}`);
  } catch (err) {
    console.error(err);
    toast(t('Übersetzung fehlgeschlagen: ') + (err.message || err), true);
  } finally {
    window.CMV.busy(false);
  }
});

// ---------------------------------------------------------------- Routing
function route() {
  const about = location.hash === '#about';
  $('#home').classList.toggle('hidden', about);
  $('#about').classList.toggle('hidden', !about);
  if (about) window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
route();
changed();
window.CMV.registerSW();
window.__tr = { translateNow, get out() { return $('#dst').textContent; } };
