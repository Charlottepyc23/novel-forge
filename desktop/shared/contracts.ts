export interface DesktopAppInfo {
  name: string
  version: string
  dataDirectory: string
}

export interface DesktopChapterSummary {
  no: number
  volume: number
  title: string
  status: string
  chars?: number
  file?: string
  fileExists: boolean
  reviewScore?: number
  summary?: string
}

export interface DesktopProjectOverview {
  directory: string
  bookName: string
  outlineChars: number
  createdAt?: string
  updatedAt?: string
  chapterCount: number
  writtenCount: number
  approvedCount: number
  totalChars: number
  roleCount: number
  factCount: number
  plotlineCount: number
  foreshadowCount: number
  chapters: DesktopChapterSummary[]
  warnings: string[]
}

export interface DesktopChapterDocument {
  directory: string
  file: string
  title: string
  markdown: string
  chars: number
  bytes: number
  modifiedAt: string
}

export interface DesktopApi {
  getAppInfo(): Promise<DesktopAppInfo>
  chooseProject(): Promise<DesktopProjectOverview | undefined>
  loadProject(directory: string): Promise<DesktopProjectOverview>
  readChapter(directory: string, file: string): Promise<DesktopChapterDocument>
  openDirectory(path: string): Promise<string>
}
