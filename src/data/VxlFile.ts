import { DataStream } from './DataStream'
import { VirtualFile } from './vfs/VirtualFile'
import { VxlHeader } from './vxl/VxlHeader'
import { Section, readSectionHeader, readSectionTailer, readSectionBodySpans } from './vxl/Section'

export class VxlFile {
  public filename?: string
  public sections: Section[] = []
  public voxelCount: number = 0

  constructor(vf?: VirtualFile) {
    if (vf instanceof VirtualFile) this.fromVirtualFile(vf)
  }

  fromVirtualFile(vf: VirtualFile): void {
    this.filename = vf.filename
    const s: DataStream = vf.stream
    this.sections = []
    this.voxelCount = 0
    if (s.byteLength < VxlHeader.size) return
    const header = new VxlHeader()
    header.read(s)
    if (!header.headerCount || !header.tailerCount || header.tailerCount !== header.headerCount) return

    for (let i = 0; i < header.headerCount; i++) {
      const section = new Section()
      readSectionHeader(section, s)
      if (this.sections.find(v => v.name === section.name)) {
        console.warn(`Duplicate section name "${section.name}" in ${this.filename}`)
      }
      this.sections.push(section)
    }

    const bodyStart = s.position
    s.seek(s.position + header.bodySize)
    const tailers = [] as ReturnType<typeof readSectionTailer>[]
    for (let i = 0; i < header.tailerCount; i++) tailers[i] = readSectionTailer(this.sections[i], s)

    let total = 0
    for (let i = 0; i < header.headerCount; i++) {
      s.seek(bodyStart)
      total += readSectionBodySpans(this.sections[i], tailers[i], s)
    }
    this.voxelCount = total
  }
}


