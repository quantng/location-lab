// stats.js — location-analytics engine (pure JS, no dependencies)
// All distances in km on a spherical Earth unless noted.

export const R_EARTH = 6371.0088;
const RAD = Math.PI / 180;

export function haversine(lat1, lon1, lat2, lon2) {
  const dl = (lat2 - lat1) * RAD, dn = (lon2 - lon1) * RAD;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dn / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Local equirectangular projection to km (good within a city)
export function projector(pts) {
  let lat0 = 0; for (const p of pts) lat0 += p[1]; lat0 /= Math.max(1, pts.length);
  const kx = 111.32 * Math.cos(lat0 * RAD), ky = 110.574;
  return { f: (lon, lat) => [lon * kx, lat * ky], inv: (x, y) => [x / kx, y / ky], kx, ky, lat0 };
}

// Seeded RNG so class results are reproducible
export function rng(seed = 12345) {
  let s = seed >>> 0;
  return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- grid index for kNN / radius queries on projected km coords ----------
export class GridIndex {
  constructor(xy, cell) {
    this.xy = xy; this.cell = cell || this.autoCell(xy); this.map = new Map();
    xy.forEach((p, i) => { const k = this.key(p[0], p[1]); let a = this.map.get(k); if (!a) this.map.set(k, a = []); a.push(i); });
  }
  autoCell(xy) {
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (const [x, y] of xy) { if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
    const area = Math.max(1e-6, (maxx - minx) * (maxy - miny));
    return Math.max(0.05, Math.sqrt(area / Math.max(1, xy.length)) * 2);
  }
  key(x, y) { return Math.floor(x / this.cell) + ',' + Math.floor(y / this.cell); }
  radius(x, y, r) {
    const out = [], c = this.cell, r2 = r * r;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c), y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) {
      const a = this.map.get(i + ',' + j); if (!a) continue;
      for (const k of a) { const dx = this.xy[k][0] - x, dy = this.xy[k][1] - y, d2 = dx * dx + dy * dy; if (d2 <= r2) out.push([k, Math.sqrt(d2)]); }
    }
    return out;
  }
  knn(x, y, k, exclude = -1) {
    let r = this.cell, res = [];
    const n = this.xy.length - (exclude >= 0 ? 1 : 0);
    k = Math.min(k, n);
    for (let iter = 0; iter < 40; iter++) {
      res = this.radius(x, y, r).filter(e => e[0] !== exclude);
      if (res.length >= k) break; r *= 2;
    }
    res.sort((a, b) => a[1] - b[1]);
    return res.slice(0, k);
  }
}

// ---------- spatial weights ----------
// W = { n, nb: [[j...]], wt: [[w...]] }  row-standardised by default
export function weightsKNN(xy, k) {
  const g = new GridIndex(xy), nb = [], wt = [];
  for (let i = 0; i < xy.length; i++) { const r = g.knn(xy[i][0], xy[i][1], k, i); nb.push(r.map(e => e[0])); }
  return finishW(nb, `${k} nearest neighbours`);
}
export function weightsDistance(xy, d) {
  const g = new GridIndex(xy), nb = [];
  for (let i = 0; i < xy.length; i++) nb.push(g.radius(xy[i][0], xy[i][1], d).filter(e => e[0] !== i).map(e => e[0]));
  return finishW(nb, `distance band ${d} km`);
}
// Queen contiguity from polygon rings (shared vertex, rounded to ~1 m)
export function weightsQueen(polys) {
  const vmap = new Map(), nbs = polys.map(() => new Set());
  polys.forEach((rings, i) => {
    for (const ring of rings) for (const [x, y] of ring) {
      const key = Math.round(x * 1e5) + ',' + Math.round(y * 1e5);
      let s = vmap.get(key); if (!s) vmap.set(key, s = new Set()); s.add(i);
    }
  });
  for (const s of vmap.values()) if (s.size > 1) for (const a of s) for (const b of s) if (a !== b) nbs[a].add(b);
  return finishW(nbs.map(s => [...s]), 'queen contiguity (shared border or corner)');
}
// Contiguity for H3 cells: neighbours = ring 1 cells present in the layer
export function weightsH3(cells, h3) {
  const idx = new Map(cells.map((c, i) => [c, i]));
  const nb = cells.map(c => h3.gridDisk(c, 1).filter(x => x !== c && idx.has(x)).map(x => idx.get(x)));
  return finishW(nb, 'hexagon contiguity (6 touching cells)');
}
function finishW(nb, label) {
  const wt = nb.map(a => a.length ? a.map(() => 1 / a.length) : []);
  const card = nb.map(a => a.length);
  const islands = card.filter(c => c === 0).length;
  return { n: nb.length, nb, wt, label, card, islands, mean: card.reduce((s, c) => s + c, 0) / nb.length };
}
export function lag(W, v) { const out = new Float64Array(W.n); for (let i = 0; i < W.n; i++) { let s = 0; const a = W.nb[i], w = W.wt[i]; for (let t = 0; t < a.length; t++) s += w[t] * v[a[t]]; out[i] = s; } return out; }

// ---------- descriptive ----------
export const mean = a => { let s = 0; for (const v of a) s += v; return s / a.length; };
export function sd(a) { const m = mean(a); let s = 0; for (const v of a) s += (v - m) ** 2; return Math.sqrt(s / a.length); }
export function zscore(a) { const m = mean(a), s = sd(a) || 1; return Float64Array.from(a, v => (v - m) / s); }
export function quantile(a, q) { const b = Float64Array.from(a).sort(); const p = (b.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p); return b[lo] + (b[hi] - b[lo]) * (p - lo); }
function normCdf(x) { const t = 1 / (1 + 0.2316419 * Math.abs(x)); const d = 0.3989423 * Math.exp(-x * x / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - p : p; }
export const pTwo = z => 2 * (1 - normCdf(Math.abs(z)));

// ---------- global Moran's I with permutation inference ----------
export function moran(W, y, perms = 999, seed = 1) {
  const n = y.length, z = zscore(y);
  const I = calcI(W, z);
  const EI = -1 / (n - 1);
  const r = rng(seed), sims = new Float64Array(perms), zz = Float64Array.from(z);
  for (let p = 0; p < perms; p++) { shuffle(zz, r); sims[p] = calcI(W, zz); }
  let larger = 0; for (const s of sims) if (s >= I) larger++;
  if (perms - larger < larger) larger = perms - larger; // folded like PySAL p_sim
  const pSim = (larger + 1) / (perms + 1);
  const simMean = mean(sims), simSd = sd(sims);
  return { I, EI, pSim, zSim: (I - simMean) / simSd, sims, z, lagz: lag(W, z) };
}
function calcI(W, z) { // row-standardised: I = (n/S0) * sum z_i lag_i / sum z^2 ; S0 = n (minus islands)
  let num = 0, den = 0, S0 = 0;
  for (let i = 0; i < W.n; i++) { const a = W.nb[i], w = W.wt[i]; let l = 0; for (let t = 0; t < a.length; t++) { l += w[t] * z[a[t]]; S0 += w[t]; } num += z[i] * l; den += z[i] * z[i]; }
  return (W.n / S0) * num / den;
}
function shuffle(a, r) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } }

