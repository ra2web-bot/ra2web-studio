import { Format80 } from './Format80'
import { MiniLzo } from './MiniLzo'

export class Format5 {
  static decode(input: Uint8Array, outputSize: number, format: number = 5): Uint8Array {
    const output = new Uint8Array(outputSize)
    this.decodeInto(input, output, format)
    return output
  }

  static decodeInto(input: Uint8Array, output: Uint8Array, format: number = 5): void {
    const outputLength = output.length
    let inputPos = 0
    let outputPos = 0

    while (outputPos < outputLength) {
      const compressedSize = (input[inputPos + 1] << 8) | input[inputPos]
      inputPos += 2

      const decompressedSize = (input[inputPos + 1] << 8) | input[inputPos]
      inputPos += 2

      if (!compressedSize || !decompressedSize) break

      const compressedSlice = input.subarray(inputPos, inputPos + compressedSize)
      const decompressed =
        format === 80
          ? Format80.decode(compressedSlice, decompressedSize)
          : MiniLzo.decompress(compressedSlice, decompressedSize)

      output.set(decompressed.subarray(0, decompressedSize), outputPos)
      inputPos += compressedSize
      outputPos += decompressedSize
    }
  }
}

