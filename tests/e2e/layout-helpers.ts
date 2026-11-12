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

export interface ParkedEnemyBox {
  id: string;
  slot: number | null;
  /** Encounter distance at or inside the reach line: the view sits on its fan-slot goal. */
  parked: boolean;
  box: ViewBox | null;
}

export interface PanelLayout {
  /** A card is revealed and its question panel mesh exists. */
  questionShown: boolean;
  panel: ViewBox | null;
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
    const project = (root: any): any => {
      if (!root) return null;
      root.updateWorldMatrix(true, true);
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      let inFront = true;
      let vertices = 0;
      root.traverseVisible((o: any) => {
        if (!o.isMesh || !o.geometry) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        const b = o.geometry.boundingBox;
        for (const x of [b.min.x, b.max.x])
          for (const y of [b.min.y, b.max.y])
            for (const z of [b.min.z, b.max.z]) {
              const p = new V(x, y, z).applyMatrix4(o.matrixWorld).applyMatrix4(inv);
              vertices++;
              if (!(p.z < 0)) {
                inFront = false;
                continue;
              }
              const ax = Math.atan(p.x / -p.z) * DEG;
              const ay = Math.atan(p.y / -p.z) * DEG;
              minX = Math.min(minX, ax);
              maxX = Math.max(maxX, ax);
              minY = Math.min(minY, ay);
              maxY = Math.max(maxY, ay);
            }
      });
      return { minX, maxX, minY, maxY, inFront, vertices };
    };
    const panelMesh = s.panel.panelMesh;
    const reach = s.wave.cfg.reachDistance;
    const enemies = [...s.enemies.views.entries()].map(([id, v]: [string, any]) => {
      const enemy = s.wave.active.find((e: any) => e.id === id);
      return {
        id,
        slot: v.slot,
        parked: !!enemy && enemy.enc.distance <= reach + 1e-6,
        box: project(v.entity.object3D),
      };
    });
    return {
      questionShown: s.wave.targetId !== null && !!panelMesh,
      panel: project(panelMesh),
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

export function formatBox(b: ViewBox | null): string {
  if (!b) return 'null';
  const f = (n: number) => n.toFixed(2);
  return `x[${f(b.minX)}..${f(b.maxX)}] y[${f(b.minY)}..${f(b.maxY)}] deg (inFront=${b.inFront}, vertices=${b.vertices})`;
}
