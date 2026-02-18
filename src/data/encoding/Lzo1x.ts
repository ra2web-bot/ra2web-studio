type ByteArray = Uint8Array<ArrayBufferLike>

export type LzoState = {
  inputBuffer: ByteArray
  outputBuffer: ByteArray | null
}

type LzoConfig = {
  outputSize?: number
  blockSize?: number
}

class Lzo1xImpl {
  private readonly OK = 0
  private readonly EOF_FOUND = -999

  private blockSize = 128 * 1024
  private minNewSize = this.blockSize
  private out: ByteArray = new Uint8Array(256 * 1024)

  private cbl = 0
  private ipEnd = 0
  private t = 0
  private ip = 0
  private op = 0
  private mPos = 0
  private ret = 0
  private skipToFirstLiteral = false

  private returnNewBuffers = true
  private buf: ByteArray = new Uint8Array(0)
  private state: LzoState = { inputBuffer: new Uint8Array(0), outputBuffer: null }

  setBlockSize(blockSize: number): boolean {
    if (typeof blockSize === 'number' && !Number.isNaN(blockSize) && Math.trunc(blockSize) > 0) {
      this.blockSize = Math.trunc(blockSize)
      return true
    }
    return false
  }

  setOutputSize(outputSize: number): boolean {
    if (typeof outputSize === 'number' && !Number.isNaN(outputSize) && Math.trunc(outputSize) > 0) {
      this.out = new Uint8Array(Math.trunc(outputSize))
      return true
    }
    return false
  }

  setReturnNewBuffers(enabled: boolean): void {
    this.returnNewBuffers = !!enabled
  }

  applyConfig(cfg?: LzoConfig): void {
    if (!cfg) return
    if (cfg.outputSize !== undefined) {
      this.setOutputSize(cfg.outputSize)
    }
    if (cfg.blockSize !== undefined) {
      this.setBlockSize(cfg.blockSize)
    }
  }

  private extendBuffer(): void {
    const newSize = this.minNewSize + (this.blockSize - (this.minNewSize % this.blockSize))
    const newBuffer = new Uint8Array(newSize)
    newBuffer.set(this.out)
    this.out = newBuffer
    this.cbl = this.out.length
  }

  private matchNext(): void {
    this.minNewSize = this.op + 3
    if (this.minNewSize > this.cbl) this.extendBuffer()

    this.out[this.op++] = this.buf[this.ip++]
    if (this.t > 1) {
      this.out[this.op++] = this.buf[this.ip++]
      if (this.t > 2) {
        this.out[this.op++] = this.buf[this.ip++]
      }
    }
    this.t = this.buf[this.ip++]
  }

  private matchDone(): number {
    this.t = this.buf[this.ip - 2] & 3
    return this.t
  }

  private copyMatch(): void {
    this.t += 2
    this.minNewSize = this.op + this.t
    if (this.minNewSize > this.cbl) this.extendBuffer()
    do {
      this.out[this.op++] = this.out[this.mPos++]
    } while (--this.t > 0)
  }

  private copyFromBuf(): void {
    this.minNewSize = this.op + this.t
    if (this.minNewSize > this.cbl) this.extendBuffer()
    do {
      this.out[this.op++] = this.buf[this.ip++]
    } while (--this.t > 0)
  }