// ---------- Local Moran (LISA) with conditional permutation ----------
export function lisa(W, y, perms = 499, alpha = 0.05, seed = 7) {
  const n = y.length, z = zscore(y), lz = lag(W, z), m2 = z.reduce((s, v) => s + v * v, 0) / n;
  const Ii = Float64Array.from(z, (v, i) => v * lz[i] / m2 * (n - 1) / n * n / (n - 1)); // = z_i * lag_i / m2
  const r = rng(seed), p = new Float64Array(n), q = new Int8Array(n);
  for (let i = 0; i < n; i++) {
    const k = W.nb[i].length; if (!k) { p[i] = 1; continue; }
    let larger = 0;
    for (let s = 0; s < perms; s++) {
      let l = 0;
      for (let t = 0; t < k; t++) { let j; do { j = Math.floor(r() * n); } while (j === i); l += W.wt[i][t] * z[j]; }
      const sim = z[i] * l / m2;
      if (sim >= Ii[i]) larger++;
    }
    if (perms - larger < larger) larger = perms - larger;
    p[i] = (larger + 1) / (perms + 1);
    q[i] = z[i] >= 0 ? (lz[i] >= 0 ? 1 : 4) : (lz[i] >= 0 ? 2 : 3); // 1 HH, 2 LH, 3 LL, 4 HL (PySAL convention)
  }
  const cls = Array.from(q, (v, i) => p[i] <= alpha && W.nb[i].length ? ['', 'High-High', 'Low-High', 'Low-Low', 'High-Low'][v] : 'Not significant');
  return { Ii, p, q, cls, z, lz };
}

