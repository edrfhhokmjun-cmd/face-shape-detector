# 部署流程：GitHub → Cloudflare Pages

目标：代码在 GitHub 做版本管理，Cloudflare Pages 连接该仓库，**以后 push 就自动重新部署**。

本地仓库已经初始化好并完成了首次提交（分支 `main`，作者 `edrfhhokmjun-cmd <edrfhhokmjun@gmail.com>`）。
下面第 1 步需要你自己来 —— 我没有你的 GitHub 凭据，也不会去要。

---

## 1. 在 GitHub 建仓库并推送

先在浏览器里建一个**空仓库**（不要勾选 README / .gitignore / license，避免首次推送冲突）：

- 仓库名建议：`face-shape-detector`
- 可见性：public 或 private 都行（Cloudflare Pages 两种都支持）

然后在本地执行（把 `<你的用户名>` 换成你的 GitHub 用户名）：

```powershell
cd "C:\Users\ikm\Desktop\DSH Desktop\face-shape-detector"

# 本机没有全局 git，用 ganhuo-ai 自带的那份
$git = "C:\Users\ikm\AppData\Local\Programs\ganhuo-ai\resources\runtime\win32-x64\PortableGit\cmd\git.exe"

# 关联远程并推送
& $git remote add origin https://github.com/<你的用户名>/face-shape-detector.git
& $git push -u origin main
```

推送时会要求登录。推荐用 **Personal Access Token** 当密码（GitHub 已不支持账号密码）：
GitHub → Settings → Developer settings → Personal access tokens → Fine-grained token，
权限只需 `Contents: Read and write`（Cloudflare 那边也建议用只读 token，两者分开）。

**推送前可以自查一遍**（确认没把照片或依赖传上去）：

```powershell
& $git ls-tree -r --name-only HEAD | Select-String '\.jpg$|node_modules|labels\.json$'
# 应当没有任何输出
& $git ls-tree -r --name-only HEAD | Measure-Object | Select-Object -ExpandProperty Count
# 应当是 50
```

---

## 2. Cloudflare Pages 连接仓库

Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**

| 设置项 | 值 |
|---|---|
| 仓库 | 选你刚推的 `face-shape-detector` |
| 生产分支 | `main` |
| 框架预设 | Astro（或 None，都行） |
| **构建命令** | `npm run build` |
| **输出目录** | `dist` |

### ⚠️ 两个必须设的环境变量

在 **Settings → Environment variables**（Production 和 Preview 都要加）：

| 变量 | 值 | 为什么必须 |
|---|---|---|
| `NODE_VERSION` | `22.12.0` | **Astro 7 要求 Node ≥ 22.12**。Cloudflare 默认版本可能更低，版本不够会直接构建失败。这是最容易踩的坑。 |
| `SITE_URL` | `https://<你的项目名>.pages.dev` | 决定 canonical / sitemap / og:url。**不设也能跑**（`site.config.mjs` 里有同名默认值），但显式设上更清楚。 |

> 项目名如果不是 `face-shape-detector`，`SITE_URL` 就必须设 —— 否则 canonical 会指向一个不存在的地址。

### 关于构建时下载

构建会执行 `prebuild` → `sync-assets.mjs`：
- wasm：从 `node_modules` 复制（`npm ci` 装好就有了）
- 模型 `face_landmarker.task`：**已经提交进仓库**，所以不会再联网下载 ——
  这是刻意的，CI 里那次外网下载失败会直接让部署挂掉

---

## 3. 部署后核对

- [ ] 打开 `https://<项目名>.pages.dev`，页面正常
- [ ] `view-source` 里 `<link rel="canonical">` 是 `https://<项目名>.pages.dev/`
- [ ] `/sitemap-index.xml` 打开，里面域名正确
- [ ] `/robots.txt` 打开，`Sitemap:` 行域名正确（这个文件现在是**生成**的，不会和配置不一致）
- [ ] 传一张照片能出结果；首屏不应加载 131 KB 的 vision bundle（选图后才加载）
- [ ] `/<项目名>.pages.dev/debug/` 返回 **404**（开发页已归档，不进构建）

---

## 4. 以后怎么改

```
改代码 → git push → Cloudflare 自动重新构建并部署
```

每个 PR 或非生产分支的推送会得到一个**预览部署**（形如 `https://<hash>.<项目名>.pages.dev`），
可以在合并前先看效果。

---

## 5. 以后换成真域名

**只改一个地方**：Cloudflare Pages → Settings → Environment variables → 把 `SITE_URL`
改成新域名（如 `https://faceshape.example`），然后在 Custom domains 里绑定该域名。

不需要改任何代码、不需要重新提交 —— canonical / sitemap / og:url 会自动跟着变。

---

## 6. 回滚

Cloudflare Pages → Deployments → 选一个历史部署 → **Rollback**。
静态站回滚是瞬时的，不需要重新构建。

---

## 附：本地想跑一遍生产构建时

```powershell
cd "C:\Users\ikm\Desktop\DSH Desktop\face-shape-detector"
.\dev.ps1 run build                      # 会自动跑自检
.\dev.ps1 run preview -- --port 4322     # 预览构建产物（不是 dev server）
```

⚠️ **不要在 `npm run dev` 正在跑的时候执行 `npm run build`** ——
两者会争抢 Vite 的依赖优化缓存，导致 dev server 开始返回
`504 (Outdated Optimize Dep)`，客户端脚本加载失败、工具看起来像卡死。
（这个坑在本项目里踩过两次。）要构建就先停掉 dev server。
