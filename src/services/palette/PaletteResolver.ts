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
  assetWidth?: number | null
  assetHeight?: number | null
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

type XccPaletteRule = {
  assetKind: PaletteAssetKind
  palette: string
  filenamePattern?: string
  width?: number
  height?: number
}

type CompiledXccPaletteRule = XccPaletteRule & {
  filenamePatternRegex?: RegExp
}

function wildcardToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  const regex = `^${escaped.replace(/\*/g, '.*').replace(/\?/g, '.')}$`
  return new RegExp(regex, 'i')
}

function getPatternSpecificity(pattern?: string): number {
  if (!pattern) return 0
  let literalCount = 0
  let wildcardCount = 0
  for (const ch of pattern) {
    if (ch === '*' || ch === '?') wildcardCount++
    else literalCount++
  }
  // Higher literal density means a more specific match.
  return literalCount * 4 - wildcardCount * 3
}

const RAW_XCC_PALETTE_RULES: XccPaletteRule[] = [
  // TD
  { assetKind: 'shp', palette: 'desert.pal', filenamePattern: '*.des' },
  { assetKind: 'shp', palette: 'temperat.pal', filenamePattern: '*.tem' },
  { assetKind: 'shp', palette: 'winter.pal', filenamePattern: '*.win' },
  { assetKind: 'shp', palette: 'cameo.pal', filenamePattern: '*ico.shp' },
  { assetKind: 'shp', palette: 'cameo.pal', filenamePattern: '*icon.shp' },
  // TS
  { assetKind: 'shp', palette: 'cameo.pal', filenamePattern: '*icon*', width: 64, height: 48 },
  { assetKind: 'shp', palette: 'dropship.pal', filenamePattern: 'drop000?*' },
  { assetKind: 'tmp', palette: 'isosno.pal', filenamePattern: '*.sno', width: 48, height: 24 },
  { assetKind: 'tmp', palette: 'isotem.pal', filenamePattern: '*.tem', width: 48, height: 24 },
  { assetKind: 'shp', palette: 'unitsno.pal', filenamePattern: '*.sno' },
  { assetKind: 'shp', palette: 'unittem.pal' },
  { assetKind: 'shp', palette: 'unittem.pal', filenamePattern: '*.tem' },
  { assetKind: 'shp', palette: 'mousepal.pal', filenamePattern: 'mouse*', width: 55, height: 43 },
  // RA2
  { assetKind: 'shp', palette: 'cameo.pal', filenamePattern: '*icon*', width: 60, height: 48 },
  { assetKind: 'tmp', palette: 'isosno.pal', filenamePattern: '*.sno', width: 60, height: 30 },
  { assetKind: 'tmp', palette: 'isotem.pal', filenamePattern: '*.tem', width: 60, height: 30 },
  { assetKind: 'tmp', palette: 'isourb.pal', filenamePattern: '*.urb', width: 60, height: 30 },
  { assetKind: 'shp', palette: 'unitsno.pal', filenamePattern: '*.sno' },
  { assetKind: 'shp', palette: 'unittem.pal' },
  { assetKind: 'shp', palette: 'unittem.pal', filenamePattern: '*.tem' },
  { assetKind: 'shp', palette: 'uniturb.pal', filenamePattern: '*.urb' },
  { assetKind: 'shp', palette: 'spldbr.pal', filenamePattern: 'spldbr*' },
  { assetKind: 'shp', palette: 'dialog.pal', filenamePattern: 'pudlgbgn*' },
  { assetKind: 'shp', palette: 'gls.pal', filenamePattern: 'gls?.*' },
  { assetKind: 'shp', palette: 'grfxtxt.pal', filenamePattern: 'grfxtxt*' },
  { assetKind: 'shp', palette: 'ldscrna.pal', filenamePattern: 'ls??0a??*', width: 640, height: 400 },
  { assetKind: 'shp', palette: 'ldscrna.pal', filenamePattern: 'ls??0a??*', width: 800, height: 520 },
  { assetKind: 'shp', palette: 'ldscrna.pal', filenamePattern: 'ls??0b??*' },
  { assetKind: 'shp', palette: 'ldscrns.pal', filenamePattern: 'ls??0s??*', width: 640, height: 400 },
  { assetKind: 'shp', palette: 'ldscrns.pal', filenamePattern: 'ls??0s??*', width: 800, height: 520 },
  { assetKind: 'shp', palette: 'mousepal.pal', filenamePattern: 'mouse*', width: 55, height: 43 },
  { assetKind: 'shp', palette: 'mpls.pal', filenamePattern: 'ls??0*', width: 640, height: 480 },
  { assetKind: 'shp', palette: 'mpls.pal', filenamePattern: 'ls??0*', width: 800, height: 600 },
  { assetKind: 'shp', palette: 'glsmd.pal', filenamePattern: 'glslmd.*' },
  { assetKind: 'tmp', palette: 'isodes.pal', filenamePattern: '*.des', width: 60, height: 30 },
  { assetKind: 'tmp', palette: 'isolun.pal', filenamePattern: '*.lun', width: 60, height: 30 },
  { assetKind: 'tmp', palette: 'isoubn.pal', filenamePattern: '*.ubn', width: 60, height: 30 },
  { assetKind: 'shp', palette: 'ls800a01.pal', filenamePattern: 'ls800a01*', width: 800, height: 520 },
  { assetKind: 'shp', palette: 'ls800a02.pal', filenamePattern: 'ls800a02*', width: 800, height: 520 },
  { assetKind: 'shp', palette: 'ls800a03.pal', filenamePattern: 'ls800a03*', width: 800, height: 520 },
  { assetKind: 'shp', palette: 'ls800a04.pal', filenamePattern: 'ls800a04*', width: 800, height: 520 },
  { assetKind: 'shp', palette: 'ls800a05.pal', filenamePattern: 'ls800a05*', width: 800, height: 520 },
  { assetKind: 'shp', palette: 'ls800a06.pal', filenamePattern: 'ls800a06*', width: 800, height: 520 },
  { assetKind: 'shp', palette: 'ls800a07.pal', filenamePattern: 'ls800a07*', width: 800, height: 520 },
  { assetKind: 'shp', palette: 'ls800ca.pal', filenamePattern: 'ls800ca*', width: 800, height: 600 },
  { assetKind: 'shp', palette: 'ls800cs.pal', filenamePattern: 'ls800cs*', width: 800, height: 600 },
  { assetKind: 'shp', palette: 'ls800cwa.pal', filenamePattern: 'ls800cwa*', width: 800, height: 600 },
  { assetKind: 'shp', palette: 'ls800cy.pal', filenamePattern: 'ls800cy*', width: 800, height: 600 },
  { assetKind: 'shp', palette: 'ls800s01.pal', filenamePattern: 'ls800s01*', width: 800, height: 520 },
  { assetKind: 'shp', palette: 'ls800s02.pal', filenamePattern: 'ls800s02*', width: 800, height: 520 },
  { assetKind: 'shp', palette: 'ls800s03.pal', filenamePattern: 'ls800s03*', width: 800, height: 520 },
  { assetKind: 'shp', palette: 'ls800s04.pal', filenamePattern: 'ls800s04*', width: 800, height: 520 },
  { assetKind: 'shp', palette: 'ls800s05.pal', filenamePattern: 'ls800s05*', width: 800, height: 520 },
  { assetKind: 'shp', palette: 'ls800s06.pal', filenamePattern: 'ls800s06*', width: 800, height: 520 },
  { assetKind: 'shp', palette: 'ls800s07.pal', filenamePattern: 'ls800s07*', width: 800, height: 520 },
  { assetKind: 'shp', palette: 'mplsc.pal', filenamePattern: 'ls800cuba*', width: 800, height: 600 },
  { assetKind: 'shp', palette: 'mplsf.pal', filenamePattern: 'ls800france*', width: 800, height: 600 },
  { assetKind: 'shp', palette: 'mplsg.pal', filenamePattern: 'ls800germany*', width: 800, height: 600 },
  { assetKind: 'shp', palette: 'mplsi.pal', filenamePattern: 'ls800iraq*', width: 800, height: 600 },
  { assetKind: 'shp', palette: 'mplsk.pal', filenamePattern: 'ls800korea*', width: 800, height: 600 },
  { assetKind: 'shp', palette: 'mplsl.pal', filenamePattern: 'ls800libya*', width: 800, height: 600 },
  { assetKind: 'shp', palette: 'mplsobs.pal', filenamePattern: 'ls800obs*', width: 800, height: 600 },
  { assetKind: 'shp', palette: 'mplsr.pal', filenamePattern: 'ls800russia*', width: 800, height: 600 },
  { assetKind: 'shp', palette: 'mplsu.pal', filenamePattern: 'ls800ustates*', width: 800, height: 600 },
  { assetKind: 'shp', palette: 'mplsuk.pal', filenamePattern: 'ls800ukingdom*', width: 800, height: 600 },
  { assetKind: 'shp', palette: 'mpyls.pal', filenamePattern: 'ls800yuri*', width: 800, height: 600 },
]

