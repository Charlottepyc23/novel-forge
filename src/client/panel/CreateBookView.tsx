/**
 * 开书向导：独立页面视图 —— 书名 + 大纲（选择 docx / 拖拽 / 粘贴），
 * 实时书名识别与题材提示，开书即建项目并进入工作台。
 */
import { useRef, useState } from 'react'
import type { NovelApi } from '../api.ts'
import { extractDocxTextFromBuffer } from '../docx.ts'
import css from './panel.module.css'

/** 从大纲首行推断书名（与服务端 inferBookName 一致，供实时预览）。 */
function inferBookNamePreview(outline: string): string {
  const line = outline.split('\n').map(l => l.trim()).find(l => l.length > 0)
  if (line === undefined) return ''
  return line.replace(/^《/, '').replace(/》.*$/, '').slice(0, 40)
}

/** 简单题材识别（提示用）。 */
function guessGenre(outline: string): string | null {
  const map: Array<[string, string[]]> = [
    ['仙侠修真', ['仙', '修', '灵根', '元婴', '宗门', '飞升']],
    ['都市', ['都市', '公司', '外卖', '职场', '总裁']],
    ['玄幻', ['斗气', '魂力', '大陆', '斗罗', '神']],
    ['悬疑', ['悬疑', '密室', '案件', '推理', '凶']],
    ['科幻', ['机甲', '星舰', 'AI', '未来', '星际']],
    ['历史', ['朝代', '皇帝', '将军', '古代', '王朝']],
    ['游戏', ['游戏', '副本', '装备', '等级', '职业']],
  ]
  for (const [genre, keywords] of map) {
    if (keywords.some(k => outline.includes(k))) return genre
  }
  return null
}

/** 开书向导页。 */
export function CreateBookView({
  api,
  onBack,
  onCreated,
}: {
  api: NovelApi
  /** 返回书架。 */
  onBack: () => void
  /** 开书成功：进入新书工作台。 */
  onCreated: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [outlineText, setOutlineText] = useState('')
  const [outlineName, setOutlineName] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const outlineFileRef = useRef<HTMLInputElement | null>(null)

  const autoName = inferBookNamePreview(outlineText)
  const effectiveName = name.trim() !== '' ? name.trim() : autoName
  const genre = guessGenre(outlineText)

  const handlePickOutlineFile = async (file: File | undefined): Promise<void> => {
    if (file === undefined) return
    try {
      const buffer = await file.arrayBuffer()
      const text = extractDocxTextFromBuffer(buffer)
      if (text.length < 50) {
        setError('大纲内容过短（<50 字符），请检查文件')
        return
      }
      setOutlineText(text)
      setOutlineName(file.name)
      if (name.trim() === '') setName(inferBookNamePreview(text))
      setError('')
    } catch (err) {
      setError(`读取大纲失败：${(err as Error).message}`)
    }
  }

  const handleCreate = async (): Promise<void> => {
    if (effectiveName === '') {
      setError('请填写书名，或提供大纲自动识别')
      return
    }
    setBusy(true)
    setError('')
    try {
      const snapshot = await api.bookCreate(effectiveName, undefined, outlineText.trim() !== '' ? outlineText.trim() : undefined)
      const created = snapshot.books.find(b => b.id === snapshot.activeBookId)
      if (created !== undefined) {
        onCreated(created.id)
      } else {
        setError('开书失败：未找到新书')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={css.createBookView}>
      <div className={css.createBookTop}>
        <button type="button" className={css.iconButton} title="返回书架" aria-label="返回书架" onClick={onBack}>
          ← 书架
        </button>
      </div>

      <div className={css.createBookCard}>
        <span className={css.createBookIcon}>✒️</span>
        <h2 className={css.createBookTitle}>开书向导</h2>
        <span className={css.meta}>把一份大纲「编译」成一本完整的小说</span>

        {error !== '' && (
          <div className={css.card} style={{ borderColor: 'var(--nf-error)', padding: '8px 12px' }}>
            <span style={{ color: 'var(--nf-error)', fontSize: 12 }}>{error}</span>
          </div>
        )}

        <div className={css.field}>
          <label className={css.fieldLabel}>书名</label>
          <input
            className={css.input}
            placeholder={autoName !== '' ? `自动识别：${autoName}` : '输入书名（提供大纲后自动识别）'}
            value={name}
            onChange={e => { setName(e.target.value) }}
            onKeyDown={e => { if (e.key === 'Enter') void handleCreate() }}
            autoFocus
          />
        </div>

        <div className={css.field}>
          <label className={css.fieldLabel}>大纲</label>
          <div
            className={`${css.dropzone} ${dragActive ? css.dropzoneActive : ''}`}
            onClick={() => { outlineFileRef.current?.click() }}
            onDragOver={e => { e.preventDefault(); setDragActive(true) }}
            onDragLeave={() => { setDragActive(false) }}
            onDrop={e => {
              e.preventDefault()
              setDragActive(false)
              void handlePickOutlineFile(e.dataTransfer.files?.[0])
            }}
          >
            <span className={css.dropzoneIcon}>📄</span>
            <span>{outlineName !== '' ? `已选择：${outlineName}` : '点击选择 docx 大纲，或将文件拖到这里'}</span>
            <span className={css.meta}>推荐提供大纲：开书即建立项目，书名自动识别</span>
            <input
              ref={outlineFileRef}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              style={{ display: 'none' }}
              onChange={e => {
                void handlePickOutlineFile(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </div>
          <textarea
            className={css.textarea}
            style={{ minHeight: 130 }}
            placeholder="或直接粘贴大纲文本（50 字以上）…"
            value={outlineText}
            onChange={e => { setOutlineText(e.target.value) }}
            spellCheck={false}
          />
        </div>

        {(outlineText.trim().length > 0 || effectiveName !== '') && (
          <div className={css.row} style={{ flexWrap: 'wrap' }}>
            {outlineText.trim().length > 0 && <span className={css.meta}>大纲 {outlineText.length} 字</span>}
            {effectiveName !== '' && <span className={css.meta}>书名：{effectiveName}</span>}
            {genre !== null && <span className={css.meta}>题材：{genre}</span>}
          </div>
        )}

        <button
          type="button"
          className={`${css.button} ${css.buttonPrimary}`}
          style={{ width: '100%', padding: '10px 0', fontSize: 14 }}
          disabled={busy || effectiveName === ''}
          onClick={() => { void handleCreate() }}
        >
          ✨ 开书并进入工作台
        </button>
        <span className={css.meta} style={{ textAlign: 'center' }}>
          未提供大纲也能开书，稍后可在大纲页导入
        </span>
      </div>
    </div>
  )
}
