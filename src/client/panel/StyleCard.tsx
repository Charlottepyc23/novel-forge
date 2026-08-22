/**
 * 风格卡片（可复用）：效果图 + 风格名 + 特点 + 关键词。
 * 风格库浏览页与漫剧方案风格选择器共用。
 */
import { useState, type MouseEvent } from 'react'
import type { ArtStyle } from '../../style-library.ts'
import { STYLE_CATEGORIES } from '../../style-library.ts'

export function StyleCard({
  style,
  selected,
  onClick,
}: {
  style: ArtStyle
  /** 选中态（高亮边框）。 */
  selected?: boolean
  /** 点击卡片（选风格）。 */
  onClick?: () => void
}) {
  const [copied, setCopied] = useState('')
  const cat = STYLE_CATEGORIES.find(c => c.id === style.category)

  const copyKeywords = async (e: MouseEvent): Promise<void> => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(style.keywords)
      setCopied(style.id)
      setTimeout(() => { setCopied('') }, 1500)
    } catch { /* 剪贴板不可用时静默 */ }
  }

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-6)',
        border: `1px solid ${selected === true ? 'var(--nf-accent)' : 'var(--nf-border)'}`,
        borderRadius: 'var(--nf-radius-14)', padding: 'var(--nf-space-10)', background: 'var(--nf-bg-raise)',
        cursor: onClick !== undefined ? 'pointer' : 'default',
        boxShadow: selected === true ? '0 0 0 2px var(--nf-accent-soft)' : 'none',
      }}
    >
      {/* 效果图（竖版 3:4，服务端缩略图 webp；无图回退占位） */}
      <div
        style={{
          aspectRatio: '3 / 4', borderRadius: 'var(--nf-radius-10)',
          position: 'relative', overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(145deg, var(--nf-bg-inset), color-mix(in srgb, var(--nf-accent) 12%, var(--nf-bg-inset)))',
          border: '1px solid var(--nf-border)',
          color: 'var(--nf-text-3)', fontSize: 'var(--nf-fs-12)', textAlign: 'center',
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
        {selected === true && (
          <span style={{ position: 'absolute', top: 6, right: 6, background: 'var(--nf-accent)', color: '#fff', borderRadius: 'var(--nf-radius-999)', padding: 'var(--nf-space-2) var(--nf-space-8)', fontSize: 'var(--nf-fs-12)', fontWeight: 700 }}>✓</span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--nf-space-6)', flexWrap: 'wrap' }}>
        <b style={{ fontSize: 'var(--nf-fs-14)' }}>{style.name}</b>
        <span style={{ fontSize: 'var(--nf-fs-12)', color: 'var(--nf-text-3)' }}>{cat?.icon} {style.category.toUpperCase()}</span>
        {style.stackable === true && <span style={{ fontSize: 'var(--nf-fs-12)', color: 'var(--nf-info)', border: '1px solid var(--nf-info)', borderRadius: 'var(--nf-radius-999)', padding: '0 var(--nf-space-6)' }}>叠加滤镜</span>}
      </div>

      <span style={{ fontSize: 'var(--nf-fs-12)', lineHeight: 1.5, color: 'var(--nf-text-2)' }}>{style.traits}</span>

      <div
        style={{
          fontSize: 'var(--nf-fs-12)', lineHeight: 1.5, color: 'var(--nf-text-3)',
          borderTop: '1px solid var(--nf-border)', paddingTop: 'var(--nf-space-6)',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          cursor: 'copy',
        }}
        title="点击复制关键词"
        onClick={e => { void copyKeywords(e) }}
      >
        关键词：{style.keywords}
      </div>
      {copied === style.id && <span style={{ color: 'var(--nf-ok, #46a758)', fontSize: 'var(--nf-fs-12)' }}>✅ 已复制</span>}
    </div>
  )
}