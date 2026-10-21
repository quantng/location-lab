// GeoFM Embedding Lab — evaluator (1), live embeddings (2), experiment (3). Runs fully in the browser.
import { parquetReadObjects } from '../../lib/hyparquet/index.js';
const $ = s => document.querySelector(s);
const el = (t, a = {}, ...c) => { const e = document.createElement(t); for (const k in a) { if (k === 'html') e.innerHTML = a[k]; else e.setAttribute(k, a[k]); } c.forEach(x => e.append(x)); return e; };
const fmt = v => v == null || Number.isNaN(v) ? '–' : (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(3));
const BASE = 'https://tiles.openfreemap.org/styles/positron';
const AEF = 'https://data.source.coop/tge-labs/aef/v1/annual/';
const NAMES = { gurgaon_ssdmi_aoi: 'Gurgaon speculative-construction area (India)', jaipur_ssdmi_aoi: 'Jaipur municipal-core area (India)', gurugram_city_osm: 'Gurugram city (India)', mumbai_mmr_core_osm: 'Mumbai MMR core (India)', songadh_taluka_osm: 'Songadh taluka, Gujarat — eucalyptus (India)', london_boroughs: 'Greater London boroughs', dubai_emirate_osm: 'Dubai emirate', zurich_canton_osm: 'Canton of Zürich', probe_cocoa_ci_bas_sassandra: 'Cocoa producer probe, Bas-Sassandra, Côte d\'Ivoire' };
const PRODN = { alphaearth_v1: 'AlphaEarth Foundations V1', tessera_v11: 'TESSERA v1.1', majortom_dinov2: 'Major TOM DINOv2', majortom_siglip: 'Major TOM SigLIP', majortom_alphaearth: 'Major TOM AlphaEarth cells', clay_lgnd_v15: 'Clay v1.5 / LGND', earthindex_v7: 'Earth Index v7', copernicus_embed: 'Copernicus-Embed' };
const CENTRE = { gurgaon_ssdmi_aoi: [76.9, 28.41], jaipur_ssdmi_aoi: [75.76, 26.89], gurugram_city_osm: [77.03, 28.45], mumbai_mmr_core_osm: [72.95, 19.2], songadh_taluka_osm: [73.6, 21.2], london_boroughs: [-0.1, 51.5], dubai_emirate_osm: [55.3, 25.1], zurich_canton_osm: [8.6, 47.4], probe_cocoa_ci_bas_sassandra: [-6.6, 5.35] };
let D = null, MAN = null, AOIS = [];
const GLOSS = {
  'coverage': 'Share of H3 cells in the area with a valid vector that year.',
  'imagery agreement': 'Blocked R² of a ridge probe from the embedding to a Sentinel-2 index (NDVI, NDBI, brightness). How much of the optical signal the vector keeps.',
  'temporal stability': 'Median cosine between consecutive years on cells with under 2 pp of GHSL built-up change. 1 = identical.',
  'distance decay': 'Mean cosine similarity by H3 ring distance; how fast similarity falls with distance.',
  'retrieval': 'precision@10: share of the ten nearest cosine neighbours that share the WorldCover 2021 majority class. Lift = precision divided by chance.',
  'neighbourhood coherence': "Moran's I of PC1: spatial autocorrelation of the embedding.",
  'downstream prediction': 'Blocked R² of a ridge probe predicting a label (GHSL built-up, WorldCover class fractions). Five spatial blocks, block-bootstrap interval.',
  'observed change': 'Spearman and AUC of embedding displacement (1 − cosine) against GHSL built-up change 2015–2020.',
  'forward change': 'R² and AUC predicting GHSL built-up change 2020–2025 from the 2020 vector.',
  'spatial transfer': 'Probe trained in one area, scored in another. Gap = in-region R² minus out-of-region R².',
  'leakage audit': 'Random-split R² minus blocked R². Positive = random splits flatter the product.',
  'effective rank': 'exp(entropy of normalised eigenvalues): how many dimensions carry variance.',
  'isotropy': 'Mean cosine between random pairs of vectors; near 0 = well spread.',
  'Fit (literature, 0–3)': '0 = not applicable, 3 = designed for it; rated from resolution vs object size, cadence, coverage, pixel vs patch, licence, cost.',
  'Pull MB / min': 'Estimated bytes and minutes to pull the product for this area at 25 MB/s.',
  'Product': 'Embedding product; hover a row for its documentation summary.'
};
const PRODTIP = { alphaearth_v1: 'Google AlphaEarth Foundations V1: 10 m, 64 dimensions, int8, unit length, annual 2017–2025, CC-BY 4.0. Dequantise sign(v)·(|v|/127.5)².', tessera_v11: 'TESSERA v1.1 (Cambridge): 10 m, 128 dimensions, Matryoshka, uint8 grids with per-tile scales, CC-BY-SA, AWS Open Data.', majortom_dinov2: 'Major TOM DINOv2 embeddings: 1,024-d on 10 km cells, single Sentinel-2 acquisition.', majortom_siglip: 'Major TOM SigLIP embeddings: 1,152-d on 10 km cells, single acquisition.', majortom_alphaearth: 'Major TOM re-cut of AlphaEarth into 10 km cells.', clay_lgnd_v15: 'Clay v1.5 / LGND: 256-d monthly on a 1.28 km hive grid (GeoParquet on Source Cooperative).', earthindex_v7: 'Earth Index v7 (Earth Genome): per-MGRS GeoParquet, 2024 and 2025–26.', copernicus_embed: 'Copernicus-Embed: 0.25° cells, 2021, multimodal.' };
function applyTips(root) { root.querySelectorAll('th, td, h3, span').forEach(n => { if (n.title) return; const t = n.textContent.trim(); for (const k in GLOSS) if (t === k || t.startsWith(k) || t.includes(k)) { n.title = GLOSS[k]; return; } for (const p in PRODN) if (t === PRODN[p]) { n.title = PRODTIP[p] || ''; return; } }); }


async function readParquet(url) { const buf = await (await fetch(url, { cache: 'force-cache' })).arrayBuffer(); const file = { byteLength: buf.byteLength, slice: (a, b) => buf.slice(a, b) }; return parquetReadObjects({ file }); } // whole-file fetch: GitHub Pages gzips parquet, which breaks range reads

// ------------------------------------------------------------------ tabs
document.querySelectorAll('.gf-tabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.gf-tabs button').forEach(x => x.setAttribute('aria-selected', x === b)); document.querySelectorAll('.gf-pane').forEach(p => p.hidden = p.id !== 't-' + b.dataset.t);
  if (b.dataset.t === 'live') initLive(); if (b.dataset.t === 'exp') initExp();
});

