// GeoAI Studio — five GeoAI techniques on Gurugram data, fully in the browser.
// Data: AlphaEarth Foundations annual embeddings (64-d) averaged per H3 r8 cell, ESA WorldCover 2021, JRC GHSL, Overture places/buildings.
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const D = 64;
let G = null, M = null, map = null, cells = [], E20, E24, idx = new Map(), feats = [];
let mode = 'sim', simWhere = 'ggn', seed = null, labels = new Map(), teachCls = 'Built-up', chgMode = 'any';

const fmt = (v, d = 2) => (v == null || Number.isNaN(v)) ? '–' : v.toFixed(d);
const pct = v => (v == null || Number.isNaN(v)) ? '–' : (100 * v).toFixed(0) + '%';
function busy(on) { $('#busy').hidden = !on; }
function decode(b64, n) {
  const bin = atob(b64), a = new Int8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = (bin.charCodeAt(i) << 24) >> 24;
  const X = new Float32Array(n * D);
  for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < D; k++) { const v = a[i * D + k]; X[i * D + k] = v; s += v * v; } s = Math.sqrt(s) || 1; for (let k = 0; k < D; k++) X[i * D + k] /= s; }
  return X;
}
const dot = (A, i, B, j) => { let s = 0; for (let k = 0; k < D; k++) s += A[i * D + k] * B[j * D + k]; return s; };
const dotv = (A, i, v) => { let s = 0; for (let k = 0; k < D; k++) s += A[i * D + k] * v[k]; return s; };
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// ---------- legend ----------
function legend(html) { const L = $('#legend'); if (!html) { L.hidden = true; return; } L.innerHTML = html; L.hidden = false; }
const RAMP5 = ['#f2f0f7', '#cbc9e2', '#9e9ac8', '#6a51a3', '#3f007d'];
const CHG5 = ['#fff5eb', '#fdd0a2', '#fd8d3c', '#d94801', '#7f2704'];
function binLegend(title, cols, labs) {
  return `<b>${title}</b>` + cols.map((c, i) => `<div class="sw"><i style="background:${c}"></i>${labs[i]}</div>`).join('');
}

// ---------- map ----------
function hexFeature(h, i, extra = {}) {
  const ring = h3.cellToBoundary(h, true);
  return { type: 'Feature', id: i, properties: { i, col: '#d9dde2', op: 0.55, ...extra }, geometry: { type: 'Polygon', coordinates: [ring] } };
}
function paint(colFn, opFn) {
  for (let i = 0; i < feats.length; i++) { feats[i].properties.col = colFn(i); feats[i].properties.op = opFn ? opFn(i) : 0.72; }
  map.getSource('hex').setData({ type: 'FeatureCollection', features: feats });
}
function outline(ids, color = '#111') {
  const f = ids.map(i => feats[i]);
  map.getSource('sel').setData({ type: 'FeatureCollection', features: f });
  map.setPaintProperty('sel', 'line-color', color);
}
function dots(ids) { // centroid dots for training examples / cafés
  const f = ids.map(([i, c]) => { const [la, lo] = h3.cellToLatLng(cells[i].h); return { type: 'Feature', properties: { c }, geometry: { type: 'Point', coordinates: [lo, la] } }; });
  map.getSource('pts').setData({ type: 'FeatureCollection', features: f });
}
function clearOverlays() { outline([]); dots([]); if (map.getSource('mum')) map.getSource('mum').setData({ type: 'FeatureCollection', features: [] }); }

