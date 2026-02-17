const {
  pad, segHits, hSide, orthoRoute, fixCollisions, simplify,
  buildChannels, branchRoute, toPath, mergeShortSegments, countBends
} = require('./routing');

// ── helpers ───────────────────────────────────────────────
// Standard 2-column VNet layout for channel tests
function makeVNet(x, y) {
  return { x, y, w: 660, h: 400, cx: x + 330 };
}

function makeSubs(vb) {
  // 2 columns × 2 rows, matching real layout constants
  const SUBNET_W = 280, SUBNET_GAP = 40, PAD = 30, PAD_TOP = 70, SUB_H = 140;
  const subs = [];
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      subs.push({
        x: vb.x + PAD + col * (SUBNET_W + SUBNET_GAP),
        y: vb.y + PAD_TOP + row * (SUB_H + SUBNET_GAP),
        w: SUBNET_W,
        h: SUB_H
      });
    }
  }
  return subs;
}

// ── pad ───────────────────────────────────────────────────
describe('pad', () => {
  test('expands box by margin on all sides', () => {
    const b = { x: 100, y: 200, w: 50, h: 30 };
    expect(pad(b, 10)).toEqual({ x: 90, y: 190, w: 70, h: 50 });
  });
});

// ── segHits ───────────────────────────────────────────────
describe('segHits', () => {
  const box = { x: 50, y: 50, w: 100, h: 100 };

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

// ── hSide ─────────────────────────────────────────────────
describe('hSide', () => {
  test('left is horizontal', () => { expect(hSide('left')).toBe(true); });
  test('right is horizontal', () => { expect(hSide('right')).toBe(true); });
  test('top is not horizontal', () => { expect(hSide('top')).toBe(false); });
  test('bottom is not horizontal', () => { expect(hSide('bottom')).toBe(false); });
});

// ── orthoRoute ────────────────────────────────────────────
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

// ── fixCollisions ─────────────────────────────────────────
describe('fixCollisions', () => {
  test('no obstacles → returns simplified points', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }];
    const result = fixCollisions(pts, []);
    expect(result).toHaveLength(2);
  });

  test('horizontal segment through obstacle → detours around', () => {
    const pts = [{ x: 0, y: 100 }, { x: 200, y: 100 }];
    const obs = [{ x: 80, y: 80, w: 40, h: 40 }];
    const result = fixCollisions(pts, obs);
    expect(result.length).toBeGreaterThan(2);
    for (let i = 0; i < result.length - 1; i++) {
      expect(segHits(result[i].x, result[i].y, result[i+1].x, result[i+1].y, obs[0])).toBe(false);
    }
  });

  test('detours clear obstacles by margin', () => {
    const M = 20;
    const pts = [{ x: 0, y: 100 }, { x: 200, y: 100 }];
    const obs = [{ x: 80, y: 80, w: 40, h: 40 }];
    const result = fixCollisions(pts, obs, M);
    for (const p of result) {
      if (p.x > 80 && p.x < 120) {
        const distTop = Math.abs(p.y - 80);
        const distBottom = Math.abs(p.y - 120);
        const minDist = Math.min(distTop, distBottom);
        expect(minDist).toBeGreaterThanOrEqual(M - 1);
      }
    }
  });

  test('removes unnecessary zigzag bends', () => {
    const pts = [
      { x: 0, y: 0 }, { x: 100, y: 0 },
      { x: 80, y: 0 }, { x: 200, y: 0 }
    ];
    const result = fixCollisions(pts, []);
    expect(result.length).toBeLessThanOrEqual(2);
  });

  test('diagonal segment gets decomposed into orthogonal', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 100 }];
    const obs = [{ x: 40, y: 40, w: 20, h: 20 }];
    const result = fixCollisions(pts, obs, 20);
    for (let i = 0; i < result.length - 1; i++) {
      const isHoriz = Math.abs(result[i].y - result[i+1].y) < 1;
      const isVert = Math.abs(result[i].x - result[i+1].x) < 1;
      expect(isHoriz || isVert).toBe(true);
    }
  });
});

// ── simplify ──────────────────────────────────────────────
describe('simplify', () => {
  test('removes duplicate adjacent points', () => {
    const pts = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }];
    expect(simplify(pts)).toHaveLength(2);
  });

  test('removes collinear mid-points', () => {
    const pts = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }];
    expect(simplify(pts)).toHaveLength(2);
  });

  test('preserves real bends', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    expect(simplify(pts)).toHaveLength(3);
  });

  test('2 points or fewer → unchanged', () => {
    const pts = [{ x: 5, y: 5 }, { x: 10, y: 10 }];
    expect(simplify(pts)).toHaveLength(2);
  });
});

// ── buildChannels ─────────────────────────────────────────
describe('buildChannels', () => {
  test('returns correct structure for VNet with subnets', () => {
    const vb = makeVNet(100, 100);
    const subs = makeSubs(vb);
    const ch = buildChannels(vb, subs);

    expect(ch.h0).toBe(Math.round(vb.y + 38));
    expect(ch.vl).toBe(Math.round(vb.x + 10));
    expect(ch.vr).toBe(Math.round(vb.x + vb.w - 10));
    expect(ch.vc).toBe(Math.round(vb.x + vb.w / 2));
    expect(ch.v).toEqual([ch.vl, ch.vc, ch.vr]);
    expect(ch.h).toContain(ch.h0);
  });

  test('horizontal channels include row gap midpoints', () => {
    const vb = makeVNet(100, 100);
    const subs = makeSubs(vb);
    const ch = buildChannels(vb, subs);

    // 2 rows → 1 row gap → H0 + 1 mid-gap = 2 horizontal channels
    expect(ch.h.length).toBe(2);
    // The row-gap channel should be between row 0 bottom and row 1 top
    const row0Bottom = Math.max(subs[0].y + subs[0].h, subs[1].y + subs[1].h);
    const row1Top = Math.min(subs[2].y, subs[3].y);
    const expectedMid = Math.round((row0Bottom + row1Top) / 2);
    expect(ch.h[1]).toBe(expectedMid);
  });

  test('VNet with no subnets → only H0 channel', () => {
    const vb = makeVNet(200, 200);
    const ch = buildChannels(vb, []);
    expect(ch.h).toEqual([Math.round(vb.y + 38)]);
  });

  test('single-row layout → only H0 channel', () => {
    const vb = makeVNet(0, 0);
    // Just row 0 subnets
    const subs = makeSubs(vb).slice(0, 2);
    const ch = buildChannels(vb, subs);
    expect(ch.h).toEqual([ch.h0]);
  });
});

