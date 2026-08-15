/**
 * AI assistant engine — a conversational editor over the novel project.
 *
 * The user talks to the assistant about plot, characters, settings; the
 * assistant can reply in prose AND emit action directives that the host
 * executes (rewrite a paragraph, edit the bible, regenerate a chapter,
 * export the book, ...). Conversation history persists next to the project
 * as NDJSON, so a reload keeps the thread.
 *
 * Action protocol: the model emits a line of the form
 *   <dsh-action name="toolName">{jsonArgs}</dsh-action>
 * anywhere in its reply. The host strips it, executes the tool, appends the
 * result as a tool-role message, and continues the loop (bounded rounds).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { createUserMessage, createAssistantMessage, BlockAssembler, type GenerateOptions, type Message, type StreamChunk } from '@deepseek-ai/dsh-llm'
import type { Context } from '@deepseek-ai/cordis'
import type { AssistantMessage, NovelConfig, ProjectState } from './protocol.ts'
import { emptyProjectAssets } from './assets.ts'
import {
  chapterFileName,
  exportBook,
  generateChapterStream,
  readChapterFile,
  reviewChapter,
  summarizeChapter,
  saveProject,
} from './engine.ts'
import { rewriteChapterStream } from './engine.ts'

/** History file name inside the output dir. */
export const ASSISTANT_HISTORY_FILE = 'novel-assistant.jsonl'

/** Max tool-call rounds per user turn (safety bound). */
const MAX_TOOL_ROUNDS = 6

/** Max history messages kept in context (older ones summarized away). */
const MAX_HISTORY_MESSAGES = 24

// ------------------------------------------------------------------ history

/** Load the persisted conversation (empty when none). */
export function loadAssistantHistory(outputDir: string): AssistantMessage[] {
  const file = join(outputDir, ASSISTANT_HISTORY_FILE)
  if (!existsSync(file)) return []
  const messages: AssistantMessage[] = []
  try {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (line.trim() === '') continue
      try {
        const parsed = JSON.parse(line) as AssistantMessage
        if (typeof parsed.role === 'string' && typeof parsed.content === 'string') messages.push(parsed)
      } catch { /* skip malformed line */ }
    }
  } catch { /* unreadable history -> start fresh */ }
  return messages
}

/** Append one message to the persisted history. */
function appendHistory(outputDir: string, message: AssistantMessage): void {
  mkdirSync(outputDir, { recursive: true })
  appendFileSync(join(outputDir, ASSISTANT_HISTORY_FILE), JSON.stringify(message) + '\n', 'utf8')
}

// ----------------------------------------------------------------- context

/** Render the project snapshot the assistant sees. */
function renderProjectSnapshot(project: ProjectState): string {
  const sections: string[] = []
  sections.push(`书名：${project.bookName}`)
  if (project.bible !== undefined) {
    const bible = project.bible
    sections.push('【设定圣经】')
    if (bible.genre !== '') sections.push(`题材基调：${bible.genre}`)
    if (bible.worldRules.length > 0) sections.push('世界规则：\n' + bible.worldRules.map(r => `- ${r}`).join('\n'))
    if (bible.characters.length > 0) {
      sections.push('角色卡：')
      for (const card of bible.characters) {
        const roleName = { protagonist: '主角', supporting: '配角', antagonist: '反派', other: '其他' }[card.role]
        sections.push(`- ${card.name}（${roleName}）：${card.traits.join('、')}${card.goals !== '' ? `；目标：${card.goals}` : ''}`)
      }
    }
    if (bible.redLines.length > 0) sections.push('写作红线：\n' + bible.redLines.map(r => `- ${r}`).join('\n'))
  }
  if (project.volumes !== undefined && project.volumes.length > 0) {
    sections.push('【卷结构】')
    for (const v of project.volumes) {
      sections.push(`第${v.no}卷《${v.title}》：${v.summary}（章节 ${v.chapterStart}-${v.chapterEnd}）`)
    }
  }
  if (project.chapters.length > 0) {
    sections.push('【章节计划与进度】')
    for (const c of project.chapters) {
      const statusText = { pending: '待生成', generating: '生成中', written: '待审稿', reviewing: '审稿中', approved: '已通过', rejected: '待修订', error: '失败' }[c.status]
      sections.push(`第${c.no}章《${c.title}》[${statusText}]${c.chars !== undefined ? ` ${c.chars}字` : ''}${c.summary !== undefined && c.summary !== '' ? ` 摘要：${c.summary}` : ''}`)
    }
  }
  if (project.foreshadows.length > 0) {
    sections.push('【伏笔】')
    for (const f of project.foreshadows) {
      sections.push(`- [${f.status}] ${f.description}${f.targetChapter !== undefined ? `（预计 ${f.targetChapter} 章回收）` : ''}`)
    }
  }
  return sections.join('\n')
}

