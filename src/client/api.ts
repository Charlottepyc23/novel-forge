/**
 * Browser-side API client for the /api/dsh-novel-forge route family. Plain
 * fetch, same origin; generation/rewrite/polish ride NDJSON streams read
 * incrementally.
 */

import {
  NOVEL_API,
  type AssetsPatch,
  type AssetsResponse,
  type BibleResponse,
  type ChapterResponse,
  type ConfigPatch,
  type ExportResponse,
  type ForeshadowRequest,
  type ForeshadowResponse,
  type JobFrame,
  type LoadOutlineResponse,
  type NovelConfig,
  type PlanResponse,
  type ReviewReport,
  type StatusResponse,
  type StyleEngineRequest,
  type StyleAsset,
  type VolumesResponse,
} from '../protocol.ts'

/** Error carrying the route's JSON error message. */
export class NovelApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NovelApiError'
  }
}

/** Parse a JSON response or throw a NovelApiError. */
async function readJson<T>(response: Response): Promise<T> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new NovelApiError(`HTTP ${response.status}: invalid JSON response`)
  }
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error
      : `HTTP ${response.status}`
    throw new NovelApiError(message)
  }
  return body as T
}

/** POST JSON, return parsed JSON. */
async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return readJson<T>(response)
}

/** The browser half's only data entry point. */
export class NovelApi {
  async status(): Promise<StatusResponse> {
    const response = await fetch(NOVEL_API.status)
    return readJson<StatusResponse>(response)
  }

  async loadOutline(path?: string, text?: string): Promise<LoadOutlineResponse> {
    return postJson<LoadOutlineResponse>(NOVEL_API.loadOutline, { path, text })
  }

  async saveOutline(text: string): Promise<{ ok: boolean; bookName: string }> {
    return postJson<{ ok: boolean; bookName: string }>(NOVEL_API.saveOutline, { text })
  }

  async plan(outline?: string, chapterCount?: number, volume?: number): Promise<PlanResponse> {
    return postJson<PlanResponse>(NOVEL_API.plan, { outline, chapterCount, volume })
  }

  async volumes(outline?: string): Promise<VolumesResponse> {
    return postJson<VolumesResponse>(NOVEL_API.volumes, { outline })
  }

  async bible(outline?: string): Promise<BibleResponse> {
    return postJson<BibleResponse>(NOVEL_API.bible, { outline })
  }

  async review(chapterNo: number): Promise<{ report: ReviewReport }> {
    return postJson<{ report: ReviewReport }>(NOVEL_API.review, { chapterNo })
  }

  async summarize(chapterNo: number): Promise<{ summary: string }> {
    return postJson<{ summary: string }>(NOVEL_API.summary, { chapterNo })
  }

  async foreshadow(req: ForeshadowRequest): Promise<ForeshadowResponse> {
    return postJson<ForeshadowResponse>(NOVEL_API.foreshadow, req)
  }

  async exportBook(format: 'txt' | 'md'): Promise<ExportResponse> {
    return postJson<ExportResponse>(NOVEL_API.exportBook, { format })
  }

  async chapter(no: number): Promise<ChapterResponse> {
    const response = await fetch(`${NOVEL_API.chapter}?no=${no}`)
    return readJson<ChapterResponse>(response)
  }

  /** 审查手动编辑的正文（不落盘）。 */
  async chapterCheck(no: number, text: string): Promise<{ report: ReviewReport }> {
    return postJson<{ report: ReviewReport }>(NOVEL_API.chapterCheck, { chapterNo: no, text })
  }

  /** 保存手动编辑的正文（自动备份 .bak；带报告则沿用落盘，否则保存后自动审稿）。 */
  async chapterSave(no: number, text: string, report?: ReviewReport): Promise<import('../protocol.ts').ChapterSaveResponse> {
    return postJson<import('../protocol.ts').ChapterSaveResponse>(NOVEL_API.chapterSave, { chapterNo: no, text, report })
  }

  async patchConfig(patch: ConfigPatch): Promise<{ config: NovelConfig }> {
    return postJson<{ config: NovelConfig }>(NOVEL_API.config, patch)
  }

