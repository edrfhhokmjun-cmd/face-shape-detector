import type { Pt } from './types';

export interface NormalizedLandmarkLike {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

/**
 * MediaPipe FaceMesh（478 点）锚点索引。
 *
 * 这些默认值取自官方 FACEMESH_FACE_OVAL 拓扑 + 面部测量学的常用点位
 * （Farkas《Anthropometry of the Head and Face》的 landmark 定义）。
 *
 * ⚠️ 它们是「合理默认」，不是普适最优：请用 /debug 页面在你的回归集上校准。
 *    尤其是 cheekLeft/Right 与 jawLeft/Right —— 不同实现会选不同点位，
 *    而它们直接决定三个比例，从而决定分类结果。
 */
export const ANCHORS = {
  /** 额顶中点。注意：这不是真正的人脸关键点，是 FaceMesh 网格顶端，头发遮挡时会失准 */
  trichion: 10,
  /** 眉心（两眉之间）：发际线失准时的备选长度基准 */
  glabella: 9,
  /** 下巴最低点 */
  menton: 152,
  /** 额部两侧最宽点 */
  foreheadLeft: 103,
  foreheadRight: 332,
  /** 颧骨/耳前最宽点（bizygomatic 近似） */
  cheekLeft: 234,
  cheekRight: 454,
  /** 下颌角（gonion 近似） */
  jawLeft: 172,
  jawRight: 397,
  /** 眼外角 */
  eyeOuterLeft: 33,
  eyeOuterRight: 263,
  /** 鼻尖 */
  noseTip: 1,
} as const;

/** 候选锚点组：在 /debug 页面里逐组对比宽度，选出在你的数据上最稳的一组 */
export const ALTERNATIVE_ANCHORS = {
  trichion: [10, 151, 9],
  forehead: [
    [103, 332],
    // 通行量法说「量额头最宽处，大约在发际线和眉毛中间」。
    // 在轮廓排序上 54/284 正好夹在额头中上部(103/332)和眉线(21/251)之间，
    // 是最接近这个标准位置的候选。
    [54, 284],
    [21, 251],
    [67, 297],
    [109, 338],
    // 眉毛外端：头发盖住太阳穴时，眉部皮肤通常仍可见，所以这些点对面部遮挡更稳健。
    // ⚠️ 内端/外端我不能凭记忆确定（搞反会量成"眉心间距"），请用 /debug 悬停确认位置。
    [46, 276],
    [70, 300],
  ],
  cheek: [
    [234, 454],
    [93, 323],
    [116, 345],
    [132, 361],
  ],
  jaw: [
    [172, 397],
    [58, 288],
    [132, 361],
    [136, 365],
  ],
} as const;

/**
 * MediaPipe 的 x/y 是「按图宽、图高分别归一化」的。
 * 必须先还原成像素坐标再算距离，否则图宽高比 ≠ 1 时所有比例都是错的。
 */
export function toPixelCoords(
  landmarks: readonly NormalizedLandmarkLike[],
  width: number,
  height: number,
): Pt[] {
  return landmarks.map((p) => ({
    x: p.x * width,
    y: p.y * height,
    z: (p.z ?? 0) * width,
  }));
}

export function distance(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** 以 corner 为顶点，返回 a-corner-b 的夹角（度） */
export function angleAtDeg(corner: Pt, a: Pt, b: Pt): number {
  const v1x = a.x - corner.x;
  const v1y = a.y - corner.y;
  const v2x = b.x - corner.x;
  const v2y = b.y - corner.y;
  const n1 = Math.hypot(v1x, v1y);
  const n2 = Math.hypot(v2x, v2y);
  if (n1 === 0 || n2 === 0) return Number.NaN;
  const cos = (v1x * v2x + v1y * v2y) / (n1 * n2);
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}