async function init() {
  busy(true);
  G = await (await fetch('data/gurugram.json')).json();
  cells = G.cells; E20 = decode(G.e20, cells.length); E24 = decode(G.e24, cells.length);
  cells.forEach((c, i) => idx.set(c.h, i));
  feats = cells.map((c, i) => hexFeature(c.h, i));
  map = new maplibregl.Map({ container: 'map', style: 'https://tiles.openfreemap.org/styles/positron', center: [77.0, 28.40], zoom: 9.7, attributionControl: { compact: false, customAttribution: 'Embeddings: AlphaEarth Foundations (Google DeepMind) · Land cover: ESA WorldCover · Places & buildings: Overture Maps' } });
  window.__map = map;
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.on('load', () => {
    const sat = y => ({ type: 'raster', tiles: [`https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-${y}_3857/default/g/{z}/{y}/{x}.jpg`.replace('{y}/{x}', '{y}/{x}')], tileSize: 256, maxzoom: 14, attribution: `Sentinel-2 cloudless ${y} by EOX IT Services GmbH (contains modified Copernicus Sentinel data)` });
    for (const y of ['2020', '2024']) { map.addSource('s2_' + y, sat(y)); map.addLayer({ id: 's2_' + y, type: 'raster', source: 's2_' + y, layout: { visibility: 'none' } }); }
    map.addSource('hex', { type: 'geojson', data: { type: 'FeatureCollection', features: feats } });
    map.addLayer({ id: 'hex', type: 'fill', source: 'hex', paint: { 'fill-color': ['get', 'col'], 'fill-opacity': ['get', 'op'], 'fill-outline-color': 'rgba(60,60,60,0.25)' } });
    map.addSource('mum', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'mum', type: 'fill', source: 'mum', paint: { 'fill-color': ['get', 'col'], 'fill-opacity': 0.75, 'fill-outline-color': 'rgba(60,60,60,0.25)' } });
    map.addSource('sel', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'sel', type: 'line', source: 'sel', paint: { 'line-color': '#111', 'line-width': 3 } });
    map.addSource('pts', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'pts', type: 'circle', source: 'pts', paint: { 'circle-radius': 6, 'circle-color': ['get', 'c'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
    map.on('click', 'hex', e => onHexClick(e.features[0].properties.i, e.lngLat));
    map.on('mouseenter', 'hex', () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', 'hex', () => map.getCanvas().style.cursor = '');
    busy(false); setMode('sim');
  });
  about();
}

// ---------- tabs ----------
function setMode(m) {
  mode = m;
  $$('.ga-tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.t === m));
  $$('.ga-pane').forEach(p => p.hidden = p.id !== 'p-' + m);
  clearOverlays(); setSat('none'); if (m !== 'sim' || simWhere !== 'mum') { if (m !== 'chg') home(); else if (Math.abs(map.getCenter().lat - 28.4) > 0.6) home(); }
  if (m !== 'sim' && simWhere === 'mum') { simWhere = 'ggn'; $('#sim-ggn').classList.add('on'); $('#sim-mum').classList.remove('on'); }
  if (m === 'sim') { paint(() => '#d9dde2', () => 0.45); legend(null); if (seed != null) runSim(seed); }
  if (m === 'teach') { paint(i => wcCol(cells[i].wc), () => 0.25); legend(binLegend('Faint colours: ESA WorldCover 2021 (the "answer key")', ['#c0392b', '#e0b100', '#2e8b57', '#3a7bd5'], ['Built-up', 'Farmland', 'Green / scrub', 'Water'])); drawLabels(); }
  if (m === 'chg') runChg();
  if (m === 'test') { paint(() => '#d9dde2', () => 0.45); legend(null); }
  if (m === 'ws') { paint(() => '#d9dde2', () => 0.45); legend(null); }
  if (m === 'about') { paint(() => '#d9dde2', () => 0.45); legend(null); }
}
$$('.ga-tabs button').forEach(b => b.onclick = () => setMode(b.dataset.t));
function home() { const c = map.getCenter(); if (Math.abs(c.lat - 28.4) > 0.6 || map.getZoom() > 11.5) map.jumpTo({ center: [77.0, 28.40], zoom: 9.7 }); }
function setSat(y) {
  if (map.getLayer('hex')) map.setPaintProperty('hex', 'fill-opacity', y === 'none' ? ['get', 'op'] : 0.32);
  for (const k of ['2020', '2024']) map.setLayoutProperty('s2_' + k, 'visibility', k === y ? 'visible' : 'none');
  $$('#chg-sat button').forEach(b => b.classList.toggle('on', b.dataset.s === y));
}
function onHexClick(i, ll) {
  if (mode === 'sim') { if (simWhere === 'mum') simWhereSet('ggn'); runSim(i); return; }
  if (mode === 'teach') { if (labels.get(i) === teachCls) labels.delete(i); else labels.set(i, teachCls); drawLabels(); return; }
  const c = cells[i];
  const html = `<b>${c.nm ? c.nm + ' · ' : ''}hexagon ${c.h}</b><br>Built-up share (WorldCover 2021): ${pct(c.b)}<br>Land cover: ${c.wc}<br>Change 2020→2024: ${fmt(1 - dot(E20, i, E24, i), 3)}<br>Turned built-up 2017→2024: ${c.nf == null ? '–' : pct(c.nf)} of 40 m pixels<br>Shops &amp; eateries (Overture): ${c.cs}<br>Branded cafés: ${c.cf}<br>Buildings: ${c.nb} (${c.ai == null ? '–' : pct(c.ai)} drawn by AI)`;
  new maplibregl.Popup().setLngLat(ll).setHTML(html).addTo(map);
}

// ---------- 1 look-alike ----------
function nearestCell(la, lo) { const h = h3.latLngToCell(la, lo, 8); if (idx.has(h)) return idx.get(h); let b = 0, bd = 1e9; cells.forEach((c, i) => { const [a, o] = h3.cellToLatLng(c.h); const d = (a - la) ** 2 + (o - lo) ** 2; if (d < bd) { bd = d; b = i; } }); return b; }
function rankBins(sims) { // colour by rank: top 1%, 1-5, 5-10, 10-25, rest
  const s = [...sims].sort((a, b) => b - a), q = p => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return [q(0.01), q(0.05), q(0.10), q(0.25)];
}
function binCol(v, cut, ramp) { return v >= cut[0] ? ramp[4] : v >= cut[1] ? ramp[3] : v >= cut[2] ? ramp[2] : v >= cut[3] ? ramp[1] : ramp[0]; }
function runSim(i) {
  seed = i; clearOverlays();
  if (simWhere === 'ggn') {
    const sims = cells.map((_, j) => dot(E24, i, E24, j)); sims[i] = -1;
    const cut = rankBins(sims.filter((_, j) => j !== i));
    paint(j => j === i ? '#c00000' : binCol(sims[j], cut, RAMP5), () => 0.78); outline([i], '#c00000');
    const top = sims.map((s, j) => [s, j]).sort((a, b) => b[0] - a[0]).slice(0, 10);
    const tb = top.reduce((a, [, j]) => a + cells[j].b, 0) / 10, all = cells.reduce((a, c) => a + c.b, 0) / cells.length;
    $('#sim-out').innerHTML = `<h3>Seed hexagon: built-up ${pct(cells[i].b)}, ${cells[i].wc}</h3>
      <table><tr><th>Ten most similar (place)</th><th class="n">Similarity</th><th class="n">Built-up</th></tr>${top.map(([s, j]) => `<tr><td>${cells[j].nm || cells[j].wc}</td><td class="n">${fmt(s, 3)}</td><td class="n">${pct(cells[j].b)}</td></tr>`).join('')}</table>
      <p class="ga-note">Average built-up share: ten look-alikes ${pct(tb)}, whole district ${pct(all)}. Similarity is the cosine of two fingerprints (1 = identical).</p>`;
    legend(binLegend('Similarity to the red hexagon (rank in Gurugram)', [...RAMP5].reverse(), [`Top 1% (≥ ${fmt(cut[0], 3)})`, `Top 1–5% (≥ ${fmt(cut[1], 3)})`, `Top 5–10% (≥ ${fmt(cut[2], 3)})`, `Top 10–25% (≥ ${fmt(cut[3], 3)})`, 'The rest']));
  } else runSimMumbai(i);
}
async function runSimMumbai(i) {
  busy(true);
  if (!M) { M = await (await fetch('data/mumbai.json')).json(); M.X = decode(M.e24, M.h.length); }
  const sims = M.h.map((_, j) => { let s = 0; for (let k = 0; k < D; k++) s += E24[i * D + k] * M.X[j * D + k]; return s; });
  const cut = rankBins(sims);
  const f = M.h.map((h, j) => { const ft = hexFeature(h, j); ft.properties.col = binCol(sims[j], cut, RAMP5); ft.properties.s = sims[j]; return ft; });
  map.getSource('mum').setData({ type: 'FeatureCollection', features: f });
  const top = sims.map((s, j) => [s, j]).sort((a, b) => b[0] - a[0]).slice(0, 10);
  const pts = top.map(([s, j]) => { const [la, lo] = h3.cellToLatLng(M.h[j]); return { type: 'Feature', properties: { c: '#c00000' }, geometry: { type: 'Point', coordinates: [lo, la] } }; });
  map.getSource('pts').setData({ type: 'FeatureCollection', features: pts });
  map.flyTo({ center: [72.87, 19.05], zoom: 10.3 });
  $('#sim-out').innerHTML = `<h3>Mumbai hexagons that look like your Gurugram seed</h3><p>Red dots mark the ten closest matches (highest similarity ${fmt(top[0][0], 3)}). The model never saw a label or a city name; it matches what the ground looks like from space.</p><p class="ga-note">Click any Gurugram hexagon to return.</p>`;
  legend(binLegend('Similarity to the Gurugram seed (rank in Mumbai)', [...RAMP5].reverse(), [`Top 1% (≥ ${fmt(cut[0], 3)})`, `Top 1–5%`, `Top 5–10%`, `Top 10–25%`, 'The rest']));
  busy(false);
}
function simWhereSet(w) {
  simWhere = w; $('#sim-ggn').classList.toggle('on', w === 'ggn'); $('#sim-mum').classList.toggle('on', w === 'mum');
  if (w === 'ggn') { map.getSource('mum').setData({ type: 'FeatureCollection', features: [] }); map.flyTo({ center: [77.0, 28.40], zoom: 9.7 }); }
  if (seed != null) runSim(seed);
}
$('#sim-ggn').onclick = () => simWhereSet('ggn');
$('#sim-mum').onclick = () => { if (seed == null) seed = nearestCell(28.4973, 77.0918); simWhereSet('mum'); };
$$('#p-sim [data-seed]').forEach(b => b.onclick = () => { const [la, lo] = b.dataset.seed.split(',').map(Number); if (simWhere === 'mum') simWhereSet('ggn'); runSim(nearestCell(la, lo)); });

// ---------- 2 teach ----------
const TCOL = { 'Built-up': '#c0392b', 'Farmland': '#e0b100', 'Green': '#2e8b57' };
function wcClass(wc) { return wc === 'Built-up' ? 'Built-up' : wc === 'Cropland' ? 'Farmland' : (wc === 'Tree cover' || wc === 'Shrubland' || wc === 'Grassland') ? 'Green' : null; }
function wcCol(wc) { const c = wcClass(wc); return c ? TCOL[c] : wc === 'Water' ? '#3a7bd5' : '#bbbbbb'; }
function drawLabels() {
  dots([...labels].map(([i, c]) => [i, TCOL[c]]));
  const n = {}; labels.forEach(c => n[c] = (n[c] || 0) + 1);
  $('#teach-out').innerHTML = labels.size ? `<b>Your examples:</b> ${Object.keys(TCOL).map(k => `${k} ${n[k] || 0}`).join(' · ')}<p class="ga-note">Click a dot again to remove it. Then press "Label the whole map".</p>` : 'No examples yet. Choose a class, then click hexagons.';
}
$$('#teach-cls button').forEach(b => b.onclick = () => { teachCls = b.dataset.c; $$('#teach-cls button').forEach(x => x.classList.toggle('on', x === b)); });
$('#teach-clear').onclick = () => { labels.clear(); setMode('teach'); };
$('#teach-auto').onclick = () => {
  labels.clear(); const r = rng(7);
  for (const c of Object.keys(TCOL)) { const pool = cells.map((x, i) => [x, i]).filter(([x]) => wcClass(x.wc) === c).map(([, i]) => i); for (let k = 0; k < 5 && pool.length; k++) labels.set(pool.splice(Math.floor(r() * pool.length), 1)[0], c); }
  drawLabels();
};
$('#teach-run').onclick = () => {
  const cls = Object.keys(TCOL).filter(c => [...labels.values()].includes(c));
  if (cls.length < 2) { $('#teach-out').innerHTML = 'Mark at least one hexagon in two or more classes.'; return; }
  const P = {}; for (const c of cls) { P[c] = new Float32Array(D); let n = 0; labels.forEach((cc, i) => { if (cc === c) { for (let k = 0; k < D; k++) P[c][k] += E24[i * D + k]; n++; } }); let s = 0; for (let k = 0; k < D; k++) s += P[c][k] ** 2; s = Math.sqrt(s); for (let k = 0; k < D; k++) P[c][k] /= s; }
  const pred = cells.map((_, i) => { let b = null, bs = -9; for (const c of cls) { const s = dotv(E24, i, P[c]); if (s > bs) { bs = s; b = c; } } return b; });
  paint(i => TCOL[pred[i]], () => 0.75);
  let ok = 0, tot = 0; const conf = {};
  cells.forEach((x, i) => { if (labels.has(i)) return; const t = wcClass(x.wc); if (!t || !cls.includes(t)) return; tot++; if (t === pred[i]) ok++; conf[t] = conf[t] || {}; conf[t][pred[i]] = (conf[t][pred[i]] || 0) + 1; });
  const maj = cls.map(c => cells.filter((x, i) => !labels.has(i) && wcClass(x.wc) === c).length); const base = Math.max(...maj) / tot;
  $('#teach-out').innerHTML = `<h3>Agreement with ESA WorldCover on the hexagons you did not label</h3><div class="ga-big">${pct(ok / tot)}</div>
    <p>From ${labels.size} examples. Always guessing the most common class would score ${pct(base)}.</p>
    <table><tr><th>WorldCover says</th>${cls.map(c => `<th class="n">AI: ${c}</th>`).join('')}</tr>${cls.map(t => `<tr><td>${t}</td>${cls.map(p => `<td class="n">${(conf[t] || {})[p] || 0}</td>`).join('')}</tr>`).join('')}</table>
    <p class="ga-note">Method: nearest average fingerprint (a "prototype" few-shot classifier). WorldCover is itself an AI map, so treat disagreements as places to look, not as errors by default.</p>`;
  legend(binLegend('AI label from your examples', Object.values(TCOL), Object.keys(TCOL)));
};

// ---------- 3 change ----------
function runChg() {
  if (chgMode === 'any') {
    const v = cells.map((_, i) => 1 - dot(E20, i, E24, i)), cut = rankBins(v);
    paint(i => binCol(v[i], cut, CHG5), () => 0.72);
    legend(binLegend('Change in fingerprint, 2020→2024 (1 − cosine)', [...CHG5].reverse(), [`Top 1% (≥ ${fmt(cut[0], 3)})`, `Top 1–5% (≥ ${fmt(cut[1], 3)})`, `Top 5–10% (≥ ${fmt(cut[2], 3)})`, `Top 10–25% (≥ ${fmt(cut[3], 3)})`, 'The rest']));
    const top = v.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]).slice(0, 8);
    $('#chg-out').innerHTML = `<h3>Largest changes</h3><table><tr><th>Place</th><th class="n">Change</th><th class="n">Built-up</th></tr>${top.map(([s, i]) => `<tr><td>${cells[i].nm || cells[i].wc}</td><td class="n">${fmt(s, 3)}</td><td class="n">${pct(cells[i].b)}</td></tr>`).join('')}</table><p class="ga-note">"Any change" includes crops, water and quarries. Switch on the satellite years and zoom in to see what changed.</p>`;
  } else {
    const v = cells.map(c => c.nf ?? 0), cuts = [0.10, 0.05, 0.02, 0.005];
    paint(i => binCol(v[i], cuts, CHG5), () => 0.72);
    legend(binLegend('Share of 40 m pixels that turned built-up, 2017→2024', [...CHG5].reverse(), ['10% or more', '5–10%', '2–5%', '0.5–2%', 'Under 0.5%']));
    const top = v.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]).slice(0, 8);
    $('#chg-out').innerHTML = `<h3>Where new construction shows up</h3><table><tr><th>Place</th><th class="n">Turned built-up</th></tr>${top.map(([s, i]) => `<tr><td>${cells[i].nm || cells[i].wc}</td><td class="n">${pct(s)}</td></tr>`).join('')}</table><p class="ga-note">A 40 m pixel counts when an AI built-up score, read from its fingerprint, rose by more than 0.4 from a starting value under 0.3. The score was trained against WorldCover.</p>`;
  }
}
$$('#chg-mode button').forEach(b => b.onclick = () => { chgMode = b.dataset.m; $$('#chg-mode button').forEach(x => x.classList.toggle('on', x === b)); runChg(); });
$$('#chg-sat button').forEach(b => b.onclick = () => setSat(b.dataset.s));
$$('[data-fly]').forEach(b => b.onclick = () => { const [la, lo, z] = b.dataset.fly.split(',').map(Number); map.flyTo({ center: [lo, la], zoom: z }); });

