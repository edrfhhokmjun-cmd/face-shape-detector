import { analyzeCanvas } from '../lib/face-shape/detector';
import { ImageLoadError, loadImageAsCanvas } from '../lib/face-shape/image';
import { renderOverlay } from '../lib/face-shape/overlay';
import type { AnalysisResult, Measurements } from '../lib/face-shape/types';

const SHAPE_LABELS: Record<string, string> = {
  oval: 'Oval',
  round: 'Round',
  square: 'Square',
  heart: 'Heart',
  oblong: 'Oblong',
  diamond: 'Diamond',
};

function must<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`[face-shape] 缺少 DOM 节点：${selector}`);
  return el;
}

const root = document.querySelector<HTMLElement>('[data-tool-root]');
if (root) {
  const dropzone = must<HTMLElement>(root, '[data-dropzone]');
  const fileInput = must<HTMLInputElement>(root, '[data-file-input]');
  const stage = must<HTMLElement>(root, '[data-stage]');
  const canvas = must<HTMLCanvasElement>(root, '[data-photo-canvas]');
  const statusEl = must<HTMLElement>(root, '[data-status]');
  const errorEl = must<HTMLElement>(root, '[data-error]');
  const resultsEl = must<HTMLElement>(root, '[data-results]');
  const shapeEl = must<HTMLElement>(root, '[data-shape]');
  const runnerUpEl = must<HTMLElement>(root, '[data-runner-up]');
  const guideLinksEl = must<HTMLElement>(root, '[data-guide-links]');
  const ratiosEl = must<HTMLElement>(root, '[data-ratios]');
  const widestEl = must<HTMLElement>(root, '[data-widest]');
  const poseEl = must<HTMLElement>(root, '[data-pose]');
  const warningsEl = must<HTMLElement>(root, '[data-warnings]');
  const resetBtn = must<HTMLButtonElement>(root, '[data-reset]');
  const landmarkToggle = must<HTMLInputElement>(root, '[data-toggle-landmarks]');

  let photo: HTMLCanvasElement | null = null;
  let lastResult: AnalysisResult | null = null;
  let busy = false;

  function setStatus(text: string, tone: 'idle' | 'busy' | 'done' | 'error' = 'idle') {
    statusEl.textContent = text;
    statusEl.dataset.tone = tone;
  }

  function setError(message: string | null) {
    errorEl.textContent = message ?? '';
    errorEl.hidden = !message;
  }

  function pctDifference(higher: number, lower: number): number {
    return Math.round((higher / lower - 1) * 100);
  }

  /** 「A 比 B 宽 N%」这种直白读法比只给一个比值有用得多 —— 这是「测量值优先」的核心 */
  function widerThan(a: number, b: number, nameA: string, nameB: string): string {
    return a >= b
      ? `${nameA} about ${pctDifference(a, b)}% wider than ${nameB}`
      : `${nameA} about ${pctDifference(b, a)}% narrower than ${nameB}`;
  }

  function ratiosHtml(m: Measurements): string {
    const r = m.ratios;
    const fmt = (value: number) => (Number.isFinite(value) ? value.toFixed(3) : '—');

    const rows: Array<[string, string, string]> = [
      [
        'Face length ÷ cheekbone width',
        fmt(r.lengthToWidth),
        r.lengthToWidth >= 1
          ? `your face is about ${pctDifference(m.faceLength, m.cheekWidth)}% longer than it is wide`
          : `your face is about ${pctDifference(m.cheekWidth, m.faceLength)}% wider than it is long`,
      ],
      [
        'Forehead ÷ jaw width',
        fmt(r.foreheadToJaw),
        widerThan(m.foreheadWidth, m.jawWidth, 'forehead', 'jaw'),
      ],
      [
        'Cheekbone ÷ jaw width',
        fmt(r.cheekToJaw),
        widerThan(m.cheekWidth, m.jawWidth, 'cheekbones', 'jaw'),
      ],
      [
        'Forehead ÷ cheekbone width',
        fmt(r.foreheadToCheek),
        widerThan(m.foreheadWidth, m.cheekWidth, 'forehead', 'cheekbones'),
      ],
    ];

    return rows
      .map(([label, value, reading]) => `<dt>${label}<span>${reading}</span></dt><dd>${value}</dd>`)
      .join('');
  }

  /** 直接回答「我的脸哪里最宽」—— 这是读者真正想知道的那一件事 */
  function widestPoint(m: Measurements): string {
    const ranked = (
      [
        ['forehead', m.foreheadWidth],
        ['cheekbones', m.cheekWidth],
        ['jaw', m.jawWidth],
      ] as Array<[string, number]>
    ).sort((a, b) => b[1] - a[1]);

    const first = ranked[0];
    const second = ranked[1];
    if (!first || !second) return '';

    const margin = Math.round((first[1] / second[1] - 1) * 100);
    return margin <= 2
      ? `Widest point: the ${first[0]} and ${second[0]} are within ${margin}% of each other — nothing dominates.`
      : `Widest point: the ${first[0]}, about ${margin}% wider than the next widest (${second[0]}).`;
  }

  function paint() {
    if (!photo) return;
    renderOverlay(canvas, photo, lastResult?.landmarks, lastResult?.measurements, {
      showMeasurements: Boolean(lastResult?.ok),
      showAll: landmarkToggle.checked,
    });
  }

  function renderResult(result: AnalysisResult) {
    resultsEl.hidden = false;

    if (!result.ok) {
      shapeEl.textContent = 'Not detected';
      runnerUpEl.textContent = '';
      guideLinksEl.innerHTML = '';
      ratiosEl.innerHTML = '';
      widestEl.textContent = '';
      poseEl.textContent = '';
      warningsEl.innerHTML = result.warnings.map((w) => `<li>${w.message}</li>`).join('');
      setStatus('No face detected', 'error');
      paint();
      return;
    }

    // 先给测量值，再给类别 —— 测量是可靠的，类别是约定（见 EVALUATION.md）
    ratiosEl.innerHTML = ratiosHtml(result.measurements);
    widestEl.textContent = widestPoint(result.measurements);

    // 只给「最接近的两个」，不给单一结论，也不给百分比。
    // 理由（实测）：corr(confidence, 正确) = 0.094，几乎无预测能力；
    // 平均 confidence 0.502 而实际准确率 0.300 —— 系统性过度自信 20 个百分点。
    // 显示一个 70% 概率是错的标签 + 一个虚高的百分比，比不显示更糟。
    const primary = result.shape;
    const secondary = result.runnerUp?.shape ?? null;
    shapeEl.textContent = SHAPE_LABELS[primary] ?? primary;

    if (secondary) {
      const primaryScore = result.ranking[0]?.score ?? 0;
      const margin = primaryScore - (result.runnerUp?.score ?? 0);
      runnerUpEl.textContent =
        margin <= 0.08
          ? `Almost equally close: ${SHAPE_LABELS[secondary] ?? secondary}`
          : `Next closest: ${SHAPE_LABELS[secondary] ?? secondary}`;
      guideLinksEl.innerHTML =
        `<a href="/shapes/${primary}/">Read the ${(SHAPE_LABELS[primary] ?? primary).toLowerCase()} guide</a>` +
        `<a href="/shapes/${secondary}/">Read the ${(SHAPE_LABELS[secondary] ?? secondary).toLowerCase()} guide</a>`;
    } else {
      runnerUpEl.textContent = '';
      guideLinksEl.innerHTML = `<a href="/shapes/${primary}/">Read the ${(SHAPE_LABELS[primary] ?? primary).toLowerCase()} guide</a>`;
    }

    const pose = result.pose;
    poseEl.textContent =
      `Head roll ${pose.rollDeg.toFixed(1)}° · turn ${(pose.yawProxy * 100).toFixed(1)}% · ` +
      `pitch ${Number.isFinite(pose.pitchProxy) ? pose.pitchProxy.toFixed(2) : '—'} · ` +
      `jaw angle ${Number.isFinite(result.gonialAngleDeg) ? result.gonialAngleDeg.toFixed(1) : '—'}°`;

    warningsEl.innerHTML = result.warnings.map((w) => `<li>${w.message}</li>`).join('');

    setStatus('Done — your photo never left your device', 'done');
    paint();
  }

  async function handleFile(file: File) {
    if (busy) return;
    busy = true;
    setError(null);
    resultsEl.hidden = true;

    try {
      setStatus('Reading image…', 'busy');
      photo = await loadImageAsCanvas(file);

      stage.hidden = false;
      dropzone.hidden = true;
      resultsEl.hidden = true;
      lastResult = null;
      paint();

      // 首次会下载 wasm 运行时（压缩后约 3 MB）+ 模型（约 3.6 MB）≈ 7 MB。
      // 这个数字是**实测**的（.tools/measure-analysis.mjs），不是估的 ——
      // 之前这里写「约 3 MB」，比实际少一半以上，慢网用户会以为卡死了。
      setStatus('Loading the model and runtime (about 7 MB the first time, cached afterwards)…', 'busy');
      // 让浏览器有机会把上面这行文字画出来，再进入可能耗时数秒的推理
      await new Promise((r) => requestAnimationFrame(() => r(null)));

      const result = await analyzeCanvas(photo);
      lastResult = result;
      // 供 headless 批处理脚本（scripts/batch-analyze.mjs）读取结构化结果。
      // 对页面本身没有任何影响，只是一个只读出口。
      (window as unknown as Record<string, unknown>).__faceShapeLast = result;
      renderResult(result);
    } catch (err) {
      const message =
        err instanceof ImageLoadError
          ? err.message
          : 'Analysis failed: ' + (err instanceof Error ? err.message : String(err));
      setError(message);
      setStatus('Something went wrong', 'error');
    } finally {
      busy = false;
    }
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) void handleFile(file);
    fileInput.value = ''; // 允许重复选同一张图
  });

  dropzone.addEventListener('click', () => fileInput.click());

  // 键盘可达性：role="button" + tabindex="0" 只是让元素可聚焦，
  // 不处理 Enter / 空格 就是 WCAG 2.1.1 失败 —— 而且鼠标测试永远发现不了。
  dropzone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      fileInput.click();
    }
  });

  for (const eventName of ['dragenter', 'dragover'] as const) {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.dataset.dragging = 'true';
    });
  }
  for (const eventName of ['dragleave', 'drop'] as const) {
    dropzone.addEventListener(eventName, () => {
      delete dropzone.dataset.dragging;
    });
  }
  dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) void handleFile(file);
  });

  // 直接 Ctrl+V 粘贴截图 —— 桌面端转化率最高的一条路径
  window.addEventListener('paste', (event) => {
    const item = Array.from(event.clipboardData?.items ?? []).find((i) =>
      i.type.startsWith('image/'),
    );
    const file = item?.getAsFile();
    if (file) void handleFile(file);
  });

  landmarkToggle.addEventListener('change', paint);

  resetBtn.addEventListener('click', () => {
    photo = null;
    lastResult = null;
    stage.hidden = true;
    dropzone.hidden = false;
    resultsEl.hidden = true;
    setError(null);
    setStatus('Waiting for a photo', 'idle');
  });

  setStatus('Waiting for a photo', 'idle');
}
