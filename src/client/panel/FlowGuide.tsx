/**
 * 漫剧工作台·全流程步骤条（唯一导航，方案X）：
 * ①创建方案 → ②视觉规则 → ③剧情骨架 → ④分镜表 → ⑤导入角色 → ⑥角色定妆 → ⑦视频提示词 → ⑧场景库 → ⑨导出使用。
 * 每个步骤对应一个独立页面主体；完成度自动判定（读 project 现有字段）。
 */
import type { ProjectState } from '../../protocol.ts'
import css from './panel.module.css'

/** 步骤 → 页面主体的一一对应目标。 */
export type FlowTarget =
  | 'plan'      // ① 创建方案页
  | 'rules'     // ② 视觉规则页
  | 'skeleton'  // ③ 剧情骨架页（分镜·骨架）
  | 'table'     // ④ 分镜表页（分镜·分镜表）
  | 'import'    // ⑤ 导入角色页（角色·导入）
  | 'makeup'    // ⑥ 角色定妆页（角色·卡片）
  | 'prompts'   // ⑦ 视频提示词页（分镜·提示词）
  | 'scenes'    // ⑧ 场景库页
  | 'export'    // ⑨ 导出使用页

export interface FlowStep {
  no: number
  label: string
  hint: string
  done: boolean
  target: FlowTarget
}

/** 依据 project 数据计算 9 步完成度（与存储顺序无关，按生产顺序排列）。 */
export function computeFlowSteps(project: ProjectState | null): FlowStep[] {
  const plans = project?.mangaPlans ?? []
  const rules = project?.visualRules ?? []
  const sbs = project?.storyboards ?? []
  const manga = project?.mangaRoles ?? []
  const scenes = project?.scenes ?? []
  const hasSkeleton = sbs.some(e => e.skeleton !== undefined)
  const hasTable = sbs.some(e => e.table !== undefined)
  const hasPrompts = sbs.some(e => (e.prompts ?? []).length > 0)
  return [
    { no: 1, label: '创建方案', hint: '选基底风格+可选滤镜并命名；此后所有提示词按此风格生成', done: plans.length > 0, target: 'plan' },
    { no: 2, label: '视觉规则', hint: '从道藏提炼 3-6 条视觉世界观规则，自动注入所有生图/生视频提示词', done: rules.length > 0, target: 'rules' },
    { no: 3, label: '剧情骨架', hint: '分镜①：本章弧线+节拍链+出场角色（characters 提名地基）', done: hasSkeleton, target: 'skeleton' },
    { no: 4, label: '分镜表', hint: '分镜②：骨架展开为镜头级画面（景别/机位/台词/每镜头角色）', done: hasTable, target: 'table' },
    { no: 5, label: '导入角色', hint: '从本集分镜提名→小说库匹配（规则+LLM 两段式）→导入为漫剧卡', done: manga.length > 0, target: 'import' },
    { no: 6, label: '角色定妆', hint: '生成形象锚点→精修提示词→上传/生成定妆图（status=已定妆）', done: manga.some(c => c.status === 'anchored'), target: 'makeup' },
    { no: 7, label: '视频提示词', hint: '分镜③：每镜头一段即梦可粘贴提示词，带风格词块与定妆绑定', done: hasPrompts, target: 'prompts' },
    { no: 8, label: '场景库', hint: '（选做）从正文提炼场景卡并采纳，分镜表会标注使用场景', done: scenes.length > 0, target: 'scenes' },
    { no: 9, label: '导出使用', hint: '复制提示词到即梦/豆包/ComfyUI 出图生视频；定妆卡按 mangaRoleIds 绑定参考图', done: hasPrompts, target: 'export' },
  ]
}

export function FlowGuide({
  project,
  onNavigate,
}: {
  project: ProjectState | null
  onNavigate: (target: FlowTarget) => void
}) {
  const steps = computeFlowSteps(project)
  const doneCount = steps.filter(s => s.done).length
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-6)', marginTop: 'var(--nf-space-8)' }}>
      <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span className={css.meta}>🧭 全流程（{doneCount}/{steps.length}）：每步一个页面，完成自动打勾</span>
        <span className={css.meta}>点击步骤打开对应页面</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--nf-space-6)' }}>
        {steps.map(s => (
          <button
            key={s.no}
            type="button"
            title={s.hint}
            className={css.button + ' ' + css.buttonSmall + (s.done ? ' ' + css.buttonPrimary : '')}
            style={{ minWidth: 0 }}
            onClick={() => { onNavigate(s.target) }}
          >
            {s.done ? '✓ ' : s.no + '. '}{s.label}
          </button>
        ))}
      </div>
    </div>
  )
}
