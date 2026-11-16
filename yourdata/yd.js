// Location Lab · Your data — GeoML and GeoAI on the user's own file, entirely in the browser.
// Reuses the workbench engines: js/io.js (file readers) and js/stats.js (weights, Moran, LISA, Gi*, OLS, ML lag/error, GWR).
import { readAny } from '../js/io.js';
import { projector, weightsKNN, lag, mean, sd, quantile, moran, lisa, giStar, ols, spatialLagML, spatialErrorML, gwr, rng } from '../js/stats.js';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
let map, FC = null, N = 0, cent = [], gtype = 'poly', COLS = { num: [], txt: [], emb: [] }, A = null, mode = 'load';
const RES = {};               // result columns for export: name -> array (length N)
const st = { sarM: 'ols', rfS: 'base', g4c: 0, g4lab: new Map(), seed: null, g5k: 2, wx: null, wxPt: null };
const tick = () => new Promise(r => setTimeout(r, 0));
const busy = (on, msg) => { const b = $('#busy'); b.hidden = !on; if (msg) b.textContent = msg; };
const FCx = f => ({ type: 'FeatureCollection', features: f });
const fmt = v => v == null || !isFinite(v) ? '–' : Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2) + 'm' : Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(3);
const f2 = v => isFinite(v) ? v.toFixed(2) : '–';
const sw = (c, l) => `<div class="sw"><i style="background:${c}"></i>${l}</div>`;
function legend(html) { const L = $('#legend'); if (!html) { L.hidden = true; return; } L.innerHTML = html; L.hidden = false; }
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function lerp(a, b, t) { const x = hexToRgb(a), y = hexToRgb(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); }
function ramp(stops, t) { t = Math.max(0, Math.min(1, isFinite(t) ? t : 0.5)); const k = (stops.length - 1) * t, i = Math.min(stops.length - 2, Math.floor(k)); return lerp(stops[i], stops[i + 1], k - i); }
const DIV = ['#2166ac', '#67a9cf', '#d1e5f0', '#f7f7f7', '#fddbc7', '#ef8a62', '#b2182b'], PUOR = ['#542788', '#998ec3', '#d8daeb', '#f7f7f7', '#fee0b6', '#f1a340', '#b35806'];
const SEQ = ['#f1eef6', '#d0d1e6', '#a6bddb', '#74a9cf', '#2b8cbe', '#045a8d'], PUR = ['#f7f4f9', '#d4b9da', '#c994c7', '#df65b0', '#980043'];
const KCOL = ['#c00000', '#1f78b4', '#33a02c', '#6a3d9a', '#ff7f00', '#e7298a', '#a6761d', '#17becf', '#666666'];
const GREY = '#d0d4dc';
function setRes(name, arrA) { const out = new Array(N).fill(null); A.ix.forEach((i, k) => out[i] = arrA[k]); RES[name] = out; }
const nameOf = i => { const c = COLS.txt[0] || null; const v = c ? FC.features[i].properties[c] : null; return v ? String(v) : 'Place ' + (i + 1); };

