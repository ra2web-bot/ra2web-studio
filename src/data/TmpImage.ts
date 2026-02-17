import type { DataStream } from './DataStream'

export enum TmpImageFlags {
  ExtraData = 1,
  ZData = 2,
  DamagedData = 4,
}

type Rgb = { r: number; g: number; b: number }

function toUnsignedByte(value: number): number {
  return value < 0 ? value + 256 : value
}

function readBytesAt(stream: DataStream, offset: number, length: number): Uint8Array {
  if (length <= 0 || offset < 0 || offset >= stream.byteLength) return new Uint8Array(0)
  const available = Math.max(0, Math.min(length, stream.byteLength - offset))
  if (available <= 0) return new Uint8Array(0)

  const prev = stream.position
  stream.seek(offset)
  const chunk = stream.readUint8Array(available)
  stream.seek(prev)

  if (available === length) return chunk
  const padded = new Uint8Array(length)
  padded.set(chunk)
  return padded
}

export class TmpImage {
  static readonly HEADER_SIZE = 52

  public x = 0
  public y = 0

  public extraOffset = 0
  public zOffset = 0
  public extraZOffset = 0

  public extraX = 0
  public extraY = 0
  public extraWidth = 0
  public extraHeight = 0

  public flags = 0
  public height = 0
  public terrainType = 0
  public rampType = 0

  public radarLeft: Rgb = { r: 0, g: 0, b: 0 }
  public radarRight: Rgb = { r: 0, g: 0, b: 0 }

  public tileData: Uint8Array = new Uint8Array(0)
  public zData: Uint8Array | null = null
  public extraData: Uint8Array | null = null

  public hasExtraData = false
  public hasZData = false
  public hasDamagedData = false

  constructor(stream: DataStream, tileOffset: number, blockWidth: number, blockHeight: number) {
    this.fromStream(stream, tileOffset, blockWidth, blockHeight)
  }

  private fromStream(stream: DataStream, tileOffset: number, blockWidth: number, blockHeight: number): void {
    stream.seek(tileOffset)

    this.x = stream.readInt32()
    this.y = stream.readInt32()
    this.extraOffset = stream.readInt32()
    this.zOffset = stream.readInt32()
    this.extraZOffset = stream.readInt32()
    this.extraX = stream.readInt32()
    this.extraY = stream.readInt32()
    this.extraWidth = stream.readInt32()
    this.extraHeight = stream.readInt32()

    this.flags = stream.readUint32()
    this.height = stream.readUint8()
    this.terrainType = stream.readUint8()
    this.rampType = stream.readUint8()

    this.radarLeft = {
      r: toUnsignedByte(stream.readInt8()),
      g: toUnsignedByte(stream.readInt8()),
      b: toUnsignedByte(stream.readInt8()),
    }
    this.radarRight = {
      r: toUnsignedByte(stream.readInt8()),
      g: toUnsignedByte(stream.readInt8()),
      b: toUnsignedByte(stream.readInt8()),
    }
    stream.seek(stream.position + 3)

    this.hasExtraData = (this.flags & TmpImageFlags.ExtraData) === TmpImageFlags.ExtraData
    this.hasZData = (this.flags & TmpImageFlags.ZData) === TmpImageFlags.ZData
    this.hasDamagedData = (this.flags & TmpImageFlags.DamagedData) === TmpImageFlags.DamagedData

    const mainLength = Math.max(0, (blockWidth * blockHeight) >> 1)
    this.tileData = readBytesAt(stream, tileOffset + TmpImage.HEADER_SIZE, mainLength)

    if (this.hasZData && this.zOffset > 0) {
      this.zData = readBytesAt(stream, tileOffset + this.zOffset, mainLength)
    }

    const extraLength = Math.max(0, this.extraWidth) * Math.max(0, this.extraHeight)
    if (this.hasExtraData && this.extraOffset > 0 && extraLength > 0) {
      this.extraData = readBytesAt(stream, tileOffset + this.extraOffset, extraLength)
    }
  }
}
