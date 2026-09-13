import { ANCHORS, distance } from './landmarks';
import type { Measurements, Pt } from './types';

/** 各锚点组在 overlay 上的颜色，和 types/文档保持一致，方便肉眼核对 */
const ANCHOR_COLORS: Record<keyof typeof ANCHORS, string> = {
  trichion: '#f97316',
  glabella: '#fb923c',
  menton: '#f97316',
  foreheadLeft: '#38bdf8',
  foreheadRight: '#38bdf8',
  cheekLeft: '#a78bfa',
  cheekRight: '#a78bfa',
  jawLeft: '#34d399',
  jawRight: '#34d399',
  eyeOuterLeft: '#facc15',
  eyeOuterRight: '#facc15',
  noseTip: '#facc15',
};

export interface OverlayOptions {
  /** 画出全部 478 个点（调试用） */
  showAll?: boolean;
  /** 画出锚点名称（调试用） */
  showLabels?: boolean;
  /** 画出四条测量线 */
  showMeasurements?: boolean;
}

/**
 * 把照片和 landmarks 画到同一个 canvas 上。
 * canvas 的像素尺寸会被设成和照片一致，显示尺寸交给 CSS —— 这样 overlay
 * 和原图永远严格对齐，不需要任何坐标换算。
 */
export function renderOverlay(
  canvas: HTMLCanvasElement,
  photo: HTMLCanvasElement,
  landmarks?: readonly Pt[],
  measurements?: Measurements,
  options: OverlayOptions = {},
): void {
  canvas.width = photo.width;
  canvas.height = photo.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(photo, 0, 0);

  if (!landmarks || landmarks.length === 0) return;

  const unit = Math.max(1, canvas.width / 500);

  if (options.showAll) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    for (const point of landmarks) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, unit * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (options.showMeasurements && measurements) {
    const lines: Array<[Pt, Pt, string]> = [
      [landmarks[ANCHORS.foreheadLeft], landmarks[ANCHORS.foreheadRight], '#38bdf8'],
      [landmarks[ANCHORS.cheekLeft], landmarks[ANCHORS.cheekRight], '#a78bfa'],
      [landmarks[ANCHORS.jawLeft], landmarks[ANCHORS.jawRight], '#34d399'],
      [landmarks[ANCHORS.trichion], landmarks[ANCHORS.menton], '#f97316'],
    ];
    ctx.lineWidth = unit;
    for (const [a, b, color] of lines) {
      if (!a || !b) continue;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  ctx.font = `${Math.round(unit * 7)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textBaseline = 'bottom';

  for (const [name, index] of Object.entries(ANCHORS) as Array<[keyof typeof ANCHORS, number]>) {
    const point = landmarks[index];
    if (!point) continue;
    const color = ANCHOR_COLORS[name];

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(point.x, point.y, unit * 2.5, 0, Math.PI * 2);
    ctx.fill();

    if (options.showLabels) {
      const label = `${name} #${index}`;
      const x = point.x + unit * 4;
      const y = point.y - unit * 2;
      ctx.lineWidth = unit * 2;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.strokeText(label, x, y);
      ctx.fillStyle = color;
      ctx.fillText(label, x, y);
    }
  }

  if (options.showLabels) {
    // 参考线：眼外角连线（roll 的基准）
    const eyeL = landmarks[ANCHORS.eyeOuterLeft];
    const eyeR = landmarks[ANCHORS.eyeOuterRight];
    if (eyeL && eyeR) {
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.6)';
      ctx.lineWidth = unit;
      ctx.setLineDash([unit * 4, unit * 4]);
      ctx.beginPath();
      ctx.moveTo(eyeL.x, eyeL.y);
      ctx.lineTo(eyeR.x, eyeR.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

/** 调试页用：输出某个候选点位对的宽度 */
export function pairWidth(landmarks: readonly Pt[], pair: readonly [number, number]): number {
  const a = landmarks[pair[0]];
  const b = landmarks[pair[1]];
  if (!a || !b) return Number.NaN;
  return distance(a, b);
}
