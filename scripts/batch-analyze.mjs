#!/usr/bin/env node
/**
 * 批量分析 harness —— 把 regression/ 里的照片逐张喂给**真实页面**，导出每张的完整测量结果。
 *
 * 它存在的理由：脸型阈值的校准必须有批量数据（见 CALIBRATION.md），
 * 靠一张张手动截图是做不到的。
 *
 * 用法：
 *   .\dev.ps1 run batch                       # 分析 regression/
 *   .\dev.ps1 run batch -- --dir .smoke       # 换目录
 *   .\dev.ps1 run batch -- --self-test        # 环境自检（不需要任何照片）
 *   .\dev.ps1 run batch -- --url http://localhost:4321/
 *
 * 前提：站点正在运行（npm run dev），脚本会自动检查连通性。
 *
 * 标签文件（可选）：regression/labels.json
 *   {
 *     "a.jpg": { "shape": "oval" },
 *     "b.jpg": { "shape": "square", "borderline": true },
 *     "c.jpg": { "shape": "round", "person": "A" }
 *   }
 *   shape      —— 你标注的正确答案
 *   borderline —— 边界样本，不计入准确率分母
 *   person     —— 同一个人多张照片，用于稳定性测试
 *
 * 输出：regression/results.json + regression/results.csv，并在终端打印指标表。
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// 浏览器装在项目内，必须在 import playwright 之前把路径告诉它。
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(root, '.playwright-browsers');

// ── 参数 ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function option(name, fallback) {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--')
    ? argv[index + 1]
    : fallback;
}
const selfTest = argv.includes('--self-test');
const compareAnchors = argv.includes('--compare-anchors');
const dir = resolve(root, option('dir', selfTest ? '.smoke' : 'regression'));
const url = option('url', 'http://localhost:4321/');
const outJson = resolve(root, option('out', join(dir, 'results.json')));
const outCsv = outJson.replace(/\.json$/, '.csv');
const perImageTimeout = Number(option('timeout', '180000'));
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp']);

const SHAPES = ['oval', 'round', 'square', 'heart', 'oblong', 'diamond'];

// ── 前置检查 ────────────────────────────────────────────────────────────────
// 本机的 dev server 只监听了 IPv6 ::1，而 Node 与 Chrome 对 localhost 的解析
// 顺序不一定一致，所以候选 URL 逐个试，取第一个真正通的。
async function resolveBaseUrl(candidate) {
  const variants = [candidate];
  if (candidate.includes('localhost')) {
    variants.push(candidate.replace('localhost', '127.0.0.1'));
    variants.push(candidate.replace('localhost', '[::1]'));
  }
  const failures = [];
  for (const variant of variants) {
    try {
      const response = await fetch(variant, { method: 'HEAD' });
      if (response.ok) return variant;
      failures.push(`${variant} → HTTP ${response.status}`);
    } catch (err) {
      failures.push(`${variant} → ${err instanceof Error ? err.message : err}`);
    }
  }
  console.error(`[batch] 打不开站点，试过：`);
  for (const line of failures) console.error(`  ${line}`);
  console.error('[batch] 先启动站点：.\\dev.ps1 run dev');
  process.exit(1);
}

const baseUrl = await resolveBaseUrl(url);
if (baseUrl !== url) console.log(`[batch] 站点地址解析为 ${baseUrl}`);

await mkdir(dir, { recursive: true });

// ── 收集图片与标签 ──────────────────────────────────────────────────────────
// 放在启动浏览器之前：没图片就没必要起一次 Chromium。
let files = [];
let labels = {};
if (!selfTest) {
  files = (await readdir(dir))
    .filter((name) => IMAGE_EXT.has(extname(name).toLowerCase()))
    .sort();

  if (files.length === 0) {
    console.error(`[batch] ${dir} 里没有图片（支持 jpg / jpeg / png / webp / bmp）`);
    console.error('[batch] 放照片进去，或先跑 .\\dev.ps1 run batch -- --self-test 自检');
    process.exit(1);
  }

  const labelsPath = join(dir, 'labels.json');
  if (existsSync(labelsPath)) {
    // 注意：Windows 记事本另存为 UTF-8 会带 BOM，JSON.parse 会直接崩 —— 先剥掉
    const text = (await readFile(labelsPath, 'utf8')).replace(/^\uFEFF/, '');
    try {
      labels = JSON.parse(text);
    } catch (err) {
      console.error(`[batch] ${labelsPath} 不是合法 JSON：${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  }
}

const { chromium } = await import('playwright');

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (err) => console.error('  [page error]', err.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') console.error('  [console]', msg.text());
});

// --compare-anchors 在 /debug 上跑：那一页已经把每个候选锚点的结果都算好了
const targetUrl = compareAnchors ? new URL('/debug', baseUrl).href : baseUrl;
await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
// 文件 input 是 hidden 的（用户点的是拖拽区），所以只能等 attached，不能等 visible
await page.waitForSelector('[data-file-input]', { state: 'attached', timeout: 30000 });

/** 合成一张肯定没有脸的图：no_face 这个结论本身证明 wasm+模型+推理全跑通了 */
async function makeSyntheticImage(target) {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 800;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 800);
    gradient.addColorStop(0, '#d9c7b8');
    gradient.addColorStop(1, '#b08d70');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 640, 800);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.beginPath();
    ctx.ellipse(320, 400, 170, 230, 0, 0, Math.PI * 2);
    ctx.fill();
    return canvas.toDataURL('image/png');
  });
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(dataUrl.split(',')[1], 'base64'));
}