// ------------------------------------------------------------------ 1 EVALUATOR
const QUESTIONS = [
  ['Does this product cover my area and years?', 'L1 Represent', 'coverage', 'Share of cells with a valid vector, per year. Higher is better.'],
  ['How much of the imagery signal does the vector keep?', 'L1 Represent', 'imagery agreement', 'Blocked R² of a ridge probe from the embedding to Sentinel-2 indices. Higher is better.'],
  ['Same place next year, nothing changed: same vector?', 'L1 Represent', 'temporal stability', 'Median cosine across consecutive years on cells with under 2 pp of GHSL built-up change. Higher is better.'],
  ['Does near in embedding space mean near on the ground?', 'L2 Relate', 'distance decay', 'Mean cosine by hex-ring distance; the drop from ring 1 to ring 8 shows how much geography the vectors encode.'],
  ['Find more places like this one: how precise?', 'L2 Relate', 'retrieval', 'precision@10 of cosine neighbours sharing the WorldCover 2021 class, against chance.'],
  ['Can it predict what the ground looks like now?', 'L4 Reason', 'downstream prediction', 'Blocked R² predicting GHSL built-up 2020 and WorldCover 2021 class fractions; block-bootstrap intervals.'],
  ['Does vector movement match real change?', 'L4 Reason', 'observed change', 'Spearman and AUC of embedding displacement against GHSL and WorldCover built-up change.'],
  ['Can today\'s vector flag where building happens next?', 'L4 Reason', 'forward change', 'Blocked R² and AUC predicting GHSL built-up change 2020–2025 from the 2020 vector (2025 is modelled).'],
  ['Does a model trained in one city hold in another?', 'L5 Transfer', 'spatial transfer', 'Out-of-region R² and the transfer gap. Smaller gap is better.'],
  ['How much do random splits flatter this product?', 'L5 Transfer', 'leakage audit', 'Random-split R² minus blocked R² on the same target. Lower is better.']];
const TASKMAP = [
  { re: /real-estate|speculative|absorption/i, aois: ['gurgaon_ssdmi_aoi', 'jaipur_ssdmi_aoi', 'gurugram_city_osm', 'dubai_emirate_osm', 'mumbai_mmr_core_osm', 'london_boroughs'], tests: [['downstream prediction', 'GHSL built-up', 'R² built-up 2020'], ['forward change', 'AUC', 'AUC growth 2020–25'], ['retrieval', 'precision@10 of', 'precision@10'], ['leakage audit', 'GHSL built-up', 'leakage gap']] },
  { re: /collateral|change detection/i, aois: ['gurgaon_ssdmi_aoi', 'jaipur_ssdmi_aoi', 'gurugram_city_osm', 'dubai_emirate_osm', 'mumbai_mmr_core_osm', 'london_boroughs'], tests: [['observed change', 'AUC of embedding displacement for top-decile GHSL built-up change 2015-2020', 'AUC displacement vs GHSL change'], ['temporal stability', '', 'stability (cosine)']] },
  { re: /commodit|producer|cocoa|coffee|soy|wheat/i, aois: ['probe_cocoa_ci_bas_sassandra'], tests: [['imagery agreement', 'NDVI', 'R² to vegetation index'], ['downstream prediction', 'tree-cover', 'R² tree cover'], ['temporal stability', '', 'stability (cosine)']] },
  { re: /eucalyptus|plantation|songadh/i, aois: ['songadh_taluka_osm'], tests: [['downstream prediction', 'tree-cover', 'R² tree cover'], ['downstream prediction', 'cropland', 'R² cropland'], ['retrieval', 'precision@10 of', 'precision@10']] },
  { re: /retriev|find more|like this/i, aois: null, tests: [['retrieval', 'precision@10 of', 'precision@10'], ['retrieval', 'lift', 'lift over chance'], ['neighbourhood coherence', '', 'Moran\'s I']] },
  { re: /year-on-year|change screening/i, aois: null, tests: [['observed change', 'AUC of embedding displacement for top-decile GHSL built-up change 2015-2020', 'AUC displacement vs change'], ['temporal stability', '', 'stability'], ['forward change', 'AUC', 'AUC future growth']] },
  { re: /transfer|train one city/i, aois: null, tests: [['spatial transfer', 'out-of-region', 'out-of-region R²'], ['spatial transfer', 'transfer gap', 'transfer gap'], ['leakage audit', 'GHSL built-up', 'leakage gap']] },
  { re: /energy|night|municipal|fiscal|storm|outage|restaurant|urban form/i, aois: [], tests: [] }];
const med = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
function fill(sel, items, lab) { sel.innerHTML = ''; items.forEach(i => sel.append(el('option', { value: i }, lab ? lab(i) : String(i)))); }

