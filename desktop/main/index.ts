import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { readNovelChapter, readNovelProject } from './project-reader'

const IPC = {
  appInfo: 'app:info',
  chooseProject: 'project:choose',
  loadProject: 'project:load',
  readChapter: 'chapter:read',
  openDirectory: 'shell:open-directory',
} as const

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#101512',
    title: 'DSH Novel Forge Desktop',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  window.once('ready-to-show', () => window.show())

  if (process.env.ELECTRON_RENDERER_URL !== undefined) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle(IPC.appInfo, () => ({
  name: app.getName(),
  version: app.getVersion(),
  dataDirectory: app.getPath('userData'),
}))

ipcMain.handle(IPC.chooseProject, async () => {
  const result = await dialog.showOpenDialog({
    title: '选择小说项目目录',
    properties: ['openDirectory'],
  })
  return result.canceled ? undefined : readNovelProject(result.filePaths[0]!)
})

ipcMain.handle(IPC.loadProject, (_event, directory: unknown) => {
  if (typeof directory !== 'string') throw new Error('项目目录无效')
  return readNovelProject(directory)
})

ipcMain.handle(IPC.readChapter, (_event, directory: unknown, file: unknown) => {
  if (typeof directory !== 'string' || typeof file !== 'string') throw new Error('章节读取参数无效')
  return readNovelChapter(directory, file)
})

ipcMain.handle(IPC.openDirectory, async (_event, path: unknown) => {
  if (typeof path !== 'string' || path.trim() === '') return '目录无效'
  return shell.openPath(path)
})

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
