import { FFmpeg } from '@ffmpeg/ffmpeg'

export class BikTranscoder {
  private static ffmpeg: FFmpeg | null = null
  private static loadingPromise: Promise<FFmpeg> | null = null
  private static queue: Promise<void> = Promise.resolve()
  private static inflightByKey = new Map<string, Promise<Uint8Array>>()

  static async warmup(): Promise<void> {
    await this.getOrCreateFfmpeg()
  }

  static async transcodeToWebm(cacheKey: string, inputName: string, bytes: Uint8Array): Promise<Uint8Array> {
    this.assertBikHeader(bytes)
    const existing = this.inflightByKey.get(cacheKey)
    if (existing) {
      const deduped = await existing
      return this.cloneBytes(deduped)
    }

    const task = this.runExclusive(async (ffmpeg) => {
      const token = `${Date.now()}_${Math.random().toString(16).slice(2, 10)}`
      const baseName = this.sanitizeBaseName(inputName)
      const inName = `${baseName}_${token}.bik`
      const outName = `${baseName}_${token}.webm`
      await ffmpeg.writeFile(inName, bytes)
      try {
        await ffmpeg.exec([
          '-i',
          inName,
          '-vcodec',
          'libvpx',
          '-crf',
          '10',
          '-b:v',
          '2M',
          '-an',
          outName,
        ])
        const result = await ffmpeg.readFile(outName)
        if (result instanceof Uint8Array) {
          return this.cloneBytes(result)
        }
        throw new Error('FFmpeg 输出类型异常：期望 Uint8Array')
      } finally {
        await ffmpeg.deleteFile(inName).catch(() => {})
        await ffmpeg.deleteFile(outName).catch(() => {})
      }
    })
    this.inflightByKey.set(cacheKey, task)
    try {
      const done = await task
      return this.cloneBytes(done)
    } finally {
      this.inflightByKey.delete(cacheKey)
    }
  }

  private static async runExclusive<T>(task: (ffmpeg: FFmpeg) => Promise<T>): Promise<T> {
    const previous = this.queue
    let release!: () => void
    this.queue = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    try {
      const ffmpeg = await this.getOrCreateFfmpeg()
      return await task(ffmpeg)
    } finally {
      release()
    }
  }

  private static async getOrCreateFfmpeg(): Promise<FFmpeg> {
    if (this.ffmpeg) return this.ffmpeg
    if (this.loadingPromise) return this.loadingPromise
    this.loadingPromise = (async () => {
      const ffmpeg = new FFmpeg()
      try {
        await ffmpeg.load()
      } catch (error: any) {
        const message = error?.message || 'unknown error'
        throw new Error(`FFmpeg 初始化失败：${message}`)
      }
      this.ffmpeg = ffmpeg
      return ffmpeg
    })()
    try {
      return await this.loadingPromise
    } finally {
      this.loadingPromise = null
    }
  }

  private static assertBikHeader(bytes: Uint8Array): void {
    if (bytes.byteLength < 4) {
      throw new Error('BIK 文件大小异常：文件头不足 4 字节')
    }
    if (bytes[0] === 0x42 && bytes[1] === 0x49 && bytes[2] === 0x4b && bytes[3] === 0x69) {
      return
    }
    const hex = Array.from(bytes.slice(0, 4))
      .map((v) => v.toString(16).toUpperCase().padStart(2, '0'))
      .join(' ')
    throw new Error(`文件头不是有效的 BIKi（实际: ${hex}）`)
  }

  private static sanitizeBaseName(inputName: string): string {
    const noExt = inputName.replace(/\.[^.]*$/, '')
    const safe = noExt.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
    return safe || 'bik'
  }

  private static cloneBytes(bytes: Uint8Array): Uint8Array {
    const copied = new Uint8Array(bytes.byteLength)
    copied.set(bytes)
    return copied
  }
}

