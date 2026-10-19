/* Image processing for the scanner (runs in a web worker, OpenCV.js / WebAssembly).
   OpenCV’s JS bindings need eval(), so only this worker’s CSP allows 'unsafe-eval' (see vercel.json);
   like the page, it still cannot connect to any other server.
   - detect: finds the four corners of the sheet of paper in a photo
   - process: straightens the sheet (perspective correction) and applies the scan look */
let cvReady = null;

function loadCV() {
  if (!cvReady) {
    cvReady = (async () => {
      importScripts('vendor/opencv.js');
      let c = self.cv;
      if (c instanceof Promise || (c && typeof c.then === 'function')) c = await c;
      else if (!c.Mat) await new Promise((r) => { c.onRuntimeInitialized = r; });
      self.cv = c;
      return c;
    })();
  }
  return cvReady;
}

// ---------- Corner detection
// Candidates (four-sided shapes) come from several sources: edges of the lightness and of the "paperness"
// (bright + colourless) with the text removed, a paper/background segmentation, and straight lines combined
// into quadrilaterals (this survives hands over a corner and shadows across the page). Every candidate is
// scored by whether its sides are real borders – a consistent step in lightness or colourfulness all along –
// by its size, and by whether there is paper inside and none left just outside.
const WORK = 512;

function orderQuad(pts) {
  // clockwise from the top-left corner (image coordinates, y down)
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const q = [...pts].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  let i0 = 0;
  q.forEach((p, i) => { if (p.x + p.y < q[i0].x + q[i0].y) i0 = i; });
  return [...q.slice(i0), ...q.slice(0, i0)];
}

function polyArea(p) {
  let s = 0;
  for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a.x * b.y - b.x * a.y; }
  return Math.abs(s) / 2;
}

function isConvexQuad(p) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = p[i], b = p[(i + 1) % 4], c = p[(i + 2) % 4];
    const z = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (z === 0) return false;
    if (!sign) sign = Math.sign(z); else if (Math.sign(z) !== sign) return false;
  }
  return true;
}

// corner angles between ~53° and ~127°
function anglesOk(q) {
  for (let i = 0; i < 4; i++) {
    const a = q[(i + 3) % 4], b = q[i], c = q[(i + 1) % 4];
    const v1x = a.x - b.x, v1y = a.y - b.y, v2x = c.x - b.x, v2y = c.y - b.y;
    const cos = (v1x * v2x + v1y * v2y) / (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) + 1e-6);
    if (Math.abs(cos) > 0.6) return false;
  }
  return true;
}

const matPoints = (m) => { const out = []; for (let i = 0; i < m.rows; i++) out.push({ x: m.data32S[i * 2], y: m.data32S[i * 2 + 1] }); return out; };

// Reduce a convex hull to four corners: approxPolyDP with growing tolerance, else the 4 hull points spanning the largest area
function quadFromHull(cv, hull) {
  const peri = cv.arcLength(hull, true);
  for (const f of [0.015, 0.025, 0.035, 0.05, 0.07]) {
    const ap = new cv.Mat();
    cv.approxPolyDP(hull, ap, f * peri, true);
    const n = ap.rows;
    if (n === 4) { const pts = matPoints(ap); ap.delete(); return pts; }
    ap.delete();
    if (n < 4) break;
  }
  const ap = new cv.Mat();
  cv.approxPolyDP(hull, ap, 0.01 * peri, true);
  let pts = matPoints(ap);
  ap.delete();
  if (pts.length > 14) pts = Array.from({ length: 14 }, (_, i) => pts[Math.round((i * (pts.length - 1)) / 13)]);
  if (pts.length < 4) return null;
  let best = null, ba = 0;
  const n = pts.length;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) for (let d = c + 1; d < n; d++) {
    const q = [pts[a], pts[b], pts[c], pts[d]], ar = polyArea(q);
    if (ar > ba) { ba = ar; best = q; }
  }
  return best;
}

function intersect(l1, l2) {
  const rx = l1[1].x - l1[0].x, ry = l1[1].y - l1[0].y, sx = l2[1].x - l2[0].x, sy = l2[1].y - l2[0].y;
  const d = rx * sy - ry * sx;
  if (Math.abs(d) < 1e-6) return null;
  const t = ((l2[0].x - l1[0].x) * sy - (l2[0].y - l1[0].y) * sx) / d;
  return { x: l1[0].x + t * rx, y: l1[0].y + t * ry };
}

