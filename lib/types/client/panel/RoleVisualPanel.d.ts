import type { NovelApi } from '../api.ts';
import type { ProjectState } from '../../protocol.ts';
export declare function RoleVisualPanel({ api, project, refresh, styleId, filterId, imageApiEnabled, onGotoRoles, onProgress, }: {
    api: NovelApi;
    project: ProjectState | null;
    refresh: () => void | Promise<void>;
    styleId?: string;
    filterId?: string;
    imageApiEnabled?: boolean;
    onGotoRoles?: () => void;
    /** 上报到「工作进度」控制台（角色形象页 / 漫剧工作台共用）。 */
    onProgress?: (text: string, kind?: 'info' | 'done' | 'error') => void;
}): import("react").JSX.Element;
