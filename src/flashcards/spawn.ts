// Pure spawn-point picker: card enemies emerge from detected walls in front of the player, with an
// evenly spread ring fallback. No three.js; plain {x,y,z} in metres, angles in radians. Yaw follows
// three.js (Y up, yaw 0 faces -Z), so a point's bearing is atan2(-(dx), -(dz)).

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** A vertical plane: width runs horizontally along the wall, height vertically. */
export interface Wall {
  center: Vec3;
  normal: Vec3;
  width: number;
  height: number;
}

export interface HeadPose {
  position: Vec3;
  yawRad: number;
}

export interface SpawnPoint {
  position: Vec3;
  source: 'wall' | 'ring';
}

export const SPAWN_MIN_DISTANCE = 1.2;
export const SPAWN_MAX_DISTANCE = 3.5;
export const SPAWN_HALF_ARC_DEG = 35;
export const SPAWN_MIN_BEARING_GAP_DEG = 15;
export const RING_FALLBACK_DISTANCE = 2.5;

const DEG = Math.PI / 180;
// Candidate spacing along each wall; fine enough that a 15-degree gap is always resolvable.
const SAMPLE_STEP = 0.05;
// Backstop on samples per wall; the clipped span is at most 2 * SPAWN_MAX_DISTANCE (140 steps).
const MAX_STEPS = 2000;
const EPS = 1e-9;

function wrap(a: number): number {
  let r = a % (2 * Math.PI);
  if (r > Math.PI) r -= 2 * Math.PI;
  else if (r < -Math.PI) r += 2 * Math.PI;
  return r;
}

interface Candidate {
  position: Vec3;
  bearing: number;
}

function wallCandidates(wall: Wall, head: HeadPose): Candidate[] {
  const { center, normal, width, height } = wall;
  const fields = [center.x, center.y, center.z, normal.x, normal.y, normal.z, width, height];
  if (!fields.every(Number.isFinite) || width < 0) return [];
  const n = Math.hypot(normal.x, normal.z);
  // A horizontal-only or degenerate normal has no horizontal tangent; it is not a wall.
  if (!(n > EPS)) return [];
  const tx = -normal.z / n;
  const tz = normal.x / n;
  const half = height / 2;
  // Head height when the wall spans it, else the nearest edge of the wall.
  const y = Math.min(Math.max(head.position.y, center.y - half), center.y + half);
  // Only the stretch of wall within SPAWN_MAX_DISTANCE of the head can qualify, so a huge wall
  // costs no more than a normal one.
  const headAlong = (head.position.x - center.x) * tx + (head.position.z - center.z) * tz;
  const lo = Math.max(-width / 2, headAlong - SPAWN_MAX_DISTANCE);
  const hi = Math.min(width / 2, headAlong + SPAWN_MAX_DISTANCE);
  if (!(hi >= lo)) return [];
  const steps = Math.min(MAX_STEPS, Math.max(1, Math.ceil((hi - lo) / SAMPLE_STEP)));
  const out: Candidate[] = [];
  for (let i = 0; i <= steps; i++) {
    const along = lo + ((hi - lo) * i) / steps;
    const position = { x: center.x + tx * along, y, z: center.z + tz * along };
    const dx = position.x - head.position.x;
    const dz = position.z - head.position.z;
    const dist = Math.hypot(dx, dz);
    const bearing = wrap(Math.atan2(-dx, -dz) - head.yawRad);
    if (!(dist >= SPAWN_MIN_DISTANCE && dist <= SPAWN_MAX_DISTANCE)) continue;
    if (Math.abs(bearing) > SPAWN_HALF_ARC_DEG * DEG) continue;
    out.push({ position, bearing });
  }
  return out;
}

export function pickSpawns(walls: readonly Wall[], head: HeadPose, count: number): SpawnPoint[] {
  const { x, y, z } = head.position;
  if (![x, y, z, head.yawRad].every(Number.isFinite)) {
    throw new RangeError('pickSpawns needs a finite head position and yaw');
  }
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(`count must be an integer >= 0, got ${count}`);
  }
  // Greedy from the centre of view outward: the most central qualifying points win, and each pick
  // must clear the bearing gap to every earlier wall pick. Stable sort keeps it deterministic.
  const candidates = walls.flatMap((w) => wallCandidates(w, head));
  candidates.sort((a, b) => Math.abs(a.bearing) - Math.abs(b.bearing));
  const gap = SPAWN_MIN_BEARING_GAP_DEG * DEG;
  const picked: Candidate[] = [];
  for (const c of candidates) {
    if (picked.length >= count) break;
    if (picked.every((p) => Math.abs(wrap(p.bearing - c.bearing)) >= gap)) picked.push(c);
  }
  const spawns: SpawnPoint[] = picked.map((p) => ({ position: p.position, source: 'wall' }));
  const k = count - spawns.length;
  for (let i = 0; i < k; i++) {
    const b = head.yawRad + (-SPAWN_HALF_ARC_DEG + (2 * SPAWN_HALF_ARC_DEG * (i + 0.5)) / k) * DEG;
    spawns.push({
      position: {
        x: x - Math.sin(b) * RING_FALLBACK_DISTANCE,
        y,
        z: z - Math.cos(b) * RING_FALLBACK_DISTANCE,
      },
      source: 'ring',
    });
  }
  return spawns;
}
