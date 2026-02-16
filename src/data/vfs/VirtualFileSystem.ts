import type { MixFileInfo } from '../../services/MixParser'
import { MixParser } from '../../services/MixParser'
import { VirtualFile } from './VirtualFile'

export interface VfsArchive {
  name: string
  file: File
  info: MixFileInfo
  priority: number
}

export interface VfsStandaloneFile {
  filename: string
  file: File
  priority: number
}

export class VirtualFileSystem {
  private archivesByPriority: VfsArchive[] = []
  private standaloneByPriority: VfsStandaloneFile[] = []
  private fileOwnersCache = new Map<string, VfsArchive[]>()

  constructor(archives: VfsArchive[] = [], standaloneFiles: VfsStandaloneFile[] = []) {
    this.resetArchives(archives, standaloneFiles)
  }

  resetArchives(archives: VfsArchive[], standaloneFiles: VfsStandaloneFile[] = []): void {
    this.archivesByPriority = [...archives].sort((a, b) => b.priority - a.priority)
    this.standaloneByPriority = [...standaloneFiles].sort((a, b) => b.priority - a.priority)
    this.fileOwnersCache.clear()
  }

  listArchives(): VfsArchive[] {
    return [...this.archivesByPriority]
  }

  private getOwners(filename: string): VfsArchive[] {
    const key = filename.toLowerCase()
    const cached = this.fileOwnersCache.get(key)
    if (cached) return cached
    const result = this.archivesByPriority.filter((archive) =>
      archive.info.files.some((entry) => entry.filename.toLowerCase() === key),
    )
    this.fileOwnersCache.set(key, result)
    return result
  }

  containsFile(filename: string): boolean {
    if (this.getOwners(filename).length > 0) return true
    const key = filename.toLowerCase()
    return this.standaloneByPriority.some((f) => f.filename.toLowerCase() === key)
  }

  resolveOwner(filename: string): VfsArchive | null {
    const owners = this.getOwners(filename)
    return owners.length ? owners[0] : null
  }

  async openFile(filename: string): Promise<VirtualFile | null> {
    const owners = this.getOwners(filename)
    for (const owner of owners) {
      const vf = await MixParser.extractFile(owner.file, filename)
      if (vf) return vf
    }
    const key = filename.toLowerCase()
    for (const standalone of this.standaloneByPriority) {
      if (standalone.filename.toLowerCase() !== key) continue
      return VirtualFile.fromRealFile(standalone.file)
    }
    return null
  }

  listOverlayFiles(): string[] {
    const all = new Set<string>()
    for (const archive of this.archivesByPriority) {
      for (const entry of archive.info.files) {
        const lower = entry.filename.toLowerCase()
        if (!all.has(lower)) all.add(lower)
      }
    }
    for (const standalone of this.standaloneByPriority) {
      const lower = standalone.filename.toLowerCase()
      if (!all.has(lower)) all.add(lower)
    }
    return [...all].sort((a, b) => a.localeCompare(b))
  }
}
