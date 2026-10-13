/* CM Ventures Blockchain Demo – a blockchain simulation that runs entirely in the browser:
   real SHA-256 proof of work, real ECDSA signatures (WebCrypto), UTXOs, P2P gossip, forks. */
'use strict';

/* ---------------- SHA-256 (synchronous, for mining) ---------------- */
const SHA_K = new Uint32Array(64), SHA_H0 = new Uint32Array(8);
(() => {
  const primes = []; for (let n = 2; primes.length < 64; n++) { if (primes.every(p => n % p)) primes.push(n); }
  for (let i = 0; i < 64; i++) SHA_K[i] = Math.floor((Math.cbrt(primes[i]) % 1) * 4294967296);
  for (let i = 0; i < 8; i++) SHA_H0[i] = Math.floor((Math.sqrt(primes[i]) % 1) * 4294967296);
})();
const textEnc = new TextEncoder();
const SHA_W = new Uint32Array(64);
function sha256(str) {
  const bytes = textEnc.encode(str), len = bytes.length;
  const nWords = (((len + 9 + 63) >> 6) << 4);
  const m = new Uint32Array(nWords);
  for (let i = 0; i < len; i++) m[i >> 2] |= bytes[i] << (24 - (i & 3) * 8);
  m[len >> 2] |= 0x80 << (24 - (len & 3) * 8);
  m[nWords - 1] = len * 8;
  m[nWords - 2] = Math.floor(len / 536870912);
  const H = SHA_H0.slice(), W = SHA_W;
  for (let off = 0; off < nWords; off += 16) {
    for (let t = 0; t < 16; t++) W[t] = m[off + t];
    for (let t = 16; t < 64; t++) {
      const a = W[t - 15], b = W[t - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      W[t] = W[t - 16] + s0 + W[t - 7] + s1;
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let t = 0; t < 64; t++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const t1 = (h + S1 + ((e & f) ^ (~e & g)) + SHA_K[t] + W[t]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  let out = ''; for (let i = 0; i < 8; i++) out += H[i].toString(16).padStart(8, '0');
  return out;
}

/* ---------------- ECDSA via WebCrypto ---------------- */
const subtle = globalThis.crypto && crypto.subtle;
const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN = { name: 'ECDSA', hash: 'SHA-256' };
const toHex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const fromHex = hex => new Uint8Array(hex.match(/../g).map(h => parseInt(h, 16)));
const pubKeyCache = new Map();
const addrOf = pubHex => sha256(pubHex).slice(0, 24);
async function makeKeys() {
  const kp = await subtle.generateKey(ECDSA, true, ['sign', 'verify']);
  const pubHex = toHex(await subtle.exportKey('raw', kp.publicKey));
  pubKeyCache.set(pubHex, kp.publicKey);
  return { priv: kp.privateKey, pubHex, address: addrOf(pubHex) };
}
async function sign(priv, text) { return toHex(await subtle.sign(SIGN, priv, textEnc.encode(text))); }
async function verify(pubHex, sigHex, text) {
  try {
    let key = pubKeyCache.get(pubHex);
    if (!key) { key = await subtle.importKey('raw', fromHex(pubHex), ECDSA, false, ['verify']); pubKeyCache.set(pubHex, key); }
    return await subtle.verify(SIGN, key, fromHex(sigHex), textEnc.encode(text));
  } catch { return false; }
}

/* ---------------- Chain primitives ---------------- */
const REWARD = 100, GENESIS_GRANT = 100, MAX_TX = 8, ZERO = '0'.repeat(64);
const NAMES = ['Alice', 'Bob', 'Carol', 'Dave', 'Erin', 'Frank', 'Grace', 'Heidi', 'Ivan', 'Judy'];

function txId(tx) {
  return sha256(JSON.stringify({
    i: tx.inputs.map(i => [i.txid, i.vout, i.pubkey]),
    o: tx.outputs.map(o => [o.address, o.amount]),
    c: tx.coinbase ? tx.height : null, t: tx.time
  }));
}
function merkleRoot(ids) {
  if (!ids.length) return ZERO;
  let level = ids.slice();
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) next.push(sha256(level[i] + (level[i + 1] ?? level[i])));
    level = next;
  }
  return level[0];
}
const headerOf = b => `${b.height}|${b.prev}|${b.merkle}|${b.time}|${b.difficulty}|${b.nonce}`;
const hashBlock = b => sha256(headerOf(b));
const meets = (hash, d) => hash.startsWith('0'.repeat(d));
const workOf = d => Math.pow(16, d);

function coinbaseTx(outputs, height) {
  const tx = { inputs: [], outputs, coinbase: true, height, time: Date.now() };
  tx.id = txId(tx);
  return tx;
}
// Shared, deterministic cache: the UTXO set after a given block. Key "txid:vout".
const UTXO = new Map();
function applyBlock(parentU, block) {
  const u = new Map(parentU);
  for (const tx of block.txs) {
    for (const i of tx.inputs) u.delete(i.txid + ':' + i.vout);
    tx.outputs.forEach((o, n) => u.set(tx.id + ':' + n, { address: o.address, amount: o.amount }));
  }
  return u;
}

/* ---------------- Simulation state ---------------- */
const S = {
  mode: 'teach', nodes: [], links: [], msgs: [], log: [], selected: 0, running: true,
  difficulty: 3, hashrate: 1500, delay: 1600, autoTx: false,
  t0: performance.now(), genesis: null, epoch: 0,
  lesson: [], watch: new Map(), narr: null
};
const byAddr = new Map();   // address -> node that owns it
const KEYS = new Map();     // address -> key entry { priv, pubHex, address, idx }
const nameOf = a => byAddr.get(a)?.name ?? a.slice(0, 8) + '…';
const addrTag = a => `${nameOf(a)} · address ${KEYS.get(a)?.idx ?? '?'}`;
const short = h => h ? h.slice(0, 10) + '…' : '–';
const fmt = n => n.toLocaleString('en-US');
const teaching = () => S.mode === 'teach';

function log(text, kind = '') {
  S.log.unshift({ t: performance.now() - S.t0, text, kind });
  if (S.log.length > 200) S.log.length = 200;
  dirty.log = true;
}
function narrate(kicker, html, checks = []) {
  S.narr = { kicker, html, checks };
  dirty.narr = true;
}

function adoptKey(n, k) {
  k.idx = n.wallet.length + 1;
  n.wallet.push(k); n.addrSet.add(k.address);
  byAddr.set(k.address, n); KEYS.set(k.address, k);
  return k;
}
async function freshKey(n) { return adoptKey(n, await makeKeys()); }
function makeNode(i, key) {
  const n = {
    id: i, name: NAMES[i] ?? 'Node ' + (i + 1), wallet: [], addrSet: new Set(), recv: null, reward: null,
    online: true, mining: false, blocks: new Map(), tip: null, orphans: new Map(),
    mempool: new Map(), seenTx: new Set(), exclude: new Set(), q: Promise.resolve(), candidate: null,
    hashes: 0, lastHash: '', mined: 0, x: 0, y: 0, flashAt: 0, badgeAt: 0, badgeOk: true
  };
  adoptKey(n, key);
  n.recv = n.reward = key;
  return n;
}
function addGenesis(node) {
  const g = S.genesis;
  node.blocks.set(g.hash, { block: g, work: workOf(g.difficulty) });
  node.tip = g.hash;
}
const tipBlock = n => n.blocks.get(n.tip).block;
const tipWork = n => n.blocks.get(n.tip).work;
function mainChain(n) {
  const out = []; let h = n.tip;
  while (h && n.blocks.has(h)) { const b = n.blocks.get(h).block; out.push(b); h = b.height ? b.prev : null; }
  return out; // newest first
}
const linkKey = (a, b) => a < b ? a + '-' + b : b + '-' + a;
function findLink(a, b) { const k = linkKey(a, b); return S.links.find(l => l.key === k); }
function addLink(a, b) { if (a !== b && !findLink(a, b)) S.links.push({ key: linkKey(a, b), a, b, cut: false }); }
function peersOf(n) {
  return S.links.filter(l => !l.cut && (l.a === n.id || l.b === n.id))
    .map(l => S.nodes[l.a === n.id ? l.b : l.a]).filter(p => p.online);
}
function badge(n, ok) { n.badgeAt = performance.now(); n.badgeOk = ok; }

/* ---------------- Messaging ---------------- */
function send(from, to, type, payload) {
  const jitter = 0.85 + Math.random() * 0.3;
  const big = type === 'blocks' ? 1.4 : 1;
  S.msgs.push({ from, to, type, payload, t0: performance.now(), dur: S.delay * jitter * big, el: null });
}
function broadcast(node, type, payload, except = null) {
  for (const p of peersOf(node)) if (p !== except) send(node, p, type, payload);
}
function enqueue(node, fn) {
  const epoch = S.epoch;
  node.q = node.q.then(() => epoch === S.epoch ? fn() : null).catch(e => console.error(e));
}
function deliver(m) {
  const l = findLink(m.from.id, m.to.id);
  if (!l || l.cut || !m.to.online || !m.from.online) return;
  const n = m.to;
  if (m.type === 'tx') enqueue(n, () => onTx(n, m.payload, m.from));
  else if (m.type === 'block') enqueue(n, () => onBlock(n, m.payload, m.from, true));
  else if (m.type === 'blocks') enqueue(n, () => onBlocks(n, m.payload, m.from));
  else if (m.type === 'getchain') send(n, m.from, 'blocks', mainChain(n).reverse());
}
function syncPair(a, b) {
  if (!a.online || !b.online) return;
  send(a, b, 'blocks', mainChain(a).reverse());
  send(b, a, 'blocks', mainChain(b).reverse());
  for (const tx of a.mempool.values()) send(a, b, 'tx', tx);
  for (const tx of b.mempool.values()) send(b, a, 'tx', tx);
}

/* ---------------- Validation ---------------- */
async function checkTx(tx, u, spent) {
  if (tx.coinbase) return { err: 'unexpected coinbase transaction' };
  if (!tx.inputs.length || !tx.outputs.length) return { err: 'empty inputs or outputs' };
  if (txId(tx) !== tx.id) return { err: 'transaction ID does not match its contents' };
  let inSum = 0, outSum = 0;
  const local = new Set();
  for (const i of tx.inputs) {
    const k = i.txid + ':' + i.vout, coin = u.get(k);
    if (!coin) return { err: 'spends a coin that does not exist or is already spent', missing: true };
    if (spent.has(k) || local.has(k)) return { err: 'double spend, this coin is already being spent by another payment' };
    if (addrOf(i.pubkey) !== coin.address) return { err: 'signer does not own the coin' };
    if (!(await verify(i.pubkey, i.sig, tx.id))) return { err: 'invalid signature' };
    local.add(k); inSum += coin.amount;
  }
  for (const o of tx.outputs) {
    if (!Number.isInteger(o.amount) || o.amount <= 0) return { err: 'invalid output amount' };
    outSum += o.amount;
  }
  if (outSum > inSum) return { err: 'spends more than its inputs' };
  return { ok: true, fee: inSum - outSum, keys: local };
}
function mempoolSpent(n) {
  const s = new Set();
  for (const tx of n.mempool.values()) for (const i of tx.inputs) s.add(i.txid + ':' + i.vout);
  return s;
}
const payerOf = tx => tx.coinbase ? null : byAddr.get(addrOf(tx.inputs[0].pubkey));
async function onTx(n, tx, from) {
  if (n.seenTx.has(tx.id)) return;
  n.seenTx.add(tx.id);
  const u = UTXO.get(n.tip);
  const r = await checkTx(tx, u, mempoolSpent(n));
  if (!r.ok) {
    // Coins we don't know yet (or that are already confirmed) are usually a timing issue while syncing: forget it quietly.
    if (r.missing) { n.seenTx.delete(tx.id); return; }
    badge(n, false);
    if (from) log(`${n.name} rejected a payment from ${from.name}: ${r.err}`, 'warn');
    return;
  }
  n.mempool.set(tx.id, tx);
  n.candidate = null;
  if (from) {
    badge(n, true);
    if (teaching()) log(`${n.name} checked ${payerOf(tx)?.name ?? 'a'}'s payment: signature ✓ · owner ✓ · coin unspent ✓ · amounts ✓ → mempool`, 'check');
  }
  broadcast(n, 'tx', tx, from);
}
async function checkBlock(block, parent) {
  if (block.height !== parent.height + 1) return 'wrong height';
  if (hashBlock(block) !== block.hash) return 'hash does not match block contents';
  if (block.difficulty < 1 || !meets(block.hash, block.difficulty)) return 'not enough proof of work';
  if (merkleRoot(block.txs.map(t => t.id)) !== block.merkle) return 'transaction root does not match';
  const [cb, ...rest] = block.txs;
  if (!cb || !cb.coinbase || cb.inputs.length || txId(cb) !== cb.id) return 'missing or invalid coinbase';
  if (rest.length > MAX_TX) return 'too many transactions';
  const u = UTXO.get(block.prev), spent = new Set();
  let fees = 0;
  for (const tx of rest) {
    const r = await checkTx(tx, u, spent);
    if (!r.ok) return 'contains a bad transaction (' + r.err + ')';
    r.keys.forEach(k => spent.add(k)); fees += r.fee;
  }
  const minted = cb.outputs.reduce((s, o) => s + o.amount, 0);
  if (minted > REWARD + fees) return 'miner paid itself too much';
  if (!UTXO.has(block.hash)) UTXO.set(block.hash, applyBlock(u, block));
  return null;
}
async function onBlock(n, block, from, relay) {
  if (n.blocks.has(block.hash)) return false;
  const parent = n.blocks.get(block.prev);
  if (!parent) {
    const list = n.orphans.get(block.prev) ?? [];
    if (!list.some(b => b.hash === block.hash)) list.push(block);
    n.orphans.set(block.prev, list);
    if (from) send(n, from, 'getchain', null);
    return false;
  }
  const err = await checkBlock(block, parent.block);
  if (err) { badge(n, false); log(`${n.name} rejected block #${block.height} from ${from ? from.name : 'itself'}: ${err}`, 'warn'); return false; }
  n.blocks.set(block.hash, { block, work: parent.work + workOf(block.difficulty) });
  for (const t of block.txs) n.seenTx.add(t.id);
  if (from) {
    badge(n, true);
    if (teaching() && relay) {
      const k = block.txs.length - 1;
      log(`${n.name} checked block #${block.height} from ${from.name}: proof of work ✓ · previous hash ✓ · ${k ? k + ' payment' + (k > 1 ? 's' : '') + ' ✓' : 'reward only'} → added to its chain`, 'check');
    }
  }
  if (n.blocks.get(block.hash).work > tipWork(n)) setTip(n, block.hash);
  if (relay) broadcast(n, 'block', block, from);
  const kids = n.orphans.get(block.hash);
  if (kids) { n.orphans.delete(block.hash); for (const k of kids) await onBlock(n, k, null, relay); }
  return true;
}
async function onBlocks(n, blocks, from) {
  const before = n.tip;
  for (const b of blocks) await onBlock(n, b, from, false);
  if (n.tip !== before) {
    log(`${n.name} synced with ${from.name} and now follows block #${tipBlock(n).height}`, 'net');
    broadcast(n, 'block', tipBlock(n), from);
  }
}
function setTip(n, hash) {
  const oldHash = n.tip;
  n.tip = hash;
  let a = n.blocks.get(oldHash).block, b = n.blocks.get(hash).block;
  const removed = [], added = [];
  while (a.height > b.height) { removed.push(a); a = n.blocks.get(a.prev).block; }
  while (b.height > a.height) { added.push(b); b = n.blocks.get(b.prev).block; }
  while (a.hash !== b.hash) { removed.push(a); added.push(b); a = n.blocks.get(a.prev).block; b = n.blocks.get(b.prev).block; }
  if (removed.length) log(`${n.name} switched to a chain with more work and dropped ${removed.length} block${removed.length > 1 ? 's' : ''} (reorg)`, 'net');
  const addedIds = new Set(added.flatMap(bl => bl.txs.map(t => t.id)));
  const u = UTXO.get(hash), spent = new Set(), pool = new Map();
  const candidates = [...removed.flatMap(bl => bl.txs.filter(t => !t.coinbase)), ...n.mempool.values()];
  let conflicts = 0;
  for (const tx of candidates) {
    if (pool.has(tx.id) || addedIds.has(tx.id)) continue;
    const keys = tx.inputs.map(i => i.txid + ':' + i.vout);
    if (keys.every(k => u.has(k) && !spent.has(k))) { pool.set(tx.id, tx); keys.forEach(k => spent.add(k)); }
    else conflicts++;
  }
  if (conflicts) log(`${n.name} dropped ${conflicts} payment${conflicts > 1 ? 's that conflict' : ' that conflicts'} with the chain (double spend)`, 'warn');
  n.mempool = pool;
  for (const id of [...n.exclude]) if (!pool.has(id)) n.exclude.delete(id);
  n.candidate = null;
}

/* ---------------- Wallet ---------------- */
function walletCoins(n) {
  const u = UTXO.get(n.tip), out = [];
  for (const [k, c] of u) if (n.addrSet.has(c.address)) out.push({ key: k, ...c });
  return out;
}
function balances(n) {
  const coins = walletCoins(n), spent = mempoolSpent(n);
  const confirmed = coins.reduce((s, c) => s + c.amount, 0);
  const free = coins.filter(c => !spent.has(c.key));
  let pending = 0;
  const u = UTXO.get(n.tip);
  for (const tx of n.mempool.values()) {
    for (const o of tx.outputs) if (n.addrSet.has(o.address)) pending += o.amount;
    for (const i of tx.inputs) { const c = u.get(i.txid + ':' + i.vout); if (c && n.addrSet.has(c.address)) pending -= c.amount; }
  }
  return { confirmed, pending, free, freeSum: free.reduce((s, c) => s + c.amount, 0) };
}
async function buildTx(n, coins, toAddr, amount, fee) {
  const inSum = coins.reduce((s, c) => s + c.amount, 0);
  const outputs = [{ address: toAddr, amount }];
  const change = inSum - amount - fee;
  if (change > 0) outputs.push({ address: (await freshKey(n)).address, amount: change });
  const tx = {
    inputs: coins.map(c => { const [txid, vout] = c.key.split(':'); return { txid, vout: +vout, pubkey: KEYS.get(c.address).pubHex, sig: '' }; }),
    outputs, coinbase: false, time: Date.now() + Math.random()
  };
  tx.id = txId(tx);
  for (let i = 0; i < tx.inputs.length; i++) tx.inputs[i].sig = await sign(KEYS.get(coins[i].address).priv, tx.id);
  return { tx, inSum, change };
}
function pickCoins(free, need) {
  const sorted = free.slice().sort((a, b) => b.amount - a.amount), pick = [];
  let sum = 0;
  for (const c of sorted) { if (sum >= need) break; pick.push(c); sum += c.amount; }
  return sum >= need ? pick : null;
}
function takeReceiveAddress(to) {
  const a = to.recv.address;
  freshKey(to).then(k => { to.recv = k; });
  return a;
}
async function pay(n, to, amount, fee, quiet = false) {
  if (!n.online) return 'This node is offline. Bring it online first.';
  const { free, freeSum, confirmed } = balances(n);
  const coins = pickCoins(free, amount + fee);
  if (!coins) {
    if (confirmed >= amount + fee) return 'The change is still pending. Wait until the last payment is in a block.';
    if (!confirmed && teaching()) return `${n.name} owns no coins yet. Mine a block with ${n.name} first to earn the reward.`;
    return `Not enough coins. ${n.name} has ${fmt(freeSum)} SIM available.`;
  }
  const { tx, inSum, change } = await buildTx(n, coins, takeReceiveAddress(to), amount, fee);
  log(`${n.name} signed a payment of ${fmt(amount)} SIM to ${to.name}${fee ? ` (fee ${fee})` : ''}`, 'tx');
  if (!quiet && teaching()) {
    S.watch.set(tx.id, { stage: 'sent', payer: n.name, to: to.name, amount, fee, change, inSum, nIn: coins.length });
    markStep(1);
    narrate('Step 2 · A signed payment',
      `<b>${n.name} signed a payment of ${fmt(amount)} SIM to ${to.name}.</b> As input, ${n.name} spends ${coins.length === 1 ? 'one whole coin' : coins.length + ' whole coins'} worth ${fmt(inSum)} SIM. ` +
      `The payment creates new coins: ${fmt(amount)} SIM to a fresh address of ${to.name}${change ? ` and ${fmt(change)} SIM change back to a new address of ${n.name}` : ''}. ` +
      `${fee ? `The ${fmt(fee)} SIM left over is the fee for whoever mines it. ` : ''}It is not in a block yet. The blue dot carries it from node to node.`,
      [`input ${fmt(inSum)}`, `→ ${to.name} ${fmt(amount)}`, change ? `→ change ${fmt(change)}` : null, fee ? `fee ${fmt(fee)}` : null].filter(Boolean));
  }
  enqueue(n, () => onTx(n, tx, null));
  return quiet ? null : 'ok';
}

/* ---------------- Mining ---------------- */
function feeOf(tx, u) {
  const inSum = tx.inputs.reduce((s, i) => s + (u.get(i.txid + ':' + i.vout)?.amount ?? 0), 0);
  return inSum - tx.outputs.reduce((s, o) => s + o.amount, 0);
}
function buildCandidate(n) {
  const tip = tipBlock(n), u = UTXO.get(n.tip);
  const picked = [...n.mempool.values()].filter(tx => !n.exclude.has(tx.id))
    .map(tx => ({ tx, fee: feeOf(tx, u) })).sort((a, b) => b.fee - a.fee).slice(0, MAX_TX);
  const fees = picked.reduce((s, x) => s + x.fee, 0);
  const cb = coinbaseTx([{ address: n.reward.address, amount: REWARD + fees }], tip.height + 1);
  const txs = [cb, ...picked.map(x => x.tx)];
  return {
    height: tip.height + 1, prev: tip.hash, merkle: merkleRoot(txs.map(t => t.id)),
    time: Date.now(), difficulty: S.difficulty, nonce: 0, txs, miner: n.name, tries: 0, fees
  };
}
let lastMine = performance.now();
function mineTick() {
  const now = performance.now(), dt = Math.min(250, now - lastMine);
  lastMine = now;
  if (!S.running) return;
  const budget = Math.max(1, Math.round(S.hashrate * dt / 1000));
  for (const n of S.nodes) {
    if (!n.online || !n.mining) continue;
    if (!n.candidate) n.candidate = buildCandidate(n);
    const c = n.candidate, target = '0'.repeat(c.difficulty);
    let h = '';
    for (let i = 0; i < budget; i++) {
      c.nonce++; c.tries++; n.hashes++;
      h = sha256(headerOf(c));
      if (h.startsWith(target)) {
        const { tries, fees, ...rest } = c;
        const block = Object.freeze({ ...rest, hash: h });
        n.candidate = null; n.mined++; n.flashAt = now;
        if (teaching()) n.mining = false;
        freshKey(n).then(k => { n.reward = k; });
        log(`${n.name} mined block #${block.height} after ${fmt(tries)} tries (nonce ${fmt(block.nonce)})`, 'block');
        if (teaching()) narrateBlock(n, block, tries, fees);
        enqueue(n, () => onBlock(n, block, null, true));
        break;
      }
    }
    n.lastHash = h;
  }
}
function narrateBlock(n, block, tries, fees) {
  const k = block.txs.length - 1;
  markStep(0);
  narrate(k ? 'A block with payments' : 'A block is mined',
    `<b>${n.name} found block #${block.height}</b> after ${fmt(tries)} tries: its hash <span class="mono">${block.hash.slice(0, 16)}…</span> starts with ${block.difficulty} zeros. ` +
    `The first transaction in the block is the <i>coinbase</i>. It creates ${fmt(REWARD + fees)} new SIM for ${n.name} (${REWARD} reward${fees ? ` + ${fees} fees` : ''}) at a fresh address. ` +
    (k ? `The block also carries ${k} payment${k > 1 ? 's' : ''} from ${n.name}'s mempool. ` : 'There were no payments to include. ') +
    `The copper dot carries the block to the other nodes. Each one checks the proof of work and every transaction before adding it to its own copy of the chain.`,
    ['proof of work ✓', 'links to #' + (block.height - 1), `${k} payment${k === 1 ? '' : 's'}`, `+${fmt(REWARD + fees)} SIM to ${n.name}`]);
}

/* ---------------- Teaching lesson ---------------- */
const STEPS = [
  ['Mine the first block', 'Bob is selected. Press “Mine a block”. The winner earns the 100 SIM block reward.'],
  ['Sign a payment', 'Bob sends 30 SIM to Alice with a fee of 1. His wallet signs it with his private key.'],
  ['Watch every node check it', 'Each node verifies the signature and that the coin is unspent, then keeps it in its mempool.'],
  ['Confirm it in a block', 'Select Erin and press “Mine a block”. She packs the payment into her block and earns reward + fee.'],
  ['Read the UTXO set', 'Bob\'s 100 SIM coin is gone. Alice owns a 30 SIM coin and Bob a 69 SIM change coin. Click a coin to see where it came from.'],
  ['Try to cheat', 'Press “Try a double spend”. Only one of the two payments can end up in the chain.']
];
function markStep(i) { if (!S.lesson[i]) { S.lesson[i] = true; dirty.lesson = true; } }
function renderLesson() {
  const next = S.lesson.findIndex(d => !d);
  $('steps').innerHTML = STEPS.map(([t, d], i) =>
    `<li data-step="${i}" class="${S.lesson[i] ? 'done' : i === next ? 'next' : ''}"><div><b>${t}</b><span>${d}</span></div></li>`).join('');
  dirty.lesson = false;
}
function renderNarr() {
  const n = S.narr;
  $('narrKicker').textContent = n ? n.kicker : 'What just happened';
  $('narrBody').innerHTML = n ? n.html : '';
  $('narrChecks').innerHTML = n ? n.checks.map(c => `<span class="pill ok">${c}</span>`).join('') : '';
  dirty.narr = false;
}
function teachTick() {
  if (!teaching() || !S.watch.size) return;
  const online = S.nodes.filter(n => n.online);
  const inChain = online.map(n => { const m = new Map(); for (const b of mainChain(n)) for (const t of b.txs) m.set(t.id, b); return m; });
  for (const [id, w] of S.watch) {
    if (w.stage === 'sent' && online.every((n, i) => n.mempool.has(id) || inChain[i].has(id))) {
      w.stage = 'checked';
      markStep(2);
      if (!inChain.some(m => m.has(id))) narrate('Step 3 · Every node checked it',
        `<b>All ${online.length} nodes have checked ${w.payer}'s payment on their own.</b> Each one asked: does the signature match the coin's owner? Does the coin exist, and is nobody else spending it? Do the inputs cover the outputs? ` +
        `All answers were yes, so every node keeps the payment in its <i>mempool</i>, a waiting room for unconfirmed transactions. ${w.to} cannot spend the money yet. Now pick any node and press “Mine a block”.`,
        ['signature ✓', 'owner ✓', 'unspent ✓', 'amounts ✓', 'in every mempool']);
    }
    if (w.stage === 'checked' && online.every((n, i) => inChain[i].has(id))) {
      const b = inChain[0].get(id);
      S.watch.delete(id);
      markStep(3);
      narrate('Step 4 · Confirmed',
        `<b>The payment is confirmed in block #${b.height}, mined by ${b.miner}.</b> Every node now has this block. ` +
        `${w.payer}'s old ${w.nIn === 1 ? 'coin' : 'coins'} (${fmt(w.inSum)} SIM) ${w.nIn === 1 ? 'is' : 'are'} spent and gone from the UTXO set. ` +
        `${w.to} now owns a new ${fmt(w.amount)} SIM coin${w.change ? ` and ${w.payer} a ${fmt(w.change)} SIM change coin` : ''}. ` +
        `${b.miner} earned the ${REWARD} SIM reward${w.fee ? ` plus the ${fmt(w.fee)} SIM fee` : ''}. Look at “Who owns what” below.`,
        [`${w.to} +${fmt(w.amount)}`, w.change ? `${w.payer} change ${fmt(w.change)}` : null, `${b.miner} +${REWARD + (w.fee || 0)}`].filter(Boolean));
    }
  }
}

/* ---------------- Random traffic ---------------- */
let nextAuto = 0;
function autoTraffic(now) {
  if (!S.running || !S.autoTx || now < nextAuto) return;
  nextAuto = now + 2500 + Math.random() * 3000;
  const senders = S.nodes.filter(n => n.online && balances(n).freeSum > 6);
  if (!senders.length) return;
  const n = senders[Math.floor(Math.random() * senders.length)];
  const others = S.nodes.filter(o => o !== n);
  const to = others[Math.floor(Math.random() * others.length)];
  const max = Math.min(25, Math.floor(balances(n).freeSum / 2));
  pay(n, to, 1 + Math.floor(Math.random() * max), Math.floor(Math.random() * 3), true);
}

/* ---------------- Rendering ---------------- */
const $ = id => document.getElementById(id);
const svgNS = 'http://www.w3.org/2000/svg';
const dirty = { net: true, log: true, select: true, lesson: true, narr: true };
let edgeG, msgG, nodeG;

function layout() {
  const cx = 320, cy = 188, rx = 245, ry = 135, k = S.nodes.length;
  S.nodes.forEach((n, i) => {
    const a = -Math.PI / 2 + (i / k) * Math.PI * 2;
    n.x = cx + rx * Math.cos(a); n.y = cy + ry * Math.sin(a);
  });
}
function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(svgNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}
function buildSvg() {
  const svg = $('svg');
  svg.textContent = '';
  S.msgs.forEach(m => m.el = null);
  edgeG = el('g', {}, svg); msgG = el('g', {}, svg); nodeG = el('g', {}, svg);
  for (const l of S.links) {
    const a = S.nodes[l.a], b = S.nodes[l.b];
    const g = el('g', {}, edgeG);
    const hit = el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'edge-hit' }, g);
    l.line = el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'edge' }, g);
    const t = el('title', {}, hit); t.textContent = `${a.name} – ${b.name}: click to cut or restore`;
    hit.addEventListener('click', () => toggleLink(l));
  }
  for (const n of S.nodes) {
    const g = el('g', { class: 'node', transform: `translate(${n.x},${n.y})`, tabindex: 0, role: 'button', 'aria-label': n.name }, nodeG);
    el('circle', { r: 36, class: 'ring' }, g);
    n.flashEl = el('circle', { r: 40, class: 'flash' }, g);
    el('circle', { r: 30, class: 'disc' }, g);
    const nm = el('text', { y: -3, class: 'nm' }, g); nm.textContent = n.name;
    n.htEl = el('text', { y: 12, class: 'ht' }, g);
    n.balEl = el('text', { y: 52, class: 'bal' }, g);
    n.badgeG = el('g', { class: 'badge', transform: 'translate(25,-25)' }, g);
    el('circle', { r: 10 }, n.badgeG);
    n.badgeT = el('text', { y: 4.5 }, n.badgeG);
    n.g = g;
    const pick = () => select(n.id);
    g.addEventListener('click', pick);
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  }
  dirty.net = false;
}
function restart(elm, cls) { elm.classList.remove(cls); void elm.getBBox(); elm.classList.add(cls); }
function renderNodes() {
  for (const n of S.nodes) {
    n.g.classList.toggle('sel', n.id === S.selected);
    n.g.classList.toggle('offline', !n.online);
    n.g.classList.toggle('mining', n.online && n.mining && S.running);
    n.htEl.textContent = 'block #' + tipBlock(n).height;
    n.balEl.textContent = fmt(balances(n).confirmed) + ' SIM';
    if (n.flashAt && n.flashAt !== n.flashShown) { n.flashShown = n.flashAt; restart(n.flashEl, 'on'); }
    if (n.badgeAt && n.badgeAt !== n.badgeShown) {
      n.badgeShown = n.badgeAt;
      n.badgeG.classList.toggle('ok', n.badgeOk); n.badgeG.classList.toggle('bad', !n.badgeOk);
      n.badgeT.textContent = n.badgeOk ? '✓' : '✗';
      restart(n.badgeG, 'on');
    }
  }
  for (const l of S.links) l.line.classList.toggle('cut', l.cut);
}
function renderMsgs(now) {
  for (let i = S.msgs.length - 1; i >= 0; i--) {
    const m = S.msgs[i];
    if (!S.running) { m.t0 += now - (m.paused ?? now); m.paused = now; } else m.paused = null;
    const p = (now - m.t0) / m.dur;
    if (p >= 1) {
      m.el?.remove(); S.msgs.splice(i, 1);
      if (S.running) deliver(m);
      continue;
    }
    if (m.type === 'getchain') continue;
    if (!m.el) m.el = el('circle', { r: m.type === 'tx' ? 5 : 7, class: 'dot-' + (m.type === 'tx' ? 'tx' : m.type === 'block' ? 'block' : 'sync') }, msgG);
    const q = Math.max(0, p);
    m.el.setAttribute('cx', m.from.x + (m.to.x - m.from.x) * q);
    m.el.setAttribute('cy', m.from.y + (m.to.y - m.from.y) * q);
  }
}
function majorityTip() {
  const counts = new Map();
  for (const n of S.nodes) if (n.online) counts.set(n.tip, (counts.get(n.tip) ?? 0) + 1);
  let best = null, bestC = 0;
  for (const [h, c] of counts) if (c > bestC) { best = h; bestC = c; }
  return best;
}
function renderConsensus() {
  const major = majorityTip();
  $('consensus').innerHTML = S.nodes.map(n => {
    const tb = tipBlock(n), bal = balances(n).confirmed;
    const status = !n.online ? '<span class="pill">offline</span>' : n.mining ? '<span class="pill acc">mining</span>' : '<span class="pill">idle</span>';
    const agree = !n.online ? '<span class="pill">–</span>' : n.tip === major ? '<span class="pill ok">in sync</span>' : '<span class="pill bad">different tip</span>';
    return `<tr data-id="${n.id}" class="${n.id === S.selected ? 'is-sel' : ''}"><td><strong>${n.name}</strong></td><td>${status}</td><td class="num">${tb.height}</td><td class="mono">${short(tb.hash)}</td><td class="num">${n.mempool.size}</td><td class="num">${fmt(bal)}</td><td>${agree}</td></tr>`;
  }).join('');
}
function txSummary(tx) {
  if (tx.coinbase) return tx.outputs.length ? (tx.height ? `Reward ${fmt(tx.outputs[0].amount)} → ${nameOf(tx.outputs[0].address)}` : 'Starting coins for every node') : 'No coins yet';
  const payer = payerOf(tx);
  const out = tx.outputs.find(o => byAddr.get(o.address) !== payer) ?? tx.outputs[0];
  return `${payer?.name ?? '?'} → ${nameOf(out.address)} · ${fmt(out.amount)}`;
}
function renderPanel() {
  const n = S.nodes[S.selected];
  $('nName').textContent = n.name;
  $('nAddr').textContent = n.recv.address;
  $('nPills').innerHTML = (n.online ? '<span class="pill ok">online</span>' : '<span class="pill bad">offline</span>') +
    (n.mining ? '<span class="pill acc">mining</span>' : '') + `<span class="pill">${n.mined} block${n.mined === 1 ? '' : 's'} mined</span>` +
    `<span class="pill">${n.wallet.length} address${n.wallet.length === 1 ? '' : 'es'}</span>`;
  const mineBtn = $('btnMine');
  mineBtn.textContent = n.mining ? 'Stop mining' : teaching() ? 'Mine a block' : 'Start mining';
  mineBtn.classList.toggle('primary', !n.mining);
  $('btnOnline').textContent = n.online ? 'Go offline' : 'Come back online';
  const b = balances(n);
  $('nBal').textContent = fmt(b.confirmed);
  $('nPend').textContent = (b.pending > 0 ? '+' : '') + fmt(b.pending) + ' SIM';
  const coins = walletCoins(n).sort((x, y) => y.amount - x.amount), spent = mempoolSpent(n);
  $('nUtxo').innerHTML = coins.length ? coins.map(c =>
    `<div class="li"><span>address ${KEYS.get(c.address)?.idx ?? '?'} <span class="mono muted">${c.address.slice(0, 8)}…</span></span><span class="num">${fmt(c.amount)} SIM${spent.has(c.key) ? ' <span class="pill tx">spending</span>' : ''}</span></div>`).join('')
    : `<p class="empty">No coins yet. Mine a block to earn the reward, or ask another node to pay you.</p>`;
  const pool = [...n.mempool.values()], u = UTXO.get(n.tip);
  $('poolTitle').textContent = teaching() ? 'Mempool of this node (ticked = goes into its next block)' : 'Mempool of this node';
  $('nPool').innerHTML = pool.length ? pool.map(tx =>
    `<div class="li">${teaching() ? `<input type="checkbox" data-inc="${tx.id}" aria-label="Include in next block" ${n.exclude.has(tx.id) ? '' : 'checked'}>` : ''}<span class="grow" data-tx="${tx.id}"><span>${txSummary(tx)}</span><span class="muted">fee ${fmt(feeOf(tx, u))}</span></span></div>`).join('')
    : '<p class="empty">Empty. Signed payments wait here until a miner puts them in a block.</p>';
  $('chainTitle').textContent = `Blockchain as seen by ${n.name}`;
  $('ownersTitle').textContent = `Who owns what: the UTXO set as seen by ${n.name}`;
}
function renderHash() {
  const n = S.nodes[S.selected];
  if (!n.online || !n.mining || !n.candidate) {
    $('hashLabel').textContent = !n.online ? 'Offline' : n.mining ? 'Preparing a block…' : teaching() ? 'Not mining. Press “Mine a block” to search for a valid nonce.' : 'Mining is off. Start mining to search for the next block.';
    $('hashLive').textContent = '–';
    $('hashContents').textContent = '';
    return;
  }
  const c = n.candidate, d = c.difficulty;
  $('hashLabel').textContent = `Block #${c.height} · try ${fmt(c.tries)} · nonce ${fmt(c.nonce)} · needs ${d} leading zeros`;
  const h = n.lastHash || '';
  let z = 0; while (z < h.length && h[z] === '0') z++;
  $('hashLive').innerHTML = `<b>${h.slice(0, z)}</b>${h.slice(z)}`;
  $('hashContents').textContent = 'Block contents: ' + c.txs.map(txSummary).join('; ');
}
let chainKey = '';
function renderChain() {
  const n = S.nodes[S.selected];
  const key = n.id + ':' + n.tip;
  if (key === chainKey) return;
  const blocks = mainChain(n).slice(0, 40);
  const fresh = chainKey.startsWith(n.id + ':') ? blocks[0].hash : null;
  chainKey = key;
  $('chain').innerHTML = blocks.map((b, i) => {
    const lines = b.txs.slice(0, 4).map(t => `<div class="${t.coinbase ? 'cb' : ''}">${txSummary(t)}</div>`).join('') + (b.txs.length > 4 ? `<div class="muted">+ ${b.txs.length - 4} more</div>` : '');
    return `${i ? '<div class="link" aria-hidden="true"></div>' : ''}<button type="button" class="blk${b.hash === fresh ? ' new' : ''}" data-hash="${b.hash}">
      <div class="bh"><strong class="num">#${b.height}</strong><span class="muted">${b.height ? 'mined by ' + b.miner : 'genesis'}</span></div>
      <div class="kv"><span>Hash</span><span class="mono">${b.hash.slice(0, 12)}…</span></div>
      <div class="kv"><span>Prev</span><span class="mono">${b.prev.slice(0, 12)}…</span></div>
      <div class="kv"><span>Nonce</span><span class="num">${fmt(b.nonce)}</span></div>
      <div class="txs">${lines}</div>
    </button>`;
  }).join('');
}
let ownersKey = '';
function renderOwners() {
  const v = S.nodes[S.selected];
  const key = v.id + ':' + v.tip + ':' + [...v.mempool.keys()].join(',') + ':' + S.nodes.length;
  if (key === ownersKey) return;
  ownersKey = key;
  const u = UTXO.get(v.tip), spent = mempoolSpent(v), origin = new Map();
  for (const b of mainChain(v)) for (const t of b.txs) origin.set(t.id, { tx: t, block: b });
  $('owners').innerHTML = S.nodes.map(p => {
    const coins = [...u].filter(([, c]) => p.addrSet.has(c.address)).map(([k, c]) => ({ key: k, ...c })).sort((a, b) => b.amount - a.amount);
    const total = coins.reduce((s, c) => s + c.amount, 0);
    const rows = coins.map(c => {
      const o = origin.get(c.key.split(':')[0]);
      let from = '?';
      if (o) {
        const payer = payerOf(o.tx);
        from = o.tx.coinbase ? (o.block.height ? `reward for block #${o.block.height}` : 'starting coins') : payer === p ? `change, block #${o.block.height}` : `from ${payer?.name ?? '?'}, block #${o.block.height}`;
      }
      const sp = spent.has(c.key);
      return `<div class="coin${sp ? ' spending' : ''}" data-coin="${c.key}"><span>address ${KEYS.get(c.address)?.idx ?? '?'} <span class="mono muted">${c.address.slice(0, 10)}…</span></span><span class="amt num">${fmt(c.amount)} SIM</span><span class="where">${from}${sp ? ' <span class="pill tx">being spent</span>' : ''}</span></div>`;
    }).join('');
    return `<div class="owner"><div class="owner-head"><strong>${p.name}</strong><span><span class="tot num">${fmt(total)}</span> <span class="muted">SIM in ${coins.length} coin${coins.length === 1 ? '' : 's'}</span></span></div>${rows || '<p class="empty">No coins.</p>'}</div>`;
  }).join('');
}
function renderLog() {
  $('log').innerHTML = S.log.map(e => {
    const s = Math.floor(e.t / 1000);
    return `<div class="k-${e.kind}"><span class="t">${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}</span><i></i><span>${e.text}</span></div>`;
  }).join('') || '<p class="empty">Nothing yet.</p>';
  dirty.log = false;
}
function renderSelect() {
  const n = S.nodes[S.selected], sel = $('sendTo'), prev = sel.value;
  sel.innerHTML = S.nodes.filter(o => o !== n).map(o => `<option value="${o.id}">${o.name}</option>`).join('');
  if ([...sel.options].some(o => o.value === prev)) sel.value = prev;
  dirty.select = false;
}
const HEAD = {};
function setCompliance(on) {
  document.body.classList.toggle('cc-on', on);
  $('simView').hidden = on;
  $('ccView').hidden = !on;
  const top = document.querySelector('.top .brand');
  const parts = { eyebrow: top.querySelector('.eyebrow'), h1: top.querySelector('h1'), p: top.querySelector('p') };
  if (!HEAD.h1) for (const k in parts) HEAD[k] = parts[k].innerHTML;
  parts.eyebrow.innerHTML = on ? 'Compliance mode · Chain-Check' : HEAD.eyebrow;
  parts.h1.innerHTML = on ? 'Follow the money, <em>back to the first block</em>.' : HEAD.h1;
  parts.p.innerHTML = on ? 'A simulated blockchain with hundreds of thousands of transactions since 2011. Chain-Check screens every deposit at your exchange for links to darknet markets, mixers, ransomware, scams, hacks and sanctioned entities, and explains what it finds.' : HEAD.p;
}
function switchMode(m) {
  if (m === S.mode) return;
  if (m === 'compliance') {
    S.mode = 'compliance';
    S.running = false;
    S.epoch++;
    renderMode();
    window.ChainCheck?.open();
    return;
  }
  init(m);
}
function renderMode() {
  setCompliance(S.mode === 'compliance');
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode)));
  $('lessonPanel').hidden = !teaching();
  $('difficulty').value = String(S.difficulty);
  $('hashrate').value = S.hashrate; $('hashrateOut').textContent = fmt(S.hashrate) + ' H/s';
  $('delay').value = S.delay; $('delayOut').textContent = (S.delay / 1000).toFixed(1) + ' s';
  $('autoTx').checked = S.autoTx;
  $('btnRun').textContent = S.running ? 'Pause' : 'Resume';
}

