import { DataStream } from '../data/DataStream'
import { MixEntry } from '../data/MixEntry'

/**
 * Loader for XCC's global mix database.dat placed under public/.
 * Tries multiple common filenames and caches the parsed hash->name map in-memory.
 */
export class GlobalMixDatabase {
  private static cache: Map<number, string> | null = null
  private static tried = false

  static async get(): Promise<Map<number, string>> {
    if (this.cache) return this.cache
    if (this.tried) return new Map()
    this.tried = true
    try {
      const urls = [
        '/global-mix-database.dat',
      ]
      let arrayBuffer: ArrayBuffer | null = null
      for (const url of urls) {
        try {
          const res = await fetch(url, { cache: 'no-cache' })
          if (res.ok) { arrayBuffer = await res.arrayBuffer(); break }
        } catch {}
      }
      if (!arrayBuffer) return new Map()
      const map = this.parse(arrayBuffer)
      this.cache = map
      return map
    } catch {
      return new Map()
    }
  }

  private static parse(buffer: ArrayBuffer): Map<number, string> {
    const s = new DataStream(buffer)
    s.seek(0)
    try {
      const id = s.readString(32)
      if (!id.startsWith('XCC by Olaf van der Spek')) return new Map()
      s.readInt32() // size
      const type = s.readInt32()
      const version = s.readInt32()
      if (version !== 0 || type !== 0) return new Map()
      s.readInt32() // game
      const count = s.readInt32()
      const map = new Map<number, string>()
      for (let i = 0; i < count; i++) {
        const name = s.readCString()
        if (!name) continue
        const hash = MixEntry.hashFilename(name) >>> 0
        if (!map.has(hash)) map.set(hash, name)
      }
      return map
    } catch {
      return new Map()
    }
  }
}