function evRender() {
  const view = $('#ev-view').value, aoi = $('#ev-aoi').value, body = $('#ev-body'); body.innerHTML = ''; $('#ev-exp').textContent = '';
  $('#ev-qwrap').style.display = view === 'ask' ? '' : 'none'; $('#ev-twrap').style.display = view === 'task' ? '' : 'none';
  if (view === 'task') {
    const r = D.taskfit[$('#ev-task').value]; const tname = String(Object.values(r)[0]); const tm = TASKMAP.find(t => t.re.test(tname)) || { aois: [], tests: [] };
    $('#ev-exp').innerHTML = `<b>${tname}</b><br>${r.recommended_product_and_why || ''}` + (tm.aois && !tm.aois.length ? '<br><i>No evaluated area belongs to this task; literature fit only.</i>' : '');
    const cols = Object.keys(r).filter(c => !/^task|recommended/.test(c)); const prods = [...new Set([...cols, 'tessera_v11', 'majortom_dinov2', 'majortom_siglip'])];
    const t = el('table', { class: 'gf-t' }); t.append(el('tr', {}, el('th', {}, 'Product'), el('th', {}, 'Fit (literature, 0–3)'), ...tm.tests.map(x => el('th', {}, x[2] + ' — measured'))));
    prods.forEach(p => {
      const fitv = r[p] != null ? String(r[p]) : (p.startsWith('majortom') && r.majortom_dinov2_siglip_ssl4eo != null ? String(r.majortom_dinov2_siglip_ssl4eo) : '–');
      const tr = el('tr', {}, el('td', {}, PRODN[p] || p), el('td', {}, fitv)); const m = /^([0-3])/.exec(fitv); if (m) { const sh = Math.round(235 - 45 * +m[1]); tr.children[1].style.background = `rgb(${sh},${sh},${sh})`; }
      tm.tests.forEach(([test, sub, lab]) => { const rows = D.scores.filter(s => s.product === p && s.test === test && (!sub || s.metric.includes(sub)) && (tm.aois == null || tm.aois.includes(s.aoi_id)) && s.value != null); const v = med(rows.map(x => x.value)); tr.append(el('td', { class: 'num', html: v == null ? '–' : `<b>${fmt(v)}</b> <span class="gf-ci">(${rows.length} rows, ${new Set(rows.map(x => x.aoi_id)).size} areas)</span>` })); });
      t.append(tr);
    });
    body.append(t, el('div', { class: 'gf-key' }, 'Fit: literature rating from resolution vs object size, cadence, coverage, pixel vs patch, licence and cost. Power: medians of what this evaluation measured on the areas that belong to the task.'));
  } else if (view === 'ask') {
    const q = QUESTIONS[$('#ev-q').value]; $('#ev-exp').textContent = q[3];
    const rows = D.scores.filter(s => s.aoi_id === aoi && s.layer === q[1] && s.test === q[2]); const years = [...new Set(rows.map(r => r.year))].sort(); const prods = [...new Set(rows.map(r => r.product))];
    const g = el('div', { class: 'gf-cards' });
    prods.forEach(p => { const c = el('div', { class: 'gf-card' }, el('h3', {}, PRODN[p] || p)); years.forEach(y => { rows.filter(r => r.product === p && r.year === y).forEach(r => c.append(el('div', { class: 'gf-metric' }, el('span', {}, `${y} · ${r.metric}`), el('b', { html: fmt(r.value) + (r.ci_low != null ? ` <span class="gf-ci">[${fmt(r.ci_low)}, ${fmt(r.ci_high)}]</span>` : '') })))); }); g.append(c); });
    if (!prods.length) g.append(el('div', { class: 'gf-note' }, 'No product has a result for this question here.')); body.append(g);
  } else if (view === 'inv') {
    const rows = D.inventory.filter(r => r.aoi_id === aoi); const prods = [...new Set(rows.map(r => r.product))], years = [...new Set(rows.map(r => r.year))].sort();
    const t = el('table', { class: 'gf-t' }); t.append(el('tr', {}, el('th', {}, 'Product'), ...years.map(y => el('th', {}, String(y))), el('th', {}, 'Pull MB / min')));
    prods.forEach(p => { const tr = el('tr', {}, el('td', {}, PRODN[p] || p)); let mb = 0, mn = 0; years.forEach(y => { const r = rows.find(x => x.product === p && x.year === y); const v = r ? r.coverage_frac : null; mb += r?.bytes_est || 0; mn += r?.est_pull_minutes || 0; const td = el('td', { class: 'num' }, v == null ? '–' : v.toFixed(2)); if (v != null) { const s = Math.round(235 - 150 * v); td.style.background = `rgb(${s},${s},${s})`; td.style.color = v > 0.6 ? '#fff' : '#000'; } tr.append(td); }); tr.append(el('td', { class: 'num' }, `${(mb / 1e6).toFixed(0)} / ${mn.toFixed(0)}`)); t.append(tr); });
    body.append(t, el('div', { class: 'gf-key' }, 'Cell = share of the area covered by that product in that year. Pull estimates at 25 MB/s.'), el('img', { src: 'img/inventory_heatmap.jpg', style: 'max-width:100%;margin-top:10px' }));
  } else if (view === 'maps') {
    const g = el('div', { class: 'gf-imgs' });
    ['alphaearth_v1', 'tessera_v11'].forEach(p => { const im = new Image(); im.src = `img/${aoi}__${p}.jpg`; im.onload = () => g.append(el('figure', {}, im, el('figcaption', {}, `${PRODN[p]}: Sentinel-2 true colour · principal components 1–3 as colour on H3 cells · where the vector moved (1 − cosine) between first and last year`))); });
    body.append(g);
  } else if (view === 'card') {
    const im = el('img', { src: `img/${aoi}.jpg`, style: 'max-width:900px;width:100%' }); body.append(im);
    const c = D.cards?.[aoi]; if (c) Object.keys(c).forEach(p => body.append(el('div', { class: 'gf-card', style: 'margin-top:10px' }, el('h3', {}, PRODN[p] || p), el('div', {}, c[p]))));
  } else if (view === 'fit') {
    const cols = Object.keys(D.taskfit[0]); const t = el('table', { class: 'gf-t' }); t.append(el('tr', {}, ...cols.map(c => el('th', {}, c.replace(/_/g, ' ')))));
    D.taskfit.forEach(r => t.append(el('tr', {}, ...cols.map(c => { const v = r[c]; const td = el('td', {}, v == null ? '' : String(v)); const m = /^([0-3])\s*[-–]/.exec(String(v || '')); if (m) { const s = Math.round(235 - 45 * +m[1]); td.style.background = `rgb(${s},${s},${s})`; } return td; })))); body.append(t);
  } else if (view === 'bench') {
    const cols = Object.keys(D.benchmarks[0]); const t = el('table', { class: 'gf-t' }); t.append(el('tr', {}, ...cols.map(c => el('th', {}, c.replace(/_/g, ' '))))); D.benchmarks.forEach(r => t.append(el('tr', {}, ...cols.map(c => el('td', {}, r[c] == null ? '' : String(r[c])))))); body.append(t);
  }
  applyTips(body);
}

