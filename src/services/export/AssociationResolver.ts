import { PaletteResolver, type PaletteAssetKind } from '../palette/PaletteResolver'
import type { ExportAssociation, ExportContext, MixFileData, ResolvedSelectedFile } from './types'
import { normalizeFilename, replaceExtension } from './utils'
import { MixFile } from '../../data/MixFile'
import { DataStream } from '../../data/DataStream'
import { VirtualFile } from '../../data/vfs/VirtualFile'

function splitMixPath(path: string): { mixName: string; innerPath: string } | null {
  const slash = path.indexOf('/')
  if (slash <= 0 || slash >= path.length - 1) return null
  return {
    mixName: path.substring(0, slash),
    innerPath: path.substring(slash + 1),
  }
}

function findMixFile(mixFiles: MixFileData[], mixName: string): File | null {
  return mixFiles.find((item) => item.info.name === mixName)?.file ?? null
}

function getFilenameStem(pathLike: string): string {
  const filename = normalizeFilename(pathLike).toLowerCase()
  const dot = filename.lastIndexOf('.')
  return dot <= 0 ? filename : filename.substring(0, dot)
}

async function pathExistsStrictByName(path: string, mixFiles: MixFileData[]): Promise<boolean> {
  const split = splitMixPath(path)
  if (!split) return false
  const rootMix = findMixFile(mixFiles, split.mixName)
  if (!rootMix) return false
  const segments = split.innerPath.split('/').filter(Boolean)
  if (!segments.length) return false

  let currentSource: File | VirtualFile = rootMix
  for (let i = 0; i < segments.length; i++) {
    let mix: MixFile
    try {
      if (currentSource instanceof File) {
        const ab = await currentSource.arrayBuffer()
        mix = new MixFile(new DataStream(ab))
      } else {
        const stream = currentSource.stream as DataStream
        stream.seek(0)
        mix = new MixFile(stream)
      }
    } catch {
      return false
    }

    const seg = segments[i]
    if (!mix.containsFile(seg)) return false
    const vf = mix.openFile(seg)
    if (i === segments.length - 1) return true
    currentSource = vf
  }
  return false
}

export class AssociationResolver {
  static async resolve(
    context: ExportContext,
    selected: ResolvedSelectedFile,
  ): Promise<ExportAssociation[]> {
    const result: ExportAssociation[] = []
    const seen = new Set<string>()
    const add = (association: ExportAssociation | null) => {
      if (!association) return
      const key = association.path.toLowerCase()
      if (seen.has(key)) return
      seen.add(key)
      result.push(association)
    }

    if (selected.extension === 'shp') {
      add(this.resolvePaletteAssociation(context, selected, 'shp'))
    }

    if (selected.extension === 'vxl') {
      add(this.resolvePaletteAssociation(context, selected, 'vxl'))
      add(await this.resolveHvaAssociation(context, selected))
    }

    return result
  }

  private static resolvePaletteAssociation(
    context: ExportContext,
    selected: ResolvedSelectedFile,
    assetKind: PaletteAssetKind,
  ): ExportAssociation | null {
    const decision = PaletteResolver.resolve({
      assetPath: selected.selectedFile,
      assetKind,
      mixFiles: context.mixFiles,
      resourceContext: context.resourceContext,
      manualPalettePath: null,
    })
    if (!decision.resolvedPalettePath) return null
    return {
      kind: 'pal',
      path: decision.resolvedPalettePath,
      filename: normalizeFilename(decision.resolvedPalettePath),
      reason: `调色板关联：${decision.selection.reason}`,
    }
  }

  private static async resolveHvaAssociation(
    context: ExportContext,
    selected: ResolvedSelectedFile,
  ): Promise<ExportAssociation | null> {
    const autoPath = replaceExtension(selected.selectedFile, 'hva')
    const autoPathStrictExists = await pathExistsStrictByName(autoPath, context.mixFiles)
    if (autoPathStrictExists) {
      return {
        kind: 'hva',
        path: autoPath,
        filename: normalizeFilename(autoPath),
        reason: '同名 HVA 自动匹配',
      }
    }

    const targetStem = getFilenameStem(selected.innerPath)
    const candidates: string[] = []
    for (const mix of context.mixFiles) {
      for (const entry of mix.info.files) {
        if ((entry.extension || '').toLowerCase() !== 'hva') continue
        if (getFilenameStem(entry.filename) !== targetStem) continue
        candidates.push(`${mix.info.name}/${entry.filename}`)
      }
    }
    for (const candidate of candidates) {
      const candidateStrictExists = await pathExistsStrictByName(candidate, context.mixFiles)
      if (candidateStrictExists) {
        return {
          kind: 'hva',
          path: candidate,
          filename: normalizeFilename(candidate),
          reason: '同 stem HVA 匹配',
        }
      }
    }
    return null
  }
}

