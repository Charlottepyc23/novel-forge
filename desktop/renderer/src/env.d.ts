interface DesktopAppInfo {
  name: string
  version: string
  dataDirectory: string
}

interface DesktopApi {
  getAppInfo(): Promise<DesktopAppInfo>
  chooseProjectDirectory(): Promise<string | undefined>
  openDirectory(path: string): Promise<string>
}

interface Window {
  novelDesktop: DesktopApi
}
