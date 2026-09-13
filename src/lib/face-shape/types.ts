/** 像素坐标点（已经过 EXIF 摆正并按图宽/图高还原） */
export interface Pt {
  x: number;
  y: number;
  z?: number;
}

export type FaceShape = 'oval' | 'round' | 'square' | 'heart' | 'oblong' | 'diamond';

export interface RatioSet {
  /** 脸长(发际线→下巴) / 颧宽 —— 第一分叉：长脸 vs 短脸 */
  lengthToWidth: number;
  /** 脸长(眉心→下巴) / 颧宽 —— 诊断用，不参与默认分类 */
  lengthToWidthBrow: number;
  /** 额宽 / 颌宽 —— 区分 heart / square / diamond 的关键 */
  foreheadToJaw: number;
  /** 颧宽 / 颌宽 —— 下颌收窄速度 */
  cheekToJaw: number;
  /** 额宽 / 颧宽 —— >1 表示额头比颧骨宽（heart 倾向） */
  foreheadToCheek: number;
}

export interface Measurements {
  foreheadWidth: number;
  cheekWidth: number;
  jawWidth: number;
  /** trichion(≈发际线) → menton(下巴) */
  faceLength: number;
  /** glabella(眉心) → menton(下巴) */
  faceLengthBrow: number;
  ratios: RatioSet;
}

export interface PoseEstimate {
  /** 眼外角连线相对水平的夹角（度）。这是真正的欧拉 roll，可直接用。 */
  rollDeg: number;
  /** 鼻尖相对面部中线的水平偏移 / 颧宽。正负代表左右转，只用绝对值做门禁。 */
  yawProxy: number;
  /** (鼻尖y - 眼中心y) / (下巴y - 鼻尖y)。偏离中立区间说明低头/仰头。 */
  pitchProxy: number;
  straight: boolean;
}

export interface ShapeScore {
  shape: FaceShape;
  /** 0..1 的规则拟合度，不是概率 */
  score: number;
}

export type WarningCode =
  | 'no_face'
  | 'multiple_faces'
  | 'pose_off_axis'
  | 'hairline_uncertain'
  | 'measurement_out_of_range'
  | 'low_confidence';

export interface AnalysisWarning {
  code: WarningCode;
  message: string;
}

export interface AnalysisResult {
  ok: boolean;
  faceCount: number;
  /** 原始像素坐标 landmarks（未去旋转），供 overlay 绘制 */
  landmarks: Pt[];
  measurements: Measurements;
  pose: PoseEstimate;
  /** 下颌角（gonial angle，度）。越小越方，越大越圆。 */
  gonialAngleDeg: number;
  shape: FaceShape;
  /** 0..1 启发式置信度，不是概率 */
  confidence: number;
  ranking: ShapeScore[];
  /** 第 2 名 —— 脸型是连续谱，边界情况必须展示 runner-up */
  runnerUp: ShapeScore | null;
  warnings: AnalysisWarning[];
}
