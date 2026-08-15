/**
 * Novel engine — the host half's core: LLM-driven story-bible extraction,
 * volume planning, chapter planning, chapter-by-chapter writing with
 * auto-review + rewrite, polish (de-AI-ify), narrative summaries, foreshadow
 * tracking, project persistence, and whole-book export. Pure Node (no
 * web-server dependencies), so routes stay thin and logic is testable.
 */

import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createUserMessage, BlockAssembler, ReasoningEffortId, type GenerateOptions, type Message, type StreamChunk } from '@deepseek-ai/dsh-llm'
import type { Context } from '@deepseek-ai/cordis'
import { emptyProjectAssets, renderAllAssets, styleEngineSystemPrompt } from './assets.ts'
import type {
  ChapterPlan,
  CharacterCard,
  Foreshadow,
  NovelConfig,
  ProjectState,
  ReviewReport,
  StoryBible,
  Volume,
} from './protocol.ts'

/** Project state file name inside the output dir. */
export const PROJECT_FILE = 'novel-project.json'

// ------------------------------------------------------------------ helpers

/** Sanitize a file name: keep CJK/alphanumerics/space/dash/underscore. */
function safeFileName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
}

/** Chapter output file name, e.g. 第001章_开篇.md */
export function chapterFileName(chapter: ChapterPlan): string {
  const title = safeFileName(chapter.title) || `第${chapter.no}章`
  return `第${String(chapter.no).padStart(3, '0')}章_${title}.md`
}

/** Infer a book name from the outline's first non-empty line. */
export function inferBookName(outline: string): string {
  const line = outline.split('\n').map(l => l.trim()).find(l => l.length > 0)
  return (line ?? '未命名小说').replace(/^《/, '').replace(/》.*$/, '').slice(0, 40)
}

// ------------------------------------------------------------------ project

/** Read the persisted project from the output dir (undefined when absent). */
export function loadProject(outputDir: string): ProjectState | undefined {
  const file = join(outputDir, PROJECT_FILE)
  if (!existsSync(file)) return undefined
  try {
    let rawText = readFileSync(file, 'utf8')
    // Tolerate a UTF-8 BOM (some editors / PowerShell writes add one).
    if (rawText.charCodeAt(0) === 0xFEFF) rawText = rawText.slice(1)
    const raw = JSON.parse(rawText) as ProjectState
    if (typeof raw.outline !== 'string' || !Array.isArray(raw.chapters)) return undefined
    // Normalize legacy projects (foreshadows / assets may be missing).
    if (!Array.isArray(raw.foreshadows)) raw.foreshadows = []
    if (raw.assets === undefined || typeof raw.assets !== 'object') raw.assets = emptyProjectAssets()
    if (!Array.isArray(raw.assets.antiAiRules)) raw.assets.antiAiRules = []
    if (!Array.isArray(raw.assets.auxiliaryProgressions)) raw.assets.auxiliaryProgressions = []
    if (!Array.isArray(raw.assets.styleAssets)) raw.assets.styleAssets = []
    return raw
  } catch {
    return undefined
  }
}

/** Persist the project state next to the chapters. */
export function saveProject(outputDir: string, project: ProjectState): void {
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(join(outputDir, PROJECT_FILE), JSON.stringify(project, null, 2), 'utf8')
}

/** List generated chapter files in the output dir (sorted). */
export function listChapterFiles(outputDir: string): string[] {
  if (!existsSync(outputDir)) return []
  try {
    return readdirSync(outputDir)
      .filter(name => /^第\d+章_.*\.md$/.test(name))
      .sort((a, b) => {
        const na = Number(/^第(\d+)章/.exec(a)?.[1] ?? 0)
        const nb = Number(/^第(\d+)章/.exec(b)?.[1] ?? 0)
        return na - nb
      })
  } catch {
    return []
  }
}

/** Re-sync chapter status against files on disk (a file may exist without state). */
export function syncProjectWithDisk(project: ProjectState, outputDir: string): void {
  const files = new Map<string, string>()
  for (const file of listChapterFiles(outputDir)) {
    const no = Number(/^第(\d+)章/.exec(file)?.[1] ?? 0)
    if (no > 0) files.set(String(no), file)
  }
  for (const chapter of project.chapters) {
    const file = files.get(String(chapter.no))
    if (file !== undefined && (chapter.status === 'pending' || chapter.status === 'generating')) {
      chapter.status = 'written'
      chapter.file = file
    }
  }
  project.updatedAt = new Date().toISOString()
}

/** Read a chapter's markdown body from disk (undefined when missing). */
export function readChapterFile(outputDir: string, chapter: ChapterPlan): string | undefined {
  if (chapter.file === undefined) return undefined
  const path = join(outputDir, chapter.file)
  if (!existsSync(path)) return undefined
  return readFileSync(path, 'utf8')
}

/** Create a fresh project from an outline. */
export function createProject(outline: string, outlinePath?: string): ProjectState {
  const now = new Date().toISOString()
  return {
    bookName: inferBookName(outline),
    outline,
    outlinePath,
    chapters: [],
    foreshadows: [],
    assets: emptyProjectAssets(),
    createdAt: now,
    updatedAt: now,
  }
}

// ------------------------------------------------------------------- llm

