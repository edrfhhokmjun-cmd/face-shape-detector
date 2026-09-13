/**
 * 测「用户真正感知的那段时间」—— 从选完照片到出结果。
 *
 * 为什么需要它：Lighthouse / PageSpeed Insights 只测首屏加载，而本站首屏只有约 15 KB JS，
 * 那些工具会给很高的分。**但真正的等待发生在用户选完照片之后** —— 要下载 wasm 运行时和模型
 * （实测约 7 MB），这一段由用户交互触发，任何标准测速工具都看不到。
 *
 * 用真实浏览器跑三次，并用 Resource Timing API 拆出每个资源的实际传输量：
 *   ① 冷启动：新 context（空缓存）→ 首次分析
 *   ② 同页再算：模型已在内存 → 纯推理耗时
 *   ③ 回访者：重新加载页面（HTTP 缓存已热）→ 验证 immutable 缓存头对回访者是否有效
 *
 * 用法: node scripts/measure-analysis.mjs <图片路径> [url]
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(root, '.playwright-browsers');

const image = process.argv[2] ? resolve(process.argv[2]) : resolve(root, '.smoke/face.png');
const url = process.argv[3] ?? 'https://face-shape-detector-enf.pages.dev/';

const { chromium } = await import('playwright');
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

async function analyzeOnce(page, imagePath) {
  await page.evaluate(() => {
    delete window.__faceShapeLast;
    performance.clearResourceTimings();
  });
  const started = Date.now();
  await page.setInputFiles('[data-file-input]', imagePath);
  await page.waitForFunction(() => Boolean(window.__faceShapeLast), null, { timeout: 180000 });
  const elapsed = Date.now() - started;

  const resources = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((e) => ({
        name: new URL(e.name).pathname,
        transferSize: e.transferSize,
        decodedBodySize: e.decodedBodySize,
        duration: Math.round(e.duration),
      }))
      .filter((r) => r.decodedBodySize > 20 * 1024 || r.transferSize > 20 * 1024)
      .sort((a, b) => b.decodedBodySize - a.decodedBodySize),
  );

  return { elapsed, resources };
}

function report(label, { elapsed, resources }) {
  const transferred = resources.reduce((sum, r) => sum + r.transferSize, 0);
  console.log(`\n${'-'.repeat(76)}\n${label}\n${'-'.repeat(76)}`);
  console.log(`  到出结果耗时: ${elapsed} ms      本次实际下载: ${kb(transferred)}`);
  if (resources.length === 0) {
    console.log('  （没有 >20KB 的资源 —— 全部命中缓存）');
    return;
  }
  console.log('  资源明细（transferSize=0 表示来自缓存，没走网络）:');
  for (const r of resources) {
    const transfer = r.transferSize === 0 ? '缓存命中' : kb(r.transferSize);
    console.log(
      `    ${r.name.slice(-46).padEnd(46)} 传输 ${transfer.padEnd(10)} 解压后 ${kb(r.decodedBodySize).padEnd(9)} ${r.duration} ms`,
    );
  }
}

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
page.on('pageerror', (e) => console.log('  [page error]', e.message));

console.log(`测量地址: ${url}`);
console.log(`测试图片: ${image}`);

console.log('\n① 冷启动（全新浏览器上下文，空缓存）');
await page.goto(url, { waitUntil: 'domcontentloaded' });
report('① 首次分析（冷缓存）', await analyzeOnce(page, image));

console.log('\n② 同一页面再算一次（模型已在内存）');
report('② 第二次分析（内存已热）', await analyzeOnce(page, image));

console.log('\n③ 重新加载页面（HTTP 缓存已热，验证 immutable 缓存头）');
await page.goto(url, { waitUntil: 'domcontentloaded' });
report('③ 回访者｜重新加载后的第一次分析', await analyzeOnce(page, image));

await browser.close();
console.log(`\n${'='.repeat(76)}`);
console.log('读法：①与③的差别 = 缓存策略对回访者有没有用；② = 用户连续分析多张照片时的体验。');
