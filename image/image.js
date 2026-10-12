/* Image Toolkit: decode (incl. HEIC) → resize → optional background removal → encode
   (MozJPEG / WebP / AVIF / OxiPNG). Re-encoding drops all metadata. Nothing leaves the device. */
(() => {
  const { $, toast, busy, download, fmtSize } = window.CMV;
  const t = (s) => window.i18n(s);
  const items = [];            // { id, file, name, bmp: canvas, w, h, meta, thumb, out: { blob, url, w, h, name } }
  const opts = { format: 'orig', quality: 80, size: 0, bg: false, bgmode: 'none', bgcolor: '#242b41', faces: false, facemode: 'pixel' };
  let seq = 0, running = false;

  // ---------------------------------------------------------------- Worker
  let worker = null;
  const pending = new Map();
  function call(cmd, args, transfer = []) {
    if (!worker) {
      worker = new Worker('img-worker.js', { type: 'module' });
      worker.onmessage = (e) => {
        if (e.data.type === 'progress') { busy(t('KI-Modell wird geladen …'), e.data.p); return; }
        const p = pending.get(e.data.id);
        pending.delete(e.data.id);
        if (e.data.ok) p.resolve(e.data.res); else p.reject(new Error(e.data.error));
      };
      worker.onerror = (e) => { for (const p of pending.values()) p.reject(new Error(e.message || 'Worker')); pending.clear(); };
    }
    const id = ++seq;
    return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); worker.postMessage({ id, cmd, args }, transfer); });
  }

  // ---------------------------------------------------------------- Decoding
  const isHeic = (f) => /hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name);
  function canvasOf(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  async function decode(file) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const c = canvasOf(bmp.width, bmp.height);
      c.getContext('2d').drawImage(bmp, 0, 0);
      bmp.close();
      return c;
    } catch (e) {
      if (!isHeic(file)) throw e;
      const r = await call('heic', { buf: await file.arrayBuffer() });
      const c = canvasOf(r.width, r.height);
      c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(r.data.buffer || r.data), r.width, r.height), 0, 0);
      return c;
    }
  }

  // High-quality downscaling: halve repeatedly, then the final step
  function resize(src, w, h) {
    let cur = src;
    while (cur.width / 2 >= w && cur.height / 2 >= h) {
      const n = canvasOf(Math.round(cur.width / 2), Math.round(cur.height / 2));
      const g = n.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(cur, 0, 0, n.width, n.height);
      cur = n;
    }
    if (cur.width === w && cur.height === h) return cur === src ? copy(src) : cur;
    const out = canvasOf(w, h);
    const g = out.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(cur, 0, 0, w, h);
    return out;
  }
  function copy(c) { const n = canvasOf(c.width, c.height); n.getContext('2d').drawImage(c, 0, 0); return n; }

  const toBlob = (c, type, q) => new Promise((res) => c.toBlob(res, type, q));

  async function readMeta(file) {
    const tags = [];
    try {
      if (!window.exifr) return tags;
      const m = await window.exifr.parse(file, { gps: true, tiff: true, exif: true, xmp: false, icc: false, iptc: true });
      if (!m) return tags;
      if (m.latitude != null || m.GPSLatitude) tags.push(['warn', 'Standort']);
      if (m.Make || m.Model) tags.push(['', [m.Make, m.Model].filter(Boolean).join(' ').slice(0, 28)]);
      if (m.DateTimeOriginal) tags.push(['', new Date(m.DateTimeOriginal).toLocaleDateString()]);
    } catch { /* no metadata */ }
    return tags;
  }

  // ---------------------------------------------------------------- Adding files
  async function addFiles(files) {
    files = [...files].filter((f) => f.type.startsWith('image/') || isHeic(f));
    if (!files.length) return;
    busy(t('Bilder werden geladen …'));
    for (const f of files) {
      try {
        const bmp = await decode(f);
        const s = Math.min(1, 240 / Math.max(bmp.width, bmp.height));
        const th = resize(bmp, Math.max(1, Math.round(bmp.width * s)), Math.max(1, Math.round(bmp.height * s)));
        const thumb = URL.createObjectURL(await toBlob(th, 'image/png'));
        items.push({ id: ++seq, file: f, name: f.name, bmp, w: bmp.width, h: bmp.height, meta: await readMeta(f), thumb, out: null });
      } catch {
        toast(t('Dieses Bild kann nicht geöffnet werden: ') + f.name, true);
      }
    }
    busy(false);
    resetResults();
    show('work');
    render();
  }
  document.querySelectorAll('[data-pick]').forEach((inp) => inp.addEventListener('change', () => { addFiles(inp.files); inp.value = ''; }));
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); if (ev === 'drop' || !e.relatedTarget) drop.classList.remove('over'); }));
  document.addEventListener('drop', (e) => { if (e.dataTransfer && e.dataTransfer.files.length && $('#redact').classList.contains('hidden')) addFiles(e.dataTransfer.files); });

  // ---------------------------------------------------------------- Views
  function show(id) {
    for (const v of ['start', 'work', 'about', 'redact']) $('#' + v).classList.toggle('hidden', v !== id);
  }
  function route() {
    if (location.hash === '#about') { show('about'); window.scrollTo(0, 0); }
    else if (location.hash === '#redact' || location.hash === '#schwaerzen') { show('redact'); window.scrollTo(0, 0); }
    else show(items.length ? 'work' : 'start');
  }
  window.addEventListener('hashchange', route);

  function render() {
    $('#count').textContent = items.length === 1 ? t('1 Bild') : `${items.length} ${t('Bilder')}`;
    const list = $('#list');
    list.textContent = '';
    for (const it of items) {
      const el = document.createElement('div');
      el.className = 'item';
      const tags = it.meta.map(([c, l]) => `<span class="tag ${c}">${esc(t(l))}</span>`).join('');
      let res = '';
      if (it.busy) res = '<div class="spinner"></div>';
      else if (it.out) {
        const d = it.out.blob.size / it.file.size - 1;
        const faces = it.out.faces == null ? '' : `<div class="faces">${it.out.faces === 1 ? t('1 Gesicht unkenntlich') : it.out.faces ? `${it.out.faces} ${t('Gesichter unkenntlich')}` : t('Kein Gesicht gefunden')}</div>`;
        res = `<b>${fmtSize(it.out.blob.size)}</b><span class="${d <= 0 ? 'gain' : 'loss'}">${d <= 0 ? '−' : '+'}${Math.abs(Math.round(d * 100))} %</span> · ${it.out.w}×${it.out.h}${faces}
          <div class="actions">${it.out.faces != null ? `<button type="button" data-a="faces">${t('Gesichter')}</button>` : ''}<button type="button" data-a="cmp">${t('Vergleich')}</button><button type="button" data-a="dl">${t('Laden')}</button></div>`;
      }
      el.innerHTML = `<button type="button" class="th" data-a="cmp" title="${t('Vergleich')}"><img alt="" src="${it.out ? it.out.url : it.thumb}"></button>
        <div class="meta"><div class="name" data-no-i18n>${esc(it.name)}</div>
          <div class="info">${fmtSize(it.file.size)} · ${it.w}×${it.h}</div>
          <div class="tags">${tags}${it.meta.length ? '' : `<span class="tag ok">${t('Keine Metadaten')}</span>`}</div></div>
        <div class="res">${res || `<button type="button" data-a="rm" title="${t('Entfernen')}">✕</button>`}</div>`;
      el.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => act(it, b.dataset.a)));
      list.append(el);
    }
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function act(it, a) {
    if (a === 'rm') {
      items.splice(items.indexOf(it), 1);
      URL.revokeObjectURL(it.thumb);
      if (!items.length) { show('start'); return; }
      render();
    } else if (a === 'dl' && it.out) download(it.out.blob, it.out.name);
    else if (a === 'cmp') compare(it);
    else if (a === 'faces') editFaces(it);
  }

  // ---------------------------------------------------------------- Options
  function seg(id, key, onChange) {
    document.querySelectorAll(`#${id} button`).forEach((b) => b.addEventListener('click', () => {
      opts[key] = b.dataset.v;
      document.querySelectorAll(`#${id} button`).forEach((x) => x.classList.toggle('active', x === b));
      onChange && onChange();
      resetResults();
    }));
  }
  seg('format', 'format', () => { $('#q-field').hidden = opts.format === 'png'; });
  seg('bgmode', 'bgmode', () => { $('#bgcolor').hidden = opts.bgmode !== 'color'; });
  seg('facemode', 'facemode');
  $('#faces').addEventListener('change', (e) => { opts.faces = e.target.checked; $('#faces-field').hidden = !opts.faces; resetResults(); });
  $('#quality').addEventListener('input', (e) => { opts.quality = +e.target.value; $('#q-out').textContent = e.target.value; resetResults(); });
  $('#size').addEventListener('change', (e) => { opts.size = +e.target.value; resetResults(); });
  $('#bg').addEventListener('change', (e) => { opts.bg = e.target.checked; $('#bg-field').hidden = !opts.bg; resetResults(); });
  $('#bgcolor').addEventListener('input', (e) => { opts.bgcolor = e.target.value; resetResults(); });

  function resetResults() {
    for (const it of items) if (it.out) { URL.revokeObjectURL(it.out.url); it.out = null; }
    $('#done').classList.add('hidden');
    render();
  }

  // ---------------------------------------------------------------- Faces
  // The detector sees 640×640 px: the whole photo plus overlapping tiles, so small faces are found too.
  async function findFaces(c) {
    const W = c.width, H = c.height, regions = [[0, 0, W, H]];
    const grid = (n) => {
      const rw = Math.min(W, Math.round((W / n) * 1.3)), rh = Math.min(H, Math.round((H / n) * 1.3));
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++)
        regions.push([Math.round(((W - rw) * i) / (n - 1)), Math.round(((H - rh) * j) / (n - 1)), rw, rh]);
    };
    if (Math.max(W, H) > 900) grid(2);
    if (Math.max(W, H) > 2400) grid(3);
    const tiles = [], transfer = [];
    for (const [x, y, rw, rh] of regions) {
      const scale = 640 / Math.max(rw, rh), w = Math.max(1, Math.round(rw * scale)), h = Math.max(1, Math.round(rh * scale));
      const tc = canvasOf(w, h), tg = tc.getContext('2d', { willReadFrequently: true });
      tg.imageSmoothingQuality = 'high';
      tg.drawImage(c, x, y, rw, rh, 0, 0, w, h);
      const data = tg.getImageData(0, 0, w, h).data;
      tiles.push({ data, w, h, x, y, scale });
      transfer.push(data.buffer);
    }
    return call('faces', { tiles }, transfer);
  }

  // Area to hide for a detected face, as fractions of the image: a little larger than the box (hair, ears, chin)
  function coverArea(f, W, H) {
    const w = f.w * 1.35, h = f.h * 1.45;
    const x = Math.max(0, f.x + f.w / 2 - w / 2), y = Math.max(0, f.y + f.h * 0.45 - h / 2);
    return { x: x / W, y: y / H, w: Math.min(W - x, w) / W, h: Math.min(H - y, h) / H };
  }

  // areas: fractions of the image (so they survive a change of the output size)
  function hideFaces(c, areas, mode) {
    const g = c.getContext('2d');
    for (const a of areas) {
      const x = Math.round(a.x * c.width), y = Math.round(a.y * c.height);
      const rw = Math.min(c.width - x, Math.round(a.w * c.width)), rh = Math.min(c.height - y, Math.round(a.h * c.height));
      if (rw < 2 || rh < 2) continue;
      g.save();
      if (mode === 'bar') {
        g.fillStyle = '#111';
        g.fillRect(x, y, rw, rh);
      } else {
        const cells = mode === 'pixel' ? 9 : 5;     // the blur goes through a tiny version and back up, smoothly
        const sw = Math.max(1, Math.round(Math.min(rw, (cells * rw) / Math.min(rw, rh)))), sh = Math.max(1, Math.round((sw * rh) / rw));
        const small = canvasOf(sw, sh), sg = small.getContext('2d');
        sg.imageSmoothingQuality = 'high';
        sg.drawImage(c, x, y, rw, rh, 0, 0, sw, sh);
        if (mode === 'blur') {
          g.beginPath();
          g.ellipse(x + rw / 2, y + rh / 2, rw / 2, rh / 2, 0, 0, Math.PI * 2);
          g.clip();
          g.imageSmoothingEnabled = true;
          g.imageSmoothingQuality = 'high';
        } else g.imageSmoothingEnabled = false;
        g.drawImage(small, 0, 0, sw, sh, x, y, rw, rh);
      }
      g.restore();
    }
  }

  // ---------------------------------------------------------------- Processing
  const EXT = { jpeg: 'jpg', webp: 'webp', avif: 'avif', png: 'png' };
  function targetFormat(it, transparent) {
    let f = opts.format;
    if (f === 'orig') {
      const ty = it.file.type;
      f = /png|gif/.test(ty) ? 'png' : /webp/.test(ty) ? 'webp' : /avif/.test(ty) ? 'avif' : 'jpeg';
    }
    if (transparent && f === 'jpeg') f = 'png';    // JPG has no transparency
    return f;
  }

  async function processOne(it) {
    let w = it.w, h = it.h;
    if (opts.size && Math.max(w, h) > opts.size) { const s = opts.size / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
    const c = resize(it.bmp, w, h);
    const g = c.getContext('2d', { willReadFrequently: true });
    let transparent = false, faces = null;
    if (opts.faces) {
      // areas corrected by hand are kept; otherwise detect
      if (!it.faceEdited) it.faceAreas = (await findFaces(c)).map((f) => coverArea(f, w, h));
      hideFaces(c, it.faceAreas, opts.facemode);
      faces = it.faceAreas.length;
    }
    if (opts.bg) {
      const small = resize(it.bmp, 1024, 1024);
      const px = small.getContext('2d').getImageData(0, 0, 1024, 1024);
      const { mask } = await call('removeBg', { data: px.data, width: 1024, height: 1024 }, [px.data.buffer]);
      busy(`${t('Bild')} ${items.indexOf(it) + 1} / ${items.length}`, items.indexOf(it) / items.length);
      // mask (1024²) → alpha channel at the output size, smoothly scaled
      const m = canvasOf(1024, 1024);
      const md = new ImageData(1024, 1024);
      for (let i = 0; i < mask.length; i++) md.data[i * 4 + 3] = mask[i];
      m.getContext('2d').putImageData(md, 0, 0);
      const ms = canvasOf(w, h);
      const mg = ms.getContext('2d', { willReadFrequently: true }); mg.imageSmoothingQuality = 'high'; mg.drawImage(m, 0, 0, w, h);
      const alpha = mg.getImageData(0, 0, w, h).data;
      const img = g.getImageData(0, 0, w, h);
      for (let i = 3; i < img.data.length; i += 4) img.data[i] = Math.round(img.data[i] * alpha[i] / 255);
      g.putImageData(img, 0, 0);
      if (opts.bgmode === 'none') transparent = true;
      else {
        const f = canvasOf(w, h), fg = f.getContext('2d');
        fg.fillStyle = opts.bgmode === 'white' ? '#ffffff' : opts.bgcolor;
        fg.fillRect(0, 0, w, h);
        fg.drawImage(c, 0, 0);
        g.clearRect(0, 0, w, h);
        g.drawImage(f, 0, 0);
      }
    }
    const fmt = targetFormat(it, transparent);
    const data = g.getImageData(0, 0, w, h);
    if (fmt === 'jpeg') {           // JPG: flatten onto white (no alpha)
      for (let i = 3; i < data.data.length; i += 4) if (data.data[i] < 255) {
        const a = data.data[i] / 255;
        data.data[i - 3] = data.data[i - 3] * a + 255 * (1 - a); data.data[i - 2] = data.data[i - 2] * a + 255 * (1 - a); data.data[i - 1] = data.data[i - 1] * a + 255 * (1 - a); data.data[i] = 255;
      }
    }
    const buf = await call('encode', { data: data.data, width: w, height: h, format: fmt, quality: opts.quality }, [data.data.buffer]);
    const blob = new Blob([buf], { type: fmt === 'jpeg' ? 'image/jpeg' : 'image/' + fmt });
    const base = it.name.replace(/\.[^.]+$/, '');
    return { blob, url: URL.createObjectURL(blob), w, h, name: `${base}.${EXT[fmt]}`, faces };
  }

  $('#go').addEventListener('click', async () => {
    if (running || !items.length) return;
    running = true;
    resetResults();
    try {
      if (opts.faces) busy(t('Gesichtserkennung wird geladen …'));
      if (opts.bg) { busy(t('KI-Modell wird geladen …'), 0); await call('warm', {}); }
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        busy(`${t('Bild')} ${i + 1} / ${items.length}`, i / items.length);
        it.busy = true; render();
        try {
          it.out = await processOne(it);
        } catch (e) {
          console.error(e);
          toast(`${it.name}: ${e.message}`, true);
        } finally { it.busy = false; }
      }
      render();
      summary();
    } finally {
      running = false;
      busy(false);
    }
  });

  function summary() {
    const done = items.filter((x) => x.out);
    if (!done.length) return;
    const before = done.reduce((n, x) => n + x.file.size, 0), after = done.reduce((n, x) => n + x.out.blob.size, 0);
    const d = Math.round((1 - after / before) * 100);
    $('#summary').innerHTML = `${done.length} ${done.length === 1 ? t('Bild') : t('Bilder')}: ${fmtSize(before)} → <b>${fmtSize(after)}</b>` + (d > 0 ? ` (−${d} %)` : '');
    $('#done').classList.remove('hidden');
    $('#zip').textContent = done.length === 1 ? t('Herunterladen') : t('Alle herunterladen (ZIP)');
  }

  // ---------------------------------------------------------------- Correct the face areas by hand
  // Tap an area to remove it, drag across a missed face to add one; then the image is processed again.
  const fed = $('#faced'), feWrap = $('#fe-wrap');
  let feItem = null, feAreas = [];
  async function editFaces(it) {
    feItem = it;
    feAreas = (it.faceAreas || []).map((a) => ({ ...a }));
    const img = $('#fe-img');
    img.src = it.cmpUrl || (it.cmpUrl = URL.createObjectURL(await toBlob(resize(it.bmp, ...fit(it.w, it.h, 1600)), 'image/jpeg', 0.9)));
    fed.showModal();
    await img.decode().catch(() => {});
    feLayout();
  }
  function feLayout() {
    const st = $('#fe-stage').getBoundingClientRect(), r = feItem.w / feItem.h;
    const w = Math.min(st.width, st.height * r), h = w / r;
    Object.assign(feWrap.style, { width: w + 'px', height: h + 'px' });
    feDraw();
  }
  function feDraw() {
    feWrap.querySelectorAll('.fe-box').forEach((b) => b.remove());
    feAreas.forEach((a, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'fe-box';
      b.title = t('Entfernen');
      Object.assign(b.style, { left: a.x * 100 + '%', top: a.y * 100 + '%', width: a.w * 100 + '%', height: a.h * 100 + '%' });
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', () => { feAreas.splice(i, 1); feDraw(); });
      feWrap.append(b);
    });
    const n = feAreas.length;
    $('#fe-count').textContent = n === 1 ? t('1 Bereich') : `${n} ${t('Bereiche')}`;
  }
  let feDrag = null;
  feWrap.addEventListener('pointerdown', (e) => {
    const r = feWrap.getBoundingClientRect();
    const p = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    const el = document.createElement('div');
    el.className = 'fe-box drawing';
    feWrap.append(el);
    feDrag = { p, el, r };
    feWrap.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  const feRect = (e) => {
    const { p, r } = feDrag, cl = (v) => Math.min(1, Math.max(0, v));
    const q = { x: cl((e.clientX - r.left) / r.width), y: cl((e.clientY - r.top) / r.height) };
    return { x: Math.min(p.x, q.x), y: Math.min(p.y, q.y), w: Math.abs(q.x - p.x), h: Math.abs(q.y - p.y) };
  };
  feWrap.addEventListener('pointermove', (e) => {
    if (!feDrag) return;
    const a = feRect(e);
    Object.assign(feDrag.el.style, { left: a.x * 100 + '%', top: a.y * 100 + '%', width: a.w * 100 + '%', height: a.h * 100 + '%' });
  });
  const feEnd = (e) => {
    if (!feDrag) return;
    const a = feRect(e);
    feDrag.el.remove();
    feDrag = null;
    // a plain tap (no drag) adds a face-sized area around the finger
    if (a.w * feItem.w < 12 && a.h * feItem.h < 12) {
      const s = 0.08 * Math.max(feItem.w, feItem.h);
      const w = s / feItem.w, h = (s * 1.25) / feItem.h;
      feAreas.push({ x: Math.max(0, a.x - w / 2), y: Math.max(0, a.y - h / 2), w: Math.min(w, 1), h: Math.min(h, 1) });
    } else feAreas.push(a);
    feDraw();
  };
  feWrap.addEventListener('pointerup', feEnd);
  feWrap.addEventListener('pointercancel', () => { if (feDrag) { feDrag.el.remove(); feDrag = null; } });
  window.addEventListener('resize', () => { if (fed.open) feLayout(); });
  $('#fe-cancel').addEventListener('click', () => fed.close());
  $('#fe-ok').addEventListener('click', async () => {
    const it = feItem;
    fed.close();
    it.faceAreas = feAreas;
    it.faceEdited = true;
    it.busy = true; render();
    busy(t('Bild wird neu erstellt …'));
    try {
      const out = await processOne(it);
      if (it.out) URL.revokeObjectURL(it.out.url);
      it.out = out;
    } catch (e) { toast(`${it.name}: ${e.message}`, true); }
    finally { it.busy = false; busy(false); render(); summary(); }
  });

  $('#zip').addEventListener('click', async () => {
    const done = items.filter((x) => x.out);
    if (done.length === 1) return download(done[0].out.blob, done[0].out.name);
    busy(t('ZIP wird erstellt …'));
    try { download(await window.CMV.zip(done.map((x) => ({ name: x.out.name, blob: x.out.blob }))), 'bilder.zip'); }
    finally { busy(false); }
  });
  // Phones: share sheet with all images (save to Photos, AirDrop, WhatsApp …)
  const canShare = (files) => navigator.canShare && navigator.canShare({ files });
  if (canShare([new File([''], 'a.jpg', { type: 'image/jpeg' })])) $('#share').classList.remove('hidden');
  $('#share').addEventListener('click', async () => {
    const files = items.filter((x) => x.out).map((x) => new File([x.out.blob], x.out.name, { type: x.out.blob.type }));
    try { await navigator.share({ files }); } catch (e) { if (e.name !== 'AbortError') toast(t('Teilen nicht möglich.'), true); }
  });
  $('#clear').addEventListener('click', () => {
    items.splice(0).forEach((it) => { URL.revokeObjectURL(it.thumb); if (it.out) URL.revokeObjectURL(it.out.url); });
    show('start');
  });

  // ---------------------------------------------------------------- Before / after
  const dlg = $('#compare');
  async function compare(it) {
    const before = it.cmpUrl || (it.cmpUrl = URL.createObjectURL(await toBlob(resize(it.bmp, ...fit(it.w, it.h, 1600)), 'image/jpeg', 0.9)));
    $('#cmp-before').src = before;
    $('#cmp-after').src = it.out ? it.out.url : before;
    setCmp(50);
    $('#cmp-range').value = 50;
    dlg.showModal();
  }
  const fit = (w, h, m) => { const s = Math.min(1, m / Math.max(w, h)); return [Math.round(w * s), Math.round(h * s)]; };
  function setCmp(v) {
    $('#cmp-before-wrap').style.clipPath = `inset(0 ${100 - v}% 0 0)`;
    $('#cmp-line').style.left = v + '%';
  }
  $('#cmp-range').addEventListener('input', (e) => setCmp(+e.target.value));
  $('#cmp-stage').addEventListener('pointermove', (e) => {
    if (e.buttons !== 1 && e.pointerType === 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    const v = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
    $('#cmp-range').value = v; setCmp(v);
  });
  $('#cmp-close').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

  document.addEventListener('langchange', render);
  route();
  window.CMV.registerSW();
  window.__img = { items, opts, get running() { return running; } };
})();
