/**
 * 锚点校准页（/debug）—— 只在开发环境用，不要部署到生产。
 *
 * 它解决一个具体问题：ANCHORS 里那些索引是「合理默认」，但要确定哪一组
 * 在你的数据上最稳，唯一可靠的办法是肉眼看 + 比较灵敏度。这个页面给你：
 *   1. 全部 478 个点的叠加显示（可开关标签）
 *   2. 鼠标悬停显示最近点的索引 + 该点的「眼线纵向偏移」
 *   3. 点位探测器：输入任意索引，钉住看它的位置和偏移
 *   4. 各组候选锚点的宽度对比 + 各自的纵向偏移（跨照片可比）
 *   5. 当前照片的完整测量/姿态/打分 JSON
 *
 * 纵向偏移的参考量级（按脸长归一化，眼外角连线 = 0）：
 *   面部三等分 → 眉约 -7% · 鼻底约 +27% · 下巴约 +60%
 *   颧弓（教科书意义的颧宽）应该在眼线下不远处
 *   如果某组候选的偏移明显偏低（贴近嘴/下颌），那它量的其实是轮廓最宽处，
 *   不是颧弓 —— 这两个量会给出不同的 r3 / r4。
 */
import { assess, gonialAngleDeg, measure, type AnchorOverride } from '../lib/face-shape/classify';
import { analyzeCanvas } from '../lib/face-shape/detector';
import { loadImageAsCanvas } from '../lib/face-shape/image';
import {
  ALTERNATIVE_ANCHORS,
  ANCHORS,
  distance,
  midpoint,
  toPixelCoords,
} from '../lib/face-shape/landmarks';
import { renderOverlay } from '../lib/face-shape/overlay';
import { derotate } from '../lib/face-shape/pose';
import type { Pt, PoseEstimate } from '../lib/face-shape/types';

function must<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`[debug] 缺少 DOM 节点：${selector}`);
  return el;
}

const fileInput = must<HTMLInputElement>('[data-file-input]');
const canvas = must<HTMLCanvasElement>('[data-canvas]');
const statusEl = must<HTMLElement>('[data-status]');
const jsonEl = must<HTMLElement>('[data-json]');
const tableEl = must<HTMLElement>('[data-table]');
const hoverEl = must<HTMLElement>('[data-hover]');
const probeInput = must<HTMLInputElement>('[data-probe-index]');
const probeReadoutEl = must<HTMLElement>('[data-probe-readout]');
const variantsEl = must<HTMLElement>('[data-variants]');
const showAllToggle = must<HTMLInputElement>('[data-show-all]');
const showLabelsToggle = must<HTMLInputElement>('[data-show-labels]');

const SHAPE_ZH: Record<string, string> = {
  oval: '鹅蛋脸',
  round: '圆脸',
  square: '方脸',
  heart: '心形脸',
  oblong: '长脸',
  diamond: '菱形脸',
};

/** 原始像素坐标（绘制用） */
let points: Pt[] = [];
/** 去旋转后的坐标（测量用）—— 所有纵向偏移都基于这一组 */
let centered: Pt[] = [];
let photo: HTMLCanvasElement | null = null;
let faceHeight = 0;
let eyeLineY = 0;
let lastPose: PoseEstimate | null = null;
let lastFaceCount = 0;
let lastGonial = Number.NaN;

/** 相对眼外角连线的纵向偏移，按脸长归一化（%）。判断锚点解剖位置的数字依据。 */
function offsetPct(p: Pt | undefined): number {
  if (!p || !(faceHeight > 0)) return Number.NaN;
  return ((p.y - eyeLineY) / faceHeight) * 100;
}

