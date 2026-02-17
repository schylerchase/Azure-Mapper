'use strict';

function pad(b, m) { return { x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m }; }

function segHits(x1, y1, x2, y2, b) {
  return !(Math.max(x1, x2) < b.x || Math.min(x1, x2) > b.x + b.w ||
           Math.max(y1, y2) < b.y || Math.min(y1, y2) > b.y + b.h);
}

function hSide(s) { return s === 'left' || s === 'right'; }

function orthoRoute(sp, so, ss, dp, dout, ds) {
  const sH = hSide(ss), dH = hSide(ds);
  if (sH && dH) {
    if (Math.abs(so.y - dout.y) < 1) return [sp, so, dout, dp];
    const mx = (so.x + dout.x) / 2;
    return [sp, so, { x: mx, y: so.y }, { x: mx, y: dout.y }, dout, dp];
  }
  if (!sH && !dH) {
    if (Math.abs(so.x - dout.x) < 1) return [sp, so, dout, dp];
    const my = (so.y + dout.y) / 2;
    return [sp, so, { x: so.x, y: my }, { x: dout.x, y: my }, dout, dp];
  }
  if (sH) return [sp, so, { x: dout.x, y: so.y }, dout, dp];
  return [sp, so, { x: so.x, y: dout.y }, dout, dp];
}

function fixCollisions(pts, obs, clearance) {
  const C = clearance || 1;

  // Phase 1: Decompose diagonal segments into orthogonal pairs
  let work = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = work[work.length - 1], cur = pts[i];
    const isH = Math.abs(prev.y - cur.y) < 1;
    const isV = Math.abs(prev.x - cur.x) < 1;
    if (!isH && !isV) {
      work.push({ x: cur.x, y: prev.y });
    }
    work.push(cur);
  }
  pts = work;

  // Phase 2: Route around obstacles with proper clearance
  const MAX_ITER = 12, MAX_PTS = 60;
  for (let iter = 0; iter < MAX_ITER && pts.length < MAX_PTS; iter++) {
    let changed = false;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      for (const o of obs) {
        if (!segHits(a.x, a.y, b.x, b.y, o)) continue;
        if (Math.abs(a.y - b.y) < 1) {
          const above = o.y - C, below = o.y + o.h + C;
          const nY = Math.abs(a.y - above) <= Math.abs(a.y - below) ? above : below;
          pts = [...pts.slice(0, i + 1), { x: a.x, y: nY }, { x: b.x, y: nY }, ...pts.slice(i + 1)];
        } else if (Math.abs(a.x - b.x) < 1) {
          const left = o.x - C, right = o.x + o.w + C;
          const nX = Math.abs(a.x - left) <= Math.abs(a.x - right) ? left : right;
          pts = [...pts.slice(0, i + 1), { x: nX, y: a.y }, { x: nX, y: b.y }, ...pts.slice(i + 1)];
        }
        changed = true; break;
      }
      if (changed) break;
    }
    if (!changed) break;
  }

  // Phase 3: Remove duplicate adjacent points
  const cl = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i], v = cl[cl.length - 1];
    if (Math.abs(p.x - v.x) > 0.5 || Math.abs(p.y - v.y) > 0.5) cl.push(p);
  }

  // Phase 4: Remove collinear mid-points
  const simplified = [cl[0]];
  for (let i = 1; i < cl.length - 1; i++) {
    const p = simplified[simplified.length - 1], c = cl[i], n = cl[i + 1];
    if (!(Math.abs(p.x - c.x) < 0.5 && Math.abs(c.x - n.x) < 0.5) &&
        !(Math.abs(p.y - c.y) < 0.5 && Math.abs(c.y - n.y) < 0.5)) simplified.push(c);
  }
  simplified.push(cl[cl.length - 1]);

  // Phase 5: Remove zigzag backtracks
  let out = simplified;
  let prevLen;
  do {
    prevLen = out.length;
    const clean = [out[0]];
    for (let i = 1; i < out.length - 1; i++) {
      const prev = clean[clean.length - 1], cur = out[i], next = out[i + 1];
      const allH = Math.abs(prev.y - cur.y) < 0.5 && Math.abs(cur.y - next.y) < 0.5;
      const allV = Math.abs(prev.x - cur.x) < 0.5 && Math.abs(cur.x - next.x) < 0.5;
      if (allH || allV) continue;
      clean.push(cur);
    }
    clean.push(out[out.length - 1]);
    out = clean;
  } while (out.length < prevLen);

  return out;
}

