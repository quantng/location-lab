// GeoAI Studio II — network AI, geo-language, generative super-resolution and AI weather, in the browser.
// Data: METR-LA sensor graph (Li et al., DCRNN, MIT licence); gazetteer of places; EOX Sentinel-2 cloudless and Esri World Imagery;
// live forecasts from Open-Meteo (ECMWF AIFS and IFS, NOAA GFS; CC-BY 4.0). Optional look-ups from OpenStreetMap Nominatim.
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
let map, NET, GAZ, mode = 'net';
const st = { seed: null, k: 1, wxv: 'temperature_2m', wxData: null, wxPt: null };
const SAMPLES = {
  ggn: "Rain slowed traffic on Golf Course Road this morning. Commuters from Sector 54 said the metro was faster. Footfall at Cyber Hub restaurants rose after work, while the flyover near IFFCO Chowk stayed jammed till 9 pm. New warehouses on Sohna Road added to the evening trucks.",
  la: "Visitors left Santa Monica Pier for Venice Beach as the sun set. Traffic from LAX to Downtown LA crawled, and trucks queued at the Port of Los Angeles. Home prices in Beverly Hills and Bel Air stayed far above those in Compton.",
  india: "A quick-commerce firm opened dark stores in Powai and Bandra, then in Koramangala and Whitefield. In the NCR it added hubs in Udyog Vihar and Noida, close to IGI Airport.",
};
function busy(on) { $('#busy').hidden = !on; }
function legend(html) { const L = $('#legend'); if (!html) { L.hidden = true; return; } L.innerHTML = html; L.hidden = false; }
const sw = (c, l) => `<div class="sw"><i style="background:${c}"></i>${l}</div>`;
const FC = f => ({ type: 'FeatureCollection', features: f });

