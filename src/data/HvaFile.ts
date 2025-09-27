import { Matrix4 } from 'three'
import { VirtualFile } from './vfs/VirtualFile'
import { DataStream } from './DataStream'

export class HvaSection {
  public name: string = ''
  public matrices: Matrix4[] = []
  getMatrix(i: number): Matrix4 { return this.matrices[i] }
}

export class HvaFile {
  public filename?: string
  public sections: HvaSection[] = []

  constructor(source: VirtualFile | DataStream) {
    if (source instanceof VirtualFile) this.fromVirtualFile(source)
    else this.parse(source as DataStream, (source as any).filename || 'unknown.hva')
  }

  private fromVirtualFile(vf: VirtualFile): void {
    this.filename = vf.filename
    this.parse(vf.stream as DataStream, vf.filename)
  }

  private parse(stream: DataStream, filename: string): void {
    this.filename = filename
    this.sections = []
    stream.readCString(16) // header id
    const numFrames = stream.readInt32()
    const numSections = stream.readInt32()
    for (let i = 0; i < numSections; i++) {
      const sec = new HvaSection()
      sec.name = stream.readCString(16)
      sec.matrices = new Array(numFrames)
      this.sections.push(sec)
    }
    for (let f = 0; f < numFrames; f++) {
      for (let s = 0; s < numSections; s++) {
        this.sections[s].matrices[f] = this.readMatrix(stream)
      }
    }
  }

  private readMatrix(stream: DataStream): Matrix4 {
    const arr: number[] = []
    for (let i = 0; i < 3; i++) {
      arr.push(stream.readFloat32(), stream.readFloat32(), stream.readFloat32(), stream.readFloat32())
    }
    arr.push(0, 0, 0, 1)
    return new Matrix4().fromArray(arr).transpose()
  }
}


