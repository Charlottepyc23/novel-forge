import type { NovelApi } from '../api.ts';
import type { ChapterPlan, ProjectState } from '../../protocol.ts';
export declare function MangaWorkspace({ api, project, chapters, onProjectChanged, imageApiEnabled, onProgress, }: {
    api: NovelApi;
    project: ProjectState | null;
    chapters: ChapterPlan[];
    /** 方案/资产变更已持久化后触发（刷新项目）。 */
    onProjectChanged?: () => void | Promise<void>;
    /** 是否启用豆包生图。 */
    imageApiEnabled?: boolean;
    /** 上报到「工作进度」控制台（漫剧工作台内所有 LLM/方案操作）。 */
    onProgress?: (text: string, kind?: 'info' | 'done' | 'error') => void;
}): import("react").JSX.Element;
