import { RealFileSystemDir } from './RealFileSystemDir'
import { VirtualFile } from './VirtualFile'

export class RealFileSystem {
  private directories: RealFileSystemDir[] = []
  private rootDir: RealFileSystemDir | null = null

  addRootDirectoryHandle(handle: any): RealFileSystemDir {
    const dir = new RealFileSystemDir(handle)
    this.rootDir = dir
    this.directories.push(dir)
    return dir
  }

  addDirectoryHandle(handle: any): RealFileSystemDir {
    const dir = new RealFileSystemDir(handle)
    this.directories.push(dir)
    return dir
  }

  addDirectory(dir: RealFileSystemDir): void {
    if (!this.directories.includes(dir)) {
      this.directories.push(dir)
    }
  }

  getRootDirectory(): RealFileSystemDir | null {
    return this.rootDir
  }

  async getEntries(): Promise<string[]> {
    const all: string[] = []
    for (const dir of this.directories) {
      const entries = await dir.listEntries()
      all.push(...entries)
    }
    return all
  }

  async containsEntry(name: string): Promise<boolean> {
    for (const dir of this.directories) {
      if (await dir.containsEntry(name)) return true
    }
    return false
  }

  async openFile(filename: string): Promise<VirtualFile> {
    for (const dir of this.directories) {
      try {
        return await dir.openFile(filename)
      } catch {
        // keep searching other directories
      }
    }
    throw new Error(`File "${filename}" not found in RealFileSystem`)
  }
}