// ---------- Getis-Ord Gi* (analytical z) ----------
export function giStar(W, y) {
  const n = y.length, xbar = mean(y); let s2 = 0; for (const v of y) s2 += v * v; const S = Math.sqrt(s2 / n - xbar * xbar);
  const z = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const nb = [i, ...W.nb[i]]; // star: include self, binary weights
    const wsum = nb.length; let lx = 0; for (const j of nb) lx += y[j];
    const num = lx - xbar * wsum, den = S * Math.sqrt((n * wsum - wsum * wsum) / (n - 1));
    z[i] = den > 0 ? num / den : 0;
  }
  const cls = Array.from(z, v => v >= 2.576 ? 'Hot spot 99%' : v >= 1.96 ? 'Hot spot 95%' : v >= 1.645 ? 'Hot spot 90%' : v <= -2.576 ? 'Cold spot 99%' : v <= -1.96 ? 'Cold spot 95%' : v <= -1.645 ? 'Cold spot 90%' : 'Not significant');
  return { z, p: Array.from(z, pTwo), cls };
}

// ---------- point pattern: Clark–Evans and Ripley's L with CSR envelope ----------
export function pointPattern(xy, nsim = 19, seed = 3) {
  const n = xy.length; const hull = convexHull(xy); const A = polyArea(hull);
  const g = new GridIndex(xy); let sum = 0;
  for (let i = 0; i < n; i++) sum += g.knn(xy[i][0], xy[i][1], 1, i)[0][1];
  const dObs = sum / n, dExp = 0.5 / Math.sqrt(n / A), se = 0.26136 / Math.sqrt(n * n / A);
  const R = dObs / dExp, z = (dObs - dExp) / se;
  // Ripley L(d) - d at distances
  const bb = bbox(xy), maxd = Math.min(bb[2] - bb[0], bb[3] - bb[1]) / 4;
  const ds = Array.from({ length: 20 }, (_, i) => maxd * (i + 1) / 20);
  const Lobs = ripleyL(xy, ds, A);
  const r = rng(seed), env = ds.map(() => [Infinity, -Infinity]);
  for (let s = 0; s < nsim; s++) {
    const sim = randomInPoly(hull, n, r); const L = ripleyL(sim, ds, A);
    L.forEach((v, i) => { env[i][0] = Math.min(env[i][0], v); env[i][1] = Math.max(env[i][1], v); });
  }
  return { n, area: A, dObs, dExp, R, z, p: pTwo(z), ds, Lobs, env, hull, verdict: R < 1 && Math.abs(z) > 1.96 ? 'Clustered' : R > 1 && Math.abs(z) > 1.96 ? 'Dispersed' : 'Consistent with random' };
}
function ripleyL(xy, ds, A) {
  const n = xy.length, g = new GridIndex(xy), cnt = new Float64Array(ds.length), dmax = ds[ds.length - 1];
  for (let i = 0; i < n; i++) for (const [j, d] of g.radius(xy[i][0], xy[i][1], dmax)) if (j !== i) for (let t = 0; t < ds.length; t++) if (d <= ds[t]) cnt[t]++;
  return Array.from(cnt, (c, t) => Math.sqrt(A * c / (n * (n - 1)) / Math.PI) - ds[t]);
}
export function bbox(xy) { let a = [Infinity, Infinity, -Infinity, -Infinity]; for (const [x, y] of xy) { a[0] = Math.min(a[0], x); a[1] = Math.min(a[1], y); a[2] = Math.max(a[2], x); a[3] = Math.max(a[3], y); } return a; }
export function convexHull(pts) {
  const p = pts.map(q => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
export function polyArea(r) { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; }
export function pointInRing(x, y, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
function randomInPoly(hull, n, r) { const b = bbox(hull), out = []; while (out.length < n) { const x = b[0] + r() * (b[2] - b[0]), y = b[1] + r() * (b[3] - b[1]); if (pointInRing(x, y, hull)) out.push([x, y]); } return out; }

// ---------- DBSCAN ----------
export function dbscan(xy, eps, minPts) {
  const n = xy.length, g = new GridIndex(xy, eps), lab = new Int32Array(n).fill(-2); let c = 0; // -2 unvisited, -1 noise
  for (let i = 0; i < n; i++) {
    if (lab[i] !== -2) continue;
    const nb = g.radius(xy[i][0], xy[i][1], eps).map(e => e[0]);
    if (nb.length < minPts) { lab[i] = -1; continue; }
    lab[i] = c; const queue = nb.filter(j => j !== i);
    while (queue.length) {
      const j = queue.pop();
      if (lab[j] === -1) lab[j] = c;
      if (lab[j] !== -2) continue;
      lab[j] = c; const nj = g.radius(xy[j][0], xy[j][1], eps).map(e => e[0]);
      if (nj.length >= minPts) for (const k of nj) if (lab[k] < 0) queue.push(k);
    }
    c++;
  }
  const sizes = new Array(c).fill(0); for (const l of lab) if (l >= 0) sizes[l]++;
  return { labels: lab, k: c, sizes, noise: lab.filter(l => l === -1).length };
}

// ---------- interpolation ----------
export function idwGrid(xy, v, grid, power = 2, k = 12) {
  const g = new GridIndex(xy), out = new Float32Array(grid.nx * grid.ny);
  for (let j = 0; j < grid.ny; j++) for (let i = 0; i < grid.nx; i++) {
    const x = grid.x0 + (i + 0.5) * grid.dx, y = grid.y1 - (j + 0.5) * grid.dy;
    const nb = g.knn(x, y, k); let sw = 0, sv = 0, exact = null;
    for (const [t, d] of nb) { if (d < 1e-9) { exact = v[t]; break; } const w = 1 / d ** power; sw += w; sv += w * v[t]; }
    out[j * grid.nx + i] = exact ?? sv / sw;
  }
  return out;
}
export function idwAt(xy, v, x, y, power = 2, k = 12, g = null) {
  g = g || new GridIndex(xy); let sw = 0, sv = 0;
  for (const [t, d] of g.knn(x, y, k)) { if (d < 1e-9) return v[t]; const w = 1 / d ** power; sw += w; sv += w * v[t]; }
  return sv / sw;
}
// Empirical semivariogram + exponential model fit (nugget, sill, range)
export function variogram(xy, v, nbins = 15, maxPairs = 200000, seed = 5) {
  const n = xy.length, b = bbox(xy), maxd = Math.hypot(b[2] - b[0], b[3] - b[1]) / 3;
  const sum = new Float64Array(nbins), cnt = new Float64Array(nbins), r = rng(seed);
  const total = n * (n - 1) / 2, step = total > maxPairs ? total / maxPairs : 1;
  if (step === 1) { for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) add(i, j); }
  else for (let s = 0; s < maxPairs; s++) { const i = Math.floor(r() * n), j = Math.floor(r() * n); if (i !== j) add(i, j); }
  function add(i, j) { const d = Math.hypot(xy[i][0] - xy[j][0], xy[i][1] - xy[j][1]); if (d >= maxd) return; const k = Math.floor(d / maxd * nbins); sum[k] += (v[i] - v[j]) ** 2 / 2; cnt[k]++; }
  const lags = [], gam = [];
  for (let k = 0; k < nbins; k++) if (cnt[k] > 5) { lags.push((k + 0.5) * maxd / nbins); gam.push(sum[k] / cnt[k]); }
  // grid-search fit of exponential model gamma(h)=c0 + c1(1-exp(-3h/a))
  const varAll = sd(v) ** 2; let best = null;
  for (let fa = 0.05; fa <= 1.0; fa += 0.025) for (let fn = 0; fn <= 0.8; fn += 0.05) {
    const a = fa * maxd; // least squares for sill given nugget fraction
    let num = 0, den = 0; for (let t = 0; t < lags.length; t++) { const f = fn + (1 - fn) * (1 - Math.exp(-3 * lags[t] / a)); num += f * gam[t] * cnt[t] ** 0; den += f * f; }
    const sill = num / den; let sse = 0; for (let t = 0; t < lags.length; t++) { const f = fn + (1 - fn) * (1 - Math.exp(-3 * lags[t] / a)); sse += (gam[t] - sill * f) ** 2; }
    if (!best || sse < best.sse) best = { sse, nugget: fn * sill, psill: (1 - fn) * sill, range: a };
  }
  best.model = h => h <= 0 ? 0 : best.nugget + best.psill * (1 - Math.exp(-3 * h / best.range));
  return { lags, gam, fit: best, maxd, varAll };
}
// Ordinary kriging with local neighbourhood
export function krigeGrid(xy, v, grid, vg, k = 16) {
  const g = new GridIndex(xy), pred = new Float32Array(grid.nx * grid.ny), se = new Float32Array(grid.nx * grid.ny);
  const gm = vg.fit.model;
  for (let j = 0; j < grid.ny; j++) for (let i = 0; i < grid.nx; i++) {
    const x = grid.x0 + (i + 0.5) * grid.dx, y = grid.y1 - (j + 0.5) * grid.dy;
    const r = krigeAt(xy, v, x, y, gm, k, g); pred[j * grid.nx + i] = r[0]; se[j * grid.nx + i] = r[1];
  }
  return { pred, se };
}
export function krigeAt(xy, v, x, y, gm, k, g) {
  const nb = g.knn(x, y, k), m = nb.length, A = [];
  for (let a = 0; a < m; a++) { const row = []; for (let b = 0; b < m; b++) { const p = xy[nb[a][0]], q = xy[nb[b][0]]; row.push(gm(Math.hypot(p[0] - q[0], p[1] - q[1]))); } row.push(1); A.push(row); }
  A.push(new Array(m).fill(1).concat([0]));
  const bvec = nb.map(e => gm(e[1])).concat([1]);
  const w = solve(A, bvec); if (!w) return [NaN, NaN];
  let p = 0, s2 = 0; for (let a = 0; a < m; a++) { p += w[a] * v[nb[a][0]]; s2 += w[a] * bvec[a]; } s2 += w[m];
  return [p, Math.sqrt(Math.max(0, s2))];
}

// ---------- linear algebra ----------
export function solve(A, b) { // Gaussian elimination with partial pivoting
  const n = A.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null; [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}
export function inv(A) { const n = A.length; const cols = []; for (let i = 0; i < n; i++) { const e = new Array(n).fill(0); e[i] = 1; const c = solve(A, e); if (!c) return null; cols.push(c); } return A.map((_, i) => cols.map(c => c[i])); }
function xtx(X, w = null) { const p = X[0].length, M = Array.from({ length: p }, () => new Array(p).fill(0)); for (let i = 0; i < X.length; i++) { const wi = w ? w[i] : 1; if (!wi) continue; const r = X[i]; for (let a = 0; a < p; a++) { const ra = r[a] * wi; for (let b = a; b < p; b++) M[a][b] += ra * r[b]; } } for (let a = 0; a < p; a++) for (let b = 0; b < a; b++) M[a][b] = M[b][a]; return M; }
function xty(X, y, w = null) { const p = X[0].length, v = new Array(p).fill(0); for (let i = 0; i < X.length; i++) { const wi = w ? w[i] : 1; if (!wi) continue; for (let a = 0; a < p; a++) v[a] += X[i][a] * y[i] * wi; } return v; }

// ---------- OLS ----------
export function ols(y, Xraw, names) {
  const n = y.length, X = Xraw.map(r => [1, ...r]), p = X[0].length;
  const XtXi = inv(xtx(X)); if (!XtXi) throw new Error('The explanatory variables are perfectly collinear. Remove one.');
  const xv = xty(X, y), b = XtXi.map(r => r.reduce((s, v, j) => s + v * xv[j], 0));
  return olsSummary(y, X, b, XtXi, ['Intercept', ...names]);
}
function olsSummary(y, X, b, XtXi, names) {
  const n = y.length, p = b.length, fit = X.map(r => r.reduce((s, v, j) => s + v * b[j], 0)), res = y.map((v, i) => v - fit[i]);
  const sse = res.reduce((s, v) => s + v * v, 0), ybar = mean(y), sst = y.reduce((s, v) => s + (v - ybar) ** 2, 0);
  const s2 = sse / (n - p), se = XtXi.map((r, i) => Math.sqrt(s2 * r[i]));
  const ll = -n / 2 * (Math.log(2 * Math.PI) + Math.log(sse / n) + 1);
  return { names, b, se, t: b.map((v, i) => v / se[i]), p: b.map((v, i) => pTwo(v / se[i])), r2: 1 - sse / sst, adjr2: 1 - (sse / (n - p)) / (sst / (n - 1)), fit, res, n, k: p, ll, aic: -2 * ll + 2 * p, sigma2: sse / n };
}

// ---------- spatial regression (ML) with Monte-Carlo log-determinant (Barry & Pace 1999) ----------
function logdetMC(W, m = 30, order = 40, seed = 11) {
  const n = W.n, r = rng(seed), tr = new Float64Array(order + 1);
  for (let s = 0; s < m; s++) {
    let x = Float64Array.from({ length: n }, () => (r() < 0.5 ? -1 : 1)); const x0 = Float64Array.from(x);
    for (let k = 1; k <= order; k++) { x = lag(W, x); let d = 0; for (let i = 0; i < n; i++) d += x0[i] * x[i]; tr[k] += d / m; }
  }
  // tr(W) = 0, tr(W^2) exact
  tr[1] = 0; let t2 = 0; for (let i = 0; i < n; i++) W.nb[i].forEach((j, a) => { const back = W.nb[j].indexOf(i); if (back >= 0) t2 += W.wt[i][a] * W.wt[j][back]; }); tr[2] = t2;
  return rho => { let s = 0, rp = 1; for (let k = 1; k <= order; k++) { rp *= rho; s -= rp * tr[k] / k; } return s; };
}
function golden(f, a, b, tol = 1e-4) { const g = (Math.sqrt(5) - 1) / 2; let c = b - g * (b - a), d = a + g * (b - a), fc = f(c), fd = f(d); while (Math.abs(b - a) > tol) { if (fc > fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); } else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d); } } return (a + b) / 2; }

