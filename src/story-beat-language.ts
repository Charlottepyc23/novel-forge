/**
 * 编剧词库（剧情骨架规范化基准）。
 * 骨架的 function（叙事功能）与 emotion（情绪走向）统一从这里取值（英文 id），
 * 生成提示词/展示时用 zh 中文。
 * 目的：让"叙事功能/情绪"有标准词表，避免 LLM 自由发挥导致情绪链漂移。
 */

/** 叙事功能（对应节拍在剧情中的作用）。 */
export type StoryFunctionId =
  | 'exposition' | 'conflict' | 'turn' | 'climax'
  | 'resolve' | 'foreshadow' | 'character'

/** 情绪词（低→高能量的情绪阶，角色在节拍中的主要情绪点）。 */
export type EmotionId =
  // 起：低能量
  | 'calm' | 'indifferent' | 'expectant' | 'curious' | 'alert'
  // 承：蓄势
  | 'suppressed' | 'enduring' | 'worried' | 'irritable' | 'uneasy'
  // 转：激化
  | 'terrified' | 'angry' | 'collapsing' | 'resolute' | 'grieved'
  // 合：落点
  | 'relieved' | 'bittersweet' | 'triumphant' | 'reborn' | 'numb'

export interface BeatLangEntry<T extends string> {
  id: T
  /** 中文（展示用）。 */
  zh: string
  /** 英文（英文平台适配用）。 */
  en: string
  /** 一句话说明。 */
  hint: string
}

/** 叙事功能词表。 */
export const STORY_FUNCTIONS: readonly BeatLangEntry<StoryFunctionId>[] = [
  { id: 'exposition', zh: '铺垫', en: 'exposition', hint: '介绍背景/人物/悬念' },
  { id: 'conflict', zh: '冲突', en: 'conflict', hint: '矛盾显现/加剧' },
  { id: 'turn', zh: '转折', en: 'turning point', hint: '剧情反转/方向改变' },
  { id: 'climax', zh: '高潮', en: 'climax', hint: '冲突顶峰/揭示' },
  { id: 'resolve', zh: '收束', en: 'resolution', hint: '矛盾化解/结果' },
  { id: 'foreshadow', zh: '伏笔', en: 'foreshadowing', hint: '埋下后续线索' },
  { id: 'character', zh: '人物塑造', en: 'characterization', hint: '展现人物特质/转变' },
]

/** 情绪词表（按能量/阶段排序）。 */
export const EMOTIONS: readonly BeatLangEntry<EmotionId>[] = [
  // 起：低能量
  { id: 'calm', zh: '平静', en: 'calm', hint: '无波澜' },
  { id: 'indifferent', zh: '淡然', en: 'indifferent', hint: '不在乎' },
  { id: 'expectant', zh: '期待', en: 'expectant', hint: '有所期盼' },
  { id: 'curious', zh: '好奇', en: 'curious', hint: '想要探究' },
  { id: 'alert', zh: '警觉', en: 'alert', hint: '察觉到异样' },
  // 承：蓄势
  { id: 'suppressed', zh: '压抑', en: 'suppressed', hint: '情绪被压制' },
  { id: 'enduring', zh: '隐忍', en: 'enduring', hint: '强忍着' },
  { id: 'worried', zh: '担忧', en: 'worried', hint: '担心后果' },
  { id: 'irritable', zh: '焦躁', en: 'irritable', hint: '烦躁不耐' },
  { id: 'uneasy', zh: '不安', en: 'uneasy', hint: '心里没底' },
  // 转：激化
  { id: 'terrified', zh: '惊惧', en: 'terrified', hint: '极度恐惧' },
  { id: 'angry', zh: '愤怒', en: 'angry', hint: '强烈不满' },
  { id: 'collapsing', zh: '崩溃', en: 'collapsing', hint: '情绪失控' },
  { id: 'resolute', zh: '决绝', en: 'resolute', hint: '下定狠心' },
  { id: 'grieved', zh: '痛心', en: 'grieved', hint: '悲伤心痛' },
  // 合：落点
  { id: 'relieved', zh: '释然', en: 'relieved', hint: '放下包袱' },
  { id: 'bittersweet', zh: '悲凉', en: 'bittersweet', hint: '苦涩无奈' },
  { id: 'triumphant', zh: '得意', en: 'triumphant', hint: '占据上风' },
  { id: 'reborn', zh: '重生', en: 'reborn', hint: '脱胎换骨' },
  { id: 'numb', zh: '麻木', en: 'numb', hint: '失去感知' },
]

export interface StoryBeatLanguage {
  function: StoryFunctionId
  emotion: EmotionId[]
}

/** 从中文归一化叙事功能（未知回退 exposition）。 */
export function normalizeStoryFunction(text: string | undefined): StoryFunctionId {
  if (text === undefined || text === '') return 'exposition'
  const t = text.trim()
  if (t.includes('铺垫')) return 'exposition'
  if (t.includes('冲突')) return 'conflict'
  if (t.includes('转折')) return 'turn'
  if (t.includes('高潮')) return 'climax'
  if (t.includes('收束')) return 'resolve'
  if (t.includes('伏笔')) return 'foreshadow'
  if (t.includes('人物塑造')) return 'character'
  return 'exposition'
}

/** 从中文文本归一化情绪词列表（可含→箭头链）。 */
export function normalizeEmotions(text: string | undefined): EmotionId[] {
  if (text === undefined || text === '') return ['calm']
  const t = text.trim()
  const out: EmotionId[] = []
  const push = (id: EmotionId) => { if (!out.includes(id)) out.push(id) }
  if (t.includes('平静')) push('calm')
  if (t.includes('淡然')) push('indifferent')
  if (t.includes('期待')) push('expectant')
  if (t.includes('好奇')) push('curious')
  if (t.includes('警觉')) push('alert')
  if (t.includes('压抑')) push('suppressed')
  if (t.includes('隐忍')) push('enduring')
  if (t.includes('担忧')) push('worried')
  if (t.includes('焦躁')) push('irritable')
  if (t.includes('不安')) push('uneasy')
  if (t.includes('惊惧')) push('terrified')
  if (t.includes('愤怒')) push('angry')
  if (t.includes('崩溃')) push('collapsing')
  if (t.includes('决绝')) push('resolute')
  if (t.includes('痛心')) push('grieved')
  if (t.includes('释然')) push('relieved')
  if (t.includes('悲凉')) push('bittersweet')
  if (t.includes('得意')) push('triumphant')
  if (t.includes('重生')) push('reborn')
  if (t.includes('麻木')) push('numb')
  if (out.length === 0) push('calm')
  return out
}

/** 叙事功能中文。 */
export function functionZh(id: StoryFunctionId | undefined): string {
  return STORY_FUNCTIONS.find(e => e.id === id)?.zh ?? '铺垫'
}
/** 情绪中文（箭头连接）。 */
export function emotionZh(ids: EmotionId[] | undefined): string {
  if (ids === undefined || ids.length === 0) return '平静'
  return EMOTIONS.filter(e => ids.includes(e.id)).map(e => e.zh).join('→')
}
