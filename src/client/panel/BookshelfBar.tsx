/**
 * 书架条：显示所有书，点击切换当前书（继续编译），＋ 新建。
 */
import { useState } from 'react'
import type { NovelApi } from '../api.ts'
import type { BookshelfSnapshot } from '../../protocol.ts'
import css from './panel.module.css'

/** Props. */
export interface BookshelfBarProps {
  api: NovelApi
  shelf: BookshelfSnapshot
  /** 刷新整个面板（切换书后重新拉状态）。 */
  onSwitch: () => void
}

/** 书架条。 */
export function BookshelfBar({ api, shelf, onSwitch }: BookshelfBarProps) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async (): Promise<void> => {
    const bookName = name.trim()
    if (bookName === '') return
    setBusy(true)
    setError('')
    try {
      await api.bookCreate(bookName)
      setCreating(false)
      setName('')
      onSwitch()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const handleActivate = async (id: string): Promise<void> => {
    if (id === shelf.activeBookId) return
    setBusy(true)
    try {
      await api.bookActivate(id)
      onSwitch()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async (id: string): Promise<void> => {
    setBusy(true)
    try {
      await api.bookRemove(id)
      onSwitch()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={css.bookshelf}>
      <span className={css.bookshelfLabel}>书架</span>
      <div className={css.bookshelfList}>
        {shelf.books.map(book => (
          <div
            key={book.id}
            className={`${css.bookChip} ${book.id === shelf.activeBookId ? css.bookChipActive : ''}`}
            onClick={() => { void handleActivate(book.id) }}
            title={book.outputDir}
          >
            <span className={css.bookChipName}>{book.bookName}</span>
            <span className={css.bookChipMeta}>{book.hasProject ? `${book.done}/${book.total} 章` : '未开书'}</span>
            <button
              type="button"
              className={css.bookChipRemove}
              title="从书架移除"
              onClick={(e) => { e.stopPropagation(); void handleRemove(book.id) }}
            >
              ×
            </button>
          </div>
        ))}
        {!creating ? (
          <button type="button" className={css.bookAdd} onClick={() => { setCreating(true) }}>
            ＋ 新书
          </button>
        ) : (
          <div className={css.bookCreateForm}>
            <input
              className={css.input}
              style={{ width: 140 }}
              placeholder="书名"
              value={name}
              onChange={e => { setName(e.target.value) }}
              onKeyDown={e => { if (e.key === 'Enter') void handleCreate() }}
              autoFocus
            />
            <button type="button" className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`} disabled={busy || name.trim() === ''} onClick={() => { void handleCreate() }}>
              创建
            </button>
            <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { setCreating(false) }}>
              取消
            </button>
          </div>
        )}
      </div>
      {error !== '' && <span style={{ color: 'var(--nf-error)', fontSize: 12 }}>{error}</span>}
    </div>
  )
}
