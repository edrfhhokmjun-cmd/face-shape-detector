# Face Shape Detector — 代码骨架

浏览器内完成的面部测量与脸型分类工具。图片不上传、不落盘，全部计算在用户设备上完成。

这是**第 1、2 步的骨架**：MediaPipe 面部分析链路 + 脸型分类算法 + Astro 静态站结构 + 锚点校准页。
已实现的部分是能跑通的完整链路，但**分类阈值尚未用真实数据校准**（见 `CALIBRATION.md`）。

## 验证状态

已经实际跑过并确认的：

| 项目 | 结果 |
|---|---|
| 依赖安装 | ✅ 193 个包，`astro@7.3.2` + `@mediapipe/tasks-vision@0.10.35` |
| 资产同步 | ✅ wasm 6 个文件 + 模型 3.6 MB |
| `astro build` | ✅ 2 个页面（`/`、`/debug`），无警告 |
| TypeScript 检查 | ✅ `tsc --strict --noUnusedLocals --noUnusedParameters` 零错误 |
| MediaPipe API 签名 | ✅ 逐个对着 `vision.d.ts` 核过（`createFromOptions` / `detect(image, opts?)` / `FaceLandmarkerResult.faceLandmarks`） |
| 懒加载设计 | ✅ `vision_bundle.js` 是独立 131 KB chunk，模型路径不出现在首屏 HTML |
| 静态资产可达 | ✅ `/models/face_landmarker.task`、`/mediapipe/wasm/*` 全部 HTTP 200 |
| dev 服务器 | ✅ `http://localhost:4321/` 返回 200，工具骨架 / JSON-LD / FAQ 均在 |
| 真实浏览器推理 | ✅ 用户在 Chrome 里实测出结果（wasm / delegate / 478 点 / 测量 / 分类 / 叠加绘制全通，且无需跨源隔离） |
| **GPU→CPU 回退** | ✅ headless Chromium 里 GPU delegate 失败后自动回退，MediaPipe 打印 `XNNPACK delegate for CPU` |
| **headless 批处理** | ✅ Playwright + Chromium 装在项目内（`.playwright-browsers/`，706 MB），`--self-test` 通过 |

**还没验证的**：

1. `ANCHORS` 里的索引是否真的落在颧骨 / 下颌角 / 发际线上 —— 用 `/debug` 的偏移列确认
2. 真实人脸照片的**准确率** —— 需要 `regression/` 里有标注的照片，跑 `batch` 出指标

> 注：批处理跑在 headless Chromium 上（CPU delegate），与真实浏览器（GPU）的数值可能有极小浮点差异，
> 对阈值校准无影响。

---

## 一、跑起来

前置：**Node.js ≥ 22.12**（Astro 7 的硬要求）、npm。

```bash
cd face-shape-detector
npm install          # 装依赖（同时会触发一次资产同步）
npm run dev          # 打开 http://localhost:4321
```

### 本机的特殊情况（重要）

这台机器 **`node` 不在 PATH 上**，但已经有一个可用的运行时 —— `ganhuo-ai` 这个 Electron 应用
自带了完整的 Node：

```
C:\Users\ikm\AppData\Local\Programs\ganhuo-ai\resources\runtime\win32-x64\node\
  → node.exe  v24.15.0
  → npm.cmd   11.12.1
```

实测版本满足 Astro 要求，而且 **Node 自带 OpenSSL，不受本机 Windows Schannel 损坏的影响**
（系统里 `curl` / .NET 的 HTTPS 会报 `SEC_E_NO_CREDENTIALS`，Node 的 `fetch` 正常）。

所以直接用项目根目录的 `dev.ps1`，它会把上面的路径接进 PATH：

```powershell
.\dev.ps1 install          # 装依赖
.\dev.ps1 run dev          # 开发服务器 → http://localhost:4321
.\dev.ps1 run build        # 构建到 dist/
.\dev.ps1 run batch -- --self-test   # headless 环境自检（不需要任何照片）
.\dev.ps1 run batch                  # 批量分析 regression/ 里的照片
```

（在任何 npm 命令前加 `run` 才会执行 package.json 里的 script。）

