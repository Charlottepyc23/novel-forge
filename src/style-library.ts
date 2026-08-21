/**
 * 风格库（内置模板）：漫剧方案的视觉基底 + 可叠加滤镜。
 * 字段来自通用风格模板（豆包整理），keywords 即风格前缀词块，生成时直接套用。
 */

export type StyleCategory = '3d' | 'game' | '2d' | 'film' | 'craft'

export interface ArtStyle {
  id: string
  /** 风格名（用户可见）。 */
  name: string
  category: StyleCategory
  /** 特点一句话（卡片展示）。 */
  traits: string
  /** 风格关键词/前缀（生成角色图/视频提示词时套用）。 */
  keywords: string
  /** 是否可作为滤镜叠加在基底风格之上（影视实验类；缺省 false）。 */
  stackable?: boolean
  /** 默认推荐排序权重（0-1，推荐池排序参考）。 */
  weight?: number
}

export const STYLE_CATEGORIES: ReadonlyArray<{ id: StyleCategory; label: string; icon: string; desc: string }> = [
  { id: '3d', label: '3D 类', icon: '🧊', desc: '人物稳定性最好，视频不易崩脸' },
  { id: 'game', label: '游戏 3D', icon: '🎮', desc: '游戏渲染质感与镜头语言（生存/恐怖/潜行）' },
  { id: '2d', label: '2D 二次元绘画', icon: '✏️', desc: '手绘感，人物一致性略弱' },
  { id: 'film', label: '影视实验质感', icon: '🎞️', desc: '滤镜/影像体系，可叠加在 3D/2D 之上' },
  { id: 'craft', label: '国风/特殊工艺', icon: '🏮', desc: '国风与传统工艺质感' },
]