// straight lines (Hough) → merged → two of the flatter and two of the steeper ones (or the image frame) form a quad
function lineQuads(cv, edges, w, h) {
  const segs = new cv.Mat();
  cv.HoughLinesP(edges, segs, 1, Math.PI / 180, 40, Math.round(0.12 * Math.min(w, h)), 12);
  const lines = [];
  for (let i = 0; i < segs.rows; i++) {
    const [x1, y1, x2, y2] = segs.data32S.subarray(i * 4, i * 4 + 4);
    const ang = ((Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI + 180) % 180;
    const th = (ang * Math.PI) / 180, nx = -Math.sin(th), ny = Math.cos(th), rho = x1 * nx + y1 * ny;
    const dx = Math.cos(th), dy = Math.sin(th);
    const hit = lines.find((ln) => Math.min(Math.abs(ln.ang - ang), 180 - Math.abs(ln.ang - ang)) < 4 && Math.abs(ln.rho - rho) < 6);
    if (hit) {
      const pts = [hit.a, hit.b, { x: x1, y: y1 }, { x: x2, y: y2 }];
      const proj = pts.map((p) => p.x * dx + p.y * dy);
      const lo = proj.indexOf(Math.min(...proj)), hi = proj.indexOf(Math.max(...proj));
      hit.a = pts[lo]; hit.b = pts[hi]; hit.len = proj[hi] - proj[lo];
    } else lines.push({ ang, rho, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, len: Math.hypot(x2 - x1, y2 - y1) });
  }
  segs.delete();
  const flat = lines.filter((l) => l.ang < 45 || l.ang > 135).sort((a, b) => b.len - a.len).slice(0, 8).map((l) => [l.a, l.b]);
  const steep = lines.filter((l) => l.ang >= 45 && l.ang <= 135).sort((a, b) => b.len - a.len).slice(0, 8).map((l) => [l.a, l.b]);
  // the image frame counts as a line too (pages cut off by the photo)
  flat.push([{ x: 0, y: 0 }, { x: w - 1, y: 0 }], [{ x: w - 1, y: h - 1 }, { x: 0, y: h - 1 }]);
  steep.push([{ x: w - 1, y: 0 }, { x: w - 1, y: h - 1 }], [{ x: 0, y: h - 1 }, { x: 0, y: 0 }]);
  const out = [];
  for (let i = 0; i < flat.length; i++) for (let j = i + 1; j < flat.length; j++)
    for (let k = 0; k < steep.length; k++) for (let l = k + 1; l < steep.length; l++) {
      const pts = [intersect(flat[i], steep[k]), intersect(flat[i], steep[l]), intersect(flat[j], steep[l]), intersect(flat[j], steep[k])];
      if (pts.some((p) => !p || p.x < -0.02 * w || p.x > 1.02 * w || p.y < -0.02 * h || p.y > 1.02 * h)) continue;
      const q = orderQuad(pts.map((p) => ({ x: Math.min(w - 1, Math.max(0, p.x)), y: Math.min(h - 1, Math.max(0, p.y)) })));
      if (polyArea(q) < 0.05 * w * h || !isConvexQuad(q) || !anglesOk(q)) continue;
      out.push(q);
    }
  return out;
}

const onBorder = (a, b, w, h) => Math.max(a.x, b.x) < 3 || Math.min(a.x, b.x) > w - 4 || Math.max(a.y, b.y) < 3 || Math.min(a.y, b.y) > h - 4;
// unit normal of side a→b pointing into the quad
function inward(q, a, b) {
  const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4, cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4;
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) + 1e-6;
  let nx = -dy / len, ny = dx / len;
  if ((cx - (a.x + b.x) / 2) * nx + (cy - (a.y + b.y) / 2) * ny < 0) { nx = -nx; ny = -ny; }
  return [nx, ny];
}
const at = (arr, w, h, x, y) => arr[Math.min(h - 1, Math.max(0, Math.round(y))) * w + Math.min(w - 1, Math.max(0, Math.round(x)))];

// per side: share of points with a consistent step in lightness (either way) or in colourfulness
function sideContrast(q, Lb, Sb, w, h) {
  const res = [];
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4];
    if (onBorder(a, b, w, h)) { res.push(0.55); continue; }      // page cut off by the frame
    const [nx, ny] = inward(q, a, b);
    let up = 0, down = 0, sat = 0;
    const n = 48;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      const dl = at(Lb, w, h, x + nx * 4, y + ny * 4) - at(Lb, w, h, x - nx * 4, y - ny * 4);
      const ds = at(Sb, w, h, x - nx * 4, y - ny * 4) - at(Sb, w, h, x + nx * 4, y + ny * 4);
      if (dl > 7) up++; else if (dl < -7) down++;
      if (ds > 0.035) sat++;
    }
    res.push(Math.max(up, down, sat) / n);
  }
  return res;
}

