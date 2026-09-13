import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { SITE_URL } from './site.config.mjs';

// 纯静态站：不上传任何图片，不需要 adapter、不需要 SSR。
export default defineConfig({
  // 域名只有这一处来源（site.config.mjs），且可用 SITE_URL 环境变量覆盖。
  // 换域名时不需要改这个文件 —— 见 site.config.mjs 的注释。
  site: SITE_URL,
  output: 'static',
  prefetch: { prefetchAll: true, defaultStrategy: 'viewport' },
  integrations: [
    sitemap({
      // /debug 是锚点校准用的开发工具：页面带 noindex、robots.txt 里 Disallow，
      // sitemap 也不能收它 —— 三处必须一致，否则是给搜索引擎发矛盾信号。
      filter: (page) => !page.includes('/debug'),
    }),
  ],

  vite: {
    // ── 只在遇到问题时才取消注释 ──────────────────────────────────
    //
    // 1) dev 模式下 MediaPipe 的 wasm 加载异常 / 依赖预打包报错：
    // optimizeDeps: { exclude: ['@mediapipe/tasks-vision'] },
    //
    // 2) 浏览器报 "SharedArrayBuffer is not defined" 或 MediaPipe 线程相关错误
    //    （需要跨源隔离）。注意：COEP: require-corp 会阻断未带 CORP 头的第三方资源
    //    （广告、外链图片都会挂），上线前务必在真实页面上回归。
    // server: {
    //   headers: {
    //     'Cross-Origin-Opener-Policy': 'same-origin',
    //     'Cross-Origin-Embedder-Policy': 'require-corp',
    //   },
    // },
  },
});
