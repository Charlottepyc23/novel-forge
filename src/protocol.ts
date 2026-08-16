/**
 * dsh-novel-forge — shared protocol between the host half (Node) and the
 * browser half (web GUI). Route paths, request/response shapes, the project
 * state file format, and the NDJSON generation stream frames all live here so
 * both halves spell exactly one vocabulary.
 */

/** The /api/dsh-novel-forge route family (same-origin, loopback-fenced). */
export const NOVEL_API = {
  status: '/api/dsh-novel-forge/status',
  loadOutline: '/api/dsh-novel-forge/load-outline',
  saveOutline: '/api/dsh-novel-forge/save-outline',
  plan: '/api/dsh-novel-forge/plan',
  volumes: '/api/dsh-novel-forge/volumes',
  bible: '/api/dsh-novel-forge/bible',
  assets: '/api/dsh-novel-forge/assets',
  styleEngine: '/api/dsh-novel-forge/style-engine',
  generate: '/api/dsh-novel-forge/generate',
  review: '/api/dsh-novel-forge/review',
  rewrite: '/api/dsh-novel-forge/rewrite',
  polish: '/api/dsh-novel-forge/polish',
  /** 采纳待确认草稿（润色/重写产物）覆盖正文文件。 */
  draftApply: '/api/dsh-novel-forge/draft/apply',
  /** 放弃待确认草稿，保留原稿。 */
  draftDiscard: '/api/dsh-novel-forge/draft/discard',
  summary: '/api/dsh-novel-forge/summary',
  foreshadow: '/api/dsh-novel-forge/foreshadow',
  exportBook: '/api/dsh-novel-forge/export',
  chapter: '/api/dsh-novel-forge/chapter',
  /** 审查任意正文文本（作者手动编辑后，不落盘）。 */
  chapterCheck: '/api/dsh-novel-forge/chapter/check',
  /** 保存手动编辑的正文（自动备份 .bak）。 */
  chapterSave: '/api/dsh-novel-forge/chapter/save',
  assistant: '/api/dsh-novel-forge/assistant',
  assistantHistory: '/api/dsh-novel-forge/assistant-history',
  /** 清空助手对话记录。 */
  assistantClear: '/api/dsh-novel-forge/assistant/clear',
  bookshelf: '/api/dsh-novel-forge/bookshelf',
  /** 重置项目（可选携带新大纲）：清空设定/卷/章节/伏笔/资产/事实库。 */
  reset: '/api/dsh-novel-forge/reset',
  /** 全书一致性质检：LLM 扫描已生成章节，输出矛盾问题清单。 */
  audit: '/api/dsh-novel-forge/audit',
  /** 角色卡刷新：基于事实库与各章摘要聚合角色当前状态。 */
  charactersRefresh: '/api/dsh-novel-forge/characters/refresh',
  /** 事实库回填：对历史已生成章节批量抽取事实（旧章节无事实记录时用）。 */
  factsBackfill: '/api/dsh-novel-forge/facts/backfill',
  /** 设定圣经局部修补（如世界观规则编辑）。 */
  biblePatch: '/api/dsh-novel-forge/bible/patch',
  /** 小说简介：生成（AI）/补全（AI）/保存。 */
  blurb: '/api/dsh-novel-forge/blurb',
  /** 重命名当前书（同步项目与书架条目）。 */
  rename: '/api/dsh-novel-forge/rename',
  /** 大世界：AI 提炼 / 保存结构化数据（境界/区域/势力）。 */
  world: '/api/dsh-novel-forge/world',
  /** 封面：GET 读取（dataUrl）/ POST 上传或移除。 */
  cover: '/api/dsh-novel-forge/blurb/cover',
  config: '/api/dsh-novel-forge/config',
  openFolder: '/api/dsh-novel-forge/open-folder',
} as const

/** 书架：一本书的条目。 */
export interface BookEntry {
  /** 稳定 id。 */
  id: string
  /** 书名。 */
  bookName: string
  /** 该书输出目录（独立项目目录）。 */
  outputDir: string
  /** 创建时间。 */
  createdAt: string
  /** 最后活动时间。 */
  updatedAt: string
}

