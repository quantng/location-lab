// blocks.js — every block: what it does, its parameters and its run()
export const GROUPS = [
  { id: 'data', name: 'Data', sub: 'Load, upload, explore, export', c: '--g-data' },
  { id: 'sd', name: 'Spatial data', sub: 'Last session’s seven moves', c: '--g-out' },
  { id: 'near', name: 'Neighbours', sub: 'Who counts as “near”', c: '--g-near' },
  { id: 'pat', name: 'Patterns', sub: 'Random, clustered or dispersed?', c: '--g-pat' },
  { id: 'hot', name: 'Hotspots & clusters', sub: 'Where, exactly', c: '--g-hot' },
  { id: 'surf', name: 'Surfaces', sub: 'From samples to everywhere', c: '--g-surf' },
  { id: 'reg', name: 'Explain', sub: 'Spatial regression', c: '--g-reg' },
];

const lay = (label = 'Layer', kinds = ['point', 'polygon'], extra = {}) => ({ k: 'layer', label, type: 'layer', kinds, ...extra });
const ptLayer = (label = 'Points') => lay(label, ['point']);
const wLayer = () => lay('Layer with weights', ['point', 'polygon'], { prefer: 'W' });
const getL = (ctx, id, need) => { const L = ctx.state.layers.get(id); if (!L) throw new Error(`Load ${need || 'a layer'} first.`); return L; };
const needW = L => { if (!L.W) throw new Error(`“${L.name}” has no neighbours yet. Add a Weights block first.`); };
const pointLL = (p, ctx) => p.point === 'custom' && p._pt ? p._pt : ctx.anchor(p.point).ll;
const pointName = (p, ctx) => p.point === 'custom' ? 'your point' : ctx.anchor(p.point).name;
function dl(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.textContent = `Download ${name}`; a.className = 'ghost'; a.style.display = 'inline-block'; return a; }
let manifest = null;
async function getManifest() { if (!manifest) { try { manifest = await (await fetch('data/manifest.json')).json(); } catch { manifest = {}; } } return manifest; }
function seqStops(v) { const s = v.filter(Number.isFinite).sort((a, b) => a - b), q = t => s[Math.floor(t * (s.length - 1))]; return [[q(0.02), '#f1eef6'], [q(0.25), '#bdc9e1'], [q(0.5), '#74a9cf'], [q(0.75), '#2b8cbe'], [q(0.98), '#023858']]; }
function seStops(v) { const s = v.filter(Number.isFinite).sort((a, b) => a - b), q = t => s[Math.floor(t * (s.length - 1))]; return [[q(0.02), '#fff7ec'], [q(0.5), '#fdbb84'], [q(0.98), '#b30000']]; }
function makeGrid(ctx, xy, cellKm, pad = 0.02) {
  const b = ctx.S.bbox(xy), w = b[2] - b[0], h = b[3] - b[1];
  const x0 = b[0] - w * pad, y0 = b[1] - h * pad, x1 = b[2] + w * pad, y1 = b[3] + h * pad;
  const nx = Math.max(10, Math.min(260, Math.round((x1 - x0) / cellKm))), ny = Math.max(10, Math.min(260, Math.round((y1 - y0) / cellKm)));
  const P = ctx.proj(), [lo0, la0] = P.inv(x0, y0), [lo1, la1] = P.inv(x1, y1);
  return { x0, y0, x1, y1, nx, ny, dx: (x1 - x0) / nx, dy: (y1 - y0) / ny, bboxLL: [lo0, la0, lo1, la1] };
}
function hullMask(ctx, xy, grid) { const hull = ctx.S.convexHull(xy); const m = new Uint8Array(grid.nx * grid.ny); for (let j = 0; j < grid.ny; j++) for (let i = 0; i < grid.nx; i++) m[j * grid.nx + i] = ctx.S.pointInRing(grid.x0 + (i + .5) * grid.dx, grid.y1 - (j + .5) * grid.dy, hull) ? 1 : 0; return m; }
function coefTable(ctx, r, extraRows = []) {
  const star = p => p < 0.01 ? '***' : p < 0.05 ? '**' : p < 0.1 ? '*' : '';
  return ctx.C.table(['Variable', 'Coefficient', 'Std. error', 'p-value', ''], r.names.map((n, i) => [n, ctx.fmt(r.b[i]), ctx.fmt(r.se[i]), r.p[i] < 0.001 ? '<0.001' : r.p[i].toFixed(3), star(r.p[i])]).concat(extraRows));
}
function regData(ctx, L, y, xs) {
  if (!y) throw new Error('Choose the variable to explain (y).'); if (!xs?.length) throw new Error('Tick at least one explanatory variable.');
  const P = ctx.props(L), keep = P.map((p, i) => [p[y], ...xs.map(x => p[x])].every(v => Number.isFinite(+v)) ? i : -1).filter(i => i >= 0);
  if (keep.length < xs.length + 5) throw new Error('Too few complete rows for this regression.');
  return { keep, Y: keep.map(i => +P[i][y]), X: keep.map(i => xs.map(x => +P[i][x])) };
}
function subW(W, keep) { if (keep.length === W.n) return W; const m = new Map(keep.map((k, i) => [k, i])); const nb = keep.map(k => W.nb[k].filter(j => m.has(j)).map(j => m.get(j))); return { n: keep.length, nb, wt: nb.map(a => a.map(() => 1 / Math.max(1, a.length))), label: W.label }; }
const isNum = (ctx, p, f) => { const L = ctx.state.layers.get(p.layer); return !!(L && f && ctx.numFields(L).includes(f)); };
const uniq = (ctx, p, f) => { const L = ctx.state.layers.get(p.layer); if (!L || !f) return [['', '—']]; const c = new Map(); for (const ft of L.fc.features) { const v = String(ft.properties[f] ?? ''); c.set(v, (c.get(v) || 0) + 1); } return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([v, n]) => [v, `${v === '' ? '(blank)' : v} · ${n}`]); };
const pfmt = p => p < 0.001 ? '< 0.001' : p.toFixed(3);

