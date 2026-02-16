import { FileSystemUtil } from './FileSystemUtil'
import { GameResConfig } from './GameResConfig'
import { GameResImporter, type ImportOptions } from './GameResImporter'
import { ResourceContext } from './ResourceContext'
import type { GameResImportProgressEvent, GameResImportResult } from './types'

export class GameResBootstrap {
  static loadConfig() {
    return GameResConfig.load()
  }

  static async loadContext(activeModName: string | null): Promise<ResourceContext> {
    return ResourceContext.load(activeModName)
  }

  static async importGameDirectory(
    dirHandle: any,
    onProgress?: (message: string) => void,
    onProgressEvent?: (event: GameResImportProgressEvent) => void,
  ): Promise<GameResImportResult> {
    const options: ImportOptions = { onProgress, onProgressEvent, modName: null }
    const result = await GameResImporter.importDirectory(dirHandle, 'base', options)
    if (result.imported > 0) {
      GameResConfig.markImported(null)
    }
    return result
  }

  static async importGameArchive(
    archiveFile: File,
    onProgress?: (message: string) => void,
    onProgressEvent?: (event: GameResImportProgressEvent) => void,
  ): Promise<GameResImportResult> {
    const options: ImportOptions = { onProgress, onProgressEvent, modName: null }
    const result = await GameResImporter.importArchive(archiveFile, 'base', options)
    if (result.imported > 0) {
      GameResConfig.markImported(null)
    }
    return result
  }

  static async importPatchFiles(
    files: File[],
    onProgress?: (message: string) => void,
    onProgressEvent?: (event: GameResImportProgressEvent) => void,
  ): Promise<GameResImportResult> {
    return GameResImporter.importFiles(files, 'patch', { onProgress, onProgressEvent, modName: null })
  }

  static async clearAllResources(): Promise<void> {
    await FileSystemUtil.clearWorkspace()
    GameResConfig.save({
      activeModName: null,
      lastImportAt: null,
    })
  }
}