// Simplify: remove duplicates and collinear mid-points
function simplify(pts) {
  const cl = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i], v = cl[cl.length - 1];
    if (Math.abs(p.x - v.x) > 0.5 || Math.abs(p.y - v.y) > 0.5) cl.push(p);
  }
  if (cl.length <= 2) return cl;
  const out = [cl[0]];
  for (let i = 1; i < cl.length - 1; i++) {
    const p = out[out.length - 1], c = cl[i], n = cl[i + 1];
    if (!(Math.abs(p.x - c.x) < 0.5 && Math.abs(c.x - n.x) < 0.5) &&
        !(Math.abs(p.y - c.y) < 0.5 && Math.abs(c.y - n.y) < 0.5)) out.push(c);
  }
  out.push(cl[cl.length - 1]);
  return out;
}

// Build channel grid for a VNet from its bounding box and subnets
function buildChannels(vb, subs) {
  const IM = 10;
  const h0 = Math.round(vb.y + 38);
  const vl = Math.round(vb.x + IM);
  const vr = Math.round(vb.x + vb.w - IM);
  const vc = Math.round(vb.x + vb.w / 2);

  const hChannels = [h0];
  if (subs.length > 0) {
    const rows = {};
    subs.forEach(s => {
      const row = Math.round((s.y - vb.y - 70) / (s.h + 40));
      if (!rows[row]) rows[row] = [];
      rows[row].push(s);
    });
    const rowKeys = Object.keys(rows).map(Number).sort((a, b) => a - b);
    for (let i = 0; i < rowKeys.length - 1; i++) {
      const rowBottom = Math.max(...rows[rowKeys[i]].map(s => s.y + s.h));
      const nextRowTop = Math.min(...rows[rowKeys[i + 1]].map(s => s.y));
      hChannels.push(Math.round((rowBottom + nextRowTop) / 2));
    }
  }

  return { h: hChannels, h0, vl, vr, vc, v: [vl, vc, vr] };
}

// Channel-based branch routing
function branchRoute(hub, cp, ch, sub, vb) {
  if (Math.abs(cp.x - hub.x) < 1 && Math.abs(cp.y - hub.y) < 1) return [hub, cp];
  if (!ch || !vb) return simplify([{ ...hub }, { x: cp.x, y: hub.y }, { ...cp }]);

  const subRow = sub ? Math.round((sub.y - vb.y - 70) / (sub.h + 40)) : 0;

  if (subRow === 0) {
    return simplify([{ ...hub }, { x: cp.x, y: hub.y }, { ...cp }]);
  }

  const hIdx = Math.min(subRow, ch.h.length - 1);
  const hChannel = ch.h[hIdx];
  const bestV = ch.v.reduce((best, x) =>
    Math.abs(x - cp.x) < Math.abs(best - cp.x) ? x : best, ch.v[0]);

  return simplify([
    { ...hub },
    { x: bestV, y: hub.y },
    { x: bestV, y: hChannel },
    { x: cp.x, y: hChannel },
    { ...cp }
  ]);
}

function toPath(pts, R) {
  if (pts.length < 2) return '';
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1], c = pts[i], next = pts[i + 1];
    const d1 = Math.hypot(c.x - prev.x, c.y - prev.y);
    const d2 = Math.hypot(next.x - c.x, next.y - c.y);
    if (d1 === 0 || d2 === 0) { d += ` L${c.x},${c.y}`; continue; }
    const r = Math.min(R, d1 / 2, d2 / 2);
    d += ` L${c.x - (c.x - prev.x) / d1 * r},${c.y - (c.y - prev.y) / d1 * r}`;
    d += ` Q${c.x},${c.y} ${c.x + (next.x - c.x) / d2 * r},${c.y + (next.y - c.y) / d2 * r}`;
  }
  d += ` L${pts[pts.length - 1].x},${pts[pts.length - 1].y}`;
  return d;
}

function mergeShortSegments(pts, minLen) {
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = out[out.length - 1];
    const cur = pts[i];
    const dist = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    if (dist >= minLen) out.push(cur);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function countBends(pts) {
  let bends = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1], cur = pts[i], next = pts[i + 1];
    const wasH = Math.abs(prev.y - cur.y) < 1;
    const nowH = Math.abs(cur.y - next.y) < 1;
    if (wasH !== nowH) bends++;
  }
  return bends;
}

module.exports = {
  pad, segHits, hSide, orthoRoute, fixCollisions, simplify,
  buildChannels, branchRoute, toPath, mergeShortSegments, countBends
};
