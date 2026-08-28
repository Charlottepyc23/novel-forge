import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi } from '../shared/contracts'

const IPC = {
  appInfo: 'app:info',
  chooseProject: 'project:choose',
  loadProject: 'project:load',
  readChapter: 'chapter:read',
  saveChapter: 'chapter:save',
  openDirectory: 'shell:open-directory',
} as const

const api: DesktopApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC.appInfo),
  chooseProject: () => ipcRenderer.invoke(IPC.chooseProject),
  loadProject: (directory) => ipcRenderer.invoke(IPC.loadProject, directory),
  readChapter: (directory, file) => ipcRenderer.invoke(IPC.readChapter, directory, file),
  saveChapter: (request) => ipcRenderer.invoke(IPC.saveChapter, request),
  openDirectory: (path) => ipcRenderer.invoke(IPC.openDirectory, path),
}

contextBridge.exposeInMainWorld('novelDesktop', api)
