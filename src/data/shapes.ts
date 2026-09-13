/**
 * 脸型内容矩阵 —— 单一真相源。
 *
 * 6 个脸型页 + hub 页全部由这份数据驱动：
 *   /shapes/            hub（对照表 + 互链）
 *   /shapes/<slug>/     各脸型页（含 FAQPage / HowTo 结构化数据）
 *
 * 为什么用数据驱动而不是写 6 个 .astro：
 *   ① 六页结构完全一致，重复写 6 遍必然漂移
 *   ② 以后加 i18n 只需再加一份 <locale>.ts，模板不动
 *   ③ 加字段（比如"名人示例"）只改一处
 *
 * ⚠️ 内容原则：
 *   · 只写"比例与造型"，绝不写颜值评判（广告联盟红线，也是伦理问题）
 *   · 每条建议都从几何出发给出理由，不堆"必须/绝对"式断言
 *   · 与工具的措辞保持一致（工具输出六个形状，这里就写六个，不写 triangle）
 */

export interface ShapeGuide {
  slug: string;
  name: string;
  /** SEO title */
  title: string;
  /** meta description */
  description: string;
  h1: string;
  /** 一句话定义 */
  summary: string;
  /** 判别比例（给读者看的数学规则） */
  rule: string;
  /** 怎么认出来 */
  signs: string[];
  /** 尺子自测步骤 */
  ruler: string[];
  hair: { works: string[]; avoid: string[] };
  glasses: { works: string[]; avoid: string[] };
  /** 额外一节：胡须 / 妆容 / 摄影，按脸型取舍 */
  extra: { label: string; points: string[] };
  /** 最容易和谁混淆、怎么分 */
  confusedWith: { shape: string; slug: string; how: string }[];
  faq: { q: string; a: string }[];
}

