import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import { assess, gonialAngleDeg, measure } from './classify';
import { ANCHORS, midpoint, toPixelCoords } from './landmarks';
import { derotate, estimatePose } from './pose';
import type { AnalysisResult, AnalysisWarning, Pt } from './types';

export const ASSETS = {
  /** 由 scripts/sync-assets.mjs 从 node_modules 复制过来 */
  wasmBase: '/mediapipe/wasm',
  /** 由 scripts/sync-assets.mjs 下载 */
  modelPath: '/models/face_landmarker.task',
} as const;

export type DetectorStatus = 'idle' | 'loading' | 'ready' | 'failed';

let landmarkerPromise: Promise<FaceLandmarker> | null = null;
let status: DetectorStatus = 'idle';

export function getStatus(): DetectorStatus {
  return status;
}

async function createLandmarker(delegate: 'GPU' | 'CPU'): Promise<FaceLandmarker> {
  const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
  const fileset = await FilesetResolver.forVisionTasks(ASSETS.wasmBase);

  return FaceLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: ASSETS.modelPath,
      delegate,
    },
    runningMode: 'IMAGE',
    // 2 而不是 1：多一点成本，换来「照片里有别人」时能给出提示而不是默默选一张
    numFaces: 2,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    // 本工具用不到的输出全部关掉，省算力
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  });
}

/**
 * 惰性单例：只有用户真的选了图片才会触发下载（wasm + 约 3MB 模型）。
 * 首屏绝不能碰它 —— 否则 LCP 会被 3MB 的模型拖死。
 *
 * GPU delegate 失败时回退 CPU：老浏览器 / 无 WebGL2 的环境会走到这条路径，
 * 比直接报错给用户看要好。
 */
export function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    status = 'loading';
    landmarkerPromise = (async () => {
      try {
        const landmarker = await createLandmarker('GPU');
        status = 'ready';
        return landmarker;
      } catch (gpuError) {
        console.warn('[face-shape] GPU delegate unavailable, falling back to CPU:', gpuError);
        try {
          const landmarker = await createLandmarker('CPU');
          status = 'ready';
          return landmarker;
        } catch (cpuError) {
          status = 'failed';
          landmarkerPromise = null; // 允许用户重试
          throw cpuError;
        }
      }
    })();
  }
  return landmarkerPromise;
}

function emptyResult(warnings: AnalysisWarning[]): AnalysisResult {
  const nan = Number.NaN;
  return {
    ok: false,
    faceCount: 0,
    landmarks: [],
    measurements: {
      foreheadWidth: nan,
      cheekWidth: nan,
      jawWidth: nan,
      faceLength: nan,
      faceLengthBrow: nan,
      ratios: {
        lengthToWidth: nan,
        lengthToWidthBrow: nan,
        foreheadToJaw: nan,
        cheekToJaw: nan,
        foreheadToCheek: nan,
      },
    },
    pose: { rollDeg: nan, yawProxy: nan, pitchProxy: nan, straight: false },
    gonialAngleDeg: nan,
    shape: 'oval',
    confidence: 0,
    ranking: [],
    runnerUp: null,
    warnings,
  };
}

/**
 * 主流程：图片 canvas → landmarks → 姿态门禁 → 去旋转 → 测量 → 分类。
 *
 * 全程在浏览器内完成，没有任何网络请求（模型除外，且只下载一次）。
 */
export async function analyzeCanvas(canvas: HTMLCanvasElement): Promise<AnalysisResult> {
  const landmarker = await getFaceLandmarker();
  const result = landmarker.detect(canvas);
  const faces = result.faceLandmarks ?? [];

  if (faces.length === 0) {
    return emptyResult([
      {
        code: 'no_face',
        message: 'No face detected. Check that the photo shows a face, with even lighting and nothing covering it.',
      },
    ]);
  }

  // 归一化坐标 → 像素坐标。必须做，否则宽高比会污染所有比例。
  const raw: Pt[] = toPixelCoords(faces[0], canvas.width, canvas.height);

  const pose = estimatePose(raw);

  // 即使姿态门禁没过也继续算：这样用户可以一边看到结果一边看到「请正对镜头」
  // 的提示，比直接拒绝出结果体验好。门禁状态通过 warnings 暴露。
  const eyeMid = midpoint(raw[ANCHORS.eyeOuterLeft], raw[ANCHORS.eyeOuterRight]);
  const centered = derotate(raw, eyeMid, pose.rollDeg);

  const measurements = measure(centered);
  const gonial = gonialAngleDeg(centered);
  const assessment = assess({ measurements, gonialAngleDeg: gonial, pose, faceCount: faces.length });

  return {
    ok: true,
    faceCount: faces.length,
    landmarks: raw,
    measurements,
    pose,
    gonialAngleDeg: gonial,
    ...assessment,
  };
}
