// Location Lab · Storytelling with data — Mumbai's 24 BMC wards, Census 2011 (via MCGM Public Health Dept); boundaries DataMeet.
// Every number shown is computed here from story/data/mumbai_wards.geojson (and, in step 12, the Gurugram files in ../data/india/).
//
// URL hash parameters (every view can be reopened exactly from its address):
//   step=brief|data|rank|rates|compare|relate|map|chart|declutter|bigidea|arc|tell|yourturn
//   metric=<field>              rank, map   (slum_pct, density_per_km2, female_literacy_pct, homeless_per_10k, literacy_pct, sex_ratio, population)
//   sort=<field>&dir=asc|desc   data        (table sort)
//   measure=homeless|slum       rates       (topic)
//   mode=count|rate             rates
//   x=<field>&y=<field>         relate      (scatter axes)
//   method=quantile|equal|jenks map         (equal counts, equal steps, natural breaks)
//   classes=3..7                map
//   chart=pie|table|bar|dot|map chart
//   stage=1..5                  declutter
//   insight=0..4                bigidea, arc
//   frame=1..6                  tell
//   view=map|template           yourturn
//   clean=1                     hides header and side panel (presentation and screenshots)
// window.__storyReady becomes true once the step has drawn and the map is idle.
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const STEPS = [['brief', 'The brief'], ['data', 'Know the data'], ['rank', 'Rank it'], ['rates', 'Counts or rates'], ['compare', 'Benchmark'], ['relate', 'Relationships'], ['map', 'Map classes'], ['chart', 'Pick the chart'], ['declutter', 'Declutter'], ['bigidea', 'Big Idea'], ['arc', 'Story arc'], ['tell', 'Tell it'], ['yourturn', 'Your turn']];
const SRC = 'Source: Census 2011 via MCGM (BMC Public Health Department); ward boundaries DataMeet. All figures are from 2011.';
const SRC_G = 'Source: OpenStreetMap contributors (cafés, restaurants, metro stations). Distance: straight line to the nearest station.';
const FONT = '"Segoe UI",Calibri,Arial,sans-serif';
const NAVY = '#1e3063', RED = '#c00000', GREY = '#c9ced6', INK = '#14213d', MUTE = '#4a5568';
const SEQ = ['#f2f4f9', '#d9e0ee', '#bccae2', '#9db1d4', '#7f97c4', '#6280b4', '#4a69a2'];
const st = { step: 'brief', metric: 'slum_pct', sort: 'slum_pct', dir: 'desc', measure: 'homeless', mode: 'count', x: 'slum_pct', y: 'female_literacy_pct', method: 'quantile', classes: 5, chart: 'pie', stage: 1, insight: 0, frame: 1, view: 'map', clean: false };
const B = { aud: 'Municipal Commissioner, Brihanmumbai Municipal Corporation', dec: 'Where to spend the next ₹500 crore of basic-services money (water, toilets, schools, health posts)', ask: '' };
let geo = null, W = [], N = 0, map = null, T = {}, BB = null, gur = null, popup = null, hoverKey = null, ins = [];

// ---------- formatting ----------
const inr = v => Math.round(v).toLocaleString('en-IN');
const lakh = v => v >= 1e7 ? (v / 1e7).toFixed(2) + ' crore' : (v / 1e5).toFixed(1) + ' lakh';
const p1 = v => v.toFixed(1) + '%';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const DIRS = { E: 'East', W: 'West', N: 'North', S: 'South', C: 'Central' };
const code = r => { const [a, b] = r.ward.split('/'); return b ? a + '/' + DIRS[b] : a; };
const locs = (r, n) => r.localities.split(', ').slice(0, n);
const sname = r => `${code(r)} (${locs(r, 2).join(', ')})`;
const fname = r => `${code(r)} (${r.localities})`;
const plain = r => { const l = locs(r, 2); return l.length > 1 && !l[1].includes(' ') ? l.join('–') : l[0]; };
const listJoin = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
function niceFrac(s) { for (let d = 2; d <= 10; d++) { const n = Math.round(s * d); if (n > 0 && Math.abs(n / d - s) < 0.015) return [n, d]; } return null; }

// ---------- measures ----------
const agg = rows => { const t = {}; ['population', 'slum_pop', 'homeless', 'households', 'area_km2', 'literates', 'literates_f', 'females', 'males', 'girls_0_6', 'boys_0_6', 'children_0_6'].forEach(k => t[k] = rows.reduce((s, r) => s + r[k], 0)); t.n = rows.length; return t; };
const M = {
  slum_pct: { l: 'Share of people living in slums', s: 'slum share', f: p1, c: t => t.slum_pop / t.population * 100 },
  density_per_km2: { l: 'People per square kilometre', s: 'people per km²', f: inr, c: t => t.population / t.area_km2 },
  female_literacy_pct: { l: 'Female literacy (women aged 7 and over who can read and write)', s: 'female literacy', f: p1, c: t => t.literates_f / (t.females - t.girls_0_6) * 100 },
  homeless_per_10k: { l: 'Homeless people per 10,000 residents', s: 'homeless per 10,000', f: v => v.toFixed(1), c: t => t.homeless / t.population * 1e4 },
  literacy_pct: { l: 'Literacy (people aged 7 and over who can read and write)', s: 'literacy', f: p1, c: t => t.literates / (t.population - t.children_0_6) * 100 },
  sex_ratio: { l: 'Females per 1,000 males', s: 'females per 1,000 males', f: inr, c: t => t.females / t.males * 1000 },
  child_sex_ratio: { l: 'Girls per 1,000 boys (aged 0 to 6)', s: 'girls per 1,000 boys', f: inr, c: t => t.girls_0_6 / t.boys_0_6 * 1000 },
  hh_size: { l: 'People per household', s: 'household size', f: v => v.toFixed(2), c: t => t.population / t.households },
  population: { l: 'Population', s: 'population', f: inr, c: t => t.population / t.n, cn: 'Average ward' },
  slum_pop: { l: 'People living in slums', s: 'people in slums', f: inr, c: t => t.slum_pop / t.n, cn: 'Average ward' },
  homeless: { l: 'Homeless people', s: 'homeless people', f: inr, c: t => t.homeless / t.n, cn: 'Average ward' },
};
const RANK_M = ['slum_pct', 'density_per_km2', 'female_literacy_pct', 'homeless_per_10k', 'literacy_pct', 'sex_ratio', 'population'];
const REL_M = ['slum_pct', 'female_literacy_pct', 'literacy_pct', 'density_per_km2', 'homeless_per_10k', 'sex_ratio', 'child_sex_ratio', 'hh_size'];
const city = k => M[k].c(T);
const cityName = k => M[k].cn || 'Mumbai average';
const vals = k => W.map(r => r[k]);
const order = (k, desc = true) => W.map((r, i) => i).sort((a, b) => desc ? W[b][k] - W[a][k] : W[a][k] - W[b][k]);

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
const PCT = ['slum_pct', 'female_literacy_pct', 'literacy_pct'];
const tickF = (k, t) => PCT.includes(k) ? (Number.isInteger(t) ? t : t.toFixed(1)) + '%' : Number.isInteger(t) ? inr(t) : t.toFixed(1);
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
  const labW = Math.max(...o.rows.map(r => tw(r.label, fs, r.bold ? 700 : 400))) + 14, valW = Math.max(...o.rows.map(r => tw(o.fmt(r.v), fs, 700))) + 16;
  const x0 = 28 + labW, bw = w - x0 - valW - 30 - (o.dots ? 12 : 0), mx = o.max || Math.max(...o.rows.map(r => r.v), o.avg ? o.avg.v : 0), sx = v => v / mx * bw;
  if (o.avg) { const ax = x0 + sx(o.avg.v); s += `<line x1="${ax}" y1="${top - 8}" x2="${ax}" y2="${top + n * rowH}" stroke="${INK}" stroke-width="2" stroke-dasharray="6 4"/>` + tx(ax, top - 12, o.avg.label, { size: 15, weight: 700, anchor: ax > w * 0.7 ? 'end' : 'middle' }); }
  o.rows.forEach((r, k) => {
    const yy = top + k * rowH, th = rowH * 0.7;
    s += `<g data-w="${r.i}">` + tx(x0 - 10, yy + rowH / 2 + fs * 0.35, r.label, { size: fs, anchor: 'end', weight: r.bold ? 700 : 400 }) +
      (o.dots ? `<line x1="${x0}" y1="${yy + rowH / 2}" x2="${x0 + sx(r.v)}" y2="${yy + rowH / 2}" stroke="#d5dae2" stroke-width="2"/><circle cx="${x0 + sx(r.v)}" cy="${yy + rowH / 2}" r="${Math.min(9, th / 2).toFixed(1)}" fill="${r.col}"/>` : `<rect x="${x0}" y="${(yy + (rowH - th) / 2).toFixed(1)}" width="${Math.max(1, sx(r.v)).toFixed(1)}" height="${th.toFixed(1)}" fill="${r.col}" rx="2"/>`) +
      tx(x0 + sx(r.v) + (o.dots ? 14 : 6), yy + rowH / 2 + fs * 0.35, o.fmt(r.v), { size: fs, weight: r.bold ? 700 : 400, extra: ' paint-order="stroke" stroke="#fff" stroke-width="4"' }) + '</g>';
  });
  s += footer(w, h, o.src) + '</svg>';
  return s;
}
function svgMap(w, h, fill, stroke, pad = 6, sw = 0.8) {
  const [x0, y0, x1, y1] = BB, k = Math.cos(19.07 * Math.PI / 180), sc = Math.min((w - 2 * pad) / ((x1 - x0) * k), (h - 2 * pad) / (y1 - y0));
  const ox = (w - (x1 - x0) * k * sc) / 2, oy = (h - (y1 - y0) * sc) / 2, P = c => `${(ox + (c[0] - x0) * k * sc).toFixed(1)},${(oy + (y1 - c[1]) * sc).toFixed(1)}`;
  return geo.features.map((f, i) => { const g = f.geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; const d = polys.map(p => p.map(r => 'M' + r.map(P).join('L') + 'Z').join('')).join(''); return `<path d="${d}" fill="${fill(i)}" stroke="${stroke ? stroke(i) : '#7a8599'}" stroke-width="${sw}"/>`; }).join('');
}

