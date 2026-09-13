/**
 * 站点地址的**唯一来源** —— astro.config.mjs 与 scripts/preflight.mjs 共用这一份。
 *
 * 为什么要有这个文件：以前域名散落在三处（astro.config 的 site、public/robots.txt 的
 * Sitemap 行、部署平台的环境变量），换域名要改三遍，漏一处就出线上问题
 * （canonical 指向错误域名会让搜索引擎认错站点）。
 *
 * 现在只有这一处，而且**可以用环境变量覆盖**：
 *   - 本地开发：用下面的默认值
 *   - Cloudflare Pages：在 Settings → Environment variables 里设 `SITE_URL`，
 *     以后换成真域名时只改那一个变量，**不需要改代码、不需要重新提交**。
 *
 * 注意：sitemap 和 canonical 都依赖这个值，所以它必须是**对外可访问的正式地址**，
 * 不要填带 hash 的预览部署地址。
 */
export const SITE_URL = process.env.SITE_URL ?? 'https://face-shape-detector.pages.dev';

/** 还是占位域名吗？是的话 canonical / og:url 会自动停止输出（见 BaseLayout.astro） */
export const IS_PLACEHOLDER = SITE_URL.includes('example.com');
