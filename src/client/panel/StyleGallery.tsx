/**
 * 风格库页面：4 个分类标签 + 风格卡片网格。
 * 卡片预留：风格效果图占位 + 特点说明 + 关键词（一键复制）。
 * 后续：新建漫剧方案时从这里选风格（基底 + 滤镜）。
 */
import { useState } from 'react'
import { STYLE_CATEGORIES, STYLE_LIBRARY, stylesByCategory, type StyleCategory } from '../../style-library.ts'
import { StyleCard } from './StyleCard.tsx'
import css from './panel.module.css'

export function StyleGallery() {
  const [active, setActive] = useState<StyleCategory>('3d')
  const [copied, setCopied] = useState('')

  const copyKeywords = async (id: string, keywords: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(keywords)
      setCopied(id)
      setTimeout(() => { setCopied('') }, 1500)
    } catch { /* 剪贴板不可用时静默 */ }
  }

  const list = stylesByCategory(active)

  return (
    <div className={css.card}>
      <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span className={css.cardTitle}>🎨 风格库</span>
        <span className={css.meta}>共 {STYLE_LIBRARY.length} 个内置模板 · 新建漫剧方案时选择（影视类可作滤镜叠加）</span>
      </div>

      {/* 分类标签 */}
      <div className={css.row} style={{ gap: 8, flexWrap: 'wrap' }}>
        {STYLE_CATEGORIES.map(cat => (
          <button
            key={cat.id}
            type="button"
            className={`${css.button} ${active === cat.id ? css.buttonPrimary : ''}`}
            style={{ flex: 1, minWidth: 140 }}
            onClick={() => { setActive(cat.id) }}
          >
            {cat.icon} {cat.label}（{stylesByCategory(cat.id).length}）
          </button>
        ))}
      </div>
      <div className={css.meta}>
        {STYLE_CATEGORIES.find(c => c.id === active)?.desc}
      </div>

      {/* 风格卡片网格 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, marginTop: 6 }}>
                {list.map(style => (
          <StyleCard key={style.id} style={style} />
        ))}
      </div>
    </div>
  )
}