/** The assistant system prompt. */
function assistantSystemPrompt(project: ProjectState): string {
  return [
    '你是这部小说的 AI 编辑助理，负责陪作者讨论剧情、人设、世界观，并把讨论结果落实到项目里。',
    '==================== 当前项目快照 ====================',
    renderProjectSnapshot(project),
    '==================== 快照结束 ====================',
    '',
    '你可以：',
    '1. 与作者讨论剧情走向、人物动机、爽点节奏、伏笔安排等，给出专业建议（直接文字回答）。',
    '2. 讨论达成一致后，用动作指令实际修改内容。动作指令格式（放在回复末尾单独一行）：',
    '   <dsh-action name="工具名">{"参数名": 值}</dsh-action>',
    '',
    '可用工具：',
    '- outline_text：无参数。返回当前大纲全文。',
    '- outline_replace：{"old": "要替换的原文片段", "new": "新文本"}。在大纲中替换一段文字（old 必须能在大纲中找到）。',
    '- bible_set_rule：{"index": 序号(0起), "text": "新规则文本"} 或 {"append": "追加的规则"}。修改设定圣经的世界规则。',
    '- bible_set_redline：同上，修改写作红线。',
    '- chapter_text：{"no": 章节号}。返回该章正文。',
    '- chapter_rewrite：{"no": 章节号, "instructions": "修改要求", "target": "原文片段(可选，留空整章)"}。按讨论结果修订章节；给了 target 只改该自然段。',
    '- chapter_generate：{"no": 章节号}。重新生成该章。',
    '- chapter_review：{"no": 章节号}。对该章执行 AI 审稿。',
    '- foreshadow_add：{"description": "伏笔描述", "targetChapter": 预计回收章(可选)}。新增伏笔。',
    '- foreshadow_update：{"id": "伏笔id", "status": "planned|planted|progressing|resolved|abandoned"}。更新伏笔状态。',
    '- export_txt：无参数。导出全本 TXT。',
    '- assets_status：无参数。查看本书当前写作资产（题材/推进模式/反AI规则/写法）。',
    '- assets_set_genre：{"name": "题材名", "description": "题材说明(可选)"}。设置本书题材基底。',
    '- assets_set_progression：{"name": "模式名", "driver": "驱动力", "primary": true/false}。设置主/辅助推进模式。',
    '- assets_add_rule：{"name": "规则名(可选)", "avoid": "要避免的表达问题", "fix": "修正方向(可选)"}。新增反 AI 规则。',
    '',
    '使用规则（非常重要）：',
    '- 当你想执行任何工具时，你的【整个回复】必须只包含动作指令标签，格式如下（不要有任何解释文字、不要用自然语言说"我要去改"，直接输出标签）：',
    '  正确示例：<dsh-action name="outline_replace">{"old":"要替换的原文","new":"新文本"}</dsh-action>',
    '  正确示例：<dsh-action name="chapter_text">{"no":1}</dsh-action>',
    '  错误示例（绝对不要这样回复）："好的，我先看一下大纲，马上改。" ← 这只是文字，不会执行任何操作',
    '- 工具调用是自动的：你输出标签后，宿主会执行并把结果反馈给你，你再基于结果继续。',
    '- 每次回复最多调用 1 个动作；执行结果会反馈给你，你可以继续讨论或再调用。',
    '- 需要先看大纲/章节再决定怎么改？那就先输出一个 outline_text / chapter_text 的标签，等结果回来。',
    '- chapter_rewrite 的 target 参数：从章节正文中复制一小段（一句话或几句话即可），不要带换行、不要带引号，取连续文本片段。',
    '- 如果工具执行失败（例如片段未找到），根据错误信息修正参数后自动重试一次，不要直接放弃或让作者手动操作。',
    '- 修改前先向作者说明你要改什么、为什么；动作执行后简要汇报结果。',
    '- 涉及删除类操作（删除章节、清空设定）必须等作者明确同意。',
    '- 严格忠于设定圣经与大刚；不得自行发明与既有设定冲突的内容。',
    '- 用中文回复。',
  ].join('\n')
}

