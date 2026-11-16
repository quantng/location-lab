// GeoML — from spatial statistics to machine learning to GeoAI, on Los Angeles census tracts.
// Data: US Census ACS 2019–23 (B19013, B25077, B01003), TIGER/Line 2023; AlphaEarth Foundations 2024 embeddings.
// Statistics (Moran, OLS, ML lag/error, LISA, Gi*, GWR) and cross-validated ML predictions were computed offline with PySAL, mgwr and scikit-learn.
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
let A = null, C = null, R = null, N = 0, map = null, geo = null, cent = [], E = null, mode = 'data';
const st = { dataVar: 'hv', sarM: 'ols', lisaF: null, gwrV: 'g_inc', rfS: 'p_base', clsS: 'c_base', km: null, sel: null, seed: null };

const f2 = v => v.toFixed(2), money = v => '$' + (v >= 1e6 ? (v / 1e6).toFixed(2) + 'm' : Math.round(v / 1e3) + 'k');
const num = v => Math.round(v).toLocaleString('en-US');
function busy(on) { $('#busy').hidden = !on; }
function legend(html) { const L = $('#legend'); if (!html) { L.hidden = true; return; } L.innerHTML = html; L.hidden = false; }
const sw = (c, l) => `<div class="sw"><i style="background:${c}"></i>${l}</div>`;
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function lerp(a, b, t) { const x = hexToRgb(a), y = hexToRgb(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); }
function ramp(stops, t) { t = Math.max(0, Math.min(1, t)); const k = (stops.length - 1) * t, i = Math.min(stops.length - 2, Math.floor(k)); return lerp(stops[i], stops[i + 1], k - i); }
const DIV = ['#2166ac', '#67a9cf', '#d1e5f0', '#f7f7f7', '#fddbc7', '#ef8a62', '#b2182b'];
const PUOR = ['#542788', '#998ec3', '#d8daeb', '#f7f7f7', '#fee0b6', '#f1a340', '#b35806'];
const SEQ = ['#f1eef6', '#d0d1e6', '#a6bddb', '#74a9cf', '#2b8cbe', '#045a8d'];
const divCol = (v, m, S = DIV) => ramp(S, (v / m + 1) / 2);
function quantiles(a, k) { const s = [...a].sort((x, y) => x - y); return Array.from({ length: k - 1 }, (_, i) => s[Math.floor((i + 1) * s.length / k)]); }
function binOf(v, br) { let i = 0; while (i < br.length && v >= br[i]) i++; return i; }

// ---------- map ----------
function paint(colFn, opFn) {
  for (let i = 0; i < N; i++) { geo.features[i].properties.col = colFn(i); geo.features[i].properties.op = opFn ? opFn(i) : 0.78; }
  map.getSource('t').setData(geo);
}
function outline(ids, color = '#111') {
  map.getSource('sel').setData({ type: 'FeatureCollection', features: ids.map(i => geo.features[i]) });
  map.setPaintProperty('sel', 'line-color', color);
}
function centroid(g) {
  const ring = g.type === 'Polygon' ? g.coordinates[0] : g.coordinates.reduce((a, p) => p[0].length > a.length ? p[0] : a, []);
  let x = 0, y = 0; ring.forEach(p => { x += p[0]; y += p[1]; }); return [x / ring.length, y / ring.length];
}
function nearest(lon, lat) { let b = 0, d = 1e9; cent.forEach((c, i) => { const e = (c[0] - lon) ** 2 + (c[1] - lat) ** 2; if (e < d) { d = e; b = i; } }); return b; }
const PLACES = [['Santa Monica Pier', -118.4973, 34.0094], ['Venice Beach', -118.4729, 33.985], ['Beverly Hills', -118.4004, 34.0696], ['Bel Air', -118.4593, 34.1002], ['Hollywood Sign', -118.3215, 34.1341], ['Griffith Observatory', -118.3004, 34.1184], ['Downtown LA', -118.2437, 34.0522], ['LAX', -118.4085, 33.9416], ['Port of Los Angeles', -118.2706, 33.7395], ['Compton', -118.2201, 33.8958], ['Vernon', -118.2301, 34.0039], ['Palos Verdes', -118.37, 33.775], ['Long Beach', -118.1937, 33.7701], ['Pasadena', -118.1445, 34.1478], ['Boyle Heights', -118.2051, 34.0339]];

