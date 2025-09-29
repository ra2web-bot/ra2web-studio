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
      // 解析XCC global mix database格式
      // 格式：game_count + game_data_blocks...
      // 每个game_data_block：count + entries...
      // 每个entry：name + description

      const map = new Map<number, string>()

      // 读取所有游戏的数据块
      while (s.position < s.byteLength - 4) {
        const count = s.readUint32()
        if (count === 0) break

        for (let i = 0; i < count && s.position < s.byteLength - 4; i++) {
          const name = s.readCString()
          if (!name) break

          const description = s.readCString()
          if (!description) break

          // 使用与XCC相同的哈希算法
          const hash = MixEntry.hashFilename(name) >>> 0
          if (!map.has(hash)) {
            map.set(hash, name)
          }
        }
      }

      console.log('GlobalMixDatabase loaded:', map.size, 'entries')
      return map
    } catch (error) {
      console.error('Failed to parse global mix database:', error)
      return new Map()
    }
  }
}