还实测到另一件事：**在 DSH 的受限沙箱下 `astro dev` / `astro build` 会以 `spawn EPERM` 失败**，
原因是 esbuild 需要用管道 stdio 和自己的 service 子进程通信，而受限模式不允许开命名管道。
这是沙箱边界，不是项目缺陷 —— 把该命令的沙箱权限放宽（danger-full-access）即可通过。
如果你想彻底摆脱这个限制，装一个官方 Node 到系统 PATH 上、在普通终端里跑就行。

`predev` / `prebuild` 会自动执行 `scripts/sync-assets.mjs`，它做两件事：

1. 把 `node_modules/@mediapipe/tasks-vision/wasm/*` 复制到 `public/mediapipe/wasm/`
2. 下载官方 `face_landmarker.task`（float16，约 3 MB）到 `public/models/face_landmarker.task`

如果第 2 步因为网络失败，脚本只打印警告不会中断；手动下载同一个 URL 放到该路径即可：

```
https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
```

**第一件该做的事**：打开首页传一张正脸照，确认能出结果。这一步不过关，后面全是空谈。

- `/` → 工具页
- `/debug` → 锚点校准页（已 `noindex`，上线前删掉或加环境判断）

## 二、文件地图

```
scripts/sync-assets.mjs          wasm / 模型同步（永不硬失败）
public/_headers                  静态资源长缓存头（Cloudflare Pages / Netlify 通用）

src/lib/face-shape/
  types.ts         所有公共类型
  landmarks.ts     ★ ANCHORS 锚点索引表 + 候选组 + 坐标/距离/夹角工具
  image.ts         ★ 解码 + EXIF 摆正 + 降采样 → canvas（HEIC 兜底）
  pose.ts          ★ roll/yaw/pitch 姿态门禁 + 去旋转
  classify.ts      ★ 测量、三个比例、下颌角、六分类打分、置信度、告警
  detector.ts      ★ MediaPipe 惰性单例 + GPU→CPU 回退 + analyzeCanvas 主流程
  overlay.ts       canvas 叠加绘制（照片 + 特征点 + 测量线）

src/scripts/
  tool.ts          工具页 DOM 交互（拖拽 / 点击 / Ctrl+V 粘贴）
  debug.ts         校准页交互 + 悬停查点位索引 + 候选锚点灵敏度表

src/components/FaceShapeTool.astro   工具组件（静态骨架 + 客户端脚本）
src/layouts/BaseLayout.astro         SEO head / canonical / JSON-LD + 站内导航/页脚
src/pages/index.astro                工具页 + 六种脸型概览 + FAQ + 结构化数据
src/pages/how-it-works.astro         ★ 方法页：测什么、怎么测、隐私、局限（差异化内容）
src/pages/shapes/index.astro         脸型指南 hub（对照表 + 互链 + FAQ）
src/pages/shapes/[shape].astro       ★ 六个脸型页，含 HowTo / FAQPage / Breadcrumb 结构化数据
src/pages/404.astro                  404 页
src/pages/debug.astro                锚点校准页（⚠️ 上线前删掉）
src/data/shapes.ts                   ★ 六个脸型的全部内容（单一真相源，驱动 7 个页面）
src/data/tools.ts                    工具注册表（区别于内容页，见文件内注释）
src/pages/tools/[slug].astro         工具动态路由（目前无 live 工具，不生成页面）
src/styles/global.css                基础样式（深/浅色自适应）
public/robots.txt                    robots + sitemap 声明（域名待改）

CALIBRATION.md   ★ 阈值校准手册 —— 上线前必须走一遍
```

## 三、设计上刻意做的几个决定

**1. 模型只在用户选图后才加载。** `detector.ts` 里 `@mediapipe/tasks-vision` 是动态 `import()`，
首屏 HTML 不含任何模型相关字节。3 MB 的模型如果进首屏，LCP 直接废掉。

**2. 用 `<img>` 解码而不是 `createImageBitmap`。** 现代浏览器对 `<img>` 一律自动套用 EXIF 方向，
而 `createImageBitmap` 的 `imageOrientation` 支持度参差、默认可能是 `none`。手机照片方向错了，
landmarks 全错，而且**失败是静默的** —— 这种 bug 最难查。

**3. 坐标必须先还原成像素。** MediaPipe 的 x/y 分别按图宽、图高归一化，
直接拿归一化坐标算距离，图宽高比 ≠ 1 时所有比例都是错的。

