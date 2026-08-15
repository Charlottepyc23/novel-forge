/**
 * The /api/dsh-novel-forge route family: status, docx outline loading, LLM
 * story-bible extraction, volume planning, chapter planning, streaming
 * generation / rewrite / polish (NDJSON frames), review, summaries,
 * foreshadows, export, chapter reading, config patching, and opening the
 * output folder. Every route carries the same loopback-only trust fence as
 * the family plugins — these endpoints invoke the LLM and write files on the
 * host machine.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { exec } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { Context } from '@deepseek-ai/cordis'
import {
  NOVEL_API,
  type AssetsPatch,
  type AssetsResponse,
  type AssistantFrame,
  type AssistantHistoryResponse,
  type AssistantRequest,
  type AuditResponse,
  type BiblePatchRequest,
  type BibleRequest,
  type BibleResponse,
  type BookActivateRequest,
  type BookCreateRequest,
  type BookRemoveRequest,
  type BookshelfSnapshot,
  type ChapterResponse,
  type ChapterPlan,
  type ConfigPatch,
  type DraftDecisionRequest,
  type ExportRequest,
  type ExportResponse,
  type ForeshadowRequest,
  type ForeshadowResponse,
  type JobFrame,
  type LoadOutlineRequest,
  type LoadOutlineResponse,
  type NovelConfig,
  type PlanRequest,
  type PlanResponse,
  type PolishRequest,
  type ResetRequest,
  type ReviewRequest,
  type RewriteRequest,
  type StatusResponse,
  type StyleEngineRequest,
  type SummaryRequest,
  type VolumesRequest,
  type VolumesResponse,
} from './protocol.ts'
import { readOutlineFromDocx } from './docx.ts'
import { loadAssistantHistory, runAssistantTurn } from './assistant.ts'
import { activateBook, bookshelfSnapshot, createBook, defaultOutputDirFor, loadBookshelf, removeBook, renameBook, seedBookshelfFromOutputDir } from './bookshelf.ts'
import { BUILTIN_ANTI_AI_RULES, BUILTIN_GENRE_LIBRARY, BUILTIN_PROGRESSION_MODES, BUILTIN_STYLE_TEMPLATES, emptyProjectAssets } from './assets.ts'
import {
  chapterFileName,
  auditBook,
  backfillFacts,
  createProject,
  exportBook,
  extractBible,
  extractFacts,
  extractStyleAsset,
  generateChapterStream,
  listChapterFiles,
  loadProject,
  planChapters,
  planVolumes,
  polishChapterStream,
  readChapterFile,
  refreshCharacters,
  reviewChapter,
  rewriteChapterStream,
  saveProject,
  suggestForeshadows,
  summarizeChapter,
  syncProjectWithDisk,
} from './engine.ts'

/** Cap on JSON request bodies. */
const MAX_JSON_BODY_BYTES = 4 * 1024 * 1024

/** Loopback-only fence (mirrors the family plugins' pairing routes). */
function isLoopbackRequest(request: IncomingMessage): boolean {
  const address = request.socket.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  const host = request.headers.host
  if (typeof host !== 'string') return false
  let hostUrl: URL
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }
  if (hostUrl.hostname !== '127.0.0.1' && hostUrl.hostname !== 'localhost' && hostUrl.hostname !== '[::1]') return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

/** One JSON response. */
function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer' })
  res.end(payload)
}

/** Read a JSON request body. */
async function readJsonBody<T>(req: IncomingMessage): Promise<T | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > MAX_JSON_BODY_BYTES) return undefined
    chunks.push(buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T
  } catch {
    return undefined
  }
}

/** Route deps. */
export interface NovelRoutesDeps {
  ctx: Context
  /** Resolve the live plugin config (settings-aware). */
  getConfig: () => NovelConfig
  /** Persist a config patch through the settings seam. */
  patchConfig: (patch: ConfigPatch) => Promise<NovelConfig>
}

/** Default chapter count for planning when the request omits it. */
const DEFAULT_PLAN_COUNT = 30

/**
 * Build every /api/dsh-novel-forge route.
 * @param deps - context, config resolver, config patcher.
 * @returns the route list.
 */
