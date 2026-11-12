// Screen-space layout reads for the e2e suites: projects drawn meshes into the player's view so a
// test can assert what overlaps what on screen. Read-only; never touches game state.
import type { Page } from 'playwright';

/** View-plane box in degrees (x right, y up), from the camera's own frame. */
export interface ViewBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  /** Every projected vertex was in front of the camera (camera-space z < 0). */
  inFront: boolean;
  /** Number of vertices projected; 0 means nothing drawn was found. */
  vertices: number;
}

/**
 * One drawn mesh's on-screen shape: the convex hull of its projected bounding-box corners, in
 * view-plane tangent coordinates (x / -z, y / -z). Perspective maps straight lines to straight lines,
 * so this hull is the mesh box's true projected outline (a yawed card is a trapezoid, not a box).
 */
export type ViewPoly = Array<[number, number]>;

export interface ParkedEnemyBox {
  id: string;
  slot: number | null;
  /** Encounter distance at or inside the reach line: the view sits on its fan-slot goal. */
  parked: boolean;
  box: ViewBox | null;
  /** One projected hull per visible mesh (face, rim, halo...). */
  polys: ViewPoly[];
}

export interface PanelLayout {
  /** A card is revealed and its question panel mesh exists. */
  questionShown: boolean;
  panel: ViewBox | null;
  panelPolys: ViewPoly[];
  enemies: ParkedEnemyBox[];
}

/**
 * Page-side: projects the world-space bounding-box corners of every visible mesh under the question
 * panel and under each enemy view into camera space as angles atan(x / -z), atan(y / -z).
 */
export function readPanelLayout(page: Page): Promise<PanelLayout> {
  return page.evaluate(() => {
    const H = (window as any).__e2e;
    const w = H.world();
    const s = H.sys();
    const cam = w.camera;
    cam.updateWorldMatrix(true, false);
    const inv = cam.matrixWorld.clone().invert();
    const V = H.V();
    const DEG = 180 / Math.PI;
    // Monotone-chain convex hull, counter-clockwise, collinear points dropped.
    const hull = (pts: Array<[number, number]>): Array<[number, number]> => {
      const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      if (p.length < 3) return p;
      const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
      const lower: Array<[number, number]> = [];
      for (const q of p) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 1e-12) lower.pop();
        lower.push(q);
      }
      const upper: Array<[number, number]> = [];
      for (const q of [...p].reverse()) {
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 1e-12) upper.pop();
        upper.push(q);
      }
      return lower.slice(0, -1).concat(upper.slice(0, -1));
    };
    const project = (root: any): any => {
      if (!root) return { box: null, polys: [] };
      root.updateWorldMatrix(true, true);
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      let inFront = true;
      let vertices = 0;
      const polys: Array<Array<[number, number]>> = [];
      root.traverseVisible((o: any) => {
        if (!o.isMesh || !o.geometry) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        const b = o.geometry.boundingBox;
        const pts: Array<[number, number]> = [];
        for (const x of [b.min.x, b.max.x])
          for (const y of [b.min.y, b.max.y])
            for (const z of [b.min.z, b.max.z]) {
              const p = new V(x, y, z).applyMatrix4(o.matrixWorld).applyMatrix4(inv);
              vertices++;
              if (!(p.z < 0)) {
                inFront = false;
                continue;
              }
              const tx = p.x / -p.z;
              const ty = p.y / -p.z;
              pts.push([tx, ty]);
              const ax = Math.atan(tx) * DEG;
              const ay = Math.atan(ty) * DEG;
              minX = Math.min(minX, ax);
              maxX = Math.max(maxX, ax);
              minY = Math.min(minY, ay);
              maxY = Math.max(maxY, ay);
            }
        if (pts.length) polys.push(hull(pts));
      });
      return { box: { minX, maxX, minY, maxY, inFront, vertices }, polys };
    };
    const panelMesh = s.panel.panelMesh;
    const reach = s.wave.cfg.reachDistance;
    const enemies = [...s.enemies.views.entries()].map(([id, v]: [string, any]) => {
      const enemy = s.wave.active.find((e: any) => e.id === id);
      const pr = project(v.entity.object3D);
      return {
        id,
        slot: v.slot,
        parked: !!enemy && enemy.enc.distance <= reach + 1e-6,
        box: pr.box,
        polys: pr.polys,
      };
    });
    const panel = project(panelMesh);
    return {
      questionShown: s.wave.targetId !== null && !!panelMesh,
      panel: panel.box,
      panelPolys: panel.polys,
      enemies,
    };
  });
}

/** Non-empty and fully in front of the camera: a box an overlap check cannot pass vacuously on. */
export function isDrawnBox(b: ViewBox | null): b is ViewBox {
  return !!b && b.vertices > 0 && b.inFront && b.maxX > b.minX && b.maxY > b.minY;
}

/** Open-interval overlap: boxes that merely touch at an edge do not intersect. */
export function boxesIntersect(a: ViewBox, b: ViewBox): boolean {
  return a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;
}

/**
 * Separating-axis test on two convex polygons (tangent coords). Open: shapes that merely touch at an
 * edge do not intersect. Degenerate (< 3 point) polygons are treated as their point/segment set.
 */
export function polysIntersect(a: ViewPoly, b: ViewPoly): boolean {
  const axes = (p: ViewPoly): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    for (let i = 0; i < p.length; i++) {
      const [x1, y1] = p[i];
      const [x2, y2] = p[(i + 1) % p.length];
      if (x1 !== x2 || y1 !== y2) out.push([y1 - y2, x2 - x1]);
    }
    return out;
  };
  const range = (p: ViewPoly, [nx, ny]: [number, number]) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const [x, y] of p) {
      const d = x * nx + y * ny;
      lo = Math.min(lo, d);
      hi = Math.max(hi, d);
    }
    return [lo, hi];
  };
  for (const n of [...axes(a), ...axes(b)]) {
    const [aLo, aHi] = range(a, n);
    const [bLo, bHi] = range(b, n);
    if (aHi <= bLo || bHi <= aLo) return false;
  }
  return true;
}

/**
 * Lowest point (tangent y) of a convex polygon clipped to the vertical slab xLo <= x <= xHi, or null
 * when the polygon lies wholly outside the slab. The minimum of a convex shape over a slab sits on a
 * vertex inside the slab or on an edge crossing a slab wall.
 */
export function lowestYInSlab(p: ViewPoly, xLo: number, xHi: number): number | null {
  let lo = Infinity;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    if (x1 >= xLo && x1 <= xHi) lo = Math.min(lo, y1);
    for (const wall of [xLo, xHi]) {
      if ((x1 - wall) * (x2 - wall) < 0) lo = Math.min(lo, y1 + ((wall - x1) / (x2 - x1)) * (y2 - y1));
    }
  }
  return lo === Infinity ? null : lo;
}

const DEG = 180 / Math.PI;
/** Tangent coordinate to view angle in degrees. */
export const tanToDeg = (t: number): number => Math.atan(t) * DEG;

export function formatPoly(p: ViewPoly): string {
  return `[${p.map(([x, y]) => `(${tanToDeg(x).toFixed(2)},${tanToDeg(y).toFixed(2)})`).join(' ')}] deg`;
}

export function formatBox(b: ViewBox | null): string {
  if (!b) return 'null';
  const f = (n: number) => n.toFixed(2);
  return `x[${f(b.minX)}..${f(b.maxX)}] y[${f(b.minY)}..${f(b.maxY)}] deg (inFront=${b.inFront}, vertices=${b.vertices})`;
}
