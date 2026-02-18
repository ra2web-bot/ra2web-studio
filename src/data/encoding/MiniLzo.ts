import { lzo1x, type LzoState } from './Lzo1x'

export class MiniLzo {
  static decompress(input: Uint8Array, outputSize: number): Uint8Array {
    const state: LzoState = {
      inputBuffer: input,
      outputBuffer: null,
    }
    const result = lzo1x.decompress(state, { outputSize })

    if (result !== 0) {
      throw new Error(`MiniLzo decode failed with code ${result}`)
    }
    if (!state.outputBuffer) {
      throw new Error('MiniLzo decode failed: empty output buffer')
    }
    return state.outputBuffer
  }
}