// ---------- map ----------
const fc = feats => ({ type: 'FeatureCollection', features: feats });
function paint(colFn, opFn) { geo.features.forEach((f, i) => { f.properties.col = colFn(i); f.properties.op = opFn ? opFn(i) : 0.85; }); map.getSource('w').setData(geo); }
function setHL(ids, color = RED, width = 4) { map.getSource('hl').setData(fc(ids.map(i => geo.features[i]))); map.setPaintProperty('hl', 'line-color', color); map.setPaintProperty('hl', 'line-width', width); }
function setLabels(fn) { map.getSource('labs').setData(fc(W.map((r, i) => { const t = fn ? fn(i) : null; return { type: 'Feature', properties: { lab: t ? t[0] : '', tc: t ? t[1] || INK : INK, pri: t ? t[2] || 10 : 10 }, geometry: { type: 'Point', coordinates: [r.lon, r.lat] } }; }))); }
const lab2 = i => `${code(W[i])}\n${locs(W[i], 1)[0]}`;
function setCircles(feats) { map.getSource('pc').setData(fc(feats)); }
function circlesFor(k, maxR, colFn) { const mx = Math.max(...vals(k)); return W.map((r, i) => ({ type: 'Feature', properties: { r: maxR * Math.sqrt(r[k] / mx), c: colFn(i) }, geometry: { type: 'Point', coordinates: [r.lon, r.lat] } })); }
function circleLegend(k, maxR, title, col = NAVY) { const mx = Math.max(...vals(k)), ex = [niceMax(mx) / 5, niceMax(mx) / 2].map(v => v > mx ? mx : v); return `<b>${title}</b>` + ex.map(v => { const d = 2 * maxR * Math.sqrt(v / mx); return `<div class="sw"><i class="ring" style="width:${d.toFixed(0)}px;height:${d.toFixed(0)}px;background:${col};opacity:.55"></i>${v >= 1e5 ? lakh(v) : inr(v)} people</div>`; }).join(''); }
function legend(html, src = SRC) { const L = $('#legend'); if (!html) { L.hidden = true; return; } L.innerHTML = html + `<div class="src">${src}</div>`; L.hidden = false; }
const sw = (c, l, cls = '') => `<div class="sw"><i class="${cls}" style="background:${c}"></i>${l}</div>`;
function wardLayers(on) { ['w', 'w-line', 'hl', 'hl2', 'hov', 'labs', 'pc'].forEach(id => map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none')); ['gc', 'gm'].forEach(id => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', on ? 'none' : 'visible')); }
let pendingFit = null;
function fit(ids, padding = 30, dur = 0) { pendingFit = [ids, padding, dur]; }
function doFit() {
  if (!pendingFit) return; let [ids, padding, dur] = pendingFit; pendingFit = null;
  if (typeof padding === 'number') { padding = { top: padding, right: padding + 30, bottom: padding, left: padding }; const L = $('#legend'); if (!L.hidden) padding.bottom = L.offsetHeight + 40; }
  fitRaw(ids, padding, dur);
}
function fitRaw(ids, padding, dur) { let b = null; (ids || W.map((r, i) => i)).forEach(i => { const f = geo.features[i].geometry; const polys = f.type === 'Polygon' ? [f.coordinates] : f.coordinates; polys.forEach(p => p[0].forEach(c => { if (!b) b = [c[0], c[1], c[0], c[1]]; b = [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])]; })); }); map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding, duration: dur }); }
function choropleth(k, method = 'quantile', ncl = 5) { const v = vals(k), c = classify(v, method, ncl), P = pal(ncl); paint(i => P[c.cls[i]]); return { c, P }; }
function choroLegend(k, c, P, title) { return `<b>${title || M[k].l}</b>` + [...c.ranges.keys()].reverse().map(j => sw(P[j], c.ranges[j] ? `${M[k].f(c.ranges[j][0])} to ${M[k].f(c.ranges[j][1])} · ${c.groups[j].length} ward${c.groups[j].length === 1 ? '' : 's'}` : 'no wards')).join(''); }

// ---------- layout + routing ----------
function setLayout(l, cw = '58%') { const s = $('#stage'); s.dataset.layout = l; s.style.setProperty('--cw', cw); $('#chart').innerHTML = ''; if (map) map.resize(); }
const PARAMS = { brief: [], data: ['sort', 'dir'], rank: ['metric'], rates: ['measure', 'mode'], compare: [], relate: ['x', 'y'], map: ['metric', 'method', 'classes'], chart: ['chart'], declutter: ['stage'], bigidea: ['insight'], arc: ['insight'], tell: ['frame'], yourturn: ['view'] };
function readHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  if (q.has('step') && PARAMS[q.get('step')]) st.step = q.get('step');
  ['metric', 'sort', 'dir', 'measure', 'mode', 'x', 'y', 'method', 'chart', 'view'].forEach(k => { if (q.has(k)) st[k] = q.get(k); });
  ['classes', 'stage', 'insight', 'frame'].forEach(k => { if (q.has(k)) st[k] = +q.get(k); });
  if (!M[st.metric]) st.metric = 'slum_pct';
  st.classes = Math.max(3, Math.min(7, st.classes || 5)); st.stage = Math.max(1, Math.min(5, st.stage || 1)); st.frame = Math.max(1, Math.min(6, st.frame || 1)); st.insight = Math.max(0, Math.min(4, st.insight || 0));
  st.clean = q.get('clean') === '1'; document.body.classList.toggle('clean', st.clean && st.step === 'tell');
}
function writeHash() { const q = new URLSearchParams(); q.set('step', st.step); PARAMS[st.step].forEach(k => q.set(k, st[k])); if (st.clean && st.step === 'tell') q.set('clean', '1'); history.replaceState(null, '', '#' + q.toString()); }
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
  wardLayers(true); setHL([]); map.getSource('hl2').setData(fc([])); setCircles([]); setLabels(null); map.getSource('hov').setData(fc([]));
  pendingFit = null; R[step](); map.resize(); doFit(); writeHash(); settle();
}
function segOn(id, v) { $$(`#${id} button`).forEach(b => b.classList.toggle('on', b.dataset.v == v)); }
function seg(id, key, num) { $$(`#${id} button`).forEach(b => b.onclick = () => { st[key] = num ? +b.dataset.v : b.dataset.v; show(st.step); }); }

// ---------- hover linking ----------
function hover(i) {
  map.getSource('hov').setData(fc(i == null ? [] : [geo.features[i]]));
  $$('#chart [data-w]').forEach(e => e.classList.toggle('hov', e.dataset.w == i));
  $$('#chart g[data-w]').forEach(e => e.style.opacity = i == null || e.dataset.w == i ? 1 : 0.45);
}

// ================= steps =================
const R = {};

R.brief = () => {
  setLayout('split', '52%');
  $('#b-aud').value = B.aud; $('#b-dec').value = B.dec; $('#b-ask').value = B.ask;
  paint(() => '#dfe5f1', () => 0.75); fit(null, 30);
  $('#chart').innerHTML = `<div class="st-panel"><div class="st-h1">The brief</div><div class="st-h2">Three questions to answer before you open the data</div>
   <div class="st-cards">
    <div class="st-card"><h4>1 · Audience: who will listen?</h4><div class="big">${esc(B.aud)}</div></div>
    <div class="st-card"><h4>2 · Decision: what must they decide?</h4><div class="big">${esc(B.dec)}</div></div>
    <div class="st-card acc"><h4>3 · Ask: what do you want them to do?</h4><div class="big">${esc(B.ask)}</div></div>
   </div><div class="st-src">The map shows Mumbai's 24 municipal wards. The data come next, in step 1.<br>${SRC}</div></div>`;
  legend(`<b>Mumbai's 24 municipal wards</b>` + sw('#dfe5f1', 'One ward (run by the BMC as a unit)'));
};

