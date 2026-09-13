/**
 * 线上站点验证 —— 直接打真实地址，逐项断言。
 *
 * 用法: node scripts/verify-live.mjs [base]
 * 默认验证 site.config.mjs 里的 SITE_URL（即生产地址）。
 *
 * 为什么需要它：`public/_headers` 这类静态配置文件在本地 preview 里**不生效**，
 * 只能在真实托管上验证。这个脚本就是那条验证路径，换域名/改配置后跑一遍即可。
 *
 * 不需要浏览器 —— 用 Node 自带的 fetch（本机 Windows Schannel 有故障，但 Node 用自己的
 * OpenSSL，所以不受影响）。
 */
import { SITE_URL } from '../site.config.mjs';

const base = (process.argv[2] ?? SITE_URL).replace(/\/$/, '');
const EXPECTED_MODEL_BYTES = 3758596;

const results = [];
const record = (name, ok, detail = '') => results.push({ name, ok, detail });
const get = (path) => fetch(`${base}${path}`, { redirect: 'follow', cache: 'no-store' });

// ── 1. 页面路由 ────────────────────────────────────────────────────────────
const ROUTES = [
  '/',
  '/shapes/',
  '/shapes/oval/',
  '/shapes/round/',
  '/shapes/square/',
  '/shapes/heart/',
  '/shapes/oblong/',
  '/shapes/diamond/',
  '/how-it-works/',
  '/about/',
  '/contact/',
  '/privacy/',
];
for (const route of ROUTES) {
  try {
    const res = await get(route);
    const body = await res.text();
    record(`GET ${route}`, res.ok, `HTTP ${res.status}, ${body.length} 字节`);
  } catch (err) {
    record(`GET ${route}`, false, err.message);
  }
}

// ── 2. 开发页不得在线 ──────────────────────────────────────────────────────
{
  const res = await get('/debug/');
  record('/debug/ 应为 404', res.status === 404, `HTTP ${res.status}`);
}

// ── 3. canonical / og / 无中文 ────────────────────────────────────────────
{
  const html = await (await get('/')).text();
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? '(无)';
  const ogImage = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1] ?? '(无)';
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1] ?? '(无)';
  record('canonical 正确', canonical === `${base}/`, canonical);
  record('og:image 正确', ogImage.startsWith(base), ogImage);
  record('title 存在', title.length > 10, title);
  record('首页无中文残留', !/[\u4e00-\u9fff]/.test(html), /[\u4e00-\u9fff]/.test(html) ? '发现中文' : '零中文');
  record('首屏不引用模型文件', !html.includes('face_landmarker.task'));
}

// ── 4. 面向 agent / 爬虫的声明 ────────────────────────────────────────────
{
  const res = await get('/');
  const link = res.headers.get('link');
  record('有 RFC 8288 Link 响应头', Boolean(link), link ?? '(无)');
  if (link) {
    record('Link 含 service-doc', link.includes('rel="service-doc"'));
    record('Link 含 privacy-policy', link.includes('rel="privacy-policy"'));
    // 我们**没有** API，所以不该声明这些 —— 声明了才是问题
    record(
      'Link 未谎称有 API',
      !/api-catalog|service-desc/.test(link),
      /api-catalog|service-desc/.test(link) ? '声明了不存在的 API' : '未声明',
    );
  }
}
{
  const res = await get('/robots.txt');
  const text = await res.text();
  record('robots.txt 200', res.ok, `HTTP ${res.status}`);
  record('robots.txt 的 Sitemap 行正确', text.includes(`Sitemap: ${base}/sitemap-index.xml`), text.match(/Sitemap: .+/)?.[0] ?? '(无)');
  record('robots.txt 禁止 /debug', text.includes('Disallow: /debug'));
  record('robots.txt 含 Content-Signal', /Content-Signal: ai-train=/.test(text), text.match(/Content-Signal: .+/)?.[0] ?? '(无)');
}
{
  const index = await (await get('/sitemap-index.xml')).text();
  const child = index.match(/<loc>([^<]+)<\/loc>/)?.[1] ?? '';
  record('sitemap 子文件指向正确', child.startsWith(base), child);

  const map = await (await get('/sitemap-0.xml')).text();
  const urls = [...map.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  record('sitemap 含 12 条 URL', urls.length === 12, `${urls.length} 条`);
  record('sitemap 不含 /debug', !urls.some((u) => u.includes('/debug')));
}

// ── 5. 静态资源与缓存头（验证 public/_headers 真的被托管方应用）────────────
for (const asset of ['/favicon.svg', '/og.png']) {
  const res = await get(asset);
  record(`${asset} 200`, res.ok, `HTTP ${res.status}, ${res.headers.get('content-type')}`);
}
{
  const res = await get('/models/face_landmarker.task');
  const buf = await res.arrayBuffer();
  const cache = res.headers.get('cache-control') ?? '(无)';
  record('模型字节数正确', buf.byteLength === EXPECTED_MODEL_BYTES, `${buf.byteLength} / ${EXPECTED_MODEL_BYTES}`);
  record('模型有 immutable 缓存头', /immutable/.test(cache), cache);
}
{
  const res = await get('/mediapipe/wasm/vision_wasm_internal.wasm');
  const cache = res.headers.get('cache-control') ?? '(无)';
  record('wasm 200', res.ok, `HTTP ${res.status}`);
  record('wasm 有 immutable 缓存头', /immutable/.test(cache), cache);
}

// ── 输出 ───────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok);
console.log('');
console.log(`验证地址: ${base}`);
console.log('─'.repeat(76));
for (const r of results) console.log(`  ${r.ok ? '✅' : '❌'} ${r.name.padEnd(32)} ${r.detail}`);
console.log('─'.repeat(76));
console.log(`  ${results.length - failed.length} / ${results.length} 通过`);
process.exit(failed.length === 0 ? 0 : 1);