// ---------------- map ----------------
function initMap() {
  map = new maplibregl.Map({ container: 'map', style: 'https://tiles.openfreemap.org/styles/positron', center: [77.05, 28.45], zoom: 9, attributionControl: { compact: false } });
  window.__map = map;
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.on('load', () => {
    for (const y of [2018, 2020, 2022, 2024]) { map.addSource('s2_' + y, { type: 'raster', tiles: [`https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-${y}_3857/default/g/{z}/{y}/{x}.jpg`], tileSize: 256, maxzoom: 15, attribution: `Sentinel-2 cloudless ${y} by EOX IT Services GmbH (contains modified Copernicus Sentinel data)` }); map.addLayer({ id: 's2_' + y, type: 'raster', source: 's2_' + y, layout: { visibility: 'none' } }); }
    map.addSource('hr', { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19, attribution: 'Esri World Imagery: Esri, Maxar, Earthstar Geographics' });
    map.addLayer({ id: 'hr', type: 'raster', source: 'hr', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0 } });
    map.addSource('d', { type: 'geojson', data: FCx([]) });
    map.addLayer({ id: 'd-fill', type: 'fill', source: 'd', filter: ['!=', ['geometry-type'], 'Point'], paint: { 'fill-color': ['get', 'col'], 'fill-opacity': ['get', 'op'], 'fill-outline-color': 'rgba(255,255,255,0.4)' } });
    map.addLayer({ id: 'd-line', type: 'line', source: 'd', filter: ['!=', ['geometry-type'], 'Point'], paint: { 'line-color': '#1e3063', 'line-width': 0.4, 'line-opacity': 0.35 } });
    map.addSource('edges', { type: 'geojson', data: FCx([]) });
    map.addLayer({ id: 'edges', type: 'line', source: 'edges', layout: { visibility: 'none' }, paint: { 'line-color': '#1e3063', 'line-opacity': 0.3, 'line-width': 0.8 } });
    map.addLayer({ id: 'd-pt', type: 'circle', source: 'd', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 6, 'circle-color': ['get', 'col'], 'circle-opacity': ['get', 'op'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.2 } });
    map.addSource('sel', { type: 'geojson', data: FCx([]) });
    map.addLayer({ id: 'sel', type: 'line', source: 'sel', paint: { 'line-color': '#111', 'line-width': 2.6 } });
    map.addLayer({ id: 'sel-pt', type: 'circle', source: 'sel', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 10, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#111', 'circle-stroke-width': 2.5 } });
    map.addSource('pins', { type: 'geojson', data: FCx([]) });
    map.addLayer({ id: 'pins', type: 'circle', source: 'pins', paint: { 'circle-radius': 8, 'circle-color': '#c00000', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
    map.addLayer({ id: 'pins-lab', type: 'symbol', source: 'pins', layout: { 'text-field': ['get', 'n'], 'text-font': ['Noto Sans Bold'], 'text-size': 13, 'text-offset': [0.8, 0], 'text-anchor': 'left' }, paint: { 'text-color': '#14213d', 'text-halo-color': '#fff', 'text-halo-width': 2 } });
    for (const l of ['d-fill', 'd-pt']) { map.on('click', l, e => onClick(e.features[0].properties.i)); map.on('mouseenter', l, () => map.getCanvas().style.cursor = 'pointer'); map.on('mouseleave', l, () => map.getCanvas().style.cursor = ''); }
    map.on('click', e => { if (mode === 'g8' && !map.queryRenderedFeatures(e.point, { layers: ['d-fill', 'd-pt'] }).length) { st.wxPt = [e.lngLat.lng, e.lngLat.lat]; loadWx3(); } });
    window.__ready = true;
  });
}
function paint(colOf, opOf) {
  if (!FC) return;
  const inA = A ? new Set(A.ix) : null;
  FC.features.forEach((f, i) => { const c = colOf ? colOf(i) : null; f.properties.col = c || GREY; f.properties.op = opOf ? opOf(i) : (c ? 0.8 : (inA && !inA.has(i) ? 0.25 : 0.55)); f.properties.i = i; });
  map.getSource('d').setData(FC);
}
function outline(ids) { map.getSource('sel').setData(FCx(ids.map(i => FC.features[i]))); }
function fitData(ids = null) { const b = new maplibregl.LngLatBounds(); (ids || cent.map((_, i) => i)).forEach(i => b.extend(cent[i])); if (!b.isEmpty()) map.fitBounds(b, { padding: 60, maxZoom: 15, duration: 0 }); }
function zoomTo(i) {
  const g = FC.features[i].geometry, b = new maplibregl.LngLatBounds();
  const walk = c => typeof c[0] === 'number' ? b.extend(c) : c.forEach(walk); walk(g.coordinates);
  map.fitBounds(b, { padding: 120, maxZoom: g.type === 'Point' ? 16 : 15.5, duration: 600 });
}
function layersFor(t) {
  const imag = t === 'g2' || t === 'g7';
  for (const y of [2018, 2020, 2022, 2024]) map.setLayoutProperty('s2_' + y, 'visibility', t === 'g2' && y === +($('#g2-y .on')?.dataset.y || 2024) || (t === 'g7' && y === 2024) ? 'visible' : 'none');
  map.setLayoutProperty('hr', 'visibility', t === 'g7' ? 'visible' : 'none');
  map.setLayoutProperty('edges', 'visibility', t === 'g5' ? 'visible' : 'none');
  map.setPaintProperty('d-line', 'line-opacity', imag ? 0.9 : 0.35); map.setPaintProperty('d-line', 'line-color', imag ? '#ffd400' : '#1e3063'); map.setPaintProperty('d-line', 'line-width', imag ? 1.6 : 0.4);
}

// ---------------- loading ----------------
async function loadBuf(buf, name) {
  busy(true, 'Reading ' + name + '…');
  try {
    let fc = await readAny(buf, name);
    if (fc.raster) throw new Error('This tab needs places (points, polygons or hexagons), not an image. Use the workbench for rasters.');
    if (!fc.features) throw new Error('No features found.');
    const hk = Object.keys(fc.features[0]?.properties || {}).find(k => /^(h3|h3_index|h3_cell|hex|hex_id)$/i.test(k));
    fc.features = fc.features.filter(f => f && (f.geometry || (hk && f.properties[hk])));
    if (hk) fc.features.forEach(f => { const c = String(f.properties[hk]); if ((!f.geometry || f.geometry.type === 'Point') && h3.isValidCell(c)) { const r = h3.cellToBoundary(c, true); r.push(r[0]); f.geometry = { type: 'Polygon', coordinates: [r] }; } });
    fc.features.forEach(f => { for (const k in f.properties) { const v = f.properties[k]; if (typeof v === 'string' && v.trim() !== '' && !isNaN(+v)) f.properties[k] = +v; } });
    if (fc.features.length < 3) throw new Error('The file has fewer than 3 places.');
    if (fc.features.length > 20000) throw new Error(`The file has ${fc.features.length.toLocaleString()} places. Keep it under 20,000 (aggregate to hexagons or districts first).`);
    FC = fc; N = fc.features.length; A = null; for (const k in RES) delete RES[k]; st.g4lab.clear(); st.seed = null; st.wx = null;
    cent = fc.features.map(f => centroidOf(f.geometry));
    gtype = fc.features[0].geometry.type.includes('Point') ? 'point' : 'poly';
    detectCols(); setupForm();
    paint(); fitData(); outline([]); map.getSource('pins').setData(FCx([])); map.getSource('edges').setData(FCx([]));
    $$('#nav button').forEach(b => { if (/^(g2|g5|g6|g7|g8|exp)$/.test(b.dataset.t) || (/^(g3|g4)$/.test(b.dataset.t) && COLS.emb.length)) b.disabled = false; else if (b.dataset.t !== 'load') b.disabled = true; });
    $('#load-info').innerHTML = `<div class="ga-card"><h3>${name}</h3><b>${N.toLocaleString()}</b> ${gtype === 'point' ? 'points' : 'polygons'} · <b>${COLS.num.length}</b> number columns · <b>${COLS.txt.length}</b> text columns${COLS.emb.length ? ` · <b>${COLS.emb.length}</b> embedding columns (look-alikes and teach-the-map are on)` : ''}</div>`;
  } catch (e) { $('#load-info').innerHTML = `<div class="ga-card" style="border-color:#c00000"><b>Could not load ${name}.</b><br>${e.message}</div>`; }
  busy(false);
}
function centroidOf(g) {
  if (!g) return [0, 0];
  if (g.type === 'Point') return g.coordinates;
  if (g.type === 'MultiPoint' || g.type === 'LineString') { const c = g.coordinates; return [mean(c.map(p => p[0])), mean(c.map(p => p[1]))]; }
  let ring = g.type === 'Polygon' ? g.coordinates[0] : g.type === 'MultiPolygon' ? g.coordinates.reduce((a, p) => p[0].length > a.length ? p[0] : a, []) : g.coordinates[0][0] ? g.coordinates[0] : [g.coordinates];
  let x = 0, y = 0; const n = Math.max(1, ring.length - 1); for (let i = 0; i < n; i++) { x += ring[i][0]; y += ring[i][1]; } return [x / n, y / n];
}
function detectCols() {
  const keys = [...new Set(FC.features.slice(0, 300).flatMap(f => Object.keys(f.properties)))].filter(k => !['col', 'op', 'i'].includes(k));
  const isEmb = k => /^A\d{2}$/.test(k) || /^(emb|embedding|e)_?\d{1,3}$/i.test(k);
  COLS = { num: [], txt: [], emb: [] };
  for (const k of keys) {
    let nNum = 0, nTxt = 0; for (const f of FC.features.slice(0, 500)) { const v = f.properties[k]; if (typeof v === 'number' && isFinite(v)) nNum++; else if (v != null && v !== '') nTxt++; }
    if (isEmb(k) && nNum) COLS.emb.push(k); else if (nNum >= 0.8 * (nNum + nTxt) && nNum) COLS.num.push(k); else if (nTxt) COLS.txt.push(k);
  }
  COLS.txt.sort((a, b) => (/name|title|place|site|store|branch|tract|ward|district|city/i.test(b) ? 1 : 0) - (/name|title|place|site|store|branch|tract|ward|district|city/i.test(a) ? 1 : 0));
}
function setupForm() {
  const skip = k => /^(lat|latitude|lon|lng|long|longitude|x|y_?coord|id|fid|objectid|geoid)$/i.test(k);
  const cand = COLS.num.filter(k => !skip(k));
  $('#g6-col').innerHTML = COLS.txt.map(k => `<option>${k}</option>`).join('') || '<option value="">(no text column)</option>';
  $('#g4-ref').innerHTML = '<option value="">(no column)</option>' + COLS.txt.map(k => `<option>${k}</option>`).join('');
  $('#g6-txt').value = '';
  $('#setup').hidden = cand.length < 2;
  if (cand.length < 2) { $('#apply-out').textContent = ''; $('#load-info').insertAdjacentHTML('beforeend', '<p class="ga-small">This file has fewer than two number columns, so the GeoML statistics are off. The GeoAI tabs that need only places still work.</p>'); return; }
  const guess = cand.find(k => /price|value|sales|revenue|footfall|target|share|rate|y$/i.test(k)) || cand[0];
  $('#ysel').innerHTML = cand.map(k => `<option ${k === guess ? 'selected' : ''}>${k}</option>`).join('');
  const drawX = () => { const y = $('#ysel').value; const xs = cand.filter(k => k !== y); $('#xsel').innerHTML = xs.map((k, i) => `<label><input type="checkbox" value="${k}" ${i < 4 ? 'checked' : ''}> ${k}</label>`).join(''); const vals = FC.features.map(f => f.properties[y]).filter(v => typeof v === 'number'); $('#ylog').checked = vals.length && Math.min(...vals) > 0 && quantile(vals, 0.95) / Math.max(1e-9, quantile(vals, 0.5)) > 3; };
  $('#ysel').onchange = drawX; drawX();
}
function applySetup() {
  const yname = $('#ysel').value, xn = $$('#xsel input:checked').map(c => c.value), logy = $('#ylog').checked, k = Math.max(3, Math.min(30, +$('#kk').value || 8));
  if (!xn.length) { $('#apply-out').textContent = 'Tick at least one explanatory variable.'; return; }
  const ix = [];
  FC.features.forEach((f, i) => { const p = f.properties, y = p[yname]; if (typeof y !== 'number' || !isFinite(y) || (logy && y <= 0)) return; if (xn.every(x => typeof p[x] === 'number' && isFinite(p[x]))) ix.push(i); });
  if (ix.length < 30) { $('#apply-out').textContent = `Only ${ix.length} places have all these values. Need at least 30.`; return; }
  const y = ix.map(i => logy ? Math.log(FC.features[i].properties[yname]) : FC.features[i].properties[yname]);
  const X = ix.map(i => xn.map(x => FC.features[i].properties[x]));
  const P = projector(ix.map(i => cent[i])), xy = ix.map(i => P.f(cent[i][0], cent[i][1]));
  const W = weightsKNN(xy, Math.min(k, ix.length - 1));
  A = { ix, y, X, names: xn, yname, ylab: (logy ? 'log ' : '') + yname, logy, W, xy, k, cache: {} };
  for (const r in RES) delete RES[r];
  $$('#nav button').forEach(b => { if (b.dataset.t !== 'load') b.disabled = false; });
  $('#apply-out').innerHTML = `<b>${ix.length.toLocaleString()}</b> places ready (${N - ix.length} skipped for missing values). y = ${A.ylab}; X = ${xn.join(', ')}; ${A.k} nearest neighbours. Now open tab 1.`;
  show('moran');
}

// ---------------- tabs ----------------
function show(t) {
  mode = t; $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.t === t)); $$('.ga-pane').forEach(p => p.hidden = p.id !== 'p-' + t);
  if (!map.loaded() && !window.__ready) return;
  outline([]); map.getSource('pins').setData(FCx([])); layersFor(t); legend(null);
  const fn = { load: () => paint(), moran: rMoran, ols: rOls, sar: rSar, lisa: rLisa, gi: rGi, gwr: rGwr, rf: rRf, km: rKm, cls: rCls, g1: () => paint(), g2: rG2, g3: rG3, g4: rG4, g5: rG5, g6: rG6, g7: rG7, g8: rG8, exp: rExp }[t];
  fn && fn();
}
function onClick(i) {
  if (mode === 'moran') { st.seed = i; return rMoran(); }
  if (mode === 'g2' || mode === 'g7') { zoomTo(i); outline([i]); $('#' + mode + '-out').innerHTML = `<h3>${nameOf(i)}</h3>${mode === 'g2' ? 'Switch the years to compare.' : 'Drag Blend to the right.'}`; return; }
  if (mode === 'g3') { st.seed = i; return rG3(); }
  if (mode === 'g4') { if (st.g4lab.get(i) === st.g4c) st.g4lab.delete(i); else st.g4lab.set(i, st.g4c); return rG4(false); }
  if (mode === 'g5') { st.seed = i; return rG5(); }
  if (mode === 'g8') { st.wxPt = cent[i]; return loadWx3(nameOf(i)); }
  outline([i]);
  const p = FC.features[i].properties, keys = Object.keys(p).filter(k => !['col', 'op', 'i'].includes(k) && !COLS.emb.includes(k)).slice(0, 10);
  const extra = Object.entries(RES).filter(([, a]) => a[i] != null).slice(0, 8).map(([k, a]) => `<tr><td><b>${k}</b></td><td>${typeof a[i] === 'number' ? fmt(a[i]) : a[i]}</td></tr>`).join('');
  new maplibregl.Popup({ maxWidth: '320px' }).setLngLat(cent[i]).setHTML(`<h3 style="margin:0 0 4px">${nameOf(i)}</h3><table>${keys.map(k => `<tr><td>${k}</td><td>${typeof p[k] === 'number' ? fmt(p[k]) : p[k]}</td></tr>`).join('')}${extra}</table>`).addTo(map);
}
const needA = id => { if (A) return false; $(id).innerHTML = 'Choose y and X in tab 0 first.'; return true; };
const aCol = arrA => { const m = new Map(A.ix.map((i, k) => [i, k])); return f => i => m.has(i) ? f(arrA[m.get(i)], m.get(i)) : null; };
function quantCol(arr, pal = SEQ) { const br = [1, 2, 3, 4, 5].map(q => quantile(arr, q / 6)); return v => pal[br.filter(b => v >= b).length]; }

// 1 Moran
function rMoran() {
  if (!A) return;
  const C = A.cache; if (!C.mor) { C.mor = moran(A.W, A.y, 499); }
  const M = C.mor, qc = quantCol(A.y); paint(aCol(A.y)(v => qc(v)));
  const br = [1, 2, 3, 4, 5].map(q => quantile(A.y, q / 6));
  legend(`<b>${A.ylab} (six equal groups)</b>` + SEQ.map((c, k) => sw(c, k === 0 ? `under ${fmt(br[0])}` : k === 5 ? `${fmt(br[4])} and above` : `${fmt(br[k - 1])} – ${fmt(br[k])}`)).join(''));
  let sel = null; const pos = new Map(A.ix.map((i, k) => [i, k]));
  if (st.seed != null && pos.has(st.seed)) { sel = pos.get(st.seed); outline([st.seed, ...A.W.nb[sel].map(j => A.ix[j])]); }
  $('#moran-out').innerHTML = `<div class="ga-big">Moran's I = ${f2(M.I)}</div><div class="ga-small">p = ${M.pSim.toFixed(3)} from 499 permutations · ${A.k} nearest neighbours · ${A.ix.length} places</div><p>${M.I > 0.3 && M.pSim < 0.05 ? 'Strong clustering: nearby places have similar values.' : M.I > 0.1 && M.pSim < 0.05 ? 'Some clustering: nearby places tend to be alike.' : M.pSim < 0.05 && M.I < 0 ? 'Neighbours tend to differ (a checkerboard pattern).' : 'No clear spatial pattern.'}</p>` + (sel != null ? `<p><b>${nameOf(st.seed)}</b>: ${fmt(A.y[sel])}; neighbours' average ${fmt(mean(A.W.nb[sel].map(j => A.y[j])))}.</p>` : '<p class="ga-small">Click a place on the map.</p>');
  const cv = $('#moran-sc'), g = cv.getContext('2d'), W = cv.width, H = cv.height, P = 70, z = M.z, lz = M.lagz;
  const lim = Math.max(2.5, quantile(Array.from(z, Math.abs), 0.99)), X = v => P + (v + lim) / (2 * lim) * (W - P - 20), Y = v => H - P - (v + lim) / (2 * lim) * (H - P - 20);
  g.clearRect(0, 0, W, H); g.strokeStyle = '#888'; g.beginPath(); g.moveTo(X(0), Y(-lim)); g.lineTo(X(0), Y(lim)); g.moveTo(X(-lim), Y(0)); g.lineTo(X(lim), Y(0)); g.stroke();
  for (let i = 0; i < z.length; i++) { g.fillStyle = z[i] > 0 && lz[i] > 0 ? 'rgba(192,0,0,.45)' : z[i] < 0 && lz[i] < 0 ? 'rgba(43,108,176,.45)' : 'rgba(150,150,150,.45)'; g.beginPath(); g.arc(X(z[i]), Y(lz[i]), 3, 0, 7); g.fill(); }
  g.strokeStyle = '#1e3063'; g.lineWidth = 3; g.beginPath(); g.moveTo(X(-lim), Y(-lim * M.I)); g.lineTo(X(lim), Y(lim * M.I)); g.stroke(); g.lineWidth = 1;
  if (sel != null) { g.fillStyle = '#111'; g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.arc(X(z[sel]), Y(lz[sel]), 10, 0, 7); g.fill(); g.stroke(); g.lineWidth = 1; }
  g.fillStyle = '#14213d'; g.font = '22px Segoe UI, Arial'; g.textAlign = 'center'; g.fillText('Value of the place (standardised)', W / 2 + 20, H - 18);
  g.save(); g.translate(22, H / 2 - 20); g.rotate(-Math.PI / 2); g.fillText("Neighbours' average (standardised)", 0, 0); g.restore();
}
// 2 OLS
function getOls() { const C = A.cache; if (!C.ols) { C.ols = ols(A.y, A.X, A.names); C.olsI = moran(A.W, C.ols.res, 199).I; setRes('ols_mistake', C.ols.res); } return C.ols; }
function resPaint(res, title) { const m = 2.5 * sd(res) || 1; paint(aCol(res)(v => ramp(DIV, (v / m + 1) / 2))); legend(`<b>${title}</b>` + sw(DIV[6], 'Above the model') + sw(DIV[3], 'About right') + sw(DIV[0], 'Below the model')); }
function rOls() {
  if (needA('#ols-out')) return; let O; try { O = getOls(); } catch (e) { $('#ols-out').textContent = e.message; return; }
  resPaint(O.res, 'Regression mistakes');
  $('#ols-out').innerHTML = `<div class="ga-big">R² = ${f2(O.r2)}</div><table><tr><th>Variable</th><th class="n">Coefficient</th><th class="n">p</th></tr>${O.names.map((n, i) => `<tr><td>${n}</td><td class="n">${fmt(O.b[i])}</td><td class="n">${O.p[i] < 0.001 ? '<0.001' : O.p[i].toFixed(3)}</td></tr>`).join('')}</table><p>Moran's I of the mistakes: <b>${f2(A.cache.olsI)}</b> (0 would mean random). ${A.cache.olsI > 0.1 ? 'The mistakes cluster: the model is missing something neighbours share. Try tab 3.' : 'The mistakes look scattered: little spatial pattern is left.'}</p>`;
}
// 3 lag & error
async function rSar() {
  if (needA('#sar-out')) return; const C = A.cache;
  if (!C.lag) { busy(true, 'Fitting spatial lag and error models…'); await tick(); try { getOls(); C.lag = spatialLagML(A.y, A.X, A.names, A.W); C.err = spatialErrorML(A.y, A.X, A.names, A.W); const We = lag(A.W, C.err.res); C.errF = C.err.res.map((v, i) => v - C.err.lambda * We[i]); C.lagI = moran(A.W, C.lag.res, 199).I; C.errI = moran(A.W, C.errF, 199).I; setRes('lag_mistake', C.lag.res); setRes('error_mistake', C.errF); } catch (e) { busy(false); $('#sar-out').textContent = e.message; return; } busy(false); }
  const r = { ols: C.ols.res, lag: C.lag.res, err: C.errF }[st.sarM]; resPaint(r, { ols: 'Mistakes: ordinary regression', lag: 'Mistakes: spatial lag model', err: 'Mistakes: spatial error model' }[st.sarM]);
  $('#sar-out').innerHTML = `<table><tr><th>Model</th><th class="n">Spatial term</th><th class="n">AIC</th><th class="n">Moran's I of mistakes</th></tr><tr><td>Ordinary</td><td class="n">–</td><td class="n">${C.ols.aic.toFixed(0)}</td><td class="n">${f2(C.olsI)}</td></tr><tr><td>Spatial lag</td><td class="n">ρ = ${f2(C.lag.rho)}</td><td class="n">${C.lag.aic.toFixed(0)}</td><td class="n">${f2(C.lagI)}</td></tr><tr><td>Spatial error</td><td class="n">λ = ${f2(C.err.lambda)}</td><td class="n">${C.err.aic.toFixed(0)}</td><td class="n">${f2(C.errI)}</td></tr></table><p class="ga-small">Lower AIC = better fit. Moran's I of the mistakes near 0 = no pattern left.</p>`;
}
// 4 LISA
const LC = { 'High-High': '#c00000', 'Low-Low': '#2166ac', 'High-Low': '#f4a582', 'Low-High': '#92c5de', 'Not significant': '#e6e6e6' };
function rLisa() {
  if (needA('#lisa-out')) return; const C = A.cache; if (!C.lisa) { C.lisa = lisa(A.W, A.y, 499); setRes('lisa_class', C.lisa.cls); }
  paint(aCol(C.lisa.cls)(v => LC[v])); legend('<b>Local Moran (LISA)</b>' + Object.entries(LC).map(([k, c]) => sw(c, k)).join(''));
  const n = {}; C.lisa.cls.forEach(c => n[c] = (n[c] || 0) + 1);
  $('#lisa-out').innerHTML = `<table>${Object.keys(LC).map(k => `<tr><td>${k}</td><td class="n">${n[k] || 0}</td></tr>`).join('')}</table>`;
}
// 5 Gi*
const GC = { 'Hot spot 99%': '#b2182b', 'Hot spot 95%': '#ef8a62', 'Hot spot 90%': '#fddbc7', 'Not significant': '#e6e6e6', 'Cold spot 90%': '#d1e5f0', 'Cold spot 95%': '#67a9cf', 'Cold spot 99%': '#2166ac' };
function rGi() {
  if (needA('#gi-out')) return; const C = A.cache; if (!C.gi) { C.gi = giStar(A.W, A.y); setRes('gi_class', C.gi.cls); }
  paint(aCol(C.gi.cls)(v => GC[v])); legend('<b>Getis-Ord Gi*</b>' + Object.entries(GC).map(([k, c]) => sw(c, k)).join(''));
  const n = {}; C.gi.cls.forEach(c => n[c] = (n[c] || 0) + 1);
  $('#gi-out').innerHTML = `<table>${Object.keys(GC).map(k => `<tr><td>${k}</td><td class="n">${n[k] || 0}</td></tr>`).join('')}</table>`;
}
// 6 GWR
function rGwr() {
  if (needA('#gwr-out')) return; const G = A.cache.gwr;
  if (!G) { paint(); $('#gwr-out').innerHTML = `Press Fit GWR. ${A.ix.length > 3000 ? `With ${A.ix.length.toLocaleString()} places this can take a few minutes.` : 'Usually a few seconds.'}`; $('#gwr-v').innerHTML = ''; return; }
  if (!$('#gwr-v').options.length) $('#gwr-v').innerHTML = A.names.map((n, j) => `<option value="${j + 1}">Effect of ${n}</option>`).join('') + '<option value="0">Intercept</option>';
  const j = +$('#gwr-v').value || 1, v = G.B.map(b => b[j]), m = Math.max(1e-9, quantile(v.map(Math.abs), 0.95));
  paint(aCol(v)(x => ramp(PUOR, (x / m + 1) / 2)));
  legend(`<b>${j ? 'Effect of ' + A.names[j - 1] : 'Intercept'} (standardised)</b><div class="ramp" style="background:linear-gradient(90deg,${PUOR.join(',')})"></div><div class="rl"><span>${f2(-m)} lowers</span><span>0</span><span>raises ${f2(m)}</span></div>`);
  const s = [...v].sort((a, b) => a - b);
  $('#gwr-out').innerHTML = `<div class="ga-big">R² = ${f2(G.r2)}</div><div class="ga-small">bandwidth ${G.bw} nearest places (chosen by AICc) · one global regression R² ${f2(getOls().r2)}</div><p>${j ? 'Effect of ' + A.names[j - 1] : 'Intercept'}: from <b>${f2(s[0])}</b> to <b>${f2(s[s.length - 1])}</b>, middle <b>${f2(s[s.length >> 1])}</b>.</p>`;
}
async function runGwr() {
  if (!A) return; busy(true, 'Fitting GWR…'); await tick();
  const z = a => { const m = mean(a), s = sd(a) || 1; return a.map(v => (v - m) / s); };
  const yz = z(A.y), cols = A.names.map((_, j) => z(A.X.map(r => r[j]))), Xz = A.y.map((_, i) => cols.map(c => c[i]));
  try { const G = gwr(yz, Xz, A.names, A.xy, null, n => { $('#gwr-prog').textContent = `trying bandwidth ${n}…`; }); A.cache.gwr = G; A.names.forEach((n, j) => setRes('gwr_' + n, G.B.map(b => b[j + 1]))); $('#gwr-prog').textContent = ''; }
  catch (e) { $('#gwr-out').textContent = 'GWR failed: ' + e.message; }
  busy(false); $('#gwr-v').innerHTML = ''; rGwr();
}

// ---------- random forest (histogram trees) ----------
function binCols(cols, nb = 32) {
  return cols.map(c => { const s = Float64Array.from(c).sort(), e = []; for (let b = 1; b < nb; b++) e.push(s[Math.floor(b * s.length / nb)]); const ed = [...new Set(e)]; const bins = new Uint8Array(c.length); for (let i = 0; i < c.length; i++) { let lo = 0, hi = ed.length; while (lo < hi) { const m = (lo + hi) >> 1; if (c[i] > ed[m]) lo = m + 1; else hi = m; } bins[i] = lo; } return { bins, nb: ed.length + 1 }; });
}
function growTree(B, y, rows, r, o, imp) {
  const T = { f: [], t: [], l: [], rr: [], v: [] }, p = B.length;
  const node = (idx, depth) => {
    const id = T.f.length; T.f.push(-1); T.t.push(0); T.l.push(-1); T.rr.push(-1);
    let s = 0, s2 = 0; for (const i of idx) { s += y[i]; s2 += y[i] * y[i]; } const n = idx.length; T.v.push(s / n);
    if (n < 2 * o.minLeaf || depth >= o.maxDepth) return id;
    const parent = s2 - s * s / n; let best = { g: 1e-12 };
    const feats = []; while (feats.length < o.mtry) { const f = Math.floor(r() * p); if (!feats.includes(f)) feats.push(f); }
    for (const f of feats) {
      const nb = B[f].nb, cn = new Float64Array(nb), cs = new Float64Array(nb), cq = new Float64Array(nb), bins = B[f].bins;
      for (const i of idx) { const b = bins[i]; cn[b]++; cs[b] += y[i]; cq[b] += y[i] * y[i]; }
      let ln = 0, ls = 0, lq = 0;
      for (let b = 0; b < nb - 1; b++) { ln += cn[b]; ls += cs[b]; lq += cq[b]; const rn = n - ln; if (ln < o.minLeaf || rn < o.minLeaf) continue; const rs = s - ls, rq = s2 - lq; const g = parent - (lq - ls * ls / ln) - (rq - rs * rs / rn); if (g > best.g) best = { g, f, b }; }
    }
    if (best.f == null) return id;
    imp[best.f] += best.g; const L = [], Rr = []; for (const i of idx) (B[best.f].bins[i] <= best.b ? L : Rr).push(i);
    T.f[id] = best.f; T.t[id] = best.b; T.l[id] = node(L, depth + 1); T.rr[id] = node(Rr, depth + 1); return id;
  };
  node(rows, 0); return T;
}
const predTree = (T, B, i) => { let k = 0; while (T.f[k] >= 0) k = B[T.f[k]].bins[i] <= T.t[k] ? T.l[k] : T.rr[k]; return T.v[k]; };
async function rfCV(cols, y, { trees = 100, folds = 5, seed = 3, prog } = {}) {
  const n = y.length, B = binCols(cols), r = rng(seed), o = { minLeaf: 3, maxDepth: 14, mtry: Math.max(1, Math.round(cols.length / 3)) };
  const fold = Array.from({ length: n }, (_, i) => i); for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [fold[i], fold[j]] = [fold[j], fold[i]]; }
  const fid = new Int8Array(n); fold.forEach((i, k) => fid[i] = k % folds);
  const pred = new Float64Array(n), imp = new Float64Array(cols.length);
  for (let f = 0; f < folds; f++) {
    const tr = [], te = []; for (let i = 0; i < n; i++) (fid[i] === f ? te : tr).push(i);
    const sum = new Float64Array(te.length);
    for (let t = 0; t < trees; t++) { const bs = Array.from({ length: tr.length }, () => tr[Math.floor(r() * tr.length)]); const T = growTree(B, y, bs, r, o, imp); te.forEach((i, k) => sum[k] += predTree(T, B, i)); if (t % 10 === 9) { prog && prog(f, t); await tick(); } }
    te.forEach((i, k) => pred[i] = sum[k] / trees);
  }
  const ybar = mean(y); let sse = 0, sst = 0; for (let i = 0; i < n; i++) { sse += (y[i] - pred[i]) ** 2; sst += (y[i] - ybar) ** 2; }
  const tot = imp.reduce((a, b) => a + b, 0) || 1;
  return { pred, r2: 1 - sse / sst, imp: Array.from(imp, v => v / tot) };
}
function rfCols(set) {
  const base = A.names.map((_, j) => A.X.map(r => r[j])), names = [...A.names];
  if (set === 'sp') A.names.forEach((nm, j) => { base.push(Array.from(lag(A.W, base[j]))); names.push('neighbours: ' + nm); });
  if (set === 'emb') COLS.emb.forEach(e => { base.push(A.ix.map(i => +FC.features[i].properties[e] || 0)); names.push(e); });
  return { cols: base, names };
}
function rRf() {
  if (needA('#rf-out')) return; $('#rf-s [data-s=emb]').disabled = !COLS.emb.length;
  const R = A.cache.rf || {}, cur = R[st.rfS];
  if (!cur) { paint(); $('#rf-out').innerHTML = 'Press Run.' + Object.entries(R).map(([k, v]) => `<br>${{ base: 'X only', sp: '+ neighbours', emb: '+ embeddings' }[k]}: R² ${f2(v.r2)}`).join(''); return; }
  const e = A.y.map((v, i) => cur.pred[i] - v), m = 2.5 * sd(e) || 1; paint(aCol(e)(x => ramp(DIV, (x / m + 1) / 2)));
  legend('<b>Prediction mistakes on held-out places</b>' + sw(DIV[6], 'Predicted too high') + sw(DIV[3], 'About right') + sw(DIV[0], 'Predicted too low'));
  const top = cur.names.map((n, j) => [n, cur.imp[j]]).sort((a, b) => b[1] - a[1]).slice(0, 8);
  $('#rf-out').innerHTML = `<div class="ga-big">R² = ${f2(cur.r2)}</div><div class="ga-small">on held-out places (5-fold) · linear regression in-sample R² ${f2(getOls().r2)}</div><table><tr><th>Inputs</th><th class="n">R² held-out</th></tr>${Object.entries(R).map(([k, v]) => `<tr><td>${{ base: 'X only', sp: '+ neighbours’ averages', emb: '+ embeddings' }[k]}</td><td class="n">${f2(v.r2)}</td></tr>`).join('')}</table><h3 style="margin-top:8px">Most important inputs</h3><div class="ga-bars">${top.map(([n, v]) => `<span>${n}</span><div class="ga-bar" style="width:${Math.min(100, v * 180)}%;background:#1e3063"></div><span>${Math.round(v * 100)}%</span>`).join('')}</div>`;
}
async function runRf() {
  if (!A) return; const set = st.rfS; if (set === 'emb' && !COLS.emb.length) return;
  busy(true, 'Training the random forest…'); const { cols, names } = rfCols(set);
  const out = await rfCV(cols, A.y, { prog: (f, t) => { $('#rf-prog').textContent = `fold ${f + 1} of 5 · ${t + 1} trees`; } });
  out.names = names; (A.cache.rf ||= {})[set] = out; setRes('rf_pred_' + set, Array.from(out.pred, v => A.logy ? Math.exp(v) : v));
  $('#rf-prog').textContent = ''; busy(false); rRf();
}

// 8 k-means
function kmeans(V, k, seed = 7) {
  const n = V.length, D = V[0].length, r = rng(seed); let best = null;
  for (let run = 0; run < 6; run++) {
    const c = [V[Math.floor(r() * n)].slice()];
    while (c.length < k) { const d = V.map(v => Math.min(...c.map(cc => cc.reduce((s, q, a) => s + (v[a] - q) ** 2, 0)))); let u = r() * d.reduce((a, b) => a + b, 0), i = 0; while ((u -= d[i]) > 0 && i < n - 1) i++; c.push(V[i].slice()); }
    const lab = new Int16Array(n); let sse = 0;
    for (let it = 0; it < 50; it++) {
      sse = 0; for (let i = 0; i < n; i++) { let m = Infinity, b = 0; for (let j = 0; j < k; j++) { let e = 0; for (let a = 0; a < D; a++) e += (V[i][a] - c[j][a]) ** 2; if (e < m) { m = e; b = j; } } lab[i] = b; sse += m; }
      const s = c.map(() => new Float64Array(D)), cn = new Float64Array(k); for (let i = 0; i < n; i++) { cn[lab[i]]++; for (let a = 0; a < D; a++) s[lab[i]][a] += V[i][a]; }
      c.forEach((cc, j) => { if (cn[j]) for (let a = 0; a < D; a++) cc[a] = s[j][a] / cn[j]; });
    }
    if (!best || sse < best.sse) best = { lab: Array.from(lab), sse };
  }
  return best.lab;
}
const zcols = cols => cols.map(c => { const m = mean(c), s = sd(c) || 1; return c.map(v => (v - m) / s); });
function rKm() {
  if (needA('#km-out')) return; $('#km-emb').disabled = !COLS.emb.length; const K = A.cache.km;
  if (!K) { paint(); $('#km-out').innerHTML = 'Choose k and press Run.'; return; }
  paint(aCol(K)(v => KCOL[v])); legend(`<b>k-means, k = ${Math.max(...K) + 1} (ordered by ${A.yname})</b>` + [...new Set(K)].sort((a, b) => a - b).map(j => sw(KCOL[j], 'Cluster ' + (j + 1))).join(''));
  const rows = [...new Set(K)].sort((a, b) => a - b).map(j => { const ids = K.map((v, i) => v === j ? i : -1).filter(i => i >= 0); const md = a => { const s = ids.map(i => a[i]).sort((x, y) => x - y); return s[s.length >> 1]; }; return [j, ids.length, md(A.y.map(v => A.logy ? Math.exp(v) : v)), ...A.names.slice(0, 3).map((_, q) => md(A.X.map(r => r[q])))]; });
  $('#km-out').innerHTML = `<table><tr><th>Cluster</th><th class="n">Places</th><th class="n">${A.yname}</th>${A.names.slice(0, 3).map(n => `<th class="n">${n}</th>`).join('')}</tr>${rows.map(r => `<tr><td><i style="display:inline-block;width:11px;height:11px;border-radius:3px;background:${KCOL[r[0]]}"></i> ${r[0] + 1}</td><td class="n">${r[1]}</td>${r.slice(2).map(v => `<td class="n">${fmt(v)}</td>`).join('')}</tr>`).join('')}</table><p class="ga-small">Medians per cluster.</p>`;
}
function runKm() {
  if (!A) return; const k = +$('#km-k').value; const useE = $('#km-emb').checked && COLS.emb.length;
  const cols = useE ? COLS.emb.map(e => A.ix.map(i => +FC.features[i].properties[e] || 0)) : zcols([A.y, ...A.names.map((_, j) => A.X.map(r => r[j]))]);
  const V = A.y.map((_, i) => cols.map(c => c[i])); let lab = kmeans(V, k);
  const med = j => { const s = lab.map((v, i) => v === j ? A.y[i] : null).filter(v => v != null).sort((a, b) => a - b); return s.length ? s[s.length >> 1] : -Infinity; };
  const ord = [...Array(k).keys()].sort((a, b) => med(b) - med(a)), mp = {}; ord.forEach((j, r) => mp[j] = r); lab = lab.map(v => mp[v]);
  A.cache.km = lab; setRes('cluster', lab.map(v => v + 1)); rKm();
}
// 9 classification
function rCls() {
  if (needA('#cls-out')) return; const C = A.cache.cls;
  if (!C) { paint(); $('#cls-out').innerHTML = 'Choose the top share and press Run.'; return; }
  const col = (t, p) => t && p ? '#c00000' : t ? '#f4a582' : p ? '#6a3d9a' : '#eeeeee';
  paint(aCol(C.t)((t, k) => col(t, C.p[k]))); legend('<b>Is this place in the top group?</b>' + sw('#c00000', 'Top, found') + sw('#f4a582', 'Top, missed') + sw('#6a3d9a', 'Flagged, is not') + sw('#eeeeee', 'Not top, correctly'));
  let tp = 0, fn = 0, fp = 0, tn = 0; C.t.forEach((t, i) => { const p = C.p[i]; if (t && p) tp++; else if (t) fn++; else if (p) fp++; else tn++; });
  const acc = (tp + tn) / C.t.length, f1 = 2 * tp / Math.max(1, 2 * tp + fp + fn);
  $('#cls-out').innerHTML = `<div class="ga-big">${Math.round(acc * 100)}% correct</div><div class="ga-small">F1 ${f2(f1)} on held-out places · top ${C.q}% of ${A.yname}</div><table><tr><th></th><th class="n">Model: top</th><th class="n">Model: not</th></tr><tr><td>Actually top</td><td class="n">${tp}</td><td class="n">${fn}</td></tr><tr><td>Actually not</td><td class="n">${fp}</td><td class="n">${tn}</td></tr></table>`;
}
async function runCls() {
  if (!A) return; const q = +$('#cls-q').value, thr = quantile(A.y, 1 - q / 100), t = A.y.map(v => v >= thr ? 1 : 0);
  busy(true, 'Training the classifier…'); const { cols } = rfCols(COLS.emb.length ? 'emb' : 'sp');
  const out = await rfCV(cols, t, { trees: 80 }); const p = Array.from(out.pred, v => v >= 0.5 ? 1 : 0);
  A.cache.cls = { t, p, q }; setRes('top_group', t); setRes('top_group_predicted', p); busy(false); rCls();
}

// ---------------- GeoAI on your places ----------------
function vectors() {
  if (COLS.emb.length) { const V = FC.features.map(f => COLS.emb.map(e => +f.properties[e] || 0)); return { V, ids: V.map((_, i) => i), kind: 'embeddings' }; }
  if (!A) return null; const cols = zcols([A.y, ...A.names.map((_, j) => A.X.map(r => r[j]))]); return { V: A.y.map((_, i) => cols.map(c => c[i])), ids: A.ix, kind: 'your y and X (standardised)' };
}
const cos = (a, b) => { let s = 0, na = 0, nb = 0; for (let k = 0; k < a.length; k++) { s += a[k] * b[k]; na += a[k] * a[k]; nb += b[k] * b[k]; } return s / (Math.sqrt(na * nb) || 1); };
function rG2() { const y = +$('#g2-y .on').dataset.y; paint(i => null, () => 0.08); legend(`<b>Sentinel-2 cloudless ${y}</b>${sw('#ffd400', 'Your places (outline)')}`); }
function rG3() {
  const VV = vectors(); if (!VV) { $('#g3-out').innerHTML = 'Your file has no embedding columns (A00–A63). Choose y and X in tab 0 to compare places on those instead.'; paint(); return; }
  if (st.seed == null) { paint(); $('#g3-out').innerHTML = `Comparing on ${VV.kind}. Click a place on the map.`; return; }
  const pos = new Map(VV.ids.map((i, k) => [i, k])); if (!pos.has(st.seed)) { $('#g3-out').textContent = 'That place has missing values; pick another.'; return; }
  const s0 = VV.V[pos.get(st.seed)], sim = VV.V.map(v => cos(v, s0)), srt = [...sim].sort((a, b) => a - b), lo = srt[Math.floor(srt.length * 0.05)], hi = srt[srt.length - 2];
  const m = new Map(VV.ids.map((i, k) => [i, sim[k]])); paint(i => m.has(i) ? ramp(PUR, (m.get(i) - lo) / (hi - lo || 1)) : null);
  const out = new Array(N).fill(null); m.forEach((v, i) => out[i] = v); RES.similarity = out;
  const top = VV.ids.map((i, k) => [i, sim[k]]).filter(([i]) => i !== st.seed).sort((a, b) => b[1] - a[1]).slice(0, 12); outline([st.seed, ...top.map(t => t[0])]);
  legend(`<b>Likeness to ${nameOf(st.seed)}</b><div class="ramp" style="background:linear-gradient(90deg,${PUR.join(',')})"></div><div class="rl"><span>least alike</span><span>most alike</span></div>`);
  $('#g3-out').innerHTML = `<h3>Most like ${nameOf(st.seed)}</h3><table><tr><th>Place</th><th class="n">Likeness</th></tr>${top.map(([i, v]) => `<tr><td>${nameOf(i)}</td><td class="n">${v.toFixed(3)}</td></tr>`).join('')}</table><p class="ga-small">Cosine similarity on ${VV.kind}; the 12 closest are outlined.</p>`;
}
const TC = ['#c00000', '#e6ab02', '#1b9e77'], TN = ['Class A', 'Class B', 'Class C'];
function rG4(run = false) {
  const VV = vectors(); if (!VV) { $('#g4-out').innerHTML = 'Your file has no embedding columns. Choose y and X in tab 0 first.'; paint(); return; }
  const lab = st.g4lab, out = RES.taught;
  paint(i => out && out[i] != null ? TC[TN.indexOf(out[i])] : null, i => lab.has(i) ? 1 : out && out[i] != null ? 0.5 : 0.35);
  map.getSource('pins').setData(FCx([...lab.entries()].map(([i, c]) => ({ type: 'Feature', properties: { n: TN[c] }, geometry: { type: 'Point', coordinates: cent[i] } }))));
  legend('<b>Teach the map</b>' + TC.map((c, k) => sw(c, TN[k])).join('') + '<div class="ga-small">Pins = your examples</div>');
  const cnt = [0, 0, 0]; lab.forEach(c => cnt[c]++);
  if (!out) { $('#g4-out').innerHTML = `Examples: ${TN.map((n, k) => `${n} ${cnt[k]}`).join(' · ')}. Click places to add or remove. Comparing on ${VV.kind}.`; return; }
  const ref = $('#g4-ref').value; let tab = '';
  if (ref) { const T = {}; out.forEach((c, i) => { if (c == null) return; const r = FC.features[i].properties[ref] ?? '–'; (T[r] ||= [0, 0, 0])[TN.indexOf(c)]++; }); const rows = Object.entries(T).sort((a, b) => b[1].reduce((x, y) => x + y) - a[1].reduce((x, y) => x + y)).slice(0, 8); tab = `<table><tr><th>${ref}</th>${TN.map(n => `<th class="n">${n}</th>`).join('')}</tr>${rows.map(([k, v]) => `<tr><td>${k}</td>${v.map(x => `<td class="n">${x}</td>`).join('')}</tr>`).join('')}</table>`; }
  const tot = [0, 0, 0]; out.forEach(c => { if (c != null) tot[TN.indexOf(c)]++; });
  $('#g4-out').innerHTML = `<b>${tot.reduce((a, b) => a + b)}</b> places labelled from <b>${lab.size}</b> examples: ${TN.map((n, k) => `${n} ${tot[k]}`).join(' · ')}.${tab}`;
}
function runG4() {
  const VV = vectors(); if (!VV) return; const pos = new Map(VV.ids.map((i, k) => [i, k]));
  const proto = [0, 1, 2].map(c => { const ex = [...st.g4lab].filter(([i, cc]) => cc === c && pos.has(i)).map(([i]) => VV.V[pos.get(i)]); return ex.length ? ex[0].map((_, a) => mean(ex.map(e => e[a]))) : null; });
  if (proto.filter(Boolean).length < 2) { $('#g4-out').textContent = 'Give examples for at least two classes.'; return; }
  const out = new Array(N).fill(null); VV.ids.forEach((i, k) => { let b = -1, bs = -Infinity; proto.forEach((p, c) => { if (!p) return; const s = cos(VV.V[k], p); if (s > bs) { bs = s; b = c; } }); out[i] = TN[b]; });
  RES.taught = out; rG4();
}
let EDGE_W = null;
function graphW() { if (A) return { W: A.W, ids: A.ix }; if (!EDGE_W) { const P = projector(cent), xy = cent.map(c => P.f(c[0], c[1])); EDGE_W = { W: weightsKNN(xy, Math.min(6, N - 1)), ids: cent.map((_, i) => i) }; } return EDGE_W; }
function rG5() {
  const { W, ids } = graphW(); const E = [];
  if (W.n * W.mean < 40000) for (let k = 0; k < W.n; k++) for (const j of W.nb[k]) if (j > k || !W.nb[j].includes(k)) E.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [cent[ids[k]], cent[ids[j]]] } });
  map.getSource('edges').setData(FCx(E));
  if (st.seed == null || !ids.includes(st.seed)) { paint(() => '#1f78b4', () => 0.6); legend('<b>Your places as a graph</b>' + sw('#1f78b4', 'Place (node)') + sw('#1e3063', 'Link to a nearest neighbour (edge)')); $('#g5-out').innerHTML = `${W.n.toLocaleString()} places, each linked to ${Math.round(W.mean)} nearest. Click a place.`; return; }
  const pos = new Map(ids.map((i, k) => [i, k])), h = new Map([[pos.get(st.seed), 0]]); let fr = [pos.get(st.seed)];
  for (let r = 1; r <= st.g5k; r++) { const nf = []; for (const a of fr) for (const b of W.nb[a]) if (!h.has(b)) { h.set(b, r); nf.push(b); } fr = nf; }
  const HC = ['#c00000', '#ef8a62', '#fdbf6f', '#c2a5cf', '#8073ac', '#542788']; const hi = new Map([...h].map(([k, r]) => [ids[k], r]));
  paint(i => hi.has(i) ? HC[hi.get(i)] : '#1f78b4', i => hi.has(i) ? 0.95 : 0.4);
  legend('<b>Rounds of message passing</b>' + HC.slice(0, st.g5k + 1).map((c, r) => sw(c, r ? `${r} step${r > 1 ? 's' : ''} away` : 'The place you picked')).join('') + sw('#1f78b4', 'Not reached yet'));
  const reached = [...h.values()].filter(v => v > 0).length; let avg = '';
  if (A) { const vals = [...h.keys()].map(k => A.y[k]); avg = `<p>Average ${A.ylab} over these ${h.size} places: <b>${fmt(mean(vals))}</b> (this place: ${fmt(A.y[pos.get(st.seed)])}). A graph neural network learns from such neighbourhood summaries.</p>`; }
  $('#g5-out').innerHTML = `<h3>${nameOf(st.seed)}</h3>After <b>${st.g5k}</b> round${st.g5k === 1 ? '' : 's'} it has heard from <b>${reached}</b> other places.${avg}`;
}
function rG6() {
  paint(); const col = $('#g6-col').value; if (!col) { $('#g6-out').textContent = 'Your file has no text column with place names.'; return; }
  if (!$('#g6-txt').value) { const names = FC.features.slice(0, 4).map(f => f.properties[col]).filter(Boolean); $('#g6-txt').value = names.length >= 2 ? `Footfall rose at ${names[0]} this week, while deliveries to ${names[1]} were delayed${names[2] ? `; ${names[2]} reported a new competitor nearby` : ''}.` : ''; }
}
function runG6() {
  const col = $('#g6-col').value; if (!col) return; const txt = $('#g6-txt').value; const found = []; let masked = txt;
  const names = [...new Map(FC.features.map((f, i) => [String(f.properties[col] ?? ''), i])).entries()].filter(([n]) => n.length >= 3).sort((a, b) => b[0].length - a[0].length);
  for (const [n, i] of names) { const re = new RegExp('\\b' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi'); if (re.test(masked)) { found.push([n, i]); masked = masked.replace(re, ' '.repeat(n.length)); } }
  let html = txt.replace(/[&<>]/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[s])); for (const [n] of found) html = html.replace(new RegExp('\\b(' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')\\b', 'gi'), '<mark style="background:#fde0dd;color:#c00000;font-weight:700">$1</mark>');
  map.getSource('pins').setData(FCx(found.map(([n, i]) => ({ type: 'Feature', properties: { n }, geometry: { type: 'Point', coordinates: cent[i] } })))); if (found.length) fitData(found.map(f => f[1]));
  $('#g6-out').innerHTML = `<p style="margin:0 0 8px">${html}</p><b>${found.length}</b> of your places found.<table>${found.map(([n, i]) => `<tr><td>${n}</td><td class="n">${cent[i][1].toFixed(4)}, ${cent[i][0].toFixed(4)}</td></tr>`).join('')}</table>`;
}
function rG7() { paint(i => null, () => 0.05); map.setPaintProperty('hr', 'raster-opacity', +$('#g7-a').value / 100); legend('<b>Two images of the same place</b>' + sw('#9aa58a', 'Left: Sentinel-2, 10 m') + sw('#5a6b4a', 'Right: aerial, under 1 m') + sw('#ffd400', 'Your places (outline)')); }
async function runG8() {
  const ids = (A ? A.ix : cent.map((_, i) => i)).slice(0, 50); busy(true, 'Fetching AI forecasts…'); const out = [];
  try {
    for (let s = 0; s < ids.length; s += 25) {
      const ch = ids.slice(s, s + 25), url = `https://api.open-meteo.com/v1/forecast?latitude=${ch.map(i => cent[i][1].toFixed(3)).join(',')}&longitude=${ch.map(i => cent[i][0].toFixed(3)).join(',')}&daily=temperature_2m_max,precipitation_sum&models=ecmwf_aifs025_single&forecast_days=3&timezone=auto`;
      let d = await fetch(url).then(r => r.json()); if (d.error) throw new Error(d.reason); if (!Array.isArray(d)) d = [d];
      d.forEach((x, k) => out.push([ch[k], x.daily.temperature_2m_max[1], x.daily.precipitation_sum[1], x.daily.time[1]])); $('#g8-prog').textContent = `${out.length} of ${ids.length}`;
    }
  } catch (e) { busy(false); $('#g8-out').textContent = 'Open-Meteo did not return forecasts: ' + e.message + ' Try again later.'; return; }
  busy(false); $('#g8-prog').textContent = ''; st.wx = out;
  RES.ai_tmax_tomorrow = new Array(N).fill(null); RES.ai_rain_tomorrow = new Array(N).fill(null); out.forEach(([i, t, p]) => { RES.ai_tmax_tomorrow[i] = t; RES.ai_rain_tomorrow[i] = p; }); rG8();
}
function rG8() {
  if (!st.wx) { paint(); $('#g8-out').innerHTML = `Press Get forecasts${N > 50 ? ' (the first 50 places)' : ''}, or click any place for its 7-day chart.`; return; }
  const v = st.wx.map(r => r[1]).filter(x => x != null), lo = Math.min(...v), hi = Math.max(...v), m = new Map(st.wx.map(r => [r[0], r[1]]));
  const P = ['#313695', '#74add1', '#fee090', '#f46d43', '#a50026']; paint(i => m.has(i) && m.get(i) != null ? ramp(P, (m.get(i) - lo) / (hi - lo || 1)) : null);
  legend(`<b>AI forecast: highest temperature, ${st.wx[0][3]}</b><div class="ramp" style="background:linear-gradient(90deg,${P.join(',')})"></div><div class="rl"><span>${lo.toFixed(1)} °C</span><span>${hi.toFixed(1)} °C</span></div>`);
  const top = [...st.wx].sort((a, b) => b[1] - a[1]).slice(0, 10);
  $('#g8-out').innerHTML = `<table><tr><th>Place</th><th class="n">Max °C</th><th class="n">Rain mm</th></tr>${top.map(([i, t, p]) => `<tr><td>${nameOf(i)}</td><td class="n">${t?.toFixed(1)}</td><td class="n">${p?.toFixed(1)}</td></tr>`).join('')}</table><p class="ga-small">ECMWF AIFS via Open-Meteo (CC-BY 4.0). Hottest 10 shown; all are in the download.</p>`;
}
const MODELS = [['ecmwf_aifs025_single', 'ECMWF AIFS (AI)', '#c00000'], ['ecmwf_ifs025', 'ECMWF IFS (physics)', '#1e3063'], ['gfs_seamless', 'NOAA GFS (physics)', '#8c8c8c']];
async function loadWx3(name) {
  const [lo, la] = st.wxPt; busy(true, 'Fetching…');
  let d; try { d = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${la.toFixed(3)}&longitude=${lo.toFixed(3)}&hourly=temperature_2m&models=${MODELS.map(m => m[0]).join(',')}&forecast_days=7&timezone=auto`).then(r => r.json()); } catch (e) { d = { error: true, reason: e.message }; }
  busy(false); if (d.error || !d.hourly) { $('#g8-out').textContent = 'Open-Meteo did not return a forecast: ' + (d.reason || '') + ' Try again later.'; return; }
  const cv = $('#g8-c'); cv.hidden = false; const g = cv.getContext('2d'), W = cv.width, H = cv.height, P = { l: 60, r: 20, t: 34, b: 50 }, T = d.hourly.time;
  const S = MODELS.map(([m, l, c]) => ({ l, c, v: d.hourly['temperature_2m_' + m] || [] })), all = S.flatMap(s => s.v).filter(v => v != null), mn = Math.min(...all), mx = Math.max(...all);
  const X = i => P.l + i / (T.length - 1) * (W - P.l - P.r), Y = v => H - P.b - (v - mn) / (mx - mn || 1) * (H - P.t - P.b);
  g.clearRect(0, 0, W, H); g.font = '17px Segoe UI, Arial'; g.fillStyle = '#4a5568'; g.textAlign = 'right'; for (let k = 0; k <= 4; k++) { const v = mn + (mx - mn) * k / 4; g.strokeStyle = '#e5e5e5'; g.beginPath(); g.moveTo(P.l, Y(v)); g.lineTo(W - P.r, Y(v)); g.stroke(); g.fillText(v.toFixed(0) + '°', P.l - 6, Y(v) + 5); }
  g.textAlign = 'center'; T.forEach((t, i) => { if (t.endsWith('T12:00')) g.fillText(new Date(t).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }), X(i), H - 18); });
  S.forEach(s => { g.strokeStyle = s.c; g.lineWidth = s.l.includes('AI') ? 3.2 : 2; g.beginPath(); let on = false; s.v.forEach((v, i) => { if (v == null) { on = false; return; } on ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)); on = true; }); g.stroke(); });
  g.textAlign = 'left'; g.font = 'bold 16px Segoe UI, Arial'; S.forEach((s, k) => { g.fillStyle = s.c; g.fillText(s.l, P.l + 6 + k * 240, 20); }); g.lineWidth = 1;
  map.getSource('pins').setData(FCx([{ type: 'Feature', properties: { n: name || `${la.toFixed(2)}, ${lo.toFixed(2)}` }, geometry: { type: 'Point', coordinates: [lo, la] } }]));
}
function rExp() {
  const cols = Object.keys(RES); $('#exp-out').innerHTML = cols.length ? `New columns: <b>${cols.join(', ')}</b>` : 'No results yet: run any tab first. The download will contain your file as it is.';
}
function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
function exportFC() { return { type: 'FeatureCollection', features: FC.features.map((f, i) => { const p = { ...f.properties }; delete p.col; delete p.op; delete p.i; for (const [k, a] of Object.entries(RES)) p[k] = a[i]; return { type: 'Feature', properties: p, geometry: f.geometry }; }) }; }
function exportCSV() {
  const fc = exportFC(), keys = [...new Set(fc.features.flatMap(f => Object.keys(f.properties)))], esc = v => v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
  return [[...keys, 'centroid_lon', 'centroid_lat'].join(','), ...fc.features.map((f, i) => [...keys.map(k => esc(f.properties[k])), cent[i][0].toFixed(6), cent[i][1].toFixed(6)].join(','))].join('\n');
}

// ---------------- wiring ----------------
function seg(id, fn) { $$(`#${id} button`).forEach(b => b.onclick = () => { $$(`#${id} button`).forEach(x => x.classList.toggle('on', x === b)); fn(b); }); }
function wire() {
  $$('#nav button').forEach(b => b.onclick = () => !b.disabled && show(b.dataset.t));
  const drop = $('#drop'), file = $('#file');
  file.onchange = async () => { const f = file.files[0]; if (f) await loadBuf(await f.arrayBuffer(), f.name); };
  ['dragover', 'dragenter'].forEach(e => document.addEventListener(e, ev => { ev.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(e => document.addEventListener(e, ev => { ev.preventDefault(); drop.classList.remove('over'); }));
  document.addEventListener('drop', async ev => { const f = ev.dataTransfer.files[0]; if (f) { show('load'); await loadBuf(await f.arrayBuffer(), f.name); } });
  $$('[data-sample]').forEach(b => b.onclick = async () => { busy(true, 'Loading sample…'); const r = await fetch('samples/' + b.dataset.sample); await loadBuf(await r.arrayBuffer(), b.dataset.sample); });
  $('#apply').onclick = applySetup;
  seg('sar-m', b => { st.sarM = b.dataset.m; rSar(); });
  $('#gwr-run').onclick = runGwr; $('#gwr-v').onchange = rGwr;
  seg('rf-s', b => { st.rfS = b.dataset.s; rRf(); }); $('#rf-run').onclick = runRf;
  $('#km-k').oninput = e => $('#km-kv').textContent = e.target.value; $('#km-run').onclick = runKm;
  $('#cls-q').oninput = e => $('#cls-qv').textContent = e.target.value + '%'; $('#cls-run').onclick = runCls;
  $$('[data-go]').forEach(b => b.onclick = () => show(b.dataset.go));
  seg('g2-y', () => { layersFor('g2'); rG2(); }); $('#g2-o').oninput = e => map.setPaintProperty('d-line', 'line-opacity', +e.target.value / 100);
  seg('g4-c', b => st.g4c = +b.dataset.c); $('#g4-run').onclick = runG4; $('#g4-clr').onclick = () => { st.g4lab.clear(); delete RES.taught; rG4(); }; $('#g4-ref').onchange = () => rG4();
  $('#g5-k').oninput = e => { st.g5k = +e.target.value; $('#g5-kv').textContent = st.g5k; rG5(); };
  $('#g6-run').onclick = runG6; $('#g6-col').onchange = () => { $('#g6-txt').value = ''; rG6(); };
  $('#g7-a').oninput = e => map.setPaintProperty('hr', 'raster-opacity', +e.target.value / 100);
  $('#g8-run').onclick = runG8;
  $('#exp-geo').onclick = () => download('location_lab_results.geojson', JSON.stringify(exportFC()), 'application/geo+json');
  $('#exp-csv').onclick = () => download('location_lab_results.csv', exportCSV(), 'text/csv');
}
initMap(); wire();