R.data = () => {
  setLayout('split', '74%');
  const cols = [['ward', 'Ward and localities'], ['zone', 'Part of city'], ['population', 'Population', inr], ['slum_pct', 'Slum share', p1], ['density_per_km2', 'People per km²', inr], ['homeless_per_10k', 'Homeless per 10,000', v => v.toFixed(1)], ['female_literacy_pct', 'Female literacy', p1]];
  const idx = W.map((r, i) => i).sort((a, b) => { const x = W[a][st.sort], y = W[b][st.sort]; const c = typeof x === 'string' ? x.localeCompare(y) : x - y; return st.dir === 'asc' ? c : -c; });
  const sname2 = r => `<b>${esc(code(r))}</b> <small>${esc(locs(r, 2).join(', '))}</small>`;
  $('#chart').innerHTML = `<div class="st-panel"><div class="st-h1">One row = one ward: 24 rows, Census 2011</div><div class="st-h2">Sorted by ${esc(cols.find(c => c[0] === st.sort)?.[1] || st.sort).toLowerCase()}, ${st.dir === 'asc' ? 'lowest' : 'highest'} first. Click a heading to sort.</div>
  <table class="st-tbl"><thead><tr>${cols.map(c => `<th data-k="${c[0]}" class="${c[2] ? 'n' : ''} ${c[0] === st.sort ? 'on' : ''}">${c[1]}${c[0] === st.sort ? (st.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
  <tbody>${idx.map(i => `<tr data-w="${i}">${cols.map(c => c[0] === 'ward' ? `<td>${sname2(W[i])}</td>` : `<td class="${c[2] ? 'n' : ''}">${c[2] ? c[2](W[i][c[0]]) : esc(W[i][c[0]])}</td>`).join('')}</tr>`).join('')}
  <tr style="font-weight:700"><td>Mumbai (all 24 wards)</td><td></td><td class="n">${inr(T.population)}</td><td class="n">${p1(city('slum_pct'))}</td><td class="n">${inr(city('density_per_km2'))}</td><td class="n">${city('homeless_per_10k').toFixed(1)}</td><td class="n">${p1(city('female_literacy_pct'))}</td></tr></tbody></table>
  <div class="st-src">${SRC}</div></div>`;
  $$('#chart th').forEach(th => th.onclick = () => { const k = th.dataset.k === 'ward' ? 'ward' : th.dataset.k; if (st.sort === k) st.dir = st.dir === 'asc' ? 'desc' : 'asc'; else { st.sort = k; st.dir = typeof W[0][k] === 'string' ? 'asc' : 'desc'; } show('data'); });
  $$('#chart tr[data-w]').forEach(tr => { tr.onmouseenter = () => hover(+tr.dataset.w); tr.onmouseleave = () => hover(null); });
  // fit the table: shrink row padding if needed
  const p = $('#chart .st-panel'), tb = $('#chart .st-tbl'); let pad = 3.5; while (p.scrollHeight > p.clientHeight + 1 && pad > 0.5) { pad -= 0.5; tb.querySelectorAll('td').forEach(td => td.style.padding = pad + 'px 6px'); }
  const zc = { 'Island City': '#f2f4f9', 'Western Suburbs': '#bccae2', 'Eastern Suburbs': '#7f97c4' };
  paint(i => zc[W[i].zone], () => 0.8); fit(null, 20); setLabels(i => [lab2(i), INK, 1]); hoverKey = 'population';
  legend('<b>Three parts of Mumbai</b>' + Object.entries(zc).map(([z, c]) => sw(c, z)).join('') + '<div style="margin-top:4px">Labels: ward and main locality</div>');
  $('#data-tot').innerHTML = `<h3>The city in one line</h3><b>${inr(T.population)}</b> people (${lakh(T.population)}), <b>${inr(T.households)}</b> households, <b>${T.area_km2.toFixed(1)} km²</b>. <b>${inr(T.slum_pop)}</b> people (${p1(city('slum_pct'))}) lived in slums and <b>${inr(T.homeless)}</b> were homeless.`;
};

const tiedNames = (k, v) => listJoin(W.filter(r => r[k] === v).map(r => sname(r)));
R.rank = () => {
  setLayout('split', '60%'); const k = st.metric, m = M[k], ix = order(k), n = ix.length;
  const top = ix.slice(0, 3), bot = ix.slice(n - 3), col = i => top.includes(i) ? RED : bot.includes(i) ? NAVY : GREY;
  $('#chart').innerHTML = hbar({ title: m.l + ', by ward', sub: `Highest: ${tiedNames(k, W[ix[0]][k])}, ${m.f(W[ix[0]][k])}. Lowest: ${tiedNames(k, W[ix[n - 1]][k])}, ${m.f(W[ix[n - 1]][k])}${W.filter(r => r[k] === W[ix[n - 1]][k]).length > 1 ? ' each' : ''}.`, rows: ix.map(i => ({ i, label: sname(W[i]), v: W[i][k], col: col(i), bold: top.includes(i) || bot.includes(i) })), fmt: m.f, avg: { v: city(k), label: `${cityName(k)}: ${m.f(city(k))}` }, key: [[RED, 'Highest three'], [NAVY, 'Lowest three'], [GREY, 'Other wards'], [INK, cityName(k), 'line']] });
  const { c, P } = choropleth(k, 'quantile', 5); setHL(top, RED, 4); map.getSource('hl2').setData(fc(bot.map(i => geo.features[i])));
  setLabels(i => top.includes(i) || bot.includes(i) ? [lab2(i), top.includes(i) ? RED : NAVY, 1] : null); fit(null, 20); hoverKey = k;
  legend(choroLegend(k, c, P, m.l + ' (five equal-count groups)') + sw('#fff;border:3px solid ' + RED, 'Highest three, outlined') + sw('#fff;border:3px solid ' + NAVY, 'Lowest three, outlined'));
  $('#rank-out').innerHTML = `<div class="ga-big">${m.f(W[ix[0]][k])}</div>${esc(tiedNames(k, W[ix[0]][k]))}: the highest ${m.s}. Lowest: ${esc(tiedNames(k, W[ix[n - 1]][k]))} (${m.f(W[ix[n - 1]][k])}). ${cityName(k)}: <b>${m.f(city(k))}</b>. ${W.filter(r => r[k] > city(k)).length} of 24 wards are above it.`;
  bindHover();
};
function bindHover() { $$('#chart g[data-w]').forEach(g => { g.onmouseenter = () => hover(+g.dataset.w); g.onmouseleave = () => hover(null); }); }

const RATES = { homeless: { count: 'homeless', rate: 'homeless_per_10k', ct: 'Homeless people, by ward (count)', rt: 'Homeless people per 10,000 residents, by ward', cu: 'homeless people', ru: 'per 10,000 residents' }, slum: { count: 'slum_pop', rate: 'slum_pct', ct: 'People living in slums, by ward (count)', rt: 'Share of people living in slums, by ward', cu: 'people in slums', ru: 'of residents in slums' } };
function ratesLeaders(t) { const a = RATES[t], ci = order(a.count)[0], ri = order(a.rate)[0]; return { ci, ri, txt: `By count: ${sname(W[ci])}, ${inr(W[ci][a.count])} ${a.cu}. By ${t === 'slum' ? 'share' : 'rate'}: ${sname(W[ri])}, ${M[a.rate].f(W[ri][a.rate])} ${a.ru}.` }; }
R.rates = () => {
  setLayout('split', '60%'); const a = RATES[st.measure], k = st.mode === 'count' ? a.count : a.rate, ix = order(k), top = ix.slice(0, 3), L = ratesLeaders(st.measure);
  segOn('rates-t', st.measure); segOn('rates-m', st.mode);
  const fmt = st.mode === 'count' ? (st.measure === 'slum' ? lakh : inr) : M[k].f;
  const lead = st.mode === 'count' ? `By count, ${sname(W[L.ci])} leads.` : `By ${st.measure === 'slum' ? 'share' : 'rate'}, ${sname(W[L.ri])} leads.`;
  $('#chart').innerHTML = hbar({ title: st.mode === 'count' ? a.ct : a.rt, sub: lead + ' ' + (st.mode === 'count' ? `By ${st.measure === 'slum' ? 'share' : 'rate'}: ${sname(W[L.ri])}.` : `By count: ${sname(W[L.ci])}.`), rows: ix.map(i => ({ i, label: sname(W[i]), v: W[i][k], col: top.includes(i) ? RED : GREY, bold: top.includes(i) })), fmt, avg: { v: city(k), label: `${cityName(k)}: ${fmt(city(k))}` }, key: [[RED, 'Top three'], [GREY, 'Other wards'], [INK, cityName(k), 'line']] });
  if (st.mode === 'count') { paint(() => '#eef1f6', () => 0.7); setCircles(circlesFor(k, 34, i => top.includes(i) ? RED : NAVY)); legend(circleLegend(k, 34, M[k].l + ': circle area = count') + sw(RED, 'Top three', 'ring') + sw(NAVY, 'Other wards', 'ring')); }
  else { const { c, P } = choropleth(k, 'quantile', 5); setHL(top); legend(choroLegend(k, c, P, M[k].l + ' (five equal-count groups)') + sw('#fff;border:3px solid ' + RED, 'Top three, outlined')); }
  setLabels(i => top.includes(i) ? [lab2(i), RED, 1] : null); fit(st.measure === 'homeless' && st.mode === 'count' ? null : null, 20); hoverKey = k;
  $('#rates-out').innerHTML = `<p><b>${esc(L.txt.split('. By')[0])}.</b></p><p><b>By${esc(L.txt.split('. By')[1])}</b></p><p class="ga-note">${st.measure === 'homeless' ? 'Here both views agree on South Mumbai: the homeless sleep where the work is.' : 'Two different leaders: the biggest number of slum dwellers is not where the share is highest.'}</p>`;
  bindHover();
};

const ZONES = ['Island City', 'Western Suburbs', 'Eastern Suburbs'], ZC = { 'Island City': '#f2f4f9', 'Western Suburbs': '#bccae2', 'Eastern Suburbs': '#7f97c4' };
R.compare = () => {
  setLayout('chart'); const [w, h] = box(), Z = ZONES.map(z => agg(W.filter(r => r.zone === z)));
  const ms = ['slum_pct', 'female_literacy_pct', 'density_per_km2', 'homeless_per_10k'];
  let s = svgOpen(w, h); const hd = header(w, 'The three parts of Mumbai against the city average', `Eastern Suburbs: ${p1(M.slum_pct.c(Z[2]))} in slums. Island City: ${p1(M.slum_pct.c(Z[0]))}. Western Suburbs: ${p1(M.slum_pct.c(Z[1]))}. Mumbai: ${p1(city('slum_pct'))}.`); s += hd.s;
  let y0 = hd.y + 8; s += keyRow(28, y0 + 8, [[NAVY, 'Part of the city', 'dot'], [RED, 'Mumbai average', 'line']]); y0 += 30;
  const mapW = Math.min(300, w * 0.24), gw = w - mapW - 40, ph = (h - y0 - 50) / 2, pw = (gw - 28) / 2;
  ms.forEach((k, j) => {
    const px = 28 + (j % 2) * pw, py = y0 + Math.floor(j / 2) * ph, v = Z.map(t => M[k].c(t)), av = city(k);
    const lo = k === 'female_literacy_pct' ? Math.floor((Math.min(...v, av) - 3) / 5) * 5 : 0, hi = k === 'female_literacy_pct' ? Math.ceil((Math.max(...v, av) + 1) / 5) * 5 : niceMax(Math.max(...v, av) * 1.08);
    const labW = 168, ax0 = px + labW, ax1 = px + pw - 84, sx = x => ax0 + (x - lo) / (hi - lo) * (ax1 - ax0), rowY = r => py + 70 + r * ((ph - 110) / 2);
    s += tx(px, py + 30, M[k].l.split(' (')[0] + (k === 'female_literacy_pct' ? ' (%)' : k === 'slum_pct' ? ' (%)' : ''), { size: 22, weight: 700, fill: NAVY });
    ticks(lo, hi, 3).forEach(t => { s += `<line x1="${sx(t)}" y1="${py + 52}" x2="${sx(t)}" y2="${rowY(2) + 18}" stroke="#e3e7ee"/>` + tx(sx(t), rowY(2) + 40, tickF(k, t), { size: 15, fill: MUTE, anchor: 'middle' }); });
    s += `<line x1="${sx(av)}" y1="${py + 48}" x2="${sx(av)}" y2="${rowY(2) + 18}" stroke="${RED}" stroke-width="2.5" stroke-dasharray="6 4"/>` + tx(sx(av) + 6, py + 52, `Mumbai ${M[k].f(av)}`, { size: 15, weight: 700, fill: RED, anchor: sx(av) > ax1 - 60 ? 'end' : 'start' });
    ZONES.forEach((z, r) => { const yy = rowY(r); s += tx(px, yy + 6, z, { size: 17 }) + `<line x1="${ax0}" y1="${yy}" x2="${ax1}" y2="${yy}" stroke="#eef0f4" stroke-width="1"/><circle cx="${sx(v[r])}" cy="${yy}" r="10" fill="${NAVY}"/>` + tx(sx(v[r]) + 15, yy + 6, M[k].f(v[r]), { size: 18, weight: 700, extra: ' paint-order="stroke" stroke="#fff" stroke-width="5"' }); });
    if (k === 'female_literacy_pct') s += tx(ax1 + 64, py + 30, `axis starts at ${lo}%`, { size: 14, fill: MUTE, anchor: 'end' });
  });
  const mx = w - mapW - 12, mh = h - y0 - 130; s += `<g transform="translate(${mx},${y0})">` + svgMap(mapW, mh, i => ZC[W[i].zone], null, 4, 0.7) + '</g>';
  ZONES.forEach((z, r) => { s += `<rect x="${mx + 4}" y="${y0 + mh + 14 + r * 26}" width="22" height="16" rx="3" fill="${ZC[z]}" stroke="rgba(0,0,0,.3)"/>` + tx(mx + 34, y0 + mh + 28 + r * 26, z, { size: 15 }); });
  s += footer(w, h) + '</svg>'; $('#chart').innerHTML = s;
  $('#compare-out').innerHTML = `<table style="width:100%">${ZONES.map((z, r) => `<tr><td>${z}</td><td style="text-align:right"><b>${p1(M.slum_pct.c(Z[r]))}</b> in slums</td></tr>`).join('')}<tr><td><b>Mumbai</b></td><td style="text-align:right"><b>${p1(city('slum_pct'))}</b></td></tr></table>`;
};

R.relate = () => {
  setLayout('chart'); $('#rel-x').value = st.x; $('#rel-y').value = st.y;
  const [w, h] = box(), X = vals(st.x), Y = vals(st.y), { r, a, b } = corr(X, Y), mx = M[st.x], my = M[st.y];
  const dir = r < 0 ? 'negative' : 'positive', word = strength(r);
  const title = `${word[0].toUpperCase() + word.slice(1)} ${dir} link: r = ${rtxt(r)}`;
  const sub = Math.abs(r) < 0.2 ? `${my.l.split(' (')[0]} and ${mx.s} hardly move together across the 24 wards.` : `Wards with a higher ${mx.s} tend to have ${r < 0 ? 'lower' : 'higher'} ${my.s}. Across: ${mx.l.split(' (')[0].toLowerCase()}. Up: ${my.l.split(' (')[0].toLowerCase()}.`;
  let s = svgOpen(w, h); const hd = header(w, title, sub); s += hd.s;
  const keyY = hd.y + 10, maxR = 26, pop = vals('population'), pm = Math.max(...pop), rad = i => 5 + maxR * Math.sqrt(pop[i] / pm);
  const L = 110, Rr = w - 40, Tt = keyY + 100, Bb = h - 128;
  const ext = (v, padF) => { const lo = Math.min(...v), hi = Math.max(...v), p = (hi - lo) * padF; return [lo - p, hi + p]; };
  const [x0, x1] = ext(X, 0.08), [y0, y1] = ext(Y, 0.1), sx = v => L + (v - x0) / (x1 - x0) * (Rr - L), sy = v => Bb - (v - y0) / (y1 - y0) * (Bb - Tt);
  ticks(x0, x1, 6).forEach(t => { if (t < x0 || t > x1) return; s += `<line x1="${sx(t)}" y1="${Tt}" x2="${sx(t)}" y2="${Bb}" stroke="#eceff4"/>` + tx(sx(t), Bb + 22, tickF(st.x, t), { size: 15, fill: MUTE, anchor: 'middle' }); });
  ticks(y0, y1, 5).forEach(t => { if (t < y0 || t > y1) return; s += `<line x1="${L}" y1="${sy(t)}" x2="${Rr}" y2="${sy(t)}" stroke="#eceff4"/>` + tx(L - 10, sy(t) + 5, tickF(st.y, t), { size: 15, fill: MUTE, anchor: 'end' }); });
  s += `<line x1="${L}" y1="${Bb}" x2="${Rr}" y2="${Bb}" stroke="#9aa3b2"/><line x1="${L}" y1="${Tt}" x2="${L}" y2="${Bb}" stroke="#9aa3b2"/>`;
  s += tx((L + Rr) / 2, Bb + 52, mx.l + ' →', { size: 17, weight: 700, anchor: 'middle' }) + tx(28, Tt - 14, '↑ ' + my.l, { size: 17, weight: 700 });
  const ya = a + b * x0, yb = a + b * x1; s += `<line x1="${sx(x0)}" y1="${sy(ya)}" x2="${sx(x1)}" y2="${sy(yb)}" stroke="${NAVY}" stroke-width="2.5" stroke-dasharray="8 5"/>`;
  // which wards to label: furthest from the trend + extremes
  const res = W.map((_, i) => ({ i, e: Math.abs(Y[i] - (a + b * X[i])) })).sort((p, q) => q.e - p.e).slice(0, 4).map(p => p.i);
  const lab = [...new Set([...res, order(st.x)[0], order(st.x, false)[0], order(st.y)[0], order(st.y, false)[0]])];
  W.map((_, i) => i).sort((p, q) => pop[q] - pop[p]).forEach(i => { const on = lab.includes(i); s += `<circle data-w="${i}" cx="${sx(X[i]).toFixed(1)}" cy="${sy(Y[i]).toFixed(1)}" r="${rad(i).toFixed(1)}" fill="${on ? RED : NAVY}" fill-opacity="${on ? 0.45 : 0.22}" stroke="${on ? RED : NAVY}" stroke-width="1.5"/>`; });
  const placed = [], fs = 15;
  lab.forEach(i => {
    const cx = sx(X[i]), cy = sy(Y[i]), rr = rad(i), t = sname(W[i]), tw0 = tw(t, fs, 700);
    const cand = [[cx + rr + 6, cy + 5, 'start'], [cx - rr - 6, cy + 5, 'end'], [cx, cy - rr - 8, 'middle'], [cx, cy + rr + 19, 'middle'], [cx + rr + 4, cy - rr - 2, 'start'], [cx - rr - 4, cy + rr + 14, 'end']];
    const bx = ([x, y, an]) => { const x0b = an === 'start' ? x : an === 'end' ? x - tw0 : x - tw0 / 2; return [x0b - 2, y - fs, x0b + tw0 + 2, y + 4]; };
    const bad = c => { const q = bx(c); let n = 0; if (q[0] < L + 2 || q[2] > Rr || q[1] < Tt - 4 || q[3] > Bb - 2) n += 100; n += 10 * placed.filter(p => !(q[2] < p[0] || q[0] > p[2] || q[3] < p[1] || q[1] > p[3])).length; W.forEach((_, j) => { if (j === i) return; const px = Math.max(q[0], Math.min(sx(X[j]), q[2])), py = Math.max(q[1], Math.min(sy(Y[j]), q[3])); if ((px - sx(X[j])) ** 2 + (py - sy(Y[j])) ** 2 < rad(j) ** 2) n++; }); return n; };
    const ok = c => { const q = bx(c); if (q[0] < L + 2 || q[2] > Rr || q[1] < Tt - 4 || q[3] > Bb - 2) return false; if (placed.some(p => !(q[2] < p[0] || q[0] > p[2] || q[3] < p[1] || q[1] > p[3]))) return false; return !W.some((_, j) => { if (j === i) return false; const px = Math.max(q[0], Math.min(sx(X[j]), q[2])), py = Math.max(q[1], Math.min(sy(Y[j]), q[3])); return (px - sx(X[j])) ** 2 + (py - sy(Y[j])) ** 2 < rad(j) ** 2; }); };
    const c = cand.find(ok) || [...cand].sort((p, q) => bad(p) - bad(q))[0]; placed.push(bx(c)); s += tx(c[0], c[1], t, { size: fs, weight: 700, anchor: c[2], fill: '#7a0000', extra: ' paint-order="stroke" stroke="#fff" stroke-width="4"' });
  });
  // key
   const kY = keyY + 22; let kx = 28; s += `<circle cx="${kx + 12}" cy="${kY}" r="${(5 + maxR * Math.sqrt(3e5 / pm)).toFixed(1)}" fill="${NAVY}" fill-opacity=".22" stroke="${NAVY}"/>`; kx += 40; s += tx(kx, kY + 5, '3 lakh people', { size: 15 }); kx += tw('3 lakh people', 15) + 22;
  s += `<circle cx="${kx + 32}" cy="${kY}" r="${(5 + maxR * Math.sqrt(9e5 / pm)).toFixed(1)}" fill="${NAVY}" fill-opacity=".22" stroke="${NAVY}"/>`; kx += 72; s += tx(kx, kY + 5, '9 lakh people (circle size = population)', { size: 15 }); kx += tw('9 lakh people (circle size = population)', 15) + 26;
  s += keyRow(kx, kY + 5, [[RED, 'Named wards: furthest from the trend or at the extremes', 'dot'], [NAVY, 'Trend line', 'line']]);
  s += tx(28, h - 44, 'A link is not proof of cause: slums, migration, schooling and income all move together.', { size: 16, weight: 700, fill: INK });
  s += footer(w, h) + '</svg>'; $('#chart').innerHTML = s;
  $('#relate-out').innerHTML = `<div class="ga-big">r = ${rtxt(r)}</div>${word[0].toUpperCase() + word.slice(1)} ${dir} link between ${mx.s} and ${my.s} across the 24 wards. r runs from −1 (perfectly opposite) through 0 (no link) to +1 (perfectly together). <b>A link is not proof of cause.</b>`;
};

R.map = () => {
  setLayout('split', '50%'); $('#map-m').value = st.metric; segOn('map-meth', st.method); segOn('map-k', st.classes);
  const k = st.metric, m = M[k], v = vals(k), K = st.classes, P = pal(K), c = classify(v, st.method, K);
  paint(i => P[c.cls[i]]); const topG = c.groups[K - 1]; setHL(topG, RED, 3); setLabels(i => topG.includes(i) ? [lab2(i), '#7a0000', 1] : null); fit(null, 20); hoverKey = k;
  legend(choroLegend(k, c, P, `${m.l}: ${METH[st.method].toLowerCase()}`) + sw('#fff;border:3px solid ' + RED, 'Darkest group, outlined'));
  const [w, h] = box(); let s = svgOpen(w, h);
  const darkPop = topG.reduce((t, i) => t + W[i].population, 0) / T.population * 100;
  const cmp = ['quantile', 'equal', 'jenks'].map(mm => { const cc = classify(v, mm, K); return [mm, cc.groups[K - 1].length]; });
  const hd = header(w, `${METH[st.method]}: ${topG.length} ward${topG.length === 1 ? '' : 's'} in the darkest group`, `${m.l}, ${K} groups; the darkest holds ${p1(darkPop)} of Mumbai's people. Wards in the darkest group by method: ${cmp.map(([mm, n]) => `${METH[mm].split(' (')[0].toLowerCase()} ${n}`).join(', ')}.`); s += hd.s;
  // number line
  const L = 40, Rr = w - 40, y0 = hd.y + 86, lo = Math.min(...v), hi = Math.max(...v), sx = x => L + (x - lo) / (hi - lo) * (Rr - L);
  wrap('Each dot is a ward, placed by its value. Dashed lines: where one group ends and the next begins.', 16, w - 2 * L).forEach((l, z) => s += tx(L, hd.y + 22 + z * 21, l, { size: 16, fill: INK }));
  const stack = {}; const ys = W.map((_, i) => { const key = Math.round(sx(v[i]) / 16); stack[key] = (stack[key] || 0) + 1; return y0 + 40 - (stack[key] - 1) * 17; });
  s += `<line x1="${L}" y1="${y0 + 52}" x2="${Rr}" y2="${y0 + 52}" stroke="#9aa3b2"/>`;
  ticks(lo, hi, 6).forEach(t => { if (t >= lo && t <= hi) s += `<line x1="${sx(t)}" y1="${y0 + 52}" x2="${sx(t)}" y2="${y0 + 58}" stroke="#9aa3b2"/>` + tx(sx(t), y0 + 76, tickF(k, t), { size: 15, fill: MUTE, anchor: 'middle' }); });
  for (let j = 0; j < K - 1; j++) { const a = c.ranges[j], b2 = c.ranges[j + 1]; if (!a || !b2) continue; const bx = st.method === 'equal' ? sx(a[1]) : (sx(a[1]) + sx(b2[0])) / 2;  s += `<line x1="${bx}" y1="${y0 - 22}" x2="${bx}" y2="${y0 + 56}" stroke="${INK}" stroke-width="1.5" stroke-dasharray="5 4"/>`; }
  W.forEach((_, i) => { s += `<circle data-w="${i}" cx="${sx(v[i]).toFixed(1)}" cy="${ys[i]}" r="8" fill="${P[c.cls[i]]}" stroke="${c.cls[i] === K - 1 ? RED : '#55607a'}" stroke-width="${c.cls[i] === K - 1 ? 2.5 : 1.2}"/>`; });
  // group table
  let ty = y0 + 118; s += tx(L, ty, 'The groups', { size: 22, weight: 700, fill: NAVY }); ty += 12;
  const nameLines = g => { const out = []; let line = ''; g.forEach((i, z) => { const t = `${code(W[i])} (${locs(W[i], 1)[0]})` + (z < g.length - 1 ? ',' : ''); const tt = line ? line + ' ' + t : t; if (tw(tt, 14.5) > w - L - 280 && line) { out.push(line); line = t; } else line = tt; }); if (line) out.push(line); return out; };
  let yy = ty;
  [...c.ranges.keys()].reverse().forEach(j => {
    const g = c.groups[j], rg = c.ranges[j], nl = nameLines(g);
    s += `<rect x="${L}" y="${yy + 8}" width="28" height="20" rx="3" fill="${P[j]}" stroke="rgba(0,0,0,.3)"/>` + tx(L + 40, yy + 24, rg ? `${m.f(rg[0])} to ${m.f(rg[1])}` : 'no wards', { size: 16, weight: 700 }) + tx(L + 195, yy + 24, `${g.length} ward${g.length === 1 ? '' : 's'}`, { size: 16 });
    nl.forEach((ln, z) => s += tx(L + 270, yy + 24 + z * 18, ln, { size: 14.5, fill: MUTE }));
    yy += Math.max(1, nl.length) * 18 + 12;
  });
  s += footer(w, h, SRC, L) + '</svg>'; $('#chart').innerHTML = s;
  $('#map-out').innerHTML = `Same ${m.s}, ${K} groups. Wards in the darkest group: ${cmp.map(([mm, n]) => `<b>${METH[mm].split(' (')[0]}</b> ${n}`).join(' · ')}. Equal counts puts the same number of wards in every group; equal steps cuts the range into equal slices; natural breaks puts the lines in the biggest gaps.`;
};

const VERD = {
  pie: ['no', 'Pie chart: 24 thin slices. Nobody can tell which is biggest; angles are hard to compare.'],
  table: ['no', 'Table: exact numbers, good for look-up, but the eye must hunt for the biggest.'],
  bar: ['ok', 'Sorted bar chart: the ranking jumps out, top to bottom.'],
  dot: ['ok', 'Dot plot: the same ranking with less ink; useful when bars feel heavy.'],
  map: ['ok', 'Map: shows where (the suburbs), but not the ranking. Use it for "where", not "how many".'],
};
R.chart = () => {
  segOn('chart-c', st.chart); const v = VERD[st.chart], q = 'Which wards have the most people in slums?';
  const vh = `<div class="st-verdict"><span class="${v[0]}">${v[0] === 'ok' ? '✓' : '✗'}</span> ${esc(v[1])}</div>`;
  const ix = order('slum_pop'), top = ix.slice(0, 3);
  $('#chart-out').innerHTML = `<b>${v[0] === 'ok' ? '✓' : '✗'}</b> ${esc(v[1])}`;
  if (st.chart === 'map') {
    setLayout('split', '42%');
    $('#chart').innerHTML = `<div class="st-panel"><div class="st-h1">${q}</div>${vh}<p style="font-size:20px;line-height:1.5">Each circle's area is the number of people living in slums in that ward. The big circles sit in the suburbs: ${listJoin(top.map(i => sname(W[i])))}.</p><p style="font-size:20px;line-height:1.5">But can you say which circle is the biggest? A map answers <b>where</b>; a sorted bar answers <b>how many</b>.</p><div class="st-src">${SRC}</div></div>`;
    paint(() => '#eef1f6', () => 0.7); setCircles(circlesFor('slum_pop', 36, i => top.includes(i) ? RED : NAVY)); setLabels(i => top.includes(i) ? [lab2(i), RED, 1] : null); fit(null, 20); hoverKey = 'slum_pop';
    legend(circleLegend('slum_pop', 36, 'People living in slums: circle area') + sw(RED, 'Top three wards', 'ring') + sw(NAVY, 'Other wards', 'ring'));
    return;
  }
  setLayout('chart'); const [w, h] = box();
  if (st.chart === 'table') {
    const alpha = W.map((r, i) => i);
    const half = Math.ceil(N / 2), tbl = part => `<table class="st-tbl st-big"><thead><tr><th>Ward and localities</th><th class="n">People in slums</th></tr></thead><tbody>${part.map(i => `<tr><td><b>${esc(code(W[i]))}</b> <small>${esc(locs(W[i], 2).join(', '))}</small></td><td class="n">${inr(W[i].slum_pop)}</td></tr>`).join('')}</tbody></table>`;
    $('#chart').innerHTML = `<div class="st-panel"><div class="st-h1">${q}</div>${vh}<div style="display:grid;grid-template-columns:1fr 1fr;gap:40px">${tbl(alpha.slice(0, half))}${tbl(alpha.slice(half))}</div><div class="st-src">Wards in their official order, as the table usually arrives. ${SRC}</div></div>`;
    return;
  }
  if (st.chart === 'bar' || st.chart === 'dot') {
    const inner = hbar({ size: [w, h], title: q, subHTML: vh.replace(/^<div class="st-verdict">|<\/div>$/g, ''), rows: ix.map(i => ({ i, label: sname(W[i]), v: W[i].slum_pop, col: top.includes(i) ? RED : (st.chart === 'dot' ? NAVY : GREY), bold: top.includes(i) })), fmt: lakh, dots: st.chart === 'dot', key: [[RED, 'Top three', st.chart === 'dot' ? 'dot' : null], [st.chart === 'dot' ? NAVY : GREY, 'Other wards', st.chart === 'dot' ? 'dot' : null]] });
    const svg = inner;
    $('#chart').innerHTML = svg;
    bindHover(); return;
  }
  // pie
  let s = svgOpen(w, h); s += tx(28, 40, q, { size: 28, weight: 700, fill: NAVY });
  s += `<foreignObject x="20" y="52" width="${w - 40}" height="44"><div xmlns="http://www.w3.org/1999/xhtml" class="st-verdict" style="margin:0;font-family:${FONT.replace(/"/g, "'")}"><span class="no">✗</span> ${esc(v[1])}</div></foreignObject>`;
  const cx = w * 0.32, cy = (h + 60) / 2, rr = Math.min(w * 0.27, (h - 170) / 2); let a0 = -Math.PI / 2; const tot = T.slum_pop;
  W.forEach((r, i) => { const a1 = a0 + r.slum_pop / tot * 2 * Math.PI, lg = a1 - a0 > Math.PI ? 1 : 0; s += `<path d="M${cx},${cy}L${cx + rr * Math.cos(a0)},${cy + rr * Math.sin(a0)}A${rr},${rr} 0 ${lg} 1 ${cx + rr * Math.cos(a1)},${cy + rr * Math.sin(a1)}Z" fill="hsl(${i * 15},62%,${i % 2 ? 62 : 72}%)" stroke="#fff" stroke-width="1"/>`; a0 = a1; });
  const lx = w * 0.62, ly = 128, lh = (h - ly - 50) / 13;
  W.forEach((r, i) => { const col = Math.floor(i / 12), row = i % 12, xx = lx + col * (w - lx) / 2, yy = ly + row * lh * 1.08; s += `<rect x="${xx}" y="${yy - 13}" width="18" height="15" fill="hsl(${i * 15},62%,${i % 2 ? 62 : 72}%)"/>` + tx(xx + 24, yy, `${code(r)} (${locs(r, 1)[0]})`, { size: 14 }); });
  s += footer(w, h) + '</svg>'; $('#chart').innerHTML = s;
};

const DSTAGE = ['', 'The default chart', 'Remove gridlines, borders and the legend box', 'Sort, turn sideways and label directly', 'Grey everything; colour only what matters', 'Say the point in the title'];
R.declutter = () => {
  setLayout('chart'); segOn('dec-s', st.stage); const S = st.stage, [w, h] = box(), k = 'slum_pct', ix = order(k), top = ix.slice(0, 3), t2 = ix.slice(0, 2);
  const share2 = t2.reduce((a, i) => a + W[i].slum_pop, 0) / t2.reduce((a, i) => a + W[i].population, 0), fr = niceFrac(share2);
  const action = `${fr ? `${fr[0]} of ${fr[1]}` : p1(share2 * 100)} people in ${t2.map(i => plain(W[i])).join(' and ')} live in slums`;
  const rainbow = i => `hsl(${i * 15},70%,55%)`;
  const tag = tx(w - 24, 30, `Stage ${S} of 5 · ${DSTAGE[S]}`, { size: 15, weight: 700, fill: MUTE, anchor: 'end' });
  let s;
  if (S <= 2) {
    s = svgOpen(w, h) + (S === 1 ? `<rect x="6" y="44" width="${w - 12}" height="${h - 50}" fill="none" stroke="#888" stroke-width="1.5"/>` : '') + tag;
    s += tx(w / 2, 82, 'Slum population by ward', { size: 24, weight: 700, anchor: 'middle' });
    const L = 90, Rr = w - (S === 1 ? 250 : 40), Tt = 110, Bb = h - 230, bw = (Rr - L) / N, sy = v => Bb - v / 100 * (Bb - Tt);
    if (S === 1) { for (let t = 0; t <= 100; t += 10) s += `<line x1="${L}" y1="${sy(t)}" x2="${Rr}" y2="${sy(t)}" stroke="#b5b5b5"/>`; s += `<rect x="${L}" y="${Tt}" width="${Rr - L}" height="${Bb - Tt}" fill="none" stroke="#666" stroke-width="1.5"/>`; s += `<rect x="${Rr + 20}" y="${Tt + 20}" width="200" height="44" fill="#fff" stroke="#666"/><rect x="${Rr + 34}" y="${Tt + 35}" width="16" height="14" fill="hsl(200,70%,55%)"/>` + tx(Rr + 58, Tt + 48, 'Slum population (%)', { size: 14 }); }
    for (let t = 0; t <= 100; t += S === 1 ? 10 : 20) s += tx(L - 10, sy(t) + 5, t, { size: 14, anchor: 'end' });
    s += `<line x1="${L}" y1="${Tt}" x2="${L}" y2="${Bb}" stroke="#444"/><line x1="${L}" y1="${Bb}" x2="${Rr}" y2="${Bb}" stroke="#444"/>`;
    s += tx(30, (Tt + Bb) / 2, 'Percent', { size: 15, anchor: 'middle', extra: ` transform="rotate(-90 30 ${(Tt + Bb) / 2})"` });
    W.forEach((r, i) => { const x = L + i * bw + bw * 0.15; s += `<rect x="${x}" y="${sy(r[k])}" width="${bw * 0.7}" height="${Bb - sy(r[k])}" fill="${rainbow(i)}"/>` + tx(x + bw * 0.35, Bb + 14, sname(r), { size: 14, anchor: 'end', extra: ` transform="rotate(-45 ${x + bw * 0.35} ${Bb + 14})"` }); });
    s += footer(w, h) + '</svg>';
  } else {
    const keys = S === 3 ? null : S === 4 ? [[RED, 'Three highest wards'], [GREY, 'Other wards'], [INK, 'Mumbai average', 'line']] : [[RED, 'Three highest wards'], [GREY, 'Other wards'], [INK, 'Mumbai average', 'line']];
    const title = S === 5 ? action : 'Slum population by ward (%)', sub = S === 5 ? `Share of people living in slums, 2011: ${t2.map(i => `${sname(W[i])} ${p1(W[i][k])}`).join('; ')}. Next: ${sname(W[top[2]])}, ${p1(W[top[2]][k])}.` : null;
    s = hbar({ title, sub, rows: ix.map(i => ({ i, label: sname(W[i]), v: W[i][k], col: S === 3 ? rainbow(i) : top.includes(i) ? RED : GREY, bold: S >= 4 && top.includes(i) })), fmt: p1, avg: S >= 4 ? { v: city(k), label: `Mumbai average: ${p1(city(k))}` } : null, key: keys, max: 100, y0: 68 });
    s = s.replace('</svg>', tag + '</svg>');
  }
  $('#chart').innerHTML = s;
  $('#dec-out').innerHTML = `<b>Stage ${S} of 5:</b> ${DSTAGE[S]}.` + (S === 5 ? `<br>Action title: <b>${esc(action)}</b> (${p1(share2 * 100)}).` : '');
};

function buildInsights() {
  const sp = order('slum_pct'), mn = W[sp[sp.length - 1]].slum_pct, minW = W.map((r, i) => i).filter(i => W[i].slum_pct === mn), mxI = sp[0], t2 = sp.slice(0, 2);
  const t2pop = t2.reduce((a, i) => a + W[i].slum_pop, 0), Zs = ZONES.map(z => agg(W.filter(r => r.zone === z))), zs = Zs.map(t => M.slum_pct.c(t));
  const { r } = corr(vals('slum_pct'), vals('female_literacy_pct')), fl = order('female_literacy_pct', false)[0];
  const hr = order('homeless_per_10k'), h3 = hr.slice(0, 3), h3c = h3.reduce((a, i) => a + W[i].homeless, 0), h3p = h3.reduce((a, i) => a + W[i].population, 0);
  const lp = order('slum_pop'), sp2 = lp.slice(0, 2);
  B.ask = B.ask || `Approve a ward-by-ward plan that starts in ${t2.map(i => sname(W[i])).join(' and ')}`;
  ins = [
    { name: 'The gap: slum share by ward', metric: 'slum_pct', fact: `slum share runs from ${Math.round(mn)}% in Wards ${listJoin(minW.map(i => W[i].ward))} to ${Math.round(W[mxI].slum_pct)}% in ${sname(W[mxI])}`, action: `${Math.round(W[mxI].slum_pct)}% of people in ${plain(W[mxI])} live in slums; in South Mumbai, ${Math.round(mn)}%`, heads: [`The city average of ${p1(city('slum_pct'))} hides an ${Math.round(W[mxI].slum_pct / mn)}-fold gap between wards`, `${plain(W[mxI])}: ${Math.round(W[mxI].slum_pct)}% in slums, the highest of 24 wards`, `Start where the share is highest: ${t2.map(i => code(W[i])).join(' and ')}`], start: t2 },
    { name: 'Concentration: two wards, most in slums', metric: 'slum_pct', fact: `in ${t2.map(i => sname(W[i])).join(' and ')}, ${p1(t2pop / t2.reduce((a, i) => a + W[i].population, 0) * 100)} of people live in slums: ${lakh(t2pop)} people`, action: `${lakh(t2pop)} slum dwellers live in just two wards: ${t2.map(i => plain(W[i])).join(' and ')}`, heads: [`Two wards hold ${p1(t2pop / T.slum_pop * 100)} of Mumbai's slum dwellers`, `${t2.map(i => plain(W[i])).join(' and ')}: more than 5 in 6 people live in slums`, `One plan for two wards reaches ${lakh(t2pop)} people`], start: t2 },
    { name: 'Relationship: slums and female literacy', metric: 'female_literacy_pct', fact: `wards with more slum dwellers have lower female literacy (r = ${rtxt(r)}); ${sname(W[fl])} is lowest at ${p1(W[fl].female_literacy_pct)} against ${p1(city('female_literacy_pct'))} citywide`, action: `Where slums are most common, fewer women can read: ${plain(W[fl])} ${p1(W[fl].female_literacy_pct)}`, heads: [`${plain(W[fl])} has the lowest female literacy in Mumbai: ${p1(W[fl].female_literacy_pct)}`, `More slums, fewer literate women: r = ${rtxt(r)} across 24 wards`, `Basic services and girls' schooling belong in the same plan`], start: [fl, t2.find(i => i !== fl) ?? t2[1]] },
    { name: 'Homeless: where the jobs are', metric: 'homeless_per_10k', fact: `Wards ${listJoin(h3.map(i => W[i].ward))} in South Mumbai have ${Math.round(Math.min(...h3.map(i => W[i].homeless_per_10k)))} to ${Math.round(W[h3[0]].homeless_per_10k)} homeless people per 10,000 residents, against ${Math.round(city('homeless_per_10k'))} citywide`, action: `South Mumbai shelters ${p1(h3c / T.homeless * 100)} of the city's homeless with ${p1(h3p / T.population * 100)} of its people`, heads: [`The homeless sleep where the jobs are: South Mumbai`, `Ward ${W[h3[0]].ward} (${locs(W[h3[0]], 2).join(', ')}): ${Math.round(W[h3[0]].homeless_per_10k)} homeless per 10,000 people`, `Night shelters belong in Wards ${listJoin(h3.map(i => W[i].ward))}`], start: h3 },
    { name: 'Zones: East against the Island City', metric: 'slum_pct', fact: `${p1(zs[2])} of people in the Eastern Suburbs live in slums, against ${p1(zs[0])} in the Island City and ${p1(zs[1])} in the Western Suburbs`, action: `The Eastern Suburbs carry the heaviest slum share: ${p1(zs[2])}`, heads: [`Eastern Suburbs: ${p1(zs[2])} in slums, the highest of the three parts of Mumbai`, `Island City: ${p1(zs[0])}, the lowest`, `Inside the East, ${t2.filter(i => W[i].zone === 'Eastern Suburbs').map(i => code(W[i])).join(' and ')} stand out`], start: t2 },
  ];
}
const lcFirst = s => s ? s[0].toLowerCase() + s.slice(1) : s;
const bigIdea = I => `${B.aud}: ${I.fact}. ${B.ask}, so the money reaches the wards where need is greatest.`;
R.bigidea = () => {
  setLayout('chart'); $('#bi-ins').value = st.insight; const I = ins[st.insight];
  $('#bi-brief').innerHTML = `<b>Audience:</b> ${esc(B.aud)}<br><b>Decision:</b> ${esc(B.dec)}<br><b>Ask:</b> ${esc(B.ask)}`;
  $('#chart').innerHTML = `<div class="st-panel"><div class="st-h1">One sentence: the Big Idea</div><div class="st-h2">Audience + insight + ask. Insight chosen: ${esc(I.name.toLowerCase())}.</div>
  <div class="st-card acc" style="margin-bottom:18px"><h4>The Big Idea</h4><div class="big" style="font-size:28px">${esc(bigIdea(I))}</div></div>
  <div class="st-cards" style="grid-template-columns:1fr 1fr;margin-bottom:18px">
    <div class="st-card bad"><h4>Topic title <span class="st-tag no">✗ says what</span></h4><div class="big">Slum population by ward, 2011</div></div>
    <div class="st-card"><h4>Action title <span class="st-tag ok">✓ says so what</span></h4><div class="big">${esc(I.action)}</div></div>
  </div>
  <div class="st-card"><h4>Three headline titles for three slides</h4>${I.heads.map((t, j) => `<div class="big" style="font-size:23px;margin:6px 0"><span style="color:${RED};font-weight:800">${j + 1}.</span> ${esc(t)}</div>`).join('')}</div>
  <div class="st-src">${SRC}</div></div>`;
};

R.arc = () => {
  setLayout('chart'); $('#arc-ins').value = st.insight; const I = ins[st.insight], [w, h] = box();
  const cw = (w - 56 - 40) / 3, th = Math.min(300, h - 500);
  const P5 = pal(5), cs = classify(vals('slum_pct'), 'quantile', 5);
  const thumbMap = (fill, stroke) => `<svg width="${cw - 40}" height="${th}" viewBox="0 0 ${cw - 40} ${th}">${svgMap(cw - 40, th, fill, stroke, 4, 0.6)}</svg>`;
  const mk = I.metric, ix = order(mk), pick = [...ix.slice(0, 4), ...ix.slice(-3)];
  const bars = (() => { const bw2 = cw - 40, rh = th / pick.length, mx = Math.max(...pick.map(i => W[i][mk])); let s = `<svg width="${bw2}" height="${th}" style="font-family:${FONT}">`; pick.forEach((i, q) => { const lw = 150, v = W[i][mk], bl = (bw2 - lw - 70) * v / mx, on = I.start.includes(i); s += tx(lw - 6, q * rh + rh / 2 + 5, code(W[i]) + ' ' + locs(W[i], 1)[0], { size: 14, anchor: 'end', weight: on ? 700 : 400 }) + `<rect x="${lw}" y="${q * rh + rh * 0.18}" width="${bl}" height="${rh * 0.64}" fill="${on ? RED : GREY}"/>` + tx(lw + bl + 5, q * rh + rh / 2 + 5, M[mk].f(v), { size: 14 }); }); return s + '</svg>'; })();
  const card = (n, lab, txt, vis, cls = '') => `<div class="st-card ${cls}" style="display:flex;flex-direction:column"><h4>${n} · ${lab}</h4><div style="display:flex;justify-content:center;margin:6px 0 10px">${vis}</div><div class="big" style="font-size:20px">${esc(txt)}</div></div>`;
  $('#chart').innerHTML = `<div class="st-panel"><div class="st-h1">Setup, tension, resolution</div><div class="st-h2">Three frames, built from your brief and the insight: ${esc(I.name.toLowerCase())}.</div>
   <div class="st-cards" style="grid-template-columns:1fr 1fr 1fr">
    ${card(1, 'Setup: what we all accept', `Mumbai: ${lakh(T.population)} people in 24 wards; ${p1(city('slum_pct'))} live in slums.`, thumbMap(i => P5[cs.cls[i]]))}
    ${card(2, 'Tension: what is wrong with that picture', I.fact[0].toUpperCase() + I.fact.slice(1) + '.', bars)}
    ${card(3, 'Resolution: what to do', B.ask + '.', thumbMap(i => I.start.includes(i) ? RED : '#eef1f6', i => I.start.includes(i) ? '#7a0000' : '#9aa3b2'), 'acc')}
   </div>
   <div class="st-abt">Mumbai has ${lakh(T.population)} people in 24 wards <b>AND</b> ${p1(city('slum_pct'))} of them live in slums, <b>BUT</b> ${esc(I.fact)}, <b>THEREFORE</b> ${esc(lcFirst(B.ask))}.</div>
   <div class="st-src" style="display:flex;gap:22px;align-items:center;flex-wrap:wrap"><span style="display:inline-flex;gap:6px;align-items:center"><i style="width:20px;height:13px;background:${P5[4]};display:inline-block;border:1px solid #888"></i><i style="width:20px;height:13px;background:${P5[0]};display:inline-block;border:1px solid #888"></i> Map 1: slum share, darker = higher</span><span style="display:inline-flex;gap:6px;align-items:center"><i style="width:20px;height:13px;background:${RED};display:inline-block"></i> Wards to start with</span><span>${SRC}</span></div></div>`;
};

function tellFrames() {
  const sp = order('slum_pct'), mn = W[sp[sp.length - 1]].slum_pct, minW = W.map((r, i) => i).filter(i => W[i].slum_pct === mn), mx = sp[0], t2 = sp.slice(0, 2);
  const fl = order('female_literacy_pct', false)[0], { r } = corr(vals('slum_pct'), vals('female_literacy_pct'));
  const hr = order('homeless_per_10k'), h3 = hr.slice(0, 3), h3c = h3.reduce((a, i) => a + W[i].homeless, 0), h3p = h3.reduce((a, i) => a + W[i].population, 0);
  const t2pop = t2.reduce((a, i) => a + W[i].slum_pop, 0), south = minW.every(i => W[i].zone === 'Island City') ? 'South Mumbai' : 'Wards ' + listJoin(minW.map(i => W[i].ward));
  const FIX = [[0, 20], [20, 40], [40, 60], [60, 80], [80, 100]], FP = pal(5), fixCls = v => Math.min(4, Math.floor(v / 20));
  const fixKey = '<b>Share living in slums</b>' + FIX.map((b, j) => `<div class="sw"><i style="background:${FP[j]}"></i>${b[0]}% to ${b[1]}%</div>`).reverse().join('');
  return [
    { t: `Mumbai: ${lakh(T.population)} people, 24 wards`, num: lakh(T.population).replace(' crore', ''), numl: `crore people in 24 municipal wards (Census 2011)`, p: [`${inr(T.households)} households on ${Math.round(T.area_km2)} km²: about ${inr(city('density_per_km2'))} people per km².`], go: () => { paint(() => '#dfe5f1', () => .8); setLabels(i => [lab2(i), INK, 1]); return null; }, key: `<div class="sw"><i style="background:#dfe5f1"></i>One municipal ward (labelled with its main locality)</div>` },
    { t: 'Half live in slums', num: p1(city('slum_pct')), numl: `of Mumbai's people lived in slums in 2011: ${lakh(T.slum_pop)} people`, p: [`Slums are not the edge of Mumbai. They are half of it.`], go: () => { paint(i => FP[fixCls(W[i].slum_pct)]); return null; }, key: fixKey },
    { t: `But not evenly: ${Math.round(mn)}% in ${south}, ${Math.round(W[mx].slum_pct)}% in ${plain(W[mx])}`, num: `${Math.round(W[mx].slum_pct / mn)}×`, numl: 'the gap between the lowest and the highest ward', p: [`Wards ${listJoin(minW.map(i => W[i].ward))} (${listJoin(minW.map(i => locs(W[i], 1)[0]))}): ${p1(mn)}.`, `Ward ${fname(W[mx])}: ${p1(W[mx].slum_pct)}.`], go: () => { paint(i => minW.includes(i) ? NAVY : i === mx ? RED : FP[fixCls(W[i].slum_pct)], i => minW.includes(i) || i === mx ? .85 : .55); setLabels(i => minW.includes(i) ? [lab2(i), NAVY, 1] : i === mx ? [lab2(i), RED, 0] : null); return null; }, key: sw(RED, `Highest: ${sname(W[mx])}`) + sw(NAVY, `Lowest: Wards ${listJoin(minW.map(i => W[i].ward))}`) + sw(FP[2], 'Other wards, shaded by slum share') },
    { t: `Where slums are most common, women's literacy is lowest`, num: p1(W[fl].female_literacy_pct), numl: `of women in ${sname(W[fl])} can read and write: the lowest of 24 wards. Mumbai: ${p1(city('female_literacy_pct'))}.`, p: [`Across the 24 wards, the higher the slum share, the lower female literacy (r = ${rtxt(r)}). A link, not proof of cause.`], go: () => { const { c, P } = choropleth('female_literacy_pct', 'quantile', 5); paint(i => P[4 - c.cls[i]]); setHL([fl]); setLabels(i => i === fl ? [lab2(i), RED, 0] : null); this_key = `<b>Female literacy (darker = lower)</b>` + [...c.ranges.keys()].map(j => sw(P[4 - j], `${p1(c.ranges[j][0])} to ${p1(c.ranges[j][1])}`)).join('') + sw('#fff;border:3px solid ' + RED, `Lowest: ${sname(W[fl])}`); return W.map((_, i) => i).filter(i => W[i].zone === 'Eastern Suburbs'); }, key: () => this_key },
    { t: 'The homeless sleep where the jobs are: South Mumbai', num: inr(W[h3[0]].homeless_per_10k), numl: `homeless people per 10,000 residents in ${sname(W[h3[0]])}. Mumbai: ${Math.round(city('homeless_per_10k'))}.`, p: [`Wards ${listJoin(h3.map(i => W[i].ward))} have ${p1(h3p / T.population * 100)} of Mumbai's people but ${p1(h3c / T.homeless * 100)} of its ${inr(T.homeless)} homeless.`], go: () => { paint(() => '#eef1f6', () => .7); setCircles(circlesFor('homeless', 46, i => h3.includes(i) ? RED : NAVY)); setLabels(i => h3.includes(i) ? [lab2(i), RED, 0] : null); return W.map((_, i) => i).filter(i => W[i].zone === 'Island City'); }, key: () => circleLegend('homeless', 46, 'Homeless people: circle area').replace('<b>', '<b style="display:block;margin-bottom:4px">') + sw(RED, `Highest rates: Wards ${listJoin(h3.map(i => W[i].ward))}`, 'ring') },
    { t: `So: target by ward, not by city average. Start with ${t2.map(i => code(W[i])).join(' and ')}`, num: lakh(t2pop), numl: `slum dwellers in ${t2.map(i => sname(W[i])).join(' and ')}: ${p1(t2pop / T.slum_pop * 100)} of Mumbai's total`, p: [`One ward-by-ward plan, starting where the share is highest.`], go: () => { paint(i => t2.includes(i) ? RED : '#eef1f6', i => t2.includes(i) ? .8 : .6); setLabels(i => t2.includes(i) ? [lab2(i), '#7a0000', 0] : null); return t2; }, key: sw(RED, `Start here: ${t2.map(i => sname(W[i])).join(' and ')}`) + sw('#eef1f6', 'Other wards') },
  ];
}
let this_key = '';
R.tell = () => {
  setLayout('map'); segOn('tell-f', st.frame); const F = tellFrames(), f = F[st.frame - 1];
  const target = f.go(); const card = $('#tellcard'); card.hidden = false;
  const cardW = card.offsetWidth || 560, pad = { top: 40, bottom: 40, right: 50, left: cardW + 70 };
  card.innerHTML = `<div class="fno">Frame ${st.frame} of 6</div><h1>${esc(f.t)}</h1><div class="num">${esc(f.num)}</div><div class="numl">${esc(f.numl)}</div>${f.p.map(t => `<p>${esc(t)}</p>`).join('')}<div class="key">${typeof f.key === 'function' ? f.key() : f.key}</div><div class="src">${SRC}</div><div class="nav"><button class="ga-ghostbtn" id="t-prev">← Prev</button><button class="ga-primary" id="t-next">Next →</button></div>`;
  $('#t-prev').onclick = () => { st.frame = Math.max(1, st.frame - 1); show('tell'); }; $('#t-next').onclick = () => { st.frame = Math.min(6, st.frame + 1); show('tell'); };
  fit(target, pad, 1200); hoverKey = 'slum_pct';
};

R.yourturn = () => {
  segOn('yt-v', st.view); const G = gur;
  const facts = `<b>${G.n}</b> cafés and restaurants. <b>${p1(G.s500)}</b> are within 500 m of a metro station (${G.c500}); <b>${p1(G.s1k)}</b> within 1 km (${G.c1k}). Half are within <b>${(G.med / 1000).toFixed(2)} km</b> of a station.`;
  $('#yt-out').innerHTML = facts;
  if (st.view === 'template') {
    setLayout('chart');
    const box2 = (lab, ph, rows = 2) => `<label>${lab}</label><textarea rows="${rows}" placeholder="${esc(ph)}"></textarea>`;
    $('#chart').innerHTML = `<div class="st-panel st-ws"><div class="st-h1">Group worksheet: Gurugram's cafés and the metro</div><div class="st-h2">What the data says: ${G.n} cafés and restaurants; ${p1(G.s500)} within 500 m of a metro station, ${p1(G.s1k)} within 1 km; ${p1(100 - G.s1k)} more than 1 km away.</div>
    <div style="display:grid;grid-template-columns:1fr 1.25fr;gap:34px;flex:1">
     <div>${box2('Audience: who will listen? (GMDA, HMRTC, a café chain, a developer)', 'e.g. Chief Executive Officer, GMDA')}${box2('Decision: what must they decide?', 'e.g. where to allow mixed-use and cafés near new stations')}${box2('Ask: what do you want them to do?', 'e.g. approve ...')}${box2('Insight: the one number that matters', 'e.g. only about half of cafés are within 1 km of a station')}${box2('Big Idea: one sentence (audience + insight + ask)', 'Write it so it could be the subject line of an email', 3)}</div>
     <div><label>Storyboard: three frames (sketch a chart or map in each)</label>
      <div style="display:grid;grid-template-rows:1fr 1fr 1fr;gap:12px;height:calc(100% - 40px)">
       ${['1 · Setup: what everyone accepts', '2 · Tension: what the data shows', '3 · Resolution: what to do'].map(t => `<div style="border:2px dashed #9aa3b2;border-radius:12px;padding:10px 14px;display:grid;grid-template-columns:1fr 1.2fr;gap:14px"><div><b style="color:${NAVY};font-size:17px">${t}</b><textarea rows="3" placeholder="Headline (an action title)"></textarea></div><div style="border:1px solid #d9dee7;border-radius:8px;background:#fafbfd;display:grid;place-items:center;color:#9aa3b2;font-size:16px">sketch: chart or map</div></div>`).join('')}
      </div></div></div>
    <div class="st-src">And–But–Therefore: Gurugram has ___ AND ___, BUT ___, THEREFORE ___. · ${SRC_G}</div></div>`;
    return;
  }
  setLayout('split', '44%'); wardLayers(false);
  const [w, h] = box(); let s = svgOpen(w, h);
  const hd = header(w, "Is Gurugram's café economy following the metro?", `${G.n} cafés and restaurants (OpenStreetMap). Straight-line distance from each to the nearest metro station.`); s += hd.s;
  let y = hd.y + 12; const nw = Math.max(tw(p1(G.s500), 50, 800), tw(p1(G.s1k), 50, 800)) + 16;
  [[p1(G.s500), RED, 'within 500 m', 'about a 6-minute walk'], [p1(G.s1k), NAVY, 'within 1 km', 'about a 12-minute walk']].forEach(([n, col, a, b2], q) => { const yy = y + 50 + q * 66; s += tx(28, yy, n, { size: 50, weight: 800, fill: col }) + tx(28 + nw, yy - 20, a, { size: 20, weight: 700 }) + tx(28 + nw, yy + 4, b2, { size: 16, fill: MUTE }); });
  y += 170; wrap('Cafés and restaurants by distance to the nearest metro station', 22, w - 56, 700).forEach(l => { s += tx(28, y, l, { size: 22, weight: 700, fill: NAVY }); y += 28; }); y -= 10;
  const bands = [['Within 500 m', G.c500, GC[0]], ['500 m to 1 km', G.c1k - G.c500, GC[1]], ['More than 1 km', G.n - G.c1k, GC[2]]], bh = 44, lw = 160, bmax = w - 28 - lw - 140, bm = Math.max(...bands.map(b => b[1]));
  bands.forEach(([l, c, col], q) => { const yy = y + 14 + q * (bh + 14), bl = bmax * c / bm; s += tx(28, yy + bh / 2 + 7, l, { size: 18, weight: 700 }) + `<rect x="${28 + lw}" y="${yy}" width="${bl}" height="${bh}" rx="3" fill="${col}" stroke="${q === 1 ? RED : 'none'}" stroke-width="1.5"/>` + tx(28 + lw + bl + 10, yy + bh / 2 + 7, `${p1(c / G.n * 100)} (${c})`, { size: 18, weight: 700 }); });
  y += 14 + 3 * (bh + 14) + 34;
  s += tx(28, y, 'Questions for your group', { size: 22, weight: 700, fill: NAVY }); y += 8;
  ['Is half "following the metro", or is half "ignoring it"? Which is the story?', 'Which stations have no cafés nearby, and why might that be?', 'What would you tell the GMDA or HMRTC to do?'].forEach(t => { wrap(t, 17, w - 80).forEach((l, z) => { y += 24; if (!z) s += `<circle cx="34" cy="${y - 6}" r="4" fill="${INK}"/>`; s += tx(48, y, l, { size: 17 }); }); y += 4; });
  s += footer(w, h, SRC_G) + '</svg>'; $('#chart').innerHTML = s;
  legend('<b>Cafés and restaurants</b>' + sw(GC[0], 'Within 500 m of a metro station', 'ring') + sw(GC[1], '500 m to 1 km', 'ring') + sw(GC[2], 'More than 1 km', 'ring') + `<div class="sw"><i class="ring" style="background:#fff;border:3px solid ${NAVY}"></i>Metro station</div>`, SRC_G);
  map.resize(); map.fitBounds(G.bb, { padding: { top: 30, right: 60, left: 30, bottom: $('#legend').offsetHeight + 40 }, duration: 0 });
};
const GC = ['#c00000', '#f4a3a3', '#9aa3b2'];

// ---------- init ----------
async function init() {
  const g = await fetch('data/mumbai_wards.geojson').then(r => r.json());
  geo = g; W = geo.features.map(f => f.properties); N = W.length; T = agg(W);
  geo.features.forEach((f, i) => { f.properties.i = i; f.properties.col = '#dfe5f1'; f.properties.op = .8; });
  let b = [180, 90, -180, -90]; geo.features.forEach(f => { const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates; polys.forEach(p => p[0].forEach(c => { b = [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])]; })); }); BB = b;
  buildInsights();
  // controls
  $('#tabs').innerHTML = STEPS.map(([id, l], j) => `<button role="tab" data-t="${id}" aria-selected="false"><span>${j}</span>${l}</button>`).join('');
  $$('#tabs button').forEach(bt => bt.onclick = () => show(bt.dataset.t));
  $('#rank-m').innerHTML = RANK_M.map(k => `<button data-v="${k}">${M[k].s[0].toUpperCase() + M[k].s.slice(1)}</button>`).join('');
  $$('#rank-m button').forEach(bt => bt.onclick = () => { st.metric = bt.dataset.v; show('rank'); });
  const opts = ks => ks.map(k => `<option value="${k}">${M[k].l.split(' (')[0]}</option>`).join('');
  $('#rel-x').innerHTML = opts(REL_M); $('#rel-y').innerHTML = opts(REL_M); $('#map-m').innerHTML = opts(RANK_M);
  $('#rel-x').onchange = e => { st.x = e.target.value; show('relate'); }; $('#rel-y').onchange = e => { st.y = e.target.value; show('relate'); }; $('#map-m').onchange = e => { st.metric = e.target.value; show('map'); };
  seg('rates-t', 'measure'); seg('rates-m', 'mode'); seg('map-meth', 'method'); seg('map-k', 'classes', true); seg('chart-c', 'chart'); seg('dec-s', 'stage', true); seg('tell-f', 'frame', true); seg('yt-v', 'view');
  $('#dec-next').onclick = () => { st.stage = st.stage % 5 + 1; show('declutter'); };
  const io = ins.map((I, j) => `<option value="${j}">${I.name}</option>`).join(''); $('#bi-ins').innerHTML = io; $('#arc-ins').innerHTML = io;
  $('#bi-ins').onchange = e => { st.insight = +e.target.value; show('bigidea'); }; $('#arc-ins').onchange = e => { st.insight = +e.target.value; show('arc'); };
  [['b-aud', 'aud'], ['b-dec', 'dec'], ['b-ask', 'ask']].forEach(([id, k]) => $('#' + id).oninput = e => { B[k] = e.target.value; clearTimeout(window.__bt); window.__bt = setTimeout(() => { if (st.step === 'brief') R.brief(); }, 250); });
  $('#tell-clean').onclick = () => { st.clean = true; show('tell'); };
  document.addEventListener('keydown', e => { if (st.step !== 'tell' || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return; if (e.key === 'ArrowRight') { st.frame = Math.min(6, st.frame + 1); show('tell'); } if (e.key === 'ArrowLeft') { st.frame = Math.max(1, st.frame - 1); show('tell'); } if (e.key === 'Escape' && st.clean) { st.clean = false; show('tell'); } });
  // map
  map = new maplibregl.Map({ container: 'map', style: 'https://tiles.openfreemap.org/styles/positron', bounds: [[b[0], b[1]], [b[2], b[3]]], fitBoundsOptions: { padding: 20 }, attributionControl: { compact: false, customAttribution: 'Wards: BMC via DataMeet · Census 2011 via MCGM' } });
  window.__map = map; map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.on('load', async () => {
    map.addSource('w', { type: 'geojson', data: geo });
    map.addLayer({ id: 'w', type: 'fill', source: 'w', paint: { 'fill-color': ['get', 'col'], 'fill-opacity': ['get', 'op'] } });
    map.addLayer({ id: 'w-line', type: 'line', source: 'w', paint: { 'line-color': '#5b6680', 'line-width': 1 } });
    map.addSource('hl2', { type: 'geojson', data: fc([]) });
    map.addLayer({ id: 'hl2', type: 'line', source: 'hl2', paint: { 'line-color': NAVY, 'line-width': 4 } });
    map.addSource('hl', { type: 'geojson', data: fc([]) });
    map.addLayer({ id: 'hl', type: 'line', source: 'hl', paint: { 'line-color': RED, 'line-width': 4 } });
    map.addSource('hov', { type: 'geojson', data: fc([]) });
    map.addLayer({ id: 'hov', type: 'line', source: 'hov', paint: { 'line-color': '#111', 'line-width': 3 } });
    map.addSource('pc', { type: 'geojson', data: fc([]) });
    map.addLayer({ id: 'pc', type: 'circle', source: 'pc', paint: { 'circle-radius': ['get', 'r'], 'circle-color': ['get', 'c'], 'circle-opacity': 0.55, 'circle-stroke-color': ['get', 'c'], 'circle-stroke-width': 1.5 } });
    map.addSource('labs', { type: 'geojson', data: fc([]) });
    map.addLayer({ id: 'labs', type: 'symbol', source: 'labs', layout: { 'text-field': ['get', 'lab'], 'text-font': ['Noto Sans Bold'], 'text-size': 14, 'symbol-sort-key': ['get', 'pri'], 'text-line-height': 1.1 }, paint: { 'text-color': ['get', 'tc'], 'text-halo-color': '#fff', 'text-halo-width': 2 } });
    map.on('mousemove', 'w', e => { const i = e.features[0].properties.i; hover(i); if (!popup) popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, maxWidth: '320px' }); const k = hoverKey; popup.setLngLat(e.lngLat).setHTML(`<b>Ward ${esc(fname(W[i]))}</b><br>${esc(W[i].zone)}${k ? `<br>${esc(M[k].l.split(' (')[0])}: <b>${M[k].f(W[i][k])}</b>` : ''}`).addTo(map); });
    map.on('mouseleave', 'w', () => { hover(null); if (popup) popup.remove(); });
    await loadGurugram();
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
  const xs = c.features.map(f => f.geometry.coordinates[0]).sort((a, b) => a - b), ys = c.features.map(f => f.geometry.coordinates[1]).sort((a, b) => a - b), pc = (a, q) => a[Math.floor(q * (a.length - 1))], bb = [[pc(xs, 0.03), pc(ys, 0.03)], [pc(xs, 0.97), pc(ys, 0.97)]];
  const sd = [...d].sort((a, b) => a - b), c500 = d.filter(x => x <= 500).length, c1k = d.filter(x => x <= 1000).length;
  gur = { n, c500, c1k, s500: c500 / n * 100, s1k: c1k / n * 100, med: n % 2 ? sd[(n - 1) / 2] : (sd[n / 2 - 1] + sd[n / 2]) / 2, bb };
  window.__gur = gur;
  const near = m.features.filter(f => { const [x, y] = f.geometry.coordinates; return x > bb[0][0] - 0.03 && x < bb[1][0] + 0.03 && y > bb[0][1] - 0.03 && y < bb[1][1] + 0.03; });
  map.addSource('gm', { type: 'geojson', data: fc(near) }); map.addSource('gc', { type: 'geojson', data: c });
  // far first, near on top
  c.features.sort((a, b) => b.properties.d - a.properties.d);
  map.getSource('gc').setData(c);
  map.addLayer({ id: 'gc', type: 'circle', source: 'gc', layout: { visibility: 'none' }, paint: { 'circle-radius': 6, 'circle-color': ['get', 'c'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 } });
  map.addLayer({ id: 'gm', type: 'circle', source: 'gm', layout: { visibility: 'none' }, paint: { 'circle-radius': 7, 'circle-color': '#fff', 'circle-stroke-color': NAVY, 'circle-stroke-width': 3.5 } });
}
window.__storyReady = false;
init();
