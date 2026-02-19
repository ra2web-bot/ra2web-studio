import JSZip from 'jszip'
import { MixParser } from '../MixParser'
import { AssociationResolver } from './AssociationResolver'
import { ShpExportRenderer } from './ShpExportRenderer'
import type {
  ExportContext,
  RawExportOptions,
  RawExportResult,
  ResolvedSelectedFile,
  ShpGifExportOptions,
  ShpStaticExportOptions,
} from './types'
import {
  bytesToBlob,
  splitSelectedFilePath,
  triggerBrowserDownload,
} from './utils'

export class ExportController {
  static resolveSelection(context: ExportContext): ResolvedSelectedFile {
    return splitSelectedFilePath(context.selectedFile, context.mixFiles)
  }

  static async inspectShp(context: ExportContext) {
    return ShpExportRenderer.inspect(context)
  }

  static async listShpPaletteOptions(context: ExportContext) {
    return ShpExportRenderer.listPaletteOptions(context)
  }

  static async exportRaw(
    context: ExportContext,
    options: RawExportOptions,
  ): Promise<RawExportResult> {
    const selected = this.resolveSelection(context)
    const mainVf = await MixParser.extractFile(selected.mixFile, selected.innerPath)
    if (!mainVf) {
      throw new Error('Cannot read current file, export aborted')
    }

    const mainBytes = mainVf.getBytes()
    const mainBlob = bytesToBlob(mainBytes, 'application/octet-stream')
    if (!options.includeAssociations) {
      triggerBrowserDownload(mainBlob, selected.filename)
      return {
        mainFilePath: selected.selectedFile,
        associationPaths: [],
        mode: 'single',
      }
    }

    const associations = await AssociationResolver.resolve(context, selected)
    if (!associations.length) {
      triggerBrowserDownload(mainBlob, selected.filename)
      return {
        mainFilePath: selected.selectedFile,
        associationPaths: [],
        mode: 'single',
      }
    }

    triggerBrowserDownload(mainBlob, selected.filename)
    const proceed = options.confirmAssociationExport
      ? await options.confirmAssociationExport(associations.length)
      : true
    if (!proceed) {
      return {
        mainFilePath: selected.selectedFile,
        associationPaths: [],
        mode: 'single',
      }
    }

    if (options.associationMode === 'zip') {
      const zip = new JSZip()
      const exportedAssociationPaths: string[] = []
      for (const association of associations) {
        const associatedFile = await this.extractByPath(association.path, context)
        if (!associatedFile) continue
        const associationBytes = associatedFile.getBytes()
        zip.file(association.filename, associationBytes)
        exportedAssociationPaths.push(association.path)
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const stemDot = selected.filename.lastIndexOf('.')
      const stem = stemDot > 0 ? selected.filename.substring(0, stemDot) : selected.filename
      triggerBrowserDownload(zipBlob, `${stem}_associations.zip`)
      return {
        mainFilePath: selected.selectedFile,
        associationPaths: exportedAssociationPaths,
        mode: 'zip',
      }
    }

    const exportedAssociationPaths: string[] = []
    for (const association of associations) {
      const associatedFile = await this.extractByPath(association.path, context)
      if (!associatedFile) continue
      const associationBytes = associatedFile.getBytes()
      const blob = bytesToBlob(associationBytes, 'application/octet-stream')
      triggerBrowserDownload(blob, association.filename)
      exportedAssociationPaths.push(association.path)
    }
    return {
      mainFilePath: selected.selectedFile,
      associationPaths: exportedAssociationPaths,
      mode: 'separate',
    }
  }

  static async exportShpStatic(context: ExportContext, options: ShpStaticExportOptions) {
    const result = await ShpExportRenderer.exportStatic(context, options)
    triggerBrowserDownload(result.blob, result.filename)
    return result
  }

  static async exportShpGif(context: ExportContext, options: ShpGifExportOptions) {
    const result = await ShpExportRenderer.exportGif(context, options)
    triggerBrowserDownload(result.blob, result.filename)
    return result
  }

  private static async extractByPath(path: string, context: ExportContext) {
    const selected = splitSelectedFilePath(path, context.mixFiles)
    return MixParser.extractFile(selected.mixFile, selected.innerPath)
  }
}

