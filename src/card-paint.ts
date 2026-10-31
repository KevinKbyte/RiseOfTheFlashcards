// Canvas painters for the flashcard page: panel text, the enemy face, and text planes.
import {
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';

export function paintText(texture: CanvasTexture, lines: readonly string[], bg: string): void {
  const canvas = texture.image as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const rowH = canvas.height / lines.length;
  lines.forEach((line, i) => {
    // First line is the headline; the rest are smaller status lines.
    const size = Math.round(rowH * (i === 0 ? 0.55 : 0.4));
    ctx.font = `bold ${size}px sans-serif`;
    ctx.fillText(line, canvas.width / 2, rowH * (i + 0.5), canvas.width * 0.95);
  });
  texture.needsUpdate = true;
}

// Grumpy, mischievous face on a transparent canvas; drawn over the card back so the prompt stays
// hidden until the reveal.
export function paintFace(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.lineCap = 'round';
  const eyeY = h * 0.4;
  const eyeR = w * 0.13;
  for (const side of [-1, 1]) {
    const x = w / 2 + side * w * 0.2;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, eyeY, eyeR, 0, 2 * Math.PI);
    ctx.fill();
    // Pupils glance inward and down for a scheming look.
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(x - side * eyeR * 0.3, eyeY + eyeR * 0.25, eyeR * 0.5, 0, 2 * Math.PI);
    ctx.fill();
    // Angry brow: high at the outside, low toward the nose.
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = w * 0.06;
    ctx.beginPath();
    ctx.moveTo(x + side * eyeR * 1.2, eyeY - eyeR * 1.7);
    ctx.lineTo(x - side * eyeR * 1.1, eyeY - eyeR * 0.9);
    ctx.stroke();
  }
  // Lopsided frown that curls up at one corner: grumpy with a smirk.
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = w * 0.05;
  ctx.beginPath();
  ctx.moveTo(w * 0.3, h * 0.74);
  ctx.quadraticCurveTo(w * 0.48, h * 0.64, w * 0.66, h * 0.72);
  ctx.quadraticCurveTo(w * 0.71, h * 0.74, w * 0.72, h * 0.69);
  ctx.stroke();
  // Single fang under the mouth for mischief.
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(w * 0.4, h * 0.705);
  ctx.lineTo(w * 0.46, h * 0.69);
  ctx.lineTo(w * 0.435, h * 0.76);
  ctx.closePath();
  ctx.fill();
}

export function textPlane(
  lines: readonly string[],
  width: number,
  height: number,
  bg: string,
  opacity = 1,
): Mesh<PlaneGeometry, MeshBasicMaterial> {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = Math.round((512 * height) / width);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  paintText(texture, lines, bg);
  const material = new MeshBasicMaterial({
    map: texture,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
  });
  return new Mesh(new PlaneGeometry(width, height), material);
}
