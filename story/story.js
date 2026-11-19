// Location Lab · Storytelling with data — Gurugram business case: where should a café chain open its next 10 outlets?
// Data: story/data/gurugram_hex.geojson — 1,646 hexagons (about 0.74 km² each) covering Gurugram district.
//   Buildings, shops and eateries, branded cafés: Overture Maps (release Oct 2026). Built-up land: ESA WorldCover 2021;
//   newly built 2017–2024. Metro stations and cafés: OpenStreetMap (../data/india/). Every number shown is computed here.
//
// URL hash parameters (every view can be reopened exactly from its address):
//   step=brief|data|rank|rates|compare|relate|map|chart|declutter|bigidea|arc|tell|yourturn
//   metric=<field>              rank, map, yourturn (buildings, shops, branded_cafes, osm_cafes, places, built_share,
//                               new_built_share, shops_per_1000_bldg, cafes_per_100_shops)
//   sort=<field>                data        (table shows the top 15 hexagons by this column)
//   measure=cafes|shops         rates       (topic)
//   mode=count|rate             rates
//   x=<field>&y=<field>         relate      (scatter axes)
//   method=quantile|equal|jenks map         (equal counts, equal steps, natural breaks)
//   classes=3..7                map
//   chart=pie|table|bar|dot|map chart
//   stage=1..5                  declutter
//   insight=0..4                bigidea, arc
//   frame=1..6                  tell
//   brief=bank|pharmacy|qcommerce|ev   yourturn
//   view=map|template           yourturn
//   cafes=1                     yourturn: also show the 459 OpenStreetMap cafés and restaurants
//   clean=1                     tell: hides header and side panel (presentation and screenshots)
// window.__storyReady becomes true once the step has drawn and the map is idle.
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const STEPS = [['brief', 'The brief'], ['data', 'Know the data'], ['rank', 'Rank it'], ['rates', 'Counts or rates'], ['compare', 'Benchmark'], ['relate', 'Relationships'], ['map', 'Map classes'], ['chart', 'Pick the chart'], ['declutter', 'Declutter'], ['bigidea', 'Big Idea'], ['arc', 'Story arc'], ['tell', 'Tell it'], ['yourturn', 'Your turn']];
const SRC = 'Source: Overture Maps buildings and places (October 2026); metro stations OpenStreetMap. One hexagon ≈ 0.74 km².';
const SRC_W = 'Source: Overture Maps (October 2026); built-up land ESA WorldCover 2021, change 2017–2024; metro OpenStreetMap. One hexagon ≈ 0.74 km².';
const SRC_O = 'Source: OpenStreetMap contributors (cafés, restaurants, metro stations); Overture Maps (October 2026). One hexagon ≈ 0.74 km².';
const CRED = 'Data: Overture Maps (buildings, places) · metro stations OpenStreetMap';
const CRED_W = 'Data: Overture Maps · ESA WorldCover 2021 · metro stations OpenStreetMap';
const CRED_O = 'Data: OpenStreetMap (cafés, metro stations) · Overture Maps';
const FONT = '"Segoe UI",Calibri,Arial,sans-serif';
const NAVY = '#1e3063', RED = '#c00000', GREY = '#c9ced6', INK = '#14213d', MUTE = '#4a5568', ZERO = '#f1f2f5';
const SEQ = ['#eef1f7', '#d9e0ee', '#bccae2', '#9db1d4', '#7f97c4', '#6280b4', '#4a69a2'];
const ZONES = ['Within 1 km of metro', '1 to 3 km from metro', 'More than 3 km from metro'];
const ZC = { 'Within 1 km of metro': '#4a69a2', '1 to 3 km from metro': '#9db1d4', 'More than 3 km from metro': '#e6eaf2' };
const st = { step: 'brief', metric: 'branded_cafes', sort: 'buildings', measure: 'cafes', mode: 'count', x: 'buildings', y: 'shops', method: 'quantile', classes: 5, chart: 'pie', stage: 1, insight: 3, frame: 1, brief: 'bank', view: 'map', cafes: false, clean: false };
const B = { aud: 'CEO and board of a national café chain', dec: 'Where in Gurugram to open the next 10 outlets', ask: '' };
let geo = null, W = [], N = 0, map = null, T = {}, BB = null, gur = null, popup = null, hoverKey = null, ins = [], attr = null, NAME = [];

// ---------- formatting ----------
const inr = v => Math.round(v).toLocaleString('en-IN');
const lakh = v => v >= 1e7 ? (v / 1e7).toFixed(2) + ' crore' : (v / 1e5).toFixed(1) + ' lakh';
const p1 = v => v.toFixed(1) + '%';
const p0 = v => Math.round(v) + '%';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const listJoin = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
const hname = i => NAME[i];                       // "Sector 25A · hexagon 1"
const aname = i => cap(W[i].area);                // approximate area, no hexagon number
const short = i => { const a = W[i].area.replace(/^near /, ''), m = a.match(/^([\d.]+) km from .+ metro$/); return m ? `${m[1]} km from a metro` : cap(a); };

