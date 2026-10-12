/* Time zones: compare several places for a chosen date and time. All time-zone rules (incl. summer / winter
   time) come from the browser's own database (Intl API) – nothing is loaded, nothing leaves the device. */
(() => {
  const { $, toast, download } = window.CMV;
  const t = (s) => window.i18n(s);
  const lang = () => (window.I18N && window.I18N.lang === 'en' ? 'en' : 'de');
  const KEY = 'cmv-time-zones';

  // ---------------------------------------------------------------- Time-zone math
  const partsCache = new Map();
  function fmt(tz) {
    if (!partsCache.has(tz)) partsCache.set(tz, new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }));
    return partsCache.get(tz);
  }
  // wall-clock time of instant `ms` in zone `tz`
  function wall(ms, tz) {
    const p = {};
    for (const x of fmt(tz).formatToParts(new Date(ms))) p[x.type] = +x.value;
    return { y: p.year, m: p.month, d: p.day, h: p.hour % 24, mi: p.minute, s: p.second };
  }
  // offset of `tz` from UTC at instant `ms`, in minutes
  function offset(ms, tz) {
    const w = wall(ms, tz);
    return Math.round((Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - Math.floor(ms / 1000) * 1000) / 60000);
  }
  // instant of a wall-clock time in `tz` (handles the DST switch: a missing hour moves forward)
  function instant(y, m, d, h, mi, tz) {
    const guess = Date.UTC(y, m - 1, d, h, mi);
    let ms = guess - offset(guess, tz) * 60000;
    ms = guess - offset(ms, tz) * 60000;
    return ms;
  }
  // summer time = offset larger than the smaller of January / July (works on both hemispheres)
  function isSummer(ms, tz) {
    const y = wall(ms, tz).y;
    const jan = offset(Date.UTC(y, 0, 1), tz), jul = offset(Date.UTC(y, 6, 1), tz);
    return jan !== jul && offset(ms, tz) > Math.min(jan, jul);
  }
  // next offset change after `ms` (within ~13 months): { at, from, to } or null
  function nextChange(ms, tz) {
    const start = offset(ms, tz);
    let lo = ms, hi = null;
    for (let day = 1; day <= 400; day++) {
      const x = ms + day * 86400000;
      if (offset(x, tz) !== start) { hi = x; lo = x - 86400000; break; }
    }
    if (hi == null) return null;
    while (hi - lo > 60000) { const mid = Math.floor((lo + hi) / 2); if (offset(mid, tz) === start) lo = mid; else hi = mid; }
    return { at: hi, from: start, to: offset(hi, tz) };
  }
  const fmtOffset = (min) => {
    const s = min < 0 ? '−' : '+', a = Math.abs(min);
    return `UTC${s}${Math.floor(a / 60)}${a % 60 ? ':' + String(a % 60).padStart(2, '0') : ''}`;
  };
  function zoneName(ms, tz, style) {
    try {
      const p = new Intl.DateTimeFormat(lang(), { timeZone: tz, timeZoneName: style }).formatToParts(new Date(ms));
      return (p.find((x) => x.type === 'timeZoneName') || {}).value || '';
    } catch { return ''; }
  }

  // ---------------------------------------------------------------- Places
  const CITY = window.CITIES.map(([de, en, cc, tz]) => ({ de, en, cc, tz }));
  let region = null;
  const country = (cc) => {
    try { region = region && region.lang === lang() ? region : { lang: lang(), dn: new Intl.DisplayNames([lang()], { type: 'region' }) }; return region.dn.of(cc); }
    catch { return cc; }
  };
  const ZONES = (() => { try { return Intl.supportedValuesOf('timeZone'); } catch { return [...new Set(CITY.map((c) => c.tz))]; } })();
  const here = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Zurich';
  const cityLabel = (z) => (z.city ? (lang() === 'en' ? z.city.en : z.city.de) : z.tz.split('/').pop().replace(/_/g, ' '));
  const placeSub = (z) => (z.city ? country(z.city.cc) : z.tz);

  function findCity(name, tz) {
    return CITY.find((c) => (c.de === name || c.en === name) && c.tz === tz) || null;
  }

  // ---------------------------------------------------------------- State
  // zones: [{ tz, city? }]; the first one is the reference (“home”)
  let zones = [], refDate = '', refMin = 0;

  function today(tz) {
    const w = wall(Date.now(), tz);
    return `${w.y}-${String(w.m).padStart(2, '0')}-${String(w.d).padStart(2, '0')}`;
  }
  function load() {
    // 1) link (#z=…&d=…&t=…), 2) last list on this device, 3) defaults
    const h = new URLSearchParams(location.hash.slice(1));
    let list = null;
    if (h.get('z')) list = h.get('z').split('|').map((s) => { const [tz, name] = s.split('~'); return { tz, name }; });
    if (!list) { try { list = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { list = null; } }
    if (!list || !list.length) {
      const home = CITY.find((c) => c.tz === here);
      list = [{ tz: here, name: home && home.de }, { tz: 'Europe/London', name: 'London' }, { tz: 'America/New_York', name: 'New York' }, { tz: 'Asia/Singapore', name: 'Singapur' }];
    }
    zones = list.filter((z) => z && ZONES.includes(z.tz) || (z && safeZone(z.tz))).map((z) => ({ tz: z.tz, city: z.name ? findCity(z.name, z.tz) : null }));
    if (!zones.length) zones = [{ tz: here, city: null }];
    refDate = /^\d{4}-\d{2}-\d{2}$/.test(h.get('d') || '') ? h.get('d') : today(zones[0].tz);
    const tm = (h.get('t') || '').match(/^(\d{1,2}):(\d{2})$/);
    if (tm) refMin = Math.min(1439, +tm[1] * 60 + +tm[2]);
    else { const w = wall(Date.now(), zones[0].tz); refMin = w.h * 60 + Math.floor(w.mi / 15) * 15; }
  }
  function safeZone(tz) { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(zones.map((z) => ({ tz: z.tz, name: z.city && z.city.de })))); } catch { /* private mode */ }
  }
  const refInstant = () => {
    const [y, m, d] = refDate.split('-').map(Number);
    return instant(y, m, d, Math.floor(refMin / 60), refMin % 60, zones[0].tz);
  };

  // ---------------------------------------------------------------- Rendering
  const two = (n) => String(n).padStart(2, '0');
  const hm = (w) => `${two(w.h)}:${two(w.mi)}`;
  function dayLabel(ms, tz, opts) {
    return new Intl.DateTimeFormat(lang() === 'en' ? 'en-GB' : 'de-CH', { timeZone: tz, ...opts }).format(new Date(ms));
  }
  const band = (h) => (h >= 8 && h < 18 ? 'work' : (h >= 7 && h < 8) || (h >= 18 && h < 21) ? 'edge' : 'night');

  function render() {
    const ms = refInstant(), home = zones[0].tz;
    $('#date').value = refDate;
    $('#time').value = `${two(Math.floor(refMin / 60))}:${two(refMin % 60)}`;
    const [y, m, d] = refDate.split('-').map(Number);
    const day0 = instant(y, m, d, 0, 0, home);               // the timeline: 24 hours of the reference day
    const homeDay = wall(ms, home);

    const list = $('#zones');
    list.textContent = '';
    const allWork = new Array(24).fill(true);
    const rows = zones.map((z, i) => {
      const w = wall(ms, z.tz), off = offset(ms, z.tz), summer = isSummer(ms, z.tz);
      const dd = Math.round((Date.UTC(w.y, w.m - 1, w.d) - Date.UTC(homeDay.y, homeDay.m - 1, homeDay.d)) / 86400000);
      const diff = off - offset(ms, home);
      const ch = nextChange(ms, z.tz);
      const cells = [];
      for (let k = 0; k < 24; k++) {
        const at = day0 + k * 3600000, lw = wall(at, z.tz);
        if (band(lw.h) !== 'work') allWork[k] = false;
        cells.push({ k, h: lw.h, mi: lw.mi, b: band(lw.h), midnight: lw.h === 0, day: lw.h === 0 ? dayLabel(at, z.tz, { weekday: 'short', day: 'numeric', month: 'numeric' }) : '' });
      }
      return { z, i, w, off, summer, dd, diff, ch, cells };
    });

    for (const r of rows) {
      const el = document.createElement('div');
      el.className = 'zone' + (r.i === 0 ? ' home' : '');
      const abbr = zoneName(ms, r.z.tz, 'short'), long = zoneName(ms, r.z.tz, 'long');
      const changeTxt = r.ch ? `${t('Umstellung am')} ${dayLabel(r.ch.at, r.z.tz, { day: 'numeric', month: 'short', year: 'numeric' })}: ${fmtOffset(r.ch.from)} → ${fmtOffset(r.ch.to)}` : t('Keine Zeitumstellung');
      el.innerHTML = `
        <div class="z-head">
          <div class="z-place">
            <div class="z-name" data-no-i18n></div>
            <div class="z-sub" data-no-i18n></div>
          </div>
          <div class="z-time">
            <div class="z-clock" data-no-i18n>${hm(r.w)}${r.dd ? `<sup>${r.dd > 0 ? '+' : '−'}${Math.abs(r.dd)}</sup>` : ''}</div>
            <div class="z-date" data-no-i18n>${dayLabel(ms, r.z.tz, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
          </div>
        </div>
        <div class="z-meta">
          <span class="tag ${r.summer ? 'sun' : ''}" title="${long}" data-no-i18n>${fmtOffset(r.off)}${abbr && !/^GMT|^UTC/.test(abbr) ? ' · ' + abbr : ''}</span>
          <span class="tag">${r.summer ? t('Sommerzeit') : r.ch || isSummerZone(r.z.tz, ms) ? t('Winterzeit') : t('Keine Sommerzeit')}</span>
          ${r.i ? `<span class="tag">${r.diff === 0 ? t('gleiche Zeit') : (r.diff > 0 ? '+' : '−') + fmtDiff(Math.abs(r.diff))}</span>` : `<span class="tag home-tag">${t('Bezug')}</span>`}
          <span class="z-change" title="${changeTxt}">${changeTxt}</span>
          <span class="z-tools">
            ${r.i ? `<button type="button" data-a="home" title="${t('Als Bezug setzen')}">⌂</button>` : ''}
            ${r.i > 1 ? `<button type="button" data-a="up" title="${t('Nach oben')}">↑</button>` : ''}
            ${zones.length > 1 ? `<button type="button" data-a="del" title="${t('Entfernen')}">✕</button>` : ''}
          </span>
        </div>`;
      el.querySelector('.z-name').textContent = cityLabel(r.z);
      el.querySelector('.z-sub').textContent = placeSub(r.z) + (long ? ' · ' + long : '');
      el.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => act(r.i, b.dataset.a)));
      list.append(el);
    }

    // timeline
    const tl = $('#timeline');
    tl.textContent = '';
    const head = document.createElement('div');
    head.className = 'tl-row tl-top';
    head.innerHTML = `<div class="tl-label"></div>` + allWork.map((ok, k) => `<button type="button" class="tl-cell tl-pick${ok ? ' ok' : ''}${Math.floor(refMin / 60) === k ? ' sel' : ''}" data-k="${k}" title="${ok ? t('Für alle in der Arbeitszeit') : ''}">${ok ? '✓' : ''}</button>`).join('');
    tl.append(head);
    for (const r of rows) {
      const row = document.createElement('div');
      row.className = 'tl-row';
      row.innerHTML = `<div class="tl-label" data-no-i18n></div>` + r.cells.map((c) =>
        `<button type="button" class="tl-cell ${c.b}${Math.floor(refMin / 60) === c.k ? ' sel' : ''}${c.midnight ? ' mid' : ''}" data-k="${c.k}" data-no-i18n>${c.midnight ? `<i>${c.day}</i>` : ''}${c.h}${c.mi ? `<small>:${two(c.mi)}</small>` : ''}</button>`).join('');
      row.querySelector('.tl-label').textContent = cityLabel(r.z);
      tl.append(row);
    }
    tl.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => { refMin = +b.dataset.k * 60 + (refMin % 60); update(); }));
    const n = allWork.filter(Boolean).length;
    $('#overlap').textContent = n ? `${n} ${n === 1 ? t('Stunde passt') : t('Stunden passen')} ${t('für alle (8–18 Uhr Ortszeit, mit ✓ markiert).')}` : t('Keine gemeinsame Stunde in der Arbeitszeit (8–18 Uhr) – grün ist Arbeitszeit, gelb Randzeit.');
    $('#home-name').textContent = cityLabel(zones[0]);
    // keep the selected hour in view
    const sel = tl.querySelector('.tl-top .sel');
    if (sel && !render.scrolled) { tl.scrollLeft = Math.max(0, sel.offsetLeft - tl.clientWidth / 2); render.scrolled = true; }
  }
  const isSummerZone = (tz, ms) => { const y = wall(ms, tz).y; return offset(Date.UTC(y, 0, 1), tz) !== offset(Date.UTC(y, 6, 1), tz); };
  const fmtDiff = (min) => `${Math.floor(min / 60)}${min % 60 ? ':' + two(min % 60) : ''} h`;

  function update() { save(); render(); history.replaceState(null, '', location.pathname + location.search); }

  function act(i, a) {
    if (a === 'del') zones.splice(i, 1);
    else if (a === 'up') [zones[i - 1], zones[i]] = [zones[i], zones[i - 1]];
    else if (a === 'home') {
      // keep the same moment, seen from the new reference place
      const ms = refInstant();
      const [z] = zones.splice(i, 1);
      zones.unshift(z);
      const w = wall(ms, z.tz);
      refDate = `${w.y}-${two(w.m)}-${two(w.d)}`;
      refMin = w.h * 60 + w.mi;
    }
    update();
  }

  // ---------------------------------------------------------------- Inputs
  $('#date').addEventListener('change', (e) => { if (e.target.value) { refDate = e.target.value; update(); } });
  $('#time').addEventListener('change', (e) => { const [h, m] = (e.target.value || '0:0').split(':').map(Number); refMin = h * 60 + (m || 0); update(); });
  $('#now').addEventListener('click', () => { const w = wall(Date.now(), zones[0].tz); refDate = today(zones[0].tz); refMin = w.h * 60 + w.mi; update(); });
  document.querySelectorAll('[data-shift]').forEach((b) => b.addEventListener('click', () => {
    const [y, m, d] = refDate.split('-').map(Number), x = new Date(Date.UTC(y, m - 1, d + +b.dataset.shift));
    refDate = x.toISOString().slice(0, 10); update();
  }));

  // search: city names (DE/EN), countries, IANA ids
  const q = $('#q'), sug = $('#sug');
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let hits = [], active = 0;
  function search() {
    const s = norm(q.value.trim());
    hits = [];
    if (s) {
      for (const c of CITY) {
        const hay = norm(`${c.de} ${c.en} ${country(c.cc)} ${c.tz}`);
        if (hay.includes(s)) hits.push({ tz: c.tz, city: c, score: norm(c.de).startsWith(s) || norm(c.en).startsWith(s) ? 0 : 1 });
      }
      for (const tz of ZONES) {
        if (hits.some((h) => h.tz === tz)) continue;
        if (norm(tz.replace(/_/g, ' ')).includes(s) || norm(zoneName(Date.now(), tz, 'long')).includes(s)) hits.push({ tz, city: null, score: 2 });
      }
      if (/^(utc|gmt)$/.test(s)) hits.unshift({ tz: 'UTC', city: null, score: -1 });
      hits.sort((a, b) => a.score - b.score);
      hits = hits.slice(0, 8);
    }
    active = 0;
    drawSug();
  }
  function drawSug() {
    sug.textContent = '';
    sug.hidden = !hits.length;
    hits.forEach((h, i) => {
      const li = document.createElement('li');
      li.className = i === active ? 'active' : '';
      const off = fmtOffset(offset(Date.now(), h.tz));
      li.innerHTML = '<b data-no-i18n></b><span data-no-i18n></span><em data-no-i18n></em>';
      li.querySelector('b').textContent = h.city ? (lang() === 'en' ? h.city.en : h.city.de) : h.tz.split('/').pop().replace(/_/g, ' ');
      li.querySelector('span').textContent = h.city ? country(h.city.cc) : h.tz;
      li.querySelector('em').textContent = off;
      li.addEventListener('mousedown', (e) => { e.preventDefault(); pick(h); });
      sug.append(li);
    });
  }
  function pick(h) {
    if (zones.some((z) => z.tz === h.tz && (z.city && z.city.de) === (h.city && h.city.de))) { toast(t('Dieser Ort ist schon in der Liste.')); }
    else zones.push({ tz: h.tz, city: h.city });
    q.value = ''; hits = []; drawSug();
    update();
  }
  q.addEventListener('input', search);
  q.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && hits.length) { active = (active + 1) % hits.length; drawSug(); e.preventDefault(); }
    else if (e.key === 'ArrowUp' && hits.length) { active = (active - 1 + hits.length) % hits.length; drawSug(); e.preventDefault(); }
    else if (e.key === 'Enter' && hits[active]) { pick(hits[active]); e.preventDefault(); }
    else if (e.key === 'Escape') { hits = []; drawSug(); }
  });
  q.addEventListener('blur', () => setTimeout(() => { hits = []; drawSug(); }, 100));

  // ---------------------------------------------------------------- Share / copy / calendar
  function summaryText() {
    const ms = refInstant();
    return zones.map((z) => `${cityLabel(z)}: ${dayLabel(ms, z.tz, { weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric' })}, ${hm(wall(ms, z.tz))} (${fmtOffset(offset(ms, z.tz))})`).join('\n');
  }
  async function copy(text, msg) {
    try { await navigator.clipboard.writeText(text); toast(msg); }
    catch { toast(t('Kopieren nicht möglich.'), true); }
  }
  $('#copy').addEventListener('click', () => copy(summaryText(), t('Zeiten kopiert.')));
  $('#link').addEventListener('click', () => {
    const z = zones.map((x) => x.tz + (x.city ? '~' + x.city.de : '')).join('|');
    const url = `${location.origin}${location.pathname}#z=${encodeURIComponent(z)}&d=${refDate}&t=${two(Math.floor(refMin / 60))}:${two(refMin % 60)}`;
    copy(url, t('Link kopiert – er enthält nur die Orte und die Uhrzeit.'));
  });
  // iCalendar: lines longer than 75 bytes continue on the next line after a space
  function fold(line) {
    const out = [];
    let cur = '', bytes = 0;
    for (const ch of line) {
      const n = new TextEncoder().encode(ch).length;
      if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
      cur += ch; bytes += n;
    }
    out.push(cur);
    return out.join('\r\n ');
  }
  $('#ics').addEventListener('click', () => {
    const ms = refInstant(), dur = +$('#dur').value;
    const stamp = (x) => new Date(x).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const title = ($('#title').value.trim() || t('Termin')).replace(/[\\;,]/g, (c) => '\\' + c);
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CM Ventures//Time Zones//DE', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      `UID:${crypto.randomUUID ? crypto.randomUUID() : Date.now() + '@cmventures'}`, `DTSTAMP:${stamp(Date.now())}`,
      `DTSTART:${stamp(ms)}`, `DTEND:${stamp(ms + dur * 60000)}`, `SUMMARY:${title}`,
      `DESCRIPTION:${summaryText().replace(/[;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n')}`, 'END:VEVENT', 'END:VCALENDAR']
      .map(fold).join('\r\n');
    download(new Blob([ics], { type: 'text/calendar' }), `${title.replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'termin'}.ics`);
  });

  function route() {
    const about = location.hash === '#about';
    $('#home').classList.toggle('hidden', about);
    $('#about').classList.toggle('hidden', !about);
    if (about) window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', () => { if (location.hash.startsWith('#z=')) { load(); render(); } route(); });
  document.addEventListener('langchange', render);
  load();
  route();
  render();
  window.CMV.registerSW();
  window.__time = { wall, offset, instant, isSummer, nextChange, get zones() { return zones; }, refInstant };
})();
