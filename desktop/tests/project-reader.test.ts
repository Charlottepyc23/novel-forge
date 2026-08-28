import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readNovelChapter, readNovelProject, saveNovelChapter } from '../main/project-reader'

const directories: string[] = []

async function temporaryProject(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'novel-forge-desktop-'))
  directories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('readNovelProject', () => {
  it('loads project metadata and chapter files without changing them', async () => {
    const directory = await temporaryProject()
    await writeFile(join(directory, 'novel-project.json'), JSON.stringify({
      bookName: '测试小说',
      outline: '第一卷\n故事大纲',
      chapters: [
        { no: 1, volume: 1, title: '开端', status: 'approved', chars: 3200, file: '第001章_开端.md', review: { score: 88 } },
        { no: 2, volume: 1, title: '转折', status: 'pending' },
      ],
      roles: [{ name: '甲' }],
      facts: [{ content: '事实' }],
      plotlines: [],
      foreshadows: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    }))
    await writeFile(join(directory, '第001章_开端.md'), '# 第一章 开端\n\n正文')

    const project = await readNovelProject(directory)

    expect(project.bookName).toBe('测试小说')
    expect(project.chapterCount).toBe(2)
    expect(project.writtenCount).toBe(1)
    expect(project.approvedCount).toBe(1)
    expect(project.totalChars).toBe(3200)
    expect(project.chapters[0]).toMatchObject({ no: 1, fileExists: true, reviewScore: 88 })
    expect(project.chapters[1]).toMatchObject({ no: 2, fileExists: false })
  })

  it('lists an orphan Markdown chapter and reports a warning', async () => {
    const directory = await temporaryProject()
    await writeFile(join(directory, 'novel-project.json'), JSON.stringify({ outline: '《无名书》', chapters: [] }))
    await writeFile(join(directory, '第003章-偶遇.md'), '# 第三章 偶遇')

    const project = await readNovelProject(directory)

    expect(project.bookName).toBe('无名书')
    expect(project.chapters).toHaveLength(1)
    expect(project.chapters[0]).toMatchObject({ no: 3, title: '偶遇', status: 'written', fileExists: true })
    expect(project.warnings[0]).toContain('不在章节计划中')
  })

  it('rejects a directory without a valid project file', async () => {
    const directory = await temporaryProject()
    await expect(readNovelProject(directory)).rejects.toThrow('novel-project.json')
  })
})

describe('readNovelChapter', () => {
  it('reads a chapter and derives its title and character count', async () => {
    const directory = await temporaryProject()
    await writeFile(join(directory, '第001章_开端.md'), '\uFEFF# 第一章 开端\n\n这是正文。')

    const chapter = await readNovelChapter(directory, '第001章_开端.md')

    expect(chapter.title).toBe('第一章 开端')
    expect(chapter.markdown).toBe('# 第一章 开端\n\n这是正文。')
    expect(chapter.chars).toBe(5)
    expect(chapter.bytes).toBeGreaterThan(0)
  })

  it('rejects traversal and non-chapter files', async () => {
    const directory = await temporaryProject()
    await expect(readNovelChapter(directory, '..\\secret.md')).rejects.toThrow('章节文件名无效')
    await expect(readNovelChapter(directory, 'novel-project.json')).rejects.toThrow('章节文件名无效')
  })
})

describe('saveNovelChapter', () => {
  it('backs up and atomically saves a chapter while updating project metadata', async () => {
    const directory = await temporaryProject()
    await writeFile(join(directory, 'novel-project.json'), JSON.stringify({
      outline: '测试',
      chapters: [{ no: 1, volume: 1, title: '开端', status: 'approved', chars: 2, file: '第001章_开端.md', review: { score: 90 }, pendingDraft: '旧草稿' }],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }))
    const original = '# 第一章 开端\n\n旧正文\n'
    await writeFile(join(directory, '第001章_开端.md'), original)
    const loaded = await readNovelChapter(directory, '第001章_开端.md')

    const result = await saveNovelChapter({
      directory,
      file: loaded.file,
      markdown: '# 第一章 开端\n\n这是新的正文。',
      expectedRevision: loaded.revision,
    })

    expect(result.chapter.markdown).toBe('# 第一章 开端\n\n这是新的正文。\n')
    expect(result.chapter.chars).toBe(7)
    expect(await readFile(join(directory, '第001章_开端.bak.md'), 'utf8')).toBe(original)
    const project = JSON.parse(await readFile(join(directory, 'novel-project.json'), 'utf8')) as { chapters: Array<Record<string, unknown>>; updatedAt: string }
    expect(project.chapters[0]).toMatchObject({ chars: 7, status: 'written', file: '第001章_开端.md' })
    expect(project.chapters[0]!.review).toBeUndefined()
    expect(project.chapters[0]!.pendingDraft).toBeUndefined()
    expect(project.updatedAt).not.toBe('2026-01-01T00:00:00.000Z')
  })

  it('rejects saving when the chapter changed after it was opened', async () => {
    const directory = await temporaryProject()
    await writeFile(join(directory, 'novel-project.json'), JSON.stringify({ outline: '测试', chapters: [{ no: 1, file: '第001章_开端.md' }] }))
    await writeFile(join(directory, '第001章_开端.md'), '# 第一章\n\n初始内容')
    const loaded = await readNovelChapter(directory, '第001章_开端.md')
    await writeFile(join(directory, '第001章_开端.md'), '# 第一章\n\n外部修改')

    await expect(saveNovelChapter({ directory, file: loaded.file, markdown: '本地修改', expectedRevision: loaded.revision }))
      .rejects.toThrow('应用外被修改')
    expect(await readFile(join(directory, '第001章_开端.md'), 'utf8')).toContain('外部修改')
  })
})
