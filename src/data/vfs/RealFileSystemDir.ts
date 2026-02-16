import { VirtualFile } from './VirtualFile'

export class RealFileSystemDir {
  private handle: any
  public caseSensitive: boolean

  constructor(handle: any, caseSensitive: boolean = false) {
    this.handle = handle
    this.caseSensitive = caseSensitive
  }

  getNativeHandle(): any {
    return this.handle
  }

  get name(): string {
    return this.handle?.name ?? ''
  }

  async listEntries(): Promise<string[]> {
    const result: string[] = []
    for await (const [entryName] of this.handle.entries()) {
      result.push(entryName)
    }
    return result
  }

  async containsEntry(entryName: string): Promise<boolean> {
    const resolved = await this.resolveEntryName(entryName)
    return !!resolved
  }

  async resolveEntryName(entryName: string): Promise<string | undefined> {
    if (this.caseSensitive) {
      try {
        await this.handle.getFileHandle(entryName)
        return entryName
      } catch {
        try {
          await this.handle.getDirectoryHandle(entryName)
          return entryName
        } catch {
          return undefined
        }
      }
    }

    const target = entryName.toLowerCase()
    for await (const [name] of this.handle.entries()) {
      if (name.toLowerCase() === target) return name
    }
    return undefined
  }

  async getRawFile(filename: string): Promise<File> {
    const resolved = (await this.resolveEntryName(filename)) ?? filename
    const fileHandle = await this.handle.getFileHandle(resolved)
    return fileHandle.getFile()
  }

  async openFile(filename: string): Promise<VirtualFile> {
    const raw = await this.getRawFile(filename)
    return VirtualFile.fromRealFile(raw)
  }

  async getDirectory(name: string): Promise<RealFileSystemDir> {
    const resolved = (await this.resolveEntryName(name)) ?? name
    const dirHandle = await this.handle.getDirectoryHandle(resolved)
    return new RealFileSystemDir(dirHandle, this.caseSensitive)
  }

  async getOrCreateDirectory(name: string): Promise<RealFileSystemDir> {
    const dirHandle = await this.handle.getDirectoryHandle(name, { create: true })
    return new RealFileSystemDir(dirHandle, this.caseSensitive)
  }
}
