/**
 * dsh-novel-forge — shared protocol between the host half (Node) and the
 * browser half (web GUI). Route paths, request/response shapes, the project
 * state file format, and the NDJSON generation stream frames all live here so
 * both halves spell exactly one vocabulary.
 */
/** The /api/dsh-novel-forge route family (same-origin, loopback-fenced). */
export declare const NOVEL_API: {
    readonly status: "/api/dsh-novel-forge/status";
    readonly loadOutline: "/api/dsh-novel-forge/load-outline";
    readonly saveOutline: "/api/dsh-novel-forge/save-outline";
    readonly plan: "/api/dsh-novel-forge/plan";
    readonly volumes: "/api/dsh-novel-forge/volumes";
    readonly bible: "/api/dsh-novel-forge/bible";
    readonly assets: "/api/dsh-novel-forge/assets";
    readonly styleEngine: "/api/dsh-novel-forge/style-engine";
    readonly generate: "/api/dsh-novel-forge/generate";
    readonly review: "/api/dsh-novel-forge/review";
    readonly rewrite: "/api/dsh-novel-forge/rewrite";
    readonly polish: "/api/dsh-novel-forge/polish";
    readonly summary: "/api/dsh-novel-forge/summary";
    readonly foreshadow: "/api/dsh-novel-forge/foreshadow";
    readonly exportBook: "/api/dsh-novel-forge/export";
    readonly chapter: "/api/dsh-novel-forge/chapter";
    readonly assistant: "/api/dsh-novel-forge/assistant";
    readonly assistantHistory: "/api/dsh-novel-forge/assistant-history";
    readonly bookshelf: "/api/dsh-novel-forge/bookshelf";
    readonly config: "/api/dsh-novel-forge/config";
    readonly openFolder: "/api/dsh-novel-forge/open-folder";
};
/** 书架：一本书的条目。 */
export interface BookEntry {
    /** 稳定 id。 */
    id: string;
    /** 书名。 */
    bookName: string;
    /** 该书输出目录（独立项目目录）。 */
    outputDir: string;
    /** 创建时间。 */
    createdAt: string;
    /** 最后活动时间。 */
    updatedAt: string;
}
/** 书架快照（含每本书的进度摘要）。 */
export interface BookshelfSnapshot {
    books: Array<BookEntry & {
        done: number;
        total: number;
        hasProject: boolean;
    }>;
    /** 当前激活的书 id（无则 null）。 */
    activeBookId: string | null;
}
/** POST /bookshelf 请求：创建新书。 */
export interface BookCreateRequest {
    bookName: string;
    outputDir?: string;
}
/** POST /bookshelf/activate 请求：切换当前书。 */
export interface BookActivateRequest {
    id: string;
}
/** POST /bookshelf/remove 请求：移除书架条目。 */
export interface BookRemoveRequest {
    id: string;
}
/** Chapter lifecycle states (the writing pipeline's state machine). */
export type ChapterStatus = 'pending' | 'generating' | 'written' | 'reviewing' | 'approved' | 'rejected' | 'error';
/** One chapter in the plan. */
export interface ChapterPlan {
    /** 1-based chapter number (stable identity; files are named from it). */
    no: number;
    /** Volume this chapter belongs to (1-based; 0 = unassigned). */
    volume: number;
    /** Chapter title, decided by the LLM plan step. */
    title: string;
    /** Story beats / plot points for this chapter (model-facing guidance). */
    beats: string;
    /** Target character count (defaults to the configured chapter size). */
    targetChars: number;
    /** Generation/review state. */
    status: ChapterStatus;
    /** Actual character count once generated. */
    chars?: number;
    /** Failure message when status is 'error'. */
    error?: string;
    /** Output file name once generated (relative to the output dir). */
    file?: string;
    /** LLM summary of the chapter (narrative memory for later chapters). */
    summary?: string;
    /** Latest review report (present once reviewed). */
    review?: ReviewReport;
}
/** One review finding. */
export interface ReviewIssue {
    /** Severity: high = must fix, medium = should fix, low = suggestion. */
    severity: 'high' | 'medium' | 'low';
    /** What the problem is. */
    item: string;
    /** Concrete suggestion for fixing it. */
    suggestion: string;
}
/** AI review report for one chapter. */
export interface ReviewReport {
    /** Overall score 0-100. */
    score: number;
    /** Pass threshold (config; 70 default). */
    passed: boolean;
    /** One-line verdict. */
    verdict: string;
    /** Individual findings. */
    issues: ReviewIssue[];
    /** When the review ran. */
    reviewedAt: string;
}
/** A volume of the book. */
export interface Volume {
    /** 1-based volume number. */
    no: number;
    /** Volume title. */
    title: string;
    /** Volume positioning / summary. */
    summary: string;
    /** First chapter number of this volume. */
    chapterStart: number;
    /** Last chapter number (inclusive). */
    chapterEnd: number;
}
/** A character card from the story bible. */
export interface CharacterCard {
    name: string;
    role: 'protagonist' | 'supporting' | 'antagonist' | 'other';
    /** Personality / traits (short lines). */
    traits: string[];
    /** Goals and motivations. */
    goals: string;
    /** Key relations to other characters. */
    relations: string;
}
/** The structured story bible (worldbuilding extracted from the outline). */
export interface StoryBible {
    /** Genre + tone tags. */
    genre: string;
    /** Worldbuilding rules (power system, geography, factions...). */
    worldRules: string[];
    /** Character cards. */
    characters: CharacterCard[];
    /** Writing red lines (forbidden content / must-avoid tropes). */
    redLines: string[];
    /** Style guidance (pacing, pov, tone). */
    style: string[];
    /** When the bible was generated. */
    generatedAt?: string;
}
/** A planted/active/resolved foreshadowing thread. */
export interface Foreshadow {
    /** Stable id. */
    id: string;
    /** What the foreshadow is. */
    description: string;
    /** Chapter where it was planted (undefined = planned). */
    plantedChapter?: number;
    /** Chapter where it should be paid off. */
    targetChapter?: number;
    /** Lifecycle state. */
    status: 'planned' | 'planted' | 'progressing' | 'resolved' | 'abandoned';
    /** Resolution note when resolved. */
    resolvedNote?: string;
}
/** The persisted project: outline + bible + plan + progress. */
export interface ProjectState {
    /** Book title (first non-empty line of the outline, usually). */
    bookName: string;
    /** Full outline text (docx-extracted or pasted). */
    outline: string;
    /** Source outline path when loaded from a docx. */
    outlinePath?: string;
    /** Structured story bible (worldbuilding), if generated. */
    bible?: StoryBible;
    /** Volumes, if planned. */
    volumes?: Volume[];
    /** Chapter plan. */
    chapters: ChapterPlan[];
    /** Foreshadowing threads. */
    foreshadows: Foreshadow[];
    /** 写作资产（题材基底/推进模式/反AI规则/写法资产）。 */
    assets?: ProjectAssets;
    /** ISO timestamps. */
    createdAt: string;
    updatedAt: string;
}
/** Runtime config surface exposed to the panel (subset of plugin Config). */
export interface NovelConfig {
    /** Absolute path of the default docx outline to load. */
    outlinePath: string;
    /** Absolute output directory for chapters + project state. */
    outputDir: string;
    /** LLM provider route (e.g. deepseek-official). */
    provider: string;
    /** LLM model id (e.g. deepseek-v4-flash). */
    model: string;
    /** Target characters per chapter. */
    chapterChars: number;
    /** Max output tokens per chapter call. */
    maxTokens: number;
    /** Review pass threshold (0-100). */
    reviewPassScore: number;
    /** Whether generation auto-runs review after writing. */
    autoReview: boolean;
}
/** GET /status response. */
export interface StatusResponse {
    config: NovelConfig;
    /** The persisted project, when one exists in the output dir. */
    project?: ProjectState;
    /** Chapter files already on disk (basenames, sorted). */
    generatedFiles: string[];
}
/** POST /load-outline request: either a docx path or raw text. */
export interface LoadOutlineRequest {
    /** Absolute docx path; defaults to the configured outline path. */
    path?: string;
    /** Raw outline text (takes precedence over path when present). */
    text?: string;
}
/** POST /load-outline response. */
export interface LoadOutlineResponse {
    outline: string;
    bookName: string;
    chars: number;
    path?: string;
}
/** POST /plan request. */
export interface PlanRequest {
    /** Outline to plan from; defaults to the persisted project's outline. */
    outline?: string;
    /** Number of chapters to plan (default: 30). */
    chapterCount?: number;
    /** Volume to plan (1-based); when given, plans only that volume's chapters. */
    volume?: number;
}
/** POST /plan response. */
export interface PlanResponse {
    chapters: ChapterPlan[];
    volumes?: Volume[];
}
/** POST /volumes request/response. */
export interface VolumesRequest {
    /** Outline to split into volumes; defaults to the project outline. */
    outline?: string;
}
export interface VolumesResponse {
    volumes: Volume[];
}
/** POST /bible request/response. */
export interface BibleRequest {
    /** Outline to extract from; defaults to the project outline. */
    outline?: string;
}
export interface BibleResponse {
    bible: StoryBible;
}
/** POST /generate request: one chapter of the current project. */
export interface GenerateRequest {
    chapterNo: number;
    /** When true, skips the auto-review step. */
    skipReview?: boolean;
}
/** One NDJSON frame of a generation/review/rewrite stream. */
export type JobFrame = {
    type: 'start';
    no: number;
    title: string;
} | {
    type: 'delta';
    text: string;
} | {
    type: 'progress';
    chars: number;
} | {
    type: 'done';
    no: number;
    file: string;
    chars: number;
    title: string;
} | {
    type: 'review';
    no: number;
    report: ReviewReport;
} | {
    type: 'rewritten';
    no: number;
    file: string;
    chars: number;
} | {
    type: 'error';
    no: number;
    message: string;
};
/** POST /review request: review one written chapter. */
export interface ReviewRequest {
    chapterNo: number;
}
/** POST /rewrite request: rewrite one chapter (optionally per review issues). */
export interface RewriteRequest {
    chapterNo: number;
    /** Free-form instructions; defaults to fixing the review's high issues. */
    instructions?: string;
    /**
     * 局部修订：正文中的一段原文（无需完全精确，取一个自然段内的片段即可）。
     * 提供时只重写该段，其余正文保持不变；不提供时整章重写。
     */
    target?: string;
}
/** POST /polish request: de-AI-ify one chapter. */
export interface PolishRequest {
    chapterNo: number;
}
/** POST /summary request: (re)generate a chapter summary. */
export interface SummaryRequest {
    chapterNo: number;
}
/** POST /foreshadow request: create, update, or AI-suggest foreshadows. */
export interface ForeshadowRequest {
    /** When true, runs the LLM suggestion pass (ignores other fields). */
    suggest?: boolean;
    /** When given, updates that foreshadow instead of creating one. */
    id?: string;
    description?: string;
    plantedChapter?: number;
    targetChapter?: number;
    status?: Foreshadow['status'];
    resolvedNote?: string;
}
export interface ForeshadowResponse {
    foreshadows: Foreshadow[];
}
/** GET /chapter response. */
export interface ChapterResponse {
    no: number;
    title: string;
    markdown: string;
}
/** POST /export request/response. */
export interface ExportRequest {
    format: 'txt' | 'md';
}
export interface ExportResponse {
    file: string;
    chars: number;
    chapters: number;
}
/** POST /config request: patch any subset of the runtime config. */
export interface ConfigPatch {
    outlinePath?: string;
    outputDir?: string;
    provider?: string;
    model?: string;
    chapterChars?: number;
    maxTokens?: number;
    reviewPassScore?: number;
    autoReview?: boolean;
}
/** One assistant conversation message (persisted per project). */
export interface AssistantMessage {
    role: 'user' | 'assistant' | 'tool';
    /** Message text (tool messages carry the tool result). */
    content: string;
    /** ISO timestamp. */
    ts: string;
    /** For tool messages: which tool ran. */
    tool?: string;
}
/** POST /assistant request: one user turn. */
export interface AssistantRequest {
    message: string;
}
/** One NDJSON frame of the assistant stream. */
export type AssistantFrame = {
    type: 'delta';
    text: string;
} | {
    type: 'tool';
    name: string;
    status: 'start' | 'done' | 'error';
    detail?: string;
}
/** Live output while a tool runs (e.g. chapter text being generated). */
 | {
    type: 'toolDelta';
    name: string;
    text: string;
} | {
    type: 'done';
} | {
    type: 'error';
    message: string;
};
/** GET /assistant-history response. */
export interface AssistantHistoryResponse {
    messages: AssistantMessage[];
}
/** 题材基底库：一本书属于哪个阅读市场。树形（题材→子题材→下级）。 */
export interface GenreNode {
    /** 题材名称（标签，如「仙侠修真」「都市异能」）。 */
    name: string;
    /** 题材特征、常见爽点、叙事重心或读者期待。 */
    description: string;
    /** 子题材。 */
    children: GenreNode[];
}
/** 推进模式库：读者为什么继续看下一章。 */
export interface ProgressionMode {
    /** 模式名称（如「升级变强」「经营扩张」「解谜揭露」）。 */
    name: string;
    /** 核心驱动力：靠什么制造追读动力。 */
    driver: string;
    /** 读者期待：每隔几章获得什么变化或回报。 */
    readerExpectation: string;
    /** 常见兑现方式（爽点如何落地）。 */
    payoffs: string[];
    /** 节奏风险：最怕什么（重复升级、冲突变弱、谜题拖太久…）。 */
    risks: string[];
    /** 主模式或辅助模式。 */
    primary: boolean;
}
/** 反 AI 规则：一条「要避免的问题 + 修正方向」。 */
export interface AntiAiRule {
    /** 规则名（如「禁止解释型心理描写」「AI 高频套话」）。 */
    name: string;
    /** 要避免的表达问题，具体可检查。 */
    avoid: string;
    /** 推荐修正方向。 */
    fix: string;
    /** 命中即告警的具体表达模式（用于审稿逐条核对与去 AI 味检测）。 */
    detectPatterns?: string[];
    /** 是否内置全局规则（内置规则随插件发布，项目规则为用户自定义）。 */
    builtin?: boolean;
}
/** 预置写法模板（来自 AI-Novel-Writing-Assistant 内置数据，一键绑定无需样本文本）。 */
export interface StyleTemplate {
    /** 模板 key（如 power-up-escalation）。 */
    key: string;
    /** 模板名（如「爽文递进推进流」）。 */
    name: string;
    /** 模板说明。 */
    description: string;
    /** 分类（如「爽文流」「悬疑流」）。 */
    category: string;
    /** 适用题材。 */
    applicableGenres: string[];
    /** 叙述规则。 */
    proseRules: string[];
    /** 角色/台词规则。 */
    dialogueRules: string[];
    /** 语言规则。 */
    languageRules: string[];
    /** 节奏规则。 */
    rhythmRules: string[];
    /** 该模板默认绑定的反 AI 规则 key（内置规则名）。 */
    defaultAntiAiRuleKeys: string[];
}
/** 写法引擎：从样本文本提取的叙事风格资产。 */
export interface StyleAsset {
    /** 资产名（如「林越式痞坏」「冷峻猎手风」）。 */
    name: string;
    /** 叙述视角与句式节奏。 */
    proseRules: string[];
    /** 角色台词风格。 */
    dialogueRules: string[];
    /** 描写密度与情绪表达。 */
    descriptionRules: string[];
    /** 表达边界（不要做什么）。 */
    boundaries: string[];
    /** 来源样本文本（可空）。 */
    sourceText?: string;
    /** 创建时间。 */
    createdAt: string;
}
/** 项目写作资产（题材基底 + 推进模式 + 反 AI 规则 + 写法资产）。 */
export interface ProjectAssets {
    /** 本书选用的题材（可以是题材基底库中某节点名）。 */
    genre?: GenreNode;
    /** 主推进模式。 */
    primaryProgression?: ProgressionMode;
    /** 辅助推进模式。 */
    auxiliaryProgressions: ProgressionMode[];
    /** 生效的反 AI 规则（内置 + 自定义）。 */
    antiAiRules: AntiAiRule[];
    /** 绑定的写法资产。 */
    styleAssets: StyleAsset[];
    /** 资产更新时间。 */
    updatedAt?: string;
}
/** GET /assets response（含全局题材库与反 AI 规则库）。 */
export interface AssetsResponse {
    projectAssets: ProjectAssets;
    /** 全局题材基底库（可复用资产，跨书）。 */
    genreLibrary: GenreNode[];
    /** 全局反 AI 规则库（内置默认规则）。 */
    antiAiLibrary: AntiAiRule[];
    /** 预置写法模板（一键绑定，无需样本文本）。 */
    styleTemplates: StyleTemplate[];
    /** 内置推进模式候选。 */
    progressionLibrary: ProgressionMode[];
}
/** POST /assets request：更新项目写作资产（部分字段可选）。 */
export interface AssetsPatch {
    genre?: GenreNode;
    primaryProgression?: ProgressionMode;
    auxiliaryProgressions?: ProgressionMode[];
    antiAiRules?: AntiAiRule[];
    styleAssets?: StyleAsset[];
}
/** POST /style-engine request：从样本文本提取写法资产。 */
export interface StyleEngineRequest {
    /** 样本文本（风格来源）。 */
    sampleText: string;
    /** 资产名（可选，默认「风格资产 N」）。 */
    name?: string;
}
