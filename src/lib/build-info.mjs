/**
 * 构建身份 —— 让线上站点能自报「我是从哪个提交构建的」。
 *
 * 为什么需要：Cloudflare Pages 的构建**可能静默失败** —— 推送成功、构建挂掉，
 * 而线上继续服务旧版本，没有任何报错。这时如果改的是个 bug 修复，
 * 它会看起来像「已经修好了」。有了这个标记，verify:live 就能立刻区分
 * 「部署没发生」和「代码有问题」。
 *
 * SHA 的来源优先级：
 *   1. `CF_PAGES_COMMIT_SHA` —— Cloudflare 构建时注入，生产环境走这条
 *   2. 直接读 `.git`（HEAD → 符号引用 → packed-refs）—— 本地构建走这条
 *   3. 'unknown'
 *
 * ⚠️ 刻意**不 spawn `git` 子进程**：读文件即可，且不受受限环境（管道 stdio 被拦）影响。
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 找仓库根目录。
 *
 * ⚠️ 必须**先试 process.cwd()**：Astro/Vite 在构建时会把本模块内联进自己的产物，
 * 那时 `import.meta.url` 已经不再指向 `src/lib/`，据此算出的 `.git` 路径是错的
 * （踩过：本地构建出来的标记是 `unknown`，而直接 `node` 跑同一个模块却正常）。
 * 构建时的 cwd 就是仓库根，稳。
 *
 * `import.meta.url` 那条留给「未被打包」的场景（例如 scripts/verify-live.mjs 直接 import）。
 */
const candidates = [
  process.cwd(),
  resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'),
];
const repoRoot = candidates.find((dir) => existsSync(resolve(dir, '.git', 'HEAD'))) ?? process.cwd();
const gitDir = resolve(repoRoot, '.git');

function readLooseOrPacked(ref) {
  try {
    return readFileSync(resolve(gitDir, ref), 'utf8').trim() || null;
  } catch {
    /* 松散引用不存在，试 packed-refs */
  }
  try {
    for (const line of readFileSync(resolve(gitDir, 'packed-refs'), 'utf8').split('\n')) {
      if (!line.trim() || line.startsWith('#')) continue;
      const [sha, name] = line.trim().split(' ');
      if (name === ref) return sha;
    }
  } catch {
    /* 没有 packed-refs */
  }
  return null;
}

/** 解析任意引用（含 HEAD 这种符号引用）为完整 SHA；拿不到返回 null */
export function resolveRef(ref = 'HEAD') {
  const direct = readLooseOrPacked(ref);
  if (direct && !direct.startsWith('ref:')) return direct;
  const target = direct?.startsWith('ref:') ? direct.slice(5).trim() : null;
  if (target) return readLooseOrPacked(target);
  return null;
}

const short = (sha) => (sha ? sha.slice(0, 7) : null);

/** 本次构建对应的提交（7 位）。生产环境由 Cloudflare 注入。 */
export const COMMIT_SHA = short(process.env.CF_PAGES_COMMIT_SHA ?? resolveRef('HEAD')) ?? 'unknown';

/** 已知的构建环境，写进 HTML 便于排错 */
export const BUILD_ENV = process.env.CF_PAGES
  ? `cloudflare-pages${process.env.CF_PAGES_BRANCH ? ` (${process.env.CF_PAGES_BRANCH})` : ''}`
  : 'local';

/** 本地仓库状态 —— 只给 verify:live 用，不写进 HTML */
export const LOCAL_HEAD = short(resolveRef('HEAD'));
export const LOCAL_ORIGIN_MAIN = short(resolveRef('refs/remotes/origin/main'));
