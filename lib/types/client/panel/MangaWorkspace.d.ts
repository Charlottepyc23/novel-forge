import type { NovelApi } from '../api.ts';
import type { ChapterPlan, ProjectState } from '../../protocol.ts';
export declare function MangaWorkspace({ api, project, chapters, onProjectChanged, }: {
    api: NovelApi;
    project: ProjectState | null;
    chapters: ChapterPlan[];
    /** 方案变更已持久化后触发（刷新项目）。 */
    onProjectChanged?: () => void | Promise<void>;
}): import("react").JSX.Element;
