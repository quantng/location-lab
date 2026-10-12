// app.js — Location Lab workbench
import * as S from './stats.js';
import * as C from './charts.js';
import { readAny, toCSV } from './io.js';
import { GEO } from './config.js';

const h3 = window.h3;
const $ = s => document.querySelector(s);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const state = { geo: 'india', layers: new Map(), uid: 0, pick: null, cfg: null, runs: [] };
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
const proj = () => { let lat0 = geo().center[1]; try { const c = map.getCenter(); if (Math.abs(c.lat - lat0) > 3 || Math.abs(c.lng - geo().center[0]) > 3) lat0 = c.lat; } catch (e) {} const kx = 111.32 * Math.cos(lat0 * Math.PI / 180), ky = 110.574; return { f: (lon, lat) => [lon * kx, lat * ky], inv: (x, y) => [x / kx, y / ky] }; };
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
  state.layers.set(L.id, L); render(L); refreshLayerList(); if (state.cfg) drawParams(state.cfg); return L;
}
function removeMapLayers(id) { for (const s of ['fill', 'line', 'circle', 'ext', 'heat', 'ras', 'sel']) if (map.getLayer(`${id}-${s}`)) map.removeLayer(`${id}-${s}`); if (map.getSource(id)) map.removeSource(id); }
function colorExpr(L) {
  const st = L.style, single = st.color || (L.kind === 'polygon' ? css('--accent') : css('--accent'));
  if (st.mode === 'cat') { const m = st.colors || {}; const keys = st.keys || [...new Set(L.fc.features.map(f => f.properties[st.field]))].slice(0, 12); keys.forEach((k, i) => m[k] = m[k] || CAT[i % CAT.length]); st.colors = m; st.keys = keys; return ['match', ['to-string', ['get', st.field]], ...keys.flatMap(k => [String(k), m[k]]), css('--ns')]; }
  if (st.mode === 'seq' || st.mode === 'div') {
    const v = vals(L, st.field); let br, cols;
    if (st.mode === 'div') { const m = Math.max(...v.map(Math.abs).filter(Number.isFinite)) || 1; br = [-0.6, -0.3, -0.1, 0.1, 0.3, 0.6].map(t => t * m); cols = DIV; }
    else { const zero = v.filter(x => x === 0).length / v.length; br = zero > 0.3 ? [0, ...quantBreaks(v.filter(x => x > 0), 5)] : quantBreaks(v, 6); cols = SEQ; br = br.filter((b, i) => i === 0 || b > br[i - 1]); }
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
  if (L.visible) legend(L);
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
  if (L.visible) legend(L);
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
function syncLegend() { const el = $('#legend'); el.hidden = true; for (const L of [...state.layers.values()].reverse()) { if (!L.visible) continue; legend(L); if (!el.hidden) return; } }
function refreshLayerList() { drawLayerCards(); }
function restyle(L, style) { L.style = { ...style }; render(L); drawLayerCards(); }

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

// ---------------------------------------------------------------- blocks & UI (CARTO-style)
import { BLOCKS, GROUPS } from './blocks.js?v=10';
const ctx = { state, map, S, C, h3, addLayer, render, restyle, fit, legend, geo, proj, xyKm, lonlat, props, vals, numFields, allFields, kindOf, fmt, esc, kpi, anchor, circlePoly, pickPoint, rasterAt, readAny, toCSV, CAT, LISA_C, GI_C, NDVI, centroid, css, toast };
const HIDDEN = new Set(['load', 'upload', 'style', 'export']);
const ICON = {
  summarise: '<path d="M4 6h16M4 12h10M4 18h6"/>',
  calc: '<path d="M5 4h14v16H5zM8 8h8M8 12h2m3 0h3M8 16h2m3 0h3"/>',
  centroids: '<rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="12" cy="12" r="2"/>',
  cv: '<path d="M4 18l5-6 4 3 7-9"/><path d="M4 4v16h16"/>',
  filter: '<path d="M4 5h16l-6 7v6l-4 2v-8z"/>',
  explore: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/>',
  nearest: '<circle cx="12" cy="12" r="2"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="10"/>',
  sql: '<path d="M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  boxdist: '<rect x="4" y="4" width="16" height="16"/><circle cx="12" cy="12" r="8"/>',
  join: '<path d="M3 5l7-2 6 3 5-2v15l-5 2-6-3-7 2z"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/>',
  h3bin: '<path d="M12 2l8 4.6v9.2L12 20.4 4 15.8V6.6z"/><path d="M12 8l4 2.3v4.4L12 17l-4-2.3v-4.4z"/>',
  heat: '<circle cx="12" cy="12" r="9" opacity=".3" fill="currentColor"/><circle cx="12" cy="12" r="5" opacity=".6" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/>',
  ndvi: '<path d="M12 21c-4-3-7-7-7-11a7 7 0 0114 0c0 4-3 8-7 11z"/><path d="M12 21V9"/>',
  weights: '<circle cx="12" cy="12" r="2.5" fill="currentColor"/><circle cx="4" cy="5" r="2"/><circle cx="20" cy="6" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M10 10.5L5.5 6.5M14 10.5l4.5-3.5M10 13.5l-3.5 4M14 13.5l3.5 4"/>',
  lag: '<path d="M3 17l5-5 4 3 8-9"/><path d="M15 6h5v5"/>',
  pattern: '<circle cx="5" cy="6" r="1.6" fill="currentColor"/><circle cx="8" cy="8" r="1.6" fill="currentColor"/><circle cx="6" cy="10" r="1.6" fill="currentColor"/><circle cx="17" cy="16" r="1.6" fill="currentColor"/><circle cx="19" cy="6" r="1.6" fill="currentColor"/><circle cx="12" cy="19" r="1.6" fill="currentColor"/>',
  moran: '<path d="M4 20V4M4 20h16"/><path d="M6 17l13-11"/><circle cx="9" cy="12" r="1.3" fill="currentColor"/><circle cx="14" cy="10" r="1.3" fill="currentColor"/><circle cx="16" cy="6" r="1.3" fill="currentColor"/>',
  lisa: '<rect x="3" y="3" width="8" height="8" fill="currentColor" opacity=".9"/><rect x="13" y="3" width="8" height="8" opacity=".5"/><rect x="3" y="13" width="8" height="8" opacity=".5"/><rect x="13" y="13" width="8" height="8" fill="currentColor" opacity=".35"/>',
  gistar: '<path d="M12 3c2 4 6 5 6 10a6 6 0 01-12 0c0-3 2-4 3-7 1 2 2 3 3 3 0-2-1-4 0-6z"/>',
  dbscan: '<circle cx="7" cy="8" r="4"/><circle cx="17" cy="15" r="4"/><circle cx="19" cy="4" r="1" fill="currentColor"/>',
  sample: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.4" fill="currentColor"/><circle cx="15" cy="10" r="1.4" fill="currentColor"/><circle cx="10" cy="16" r="1.4" fill="currentColor"/>',
  idw: '<path d="M3 17c3-6 6-8 9-8s6 2 9 8"/><circle cx="6" cy="14" r="1.4" fill="currentColor"/><circle cx="12" cy="9" r="1.4" fill="currentColor"/><circle cx="18" cy="14" r="1.4" fill="currentColor"/>',
  krige: '<path d="M3 17c3-6 6-8 9-8s6 2 9 8"/><path d="M3 13c3-6 6-8 9-8s6 2 9 8" opacity=".4"/><path d="M3 21c3-6 6-8 9-8s6 2 9 8" opacity=".4"/>',
  distto: '<circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M6.5 16.5l11-9" stroke-dasharray="2 2"/>',
  ols: '<path d="M4 20V4M4 20h16"/><path d="M5 18l15-12"/>',
  slm: '<path d="M4 20V4M4 20h16"/><path d="M5 18l15-12"/><circle cx="16" cy="15" r="3"/>',
  sem: '<path d="M4 20V4M4 20h16"/><path d="M5 18l15-12"/><path d="M13 16h6M16 13v6"/>',
  gwr: '<path d="M3 20h18"/><path d="M4 17l4-6M10 17l3-10M16 17l4-3"/>',
};
const iconSVG = id => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[id] || '<circle cx="12" cy="12" r="8"/>'}</svg>`;

// ---------- tabs
function showTab(t) { document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === t)); $('#tab-layers').hidden = t !== 'layers'; $('#tab-analysis').hidden = t !== 'analysis'; $('#config').hidden = true; }
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));

// ---------- tiles
function buildTiles() {
  const box = $('#tiles'); box.innerHTML = '';
  for (const g of GROUPS) {
    const list = BLOCKS.filter(b => b.group === g.id && !HIDDEN.has(b.id)); if (!list.length) continue;
    const sec = document.createElement('div'); sec.className = 'tgroup'; sec.innerHTML = `<h5><i style="background:var(${g.c})"></i>${g.name}</h5><div class="tgrid"></div>`;
    for (const b of list) {
      const t = document.createElement('button'); t.className = 'tile'; t.draggable = true; t.dataset.block = b.id; t.title = b.what; t.style.setProperty('--c', `var(${g.c})`);
      t.innerHTML = `${iconSVG(b.id)}<span>${esc(b.name)}</span>`;
      t.addEventListener('dragstart', e => { e.dataTransfer.setData('application/x-block', b.id); e.dataTransfer.effectAllowed = 'copy'; });
      t.onclick = () => openConfig(b.id);
      sec.querySelector('.tgrid').appendChild(t);
    }
    box.appendChild(sec);
  }
}

// ---------- config panel
function defaults(B) { const p = {}; for (const q of B.params || []) if (q.def !== undefined) p[q.k] = typeof q.def === 'function' ? q.def(ctx) : q.def; return p; }
function openConfig(blockId, preset = {}) {
  const B = BLOCKS.find(b => b.id === blockId); if (!B) return;
  const g = GROUPS.find(x => x.id === B.group);
  state.cfg = { uid: ++state.uid, B, params: { ...defaults(B), ...preset }, el: $('#config') };
  $('#tab-layers').hidden = true; $('#tab-analysis').hidden = true; $('#config').hidden = false;
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === 'analysis'));
  $('#cfg-title').textContent = B.name; $('#cfg-title').style.color = `var(${g.c})`; $('#cfg-what').textContent = B.what; $('#cfg-status').textContent = ''; $('#cfg-status').className = 'status';
  drawParams(state.cfg);
}
$('#back').onclick = () => { state.cfg = null; showTab('analysis'); };
$('#cfg-run').onclick = () => state.cfg && runCfg(state.cfg);
function layerOpts(kinds) { return [...state.layers.values()].filter(L => !kinds || kinds.includes(L.kind)); }
function drawParams(card) {
  const box = $('#cfg-params'); box.innerHTML = '';
  for (const q of card.B.params || []) {
    if (q.show && !q.show(card.params, ctx)) continue;
    const id = `p${card.uid}-${q.k}`; const lab = document.createElement('label'); lab.htmlFor = id; lab.textContent = q.label; let inp;
    const v = card.params[q.k];
    if (q.type === 'layer') {
      inp = document.createElement('select'); const opts = layerOpts(q.kinds);
      if (!opts.length) inp.innerHTML = `<option value="">Add a ${q.kinds ? q.kinds.join(' or ') : ''} layer first</option>`;
      else { inp.innerHTML = opts.map(L => `<option value="${L.id}">${esc(L.name)}</option>`).join(''); let pick = opts.find(L => L.id === v);
        const real = opts.filter(L => !L.helper);
        if (!pick) for (const pr of [].concat(q.prefer || [])) { pick = pr === 'W' ? [...real].reverse().find(L => L.W) : pr === 'LATEST' ? [...real].reverse().find(L => L.id !== card.params.layer) : [...real].reverse().find(L => L.id.includes(pr)); if (pick) break; }
        pick = pick || real[real.length - 1] || opts[opts.length - 1]; inp.value = pick.id; card.params[q.k] = pick.id; }
      if (q.optional) { inp.insertAdjacentHTML('afterbegin', '<option value="">— none —</option>'); }
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
      inp.addEventListener('change', async () => { if (inp.value === 'pick') { const ll = await pickPoint(); card.params._custom = ll; card.params[q.k] = 'custom'; drawParams(card); } else card.params[q.k] = inp.value; });
    } else if (q.type === 'str') { inp = document.createElement('input'); inp.type = 'text'; inp.value = v ?? ''; }
    else if (q.type === 'text') { inp = document.createElement('textarea'); inp.value = v ?? ''; inp.spellcheck = false; lab.style.gridColumn = '1/-1'; }
    else { inp = document.createElement('input'); inp.type = 'number'; inp.value = v; if (q.step) inp.step = q.step; if (q.min != null) inp.min = q.min; }
    inp.id = id;
    if (!['fields', 'point'].includes(q.type)) inp.addEventListener('change', () => { card.params[q.k] = q.type === 'number' ? +inp.value : inp.value; if ((card.B.params || []).some(o => o.of === q.k || o.show || typeof o.options === 'function')) drawParams(card); });
    box.append(lab, inp);
  }
}
async function runCfg(card) {
  const btn = $('#cfg-run'), st = $('#cfg-status');
  btn.disabled = true; st.className = 'status'; st.textContent = 'Running…';
  await new Promise(r => setTimeout(r, 30)); const t0 = performance.now();
  try {
    const p = { ...card.params }; if (Object.values(p).includes('custom')) p._pt = card.params._custom;
    const res = await card.B.run(p, ctx, msg => st.textContent = msg);
    const secs = ((performance.now() - t0) / 1000).toFixed(2); st.textContent = `Done in ${secs} s · result on the right`;
    addResult(card.B, res, secs, p);
  } catch (e) { console.error(e); st.className = 'status err'; st.textContent = e.message || String(e); }
  btn.disabled = false;
}

// ---------- results drawer + history
function addResult(B, res, secs, params) {
  const g = GROUPS.find(x => x.id === B.group); const card = document.createElement('article'); card.className = 'rcard'; card.style.setProperty('--c', `var(${g.c})`);
  const L = params?.layer ? state.layers.get(params.layer) : null;
  card.innerHTML = `<header><b>${esc(B.name)}</b><small>${L ? esc(L.name.split(' (')[0]) + ' · ' : ''}${secs} s</small></header>`;
  if (res?.html) card.insertAdjacentHTML('beforeend', res.html);
  for (const n of res?.nodes || []) card.appendChild(n);
  if (res?.read) card.insertAdjacentHTML('beforeend', `<div class="read">${res.read}</div>`);
  $('#reslist').prepend(card); $('#results').hidden = false; requestAnimationFrame(() => map.resize());
  state.runs.push({ B, card });
  const h = $('#history'); h.querySelector('.empty')?.remove();
  const li = document.createElement('li'); li.innerHTML = `<button><b>${esc(B.name)}</b><small>${L ? esc(L.name.split(' (')[0]) : ''}</small></button>`;
  li.querySelector('button').onclick = () => { $('#results').hidden = false; card.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  h.prepend(li);
}
$('#closeres').onclick = () => { $('#results').hidden = true; requestAnimationFrame(() => map.resize()); };

// ---------- layer cards
const swatch = L => L.kind === 'raster' ? 'linear-gradient(90deg,#c8b88a,#5aa845,#14532d)' : (L.style.mode === 'cat' || L.style.mode === 'seq' || L.style.mode === 'div') ? 'conic-gradient(#2347b8,#c2410c,#0f7a73,#2347b8)' : (L.style.mode === 'heat' ? 'radial-gradient(#dc2626,#fde68a)' : (L.style.color || css('--accent')));
// layer order: state.layers insertion order = drawing order (last = on top); cards list top layer first
function applyOrder() {
  const b = beforeId();
  for (const L of state.layers.values()) for (const sfx of ['ras', 'heat', 'fill', 'line', 'circle', 'sel']) { const id = `${L.id}-${sfx}`; if (map.getLayer(id)) map.moveLayer(id, b); }
  for (const L of state.layers.values()) if (map.getLayer(`${L.id}-ext`)) map.moveLayer(`${L.id}-ext`);
}
function moveLayer(id, dir) {
  const arr = [...state.layers.entries()], i = arr.findIndex(e => e[0] === id), j = i + dir;
  if (i < 0 || j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]]; state.layers.clear(); arr.forEach(([k, v]) => state.layers.set(k, v));
  applyOrder(); drawLayerCards(); syncLegend();
}
function drawLayerCards() {
  const box = $('#layercards');
  if (!state.layers.size) { box.innerHTML = '<p class="empty">No layers yet. Click <b>Add data</b>, or drop a file on the map.</p>'; return; }
  box.innerHTML = '';
  for (const L of [...state.layers.values()].reverse()) {
    const c = document.createElement('div'); c.className = 'lcard' + (L.visible ? '' : ' off'); c.dataset.layer = L.id;
    const n = L.kind === 'raster' ? `${L.raster.w}×${L.raster.h} px` : `${L.fc.features.length.toLocaleString()} ${L.kind === 'point' ? 'points' : L.kind === 'polygon' ? 'areas' : 'lines'}`;
    c.innerHTML = `<div class="lhead"><span class="lsw ${L.kind}" style="background:${swatch(L)}"></span><div class="lname"><b title="${esc(L.name)}">${esc(L.name)}</b><small>${n}${L.W ? ' · neighbours set' : ''}</small></div>
      <button class="iconbtn" data-act="vis" aria-label="${L.visible ? 'Hide' : 'Show'} layer" title="${L.visible ? 'Hide' : 'Show'}">${L.visible ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>' : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l18 18M10.6 5.1A10 10 0 0112 5c7 0 11 7 11 7a18 18 0 01-3.2 3.9M6.1 6.1A18 18 0 001 12s4 7 11 7a10 10 0 004.9-1.3"/></svg>'}</button>
      <button class="iconbtn" data-act="up" aria-label="Move layer up" title="Move up (draw on top)">▲</button><button class="iconbtn" data-act="down" aria-label="Move layer down" title="Move down (draw underneath)">▼</button>
      <button class="iconbtn" data-act="more" aria-label="More options" title="More">⋯</button></div>
      <div class="lbody">${L.kind !== 'raster' ? `<label for="col-${L.id}">Colour by</label><select id="col-${L.id}"><option value="">Single colour</option>${allFields(L).filter(f => !f.startsWith('_')).map(f => `<option ${L.style.field === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select>` : ''}
      <div class="lmenu" hidden><button data-act="zoom">Zoom to</button>${L.kind !== 'raster' ? '<button data-act="table">Table</button><button data-act="csv">Download CSV</button><button data-act="geojson">Download GeoJSON</button>' : ''}<button data-act="remove">Remove</button></div></div>`;
    c.querySelector('[data-act=vis]').onclick = () => { L.visible = !L.visible; render(L); drawLayerCards(); syncLegend(); };
    c.querySelector('[data-act=up]').onclick = () => moveLayer(L.id, +1);
    c.querySelector('[data-act=down]').onclick = () => moveLayer(L.id, -1);
    c.querySelector('[data-act=more]').onclick = () => { const m = c.querySelector('.lmenu'); m.hidden = !m.hidden; };
    c.querySelector('[data-act=zoom]').onclick = () => fit(L);
    c.querySelector('[data-act=remove]').onclick = () => { for (const s of ['fill', 'line', 'circle', 'ext', 'heat', 'ras', 'sel']) if (map.getLayer(`${L.id}-${s}`)) map.removeLayer(`${L.id}-${s}`); if (map.getSource(L.id)) map.removeSource(L.id); state.layers.delete(L.id); drawLayerCards(); syncLegend(); };
    const tb = c.querySelector('[data-act=table]'); if (tb) tb.onclick = () => openConfig('explore', { layer: L.id });
    const dl = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); };
    const cs = c.querySelector('[data-act=csv]'); if (cs) cs.onclick = () => dl(`${L.id}.csv`, toCSV(L.fc), 'text/csv');
    const gj = c.querySelector('[data-act=geojson]'); if (gj) gj.onclick = () => dl(`${L.id}.geojson`, JSON.stringify(L.fc), 'application/geo+json');
    const sel = c.querySelector('select'); if (sel) sel.onchange = () => {
      const f = sel.value; if (!f) return restyle(L, { mode: 'single' });
      const v = vals(L, f); const fin = v.filter(Number.isFinite), num = fin.length >= 0.8 * v.length && new Set(fin).size > 2; restyle(L, { mode: num ? (v.some(x => x < 0) && v.some(x => x > 0) ? 'div' : 'seq') : 'cat', field: f, radius: L.style.radius });
    };
    // a layer card is also a drop target for analysis tiles
    c.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('application/x-block')) { e.preventDefault(); c.classList.add('over'); } });
    c.addEventListener('dragleave', () => c.classList.remove('over'));
    c.addEventListener('drop', e => { const id = e.dataTransfer.getData('application/x-block'); c.classList.remove('over'); if (!id) return; e.preventDefault(); openConfig(id, { layer: L.id }); });
    box.appendChild(c);
  }
}