async function init() {
  busy(true);
  const [g, d] = await Promise.all([fetch('data/la_tracts.geojson').then(r => r.json()), fetch('data/la_data.json').then(r => r.json())]);
  geo = g; A = d; C = d.cols; R = d.R; N = d.n;
  geo.features.forEach(f => { f.properties.col = '#d9dde2'; f.properties.op = 0.7; });
  cent = geo.features.map(f => centroid(f.geometry));
  // embeddings (int8, unit-normalised here)
  const bin = atob(A.emb), D = 64; E = new Float32Array(N * D);
  for (let i = 0; i < N; i++) { let s = 0; for (let k = 0; k < D; k++) { const v = (bin.charCodeAt(i * D + k) << 24) >> 24; E[i * D + k] = v; s += v * v; } s = Math.sqrt(s) || 1; for (let k = 0; k < D; k++) E[i * D + k] /= s; }
  map = new maplibregl.Map({ container: 'map', style: 'https://tiles.openfreemap.org/styles/positron', center: [-118.33, 33.98], zoom: 9.6, attributionControl: { compact: false, customAttribution: 'Data: US Census Bureau ACS 2019–23, TIGER/Line 2023 · Embeddings: AlphaEarth Foundations (Google DeepMind)' } });
  window.__map = map;
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.on('load', () => {
    map.addSource('t', { type: 'geojson', data: geo });
    map.addLayer({ id: 't', type: 'fill', source: 't', paint: { 'fill-color': ['get', 'col'], 'fill-opacity': ['get', 'op'], 'fill-outline-color': 'rgba(255,255,255,0.35)' } });
    map.addSource('sel', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'sel', type: 'line', source: 'sel', paint: { 'line-color': '#111', 'line-width': 2.5 } });
    map.addSource('pl', { type: 'geojson', data: { type: 'FeatureCollection', features: PLACES.map(([n, x, y]) => ({ type: 'Feature', properties: { n }, geometry: { type: 'Point', coordinates: [x, y] } })) } });
    map.addLayer({ id: 'pl-dot', type: 'circle', source: 'pl', paint: { 'circle-radius': 4.5, 'circle-color': '#c00000', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } });
    map.addLayer({ id: 'pl-lab', type: 'symbol', source: 'pl', layout: { 'text-field': ['get', 'n'], 'text-font': ['Noto Sans Bold'], 'text-size': 13, 'text-offset': [0.6, 0], 'text-anchor': 'left' }, paint: { 'text-color': '#14213d', 'text-halo-color': '#fff', 'text-halo-width': 1.8 } });
    map.on('click', 't', e => onClick(e.features[0].properties.i));
    map.on('mouseenter', 't', () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', 't', () => map.getCanvas().style.cursor = '');
    setupUI(); show('data'); busy(false);
  });
}