  private match(): number {
    for (;;) {
      if (this.t >= 64) {
        this.mPos = (this.op - 1) - ((this.t >> 2) & 7) - (this.buf[this.ip++] << 3)
        this.t = (this.t >> 5) - 1
        this.copyMatch()
      } else if (this.t >= 32) {
        this.t &= 31
        if (this.t === 0) {
          while (this.buf[this.ip] === 0) {
            this.t += 255
            this.ip++
          }
          this.t += 31 + this.buf[this.ip++]
        }
        this.mPos = (this.op - 1) - (this.buf[this.ip] >> 2) - (this.buf[this.ip + 1] << 6)
        this.ip += 2
        this.copyMatch()
      } else if (this.t >= 16) {
        this.mPos = this.op - ((this.t & 8) << 11)
        this.t &= 7
        if (this.t === 0) {
          while (this.buf[this.ip] === 0) {
            this.t += 255
            this.ip++
          }
          this.t += 7 + this.buf[this.ip++]
        }
        this.mPos -= (this.buf[this.ip] >> 2) + (this.buf[this.ip + 1] << 6)
        this.ip += 2

        if (this.mPos === this.op) {
          this.state.outputBuffer = this.returnNewBuffers
            ? new Uint8Array(this.out.subarray(0, this.op))
            : this.out.subarray(0, this.op)
          return this.EOF_FOUND
        }

        this.mPos -= 0x4000
        this.copyMatch()
      } else {
        this.mPos = (this.op - 1) - (this.t >> 2) - (this.buf[this.ip++] << 2)
        this.minNewSize = this.op + 2
        if (this.minNewSize > this.cbl) this.extendBuffer()
        this.out[this.op++] = this.out[this.mPos++]
        this.out[this.op++] = this.out[this.mPos]
      }

      if (this.matchDone() === 0) {
        return this.OK
      }
      this.matchNext()
    }
  }

  decompress(state: LzoState, cfg?: LzoConfig): number {
    this.applyConfig(cfg)

    this.state = state
    this.buf = this.state.inputBuffer
    this.cbl = this.out.length
    this.ipEnd = this.buf.length
    this.t = 0
    this.ip = 0
    this.op = 0
    this.mPos = 0
    this.skipToFirstLiteral = false

    if (this.ipEnd === 0) {
      this.state.outputBuffer = new Uint8Array(0)
      return this.OK
    }

    if (this.buf[this.ip] > 17) {
      this.t = this.buf[this.ip++] - 17
      if (this.t < 4) {
        this.matchNext()
        this.ret = this.match()
        if (this.ret !== this.OK) {
          return this.ret === this.EOF_FOUND ? this.OK : this.ret
        }
      } else {
        this.copyFromBuf()
        this.skipToFirstLiteral = true
      }
    }

    for (;;) {
      if (!this.skipToFirstLiteral) {
        this.t = this.buf[this.ip++]
        if (this.t >= 16) {
          this.ret = this.match()
          if (this.ret !== this.OK) {
            return this.ret === this.EOF_FOUND ? this.OK : this.ret
          }
          continue
        } else if (this.t === 0) {
          while (this.buf[this.ip] === 0) {
            this.t += 255
            this.ip++
          }
          this.t += 15 + this.buf[this.ip++]
        }
        this.t += 3
        this.copyFromBuf()
      } else {
        this.skipToFirstLiteral = false
      }

      this.t = this.buf[this.ip++]
      if (this.t < 16) {
        this.mPos = this.op - (1 + 0x0800)
        this.mPos -= this.t >> 2
        this.mPos -= this.buf[this.ip++] << 2
        this.minNewSize = this.op + 3
        if (this.minNewSize > this.cbl) this.extendBuffer()
        this.out[this.op++] = this.out[this.mPos++]
        this.out[this.op++] = this.out[this.mPos++]
        this.out[this.op++] = this.out[this.mPos]

        if (this.matchDone() !== 0) {
          this.matchNext()
        } else {
          continue
        }
      }

      this.ret = this.match()
      if (this.ret !== this.OK) {
        return this.ret === this.EOF_FOUND ? this.OK : this.ret
      }
    }
  }
}

const singleton = new Lzo1xImpl()

export const lzo1x = {
  setBlockSize(blockSize: number): boolean {
    return singleton.setBlockSize(blockSize)
  },
  setOutputEstimate(outputSize: number): boolean {
    return singleton.setOutputSize(outputSize)
  },
  setReturnNewBuffers(enabled: boolean): void {
    singleton.setReturnNewBuffers(enabled)
  },
  decompress(state: LzoState, cfg?: LzoConfig): number {
    return singleton.decompress(state, cfg)
  },
}

