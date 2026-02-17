# SVG Line Routing Improvements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix peering line routing so paths avoid obstacles with proper clearance, branches don't cross, and routes prefer clean geometry over shortest-path.

**Architecture:** Refine the existing 4-layer routing system inside `renderPeeringLines()` (index.html L1852-L2291). Each task modifies one routing function. All changes are inside this single function scope — no structural changes to the rest of the app.

**Tech Stack:** Vanilla JS, D3.js v7.9.0, SVG path generation. No build step — edit index.html directly. Test via `npm start` (Electron).

---

### Task 1: Extract routing functions into testable module

**Files:**
- Create: `routing.js`
- Create: `routing.test.js`
- Modify: `index.html:1884-1975` (geometry helpers + fixCollisions)

The routing functions are currently embedded inside `renderPeeringLines()` as closures. To enable testing, extract the pure geometry functions (those that don't depend on `boxes` or D3) into `routing.js`. The functions that remain in index.html will call these imported functions.

**Step 1: Create routing.js with extracted pure functions**

Create `routing.js` with these functions extracted verbatim from index.html:

```javascript
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

function fixCollisions(pts, obs) {
  for (let iter = 0; iter < 8; iter++) {
    let changed = false;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      for (const o of obs) {
        if (!segHits(a.x, a.y, b.x, b.y, o)) continue;
        if (Math.abs(a.y - b.y) < 1) {
          const above = o.y - 1, below = o.y + o.h + 1;
          const nY = Math.abs(a.y - above) <= Math.abs(a.y - below) ? above : below;
          pts = [...pts.slice(0, i + 1), { x: a.x, y: nY }, { x: b.x, y: nY }, ...pts.slice(i + 1)];
        } else if (Math.abs(a.x - b.x) < 1) {
          const left = o.x - 1, right = o.x + o.w + 1;
          const nX = Math.abs(a.x - left) <= Math.abs(a.x - right) ? left : right;
          pts = [...pts.slice(0, i + 1), { x: nX, y: a.y }, { x: nX, y: b.y }, ...pts.slice(i + 1)];
        } else {
          pts = [...pts.slice(0, i + 1), { x: b.x, y: a.y }, ...pts.slice(i + 1)];
        }
        changed = true; break;
      }
      if (changed) break;
    }
    if (!changed) break;
  }
  const cl = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i], v = cl[cl.length - 1];
    if (Math.abs(p.x - v.x) > 0.5 || Math.abs(p.y - v.y) > 0.5) cl.push(p);
  }
  const out = [cl[0]];
  for (let i = 1; i < cl.length - 1; i++) {
    const p = out[out.length - 1], c = cl[i], n = cl[i + 1];
    if (!(Math.abs(p.x - c.x) < 0.5 && Math.abs(c.x - n.x) < 0.5) &&
        !(Math.abs(p.y - c.y) < 0.5 && Math.abs(c.y - n.y) < 0.5)) out.push(c);
  }
  out.push(cl[cl.length - 1]);
  return out;
}

function branchRoute(hub, cp, obs) {
  if (Math.abs(cp.x - hub.x) < 1 && Math.abs(cp.y - hub.y) < 1) return [hub, cp];
  if (Math.abs(cp.x - hub.x) < 1) return fixCollisions([{ ...hub }, { ...cp }], obs);
  if (Math.abs(cp.y - hub.y) < 1) return fixCollisions([{ ...hub }, { ...cp }], obs);
  const dy = cp.y - hub.y;
  const pts = dy < 60
    ? [{ ...hub }, { x: cp.x, y: hub.y }, { ...cp }]
    : [{ ...hub }, { x: hub.x, y: cp.y }, { ...cp }];
  return fixCollisions(pts, obs);
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

module.exports = { pad, segHits, hSide, orthoRoute, fixCollisions, branchRoute, toPath };
```

**Step 2: Write baseline tests that capture current behavior**

Create `routing.test.js`:

```javascript
const { pad, segHits, hSide, orthoRoute, fixCollisions, branchRoute, toPath } = require('./routing');

describe('pad', () => {
  test('expands box by margin on all sides', () => {
    const b = { x: 100, y: 200, w: 50, h: 30 };
    expect(pad(b, 10)).toEqual({ x: 90, y: 190, w: 70, h: 50 });
  });
});

describe('segHits', () => {
  const box = { x: 50, y: 50, w: 100, h: 100 }; // 50,50 to 150,150

  test('horizontal segment through box hits', () => {
    expect(segHits(0, 100, 200, 100, box)).toBe(true);
  });
  test('vertical segment through box hits', () => {
    expect(segHits(100, 0, 100, 200, box)).toBe(true);
  });
  test('segment fully above box misses', () => {
    expect(segHits(0, 10, 200, 10, box)).toBe(false);
  });
  test('segment fully right of box misses', () => {
    expect(segHits(200, 0, 200, 200, box)).toBe(false);
  });
});

describe('hSide', () => {
  test('left is horizontal', () => { expect(hSide('left')).toBe(true); });
  test('right is horizontal', () => { expect(hSide('right')).toBe(true); });
  test('top is not horizontal', () => { expect(hSide('top')).toBe(false); });
  test('bottom is not horizontal', () => { expect(hSide('bottom')).toBe(false); });
});

describe('orthoRoute', () => {
  test('both horizontal sides, same Y → direct 4-point path', () => {
    const sp = { x: 0, y: 100 }, so = { x: 20, y: 100 };
    const dp = { x: 200, y: 100 }, dout = { x: 180, y: 100 };
    const pts = orthoRoute(sp, so, 'right', dp, dout, 'left');
    expect(pts).toHaveLength(4);
    expect(pts[0]).toEqual(sp);
    expect(pts[3]).toEqual(dp);
  });

  test('both horizontal sides, different Y → 6-point Z-route', () => {
    const sp = { x: 0, y: 50 }, so = { x: 20, y: 50 };
    const dp = { x: 200, y: 150 }, dout = { x: 180, y: 150 };
    const pts = orthoRoute(sp, so, 'right', dp, dout, 'left');
    expect(pts).toHaveLength(6);
    // Midpoint X should be average
    expect(pts[2].x).toBe(100);
    expect(pts[3].x).toBe(100);
  });

  test('mixed sides (horiz src, vert dst) → 5-point L-route', () => {
    const sp = { x: 0, y: 50 }, so = { x: 20, y: 50 };
    const dp = { x: 100, y: 200 }, dout = { x: 100, y: 180 };
    const pts = orthoRoute(sp, so, 'right', dp, dout, 'top');
    expect(pts).toHaveLength(5);
  });
});

describe('fixCollisions', () => {
  test('no obstacles → returns simplified points', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }];
    const result = fixCollisions(pts, []);
    // Collinear middle point should be removed
    expect(result).toHaveLength(2);
  });

  test('horizontal segment through obstacle → detours around', () => {
    const pts = [{ x: 0, y: 100 }, { x: 200, y: 100 }];
    const obs = [{ x: 80, y: 80, w: 40, h: 40 }]; // box at 80,80 → 120,120
    const result = fixCollisions(pts, obs);
    // Should have more points (detour)
    expect(result.length).toBeGreaterThan(2);
    // No segment should hit the obstacle
    for (let i = 0; i < result.length - 1; i++) {
      expect(segHits(result[i].x, result[i].y, result[i+1].x, result[i+1].y, obs[0])).toBe(false);
    }
  });
});

describe('branchRoute', () => {
  test('same point → returns 2-point path', () => {
    const hub = { x: 100, y: 50 };
    const cp = { x: 100, y: 50 };
    const result = branchRoute(hub, cp, []);
    expect(result).toHaveLength(2);
  });

  test('vertical alignment → straight line', () => {
    const hub = { x: 100, y: 50 };
    const cp = { x: 100, y: 150 };
    const result = branchRoute(hub, cp, []);
    expect(result).toHaveLength(2);
  });

  test('near subnet (dy < 60) → horizontal first', () => {
    const hub = { x: 100, y: 50 };
    const cp = { x: 200, y: 90 }; // dy = 40
    const result = branchRoute(hub, cp, []);
    // Should go: hub → (200,50) → cp
    expect(result.length).toBeGreaterThanOrEqual(2);
    // First move should be horizontal (y stays at hub.y)
    if (result.length >= 3) {
      expect(result[1].y).toBe(50);
      expect(result[1].x).toBe(200);
    }
  });
});

describe('toPath', () => {
  test('2 points → simple M...L', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    expect(toPath(pts, 8)).toBe('M0,0 L100,0');
  });

  test('3 points → includes quadratic curve at corner', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    const d = toPath(pts, 8);
    expect(d).toContain('M0,0');
    expect(d).toContain('Q');
    expect(d).toContain('L100,100');
  });

  test('empty/single point → empty string', () => {
    expect(toPath([], 8)).toBe('');
    expect(toPath([{ x: 0, y: 0 }], 8)).toBe('');
  });
});
```

**Step 3: Run tests to verify baseline passes**

Run: `npx jest routing.test.js -v`
Expected: All tests PASS (these test current behavior, not improved behavior).

**Step 4: Commit baseline extraction**

```bash
git add routing.js routing.test.js
git commit -m "refactor(routing): extract geometry functions into testable module"
```

---

### Task 2: Fix fixCollisions — proper clearance and zigzag cleanup

**Files:**
- Modify: `routing.js` (fixCollisions function)
- Modify: `routing.test.js` (add clearance tests)
- Modify: `index.html:1938-1975` (update inline copy to call module or replace)

**Step 1: Write tests for improved collision behavior**

Add to `routing.test.js`:

```javascript
describe('fixCollisions improved', () => {
  test('detours clear obstacles by margin, not 1px', () => {
    const M = 20;
    const pts = [{ x: 0, y: 100 }, { x: 200, y: 100 }];
    const obs = [{ x: 80, y: 80, w: 40, h: 40 }];
    const result = fixCollisions(pts, obs, M);
    // Detour Y should be at least M pixels from obstacle edges
    for (const p of result) {
      if (p.x > 80 && p.x < 120) {
        const distTop = Math.abs(p.y - 80);
        const distBottom = Math.abs(p.y - 120);
        const minDist = Math.min(distTop, distBottom);
        expect(minDist).toBeGreaterThanOrEqual(M - 1); // allow 1px float tolerance
      }
    }
  });

  test('removes unnecessary zigzag bends', () => {
    // A path that goes right, left, right should simplify
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 80, y: 0 },   // unnecessary backtrack
      { x: 200, y: 0 }
    ];
    const result = fixCollisions(pts, []);
    // Should simplify collinear + remove backtrack
    expect(result.length).toBeLessThanOrEqual(2);
  });

  test('diagonal segment gets decomposed into orthogonal', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 100 }];
    const obs = [{ x: 40, y: 40, w: 20, h: 20 }];
    const result = fixCollisions(pts, obs, 20);
    // All segments should be axis-aligned
    for (let i = 0; i < result.length - 1; i++) {
      const isHoriz = Math.abs(result[i].y - result[i+1].y) < 1;
      const isVert = Math.abs(result[i].x - result[i+1].x) < 1;
      expect(isHoriz || isVert).toBe(true);
    }
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx jest routing.test.js -v --testNamePattern="improved"`
Expected: FAIL (current fixCollisions uses 1px clearance and doesn't decompose diagonals).

**Step 3: Implement improved fixCollisions**

Replace `fixCollisions` in `routing.js` with:

```javascript
function fixCollisions(pts, obs, clearance) {
  const C = clearance || 1;  // backwards compatible default

  // Phase 1: Decompose diagonal segments into orthogonal pairs
  let work = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = work[work.length - 1], cur = pts[i];
    const isH = Math.abs(prev.y - cur.y) < 1;
    const isV = Math.abs(prev.x - cur.x) < 1;
    if (!isH && !isV) {
      // Diagonal — decompose: go horizontal first, then vertical
      work.push({ x: cur.x, y: prev.y });
    }
    work.push(cur);
  }
  pts = work;

  // Phase 2: Route around obstacles with proper clearance
  for (let iter = 0; iter < 12; iter++) {
    let changed = false;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      for (const o of obs) {
        if (!segHits(a.x, a.y, b.x, b.y, o)) continue;
        if (Math.abs(a.y - b.y) < 1) {
          // Horizontal segment — detour above or below with clearance
          const above = o.y - C, below = o.y + o.h + C;
          const nY = Math.abs(a.y - above) <= Math.abs(a.y - below) ? above : below;
          pts = [...pts.slice(0, i + 1), { x: a.x, y: nY }, { x: b.x, y: nY }, ...pts.slice(i + 1)];
        } else if (Math.abs(a.x - b.x) < 1) {
          // Vertical segment — detour left or right with clearance
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

  // Phase 5: Remove zigzag backtracks (A→B→C where B reverses direction)
  let out = simplified;
  let prevLen;
  do {
    prevLen = out.length;
    const clean = [out[0]];
    for (let i = 1; i < out.length - 1; i++) {
      const prev = clean[clean.length - 1], cur = out[i], next = out[i + 1];
      // Check if cur is a backtrack: same axis as both neighbors and between them
      const allH = Math.abs(prev.y - cur.y) < 0.5 && Math.abs(cur.y - next.y) < 0.5;
      const allV = Math.abs(prev.x - cur.x) < 0.5 && Math.abs(cur.x - next.x) < 0.5;
      if (allH || allV) continue; // skip collinear mid-point (already handled, but safety)
      clean.push(cur);
    }
    clean.push(out[out.length - 1]);
    out = clean;
  } while (out.length < prevLen);

  return out;
}
```

**Step 4: Run tests**

Run: `npx jest routing.test.js -v`
Expected: All tests PASS including the new "improved" tests.

**Step 5: Update index.html to use clearance parameter**

In `index.html`, update all calls to `fixCollisions` to pass `M` as the clearance:
- L1998: `fixCollisions(raw.map(p => ({ ...p })), obs)` → `fixCollisions(raw.map(p => ({ ...p })), obs, M)`
- L2029: `fixCollisions(pts, obs)` → `fixCollisions(pts, obs, IM)`
- L2035-2043: All `fixCollisions` calls in `branchRoute` → pass `IM`

Also replace the inline `fixCollisions` function body in index.html with the new version from routing.js (keep it inline since index.html can't `require()` — it's a browser context).

**Step 6: Visual test**

Run: `npm start`
Load sample data. Verify peering lines route around VNet boxes with visible clearance gaps instead of hugging edges.

**Step 7: Commit**

```bash
git add routing.js routing.test.js index.html
git commit -m "fix(routing): use proper clearance in collision detours and decompose diagonals"
```

---

### Task 3: Fix bestExtRoute — bend-penalized scoring

**Files:**
- Modify: `routing.js` (add `countBends` helper, export it)
- Modify: `routing.test.js` (add scoring tests)
- Modify: `index.html:1985-2005` (update scoring logic)

**Step 1: Write tests for bend counting and scoring**

Add to `routing.test.js`:

```javascript
const { countBends } = require('./routing');

describe('countBends', () => {
  test('straight line has 0 bends', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    expect(countBends(pts)).toBe(0);
  });
  test('L-shape has 1 bend', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    expect(countBends(pts)).toBe(1);
  });
  test('Z-shape has 2 bends', () => {
    const pts = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 50 }];
    expect(countBends(pts)).toBe(2);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx jest routing.test.js -v --testNamePattern="countBends"`
Expected: FAIL (countBends not yet defined).

**Step 3: Implement countBends**

Add to `routing.js`:

```javascript
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
```

Export it: add `countBends` to `module.exports`.

**Step 4: Run tests**

Run: `npx jest routing.test.js -v`
Expected: All PASS.

**Step 5: Update bestExtRoute scoring in index.html**

Replace L2001 scoring logic:
```javascript
// OLD:
if (!best || pts.length < best.pts.length || (pts.length === best.pts.length && len < best.len))
  best = { ss, ds, pts, len };

// NEW:
const bends = countBends(pts);
const score = len + 50 * bends;
if (!best || score < best.score)
  best = { ss, ds, pts, len, score };
```

Also add the `countBends` function inline in the `renderPeeringLines` scope (same pattern as other helpers).

**Step 6: Visual test**

Run: `npm start`
Verify that peering lines prefer paths with fewer bends even if slightly longer.

**Step 7: Commit**

```bash
git add routing.js routing.test.js index.html
git commit -m "fix(routing): prefer fewer bends in external route scoring"
```

---

### Task 4: Fix branchRoute — spatial sorting and column-aware routing

**Files:**
- Modify: `routing.js` (update `branchRoute`)
- Modify: `routing.test.js` (add column-aware tests)
- Modify: `index.html:2201-2249` (sort subnets, use column-aware spread and routing)

This is the highest-impact change. The branch rendering loop at L2201-2249 needs to:
1. Sort subnets spatially before routing
2. Use column-aware hub offsets
3. Route branches with consistent horizontal-then-vertical or vertical-then-horizontal based on column

**Step 1: Write tests for improved branch routing**

Add to `routing.test.js`:

```javascript
describe('branchRoute column-aware', () => {
  test('left-column subnet routes horizontal then vertical', () => {
    const hub = { x: 150, y: 50 };
    const cp = { x: 80, y: 150 };  // left column, below hub
    const result = branchRoute(hub, cp, []);
    // First segment from hub should be horizontal (toward subnet X)
    if (result.length >= 3) {
      expect(Math.abs(result[0].y - result[1].y)).toBeLessThan(1); // horizontal
    }
  });

  test('right-column subnet routes horizontal then vertical', () => {
    const hub = { x: 150, y: 50 };
    const cp = { x: 250, y: 150 };  // right column, below hub
    const result = branchRoute(hub, cp, []);
    if (result.length >= 3) {
      expect(Math.abs(result[0].y - result[1].y)).toBeLessThan(1); // horizontal
    }
  });

  test('routes around obstacle without crossing it', () => {
    const hub = { x: 150, y: 50 };
    const cp = { x: 80, y: 200 };
    const obs = [{ x: 60, y: 100, w: 60, h: 50 }]; // obstacle between hub and cp
    const result = branchRoute(hub, cp, obs);
    for (let i = 0; i < result.length - 1; i++) {
      expect(segHits(result[i].x, result[i].y, result[i+1].x, result[i+1].y, obs[0])).toBe(false);
    }
  });
});
```

**Step 2: Implement improved branchRoute**

Replace `branchRoute` in `routing.js`:

```javascript
function branchRoute(hub, cp, obs) {
  if (Math.abs(cp.x - hub.x) < 1 && Math.abs(cp.y - hub.y) < 1) return [hub, cp];
  if (Math.abs(cp.x - hub.x) < 1) return fixCollisions([{ ...hub }, { ...cp }], obs);
  if (Math.abs(cp.y - hub.y) < 1) return fixCollisions([{ ...hub }, { ...cp }], obs);

  // Always route horizontal-first then vertical: hub → (cp.x, hub.y) → cp
  // This creates clean fan-out from the hub with parallel vertical drops
  const pts = [{ ...hub }, { x: cp.x, y: hub.y }, { ...cp }];
  return fixCollisions(pts, obs);
}
```

**Step 3: Update branch rendering loop in index.html (L2201-2249)**

Replace the subnet sorting and spread logic:

```javascript
// ── Branches + endpoint dots (once per VNet) ──

[{ vnetId: sourceId, hub: hubSrc, obs: srcSubObs },
 { vnetId: remoteId, hub: hubDst, obs: dstSubObs }].forEach(({ vnetId, hub, obs }) => {
  if (branchesDrawn.has(vnetId)) return;
  branchesDrawn.add(vnetId);
  const subs = subBoxes[vnetId] || [];
  if (subs.length === 0) {
    peerG.append('circle').attr('class', 'peering-ep')
      .attr('cx', hub.x).attr('cy', hub.y).attr('r', 4)
      .attr('fill', 'var(--peer-color)').attr('fill-opacity', .3)
      .attr('stroke', 'var(--peer-color)').attr('stroke-width', 1.2);
    return;
  }

  // Sort subnets left-to-right, top-to-bottom for consistent branch ordering
  const sorted = [...subs].sort((a, b) => {
    const rowA = Math.round(a.y / 50), rowB = Math.round(b.y / 50);
    if (rowA !== rowB) return rowA - rowB;
    return a.x - b.x;
  });

  // Dynamic spread: use available VNet width, cap at 24px per gap
  const vb = boxes[vnetId];
  const maxSpread = sorted.length > 1 ? (vb.w - 2 * IM) / (sorted.length - 1) : 0;
  const SPREAD = sorted.length > 1 ? Math.min(24, maxSpread) : 0;
  const spreadStart = -SPREAD * (sorted.length - 1) / 2;

  sorted.forEach((sub, si) => {
    const cp = { x: sub.x + sub.w / 2, y: sub.y - 6 };
    const brObs = sorted.filter(s => s !== sub).map(b => pad(b, IM));
    const branchHub = { x: hub.x + spreadStart + si * SPREAD, y: hub.y };
    const bPts = branchRoute(branchHub, cp, brObs);

    // ... (rest of rendering: NSG state, path, endpoint dot, tooltip — unchanged)
```

**Step 4: Run tests**

Run: `npx jest routing.test.js -v`
Expected: All PASS.

**Step 5: Visual test**

Run: `npm start`
Verify branches fan out cleanly from hub without crossing. Left-column subnets should have branches going left, right-column going right.

**Step 6: Commit**

```bash
git add routing.js routing.test.js index.html
git commit -m "fix(routing): sort subnets spatially and use horizontal-first branch routing"
```

---

### Task 5: Add short-segment merging to toPath

**Files:**
- Modify: `routing.js` (`mergeShortSegments` + update `toPath`)
- Modify: `routing.test.js`
- Modify: `index.html:2065-2079`

**Step 1: Write tests for segment merging**

Add to `routing.test.js`:

```javascript
const { mergeShortSegments } = require('./routing');

describe('mergeShortSegments', () => {
  test('removes points creating segments shorter than threshold', () => {
    // Points with a tiny segment in the middle
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 105, y: 0 },  // only 5px from previous — too short for R=8
      { x: 200, y: 0 }
    ];
    const result = mergeShortSegments(pts, 16);
    expect(result.length).toBeLessThan(pts.length);
  });

  test('keeps segments longer than threshold', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 }
    ];
    const result = mergeShortSegments(pts, 16);
    expect(result).toHaveLength(3);
  });

  test('always preserves start and end points', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 }
    ];
    const result = mergeShortSegments(pts, 16);
    expect(result[0]).toEqual({ x: 0, y: 0 });
    expect(result[result.length - 1]).toEqual({ x: 10, y: 0 });
  });
});
```

**Step 2: Implement mergeShortSegments**

Add to `routing.js`:

```javascript
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
```

Export it.

**Step 3: Run tests**

Run: `npx jest routing.test.js -v`
Expected: All PASS.

**Step 4: Apply mergeShortSegments before toPath calls in index.html**

At L2180 and L2237, add merging before `toPath()`:
```javascript
// Before: .attr('d', toPath(spine))
// After:  .attr('d', toPath(mergeShortSegments(spine, 2 * R)))

// Before: .attr('d', toPath(bPts))
// After:  .attr('d', toPath(mergeShortSegments(bPts, 2 * R)))
```

**Step 5: Visual test**

Run: `npm start`
Verify corners render smoothly without overlapping arcs.

**Step 6: Commit**

```bash
git add routing.js routing.test.js index.html
git commit -m "fix(routing): merge short segments to prevent corner arc overlap"
```

---

### Task 6: Final integration test and cleanup

**Files:**
- Modify: `index.html` (ensure all inline copies match routing.js)
- Modify: `package.json` (if needed — add routing files to build)

**Step 1: Run full test suite**

Run: `npx jest -v`
Expected: All tests pass (both `main-utils.test.js` and `routing.test.js`).

**Step 2: Visual integration test**

Run: `npm start`
Load sample Azure data with multiple VNets and peering connections. Verify:
- [ ] External lines route around VNet boxes with visible clearance
- [ ] Branch lines fan out cleanly without crossing
- [ ] Rounded corners are smooth (no overlapping arcs)
- [ ] Lines prefer fewer bends over shortest path
- [ ] Labels don't overlap with lines
- [ ] All three layout modes (Grid, Landing Zone, Executive) render correctly

**Step 3: Commit final integration**

```bash
git add -A
git commit -m "fix(routing): complete SVG line routing overhaul"
```