/** 书架快照（含每本书的进度摘要）。 */
export interface BookshelfSnapshot {
  books: Array<BookEntry & { done: number; total: number; hasProject: boolean; hasCover: boolean; blurb?: string }>
  /** 当前激活的书 id（无则 null）。 */
  activeBookId: string | null
}

/** POST /bookshelf 请求：创建新书。 */
export interface BookCreateRequest {
  bookName: string
  outputDir?: string
  /** 开书向导：创建时直接导入的大纲文本（提供则立即建立项目）。 */
  outline?: string
}

/** POST /reset 请求：重置项目（可选更新大纲）。 */
export interface ResetRequest {
  /** 新大纲文本；提供则替换 outline，否则保留原大纲。 */
  outline?: string
}

/** POST /bookshelf/activate 请求：切换当前书。 */
export interface BookActivateRequest {
  id: string
}

/** POST /bookshelf/remove 请求：移除书架条目。 */
export interface BookRemoveRequest {
  id: string
}

/** Chapter lifecycle states (the writing pipeline's state machine). */
export type ChapterStatus =
  | 'pending'      // planned, not started
  | 'generating'   // LLM writing right now
  | 'written'      // body on disk, awaiting review
  | 'reviewing'    // review in progress
  | 'approved'     // passed review (or user-approved)
  | 'rejected'     // review found problems
  | 'error'        // generation failed

/** One chapter in the plan. */
export interface ChapterPlan {
  /** 1-based chapter number (stable identity; files are named from it). */
  no: number
  /** Volume this chapter belongs to (1-based; 0 = unassigned). */
  volume: number
  /** Chapter title, decided by the LLM plan step. */
  title: string
  /** Story beats / plot points for this chapter (model-facing guidance). */
  beats: string
  /** Target character count (defaults to the configured chapter size). */
  targetChars: number
  /** Generation/review state. */
  status: ChapterStatus
  /** Actual character count once generated. */
  chars?: number
  /** Failure message when status is 'error'. */
  error?: string
  /** Output file name once generated (relative to the output dir). */
  file?: string
  /** LLM summary of the chapter (narrative memory for later chapters). */
  summary?: string
  /** Latest review report (present once reviewed). */
  review?: ReviewReport
  /**
   * 待确认草稿：润色（去AI味）或整章重写的产物正文。生成时先存这里，
   * 用户看过对比后点「采纳」才覆盖正文文件；点「放弃」则丢弃。刷新页面不丢失。
   */
  pendingDraft?: string
}

/** One review finding. */
export interface ReviewIssue {
  /** Severity: high = must fix, medium = should fix, low = suggestion. */
  severity: 'high' | 'medium' | 'low'
  /** What the problem is. */
  item: string
  /** Concrete suggestion for fixing it. */
  suggestion: string
}

/** AI review report for one chapter. */
export interface ReviewReport {
  /** Overall score 0-100. */
  score: number
  /** Pass threshold (config; 70 default). */
  passed: boolean
  /** One-line verdict. */
  verdict: string
  /** Individual findings. */
  issues: ReviewIssue[]
  /** When the review ran. */
  reviewedAt: string
}

/** A volume of the book. */
export interface Volume {
  /** 1-based volume number. */
  no: number
  /** Volume title. */
  title: string
  /** Volume positioning / summary. */
  summary: string
  /** First chapter number of this volume. */
  chapterStart: number
  /** Last chapter number (inclusive). */
  chapterEnd: number
}

/** A character card from the story bible. */
export interface CharacterCard {
  name: string
  role: 'protagonist' | 'supporting' | 'antagonist' | 'other'
  /** Personality / traits (short lines). */
  traits: string[]
  /** Goals and motivations. */
  goals: string
  /** Key relations to other characters. */
  relations: string
}

/** The structured story bible (worldbuilding extracted from the outline). */
export interface StoryBible {
  /** Genre + tone tags. */
  genre: string
  /** Worldbuilding rules (power system, geography, factions...). */
  worldRules: string[]
  /** Character cards. */
  characters: CharacterCard[]
  /** Writing red lines (forbidden content / must-avoid tropes). */
  redLines: string[]
  /** Style guidance (pacing, pov, tone). */
  style: string[]
  /** When the bible was generated. */
  generatedAt?: string
}

