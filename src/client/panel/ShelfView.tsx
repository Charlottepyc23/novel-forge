/**
 * 书架首页视图：书卡网格（封面/书名/简介/进度）+ 开书入口。
 * 进入小说工坊默认展示；点击书卡进入该书工作台，＋ 进入开书向导页。
 */
import { useEffect, useState } from 'react'
import type { NovelApi } from '../api.ts'
import type { BookshelfSnapshot } from '../../protocol.ts'
import css from './panel.module.css'

/** 一张书卡（封面懒加载）。 */
function BookCard({
  api,
  book,
  active,
  onOpen,
}: {
  api: NovelApi
  book: BookshelfSnapshot['books'][number]
  active: boolean
  onOpen: () => void
}) {
  const [cover, setCover] = useState<string | null>(null)

  useEffect(() => {
    if (!book.hasCover) return
    let cancelled = false
    void api.coverGet(book.outputDir).then(result => {
      if (!cancelled) setCover(result.dataUrl)
    }).catch(() => { /* best-effort */ })
    return () => { cancelled = true }
  }, [api, book.hasCover, book.outputDir])

  const ratio = book.total > 0 ? Math.min(book.done / book.total, 1) : 0
  const statusLabel = !book.hasProject ? '未开书' : book.total > 0 && book.done >= book.total ? '已完结' : '进行中'

  return (
    <div
      className={`${css.bookCard} ${active ? css.bookCardActive : ''}`}
      onClick={onOpen}
      title={`打开《${book.bookName}》`}
    >
      <div className={css.bookCardCover}>
        {cover !== null ? (
          <img src={cover} alt={`《${book.bookName}》封面`} />
        ) : (
          <div className={css.bookCardCoverFallback}>
            <span className={css.bookCardCoverTitle}>{book.bookName.slice(0, 4)}</span>
            <span className={css.meta}>暂无封面</span>
          </div>
        )}
      </div>
      <div className={css.bookCardBody}>
        <div className={css.bookCardTitleRow}>
          <span className={css.bookCardName}>{book.bookName}</span>
          <span className={`${css.badge} ${book.hasProject ? (book.total > 0 && book.done >= book.total ? css.badgeDone : css.badgeWritten) : css.badgePending}`}>
            {statusLabel}
          </span>
        </div>
        <span className={`${css.meta} ${css.bookCardBlurb}`} title={book.blurb ?? ''}>
          {book.blurb !== undefined && book.blurb !== '' ? book.blurb : '暂无简介'}
        </span>
        <div className={css.bookCardProgressBar}>
          <div className={css.bookCardProgressFill} style={{ width: `${Math.round(ratio * 100)}%` }} />
        </div>
        <span className={css.meta}>{book.total > 0 ? `已完成 ${book.done} / ${book.total} 章` : '尚未规划章节'}</span>
      </div>
    </div>
  )
}

/** 书架首页。 */
export function ShelfView({
  api,
  shelf,
  onOpenBook,
  onAddBook,
}: {
  api: NovelApi
  shelf: BookshelfSnapshot
  /** 点击书卡：激活该书并进入工作台。 */
  onOpenBook: (id: string) => void
  /** 点击＋：进入开书向导页。 */
  onAddBook: () => void
}) {
  return (
    <div className={css.shelfView}>
      <div className={css.shelfHeader}>
        <h2 className={css.panelTitle} style={{ margin: 0 }}>📚 书架</h2>
        <span className={css.meta}>选择一本书进入工作台，或开一本新书</span>
      </div>

      <div className={css.shelfGrid}>
        {shelf.books.map(book => (
          <BookCard
            key={book.id}
            api={api}
            book={book}
            active={book.id === shelf.activeBookId}
            onOpen={() => { onOpenBook(book.id) }}
          />
        ))}

        {/* 开书入口：进入独立向导页 */}
        <div className={`${css.bookCard} ${css.bookAddCard}`} onClick={onAddBook}>
          <div className={css.bookAddIcon}>＋</div>
          <span>开一本新书</span>
          <span className={css.meta}>书名 + 大纲，开书即建项目</span>
        </div>
      </div>
    </div>
  )
}
