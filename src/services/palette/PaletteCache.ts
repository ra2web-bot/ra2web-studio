import type { Rgb } from './PaletteTypes'

export class PaletteCache {
  private cache = new Map<string, Rgb[]>()

  get(key: string): Rgb[] | null {
    return this.cache.get(key) ?? null
  }

  set(key: string, palette: Rgb[]): void {
    this.cache.set(key, palette)
  }

  clear(): void {
    this.cache.clear()
  }
}

export const sharedPaletteCache = new PaletteCache()
