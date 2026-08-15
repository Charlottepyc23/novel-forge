/**
 * Novel engine — the host half's core: LLM-driven story-bible extraction,
 * volume planning, chapter planning, chapter-by-chapter writing with
 * auto-review + rewrite, polish (de-AI-ify), narrative summaries, foreshadow
 * tracking, project persistence, and whole-book export. Pure Node (no
 * web-server dependencies), so routes stay thin and logic is testable.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ChapterPlan, Foreshadow, NovelConfig, ProjectState, ReviewReport, StoryBible, Volume } from './protocol.ts';
/** Project state file name inside the output dir. */
export declare const PROJECT_FILE = "novel-project.json";
/** Chapter output file name, e.g. 第001章_开篇.md */
export declare function chapterFileName(chapter: ChapterPlan): string;
/** Infer a book name from the outline's first non-empty line. */
export declare function inferBookName(outline: string): string;
/** Read the persisted project from the output dir (undefined when absent). */
export declare function loadProject(outputDir: string): ProjectState | undefined;
/** Persist the project state next to the chapters. */
export declare function saveProject(outputDir: string, project: ProjectState): void;
/** List generated chapter files in the output dir (sorted). */
export declare function listChapterFiles(outputDir: string): string[];
/** Re-sync chapter status against files on disk (a file may exist without state). */
export declare function syncProjectWithDisk(project: ProjectState, outputDir: string): void;
/** Read a chapter's markdown body from disk (undefined when missing). */
export declare function readChapterFile(outputDir: string, chapter: ChapterPlan): string | undefined;
/** Create a fresh project from an outline. */
export declare function createProject(outline: string, outlinePath?: string): ProjectState;
/** Extract the story bible from an outline. */
export declare function extractBible(ctx: Context, config: NovelConfig, outline: string): Promise<StoryBible>;
/** Plan volumes from an outline. */
export declare function planVolumes(ctx: Context, config: NovelConfig, outline: string): Promise<Volume[]>;
/**
 * Plan chapters from an outline (optionally for one volume).
 */
export declare function planChapters(ctx: Context, config: NovelConfig, project: ProjectState, chapterCount: number, volumeNo?: number): Promise<ChapterPlan[]>;
/** Run the AI review on one chapter. */
export declare function reviewChapter(ctx: Context, config: NovelConfig, project: ProjectState, outputDir: string, chapterNo: number): Promise<ReviewReport>;
/**
 * Stream a chapter rewrite. With `target` (a passage of the body), only that
 * passage's paragraph is rewritten and spliced back — everything else stays
 * untouched (local revision). Without `target`, the whole chapter is
 * rewritten. Yields delta text; persists when done.
 */
export declare function rewriteChapterStream(ctx: Context, config: NovelConfig, project: ProjectState, outputDir: string, chapterNo: number, instructions: string, target?: string): AsyncGenerator<{
    frame: 'start';
} | {
    frame: 'delta';
    text: string;
} | {
    frame: 'done';
    file: string;
    chars: number;
}, void, unknown>;
/** Stream a chapter polish (de-AI-ify). */
export declare function polishChapterStream(ctx: Context, config: NovelConfig, project: ProjectState, outputDir: string, chapterNo: number): AsyncGenerator<{
    frame: 'start';
} | {
    frame: 'delta';
    text: string;
} | {
    frame: 'done';
    file: string;
    chars: number;
}, void, unknown>;
/** Generate one chapter (streaming). Yields progress frames; persists when done. */
export declare function generateChapterStream(ctx: Context, config: NovelConfig, project: ProjectState, outputDir: string, chapterNo: number): AsyncGenerator<{
    frame: 'start';
} | {
    frame: 'delta';
    text: string;
} | {
    frame: 'done';
    file: string;
    chars: number;
}, void, unknown>;
/** Generate a chapter summary (narrative memory). */
export declare function summarizeChapter(ctx: Context, config: NovelConfig, project: ProjectState, outputDir: string, chapterNo: number): Promise<string>;
/** Suggest foreshadows from the outline + plan. */
export declare function suggestForeshadows(ctx: Context, config: NovelConfig, project: ProjectState): Promise<Foreshadow[]>;
/**
 * 写法引擎：从样本文本提取一份写法资产（叙事风格规则）。
 * @returns 提取出的风格规则（未持久化，由调用方存入 project.assets）。
 */
export declare function extractStyleAsset(ctx: Context, config: NovelConfig, sampleText: string): Promise<{
    proseRules: string[];
    dialogueRules: string[];
    descriptionRules: string[];
    boundaries: string[];
}>;
/** Export the whole book as one txt/md file. */
export declare function exportBook(outputDir: string, project: ProjectState, format: 'txt' | 'md'): {
    file: string;
    chars: number;
    chapters: number;
};
