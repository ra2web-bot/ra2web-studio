import type { PaletteParseResult, Rgb } from './PaletteTypes'

function clamp8(v: number): number {
  if (v < 0) return 0
  if (v > 255) return 255
  return v | 0
}

function parseJascPal(text: string): PaletteParseResult | null {
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length < 4) return null
  if (!lines[0].startsWith('JASC-PAL')) return null
  const count = parseInt(lines[2] || '0', 10)
  if (!Number.isFinite(count) || count <= 0) return null
  const colors: Rgb[] = []
  for (let i = 3; i < lines.length && colors.length < count; i++) {
    const parts = lines[i].split(/\s+/)
    if (parts.length < 3) continue
    const r = parseInt(parts[0], 10)
    const g = parseInt(parts[1], 10)
    const b = parseInt(parts[2], 10)
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) continue
    colors.push({ r: clamp8(r), g: clamp8(g), b: clamp8(b) })
  }
  if (!colors.length) return null
  return {
    colors,
    sourceFormat: 'jasc',
  }
}

function parseBinaryPal(bytes: Uint8Array): PaletteParseResult | null {
  const candidates: Uint8Array[] = []
  if (bytes.length >= 768) {
    candidates.push(bytes.subarray(0, 768))
    candidates.push(bytes.subarray(bytes.length - 768))
  } else if (bytes.length % 3 === 0 && bytes.length >= 3) {
    candidates.push(bytes)
  }

  for (const candidate of candidates) {
    const colors: Rgb[] = []
    let maxComp = 0
    for (let i = 0; i + 2 < candidate.length; i += 3) {
      const r = candidate[i]
      const g = candidate[i + 1]
      const b = candidate[i + 2]
      maxComp = Math.max(maxComp, r, g, b)
      colors.push({ r, g, b })
    }
    if (colors.length < 16) continue
    const useSixBitScale = maxComp <= 63
    if (useSixBitScale) {
      for (const color of colors) {
        color.r = clamp8(color.r * 4)
        color.g = clamp8(color.g * 4)
        color.b = clamp8(color.b * 4)
      }
    }
    return {
      colors,
      sourceFormat: 'binary',
    }
  }
  return null
}

export class PaletteParser {
  static fromText(text: string): PaletteParseResult | null {
    return parseJascPal(text)
  }

  static fromBytes(bytes: Uint8Array): PaletteParseResult | null {
    return parseBinaryPal(bytes)
  }

  static fromUnknownContent(content: { text: string; bytes: Uint8Array }): PaletteParseResult | null {
    return parseJascPal(content.text) ?? parseBinaryPal(content.bytes)
  }

  static buildGrayscalePalette(): Rgb[] {
    const result: Rgb[] = []
    for (let i = 0; i < 256; i++) {
      result.push({ r: i, g: i, b: i })
    }
    return result
  }

  static ensurePalette256(palette: Rgb[]): Rgb[] {
    const result = palette.slice(0, 256)
    while (result.length < 256) {
      result.push({ r: 0, g: 0, b: 0 })
    }
    return result
  }

  static toBytePalette(palette: Rgb[]): Uint8Array {
    const safe = this.ensurePalette256(palette)
    const bytes = new Uint8Array(256 * 3)
    for (let i = 0; i < 256; i++) {
      const c = safe[i]
      bytes[i * 3] = clamp8(c.r)
      bytes[i * 3 + 1] = clamp8(c.g)
      bytes[i * 3 + 2] = clamp8(c.b)
    }
    return bytes
  }
}