/** One complete non-streaming LLM call. */
async function complete(
  ctx: Context,
  config: NovelConfig,
  options: { system: string; user: string; temperature?: number; maxTokens?: number },
): Promise<string> {
  const messages: Message[] = [createUserMessage({
    content: [{ type: 'text', text: options.user }],
    source: { kind: 'plugin', plugin: 'dsh-novel-forge' },
  })]
  const request: GenerateOptions = {
    provider: config.provider,
    model: config.model,
    messages,
    system: options.system,
    maxTokens: options.maxTokens ?? config.maxTokens,
    temperature: options.temperature ?? 0.7,
  }
  const assembler = new BlockAssembler()
  for await (const chunk of ctx.llm.stream(request)) {
    assembler.push(chunk)
  }
  const finish = assembler.finish
  if (finish.kind === 'error' || finish.kind === 'aborted') {
    throw new Error(`LLM 调用失败（${finish.kind}）: ${finish.failure.message}`)
  }
  if (finish.kind === 'max-tokens') {
    throw new Error('LLM 输出达到 maxTokens 上限，请增大配置后重试')
  }
  const blocks = assembler.blocks()
  // Diagnostics: log the assembled block shape (reasoning-only turns yield no
  // text blocks — the v4-flash model can answer entirely in the reasoning
  // channel, which the adapter surfaces as a reasoning block).
  if (process.env.DSH_NOVEL_DEBUG === '1') {
    console.error('[dsh-novel-forge] complete: finish=%j blocks=%j', JSON.stringify(finish), blocks.map(b => `${b.type}:${'text' in b ? b.text.length : '?'}`))
  }
  const textBlocks = blocks
    .filter((block): block is Extract<StreamChunk, { type: 'block-end' }>['block'] & { type: 'text' } => block.type === 'text')
    .map(block => block.text)
  let text = textBlocks.join('\n').trim()
  // v4-flash can answer entirely in the reasoning channel (the adapter
  // surfaces that as a 'reasoning' block). Fall back to it when no text came
  // back — the reasoning content is the model's actual answer here.
  if (text === '') {
    const reasoning = blocks
      .filter((block): block is { type: 'reasoning'; text: string } => block.type === 'reasoning')
      .map(block => block.text)
      .join('\n')
      .trim()
    if (reasoning !== '') text = reasoning
  }
  return text
}

/**
 * Parse a JSON value out of a model response. Multi-level tolerance because
 * models are sloppy: prose around the JSON, ```json fences, a truncated tail,
 * or raw newlines inside string values all defeat a single JSON.parse. We
 * walk candidates from strictest to loosest.
 */
function parseJson<T>(text: string, wantArray: boolean): T {
  const candidates: string[] = []
  const push = (value: string | undefined): void => {
    if (value !== undefined && value.trim() !== '') candidates.push(value.trim())
  }

  // 1. Whole response, and any ```json fence body.
  push(text)
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)
  push(fenced?.[1])
  // 2. From the first opener to the last closer.
  const opener = wantArray ? '[' : '{'
  const closer = wantArray ? ']' : '}'
  const start = text.indexOf(opener)
  const end = text.lastIndexOf(closer)
  if (start !== -1 && end > start) push(text.slice(start, end + 1))
  // 3. Trim trailing prose (a "}..." tail after the last closer).
  const trimmed = text.replace(new RegExp(`${closer}[\\s\\S]*$`), closer)
  push(trimmed)
  const start2 = trimmed.indexOf(opener)
  if (start2 !== -1) push(trimmed.slice(start2))

  // Repair: models love raw newlines inside string values, which JSON forbids.
  const repair = (value: string): string => {
    let out = ''
    let inString = false
    for (let i = 0; i < value.length; i++) {
      const ch = value[i]!
      if (inString) {
        if (ch === '\\') {
          out += ch + (value[i + 1] ?? '')
          i++
          continue
        }
        if (ch === '"') {
          inString = false
          out += ch
          continue
        }
        if (ch === '\n' || ch === '\r') {
          out += '\\n'
          continue
        }
        out += ch
      } else {
        if (ch === '"') inString = true
        out += ch
      }
    }
    return out
  }

  for (const candidate of candidates) {
    for (const attempt of [candidate, repair(candidate)]) {
      try {
        return JSON.parse(attempt) as T
      } catch {
        // try the next candidate
      }
    }
  }
  const preview = text.length > 300 ? text.slice(0, 300) + '…' : text
  throw new Error(`模型输出中未找到 JSON 数据。模型原始输出：${preview}`)
}

/** Parse a JSON array (chapters, volumes, issues...). */
function parseJsonArray<T>(text: string): T[] {
  const value = parseJson<T[]>(text, true)
  return Array.isArray(value) ? value : []
}

/** Parse a JSON object. */
function parseJsonObject<T>(text: string): T {
  const value = parseJson<T>(text, false)
  if (typeof value !== 'object' || value === null) throw new Error('模型输出不是 JSON 对象')
  return value
}

// ------------------------------------------------------------------ bible

/** System prompt for story-bible extraction. */
function bibleSystemPrompt(): string {
  return [
    '你是一位资深网文编辑兼设定架构师。你会收到一份小说大纲，请把它提炼成结构化的「设定圣经」(Story Bible)，供后续写作时严格引用。',
    '要求：',
    '1. 忠于大纲，不自行发明大纲之外的设定。',
    '2. 角色卡覆盖大纲明确出现的角色（主角必含），每个角色给出性格标签、目标、关键关系。',
    '3. 世界规则覆盖力量体系、金手指机制、势力、地理等所有硬性规则，逐条列出。',
    '4. 红线列出大纲中明确禁止的内容（如无后宫、不圣母、无无脑碾压等）。',
    '5. 风格列出叙事基调、节奏、POV 等写作风格要点。',
    '输出必须是合法 JSON 对象，不要输出任何其他文字或 Markdown 代码块标记。',
    '重要：所有字符串值内部不得包含换行符（不要用多行字符串），JSON 必须在一段内完整结束。',
    '重要：直接输出 JSON 结果本身，不要把思考过程或推理内容写在输出里。',
    'JSON 结构：',
    '{"genre": "题材与基调一句话", "worldRules": ["规则1", "规则2", ...], "characters": [{"name": "角色名", "role": "protagonist|supporting|antagonist|other", "traits": ["标签1", ...], "goals": "目标与动机", "relations": "关键关系"}], "redLines": ["红线1", ...], "style": ["风格1", ...]}',
  ].join('\n')
}

