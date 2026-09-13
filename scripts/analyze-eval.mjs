#!/usr/bin/env node
/**
 * 分析评估结果，按类别给出四个比例的分布 —— 用来**用数据定分类区间**，
 * 而不是靠我拍脑袋写 band()。
 *
 * 用法: node scripts/analyze-eval.mjs [results.csv]
 *
 * 重要：默认按文件名里的序号做 train/test 切分（前一半调参、后一半检验），
 * 避免在同一批数据上调参又报准确率（那是过拟合）。
 */
import { readFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const csvPath = process.argv[2] ? resolve(process.argv[2]) : join(root, '.eval', 'results.csv');

const text = (await readFile(csvPath, 'utf8')).replace(/^\uFEFF/, '');
const lines = text.trim().split(/\r?\n/);
const header = lines[0].split(',');
const rows = lines.slice(1).map((line) => {
  const cells = line.split(',');
  const row = {};
  header.forEach((name, index) => {
    row[name] = cells[index];
  });
  return row;
});

const RATIOS = ['lengthToWidth', 'foreheadToJaw', 'cheekToJaw', 'foreheadToCheek'];
const LABELS = {
  lengthToWidth: 'r1 长/颧宽',
  foreheadToJaw: 'r2 额/颌宽',
  cheekToJaw: 'r3 颧/颌宽',
  foreheadToCheek: 'r4 额/颧宽',
};

function quantile(sorted, q) {
  if (sorted.length === 0) return Number.NaN;
  const position = (sorted.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;
  const next = sorted[base + 1];
  return next === undefined ? sorted[base] : sorted[base] + rest * (next - sorted[base]);
}

/** 文件名形如 oval-0007.jpg → 取序号决定 train/test */
function splitOf(file) {
  const match = file.match(/-(\d+)\./);
  if (!match) return 'all';
  return Number(match[1]) < 20 ? 'tune' : 'test';
}

const usable = rows.filter((row) => !row.error && row.shape);
console.log(`文件: ${csvPath}`);
console.log(`可用样本: ${usable.length}（tune ${usable.filter((r) => splitOf(r.file) === 'tune').length} · test ${usable.filter((r) => splitOf(r.file) === 'test').length}）`);

for (const split of ['tune', 'test']) {
  const subset = usable.filter((row) => splitOf(row.file) === split);
  if (subset.length === 0) continue;

  console.log('');
  console.log(`═══ ${split.toUpperCase()} 集（${subset.length} 张）═══`);

  const classes = [...new Set(subset.map((row) => row.expected))].sort();
  for (const ratio of RATIOS) {
    console.log('');
    console.log(`  ${LABELS[ratio]}`);
    console.log('    类别       n     min     p10     p25   median     p75     p90     max');
    for (const klass of classes) {
      const values = subset
        .filter((row) => row.expected === klass)
        .map((row) => Number(row[ratio]))
        .filter((value) => Number.isFinite(value))
        .sort((a, b) => a - b);
      if (values.length === 0) continue;
      const fmt = (value) => value.toFixed(3).padStart(7);
      console.log(
        `    ${klass.padEnd(8)} ${String(values.length).padStart(3)}` +
          `${fmt(values[0])}${fmt(quantile(values, 0.1))}${fmt(quantile(values, 0.25))}` +
          `${fmt(quantile(values, 0.5))}${fmt(quantile(values, 0.75))}${fmt(quantile(values, 0.9))}` +
          `${fmt(values[values.length - 1])}`,
      );
    }
  }
}

// 预测分布：看模型是不是把某几类通吃了
console.log('');
console.log('═══ 预测分布（全部样本）═══');
const predicted = {};
for (const row of usable) predicted[row.shape] = (predicted[row.shape] ?? 0) + 1;
for (const [shape, count] of Object.entries(predicted).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${shape.padEnd(9)} ${String(count).padStart(4)}  ${((count / usable.length) * 100).toFixed(1)}%`);
}
