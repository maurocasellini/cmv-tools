/* Bilingual UI (DE/EN), shared by all tools. The UI source text is German; when English is
   selected, a MutationObserver translates every displayed text, including dynamic messages.
   Each app adds its own entries via window.I18N_EN (and window.I18N_RULES) before this script.
   User content ([data-no-i18n]) is never touched. */
(() => {
  const EN = Object.assign({
    'Kein Upload': 'No upload', 'CM Ventures – Startseite': 'CM Ventures – home page', 'Quellcode': 'Source code', 'Open-Source-Lizenzen': 'Open-source licenses', 'CM Ventures – alle Tools': 'CM Ventures – all tools', '100 % lokal': '100% local', 'Alle Tools': 'All tools',
    'Alle Dateien bleiben auf deinem Gerät. Nichts wird hochgeladen.': 'All files stay on your device. Nothing is uploaded.',
    'Datenschutz': 'Privacy', 'Impressum': 'Legal notice', 'Hinweise zum Tool': 'About this tool',
    'Sprache / Language': 'Language', 'Schliessen': 'Close', 'Abbrechen': 'Cancel', 'Fertig': 'Done', 'Zurück': 'Back', '← Zurück': '← Back',
    'Wird verarbeitet …': 'Processing …', 'Wird geladen …': 'Loading …',
    'Dieser Browser wird nicht unterstützt. Bitte eine aktuelle Version von Safari, Chrome, Edge oder Firefox verwenden.':
      'This browser is not supported. Please use a current version of Safari, Chrome, Edge or Firefox.',
    'Offline verfügbar': 'Available offline',
  }, window.I18N_EN || {});
  const RULES = window.I18N_RULES || [];
  const KEY = 'cmv-lang';
  let lang;
  try { lang = localStorage.getItem(KEY) || localStorage.getItem('pdfw-lang'); } catch { /* storage blocked */ }
  if (lang !== 'de' && lang !== 'en') lang = (navigator.language || 'de').toLowerCase().startsWith('de') ? 'de' : 'en';

  function toEN(s) {
    const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const core = m[2];
    if (!core) return s;
    let r = EN[core];
    if (r === undefined) {
      r = core;
      for (const [re, rep] of RULES) r = r.replace(re, rep);
    }
    return m[1] + r + m[3];
  }
  const tr = (s) => (lang === 'en' ? toEN(s) : s);

  const SKIP = '[data-no-i18n], script, style, code, textarea';
  const ORIG = new WeakMap();
  const ATTRS = ['placeholder', 'title', 'aria-label'];
  const AORIG = new WeakMap();

  function doText(n) {
    const p = n.parentElement;
    if (!p || p.closest(SKIP)) return;
    const cur = n.nodeValue;
    let o = ORIG.get(n);
    if (o === undefined || (cur !== o && cur !== toEN(o))) { o = cur; ORIG.set(n, o); }
    const want = tr(o);
    if (cur !== want) n.nodeValue = want;
  }
  function doAttrs(el) {
    if (el.closest('[data-no-i18n]')) return;
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const cur = el.getAttribute(a);
      const map = AORIG.get(el) || {};
      let o = map[a];
      if (o === undefined || (cur !== o && cur !== toEN(o))) { o = cur; map[a] = o; AORIG.set(el, map); }
      const want = tr(o);
      if (cur !== want) el.setAttribute(a, want);
    }
  }
  function walk(root) {
    if (root.nodeType === 3) return doText(root);
    if (root.nodeType !== 1) return;
    doAttrs(root);
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let n;
    while ((n = tw.nextNode())) (n.nodeType === 3 ? doText(n) : doAttrs(n));
  }
  const obs = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') doText(m.target);
      else if (m.type === 'attributes') doAttrs(m.target);
      else m.addedNodes.forEach(walk);
    }
    obs.takeRecords();
  });

  let title;
  function renderSwitch() {
    document.documentElement.lang = lang;
    document.title = tr(title);
    document.querySelectorAll('[data-lang]').forEach((b) => b.classList.toggle('active', b.dataset.lang === lang));
  }
  function setLang(l) {
    lang = l === 'en' ? 'en' : 'de';
    try { localStorage.setItem(KEY, lang); } catch { /* private mode */ }
    walk(document.body);
    obs.takeRecords();
    renderSwitch();
    document.dispatchEvent(new CustomEvent('langchange', { detail: lang }));
  }

  window.i18n = tr;
  window.I18N = { get lang() { return lang; }, set: setLang };

  function start() {
    title = document.title;
    walk(document.body);
    obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    renderSwitch();
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-lang]');
      if (b) setLang(b.dataset.lang);
    });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
