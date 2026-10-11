// io.js — read GeoJSON, GeoParquet, FlatGeobuf, CSV and Cloud-Optimised GeoTIFF in the browser
import { parquetReadObjects, parquetMetadataAsync } from '../lib/hyparquet/index.js';

export async function readAny(buf, name) {
  const ext = name.toLowerCase().split('.').pop();
  if (ext === 'geojson' || ext === 'json') return JSON.parse(new TextDecoder().decode(buf));
  if (ext === 'parquet') return readGeoParquet(buf);
  if (ext === 'fgb') return readFGB(buf);
  if (ext === 'csv' || ext === 'txt') return readCSV(new TextDecoder().decode(buf));
  if (ext === 'tif' || ext === 'tiff') return readCOG(buf);
  throw new Error(`Cannot read .${ext} files. Use GeoJSON, GeoParquet, FlatGeobuf, CSV or GeoTIFF.`);
}

export async function readGeoParquet(buf) {
  const file = { byteLength: buf.byteLength, slice: (s, e) => buf.slice(s, e) };
  const rows = await parquetReadObjects({ file });
  const meta = await parquetMetadataAsync(file);
  const geoKV = meta.key_value_metadata?.find(k => k.key === 'geo');
  const geoCol = geoKV ? JSON.parse(geoKV.value).primary_column : 'geometry';
  const features = rows.map(r => {
    const g = r[geoCol]; const props = { ...r }; delete props[geoCol];
    for (const k in props) if (typeof props[k] === 'bigint') props[k] = Number(props[k]);
    return { type: 'Feature', properties: props, geometry: g instanceof Uint8Array ? parseWKB(g) : g };
  });
  return { type: 'FeatureCollection', features };
}

export function parseWKB(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); let o = 0;
  function geom() {
    const le = dv.getUint8(o) === 1; o += 1; const t = dv.getUint32(o, le) % 1000; o += 4;
    const u32 = () => { const v = dv.getUint32(o, le); o += 4; return v; }, f64 = () => { const v = dv.getFloat64(o, le); o += 8; return v; };
    const pt = () => [f64(), f64()], ring = () => { const n = u32(); const a = []; for (let i = 0; i < n; i++) a.push(pt()); return a; };
    if (t === 1) return { type: 'Point', coordinates: pt() };
    if (t === 2) return { type: 'LineString', coordinates: ring() };
    if (t === 3) { const n = u32(); const r = []; for (let i = 0; i < n; i++) r.push(ring()); return { type: 'Polygon', coordinates: r }; }
    const n = u32(), parts = []; for (let i = 0; i < n; i++) parts.push(geom());
    if (t === 4) return { type: 'MultiPoint', coordinates: parts.map(p => p.coordinates) };
    if (t === 5) return { type: 'MultiLineString', coordinates: parts.map(p => p.coordinates) };
    if (t === 6) return { type: 'MultiPolygon', coordinates: parts.map(p => p.coordinates) };
    return { type: 'GeometryCollection', geometries: parts };
  }
  return geom();
}

export async function readFGB(buf) {
  const features = [];
  for await (const f of flatgeobuf.geojson.deserialize(new Uint8Array(buf))) features.push(f);
  return { type: 'FeatureCollection', features };
}

export function readCSV(text) {
  const rows = parseCSV(text); const head = rows.shift().map(h => h.trim());
  const lat = head.findIndex(h => /^(lat|latitude|y)$/i.test(h)), lon = head.findIndex(h => /^(lon|lng|long|longitude|x)$/i.test(h));
  if (lat < 0 || lon < 0) throw new Error('The CSV needs latitude and longitude columns (named lat/latitude and lon/lng/longitude).');
  const features = [];
  for (const r of rows) {
    if (r.length < head.length) continue;
    const props = {}; head.forEach((h, i) => { const v = r[i]; props[h] = v !== '' && !isNaN(+v) ? +v : v; });
    const y = +r[lat], x = +r[lon]; if (!isFinite(x) || !isFinite(y)) continue;
    features.push({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [x, y] } });
  }
  return { type: 'FeatureCollection', features };
}
function parseCSV(t) {
  const out = []; let row = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cur); out.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); out.push(row); }
  return out.filter(r => r.length > 1 || r[0]);
}

export async function readCOG(buf) {
  const tiff = await GeoTIFF.fromArrayBuffer(buf); const img = await tiff.getImage();
  const [w, h] = [img.getWidth(), img.getHeight()], bb = img.getBoundingBox(); // [minx,miny,maxx,maxy]
  const data = (await img.readRasters({ interleave: true }));
  return { raster: true, w, h, bbox: bb, data: Float32Array.from(data), overviews: (await tiff.getImageCount()) - 1, tile: img.getTileWidth() };
}

export function toCSV(fc) {
  const keys = [...new Set(fc.features.flatMap(f => Object.keys(f.properties)))];
  const pts = fc.features[0]?.geometry?.type === 'Point';
  const head = pts ? [...keys, 'longitude_', 'latitude_'] : keys;
  const esc = v => v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
  const lines = [head.join(',')];
  for (const f of fc.features) { const r = keys.map(k => esc(f.properties[k])); if (pts) r.push(f.geometry.coordinates[0], f.geometry.coordinates[1]); lines.push(r.join(',')); }
  return lines.join('\n');
}
