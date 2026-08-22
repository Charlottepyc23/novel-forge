/**
 * 漫剧工作台·全流程步骤条（唯一导航，方案X）：
 * ①创建方案 → ②视觉规则 → ③剧情骨架 → ④分镜表 → ⑤导入角色 → ⑥角色定妆 → ⑦视频提示词 → ⑧场景库 → ⑨导出使用。
 * 每个步骤对应一个独立页面主体；完成度自动判定（读 project 现有字段）。
 */
import type { ProjectState } from '../../protocol.ts';
/** 步骤 → 页面主体的一一对应目标。 */
export type FlowTarget = 'plan' | 'rules' | 'skeleton' | 'table' | 'import' | 'makeup' | 'prompts' | 'scenes' | 'export';
export interface FlowStep {
    no: number;
    label: string;
    hint: string;
    done: boolean;
    target: FlowTarget;
}
/** 依据 project 数据计算 9 步完成度（与存储顺序无关，按生产顺序排列）。 */
export declare function computeFlowSteps(project: ProjectState | null): FlowStep[];
export declare function FlowGuide({ project, onNavigate, }: {
    project: ProjectState | null;
    onNavigate: (target: FlowTarget) => void;
}): import("react").JSX.Element;
