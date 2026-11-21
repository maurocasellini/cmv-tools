// ---------------------------------------------------------------- PDF editor
const Editor = (() => {
  const S = { file: null, els: [], sel: null, tool: 'select', zoom: 1, history: [], editing: null, pendingSig: false };
  const box = $('#ed-pages');
  const ED_ICONS = {
    select: ['M5.5 3.5l5.5 16 2.3-6.9 6.9-2.3z'],
    signature: ICONS.sign, text: ICONS.extract_text, image: ICONS.images_to_pdf,
    date: ['M4 5.5h16v15H4z', 'M4 10h16', 'M8.5 3.5v4', 'M15.5 3.5v4', 'M8 14h2', 'M12 14h2', 'M8 17h2'],
    check: ['M5 12.5l4.5 4.5L19 7'], cross: ['M6.5 6.5l11 11', 'M17.5 6.5l-11 11'],
    whiteout: ['M3.5 7h17v10h-17z', 'M7 12h10'],
    highlight: ['M4 20.5h16', 'M8.5 16.5l-1.5 2.5h4.5l.5-1.5', 'M8.5 16.5l7-12 3.5 2-6.5 11.5z'],
    rect: ['M4 6h16v12H4z'], ellipse: ['M12 5c4.4 0 8.5 3.1 8.5 7s-4.1 7-8.5 7-8.5-3.1-8.5-7 4.1-7 8.5-7z'],
    line: ['M4 12h16'], redact: ICONS.redact,
  };
  $$('.ed-tools button').forEach((b) => {
    const paths = ED_ICONS[b.dataset.tool];
    if (!paths) return;
    const label = b.textContent.trim();
    const iconOnly = label.length <= 2;
    b.innerHTML = svgFrom(paths) + (iconOnly ? '' : `<span>${label}</span>`);
    b.classList.toggle('icon-only', iconOnly);
  });
  const FONTS = { helv: 'Arial, Helvetica, sans-serif', tiro: '"Times New Roman", Times, serif', cour: '"Courier New", Courier, monospace' };
  const defaults = { text: { size: 12, color: '#111111', font: 'helv' }, shape: { color: '#d00000', stroke: 1.5 }, mark: { color: '#1a3a9c' } };
  let uid = 1;

  // ---------- Loading
  function open(id, carry) {
    show('editor');
    S.pendingSig = !!TOOLS[id].openSignature;
    setTool('select');
    if (carry && carry[0]) load(carry[0]);
    else if (!S.file) showDrop();
    else if (S.pendingSig) { S.pendingSig = false; openSig(); }
  }

  function showDrop() {
    box.innerHTML = '';
    box.append($('#ed-drop') || makeDrop());
    $('#ed-props').innerHTML = '';
  }
  const drop = $('#ed-drop');
  function makeDrop() { return drop; }
  $('#ed-file').addEventListener('change', async (e) => { if (e.target.files[0]) await uploadAndLoad(e.target.files[0]); e.target.value = ''; });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) uploadAndLoad(e.dataTransfer.files[0]); });

  async function uploadAndLoad(file) {
    busy(true, 'PDF wird geladen …');
    try { const [f] = await api.upload([file]); load(f); } catch (err) { toast(err.message, 'error'); }
    busy(false);
  }

  function load(f) {
    if (f.encrypted) { toast('Dieses PDF ist passwortgeschützt – bitte zuerst „PDF entsperren“ verwenden.', 'error'); state.carry = [f]; location.hash = '#/tool/unlock'; return; }
    if (!f.pages) { toast('Das ist kein lesbares PDF.', 'error'); return; }
    S.file = f; S.els = []; S.history = []; S.sel = null;
    $('#ed-result').classList.add('hidden');
    renderPages();
    renderProps();
    if (S.pendingSig) { S.pendingSig = false; setTimeout(openSig, 200); }
  }

  // ---------- Pages
  function renderPages() {
    if (!S.file) return;
    box.innerHTML = '';
    const avail = Math.max(320, box.clientWidth - 48);
    S.file.sizes.forEach(([pw, ph], i) => {
      const dispW = Math.round(Math.min(avail, 900) * S.zoom);
      const k = dispW / pw;
      const overlay = h('div', { class: 'ed-overlay', 'data-page': i });
      const wrap = h('div', { class: 'ed-page', style: { width: dispW + 'px', height: Math.round(ph * k) + 'px' } },
        h('img', { src: thumb(S.file.id, i, Math.min(2400, Math.round(dispW * (window.devicePixelRatio || 1)))), loading: i < 3 ? 'eager' : 'lazy', draggable: 'false', alt: '' }),
        overlay);
      wrap.style.setProperty('--k', k);
      overlay.addEventListener('pointerdown', (e) => onPageDown(e, i, overlay));
      box.append(wrap, h('div', { class: 'ed-pnum' }, `Seite ${i + 1} von ${S.file.pages}`));
    });
    $('#ed-zoom-label').textContent = Math.round(S.zoom * 100) + ' %';
    S.els.forEach(renderEl);
    box.append(h('div', { class: 'ed-other' }, h('button', { class: 'link', onclick: () => $('#ed-file').click() }, 'Andere PDF öffnen')));
  }
  const overlayOf = (i) => box.querySelector(`.ed-overlay[data-page="${i}"]`);
  const kOf = (i) => parseFloat(overlayOf(i).parentElement.style.getPropertyValue('--k'));
  const pageSize = (i) => S.file.sizes[i];

  // ---------- Tools
  function setTool(t) {
    if (t === 'signature') return openSig();
    if (t === 'image') return pickImage();
    if (t === 'date') return addDate();
    S.tool = t;
    $$('.ed-tools button').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
    box.classList.toggle('placing', t !== 'select');
    const hints = {
      select: 'Elemente anklicken, ziehen zum Verschieben, Ecke ziehen für Grösse. Doppelklick auf Text zum Bearbeiten.',
      text: 'Klicke auf die Seite, wo der Text stehen soll.',
      whiteout: 'Klicke auf die Stelle, die weiss überdeckt werden soll – danach Grösse anpassen.',
      redact: 'Bereich wird beim Speichern dauerhaft entfernt (inkl. Text darunter).',
    };
    $('#ed-hint').textContent = hints[t] || 'Klicke auf die Seite, um das Element zu platzieren.';
  }
  $('.ed-tools').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setTool(b.dataset.tool); });

  const SIZES = { check: [16, 16], cross: [16, 16], whiteout: [140, 22], highlight: [140, 16], rect: [140, 60], ellipse: [110, 60], line: [140, 10], redact: [140, 18] };

  function onPageDown(e, page, overlay) {
    if (e.target !== overlay) return; // click on an element
    e.preventDefault(); // do not steal focus from the text being edited
    commitEditing();
    if (S.tool === 'select' || !S.file) { select(null); return; }
    const r = overlay.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    const [pw, ph] = pageSize(page);
    let el;
    if (S.tool === 'text') {
      const d = defaults.text;
      el = { type: 'text', text: '', size: d.size, color: d.color, font: d.font, bold: false, italic: false, align: 'left', x: fx, y: fy - (d.size * 0.6) / ph, w: 0.1, h: 0.02 };
    } else {
      const [w, hh] = SIZES[S.tool];
      el = { type: S.tool, x: fx - w / pw / 2, y: fy - hh / ph / 2, w: w / pw, h: hh / ph };
      if (['rect', 'ellipse', 'line'].includes(S.tool)) Object.assign(el, { color: defaults.shape.color, stroke: defaults.shape.stroke });
      if (['check', 'cross'].includes(S.tool)) el.color = defaults.mark.color;
      if (S.tool === 'highlight') Object.assign(el, { color: '#ffe600', opacity: 0.4 });
    }
    el.page = page;
    add(el);
    if (el.type === 'text') setTimeout(() => startEditing(el), 0);
    if (!e.shiftKey) setTool('select');
  }

  function add(el) {
    pushHistory();
    el.id = uid++;
    clamp(el);
    S.els.push(el);
    renderEl(el);
    select(el);
    return el;
  }

  function clamp(el) {
    el.x = Math.min(Math.max(el.x, 0), Math.max(0, 1 - el.w));
    el.y = Math.min(Math.max(el.y, 0), Math.max(0, 1 - el.h));
  }

  // ---------- Rendering
  const svgMark = (type, color, w, hh) => {
    const sw = Math.max(1.5, Math.min(w, hh) * 0.12);
    const path = type === 'check' ? '<polyline points="10,55 40,85 90,15"/>' : '<line x1="15" y1="15" x2="85" y2="85"/><line x1="85" y1="15" x2="15" y2="85"/>';
    return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%"><g fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke">${path.replace(/\/>/g, ' vector-effect="non-scaling-stroke"/>')}</g></svg>`;
  };

  function renderEl(el) {
    const ov = overlayOf(el.page);
    if (!ov) return;
    let node = ov.querySelector(`[data-id="${el.id}"]`);
    if (!node) {
      node = h('div', { class: 'ed-el', 'data-id': el.id });
      node.addEventListener('pointerdown', (e) => onElDown(e, el));
      node.addEventListener('dblclick', () => { if (el.type === 'text') startEditing(el); });
      ov.append(node);
    }
    const k = kOf(el.page);
    node.className = `ed-el t-${el.type}` + (S.sel === el ? ' sel' : '');
    Object.assign(node.style, { left: el.x * 100 + '%', top: el.y * 100 + '%', width: '', height: '', opacity: el.opacity ?? '' });
    if (el.type !== 'text') Object.assign(node.style, { width: el.w * 100 + '%', height: el.h * 100 + '%' });
    if (el.type === 'text') {
      let t = node.querySelector('.txt');
      if (!t) {
        t = h('div', { class: 'txt', spellcheck: 'false' });
        t.addEventListener('paste', (e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); });
        t.addEventListener('blur', () => commitEditing());
        t.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); t.blur(); } e.stopPropagation(); });
        node.append(t);
      }
      if (S.editing !== el) t.textContent = el.text;
      Object.assign(t.style, {
        fontFamily: FONTS[el.font], fontSize: `calc(var(--k) * ${el.size}px)`, color: el.color,
        fontWeight: el.bold ? '700' : '400', fontStyle: el.italic ? 'italic' : 'normal', textAlign: el.align,
      });
      node.style.opacity = '';
    } else if (el.type === 'image') {
      if (!node.querySelector('img')) node.append(h('img', { src: el.image, draggable: 'false', alt: '' }));
    } else if (el.type === 'check' || el.type === 'cross') {
      node.innerHTML = svgMark(el.type, el.color, el.w * pageSize(el.page)[0] * k, el.h * pageSize(el.page)[1] * k);
    } else if (el.type === 'rect' || el.type === 'ellipse') {
      Object.assign(node.style, { border: `${Math.max(1, el.stroke * k)}px solid ${el.color}`, background: el.fill || 'transparent' });
    } else if (el.type === 'line') {
      node.innerHTML = '';
      node.append(h('div', { class: 'line-inner', style: { borderTop: `${Math.max(1, el.stroke * k)}px solid ${el.color}` } }));
    } else if (el.type === 'highlight') {
      node.style.background = el.color;
      node.style.opacity = el.opacity;
    } else if (el.type === 'redact' && !node.textContent) {
      node.append(h('span', {}, 'SCHWÄRZEN'));
    }
    if (!node.querySelector('.handle')) {
      const hd = h('div', { class: 'handle' });
      hd.addEventListener('pointerdown', (e) => onResizeDown(e, el));
      node.append(hd);
    }
  }

  function removeEl(el) {
    pushHistory();
    S.els = S.els.filter((x) => x !== el);
    overlayOf(el.page)?.querySelector(`[data-id="${el.id}"]`)?.remove();
    if (S.sel === el) select(null);
  }

  function select(el) {
    const prev = S.sel;
    S.sel = el;
    if (prev) overlayOf(prev.page)?.querySelector(`[data-id="${prev.id}"]`)?.classList.remove('sel');
    if (el) overlayOf(el.page)?.querySelector(`[data-id="${el.id}"]`)?.classList.add('sel');
    renderProps();
  }

  // ---------- Text editing
  function startEditing(el) {
    select(el);
    S.editing = el;
    const t = overlayOf(el.page).querySelector(`[data-id="${el.id}"] .txt`);
    t.contentEditable = 'true';
    if (!el.text) t.textContent = '';
    t.focus();
    const range = document.createRange();
    range.selectNodeContents(t);
    const s = getSelection(); s.removeAllRanges(); s.addRange(range);
  }
  function commitEditing() {
    const el = S.editing;
    if (!el) return;
    S.editing = null;
    const node = overlayOf(el.page)?.querySelector(`[data-id="${el.id}"]`);
    if (!node) return;
    const t = node.querySelector('.txt');
    t.contentEditable = 'false';
    const text = t.innerText.replace(/\n$/, '');
    if (!text.trim()) { S.els = S.els.filter((x) => x !== el); node.remove(); if (S.sel === el) select(null); return; }
    if (text !== el.text) { pushHistory(); el.text = text; }
    measure(el);
  }
  function measure(el) {
    const node = overlayOf(el.page)?.querySelector(`[data-id="${el.id}"]`);
    if (!node) return;
    const ov = node.parentElement;
    el.w = node.offsetWidth / ov.clientWidth;
    el.h = node.offsetHeight / ov.clientHeight;
  }

  // ---------- Move & resize
  function onElDown(e, el) {
    if (e.target.classList.contains('handle')) return;
    if (S.editing === el) return; // select text instead of moving
    commitEditing();
    e.preventDefault();
    select(el);
    const ov = overlayOf(el.page);
    const r = ov.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY, ex: el.x, ey: el.y };
    let moved = false;
    const move = (ev) => {
      const dx = (ev.clientX - start.x) / r.width, dy = (ev.clientY - start.y) / r.height;
      if (!moved && Math.abs(ev.clientX - start.x) + Math.abs(ev.clientY - start.y) < 3) return;
      if (!moved) { pushHistory(); moved = true; }
      el.x = start.ex + dx; el.y = start.ey + dy;
      if (el.type === 'text') measure(el);
      clamp(el);
      renderEl(el);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function onResizeDown(e, el) {
    e.preventDefault(); e.stopPropagation();
    commitEditing();
    select(el);
    pushHistory();
    const ov = overlayOf(el.page);
    const r = ov.getBoundingClientRect();
    if (el.type === 'text') measure(el);
    const start = { x: e.clientX, y: e.clientY, w: el.w, h: el.h, size: el.size };
    const aspect = (el.h * r.height) / (el.w * r.width);
    const move = (ev) => {
      let w = Math.max(0.01, start.w + (ev.clientX - start.x) / r.width);
      let hh = Math.max(0.005, start.h + (ev.clientY - start.y) / r.height);
      if (el.type === 'text') {
        el.size = Math.max(4, Math.round(start.size * (hh / start.h) * 2) / 2);
        renderEl(el); measure(el); renderProps();
        return;
      }
      if ((el.type === 'image' || el.type === 'check' || el.type === 'cross') && !ev.shiftKey) hh = (w * r.width * aspect) / r.height;
      el.w = Math.min(w, 1 - el.x); el.h = Math.min(hh, 1 - el.y);
      renderEl(el);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // ---------- History
  function pushHistory() {
    S.history.push(JSON.stringify(S.els));
    if (S.history.length > 80) S.history.shift();
  }
  function undo() {
    commitEditing();
    const prev = S.history.pop();
    if (prev == null) return;
    box.querySelectorAll('.ed-el').forEach((n) => n.remove());
    S.els = JSON.parse(prev);
    S.sel = null;
    S.els.forEach(renderEl);
    renderProps();
  }
  $('#ed-undo').addEventListener('click', undo);

  // ---------- Properties
  function renderProps() {
    const p = $('#ed-props');
    p.innerHTML = '';
    const el = S.sel;
    if (!el) return;
    const names = { text: 'Text', image: el.sig ? 'Unterschrift' : 'Bild', whiteout: 'Abdeckung', highlight: 'Markierung', rect: 'Rechteck', ellipse: 'Ellipse', line: 'Linie', check: 'Häkchen', cross: 'Kreuz', redact: 'Schwärzung' };
    p.append(h('h3', {}, names[el.type]));
    const set = (key, val, d) => { pushHistory(); el[key] = val; if (d) d[key] = val; renderEl(el); if (el.type === 'text') measure(el); };
    const row = (label, input) => h('label', { class: 'prop' }, h('span', {}, label), input);
    const color = (key, d) => h('input', { type: 'color', value: el[key], oninput: (e) => set(key, e.target.value, d) });
    if (el.type === 'text') {
      p.append(
        row('Schrift', h('select', { onchange: (e) => set('font', e.target.value, defaults.text) },
          [['helv', 'Helvetica'], ['tiro', 'Times'], ['cour', 'Courier']].map(([v, l]) => h('option', { value: v, selected: el.font === v }, l)))),
        row('Grösse (pt)', h('input', { type: 'number', min: 4, max: 200, step: 0.5, value: el.size, oninput: (e) => set('size', +e.target.value || 12, defaults.text) })),
        row('Farbe', color('color', defaults.text)),
        h('div', { class: 'prop-btns' },
          h('button', { class: el.bold ? 'on' : '', onclick: () => { set('bold', !el.bold); renderProps(); } }, h('b', {}, 'F')),
          h('button', { class: el.italic ? 'on' : '', onclick: () => { set('italic', !el.italic); renderProps(); } }, h('i', {}, 'K')),
          ...[['left', '⇤'], ['center', '↔'], ['right', '⇥']].map(([a, l]) => h('button', { class: el.align === a ? 'on' : '', onclick: () => { set('align', a); renderProps(); } }, l))),
        h('button', { class: 'wide', onclick: () => startEditing(el) }, 'Text bearbeiten'));
    }
    if (el.type === 'image') {
      p.append(row('Deckkraft', h('input', { type: 'range', min: 10, max: 100, value: (el.opacity ?? 1) * 100, oninput: (e) => set('opacity', e.target.value / 100) })),
        h('small', { class: 'muted' }, 'Ecke ziehen = proportional, mit ⇧ frei.'));
    }
    if (['rect', 'ellipse', 'line'].includes(el.type)) {
      p.append(row('Farbe', color('color', defaults.shape)),
        row('Linienstärke', h('input', { type: 'number', min: 0.25, max: 20, step: 0.25, value: el.stroke, oninput: (e) => set('stroke', +e.target.value || 1, defaults.shape) })));
      if (el.type === 'rect') p.append(row('Füllung', h('span', {},
        h('input', { type: 'checkbox', checked: !!el.fill, onchange: (e) => { set('fill', e.target.checked ? '#ffffff' : null); renderProps(); } }),
        el.fill ? h('input', { type: 'color', value: el.fill, oninput: (e) => set('fill', e.target.value) }) : null)));
    }
    if (el.type === 'check' || el.type === 'cross') p.append(row('Farbe', color('color', defaults.mark)));
    if (el.type === 'highlight') p.append(row('Farbe', color('color')),
      row('Deckkraft', h('input', { type: 'range', min: 10, max: 90, value: el.opacity * 100, oninput: (e) => set('opacity', e.target.value / 100) })));
    if (el.type === 'redact') p.append(h('small', { class: 'muted' }, 'Inhalt unter diesem Bereich wird beim Speichern unwiderruflich entfernt.'));
    p.append(h('div', { class: 'prop-actions' },
      h('button', { onclick: () => duplicate(el) }, '⧉ Duplizieren'),
      S.file.pages > 1 ? h('button', { onclick: () => toAllPages(el), title: 'z. B. für Initialen/Paraphe auf jeder Seite' }, '⇊ Auf allen Seiten') : null,
      h('button', { class: 'danger', onclick: () => removeEl(el) }, '🗑 Löschen')));
  }

  function clone(el, page) {
    const c = JSON.parse(JSON.stringify(el));
    c.id = uid++;
    if (page != null) c.page = page;
    return c;
  }
  function duplicate(el) {
    commitEditing();
    pushHistory();
    const c = clone(el);
    c.x += 0.02; c.y += 0.02; clamp(c);
    S.els.push(c); renderEl(c); select(c);
  }
  function toAllPages(el) {
    commitEditing();
    pushHistory();
    let n = 0;
    for (let i = 0; i < S.file.pages; i++) {
      if (i === el.page) continue;
      const c = clone(el, i); clamp(c); S.els.push(c); renderEl(c); n++;
    }
    toast(`Auf ${n} weitere Seite(n) kopiert.`);
  }

  // ---------- Placement on the visible page
  function visiblePage() {
    const vr = box.getBoundingClientRect();
    let best = 0, bestA = -1;
    $$('.ed-page', box).forEach((p, i) => {
      const r = p.getBoundingClientRect();
      const a = Math.max(0, Math.min(r.bottom, vr.bottom) - Math.max(r.top, vr.top));
      if (a > bestA) { bestA = a; best = i; }
    });
    const r = $$('.ed-page', box)[best].getBoundingClientRect();
    const cy = (Math.max(r.top, vr.top) + Math.min(r.bottom, vr.bottom)) / 2;
    return { page: best, fy: Math.min(0.9, Math.max(0.1, (cy - r.top) / r.height)) };
  }

  function placeImage(dataUrl, widthPt, extra = {}) {
    if (!S.file) return toast('Bitte zuerst ein PDF öffnen.', 'error');
    const img = new Image();
    img.onload = () => {
      const { page, fy } = visiblePage();
      const [pw, ph] = pageSize(page);
      const w = Math.min(widthPt, pw * 0.8);
      const hh = (w * img.naturalHeight) / img.naturalWidth;
      add({ type: 'image', image: dataUrl, page, x: 0.5 - w / pw / 2, y: fy - hh / ph / 2, w: w / pw, h: hh / ph, ...extra });
      setTool('select');
    };
    img.src = dataUrl;
  }

  function pickImage() {
    if (!S.file) return toast('Bitte zuerst ein PDF öffnen.', 'error');
    const inp = h('input', { type: 'file', accept: 'image/*' });
    inp.onchange = () => {
      const f = inp.files[0];
      if (!f) return;
      const img = new Image();
      img.onload = () => {
        const max = 2000, s = Math.min(1, max / Math.max(img.width, img.height));
        const c = h('canvas', { width: Math.round(img.width * s), height: Math.round(img.height * s) });
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const isPng = /png|gif|webp/.test(f.type);
        placeImage(c.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.9), 200);
        URL.revokeObjectURL(img.src);
      };
      img.src = URL.createObjectURL(f);
    };
    inp.click();
  }

  function addDate() {
    if (!S.file) return toast('Bitte zuerst ein PDF öffnen.', 'error');
    const { page, fy } = visiblePage();
    const d = defaults.text;
    const el = add({ type: 'text', text: new Date().toLocaleDateString(I18N.lang === 'en' ? 'en-GB' : 'de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      size: d.size, color: d.color, font: d.font, bold: false, italic: false, align: 'left', page, x: 0.4, y: fy, w: 0.1, h: 0.02 });
    measure(el);
    setTool('select');
  }

  // ---------- Keyboard & zoom
  document.addEventListener('keydown', (e) => {
    if ($('#editor').classList.contains('hidden') || $('#sig-dialog').open) return;
    if (e.target.matches('input, textarea, select, [contenteditable="true"]')) return;
    const el = S.sel;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if (!el) {
      if (e.key.toLowerCase() === 't') setTool('text');
      if (e.key.toLowerCase() === 'v' || e.key === 'Escape') setTool('select');
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeEl(el); }
    else if (e.key === 'Escape') select(null);
    else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(el); }
    else if (e.key === 'Enter' && el.type === 'text') { e.preventDefault(); startEditing(el); }
    else if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const st = (e.shiftKey ? 10 : 1) / 600;
      pushHistory();
      if (e.key === 'ArrowLeft') el.x -= st; if (e.key === 'ArrowRight') el.x += st;
      if (e.key === 'ArrowUp') el.y -= st; if (e.key === 'ArrowDown') el.y += st;
      clamp(el); renderEl(el);
    }
  });
  const zoom = (f) => { commitEditing(); S.zoom = Math.min(3, Math.max(0.4, S.zoom * f)); const sel = S.sel; renderPages(); if (sel) select(sel); };
  $('#ed-zoom-in').addEventListener('click', () => zoom(1.2));
  $('#ed-zoom-out').addEventListener('click', () => zoom(1 / 1.2));
  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (!$('#editor').classList.contains('hidden') && S.file) { commitEditing(); renderPages(); } }, 250); });

  // ---------- Saving
  $('#ed-scan').addEventListener('change', (e) => $('#ed-scan-opts').classList.toggle('hidden', !e.target.checked));
  $('#ed-save').addEventListener('click', async () => {
    if (!S.file) return toast('Bitte zuerst ein PDF öffnen.', 'error');
    commitEditing();
    S.els.filter((e) => e.type === 'text').forEach(measure);
    const scan = $('#ed-scan').checked;
    if (!S.els.length && !scan) return toast('Noch nichts eingefügt.', 'error');
    const elements = S.els.map(({ id, ...rest }) => ({ ...rest, lineHeight: 1.2 }));
    busy(true, scan ? 'Wird gespeichert & „eingescannt“ …' : 'Wird gespeichert …');
    try {
      const res = await api.run('edit', [S.file], { elements, scan: { enabled: scan, intensity: $('#ed-scan-int').value, color: $('#ed-scan-color').value } });
      showResult($('#ed-result'), res);
    } catch (err) { toast(err.message, 'error'); }
    busy(false);
  });

  // ---------------------------------------------------------------- Signature
  const dlg = $('#sig-dialog');
  const cv = $('#sig-canvas');
  const ctx = cv.getContext('2d');
  let sigTab = 'draw', penColor = '#111111', drawn = false, typedFont = null, uploaded = null;
  const SIG_FONTS = ['Great Vibes', 'Dancing Script', 'Allura', 'Snell Roundhand', 'Bradley Hand', 'Apple Chancery', 'Brush Script MT', 'Savoye LET', 'Zapfino', 'Noteworthy', 'Segoe Script', 'cursive'];
  const SIG_KEY = 'pdfw-signatures';
  const loadSigs = () => { try { return JSON.parse(localStorage.getItem(SIG_KEY)) || []; } catch { return []; } };
  const saveSigs = (a) => { try { localStorage.setItem(SIG_KEY, JSON.stringify(a.slice(0, 8))); } catch { /* storage full */ } };

  function openSig() {
    if (!S.file) { S.pendingSig = true; return toast('Bitte zuerst das PDF öffnen, das unterschrieben werden soll.'); }
    clearCanvas();
    renderSaved();
    renderFonts();
    dlg.showModal();
  }
  function renderSaved() {
    const box_ = $('#sig-saved');
    box_.innerHTML = '';
    const sigs = loadSigs();
    if (!sigs.length) return;
    box_.append(h('small', { class: 'muted' }, 'Gespeicherte Unterschriften – anklicken zum Einfügen:'));
    box_.append(h('div', { class: 'sig-list' }, sigs.map((s, i) => h('div', { class: 'sig-item' },
      h('img', { src: s, alt: '', onclick: () => { dlg.close(); placeImage(s, 150, { sig: true }); } }),
      h('button', { type: 'button', title: 'Löschen', onclick: () => { const a = loadSigs(); a.splice(i, 1); saveSigs(a); renderSaved(); } }, '×')))));
  }
  $$('.tabs button', dlg).forEach((b) => b.addEventListener('click', () => {
    sigTab = b.dataset.tab;
    $$('.tabs button', dlg).forEach((x) => x.classList.toggle('active', x === b));
    $$('.tab', dlg).forEach((x) => x.classList.toggle('hidden', x.dataset.tab !== sigTab));
  }));

  // Draw
  function clearCanvas() { ctx.clearRect(0, 0, cv.width, cv.height); drawn = false; }
  $('#sig-clear').addEventListener('click', clearCanvas);
  $$('.swatch', dlg).forEach((s) => s.addEventListener('click', () => {
    penColor = s.dataset.color;
    $$('.swatch', dlg).forEach((x) => x.classList.toggle('active', x === s));
    renderFonts();
  }));
  let pts = [];
  const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height, t: performance.now() }; };
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); pts = [pos(e)]; drawn = true; });
  cv.addEventListener('pointermove', (e) => {
    if (!pts.length) return;
    const p = pos(e);
    const last = pts[pts.length - 1];
    pts.push(p);
    const base = +$('#sig-width').value * 1.6;
    const speed = Math.hypot(p.x - last.x, p.y - last.y) / Math.max(1, p.t - last.t);
    ctx.lineWidth = Math.max(base * 0.45, base * (1.15 - Math.min(speed, 3) * 0.25));
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.strokeStyle = penColor;
    if (pts.length < 3) return;
    const a = pts[pts.length - 3], b = pts[pts.length - 2];
    ctx.beginPath();
    ctx.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2);
    ctx.quadraticCurveTo(b.x, b.y, (b.x + p.x) / 2, (b.y + p.y) / 2);
    ctx.stroke();
  });
  const endStroke = () => {
    if (pts.length === 1 || pts.length === 2) { // dot
      ctx.fillStyle = penColor; ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, +$('#sig-width').value * 0.8, 0, 7); ctx.fill();
    }
    pts = [];
  };
  cv.addEventListener('pointerup', endStroke);
  cv.addEventListener('pointercancel', endStroke);

  // Type
  // Only offer fonts that actually exist on this device (otherwise the fallback font appears several times)
  const WEB_FONTS = new Set(['Great Vibes', 'Dancing Script', 'Allura', 'cursive']);
  let usableFonts = null;
  function fontAvailable(f) {
    if (WEB_FONTS.has(f)) return true;
    const c = document.createElement('canvas').getContext('2d');
    const w = (font) => { c.font = font; return c.measureText('Mauro Casellini 123 Wg').width; };
    return ['monospace', 'serif', 'sans-serif'].some((fb) => w(`40px "${f}", ${fb}`) !== w(`40px ${fb}`));
  }
  function renderFonts() {
    const list = $('#sig-fonts');
    const name = $('#sig-name').value || i18n('Max Muster');
    list.innerHTML = '';
    usableFonts = usableFonts || SIG_FONTS.filter(fontAvailable).filter((f) => f !== 'cursive');
    if (!usableFonts.includes(typedFont)) typedFont = usableFonts[0];
    usableFonts.forEach((f) => list.append(h('button', { type: 'button', class: 'sig-font' + (typedFont === f ? ' active' : ''), style: { fontFamily: `"${f}", cursive`, color: penColor }, onclick: () => { typedFont = f; renderFonts(); } }, name)));
  }
  $('#sig-name').addEventListener('input', renderFonts);

  // Upload
  $('#sig-upload').addEventListener('change', (e) => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { uploaded = r.result; $('#sig-upload-img').src = uploaded; }; r.readAsDataURL(f); });

  function trim(canvas, pad = 8) {
    const c = canvas.getContext('2d');
    const { data, width, height } = c.getImageData(0, 0, canvas.width, canvas.height);
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] > 8) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < 0) return null;
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(width - 1, x1 + pad); y1 = Math.min(height - 1, y1 + pad);
    const out = h('canvas', { width: x1 - x0 + 1, height: y1 - y0 + 1 });
    out.getContext('2d').drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  }

  function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }

  $('#sig-use').addEventListener('click', async () => {
    let url = null;
    if (sigTab === 'draw') {
      if (!drawn) return toast('Bitte zuerst unterschreiben.', 'error');
      url = trim(cv);
    } else if (sigTab === 'type') {
      const name = $('#sig-name').value.trim();
      if (!name) return toast('Bitte Namen eingeben.', 'error');
      const c = h('canvas', { width: 2000, height: 500 });
      const x = c.getContext('2d');
      const font = typedFont || (usableFonts || SIG_FONTS)[0];
      await document.fonts.load(`150px "${font}"`).catch(() => {});
      x.font = `150px "${font}", cursive`;
      x.fillStyle = penColor;
      x.textBaseline = 'middle';
      x.fillText(name, 40, 250, 1920);
      url = trim(c);
    } else {
      if (!uploaded) return toast('Bitte ein Bild wählen.', 'error');
      const img = await loadImg(uploaded);
      const s = Math.min(1, 1600 / img.width);
      const c = h('canvas', { width: Math.round(img.width * s), height: Math.round(img.height * s) });
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0, c.width, c.height);
      if ($('#sig-transparent').checked) {
        const d = x.getImageData(0, 0, c.width, c.height);
        for (let i = 0; i < d.data.length; i += 4) {
          const l = 0.3 * d.data[i] + 0.59 * d.data[i + 1] + 0.11 * d.data[i + 2];
          d.data[i + 3] = l > 200 ? 0 : l > 140 ? Math.round(255 * (200 - l) / 60) : 255;
        }
        x.putImageData(d, 0, 0);
      }
      url = trim(c) || c.toDataURL('image/png');
    }
    if (!url) return toast('Die Unterschrift ist leer.', 'error');
    if ($('#sig-remember').checked) { const a = loadSigs(); if (!a.includes(url)) a.unshift(url); saveSigs(a); }
    dlg.close();
    placeImage(url, 150, { sig: true });
  });

  return { open };
})();

route();