/** A planted/active/resolved foreshadowing thread. */
export interface Foreshadow {
  /** Stable id. */
  id: string
  /** What the foreshadow is. */
  description: string
  /** Chapter where it was planted (undefined = planned). */
  plantedChapter?: number
  /** Chapter where it should be paid off. */
  targetChapter?: number
  /** Lifecycle state. */
  status: 'planned' | 'planted' | 'progressing' | 'resolved' | 'abandoned'
  /** Resolution note when resolved. */
  resolvedNote?: string
}

/** 一条已确立的叙事事实（事实库/时间线，注入后续章节生成）。 */
export interface ChapterFact {
  /** 来源章节号。 */
  chapterNo: number
  /** 事实文本（人物状态/境界资源/关系变化/伏笔落地等）。 */
  text: string
}

/** 一条全书质检发现的问题（一致性矛盾，定位到章）。 */
export interface AuditIssue {
  /** 问题所在章节号（无法定位时 0）。 */
  chapterNo: number
  severity: 'high' | 'medium' | 'low'
  /** 矛盾描述。 */
  item: string
  /** 修改建议。 */
  suggestion: string
}

/** POST /audit 响应。 */
export interface AuditResponse {
  issues: AuditIssue[]
  /** 参与质检的章节数。 */
  auditedChapters: number
  /** 质检时间。 */
  auditedAt: string
}

/** 角色卡：角色当前状态（从事实库聚合）。 */
export interface RoleStatusCard {
  name: string
  /** protagonist / supporting / antagonist / other。 */
  role: string
  /** 当前状态一句话（境界/资源/伤势/心境）。 */
  status: string
  /** 最近出场章节。 */
  lastChapter: number
  /** 出场次数。 */
  appearances: number
}

/** POST /bible/patch 请求：局部修补设定圣经。 */
export interface BiblePatchRequest {
  worldRules?: string[]
  redLines?: string[]
  style?: string[]
}

/** POST /blurb 请求：AI 生成/补全或手动保存小说简介。 */
export interface BlurbRequest {
  action: 'generate' | 'save'
  /** 已写好的开头（AI 补全时使用；留空 = 全量生成）。 */
  partial?: string
  /** 手动保存的完整简介（action=save 时）。 */
  text?: string
}

/** POST /chapter/check|save 请求：审查/保存手动编辑的正文。 */
export interface ChapterTextRequest {
  chapterNo: number
  /** 当前编辑中的正文全文。 */
  text: string
  /** 保存时携带：已在工作区审查过的报告（沿用落盘，不重复审）；缺省则保存后自动正式审稿一次。 */
  report?: ReviewReport
}

/** POST /chapter/save 响应。 */
export interface ChapterSaveResponse {
  ok: boolean
  chars: number
  file: string
  /** 落盘的审稿报告（沿用工作区报告或保存后自动审稿）。 */
  report?: ReviewReport
}

/** POST /cover 请求：上传或移除封面。 */
export interface CoverRequest {
  action: 'upload' | 'remove'
  /** 上传时：data:image/...;base64,... 格式的图片数据。 */
  dataUrl?: string
}

/** POST /rename 请求：重命名当前书。 */
export interface RenameRequest {
  bookName: string
}

/** 大世界：一个境界等级。 */
export interface WorldRealm {
  /** 境界名（练气/筑基/金丹…）。 */
  name: string
  /** 描述：突破条件/寿命/标志等。 */
  description: string
}

/** 大世界：一个地理区域。 */
export interface WorldRegion {
  name: string
  description: string
  /** 关联势力名（可空）。 */
  faction?: string
}

/** 大世界：一方势力。 */
export interface WorldFaction {
  name: string
  /** 类型：宗门/家族/王朝/组织… */
  kind: string
  description: string
  /** 驻地区域（可空）。 */
  region?: string
}

/** 大世界结构化数据。 */
export interface WorldState {
  realms: WorldRealm[]
  regions: WorldRegion[]
  factions: WorldFaction[]
}

