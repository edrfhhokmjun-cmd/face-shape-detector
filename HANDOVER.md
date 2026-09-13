# 交接文档（HANDOVER）

> **给接手这个项目的 AI agent：先读这份，再读 `README.md`，然后按需读其它文档。**
> 人类读者也可以用它快速了解项目全貌与当前卡点。

最后更新：2026-09-13 · 项目路径：`C:\Users\ikm\Desktop\DSH Desktop\face-shape-detector`

---

## 0. 一句话

**浏览器内完成测量的脸型工具**（照片不上传、不存储），配套 6 个脸型指南、方法页、隐私页。
纯静态站，无服务端代码。**代码基本完成，正处于"即将首次上线"的状态。**

技术栈：Astro 7（静态）+ MediaPipe Face Landmarker（本地 wasm，478 landmarks）+ TypeScript。
分类是**规则驱动**（不是训练出来的模型），阈值来自 200 张真实人脸的比例分布。

---

## 1. 当前状态：上线前最后一公里

**已完成**：功能、内容、加固、评估、审查修复、git 初始化 + 4 个提交。

**只剩三步，且都需要人类操作**：

| # | 待办 | 谁做 | 说明 |
|---|---|---|---|
| 1 | 在 GitHub 建**空仓库** `face-shape-detector` | 人类 | 别勾 README/.gitignore/license |
| 2 | `git push -u origin main` | 人类 | remote 已配好；见 `DEPLOY.md` 第 1 节 |
| 3 | Cloudflare Pages 连接仓库 | 人类 | **必须设 `NODE_VERSION=22.12.0`**，否则 Astro 7 构建失败 |

自检命令（会列出所有阻断项）：`.\dev.ps1 run preflight:strict` —— **当前应为 ✅ 全通过**。

---

## 2. 必须知道的三个"当前未决"事项

### ① 量测口径冲突（**未解决，刻意不动**）

六个指南页写「`L÷W ≈ 1.4–1.6` 是鹅蛋脸、`>1.6` 是长脸」（这是**全行业通用阈值**），
但我们 200 张实测的 r1 范围只有 **1.02–1.36**（中位 1.18）——**量具从未量出 1.4 以上**。

两种可能，**目前没有证据判定哪一种**：
- (a) 本工具的「脸长」（FaceMesh 网格顶端→下巴）比通行的「发际线→下巴」偏短
- (b) 通行阈值本身是理想化的

已做的缓解：指南页加了一段说明，指出那些数字是**卷尺口径**、照片工具的数值会略低，
「两者都不算错」。**没有改任何数字。**

**决定性实验（两分钟）**：让人类拿软尺量自己的脸（发际线→下巴 L、颧骨最宽 W、额宽 F、下颌宽 J），
算 `L÷W` 与工具报的对比。若是 ≈1.5 vs 1.24 → 仪器偏差，该修；若是 ≈1.25 → 通行阈值的问题。

### ② 分类的可靠性（**已知上限，不要再优化**）

在公开数据集（`codernotme/face_shape`，MIT）200 张上：**top-1 = 30%、top-2 = 49.5%**。
5 类问题随机基线是 20%，所以只是**勉强高于随机**。

**关键：这批标签已被证明与四个比例零区分力**（逐类分布几乎完全重叠），
所以上面那个数字**不能表述为"本工具的准确率"**，也不能藏起来。
完整分析见 `EVALUATION.md`。

因此产品表述已定为：**测量值优先 + 只给"最接近的两个形状" + 不给匹配百分比**
（因为实测 `corr(confidence, 正确) = 0.094`，且平均 confidence 0.502 而实际准确率 0.300
—— 系统性过度自信 20 个百分点）。

**人类已明确决定：算法冻结，不要再花时间优化分类准确率。**
要提升只能靠**有质量的标注数据**（瓶颈是数据，不是模型），而那需要真实照片。

### ③ `round`（圆脸）几乎不触发

整改后预测分布：heart 26% · oblong 26% · square 20.5% · oval 15% · diamond 10% · **round 2.5%**，
且 round 类正确率 0/40。

