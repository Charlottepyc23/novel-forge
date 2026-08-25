/**
 * 镜头语言词库（分镜规范化基准）。
 * 分镜表的 shot/camera/composition/light 字段统一从这里取值（英文 id），
 * 生成提示词时用 zh 中文词块；适配英文平台时用 en。
 * 目的：让"景别/运镜/构图/光效"有标准词表，避免 LLM 自由发挥导致漂移。
 */

/** 景别。 */
export type ShotSizeId =
  | 'extreme_wide' | 'wide' | 'full' | 'medium'
  | 'medium_close' | 'close' | 'extreme_close' | 'big_extreme_close'

/** 运镜/机位。 */
export type CameraMoveId =
  | 'static' | 'dolly_in' | 'dolly_out' | 'pan_left' | 'pan_right'
  | 'track_left' | 'track_right' | 'follow' | 'pedestal_up' | 'pedestal_down'
  | 'orbit' | 'handheld' | 'low_angle' | 'high_angle' | 'over_shoulder'

/** 构图。 */
export type CompositionId =
  | 'rule_of_thirds' | 'center' | 'leading_line' | 'foreground'
  | 'low' | 'overhead' | 'symmetry'

/** 光效。 */
export type LightingId =
  | 'front' | 'side' | 'back' | 'top' | 'rembrandt'
  | 'neon' | 'hard' | 'soft' | 'mood' | 'contrast'

export interface ShotLangEntry<T extends string> {
  id: T
  /** 中文（提示词/展示用）。 */
  zh: string
  /** 英文（英文平台适配用）。 */
  en: string
  /** 一句话说明（下拉/卡片）。 */
  hint: string
}

export const SHOT_SIZES: readonly ShotLangEntry<ShotSizeId>[] = [
  { id: 'extreme_wide', zh: '大远景', en: 'extreme wide shot', hint: '环境为主，人物很小' },
  { id: 'wide', zh: '远景', en: 'wide shot', hint: '人在景中，交代环境' },
  { id: 'full', zh: '全景', en: 'full shot', hint: '全身』人物整体' },
  { id: 'medium', zh: '中景', en: 'medium shot', hint: '膝部以上，叙事主力' },
  { id: 'medium_close', zh: '中近景', en: 'medium close-up', hint: '胸以上，表情+动作' },
  { id: 'close', zh: '近景', en: 'close-up', hint: '肩以上，突出表情' },
  { id: 'extreme_close', zh: '特写', en: 'extreme close-up', hint: '脸/物细节' },
  { id: 'big_extreme_close', zh: '大特写', en: 'big close-up', hint: '局部（眼/手/标志物）' },
]

export const CAMERA_MOVES: readonly ShotLangEntry<CameraMoveId>[] = [
  { id: 'static', zh: '固定机位', en: 'static camera', hint: '机位不动' },
  { id: 'dolly_in', zh: '推近', en: 'dolly in', hint: '镜头向主体逼近' },
  { id: 'dolly_out', zh: '拉远', en: 'dolly out', hint: '镜头远离主体' },
  { id: 'pan_left', zh: '左摇', en: 'pan left', hint: '机位不动，镜头左转' },
  { id: 'pan_right', zh: '右摇', en: 'pan right', hint: '机位不动，镜头右转' },
  { id: 'track_left', zh: '左横移', en: 'track left', hint: '机位随主体左移' },
  { id: 'track_right', zh: '右横移', en: 'track right', hint: '机位随主体右移' },
  { id: 'follow', zh: '跟随', en: 'follow shot', hint: '镜头跟着主体运动' },
  { id: 'pedestal_up', zh: '升镜', en: 'pedestal up', hint: '机位抬高' },
  { id: 'pedestal_down', zh: '降镜', en: 'pedestal down', hint: '机位降低' },
  { id: 'orbit', zh: '环绕', en: 'orbit shot', hint: '镜头绕主体转' },
  { id: 'handheld', zh: '手持晃动', en: 'handheld', hint: '真实感/紧张感' },
  { id: 'low_angle', zh: '低机位仰拍', en: 'low angle', hint: '突出威严/压迫' },
  { id: 'high_angle', zh: '高机位俯拍', en: 'high angle', hint: '突出渺小/全知' },
  { id: 'over_shoulder', zh: '过肩镜头', en: 'over-the-shoulder', hint: '对话常用' },
]

export const COMPOSITIONS: readonly ShotLangEntry<CompositionId>[] = [
  { id: 'rule_of_thirds', zh: '三分法', en: 'rule of thirds', hint: '主体偏三分之一处' },
  { id: 'center', zh: '中心对称', en: 'centered', hint: '主体居中' },
  { id: 'leading_line', zh: '引导线', en: 'leading lines', hint: '视线沿线条引向主体' },
  { id: 'foreground', zh: '前景遮挡', en: 'foreground framing', hint: '前景物框住主体' },
  { id: 'low', zh: '低机位', en: 'low camera', hint: '低于视线' },
  { id: 'overhead', zh: '俯拍', en: 'overhead', hint: '从上方俯视' },
  { id: 'symmetry', zh: '对称构图', en: 'symmetrical', hint: '左右镜像' },
]