// ---------- tabs ----------
function show(t) {
  mode = t; $$('.ga-tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.t === t));
  $$('.ga-pane').forEach(p => p.hidden = p.id !== 'p-' + t);
  outline([]); st.sel = null;
  ({ data: rData, moran: rMoran, ols: rOls, sar: rSar, lisa: rLisa, gi: rGi, gwr: rGwr, rf: rRf, km: rKm, cls: rCls, emb: rEmb, geoai: rGeoai })[t]();
}
function seg(id, key, fn) { $$(`#${id} button`).forEach(b => b.onclick = () => { $$(`#${id} button`).forEach(x => x.classList.toggle('on', x === b)); st[key] = b.dataset[Object.keys(b.dataset)[0]]; fn(); }); }
function setupUI() {
  $$('.ga-tabs button').forEach(b => b.onclick = () => show(b.dataset.t));
  seg('data-var', 'dataVar', rData); seg('sar-m', 'sarM', rSar); seg('gwr-v', 'gwrV', rGwr); seg('rf-s', 'rfS', rRf); seg('cls-s', 'clsS', rCls);
  $('#km-k').oninput = e => $('#km-kv').textContent = e.target.value;
  $('#km-run').onclick = () => { st.km = kmeans(+$('#km-k').value); rKm(); };
  $('#km-reset').onclick = () => { st.km = null; rKm(); };
  $$('#p-emb .ga-chip[data-p]').forEach(b => b.onclick = () => { const [x, y] = b.dataset.p.split(',').map(Number); st.seed = nearest(x, y); rEmb(); });
  $('#emb-looks').onclick = () => { st.seed = null; rEmb(); };
  const L = $('#lisa-f');
  L.innerHTML = '<button data-f="" class="on">All</button>' + LISA.slice(1).map((c, k) => `<button data-f="${k + 1}"><i style="background:${c[0]}"></i>${c[1]}</button>`).join('');
  seg('lisa-f', 'lisaF', rLisa);
}
function onClick(i) {
  st.sel = i;
  if (mode === 'moran') return rMoran();
  if (mode === 'emb') { st.seed = i; return rEmb(); }
  outline([i]);
  const extra = { ols: `Regression error: <b>${f2(C.ols[i])}</b> (log points)`, sar: `Error, ordinary: <b>${f2(C.ols[i])}</b> · spatial lag: <b>${f2(C.lagr[i])}</b>`, lisa: `LISA class: <b>${LISA[C.lisa[i]][1]}</b>`, gi: `Gi*: <b>${GI[C.gi[i]][1]}</b>`,
    gwr: `Local effects · income <b>${f2(C.g_inc[i])}</b>, coast <b>${f2(C.g_dc[i])}</b>, Downtown <b>${f2(C.g_dd[i])}</b>, density <b>${f2(C.g_den[i])}</b> · local R² <b>${f2(C.g_r2[i])}</b>`,
    rf: `Predicted: <b>${money(C[st.rfS][i])}</b> (${pctErr(i, st.rfS)})`, km: `Cluster: <b>${st.km ? 'Cluster ' + (st.km.lab[i] + 1) : KM[C.km[i]][1]}</b>`, cls: `Prime: <b>${C.prime[i] ? 'yes' : 'no'}</b> · model says <b>${C[st.clsS][i] ? 'prime' : 'not prime'}</b>` }[mode] || '';
  const html = `<h3>Tract ${C.name[i]}</h3>Home value <b>${money(C.hv[i])}</b> · income <b>${money(C.inc[i])}</b><br>Density <b>${num(C.den[i])}</b> per km² · coast <b>${f2(C.dc[i])} km</b> · Downtown <b>${f2(C.dd[i])} km</b>${extra ? '<br>' + extra : ''}`;
  new maplibregl.Popup({ maxWidth: '340px' }).setLngLat(cent[i]).setHTML(html).addTo(map);
  if (mode === 'data') $('#data-out').innerHTML = html;
}

// ---------- 0 data ----------
const VARS = { hv: ['Median home value', money], inc: ['Median household income', money], den: ['People per km²', num], dc: ['Distance to coast (km)', v => v.toFixed(1)], dd: ['Distance to Downtown LA (km)', v => v.toFixed(1)] };
function rData() {
  const v = C[st.dataVar], br = quantiles(v, 6), [title, fm] = VARS[st.dataVar];
  const pal = (st.dataVar === 'dc' || st.dataVar === 'dd') ? [...SEQ].reverse() : SEQ;
  paint(i => pal[binOf(v[i], br)]);
  const labs = [`under ${fm(br[0])}`, ...br.slice(0, -1).map((b, k) => `${fm(b)} – ${fm(br[k + 1])}`), `${fm(br[4])} and above`];
  legend(`<b>${title} (six equal groups)</b>` + pal.map((c, k) => sw(c, labs[k])).join(''));
}

// ---------- 1 Moran ----------
function hvCol(i) { const br = [500e3, 700e3, 900e3, 1.2e6, 1.6e6]; return SEQ[binOf(C.hv[i], br)]; }
const hvLegend = () => '<b>Median home value</b>' + ['under $0.5m', '$0.5–0.7m', '$0.7–0.9m', '$0.9–1.2m', '$1.2–1.6m', '$1.6m and above'].map((l, k) => sw(SEQ[k], l)).join('');
let zs = null, lz = null;
function rMoran() {
  if (!zs) {
    const m = C.y.reduce((a, b) => a + b, 0) / N, sd = Math.sqrt(C.y.reduce((a, b) => a + (b - m) ** 2, 0) / N);
    zs = C.y.map(v => (v - m) / sd); lz = C.nb.map(nb => nb.reduce((a, j) => a + zs[j], 0) / nb.length);
  }
  paint(hvCol); legend(hvLegend());
  const i = st.sel;
  if (i != null) { outline(C.nb[i], '#c00000'); map.getSource('sel').setData({ type: 'FeatureCollection', features: [geo.features[i], ...C.nb[i].map(j => geo.features[j])] }); }
  const q = i == null ? '' : (zs[i] > 0 ? (lz[i] > 0 ? 'high value, high neighbours' : 'high value, low neighbours') : (lz[i] > 0 ? 'low value, high neighbours' : 'low value, low neighbours'));
  $('#moran-out').innerHTML = `<div class="ga-big">Moran's I = ${f2(R.moran_y.I)}</div><div class="ga-small">z = ${R.moran_y.z.toFixed(0)}, p &lt; 0.001 (999 permutations), 8 nearest neighbours</div>` +
    (i == null ? '<p class="ga-note">Click any tract on the map.</p>' : `<p><b>Tract ${C.name[i]}</b>: ${money(C.hv[i])}; average of its 8 neighbours ${money(Math.exp(C.nb[i].reduce((a, j) => a + C.y[j], 0) / 8))}. Quadrant: <b>${q}</b>.</p>`);
  drawScatter(i);
}
function drawScatter(sel) {
  const cv = $('#moran-sc'), g = cv.getContext('2d'), W = cv.width, H = cv.height, P = 70;
  g.clearRect(0, 0, W, H); const X = v => P + (v + 3.2) / 6.2 * (W - P - 20), Y = v => H - P + (-(v + 2.5) / 5) * (H - P - 20);
  g.strokeStyle = '#888'; g.lineWidth = 1; g.beginPath(); g.moveTo(X(0), Y(-2.5)); g.lineTo(X(0), Y(2.5)); g.moveTo(X(-3.2), Y(0)); g.lineTo(X(3), Y(0)); g.stroke();
  for (let i = 0; i < N; i++) { g.fillStyle = zs[i] > 0 && lz[i] > 0 ? 'rgba(192,0,0,.45)' : (zs[i] < 0 && lz[i] < 0 ? 'rgba(43,108,176,.45)' : 'rgba(150,150,150,.45)'); g.beginPath(); g.arc(X(zs[i]), Y(lz[i]), 3, 0, 7); g.fill(); }
  g.strokeStyle = '#1e3063'; g.lineWidth = 3; g.beginPath(); g.moveTo(X(-3), Y(-3 * R.moran_y.I)); g.lineTo(X(3), Y(3 * R.moran_y.I)); g.stroke();
  if (sel != null) { g.fillStyle = '#111'; g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.arc(X(zs[sel]), Y(lz[sel]), 10, 0, 7); g.fill(); g.stroke(); }
  g.fillStyle = '#14213d'; g.font = '22px Segoe UI, Arial'; g.textAlign = 'center';
  g.fillText('Home value of the tract (standardised)', W / 2 + 20, H - 18);
  g.save(); g.translate(22, H / 2 - 20); g.rotate(-Math.PI / 2); g.fillText("Neighbours' average (standardised)", 0, 0); g.restore();
  g.textAlign = 'left'; g.fillStyle = '#c00000'; g.font = 'bold 20px Segoe UI, Arial'; g.fillText('Rich next to rich', X(0.6), Y(2.25)); g.fillStyle = '#2b6cb0'; g.fillText('Cheap next to cheap', X(-3.1), Y(-2.25));
}

// ---------- 2 OLS ----------
const resLegend = t => `<b>${t}</b>` + sw(DIV[6], 'Priced above the model') + sw(DIV[3], 'About right') + sw(DIV[0], 'Priced below the model');
function rOls() {
  paint(i => divCol(C.ols[i], 0.6)); legend(resLegend('Regression error'));
  const b = R.ols.betas, nm = { l_inc: 'log income', d_coast: 'Distance to coast (km)', d_dtla: 'Distance to Downtown (km)', l_den: 'log density' };
  $('#ols-out').innerHTML = `<div class="ga-big">R² = ${f2(R.ols.r2)}</div><table><tr><th>Variable</th><th class="n">Coefficient</th></tr>` +
    Object.keys(nm).map(k => `<tr><td>${nm[k]}</td><td class="n">${b[k].toFixed(4)}</td></tr>`).join('') +
    `</table><p>Moran's I of the errors: <b>${f2(R.moran_res.I)}</b>. The errors cluster in space, so the model is missing something that neighbours share.</p>`;
}

// ---------- 3 lag & error ----------
function rSar() {
  const v = st.sarM === 'ols' ? C.ols : C.lagr; paint(i => divCol(v[i], 0.6));
  legend(resLegend(st.sarM === 'ols' ? 'Errors: ordinary regression' : 'Errors: spatial lag model'));
  $('#sar-out').innerHTML = `<table><tr><th>Model</th><th class="n">Spatial term</th><th class="n">AIC</th><th class="n">Moran's I of errors</th></tr>
  <tr><td>Ordinary regression</td><td class="n">–</td><td class="n">${R.ols.aic.toFixed(0)}</td><td class="n">${f2(R.moran_res.I)}</td></tr>
  <tr><td>Spatial lag</td><td class="n">ρ = ${f2(R.lag.rho)}</td><td class="n">${R.lag.aic.toFixed(0)}</td><td class="n">${f2(R.moran_lagres)}</td></tr>
  <tr><td>Spatial error</td><td class="n">λ = ${f2(R.err.lam)}</td><td class="n">${R.err.aic.toFixed(0)}</td><td class="n">${f2(R.moran_errres)}</td></tr></table>
  <p class="ga-small">Lagrange multiplier tests on the ordinary regression: robust LM lag ${R.ols.rlm_lag[0].toFixed(0)}, robust LM error ${R.ols.rlm_err[0].toFixed(0)}; both p &lt; 0.001. Lower AIC is better.</p>`;
}

// ---------- 4 LISA ----------
const LISA = [['#e6e6e6', 'Not significant'], ['#c00000', 'High-High'], ['#2166ac', 'Low-Low'], ['#f4a582', 'High-Low'], ['#92c5de', 'Low-High']];
function rLisa() {
  const f = st.lisaF ? +st.lisaF : null;
  paint(i => LISA[C.lisa[i]][0], i => (f == null || C.lisa[i] === f) ? 0.82 : 0.12);
  legend('<b>Local Moran (LISA) clusters</b>' + [1, 2, 3, 4, 0].map(k => sw(LISA[k][0], { 0: 'No significant cluster', 1: 'High value, high neighbours', 2: 'Low value, low neighbours', 3: 'High value, low neighbours', 4: 'Low value, high neighbours' }[k])).join(''));
  const n = [0, 0, 0, 0, 0]; C.lisa.forEach(k => n[k]++);
  $('#lisa-out').innerHTML = `<table>${[1, 2, 3, 4, 0].map(k => `<tr><td><i style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${LISA[k][0]}"></i> ${LISA[k][1]}</td><td class="n">${n[k]}</td></tr>`).join('')}</table>`;
}

// ---------- 5 Gi* ----------
const GI = [['#e6e6e6', 'Not significant'], ['#b2182b', 'Hot spot, 99%'], ['#ef8a62', 'Hot spot, 95%'], ['#67a9cf', 'Cold spot, 95%'], ['#2166ac', 'Cold spot, 99%']];
function rGi() {
  paint(i => GI[C.gi[i]][0]);
  legend('<b>Getis-Ord Gi* (3 km)</b>' + [1, 2, 0, 3, 4].map(k => sw(GI[k][0], GI[k][1])).join(''));
  const n = [0, 0, 0, 0, 0]; C.gi.forEach(k => n[k]++);
  $('#gi-out').innerHTML = `<table>${[1, 2, 0, 3, 4].map(k => `<tr><td>${GI[k][1]}</td><td class="n">${n[k]}</td></tr>`).join('')}</table><p class="ga-small">LISA asks whether a tract is like its neighbours; Gi* asks whether an area as a whole is unusually high or low.</p>`;
}

// ---------- 6 GWR ----------
const GWRN = { g_inc: 'Effect of income', g_dc: 'Effect of distance to coast', g_dd: 'Effect of distance to Downtown', g_den: 'Effect of density', g_r2: 'Local R²' };
function rGwr() {
  const v = C[st.gwrV];
  if (st.gwrV === 'g_r2') { paint(i => ramp(SEQ, v[i])); legend(`<b>Local R²</b><div class="ramp" style="background:linear-gradient(90deg,${SEQ.join(',')})"></div><div class="rl"><span>0</span><span>0.5</span><span>1</span></div>`); }
  else {
    const m = Math.max(...v.map(Math.abs)) * 0.8; paint(i => divCol(v[i], m, PUOR));
    legend(`<b>${GWRN[st.gwrV]} (standardised)</b><div class="ramp" style="background:linear-gradient(90deg,${PUOR.join(',')})"></div><div class="rl"><span>${f2(-m)} lowers price</span><span>0</span><span>raises ${f2(m)}</span></div>`);
  }
  const s = [...v].sort((a, b) => a - b);
  $('#gwr-out').innerHTML = `<div class="ga-big">R² = ${f2(R.gwr.r2)}</div><div class="ga-small">against ${f2(R.ols.r2)} for one global regression · Moran's I of GWR errors ${f2(R.gwr.moran_res)}</div>
  <p>${GWRN[st.gwrV]}: from <b>${f2(s[0])}</b> to <b>${f2(s[N - 1])}</b>, middle value <b>${f2(s[N >> 1])}</b>. Click a tract to read its local effects.</p>`;
}

// ---------- 7 random forest ----------
const pctErr = (i, k) => { const e = C[k][i] / C.hv[i] - 1; return (e >= 0 ? '+' : '') + Math.round(e * 100) + '% vs actual'; };
function rRf() {
  const k = st.rfS; paint(i => divCol(Math.log(C[k][i] / C.hv[i]), 0.5));
  legend('<b>Prediction error on unseen tracts</b>' + sw(DIV[6], 'Predicted too high') + sw(DIV[3], 'About right') + sw(DIV[0], 'Predicted too low'));
  const ml = R.ml, r2 = { p_base: ml.rf_base_random, p_sp: ml.rf_spatial_random, p_emb: ml.rf_emb_random }[k];
  const within = C[k].filter((p, i) => Math.abs(p / C.hv[i] - 1) <= 0.2).length / N;
  const imp = R.rf_imp, nm = { l_inc: 'Income', d_coast: 'To coast', d_dtla: 'To Downtown', l_den: 'Density' };
  $('#rf-out').innerHTML = `<div class="ga-big">R² = ${f2(r2)}</div><div class="ga-small">on held-out tracts · ${Math.round(within * 100)}% of tracts predicted within ±20% · linear regression scores ${f2(R.ols_cv)}</div>
  <table><tr><th>Inputs</th><th class="n">R² unseen</th></tr><tr><td>4 variables</td><td class="n">${f2(ml.rf_base_random)}</td></tr><tr><td>+ neighbours' averages</td><td class="n">${f2(ml.rf_spatial_random)}</td></tr><tr><td>+ satellite embeddings</td><td class="n">${f2(ml.rf_emb_random)}</td></tr><tr><td>Satellite embeddings alone</td><td class="n">${f2(ml.emb_only_random)}</td></tr></table>
  <h3 style="margin-top:10px">Importance, 4-variable forest</h3><div class="ga-bars">${Object.keys(nm).sort((a, b) => imp[b] - imp[a]).map(x => `<span>${nm[x]}</span><div class="ga-bar" style="width:${imp[x] * 160}%;background:#1e3063"></div><span>${Math.round(imp[x] * 100)}%</span>`).join('')}</div>`;
}

// ---------- 8 clustering ----------
const KM = { 3: ['#c00000', 'Coastal and Westside affluent'], 1: ['#6a3d9a', 'Low-density hillside affluent'], 0: ['#fdbf6f', 'Near-coast middle-income'], 2: ['#33a02c', 'Inland middle-income suburbs'], 4: ['#1f78b4', 'Dense lower-income neighbourhoods'] };
const KCOL = ['#c00000', '#1f78b4', '#33a02c', '#6a3d9a', '#ff7f00', '#e7298a', '#a6761d', '#17becf'];
function zcols() {
  const V = [C.inc.map(Math.log), C.y, C.den.map(v => Math.log(v)), C.dc];
  return V.map(v => { const m = v.reduce((a, b) => a + b, 0) / N, s = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / N); return v.map(x => (x - m) / s); });
}
function kmeans(k) {
  const Z = zcols(), D = Z.length; let r = 12345; const rnd = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296);
  let best = null;
  for (let run = 0; run < 8; run++) {
    // k-means++ seeding
    const c = [Math.floor(rnd() * N)].map(i => Z.map(z => z[i]));
    while (c.length < k) { const d = []; let S = 0; for (let i = 0; i < N; i++) { let m = 1e9; c.forEach(cc => { let e = 0; for (let a = 0; a < D; a++) e += (Z[a][i] - cc[a]) ** 2; m = Math.min(m, e); }); d.push(m); S += m; } let u = rnd() * S, i = 0; while ((u -= d[i]) > 0 && i < N - 1) i++; c.push(Z.map(z => z[i])); }
    let lab = new Array(N).fill(0), sse = 0;
    for (let it = 0; it < 60; it++) {
      sse = 0; for (let i = 0; i < N; i++) { let m = 1e9, b = 0; c.forEach((cc, j) => { let e = 0; for (let a = 0; a < D; a++) e += (Z[a][i] - cc[a]) ** 2; if (e < m) { m = e; b = j; } }); lab[i] = b; sse += m; }
      const s = c.map(() => new Array(D).fill(0)), n = new Array(k).fill(0);
      for (let i = 0; i < N; i++) { n[lab[i]]++; for (let a = 0; a < D; a++) s[lab[i]][a] += Z[a][i]; }
      c.forEach((cc, j) => { if (n[j]) for (let a = 0; a < D; a++) cc[a] = s[j][a] / n[j]; });
    }
    if (!best || sse < best.sse) best = { lab: [...lab], sse };
  }
  // order clusters by median home value, highest first
  const med = Array.from({ length: k }, (_, j) => { const v = C.hv.filter((_, i) => best.lab[i] === j).sort((a, b) => a - b); return v[v.length >> 1] || 0; });
  const ord = med.map((m, j) => [m, j]).sort((a, b) => b[0] - a[0]).map(x => x[1]), map2 = {}; ord.forEach((j, r) => map2[j] = r);
  best.lab = best.lab.map(j => map2[j]); best.k = k; return best;
}
function profile(labOf, keys) {
  return keys.map(j => { const ids = []; for (let i = 0; i < N; i++) if (labOf(i) === j) ids.push(i); const md = a => { const s = ids.map(i => a[i]).sort((x, y) => x - y); return s[s.length >> 1]; }; return { j, n: ids.length, hv: md(C.hv), inc: md(C.inc), den: md(C.den), dc: md(C.dc) }; });
}
function rKm() {
  let rows;
  if (!st.km) {
    paint(i => KM[C.km[i]][0]); legend('<b>Five neighbourhood types (k-means)</b>' + [3, 1, 0, 2, 4].map(k => sw(KM[k][0], KM[k][1])).join(''));
    rows = profile(i => C.km[i], [3, 1, 0, 2, 4]).map(p => ({ ...p, c: KM[p.j][0], name: KM[p.j][1] }));
  } else {
    paint(i => KCOL[st.km.lab[i]]); const ks = [...Array(st.km.k).keys()];
    legend(`<b>k-means, k = ${st.km.k} (ordered by home value)</b>` + ks.map(j => sw(KCOL[j], 'Cluster ' + (j + 1))).join(''));
    rows = profile(i => st.km.lab[i], ks).map(p => ({ ...p, c: KCOL[p.j], name: 'Cluster ' + (p.j + 1) }));
  }
  $('#km-out').innerHTML = `<table><tr><th>Type</th><th class="n">Tracts</th><th class="n">Home</th><th class="n">Income</th><th class="n">Coast km</th></tr>${rows.map(p => `<tr><td><i style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${p.c}"></i> ${p.name}</td><td class="n">${p.n}</td><td class="n">${money(p.hv)}</td><td class="n">${money(p.inc)}</td><td class="n">${p.dc.toFixed(0)}</td></tr>`).join('')}</table><p class="ga-small">Medians per cluster.</p>`;
}

