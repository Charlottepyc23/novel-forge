import type { NovelApi } from '../api.ts';
import type { PanelController } from './controller.ts';
/** The panel's tab identifiers. */
export type NovelTab = 'workflow' | 'overview' | 'plan' | 'bible' | 'foreshadow' | 'assistant' | 'settings' | 'characters' | 'assetsGenre' | 'assetsProgression' | 'assetsTemplates' | 'assetsRules' | 'assetsStyle';
/** Panel shell props. */
export interface NovelPanelProps {
    /** The panel state owner (open/close/toggle). */
    controller: PanelController;
    /** The API client every tab operates through. */
    api: NovelApi;
}
/** The novel-forge panel. */
export declare function NovelPanel({ controller, api }: NovelPanelProps): import("react").JSX.Element;
