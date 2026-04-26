export type QuickPromptItem = {
  id: string;
  name: string;
  prompt: string;
};

export type CustomQuickPrompt = QuickPromptItem & {
  createdAt: string;
};

const QUICK_PROMPTS_STORAGE_KEY = "chatgpt2api:image_quick_prompts";
const MAX_CUSTOM_QUICK_PROMPTS = 30;

export const builtinQuickPrompts: QuickPromptItem[] = [
  {
    id: "urban-atlas",
    name: "城市系统图谱",
    prompt:
      'Vertical 9:16 isometric cutaway infographic "城市生命系统图谱 / Urban Metabolism Atlas". Smart city from sky to bedrock: skyscrapers, streets, subway, utility tunnels, water/sewage/gas/heating pipes, fiber, data center, flood tanks, aquifers, geothermal wells, bedrock. Color-coded flows for power/water/data/traffic/waste. 12 numbered panels bilingual CN/EN: 能源/水循环/交通/数据/垃圾/建筑/公共服务/物流/气候韧性/生态/地质/治理看板. 24h timeline at bottom. Style: engineering white paper + scientific atlas, light paper bg, crisp lines, 8K. No cyberpunk, no gibberish text, must show both above AND below ground.',
  },
  {
    id: "cinematic-football-poster",
    name: "电影感体育海报",
    prompt:
      "生成一张足球主题电影海报风格的高清写真海报：球员站在主场中央激情庆祝，双手高举旗帜，神情热血、坚定、自信，现场灯光璀璨，球场看台座无虚席，背景有球队主色烟雾、聚光灯、飘扬旗帜和飞舞纸屑，营造欧冠之夜般的史诗氛围。人物为画面核心，半身到全身构图，突出脸部细节、肌肉张力与球衣质感。整体风格写实、震撼、富有戏剧性，海报级构图，电影感光影，高对比度，超清细节，8K，专业体育摄影，极具视觉冲击力。五根手指。",
  },
  {
    id: "silhouette-epic-poster",
    name: "叙事剪影海报",
    prompt:
      "根据【主题】自动生成一张收藏版史诗叙事海报：巨大优雅的人物侧脸剪影作为外轮廓，剪影内部自动生长出最契合该主题的完整世界观、标志性场景、角色关系、象征符号、关键建筑、生物、道具与氛围。整体不是普通拼贴，而是高级的剪影轮廓填充式叙事合成，带有双重曝光式联想，但更偏电影海报与梦幻水彩插画融合风格；柔和空气透视，轻雾化过渡，纸张颗粒，边缘飞白与刷痕，大面积留白，版式克制高级，安静、宏大、神圣、怀旧、诗意、传说感强。风格、色彩、场景、材质全部根据主题自动适配，所有元素必须强绑定主题，一眼识别，不要杂乱，不要硬拼贴，不要模板化背景，不要廉价奇幻素材。",
  },
  {
    id: "anime-fantasy-illustration",
    name: "日系奇幻插画",
    prompt:
      "参考图是角色人设图，为参考图的少女绘制一幅日系唯美奇幻风格插画。宏大的中景构图，少女站立在无边如镜的水面中央，天空是高饱和粉紫与深蓝交织的星空，一条耀眼的蓝色巨型流星划破天际，边缘发光的瑰丽层云包裹画面。女孩处于背光状态，形成暗调但依然清晰可辨服装和明亮眼眸的剪影，被流星和星空边缘光细腻勾勒，微微仰头，一只手轻轻张开。下方水面完美对称地反射整个壮丽星空、流星、云彩和女孩倒影，点缀微小发光点，营造空灵静谧、超现实宿命感的梦境氛围。比例 9:16，4K。",
  },
  {
    id: "encyclopedia-infographic",
    name: "科普百科信息图",
    prompt:
      "根据【主题】生成一张高质量竖版科普百科图。这不是普通海报，也不是单纯插画，而是一张兼具图鉴感、百科感、信息结构感和收藏感的模块化科普信息图。整体风格参考高级博物图鉴、现代百科书页、生活方式知识卡和社交媒体传播性强的信息图风格。包含：清晰主视觉、局部特征放大细节、多个圆角模块化信息分区、明确的标题层级与重点标签、简洁但信息丰富的百科内容、可视化评分与要点总结。浅色干净背景，柔和配色，轻阴影，精致小图标，圆角信息框，整体排版整洁清爽，信息密度丰富但不拥挤。",
  },
];

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizePrompt(value: string) {
  return String(value || "").trim();
}

function parseStoredQuickPrompts(value: string | null): CustomQuickPrompt[] {
  if (!value) {
    return [];
  }
  try {
    const data = JSON.parse(value);
    if (!Array.isArray(data)) {
      return [];
    }
    return data
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        id: String(item.id || createId()),
        name: String(item.name || "").trim(),
        prompt: normalizePrompt(String(item.prompt || "")),
        createdAt: String(item.createdAt || new Date().toISOString()),
      }))
      .filter((item) => item.name && item.prompt);
  } catch {
    return [];
  }
}

export function loadCustomQuickPrompts() {
  if (typeof window === "undefined") {
    return [];
  }
  return parseStoredQuickPrompts(window.localStorage.getItem(QUICK_PROMPTS_STORAGE_KEY));
}

function saveCustomQuickPrompts(items: CustomQuickPrompt[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(QUICK_PROMPTS_STORAGE_KEY, JSON.stringify(items));
}

export function upsertCustomQuickPrompt(input: { name: string; prompt: string }) {
  const name = String(input.name || "").trim();
  const prompt = normalizePrompt(input.prompt);
  if (!name) {
    throw new Error("请输入快捷提示词名称");
  }
  if (!prompt) {
    throw new Error("当前作品没有可保存的提示词");
  }

  const items = loadCustomQuickPrompts();
  const existingIndex = items.findIndex((item) => item.prompt === prompt);
  if (existingIndex >= 0) {
    const nextItems = [...items];
    nextItems[existingIndex] = {
      ...nextItems[existingIndex],
      name,
    };
    saveCustomQuickPrompts(nextItems);
    return { items: nextItems, created: false };
  }

  if (items.length >= MAX_CUSTOM_QUICK_PROMPTS) {
    throw new Error(`快捷提示词最多保存 ${MAX_CUSTOM_QUICK_PROMPTS} 条`);
  }

  const nextItems = [
    {
      id: createId(),
      name,
      prompt,
      createdAt: new Date().toISOString(),
    },
    ...items,
  ];
  saveCustomQuickPrompts(nextItems);
  return { items: nextItems, created: true };
}

export function removeCustomQuickPrompt(id: string) {
  const normalizedId = String(id || "").trim();
  const items = loadCustomQuickPrompts();
  const nextItems = items.filter((item) => item.id !== normalizedId);
  saveCustomQuickPrompts(nextItems);
  return nextItems;
}