// ── branchRoute (channel-based) ───────────────────────────
describe('branchRoute', () => {
  const vb = makeVNet(100, 100);
  const subs = makeSubs(vb);
  const ch = buildChannels(vb, subs);
  const hub = { x: vb.x + vb.w / 2, y: ch.h0 };

  test('same point → 2-point path', () => {
    const result = branchRoute(hub, { ...hub }, ch, null, vb);
    expect(result).toHaveLength(2);
  });

  test('row-0 target → L-route (horizontal on H0, vertical drop)', () => {
    const cp = { x: subs[0].x + subs[0].w / 2, y: subs[0].y - 2 };
    const result = branchRoute(hub, cp, ch, subs[0], vb);

    // Should be a simple L: hub → (cp.x, hub.y) → cp
    expect(result.length).toBeLessThanOrEqual(3);
    // First segment is horizontal (same y as hub)
    expect(Math.abs(result[0].y - hub.y)).toBeLessThan(1);
  });

  test('row-1 target → routes through vertical + horizontal channels', () => {
    const cp = { x: subs[2].x + subs[2].w / 2, y: subs[2].y - 2 };
    const result = branchRoute(hub, cp, ch, subs[2], vb);

    // Should use channel routing: hub → vChannel → hChannel → target
    expect(result.length).toBeGreaterThanOrEqual(3);
    // All segments should be orthogonal
    for (let i = 0; i < result.length - 1; i++) {
      const isH = Math.abs(result[i].y - result[i+1].y) < 1;
      const isV = Math.abs(result[i].x - result[i+1].x) < 1;
      expect(isH || isV).toBe(true);
    }
  });

  test('row-1 target uses a known horizontal channel', () => {
    const cp = { x: subs[2].x + subs[2].w / 2, y: subs[2].y - 2 };
    const result = branchRoute(hub, cp, ch, subs[2], vb);

    // At least one intermediate point should be on a horizontal channel
    const onChannel = result.some(p => ch.h.includes(Math.round(p.y)));
    expect(onChannel).toBe(true);
  });

  test('no channel grid → fallback L-route', () => {
    const cp = { x: 200, y: 300 };
    const result = branchRoute(hub, cp, null, null, vb);
    expect(result.length).toBeGreaterThanOrEqual(2);
    // Should still produce orthogonal segments
    for (let i = 0; i < result.length - 1; i++) {
      const isH = Math.abs(result[i].y - result[i+1].y) < 1;
      const isV = Math.abs(result[i].x - result[i+1].x) < 1;
      expect(isH || isV).toBe(true);
    }
  });

  test('routes use nearest vertical channel', () => {
    // Target in right column, row 1 → should prefer VC or VR
    const cp = { x: subs[3].x + subs[3].w / 2, y: subs[3].y - 2 };
    const result = branchRoute(hub, cp, ch, subs[3], vb);

    // Find vertical channel used (point with x matching a v-channel but not hub.x or cp.x)
    const vChannelsUsed = result.filter(p =>
      ch.v.includes(Math.round(p.x)) &&
      Math.abs(p.x - hub.x) > 1 &&
      Math.abs(p.x - cp.x) > 1
    );
    if (vChannelsUsed.length > 0) {
      const usedX = vChannelsUsed[0].x;
      // Should be the nearest v-channel to cp.x
      const nearest = ch.v.reduce((best, x) =>
        Math.abs(x - cp.x) < Math.abs(best - cp.x) ? x : best, ch.v[0]);
      expect(Math.abs(usedX - nearest)).toBeLessThan(2);
    }
  });
});

// ── toPath ────────────────────────────────────────────────
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

// ── mergeShortSegments ────────────────────────────────────
describe('mergeShortSegments', () => {
  test('removes points creating segments shorter than threshold', () => {
    const pts = [
      { x: 0, y: 0 }, { x: 100, y: 0 },
      { x: 105, y: 0 }, { x: 200, y: 0 }
    ];
    const result = mergeShortSegments(pts, 16);
    expect(result.length).toBeLessThan(pts.length);
  });

  test('keeps segments longer than threshold', () => {
    const pts = [
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }
    ];
    const result = mergeShortSegments(pts, 16);
    expect(result).toHaveLength(3);
  });

  test('always preserves start and end points', () => {
    const pts = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }];
    const result = mergeShortSegments(pts, 16);
    expect(result[0]).toEqual({ x: 0, y: 0 });
    expect(result[result.length - 1]).toEqual({ x: 10, y: 0 });
  });
});

// ── countBends ────────────────────────────────────────────
describe('countBends', () => {
  test('straight line has 0 bends', () => {
    expect(countBends([{ x: 0, y: 0 }, { x: 100, y: 0 }])).toBe(0);
  });
  test('L-shape has 1 bend', () => {
    expect(countBends([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }])).toBe(1);
  });
  test('Z-shape has 2 bends', () => {
    expect(countBends([
      { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 50 }
    ])).toBe(2);
  });
});
