# 页面审查记录

审查对象：`astro preview` 的构建产物（14 页），审查人：我。日期：2026-09-13
方法：读产物 HTML 原始字节、程序化检查链接/元数据/外部资源、逐页读文案并与**当前分类器行为**对照。

**结论原则**：下面「确认的问题」每条都有可复现的证据；「验证后不是问题」是我一开始怀疑、
查完发现清白的 —— 一并列出，避免以后重复怀疑。

---

## 一、确认的问题

### 🔴 1. canonical / og:url 全部指向占位域名 `example.com`

**证据**：产物 HTML 里实测到 `https://example.com/`、`/about/`、`/shapes/heart/` 等绝对 URL。
来源是 `astro.config.mjs` 的 `site: 'https://example.com'`（占位符）。

**这不只是"待办"**：`<link rel="canonical">` 是给搜索引擎的规范地址声明。
带着 `example.com` 上线，等于**每一页都告诉搜索引擎"我的正式版本在别人域名上"** ——
可能导致页面不被收录。og:url 同理，社交分享会指向错误地址。

**修法**：改 3 处（`astro.config.mjs` 的 `site`、`public/robots.txt` 的 `Sitemap:` 行），
然后重新构建并核对产物。

### 🔴 2. 内容页的数字阈值与我们的量具不一致（需要决策）

**证据**：六个脸型指南告诉读者「L÷W ≈ 1.4–1.6 是鹅蛋脸」「> 1.6 是长脸」，
但 200 张实测的 r1 范围是 **1.02–1.36**（中位 1.18）—— **我们的量具从未量出 1.4 以上**。

这些 1.0 / 1.5 / 1.6 的阈值是**全行业通用**的（竞品页面也在用），所以有两种可能，
而**我目前没有证据判定是哪一种**：

- (a) 我们的「脸长」（FaceMesh 网格顶端 → 下巴）比通行的「发际线 → 下巴」偏短，导致 r1 被压缩
- (b) 通行阈值本身就是理想化/不精确的（不同资料的「额宽」定义都不一样，见下）

我在评估数据集上验证过发际线一致性比值（0.803 vs 本人正常拍摄 0.823）是正常的，
**但这只能证明网格顶端位置稳定，不能证明它就是真发际线**。

**这条不是靠改代码能解决的**，需要：要么改指南（与全行业惯例冲突），要么在指南里明确写出
本工具的量测口径。我倾向后者。**请勿在没想清楚前改数字。**

### 🟠 3. 「三个比例」写错，实际是四个

**证据**：工具计算并显示 **4** 个比例（r1 长/颧宽、r2 额/颌宽、r3 颧/颌宽、r4 额/颧宽），
但三处文案写「three ratios」：

| 文件 | 位置 |
|---|---|
| `src/pages/index.astro` | FAQ 答案「compute three ratios (…)」 |
| `src/pages/index.astro` | 正文「Three ratios are computed from those numbers」 |
| `src/pages/how-it-works.astro` | meta description「four width measurements, three ratios」 |

### 🟠 4. 圆脸指南的 description 写「three measurements」，尺子法实际要四个

**证据**：`src/data/shapes.ts` 圆脸条目 description 写 "verify it with three measurements"，
但该页的 ruler 步骤要求量 **L、W、F、J 四个**。

### 🟠 5. About 页与方法页自相矛盾

**证据**：
- `about.astro`：「**This one does not either, yet.**」（我们还没发布准确率数字）
- `how-it-works.astro`：已经如实写出「**30% (top-1) / 50% (top-2)**」

**修法**：把 About 那段改成与方法页一致（并保留"类别是约定"的态度）。

### 🟠 6. 拖拽区键盘不可用（WCAG 2.1.1 失败）

**证据**：`FaceShapeTool.astro` 里写了 `role="button" tabindex="0"`，
但 `src/scripts/tool.ts` 中拖拽区只绑定了 `click` / drag / drop，
**没有任何 `keydown` 处理**。

后果：键盘用户 Tab 到拖拽区、看到焦点、按 Enter 或空格 —— **什么都不会发生**，
无法打开文件选择框。（鼠标用户完全正常，所以肉眼测试发现不了。）

**修法**：加 `keydown` 监听，Enter / Space 时触发 `fileInput.click()`。

### 🟠 7. 状态与结果没有 `aria-live`，读屏用户听不到任何变化