async function init() {
  [NET, GAZ] = await Promise.all([fetch('data/metr_la.json').then(r => r.json()), fetch('data/gazetteer.json').then(r => r.json())]);
  map = new maplibregl.Map({ container: 'map', style: 'https://tiles.openfreemap.org/styles/positron', center: [-118.36, 34.12], zoom: 10.4, attributionControl: { compact: false, customAttribution: 'METR-LA (Li et al. 2018) · Forecasts: Open-Meteo (ECMWF, NOAA) · Imagery: EOX Sentinel-2 cloudless, Esri World Imagery' } });
  window.__map = map;
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.on('load', () => {
    map.addSource('s2', { type: 'raster', tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg'], tileSize: 256, maxzoom: 15, attribution: 'Sentinel-2 cloudless 2024 by EOX IT Services GmbH (contains modified Copernicus Sentinel data)' });
    map.addSource('hr', { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19, attribution: 'Esri World Imagery: Esri, Maxar, Earthstar Geographics' });
    map.addLayer({ id: 's2', type: 'raster', source: 's2', layout: { visibility: 'none' }, paint: { 'raster-resampling': 'nearest' } });
    map.addLayer({ id: 'hr', type: 'raster', source: 'hr', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0 } });
    // network
    const lines = NET.edges.map(([i, j, w]) => ({ type: 'Feature', properties: { w }, geometry: { type: 'LineString', coordinates: [NET.sensors[i], NET.sensors[j]] } }));
    map.addSource('edges', { type: 'geojson', data: FC(lines) });
    map.addLayer({ id: 'edges', type: 'line', source: 'edges', paint: { 'line-color': '#1e3063', 'line-opacity': 0.35, 'line-width': ['*', 3, ['get', 'w']] } });
    map.addSource('sens', { type: 'geojson', data: FC([]) });
    map.addLayer({ id: 'sens', type: 'circle', source: 'sens', paint: { 'circle-radius': ['get', 'r'], 'circle-color': ['get', 'c'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.3 } });
    map.addSource('pins', { type: 'geojson', data: FC([]) });
    map.addLayer({ id: 'pins', type: 'circle', source: 'pins', paint: { 'circle-radius': 8, 'circle-color': ['get', 'c'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
    map.addLayer({ id: 'pins-lab', type: 'symbol', source: 'pins', layout: { 'text-field': ['get', 'n'], 'text-font': ['Noto Sans Bold'], 'text-size': 14, 'text-offset': [0.8, 0], 'text-anchor': 'left' }, paint: { 'text-color': '#14213d', 'text-halo-color': '#fff', 'text-halo-width': 2 } });
    map.on('click', 'sens', e => { if (mode === 'net') { st.seed = e.features[0].properties.i; rNet(); } });
    map.on('click', e => { if (mode === 'wx') { st.wxPt = [e.lngLat.lng, e.lngLat.lat]; loadWx(); } });
    map.on('mouseenter', 'sens', () => map.getCanvas().style.cursor = 'pointer'); map.on('mouseleave', 'sens', () => map.getCanvas().style.cursor = '');
    setup(); show('net');
  });
}
function setup() {
  $$('.ga-tabs button').forEach(b => b.onclick = () => show(b.dataset.t));
  $('#net-k').oninput = e => { st.k = +e.target.value; $('#net-kv').textContent = st.k; rNet(); };
  const deg = NET.sensors.map((_, i) => NET.edges.filter(e => e[0] === i || e[1] === i).length);
  const pick = { busiest: deg.indexOf(Math.max(...deg)), west: NET.sensors.reduce((b, s, i) => s[0] < NET.sensors[b][0] ? i : b, 0), east: NET.sensors.reduce((b, s, i) => s[0] > NET.sensors[b][0] ? i : b, 0) };
  $$('#p-net [data-s]').forEach(b => b.onclick = () => { st.seed = pick[b.dataset.s]; rNet(); });
  $$('#p-lang [data-x]').forEach(b => b.onclick = () => { $('#lang-txt').value = SAMPLES[b.dataset.x]; findPlaces(false); });
  $('#lang-txt').value = SAMPLES.ggn; $('#lang-run').onclick = () => findPlaces(false); $('#lang-osm').onclick = () => findPlaces(true);
  $('#gen-a').oninput = e => map.setPaintProperty('hr', 'raster-opacity', +e.target.value / 100);
  $$('#p-gen [data-f]').forEach(b => b.onclick = () => { const [x, y, z] = b.dataset.f.split(',').map(Number); map.jumpTo({ center: [x, y], zoom: z }); });
  $$('#wx-v button').forEach(b => b.onclick = () => { $$('#wx-v button').forEach(x => x.classList.toggle('on', x === b)); st.wxv = b.dataset.v; drawWx(); });
  $$('#p-wx [data-w]').forEach(b => b.onclick = () => { st.wxPt = b.dataset.w.split(',').map(Number); loadWx(); });
}
function show(t) {
  mode = t; $$('.ga-tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.t === t)); $$('.ga-pane').forEach(p => p.hidden = p.id !== 'p-' + t);
  const vis = (id, on) => map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
  vis('edges', t === 'net'); vis('sens', t === 'net'); vis('s2', t === 'gen'); vis('hr', t === 'gen'); vis('pins', t === 'lang' || t === 'wx'); vis('pins-lab', t === 'lang' || t === 'wx');
  map.getSource('pins').setData(FC([])); legend(null);
  if (t === 'net') { map.jumpTo({ center: [-118.36, 34.12], zoom: 10.4 }); rNet(); }
  if (t === 'lang') findPlaces(false);
  if (t === 'gen') { map.jumpTo({ center: [77.104, 28.442], zoom: 16 }); legend('<b>Two images of the same place</b>' + sw('#9aa58a', 'Slider left: Sentinel-2, 10 m per pixel (free)') + sw('#5a6b4a', 'Slider right: aerial, under 1 m per pixel')); }
  if (t === 'wx') { map.jumpTo({ center: [78, 22], zoom: 3.6 }); if (st.wxData) drawWx(); else { st.wxPt = [77.03, 28.46]; loadWx(); } }
}

// ---------- 5 network ----------
function hops(seed, K) {
  const h = new Map([[seed, 0]]); let fr = [seed];
  for (let k = 1; k <= K; k++) { const nf = []; for (const i of fr) for (const [a, b] of NET.edges) { const j = a === i ? b : b === i ? a : null; if (j != null && !h.has(j)) { h.set(j, k); nf.push(j); } } fr = nf; }
  return h;
}
const HC = ['#c00000', '#ef8a62', '#fdbf6f', '#c2a5cf', '#8073ac'];
function rNet() {
  const h = st.seed == null ? new Map() : hops(st.seed, st.k);
  map.getSource('sens').setData(FC(NET.sensors.map((c, i) => ({ type: 'Feature', properties: { i, c: h.has(i) ? HC[h.get(i)] : '#1f78b4', r: i === st.seed ? 10 : h.has(i) ? 7 : 5 }, geometry: { type: 'Point', coordinates: c } }))));
  legend('<b>Rounds of message passing</b>' + sw(HC[0], 'The sensor you picked') + [1, 2, 3, 4].map(k => sw(HC[k], `${k} step${k > 1 ? 's' : ''} away`)).join('') + sw('#1f78b4', 'Not reached yet'));
  if (st.seed == null) return;
  const n = [...h.values()].filter(v => v > 0).length;
  $('#net-out').innerHTML = `<h3>Sensor ${NET.ids[st.seed]}</h3>After <b>${st.k}</b> round${st.k === 1 ? '' : 's'}, it has heard from <b>${n}</b> other sensor${n === 1 ? '' : 's'}.<p class="ga-small">A graph neural network repeats this every time step: a slowdown upstream reaches this sensor's prediction before the cars do. Google Maps uses the same idea on road "supersegments" to predict arrival times.</p>`;
}

// ---------- 6 geo-language ----------
let osmCache = new Map();
async function osmLookup(q) {
  if (osmCache.has(q)) return osmCache.get(q);
  const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q), { headers: { 'Accept-Language': 'en' } }).then(r => r.json()).catch(() => []);
  const v = r && r[0] ? [+r[0].lon, +r[0].lat, r[0].display_name] : null; osmCache.set(q, v); await new Promise(res => setTimeout(res, 1100)); return v;
}
async function findPlaces(useOsm) {
  const txt = $('#lang-txt').value, found = [], names = Object.keys(GAZ).sort((a, b) => b.length - a.length);
  let masked = txt;
  for (const n of names) { const re = new RegExp('\\b' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g'); if (re.test(masked)) { found.push({ n, c: GAZ[n], src: 'gazetteer' }); masked = masked.replace(re, ' '.repeat(n.length)); } }
  if (useOsm) {
    busy(true);
    const cands = [...new Set((masked.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g) || []))].slice(0, 6);
    for (const q of cands) { const v = await osmLookup(q); if (v) found.push({ n: q, c: [v[0], v[1]], src: 'OpenStreetMap' }); }
    busy(false);
  }
  let html = txt.replace(/[&<>]/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[s]));
  for (const f of [...found].sort((a, b) => b.n.length - a.n.length)) html = html.split(f.n).join(`<mark style="background:${f.src === 'gazetteer' ? '#fde0dd' : '#e0ecf8'};color:${f.src === 'gazetteer' ? '#c00000' : '#1e3063'};font-weight:700">${f.n}</mark>`);
  $('#lang-out').innerHTML = `<p style="margin:0 0 8px">${html}</p><table><tr><th>Place</th><th class="n">Latitude</th><th class="n">Longitude</th><th>From</th></tr>${found.map(f => `<tr><td>${f.n}</td><td class="n">${f.c[1].toFixed(4)}</td><td class="n">${f.c[0].toFixed(4)}</td><td>${f.src}</td></tr>`).join('')}</table>`;
  map.getSource('pins').setData(FC(found.map(f => ({ type: 'Feature', properties: { n: f.n, c: f.src === 'gazetteer' ? '#c00000' : '#1e3063' }, geometry: { type: 'Point', coordinates: f.c } }))));
  if (found.length) { const b = new maplibregl.LngLatBounds(); found.forEach(f => b.extend(f.c)); map.fitBounds(b, { padding: 90, maxZoom: 13, duration: 0 }); }
  legend('<b>Places found</b>' + sw('#c00000', 'Matched in the lab gazetteer') + sw('#1e3063', 'Looked up in OpenStreetMap'));
}

// ---------- 8 AI weather ----------
const MODELS = [['ecmwf_aifs025_single', 'ECMWF AIFS (AI)', '#c00000'], ['ecmwf_ifs025', 'ECMWF IFS (physics)', '#1e3063'], ['gfs_seamless', 'NOAA GFS (physics)', '#8c8c8c']];
async function loadWx() {
  const [lo, la] = st.wxPt; busy(true);
  map.getSource('pins').setData(FC([{ type: 'Feature', properties: { n: `${la.toFixed(2)}, ${lo.toFixed(2)}`, c: '#c00000' }, geometry: { type: 'Point', coordinates: [lo, la] } }]));
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${la.toFixed(3)}&longitude=${lo.toFixed(3)}&hourly=temperature_2m,precipitation,wind_speed_10m&models=${MODELS.map(m => m[0]).join(',')}&forecast_days=7&timezone=auto`;
  try { st.wxData = await fetch(url).then(r => r.json()); } catch (e) { $('#wx-out').textContent = 'Could not reach Open-Meteo. Check your connection and try again.'; busy(false); return; }
  busy(false); drawWx();
}
function drawWx() {
  const d = st.wxData; if (!d || !d.hourly) return;
  const cv = $('#wx-c'), g = cv.getContext('2d'), W = cv.width, H = cv.height, P = { l: 70, r: 20, t: 20, b: 60 };
  g.clearRect(0, 0, W, H);
  const T = d.hourly.time, series = MODELS.map(([m, lab, c]) => ({ lab, c, v: d.hourly[`${st.wxv}_${m}`] || [] }));
  const all = series.flatMap(s => s.v).filter(v => v != null); if (!all.length) return;
  let lo = Math.min(...all), hi = Math.max(...all); if (st.wxv !== 'temperature_2m') lo = 0; if (hi - lo < 1) hi = lo + 1;
  const X = i => P.l + i / (T.length - 1) * (W - P.l - P.r), Y = v => H - P.b - (v - lo) / (hi - lo) * (H - P.t - P.b);
  g.strokeStyle = '#e5e5e5'; g.fillStyle = '#4a5568'; g.font = '18px Segoe UI, Arial'; g.textAlign = 'right';
  for (let k = 0; k <= 4; k++) { const v = lo + (hi - lo) * k / 4; g.beginPath(); g.moveTo(P.l, Y(v)); g.lineTo(W - P.r, Y(v)); g.stroke(); g.fillText(v.toFixed(st.wxv === 'precipitation' ? 1 : 0), P.l - 8, Y(v) + 6); }
  g.textAlign = 'center'; T.forEach((t, i) => { if (t.endsWith('T12:00')) g.fillText(new Date(t).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }), X(i), H - P.b + 28); });
  series.forEach(s => { g.strokeStyle = s.c; g.lineWidth = s.lab.includes('AI') ? 3.5 : 2.2; g.beginPath(); let m = false; s.v.forEach((v, i) => { if (v == null) { m = false; return; } m ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)); m = true; }); g.stroke(); });
  const unit = { temperature_2m: '°C', precipitation: 'mm per hour', wind_speed_10m: 'km/h' }[st.wxv];
  g.textAlign = 'left'; g.font = 'bold 18px Segoe UI, Arial'; series.forEach((s, k) => { g.fillStyle = s.c; g.fillText(s.lab, P.l + 10 + k * 245, P.t + 6); });
  const day = series.map(s => { const v = s.v.slice(0, 24).filter(x => x != null); return st.wxv === 'precipitation' ? v.reduce((a, b) => a + b, 0) : Math.max(...v); });
  const lab = st.wxv === 'precipitation' ? 'Rain over the next 24 hours' : 'Highest value in the next 24 hours';
  $('#wx-out').innerHTML = `<h3>${d.latitude.toFixed(2)}, ${d.longitude.toFixed(2)} · ${unit}</h3><table><tr><th>${lab}</th><th class="n">Value</th></tr>${series.map((s, k) => `<tr><td style="color:${s.c};font-weight:700">${s.lab}</td><td class="n">${isFinite(day[k]) ? day[k].toFixed(1) : '–'}</td></tr>`).join('')}</table><p class="ga-small">Spread between the three = how sure the forecast is. Data: Open-Meteo (CC-BY 4.0), models by ECMWF and NOAA.</p>`;
}
init();
