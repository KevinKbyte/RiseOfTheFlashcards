// Correct-answer feedback: a short green flash with flying shards at the answered enemy, a rising
// two-note tone, and a controller haptic pulse. Wrong answers get none of this.
import {
  AdditiveBlending,
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
  type Object3D,
} from '@iwsdk/core';

// Hidden once age reaches this; the test contract needs it visible at 0.3 s and gone by 0.5 s.
const BURST_SECONDS = 0.5;
// Bursts are pooled; a new answer while all slots are live recycles the oldest.
const MAX_BURSTS = 3;
const SHARDS = 6;
const SHARD_SIZE = 0.035;
const SHARD_SPEED = 1.2;
const FLASH_RADIUS = 0.3;
const GREEN = 0x22c55e;
const TONE_FREQS = [660, 990];
const NOTE_SECONDS = 0.075;
const TONE_GAIN = 0.15;
const HAPTIC_INTENSITY = 0.6;
const HAPTIC_MS = 80;

// lib.dom's GamepadHapticActuator types only playEffect; Quest exposes the older pulse().
type PulseActuator = { pulse?: (intensity: number, ms: number) => unknown };
type PulseGamepad = { hapticActuators?: readonly (PulseActuator | undefined)[] };

interface Burst {
  root: Group;
  flash: Mesh;
  shards: Mesh[];
  dirs: Vector3[];
  age: number;
}

export class CorrectFeedback {
  private readonly bursts: Burst[] = [];
  private next = 0;
  private flashGeo: SphereGeometry | undefined;
  private shardGeo: BoxGeometry | undefined;
  private material: MeshBasicMaterial | undefined;
  private audio: AudioContext | undefined;

  constructor(private readonly parent: Object3D) {}

  /** Call from a user-gesture path (select): browsers only allow audio started from one. */
  unlockAudio(): void {
    if (this.audio === undefined) {
      const Ctor = globalThis.AudioContext;
      if (Ctor === undefined) return;
      this.audio = new Ctor();
    }
    // A refused resume just leaves the game silent; play() skips the tone until it is running.
    if (this.audio.state === 'suspended') this.audio.resume().catch(() => undefined);
  }

  /** Flash + shards at a world position, tone, and a pulse on the answering gamepad if any. */
  play(at: Vector3, gamepad?: unknown): void {
    this.spawnBurst(at);
    this.tone();
    const actuator = (gamepad as PulseGamepad | null | undefined)?.hapticActuators?.[0];
    void actuator?.pulse?.(HAPTIC_INTENSITY, HAPTIC_MS);
  }

  update(dt: number): void {
    for (const burst of this.bursts) {
      if (!burst.root.visible) continue;
      burst.age += dt;
      const t = burst.age / BURST_SECONDS;
      if (t >= 1) {
        burst.root.visible = false;
        continue;
      }
      const fade = 1 - t;
      burst.flash.scale.setScalar(FLASH_RADIUS * (0.4 + 0.6 * t) * fade);
      for (let i = 0; i < SHARDS; i++) {
        const shard = burst.shards[i];
        shard.position.copy(burst.dirs[i]).multiplyScalar(SHARD_SPEED * burst.age);
        shard.scale.setScalar(fade);
        shard.rotation.x += dt * 9;
        shard.rotation.y += dt * 7;
      }
    }
  }

  destroy(): void {
    for (const burst of this.bursts) burst.root.removeFromParent();
    this.bursts.length = 0;
    this.flashGeo?.dispose();
    this.shardGeo?.dispose();
    this.material?.dispose();
    this.flashGeo = this.shardGeo = this.material = undefined;
    void this.audio?.close?.();
    this.audio = undefined;
  }

  private spawnBurst(at: Vector3): void {
    let burst = this.bursts[this.next];
    if (burst === undefined) {
      burst = this.buildBurst();
      this.bursts.push(burst);
    }
    this.next = (this.next + 1) % MAX_BURSTS;
    burst.age = 0;
    burst.root.position.copy(at);
    burst.root.visible = true;
    for (const dir of burst.dirs) dir.randomDirection();
    this.update(0);
  }

  private buildBurst(): Burst {
    this.flashGeo ??= new SphereGeometry(1, 16, 12);
    this.shardGeo ??= new BoxGeometry(SHARD_SIZE, SHARD_SIZE, SHARD_SIZE);
    this.material ??= new MeshBasicMaterial({
      color: GREEN,
      transparent: true,
      opacity: 0.6,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const root = new Group();
    root.userData.iwsdkRuntimeOnly = true;
    const flash = new Mesh(this.flashGeo, this.material);
    flash.userData.iwsdkRuntimeOnly = true;
    root.add(flash);
    const shards: Mesh[] = [];
    const dirs: Vector3[] = [];
    for (let i = 0; i < SHARDS; i++) {
      const shard = new Mesh(this.shardGeo, this.material);
      shard.userData.iwsdkRuntimeOnly = true;
      root.add(shard);
      shards.push(shard);
      dirs.push(new Vector3());
    }
    this.parent.add(root);
    return { root, flash, shards, dirs, age: 0 };
  }

  private tone(): void {
    const ctx = this.audio;
    if (ctx === undefined || ctx.state !== 'running') return;
    const t0 = ctx.currentTime;
    TONE_FREQS.forEach((freq, i) => {
      const start = t0 + i * NOTE_SECONDS;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(TONE_GAIN, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + NOTE_SECONDS);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + NOTE_SECONDS);
    });
  }
}