// ------------------------------------------------------------------ maths helpers
function utm(zone, north) { // forward/inverse WGS84 <-> UTM (Krüger series, sufficient at metre level)
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, lon0 = (zone - 1) * 6 - 180 + 3, n = f / (2 - f), A = a / (1 + n) * (1 + n * n / 4 + n ** 4 / 64);
  const al = [n / 2 - 2 * n * n / 3 + 5 * n ** 3 / 16, 13 * n * n / 48 - 3 * n ** 3 / 5, 61 * n ** 3 / 240], be = [n / 2 - 2 * n * n / 3 + 37 * n ** 3 / 96, n * n / 48 + n ** 3 / 15, 17 * n ** 3 / 480], de = [2 * n - 2 * n * n / 3 - 2 * n ** 3, 7 * n * n / 3 - 8 * n ** 3 / 5, 56 * n ** 3 / 15];
  const N0 = north ? 0 : 1e7, r = Math.PI / 180;
  return {
    fwd(lon, lat) { const φ = lat * r, λ = (lon - lon0) * r, t = Math.sinh(Math.atanh(Math.sin(φ)) - 2 * Math.sqrt(n) / (1 + n) * Math.atanh(2 * Math.sqrt(n) / (1 + n) * Math.sin(φ))); const ξp = Math.atan(t / Math.cos(λ)), ηp = Math.atanh(Math.sin(λ) / Math.sqrt(1 + t * t)); let ξ = ξp, η = ηp; for (let j = 1; j <= 3; j++) { ξ += al[j - 1] * Math.sin(2 * j * ξp) * Math.cosh(2 * j * ηp); η += al[j - 1] * Math.cos(2 * j * ξp) * Math.sinh(2 * j * ηp); } return [500000 + k0 * A * η, N0 + k0 * A * ξ]; },
    inv(x, y) { const ξ = (y - N0) / (k0 * A), η = (x - 500000) / (k0 * A); let ξp = ξ, ηp = η; for (let j = 1; j <= 3; j++) { ξp -= be[j - 1] * Math.sin(2 * j * ξ) * Math.cosh(2 * j * η); ηp -= be[j - 1] * Math.cos(2 * j * ξ) * Math.sinh(2 * j * η); } const χ = Math.asin(Math.sin(ξp) / Math.cosh(ηp)); let φ = χ; for (let j = 1; j <= 3; j++) φ += de[j - 1] * Math.sin(2 * j * χ); const λ = Math.atan(Math.sinh(ηp) / Math.cos(ξp)); return [lon0 + λ / r, φ / r]; }
  };
}
function deq(v) { return v === -128 ? NaN : Math.sign(v) * (Math.abs(v) / 127.5) ** 2; }
function symEig(M, k) { // top-k eigenvectors of symmetric matrix by orthogonal power iteration
  const n = M.length; let V = Array.from({ length: k }, (_, i) => Array.from({ length: n }, (_, j) => Math.sin(i * 7.1 + j * 1.3)));
  const mul = v => { const o = new Array(n).fill(0); for (let i = 0; i < n; i++) { let s = 0; const Mi = M[i]; for (let j = 0; j < n; j++) s += Mi[j] * v[j]; o[i] = s; } return o; };
  for (let it = 0; it < 60; it++) { V = V.map(mul); for (let i = 0; i < k; i++) { for (let j = 0; j < i; j++) { let d = 0; for (let t = 0; t < n; t++) d += V[i][t] * V[j][t]; for (let t = 0; t < n; t++) V[i][t] -= d * V[j][t]; } let nn = Math.sqrt(V[i].reduce((s, x) => s + x * x, 0)) || 1; V[i] = V[i].map(x => x / nn); } }
  return V;
}
function pcaRGB(X, D_) { // X: Float32Array[n*D], returns rgb Uint8ClampedArray and the basis
  const n = X.length / D_; const mu = new Float64Array(D_), sd = new Float64Array(D_); let cnt = 0;
  for (let i = 0; i < n; i++) { if (Number.isNaN(X[i * D_])) continue; cnt++; for (let d = 0; d < D_; d++) mu[d] += X[i * D_ + d]; }
  for (let d = 0; d < D_; d++) mu[d] /= Math.max(1, cnt);
  for (let i = 0; i < n; i++) { if (Number.isNaN(X[i * D_])) continue; for (let d = 0; d < D_; d++) { const z = X[i * D_ + d] - mu[d]; sd[d] += z * z; } }
  for (let d = 0; d < D_; d++) sd[d] = Math.sqrt(sd[d] / Math.max(1, cnt)) || 1;
  const C = Array.from({ length: D_ }, () => new Array(D_).fill(0)); const step = Math.max(1, Math.floor(n / 20000));
  for (let i = 0; i < n; i += step) { if (Number.isNaN(X[i * D_])) continue; const z = new Float64Array(D_); for (let d = 0; d < D_; d++) z[d] = (X[i * D_ + d] - mu[d]) / sd[d]; for (let a = 0; a < D_; a++) { const Ca = C[a], za = z[a]; for (let b = a; b < D_; b++) Ca[b] += za * z[b]; } }
  for (let a = 0; a < D_; a++) for (let b = 0; b < a; b++) C[a][b] = C[b][a];
  const V = symEig(C, 3); const P = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { let s = 0; if (Number.isNaN(X[i * D_])) { P[i * 3 + c] = NaN; continue; } for (let d = 0; d < D_; d++) s += V[c][d] * (X[i * D_ + d] - mu[d]) / sd[d]; P[i * 3 + c] = s; }
  const rgb = new Uint8ClampedArray(n * 4); const lo = [0, 0, 0], hi = [0, 0, 0];
  for (let c = 0; c < 3; c++) { const vals = []; for (let i = 0; i < n; i += step) if (!Number.isNaN(P[i * 3 + c])) vals.push(P[i * 3 + c]); vals.sort((a, b) => a - b); lo[c] = vals[Math.floor(vals.length * 0.02)] ?? 0; hi[c] = vals[Math.floor(vals.length * 0.98)] ?? 1; }
  for (let i = 0; i < n; i++) { if (Number.isNaN(P[i * 3])) { rgb[i * 4 + 3] = 0; continue; } for (let c = 0; c < 3; c++) rgb[i * 4 + c] = 255 * Math.min(1, Math.max(0, (P[i * 3 + c] - lo[c]) / (hi[c] - lo[c] || 1))); rgb[i * 4 + 3] = 255; }
  return { rgb, V, mu, sd };
}
function cosineChange(A, B, D_) { const n = A.length / D_; const out = new Float32Array(n); for (let i = 0; i < n; i++) { let ab = 0, aa = 0, bb = 0; const a0 = A[i * D_], b0 = B[i * D_]; if (Number.isNaN(a0) || Number.isNaN(b0)) { out[i] = NaN; continue; } for (let d = 0; d < D_; d++) { const x = A[i * D_ + d], y = B[i * D_ + d]; ab += x * y; aa += x * x; bb += y * y; } out[i] = 1 - ab / (Math.sqrt(aa * bb) || 1); } return out; }
function magma(t) { t = Math.min(1, Math.max(0, t)); const stops = [[252, 253, 191], [254, 176, 120], [241, 96, 93], [183, 55, 121], [114, 31, 129], [44, 17, 95], [0, 0, 4]]; const x = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x)), f = x - i; return stops[i].map((v, k) => v + f * (stops[i + 1][k] - v)); }

