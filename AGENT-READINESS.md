# Agent-Ready 评估记录

针对 Cloudflare 的 **Is Your Site Agent-Readiness** 扫描（`isitagentready.com`）逐条判断的记录。

首次扫描：2026-09-13，得分 **20 / 100（LEVEL 1: Basic Web Presence）**，12 条待办。

**这份文档存在的意义**：防止以后有人为了把分数刷高，往站里塞**不存在的**发现端点。
下面每条都记了判断和理由，尤其是"为什么不做"。

---

## 一句话结论

**这个扫描器衡量的是「你的站有多容易被 AI agent 当成 API 调用」，而本项目的核心设计是相反的**：
纯静态、无服务端代码、无 API、无账号。

12 条里有 **8 条要求"暴露机器可调用的接口/认证元数据"**，而我们**没有这些东西**。
为迎合扫描器而发布假的发现端点，对 agent 而言**比没有更糟** —— 它会去请求、然后失败。

**Astro 方案的两个结构性优势正是这 8 条不适用的原因：**

1. **无服务端代码 → "照片不上传"是事实，不是承诺**（隐私页敢那么写的底气）
2. **零后端成本 + 静态站的性能/SEO 基础**

**该做的两条都是纯静态的响应头/文本文件，没有引入任何服务端代码。**

---

## 逐条判断

| # | 项目 | 判断 | 理由 |
|---|---|---|---|
| 1 | Link 响应头（RFC 8288） | ✅ **已做** | 纯静态 `_headers`，零代价。只声明**能兑现**的关系：`service-doc`（方法页）、`privacy-policy`、`help`（contact）。**不声明** `api-catalog` / `service-desc` / `status`，因为没有 API |
| 4 | robots.txt 的 Content Signals | ✅ **已做** | `Content-Signal: ai-train=no, search=yes, ai-input=yes`。**这是策略决定**，见下 |
| 3 | Markdown for Agents | ❌ **不做（两个门槛，其中一个是付费）** | Cloudflare 的 **zone 级**功能，官方要求：① **你自己拥有的 zone**（域名接进 Cloudflare）—— `*.pages.dev` 是 Cloudflare 自己的域名，无法配置；② **Pro / Business / Enterprise 套餐**（Free 计划没有此功能）。官方 "Availability and Pricing" 原文：*available to Pro, Business and Enterprise plans*。**为这一个勾选付 域名 + Pro 月费 不划算**；自己用 Pages Function 实现则要引入服务端代码、摧毁"无服务端代码"这个结构优势，而且做得比官方差（缺 `x-markdown-tokens` / frontmatter 抽取 / JSON-LD 保留）。**换真域名 + 升 Pro 之后再回来考虑。** |
| 2 | DNS-AID + DNSSEC | ❌ **被域名卡住** | 需要添加 `_index._agents.<域名>` 之类的 SVCB/HTTPS 记录并签 DNSSEC。**无法给 `pages.dev` 添加 DNS 记录**。换真域名后才谈 |
| 5 | API catalog（RFC 9727） | ❌ **不适用** | 本站**没有 API**。发布空的/假的 catalog = 造假 |
| 6 | OAuth / OIDC discovery | ❌ **不适用** | 没有受保护 API、没有认证。发布假的 issuer/token_endpoint 会误导 agent |
| 7 | OAuth Protected Resource | ❌ **不适用** | 同上 |
| 8 | auth.md | ❌ **不适用** | 没有账号系统、没有注册流程 |
| 9 | MCP Server Card | ❌ **不适用** | 没有 MCP server |
| 10 | Agent Skills index | ❌ **不适用** | 没有对外提供的"技能" |
| 12 | ARD manifest（`/.well-known/ai-catalog.json`） | ❌ **不适用** | 它是用来登记 MCP / A2A / OpenAPI 的目录 —— 我们三者都没有 |
| 11 | WebMCP（`navigator.modelContext.provideContext()`） | 🔶 **技术上可做，建议缓** | 会让浏览器里的 agent 能调用本站工具。两件事没想清楚：① 隐私叙事需要重新表述（agent 可触发分析）② 规范仍在实验期（Chrome origin trial）。**不是技术障碍，是产品决定** |

---

## Content Signals 的取值是一个策略决定

`src/pages/robots.txt.ts` 里的 `CONTENT_SIGNAL` 常量是唯一来源。当前值：

```
Content-Signal: ai-train=no, search=yes, ai-input=yes
```

| 指令 | 当前值 | 含义与理由 |
|---|---|---|
| `ai-train` | **no** | 不用于训练模型。训练**不带来回流量**，且"不给 AI 喂训练数据"符合本站的隐私定位 |
| `search` | **yes** | 允许搜索引擎。**不可谈判** —— 设 `no` 会从 Google/Bing 消失 |
| `ai-input` | **yes** | 允许 AI 在回答时把内容当输入（RAG/grounding）。**这一条决定 AI 助手能不能引用你的页面**。设 `no` 等于把站点锁在 AI 答案之外，与增长策略相反。**只有你明确想要那个效果时才改成 `no`** |

> 注：Cloudflare 的 Markdown for Agents 默认发 `ai-train=yes`。我们显式设 `no` 是有意的。

---

## 复查方式

1. 重新扫描：`https://isitagentready.com/`，输入 `https://face-shape-detector-enf.pages.dev/`
2. 本地验证产物：`npm run build` 后检查 `dist/robots.txt` 与 `dist/_headers`
3. **线上验证响应头与全部断言**（35 项）：

```powershell
npm run verify:live
```

`scripts/verify-live.mjs` 会断言 Link 头确实发出、Content-Signal 在位、
**且没有谎称存在 API**（`Link 未谎称有 API` 这一条是刻意加的，
防止以后有人为了刷分把 `api-catalog` 加进去）。

**预期分数仍然不高** —— 这是刻意的。分数低的原因写在上面的表里，不是待修项。

---

## 换真域名后可以补的

| 项目 | 怎么做 | 成本 |
|---|---|---|
| DNS-AID + DNSSEC | 在 Cloudflare DNS 里加 SVCB/HTTPS 记录 + 开启 DNSSEC | 域名费用（Free 计划即可） |
| Markdown for Agents | 面板 → **AI Crawl Control** → 开启（可限定子域/路径） | 域名费用 **+ Pro 套餐月费**（Free 计划无此功能，官方：仅 Pro/Business/Enterprise） |

⚠️ **注意最后一项需要付费套餐** —— 这一条曾经在本文件里被写成"换真域名后开关一下即可"，
漏了套餐要求。**记录在此，避免以后有人以为只差一个域名。**

两项都做完后再重扫，分数会上升，且**没有一条是造假的**。
但请先问一句：为了扫描器上的几个勾选，是否值得域名 + Pro 的月费？