// ---------- add data dialog
const dlg = $('#datadlg');
function buildCatalog() {
  $('#catalog').innerHTML = geo().data.map(d => `<button class="dcard" data-key="${d.key}"><span class="tag">${d.kind === 'raster' ? 'satellite raster · COG' : d.kind === 'polygon' ? 'areas' : 'points'}</span><b>${esc(d.name)}</b><small>${esc(d.src)}</small></button>`).join('');
  $('#catalog').querySelectorAll('.dcard').forEach(b => b.onclick = async () => { dlg.close(); await loadDataset(b.dataset.key); });
}
async function loadDataset(key) {
  const B = BLOCKS.find(b => b.id === 'load'); const D = geo().data.find(d => d.key === key);
  toast(`Loading ${D.name}…`, 1500); const t0 = performance.now();
  try { const res = await B.run({ dataset: key, format: D.tif ? 'tif' : $('#fmtsel').value }, ctx); addResult({ ...B, name: 'Added: ' + D.name.split(' (')[0] }, res, ((performance.now() - t0) / 1000).toFixed(2), {}); showTab('layers'); }
  catch (e) { toast(e.message); }
}
async function uploadFile(file) {
  const B = BLOCKS.find(b => b.id === 'upload'); const t0 = performance.now();
  try { const res = await B.run({ file }, ctx); addResult({ ...B, name: 'Uploaded: ' + file.name }, res, ((performance.now() - t0) / 1000).toFixed(2), {}); showTab('layers'); }
  catch (e) { toast(e.message, 5000); }
}
$('#adddata').onclick = () => { buildCatalog(); dlg.showModal(); };
$('#dlgclose').onclick = () => dlg.close();
$('#upfile').onchange = e => { const f = e.target.files[0]; if (f) { dlg.close(); uploadFile(f); } e.target.value = ''; };

