/**
 * 导入小说弹窗：两种模式 ——
 *  A) 已有项目目录（含 novel-project.json）→ 登记/激活书架；
 *  B) txt/md 全本 → 服务器拆章建项目后登记书架。
 * 浏览器无法直接浏览宿主机目录，故两种模式均输入绝对路径（粘贴或手输）。
 */
import { useState } from 'react'
import type { NovelApi } from '../api.ts'
import css from './panel.module.css'

type ImportMode = 'dir' | 'text'

/** 导入结果（成功态展示）。 */
interface ImportResult {
  kind: 'dir' | 'text'
  bookName: string
  existed?: boolean
  chapters?: number
  skipped?: string[]
}

export function ImportModal({
  api,
  onClose,
  onImported,
}: {
  api: NovelApi
  onClose: () => void
  /** 导入成功并已激活该书后回调（刷新书架）。 */
  onImported: () => void | Promise<void>
}) {
  const [mode, setMode] = useState<ImportMode>('dir')
  const [dir, setDir] = useState('')
  const [filePath, setFilePath] = useState('')
  const [outDir, setOutDir] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)

  const runImport = async () => {
    setError('')
    setResult(null)
    if (mode === 'dir') {
      const d = dir.trim()
      if (d === '') { setError('请输入项目目录（含 novel-project.json 的文件夹）'); return }
      setBusy(true)
      try {
        const r = await api.bookImportDir(d)
        setResult({ kind: 'dir', bookName: r.book.bookName, existed: r.existed })
        await onImported()
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setBusy(false)
      }
    } else {
      const f = filePath.trim()
      if (f === '') { setError('请输入 txt/md 文件路径'); return }
      setBusy(true)
      try {
        const o = outDir.trim()
        const r = await api.bookImportText(f, o !== '' ? o : undefined)
        setResult({ kind: 'text', bookName: r.bookName, chapters: r.chapters, skipped: r.skipped })
        await onImported()
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setBusy(false)
      }
    }
  }

  return (
    <div className={css.importModalOverlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={css.importModal}>
        <div className={css.importModalHead}>
          <span className={css.panelTitle} style={{ margin: 0 }}>📥 导入小说</span>
          <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={onClose} title="关闭">✕</button>
        </div>

        <div className={css.importModalTabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'dir'}
            className={`${css.button} ${mode === 'dir' ? css.buttonPrimary : ''}`}
            onClick={() => { setMode('dir'); setError(''); setResult(null) }}
          >
            📂 A · 已有项目目录
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'text'}
            className={`${css.button} ${mode === 'text' ? css.buttonPrimary : ''}`}
            onClick={() => { setMode('text'); setError(''); setResult(null) }}
          >
            📄 B · txt/md 全本
          </button>
        </div>

        <div className={css.importModalBody}>
          {mode === 'dir' ? (
            <>
              <label className={css.importField}>
                <span>项目目录（绝对路径）</span>
                <input
                  className={css.input}
                  type="text"
                  placeholder="例如 D:\novels\我的小说"
                  value={dir}
                  onChange={e => { setDir(e.target.value) }}
                />
              </label>
              <div className={css.importHint}>
                目录需含 novel-project.json。已在书架中的目录会直接切换激活，不会重复登记。
              </div>
            </>
          ) : (
            <>
              <label className={css.importField}>
                <span>全本文本文件（绝对路径，txt / md）</span>
                <input
                  className={css.input}
                  type="text"
                  placeholder="例如 D:\novels\全本.txt"
                  value={filePath}
                  onChange={e => { setFilePath(e.target.value) }}
                />
              </label>
              <label className={css.importField}>
                <span>输出目录（可选，默认 ~/.dsh/novels/书名）</span>
                <input
                  className={css.input}
                  type="text"
                  placeholder="留空使用默认目录"
                  value={outDir}
                  onChange={e => { setOutDir(e.target.value) }}
                />
              </label>
              <div className={css.importHint}>
                服务器按「第X章 / 第X回 / 第X节 / 第X卷」（可带 # 前缀）拆章；正文过短（&lt;50 字）的章节会跳过并列出。
              </div>
            </>
          )}

          {error !== '' && <div className={css.importError}>{error}</div>}

          {result !== null && (
            <div className={css.importResult}>
              {result.kind === 'dir' ? (
                <>
                  <span>✅ 已{result.existed === true ? '重新激活' : '登记'}《{result.bookName}》</span>
                  <span className={css.meta}>
                    {result.existed === true
                      ? '该目录已在书架中，现已切换为当前书；工作台数据按该书目录加载。'
                      : '已加入书架并设为当前书，进入工作台即可看到全部模块。'
                    }
                  </span>
                </>
              ) : (
                <>
                  <span>✅ 《{result.bookName}》导入完成：{result.chapters} 章</span>
                  {(result.skipped ?? []).length > 0 && (
                    <span className={css.meta}>
                      跳过 {result.skipped!.length} 个过短章节：{result.skipped!.slice(0, 8).join('、')}
                      {result.skipped!.length > 8 ? ` 等 ${result.skipped!.length} 个` : ''}
                    </span>
                  )}
                  <span className={css.meta}>章节已按「written」登记，进入工作台后逐章审稿/补设定即可。</span>
                </>
              )}
            </div>
          )}
        </div>

        <div className={css.importModalActions}>
          <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={onClose}>关闭</button>
          <button
            type="button"
            className={`${css.button} ${css.buttonPrimary}`}
            disabled={busy}
            onClick={runImport}
          >
            {busy ? '导入中…' : '开始导入'}
          </button>
        </div>
      </div>
    </div>
  )
}