let lastSlow = 0;
function frame(now) {
  if (!S.nodes.length || S.mode === 'compliance') { requestAnimationFrame(frame); return; }
  if (dirty.net) buildSvg();
  autoTraffic(now);
  renderMsgs(now);
  if (now - lastSlow > 250) {
    lastSlow = now;
    teachTick();
    renderNodes(); renderConsensus(); renderPanel(); renderHash(); renderChain(); renderOwners();
    if (dirty.select) renderSelect();
    if (dirty.log) renderLog();
    if (dirty.lesson) renderLesson();
    if (dirty.narr) renderNarr();
  }
  requestAnimationFrame(frame);
}

/* ---------------- Interaction ---------------- */
function select(id) { S.selected = id; dirty.select = true; $('sendMsg').textContent = ''; lastSlow = 0; }
function toggleLink(l) {
  l.cut = !l.cut;
  const a = S.nodes[l.a], b = S.nodes[l.b];
  log(`Connection ${a.name} – ${b.name} ${l.cut ? 'cut' : 'restored'}`, 'net');
  if (!l.cut) syncPair(a, b);
  lastSlow = 0;
}
$('consensus').addEventListener('click', e => { const tr = e.target.closest('tr'); if (tr) select(+tr.dataset.id); });
$('btnMine').addEventListener('click', () => {
  const n = S.nodes[S.selected];
  if (!n.online) { $('sendMsg').className = 'msg err'; $('sendMsg').textContent = 'This node is offline.'; return; }
  n.mining = !n.mining; n.candidate = null;
  log(`${n.name} ${n.mining ? 'started' : 'stopped'} mining`, 'block');
  if (n.mining && teaching()) {
    const k = [...n.mempool.keys()].filter(id => !n.exclude.has(id)).length;
    narrate('Mining',
      `<b>${n.name} is mining block #${tipBlock(n).height + 1}.</b> ${n.name} puts ${k ? k + ' payment' + (k > 1 ? 's' : '') + ' from the mempool' : 'no payments (the mempool is empty)'} and a reward for itself into a block. Then it hashes the block again and again, with a new nonce each time. ` +
      `The block counts only when its SHA-256 hash starts with ${S.difficulty} zeros. That takes about ${fmt(Math.pow(16, S.difficulty))} tries on average. Watch the counter in the wallet panel.`,
      [`target: ${'0'.repeat(S.difficulty)}…`]);
  }
  lastSlow = 0;
});
$('btnOnline').addEventListener('click', () => {
  const n = S.nodes[S.selected]; n.online = !n.online;
  log(`${n.name} went ${n.online ? 'online' : 'offline'}`, 'net');
  if (n.online) for (const p of peersOf(n)) syncPair(n, p);
  lastSlow = 0;
});
$('btnCopy').addEventListener('click', async () => {
  const t = S.nodes[S.selected].recv.address;
  try { await navigator.clipboard.writeText(t); $('btnCopy').textContent = 'Copied'; }
  catch { const r = document.createRange(); r.selectNodeContents($('nAddr')); getSelection().removeAllRanges(); getSelection().addRange(r); }
  setTimeout(() => $('btnCopy').textContent = 'Copy', 1200);
});
$('sendForm').addEventListener('submit', async e => {
  e.preventDefault();
  const n = S.nodes[S.selected], to = S.nodes[+$('sendTo').value];
  const amount = Math.floor(+$('sendAmt').value), fee = Math.floor(+$('sendFee').value || 0);
  const m = $('sendMsg');
  if (!to) { m.className = 'msg err'; m.textContent = 'Pick a receiver.'; return; }
  if (!(amount >= 1) || fee < 0) { m.className = 'msg err'; m.textContent = 'Enter a whole amount of at least 1 and a fee of 0 or more.'; return; }
  const r = await pay(n, to, amount, fee);
  const peers = peersOf(n).length;
  m.className = 'msg ' + (r === 'ok' ? 'ok' : 'err');
  m.textContent = r === 'ok' ? `Signed and sent to ${peers} peer${peers === 1 ? '' : 's'}.` : r;
  lastSlow = 0;
});
$('btnDouble').addEventListener('click', async () => {
  const n = S.nodes[S.selected], m = $('sendMsg');
  const peers = peersOf(n);
  m.className = 'msg err';
  if (!n.online) { m.textContent = 'This node is offline.'; return; }
  if (peers.length < 2) { m.textContent = 'You need at least two connected peers for this.'; return; }
  const { free, confirmed } = balances(n);
  if (!free.length) { m.textContent = confirmed ? 'All coins are tied up in pending payments. Wait for the next block.' : `${n.name} owns no coins yet.`; return; }
  const coin = free.sort((a, b) => b.amount - a.amount)[0];
  const [p1, p2] = peers.sort(() => Math.random() - 0.5);
  const amt = Math.max(1, coin.amount - 1);
  const t1 = await buildTx(n, [coin], takeReceiveAddress(p1), amt, 1);
  const t2 = await buildTx(n, [coin], takeReceiveAddress(p2), amt, 1);
  log(`${n.name} tried a double spend: the same ${fmt(coin.amount)} SIM coin sent to ${p1.name} and to ${p2.name}`, 'warn');
  n.seenTx.add(t1.tx.id); n.seenTx.add(t2.tx.id);
  send(n, p1, 'tx', t1.tx); send(n, p2, 'tx', t2.tx);
  if (teaching()) {
    markStep(5);
    narrate('Step 6 · A double spend',
      `<b>${n.name} signed two payments that spend the same ${fmt(coin.amount)} SIM coin</b>: one to ${p1.name}, one to ${p2.name}. Both signatures are valid. ` +
      `Each node accepts whichever payment reaches it first and rejects the other with a red ✗, because that coin is already being spent. ` +
      `Mine a block: only one of the two payments can go in. Once it is confirmed, every node drops the other one.`,
      ['same coin, two payments', 'first seen wins', 'only one gets confirmed']);
  }
  m.className = 'msg ok';
  m.textContent = `Two conflicting payments sent to ${p1.name} and ${p2.name}. Watch the log.`;
});
$('chain').addEventListener('click', e => { const b = e.target.closest('.blk'); if (b) openBlock(b.dataset.hash); });
$('nPool').addEventListener('click', e => { const li = e.target.closest('[data-tx]'); if (li) openTx(S.nodes[S.selected].mempool.get(li.dataset.tx), null); });
$('nPool').addEventListener('change', e => {
  const id = e.target.dataset.inc; if (!id) return;
  const n = S.nodes[S.selected];
  if (e.target.checked) n.exclude.delete(id); else n.exclude.add(id);
  n.candidate = null;
});
$('owners').addEventListener('click', e => {
  const c = e.target.closest('[data-coin]'); if (!c) return;
  const tid = c.dataset.coin.split(':')[0];
  for (const b of mainChain(S.nodes[S.selected])) { const t = b.txs.find(x => x.id === tid); if (t) { markStep(4); openTx(t, b); return; } }
});
$('steps').addEventListener('click', e => {
  const li = e.target.closest('[data-step]'); if (!li) return;
  const i = +li.dataset.step; S.lesson[i] = !S.lesson[i]; dirty.lesson = true; lastSlow = 0;
});
document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => switchMode(b.dataset.mode)));
$('btnRun').addEventListener('click', () => { S.running = !S.running; renderMode(); lastSlow = 0; });
$('difficulty').addEventListener('change', e => { S.difficulty = +e.target.value; S.nodes.forEach(n => n.candidate = null); log(`Difficulty set to ${S.difficulty} leading zeros for new blocks`, 'block'); });
$('hashrate').addEventListener('input', e => { S.hashrate = +e.target.value; $('hashrateOut').textContent = fmt(S.hashrate) + ' H/s'; });
$('delay').addEventListener('input', e => { S.delay = +e.target.value; $('delayOut').textContent = (S.delay / 1000).toFixed(1) + ' s'; });
$('autoTx').addEventListener('change', e => { S.autoTx = e.target.checked; });
$('btnClear').addEventListener('click', () => { S.log = []; dirty.log = true; });
$('btnReset').addEventListener('click', () => init(S.mode));
$('btnAdd').addEventListener('click', async () => {
  if (S.nodes.length >= NAMES.length) { log('The sandbox holds at most 10 nodes', 'warn'); return; }
  const epoch = S.epoch;
  const key = await makeKeys();
  if (epoch !== S.epoch) return;
  const n = makeNode(S.nodes.length, key);
  addGenesis(n);
  const others = S.nodes.slice();
  S.nodes.push(n);
  const linked = others.sort(() => Math.random() - 0.5).slice(0, 2);
  for (const o of linked) addLink(n.id, o.id);
  layout(); dirty.net = true; dirty.select = true;
  log(`${n.name} joined the network and is downloading the chain`, 'net');
  for (const o of linked) syncPair(n, o);
});

