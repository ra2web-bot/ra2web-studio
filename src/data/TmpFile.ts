import { TmpImage } from './TmpImage'
import { DataStream } from './DataStream'
import { VirtualFile } from './vfs/VirtualFile'

const TMP_TS_HEADER_SIZE = 16
const MAX_TILE_COUNT = 4096

export class TmpFile {
  public images: Array<TmpImage | null> = []
  public width = 0
  public height = 0
  public blockWidth = 0
  public blockHeight = 0
  public filename = ''

  static fromVirtualFile(file: VirtualFile): TmpFile {
    return new TmpFile(file)
  }

  constructor(file?: VirtualFile) {
    if (file instanceof VirtualFile) {
      this.fromVirtualFile(file)
    }
  }

  get tileCount(): number {
    return this.width * this.height
  }

  get presentTileCount(): number {
    let count = 0
    for (const image of this.images) {
      if (image) count++
    }
    return count
  }

  getMaxImageHeight(): number {
    let maxHeight = 0
    for (const image of this.images) {
      if (!image) continue
      if (image.height > maxHeight) maxHeight = image.height
    }
    return maxHeight
  }

  getTile(tileX: number, tileY: number): TmpImage | undefined {
    if (tileX < 0 || tileY < 0 || tileX >= this.width || tileY >= this.height) return undefined
    const image = this.images[tileY * this.width + tileX]
    return image ?? undefined
  }

  private fromVirtualFile(file: VirtualFile): void {
    this.filename = file.filename
    const stream = file.stream as DataStream
    stream.seek(0)

    if (stream.byteLength < TMP_TS_HEADER_SIZE) {
      throw new Error('TMP header too small')
    }

    this.width = stream.readInt32()
    this.height = stream.readInt32()
    this.blockWidth = stream.readInt32()
    this.blockHeight = stream.readInt32()

    this.validateHeader(stream.byteLength)

    const tileCount = this.tileCount
    const minDataOffset = TMP_TS_HEADER_SIZE + tileCount * 4
    const offsets: number[] = new Array(tileCount)
    for (let i = 0; i < tileCount; i++) {
      offsets[i] = stream.readInt32()
    }

    this.images = new Array(tileCount).fill(null)
    for (let i = 0; i < tileCount; i++) {
      const offset = offsets[i]
      if (offset <= 0) continue
      if (offset < minDataOffset || offset >= stream.byteLength) continue
      if (offset + TmpImage.HEADER_SIZE > stream.byteLength) continue
      try {
        this.images[i] = new TmpImage(stream, offset, this.blockWidth, this.blockHeight)
      } catch {
        this.images[i] = null
      }
    }
  }

  private validateHeader(fileSize: number): void {
    if (!Number.isFinite(this.width) || !Number.isFinite(this.height)) {
      throw new Error('Invalid TMP dimensions')
    }
    if (this.width <= 0 || this.height <= 0) {
      throw new Error('TMP has no tiles')
    }

    const tileCount = this.width * this.height
    if (!Number.isFinite(tileCount) || tileCount <= 0 || tileCount > MAX_TILE_COUNT) {
      throw new Error('TMP tile count out of range')
    }
    if (TMP_TS_HEADER_SIZE + tileCount * 4 > fileSize) {
      throw new Error('TMP index table out of range')
    }

    if (this.blockWidth <= 0 || this.blockHeight <= 0) {
      throw new Error('Invalid TMP block size')
    }
    if ((this.blockWidth !== 48 && this.blockWidth !== 60) || this.blockHeight * 2 !== this.blockWidth) {
      throw new Error(`Unsupported TMP block geometry (${this.blockWidth}x${this.blockHeight})`)
    }
  }
}
