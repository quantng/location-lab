// charts.js — small SVG charts drawn with theme tokens (CSS variables)
const NS = 'http://www.w3.org/2000/svg';
const fmt = v => Number.isInteger(v) ? v.toLocaleString() : Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : Math.abs(v) >= 10 ? v.toFixed(1) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(3);
export { fmt };
function svg(w, h) { const s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', `0 0 ${w} ${h}`); s.setAttribute('class', 'chart'); return s; }
function el(tag, attrs, parent, text) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; parent && parent.appendChild(e); return e; }
function niceTicks(a, b, n = 5) { const span = b - a || 1, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0)), step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= n) || mag * 10; const t = []; for (let v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) t.push(+v.toFixed(10)); return t; }
function frame(w, h, xr, yr, xl, yl, m = { l: 56, r: 14, t: 12, b: 42 }) {
  const s = svg(w, h), X = v => m.l + (v - xr[0]) / (xr[1] - xr[0]) * (w - m.l - m.r), Y = v => h - m.b - (v - yr[0]) / (yr[1] - yr[0]) * (h - m.t - m.b);
  const g = el('g', { class: 'axis' }, s);
  for (const t of niceTicks(...yr)) { el('line', { x1: m.l, x2: w - m.r, y1: Y(t), y2: Y(t), class: 'grid' }, g); el('text', { x: m.l - 6, y: Y(t) + 4, 'text-anchor': 'end' }, g, fmt(t)); }
  for (const t of niceTicks(...xr)) { el('text', { x: X(t), y: h - m.b + 16, 'text-anchor': 'middle' }, g, fmt(t)); }
  el('text', { x: (m.l + w - m.r) / 2, y: h - 6, 'text-anchor': 'middle', class: 'lab' }, g, xl);
  el('text', { x: 12, y: (m.t + h - m.b) / 2, transform: `rotate(-90 12 ${(m.t + h - m.b) / 2})`, 'text-anchor': 'middle', class: 'lab' }, g, yl);
  return { s, X, Y, g };
}
export function bars(items, { w = 360, h = 30 * items.length + 10, color = 'var(--accent)', value = fmt } = {}) {
  const s = svg(w, h), max = Math.max(...items.map(d => d[1]), 1), L = 120;
  items.forEach(([k, v, c], i) => {
    const y = 6 + i * 30; el('text', { x: L - 8, y: y + 15, 'text-anchor': 'end', class: 'lab' }, s, k);
    el('rect', { x: L, y, width: Math.max(2, (w - L - 60) * v / max), height: 20, fill: c || color, rx: 2 }, s);
    el('text', { x: L + Math.max(2, (w - L - 60) * v / max) + 6, y: y + 15, class: 'val' }, s, value(v));
  });
  return s;
}
export function histogram(vals, { w = 360, h = 190, bins = 20, xl = '', color = 'var(--accent)', mark = null } = {}) {
  let lo = Math.min(...vals), hi = Math.max(...vals); if (hi - lo < 1e-9) { lo -= 0.5; hi += 0.5; bins = 1; } const cnt = new Array(bins).fill(0);
  for (const v of vals) cnt[Math.min(bins - 1, Math.floor((v - lo) / (hi - lo) * bins))]++;
  const xr = [lo, hi], xs = mark != null ? [Math.min(lo, mark), Math.max(hi, mark)] : xr;
  const { s, X, Y } = frame(w, h, xs, [0, Math.max(...cnt)], xl, 'count');
  cnt.forEach((c, i) => { const x0 = X(lo + i * (hi - lo) / bins), x1 = X(lo + (i + 1) * (hi - lo) / bins); el('rect', { x: x0 + 0.5, y: Y(c), width: Math.max(1, x1 - x0 - 1), height: Y(0) - Y(c), fill: color }, s); });
  if (mark != null) { el('line', { x1: X(mark), x2: X(mark), y1: 12, y2: h - 42, class: 'mark' }, s); el('text', { x: X(mark) - 4, y: 24, 'text-anchor': 'end', class: 'val' }, s, 'observed ' + fmt(mark)); }
  return s;
}
export function scatter(xs, ys, { w = 360, h = 300, xl = '', yl = '', colors = null, line = null, quadrants = false, size = 2.5 } = {}) {
  const pad = (a, b) => { const d = (b - a) * 0.06 || 1; return [a - d, b + d]; };
  const xr = pad(Math.min(...xs), Math.max(...xs)), yr = pad(Math.min(...ys), Math.max(...ys));
  const { s, X, Y } = frame(w, h, xr, yr, xl, yl);
  if (quadrants) { el('line', { x1: X(0), x2: X(0), y1: 12, y2: h - 42, class: 'axis0' }, s); el('line', { x1: 56, x2: w - 14, y1: Y(0), y2: Y(0), class: 'axis0' }, s);
    [['High-High', 1, 1], ['Low-Low', -1, -1], ['Low-High', -1, 1], ['High-Low', 1, -1]].forEach(([t, a, b]) => el('text', { x: a > 0 ? w - 18 : 62, y: b > 0 ? 26 : h - 50, 'text-anchor': a > 0 ? 'end' : 'start', class: 'quad' }, s, t)); }
  const g = el('g', {}, s);
  for (let i = 0; i < xs.length; i++) el('circle', { cx: X(xs[i]), cy: Y(ys[i]), r: size, fill: colors ? colors[i] : 'var(--accent)', 'fill-opacity': 0.7 }, g);
  if (line) { const [a, b] = line; el('line', { x1: X(xr[0]), y1: Y(a + b * xr[0]), x2: X(xr[1]), y2: Y(a + b * xr[1]), class: 'fit' }, s); }
  return s;
}
export function lineBand(xs, ys, band, { w = 360, h = 220, xl = '', yl = '' } = {}) {
  const lo = Math.min(...ys, ...band.map(b => b[0])), hi = Math.max(...ys, ...band.map(b => b[1]));
  const { s, X, Y } = frame(w, h, [0, xs[xs.length - 1]], [lo - (hi - lo) * 0.05, hi + (hi - lo) * 0.05], xl, yl);
  const area = xs.map((x, i) => `${X(x)},${Y(band[i][1])}`).concat(xs.slice().reverse().map((x, i) => `${X(x)},${Y(band[xs.length - 1 - i][0])}`)).join(' ');
  el('polygon', { points: area, class: 'band' }, s);
  el('line', { x1: X(0), x2: X(xs[xs.length - 1]), y1: Y(0), y2: Y(0), class: 'axis0' }, s);
  el('polyline', { points: xs.map((x, i) => `${X(x)},${Y(ys[i])}`).join(' '), class: 'obs' }, s);
  return s;
}
export function lineChart(xs, ys, { w = 360, h = 220, xl = '', yl = '', model = null } = {}) {
  const hi = Math.max(...ys) * 1.1;
  const { s, X, Y } = frame(w, h, [0, xs[xs.length - 1] * 1.05], [0, hi], xl, yl);
  if (model) { const pts = []; for (let i = 0; i <= 60; i++) { const x = xs[xs.length - 1] * 1.05 * i / 60; pts.push(`${X(x)},${Y(Math.min(hi, model(x)))}`); } el('polyline', { points: pts.join(' '), class: 'fit' }, s); }
  xs.forEach((x, i) => el('circle', { cx: X(x), cy: Y(ys[i]), r: 3.5, fill: 'var(--accent)' }, s));
  return s;
}
export function table(head, rows) {
  const t = document.createElement('table'); t.className = 'tbl';
  t.innerHTML = `<thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>`;
  const wrap = document.createElement('div'); wrap.className = 'tblwrap'; wrap.appendChild(t); return wrap;
}