**刻意停手**：继续调就是拿"圆脸应该更常见"这个**先验**去凑分布，而这批标签没有任何信号支持它。
这是个**已知限制**，不是待修的 bug。

---

## 3. 关键决策与理由（含被否掉的方案，避免重走弯路）

| 决策 | 理由 | 报告位置 |
|---|---|---|
| 照片**不上传**，全部本地算 | 隐私是产品定位；且让"不上传"成为**结构性事实**（无服务端代码可泄） | `how-it-works.astro` |
| **不做**颜值打分 | 广告联盟政策红线 + 伦理；只做"比例 × 造型建议" | `README.md` 第七节 |
| 内容**数据驱动**（`src/data/shapes.ts`） | 6 页结构一致，重复写必然漂移；加 i18n 只需再加一份数据 | `shapes.ts` 头部注释 |
| **不跟**竞品的第 7 类 triangle | 工具输出 6 类，内容就只写 6 类 —— 让内容承诺工具做不到的脸型更糟 | `README.md` 第六节 |
| 删掉两个"计划页" | `/tools/face-shape-test` 与首页同义、`/tools/oval-face-shape` 与 `/shapes/oval/` 重复 → **doorway page 是低质做法** | `src/data/tools.ts` |
| **不引入**第三方预训练模型 | 那个"85.3%"的模型：`verified:false`、标签来自图片搜索词、**343 MB**（现模型 3.6 MB）、无 license、且**没有 diamond 类**。也搜过没有更好的现成选项 | 本次对话 |
| 域名收敛为**单一来源** | 原来散在 3 处，换域名易漏改（漏了 canonical 就指向错域名） | `site.config.mjs` |
| `robots.txt` 改为**生成式** | 静态文件必须手写域名 = 第二处来源 | `src/pages/robots.txt.ts` |
| 开发页**归档**而非删除 | `debug.astro` → `debug.astro.off`（Astro 不扫 `.off`），保留可随时恢复 | `DEPLOY.md` 第 3 节 |
| **不提交** `regression/labels.json` | 它把照片文件名与脸型标注关联 = 个人信息，而仓库公开 | `.gitignore` |
| **提交** 模型文件（3.6 MB） | 让 CI 构建不依赖 Google 存储桶的可用性 | `.gitignore` |

---

## 4. 这台机器的环境事实（在别的机器上**不成立**，别照搬）

| 事实 | 影响 | 处理 |
|---|---|---|
| **没有全局 `node`/`npm`/`git`** | 命令行直接用会找不到 | 用 `ganhuo-ai` 自带运行时：`C:\Users\ikm\AppData\Local\Programs\ganhuo-ai\resources\runtime\win32-x64\{node,PortableGit}` |
| **Windows Schannel 坏了** | `curl`、.NET、**git 的 HTTPS** 全报 `SEC_E_NO_CREDENTIALS`。Node 不受影响（用自带 OpenSSL） | git 设 `http.sslBackend=openssl`（已设在本仓库 `.git/config`） |
| 默认凭据助手是 shell 脚本 | 受限环境下报 `couldn't create signal pipe` | `credential.helper` 指向原生 `git-credential-manager.exe` |
| **DSH 沙箱（workspace-write）** | ① `npm install` / `astro build` / Playwright 都因 **管道 stdio 被拦**而 `spawn EPERM`，需提升权限 ② 工作区外写入被拒 | 见下 |
| 本机是 **Windows PowerShell 5.1** | `Set-Content -Encoding utf8` **会写 BOM**（会让 `JSON.parse` 崩） | 已让 `batch-analyze.mjs` 剥离 BOM |
| **`astro dev` 跑着时不要 `npm run build`** | 会争抢 Vite 依赖缓存 → dev server 返回 `504 Outdated Optimize Dep`、客户端脚本加载失败、工具看起来像卡死 | 要构建先停 dev server。**这个坑踩过两次** |

### 在别的机器上重建环境（推荐顺序）

```powershell
# 1. 装 Node >= 22.12（Astro 7 硬要求）
# 2. 克隆
git clone https://github.com/edrfhhokmjun-cmd/face-shape-detector.git
cd face-shape-detector
# 3. 依赖（predev/prebuild 会自动同步 wasm；模型已提交，不需联网下载）
npm install
# 4. 评估用的 headless 浏览器（约 700 MB，可选；只做校准时才需要）
npx playwright install chromium
# 5. 起服务
npm run dev
```

