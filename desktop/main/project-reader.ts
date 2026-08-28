import { readFile, readdir, realpath, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import type { DesktopChapterDocument, DesktopChapterSummary, DesktopProjectOverview } from '../shared/contracts'

const PROJECT_FILE = 'novel-project.json'
const MAX_PROJECT_BYTES = 64 * 1024 * 1024
const MAX_CHAPTER_BYTES = 16 * 1024 * 1024
const CHAPTER_FILE_PATTERN = /^第0*(\d+)章(?:[_-](.*))?\.md$/i

interface RawChapter {
  no?: unknown
  volume?: unknown
  title?: unknown
  status?: unknown
  chars?: unknown
  file?: unknown
  review?: { score?: unknown } | null
  summary?: unknown
}

interface RawProject {
  bookName?: unknown
  outline?: unknown
  chapters?: unknown
  roles?: unknown
  facts?: unknown
  plotlines?: unknown
  foreshadows?: unknown
  createdAt?: unknown
  updatedAt?: unknown
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0
}

function inferBookName(outline: string): string {
  const firstLine = outline.split(/\r?\n/).map(line => line.trim()).find(Boolean)
  return (firstLine ?? '未命名小说').replace(/^《/, '').replace(/》.*$/, '').slice(0, 80)
}

async function readProjectJson(directory: string): Promise<RawProject> {
  const projectPath = join(directory, PROJECT_FILE)
  let projectStat
  try {
    projectStat = await stat(projectPath)
  } catch {
    throw new Error(`所选目录中没有 ${PROJECT_FILE}`)
  }
  if (!projectStat.isFile()) throw new Error(`${PROJECT_FILE} 不是文件`)
  if (projectStat.size > MAX_PROJECT_BYTES) throw new Error(`${PROJECT_FILE} 超过 64 MB，已拒绝读取`)

  let text = await readFile(projectPath, 'utf8')
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)
  try {
    return JSON.parse(text) as RawProject
  } catch {
    throw new Error(`${PROJECT_FILE} 不是有效的 JSON 文件`)
  }
}

function chapterFileNumber(file: string): number | undefined {
  const match = CHAPTER_FILE_PATTERN.exec(file)
  if (match === null) return undefined
  const no = Number(match[1])
  return Number.isInteger(no) && no > 0 ? no : undefined
}

function samePath(left: string, right: string): boolean {
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right
}