// ---------- 9 classification ----------
function rCls() {
  const P = C[st.clsS], T = C.prime, col = i => T[i] && P[i] ? '#c00000' : T[i] ? '#f4a582' : P[i] ? '#6a3d9a' : '#eeeeee';
  paint(col); legend('<b>Is this tract prime?</b>' + sw('#c00000', 'Prime, found by the model') + sw('#f4a582', 'Prime, missed') + sw('#6a3d9a', 'Flagged prime, is not') + sw('#eeeeee', 'Not prime, correctly'));
  let tp = 0, fn = 0, fp = 0, tn = 0; for (let i = 0; i < N; i++) { if (T[i] && P[i]) tp++; else if (T[i]) fn++; else if (P[i]) fp++; else tn++; }
  const r = st.clsS === 'c_base' ? R.cls_base : R.cls_emb;
  $('#cls-out').innerHTML = `<div class="ga-big">${Math.round(r.acc * 100)}% correct</div><div class="ga-small">F1 score ${f2(r.f1)} on held-out tracts</div>
  <table><tr><th></th><th class="n">Model: prime</th><th class="n">Model: not prime</th></tr><tr><td>Actually prime</td><td class="n">${tp}</td><td class="n">${fn}</td></tr><tr><td>Actually not prime</td><td class="n">${fp}</td><td class="n">${tn}</td></tr></table>`;
}

