#!/usr/bin/env node
/**
 * 从 HuggingFace 下载一个**公开、免登录、MIT 许可**的脸型标注数据集，用于评估分类准确率。
 *
 * 数据集: codernotme/face_shape (license: mit)
 *   https://huggingface.co/datasets/codernotme/face_shape
 *   结构: <class>/<Class>(N).jpg，5 类 —— heart / oblong / oval / round / square
 *
 * ⚠️ 三个必须记住的方法论限制（写评估报告时必须一起写出来）：
 *   1. **没有 diamond 类**。本工具会输出 diamond，因此每一个 diamond 预测都会被判错。
 *      这不是 bug，但会让准确率天然偏低 —— 报告里要单独给出 diamond 预测率。
 *   2. **标签来源未知**。数据集只有一行 license，没有标注说明。这类数据集通常是网络图片
 *      按搜索词归类，标签本身有噪声。所以测出来的是「与这份标签的一致率」，
 *      不等于「真实准确率」。
 *   3. **仅供本地评估**。图片是真实人脸，只下载到本地 .eval/（已 gitignore），
 *      不提交、不再分发。
 *
 * 用法:
 *   node scripts/fetch-eval-dataset.mjs --per-class 40 [--start 0] [--out .eval]
 */
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')
    ? args[index + 1]
    : fallback;
}

const DATASET = 'codernotme/face_shape';
const REVISION = 'main';
const CLASSES = [
  { folder: 'oval', file: 'Oval', label: 'oval' },
  { folder: 'round', file: 'Round', label: 'round' },
  { folder: 'square', file: 'Square', label: 'square' },
  { folder: 'heart', file: 'Heart', label: 'heart' },
  { folder: 'oblong', file: 'Oblong', label: 'oblong' },
];

const perClass = Number(option('per-class', '40'));
const startAt = Number(option('start', '0'));
const outDir = resolve(root, option('out', '.eval'));
const scanCap = Number(option('scan-cap', '900')); // 每个类别最多探测多少个编号

function urlFor(folder, fileName, index) {
  const path = `${folder}/${encodeURIComponent(`${fileName}(${index}).jpg`)}`;
  return `https://huggingface.co/datasets/${DATASET}/resolve/${REVISION}/${path}`;
}

async function fetchImage(url) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) return null;
  const buffer = Buffer.from(await response.arrayBuffer());
  // 太小的多半是错误页而不是图片
  if (buffer.length < 2048) return null;
  return buffer;
}

console.log(`数据集: ${DATASET}（MIT 许可，免登录）`);
console.log(`每类目标: ${perClass} 张 · 输出到 ${outDir}`);
console.log('');

const summary = [];
let totalBytes = 0;

for (const klass of CLASSES) {
  // 扁平存放：文件名已带类别前缀（oval-0000.jpg），唯一且能直接看出标签。
  // 这样能直接套用 batch-analyze.mjs 的目录约定（它只扫一层）。
  await mkdir(outDir, { recursive: true });
  const prefix = `${klass.label}-`;
  const already = (await readdir(outDir)).filter(
    (name) => name.startsWith(prefix) && name.endsWith('.jpg'),
  ).length;

  let saved = already;
  let missing = 0;
  process.stdout.write(`  ${klass.label.padEnd(8)} 已有 ${already}，继续下载 … `);

  for (let index = startAt; saved < perClass && index < scanCap; index++) {
    const buffer = await fetchImage(urlFor(klass.folder, klass.file, index));
    if (!buffer) {
      missing += 1;
      // 连续 40 个编号都缺就认为这一类已经到头了
      if (missing > 40) break;
      continue;
    }
    missing = 0;
    const name = `${klass.label}-${String(index).padStart(4, '0')}.jpg`;
    await writeFile(join(outDir, name), buffer);
    totalBytes += buffer.length;
    saved += 1;
  }

  console.log(`${saved} 张`);
  summary.push({ label: klass.label, count: saved });
}

console.log('');
console.log(`合计 ${summary.reduce((sum, item) => sum + item.count, 0)} 张，${(totalBytes / 1048576).toFixed(1)} MB`);
console.log('');

// 生成评估用的 labels.json（数据集自带标签，无需人工标注）
const labels = {};
for (const name of await readdir(outDir)) {
  if (!name.endsWith('.jpg')) continue;
  const match = CLASSES.find((klass) => name.startsWith(`${klass.label}-`));
  if (!match) continue;
  labels[name] = { shape: match.label, dataset: DATASET };
}
await writeFile(join(outDir, 'labels.json'), `${JSON.stringify(labels, null, 2)}\n`, 'utf8');
console.log(`labels.json → ${join(outDir, 'labels.json')}（${Object.keys(labels).length} 条）`);
console.log('');
console.log('⚠️ 评估时请记住：数据集没有 diamond 类；标签来源未知（疑似网络图片按搜索词归类）。');
console.log('   所以结果应表述为「与该数据集标签的一致率」，并在报告里给出 diamond 预测率。');
