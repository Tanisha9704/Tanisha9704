import * as THREE from 'three';
import type { Card } from '@uno/shared';

const cache = new Map<string, THREE.Texture>();

const COLOR_HEX: Record<string, string> = {
  red: '#FF4444',
  blue: '#2196F3',
  green: '#4CAF50',
  yellow: '#FFC107',
  wild: '#1c1c1c',
};

/** Procedurally generate a card face PNG texture using HTML Canvas. */
export function cardFaceTexture(card: Card): THREE.Texture {
  const key = cardKey(card);
  const cached = cache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 358;
  const ctx = canvas.getContext('2d')!;

  const bg = COLOR_HEX[card.kind === 'wild' ? 'wild' : card.color];
  ctx.fillStyle = bg;
  drawRoundedRect(ctx, 0, 0, canvas.width, canvas.height, 18);
  ctx.fill();

  // White ellipse in the centre.
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(-0.45);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(0, 0, 90, 130, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const label = cardLabel(card);
  const corner = cardCornerLabel(card);

  // Center label
  ctx.fillStyle = card.kind === 'wild' ? '#1c1c1c' : bg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 130px "Baloo 2","Nunito",sans-serif';
  ctx.fillText(label, canvas.width / 2, canvas.height / 2 + 10);

  // Top-left corner mini label
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.font = 'bold 36px "Baloo 2","Nunito",sans-serif';
  ctx.fillText(corner, 18, 50);

  // Bottom-right
  ctx.textAlign = 'right';
  ctx.fillText(corner, canvas.width - 18, canvas.height - 26);

  // For Wild + Wild Draw Four, draw the 4-color diamond in center.
  if (card.kind === 'wild') {
    drawWildDiamond(ctx, canvas.width / 2, canvas.height / 2 - 5);
    if (card.value === 'wild_draw_four') {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 60px "Baloo 2",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('+4', canvas.width / 2, canvas.height / 2 + 80);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

let backTexture: THREE.Texture | null = null;
export function cardBackTexture(): THREE.Texture {
  if (backTexture) return backTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 358;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0a0a0a';
  drawRoundedRect(ctx, 0, 0, canvas.width, canvas.height, 18);
  ctx.fill();

  // Center red ellipse with "UNO" wordmark.
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(-0.42);
  ctx.fillStyle = '#FF4444';
  ctx.beginPath();
  ctx.ellipse(0, 0, 95, 60, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 50px "Baloo 2","Nunito",sans-serif';
  ctx.fillText('UNO', 0, 4);
  ctx.restore();

  backTexture = new THREE.CanvasTexture(canvas);
  backTexture.colorSpace = THREE.SRGBColorSpace;
  return backTexture;
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawWildDiamond(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  const s = 60;
  const colors = ['#FF4444', '#FFC107', '#4CAF50', '#2196F3'];
  const offsets: [number, number][] = [
    [0, -s],
    [s, 0],
    [0, s],
    [-s, 0],
  ];
  ctx.save();
  ctx.translate(cx, cy);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = colors[i]!;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(offsets[i]![0], offsets[i]![1]);
    const next = offsets[(i + 1) % 4]!;
    ctx.lineTo(next[0], next[1]);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function cardKey(c: Card): string {
  if (c.kind === 'number') return `n_${c.color}_${c.value}`;
  if (c.kind === 'action') return `a_${c.color}_${c.value}`;
  return `w_${c.value}`;
}

function cardLabel(c: Card): string {
  if (c.kind === 'number') return String(c.value);
  if (c.kind === 'action') {
    return c.value === 'skip' ? '⊘' : c.value === 'reverse' ? '⇄' : '+2';
  }
  return c.value === 'wild_draw_four' ? '' : '';
}

function cardCornerLabel(c: Card): string {
  if (c.kind === 'number') return String(c.value);
  if (c.kind === 'action') {
    return c.value === 'skip' ? 'S' : c.value === 'reverse' ? 'R' : '+2';
  }
  return c.value === 'wild_draw_four' ? '+4' : 'W';
}
