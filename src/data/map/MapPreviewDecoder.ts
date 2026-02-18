import { Format5 } from '../encoding/Format5'
import { base64StringToUint8Array } from '../../util/string'

type IniEntry = {
  key: string
  value: string
}

export type MapRect = {
  x: number
  y: number
  width: number
  height: number
}

export type MapStartingLocation = {
  slot: number
  rx: number
  ry: number
}

export type MapPreviewDecodeResult = {
  previewRect: MapRect
  rgbData: Uint8Array
  fullSize: MapRect | null
  localSize: MapRect | null
  startingLocations: MapStartingLocation[]
}

const sectionRegex = /^\s*\[([^\]]+)\]\s*(?:[;#].*)?$/
const fullLineCommentRegex = /^\s*[;#]/

function stripInlineComment(value: string): string {
  let inSingleQuote = false
  let inDoubleQuote = false
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]
    if (ch === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote
      continue
    }
    if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote
      continue
    }
    if (!inSingleQuote && !inDoubleQuote && (ch === ';' || ch === '#')) {
      return value.slice(0, i).trim()
    }
  }
  return value.trim()
}

function parseIniSections(iniText: string): Map<string, IniEntry[]> {
  const sections = new Map<string, IniEntry[]>()
  let currentSection = '__root__'
  sections.set(currentSection, [])

  const lines = iniText.replace(/^\uFEFF/, '').split(/\r?\n/)
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || fullLineCommentRegex.test(line)) continue

    const sectionMatch = line.match(sectionRegex)
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim().toLowerCase()
      if (!sections.has(currentSection)) sections.set(currentSection, [])
      continue
    }

    const equalIndex = line.indexOf('=')
    if (equalIndex <= 0) continue

    const key = line.slice(0, equalIndex).trim()
    const value = stripInlineComment(line.slice(equalIndex + 1))
    if (!key) continue
    sections.get(currentSection)?.push({ key, value })
  }

  return sections
}

function getSectionEntries(sections: Map<string, IniEntry[]>, sectionName: string): IniEntry[] | null {
  return sections.get(sectionName.toLowerCase()) ?? null
}

function getEntryValue(entries: IniEntry[] | null, key: string): string | null {
  if (!entries) return null
  const loweredKey = key.toLowerCase()
  for (const entry of entries) {
    if (entry.key.toLowerCase() === loweredKey) return entry.value
  }
  return null
}

function parseRect(rawValue: string | null): MapRect | null {
  if (!rawValue) return null
  const normalized = rawValue.replace(/,$/, '').replace(/,+/g, ',').trim()
  if (!normalized) return null

  const numbers = normalized
    .split(/\s*,\s*/)
    .slice(0, 4)
    .map((part) => Number(part))

  if (numbers.length < 4 || numbers.some((value) => Number.isNaN(value))) return null

  const [x, y, width, height] = numbers
  if (width <= 0 || height <= 0) return null
  return { x, y, width, height }
}

function parseStartingLocations(entries: IniEntry[] | null): MapStartingLocation[] {
  if (!entries) return []
  const locations: MapStartingLocation[] = []
  for (const entry of entries) {
    const slot = Number.parseInt(entry.key, 10)
    const encoded = Number.parseInt(entry.value, 10)
    if (Number.isNaN(slot) || Number.isNaN(encoded)) continue
    if (slot < 0 || slot > 7) continue

    const ry = Math.floor(encoded / 1000)
    const rx = encoded - ry * 1000
    if (rx < 0 || ry < 0) continue

    locations.push({ slot, rx, ry })
  }
  locations.sort((a, b) => a.slot - b.slot)
  return locations
}

function collectSectionValues(entries: IniEntry[] | null): string {
  if (!entries || entries.length === 0) return ''
  return entries.map((entry) => entry.value.trim()).join('')
}

export class MapPreviewDecoder {
  static decode(iniText: string): MapPreviewDecodeResult | null {
    const sections = parseIniSections(iniText)

    const previewEntries = getSectionEntries(sections, 'preview')
    const previewPackEntries = getSectionEntries(sections, 'previewpack')
    if (!previewEntries || !previewPackEntries) return null

    const previewRect = parseRect(getEntryValue(previewEntries, 'size'))
    if (!previewRect) {
      throw new Error('地图 [Preview] 中的 Size 字段缺失或格式错误')
    }

    const packedBase64 = collectSectionValues(previewPackEntries)
    if (!packedBase64) {
      throw new Error('地图 [PreviewPack] 中未找到可解码的数据')
    }

    const compressedBytes = base64StringToUint8Array(packedBase64)
    const rgbData = new Uint8Array(previewRect.width * previewRect.height * 3)
    try {
      Format5.decodeInto(compressedBytes, rgbData)
    } catch (error: any) {
      throw new Error(`PreviewPack 解码失败: ${error?.message || '未知错误'}`)
    }

    const mapEntries = getSectionEntries(sections, 'map')
    const waypointsEntries = getSectionEntries(sections, 'waypoints')

    return {
      previewRect,
      rgbData,
      fullSize: parseRect(getEntryValue(mapEntries, 'size')),
      localSize: parseRect(getEntryValue(mapEntries, 'localsize')),
      startingLocations: parseStartingLocations(waypointsEntries),
    }
  }
}

export function projectStartingLocationToPreview(
  location: MapStartingLocation,
  fullSize: MapRect | null,
  localSize: MapRect | null,
  previewWidth: number,
  previewHeight: number,
): { x: number; y: number } | null {
  if (!fullSize || !localSize) return null
  if (localSize.width <= 0 || localSize.height <= 0) return null

  const dx = location.rx - location.ry + fullSize.width - 1
  const dy = location.rx + location.ry - fullSize.width - 1

  const scaleX = previewWidth / (2 * localSize.width)
  const scaleY = previewHeight / (2 * localSize.height)

  const x = (dx - 2 * localSize.x) * scaleX
  const y = (dy - 2 * localSize.y) * scaleY

  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}