/** 内置风格模板（18 个）。 */
export const STYLE_LIBRARY: ArtStyle[] = [
  // ---------------- 3D 类 ----------------
  { id: 'pixar-adult-3d', name: '成人向皮克斯 3D', category: '3d', traits: 'CG 三维渲染，材质细腻，微表情表现力强；需压制 Q 版可爱感', keywords: '3D皮克斯动画，成人写实CGI，电影光影，拒绝Q版', weight: 1.0 },
  { id: 'arcane-thick-3d', name: '双城之战美漫厚涂 3D', category: '3d', traits: '粗重轮廓线，高对比硬阴影，材质粗粝，悲剧、压抑、科幻题材适配高', keywords: '双城之战美术，3D美漫厚涂，强轮廓光影，暗调粗粝渲染', weight: 0.95 },
  { id: 'nextgen-cg', name: '次世代游戏 CG', category: '3d', traits: '接近真人的三维渲染，照片级布料、皮肤材质，冷峻写实', keywords: '次世代游戏CG渲染，超写实3D，真实物理材质，电影布光', weight: 0.9 },
  { id: 'low-cyberpunk-3d', name: '底层赛博朋克 3D', category: '3d', traits: '锈蚀工业、破碎霓虹、屏幕噪点；避开华丽高楼，偏向破败底层', keywords: '底层赛博朋克3D，废土工业，破碎霓虹，画面噪点色散', weight: 0.85 },
  { id: 'vaporwave-3d', name: '复古蒸汽波 3D', category: '3d', traits: '粉-蓝-紫霓虹轮廓、90 年代复古网格、胶片色散颗粒，颓废疏离', keywords: '3D复古蒸汽波，90年代三维渲染，霓虹轮廓光，胶片颗粒', weight: 0.8 },
  { id: 'dark-gothic-3d', name: '暗黑哥特 3D', category: '3d', traits: '大面积阴影、冷青色调、衰败破败质感，适合幽暗密闭空间', keywords: '3D暗黑哥特，冷青暗光，衰败质感，大面积阴影', weight: 0.8 },
  { id: 'clay-stopmotion-3d', name: '黏土 / 定格 3D', category: '3d', traits: '捏塑颗粒肌理，手工定格质感；可做压抑向，不局限可爱风', keywords: '3D黏土定格渲染，泥塑肌理，电影打光', weight: 0.7 },
  { id: 'openworld-survival', name: '开放世界生存游戏风', category: 'game', traits: '场景破败感强，货架、仓库、管线、灰尘、锈蚀明显；人物带一点“生存者”气质；适合探索感、逃亡感、世界观展示', keywords: '开放世界生存游戏风格，废土场景，破败仓库，锈蚀金属货架，灰尘粒子，冷色写实光影', weight: 0.8 },
  { id: 'horror-game-3d', name: '恐怖游戏 3D', category: 'game', traits: '大面积阴影，荧光灯频闪，空间压抑；适合悬疑、压迫、精神异常段落', keywords: '恐怖游戏 3D 风格，昏暗仓库，老旧荧光灯，硬阴影，压迫空间，冷灰蓝调，低饱和', weight: 0.75 },
  { id: 'tactical-stealth', name: '战术潜行游戏风', category: 'game', traits: '低视角、第三人称镜头感；人物在货架之间移动，光影克制；适合紧张剧情', keywords: '战术潜行游戏视角，第三人称镜头，货架通道，冷色暗光，真实3D渲染，紧张压迫氛围', weight: 0.7 },
  // ---------------- 2D 类 ----------------
  { id: 'korean-webtoon', name: '韩漫条漫风', category: '2d', traits: '修长人物，低饱和高级灰，氛围感强，都市向漫剧爆款画风', keywords: '韩漫2D绘画，精致人物，低饱和灰调，氛围感插画', weight: 1.0 },
  { id: 'japan-cel-dark', name: '日系赛璐璐动画', category: '2d', traits: '干净勾线，硬阴影；分明亮版、暗调悲剧版（边缘行者质感）', keywords: '日系赛璐璐动画，清晰轮廓线，硬阴影，暗调都市动画', weight: 0.9 },
  { id: 'shinkai-anime', name: '新海诚动画风', category: '2d', traits: '极致环境光影、丁达尔、空气中尘埃粒子，擅长雨夜、夜景外景', keywords: '新海诚动画渲染，细腻环境光，漂浮尘埃粒子', weight: 0.85 },
  { id: 'pop-marvel-2d', name: '波普美漫', category: '2d', traits: '网点半调、强撞色，线条张扬，节奏冲击力强', keywords: '平行宇宙波普美漫，网点半调，漫画粗线条', weight: 0.8 },
  { id: 'dark-ghibli', name: '暗黑吉卜力手绘', category: '2d', traits: '手绘水彩肌理；强制关闭温暖治愈，做残酷冷调版本', keywords: '吉卜力手绘动画，暗黑写实，水彩肌理，拒绝暖光治愈', weight: 0.75 },
  // ---------------- 影视实验质感（可叠加滤镜） ----------------
  { id: 'noir-film', name: '黑色电影 Noir', category: 'film', traits: '高反差黑白，只保留少量色彩作为视觉锚点，张力极强', keywords: '黑色电影，大部分黑白，局部保留色彩，硬侧光，胶片颗粒', stackable: true, weight: 1.0 },
  { id: 'vhs90', name: 'VHS 90 录像带复古', category: 'film', traits: '扫描线、色彩偏移、磁带噪点，模拟老旧档案录像', keywords: 'VHS录像带质感，扫描线，色彩偏移，磁带噪点', stackable: true, weight: 0.9 },
  { id: 'film-photo', name: '胶片电影写真', category: 'film', traits: '电影机拍摄质感，轻微颗粒，景深虚化，无夸张特效', keywords: '电影写真质感，35mm胶片，胶片颗粒，浅景深', stackable: true, weight: 0.85 },
  // ---------------- 国风 / 特殊工艺 ----------------
  { id: 'chinese-ink', name: '新中式水墨动画', category: 'craft', traits: '水墨晕染，留白写意', keywords: '水墨动画渲染，写意晕染，国风2D', weight: 1.0 },
  { id: 'paper-cut-3d', name: '纸雕定格', category: 'craft', traits: '多层纸张镂空叠层，光影穿透纸面', keywords: '立体纸雕定格，纸张肌理，层叠镂空光影', weight: 0.9 },
  { id: 'guofeng-heavy', name: '工笔重彩国风', category: 'craft', traits: '精细线条，矿物颜料质感，古典华美', keywords: '工笔重彩，国风2D绘画，矿物颜料质感，精细勾线', weight: 0.8 },
]

/** 按分类取风格。 */
export function stylesByCategory(category: StyleCategory): ArtStyle[] {
  return STYLE_LIBRARY.filter(s => s.category === category)
}

/** 取单个风格（未找到返回 undefined）。 */
export function findStyle(id: string): ArtStyle | undefined {
  return STYLE_LIBRARY.find(s => s.id === id)
}

/** 按基底 + 滤镜拼接风格关键词（角色图/分镜/视频提示词共用；缺省回退 3D 动漫）。 */
export function styleKeywords(styleId?: string, filterId?: string): string {
  const parts: string[] = []
  const base = styleId !== undefined ? findStyle(styleId) : undefined
  if (base !== undefined) parts.push(base.keywords)
  const filter = filterId !== undefined ? findStyle(filterId) : undefined
  if (filter !== undefined) parts.push(filter.keywords)
  return parts.join('，') || '3D动漫，超精细建模，电影光影'
}