export function spatialLagML(y, Xraw, names, W) {
  const n = y.length, X = Xraw.map(r => [1, ...r]), XtXi = inv(xtx(X)), Wy = Array.from(lag(W, y));
  const ld = logdetMC(W);
  const coef = v => { const xv = xty(X, v); return XtXi.map(r => r.reduce((s, q, j) => s + q * xv[j], 0)); };
  const b0 = coef(y), bL = coef(Wy);
  const e0 = y.map((v, i) => v - X[i].reduce((s, q, j) => s + q * b0[j], 0)), eL = Wy.map((v, i) => v - X[i].reduce((s, q, j) => s + q * bL[j], 0));
  const conc = rho => { let s = 0; for (let i = 0; i < n; i++) s += (e0[i] - rho * eL[i]) ** 2; return -n / 2 * Math.log(s / n) + ld(rho); };
  const rho = golden(conc, -0.99, 0.99);
  const yt = y.map((v, i) => v - rho * Wy[i]), b = coef(yt);
  const res = yt.map((v, i) => v - X[i].reduce((s, q, j) => s + q * b[j], 0)); const sig2 = res.reduce((s, v) => s + v * v, 0) / n;
  const ll = -n / 2 * (Math.log(2 * Math.PI) + Math.log(sig2) + 1) + ld(rho);
  // standard errors: approximate via numerical Hessian for rho, OLS-on-transformed for betas
  const h = 1e-3, d2 = (conc(rho + h) - 2 * conc(rho) + conc(rho - h)) / (h * h), seRho = Math.sqrt(-1 / d2);
  const se = XtXi.map((r, i) => Math.sqrt(sig2 * n / (n - X[0].length) * r[i]));
  return { names: ['Intercept', ...names], b, se, t: b.map((v, i) => v / se[i]), p: b.map((v, i) => pTwo(v / se[i])), rho, seRho, pRho: pTwo(rho / seRho), ll, aic: -2 * ll + 2 * (X[0].length + 1), res, n };
}
export function spatialErrorML(y, Xraw, names, W) {
  const n = y.length, X = Xraw.map(r => [1, ...r]), ld = logdetMC(W);
  const WX = X[0].map((_, j) => lag(W, X.map(r => r[j]))), Wy = lag(W, y);
  const fitAt = lam => {
    const ys = y.map((v, i) => v - lam * Wy[i]), Xs = X.map((r, i) => r.map((v, j) => v - lam * WX[j][i]));
    const Mi = inv(xtx(Xs)), xv = xty(Xs, ys), b = Mi.map(r => r.reduce((s, q, j) => s + q * xv[j], 0));
    let sse = 0; for (let i = 0; i < n; i++) { const e = ys[i] - Xs[i].reduce((s, q, j) => s + q * b[j], 0); sse += e * e; }
    return { b, sse, Mi };
  };
  const conc = lam => -n / 2 * Math.log(fitAt(lam).sse / n) + ld(lam);
  const lam = golden(conc, -0.99, 0.99), f = fitAt(lam), sig2 = f.sse / n;
  const ll = -n / 2 * (Math.log(2 * Math.PI) + Math.log(sig2) + 1) + ld(lam);
  const h = 1e-3, d2 = (conc(lam + h) - 2 * conc(lam) + conc(lam - h)) / (h * h), seL = Math.sqrt(-1 / d2);
  const se = f.Mi.map((r, i) => Math.sqrt(sig2 * r[i]));
  const res = y.map((v, i) => v - X[i].reduce((s, q, j) => s + q * f.b[j], 0));
  return { names: ['Intercept', ...names], b: f.b, se, t: f.b.map((v, i) => v / se[i]), p: f.b.map((v, i) => pTwo(v / se[i])), lambda: lam, seLambda: seL, pLambda: pTwo(lam / seL), ll, aic: -2 * ll + 2 * (X[0].length + 1), res, n };
}

