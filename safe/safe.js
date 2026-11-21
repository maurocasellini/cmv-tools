/* File Safe: encrypt / decrypt files and short messages with a password (crypto.js). Nothing leaves the device. */
(() => {
  const { $, toast, busy, download, share, fmtSize } = window.CMV;
  const t = (s) => window.i18n(s);
  let files = [], kind = 'file', encResult = null, decFile = null, decResult = null;

  // ---------------------------------------------------------------- Modes
  function setMode(m) {
    document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
    document.querySelectorAll('[data-pane]').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== m));
  }
  document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  document.querySelectorAll('#kind button').forEach((b) => b.addEventListener('click', () => {
    kind = b.dataset.v;
    document.querySelectorAll('#kind button').forEach((x) => x.classList.toggle('active', x === b));
    document.querySelectorAll('[data-kind]').forEach((el) => { el.hidden = el.dataset.kind !== kind; });
    $('#enc-result').classList.add('hidden');
  }));
  document.querySelectorAll('[data-show]').forEach((b) => b.addEventListener('click', () => {
    const inp = $('#' + b.dataset.show), show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    b.textContent = show ? t('Verbergen') : t('Zeigen');
  }));

  // ---------------------------------------------------------------- Files
  async function addFiles(list) {
    list = [...list];
    if (!list.length) return;
    // an encrypted file → decrypt mode
    if (list.length === 1 && await SafeCrypto.isSafe(list[0])) { setDecFile(list[0]); setMode('dec'); return; }
    files.push(...list);
    renderFiles();
    setMode('enc');
  }
  function renderFiles() {
    const ul = $('#enc-list');
    ul.textContent = '';
    files.forEach((f, i) => {
      const li = document.createElement('li');
      li.innerHTML = '<span data-no-i18n></span><small></small><button type="button" title="Entfernen">✕</button>';
      li.querySelector('span').textContent = f.name;
      li.querySelector('small').textContent = fmtSize(f.size);
      li.querySelector('button').addEventListener('click', () => { files.splice(i, 1); renderFiles(); });
      ul.append(li);
    });
    $('#enc-result').classList.add('hidden');
  }
  $('#enc-files').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
  function setDecFile(f) {
    decFile = f;
    $('#dec-name').textContent = `${f.name} · ${fmtSize(f.size)}`;
    $('#dec-name').classList.remove('hidden');
    $('#dec-text').value = '';
    $('#dec-result').classList.add('hidden');
    $('#dec-pw').focus();
  }
  $('#dec-file').addEventListener('change', (e) => { if (e.target.files[0]) setDecFile(e.target.files[0]); e.target.value = ''; });
  $('#dec-text').addEventListener('input', () => { if ($('#dec-text').value.trim()) { decFile = null; $('#dec-name').classList.add('hidden'); } });
  ['dragenter', 'dragover'].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault()));
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    const fl = e.dataTransfer && e.dataTransfer.files;
    if (!fl || !fl.length) return;
    if (e.target.closest('#dec-drop')) setDecFile(fl[0]); else addFiles(fl);
  });

  // ---------------------------------------------------------------- Password
  // 20 characters from 32 easily distinguishable ones = 100 bits, in groups of four
  function generate() {
    const A = 'abcdefghjkmnpqrstuvwxyz23456789', r = crypto.getRandomValues(new Uint32Array(20));
    let s = '';
    for (let i = 0; i < 20; i++) { if (i && i % 4 === 0) s += '-'; s += A[r[i] % A.length]; }
    return s;
  }
  $('#gen').addEventListener('click', () => {
    const inp = $('#enc-pw');
    inp.value = generate();
    inp.type = 'text';
    document.querySelector('[data-show="enc-pw"]').textContent = t('Verbergen');
    meter();
  });
  function strength(pw) {
    if (!pw) return 0;
    let set = 0;
    if (/[a-z]/.test(pw)) set += 26;
    if (/[A-Z]/.test(pw)) set += 26;
    if (/\d/.test(pw)) set += 10;
    if (/[^a-zA-Z\d]/.test(pw)) set += 20;
    const uniq = new Set(pw).size;
    return Math.round(Math.min(pw.length, uniq * 1.5) * Math.log2(Math.max(set, 2)));
  }
  function meter() {
    const pw = $('#enc-pw').value, bits = strength(pw), bar = $('#meter-bar');
    bar.style.width = Math.min(100, (bits / 90) * 100) + '%';
    bar.className = bits >= 70 ? 'good' : bits >= 45 ? 'ok' : '';
    $('#meter-text').textContent = !pw ? t('Mindestens 10 Zeichen – oder „Erzeugen“ verwenden.')
      : pw.length < 10 ? t('Zu kurz – mindestens 10 Zeichen.')
      : bits < 45 ? t('Schwach – leicht zu erraten.') : bits < 70 ? t('Mittel – besser länger machen.') : t('Stark.');
  }
  $('#enc-pw').addEventListener('input', meter);

  const MSG = {
    password: 'Falsches Passwort – oder die Datei wurde verändert.',
    broken: 'Die Datei ist beschädigt oder unvollständig.',
    'not-safe': 'Das ist keine mit File Safe verschlüsselte Datei.',
    version: 'Diese Datei stammt aus einer neueren Version von File Safe.',
  };
  const errText = (e) => t(MSG[e.message] || e.message);

  // ---------------------------------------------------------------- Encrypt
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  $('#enc-go').addEventListener('click', async () => {
    const pw = $('#enc-pw').value;
    if (pw.length < 10) { toast(t('Bitte ein Passwort mit mindestens 10 Zeichen wählen – oder „Erzeugen“.'), true); return; }
    let blob, meta;
    try {
      if (kind === 'text') {
        const text = $('#enc-text').value;
        if (!text.trim()) { toast(t('Bitte zuerst eine Nachricht eingeben.'), true); return; }
        blob = new Blob([text]); meta = { name: 'nachricht.txt', type: 'text/plain;charset=utf-8' };
      } else {
        if (!files.length) { toast(t('Bitte zuerst eine Datei wählen.'), true); return; }
        if (files.length === 1) { blob = files[0]; meta = { name: files[0].name, type: files[0].type }; }
        else {
          busy(t('ZIP wird erstellt …'));
          blob = await window.CMV.zip(files.map((f) => ({ name: f.name, blob: f })));
          meta = { name: t('Dateien') + '.zip', type: 'application/zip' };
        }
      }
      busy(t('Wird verschlüsselt …'), 0);
      const out = await SafeCrypto.encrypt(blob, meta, pw, (p) => busy(t('Wird verschlüsselt …'), p));
      const base = kind === 'text' ? 'nachricht' : files.length === 1 ? files[0].name : t('Dateien');
      encResult = { blob: out, name: base + '.cmvsafe' };
      const isText = kind === 'text';
      document.querySelectorAll('#enc-result [data-res]').forEach((el) => { el.hidden = el.dataset.res !== (isText ? 'text' : 'file'); });
      if (isText) $('#enc-out').value = 'CMVSAFE:' + b64(new Uint8Array(await out.arrayBuffer()));
      else {
        $('#enc-name').textContent = encResult.name;
        $('#enc-meta').textContent = `${fmtSize(out.size)} · ${files.length > 1 ? `${files.length} ${t('Dateien')} · ` : ''}AES-256`;
      }
      $('#enc-result').classList.remove('hidden');
      $('#enc-result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) {
      console.error(e);
      toast(t('Verschlüsseln fehlgeschlagen: ') + errText(e), true);
    } finally { busy(false); }
  });
  $('#enc-dl').addEventListener('click', () => encResult && download(encResult.blob, encResult.name));
  $('#enc-share').addEventListener('click', () => encResult && share(new Blob([encResult.blob], { type: 'application/octet-stream' }), encResult.name));
  $('#enc-copy').addEventListener('click', () => copy($('#enc-out').value));
  $('#copy-howto').addEventListener('click', () => {
    const url = window.CMV.toolUrl('safe');
    const link = url.startsWith('http') ? url : location.origin + url;
    copy(t('Ich habe dir etwas verschlüsselt geschickt. So öffnest du es: {url} aufrufen → „Entschlüsseln“ → Datei wählen oder Text einfügen → Passwort eingeben. Das Passwort bekommst du separat von mir.').replace('{url}', link));
  });
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast(t('Kopiert.')); }
    catch { toast(t('Kopieren nicht möglich – bitte von Hand markieren.'), true); }
  }

  // ---------------------------------------------------------------- Decrypt
  $('#dec-go').addEventListener('click', async () => {
    const pw = $('#dec-pw').value;
    let src = decFile;
    const txt = $('#dec-text').value.trim();
    if (!src && txt) {
      try { src = new Blob([unb64(txt.replace(/^CMVSAFE:/, '').replace(/\s+/g, ''))]); }
      catch { toast(t(MSG['not-safe']), true); return; }
    }
    if (!src) { toast(t('Bitte zuerst eine verschlüsselte Datei wählen oder Text einfügen.'), true); return; }
    if (!pw) { toast(t('Bitte das Passwort eingeben.'), true); return; }
    try {
      busy(t('Wird entschlüsselt …'), 0);
      const res = await SafeCrypto.decrypt(src, pw, (p) => busy(t('Wird entschlüsselt …'), p));
      decResult = res;
      const isText = /^text\/plain/.test(res.type || '') && res.blob.size < 1024 * 1024 && !decFile;
      document.querySelectorAll('#dec-result [data-res]').forEach((el) => { el.hidden = el.dataset.res !== (isText ? 'text' : 'file'); });
      if (isText) $('#dec-out-text').textContent = await res.blob.text();
      else { $('#dec-out-name').textContent = res.name; $('#dec-meta').textContent = fmtSize(res.blob.size); }
      $('#dec-result').classList.remove('hidden');
      $('#dec-result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) {
      $('#dec-result').classList.add('hidden');
      toast(errText(e), true);
    } finally { busy(false); }
  });
  $('#dec-dl').addEventListener('click', () => decResult && download(decResult.blob, decResult.name));
  $('#dec-share').addEventListener('click', () => decResult && share(decResult.blob, decResult.name));
  $('#dec-copy').addEventListener('click', () => copy($('#dec-out-text').textContent));
  ['#dec-pw', '#enc-pw'].forEach((s) => $(s).addEventListener('keydown', (e) => { if (e.key === 'Enter') $(s === '#dec-pw' ? '#dec-go' : '#enc-go').click(); }));

  // share sheet only on phones/tablets
  if (navigator.canShare && navigator.canShare({ files: [new File([''], 'a.bin', { type: 'application/octet-stream' })] })) {
    $('#enc-share').classList.remove('hidden'); $('#dec-share').classList.remove('hidden');
  }

  function route() {
    const about = location.hash === '#about';
    $('#home').classList.toggle('hidden', about);
    $('#about').classList.toggle('hidden', !about);
    if (about) window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  document.addEventListener('langchange', meter);
  route();
  meter();
  window.CMV.registerSW();
})();