// ------------------------------------------------------------------ 2 LIVE
let lvMap, lvBox = null, lvDrawing = false, lvIndex = null, lvState = {};
// AEF tiles are ZSTD-compressed (TIFF compression 50000); register a pure-JS decoder (fzstd) with geotiff.js
GeoTIFF.addDecoder(50000, () => Promise.resolve(class extends GeoTIFF.BaseDecoder { decodeBlock(buf) { return fzstd.decompress(new Uint8Array(buf)).buffer; } }));
async function initLive() {
  if (lvMap) return;
  lvMap = new maplibregl.Map({ container: 'lv-map', style: BASE, center: [76.95, 28.42], zoom: 10, attributionControl: { compact: true } }); lvMap.addControl(new maplibregl.NavigationControl(), 'top-right'); lvMap.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');
  lvMap.on('load', () => { lvMap.addSource('box', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }); lvMap.addLayer({ id: 'box', type: 'line', source: 'box', paint: { 'line-color': '#4a3f8f', 'line-width': 2 } }); });
  const years = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]; fill($('#lv-ya'), years); fill($('#lv-yb'), years); $('#lv-ya').value = 2018; $('#lv-yb').value = 2025;
  let start = null;
  $('#lv-draw').onclick = () => { lvDrawing = true; start = null; $('#lv-status').textContent = 'Click the first corner, then the opposite corner.'; };
  lvMap.on('click', e => {
    if (lvDrawing) { if (!start) { start = e.lngLat; return; } const w = Math.min(start.lng, e.lngLat.lng), ea = Math.max(start.lng, e.lngLat.lng), s = Math.min(start.lat, e.lngLat.lat), n = Math.max(start.lat, e.lngLat.lat); lvBox = [w, s, ea, n]; lvDrawing = false; lvMap.getSource('box').setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[w, s], [ea, s], [ea, n], [w, n], [w, s]]] } }] }); const km = (ea - w) * 111 * Math.cos((s + n) / 2 * Math.PI / 180), kmh = (n - s) * 111; $('#lv-status').textContent = `Box ${km.toFixed(1)} × ${kmh.toFixed(1)} km. Press "Read embeddings".`; $('#lv-run').disabled = false; return; }
    if (lvState.grid) showPixel(e.lngLat);
  });
  $('#lv-run').onclick = runLive; $('#lv-clear').onclick = () => { lvBox = null; lvState = {}; ['ov'].forEach(id => { if (lvMap.getLayer(id)) lvMap.removeLayer(id); if (lvMap.getSource(id)) lvMap.removeSource(id); }); lvMap.getSource('box')?.setData({ type: 'FeatureCollection', features: [] }); $('#lv-status').textContent = 'Ready.'; $('#lv-stats').textContent = ''; };
  $('#lv-layer').onchange = () => { $('#lv-rawwrap').hidden = !$('#lv-layer').value.startsWith('raw'); paintOverlay(); };
  ['#lv-r', '#lv-g', '#lv-b', '#lv-lo', '#lv-hi'].forEach(id => $(id).oninput = () => { $('#lv-rl').textContent = 'A' + String($('#lv-r').value).padStart(2, '0'); $('#lv-gl').textContent = 'A' + String($('#lv-g').value).padStart(2, '0'); $('#lv-bl').textContent = 'A' + String($('#lv-b').value).padStart(2, '0'); $('#lv-scl').textContent = `${(+$('#lv-lo').value).toFixed(2)} – ${(+$('#lv-hi').value).toFixed(2)}`; if (lvState.w) paintOverlay(); });
  $('#lv-goto').onchange = () => { const v = $('#lv-goto').value; if (!v) return; const [lng, lat, z] = v.split(',').map(Number); lvMap.flyTo({ center: [lng, lat], zoom: z }); };
  $('#lv-view').onclick = () => { const b = lvMap.getBounds(); let w = b.getWest(), e = b.getEast(), s = b.getSouth(), n = b.getNorth(); const cy = (s + n) / 2, kx = 111 * Math.cos(cy * Math.PI / 180), ky = 111; const cap = 20; if ((e - w) * kx > cap) { const c = (w + e) / 2; w = c - cap / kx / 2; e = c + cap / kx / 2; } if ((n - s) * ky > cap) { s = cy - cap / ky / 2; n = cy + cap / ky / 2; } lvBox = [w, s, e, n]; lvMap.getSource('box').setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } }] }); $('#lv-status').textContent = `Box ${((e - w) * kx).toFixed(1)} × ${((n - s) * ky).toFixed(1)} km from the current view. Press "Read embeddings".`; $('#lv-run').disabled = false; }; $('#lv-op').oninput = () => { if (lvMap.getLayer('ov')) lvMap.setPaintProperty('ov', 'raster-opacity', +$('#lv-op').value); };
}
async function loadIndex() { if (lvIndex) return lvIndex; $('#lv-status').textContent = 'Loading the AlphaEarth tile index (3 MB)…'; lvIndex = await readParquet('data/aef_index_compact.parquet'); return lvIndex; }
function tilesFor(year, box) { return lvIndex.filter(r => r.year === year && r.wgs84_west <= box[2] && r.wgs84_east >= box[0] && r.wgs84_south <= box[3] && r.wgs84_north >= box[1]).map(r => ({ ...r, overlap: Math.max(0, Math.min(r.wgs84_east, box[2]) - Math.max(r.wgs84_west, box[0])) * Math.max(0, Math.min(r.wgs84_north, box[3]) - Math.max(r.wgs84_south, box[1])) })).sort((a, b) => b.overlap - a.overlap); }
async function readWindow(rel, box, resM) {
  const tiff = await GeoTIFF.fromUrl(AEF + rel, { allowFullFile: false }); const img0 = await tiff.getImage(0); const keys = img0.getGeoKeys(); const epsg = keys.ProjectedCSTypeGeoKey; const zone = epsg % 100, north = Math.floor(epsg / 100) === 326; const P = utm(zone, north);
  const [x0, y0] = P.fwd(box[0], box[1]), [x1, y1] = P.fwd(box[2], box[3]); const xmin = Math.min(x0, x1), xmax = Math.max(x0, x1), ymin = Math.min(y0, y1), ymax = Math.max(y0, y1);
  const count = await tiff.getImageCount(); const MT = img0.fileDirectory.ModelTransformation; let ox, oy, rx0, ry0; if (MT) { ox = MT[3]; oy = MT[7]; rx0 = MT[0]; ry0 = MT[5]; } else { [ox, oy] = img0.getOrigin(); [rx0, ry0] = img0.getResolution(); } const W0 = img0.getWidth(); let level = 0; // AEF tiles use ModelTransformation with +y scale (bottom-up rows)
  for (let i = 0; i < count; i++) { const im = await tiff.getImage(i); const sc = W0 / im.getWidth(); if (Math.abs(rx0) * sc <= resM * 1.01) level = i; else break; }
  const img = await tiff.getImage(level); const W = img.getWidth(), H = img.getHeight(); const sc = W0 / W; const rx = rx0 * sc, ry = ry0 * sc; // overviews carry no geotransform: derive from level 0
  const col = x => Math.floor((x - ox) / rx), row = y => Math.floor((y - oy) / ry); let c0 = col(xmin), c1 = col(xmax), r0 = row(ymax), r1 = row(ymin); if (r0 > r1) [r0, r1] = [r1, r0]; if (c0 > c1) [c0, c1] = [c1, c0];
  c0 = Math.max(0, c0); r0 = Math.max(0, r0); c1 = Math.min(W, c1 + 1); r1 = Math.min(H, r1 + 1); if (c1 - c0 < 2 || r1 - r0 < 2) throw new Error('box does not overlap this tile at this resolution');
  const ras = await img.readRasters({ window: [c0, r0, c1, r1], interleave: false }); const w = c1 - c0, h = r1 - r0, Dn = ras.length; const X = new Float32Array(w * h * Dn);
  for (let d = 0; d < Dn; d++) { const b = ras[d]; for (let i = 0; i < w * h; i++) X[i * Dn + d] = deq(b[i]); }
  // geographic bounds of the window (handle bottom-up rasters where ry > 0)
  const xa = ox + c0 * rx, xb = ox + c1 * rx, ya = oy + r0 * ry, yb = oy + r1 * ry; const corners = [[xa, ya], [xb, ya], [xb, yb], [xa, yb]].map(([x, y]) => P.inv(x, y)); const flip = ry > 0;
  return { X, w, h, D: Dn, corners, flip, zone, north, origin: [ox, oy], res: [rx, ry], c0, r0, P };
}
async function runLive() {
  try {
    const ya = +$('#lv-ya').value, yb = +$('#lv-yb').value, resM = +$('#lv-res').value; if (!lvBox) return; await loadIndex();
    const ta = tilesFor(ya, lvBox), tb = tilesFor(yb, lvBox); if (!ta.length || !tb.length) { $('#lv-status').textContent = 'No AlphaEarth tile covers this box for one of the years.'; return; }
    const note = (ta.length > 1 || tb.length > 1) ? ' (box straddles tiles; reading the tile with the largest overlap)' : '';
    $('#lv-status').textContent = `Reading ${ya} and ${yb} at ${resM} m from the open bucket${note}…`; const t0 = performance.now();
    const A = await readWindow(ta[0].rel, lvBox, resM); $('#lv-status').textContent += `\n${ya}: ${A.w}×${A.h} px × ${A.D} bands read.`; const B = await readWindow(tb[0].rel, lvBox, resM);
    const w = Math.min(A.w, B.w), h = Math.min(A.h, B.h); const crop = (R) => { if (R.w === w && R.h === h) return R.X; const Y = new Float32Array(w * h * R.D); for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) for (let d = 0; d < R.D; d++) Y[(r * w + c) * R.D + d] = R.X[(r * R.w + c) * R.D + d]; return Y; };
    const XA = crop(A), XB = crop(B); const pb = pcaRGB(XB, B.D), pa = pcaRGB(XA, A.D); const chg = cosineChange(XA, XB, A.D);
    lvState = { A, B, XA, XB, w, h, D: A.D, pa, pb, chg, ya, yb }; const vals = Array.from(chg).filter(v => !Number.isNaN(v)).sort((a, b) => a - b); const q = p => vals[Math.floor(vals.length * p)];
    $('#lv-stats').textContent = `Done in ${((performance.now() - t0) / 1000).toFixed(1)} s. ${w}×${h} pixels at ${resM} m, ${A.D} dimensions each, both years.\nChange ${ya}→${yb} (1 − cosine): median ${q(0.5).toFixed(3)}, 90th percentile ${q(0.9).toFixed(3)}, share above 0.3 = ${(100 * vals.filter(v => v > 0.3).length / vals.length).toFixed(1)} %.\nTile ${yb}: ${tb[0].rel}`;
    paintOverlay();
  } catch (e) { $('#lv-status').textContent = 'Read failed: ' + e.message; console.error(e); }
}
function paintOverlay() {
  const s = lvState; if (!s.grid && !s.w) return; const which = $('#lv-layer').value; const cv = document.createElement('canvas'); cv.width = s.w; cv.height = s.h; const ctx = cv.getContext('2d'); const id = ctx.createImageData(s.w, s.h);
  if (which === 'pca' || which === 'pcaA') { id.data.set((which === 'pca' ? s.pb : s.pa).rgb); }
  else if (which === 'raw' || which === 'rawA') { const X = which === 'raw' ? s.XB : s.XA; const bands = [+$('#lv-r').value, +$('#lv-g').value, +$('#lv-b').value]; const lo = +$('#lv-lo').value, hi = Math.max(+$('#lv-hi').value, lo + 0.02); for (let i = 0; i < s.w * s.h; i++) { const v0 = X[i * s.D]; if (Number.isNaN(v0)) { id.data[i * 4 + 3] = 0; continue; } for (let c = 0; c < 3; c++) id.data[i * 4 + c] = 255 * Math.min(1, Math.max(0, (X[i * s.D + bands[c]] - lo) / (hi - lo))); id.data[i * 4 + 3] = 255; } }
  else { const vals = Array.from(s.chg).filter(v => !Number.isNaN(v)).sort((a, b) => a - b); const hi = Math.max(0.05, vals[Math.floor(vals.length * 0.98)] || 0.3); for (let i = 0; i < s.w * s.h; i++) { const v = s.chg[i]; if (Number.isNaN(v)) { id.data[i * 4 + 3] = 0; continue; } const c = magma(v / hi); id.data[i * 4] = c[0]; id.data[i * 4 + 1] = c[1]; id.data[i * 4 + 2] = c[2]; id.data[i * 4 + 3] = 255; } }
  ctx.putImageData(id, 0, 0); if (s.B.flip) { const cv2 = document.createElement('canvas'); cv2.width = s.w; cv2.height = s.h; const c2 = cv2.getContext('2d'); c2.translate(0, s.h); c2.scale(1, -1); c2.drawImage(cv, 0, 0); cv.getContext('2d').clearRect(0, 0, s.w, s.h); ctx.drawImage(cv2, 0, 0); }
  const C = s.B.corners; // corners order: [xa,ya],[xb,ya],[xb,yb],[xa,yb]; for top-down rasters ya is the top row
  const coords = s.B.flip ? [C[3], C[2], C[1], C[0]] : [C[0], C[1], C[2], C[3]];
  const url = cv.toDataURL(); if (lvMap.getSource('ov')) { lvMap.getSource('ov').updateImage({ url, coordinates: coords }); } else { lvMap.addSource('ov', { type: 'image', url, coordinates: coords }); lvMap.addLayer({ id: 'ov', type: 'raster', source: 'ov', paint: { 'raster-opacity': +$('#lv-op').value, 'raster-resampling': 'nearest' } }, 'box'); }
  s.grid = true;
}
function showPixel(ll) {
  const s = lvState; const [x, y] = s.B.P.fwd(ll.lng, ll.lat); const c = Math.floor((x - s.B.origin[0]) / s.B.res[0]) - s.B.c0, r = Math.floor((y - s.B.origin[1]) / s.B.res[1]) - s.B.r0; if (c < 0 || r < 0 || c >= s.w || r >= s.h) return;
  const i = r * s.w + c; const cv = $('#lv-sig'), ctx = cv.getContext('2d'); ctx.clearRect(0, 0, cv.width, cv.height); const Dn = s.D, bw = cv.width / Dn;
  const draw = (X, col) => { ctx.strokeStyle = col; ctx.beginPath(); for (let d = 0; d < Dn; d++) { const v = X[i * Dn + d]; const yy = cv.height / 2 - v * cv.height * 1.6; if (d === 0) ctx.moveTo(d * bw, yy); else ctx.lineTo(d * bw, yy); } ctx.stroke(); };
  ctx.strokeStyle = '#ccc'; ctx.beginPath(); ctx.moveTo(0, cv.height / 2); ctx.lineTo(cv.width, cv.height / 2); ctx.stroke(); draw(s.XA, '#999'); draw(s.XB, '#4a3f8f');
  $('#lv-pixel').textContent = `Pixel (${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}): grey = ${s.ya}, purple = ${s.yb}; ${Dn} numbers each; 1 − cosine = ${Number.isNaN(s.chg[i]) ? 'no data' : s.chg[i].toFixed(3)}.`;
}

