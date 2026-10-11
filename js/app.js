// app.js — Location Lab workbench
import * as S from './stats.js';
import * as C from './charts.js';
import { readAny, toCSV } from './io.js';
import { GEO, RECIPES } from './config.js';

const h3 = window.h3;
const $ = s => document.querySelector(s);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const state = { geo: 'india', mode: 'guided', layers: new Map(), pipeline: [], recipe: null, uid: 0, pick: null, nbMode: null };
window.LL = state; // handy for debugging in class

// ---------------------------------------------------------------- map
const dark = () => matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme !== 'light' || document.documentElement.dataset.theme === 'dark';
function baseStyle() { return `https://tiles.openfreemap.org/styles/${dark() ? 'dark' : 'positron'}`; }
const beforeId = () => map.getStyle().layers.find(l => l.type === 'symbol')?.id;
const map = new maplibregl.Map({ container: 'map', style: baseStyle(), center: GEO.india.center, zoom: GEO.india.zoom, attributionControl: { compact: true }, preserveDrawingBuffer: true });
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');
let styleReady = false; const mapReady = new Promise(r => map.on('load', () => { styleReady = true; r(); }));
map.on('error', e => { if (String(e?.error?.message || '').includes('basemaps')) return; });

// ---------------------------------------------------------------- helpers
const toast = (msg, ms = 3200) => { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, ms); };
const geo = () => GEO[state.geo];
const proj = () => { const lat0 = geo().center[1]; const kx = 111.32 * Math.cos(lat0 * Math.PI / 180), ky = 110.574; return { f: (lon, lat) => [lon * kx, lat * ky], inv: (x, y) => [x / kx, y / ky] }; };
function centroid(g) {
  if (g.type === 'Point') return g.coordinates;
  const ring = g.type === 'Polygon' ? g.coordinates[0] : g.type === 'MultiPolygon' ? g.coordinates.reduce((a, p) => p[0].length > a.length ? p[0] : a, []) : g.coordinates;
  let x = 0, y = 0; for (const c of ring) { x += c[0]; y += c[1]; } return [x / ring.length, y / ring.length];
}
const lonlat = L => L.fc.features.map(f => centroid(f.geometry));
const xyKm = L => { const p = proj(); return lonlat(L).map(([lo, la]) => p.f(lo, la)); };
const props = L => L.fc.features.map(f => f.properties);
const numFields = L => { if (!L?.fc?.features.length) return []; const f0 = L.fc.features.slice(0, 50); return Object.keys(f0[0].properties).filter(k => f0.some(f => typeof f.properties[k] === 'number')); };
const allFields = L => L?.fc?.features.length ? Object.keys(L.fc.features[0].properties) : [];
const vals = (L, k) => L.fc.features.map(f => +f.properties[k]);
const kindOf = fc => { const t = fc.features[0]?.geometry?.type || ''; return t.includes('Polygon') ? 'polygon' : t.includes('Line') ? 'line' : 'point'; };
const fmt = C.fmt;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const kpi = (v, l) => `<div class="kpi"><b>${v}</b><small>${l}</small></div>`;
const anchor = id => geo().points.find(p => p.id === id) || geo().points[0];
function circlePoly(lon, lat, km, n = 72) { const out = []; for (let i = 0; i <= n; i++) { const a = i / n * 2 * Math.PI; out.push([lon + km / (111.32 * Math.cos(lat * Math.PI / 180)) * Math.cos(a), lat + km / 110.574 * Math.sin(a)]); } return out; }