/** Extract the story bible from an outline. */
export async function extractBible(ctx: Context, config: NovelConfig, outline: string): Promise<StoryBible> {
  const user = `请为下面这部小说提炼设定圣经：\n\n${outline}`
  const text = await complete(ctx, config, {
    system: bibleSystemPrompt(),
    user,
    temperature: 0.4,
    maxTokens: Math.max(config.maxTokens, 16000),
  })
  const raw = parseJsonObject<{
    genre?: unknown
    worldRules?: unknown
    characters?: unknown
    redLines?: unknown
    style?: unknown
  }>(text)
  const strArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '') : []
  const characters: CharacterCard[] = Array.isArray(raw.characters)
    ? raw.characters
        .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
        .map(entry => ({
          name: typeof entry.name === 'string' ? entry.name.trim() : '未命名',
          role: (['protagonist', 'supporting', 'antagonist', 'other'] as const).includes(entry.role as never)
            ? entry.role as CharacterCard['role']
            : 'other',
          traits: strArray(entry.traits),
          goals: typeof entry.goals === 'string' ? entry.goals : '',
          relations: typeof entry.relations === 'string' ? entry.relations : '',
        }))
        .filter(card => card.name !== '')
    : []
  const bible: StoryBible = {
    genre: typeof raw.genre === 'string' ? raw.genre : '',
    worldRules: strArray(raw.worldRules),
    characters,
    redLines: strArray(raw.redLines),
    style: strArray(raw.style),
    generatedAt: new Date().toISOString(),
  }
  if (bible.worldRules.length === 0 && bible.characters.length === 0 && bible.redLines.length === 0) {
    throw new Error('设定圣经生成失败：模型没有返回有效内容')
  }
  return bible
}

// ------------------------------------------------------------------ volumes

/** System prompt for volume planning. */
function volumeSystemPrompt(): string {
  return [
    '你是一位资深网文总编。你会收到一份小说大纲，请把全书划分为若干「卷」（分卷），每卷有明确的剧情定位与起止章节。',
    '要求：',
    '1. 大纲已有分卷时，严格遵循大纲的分卷结构；没有时按剧情弧线合理划分（3-8 卷）。',
    '2. 卷定位一句话说明该卷的剧情重心。',
    '3. chapterStart/chapterEnd 给出该卷覆盖的章节区间（从 1 开始连续编号）。',
    '输出必须是合法 JSON 数组，不要输出任何其他文字：',
    '[{"no": 1, "title": "卷名", "summary": "卷定位与剧情重心", "chapterStart": 1, "chapterEnd": 80}]',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
    '重要：直接输出 JSON 结果本身，不要把思考过程或推理内容写在输出里。',
  ].join('\n')
}

/** Plan volumes from an outline. */
export async function planVolumes(ctx: Context, config: NovelConfig, outline: string): Promise<Volume[]> {
  const user = `请为下面这部小说划分卷：\n\n${outline}`
  const text = await complete(ctx, config, { system: volumeSystemPrompt(), user, temperature: 0.4 })
  const parsed = parseJsonArray<Record<string, unknown>>(text)
  const volumes: Volume[] = []
  for (let i = 0; i < parsed.length; i++) {
    const entry = parsed[i]
    if (typeof entry !== 'object' || entry === null) continue
    const no = typeof entry.no === 'number' ? entry.no : i + 1
    const title = typeof entry.title === 'string' ? entry.title.trim() : `第${no}卷`
    const summary = typeof entry.summary === 'string' ? entry.summary.trim() : ''
    const start = typeof entry.chapterStart === 'number' ? entry.chapterStart : undefined
    const end = typeof entry.chapterEnd === 'number' ? entry.chapterEnd : undefined
    volumes.push({
      no,
      title: title.slice(0, 40),
      summary: summary.slice(0, 300),
      chapterStart: start ?? 1,
      chapterEnd: end ?? 1,
    })
  }
  if (volumes.length === 0) throw new Error('卷计划生成失败：模型没有返回有效卷')
  return volumes
}

/** Assign a chapter to its volume by number. */
function volumeOf(chapterNo: number, volumes: Volume[] | undefined): number {
  if (volumes === undefined || volumes.length === 0) return 0
  for (const volume of volumes) {
    if (chapterNo >= volume.chapterStart && chapterNo <= volume.chapterEnd) return volume.no
  }
  return volumes[volumes.length - 1]?.no ?? 0
}

// ------------------------------------------------------------------- plan

