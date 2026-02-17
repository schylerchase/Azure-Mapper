# SVG Line Routing Improvements

## Problem

The peering line routing system (L1852-L2291 in index.html) produces inconsistent, ugly paths:

- Lines overlap VNet boxes and subnet rectangles instead of routing cleanly around them
- Collision detours hug obstacle boundaries too tightly (1px clearance)
- Branch lines from hub to subnets cross each other and overlap
- Rounded corners collide when segments are shorter than 2*R
- Route scoring only considers length, not visual cleanliness

## Architecture

The routing system has 4 layers, all inside `renderPeeringLines()`:

1. **`orthoRoute(sp, so, ss, dp, dout, ds)`** — builds initial L/Z-shaped path between two points
2. **`fixCollisions(pts, obs)`** — post-hoc collision repair by splicing detour segments
3. **`bestExtRoute(srcId, dstId)`** — tries 5 side-combinations, picks best external route
4. **`trunkRoute(gwPt, gwSide, hub, obs)`** / **`branchRoute(hub, cp, obs)`** — internal VNet routing

Supporting utilities: `connPt`, `facing`, `stepOut/stepIn`, `hSide`, `pad`, `segHits`, `toPath`, `pathMid`

## Changes

### 1. fixCollisions — Proper Clearance and Orthogonal Detours

**Current**: Detours clear obstacles by 1px. Diagonal segments get crude L-bends that often still collide.

**Change**:
- Use `M` (20px) as clearance margin for detours, not 1px
- Before collision checking, decompose any non-orthogonal segments into orthogonal pairs
- After collision fixing, add a zigzag simplification pass that removes unnecessary back-and-forth bends (e.g., right-left-right becomes a single right segment)

### 2. branchRoute — Spatial Sorting and Column-Aware Routing

**Current**: Fixed 16px max spread, crude `dy < 60` heuristic, no inter-branch awareness.

**Change**:
- Sort subnets by their spatial position (left-to-right within each row, top-to-bottom across rows) before assigning hub offsets
- Assign hub X-offsets by subnet column position: left-column subnets get offsets to the left of hub center, right-column to the right
- Use available VNet width for spread (capped at column gap width), not a fixed 16px
- Route left-column branches: horizontal from hub offset then vertical down to subnet top
- Route right-column branches: mirror of left

### 3. bestExtRoute — Bend-Penalized Scoring

**Current**: Picks route with fewest points, then shortest length.

**Change**:
- Score formula: `totalLength + 50 * bendCount`
- A bend = any point where the path changes direction (horizontal to vertical or vice versa)
- This prefers cleaner routes even if slightly longer

### 4. orthoRoute — Obstacle-Aware Initial Path

**Current**: Pure geometry, no obstacle awareness.

**Change**:
- After computing the initial midpoint route, check if any segment would hit an obstacle in `extObs`
- If so, offset the midpoint to the nearest clear lane (above or below the obstacle cluster)
- This reduces the load on `fixCollisions` and produces cleaner starting paths

### 5. toPath — Short Segment Merging

**Current**: R is clamped to d/2 per segment, but very short segments still produce visual artifacts.

**Change**:
- After point array is finalized, merge segments shorter than `2*R` (16px) with their neighbor by removing the intermediate point
- This prevents corner arcs from overlapping

## Constants

| Name | Current | New | Purpose |
|------|---------|-----|---------|
| M | 20 | 20 | External margin (unchanged) |
| R | 8 | 8 | Corner radius (unchanged) |
| IM | 10 | 10 | Internal margin (unchanged) |
| Collision clearance | 1px | M (20px) | Gap between detour and obstacle |
| Branch spread max | 16px | dynamic | Based on VNet width |
| Bend penalty | N/A | 50 | Scoring weight for bends |

## Scope

All changes are within `renderPeeringLines()` (L1852-L2291) and its nested functions. No changes to layout functions, data model, or other rendering code.

## Risks

- Increased computation for collision fixing with larger clearance (mitigated by better initial routes)
- Branch sorting changes visual appearance for existing users (acceptable — current appearance is the problem)
