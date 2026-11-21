/* File Safe format – AES-256-GCM in chunks, key from the password via PBKDF2-SHA-256 (WebCrypto, built into the browser).

   header (40 bytes, authenticated with every chunk):
     "CMVSAFE1" | version 1 (1 byte) | salt (16) | PBKDF2 iterations (u32) | nonce prefix (7) | chunk size (u32)
   then records: length (u32) | ciphertext incl. 16-byte tag
     record 0 = metadata (JSON: name, type, size), records 1… = the file in chunks
   IV of record i = nonce prefix (7) | i (u32) | 1 for the last record, else 0
   → wrong password, any change, reordering or a cut-off file all fail authentication. */
const SafeCrypto = (() => {
  const MAGIC = new TextEncoder().encode('CMVSAFE1');
  const HEADER = 40, CHUNK = 4 * 1024 * 1024, ITER = 600000;

  async function deriveKey(password, salt, iterations) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  function iv(prefix, i, last) {
    const v = new Uint8Array(12);
    v.set(prefix, 0);
    new DataView(v.buffer).setUint32(7, i);
    v[11] = last ? 1 : 0;
    return v;
  }
  const u32 = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n); return b; };

  // blob → encrypted Blob; onProgress(0…1)
  async function encrypt(blob, meta, password, onProgress = () => {}) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), prefix = crypto.getRandomValues(new Uint8Array(7));
    const header = new Uint8Array(HEADER);
    const dv = new DataView(header.buffer);
    header.set(MAGIC, 0); header[8] = 1; header.set(salt, 9); dv.setUint32(25, ITER); header.set(prefix, 29); dv.setUint32(36, CHUNK);
    const key = await deriveKey(password, salt, ITER);
    const parts = [header];
    const seal = async (data, i, last) => {
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv(prefix, i, last), additionalData: header }, key, data));
      parts.push(u32(ct.length), ct);
    };
    await seal(new TextEncoder().encode(JSON.stringify({ name: meta.name, type: meta.type || '', size: blob.size })), 0, false);
    const n = Math.max(1, Math.ceil(blob.size / CHUNK));
    for (let k = 0; k < n; k++) {
      const data = new Uint8Array(await blob.slice(k * CHUNK, (k + 1) * CHUNK).arrayBuffer());
      await seal(data, k + 1, k === n - 1);
      onProgress((k + 1) / n);
    }
    return new Blob(parts, { type: 'application/octet-stream' });
  }

  async function isSafe(blob) {
    if (blob.size < HEADER) return false;
    const h = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
    return MAGIC.every((b, i) => h[i] === b);
  }

  class WrongPassword extends Error {}

  // encrypted Blob → { blob, name, type }
  async function decrypt(blob, password, onProgress = () => {}) {
    if (!(await isSafe(blob))) throw new Error('not-safe');
    const header = new Uint8Array(await blob.slice(0, HEADER).arrayBuffer());
    const dv = new DataView(header.buffer);
    if (header[8] !== 1) throw new Error('version');
    const salt = header.slice(9, 25), iterations = dv.getUint32(25), prefix = header.slice(29, 36), chunk = dv.getUint32(36);
    if (iterations < 100000 || iterations > 10000000 || chunk > 64 * 1024 * 1024) throw new Error('broken');
    const key = await deriveKey(password, salt, iterations);
    let pos = HEADER, i = 0, meta = null;
    const parts = [];
    for (;;) {
      if (pos + 4 > blob.size) throw new Error('broken');
      const len = new DataView(await blob.slice(pos, pos + 4).arrayBuffer()).getUint32(0);
      if (len < 16 || len > chunk + 16 || pos + 4 + len > blob.size) throw new Error('broken');
      const ct = await blob.slice(pos + 4, pos + 4 + len).arrayBuffer();
      pos += 4 + len;
      const last = pos === blob.size;
      let pt;
      try { pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv(prefix, i, last && i > 0), additionalData: header }, key, ct); }
      catch { throw i === 0 ? new WrongPassword('password') : new Error('broken'); }
      if (i === 0) meta = JSON.parse(new TextDecoder().decode(pt));
      else parts.push(pt);
      onProgress(blob.size ? pos / blob.size : 1);
      if (last) break;
      i++;
    }
    if (!parts.length) throw new Error('broken');
    return { blob: new Blob(parts, { type: meta.type || 'application/octet-stream' }), name: meta.name || 'datei', type: meta.type };
  }

  return { encrypt, decrypt, isSafe, WrongPassword };
})();
if (typeof module !== 'undefined') module.exports = SafeCrypto;