// ---------- measures ----------
const agg = rows => { const t = { n: rows.length }; ['buildings', 'shops', 'places', 'branded_cafes', 'osm_cafes'].forEach(k => t[k] = rows.reduce((s, r) => s + r[k], 0)); return t; };
const mean = k => W.reduce((s, r) => s + (r[k] || 0), 0) / N;
const M = {
  branded_cafes: { l: 'Branded cafés (seven national chains)', s: 'branded cafés', f: inr, c: () => mean('branded_cafes'), fa: v => v.toFixed(2), cn: 'Average hexagon', src: SRC, cr: CRED },
  shops: { l: 'Shops and eateries', s: 'shops and eateries', f: inr, c: () => mean('shops'), fa: v => v.toFixed(1), cn: 'Average hexagon', src: SRC, cr: CRED },
  buildings: { l: 'Buildings', s: 'buildings', f: inr, c: () => mean('buildings'), cn: 'Average hexagon', src: SRC, cr: CRED },
  places: { l: 'All places (shops, offices, services)', s: 'places', f: inr, c: () => mean('places'), cn: 'Average hexagon', src: SRC, cr: CRED },
  osm_cafes: { l: 'Cafés and restaurants (OpenStreetMap)', s: 'cafés and restaurants', f: inr, c: () => mean('osm_cafes'), fa: v => v.toFixed(2), cn: 'Average hexagon', src: SRC_O, cr: CRED_O },
  built_share: { l: 'Built-up share of the land (%)', s: 'built-up share', f: p1, c: () => mean('built_share'), cn: 'Average hexagon', src: SRC_W, cr: CRED_W },
  new_built_share: { l: 'Land newly built 2017 to 2024 (%)', s: 'newly built share', f: p1, c: () => mean('new_built_share'), cn: 'Average hexagon', src: SRC_W, cr: CRED_W },
  metro_km: { l: 'Distance to the nearest metro station (km)', s: 'distance to metro', f: v => v.toFixed(1) + ' km', c: () => mean('metro_km'), cn: 'Average hexagon', src: SRC, cr: CRED },
  shops_per_1000_bldg: { l: 'Shops per 1,000 buildings', s: 'shops per 1,000 buildings', f: v => v.toFixed(1), c: () => T.shops / T.buildings * 1000, cn: 'Gurugram overall', src: SRC, cr: CRED, note: 'hexagons with 50+ buildings' },
  cafes_per_100_shops: { l: 'Branded cafés per 100 shops', s: 'branded cafés per 100 shops', f: v => v.toFixed(2), c: () => T.branded_cafes / T.shops * 100, cn: 'Gurugram overall', src: SRC, cr: CRED, note: 'hexagons with 20+ shops' },
};
const RANK_M = ['branded_cafes', 'shops', 'buildings', 'osm_cafes', 'new_built_share', 'built_share', 'shops_per_1000_bldg', 'cafes_per_100_shops'];
const REL_M = ['buildings', 'shops', 'branded_cafes', 'osm_cafes', 'places', 'built_share', 'new_built_share', 'metro_km'];
const city = k => M[k].c();
const cityF = k => (M[k].fa || M[k].f)(city(k));
const vals = k => W.map(r => r[k]);
const valid = k => W.map((r, i) => i).filter(i => W[i][k] != null);
const order = (k, desc = true, ids) => (ids || valid(k)).sort((a, b) => desc ? W[b][k] - W[a][k] || a - b : W[a][k] - W[b][k] || a - b);
// ---------- classification ----------
function jenks(data, k) {
  const d = [...data].sort((a, b) => a - b), n = d.length;
  const low = Array.from({ length: n + 1 }, () => Array(k + 1).fill(0)), va = Array.from({ length: n + 1 }, () => Array(k + 1).fill(Infinity));
  for (let j = 1; j <= k; j++) { low[1][j] = 1; va[1][j] = 0; }
  for (let l = 2; l <= n; l++) {
    let s1 = 0, s2 = 0, w = 0, v = 0;
    for (let m = 1; m <= l; m++) {
      const i3 = l - m + 1, x = d[i3 - 1]; s2 += x * x; s1 += x; w++; v = s2 - s1 * s1 / w; const i4 = i3 - 1;
      if (i4 !== 0) for (let j = 2; j <= k; j++) if (va[l][j] >= v + va[i4][j - 1]) { low[l][j] = i3; va[l][j] = v + va[i4][j - 1]; }
    }
    low[l][1] = 1; va[l][1] = v;
  }
  const br = Array(k + 1); br[k] = d[n - 1]; br[0] = d[0]; let kk = n;
  for (let j = k; j >= 2; j--) { const id = low[kk][j] - 2; br[j - 1] = d[id]; kk = low[kk][j] - 1; }
  return br; // br[j] = upper end of group j
}
function classify(v, method, k) {
  const s = [...v].sort((a, b) => a - b), lo = s[0], hi = s[s.length - 1];
  let cls, bounds = null;
  if (method === 'equal') { const w = (hi - lo) / k; cls = v.map(x => Math.min(k - 1, Math.floor((x - lo) / w + 1e-9))); bounds = Array.from({ length: k }, (_, j) => [lo + j * w, lo + (j + 1) * w]); }
  else if (method === 'jenks') { const br = jenks(v, k); cls = v.map(x => { let j = 1; while (j < k && x > br[j]) j++; return j - 1; }); }
  else { const th = Array.from({ length: k - 1 }, (_, j) => s[Math.floor((j + 1) * s.length / k)]); cls = v.map(x => th.filter(t => x >= t).length); }
  const groups = Array.from({ length: k }, (_, j) => v.map((x, i) => i).filter(i => cls[i] === j));
  const ranges = groups.map((g, j) => bounds ? bounds[j] : g.length ? [Math.min(...g.map(i => v[i])), Math.max(...g.map(i => v[i]))] : null);
  return { cls, groups, ranges, k };
}
const pal = k => Array.from({ length: k }, (_, j) => SEQ[Math.round(j * (SEQ.length - 1) / (k - 1))]);
const METH = { quantile: 'Equal counts (quantiles)', equal: 'Equal steps (equal intervals)', jenks: 'Natural breaks (Jenks)' };
// ---------- stats ----------
function corr(x, y) { const n = x.length, mx = x.reduce((a, b) => a + b) / n, my = y.reduce((a, b) => a + b) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return { r: sxy / Math.sqrt(sxx * syy), b: sxy / sxx, a: my - sxy / sxx * mx }; }
const strength = r => { const a = Math.abs(r); return a < 0.2 ? 'almost no' : a < 0.4 ? 'a weak' : a < 0.7 ? 'a moderate' : 'a strong'; };
const rtxt = r => (r < 0 ? '−' : '') + Math.abs(r).toFixed(2);
function hav(a, b) { const R = 6371008.8, t = Math.PI / 180, p1 = a[1] * t, p2 = b[1] * t, dp = p2 - p1, dl = (b[0] - a[0]) * t; const x = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }
// ---------- SVG helpers ----------
const cvs = document.createElement('canvas').getContext('2d');
function tw(s, size, weight = 400) { cvs.font = `${weight} ${size}px ${FONT}`; return cvs.measureText(s).width; }
function wrap(s, size, maxW, weight = 400) { const words = String(s).split(' '), out = []; let line = ''; words.forEach(w => { const t = line ? line + ' ' + w : w; if (tw(t, size, weight) > maxW && line) { out.push(line); line = w; } else line = t; }); if (line) out.push(line); return out; }
function tx(x, y, s, o = {}) { return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${o.size || 15}" font-weight="${o.weight || 400}" fill="${o.fill || INK}" text-anchor="${o.anchor || 'start'}"${o.extra || ''}>${esc(s)}</text>`; }
function svgOpen(w, h) { return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="font-family:${FONT}" xmlns="http://www.w3.org/2000/svg">`; }
function header(w, title, sub, x = 28, y = 40, tsize = 26) {
  let s = '', yy = y; wrap(title, tsize, w - x * 2, 700).forEach(l => { s += tx(x, yy, l, { size: tsize, weight: 700, fill: NAVY }); yy += tsize + 6; });
  if (sub) { yy += 2; wrap(sub, 17, w - x * 2).forEach(l => { s += tx(x, yy, l, { size: 17, fill: MUTE }); yy += 23; }); }
  return { s, y: yy };
}
function keyRow(x, y, items, size = 15) { let s = '', xx = x; items.forEach(([c, l, kind]) => { if (kind === 'line') s += `<line x1="${xx}" y1="${y - 5}" x2="${xx + 22}" y2="${y - 5}" stroke="${c}" stroke-width="2.5" stroke-dasharray="6 4"/>`; else if (kind === 'dot') s += `<circle cx="${xx + 9}" cy="${y - 5}" r="8" fill="${c}"/>`; else s += `<rect x="${xx}" y="${y - 13}" width="22" height="15" rx="3" fill="${c}" stroke="rgba(0,0,0,.25)"/>`; s += tx(xx + 30, y, l, { size }); xx += 30 + tw(l, size) + 26; }); return s; }
const footer = (w, h, src = SRC, x = 28) => { const ls = wrap(src, 14, w - x - 20); return ls.map((l, j) => tx(x, h - 14 - (ls.length - 1 - j) * 18, l, { size: 14, fill: MUTE })).join(''); };
function niceMax(v) { const p = 10 ** Math.floor(Math.log10(v)), m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; }
function ticks(lo, hi, n = 5) { const step = niceMax((hi - lo) / n), out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10)); return out; }
const box = () => { const el = $('#chart'); return [el.clientWidth, el.clientHeight]; };
// horizontal bar chart used by several steps
function hbar(o) {
  const [w, h] = o.size || box(); let s = svgOpen(w, h);
  const hd = header(w, o.title, o.sub, 28, o.y0 || 40); s += hd.s; let y = hd.y + 6;
  if (o.subHTML) { s += `<foreignObject x="20" y="${y - 22}" width="${w - 40}" height="44"><div xmlns="http://www.w3.org/1999/xhtml" class="st-verdict" style="margin:0">${o.subHTML}</div></foreignObject>`; y += 30; }
  if (o.key) { s += keyRow(28, y + 8, o.key); y += 34; }
  const top = y + (o.avg ? 26 : 6), bottom = 64, n = o.rows.length, rowH = (h - top - bottom) / n, fs = Math.max(14, Math.min(17, rowH * 0.56));
  let labW = Math.max(...o.rows.map(r => tw(r.label, fs, r.bold ? 700 : 400))) + 14; const valW = Math.max(...o.rows.map(r => tw(o.fmt(r.v), fs, 700))) + 16;
  let lfs = fs; if (labW > w * 0.5) { lfs = Math.max(13.5, fs * (w * 0.5) / labW); labW = w * 0.5 + 14; }
  const x0 = 28 + labW, bw = w - x0 - valW - 30 - (o.dots ? 12 : 0), mx = o.max || Math.max(...o.rows.map(r => r.v), o.avg ? o.avg.v : 0), sx = v => v / mx * bw;
  if (o.avg) { const ax = x0 + sx(o.avg.v); s += `<line x1="${ax}" y1="${top - 8}" x2="${ax}" y2="${top + n * rowH}" stroke="${INK}" stroke-width="2" stroke-dasharray="6 4"/>` + tx(ax, top - 12, o.avg.label, { size: 15, weight: 700, anchor: ax > w * 0.7 ? 'end' : 'middle' }); }
  o.rows.forEach((r, k) => {
    const yy = top + k * rowH, th = rowH * 0.7;
    s += `<g data-w="${r.i}">` + tx(x0 - 10, yy + rowH / 2 + fs * 0.35, r.label, { size: lfs, anchor: 'end', weight: r.bold ? 700 : 400 }) +
      (o.dots ? `<line x1="${x0}" y1="${yy + rowH / 2}" x2="${x0 + sx(r.v)}" y2="${yy + rowH / 2}" stroke="#d5dae2" stroke-width="2"/><circle cx="${x0 + sx(r.v)}" cy="${yy + rowH / 2}" r="${Math.min(9, th / 2).toFixed(1)}" fill="${r.col}"/>` : `<rect x="${x0}" y="${(yy + (rowH - th) / 2).toFixed(1)}" width="${Math.max(1, sx(r.v)).toFixed(1)}" height="${th.toFixed(1)}" fill="${r.col}" rx="2"/>`) +
      tx(x0 + sx(r.v) + (o.dots ? 14 : 6), yy + rowH / 2 + fs * 0.35, o.fmt(r.v), { size: fs, weight: r.bold ? 700 : 400, extra: ' paint-order="stroke" stroke="#fff" stroke-width="4"' }) + '</g>';
  });
  s += footer(w, h, o.src) + '</svg>';
  return s;
}

const tickF = (k, t) => /share|pct/.test(k) ? (Number.isInteger(t) ? t : t.toFixed(1)) + '%' : Number.isInteger(t) ? inr(t) : t.toFixed(1);
function svgMap(w, h, fill, stroke, pad = 6, sw = 0.3) {
  const [x0, y0, x1, y1] = BB, k = Math.cos(28.37 * Math.PI / 180), sc = Math.min((w - 2 * pad) / ((x1 - x0) * k), (h - 2 * pad) / (y1 - y0));
  const ox = (w - (x1 - x0) * k * sc) / 2, oy = (h - (y1 - y0) * sc) / 2, P = c => `${(ox + (c[0] - x0) * k * sc).toFixed(1)},${(oy + (y1 - c[1]) * sc).toFixed(1)}`;
  return geo.features.map((f, i) => `<path d="M${f.geometry.coordinates[0].map(P).join('L')}Z" fill="${fill(i)}" stroke="${stroke ? stroke(i) : fill(i)}" stroke-width="${sw}"/>`).join('');
}

// ---------- map ----------
const fc = feats => ({ type: 'FeatureCollection', features: feats });
function paint(colFn, opFn) { geo.features.forEach((f, i) => { f.properties.col = colFn(i); f.properties.op = opFn ? opFn(i) : 0.82; }); map.getSource('w').setData(geo); }
function setHL(ids, color = RED, width = 3) { map.getSource('hl').setData(fc(ids.map(i => geo.features[i]))); map.setPaintProperty('hl', 'line-color', color); map.setPaintProperty('hl', 'line-width', width); }
function setLabels(ids, color = INK, txt = short) { ids = ids.filter((i, q, a) => a.findIndex(j => txt(j) === txt(i)) === q); map.getSource('labs').setData(fc(ids.map((i, q) => ({ type: 'Feature', properties: { lab: txt(i), tc: typeof color === 'function' ? color(i) : color, pri: q }, geometry: { type: 'Point', coordinates: [W[i].lon, W[i].lat] } })))); }
function setCircles(feats) { map.getSource('pc').setData(fc(feats)); }
function circlesFor(k, maxR, colFn, ids) { const mx = Math.max(...vals(k)); return (ids || W.map((r, i) => i)).filter(i => W[i][k] > 0).sort((a, b) => W[b][k] - W[a][k]).map(i => ({ type: 'Feature', properties: { r: Math.max(3, maxR * Math.sqrt(W[i][k] / mx)), c: colFn(i) }, geometry: { type: 'Point', coordinates: [W[i].lon, W[i].lat] } })); }
function circleLegend(k, maxR, title, col = NAVY) { const mx = Math.max(...vals(k)); const ex = [...new Set([Math.max(1, Math.round(mx / 5)), Math.round(mx / 2), mx])]; return `<b>${title}</b>` + ex.map(v => { const d = Math.max(6, 2 * maxR * Math.sqrt(v / mx)); return `<div class="sw"><i class="ring" style="width:${d.toFixed(0)}px;height:${d.toFixed(0)}px;background:${col};opacity:.55"></i>${inr(v)} per hexagon</div>`; }).join(''); }
function legend(html, src = SRC) { const L = $('#legend'); if (!html) { L.hidden = true; return; } L.innerHTML = html + METRO_KEY + `<div class="src">${src}</div>`; L.hidden = false; }
const METRO_KEY = `<div class="sw"><i class="ring" style="background:#fff;border:3px solid ${NAVY};width:15px;height:15px"></i>Metro station</div>`;
const sw = (c, l, cls = '') => `<div class="sw"><i class="${cls}" style="background:${c}"></i>${l}</div>`;
function credits(txt) { if (attr) map.removeControl(attr); attr = new maplibregl.AttributionControl({ compact: false, customAttribution: txt }); map.addControl(attr, 'bottom-right'); }
let pendingFit = null;
function fit(ids, padding = 30, dur = 0) { pendingFit = [ids, padding, dur]; }
function doFit() {
  if (!pendingFit) return; let [ids, padding, dur] = pendingFit; pendingFit = null;
  if (typeof padding === 'number') { padding = { top: padding, right: padding + 30, bottom: padding, left: padding }; const L = $('#legend'); if (!L.hidden) padding.bottom = Math.min(L.offsetHeight + 40, map.getContainer().clientHeight * 0.55); }
  let b = null; (ids && ids.length ? ids : W.map((r, i) => i)).forEach(i => geo.features[i].geometry.coordinates[0].forEach(c => { if (!b) b = [c[0], c[1], c[0], c[1]]; b = [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])]; }));
  map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding, duration: dur, maxZoom: 13.2 });
}
function chor(k, method = 'jenks', K = 5) {
  const ids = valid(k), zeros = ids.filter(i => W[i][k] === 0), zsep = zeros.length / ids.length >= 0.2, cl = zsep ? ids.filter(i => W[i][k] > 0) : ids;
  const c = classify(cl.map(i => W[i][k]), method, K), cls = Array(N).fill(-2); if (zsep) zeros.forEach(i => cls[i] = -1); cl.forEach((i, j) => cls[i] = c.cls[j]);
  return { cls, groups: c.groups.map(g => g.map(j => cl[j])), ranges: c.ranges, K, P: pal(K), nz: zsep ? zeros.length : 0, nnull: N - ids.length };
}
function paintChor(C, hiOp = 0.82) { paint(i => C.cls[i] >= 0 ? C.P[C.cls[i]] : ZERO, i => C.cls[i] >= 0 ? hiOp : 0.45); }
const rng = (f, r) => f(r[0]) === f(r[1]) ? f(r[0]) : `${f(r[0])} to ${f(r[1])}`;
const hx = n => `${inr(n)} hexagon${n === 1 ? '' : 's'}`;
function chorLegend(k, C, title) {
  const f = M[k].f; return `<b>${title || M[k].l}</b>` + [...C.ranges.keys()].reverse().map(j => sw(C.P[j], C.ranges[j] ? `${rng(f, C.ranges[j])} · ${hx(C.groups[j].length)}` : 'no hexagons')).join('') +
    (C.nz ? sw(ZERO, `None · ${hx(C.nz)}`) : '') + (C.nnull ? sw(ZERO, `Too few to compute · ${hx(C.nnull)}`) : '');
}

// ---------- layout + routing ----------
function setLayout(l, cw = '58%') { const s = $('#stage'); s.dataset.layout = l; s.style.setProperty('--cw', cw); $('#chart').innerHTML = ''; if (map) map.resize(); }
const PARAMS = { brief: [], data: ['sort'], rank: ['metric'], rates: ['measure', 'mode'], compare: [], relate: ['x', 'y'], map: ['metric', 'method', 'classes'], chart: ['chart'], declutter: ['stage'], bigidea: ['insight'], arc: ['insight'], tell: ['frame'], yourturn: ['brief', 'metric', 'view', 'cafes'] };
function readHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  if (q.has('step') && PARAMS[q.get('step')]) st.step = q.get('step');
  ['metric', 'sort', 'measure', 'mode', 'x', 'y', 'method', 'chart', 'view', 'brief'].forEach(k => { if (q.has(k)) st[k] = q.get(k); });
  ['classes', 'stage', 'insight', 'frame'].forEach(k => { if (q.has(k)) st[k] = +q.get(k); });
  if (q.has('cafes')) st.cafes = q.get('cafes') === '1';
  if (!M[st.metric]) st.metric = 'branded_cafes'; if (!BRIEFS[st.brief]) st.brief = 'bank';
  st.classes = Math.max(3, Math.min(7, st.classes || 5)); st.stage = Math.max(1, Math.min(5, st.stage || 1)); st.frame = Math.max(1, Math.min(6, st.frame || 1)); st.insight = Math.max(0, Math.min(4, st.insight || 0));
  st.clean = q.get('clean') === '1';
}
function writeHash() { const q = new URLSearchParams(); q.set('step', st.step); PARAMS[st.step].forEach(k => q.set(k, k === 'cafes' ? (st.cafes ? 1 : 0) : st[k])); if (st.clean && st.step === 'tell') q.set('clean', '1'); history.replaceState(null, '', '#' + q.toString()); }
let tok = 0;
function settle() {
  const t = ++tok; window.__storyReady = false;
  const done = () => document.fonts.ready.then(() => setTimeout(() => { if (t === tok) window.__storyReady = true; }, 300));
  if ($('#stage').dataset.layout !== 'chart') { map.resize(); map.once('idle', done); map.triggerRepaint(); } else requestAnimationFrame(done);
}
function show(step) {
  st.step = step; document.body.classList.toggle('clean', st.clean && step === 'tell');
  $$('#tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.t === step));
  $$('.ga-pane').forEach(p => p.hidden = p.id !== 'p-' + step);
  legend(null); $('#tellcard').hidden = true; if (popup) popup.remove(); hoverKey = null;
  setHL([]); setCircles([]); setLabels([]); map.getSource('hov').setData(fc([])); map.setLayoutProperty('gc', 'visibility', 'none'); map.setLayoutProperty('w', 'visibility', 'visible');
  pendingFit = null; credits(CRED); R[step](); map.resize(); doFit(); writeHash(); settle();
}
function segOn(id, v) { $$(`#${id} button`).forEach(b => b.classList.toggle('on', b.dataset.v == v)); }
function seg(id, key, num) { $$(`#${id} button`).forEach(b => b.onclick = () => { st[key] = num ? +b.dataset.v : b.dataset.v; show(st.step); }); }
function hover(i) {
  map.getSource('hov').setData(fc(i == null ? [] : [geo.features[i]]));
  $$('#chart [data-w]').forEach(e => e.classList.toggle('hov', e.dataset.w == i));
  $$('#chart g[data-w]').forEach(e => e.style.opacity = i == null || e.dataset.w == i ? 1 : 0.45);
}
function bindHover() { $$('#chart [data-w]').forEach(g => { g.onmouseenter = () => hover(+g.dataset.w); g.onmouseleave = () => hover(null); }); }

// ================= steps =================
const R = {};
R.brief = () => {
  setLayout('split', '46%');
  $('#b-aud').value = B.aud; $('#b-dec').value = B.dec; $('#b-ask').value = B.ask;
  paint(() => '#dfe5f1', () => 0.6); fit(null, 24); credits(CRED);
  $('#chart').innerHTML = `<div class="st-panel"><div class="st-h1">The brief</div><div class="st-h2">Three questions to answer before you open the data</div>
   <div class="st-cards">
    <div class="st-card"><h4>1 · Audience: who will listen?</h4><div class="big">${esc(B.aud)}</div></div>
    <div class="st-card"><h4>2 · Decision: what must they decide?</h4><div class="big">${esc(B.dec)}</div></div>
    <div class="st-card acc"><h4>3 · Ask: what do you want them to do?</h4><div class="big">${esc(B.ask)}</div></div>
   </div><div class="st-src">The map shows Gurugram district cut into ${inr(N)} equal hexagons. The data come next, in step 1.<br>${SRC}</div></div>`;
  legend(`<b>Gurugram district</b>` + sw('#dfe5f1', `One hexagon, about 0.74 km² (${inr(N)} in all)`));
};

const TCOLS = [['area', 'Hexagon (approximate area)'], ['metro_km', 'Metro (km)', v => v.toFixed(1)], ['buildings', 'Buildings', inr], ['shops', 'Shops and eateries', inr], ['branded_cafes', 'Branded cafés', inr], ['built_share', 'Built-up land', p1], ['new_built_share', 'Newly built 2017–24', p1]];
R.data = () => {
  setLayout('chart'); const k = TCOLS.some(c => c[0] === st.sort) && st.sort !== 'area' ? st.sort : 'buildings'; const asc = k === 'metro_km';
  const ix = order(k, !asc).slice(0, 15);
  $('#chart').innerHTML = `<div class="st-panel"><div class="st-h1">One row = one hexagon: ${inr(N)} rows</div><div class="st-h2">The 15 hexagons with the ${asc ? 'shortest distance to a metro station' : 'most ' + (TCOLS.find(c => c[0] === k)[1]).toLowerCase()}. Click a heading to re-rank.</div>
  <table class="st-tbl st-dt"><thead><tr>${TCOLS.map(c => `<th data-k="${c[0]}" class="${c[2] ? 'n' : ''} ${c[0] === k ? 'on' : ''}">${c[1]}${c[0] === k ? (asc ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
  <tbody>${ix.map(i => `<tr data-w="${i}">${TCOLS.map(c => c[0] === 'area' ? `<td style="font-weight:600">${esc(hname(i))}</td>` : `<td class="n">${c[2](W[i][c[0]])}</td>`).join('')}</tr>`).join('')}
  <tr style="font-weight:700"><td>Gurugram district, ${inr(N)} hexagons</td><td class="n">avg ${city('metro_km').toFixed(1)}</td><td class="n">${inr(T.buildings)}</td><td class="n">${inr(T.shops)}</td><td class="n">${inr(T.branded_cafes)}</td><td class="n">avg ${p1(city('built_share'))}</td><td class="n">avg ${p1(city('new_built_share'))}</td></tr></tbody></table>
  <div class="st-src">“Hexagon 1, 2 …” number hexagons that share an area name. Area names are approximate. ${SRC_W}</div></div>`;
  { const p = $('#chart .st-panel'), tb = $('#chart .st-tbl'); let pad = 8; while (p.scrollHeight > p.clientHeight + 1 && pad > 1) { pad -= 1; tb.querySelectorAll('td').forEach(td => td.style.padding = pad + 'px 6px'); } }
  $$('#chart th').forEach(th => th.onclick = () => { if (th.dataset.k !== 'area') { st.sort = th.dataset.k; show('data'); } });
  bindHover();
  $('#data-tot').innerHTML = `<h3>Gurugram in one line</h3><b>${inr(N)}</b> hexagons, <b>${inr(T.buildings)}</b> buildings (${lakh(T.buildings)}), <b>${inr(T.shops)}</b> shops and eateries, <b>${inr(T.branded_cafes)}</b> branded cafés in <b>${W.filter(r => r.branded_cafes > 0).length}</b> hexagons, ${inr(T.osm_cafes)} cafés and restaurants on OpenStreetMap.`;
};

R.rank = () => {
  setLayout('split', '50%'); const k = st.metric, m = M[k], all = order(k), ix = all.slice(0, 15), top = ix.slice(0, 3);
  segOn('rank-m', k);
  const sub = `${hname(ix[0])} leads with ${m.f(W[ix[0]][k])}. ${cityName(k)}: ${cityF(k)}${m.note ? ' (' + m.note + ')' : ''}.`;
  $('#chart').innerHTML = hbar({ title: `${m.l}: the top 15 of ${inr(all.length)} hexagons`, sub, rows: ix.map(i => ({ i, label: hname(i), v: W[i][k], col: top.includes(i) ? RED : '#9db1d4', bold: top.includes(i) })), fmt: m.f, avg: { v: city(k), label: `${cityName(k)}: ${cityF(k)}` }, key: [[RED, 'Top three'], ['#9db1d4', 'Next twelve'], [INK, cityName(k), 'line']], src: m.src });
  const C = chor(k, 'jenks', 5); paintChor(C); setHL(ix); setLabels(top, RED); fit(ix, 50); hoverKey = k; credits(m.cr);
  legend(chorLegend(k, C, m.l + ' (natural breaks)') + sw('#fff;border:3px solid ' + RED, 'Top 15, outlined'), m.src);
  const share = ix.reduce((s, i) => s + W[i][k], 0) / all.reduce((s, i) => s + W[i][k], 0) * 100;
  $('#rank-out').innerHTML = `<div class="ga-big">${m.f(W[ix[0]][k])}</div>${esc(hname(ix[0]))} has the most ${m.s}. ${/per|share/.test(k) ? '' : `The top 15 hexagons (${p1(15 / N * 100)} of the district) hold <b>${p1(share)}</b> of all ${m.s}.`}`;
  bindHover();
};
const cityName = k => M[k].cn;

const RATES = { cafes: { count: 'branded_cafes', rate: 'cafes_per_100_shops' }, shops: { count: 'shops', rate: 'shops_per_1000_bldg' } };
function ratesInfo(t) {
  const a = RATES[t], ci = order(a.count)[0];
  if (t === 'cafes') { const ri = order(a.rate)[0]; return { ci, ri, c: `By count: ${hname(ci)}, ${W[ci].branded_cafes} branded cafés.`, r: `By rate: ${hname(ri)}, ${W[ri].cafes_per_100_shops.toFixed(2)} per 100 shops (Gurugram overall: ${city(a.rate).toFixed(2)}).` }; }
  const dense = W.map((r, i) => i).filter(i => W[i].buildings >= 1000 && W[i].metro_km <= 10), lowI = order('shops_per_1000_bldg', false, dense.slice()), under = dense.filter(i => W[i].shops_per_1000_bldg < city('shops_per_1000_bldg') / 2).length;
  return { ci, ri: lowI[0], dense, lowI, under, c: `By count: ${hname(ci)}, ${inr(W[ci].shops)} shops and eateries.`, r: `By rate: ${under} of the ${dense.length} dense urban hexagons (1,000+ buildings, within 10 km of a metro) have under half Gurugram's ${city(a.rate).toFixed(1)} shops per 1,000 buildings.` };
}
R.rates = () => {
  setLayout('split', '52%'); segOn('rates-t', st.measure); segOn('rates-m', st.mode);
  const a = RATES[st.measure], I = ratesInfo(st.measure), k = st.mode === 'count' ? a.count : a.rate, m = M[k];
  let ix, title, sub;
  if (st.mode === 'count') { ix = order(k).slice(0, 15); title = `${m.l}: most per hexagon`; sub = I.c + ' ' + I.r.replace('By rate:', 'By rate, the picture changes:'); }
  else if (st.measure === 'cafes') { ix = order(k).slice(0, 15); title = `${m.l}: highest (hexagons with 20+ shops)`; sub = I.r + ' ' + I.c.replace('By count', 'By count'); }
  else { ix = I.lowI.slice(0, 15); title = `Fewest shops per 1,000 buildings: 15 dense urban hexagons`; sub = I.r + ' ' + I.c; }
  const top = ix.slice(0, 3);
  $('#chart').innerHTML = hbar({ title, sub, rows: ix.map(i => ({ i, label: hname(i), v: W[i][k], col: top.includes(i) ? RED : '#9db1d4', bold: top.includes(i) })), fmt: m.f, avg: { v: city(k), label: `${cityName(k)}: ${cityF(k)}` }, key: [[RED, st.mode === 'rate' && st.measure === 'shops' ? 'Three most under-served' : 'Top three'], ['#9db1d4', 'Next twelve'], [INK, cityName(k), 'line']], max: st.mode === 'rate' && st.measure === 'shops' ? city(k) * 1.15 : null });
  if (st.mode === 'count') { paint(() => ZERO, () => 0.4); setCircles(circlesFor(k, 26, i => top.includes(i) ? RED : NAVY)); legend(circleLegend(k, 26, m.l + ': circle area') + sw(RED, 'Top three', 'ring') + sw(NAVY, 'Other hexagons', 'ring')); }
  else { const C = chor(k, 'jenks', 5); paintChor(C); legend(chorLegend(k, C, m.l + ' (natural breaks)') + sw('#fff;border:3px solid ' + RED, 'The 15 in the chart, outlined')); }
  setHL(ix); setLabels(top, RED); fit(ix, 50); hoverKey = k;
  $('#rates-out').innerHTML = `<p><b>${esc(I.c)}</b></p><p><b>${esc(I.r)}</b></p><p class="ga-note">${st.measure === 'cafes' ? 'Cafés per 100 shops shows where cafés are crowded among other shops, not where the customers live.' : 'Thousands of homes but few shops: under-served demand that a count of shops hides.'}</p>`;
  bindHover();
};

function zoneStats() {
  return ZONES.map(z => { const ids = W.map((r, i) => i).filter(i => W[i].zone === z), t = agg(ids.map(i => W[i])); return { z, ids, land: ids.length / N * 100, buildings: t.buildings / T.buildings * 100, shops: t.shops / T.shops * 100, cafes: t.branded_cafes / T.branded_cafes * 100, nc: t.branded_cafes }; });
}
const ZB = [['land', 'Land'], ['buildings', 'Buildings'], ['shops', 'Shops and eateries'], ['cafes', 'Branded cafés']];
function zoneBars(x0, y0, w, h, col, opt = {}) {
  const Z = zoneStats(); let s = ''; const gh = h / 3, rh = (gh - 34) / 4, lw = 190, bw = w - lw - 80;
  Z.forEach((z, g) => {
    const gy = y0 + g * gh; s += tx(x0, gy + 22, z.z, { size: 20, weight: 700, fill: NAVY });
    ZB.forEach(([key, lab], q) => { const yy = gy + 32 + q * rh, v = z[key], c = col(g, key); s += tx(x0 + lw - 10, yy + rh * 0.62, lab, { size: 16, anchor: 'end', weight: c === RED ? 700 : 400 }) + `<rect x="${x0 + lw}" y="${yy + rh * 0.12}" width="${Math.max(1.5, bw * v / 100)}" height="${rh * 0.76}" rx="2" fill="${c}"/>` + tx(x0 + lw + bw * v / 100 + 8, yy + rh * 0.62, p1(v), { size: 16, weight: c === RED ? 700 : 400 }); });
  });
  return s;
}
const ZCOL = { land: '#d5dae2', buildings: '#9db1d4', shops: '#4a69a2', cafes: RED };
R.compare = () => {
  setLayout('chart'); const [w, h] = box(), Z = zoneStats(), z1 = Z[0];
  let s = svgOpen(w, h); const hd = header(w, `Within 1 km of a metro: ${p1(z1.land)} of the land, ${p1(z1.cafes)} of branded cafés`, `Each zone's share of Gurugram's land, buildings, shops and branded cafés. Within 1 km: ${p1(z1.buildings)} of buildings and ${p1(z1.shops)} of shops. More than 3 km away: ${p1(Z[2].buildings)} of buildings but ${p1(Z[2].cafes)} of cafés.`); s += hd.s;
  let y0 = hd.y + 6; s += keyRow(28, y0 + 8, ZB.map(([k, l]) => [ZCOL[k], l + ' (% of Gurugram)'])); y0 += 22;
  const mapW = Math.min(330, w * 0.28);
  s += zoneBars(28, y0, w - mapW - 70, h - y0 - 46, (g, k) => ZCOL[k]);
  const mx = w - mapW - 16, mh = Math.min(mapW * 0.8, h - y0 - 160); s += `<g transform="translate(${mx},${y0 + 30})">` + svgMap(mapW, mh, i => ZC[W[i].zone], null, 2, 0.3) + '</g>';
  ZONES.forEach((z, r) => { s += `<rect x="${mx + 4}" y="${y0 + mh + 50 + r * 26}" width="22" height="16" rx="3" fill="${ZC[z]}" stroke="rgba(0,0,0,.3)"/>` + tx(mx + 34, y0 + mh + 64 + r * 26, z, { size: 15 }); });
  s += tx(mx, y0 + 18, 'The three zones', { size: 17, weight: 700, fill: NAVY });
  s += footer(w, h) + '</svg>'; $('#chart').innerHTML = s;
  $('#compare-out').innerHTML = `<table style="width:100%"><tr><th></th><th class="n">Land</th><th class="n">Buildings</th><th class="n">Cafés</th></tr>${Z.map(z => `<tr><td>${z.z}</td><td class="n">${p1(z.land)}</td><td class="n">${p1(z.buildings)}</td><td class="n"><b>${p1(z.cafes)}</b></td></tr>`).join('')}</table>`;
};

R.relate = () => {
  setLayout('chart'); $('#rel-x').value = st.x; $('#rel-y').value = st.y;
  const [w, h] = box(), X = vals(st.x), Y = vals(st.y), { r, a, b } = corr(X, Y), mx = M[st.x], my = M[st.y];
  const dir = r < 0 ? 'negative' : 'positive', word = strength(r);
  const title = Math.abs(r) < 0.2 ? `Almost no link: r = ${rtxt(r)}` : `${cap(word)} ${dir} link: r = ${rtxt(r)}`;
  const sub = Math.abs(r) < 0.2 ? `${cap(my.s)} and ${mx.s} hardly move together across ${inr(N)} hexagons${st.x === 'new_built_share' ? ': where Gurugram is building fastest, shops and cafés have not followed yet' : ''}.` : `Hexagons with more ${mx.s} tend to have ${r < 0 ? 'fewer' : 'more'} ${my.s}. Dots far below the line have fewer ${my.s} than their ${mx.s} would suggest: possible white space.`;
  let s = svgOpen(w, h); const hd = header(w, title, sub); s += hd.s;
  const keyY = hd.y + 14, L = 100, Rr = w - 40, Tt = keyY + 56, Bb = h - 128;
  const ext = (v) => { const lo = Math.min(...v), hi = Math.max(...v), p = (hi - lo) * 0.04; return [Math.max(lo - p, lo >= 0 ? 0 : -Infinity), hi + p]; };
  const [x0, x1] = ext(X), [y0, y1] = ext(Y), sx = v => L + (v - x0) / (x1 - x0) * (Rr - L), sy = v => Bb - (v - y0) / (y1 - y0) * (Bb - Tt);
  ticks(x0, x1, 6).forEach(t => { if (t < x0 || t > x1) return; s += `<line x1="${sx(t)}" y1="${Tt}" x2="${sx(t)}" y2="${Bb}" stroke="#eceff4"/>` + tx(sx(t), Bb + 22, tickF(st.x, t), { size: 15, fill: MUTE, anchor: 'middle' }); });
  ticks(y0, y1, 5).forEach(t => { if (t < y0 || t > y1) return; s += `<line x1="${L}" y1="${sy(t)}" x2="${Rr}" y2="${sy(t)}" stroke="#eceff4"/>` + tx(L - 10, sy(t) + 5, tickF(st.y, t), { size: 15, fill: MUTE, anchor: 'end' }); });
  s += `<line x1="${L}" y1="${Bb}" x2="${Rr}" y2="${Bb}" stroke="#9aa3b2"/><line x1="${L}" y1="${Tt}" x2="${L}" y2="${Bb}" stroke="#9aa3b2"/>`;
  s += tx((L + Rr) / 2, Bb + 52, mx.l + ', per hexagon →', { size: 17, weight: 700, anchor: 'middle' }) + tx(28, Tt - 16, '↑ ' + my.l + ', per hexagon', { size: 17, weight: 700 });
  const clip = (x, y) => [Math.max(x0, Math.min(x1, x)), y];
  const ya = a + b * x0, yb = a + b * x1; s += `<line x1="${sx(x0)}" y1="${sy(Math.max(y0, Math.min(y1, ya)))}" x2="${sx(x1)}" y2="${sy(Math.max(y0, Math.min(y1, yb)))}" stroke="${NAVY}" stroke-width="2.5" stroke-dasharray="8 5"/>`;
  const resid = W.map((_, i) => ({ i, e: Y[i] - (a + b * X[i]) }));
  const below = [...resid].sort((p, q) => p.e - q.e).slice(0, 3).map(p => p.i), above = [...resid].sort((p, q) => q.e - p.e).slice(0, 2).map(p => p.i);
  const weak = Math.abs(r) < 0.2, oy = order(st.y), ox = order(st.x); const lab = weak ? [...new Set([oy[0], oy[1], ox[0], ox[1]])] : [...new Set([...below, ...above, ox[0], oy[0]])];
  W.forEach((_, i) => { if (!lab.includes(i)) s += `<circle cx="${sx(X[i]).toFixed(1)}" cy="${sy(Y[i]).toFixed(1)}" r="3.6" fill="${NAVY}" fill-opacity="0.28"/>`; });
  lab.forEach(i => { s += `<circle data-w="${i}" cx="${sx(X[i]).toFixed(1)}" cy="${sy(Y[i]).toFixed(1)}" r="7" fill="${!weak && below.includes(i) ? RED : '#7a0000'}" stroke="#fff" stroke-width="1.5"/>`; });
  const placed = [], fs = 15;
  lab.forEach(i => {
    const cx = sx(X[i]), cy = sy(Y[i]), t = hname(i), tw0 = tw(t, fs, 700);
    const cand = [[cx + 11, cy + 5, 'start'], [cx - 11, cy + 5, 'end'], [cx, cy - 13, 'middle'], [cx, cy + 24, 'middle'], [cx + 9, cy - 12, 'start'], [cx - 9, cy - 12, 'end'], [cx - 9, cy + 22, 'end'], [cx + 9, cy + 22, 'start']];
    const bx = ([x, y, an]) => { const xb = an === 'start' ? x : an === 'end' ? x - tw0 : x - tw0 / 2; return [xb - 2, y - fs, xb + tw0 + 2, y + 4]; };
    const ok = c => { const q = bx(c); if (q[0] < L + 2 || q[2] > Rr || q[1] < Tt - 4 || q[3] > Bb - 2) return false; return !placed.some(p => !(q[2] < p[0] || q[0] > p[2] || q[3] < p[1] || q[1] > p[3])); };
    const c = cand.find(ok) || cand[0]; placed.push(bx(c)); s += tx(c[0], c[1], t, { size: fs, weight: 700, anchor: c[2], fill: '#7a0000', extra: ' paint-order="stroke" stroke="#fff" stroke-width="4"' });
  });
  s += keyRow(28, keyY + 9, weak ? [['rgba(30,48,99,.35)', `One hexagon (${inr(N)} in all)`, 'dot'], ['#7a0000', 'Named: highest on either axis', 'dot'], [NAVY, 'Trend line', 'line']] : [['rgba(30,48,99,.35)', `One hexagon (${inr(N)} in all)`, 'dot'], [RED, 'Named: furthest below the trend', 'dot'], ['#7a0000', 'Named: above the trend or highest', 'dot'], [NAVY, 'Trend line', 'line']]);
  s += tx(28, h - 44, 'A link is not proof of cause: land prices, zoning, offices and the metro all move together.', { size: 16, weight: 700, fill: INK });
  s += footer(w, h, /built/.test(st.x + st.y) ? SRC_W : SRC) + '</svg>'; $('#chart').innerHTML = s;
  $('#relate-out').innerHTML = `<div class="ga-big">r = ${rtxt(r)}</div>${Math.abs(r) < 0.2 ? 'Almost no' : cap(word) + ' ' + dir} link between ${mx.s} and ${my.s} across ${inr(N)} hexagons. r runs from −1 (perfectly opposite) through 0 (no link) to +1 (perfectly together). <b>A link is not proof of cause.</b>`;
};

R.map = () => {
  setLayout('split', '46%'); $('#map-m').value = st.metric; segOn('map-meth', st.method); segOn('map-k', st.classes);
  const k = st.metric, m = M[k], K = st.classes, C = chor(k, st.method, K), topG = C.groups[K - 1];
  paintChor(C); setHL(topG.length <= 60 ? topG : [], RED, 2.5); setLabels(topG.length <= 8 ? topG : [], RED); fit(null, 16); hoverKey = k; credits(m.cr);
  legend(chorLegend(k, C, `${m.l}: ${METH[st.method].toLowerCase()}`) + (topG.length <= 60 ? sw('#fff;border:3px solid ' + RED, 'Darkest group, outlined') : ''), m.src);
  const cmp = ['quantile', 'equal', 'jenks'].map(mm => [mm, chor(k, mm, K).groups[K - 1].length]);
  const lightN = C.nz + C.nnull + C.groups[0].length, nv = valid(k).length;
  const [w, h] = box(); let s = svgOpen(w, h);
  const hd = header(w, `${METH[st.method].split(' (')[0]}: ${hx(topG.length)} in the darkest group`, `${m.l}, ${K} groups. Lightest two shades cover ${p1(lightN / N * 100)} of Gurugram. Darkest group by method: equal counts ${cmp[0][1]}, equal steps ${cmp[1][1]}, natural breaks ${cmp[2][1]}.`); s += hd.s;
  let y = hd.y + 24; s += tx(28, y, 'How many hexagons fall in each group', { size: 22, weight: 700, fill: NAVY }); y += 16;
  const rows = [...C.ranges.keys()].reverse().map(j => [C.P[j], C.ranges[j] ? rng(m.f, C.ranges[j]) : 'no hexagons', C.groups[j].length, j === K - 1]);
  if (C.nz) rows.push([ZERO, `None (0)`, C.nz, false]); if (C.nnull) rows.push([ZERO, 'Too few to compute', C.nnull, false]);
  const rh = Math.min(62, (h - y - 70) / rows.length), lw = 190, bmax = w - 28 - lw - 190;
  rows.forEach(([c, lab, n, dark], q) => { const yy = y + q * rh, bl = bmax * n / N; s += `<rect x="28" y="${yy + rh * 0.2}" width="26" height="${rh * 0.5}" rx="3" fill="${c}" stroke="rgba(0,0,0,.3)"/>` + tx(64, yy + rh * 0.58, lab, { size: 16, weight: 700 }) + `<rect x="${28 + lw}" y="${yy + rh * 0.14}" width="${Math.max(2, bl)}" height="${rh * 0.62}" rx="2" fill="${c === ZERO ? '#dfe2e8' : c}" stroke="${dark ? RED : 'rgba(0,0,0,.2)'}" stroke-width="${dark ? 2.5 : 1}"/>` + tx(28 + lw + Math.max(2, bl) + 10, yy + rh * 0.58, `${hx(n)} (${p1(n / N * 100)})`, { size: 16, weight: dark ? 700 : 400 }); });
  s += footer(w, h, m.src) + '</svg>'; $('#chart').innerHTML = s;
  $('#map-out').innerHTML = `Same ${m.s}, ${K} groups. Hexagons in the darkest group: ${cmp.map(([mm, n]) => `<b>${METH[mm].split(' (')[0]}</b> ${n}`).join(' · ')}. Equal counts puts the same number of hexagons in every group; equal steps cuts the range into equal slices; natural breaks puts the lines in the biggest gaps. Hexagons with none are shown in the lightest grey.`;
};

function areaAgg() { const m = {}; W.forEach((r, i) => { if (!r.branded_cafes) return; const a = cap(r.area); (m[a] = m[a] || { a, v: 0, ids: [] }); m[a].v += r.branded_cafes; m[a].ids.push(i); }); return Object.values(m).sort((p, q) => q.v - p.v || p.a.localeCompare(q.a)); }
const VERD = {
  pie: ['no', 'Pie chart: 16 slices. Nobody can tell which is biggest; angles are hard to compare.'],
  table: ['no', 'Table: exact numbers, good for look-up, but the eye must hunt for the biggest.'],
  bar: ['ok', 'Sorted bar chart: the ranking jumps out, top to bottom.'],
  dot: ['ok', 'Dot plot: the same ranking with less ink; useful when bars feel heavy.'],
  map: ['ok', 'Map: shows where (along the metro and Golf Course Road), but not the ranking.'],
};
R.chart = () => {
  segOn('chart-c', st.chart); const v = VERD[st.chart], q = 'Which areas have the most branded cafés?', A = areaAgg(), top = A.slice(0, 3);
  const vh = `<div class="st-verdict"><span class="${v[0]}">${v[0] === 'ok' ? '✓' : '✗'}</span> ${esc(v[1])}</div>`;
  $('#chart-out').innerHTML = `<b>${v[0] === 'ok' ? '✓' : '✗'}</b> ${esc(v[1])} Areas are approximate names; hexagons that share a name are added together.`;
  if (st.chart === 'map') {
    setLayout('split', '40%');
    $('#chart').innerHTML = `<div class="st-panel"><div class="st-h1">${q}</div>${vh}<p style="font-size:20px;line-height:1.5">Each circle's area is the number of branded cafés in that hexagon. The big circles sit on the metro line and Golf Course Road: ${listJoin(top.map(x => x.a))}.</p><p style="font-size:20px;line-height:1.5">But can you say which area has the most? A map answers <b>where</b>; a sorted bar answers <b>how many</b>.</p><div class="st-src">${SRC}</div></div>`;
    paint(() => ZERO, () => 0.4); const cid = W.map((r, i) => i).filter(i => W[i].branded_cafes > 0);
    setCircles(circlesFor('branded_cafes', 22, i => top.some(x => x.ids.includes(i)) ? RED : NAVY)); setLabels(top.map(x => x.ids.sort((a, b) => W[b].branded_cafes - W[a].branded_cafes)[0]), RED); fit(cid, 40); hoverKey = 'branded_cafes';
    legend(circleLegend('branded_cafes', 22, 'Branded cafés: circle area') + sw(RED, 'Top three areas', 'ring') + sw(NAVY, 'Other hexagons', 'ring'));
    return;
  }
  setLayout('chart'); const [w, h] = box();
  if (st.chart === 'table') {
    const al = [...A].sort((p, q2) => p.a.localeCompare(q2.a)), third = Math.ceil(al.length / 3);
    const tbl = part => `<table class="st-tbl" style="font-size:16px"><thead><tr><th>Area (approximate)</th><th class="n">Cafés</th></tr></thead><tbody>${part.map(x => `<tr><td>${esc(x.a)}</td><td class="n">${x.v}</td></tr>`).join('')}</tbody></table>`;
    $('#chart').innerHTML = `<div class="st-panel"><div class="st-h1">${q}</div>${vh}<div style="display:grid;grid-template-columns:1.25fr 1fr 1fr;gap:22px">${tbl(al.slice(0, third))}${tbl(al.slice(third, 2 * third))}${tbl(al.slice(2 * third))}</div><div class="st-src">All ${A.length} areas with a branded café, in alphabetical order, as a table usually arrives. ${SRC}</div></div>`;
    return;
  }
  if (st.chart === 'bar' || st.chart === 'dot') {
    const t15 = A.slice(0, 15), vhh = vh.replace(/^<div class="st-verdict">|<\/div>$/g, '');
    $('#chart').innerHTML = hbar({ title: q, subHTML: vhh, rows: t15.map((x, j) => ({ i: x.ids[0], label: x.a, v: x.v, col: j < 3 ? RED : (st.chart === 'dot' ? NAVY : GREY), bold: j < 3 })), fmt: inr, dots: st.chart === 'dot', key: [[RED, 'Top three', st.chart === 'dot' ? 'dot' : null], [st.chart === 'dot' ? NAVY : GREY, `Next twelve (of ${A.length} areas with a branded café)`, st.chart === 'dot' ? 'dot' : null]] });
    return;
  }
  const P = A.slice(0, 15).map(x => [x.a, x.v]), rest = A.slice(15); P.push([`${rest.length} other areas`, rest.reduce((s2, x) => s2 + x.v, 0)]);
  let s = svgOpen(w, h); s += tx(28, 40, q, { size: 28, weight: 700, fill: NAVY });
  s += `<foreignObject x="20" y="52" width="${w - 40}" height="44"><div xmlns="http://www.w3.org/1999/xhtml" class="st-verdict" style="margin:0"><span class="no">✗</span> ${esc(v[1])}</div></foreignObject>`;
  const cx = w * 0.3, cy = (h + 60) / 2, rr = Math.min(w * 0.25, (h - 190) / 2); let a0 = -Math.PI / 2; const tot = T.branded_cafes, col = j => `hsl(${j * 22},62%,${j % 2 ? 62 : 72}%)`;
  P.forEach(([l, val], j) => { const a1 = a0 + val / tot * 2 * Math.PI, lg = a1 - a0 > Math.PI ? 1 : 0; s += `<path d="M${cx},${cy}L${cx + rr * Math.cos(a0)},${cy + rr * Math.sin(a0)}A${rr},${rr} 0 ${lg} 1 ${cx + rr * Math.cos(a1)},${cy + rr * Math.sin(a1)}Z" fill="${col(j)}" stroke="#fff" stroke-width="1"/>`; a0 = a1; });
  const lx = w * 0.6, ly = 140, lh = (h - ly - 60) / P.length;
  P.forEach(([l], j) => { const yy = ly + j * lh; s += `<rect x="${lx}" y="${yy - 13}" width="18" height="15" fill="${col(j)}"/>` + tx(lx + 26, yy, l, { size: 15 }); });
  s += footer(w, h) + '</svg>'; $('#chart').innerHTML = s;
};

const DSTAGE = ['', 'The default chart', 'Remove gridlines, borders and the legend box', 'Sort, turn sideways and label directly', 'Grey everything; colour only what matters', 'Say the point in the title'];
R.declutter = () => {
  setLayout('chart'); segOn('dec-s', st.stage); const S = st.stage, [w, h] = box(), Z = zoneStats(), z1 = Z[0];
  const action = `${p0(z1.cafes)} of branded cafés sit on ${p0(z1.land)} of Gurugram's land`;
  const rainbow = j => ['hsl(0,70%,55%)', 'hsl(120,55%,45%)', 'hsl(220,70%,55%)', 'hsl(45,90%,50%)'][j];
  const tag = tx(w - 24, 30, `Stage ${S} of 5 · ${DSTAGE[S]}`, { size: 15, weight: 700, fill: MUTE, anchor: 'end' });
  let s = svgOpen(w, h) + tag;
  if (S <= 2) {
    if (S === 1) s += `<rect x="6" y="44" width="${w - 12}" height="${h - 50}" fill="none" stroke="#888" stroke-width="1.5"/>`;
    s += tx(w / 2, 82, 'Share by zone', { size: 24, weight: 700, anchor: 'middle' });
    const L = 90, Rr = w - 290, Tt = 120, Bb = h - 170, gw = (Rr - L) / 3, bw = gw * 0.8 / 4, sy = v => Bb - v / 100 * (Bb - Tt);
    if (S === 1) { for (let t = 0; t <= 100; t += 10) s += `<line x1="${L}" y1="${sy(t)}" x2="${Rr}" y2="${sy(t)}" stroke="#b5b5b5"/>`; s += `<rect x="${L}" y="${Tt}" width="${Rr - L}" height="${Bb - Tt}" fill="none" stroke="#666" stroke-width="1.5"/>`; }
    if (S === 1) s += `<rect x="${Rr + 24}" y="${Tt + 10}" width="230" height="${4 * 28 + 18}" fill="#fff" stroke="#666"/>`;
    ZB.forEach(([k, l], j) => { s += `<rect x="${Rr + 38}" y="${Tt + 26 + j * 28}" width="16" height="14" fill="${rainbow(j)}"/>` + tx(Rr + 62, Tt + 38 + j * 28, l, { size: 15 }); });
    for (let t = 0; t <= 100; t += S === 1 ? 10 : 20) s += tx(L - 10, sy(t) + 5, t, { size: 14, anchor: 'end' });
    s += `<line x1="${L}" y1="${Tt}" x2="${L}" y2="${Bb}" stroke="#444"/><line x1="${L}" y1="${Bb}" x2="${Rr}" y2="${Bb}" stroke="#444"/>` + tx(30, (Tt + Bb) / 2, 'Percent', { size: 15, anchor: 'middle', extra: ` transform="rotate(-90 30 ${(Tt + Bb) / 2})"` });
    Z.forEach((z, g) => { ZB.forEach(([k], j) => { const x = L + g * gw + gw * 0.1 + j * bw; s += `<rect x="${x}" y="${sy(z[k])}" width="${bw * 0.9}" height="${Bb - sy(z[k])}" fill="${rainbow(j)}"/>`; }); const lx = L + g * gw + gw / 2; s += tx(lx, Bb + 20, z.z, { size: 15, anchor: 'end', extra: ` transform="rotate(-25 ${lx} ${Bb + 20})"` }); });
  } else {
    const hd = header(w, S === 5 ? action : 'Share by zone', S === 5 ? `Within 1 km of a metro station: ${p1(z1.cafes)} of branded cafés (${z1.nc} of ${T.branded_cafes}) but ${p1(z1.land)} of the land and ${p1(z1.buildings)} of buildings.` : null, 28, 68); s += hd.s;
    let y0 = hd.y + 6; if (S >= 4) { s += keyRow(28, y0 + 8, [[RED, 'Branded cafés within 1 km of metro'], [NAVY, 'Land within 1 km of metro'], [GREY, 'Everything else']]); y0 += 26; }
    s += zoneBars(28, y0, w - 60, h - y0 - 46, (g, k) => S === 3 ? rainbow(ZB.findIndex(x => x[0] === k)) : g === 0 && k === 'cafes' ? RED : g === 0 && k === 'land' ? NAVY : GREY);
  }
  s += footer(w, h) + '</svg>'; $('#chart').innerHTML = s;
  $('#dec-out').innerHTML = `<b>Stage ${S} of 5:</b> ${DSTAGE[S]}.` + (S === 5 ? `<br>Action title: <b>${esc(action)}</b>.` : '');
};

// ---------- insights, Big Idea, arc ----------
const distinctAreas = (ids, n) => [...new Set(ids.map(i => short(i)))].slice(0, n);
function buildInsights() {
  const Z = zoneStats(), z1 = Z[0], z3 = Z[2];
  const top10 = order('branded_cafes').slice(0, 10), t10c = top10.reduce((s, i) => s + W[i].branded_cafes, 0);
  const dense = order('buildings', true, W.map((r, i) => i).filter(i => W[i].buildings >= 1000)), dn0 = dense.filter(i => W[i].branded_cafes === 0), dnB = dn0.reduce((s, i) => s + W[i].buildings, 0);
  const grow = order('new_built_share').slice(0, 60), gt = agg(grow.map(i => W[i]));
  const urban10 = dn0.filter(i => W[i].metro_km <= 10).slice(0, 10);
  B.ask = B.ask || `Approve 10 sites where people live: ${listJoin(distinctAreas(dn0, 3))} first, then the growth sectors`;
  const G = { top10, t10c, dense, dn0, dnB, grow, gt, Z, urban10 };
  const bar = (ids, k, f) => ids.slice(0, 7).map(i => ({ l: short(i), v: W[i][k], f, on: true }));
  ins = [
    { name: 'Cafés cluster in a few hexagons', fact: `just 10 hexagons, ${p1(10 / N * 100)} of the district, hold ${p0(t10c / T.branded_cafes * 100)} of Gurugram's ${T.branded_cafes} branded cafés (${listJoin(distinctAreas(top10, 4))})`, action: `${p0(t10c / T.branded_cafes * 100)} of branded cafés are packed into 10 hexagons`, heads: [`10 hexagons hold ${p0(t10c / T.branded_cafes * 100)} of branded cafés`, `${short(top10[0])} alone has ${W[top10[0]].branded_cafes}`, `Opening an 11th café next door adds little reach`], start: top10, bars: bar(top10, 'branded_cafes', inr), bt: 'Branded cafés, top hexagons' },
    { name: 'Cafés chase the metro', fact: `${p0(z1.cafes)} of branded cafés (${z1.nc}) sit within 1 km of a metro station, on ${p1(z1.land)} of the land where only ${p1(z1.buildings)} of buildings are`, action: `${p0(z1.cafes)} of branded cafés sit on ${p0(z1.land)} of Gurugram's land`, heads: [`${p0(z1.cafes)} of branded cafés are within 1 km of the metro`, `That strip is ${p1(z1.land)} of the land and ${p1(z1.buildings)} of buildings`, `The chains are competing for the same few streets`], start: Z[0].ids, bars: [{ l: 'Cafés within 1 km', v: z1.cafes, f: p1, on: true }, { l: 'Land within 1 km', v: z1.land, f: p1 }, { l: 'Buildings within 1 km', v: z1.buildings, f: p1 }, { l: 'Shops within 1 km', v: z1.shops, f: p1 }], bt: 'Share of Gurugram' },
    { name: 'People live elsewhere', fact: `${p0(z3.buildings)} of Gurugram's buildings are more than 3 km from a metro station, but only ${p0(z3.cafes)} of branded cafés are`, action: `${p0(z3.buildings)} of buildings, ${p0(z3.cafes)} of cafés: the chains are missing where people live`, heads: [`${p0(z3.buildings)} of buildings are more than 3 km from the metro`, `Only ${p0(z3.cafes)} of branded cafés are there`, `Follow the people, not the competitors`], start: Z[2].ids, bars: [{ l: 'Buildings, 3 km+', v: z3.buildings, f: p1 }, { l: 'Cafés, 3 km+', v: z3.cafes, f: p1, on: true }, { l: 'Buildings, within 1 km', v: z1.buildings, f: p1 }, { l: 'Cafés, within 1 km', v: z1.cafes, f: p1, on: true }], bt: 'Share of Gurugram' },
    { name: 'The dense old city is unserved', fact: `${dn0.length} of the ${dense.length} densest hexagons (1,000+ buildings) have no branded café: ${lakh(dnB)} buildings in ${listJoin(distinctAreas(dn0, 4))}`, action: `${dn0.length} of Gurugram's ${dense.length} densest hexagons have no branded café`, heads: [`${dn0.length} of the ${dense.length} densest hexagons have no branded café`, `${lakh(dnB)} buildings with no branded café nearby`, `Start in ${listJoin(distinctAreas(dn0, 3))}`], start: urban10, bars: bar(dn0, 'buildings', inr), bt: 'Buildings in the densest hexagons with no branded café' },
    { name: 'The growth frontier is unserved', fact: `the ${grow.length} fastest-growing hexagons (2017 to 2024) have ${inr(gt.buildings)} buildings, ${inr(gt.shops)} shops and just ${gt.branded_cafes} branded cafés`, action: `Gurugram's fastest-growing hexagons have ${gt.branded_cafes} branded cafés`, heads: [`${grow.length} fastest-growing hexagons: ${inr(gt.buildings)} buildings, ${gt.branded_cafes} branded cafés`, `${listJoin(distinctAreas(grow, 4))}: tomorrow's customers`, `Book sites before the competitors arrive`], start: grow, bars: bar(grow, 'new_built_share', p1), bt: 'Land newly built 2017 to 2024' },
  ];
  window.__G = G; return G;
}
const lcFirst = s => s ? s[0].toLowerCase() + s.slice(1) : s;
const bigIdea = I => `${B.aud}: ${I.fact}. ${B.ask}.`;
R.bigidea = () => {
  setLayout('chart'); $('#bi-ins').value = st.insight; const I = ins[st.insight];
  $('#bi-brief').innerHTML = `<b>Audience:</b> ${esc(B.aud)}<br><b>Decision:</b> ${esc(B.dec)}<br><b>Ask:</b> ${esc(B.ask)}`;
  $('#chart').innerHTML = `<div class="st-panel"><div class="st-h1">One sentence: the Big Idea</div><div class="st-h2">Audience + insight + ask. Insight chosen: ${esc(I.name.toLowerCase())}.</div>
  <div class="st-card acc" style="margin-bottom:18px"><h4>The Big Idea</h4><div class="big" style="font-size:27px">${esc(bigIdea(I))}</div></div>
  <div class="st-cards" style="grid-template-columns:1fr 1fr;margin-bottom:18px">
    <div class="st-card bad"><h4>Topic title <span class="st-tag no">✗ says what</span></h4><div class="big">Branded cafés by hexagon, Gurugram</div></div>
    <div class="st-card"><h4>Action title <span class="st-tag ok">✓ says so what</span></h4><div class="big">${esc(I.action)}</div></div>
  </div>
  <div class="st-card"><h4>Three headline titles for three slides</h4>${I.heads.map((t, j) => `<div class="big" style="font-size:23px;margin:6px 0"><span style="color:${RED};font-weight:800">${j + 1}.</span> ${esc(t)}</div>`).join('')}</div>
  <div class="st-src">${SRC}</div></div>`;
};
R.arc = () => {
  setLayout('chart'); $('#arc-ins').value = st.insight; const I = ins[st.insight], [w, h] = box();
  const cw = (w - 56 - 40) / 3, th = Math.min(250, h - 560), tw2 = cw - 40;
  const Cb = chor('buildings', 'jenks', 5);
  const thumbMap = (fill) => `<svg width="${tw2}" height="${th}" viewBox="0 0 ${tw2} ${th}">${svgMap(tw2, th, fill, null, 2, 0.3)}</svg>`;
  const bars = (() => { const rh = th / I.bars.length, mx = Math.max(...I.bars.map(b => b.v)), lw = Math.min(190, Math.max(...I.bars.map(b => tw(b.l, 14))) + 8); let s = `<svg width="${tw2}" height="${th}" style="font-family:${FONT}">`; I.bars.forEach((b, q) => { const bl = (tw2 - lw - 64) * b.v / mx; s += tx(lw - 6, q * rh + rh / 2 + 5, b.l, { size: 14, anchor: 'end', weight: b.on ? 700 : 400 }) + `<rect x="${lw}" y="${q * rh + rh * 0.18}" width="${Math.max(1, bl)}" height="${rh * 0.64}" fill="${b.on ? RED : GREY}"/>` + tx(lw + bl + 5, q * rh + rh / 2 + 5, b.f(b.v), { size: 14 }); }); return s + '</svg>'; })();
  const card = (n, lab, txt, vis, cls = '') => `<div class="st-card ${cls}" style="display:flex;flex-direction:column"><h4>${n} · ${lab}</h4><div style="display:flex;justify-content:center;margin:6px 0 10px">${vis}</div><div class="big" style="font-size:19px">${esc(txt)}</div></div>`;
  const tgt = ins[3].start.concat(ins[4].start.slice(0, 10));
  $('#chart').innerHTML = `<div class="st-panel"><div class="st-h1">Setup, tension, resolution</div><div class="st-h2">Three frames, built from your brief and the insight: ${esc(I.name.toLowerCase())}.</div>
   <div class="st-cards" style="grid-template-columns:1fr 1fr 1fr">
    ${card(1, 'Setup: what we all accept', `Gurugram: ${lakh(T.buildings)} buildings, ${inr(T.shops)} shops and eateries, ${T.branded_cafes} branded cafés.`, thumbMap(i => Cb.cls[i] >= 0 ? Cb.P[Cb.cls[i]] : ZERO))}
    ${card(2, 'Tension: what is wrong with that picture', cap(I.fact) + '.', bars)}
    ${card(3, 'Resolution: what to do', B.ask + '.', thumbMap(i => I.start.includes(i) ? RED : '#e6eaf2'), 'acc')}
   </div>
   <div class="st-abt">Gurugram has ${lakh(T.buildings)} buildings <b>AND</b> ${T.branded_cafes} branded cafés, <b>BUT</b> ${esc(I.fact)}, <b>THEREFORE</b> ${esc(lcFirst(B.ask))}.</div>
   <div class="st-src" style="display:flex;gap:22px;align-items:center;flex-wrap:wrap"><span style="display:inline-flex;gap:6px;align-items:center"><i style="width:20px;height:13px;background:${SEQ[6]};display:inline-block;border:1px solid #888"></i><i style="width:20px;height:13px;background:${SEQ[1]};display:inline-block;border:1px solid #888"></i> Map 1: buildings per hexagon, darker = more</span><span style="display:inline-flex;gap:6px;align-items:center"><i style="width:20px;height:13px;background:${RED};display:inline-block"></i> Map 3: hexagons to act on</span><span>${SRC}</span></div></div>`;
};

// ---------- story mode ----------
function tellFrames() {
  const G = window.__G, Z = G.Z, z1 = Z[0], z3 = Z[2], t10s = G.t10c / T.branded_cafes * 100;
  const caf = W.map((r, i) => i).filter(i => W[i].branded_cafes > 0);
  const cafCircles = (maxR = 20) => setCircles(circlesFor('branded_cafes', maxR, () => RED));
  const cafKey = () => circleLegend('branded_cafes', 20, 'Branded cafés: circle area', RED);
  return [
    { t: `Gurugram: ${lakh(T.buildings)} buildings, ${inr(Math.round(T.shops / 1000) * 1000)} shops, ${T.branded_cafes} branded cafés`, num: lakh(T.buildings), numl: `buildings in Gurugram district (${inr(N)} hexagons of about 0.74 km²)`, p: [`${inr(T.shops)} shops and eateries, and ${T.branded_cafes} branded cafés from seven national chains.`], go: () => { const C = chor('buildings', 'jenks', 5); paintChor(C); frameKey = chorLegend('buildings', C, 'Buildings per hexagon'); return null; } },
    { t: `Cafés cluster: 10 hexagons hold ${p0(t10s)} of branded cafés`, num: p0(t10s), numl: `of branded cafés (${G.t10c} of ${T.branded_cafes}) in 10 hexagons: ${p1(10 / N * 100)} of the district`, p: [`${listJoin(distinctAreas(G.top10, 4))}.`], go: () => { paint(i => G.top10.includes(i) ? '#f4c7c7' : ZERO, i => G.top10.includes(i) ? .8 : .4); cafCircles(24); setLabels(G.top10.slice(0, 5).filter((i, q, a) => a.findIndex(j => short(j) === short(i)) === q), RED); frameKey = cafKey() + sw('#f4c7c7', 'The 10 hexagons with the most'); return G.top10; } },
    { t: 'They chase the metro', num: p0(z1.cafes), numl: `of branded cafés (${z1.nc}) sit within 1 km of a metro station, on ${p1(z1.land)} of the land`, p: [`Only ${p1(z1.buildings)} of buildings are there (and ${p1(z1.shops)} of shops).`], go: () => { paint(i => ZC[W[i].zone], i => W[i].zone === ZONES[2] ? .35 : .75); cafCircles(18); frameKey = cafKey() + ZONES.map(z => sw(ZC[z], z)).join(''); return Z[0].ids.concat(Z[1].ids); } },
    { t: 'But people live elsewhere', num: p0(z3.buildings), numl: 'of buildings are more than 3 km from a metro station', p: [`Only ${p0(z3.cafes)} of branded cafés are there.`], go: () => { const C = chor('buildings', 'jenks', 5); paintChor(C); cafCircles(16); frameKey = chorLegend('buildings', C, 'Buildings per hexagon') + sw(RED, 'Branded cafés', 'ring'); return null; } },
    { t: 'The dense old city and the new frontier are unserved', num: `${G.dn0.length} of ${G.dense.length}`, numl: `densest hexagons (1,000+ buildings) have no branded café: ${lakh(G.dnB)} buildings`, p: [`The ${G.grow.length} fastest-growing hexagons (2017 to 2024) have ${inr(G.gt.buildings)} buildings, ${inr(G.gt.shops)} shops and just ${G.gt.branded_cafes} branded cafés.`], go: () => { paint(i => G.dn0.includes(i) ? RED : G.grow.includes(i) ? NAVY : ZERO, i => G.dn0.includes(i) || G.grow.includes(i) ? .8 : .35); frameKey = sw(RED, `Dense (1,000+ buildings), no branded café: ${G.dn0.length}`) + sw(NAVY, `Fastest-growing 2017 to 2024: ${G.grow.length}`) + sw(ZERO, 'Other hexagons'); return null; } },
    { t: 'Follow the people, not the competitors', num: '10', numl: `outlets: old Gurugram's dense sectors first, then the growth sectors`, p: [`First: ${listJoin(distinctAreas(G.dn0, 4))}.`, `Then: ${listJoin(distinctAreas(G.grow, 4))}. Check each site on the ground.`], go: () => { const d10 = G.urban10; paint(i => d10.includes(i) ? RED : G.grow.includes(i) ? '#9db1d4' : ZERO, i => d10.includes(i) || G.grow.includes(i) ? .85 : .35); setLabels(d10.filter((i, q, a) => a.findIndex(j => short(j) === short(i)) === q).slice(0, 5), '#7a0000'); frameKey = sw(RED, 'First: the 10 densest urban hexagons with no branded café') + sw('#9db1d4', 'Next: the 60 fastest-growing hexagons') + sw(ZERO, 'Other hexagons'); return d10; } },
  ];
}
let frameKey = '';
R.tell = () => {
  setLayout('map'); segOn('tell-f', st.frame); const f = tellFrames()[st.frame - 1];
  const target = f.go(); const card = $('#tellcard'); card.hidden = false;
  card.innerHTML = `<div class="fno">Frame ${st.frame} of 6</div><h1>${esc(f.t)}</h1><div class="num">${esc(f.num)}</div><div class="numl">${esc(f.numl)}</div>${f.p.map(t => `<p>${esc(t)}</p>`).join('')}<div class="key">${frameKey}${METRO_KEY}</div><div class="src">${SRC}</div><div class="nav"><button class="ga-ghostbtn" id="t-prev">← Prev</button><button class="ga-primary" id="t-next">Next →</button></div>`;
  $('#t-prev').onclick = () => { st.frame = Math.max(1, st.frame - 1); show('tell'); }; $('#t-next').onclick = () => { st.frame = Math.min(6, st.frame + 1); show('tell'); };
  const cw = card.offsetWidth || 600; fit(target, { top: 50, bottom: 50, right: 60, left: cw + 80 }, 1000); hoverKey = 'buildings';
};

// ---------- your turn ----------
const BRIEFS = {
  bank: { d: 'where to open 5 new branches', t: 'A private bank choosing 5 new branches', a: 'Head of retail branches', m: 'buildings', q: 'Where do many households live but few shops and services operate yet?' },
  pharmacy: { d: 'where to open 8 new stores', t: 'A pharmacy chain choosing 8 new stores', a: 'Chief operating officer, pharmacy chain', m: 'shops_per_1000_bldg', q: 'Where are there many homes per shop, so a pharmacy is far away?' },
  qcommerce: { d: 'where to put 6 dark stores', t: 'A quick-commerce company choosing 6 dark stores for 10-minute delivery', a: 'City head, quick-commerce company', m: 'buildings', q: 'Where are enough homes packed close together to deliver in 10 minutes?' },
  ev: { d: 'where to build 10 fast-charging hubs', t: 'An EV-charging company choosing 10 fast-charging hubs', a: 'Expansion head, EV-charging company', m: 'new_built_share', q: 'Where is Gurugram growing fastest, ahead of the chargers?' },
};
R.yourturn = () => {
  segOn('yt-v', st.view); $('#yt-b').value = st.brief; $('#yt-m').value = st.metric; $('#yt-c').checked = st.cafes;
  const Bf = BRIEFS[st.brief], k = st.metric, m = M[k], G = gur;
  const facts = `OpenStreetMap cafés and restaurants: <b>${p1(G.s500)}</b> within 500 m of a metro station, <b>${p1(G.s1k)}</b> within 1 km (${G.n} in all).`;
  $('#yt-out').innerHTML = `<b>${esc(Bf.t)}.</b> ${esc(Bf.q)}<br>Suggested map: ${esc(M[Bf.m].l.toLowerCase())}.` + (st.cafes ? '<br>' + facts : '');
  if (st.view === 'template') {
    setLayout('chart');
    const box2 = (lab, ph, rows = 2) => `<label>${lab}</label><textarea rows="${rows}" placeholder="${esc(ph)}"></textarea>`;
    $('#chart').innerHTML = `<div class="st-panel st-ws"><div class="st-h1">Group worksheet: ${esc(Bf.t)}</div><div class="st-h2">The data: ${inr(N)} hexagons; ${lakh(T.buildings)} buildings; ${inr(T.shops)} shops and eateries; ${p1(zoneStats()[2].buildings)} of buildings are more than 3 km from a metro station.</div>
    <div style="display:grid;grid-template-columns:1fr 1.25fr;gap:34px;flex:1">
     <div>${box2('Audience: who will listen?', 'e.g. ' + Bf.a)}${box2('Decision: what must they decide?', 'e.g. ' + Bf.d)}${box2('Ask: what do you want them to do?', 'e.g. approve these sites ...')}${box2('Insight: the one number that matters', Bf.q)}${box2('Big Idea: one sentence (audience + insight + ask)', 'Write it so it could be the subject line of an email', 3)}</div>
     <div><label>Storyboard: three frames (sketch a chart or map in each)</label>
      <div style="display:grid;grid-template-rows:1fr 1fr 1fr;gap:12px;height:calc(100% - 40px)">
       ${['1 · Setup: what everyone accepts', '2 · Tension: what the data shows', '3 · Resolution: what to do'].map(t => `<div style="border:2px dashed #9aa3b2;border-radius:12px;padding:10px 14px;display:grid;grid-template-columns:1fr 1.2fr;gap:14px"><div><b style="color:${NAVY};font-size:17px">${t}</b><textarea rows="3" placeholder="Headline (an action title)"></textarea></div><div style="border:1px solid #d9dee7;border-radius:8px;background:#fafbfd;display:grid;place-items:center;color:#9aa3b2;font-size:16px">sketch: chart or map</div></div>`).join('')}
      </div></div></div>
    <div class="st-src">And–But–Therefore: Gurugram has ___ AND ___, BUT ___, THEREFORE ___. · ${SRC_W}</div></div>`;
    return;
  }
  setLayout('split', '44%');
  const ix = order(k).slice(0, 10), top = ix.slice(0, 3);
  $('#chart').innerHTML = hbar({ title: Bf.t, sub: `${Bf.q} Top 10 hexagons by ${m.s}${m.note ? ' (' + m.note + ')' : ''}.` + (st.cafes ? ` OpenStreetMap cafés: ${p1(G.s500)} within 500 m of a metro station, ${p1(G.s1k)} within 1 km.` : ''), rows: ix.map(i => ({ i, label: hname(i), v: W[i][k], col: top.includes(i) ? RED : '#9db1d4', bold: top.includes(i) })), fmt: m.f, avg: { v: city(k), label: `${cityName(k)}: ${cityF(k)}` }, key: [[RED, 'Top three'], ['#9db1d4', 'Next seven'], [INK, cityName(k), 'line']], src: st.cafes ? SRC_O : m.src });
  bindHover();
  const C = chor(k, 'jenks', 5); paintChor(C, st.cafes ? 0.6 : 0.82); setHL(ix); setLabels(top, RED); hoverKey = k; credits(st.cafes ? CRED_O : m.cr);
  let lg = chorLegend(k, C, m.l + ' (natural breaks)') + sw('#fff;border:3px solid ' + RED, 'Top 10, outlined');
  if (st.cafes) { map.setLayoutProperty('gc', 'visibility', 'visible'); lg += sw(GC[0], 'Café within 500 m of metro', 'ring') + sw(GC[1], 'Café 500 m to 1 km', 'ring') + sw(GC[2], 'Café more than 1 km', 'ring'); }
  legend(lg, st.cafes ? SRC_O : m.src); fit(st.cafes ? W.map((r, i) => i).filter(i => W[i].osm_cafes > 0).concat(ix) : null, 24);
};
const GC = ['#c00000', '#f4a3a3', '#7a8599'];

// ---------- init ----------
async function init() {
  geo = await fetch('data/gurugram_hex.geojson').then(r => r.json());
  W = geo.features.map(f => f.properties); N = W.length; T = agg(W);
  geo.features.forEach((f, i) => { f.properties.i = i; f.properties.col = ZERO; f.properties.op = .5; });
  const cnt = {}, seen = {}; W.forEach(r => cnt[r.area] = (cnt[r.area] || 0) + 1);
  NAME = W.map(r => { const a = cap(r.area); if (cnt[r.area] < 2) return a; seen[r.area] = (seen[r.area] || 0) + 1; return `${a} · hexagon ${seen[r.area]}`; });
  let b = [180, 90, -180, -90]; geo.features.forEach(f => f.geometry.coordinates[0].forEach(c => { b = [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])]; })); BB = b;
  buildInsights();
  $('#tabs').innerHTML = STEPS.map(([id, l], j) => `<button role="tab" data-t="${id}" aria-selected="false"><span>${j}</span>${l}</button>`).join('');
  $$('#tabs button').forEach(bt => bt.onclick = () => show(bt.dataset.t));
  const RK = ['branded_cafes', 'shops', 'buildings', 'new_built_share', 'shops_per_1000_bldg'];
  $('#rank-m').innerHTML = RK.map(k => `<button data-v="${k}">${cap(M[k].s)}</button>`).join('');
  $$('#rank-m button').forEach(bt => bt.onclick = () => { st.metric = bt.dataset.v; show('rank'); });
  const opts = ks => ks.map(k => `<option value="${k}">${M[k].l}</option>`).join('');
  $('#rel-x').innerHTML = opts(REL_M); $('#rel-y').innerHTML = opts(REL_M); $('#map-m').innerHTML = opts(RANK_M); $('#yt-m').innerHTML = opts(RANK_M);
  $('#yt-b').innerHTML = Object.entries(BRIEFS).map(([k, v]) => `<option value="${k}">${v.t}</option>`).join('');
  $('#rel-x').onchange = e => { st.x = e.target.value; show('relate'); }; $('#rel-y').onchange = e => { st.y = e.target.value; show('relate'); }; $('#map-m').onchange = e => { st.metric = e.target.value; show('map'); };
  $('#yt-b').onchange = e => { st.brief = e.target.value; st.metric = BRIEFS[st.brief].m; show('yourturn'); }; $('#yt-m').onchange = e => { st.metric = e.target.value; show('yourturn'); }; $('#yt-c').onchange = e => { st.cafes = e.target.checked; show('yourturn'); };
  seg('rates-t', 'measure'); seg('rates-m', 'mode'); seg('map-meth', 'method'); seg('map-k', 'classes', true); seg('chart-c', 'chart'); seg('dec-s', 'stage', true); seg('tell-f', 'frame', true); seg('yt-v', 'view');
  $('#dec-next').onclick = () => { st.stage = st.stage % 5 + 1; show('declutter'); };
  const io = ins.map((I, j) => `<option value="${j}">${I.name}</option>`).join(''); $('#bi-ins').innerHTML = io; $('#arc-ins').innerHTML = io;
  $('#bi-ins').onchange = e => { st.insight = +e.target.value; show('bigidea'); }; $('#arc-ins').onchange = e => { st.insight = +e.target.value; show('arc'); };
  [['b-aud', 'aud'], ['b-dec', 'dec'], ['b-ask', 'ask']].forEach(([id, k]) => $('#' + id).oninput = e => { B[k] = e.target.value; clearTimeout(window.__bt); window.__bt = setTimeout(() => { if (st.step === 'brief') R.brief(); }, 250); });
  $('#tell-clean').onclick = () => { st.clean = true; show('tell'); };
  document.addEventListener('keydown', e => { if (st.step !== 'tell' || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return; if (e.key === 'ArrowRight') { st.frame = Math.min(6, st.frame + 1); show('tell'); } if (e.key === 'ArrowLeft') { st.frame = Math.max(1, st.frame - 1); show('tell'); } if (e.key === 'Escape' && st.clean) { st.clean = false; show('tell'); } });
  map = new maplibregl.Map({ container: 'map', style: 'https://tiles.openfreemap.org/styles/positron', bounds: [[b[0], b[1]], [b[2], b[3]]], fitBoundsOptions: { padding: 20 }, attributionControl: false });
  window.__map = map; map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.on('load', async () => {
    map.addSource('w', { type: 'geojson', data: geo });
    map.addLayer({ id: 'w', type: 'fill', source: 'w', paint: { 'fill-color': ['get', 'col'], 'fill-opacity': ['get', 'op'], 'fill-outline-color': 'rgba(255,255,255,0.5)' } });
    map.addSource('hl', { type: 'geojson', data: fc([]) });
    map.addLayer({ id: 'hl', type: 'line', source: 'hl', paint: { 'line-color': RED, 'line-width': 3 } });
    map.addSource('hov', { type: 'geojson', data: fc([]) });
    map.addLayer({ id: 'hov', type: 'line', source: 'hov', paint: { 'line-color': '#111', 'line-width': 3 } });
    map.addSource('pc', { type: 'geojson', data: fc([]) });
    map.addLayer({ id: 'pc', type: 'circle', source: 'pc', paint: { 'circle-radius': ['get', 'r'], 'circle-color': ['get', 'c'], 'circle-opacity': 0.5, 'circle-stroke-color': ['get', 'c'], 'circle-stroke-width': 1.5 } });
    await loadGurugram();
    map.addSource('labs', { type: 'geojson', data: fc([]) });
    map.addLayer({ id: 'labs', type: 'symbol', source: 'labs', layout: { 'text-field': ['get', 'lab'], 'text-font': ['Noto Sans Bold'], 'text-size': 14, 'symbol-sort-key': ['get', 'pri'], 'text-offset': [0, -1.3], 'text-max-width': 12 }, paint: { 'text-color': ['get', 'tc'], 'text-halo-color': '#fff', 'text-halo-width': 2.2 } });
    map.on('mousemove', 'w', e => { const i = e.features[0].properties.i, r = W[i]; hover(i); if (!popup) popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, maxWidth: '330px' }); popup.setLngLat(e.lngLat).setHTML(`<b>${esc(hname(i))}</b> <span style="color:#4a5568">(approximate area)</span><br>Buildings <b>${inr(r.buildings)}</b> · shops and eateries <b>${inr(r.shops)}</b> · branded cafés <b>${r.branded_cafes}</b><br>Nearest metro: ${esc(r.metro_station)}, ${r.metro_km.toFixed(1)} km${hoverKey && !['buildings', 'shops', 'branded_cafes', 'metro_km'].includes(hoverKey) && r[hoverKey] != null ? `<br>${esc(M[hoverKey].l)}: <b>${M[hoverKey].f(r[hoverKey])}</b>` : ''}`).addTo(map); });
    map.on('mouseleave', 'w', () => { hover(null); if (popup) popup.remove(); });
    readHash(); $('#busy').hidden = true; show(st.step);
  });
  window.addEventListener('hashchange', () => { readHash(); show(st.step); });
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => show(st.step), 200); });
}
async function loadGurugram() {
  const [c, m] = await Promise.all([fetch('../data/india/gurugram_cafes.geojson').then(r => r.json()), fetch('../data/india/ncr_metro_stations.geojson').then(r => r.json())]);
  const S = m.features.map(f => f.geometry.coordinates), n = c.features.length;
  const d = c.features.map(f => Math.min(...S.map(s => hav(f.geometry.coordinates, s))));
  c.features.forEach((f, i) => { f.properties.d = d[i]; f.properties.c = d[i] <= 500 ? GC[0] : d[i] <= 1000 ? GC[1] : GC[2]; });
  const sd = [...d].sort((a, b) => a - b), c500 = d.filter(x => x <= 500).length, c1k = d.filter(x => x <= 1000).length;
  gur = { n, c500, c1k, s500: c500 / n * 100, s1k: c1k / n * 100, med: n % 2 ? sd[(n - 1) / 2] : (sd[n / 2 - 1] + sd[n / 2]) / 2 };
  window.__gur = gur;
  const near = m.features.filter(f => { const [x, y] = f.geometry.coordinates; return x > BB[0] - 0.05 && x < BB[2] + 0.05 && y > BB[1] - 0.05 && y < BB[3] + 0.05; });
  c.features.sort((a, b) => b.properties.d - a.properties.d);
  map.addSource('gc', { type: 'geojson', data: c }); map.addSource('gm', { type: 'geojson', data: fc(near) });
  map.addLayer({ id: 'gc', type: 'circle', source: 'gc', layout: { visibility: 'none' }, paint: { 'circle-radius': 4.5, 'circle-color': ['get', 'c'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 } });
  map.addLayer({ id: 'gm', type: 'circle', source: 'gm', paint: { 'circle-radius': 5.5, 'circle-color': '#fff', 'circle-stroke-color': NAVY, 'circle-stroke-width': 3 } });
}
window.__storyReady = false;
init();