// palettes
const CAT = ['#2347b8', '#c2410c', '#0f7a73', '#7a3fb0', '#a16207', '#be185d', '#3b7d23', '#475569', '#0369a1', '#b91c1c', '#4d7c0f', '#6d28d9'];
const SEQ = ['#f1eef6', '#bdc9e1', '#74a9cf', '#2b8cbe', '#045a8d', '#023858'];
const DIV = ['#2166ac', '#67a9cf', '#d1e5f0', '#f7f7f7', '#fddbc7', '#ef8a62', '#b2182b'];
const NDVI = [[-0.2, '#2b6cb0'], [0, '#d9d4c7'], [0.2, '#c8b88a'], [0.3, '#b7d98f'], [0.5, '#5aa845'], [0.8, '#14532d']];
const LISA_C = () => ({ 'High-High': css('--hh'), 'Low-Low': css('--ll'), 'High-Low': css('--hl'), 'Low-High': css('--lh'), 'Not significant': css('--ns') });
const GI_C = { 'Hot spot 99%': '#b2182b', 'Hot spot 95%': '#ef8a62', 'Hot spot 90%': '#fddbc7', 'Not significant': '#d9dde2', 'Cold spot 90%': '#d1e5f0', 'Cold spot 95%': '#67a9cf', 'Cold spot 99%': '#2166ac' };
function quantBreaks(v, n = 6) { const s = v.filter(Number.isFinite).sort((a, b) => a - b); return Array.from({ length: n - 1 }, (_, i) => s[Math.floor((i + 1) / n * (s.length - 1))]); }
function hex2rgb(c) { c = c.replace('#', ''); return [0, 2, 4].map(i => parseInt(c.substr(i, 2), 16)); }
function rampColor(stops, v) { if (!(v >= stops[0][0])) return stops[0][1]; for (let i = 1; i < stops.length; i++) if (v <= stops[i][0]) { const [a, ca] = stops[i - 1], [b, cb] = stops[i]; const t = (v - a) / (b - a), A = hex2rgb(ca), B = hex2rgb(cb); return `rgb(${A.map((x, j) => Math.round(x + (B[j] - x) * t)).join(',')})`; } return stops[stops.length - 1][1]; }