// ---------- 4 honest test ----------
function ridge(trIdx, y, X, lam = 1) { // centred ridge, returns predictor
  const n = trIdx.length; const mu = new Float64Array(D); let ym = 0;
  for (const i of trIdx) { ym += y[i]; for (let k = 0; k < D; k++) mu[k] += X[i * D + k]; }
  ym /= n; for (let k = 0; k < D; k++) mu[k] /= n;
  const A = Array.from({ length: D }, () => new Float64Array(D + 1));
  for (const i of trIdx) { const xc = new Float64Array(D); for (let k = 0; k < D; k++) xc[k] = X[i * D + k] - mu[k]; const yc = y[i] - ym; for (let a = 0; a < D; a++) { const xa = xc[a]; if (!xa) continue; for (let b = 0; b < D; b++) A[a][b] += xa * xc[b]; A[a][D] += xa * yc; } }
  for (let a = 0; a < D; a++) A[a][a] += lam;
  for (let c = 0; c < D; c++) { let p = c; for (let r = c + 1; r < D; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; for (let r = 0; r < D; r++) { if (r === c) continue; const f = A[r][c] / A[c][c]; for (let k = c; k <= D; k++) A[r][k] -= f * A[c][k]; } }
  const w = A.map((row, a) => row[D] / row[a]);
  return i => { let s = ym; for (let k = 0; k < D; k++) s += w[k] * (X[i * D + k] - mu[k]); return s; };
}
let LL = null;
function nbrPred(trIdx, i, y) { // mean of 6 nearest training cells
  const [la, lo] = LL[i], c = Math.cos(la * Math.PI / 180); const best = [];
  for (const j of trIdx) { const d = (LL[j][0] - la) ** 2 + ((LL[j][1] - lo) * c) ** 2; if (best.length < 6) { best.push([d, j]); best.sort((a, b) => a[0] - b[0]); } else if (d < best[5][0]) { best[5] = [d, j]; best.sort((a, b) => a[0] - b[0]); } }
  return best.reduce((s, [, j]) => s + y[j], 0) / best.length;
}
const r2 = (y, p) => { const m = y.reduce((a, b) => a + b, 0) / y.length; let ss = 0, st = 0; y.forEach((v, i) => { ss += (v - p[i]) ** 2; st += (v - m) ** 2; }); return 1 - ss / st; };
let testY = 'built';
$$('#test-y button').forEach(b => b.onclick = () => { testY = b.dataset.y; $$('#test-y button').forEach(x => x.classList.toggle('on', x === b)); });
$('#test-k').oninput = e => { const k = +e.target.value; $('#test-kv').textContent = k ? `${k} ring${k > 1 ? 's' : ''} ≈ ${(k * 0.92).toFixed(1)} km` : 'none (only the block itself)'; };
$('#test-run').onclick = () => { busy(true); setTimeout(runTest, 30); };
function runTest() {
  home();
  const n = cells.length; if (!LL) LL = cells.map(c => h3.cellToLatLng(c.h));
  const y = cells.map(c => testY === 'built' ? c.b : Math.log1p(c.cs)); const X = testY === 'built' ? E20 : E24;
  const all = [...Array(n).keys()];
  // random 5-fold
  const r = rng(0), perm = [...all].sort(() => r() - 0.5); const pE = new Array(n), pN = new Array(n);
  for (let f = 0; f < 5; f++) { const te = perm.filter((_, k) => k % 5 === f), teS = new Set(te), tr = all.filter(i => !teS.has(i)); const m = ridge(tr, y, X); te.forEach(i => { pE[i] = m(i); pN[i] = nbrPred(tr, i, y); }); }
  const rand = [r2(y, pE), r2(y, pN)];
  // blocks: H3 resolution-6 parents, buffer k rings
  const k = +$('#test-k').value; const par = cells.map(c => h3.cellToParent(c.h, 6)); const blocks = [...new Set(par)];
  const bE = new Array(n), bN = new Array(n);
  for (const b of blocks) {
    const te = all.filter(i => par[i] === b); const ex = new Set(te.map(i => cells[i].h));
    if (k) te.forEach(i => h3.gridDisk(cells[i].h, k).forEach(h => ex.add(h)));
    const tr = all.filter(i => !ex.has(cells[i].h)); const m = ridge(tr, y, X);
    te.forEach(i => { bE[i] = m(i); bN[i] = nbrPred(tr, i, y); });
  }
  const blk = [r2(y, bE), r2(y, bN)];
  const err = bE.map((p, i) => Math.abs(p - y[i])); const cut = rankBins(err);
  paint(i => binCol(err[i], cut, CHG5), () => 0.72);
  legend(binLegend('Satellite model: size of error under the honest test', [...CHG5].reverse(), ['Largest 1%', '1–5%', '5–10%', '10–25%', 'The rest']));
  const bar = (lab, v, c) => `<div>${lab}</div><div><div class="ga-bar" style="width:${Math.max(0, v) * 100}%;background:${c}"></div></div><div class="n"><b>${fmt(v, 2)}</b></div>`;
  $('#test-out').innerHTML = `<h3>Share of variation explained (R²; 1 = perfect, 0 = no better than the average)</h3>
    <p><b>Easy test: random hexagons held out</b></p><div class="ga-bars">${bar('Satellite fingerprint', rand[0], '#1e3063')}${bar('Copy 6 neighbours', rand[1], '#9aa4b0')}</div>
    <p><b>Honest test: whole blocks held out${k ? ` with a ${k}-ring buffer` : ''}</b></p><div class="ga-bars">${bar('Satellite fingerprint', blk[0], '#1e3063')}${bar('Copy 6 neighbours', blk[1], '#9aa4b0')}</div>
    <p class="ga-note">${blocks.length} blocks (H3 resolution 6, about 36 km² each). Same hexagons are scored in both versions of the honest test; only what the model may learn from changes. Target: ${testY === 'built' ? 'built-up share, ESA WorldCover 2021 (fingerprints from 2020)' : 'log of 1 + shops and eateries per hexagon, Overture Maps 2026 (fingerprints from 2024)'}.</p>`;
  busy(false);
}

// ---------- 5 white space ----------
$('#ws-run').onclick = () => {
  home();
  const n = cells.length, has = cells.map(c => c.cf > 0), cafeIdx = cells.map((c, i) => i).filter(i => has[i]);
  const prof = new Float32Array(D); cafeIdx.forEach(i => { for (let k = 0; k < D; k++) prof[k] += E24[i * D + k]; }); let s = 0; for (let k = 0; k < D; k++) s += prof[k] ** 2; s = Math.sqrt(s); for (let k = 0; k < D; k++) prof[k] /= s;
  const score = cells.map((_, i) => dotv(E24, i, prof));
  // honest hit rate: rebuild the profile without each H3-6 block (+1 ring) and score that block
  const par = cells.map(c => h3.cellToParent(c.h, 6)); const hs = new Array(n);
  for (const b of new Set(par)) { const te = cells.map((c, i) => i).filter(i => par[i] === b); const ex = new Set(te.map(i => cells[i].h)); te.forEach(i => h3.gridDisk(cells[i].h, 1).forEach(h => ex.add(h))); const p = new Float32Array(D); cafeIdx.filter(i => !ex.has(cells[i].h)).forEach(i => { for (let k = 0; k < D; k++) p[k] += E24[i * D + k]; }); let q = 0; for (let k = 0; k < D; k++) q += p[k] ** 2; q = Math.sqrt(q) || 1; for (let k = 0; k < D; k++) p[k] /= q; te.forEach(i => hs[i] = dotv(E24, i, p)); }
  const top30 = hs.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 30); const hit = top30.filter(([, i]) => has[i]).length / 30, base = cafeIdx.length / n;
  const cut = rankBins(score);
  paint(i => binCol(score[i], cut, RAMP5), () => 0.72);
  const ws = score.map((v, i) => [v, i]).filter(([, i]) => !has[i]).sort((a, b) => b[0] - a[0]).slice(0, 15);
  outline(ws.map(([, i]) => i), '#c00000'); dots(cafeIdx.map(i => [i, '#111']));
  legend(binLegend('Likeness to the branded-café profile', [...RAMP5].reverse(), ['Top 1%', '1–5%', '5–10%', '10–25%', 'The rest']) + '<div class="sw"><i style="background:#111;border-radius:50%;width:14px;height:14px"></i>Has a branded café today</div><div class="sw"><i style="background:#fff;border:3px solid #c00000"></i>White space: top 15 without one</div>');
  $('#ws-out').innerHTML = `<h3>${cafeIdx.length} hexagons have a branded café today (${pct(base)} of all)</h3>
    <p>Honest check: rebuild the profile without each block of the city, then score that block. Of the 30 highest-scoring hexagons, <b>${pct(hit)}</b> already have a branded café, against ${pct(base)} by chance: about ${(hit / base).toFixed(0)}× better than picking at random.</p>
    <table><tr><th>White-space hexagon</th><th class="n">Likeness</th><th class="n">Shops &amp; eateries</th><th class="n">Built-up</th></tr>${ws.slice(0, 10).map(([v, i]) => `<tr><td>${cells[i].nm || cells[i].h.slice(0, 9) + '…'}</td><td class="n">${fmt(v, 3)}</td><td class="n">${cells[i].cs}</td><td class="n">${pct(cells[i].b)}</td></tr>`).join('')}</table>
    <p class="ga-note">Next step for a manager: visit the red-outlined hexagons, check rents, footfall and competitors, and confirm the listing data (Overture place listings can be incomplete).</p>`;
};

function about() {
  $('#about-out').innerHTML = `<p><b>Area:</b> Gurugram district, ${'1,646'} H3 resolution-8 hexagons (about 0.74 km² each, ${'1,256'} km² in all). Mumbai MMR core for the cross-city search.</p>
  <p><b>Fingerprints:</b> AlphaEarth Foundations satellite embeddings (Google DeepMind, 2025), annual 64-number vectors at 10 m, averaged per hexagon, years 2020 and 2024. Read from the open Source Cooperative mirror (CC-BY 4.0).</p>
  <p><b>Answer keys:</b> ESA WorldCover 2021 (land cover), JRC GHSL (built-up), Overture Maps release 2026-10-21 (places and buildings).</p>
  <p><b>Methods:</b> cosine similarity, prototype few-shot classifier, change as 1 − cosine, ridge regression with random and blocked cross-validation, embedding profile for white space. All run in your browser; nothing is uploaded.</p>
  <p><b>Imagery:</b> Sentinel-2 cloudless 2020 and 2024 by EOX IT Services GmbH (contains modified Copernicus Sentinel data).</p>`;
}
init();