/** The chapter-planning prompt template. */
function planSystemPrompt(volumes: Volume[] | undefined): string {
  const volumeBlock = volumes !== undefined && volumes.length > 0
    ? ['\n全书分卷结构（规划章节时需落在对应卷内）：']
      .concat(volumes.map(v => `第${v.no}卷《${v.title}》：${v.summary}（章节 ${v.chapterStart}-${v.chapterEnd}）`))
      .join('\n')
    : ''
  return [
    '你是一位资深中文网文策划编辑，擅长把小说大纲拆解为可执行的章节计划。',
    '你会收到一份小说大纲。请根据大纲的设定、主线与节奏，规划出一份章节计划。',
    '要求：',
    '1. 每章必须有明确的核心剧情推进（不能只是过渡或凑字数）。',
    '2. 章节之间要衔接自然，前章结尾为后章埋下钩子。',
    '3. 严格遵循大纲的人设、金手指规则、战力体系与世界观设定，不得自行发明冲突设定。',
    '4. 输出必须是合法的 JSON 数组，不要输出任何其他文字或 Markdown 代码块标记。',
    '5. 数组每个元素格式：{"title": "章节标题（10字以内，有网文感）", "beats": "本章剧情要点（150-250字，含起承转合与钩子）"}',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
    '重要：直接输出 JSON 结果本身，不要把思考过程或推理内容写在输出里。',
    volumeBlock,
  ].join('\n')
}

/** Build the writing system prompt (bible + outline + active foreshadows). */
function writeSystemPrompt(project: ProjectState): string {
  const bible = project.bible
  const sections: string[] = []
  if (bible !== undefined) {
    sections.push('==================== 设定圣经（写作时严格遵守） ====================')
    if (bible.genre !== '') sections.push(`题材基调：${bible.genre}`)
    if (bible.worldRules.length > 0) sections.push('世界规则：\n' + bible.worldRules.map(r => `- ${r}`).join('\n'))
    if (bible.characters.length > 0) {
      sections.push('角色卡：')
      for (const card of bible.characters) {
        const roleName = { protagonist: '主角', supporting: '配角', antagonist: '反派', other: '其他' }[card.role]
        sections.push(`- ${card.name}（${roleName}）：${card.traits.join('、')}${card.goals !== '' ? `；目标：${card.goals}` : ''}${card.relations !== '' ? `；关系：${card.relations}` : ''}`)
      }
    }
    if (bible.redLines.length > 0) sections.push('写作红线（违反即失败）：\n' + bible.redLines.map(r => `- ${r}`).join('\n'))
    if (bible.style.length > 0) sections.push('风格要求：\n' + bible.style.map(r => `- ${r}`).join('\n'))
  }
  sections.push('==================== 全书大纲 ====================')
  sections.push(project.outline)
  sections.push('==================== 大纲结束 ====================')
  const assetsBlock = renderAllAssets(project.assets)
  if (assetsBlock !== '') sections.push(assetsBlock)
  const active = project.foreshadows.filter(f => f.status === 'planted' || f.status === 'progressing')
  if (active.length > 0) {
    sections.push('==================== 活跃伏笔（近期需推进或回收的线索） ====================')
    for (const f of active) {
      sections.push(`- [${f.status === 'planted' ? '已埋设' : '推进中'}] ${f.description}${f.targetChapter !== undefined ? `（预计 ${f.targetChapter} 章回收）` : ''}`)
    }
  }
  sections.push('')
  sections.push('写作硬性要求：')
  sections.push('1. 每章 3000-4000 字（按中文字符计），只输出章节正文，不要输出标题、章回名、作者的话或任何 Markdown 标记。')
  sections.push('2. 以主角视角展开，动作、对话、心理描写交替推进，禁止大段设定说明。')
  sections.push('3. 尊重大纲与设定圣经：人设不崩、金手指规则不自相矛盾、战力不随意膨胀。')
  sections.push('4. 章末留一个钩子（悬念、反转或新线索），吸引读者读下一章。')
  sections.push('5. 语言流畅自然，符合中文网文语感，避免翻译腔与病句。')
  return sections.join('\n')
}

/**
 * Plan chapters from an outline (optionally for one volume).
 */
export async function planChapters(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  chapterCount: number,
  volumeNo?: number,
): Promise<ChapterPlan[]> {
  const volume = project.volumes?.find(v => v.no === volumeNo)
  const user = [
    '请为下面这部小说规划章节。',
    volume !== undefined
      ? `本次只规划第 ${volume.no} 卷《${volume.title}》的章节：\n${volume.summary}`
      : '请规划全书开篇章节。',
    `大纲如下：\n${project.outline}`,
    '',
    `请规划 ${chapterCount} 章。输出 JSON 数组（不要输出其他文字）：`,
  ].join('\n')
  const text = await complete(ctx, config, { system: planSystemPrompt(project.volumes), user, temperature: 0.7 })
  const parsed = parseJsonArray<Record<string, unknown>>(text)
  const chapters: ChapterPlan[] = []
  const existing = new Set(project.chapters.map(c => c.no))
  const startNo = project.chapters.length + 1
  for (let i = 0; i < Math.min(parsed.length, chapterCount); i++) {
    const item = parsed[i]
    if (typeof item !== 'object' || item === null) continue
    const entry = item as Record<string, unknown>
    const title = typeof entry.title === 'string' ? entry.title.trim().slice(0, 30) : ''
    const beats = typeof entry.beats === 'string' ? entry.beats.trim() : ''
    if (title === '' && beats === '') continue
    const no = startNo + i
    if (existing.has(no)) continue
    chapters.push({
      no,
      volume: volumeOf(no, project.volumes),
      title: title || `第${no}章`,
      beats,
      targetChars: config.chapterChars,
      status: 'pending',
    })
  }
  if (chapters.length === 0) {
    throw new Error('章节计划生成失败：模型没有返回有效章节')
  }
  return chapters
}

// ------------------------------------------------------------------ writing

