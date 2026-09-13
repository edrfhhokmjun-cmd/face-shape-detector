/**
 * 工具注册表。
 *
 * 架构上要分清两类页面，别混在一起：
 *
 *   · **工具**（本文件）—— 有交互逻辑的页面。每条驱动 /tools/<slug>/ 路由。
 *   · **内容**（`src/data/shapes.ts`）—— 脸型指南等内容页，驱动 /shapes/<slug>/。
 *
 * 为什么之前放在这里的几条"计划项"被删掉了：
 *   原来我打算做 `/tools/face-shape-test` 和 `/tools/oval-face-shape`。前者和首页几乎同义，
 *   后者和 `/shapes/oval/` 重复 —— 这类页面在 SEO 上叫 doorway page（近似重复的入口页），
 *   是明确会被判低质的做法。**宁可一页写透，不要三页互相稀释。**
 *
 * 加新工具 = 加一条数据 + 一个组件，不需要动路由代码。
 */

export type ToolStatus = 'live' | 'planned';

export interface ToolEntry {
  slug: string;
  /** 最终路径；'/' 表示首页 */
  route: string;
  title: string;
  h1: string;
  description: string;
  keywords: string[];
  status: ToolStatus;
  /** 相关工具的 slug，用来生成内链 */
  related?: string[];
}

export const tools: ToolEntry[] = [
  {
    slug: 'face-shape-detector',
    route: '/',
    title: 'Face Shape Detector — Find Your Face Shape in Your Browser',
    h1: 'Face Shape Detector',
    description:
      'Measure your face proportions from a photo and see what they mean for hair and glasses. Runs entirely in your browser — your photo is never uploaded.',
    keywords: [
      'face shape detector',
      'face shape test',
      'what is my face shape',
      'face shape analyzer',
    ],
    status: 'live',
  },

  // ── 未来可以做的"真工具"（不是内容页）────────────────────────────────
  // 判断标准：它有没有独立的交互逻辑？只有答案不同、交互相同的，是内容页不是工具。
  //
  // 例：
  //   · 手动量尺计算器：用户自己输入 L/W/F/J 四个毫米数 → 输出脸型并给出误差范围。
  //     这是**真工具**（和上传照片是不同的输入路径），而且对不愿上传照片的用户很有用。
  //   · 眼镜框宽度计算器：输入脸宽（可用信用卡做参照物）→ 推荐镜框尺寸。
];

/** 需要单独生成页面的工具（首页之外的 live 项） */
export const routedTools = tools.filter(
  (tool) => tool.status === 'live' && tool.route.startsWith('/tools/'),
);

export function findTool(slug: string): ToolEntry | undefined {
  return tools.find((tool) => tool.slug === slug);
}

export function relatedTools(currentSlug: string): ToolEntry[] {
  const current = findTool(currentSlug);
  if (!current?.related) return [];
  return current.related
    .map((slug) => findTool(slug))
    .filter((tool): tool is ToolEntry => Boolean(tool));
}
