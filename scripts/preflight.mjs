#!/usr/bin/env node
/**
 * 上线前自检 —— 把「必须由人来填/删」的东西变成**每次构建都会喊出来**的检查，
 * 而不是散落在 README 里的待办事项（那种东西一定会被忘掉）。
 *
 * 用法:
 *   node scripts/preflight.mjs            只警告（挂在 prebuild 上，日常构建不打断）
 *   node scripts/preflight.mjs --strict   有阻断项时以退出码 1 失败（上线前跑这个）
 */
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IS_PLACEHOLDER, SITE_URL } from '../site.config.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const strict = process.argv.includes('--strict');

const blockers = [];
const notes = [];

async function readIfExists(path) {
  return existsSync(path) ? readFile(path, 'utf8') : null;
}

/** 递归收集 src/ 下的文本文件 */
async function collectSourceFiles(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await collectSourceFiles(full, out);
    else if (/\.(astro|ts|mjs|js|txt|json)$/.test(entry.name)) out.push(full);
  }
  return out;
}

// ── 1. 站点地址（唯一来源：site.config.mjs，可用 SITE_URL 覆盖）────────────
if (IS_PLACEHOLDER) {
  blockers.push(
    `站点地址仍是占位域名：${SITE_URL}\n` +
      '      → canonical / og:url 已自动**停止输出**（宁可没有，也不能发一个指向别人域名的声明），\n' +
      '        但 sitemap 必须有 site，所以它里面仍会是这个域名 —— 不要在这种情况下上线。\n' +
      '        改法：设置环境变量 SITE_URL，或改 site.config.mjs 的默认值。',
  );
} else {
  notes.push(`站点地址: ${SITE_URL}（canonical / sitemap / og:url 都用它）`);
  if (SITE_URL.includes('pages.dev')) {
    notes.push('用的是 Cloudflare Pages 二级域名 —— 以后换真域名只需改 SITE_URL 这一个变量');
  }
}

// ── 2. 联系邮箱：三处必须一致且不是占位符 ─────────────────────────────────
const EMAIL_PAGES = ['src/pages/privacy.astro', 'src/pages/about.astro', 'src/pages/contact.astro'];
const emails = new Map();
for (const page of EMAIL_PAGES) {
  const text = await readIfExists(join(root, page));
  if (text === null) {
    blockers.push(`缺少 ${page}`);
    continue;
  }
  const match = text.match(/CONTACT_EMAIL\s*=\s*'([^']+)'/);
  if (!match) {
    blockers.push(`${page} 里找不到 CONTACT_EMAIL`);
    continue;
  }
  emails.set(page, match[1]);
  if (/TODO|example\.com/i.test(match[1])) {
    blockers.push(`${page} 的 CONTACT_EMAIL 仍是占位符：${match[1]}`);
  }
}
const uniqueEmails = new Set(emails.values());
if (uniqueEmails.size > 1) {
  blockers.push(
    `三处 CONTACT_EMAIL 不一致：\n      - ${[...emails.entries()].map(([p, e]) => `${p} → ${e}`).join('\n      - ')}`,
  );
}

// ── 3. 开发页必须处于归档状态 ─────────────────────────────────────────────
if (existsSync(join(root, 'src/pages/debug.astro'))) {
  blockers.push(
    'src/pages/debug.astro 处于**启用**状态，会被构建进产物。\n' +
      '      → 归档方式：改名为 debug.astro.off（Astro 不扫这个扩展名）',
  );
}

// ── 4. 必备资源 ───────────────────────────────────────────────────────────
for (const asset of [
  'public/favicon.svg',
  'public/og.png',
  'src/pages/robots.txt.ts',
  'public/_headers',
]) {
  if (!existsSync(join(root, asset))) blockers.push(`缺少 ${asset}`);
}
if (!existsSync(join(root, 'public/models/face_landmarker.task'))) {
  notes.push('public/models/face_landmarker.task 还没同步（跑 npm run sync:assets）');
}

// ── 5. 不该进仓库的东西 ───────────────────────────────────────────────────
const gitignore = await readIfExists(join(root, '.gitignore'));
for (const pattern of ['regression', '.eval', '.playwright-browsers', '.npm-cache', '.tools']) {
  if (gitignore && !gitignore.includes(pattern)) {
    blockers.push(`.gitignore 里没有忽略 ${pattern} —— 校准照片/评估图片有被提交的风险`);
  }
}

// ── 输出 ───────────────────────────────────────────────────────────────────
console.log('');
if (blockers.length === 0) {
  console.log('✅ 上线前自检通过：没有发现占位符或缺失项。');
} else {
  console.log(`⚠️  上线前自检发现 ${blockers.length} 项需要处理：`);
  blockers.forEach((item, index) => console.log(`\n  ${index + 1}. ${item}`));
}
if (notes.length > 0) {
  console.log('');
  notes.forEach((note) => console.log(`  · ${note}`));
}
console.log('');

if (strict && blockers.length > 0) {
  console.error('--strict 模式下存在阻断项，退出码 1。');
  process.exit(1);
}
