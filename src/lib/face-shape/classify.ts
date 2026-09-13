import { ANCHORS, angleAtDeg, distance } from './landmarks';
import type {
  AnalysisWarning,
  FaceShape,
  Measurements,
  PoseEstimate,
  Pt,
  ShapeScore,
} from './types';

/** 下颌角（gonial angle，度）：在 gonion 处取「下颌支上行点 → 下颌角 → 下巴」的夹角。
 *  角度越小越方，越大越圆。左右取平均。
 *  ⚠️ FaceMesh 的 172/397 只是 gonion 的近似点，这个度量是本项目里最弱的一环，
 *     必须用回归集验证；它的唯一职责是分开 square 和 round —— 只靠四个宽度做不到。 */
export function gonialAngleDeg(pts: readonly Pt[]): number {
  const chin = pts[ANCHORS.menton];
  const left = angleAtDeg(pts[ANCHORS.jawLeft], pts[ANCHORS.cheekLeft], chin);
  const right = angleAtDeg(pts[ANCHORS.jawRight], pts[ANCHORS.cheekRight], chin);
  const values = [left, right].filter((v) => Number.isFinite(v));
  if (values.length === 0) return Number.NaN;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** 临时替换锚点，用来做灵敏度分析（/debug 的「换锚点对比」表）。 */
export interface AnchorOverride {
  trichion?: number;
  forehead?: readonly [number, number];
  cheek?: readonly [number, number];
  jaw?: readonly [number, number];
}

export function measure(pts: readonly Pt[], override: AnchorOverride = {}): Measurements {
  const trichion = override.trichion ?? ANCHORS.trichion;
  const forehead = override.forehead ?? ([ANCHORS.foreheadLeft, ANCHORS.foreheadRight] as const);
  const cheek = override.cheek ?? ([ANCHORS.cheekLeft, ANCHORS.cheekRight] as const);
  const jaw = override.jaw ?? ([ANCHORS.jawLeft, ANCHORS.jawRight] as const);

  const foreheadWidth = distance(pts[forehead[0]], pts[forehead[1]]);
  const cheekWidth = distance(pts[cheek[0]], pts[cheek[1]]);
  const jawWidth = distance(pts[jaw[0]], pts[jaw[1]]);
  const faceLength = distance(pts[trichion], pts[ANCHORS.menton]);
  const faceLengthBrow = distance(pts[ANCHORS.glabella], pts[ANCHORS.menton]);

  const safe = (numerator: number, denominator: number) =>
    denominator > 0 ? numerator / denominator : Number.NaN;

  return {
    foreheadWidth,
    cheekWidth,
    jawWidth,
    faceLength,
    faceLengthBrow,
    ratios: {
      lengthToWidth: safe(faceLength, cheekWidth),
      lengthToWidthBrow: safe(faceLengthBrow, cheekWidth),
      foreheadToJaw: safe(foreheadWidth, jawWidth),
      cheekToJaw: safe(cheekWidth, jawWidth),
      foreheadToCheek: safe(foreheadWidth, cheekWidth),
    },
  };
}

/** value 落在 [lo, hi] 内返回 1，超出后按 softness 线性衰减到 0 */
function band(value: number, lo: number, hi: number, softness: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value >= lo && value <= hi) return 1;
  const overshoot = value < lo ? lo - value : value - hi;
  return Math.max(0, 1 - overshoot / softness);
}