/** POST /world 请求：AI 提炼或手动保存。 */
export interface WorldRequest {
  action: 'generate' | 'save'
  /** action=save 时的完整世界数据。 */
  world?: WorldState
}

/** GET /cover 响应：封面的 dataUrl（无封面为 null）。 */
export interface CoverResponse {
  dataUrl: string | null
}

/** The persisted project: outline + bible + plan + progress. */
export interface ProjectState {
  /** Book title (first non-empty line of the outline, usually). */
  bookName: string
  /** Full outline text (docx-extracted or pasted). */
  outline: string
  /** Source outline path when loaded from a docx. */
  outlinePath?: string
  /** Structured story bible (worldbuilding), if generated. */
  bible?: StoryBible
  /** Volumes, if planned. */
  volumes?: Volume[]
  /** Chapter plan. */
  chapters: ChapterPlan[]
  /** Foreshadowing threads. */
  foreshadows: Foreshadow[]
  /** 写作资产（题材基底/推进模式/反AI规则/写法资产）。 */
  assets?: ProjectAssets
  /** 事实库/时间线：每章生成后抽取，注入后续章节保持一致性。 */
  facts?: ChapterFact[]
  /** 小说简介（面向读者的作品门面，AI 生成或手动保存）。 */
  blurb?: string
  /** 封面文件名（相对输出目录，如 cover.png）。 */
  coverPath?: string
  /** 大世界结构化数据（境界体系/区域/势力）。 */
  world?: WorldState
  /** ISO timestamps. */
  createdAt: string
  updatedAt: string
}

/** Runtime config surface exposed to the panel (subset of plugin Config). */
export interface NovelConfig {
  /** Absolute path of the default docx outline to load. */
  outlinePath: string
  /** Absolute output directory for chapters + project state. */
  outputDir: string
  /** LLM provider route (e.g. deepseek-official). */
  provider: string
  /** LLM model id (e.g. deepseek-v4-flash). */
  model: string
  /** Target characters per chapter. */
  chapterChars: number
  /** Max output tokens per chapter call. */
  maxTokens: number
  /** Review pass threshold (0-100). */
  reviewPassScore: number
  /** Whether generation auto-runs review after writing. */
  autoReview: boolean
}

/** GET /status response. */
export interface StatusResponse {
  config: NovelConfig
  /** The persisted project, when one exists in the output dir. */
  project?: ProjectState
  /** Chapter files already on disk (basenames, sorted). */
  generatedFiles: string[]
}

/** POST /load-outline request: either a docx path or raw text. */
export interface LoadOutlineRequest {
  /** Absolute docx path; defaults to the configured outline path. */
  path?: string
  /** Raw outline text (takes precedence over path when present). */
  text?: string
}

/** POST /load-outline response. */
export interface LoadOutlineResponse {
  outline: string
  bookName: string
  chars: number
  path?: string
}

/** POST /plan request. */
export interface PlanRequest {
  /** Outline to plan from; defaults to the persisted project's outline. */
  outline?: string
  /** Number of chapters to plan (default: 30). */
  chapterCount?: number
  /** Volume to plan (1-based); when given, plans only that volume's chapters. */
  volume?: number
}

/** POST /plan response. */
export interface PlanResponse {
  chapters: ChapterPlan[]
  volumes?: Volume[]
}

/** POST /volumes request/response. */
export interface VolumesRequest {
  /** Outline to split into volumes; defaults to the project outline. */
  outline?: string
}
export interface VolumesResponse {
  volumes: Volume[]
}

/** POST /bible request/response. */
export interface BibleRequest {
  /** Outline to extract from; defaults to the project outline. */
  outline?: string
}
export interface BibleResponse {
  bible: StoryBible
}

/** POST /generate request: one chapter of the current project. */
export interface GenerateRequest {
  chapterNo: number
  /** When true, skips the auto-review step. */
  skipReview?: boolean
}

