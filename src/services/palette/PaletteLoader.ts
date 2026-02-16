import type { MixFileInfo } from '../MixParser'
import { MixParser } from '../MixParser'
import { PaletteParser } from './PaletteParser'
import { sharedPaletteCache } from './PaletteCache'
import type { Rgb } from './PaletteTypes'

type MixFileData = { file: File; info: MixFileInfo }

export async function loadPaletteByPath(
  palettePath: string,
  mixFiles: MixFileData[],
): Promise<Rgb[] | null> {
  const cacheKey = palettePath.toLowerCase()
  const cached = sharedPaletteCache.get(cacheKey)
  if (cached) return cached

  const slash = palettePath.indexOf('/')
  if (slash <= 0) return null
  const mixName = palettePath.substring(0, slash)
  const inner = palettePath.substring(slash + 1)
  const mix = mixFiles.find((m) => m.info.name === mixName)
  if (!mix) return null
  const vf = await MixParser.extractFile(mix.file, inner)
  if (!vf) return null

  const parsed = PaletteParser.fromUnknownContent({
    text: vf.readAsString(),
    bytes: vf.getBytes(),
  })
  if (!parsed) return null
  const fixed = PaletteParser.ensurePalette256(parsed.colors)
  sharedPaletteCache.set(cacheKey, fixed)
  return fixed
}