function avg(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * 分类阈值 —— **来自 200 张真实人脸的实测比例分布**（数据集 `codernotme/face_shape`，MIT）。
 *
 * ⚠️ 这里只用**比例的数值分布**，**完全不用那个数据集的标签**。
 *    那批标签已被证明与四个比例零区分力（见 EVALUATION.md）——
 *    拿它调区间是拟合噪声；用它描述「真实人脸的测量空间长什么样」才是正当用法。
 *
 * 为什么必须重写：原来我手写的区间要求 r1 能到 2.30、r3 能低到 0.98、r4 能超过 1.00 ——
 * 这些区域在实测数据里**一个都不存在**，于是六个类别里五个不可达、
 * 第六个（diamond）把 88% 的样本通吃。这是结构性缺陷，不是调参问题。
 */
export const POPULATION = {
  sampleSize: 200,
  source: 'codernotme/face_shape (MIT) — 200 张真实人脸；仅用比例分布，未使用其标签',
  r1: { p10: 1.135, p25: 1.154, p50: 1.18, p75: 1.198, p90: 1.222, max: 1.357 },
  r2: { p10: 0.811, p25: 0.856, p50: 0.895, p75: 0.923, p90: 0.958, max: 1.04 },
  r3: { p10: 1.204, p25: 1.221, p50: 1.25, p75: 1.27, p90: 1.295, max: 1.357 },
  r4: { p10: 0.669, p25: 0.69, p50: 0.717, p75: 0.732, p90: 0.749, max: 0.78 },
  // 下颌角（gonial proxy）。这一项是**区分方脸 / 圆脸的唯一依据**，
  // 所以要当成判别器（取四分位）而不是过滤器 —— 原先写成「≤137 算方、≥140 算圆」，
  // 而人群中位数恰好是 136.4，导致两边的判据都卡在中位线附近半触发，
  // 圆脸被压到 1.5%，方脸却靠其他宽松项涨到 30%。
  gonial: { p25: 133.2, p50: 136.4, p75: 139.5 },
} as const;

const P = POPULATION;

/** value ≤ threshold 时为 1，超出后按 softness 衰减 */
function atMost(value: number, threshold: number, softness: number): number {
  return band(value, Number.NEGATIVE_INFINITY, threshold, softness);
}

/** value ≥ threshold 时为 1，不足时按 softness 衰减 */
function atLeast(value: number, threshold: number, softness: number): number {
  return band(value, threshold, Number.POSITIVE_INFINITY, softness);
}

/**
 * 脸型打分。
 *
 * 判别量（r1..r4 见 types.ts）：
 *   r1 = 长/颧宽        → 长脸 vs 短脸
 *   r2 = 额宽/颌宽      → 额头相对下颌的宽度
 *   r3 = 颧宽/颌宽      → 下颌相对颧骨的收窄程度
 *   r4 = 额宽/颧宽      → 额头相对颧骨的宽度
 *
 * 所有「宽 / 窄」都用**人群分位数**定义（P.*），不再用想象出来的绝对区间。
 *
 * ⚠️ 一个必须写在方法页上的限制：「心形脸」在这里的含义是
 *    「**相对**而言额头不比颧骨窄、且明显宽于下颌」。
 *    教科书定义是「额头是绝对最宽点」(F > C)，但在本测量空间里
 *    r4 = F/C 的最大值只有 0.78，**F > C 从未出现**。
 *    所以心形脸只能按相对意义表达 —— 这是测量口径决定的，不是措辞问题。
 */
export function scoreShapes(measurements: Measurements, gonialAngle: number): ShapeScore[] {
  const { lengthToWidth: r1, foreheadToJaw: r2, cheekToJaw: r3, foreheadToCheek: r4 } =
    measurements.ratios;

  // 下颌角：越小越「方」（有硬角），越大越「圆」（弧线过渡）。
  // 取人群四分位而不是固定值 —— 它是方/圆之间唯一的判别依据，必须真正分流。
  const angularJaw = atMost(gonialAngle, P.gonial.p25, 4);
  const roundedJaw = atLeast(gonialAngle, P.gonial.p75, 4);

  const long = atLeast(r1, P.r1.p75, 0.05);
  const compact = atMost(r1, P.r1.p25, 0.05);
  const midLength = band(r1, P.r1.p25, P.r1.p90, 0.05);

  // 两侧平行：额头、颧骨、下颌三者接近（r2 与 r4 都落在人群中间半数）
  const parallel = avg([
    band(r2, P.r2.p25, P.r2.p75, 0.05),
    band(r4, P.r4.p25, P.r4.p75, 0.03),
  ]);

  // 颧骨突出（双端收窄）：额头相对窄 **且** 下颌相对窄
  const cheekDominant = avg([atMost(r4, P.r4.p25, 0.03), atLeast(r3, P.r3.p75, 0.04)]);

  // 额头相对宽：额头/颧骨偏高 **且** 额头明显宽于下颌
  const foreheadDominant = avg([atLeast(r4, P.r4.p75, 0.025), atLeast(r2, P.r2.p75, 0.035)]);

  const scores: ShapeScore[] = [
    {
      // oval：颧骨最宽但温和，长度中上，下颌弧线
      shape: 'oval',
      score: avg([
        midLength,
        atLeast(r3, P.r3.p25, 0.05),
        band(r4, P.r4.p10, P.r4.p75, 0.04),
        roundedJaw,
      ]),
    },
    {
      // round：紧凑、三者平行、下颌柔和
      shape: 'round',
      score: avg([compact, parallel, atMost(r3, P.r3.p50, 0.05), roundedJaw]),
    },
    {
      // square：紧凑、三者平行、下颌有硬角。
      // r3 用 p50 而不是 p75：方脸的下颌应当是**相对宽**的，不能只是「不窄」，
      // 否则这一项覆盖 75% 的人，方脸会被动涨到 30%（已实测到过）。
      shape: 'square',
      score: avg([compact, parallel, atMost(r3, P.r3.p50, 0.04), angularJaw]),
    },
    {
      // heart：额头相对宽 + 下颌明显收窄（见函数注释里关于「相对」的说明）
      shape: 'heart',
      score: avg([foreheadDominant, atLeast(r3, P.r3.p50, 0.06), atLeast(r2, P.r2.p50, 0.05)]),
    },
    {
      // oblong：偏长 + 两侧平行
      shape: 'oblong',
      score: avg([long, parallel, band(r2, P.r2.p10, P.r2.p90, 0.06)]),
    },
    {
      // diamond：颧骨双端收窄
      shape: 'diamond',
      score: avg([cheekDominant, band(r2, P.r2.p10, P.r2.p90, 0.06)]),
    },
  ];

  return scores.sort((a, b) => b.score - a.score);
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

export interface AssessInput {
  measurements: Measurements;
  gonialAngleDeg: number;
  pose: PoseEstimate;
  faceCount: number;
}

export interface Assessment {
  shape: FaceShape;
  confidence: number;
  ranking: ShapeScore[];
  runnerUp: ShapeScore | null;
  warnings: AnalysisWarning[];
}

/**
 * 汇总打分 + 置信度 + 告警。
 *
 * confidence 是**启发式**：拟合度（第一名得分的绝对水平）与区分度
 * （与第二名的差距）的加权，映射到 0.35–0.97。它不是概率，UI 上不要写成
 * 「87% 的概率你是椭圆脸」—— 这正是竞品文案容易越界的地方。
 */
export function assess(input: AssessInput): Assessment {
  const { measurements, gonialAngleDeg: gonial, pose, faceCount } = input;
  const ranking = scoreShapes(measurements, gonial);
  const first = ranking[0];
  const second = ranking[1] ?? null;

  const margin = second ? first.score - second.score : first.score;
  const confidence = clamp(0.35 * first.score + 0.65 * clamp(margin * 2.5, 0, 1), 0, 0.97);

  const warnings: AnalysisWarning[] = [];

  if (faceCount > 1) {
    warnings.push({
      code: 'multiple_faces',
      message: `We found ${faceCount} faces in that photo; only the most prominent one is analysed. Try a photo with just you in it.`,
    });
  }

  if (!pose.straight) {
    warnings.push({
      code: 'pose_off_axis',
      message: `Your head is turned too far (roll ${(pose.rollDeg).toFixed(1)}°, turn ${(pose.yawProxy * 100).toFixed(1)}%), which distorts the width measurements. Face the camera straight on with your chin level, then try again.`,
    });
  }

  // 顶部锚点兜底检查。
  //
  // 历史：这里原本是 "发际线/头发遮挡" 检测，阈值 0.82。**已被 5 张真实照片证伪**：
  // 同一个人的 5 张照片给出 0.7946 / 0.8243 / 0.8325 / 0.8241 / 0.8244 ——
  // 全部挤在 0.038 的宽度里，0.82 从中间劈开（80% 误报），而且那个指标的取值与
  // 是否遮挡额头无关（被遮挡那张的值落在正常照片的取值范围内 → 零区分能力）。
  //
  // 现在降级为**极端值兜底**：0.90 远在这个人的正常区间（0.79–0.83）之外，
  // 只有网格顶端真的落错位置（相当于"发际线"贴到眉毛上）时才会触发。
  // 要把它重新做成真正的遮挡检测，需要一批**已知遮挡/未遮挡**的标注照片。
  const hairlineRatio =
    measurements.faceLength > 0 ? measurements.faceLengthBrow / measurements.faceLength : Number.NaN;
  if (Number.isFinite(hairlineRatio) && hairlineRatio > 0.9) {
    warnings.push({
      code: 'hairline_uncertain',
      message:
        'The top of your face was detected unusually low — as if there were almost no forehead. The result may be unreliable; try a front-facing photo with even lighting.',
    });
  }

  const r1 = measurements.ratios.lengthToWidth;
  if (!Number.isFinite(r1) || r1 > 2.1 || r1 < 0.85) {
    warnings.push({
      code: 'measurement_out_of_range',
      message: 'The measurements fall outside a plausible range, which usually means hair covering the forehead, a turned head, or a detection that slipped. Try a front-facing photo.',
    });
  }

  if (confidence < 0.45) {
    warnings.push({
      code: 'low_confidence',
      message: 'This face sits on the boundary between two shapes, so treat the result as indicative. A front-facing photo with even lighting will be more stable.',
    });
  }

  return {
    shape: first.shape,
    confidence,
    ranking,
    runnerUp: second,
    warnings,
  };
}
