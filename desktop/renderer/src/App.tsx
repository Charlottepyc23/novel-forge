import { useEffect, useState } from 'react'
import type { DesktopAppInfo, DesktopChapterDocument, DesktopProjectOverview } from '../../shared/contracts'

const BASELINE_VERSION = '1.7.3'

const STATUS_LABELS: Record<string, string> = {
  pending: '待写',
  generating: '生成中',
  written: '待审稿',
  reviewing: '审稿中',
  approved: '已通过',
  rejected: '需修订',
  error: '异常',
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function MarkdownReader({ markdown }: { markdown: string }): JSX.Element {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  return (
    <article className="markdown-reader">
      {lines.map((line, index) => {
        const key = `${index}-${line.slice(0, 20)}`
        if (line.trim() === '') return <div className="reader-spacer" key={key} />
        const heading = /^(#{1,3})\s+(.+)$/.exec(line)
        if (heading !== null) {
          const level = heading[1]!.length
          if (level === 1) return <h1 key={key}>{heading[2]}</h1>
          if (level === 2) return <h2 key={key}>{heading[2]}</h2>
          return <h3 key={key}>{heading[2]}</h3>
        }
        if (/^\s*(?:---+|\*\*\*+)\s*$/.test(line)) return <hr key={key} />
        if (line.startsWith('> ')) return <blockquote key={key}>{line.slice(2)}</blockquote>
        return <p key={key}>{line}</p>
      })}
    </article>
  )
}

export function App(): JSX.Element {
  const [appInfo, setAppInfo] = useState<DesktopAppInfo>()
  const [project, setProject] = useState<DesktopProjectOverview>()
  const [loading, setLoading] = useState(false)
  const [chapterLoading, setChapterLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [chapter, setChapter] = useState<DesktopChapterDocument>()

  useEffect(() => {
    void window.novelDesktop.getAppInfo().then(setAppInfo)
  }, [])

  const chooseProject = async (): Promise<void> => {
    setLoading(true)
    setError(undefined)
    try {
      const selected = await window.novelDesktop.chooseProject()
      if (selected !== undefined) {
        setProject(selected)
        setChapter(undefined)
      }
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setLoading(false)
    }
  }

  const openChapter = async (file: string | undefined): Promise<void> => {
    if (project === undefined || file === undefined) return
    setChapterLoading(true)
    setError(undefined)
    try {
      setChapter(await window.novelDesktop.readChapter(project.directory, file))
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setChapterLoading(false)
    }
  }

  const refreshProject = async (): Promise<void> => {
    if (project === undefined) return
    setLoading(true)
    setError(undefined)
    try {
      setProject(await window.novelDesktop.loadProject(project.directory))
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark">文</div>
        <div className="brand-copy">
          <strong>Novel Forge</strong>
          <span>私人桌面工坊</span>
        </div>
        <div className="topbar-actions">
          <span className="version">基线 {BASELINE_VERSION}</span>
          <button type="button" onClick={() => void chooseProject()} disabled={loading}>
            {loading ? '读取中...' : project === undefined ? '打开旧项目' : '切换项目'}
          </button>
        </div>
      </header>

      {error !== undefined && <div className="error-banner">{error}</div>}

      {project === undefined ? (
        <section className="empty-state">
          <p className="eyebrow">LOCAL FIRST / READ ONLY</p>
          <h1>打开一部已经存在的小说</h1>
          <p>
            选择包含 <code>novel-project.json</code> 的目录。当前阶段只读取项目状态和章节文件，不会改动原小说。
          </p>
          <button type="button" onClick={() => void chooseProject()} disabled={loading}>
            {loading ? '正在检查目录...' : '选择小说项目目录'}
          </button>
        </section>
      ) : (
        <div className="workspace">
          <aside className="project-rail">
            <p className="rail-label">当前作品</p>
            <h1>{project.bookName}</h1>
            <code className="project-path">{project.directory}</code>

            <div className="rail-actions">
              <button type="button" onClick={() => void refreshProject()} disabled={loading}>刷新</button>
              <button className="secondary" type="button" onClick={() => void window.novelDesktop.openDirectory(project.directory)}>
                打开目录
              </button>
            </div>

            <dl className="project-facts">
              <div><dt>角色</dt><dd>{project.roleCount}</dd></div>
              <div><dt>事实</dt><dd>{project.factCount}</dd></div>
              <div><dt>剧情线</dt><dd>{project.plotlineCount}</dd></div>
              <div><dt>伏笔</dt><dd>{project.foreshadowCount}</dd></div>
            </dl>

            {project.warnings.length > 0 && (
              <div className="warning-box">
                <strong>读取提示</strong>
                {project.warnings.slice(0, 5).map(warning => <p key={warning}>{warning}</p>)}
                {project.warnings.length > 5 && <p>另有 {project.warnings.length - 5} 条提示</p>}
              </div>
            )}
          </aside>

          <section className="project-main">
            <div className="page-heading">
              <div>
                <p className="eyebrow">PROJECT OVERVIEW</p>
                <h2>章节总览</h2>
              </div>
              <span>{project.updatedAt === undefined ? '无更新时间' : `更新于 ${new Date(project.updatedAt).toLocaleString('zh-CN')}`}</span>
            </div>

            <section className="metric-grid">
              <article><span>计划章节</span><strong>{project.chapterCount}</strong></article>
              <article><span>已有正文</span><strong>{project.writtenCount}</strong></article>
              <article><span>审稿通过</span><strong>{project.approvedCount}</strong></article>
              <article><span>记录字数</span><strong>{formatNumber(project.totalChars)}</strong></article>
            </section>

            <div className="chapter-table-wrap">
              <table className="chapter-table">
                <thead>
                  <tr><th>章节</th><th>卷</th><th>状态</th><th>字数</th><th>评分</th><th>正文文件</th></tr>
                </thead>
                <tbody>
                  {project.chapters.map(chapter => (
                    <tr className={chapter.fileExists ? 'chapter-row-readable' : ''} key={chapter.no}>
                      <td>
                        <span className="chapter-no">{String(chapter.no).padStart(3, '0')}</span>
                        <div>
                          {chapter.fileExists ? (
                            <button className="chapter-link" type="button" onClick={() => void openChapter(chapter.file)} disabled={chapterLoading}>
                              {chapter.title}
                            </button>
                          ) : <strong>{chapter.title}</strong>}
                          {chapter.summary !== undefined && <small>{chapter.summary}</small>}
                        </div>
                      </td>
                      <td>{chapter.volume > 0 ? chapter.volume : '-'}</td>
                      <td><span className={`status status-${chapter.status}`}>{STATUS_LABELS[chapter.status] ?? chapter.status}</span></td>
                      <td>{chapter.chars === undefined ? '-' : formatNumber(chapter.chars)}</td>
                      <td>{chapter.reviewScore === undefined ? '-' : chapter.reviewScore}</td>
                      <td className={chapter.fileExists ? 'file-ok' : 'file-missing'}>{chapter.file ?? '未生成'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {project.chapters.length === 0 && <div className="no-chapters">项目中还没有章节计划。</div>}
            </div>
          </section>
        </div>
      )}

      {chapter !== undefined && (
        <div className="reader-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setChapter(undefined)
        }}>
          <section className="reader-panel" role="dialog" aria-modal="true" aria-label={chapter.title}>
            <header className="reader-header">
              <div>
                <p className="eyebrow">CHAPTER READER / READ ONLY</p>
                <h2>{chapter.title}</h2>
                <span>{formatNumber(chapter.chars)} 字符 · {formatNumber(chapter.bytes)} 字节 · {new Date(chapter.modifiedAt).toLocaleString('zh-CN')}</span>
              </div>
              <button className="secondary" type="button" onClick={() => setChapter(undefined)}>关闭</button>
            </header>
            <div className="reader-content">
              <MarkdownReader markdown={chapter.markdown} />
            </div>
            <footer className="reader-footer"><code>{chapter.file}</code><span>只读预览，不会修改源文件</span></footer>
          </section>
        </div>
      )}

      <footer>
        <span>{appInfo?.name ?? 'Novel Forge Desktop'}</span>
        <span>{appInfo === undefined ? '' : `v${appInfo.version}`}</span>
        <code>{appInfo?.dataDirectory}</code>
      </footer>
    </main>
  )
}
