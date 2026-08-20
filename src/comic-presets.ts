/** 漫画风格预设：每个预设对应一组出图提示词与排版偏好。 */

export interface ComicStylePreset {
  id: string
  label: string
  /** 注入 imagePrompt 的风格描述词。 */
  prompt: string
  /** 可选：排版偏好说明。 */
  layoutHint?: string
}

export const COMIC_STYLE_PRESETS: ComicStylePreset[] = [
  {
    id: 'japan',
    label: '日漫 / 黑白',
    prompt: 'manga style, screentone, bold ink lines, high contrast, black and white, cel shading',
    layoutHint: '页漫优先',
  },
  {
    id: 'korea',
    label: '韩漫 / 条漫',
    prompt: 'manhwa style, soft cel shading, vibrant colors, clean lineart, webtoon vertical composition, glossy highlights',
    layoutHint: '条漫优先',
  },
  {
    id: 'china',
    label: '国漫 / 古风',
    prompt: 'chinese ink painting style, flowing brush strokes, traditional palette, ethereal atmosphere, xianxia aesthetic',
    layoutHint: '页漫/条漫均可',
  },
  {
    id: 'america',
    label: '美漫 / 超级英雄',
    prompt: 'american comic style, bold outlines, dramatic lighting, dynamic poses, vibrant colors, halftone shading',
    layoutHint: '页漫优先',
  },
  {
    id: 'chibi',
    label: 'Q版 / 搞笑',
    prompt: 'chibi style, cute proportions, big head, exaggerated expressions, simple background, bright colors',
    layoutHint: '条漫/四格优先',
  },
  {
    id: 'realistic',
    label: '写实 / 电影感',
    prompt: 'realistic cinematic style, detailed textures, natural lighting, film grain, high detail',
    layoutHint: '页漫/全彩',
  },
  {
    id: 'cyber',
    label: '赛博 / 暗黑',
    prompt: 'cyberpunk style, neon lights, dark atmosphere, high contrast, futuristic city, cool tones',
    layoutHint: '页漫/全彩',
  },
]

export function getComicStylePrompt(styleId?: string): string {
  if (!styleId) return ''
  const preset = COMIC_STYLE_PRESETS.find(s => s.id === styleId)
  return preset?.prompt ?? ''
}

export function getComicStyleLabel(styleId?: string): string {
  if (!styleId) return ''
  const preset = COMIC_STYLE_PRESETS.find(s => s.id === styleId)
  return preset?.label ?? styleId
}