/** One NDJSON frame of a generation/review/rewrite stream. */
export type JobFrame =
  | { type: 'start'; no: number; title: string }
  | { type: 'delta'; text: string }
  | { type: 'progress'; chars: number }
  | { type: 'done'; no: number; file: string; chars: number; title: string }
  | { type: 'review'; no: number; report: ReviewReport }
  | { type: 'rewritten'; no: number; file: string; chars: number }
  /** 润色/重写完成，产物作为待确认草稿（尚未覆盖正文）。 */
  | { type: 'drafted'; no: number; chars: number; draft: string }
  | { type: 'error'; no: number; message: string }

/** POST /review request: review one written chapter. */
export interface ReviewRequest {
  chapterNo: number
}

/** POST /rewrite request: rewrite one chapter (optionally per review issues). */
export interface RewriteRequest {
  chapterNo: number
  /** Free-form instructions; defaults to fixing the review's high issues. */
  instructions?: string
  /**
   * 局部修订：正文中的一段原文（无需完全精确，取一个自然段内的片段即可）。
   * 提供时只重写该段，其余正文保持不变；不提供时整章重写。
   */
  target?: string
}

/** POST /polish request: de-AI-ify one chapter. */
export interface PolishRequest {
  chapterNo: number
}

/** POST /draft/apply | /draft/discard request: 采纳或放弃待确认草稿。 */
export interface DraftDecisionRequest {
  chapterNo: number
}

/** POST /summary request: (re)generate a chapter summary. */
export interface SummaryRequest {
  chapterNo: number
}

/** POST /foreshadow request: create, update, or AI-suggest foreshadows. */
export interface ForeshadowRequest {
  /** When true, runs the LLM suggestion pass (ignores other fields). */
  suggest?: boolean
  /** When given, updates that foreshadow instead of creating one. */
  id?: string
  description?: string
  plantedChapter?: number
  targetChapter?: number
  status?: Foreshadow['status']
  resolvedNote?: string
}
export interface ForeshadowResponse {
  foreshadows: Foreshadow[]
}

/** GET /chapter response. */
export interface ChapterResponse {
  no: number
  title: string
  markdown: string
}

/** POST /export request/response. */
export interface ExportRequest {
  format: 'txt' | 'md'
}
export interface ExportResponse {
  file: string
  chars: number
  chapters: number
}

/** POST /config request: patch any subset of the runtime config. */
export interface ConfigPatch {
  outlinePath?: string
  outputDir?: string
  provider?: string
  model?: string
  chapterChars?: number
  maxTokens?: number
  reviewPassScore?: number
  autoReview?: boolean
}

// ------------------------------------------------------------ assistant

/** One assistant conversation message (persisted per project). */
export interface AssistantMessage {
  role: 'user' | 'assistant' | 'tool'
  /** Message text (tool messages carry the tool result). */
  content: string
  /** ISO timestamp. */
  ts: string
  /** For tool messages: which tool ran. */
  tool?: string
}

/** POST /assistant request: one user turn. */
export interface AssistantRequest {
  message: string
}