// ------------------------------------------------------------- action exec

/** Execute one action directive. Returns a text result (or throws). */
/**
 * Execute one action directive as an async generator: yields live progress
 * text (chapter text being generated/rewritten), then yields the final result
 * string. Throws on failure.
 */
export async function* executeAction(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  name: string,
  args: Record<string, unknown>,
): AsyncGenerator<string, string, unknown> {
  const str = (value: unknown): string => typeof value === 'string' ? value : ''
  const num = (value: unknown): number | undefined => typeof value === 'number' ? value : undefined

  /** Forward live text deltas from a streaming chapter job (text only). */
  const forward = async function* (stream: AsyncGenerator<{ frame: 'start' } | { frame: 'delta'; text: string } | { frame: 'done'; file: string; chars: number }, void, unknown>): AsyncGenerator<string, void, unknown> {
    for await (const step of stream) {
      if (step.frame === 'delta') yield step.text
    }
  }

  switch (name) {
    case 'outline_text': {
      return project.outline
    }
    case 'outline_replace': {
      const old = str(args.old)
      const next = str(args.new)
      if (old === '' || !project.outline.includes(old)) {
        throw new Error(`大纲中未找到片段「${old.slice(0, 40)}…」`)
      }
      project.outline = project.outline.replace(old, next)
      project.updatedAt = new Date().toISOString()
      saveProject(outputDir, project)
      return `大纲已修改：替换了 ${old.length} 字符的片段。`
    }
    case 'bible_set_rule': {
      if (project.bible === undefined) throw new Error('尚无设定圣经，请先提炼')
      const index = num(args.index)
      if (index !== undefined) {
        project.bible.worldRules[index] = str(args.text)
      } else if (str(args.append) !== '') {
        project.bible.worldRules.push(str(args.append))
      } else {
        throw new Error('bible_set_rule 需要 index+text 或 append')
      }
      project.updatedAt = new Date().toISOString()
      saveProject(outputDir, project)
      return `世界规则已更新（当前 ${project.bible.worldRules.length} 条）。`
    }
    case 'bible_set_redline': {
      if (project.bible === undefined) throw new Error('尚无设定圣经，请先提炼')
      const index = num(args.index)
      if (index !== undefined) {
        project.bible.redLines[index] = str(args.text)
      } else if (str(args.append) !== '') {
        project.bible.redLines.push(str(args.append))
      } else {
        throw new Error('bible_set_redline 需要 index+text 或 append')
      }
      project.updatedAt = new Date().toISOString()
      saveProject(outputDir, project)
      return `写作红线已更新（当前 ${project.bible.redLines.length} 条）。`
    }
    case 'chapter_text': {
      const no = num(args.no)
      if (no === undefined) throw new Error('chapter_text 需要 no')
      const chapter = project.chapters.find(c => c.no === no)
      if (chapter === undefined) throw new Error(`章节 ${no} 不存在`)
      const body = readChapterFile(outputDir, chapter)
      if (body === undefined) throw new Error(`章节 ${no} 尚未生成`)
      return body
    }
    case 'chapter_rewrite': {
      const no = num(args.no)
      if (no === undefined) throw new Error('chapter_rewrite 需要 no')
      const instructions = str(args.instructions)
      const target = str(args.target)
      for await (const chunk of forward(rewriteChapterStream(ctx, config, project, outputDir, no, instructions, target === '' ? undefined : target))) {
        yield chunk
      }
      // Summarize + re-review so the assistant can report quality.
      yield '（正在生成章节摘要…）'
      try {
        await summarizeChapter(ctx, config, project, outputDir, no)
      } catch { /* summary is best-effort */ }
      yield '（正在 AI 审稿…）'
      const report = await reviewChapter(ctx, config, project, outputDir, no)
      return `章节 ${no} 已${target === '' ? '整章' : '局部'}修订完成（${project.chapters.find(c => c.no === no)?.chars ?? '?'} 字）。重新审稿：${report.score} 分 — ${report.verdict}`
    }
    case 'chapter_generate': {
      const no = num(args.no)
      if (no === undefined) throw new Error('chapter_generate 需要 no')
      for await (const chunk of forward(generateChapterStream(ctx, config, project, outputDir, no))) {
        yield chunk
      }
      yield '（正在生成章节摘要…）'
      try {
        await summarizeChapter(ctx, config, project, outputDir, no)
      } catch { /* best-effort */ }
      yield '（正在 AI 审稿…）'
      const report = await reviewChapter(ctx, config, project, outputDir, no)
      return `章节 ${no} 已生成（${project.chapters.find(c => c.no === no)?.chars ?? '?'} 字）。审稿：${report.score} 分 — ${report.verdict}`
    }
    case 'chapter_review': {
      const no = num(args.no)
      if (no === undefined) throw new Error('chapter_review 需要 no')
      const report = await reviewChapter(ctx, config, project, outputDir, no)
      const issues = report.issues.map(i => `[${i.severity}] ${i.item} → ${i.suggestion}`).join('\n')
      return `章节 ${no} 审稿：${report.score} 分 — ${report.verdict}\n${issues}`
    }
    case 'foreshadow_add': {
      const description = str(args.description)
      if (description === '') throw new Error('foreshadow_add 需要 description')
      const targetChapter = num(args.targetChapter)
      project.foreshadows.push({
        id: `fs-${Date.now().toString(36)}`,
        description,
        targetChapter,
        status: 'planned',
      })
      project.updatedAt = new Date().toISOString()
      saveProject(outputDir, project)
      return `已新增伏笔：「${description.slice(0, 50)}」`
    }
    case 'foreshadow_update': {
      const id = str(args.id)
      const status = str(args.status) as 'planned' | 'planted' | 'progressing' | 'resolved' | 'abandoned'
      const target = project.foreshadows.find(f => f.id === id)
      if (target === undefined) throw new Error(`伏笔 ${id} 不存在`)
      if (!['planned', 'planted', 'progressing', 'resolved', 'abandoned'].includes(status)) {
        throw new Error(`非法状态 ${status}`)
      }
      target.status = status
      project.updatedAt = new Date().toISOString()
      saveProject(outputDir, project)
      return `伏笔已更新为 ${status}：「${target.description.slice(0, 50)}」`
    }
    case 'export_txt': {
      const result = exportBook(outputDir, project, 'txt')
      return `已导出 TXT：${result.file}（${result.chars} 字，${result.chapters} 章）`
    }
    case 'assets_status': {
      const assets = project.assets
      if (assets === undefined) return '本书尚未配置写作资产。'
      const parts: string[] = []
      if (assets.genre !== undefined) parts.push(`题材：${assets.genre.name}`)
      if (assets.primaryProgression !== undefined) parts.push(`主推进：${assets.primaryProgression.name}`)
      if (assets.auxiliaryProgressions.length > 0) parts.push(`辅助推进：${assets.auxiliaryProgressions.map(m => m.name).join('、')}`)
      if (assets.antiAiRules.length > 0) parts.push(`自定义反AI规则：${assets.antiAiRules.map(r => r.name).join('、')}`)
      if (assets.styleAssets.length > 0) parts.push(`写法资产：${assets.styleAssets.map(s => s.name).join('、')}`)
      return parts.length > 0 ? parts.join('\n') : '本书尚未配置写作资产。'
    }
    case 'assets_set_genre': {
      const name = str(args.name)
      const description = str(args.description)
      if (name === '') throw new Error('assets_set_genre 需要 name')
      if (project.assets === undefined) project.assets = emptyProjectAssets()
      project.assets.genre = { name, description, children: [] }
      project.assets.updatedAt = new Date().toISOString()
      project.updatedAt = new Date().toISOString()
      saveProject(outputDir, project)
      return `题材已设为「${name}」`
    }
    case 'assets_set_progression': {
      const name = str(args.name)
      const driver = str(args.driver)
      const primary = args.primary !== false
      if (name === '') throw new Error('assets_set_progression 需要 name')
      if (project.assets === undefined) project.assets = emptyProjectAssets()
      const mode = {
        name,
        driver: driver !== '' ? driver : name,
        readerExpectation: str(args.readerExpectation),
        payoffs: Array.isArray(args.payoffs) ? args.payoffs.filter((v): v is string => typeof v === 'string') : [],
        risks: Array.isArray(args.risks) ? args.risks.filter((v): v is string => typeof v === 'string') : [],
        primary,
      }
      if (primary) project.assets.primaryProgression = mode
      else {
        if (project.assets.auxiliaryProgressions === undefined) project.assets.auxiliaryProgressions = []
        project.assets.auxiliaryProgressions.push(mode)
      }
      project.assets.updatedAt = new Date().toISOString()
      project.updatedAt = new Date().toISOString()
      saveProject(outputDir, project)
      return `推进模式${primary ? '（主）' : '（辅助）'}已设置：「${name}」`
    }
    case 'assets_add_rule': {
      const name = str(args.name)
      const avoid = str(args.avoid)
      if (avoid === '') throw new Error('assets_add_rule 需要 avoid（要避免的表达问题）')
      if (project.assets === undefined) project.assets = emptyProjectAssets()
      if (project.assets.antiAiRules === undefined) project.assets.antiAiRules = []
      project.assets.antiAiRules.push({
        name: name !== '' ? name : `自定义规则 ${project.assets.antiAiRules.length + 1}`,
        avoid,
        fix: str(args.fix),
      })
      project.assets.updatedAt = new Date().toISOString()
      project.updatedAt = new Date().toISOString()
      saveProject(outputDir, project)
      return `已新增反 AI 规则「${name !== '' ? name : avoid.slice(0, 20)}」`
    }
    default:
      throw new Error(`未知工具 ${name}`)
  }
}

