import { VirtualFileSystem, type VfsArchive } from '../../data/vfs/VirtualFileSystem'
import type { MixFileInfo } from '../MixParser'
import { MixParser } from '../MixParser'
import { FileSystemUtil } from './FileSystemUtil'
import { GameResConfig } from './GameResConfig'
import { getArchivePriority, isMixLikeFile, isStandaloneIniLikeFile } from './patterns'
import type { ImportedResourceFile, ResourceBucket, ResourceReadiness } from './types'

export interface ResourceMixFile {
  bucket: ResourceBucket
  priority: number
  modName?: string
  file: File
  info: MixFileInfo
}

export interface ResourceStandaloneFile {
  bucket: ResourceBucket
  priority: number
  modName?: string
  filename: string
  file: File
}

export class ResourceContext {
  public readonly activeModName: string | null
  public readonly importedFiles: ImportedResourceFile[]
  public readonly archives: ResourceMixFile[]
  public readonly standaloneFiles: ResourceStandaloneFile[]
  public readonly vfs: VirtualFileSystem
  public readonly readiness: ResourceReadiness

  constructor(args: {
    activeModName: string | null
    importedFiles: ImportedResourceFile[]
    archives: ResourceMixFile[]
    standaloneFiles: ResourceStandaloneFile[]
  }) {
    this.activeModName = args.activeModName
    this.importedFiles = args.importedFiles
    this.archives = [...args.archives].sort((a, b) => b.priority - a.priority)
    this.standaloneFiles = [...args.standaloneFiles].sort((a, b) => b.priority - a.priority)
    this.readiness = GameResConfig.checkReadiness(this.importedFiles)

    const vfsArchives: VfsArchive[] = this.archives.map((item) => ({
      name: item.info.name,
      file: item.file,
      info: item.info,
      priority: item.priority,
    }))
    this.vfs = new VirtualFileSystem(
      vfsArchives,
      this.standaloneFiles.map((item) => ({
        filename: item.filename,
        file: item.file,
        priority: item.priority,
      })),
    )
  }

  static async load(activeModName: string | null): Promise<ResourceContext> {
    const importedFiles = await FileSystemUtil.listAllImportedFiles(activeModName)
    const archives: ResourceMixFile[] = []
    const standaloneFiles: ResourceStandaloneFile[] = []
    for (const item of importedFiles) {
      const file = await FileSystemUtil.readImportedFile(item.bucket, item.name, item.modName ?? null)
      if (isMixLikeFile(item.name)) {
        let info: MixFileInfo
        try {
          info = await MixParser.parseFile(file)
        } catch (e: any) {
          continue
        }
        archives.push({
          bucket: item.bucket,
          priority: getArchivePriority(item.name, item.bucket),
          modName: item.modName,
          file,
          info,
        })
      } else if (isStandaloneIniLikeFile(item.name)) {
        standaloneFiles.push({
          bucket: item.bucket,
          priority: getArchivePriority(item.name, item.bucket),
          modName: item.modName,
          filename: item.name,
          file,
        })
      }
    }
    return new ResourceContext({
      activeModName,
      importedFiles,
      archives,
      standaloneFiles,
    })
  }

  toMixFileData(): Array<{ file: File; info: MixFileInfo }> {
    return this.archives.map((a) => ({ file: a.file, info: a.info }))
  }

  async resolveFileFromOverlay(filename: string) {
    return this.vfs.openFile(filename)
  }

  resolvePalettePathByName(filename: string): string | null {
    const owner = this.vfs.resolveOwner(filename)
    if (!owner) return null
    return `${owner.name}/${filename}`
  }
}