/** One NDJSON frame of the assistant stream. */
export type AssistantFrame =
  | { type: 'delta'; text: string }
  | { type: 'tool'; name: string; status: 'start' | 'done' | 'error'; detail?: string }
  /** Live output while a tool runs (e.g. chapter text being generated). */
  | { type: 'toolDelta'; name: string; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

/** GET /assistant-history response. */
export interface AssistantHistoryResponse {
  messages: AssistantMessage[]
}

// ---------------------------------------------------------- writing assets

/** 题材基底库：一本书属于哪个阅读市场。树形（题材→子题材→下级）。 */
export interface GenreNode {
  /** 题材名称（标签，如「仙侠修真」「都市异能」）。 */
  name: string
  /** 题材特征、常见爽点、叙事重心或读者期待。 */
  description: string
  /** 子题材。 */
  children: GenreNode[]
}

/** 推进模式库：读者为什么继续看下一章。 */
export interface ProgressionMode {
  /** 模式名称（如「升级变强」「经营扩张」「解谜揭露」）。 */
  name: string
  /** 核心驱动力：靠什么制造追读动力。 */
  driver: string
  /** 读者期待：每隔几章获得什么变化或回报。 */
  readerExpectation: string
  /** 常见兑现方式（爽点如何落地）。 */
  payoffs: string[]
  /** 节奏风险：最怕什么（重复升级、冲突变弱、谜题拖太久…）。 */
  risks: string[]
  /** 主模式或辅助模式。 */
  primary: boolean
}

/** 反 AI 规则：一条「要避免的问题 + 修正方向」。 */
export interface AntiAiRule {
  /** 规则名（如「禁止解释型心理描写」「AI 高频套话」）。 */
  name: string
  /** 要避免的表达问题，具体可检查。 */
  avoid: string
  /** 推荐修正方向。 */
  fix: string
  /** 命中即告警的具体表达模式（用于审稿逐条核对与去 AI 味检测）。 */
  detectPatterns?: string[]
  /** 是否内置全局规则（内置规则随插件发布，项目规则为用户自定义）。 */
  builtin?: boolean
}

/** 预置写法模板（来自 AI-Novel-Writing-Assistant 内置数据，一键绑定无需样本文本）。 */
export interface StyleTemplate {
  /** 模板 key（如 power-up-escalation）。 */
  key: string
  /** 模板名（如「爽文递进推进流」）。 */
  name: string
  /** 模板说明。 */
  description: string
  /** 分类（如「爽文流」「悬疑流」）。 */
  category: string
  /** 适用题材。 */
  applicableGenres: string[]
  /** 叙述规则。 */
  proseRules: string[]
  /** 角色/台词规则。 */
  dialogueRules: string[]
  /** 语言规则。 */
  languageRules: string[]
  /** 节奏规则。 */
  rhythmRules: string[]
  /** 该模板默认绑定的反 AI 规则 key（内置规则名）。 */
  defaultAntiAiRuleKeys: string[]
}

/** 写法引擎：从样本文本提取的叙事风格资产。 */
export interface StyleAsset {
  /** 资产名（如「林越式痞坏」「冷峻猎手风」）。 */
  name: string
  /** 叙述视角与句式节奏。 */
  proseRules: string[]
  /** 角色台词风格。 */
  dialogueRules: string[]
  /** 描写密度与情绪表达。 */
  descriptionRules: string[]
  /** 表达边界（不要做什么）。 */
  boundaries: string[]
  /** 来源样本文本（可空）。 */
  sourceText?: string
  /** 创建时间。 */
  createdAt: string
}

/** 项目写作资产（题材基底 + 推进模式 + 反 AI 规则 + 写法资产）。 */
export interface ProjectAssets {
  /** 本书选用的题材（可以是题材基底库中某节点名）。 */
  genre?: GenreNode
  /** 主推进模式。 */
  primaryProgression?: ProgressionMode
  /** 辅助推进模式。 */
  auxiliaryProgressions: ProgressionMode[]
  /** 生效的反 AI 规则（内置 + 自定义）。 */
  antiAiRules: AntiAiRule[]
  /** 绑定的写法资产。 */
  styleAssets: StyleAsset[]
  /** 资产更新时间。 */
  updatedAt?: string
}

/** GET /assets response（含全局题材库与反 AI 规则库）。 */
export interface AssetsResponse {
  projectAssets: ProjectAssets
  /** 全局题材基底库（可复用资产，跨书）。 */
  genreLibrary: GenreNode[]
  /** 全局反 AI 规则库（内置默认规则）。 */
  antiAiLibrary: AntiAiRule[]
  /** 预置写法模板（一键绑定，无需样本文本）。 */
  styleTemplates: StyleTemplate[]
  /** 内置推进模式候选。 */
  progressionLibrary: ProgressionMode[]
}

/** POST /assets request：更新项目写作资产（部分字段可选）。 */
export interface AssetsPatch {
  genre?: GenreNode
  primaryProgression?: ProgressionMode
  auxiliaryProgressions?: ProgressionMode[]
  antiAiRules?: AntiAiRule[]
  styleAssets?: StyleAsset[]
}

/** POST /style-engine request：从样本文本提取写法资产。 */
export interface StyleEngineRequest {
  /** 样本文本（风格来源）。 */
  sampleText: string
  /** 资产名（可选，默认「风格资产 N」）。 */
  name?: string
}