/* ---------------- Block / transaction inspector ---------------- */
const dlg = $('dlg'), body = $('dlgBody');
function findBlock(hash) {
  for (const n of [S.nodes[S.selected], ...S.nodes]) { const e = n.blocks.get(hash); if (e) return e.block; }
  return null;
}
function openBlock(hash) {
  const b = findBlock(hash); if (!b) return;
  body.innerHTML = `
    <div class="dlg-head"><h3>Block #${b.height}${b.height ? ' · mined by ' + b.miner : ' (genesis)'}</h3><button type="button" data-close>Close</button></div>
    <dl class="kvs">
      <dt>Hash</dt><dd class="mono" id="bHash"></dd>
      <dt>Proof of work</dt><dd id="bPow"></dd>
      <dt>Previous hash</dt><dd class="mono">${b.prev}</dd>
      <dt>Transaction root</dt><dd class="mono">${b.merkle}</dd>
      <dt>Time</dt><dd>${new Date(b.time).toLocaleTimeString('en-GB')}</dd>
      <dt>Difficulty</dt><dd>${b.difficulty} leading zeros</dd>
      <dt><label for="bNonce">Nonce</label></dt><dd><input id="bNonce" type="number" value="${b.nonce}"> <span class="note">Edit it to see the hash change</span></dd>
    </dl>
    <p class="note">The hash is SHA-256 of: <span class="mono" id="bHeader"></span></p>
    <h2>Transactions (${b.txs.length})</h2>
    <div class="list" style="max-height:none">${b.txs.map(tx => `<div class="txcard" data-tx="${tx.id}"><span class="mono">${short(tx.id)}</span><span>${tx.coinbase ? '<span class="pill acc">coinbase</span> ' : ''}${txSummary(tx)}</span></div>`).join('')}</div>`;
  const update = () => {
    const v = { ...b, nonce: Math.floor(+$('bNonce').value || 0) };
    const h = hashBlock(v), ok = meets(h, b.difficulty) && h === b.hash;
    $('bHash').textContent = h;
    $('bHeader').textContent = headerOf(v);
    $('bPow').innerHTML = ok ? '<span class="pill ok">Valid: hash starts with ' + b.difficulty + ' zeros</span>'
      : meets(h, b.difficulty) ? '<span class="pill bad">Different block: hash no longer matches</span>'
      : `<span class="pill bad">Invalid: hash does not start with ${b.difficulty} zeros</span>`;
  };
  $('bNonce').addEventListener('input', update);
  update();
  body.querySelectorAll('.txcard').forEach(c => c.addEventListener('click', () => openTx(b.txs.find(t => t.id === c.dataset.tx), b)));
  if (!dlg.open) dlg.showModal();
}
function openTx(tx, block) {
  if (!tx) return;
  const u = block ? UTXO.get(block.prev) : UTXO.get(S.nodes[S.selected].tip);
  let inSum = 0;
  const ins = tx.coinbase ? '<span class="muted">No inputs. The block creates these coins (reward + fees).</span>' : tx.inputs.map(i => {
    const c = u?.get(i.txid + ':' + i.vout); inSum += c?.amount ?? 0;
    return `<div><strong>${c ? fmt(c.amount) + ' SIM' : '?'}</strong> from ${c ? addrTag(c.address) : '?'}<div class="mono muted">spends coin ${short(i.txid)}:${i.vout}</div><div class="mono muted">signature ${i.sig.slice(0, 28)}…</div></div>`;
  }).join('');
  const outSum = tx.outputs.reduce((s, o) => s + o.amount, 0);
  const payer = payerOf(tx);
  const outs = tx.outputs.length ? tx.outputs.map(o => `<div><strong>${fmt(o.amount)} SIM</strong> to ${addrTag(o.address)}${!tx.coinbase && byAddr.get(o.address) === payer ? ' <span class="pill">change</span>' : ''}<div class="mono muted">${o.address}</div></div>`).join('') : '<span class="muted">None</span>';
  body.innerHTML = `
    <div class="dlg-head"><h3>${tx.coinbase ? 'Coinbase transaction' : 'Transaction'}</h3><div class="row">${block ? '<button type="button" data-back>Back to block</button>' : ''}<button type="button" data-close>Close</button></div></div>
    <dl class="kvs">
      <dt>ID</dt><dd class="mono">${tx.id}</dd>
      <dt>Status</dt><dd>${block ? `<span class="pill ok">confirmed in block #${block.height}</span>` : '<span class="pill tx">waiting in mempool</span>'}</dd>
      ${tx.coinbase ? '' : `<dt>Inputs − outputs</dt><dd>${fmt(inSum)} − ${fmt(outSum)} = <strong>${fmt(inSum - outSum)} SIM fee</strong> for the miner</dd>`}
    </dl>
    <div class="io"><div><h2>Inputs (coins spent)</h2>${ins}</div><div class="arrow">→</div><div><h2>Outputs (new coins)</h2>${outs}</div></div>
    ${tx.coinbase ? '' : '<p class="note">Each input is signed with the private key of the address that owns the coin. Every node checks the signature against the public key before accepting the transaction.</p>'}`;
  body.querySelector('[data-back]')?.addEventListener('click', () => openBlock(block.hash));
  if (!dlg.open) dlg.showModal();
}
body.addEventListener('click', e => { if (e.target.closest('[data-close]')) dlg.close(); });
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

/* ---------------- Start ---------------- */
const MODES = {
  teach: { count: 5, grant: 0, miners: [], difficulty: 3, hashrate: 1500, delay: 1600, autoTx: false },
  sim: { count: 6, grant: GENESIS_GRANT, miners: [1, 3, 4], difficulty: 4, hashrate: 3000, delay: 900, autoTx: true }
};
async function init(mode) {
  S.epoch++;
  const epoch = S.epoch, cfg = MODES[mode];
  S.mode = mode;
  S.nodes = []; S.links = []; S.msgs = []; S.selected = mode === 'teach' ? 1 : 0;
  S.difficulty = cfg.difficulty; S.hashrate = cfg.hashrate; S.delay = cfg.delay; S.autoTx = cfg.autoTx; S.running = true;
  S.lesson = STEPS.map(() => false); S.watch.clear(); S.narr = null;
  UTXO.clear(); byAddr.clear(); KEYS.clear();
  if (msgG) msgG.textContent = '';
  chainKey = ''; ownersKey = '';
  renderMode();
  if (!subtle) { $('log').innerHTML = '<p class="msg err">This browser has no WebCrypto, which the sandbox needs for signatures.</p>'; return; }
  const keys = await Promise.all(Array.from({ length: cfg.count }, makeKeys));
  if (epoch !== S.epoch) return;
  const nodes = keys.map((k, i) => makeNode(i, k));
  const gTx = coinbaseTx(cfg.grant ? nodes.map(n => ({ address: n.wallet[0].address, amount: cfg.grant })) : [], 0);
  const g = { height: 0, prev: ZERO, merkle: merkleRoot([gTx.id]), time: Date.now(), difficulty: 2, nonce: 0, txs: [gTx], miner: 'genesis' };
  while (!meets(hashBlock(g), g.difficulty)) g.nonce++;
  S.genesis = Object.freeze({ ...g, hash: hashBlock(g) });
  UTXO.set(S.genesis.hash, applyBlock(new Map(), S.genesis));
  nodes.forEach(addGenesis);
  // fresh receive and reward addresses, so every new coin lands on its own address
  // (in teaching mode nobody has coins yet, so address 1 is the first receive address and address 2 collects the first mining reward)
  await Promise.all(nodes.map(async n => { if (cfg.grant) n.recv = await freshKey(n); n.reward = await freshKey(n); }));
  if (epoch !== S.epoch) return;
  S.nodes = nodes;
  // ring plus cross links, so messages need several hops
  nodes.forEach((n, i) => addLink(i, (i + 1) % nodes.length));
  if (mode === 'teach') addLink(1, 3); else { addLink(0, 3); addLink(1, 4); }
  cfg.miners.forEach(i => nodes[i].mining = true);
  layout();
  S.log = [];
  if (mode === 'teach') {
    log('Teaching mode: 5 nodes, nobody owns coins yet, nothing happens by itself.', 'block');
    narrate('Teaching mode',
      `<b>Five computers run the same blockchain.</b> Right now it holds only the genesis block, and nobody owns a single coin. Nothing happens unless you make it happen. ` +
      `Bob is selected. Press <b>Mine a block</b> in his wallet panel to create the first coins.`,
      ['5 nodes', '0 coins', 'only block #0']);
  } else {
    log('Genesis block created. Every node starts with 100 SIM.', 'block');
    log('Bob, Dave and Erin are mining.', 'block');
  }
  dirty.net = dirty.select = dirty.log = dirty.lesson = dirty.narr = true;
  lastSlow = 0;
}

const startDlg = $('startDlg');
startDlg.querySelectorAll('[data-start]').forEach(b => b.addEventListener('click', () => {
  startDlg.close();
  switchMode(b.dataset.start);
}));
window.CMV?.registerSW();
init('teach').then(() => {
  requestAnimationFrame(frame);
  setInterval(mineTick, 50);
  try { startDlg.showModal(); } catch { /* without dialog support the page still works in teaching mode */ }
});
