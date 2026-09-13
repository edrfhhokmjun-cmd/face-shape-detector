#!/usr/bin/env node
/**
 * 把照片导入 regression/ 并生成/合并标注骨架。
 *
 * 用法:
 *   node scripts/import-photos.mjs --from "C:\某目录" [--prefix me] [--person me] [--dry]
 *
 * 做三件事：
 *   1. 扫描源目录里的图片，复制到 regression/（可用 --prefix 加序号前缀）
 *   2. HEIC/HEIF 会**单独列出来并跳过** —— 浏览器解不了，必须先转成 JPG
 *   3. 生成/合并 regression/labels.json 骨架（shape 留空等你填，person 预置好）
 *
 * 注意：labels.json 用 Node 写，不带 BOM（PowerShell 的 Set-Content -Encoding utf8 会带 BOM，
 * 记事本另存为也会 —— 那会让 JSON.parse 崩，虽然 harness 已经能容忍，但别制造脏数据）。
 */
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')
    ? args[index + 1]
    : fallback;
}

const from = option('from');
const prefix = option('prefix', '');
const person = option('person', '');
// 已经知道真值的情况（比如「我自己这 5 张都是菱形」）可以直接预填，省掉手工编辑
const shape = option('shape', '');
const dryRun = args.includes('--dry');
const targetDir = resolve(root, option('to', 'regression'));

if (!from) {
  console.error(
    '用法: node scripts/import-photos.mjs --from "<源目录>" [--prefix me] [--person me] [--shape diamond] [--dry]',
  );
  process.exit(1);
}

const VALID_SHAPES = ['oval', 'round', 'square', 'heart', 'oblong', 'diamond'];
if (shape && !VALID_SHAPES.includes(shape)) {
  console.error(`[import] --shape 只能是：${VALID_SHAPES.join(' / ')}`);
  process.exit(1);
}

const sourceDir = resolve(from);
if (!existsSync(sourceDir)) {
  console.error(`[import] 源目录不存在：${sourceDir}`);
  process.exit(1);
}

const RASTER = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp']);
const NEEDS_CONVERT = new Set(['.heic', '.heif']);
const IGNORE = new Set(['labels.json', 'results.json', 'results.csv', 'results-anchors.json']);

const all = (await readdir(sourceDir)).filter((name) => !IGNORE.has(name));
const usable = all.filter((name) => RASTER.has(extname(name).toLowerCase()));
const heic = all.filter((name) => NEEDS_CONVERT.has(extname(name).toLowerCase()));

if (usable.length === 0 && heic.length === 0) {
  console.error(`[import] ${sourceDir} 里没有图片`);
  process.exit(1);
}

console.log(`源目录: ${sourceDir}`);
console.log(`可导入: ${usable.length} 张${prefix ? `（将加前缀 "${prefix}-"）` : ''}`);

if (heic.length > 0) {
  console.log('');
  console.log(`⚠️  跳过 ${heic.length} 张 HEIC/HEIF（浏览器解不了，必须先转成 JPG）：`);
  for (const name of heic.slice(0, 10)) console.log(`   · ${name}`);
  if (heic.length > 10) console.log(`   · …还有 ${heic.length - 10} 张`);
  console.log('   转法：Windows 照片应用「另存为 JPG」，或 iPhone 设置 → 相机 → 格式 → 兼容性最佳 后重拍');
}

if (usable.length === 0) process.exit(0);

if (dryRun) {
  console.log('');
  console.log('[import] --dry 模式，不做任何修改。将要复制的文件：');
  for (const name of usable) console.log(`   ${name} → ${prefix ? `${prefix}-${name}` : name}`);
  process.exit(0);
}

await mkdir(targetDir, { recursive: true });

const imported = [];
for (const name of usable) {
  const targetName = prefix ? `${prefix}-${name}` : name;
  const targetPath = join(targetDir, targetName);
  if (existsSync(targetPath)) {
    const same =
      (await stat(join(sourceDir, name))).size === (await stat(targetPath)).size;
    if (same) {
      console.log(`   已存在，跳过：${targetName}`);
      imported.push(targetName);
      continue;
    }
  }
  await copyFile(join(sourceDir, name), targetPath);
  console.log(`   已复制：${targetName}`);
  imported.push(targetName);
}

// ── 合并 labels.json ────────────────────────────────────────────────────────
const labelsPath = join(targetDir, 'labels.json');
let labels = {};
if (existsSync(labelsPath)) {
  const text = (await readFile(labelsPath, 'utf8')).replace(/^\uFEFF/, '');
  try {
    labels = JSON.parse(text);
  } catch (err) {
    console.error(`[import] 现有 labels.json 不是合法 JSON，中止以免覆盖你的标注：${err.message}`);
    process.exit(1);
  }
}

let added = 0;
for (const name of imported) {
  if (!labels[name]) {
    labels[name] = { shape, ...(person ? { person } : {}) };
    added += 1;
  }
}

// 按文件名排序，方便对照
const sorted = Object.fromEntries(Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(labelsPath, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');

console.log('');
console.log(`labels.json：新增 ${added} 条，共 ${Object.keys(sorted).length} 条 → ${labelsPath}`);
console.log('');
if (shape) {
  console.log(`已预填 shape = "${shape}"${person ? `，person = "${person}"` : ''}`);
  console.log('请核对是否有需要标成 "borderline": true 的（拿不准的边界样本）');
} else {
  console.log('下一步：把每条的 shape 填上（六选一），拿不准的加 "borderline": true');
  console.log('  oval / round / square / heart / oblong / diamond');
}
console.log('');
console.log('然后跑：');
console.log('  .\\dev.ps1 run batch                  # 看每个比例的波动 + 稳定性报告');
console.log('  .\\dev.ps1 run batch:anchors          # 比较各锚点组的准确率');