export const BLOCKS = [
  // ------------------------------------------------------------ DATA
  { id: 'load', group: 'data', name: 'Load sample data', what: 'Open a bundled dataset in the format you choose and compare file sizes.',
    params: [
      { k: 'dataset', label: 'Dataset', type: 'select', options: ctx => ctx.geo().data.map(d => [d.key, d.name]) },
      { k: 'format', label: 'Format', type: 'select', options: (ctx, p) => ctx.geo().data.find(d => d.key === p.dataset)?.tif ? [['tif', 'Cloud-Optimised GeoTIFF (COG)']] : [['geojson', 'GeoJSON'], ['parquet', 'GeoParquet'], ['fgb', 'FlatGeobuf']], def: 'geojson' },
    ],
    async run(p, ctx) {
      const D = ctx.geo().data.find(d => d.key === p.dataset); const fmt = D.tif ? 'tif' : p.format; const url = `data/${ctx.state.geo}/${D.key}.${fmt}`;
      const t0 = performance.now(); const r = await fetch(url); if (!r.ok) throw new Error(`Could not fetch ${url}`); const buf = await r.arrayBuffer(); const t1 = performance.now();
      const obj = await ctx.readAny(buf, url); const t2 = performance.now();
      const M = (await getManifest())[`${ctx.state.geo}/${D.key}`] || {};
      let L;
      if (obj.raster) L = ctx.addLayer({ id: D.key, name: D.name, kind: 'raster', raster: obj, style: {} });
      else { const kind = ctx.kindOf(obj); L = ctx.addLayer({ id: D.key, name: D.name, kind, fc: obj, style: kind === 'polygon' ? { mode: 'single', opacity: 0.05 } : { mode: 'single' } }); }
      ctx.fit(L);
      const kb = b => b >= 1024 * 1024 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB';
      const sizes = Object.entries(M).map(([f, b]) => `<tr><td>${{ geojson: 'GeoJSON', parquet: 'GeoParquet', fgb: 'FlatGeobuf', tif: 'COG' }[f]}</td><td>${kb(b)}</td><td>${f === fmt ? '← loaded' : ''}</td></tr>`).join('');
      const rows = obj.raster ? `${obj.w} × ${obj.h} pixels` : `${obj.features.length.toLocaleString()} rows`;
      const note = { geojson: 'GeoJSON is plain text: easy to read, slow and large at scale.', parquet: 'GeoParquet stores each column together and compresses it: the modern standard for big vector tables.', fgb: 'FlatGeobuf carries a built-in spatial index, so a server can send just the part of the file you need.', tif: `A COG is a GeoTIFF laid out in ${obj.tile || 256}-pixel tiles with overviews, so tools fetch only the tiles on screen.` }[fmt];
      return { html: `<div class="kpis">${ctx.kpi(rows.split(' ')[0], rows.split(' ').slice(1).join(' '))}${ctx.kpi(kb(buf.byteLength), 'file size')}${ctx.kpi(Math.round(t2 - t1) + ' ms', 'parse time')}</div>${sizes ? `<div class="tblwrap"><table class="tbl"><thead><tr><th>Same data as</th><th>Size</th><th></th></tr></thead><tbody>${sizes}</tbody></table></div>` : ''}<div class="status">Source: ${ctx.esc(D.src)}</div>`, read: note };
    } },
  { id: 'upload', group: 'data', name: 'Upload your file', what: 'CSV with latitude/longitude, GeoJSON, GeoParquet, FlatGeobuf or GeoTIFF. Stays on your laptop.',
    params: [{ k: 'file', label: 'File', type: 'file' }],
    async run(p, ctx) {
      if (!p.file) throw new Error('Choose a file first.');
      const buf = await p.file.arrayBuffer(), obj = await ctx.readAny(buf, p.file.name), id = p.file.name.replace(/\W+/g, '_');
      const L = obj.raster ? ctx.addLayer({ id, name: p.file.name, kind: 'raster', raster: obj, style: {} }) : ctx.addLayer({ id, name: p.file.name, kind: ctx.kindOf(obj), fc: obj });
      ctx.fit(L); return { html: `<div class="kpis">${ctx.kpi(obj.raster ? obj.w + '×' + obj.h : obj.features.length.toLocaleString(), obj.raster ? 'pixels' : 'rows')}</div>` };
    } },
  { id: 'explore', group: 'data', name: 'Explore the table', what: 'Fields, blanks and a preview. Optionally colour the map by a category.',
    params: [lay(), { k: 'colour', label: 'Colour by', type: 'field', of: 'layer', optional: true }],
    async run(p, ctx) {
      const L = getL(ctx, p.layer), P = ctx.props(L), keys = ctx.allFields(L);
      const rows = keys.map(k => { const v = P.map(r => r[k]); const blank = v.filter(x => x === null || x === undefined || x === '').length; const num = v.every(x => x === '' || x == null || typeof x === 'number'); return [k, num ? 'number' : 'text', new Set(v).size.toLocaleString(), blank ? `<b>${blank}</b>` : '0']; });
      if (p.colour) ctx.restyle(L, { mode: 'cat', field: p.colour });
      const prev = ctx.C.table(keys.slice(0, 6), P.slice(0, 6).map(r => keys.slice(0, 6).map(k => ctx.esc(typeof r[k] === 'number' ? ctx.fmt(r[k]) : r[k] ?? ''))));
      const blanks = rows.filter(r => r[3] !== '0');
      return { nodes: [ctx.C.table(['Field', 'Type', 'Unique', 'Blank'], rows), prev], read: blanks.length ? `Locations are complete for all ${P.length.toLocaleString()} rows, but ${blanks.map(r => `<b>${r[0]}</b> is blank in ${r[3].replace(/<\/?b>/g, '')}`).join(', ')}. Check attributes before deciding anything.` : `No blanks in ${P.length.toLocaleString()} rows.` };
    } },
  { id: 'style', group: 'data', name: 'Colour the map', what: 'Colour any layer by a field: categories, a sequence, or above/below zero.',
    params: [lay(), { k: 'field', label: 'Field', type: 'field', of: 'layer' }, { k: 'scheme', label: 'Scheme', type: 'select', options: [['auto', 'Automatic'], ['cat', 'Categories'], ['seq', 'Low → high'], ['div', 'Below / above zero']] }],
    async run(p, ctx) { const L = getL(ctx, p.layer); const v = ctx.vals(L, p.field); const num = v.some(Number.isFinite); const mode = p.scheme === 'auto' ? (num ? (v.some(x => x < 0) && v.some(x => x > 0) ? 'div' : 'seq') : 'cat') : p.scheme; ctx.restyle(L, { mode, field: p.field }); return { html: `<div class="status">Map coloured by ${ctx.esc(p.field)}.</div>` }; } },
  { id: 'export', group: 'data', name: 'Download a layer', what: 'Save any layer, with every field you added, as CSV or GeoJSON.',
    params: [lay('Layer', ['point', 'polygon', 'line']), { k: 'fmt', label: 'Format', type: 'select', options: [['csv', 'CSV'], ['geojson', 'GeoJSON']] }],
    async run(p, ctx) { const L = getL(ctx, p.layer); const a = p.fmt === 'csv' ? dl(`${L.id}.csv`, ctx.toCSV(L.fc), 'text/csv') : dl(`${L.id}.geojson`, JSON.stringify(L.fc), 'application/geo+json'); return { nodes: [a] }; } },

  // ------------------------------------------------------------ SPATIAL DATA (session 1)
  { id: 'nearest', group: 'sd', name: 'Nearest to a point', what: 'Distance from a chosen point to every feature over the curved Earth, with 1, 3 and 5 km rings.',
    params: [lay(), { k: 'point', label: 'From', type: 'point' }, { k: 'k', label: 'Show nearest', type: 'number', def: 5, min: 1 }],
    async run(p, ctx) {
      const L = getL(ctx, p.layer), [lon, lat] = pointLL(p, ctx), ll = ctx.lonlat(L);
      L.fc.features.forEach((f, i) => { f.properties.dist_km = +ctx.S.haversine(lat, lon, ll[i][1], ll[i][0]).toFixed(3); f.properties._near5 = f.properties.dist_km <= 5; });
      const rings = { type: 'FeatureCollection', features: [1, 3, 5].map(km => ({ type: 'Feature', properties: { km }, geometry: { type: 'LineString', coordinates: ctx.circlePoly(lon, lat, km) } })).concat([{ type: 'Feature', properties: { name: pointName(p, ctx) }, geometry: { type: 'Point', coordinates: [lon, lat] } }]) };
      ctx.addLayer({ id: 'rings', helper: true, name: `Rings around ${pointName(p, ctx)}`, kind: 'line', fc: { type: 'FeatureCollection', features: rings.features.slice(0, 3) }, style: { mode: 'single', color: ctx.css('--ink') } });
      ctx.addLayer({ id: 'origin', helper: true, name: pointName(p, ctx), kind: 'point', fc: { type: 'FeatureCollection', features: [rings.features[3]] }, style: { mode: 'single', color: ctx.css('--ink'), radius: 8 } });
      ctx.restyle(L, { mode: 'seq', field: 'dist_km' });
      const sorted = L.fc.features.map(f => f.properties).sort((a, b) => a.dist_km - b.dist_km);
      const nameK = Object.keys(sorted[0]).find(k => /name/i.test(k)) || Object.keys(sorted[0])[0];
      const c = km => sorted.filter(r => r.dist_km <= km).length;
      ctx.map.flyTo({ center: [lon, lat], zoom: 11.5 });
      return { html: `<div class="kpis">${ctx.kpi(c(1), 'within 1 km')}${ctx.kpi(c(3), 'within 3 km')}${ctx.kpi(c(5), 'within 5 km')}</div>`, nodes: [ctx.C.table(['#', 'Name', 'km'], sorted.slice(0, p.k).map((r, i) => [i + 1, ctx.esc(r[nameK] || '(no name)'), r.dist_km.toFixed(2)]))], read: `Nearest to ${ctx.esc(pointName(p, ctx))}: <b>${ctx.esc(sorted[0][nameK] || '(no name)')}</b>, ${sorted[0].dist_km.toFixed(2)} km. A new field <b>dist_km</b> was added to every row.` };
    } },
  { id: 'sql', group: 'sd', name: 'Ask in SQL', what: 'Query any layer with SQL (DuckDB, running in your browser). The layer name is the table name.',
    params: [{ k: 'q', label: 'SQL query', type: 'text', def: ctx => { const L = [...ctx.state.layers.values()].reverse().find(l => l.kind === 'point'); const t = L ? L.id : 'my_table'; const a = ctx.geo().points[0]; const nm = L ? (ctx.allFields(L).find(k => /^name$/i.test(k)) || ctx.allFields(L)[0]) : 'name'; return `-- distance in km from ${a.name}, over the curved Earth (haversine)\nSELECT ${nm},\n  round(2 * 6371 * asin(sqrt(\n    pow(sin(radians(latitude - ${a.ll[1]}) / 2), 2) +\n    cos(radians(${a.ll[1]})) * cos(radians(latitude)) *\n    pow(sin(radians(longitude - ${a.ll[0]}) / 2), 2))), 2) AS km,\n  latitude, longitude\nFROM ${t}\nORDER BY km\nLIMIT 5;`; } }],
    async run(p, ctx, say) {
      say('Starting DuckDB in your browser (first time takes a few seconds)…');
      if (!ctx.state.duck) {
        const duckdb = await import('https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/+esm');
        const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
        const wurl = URL.createObjectURL(new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' }));
        const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), new Worker(wurl)); await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
        ctx.state.duck = { db, conn: await db.connect(), loaded: new Set() };
      }
      const { db, conn } = ctx.state.duck;
      for (const L of ctx.state.layers.values()) { if (L.kind === 'raster' || !p.q.includes(L.id)) continue;
        const rows = L.fc.features.map(f => { const o = {}; for (const [k, v] of Object.entries(f.properties)) if (!k.startsWith('_')) o[k] = v; const c = ctx.centroid(f.geometry); o.longitude ??= c[0]; o.latitude ??= c[1]; return o; });
        await conn.query(`DROP TABLE IF EXISTS ${L.id}`); await db.registerFileText(`${L.id}.json`, JSON.stringify(rows)); await conn.insertJSONFromPath(`${L.id}.json`, { name: L.id }); }
      say('Running query…');
      const res = await conn.query(p.q); const rows = res.toArray().map(r => r.toJSON()); const cols = res.schema.fields.map(f => f.name);
      const nodes = [ctx.C.table(cols, rows.slice(0, 200).map(r => cols.map(c => ctx.esc(typeof r[c] === 'number' ? ctx.fmt(r[c]) : typeof r[c] === 'bigint' ? Number(r[c]) : r[c]))))];
      if (cols.includes('latitude') && cols.includes('longitude')) {
        const b = document.createElement('button'); b.className = 'ghost'; b.textContent = 'Add result to map';
        b.onclick = () => { const fc = { type: 'FeatureCollection', features: rows.map(r => ({ type: 'Feature', properties: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v])), geometry: { type: 'Point', coordinates: [+r.longitude, +r.latitude] } })) }; const L = ctx.addLayer({ id: 'query_result', helper: true, name: `Query result (${rows.length})`, kind: 'point', fc, style: { mode: 'single', color: ctx.css('--g-hot'), radius: 8 } }); ctx.fit(L); };
        nodes.push(b);
      }
      return { html: `<div class="status">${rows.length} row${rows.length === 1 ? '' : 's'}</div>`, nodes };
    } },
  { id: 'filter', group: 'sd', name: 'Filter features', what: 'Keep only the features that meet up to four conditions, optionally the top N by a field. Makes a new layer you can use in any other tool.',
    params: [lay('Layer', ['point', 'polygon']),
      { k: 'f1', label: 'Condition 1: field', type: 'field', of: 'layer', optional: false },
      { k: 'o1', label: '… is', type: 'select', options: [['eq', 'is / ='], ['ne', 'is not / ≠'], ['lt', '<'], ['le', '≤'], ['gt', '>'], ['ge', '≥']], show: p => !!p.f1 },
      { k: 'c1', label: '… value', type: 'select', options: (ctx, p) => uniq(ctx, p, p.f1), show: (p, ctx) => !!p.f1 && !isNum(ctx, p, p.f1) },
      { k: 'n1', label: '… number', type: 'number', def: 0, step: 0.1, show: (p, ctx) => !!p.f1 && isNum(ctx, p, p.f1) },
      { k: 'f2', label: 'Condition 2: field', type: 'field', of: 'layer', optional: true, show: p => !!p.f1 },
      { k: 'o2', label: '… is', type: 'select', options: [['eq', 'is / ='], ['ne', 'is not / ≠'], ['lt', '<'], ['le', '≤'], ['gt', '>'], ['ge', '≥']], show: p => !!p.f2 },
      { k: 'c2', label: '… value', type: 'select', options: (ctx, p) => uniq(ctx, p, p.f2), show: (p, ctx) => !!p.f2 && !isNum(ctx, p, p.f2) },
      { k: 'n2', label: '… number', type: 'number', def: 0, step: 0.1, show: (p, ctx) => !!p.f2 && isNum(ctx, p, p.f2) },
      { k: 'f3', label: 'Condition 3: field', type: 'field', of: 'layer', optional: true, show: p => !!p.f2 },
      { k: 'o3', label: '… is', type: 'select', options: [['eq', 'is / ='], ['ne', 'is not / ≠'], ['lt', '<'], ['le', '≤'], ['gt', '>'], ['ge', '≥']], show: p => !!p.f3 },
      { k: 'c3', label: '… value', type: 'select', options: (ctx, p) => uniq(ctx, p, p.f3), show: (p, ctx) => !!p.f3 && !isNum(ctx, p, p.f3) },
      { k: 'n3', label: '… number', type: 'number', def: 0, step: 0.1, show: (p, ctx) => !!p.f3 && isNum(ctx, p, p.f3) },
      { k: 'f4', label: 'Condition 4: field', type: 'field', of: 'layer', optional: true, show: p => !!p.f3 },
      { k: 'o4', label: '… is', type: 'select', options: [['eq', 'is / ='], ['ne', 'is not / ≠'], ['lt', '<'], ['le', '≤'], ['gt', '>'], ['ge', '≥']], show: p => !!p.f4 },
      { k: 'c4', label: '… value', type: 'select', options: (ctx, p) => uniq(ctx, p, p.f4), show: (p, ctx) => !!p.f4 && !isNum(ctx, p, p.f4) },
      { k: 'n4', label: '… number', type: 'number', def: 0, step: 0.1, show: (p, ctx) => !!p.f4 && isNum(ctx, p, p.f4) },
      { k: 'sort', label: 'Then keep the top … by', type: 'field', of: 'layer', numeric: true, optional: true },
      { k: 'top', label: 'How many (0 = all)', type: 'number', def: 0, min: 0, show: p => !!p.sort },
      { k: 'name', label: 'Name the new layer', type: 'str', def: '' }],
    async run(p, ctx) {
      const L = getL(ctx, p.layer); if (!p.f1) throw new Error('Choose at least one field to filter on.');
      const conds = [1, 2, 3, 4].filter(n => p['f' + n]).map(n => { const f = p['f' + n], num = isNum(ctx, p, f); return { f, op: p['o' + n] || 'eq', num, v: num ? +p['n' + n] : String(p['c' + n] ?? '') }; });
      const test = (pr, c) => { const x = pr[c.f]; if (c.num) { const a = +x; if (!Number.isFinite(a)) return false; return { eq: a === c.v, ne: a !== c.v, lt: a < c.v, le: a <= c.v, gt: a > c.v, ge: a >= c.v }[c.op]; }
        const s = String(x ?? ''); return { eq: s === c.v, ne: s !== c.v, lt: s < c.v, le: s <= c.v, gt: s > c.v, ge: s >= c.v }[c.op]; };
      let feats = L.fc.features.filter(f => conds.every(c => test(f.properties, c)));
      if (p.sort) { feats = feats.slice().sort((a, b) => (+b.properties[p.sort] || -Infinity) - (+a.properties[p.sort] || -Infinity)); if (p.top > 0) feats = feats.slice(0, p.top); }
      if (!feats.length) throw new Error('No features meet these conditions. Loosen one of them.');
      const sym = { eq: '=', ne: '≠', lt: '<', le: '≤', gt: '>', ge: '≥' };
      const desc = conds.map(c => `${c.f} ${sym[c.op]} ${c.v}`).join(' · ') + (p.sort ? ` · top ${p.top || 'all'} by ${p.sort}` : '');
      ctx.state.nFilter = (ctx.state.nFilter || 0) + 1;
      const nm = (p.name || '').trim() || `Filter ${ctx.state.nFilter}: ${L.name.split(' (')[0]}`;
      const N = ctx.addLayer({ id: 'filter' + ctx.state.nFilter, name: `${nm} (${feats.length})`, kind: L.kind, fc: { type: 'FeatureCollection', features: feats.map(f => ({ type: 'Feature', properties: { ...f.properties }, geometry: f.geometry })) }, style: L.kind === 'point' ? { mode: 'single', color: ctx.css('--g-hot'), radius: 7 } : { mode: 'single', color: ctx.css('--g-hot') } });
      ctx.fit(N);
      return { html: `<div class="kpis">${ctx.kpi(feats.length.toLocaleString(), 'kept')}${ctx.kpi(L.fc.features.length.toLocaleString(), 'in the layer')}</div>`, read: `Kept features where <b>${ctx.esc(desc)}</b>. The new layer <b>${ctx.esc(nm)}</b> works in every other tool: DBSCAN, Distance to nearest, weights.` };
    } },
  { id: 'boxdist', group: 'sd', name: 'Box filter, then distance', what: 'A cheap square filter first, then the exact distance on what is left: how spatial indexes work.',
    params: [lay(), { k: 'point', label: 'Centre', type: 'point' }, { k: 'km', label: 'Radius (km)', type: 'number', def: 3, step: 0.5, min: 0.1 }],
    async run(p, ctx) {
      const L = getL(ctx, p.layer), [lon, lat] = pointLL(p, ctx), ll = ctx.lonlat(L);
      const dla = p.km / 110.574, dlo = p.km / (111.32 * Math.cos(lat * Math.PI / 180));
      let inBox = 0, inC = 0;
      L.fc.features.forEach((f, i) => { const [x, y] = ll[i]; const b = Math.abs(y - lat) <= dla && Math.abs(x - lon) <= dlo; const d = ctx.S.haversine(lat, lon, y, x); const c = b && d <= p.km; inBox += b; inC += c; f.properties.zone = c ? 'inside circle' : b ? 'box corner' : 'outside'; });
      const sq = [[lon - dlo, lat - dla], [lon + dlo, lat - dla], [lon + dlo, lat + dla], [lon - dlo, lat + dla], [lon - dlo, lat - dla]];
      ctx.addLayer({ id: 'search_area', helper: true, name: `Box and ${p.km} km circle`, kind: 'line', fc: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: sq } }, { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: ctx.circlePoly(lon, lat, p.km) } }] }, style: { mode: 'single', color: ctx.css('--ink') } });
      ctx.restyle(L, { mode: 'cat', field: 'zone', keys: ['inside circle', 'box corner', 'outside'], colors: { 'inside circle': ctx.css('--accent'), 'box corner': ctx.css('--g-hot'), outside: ctx.css('--ns') } });
      ctx.map.flyTo({ center: [lon, lat], zoom: 12 });
      return { html: `<div class="kpis">${ctx.kpi(inBox, 'in the box')}${ctx.kpi(inC, `within ${p.km} km`)}${ctx.kpi(inBox - inC, 'dropped from corners')}</div>`, read: `Step 1 used four cheap number comparisons per row. Step 2 computed the exact distance only for the <b>${inBox}</b> rows in the box, not all ${L.fc.features.length.toLocaleString()}.` };
    } },
  { id: 'join', group: 'sd', name: 'Spatial join', what: 'Tag each point with the polygon it falls inside, and count points per polygon.',
    params: [lay('Points', ['point'], { prefer: ['cafes', 'hawker', 'hdb'] }), lay('Polygons', ['polygon'], { k: 'poly', prefer: ['district', 'planning'] }), { k: 'namef', label: 'Polygon name field', type: 'field', of: 'poly', prefer: ['district', 'PLN_AREA_N', 'name'] }],
    async run(p, ctx) {
      const L = getL(ctx, p.layer, 'points'), G = getL(ctx, p.poly, 'polygons');
      const polys = G.fc.features.map(f => ({ name: f.properties[p.namef], rings: f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates }));
      const cnt = new Map(); const ll = ctx.lonlat(L);
      L.fc.features.forEach((f, i) => { const [x, y] = ll[i]; const hit = polys.find(P => P.rings.some(r => ctx.S.pointInRing(x, y, r[0]) && !r.slice(1).some(h => ctx.S.pointInRing(x, y, h)))); f.properties[p.namef] = hit ? hit.name : 'outside'; cnt.set(f.properties[p.namef], (cnt.get(f.properties[p.namef]) || 0) + 1); });
      G.fc.features.forEach(f => f.properties.n_points = cnt.get(f.properties[p.namef]) || 0);
      ctx.restyle(G, { mode: 'seq', field: 'n_points' }); ctx.restyle(L, { mode: 'single', color: ctx.css('--ink'), radius: 3 });
      const items = [...cnt.entries()].sort((a, b) => b[1] - a[1]);
      return { nodes: [ctx.C.bars(items.slice(0, 12))], read: `${items.length} polygons received points. The field <b>${ctx.esc(p.namef)}</b> was added to each point; <b>n_points</b> to each polygon.${cnt.get('outside') ? ` ${cnt.get('outside')} points fall outside every polygon.` : ''}` };
    } },
  { id: 'h3bin', group: 'sd', name: 'H3 hexagon bins', what: 'Drop points into Uber’s global hexagon grid and count per cell. Optionally include empty cells.',
    params: [lay('Points', ['point']), { k: 'res', label: 'Resolution', type: 'select', options: [['6', '6 · ~36 km² cells'], ['7', '7 · ~5 km²'], ['8', '8 · ~0.74 km²'], ['9', '9 · ~0.1 km²']], def: '8' }, { k: 'meanf', label: 'Also average', type: 'field', of: 'layer', numeric: true, optional: true }, { k: 'zeros', label: 'Empty cells', type: 'select', options: [['no', 'Leave out'], ['yes', 'Include (needed for statistics)']] }, { k: 'extrude', label: '3D columns', type: 'select', options: [['no', 'No'], ['yes', 'Yes']] }],
    async run(p, ctx) {
      const L = getL(ctx, p.layer, 'points'), res = +p.res, ll = ctx.lonlat(L), h3 = ctx.h3, agg = new Map();
      ll.forEach(([x, y], i) => { const c = h3.latLngToCell(y, x, res); const a = agg.get(c) || { n: 0, s: 0, m: 0 }; a.n++; if (p.meanf) { const v = +L.fc.features[i].properties[p.meanf]; if (Number.isFinite(v)) { a.s += v; a.m++; } } agg.set(c, a); });
      if (p.zeros === 'yes') { const xs = ll.map(q => q[0]).sort((a, b) => a - b), ys = ll.map(q => q[1]).sort((a, b) => a - b), q = (a, t) => a[Math.floor(t * (a.length - 1))];
        const [w, s, e, n] = [q(xs, 0.01), q(ys, 0.01), q(xs, 0.99), q(ys, 0.99)];
        for (const c of h3.polygonToCells([[s, w], [s, e], [n, e], [n, w], [s, w]], res)) if (!agg.has(c)) agg.set(c, { n: 0, s: 0, m: 0 }); }
      const fc = { type: 'FeatureCollection', features: [...agg.entries()].map(([c, a]) => ({ type: 'Feature', properties: { h3: c, count: a.n, ...(p.meanf ? { ['mean_' + p.meanf]: a.m ? +(a.s / a.m).toFixed(3) : null } : {}) }, geometry: { type: 'Polygon', coordinates: [h3.cellToBoundary(c, true)] } })) };
      const max = Math.max(...fc.features.map(f => f.properties.count));
      const id = `${L.id}_h3r${res}`; L.visible = false; ctx.render(L);
      const H = ctx.addLayer({ id, name: `${L.name.split(' (')[0]} · H3 r${res}`, kind: 'polygon', fc, style: { mode: 'seq', field: 'count', extrude: p.extrude === 'yes' ? 'count' : null, hscale: 1800 / max } });
      { const pts = fc.features.filter(f => f.properties.count > 0).flatMap(f => f.geometry.coordinates[0]); const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
        const cam = ctx.map.cameraForBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 60 });
        ctx.map.easeTo({ ...cam, pitch: p.extrude === 'yes' ? 55 : 0, bearing: p.extrude === 'yes' ? -15 : 0, duration: 900 }); }
      const occ = fc.features.filter(f => f.properties.count > 0).length;
      return { html: `<div class="kpis">${ctx.kpi(occ, 'occupied cells')}${ctx.kpi(max, 'in the busiest cell')}${p.zeros === 'yes' ? ctx.kpi(fc.features.length - occ, 'empty cells') : ''}</div>`, read: `Each cell has a permanent ID (e.g. <b>${fc.features[0].properties.h3}</b>), so any other table binned the same way joins on that text.` };
    } },
  { id: 'heat', group: 'sd', name: 'Heatmap', what: 'Spread each point into a soft glow and add them up: density at a glance.',
    params: [lay('Points', ['point']), { k: 'radius', label: 'Radius (pixels)', type: 'number', def: 22, min: 5 }],
    async run(p, ctx) { const L = getL(ctx, p.layer, 'points'); ctx.addLayer({ id: L.id + '_heat', name: L.name.split(' (')[0] + ' · heatmap', kind: 'point', fc: L.fc, style: { mode: 'heat', radius: p.radius } }); ctx.map.easeTo({ pitch: 0, bearing: 0 }); return { read: 'A heatmap shows where points crowd together. It is a picture, not a test: the hotspot blocks tell you whether a crowd is more than chance.' }; } },
  { id: 'ndvi', group: 'sd', name: 'NDVI zonal statistics', what: 'Summarise the satellite greenness pixels inside an outline and highlight vegetation.',
    params: [lay('Raster', ['raster']), lay('Outline', ['polygon'], { k: 'poly', optional: true, prefer: ['campus', 'botanic'] }), { k: 'thr', label: 'Vegetation above', type: 'number', def: 0.3, step: 0.05 }],
    async run(p, ctx) {
      const L = getL(ctx, p.layer, 'a raster'), R = L.raster, [x0, y0, x1, y1] = R.bbox;
      const G = p.poly ? ctx.state.layers.get(p.poly) : null, rings = G ? G.fc.features.flatMap(f => f.geometry.type === 'Polygon' ? [f.geometry.coordinates[0]] : f.geometry.coordinates.map(q => q[0])) : null;
      const inside = []; const all = [];
      for (let j = 0; j < R.h; j++) for (let i = 0; i < R.w; i++) { const v = R.data[j * R.w + i]; if (!Number.isFinite(v)) continue; all.push(v); if (rings) { const lon = x0 + (i + .5) / R.w * (x1 - x0), lat = y1 - (j + .5) / R.h * (y1 - y0); if (rings.some(r => ctx.S.pointInRing(lon, lat, r))) inside.push(v); } }
      const use = rings ? inside : all, m = ctx.S.mean(use), share = use.filter(v => v > p.thr).length / use.length;
      ctx.restyle(L, { mask: p.thr }); if (G) { ctx.restyle(G, { mode: 'single', color: ctx.css('--ink'), opacity: 0 }); ctx.fit(G); }
      const pxm = ((x1 - x0) / R.w * 111320 * Math.cos((y0 + y1) / 2 * Math.PI / 180)).toFixed(0);
      return { html: `<div class="kpis">${ctx.kpi(use.length.toLocaleString(), rings ? 'pixels inside' : 'pixels')}${ctx.kpi(m.toFixed(2), 'mean NDVI')}${ctx.kpi(Math.round(share * 100) + '%', `above ${p.thr}`)}</div>`, nodes: [ctx.C.histogram(use, { xl: 'NDVI', mark: p.thr })], read: `NDVI = (NIR − Red) ÷ (NIR + Red). Each pixel is about ${pxm} m across. Pixels at or below ${p.thr} are faded on the map.` };
    } },

  // ------------------------------------------------------------ NEIGHBOURS
  { id: 'weights', group: 'near', name: 'Spatial weights', what: 'Decide who counts as a neighbour. Every block in Patterns, Hotspots and Explain reuses this.',
    params: [lay('Layer', ['point', 'polygon'], { prefer: ['_h3', 'hdb'] }), { k: 'method', label: 'Neighbours are', type: 'select', options: [['knn', 'the k nearest'], ['distance', 'everyone within a distance'], ['queen', 'polygons sharing a border or corner'], ['h3', 'touching H3 hexagons']] }, { k: 'k', label: 'k', type: 'number', def: 8, min: 1, show: p => p.method === 'knn' }, { k: 'd', label: 'Distance (km)', type: 'number', def: 1, step: 0.1, show: p => p.method === 'distance' }],
    async run(p, ctx) {
      const L = getL(ctx, p.layer); let W;
      if (p.method === 'knn') W = ctx.S.weightsKNN(ctx.xyKm(L), p.k);
      else if (p.method === 'distance') W = ctx.S.weightsDistance(ctx.xyKm(L), p.d);
      else if (p.method === 'h3') { const cells = ctx.props(L).map(r => r.h3); if (cells.some(c => !c)) throw new Error('This layer has no h3 field. Use “H3 hexagon bins” first, or pick another method.'); W = ctx.S.weightsH3(cells, ctx.h3); }
      else { if (L.kind !== 'polygon') throw new Error('Contiguity needs polygons.'); W = ctx.S.weightsQueen(L.fc.features.map(f => f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat())); }
      L.W = W; ctx.render(L);
      return { html: `<div class="kpis">${ctx.kpi(W.mean.toFixed(1), 'neighbours on average')}${ctx.kpi(Math.min(...W.card) + '–' + Math.max(...W.card), 'range')}${ctx.kpi(W.islands, 'with none (islands)')}</div>`, nodes: [ctx.C.histogram(W.card, { xl: 'number of neighbours', bins: Math.min(20, Math.max(...W.card) - Math.min(...W.card) + 1) })], read: `Neighbours: <b>${W.label}</b>. Weights are row-standardised, so each feature’s neighbours share a total weight of 1. <b>Click any feature on the map to highlight its neighbours.</b>${W.islands ? ' Islands have no neighbours and are left out of the tests.' : ''}` };
    } },
  { id: 'lag', group: 'near', name: 'Spatial lag', what: 'The average of a value among each feature’s neighbours: “how is my neighbourhood doing?”',
    params: [wLayer(), { k: 'field', label: 'Value', type: 'field', of: 'layer', numeric: true, prefer: ['count', 'price_psm'] }],
    async run(p, ctx) {
      const L = getL(ctx, p.layer); needW(L); const v = ctx.vals(L, p.field), lg = ctx.S.lag(L.W, v), name = 'lag_' + p.field;
      L.fc.features.forEach((f, i) => f.properties[name] = +lg[i].toFixed(3)); ctx.restyle(L, { mode: 'seq', field: name });
      const r = (() => { const a = ctx.S.zscore(v), b = ctx.S.zscore(lg); let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s / a.length; })();
      return { nodes: [ctx.C.scatter(v, Array.from(lg), { xl: p.field, yl: name })], read: `Map now shows <b>${name}</b>. Correlation between a feature’s own value and its neighbours’ average: <b>${r.toFixed(2)}</b>. A strong positive value is the first sign of spatial autocorrelation.` };
    } },

  // ------------------------------------------------------------ PATTERNS
  { id: 'pattern', group: 'pat', name: 'Point pattern test', what: 'Clark–Evans nearest-neighbour ratio and Ripley’s L, against 19 random patterns in the same area.',
    params: [ptLayer()],
    async run(p, ctx) {
      const L = getL(ctx, p.layer, 'points'), xy = ctx.xyKm(L), r = ctx.S.pointPattern(xy);
      const P = ctx.proj(); ctx.addLayer({ id: 'study_area', helper: true, name: 'Study area (convex hull)', kind: 'line', fc: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [...r.hull, r.hull[0]].map(q => P.inv(q[0], q[1])) } }] }, style: { mode: 'single', color: ctx.css('--g-pat') } });
      return { html: `<div class="kpis">${ctx.kpi(r.R.toFixed(2), 'nearest-neighbour ratio R')}${ctx.kpi(r.z.toFixed(1), 'z-score')}${ctx.kpi(r.verdict, 'verdict')}</div>`, nodes: [ctx.C.lineBand(r.ds, r.Lobs, r.env, { xl: 'distance (km)', yl: 'L(d) − d' })],
        read: `Average nearest neighbour: <b>${(r.dObs * 1000).toFixed(0)} m</b> observed vs <b>${(r.dExp * 1000).toFixed(0)} m</b> expected if random. R below 1 means clustered, above 1 dispersed. In the chart, the line above the grey band means more clustering than chance at that distance.` };
    } },
  { id: 'moran', group: 'pat', name: 'Global Moran’s I', what: 'One number for the whole map: do similar values sit next to each other? Tested against 999 shuffles.',
    params: [wLayer(), { k: 'field', label: 'Value', type: 'field', of: 'layer', numeric: true, prefer: ['count', 'price_psm'] }, { k: 'perms', label: 'Shuffles', type: 'number', def: 999, min: 99 }],
    async run(p, ctx) {
      const L = getL(ctx, p.layer); needW(L); const r = ctx.S.moran(L.W, ctx.vals(L, p.field), p.perms);
      return { html: `<div class="kpis">${ctx.kpi(r.I.toFixed(3), 'Moran’s I')}${ctx.kpi(r.EI.toFixed(3), 'expected if random')}${ctx.kpi(pfmt(r.pSim), 'pseudo p-value')}</div>`, nodes: [ctx.C.scatter(Array.from(r.z), Array.from(r.lagz), { xl: `${p.field} (standardised)`, yl: 'neighbours’ average (lag)', line: [0, r.I], quadrants: true }), ctx.C.histogram(Array.from(r.sims), { xl: 'Moran’s I in shuffled maps', mark: r.I, color: 'var(--ns)' })],
        read: r.pSim < 0.05 ? `I = <b>${r.I.toFixed(3)}</b> is ${r.I > 0 ? 'positive' : 'negative'} and none of ${p.perms} random shuffles came close (p ${pfmt(r.pSim)}). ${r.I > 0 ? 'High values cluster near high values and low near low.' : 'Neighbours tend to differ: a checkerboard.'} The slope of the line in the scatter is I.` : `I = ${r.I.toFixed(3)} is within what random shuffles produce (p ${pfmt(r.pSim)}): no evidence of spatial clustering.` };
    } },

  // ------------------------------------------------------------ HOTSPOTS & CLUSTERS
  { id: 'lisa', group: 'hot', name: 'Local Moran (LISA)', what: 'Moran’s I for every feature: High-High hotspots, Low-Low coldspots, and outliers.',
    params: [wLayer(), { k: 'field', label: 'Value', type: 'field', of: 'layer', numeric: true, prefer: ['count', 'price_psm'] }, { k: 'alpha', label: 'Significance', type: 'select', options: [['0.05', '95%'], ['0.01', '99%'], ['0.1', '90%']] }],
    async run(p, ctx, say) {
      const L = getL(ctx, p.layer); needW(L); say('Running 499 conditional shuffles per feature…'); await new Promise(r => setTimeout(r, 20));
      const r = ctx.S.lisa(L.W, ctx.vals(L, p.field), 499, +p.alpha);
      L.fc.features.forEach((f, i) => { f.properties.lisa = r.cls[i]; f.properties.lisa_p = +r.p[i].toFixed(4); });
      const order = ['High-High', 'Low-Low', 'High-Low', 'Low-High', 'Not significant'], C = ctx.LISA_C();
      ctx.restyle(L, { mode: 'cat', field: 'lisa', keys: order, colors: C });
      const cnt = order.map(k => [k, r.cls.filter(c => c === k).length, C[k]]);
      return { nodes: [ctx.C.bars(cnt), ctx.C.scatter(Array.from(r.z), Array.from(r.lz), { xl: `${p.field} (standardised)`, yl: 'lag', quadrants: true, colors: r.cls.map(c => C[c]) })], read: `<b>High-High</b>: high values among high neighbours (hotspots). <b>Low-Low</b>: coldspots. <b>High-Low</b>: a strong performer surrounded by weak ones. <b>Low-High</b>: a weak spot in a strong area, often an opening.` };
    } },
  { id: 'gistar', group: 'hot', name: 'Hotspots (Getis-Ord Gi*)', what: 'Is the sum around each feature (itself included) much higher or lower than chance?',
    params: [wLayer(), { k: 'field', label: 'Value', type: 'field', of: 'layer', numeric: true, prefer: ['count', 'price_psm'] }],
    async run(p, ctx) {
      const L = getL(ctx, p.layer); needW(L); const r = ctx.S.giStar(L.W, ctx.vals(L, p.field));
      L.fc.features.forEach((f, i) => { f.properties.gi_z = +r.z[i].toFixed(3); f.properties.gi = r.cls[i]; });
      const order = Object.keys(ctx.GI_C); ctx.restyle(L, { mode: 'cat', field: 'gi', keys: order, colors: ctx.GI_C });
      return { nodes: [ctx.C.bars(order.map(k => [k, r.cls.filter(c => c === k).length, ctx.GI_C[k]]))], read: 'A heatmap shows where things are dense. Gi* tells you where the density is too strong to be chance (z above 1.96 is 95% confidence). Use it to pick priority zones.' };
    } },
  { id: 'dbscan', group: 'hot', name: 'Density clusters (DBSCAN)', what: 'Group points that have enough neighbours within a distance; the rest are labelled noise.',
    params: [ptLayer(), { k: 'eps', label: 'Within (km)', type: 'number', def: 0.4, step: 0.05, min: 0.01 }, { k: 'minpts', label: 'At least', type: 'number', def: 6, min: 2 }],
    async run(p, ctx) {
      const L = getL(ctx, p.layer, 'points'), r = ctx.S.dbscan(ctx.xyKm(L), p.eps, p.minpts);
      const order = r.sizes.map((s, i) => [i, s]).sort((a, b) => b[1] - a[1]), rank = new Map(order.map(([i], k) => [i, k + 1]));
      L.fc.features.forEach((f, i) => f.properties.cluster = r.labels[i] < 0 ? 'noise' : `C${rank.get(r.labels[i])}`);
      const keys = order.slice(0, 11).map(([i]) => `C${rank.get(i)}`).concat(['noise']); const colors = { noise: ctx.css('--ns') }; keys.forEach((k, i) => k !== 'noise' && (colors[k] = ctx.CAT[i % ctx.CAT.length]));
      ctx.restyle(L, { mode: 'cat', field: 'cluster', keys, colors });
      return { html: `<div class="kpis">${ctx.kpi(r.k, 'clusters')}${ctx.kpi(r.noise, 'noise points')}${ctx.kpi(order[0]?.[1] ?? 0, 'in the largest')}</div>`, nodes: [ctx.C.bars(order.slice(0, 8).map(([i, s], k) => [`C${k + 1}`, s, ctx.CAT[k % ctx.CAT.length]]))], read: `A point belongs to a cluster if at least ${p.minpts} points sit within ${p.eps} km. Change the two numbers and watch clusters merge or split: the choice is a business decision about what “a market” means.` };
    } },

  // ------------------------------------------------------------ SURFACES
  { id: 'sample', group: 'surf', name: 'Sample a raster', what: 'Keep only a few random pixels as points, to test how well a surface can be rebuilt.',
    params: [lay('Raster', ['raster']), { k: 'n', label: 'Samples', type: 'number', def: 300, min: 20 }],
    async run(p, ctx) {
      const L = getL(ctx, p.layer, 'a raster'), R = L.raster, [x0, y0, x1, y1] = R.bbox, r = ctx.S.rng(21), feats = [];
      let guard = 0; while (feats.length < p.n && guard++ < p.n * 50) { const i = Math.floor(r() * R.w), j = Math.floor(r() * R.h), v = R.data[j * R.w + i]; if (!Number.isFinite(v)) continue; feats.push({ type: 'Feature', properties: { value: +v.toFixed(4) }, geometry: { type: 'Point', coordinates: [x0 + (i + .5) / R.w * (x1 - x0), y1 - (j + .5) / R.h * (y1 - y0)] } }); }
      L.visible = false; ctx.render(L);
      const S = ctx.addLayer({ id: L.id + '_sample', name: `${p.n} samples of ${L.name.split(',')[0]}`, kind: 'point', fc: { type: 'FeatureCollection', features: feats }, style: { mode: 'seq', field: 'value' } });
      S.truth = L.id;
      return { read: `${feats.length} of ${(R.w * R.h).toLocaleString()} pixels kept (${(feats.length / R.w / R.h * 100).toFixed(1)}%). The original raster is hidden: it is the answer key for the next blocks.` };
    } },
  { id: 'idw', group: 'surf', name: 'IDW surface', what: 'Estimate every cell from nearby samples, giving closer samples more weight.',
    params: [ptLayer('Sample points'), { k: 'field', label: 'Value', type: 'field', of: 'layer', numeric: true, prefer: ['value', 'price_psm'] }, { k: 'power', label: 'Power', type: 'number', def: 2, step: 0.5, min: 0.5 }, { k: 'cell', label: 'Cell size (m)', type: 'number', def: 30 }],
    async run(p, ctx, say) {
      const L = getL(ctx, p.layer, 'points'), all = ctx.xyKm(L), v0 = ctx.vals(L, p.field), keep = v0.map((v, i) => Number.isFinite(v) ? i : -1).filter(i => i >= 0);
      const xy = keep.map(i => all[i]), v = keep.map(i => v0[i]); const truth = L.truth ? ctx.state.layers.get(L.truth) : null;
      const grid = truth ? gridFromRaster(ctx, truth) : makeGrid(ctx, xy, p.cell / 1000); say(`Estimating ${(grid.nx * grid.ny).toLocaleString()} cells…`); await new Promise(r => setTimeout(r, 20));
      const z = ctx.S.idwGrid(xy, v, grid, p.power); if (!truth) { const m = hullMask(ctx, xy, grid); z.forEach((_, i) => { if (!m[i]) z[i] = NaN; }); }
      const stops = p.field === 'value' && truth ? ctx.NDVI : seqStops(Array.from(z));
      ctx.addLayer({ id: L.id + '_idw', name: `IDW surface of ${p.field}`, kind: 'raster', raster: { w: grid.nx, h: grid.ny, bbox: grid.bboxLL, data: z }, style: { stops, label: p.field } });
      let html = ''; if (truth) { const e = rmse(z, truth.raster.data); html = `<div class="kpis">${ctx.kpi(e.toFixed(3), 'error vs truth (RMSE)')}${ctx.kpi(keep.length, 'samples used')}</div>`; }
      return { html, read: truth ? 'Compare with the hidden original: tick it on in the Layers box. IDW reproduces broad patterns but smears small features between samples.' : 'Each cell is a weighted average of the 12 nearest samples, weight = 1 ÷ distance^power. Higher power makes the surface more local.' };
    } },
  { id: 'krige', group: 'surf', name: 'Kriging surface', what: 'Fit how similarity fades with distance (variogram), then predict every cell with an uncertainty map.',
    params: [ptLayer('Sample points'), { k: 'field', label: 'Value', type: 'field', of: 'layer', numeric: true, prefer: ['value', 'price_psm'] }, { k: 'cell', label: 'Cell size (m)', type: 'number', def: 30 }],
    async run(p, ctx, say) {
      const L = getL(ctx, p.layer, 'points'), all = ctx.xyKm(L), v0 = ctx.vals(L, p.field), keep = v0.map((v, i) => Number.isFinite(v) ? i : -1).filter(i => i >= 0);
      const xy = keep.map(i => all[i]), v = keep.map(i => v0[i]); const truth = L.truth ? ctx.state.layers.get(L.truth) : null;
      say('Fitting the variogram…'); await new Promise(r => setTimeout(r, 20));
      const vg = ctx.S.variogram(xy, v); const grid = truth ? gridFromRaster(ctx, truth) : makeGrid(ctx, xy, p.cell / 1000);
      say(`Kriging ${(grid.nx * grid.ny).toLocaleString()} cells…`); await new Promise(r => setTimeout(r, 20));
      const k = ctx.S.krigeGrid(xy, v, grid, vg); if (!truth) { const m = hullMask(ctx, xy, grid); for (let i = 0; i < m.length; i++) if (!m[i]) { k.pred[i] = NaN; k.se[i] = NaN; } }
      ctx.addLayer({ id: L.id + '_krige_se', name: `Kriging uncertainty (std. error)`, kind: 'raster', raster: { w: grid.nx, h: grid.ny, bbox: grid.bboxLL, data: k.se }, style: { stops: seStops(Array.from(k.se)), label: 'std. error' }, visible: false });
      ctx.addLayer({ id: L.id + '_krige', name: `Kriging surface of ${p.field}`, kind: 'raster', raster: { w: grid.nx, h: grid.ny, bbox: grid.bboxLL, data: k.pred }, style: { stops: p.field === 'value' && truth ? ctx.NDVI : seqStops(Array.from(k.pred)), label: p.field } });
      let html = ''; if (truth) html = `<div class="kpis">${ctx.kpi(rmse(k.pred, truth.raster.data).toFixed(3), 'error vs truth (RMSE)')}</div>`;
      return { html, nodes: [ctx.C.lineChart(vg.lags, vg.gam, { xl: 'distance between pairs (km)', yl: 'semivariance', model: vg.fit.model })], read: `Similarity fades out at about <b>${vg.fit.range.toFixed(2)} km</b> (the range). Beyond that, samples tell you nothing about each other. Tick on <b>Kriging uncertainty</b> in Layers: it is lowest next to samples and highest in the gaps, which a manager can use to decide where to collect more data.` };
    } },

  // ------------------------------------------------------------ EXPLAIN
  { id: 'distto', group: 'reg', name: 'Distance to nearest', what: 'Add a field: distance from each feature to the nearest feature of another layer, or to a point.',
    params: [lay('Add field to', ['point', 'polygon'], { prefer: ['_h3', 'hdb'] }), { k: 'to', label: 'Distance to', type: 'select', options: [['layer', 'nearest feature of a layer'], ['point', 'a fixed point']] }, lay('Layer', ['point', 'polygon'], { k: 'tolayer', show: p => p.to === 'layer', prefer: ['LATEST'] }), { k: 'point', label: 'Point', type: 'point', show: p => p.to === 'point' }, { k: 'name', label: 'Field name', type: 'select', options: ['metro', 'mrt', 'hawker', 'cbd', 'cyberhub', 'school', 'park', 'poi', 'cafe_cluster', 'food_market', 'rival'] }],
    async run(p, ctx) {
      const L = getL(ctx, p.layer), field = `dist_${p.name}_km`, A = ctx.xyKm(L); let d;
      if (p.to === 'point') { const [lon, lat] = pointLL(p, ctx); d = ctx.lonlat(L).map(([x, y]) => ctx.S.haversine(lat, lon, y, x)); }
      else { const T = getL(ctx, p.tolayer); if (T === L) throw new Error('Pick a different layer to measure to.'); const B = ctx.xyKm(T), g = new ctx.S.GridIndex(B); d = A.map(([x, y]) => g.knn(x, y, 1)[0][1]); }
      L.fc.features.forEach((f, i) => f.properties[field] = +d[i].toFixed(3)); ctx.restyle(L, { mode: 'seq', field });
      return { nodes: [ctx.C.histogram(d, { xl: field })], read: `Added <b>${field}</b>. Median ${ctx.fmt(ctx.S.quantile(d, 0.5))} km, maximum ${ctx.fmt(Math.max(...d))} km.` };
    } },
  { id: 'ols', group: 'reg', name: 'Ordinary regression (OLS)', what: 'Explain a value with others, then test whether the errors are still clustered in space.',
    params: [lay('Layer', ['point', 'polygon'], { prefer: 'W' }), { k: 'y', label: 'Explain (y)', type: 'field', of: 'layer', numeric: true, prefer: ['count', 'price_psm'] }, { k: 'xs', label: 'Using (x)', type: 'fields', of: 'layer', numeric: true, exclude: 'y' }],
    async run(p, ctx) {
      const L = getL(ctx, p.layer), { keep, Y, X } = regData(ctx, L, p.y, p.xs), r = ctx.S.ols(Y, X, p.xs);
      keep.forEach((k, i) => L.fc.features[k].properties.resid = +r.res[i].toFixed(3)); ctx.restyle(L, { mode: 'div', field: 'resid' });
      L.lastOLS = { aic: r.aic, r2: r.r2, ll: r.ll };
      let mor = ''; if (L.W) { const m = ctx.S.moran(subW(L.W, keep), r.res, 499); mor = `<div class="kpis">${ctx.kpi(m.I.toFixed(3), 'Moran’s I of residuals')}${ctx.kpi(pfmt(m.pSim), 'p-value')}</div>`; L.residMoran = m.I; }
      const weak = r.r2 < 0.15 ? `R² is only ${r.r2.toFixed(2)}: these variables explain little of the variation on their own. Much of what is left is local, which is what the spatial models and GWR pick up. ` : '';
      return { html: `<div class="kpis">${ctx.kpi(r.r2.toFixed(3), 'R²')}${ctx.kpi(Math.round(r.aic).toLocaleString(), 'AIC (lower is better)')}${ctx.kpi(r.n.toLocaleString(), 'rows')}</div>${mor}`, nodes: [coefTable(ctx, r)], read: weak + (L.W ? (L.residMoran > 0.05 ? `The map shows residuals (red = under-predicted, blue = over-predicted). They cluster (Moran’s I = ${L.residMoran.toFixed(3)}), so OLS’s assumption of independent errors fails. Try the spatial lag and spatial error models next.` : 'Residuals show little spatial clustering: OLS may be adequate here.') : 'Add a Weights block to test whether the residuals cluster in space.') };
    } },
  { id: 'slm', group: 'reg', name: 'Spatial lag model', what: 'Adds the neighbours’ y as a predictor: my value depends on my neighbours’ values (spillover).',
    params: [wLayer(), { k: 'y', label: 'Explain (y)', type: 'field', of: 'layer', numeric: true, prefer: ['count', 'price_psm'] }, { k: 'xs', label: 'Using (x)', type: 'fields', of: 'layer', numeric: true, exclude: 'y' }],
    async run(p, ctx) {
      const L = getL(ctx, p.layer); needW(L); const { keep, Y, X } = regData(ctx, L, p.y, p.xs), W = subW(L.W, keep);
      const o = ctx.S.ols(Y, X, p.xs), r = ctx.S.spatialLagML(Y, X, p.xs, W);
      return { html: `<div class="kpis">${ctx.kpi(r.rho.toFixed(3), 'ρ (spillover)')}${ctx.kpi(pfmt(r.pRho), 'p-value of ρ')}${ctx.kpi(Math.round(r.aic).toLocaleString(), `AIC (OLS ${Math.round(o.aic).toLocaleString()})`)}</div>`, nodes: [coefTable(ctx, r, [['ρ (W·y)', ctx.fmt(r.rho), ctx.fmt(r.seRho), pfmt(r.pRho), '']])], read: `ρ = ${r.rho.toFixed(2)}: a 1-unit rise in the neighbours’ average ${ctx.esc(p.y)} goes with a ${r.rho.toFixed(2)} rise here, holding the x variables fixed. ${r.aic < o.aic ? 'AIC is lower than OLS, so the model with spillover fits better.' : 'AIC is not lower than OLS.'}` };
    } },
  { id: 'sem', group: 'reg', name: 'Spatial error model', what: 'Lets the errors be correlated with neighbours’ errors: missing factors that are themselves clustered.',
    params: [wLayer(), { k: 'y', label: 'Explain (y)', type: 'field', of: 'layer', numeric: true, prefer: ['count', 'price_psm'] }, { k: 'xs', label: 'Using (x)', type: 'fields', of: 'layer', numeric: true, exclude: 'y' }],
    async run(p, ctx) {
      const L = getL(ctx, p.layer); needW(L); const { keep, Y, X } = regData(ctx, L, p.y, p.xs), W = subW(L.W, keep);
      const o = ctx.S.ols(Y, X, p.xs), r = ctx.S.spatialErrorML(Y, X, p.xs, W);
      return { html: `<div class="kpis">${ctx.kpi(r.lambda.toFixed(3), 'λ (error clustering)')}${ctx.kpi(pfmt(r.pLambda), 'p-value of λ')}${ctx.kpi(Math.round(r.aic).toLocaleString(), `AIC (OLS ${Math.round(o.aic).toLocaleString()})`)}</div>`, nodes: [coefTable(ctx, r, [['λ (W·u)', ctx.fmt(r.lambda), ctx.fmt(r.seLambda), pfmt(r.pLambda), '']])], read: `λ = ${r.lambda.toFixed(2)}: something not in the model (neighbourhood prestige, school zones, views) is shared by neighbours. The coefficients are now cleaned of that shared noise.` };
    } },
  { id: 'gwr', group: 'reg', name: 'Geographically weighted regression', what: 'Fits a separate regression around every location, so each effect can vary across the map.',
    params: [lay('Layer', ['point', 'polygon'], { prefer: ['_h3', 'hdb'] }), { k: 'y', label: 'Explain (y)', type: 'field', of: 'layer', numeric: true, prefer: ['count', 'price_psm'] }, { k: 'xs', label: 'Using (x)', type: 'fields', of: 'layer', numeric: true, exclude: 'y' }, { k: 'bw', label: 'Neighbours per fit (0 = auto)', type: 'number', def: 0, min: 0 }, { k: 'sample', label: 'Max rows (speed)', type: 'number', def: 2000, min: 200 }],
    async run(p, ctx, say) {
      const L0 = getL(ctx, p.layer); let { keep, Y, X } = regData(ctx, L0, p.y, p.xs);
      if (keep.length > p.sample) { const r = ctx.S.rng(9), idx = keep.map((_, i) => i).sort(() => r() - 0.5).slice(0, p.sample).sort((a, b) => a - b); keep = idx.map(i => keep[i]); Y = idx.map(i => Y[i]); X = idx.map(i => X[i]); }
      const all = ctx.xyKm(L0), xy = keep.map(k => all[k]);
      say(p.bw ? 'Fitting…' : 'Searching for the best bandwidth (AICc)…'); await new Promise(r => setTimeout(r, 30));
      const r = ctx.S.gwr(Y, X, p.xs, xy, p.bw || null, n => say(`Bandwidth search: ${n} tries…`));
      const feats = keep.map((k, i) => { const f = L0.fc.features[k]; const pr = { ...f.properties }; r.names.forEach((n, j) => pr['b_' + n] = +r.B[i][j].toFixed(5)); return { type: 'Feature', properties: pr, geometry: f.geometry }; });
      L0.visible = false; ctx.render(L0);
      const id = L0.id + '_gwr', G = ctx.addLayer({ id, name: `GWR on ${L0.name.split(' (')[0]}`, kind: L0.kind, fc: { type: 'FeatureCollection', features: feats }, style: { mode: 'div', field: 'b_' + p.xs[0], radius: L0.kind === 'point' ? 5 : undefined } });
      const o = ctx.S.ols(Y, X, p.xs);
      const rows = r.names.map((n, j) => { const c = r.B.map(b => b[j]); return [n, ctx.fmt(o.b[j]), ctx.fmt(ctx.S.quantile(c, 0.05)), ctx.fmt(ctx.S.quantile(c, 0.5)), ctx.fmt(ctx.S.quantile(c, 0.95))]; });
      const btns = document.createElement('div'); btns.className = 'kpis';
      r.names.slice(1).forEach(n => { const b = document.createElement('button'); b.className = 'ghost sm'; b.textContent = `Map ${n}`; b.onclick = () => ctx.restyle(G, { mode: 'div', field: 'b_' + n, radius: G.kind === 'point' ? 5 : undefined }); btns.appendChild(b); });
      return { html: `<div class="kpis">${ctx.kpi(r.bw, 'neighbours per local fit')}${ctx.kpi(r.r2.toFixed(3), `R² (OLS ${o.r2.toFixed(3)})`)}${ctx.kpi(keep.length.toLocaleString(), 'rows used')}</div>`, nodes: [ctx.C.table(['Variable', 'OLS', 'GWR 5th pct', 'median', '95th pct'], rows), btns], read: `OLS gives one number per variable for the whole map. GWR gives one per location: the map shows the local effect of <b>${ctx.esc(p.xs[0])}</b>. If the 5th and 95th percentiles have opposite signs, the effect really changes across the city.` };
    } },
];
function gridFromRaster(ctx, R) { const P = ctx.proj(), [lo0, la0, lo1, la1] = R.raster.bbox, [x0, y0] = P.f(lo0, la0), [x1, y1] = P.f(lo1, la1); return { x0, y0, x1, y1, nx: R.raster.w, ny: R.raster.h, dx: (x1 - x0) / R.raster.w, dy: (y1 - y0) / R.raster.h, bboxLL: R.raster.bbox }; }
function rmse(a, b) { let s = 0, n = 0; for (let i = 0; i < a.length; i++) if (Number.isFinite(a[i]) && Number.isFinite(b[i])) { s += (a[i] - b[i]) ** 2; n++; } return Math.sqrt(s / n); }
