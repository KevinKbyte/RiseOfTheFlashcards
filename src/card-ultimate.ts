/**
 * Scene adapter for the ultimate (D7, S7, ledgers-2 H-2, decisions-2 D17): samples palm poses and
 * controller grips from the raw XRFrame each frame and turns them into requests for the pure
 * resolveUltimate, renders the ready-glow ultimate orb, and plays the push shockwave when it fires.
 * All rules live in flashcards/ultimate-input; this file only reads devices and draws.
 */
import {
  AdditiveBlending,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  RayInteractable,
  SphereGeometry,
  Vector3,
  type Entity,
  type World,
} from '@iwsdk/core';
import {
  classifyPalmPush,
  gripSqueezed,
  PALM_PUSH_WINDOW_S,
  type GripState,
  type PalmSample,
  type UltimateRequest,
} from './flashcards/ultimate-input.js';
import type { Vec3 } from './flashcards/spawn.js';
import { ultimateOrbPosition } from './flashcards/panel-layout.js';
import { shouldPlaceOrb, type OrbView } from './flashcards/ultimate-orb-place.js';

type Hand = 'left' | 'right';

// The middle metacarpal sits at the palm centre; WebXR joint -Y points out of the palm.
const PALM_JOINT: XRHandJoint = 'middle-finger-metacarpal';
const PALM_OUT = new Vector3(0, -1, 0);
const VIEW_FORWARD = new Vector3(0, 0, -1);
// xr-standard gamepad mapping: button 1 is the squeeze (grip).
const SQUEEZE_BUTTON = 1;
// Keep a little more than the classifier window so its oldest in-window sample is always present.
const HISTORY_S = PALM_PUSH_WINDOW_S * 2;

const ORB_RADIUS = 0.06;
const ORB_DIM = 0x78350f;
const ORB_GLOW = 0xfacc15;
const GLOW_RATE = 6;
const WAVE_SECONDS = 0.45;
const WAVE_RADIUS = 0.15;
const WAVE_MAX_SCALE = 8;

export class UltimateInput {
  private readonly palms: Record<Hand, PalmSample[]> = { left: [], right: [] };
  private prevGrip: GripState = { left: false, right: false };
  private orb: Entity | undefined;
  private orbMaterial: MeshBasicMaterial | undefined;
  private wave: { entity: Entity; material: MeshBasicMaterial; geometry: SphereGeometry; age: number } | undefined;
  private orbGeometry: SphereGeometry | undefined;
  // Last frame's orb view: placement happens only on its transitions, never every frame.
  private prevView: OrbView = { visible: false, glowing: false };
  private readonly q = new Quaternion();
  private readonly v = new Vector3();

  constructor(private readonly world: World) {}

  isOrb(entity: Entity): boolean {
    return entity === this.orb;
  }

  /** This frame's fire requests; `t` is the uncapped input clock in seconds. */
  collect(frame: XRFrame | null, space: XRReferenceSpace | null, t: number, orbSelected: boolean): UltimateRequest[] {
    const requests: UltimateRequest[] = orbSelected ? ['orb'] : [];
    if (frame === null || space === null) {
      this.palms.left = [];
      this.palms.right = [];
      this.prevGrip = { left: false, right: false };
      return requests;
    }
    const grip: GripState = { left: false, right: false };
    const tracked: Record<Hand, boolean> = { left: false, right: false };
    for (const source of frame.session.inputSources) {
      const hand = source.handedness;
      if (hand !== 'left' && hand !== 'right') continue;
      if (source.hand) tracked[hand] = this.samplePalm(frame, space, source.hand, hand, t);
      else if (source.gamepad) grip[hand] = source.gamepad.buttons[SQUEEZE_BUTTON]?.pressed === true;
    }
    // An untracked hand drops its history, so stale samples never pair with a later push.
    for (const hand of ['left', 'right'] as const) if (!tracked[hand]) this.palms[hand] = [];
    if (gripSqueezed(this.prevGrip, grip)) requests.push('grip');
    this.prevGrip = grip;
    const forward = this.forward(frame, space);
    if (forward !== null && classifyPalmPush(this.palms.left, this.palms.right, forward)) {
      requests.push('palm-push');
      // One push is one request: a held pose must not keep re-firing over the next frames.
      this.palms.left = [];
      this.palms.right = [];
    }
    return requests;
  }