export const shapes: ShapeGuide[] = [
  {
    slug: 'oval',
    name: 'Oval',
    title: 'Oval Face Shape — How to Tell, and What Suits It',
    description:
      'What defines an oval face shape, how to check it yourself with a ruler, and which hairstyles and glasses frames work with balanced proportions.',
    h1: 'Oval face shape',
    summary:
      'The balanced reference shape: slightly longer than wide, cheekbones the widest point, and a jawline that curves rather than angles.',
    rule: 'Face length ≈ 1.5 × cheekbone width · cheekbones are the widest point · forehead slightly wider than a gently tapered jaw.',
    signs: [
      'Length is about one and a half times the width — clearly longer than round, shorter than oblong.',
      'Cheekbones are the widest part, but only slightly wider than the forehead.',
      'The jawline curves smoothly; there is no hard corner at the jaw angle.',
      'No single feature dominates the silhouette.',
    ],
    ruler: [
      'Measure L: hairline to the bottom of your chin.',
      'Measure W: across your cheekbones at their widest point.',
      'Measure F and J: forehead width at the widest point, and jaw width about an inch above the chin.',
      'Oval if L ÷ W is roughly 1.4–1.6, W is the largest of the three widths, and F is slightly larger than J.',
    ],
    hair: {
      works: [
        'Almost anything — this is the shape stylists use as the reference when adapting cuts for other shapes.',
        'Long layers, blunt bobs and curtain bangs all sit comfortably.',
        'Pulling it back off the face works, because nothing needs rebalancing.',
      ],
      avoid: [
        'A heavy full fringe that hides the forehead — it removes the balance that defines the shape.',
        'Very tall styles that push the length-to-width ratio towards oblong.',
      ],
    },
    glasses: {
      works: [
        'Any frame shape flatters an oval face; the constraint is fit, not shape.',
        'Keep the frame width close to your face width — roughly level with the cheekbones.',
        'Rectangular, wayfarer and aviator frames all work.',
      ],
      avoid: [
        'Oversized frames that extend well past your cheekbones and swamp the face.',
        'Very narrow frames that sit inside the widest point of your face.',
      ],
    },
    extra: {
      label: 'Beard',
      points: [
        'Almost any beard shape works. Keep the neckline tidy and let the cheek line sit naturally.',
        'If you want more definition at the jaw, let the beard fill the jaw corner rather than the chin.',
      ],
    },
    confusedWith: [
      {
        shape: 'Oblong',
        slug: 'oblong',
        how: 'Oblong is longer: its length-to-width ratio is usually above 1.6, and its sides run parallel instead of tapering.',
      },
      {
        shape: 'Round',
        slug: 'round',
        how: 'Round is compact: its length-to-width ratio is near 1.0, and the jaw is soft and full rather than tapering.',
      },
    ],
    faq: [
      {
        q: 'Is oval the most attractive face shape?',
        a: 'No — and treating any shape as a ranking is the wrong frame. Oval gets called the reference shape because its proportions are balanced and it tolerates almost any hairstyle or frame. Every shape has styling that works with it rather than against it.',
      },
      {
        q: 'Can your face shape change?',
        a: 'The bone structure does not change in adulthood, but the soft tissue over it does. Significant weight change, ageing and beard growth all shift the apparent outline, which is why a re-test months apart can land on a different category.',
      },
    ],
  },

  {
    slug: 'round',
    name: 'Round',
    title: 'Round Face Shape — How to Tell, and What Suits It',
    description:
      'What defines a round face shape, how to verify it with four measurements, and how to add the length and angles the geometry does not have.',
    h1: 'Round face shape',
    summary:
      'Roughly as wide as it is long, with full cheeks and a soft, rounded jawline — curves everywhere and no hard angles.',
    rule: 'Face length ≈ width (ratio near 1.0–1.25) · forehead, cheekbones and jaw all about the same width · the jawline has no hard corner.',
    signs: [
      'Length and width are close: the length-to-width ratio is usually 1.0–1.25.',
      'Forehead width, cheekbone width and jaw width are all within a few percent of each other.',
      'Cheeks read full and the jawline is soft and rounded.',
      'The widest point of the face sits around the middle, not at the jaw or the forehead.',
    ],
    ruler: [
      'Measure L (hairline to chin) and W (across the cheekbones).',
      'Measure F (forehead) and J (jaw) at their widest points.',
      'Round if L ÷ W is below about 1.25, and F and J are roughly equal.',
      'If the jaw feels angular rather than soft at the same proportions, check square instead.',
    ],
    hair: {
      works: [
        'Volume at the crown, which adds the vertical length the geometry does not have.',
        'Long layers that fall below the jaw and break up the width.',
        'A deep side part, which reads as asymmetry and therefore as angle.',
      ],
      avoid: [
        'Blunt chin-length cuts — they end exactly where the face is widest.',
        'Flat, centre-parted styles and heavy width at the sides.',
      ],
    },
    glasses: {
      works: [
        'Angular frames — rectangular, square, geometric — to introduce the straight lines the face lacks.',
        'Browline frames, which put visual weight at the top and lengthen the face.',
        'Frames slightly wider than the widest part of your face.',
      ],
      avoid: ['Round frames, which echo the existing curves.', 'Small round lenses that sit inside the cheekbones.'],
    },
    extra: {
      label: 'Contour and blush',
      points: [
        'Contour placed just under the cheekbone adds the shadow definition the soft outline does not create on its own.',
        'Blush on the apples of the cheeks leans into the full-cheek look deliberately; blush swept up towards the temples lengthens instead.',
        'A highlight down the centre of the forehead and chin draws the eye vertically.',
      ],
    },
    confusedWith: [
      {
        shape: 'Square',
        slug: 'square',
        how: 'Square has the same compact proportions but a defined jaw corner and a wider, straighter jawline. Round tapers softly.',
      },
      {
        shape: 'Heart',
        slug: 'heart',
        how: 'Heart tapers to a narrow chin from a wide forehead. Round stays wide all the way down.',
      },
    ],
    faq: [
      {
        q: 'Can a haircut make a round face look longer?',
        a: 'Yes, within limits. Height at the crown and length below the jaw both change how the outline reads. What a haircut cannot do is change the underlying bone proportions — it changes the frame around them.',
      },
      {
        q: 'Does body fat change whether my face is round?',
        a: 'The apparent outline, yes. The buccal fat layer is one of the first places some people lose volume, so weight change can shift a face from round towards square or oval without any change in bone structure.',
      },
    ],
  },

  {
    slug: 'square',
    name: 'Square',
    title: 'Square Face Shape — How to Tell, and What Suits It',
    description:
      'What defines a square face shape, how to check it with a ruler, and how to style a strong jawline with softer hair and rounded frames.',
    h1: 'Square face shape',
    summary:
      'Compact proportions like round, but with a defined jaw corner and minimal taper — forehead, cheekbones and jaw are all about the same width.',
    rule: 'Face length ≈ width · forehead, cheekbones and jaw within a few percent of each other · a hard angle at the jaw and often a straight hairline.',
    signs: [
      'Length and width are close, similar to a round face.',
      'The jaw angle (gonion) is pronounced — there is a visible corner rather than a curve.',
      'The chin is broader and squarer than in a round face.',
      'The hairline is often straight across rather than rounded.',
    ],
    ruler: [
      'Measure L, W, F and J as for any shape.',
      'Square if L ÷ W is below about 1.3 and F ≈ J (within roughly 5 mm).',
      'Then judge the jaw: a visible corner at the jaw angle confirms square over round.',
      'If J is clearly wider than F, that is a triangle rather than square.',
    ],
    hair: {
      works: [
        'Soft waves and layers, which introduce curves next to a straight jaw.',
        'Side-swept styles and a side part.',
        'Length that falls below the jaw — the jaw corner disappears behind the hair.',
      ],
      avoid: [
        'Blunt cuts ending at the jawline, which frame the corner you are softening.',
        'Very short, uniform crops that follow the square outline.',
        'Heavy straight fringes that add another horizontal line.',
      ],
    },
    glasses: {
      works: [
        'Round or oval frames, which counter the angular geometry.',
        'Thin or rimless styles, which reduce the total visual weight.',
        'Cat-eye shapes, which lift the eye line.',
      ],
      avoid: [
        'Square or rectangular frames, which repeat the jaw corner.',
        'Thick, heavy frames that add width across the middle of the face.',
      ],
    },
    extra: {
      label: 'Beard',
      points: [
        'Keep it short and even, and never wider than your hairline — a full square beard exaggerates the jaw.',
        'Round the beard line at the bottom rather than squaring it off.',
        'Let the cheek line sit naturally; a sharply carved cheek line adds another hard edge.',
      ],
    },
    confusedWith: [
      {
        shape: 'Round',
        slug: 'round',
        how: 'Same compact proportions, but round has a soft jaw with no corner. The gonion angle is the deciding measurement.',
      },
      {
        shape: 'Oblong',
        slug: 'oblong',
        how: 'Oblong shares the parallel-sided signature but is stretched vertically: its length-to-width ratio is above 1.6.',
      },
    ],
    faq: [
      {
        q: 'Is a square jaw the same as a square face?',
        a: 'No. A square jaw describes one feature; a square face describes the overall proportion — length close to width, with the forehead, cheekbones and jaw all at similar widths. A face can have a defined jaw and still read oval or oblong overall.',
      },
      {
        q: 'How do I soften a square face?',
        a: 'Texture and curves around the jaw do most of the work: layers that fall below the jawline, a side part, and round or oval frames. Contour under the cheekbone adds definition rather than softness, so it is optional here.',
      },
    ],
  },

  {
    slug: 'heart',
    name: 'Heart',
    title: 'Heart Face Shape — How to Tell and What Suits It',
    description:
      'What defines a heart or inverted-triangle face shape, how to verify it, and how to balance a wide forehead with a narrow, pointed chin.',
    h1: 'Heart face shape (inverted triangle)',
    summary:
      'The forehead is the widest point of the face, tapering through high cheekbones to a narrow, often pointed chin.',
    rule: 'Forehead wider than cheekbones, cheekbones wider than jaw · a sharp chin point · F > C > J in the three width measurements.',
    signs: [
      'The forehead is the widest of the three widths — the opposite of diamond.',
      'Cheekbones are prominent and sit below a relatively broad upper face.',
      'The jaw tapers sharply to a narrow, pointed chin.',
      'A widow’s peak is common but not required; the taper is the defining trait, not the hairline.',
    ],
    ruler: [
      'Measure F (forehead, at the widest point) and J (jaw).',
      'Heart if F is clearly larger than J — roughly 10% or more.',
      'Then compare the cheekbones: they should sit between the two, wider than the jaw but narrower than the forehead.',
      'If the cheekbones are the widest instead, check diamond.',
    ],
    hair: {
      works: [
        'Volume at the jaw — chin-length bobs, lobs, and layers that end at or below the chin.',
        'Curtain bangs and a side part, which break up the width of the forehead.',
        'Styles that add width lower down to balance the taper.',
      ],
      avoid: [
        'Heavy volume on top, which adds to the widest part of the face.',
        'Tight slicked-back styles that expose the full forehead width.',
        'Short crops that are fuller at the temples than at the jaw.',
      ],
    },
    glasses: {
      works: [
        'Bottom-heavy frames, which add weight where the face is narrow.',
        'Rimless and thin metal frames, which keep the focus off the upper face.',
        'Aviators and frames that are slightly wider at the bottom edge.',
      ],
      avoid: [
        'Cat-eye and other top-heavy frames, which widen the forehead further.',
        'Decorative or heavy brow lines on the frame.',
      ],
    },
    extra: {
      label: 'Makeup',
      points: [
        'Blush placed mid-cheek rather than swept high towards the temples adds visual weight to the lower face.',
        'A flatter, straighter brow visually shortens a wide forehead.',
        'Highlight down the centre of the chin brings the narrow point forward.',
      ],
    },
    confusedWith: [
      {
        shape: 'Diamond',
        slug: 'diamond',
        how: 'Both taper at the jaw, but diamond has the cheekbones as the widest point while heart has the forehead widest. It comes down to which of F and C is larger.',
      },
      {
        shape: 'Oval',
        slug: 'oval',
        how: 'Oval tapers gently from the cheekbones; heart tapers sharply from the forehead. The chin point is the giveaway.',
      },
    ],
    faq: [
      {
        q: 'Is a heart face shape the same as an inverted triangle?',
        a: 'Yes — the two names describe the same proportion: a face that is widest at the forehead and tapers to a narrow chin. Heart is the more common term in styling, inverted triangle in geometry-first descriptions.',
      },
      {
        q: 'What is the difference between a heart and a diamond face?',
        a: 'Which point is widest. In a heart face the forehead is widest (forehead > cheekbones > jaw). In a diamond face the cheekbones are widest, with both the forehead and the jaw narrower than the cheekbones.',
      },
    ],
  },

  {
    slug: 'oblong',
    name: 'Oblong',
    title: 'Oblong Face Shape (Long Face) — How to Tell and Style It',
    description:
      'What defines an oblong or long face shape, how to check the length-to-width ratio, and how to add width instead of height.',
    h1: 'Oblong face shape (long face)',
    summary:
      'Clearly longer than wide with fairly parallel sides — the forehead, cheekbones and jaw are all at similar widths, just stretched vertically.',
    rule: 'Face length ÷ width is above about 1.6, with the forehead, cheekbones and jaw at similar widths and minimal tapering.',
    signs: [
      'The length-to-width ratio is the largest of any shape — typically 1.6 or higher.',
      'The sides of the face run roughly parallel rather than tapering to a point.',
      'The midface often runs long, and the hairline can sit high.',
      'The jaw may be rounded or square; the length is what defines the shape.',
    ],
    ruler: [
      'Measure L (hairline to chin) and W (across the cheekbones).',
      'Oblong if L ÷ W is above roughly 1.6.',
      'Then compare F, W and J: if all three are within a few percent of each other, the sides are parallel and the shape is oblong.',
      'If the cheekbones are clearly the widest and the face tapers, check oval or diamond instead.',
    ],
    hair: {
      works: [
        'Side volume — width at the temples and jaw balances the vertical length.',
        'Bangs, including a full fringe, which shorten the visual length of the face.',
        'Layers that add width rather than height.',
      ],
      avoid: [
        'Long, straight, layerless hair, which draws the eye downwards.',
        'Height at the crown — it lengthens a face that is already long.',
        'A centre part with no volume, which emphasises the vertical axis.',
      ],
    },
    glasses: {
      works: [
        'Deep frames with a substantial lens height, which cover more of the midface.',
        'Wide rectangular frames with decorative or contrasting temples, which add width.',
        'Oversized frames — this is the one shape where oversized genuinely helps.',
      ],
      avoid: ['Small, narrow frames that leave the face looking longer by comparison.', 'Short, shallow lenses.'],
    },
    extra: {
      label: 'Beard',
      points: [
        'A full, wide beard adds width to the lower third — this is the most effective single change for an oblong face.',
        'Keep it wide at the sides rather than long at the chin.',
        'Avoid a long pointed beard: it extends the length you are trying to break up.',
      ],
    },
    confusedWith: [
      {
        shape: 'Oval',
        slug: 'oval',
        how: 'Both can be longer than wide, but oval tapers through the cheekbones and has a ratio closer to 1.5. Oblong keeps parallel sides and runs above 1.6.',
      },
      {
        shape: 'Square',
        slug: 'square',
        how: 'Square shares the parallel sides but is compact: its length-to-width ratio is near 1.0 rather than above 1.6.',
      },
    ],
    faq: [
      {
        q: 'Is an oblong face the same as a rectangular face?',
        a: 'Yes — rectangular and oblong are used interchangeably, and both refer to a face that is long with fairly parallel sides. Some charts list it as "long".',
      },
      {
        q: 'Can bangs make a long face look shorter?',
        a: 'Yes. A fringe covers the top of the face and moves the visual starting point of the face down, which reduces the apparent length. Side volume does the complementary job by adding width.',
      },
    ],
  },

  {
    slug: 'diamond',
    name: 'Diamond',
    title: 'Diamond Face Shape — How to Tell, and What Suits It',
    description:
      'What defines a diamond face shape — cheekbones widest, forehead and jaw narrower — how to verify it, and which styles balance the double taper.',
    h1: 'Diamond face shape',
    summary:
      'The cheekbones are the widest point, with the face narrowing towards both a narrower forehead and a narrower jaw — a double taper.',
    rule: 'Cheekbones wider than both the forehead and the jaw · forehead and jaw are of similar, smaller width · C > F and C > J.',
    signs: [
      'The cheekbones are the widest point of the face.',
      'Both the forehead and the jaw are narrower than the cheekbones — the double taper is the signature.',
      'Cheekbones sit high and read as prominent, sometimes with a slightly angular midface.',
      'The chin may be narrow or slightly pointed, and the forehead is often not much wider than the jaw.',
    ],
    ruler: [
      'Measure W (cheekbones), F (forehead) and J (jaw) at their widest points.',
      'Diamond if W is greater than F and also greater than J.',
      'Check that F and J are close to each other — if the forehead is clearly wider than the jaw, check heart instead.',
      'The length-to-width ratio is usually between 1.2 and 1.4.',
    ],
    hair: {
      works: [
        'Width at the forehead: a side-swept fringe or bangs softens the narrow upper face.',
        'Chin-length layers and volume at the jaw, which balance the narrow lower face.',
        'A side part rather than a centre part, which avoids echoing the taper.',
      ],
      avoid: [
        'Styles that are tight at the temples and wide at the cheekbones — that exaggerates the diamond.',
        'Heavy volume exactly at cheekbone height.',
        'Slicked-back styles with no width at either end.',
      ],
    },
    glasses: {
      works: [
        'Top-heavy frames and cat-eye shapes, which add width to a narrow forehead.',
        'Oval frames that are wider than the cheekbones, so the frame becomes the widest point.',
        'Frames with a distinctive upper rim or brow line.',
      ],
      avoid: [
        'Narrow frames that sit inside the cheekbones and disappear against them.',
        'Rimless styles — prominent cheekbones leave nothing for them to balance against.',
      ],
    },
    extra: {
      label: 'Makeup',
      points: [
        'Highlight the forehead and the chin to bring both narrow ends forward.',
        'Blush on the apples of the cheeks rather than swept along the cheekbone.',
        'Keep contour light at the cheekbones: they are already the widest point.',
      ],
    },
    confusedWith: [
      {
        shape: 'Heart',
        slug: 'heart',
        how: 'Heart also narrows at the jaw, but its forehead is the widest point. Diamond is widest at the cheekbones — compare F and C to separate them.',
      },
      {
        shape: 'Oval',
        slug: 'oval',
        how: 'Oval is widest at the cheekbones too, but the taper is gentle and the length-to-width ratio is closer to 1.5, so no end reads as narrow.',
      },
    ],
    faq: [
      {
        q: 'Are prominent cheekbones the same as a diamond face?',
        a: 'Not by itself. Many face shapes have prominent cheekbones. A diamond face needs the cheekbones to be measurably the widest point, with both the forehead and the jaw narrower — the double taper is what makes it diamond.',
      },
      {
        q: 'What hairstyle suits a diamond face?',
        a: 'Anything that adds width at the forehead and at the jaw: a side-swept fringe, bangs, and chin-length layers. What to avoid is a style that is narrow at the top and wide at the cheekbones, which repeats the taper.',
      },
    ],
  },
];

export function findShape(slug: string): ShapeGuide | undefined {
  return shapes.find((shape) => shape.slug === slug);
}
