declare global {
  interface Window {
    electron: {
      minimize: () => void
      maximize: () => void
      close: () => void
      unmaximize: () => void
      selectDirectory: () => Promise<string>
      selectFile: (filters: { name: string; extensions: string[] }[]) => Promise<string>
    }
  }
}

export {}