**4. 姿态用 landmark 几何做代理，不解析变换矩阵。** roll 用眼外角连线（真正的欧拉角，无歧义）；
yaw/pitch 用鼻尖偏移和上下脸比例做代理量。刻意避开 `facialTransformationMatrixes` 的旋转约定 ——
门禁只需要「够不够正」，而且代理量可以肉眼验证。需要真欧拉角时在 `detector.ts` 里把
`outputFacialTransformationMatrixes` 打开，在 `/debug` 打印出来自行推导。

**5. 姿态不达标仍然出结果，但同时给告警。** 直接拒绝出结果体验更差；
但告警必须显眼，因为歪头照片的比例是垃圾。

**6. 永远显示 runner-up。** 脸型是连续谱，边界情况给出次优解既是诚实，也是免责。

**7. 置信度叫「匹配度」，不叫概率。** 它是「拟合度 + 区分度」的启发式映射，不是概率。
文案上写成「87% 的概率你是椭圆脸」既不准，也容易越界成类型化断言。

## 四、上线步骤

> **完整的 GitHub → Cloudflare Pages 流程见 [`DEPLOY.md`](./DEPLOY.md)**
> （含必须设置的两个环境变量，其中 `NODE_VERSION` 不设会直接构建失败）。

**先跑自检** —— 它会把所有占位符/缺失项列出来，不用靠记忆：

```powershell
.\dev.ps1 run preflight:strict     # 有阻断项就退出码 1
```

构建时（`prebuild`）会自动跑一次非严格版，所以每次 `npm run build` 都会看到当前状态。

### 1. 改域名（三处，必须一起改）

- [ ] `astro.config.mjs` 的 `site`
- [ ] `public/robots.txt` 的 `Sitemap:` 行
- [ ] 重新构建，确认 `dist/sitemap-0.xml` 里是新域名

⚠️ **域名没填之前不要上线**：`canonical` / `og:url` 已自动停止输出（宁可没有，也不能发一个
指向别人域名的规范声明），但 **sitemap 必须有 `site` 才能生成**，所以它里面仍会是
`https://example.com` —— 那等于告诉搜索引擎去抓一个不存在的域名。

### 2. 填联系邮箱

- [ ] `src/pages/privacy.astro`、`about.astro`、`contact.astro` 里的 `CONTACT_EMAIL`
      （三处应一致；隐私页留占位符比没有隐私页更糟）

### 3. 开发页已经归档

`src/pages/debug.astro` → **`src/pages/debug.astro.off`**。Astro 只扫描已知扩展名，
所以 `.off` 不会进构建，但文件保留着。

- 想临时启用锚点校准页：改回 `debug.astro` 再 `npm run dev`
- 别改回 `.astro` 就去构建上线（自检会提醒你）

### 4. 部署

Cloudflare Pages：构建命令 `npm run build`，输出目录 `dist`。
建议把 `public/models/face_landmarker.task`（约 3.6 MB）提交进仓库，
让构建不依赖外网下载 —— 否则 CI 里下载失败会直接让部署挂掉。

### 5. 部署后核对

- [ ] 打开首页，确认 `view-source` 里 canonical 是新域名
- [ ] `你的域名/sitemap-index.xml` 能打开且 URL 正确
- [ ] `你的域名/robots.txt` 的 Sitemap 行正确
- [ ] 传一张照片能出结果（首屏不应加载 131 KB 的 vision bundle，选图后才加载）
- [ ] 确认 `你的域名/debug/` 返回 404

**验证清单**：

- [ ] **第一张正脸照能出结果**（GPU 路径）；再在无 WebGL2 的浏览器验证 CPU 回退
- [ ] **iPhone 竖拍照片方向正确**（EXIF 那条路径，最容易静默出错）
- [ ] **HEIC 上传**给出的是友好提示而不是白屏
- [ ] 侧脸 / 低头 / 头发盖额头 三种情况都能被告警拦住（不是给错结果）
- [ ] 同一张照片重复分析结果完全一致（确定性）
- [ ] 同一人不同照片之间脸型结论稳定（稳定性，见 CALIBRATION.md）
- [ ] `ANCHORS` 已按 `/debug` 的灵敏度表校准过
- [ ] `classify.ts` 的 `band()` 区间已按回归集校准，一致率有记录
- [ ] Network 面板确认：模型加载完成后，分析照片**零网络请求**
- [ ] 断网后仍可用（模型已缓存）
- [ ] Cloudflare Pages 上 `/mediapipe/*` 与 `/models/*` 命中长缓存
- [ ] 上线前删除或屏蔽 `/debug`

