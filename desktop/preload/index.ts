import { contextBridge, ipcRenderer } from 'electron'

const IPC = {
  appInfo: 'app:info',
  chooseProjectDirectory: 'project:choose-directory',
  openDirectory: 'shell:open-directory',
} as const

export interface DesktopAppInfo {
  name: string
  version: string
  dataDirectory: string
}

export interface DesktopApi {
  getAppInfo(): Promise<DesktopAppInfo>
  chooseProjectDirectory(): Promise<string | undefined>
  openDirectory(path: string): Promise<string>
}

const api: DesktopApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC.appInfo),
  chooseProjectDirectory: () => ipcRenderer.invoke(IPC.chooseProjectDirectory),
  openDirectory: (path) => ipcRenderer.invoke(IPC.openDirectory, path),
}

contextBridge.exposeInMainWorld('novelDesktop', api)