/** The review system prompt. */
function reviewSystemPrompt(project: ProjectState): string {
  const bible = project.bible
  const sections: string[] = [
    '你是一位严格的网文审稿编辑。你会收到一章正文以及本书的设定圣经与红线。',
    '请从以下维度审查本章：',
    '1. 人设一致性：角色行为是否符合角色卡（主角不圣母、不无脑、痞坏有分寸等）。',
    '2. 设定一致性：金手指规则、战力体系、世界观是否与设定圣经冲突。',
    '3. 红线检查：是否触犯写作红线（无后宫、无擦边、无无脑碾压等）。',
    '4. 文笔质量：语病、翻译腔、AI 套话（"不禁""仿佛""一时间"等高频词滥用）、流水账。',
    '5. 节奏与爽点：本章是否有推进、有钩子，是否拖沓灌水。',
    '6. 逻辑漏洞：前后矛盾、时间线错误、对话失真。',
    '7. 反 AI 规则：逐条核对下方「反 AI 规则」清单，命中即列为问题。',
    '输出必须是合法 JSON 对象，不要输出任何其他文字：',
    '{"score": 0-100的整数, "verdict": "一句话总评", "issues": [{"severity": "high|medium|low", "item": "问题描述", "suggestion": "修改建议"}]}',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
    '重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。',
  ]
  const assetsBlock = renderAllAssets(project.assets)
  if (assetsBlock !== '') sections.push('\n' + assetsBlock)
  if (bible !== undefined) {
    sections.push('\n==================== 设定圣经 ====================')
    if (bible.worldRules.length > 0) sections.push('世界规则：\n' + bible.worldRules.map(r => `- ${r}`).join('\n'))
    if (bible.characters.length > 0) {
      sections.push('角色卡：')
      for (const card of bible.characters) {
        sections.push(`- ${card.name}（${card.role}）：${card.traits.join('、')}`)
      }
    }
    if (bible.redLines.length > 0) sections.push('红线：\n' + bible.redLines.map(r => `- ${r}`).join('\n'))
  }
  return sections.join('\n')
}

