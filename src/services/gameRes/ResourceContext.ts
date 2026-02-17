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
  public readonly discoveredPalettePaths: string[]
  public readonly vfs: VirtualFileSystem
  public readonly readiness: ResourceReadiness

  constructor(args: {
    activeModName: string | null
    importedFiles: ImportedResourceFile[]
    archives: ResourceMixFile[]
    standaloneFiles: ResourceStandaloneFile[]
    discoveredPalettePaths: string[]
  }) {
    this.activeModName = args.activeModName
    this.importedFiles = args.importedFiles
    this.archives = [...args.archives].sort((a, b) => b.priority - a.priority)
    this.standaloneFiles = [...args.standaloneFiles].sort((a, b) => b.priority - a.priority)
    this.discoveredPalettePaths = [...args.discoveredPalettePaths]
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

  private static async discoverPalettePaths(archives: ResourceMixFile[]): Promise<string[]> {
    const result = new Set<string>()
    const mixLikeExts = new Set(['mix', 'mmx', 'yro'])
    const sortedArchives = [...archives].sort((a, b) => b.priority - a.priority)

    for (const archive of sortedArchives) {
      const rootPath = archive.info.name

      for (const entry of archive.info.files) {
        if (entry.extension.toLowerCase() !== 'pal') continue
        result.add(`${rootPath}/${entry.filename}`)
      }

      for (const entry of archive.info.files) {
        if (!mixLikeExts.has(entry.extension.toLowerCase())) continue
        const nestedContainerPath = `${rootPath}/${entry.filename}`
        try {
          const nestedVf = await MixParser.extractFile(archive.file, entry.filename)
          if (!nestedVf) continue
          const nestedInfo = await MixParser.parseVirtualFile(nestedVf, entry.filename)
          for (const nestedEntry of nestedInfo.files) {
            if (nestedEntry.extension.toLowerCase() !== 'pal') continue
            result.add(`${nestedContainerPath}/${nestedEntry.filename}`)
          }
        } catch {
          // Ignore unreadable nested MIX while keeping other palettes available.
        }
      }
    }

    return [...result]
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
    const discoveredPalettePaths = await this.discoverPalettePaths(archives)
    return new ResourceContext({
      activeModName,
      importedFiles,
      archives,
      standaloneFiles,
      discoveredPalettePaths,
    })
  }

  toMixFileData(): Array<{ file: File; info: MixFileInfo }> {
    return this.archives.map((a) => ({ file: a.file, info: a.info }))
  }

  async resolveFileFromOverlay(filename: string) {
    return this.vfs.openFile(filename)
  }

  listAllPalettePaths(): string[] {
    return [...this.discoveredPalettePaths]
  }

  resolvePalettePathByName(filename: string): string | null {
    const lower = filename.toLowerCase()
    const nested = this.discoveredPalettePaths.find((path) => {
      const base = path.split('/').pop() ?? path
      return base.toLowerCase() === lower
    })
    if (nested) return nested
    const owner = this.vfs.resolveOwner(filename)
    if (!owner) return null
    return `${owner.name}/${filename}`
  }
}