// ---------- 10 embeddings ----------
const LOOK = ['#c00000', '#e7298a', '#6a3d9a', '#1f78b4', '#33a02c', '#ff7f00'];
function rEmb() {
  if (st.seed == null) {
    paint(i => LOOK[C.look[i]]); outline([]);
    const rows = profile(i => C.look[i], [0, 1, 2, 3, 4, 5]);
    legend('<b>Six looks from satellite embeddings</b>' + rows.map(p => sw(LOOK[p.j], `Look ${p.j + 1}: median home ${money(p.hv)}`)).join(''));
    $('#emb-out').innerHTML = `<table><tr><th>Look</th><th class="n">Tracts</th><th class="n">Home</th><th class="n">People/km²</th><th class="n">Coast km</th></tr>${rows.map(p => `<tr><td><i style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${LOOK[p.j]}"></i> Look ${p.j + 1}</td><td class="n">${p.n}</td><td class="n">${money(p.hv)}</td><td class="n">${num(p.den)}</td><td class="n">${p.dc.toFixed(0)}</td></tr>`).join('')}</table><p class="ga-small">k-means (k = 6) on 64 embedding values per tract. No price, income or census data went in.</p>`;
    return;
  }
  const s0 = st.seed, D = 64, sim = new Float32Array(N);
  for (let i = 0; i < N; i++) { let s = 0; for (let k = 0; k < D; k++) s += E[i * D + k] * E[s0 * D + k]; sim[i] = s; }
  const sorted = [...sim].sort((a, b) => a - b), lo = sorted[Math.floor(N * 0.05)], hi = sorted[N - 2];
  const PAL = ['#f7fbff', '#c6dbef', '#6baed6', '#2171b5', '#08306b'];
  paint(i => ramp(PAL, (sim[i] - lo) / (hi - lo)));
  const top = [...sim.keys()].filter(i => i !== s0).sort((a, b) => sim[b] - sim[a]).slice(0, 25);
  map.getSource('sel').setData({ type: 'FeatureCollection', features: [geo.features[s0], ...top.map(j => geo.features[j])] }); map.setPaintProperty('sel', 'line-color', '#c00000');
  legend(`<b>Similarity to tract ${C.name[s0]}</b><div class="ramp" style="background:linear-gradient(90deg,${PAL.join(',')})"></div><div class="rl"><span>least alike</span><span>most alike</span></div><div class="sw"><i style="background:#fff;border:2px solid #c00000"></i>25 most alike, outlined</div>`);
  const md = a => { const s = top.map(i => a[i]).sort((x, y) => x - y); return s[s.length >> 1]; };
  $('#emb-out').innerHTML = `<h3>Tract ${C.name[s0]} · ${money(C.hv[s0])}</h3>The 25 tracts that look most like it from orbit have a median home value of <b>${money(md(C.hv))}</b> and median income <b>${money(md(C.inc))}</b>, against ${money(C.hv[s0])} and ${money(C.inc[s0])} here.<p class="ga-small">Similarity: cosine of the 64-number embeddings. Price was never used.</p>`;
}

