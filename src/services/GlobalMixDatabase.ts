import { DataStream } from '../data/DataStream'
import { MixEntry } from '../data/MixEntry'

/**
 * Loader for XCC's global mix database.dat placed under public/.
 * Tries multiple common filenames and caches the parsed hash->name map in-memory.
 */
export class GlobalMixDatabase {
  private static cache: Map<number, string> | null = null
  private static loadingPromise: Promise<Map<number, string>> | null = null

  static async get(): Promise<Map<number, string>> {
    if (this.cache) return this.cache
    if (this.loadingPromise) return this.loadingPromise

    this.loadingPromise = (async () => {
      try {
        const urls = [
          '/global-mix-database.dat',
          '/global mix database.dat',
        ]
        let arrayBuffer: ArrayBuffer | null = null
        for (const url of urls) {
          try {
            const res = await fetch(url, { cache: 'no-cache' })
            if (res.ok) {
              arrayBuffer = await res.arrayBuffer()
              break
            }
          } catch {}
        }
        if (!arrayBuffer) {
          const empty = new Map<number, string>()
          this.cache = empty
          return empty
        }
        // 防止 dev server 回退 index.html（200 OK）被误解析为数据库。
        if (this.looksLikeHtml(arrayBuffer)) {
          const empty = new Map<number, string>()
          this.cache = empty
          return empty
        }
        const map = this.parse(arrayBuffer)
        this.cache = map
        return map
      } catch {
        const empty = new Map<number, string>()
        this.cache = empty
        return empty
      }
    })()

    try {
      return await this.loadingPromise
    } finally {
      this.loadingPromise = null
    }
  }

  private static parse(buffer: ArrayBuffer): Map<number, string> {
    try {
      const map = new Map<number, string>()
      const listCounts: number[] = []
      const maxLists = 4 // 与 XCC id_log::load 对齐：TD / RA / TS / RA2
      const s = new DataStream(buffer)
      s.seek(0)
      for (let listIndex = 0; listIndex < maxLists; listIndex++) {
        if (s.position + 4 > s.byteLength) {
          throw new Error(`Unexpected EOF before list count (listIndex=${listIndex})`)
        }
        const count = s.readUint32()
        listCounts.push(count)
        for (let i = 0; i < count; i++) {
          if (s.position >= s.byteLength) {
            throw new Error(`Unexpected EOF while reading name (listIndex=${listIndex}, entryIndex=${i})`)
          }
          const name = s.readCString()
          if (s.position > s.byteLength) {
            throw new Error(`Unexpected EOF while reading description (listIndex=${listIndex}, entryIndex=${i})`)
          }
          // XCC 允许 description 为空字符串，不作为终止条件。
          s.readCString()
          if (!name) continue
          const hash = MixEntry.hashFilename(name) >>> 0
          if (!map.has(hash)) map.set(hash, name)
        }
      }
      console.log('GlobalMixDatabase loaded:', map.size, 'entries', 'listCounts:', listCounts)
      return map
    } catch (error) {
      console.error('Failed to parse global mix database:', error)
      return new Map()
    }
  }

  private static looksLikeHtml(buffer: ArrayBuffer): boolean {
    try {
      const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 256))
      const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes).toLowerCase()
      return text.includes('<!doctype html') || text.includes('<html')
    } catch {
      return false
    }
  }
}


