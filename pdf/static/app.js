// ---------------------------------------------------------------- Basics
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
};
const fmtSize = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`;
const thumb = (id, n, w = 200) => `api/file/${id}/page/${n}?w=${w}`;

const api = {
  async upload(fileList) {
    const fd = new FormData();
    for (const f of fileList) fd.append('files', f, f.name);
    const r = await fetch('api/upload', { method: 'POST', body: fd });
    if (!r.ok) throw new Error('Upload fehlgeschlagen');
    return r.json();
  },
  async run(tool, files, params) {
    const r = await fetch(`api/run/${tool}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: files.map((f) => f.id), params: { ...params, _lang: window.I18N ? I18N.lang : 'de' } }),
    });
    const data = await r.json().catch(() => ({ error: 'Server antwortet nicht.' }));
    if (!r.ok || data.error) throw new Error(data.error || 'Fehler');
    return data.result;
  },
};

function toast(msg, kind = 'info') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast ${kind}`;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.add('hidden'), kind === 'error' ? 6000 : 3000);
}
function busy(on, text = 'Wird verarbeitet …') {
  $('#busy').classList.toggle('hidden', !on);
  $('#busy-text').textContent = text;
}

let CAPS = {};

// Native Mac window: download → “Save As…”, preview → Preview app
const native = () => window.pywebview && window.pywebview.api;
document.addEventListener('click', async (e) => {
  const a = e.target.closest('a[href^="api/file/"]');
  if (!a || !native()) return;
  const [, , fid, action] = a.getAttribute('href').split('/');
  if (action !== 'download' && action !== 'raw') return;
  e.preventDefault();
  if (action === 'raw') return native().preview(fid);
  const r = await native().save(fid);
  if (r && r.ok) toast(`Gespeichert: ${r.name}`);
}, true);

// Heartbeat to the local server; “Quit” button
let APP_MODE = false;
async function ping() {
  try {
    const r = await (await fetch('api/ping', { cache: 'no-store' })).json();
    APP_MODE = r.app;
    // In the native window you quit with ⌘Q / closing the window – no button needed
    $('#quit').classList.toggle('hidden', !APP_MODE || r.window);
    $('#offline').classList.add('hidden');
  } catch { $('#offline').classList.remove('hidden'); }
}
ping();
setInterval(ping, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) ping(); });
$('#quit').addEventListener('click', async () => {
  if (!confirm(i18n('PDF Toolkit beenden? Nicht heruntergeladene Ergebnisse gehen verloren.'))) return;
  await fetch('api/quit', { method: 'POST' }).catch(() => {});
  document.body.innerHTML = '<div class="bye"><h1>PDF Toolkit ist beendet.</h1><p>Du kannst dieses Fenster schliessen. Neu starten: App „PDF Toolkit“ öffnen.</p></div>';
});
fetch('api/capabilities').then((r) => r.json()).then((c) => { CAPS = c; renderHome(); });

const NEEDS_HINT = {
  ocr: 'Benötigt Tesseract. Einmalig im Terminal: <code>brew install tesseract tesseract-lang</code>, danach die App neu starten.',
  office: 'Benötigt das kostenlose LibreOffice: <code>brew install --cask libreoffice</code> oder libreoffice.org.',
  pdf2docx: 'Python-Modul pdf2docx fehlt – start.command erneut ausführen.',
};

// ---------------------------------------------------------------- Navigation
const state = { tool: null, files: [], pick: new Set(), order: [] };

function show(view) {
  $$('.view').forEach((v) => v.classList.toggle('hidden', v.id !== view));
  window.scrollTo(0, 0);
}

function route() {
  const [, kind, id] = location.hash.split('/');
  if (kind === 'tool' && TOOLS[id]) {
    if (TOOLS[id].view === 'editor') return Editor.open(id, state.carry);
    openTool(id);
  } else if (kind === 'datenschutz' || kind === 'privacy') {
    show('privacy');
  } else {
    show('home');
    $('#search').focus();
  }
  state.carry = null;
}
window.addEventListener('hashchange', route);
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-home]')) { e.preventDefault(); location.hash = '#/'; }
});

// ---------------------------------------------------------------- Home
function renderHome() {
  const grid = $('#tool-grid');
  grid.innerHTML = '';
  const q = $('#search').value.trim().toLowerCase();
  let num = 0;
  for (const cat of CATEGORIES) {
    const items = cat.tools.filter((id) => {
      const t = TOOLS[id];
      return !q || (t.title + ' ' + t.desc + ' ' + (t.keywords || '')).toLowerCase().includes(q);
    });
    if (!items.length) continue;
    num++;
    grid.append(h('h3', { class: 'cat' }, h('span', { class: 'num' }, String(num).padStart(2, '0')), cat.name));
    grid.append(h('div', { class: 'cards' }, items.map((id) => {
      const t = TOOLS[id];
      const missing = t.needs && CAPS[t.needs] === false;
      const ico = h('span', { class: 'ico' });
      ico.innerHTML = iconSvg(id);
      return h('a', { class: 'card' + (missing ? ' missing' : ''), href: `#/tool/${id}` },
        ico,
        h('strong', {}, t.title),
        h('span', {}, t.desc),
        missing ? h('em', {}, 'Zusatzprogramm nötig') : h('i', { class: 'go' }, 'Öffnen →'));
    })));
  }
  if (!grid.children.length) grid.append(h('p', { class: 'muted' }, 'Kein Werkzeug gefunden.'));
}
$('#search').addEventListener('input', () => { if (location.hash.length > 2) location.hash = '#/'; renderHome(); });

