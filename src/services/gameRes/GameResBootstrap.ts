import { FileSystemUtil } from './FileSystemUtil'
import { GameResConfig } from './GameResConfig'
import { GameResImporter, type ImportOptions } from './GameResImporter'
import { ResourceContext, type ResourceLoadProgressEvent } from './ResourceContext'
import type { GameResImportProgressEvent, GameResImportResult } from './types'

export class GameResBootstrap {
  static loadConfig() {
    return GameResConfig.load()
  }

  static async loadContext(
    activeModName: string | null,
    onProgress?: (event: ResourceLoadProgressEvent) => void,
  ): Promise<ResourceContext> {
    return ResourceContext.load(activeModName, onProgress)
  }

  static async reimportBaseFromDirectory(
    dirHandle: any,
    onProgress?: (message: string) => void,
    onProgressEvent?: (event: GameResImportProgressEvent) => void,
  ): Promise<GameResImportResult> {
    await FileSystemUtil.clearBucket('base')
    const options: ImportOptions = { onProgress, onProgressEvent, modName: null }
    const result = await GameResImporter.importDirectory(dirHandle, 'base', options)
    if (result.imported > 0) {
      GameResConfig.markImported(null)
    }
    return result
  }

  static async reimportBaseFromArchives(
    archiveFiles: File[],
    onProgress?: (message: string) => void,
    onProgressEvent?: (event: GameResImportProgressEvent) => void,
  ): Promise<GameResImportResult> {
    const merged: GameResImportResult = {
      imported: 0,
      skipped: 0,
      errors: [],
      importedNames: [],
    }
    if (!archiveFiles.length) return merged

    await FileSystemUtil.clearBucket('base')
    for (const archiveFile of archiveFiles) {
      const options: ImportOptions = { onProgress, onProgressEvent, modName: null }
      const result = await GameResImporter.importArchive(archiveFile, 'base', options)
      merged.imported += result.imported
      merged.skipped += result.skipped
      merged.errors.push(...result.errors)
      merged.importedNames.push(...result.importedNames)
    }
    if (merged.imported > 0) {
      GameResConfig.markImported(null)
    }
    return merged
  }

  static async importPatchFiles(
    files: File[],
    onProgress?: (message: string) => void,
    onProgressEvent?: (event: GameResImportProgressEvent) => void,
  ): Promise<GameResImportResult> {
    return GameResImporter.importFiles(files, 'patch', { onProgress, onProgressEvent, modName: null })
  }

  static async clearNonBaseResources(activeModName: string | null): Promise<void> {
    await FileSystemUtil.clearBucket('patch')
    if (activeModName) {
      await FileSystemUtil.clearBucket('mod', activeModName)
    }
  }
}