export function makeRoutes(deps: NovelRoutesDeps): WebRoute[] {
  const { ctx, getConfig, patchConfig } = deps

  /** Guard helper: fence + method check. */
  const guard = (req: IncomingMessage, res: ServerResponse, method: string): boolean => {
    if (!isLoopbackRequest(req)) {
      writeJson(res, 403, { error: 'forbidden: loopback-only' })
      return false
    }
    if (req.method !== method) {
      writeJson(res, 405, { error: `method not allowed (expected ${method})` })
      return false
    }
    return true
  }

  /** Load (and sync) the project, or respond 400. */
  const requireProject = (res: ServerResponse): ReturnType<typeof loadProject> => {
    const config = getConfig()
    const project = loadProject(config.outputDir)
    if (project === undefined) {
      writeJson(res, 400, { error: '输出目录中没有项目，请先加载大纲' })
      return undefined
    }
    syncProjectWithDisk(project, config.outputDir)
    saveProject(config.outputDir, project)
    return project
  }

  // -------------------------------------------------------------- status
  const statusRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.status,
    handler: (req, res) => {
      if (!guard(req, res, 'GET')) return
      const config = getConfig()
      // 书架为空时播种 settings 默认输出目录里的已有项目。
      seedBookshelfFromOutputDir(config.outputDir)
      const project = loadProject(config.outputDir)
      if (project !== undefined) {
        syncProjectWithDisk(project, config.outputDir)
        saveProject(config.outputDir, project)
      }
      const response: StatusResponse = {
        config,
        project: project ?? undefined,
        generatedFiles: listChapterFiles(config.outputDir),
      }
      writeJson(res, 200, response)
    },
  }

  // -------------------------------------------------------- load-outline
  const loadOutlineRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.loadOutline,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const body = await readJsonBody<LoadOutlineRequest>(req)
      const config = getConfig()
      try {
        let outline: string
        let path: string | undefined
        if (body?.text !== undefined && body.text.trim() !== '') {
          outline = body.text.trim()
        } else {
          const target = body?.path?.trim() !== '' && body?.path !== undefined ? body.path : config.outlinePath
          outline = readOutlineFromDocx(target)
          path = target
        }
        if (outline.length < 50) {
          writeJson(res, 400, { error: '大纲内容过短（<50 字符），请检查文件或直接粘贴大纲文本' })
          return
        }
        const response: LoadOutlineResponse = {
          outline,
          bookName: createProject(outline).bookName,
          chars: outline.length,
          path,
        }
        writeJson(res, 200, response)
      } catch (error) {
        writeJson(res, 400, { error: (error as Error).message })
      }
    },
  }

  // -------------------------------------------------------- save-outline
  const saveOutlineRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.saveOutline,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const body = await readJsonBody<LoadOutlineRequest>(req)
      const config = getConfig()
      const outline = body?.text ?? ''
      if (outline.trim().length < 50) {
        writeJson(res, 400, { error: '大纲内容过短（<50 字符）' })
        return
      }
      let project = loadProject(config.outputDir)
      const now = new Date().toISOString()
      if (project === undefined) {
        project = createProject(outline)
      } else {
        project.outline = outline
        project.bookName = createProject(outline).bookName
        project.updatedAt = now
      }
      saveProject(config.outputDir, project)
      writeJson(res, 200, { ok: true, bookName: project.bookName })
    },
  }

  // --------------------------------------------------------------- bible
  const bibleRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.bible,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const body = await readJsonBody<BibleRequest>(req)
      const config = getConfig()
      const project = loadProject(config.outputDir)
      const outline = body?.outline?.trim() !== '' && body?.outline !== undefined
        ? body.outline
        : project?.outline
      if (outline === undefined || outline.length < 50) {
        writeJson(res, 400, { error: '请先加载大纲' })
        return
      }
      try {
        const bible = await extractBible(ctx, config, outline)
        const now = new Date().toISOString()
        const next = project ?? createProject(outline)
        next.bible = bible
        next.updatedAt = now
        saveProject(config.outputDir, next)
        const response: BibleResponse = { bible }
        writeJson(res, 200, response)
      } catch (error) {
        writeJson(res, 500, { error: (error as Error).message })
      }
    },
  }

  // ------------------------------------------------------------- volumes
  const volumesRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.volumes,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const body = await readJsonBody<VolumesRequest>(req)
      const config = getConfig()
      const project = loadProject(config.outputDir)
      const outline = body?.outline?.trim() !== '' && body?.outline !== undefined
        ? body.outline
        : project?.outline
      if (outline === undefined || outline.length < 50) {
        writeJson(res, 400, { error: '请先加载大纲' })
        return
      }
      try {
        const volumes = await planVolumes(ctx, config, outline)
        const now = new Date().toISOString()
        const next = project ?? createProject(outline)
        next.volumes = volumes
        next.updatedAt = now
        saveProject(config.outputDir, next)
        const response: VolumesResponse = { volumes }
        writeJson(res, 200, response)
      } catch (error) {
        writeJson(res, 500, { error: (error as Error).message })
      }
    },
  }

  // ----------------------------------------------------------------- plan
  const planRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.plan,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const body = await readJsonBody<PlanRequest>(req)
      const config = getConfig()
      const project = loadProject(config.outputDir)
      const outline = body?.outline?.trim() !== '' && body?.outline !== undefined
        ? body.outline
        : project?.outline
      if (outline === undefined || outline.length < 50) {
        writeJson(res, 400, { error: '请先加载大纲（或粘贴大纲文本）' })
        return
      }
      const count = body?.chapterCount ?? DEFAULT_PLAN_COUNT
      if (!Number.isInteger(count) || count < 1 || count > 200) {
        writeJson(res, 400, { error: 'chapterCount 须为 1-200 的整数' })
        return
      }
      try {
        const next = project ?? createProject(outline)
        const chapters: ChapterPlan[] = await planChapters(ctx, config, next, count, body?.volume)
        next.chapters.push(...chapters)
        next.updatedAt = new Date().toISOString()
        saveProject(config.outputDir, next)
        const response: PlanResponse = { chapters, volumes: next.volumes }
        writeJson(res, 200, response)
      } catch (error) {
        writeJson(res, 500, { error: (error as Error).message })
      }
    },
  }

  // ------------------------------------------------------------- generate
  const generateRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.generate,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const body = await readJsonBody<{ chapterNo?: number; skipReview?: boolean }>(req)
      const rawNo = body?.chapterNo
      if (!Number.isInteger(rawNo) || rawNo === undefined || rawNo < 1) {
        writeJson(res, 400, { error: 'chapterNo 须为正整数' })
        return
      }
      const no: number = rawNo
      const chapter = project.chapters.find(c => c.no === no)
      if (chapter === undefined) {
        writeJson(res, 404, { error: `章节 ${no} 不在计划中` })
        return
      }
      if (chapter.status === 'generating') {
        writeJson(res, 409, { error: `章节 ${no} 正在生成中` })
        return
      }

      // NDJSON stream.
      res.writeHead(200, {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'cache-control': 'no-cache',
        'x-accel-buffering': 'no',
        'referrer-policy': 'no-referrer',
      })
      chapter.status = 'generating'
      chapter.error = undefined
      saveProject(config.outputDir, project)

      const send = (frame: JobFrame): void => {
        res.write(JSON.stringify(frame) + '\n')
      }

      try {
        send({ type: 'start', no, title: chapter.title })
        for await (const step of generateChapterStream(ctx, config, project, config.outputDir, no)) {
          if (step.frame === 'delta') {
            send({ type: 'delta', text: step.text })
          } else if (step.frame === 'done') {
            send({ type: 'done', no, file: step.file, chars: step.chars, title: chapter.title })
          }
        }
        // Auto pipeline: summary -> facts -> review (unless skipped).
        try {
          await summarizeChapter(ctx, config, project, config.outputDir, no)
        } catch (error) {
          console.warn('[dsh-novel-forge] summary failed:', (error as Error).message)
        }
        try {
          await extractFacts(ctx, config, project, config.outputDir, no)
        } catch (error) {
          console.warn('[dsh-novel-forge] facts extraction failed:', (error as Error).message)
        }
        if (!(body?.skipReview === true) && (config.autoReview ?? true)) {
          const report = await reviewChapter(ctx, config, project, config.outputDir, no)
          send({ type: 'review', no, report })
        } else {
          chapter.status = 'approved'
          saveProject(config.outputDir, project)
        }
        res.end()
      } catch (error) {
        chapter.status = 'error'
        chapter.error = (error as Error).message
        saveProject(config.outputDir, project)
        if (!res.writableEnded) {
          send({ type: 'error', no, message: (error as Error).message })
          res.end()
        }
      }
    },
  }

  // --------------------------------------------------------------- review
  const reviewRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.review,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const body = await readJsonBody<ReviewRequest>(req)
      if (!Number.isInteger(body?.chapterNo)) {
        writeJson(res, 400, { error: 'chapterNo 须为正整数' })
        return
      }
      const no = body!.chapterNo!
      try {
        const report = await reviewChapter(ctx, config, project, config.outputDir, no)
        writeJson(res, 200, { report })
      } catch (error) {
        writeJson(res, 500, { error: (error as Error).message })
      }
    },
  }

  // -------------------------------------------------------------- rewrite
  const rewriteRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.rewrite,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const body = await readJsonBody<RewriteRequest>(req)
      if (!Number.isInteger(body?.chapterNo)) {
        writeJson(res, 400, { error: 'chapterNo 须为正整数' })
        return
      }
      const no = body!.chapterNo!
      res.writeHead(200, {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'cache-control': 'no-cache',
        'x-accel-buffering': 'no',
        'referrer-policy': 'no-referrer',
      })
      const send = (frame: JobFrame): void => { res.write(JSON.stringify(frame) + '\n') }
      try {
        for await (const step of rewriteChapterStream(ctx, config, project, config.outputDir, no, body?.instructions ?? '', body?.target)) {
          if (step.frame === 'delta') send({ type: 'delta', text: step.text })
          else if (step.frame === 'drafted') send({ type: 'drafted', no, chars: step.chars, draft: step.draft })
        }
        // Draft mode: no auto re-review — the user reviews the diff and
        // decides; re-run review after applying if wanted.
        res.end()
      } catch (error) {
        if (!res.writableEnded) {
          send({ type: 'error', no, message: (error as Error).message })
          res.end()
        }
      }
    },
  }

  // --------------------------------------------------------------- polish
  const polishRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.polish,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const body = await readJsonBody<PolishRequest>(req)
      if (!Number.isInteger(body?.chapterNo)) {
        writeJson(res, 400, { error: 'chapterNo 须为正整数' })
        return
      }
      const no = body!.chapterNo!
      res.writeHead(200, {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'cache-control': 'no-cache',
        'x-accel-buffering': 'no',
        'referrer-policy': 'no-referrer',
      })
      const send = (frame: JobFrame): void => { res.write(JSON.stringify(frame) + '\n') }
      try {
        for await (const step of polishChapterStream(ctx, config, project, config.outputDir, no)) {
          if (step.frame === 'delta') send({ type: 'delta', text: step.text })
          else if (step.frame === 'drafted') send({ type: 'drafted', no, chars: step.chars, draft: step.draft })
        }
        res.end()
      } catch (error) {
        if (!res.writableEnded) {
          send({ type: 'error', no, message: (error as Error).message })
          res.end()
        }
      }
    },
  }

  // ---------------------------------------------------- draft apply/discard
  /** 采纳待确认草稿：覆盖正文文件 + 状态回 written + 清空草稿。 */
  const draftApplyRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.draftApply,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const body = await readJsonBody<DraftDecisionRequest>(req)
      if (!Number.isInteger(body?.chapterNo)) {
        writeJson(res, 400, { error: 'chapterNo 须为正整数' })
        return
      }
      const chapter = project.chapters.find(c => c.no === body!.chapterNo!)
      if (chapter === undefined) {
        writeJson(res, 404, { error: `章节 ${body!.chapterNo} 不在计划中` })
        return
      }
      if (chapter.pendingDraft === undefined || chapter.pendingDraft === '') {
        writeJson(res, 400, { error: `章节 ${chapter.no} 没有待确认的草稿` })
        return
      }
      const draft = chapter.pendingDraft
      const fileName = chapterFileName(chapter)
      mkdirSync(config.outputDir, { recursive: true })
      const targetPath = join(config.outputDir, fileName)
      // 采纳前自动备份当前原稿为 .bak.md（每次应用都刷新为最新原稿），可随时回退。
      if (existsSync(targetPath)) {
        copyFileSync(targetPath, join(config.outputDir, `${fileName.replace(/\.md$/, '')}.bak.md`))
      }
      writeFileSync(targetPath, `# 第${chapter.no}章 ${chapter.title}\n\n${draft}\n`, 'utf8')
      chapter.pendingDraft = undefined
      chapter.status = 'written'
      chapter.chars = draft.length
      chapter.file = fileName
      chapter.review = undefined
      chapter.error = undefined
      project.updatedAt = new Date().toISOString()
      saveProject(config.outputDir, project)
      writeJson(res, 200, { ok: true, chars: draft.length, file: fileName })
    },
  }

  /** 放弃待确认草稿：保留原稿，仅清空草稿字段。 */
  const draftDiscardRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.draftDiscard,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const body = await readJsonBody<DraftDecisionRequest>(req)
      if (!Number.isInteger(body?.chapterNo)) {
        writeJson(res, 400, { error: 'chapterNo 须为正整数' })
        return
      }
      const chapter = project.chapters.find(c => c.no === body!.chapterNo!)
      if (chapter === undefined) {
        writeJson(res, 404, { error: `章节 ${body!.chapterNo} 不在计划中` })
        return
      }
      if (chapter.pendingDraft !== undefined) {
        chapter.pendingDraft = undefined
        project.updatedAt = new Date().toISOString()
        saveProject(config.outputDir, project)
      }
      writeJson(res, 200, { ok: true })
    },
  }

  // -------------------------------------------------------------- summary
  const summaryRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.summary,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const body = await readJsonBody<SummaryRequest>(req)
      if (!Number.isInteger(body?.chapterNo)) {
        writeJson(res, 400, { error: 'chapterNo 须为正整数' })
        return
      }
      try {
        const summary = await summarizeChapter(ctx, config, project, config.outputDir, body!.chapterNo!)
        writeJson(res, 200, { summary })
      } catch (error) {
        writeJson(res, 500, { error: (error as Error).message })
      }
    },
  }

  // ---------------------------------------------------------- foreshadow
  const foreshadowRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.foreshadow,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const body = await readJsonBody<ForeshadowRequest>(req)
      try {
        if (body?.suggest === true) {
          // AI suggestion pass: create several foreshadows from the outline.
          const created = await suggestForeshadows(ctx, config, project)
          project.updatedAt = new Date().toISOString()
          saveProject(config.outputDir, project)
          const response: ForeshadowResponse = { foreshadows: created }
          writeJson(res, 200, response)
          return
        }
        if (body?.id !== undefined) {
          // Update an existing foreshadow.
          const target = project.foreshadows.find(f => f.id === body.id)
          if (target === undefined) {
            writeJson(res, 404, { error: `伏笔 ${body.id} 不存在` })
            return
          }
          if (body.description !== undefined) target.description = body.description
          if (body.plantedChapter !== undefined) target.plantedChapter = body.plantedChapter
          if (body.targetChapter !== undefined) target.targetChapter = body.targetChapter
          if (body.status !== undefined) target.status = body.status
          if (body.resolvedNote !== undefined) target.resolvedNote = body.resolvedNote
        } else {
          // Create one manually.
          const description = body?.description?.trim()
          if (description === undefined || description === '') {
            writeJson(res, 400, { error: 'description 必填' })
            return
          }
          project.foreshadows.push({
            id: `fs-${Date.now().toString(36)}`,
            description,
            plantedChapter: body?.plantedChapter,
            targetChapter: body?.targetChapter,
            status: body?.status ?? 'planned',
          })
        }
        project.updatedAt = new Date().toISOString()
        saveProject(config.outputDir, project)
        const response: ForeshadowResponse = { foreshadows: project.foreshadows }
        writeJson(res, 200, response)
      } catch (error) {
        writeJson(res, 500, { error: (error as Error).message })
      }
    },
  }

  // -------------------------------------------------------------- export
  const exportRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.exportBook,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const body = await readJsonBody<ExportRequest>(req)
      const format = body?.format === 'md' ? 'md' : 'txt'
      try {
        const result = exportBook(config.outputDir, project, format)
        const response: ExportResponse = { ...result }
        writeJson(res, 200, response)
      } catch (error) {
        writeJson(res, 500, { error: (error as Error).message })
      }
    },
  }

  // -------------------------------------------------------------- chapter
  const chapterRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.chapter,
    handler: async (req, res) => {
      if (!guard(req, res, 'GET')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const url = new URL(req.url ?? '/', 'http://localhost')
      const rawNo = Number(url.searchParams.get('no') ?? '0')
      if (!Number.isInteger(rawNo) || rawNo < 1) {
        writeJson(res, 400, { error: 'no 须为正整数' })
        return
      }
      const chapter = project.chapters.find(c => c.no === rawNo)
      if (chapter === undefined) {
        writeJson(res, 404, { error: `章节 ${rawNo} 不在计划中` })
        return
      }
      const markdown = readChapterFile(config.outputDir, chapter)
      if (markdown === undefined) {
        writeJson(res, 404, { error: `章节 ${rawNo} 尚未生成` })
        return
      }
      const response: ChapterResponse = { no: chapter.no, title: chapter.title, markdown }
      writeJson(res, 200, response)
    },
  }

  // ----------------------------------------------------------- assistant
  const assistantRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.assistant,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      const body = await readJsonBody<AssistantRequest>(req)
      const message = body?.message?.trim()
      if (message === undefined || message === '') {
        writeJson(res, 400, { error: '消息不能为空' })
        return
      }
      res.writeHead(200, {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'cache-control': 'no-cache',
        'x-accel-buffering': 'no',
        'referrer-policy': 'no-referrer',
      })
      const send = (frame: AssistantFrame): void => { res.write(JSON.stringify(frame) + '\n') }
      try {
        for await (const step of runAssistantTurn(ctx, config, project, config.outputDir, message)) {
          if (step.frame === 'delta') send({ type: 'delta', text: step.text })
          else if (step.frame === 'tool') send({ type: 'tool', name: step.name, status: step.status, detail: step.detail })
          else if (step.frame === 'toolDelta') send({ type: 'toolDelta', name: step.name, text: step.text })
        }
        send({ type: 'done' })
        res.end()
      } catch (error) {
        if (!res.writableEnded) {
          send({ type: 'error', message: (error as Error).message })
          res.end()
        }
      }
    },
  }

  // -------------------------------------------------- assistant-history
  const assistantHistoryRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.assistantHistory,
    handler: (req, res) => {
      if (!guard(req, res, 'GET')) return
      const config = getConfig()
      const response: AssistantHistoryResponse = { messages: loadAssistantHistory(config.outputDir) }
      writeJson(res, 200, response)
    },
  }

  // --------------------------------------------------------------- assets
  const assetsRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.assets,
    handler: async (req, res) => {
      // GET (read) and POST (patch) are both allowed — check methods first,
      // then the loopback fence (guard() would 405 on POST, which is wrong).
      if (req.method !== 'GET' && req.method !== 'POST') {
        writeJson(res, 405, { error: 'method not allowed (expected GET or POST)' })
        return
      }
      if (!isLoopbackRequest(req)) {
        writeJson(res, 403, { error: 'forbidden: loopback-only' })
        return
      }
      const config = getConfig()
      const project = loadProject(config.outputDir)
      const projectAssets = project?.assets ?? emptyProjectAssets()
      if (req.method === 'POST') {
        const body = await readJsonBody<AssetsPatch>(req)
        if (body === undefined) {
          writeJson(res, 400, { error: '无效的 JSON' })
          return
        }
        if (project === undefined) {
          writeJson(res, 400, { error: '请先加载大纲创建项目' })
          return
        }
        if (body.genre !== undefined) projectAssets.genre = body.genre
        if (body.primaryProgression !== undefined) projectAssets.primaryProgression = body.primaryProgression
        if (body.auxiliaryProgressions !== undefined) projectAssets.auxiliaryProgressions = body.auxiliaryProgressions
        if (body.antiAiRules !== undefined) projectAssets.antiAiRules = body.antiAiRules
        if (body.styleAssets !== undefined) projectAssets.styleAssets = body.styleAssets
        projectAssets.updatedAt = new Date().toISOString()
        project.assets = projectAssets
        project.updatedAt = new Date().toISOString()
        saveProject(config.outputDir, project)
      }
      const response: AssetsResponse = {
        projectAssets,
        genreLibrary: BUILTIN_GENRE_LIBRARY,
        antiAiLibrary: BUILTIN_ANTI_AI_RULES,
        styleTemplates: BUILTIN_STYLE_TEMPLATES,
        progressionLibrary: BUILTIN_PROGRESSION_MODES,
      }
      writeJson(res, 200, response)
    },
  }

  // ----------------------------------------------------------- style-engine
  const styleEngineRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.styleEngine,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = loadProject(config.outputDir)
      const body = await readJsonBody<StyleEngineRequest>(req)
      const sample = body?.sampleText?.trim()
      if (sample === undefined || sample.length < 50) {
        writeJson(res, 400, { error: '样本文本过短（<50 字符），请粘贴一段能代表目标风格的文字' })
        return
      }
      try {
        const rules = await extractStyleAsset(ctx, config, sample)
        const name = body?.name?.trim() !== '' && body?.name !== undefined ? body.name : `风格资产 ${Date.now().toString(36)}`
        const styleAsset = {
          name: name.slice(0, 40),
          ...rules,
          sourceText: sample.slice(0, 3000),
          createdAt: new Date().toISOString(),
        }
        if (project !== undefined) {
          project.assets ??= emptyProjectAssets()
          project.assets.styleAssets ??= []
          project.assets.styleAssets.push(styleAsset)
          project.assets.updatedAt = new Date().toISOString()
          project.updatedAt = new Date().toISOString()
          saveProject(config.outputDir, project)
        }
        writeJson(res, 200, { styleAsset })
      } catch (error) {
        writeJson(res, 500, { error: (error as Error).message })
      }
    },
  }

  // ------------------------------------------------------------- bookshelf
  const bookshelfRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.bookshelf,
    handler: async (req, res) => {
      // GET = snapshot; POST = create book.
      if (req.method === 'GET') {
        if (!isLoopbackRequest(req)) {
          writeJson(res, 403, { error: 'forbidden: loopback-only' })
          return
        }
        // 书架为空时，把 settings 默认输出目录里已有的项目播种为第一本书。
        seedBookshelfFromOutputDir(getConfig().outputDir)
        const snapshot: BookshelfSnapshot = bookshelfSnapshot(loadBookshelf())
        writeJson(res, 200, snapshot)
        return
      }
      if (req.method === 'POST') {
        if (!isLoopbackRequest(req)) {
          writeJson(res, 403, { error: 'forbidden: loopback-only' })
          return
        }
        const body = await readJsonBody<BookCreateRequest>(req)
        const bookName = body?.bookName?.trim()
        if (bookName === undefined || bookName === '') {
          writeJson(res, 400, { error: 'bookName 不能为空' })
          return
        }
        const outputDir = body?.outputDir?.trim() !== '' && body?.outputDir !== undefined
          ? body.outputDir
          : defaultOutputDirFor(bookName)
        const book = createBook(bookName, outputDir)
        // 开书向导：创建时带大纲 → 立即建立项目（书名以大纲首行为准）。
        const outline = body?.outline?.trim()
        if (outline !== undefined && outline.length >= 50) {
          const project = createProject(outline)
          saveProject(outputDir, project)
          renameBook(book.id, project.bookName)
        }
        writeJson(res, 200, bookshelfSnapshot(loadBookshelf()))
        return
      }
      writeJson(res, 405, { error: 'method not allowed (expected GET or POST)' })
    },
  }

  // --------------------------------------------------------------- reset
  /** 重置项目：清空设定/卷/章节计划/正文/伏笔/资产/事实库（可携带新大纲）。 */
  const resetRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.reset,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = loadProject(config.outputDir)
      if (project === undefined) {
        writeJson(res, 400, { error: '输出目录中没有项目，无需重置' })
        return
      }
      const body = await readJsonBody<ResetRequest>(req)
      const outline = body?.outline?.trim()
      if (outline !== undefined && outline.length >= 50) {
        project.outline = outline
        project.bookName = createProject(outline).bookName
      }
      project.bible = undefined
      project.volumes = undefined
      project.chapters = []
      project.foreshadows = []
      project.assets = emptyProjectAssets()
      project.facts = []
      project.updatedAt = new Date().toISOString()
      saveProject(config.outputDir, project)
      writeJson(res, 200, { ok: true, bookName: project.bookName })
    },
  }

  // --------------------------------------------------- bookshelf activate
  const bookshelfActivateRoute: WebRoute = {
    kind: 'exact',
    path: '/api/dsh-novel-forge/bookshelf/activate',
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const body = await readJsonBody<BookActivateRequest>(req)
      if (body?.id === undefined || body.id === '') {
        writeJson(res, 400, { error: 'id 不能为空' })
        return
      }
      const book = activateBook(body.id)
      if (book === undefined) {
        writeJson(res, 404, { error: `书 ${body.id} 不存在` })
        return
      }
      writeJson(res, 200, bookshelfSnapshot(loadBookshelf()))
    },
  }

  // ---------------------------------------------------- bookshelf remove
  const bookshelfRemoveRoute: WebRoute = {
    kind: 'exact',
    path: '/api/dsh-novel-forge/bookshelf/remove',
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const body = await readJsonBody<BookRemoveRequest>(req)
      if (body?.id === undefined || body.id === '') {
        writeJson(res, 400, { error: 'id 不能为空' })
        return
      }
      const removed = removeBook(body.id)
      if (!removed) {
        writeJson(res, 404, { error: `书 ${body.id} 不存在` })
        return
      }
      writeJson(res, 200, bookshelfSnapshot(loadBookshelf()))
    },
  }

  // ---------------------------------------------------------------- audit
  /** 全书一致性质检。 */
  const auditRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.audit,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      try {
        const issues = await auditBook(ctx, config, project, config.outputDir)
        const response: AuditResponse = {
          issues,
          auditedChapters: project.chapters.filter(c => c.status !== 'pending' && c.status !== 'generating').length,
          auditedAt: new Date().toISOString(),
        }
        writeJson(res, 200, response)
      } catch (error) {
        writeJson(res, 500, { error: (error as Error).message })
      }
    },
  }

  // ----------------------------------------------------- characters refresh
  /** 角色卡刷新（出场统计精确化 + LLM 聚合状态）。 */
  const charactersRefreshRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.charactersRefresh,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      try {
        const cards = await refreshCharacters(ctx, config, project, config.outputDir)
        writeJson(res, 200, { cards })
      } catch (error) {
        writeJson(res, 500, { error: (error as Error).message })
      }
    },
  }

  // ------------------------------------------------------- facts backfill
  /** 事实库回填：对历史已生成章节批量抽取事实。 */
  const factsBackfillRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.factsBackfill,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      try {
        const filled = await backfillFacts(ctx, config, project, config.outputDir)
        writeJson(res, 200, { ok: true, filled })
      } catch (error) {
        writeJson(res, 500, { error: (error as Error).message })
      }
    },
  }

  // ---------------------------------------------------------- bible patch
  /** 设定圣经局部修补（世界观规则/红线/风格）。 */
  const biblePatchRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.biblePatch,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const project = requireProject(res)
      if (project === undefined) return
      if (project.bible === undefined) {
        writeJson(res, 400, { error: '尚未生成设定圣经，请先生成' })
        return
      }
      const body = await readJsonBody<BiblePatchRequest>(req)
      if (Array.isArray(body?.worldRules)) project.bible.worldRules = body.worldRules.filter(r => r.trim() !== '')
      if (Array.isArray(body?.redLines)) project.bible.redLines = body.redLines.filter(r => r.trim() !== '')
      if (Array.isArray(body?.style)) project.bible.style = body.style.filter(r => r.trim() !== '')
      project.updatedAt = new Date().toISOString()
      saveProject(config.outputDir, project)
      writeJson(res, 200, { bible: project.bible })
    },
  }

  // --------------------------------------------------------------- config
  const configRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.config,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const body = await readJsonBody<ConfigPatch>(req)
      if (body === undefined) {
        writeJson(res, 400, { error: '无效的配置 JSON' })
        return
      }
      try {
        const next = await patchConfig(body)
        writeJson(res, 200, { config: next })
      } catch (error) {
        writeJson(res, 400, { error: (error as Error).message })
      }
    },
  }

  // ---------------------------------------------------------- open-folder
  const openFolderRoute: WebRoute = {
    kind: 'exact',
    path: NOVEL_API.openFolder,
    handler: async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const config = getConfig()
      const dir = config.outputDir
      exec(`explorer "${dir.replace(/"/g, '')}"`, (error) => {
        if (error) {
          writeJson(res, 500, { ok: false, error: error.message })
        } else {
          writeJson(res, 200, { ok: true })
        }
      })
    },
  }

  return [
    statusRoute,
    loadOutlineRoute,
    saveOutlineRoute,
    bibleRoute,
    volumesRoute,
    planRoute,
    generateRoute,
    reviewRoute,
    rewriteRoute,
    polishRoute,
    draftApplyRoute,
    draftDiscardRoute,
    summaryRoute,
    foreshadowRoute,
    exportRoute,
    chapterRoute,
    assetsRoute,
    styleEngineRoute,
    assistantRoute,
    assistantHistoryRoute,
    bookshelfRoute,
    bookshelfActivateRoute,
    bookshelfRemoveRoute,
    resetRoute,
    auditRoute,
    charactersRefreshRoute,
    factsBackfillRoute,
    biblePatchRoute,
    configRoute,
    openFolderRoute,
  ]
}

// Re-export for tests / type consumers.
export type {
  ConfigPatch,
  NovelConfig,
  StatusResponse,
  PlanResponse,
  LoadOutlineResponse,
  BibleResponse,
  VolumesResponse,
  ExportResponse,
}
export { chapterFileName }