// ---------- GWR (adaptive bisquare, AICc golden-section bandwidth) ----------
export function gwr(y, Xraw, names, xy, bw = null, onProgress = null) {
  const n = y.length, X = Xraw.map(r => [1, ...r]), p = X[0].length;
  const g = new GridIndex(xy), maxK = Math.min(n - 1, Math.max(60, Math.ceil(n * 0.3)));
  const K = xy.map((q, i) => g.knn(q[0], q[1], Math.min(n, maxK + 1)));
  const fitAll = (k, keep = false) => {
    let rss = 0, trS = 0; const B = keep ? [] : null, local = keep ? new Float64Array(n) : null;
    for (let i = 0; i < n; i++) {
      const nb = K[i].slice(0, k); const h = nb[nb.length - 1][1] * 1.0000001 || 1e-9;
      const M = Array.from({ length: p }, () => new Array(p).fill(0)), v = new Array(p).fill(0);
      const wts = nb.map(([j, d]) => (1 - (d / h) ** 2) ** 2);
      nb.forEach(([j], t) => { const w = wts[t], r = X[j]; for (let a = 0; a < p; a++) { v[a] += r[a] * y[j] * w; for (let b = a; b < p; b++) M[a][b] += r[a] * r[b] * w; } });
      for (let a = 0; a < p; a++) for (let b = 0; b < a; b++) M[a][b] = M[b][a];
      const Mi = inv(M); if (!Mi) return null;
      const bi = Mi.map(r => r.reduce((s, q, j) => s + q * v[j], 0));
      const yhat = X[i].reduce((s, q, j) => s + q * bi[j], 0); rss += (y[i] - yhat) ** 2;
      const xi = X[i], wii = wts[nb.findIndex(e => e[0] === i)] ?? 1; let sii = 0;
      for (let a = 0; a < p; a++) { let s = 0; for (let b = 0; b < p; b++) s += Mi[a][b] * xi[b]; sii += xi[a] * s; }
      trS += sii * wii;
      if (keep) { B.push(bi); local[i] = yhat; }
    }
    const sig2 = rss / n, aicc = 2 * n * Math.log(Math.sqrt(sig2)) + n * Math.log(2 * Math.PI) + n * (n + trS) / (n - 2 - trS);
    return { rss, trS, aicc, B, yhat: local };
  };
  let best = bw;
  if (!best) {
    const lo = Math.max(p + 2, 20), hi = maxK; const cache = new Map();
    const f = k => { k = Math.round(k); if (!cache.has(k)) { cache.set(k, fitAll(k)?.aicc ?? Infinity); onProgress && onProgress(cache.size); } return -cache.get(k); };
    best = Math.round(golden(f, lo, hi, 1));
  }
  const r = fitAll(best, true); const ybar = mean(y), sst = y.reduce((s, v) => s + (v - ybar) ** 2, 0);
  return { bw: best, names: ['Intercept', ...names], B: r.B, aicc: r.aicc, r2: 1 - r.rss / sst, enp: r.trS, yhat: r.yhat };
}
