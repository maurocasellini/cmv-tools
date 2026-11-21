/* Hub: routing for the “about” page + offline support */
(() => {
  const TOOL = { all: 'Alle Tools', pdf: 'PDF Toolkit', scan: 'Doc Scanner', voice: 'Voice to Text', image: 'Bild-Toolkit',
    video: 'Video-Toolkit', translate: 'Übersetzer', qr: 'QR-Codes', safe: 'File Safe', time: 'Time Zones' };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let licenses = null;
  async function renderLicenses() {
    try { licenses ||= await (await fetch('licenses.json')).json(); } catch { return; }
    document.getElementById('lic-body').innerHTML = licenses.map((l) => `<tr>
      <td><a href="${esc(l.source)}" target="_blank" rel="noopener noreferrer">${esc(l.name)}</a></td>
      <td>${esc(l.version)}</td><td>${esc(l.license)}</td>
      <td>${l.tools.map((t) => esc(window.i18n(TOOL[t] || t))).join(', ')}</td></tr>`).join('');
  }
  const route = () => {
    const page = ['#about', '#licenses'].includes(location.hash) ? location.hash.slice(1) : 'home';
    for (const id of ['home', 'about', 'licenses']) document.getElementById(id).classList.toggle('hidden', id !== page);
    if (page === 'licenses') renderLicenses();
    if (page !== 'home') window.scrollTo(0, 0);
  };
  document.addEventListener('langchange', () => { if (licenses) renderLicenses(); });
  window.addEventListener('hashchange', route);
  route();
  window.CMV.registerSW();
})();