// ---------------------------------------------------------------- Tool view
function openTool(id) {
  const t = TOOLS[id];
  state.tool = id;
  state.files = state.carry ? [...state.carry] : [];
  state.pick = new Set();
  state.order = [];
  show('tool');
  $('#tool-title').textContent = t.title;
  $('#tool-icon').innerHTML = iconSvg(id);
  $('#tool-desc').textContent = t.desc;
  const warn = $('#tool-warning');
  warn.classList.toggle('hidden', !(t.needs && CAPS[t.needs] === false));
  if (t.needs) warn.innerHTML = NEEDS_HINT[t.needs] || '';
  const input = $('#file-input');
  input.accept = t.accept || PDF;
  input.multiple = !!t.multiple;
  $('#accept-hint').textContent = t.multiple ? 'Mehrere Dateien möglich' : 'Eine Datei';
  $('#result').classList.add('hidden');
  $('#compare-out').classList.add('hidden');
  $('#organizer').classList.toggle('hidden', t.custom !== 'organize');
  $('#former').classList.toggle('hidden', t.custom !== 'form');
  $('#former').innerHTML = '';
  state.form = null;
  $('#run').textContent = { compare: 'Vergleichen', organize: 'PDF erstellen', form: 'PDF speichern' }[t.custom] || t.title;
  buildOptions(t);
  renderFiles();
  if (t.custom === 'form' && state.files.length) loadForm();
}

async function addFiles(list) {
  const t = TOOLS[state.tool];
  if (!list.length) return;
  busy(true, 'Dateien werden geladen …');
  try {
    const up = await api.upload(list);
    state.files = t.multiple ? [...state.files, ...up] : [up[0]];
    if (t.max) state.files = state.files.slice(-t.max);
    if (t.custom === 'organize') buildOrder();
    state.pick = new Set();
  } catch (e) { toast(e.message, 'error'); }
  busy(false);
  renderFiles();
  if (t.custom === 'form') loadForm();
}

const dz = $('#dropzone');
$('#file-input').addEventListener('change', (e) => { addFiles([...e.target.files]); e.target.value = ''; });
['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, () => dz.classList.remove('over')));
dz.addEventListener('drop', (e) => { e.preventDefault(); addFiles([...e.dataTransfer.files]); });
// Allow dropping files anywhere in the window
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  if (!e.dataTransfer.files.length) return;
  if (!$('#tool').classList.contains('hidden') && !e.target.closest('.org-grid,.file-list')) addFiles([...e.dataTransfer.files]);
});