// ── 自检模式 ────────────────────────────────────────────────────────────────
if (selfTest) {
  const synthetic = join(dir, 'synthetic-no-face.png');
  console.log('[batch] 自检：生成合成图并跑完整推理链路…');
  await makeSyntheticImage(synthetic);

  await page.evaluate(() => {
    delete window.__faceShapeLast;
  });
  await page.setInputFiles('[data-file-input]', synthetic);
  await page.waitForFunction(() => Boolean(window.__faceShapeLast), null, {
    timeout: perImageTimeout,
  });
  const result = await page.evaluate(() => window.__faceShapeLast);

  const status = await page.textContent('[data-status]');
  console.log('');
  console.log('  状态文字      :', (status ?? '').trim());
  console.log('  拿到了结果对象:', Boolean(result));
  console.log('  ok            :', result?.ok);
  console.log('  检测到人脸数  :', result?.faceCount);
  console.log('  告警          :', (result?.warnings ?? []).map((w) => w.code).join(', ') || '（无）');

  const pipelineRan = Boolean(result) && typeof result.faceCount === 'number';
  console.log('');
  if (pipelineRan) {
    console.log('  ✅ 整条链路跑通：wasm 加载 + 模型加载 + 推理 + 结果回传。');
    console.log('     现在把真实照片放进 regression/ 就能开始校准。');
  } else {
    console.log('  ❌ 没拿到结果，页面里的分析没有完成。检查上面的 console/page error。');
  }
  await browser.close();
  process.exit(pipelineRan ? 0 : 1);
}

// ── 锚点对比模式 ────────────────────────────────────────────────────────────
// 在标注集上比较每个候选锚点组的**真实准确率**。
// 这是唯一能替代「看置信度猜锚点」的办法 —— 自洽 ≠ 正确（已知反例：
// 颌宽换成 136/365 在单张照片上给出全表最高置信度，但那个点快到下巴了）。
if (compareAnchors) {
  const labelledFiles = files.filter((file) => labels[file]?.shape);
  if (labelledFiles.length === 0) {
    console.error(`[batch] --compare-anchors 需要标注：请在 ${join(dir, 'labels.json')} 里标 shape`);
    await browser.close();
    process.exit(1);
  }

  const stats = new Map();
  let noFace = 0;

  for (const [index, file] of labelledFiles.entries()) {
    process.stdout.write(`[${String(index + 1).padStart(3)}/${labelledFiles.length}] ${file} … `);
    await page.evaluate(() => {
      delete window.__faceShapeVariants;
    });

    let variants;
    try {
      await page.setInputFiles('[data-file-input]', join(dir, file));
      await page.waitForFunction(() => Boolean(window.__faceShapeVariants), null, {
        timeout: perImageTimeout,
      });
      variants = await page.evaluate(() => window.__faceShapeVariants);
    } catch {
      console.log('超时 / 未检出人脸');
      noFace += 1;
      continue;
    }

    const { shape: expected, borderline } = labels[file];
    console.log(`${variants.length} 个变体${borderline ? '（边界样本，不计分）' : ''}`);

    if (borderline) continue;

    for (const variant of variants) {
      if (!stats.has(variant.label)) stats.set(variant.label, { hit1: 0, hit2: 0, total: 0 });
      const entry = stats.get(variant.label);
      entry.total += 1;
      if (variant.shape === expected) entry.hit1 += 1;
      if (variant.shape === expected || variant.runnerUp === expected) entry.hit2 += 1;
    }
  }

  await browser.close();

  const sorted = [...stats.entries()].sort(
    (a, b) => b[1].hit1 / b[1].total - a[1].hit1 / a[1].total,
  );

  console.log('');
  console.log('═'.repeat(76));
  console.log(`锚点组对比 —— ${labelledFiles.length} 张标注照片（未检出 ${noFace}）`);
  console.log('═'.repeat(76));
  const pct = (n, d) => (d > 0 ? `${((n / d) * 100).toFixed(1)}% (${n}/${d})` : '—');
  for (const [label, entry] of sorted) {
    const marker = label === '当前默认' ? ' ← 当前默认' : '';
    console.log(
      `  ${label.padEnd(22)} top-1 ${pct(entry.hit1, entry.total).padEnd(14)} ` +
        `top-2 ${pct(entry.hit2, entry.total)}${marker}`,
    );
  }
  console.log('');
  console.log('怎么读这张表：');
  console.log('  · top-1 最高的那一行，就是数据选出来的锚点组 —— 而不是我猜的那个');
  console.log('  · 如果「当前默认」不在前面，说明 ANCHORS 需要改');
  console.log('  · 差距在几个百分点以内（样本又少）时不要急着改，先加照片');

  const comparisonPath = outJson.replace(/\.json$/, '-anchors.json');
  await writeFile(
    comparisonPath,
    JSON.stringify(
      {
        url: targetUrl,
        dir,
        labelledCount: labelledFiles.length,
        noFace,
        generatedAt: new Date().toISOString(),
        variants: sorted.map(([label, entry]) => ({
          label,
          total: entry.total,
          top1: entry.hit1,
          top2: entry.hit2,
        })),
      },
      null,
      2,
    ),
  );
  console.log('');
  console.log(`结果已写入：${comparisonPath}`);
  process.exit(0);
}