// ---------------------------------------------------------------- layers
function addLayer(L) {
  L.id = L.id || 'L' + (++state.uid); L.visible = L.visible ?? true; L.style = L.style || { mode: 'single' };
  if (state.layers.has(L.id)) removeMapLayers(L.id);
  state.layers.set(L.id, L); render(L); refreshLayerList(); refreshParams(); return L;
}
function removeMapLayers(id) { for (const s of ['fill', 'line', 'circle', 'ext', 'heat', 'ras', 'sel']) if (map.getLayer(`${id}-${s}`)) map.removeLayer(`${id}-${s}`); if (map.getSource(id)) map.removeSource(id); }
function colorExpr(L) {
  const st = L.style, single = st.color || (L.kind === 'polygon' ? css('--accent') : css('--accent'));
  if (st.mode === 'cat') { const m = st.colors || {}; const keys = st.keys || [...new Set(L.fc.features.map(f => f.properties[st.field]))].slice(0, 12); keys.forEach((k, i) => m[k] = m[k] || CAT[i % CAT.length]); st.colors = m; st.keys = keys; return ['match', ['to-string', ['get', st.field]], ...keys.flatMap(k => [String(k), m[k]]), css('--ns')]; }
  if (st.mode === 'seq' || st.mode === 'div') {
    const v = vals(L, st.field); let br, cols;
    if (st.mode === 'div') { const m = Math.max(...v.map(Math.abs).filter(Number.isFinite)) || 1; br = [-0.6, -0.3, -0.1, 0.1, 0.3, 0.6].map(t => t * m); cols = DIV; }
    else { br = quantBreaks(v, 6); cols = SEQ; br = br.filter((b, i) => i === 0 || b > br[i - 1]); }
    st.breaks = br; st.cols = cols.slice(0, br.length + 1);
    return ['case', ['!', ['to-boolean', ['get', st.field]]], st.field && v.some(x => x === 0) ? cols[0] : css('--ns'), ['step', ['to-number', ['get', st.field]], st.cols[0], ...br.flatMap((b, i) => [b, st.cols[i + 1]])]];
  }
  return single;
}
function addL(spec) { map.addLayer(spec, spec.type === 'fill-extrusion' ? undefined : beforeId()); }
function render(L) {
  if (!styleReady) { mapReady.then(() => render(L)); return; }
  removeMapLayers(L.id); const vis = L.visible ? 'visible' : 'none';
  if (L.kind === 'raster') return renderRaster(L, vis);
  map.addSource(L.id, { type: 'geojson', data: L.fc, generateId: true });
  const st = L.style;
  if (st.mode === 'heat') {
    addL({ id: `${L.id}-heat`, type: 'heatmap', source: L.id, layout: { visibility: vis }, paint: { 'heatmap-radius': st.radius || 25, 'heatmap-intensity': 1, 'heatmap-opacity': 0.85, 'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(0,0,0,0)', 0.15, '#fde68a', 0.4, '#f59e0b', 0.7, '#dc2626', 1, '#7f1d1d'] } });
  } else if (L.kind === 'polygon') {
    const c = colorExpr(L);
    if (st.extrude) addL({ id: `${L.id}-ext`, type: 'fill-extrusion', source: L.id, layout: { visibility: vis }, paint: { 'fill-extrusion-color': c, 'fill-extrusion-height': ['*', ['to-number', ['get', st.extrude]], st.hscale || 60], 'fill-extrusion-opacity': 0.9 } });
    else { addL({ id: `${L.id}-fill`, type: 'fill', source: L.id, layout: { visibility: vis }, paint: { 'fill-color': c, 'fill-opacity': st.mode === 'single' ? (st.opacity ?? 0.12) : 0.78 } });
      addL({ id: `${L.id}-line`, type: 'line', source: L.id, layout: { visibility: vis }, paint: { 'line-color': st.mode === 'single' ? (st.color || css('--accent')) : css('--surface'), 'line-width': st.mode === 'single' ? 1.6 : 0.6 } }); }
  } else if (L.kind === 'line') {
    addL({ id: `${L.id}-line`, type: 'line', source: L.id, layout: { visibility: vis }, paint: { 'line-color': colorExpr(L), 'line-width': 2 } });
  } else {
    const n = L.fc.features.length, r = st.radius || (n > 4000 ? 2.6 : n > 1000 ? 3.5 : 5);
    addL({ id: `${L.id}-circle`, type: 'circle', source: L.id, layout: { visibility: vis }, paint: { 'circle-color': colorExpr(L), 'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, r * 0.7, 14, r * 1.8], 'circle-stroke-color': css('--surface'), 'circle-stroke-width': n > 3000 ? 0 : 0.8, 'circle-opacity': st.dimField ? ['case', ['to-boolean', ['get', st.dimField]], 1, 0.18] : 0.9 } });
  }
  addL({ id: `${L.id}-sel`, type: L.kind === 'polygon' ? 'line' : 'circle', source: L.id, filter: ['in', ['id'], ['literal', []]], paint: L.kind === 'polygon' ? { 'line-color': css('--ink'), 'line-width': 3 } : { 'circle-radius': 8, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': css('--ink'), 'circle-stroke-width': 2.5 } });
  legend(L);
}
function renderRaster(L, vis) {
  const R = L.raster, cv = document.createElement('canvas'); cv.width = R.w; cv.height = R.h; const g = cv.getContext('2d'), im = g.createImageData(R.w, R.h);
  const st = L.style, stops = st.stops || NDVI;
  for (let i = 0; i < R.data.length; i++) { const v = R.data[i]; if (!Number.isFinite(v)) { im.data[i * 4 + 3] = 0; continue; }
    const cs = rampColor(stops, v), c = cs.startsWith('rgb') ? cs.match(/\d+/g) : hex2rgb(cs); im.data[i * 4] = +c[0]; im.data[i * 4 + 1] = +c[1]; im.data[i * 4 + 2] = +c[2];
    im.data[i * 4 + 3] = st.mask != null && v <= st.mask ? 40 : 235; }
  g.putImageData(im, 0, 0);
  const [x0, y0, x1, y1] = R.bbox;
  map.addSource(L.id, { type: 'image', url: cv.toDataURL(), coordinates: [[x0, y1], [x1, y1], [x1, y0], [x0, y0]] });
  addL({ id: `${L.id}-ras`, type: 'raster', source: L.id, layout: { visibility: vis }, paint: { 'raster-opacity': 0.88, 'raster-resampling': 'nearest' } });
  legend(L);
}
function legend(L) {
  const el = $('#legend'), st = L.style; let h = `<b>${esc(L.name)}${st.field ? ' · ' + esc(st.field) : ''}</b>`;
  if (L.kind === 'raster') { const s = st.stops || NDVI; h += `<div class="ramp" style="background:linear-gradient(90deg,${s.map(x => x[1]).join(',')})"></div><div class="ends"><span>${fmt(s[0][0])}</span><span>${st.label || 'NDVI'}</span><span>${fmt(s[s.length - 1][0])}</span></div>`; }
  else if (st.mode === 'cat') h += st.keys.map(k => `<div class="row"><span class="sw" style="background:${st.colors[k]}"></span>${esc(k)}</div>`).join('');
  else if (st.mode === 'seq' || st.mode === 'div') { const b = st.breaks; h += st.cols.map((c, i) => `<div class="row"><span class="sw" style="background:${c}"></span>${i === 0 ? '≤ ' + fmt(b[0]) : i === b.length ? '> ' + fmt(b[b.length - 1]) : fmt(b[i - 1]) + ' – ' + fmt(b[i])}</div>`).join(''); }
  else if (st.mode === 'heat') h += `<div class="ramp" style="background:linear-gradient(90deg,#fde68a,#f59e0b,#dc2626,#7f1d1d)"></div><div class="ends"><span>sparse</span><span>dense</span></div>`;
  else { el.hidden = true; return; }
  el.innerHTML = h; el.hidden = false;
}
function refreshLayerList() {
  const box = $('#layerlist'); if (!state.layers.size) { box.innerHTML = '<p class="empty">Load a dataset to start.</p>'; return; }
  box.innerHTML = [...state.layers.values()].reverse().map(L => `<div class="layer"><input type="checkbox" id="vis-${L.id}" ${L.visible ? 'checked' : ''}><label for="vis-${L.id}" title="${esc(L.name)}">${esc(L.name)}</label><small>${L.kind === 'raster' ? L.raster.w + '×' + L.raster.h : L.fc.features.length}</small></div>`).join('');
  box.querySelectorAll('input').forEach(i => i.onchange = () => { const L = state.layers.get(i.id.slice(4)); L.visible = i.checked; render(L); });
}
function restyle(L, style) { L.style = { ...style }; render(L); }

// popups + neighbour viewer
map.on('click', e => {
  if (state.pick) { const cb = state.pick; state.pick = null; $('#pickhint').hidden = true; map.getCanvas().style.cursor = ''; cb([e.lngLat.lng, e.lngLat.lat]); return; }
  const ids = [...state.layers.values()].filter(L => L.visible && L.kind !== 'raster').reverse().flatMap(L => [`${L.id}-circle`, `${L.id}-fill`, `${L.id}-ext`]).filter(id => map.getLayer(id));
  const f = map.queryRenderedFeatures(e.point, { layers: ids })[0];
  if (!f) { const r = [...state.layers.values()].find(L => L.kind === 'raster' && L.visible); if (r) { const v = rasterAt(r, e.lngLat.lng, e.lngLat.lat); if (Number.isFinite(v)) new maplibregl.Popup().setLngLat(e.lngLat).setHTML(`<b>${esc(r.name)}</b><br>value ${v.toFixed(3)}`).addTo(map); } return; }
  const L = state.layers.get(f.source);
  const rows = Object.entries(f.properties).filter(([k]) => !k.startsWith('_')).slice(0, 16).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${typeof v === 'number' ? fmt(v) : esc(v)}</td></tr>`).join('');
  let extra = '';
  if (L?.W) { const nb = L.W.nb[f.id] || []; map.setFilter(`${L.id}-sel`, ['in', ['id'], ['literal', [f.id, ...nb]]]); extra = `<div style="margin-top:4px"><b>${nb.length} neighbours</b> highlighted (${esc(L.W.label)})</div>`; }
  new maplibregl.Popup({ maxWidth: '300px' }).setLngLat(e.lngLat).setHTML(`<b>${esc(L?.name || '')}</b><table class="pop">${rows}</table>${extra}`).addTo(map);
});
function rasterAt(L, lon, lat) { const R = L.raster, [x0, y0, x1, y1] = R.bbox; const i = Math.floor((lon - x0) / (x1 - x0) * R.w), j = Math.floor((y1 - lat) / (y1 - y0) * R.h); return i >= 0 && j >= 0 && i < R.w && j < R.h ? R.data[j * R.w + i] : NaN; }
function pickPoint() { return new Promise(res => { state.pick = res; $('#pickhint').hidden = false; map.getCanvas().style.cursor = 'crosshair'; }); }
$('#pickcancel').onclick = e => { e.stopPropagation(); state.pick = null; $('#pickhint').hidden = true; map.getCanvas().style.cursor = ''; };
function fit(L) { let b = [Infinity, Infinity, -Infinity, -Infinity]; if (L.kind === 'raster') b = L.raster.bbox; else for (const f of L.fc.features) { const walk = c => typeof c[0] === 'number' ? (b = [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])]) : c.forEach(walk); walk(f.geometry.coordinates); } map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 50, duration: 600, maxZoom: 16 }); }

// ---------------------------------------------------------------- blocks
import { BLOCKS, GROUPS } from './blocks.js';
const ctx = { state, map, S, C, h3, addLayer, render, restyle, fit, legend, geo, proj, xyKm, lonlat, props, vals, numFields, allFields, kindOf, fmt, esc, kpi, anchor, circlePoly, pickPoint, rasterAt, readAny, toCSV, CAT, LISA_C, GI_C, NDVI, centroid, css, toast };

function buildPalette() {
  const pal = $('#palette'); pal.innerHTML = '';
  for (const g of GROUPS) {
    const sec = document.createElement('div'); sec.className = 'grp';
    sec.innerHTML = `<h3><i style="background:var(${g.c})"></i>${g.name}</h3><p class="sub">${g.sub}</p>`;
    for (const b of BLOCKS.filter(b => b.group === g.id)) {
      const d = document.createElement('div'); d.className = 'blk'; d.draggable = true; d.tabIndex = 0; d.style.setProperty('--c', `var(${g.c})`); d.dataset.block = b.id; d.title = b.what;
      d.innerHTML = `<span>${b.name}</span><button class="add" aria-label="Add ${b.name}">+</button>`;
      d.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', b.id));
      d.querySelector('.add').onclick = () => addCard(b.id);
      d.onkeydown = e => { if (e.key === 'Enter') addCard(b.id); };
      sec.appendChild(d);
    }
    pal.appendChild(sec);
  }
}
const dz = $('#pipeline');
dz.addEventListener('dragover', e => { e.preventDefault(); $('#dropzone').classList.add('over'); });
dz.addEventListener('dragleave', () => $('#dropzone').classList.remove('over'));
dz.addEventListener('drop', e => { e.preventDefault(); $('#dropzone').classList.remove('over'); const id = e.dataTransfer.getData('text/plain'); if (id) addCard(id); });

function addCard(blockId, preset = {}, recipeStep = null) {
  const B = BLOCKS.find(b => b.id === blockId); if (!B) return;
  const card = { uid: ++state.uid, B, params: { ...defaults(B), ...preset }, recipeStep, ran: false };
  state.pipeline.push(card); drawCard(card); updateCount();
  setTimeout(() => card.el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 30);
  return card;
}
function defaults(B) { const p = {}; for (const q of B.params || []) if (q.def !== undefined) p[q.k] = typeof q.def === 'function' ? q.def(ctx) : q.def; return p; }
function drawCard(card) {
  const { B } = card, g = GROUPS.find(g => g.id === B.group);
  const li = document.createElement('li'); li.className = 'card'; li.style.setProperty('--c', `var(${g.c})`);
  li.innerHTML = `<div class="ch"><span class="num">${state.pipeline.indexOf(card) + 1}</span><b>${B.name}</b><button class="x" aria-label="Remove block">×</button></div><p class="what">${B.what}</p><div class="params"></div><button class="run">Run</button><div class="status"></div><div class="out"></div>`;
  li.querySelector('.x').onclick = () => { state.pipeline = state.pipeline.filter(c => c !== card); li.remove(); updateCount(); renumber(); };
  li.querySelector('.run').onclick = () => runCard(card);
  card.el = li; $('#pipeline').insertBefore(li, $('#dropzone')); drawParams(card);
}
function renumber() { state.pipeline.forEach((c, i) => c.el.querySelector('.num').textContent = i + 1); }
function updateCount() { $('#flowcount').textContent = `${state.pipeline.length} block${state.pipeline.length === 1 ? '' : 's'}`; }
function layerOpts(kinds) { return [...state.layers.values()].filter(L => !kinds || kinds.includes(L.kind)); }
function drawParams(card) {
  const box = card.el.querySelector('.params'); box.innerHTML = '';
  for (const q of card.B.params || []) {
    if (q.show && !q.show(card.params, ctx)) continue;
    const id = `p${card.uid}-${q.k}`; const lab = document.createElement('label'); lab.htmlFor = id; lab.textContent = q.label; let inp;
    const v = card.params[q.k];
    if (q.type === 'layer') {
      inp = document.createElement('select'); const opts = layerOpts(q.kinds);
      if (!opts.length) inp.innerHTML = `<option value="">(load a ${q.kinds ? q.kinds.join('/') : ''} layer first)</option>`;
      else { inp.innerHTML = opts.map(L => `<option value="${L.id}">${esc(L.name)}</option>`).join(''); let pick = opts.find(L => L.id === v);
        const real = opts.filter(L => !L.helper);
        if (!pick) for (const pr of [].concat(q.prefer || [])) { pick = pr === 'W' ? [...real].reverse().find(L => L.W) : pr === 'LATEST' ? [...real].reverse().find(L => L.id !== card.params.layer) : [...real].reverse().find(L => L.id.includes(pr)); if (pick) break; }
        pick = pick || real[real.length - 1] || opts[opts.length - 1]; inp.value = pick.id; card.params[q.k] = pick.id; }
      if (q.optional) { inp.insertAdjacentHTML('afterbegin', '<option value="">— none —</option>'); if (!v && q.optionalDefaultNone) { inp.value = ''; card.params[q.k] = ''; } }
    } else if (q.type === 'field' || q.type === 'fields') {
      const L = state.layers.get(card.params[q.of]); const fs = L ? (q.numeric ? numFields(L) : allFields(L)) : [];
      if (q.type === 'field') { inp = document.createElement('select'); inp.innerHTML = (q.optional ? '<option value="">— none —</option>' : '') + fs.map(f => `<option>${esc(f)}</option>`).join(''); const want = fs.includes(v) ? v : (q.prefer && fs.find(f => q.prefer.includes(f))) || (q.optional ? '' : fs[0]); inp.value = want ?? ''; card.params[q.k] = inp.value; }
      else { inp = document.createElement('div'); inp.className = 'multi'; const sel = new Set(Array.isArray(v) ? v.filter(f => fs.includes(f)) : []); card.params[q.k] = [...sel];
        inp.innerHTML = fs.filter(f => f !== card.params[q.exclude]).map((f, i) => `<label><input type="checkbox" id="${id}-${i}" value="${esc(f)}" ${sel.has(f) ? 'checked' : ''}>${esc(f)}</label>`).join('') || '<span class="status">no numeric fields yet</span>';
        inp.addEventListener('change', () => { card.params[q.k] = [...inp.querySelectorAll('input:checked')].map(x => x.value); }); }
    } else if (q.type === 'select') {
      inp = document.createElement('select'); const opts = typeof q.options === 'function' ? q.options(ctx, card.params) : q.options;
      inp.innerHTML = opts.map(o => Array.isArray(o) ? `<option value="${esc(o[0])}">${esc(o[1])}</option>` : `<option>${esc(o)}</option>`).join('');
      const values = opts.map(o => String(Array.isArray(o) ? o[0] : o)); inp.value = values.includes(String(v)) ? String(v) : values[0]; card.params[q.k] = inp.value;
    } else if (q.type === 'point') {
      inp = document.createElement('select'); const pts = geo().points;
      inp.innerHTML = pts.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('') + '<option value="pick">Click on the map…</option>' + (card.params._custom ? `<option value="custom">Your point (${card.params._custom.map(x => x.toFixed(4)).join(', ')})</option>` : '');
      inp.value = v === 'custom' && card.params._custom ? 'custom' : pts.some(p => p.id === v) ? v : pts[0].id; card.params[q.k] = inp.value;
      inp.addEventListener('change', async () => { if (inp.value === 'pick') { const ll = await pickPoint(); card.params._custom = ll; card.params[q.k] = 'custom'; drawParams(card); } });
    } else if (q.type === 'text') { inp = document.createElement('textarea'); inp.value = v ?? ''; inp.spellcheck = false; lab.style.gridColumn = '1/-1'; }
    else if (q.type === 'file') { inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.csv,.geojson,.json,.parquet,.fgb,.tif,.tiff'; inp.addEventListener('change', () => card.params[q.k] = inp.files[0]); }
    else { inp = document.createElement('input'); inp.type = 'number'; inp.value = v; if (q.step) inp.step = q.step; if (q.min != null) inp.min = q.min; if (q.max != null) inp.max = q.max; }
    inp.id = id;
    if (q.type !== 'fields' && q.type !== 'file' && q.type !== 'point') inp.addEventListener('change', () => { card.params[q.k] = q.type === 'number' ? +inp.value : inp.value; if ((card.B.params || []).some(o => o.of === q.k || o.show || typeof o.options === 'function')) drawParams(card); });
    if (q.type === 'point') inp.addEventListener('change', () => { if (inp.value !== 'pick') card.params[q.k] = inp.value; });
    box.append(lab, inp);
  }
}
function refreshParams() { for (const c of state.pipeline) drawParams(c); }
async function runCard(card) {
  const btn = card.el.querySelector('.run'), st = card.el.querySelector('.status'), out = card.el.querySelector('.out');
  btn.disabled = true; st.className = 'status'; st.textContent = 'Running…'; out.innerHTML = '';
  await new Promise(r => setTimeout(r, 30));
  const t0 = performance.now();
  try {
    const p = { ...card.params }; if (p.point === 'custom' || Object.values(p).includes('custom')) p._pt = card.params._custom;
    const res = await card.B.run(p, ctx, msg => st.textContent = msg);
    st.textContent = `Done in ${((performance.now() - t0) / 1000).toFixed(2)} s`;
    if (res?.html) out.insertAdjacentHTML('beforeend', res.html);
    for (const n of res?.nodes || []) out.appendChild(n);
    if (res?.read) out.insertAdjacentHTML('beforeend', `<div class="read">${res.read}</div>`);
    card.ran = true; markRecipe(card);
  } catch (e) { console.error(e); st.className = 'status err'; st.textContent = e.message || String(e); }
  btn.disabled = false;
}

// ---------------------------------------------------------------- recipes (guided mode)
function drawRecipe() {
  const box = $('#recipebox'); if (state.mode !== 'guided') { box.innerHTML = ''; return; }
  const list = RECIPES[state.geo]; const r = state.recipe || list[0]; state.recipe = r;
  const done = new Set(state.pipeline.filter(c => c.ran && c.recipeStep && c.recipeStep.r === r.id).map(c => c.recipeStep.i));
  const next = r.steps.findIndex((_, i) => !done.has(i) && !state.pipeline.some(c => c.recipeStep && c.recipeStep.r === r.id && c.recipeStep.i === i));
  box.innerHTML = `<div class="recipe"><label for="recipesel" class="status">Guided recipe</label><select id="recipesel">${list.map(x => `<option value="${x.id}" ${x.id === r.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select><p>${r.why}</p><ol class="steps">${r.steps.map((s, i) => `<li class="${done.has(i) ? 'done' : i === next ? 'next' : ''}"><i>${i + 1}</i><span>${s.say}</span></li>`).join('')}</ol>${next >= 0 ? `<button class="nextbtn" id="nextstep">Add step ${next + 1}: ${esc(BLOCKS.find(b => b.id === r.steps[next].b).name)}</button>` : '<p><b>Recipe complete.</b> Switch to Free play to try your own data.</p>'}</div>`;
  $('#recipesel').onchange = e => { state.recipe = list.find(x => x.id === e.target.value); drawRecipe(); };
  const nb = $('#nextstep'); if (nb) nb.onclick = () => { const s = r.steps[next]; addCard(s.b, s.p || {}, { r: r.id, i: next }); drawRecipe(); };
  // dim blocks not used in this recipe
  const used = new Set(r.steps.map(s => s.b)); document.querySelectorAll('.blk').forEach(b => b.classList.toggle('dim', !used.has(b.dataset.block)));
}
function markRecipe(card) { if (card.recipeStep) drawRecipe(); }

// ---------------------------------------------------------------- top bar
function clearAll() { for (const id of [...state.layers.keys()]) removeMapLayers(id); state.layers.clear(); state.pipeline = []; document.querySelectorAll('#pipeline .card').forEach(c => c.remove()); refreshLayerList(); updateCount(); $('#legend').hidden = true; }
function setGeo(g) { if (g === state.geo) return; state.geo = g; state.recipe = null; clearAll(); document.querySelectorAll('[data-geo]').forEach(b => b.classList.toggle('on', b.dataset.geo === g)); map.flyTo({ center: GEO[g].center, zoom: GEO[g].zoom }); drawRecipe(); }
function setMode(m) { state.mode = m; document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === m)); if (m === 'free') document.querySelectorAll('.blk').forEach(b => b.classList.remove('dim')); drawRecipe(); }
document.querySelectorAll('[data-geo]').forEach(b => b.onclick = () => setGeo(b.dataset.geo));
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));
$('#reset').onclick = () => { clearAll(); drawRecipe(); };
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { styleReady = false; map.setStyle(baseStyle()); map.once('style.load', () => { styleReady = true; state.layers.forEach(render); }); });

buildPalette(); drawRecipe();
const hashGeo = location.hash.slice(1); if (GEO[hashGeo]) setGeo(hashGeo);