// share of paper-like pixels just inside / just outside the sides, plus a coarse grid inside
function paperSides(q, seg, w, h, k) {
  let inN = 0, inP = 0, outN = 0, outP = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], [nx, ny] = inward(q, a, b);
    for (let j = 0; j < 24; j++) {
      const t = (j + 0.5) / 24, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      for (const o of [0.5, 1]) {
        for (const sgn of [1, -1]) {
          const px = x + nx * sgn * o * k, py = y + ny * sgn * o * k;
          if (px < 0 || px >= w || py < 0 || py >= h) continue;
          const v = seg[Math.floor(py) * w + Math.floor(px)] > 0;
          if (sgn > 0) { inN++; inP += v; } else { outN++; outP += v; }
        }
      }
    }
  }
  for (let u = 1; u < 8; u++) for (let v = 1; v < 8; v++) {
    const s = u / 8, r = v / 8;
    const x = (q[0].x * (1 - s) + q[1].x * s) * (1 - r) + (q[3].x * (1 - s) + q[2].x * s) * r;
    const y = (q[0].y * (1 - s) + q[1].y * s) * (1 - r) + (q[3].y * (1 - s) + q[2].y * s) * r;
    inN++; inP += seg[Math.floor(y) * w + Math.floor(x)] > 0;
  }
  return [inN ? inP / inN : 0, outN ? outP / outN : 0];
}

function percentile(f32, p) {
  const step = Math.max(1, Math.floor(f32.length / 20000)), sample = [];
  for (let i = 0; i < f32.length; i += step) sample.push(f32[i]);
  sample.sort((a, b) => a - b);
  return sample[Math.min(sample.length - 1, Math.floor((p / 100) * sample.length))];
}

