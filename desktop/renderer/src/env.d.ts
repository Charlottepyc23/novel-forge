import type { DesktopApi } from '../../shared/contracts'

declare global {
  interface Window {
    novelDesktop: DesktopApi
  }
}

export {}
