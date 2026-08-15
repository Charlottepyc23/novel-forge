/**
 * Browser-side API client for the /api/dsh-novel-forge route family. Plain
 * fetch, same origin; generation/rewrite/polish ride NDJSON streams read
 * incrementally.
 */
import { type AssetsPatch, type AssetsResponse, type BibleResponse, type ChapterResponse, type ConfigPatch, type ExportResponse, type ForeshadowRequest, type ForeshadowResponse, type JobFrame, type LoadOutlineResponse, type NovelConfig, type PlanResponse, type ReviewReport, type StatusResponse, type StyleEngineRequest, type StyleAsset, type VolumesResponse } from '../protocol.ts';
/** Error carrying the route's JSON error message. */
export declare class NovelApiError extends Error {
    constructor(message: string);
}
/** The browser half's only data entry point. */
export declare class NovelApi {
    status(): Promise<StatusResponse>;
    loadOutline(path?: string, text?: string): Promise<LoadOutlineResponse>;
    saveOutline(text: string): Promise<{
        ok: boolean;
        bookName: string;
    }>;
    plan(outline?: string, chapterCount?: number, volume?: number): Promise<PlanResponse>;
    volumes(outline?: string): Promise<VolumesResponse>;
    bible(outline?: string): Promise<BibleResponse>;
    review(chapterNo: number): Promise<{
        report: ReviewReport;
    }>;
    summarize(chapterNo: number): Promise<{
        summary: string;
    }>;
    foreshadow(req: ForeshadowRequest): Promise<ForeshadowResponse>;
    exportBook(format: 'txt' | 'md'): Promise<ExportResponse>;
    chapter(no: number): Promise<ChapterResponse>;
    patchConfig(patch: ConfigPatch): Promise<{
        config: NovelConfig;
    }>;
    openFolder(): Promise<void>;
    /** 书架快照。 */
    bookshelf(): Promise<import('../protocol.ts').BookshelfSnapshot>;
    /** 新建书并激活。 */
    bookCreate(bookName: string, outputDir?: string): Promise<import('../protocol.ts').BookshelfSnapshot>;
    /** 切换当前书。 */
    bookActivate(id: string): Promise<import('../protocol.ts').BookshelfSnapshot>;
    /** 移除书架条目。 */
    bookRemove(id: string): Promise<import('../protocol.ts').BookshelfSnapshot>;
    /** Get project writing assets + built-in libraries. */
    assets(): Promise<AssetsResponse>;
    /** Patch project writing assets. */
    patchAssets(patch: AssetsPatch): Promise<AssetsResponse>;
    /** Extract a style asset from sample text. */
    styleEngine(req: StyleEngineRequest): Promise<{
        styleAsset: StyleAsset;
    }>;
    /**
     * Consume an NDJSON job stream (generate / rewrite / polish).
     * @param path - the route to POST to.
     * @param payload - the JSON body.
     * @param onFrame - receives every frame as it lands.
     */
    private streamJob;
    /** Generate one chapter. */
    generate(chapterNo: number, skipReview: boolean, onFrame: (frame: JobFrame) => void): Promise<void>;
    /** Rewrite one chapter (whole-chapter, or local when `target` is given). */
    rewrite(chapterNo: number, instructions: string, target: string, onFrame: (frame: JobFrame) => void): Promise<void>;
    /** Polish (de-AI-ify) one chapter. */
    polish(chapterNo: number, onFrame: (frame: JobFrame) => void): Promise<void>;
    /** Run one assistant turn (NDJSON stream). */
    assistant(message: string, onFrame: (frame: import('../protocol.ts').AssistantFrame) => void): Promise<void>;
    /** Load the persisted assistant conversation. */
    assistantHistory(): Promise<import('../protocol.ts').AssistantMessage[]>;
}