// ------------------------------------------------------------------- chat

/** Extract the first action directive from a reply. */
function extractAction(reply: string): { name: string; args: Record<string, unknown>; index: number } | undefined {
  const match = /<dsh-action\s+name="([^"]+)"\s*>([\s\S]*?)<\/dsh-action>/.exec(reply)
  if (match === null) return undefined
  const rawArgs = match[2]?.trim() ?? ''
  let args: Record<string, unknown>
  try {
    args = rawArgs === '' ? {} : JSON.parse(rawArgs) as Record<string, unknown>
  } catch {
    throw new Error(`动作参数不是合法 JSON：${rawArgs.slice(0, 80)}`)
  }
  return { name: match[1] ?? '', args, index: match.index }
}

/** Render the recent history as LLM messages (skipping tool chatter in early rounds). */
function historyToMessages(history: AssistantMessage[]): Message[] {
  const recent = history.slice(-MAX_HISTORY_MESSAGES)
  const messages: Message[] = []
  for (const entry of recent) {
    if (entry.role === 'user') {
      messages.push(createUserMessage({
        content: [{ type: 'text', text: entry.content }],
        source: { kind: 'plugin', plugin: 'dsh-novel-forge' },
      }))
    } else if (entry.role === 'assistant') {
      messages.push(createAssistantMessage({
        content: [{ type: 'text', text: entry.content }],
        source: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
      }))
    } else if (entry.role === 'tool') {
      messages.push(createUserMessage({
        content: [{ type: 'text', text: `【工具 ${entry.tool ?? ''} 的执行结果】\n${entry.content}` }],
        source: { kind: 'plugin', plugin: 'dsh-novel-forge' },
      }))
    }
  }
  return messages
}

