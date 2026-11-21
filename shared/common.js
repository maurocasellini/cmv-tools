/* Shared helpers for all tools: toast, busy overlay, downloads, links between the tools,
   offline support (service worker). */
(() => {
  const $ = (s, r = document) => r.querySelector(s);

  let toastTimer;
  function toast(msg, isError = false) {
    let el = $('#toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast hidden'; el.setAttribute('role', 'status'); document.body.append(el); }
    el.textContent = msg;
    el.classList.toggle('err', isError);
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), isError ? 6000 : 3200);
  }

  function busy(text, progress) {
    let el = $('#busy');
    if (!el) {
      el = document.createElement('div'); el.id = 'busy'; el.className = 'busy hidden';
      el.innerHTML = '<div class="spinner"></div><span></span><div class="bar hidden"><i></i></div>';
      document.body.append(el);
    }
    if (text === false) { el.classList.add('hidden'); return; }
    el.querySelector('span').textContent = text || 'Wird verarbeitet …';
    const bar = el.querySelector('.bar');
    bar.classList.toggle('hidden', progress == null);
    if (progress != null) bar.firstChild.style.width = Math.round(progress * 100) + '%';
    el.classList.remove('hidden');
  }

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }

  // Share sheet on phones (AirDrop, Mail, WhatsApp …) – falls back to a download
  async function share(blob, name) {
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return true; }
      catch (e) { if (e.name === 'AbortError') return false; }
    }
    download(blob, name);
    return true;
  }

  // Each tool lives on its own subdomain (scan.cmventures.xyz …). On other hosts
  // (preview deployments, local test server) the tools are reachable as /<name>/.
  const ROOT = 'cmventures.xyz';
  const onProd = location.hostname.endsWith('.' + ROOT);
  function toolUrl(name) {
    // the PDF Toolkit's service worker needs the root of its own domain
    if (name === 'pdf') return `https://pdf.${ROOT}/`;
    if (onProd) return `https://${name === 'hub' ? 'tools' : name}.${ROOT}/`;
    return `/${name}/`;
  }
  function wireLinks(root = document) {
    root.querySelectorAll('[data-tool-link]').forEach((a) => { a.href = toolUrl(a.dataset.toolLink) + (a.dataset.hash || ''); });
  }

  function fmtSize(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
    return (n / 1024 / 1024).toFixed(1).replace('.0', '') + ' MB';
  }

  function registerSW() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline mode is optional */ });
  }

  window.CMV = { $, toast, busy, download, share, toolUrl, wireLinks, fmtSize, registerSW };
  document.addEventListener('DOMContentLoaded', () => wireLinks());
})();
