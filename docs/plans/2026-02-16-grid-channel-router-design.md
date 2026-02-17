# Grid-Channel Router Design

## Problem

Peering lines cut through subnet boxes. The current approach routes freely then tries to fix collisions via iteration — this fails in dense 2-column grids where padded obstacles overlap and fixCollisions can't find a clear path.

## Solution

Pre-compute a grid of safe routing channels from the actual subnet layout. Route all internal lines (trunks + branches) exclusively through these channels. No collision detection needed — channels are safe by construction.

## Channel Grid

For each VNet, derive channels from subnet positions:

```
┌──────────────────────────────────────────┐
│ VNET HEADER                              │
│ ══════ H0 (corridor, y+26) ════════════ │
│ VL  ┌────────┐  VC  ┌────────┐      VR │
│  │  │ sub-0  │   │  │ sub-1  │       │  │
│  │  │        │   │  │        │       │  │
│  │  └────────┘   │  └────────┘       │  │
│ ══════ H1 (row gap midpoint) ══════════ │
│  │  ┌────────┐   │  ┌────────┐       │  │
│  │  │ sub-2  │   │  │ sub-3  │       │  │
│  │  └────────┘   │  └────────┘       │  │
└──────────────────────────────────────────┘
```

### Vertical channels
- **VL**: `vb.x + IM` — left margin
- **VR**: `vb.x + vb.w - IM` — right margin
- **VC**: midpoint of column gap (`col0.x + col0.w + SUBNET_GAP/2`)

### Horizontal channels
- **H0**: `vb.y + 26` — header corridor (above all subnets)
- **H1..Hn**: midpoint of each row gap (`row[i].bottom + SUBNET_GAP/2`)

## Routing Rules

### Trunk (GW → hub)
1. GW connector is on VNet edge at corridor height (H0)
2. Route horizontally along H0 to hub (VNet center)
3. For top/bottom GW: step to nearest VL/VR, then to H0, then to hub

### Branch (hub → subnet)
1. From hub, go horizontal on H0 to the best vertical channel
2. Drop vertically on that channel to the horizontal channel above the target row
3. Go horizontal to target subnet center
4. Short vertical drop to endpoint (sub.y - 2)

### Channel selection for branches
- Target in row 0: direct L-route from H0 (no vertical channel needed, just drop)
- Target in col 0, row > 0: use VL or VC
- Target in col 1, row > 0: use VC or VR
- Pick whichever channel is closer to the target subnet center

## What changes

| Component | Before | After |
|-----------|--------|-------|
| `trunkRoute` | fixCollisions-based | Channel-snapped, no iteration |
| `branchRoute` | fixCollisions or blocker-check | Channel-snapped, deterministic |
| `hubPt` | Fixed offset | Derived from H0 channel |
| `connPt` (left/right) | corridor Y offset | Uses H0 from channel grid |
| Internal fixCollisions calls | Multiple per render | Zero |

## What stays the same
- External routing (bestExtRoute, orthoRoute, fixCollisions for inter-VNet)
- toPath, mergeShortSegments, countBends
- GW icons, endpoint dots, NSG coloring, tooltips
- Layout constants (VNET_PAD, SUBNET_PAD_TOP, SUBNET_W, SUBNET_GAP, etc.)

## Performance
- Channel computation: O(subnets) per VNet
- Each trunk/branch: O(1) — no iteration
- Total internal routing: O(subnets) vs O(subnets × obstacles × iterations) before