// ── 逐张分析 ────────────────────────────────────────────────────────────────
// files / labels 已在启动浏览器之前收集好。
const rows = [];
for (const [index, file] of files.entries()) {
  process.stdout.write(`[${String(index + 1).padStart(3)}/${files.length}] ${file} … `);
  const started = Date.now();

  await page.evaluate(() => {
    delete window.__faceShapeLast;
  });

  try {
    await page.setInputFiles('[data-file-input]', join(dir, file));
    await page.waitForFunction(() => Boolean(window.__faceShapeLast), null, {
      timeout: perImageTimeout,
    });
  } catch {
    console.log('超时');
    rows.push({ file, error: 'timeout' });
    continue;
  }

  const result = await page.evaluate(() => window.__faceShapeLast);
  const ms = Date.now() - started;

  if (!result?.ok) {
    console.log(`no_face (${ms} ms)`);
    rows.push({ file, error: 'no_face', warnings: result?.warnings?.map((w) => w.code) ?? [] });
    continue;
  }

  const row = {
    file,
    ms,
    shape: result.shape,
    confidence: Number(result.confidence.toFixed(3)),
    runnerUp: result.runnerUp?.shape ?? null,
    runnerUpScore: result.runnerUp ? Number(result.runnerUp.score.toFixed(3)) : null,
    faceCount: result.faceCount,
    lengthToWidth: Number(result.measurements.ratios.lengthToWidth.toFixed(3)),
    foreheadToJaw: Number(result.measurements.ratios.foreheadToJaw.toFixed(3)),
    cheekToJaw: Number(result.measurements.ratios.cheekToJaw.toFixed(3)),
    foreheadToCheek: Number(result.measurements.ratios.foreheadToCheek.toFixed(3)),
    gonialAngle: Number(result.gonialAngleDeg.toFixed(1)),
    rollDeg: Number(result.pose.rollDeg.toFixed(1)),
    yawProxy: Number(result.pose.yawProxy.toFixed(4)),
    pitchProxy: Number(result.pose.pitchProxy.toFixed(3)),
    // 发际线一致性 = 眉心→下巴 / 发际线→下巴。告警阈值就靠这个字段用数据定。
    hairlineRatio: Number(
      (result.measurements.faceLengthBrow / result.measurements.faceLength).toFixed(4),
    ),
    warnings: result.warnings.map((w) => w.code),
  };
  rows.push(row);
  console.log(`${row.shape} ${(row.confidence * 100).toFixed(0)}%  (次优 ${row.runnerUp ?? '—'})  ${ms} ms`);
}

await browser.close();

// ── 输出 ────────────────────────────────────────────────────────────────────
await mkdir(dirname(outJson), { recursive: true });
await writeFile(outJson, JSON.stringify({ url: baseUrl, dir, generatedAt: new Date().toISOString(), rows }, null, 2));