function fmtOffset(p: Pt | undefined): string {
  const value = offsetPct(p);
  if (!Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function currentProbeIndex(): number | null {
  const raw = probeInput.value.trim();
  if (raw === '') return null;
  const index = Number(raw);
  if (!Number.isInteger(index) || index < 0 || index >= points.length) return null;
  return index;
}

function drawProbe() {
  const index = currentProbeIndex();
  if (index === null) return;
  const point = centered[index] ?? points[index];
  if (!point) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const unit = Math.max(1, canvas.width / 500);
  ctx.strokeStyle = '#ff00ff';
  ctx.lineWidth = unit * 2;
  ctx.beginPath();
  ctx.arc(point.x, point.y, unit * 6, 0, Math.PI * 2);
  ctx.stroke();

  ctx.font = `${Math.round(unit * 7)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.lineWidth = unit * 2;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillStyle = '#ff00ff';
  const label = `#${index} ${fmtOffset(point)}`;
  ctx.strokeText(label, point.x + unit * 8, point.y - unit * 4);
  ctx.fillText(label, point.x + unit * 8, point.y - unit * 4);
}

function paint() {
  if (!photo) return;
  renderOverlay(canvas, photo, points, undefined, {
    showAll: showAllToggle.checked,
    showLabels: showLabelsToggle.checked,
  });
  drawProbe();
}

function updateProbeReadout() {
  const index = currentProbeIndex();
  if (index === null) {
    probeReadoutEl.textContent = points.length
      ? '输入 0–477 之间的索引来钉住一个点'
      : '';
    return;
  }
  const point = centered[index] ?? points[index];
  probeReadoutEl.textContent =
    `#${index} · 眼线下 ${fmtOffset(point)} · ` +
    `x=${Math.round(point.x)} y=${Math.round(point.y)}`;
}

function relativeWidth(pts: readonly Pt[], pair: readonly [number, number], base: number): string {
  const a = pts[pair[0]];
  const b = pts[pair[1]];
  if (!a || !b || !(base > 0)) return '—';
  const width = Math.hypot(a.x - b.x, a.y - b.y) / base;
  return `${width.toFixed(3)} (${Math.round(width * 100)}%)`;
}

function renderTable(pts: readonly Pt[], cheekBase: number) {
  const groups: Array<{
    label: string;
    active: readonly [number, number];
    pairs: ReadonlyArray<readonly [number, number]>;
  }> = [
    { label: '额宽 forehead', active: [ANCHORS.foreheadLeft, ANCHORS.foreheadRight], pairs: ALTERNATIVE_ANCHORS.forehead },
    { label: '颧宽 cheek', active: [ANCHORS.cheekLeft, ANCHORS.cheekRight], pairs: ALTERNATIVE_ANCHORS.cheek },
    { label: '颌宽 jaw', active: [ANCHORS.jawLeft, ANCHORS.jawRight], pairs: ALTERNATIVE_ANCHORS.jaw },
  ];

  const rows: string[] = [];
  for (const group of groups) {
    for (const pair of group.pairs) {
      const isActive = pair[0] === group.active[0] && pair[1] === group.active[1];
      rows.push(
        `<tr${isActive ? ' class="active"' : ''}>` +
          `<td>${group.label}</td><td>${pair[0]} / ${pair[1]}</td>` +
          `<td>${relativeWidth(pts, pair, cheekBase)}</td>` +
          `<td>${fmtOffset(pts[pair[0]])} / ${fmtOffset(pts[pair[1]])}</td>` +
          `<td>${isActive ? '当前默认' : ''}</td></tr>`,
      );
    }
  }

  const trichionRows = ALTERNATIVE_ANCHORS.trichion
    .map((index) => {
      const top = pts[index];
      const chin = pts[ANCHORS.menton];
      const ratio =
        top && chin && cheekBase > 0
          ? Math.hypot(top.x - chin.x, top.y - chin.y) / cheekBase
          : Number.NaN;
      const isActive = index === ANCHORS.trichion;
      return (
        `<tr${isActive ? ' class="active"' : ''}><td>脸长 trichion</td>` +
        `<td>${index} → ${ANCHORS.menton}</td>` +
        `<td>${Number.isFinite(ratio) ? `${ratio.toFixed(3)} (长/颧宽)` : '—'}</td>` +
        `<td>${fmtOffset(top)}</td>` +
        `<td>${isActive ? '当前默认' : ''}</td></tr>`
      );
    })
    .join('');

  // 参考行：用这张脸自己的眉/下巴当坐标系，避免依赖我拍脑袋的参考百分比
  const referenceRows = [
    { label: '参考 · 眉心', index: ANCHORS.glabella, note: '≈ 眉线' },
    { label: '参考 · 下巴', index: ANCHORS.menton, note: '脸长终点' },
    { label: '参考 · 鼻尖', index: ANCHORS.noseTip, note: '' },
  ]
    .map(
      ({ label, index, note }) =>
        `<tr><td>${label}</td><td>${index}</td><td>—</td>` +
        `<td>${fmtOffset(pts[index])}</td><td>${note}</td></tr>`,
    )
    .join('');

  tableEl.innerHTML =
    '<table><thead><tr><th>度量</th><th>点位</th><th>相对颧宽</th>' +
    '<th>纵向偏移（左/右）</th><th></th></tr></thead>' +
    `<tbody>${rows.join('')}${trichionRows}${referenceRows}</tbody></table>`;
}

/**
 * 「换锚点对比」表：把每个候选点对分别换上去，算出完整的比例和分类结果。
 *
 * 这是本页最重要的功能 —— 它把「猜哪个锚点对」变成「看哪一行自洽」。
 * 判据不是准确率（没有标注无法算），而是**自洽性**：
 * 一个正确的锚点组，会让四个比例同时落进同一个脸型的合理区间，
 * 从而给出高置信度；错误的锚点会让所有规则都落空，置信度卡在 40% 附近。
 */
function renderVariants() {
  const pose = lastPose;
  if (!pose || centered.length === 0) {
    variantsEl.innerHTML = '';
    return;
  }

  const variants: Array<{ label: string; override: AnchorOverride }> = [
    { label: '当前默认', override: {} },
    ...ALTERNATIVE_ANCHORS.cheek.map((pair) => ({
      label: `颧宽 → ${pair[0]}/${pair[1]}`,
      override: { cheek: pair } as AnchorOverride,
    })),
    ...ALTERNATIVE_ANCHORS.forehead.map((pair) => ({
      label: `额宽 → ${pair[0]}/${pair[1]}`,
      override: { forehead: pair } as AnchorOverride,
    })),
    ...ALTERNATIVE_ANCHORS.jaw.map((pair) => ({
      label: `颌宽 → ${pair[0]}/${pair[1]}`,
      override: { jaw: pair } as AnchorOverride,
    })),
  ];

  const scored = variants.map((variant) => {
    const m = measure(centered, variant.override);
    const a = assess({
      measurements: m,
      gonialAngleDeg: lastGonial,
      pose,
      faceCount: lastFaceCount,
    });
    return { variant, m, a };
  });

  const bestConfidence = Math.max(...scored.map((item) => item.a.confidence));

  const rows = scored
    .map(({ variant, m, a }) => {
      const r = m.ratios;
      const isDefault = variant.label === '当前默认';
      const isBest = a.confidence === bestConfidence && !isDefault;
      return (
        `<tr${isDefault ? ' class="active"' : ''}>` +
        `<td>${variant.label}</td>` +
        `<td>${r.lengthToWidth.toFixed(3)}</td>` +
        `<td>${r.foreheadToJaw.toFixed(3)}</td>` +
        `<td>${r.cheekToJaw.toFixed(3)}</td>` +
        `<td>${r.foreheadToCheek.toFixed(3)}</td>` +
        `<td>${SHAPE_ZH[a.shape] ?? a.shape}</td>` +
        `<td>${(a.confidence * 100).toFixed(0)}%${isBest ? ' ★' : ''}</td></tr>`
      );
    })
    .join('');

  variantsEl.innerHTML =
    '<table><thead><tr><th>换用的锚点</th><th>长/颧宽</th><th>额/颌宽</th>' +
    '<th>颧/颌宽</th><th>额/颧宽</th><th>判定</th><th>置信度</th></tr></thead>' +
    `<tbody>${rows}</tbody></table>`;

  // 机器可读出口：供 scripts/batch-analyze.mjs --compare-anchors 直接读取，
  // 用来在标注集上比较每个锚点组的真实准确率（而不是靠自洽性猜）。
  (window as unknown as Record<string, unknown>).__faceShapeVariants = scored.map(
    ({ variant, m, a }) => ({
      label: variant.label,
      ratios: {
        lengthToWidth: m.ratios.lengthToWidth,
        foreheadToJaw: m.ratios.foreheadToJaw,
        cheekToJaw: m.ratios.cheekToJaw,
        foreheadToCheek: m.ratios.foreheadToCheek,
      },
      shape: a.shape,
      confidence: a.confidence,
      runnerUp: a.runnerUp?.shape ?? null,
    }),
  );
}

async function handleFile(file: File) {  statusEl.textContent = '处理中…';
  try {
    photo = await loadImageAsCanvas(file, 2000);
    paint();
    statusEl.textContent = '加载模型…';

    const result = await analyzeCanvas(photo);
    if (!result.ok || !photo) {
      statusEl.textContent = '未检测到人脸';
      points = [];
      centered = [];
      paint();
      return;
    }

    points = result.landmarks;

    // 测量与纵向偏移都基于去旋转后的坐标：门禁过后残留的几度倾斜
    // 会让颧宽系统性偏大，也会让偏移读数失准。
    const eyeMid = midpoint(points[ANCHORS.eyeOuterLeft], points[ANCHORS.eyeOuterRight]);
    centered = derotate(points, eyeMid, result.pose.rollDeg);

    faceHeight = distance(centered[ANCHORS.trichion], centered[ANCHORS.menton]);
    eyeLineY = (centered[ANCHORS.eyeOuterLeft].y + centered[ANCHORS.eyeOuterRight].y) / 2;

    const m = measure(centered);
    const gonial = gonialAngleDeg(centered);
    const assessment = assess({
      measurements: m,
      gonialAngleDeg: gonial,
      pose: result.pose,
      faceCount: result.faceCount,
    });

    lastPose = result.pose;
    lastFaceCount = result.faceCount;
    lastGonial = gonial;

    const anchorOffsets = Object.fromEntries(
      (Object.entries(ANCHORS) as Array<[string, number]>).map(([name, index]) => [
        `${name} (#${index})`,
        fmtOffset(centered[index]),
      ]),
    );

    jsonEl.textContent = JSON.stringify(
      {
        图像: { width: photo.width, height: photo.height },
        姿态: result.pose,
        测量_px: {
          额宽: m.foreheadWidth,
          颧宽: m.cheekWidth,
          颌宽: m.jawWidth,
          脸长: m.faceLength,
          眉心到下巴: m.faceLengthBrow,
        },
        发际线一致性: m.faceLengthBrow / m.faceLength,
        锚点相对眼线位置: anchorOffsets,
        比例: m.ratios,
        下颌角: gonial,
        脸型: assessment.shape,
        置信度: assessment.confidence,
        排名: assessment.ranking,
        告警: assessment.warnings,
      },
      null,
      2,
    );

    renderTable(centered, m.cheekWidth);
    renderVariants();
    updateProbeReadout();
    statusEl.textContent = '完成';
    paint();
  } catch (err) {
    statusEl.textContent = '失败：' + (err instanceof Error ? err.message : String(err));
  }
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) void handleFile(file);
});

showAllToggle.addEventListener('change', paint);
showLabelsToggle.addEventListener('change', paint);

probeInput.addEventListener('input', () => {
  updateProbeReadout();
  paint();
});

// 悬停显示最近点的索引和纵向偏移：这是找锚点最快的办法
canvas.addEventListener('mousemove', (event) => {
  if (points.length === 0) {
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((event.clientY - rect.top) / rect.height) * canvas.height;

  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  points.forEach((point, index) => {
    const d = Math.hypot(point.x - x, point.y - y);
    if (d < bestDistance) {
      bestDistance = d;
      bestIndex = index;
    }
  });

  hoverEl.textContent =
    bestIndex >= 0
      ? `最近点 #${bestIndex} · 眼线下 ${fmtOffset(centered[bestIndex])} · 距离 ${bestDistance.toFixed(1)}px`
      : '把鼠标移到脸上查看最近的点位索引';
});

// 暴露给控制台，方便一次性把候选点的坐标打出来对照
Object.assign(window as unknown as Record<string, unknown>, {
  __faceShapeDebug: {
    toPixelCoords,
    ANCHORS,
    ALTERNATIVE_ANCHORS,
    getPoints: () => points,
    getCentered: () => centered,
  },
});