## 五、排错

| 现象 | 处理 |
|---|---|
| 一直停在「正在加载本地模型」 | 检查 `public/models/face_landmarker.task` 是否存在且 > 1 MB；看 Network 是否 404 |
| dev 下 wasm 加载报错 / 依赖预打包异常 | 取消 `astro.config.mjs` 里 `optimizeDeps.exclude` 的注释 |
| `SharedArrayBuffer is not defined` / 线程相关报错 | 取消 `astro.config.mjs` 里 `server.headers`（COOP/COEP）的注释。**注意 COEP: require-corp 会阻断没带 CORP 头的第三方资源（广告、外链图都会挂）**，上线前必须在真实页面回归 |
| 结果明显不对但没告警 | 先去 `/debug` 看锚点是不是落错了位置，再怀疑阈值 |
| 手机上传报解码失败 | 大概率是 HEIC。iOS Safari 能解，Chrome on Android 不能 —— 文案已覆盖 |
| 首次分析要等好几秒 | 正常（3 MB 模型）。靠 `_headers` 长缓存 + Service Worker 缓存解决，见下 |

## 六、还没做的（按优先级）

**已完成**：内容矩阵（6 个脸型页 + hub + 方法页）、上线加固（sitemap / robots / 404 /
站内导航与互链）。

1. **隐私政策 / 服务条款页** —— 上线前必需。你要打"不上传"这张牌，就必须有一页明确写清
   不存储、不外传、不训练；否则这个声明只是营销话术。
2. **多脸型标注集 + 阈值校准** —— 见 `CALIBRATION.md`。目标不是把准确率刷高，而是产出
   一个**可公开的诚实数字**（这是全行业都没有的东西，写进方法页就是差异化资产）。
3. **Service Worker / PWA** —— 模型缓存后离线可用，顺便成为"本地处理"的可验证证据。
4. **手动量尺计算器** —— 真工具（用户自己输入 L/W/F/J 四个毫米数），对不愿上传照片的用户有用。
   见 `src/data/tools.ts` 里的注释（什么算"工具"、什么算"内容"）。
5. **第 7 类 triangle** —— 如果要做，**工具规则和内容页必须同时加**。现在工具输出 6 类、
   内容也只写 6 类，这是刻意的：内容承诺了工具做不到的脸型，是更糟的体验。
6. **i18n** —— 中文「脸型测试」+ 日韩。`shapes.ts` 是数据驱动的，加一份 `<locale>.ts` 即可，
   模板不用动。
7. **变现** —— 见下。

## 七、合规红线（别越线）

1. **不要做颜值打分 / 1–10 评分 / "am I ugly"**。广告联盟政策、应用商店审核、舆论风险都是雷。
   脸型 × 造型建议是安全区，越界到「评判长相」就不是了。
2. **不生成、不存储任何面部特征向量或生物模板**。本地处理天然规避了 BIPA / GDPR / EU AI Act
   的绝大部分风险，但前提是你真的不存。
3. **隐私承诺必须自我一致**。既然宣称「永不上传」，就不要引入任何可能触碰图像数据的第三方脚本 ——
   连 analytics 都要审一遍。被抓到一次打脸，这类产品就完了。
4. **文案定位为造型参考**，加免责声明，明确写出头发遮挡 / 角度 / 镜头畸变的局限
   （`index.astro` 里已有模板）。

## 八、部署

纯静态，`npm run build` → `dist/`。Cloudflare Pages 设定：构建命令 `npm run build`，输出目录 `dist`。
静态资源上限单文件 25 MiB、每版本 2 万个文件 —— 3 MB 模型 + 十几个 wasm 文件毫无压力。

**建议把 `public/models/face_landmarker.task` 提交进 git**（约 3 MB），让构建不依赖 Google 的存储桶 ——
CI 里外网下载失败会直接让部署挂掉。相应地把它从 `.gitignore` 里去掉。
