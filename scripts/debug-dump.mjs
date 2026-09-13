#!/usr/bin/env node
/**
 * 把 /debug 页面的全部数据以**纯文本**打印出来。
 *
 * 存在的理由：截图看不清、网页打印成 PDF 又常常把文字转成曲线导致抽不出内容。
 * 这个脚本用 headless 浏览器真的打开页面、真的分析一张图，然后把
 * 灵敏度表 / 换锚点对比表 / 完整 JSON 原样打印到终端。
 *
 * 用法:
 *   node scripts/debug-dump.mjs <图片路径> [--url http://localhost:4321/]
 *
 * 前提：站点正在运行（npm run dev）。
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(root, '.playwright-browsers');

const args = process.argv.slice(2);
const image = args.find((arg) => !arg.startsWith('--'));
if (!image) {
  console.error('用法: node scripts/debug-dump.mjs <图片路径> [--url http://localhost:4321/]');
  process.exit(1);
}
const urlIndex = args.indexOf('--url');
const base = urlIndex >= 0 && args[urlIndex + 1] ? args[urlIndex + 1] : 'http://localhost:4321/';

async function resolveBase(candidate) {
  const variants = [candidate];
  if (candidate.includes('localhost')) {
    variants.push(candidate.replace('localhost', '127.0.0.1'));
    variants.push(candidate.replace('localhost', '[::1]'));
  }
  for (const variant of variants) {
    try {
      const response = await fetch(variant, { method: 'HEAD' });
      if (response.ok) return variant;
    } catch {
      /* 换下一个候选 */
    }
  }
  return null;
}

const baseUrl = await resolveBase(base);
if (!baseUrl) {
  console.error(`[dump] 打不开 ${base} —— 先启动站点：.\\dev.ps1 run dev`);
  process.exit(1);
}

const { chromium } = await import('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (err) => console.error('[page error]', err.message));

await page.goto(new URL('/debug', baseUrl).href, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-file-input]', { state: 'attached' });
await page.setInputFiles('[data-file-input]', resolve(image));

// 等分析结束：要么 JSON 出来了，要么状态变成失败
await page.waitForFunction(
  () => {
    const json = document.querySelector('[data-json]')?.textContent ?? '';
    const status = document.querySelector('[data-status]')?.textContent ?? '';
    return json.includes('比例') || status.includes('未检测到人脸') || status.includes('失败');
  },
  null,
  { timeout: 180000 },
);

const dump = await page.evaluate(() => {
  const tableText = (selector) => {
    const table = document.querySelector(`${selector} table`);
    if (!table) return '(无表格)';
    return [...table.querySelectorAll('tr')]
      .map((row) =>
        [...row.querySelectorAll('th,td')]
          .map((cell) => cell.textContent.trim().replace(/\s+/g, ' '))
          .join(' | '),
      )
      .join('\n');
  };
  return {
    status: document.querySelector('[data-status]')?.textContent?.trim() ?? '',
    sensitivity: tableText('[data-table]'),
    variants: tableText('[data-variants]'),
    json: (document.querySelector('[data-json]')?.textContent ?? '').replace(/\n{2,}/g, '\n'),
  };
});

await browser.close();

console.log(`图片: ${resolve(image)}`);
console.log(`状态: ${dump.status}`);
console.log('');
console.log('=== 候选锚点灵敏度 ===');
console.log(dump.sensitivity);
console.log('');
console.log('=== 换锚点后的分类结果 ===');
console.log(dump.variants);
console.log('');
console.log('=== 完整测量结果 ===');
console.log(dump.json);