// ------------------------------------------------------------------ 3 EXPERIMENT
let exMap, exCells = null;
function initExp() {
  if (exMap) return;
  exMap = new maplibregl.Map({ container: 'ex-map', style: BASE, center: [76.9, 28.41], zoom: 10, attributionControl: { compact: true } }); exMap.addControl(new maplibregl.NavigationControl(), 'top-right');
  fill($('#ex-aoi'), AOIS, a => NAMES[a] || a); exProducts(); $('#ex-aoi').onchange = () => { exProducts(); const c = CENTRE[$('#ex-aoi').value]; if (c) exMap.flyTo({ center: c, zoom: 10 }); }; $('#ex-prod').onchange = exYears; $('#ex-target').onchange = () => { $('#ex-upwrap').hidden = $('#ex-target').value !== 'upload'; };
  $('#ex-file').onchange = async e => { const f = e.target.files[0]; if (!f) return; const txt = await f.text(); const lines = txt.trim().split(/\r?\n/); const hdr = lines[0].toLowerCase().split(','); const rows = lines.slice(1).map(l => l.split(',')); exUpload = { hdr, rows }; $('#ex-upinfo').textContent = `${rows.length} rows, columns: ${hdr.join(', ')}`; };
  $('#ex-run').onclick = runExp;
}
let exUpload = null;
function exProducts() { const a = $('#ex-aoi').value; const prods = Object.keys(MAN.areas[a] || {}); fill($('#ex-prod'), prods, p => PRODN[p] || p); exYears(); }
function exYears() { const a = $('#ex-aoi').value, p = $('#ex-prod').value; fill($('#ex-year'), MAN.areas[a]?.[p] || []); }
function ridgeFit(X, y, alpha) { // X: array of Float64Array rows (standardised), returns weights and intercept
  const n = X.length, d = X[0].length; const G = Array.from({ length: d }, () => new Float64Array(d)); const b = new Float64Array(d); let ym = 0; for (let i = 0; i < n; i++) ym += y[i]; ym /= n;
  for (let i = 0; i < n; i++) { const xi = X[i], yi = y[i] - ym; for (let a = 0; a < d; a++) { b[a] += xi[a] * yi; const Ga = G[a], xa = xi[a]; for (let c = a; c < d; c++) Ga[c] += xa * xi[c]; } }
  for (let a = 0; a < d; a++) { for (let c = 0; c < a; c++) G[a][c] = G[c][a]; G[a][a] += alpha; }
  // Cholesky solve
  const L = Array.from({ length: d }, () => new Float64Array(d)); for (let i = 0; i < d; i++) for (let j = 0; j <= i; j++) { let s = G[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k]; L[i][j] = i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / L[j][j]; }
  const z = new Float64Array(d); for (let i = 0; i < d; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i][k] * z[k]; z[i] = s / L[i][i]; } const w = new Float64Array(d); for (let i = d - 1; i >= 0; i--) { let s = z[i]; for (let k = i + 1; k < d; k++) s -= L[k][i] * w[k]; w[i] = s / L[i][i]; }
  return { w, b0: ym };
}
function r2(y, p) { let ym = 0; for (const v of y) ym += v; ym /= y.length; let ss = 0, st = 0; for (let i = 0; i < y.length; i++) { ss += (y[i] - p[i]) ** 2; st += (y[i] - ym) ** 2; } return st > 0 ? 1 - ss / st : NaN; }
async function runExp() {
  const a = $('#ex-aoi').value, p = $('#ex-prod').value, y = $('#ex-year').value, tgt = $('#ex-target').value, alpha = +$('#ex-alpha').value; const out = $('#ex-out'); out.textContent = 'Loading embeddings and labels…';
  try {
    const emb = await readParquet(`data/emb/${a}__${p}__${y}.parquet`); const lab = await readParquet(`data/labels/${a}.parquet`); const ec = Object.keys(emb[0]).filter(k => k.startsWith('e_')); const L = new Map(lab.map(r => [r.h3, r]));
    let target = new Map(); if (tgt === 'upload') { if (!exUpload) { out.textContent = 'Upload a CSV first.'; return; } const h = exUpload.hdr; const res = h3.getResolution(emb[0].h3); const ih = h.indexOf('h3'), iv = h.indexOf('value'), ila = h.indexOf('lat'), ilo = h.indexOf('lon'); exUpload.rows.forEach(r => { const cell = ih >= 0 ? r[ih] : h3.latLngToCell(+r[ila], +r[ilo], res); const v = +r[iv]; if (!Number.isNaN(v)) target.set(cell, (target.get(cell) || 0) + v); }); } else { lab.forEach(r => { if (r[tgt] != null && !Number.isNaN(+r[tgt])) target.set(r.h3, +r[tgt]); }); }
    const rows = emb.filter(r => target.has(r.h3) && r[ec[0]] != null && !Number.isNaN(r[ec[0]])); if (rows.length < 60) { out.textContent = `Only ${rows.length} cells with both an embedding and a target; need at least 60.`; return; }
    const d = ec.length, n = rows.length; const mu = new Float64Array(d), sd = new Float64Array(d); rows.forEach(r => ec.forEach((c, k) => mu[k] += +r[c])); for (let k = 0; k < d; k++) mu[k] /= n; rows.forEach(r => ec.forEach((c, k) => sd[k] += (+r[c] - mu[k]) ** 2)); for (let k = 0; k < d; k++) sd[k] = Math.sqrt(sd[k] / n) || 1;
    const X = rows.map(r => { const v = new Float64Array(d); ec.forEach((c, k) => v[k] = (+r[c] - mu[k]) / sd[k]); return v; }); const Y = rows.map(r => target.get(r.h3)); const res = h3.getResolution(rows[0].h3); const blocks = rows.map(r => h3.cellToParent(r.h3, Math.max(0, res - 4)));
    const ub = [...new Set(blocks)]; for (let i = ub.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ub[i], ub[j]] = [ub[j], ub[i]]; } const fold = new Map(ub.map((b, i) => [b, i % 5])); const bf = blocks.map(b => fold.get(b)); const rf = rows.map((_, i) => i % 5);
    const cv = f => { const pred = new Float64Array(n); for (let k = 0; k < 5; k++) { const tr = [], te = []; for (let i = 0; i < n; i++) (f[i] === k ? te : tr).push(i); if (!tr.length || !te.length) continue; const m = ridgeFit(tr.map(i => X[i]), tr.map(i => Y[i]), alpha); te.forEach(i => { let s = m.b0; for (let q = 0; q < d; q++) s += m.w[q] * X[i][q]; pred[i] = s; }); } return pred; };
    const pb = cv(bf), pr = cv(rf); const r2b = r2(Y, pb), r2r = r2(Y, pr); const full = ridgeFit(X, Y, alpha); const order = [...full.w.keys()].sort((i, j) => Math.abs(full.w[j]) - Math.abs(full.w[i])); const tot = full.w.reduce((s, v) => s + Math.abs(v), 0); let acc = 0, k80 = 0; for (const i of order) { acc += Math.abs(full.w[i]); k80++; if (acc >= 0.8 * tot) break; }
    const verdict = r2b >= 0.8 ? 'strong' : r2b >= 0.5 ? 'useful' : r2b >= 0.2 ? 'weak' : 'not fit for this target';
    out.textContent = `${PRODN[p] || p} on ${NAMES[a] || a}, ${y}, target ${tgt}.\nCells: ${n} · dimensions: ${d} · spatial blocks: ${ub.length}\nBlocked R² (5 spatial folds): ${r2b.toFixed(3)}\nRandom-split R²: ${r2r.toFixed(3)} → leakage gap ${(r2r - r2b).toFixed(3)} (positive = random splits flatter the product)\nDimensions carrying 80 % of the probe weight: ${k80} of ${d}\nFitness verdict for this target: ${verdict}.`;
    // chart: predicted vs actual (blocked)
    const cvs = $('#ex-chart'), ctx = cvs.getContext('2d'); ctx.clearRect(0, 0, cvs.width, cvs.height); const ymin = Math.min(...Y), ymax = Math.max(...Y); const sx = v => 30 + (v - ymin) / (ymax - ymin || 1) * (cvs.width - 40), sy = v => cvs.height - 25 - (v - ymin) / (ymax - ymin || 1) * (cvs.height - 35);
    ctx.strokeStyle = '#bbb'; ctx.beginPath(); ctx.moveTo(sx(ymin), sy(ymin)); ctx.lineTo(sx(ymax), sy(ymax)); ctx.stroke(); ctx.fillStyle = 'rgba(74,63,143,0.45)'; for (let i = 0; i < n; i++) ctx.fillRect(sx(pb[i]) - 1.5, sy(Y[i]) - 1.5, 3, 3); ctx.fillStyle = '#333'; ctx.font = '11px sans-serif'; ctx.fillText('predicted (blocked, out of sample) →', 32, cvs.height - 8); ctx.save(); ctx.translate(10, cvs.height - 30); ctx.rotate(-Math.PI / 2); ctx.fillText('actual →', 0, 0); ctx.restore();
    const dt = el('table', { class: 'gf-t' }); dt.append(el('tr', {}, el('th', {}, 'Dimension'), el('th', {}, 'Standardised ridge weight'))); order.slice(0, 10).forEach(i => dt.append(el('tr', {}, el('td', {}, ec[i]), el('td', { class: 'num' }, full.w[i].toFixed(4))))); $('#ex-dims').innerHTML = ''; $('#ex-dims').append(el('div', { class: 'gf-key' }, 'Top dimensions by absolute weight (non-visual explanation).'), dt);
    // map: residual per cell
    const feats = rows.map((r, i) => ({ type: 'Feature', properties: { resid: Y[i] - pb[i], actual: Y[i], pred: pb[i] }, geometry: { type: 'Polygon', coordinates: [h3.cellToBoundary(r.h3, true)] } }));
    const data = { type: 'FeatureCollection', features: feats }; if (exMap.getSource('cells')) exMap.getSource('cells').setData(data); else { exMap.addSource('cells', { type: 'geojson', data }); exMap.addLayer({ id: 'cells', type: 'fill', source: 'cells', paint: { 'fill-color': ['interpolate', ['linear'], ['get', 'resid'], -0.3, '#2166ac', 0, '#f7f7f7', 0.3, '#b2182b'], 'fill-opacity': 0.75, 'fill-outline-color': 'rgba(0,0,0,0.15)' } }); exMap.on('click', 'cells', e => { const p_ = e.features[0].properties; new maplibregl.Popup().setLngLat(e.lngLat).setHTML(`actual ${(+p_.actual).toFixed(3)}<br>predicted ${(+p_.pred).toFixed(3)}<br>residual ${(+p_.resid).toFixed(3)}`).addTo(exMap); }); }
    const c = CENTRE[a]; if (c) exMap.flyTo({ center: c, zoom: 10 }); out.textContent += '\nMap: residual (actual − predicted, blocked). Blue = over-predicted, red = under-predicted. Click a cell.';
  } catch (e) { out.textContent = 'Failed: ' + e.message; console.error(e); }
}

// ------------------------------------------------------------------ boot
(async () => {
  D = await (await fetch('data/app_data.json')).json(); MAN = await (await fetch('data/manifest.json')).json(); AOIS = Object.keys(MAN.areas);
  fill($('#ev-aoi'), AOIS, a => NAMES[a] || a); fill($('#ev-q'), QUESTIONS.map((_, i) => i), i => QUESTIONS[i][0]); fill($('#ev-task'), D.taskfit.map((_, i) => i), i => String(Object.values(D.taskfit[i])[0]));
  ['#ev-aoi', '#ev-view', '#ev-q', '#ev-task'].forEach(s => $(s).onchange = evRender); evRender();
})();