// ---------- map drop target: analysis tiles or files
const veil = $('#dropveil'), mw = $('#mapwrap'); let dragDepth = 0;
mw.addEventListener('dragenter', e => { dragDepth++; const t = e.dataTransfer.types; if (t.includes('application/x-block') || t.includes('Files')) { $('#dropmsg').textContent = t.includes('Files') ? 'Drop the file to add it as a layer' : 'Drop to set up this analysis'; veil.hidden = false; } });
mw.addEventListener('dragleave', () => { if (--dragDepth <= 0) { veil.hidden = true; dragDepth = 0; } });
mw.addEventListener('dragover', e => e.preventDefault());
mw.addEventListener('drop', e => { e.preventDefault(); veil.hidden = true; dragDepth = 0; const id = e.dataTransfer.getData('application/x-block'); if (id) return openConfig(id); const f = e.dataTransfer.files?.[0]; if (f) uploadFile(f); });

// ---------- top bar
function clearAll() { for (const id of [...state.layers.keys()]) removeMapLayers(id); state.layers.clear(); drawLayerCards(); $('#legend').hidden = true; $('#reslist').innerHTML = ''; $('#results').hidden = true; $('#history').innerHTML = '<li class="empty">Analyses you run appear here.</li>'; state.cfg = null; showTab('layers'); requestAnimationFrame(() => map.resize()); }
function setGeo(g) { if (g === state.geo) return; state.geo = g; clearAll(); document.querySelectorAll('[data-geo]').forEach(b => b.classList.toggle('on', b.dataset.geo === g)); $('#guide').href = g + '/'; map.flyTo({ center: GEO[g].center, zoom: GEO[g].zoom }); history.replaceState(null, '', '#' + g); }
document.querySelectorAll('[data-geo]').forEach(b => b.onclick = () => setGeo(b.dataset.geo));
$('#reset').onclick = clearAll;
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { styleReady = false; map.setStyle(baseStyle()); map.once('style.load', () => { styleReady = true; state.layers.forEach(render); }); });
window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (GEO[h]) setGeo(h); });

buildTiles(); drawLayerCards();
const hashGeo = location.hash.slice(1); if (GEO[hashGeo]) setGeo(hashGeo);
// expose for the lab manual's screenshots and for curious students
window.LLui = { openConfig, loadDataset, showTab, runCfg: () => runCfg(state.cfg), setGeo };
