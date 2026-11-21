/* Light / dark mode toggle: device setting → light → dark.
   Stored per device; loaded in <head> so the page never flashes in the wrong colors. */
(() => {
  const KEY = 'theme';
  const NEXT = { system: 'light', light: 'dark', dark: 'system' };
  const LABEL = {
    de: { system: 'Darstellung: wie Gerät – tippen zum Wechseln', light: 'Darstellung: hell – tippen zum Wechseln', dark: 'Darstellung: dunkel – tippen zum Wechseln' },
    en: { system: 'Appearance: device setting – tap to change', light: 'Appearance: light – tap to change', dark: 'Appearance: dark – tap to change' },
  };
  const lang = () => ((window.I18N && window.I18N.lang) || root.lang || 'de').slice(0, 2) === 'en' ? 'en' : 'de';
  const ICON = {
    system: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    dark: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
  };
  const root = document.documentElement;
  let mode = 'system';
  try { const t = localStorage.getItem(KEY); if (t === 'light' || t === 'dark') mode = t; } catch { /* storage blocked */ }

  function apply() {
    if (mode === 'system') delete root.dataset.theme; else root.dataset.theme = mode;
    const dark = mode === 'dark' || (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? '#151a2a' : '#242b41';
  }
  apply();

  function button() {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'theme-toggle';
    b.setAttribute('data-no-i18n', '');
    const render = () => {
      b.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">${ICON[mode]}</svg>`;
      const l = LABEL[lang()][mode];
      b.title = l;
      b.setAttribute('aria-label', l);
    };
    b.addEventListener('click', () => {
      mode = NEXT[mode];
      try { mode === 'system' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, mode); } catch { /* private mode */ }
      apply();
      render();
    });
    document.addEventListener('langchange', render);
    render();
    return b;
  }

  function mount() {
    if (document.querySelector('.theme-toggle')) return;
    const switcher = document.querySelector('.lang-switch');
    if (switcher) switcher.before(button());
    else {
      const slot = document.querySelector('[data-theme-slot], .top .controls');
      if (slot) slot.prepend(button());
    }
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', apply);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
