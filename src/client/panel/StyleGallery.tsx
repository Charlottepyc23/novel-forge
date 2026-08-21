/**
 * 风格库页面：4 个分类标签 + 风格卡片网格。
 * 卡片预留：风格效果图占位 + 特点说明 + 关键词（一键复制）。
 * 后续：新建漫剧方案时从这里选风格（基底 + 滤镜）。
 */
import { useState } from 'react'
import { STYLE_CATEGORIES, STYLE_LIBRARY, stylesByCategory, type StyleCategory } from '../../style-library.ts'
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
          <div
            key={style.id}
            style={{
              display: 'flex', flexDirection: 'column', gap: 6,
              border: '1px solid var(--nf-border)', borderRadius: 14,
              padding: 10, background: 'var(--nf-bg-raise)',
            }}
          >
            {/* 效果图（竖版 3:4，服务端缩略图 webp；无图回退占位） */}
            <div
              style={{
                aspectRatio: '3 / 4', borderRadius: 10,
                position: 'relative', overflow: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(145deg, var(--nf-bg-inset), color-mix(in srgb, var(--nf-accent) 12%, var(--nf-bg-inset)))',
                border: '1px solid var(--nf-border)',
                color: 'var(--nf-text-3)', fontSize: 12, textAlign: 'center',
              }}
            >
              <img
                src={`/api/dsh-novel-forge/styles/image?id=${style.id}`}
                alt={style.name}
                loading="lazy"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                onError={e => { e.currentTarget.style.display = 'none' }}
              />
              🖼️ 效果图待生成
            </div>

            <div className={css.row} style={{ flexWrap: 'wrap' }}>
              <b>{style.name}</b>
              <span className={css.badge}>{STYLE_CATEGORIES.find(c => c.id === style.category)?.icon} {style.category.toUpperCase()}</span>
              {style.stackable === true && <span className={css.badge}>叠加滤镜</span>}
            </div>

            {/* 说明位置 */}
            <span className={css.meta} style={{ fontSize: 12, lineHeight: 1.6 }}>{style.traits}</span>

            {/* 关键词词块（一键复制） */}
            <div
              style={{
                fontSize: 11.5, lineHeight: 1.5, color: 'var(--nf-text-2)',
                borderTop: '1px solid var(--nf-border)', paddingTop: 6,
                display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                cursor: 'pointer',
              }}
              title="点击复制关键词"
              onClick={() => { void copyKeywords(style.id, style.keywords) }}
            >
              <span className={css.meta}>关键词：</span>{style.keywords}
            </div>
            {copied === style.id && <span style={{ color: 'var(--nf-ok, #46a758)', fontSize: 12 }}>✅ 已复制</span>}
          </div>
        ))}
      </div>
    </div>
  )
}