async function detect({ data, width, height }) {
  const cv = await loadCV();
  const keep = [];
  const M = (m) => { keep.push(m); return m; };
  try {
    const src = M(cv.matFromImageData(new ImageData(new Uint8ClampedArray(data), width, height)));
    const s = WORK / Math.max(width, height);
    const img = M(new cv.Mat());
    cv.resize(src, img, new cv.Size(Math.round(width * s), Math.round(height * s)), 0, 0, cv.INTER_AREA);
    const w = img.cols, h = img.rows, A = w * h, N = A;
    const rgb = M(new cv.Mat()), lab = M(new cv.Mat());
    cv.cvtColor(img, rgb, cv.COLOR_RGBA2RGB);
    cv.cvtColor(rgb, lab, cv.COLOR_RGB2Lab);
    const ld = lab.data;
    // lightness, 'paperness' (bright and colourless) and colourfulness
    const L = M(new cv.Mat(h, w, cv.CV_8UC1)), P = M(new cv.Mat(h, w, cv.CV_8UC1)), SAT = M(new cv.Mat(h, w, cv.CV_32FC1));
    const Ld = L.data, Pd = P.data, Sd = SAT.data32F;
    for (let i = 0, j = 0; i < N; i++, j += 3) {
      const l = ld[j], ch = Math.hypot(ld[j + 1] - 128, ld[j + 2] - 128);
      Ld[i] = l; Pd[i] = Math.max(0, Math.min(255, l - 2 * ch)); Sd[i] = ch / (l + 25);
    }
    // remove the text: closing with a kernel larger than the strokes
    const k7 = M(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(7, 7)));
    const k3 = M(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3)));
    const k9 = M(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(9, 9)));
    const Lc = M(new cv.Mat()), Pc = M(new cv.Mat());
    cv.medianBlur(L, Lc, 5); cv.morphologyEx(Lc, Lc, cv.MORPH_CLOSE, k7);
    cv.medianBlur(P, Pc, 5); cv.morphologyEx(Pc, Pc, cv.MORPH_CLOSE, k7);

    // edge maps with thresholds adapted to the photo's contrast
    const maps = [];
    for (const srcM of [Lc, Pc]) {
      const g = M(new cv.Mat()), gx = M(new cv.Mat()), gy = M(new cv.Mat()), mag = M(new cv.Mat());
      cv.GaussianBlur(srcM, g, new cv.Size(5, 5), 0);
      cv.Sobel(g, gx, cv.CV_32F, 1, 0); cv.Sobel(g, gy, cv.CV_32F, 0, 1); cv.magnitude(gx, gy, mag);
      const p97 = percentile(mag.data32F, 97);
      for (const [lo, hi] of [[0.25, 0.5], [0.5, 1]]) {
        const e = M(new cv.Mat());
        cv.Canny(g, e, Math.max(6, lo * p97), Math.max(14, hi * p97));
        cv.dilate(e, e, k3);
        maps.push(e);
      }
    }
    // paper / background segmentation (Otsu)
    const seg = M(new cv.Mat()), seg2 = M(new cv.Mat()), tmp = M(new cv.Mat());
    cv.GaussianBlur(Pc, tmp, new cv.Size(7, 7), 0);
    cv.threshold(tmp, seg, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    cv.morphologyEx(seg, seg, cv.MORPH_OPEN, k9);
    cv.GaussianBlur(Lc, tmp, new cv.Size(7, 7), 0);
    cv.threshold(tmp, seg2, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    cv.morphologyEx(seg2, seg2, cv.MORPH_OPEN, k9);

    // candidates from contours
    const cands = [];
    for (const mp of [...maps, seg, seg2]) {
      const contours = new cv.MatVector(), hier = new cv.Mat();
      cv.findContours(mp, contours, hier, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
      const list = [];
      for (let i = 0; i < contours.size(); i++) { const c = contours.get(i); list.push({ c, a: cv.contourArea(c) }); }
      list.sort((x, y) => y.a - x.a);
      for (const { c } of list.slice(0, 8)) {
        const hull = new cv.Mat();
        cv.convexHull(c, hull, false, true);
        if (cv.contourArea(hull) >= 0.05 * A) {
          const q0 = quadFromHull(cv, hull);
          if (q0) {
            const q = orderQuad(q0), qa = polyArea(q);
            if (qa >= 0.05 * A && qa <= 0.995 * A && isConvexQuad(q) && anglesOk(q)) cands.push(q);
          }
        }
        hull.delete();
      }
      list.forEach(({ c }) => c.delete());
      contours.delete(); hier.delete();
    }
    // candidates from straight lines
    const edges = M(maps[0].clone());
    for (const e of maps.slice(1)) cv.bitwise_or(edges, e, edges);
    cands.push(...lineQuads(cv, edges, w, h));

    // score: real borders on all sides + size
    const Lb = M(new cv.Mat()), Sb = M(new cv.Mat());
    cv.GaussianBlur(Lc, Lb, new cv.Size(5, 5), 0);
    cv.morphologyEx(SAT, Sb, cv.MORPH_OPEN, k7);
    cv.GaussianBlur(Sb, Sb, new cv.Size(5, 5), 0);
    const Lbd = Lb.data, Sbd = Sb.data32F, segd = seg.data;
    const seen = new Set(), scored = [];
    for (const q of cands) {
      const key = q.map((p) => `${Math.round(p.x / 6)},${Math.round(p.y / 6)}`).join(';');
      if (seen.has(key)) continue;
      seen.add(key);
      const sc = sideContrast(q, Lbd, Sbd, w, h);
      if (sc.filter((v) => v === 0.55).length >= 3) continue;
      const mean = (sc[0] + sc[1] + sc[2] + sc[3]) / 4;
      scored.push({ q, score: 0.4 * mean + 0.3 * Math.min(...sc) + 0.3 * Math.sqrt(polyArea(q) / A) });
    }
    // final round: paper inside, no paper left just outside
    scored.sort((x, y) => y.score - x.score);
    const k = Math.max(5, Math.round(0.05 * Math.max(w, h)));
    let best = null, bs = -1;
    for (const c of scored.slice(0, 12)) {
      const [pin, pout] = paperSides(c.q, segd, w, h, k);
      const total = c.score + 0.25 * (pin - 0.5) - 0.35 * pout;
      if (total > bs) { bs = total; best = c.q; }
    }
    if (!best || bs < 0.45) {
      // nothing convincing – if almost the whole photo is paper, the page fills the frame
      let paper = 0;
      for (let i = 0; i < N; i += 7) paper += segd[i] > 0;
      if (paper / Math.ceil(N / 7) > 0.8) return { corners: [{ x: 0.01, y: 0.01 }, { x: 0.99, y: 0.01 }, { x: 0.99, y: 0.99 }, { x: 0.01, y: 0.99 }] };
      return { corners: null };
    }
    return { corners: best.map((p) => ({ x: p.x / w, y: p.y / h })) };
  } finally {
    keep.forEach((m) => { try { m.delete(); } catch { /* already freed */ } });
  }
}

// ---------- Straighten + scan look
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

// Even out shadows and uneven light: divide by a blurred “paper” background
function flatten(cv, plane) {
  const small = new cv.Mat();
  const scale = 0.25;
  cv.resize(plane, small, new cv.Size(0, 0), scale, scale, cv.INTER_AREA);
  const k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
  cv.dilate(small, small, k);           // remove text, keep paper
  cv.medianBlur(small, small, 15);
  const bg = new cv.Mat();
  cv.resize(small, bg, plane.size(), 0, 0, cv.INTER_LINEAR);
  const out = new cv.Mat();
  cv.divide(plane, bg, out, 255);
  small.delete(); k.delete(); bg.delete();
  return out;
}

function contrast(cv, m, gain, bias) { m.convertTo(m, -1, gain, bias); }

async function process({ data, width, height, corners, filter, rotate, maxSide }) {
  const cv = await loadCV();
  const src = cv.matFromImageData(new ImageData(new Uint8ClampedArray(data), width, height));
  const P = corners.map((p) => ({ x: p.x * width, y: p.y * height }));
  let w = Math.max(dist(P[0], P[1]), dist(P[3], P[2]));
  let h = Math.max(dist(P[0], P[3]), dist(P[1], P[2]));
  // Edge lengths only estimate the real proportions (perspective): snap to A4 / US Letter when close
  const long = Math.max(w, h), short = Math.min(w, h), r = long / short;
  for (const [ratio, tol] of [[Math.SQRT2, 0.1], [11 / 8.5, 0.04]]) {
    if (Math.abs(r / ratio - 1) < tol) {
      if (w < h) w = h / ratio; else h = w / ratio;
      if (Math.max(w, h) < long) { const k = long / Math.max(w, h); w *= k; h *= k; }
      break;
    }
  }
  const s = Math.min(1, maxSide / Math.max(w, h));
  w = Math.max(16, Math.round(w * s)); h = Math.max(16, Math.round(h * s));

  const from = cv.matFromArray(4, 1, cv.CV_32FC2, P.flatMap((p) => [p.x, p.y]));
  const to = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, w, 0, w, h, 0, h]);
  const M = cv.getPerspectiveTransform(from, to);
  const warped = new cv.Mat();
  cv.warpPerspective(src, warped, M, new cv.Size(w, h), cv.INTER_CUBIC, cv.BORDER_REPLICATE);
  from.delete(); to.delete(); M.delete(); src.delete();

  let out;
  if (filter === 'color') {
    const rgb = new cv.Mat();
    cv.cvtColor(warped, rgb, cv.COLOR_RGBA2RGB);
    const planes = new cv.MatVector();
    cv.split(rgb, planes);
    const flat = new cv.MatVector();
    for (let i = 0; i < 3; i++) { const p = planes.get(i); const f = flatten(cv, p); contrast(cv, f, 1.12, -14); flat.push_back(f); p.delete(); f.delete(); }
    out = new cv.Mat();
    cv.merge(flat, out);
    cv.cvtColor(out, out, cv.COLOR_RGB2RGBA);
    planes.delete(); flat.delete(); rgb.delete();
  } else if (filter === 'gray' || filter === 'bw') {
    const g = new cv.Mat();
    cv.cvtColor(warped, g, cv.COLOR_RGBA2GRAY);
    const f = flatten(cv, g);
    g.delete();
    if (filter === 'gray') contrast(cv, f, 1.15, -18);
    else {
      const block = Math.max(15, (Math.round(Math.max(w, h) / 70) | 1));
      cv.adaptiveThreshold(f, f, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, block, 12);
    }
    out = new cv.Mat();
    cv.cvtColor(f, out, cv.COLOR_GRAY2RGBA);
    f.delete();
  } else {
    out = warped.clone();
  }
  warped.delete();

  if (rotate) {
    const code = { 90: cv.ROTATE_90_CLOCKWISE, 180: cv.ROTATE_180, 270: cv.ROTATE_90_COUNTERCLOCKWISE }[rotate];
    cv.rotate(out, out, code);
  }
  const result = { width: out.cols, height: out.rows, data: new Uint8ClampedArray(out.data) };
  out.delete();
  return result;
}

self.onmessage = async (e) => {
  const { id, cmd, args } = e.data;
  try {
    let res;
    if (cmd === 'load') { await loadCV(); res = true; }
    else if (cmd === 'detect') res = await detect(args);
    else if (cmd === 'process') res = await process(args);
    const transfer = res && res.data ? [res.data.buffer] : [];
    self.postMessage({ id, ok: true, res }, transfer);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};