// ---------- → GeoAI ----------
const CATS = [
  ['Spatially explicit machine learning', 'Models that use neighbours, distance and local variation.', 'Steps 3, 6 and 7: spatial lag, GWR, neighbours’ averages in the forest.'],
  ['Geospatial computer vision', 'Find and label things in satellite, aerial and street images.', 'Step 9: classify every pixel or object, not just every tract.'],
  ['Spatial representation learning', 'Places, coordinates and trips become vectors (embeddings).', 'Steps 8 and 10: clusters and look-alike tracts from embeddings.'],
  ['Geospatial foundation models', 'Pre-train once on vast Earth data, adapt to many tasks.', 'Step 10: AlphaEarth gave features for price, prime and clusters at once.'],
  ['Spatio-temporal and network AI', 'Graph neural networks on roads, flows and trajectories, through time.', 'Step 1: the neighbour list W is the graph.'],
  ['Geo-language AI', 'Read and answer about places in words; knowledge graphs.', 'Asks the questions of steps 0–10 in plain language.'],
  ['Generative GeoAI', 'Create geospatial data: sharper images, missing values, synthetic scenes.', 'Fills tracts with missing data; super-resolves imagery.'],
  ['Earth-system AI', 'Learned models of weather, climate and oceans.', 'Adds heat, flood and fire exposure as inputs to the price model.'],
];
function rGeoai() {
  paint(i => LOOK[C.look[i]]); legend(null);
  $('#geoai-out').innerHTML = CATS.map((c, k) => `<div class="gm-cat"><span class="no">${k + 1}</span><b>${c[0]}</b><div>${c[1]}</div><div class="from">${c[2]}</div></div>`).join('');
}
init();