/** Run the AI review on one chapter. */
export async function reviewChapter(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  chapterNo: number,
): Promise<ReviewReport> {
  const chapter = project.chapters.find(c => c.no === chapterNo)
  if (chapter === undefined) throw new Error(`章节 ${chapterNo} 不在计划中`)
  const body = readChapterFile(outputDir, chapter)
  if (body === undefined) throw new Error(`章节 ${chapterNo} 的正文文件不存在`)
  const user = [
    `本章标题：《${chapter.title}》`,
    `本章剧情要点：${chapter.beats}`,
    '==================== 章节正文 ====================',
    body.replace(/^#\s+.*$/m, '').trim(),
  ].join('\n')
  const text = await complete(ctx, config, { system: reviewSystemPrompt(project), user, temperature: 0.3 })
  const raw = parseJsonObject<{ score?: unknown; verdict?: unknown; issues?: unknown }>(text)
  const issues = Array.isArray(raw.issues)
    ? raw.issues
        .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
        .map(entry => ({
          severity: (['high', 'medium', 'low'] as const).includes(entry.severity as never)
            ? entry.severity as 'high' | 'medium' | 'low'
            : 'medium',
          item: typeof entry.item === 'string' ? entry.item : '',
          suggestion: typeof entry.suggestion === 'string' ? entry.suggestion : '',
        }))
        .filter(issue => issue.item !== '')
    : []
  const score = typeof raw.score === 'number' ? Math.max(0, Math.min(100, Math.round(raw.score))) : 60
  const report: ReviewReport = {
    score,
    passed: score >= config.reviewPassScore,
    verdict: typeof raw.verdict === 'string' ? raw.verdict.slice(0, 200) : '',
    issues,
    reviewedAt: new Date().toISOString(),
  }
  chapter.review = report
  chapter.status = report.passed ? 'approved' : 'rejected'
  project.updatedAt = new Date().toISOString()
  saveProject(outputDir, project)
  return report
}

/** Build the rewrite system prompt (fix review issues / instructions). */
function rewriteSystemPrompt(project: ProjectState): string {
  const base = writeSystemPrompt(project)
  return base + '\n\n额外要求：你正在【修订】一章已写好的正文。保留原文中好的部分，只修改需要修改的地方，输出完整的新正文（不要只输出修改片段），字数与原文相当。'
}

/**
 * Stream a chapter rewrite. With `target` (a passage of the body), only that
 * passage's paragraph is rewritten and spliced back — everything else stays
 * untouched (local revision). Without `target`, the whole chapter is
 * rewritten. Yields delta text; persists when done.
 */
export async function* rewriteChapterStream(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  chapterNo: number,
  instructions: string,
  target?: string,
): AsyncGenerator<{ frame: 'start' } | { frame: 'delta'; text: string } | { frame: 'done'; file: string; chars: number }, void, unknown> {
  const chapter = project.chapters.find(c => c.no === chapterNo)
  if (chapter === undefined) throw new Error(`章节 ${chapterNo} 不在计划中`)
  const body = readChapterFile(outputDir, chapter)
  if (body === undefined) throw new Error(`章节 ${chapterNo} 的正文文件不存在`)

  const reviewBlock = chapter.review !== undefined
    ? '审稿意见：\n' + chapter.review.issues.map(i => `[${i.severity}] ${i.item} → ${i.suggestion}`).join('\n')
    : ''

  // Local revision: find the paragraph containing `target` and only rewrite it.
  const bodyText = body.replace(/^#\s+.*$/m, '').trim()
  let localTarget: { paragraph: string; before: string; after: string } | undefined
  if (target !== undefined && target.trim() !== '') {
    const wanted = target.trim()
    // Normalize whitespace so multi-line / quoted snippets still match:
    // the assistant often copies a passage with line breaks and quotes.
    const normalize = (value: string): string => value.replace(/\s+/g, ' ').replace(/[“”"'‘’]/g, '')
    const wantedFlat = normalize(wanted)
    // Split into paragraphs on blank lines (or double newlines).
    const paragraphs = bodyText.split(/\n{2,}/)
    const idx = paragraphs.findIndex(p => normalize(p).includes(wantedFlat))
    if (idx === -1) {
      throw new Error(`在正文中未找到要修改的片段：「${wanted.slice(0, 40)}…」。请从正文中复制原文片段（无需整段，取片段即可）。`)
    }
    localTarget = {
      paragraph: paragraphs[idx]!,
      before: paragraphs.slice(0, idx).join('\n\n'),
      after: paragraphs.slice(idx + 1).join('\n\n'),
    }
  }

  const user = localTarget === undefined
    ? [
        `请修订第 ${chapter.no} 章《${chapter.title}》。`,
        reviewBlock,
        instructions !== '' ? `本次修订重点：${instructions}` : '',
        '==================== 原正文 ====================',
        bodyText,
      ].filter(line => line !== '').join('\n')
    : [
        `请修订第 ${chapter.no} 章《${chapter.title}》中的一个自然段。`,
        instructions !== '' ? `修改要求：${instructions}` : '',
        '==================== 需要修改的原文段落 ====================',
        localTarget.paragraph,
        '',
        '要求：',
        '1. 只输出修改后的【这一个段落】的完整新文本，不要输出任何说明、标题或 Markdown 标记。',
        '2. 保留该段的情节走向与角色口吻，只按修改要求调整。',
        '3. 段落长度与原文相当。',
      ].filter(line => line !== '').join('\n')

  const system = localTarget === undefined
    ? rewriteSystemPrompt(project)
    : '你是一位中文网文润色师。你会收到一章中的一个段落，请按修改要求重写该段。只输出新段落文本。'

  const messages: Message[] = [createUserMessage({
    content: [{ type: 'text', text: user }],
    source: { kind: 'plugin', plugin: 'dsh-novel-forge' },
  })]
  const request: GenerateOptions = {
    provider: config.provider,
    model: config.model,
    messages,
    system,
    // Rewriting outputs a full chapter: budget generously and skip
    // reasoning (a transform task) so the whole budget goes to the body.
    maxTokens: Math.max(config.maxTokens, 20000),
    temperature: 0.7,
    reasoningEffort: ReasoningEffortId('off'),
  }

  yield { frame: 'start' }
  const assembler = new BlockAssembler()
  let streamError: Error | undefined
  for await (const chunk of ctx.llm.stream(request)) {
    assembler.push(chunk)
    if (chunk.type === 'text-delta') yield { frame: 'delta', text: chunk.text }
  }
  const finish = assembler.finish
  if (finish.kind === 'error' || finish.kind === 'aborted') {
    streamError = new Error(`修订失败（${finish.kind}）: ${finish.failure.message}`)
  } else if (finish.kind === 'max-tokens') {
    streamError = new Error('修订输出达到 maxTokens 上限，请增大配置后重试')
  }
  const rewritten = assembler
    .blocks()
    .filter((block): block is Extract<StreamChunk, { type: 'block-end' }>['block'] & { type: 'text' } => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim()
  if (streamError !== undefined) throw streamError
  if (rewritten.length < 20) throw new Error('修订结果过短，可能失败，请重试')

  // Splice: local -> replace the paragraph; whole -> replace the body.
  let newBody: string
  if (localTarget !== undefined) {
    newBody = [localTarget.before, rewritten, localTarget.after].filter(part => part !== '').join('\n\n')
  } else {
    newBody = rewritten
  }
  if (newBody.length < 100) throw new Error('修订结果过短，可能失败，请重试')

  const fileName = chapterFileName(chapter)
  const markdown = `# 第${chapter.no}章 ${chapter.title}\n\n${newBody}\n`
  writeFileSync(join(outputDir, fileName), markdown, 'utf8')
  chapter.status = 'written'
  chapter.chars = newBody.length
  chapter.error = undefined
  chapter.review = undefined
  project.updatedAt = new Date().toISOString()
  saveProject(outputDir, project)
  yield { frame: 'done', file: fileName, chars: newBody.length }
}

/** The de-AI-ify polish system prompt (with project writing assets injected). */
function polishSystemPrompt(project: ProjectState): string {
  const assetsBlock = renderAllAssets(project.assets)
  return [
    '你是一位中文网文润色师。你会收到一章正文，请做「去 AI 味」润色：',
    '1. 删除/替换 AI 高频套话与模式词：如"不禁""仿佛""一时间""不由得""顿时""然而""缓缓""轻轻""微微""默默""似乎""终于"等滥用。',
    '2. 把书面翻译腔改成口语化的中文网文语感。',
    '3. 拆分过长的排比句与堆砌的修饰语。',
    '4. 保留全部情节、人物、对话内容不变，只改表达。',
    '5. 输出完整的新正文，不要输出任何说明文字或 Markdown 标记。',
    '6. 必须遵守下方「反 AI 规则」与「写法资产」的表达边界；写法资产要求保留的风格特征（句式、台词、节奏）不得在润色中丢失。',
    assetsBlock !== '' ? assetsBlock : '',
  ].join('\n')
}

/** Stream a chapter polish (de-AI-ify). */
export async function* polishChapterStream(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  chapterNo: number,
): AsyncGenerator<{ frame: 'start' } | { frame: 'delta'; text: string } | { frame: 'done'; file: string; chars: number }, void, unknown> {
  const chapter = project.chapters.find(c => c.no === chapterNo)
  if (chapter === undefined) throw new Error(`章节 ${chapterNo} 不在计划中`)
  const body = readChapterFile(outputDir, chapter)
  if (body === undefined) throw new Error(`章节 ${chapterNo} 的正文文件不存在`)
  const messages: Message[] = [createUserMessage({
    content: [{ type: 'text', text: body.replace(/^#\s+.*$/m, '').trim() }],
    source: { kind: 'plugin', plugin: 'dsh-novel-forge' },
  })]
  const request: GenerateOptions = {
    provider: config.provider,
    model: config.model,
    messages,
    system: polishSystemPrompt(project),
    // Polish rewrites the whole chapter: generous budget, no reasoning
    // (transform task — the entire budget should go to the body).
    maxTokens: Math.max(config.maxTokens, 20000),
    temperature: 0.5,
    reasoningEffort: ReasoningEffortId('off'),
  }
  yield { frame: 'start' }
  const assembler = new BlockAssembler()
  let streamError: Error | undefined
  for await (const chunk of ctx.llm.stream(request)) {
    assembler.push(chunk)
    if (chunk.type === 'text-delta') yield { frame: 'delta', text: chunk.text }
  }
  const finish = assembler.finish
  if (finish.kind === 'error' || finish.kind === 'aborted') {
    streamError = new Error(`润色失败（${finish.kind}）: ${finish.failure.message}`)
  } else if (finish.kind === 'max-tokens') {
    streamError = new Error('润色输出达到 maxTokens 上限')
  }
  const newBody = assembler
    .blocks()
    .filter((block): block is Extract<StreamChunk, { type: 'block-end' }>['block'] & { type: 'text' } => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim()
  if (streamError !== undefined) throw streamError
  if (newBody.length < 100) throw new Error('润色结果过短，可能失败，请重试')
  const fileName = chapterFileName(chapter)
  writeFileSync(join(outputDir, fileName), `# 第${chapter.no}章 ${chapter.title}\n\n${newBody}\n`, 'utf8')
  chapter.status = 'written'
  chapter.chars = newBody.length
  project.updatedAt = new Date().toISOString()
  saveProject(outputDir, project)
  yield { frame: 'done', file: fileName, chars: newBody.length }
}

/** Generate one chapter (streaming). Yields progress frames; persists when done. */
export async function* generateChapterStream(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  chapterNo: number,
): AsyncGenerator<{ frame: 'start' } | { frame: 'delta'; text: string } | { frame: 'done'; file: string; chars: number }, void, unknown> {
  const chapter = project.chapters.find(c => c.no === chapterNo)
  if (chapter === undefined) throw new Error(`章节 ${chapterNo} 不在计划中`)
  // Note: the route layer owns the 'generating' status + concurrency guard;
  // this function must not refuse when status is 'generating' (the route sets
  // it before calling us).

  // Continuity: previous chapter's ending + its summary (narrative memory).
  let continuity = ''
  const prev = project.chapters.find(c => c.no === chapterNo - 1)
  if (prev?.file !== undefined) {
    const prevPath = join(outputDir, prev.file)
    if (existsSync(prevPath)) {
      const text = readFileSync(prevPath, 'utf8')
      continuity = text.slice(-900)
    }
  }
  const prevSummary = prev?.summary

  const user = [
    `现在写第 ${chapter.no} 章，标题《${chapter.title}》。`,
    `本章剧情要点：${chapter.beats}`,
    '',
    prevSummary !== undefined && prevSummary !== ''
      ? `上一章摘要：${prevSummary}`
      : '',
    continuity !== ''
      ? `上一章结尾（用于衔接，不要复述）：\n${continuity}`
      : '这是第一章，注意开篇要有吸引力。',
    '',
    `请写 ${chapter.targetChars} 字左右的正文，只输出正文。`,
  ].filter(line => line !== '').join('\n')

  const messages: Message[] = [createUserMessage({
    content: [{ type: 'text', text: user }],
    source: { kind: 'plugin', plugin: 'dsh-novel-forge' },
  })]
  const request: GenerateOptions = {
    provider: config.provider,
    model: config.model,
    messages,
    system: writeSystemPrompt(project),
    // Full-chapter output: budget generously (4000 chars ≈ 8-12k tokens,
    // plus the model's reasoning channel).
    maxTokens: Math.max(config.maxTokens, 20000),
    temperature: 0.85,
  }

  yield { frame: 'start' }

  const assembler = new BlockAssembler()
  let streamError: Error | undefined
  for await (const chunk of ctx.llm.stream(request)) {
    assembler.push(chunk)
    if (chunk.type === 'text-delta') {
      yield { frame: 'delta', text: chunk.text }
    }
  }
  const finish = assembler.finish
  if (finish.kind === 'error' || finish.kind === 'aborted') {
    streamError = new Error(`生成失败（${finish.kind}）: ${finish.failure.message}`)
  } else if (finish.kind === 'max-tokens') {
    streamError = new Error('达到 maxTokens 上限，正文可能不完整，请增大 maxTokens 后重试')
  }
  const body = assembler
    .blocks()
    .filter((block): block is Extract<StreamChunk, { type: 'block-end' }>['block'] & { type: 'text' } => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim()
  if (streamError !== undefined) throw streamError
  if (body.length < 100) throw new Error('生成内容过短，可能失败，请重试')

  // Write the chapter file.
  const fileName = chapterFileName(chapter)
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(join(outputDir, fileName), `# 第${chapter.no}章 ${chapter.title}\n\n${body}\n`, 'utf8')

  chapter.status = 'written'
  chapter.chars = body.length
  chapter.file = fileName
  chapter.error = undefined
  project.updatedAt = new Date().toISOString()
  saveProject(outputDir, project)

  yield { frame: 'done', file: fileName, chars: body.length }
}

/** Generate a chapter summary (narrative memory). */
export async function summarizeChapter(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  chapterNo: number,
): Promise<string> {
  const chapter = project.chapters.find(c => c.no === chapterNo)
  if (chapter === undefined) throw new Error(`章节 ${chapterNo} 不在计划中`)
  const body = readChapterFile(outputDir, chapter)
  if (body === undefined) throw new Error(`章节 ${chapterNo} 的正文文件不存在`)
  const system = [
    '你是一位网文编辑。请为下面一章写一段 120-200 字的摘要，供后续章节写作时保持连贯性。',
    '摘要必须包含：本章发生的关键事件、主角状态变化（境界/资源/伤势/心境）、新增的伏笔或线索、角色关系变化。',
    '用客观陈述句，不要评价，不要剧透式感叹。只输出摘要正文。',
  ].join('\n')
  const user = body.replace(/^#\s+.*$/m, '').trim()
  const summary = await complete(ctx, config, { system, user, temperature: 0.3, maxTokens: 800 })
  chapter.summary = summary.slice(0, 500)
  project.updatedAt = new Date().toISOString()
  saveProject(outputDir, project)
  return chapter.summary
}

// ------------------------------------------------------------- foreshadows

/** System prompt for foreshadow suggestions. */
function foreshadowSystemPrompt(): string {
  return [
    '你是一位网文伏笔设计师。你会收到大纲和已写的章节信息，请为小说建议 3-8 条值得埋设的伏笔。',
    '要求：',
    '1. 伏笔必须有明确的回收价值（推动主线、人物弧光、世界观揭秘）。',
    '2. 描述要具体，指出埋设章节与预计回收章节（可空缺）。',
    '3. 优先从大纲的暗线（如记忆代价、残片收集、身世谜团）中提炼。',
    '输出必须是合法 JSON 数组：',
    '[{"description": "伏笔描述", "plantedChapter": 章节号或null, "targetChapter": 章节号或null}]',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
  ].join('\n')
}

/** Suggest foreshadows from the outline + plan. */
export async function suggestForeshadows(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
): Promise<Foreshadow[]> {
  const user = [
    '请为下面这部小说设计伏笔。',
    `大纲：\n${project.outline}`,
    `已规划章节数：${project.chapters.length}`,
  ].join('\n')
  const text = await complete(ctx, config, { system: foreshadowSystemPrompt(), user, temperature: 0.5 })
  const parsed = parseJsonArray<Record<string, unknown>>(text)
  const existing = new Set(project.foreshadows.map(f => f.description))
  const created: Foreshadow[] = []
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) continue
    const description = typeof entry.description === 'string' ? entry.description.trim() : ''
    if (description === '' || existing.has(description)) continue
    existing.add(description)
    created.push({
      id: `fs-${Date.now().toString(36)}-${created.length}`,
      description: description.slice(0, 200),
      plantedChapter: typeof entry.plantedChapter === 'number' ? entry.plantedChapter : undefined,
      targetChapter: typeof entry.targetChapter === 'number' ? entry.targetChapter : undefined,
      status: 'planned',
    })
  }
  project.foreshadows.push(...created)
  project.updatedAt = new Date().toISOString()
  return created
}

// -------------------------------------------------------------- style asset

/**
 * 写法引擎：从样本文本提取一份写法资产（叙事风格规则）。
 * @returns 提取出的风格规则（未持久化，由调用方存入 project.assets）。
 */
export async function extractStyleAsset(
  ctx: Context,
  config: NovelConfig,
  sampleText: string,
): Promise<{ proseRules: string[]; dialogueRules: string[]; descriptionRules: string[]; boundaries: string[] }> {
  const user = `请分析下面这段样本文本，提炼其叙事风格规则：\n\n${sampleText}`
  const text = await complete(ctx, config, { system: styleEngineSystemPrompt(), user, temperature: 0.3 })
  const raw = parseJsonObject<{ proseRules?: unknown; dialogueRules?: unknown; descriptionRules?: unknown; boundaries?: unknown }>(text)
  const strArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '') : []
  const result = {
    proseRules: strArray(raw.proseRules),
    dialogueRules: strArray(raw.dialogueRules),
    descriptionRules: strArray(raw.descriptionRules),
    boundaries: strArray(raw.boundaries),
  }
  if (result.proseRules.length + result.dialogueRules.length + result.descriptionRules.length + result.boundaries.length === 0) {
    throw new Error('写法提取失败：模型没有返回有效规则')
  }
  return result
}

// ------------------------------------------------------------------ export

/** Export the whole book as one txt/md file. */
export function exportBook(outputDir: string, project: ProjectState, format: 'txt' | 'md'): { file: string; chars: number; chapters: number } {
  const parts: string[] = []
  if (format === 'md') {
    parts.push(`# ${project.bookName}\n`)
  } else {
    parts.push(project.bookName, '')
  }
  const done = project.chapters.filter(c => c.file !== undefined)
  for (const chapter of done) {
    const body = readChapterFile(outputDir, chapter) ?? ''
    if (format === 'md') {
      parts.push(`\n## 第${chapter.no}章 ${chapter.title}\n`, body.trim(), '')
    } else {
      parts.push('', `第${chapter.no}章 ${chapter.title}`, '', body.trim(), '')
    }
  }
  const content = parts.join('\n')
  const ext = format === 'md' ? 'md' : 'txt'
  const file = `《${safeFileName(project.bookName)}》全本.${ext}`
  writeFileSync(join(outputDir, file), content, 'utf8')
  return { file, chars: content.length, chapters: done.length }
}
