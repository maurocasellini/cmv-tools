/* Doc Scanner: photo → corners → straightened “scan” → PDF (optionally searchable via OCR).
   Everything happens in this tab; images never leave the device. */
(() => {
  const { $, toast, busy, download, share, fmtSize } = window.CMV;
  const t = (s) => window.i18n(s);

  const SRC_MAX = 3200;     // longest side of a photo kept in memory
  const OUT_MAX = 2800;     // longest side of the straightened page
  const QUALITY = { small: [1500, 0.7], normal: [2200, 0.8], high: [2800, 0.88] };
  const PAGE = { a4: [595.28, 841.89], letter: [612, 792] };

  const pages = [];         // { id, src: canvas, corners, rotate, out: { blob, url, w, h } | null, busy }
  let filter = 'color';
  let seq = 0;

  // ---------------------------------------------------------------- OpenCV worker
  let cvWorker = null;
  const pending = new Map();
  function cv(cmd, args, transfer = []) {
    if (!cvWorker) {
      cvWorker = new Worker('cv-worker.js');
      cvWorker.onmessage = (e) => {
        const p = pending.get(e.data.id);
        pending.delete(e.data.id);
        if (e.data.ok) p.resolve(e.data.res); else p.reject(new Error(e.data.error));
      };
      cvWorker.onerror = (e) => { for (const p of pending.values()) p.reject(new Error(e.message || 'Worker-Fehler')); pending.clear(); };
    }
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      cvWorker.postMessage({ id, cmd, args }, transfer);
    });
  }
  const warmUp = () => { cv('load').catch(() => {}); };

  // ---------------------------------------------------------------- Images
  async function decode(file) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      const url = URL.createObjectURL(file);
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        return img;
      } finally { URL.revokeObjectURL(url); }
    }
  }

  function toCanvas(img, maxSide) {
    const w0 = img.width || img.naturalWidth, h0 = img.height || img.naturalHeight;
    const s = Math.min(1, maxSide / Math.max(w0, h0));
    const c = document.createElement('canvas');
    c.width = Math.round(w0 * s); c.height = Math.round(h0 * s);
    const g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  function pixels(canvas, maxSide) {
    const c = maxSide && Math.max(canvas.width, canvas.height) > maxSide ? toCanvas(canvas, maxSide) : canvas;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height);
    return { data: d.data, width: d.width, height: d.height };
  }

  function canvasToBlob(c, type, q) {
    return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Bild konnte nicht erstellt werden.'))), type, q));
  }

  const FULL = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  const INSET = [{ x: 0.04, y: 0.04 }, { x: 0.96, y: 0.04 }, { x: 0.96, y: 0.96 }, { x: 0.04, y: 0.96 }];

  async function detect(page) {
    const px = pixels(page.src, 900);
    const { corners } = await cv('detect', { ...px, allowFull: !page.live }, [px.data.buffer]);
    return corners;
  }

  async function render(page) {
    page.busy = true;
    drawGrid();
    try {
      const px = pixels(page.src);
      const res = await cv('process', { ...px, corners: page.corners || FULL, filter, rotate: page.rotate, maxSide: OUT_MAX }, [px.data.buffer]);
      const c = document.createElement('canvas');
      c.width = res.width; c.height = res.height;
      c.getContext('2d').putImageData(new ImageData(res.data, res.width, res.height), 0, 0);
      const blob = await canvasToBlob(c, 'image/jpeg', 0.9);
      if (page.out) URL.revokeObjectURL(page.out.url);
      page.out = { blob, url: URL.createObjectURL(blob), w: res.width, h: res.height };
      invalidateResult();
    } catch (e) {
      toast(t('Seite konnte nicht verarbeitet werden: ') + e.message, true);
    } finally {
      page.busy = false;
      drawGrid();
    }
  }

  // Render one page after the other (the worker is single-threaded anyway)
  let queue = Promise.resolve();
  const enqueue = (page) => (queue = queue.then(() => (pages.includes(page) ? render(page) : null)));

  // ---------------------------------------------------------------- Adding photos
  async function addFiles(files) {
    files = [...files].filter((f) => f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name));
    if (!files.length) return;
    warmUp();
    const added = [];
    busy(t('Fotos werden geladen …'));
    for (const f of files) {
      try {
        const img = await decode(f);
        const src = toCanvas(img, SRC_MAX);
        if (img.close) img.close();
        const page = { id: ++seq, src, corners: null, rotate: 0, out: null, busy: true };
        pages.push(page);
        added.push(page);
      } catch {
        toast(t('Dieses Bildformat kann der Browser nicht öffnen: ') + f.name, true);
      }
    }
    busy(false);
    if (!added.length) return;
    showPages();
    if (added.length === 1) {
      openCrop(added[0], true);
    } else {
      busy(t('Kanten werden erkannt …'));
      for (const p of added) {
        try { p.corners = (await detect(p)) || INSET; } catch (e) { p.corners = INSET; }
      }
      busy(false);
      added.forEach(enqueue);
    }
  }

  document.querySelectorAll('[data-pick]').forEach((inp) => {
    inp.addEventListener('click', warmUp);
    inp.addEventListener('change', () => { addFiles(inp.files); inp.value = ''; });
  });
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); if (ev === 'drop' || !e.relatedTarget) drop.classList.remove('over'); }));
  document.addEventListener('drop', (e) => { if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });

  // ---------------------------------------------------------------- Views
  function showPages() {
    $('#start').classList.add('hidden');
    $('#about').classList.add('hidden');
    $('#pages').classList.remove('hidden');
    if (!$('#name').value) $('#name').value = defaultName();
  }
  function showStart() {
    $('#pages').classList.add('hidden');
    $('#about').classList.add('hidden');
    $('#start').classList.remove('hidden');
  }
  function route() {
    if (location.hash === '#about') {
      $('#start').classList.add('hidden'); $('#pages').classList.add('hidden'); $('#about').classList.remove('hidden');
      window.scrollTo(0, 0);
    } else if (pages.length) showPages(); else showStart();
  }
  window.addEventListener('hashchange', route);

  function defaultName() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `Scan ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}`;
  }

  // ---------------------------------------------------------------- Page grid
  const grid = $('#grid');
  function drawGrid() {
    const n = pages.length;
    $('#pages-title').textContent = n === 1 ? t('1 Seite') : `${n} ${t('Seiten')}`;
    grid.textContent = '';
    pages.forEach((p, i) => {
      const el = document.createElement('div');
      el.className = 'page';
      el.innerHTML = `
        <button type="button" class="thumb" title="${t('Ecken anpassen')}">${p.out && !p.busy ? `<img alt="" src="${p.out.url}">` : '<div class="spinner"></div>'}<span class="num">${i + 1}</span></button>
        <div class="page-tools">
          <button type="button" data-a="left" title="${t('Nach vorne')}" ${i === 0 ? 'disabled' : ''}>←</button>
          <button type="button" data-a="rotate" title="${t('Drehen')}">↻</button>
          <button type="button" data-a="right" title="${t('Nach hinten')}" ${i === n - 1 ? 'disabled' : ''}>→</button>
          <button type="button" data-a="del" class="del" title="${t('Seite löschen')}">✕</button>
        </div>`;
      el.querySelector('.thumb').addEventListener('click', () => openCrop(p));
      el.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => pageAction(p, b.dataset.a)));
      grid.append(el);
    });
    $('#make').disabled = !n || pages.some((p) => p.busy || !p.out);
  }

  function pageAction(p, a) {
    const i = pages.indexOf(p);
    if (a === 'left' && i > 0) [pages[i - 1], pages[i]] = [pages[i], pages[i - 1]];
    else if (a === 'right' && i < pages.length - 1) [pages[i + 1], pages[i]] = [pages[i], pages[i + 1]];
    else if (a === 'rotate') { p.rotate = (p.rotate + 90) % 360; enqueue(p); }
    else if (a === 'del') {
      pages.splice(i, 1);
      if (p.out) URL.revokeObjectURL(p.out.url);
      if (!pages.length) { reset(); return; }
    }
    invalidateResult();
    drawGrid();
  }

  document.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => {
    if (filter === b.dataset.filter) return;
    filter = b.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach((x) => x.classList.toggle('active', x === b));
    pages.forEach(enqueue);
  }));

  function reset() {
    pages.splice(0).forEach((p) => p.out && URL.revokeObjectURL(p.out.url));
    invalidateResult();
    $('#name').value = '';
    if (location.hash) history.replaceState(null, '', location.pathname);
    showStart();
    window.scrollTo(0, 0);
  }
  $('#restart').addEventListener('click', () => { if (confirm(t('Alle Seiten verwerfen und neu beginnen?'))) reset(); });

  // ---------------------------------------------------------------- Crop editor
  const crop = $('#crop'), stage = $('#stage'), canvas = $('#crop-canvas'), svg = $('#crop-svg'), loupe = $('#loupe');
  let cur = null, pts = null, view = null, isNew = false;

  async function openCrop(page, fresh = false) {
    cur = page; isNew = fresh;
    pts = (page.corners || INSET).map((p) => ({ ...p }));
    crop.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    layout();
    if (!page.corners) {
      $('#crop-busy').classList.remove('hidden');
      try {
        const c = await detect(page);
        if (cur === page) { pts = (c || INSET).map((p) => ({ ...p })); if (!c) toast(t('Keine Blattkanten gefunden – bitte Ecken von Hand setzen.')); }
      } catch (e) {
        toast(t('Kantenerkennung nicht verfügbar: ') + e.message, true);
      } finally {
        $('#crop-busy').classList.add('hidden');
      }
      drawQuad();
    }
  }

  function closeCrop() {
    crop.classList.add('hidden');
    document.body.style.overflow = '';
    cur = null;
  }

  function layout() {
    if (!cur) return;
    const r = stage.getBoundingClientRect();
    const pad = 22;
    const s = Math.min((r.width - 2 * pad) / cur.src.width, (r.height - 2 * pad) / cur.src.height);
    const w = Math.round(cur.src.width * s), h = Math.round(cur.src.height * s);
    view = { x: Math.round((r.width - w) / 2), y: Math.round((r.height - h) / 2), w, h };
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = w * dpr; canvas.height = h * dpr;
    Object.assign(canvas.style, { left: view.x + 'px', top: view.y + 'px', width: w + 'px', height: h + 'px' });
    const g = canvas.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(cur.src, 0, 0, canvas.width, canvas.height);
    drawQuad();
  }
  window.addEventListener('resize', layout);

  const toScreen = (p) => ({ x: view.x + p.x * view.w, y: view.y + p.y * view.h });
  function drawQuad() {
    if (!view) return;
    const r = stage.getBoundingClientRect();
    const S = pts.map(toScreen);
    const poly = S.map((p) => `${p.x},${p.y}`).join(' ');
    const mids = S.map((p, i) => { const q = S[(i + 1) % 4]; return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, i }; });
    svg.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
    svg.innerHTML = `
      <path class="shade" d="M${view.x},${view.y}h${view.w}v${view.h}h${-view.w}z M${S.map((p) => `${p.x},${p.y}`).join(' L')}z"/>
      <polygon class="edge" points="${poly}"/>
      ${mids.map((m) => `<rect class="mid" data-m="${m.i}" x="${m.x - 9}" y="${m.y - 4}" width="18" height="8" rx="4" transform="rotate(${angle(S[m.i], S[(m.i + 1) % 4])} ${m.x} ${m.y})"/>`).join('')}
      ${S.map((p, i) => `<circle class="handle${drag && drag.i === i ? ' active' : ''}" data-i="${i}" cx="${p.x}" cy="${p.y}" r="15"/>`).join('')}`;
  }
  const angle = (a, b) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;

  // Dragging: corners move freely, edge handles move both corners of that edge
  let drag = null;
  svg.addEventListener('pointerdown', (e) => {
    const r = stage.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    // nearest corner within reach (generous touch target)
    const S = pts.map(toScreen);
    let best = -1, bd = 44;
    S.forEach((p, i) => { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = i; } });
    if (best >= 0) drag = { i: best, ox: S[best].x - x, oy: S[best].y - y };
    else if (e.target.dataset.m != null) {
      const i = +e.target.dataset.m;
      drag = { m: i, x, y, start: pts.map((p) => ({ ...p })) };
    } else return;
    svg.setPointerCapture(e.pointerId);
    e.preventDefault();
    move(e);
  });
  svg.addEventListener('pointermove', (e) => { if (drag) move(e); });
  const end = () => { drag = null; loupe.classList.add('hidden'); drawQuad(); };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);

  const clamp = (v) => Math.min(1, Math.max(0, v));
  function move(e) {
    const r = stage.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (drag.i != null) {
      const p = { x: clamp((x + drag.ox - view.x) / view.w), y: clamp((y + drag.oy - view.y) / view.h) };
      pts[drag.i] = p;
      showLoupe(p, x, y);
    } else {
      const dx = (x - drag.x) / view.w, dy = (y - drag.y) / view.h;
      for (const k of [drag.m, (drag.m + 1) % 4]) pts[k] = { x: clamp(drag.start[k].x + dx), y: clamp(drag.start[k].y + dy) };
    }
    drawQuad();
  }

  // Magnifier next to the finger so the corner can be placed precisely
  function showLoupe(p, fx, fy) {
    const L = 120, zoom = 2.5;
    const g = loupe.getContext('2d');
    const sx = p.x * cur.src.width, sy = p.y * cur.src.height;
    const span = (L / zoom) * (cur.src.width / view.w);
    g.fillStyle = '#151a2a';
    g.fillRect(0, 0, L, L);
    g.drawImage(cur.src, sx - span / 2, sy - span / 2, span, span, 0, 0, L, L);
    g.strokeStyle = '#c47d45'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(L / 2, 0); g.lineTo(L / 2, L); g.moveTo(0, L / 2); g.lineTo(L, L / 2); g.stroke();
    const r = stage.getBoundingClientRect();
    let lx = fx - L - 30, ly = fy - L - 30;
    if (lx < 4) lx = fx + 30;
    if (ly < 4) ly = fy + 30;
    loupe.style.left = Math.min(lx, r.width - L - 4) + 'px';
    loupe.style.top = Math.min(ly, r.height - L - 4) + 'px';
    loupe.classList.remove('hidden');
  }

  $('#crop-full').addEventListener('click', () => { pts = FULL.map((p) => ({ ...p })); drawQuad(); });
  $('#crop-auto').addEventListener('click', async () => {
    $('#crop-busy').classList.remove('hidden');
    try {
      const c = await detect(cur);
      if (c) pts = c; else toast(t('Keine Blattkanten gefunden – bitte Ecken von Hand setzen.'));
    } catch (e) { toast(e.message, true); }
    $('#crop-busy').classList.add('hidden');
    drawQuad();
  });
  $('#crop-cancel').addEventListener('click', () => {
    const p = cur;
    closeCrop();
    if (isNew && p && !p.out) {          // a fresh photo that was never accepted: drop it
      pages.splice(pages.indexOf(p), 1);
      if (!pages.length) { reset(); return; }
    }
    drawGrid();
  });
  $('#crop-ok').addEventListener('click', () => {
    const p = cur;
    p.corners = pts.map((q) => ({ ...q }));
    closeCrop();
    enqueue(p);
  });
  document.addEventListener('keydown', (e) => {
    if (crop.classList.contains('hidden')) return;
    if (e.key === 'Escape') $('#crop-cancel').click();
    if (e.key === 'Enter') $('#crop-ok').click();
  });

  // ---------------------------------------------------------------- PDF export
  let result = null;
  function invalidateResult() {
    result = null;
    $('#result').classList.add('hidden');
  }

  async function exportJpeg(page, quality) {
    const [maxSide, q] = QUALITY[quality];
    const { w, h } = page.out;
    if (quality === 'high' && Math.max(w, h) <= maxSide) return { blob: page.out.blob, w, h };
    const img = await decode(page.out.blob);
    const c = toCanvas(img, maxSide);
    if (img.close) img.close();
    if (filter === 'bw' || filter === 'gray') {   // keep files small: store gray pages as grayscale-looking JPEG
      const g = c.getContext('2d');
      g.globalCompositeOperation = 'saturation';
      g.fillStyle = '#000';
      g.fillRect(0, 0, c.width, c.height);
    }
    return { blob: await canvasToBlob(c, 'image/jpeg', q), w: c.width, h: c.height };
  }

  let ocrWorker = null, ocrLang = null;
  async function getOcr(langs) {
    if (ocrWorker && ocrLang === langs) return ocrWorker;
    if (ocrWorker) { await ocrWorker.terminate(); ocrWorker = null; }
    if (!window.Tesseract) {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'vendor/tesseract/tesseract.min.js';
        s.onload = res; s.onerror = () => rej(new Error(t('Texterkennung konnte nicht geladen werden.')));
        document.head.append(s);
      });
    }
    const base = new URL('vendor/', location.href).href;
    ocrWorker = await window.Tesseract.createWorker(langs.split('+'), 1, {
      workerPath: base + 'tesseract/worker.min.js',
      corePath: base + 'tesseract',
      langPath: base + 'tessdata',
      workerBlobURL: false,
      gzip: true,
      logger: (m) => {
        if (m.status && /loading|initializ/i.test(m.status) && ocrProgress) ocrProgress(m);
      },
    });
    ocrLang = langs;
    return ocrWorker;
  }
  let ocrProgress = null;

  $('#ocr').addEventListener('change', () => $('.ocr-lang').classList.toggle('hidden', !$('#ocr').checked));
  $('#ocr-lang').value = (window.I18N && window.I18N.lang === 'en') ? 'eng' : 'deu+eng';
  ['#size', '#quality', '#ocr', '#ocr-lang', '#name'].forEach((s) => $(s).addEventListener('change', invalidateResult));

  $('#make').addEventListener('click', async () => {
    if (!pages.length || pages.some((p) => !p.out)) return;
    if (!window.PDFLib) { toast(t('PDF-Bibliothek wird noch geladen …')); return; }
    const { PDFDocument } = window.PDFLib;
    const size = $('#size').value, quality = $('#quality').value, ocr = $('#ocr').checked;
    let name = ($('#name').value.trim() || defaultName()).replace(/[\\/:*?"<>|]+/g, '-');
    if (!/\.pdf$/i.test(name)) name += '.pdf';
    let words = 0, text = [];
    try {
      busy(t('PDF wird erstellt …'), 0);
      let worker = null;
      if (ocr) {
        ocrProgress = () => busy(t('Texterkennung wird geladen …'), 0);
        busy(t('Texterkennung wird geladen …'), 0);
        worker = await getOcr($('#ocr-lang').value);
      }
      const doc = await PDFDocument.create();
      doc.setTitle(name.replace(/\.pdf$/i, ''));
      doc.setCreator('Doc Scanner – CM Ventures');
      doc.setProducer('Doc Scanner (pdf-lib, Tesseract)');
      for (let i = 0; i < pages.length; i++) {
        busy(`${t('Seite')} ${i + 1} / ${pages.length}${ocr ? ' · ' + t('Text wird erkannt …') : ''}`, i / pages.length);
        const { blob, w, h } = await exportJpeg(pages[i], quality);
        const img = await doc.embedJpg(new Uint8Array(await blob.arrayBuffer()));
        let pw, ph;
        if (size === 'fit') { const s = 841.89 / Math.max(w, h); pw = w * s; ph = h * s; }
        else { [pw, ph] = PAGE[size]; if (w > h) [pw, ph] = [ph, pw]; }
        const s = Math.min(pw / w, ph / h);
        const iw = w * s, ih = h * s, x = (pw - iw) / 2, y = (ph - ih) / 2;
        const pg = doc.addPage([pw, ph]);
        pg.drawImage(img, { x, y, width: iw, height: ih });
        if (worker) {
          const dpi = String(Math.max(70, Math.round(w / (iw / 72))));
          await worker.setParameters({ user_defined_dpi: dpi });
          const { data } = await worker.recognize(blob, { pdfTitle: name, pdfTextOnly: true }, { text: true, pdf: true });
          if (data.text) { text.push(data.text.trim()); words += data.text.split(/\s+/).filter(Boolean).length; }
          if (data.pdf) {
            const [layer] = await doc.embedPdf(new Uint8Array(data.pdf));
            pg.drawPage(layer, { x, y, width: iw, height: ih });
          }
        }
      }
      busy(t('PDF wird gespeichert …'), 1);
      const bytes = await doc.save();
      result = { blob: new Blob([bytes], { type: 'application/pdf' }), name, text: text.join('\n\n') };
      $('#res-name').textContent = name;
      const meta = [`${pages.length} ${pages.length === 1 ? t('Seite') : t('Seiten')}`, fmtSize(result.blob.size)];
      if (ocr) meta.push(words ? `${words} ${t('Wörter erkannt')}` : t('Kein Text erkannt'));
      $('#res-meta').textContent = meta.join(' · ');
      $('#res-text').classList.toggle('hidden', !words);
      $('#res-text-box').classList.toggle('hidden', !words);
      $('#res-text-pre').textContent = result.text;
      $('#result').classList.remove('hidden');
      $('#result').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {
      console.error(e);
      toast(t('PDF konnte nicht erstellt werden: ') + e.message, true);
    } finally {
      ocrProgress = null;
      busy(false);
    }
  });

  $('#res-share').addEventListener('click', () => result && share(result.blob, result.name));
  $('#res-dl').addEventListener('click', () => result && download(result.blob, result.name));
  $('#res-text').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(result.text); toast(t('Text kopiert.')); }
    catch { toast(t('Kopieren nicht möglich – Text bitte im Feld markieren.'), true); }
  });
  // The share sheet only makes sense on phones/tablets
  if (!(navigator.canShare && navigator.canShare({ files: [new File([''], 'a.pdf', { type: 'application/pdf' })] }))) {
    $('#res-share').classList.add('hidden');
    $('#res-dl').classList.add('primary');
  }

  // ---------------------------------------------------------------- Live scan (camera)
  // The page is detected in the video several times per second. When it has been held still for a moment
  // the frame is captured; the next capture waits until the page was moved or replaced.
  const cam = $('#cam'), video = $('#cam-video'), camSvg = $('#cam-svg'), hint = $('#cam-hint');
  const LIVE_SIDE = 640, STEADY_MS = 900, STILL = 0.02, MOVED = 0.15, CHANGED = 22;
  const SAME_PAGE = 0.9, NEW_PAGE = 0.8;   // fingerprint correlation: above = already scanned, below = clearly another page
  let stream = null, camTimer = 0, camPages = [];
  let live = null;   // { quad, steadySince, gone, missing, ref, refSig, lastShot, fps }

  const camSupported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  if (camSupported) {
    document.querySelectorAll('.cam-open').forEach((b) => { b.classList.remove('hidden'); b.addEventListener('click', openCam); });
    document.querySelectorAll('.photo-pick').forEach((b) => b.classList.remove('primary'));
  }

  const quadDist = (a, b) => Math.max(...a.map((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y)));

  function frameCanvas(maxSide) {
    const w0 = video.videoWidth, h0 = video.videoHeight;
    const s = Math.min(1, maxSide / Math.max(w0, h0));
    const c = document.createElement('canvas');
    c.width = Math.round(w0 * s); c.height = Math.round(h0 * s);
    c.getContext('2d', { willReadFrequently: true }).drawImage(video, 0, 0, c.width, c.height);
    return c;
  }
  // 16×16 grayscale fingerprint of the frame: tells a new page from the one just captured
  function signature(c) {
    const s = document.createElement('canvas');
    s.width = s.height = 16;
    const g = s.getContext('2d', { willReadFrequently: true });
    g.drawImage(c, 0, 0, 16, 16);
    const d = g.getImageData(0, 0, 16, 16).data, out = new Float32Array(256);
    for (let i = 0; i < 256; i++) out[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
    return out;
  }
  const sigDiff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };

  // Page fingerprint: the page straightened to 96×132, ink relative to the local paper brightness (so light and
  // shadows do not matter), averaged into a coarse 16×22 grid. Two views of the same page correlate strongly.
  function homography(dst) {
    // maps the unit square (0,0)(1,0)(1,1)(0,1) to the four points dst
    const [p0, p1, p2, p3] = dst;
    const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dy1 = p1.y - p2.y, dy2 = p3.y - p2.y;
    const sx = p0.x - p1.x + p2.x - p3.x, sy = p0.y - p1.y + p2.y - p3.y;
    const den = dx1 * dy2 - dx2 * dy1 || 1e-9;
    const g = (sx * dy2 - dx2 * sy) / den, h = (dx1 * sy - sx * dy1) / den;
    return [p1.x - p0.x + g * p1.x, p3.x - p0.x + h * p3.x, p0.x, p1.y - p0.y + g * p1.y, p3.y - p0.y + h * p3.y, p0.y, g, h];
  }
  function fingerprint(frame, q) {
    const W = frame.width, H = frame.height, FW = 96, FH = 132;
    const d = frame.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
    const [a, b, c, e, f, g2, g, h] = homography(q.map((p) => ({ x: p.x * W, y: p.y * H })));
    const img = new Float32Array(FW * FH);
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
      const u = (x + 0.5) / FW, v = (y + 0.5) / FH, z = g * u + h * v + 1;
      const sx = Math.min(W - 1, Math.max(0, Math.round((a * u + b * v + c) / z))), sy = Math.min(H - 1, Math.max(0, Math.round((e * u + f * v + g2) / z)));
      const i = (sy * W + sx) * 4;
      img[y * FW + x] = (d[i] + d[i + 1] + d[i + 2]) / 3 + 1;
    }
    // local paper brightness: max over 9×9, then a 15×15 mean (separable)
    const pass = (src, r, op) => {
      const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
      for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
        let acc = op === 'max' ? 0 : 0, n = 0;
        for (let k = -r; k <= r; k++) { const xx = Math.min(FW - 1, Math.max(0, x + k)), v = src[y * FW + xx]; if (op === 'max') acc = Math.max(acc, v); else { acc += v; n++; } }
        tmp[y * FW + x] = op === 'max' ? acc : acc / n;
      }
      for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
        let acc = 0, n = 0;
        for (let k = -r; k <= r; k++) { const yy = Math.min(FH - 1, Math.max(0, y + k)), v = tmp[yy * FW + x]; if (op === 'max') acc = Math.max(acc, v); else { acc += v; n++; } }
        out[y * FW + x] = op === 'max' ? acc : acc / n;
      }
      return out;
    };
    const bg = pass(pass(img, 4, 'max'), 7, 'mean');
    const GW = 16, GH = 22, M = 4, grid = new Float32Array(GW * GH), cnt = new Float32Array(GW * GH);
    for (let y = M; y < FH - M; y++) for (let x = M; x < FW - M; x++) {
      const ink = Math.max(0, Math.min(1, 1 - img[y * FW + x] / bg[y * FW + x]));
      const gi = Math.floor(((y - M) / (FH - 2 * M)) * GH) * GW + Math.floor(((x - M) / (FW - 2 * M)) * GW);
      grid[gi] += ink; cnt[gi]++;
    }
    let mean = 0;
    for (let i = 0; i < grid.length; i++) { grid[i] /= cnt[i] || 1; mean += grid[i]; }
    mean /= grid.length;
    let sd = 0;
    for (let i = 0; i < grid.length; i++) { grid[i] -= mean; sd += grid[i] * grid[i]; }
    sd = Math.sqrt(sd / grid.length) || 1;
    for (let i = 0; i < grid.length; i++) grid[i] /= sd;
    return grid;
  }
  const fpCorr = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s / a.length; };
  // how similar is this page to the most similar one already scanned (−1 … 1)
  const scannedBefore = (fp) => (live && live.fps.length ? Math.max(...live.fps.map((x) => fpCorr(fp, x))) : -1);

  async function openCam() {
    warmUp();
    camPages = [];
    updateThumb();
    hint.textContent = t('Kamera wird gestartet …');
    cam.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
      });
    } catch (e) {
      closeCam(false);
      toast(t('Kein Zugriff auf die Kamera. Bitte im Browser erlauben – oder „Foto aufnehmen“ verwenden.'), true);
      return;
    }
    video.srcObject = stream;
    try { await video.play(); } catch { /* autoplay is allowed for muted inline video */ }
    const track = stream.getVideoTracks()[0];
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    $('#cam-torch').classList.toggle('hidden', !caps.torch);
    $('#cam-torch').classList.remove('on');
    if (caps.focusMode && caps.focusMode.includes('continuous')) track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
    live = { quad: null, steadySince: 0, gone: true, missing: 0, ref: null, refSig: null, lastShot: 0, fps: [], seen: false };
    hint.textContent = t('Bild-Software wird geladen …');
    camLoop();
  }

  function closeCam(finish = true) {
    clearTimeout(camTimer);
    camTimer = 0;
    live = null;
    if (stream) stream.getTracks().forEach((tr) => tr.stop());
    stream = null;
    video.srcObject = null;
    camSvg.innerHTML = '';
    cam.classList.add('hidden');
    document.body.style.overflow = '';
    if (!finish) return;
    const added = camPages.splice(0);
    if (!added.length) return;
    showPages();
    drawGrid();
    Promise.all(added.map((p) => p.ready)).then(() => added.forEach(enqueue));
  }

  async function camLoop() {
    if (!live) return;
    if (video.readyState >= 2 && video.videoWidth) {
      const c = frameCanvas(LIVE_SIDE);
      const px = c.getContext('2d').getImageData(0, 0, c.width, c.height);
      let corners = null;
      try { ({ corners } = await cv('detect', { data: px.data, width: c.width, height: c.height }, [px.data.buffer])); }
      catch (e) { if (live) hint.textContent = t('Kantenerkennung nicht verfügbar: ') + e.message; }
      if (live) onLive(corners, c);
    }
    if (live) camTimer = setTimeout(camLoop, 60);
  }

  function onLive(q, frame) {
    const now = performance.now();
    const L = live;
    L.seen = true;
    if (!q) {
      // the page was taken away (or covered) for a moment: the next one may be a new page
      if (++L.missing >= 3) L.gone = true;
      L.quad = null; L.steadySince = 0;
      drawLive(null, false);
      hint.textContent = L.fps.length && !L.gone ? `✓ ${t('Gescannt – nächste Seite hinlegen')}` : t('Blatt ins Bild halten');
      return;
    }
    L.missing = 0;
    if (L.quad && quadDist(q, L.quad) < STILL) { if (!L.steadySince) L.steadySince = now; }
    else L.steadySince = 0;
    L.quad = q;
    if (L.ref && (quadDist(q, L.ref) > MOVED || sigDiff(signature(frame), L.refSig) > CHANGED)) L.gone = true;
    const steady = L.steadySince && now - L.steadySince > STEADY_MS;
    let state = 'new';
    if (steady || !$('#cam-auto').checked) {
      // same content as a page already scanned? then wait for the next page
      const sim = scannedBefore(fingerprint(frame, q));
      (L.sims ||= []).push(+sim.toFixed(3));        // for automated tests
      if (L.sims.length > 60) L.sims.shift();
      if (sim > SAME_PAGE || (!L.gone && sim > NEW_PAGE)) state = 'done';
    } else if (L.fps.length && !L.gone) state = 'done';
    // a new page has to look new twice in a row (the first frames after putting it down can be blurry)
    L.newCount = steady && state === 'new' ? (L.newCount || 0) + 1 : 0;
    drawLive(q, state === 'new' && !!L.steadySince, state === 'done');
    if (state === 'done') hint.textContent = `✓ ${t('Schon gescannt – nächste Seite hinlegen')}`;
    else if (!$('#cam-auto').checked) hint.textContent = t('Blatt erkannt – jetzt auslösen');
    else if (steady && L.newCount >= 2 && now - L.lastShot > 1200) capture(q, frame);
    else hint.textContent = L.steadySince ? t('Ruhig halten …') : t('Blatt erkannt');
  }

  function drawLive(q, steady, done) {
    if (!q) { camSvg.innerHTML = ''; return; }
    const r = cam.querySelector('.cam-stage').getBoundingClientRect();
    const vw = video.videoWidth, vh = video.videoHeight;
    const s = Math.min(r.width / vw, r.height / vh);
    const w = vw * s, h = vh * s, x0 = (r.width - w) / 2, y0 = (r.height - h) / 2;
    camSvg.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
    camSvg.innerHTML = `<polygon class="${done ? 'done' : steady ? 'steady' : ''}" points="${q.map((p) => `${x0 + p.x * w},${y0 + p.y * h}`).join(' ')}"/>`;
  }

  function capture(q, frame) {
    if (!video.videoWidth) return;
    const L = live;
    const src = frameCanvas(SRC_MAX);
    const fresh = q || (L && L.quad);
    if (L && fresh) L.fps.push(fingerprint(frame || frameCanvas(LIVE_SIDE), fresh));
    const page = { id: ++seq, src, corners: fresh ? fresh.map((p) => ({ ...p })) : null, rotate: 0, out: null, busy: true, live: true };
    pages.push(page);
    camPages.push(page);
    if (L) {
      L.gone = false; L.newCount = 0; L.ref = fresh; L.refSig = signature(frame || frameCanvas(LIVE_SIDE)); L.lastShot = performance.now(); L.steadySince = 0;
      hint.textContent = `${t('Seite')} ${camPages.length} ✓`;
    }
    const fl = $('#cam-flash');
    fl.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => fl.classList.remove('on')));
    if (navigator.vibrate) navigator.vibrate(30);
    updateThumb(src);
    // Refine the corners on the full-resolution frame (more precise than the small live image)
    page.ready = detect(page).then((c) => {
      if (c && (!page.corners || quadDist(c, page.corners) < 0.06)) page.corners = c;
      else if (!page.corners) page.corners = c || INSET;
    }).catch(() => { if (!page.corners) page.corners = INSET; });
  }

  function updateThumb(src) {
    const th = $('#cam-thumb');
    if (!camPages.length) { th.removeAttribute('data-n'); th.style.backgroundImage = ''; return; }
    th.dataset.n = camPages.length;
    if (src) th.style.backgroundImage = `url(${toCanvas(src, 120).toDataURL('image/jpeg', 0.7)})`;
  }

  $('#cam-shot').addEventListener('click', () => capture(live && live.quad));
  $('#cam-done').addEventListener('click', () => closeCam(true));
  $('#cam-torch').addEventListener('click', () => {
    const track = stream && stream.getVideoTracks()[0];
    if (!track) return;
    const on = !$('#cam-torch').classList.contains('on');
    track.applyConstraints({ advanced: [{ torch: on }] }).then(() => $('#cam-torch').classList.toggle('on', on)).catch(() => {});
  });
  $('#cam-auto').addEventListener('change', () => { if (live) live.steadySince = 0; });
  document.addEventListener('keydown', (e) => {
    if (cam.classList.contains('hidden')) return;
    if (e.key === 'Escape') closeCam(true);
    if (e.key === ' ') { e.preventDefault(); $('#cam-shot').click(); }
  });

  document.addEventListener('langchange', drawGrid);
  route();
  window.CMV.registerSW();
  window.__scan = { pages, addFiles, get live() { return live; } };   // for automated tests
})();
