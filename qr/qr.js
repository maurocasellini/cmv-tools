/* QR Codes: content (link, Wi-Fi, vCard, email, phone, text) → own SVG renderer with colors,
   dot / corner styles and an optional logo → SVG or PNG. Nothing leaves the device. */
import { qrcode } from './vendor/qrcode/qrcode.mjs';
import { stringToBytes } from './vendor/qrcode/qrcode_UTF8.mjs';

qrcode.stringToBytes = stringToBytes;   // UTF-8 (umlauts, emoji)
const { $, toast, download, share } = window.CMV;
const t = (s) => window.i18n(s);

const state = { type: 'url', dots: 'square', eyes: 'square', logo: null };
let svgText = '', fileBase = 'qr-code';

// ---------------------------------------------------------------- Content
const val = (id) => ($('#' + id).value || '').trim();
const wifiEsc = (s) => s.replace(/([\\;,:"])/g, '\\$1');
const vEsc = (s) => s.replace(/([\\;,])/g, '\\$1').replace(/\n/g, '\\n');

function content() {
  switch (state.type) {
    case 'url': {
      let u = val('url');
      if (u && !/^[a-z][a-z0-9+.-]*:/i.test(u) && /\./.test(u)) u = 'https://' + u;
      fileBase = 'qr-link';
      return u;
    }
    case 'wifi': {
      const ssid = val('ssid');
      if (!ssid) return '';
      const sec = $('#wsec').value;
      fileBase = 'qr-wlan-' + ssid.replace(/[^\w-]+/g, '');
      return `WIFI:T:${sec};S:${wifiEsc(ssid)};${sec === 'nopass' ? '' : `P:${wifiEsc($('#wpass').value)};`}${$('#whidden').checked ? 'H:true;' : ''};`;
    }
    case 'vcard': {
      const f = val('v-first'), l = val('v-last');
      if (!f && !l && !val('v-org')) return '';
      fileBase = 'qr-kontakt-' + (l || f || 'vcard').replace(/[^\w-]+/g, '');
      const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${vEsc(l)};${vEsc(f)};;;`, `FN:${vEsc([f, l].filter(Boolean).join(' ') || val('v-org'))}`];
      if (val('v-org')) lines.push(`ORG:${vEsc(val('v-org'))}`);
      if (val('v-title')) lines.push(`TITLE:${vEsc(val('v-title'))}`);
      if (val('v-tel')) lines.push(`TEL;TYPE=CELL:${val('v-tel')}`);
      if (val('v-mail')) lines.push(`EMAIL:${val('v-mail')}`);
      if (val('v-url')) lines.push(`URL:${val('v-url')}`);
      if (val('v-adr')) lines.push(`ADR;TYPE=WORK:;;${vEsc(val('v-adr'))};;;;`);
      lines.push('END:VCARD');
      return lines.join('\n');
    }
    case 'email': {
      const to = val('m-to');
      if (!to) return '';
      const q = [['subject', val('m-sub')], ['body', $('#m-body').value]].filter((x) => x[1]).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
      fileBase = 'qr-email';
      return `mailto:${to}${q ? '?' + q : ''}`;
    }
    case 'tel': {
      const n = val('tel').replace(/[^\d+]/g, '');
      fileBase = 'qr-telefon';
      return n ? 'tel:' + n : '';
    }
    default:
      fileBase = 'qr-text';
      return $('#text').value;
  }
}

// ---------------------------------------------------------------- Rendering
const M = 4;   // quiet zone in modules
function render() {
  const data = content();
  const box = $('#qr-box');
  if (!data) {
    svgText = '';
    box.innerHTML = `<div class="empty">${t('Inhalt eingeben – der QR-Code erscheint hier.')}</div>`;
    $('#qr-info').textContent = '';
    return;
  }
  let ecl = $('#ecl').value;
  if (state.logo && (ecl === 'L' || ecl === 'M')) ecl = 'H';   // a logo hides modules: needs strong error correction
  let qr;
  try {
    qr = qrcode(0, ecl);
    qr.addData(data, 'Byte');
    qr.make();
  } catch {
    svgText = '';
    box.innerHTML = `<div class="empty">${t('Zu viel Inhalt für einen QR-Code – bitte kürzen.')}</div>`;
    $('#qr-info').textContent = '';
    return;
  }
  const n = qr.getModuleCount();
  const size = n + 2 * M;
  const fg = $('#fg').value, bg = $('#bg').value, accent = $('#accent').value;
  const eyeColor = state.eyes === 'accent' ? accent : fg;
  const transparent = $('#transparent').checked;

  // logo area in the center (odd module count, ~22 % of the code)
  let lp = 0, lo = 0;
  if (state.logo) { lp = Math.max(5, Math.round(n * 0.22) | 1); lo = (n - lp) / 2; }
  const inLogo = (r, c) => state.logo && r >= lo - 0.5 && r < lo + lp + 0.5 && c >= lo - 0.5 && c < lo + lp + 0.5;
  const inEye = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

  const parts = [];
  if (!transparent) parts.push(`<rect width="${size}" height="${size}" fill="${bg}"/>`);
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.isDark(r, c) || inEye(r, c) || inLogo(r, c)) continue;
      const x = c + M, y = r + M;
      if (state.dots === 'dots') d += `M${x + 0.5},${y + 0.07}a0.43,0.43 0 1,0 0.001,0z`;
      else if (state.dots === 'rounded') d += `M${x + 0.25},${y}h0.5a0.25,0.25 0 0 1 0.25,0.25v0.5a0.25,0.25 0 0 1 -0.25,0.25h-0.5a0.25,0.25 0 0 1 -0.25,-0.25v-0.5a0.25,0.25 0 0 1 0.25,-0.25z`;
      else d += `M${x},${y}h1v1h-1z`;
    }
  }
  parts.push(`<path fill="${fg}" d="${d}"/>`);
  // finder patterns ("eyes")
  const round = state.eyes !== 'square';
  for (const [r, c] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    const x = c + M, y = r + M;
    parts.push(`<path fill="${eyeColor}" fill-rule="evenodd" d="${rrect(x, y, 7, 7, round ? 2 : 0)}${rrect(x + 1, y + 1, 5, 5, round ? 1.3 : 0)}"/>`);
    parts.push(`<path fill="${eyeColor}" d="${rrect(x + 2, y + 2, 3, 3, round ? 0.9 : 0)}"/>`);
  }
  if (state.logo) {
    const pad = 0.4;
    parts.push(`<rect x="${lo + M - pad}" y="${lo + M - pad}" width="${lp + 2 * pad}" height="${lp + 2 * pad}" rx="${lp * 0.18}" fill="${transparent ? '#ffffff' : bg}"/>`);
    parts.push(`<image href="${state.logo}" x="${lo + M + 0.4}" y="${lo + M + 0.4}" width="${lp - 0.8}" height="${lp - 0.8}" preserveAspectRatio="xMidYMid meet"/>`);
  }
  svgText = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="${state.dots === 'square' && !round ? 'crispEdges' : 'geometricPrecision'}">${parts.join('')}</svg>`;
  box.innerHTML = svgText;
  $('#qr-info').textContent = `${t('Version')} ${qr.getTypeNumber ? qr.getTypeNumber() : Math.round((n - 17) / 4)} · ${n}×${n} ${t('Module')} · ${t('Fehlerkorrektur')} ${ecl} · ${new TextEncoder().encode(data).length} ${t('Bytes')}`;
}
function rrect(x, y, w, h, r) {
  if (!r) return `M${x},${y}h${w}v${h}h${-w}z`;
  return `M${x + r},${y}h${w - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 ${-r},${r}h${-(w - 2 * r)}a${r},${r} 0 0 1 ${-r},${-r}v${-(h - 2 * r)}a${r},${r} 0 0 1 ${r},${-r}z`;
}

// ---------------------------------------------------------------- UI
document.querySelectorAll('.types button').forEach((b) => b.addEventListener('click', () => {
  state.type = b.dataset.type;
  document.querySelectorAll('.types button').forEach((x) => x.classList.toggle('active', x === b));
  document.querySelectorAll('.form').forEach((f) => { f.hidden = f.dataset.form !== state.type; });
  render();
}));
for (const [id, key] of [['dots', 'dots'], ['eyes', 'eyes']]) {
  document.querySelectorAll(`#${id} button`).forEach((b) => b.addEventListener('click', () => {
    state[key] = b.dataset.v;
    document.querySelectorAll(`#${id} button`).forEach((x) => x.classList.toggle('active', x === b));
    $('#accent-field').hidden = state.eyes !== 'accent';
    render();
  }));
}
document.querySelectorAll('.editor input, .editor select, .editor textarea').forEach((el) => {
  if (el.id === 'logo') return;
  el.addEventListener('input', render);
  el.addEventListener('change', render);
});

$('#logo').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const bmp = await createImageBitmap(f);
    const s = Math.min(1, 512 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    state.logo = c.toDataURL('image/png');
    $('#logo-rm').hidden = false;
    if ($('#ecl').value !== 'H') { $('#ecl').value = 'H'; }
    render();
  } catch { toast(t('Dieses Bild kann nicht verwendet werden.'), true); }
});
$('#logo-rm').addEventListener('click', () => { state.logo = null; $('#logo-rm').hidden = true; render(); });

// ---------------------------------------------------------------- Export
async function pngBlob(px = 1600) {
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = px;
    c.getContext('2d').drawImage(img, 0, 0, px, px);
    return await new Promise((res) => c.toBlob(res, 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}
$('#svg').addEventListener('click', () => { if (svgText) download(new Blob([svgText], { type: 'image/svg+xml' }), fileBase + '.svg'); });
$('#png').addEventListener('click', async () => { if (svgText) download(await pngBlob(), fileBase + '.png'); });
if (navigator.canShare && navigator.canShare({ files: [new File([''], 'a.png', { type: 'image/png' })] })) $('#share').classList.remove('hidden');
$('#share').addEventListener('click', async () => { if (svgText) share(await pngBlob(), fileBase + '.png'); });

function route() {
  const about = location.hash === '#about';
  $('#home').classList.toggle('hidden', about);
  $('#about').classList.toggle('hidden', !about);
  if (about) window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
document.addEventListener('langchange', render);
route();
render();
window.CMV.registerSW();
window.__qr = { get svg() { return svgText; }, content, pngBlob };
