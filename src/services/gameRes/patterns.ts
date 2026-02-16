import type { ResourceBucket } from './types'

const PATCH_MIX_RE = /^(ecache|expand|elocal)(md)?(\d{2})\.mix$/i

export function isMixLikeFile(filename: string): boolean {
  const lower = filename.toLowerCase()
  return lower.endsWith('.mix') || lower.endsWith('.mmx') || lower.endsWith('.yro')
}

export function isStandaloneIniLikeFile(filename: string): boolean {
  const lower = filename.toLowerCase()
  return lower.endsWith('.ini') || lower.endsWith('.csf')
}

export function normalizeResourceFilename(filename: string): string {
  return filename.replace(/\\/g, '/').split('/').pop()?.trim() ?? filename.trim()
}

export function getPatchSequence(name: string): number | null {
  const m = name.match(PATCH_MIX_RE)
  if (!m) return null
  return parseInt(m[3], 10)
}

export function getArchivePriority(name: string, bucket: ResourceBucket): number {
  const lower = name.toLowerCase()
  if (bucket === 'mod') {
    const patchSeq = getPatchSequence(lower)
    return 3_000_000 + (patchSeq ?? 0)
  }
  if (bucket === 'patch') {
    const patchSeq = getPatchSequence(lower)
    return 2_000_000 + (patchSeq ?? 0)
  }
  // base
  if (lower === 'ra2.mix') return 1_000_050
  if (lower === 'language.mix') return 1_000_040
  if (lower === 'multi.mix') return 1_000_030
  if (lower === 'cache.mix' || lower === 'cachemd.mix') return 1_000_020
  if (lower === 'local.mix' || lower === 'localmd.mix') return 1_000_010
  return 1_000_000
}