export const LIGHTINGS: readonly ShotLangEntry<LightingId>[] = [
  { id: 'front', zh: '顺光', en: 'front light', hint: '正面均匀照明' },
  { id: 'side', zh: '侧光', en: 'side light', hint: '明暗对比强' },
  { id: 'back', zh: '逆光', en: 'back light', hint: '轮廓光/剪影' },
  { id: 'top', zh: '顶光', en: 'top light', hint: '俯照硬朗' },
  { id: 'rembrandt', zh: '伦勃朗光', en: 'rembrandt lighting', hint: '侧逆光，经典人像' },
  { id: 'neon', zh: '霓虹光', en: 'neon lighting', hint: '赛博/夜景' },
  { id: 'hard', zh: '硬光', en: 'hard light', hint: '犀利阴影' },
  { id: 'soft', zh: '柔光', en: 'soft light', hint: '柔和过渡' },
  { id: 'mood', zh: '氛围光', en: 'mood lighting', hint: '情绪化色温' },
  { id: 'contrast', zh: '高反差', en: 'high contrast', hint: '黑白/强明暗' },
]

export interface ShotLanguage {
  shot?: ShotSizeId
  camera: CameraMoveId[]
  composition?: CompositionId
  light: LightingId[]
}

/** 从中文文本归一化到景别（处理旧数据/LLM 口语）。未知回退 medium。 */
export function normalizeShotSize(text: string | undefined): ShotSizeId {
  if (text === undefined || text === '') return 'medium'
  const t = text.trim()
  if (t.includes('大远景')) return 'extreme_wide'
  if (t.includes('远景')) return 'wide'
  if (t.includes('全景')) return 'full'
  if (t.includes('中近景') || t.includes('中景')) return 'medium'
  if (t.includes('近景') || t.includes('胸')) return 'close'
  if (t.includes('大特写')) return 'big_extreme_close'
  if (t.includes('特写')) return 'extreme_close'
  return 'medium'
}

/** 从中文文本归一化到运镜列表。 */
export function normalizeCameras(text: string | undefined): CameraMoveId[] {
  if (text === undefined || text === '') return ['static']
  const t = text.trim()
  const out: CameraMoveId[] = []
  const push = (id: CameraMoveId) => { if (!out.includes(id)) out.push(id) }
  if (t.includes('推近') || t.includes('推进')) push('dolly_in')
  if (t.includes('拉远') || t.includes('拉出')) push('dolly_out')
  if (t.includes('左摇')) push('pan_left')
  if (t.includes('右摇')) push('pan_right')
  if (t.includes('横移')) push(t.includes('左') ? 'track_left' : 'track_right')
  if (t.includes('跟随') || t.includes('跟拍')) push('follow')
  if (t.includes('升降') || t.includes('升') || t.includes('降')) push('pedestal_up')
  if (t.includes('环绕')) push('orbit')
  if (t.includes('手持') || t.includes('晃动')) push('handheld')
  if (t.includes('低机位') || t.includes('仰拍') || t.includes('仰')) push('low_angle')
  if (t.includes('高机位') || t.includes('俯拍') || t.includes('俯')) push('high_angle')
  if (t.includes('过肩')) push('over_shoulder')
  if (out.length === 0) push('static')
  return out
}

/** 从中文文本归一化到构图（可选）。 */
export function normalizeComposition(text: string | undefined): CompositionId | undefined {
  if (text === undefined || text === '') return undefined
  const t = text.trim()
  if (t.includes('三分')) return 'rule_of_thirds'
  if (t.includes('中心') || t.includes('居中')) return 'center'
  if (t.includes('引导')) return 'leading_line'
  if (t.includes('前景')) return 'foreground'
  if (t.includes('低机位')) return 'low'
  if (t.includes('俯拍') || t.includes('俯视')) return 'overhead'
  if (t.includes('对称')) return 'symmetry'
  return undefined
}

/** 从中文文本归一化到光效列表。 */
export function normalizeLightings(text: string | undefined): LightingId[] {
  if (text === undefined || text === '') return ['soft']
  const t = text.trim()
  const out: LightingId[] = []
  const push = (id: LightingId) => { if (!out.includes(id)) out.push(id) }
  if (t.includes('顺光')) push('front')
  if (t.includes('侧光') || t.includes('伦勃朗')) push(t.includes('伦勃朗') ? 'rembrandt' : 'side')
  if (t.includes('逆光')) push('back')
  if (t.includes('顶光')) push('top')
  if (t.includes('霓虹')) push('neon')
  if (t.includes('硬光')) push('hard')
  if (t.includes('柔光')) push('soft')
  if (t.includes('氛围') || t.includes('情绪')) push('mood')
  if (t.includes('高反差')) push('contrast')
  if (out.length === 0) push('soft')
  return out
}

/** 取词条中文（ZHs 合并句子）。 */
export function sizeZh(id: ShotSizeId | undefined): string {
  return SHOT_SIZES.find(e => e.id === id)?.zh ?? '中景'
}
export function cameraZh(ids: CameraMoveId[] | undefined): string {
  if (ids === undefined || ids.length === 0) return '固定机位'
  return CAMERA_MOVES.filter(e => ids.includes(e.id)).map(e => e.zh).join(' + ')
}
export function compoZh(id: CompositionId | undefined): string {
  return COMPOSITIONS.find(e => e.id === id)?.zh ?? ''
}
export function lightZh(ids: LightingId[] | undefined): string {
  if (ids === undefined || ids.length === 0) return '柔光'
  return LIGHTINGS.filter(e => ids.includes(e.id)).map(e => e.zh).join(' + ')
}