**证据**：全站搜索 `aria-live` / `aria-busy` → **0 处匹配**。
`[data-status]` 从「Waiting for a photo」变成「Loading the landmark model…」再到「Done」，
结果区从 `hidden` 变成可见 —— 这些对读屏用户**静默发生**。

**修法**：给 `[data-status]` 加 `role="status"`，给结果区加 `aria-live="polite"`。

### 🟡 8. 缺 og:image 与 favicon

**证据**：产物 HTML 里既没有 `og:image`，也没有 `rel="icon"`，`dist/` 下没有 favicon 文件。
后果：社交分享无缩略图（点击率明显偏低）；浏览器标签页显示默认空白图标。

### 🟡 9. 没有 `<noscript>` 兜底

**证据**：全站无 `<noscript>`。工具完全依赖 JS，禁用 JS 时拖拽区是个死区域，且没有任何说明。

### 🟡 10. 部分 title / description 偏长

| 页面 | title 长度 | description 长度 |
|---|---|---|
| `/how-it-works/` | 63 | **189** |
| `/shapes/` | 63 | **175** |
| `/shapes/heart/` | 63 | 135 |
| `/` | 58 | **164** |

（SERP 截断大致在 title ~60 字符、description ~160 字符。）

### 🔴 11. `CONTACT_EMAIL` 仍是占位符

**证据**：`privacy.astro`、`about.astro`、`contact.astro` 三处都是 `TODO-CHANGE-ME@example.com`。
隐私页留占位符比没有隐私页更糟。

---

## 二、B 改动后新发现的问题（已修）

### 🔴 12. Astro scoped 样式对 `innerHTML` 注入的元素静默失效

**症状**（截图才发现）：测量区渲染成
`Face length ÷ cheekbone widthyour face is about 18% longer than it is wide`
—— 标签和读法**连成一句、没有间隔**，读法也没变成灰色小字。

**原因**：`dt` / `dd` / `span` 是 `tool.ts` 用 `innerHTML` **动态注入**的，
而 Astro 的 scoped 样式只在**构建期**为已存在的元素加 `data-astro-cid-*` 属性 ——
注入的元素拿不到它，于是 `.ratios dt { display:flex; gap:0 8px }` 和
`.ratios dt span { color: var(--muted) }` **整条规则静默失效**（不报错、不警告）。

**为什么之前没发现**：只读源码和 HTML 都看不出来；程序化检查 innerText 时
它表现为"没有空格"，很容易当成 dump 的格式假象。**只有截图才看得出来。**

**修法**：给注入子元素的选择器加 `:global()`：
`.ratios :global(dt) { … }`、`.ratios :global(dt) :global(span) { … }`、`.ratios :global(dd) { … }`。

**同类风险检查**：`ul.warnings li` 没事（定义在 `global.css`，本来就全局）；
`.guide-links` 的 `<a>` 也正常（父元素是构建期的，flex gap 生效）。
**以后凡是用 `innerHTML` 往组件里插元素，样式必须走 `:global()` 或写进 `global.css`。**

### 修复后实测（截图确认）

```
Your measurements
Face length ÷ cheekbone width   your face is about 18% longer than it is wide   1.179
Forehead ÷ jaw width            forehead about 1% narrower than jaw             0.992
Cheekbone ÷ jaw width           cheekbones about 28% wider than jaw             1.279
Forehead ÷ cheekbone width      forehead about 29% narrower than cheekbones     0.776
Widest point: the cheekbones, about 28% wider than the next widest (jaw).

Closest match
Heart
Next closest: Oval
[ Read the heart guide ]  [ Read the oval guide ]
```

`[data-confidence]` 元素已移除 —— 结果区不再出现任何「匹配百分比」。

---

## 三、验证后确认「不是问题」的（避免以后重复怀疑）


| 一开始怀疑 | 查证结果 |
|---|---|
| `鈥?` 是不是真乱码 | ❌ 不是。文件名 title 里是正确的 **U+2014** 破折号，乱码只是 PowerShell 控制台的显示编码 |
| 站内链接有没有死链 | ✅ 240 个链接全部可达 |
| 隐私页「无第三方脚本/字体/CDN」是否属实 | ✅ 属实。**没有任何外部 `src`**；产物里的绝对 URL 全是 canonical / og:url（即问题 1），不是资源请求 |
| 懒加载是否真的生效 | ✅ 首屏 JS 约 **15 KB**（tool 4.2 KB + overlay 10.7 KB）；131 KB 的 `vision_bundle` 是独立 chunk，用户选图后才加载 |
| `/debug` 会不会污染索引 | ✅ 三处一致排除：页面 `noindex` + robots `Disallow` + sitemap `filter` |
| 自定义 404 是否生效 | ✅ 不存在的路径返回 HTTP 404 且渲染自定义页 |
| 中文有没有残留 | ✅ 12 个正式页面正文零中文字符（只剩开发页 `/debug`，上线前删） |