/** One non-streaming LLM chat turn (used inside the tool loop). */
async function chatOnce(
  ctx: Context,
  config: NovelConfig,
  system: string,
  history: AssistantMessage[],
): Promise<string> {
  const messages = historyToMessages(history)
  const request: GenerateOptions = {
    provider: config.provider,
    model: config.model,
    messages,
    system,
    maxTokens: config.maxTokens,
    temperature: 0.7,
  }
  const assembler = new BlockAssembler()
  for await (const chunk of ctx.llm.stream(request)) {
    assembler.push(chunk)
  }
  const finish = assembler.finish
  if (finish.kind === 'error' || finish.kind === 'aborted') {
    throw new Error(`助手调用失败（${finish.kind}）: ${finish.failure.message}`)
  }
  const blocks = assembler.blocks()
  const textBlocks = blocks
    .filter((block): block is Extract<StreamChunk, { type: 'block-end' }>['block'] & { type: 'text' } => block.type === 'text')
    .map(block => block.text)
  let text = textBlocks.join('\n').trim()
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

/** Run one user turn. Yields stream frames; persists history. */
export async function* runAssistantTurn(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  userMessage: string,
): AsyncGenerator<
  | { frame: 'delta'; text: string }
  | { frame: 'tool'; name: string; status: 'start' | 'done' | 'error'; detail?: string }
  | { frame: 'toolDelta'; name: string; text: string },
  void,
  unknown
> {
  const history = loadAssistantHistory(outputDir)
  const system = assistantSystemPrompt(project)

  // Persist the user message.
  const userEntry: AssistantMessage = { role: 'user', content: userMessage, ts: new Date().toISOString() }
  history.push(userEntry)
  appendHistory(outputDir, userEntry)

  let round = 0
  /** Whether we already nudged the model to emit an action tag (avoid loops). */
  let nudged = false
  for (;;) {
    const reply = await chatOnce(ctx, config, system, history)
    const action = extractAction(reply)

    if (action === undefined) {
      // No action tag. If the reply clearly intends to modify something but
      // forgot the tag, nudge once and continue; otherwise it's plain prose.
      const intendsAction = /(改|修改|修订|重写|替换|调整|生成|新增|删除|导出|看看|查看|调出|读一下|加上|加一个|去掉|删掉|把.+改成)/.test(reply)
      if (intendsAction && !nudged) {
        nudged = true
        const nudge = '你的上一条回复表达了想操作项目的意图（如查看/修改大纲、章节等），但没有输出动作指令标签，因此没有执行任何操作。请直接输出 <dsh-action name="工具名">{"参数":值}</dsh-action> 标签来执行，不要用文字描述意图。如果需要先看内容，先输出 outline_text 或 chapter_text 标签。'
        history.push({ role: 'tool', content: nudge, tool: 'format-hint', ts: new Date().toISOString() })
        appendHistory(outputDir, { role: 'tool', content: nudge, tool: 'format-hint', ts: new Date().toISOString() })
        continue
      }
      // Plain prose reply — done.
      const assistantEntry: AssistantMessage = { role: 'assistant', content: reply, ts: new Date().toISOString() }
      history.push(assistantEntry)
      appendHistory(outputDir, assistantEntry)
      // Stream the prose (without any stray action markup).
      yield { frame: 'delta', text: reply }
      return
    }

    // Execute the action, then feed the result back and continue.
    const { name, args, index } = action
    const prose = reply.slice(0, index).trim()
    yield { frame: 'tool', name, status: 'start' }
    let result: string
    try {
      // executeAction is an async generator: it yields live progress text
      // (chapter text being generated) and returns the final result string.
      // Iterate manually so we see both the yielded deltas and the return.
      const iterator = executeAction(ctx, config, project, outputDir, name, args)[Symbol.asyncIterator]()
      result = ''
      for (;;) {
        const step = await iterator.next()
        if (step.done === true) {
          result = typeof step.value === 'string' ? step.value : ''
          break
        }
        const chunk = step.value
        if (typeof chunk === 'string' && chunk !== '') {
          yield { frame: 'toolDelta', name, text: chunk }
        }
      }
      yield { frame: 'tool', name, status: 'done', detail: result.slice(0, 200) }
    } catch (error) {
      result = `执行失败：${(error as Error).message}`
      yield { frame: 'tool', name, status: 'error', detail: (error as Error).message }
    }

    // Persist assistant prose + tool result as history entries.
    if (prose !== '') {
      history.push({ role: 'assistant', content: prose, ts: new Date().toISOString() })
      appendHistory(outputDir, { role: 'assistant', content: prose, ts: new Date().toISOString() })
    }
    history.push({ role: 'tool', content: result, tool: name, ts: new Date().toISOString() })
    appendHistory(outputDir, { role: 'tool', content: result, tool: name, ts: new Date().toISOString() })

    round++
    if (round >= MAX_TOOL_ROUNDS) {
      const message = `（已连续执行 ${round} 次修改操作，本轮停止。如需继续请再说。）`
      history.push({ role: 'assistant', content: message, ts: new Date().toISOString() })
      appendHistory(outputDir, { role: 'assistant', content: message, ts: new Date().toISOString() })
      yield { frame: 'delta', text: message }
      return
    }
  }
}

export { chapterFileName }