/** Read one chapter file while preventing traversal and symlink escapes. */
export async function readNovelChapter(inputDirectory: string, inputFile: string): Promise<DesktopChapterDocument> {
  if (typeof inputDirectory !== 'string' || inputDirectory.trim() === '') throw new Error('项目目录不能为空')
  if (!isAbsolute(inputDirectory)) throw new Error('项目目录必须是绝对路径')
  if (typeof inputFile !== 'string' || inputFile.trim() === '') throw new Error('章节文件不能为空')
  if (basename(inputFile) !== inputFile || !CHAPTER_FILE_PATTERN.test(inputFile) || inputFile.endsWith('.bak.md')) {
    throw new Error('章节文件名无效')
  }

  const directory = resolve(inputDirectory)
  const projectDirectory = await realpath(directory).catch(() => { throw new Error('项目目录不存在') })
  const filePath = join(projectDirectory, inputFile)
  const chapterPath = await realpath(filePath).catch(() => { throw new Error('章节正文文件不存在') })
  if (!samePath(dirname(chapterPath), projectDirectory)) throw new Error('禁止读取项目目录之外的文件')

  const chapterStat = await stat(chapterPath)
  if (!chapterStat.isFile()) throw new Error('章节路径不是文件')
  if (chapterStat.size > MAX_CHAPTER_BYTES) throw new Error('章节文件超过 16 MB，已拒绝读取')

  let markdown = await readFile(chapterPath, 'utf8')
  if (markdown.charCodeAt(0) === 0xFEFF) markdown = markdown.slice(1)
  const heading = /^\s*#\s+(.+)$/m.exec(markdown)?.[1]?.trim()
  const no = chapterFileNumber(inputFile)
  const fallbackTitle = inputFile.replace(CHAPTER_FILE_PATTERN, '$2') || `第${no ?? ''}章`
  return {
    directory: projectDirectory,
    file: inputFile,
    title: heading !== undefined && heading !== '' ? heading : fallbackTitle,
    markdown,
    chars: markdown.replace(/^\s*#\s+.*(?:\r?\n)?/m, '').trim().length,
    bytes: chapterStat.size,
    modifiedAt: chapterStat.mtime.toISOString(),
  }
}

/** Read an existing plugin project without modifying any source files. */
export async function readNovelProject(inputDirectory: string): Promise<DesktopProjectOverview> {
  if (typeof inputDirectory !== 'string' || inputDirectory.trim() === '') throw new Error('项目目录不能为空')
  if (!isAbsolute(inputDirectory)) throw new Error('项目目录必须是绝对路径')

  const directory = resolve(inputDirectory)
  let directoryStat
  try {
    directoryStat = await stat(directory)
  } catch {
    throw new Error('项目目录不存在')
  }
  if (!directoryStat.isDirectory()) throw new Error('所选路径不是目录')

  const raw = await readProjectJson(directory)
  if (typeof raw.outline !== 'string' || !Array.isArray(raw.chapters)) {
    throw new Error(`${PROJECT_FILE} 缺少有效的 outline 或 chapters`)
  }

  const entries = await readdir(directory, { withFileTypes: true })
  const markdownFiles = new Set(
    entries
      .filter(entry => entry.isFile() && CHAPTER_FILE_PATTERN.test(entry.name) && !entry.name.endsWith('.bak.md'))
      .map(entry => entry.name),
  )
  const discoveredByNumber = new Map<number, string>()
  for (const file of markdownFiles) {
    const no = chapterFileNumber(file)
    if (no !== undefined && !discoveredByNumber.has(no)) discoveredByNumber.set(no, file)
  }

  const warnings: string[] = []
  const seenNumbers = new Set<number>()
  const chapters: DesktopChapterSummary[] = []
  for (const entry of raw.chapters as RawChapter[]) {
    if (typeof entry !== 'object' || entry === null) continue
    const no = typeof entry.no === 'number' ? entry.no : Number(entry.no)
    if (!Number.isInteger(no) || no <= 0) {
      warnings.push('发现缺少有效章号的章节计划，已跳过')
      continue
    }
    if (seenNumbers.has(no)) {
      warnings.push(`第 ${no} 章在项目计划中重复，已保留第一条`)
      continue
    }
    seenNumbers.add(no)

    const declaredFile = optionalText(entry.file)
    const safeDeclaredFile = declaredFile !== undefined && basename(declaredFile) === declaredFile ? declaredFile : undefined
    if (declaredFile !== undefined && safeDeclaredFile === undefined) warnings.push(`第 ${no} 章的文件路径不安全，已忽略`)
    const file = safeDeclaredFile ?? discoveredByNumber.get(no)
    const fileExists = file !== undefined && markdownFiles.has(file)
    if (safeDeclaredFile !== undefined && !fileExists) warnings.push(`第 ${no} 章记录的正文文件不存在：${safeDeclaredFile}`)

    chapters.push({
      no,
      volume: typeof entry.volume === 'number' && Number.isInteger(entry.volume) ? entry.volume : 0,
      title: optionalText(entry.title) ?? `第${no}章`,
      status: optionalText(entry.status) ?? (fileExists ? 'written' : 'pending'),
      chars: typeof entry.chars === 'number' && Number.isFinite(entry.chars) && entry.chars >= 0 ? entry.chars : undefined,
      file,
      fileExists,
      reviewScore: typeof entry.review?.score === 'number' && Number.isFinite(entry.review.score) ? entry.review.score : undefined,
      summary: optionalText(entry.summary),
    })
  }

  for (const [no, file] of discoveredByNumber) {
    if (seenNumbers.has(no)) continue
    warnings.push(`${file} 不在章节计划中，已作为磁盘章节列出`)
    chapters.push({ no, volume: 0, title: file.replace(CHAPTER_FILE_PATTERN, '$2') || `第${no}章`, status: 'written', file, fileExists: true })
  }
  chapters.sort((a, b) => a.no - b.no)

  const totalChars = chapters.reduce((sum, chapter) => sum + (chapter.chars ?? 0), 0)
  return {
    directory,
    bookName: optionalText(raw.bookName) ?? inferBookName(raw.outline),
    outlineChars: raw.outline.length,
    createdAt: optionalText(raw.createdAt),
    updatedAt: optionalText(raw.updatedAt),
    chapterCount: chapters.length,
    writtenCount: chapters.filter(chapter => chapter.fileExists).length,
    approvedCount: chapters.filter(chapter => chapter.status === 'approved').length,
    totalChars,
    roleCount: arrayLength(raw.roles),
    factCount: arrayLength(raw.facts),
    plotlineCount: arrayLength(raw.plotlines),
    foreshadowCount: arrayLength(raw.foreshadows),
    chapters,
    warnings,
  }
}
