import type { NovelApi } from '../api.ts';
import type { BookshelfSnapshot } from '../../protocol.ts';
/** 书架首页。 */
export declare function ShelfView({ api, shelf, onOpenBook, onReadBook, onAddBook, }: {
    api: NovelApi;
    shelf: BookshelfSnapshot;
    /** 点击书卡：激活该书并进入工作台。 */
    onOpenBook: (id: string) => void;
    /** 点击「阅读」：激活该书并进入沉浸式阅读页。 */
    onReadBook: (id: string) => void;
    /** 点击＋：进入开书向导页。 */
    onAddBook: () => void;
}): import("react").JSX.Element;
