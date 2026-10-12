/* Screenshot redaction: draw boxes over what must not be seen, then save a new image (PNG, no metadata).
   The boxes are burnt into the pixels – nothing of the covered area is left in the file. */
(() => {
  const { $, toast, download, share } = window.CMV;
  const t = (s) => window.i18n(s);
  const canvas = $('#rd-canvas'), svg = $('#rd-svg'), stage = $('#rd-stage');
  let src = null, name = 'screenshot', boxes = [], mode = 'black', drag = null;
  const active = () => !$('#redact').classList.contains('hidden');

  // ---------------------------------------------------------------- Loading
  async function load(blob, fileName) {
    if (!blob || !/^image\//.test(blob.type || 'image/')) { toast(t('Bitte ein Bild wählen.'), true); return; }
    try {
      const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      const c = document.createElement('canvas');
      c.width = bmp.width; c.height = bmp.height;
      c.getContext('2d').drawImage(bmp, 0, 0);
      bmp.close();
      src = c;
    } catch {
      toast(t('Dieses Bild kann der Browser nicht öffnen.'), true);
      return;
    }
    name = (fileName || 'screenshot').replace(/\.[^.]+$/, '') || 'screenshot';
    boxes = [];
    $('#rd-empty').classList.add('hidden');
    $('#rd-editor').classList.remove('hidden');
    paint();
  }
  $('#rd-file').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) load(f, f.name); });
  ['dragenter', 'dragover'].forEach((ev) => $('#redact').addEventListener(ev, (e) => { e.preventDefault(); $('#rd-drop').classList.add('over'); }));
  $('#redact').addEventListener('dragleave', (e) => { if (!e.relatedTarget || !$('#redact').contains(e.relatedTarget)) $('#rd-drop').classList.remove('over'); });
  $('#redact').addEventListener('drop', (e) => {
    e.preventDefault();
    $('#rd-drop').classList.remove('over');
    const f = e.dataTransfer && e.dataTransfer.files[0];
    if (f) load(f, f.name);
  });
  // paste anywhere while this view is open (⌘V / Ctrl+V)
  document.addEventListener('paste', (e) => {
    if (!active()) return;
    const item = [...(e.clipboardData ? e.clipboardData.items : [])].find((i) => i.type.startsWith('image/'));
    if (!item) return;
    e.preventDefault();
    load(item.getAsFile(), 'screenshot');
  });
  // explicit button where the browser lets pages read images from the clipboard
  if (navigator.clipboard && navigator.clipboard.read) {
    $('#rd-paste').classList.remove('hidden');
    $('#rd-paste').addEventListener('click', async () => {
      try {
        for (const it of await navigator.clipboard.read()) {
          const type = it.types.find((x) => x.startsWith('image/'));
          if (type) { load(await it.getType(type), 'screenshot'); return; }
        }
        toast(t('In der Zwischenablage ist kein Bild.'), true);
      } catch { toast(t('Kein Zugriff auf die Zwischenablage – bitte mit ⌘V / Strg+V einfügen.'), true); }
    });
  }

  // ---------------------------------------------------------------- Drawing
  // boxes: { x, y, w, h, mode } in image pixels
  function burn(g, b) {
    const x = Math.round(b.x), y = Math.round(b.y), w = Math.round(b.w), h = Math.round(b.h);
    if (w < 1 || h < 1) return;
    if (b.mode === 'pixel') {
      // coarse blocks (at least 12 px, about half the box height) – fine pixelation can be reversed
      const block = Math.max(12, Math.round(Math.min(w, h) / 2.5));
      const sw = Math.max(1, Math.round(w / block)), sh = Math.max(1, Math.round(h / block));
      const tmp = document.createElement('canvas');
      tmp.width = sw; tmp.height = sh;
      const tg = tmp.getContext('2d');
      tg.imageSmoothingQuality = 'high';
      tg.drawImage(g.canvas, x, y, w, h, 0, 0, sw, sh);
      g.save();
      g.imageSmoothingEnabled = false;
      g.drawImage(tmp, 0, 0, sw, sh, x, y, w, h);
      g.restore();
    } else {
      g.fillStyle = b.mode === 'white' ? '#ffffff' : '#000000';
      g.fillRect(x, y, w, h);
    }
  }
  function paint() {
    if (!src) return;
    canvas.width = src.width; canvas.height = src.height;
    const g = canvas.getContext('2d');
    g.drawImage(src, 0, 0);
    boxes.forEach((b) => burn(g, b));
    drawBoxes();
    const n = boxes.length;
    $('#rd-count').textContent = n === 1 ? t('1 Bereich abgedeckt') : `${n} ${t('Bereiche abgedeckt')}`;
    $('#rd-undo').disabled = $('#rd-clear').disabled = !n;
  }
  // outlines + remove buttons on top (in image coordinates, the SVG scales with the canvas)
  function drawBoxes(preview) {
    if (!src) return;
    svg.setAttribute('viewBox', `0 0 ${src.width} ${src.height}`);
    const s = src.width / Math.max(1, canvas.getBoundingClientRect().width);   // image px per screen px
    const r = 11 * s;
    svg.innerHTML = boxes.map((b, i) => `
      <g class="rd-box" data-i="${i}">
        <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" stroke-width="${1.5 * s}"/>
        <g class="rd-x" data-i="${i}" transform="translate(${b.x + b.w} ${b.y})">
          <circle r="${r}"/><path d="M${-r * 0.4},${-r * 0.4}L${r * 0.4},${r * 0.4}M${r * 0.4},${-r * 0.4}L${-r * 0.4},${r * 0.4}" stroke-width="${2 * s}"/>
        </g>
      </g>`).join('') + (preview ? `<rect class="rd-draft ${mode}" x="${preview.x}" y="${preview.y}" width="${preview.w}" height="${preview.h}" stroke-width="${1.5 * s}"/>` : '');
  }

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    const k = src.width / r.width;
    return { x: Math.min(src.width, Math.max(0, (e.clientX - r.left) * k)), y: Math.min(src.height, Math.max(0, (e.clientY - r.top) * k)) };
  }
  const rect = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) });

  stage.addEventListener('pointerdown', (e) => {
    if (!src) return;
    const x = e.target.closest('.rd-x');
    if (x) { boxes.splice(+x.dataset.i, 1); paint(); e.preventDefault(); return; }
    drag = { a: pos(e) };
    stage.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  stage.addEventListener('pointermove', (e) => { if (drag) drawBoxes(rect(drag.a, pos(e))); });
  stage.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const b = rect(drag.a, pos(e));
    drag = null;
    const min = 4 * src.width / canvas.getBoundingClientRect().width;
    if (b.w >= min && b.h >= min) boxes.push({ ...b, mode });
    paint();
  });
  stage.addEventListener('pointercancel', () => { drag = null; drawBoxes(); });
  window.addEventListener('resize', () => { if (active()) drawBoxes(); });

  document.querySelectorAll('#rd-mode button').forEach((b) => b.addEventListener('click', () => {
    mode = b.dataset.v;
    document.querySelectorAll('#rd-mode button').forEach((x) => x.classList.toggle('active', x === b));
    $('#rd-warn').classList.toggle('hidden', mode !== 'pixel');
    $('#rd-hint').classList.toggle('hidden', mode === 'pixel');   // same spot: the picture does not jump
  }));
  $('#rd-undo').addEventListener('click', () => { boxes.pop(); paint(); });
  $('#rd-clear').addEventListener('click', () => { boxes = []; paint(); });
  $('#rd-new').addEventListener('click', () => { src = null; boxes = []; $('#rd-editor').classList.add('hidden'); $('#rd-empty').classList.remove('hidden'); });
  document.addEventListener('keydown', (e) => {
    if (!active() || !src || e.target.closest('input, textarea')) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); $('#rd-undo').click(); }
  });

  // ---------------------------------------------------------------- Saving (a fresh PNG: pixels only, no metadata)
  const png = () => new Promise((res) => canvas.toBlob(res, 'image/png'));
  const outName = () => `${name}-geschwaerzt.png`;
  function guard() {
    if (!src) return false;
    if (!boxes.length) toast(t('Noch nichts abgedeckt – das Bild wird unverändert gespeichert (aber ohne Metadaten).'));
    return true;
  }
  $('#rd-dl').addEventListener('click', async () => { if (guard()) download(await png(), outName()); });
  $('#rd-copy').addEventListener('click', async () => {
    if (!guard()) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png() })]);
      toast(t('Bild kopiert – jetzt z. B. in WhatsApp oder eine Mail einfügen.'));
    } catch { toast(t('Kopieren nicht möglich – bitte „Als PNG speichern“ verwenden.'), true); }
  });
  if (navigator.canShare && navigator.canShare({ files: [new File([''], 'a.png', { type: 'image/png' })] })) {
    $('#rd-share').classList.remove('hidden');
    $('#rd-share').addEventListener('click', async () => { if (guard()) share(await png(), outName()); });
  }
  if (!(window.ClipboardItem && navigator.clipboard && navigator.clipboard.write)) $('#rd-copy').classList.add('hidden');

  window.__redact = { load, get boxes() { return boxes; }, canvas };
})();
