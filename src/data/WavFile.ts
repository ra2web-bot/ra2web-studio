import { WaveFile } from '@ra2web/wavefile'
import type { DataStream } from './DataStream'
import type { VirtualFile } from './vfs/VirtualFile'

type WavSource = VirtualFile | DataStream | Uint8Array

export class WavFile {
  private rawData: Uint8Array
  private decodedData?: Uint8Array

  constructor(source: WavSource) {
    this.rawData = this.toBytes(source)
  }

  getData(): Uint8Array {
    if (!this.decodedData) {
      this.decodedData = this.decodeData(this.rawData)
    }
    return this.decodedData
  }

  isRawImaAdpcm(): boolean {
    const wav = new WaveFile()
    wav.fromBuffer(this.rawData as any)
    return wav.bitDepth === '4'
  }

  private toBytes(source: WavSource): Uint8Array {
    if (source instanceof Uint8Array) return source
    if ('getBytes' in source && typeof source.getBytes === 'function') {
      return source.getBytes()
    }
    const stream = source as DataStream
    return new Uint8Array(stream.buffer, stream.byteOffset, stream.byteLength)
  }

  private decodeData(data: Uint8Array): Uint8Array {
    const wav = new WaveFile()
    wav.fromBuffer(data as any)
    if (wav.bitDepth === '4') {
      wav.fromIMAADPCM()
    }
    return new Uint8Array(wav.toBuffer())
  }
}