function renderFiles() {
  const t = TOOLS[state.tool];
  const list = $('#file-list');
  list.innerHTML = '';
  dz.classList.toggle('compact', state.files.length > 0);
  state.files.forEach((f, i) => {
    const card = h('div', { class: 'file', draggable: t.sortable ? 'true' : 'false' },
      h('div', { class: 'file-thumb' }, f.encrypted ? h('span', { class: 'lock' }, '🔒') : h('img', { src: thumb(f.id, 0, 160), loading: 'lazy', alt: '' })),
      h('div', { class: 'file-meta' },
        h('strong', { title: f.name }, f.name),
        h('span', {}, [f.pages ? `${f.pages} Seite${f.pages > 1 ? 'n' : ''}` : '', fmtSize(f.size)].filter(Boolean).join(' · ')),
        f.encrypted && state.tool !== 'unlock' ? h('a', { class: 'link', href: '#/tool/unlock', onclick: () => { state.carry = [f]; } }, 'Passwortgeschützt – zuerst entsperren') : null),
      t.sortable ? h('span', { class: 'grip', title: 'Ziehen zum Sortieren' }, '⋮⋮') : null,
      h('button', { class: 'x', title: 'Entfernen', onclick: () => { state.files.splice(i, 1); if (t.custom === 'organize') buildOrder(); if (t.custom === 'form') loadForm(); renderFiles(); } }, '×'));
    if (t.sortable) dragSort(card, i, state.files, renderFiles);
    list.append(card);
  });
  if (t.sortable && state.files.length > 1) {
    list.append(h('div', { class: 'list-tools' },
      h('button', { class: 'link', onclick: () => { state.files.sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true })); renderFiles(); } }, 'A→Z sortieren'),
      h('button', { class: 'link', onclick: () => { state.files.reverse(); renderFiles(); } }, 'Umkehren')));
  }
  renderPicker();
  renderOrganizer();
}