  /** Shows the orb while `view.visible`, re-placing it at the head when it appears or starts glowing. */
  syncOrb(view: OrbView, eye: Vector3, headYaw: number, clock: number): void {
    const prev = this.prevView;
    this.prevView = { visible: view.visible, glowing: view.glowing };
    if (!view.visible) {
      this.disposeOrb();
      return;
    }
    if (this.orb === undefined) this.createOrb();
    const obj = this.orb?.object3D;
    const material = this.orbMaterial;
    if (obj === undefined || material === undefined) return;
    if (shouldPlaceOrb(prev, view)) {
      // A lost head pose keeps the old fallback (yaw 0) instead of throwing in the frame loop.
      const p = ultimateOrbPosition(eye, Number.isFinite(headYaw) ? headYaw : 0);
      obj.position.set(p.x, p.y, p.z);
    }
    const pulse = view.glowing ? 0.5 + 0.5 * Math.sin(clock * GLOW_RATE) : 0;
    material.color.setHex(view.glowing ? ORB_GLOW : ORB_DIM);
    material.color.offsetHSL(0, 0, 0.15 * pulse);
    obj.scale.setScalar(1 + 0.2 * pulse);
  }

  /** Push feedback: an expanding, fading shockwave at the knocked-back target. */
  pulse(at: Vector3): void {
    this.disposeWave();
    const material = new MeshBasicMaterial({
      color: ORB_GLOW,
      transparent: true,
      opacity: 0.6,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const geometry = new SphereGeometry(WAVE_RADIUS, 24, 16);
    const mesh = new Mesh(geometry, material);
    mesh.position.copy(at);
    this.wave = { entity: this.world.createTransformEntity(mesh), material, geometry, age: 0 };
  }

  update(dt: number): void {
    const wave = this.wave;
    if (wave === undefined) return;
    wave.age += dt;
    const f = wave.age / WAVE_SECONDS;
    if (f >= 1) {
      this.disposeWave();
      return;
    }
    wave.entity.object3D?.scale.setScalar(1 + (WAVE_MAX_SCALE - 1) * f);
    wave.material.opacity = 0.6 * (1 - f);
  }

  destroy(): void {
    this.disposeOrb();
    this.disposeWave();
  }

  /** Records this frame's palm sample; false when the hand has no palm pose (not tracked). */
  private samplePalm(frame: XRFrame, space: XRReferenceSpace, xrHand: XRHand, hand: Hand, t: number): boolean {
    const joint = xrHand.get(PALM_JOINT);
    const pose = joint === undefined ? undefined : frame.getJointPose?.(joint, space);
    if (!pose) return false;
    const { position: p, orientation: o } = pose.transform;
    this.v.copy(PALM_OUT).applyQuaternion(this.q.set(o.x, o.y, o.z, o.w));
    const samples = this.palms[hand].filter((s) => s.t >= t - HISTORY_S);
    samples.push({ pos: { x: p.x, y: p.y, z: p.z }, normal: { x: this.v.x, y: this.v.y, z: this.v.z }, t });
    this.palms[hand] = samples;
    return true;
  }

  /** Horizontal play-forward from the viewer pose, in the same space as the palm samples. */
  private forward(frame: XRFrame, space: XRReferenceSpace): Vec3 | null {
    const o = frame.getViewerPose(space)?.transform.orientation;
    if (o === undefined) return null;
    this.v.copy(VIEW_FORWARD).applyQuaternion(this.q.set(o.x, o.y, o.z, o.w));
    const len = Math.hypot(this.v.x, this.v.z);
    return len > 1e-6 ? { x: this.v.x / len, y: 0, z: this.v.z / len } : null;
  }

  private createOrb(): void {
    this.orbMaterial = new MeshBasicMaterial({ color: ORB_GLOW });
    this.orbGeometry = new SphereGeometry(ORB_RADIUS, 24, 16);
    const sphere = new Mesh(this.orbGeometry, this.orbMaterial);
    this.orb = this.world.createTransformEntity(sphere);
    this.orb.addComponent(RayInteractable);
  }

  private disposeOrb(): void {
    this.orb?.dispose();
    this.orb = undefined;
    this.orbMaterial?.dispose();
    this.orbMaterial = undefined;
    // Entity disposal does not free GPU buffers; without this every charge/fire cycle leaks one.
    this.orbGeometry?.dispose();
    this.orbGeometry = undefined;
  }

  private disposeWave(): void {
    this.wave?.entity.dispose();
    this.wave?.material.dispose();
    this.wave?.geometry.dispose();
    this.wave = undefined;
  }
}
