import type { NovelApi } from '../api.ts';
import type { ChapterPlan, ProjectState } from '../../protocol.ts';
export declare function StoryboardTab({ api, project, chapters, onProjectChanged, styleId, filterId, }: {
    api: NovelApi;
    project: ProjectState | null;
    chapters: ChapterPlan[];
    /** 生成成功且已持久化后触发（刷新项目，切章/重进可恢复）。 */
    onProjectChanged?: () => void | Promise<void>;
    /** 漫剧基底风格 id（画面措辞随风格）。 */
    styleId?: string;
    /** 可选滤镜风格 id。 */
    filterId?: string;
}): import("react").JSX.Element;
