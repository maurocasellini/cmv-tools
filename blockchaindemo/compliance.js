/* Chain-Check – the compliance mode of the CM Ventures Blockchain Demo.
   Builds a large simulated blockchain (≈280,000 transactions, 2011–2024) with a realistic economy and the
   kinds of illicit flows a compliance team looks for, then screens every recent deposit at the (fictional)
   Nordstern Exchange: attribution, address clustering, haircut tracing back to the mined block, exposure,
   behaviour patterns and a risk score with a recommended action. Everything is generated in the browser. */
(() => {
  'use strict';

  /* ---------------- helpers ---------------- */
  const $ = (id) => document.getElementById(id);
  const SAT = 1e8;
  const FEE = 1500;
  const DUST = 600;
  const nf = (n, d = 0) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const btc = (s) => {
    const v = s / SAT;
    return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: v < 0.1 ? 4 : 2 });
  };
  const pct = (w) => (w >= 0.995 ? '100' : w >= 0.1 ? nf(w * 100) : w >= 0.01 ? nf(w * 100, 1) : nf(w * 100, 2)) + '%';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  let R = mulberry32(1);
  const rnd = () => R();
  const ri = (n) => Math.floor(R() * n);
  const uni = (a, b) => a + (b - a) * R();
  const pick = (a) => a[Math.floor(R() * a.length)];

  /* ---------------- time: the real Bitcoin chain from the genesis block (2009) to the end of 2024 ----------------
     Block heights, dates and rewards follow the real chain. The simulation runs in 4,200 time slices and places
     every modelled transaction in the real block that was mined at its time; the chain itself holds far more. */
  const HEIGHTS = [[0, '2009-01-03T18:15'], [100000, '2010-12-29T11:57'], [210000, '2012-11-28T15:24'], [300000, '2014-05-10T04:43'],
    [420000, '2016-07-09T16:46'], [500000, '2017-12-18T17:42'], [630000, '2020-05-11T19:23'], [700000, '2021-09-11T04:14'],
    [800000, '2023-07-24T03:44'], [840000, '2024-04-20T00:09'], [877260, '2024-12-31T23:59']].map(([h, d]) => [h, Date.parse(d + 'Z')]);
  const HEIGHT_END = 877260;
  const heightAt = (ms) => {
    for (let i = 1; i < HEIGHTS.length; i++) {
      const [h1, t1] = HEIGHTS[i];
      if (ms <= t1) { const [h0, t0] = HEIGHTS[i - 1]; return Math.round(h0 + (h1 - h0) * Math.max(0, ms - t0) / (t1 - t0)); }
    }
    return HEIGHT_END;
  };
  const rewardAt = (h) => (50 * SAT) / Math.pow(2, Math.floor(h / 210000));
  const BLOCKS = 4200;
  const T0 = HEIGHTS[0][1], T1 = HEIGHTS[HEIGHTS.length - 1][1];
  const SPAN = (T1 - T0) / (BLOCKS - 1);
  const yb = (y) => {
    const yr = Math.floor(y);
    const ms = Date.UTC(yr, 0, 1) + (y - yr) * 365.25 * 864e5;
    return Math.max(0, Math.min(BLOCKS - 1, Math.round((ms - T0) / SPAN)));
  };
  const dateOf = (ms) => new Date(ms).toISOString().slice(0, 10);
  const dtOf = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
  const reward = (b) => rewardAt(heightAt(T0 + b * SPAN));
  const duration = (ms) => {
    const d = ms / 864e5;
    const unit = (n, w) => nf(n) + ' ' + w + (Math.round(n) === 1 ? '' : 's');
    if (d < 1) return unit(Math.max(1, ms / 36e5), 'hour');
    if (d < 60) return unit(d, 'day');
    if (d < 730) return unit(d / 30.4, 'month');
    return nf(d / 365.25, 1) + ' years';
  };

  /* ---------------- categories and the attribution database ---------------- */
  const CAT = {
    sanctions: { label: 'Sanctioned entity', sev: 100, color: '#8f1d3c' },
    ransomware: { label: 'Ransomware', sev: 95, color: '#c0392b' },
    darknet: { label: 'Darknet market', sev: 90, color: '#7d3c98' },
    stolen: { label: 'Stolen funds', sev: 90, color: '#a93226' },
    mixer: { label: 'Mixer', sev: 80, color: '#d35400' },
    scam: { label: 'Scam', sev: 75, color: '#b9770e' },
    highrisk: { label: 'High-risk exchange (no KYC)', sev: 50, color: '#a08a2a' },
    gambling: { label: 'Online gambling', sev: 30, color: '#7e8a3a' },
    p2p: { label: 'P2P exchange', sev: 25, color: '#5d8a5a' },
    exchange: { label: 'Regulated exchange', sev: 0, color: '#2f62a8' },
    mining: { label: 'Mining pool', sev: 0, color: '#3d7a63' },
    merchant: { label: 'Merchant services', sev: 0, color: '#3a8a9a' },
    mined: { label: 'Newly mined (solo miner)', sev: 0, color: '#3d7a63' },
    unknown: { label: 'Not attributed', sev: 0, color: '#9aa0ad' },
  };
  // real = historical, publicly reported service (seized, sanctioned or convicted). All addresses and flows are invented.
  const ENTITY_DEFS = [
    { key: 'nord', name: 'Nordstern Exchange', cat: 'exchange', from: 2011.5, to: 2025, n: 60, note: 'Your exchange in this simulation (fictional). Chain-Check screens every deposit it receives.' },
    { key: 'alpen', name: 'Alpenblick Exchange', cat: 'exchange', from: 2012.0, to: 2025, n: 60, note: 'A regulated exchange that identifies its customers (fictional).' },
    { key: 'rhein', name: 'Rheintal Pay', cat: 'merchant', from: 2013.0, to: 2025, n: 12, note: 'Payment processor for online shops (fictional).' },
    { key: 'summit', name: 'Summit Pool', cat: 'mining', from: 2011.0, to: 2025, n: 8, note: 'Mining pool: receives new coins from block rewards and pays its miners (fictional).' },
    { key: 'glacier', name: 'Glacier Pool', cat: 'mining', from: 2013.2, to: 2025, n: 8, note: 'Mining pool (fictional).' },
    { key: 'dice', name: 'Lucky Dice Casino', cat: 'gambling', from: 2013.0, to: 2025, n: 10, note: 'Online casino without licence checks (fictional).' },
    { key: 'local', name: 'LocalTrade P2P', cat: 'p2p', from: 2013.0, to: 2025, n: 10, note: 'Person-to-person marketplace for buying coins, often without identity checks (fictional).' },
    { key: 'swift', name: 'SwiftSwap', cat: 'highrisk', from: 2016.0, to: 2025, n: 14, note: 'Exchange that asks for no identification (no KYC) and is popular for cashing out (fictional).' },
    { key: 'silk', name: 'Silk Road', cat: 'darknet', from: 2011.1, to: 2013.78, n: 16, real: true, note: 'Darknet market for drugs and other illegal goods. Seized by the FBI in October 2013.' },
    { key: 'alpha', name: 'AlphaBay', cat: 'darknet', from: 2014.95, to: 2017.53, n: 16, real: true, note: 'Darknet market, taken down by international law enforcement in July 2017.' },
    { key: 'hydra', name: 'Hydra Market', cat: 'darknet', from: 2015.5, to: 2022.26, n: 16, real: true, note: 'Russian-language darknet market. Shut down by German police and sanctioned by the US in April 2022.' },
    { key: 'fog', name: 'Bitcoin Fog', cat: 'mixer', from: 2011.8, to: 2021.3, n: 12, real: true, note: 'One of the oldest bitcoin mixers. Its operator was convicted of money laundering in 2024.' },
    { key: 'helix', name: 'Helix', cat: 'mixer', from: 2014.5, to: 2017.9, n: 12, real: true, note: 'Mixer advertised on darknet markets. Its operator pleaded guilty to money laundering.' },
    { key: 'chip', name: 'ChipMixer', cat: 'mixer', from: 2017.6, to: 2023.2, n: 12, real: true, note: 'Mixer taken down by European and US authorities in March 2023.' },
    { key: 'wanna', name: 'WannaCry', cat: 'ransomware', from: 2017.36, to: 2017.62, n: 3, real: true, note: 'Ransomware that encrypted hundreds of thousands of computers worldwide in May 2017.' },
    { key: 'ryuk', name: 'Ryuk', cat: 'ransomware', from: 2018.6, to: 2021.5, n: 8, real: true, note: 'Ransomware that targeted companies, hospitals and city administrations.' },
    { key: 'garantex', name: 'Garantex', cat: 'sanctions', from: 2019.5, to: 2025, n: 14, real: true, note: 'Exchange sanctioned by the US (OFAC) in April 2022 for laundering funds from ransomware and darknet markets.' },
    { key: 'scam', name: 'BitYield Pro', cat: 'scam', from: 2019.2, to: 2020.6, n: 8, note: 'Fake investment platform promising 2% per day, a Ponzi scheme (fictional).' },
    { key: 'hack', name: 'Alpenblick hack (2022)', cat: 'stolen', from: 2022.3, to: 2025, n: 6, note: 'Coins stolen from the hot wallet of Alpenblick Exchange in a 2022 hack (fictional).' },
  ];

  /* ---------------- the ledger (typed arrays) ---------------- */
  const CAP = { tx: 330000, out: 1100000, inp: 1100000, addr: 760000 };
  let txBlock, txTime, txIn0, txNIn, txOut0, txNOut, inRef, outAddr, outVal, outTx, outSpent, addrOwner, addrFirstTx, addrLabel;
  let nTx, nOut, nIn, nAddr;
  let owners, ENT, E, USERS, MINERS, VENDORS, funded, fundedIdx, sched, deposits, CASES, seedNow;
  let curBlock, seq, blockMs;

  function alloc() {
    txBlock = new Int32Array(CAP.tx); txTime = new Float64Array(CAP.tx);
    txIn0 = new Int32Array(CAP.tx); txNIn = new Int32Array(CAP.tx); txOut0 = new Int32Array(CAP.tx); txNOut = new Int32Array(CAP.tx);
    inRef = new Int32Array(CAP.inp);
    outAddr = new Int32Array(CAP.out); outVal = new Float64Array(CAP.out); outTx = new Int32Array(CAP.out); outSpent = new Int32Array(CAP.out);
    addrOwner = new Int32Array(CAP.addr); addrFirstTx = new Int32Array(CAP.addr); addrLabel = new Int16Array(CAP.addr);
    nTx = nOut = nIn = nAddr = 0;
  }
  const full = () => nTx > CAP.tx - 60 || nOut > CAP.out - 600 || nIn > CAP.inp - 600 || nAddr > CAP.addr - 600;

  function newOwner(o) {
    o.addrs = []; o.pool = []; o.bal = 0;
    if (o.ent === undefined) o.ent = -1;
    owners.push(o); fundedIdx.push(-1);
    return owners.length - 1;
  }
  const special = (role) => newOwner({ role, special: true });
  function newAddr(ow) {
    const a = nAddr++;
    addrOwner[a] = ow; addrFirstTx[a] = -1;
    const o = owners[ow];
    addrLabel[a] = o.ent;
    o.addrs.push(a);
    return a;
  }
  const entAddr = (ow) => pick(owners[ow].addrs);
  function updFunded(ow) {
    const o = owners[ow];
    if (o.ent >= 0 || o.special) return;
    const has = o.bal > 0, i = fundedIdx[ow];
    if (has && i < 0) { fundedIdx[ow] = funded.length; funded.push(ow); }
    else if (!has && i >= 0) {
      const last = funded.pop();
      if (last !== ow) { funded[i] = last; fundedIdx[last] = i; }
      fundedIdx[ow] = -1;
    }
  }
  function mkTx(ins, outs) {
    if (full()) return -1;
    const t = nTx++;
    txBlock[t] = curBlock;
    txTime[t] = blockMs + Math.min(0.985, seq++ / 110) * SPAN;
    txIn0[t] = nIn; txNIn[t] = ins.length;
    for (const o of ins) { inRef[nIn++] = o; outSpent[o] = t; }
    txOut0[t] = nOut; txNOut[t] = outs.length;
    for (const [a, v] of outs) {
      const o = nOut++;
      outAddr[o] = a; outVal[o] = v; outTx[o] = t; outSpent[o] = -1;
      if (addrFirstTx[a] < 0) addrFirstTx[a] = t;
      const ow = addrOwner[a], O = owners[ow];
      O.pool.push(o); O.bal += v;
      updFunded(ow);
    }
    // a deposit = coins arriving at Nordstern from someone else
    if (ins.length && addrOwner[outAddr[txOut0[t]]] === E.nord && addrOwner[outAddr[ins[0]]] !== E.nord) deposits.push(t);
    return t;
  }
  function take(ow, amount) {
    const O = owners[ow];
    if (O.bal < amount || !O.pool.length) return null;
    const ins = [];
    let s = 0;
    while (s < amount && O.pool.length) { const o = O.pool.pop(); ins.push(o); s += outVal[o]; }
    O.bal -= s;
    if (O.bal < 1) O.bal = 0;
    updFunded(ow);
    return s >= amount ? ins : (returnCoins(ow, ins), null);
  }
  function returnCoins(ow, ins) { const O = owners[ow]; for (const o of ins) { O.pool.push(o); O.bal += outVal[o]; } updFunded(ow); }
  function takeAll(ow) { const O = owners[ow]; const ins = O.pool; O.pool = []; O.bal = 0; updFunded(ow); return ins; }
  function spendOut(ow, o) {
    const O = owners[ow], i = O.pool.indexOf(o);
    if (i < 0) return false;
    O.pool.splice(i, 1); O.bal -= outVal[o]; updFunded(ow);
    return true;
  }
  const sumOf = (ins) => { let s = 0; for (const o of ins) s += outVal[o]; return s; };
  function changeAddr(ow, fresh) {
    const O = owners[ow];
    if (O.ent >= 0) return pick(O.addrs);
    return rnd() < fresh || !O.addrs.length ? newAddr(ow) : O.addrs[O.addrs.length - 1];
  }
  const userAddr = (ow, fresh = 0.65) => changeAddr(ow, fresh);
  function pay(fromOw, toAddr, amount, fresh = 0.7) {
    amount = Math.floor(amount);
    if (amount < DUST * 4) return -1;
    const ins = take(fromOw, amount + FEE);
    if (!ins) return -1;
    const ch = sumOf(ins) - amount - FEE;
    const outs = [[toAddr, amount]];
    if (ch > DUST) outs.push([changeAddr(fromOw, fresh), ch]);
    return mkTx(ins, outs);
  }
  function payAll(fromOw, toAddr) {
    const ins = takeAll(fromOw);
    if (!ins.length) return -1;
    const s = sumOf(ins);
    if (s < FEE * 4) { returnCoins(fromOw, ins); return -1; }
    return mkTx(ins, [[toAddr, s - FEE]]);
  }
  function batch(fromOw, list) {
    const total = list.reduce((s, x) => s + Math.floor(x[1]), 0);
    const ins = take(fromOw, total + FEE);
    if (!ins) return -1;
    const outs = list.map(([a, v]) => [a, Math.floor(v)]);
    const ch = sumOf(ins) - total - FEE;
    if (ch > DUST) outs.push([changeAddr(fromOw, 0.7), ch]);
    return mkTx(ins, outs);
  }
  const at = (b, fn) => { if (b < BLOCKS) (sched[b] || (sched[b] = [])).push(fn); };
  const active = (ow, b) => { const e = ENT[owners[ow].ent]; return b >= e.b0 && b <= e.b1; };
  const yearOf = (b) => 2009 + (T0 + b * SPAN - Date.UTC(2009, 0, 1)) / (365.25 * 864e5);

  /* ---------------- economic behaviour ---------------- */
  const randUser = () => USERS[ri(USERS.length)];
  const randFunded = () => (funded.length ? funded[ri(funded.length)] : -1);
  function pickExchange(b) {
    const opts = [[E.nord, 0.40], [E.alpen, 0.47], [E.swift, 0.07], [E.garantex, 0.012], [E.local, 0.03]].filter(([e]) => active(e, b));
    if (!opts.length) return -1;
    let r = rnd() * opts.reduce((s, x) => s + x[1], 0);
    for (const [e, w] of opts) { if ((r -= w) <= 0) return e; }
    return opts[0][0];
  }
  const lognormalBtc = (mu, sigma) => Math.exp(mu + sigma * (rnd() + rnd() + rnd() - 1.5) * 1.6) * SAT;

  function userPay() {
    const u = randFunded(); if (u < 0) return;
    pay(u, userAddr(randUser(), 0.6), owners[u].bal * uni(0.05, 0.8));
  }
  function deposit(b) {
    const ex = pickExchange(b), u = randFunded();
    if (ex < 0 || u < 0) return;
    const bal = owners[u].bal;
    rnd() < 0.4 ? payAll(u, entAddr(ex)) : pay(u, entAddr(ex), bal * uni(0.3, 0.95));
  }
  function withdraw(b) {
    const ex = pickExchange(b); if (ex < 0) return;
    const O = owners[ex]; if (O.bal < 2 * SAT) return;
    const n = rnd() < 0.25 ? 2 + ri(4) : 1;
    const list = [];
    for (let i = 0; i < n; i++) list.push([userAddr(randUser(), 0.8), Math.min(O.bal * 0.08, lognormalBtc(Math.log(0.4), 1.1))]);
    batch(ex, list);
  }
  function payEntity(ow, b) {
    if (!active(ow, b)) return userPay();
    const u = randFunded(); if (u < 0) return;
    pay(u, entAddr(ow), owners[u].bal * uni(0.04, 0.4));
  }
  function entityPayout(ow, b) {
    if (!active(ow, b)) return;
    const O = owners[ow]; if (O.bal < 0.6 * SAT) return;
    pay(ow, userAddr(randUser(), 0.75), O.bal * uni(0.02, 0.14));
  }
  const MARKETS = () => [E.silk, E.alpha, E.hydra];
  const MIXERS = () => [E.fog, E.helix, E.chip];
  function activeOf(list, b) { const a = list.filter((e) => active(e, b)); return a.length ? pick(a) : -1; }
  function darknetBuy(b) {
    const m = activeOf(MARKETS(), b), u = randFunded();
    if (m < 0 || u < 0) return userPay();
    pay(u, entAddr(m), Math.min(owners[u].bal * uni(0.1, 0.6), lognormalBtc(Math.log(0.6), 0.9)));
  }
  function marketPayout(b) {
    const m = activeOf(MARKETS(), b); if (m < 0) return;
    const O = owners[m]; if (O.bal < 1 * SAT) return;
    pay(m, userAddr(pick(VENDORS[m]), 0.6), O.bal * uni(0.06, 0.3));
  }
  function privacyMix(b) {
    const mx = activeOf(MIXERS(), b), u = randFunded();
    if (mx < 0 || u < 0) return;
    const amt = owners[u].bal * uni(0.2, 0.9);
    if (pay(u, entAddr(mx), amt) < 0) return;
    at(b + 1 + ri(4), () => { if (owners[mx].bal > amt) batch(mx, [[userAddr(u, 1), amt * 0.96]]); });
  }

  // laundering behaviours used by darknet vendors, ransomware crews, scammers and the hackers
  function peelChain(L, steps, finalEx, startB, gapMax, onFinal) {
    let i = 0;
    const step = () => {
      const O = owners[L];
      if (O.bal < 0.02 * SAT) return;
      if (i >= steps) {
        if (!active(finalEx, curBlock)) finalEx = E.alpen;
        const t = payAll(L, entAddr(finalEx));
        if (t >= 0 && onFinal) onFinal(t);
        return;
      }
      const ins = takeAll(L), s = sumOf(ins);
      const peel = Math.floor(s * uni(0.04, 0.13));
      const dest = rnd() < 0.7 ? userAddr(randUser(), 0.9) : entAddr(rnd() < 0.5 ? E.alpen : E.local);
      mkTx(ins, [[dest, peel], [newAddr(L), s - peel - FEE]]);
      i++;
      at(curBlock + ri(gapMax + 1), step);
    };
    at(startB, step);
  }
  function cashOutExchange(b) {
    const r = rnd();
    if (r < 0.25 && active(E.garantex, b)) return E.garantex;
    if (r < 0.55 && active(E.swift, b)) return E.swift;
    return rnd() < 0.5 ? E.nord : E.alpen;
  }
  function launder(src, b, style) {
    // move everything the source holds into a fresh launderer wallet, then pick a technique
    const L = special('launderer');
    if (payAll(src, newAddr(L)) < 0) return;
    const s = style || pick(['peel', 'peel', 'mixer', 'split', 'cashout', 'hold']);
    if (s === 'peel') peelChain(L, 3 + ri(6), cashOutExchange(b), b + 1 + ri(3), 1);
    else if (s === 'cashout') at(b + 1 + ri(6), () => payAll(L, entAddr(cashOutExchange(curBlock))));
    else if (s === 'hold') at(b + 150 + ri(700), () => peelChain(L, 2 + ri(5), cashOutExchange(curBlock), curBlock, 1));
    else if (s === 'mixer') {
      const mx = activeOf(MIXERS(), b);
      if (mx < 0) return peelChain(L, 4, cashOutExchange(b), b + 1, 1);
      at(b + 1 + ri(3), () => {
        const v = owners[L].bal;
        if (payAll(L, entAddr(mx)) < 0) return;
        at(curBlock + 2 + ri(6), () => {
          const back = special('launderer (after mixer)');
          const amt = Math.min(v * 0.96, owners[mx].bal * 0.5);
          if (amt < 0.05 * SAT) return;
          const parts = 2 + ri(3), list = [];
          for (let i = 0; i < parts; i++) list.push([newAddr(back), amt / parts]);
          if (batch(mx, list) < 0) return;
          at(curBlock + 3 + ri(40), () => payAll(back, entAddr(cashOutExchange(curBlock))));
        });
      });
    } else if (s === 'split') {
      at(b + 1 + ri(3), () => {
        const ins = takeAll(L), v = sumOf(ins), parts = 3 + ri(6), outs = [], kids = [];
        if (v < 0.1 * SAT) return;
        for (let i = 0; i < parts; i++) { const k = special('mule'); kids.push(k); outs.push([newAddr(k), Math.floor((v - FEE) / parts)]); }
        mkTx(ins, outs);
        for (const k of kids) at(curBlock + 1 + ri(60), () => payAll(k, entAddr(cashOutExchange(curBlock))));
      });
    }
  }

  /* ---------------- the training cases (always generated the same way) ---------------- */
  function addCase(c, t) { if (t >= 0) CASES.push({ ...c, tx: t }); }
  function stories() {
    // 1 · Silk Road coins resurface after ten years
    const v = special('Silk Road vendor');
    for (let y = 2012.15; y < 2013.72; y += 0.11) at(yb(y), () => { const m = E.silk; const a = Math.min(owners[m].bal * 0.5, uni(2, 6) * SAT); if (a > 0.3 * SAT) pay(m, newAddr(v), a); });
    at(yb(2023.36), () => {
      const ins = takeAll(v), s = sumOf(ins);
      if (s < 1.5 * SAT) return;
      const L = special('Silk Road vendor, new wallet');
      const move = Math.min(s * 0.6, 3.2 * SAT);
      mkTx(ins, [[newAddr(L), move], [newAddr(v), s - move - FEE]]);
      peelChain(L, 5, E.nord, curBlock, 0, (t) => addCase({
        n: 1, title: 'Old Silk Road coins resurface',
        teaser: 'A new customer deposits coins that sat untouched for ten years.',
        truth: 'The depositor sold drugs on Silk Road in 2012 and 2013 and was paid in bitcoin by the market. The coins sat in the same wallet for almost ten years. In 2023 the vendor moved part of them to a new wallet and sent them through a peel chain: in every hop a small amount goes somewhere else and the rest moves on to a fresh address, to make the trail look like ordinary spending.',
      }, t));
    });
    // 2 · Darknet vendor washes coins through a mixer
    const h = special('Hydra vendor');
    for (let y = 2020.9; y < 2021.95; y += 0.1) at(yb(y), () => { const m = E.hydra; const a = Math.min(owners[m].bal * 0.4, uni(1, 3.5) * SAT); if (a > 0.3 * SAT) pay(m, newAddr(h), a); });
    at(yb(2022.06), () => {
      const v0 = owners[h].bal;
      if (payAll(h, entAddr(E.chip)) < 0) return;
      at(curBlock + 4, () => {
        const h2 = special('Hydra vendor after mixer');
        const amt = Math.min(v0 * 0.96, owners[E.chip].bal * 0.6), list = [];
        for (let i = 0; i < 3; i++) list.push([newAddr(h2), amt / 3]);
        if (batch(E.chip, list) < 0) return;
        at(yb(2023.08), () => {
          payAll(h2, newAddr(h2));
          at(curBlock + 1, () => addCase({
            n: 2, title: 'Darknet vendor washes coins through a mixer',
            teaser: 'Clean-looking coins that came out of a mixer two hops ago.',
            truth: 'The depositor sold on Hydra Market in 2021. Before Hydra was shut down they sent everything to ChipMixer. The mixer paid out other people’s coins to three new addresses, which breaks the trail back to Hydra. That is exactly why the mixer itself is the red flag: Chain-Check cannot see past it, so honest analysis stops there and reports the mixer exposure.',
          }, pay(h2, entAddr(E.nord), Math.min(1.8 * SAT, owners[h2].bal * 0.8))));
        });
      });
    });
    // 3 · Ransomware cash-out
    at(yb(2023.55), () => {
      const r = E.ryuk;
      if (owners[r].bal < 1 * SAT) return;
      const L = special('Ryuk launderer');
      if (pay(r, newAddr(L), Math.min(4 * SAT, owners[r].bal * 0.5)) < 0) return;
      peelChain(L, 6, E.nord, curBlock + 1, 0, (t) => addCase({
        n: 3, title: 'Ransomware cash-out via a peel chain',
        teaser: 'Six quick hops in two days, then a deposit.',
        truth: 'The coins are ransom payments that companies made to the Ryuk gang in 2020 and 2021. In 2023 a money launderer took 4 BTC and ran them through six fast hops, peeling off a little each time, then deposited the rest at Nordstern.',
      }, t));
    });
    // 4 · Sanctioned exchange
    at(yb(2024.18), () => {
      const g = special('Garantex customer');
      if (pay(E.garantex, newAddr(g), 1.2 * SAT) < 0) return;
      at(curBlock + 1, () => addCase({
        n: 4, title: 'Withdrawal from a sanctioned exchange',
        teaser: 'Coins come straight from Garantex.',
        truth: 'The customer withdrew 1.2 BTC from Garantex, an exchange on the US sanctions list since April 2022, and deposited it at Nordstern the next day. There is no intermediate step, so this is direct exposure. Accepting it could break sanctions law, whatever the amount.',
      }, payAll(g, entAddr(E.nord))));
    });
    // 5 · Hack proceeds
    at(yb(2024.33), () => {
      if (owners[E.hack].bal < 5 * SAT) return;
      const L = special('hacker');
      if (pay(E.hack, newAddr(L), Math.min(18 * SAT, owners[E.hack].bal * 0.5)) < 0) return;
      at(curBlock + 2, () => {
        const ins = takeAll(L), s = sumOf(ins), kids = [special('hacker wallet 1'), special('hacker wallet 2'), special('hacker wallet 3'), special('hacker wallet 4')];
        mkTx(ins, kids.map((k) => [newAddr(k), Math.floor((s - FEE) / 4)]));
        at(curBlock + 1, () => payAll(kids[0], entAddr(E.garantex)));
        at(curBlock + 3, () => payAll(kids[1], entAddr(E.swift)));
        peelChain(kids[2], 3, E.nord, curBlock + 2, 1, (t) => addCase({
          n: 5, title: 'Proceeds of an exchange hack',
          teaser: 'A slice of 18 BTC taken from a hacked hot wallet.',
          truth: 'In 2022 attackers emptied part of the hot wallet of Alpenblick Exchange. Two years later one of them moved 18 BTC, split it into four equal parts, sent one part to Garantex, one to SwiftSwap and pushed this one through three hops into Nordstern.',
        }, t));
      });
    });
    // 6 · Structuring
    at(yb(2024.6), () => {
      const S = special('structuring customer');
      if (pay(E.swift, newAddr(S), 6 * SAT) < 0) return;
      at(curBlock + 1, () => {
        const ins = takeAll(S), s = sumOf(ins), outs = [];
        let used = 0;
        for (let i = 0; i < 6; i++) { const v = Math.floor(uni(0.965, 0.992) * SAT); used += v; outs.push([newAddr(S), v]); }
        outs.push([newAddr(S), s - used - FEE]);
        const t = mkTx(ins, outs);
        if (t < 0) return;
        for (let i = 0; i < 6; i++) {
          const o = txOut0[t] + i;
          at(curBlock + 1 + (i >> 1), () => {
            if (!spendOut(S, o)) return;
            const d = mkTx([o], [[entAddr(E.nord), outVal[o] - FEE]]);
            if (i === 5) addCase({
              n: 6, title: 'Six deposits just under the threshold',
              teaser: 'Same person, six addresses, each a little under 1 BTC.',
              truth: 'The customer withdrew 6 BTC from SwiftSwap, an exchange without identity checks, split it into six amounts just below 1 BTC, the level at which Nordstern reviews deposits by hand, and deposited them from six different addresses within two days. Splitting money to stay under a threshold is called structuring and is suspicious by itself.',
            }, d);
          });
        }
      });
    });
    // 7 · Scam proceeds after a quiet period
    const O = special('BitYield operator');
    at(yb(2020.62), () => pay(E.scam, newAddr(O), Math.min(10 * SAT, owners[E.scam].bal * 0.6)));
    at(yb(2023.9), () => {
      if (payAll(O, newAddr(O)) < 0) return;
      at(curBlock + 1, () => addCase({
        n: 7, title: 'Scam proceeds after three quiet years',
        teaser: 'Coins from a collapsed investment scheme reappear.',
        truth: 'The depositor ran BitYield Pro, a fake investment platform that collapsed in 2020. They took their share of the victims’ money, waited three years and then moved it to Nordstern in two hops.',
      }, pay(O, entAddr(E.nord), Math.min(3 * SAT, owners[O].bal * 0.5))));
    });
    // 8 · Clean mining income
    const m = special('home miner');
    for (let y = 2024.5; y < 2024.76; y += 0.04) at(yb(y), () => pay(E.glacier, newAddr(m), uni(0.4, 0.8) * SAT));
    at(yb(2024.8), () => addCase({
      n: 8, title: 'Mining income',
      teaser: 'A customer deposits several payouts from a mining pool.',
      truth: 'The customer runs mining machines at home and is paid regularly by Glacier Pool. The coins were created as block rewards and went straight to the miner. This is what clean funds look like.',
    }, payAll(m, entAddr(E.nord))));
    // 9 · Casino and P2P
    const p = special('casino player');
    at(yb(2024.0), () => pay(E.dice, newAddr(p), 0.6 * SAT));
    at(yb(2024.02), () => pay(E.local, newAddr(p), 0.9 * SAT));
    at(yb(2024.05), () => addCase({
      n: 9, title: 'Casino winnings and P2P trades',
      teaser: 'Grey, not black: gambling and an unregulated marketplace.',
      truth: 'The customer won 0.6 BTC at an online casino and bought 0.9 BTC from a stranger on a P2P marketplace. Neither is illegal in itself, but both services check little about their users. A compliance officer would ask where the money came from, not block it.',
    }, payAll(p, entAddr(E.nord))));
  }

  /* ---------------- block-by-block generation ---------------- */
  function setup(seed) {
    R = mulberry32(seed);
    seedNow = seed;
    alloc();
    owners = []; fundedIdx = []; funded = []; sched = []; deposits = []; CASES = [];
    ENT = ENTITY_DEFS.map((d, i) => ({ ...d, idx: i, b0: yb(d.from), b1: yb(d.to) }));
    E = {};
    for (const e of ENT) {
      e.owner = newOwner({ ent: e.idx, name: e.name });
      E[e.key] = e.owner;
      for (let i = 0; i < e.n; i++) newAddr(e.owner);
    }
    USERS = [];
    for (let i = 0; i < 30000; i++) USERS.push(newOwner({}));
    MINERS = USERS.slice(0, 900);
    VENDORS = {};
    for (const m of MARKETS()) { VENDORS[m] = []; for (let i = 0; i < 50; i++) VENDORS[m].push(special('vendor')); }
    stories();
  }
  function genBlock(b) {
    curBlock = b; seq = 0; blockMs = T0 + b * SPAN;
    if (full()) return;
    const y = yearOf(b);
    // new coins: the coinbase transaction pays the block reward to a pool
    if (b < yb(2011.0)) mkTx([], [[userAddr(pick(MINERS), 0.9), reward(b)]]);
    else mkTx([], [[entAddr(b < yb(2013.25) || rnd() < 0.55 ? E.summit : E.glacier), reward(b)]]);
    for (const pl of [E.summit, E.glacier]) {
      const O = owners[pl];
      if (O.bal > 1.5 * reward(b)) {
        const tot = O.bal * 0.9, n = 3 + ri(9), list = [];
        for (let i = 0; i < n; i++) list.push([userAddr(pick(MINERS), 0.5), tot / n]);
        batch(pl, list);
      }
    }
    const tasks = sched[b];
    if (tasks) for (let i = 0; i < tasks.length; i++) tasks[i]();
    // ordinary economic activity, growing over the years
    const K = 30 + Math.round(56 * b / BLOCKS) + ri(10);
    for (let k = 0; k < K; k++) {
      const r = rnd();
      if (r < 0.31) userPay();
      else if (r < 0.50) deposit(b);
      else if (r < 0.68) withdraw(b);
      else if (r < 0.75) payEntity(E.rhein, b);
      else if (r < 0.76) { if (active(E.rhein, b) && owners[E.rhein].bal > 3 * SAT) pay(E.rhein, entAddr(E.alpen), owners[E.rhein].bal * 0.8); }
      else if (r < 0.79) payEntity(E.dice, b);
      else if (r < 0.805) entityPayout(E.dice, b);
      else if (r < 0.825) payEntity(E.local, b);
      else if (r < 0.845) entityPayout(E.local, b);
      else if (r < 0.87) darknetBuy(b);
      else if (r < 0.88) marketPayout(b);
      else if (r < 0.885) privacyMix(b);
      else userPay();
    }
    // darknet vendors cash out
    if (activeOf(MARKETS(), b) >= 0 || y < 2023) {
      for (let k = 0; k < 2; k++) {
        const list = VENDORS[pick(MARKETS())];
        for (let tries = 0; tries < 5; tries++) {
          const v = pick(list);
          if (owners[v].bal > 0.3 * SAT) { if (rnd() < 0.35) launder(v, b); break; }
        }
      }
    }
    // ransomware: victims pay, crews launder
    if (active(E.wanna, b)) for (let k = ri(4); k > 0; k--) { const u = randFunded(); if (u >= 0) pay(u, entAddr(E.wanna), Math.min(owners[u].bal * 0.9, uni(0.12, 0.6) * SAT)); }
    if (active(E.ryuk, b) && rnd() < 0.45) { const u = randFunded(); if (u >= 0) pay(u, entAddr(E.ryuk), Math.min(owners[u].bal * 0.95, uni(2, 25) * SAT)); }
    for (const rw of [E.wanna, E.ryuk]) if (b > ENT[owners[rw].ent].b0 && b % 9 === 0 && owners[rw].bal > 1.5 * SAT && b < yb(2023.4) && rnd() < 0.5) {
      const L = special('ransom launderer');
      if (pay(rw, newAddr(L), owners[rw].bal * uni(0.2, 0.5)) >= 0) launder(L, b);
    }
    // a Ponzi scheme
    if (active(E.scam, b)) {
      for (let k = 1 + ri(3); k > 0; k--) { const u = randFunded(); if (u >= 0) pay(u, entAddr(E.scam), Math.min(owners[u].bal * 0.7, uni(0.05, 1.2) * SAT)); }
      if (rnd() < 0.6) entityPayout(E.scam, b);
      if (b % 14 === 0 && owners[E.scam].bal > 3 * SAT) { const L = special('scam launderer'); if (pay(E.scam, newAddr(L), owners[E.scam].bal * 0.3) >= 0) launder(L, b); }
    }
    // a hack drains part of Alpenblick's hot wallet
    if (b === yb(2022.3)) {
      const amt = Math.min(1400 * SAT, owners[E.alpen].bal * 0.25);
      const ins = take(E.alpen, amt);
      if (ins) { const s = sumOf(ins); mkTx(ins, [[entAddr(E.hack), Math.floor(s / 2)], [entAddr(E.hack), Math.floor(s / 2) - FEE]]); E.hackStart = s; }
    }
    if (b > yb(2022.31) && b < yb(2023.6) && b % 3 === 0 && E.hackStart && owners[E.hack].bal > E.hackStart * 0.35) {
      const L = special('hacker');
      if (pay(E.hack, newAddr(L), uni(5, 30) * SAT) >= 0) launder(L, b);
    }
  }

  /* ---------------- analysis: clustering, tracing, scoring ---------------- */
  let clusterOf, clusterSize, entStats, screened, screenTime;
  function cluster() {
    const parent = new Int32Array(nAddr);
    for (let i = 0; i < nAddr; i++) parent[i] = i;
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    for (let t = 0; t < nTx; t++) {
      const n = txNIn[t];
      if (n < 2) continue;
      const i0 = txIn0[t], a0 = find(outAddr[inRef[i0]]);
      for (let k = 1; k < n; k++) { const r = find(outAddr[inRef[i0 + k]]); if (r !== a0) parent[r] = a0; }
    }
    clusterOf = new Int32Array(nAddr);
    clusterSize = new Int32Array(nAddr);
    for (let i = 0; i < nAddr; i++) { const r = find(i); clusterOf[i] = r; clusterSize[r]++; }
  }
  function entityStats() {
    entStats = ENT.map(() => ({ recv: 0, n: 0, first: Infinity, last: 0 }));
    for (let o = 0; o < nOut; o++) {
      const lab = addrLabel[outAddr[o]];
      if (lab < 0) continue;
      const s = entStats[lab], t = txTime[outTx[o]];
      s.recv += outVal[o]; s.n++;
      if (t < s.first) s.first = t;
      if (t > s.last) s.last = t;
    }
  }

  // Haircut tracing: walk backwards from a deposit and split its value over the inputs of every transaction
  // in proportion to their size. Stop at the first service Chain-Check knows (exchange, market, mixer …).
  function trace(out0, minW, maxHop) {
    const nO = [out0], nW = [1], nH = [0], nP = [-1];
    const src = new Map();
    let small = 0;
    const stack = [0];
    const add = (key, i, w, h) => {
      let e = src.get(key);
      if (!e) { e = { key, w: 0, minHop: Infinity, hopW: 0, best: -1, bestW: 0 }; src.set(key, e); }
      e.w += w; e.hopW += w * h;
      if (h < e.minHop) e.minHop = h;
      if (w > e.bestW) { e.bestW = w; e.best = i; }
    };
    while (stack.length) {
      const i = stack.pop(), o = nO[i], w = nW[i], h = nH[i];
      const lab = addrLabel[outAddr[o]];
      if (h > 0 && lab >= 0) { add(lab, i, w, h); continue; }
      const t = outTx[o], n = txNIn[t];
      if (n === 0) { add('minted', i, w, h); continue; }
      if (h >= maxHop) { add('deep', i, w, h); continue; }
      const i0 = txIn0[t];
      let s = 0;
      for (let k = 0; k < n; k++) s += outVal[inRef[i0 + k]];
      for (let k = 0; k < n; k++) {
        const oi = inRef[i0 + k], w2 = w * outVal[oi] / s;
        if (w2 < minW) { small += w2; continue; }
        const j = nO.length;
        nO.push(oi); nW.push(w2); nH.push(h + 1); nP.push(i);
        stack.push(j);
      }
    }
    return { src, small, nO, nW, nH, nP };
  }
  const catOfKey = (k) => (typeof k === 'number' ? ENT[k].cat : k === 'minted' ? 'mined' : 'unknown');
  function pathOf(tr, i) {
    const nodes = [];
    while (i >= 0) { nodes.push(i); i = tr.nP[i]; }
    return nodes; // from source output to the deposit output
  }
  function stepsOf(tr, nodes) {
    const steps = [];
    for (let k = 1; k < nodes.length; k++) {
      const child = tr.nO[nodes[k - 1]], o = tr.nO[nodes[k]], t = outTx[o];
      steps.push({ t, from: outAddr[child], to: outAddr[o], val: outVal[o], ms: txTime[t], nIn: txNIn[t], nOut: txNOut[t], outTotal: txOutTotal(t) });
    }
    return steps;
  }
  function txOutTotal(t) { let s = 0; for (let k = 0; k < txNOut[t]; k++) s += outVal[txOut0[t] + k]; return s; }
  function originOf(o) {
    let hops = 0;
    for (;;) {
      const t = outTx[o];
      if (txNIn[t] === 0) return { t, hops, to: outAddr[o] };
      const i0 = txIn0[t];
      let best = inRef[i0];
      for (let k = 1; k < txNIn[t]; k++) if (outVal[inRef[i0 + k]] > outVal[best]) best = inRef[i0 + k];
      o = best;
      if (++hops > 20000) return null;
    }
  }
  function patterns(steps, srcCat) {
    const f = [];
    let run = 0, maxRun = 0;
    for (let k = 0; k < steps.length - 1; k++) {
      const s = steps[k];
      if (s.nIn === 1 && s.nOut === 2 && s.val >= 0.6 * s.outTotal) { run++; maxRun = Math.max(maxRun, run); } else run = 0;
    }
    if (maxRun >= 4) f.push({ key: 'peel', pts: 8, title: `Peel chain of ${maxRun} hops`, text: `In ${maxRun} consecutive transactions a small amount was split off and the rest moved on to a brand-new address. This is a classic way to make laundering look like normal spending.` });
    if (steps.length >= 4) {
      const span = steps[steps.length - 1].ms - steps[0].ms;
      if (span <= 3 * 864e5) f.push({ key: 'rapid', pts: 6, title: 'Rapid layering', text: `The coins passed through ${steps.length} transactions in ${duration(span)}. Honest users rarely move money that fast through so many wallets.` });
    }
    let gap = 0, gapAt = 0;
    for (let k = 1; k < steps.length; k++) { const g = steps[k].ms - steps[k - 1].ms; if (g > gap) { gap = g; gapAt = k; } }
    if (gap > 2 * 365.25 * 864e5 && CAT[srcCat].sev >= 50) f.push({ key: 'dormant', pts: 5, title: `Dormant for ${duration(gap)}`, text: `The coins did not move from ${dateOf(steps[gapAt - 1].ms)} to ${dateOf(steps[gapAt].ms)}. Old coins from a risky source that suddenly move again often mean someone is cashing out after the attention has faded.` });
    return f;
  }
  function bandOf(score) {
    if (score >= 80) return { key: 'severe', label: 'Severe', action: 'Freeze the funds, escalate to the money laundering officer and file a suspicious activity report with the financial intelligence unit (FIU). Do not tell the customer why.' };
    if (score >= 60) return { key: 'high', label: 'High', action: 'Hold the deposit. Run enhanced due diligence: ask for proof of where the money comes from, check the customer’s history and decide whether to report.' };
    if (score >= 30) return { key: 'medium', label: 'Medium', action: 'Accept, but ask the customer about the source of funds and keep the account under closer monitoring.' };
    return { key: 'low', label: 'Low', action: 'Accept. Nothing in the history of these coins needs further action.' };
  }
  function assess(t, deep) {
    const out0 = txOut0[t], val = outVal[out0];
    const tr = trace(out0, deep ? 0.0012 : 0.004, deep ? 90 : 45);
    const sources = [...tr.src.values()].map((e) => {
      const cat = catOfKey(e.key);
      return { ...e, cat, sev: CAT[cat].sev, hop: Math.max(1, e.minHop - 1), avgHop: e.hopW / e.w };
    }).sort((a, b) => b.w - a.w);
    let best = 0, top = null;
    for (const s of sources) {
      if (!s.sev) continue;
      const f = Math.min(1, Math.sqrt(s.w / 0.1));
      const d = s.hop <= 1 ? 1 : Math.max(0.3, Math.pow(0.92, s.hop - 1));
      s.score = s.sev * f * d;
      if (s.score > best) { best = s.score; top = s; }
    }
    const main = top || sources[0];
    const steps = main && main.best >= 0 ? stepsOf(tr, pathOf(tr, main.best)) : [];
    const flags = top ? patterns(steps, top.cat) : [];
    const inAddr = outAddr[inRef[txIn0[t]]];
    const age = txTime[t] - txTime[addrFirstTx[inAddr]];
    if (age < 7 * 864e5 && best >= 20) flags.push({ key: 'fresh', pts: 3, title: 'Brand-new address', text: `The address that sent this deposit was first used ${duration(Math.max(age, 36e5))} earlier. Fresh addresses are cheap and often used to hide who is behind a payment.` });
    const st = structuring(t);
    if (st) flags.push(st);
    let score = best + flags.reduce((s, x) => s + x.pts, 0);
    const sanc = sources.find((s) => s.cat === 'sanctions' && s.hop <= 1 && s.w >= 0.01);
    if (sanc) score = Math.max(score, 95);
    score = Math.min(100, Math.round(score));
    return { t, val, tr, sources, top, main, steps, flags, score, band: bandOf(score), sanc, inAddr };
  }
  let depIndex;
  function indexDeposits() {
    depIndex = new Map();
    const push = (k, t) => { let a = depIndex.get(k); if (!a) depIndex.set(k, (a = [])); a.push(t); };
    for (const t of deposits) {
      push('c' + clusterOf[outAddr[inRef[txIn0[t]]]], t);
      push('p' + outTx[inRef[txIn0[t]]], t);
    }
  }
  const THRESHOLD = 1 * SAT;
  function structuring(t) {
    const near = (v) => v >= 0.85 * THRESHOLD && v < THRESHOLD;
    if (!near(outVal[txOut0[t]])) return null;
    const keys = ['c' + clusterOf[outAddr[inRef[txIn0[t]]]], 'p' + outTx[inRef[txIn0[t]]]];
    const group = new Set();
    for (const k of keys) for (const d of depIndex.get(k) || []) if (Math.abs(txTime[d] - txTime[t]) <= 3 * 864e5 && near(outVal[txOut0[d]])) group.add(d);
    if (group.size < 3) return null;
    let total = 0;
    for (const d of group) total += outVal[txOut0[d]];
    return { key: 'struct', pts: 15, group: [...group], title: `Structuring: ${group.size} deposits just under 1 BTC`, text: `Within three days the same customer sent ${group.size} deposits of ${btc(Math.min(...[...group].map((d) => outVal[txOut0[d]])))}–${btc(Math.max(...[...group].map((d) => outVal[txOut0[d]])))} BTC (together ${btc(total)} BTC). Each one stays just below the 1 BTC limit at which Nordstern checks deposits by hand. Chain-Check links them because the sending addresses were funded by the same transaction.` };
  }

  /* ---------------- address and txid strings (deterministic) ---------------- */
  const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', B32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const addrCache = new Map(), txCache = new Map();
  function addrStr(a) {
    let s = addrCache.get(a);
    if (s) return s;
    const r = mulberry32((Math.imul(a + 1, 2654435761) ^ seedNow) >>> 0);
    const ft = addrFirstTx[a];
    if (ft >= 0 && txTime[ft] > Date.UTC(2018, 0, 1)) { s = 'bc1q'; for (let i = 0; i < 38; i++) s += B32[Math.floor(r() * 32)]; }
    else { s = '1'; for (let i = 0; i < 33; i++) s += B58[Math.floor(r() * 58)]; }
    addrCache.set(a, s);
    return s;
  }
  function txStr(t) {
    let s = txCache.get(t);
    if (s) return s;
    const r = mulberry32((Math.imul(t + 7, 2246822519) ^ (seedNow * 31)) >>> 0);
    s = '';
    for (let i = 0; i < 64; i++) s += '0123456789abcdef'[Math.floor(r() * 16)];
    txCache.set(t, s);
    return s;
  }
  const shortA = (a) => { const s = addrStr(a); return s.slice(0, 8) + '…' + s.slice(-4); };
  const ownerLabel = (a) => (addrLabel[a] >= 0 ? ENT[addrLabel[a]].name : 'Unknown wallet');

  /* ---------------- generation driver ---------------- */
  let ready = false, building = false, assessCache = new Map(), current = null, filter = 'alerts', query = '';
  const yieldNow = () => new Promise((r) => setTimeout(r, 0));
  function progress(frac, text) {
    const el = $('ccProg');
    el.hidden = frac >= 1;
    el.querySelector('i').style.width = Math.round(frac * 100) + '%';
    el.querySelector('span').textContent = text;
  }
  async function build(seed) {
    building = true; ready = false;
    assessCache = new Map(); addrCache.clear(); txCache.clear(); current = null;
    $('ccMain').hidden = true;
    const t0 = performance.now();
    setup(seed);
    const chunk = 70;
    for (let b = 0; b < BLOCKS; b += chunk) {
      for (let k = b; k < Math.min(BLOCKS, b + chunk); k++) genBlock(k);
      progress(0.05 + 0.6 * (b / BLOCKS), `Mining block ${nf(b)} of ${nf(BLOCKS)} · ${nf(nTx)} transactions`);
      await yieldNow();
    }
    progress(0.68, 'Clustering addresses (common-input heuristic) …');
    await yieldNow();
    cluster(); entityStats(); indexDeposits();
    const genMs = performance.now() - t0;
    const t1 = performance.now();
    const from = yb(2023.0), caseTx = new Set(CASES.map((c) => c.tx));
    const list = deposits.filter((t) => txBlock[t] >= from || caseTx.has(t));
    screened = [];
    for (let i = 0; i < list.length; i++) {
      const a = assess(list[i], false);
      screened.push({ t: a.t, val: a.val, score: a.score, band: a.band.key, reason: reasonOf(a), case: CASES.find((c) => c.tx === a.t) });
      if (i % 120 === 0) { progress(0.7 + 0.3 * (i / list.length), `Screening deposits ${nf(i)} of ${nf(list.length)} …`); await yieldNow(); }
    }
    screened.sort((a, b) => b.score - a.score || txTime[b.t] - txTime[a.t]);
    screenTime = performance.now() - t1;
    // a faint trace: low score, but a little darknet exposure somewhere in the history
    const faint = screened.find((s) => !s.case && s.score < 30 && s.score >= 8 && s.reason.cat === 'darknet');
    if (faint) {
      faint.case = { n: 10, title: 'A faint trace to a darknet market', teaser: 'Mostly ordinary coins with a tiny, distant link.', truth: 'This customer did nothing wrong. Coins change hands so often that almost every old bitcoin has touched something bad somewhere in its past. Chain-Check finds the link but weighs it by share and distance, so the score stays low. A trace is a lead, not proof.', auto: true };
      CASES.push({ ...faint.case, tx: faint.t });
    }
    CASES.sort((a, b) => a.n - b.n);
    progress(1, '');
    ready = true; building = false;
    render(genMs);
  }
  function reasonOf(a) {
    if (a.sanc) return { cat: 'sanctions', text: `Direct exposure to ${ENT[a.sanc.key].name} (sanctioned)` };
    if (a.top) {
      const extra = a.flags.length ? ' · ' + a.flags.map((f) => f.title.split(':')[0].replace(/ of \d+ hops/, '')).join(' · ') : '';
      return { cat: a.top.cat, text: `${pct(a.top.w)} from ${ENT[a.top.key].name}, ${a.top.hop === 1 ? 'direct' : a.top.hop + ' hops'}${extra}` };
    }
    const s = a.sources[0];
    return { cat: s ? s.cat : 'unknown', text: s && typeof s.key === 'number' ? `Mostly from ${ENT[s.key].name}` : 'No known risky source' };
  }

  /* ---------------- rendering ---------------- */
  const pill = (cat, text) => `<span class="cc-cat" style="--c:${CAT[cat].color}">${esc(text || CAT[cat].label)}</span>`;
  const bandPill = (b) => `<span class="cc-band b-${b.key || b}">${esc(b.label || b)}</span>`;
  function render(genMs) {
    $('ccMain').hidden = false;
    const alerts = screened.filter((s) => s.score >= 30).length;
    $('ccStats').innerHTML = [
      [nf(nTx), 'transactions'], [nf(HEIGHT_END + 1), 'blocks, 2009–2024'], [nf(nAddr), 'addresses'], [nf(ENT.length), 'known services'],
      [nf(screened.length), 'deposits screened'], [nf(alerts), 'alerts (score ≥ 30)'],
    ].map(([n, l]) => `<div><strong class="num">${n}</strong><span>${l}</span></div>`).join('');
    $('ccBuilt').textContent = `Block heights, dates and block rewards follow the real Bitcoin chain, from the genesis block on 3 January 2009 to block ${nf(HEIGHT_END)} at the end of 2024, including all four halvings. The real chain holds more than a billion transactions; Chain-Check models a representative ${nf(nTx)} of them, placed in the blocks where they would have been mined. Built in ${nf(genMs / 1000, 1)} s, ${nf(screened.length)} deposits screened in ${nf(screenTime / 1000, 1)} s, all in this browser.`;
    renderCases();
    renderQueue();
    renderEntities();
    openDeposit(CASES.length ? CASES[0].tx : screened[0].t);
  }
  function renderCases() {
    $('ccCases').innerHTML = CASES.map((c) => {
      const s = screened.find((x) => x.t === c.tx);
      return `<button type="button" class="cc-item${current === c.tx ? ' on' : ''}" data-tx="${c.tx}">
        <span class="cc-score b-${s.band}">${s.score}</span>
        <span class="cc-it"><b>${c.n}. ${esc(c.title)}</b><span>${esc(c.teaser)}</span></span></button>`;
    }).join('');
  }
  function renderQueue() {
    const q = query.trim().toLowerCase();
    let list = screened.filter((s) => (filter === 'all' ? true : filter === 'alerts' ? s.score >= 30 : s.band === filter));
    if (q) list = list.filter((s) => txStr(s.t).startsWith(q) || addrStr(outAddr[inRef[txIn0[s.t]]]).toLowerCase().startsWith(q) || s.reason.text.toLowerCase().includes(q));
    const counts = { severe: 0, high: 0, medium: 0, low: 0 };
    for (const s of screened) counts[s.band]++;
    document.querySelectorAll('[data-ccf]').forEach((b) => {
      const k = b.dataset.ccf;
      b.setAttribute('aria-pressed', String(k === filter));
      const n = k === 'all' ? screened.length : k === 'alerts' ? counts.severe + counts.high + counts.medium : counts[k];
      b.querySelector('small').textContent = nf(n);
    });
    const shown = list.slice(0, 250);
    $('ccQueue').innerHTML = shown.map((s) => `<button type="button" class="cc-item${current === s.t ? ' on' : ''}" data-tx="${s.t}">
        <span class="cc-score b-${s.band}">${s.score}</span>
        <span class="cc-it"><b class="num">${btc(s.val)} BTC <i>${dateOf(txTime[s.t])}</i></b><span>${esc(s.reason.text)}</span></span></button>`).join('')
      + (list.length > shown.length ? `<p class="empty">Showing the first 250 of ${nf(list.length)}. Search to narrow down.</p>` : '')
      + (!list.length ? '<p class="empty">No deposits match.</p>' : '');
  }
  function renderEntities() {
    $('ccEntities').innerHTML = ENT.map((e, i) => {
      const s = entStats[i];
      return `<tr><td><strong>${esc(e.name)}</strong>${e.real ? ' <span class="cc-real" title="Historical service, publicly reported. Addresses and flows here are invented.">historical</span>' : ''}</td>
        <td>${pill(e.cat)}</td><td class="num">${nf(e.n)}</td><td class="num">${nf(s.recv / SAT)}</td><td class="num">${s.n ? dateOf(s.first).slice(0, 4) + '–' + dateOf(s.last).slice(0, 4) : '–'}</td><td class="cc-note">${esc(e.note)}</td></tr>`;
    }).join('');
  }
  function lanesSvg(a) {
    const lanes = a.sources.filter((s) => s.sev > 0 || s.w >= 0.03).slice(0, 6);
    if (!lanes.length) return '';
    const H = 46, W = 720, top = 16, h = top + lanes.length * H + 10;
    const xL = 214, xR = 610, cx = 680, cy = top + (lanes.length * H) / 2 - 6;
    let s = `<svg viewBox="0 0 ${W} ${h}" class="cc-lanes" role="img" aria-label="Where the money came from">`;
    lanes.forEach((l, i) => {
      const y = top + i * H + 14, cat = CAT[l.cat], col = cat.color, sw = 2 + 12 * Math.min(1, l.w);
      const name = typeof l.key === 'number' ? ENT[l.key].name : l.key === 'deep' ? 'Older history' : 'Newly mined';
      s += `<text x="0" y="${y - 2}" class="cc-ln">${esc(name)}</text><text x="0" y="${y + 13}" class="cc-ls">${esc(cat.label)}</text>`;
      s += `<path d="M${xL} ${y} L${xR} ${y} C ${xR + 40} ${y}, ${cx - 40} ${cy}, ${cx - 14} ${cy}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-opacity=".8" stroke-linecap="round"/>`;
      const n = Math.min(l.hop, 12);
      for (let k = 0; k < n; k++) { const x = xL + 12 + (xR - xL - 24) * (n === 1 ? 0.5 : k / (n - 1)); s += `<circle cx="${x}" cy="${y}" r="4.5" fill="var(--surface)" stroke="${col}" stroke-width="2"/>`; }
      s += `<text x="${xR}" y="${y - 10}" text-anchor="end" class="cc-lv">${pct(l.w)} · ${l.hop === 1 ? 'direct' : l.hop + ' hops'}</text>`;
    });
    s += `<circle cx="${cx}" cy="${cy}" r="14" fill="var(--fg)"/><text x="${cx}" y="${cy + 30}" text-anchor="middle" class="cc-ls">deposit</text></svg>`;
    return s;
  }
  function exposureBar(a) {
    const byCat = new Map();
    for (const s of a.sources) byCat.set(s.cat, (byCat.get(s.cat) || 0) + s.w);
    if (a.tr.small > 0.0005) byCat.set('unknown', (byCat.get('unknown') || 0) + a.tr.small);
    const order = [...byCat.entries()].sort((x, y) => CAT[y[0]].sev - CAT[x[0]].sev || y[1] - x[1]);
    return `<div class="cc-bar">${order.map(([c, w]) => `<i style="flex:${w};background:${CAT[c].color}" title="${esc(CAT[c].label)}: ${pct(w)}"></i>`).join('')}</div>
      <div class="cc-legend">${order.map(([c, w]) => `<span><i style="background:${CAT[c].color}"></i>${esc(CAT[c].label)} <b class="num">${pct(w)}</b></span>`).join('')}</div>`;
  }
  function explain(a) {
    const out = [];
    if (a.sanc) out.push(`<li class="sev"><b>Direct link to a sanctioned entity.</b> ${pct(a.sanc.w)} of the deposit comes straight from ${esc(ENT[a.sanc.key].name)}. ${esc(ENT[a.sanc.key].note)} Sanctions apply regardless of the amount, so this deposit must not be credited.</li>`);
    for (const s of a.sources.filter((x) => x.sev > 0 && x !== a.sanc).slice(0, 4)) {
      const e = ENT[s.key];
      out.push(`<li><b>${pct(s.w)} (${btc(s.w * a.val)} BTC) traces back to ${esc(e.name)}</b>, ${pill(s.cat)} ${s.hop === 1 ? '<b>directly</b>: the coins came straight from it.' : `${s.hop} transactions away.`} ${esc(e.note)}</li>`);
    }
    for (const f of a.flags) out.push(`<li><b>${esc(f.title)}.</b> ${esc(f.text)}</li>`);
    if (!out.length) {
      const clean = a.sources.filter((s) => s.sev === 0 && typeof s.key === 'number').slice(0, 3);
      out.push(`<li><b>No link to a risky service.</b> ${clean.length ? 'The coins come from ' + clean.map((s) => `${esc(ENT[s.key].name)} (${pct(s.w)})`).join(', ') + '.' : ''} Mining pools, regulated exchanges and payment processors are known and supervised.</li>`);
    }
    if (a.top && a.top.w < 0.05 && !a.sanc) out.push(`<li><b>Why the score stays modest.</b> Only a small share of the value leads to the risky source, and it sits ${a.top.hop} hops back. Chain-Check weighs exposure by share and distance, because nearly every old coin has touched something questionable at some point.</li>`);
    return out.join('');
  }
  function timeline(a) {
    if (!a.steps.length || !a.main || typeof a.main.key !== 'number') return '';
    const e = ENT[a.main.key], steps = a.steps;
    let rows = `<li class="cc-src"><span class="cc-dot" style="--c:${CAT[e.cat].color}"></span><div><b>${esc(e.name)}</b> ${pill(e.cat)}<span class="muted">sends the coins out · ${dtOf(steps[0].ms)} · block ${nf(heightAt(steps[0].ms))}</span></div></li>`;
    const maxRows = 14;
    steps.forEach((s, k) => {
      if (steps.length > maxRows && k === 6) rows += `<li class="cc-gap"><span class="cc-dot"></span><div class="muted">… ${steps.length - 11} more hops …</div></li>`;
      if (steps.length > maxRows && k >= 6 && k < steps.length - 5) return;
      const last = k === steps.length - 1;
      const peel = s.nIn === 1 && s.nOut === 2 && !last && s.val >= 0.6 * s.outTotal;
      const gap = k > 0 ? s.ms - steps[k - 1].ms : 0;
      rows += `<li${last ? ' class="cc-dep"' : ''}><span class="cc-dot"></span><div>
        <b class="num">${btc(s.val)} BTC</b> → ${last ? '<b>Nordstern deposit</b>' : `<span class="mono">${shortA(s.to)}</span>`} <span class="muted">· ${dtOf(s.ms)} · block ${nf(heightAt(s.ms))}${gap > 30 * 864e5 ? ` · after ${duration(gap)}` : ''}</span>
        <span class="cc-tags">${peel ? `<span class="cc-tag">peel: ${pct(1 - s.val / s.outTotal)} split off</span>` : ''}${s.nIn > 1 ? `<span class="cc-tag">${s.nIn} inputs merged</span>` : ''}${s.nOut > 2 ? `<span class="cc-tag">split into ${s.nOut}</span>` : ''}<span class="mono muted">tx ${txStr(s.t).slice(0, 10)}…</span></span></div></li>`;
    });
    return `<ol class="cc-time">${rows}</ol>`;
  }
  function originBox(a) {
    if (!a.main || a.main.best < 0) return '';
    const o = a.tr.nO[a.main.best], org = originOf(o);
    if (!org) return '';
    const ms = txTime[org.t], b = heightAt(ms);
    const via = typeof a.main.key === 'number' ? ENT[a.main.key].name : 'this wallet';
    return `<p>Following the largest coin on this path even further back, past ${esc(via)}, Chain-Check reaches the transaction where the bitcoin was created: <b>block #${nf(b)}</b> on ${dateOf(ms)}, as a ${(rewardAt(b) / SAT).toLocaleString('en-US', { maximumFractionDigits: 8 })} BTC mining reward paid to ${org.to >= 0 && addrLabel[org.to] >= 0 ? esc(ENT[addrLabel[org.to]].name) : 'a solo miner'}. That is ${nf(org.hops + a.main.minHop)} transactions before this deposit. Every bitcoin starts as a block reward; its later history is what decides whether it is clean.</p>`;
  }
  function clusterBox(a) {
    const r = clusterOf[a.inAddr], n = clusterSize[r];
    const sameCluster = (depIndex.get('c' + r) || []).length;
    return `<p>The deposit was sent from <span class="mono">${shortA(a.inAddr)}</span>, first used on ${dateOf(txTime[addrFirstTx[a.inAddr]])}. ${n > 1 ? `Chain-Check groups it with <b>${nf(n - 1)} other address${n > 2 ? 'es' : ''}</b> into one wallet, because they were spent together in the same transaction (common-input heuristic): only someone holding all the keys can do that.` : 'No other address has been spent together with it, so Chain-Check treats it as a wallet of its own.'} This wallet has made ${nf(sameCluster)} deposit${sameCluster === 1 ? '' : 's'} at Nordstern.</p>`;
  }
  function openDeposit(t) {
    current = t;
    let a = assessCache.get(t);
    if (!a) { a = assess(t, true); assessCache.set(t, a); }
    const c = CASES.find((x) => x.tx === t);
    const srcRows = a.sources.slice(0, 10).map((s) => {
      const name = typeof s.key === 'number' ? ENT[s.key].name : s.key === 'deep' ? 'History older than 90 hops' : 'Newly mined coins';
      return `<tr><td>${esc(name)}</td><td>${pill(s.cat)}</td><td class="num">${pct(s.w)}</td><td class="num">${btc(s.w * a.val)}</td><td class="num">${s.hop === 1 ? 'direct' : s.hop}</td></tr>`;
    }).join('') + (a.tr.small > 0.0005 ? `<tr><td class="muted">Many tiny fractions (below 0.12% each)</td><td>${pill('unknown')}</td><td class="num">${pct(a.tr.small)}</td><td class="num">${btc(a.tr.small * a.val)}</td><td class="num">–</td></tr>` : '');
    $('ccCase').innerHTML = `
      <div class="cc-head">
        <div class="cc-big b-${a.band.key}"><strong class="num">${a.score}</strong><span>/100</span></div>
        <div class="cc-hd">
          ${c ? `<div class="eyebrow">Training case ${c.n}</div><h3>${esc(c.title)}</h3>` : '<div class="eyebrow">Deposit</div>'}
          <p><b class="num">${btc(a.val)} BTC</b> received on ${dtOf(txTime[t])} in block ${nf(heightAt(txTime[t]))} · ${bandPill(a.band)} risk</p>
          <p class="mono muted">tx ${txStr(t)}</p>
        </div>
      </div>
      <div class="cc-action b-${a.band.key}"><b>Recommended action:</b> ${esc(a.band.action)}</div>
      <div class="cc-sec"><h2>Why Chain-Check flagged this</h2><ul class="cc-why">${explain(a)}</ul></div>
      <div class="cc-sec"><h2>Where the money came from</h2>${exposureBar(a)}${lanesSvg(a)}
        <div class="tbl-wrap"><table><thead><tr><th>Source</th><th>Category</th><th class="num">Share</th><th class="num">BTC</th><th class="num">Hops</th></tr></thead><tbody>${srcRows}</tbody></table></div></div>
      ${a.steps.length && a.main && typeof a.main.key === 'number' ? `<div class="cc-sec"><h2>The path, hop by hop</h2><p class="muted">The heaviest route from ${esc(ENT[a.main.key].name)} to this deposit.</p>${timeline(a)}</div>` : ''}
      <div class="cc-sec"><h2>Back to the first block</h2>${originBox(a)}</div>
      <div class="cc-sec"><h2>Who sent it</h2>${clusterBox(a)}</div>
      ${c ? `<div class="cc-sec"><button type="button" id="ccReveal">Reveal what really happened</button><div id="ccTruth" class="cc-truth" hidden><b>What really happened.</b> ${esc(c.truth)}</div></div>` : ''}`;
    $('ccReveal')?.addEventListener('click', () => { $('ccTruth').hidden = false; $('ccReveal').hidden = true; });
    renderCases();
    document.querySelectorAll('#ccQueue .cc-item').forEach((b) => b.classList.toggle('on', +b.dataset.tx === t));
    if (window.matchMedia('(max-width: 1000px)').matches) $('ccCase').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------------- wiring ---------------- */
  let wired = false;
  function wire() {
    if (wired) return;
    wired = true;
    $('ccCases').addEventListener('click', (e) => { const b = e.target.closest('[data-tx]'); if (b) openDeposit(+b.dataset.tx); });
    $('ccQueue').addEventListener('click', (e) => { const b = e.target.closest('[data-tx]'); if (b) openDeposit(+b.dataset.tx); });
    document.querySelectorAll('[data-ccf]').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.ccf; renderQueue(); }));
    $('ccSearch').addEventListener('input', (e) => { query = e.target.value; renderQueue(); });
    $('ccNew').addEventListener('click', () => { if (!building) build((Math.random() * 2 ** 31) >>> 0); });
  }
  window.ChainCheck = {
    open() { wire(); if (!ready && !building) build(20111); },
  };
})();
