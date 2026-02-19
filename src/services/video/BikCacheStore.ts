type CacheSource = 'memory' | 'disk'

export type BikCacheHit = {
  bytes: Uint8Array
  source: CacheSource
}

const WORKSPACE_DIR = 'ra2web-studio-resources'
const VIDEO_CACHE_DIR = 'video-cache'
const MAX_MEMORY_ENTRIES = 12
const MAX_MEMORY_BYTES = 256 * 1024 * 1024

export class BikCacheStore {
  private static memory = new Map<string, Uint8Array>()
  private static memoryBytes = 0

  static async has(cacheKey: string): Promise<boolean> {
    if (this.memory.has(cacheKey)) return true
    const fromDisk = await this.readFromDisk(cacheKey)
    return !!fromDisk
  }

  static async get(cacheKey: string): Promise<BikCacheHit | null> {
    const inMemory = this.memory.get(cacheKey)
    if (inMemory) {
      this.touchMemory(cacheKey, inMemory)
      return { bytes: inMemory, source: 'memory' }
    }

    const fromDisk = await this.readFromDisk(cacheKey)
    if (!fromDisk) return null
    this.putMemory(cacheKey, fromDisk)
    return { bytes: fromDisk, source: 'disk' }
  }

  static async set(cacheKey: string, bytes: Uint8Array): Promise<void> {
    const stableBytes = this.cloneBytes(bytes)
    this.putMemory(cacheKey, stableBytes)
    await this.writeToDisk(cacheKey, stableBytes)
  }

  private static touchMemory(cacheKey: string, bytes: Uint8Array): void {
    this.memory.delete(cacheKey)
    this.memory.set(cacheKey, bytes)
  }

  private static putMemory(cacheKey: string, bytes: Uint8Array): void {
    const existing = this.memory.get(cacheKey)
    if (existing) {
      this.memoryBytes -= existing.byteLength
      this.memory.delete(cacheKey)
    }
    this.memory.set(cacheKey, bytes)
    this.memoryBytes += bytes.byteLength
    this.evictIfNeeded()
  }

  private static evictIfNeeded(): void {
    while (
      this.memory.size > MAX_MEMORY_ENTRIES
      || this.memoryBytes > MAX_MEMORY_BYTES
    ) {
      const oldestKey = this.memory.keys().next().value as string | undefined
      if (!oldestKey) break
      const oldest = this.memory.get(oldestKey)
      this.memory.delete(oldestKey)
      if (oldest) this.memoryBytes -= oldest.byteLength
    }
  }

  private static async readFromDisk(cacheKey: string): Promise<Uint8Array | null> {
    const dir = await this.getCacheDir(false)
    if (!dir) return null
    try {
      const fileHandle = await dir.getFileHandle(this.toFileName(cacheKey))
      const file = await fileHandle.getFile()
      return new Uint8Array(await file.arrayBuffer())
    } catch {
      return null
    }
  }

  private static async writeToDisk(cacheKey: string, bytes: Uint8Array): Promise<void> {
    const dir = await this.getCacheDir(true)
    if (!dir) return
    try {
      const fileHandle = await dir.getFileHandle(this.toFileName(cacheKey), { create: true })
      const writable = await fileHandle.createWritable()
      await writable.write(bytes)
      await writable.close()
    } catch {
      // Ignore OPFS write failures and keep memory cache available.
    }
  }

  private static async getCacheDir(create: boolean): Promise<any | null> {
    const storageAny = navigator.storage as any
    if (!storageAny || typeof storageAny.getDirectory !== 'function') {
      return null
    }
    try {
      const root = await storageAny.getDirectory()
      const workspace = await root.getDirectoryHandle(WORKSPACE_DIR, { create })
      return await workspace.getDirectoryHandle(VIDEO_CACHE_DIR, { create })
    } catch {
      return null
    }
  }

  private static toFileName(cacheKey: string): string {
    return `${cacheKey}.webm`
  }

  private static cloneBytes(bytes: Uint8Array): Uint8Array {
    const copied = new Uint8Array(bytes.byteLength)
    copied.set(bytes)
    return copied
  }
}