const XCC_PALETTE_RULES: CompiledXccPaletteRule[] = RAW_XCC_PALETTE_RULES.map((rule) => ({
  ...rule,
  palette: rule.palette.toLowerCase(),
  filenamePatternRegex: rule.filenamePattern ? wildcardToRegex(rule.filenamePattern.toLowerCase()) : undefined,
}))

function getInnerFilename(assetPath: string): string {
  const slash = assetPath.indexOf('/')
  if (slash <= 0) return assetPath
  return assetPath.substring(slash + 1)
}

function getBaseFilename(pathLike: string): string {
  const slash = pathLike.lastIndexOf('/')
  return slash >= 0 ? pathLike.substring(slash + 1) : pathLike
}

function getFilenameStem(filename: string): string {
  const dot = filename.lastIndexOf('.')
  if (dot <= 0) return filename
  return filename.substring(0, dot)
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

function isShpIcoLikeFilename(pathLike: string): boolean {
  const base = getBaseFilename(pathLike).toLowerCase()
  const dot = base.lastIndexOf('.')
  const stem = dot > 0 ? base.substring(0, dot) : base
  return stem.endsWith('ico') || stem.endsWith('icon')
}

function getCandidateNames(assetKind: PaletteAssetKind, innerFilename: string): string[] {
  const lower = innerFilename.toLowerCase()
  const suffix = inferTheaterSuffix(innerFilename)
  const result: string[] = []

  if (lower.includes('icon') || lower.includes('cameo') || (assetKind === 'shp' && isShpIcoLikeFilename(innerFilename))) {
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

function resolvePalettePathByName(
  candidate: string,
  resourceContext: ResourceContext | null | undefined,
  nameIndex: Map<string, string[]>,
): { path: string; fromOverlay: boolean } | null {
  const overlayPath = resourceContext?.resolvePalettePathByName(candidate) ?? null
  if (overlayPath) return { path: overlayPath, fromOverlay: true }
  const list = nameIndex.get(candidate)
  if (list && list.length > 0) return { path: list[0], fromOverlay: false }
  return null
}

function rankXccRuleCandidates(
  assetKind: PaletteAssetKind,
  baseFilename: string,
  width?: number | null,
  height?: number | null,
): string[] {
  const lowerFilename = baseFilename.toLowerCase()
  const scored = XCC_PALETTE_RULES
    .map((rule, index) => {
      if (rule.assetKind !== assetKind) {
        return {
          index,
          palette: rule.palette,
          score: Number.NEGATIVE_INFINITY,
          patternSpecificity: Number.NEGATIVE_INFINITY,
        }
      }
      if (rule.filenamePatternRegex && !rule.filenamePatternRegex.test(lowerFilename)) {
        return {
          index,
          palette: rule.palette,
          score: Number.NEGATIVE_INFINITY,
          patternSpecificity: Number.NEGATIVE_INFINITY,
        }
      }
      let score = 2 // file type matched
      if (rule.width == null) score += 1
      else if (width === rule.width) score += 2

      if (rule.height == null) score += 1
      else if (height === rule.height) score += 2

      if (!rule.filenamePatternRegex) score += 1
      else score += 2

      return {
        index,
        palette: rule.palette,
        score,
        patternSpecificity: getPatternSpecificity(rule.filenamePattern),
      }
    })
    .filter((item) => Number.isFinite(item.score))
    .sort((a, b) => (b.score - a.score) || (b.patternSpecificity - a.patternSpecificity) || (a.index - b.index))

  const result: string[] = []
  for (const item of scored) {
    if (!result.includes(item.palette)) result.push(item.palette)
  }
  return result
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
    const baseFilename = getBaseFilename(innerFilename)
    const sameNameCandidate = `${getFilenameStem(baseFilename).toLowerCase()}.pal`
    const fallbackCandidates = getCandidateNames(request.assetKind, innerFilename)
    const candidates = [sameNameCandidate, ...fallbackCandidates.filter((candidate) => candidate !== sameNameCandidate)]

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
    const sameNameResolved = resolvePalettePathByName(sameNameCandidate, request.resourceContext, nameIndex)
    if (sameNameResolved) {
      return {
        selection: {
          source: 'rule',
          reason: sameNameResolved.fromOverlay
            ? `规则命中 ${sameNameCandidate}（同名优先，覆盖层优先）`
            : `规则命中 ${sameNameCandidate}（同名优先）`,
          resolvedPath: sameNameResolved.path,
        },
        resolvedPalettePath: sameNameResolved.path,
        candidateNames: candidates,
        availablePalettePaths,
      }
    }
    const xccCandidates = rankXccRuleCandidates(
      request.assetKind,
      baseFilename,
      request.assetWidth,
      request.assetHeight,
    )
    for (const candidate of xccCandidates) {
      const resolved = resolvePalettePathByName(candidate, request.resourceContext, nameIndex)
      if (!resolved) continue
      return {
        selection: {
          source: 'rule',
          reason: resolved.fromOverlay
            ? `规则命中 ${candidate}（XCC规则，覆盖层优先）`
            : `规则命中 ${candidate}（XCC规则）`,
          resolvedPath: resolved.path,
        },
        resolvedPalettePath: resolved.path,
        candidateNames: [...xccCandidates, ...candidates.filter((c) => !xccCandidates.includes(c))],
        availablePalettePaths,
      }
    }
    for (const candidate of candidates) {
      const resolved = resolvePalettePathByName(candidate, request.resourceContext, nameIndex)
      if (resolved) {
        return {
          selection: {
            source: 'rule',
            reason: resolved.fromOverlay
              ? `规则命中 ${candidate}（覆盖层优先）`
              : `规则命中 ${candidate}`,
            resolvedPath: resolved.path,
          },
          resolvedPalettePath: resolved.path,
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
