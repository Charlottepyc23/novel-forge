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

  /** 新建书并激活。 */
  async bookCreate(bookName: string, outputDir?: string): Promise<import('../protocol.ts').BookshelfSnapshot> {
    return postJson<import('../protocol.ts').BookshelfSnapshot>(NOVEL_API.bookshelf, { bookName, outputDir })
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
}