  async openFolder(): Promise<void> {
    await fetch(NOVEL_API.openFolder, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  }

  /** 书架快照。 */
  async bookshelf(): Promise<import('../protocol.ts').BookshelfSnapshot> {
    const response = await fetch(NOVEL_API.bookshelf)
    return readJson<import('../protocol.ts').BookshelfSnapshot>(response)
  }

  /** 新建书并激活（开书向导：可携带大纲文本，创建即建项目）。 */
  async bookCreate(bookName: string, outputDir?: string, outline?: string): Promise<import('../protocol.ts').BookshelfSnapshot> {
    return postJson<import('../protocol.ts').BookshelfSnapshot>(NOVEL_API.bookshelf, { bookName, outputDir, outline })
  }

  /** 重置项目（清空进度；可携带新大纲）。 */
  async reset(outline?: string): Promise<{ ok: boolean; bookName: string }> {
    return postJson<{ ok: boolean; bookName: string }>(NOVEL_API.reset, { outline })
  }

  /** 全书一致性质检。 */
  async audit(): Promise<import('../protocol.ts').AuditResponse> {
    return postJson<import('../protocol.ts').AuditResponse>(NOVEL_API.audit, {})
  }

  /** 角色卡刷新（基于事实库聚合）。 */
  async charactersRefresh(): Promise<{ cards: import('../protocol.ts').RoleStatusCard[] }> {
    return postJson<{ cards: import('../protocol.ts').RoleStatusCard[] }>(NOVEL_API.charactersRefresh, {})
  }

  /** 事实库回填：对历史已生成章节批量抽取事实。 */
  async factsBackfill(): Promise<{ ok: boolean; filled: number }> {
    return postJson<{ ok: boolean; filled: number }>(NOVEL_API.factsBackfill, {})
  }

  /** 设定圣经局部修补。 */
  async biblePatch(patch: import('../protocol.ts').BiblePatchRequest): Promise<{ bible: import('../protocol.ts').StoryBible }> {
    return postJson<{ bible: import('../protocol.ts').StoryBible }>(NOVEL_API.biblePatch, patch)
  }

  /** 剧情线管理：增删改 + 关联章节。 */
  async plotlines(req: import('../protocol.ts').PlotlinesRequest): Promise<import('../protocol.ts').PlotlinesResponse> {
    return postJson<import('../protocol.ts').PlotlinesResponse>(NOVEL_API.plotlines, req)
  }

  /** 敏感词检查：指定章节 / 任意文本 / 全书。 */
  async sensitiveCheck(req: import('../protocol.ts').SensitiveCheckRequest): Promise<import('../protocol.ts').SensitiveCheckResponse> {
    return postJson<import('../protocol.ts').SensitiveCheckResponse>(NOVEL_API.sensitiveCheck, req)
  }

  /** 作者复盘补跑：单章（JSON）。 */
  async reviewBackfillChapter(no: number): Promise<{ no: number; review: import('../protocol.ts').AuthorReview }> {
    return postJson<{ no: number; review: import('../protocol.ts').AuthorReview }>(NOVEL_API.reviewBackfill, { chapterNo: no })
  }

  /** 作者复盘补跑：全书缺失章节（NDJSON 流）。 */
  async reviewBackfillAll(onFrame: (frame: JobFrame) => void): Promise<void> {
    await this.streamJob(NOVEL_API.reviewBackfill, {}, onFrame)
  }

  /** 章节复位：generating 卡死 → pending。 */
  async chapterReset(no: number): Promise<{ ok: boolean; no: number }> {
    return postJson<{ ok: boolean; no: number }>(NOVEL_API.chapterReset, { chapterNo: no })
  }

  /** 角色库：AI 提炼 / 采纳 / 更新 / 删除。 */
  async roles(req: import('../protocol.ts').RolesRequest): Promise<import('../protocol.ts').RolesResponse> {
    return postJson<import('../protocol.ts').RolesResponse>(NOVEL_API.roles, req)
  }

  /** 小说简介：AI 生成/补全（partial 留空 = 全量），或手动保存。 */
  async blurb(action: 'generate' | 'save', text?: string, partial?: string): Promise<{ blurb: string }> {
    return postJson<{ blurb: string }>(NOVEL_API.blurb, { action, text, partial })
  }

  /** 封面：读取（dataUrl；dir 指定某本书的输出目录，省略为当前书）。 */
  async coverGet(dir?: string): Promise<import('../protocol.ts').CoverResponse> {
    const query = dir !== undefined ? `?dir=${encodeURIComponent(dir)}` : ''
    const response = await fetch(NOVEL_API.cover + query)
    return readJson<import('../protocol.ts').CoverResponse>(response)
  }

  /** 封面：上传（base64 data URL）或移除。 */
  async coverPost(action: 'upload' | 'remove', dataUrl?: string): Promise<{ ok: boolean; coverPath?: string | null }> {
    return postJson<{ ok: boolean; coverPath?: string | null }>(NOVEL_API.cover, { action, dataUrl })
  }

  /** 重命名当前书（同步项目与书架条目）。 */
  async rename(bookName: string): Promise<{ bookName: string }> {
    return postJson<{ bookName: string }>(NOVEL_API.rename, { bookName })
  }

  /** 大世界：AI 提炼（generate）或手动保存（save）。 */
  async world(action: 'generate' | 'save', world?: import('../protocol.ts').WorldState): Promise<{ world: import('../protocol.ts').WorldState }> {
    return postJson<{ world: import('../protocol.ts').WorldState }>(NOVEL_API.world, { action, world })
  }

  /** 切换当前书。 */
  async bookActivate(id: string): Promise<import('../protocol.ts').BookshelfSnapshot> {
    return postJson<import('../protocol.ts').BookshelfSnapshot>('/api/dsh-novel-forge/bookshelf/activate', { id })
  }

  /** 移除书架条目。 */
  async bookRemove(id: string): Promise<import('../protocol.ts').BookshelfSnapshot> {
    return postJson<import('../protocol.ts').BookshelfSnapshot>('/api/dsh-novel-forge/bookshelf/remove', { id })
  }

  /** Get project writing assets + built-in libraries. */
  async assets(): Promise<AssetsResponse> {
    const response = await fetch(NOVEL_API.assets)
    return readJson<AssetsResponse>(response)
  }

  /** Patch project writing assets. */
  async patchAssets(patch: AssetsPatch): Promise<AssetsResponse> {
    return postJson<AssetsResponse>(NOVEL_API.assets, patch)
  }

  /** Extract a style asset from sample text. */
  async styleEngine(req: StyleEngineRequest): Promise<{ styleAsset: StyleAsset }> {
    return postJson<{ styleAsset: StyleAsset }>(NOVEL_API.styleEngine, req)
  }

  /**
   * Consume an NDJSON job stream (generate / rewrite / polish).
   * @param path - the route to POST to.
   * @param payload - the JSON body.
   * @param onFrame - receives every frame as it lands.
   */
  private async streamJob(path: string, payload: unknown, onFrame: (frame: JobFrame) => void): Promise<void> {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      await readJson<{ error?: string }>(response)
      return
    }
    if (response.body === null) throw new NovelApiError('job: no response body')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (line.trim() === '') continue
        let frame: JobFrame
        try {
          frame = JSON.parse(line) as JobFrame
        } catch {
          continue
        }
        onFrame(frame)
        if (frame.type === 'error') {
          throw new NovelApiError(frame.message)
        }
      }
    }
  }

  /** Generate one chapter. */
  async generate(chapterNo: number, skipReview: boolean, onFrame: (frame: JobFrame) => void): Promise<void> {
    await this.streamJob(NOVEL_API.generate, { chapterNo, skipReview }, onFrame)
  }

  /** Rewrite one chapter (whole-chapter, or local when `target` is given). */
  async rewrite(chapterNo: number, instructions: string, target: string, onFrame: (frame: JobFrame) => void): Promise<void> {
    await this.streamJob(NOVEL_API.rewrite, { chapterNo, instructions, target }, onFrame)
  }

  /** Polish (de-AI-ify) one chapter. */
  async polish(chapterNo: number, onFrame: (frame: JobFrame) => void): Promise<void> {
    await this.streamJob(NOVEL_API.polish, { chapterNo }, onFrame)
  }

  /** 采纳待确认草稿（润色/重写产物），覆盖正文文件。 */
  async draftApply(chapterNo: number): Promise<{ ok: boolean; chars: number; file: string }> {
    return postJson<{ ok: boolean; chars: number; file: string }>(NOVEL_API.draftApply, { chapterNo })
  }

  /** 放弃待确认草稿，保留原稿。 */
  async draftDiscard(chapterNo: number): Promise<{ ok: boolean }> {
    return postJson<{ ok: boolean }>(NOVEL_API.draftDiscard, { chapterNo })
  }

  /** Run one assistant turn (NDJSON stream). */
  async assistant(message: string, onFrame: (frame: import('../protocol.ts').AssistantFrame) => void): Promise<void> {
    const response = await fetch(NOVEL_API.assistant, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message }),
    })
    if (!response.ok) {
      await readJson<{ error?: string }>(response)
      return
    }
    if (response.body === null) throw new NovelApiError('assistant: no response body')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (line.trim() === '') continue
        let frame: import('../protocol.ts').AssistantFrame
        try {
          frame = JSON.parse(line) as import('../protocol.ts').AssistantFrame
        } catch {
          continue
        }
        onFrame(frame)
        if (frame.type === 'error') throw new NovelApiError(frame.message)
      }
    }
  }

  /** Load the persisted assistant conversation. */
  async assistantHistory(): Promise<import('../protocol.ts').AssistantMessage[]> {
    const response = await fetch(NOVEL_API.assistantHistory)
    const body = await readJson<{ messages: import('../protocol.ts').AssistantMessage[] }>(response)
    return body.messages
  }

  /** 清空助手对话记录。 */
  async assistantClear(): Promise<{ ok: boolean }> {
    return postJson<{ ok: boolean }>(NOVEL_API.assistantClear, {})
  }
}