// Drag & drop sorting for lists
let dragFrom = null;
function dragSort(el, index, arr, rerender) {
  el.addEventListener('dragstart', (e) => { dragFrom = index; el.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', ''); });
  el.addEventListener('dragend', () => { el.classList.remove('dragging'); dragFrom = null; });
  el.addEventListener('dragover', (e) => { if (dragFrom === null) return; e.preventDefault(); e.stopPropagation(); el.classList.add('drop-target'); });
  el.addEventListener('dragleave', () => el.classList.remove('drop-target'));
  el.addEventListener('drop', (e) => {
    if (dragFrom === null) return;
    e.preventDefault(); e.stopPropagation();
    const [item] = arr.splice(dragFrom, 1);
    arr.splice(index, 0, item);
    dragFrom = null;
    rerender();
  });
}

// ---------------------------------------------------------------- Options
function buildOptions(t) {
  const form = $('#options');
  form.innerHTML = '';
  for (const f of t.fields || []) {
    let input;
    const id = `opt-${f.name}`;
    if (f.type === 'select') {
      input = h('select', { id, name: f.name }, f.options.map(([v, l]) => h('option', { value: v, selected: String(f.default) === v }, l)));
    } else if (f.type === 'checkbox') {
      input = h('input', { id, name: f.name, type: 'checkbox', checked: !!f.default });
      form.append(h('label', { class: 'check field', 'data-field': f.name }, input, ' ', f.label));
      continue;
    } else if (f.type === 'textarea') {
      input = h('textarea', { id, name: f.name, rows: 4, placeholder: f.placeholder || '' });
    } else if (f.type === 'cards') {
      input = h('div', { class: 'opt-cards' }, f.options.map(([v, l, d]) =>
        h('label', { class: 'opt-card' }, h('input', { type: 'radio', name: f.name, value: v, checked: f.default === v }), h('strong', {}, l), h('small', {}, d))));
    } else if (f.type === 'range') {
      const out = h('output', {}, `${f.default}${f.unit || ''}`);
      input = h('div', { class: 'range' }, h('input', { id, name: f.name, type: 'range', min: f.min, max: f.max, value: f.default, oninput: (e) => { out.textContent = e.target.value + (f.unit || ''); } }), out);
    } else if (f.type === 'image') {
      input = h('input', { id, type: 'file', accept: 'image/*', 'data-image': f.name });
    } else {
      input = h('input', { id, name: f.name, type: f.type, value: typeof f.default === 'string' ? i18n(f.default) : (f.default ?? ''), placeholder: f.placeholder || '' });
    }
    form.append(h('div', { class: 'field', 'data-field': f.name },
      h('label', { for: id }, f.label), input, f.hint ? h('small', {}, f.hint) : null));
  }
  form.oninput = form.onchange = (e) => {
    updateShowIf(t);
    if (e && e.target.name === 'pages') syncPickFromText();
  };
  updateShowIf(t);
}

function readParams(t) {
  const p = {};
  const form = $('#options');
  for (const f of t.fields || []) {
    if (f.type === 'checkbox') p[f.name] = form.elements[f.name].checked;
    else if (f.type === 'cards') p[f.name] = (form.querySelector(`input[name="${f.name}"]:checked`) || {}).value;
    else if (f.type === 'image') p[f.name] = form.querySelector(`[data-image="${f.name}"]`).dataset.url || '';
    else if (f.type === 'range') p[f.name] = form.querySelector(`input[name="${f.name}"]`).value;
    else p[f.name] = form.elements[f.name].value;
  }
  return p;
}
$('#options').addEventListener('change', (e) => {
  if (e.target.dataset.image && e.target.files[0]) {
    const r = new FileReader();
    r.onload = () => { e.target.dataset.url = r.result; };
    r.readAsDataURL(e.target.files[0]);
  }
});

function updateShowIf(t) {
  const p = readParams(t);
  for (const f of t.fields || []) {
    if (!f.showIf) continue;
    const ok = Object.entries(f.showIf).every(([k, v]) => p[k] === v);
    $(`#options [data-field="${f.name}"]`).classList.toggle('hidden', !ok);
  }
}

// ---------------------------------------------------------------- Page picker
function compressRanges(nums) {
  const s = [...nums].sort((a, b) => a - b).map((n) => n + 1);
  const out = [];
  for (let i = 0; i < s.length; i++) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(j > i ? `${s[i]}-${s[j]}` : `${s[i]}`);
    i = j;
  }
  return out.join(', ');
}
function parseRanges(spec, n) {
  const set = new Set();
  (spec || '').toLowerCase().replace(/ende|last/g, n).split(/[,;\s]+/).forEach((part) => {
    const m = part.match(/^(\d*)-(\d*)$/);
    let a, b;
    if (m) { a = +(m[1] || 1); b = +(m[2] || n); } else if (/^\d+$/.test(part)) { a = b = +part; } else return;
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (i >= 1 && i <= n) set.add(i - 1);
  });
  return set;
}
function renderPicker() {
  const t = TOOLS[state.tool];
  const f = state.files[0];
  const box = $('#picker');
  const show_ = t.picker && f && f.pages;
  box.classList.toggle('hidden', !show_);
  if (!show_) return;
  const grid = $('.picker-grid', box);
  grid.innerHTML = '';
  for (let i = 0; i < f.pages; i++) {
    grid.append(h('button', { type: 'button', class: 'pthumb' + (state.pick.has(i) ? ' on' : ''), 'data-i': i, onclick: () => togglePick(i) },
      h('img', { src: thumb(f.id, i, 160), loading: 'lazy', alt: '' }), h('span', {}, i + 1)));
  }
}
function togglePick(i) {
  state.pick.has(i) ? state.pick.delete(i) : state.pick.add(i);
  syncPickToText();
}
function syncPickToText() {
  const el = $('#options [name="pages"]');
  if (el) el.value = compressRanges(state.pick);
  $$('.picker-grid .pthumb').forEach((b) => b.classList.toggle('on', state.pick.has(+b.dataset.i)));
}
function syncPickFromText() {
  const f = state.files[0];
  if (!f || !f.pages) return;
  state.pick = parseRanges($('#options [name="pages"]').value, f.pages);
  $$('.picker-grid .pthumb').forEach((b) => b.classList.toggle('on', state.pick.has(+b.dataset.i)));
}
$('.picker-head').addEventListener('click', (e) => {
  const a = e.target.dataset.pick;
  const n = state.files[0]?.pages || 0;
  if (!a) return;
  const all = [...Array(n).keys()];
  if (a === 'all') state.pick = new Set(all);
  if (a === 'none') state.pick = new Set();
  if (a === 'invert') state.pick = new Set(all.filter((i) => !state.pick.has(i)));
  syncPickToText();
});

// ---------------------------------------------------------------- Organize
function buildOrder() {
  state.order = [];
  state.files.forEach((f, fi) => {
    for (let p = 0; p < (f.pages || 0); p++) state.order.push({ file: fi, page: p, rotate: 0 });
  });
}
function renderOrganizer() {
  if (TOOLS[state.tool]?.custom !== 'organize') return;
  const grid = $('.org-grid');
  grid.innerHTML = '';
  $('#org-count').textContent = state.order.length ? `${state.order.length} Seiten` : '';
  state.order.forEach((it, i) => {
    const f = state.files[it.file];
    const img = it.blank ? h('div', { class: 'blank' }, 'leer') : h('img', { src: thumb(f.id, it.page, 180), loading: 'lazy', alt: '', style: { transform: `rotate(${it.rotate}deg)` } });
    const card = h('div', { class: 'org-page', draggable: 'true' },
      h('div', { class: 'org-img' }, img),
      h('div', { class: 'org-label' }, it.blank ? 'Leere Seite' : (state.files.length > 1 ? `${String.fromCharCode(65 + it.file)}·${it.page + 1}` : `Seite ${it.page + 1}`)),
      h('div', { class: 'org-actions' },
        h('button', { title: 'Links drehen', onclick: () => { it.rotate = (it.rotate + 270) % 360; renderOrganizer(); } }, '⟲'),
        h('button', { title: 'Rechts drehen', onclick: () => { it.rotate = (it.rotate + 90) % 360; renderOrganizer(); } }, '⟳'),
        h('button', { title: 'Duplizieren', onclick: () => { state.order.splice(i + 1, 0, { ...it }); renderOrganizer(); } }, '⧉'),
        h('button', { title: 'Löschen', onclick: () => { state.order.splice(i, 1); renderOrganizer(); } }, '🗑')),
      h('span', { class: 'org-num' }, i + 1));
    dragSort(card, i, state.order, renderOrganizer);
    grid.append(card);
  });
}
$('.org-bar').addEventListener('click', (e) => {
  const a = e.target.dataset.org;
  if (a === 'blank') state.order.push({ blank: true });
  if (a === 'rotall') state.order.forEach((it) => { it.rotate = ((it.rotate || 0) + 90) % 360; });
  if (a === 'reverse') state.order.reverse();
  if (a === 'reset') buildOrder();
  renderOrganizer();
});

// ---------------------------------------------------------------- Run
$('#run').addEventListener('click', async () => {
  const t = TOOLS[state.tool];
  if (!state.files.length) return toast('Bitte zuerst eine Datei hinzufügen.', 'error');
  const params = readParams(t);
  if (t.custom === 'organize') params.order = state.order;
  if (t.custom === 'form') {
    if (!state.form || !state.form.length) return toast('Dieses PDF hat keine ausfüllbaren Felder.', 'error');
    params.values = readForm();
  }
  busy(true);
  try {
    const res = await api.run(state.tool, state.files, params);
    if (t.custom === 'compare') renderCompare(res);
    else showResult($('#result'), res);
  } catch (e) { toast(e.message, 'error'); }
  busy(false);
});

// ---------------------------------------------------------------- Fill in forms
// The page is shown as an image; every form field becomes a real input at the same spot.
async function loadForm() {
  const box = $('#former');
  box.innerHTML = '';
  state.form = null;
  const f = state.files[0];
  if (!f) return;
  busy(true, 'Formularfelder werden gelesen …');
  try { state.form = (await api.run('form_fields', [f], {})).fields; }
  catch (e) { toast(e.message, 'error'); state.form = []; }
  busy(false);
  if (!state.form.length) {
    box.append(h('div', { class: 'form-empty' },
      h('strong', {}, 'Dieses PDF hat keine ausfüllbaren Felder.'),
      h('p', { class: 'muted' }, 'Mit „PDF bearbeiten“ kannst du trotzdem Text, Häkchen und Datum auf die Seite setzen.'),
      h('a', { class: 'btn', href: '#/tool/edit', onclick: () => { state.carry = [f]; } }, 'In „PDF bearbeiten“ öffnen')));
    return;
  }
  const editable = state.form.filter((x) => !x.readonly).length;
  box.append(h('p', { class: 'form-intro' }, `${editable} ${editable === 1 ? 'Feld' : 'Felder'} zum Ausfüllen – direkt in die Seite tippen.`));
  for (const pno of [...new Set(state.form.map((x) => x.page))]) {
    const [pw, ph] = (f.sizes && f.sizes[pno]) || [595, 842];
    const page = h('div', { class: 'form-page', 'data-no-i18n': true, style: { aspectRatio: `${pw} / ${ph}` } },
      h('img', { src: thumb(f.id, pno, 1400), alt: '' }),
      h('span', { class: 'form-pno' }, `${pno + 1}`));
    // read-only fields stay as they are in the page image
    for (const fl of state.form.filter((x) => x.page === pno && !x.readonly)) page.append(formField(fl, pw));
    box.append(h('div', { class: 'form-scroll' }, page));
  }
}

function formField(fl, pw) {
  const pos = { left: fl.x * 100 + '%', top: fl.y * 100 + '%', width: fl.w * 100 + '%', height: fl.h * 100 + '%' };
  // font size in points → share of the page width (cqw = 1 % of the page element's width)
  const pt = fl.size || Math.max(6, Math.min(12, fl.h * 842 * 0.62));
  const font = `${(pt / pw) * 100}cqw`;
  const common = { 'data-id': fl.id, title: fl.label || fl.name, disabled: fl.readonly };
  let el;
  if (fl.kind === 'text') {
    el = fl.multiline ? h('textarea', common) : h('input', { ...common, type: 'text' });
    el.value = fl.value || '';
    if (fl.maxlen) el.maxLength = fl.maxlen;
  } else if (fl.kind === 'check' || fl.kind === 'radio') {
    el = h('input', { ...common, type: fl.kind === 'check' ? 'checkbox' : 'radio', name: fl.kind === 'radio' ? 'r_' + fl.name : null });
    el.checked = !!fl.value;
  } else {
    const opts = fl.options.includes(fl.value) || !fl.value ? fl.options : [fl.value, ...fl.options];
    el = h('select', common, h('option', { value: '' }, ''), opts.map((o) => h('option', { value: o }, o)));
    el.value = fl.value || '';
  }
  el.classList.add('ff', 'ff-' + fl.kind);
  Object.assign(el.style, pos, { fontSize: font });
  return el;
}

function readForm() {
  const values = {};
  for (const el of $$('#former [data-id]')) {
    if (el.disabled) continue;
    values[el.dataset.id] = el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value;
  }
  return values;
}

function showResult(box, res) {
  box.classList.remove('hidden');
  box.innerHTML = '';
  const isPdf = res.name.toLowerCase().endsWith('.pdf');
  const delta = res.input_size && isPdf ? res.size - res.input_size : null;
  const next = h('select', { class: 'next' },
    h('option', { value: '' }, 'Weiterverarbeiten mit …'),
    Object.entries(TOOLS).filter(([, t]) => !t.accept || t.accept.includes('.pdf')).map(([id, t]) => h('option', { value: id }, t.title)));
  next.addEventListener('change', () => {
    if (!next.value) return;
    state.carry = [res];
    location.hash = `#/tool/${next.value}`;
  });
  box.append(
    h('div', { class: 'res-head' }, h('span', { class: 'ok' }, '✓'), h('strong', {}, 'Fertig!')),
    isPdf && res.pages ? h('a', { href: `api/file/${res.id}/raw`, target: '_blank', class: 'res-thumb', title: 'Vorschau öffnen' }, h('img', { src: thumb(res.id, 0, 360), alt: '' })) : null,
    h('div', { class: 'res-name' }, res.name),
    h('div', { class: 'muted' }, [res.pages ? `${res.pages} Seiten` : '', fmtSize(res.size), delta !== null && delta < 0 ? `${fmtSize(-delta)} gespart` : ''].filter(Boolean).join(' · ')),
    res.info ? h('div', { class: 'res-info' }, res.info) : null,
    h('a', { class: 'primary big btn', href: `api/file/${res.id}/download` }, 'Herunterladen'),
    isPdf ? h('a', { class: 'btn', href: `api/file/${res.id}/raw`, target: '_blank' }, 'Vorschau öffnen') : null,
    isPdf ? next : null);
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderCompare(res) {
  const box = $('#compare-out');
  box.classList.remove('hidden');
  box.innerHTML = '';
  box.append(h('div', { class: 'cmp-summary' },
    h('strong', {}, res.changes ? `${res.changes} Unterschied(e) gefunden` : 'Kein Unterschied im Text gefunden'),
    h('span', { class: 'muted' }, ` · Übereinstimmung ${res.ratio} %`)));
  const table = h('div', { class: 'cmp' },
    h('div', { class: 'cmp-h' }, res.names[0]), h('div', { class: 'cmp-h' }, res.names[1]));
  const line = (x, cls) => x ? h('div', { class: 'cmp-c ' + cls }, h('span', { class: 'pg' }, `S${x[0]}`), x[1]) : h('div', { class: 'cmp-c empty' });
  for (const op of res.ops) {
    if (op.tag === 'equal') {
      if (op.a.length > 4) {
        op.a.slice(0, 2).forEach((x, i) => table.append(line(x, ''), line(op.b[i], '')));
        table.append(h('div', { class: 'cmp-skip' }, `… ${op.a.length - 4} gleiche Zeilen …`));
        op.a.slice(-2).forEach((x, i) => table.append(line(x, ''), line(op.b[op.b.length - 2 + i], '')));
      } else op.a.forEach((x, i) => table.append(line(x, ''), line(op.b[i], '')));
    } else {
      const n = Math.max(op.a.length, op.b.length);
      for (let i = 0; i < n; i++) table.append(line(op.a[i], 'del'), line(op.b[i], 'ins'));
    }
  }
  box.append(table);
  box.scrollIntoView({ behavior: 'smooth' });
}

