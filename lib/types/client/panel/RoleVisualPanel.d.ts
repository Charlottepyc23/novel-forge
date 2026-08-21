import type { NovelApi } from '../api.ts';
import type { ImageModelConfig, ProjectState } from '../../protocol.ts';
export declare function RoleVisualPanel({ api, project, refresh, styleId, filterId, imageApiEnabled, imageModels, onGotoRoles, onProgress, }: {
    api: NovelApi;
    project: ProjectState | null;
    refresh: () => void | Promise<void>;
    styleId?: string;
    filterId?: string;
    imageApiEnabled?: boolean;
    /** 生图模型库（AI 生图时可选择用哪条）。 */
    imageModels?: ImageModelConfig[];
    onGotoRoles?: () => void;
    /** 上报到「AI进度」控制台（角色形象页 / 漫剧工作台共用）。 */
    onProgress?: (text: string, kind?: 'info' | 'done' | 'error') => void;
}): import("react").JSX.Element;
