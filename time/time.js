/* Time zones: plan calls across places. All time-zone rules (incl. summer / winter time) come from the browser's
   own database (Intl API); the map data ships with the page. Nothing is loaded from elsewhere, nothing is sent. */
(() => {
  const { $, toast, download } = window.CMV;
  const t = (s) => window.i18n(s);
  const lang = () => (window.I18N && window.I18N.lang === 'en' ? 'en' : 'de');
  const KEY = 'cmv-time-places';
  const two = (n) => String(n).padStart(2, '0');

  // ---------------------------------------------------------------- Time-zone math
  const fmtCache = new Map();
  function fmt(tz) {
    if (!fmtCache.has(tz)) fmtCache.set(tz, new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }));
    return fmtCache.get(tz);
  }
  function wall(ms, tz) {
    const p = {};
    for (const x of fmt(tz).formatToParts(new Date(ms))) p[x.type] = +x.value;
    return { y: p.year, m: p.month, d: p.day, h: p.hour % 24, mi: p.minute, s: p.second };
  }
  function offset(ms, tz) {
    const w = wall(ms, tz);
    return Math.round((Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - Math.floor(ms / 1000) * 1000) / 60000);
  }
  function instant(y, m, d, h, mi, tz) {
    const guess = Date.UTC(y, m - 1, d, h, mi);
    let ms = guess - offset(guess, tz) * 60000;
    ms = guess - offset(ms, tz) * 60000;
    return ms;
  }
  const hasDst = (ms, tz) => { const y = wall(ms, tz).y; return offset(Date.UTC(y, 0, 1), tz) !== offset(Date.UTC(y, 6, 1), tz); };
  function isSummer(ms, tz) {
    const y = wall(ms, tz).y, jan = offset(Date.UTC(y, 0, 1), tz), jul = offset(Date.UTC(y, 6, 1), tz);
    return jan !== jul && offset(ms, tz) > Math.min(jan, jul);
  }
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
    return `UTC${s}${Math.floor(a / 60)}${a % 60 ? ':' + two(a % 60) : ''}`;
  };
  function zoneName(ms, tz, style) {
    try {
      const p = new Intl.DateTimeFormat(lang() === 'en' ? 'en-GB' : 'de-CH', { timeZone: tz, timeZoneName: style }).formatToParts(new Date(ms));
      return (p.find((x) => x.type === 'timeZoneName') || {}).value || '';
    } catch { return ''; }
  }
  // “Mitteleuropäische Sommerzeit (MESZ) · UTC+2” – short form only when it is a real abbreviation
  function zoneText(ms, tz) {
    const long = zoneName(ms, tz, 'long'), short = zoneName(ms, tz, 'short');
    const abbr = short && !/^(GMT|UTC)/.test(short) ? short : '';
    const off = fmtOffset(offset(ms, tz));
    return { long: /^(GMT|UTC)[+−-]/.test(long) ? '' : long, abbr, off };
  }
  // the clock format people use there: 12 h (5:30 AM) e.g. in the USA, India, Australia – 24 h in most of Europe
  const h12Cache = new Map();
  function uses12h(cc) {
    if (!cc) return false;
    if (!h12Cache.has(cc)) {
      let hc = 'h23';
      // the country's main language decides (Portugal → pt-PT: 24 h; USA → en-US: 12 h)
      try { hc = new Intl.DateTimeFormat(new Intl.Locale('und-' + cc).maximize().language + '-' + cc, { hour: 'numeric' }).resolvedOptions().hourCycle; } catch { /* unknown region */ }
      h12Cache.set(cc, hc === 'h11' || hc === 'h12');
    }
    return h12Cache.get(cc);
  }
  const ampm = (ms, tz) => new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(ms));
  const fmtDiff = (min) => `${Math.floor(min / 60)}${min % 60 ? ':' + two(min % 60) : ''} h`;

  // ---------------------------------------------------------------- Places & zones
  const CITY = window.CITIES.map(([de, en, cc, tz, lat, lon]) => ({ de, en, cc, tz, lat, lon }));
  const ZC = window.ZONE_COORDS || {};
  const ZONES = (() => { try { return Intl.supportedValuesOf('timeZone'); } catch { return Object.keys(ZC); } })();
  const valid = (tz) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } };
  const here = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Zurich';
  let dn = null;
  const country = (cc) => {
    if (!cc) return '';
    try { if (!dn || dn.lang !== lang()) dn = { lang: lang(), f: new Intl.DisplayNames([lang()], { type: 'region' }) }; return dn.f.of(cc); }
    catch { return cc; }
  };
  const zoneCity = (tz) => tz.split('/').pop().replace(/_/g, ' ');

  // common names and abbreviations people type – each stands for a representative IANA zone
  const ALIASES = [
    ['utc', 'UTC (Weltzeit)', 'UTC (Coordinated Universal Time)', 'UTC', 'utc gmt z zulu weltzeit universal'],
    ['cet', 'Mitteleuropäische Zeit (MEZ/MESZ)', 'Central European Time (CET/CEST)', 'Europe/Berlin', 'cet cest mez mesz central european mitteleuropa'],
    ['wet', 'Westeuropäische Zeit (WEZ/WESZ)', 'Western European Time (WET/WEST)', 'Europe/Lisbon', 'wet west wez wesz western european westeuropa'],
    ['uk', 'Britische Zeit (GMT/BST)', 'UK time (GMT/BST)', 'Europe/London', 'bst british uk grossbritannien'],
    ['eet', 'Osteuropäische Zeit (OEZ/OESZ)', 'Eastern European Time (EET/EEST)', 'Europe/Athens', 'eet eest oez oesz eastern european osteuropa'],
    ['msk', 'Moskauer Zeit (MSK)', 'Moscow Time (MSK)', 'Europe/Moscow', 'msk moscow moskau'],
    ['gst', 'Golf-Zeit (GST)', 'Gulf Standard Time (GST)', 'Asia/Dubai', 'gst gulf golf'],
    ['pkt', 'Pakistan-Zeit (PKT)', 'Pakistan Time (PKT)', 'Asia/Karachi', 'pkt pakistan'],
    ['ist', 'Indische Zeit (IST)', 'India Standard Time (IST)', 'Asia/Kolkata', 'ist india indien'],
    ['ict', 'Indochina-Zeit (ICT)', 'Indochina Time (ICT)', 'Asia/Bangkok', 'ict indochina'],
    ['wib', 'Westindonesische Zeit (WIB)', 'Western Indonesia Time (WIB)', 'Asia/Jakarta', 'wib indonesia indonesien'],
    ['sgt', 'Singapur-Zeit (SGT)', 'Singapore Time (SGT)', 'Asia/Singapore', 'sgt singapore singapur'],
    ['hkt', 'Hongkong-Zeit (HKT)', 'Hong Kong Time (HKT)', 'Asia/Hong_Kong', 'hkt hong kong hongkong'],
    ['cst-cn', 'China-Zeit (CST China)', 'China Standard Time', 'Asia/Shanghai', 'china beijing peking'],
    ['pht', 'Philippinen-Zeit (PHT)', 'Philippine Time (PHT)', 'Asia/Manila', 'pht philippines philippinen'],
    ['jst', 'Japanische Zeit (JST)', 'Japan Standard Time (JST)', 'Asia/Tokyo', 'jst japan'],
    ['kst', 'Koreanische Zeit (KST)', 'Korea Standard Time (KST)', 'Asia/Seoul', 'kst korea'],
    ['awst', 'Westaustralien (AWST)', 'Australian Western (AWST)', 'Australia/Perth', 'awst western australia westaustralien'],
    ['acst', 'Zentralaustralien (ACST/ACDT)', 'Australian Central (ACST/ACDT)', 'Australia/Adelaide', 'acst acdt central australia'],
    ['aest', 'Ostaustralien (AEST/AEDT)', 'Australian Eastern (AEST/AEDT)', 'Australia/Sydney', 'aest aedt eastern australia ostaustralien'],
    ['nzst', 'Neuseeland (NZST/NZDT)', 'New Zealand (NZST/NZDT)', 'Pacific/Auckland', 'nzst nzdt new zealand neuseeland'],
    ['hst', 'Hawaii (HST)', 'Hawaii (HST)', 'Pacific/Honolulu', 'hst hawaii'],
    ['akst', 'Alaska (AKST/AKDT)', 'Alaska (AKST/AKDT)', 'America/Anchorage', 'akst akdt alaska'],
    ['pt', 'Pazifik-Zeit USA (PST/PDT)', 'Pacific Time US (PST/PDT)', 'America/Los_Angeles', 'pt pst pdt pacific time westküste west coast'],
    ['mt', 'Mountain Time USA (MST/MDT)', 'Mountain Time US (MST/MDT)', 'America/Denver', 'mt mst mdt mountain'],
    ['az', 'Arizona (MST, ohne Sommerzeit)', 'Arizona (MST, no DST)', 'America/Phoenix', 'arizona'],
    ['ct', 'Central Time USA (CST/CDT)', 'Central Time US (CST/CDT)', 'America/Chicago', 'ct cst cdt central time'],
    ['et', 'Eastern Time USA (EST/EDT)', 'Eastern Time US (EST/EDT)', 'America/New_York', 'et est edt eastern time ostküste east coast'],
    ['at', 'Atlantik-Zeit (AST/ADT)', 'Atlantic Time (AST/ADT)', 'America/Halifax', 'ast adt atlantic atlantik'],
    ['brt', 'Brasília-Zeit (BRT)', 'Brasília Time (BRT)', 'America/Sao_Paulo', 'brt brasilia brazil brasilien'],
    ['art', 'Argentinien-Zeit (ART)', 'Argentina Time (ART)', 'America/Argentina/Buenos_Aires', 'art argentina argentinien'],
    ['wat', 'Westafrika-Zeit (WAT)', 'West Africa Time (WAT)', 'Africa/Lagos', 'wat west africa westafrika'],
    ['cat', 'Zentralafrika-Zeit (CAT)', 'Central Africa Time (CAT)', 'Africa/Maputo', 'cat central africa zentralafrika'],
    ['sast', 'Südafrika-Zeit (SAST)', 'South Africa Time (SAST)', 'Africa/Johannesburg', 'sast south africa südafrika'],
    ['eat', 'Ostafrika-Zeit (EAT)', 'East Africa Time (EAT)', 'Africa/Nairobi', 'eat east africa ostafrika'],
  ].map(([key, de, en, tz, terms]) => ({ key, de, en, tz, terms }));
  const aliasByKey = Object.fromEntries(ALIASES.map((a) => [a.key, a]));
  // UTC±h → fixed zone (Etc/GMT has the sign inverted); half hours via zones without summer time
  const HALF = { 530: 'Asia/Kolkata', 545: 'Asia/Kathmandu', 630: 'Asia/Yangon', 930: 'Australia/Darwin', '-930': 'Pacific/Marquesas', 430: 'Asia/Kabul', 330: 'Asia/Tehran' };
  function fixedZone(s) {
    const m = s.replace(/\s+/g, '').match(/^(?:utc|gmt)?([+−-])(\d{1,2})(?::?(\d{2}))?$/i);
    if (!m) return null;
    const sign = m[1] === '+' ? 1 : -1, h = +m[2], mi = +(m[3] || 0);
    if (h > 14 || ![0, 30, 45].includes(mi)) return null;
    if (!mi) return { tz: h === 0 ? 'UTC' : `Etc/GMT${sign > 0 ? '-' : '+'}${h}`, label: fmtOffset(sign * h * 60) };
    const tz = HALF[String(sign * (h * 100 + mi))];
    return tz ? { tz, label: fmtOffset(sign * (h * 60 + mi)) } : null;
  }

  // ---------------------------------------------------------------- State
  // place: { tz, city?, alias?, fixed?, name? (own label), auto (tz of the city/alias, to undo an override) }
  let places = [], refDate = '', refMin = 0;
  const placeTitle = (p) => p.name || (p.city ? (lang() === 'en' ? p.city.en : p.city.de) : p.alias ? (lang() === 'en' ? p.alias.en : p.alias.de) : p.fixed || zoneCity(p.tz));
  function placeSub(p) {
    if (p.city) return country(p.city.cc);
    if (p.alias) return t('Zeitzone');
    if (p.fixed) return t('Feste Zeitverschiebung');
    const z = ZC[p.tz];
    return z ? country(z[2]) : p.tz;
  }
  const placeCountry = (p) => (p.city ? p.city.cc : ZC[p.tz] ? ZC[p.tz][2] : null);
  function coords(p) {
    if (p.city && p.city.lat != null) return [p.city.lat, p.city.lon];
    const z = ZC[p.tz] || (p.auto && ZC[p.auto]);
    return z ? [z[0], z[1]] : null;
  }
  const findCity = (name, tz) => CITY.find((c) => c.de === name && (!tz || c.tz === tz)) || CITY.find((c) => c.de === name) || null;

  function today(tz) { const w = wall(Date.now(), tz); return `${w.y}-${two(w.m)}-${two(w.d)}`; }
  function serialize(p) {
    return [p.tz, p.city ? 'c:' + p.city.de : p.alias ? 'a:' + p.alias.key : p.fixed ? 'f:' + p.fixed : '', p.name || ''].join('~');
  }
  function deserialize(s) {
    const [tz, kind = '', name = ''] = s.split('~');
    if (!tz || !valid(tz)) return null;
    const p = { tz, name: name || null };
    if (kind.startsWith('c:')) { p.city = findCity(kind.slice(2)); p.auto = p.city ? p.city.tz : tz; }
    else if (kind.startsWith('a:')) { p.alias = aliasByKey[kind.slice(2)] || null; p.auto = p.alias ? p.alias.tz : tz; }
    else if (kind.startsWith('f:')) { p.fixed = kind.slice(2); p.auto = tz; }
    else p.auto = tz;
    return p;
  }
  function load() {
    const h = new URLSearchParams(location.hash.slice(1));
    let list = null;
    if (h.get('p')) list = h.get('p').split('|');
    if (!list) { try { list = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { list = null; } }
    places = (list || []).map(deserialize).filter(Boolean);
    if (!places.length) {
      const home = CITY.find((c) => c.tz === here);
      places = [home ? { tz: home.tz, city: home, auto: home.tz } : { tz: here, auto: here }];
    }
    refDate = /^\d{4}-\d{2}-\d{2}$/.test(h.get('d') || '') ? h.get('d') : today(places[0].tz);
    const tm = (h.get('t') || '').match(/^(\d{1,2}):(\d{2})$/);
    if (tm) refMin = Math.min(1439, +tm[1] * 60 + +tm[2]);
    else { const w = wall(Date.now(), places[0].tz); refMin = w.h * 60 + Math.floor(w.mi / 15) * 15; }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(places.map(serialize))); } catch { /* private mode */ } }
  const refInstant = () => { const [y, m, d] = refDate.split('-').map(Number); return instant(y, m, d, Math.floor(refMin / 60), refMin % 60, places[0].tz); };
  function update() { save(); render(); if (location.hash && location.hash !== '#about') history.replaceState(null, '', location.pathname + location.search); }

  // ---------------------------------------------------------------- Search (place, country or time zone)
  const q = $('#q'), sug = $('#sug');
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
  let hits = [], active = 0;
  function search() {
    const raw = q.value.trim(), s = norm(raw);
    hits = [];
    if (s) {
      const fixed = fixedZone(raw);
      if (fixed) hits.push({ kind: 'fixed', tz: fixed.tz, fixed: fixed.label, score: -2 });
      for (const a of ALIASES) {
        const words = norm(`${a.terms} ${a.de} ${a.en}`).split(/[\s(),/]+/);
        if (words.some((w) => w === s) || (s.length >= 3 && norm(`${a.de} ${a.en} ${a.terms}`).includes(s))) hits.push({ kind: 'alias', tz: a.tz, alias: a, score: words.includes(s) ? -1 : 2 });
      }
      for (const c of CITY) {
        const de = norm(c.de), en = norm(c.en), land = norm(country(c.cc) || '');
        if (de.startsWith(s) || en.startsWith(s)) hits.push({ kind: 'city', tz: c.tz, city: c, score: 0 });
        else if (de.includes(s) || en.includes(s) || (s.length >= 3 && land.startsWith(s))) hits.push({ kind: 'city', tz: c.tz, city: c, score: 1 });
      }
      if (s.length >= 2) for (const tz of ZONES) {
        if (hits.some((h) => h.tz === tz && h.kind !== 'alias')) continue;
        const z = ZC[tz];
        if (norm(tz.replace(/_/g, ' ')).includes(s) || (z && s.length >= 3 && norm(country(z[2]) || '').startsWith(s))) hits.push({ kind: 'zone', tz, score: 3 });
      }
      hits.sort((a, b) => a.score - b.score);
      hits = hits.slice(0, 9);
    }
    active = 0;
    drawSug();
  }
  function drawSug() {
    sug.textContent = '';
    sug.hidden = !hits.length;
    const ms = refInstant();
    hits.forEach((h, i) => {
      const z = zoneText(ms, h.tz);
      const li = document.createElement('li');
      li.className = i === active ? 'active' : '';
      li.setAttribute('role', 'option');
      li.innerHTML = '<div class="s-main"><b></b><span></span></div><div class="s-zone"><em></em><small></small></div>';
      const title = h.kind === 'city' ? (lang() === 'en' ? h.city.en : h.city.de) : h.kind === 'alias' ? (lang() === 'en' ? h.alias.en : h.alias.de) : h.kind === 'fixed' ? h.fixed : zoneCity(h.tz);
      const sub = h.kind === 'city' ? country(h.city.cc) : h.kind === 'zone' ? `${ZC[h.tz] ? country(ZC[h.tz][2]) + ' · ' : ''}${h.tz}` : h.kind === 'alias' ? `${t('Zeitzone')} · ${h.tz}` : t('Feste Zeitverschiebung');
      li.querySelector('b').textContent = title;
      li.querySelector('span').textContent = sub;
      li.querySelector('em').textContent = [z.abbr, z.off].filter(Boolean).join(' · ');
      li.querySelector('small').textContent = z.long;
      li.addEventListener('mousedown', (e) => { e.preventDefault(); pick(h); });
      sug.append(li);
    });
  }
  function pick(h) {
    const p = { tz: h.tz, auto: h.tz };
    if (h.kind === 'city') p.city = h.city;
    if (h.kind === 'alias') p.alias = h.alias;
    if (h.kind === 'fixed') p.fixed = h.fixed;
    if (places.some((x) => serialize(x) === serialize(p))) toast(t('Dieser Ort ist schon in der Liste.'));
    else { places.push(p); toast(`${placeTitle(p)} ${t('hinzugefügt')}`); }
    q.value = ''; hits = []; drawSug();
    update();
  }
  q.addEventListener('input', search);
  q.addEventListener('focus', () => { if (q.value.trim()) search(); });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && hits.length) { active = (active + 1) % hits.length; drawSug(); e.preventDefault(); }
    else if (e.key === 'ArrowUp' && hits.length) { active = (active - 1 + hits.length) % hits.length; drawSug(); e.preventDefault(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (hits[active]) pick(hits[active]); else if (q.value.trim()) toast(t('Nichts gefunden – versuche eine grössere Stadt, ein Land oder eine Zeitzone (z. B. CET, EST, UTC+5).'), true); }
    else if (e.key === 'Escape') { hits = []; drawSug(); }
  });
  $('#add').addEventListener('click', () => { if (hits[active]) pick(hits[active]); else { search(); if (hits[0]) pick(hits[0]); else q.focus(); } });
  q.addEventListener('blur', () => setTimeout(() => { hits = []; drawSug(); }, 120));

  // ---------------------------------------------------------------- Time-zone choices for a place
  let zoneOptions = null;
  function zoneList(ms) {
    // all IANA zones, sorted by their offset on the chosen date
    zoneOptions = ZONES.map((tz) => ({ tz, off: offset(ms, tz) })).sort((a, b) => a.off - b.off || a.tz.localeCompare(b.tz));
    zoneOptions.key = refDate;
    return zoneOptions;
  }
  function zoneSelect(p, ms) {
    const sel = document.createElement('select');
    sel.className = 'z-select';
    sel.setAttribute('aria-label', t('Zeitzone anpassen'));
    sel.setAttribute('data-no-i18n', '');
    const auto = document.createElement('option');
    auto.value = '';
    auto.textContent = `${t('Automatisch')} – ${p.auto}`;
    sel.append(auto);
    if (p.tz !== p.auto) { const cur = document.createElement('option'); cur.value = p.tz; cur.textContent = `${fmtOffset(offset(ms, p.tz))} · ${p.tz.replace(/_/g, ' ')}`; sel.append(cur); }
    sel.value = p.tz === p.auto ? '' : p.tz;
    // the full list (≈ 400 zones) is only built when the field is opened – keeps the slider fast
    const fill = () => {
      if (sel.dataset.full) return;
      sel.dataset.full = '1';
      const keep = sel.value;
      sel.length = 1;
      const grp = document.createElement('optgroup');
      grp.label = t('Alle Zeitzonen (nach Abstand zu UTC)');
      const opts = zoneOptions && zoneOptions.key === refDate ? zoneOptions : zoneList(ms);
      for (const o of opts) {
        const op = document.createElement('option');
        op.value = o.tz;
        op.textContent = `${fmtOffset(o.off)} · ${o.tz.replace(/_/g, ' ')}`;
        grp.append(op);
      }
      sel.append(grp);
      sel.value = keep;
    };
    sel.addEventListener('pointerdown', fill);
    sel.addEventListener('focus', fill);
    sel.addEventListener('keydown', fill);
    return sel;
  }

  // ---------------------------------------------------------------- World map
  const W = 360, TOP = -84, BOTTOM = 60, H = BOTTOM - TOP;
  const X = (lon) => lon, Y = (lat) => -lat;
  function sun(ms) {
    // subsolar point (accurate to a fraction of a degree – plenty for shading day and night)
    const d = ms / 86400000 - 10957.5;
    const g = (357.529 + 0.98560028 * d) * Math.PI / 180, q2 = 280.459 + 0.98564736 * d;
    const L = (q2 + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * Math.PI / 180, e = (23.439 - 0.00000036 * d) * Math.PI / 180;
    const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) * 180 / Math.PI, dec = Math.asin(Math.sin(e) * Math.sin(L));
    let eqt = (q2 - ra) / 15; eqt = ((eqt % 24) + 36) % 24 - 12;      // equation of time in hours
    const utcH = ((ms / 3600000) % 24 + 24) % 24;
    let lon = -15 * (utcH - 12 + eqt);
    lon = ((lon + 540) % 360) - 180;
    return { lat: dec * 180 / Math.PI, lon, dec };
  }
  function nightPath(ms) {
    const s = sun(ms), pts = [];
    const tanDec = Math.tan(s.dec) || 1e-6;
    for (let lon = -180; lon <= 180; lon += 3) {
      const lat = Math.atan(-Math.cos((lon - s.lon) * Math.PI / 180) / tanDec) * 180 / Math.PI;
      pts.push(`${X(lon)} ${Y(lat).toFixed(1)}`);
    }
    const pole = s.dec > 0 ? Y(-90) : Y(90);
    return `M-180 ${pole}L${pts.join('L')}L180 ${pole}Z`;
  }
  function renderMap(ms, rows) {
    const svg = $('#map');
    svg.setAttribute('viewBox', `-180 ${TOP} ${W} ${H}`);
    let bands = '';
    for (let k = -12; k <= 12; k++) {
      const x0 = Math.max(-180, k * 15 - 7.5), x1 = Math.min(180, k * 15 + 7.5);
      bands += `<rect class="band ${k % 2 ? 'odd' : ''}" x="${x0}" y="${TOP}" width="${x1 - x0}" height="${H}"/>`;
      if (k > -12 && k < 12 || k === 12) bands += `<text class="band-label" x="${k * 15}" y="${BOTTOM - 2}">${k > 0 ? '+' : k < 0 ? '−' : '±'}${Math.abs(k)}</text>`;
    }
    // the band each place actually uses (its real offset on that date), highlighted
    const used = new Map();
    rows.forEach((r) => { if (!used.has(r.off)) used.set(r.off, r); });
    let hi = '';
    for (const off of used.keys()) {
      const cx = (off / 60) * 15, x0 = Math.max(-180, cx - 7.5), x1 = Math.min(180, cx + 7.5);
      hi += `<rect class="band-hi" x="${x0}" y="${TOP}" width="${x1 - x0}" height="${H}"/><text class="band-hi-label" x="${cx}" y="${TOP + 6}">${fmtOffset(off).replace('UTC', '')}</text>`;
    }
    const pins = rows.map((r, i) => {
      const c = coords(r.p);
      if (!c) return '';
      const [lat, lon] = c, below = i % 2 === 1;
      const label = `${placeTitle(r.p)} ${two(r.w.h)}:${two(r.w.mi)}${uses12h(placeCountry(r.p)) ? ` (${ampm(ms, r.p.tz)})` : ''}`;
      const anchor = lon > 120 ? 'end' : lon < -150 ? 'start' : 'middle';
      return `<g class="pin${i === 0 ? ' home' : ''}"><circle cx="${X(lon)}" cy="${Y(lat)}" r="2.2"/>
        <text x="${X(lon)}" y="${Y(lat) + (below ? 7.5 : -4)}" text-anchor="${anchor}">${esc(label)}</text></g>`;
    }).join('');
    svg.innerHTML = `<rect class="sea" x="-180" y="${TOP}" width="${W}" height="${H}"/>${bands}${hi}
      <path class="land" d="${window.WORLD_LAND || ''}"/>
      <path class="night" d="${nightPath(ms)}"/>${pins}`;
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // tap on the map: add the nearest known city (or time zone location)
  $('#map').addEventListener('click', (e) => {
    const svg = $('#map'), pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    const lon = p.x, lat = -p.y;
    const dist = (a, b) => Math.hypot((a - lat), (b - lon) * Math.cos(lat * Math.PI / 180));
    let best = null, bd = 7;
    for (const c of CITY) { const d = dist(c.lat, c.lon); if (d < bd) { bd = d; best = { kind: 'city', tz: c.tz, city: c }; } }
    if (!best) for (const [tz, z] of Object.entries(ZC)) { if (!valid(tz)) continue; const d = dist(z[0], z[1]); if (d < bd) { bd = d; best = { kind: 'zone', tz }; } }
    if (best) pick(best); else toast(t('Dort ist kein Ort in der Nähe – bitte über die Suche hinzufügen.'));
  });

  // ---------------------------------------------------------------- Rendering
  function dayLabel(ms, tz, opts) { return new Intl.DateTimeFormat(lang() === 'en' ? 'en-GB' : 'de-CH', { timeZone: tz, ...opts }).format(new Date(ms)); }
  const band = (h) => (h >= 8 && h < 18 ? 'work' : (h >= 7 && h < 8) || (h >= 18 && h < 21) ? 'edge' : 'night');

  // per day: next clock change of a zone (expensive to search, the same all day)
  const changeCache = new Map();
  function changeFor(tz) {
    const k = tz + '|' + refDate;
    if (!changeCache.has(k)) { const [y, m, d] = refDate.split('-').map(Number); changeCache.set(k, nextChange(Date.UTC(y, m - 1, d, 12), tz)); }
    return changeCache.get(k);
  }

  function render() {
    const ms = refInstant(), home = places[0].tz;
    $('#date').value = refDate;
    $('#time').value = `${two(Math.floor(refMin / 60))}:${two(refMin % 60)}`;
    if (document.activeElement !== $('#slide')) $('#slide').value = refMin;
    $('#home-name').textContent = placeTitle(places[0]);
    const [y, m, d] = refDate.split('-').map(Number);
    const day0 = instant(y, m, d, 0, 0, home);
    const hw = wall(ms, home);

    const rows = places.map((p, i) => {
      const w = wall(ms, p.tz), off = offset(ms, p.tz);
      const dd = Math.round((Date.UTC(w.y, w.m - 1, w.d) - Date.UTC(hw.y, hw.m - 1, hw.d)) / 86400000);
      const cells = [];
      for (let k = 0; k < 24; k++) {
        const at = day0 + k * 3600000, lw = wall(at, p.tz);
        cells.push({ k, h: lw.h, mi: lw.mi, b: band(lw.h), midnight: lw.h === 0, day: lw.h === 0 ? dayLabel(at, p.tz, { weekday: 'short', day: 'numeric', month: 'numeric' }) : '' });
      }
      return { p, i, w, off, dd, diff: off - offset(ms, home), summer: isSummer(ms, p.tz), dst: hasDst(ms, p.tz), ch: changeFor(p.tz), cells };
    });
    const allWork = Array.from({ length: 24 }, (_, k) => rows.every((r) => r.cells[k].b === 'work'));

    renderMap(ms, rows);
    $('#count').textContent = places.length === 1 ? t('1 Ort') : `${places.length} ${t('Orte')}`;

    // cards
    const list = $('#zones');
    list.textContent = '';
    for (const r of rows) {
      const z = zoneText(ms, r.p.tz);
      const el = document.createElement('div');
      el.className = 'zone' + (r.i === 0 ? ' home' : '');
      const change = r.ch ? `${t('Nächste Umstellung')}: ${dayLabel(r.ch.at, r.p.tz, { day: 'numeric', month: 'short', year: 'numeric' })} (${fmtOffset(r.ch.from)} → ${fmtOffset(r.ch.to)})` : t('Keine Zeitumstellung');
      el.innerHTML = `
        <div class="z-head">
          <div class="z-place">
            <input class="z-name" type="text" spellcheck="false" aria-label="${t('Name anpassen')}" title="${t('Name anpassen, z. B. Kunde oder Team')}" data-no-i18n>
            <div class="z-sub" data-no-i18n></div>
          </div>
          <div class="z-time">
            <div class="z-clock" data-no-i18n>${two(r.w.h)}:${two(r.w.mi)}${r.dd ? `<sup>${r.dd > 0 ? '+' : '−'}${Math.abs(r.dd)} ${t('Tag')}</sup>` : ''}</div>
            ${uses12h(placeCountry(r.p)) ? `<div class="z-local" title="${t('So schreibt man die Uhrzeit dort')}" data-no-i18n>${ampm(ms, r.p.tz)}</div>` : ''}
            <div class="z-date" data-no-i18n>${dayLabel(ms, r.p.tz, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
          </div>
        </div>
        <div class="z-zone">
          <div class="z-zname" data-no-i18n></div>
          <div class="z-badges">
            <span class="tag ${r.summer ? 'sun' : ''}">${r.summer ? t('Sommerzeit') : r.dst ? t('Winterzeit') : t('Keine Sommerzeit')}</span>
            ${r.i ? `<span class="tag">${r.diff === 0 ? t('gleiche Zeit') : (r.diff > 0 ? '+' : '−') + fmtDiff(Math.abs(r.diff))}</span>` : `<span class="tag home-tag">${t('Bezug')}</span>`}
          </div>
          <div class="z-change">${change}</div>
          <label class="z-adjust"><span>${t('Zeitzone')}</span></label>
        </div>
        <div class="z-tools">
          ${r.i ? `<button type="button" data-a="home" title="${t('Als Bezug setzen')}">⌂ ${t('Bezug')}</button>` : ''}
          ${r.i > 1 ? `<button type="button" data-a="up" title="${t('Nach oben')}">↑</button>` : ''}
          ${places.length > 1 ? `<button type="button" data-a="del" title="${t('Entfernen')}">✕</button>` : ''}
        </div>`;
      const name = el.querySelector('.z-name');
      name.value = placeTitle(r.p);
      name.addEventListener('change', () => {
        const v = name.value.trim();
        const p0 = { ...r.p, name: null };
        r.p.name = v && v !== placeTitle(p0) ? v : null;
        update();
      });
      name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });
      el.querySelector('.z-sub').textContent = [placeSub(r.p), r.p.tz !== r.p.auto ? `${t('angepasst')}: ${r.p.tz}` : r.p.tz].filter(Boolean).join(' · ');
      el.querySelector('.z-zname').textContent = [z.long, z.abbr && `(${z.abbr})`, '·', z.off].filter(Boolean).join(' ');
      const sel = zoneSelect(r.p, ms);
      sel.addEventListener('change', () => { r.p.tz = sel.value || r.p.auto; update(); });
      el.querySelector('.z-adjust').append(sel);
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
      row.querySelector('.tl-label').textContent = placeTitle(r.p);
      tl.append(row);
    }
    tl.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => { refMin = +b.dataset.k * 60 + (refMin % 60); update(); }));
    const n = allWork.filter(Boolean).length;
    $('#overlap').textContent = places.length < 2 ? t('Füge mindestens einen weiteren Ort hinzu, um gemeinsame Zeiten zu sehen.')
      : n ? `${n} ${n === 1 ? t('Stunde passt') : t('Stunden passen')} ${t('für alle (8–18 Uhr Ortszeit, mit ✓ markiert).')}`
      : t('Keine gemeinsame Stunde in der Arbeitszeit (8–18 Uhr) – grün ist Arbeitszeit, gelb Randzeit.');
    const sel = tl.querySelector('.tl-top .sel');
    if (sel && !render.scrolled) { tl.scrollLeft = Math.max(0, sel.offsetLeft - tl.clientWidth / 2); render.scrolled = true; }
    if (q.value.trim()) drawSug();
  }

  function act(i, a) {
    if (a === 'del') places.splice(i, 1);
    else if (a === 'up') [places[i - 1], places[i]] = [places[i], places[i - 1]];
    else if (a === 'home') {
      const ms = refInstant();
      const [p] = places.splice(i, 1);
      places.unshift(p);
      const w = wall(ms, p.tz);
      refDate = `${w.y}-${two(w.m)}-${two(w.d)}`;
      refMin = w.h * 60 + w.mi;
    }
    update();
  }

  // ---------------------------------------------------------------- Date & time
  $('#date').addEventListener('change', (e) => { if (e.target.value) { refDate = e.target.value; update(); } });
  $('#time').addEventListener('change', (e) => { const [h, m] = (e.target.value || '0:0').split(':').map(Number); refMin = h * 60 + (m || 0); update(); });
  // slider: live while dragging (one redraw per frame), saved when released
  let frame = 0;
  $('#slide').addEventListener('input', (e) => {
    refMin = +e.target.value;
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; render(); });
  });
  $('#slide').addEventListener('change', (e) => { refMin = +e.target.value; update(); });
  $('#now').addEventListener('click', () => { const w = wall(Date.now(), places[0].tz); refDate = today(places[0].tz); refMin = w.h * 60 + w.mi; update(); });
  document.querySelectorAll('[data-shift]').forEach((b) => b.addEventListener('click', () => {
    const [y, m, d] = refDate.split('-').map(Number), x = new Date(Date.UTC(y, m - 1, d + +b.dataset.shift));
    refDate = x.toISOString().slice(0, 10); update();
  }));

  // ---------------------------------------------------------------- Share / copy / calendar
  const hm = (w) => `${two(w.h)}:${two(w.mi)}`;
  function summaryText() {
    const ms = refInstant();
    return places.map((p) => {
      const z = zoneText(ms, p.tz);
      const local = uses12h(placeCountry(p)) ? ` / ${ampm(ms, p.tz)}` : '';
      return `${placeTitle(p)}: ${dayLabel(ms, p.tz, { weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric' })}, ${hm(wall(ms, p.tz))}${local} (${[z.abbr, z.off].filter(Boolean).join(', ')})`;
    }).join('\n');
  }
  async function copy(text, msg) {
    try { await navigator.clipboard.writeText(text); toast(msg); } catch { toast(t('Kopieren nicht möglich.'), true); }
  }
  $('#copy').addEventListener('click', () => copy(summaryText(), t('Zeiten kopiert.')));
  $('#link').addEventListener('click', () => {
    const url = `${location.origin}${location.pathname}#p=${encodeURIComponent(places.map(serialize).join('|'))}&d=${refDate}&t=${two(Math.floor(refMin / 60))}:${two(refMin % 60)}`;
    copy(url, t('Link kopiert – er enthält nur die Orte und die Uhrzeit.'));
  });
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
    const raw = $('#title').value.trim() || t('Termin');
    const escIcs = (s) => s.replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CM Ventures//Time Zones//DE', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      `UID:${crypto.randomUUID ? crypto.randomUUID() : Date.now() + '@cmventures'}`, `DTSTAMP:${stamp(Date.now())}`,
      `DTSTART:${stamp(ms)}`, `DTEND:${stamp(ms + dur * 60000)}`, `SUMMARY:${escIcs(raw)}`,
      `DESCRIPTION:${escIcs(summaryText())}`, 'END:VEVENT', 'END:VCALENDAR'].map(fold).join('\r\n');
    download(new Blob([ics], { type: 'text/calendar' }), `${raw.replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'termin'}.ics`);
  });

  function route() {
    const about = location.hash === '#about';
    $('#home').classList.toggle('hidden', about);
    $('#about').classList.toggle('hidden', !about);
    if (about) window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', () => { if (location.hash.startsWith('#p=')) { load(); render(); } route(); });
  document.addEventListener('langchange', render);
  load();
  route();
  render();
  window.CMV.registerSW();
  window.__time = { wall, offset, instant, isSummer, nextChange, sun, fixedZone, get places() { return places; }, refInstant };
})();