⚠️ 换机器后 **`dev.ps1` 用不了**（它硬编码了 ganhuo-ai 的路径）——改用 `npm run xxx`。

---

## 5. 文件地图（哪些文档讲什么）

| 文件 | 讲什么 | 什么时候读 |
|---|---|---|
| **`HANDOVER.md`**（本文） | 全局状态、未决事项、环境事实 | **第一个读** |
| `README.md` | 怎么跑、文件地图、设计决定、上线清单、排错、合规红线 | 第二个读 |
| `EVALUATION.md` | 在公开数据集上的真实测量、发现的 bug、**被否掉的假设**、整改记录 | 涉及准确率/分类时必读 |
| `REVIEW.md` | 页面审查：11 条确认问题 + 7 条"查证后清白" + 修复状态 | 改动 UI/文案前读 |
| `CALIBRATION.md` | 阈值校准手册：回归集怎么建、指标怎么记、调参顺序 | 做多脸型校准时读 |
| `DEPLOY.md` | GitHub → Cloudflare Pages 完整流程 + 本机 git 的两个坑 | 上线时读 |
| `site.config.mjs` | 站点地址唯一来源（可用 `SITE_URL` 覆盖） | 换域名时读 |

---

## 6. 常用命令

```powershell
.\dev.ps1 run dev                  # 开发服务器（localhost:4321，只监听 IPv6 ::1，别用 127.0.0.1）
.\dev.ps1 run build                # 构建（prebuild 会自动跑上线自检）
.\dev.ps1 run preview -- --port 4322   # 预览构建产物（审查用这个，不是 dev server）
.\dev.ps1 run preflight:strict     # 上线自检，有阻断项则退出码 1

# 评估与校准（需要 Playwright）
.\dev.ps1 run batch -- --dir regression      # 跑标注集，输出 results.csv + 指标表
.\dev.ps1 run batch:anchors                  # 比较 16 组候选锚点的准确率
.\dev.ps1 run analyze:eval                   # 逐类比例分布（train/test 切分）
.\dev.ps1 run import:photos -- --from "<目录>" --prefix me --person me --shape diamond
.\dev.ps1 run debug:dump -- <图片>            # 把 /debug 的数据打成文本（不用截图）
```

---

## 7. 建议的下一步（按优先级）

1. **先上线**（第 1 节三步）。人类已明确表示：先拿用户反馈，再迭代。
2. 上线后观察：是否有人用、结果区是否看得懂、有没有人反馈"测错了"。
3. **隐私政策/服务条款/About/Contact 已齐**；若接广告（AdSense 等）需再过一遍隐私页的广告条款。
4. 想做多脸型校准时：按 `CALIBRATION.md` 建回归集 → 用 `batch:anchors` **让数据选锚点**。
5. 想做 i18n 时：`shapes.ts` 是数据驱动的，加一份 `<locale>.ts` 即可，模板不用动。
   （人类最初选择了英文全球市场；中文「脸型测试」+ 日韩是后续增量。）

---

## 8. 给接手 agent 的三条提醒

1. **这个项目的历史里有多次"我的诊断是错的"**：三个锚点假设里两个被数据否掉、
   菱形/心形规则方向写反、`confidence` 被证明无预测能力、scoped 样式对注入元素静默失效。
   **所以：任何结论都要先验证再陈述，尤其是"某个东西是 bug"这种判断。**
   `REVIEW.md` 第三节专门记录了 7 条"我一开始怀疑、查证后清白"的项，避免重复怀疑。

2. **不要为了提高准确率而调参**。那批公开标签已被证明零区分力，
   在那上面调区间是**拟合噪声**。人类明确要求算法冻结。

3. **本轮对话没传给你的东西**：所有推理过程都在上面这些 `.md` 里。
   如果发现某个决策缺少理由，先查 `EVALUATION.md` 和 `REVIEW.md` 的"被否掉的假设"部分，
   再考虑问人类 —— 大概率已经讨论过并被记录。
