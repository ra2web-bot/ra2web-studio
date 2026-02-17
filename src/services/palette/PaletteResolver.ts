import type { MixFileInfo } from '../MixParser'
import type { ResourceContext } from '../gameRes/ResourceContext'
import type { PaletteSelectionInfo } from './PaletteTypes'

type MixFileData = { file: File; info: MixFileInfo }

export type PaletteAssetKind = 'shp' | 'vxl' | 'pcx' | 'tmp'

export interface ResolvePaletteRequest {
  assetPath: string
  assetKind: PaletteAssetKind
  mixFiles: MixFileData[]
  resourceContext?: ResourceContext | null
  manualPalettePath?: string | null
  hasEmbeddedPalette?: boolean
}

export interface ResolvePaletteDecision {
  selection: PaletteSelectionInfo
  resolvedPalettePath: string | null
  candidateNames: string[]
  availablePalettePaths: string[]
}

const THEATER_SUFFIX_MAP: Record<string, string> = {
  tem: 'tem',
  urb: 'urb',
  ubn: 'ubn',
  des: 'des',
  lun: 'lun',
  sno: 'sno',
  new: 'urb',
}

function getInnerFilename(assetPath: string): string {
  const slash = assetPath.indexOf('/')
  if (slash <= 0) return assetPath
  return assetPath.substring(slash + 1)
}

function inferTheaterSuffix(innerFilename: string): string {
  const lower = innerFilename.toLowerCase()
  const ext = lower.split('.').pop() ?? ''
  if (ext in THEATER_SUFFIX_MAP) return THEATER_SUFFIX_MAP[ext]
  const compoundSuffix = ['tem', 'sno', 'urb', 'ubn', 'des', 'lun'].find(
    (suffix) => lower.endsWith(`.${suffix}.shp`) || lower.endsWith(`.${suffix}.tmp`),
  )
  if (compoundSuffix) return compoundSuffix
  if (lower.endsWith('.sno.shp')) return 'sno'
  if (lower.endsWith('.des.shp')) return 'des'
  if (lower.endsWith('.lun.shp')) return 'lun'
  return 'tem'
}

function isTmpLikeFilename(lowerFilename: string): boolean {
  return (
    lowerFilename.endsWith('.tmp')
    || lowerFilename.endsWith('.tem')
    || lowerFilename.endsWith('.sno')
    || lowerFilename.endsWith('.urb')
    || lowerFilename.endsWith('.ubn')
    || lowerFilename.endsWith('.des')
    || lowerFilename.endsWith('.lun')
    || lowerFilename.endsWith('.tem.tmp')
    || lowerFilename.endsWith('.sno.tmp')
    || lowerFilename.endsWith('.urb.tmp')
    || lowerFilename.endsWith('.ubn.tmp')
    || lowerFilename.endsWith('.des.tmp')
    || lowerFilename.endsWith('.lun.tmp')
  )
}

function getCandidateNames(assetKind: PaletteAssetKind, innerFilename: string): string[] {
  const lower = innerFilename.toLowerCase()
  const suffix = inferTheaterSuffix(innerFilename)
  const result: string[] = []

  if (lower.includes('icon') || lower.includes('cameo')) {
    result.push('cameo.pal')
  }

  if (assetKind === 'tmp') {
    result.push(`iso${suffix}.pal`)
    result.push(`unit${suffix}.pal`)
  } else if (assetKind === 'shp') {
    result.push(`unit${suffix}.pal`)
    if (isTmpLikeFilename(lower)) {
      result.push(`iso${suffix}.pal`)
    }
  } else if (assetKind === 'vxl') {
    result.push(`unit${suffix}.pal`)
  } else {
    // pcx
    result.push('cameo.pal')
    result.push(`unit${suffix}.pal`)
  }

  result.push('unittem.pal')
  result.push('isotem.pal')
  return [...new Set(result.map((s) => s.toLowerCase()))]
}

function buildPaletteNameIndexFromPaths(paths: string[]): Map<string, string[]> {
  const index = new Map<string, string[]>()
  for (const path of paths) {
    const base = path.split('/').pop() ?? path
    const key = base.toLowerCase()
    const arr = index.get(key)
    if (arr) {
      arr.push(path)
    } else {
      index.set(key, [path])
    }
  }
  return index
}

export class PaletteResolver {
  static listPalettePaths(mixFiles: MixFileData[]): string[] {
    const paths: string[] = []
    for (const mix of mixFiles) {
      for (const file of mix.info.files) {
        if (file.extension.toLowerCase() === 'pal') {
          paths.push(`${mix.info.name}/${file.filename}`)
        }
      }
    }
    return paths
  }

  static resolve(request: ResolvePaletteRequest): ResolvePaletteDecision {
    const availablePalettePaths = request.resourceContext?.listAllPalettePaths() ?? this.listPalettePaths(request.mixFiles)
    const innerFilename = getInnerFilename(request.assetPath)
    const candidates = getCandidateNames(request.assetKind, innerFilename)

    if (request.manualPalettePath) {
      return {
        selection: {
          source: 'manual',
          reason: '用户手动指定调色板',
          resolvedPath: request.manualPalettePath,
        },
        resolvedPalettePath: request.manualPalettePath,
        candidateNames: candidates,
        availablePalettePaths,
      }
    }

    if (request.hasEmbeddedPalette) {
      return {
        selection: {
          source: 'embedded',
          reason: '素材内嵌调色板',
          resolvedPath: null,
        },
        resolvedPalettePath: null,
        candidateNames: candidates,
        availablePalettePaths,
      }
    }

    const nameIndex = buildPaletteNameIndexFromPaths(availablePalettePaths)
    for (const candidate of candidates) {
      const overlayPath = request.resourceContext?.resolvePalettePathByName(candidate) ?? null
      if (overlayPath) {
        return {
          selection: {
            source: 'rule',
            reason: `规则命中 ${candidate}（覆盖层优先）`,
            resolvedPath: overlayPath,
          },
          resolvedPalettePath: overlayPath,
          candidateNames: candidates,
          availablePalettePaths,
        }
      }
      const list = nameIndex.get(candidate)
      if (list && list.length > 0) {
        return {
          selection: {
            source: 'rule',
            reason: `规则命中 ${candidate}`,
            resolvedPath: list[0],
          },
          resolvedPalettePath: list[0],
          candidateNames: candidates,
          availablePalettePaths,
        }
      }
    }

    return {
      selection: {
        source: 'fallback-grayscale',
        reason: '未找到可用 PAL，回退灰度',
        resolvedPath: null,
      },
      resolvedPalettePath: null,
      candidateNames: candidates,
      availablePalettePaths,
    }
  }
}