---

## 四、修复状态（按顺序执行完毕）

| 顺序 | 项目 | 状态 | 做法 |
|---|---|---|---|
| 1 | 占位域名 / canonical | ✅ **已机制化** | 见下方说明 |
| 2 | 联系邮箱占位符 | ✅ **已机制化** | 同上 |
| 3 | 「三个比例」→ 四个 | ✅ 已修 | `index.astro` ×2、`how-it-works.astro` meta |
| 4 | 圆脸 description「three measurements」 | ✅ 已修 | 改为 four |
| 5 | About 页与方法页矛盾 | ✅ 已修 | About 现在如实写出 30% / 50% |
| 6 | 拖拽区键盘不可用 | ✅ 已修 | `tool.ts` 加 `keydown`（Enter / 空格）；并补 `:focus-visible` 样式 |
| 7 | 无 `aria-live` | ✅ 已修 | 状态区 `role="status"`；结果区 `aria-live="polite"` |
| 8 | 无 favicon / og:image | ✅ 已修 | `public/favicon.svg`（菱形＋颧宽线）＋ `public/og.png`（1200×630，脚本生成） |
| 9 | 无 `<noscript>` 兜底 | ✅ 已修 | 说明为什么禁用 JS 就没法用，并把用户引到尺子自测 |
| 10 | 元数据偏长 | ✅ 已修 | 现在 title 全部 ≤58、description 全部 ≤158 |
| 11 | **问题 2：量测口径** | ⏸ **待决策** | 未动 —— 需要先定立场，不能靠改数字解决 |
| 12 | Astro scoped 样式对注入元素失效（第二轮发现） | ✅ 已修 | 见第二节 |
| — | **B：两个最接近 + 去百分比 + 双链指南** | ✅ 已实施 | 截图确认；`[data-confidence]` 已移除 |

### 关于第 1、2 条：没有停在「TODO」，而是做成了机制

留一个 `TODO` 占位符等于赌自己不会忘。所以改成两层防护：

**第一层 —— 消除危害本身。**
`BaseLayout.astro` 现在检查 `site` 是否仍是占位域名：
- 是占位 → **完全不输出 `canonical` 和 `og:url`**。宁可没有 canonical，也不要有一个指向别人域名的错误声明。
- 是真实域名 → 正常输出，并同时输出 `og:image` / twitter card。

**第二层 —— 每次构建都会喊出来。**
新增 `scripts/preflight.mjs`，已挂到 `prebuild`。它检查 5 类上线阻断项：
占位域名（配置 + robots）、占位邮箱、`debug.astro` 是否还在、静态资源是否齐全、
`.gitignore` 有没有漏掉校准照片/评估图片目录。

```powershell
.\dev.ps1 run preflight            # 只警告（日常构建自动跑）
.\dev.ps1 run preflight:strict     # 有阻断项则退出码 1（上线前跑）
```

当前自检输出（4 项待你处理）：

```
⚠️  上线前自检发现 4 项需要处理：
  1. astro.config.mjs 的 site 仍是占位域名 example.com
  2. public/robots.txt 里的 Sitemap 行仍是 example.com
  3. 联系邮箱仍是占位符 TODO-CHANGE-ME@example.com（about / contact / privacy）
  4. src/pages/debug.astro 仍在源码里
```

⚠️ **注意**：sitemap 无法通过"不输出"来规避 —— 它必须有 `site` 才能生成。
所以域名没填之前，`dist/sitemap-0.xml` 里仍会是 `example.com`。**不要在这种情况下上线。**

### 修复后的整体验证

| 检查 | 结果 |
|---|---|
| 路由 | 16 个（含 favicon / og.png / robots / sitemap）全部 HTTP 200 |
| 站内链接 | **270 个全部可达** |
| 产物无 `example.com` | ✅ 首页与各页均已无（sitemap 除外，见上） |
| 工具页冒烟 | ✅ a11y 与渲染改动后功能正常 |
| `tsc --strict` | ✅ 0 错误 |
| 元数据长度 | ✅ title ≤58 · description ≤158 |

