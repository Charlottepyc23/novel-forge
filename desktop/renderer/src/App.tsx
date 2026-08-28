import { useEffect, useState } from 'react'

const BASELINE_VERSION = '1.7.3'

export function App(): JSX.Element {
  const [appInfo, setAppInfo] = useState<DesktopAppInfo>()
  const [projectDirectory, setProjectDirectory] = useState<string>()

  useEffect(() => {
    void window.novelDesktop.getAppInfo().then(setAppInfo)
  }, [])

  const chooseDirectory = async (): Promise<void> => {
    const directory = await window.novelDesktop.chooseProjectDirectory()
    if (directory !== undefined) setProjectDirectory(directory)
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark">文</div>
        <div>
          <strong>DSH Novel Forge</strong>
          <span>桌面开发版</span>
        </div>
        <div className="version">基线 {BASELINE_VERSION}</div>
      </header>

      <section className="hero">
        <p className="eyebrow">DESKTOP MIGRATION WORKSPACE</p>
        <h1>小说工坊已经脱离浏览器插件外壳</h1>
        <p className="lead">
          当前桌面骨架已启用隔离渲染进程和白名单 IPC。下一阶段将接入旧项目读取、书架和章节编辑功能。
        </p>

        <div className="actions">
          <button type="button" onClick={() => void chooseDirectory()}>选择小说目录</button>
          {projectDirectory !== undefined && (
            <button className="secondary" type="button" onClick={() => void window.novelDesktop.openDirectory(projectDirectory)}>
              在资源管理器中打开
            </button>
          )}
        </div>

        {projectDirectory !== undefined && (
          <div className="selected-path">
            <span>当前目录</span>
            <code>{projectDirectory}</code>
          </div>
        )}
      </section>

      <section className="status-grid">
        <article>
          <span className="step">01</span>
          <h2>桌面壳</h2>
          <p>Electron Main、Preload 和 React Renderer 已分离。</p>
          <b className="ready">已就绪</b>
        </article>
        <article>
          <span className="step">02</span>
          <h2>旧项目兼容</h2>
          <p>读取 novel-project.json 与章节 Markdown，保持原数据不变。</p>
          <b>待接入</b>
        </article>
        <article>
          <span className="step">03</span>
          <h2>LLM Provider</h2>
          <p>替换 DSH ctx.llm，支持独立 API 配置与流式生成。</p>
          <b>待接入</b>
        </article>
      </section>

      <footer>
        <span>{appInfo?.name ?? '正在读取应用信息'}</span>
        <span>{appInfo === undefined ? '' : `v${appInfo.version}`}</span>
        <code>{appInfo?.dataDirectory}</code>
      </footer>
    </main>
  )
}
