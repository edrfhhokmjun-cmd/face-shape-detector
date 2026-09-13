import { ANCHORS, distance, midpoint } from './landmarks';
import type { Pt, PoseEstimate } from './types';

/**
 * 姿态门禁阈值。
 *
 * ⚠️ 初始值，必须用你的回归集校准（见 CALIBRATION.md）。
 *    门禁宁可严一点：歪头照片算出来的比例是垃圾，放行会直接毁掉用户对
 *    「准不准」的判断，比让用户重拍一次的代价大得多。
 */
export const POSE_LIMITS = {
  rollDeg: 6,
  yawProxy: 0.055,
  pitchProxyMin: 0.45,
  pitchProxyMax: 1.15,
} as const;

/**
 * 姿态估计。
 *
 * roll 用眼外角连线算，这是真正的欧拉角，无歧义。
 * yaw / pitch 用 landmark 的几何关系做「代理量」——刻意不去解析 MediaPipe 的
 * facialTransformationMatrixes：那个矩阵的行列/旋转约定容易搞错，而门禁只需要
 * 「够不够正」这个判断。代理量的好处是可以肉眼验证。
 *
 * 如果你之后需要真正的欧拉角：在 detector.ts 里打开
 * outputFacialTransformationMatrixes，然后在 /debug 页面打印出来自行推导。
 */
export function estimatePose(pts: readonly Pt[]): PoseEstimate {
  const eyeL = pts[ANCHORS.eyeOuterLeft];
  const eyeR = pts[ANCHORS.eyeOuterRight];
  const rollDeg = (Math.atan2(eyeR.y - eyeL.y, eyeR.x - eyeL.x) * 180) / Math.PI;

  const cheekL = pts[ANCHORS.cheekLeft];
  const cheekR = pts[ANCHORS.cheekRight];
  const cheekWidth = distance(cheekL, cheekR) || 1;
  const faceMid = midpoint(cheekL, cheekR);
  const yawProxy = (pts[ANCHORS.noseTip].x - faceMid.x) / cheekWidth;

  const eyeMid = midpoint(eyeL, eyeR);
  const nose = pts[ANCHORS.noseTip];
  const chin = pts[ANCHORS.menton];
  const lowerFace = chin.y - nose.y;
  const pitchProxy = lowerFace > 0 ? (nose.y - eyeMid.y) / lowerFace : Number.NaN;

  const straight =
    Math.abs(rollDeg) <= POSE_LIMITS.rollDeg &&
    Math.abs(yawProxy) <= POSE_LIMITS.yawProxy &&
    Number.isFinite(pitchProxy) &&
    pitchProxy >= POSE_LIMITS.pitchProxyMin &&
    pitchProxy <= POSE_LIMITS.pitchProxyMax;

  return { rollDeg, yawProxy, pitchProxy, straight };
}

/**
 * 以 center 为轴反向旋转 roll 度，让后续测量对轻微歪头不敏感。
 * 门禁过了之后仍然做这一步：余下几度的倾斜会系统性地把颧宽算大。
 */
export function derotate(pts: readonly Pt[], center: Pt, rollDeg: number): Pt[] {
  const rad = (-rollDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return pts.map((p) => {
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    return {
      x: center.x + dx * cos - dy * sin,
      y: center.y + dx * sin + dy * cos,
      z: p.z,
    };
  });
}