const csvColumns = [
  'file', 'error', 'shape', 'expected', 'match', 'top2', 'confidence', 'runnerUp',
  'lengthToWidth', 'foreheadToJaw', 'cheekToJaw', 'foreheadToCheek', 'gonialAngle',
  'rollDeg', 'yawProxy', 'pitchProxy', 'hairlineRatio', 'faceCount', 'warnings',
];
const csvLines = [csvColumns.join(',')];
for (const row of rows) {
  const expected = labels[row.file]?.shape ?? '';
  const match = expected && row.shape ? String(row.shape === expected) : '';
  const top2 =
    expected && row.shape
      ? String(row.shape === expected || row.runnerUp === expected)
      : '';
  csvLines.push(
    csvColumns
      .map((column) => {
        const value =
          column === 'expected' ? expected
          : column === 'match' ? match
          : column === 'top2' ? top2
          : column === 'warnings' ? (row.warnings ?? []).join('|')
          : row[column] ?? '';
        return /[",\n]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value);
      })
      .join(','),
  );
}
await writeFile(outCsv, csvLines.join('\n'));

// ── 指标 ────────────────────────────────────────────────────────────────────
const analysed = rows.filter((row) => !row.error);
const failed = rows.filter((row) => row.error);

console.log('');
console.log('─'.repeat(72));
console.log(`分析了 ${rows.length} 张：成功 ${analysed.length}，失败 ${failed.length}`);
if (failed.length) {
  console.log(`  失败清单：${failed.map((row) => `${row.file}(${row.error})`).join(', ')}`);
}

const labelled = analysed.filter((row) => labels[row.file]?.shape);
if (labelled.length === 0) {
  console.log('');
  console.log('没有标签数据 —— 只导出了测量值。');
  console.log(`要算准确率，请在 ${join(dir, 'labels.json')} 里标注正确答案`);
  console.log('（格式见 regression/labels.example.json）。');
} else {
  const scored = labelled.filter((row) => !labels[row.file].borderline);
  const borderline = labelled.filter((row) => labels[row.file].borderline);
  const top1 = scored.filter((row) => row.shape === labels[row.file].shape).length;
  const top2 = scored.filter(
    (row) => row.shape === labels[row.file].shape || row.runnerUp === labels[row.file].shape,
  ).length;
  const flagged = borderline.filter((row) => row.warnings?.includes('low_confidence')).length;

  const pct = (n, d) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%  (${n}/${d})` : '—');

  console.log('');
  console.log('指标（目标见 CALIBRATION.md 第五节）');
  console.log(`  top-1 一致率        ${pct(top1, scored.length)}      目标 ≥ 75%`);
  console.log(`  top-2 一致率        ${pct(top2, scored.length)}      目标 ≥ 90%`);
  console.log(`  边界样本告警覆盖    ${pct(flagged, borderline.length)}      目标 ≥ 80%`);

  // 按形状细分：看清到底是哪一类在拖后腿
  console.log('');
  console.log('按标注脸型细分');
  for (const shape of SHAPES) {
    const group = scored.filter((row) => labels[row.file].shape === shape);
    if (group.length === 0) continue;
    const hit = group.filter((row) => row.shape === shape).length;
    const miss = group.filter((row) => row.shape !== shape);
    const detail = miss.length
      ? `  误判为：${miss.map((row) => `${row.file}→${row.shape}`).join(', ')}`
      : '';
    console.log(`  ${shape.padEnd(8)} ${pct(hit, group.length)}${detail}`);
  }

  // 稳定性：同一个人的多张照片结论是否一致
  const people = new Map();
  for (const row of labelled) {
    const person = labels[row.file].person;
    if (!person) continue;
    if (!people.has(person)) people.set(person, []);
    people.get(person).push(row.shape);
  }
  if (people.size > 0) {
    console.log('');
    console.log('稳定性（同一人多张照片的结论分布）');
    for (const [person, shapes] of people) {
      const counts = shapes.reduce((acc, s) => ({ ...acc, [s]: (acc[s] ?? 0) + 1 }), {});
      const best = Math.max(...Object.values(counts));
      console.log(
        `  ${person.padEnd(10)} ${shapes.length} 张 · ${Object.entries(counts)
          .map(([s, n]) => `${s}×${n}`)
          .join(' ')} · ${best / shapes.length >= 0.8 ? '稳定' : '❌ 不稳定'}`,
      );
    }
  }
}

console.log('');
console.log(`结果已写入：${outJson}`);
console.log(`          ${outCsv}`);
