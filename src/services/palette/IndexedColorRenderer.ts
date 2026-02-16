import type { Rgb } from './PaletteTypes'

export class IndexedColorRenderer {
  static indexedToRgba(
    indexData: Uint8Array,
    width: number,
    height: number,
    palette: Rgb[],
    transparentIndex: number = 0,
  ): Uint8ClampedArray {
    const rgba = new Uint8ClampedArray(width * height * 4)
    for (let i = 0, p = 0; i < indexData.length && p < rgba.length; i++, p += 4) {
      const idx = indexData[i] | 0
      const color = palette[idx] ?? { r: 0, g: 0, b: 0 }
      rgba[p] = color.r
      rgba[p + 1] = color.g
      rgba[p + 2] = color.b
      rgba[p + 3] = idx === transparentIndex ? 0 : 255
    }
    return rgba
  }
}
